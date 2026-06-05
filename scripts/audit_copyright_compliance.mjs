/**
 * ══════════════════════════════════════════════════════════════
 * 🛡️  AUDIT COMPLIANCE COPYRIGHT — Script di Verifica Periodica
 * ══════════════════════════════════════════════════════════════
 * 
 * SCOPO: Verificare che il database RAG e il filesystem del progetto
 * NON contengano materiale protetto da copyright commerciale o con
 * licenza Non-Commerciale (NC), incompatibile con l'uso in app monetizzata.
 * 
 * QUANDO ESEGUIRLO:
 *   - Prima di ogni deploy in produzione
 *   - Dopo ogni ingestione di nuovi dati nel RAG
 *   - Periodicamente (consigliato: settimanale)
 *   - Su richiesta, in caso di audit o verifica legale
 * 
 * COSA CONTROLLA:
 *   1. Database Supabase — tipi vietati, editori, pattern nei titoli
 *   2. Database Supabase — pattern nei contenuti dei chunk
 *   3. Filesystem — directory che non dovrebbero esistere
 *   4. Filesystem — script di ingestione che non dovrebbero esistere
 *   5. Proxy.js — integrità della whitelist web
 * 
 * OUTPUT: Report con timestamp, esito PASS/FAIL per ogni check,
 *         e salvataggio opzionale su file per archivio.
 * 
 * QUADRO NORMATIVO DI RIFERIMENTO:
 *   - L. 633/1941 (Legge sul Diritto d'Autore)
 *   - L. 132/2025 (Legge IA e Copyright — Art. 171 c.1 lett. a-ter LDA)
 *   - Direttiva 2019/790/UE (Art. 3-4, TDM opt-out)
 *   - Licenze Creative Commons: clausola NC incompatibile con uso commerciale
 * 
 * Creato: 2026-06-04
 * Ultima modifica: 2026-06-04
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════
// CONFIGURAZIONE
// ═══════════════════════════════════════════

const PROJECT_ROOT = path.resolve('.');

// Carica .env
const env = {};
if (fs.existsSync(path.join(PROJECT_ROOT, '.env'))) {
    fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
}

// ── FONTI VIETATE ──
// Aggiornare questa lista ogni volta che si identifica una nuova fonte incompatibile.

const BANNED_DB_TYPES = [
    'rivista_vip',
    'scheda_manualistica',
    'scheda_manualistica_v3',
];

const BANNED_PUBLISHERS = [
    // Editori commerciali (copyright pieno, ToS vietano scraping/TDM)
    'Giurisprudenza Italiana',     // Wolters Kluwer / UTET
    'Danno e Responsabilità',      // Giuffrè / Wolters Kluwer
    'Immobiliare',                 // Giuffrè / Wolters Kluwer
    'DeJure',                      // Giuffrè
    'IusExplorer',                 // Wolters Kluwer
    'Pluris',                      // CEDAM / UTET
    // Editori con licenza NC (incompatibile con app monetizzata)
    'Federalismi.it',              // CC BY-NC
    'Sistema Penale',              // CC BY-NC-ND
    'Ceridap',                     // CC BY-NC-ND
    'Biodiritto',                  // CC BY-NC
    'Diritto Penale Uomo',         // CC BY-NC
    'MediaLaws',                   // CC BY-NC
    'Archivio Penale',             // CC BY-NC
    'La Legislazione Penale',      // CC BY-NC
    'Judicium',                    // Diritti riservati
    'Milan Law Review',            // CC BY-NC-SA
    'BUP',                         // CC BY-NC-SA
    'Roma TrE-Press',              // CC BY-NC-ND
    // Nomi mascherati (usati dallo storico script sanitize_copyright)
    'Dottrina Civilistica',
    'Dottrina Diritto Pubblico',
    'Dottrina Responsabilità Civile',
    'Dottrina Diritti Reali',
];

const BANNED_TITLE_PATTERNS = [
    // Solo pattern che indicano provenienza da fonti vietate, NON termini giuridici generici.
    // NOTA: "Discrimen" è anche un termine latino giuridico (= confine/distinzione) usato
    // correntemente nelle sentenze, quindi NON va incluso qui. La protezione per i contenuti
    // della rivista Discrimen è garantita dal CHECK 1 (tipo scheda_manualistica_v3).
    // Lo stesso vale per "Sistema Penale" (espressione generica).
    '[Giurisprudenza Italiana',
    '[Federalismi',
    '[Danno e Responsabilità',
    '[Dottrina Civilistica',
    '[Dottrina Diritto Pubblico',
    '[Dottrina Responsabilità',
    '[Dottrina Diritti Reali',
    '[BUP',
    '[Roma TrE',
];

const BANNED_CHUNK_PATTERNS = [
    'Giurisprudenza Italiana',
    'Federalismi.it',
    'Danno e Responsabilità',
    'dejure.it',
    'iusexplorer.it',
    'pluris-cedam',
];

const BANNED_DIRECTORIES = [
    'riviste_vip_schede',
    'riviste_vip_schede_v2',
    'riviste_penale_vip_v3',
    'manuali_oa_schede_v3',
    'data/sistemapenale_articles',
    'data/discrimen_pdfs',
    'data/discrimen_articles',
    'data/manuali_oa',
    'data/manuali_oa_vip_v3',
    'temp_cache',
    'temp_cache_federalismi',
];

const BANNED_SCRIPTS = [
    'scripts/generate_riviste_vip.js',
    'scripts/rag-ingest-riviste.js',
    'scripts/generate_federalismi_vip.js',
    'scripts/rag-ingest-federalismi.js',
    'scripts/sanitize_copyright.mjs',
    'scripts/generate_penale_v3.mjs',
    'scripts/ingest_penale_vip_v3.mjs',
    'scripts/generate_manuali_oa_vip.mjs',
    'scripts/ingest_manuali_oa_vip.mjs',
];

// ═══════════════════════════════════════════
// ENGINE DI AUDIT
// ═══════════════════════════════════════════

const results = [];
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(check, detail) {
    results.push({ status: 'PASS', check, detail });
    passCount++;
}
function fail(check, detail) {
    results.push({ status: 'FAIL', check, detail });
    failCount++;
}
function warn(check, detail) {
    results.push({ status: 'WARN', check, detail });
    warnCount++;
}

// ── CHECK 1: Tipi vietati nel DB ──
async function checkBannedTypes(supabase) {
    for (const tipo of BANNED_DB_TYPES) {
        const { count, error } = await supabase
            .from('rag_documents')
            .select('id', { count: 'exact', head: true })
            .eq('tipo', tipo);
        
        if (error) {
            warn('DB_BANNED_TYPES', `Errore query tipo "${tipo}": ${error.message}`);
        } else if (count > 0) {
            fail('DB_BANNED_TYPES', `Tipo "${tipo}" ha ${count} record — DEVE ESSERE 0`);
        } else {
            pass('DB_BANNED_TYPES', `Tipo "${tipo}": 0 record`);
        }
    }
}

// ── CHECK 2: Editori vietati nel DB ──
async function checkBannedPublishers(supabase) {
    for (const pub of BANNED_PUBLISHERS) {
        const { count, error } = await supabase
            .from('rag_documents')
            .select('id', { count: 'exact', head: true })
            .eq('editore', pub);
        
        if (error) {
            warn('DB_BANNED_PUBLISHERS', `Errore query editore "${pub}": ${error.message}`);
        } else if (count > 0) {
            fail('DB_BANNED_PUBLISHERS', `Editore "${pub}" ha ${count} record — DEVE ESSERE 0`);
        }
    }
    // Se nessun fail, registra un pass complessivo
    if (!results.some(r => r.check === 'DB_BANNED_PUBLISHERS' && r.status === 'FAIL')) {
        pass('DB_BANNED_PUBLISHERS', `Nessuno dei ${BANNED_PUBLISHERS.length} editori vietati trovato`);
    }
}

// ── CHECK 3: Pattern vietati nei titoli ──
async function checkBannedTitles(supabase) {
    let found = 0;
    for (const pattern of BANNED_TITLE_PATTERNS) {
        const { count, error } = await supabase
            .from('rag_documents')
            .select('id', { count: 'exact', head: true })
            .ilike('titolo', `%${pattern}%`);
        
        if (!error && count > 0) {
            fail('DB_BANNED_TITLES', `Pattern "${pattern}" trovato in ${count} titoli`);
            found += count;
        }
    }
    if (found === 0) {
        pass('DB_BANNED_TITLES', `Nessun pattern vietato trovato nei titoli`);
    }
}

// ── CHECK 4: Pattern vietati nei chunk ──
async function checkBannedChunkContent(supabase) {
    let found = 0;
    for (const pattern of BANNED_CHUNK_PATTERNS) {
        const { count, error } = await supabase
            .from('rag_chunks')
            .select('id', { count: 'exact', head: true })
            .ilike('content', `%${pattern}%`);
        
        if (!error && count > 0) {
            fail('DB_BANNED_CHUNKS', `Pattern "${pattern}" trovato in ${count} chunk`);
            found += count;
        }
    }
    if (found === 0) {
        pass('DB_BANNED_CHUNKS', `Nessun pattern vietato trovato nei contenuti dei chunk`);
    }
}

// ── CHECK 5: Directory vietate nel filesystem ──
function checkBannedDirectories() {
    let found = 0;
    for (const dir of BANNED_DIRECTORIES) {
        const fullPath = path.join(PROJECT_ROOT, dir);
        if (fs.existsSync(fullPath)) {
            fail('FS_BANNED_DIRS', `Directory "${dir}" ESISTE — deve essere eliminata`);
            found++;
        }
    }
    if (found === 0) {
        pass('FS_BANNED_DIRS', `Nessuna delle ${BANNED_DIRECTORIES.length} directory vietate trovata`);
    }
}

// ── CHECK 6: Script vietati nel filesystem ──
function checkBannedScripts() {
    let found = 0;
    for (const script of BANNED_SCRIPTS) {
        const fullPath = path.join(PROJECT_ROOT, script);
        if (fs.existsSync(fullPath)) {
            fail('FS_BANNED_SCRIPTS', `Script "${script}" ESISTE — deve essere eliminato`);
            found++;
        }
    }
    if (found === 0) {
        pass('FS_BANNED_SCRIPTS', `Nessuno dei ${BANNED_SCRIPTS.length} script vietati trovato`);
    }
}

// ── CHECK 7: Integrità whitelist proxy.js ──
function checkProxyWhitelist() {
    const proxyPath = path.join(PROJECT_ROOT, 'api', 'proxy.js');
    if (!fs.existsSync(proxyPath)) {
        warn('PROXY_WHITELIST', 'File api/proxy.js non trovato');
        return;
    }
    
    const content = fs.readFileSync(proxyPath, 'utf8');
    
    // Verifica che la whitelist v2.0 sia presente
    if (content.includes('PROTOCOLLO WHITELIST BLINDATA v2.0')) {
        pass('PROXY_WHITELIST', 'Whitelist v2.0 presente in proxy.js');
    } else {
        fail('PROXY_WHITELIST', 'Whitelist v2.0 NON trovata in proxy.js — possibile regressione');
    }
    
    // Verifica che la blacklist esplicita sia presente
    if (content.includes('FONTI VIETATE (RED LIGHT')) {
        pass('PROXY_BLACKLIST', 'Blacklist esplicita (§2) presente in proxy.js');
    } else {
        fail('PROXY_BLACKLIST', 'Blacklist esplicita NON trovata in proxy.js');
    }
    
    // Verifica guardrails
    if (content.includes('GUARDRAILS DI COMPLIANCE')) {
        pass('PROXY_GUARDRAILS', 'Guardrails compliance (§4) presenti in proxy.js');
    } else {
        fail('PROXY_GUARDRAILS', 'Guardrails compliance NON trovati in proxy.js');
    }
}

// ── CHECK 8: Census DB (informativo) ──
async function dbCensus(supabase) {
    let offset = 0;
    const byTipo = {};
    let total = 0;
    while (true) {
        const { data } = await supabase
            .from('rag_documents')
            .select('tipo')
            .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        data.forEach(d => {
            byTipo[d.tipo || 'NULL'] = (byTipo[d.tipo || 'NULL'] || 0) + 1;
        });
        total += data.length;
        if (data.length < 1000) break;
        offset += 1000;
    }
    return { byTipo, total };
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
    const timestamp = new Date().toISOString();
    const separator = '═'.repeat(60);
    
    console.log(separator);
    console.log('🛡️  AUDIT COMPLIANCE COPYRIGHT');
    console.log(`📅  ${timestamp}`);
    console.log(`📂  ${PROJECT_ROOT}`);
    console.log(separator);
    
    // Connessione DB
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
        console.error('❌ Variabili SUPABASE_URL o SUPABASE_SERVICE_KEY mancanti nel .env');
        process.exit(1);
    }
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    
    // Census
    console.log('\n📊 CENSUS DATABASE...');
    const { byTipo, total } = await dbCensus(supabase);
    Object.entries(byTipo)
        .sort((a, b) => b[1] - a[1])
        .forEach(([k, v]) => console.log(`   ${k}: ${v}`));
    console.log(`   TOTALE: ${total}`);
    
    // Esecuzione check
    console.log('\n🔍 ESECUZIONE VERIFICHE...\n');
    
    await checkBannedTypes(supabase);
    await checkBannedPublishers(supabase);
    await checkBannedTitles(supabase);
    await checkBannedChunkContent(supabase);
    checkBannedDirectories();
    checkBannedScripts();
    checkProxyWhitelist();
    
    // Report
    console.log('\n' + '─'.repeat(60));
    console.log('📋 REPORT DETTAGLIATO\n');
    
    for (const r of results) {
        const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${icon} [${r.check}] ${r.detail}`);
    }
    
    // Verdetto
    console.log('\n' + separator);
    if (failCount === 0) {
        console.log(`🟢 VERDETTO: PASS — ${passCount} check superati, 0 violazioni`);
        if (warnCount > 0) console.log(`   (${warnCount} avvisi non bloccanti)`);
    } else {
        console.log(`🔴 VERDETTO: FAIL — ${failCount} VIOLAZIONI TROVATE`);
        console.log(`   ${passCount} check superati, ${warnCount} avvisi`);
    }
    console.log(separator);
    
    // Salva report su file con timestamp
    const reportDir = path.join(PROJECT_ROOT, 'compliance_reports');
    fs.mkdirSync(reportDir, { recursive: true });
    
    const reportDate = timestamp.replace(/[:.]/g, '-').substring(0, 19);
    const reportFile = path.join(reportDir, `audit_${reportDate}.json`);
    
    const report = {
        timestamp,
        project: PROJECT_ROOT,
        verdict: failCount === 0 ? 'PASS' : 'FAIL',
        summary: { pass: passCount, fail: failCount, warn: warnCount },
        dbCensus: { total, byTipo },
        checks: results,
    };
    
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n📁 Report salvato: ${reportFile}`);
    
    // Exit code per CI/CD
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('💥 ERRORE FATALE:', err.message);
    process.exit(1);
});
