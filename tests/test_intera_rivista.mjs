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
// Stiamo usando Gemini 3 Flash Preview
const MODEL_NAME = "gemini-3-flash-preview";

const PDF_PATH = path.resolve('data/giurisprudena italiana/giurit_2022_1.pdf');
const OUTPUT_DIR = path.resolve('./riviste_vip_schede/giurit_2022_1_v2');

const SYSTEM_PROMPT = `
Sei un giurista e accademico di altissimo livello, Direttore Scientifico e autore di un prestigioso Manuale di Diritto per la preparazione al Concorso in Magistratura.

Ti verrà fornito in input un testo grezzo (spesso frammentato, impaginato a colonne o contenente refusi OCR) estratto dalla rivista "Giurisprudenza Italiana". Il testo può contenere note a sentenza, massime redazionali o saggi dottrinali.

Il tuo obiettivo è fare reverse-engineering del testo: estrarre la pura "Regula Iuris" (il principio di diritto nomofilattico) e l'evoluzione dogmatica, trasformando il tutto in una "Scheda Manualistica Oggettiva" ad altissima densità informativa, ottimizzata per l'inserimento in un database vettoriale (RAG).

RISPETTA TASSATIVAMENTE I SEGUENTI VINCOLI:

1. Data Honesty e Divieto di Trascrizione: È SEVERAMENTE VIETATO citare, trascrivere o parafrasare passaggi letterali della nota dottrinale o della sentenza. Devi interiorizzare i concetti giuridici e riscriverli COMPLETAMENTE DA ZERO, usando un lessico giuridico rigoroso e uno stile manualistico impersonale.
2. Astrazione dell'Autore: Non riferire mai l'opinione personale dell'autore della nota (es. NON scrivere "secondo l'autore" o "il commentatore critica"). Trasforma le critiche dottrinali in un dibattito dogmatico oggettivo e generale (es. "Una parte della dottrina critica l'orientamento perché...").
3. Anonimizzazione: Ignora e ometti i nomi di persone fisiche o aziende coinvolte nei casi, sostituendoli con termini giuridici astratti (es. "il lavoratore", "l'imputato", "la società target").
4. Gestione del Testo Sporco e Indici: Ignora numeri di pagina, frammenti di note a piè di pagina tagliate o intestazioni. SE il testo fornito contiene solo indici, sommari, bibliografie o non contiene alcun argomento giuridico strutturato, restituisci ESCLUSIVAMENTE la dicitura: [NESSUN_CONTENUTO_UTILE].
5. Gestione Multi-Argomento: Se nel testo fornito individui PIÙ sentenze o PIÙ saggi su argomenti totalmente scollegati tra loro, devi generare UNA SCHEDA SEPARATA per ciascun argomento, ripetendo la struttura Markdown per ognuna.

--- STRUTTURA DI OUTPUT RICHIESTA ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno, analizza logicamente il testo passo dopo passo: individua l'istituto, separa i fatti dal principio di diritto, estrai le tesi dottrinali e valuta la spendibilità concorsuale.

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown (ripetila se ci sono più argomenti nel testo):

<thinking>
[Il tuo ragionamento logico-giuridico qui]
</thinking>

🧾 METADATI RAG
* Tipo Documento: [Indica se è: Nota a Sentenza / Saggio Dottrinale / Rassegna Giurisprudenziale]
* Fonte: [Es. Cassazione Civile, Sez. Unite, n. 1234/2021]
* Istituto Principale: [Es. Nullità del contratto, Responsabilità precontrattuale, ecc.]

1. Il Fatto e il Principio di Diritto
[Sintetizza in modo impersonale e denso il caso concreto e la regula iuris. Niente nomi propri.]

2. Il Dibattito Dogmatico (Astrazione)
[Esponi le tesi dogmatiche e giurisprudenziali emerse nel testo come un dibattito oggettivo generale. Illustra tesi restrittive, estensive, maggioritarie o minoritarie.]

3. Spendibilità Concorsuale
[Elenco puntato (max 3-4 punti): spiega operativamente come il candidato magistrato può usare queste argomentazioni in un tema scritto per fare collegamenti sistematici.]

4. Tags
[5 hashtag precisi per l'indicizzazione nel database vettoriale]

Fonte ispiratrice: Rielaborazione manualistica per Concorsi.AI basata su concetti tratti da Giurisprudenza Italiana.
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

async function run() {
    if (!fs.existsSync('temp_extracted.json')) {
        console.log("1. Estrazione testo con PyMuPDF in corso...");
        execSync(`python extract_pdf.py "${PDF_PATH}"`, { stdio: 'inherit' });
    } else {
        console.log("1. Testo PDF già estratto, uso la cache temp_extracted.json...");
    }

    const pages = JSON.parse(fs.readFileSync('temp_extracted.json', 'utf8'));
    console.log(`2. Estratte ${pages.length} pagine. Generazione Schede V2 in corso...`);
    
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const CHUNK_SIZE = 15;
    for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
        const chunkPages = pages.slice(i, i + CHUNK_SIZE);
        const chunkText = chunkPages.join('\n\n--- NUOVA PAGINA ---\n\n');
        
        console.log(`⏳ Elaborazione pagine da ${i + 1} a ${i + chunkPages.length}...`);
        
        try {
            const prompt = `Analizza le seguenti pagine estratte dalla rivista:\n\n${chunkText}`;
            const result = await callGemini(prompt);
            
            const outFile = path.join(OUTPUT_DIR, `giurit_2022_1_pages_${i + 1}_to_${i + chunkPages.length}.md`);
            fs.writeFileSync(outFile, result, 'utf8');
            console.log(`   ✅ Salvato ${outFile}`);
            
            // Pausa per rate limit
            await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
            console.error(`   ❌ Errore sulle pagine ${i + 1}:`, err.message);
            // Attesa in caso di quota limits
            if (err.message.includes('429') || err.message.includes('quota')) {
                await new Promise(r => setTimeout(r, 60000));
            }
        }
    }
    
    console.log("\n✨ PROVA RIVISTA V2 COMPLETATA CON SUCCESSO! Controlla la cartella: " + OUTPUT_DIR);
}

run();
