/**
 * INGESTIONE CdS/TAR VIP — Giustizia Amministrativa
 * 
 * Carica le Schede VIP CdS/TAR nel DB RAG.
 * Tipo: 'sentenza_admin_vip'
 * 
 * Uso: node scripts/rag-ingest-admin-mancanti-vip.js [--limit=N]
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
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

function generateUUID(name) {
    return crypto.createHash('sha256')
        .update(name)
        .digest('hex')
        .substring(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

async function getEmbedding(text) {
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
}

async function main() {
    console.log('🚀 INGESTIONE CdS/TAR VIP — Admin Mancanti');
    
    const INPUT_DIR = path.resolve('./sentenze_admin_mancanti_vip');
    if (!fs.existsSync(INPUT_DIR)) {
        console.log('❌ Directory non trovata:', INPUT_DIR);
        process.exit(1);
    }
    
    const files = fs.readdirSync(INPUT_DIR)
        .filter(f => f.endsWith('.md') && (f.startsWith('CdS_') || f.startsWith('TAR_') || f.startsWith('tar-')))
        .sort();
    
    console.log(`Trovati ${files.length} file.`);
    
    const filesToProcess = LIMIT < Infinity ? files.slice(0, LIMIT) : files;
    console.log(`Processerò ${filesToProcess.length} file.\n`);

    let ingested = 0, skipped = 0, errors = 0;

    for (const file of filesToProcess) {
        try {
            const content = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
            
            // Skip scarti o file troppo piccoli
            if (content.includes('[SCARTO_ASSOLUTO]') || content.length < 500) {
                skipped++;
                continue;
            }

            const docUuid = generateUUID('admin_vip_' + file);
            
            // Titolo
            const lines = content.split('\n').filter(l => l.trim());
            let titolo = lines[0]?.replace(/^#\s*/, '').replace(/^🧾\s*/, '').trim() || file;
            
            const match = file.match(/(CdS|TAR|tar)[_-](?:[\w-]+_)?(\d{4})_(\d+)/i);
            if (match && !titolo.includes('Cons. Stato') && !titolo.includes('TAR')) {
                const corte = match[1].toUpperCase() === 'CDS' ? 'Cons. Stato' : 'TAR';
                titolo = `${corte}, Sent. n. ${match[3]}/${match[2]} — ${titolo.substring(0, 80)}`;
            }

            // Materia
            let materia = 'Diritto Amministrativo';
            if (content.includes('#Appalti') || content.includes('appalti')) materia = 'Diritto Amministrativo — Appalti';
            else if (content.includes('#Urbanistica')) materia = 'Diritto Amministrativo — Urbanistica';

            // Idempotenza
            const { data: exists } = await supabase
                .from('rag_chunks')
                .select('id')
                .eq('document_id', docUuid)
                .limit(1)
                .single();

            if (exists) { skipped++; continue; }

            // Documento padre
            const { error: docErr } = await supabase.from('rag_documents').insert({
                id: docUuid,
                titolo: titolo,
                materia: materia,
                tipo: 'sentenza_admin_vip',
                autore: match?.[1].toUpperCase() === 'CDS' ? 'Consiglio di Stato' : 'TAR',
                filename: file,
                status: 'completed'
            });
            if (docErr && !docErr.message.includes('duplicate')) {
                throw new Error(`Doc: ${docErr.message}`);
            }

            // Embedding
            const embedding = await getEmbedding(content.substring(0, 8000));

            // Chunk
            const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                document_id: docUuid,
                content: content,
                chunk_index: 0,
                materia: materia,
                tipo: 'sentenza_admin_vip',
                embedding: embedding
            });
            
            if (chunkErr) {
                if (chunkErr.code === '23505') { skipped++; continue; }
                throw new Error(`Chunk: ${chunkErr.message}`);
            }

            ingested++;
            if (ingested % 25 === 0) {
                console.log(`✅ ${ingested} ingerite | ${skipped} skipped | ${errors} errori`);
            }
            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            errors++;
            if (errors <= 10) console.error(`❌ ${file}: ${e.message}`);
            if (e.message.includes('429') || e.message.includes('quota')) {
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    }

    console.log(`\n═══ RISULTATO ═══`);
    console.log(`✅ Ingerite: ${ingested}`);
    console.log(`⏩ Skipped:  ${skipped}`);
    console.log(`❌ Errori:   ${errors}`);
    console.log(`📊 Totale:   ${filesToProcess.length}`);
}

main();
