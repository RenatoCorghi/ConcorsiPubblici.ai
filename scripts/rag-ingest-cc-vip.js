/**
 * INGESTIONE CC VIP — CORTE COSTITUZIONALE
 * 
 * Carica le 420 Schede VIP Corte Costituzionale nel DB RAG.
 * Tipo: 'sentenza_cc_vip'
 * 
 * Uso: node scripts/rag-ingest-cc-vip.js [--limit=N]
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
    console.log('🚀 INGESTIONE CC VIP — Corte Costituzionale');
    
    const INPUT_DIR = path.resolve('./sentenze_corte_cost_vip');
    const files = fs.readdirSync(INPUT_DIR)
        .filter(f => f.endsWith('.md') && f.startsWith('cc_'))
        .sort();
    
    console.log(`Trovati ${files.length} file.`);
    
    const filesToProcess = LIMIT < Infinity ? files.slice(0, LIMIT) : files;
    console.log(`Processerò ${filesToProcess.length} file.\n`);

    let ingested = 0, skipped = 0, errors = 0;

    for (const file of filesToProcess) {
        try {
            const content = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
            
            // Skip scarti
            if (content.includes('[SCARTO_ASSOLUTO]') || content.length < 500) {
                skipped++;
                continue;
            }

            const docUuid = generateUUID('cc_vip_' + file);
            
            // Titolo dalla prima riga significativa
            const lines = content.split('\n').filter(l => l.trim());
            let titolo = lines[0]?.replace(/^#\s*/, '').replace(/^🧾\s*/, '').trim() || file;
            
            // Se il titolo non contiene "Corte Cost", aggiungilo
            if (!titolo.includes('Corte Cost') && !titolo.includes('CC')) {
                const ccMatch = file.match(/cc_(\d{4})_(\d+)/);
                if (ccMatch) titolo = `Corte Cost., Sent. n. ${parseInt(ccMatch[2])}/${ccMatch[1]} — ${titolo.substring(0, 80)}`;
            }

            // Estrai materia dai tag o dal contenuto
            let materia = 'Diritto Costituzionale';
            if (content.includes('penale') || content.includes('#DirittoPenale')) materia = 'Diritto Penale';
            else if (content.includes('tributar') || content.includes('#Tributario')) materia = 'Diritto Tributario';
            else if (content.includes('lavor') || content.includes('#DirittoDelLavoro')) materia = 'Diritto del Lavoro';
            else if (content.includes('amministrativ') || content.includes('#DirAmministrativo')) materia = 'Diritto Amministrativo';

            // Idempotenza
            const { data: exists } = await supabase
                .from('rag_chunks')
                .select('id')
                .eq('document_id', docUuid)
                .limit(1)
                .single();

            if (exists) { skipped++; continue; }

            // Inserisci documento padre
            const { error: docErr } = await supabase.from('rag_documents').insert({
                id: docUuid,
                titolo: titolo,
                materia: materia,
                tipo: 'sentenza_cc_vip',
                autore: 'Corte Costituzionale',
                filename: file,
                status: 'completed'
            });
            if (docErr && !docErr.message.includes('duplicate')) {
                throw new Error(`Doc: ${docErr.message}`);
            }

            // Genera embedding
            const embedding = await getEmbedding(content.substring(0, 8000));

            // Inserisci chunk
            const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                document_id: docUuid,
                content: content,
                chunk_index: 0,
                materia: materia,
                tipo: 'sentenza_cc_vip',
                embedding: embedding
            });
            
            if (chunkErr) {
                if (chunkErr.code === '23505') { skipped++; continue; }
                throw new Error(`Chunk: ${chunkErr.message}`);
            }

            ingested++;
            if (ingested % 50 === 0) {
                console.log(`✅ ${ingested} ingerite | ${skipped} skipped | ${errors} errori`);
            }

            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            errors++;
            if (errors <= 10) console.error(`❌ ${file}: ${e.message}`);
            if (e.message.includes('429') || e.message.includes('quota')) {
                console.log('⏳ Rate limit, attesa 10s...');
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
