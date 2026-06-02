/**
 * BATCH SCORING — Persiste i punteggi del Filtro 2 su provvedimenti_ga
 * 
 * Legge TUTTE le sentenze con testo_completo e senza importance_score,
 * calcola il punteggio euristico e lo salva nel DB.
 * 
 * Prerequisito: eseguire la migrazione 004_screening_fts.sql
 * 
 * Uso:
 *   node scripts/batch-score-sentenze.mjs                 # processa tutte
 *   node scripts/batch-score-sentenze.mjs --limit=5000    # limite
 *   node scripts/batch-score-sentenze.mjs --sede=cds      # solo CdS
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── ENV ──
const envPath = path.join(__dirname, '..', '.env');
const envFile = readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ── CLI ARGS ──
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
const sedeArg = args.find(a => a.startsWith('--sede='));
const SEDE_FILTER = sedeArg ? sedeArg.split('=')[1] : null;
const annoArg = args.find(a => a.startsWith('--anno='));
const ANNO_FILTER = annoArg ? parseInt(annoArg.split('=')[1]) : null;

// ── RIVISTE INDEX ──
let rivisteSet = new Set();
try {
    const indexPath = path.join(__dirname, '..', 'data', 'riviste_sentenze_index.json');
    if (existsSync(indexPath)) {
        const indexData = JSON.parse(readFileSync(indexPath, 'utf8'));
        if (indexData.sentenze) {
            indexData.sentenze
                .filter(s => s.corte === 'TAR' || s.corte === 'Consiglio di Stato')
                .forEach(s => rivisteSet.add(`${s.anno}_${s.numero}`));
        }
    }
} catch (e) { /* ignore */ }

// ══════════════════════════════════════
// REGOLE DI SCORING (identiche al filtro2)
// ══════════════════════════════════════

const POSITIVE_RULES = [
    { pattern: /principio di diritto/gi, score: 30, label: 'principio_di_diritto', countOnce: false },
    { pattern: /contrasto\s+(giurisprudenziale|interpretativo|ermeneutico)/gi, score: 25, label: 'contrasto_giurisprudenziale', countOnce: true },
    { pattern: /questione di giurisdizione/gi, score: 20, label: 'questione_giurisdizione', countOnce: true },
    { pattern: /rimessione|rimette\s+(la\s+)?questione|rimette\s+all/gi, score: 20, label: 'rimessione', countOnce: true },
    { pattern: /overruling|revirement/gi, score: 25, label: 'overruling', countOnce: true },
    { pattern: /orientamento\s+(maggioritario|minoritario|non\s+univoco)/gi, score: 15, label: 'orientamento_maggioritario', countOnce: true },
    { pattern: /tesi\s+(maggioritaria|minoritaria)/gi, score: 15, label: 'tesi_contrapposta', countOnce: true },
    { pattern: /Adunanza\s+Plenaria/gi, score: 15, label: 'cita_adunanza_plenaria', countOnce: false, maxCount: 3 },
    { pattern: /natura\s+giuridica/gi, score: 15, label: 'natura_giuridica', countOnce: true },
    { pattern: /inquadramento\s+(dogmatico|sistematico|giuridico)/gi, score: 15, label: 'inquadramento_dogmatico', countOnce: true },
    { pattern: /diritto\s+vivente/gi, score: 15, label: 'diritto_vivente', countOnce: true },
    { pattern: /in\s+(parziale\s+)?riforma/gi, score: 15, label: 'riforma_tar', countOnce: true },
    { pattern: /Corte\s+Costituzionale/gi, score: 15, label: 'cita_corte_cost', countOnce: true },
    { pattern: /Corte\s+di\s+Giustizia/gi, score: 15, label: 'cita_cgue', countOnce: true },
    { pattern: /Sezioni\s+Unite|S\.U\./gi, score: 15, label: 'cita_sezioni_unite', countOnce: true },
    { pattern: /art\.\s*\d+\s*(Cost\.|della\s+Costituzione)/gi, score: 10, label: 'art_costituzione', countOnce: false, maxCount: 3 },
    { pattern: /art\.\s*\d+\s*CEDU/gi, score: 10, label: 'art_cedu', countOnce: false, maxCount: 2 },
    { pattern: /eccesso\s+di\s+potere/gi, score: 5, label: 'eccesso_potere', countOnce: true },
    { pattern: /legittimo\s+affidamento/gi, score: 10, label: 'legittimo_affidamento', countOnce: true },
    { pattern: /proporzionalità/gi, score: 5, label: 'proporzionalita', countOnce: true },
    { pattern: /discrezionalità\s+(amministrativa|tecnica)/gi, score: 10, label: 'discrezionalita', countOnce: true },
    { pattern: /annullamento\s+d'ufficio|autotutela/gi, score: 10, label: 'autotutela', countOnce: true },
    { pattern: /silenzio[\s-](inadempimento|assenso|rifiuto|rigetto)/gi, score: 10, label: 'silenzio', countOnce: true },
    { pattern: /interesse\s+legittimo/gi, score: 3, label: 'interesse_legittimo', countOnce: true },
    { pattern: /ne\s+bis\s+in\s+idem/gi, score: 10, label: 'ne_bis_in_idem', countOnce: true },
    { pattern: /obiter\s+dict(um|a)/gi, score: 10, label: 'obiter_dictum', countOnce: true },
    { pattern: /^\s*DIRITTO\s*$/m, score: 10, label: 'sezione_diritto_separata', countOnce: true },
    { pattern: /^\s*FATTO\s*$/m, score: 5, label: 'sezione_fatto_separata', countOnce: true },
];

const NEGATIVE_RULES_INCIPIT = [
    { pattern: /improcedibil[ei]/gi, score: -25, label: 'improcedibile' },
    { pattern: /cessata\s+la\s+materia\s+del\s+contendere/gi, score: -25, label: 'cessata_materia' },
    { pattern: /sopravvenuta\s+carenza\s+di\s+interesse/gi, score: -20, label: 'carenza_interesse' },
    { pattern: /perenzione/gi, score: -20, label: 'perenzione' },
    { pattern: /estinzione\s+del\s+giudizio/gi, score: -20, label: 'estinzione' },
    { pattern: /inammissibil[ei]/gi, score: -15, label: 'inammissibile' },
];

const NEGATIVE_RULES_GLOBAL = [
    { pattern: /conformemente\s+alla\s+giurisprudenza\s+(costante|consolidata|pacifica)/gi, score: -5, label: 'giurisp_pacifica', countOnce: true },
];

function getSizeScore(charCount) {
    if (charCount < 2000) return -999;
    if (charCount < 3000) return -20;
    if (charCount < 5000) return -15;
    if (charCount < 10000) return -5;
    if (charCount > 100000) return 15;
    if (charCount > 50000) return 10;
    if (charCount > 20000) return 5;
    return 0;
}

function scoreSentenza(text, record) {
    const charCount = text.length;
    let totalScore = getSizeScore(charCount);

    if (totalScore === -999) return { score: -999, tier: 'SCARTO' };

    for (const rule of POSITIVE_RULES) {
        const matches = text.match(rule.pattern);
        if (matches && matches.length > 0) {
            const count = rule.countOnce ? 1 : Math.min(matches.length, rule.maxCount || matches.length);
            totalScore += rule.score * count;
        }
    }

    const incipit = text.substring(0, 800);
    for (const rule of NEGATIVE_RULES_INCIPIT) {
        if (rule.pattern.test(incipit)) totalScore += rule.score;
        rule.pattern.lastIndex = 0;
    }

    for (const rule of NEGATIVE_RULES_GLOBAL) {
        if (rule.pattern.test(text)) totalScore += rule.score;
        rule.pattern.lastIndex = 0;
    }

    // Bonus riviste
    const yearNumMatch = `${record.anno_pubblicazione}_${record.numero_provvedimento}`;
    if (rivisteSet.has(yearNumMatch)) totalScore += 50;

    // Bonus Plenaria
    if (record.sezione_nome && record.sezione_nome.toUpperCase().includes('PLENARIA')) totalScore += 50;

    let tier;
    if (totalScore >= 55) tier = 'VIP_CANDIDATA';
    else if (totalScore >= 15) tier = 'TIER_2';
    else tier = 'TIER_3';

    return { score: totalScore, tier };
}

// ══════════════════════════════════════
// MAIN
// ══════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  BATCH SCORING — Persistenza punteggi Filtro 2');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Limite: ${LIMIT === Infinity ? 'NESSUNO (tutte)' : LIMIT}`);
    if (SEDE_FILTER) console.log(`  Sede: ${SEDE_FILTER}`);
    console.log(`  Riviste note: ${rivisteSet.size}`);
    console.log();

    const BATCH_SIZE = 50; // Fetch 50 alla volta (testo_completo è grande)
    let offset = 0;
    let processed = 0;
    let tiers = { VIP_CANDIDATA: 0, TIER_2: 0, TIER_3: 0, SCARTO: 0 };
    const startTime = Date.now();

    while (processed < LIMIT) {
        const remaining = Math.min(BATCH_SIZE, LIMIT - processed);

        let query = supabase
            .from('provvedimenti_ga')
            .select('id, tipo_provvedimento, sede_slug, numero_provvedimento, anno_pubblicazione, sezione_nome, testo_completo')
            .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE'])
            .not('testo_completo', 'is', null)
            .is('importance_score', null)  // Solo quelli non ancora scorati
            .range(offset, offset + remaining - 1);

        if (SEDE_FILTER) query = query.eq('sede_slug', SEDE_FILTER);
        if (ANNO_FILTER) query = query.eq('anno_pubblicazione', ANNO_FILTER);

        const { data, error } = await query;

        if (error) {
            console.error('❌ Errore fetch:', error.message);
            break;
        }

        if (!data || data.length === 0) {
            if (processed === 0) {
                console.log('✅ Tutte le sentenze sono già state scorate!');
            }
            break;
        }

        // Calcola score e prepara update batch
        const updates = data.map(record => {
            const result = scoreSentenza(record.testo_completo, record);
            tiers[result.tier]++;
            return {
                id: record.id,
                importance_score: result.score,
                importance_tier: result.tier,
            };
        });

        // Batch update (uno alla volta per semplicità, Supabase non ha batch update nativo)
        for (const update of updates) {
            const { error: updateErr } = await supabase
                .from('provvedimenti_ga')
                .update({
                    importance_score: update.importance_score,
                    importance_tier: update.importance_tier,
                })
                .eq('id', update.id);

            if (updateErr) {
                console.error(`⚠️ Errore update ${update.id}: ${updateErr.message}`);
            }
        }

        processed += data.length;
        // offset remains 0 because the query filters out the processed records
        // offset += data.length;

        // Progress
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / elapsed * 60).toFixed(0);
        process.stdout.write(`\r  📊 ${processed.toLocaleString('it-IT')} scorate | VIP: ${tiers.VIP_CANDIDATA} | T2: ${tiers.TIER_2} | T3: ${tiers.TIER_3} | ${rate}/min | ${elapsed}s`);

        if (data.length < remaining) break;
    }

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  RISULTATI BATCH SCORING');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Totale scorate: ${processed}`);
    console.log(`  VIP_CANDIDATA:  ${tiers.VIP_CANDIDATA} (${((tiers.VIP_CANDIDATA / processed) * 100).toFixed(1)}%)`);
    console.log(`  TIER_2:         ${tiers.TIER_2} (${((tiers.TIER_2 / processed) * 100).toFixed(1)}%)`);
    console.log(`  TIER_3:         ${tiers.TIER_3} (${((tiers.TIER_3 / processed) * 100).toFixed(1)}%)`);
    console.log(`  SCARTO:         ${tiers.SCARTO}`);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  Tempo totale:   ${elapsed}s`);
    console.log();
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
