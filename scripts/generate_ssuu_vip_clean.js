import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caricamento .env
const envPath = path.join(__dirname, '..', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview"; // Modello ottimale per analisi giuridica complessa

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configurazioni percorsi
const INPUT_DIRS = [
    path.resolve('./sentenze_ssuu_vip_clean'),
    path.resolve('./scraper_cassazione/sentenze_ssuu_civile_clean'),
    path.resolve('./scraper_cassazione/sentenze_ssuu_penale_clean')
];
const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip_schede');

const SYSTEM_PROMPT = `Ruolo: Sei un illustre Consigliere della Suprema Corte di Cassazione, un severo Commissario del Concorso in Magistratura e un Data Engineer.
Il tuo compito è analizzare la sentenza fornita in input e redigere un "Dossier d'Autore" (Scheda VIP) ad altissimo contenuto scientifico per un database RAG destinato a candidati avanzati.

VINCOLI FORMALI (Strict RAG-Friendly):
- Usa una prosa accademica italiana fluida ma asciutta e moderna. VIETATO lo stile barocco o ridondante.
- Usa elenchi puntati e il grassetto chirurgico sui concetti chiave per massimizzare la leggibilità e la densità semantica.
- Non inventare nulla: attieniti al testo. Se un elemento manca, scrivi "Non presente".

STRUTTURA RIGOROSA (Markdown):

# [Estremi della Sentenza]

## 1. Il Fatto Storico e il Merito Sostanziale
Sintetizza in massimo 3 righe la vicenda concreta (es. debito tributario, fondo patrimoniale). Spiega come la Corte ha risolto la questione di diritto sostanziale sottesa alla lite, indipendentemente dalla questione di legittimità rimessa alle SS.UU.

## 2. Il Contrasto Giurisprudenziale (La Questione Rimessa)
Spiega analiticamente il dubbio ermeneutico che ha richiesto l'intervento nomofilattico. Scomponi chiaramente la Tesi Minoritaria e la Tesi Maggioritaria preesistenti.

## 3. Il Principio di Diritto (Massima)
Enuncia in modo netto, isolato e in grassetto la regula iuris definitiva cristallizzata dalla Corte.

## 4. Ratio Decidendi (Il nucleo vincolante)
Ricostruisci l'iter logico-giuridico della Corte. Spiega PERCHÉ è stata preferita una tesi rispetto all'altra (riferimenti normativi, principi costituzionali, superamento di vecchi orientamenti).

## 5. Obiter Dicta (Spunti Sistematici)
Estrai passaggi non strettamente necessari per decidere il caso, ma fondamentali per inquadrare il sistema (digressioni, ammonimenti ai futuri interpreti).

## 6. Spendibilità Concorsuale ("Matite Blu" e Consigli)
Fornisci 2-3 consigli pratici a elenchi puntati. In quali tracce si usa questa sentenza? Quali sono gli errori dogmatici e i "tranelli logici" in cui i candidati cadono interpretando questo orientamento?

## 7. Tags per RAG
Genera 5 parole chiave precedute dall'hashtag (es. #FondoPatrimoniale, #UltrattivitàMandato, #OnereDellaProva) per facilitare l'indicizzazione.`;

async function generateVIP(text, retries = 5) {
    const prompt = `Analizza la seguente sentenza:\n\nTESTO:\n${text.substring(0, 30000)}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ role: "user", parts: [{ text: prompt }] }]
                })
            });

            const result = await response.json();
            
            if (!response.ok) {
                const errMsg = result.error?.message || `HTTP ${response.status}`;
                if (response.status === 429 || errMsg.includes('quota') || errMsg.includes('high demand') || response.status === 503) {
                    throw new Error("RETRY_" + errMsg);
                }
                throw new Error(errMsg);
            }
            
            return result.candidates[0].content.parts[0].text;
            
        } catch (e) {
            if (e.message.startsWith("RETRY_") || e.message.includes('fetch failed')) {
                if (attempt === retries) throw new Error("Massimo tentativi superati: " + e.message);
                
                const waitTime = attempt * 10000; // 10s, 20s, 30s...
                console.log(`     ⏳ API satura/errore di rete. Attendo ${waitTime/1000}s (Tentativo ${attempt}/${retries})...`);
                await new Promise(r => setTimeout(r, waitTime));
            } else {
                throw e;
            }
        }
    }
}

async function main() {
    console.log(`💎 Avvio Generazione Schede VIP (Modello: ${MODEL_NAME})...`);
    console.log(`📂 Inputs: \n  - ${INPUT_DIRS.join('\n  - ')}`);
    console.log(`📂 Output: ${OUTPUT_DIR}\n`);
    
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log("📡 Costruzione indice dei file già processati...");
    const existingFilenames = new Set();
    
    // 1. Aggiungi tutti i file già presenti nella cartella di output (inclusi quelli non ancora su Supabase)
    const loadLocalSchede = (dir) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                loadLocalSchede(path.join(dir, entry.name));
            } else if (entry.name.endsWith('.md')) {
                existingFilenames.add(entry.name);
            }
        }
    };
    loadLocalSchede(OUTPUT_DIR);
    console.log(`✅ Trovati ${existingFilenames.size} file già processati localmente.`);

    // 2. Aggiungi i file dal DB Supabase
    let offset = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'sentenza_ssuu')
            .range(offset, offset + limit - 1);
        if (error) { console.error("Errore fetch DB:", error); break; }
        if (!data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += limit;
        if (data.length < limit) break;
    }
    console.log(`✅ Indice completato: ${existingFilenames.size} file totali noti (saltati).\n`);

    const processFiles = async (dir, baseInputDir) => {
        if (!fs.existsSync(dir)) return;
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await processFiles(fullPath, baseInputDir);
            } else if (entry.name.endsWith('S.md') || entry.name.endsWith('S.txt')) { // Elabora SOLO le Sentenze (S)
                const relPath = path.relative(baseInputDir, fullPath);
                
                // Assicurati che l'estensione finale sia .md anche se l'input era .txt
                const finalFilename = entry.name.replace(/\.txt$/, '.md');
                const relPathMd = path.join(path.dirname(relPath), finalFilename);
                const outputFilePath = path.join(OUTPUT_DIR, relPathMd);

                if (fs.existsSync(outputFilePath) || existingFilenames.has(finalFilename)) {
                    continue;
                }

                console.log(`   - Generazione VIP per: ${entry.name}...`);
                try {
                    const text = fs.readFileSync(fullPath, 'utf8');
                    
                    // Chiamata all'IA
                    const vipMarkdown = await generateVIP(text);
                    
                    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
                    fs.writeFileSync(outputFilePath, vipMarkdown, 'utf8');
                    console.log(`     ✅ OK!`);

                    // Piccolo delay per sicurezza rate-limit
                    await new Promise(r => setTimeout(r, 500));

                } catch (e) {
                    console.error(`     ❌ Errore su ${entry.name}:`, e.message);
                }
            }
        }
    };

    for (const inputDir of INPUT_DIRS) {
        if (!fs.existsSync(inputDir)) {
            console.warn(`⚠️ Cartella di input non trovata (saltata): ${inputDir}`);
            continue;
        }
        await processFiles(inputDir, inputDir);
    }
}

main().catch(console.error);
