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

const TEST_FILES = [
    {
        txt: "./scraper_cassazione/sentenze_ssuu_civile_clean/2021/snciv2021U15911S.txt",
        meta: "./scraper_cassazione/sentenze_ssuu_civile/2021/snciv2021U15911S_meta.json"
    },
    {
        txt: "./scraper_cassazione/sentenze_ssuu_civile_clean/2021/snciv2021U16080S.txt",
        meta: "./scraper_cassazione/sentenze_ssuu_civile/2021/snciv2021U16080S_meta.json"
    },
    {
        txt: "./scraper_cassazione/sentenze_ssuu_civile_clean/2021/snciv2021U16084S.txt",
        meta: "./scraper_cassazione/sentenze_ssuu_civile/2021/snciv2021U16084S_meta.json"
    }
];

const SYSTEM_PROMPT = `Sei un illustre Consigliere della Suprema Corte di Cassazione e un severo Commissario del Concorso in Magistratura. 
Il tuo compito è analizzare la sentenza delle Sezioni Unite fornita in input e redigere un "Dossier d'Autore" (Scheda VIP) ad altissimo contenuto scientifico, destinato a candidati di livello avanzato.

Il testo NON deve essere un riassunto giornalistico, ma un'analisi dogmatica e pratica utile per la stesura di un tema concorsuale.

Devi rispettare RIGOROSAMENTE la seguente struttura in Markdown:

# [Estremi della Sentenza]

## 1. Il Contrasto Giurisprudenziale e la Questione Rimessa
Spiega analiticamente qual è il dubbio ermeneutico che ha reso necessario l'intervento delle Sezioni Unite. Esponi con chiarezza la tesi minoritaria e la tesi maggioritaria preesistenti.

## 2. Il Principio di Diritto (Massima)
Enuncia in modo netto e isolato la regula iuris definitiva cristallizzata dalla Corte.

## 3. Ratio Decidendi (Il nucleo vincolante)
Ricostruisci l'iter logico-giuridico seguito dalla Corte per arrivare alla decisione. Spiega PERCHÉ è stata preferita una tesi rispetto all'altra.

## 4. Obiter Dicta (Spunti Sistematici)
Estrai e valorizza i passaggi non strettamente necessari per decidere il caso, ma fondamentali per inquadrare il sistema. Inserisci le digressioni preziose o gli ammonimenti.

## 5. Spendibilità Concorsuale (I consigli del Commissario)
Fornisci al candidato 2-3 "pro-tips" pratici su come usare questa sentenza in un tema.

VINCOLI FORMALI:
- Redigi l'elaborato in prosa accademica italiana fluida e densa. 
- Evita elenchi puntati banali; privilegia il ragionamento discorsivo.
- Non inventare nulla.`;

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
    console.log("🧪 Avvio Test 3 Sentenze VIP...");
    
    for (const file of TEST_FILES) {
        console.log(`\n📄 Processamento: ${path.basename(file.txt)}`);
        const text = fs.readFileSync(file.txt, 'utf8');
        const meta = JSON.parse(fs.readFileSync(file.meta, 'utf8'));

        try {
            const result = await generateVIP(text, meta);
            const outPath = `./sentenze_ssuu_vip/TEST_${path.basename(file.txt, '.txt')}.md`;
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, result, 'utf8');
            console.log(`✅ Scheda generata: ${outPath}`);
        } catch (e) {
            console.error(`❌ Errore: ${e.message}`);
        }
    }
}

runTest();
