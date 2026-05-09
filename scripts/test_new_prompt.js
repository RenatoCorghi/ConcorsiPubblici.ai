import fs from 'fs';
import path from 'path';

// Caricamento .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3.1-flash-lite-preview"; 

const TEST_FILE = {
    txt: "./scraper_cassazione/sentenze_ssuu_civile_clean/2021/snciv2021U15911S.txt",
    meta: "./scraper_cassazione/sentenze_ssuu_civile/2021/snciv2021U15911S_meta.json"
};

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
Fornisci 2-3 consigli pratici a elenchi puntati. In quali tracce si usa questa sentenza? Quali sono gli errori dogmatici e i "tranelli logici" in cui i candidati cadono interpretando questo orientamento?`;

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

async function runTest() {
    console.log(`🧪 Test Nuovo Prompt su ${path.basename(TEST_FILE.txt)}...`);
    
    const text = fs.readFileSync(TEST_FILE.txt, 'utf8');
    const meta = JSON.parse(fs.readFileSync(TEST_FILE.meta, 'utf8'));

    try {
        const result = await generateVIP(text, meta);
        const outPath = `./sentenze_ssuu_vip/TEST_NUOVO_PROMPT_15911.md`;
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, result, 'utf8');
        console.log(`✅ OK! Risultato salvato in: ${outPath}`);
    } catch (e) {
        console.error(`❌ Errore: ${e.message}`);
    }
}

runTest();
