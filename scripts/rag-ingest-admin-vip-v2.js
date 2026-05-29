/**
 * INGESTIONE CDS/TAR VIP VELOCE & BATCH (V2)
 * 
 * Vettorializza ed inserisce le restanti 7.725 Schede VIP di Diritto Amministrativo
 * utilizzando Batch Embeddings di Gemini e Batch Inserts di Supabase.
 * Tipo: 'sentenza_vip' | Materia: 'Diritto Amministrativo'
 * 
 * Uso: node scripts/rag-ingest-admin-vip-v2.js [--limit=N] [--concurrency=C]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Caricamento variabili d'ambiente .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

// Parse degli argomenti CLI
const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency'));
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]) : 1; // Default 1 per batch sequential, ma possiamo aumentarlo

function generateUUID(name) {
    return crypto.createHash('sha256')
        .update(name)
        .digest('hex')
        .substring(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            results.push(...getFilesRecursive(full));
        } else if (entry.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

// Chiamata Batch Embedding con retry esponenziale
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
                    const wait = 10000 * attempt + Math.random() * 5000;
                    console.log(`\n⏳ [Gemini 429] Rate limit superato. Attesa di ${(wait / 1000).toFixed(1)}s (tentativo ${attempt}/${retries})...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${response.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === retries) {
                console.error(`\n❌ Batch Embedding fallito dopo ${retries} tentativi:`, e.message);
                return null;
            }
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    return null;
}

async function main() {
    console.log('========================================================');
    console.log('🚀 INGESTIONE RAPIDA & BATCH GA VIP (TAR/CDS) (V2)');
    console.log('========================================================\n');

    const INPUT_DIR = 'sentenze_admin_vip';
    const allFiles = getFilesRecursive(INPUT_DIR);
    console.log(`📂 Trovati ${allFiles.length} file totali nella directory locale.`);

    // 1. Filtra schede valide ed escludi gli scarti
    const validFiles = [];
    const uuidToPath = new Map();

    for (const f of allFiles) {
        const content = fs.readFileSync(f, 'utf8');
        if (!content.includes('[SCARTO_ASSOLUTO]') && content.length >= 500) {
            const fileName = path.basename(f);
            const docUuid = generateUUID(fileName);
            validFiles.push({ path: f, fileName, docUuid });
            uuidToPath.set(docUuid, f);
        }
    }
    console.log(`📋 Schede valide locali da considerare: ${validFiles.length}`);

    // 2. Controllo Idempotenza massivo per caricare solo i mancanti
    console.log('📡 Controllo dei file già presenti nel database RAG...');
    const uuids = Array.from(uuidToPath.keys());
    const existingUuids = new Set();
    const checkBatchSize = 200;

    for (let i = 0; i < uuids.length; i += checkBatchSize) {
        const batch = uuids.slice(i, i + checkBatchSize);
        const { data, error } = await supabase
            .from('rag_documents')
            .select('id')
            .in('id', batch)
            .eq('tipo', 'sentenza_vip');

        if (error) {
            console.error("❌ Errore durante il controllo di esistenza:", error.message);
            process.exit(1);
        }

        if (data) {
            data.forEach(d => existingUuids.add(d.id));
        }
        process.stdout.write(`   Controllati ${Math.min(i + checkBatchSize, uuids.length)} / ${uuids.length}\r`);
    }
    console.log(`\n✅ Trovati ${existingUuids.size} file già caricati nel database.`);

    // Filtra quelli da processare
    let toProcess = validFiles.filter(item => !existingUuids.has(item.docUuid));
    console.log(`🆕 Nuove schede da vettorializzare ed inserire: ${toProcess.length}`);

    if (toProcess.length === 0) {
        console.log('✨ Tutto il patrimonio locale risulta già allineato nel database! Niente da fare.');
        return;
    }

    // Applica eventuale limite CLI
    if (LIMIT < Infinity) {
        toProcess = toProcess.slice(0, LIMIT);
        console.log(`⚠️  Limite di elaborazione impostato a: ${LIMIT} schede.`);
    }

    // 3. Elaborazione a Batch
    const BATCH_SIZE = 10; // Ottimale per evitare rate limits Gemini, timeout DB e massimizzare la stabilità
    let successCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batchItems = toProcess.slice(i, i + BATCH_SIZE);
        
        // Lettura e pulizia dei file del batch
        const batchData = [];
        for (const item of batchItems) {
            try {
                const content = fs.readFileSync(item.path, 'utf8');
                const cleanContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
                
                // Estrazione titolo
                const lines = content.split('\n');
                const titoloLine = lines.find(l => l.startsWith('# ')) || '';
                const titolo = titoloLine.replace('# ', '').trim() || item.fileName;
                
                // Autore
                const autore = item.fileName.includes('cds') ? 'Consiglio di Stato' : 'TAR Lazio';

                batchData.push({
                    ...item,
                    cleanContent,
                    titolo,
                    autore
                });
            } catch (err) {
                console.error(`❌ Errore lettura file ${item.fileName}:`, err.message);
            }
        }

        if (batchData.length === 0) continue;

        // Vettorializzazione batch tramite Gemini API
        const textsToEmbed = batchData.map(d => d.cleanContent);
        const embeddings = await getBatchEmbeddings(textsToEmbed);

        if (!embeddings || embeddings.length !== batchData.length) {
            console.error(`\n⚠️  Vettorializzazione fallita per il lotto. Salto questo batch (${batchData.length} file).`);
            failCount += batchData.length;
            continue;
        }

        // Preparazione record da inserire in Supabase (Batch Insert)
        const docRows = [];
        const chunkRows = [];

        for (let j = 0; j < batchData.length; j++) {
            const dataItem = batchData[j];
            const embedding = embeddings[j];

            docRows.push({
                id: dataItem.docUuid,
                titolo: dataItem.titolo,
                materia: 'Diritto Amministrativo',
                tipo: 'sentenza_vip',
                autore: dataItem.autore,
                filename: dataItem.fileName,
                status: 'completed'
            });

            chunkRows.push({
                document_id: dataItem.docUuid,
                content: dataItem.cleanContent,
                chunk_index: 0,
                materia: 'Diritto Amministrativo',
                tipo: 'sentenza_vip',
                embedding: embedding
            });
        }

        // Inserimento Documenti in Supabase
        const { error: docsErr } = await supabase
            .from('rag_documents')
            .insert(docRows);

        if (docsErr && !docsErr.message.includes('duplicate')) {
            console.error(`\n❌ Errore DB durante l'inserimento batch dei documenti:`, docsErr.message);
            failCount += batchData.length;
            continue;
        }

        // Inserimento Chunk in Supabase
        const { error: chunksErr } = await supabase
            .from('rag_chunks')
            .insert(chunkRows);

        if (chunksErr) {
            console.error(`\n❌ Errore DB durante l'inserimento batch dei chunks:`, chunksErr.message);
            failCount += batchData.length;
            
            // Tenta rollback eliminando i documenti orfani appena inseriti in questo lotto
            const idsToDelete = docRows.map(r => r.id);
            await supabase.from('rag_documents').delete().in('id', idsToDelete);
            continue;
        }

        successCount += batchData.length;
        
        // Calcolo stime e velocità
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = successCount / elapsed; // file per secondo
        const remainingFiles = toProcess.length - successCount;
        const eta = remainingFiles / speed; // secondi rimanenti
        
        const etaMin = Math.floor(eta / 60);
        const etaSec = Math.floor(eta % 60);

        process.stdout.write(`\r🚀 Ingestiti: ${successCount} / ${toProcess.length} | Falliti: ${failCount} | Velocità: ${speed.toFixed(1)} sc/s | ETA: ${etaMin}m ${etaSec}s`);

        // Breve pausa anti-rate limit
        await new Promise(r => setTimeout(r, 600));
    }

    const totalElapsed = (Date.now() - startTime) / 1000;
    console.log(`\n\n========================================================`);
    console.log(`✨ INGESTIONE COMPLETATA!`);
    console.log(`   • Successi:  ${successCount}`);
    console.log(`   • Falliti:   ${failCount}`);
    console.log(`   • Tempo impiegato: ${(totalElapsed / 60).toFixed(1)} minuti`);
    console.log(`========================================================\n`);
}

main().catch(console.error);
