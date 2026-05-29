/**
 * INGESTIONE GA MASSIVO (TIER 2)
 * 
 * Legge direttamente da `provvedimenti_ga` la colonna `testo_completo` 
 * ed esegue chunking + embedding saltando la generazione VIP.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Caricamento .env ──
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

// ── Costanti ──
const BATCH_SIZE = 20;        
const CHUNK_MAX_CHARS = 6000; 
const CHUNK_OVERLAP = 300;    
const MIN_FILE_SIZE = 500;    

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
const sedeArg = args.find(a => a.startsWith('--sede='));
const SEDE = sedeArg ? sedeArg.split('=')[1] : null;

function generateUUID(name) {
    return crypto.createHash('sha256')
        .update(name)
        .digest('hex')
        .substring(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

function createChunks(text, maxChars, overlap) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let end = i + maxChars;
        if (end < text.length) {
            const nextSpace = text.indexOf(' ', end);
            const prevSpace = text.lastIndexOf(' ', end);
            if (nextSpace !== -1 && nextSpace - end < 100) end = nextSpace;
            else if (prevSpace !== -1 && end - prevSpace < 100) end = prevSpace;
        }
        chunks.push(text.substring(i, end).trim());
        i = end - overlap;
        if (i < 0) break;
    }
    return chunks;
}

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
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${response.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === retries) return null;
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    return null;
}

async function processRecord(record) {
    const docUuid = generateUUID('ga_massivo_' + record.id);
    
    const text = record.testo_completo;
    if (!text || text.length < MIN_FILE_SIZE) {
        return { status: 'scartata_troppo_corta' };
    }

    const chunks = createChunks(text, CHUNK_MAX_CHARS, CHUNK_OVERLAP);
    const titolo = `${record.tipo_provvedimento} n. ${record.numero_provvedimento}/${record.anno_pubblicazione} — ${record.sede_nome}`;

    // Documento
    const { error: docErr } = await supabase.from('rag_documents').insert({
        id: docUuid,
        titolo: titolo,
        materia: 'Diritto Amministrativo',
        tipo: 'sentenza_admin',
        autore: record.sede_nome,
        filename: `DB_PROVVEDIMENTI_GA_${record.id}`,
        status: 'completed'
    });

    if (docErr && !docErr.message.includes('duplicate')) {
        return { status: 'error', error: docErr.message };
    }

    // Embedding Batch
    let totalChunks = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const enrichedBatch = batch.map((c, idx) => 
            `[${titolo} - P. ${i + idx + 1}/${chunks.length}]\n\n${c}`
        );

        const embeddings = await getBatchEmbeddings(enrichedBatch);
        if (!embeddings) {
            return { status: 'error', error: 'Embeddings failed' };
        }

        const chunksToInsert = batch.map((content, idx) => ({
            document_id: docUuid,
            content: enrichedBatch[idx],
            chunk_index: i + idx,
            materia: 'Diritto Amministrativo',
            tipo: 'sentenza_admin',
            embedding: embeddings[idx]
        }));

        const { error: chunkErr } = await supabase.from('rag_chunks').insert(chunksToInsert);
        if (chunkErr) {
            return { status: 'error', error: chunkErr.message };
        }
        totalChunks += batch.length;
    }

    return { status: 'ok', chunks: totalChunks };
}

async function main() {
    console.log(`🚀 Avvio INGESTIONE GA MASSIVO (Tier 2)`);
    if (SEDE) console.log(`   Sede: ${SEDE}`);
    
    let offset = 0;
    const fetchLimit = 1000;
    let processed = 0, skipped = 0, short = 0, errors = 0;

    let query = supabase
        .from('provvedimenti_ga')
        .select('id, tipo_provvedimento, sede_nome, numero_provvedimento, anno_pubblicazione')
        .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE'])
        .eq('importance_tier', 'TIER_2');

    if (SEDE) query = query.eq('sede_slug', SEDE);

    while (processed + skipped + short + errors < LIMIT) {
        console.log(`\n📡 Fetching batch da ${offset} a ${offset + fetchLimit - 1}...`);
        const { data, error } = await query.range(offset, offset + fetchLimit - 1);
        
        if (error) {
            console.error(`❌ Errore fetch DB:`, error);
            break;
        }
        
        if (!data || data.length === 0) {
            console.log(`✅ Finito! Nessun altro record trovato.`);
            break;
        }

        const batchSize = Math.min(data.length, LIMIT - (processed + skipped + short + errors));
        for (let i = 0; i < batchSize; i++) {
            const basicRecord = data[i];
            
            // Controlla se esiste già
            const docUuid = generateUUID('ga_massivo_' + basicRecord.id);
            const { data: existingDoc } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('id', docUuid)
                .single();
                
            if (existingDoc) {
                skipped++;
                continue;
            }

            // Fetch testo_completo one by one to avoid timeout
            const { data: fullRecord, error: fullErr } = await supabase
                .from('provvedimenti_ga')
                .select('testo_completo')
                .eq('id', basicRecord.id)
                .single();

            if (fullErr) {
                errors++;
                console.error(`❌ Errore fetch testo per ${basicRecord.id}`);
                continue;
            }
            if (!fullRecord || !fullRecord.testo_completo) {
                skipped++; // Manca testo completo
                continue;
            }

            const recordToProcess = { ...basicRecord, testo_completo: fullRecord.testo_completo };
            const res = await processRecord(recordToProcess);

            if (res.status === 'skipped') skipped++;
            else if (res.status === 'scartata_troppo_corta') short++;
            else if (res.status === 'error') {
                errors++;
                console.error(`❌ Errore record ${basicRecord.id}: ${res.error}`);
            }
            else if (res.status === 'ok') {
                processed++;
                process.stdout.write(`✅ `);
            }
        }

        console.log(`\n📊 Statistiche: ${processed} ingerite, ${skipped} skipped, ${short} scartate (corte), ${errors} errori`);
        offset += fetchLimit;
    }
}

main().catch(console.error);
