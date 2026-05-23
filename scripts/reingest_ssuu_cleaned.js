/**
 * RE-INGEST SS.UU. VIP BONIFICATE
 * 
 * Per le 488 schede VIP che sono state bonificate da PII,
 * cancella i vecchi chunk dal DB e re-ingerisce il testo pulito.
 * 
 * Uso: node scripts/reingest_ssuu_cleaned.js [--limit N]
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
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text }] },
                    outputDimensionality: 768
                })
            });
            const data = await res.json();
            if (!data.embedding) throw new Error("Embedding fallito: " + JSON.stringify(data));
            return data.embedding.values;
        } catch (e) {
            if (i < retries - 1) {
                console.log(`   ⏳ Retry embedding (${i + 1}/${retries})...`);
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            } else throw e;
        }
    }
}

async function main() {
    console.log('🔄 RE-INGEST SS.UU. VIP BONIFICATE');
    console.log('='.repeat(60));

    // Carica la lista dei file da ri-processare dal report PII
    const reportPath = path.resolve('./pii_scan_ssuu_report.json');
    let filesToProcess;

    if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        filesToProcess = report.map(r => path.join('sentenze_ssuu_vip', r.file));
        console.log(`📋 Report caricato: ${filesToProcess.length} file da ri-ingerire.`);
    } else {
        console.log('⚠️  Nessun report trovato. Usa prima scan_ssuu_pii.js');
        process.exit(1);
    }

    if (LIMIT < Infinity) {
        filesToProcess = filesToProcess.slice(0, LIMIT);
        console.log(`🔢 Limitato a ${LIMIT} file.`);
    }

    let updated = 0, errors = 0;

    for (const file of filesToProcess) {
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) continue;

        const fileName = path.basename(filePath);
        const docUuid = generateUUID(fileName);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
            const titolo = firstLine || fileName;

            let materia = 'Giurisprudenza Civile';
            if (fileName.startsWith('snpen')) materia = 'Giurisprudenza Penale';

            // 0. Assicura che il documento padre esista (upsert)
            await supabase.from('rag_documents').upsert({
                id: docUuid,
                titolo: titolo,
                materia: materia,
                tipo: 'sentenza_ssuu_vip',
                autore: 'Corte di Cassazione',
                filename: fileName,
                status: 'completed'
            }, { onConflict: 'id' });

            // 1. Cancella vecchi chunk per questo documento
            const { error: delChunkErr } = await supabase
                .from('rag_chunks')
                .delete()
                .eq('document_id', docUuid);
            
            if (delChunkErr) console.log(`   ⚠️  Errore delete chunk ${fileName}: ${delChunkErr.message}`);

            // 2. Genera nuovo embedding con testo pulito
            const embedding = await getEmbedding(content.substring(0, 8000));

            // 3. Inserisci chunk aggiornato
            const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                document_id: docUuid,
                content: content,
                chunk_index: 0,
                materia: materia,
                tipo: 'nomofilachia_ssuu',
                embedding: embedding
            });

            if (chunkErr) throw new Error(`Chunk insert: ${chunkErr.message}`);

            updated++;
            if (updated % 25 === 0) {
                console.log(`✅ ${updated}/${filesToProcess.length} ri-ingeriti`);
            }

            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            errors++;
            if (errors <= 10) console.error(`❌ ${fileName}: ${e.message}`);
            if (e.message.includes('429') || e.message.includes('quota')) {
                console.log('⏳ Rate limit, attesa 30s...');
                await new Promise(r => setTimeout(r, 30000));
            }
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RISULTATI RE-INGEST:`);
    console.log(`   Aggiornati: ${updated}`);
    console.log(`   Errori:     ${errors}`);
    console.log(`   Totale:     ${filesToProcess.length}`);
}

main();
