/**
 * INGESTIONE SEZIONI SEMPLICI VIP
 * 
 * Carica le Schede VIP delle Sezioni Semplici dalla cartella sentenze_sez_semplici_vip/
 * nel database RAG con tipo 'giurisprudenza_sez_semplici'.
 * 
 * Uso: node scripts/rag-ingest-sezioni-semplici-vip.js [--limit N]
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

// Parse --limit flag
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

async function main() {
    console.log('🚀 INGESTIONE SEZIONI SEMPLICI VIP');
    
    const allFiles = getFilesRecursive('sentenze_sez_semplici_vip');
    console.log(`Trovati ${allFiles.length} file totali.`);
    
    // Filtriamo i file che sono marcati come scarto per non ingurgitarli nel RAG
    const validFiles = allFiles.filter(file => {
        const content = fs.readFileSync(file, 'utf8');
        return !content.includes('[SCARTO_ASSOLUTO]');
    });
    
    console.log(`Filtrati: ${validFiles.length} schede valide su ${allFiles.length} totali.`);
    
    const filesToProcess = LIMIT < Infinity 
        ? validFiles.slice(0, LIMIT)
        : validFiles;
    console.log(`Processerò ${filesToProcess.length} file (limit: ${LIMIT < Infinity ? LIMIT : 'nessuno'}).\n`);

    let ingested = 0, skipped = 0, errors = 0;

    for (const file of filesToProcess) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const fileName = path.basename(file);
            const docUuid = generateUUID(fileName);
            
            // Titolo dalla prima riga
            const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
            const titolo = firstLine || fileName;
            
            // Materia
            let materia = 'Giurisprudenza Civile';
            if (fileName.startsWith('snpen') || content.includes('#SezioniSempliciPenali')) {
                materia = 'Giurisprudenza Penale';
            }

            // Verifica se già esiste (idempotenza)
            const { data: exists } = await supabase
                .from('rag_chunks')
                .select('id')
                .eq('document_id', docUuid)
                .limit(1)
                .single();

            if (exists) {
                skipped++;
                continue;
            }

            // Crea documento padre
            const { error: docErr } = await supabase.from('rag_documents').insert({
                id: docUuid,
                titolo: titolo,
                materia: materia,
                tipo: 'sentenza_sez_semplici_vip',
                autore: 'Corte di Cassazione',
                filename: fileName,
                status: 'completed'
            });
            // Ignora errore duplicato sul documento
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
                tipo: 'giurisprudenza_sez_semplici',
                embedding: embedding
            });
            
            if (chunkErr) {
                if (chunkErr.code === '23505') { skipped++; continue; }
                throw new Error(`Chunk: ${chunkErr.message}`);
            }

            ingested++;
            if (ingested % 10 === 0 || ingested === filesToProcess.length) {
                console.log(`✅ ${ingested} ingerite | ${skipped} skipped | ${errors} errori`);
            }

            await new Promise(r => setTimeout(r, 400));

        } catch (e) {
            errors++;
            if (errors <= 10) console.error(`❌ ${path.basename(file)}: ${e.message}`);
        }
    }

    console.log(`\n═══ RISULTATO INGESTIONE ═══`);
    console.log(`✅ Ingerite: ${ingested}`);
    console.log(`⏩ Skipped:  ${skipped}`);
    console.log(`❌ Errori:   ${errors}`);
    console.log(`📊 Totale:   ${filesToProcess.length}`);
}

main();
