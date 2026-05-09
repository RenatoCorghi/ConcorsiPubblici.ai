import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview";

const INPUT_DIR = path.resolve('data/giurisprudena italiana');
const BASE_OUTPUT_DIR = path.resolve('./riviste_vip_schede');

const SYSTEM_PROMPT = `
Sei un giurista e accademico di altissimo livello, Direttore Scientifico e autore di un prestigioso Manuale di Diritto per la preparazione al Concorso in Magistratura.

Ti verrà fornito in input un testo grezzo (spesso frammentato, impaginato a colonne o contenente refusi OCR) estratto da una rivista giuridica di fascia A. Il testo può contenere note a sentenza, massime redazionali o saggi dottrinali.

Il tuo obiettivo è fare reverse-engineering del testo: estrarre la pura "Regula Iuris" (il principio di diritto nomofilattico) e l'evoluzione dogmatica, trasformando il tutto in una "Scheda Manualistica Oggettiva" ad altissima densità informativa, ottimizzata per l'inserimento in un database vettoriale (RAG).

RISPETTA TASSATIVAMENTE I SEGUENTI VINCOLI:

    Data Honesty e Divieto di Trascrizione: È SEVERAMENTE VIETATO citare, trascrivere o parafrasare passaggi letterali. Devi interiorizzare i concetti giuridici e riscriverli COMPLETAMENTE DA ZERO, usando un lessico giuridico rigoroso e uno stile manualistico impersonale.

    Evidenziazione Visiva (IMPORTANTE): Usa generosamente il grassetto per evidenziare le parole chiave, i termini tecnici e i brocardi latini. Usa gli elenchi puntati all'interno dei paragrafi per massimizzare la leggibilità.

    Astrazione dell'Autore: Non riferire mai l'opinione personale dell'autore della nota. Trasforma le critiche in un dibattito dogmatico oggettivo (es. "Una parte della dottrina critica l'orientamento perché...").

    Anonimizzazione: Sostituisci nomi di persone o aziende con termini giuridici astratti (es. "il lavoratore", "la società target", "l'ente locale").

    Gestione del Testo Sporco e Indici: Se il testo contiene solo indici o bibliografie, restituisci ESCLUSIVAMENTE:[NESSUN_CONTENUTO_UTILE].

    Gestione Multi-Argomento: Genera UNA SCHEDA SEPARATA per ogni saggio o sentenza distinta trovata nel testo.

ATTENZIONE - GESTIONE DEI TAGLI DI PAGINA:

    Se le prime pagine del blocco sono la chiusura di un saggio iniziato prima, NON creare una scheda incompleta. Estrai i concetti e segnala che appartengono alla scheda precedente.

    Usa sempre gli estremi esatti della sentenza o il titolo dell'articolo come 'Fonte' nei metadati.

    Se trovi più commenti sulla stessa sentenza, crea UNA SOLA SCHEDA unificando le prospettive nel 'Dibattito Dogmatico'.

--- STRUTTURA DI OUTPUT ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking> per analizzare se il testo è una Sentenza o un Saggio, ed elaborare i concetti.

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown:

<thinking>[Ragionamento logico-giuridico: classificazione del testo, estrazione ratio, individuazione collegamenti sistemici]
</thinking>

🧾 METADATI RAG

    Tipo Documento:[Nota a Sentenza / Saggio Dottrinale]

    Fonte: [Estremi Sentenza o Titolo Articolo]

    Istituto Principale:[Nome Istituto]

1.[Scegli l'intestazione appropriata: "Il Fatto e il Principio di Diritto" (se sentenza) OPPURE "Contesto Sistemico e Tesi dell'Autore" (se saggio)][Descrivi l'inquadramento con stile manualistico, usando elenchi puntati se utile]

2. Il Dibattito Dogmatico (Astrazione)[Sintetizza le tesi contrapposte o le argomentazioni astratte, inquadrandole nel sistema generale del diritto]

3. Spendibilità Concorsuale[NON ESSERE GENERICO. Elenca in modalità bullet point almeno 3 tracce o tematiche specifiche (istituti di parte generale, conflitti giurisprudenziali, principi costituzionali) a cui questo testo può essere agganciato per la stesura di un tema in Magistratura o alti concorsi pubblici]

4. Tags[Elenco di 5-7 hashtag iper-specifici, es. #SussidiarietaOrizzontale #DataProtection]
`;

async function callGemini(textPrompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: textPrompt }] }],
            generationConfig: { temperature: 0.2 }
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
}

async function processPdf(pdfFile) {
    const pdfPath = path.join(INPUT_DIR, pdfFile);
    const pdfName = pdfFile.replace('.pdf', '');
    const outputDir = path.join(BASE_OUTPUT_DIR, pdfName);
    const cacheDir = path.join(BASE_OUTPUT_DIR, '..', 'temp_cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    
    const cacheFile = path.join(cacheDir, `temp_extracted_${pdfName}.json`);

    console.log(`\n📘 Elaborazione rivista: ${pdfFile}`);

    if (!fs.existsSync(cacheFile)) {
        console.log(`   📂 Estrazione PDF con gestione colonne...`);
        execSync(`python riviste_extractor.py "${pdfPath}" "${cacheFile}"`, { stdio: 'inherit' });
    }

    const pages = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    fs.mkdirSync(outputDir, { recursive: true });

    const CHUNK_SIZE = 15;
    for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
        const chunkPages = pages.slice(i, i + CHUNK_SIZE);
        const chunkText = chunkPages.join('\n\n--- NUOVA PAGINA ---\n\n');
        const outFile = path.join(outputDir, `${pdfName}_pages_${i + 1}_to_${i + chunkPages.length}.md`);

        if (fs.existsSync(outFile)) continue;

        console.log(`   ⏳ Pagine ${i + 1} a ${i + chunkPages.length}...`);
        
        let success = false;
        let retryCount = 0;
        while (!success) {
            try {
                const result = await callGemini(`Analizza le seguenti pagine:\n\n${chunkText}`);
                fs.writeFileSync(outFile, result, 'utf8');
                console.log(`   ✅ Salvato ${outFile}`);
                success = true;
                await new Promise(r => setTimeout(r, 2000));
            } catch (err) {
                retryCount++;
                console.error(`   ❌ Errore (Tentativo ${retryCount}):`, err.message);
                if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('overloaded') || err.message.includes('high demand') || err.message.includes('fetch failed')) {
                    console.log("   ⏳ Quota, sovraccarico o rete, attesa 30s...");
                    await new Promise(r => setTimeout(r, 30000));
                } else {
                    console.log("   ⏳ Attesa 10s...");
                    await new Promise(r => setTimeout(r, 10000));
                }
            }
        }
    }
}

async function main() {
    const pdfs = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.pdf'));
    for (const pdf of pdfs) {
        await processPdf(pdf);
    }
}

main();
