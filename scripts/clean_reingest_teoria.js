/**
 * CLEAN & RE-INGEST TEORIA
 * 
 * Questo script:
 * 1. Cancella tutti i chunk di tipo 'teoria_massimario' dal DB (quelli inquinati)
 * 2. Ri-splitta TUTTI i file delle riviste VIP (non solo quelli prioritari)
 * 3. Pulisce ogni scheda da <thinking> e contenuto irrilevante
 * 4. Re-ingerisce ogni scheda come chunk singolo con embedding pulito
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

// ── Utilities ──────────────────────────────────────────────

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
        } else if (entry.endsWith('.md') || entry.endsWith('.txt')) {
            results.push(full);
        }
    }
    return results;
}

/**
 * Pulisce il contenuto di una scheda:
 * - Rimuove blocchi <thinking>...</thinking>
 * - Rimuove righe "Fonte ispiratrice: Rielaborazione..."
 * - Trimma whitespace
 */
function cleanCardContent(raw) {
    return raw
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/^Fonte ispiratrice:.*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Splitta un file multi-topic in schede singole.
 * Ogni scheda inizia con "🧾 METADATI RAG"
 */
function splitIntoCards(content) {
    // Split su "🧾 METADATI RAG" (con eventuale --- prima)
    const parts = content.split(/(?:---\s*\n\s*)?🧾\s*METADATI\s*RAG/i);
    
    const cards = [];
    for (const part of parts) {
        const cleaned = cleanCardContent(part);
        if (cleaned.length < 150) continue; // Troppo corto, skip
        
        // Ricostruisci l'header
        const card = '🧾 METADATI RAG\n' + cleaned;
        
        // Estrai l'istituto principale come titolo
        const istitutoMatch = card.match(/\*\s*Istituto Principale:\s*(.+)/i);
        const titolo = istitutoMatch 
            ? istitutoMatch[1].replace(/\*+/g, '').trim()
            : null;
        
        // Estrai la fonte
        const fonteMatch = card.match(/\*\s*Fonte:\s*(.+)/i);
        const fonte = fonteMatch 
            ? fonteMatch[1].replace(/\*+/g, '').trim()
            : null;
            
        cards.push({ content: card, titolo, fonte });
    }
    return cards;
}

// ── Main ───────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  CLEAN & RE-INGEST TEORIA DOGMATICA');
    console.log('═══════════════════════════════════════════════════\n');

    // ── FASE 1: Cancella chunk inquinati ──
    console.log('🗑️  FASE 1: Cancello chunk teoria_massimario esistenti...');
    
    // Cancella a batch (Supabase ha limiti)
    let deleted = 0;
    while (true) {
        const { data, error } = await supabase
            .from('rag_chunks')
            .delete()
            .eq('tipo', 'teoria_massimario')
            .limit(500)
            .select('id');
        
        if (error) {
            console.error('   Errore cancellazione:', error.message);
            break;
        }
        if (!data || data.length === 0) break;
        deleted += data.length;
        console.log(`   Cancellati ${deleted} chunk...`);
    }
    console.log(`   ✅ Cancellati ${deleted} chunk inquinati.\n`);

    // Cancella anche i documenti orfani
    const { data: orphanDocs } = await supabase
        .from('rag_documents')
        .delete()
        .eq('tipo', 'massimario_teoria')
        .select('id');
    console.log(`   ✅ Cancellati ${orphanDocs?.length || 0} documenti orfani.\n`);

    // ── FASE 2: Splitta tutte le riviste VIP ──
    console.log('📂 FASE 2: Splitting riviste VIP...');
    
    const sourceDir = 'riviste_vip_schede';
    const sourceFiles = getFilesRecursive(sourceDir);
    console.log(`   Trovati ${sourceFiles.length} file sorgente.`);
    
    let totalCards = 0;
    const allCards = []; // { fileName, content, titolo, fonte }
    
    for (const file of sourceFiles) {
        const raw = fs.readFileSync(file, 'utf8');
        const cards = splitIntoCards(raw);
        
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const baseName = path.basename(file, '.md');
            const safeTitolo = (card.titolo || `scheda_${i}`)
                .replace(/[^a-z0-9àèéìòù ]/gi, '')
                .substring(0, 60)
                .trim();
            
            allCards.push({
                fileName: `${baseName}__${i}_${safeTitolo}`,
                content: card.content,
                titolo: card.titolo || `Scheda ${i} da ${baseName}`,
                fonte: card.fonte
            });
            totalCards++;
        }
    }
    
    console.log(`   ✅ Estratte ${totalCards} schede singole.\n`);

    // ── FASE 3: Ingestione pulita ──
    console.log('🚀 FASE 3: Ingestione schede pulite...');
    console.log(`   Rate: 1 scheda ogni 600ms (~${Math.ceil(totalCards * 0.6 / 60)} minuti)\n`);
    
    let ingested = 0;
    let errors = 0;
    
    for (const card of allCards) {
        try {
            const docUuid = generateUUID(card.fileName);
            
            // Verifica duplicato
            const { data: exists } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('id', docUuid)
                .single();
            
            if (exists) {
                // Già presente, skip
                continue;
            }
            
            // Crea documento padre
            const { error: docErr } = await supabase.from('rag_documents').insert({
                id: docUuid,
                titolo: card.titolo,
                materia: 'Dottrina e Teoria Generale',
                tipo: 'massimario_teoria',
                autore: card.fonte || 'Dottrina giuridica',
                filename: card.fileName + '.md',
                status: 'completed'
            });
            if (docErr) throw new Error(`Doc: ${docErr.message}`);
            
            // Genera embedding sul contenuto PULITO
            const embedding = await getEmbedding(card.content.substring(0, 8000));
            
            // Inserisci chunk
            const { error: chunkErr } = await supabase.from('rag_chunks').insert({
                document_id: docUuid,
                content: card.content,
                chunk_index: 0,
                materia: 'Dottrina e Teoria Generale',
                tipo: 'teoria_massimario',
                embedding: embedding
            });
            if (chunkErr) throw new Error(`Chunk: ${chunkErr.message}`);
            
            ingested++;
            if (ingested % 10 === 0) {
                console.log(`   ✅ ${ingested}/${totalCards} ingerite (${errors} errori)`);
            }
            
            // Rate limit
            await new Promise(r => setTimeout(r, 600));
            
        } catch (e) {
            errors++;
            if (errors <= 5) console.error(`   ❌ ${card.fileName}: ${e.message}`);
        }
    }
    
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  RISULTATO: ${ingested} schede ingerite, ${errors} errori`);
    console.log(`═══════════════════════════════════════════════════\n`);
}

main();
