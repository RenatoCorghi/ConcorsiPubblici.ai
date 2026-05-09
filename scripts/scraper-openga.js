/* ============================================================
   SCRAPER OPENGA — Download automatico dataset Giustizia Amministrativa
   
   Scarica sentenze, pareri, ordinanze e decreti da:
   https://openga.giustizia-amministrativa.it
   
   Formato: JSON (strutturato con metadati completi)
   Licenza: CC-BY 4.0 (uso libero con citazione fonte)
   
   Uso: node scripts/scraper-openga.js [--import-supabase]
   ============================================================ */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carica variabili d'ambiente da .env
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            process.env[key] = value;
        }
    });
}

// ═══════════════════════════════════════════
// CONFIGURAZIONE
// ═══════════════════════════════════════════

const BASE_URL = 'https://openga.giustizia-amministrativa.it/dataset';

// Anni disponibili su OpenGA
const ANNI = [2021, 2022, 2023, 2024, 2025, 2026];

// Tipi di provvedimenti da scaricare
const TIPI_DATASET = ['sentenze'];

// Sedi mirate (Consiglio di Stato e TAR Lazio Roma)
const SEDI = [
    { slug: 'cds', nome: 'Consiglio di Stato', haPareri: true },
    { slug: 'tar-lazio-roma', nome: 'TAR Lazio - Roma', haPareri: false },
];

// ═══════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(emoji, msg) {
    console.log(`${emoji}  ${msg}`);
}

// ═══════════════════════════════════════════
// STEP 1: DISCOVERY — Trova i Resource ID per i download
// ═══════════════════════════════════════════

/**
 * OpenGA è basato su CKAN. I dataset hanno un ID univoco e ogni risorsa 
 * (CSV, JSON, ODS per ogni anno) ha un resource ID.
 * 
 * Struttura URL prevedibile per i download diretti:
 * {BASE_URL}/{dataset-id}/resource/{resource-id}/download/{slug}-{tipo}-{anno}.json
 * 
 * Ma il dataset-id e resource-id cambiano. Possiamo usare la CKAN API:
 * https://openga.giustizia-amministrativa.it/api/3/action/package_show?id={slug}-{tipo}
 */

async function getDatasetInfo(slug, tipo) {
    const datasetName = `${slug}-${tipo}`;
    const apiUrl = `https://openga.giustizia-amministrativa.it/api/3/action/package_show?id=${datasetName}`;
    
    try {
        const response = await fetch(apiUrl, { 
            signal: AbortSignal.timeout(30000),
            headers: { 'User-Agent': 'ConcorsiPubblici.ai-Scraper/1.0 (Educational)' }
        });
        
        if (!response.ok) {
            if (response.status === 404) return null; // Dataset non esiste
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) return null;
        
        // Estrai le risorse JSON per ogni anno
        const resources = {};
        for (const resource of data.result.resources) {
            if (resource.format === 'JSON' || resource.url?.endsWith('.json')) {
                // Estrai l'anno dal nome (es. "CDS - Sentenze - 2024JSON")
                const yearMatch = resource.name?.match(/(\d{4})/);
                if (yearMatch) {
                    resources[yearMatch[1]] = {
                        id: resource.id,
                        url: resource.url,
                        name: resource.name,
                        size: resource.size
                    };
                }
            }
        }
        
        return {
            datasetId: data.result.id,
            name: data.result.title,
            resources
        };
    } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            log('⏱️', `Timeout per ${datasetName}`);
        }
        return null;
    }
}

// ═══════════════════════════════════════════
// STEP 2: DOWNLOAD — Scarica i dataset JSON
// ═══════════════════════════════════════════

async function downloadResource(url, outputPath) {
    try {
        const response = await fetch(url, { 
            signal: AbortSignal.timeout(120000), // 2 min timeout per file grandi
            headers: { 'User-Agent': 'ConcorsiPubblici.ai-Scraper/1.0 (Educational)' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const text = await response.text();
        
        // Assicuriamoci che sia JSON valido
        const data = JSON.parse(text);
        
        writeFileSync(outputPath, JSON.stringify(data, null, 0), 'utf8');
        
        return data.length || 0;
    } catch (err) {
        log('❌', `Errore download: ${err.message}`);
        return -1;
    }
}

// ═══════════════════════════════════════════
// STEP 3: MAIN — Orchestrazione completa
// ═══════════════════════════════════════════

async function main() {
    const args = process.argv.slice(2);
    const importToSupabase = args.includes('--import-supabase');
    const sedeFilter = args.find(a => a.startsWith('--sede='))?.split('=')[1];
    const tipoFilter = args.find(a => a.startsWith('--tipo='))?.split('=')[1];
    const annoFilter = args.find(a => a.startsWith('--anno='))?.split('=')[1];
    const dryRun = args.includes('--dry-run');
    
    log('🏛️', '═══════════════════════════════════════════════');
    log('🏛️', '  SCRAPER OpenGA — Giustizia Amministrativa');
    log('🏛️', '  Decisioni e Pareri Open Data (CC-BY 4.0)');
    log('🏛️', '═══════════════════════════════════════════════');
    console.log();
    
    // Directory output
    const dataDir = join(__dirname, '..', 'data', 'giustizia-amministrativa');
    mkdirSync(dataDir, { recursive: true });
    
    // Stats
    const stats = {
        totalDatasets: 0,
        totalDownloaded: 0,
        totalRecords: 0,
        totalErrors: 0,
        byTipo: {},
        bySede: {}
    };
    
    // Filtra sedi se richiesto
    const sediToProcess = sedeFilter 
        ? SEDI.filter(s => s.slug.includes(sedeFilter))
        : SEDI;
    
    // Filtra tipi se richiesto
    const tipiToProcess = tipoFilter
        ? TIPI_DATASET.filter(t => t.includes(tipoFilter))
        : TIPI_DATASET;
    
    // Filtra anni se richiesto
    const anniToProcess = annoFilter
        ? ANNI.filter(a => a.toString() === annoFilter)
        : ANNI;
    
    log('📋', `Sedi: ${sediToProcess.length} | Tipi: ${tipiToProcess.join(', ')} | Anni: ${anniToProcess.join(', ')}`);
    console.log();
    
    // ── FASE 1: DISCOVERY ──
    log('🔍', 'Fase 1: Discovery dei dataset...');
    
    const downloadQueue = [];
    
    for (const sede of sediToProcess) {
        for (const tipo of tipiToProcess) {
            // I pareri esistono solo per CdS e CGA
            if (tipo === 'pareri' && !sede.haPareri) continue;
            
            stats.totalDatasets++;
            
            const datasetName = `${sede.slug}-${tipo}`;
            log('🔍', `  Cerco: ${datasetName}...`);
            
            const info = await getDatasetInfo(sede.slug, tipo);
            
            if (!info) {
                log('⚠️', `  → Non trovato: ${datasetName}`);
                continue;
            }
            
            for (const anno of anniToProcess) {
                const resource = info.resources[anno.toString()];
                if (!resource) continue;
                
                const outputFile = join(dataDir, `${sede.slug}-${tipo}-${anno}.json`);
                
                // Skip se già scaricato (cache)
                if (existsSync(outputFile) && !args.includes('--force')) {
                    const existing = readFileSync(outputFile, 'utf8');
                    try {
                        const existingData = JSON.parse(existing);
                        if (existingData.length > 0) {
                            log('✅', `  → Cache: ${sede.slug}-${tipo}-${anno} (${existingData.length} record)`);
                            stats.totalDownloaded++;
                            stats.totalRecords += existingData.length;
                            stats.byTipo[tipo] = (stats.byTipo[tipo] || 0) + existingData.length;
                            stats.bySede[sede.slug] = (stats.bySede[sede.slug] || 0) + existingData.length;
                            continue;
                        }
                    } catch { /* file corrotto, ri-scarica */ }
                }
                
                downloadQueue.push({
                    sede,
                    tipo,
                    anno,
                    url: resource.url,
                    outputFile,
                    resourceName: resource.name
                });
            }
            
            // Rate limiting: pausa tra le discovery API calls
            await sleep(200);
        }
    }
    
    console.log();
    log('📥', `Fase 2: Download di ${downloadQueue.length} dataset...`);
    console.log();
    
    if (dryRun) {
        log('🔍', 'DRY RUN — nessun download effettuato');
        for (const item of downloadQueue) {
            log('  📄', `${item.sede.slug}-${item.tipo}-${item.anno} → ${item.url}`);
        }
        return;
    }
    
    // ── FASE 2: DOWNLOAD ──
    for (let i = 0; i < downloadQueue.length; i++) {
        const item = downloadQueue[i];
        const progress = `[${i + 1}/${downloadQueue.length}]`;
        
        log('📥', `${progress} Scarico: ${item.sede.nome} - ${item.tipo} ${item.anno}...`);
        
        const count = await downloadResource(item.url, item.outputFile);
        
        if (count >= 0) {
            stats.totalDownloaded++;
            stats.totalRecords += count;
            stats.byTipo[item.tipo] = (stats.byTipo[item.tipo] || 0) + count;
            stats.bySede[item.sede.slug] = (stats.bySede[item.sede.slug] || 0) + count;
            log('✅', `  → ${count} provvedimenti salvati`);
        } else {
            stats.totalErrors++;
            log('❌', `  → Errore nel download`);
        }
        
        // Rate limiting: pausa tra i download
        await sleep(500);
    }
    
    // ── FASE 3: REPORT ──
    console.log();
    log('📊', '═══════════════════════════════════════════════');
    log('📊', '  REPORT FINALE');
    log('📊', '═══════════════════════════════════════════════');
    log('📊', `  Dataset trovati: ${stats.totalDatasets}`);
    log('📊', `  Download riusciti: ${stats.totalDownloaded}`);
    log('📊', `  Errori: ${stats.totalErrors}`);
    log('📊', `  TOTALE PROVVEDIMENTI: ${stats.totalRecords.toLocaleString('it-IT')}`);
    console.log();
    log('📊', '  Per tipo:');
    for (const [tipo, count] of Object.entries(stats.byTipo).sort((a, b) => b[1] - a[1])) {
        log('  📄', `  ${tipo}: ${count.toLocaleString('it-IT')}`);
    }
    console.log();
    
    // Salva stats
    const statsFile = join(dataDir, '_stats.json');
    writeFileSync(statsFile, JSON.stringify({
        lastRun: new Date().toISOString(),
        ...stats
    }, null, 2), 'utf8');
    log('💾', `Stats salvate in: ${statsFile}`);
    
    // ── FASE 4: IMPORT SUPABASE (opzionale) ──
    if (importToSupabase) {
        log('🗄️', '');
        log('🗄️', 'Fase 4: Import in Supabase...');
        await importAllToSupabase(dataDir, stats);
    }
    
    console.log();
    log('🎉', 'Completato! I dati sono in: data/giustizia-amministrativa/');
    log('📜', 'Fonte: OpenGA - Giustizia Amministrativa (CC-BY 4.0)');
}

// ═══════════════════════════════════════════
// SUPABASE IMPORT  
// ═══════════════════════════════════════════

async function importAllToSupabase(dataDir) {
    // Importa Supabase client
    let createClient;
    try {
        const supabaseModule = await import('@supabase/supabase-js');
        createClient = supabaseModule.createClient;
    } catch {
        log('❌', 'Pacchetto @supabase/supabase-js non trovato. Installalo con: npm install @supabase/supabase-js');
        return;
    }
    
    // Leggi config (usa variabili d'ambiente o hardcoded per dev)
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    
    if (!SUPABASE_SERVICE_KEY) {
        log('❌', 'SUPABASE_SERVICE_KEY non impostata! Usa:');
        log('  ', 'set SUPABASE_SERVICE_KEY=eyJ... (Windows)');
        log('  ', 'export SUPABASE_SERVICE_KEY=eyJ... (Linux/Mac)');
        log('💡', 'Trova la service_role key nel pannello Supabase → Settings → API');
        return;
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Leggi tutti i file JSON dalla directory
    const { readdirSync } = await import('fs');
    const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    
    let totalImported = 0;
    let totalErrors = 0;
    
    for (const file of files) {
        const filePath = join(dataDir, file);
        
        // Estrai metadata dal nome file (es: cds-sentenze-2024.json)
        const match = file.match(/^(.+)-(sentenze|ordinanze|decreti|pareri)-(\d{4})\.json$/);
        if (!match) continue;
        
        const [, sedeSlug, tipo, anno] = match;
        
        log('🗄️', `  Importo: ${file}...`);
        
        try {
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            
            if (!Array.isArray(data) || data.length === 0) {
                log('⚠️', `  → Vuoto o non valido, skip`);
                continue;
            }
            
            // Trasforma i record nel formato Supabase
            const records = data.map(record => ({
                tipo_provvedimento: record.TIPO_PROVVEDIMENTO || tipo.toUpperCase(),
                sede_slug: sedeSlug,
                sede_nome: record.NOME_SEDE || sedeSlug,
                sezione_codice: record.CODICE_SEZIONE || null,
                sezione_nome: record.NOME_SEZIONE || null,
                numero_provvedimento: record.NUMERO_PROVVEDIMENTO,
                numero_ricorso: record.NUMERO_RICORSO || null,
                anno_pubblicazione: record.ANNO_PUBBLICAZIONE || parseInt(anno),
                mese_pubblicazione: record.MESE_PUBBLICAZIONE || null,
                data_pubblicazione: record.DATA_PUBBLICAZIONE || null,
                tipo_udienza: record.TIPO_UDIENZA || null,
                esito: record.ESITO_PROVVEDIMENTO || null,
                flg_definisce: record.FLG_DEFINISCE || null,
                data_deposito_ricorso: record.DATA_DEPOSITO_RICORSO || null,
                oggetto_ricorso: record.OGGETTO_RICORSO || null,
                tipo_ricorso: record.TIPO_RICORSO || null,
                num_membri_collegio: record.NUM_MEMBRI_COLLEGIO || null,
                // Pareri hanno campi diversi
                numero_affare: record.NUMERO_AFFARE || null,
                oggetto_parere: record.OGGETTO_PARERE || record.OGGETTO_RICORSO || null,
                esito_parere: record.ESITO_PARERE || record.ESITO_PROVVEDIMENTO || null,
                // Metadati import
                fonte: 'openga',
                dataset_file: file
            }));
            
            // Insert in batch da 500 (limite Supabase)
            const BATCH_SIZE = 500;
            let importedCount = 0;
            
            for (let i = 0; i < records.length; i += BATCH_SIZE) {
                const batch = records.slice(i, i + BATCH_SIZE);
                
                const { error } = await supabase
                    .from('provvedimenti_ga')
                    .upsert(batch, { 
                        onConflict: 'numero_provvedimento,sede_slug,tipo_provvedimento',
                        ignoreDuplicates: true 
                    });
                
                if (error) {
                    log('❌', `  → Errore batch ${i}-${i + batch.length}: ${error.message}`);
                    totalErrors += batch.length;
                } else {
                    importedCount += batch.length;
                }
            }
            
            totalImported += importedCount;
            log('✅', `  → ${importedCount.toLocaleString('it-IT')} record importati`);
            
        } catch (err) {
            log('❌', `  → Errore parsing ${file}: ${err.message}`);
            totalErrors++;
        }
    }
    
    log('🗄️', '');
    log('🗄️', `Import completato: ${totalImported.toLocaleString('it-IT')} record, ${totalErrors} errori`);
}

// ═══════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
