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
// Usiamo Gemini 2.5 Pro per via dei limiti API stringenti del 3.1
const MODEL_NAME = "gemini-3-flash-preview"; 

// Configurazioni percorsi
const BASE_INPUT_DIR = path.resolve('./scraper_cassazione/massimario_chunks');
const CATEGORIES = ["civile", "penale"];
const OUTPUT_DIR = path.resolve('./massimario_vip');

const SYSTEM_PROMPT = `Ruolo: Sei un illustre Magistrato dell'Ufficio del Massimario della Corte di Cassazione, un severo Commissario del Concorso in Magistratura e un Data Engineer.
Il tuo compito è analizzare la Relazione del Massimario (o una sua specifica sezione logica) fornita in input e redigere un "Dossier d'Autore" ad altissimo contenuto scientifico per un database RAG destinato a candidati avanzati del concorso in magistratura.

VINCOLI FORMALI (Strict RAG-Friendly):
- Le Relazioni del Massimario non sono sentenze, ma trattazioni dottrinali. Non c'è un "fatto storico" da narrare.
- Usa una prosa accademica italiana fluida ma asciutta e moderna. VIETATO lo stile barocco o ridondante.
- Usa elenchi puntati e il grassetto chirurgico sui concetti chiave per massimizzare la leggibilità e la densità semantica.
- Non inventare nulla: attieniti al testo. Se un elemento manca (es. non ci sono sentenze citate), scrivi "Non presente in questa sezione".

STRUTTURA RIGOROSA (Markdown):

# [Titolo della Relazione] - [Titolo Sezione]

## 1. Inquadramento Sistematico
Sintetizza in massimo 3 righe il tema generale affrontato in questa sezione. Qual è l'istituto giuridico principale o la problematica in esame?

## 2. Il Contrasto Giurisprudenziale (o l'Evoluzione Storica)
Spiega analiticamente il dubbio ermeneutico o l'evoluzione della giurisprudenza sul punto. Quali orientamenti si contrappongono o si sono succeduti nel tempo? (Tesi A vs Tesi B).

## 3. La Soluzione del Massimario (Principio Guida)
Qual è l'orientamento preferibile, cristallizzato o caldeggiato secondo il Magistrato redattore? Enuncialo in modo netto, isolato e in grassetto.

## 4. Ratio Decidendi e Fondamenti Normativi
Ricostruisci l'iter logico-giuridico che supporta la soluzione. Spiega PERCHÉ è preferibile quell'orientamento (riferimenti normativi, principi costituzionali, superamento di vecchi orientamenti).

## 5. Riferimenti Giurisprudenziali Chiave
Elenca le sentenze fondamentali citate nel testo (es. "Cass. S.U. n. 1234/2020"). Se non ce ne sono, scrivi "Non presenti".

## 6. Spendibilità Concorsuale ("Matite Blu" e Consigli)
Fornisci 2-3 consigli pratici a elenchi puntati. In quali tracce (civile/penale/amministrativo) può essere usato questo argomento? Quali sono gli errori dogmatici e i "tranelli logici" in cui i candidati cadono?

## 7. Tags per RAG
Genera 5 parole chiave precedute dall'hashtag (es. #PrescrizioneTributaria, #ContrastoGiurisprudenziale, #NovitaNormativa) per facilitare l'indicizzazione nel vector database.`;

async function generateVIP(chunkData) {
    const prompt = `Analizza la seguente sezione di una Relazione del Massimario:\n\nMETADATI:\nDocumento Originale: ${chunkData.source}\nSezione: ${chunkData.section}\n\nTESTO DELLA SEZIONE:\n${chunkData.content.substring(0, 35000)}`;
    
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

// Funzione per ripulire il nome file per Windows (inclusi newline e a capo)
function sanitizeFilename(name) {
    return name.replace(/[\\/*?:"<>|\n\r]/g, "_").substring(0, 100);
}

async function main() {
    console.log(`💎 Avvio Generazione Schede VIP Massimario (Modello: ${MODEL_NAME})...`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    for (const category of CATEGORIES) {
        const inputDir = path.join(BASE_INPUT_DIR, category);
        const outCategoryDir = path.join(OUTPUT_DIR, category);

        if (!fs.existsSync(inputDir)) continue;
        fs.mkdirSync(outCategoryDir, { recursive: true });

        console.log(`\n📂 Processamento categoria: ${category}`);

        const files = fs.readdirSync(inputDir).filter(f => f.endsWith('_chunks.json'));
        
        for (const file of files) {
            const chunksPath = path.join(inputDir, file);
            let chunks = [];
            try {
                chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
            } catch (e) {
                console.error(`Errore parsing ${file}`);
                continue;
            }

            console.log(`\n📄 Elaborazione ${file} (${chunks.length} sezioni trovate)...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                // Saltiamo i chunk troppo corti che prob. non hanno contenuto utile (abbassato a 150 per non perdere pillole utili)
                if (chunk.content.length < 150) {
                    console.log(`   - Salto sezione "${chunk.section.substring(0,30)}" (troppo corta)`);
                    continue;
                }

                const safeSection = sanitizeFilename(chunk.section);
                const outputFileName = `${file.replace('_chunks.json', '')} - ${safeSection}.md`;
                const outputFilePath = path.join(outCategoryDir, outputFileName);

                if (fs.existsSync(outputFilePath)) {
                    console.log(`   - ${outputFileName} già presente, salto.`);
                    continue;
                }

                console.log(`   - Generazione VIP per sezione: ${chunk.section.substring(0, 50)}...`);
                try {
                    const vipMarkdown = await generateVIP(chunk);
                    fs.writeFileSync(outputFilePath, vipMarkdown, 'utf8');
                    console.log(`     ✅ OK!`);

                    // Delay per rate limit
                    await new Promise(r => setTimeout(r, 2000));

                } catch (e) {
                    console.error(`     ❌ Errore su ${outputFileName}:`, e.message);
                    if (e.message.includes("429") || e.message.includes("quota")) {
                        console.log("⏳ Quota raggiunta, attesa 30s...");
                        await new Promise(r => setTimeout(r, 30000));
                        // Retry una volta
                        i--; 
                    }
                }
            }
        }
    }
    console.log(`\n✨ ELABORAZIONE MASSIMARIO COMPLETATA! ✨`);
}

main().catch(console.error);
