/**
 * RE-INGEST MASSIVO SS.UU. VIP
 * 
 * Cancella e re-inserisce TUTTI i chunk SS.UU. VIP nel DB
 * con il testo bonificato. Processa solo i file che hanno
 * un chunk esistente nel DB (per non creare duplicati di file
 * che non erano mai stati ingeriti).
 * 
 * Uso: node scripts/reingest_ssuu_all.js [--limit N]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;

function generateUUID(name) {
    return crypto.createHash('sha256')
        .update(name).digest('hex').substring(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

async function getEmbedding(text, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text }] },
                    outputDimensionality: 768
                })
            });
            const data = await res.json();
            if (!data.embedding) throw new Error("Embedding fallito: " + JSON.stringify(data).substring(0, 200));
            return data.embedding.values;
        } catch (e) {
            if (i < retries - 1) {
                const wait = 3000 * (i + 1);
                console.log(`   ⏳ Retry embedding (${i+1}/${retries}), attesa ${wait/1000}s...`);
                await new Promise(r => setTimeout(r, wait));
            } else throw e;
        }
    }
}

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...getFilesRecursive(full));
        else if (entry.name.endsWith('.md')) results.push(full);
    }
    return results;
}

async function main() {
    console.log('🔄 RE-INGEST MASSIVO SS.UU. VIP (testo bonificato)');
    console.log('='.repeat(60));

    // 1. Prendi tutti i document_id dal DB con tipo ssuu
    console.log('📡 Recupero lista documenti SS.UU. dal database...');
    const { data: dbDocs, error: dbErr } = await supabase
        .from('rag_documents')
        .select('id, filename')
        .eq('tipo', 'sentenza_ssuu_vip');

    if (dbErr) { console.error('Errore DB:', dbErr.message); process.exit(1); }
    console.log(`   Trovati ${dbDocs.length} documenti SS.UU. nel DB.\n`);

    // 2. Per ciascuno, trova il file locale bonificato
    const toProcess = [];
    for (const doc of dbDocs) {
        // Cerca il file locale corrispondente
        const allFiles = getFilesRecursive('sentenze_ssuu_vip');
        const localFile = allFiles.find(f => path.basename(f) === doc.filename);
        if (localFile) {
            toProcess.push({ docId: doc.id, filename: doc.filename, localPath: localFile });
        }
    }

    console.log(`📁 ${toProcess.length} file locali trovati da ri-ingerire.`);

    let filesToProcess = LIMIT < Infinity ? toProcess.slice(0, LIMIT) : toProcess;
    if (LIMIT < Infinity) console.log(`🔢 Limitato a ${LIMIT} file.`);
    console.log('');

    let updated = 0, errors = 0, skipped = 0;

    for (const { docId, filename, localPath } of filesToProcess) {
        try {
            const content = fs.readFileSync(localPath, 'utf8');

            // Cancella vecchi chunk
            await supabase.from('rag_chunks').delete().eq('document_id', docId);

            // Genera nuovo embedding
            const embedding = await getEmbedding(content.substring(0, 8000));

            // Materia
            let materia = 'Giurisprudenza Civile';
            if (filename.startsWith('snpen')) materia = 'Giurisprudenza Penale';

            // Inserisci chunk pulito
            const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                document_id: docId,
                content: content,
                chunk_index: 0,
                materia: materia,
                tipo: 'nomofilachia_ssuu',
                embedding: embedding
            });

            if (chunkErr) throw new Error(chunkErr.message);

            updated++;
            if (updated % 50 === 0 || updated === 1) {
                console.log(`✅ ${updated}/${filesToProcess.length} aggiornati (${errors} errori)`);
            }

            await new Promise(r => setTimeout(r, 200));

        } catch (e) {
            errors++;
            if (errors <= 10) console.error(`❌ ${filename}: ${e.message.substring(0, 100)}`);
            if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('503')) {
                console.log('⏳ Rate limit, attesa 30s...');
                await new Promise(r => setTimeout(r, 30000));
            }
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RISULTATI RE-INGEST MASSIVO:`);
    console.log(`   ✅ Aggiornati: ${updated}`);
    console.log(`   ❌ Errori:     ${errors}`);
    console.log(`   📊 Totale:     ${filesToProcess.length}`);
}

main();
