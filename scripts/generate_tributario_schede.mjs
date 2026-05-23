/**
 * GENERATORE SCHEDE CODIFICATORE TRIBUTARIO
 * Prompt v1 — Anti-Allucinazione Fiscale
 * Modello: gemini-3-flash-preview
 * 
 * Input:  data/codici/tributario_md/*.md  (testi estratti dai PDF)
 * Output: schede_tributario_vip/<nome_legge>/scheda_XXX.md
 * 
 * Uso:
 *   node scripts/generate_tributario_schede.mjs --sample    # 3 chunk per file
 *   node scripts/generate_tributario_schede.mjs --full      # tutto
 *   node scripts/generate_tributario_schede.mjs --file=TUIR_DPR_917_1986.md  # un solo file
 */

import fs from 'fs';
import path from 'path';

// === ENV ===
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

// === PROMPT DEFINITIVO: IL CODIFICATORE TRIBUTARIO ===
const SYSTEM_PROMPT = `Sei un illustre Professore Ordinario di Diritto Tributario e un severo Commissario del Concorso in Magistratura.
Compito: Analizza il testo normativo fornito (estratto da TUIR, IVA o altri decreti tributari) e redigi una Scheda Manualistica di Diritto Positivo ad altissimo contenuto scientifico, ottimizzata per un database RAG.

🛑 REGOLA DI RIGORE ASSOLUTO (ANTI-ALLUCINAZIONE FISCALE): Attieniti STRETTAMENTE al testo normativo fornito. NON aggiornare aliquote, scaglioni, date o soglie dimensionali basandoti sulla tua memoria esterna. Se un'aliquota o un criterio di calcolo non è esplicitato nel testo fornito, scrivi chiaramente: "Dato quantitativo non specificato nel frammento".

STRUTTURA DELLA SCHEDA (Markdown):

# [Nome dell'Atto Normativo] - Art. [Numero] - [Titolo dell'Articolo/Tema]

## 1. Inquadramento Normativo e Ratio

* **Dato Testuale:** Sintetizza il contenuto del precetto normativo in modo analitico e onnisciente.
* **Ratio Legis:** Spiega il fondamento sistematico della norma (es. rispetto del principio di capacità contributiva ex art. 53 Cost., divieto di doppia imposizione, contrasto all'elusione, armonizzazione UE).

## 2. Elementi Costitutivi della Fattispecie

* **Presupposto Soggettivo:** Chi è il soggetto passivo (contribuente, sostituto d'imposta, responsabile d'imposta, ente impositore).
* **Presupposto Oggettivo:** Qual è la materia imponibile, il fatto generatore o l'operazione rilevante.
* **Base Imponibile e Aliquota:** Criteri di determinazione quantitativa (SOLO se presenti nel testo).

## 3. Profili Esegetici e Fase Patologica

* **Esegesi e Adempimenti:** Chiarisci i termini tecnici (es. "inerenza", "stabile organizzazione") e descrivi gli obblighi strumentali collegati (dichiarazione, versamento, rivalsa).
* **Profili di Accertamento:** (Se rilevabili dal testo) Specifica i poteri dell'Amministrazione Finanziaria o le decadenze connesse alla norma.

## 4. Correlazioni Sistematiche

Collega la norma con l'ordinamento superiore:

* **Principi Costituzionali:** (es. Artt. 3, 23, 53, 97 Cost.).
* **Diritto UE / Internazionale:** (es. Direttive IVA, libertà di stabilimento, divieto di aiuti di Stato).
* **Frizioni Inter-Sistematiche:** (es. scostamenti tra reddito d'impresa tributario e bilancio civilistico, o riflessi sul diritto amministrativo).

## 5. Spendibilità Concorsuale (Focus Magistratura)

* **Tracce Probabili:** In quali contesti trasversali può essere citata questa norma (es. prova di civile su nullità dei contratti per frode fiscale; prova di amministrativo sull'autotutela tributaria).
* **La Matita Blu:** Errori dogmatici strutturali da evitare assolutamente (es. confondere ritenuta a titolo d'imposta con quella a titolo d'acconto, o ignorare il principio di riserva di legge).

---
[METADATI RAG]
* Materia: Diritto Tributario
* Atto: [Es. TUIR DPR 917/1986 | IVA DPR 633/1972 | Accertamento DPR 600/1973 | Riscossione DPR 602/1973 | Processo Tributario DLgs 546/1992]
* Istituti Chiave: [Max 5 termini tecnici separati da virgola]`;

// === CONFIG ===
const INPUT_DIR = 'data/codici/tributario_md';
const OUTPUT_DIR = 'schede_tributario_vip';
const CHUNK_SIZE = 4000;    // chars per chunk (bilancio qualità/costi)
const CHUNK_OVERLAP = 200;  // sovrapposizione per mantenere contesto articolo
const DELAY_MS = 2000;      // delay tra chiamate API

// === HELPERS ===
function chunkText(text, size, overlap) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + size, text.length);
        chunks.push(text.slice(start, end));
        if (end === text.length) break;
        start += size - overlap;
    }
    return chunks;
}

async function callGemini(normativeText, fileName) {
    const nomeAtto = fileName
        .replace('.md', '')
        .replace(/_/g, ' ')
        .replace('DPR', 'D.P.R.')
        .replace('DLgs', 'D.Lgs.');

    const userPrompt = `Elabora il seguente frammento normativo estratto da "${nomeAtto}" e genera una Scheda Manualistica completa secondo le istruzioni del sistema.

TESTO NORMATIVO:
${normativeText}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { temperature: 0.25 }
            })
        }
    );
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
}

// === MAIN ===
const args = process.argv.slice(2);
const SAMPLE_MODE = args.includes('--sample');
const SPECIFIC_FILE = args.find(a => a.startsWith('--file='))?.replace('--file=', '');

async function processFile(mdFile) {
    const inputPath = path.join(INPUT_DIR, mdFile);
    const baseName = mdFile.replace('.md', '');
    const outDir = path.join(OUTPUT_DIR, baseName);
    fs.mkdirSync(outDir, { recursive: true });

    const text = fs.readFileSync(inputPath, 'utf8');
    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    const toProcess = SAMPLE_MODE ? chunks.slice(0, 3) : chunks;

    console.log(`\n📄 ${mdFile}`);
    console.log(`   Chunks totali: ${chunks.length} | Da processare: ${toProcess.length}`);

    let ok = 0, skip = 0, err = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const chunkNum = String(i + 1).padStart(4, '0');
        const outPath = path.join(outDir, `scheda_${chunkNum}.md`);

        // Skip se già esiste
        if (fs.existsSync(outPath) && fs.readFileSync(outPath, 'utf8').length > 100) {
            skip++;
            process.stdout.write(`\r   [${i+1}/${toProcess.length}] ⏭ Skip (già presente)      `);
            continue;
        }

        // Skip chunk troppo corti (indici, intestazioni)
        if (toProcess[i].trim().length < 150) {
            skip++;
            process.stdout.write(`\r   [${i+1}/${toProcess.length}] ⏭ Skip (chunk breve)        `);
            continue;
        }

        process.stdout.write(`\r   [${i+1}/${toProcess.length}] ⏳ Generazione scheda ${chunkNum}...`);

        let retries = 0;
        while (retries < 3) {
            try {
                const scheda = await callGemini(toProcess[i], mdFile);
                fs.writeFileSync(outPath, scheda, 'utf8');
                ok++;
                process.stdout.write(`\r   [${i+1}/${toProcess.length}] ✅ scheda_${chunkNum}.md OK             \n`);
                break;
            } catch (e) {
                retries++;
                if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('overloaded')) {
                    console.log(`\n   ⏳ Rate limit, attesa 30s...`);
                    await new Promise(r => setTimeout(r, 30000));
                } else {
                    console.log(`\n   ❌ Errore: ${e.message}`);
                    await new Promise(r => setTimeout(r, 5000));
                }
                if (retries === 3) { err++; break; }
            }
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`   📊 OK: ${ok} | Skip: ${skip} | Errori: ${err}`);
    return { ok, skip, err };
}

async function main() {
    console.log(`🏛️  CODIFICATORE TRIBUTARIO — Modello: ${MODEL_NAME}`);
    console.log(`   Input: ${INPUT_DIR} → Output: ${OUTPUT_DIR}`);
    console.log(`   Modalità: ${SAMPLE_MODE ? 'SAMPLE (3 chunk/file)' : SPECIFIC_FILE ? `FILE SINGOLO (${SPECIFIC_FILE})` : 'FULL'}\n`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.md'));
    if (SPECIFIC_FILE) files = files.filter(f => f === SPECIFIC_FILE);

    if (files.length === 0) {
        console.error(`❌ Nessun file .md trovato in ${INPUT_DIR}`);
        return;
    }

    console.log(`📂 File da elaborare: ${files.join(', ')}\n`);

    const startTime = Date.now();
    let totalOk = 0, totalSkip = 0, totalErr = 0;

    for (const file of files) {
        const result = await processFile(file);
        totalOk += result.ok;
        totalSkip += result.skip;
        totalErr += result.err;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ CODIFICATORE COMPLETATO in ${Math.floor(elapsed/60)}m ${elapsed%60}s`);
    console.log(`   Schede generate: ${totalOk}`);
    console.log(`   Skip:            ${totalSkip}`);
    console.log(`   Errori:          ${totalErr}`);
    console.log(`   Output:          ${OUTPUT_DIR}/`);
    console.log('='.repeat(60));
}

main();
