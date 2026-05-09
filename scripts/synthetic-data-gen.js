import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ==========================================
// CONFIGURAZIONE — Legge le chiavi da .env
// ==========================================

// Mini dotenv loader (evita dipendenza esterna)
const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- DA QUI IN POI NON TOCCARE NULLA ---
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ARGOMENTI_DA_GENERARE = [
    { materia: 'Diritto Penale', istituto: 'Il dolo eventuale e la colpa cosciente: confini e giurisprudenza' },
    { materia: 'Diritto Penale', istituto: 'Il reato aberrante (aberratio ictus e aberratio delicti)' },
    { materia: 'Diritto Civile', istituto: 'La nullità di protezione nel codice del consumo' },
    { materia: 'Diritto Amministrativo', istituto: 'Il silenzio assenso e il silenzio inadempimento' }
];

const PROMPT_SISTEMA = `Sei un luminare del Diritto Italiano e Presidente di Commissione al Concorso in Magistratura.
Il tuo compito è scrivere un capitolo di un "Compendio Avanzato" destinato ai candidati.
Il testo deve essere in formato Markdown puro (senza blocchi \`\`\`markdown).

STRUTTURA OBBLIGATORIA DEL DOCUMENTO:
# [Titolo dell'Istituto]
## 1. Inquadramento Dogmatico e Ratio
(Spiega l'istituto, gli articoli di riferimento del Codice e la ratio legis in modo tecnico).
## 2. Elementi Costitutivi
(Scomponi l'istituto nei suoi elementi oggettivi e soggettivi).
## 3. Contrasti Giurisprudenziali (Fondamentale)
(Spiega come la Cassazione a Sezioni Unite o l'Adunanza Plenaria ha risolto i principali nodi critici).
## 4. Affinità e Differenze (Diagnosi differenziale)
(Confronta l'istituto con altre figure simili, es. Dolo Eventuale vs Colpa Cosciente).

Tono: Accademico, implacabile, focalizzato su ciò che fa la differenza per superare un concorso di altissimo livello. 
Lunghezza: Estremamente dettagliato (almeno 800-1000 parole).`;

async function generaSaggio(istituto, materia, tentativi = 3) {
    console.log(`\n🧠 Generazione in corso per: [${materia}] ${istituto}...`);

    // Uso il modello suggerito per il 2026: 3.1 Flash Lite
    const modelName = 'gemini-3.1-flash-lite-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        systemInstruction: {
            parts: [{ text: PROMPT_SISTEMA }]
        },
        contents: [{
            role: "user",
            parts: [{ text: `Scrivi il compendio accademico sull'istituto: "${istituto}" per la materia "${materia}".` }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000,
        }
    };

    for (let i = 0; i < tentativi; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(60000) // 60 secondi di pazienza
            });

            if (!response.ok) {
                const errText = await response.text();
                if (response.status === 404) {
                    console.error(`❌ Modello ${modelName} non trovato. Controlla il nome del modello.`);
                    return null;
                }
                throw new Error(`HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            if (!data.candidates || !data.candidates[0]) {
                throw new Error("Risposta API vuota o bloccata dai filtri di sicurezza.");
            }

            const testoGenerato = data.candidates[0].content.parts[0].text;
            console.log(`✅ Saggio generato! (${testoGenerato.length} caratteri)`);
            return testoGenerato;

        } catch (e) {
            console.warn(`⚠️ Tentativo ${i + 1} fallito: ${e.message}`);
            if (i < tentativi - 1) {
                console.log("Riprovo tra 5 secondi...");
                await new Promise(r => setTimeout(r, 5000));
            } else {
                console.error("❌ Tutti i tentativi falliti.");
                return null;
            }
        }
    }
}

async function salvaInDatabase(materia, istituto, contenuto) {
    console.log(`💾 Salvataggio/Aggiornamento in Supabase di: ${istituto}...`);
    const keywords = [istituto.toLowerCase(), materia.toLowerCase(), "concorso", "magistratura"];
    const { data, error } = await supabase
        .from('dottrina_sintetica')
        .upsert([{ 
            materia: materia, 
            istituto: istituto, 
            contenuto_markdown: contenuto, 
            keywords: keywords, 
            versione_ai: 'gemini-3.1-flash-lite' 
        }], { onConflict: 'istituto' });
    
    if (error) { 
        console.error("❌ Errore Supabase:", error.message); 
    } else { 
        console.log(`✅ Dati aggiornati nel database!`); 
    }
}

async function main() {
    console.log("🚀 AVVIO GENERATORE DI DOTTRINA SINTETICA 🚀");
    for (const item of ARGOMENTI_DA_GENERARE) {
        const markdown = await generaSaggio(item.istituto, item.materia);
        if (markdown) { await salvaInDatabase(item.materia, item.istituto, markdown); }
        await new Promise(r => setTimeout(r, 3000));
    }
    console.log("\n🎉 TUTTE LE GENERAZIONI COMPLETATE!");
}

main();
