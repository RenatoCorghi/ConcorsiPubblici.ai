/**
 * PIPELINE DI RISCRITTURA TRASFORMATIVA v2 — Mitigazione Copyright
 * Modello: Gemini 3 Flash Preview
 * Prompt: V2 con Onniscienza + De-strutturazione (suggerimenti Deep Research)
 * 
 * Riscrive le schede derivate da riviste editoriali eliminando:
 * - La struttura argomentativa autoriale
 * - Le etichette teoriche originali
 * - Qualsiasi traccia della "chiave di lettura" dell'autore
 * 
 * Uso:
 *   node scripts/rewrite_schede_v2.mjs --sample       # Testa su 3 file
 *   node scripts/rewrite_schede_v2.mjs --dir=giurit_2025_1  # Una directory
 *   node scripts/rewrite_schede_v2.mjs --full          # Tutto
 */
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview";

const REWRITE_PROMPT = `
Sei un professore ordinario di diritto che scrive un MANUALE DIDATTICO COMPLETAMENTE ORIGINALE per la preparazione al concorso in Magistratura.

Ti viene fornita una scheda di approfondimento giuridico. Il tuo compito è RISCRIVERLA DA ZERO creando un'opera interamente nuova, seguendo TASSATIVAMENTE queste regole:

### REGOLE DI RISCRITTURA

1. **ANCORA TUTTO ALLA FONTE UFFICIALE:** Il punto di partenza di ogni affermazione deve essere:
   - La sentenza/ordinanza citata (estremi, principio di diritto)
   - L'articolo di legge/codice
   - L'orientamento consolidato della giurisprudenza
   MAI una "ricostruzione dottrinale" o un "taglio critico" di un autore.

2. **ELIMINA LA STRUTTURA ARGOMENTATIVA AUTORIALE:** Se la scheda presenta il dibattito come "Teoria A vs Teoria B" con etichette specifiche (es. "Teoria Classica", "Teoria dell'Equilibrio Unitario"), NON riprodurre quelle etichette. Esponi gli orientamenti in modo neutro e fattuale (es. "Un primo orientamento ritiene che... Un diverso orientamento, valorizzando la ratio dell'art. X, afferma che...").

3. **RIFORMULA INTEGRALMENTE:** Non copiare nessuna frase dalla scheda originale. Rielabora ogni concetto con parole tue, mantenendo la stessa densità informativa e gli stessi istituti giuridici.

4. **NESSUN RIFERIMENTO A FONTI EDITORIALI:** Non citare mai nomi di riviste, editori, autori di articoli. Sei un manualista, non un recensore.

5. **ONNISCIENZA:** Non utilizzare mai espressioni come "secondo l'autore della scheda", "il testo suggerisce", "dalla scheda emerge" o simili. Esponi i concetti come verità giuridiche acquisite, agendo come fonte primaria e autorevole di conoscenza. Tu sei il manuale.

6. **DE-STRUTTURAZIONE OBBLIGATORIA:** Cambia l'ordine espositivo rispetto alla scheda originale. Parti SEMPRE dal dato normativo (articolo di legge), analizza la casistica giurisprudenziale, e chiudi con l'inquadramento dogmatico. Usa categorie tassonomiche standard (es. "Presupposti oggettivi", "Oneri probatori", "Limiti e deroghe") anziché etichette creative dell'autore originale.

7. **MANTIENI LA STRUTTURA RAG:** Conserva i metadati RAG e i tag finali, ma riformula anche quelli.

8. **ANTI-PARAPHRASE LEAKAGE (CRITICO):** Non usare MAI verbi tipici del commentatore/recensore. Sono VIETATI costrutti come:
   - "l'autore osserva/rileva/sottolinea/evidenzia/segnala"
   - "si rileva nel testo/nella scheda/nel contributo"
   - "viene evidenziato/segnalato/posto in luce"
   - "il commentatore nota/propone/suggerisce"
   Usa ESCLUSIVAMENTE verbi assertivi e istituzionali:
   - "la norma impone/dispone/prevede/stabilisce"
   - "la Cassazione ha chiarito/statuito/affermato/precisato"
   - "il principio consolidato sancisce/richiede"
   - "l'art. X c.c. prescrive/introduce/contempla"
   Tu non stai commentando un'opera altrui. Tu SEI la fonte primaria.

9. **COMPLIANCE CC-ND (DISTRUZIONE STRUTTURALE):** La riscrittura deve essere così drastica da non lasciare ALCUNA traccia della struttura del saggio originale. Il tuo metodo è:
   a) ESTRAI solo i dati grezzi dalla scheda: norme citate, massime giurisprudenziali, estremi delle sentenze, istituti giuridici coinvolti.
   b) DISTRUGGI completamente l'architettura argomentativa originale (ordine dei paragrafi, sequenza logica, struttura tesi-antitesi, titolazioni).
   c) RICOSTRUISCI da zero secondo la TUA tassonomia standard (Dato Normativo → Casistica → Questioni Aperte → Rilevanza Concorsuale), organizzando i dati grezzi estratti in categorie didattiche proprie.
   Il risultato finale deve essere riconducibile alla scheda originale SOLO per il fatto che tratta gli stessi istituti giuridici e cita le stesse sentenze — che sono dati pubblici non coperti da copyright.

### STRUTTURA DI OUTPUT (per ogni scheda nel testo)

🧾 METADATI RAG
* Tipo Documento: Scheda Manualistica
* Riferimento: [Estremi della sentenza/norma principale, es. "Cass. Civ., Sez. III, Ord. 10902/2024" oppure "Art. 2052 c.c."]
* Istituto Principale: [Nome Istituto]

1. Dato Normativo e Principio di Diritto
[Parti dall'articolo di legge e dalla pronuncia. Esponi il principio di diritto in modo diretto e onnisciente con verbi assertivi.]

2. Casistica Giurisprudenziale e Orientamenti
[Esponi gli orientamenti in modo neutro usando categorie standard: "presupposti", "oneri probatori", "limiti", "deroghe", "ambito di applicazione". NO etichette autoriali. NO verbi da commentatore.]

3. Questioni Aperte e Profili Critici
[Solo se effettivamente presenti: contrasti aperti, rinvii pregiudiziali, questioni pendenti.]

4. Rilevanza Concorsuale
[2-3 tracce concrete in bullet point.]

5. Tags
[5-7 hashtag specifici]

Se il testo contiene più schede separate (divise da ---), genera una scheda riscritta per ciascuna, separandole con ---.

IMPORTANTE: Usa generosamente il **grassetto** per i termini tecnici e i riferimenti normativi. Usa elenchi puntati per massimizzare la leggibilità.
`;

async function callGemini(textPrompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: REWRITE_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: textPrompt }] }],
            generationConfig: { temperature: 0.3 }
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
}

async function rewriteFile(filePath, outputPath) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Skip empty/scarto files
    if (content.includes('[SCARTO]') || content.includes('[NESSUN_CONTENUTO_UTILE]') || content.trim().length < 200) {
        return 'skipped';
    }

    const userPrompt = `Riscrivi COMPLETAMENTE da zero la seguente scheda giuridica, seguendo TASSATIVAMENTE le regole del sistema. Crea un'opera manualistica originale.

SCHEDA DA RISCRIVERE:
${content}`;

    let result;
    let retries = 0;
    while (retries < 3) {
        try {
            result = await callGemini(userPrompt);
            break;
        } catch (err) {
            retries++;
            console.error(`   ❌ Errore (Tentativo ${retries}):`, err.message);
            if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('overloaded') || err.message.includes('high demand')) {
                console.log("   ⏳ Rate limit, attesa 30s...");
                await new Promise(r => setTimeout(r, 30000));
            } else {
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    if (!result) return 'error';

    // Remove any <thinking> blocks from output
    result = result.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();

    fs.writeFileSync(outputPath, result, 'utf8');
    return 'ok';
}

// ===== MAIN =====
const args = process.argv.slice(2);
const SAMPLE_MODE = args.includes('--sample');
const FULL_MODE = args.includes('--full');
const SPECIFIC_DIR = args.find(a => a.startsWith('--dir='))?.replace('--dir=', '');

const SCHEDE_DIR = 'riviste_vip_schede';
const OUTPUT_DIR = 'riviste_vip_schede_v2';

async function main() {
    if (!SAMPLE_MODE && !FULL_MODE && !SPECIFIC_DIR) {
        console.log('Uso:');
        console.log('  node scripts/rewrite_schede_v2.mjs --sample            # Testa su 3 file');
        console.log('  node scripts/rewrite_schede_v2.mjs --dir=giurit_2025_1  # Una directory');
        console.log('  node scripts/rewrite_schede_v2.mjs --full               # Tutto');
        return;
    }

    console.log(`🛡️  RISCRITTURA TRASFORMATIVA v2 — Modello: ${MODEL_NAME}`);
    console.log(`   Input: ${SCHEDE_DIR} → Output: ${OUTPUT_DIR}\n`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Get directories to process (supports nested dirs like federalismi/fascicolo_X/)
    let dirs;
    if (SPECIFIC_DIR) {
        dirs = [SPECIFIC_DIR];
    } else {
        dirs = [];
        function walkDirs(base, rel = '') {
            const entries = fs.readdirSync(path.join(base, rel), { withFileTypes: true });
            const hasMd = entries.some(e => e.isFile() && e.name.endsWith('.md'));
            if (hasMd) dirs.push(rel);
            for (const e of entries) {
                if (e.isDirectory()) walkDirs(base, path.join(rel, e.name));
            }
        }
        walkDirs(SCHEDE_DIR);
    }

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const startTime = Date.now();

    for (const dir of dirs) {
        const inputDir = path.join(SCHEDE_DIR, dir);
        const outDir = path.join(OUTPUT_DIR, dir);
        
        let files;
        try { files = fs.readdirSync(inputDir).filter(f => f.endsWith('.md')); }
        catch { continue; }

        if (files.length === 0) continue;

        fs.mkdirSync(outDir, { recursive: true });
        console.log(`\n📂 ${dir} (${files.length} file)`);

        // In sample mode, only process first 3 files from first directory
        if (SAMPLE_MODE) {
            files = files.slice(0, 3);
        }

        for (const file of files) {
            const inputPath = path.join(inputDir, file);
            const outputPath = path.join(outDir, file);

            // Skip if already processed
            if (fs.existsSync(outputPath)) {
                const existingContent = fs.readFileSync(outputPath, 'utf8');
                if (existingContent.trim().length > 100) {
                    totalSkipped++;
                    continue;
                }
            }

            console.log(`   ⏳ [${totalProcessed + totalSkipped + totalErrors + 1}] ${file}`);
            const result = await rewriteFile(inputPath, outputPath);
            
            if (result === 'ok') {
                totalProcessed++;
                console.log(`   ✅ Riscritto`);
            } else if (result === 'skipped') {
                totalSkipped++;
                console.log(`   ⏭️  Saltato (breve/scarto)`);
            } else {
                totalErrors++;
                console.log(`   ❌ Errore`);
            }

            // Rate limiting — 1.5s between calls
            await new Promise(r => setTimeout(r, 1500));
        }

        if (SAMPLE_MODE) break;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ RISCRITTURA COMPLETATA in ${Math.floor(elapsed/60)}m ${elapsed%60}s`);
    console.log(`   Processati: ${totalProcessed}`);
    console.log(`   Saltati:    ${totalSkipped}`);
    console.log(`   Errori:     ${totalErrors}`);
}

main();
