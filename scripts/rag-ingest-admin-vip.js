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
            content: { parts: [{ text: text.substring(0, 8000) }] },
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
    console.log('🚀 INGESTIONE ADMIN VIP (TAR/CDS)');
    
    const INPUT_DIR = 'sentenze_admin_vip';
    const allFiles = getFilesRecursive(INPUT_DIR);
    console.log(`Trovati ${allFiles.length} file totali.`);
    
    const filesToProcess = LIMIT < Infinity 
        ? allFiles.slice(0, LIMIT)
        : allFiles;
    console.log(`Processerò ${filesToProcess.length} file (limit: ${LIMIT < Infinity ? LIMIT : 'nessuno'}).\n`);

    let ingested = 0, skipped = 0, errors = 0;

    for (const file of filesToProcess) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            if (content.includes('[SCARTO_ASSOLUTO]')) {
                skipped++;
                continue;
            }

            const fileName = path.basename(file);
            const docUuid = generateUUID(fileName);
            
            // Estrai titolo e metadati base
            const lines = content.split('\n');
            const titoloLine = lines.find(l => l.startsWith('# ')) || '';
            const titolo = titoloLine.replace('# ', '').trim() || fileName;

            // Verifica se già esiste nel DB (per idempotenza usiamo rag_documents.id)
            const { data: exists } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('id', docUuid)
                .maybeSingle();

            if (exists) {
                skipped++;
                continue;
            }

            // Inserisci documento padre
            const { error: docErr } = await supabase.from('rag_documents').insert({
                id: docUuid,
                titolo: titolo,
                materia: 'Diritto Amministrativo',
                tipo: 'sentenza_vip',
                autore: fileName.includes('cds') ? 'Consiglio di Stato' : 'TAR Lazio',
                filename: fileName,
                status: 'completed'
            });

            if (docErr) throw new Error(`Doc: ${docErr.message}`);

            // Genera embedding della scheda pulita
            const cleanContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
            const embedding = await getEmbedding(cleanContent);

            // Inserisci chunk
            const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                document_id: docUuid,
                content: cleanContent,
                chunk_index: 0,
                materia: 'Diritto Amministrativo',
                tipo: 'sentenza_vip',
                embedding: embedding
            });
            
            if (chunkErr) throw new Error(`Chunk: ${chunkErr.message}`);

            ingested++;
            if (ingested % 10 === 0) {
                process.stdout.write(`\r✅ ${ingested} ingerite | ${skipped} skipped | ${errors} errori`);
            }

            await new Promise(r => setTimeout(r, 200)); // Rate limit gentile

        } catch (e) {
            errors++;
            console.error(`\n❌ ${path.basename(file)}: ${e.message}`);
        }
    }

    console.log(`\n\n═══ RISULTATO ═══`);
    console.log(`✅ Ingerite: ${ingested}`);
    console.log(`⏩ Skipped:  ${skipped}`);
    console.log(`❌ Errori:   ${errors}`);
}

main();
