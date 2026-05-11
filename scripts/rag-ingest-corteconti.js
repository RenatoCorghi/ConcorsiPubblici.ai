import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !GEMINI_API_KEY) {
    console.error("❌ Chiavi mancanti nel .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const INPUT_DIR = path.resolve('./corte_conti_vip_schede');

// ==========================================
// EMBEDDING BATCH
// ==========================================
async function getBatchEmbeddings(texts, retries = 5) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${GEMINI_API_KEY}`;

    const requests = texts.map(text => ({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text: text.substring(0, 8000) }] },
        outputDimensionality: 768
    }));

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests })
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 429) {
                    const wait = 60000 * attempt;
                    console.log(`  ⏳ Rate limit! Attesa ${wait / 1000}s (tentativo ${attempt}/${retries})...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${response.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === retries) {
                console.error(`  ❌ Batch Embedding fallito dopo ${retries} tentativi:`, e.message);
                return null;
            }
            await new Promise(r => setTimeout(r, 10000 * attempt));
        }
    }
    return null;
}

// ==========================================
// UTILITY — Ricava anno dal nome del pdf Corte Conti
// ==========================================
function parseFascicoloMeta(dirName, fileName) {
    // Es. corteconti_rivista_01_01_2021fascicolo_n_1_2021_rivista
    let editore = 'Rivista Corte dei Conti';
    let anno = null;
    const match = dirName.match(/_(\d{4})/);
    if (match) {
        anno = parseInt(match[1]);
    }
    return { editore, anno };
}

// ==========================================
// MAIN
// ==========================================
async function main() {
    console.log(`\n🚀 Avvio Vettorializzazione BATCH Riviste Corte dei Conti\n`);
    console.log(`📂 Cartella input: ${INPUT_DIR}\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella ${INPUT_DIR} non trovata.`);
        return;
    }

    // STEP 1: Indice file già in DB
    console.log("📡 Caricamento indice DB in corso...");
    const existingFilenames = new Set();
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('editore', 'Rivista Corte dei Conti')
            .range(offset, offset + 999);
        if (error || !data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += 1000;
        if (data.length < 1000) break;
    }
    console.log(`✅ File già presenti in DB: ${existingFilenames.size}\n`);

    // STEP 2: Scansione cartelle
    const allFiles = [];
    const fascicoli = fs.readdirSync(INPUT_DIR).filter(d => {
        const fullPath = path.join(INPUT_DIR, d);
        return fs.statSync(fullPath).isDirectory();
    });

    for (const fascicolo of fascicoli) {
        const fascicoloDir = path.join(INPUT_DIR, fascicolo);
        const files = fs.readdirSync(fascicoloDir).filter(f => f.endsWith('.md'));
        files.forEach(f => allFiles.push({ fascicolo, fullPath: path.join(fascicoloDir, f), fileName: f }));
    }

    const toProcess = allFiles.filter(f => !existingFilenames.has(f.fileName));

    console.log(`📂 File totali su disco:  ${allFiles.length}`);
    console.log(`⏭️  Già in DB (skip):      ${allFiles.length - toProcess.length}`);
    console.log(`🆕 Da caricare:            ${toProcess.length}\n`);

    if (toProcess.length === 0) {
        console.log("✨ Tutto già vettorializzato! Niente da fare.");
        return;
    }

    // STEP 3: Elaborazione Batch
    const BATCH_SIZE = 10; 
    let success = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batchFiles = toProcess.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);
        console.log(`🔄 Batch ${batchNum}/${totalBatches} [${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length}]...`);

        const batchData = batchFiles.map(({ fascicolo, fullPath, fileName }) => {
            const textContent = fs.readFileSync(fullPath, 'utf8');
            const cleanContent = textContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
            const { editore, anno } = parseFascicoloMeta(fascicolo, fileName);
            const titolo = `[${editore} - ${anno || fascicolo}] ${fileName.replace('.md', '')}`;
            return { fileName, fascicolo, textContent: cleanContent, titolo, editore, anno };
        });

        // Skip files that are marked as [NESSUN_CONTENUTO_UTILE]
        const validBatchData = batchData.filter(d => !d.textContent.includes('[NESSUN_CONTENUTO_UTILE]'));
        
        if (validBatchData.length === 0) {
            console.log(`    ⚠️ Tutti i file nel batch erano senza contenuto utile. Skip.`);
            success += batchData.length;
            continue;
        }

        const textsToEmbed = validBatchData.map(d => d.textContent);
        const vectors = await getBatchEmbeddings(textsToEmbed);

        if (!vectors || vectors.length !== validBatchData.length) {
            console.log(`    ⚠️ Embedding fallito per il batch. Salto ${validBatchData.length} file.`);
            failed += validBatchData.length;
            continue;
        }

        for (let j = 0; j < validBatchData.length; j++) {
            const { fileName, textContent, titolo, editore, anno } = validBatchData[j];
            const vector = vectors[j];

            const { data: docData, error: docError } = await supabase
                .from('rag_documents')
                .insert([{
                    titolo,
                    tipo: 'rivista_vip',
                    materia: 'Contabilità Pubblica',
                    editore,
                    anno,
                    filename: fileName,
                    chunks_count: 1,
                    status: 'completed'
                }])
                .select()
                .single();

            if (docError) {
                if (docError.code === '23505') {
                    success++;
                } else {
                    console.error(`    ❌ Errore doc ${fileName}:`, docError.message);
                    failed++;
                }
                continue;
            }

            const { error: chunkError } = await supabase
                .from('rag_chunks')
                .insert([{
                    document_id: docData.id,
                    chunk_index: 1,
                    content: textContent,
                    materia: 'Contabilità Pubblica',
                    tipo: 'rivista_vip',
                    embedding: vector
                }]);

            if (chunkError) {
                console.error(`    ❌ Errore chunk ${fileName}:`, chunkError.message);
                failed++;
            } else {
                success++;
            }
        }

        success += (batchData.length - validBatchData.length); // NESSUN_CONTENUTO_UTILE are considered "success" (skipped intentionally)
        console.log(`    ✅ Batch completato. Successi cumulativi: ${success}`);
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n✨ COMPLETATO! Caricati: ${success} | Falliti: ${failed}`);
}

main().catch(console.error);
