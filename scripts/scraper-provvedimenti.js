/* ============================================================
   SCRAPER PROVVEDIMENTI — Download testo completo sentenze
   
   Scarica il testo integrale (XML/HTML) dei provvedimenti
   dalla Giustizia Amministrativa, partendo dai metadati
   già salvati su Supabase (Fase 1).
   
   URL pattern:
   https://mdp.giustizia-amministrativa.it/visualizza/
     ?nodeRef=&schema={SCHEMA}&nrg={NRG}
     &nomeFile={NOMEFILE}&subDir=Provvedimenti
   
   Uso:
     node scripts/scraper-provvedimenti.js
     node scripts/scraper-provvedimenti.js --sede=cds --anno=2026
     node scripts/scraper-provvedimenti.js --tipo=SENTENZA --limit=100
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════
// CONFIGURAZIONE
// ═══════════════════════════════════════════

const MDP_BASE = 'https://mdp.giustizia-amministrativa.it/visualizza/';

// Pausa tra richieste (ms) — rispettiamo il server (aumentato a 5 secondi per stealth)
const DELAY_MS = 5000;

// Mappa sede_slug OpenGA → schema MDP (codice usato negli URL del sito)
const SEDE_TO_SCHEMA = {
    'cds':                          'cds',
    'cga-sicilia':                  'cga',
    'tar-abruzzo-l-aquila':         'tar_aq',
    'tar-abruzzo-pescara':          'tar_pe',
    'tar-basilicata':               'tar_pz',
    'tar-calabria-catanzaro':       'tar_cz',
    'tar-calabria-reggio-calabria': 'tar_rc',
    'tar-campania-napoli':          'tar_na',
    'tar-campania-salerno':         'tar_sa',
    'tar-emilia-romagna-bologna':   'tar_bo',
    'tar-emilia-romagna-parma':     'tar_pr',
    'tar-friuli-venezia-giulia':    'tar_ts',
    'tar-lazio-roma':               'tar_rm',
    'tar-lazio-latina':             'tar_lt',
    'tar-liguria':                  'tar_ge',
    'tar-lombardia-milano':         'tar_mi',
    'tar-lombardia-brescia':        'tar_bs',
    'tar-marche':                   'tar_an',
    'tar-molise':                   'tar_cb',
    'tar-piemonte':                 'tar_to',
    'tar-puglia-bari':              'tar_ba',
    'tar-puglia-lecce':             'tar_le',
    'tar-sardegna':                 'tar_ca',
    'tar-sicilia-palermo':          'tar_pa',
    'tar-sicilia-catania':          'tar_ct',
    'tar-toscana':                  'tar_fi',
    'trga-trento':                  'trga_tn',
    'trga-bolzano':                 'trga_bz',
    'tar-umbria':                   'tar_pg',
    'tar-valle-d-aosta':            'tar_ao',
    'tar-veneto':                   'tar_ve',
};

// Mappa tipo provvedimento → suffisso file nome (per la costruzione dell'URL)
const TIPO_TO_SUFFIX = {
    'SENTENZA':                   'SENT',
    'SENTENZA BREVE':             'SENT',
    'ORDINANZA CAUTELARE':        'ORDI',
    'ORDINANZA COLLEGIALE':       'ORDI',
    'ORDINANZA PRESIDENZIALE':    'ORDI',
    'DECRETO CAUTELARE':          'DECR',
    'DECRETO DECISORIO':          'DECR',
    'DECRETO COLLEGIALE':         'DECR',
    'DECRETO INGIUNTIVO':         'DECR',
    'DECRETO PRESIDENZIALE':      'DECR',
    'PARERE DEFINITIVO':          'PARE',
    'PARERE INTERLOCUTORIO':      'PARE',
    'PARERE SOSPENSIVO':          'PARE',
};

// ═══════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(emoji, msg) {
    console.log(`${emoji}  ${msg}`);
}

/**
 * Estrae il testo leggibile dal XML della Giustizia Amministrativa.
 * Il formato è XML con tag come <h:div>, <corsivo>, etc.
 */
function extractTextFromXML(xmlContent) {
    if (!xmlContent) return null;

    // Rimuovi la dichiarazione XML e il processing instruction
    let text = xmlContent
        .replace(/<\?xml[^?]*\?>/g, '')
        .replace(/<\?xml-stylesheet[^?]*\?>/g, '');

    // Sostituisci i tag <h:div> con newline (sono i "paragrafi")
    text = text.replace(/<h:div\s*\/>/g, '\n');
    text = text.replace(/<\/h:div>/g, '\n');
    text = text.replace(/<h:div[^>]*>/g, '');

    // Sostituisci <corsivo> con asterischi (markdown italic)
    text = text.replace(/<corsivo>/g, '*');
    text = text.replace(/<\/corsivo>/g, '*');

    // Rimuovi tutti gli altri tag XML ma mantieni il contenuto
    text = text.replace(/<[^>]+>/g, '');

    // Decodifica entità HTML
    text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'");

    // Pulizia whitespace
    text = text
        .replace(/\t+/g, ' ')
        .replace(/ +/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();

    return text;
}

/**
 * Costruisce l'URL di download per un singolo provvedimento.
 * 
 * Pattern: schema={tar_ve}&nrg={202300423}&nomeFile={202400001_01.html}
 * 
 * IMPORTANTE: Il suffisso del file cambia per sede:
 * - CdS (Consiglio di Stato): usa _11.html
 * - TAR / CGA / TRGA: usa _01.html
 * 
 * - nrg = numero_ricorso (Numero Registro Generale)
 * - nomeFile = {numero_provvedimento}_{suffisso}.html
 */
function buildDownloadUrl(record) {
    const schema = SEDE_TO_SCHEMA[record.sede_slug];
    if (!schema) return null;

    const nrg = record.numero_ricorso;
    if (!nrg) return null;

    const numProvv = record.numero_provvedimento;
    if (!numProvv) return null;

    // Suffix logic for CdS vs others
    let suffix = '01'; // Default for TAR/CGA
    
    if (schema === 'cds') {
        if (record.tipo_provvedimento === 'SENTENZA' || record.tipo_provvedimento === 'SENTENZA BREVE') {
            suffix = '11';
        } else if (record.tipo_provvedimento.includes('DECRETO')) {
            // Sezione Plenaria (P) usa _35, altre sezioni possono usare _16 o _32
            // Usiamo _11 come fallback se è una sentenza mascherata, ma proviamo a differenziare
            suffix = record.sezione_nome === 'PLENARIA' ? '35' : '16';
        } else if (record.tipo_provvedimento.includes('ORDINANZA')) {
            suffix = '11'; // Spesso le ordinanze CdS sono _11 o _01
        }
    }

    const nomeFile = `${numProvv}_${suffix}.xml`;

    const url = `${MDP_BASE}?nodeRef=&schema=${schema}&nrg=${nrg}&nomeFile=${nomeFile}&subDir=Provvedimenti`;
    return url;
}

// ═══════════════════════════════════════════
// DOWNLOAD SINGOLO PROVVEDIMENTO
// ═══════════════════════════════════════════

async function downloadFullTextResilient(record) {
    const schema = SEDE_TO_SCHEMA[record.sede_slug];
    if (!schema) return { status: 'no_schema' };

    const nrg = record.numero_ricorso;
    if (!nrg) return { status: 'no_nrg' };

    const numProvv = record.numero_provvedimento;
    if (!numProvv) return { status: 'no_num' };

    // Common suffixes to try
    let suffixes = ['01', '11'];
    if (schema === 'cds') {
        if (record.sezione_nome === 'PLENARIA') {
            suffixes = ['35', '11', '01', '16', '32', '31'];
        } else {
            suffixes = ['11', '01', '16', '32', '31', '35'];
        }
    } else {
        // TAR - More suffixes common for ordinanze/decreti
        suffixes = ['01', '05', '07', '08', '10', '11', '15', '16'];
    }

    const extensions = ['xml', 'html'];

    for (const ext of extensions) {
        for (const suffix of suffixes) {
            const nomeFile = `${numProvv}_${suffix}.${ext}`;
            const url = `${MDP_BASE}?nodeRef=&schema=${schema}&nrg=${nrg}&nomeFile=${nomeFile}&subDir=Provvedimenti`;
            
            // log('🔍', `    Provo: ${suffix}.${ext}...`);
            const result = await downloadFullText(url);
            
            if (result.status === 'ok') {
                return result;
            }
            
            if (result.status === 'error' && result.code !== 404) {
                // Se c'è un errore di rete o timeout, fermiamoci
                return result;
            }
        }
    }

    return { status: 'not_found_all_attempts' };
}

async function downloadFullText(url) {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15000), // Timeout più breve per i tentativi
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.giustizia-amministrativa.it/',
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) return { status: 'error', code: response.status };

        const rawContent = await response.text();

        if (!rawContent || rawContent.length < 200) return { status: 'empty' };
        
        if (rawContent.includes('Pagina non trovata') || 
            rawContent.includes('Provvedimento non trovato') || 
            (!rawContent.includes('<Provvedimento>') && !rawContent.includes('<html'))) {
            return { status: 'not_found' };
        }

        // Estrai testo (gestisce sia XML che HTML in modo basico)
        let cleanText = extractTextFromXML(rawContent);
        
        // Se è HTML, proviamo a pulirlo un po' di più
        if (rawContent.includes('<html')) {
            cleanText = cleanText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                .replace(/<[^>]+>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim();
        }

        if (!cleanText || cleanText.length < 100) return { status: 'empty' };

        return {
            status: 'ok',
            cleanText: cleanText,
            charCount: cleanText.length
        };
    } catch (err) {
        return { status: 'error', message: err.message };
    }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
    const args = process.argv.slice(2);

    // Parametri CLI
    const sedeFilter = args.find(a => a.startsWith('--sede='))?.split('=')[1];
    const tipoFilter = args.find(a => a.startsWith('--tipo='))?.split('=')[1];
    const annoFilter = args.find(a => a.startsWith('--anno='))?.split('=')[1];
    const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
    const batchLimit = limitArg ? parseInt(limitArg) : 500; // Default: 500 per run
    const dryRun = args.includes('--dry-run');
    const onlySentenze = args.includes('--only-sentenze');
    const plenariaOnly = args.includes('--plenaria-only');

    log('🏛️', '═══════════════════════════════════════════════');
    log('🏛️', '  SCRAPER TESTO COMPLETO — Giustizia Amministrativa');
    log('🏛️', '  Download provvedimenti integrali');
    log('🏛️', '═══════════════════════════════════════════════');
    console.log();

    // ── SUPABASE CONNECTION ──
    const fs = await import('fs');
    const envFile = fs.readFileSync('.env', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });

    const SUPABASE_URL = env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
    const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_SERVICE_KEY) {
        log('❌', 'SUPABASE_SERVICE_KEY non impostata!');
        log('💡', 'Usa: set SUPABASE_SERVICE_KEY=eyJ... (Windows CMD)');
        log('💡', 'Oppure: $env:SUPABASE_SERVICE_KEY = "eyJ..." (PowerShell)');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── QUERY: Trova provvedimenti senza testo completo ──
    log('🔍', 'Cerco provvedimenti da scaricare...');

    let query = supabase
        .from('provvedimenti_ga')
        .select('id, tipo_provvedimento, sede_slug, sede_nome, numero_provvedimento, numero_ricorso, anno_pubblicazione, data_pubblicazione, sezione_nome')
        .is('testo_completo', null)   // Solo quelli senza testo
        .not('numero_ricorso', 'is', null)  // Serve il NRG per costruire l'URL
        .limit(batchLimit);

    if (sedeFilter) query = query.eq('sede_slug', sedeFilter);
    if (annoFilter) query = query.eq('anno_pubblicazione', parseInt(annoFilter));
    if (plenariaOnly) query = query.eq('sezione_nome', 'PLENARIA');

    if (tipoFilter) {
        query = query.eq('tipo_provvedimento', tipoFilter.toUpperCase());
    } else if (onlySentenze) {
        query = query.in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE']);
    }

    const { data: records, error: queryError } = await query;

    if (queryError) {
        log('❌', `Errore query Supabase: ${queryError.message}`);
        log('💡', 'Hai eseguito la migrazione per aggiungere la colonna testo_completo?');
        log('💡', 'Esegui in Supabase SQL Editor:');
        log('💡', '  ALTER TABLE provvedimenti_ga ADD COLUMN IF NOT EXISTS testo_completo TEXT;');
        process.exit(1);
    }

    if (!records || records.length === 0) {
        log('✅', 'Nessun provvedimento da scaricare (tutti hanno già il testo completo).');
        return;
    }

    log('📋', `Trovati ${records.length} provvedimenti da scaricare`);
    if (sedeFilter) log('📋', `  Filtro sede: ${sedeFilter}`);
    if (tipoFilter) log('📋', `  Filtro tipo: ${tipoFilter}`);
    if (annoFilter) log('📋', `  Filtro anno: ${annoFilter}`);
    console.log();

    if (dryRun) {
        log('🔍', 'DRY RUN — nessun download effettuato');
        for (const r of records.slice(0, 10)) {
            const url = buildDownloadUrl(r);
            log('  📄', `${r.tipo_provvedimento} n.${r.numero_provvedimento} (${r.sede_slug}) → ${url || 'URL non costruibile'}`);
        }
        if (records.length > 10) log('  ...', `e altri ${records.length - 10}`);
        return;
    }

    // ── DOWNLOAD ──
    const stats = {
        ok: 0,
        notFound: 0,
        errors: 0,
        noUrl: 0,
        totalChars: 0
    };

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const progress = `[${i + 1}/${records.length}]`;

        log('📥', `${progress} ${record.tipo_provvedimento} n.${record.numero_provvedimento} (${record.sede_slug} ${record.anno_pubblicazione})...`);

        const result = await downloadFullTextResilient(record);

        if (result.status === 'ok' && result.cleanText) {
            // Backup locale per sicurezza
            try {
                const cacheDir = `data/testi_ga/${record.sede_slug}/${record.anno_pubblicazione}`;
                if (!fs.existsSync(cacheDir)) {
                    fs.mkdirSync(cacheDir, { recursive: true });
                }
                const cacheFile = `${cacheDir}/${record.tipo_provvedimento.replace(/ /g, '_')}_${record.numero_provvedimento}.txt`;
                fs.writeFileSync(cacheFile, result.cleanText, 'utf8');
            } catch (fsErr) {
                log('⚠️', `  → Errore salvataggio backup locale: ${fsErr.message}`);
            }

            // Salva in Supabase
            const { error: updateError } = await supabase
                .from('provvedimenti_ga')
                .update({ testo_completo: result.cleanText })
                .eq('id', record.id);

            if (updateError) {
                log('⚠️', `  → Errore salvataggio DB: ${updateError.message}`);
                stats.errors++;
            } else {
                stats.ok++;
                stats.totalChars += result.charCount;
                log('✅', `  → ${result.charCount.toLocaleString('it-IT')} caratteri salvati (su DB e locale)`);
            }
        } else if (result.status === 'not_found_all_attempts') {
            stats.notFound++;
            log('⚠️', `  → Provvedimento non trovato dopo vari tentativi`);
        } else {
            stats.errors++;
            log('❌', `  → Errore: ${result.status} ${result.message || ''}`);
        }

        // Rate limiting
        await sleep(DELAY_MS);
    }

    // ── REPORT ──
    console.log();
    log('📊', '═══════════════════════════════════════════════');
    log('📊', '  REPORT FINALE');
    log('📊', '═══════════════════════════════════════════════');
    log('📊', `  Scaricati con successo: ${stats.ok}`);
    log('📊', `  Non trovati: ${stats.notFound}`);
    log('📊', `  Errori: ${stats.errors}`);
    log('📊', `  URL non costruibili: ${stats.noUrl}`);
    log('📊', `  Testo totale: ${(stats.totalChars / 1_000_000).toFixed(1)} milioni di caratteri`);
    console.log();
    log('💡', 'Per scaricare più provvedimenti, rilancia lo script.');
    log('💡', 'Lo script riprende automaticamente da dove si era fermato.');
}

// ═══════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
