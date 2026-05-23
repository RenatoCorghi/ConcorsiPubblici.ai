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

const INPUT_DIR = path.resolve('data/riviste_federalismi');
const BASE_OUTPUT_DIR = path.resolve('./riviste_vip_schede/federalismi');

const SYSTEM_PROMPT = `
Sei un giurista e accademico di altissimo livello, Direttore Scientifico e autore di un prestigioso Manuale di Diritto per la preparazione al Concorso in Magistratura.

Ti verrà fornito in input un testo grezzo estratto dalla rivista giuridica "Federalismi.it". Il testo può contenere saggi dottrinali, note a sentenza o focus su istituti di diritto pubblico e costituzionale.

Il tuo obiettivo è fare reverse-engineering del testo: estrarre la pura "Regula Iuris" e l'evoluzione dogmatica, trasformando il tutto in una "Scheda Manualistica Oggettiva" ad altissima densità informativa, ottimizzata per l'inserimento in un database vettoriale (RAG).

RISPETTA TASSATIVAMENTE I SEGUENTI VINCOLI (NORMATIVA ANTI-COPYRIGHT):

    1. DIVIETO ASSOLUTO DI COPIA-INCOLLA: È SEVERAMENTE VIETATO citare, trascrivere o parafrasare passaggi letterali. Non devi "riassumere", devi "RIELABORARE". 
       Devi interiorizzare i concetti giuridici e riscriverli COMPLETAMENTE DA ZERO con parole tue, usando un lessico giuridico rigoroso e uno stile manualistico impersonale. 
       Il risultato deve essere un'opera originale derivata, non una riproduzione.

    2. Evidenziazione Visiva (IMPORTANTE): Usa generosamente il grassetto per evidenziare le parole chiave, i termini tecnici e i brocardi latini. Usa gli elenchi puntati all'interno dei paragrafi per massimizzare la leggibilità.

    3. Astrazione dell'Autore: Non riferire mai l'opinione personale dell'autore della nota (es. "L'autore sostiene che..."). Trasforma le tesi in un dibattito dogmatico oggettivo (es. "In dottrina si discute se...", "L'orientamento prevalente ritiene che...").

    4. Anonimizzazione: Sostituisci nomi di persone o aziende con termini giuridici astratti (es. "il ricorrente", "la società target", "l'amministrazione").

    5. Gestione del Testo Sporco e Indici: Se il testo contiene solo indici, bibliografie o elenchi di autori, restituisci ESCLUSIVAMENTE: [NESSUN_CONTENUTO_UTILE].

    6. Gestione Multi-Argomento: Genera UNA SCHEDA SEPARATA per ogni saggio o sentenza distinta trovata nel testo.

--- STRUTTURA DI OUTPUT ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking> per analizzare il contenuto ed elaborare i concetti.

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown:

<thinking>
[Ragionamento logico-giuridico: classificazione del testo, estrazione ratio, individuazione collegamenti sistemici]
</thinking>

🧾 METADATI RAG

    Tipo Documento: [Nota a Sentenza / Saggio Dottrinale]

    Fonte: [Federalismi.it - Titolo Articolo o Estremi Sentenza]

    Istituto Principale: [Nome Istituto]

1. [Scegli l'intestazione appropriata: "Inquadramento Sistematico" OPPURE "Il Nodo Ermeneutico"]
[Descrivi l'inquadramento con stile manualistico, usando elenchi puntati se utile. Ricorda: PAROLE TUE, NO COPIA.]

2. Il Dibattito Dogmatico (Astrazione)
[Sintetizza le tesi contrapposte o le argomentazioni astratte, inquadrandole nel sistema generale del diritto.]

3. Spendibilità Concorsuale
[Elenca in modalità bullet point almeno 3 tracce o tematiche specifiche (es. "tema sul potere di ordinanza", "tema sulla gerarchia delle fonti") a cui questo testo può essere agganciato.]

4. Tags
[5-7 hashtag iper-specifici]
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
    const cacheDir = path.join(process.cwd(), 'temp_cache_federalismi');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    
    const cacheFile = path.join(cacheDir, `temp_extracted_${pdfName}.json`);

    console.log(`\n📘 Elaborazione Federalismi: ${pdfFile}`);

    if (!fs.existsSync(cacheFile)) {
        console.log(`   📂 Estrazione PDF con python riviste_extractor.py...`);
        try {
            execSync(`python riviste_extractor.py "${pdfPath}" "${cacheFile}"`, { stdio: 'inherit' });
        } catch (e) {
            console.error(`   ❌ Fallita estrazione per ${pdfFile}`);
            return;
        }
    }

    if (!fs.existsSync(cacheFile)) return;
    
    const pages = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    fs.mkdirSync(outputDir, { recursive: true });

    // Federalismi ha articoli spesso lunghi, usiamo chunk di 10 pagine
    const CHUNK_SIZE = 10;
    for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
        const chunkPages = pages.slice(i, i + CHUNK_SIZE);
        const chunkText = chunkPages.join('\n\n--- NUOVA PAGINA ---\n\n');
        const outFile = path.join(outputDir, `${pdfName}_pages_${i + 1}_to_${i + chunkPages.length}.md`);

        if (fs.existsSync(outFile)) {
            console.log(`   [${i + 1}-${i + chunkPages.length}] Già presente, salto.`);
            continue;
        }

        console.log(`   ⏳ Generazione Scheda VIP (Pagine ${i + 1} a ${i + chunkPages.length})...`);
        
        let success = false;
        let retryCount = 0;
        while (!success && retryCount < 3) {
            try {
                const result = await callGemini(`Analizza le seguenti pagine della rivista Federalismi:\n\n${chunkText}`);
                if (result.includes('[NESSUN_CONTENUTO_UTILE]')) {
                    console.log(`   ⏭️  Nessun contenuto utile trovato in questo chunk.`);
                    fs.writeFileSync(outFile, "[SCARTO] Nessun contenuto utile.", 'utf8');
                } else {
                    fs.writeFileSync(outFile, result, 'utf8');
                    console.log(`   ✅ Salvato ${outFile}`);
                }
                success = true;
                await new Promise(r => setTimeout(r, 1500));
            } catch (err) {
                retryCount++;
                console.error(`   ❌ Errore (Tentativo ${retryCount}):`, err.message);
                if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('overloaded') || err.message.includes('high demand')) {
                    console.log("   ⏳ Quota o sovraccarico, attesa 30s...");
                    await new Promise(r => setTimeout(r, 30000));
                } else {
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        }
    }
}

async function main() {
    if (!fs.existsSync(INPUT_DIR)) {
        console.log(`❌ Directory di input non trovata: ${INPUT_DIR}`);
        return;
    }
    const pdfs = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.pdf'));
    console.log(`🚀 Trovate ${pdfs.length} riviste da processare.`);
    
    fs.mkdirSync(BASE_OUTPUT_DIR, { recursive: true });

    for (const pdf of pdfs) {
        await processPdf(pdf);
    }
    console.log("\n✨ Processo Federalismi completato.");
}

main();
