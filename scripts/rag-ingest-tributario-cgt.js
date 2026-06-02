/**
 * INGESTIONE RAG — VIP SCHEDE GIUSTIZIA TRIBUTARIA (CGT)
 * 
 * Carica le Schede VIP dei provvedimenti CGT (cgt_*.md) dalla cartella schede_tributario_vip/
 * nel database RAG.
 * 
 * Documenti: tipo: 'sentenza_cgt_vip', materia: 'Diritto Tributario', autore: 'Corte di Giustizia Tributaria'
 * Chunks:    tipo: 'giurisprudenza_tributaria', materia: 'Diritto Tributario'
 * 
 * Uso:
 *   node scripts/rag-ingest-tributario-cgt.js [--limit=N] [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateSheet } from './lint_vip_sheets.mjs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

// Parse flags
const limitArg = process.argv.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;
const DRY_RUN = process.argv.includes('--dry-run');

const BASE_DIR = 'data/schede_tributario_vip';

function generateUUID(name) {
    return crypto.createHash('sha256')
        .update(name)
        .digest('hex')
        .substring(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

async function getEmbedding(text) {
    if (DRY_RUN) return new Array(768).fill(0);
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text }] },
                outputDimensionality: 768
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await res.json();
        if (!data.embedding) throw new Error("Embedding fallito: " + JSON.stringify(data));
        return data.embedding.values;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

async function main() {
    console.log('🚀 INGESTIONE CGT VIP — Corti di Giustizia Tributaria');
    if (DRY_RUN) console.log('⚠️ MODALITÀ DRY-RUN ATTIVA — Nessuna modifica al database, nessun costo embedding.');

    if (!fs.existsSync(BASE_DIR)) {
        console.error(`❌ Cartella ${BASE_DIR} non trovata!`);
        return;
    }

    // Trova file cgt_*.md direttamente nella root di BASE_DIR
    const files = fs.readdirSync(BASE_DIR)
        .filter(f => f.startsWith('cgt_') && f.endsWith('.md'))
        .sort();

    console.log(`Trovate ${files.length} schede CGT VIP nella root di ${BASE_DIR}.`);

    // Filtriamo gli scarti
    const validFiles = [];
    for (const f of files) {
        const content = fs.readFileSync(path.join(BASE_DIR, f), 'utf8');
        if (content.includes('[SCARTO_ASSOLUTO]')) {
            continue;
        }
        validFiles.push(f);
    }

    console.log(`Filtrati: ${validFiles.length} file validi su ${files.length} totali.`);
    
    const filesToProcess = LIMIT < Infinity ? validFiles.slice(0, LIMIT) : validFiles;
    console.log(`Processerò ${filesToProcess.length} file.\n`);

    let ingested = 0, skipped = 0, errors = 0;

    for (const file of filesToProcess) {
        const filePath = path.join(BASE_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Valida la scheda VIP con il linter strutturale
            validateSheet(filePath, content);
            
            const docUuid = generateUUID('cgt_vip_' + file);

            // Estrazione titolo da "Pronuncia" nei metadati
            let titolo = '';
            const pronunciaMatch = content.match(/\*\*Pronuncia\*\*:\s*([^\r\n]+)/i) || content.match(/\*.*?Pronuncia.*?:\s*([^\r\n]+)/i);
            if (pronunciaMatch) {
                titolo = pronunciaMatch[1].trim()
                    .replace(/\*\*+/g, '') // rimuove grassetti residui
                    .replace(/[\*\[\]]/g, '') // rimuove caratteri speciali md
                    .trim();
            }

            if (!titolo) {
                // Fallback: prima riga
                const firstLine = content.split('\n')[0].replace(/^#\s*/, '').replace(/^🧾\s*/, '').trim();
                titolo = firstLine || file;
            }

            // Pulisce punteggiatura finale se presente
            if (titolo.endsWith('.')) titolo = titolo.slice(0, -1);

            // Estrazione dell'anno (anno) della sentenza
            let anno = null;
            try {
                // Prova a leggere l'anno dal file di testo sorgente pdf_{id}.md
                const sourceFileName = file.replace('cgt_', 'pdf_');
                const sourceFilePath = path.join('data', 'tributario_testi', sourceFileName);
                if (fs.existsSync(sourceFilePath)) {
                    const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');
                    const dataMatch = sourceContent.match(/-\s+\*\*Data\*\*:\s*\d{2}\/\d{2}\/(\d{4})/i);
                    if (dataMatch) {
                        anno = parseInt(dataMatch[1].trim());
                    }
                }
                
                // Fallback: cerca nel contenuto della scheda VIP
                if (!anno) {
                    const pronMatch = content.match(/\*\*Pronuncia\*\*:\s*[^\r\n]*?(\d{4})/i) || content.match(/\*.*?Pronuncia.*?:\s*[^\r\n]*?(\d{4})/i);
                    if (pronMatch) {
                        anno = parseInt(pronMatch[1].trim());
                    }
                }
                
                // Secondo fallback: cerca un anno generico
                if (!anno) {
                    const anyYearMatch = content.match(/\b(2024|2025|2026)\b/);
                    if (anyYearMatch) {
                        anno = parseInt(anyYearMatch[1].trim());
                    }
                }
            } catch (errYear) {
                console.warn(`   ⚠️ Errore estrazione anno: ${errYear.message}`);
            }

            console.log(`📄 [FILE] ${file}`);
            console.log(`   ⚖️ [TITOLO] ${titolo}`);
            if (anno) console.log(`   📅 [ANNO] ${anno}`);

            if (!DRY_RUN) {
                // Verifica idempotenza
                const { data: exists } = await supabase
                    .from('rag_chunks')
                    .select('id')
                    .eq('document_id', docUuid)
                    .limit(1)
                    .single();

                if (exists) {
                    // Backport dell'anno se mancante in rag_documents
                    const { data: docData } = await supabase
                        .from('rag_documents')
                        .select('anno')
                        .eq('id', docUuid)
                        .single();
                        
                    if (docData && docData.anno === null && anno !== null) {
                        console.log(`   🔄 Aggiorno l'anno mancante in rag_documents a ${anno}...`);
                        await supabase
                            .from('rag_documents')
                            .update({ anno: anno })
                            .eq('id', docUuid);
                    }

                    console.log(`   ⏩ Già presente nel database. Salto.`);
                    skipped++;
                    continue;
                }

                // Inserimento Documento
                const { error: docErr } = await supabase.from('rag_documents').insert({
                    id: docUuid,
                    titolo: titolo,
                    materia: 'Diritto Tributario',
                    tipo: 'sentenza_cgt_vip',
                    autore: 'Corte di Giustizia Tributaria',
                    filename: file,
                    anno: anno,
                    status: 'completed'
                });

                if (docErr && !docErr.message.includes('duplicate')) {
                    throw new Error(`Doc Error: ${docErr.message}`);
                }

                // Generazione Embedding (primi 8000 caratteri)
                const embedding = await getEmbedding(content.substring(0, 8000));

                // Inserimento Chunk (relazione 1:1 come tutte le schede VIP)
                const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                    document_id: docUuid,
                    content: content,
                    chunk_index: 0,
                    materia: 'Diritto Tributario',
                    tipo: 'giurisprudenza_tributaria',
                    embedding: embedding
                });

                if (chunkErr) {
                    if (chunkErr.code === '23505') {
                        console.log(`   ⏩ Chunk già esistente. Salto.`);
                        skipped++;
                        continue;
                    }
                    throw new Error(`Chunk Error: ${chunkErr.message}`);
                }

                console.log(`   ✅ Ingerito con successo!`);
            } else {
                console.log(`   🧪 (Dry-run) Ingestione simulata per UUID: ${docUuid}`);
            }

            ingested++;
            await new Promise(r => setTimeout(r, DRY_RUN ? 50 : 350));

        } catch (e) {
            errors++;
            console.error(`   ❌ Errore durante l'elaborazione di ${file}:`, e.message);
            if (e.message.includes('429') || e.message.includes('quota')) {
                console.log('   ⏳ Rilevato rate limit. Attesa 15s...');
                await new Promise(r => setTimeout(r, 15000));
            }
        }
    }

    console.log(`\n═══ RESOCONTO INGESTIONE CGT ═══`);
    console.log(`✅ Ingeriti con successo: ${ingested}`);
    console.log(`⏩ Saltati (già presenti): ${skipped}`);
    console.log(`❌ Errori riscontrati:    ${errors}`);
    console.log(`📊 File totali analizzati: ${filesToProcess.length}`);
    console.log(`═`.repeat(32));
}

main().catch(console.error);
