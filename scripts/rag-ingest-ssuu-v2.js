import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { validateSheet } from './lint_vip_sheets.mjs';

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
const INPUT_DIR = path.resolve('./sentenze_ssuu_vip_schede');

// ==========================================
// EMBEDDING BATCH
// ==========================================
async function getBatchEmbeddings(texts, retries = 3) {
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
                    console.log(`  ⏳ Rate limit! Attesa ${wait/1000}s (tentativo ${attempt}/${retries})...`);
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
            await new Promise(r => setTimeout(r, 5000 * attempt));
        }
    }
    return null;
}

// ==========================================
// UTILITY
// ==========================================
function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(file => {
        if (fs.statSync(`${dirPath}/${file}`).isDirectory()) {
            arrayOfFiles = getAllFiles(`${dirPath}/${file}`, arrayOfFiles);
        } else {
            if (file.endsWith('.md') && !file.startsWith('TEST_') && !file.startsWith('ORIGINALE_')) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });
    return arrayOfFiles;
}

// ==========================================
// MAIN — Versione BATCH
// ==========================================
async function main() {
    console.log(`\n🚀 Avvio Vettorializzazione BATCH SS.UU.\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella ${INPUT_DIR} non trovata.`);
        return;
    }

    // STEP 1: Indice DB
    console.log("📡 Caricamento indice DB in corso...");
    const existingFilenames = new Set();
    let offset = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'sentenza_ssuu')
            .range(offset, offset + limit - 1);
        if (error) { console.error("Errore fetch:", error); break; }
        if (!data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += limit;
        if (data.length < limit) break;
    }
    console.log(`✅ Trovati ${existingFilenames.size} file già presenti in DB.\n`);

    // STEP 2: Scansione
    const allFiles = getAllFiles(INPUT_DIR);
    const toProcess = allFiles.filter(fp => !existingFilenames.has(path.basename(fp)));
    
    console.log(`📂 File totali su disco: ${allFiles.length}`);
    console.log(`⏭️  Già in DB (skip):     ${allFiles.length - toProcess.length}`);
    console.log(`🆕 Da caricare:           ${toProcess.length}\n`);

    if (toProcess.length === 0) {
        console.log("✨ Tutto già vettorializzato! Niente da fare.");
        return;
    }

    // STEP 3: Elaborazione Batch
    const BATCH_SIZE = 20; // Gemini max per batchEmbedContents è spesso 100, ma 20 è più sicuro per payload lunghi
    let success = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batchFiles = toProcess.slice(i, i + BATCH_SIZE);
        console.log(`🔄 Processamento batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(toProcess.length/BATCH_SIZE)} (${batchFiles.length} file)...`);
        
        // Lettura e validazione dei file nel batch
        const batchData = [];
        for (const fullPath of batchFiles) {
            try {
                const fileName = path.basename(fullPath);
                const materia = fileName.startsWith('snciv') ? 'Diritto Civile' : (fileName.startsWith('snpen') ? 'Diritto Penale' : 'Generale');
                const textContent = fs.readFileSync(fullPath, 'utf8');
                
                // Esegue il linter per intercettare allucinazioni o difetti di struttura
                validateSheet(fullPath, textContent);
                
                const firstLine = textContent.split('\n')[0];
                const titolo = firstLine.startsWith('# ') ? firstLine.replace('# ', '').replace('[', '').replace(']', '').trim() : fileName.replace('.md', '');
                
                batchData.push({ fullPath, fileName, materia, textContent, titolo });
            } catch (err) {
                console.error(`\n❌ [LINTER BLOCKED] File "${path.basename(fullPath)}" scartato prima dell'ingestione: ${err.message}\n`);
                failed++;
            }
        }

        if (batchData.length === 0) {
            console.log("    ⏩ Tutti i file del batch sono stati scartati dal linter. Salto la vettorializzazione.");
            continue;
        }

        const textsToEmbed = batchData.map(d => d.textContent);
        const vectors = await getBatchEmbeddings(textsToEmbed);

        if (!vectors || vectors.length !== batchData.length) {
            console.log(`    ⚠️ Embedding fallito per il batch. Salto questi ${batchFiles.length} file.`);
            failed += batchFiles.length;
            continue;
        }

        // Inserimento su Supabase
        for (let j = 0; j < batchData.length; j++) {
            const { fileName, materia, textContent, titolo } = batchData[j];
            const vector = vectors[j];

            const { data: docData, error: docError } = await supabase
                .from('rag_documents')
                .insert([{ titolo, tipo: 'sentenza_ssuu', materia, filename: fileName, chunks_count: 1, status: 'completed' }])
                .select()
                .single();

            if (docError) {
                console.error(`    ❌ Errore DB doc ${fileName}:`, docError.message);
                failed++;
                continue;
            }

            const { error: chunkError } = await supabase
                .from('rag_chunks')
                .insert([{ document_id: docData.id, chunk_index: 1, content: textContent, materia, tipo: 'sentenza_ssuu', embedding: vector }]);

            if (chunkError) {
                console.error(`    ❌ Errore DB chunk ${fileName}:`, chunkError.message);
                failed++;
            } else {
                success++;
            }
        }
        
        console.log(`    ✅ Batch completato. (Successi parziali: ${success})`);
        
        // Pausa tra batch
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n✨ COMPLETATO! Caricati: ${success} | Falliti: ${failed}`);
}

main().catch(console.error);
