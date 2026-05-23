import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ===== PATTERNS =====

// For DB document titles
const TITLE_PATTERNS = [
    { pattern: /\[Giurisprudenza Italiana[^\]]*\]/gi, replacement: '[Dottrina Civilistica]' },
    { pattern: /\[Danno e Responsabilità[^\]]*\]/gi, replacement: '[Dottrina Responsabilità Civile]' },
    { pattern: /\[Immobiliare[^\]]*\]/gi, replacement: '[Dottrina Diritti Reali]' },
    { pattern: /\[Federalismi\.it[^\]]*\]/gi, replacement: '[Dottrina Diritto Pubblico]' },
    { pattern: /\[Rivista Corte dei Conti[^\]]*\]/gi, replacement: '[Dottrina Contabilità Pubblica]' },
    { pattern: /Giurisprudenza Italiana/gi, replacement: 'Dottrina Civilistica' },
    { pattern: /Danno e Responsabilità/gi, replacement: 'Dottrina Responsabilità Civile' },
    { pattern: /Federalismi\.it/gi, replacement: 'Dottrina Diritto Pubblico' },
];

// For DB filenames
const FILENAME_PATTERNS = [
    { pattern: /giurit_/gi, replacement: 'dott_civ_' },
    { pattern: /dannresp_/gi, replacement: 'dott_resp_' },
    { pattern: /immo_/gi, replacement: 'dott_reali_' },
    { pattern: /federalismi_fascicolo_/gi, replacement: 'dott_pub_' },
    { pattern: /federalismi_/gi, replacement: 'dott_pub_' },
    { pattern: /corteconti_rivista_/gi, replacement: 'dott_contab_' },
];

// For chunk content — PRECISE patterns only (avoid false positives like "diritto immobiliare")
const CHUNK_CONTENT_PATTERNS = [
    // Explicit source references
    { pattern: /\*\s*Fonte:\s*Federalismi\.it[^\n]*/g, replacement: '* Fonte: Rielaborazione dottrinale' },
    { pattern: /\*\s*Fonte:\s*Giurisprudenza Italiana[^\n]*/g, replacement: '* Fonte: Rielaborazione dottrinale' },
    { pattern: /\*\s*Fonte:\s*Danno e Responsabilità[^\n]*/g, replacement: '* Fonte: Rielaborazione dottrinale' },
    { pattern: /Fonte ispiratrice:.*$/gm, replacement: '' },
    { pattern: /Rielaborazione.*basata su concetti tratti da.*$/gm, replacement: '' },
    // Federalismi.it n. XX/XXXX (precise pattern)
    { pattern: /Federalismi\.it\s*[-–—]\s*n\.\s*\d+\/\d{4}/gi, replacement: 'Rivista di Diritto Pubblico' },
    { pattern: /Federalismi\.it/gi, replacement: 'rivista di diritto pubblico' },
    // Only match "Giurisprudenza Italiana" as a title, not as a general term
    { pattern: /Giurisprudenza Italiana\./gi, replacement: 'dottrina civilistica.' },
    // Danno e Responsabilità as journal name
    { pattern: /Danno e Responsabilità,?\s*\d{4}/gi, replacement: 'dottrina della responsabilità civile' },
];

// For local file content
const FILE_CONTENT_PATTERNS = [
    ...CHUNK_CONTENT_PATTERNS,
    { pattern: /Fonte:\s*(Giurisprudenza Italiana|Federalismi\.it|Danno e Responsabilità)[^\n]*/gm, replacement: 'Fonte: Rielaborazione dottrinale' },
];

// ===== PHASE 1: DB DOCUMENTS =====
async function sanitizeDocuments() {
    console.log('📋 FASE 1: Sanitizzazione rag_documents...');
    
    const { data: docs, error } = await supabase.from('rag_documents')
        .select('id, titolo, filename, editore')
        .eq('tipo', 'rivista_vip');

    if (error) { console.error('Errore:', error); return; }
    console.log(`  ${docs.length} documenti da processare.`);

    let updated = 0;
    for (const doc of docs) {
        let newTitolo = doc.titolo || '';
        let newFilename = doc.filename || '';
        let changed = false;

        for (const { pattern, replacement } of TITLE_PATTERNS) {
            const before = newTitolo;
            newTitolo = newTitolo.replace(pattern, replacement);
            pattern.lastIndex = 0;
            if (newTitolo !== before) changed = true;
        }

        for (const { pattern, replacement } of FILENAME_PATTERNS) {
            const before = newFilename;
            newFilename = newFilename.replace(pattern, replacement);
            pattern.lastIndex = 0;
            if (newFilename !== before) changed = true;
        }

        // Always null out editore for rivista_vip
        if (doc.editore) changed = true;

        if (changed) {
            const { error: updateErr } = await supabase.from('rag_documents')
                .update({ titolo: newTitolo, filename: newFilename, editore: null })
                .eq('id', doc.id);

            if (updateErr) {
                console.error(`  ❌ ${doc.id}: ${updateErr.message}`);
            } else {
                updated++;
            }
        }
    }
    console.log(`  ✅ Aggiornati ${updated}/${docs.length} documenti.\n`);
}

// ===== PHASE 2: DB CHUNKS =====
async function sanitizeChunks() {
    console.log('📋 FASE 2: Sanitizzazione rag_chunks (contenuto)...');
    
    // Find chunks containing editorial references
    const searchTerms = ['Federalismi', 'Giurisprudenza Italiana', 'Danno e Responsabilità', 'Fonte ispiratrice'];
    let totalUpdated = 0;
    
    for (const term of searchTerms) {
        let offset = 0;
        const batchSize = 500;
        let batchUpdated = 0;
        
        while (true) {
            const { data: chunks, error } = await supabase.from('rag_chunks')
                .select('id, content')
                .ilike('content', `%${term}%`)
                .range(offset, offset + batchSize - 1);

            if (error) { console.error(`  Errore cercando "${term}":`, error.message); break; }
            if (!chunks || chunks.length === 0) break;

            for (const chunk of chunks) {
                let newContent = chunk.content;
                for (const { pattern, replacement } of CHUNK_CONTENT_PATTERNS) {
                    newContent = newContent.replace(pattern, replacement);
                    pattern.lastIndex = 0;
                }

                if (newContent !== chunk.content) {
                    const { error: updateErr } = await supabase.from('rag_chunks')
                        .update({ content: newContent })
                        .eq('id', chunk.id);
                    
                    if (!updateErr) batchUpdated++;
                }
            }

            if (chunks.length < batchSize) break;
            offset += batchSize;
        }
        
        if (batchUpdated > 0) {
            console.log(`  ✅ "${term}": ${batchUpdated} chunks sanitizzati`);
            totalUpdated += batchUpdated;
        }
    }
    console.log(`  📊 Totale chunks aggiornati: ${totalUpdated}\n`);
}

// ===== PHASE 3: LOCAL FILES =====
async function sanitizeLocalFiles() {
    console.log('📋 FASE 3: Sanitizzazione file locali (.md)...');
    
    const schedeDir = 'riviste_vip_schede';
    if (!fs.existsSync(schedeDir)) {
        console.log('  ⚠️ Directory riviste_vip_schede non trovata, skip.');
        return;
    }

    const dirs = fs.readdirSync(schedeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    let totalFiles = 0;
    let modifiedFiles = 0;

    for (const dir of dirs) {
        const fullDir = path.join(schedeDir, dir);
        let files;
        try { files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md')); }
        catch { continue; }

        for (const file of files) {
            const filePath = path.join(fullDir, file);
            let content = fs.readFileSync(filePath, 'utf8');
            let original = content;

            for (const { pattern, replacement } of FILE_CONTENT_PATTERNS) {
                content = content.replace(pattern, replacement);
                pattern.lastIndex = 0;
            }

            if (content !== original) {
                fs.writeFileSync(filePath, content, 'utf8');
                modifiedFiles++;
            }
            totalFiles++;
        }
    }
    console.log(`  ✅ Sanitizzati ${modifiedFiles}/${totalFiles} file locali.\n`);
}

// ===== EXECUTE =====
console.log('🛡️  SANITIZZAZIONE COPYRIGHT — ESECUZIONE\n');
console.log('Questo script rimuove tutti i riferimenti a fonti editoriali protette');
console.log('da copyright dai metadati DB, dal contenuto dei chunks e dai file locali.\n');
console.log('='.repeat(60) + '\n');

await sanitizeDocuments();
await sanitizeChunks();
await sanitizeLocalFiles();

console.log('='.repeat(60));
console.log('✅ SANITIZZAZIONE COMPLETATA.');
console.log('Tutti i riferimenti editoriali sono stati rimossi/neutralizzati.');
