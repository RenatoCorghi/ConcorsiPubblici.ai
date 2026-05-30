/**
 * PULIZIA DATABASE RAG — Rimozione chunk generati da sentenze oscurate
 * 
 * Questo script:
 * 1. Scansiona le directory _clean per trovare tutti i file sorgente < 500 bytes
 * 2. Per ogni file oscurato, cerca il corrispondente documento nel DB
 * 3. Rimuove document + tutti i chunk associati
 * 4. Opzionalmente rimuove anche i file VIP .md generati
 * 
 * Uso: node cleanup_oscurati.mjs [--dry-run] [--delete-vip]
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_VIP_FILES = process.argv.includes('--delete-vip');

// Directories con file sorgente puliti da Italgiure
const CLEAN_DIRS = [
    './scraper_cassazione/sentenze_ssuu_civile_clean',
    './scraper_cassazione/sentenze_ssuu_penale_clean',
    './scraper_cassazione/sentenze_ssuu_clean',
];

// Directories con schede VIP generate (da eliminare se generate da oscurate)
const VIP_DIRS = [
    './sentenze_ssuu_vip',
    './sentenze_ssuu_vip_schede',
    './sentenze_sez_semplici_vip',
];

const MAX_SOURCE_SIZE = 500; // bytes — qualsiasi file più piccolo è oscurato/vuoto

const OSCURAMENTO_PATTERNS = [
    /in fase di oscuramento/i,
    /sentenza richiesta.*oscuramento/i,
    /provvedimento.*non.*disponibile/i,
    /testo.*non.*disponibile/i,
    /fase di valutazione per oscuramento/i,
];

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getFilesRecursive(full));
        } else if (entry.name.endsWith('.txt') || entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('🧹 PULIZIA DATABASE RAG — Sentenze Oscurate');
    console.log(`   Modalità: ${DRY_RUN ? '🔍 DRY RUN (nessuna modifica)' : '⚡ LIVE (eliminazione reale)'}`);
    console.log('═══════════════════════════════════════════════\n');

    // FASE 1: Trova tutti i file sorgente oscurati/vuoti
    const oscuratedFiles = [];
    
    for (const dir of CLEAN_DIRS) {
        if (!fs.existsSync(dir)) {
            console.log(`⏭️  Directory non trovata: ${dir}`);
            continue;
        }
        const files = getFilesRecursive(dir);
        console.log(`📂 ${dir}: ${files.length} file totali`);
        
        for (const file of files) {
            const stat = fs.statSync(file);
            if (stat.size <= MAX_SOURCE_SIZE) {
                const basename = path.basename(file).replace(/\.(txt|md)$/, '');
                oscuratedFiles.push({ basename, file, size: stat.size });
            } else {
                // Controlla anche il contenuto per oscuramento
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    if (OSCURAMENTO_PATTERNS.some(p => p.test(content)) && content.length < 1000) {
                        const basename = path.basename(file).replace(/\.(txt|md)$/, '');
                        oscuratedFiles.push({ basename, file, size: stat.size });
                    }
                } catch (e) {
                    // UTF-16 files might fail — check by size
                    if (stat.size <= 1000) {
                        const basename = path.basename(file).replace(/\.(txt|md)$/, '');
                        oscuratedFiles.push({ basename, file, size: stat.size });
                    }
                }
            }
        }
    }

    console.log(`\n🔴 Trovati ${oscuratedFiles.length} file sorgente oscurati/vuoti\n`);

    // FASE 2: Per ogni file oscurato, cerca nel DB e rimuovi
    let dbDocsDeleted = 0, dbChunksDeleted = 0, vipFilesDeleted = 0, dbDocsNotFound = 0;

    // Batch in gruppi di 50 per non sovraccaricare Supabase
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < oscuratedFiles.length; i += BATCH_SIZE) {
        const batch = oscuratedFiles.slice(i, i + BATCH_SIZE);
        const basenames = batch.map(b => b.basename);
        
        // Cerca documenti con filename matching
        // I documenti sono stati inseriti con filename come "snciv2021U34778S.md"
        const filenameVariants = basenames.flatMap(b => [
            b + '.md',
            b + '.txt',
            b,
        ]);
        
        for (const osc of batch) {
            const bn = osc.basename;
            const variants = [bn + '.md', bn + '.txt', bn];
            
            // Cerca il documento nel DB
            let docs = [];
            for (const variant of variants) {
                const { data } = await supabase
                    .from('rag_documents')
                    .select('id, titolo, filename, tipo')
                    .eq('filename', variant)
                    .limit(5);
                if (data && data.length > 0) {
                    docs.push(...data);
                }
            }
            
            // Prova anche con like
            if (docs.length === 0) {
                const { data } = await supabase
                    .from('rag_documents')
                    .select('id, titolo, filename, tipo')
                    .like('filename', `%${bn}%`)
                    .limit(5);
                if (data && data.length > 0) {
                    docs.push(...data);
                }
            }

            if (docs.length === 0) {
                dbDocsNotFound++;
                continue;
            }

            for (const doc of docs) {
                if (DRY_RUN) {
                    console.log(`  [DRY] Eliminerei doc: ${doc.titolo || doc.filename} (${doc.tipo}) → ID: ${doc.id}`);
                } else {
                    // 1. Elimina i chunk
                    const { data: deletedChunks, error: chunkErr } = await supabase
                        .from('rag_chunks')
                        .delete()
                        .eq('document_id', doc.id)
                        .select('id');
                    
                    if (chunkErr) {
                        console.error(`  ❌ Errore eliminazione chunk per ${doc.filename}: ${chunkErr.message}`);
                    } else {
                        const count = deletedChunks?.length || 0;
                        dbChunksDeleted += count;
                    }
                    
                    // 2. Elimina il documento
                    const { error: docErr } = await supabase
                        .from('rag_documents')
                        .delete()
                        .eq('id', doc.id);
                    
                    if (docErr) {
                        console.error(`  ❌ Errore eliminazione doc ${doc.filename}: ${docErr.message}`);
                    } else {
                        dbDocsDeleted++;
                        console.log(`  ✅ Eliminato: ${doc.titolo || doc.filename} (${deletedChunks?.length || 0} chunk)`);
                    }
                }
            }

            // FASE 3: Elimina anche i file VIP corrispondenti (opzionale)
            if (DELETE_VIP_FILES) {
                for (const vipDir of VIP_DIRS) {
                    // Cerca ricorsivamente il file VIP corrispondente
                    const vipFiles = getFilesRecursive(vipDir);
                    for (const vf of vipFiles) {
                        if (path.basename(vf).startsWith(bn)) {
                            if (DRY_RUN) {
                                console.log(`  [DRY] Eliminerei VIP file: ${vf}`);
                            } else {
                                fs.unlinkSync(vf);
                                vipFilesDeleted++;
                                console.log(`  🗑️  Eliminato VIP: ${vf}`);
                            }
                        }
                    }
                }
            }
        }
        
        if (i % 100 === 0 && i > 0) {
            console.log(`\n📊 Progresso: ${i}/${oscuratedFiles.length} processati | ${dbDocsDeleted} doc eliminati | ${dbChunksDeleted} chunk eliminati\n`);
        }
    }

    // RIEPILOGO
    console.log('\n' + '═'.repeat(60));
    console.log('📊 RIEPILOGO PULIZIA');
    console.log('═'.repeat(60));
    console.log(`  File sorgente oscurati trovati: ${oscuratedFiles.length}`);
    console.log(`  Documenti eliminati dal DB:     ${dbDocsDeleted}`);
    console.log(`  Chunk eliminati dal DB:         ${dbChunksDeleted}`);
    console.log(`  File VIP eliminati:             ${vipFilesDeleted}`);
    console.log(`  Documenti non trovati nel DB:   ${dbDocsNotFound}`);
    console.log('═'.repeat(60));
    
    if (DRY_RUN) {
        console.log('\n⚠️  Questo era un DRY RUN. Nessuna modifica effettiva. Rilanciare senza --dry-run per eliminare.');
    }

    // Salva report
    const report = oscuratedFiles.map(f => `${f.basename}\t${f.size}\t${f.file}`).join('\n');
    fs.writeFileSync('oscurated_files_report.txt', report, 'utf8');
    console.log(`\n📝 Report salvato: oscurated_files_report.txt`);
}

main().catch(console.error);
