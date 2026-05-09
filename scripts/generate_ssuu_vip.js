import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Caricamento .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview"; // Modello ottimale per analisi giuridica complessa

// Configurazioni percorsi
const BASE_INPUT_DIR = path.resolve('./scraper_cassazione');
const CATEGORIES = ["sentenze_ssuu_civile", "sentenze_ssuu_penale"];
const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip');

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

async function generateVIP(text, meta) {
    const prompt = `Analizza la seguente sentenza:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO:\n${text.substring(0, 30000)}`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Errore API");
    return result.candidates[0].content.parts[0].text;
}

async function main() {
    console.log(`💎 Avvio Generazione Schede VIP (Modello: ${MODEL_NAME})...`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    for (const category of CATEGORIES) {
        const cleanDir = path.join(BASE_INPUT_DIR, `${category}_clean`);
        const metaBaseDir = path.join(BASE_INPUT_DIR, category);

        if (!fs.existsSync(cleanDir)) continue;

        console.log(`\n📂 Processamento categoria: ${category}`);

        // Scansione ricorsiva (per anni)
        const processFiles = async (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await processFiles(fullPath);
                } else if (entry.name.endsWith('S.txt')) { // Elabora SOLO le Sentenze (S), ignora Ordinanze (O) e Interlocutorie (I)
                    const relPath = path.relative(cleanDir, fullPath);
                    const metaPath = path.join(metaBaseDir, relPath.replace('.txt', '_meta.json'));
                    const outputFilePath = path.join(OUTPUT_DIR, relPath.replace('.txt', '.md'));

                    if (fs.existsSync(outputFilePath)) {
                        console.log(`   - ${entry.name} già presente, salto.`);
                        continue;
                    }

                    console.log(`   - Generazione VIP per: ${entry.name}...`);
                    try {
                        const text = fs.readFileSync(fullPath, 'utf8');
                        let meta = {};
                        if (fs.existsSync(metaPath)) {
                            meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        }

                        // Chiamata all'IA (sequenziale con await)
                        const vipMarkdown = await generateVIP(text, meta);
                        
                        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
                        fs.writeFileSync(outputFilePath, vipMarkdown, 'utf8');
                        console.log(`     ✅ OK!`);

                        // Piccolo delay per sicurezza rate-limit
                        await new Promise(r => setTimeout(r, 1000));

                    } catch (e) {
                        console.error(`     ❌ Errore su ${entry.name}:`, e.message);
                        // Se c'è un errore di quota, aspettiamo un po' di più
                        if (e.message.includes("429") || e.message.includes("quota")) {
                            console.log("⏳ Quota raggiunta, attesa 30s...");
                            await new Promise(r => setTimeout(r, 30000));
                        }
                    }
                }
            }
        };

        await processFiles(cleanDir);
    }
}

main().catch(console.error);
