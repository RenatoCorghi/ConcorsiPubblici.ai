/**
 * FILTRO 2 — SCORING EURISTICO SENTENZE GA
 * 
 * Legge le sentenze da provvedimenti_ga (testo_completo),
 * applica ~20 pattern regex con punteggi, e classifica in 4 tier:
 *   - AUTO-VIP (score >= 40 oppure Plenaria/citata in riviste)
 *   - TIER 2 (score 15-39 → embedding solo "Diritto")
 *   - TIER 3 (score < 15 → solo FTS, zero embedding)
 *   - SCARTO (testo troppo corto < 2000 chars)
 *
 * Uso:
 *   node scripts/filtro2-score-sentenze.mjs                    # campione 500
 *   node scripts/filtro2-score-sentenze.mjs --sample=2000      # campione 2000
 *   node scripts/filtro2-score-sentenze.mjs --sample=0         # TUTTE (lento!)
 *   node scripts/filtro2-score-sentenze.mjs --verbose          # mostra dettagli per ogni sentenza
 *   node scripts/filtro2-score-sentenze.mjs --sede=cds         # solo CdS
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
const sampleArg = args.find(a => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1]) : 500;
const VERBOSE = args.includes('--verbose');
const sedeArg = args.find(a => a.startsWith('--sede='));
const SEDE_FILTER = sedeArg ? sedeArg.split('=')[1] : null;

// ── RIVISTE INDEX (sentenze già citate nelle riviste giuridiche) ──
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
        console.log(`📚 Caricate ${rivisteSet.size} sentenze GA citate nelle riviste.\n`);
    }
} catch (e) {
    console.log(`⚠️ Impossibile caricare riviste_sentenze_index.json: ${e.message}\n`);
}

// ═══════════════════════════════════════════════════════
// REGOLE DI SCORING
// ═══════════════════════════════════════════════════════

/**
 * Segnali POSITIVI — dogmatica, principi, citazioni autorevoli.
 * 
 * Calibrazione:
 * - +30: segnale fortissimo, quasi sempre = sentenza importante
 * - +20-25: segnale forte, merita attenzione
 * - +15: segnale moderato, significativo se combinato con altri
 * - +10: segnale debole ma utile per accumulare punteggio
 * - +5: micro-segnale, contribuisce solo in massa
 * 
 * Nota: "natura giuridica" è tenuta a +15 (non +25) perché appare
 * anche in contesti routinari ("la natura giuridica dell'autorizzazione...").
 * "inquadramento dogmatico" è esteso a "sistematico/giuridico" perché
 * i giudici usano raramente la parola "dogmatico".
 */
const POSITIVE_RULES = [
    // ── Segnali fortissimi (+30) ──
    { pattern: /principio di diritto/gi, score: 30, label: 'principio_di_diritto', countOnce: false },

    // ── Segnali forti (+20-25) ──
    { pattern: /contrasto\s+(giurisprudenziale|interpretativo|ermeneutico)/gi, score: 25, label: 'contrasto_giurisprudenziale', countOnce: true },
    { pattern: /questione di giurisdizione/gi, score: 20, label: 'questione_giurisdizione', countOnce: true },
    { pattern: /rimessione|rimette\s+(la\s+)?questione|rimette\s+all/gi, score: 20, label: 'rimessione', countOnce: true },
    { pattern: /overruling|revirement/gi, score: 25, label: 'overruling', countOnce: true },
    { pattern: /orientamento\s+(maggioritario|minoritario|non\s+univoco)/gi, score: 15, label: 'orientamento_maggioritario', countOnce: true },
    { pattern: /tesi\s+(maggioritaria|minoritaria)/gi, score: 15, label: 'tesi_contrapposta', countOnce: true },
    
    // ── Segnali moderati (+15) ──
    { pattern: /Adunanza\s+Plenaria/gi, score: 15, label: 'cita_adunanza_plenaria', countOnce: false, maxCount: 3 },
    { pattern: /natura\s+giuridica/gi, score: 15, label: 'natura_giuridica', countOnce: true },
    { pattern: /inquadramento\s+(dogmatico|sistematico|giuridico)/gi, score: 15, label: 'inquadramento_dogmatico', countOnce: true },
    { pattern: /diritto\s+vivente/gi, score: 15, label: 'diritto_vivente', countOnce: true },
    { pattern: /in\s+(parziale\s+)?riforma/gi, score: 15, label: 'riforma_tar', countOnce: true },
    { pattern: /Corte\s+Costituzionale/gi, score: 15, label: 'cita_corte_cost', countOnce: true },
    { pattern: /Corte\s+di\s+Giustizia/gi, score: 15, label: 'cita_cgue', countOnce: true },
    { pattern: /Sezioni\s+Unite|S\.U\./gi, score: 15, label: 'cita_sezioni_unite', countOnce: true },

    // ── Citazioni costituzionali/CEDU (+10 ciascuna, max 3) ──
    { pattern: /art\.\s*\d+\s*(Cost\.|della\s+Costituzione)/gi, score: 10, label: 'art_costituzione', countOnce: false, maxCount: 3 },
    { pattern: /art\.\s*\d+\s*CEDU/gi, score: 10, label: 'art_cedu', countOnce: false, maxCount: 2 },

    // ── Segnali deboli ma cumulativi (+5-10) ──
    { pattern: /eccesso\s+di\s+potere/gi, score: 5, label: 'eccesso_potere', countOnce: true },
    { pattern: /legittimo\s+affidamento/gi, score: 10, label: 'legittimo_affidamento', countOnce: true },
    { pattern: /proporzionalità/gi, score: 5, label: 'proporzionalita', countOnce: true },
    { pattern: /discrezionalità\s+(amministrativa|tecnica)/gi, score: 10, label: 'discrezionalita', countOnce: true },
    { pattern: /annullamento\s+d'ufficio|autotutela/gi, score: 10, label: 'autotutela', countOnce: true },
    { pattern: /silenzio[\s-](inadempimento|assenso|rifiuto|rigetto)/gi, score: 10, label: 'silenzio', countOnce: true },
    { pattern: /interesse\s+legittimo/gi, score: 3, label: 'interesse_legittimo', countOnce: true },
    { pattern: /ne\s+bis\s+in\s+idem/gi, score: 10, label: 'ne_bis_in_idem', countOnce: true },
    { pattern: /obiter\s+dict(um|a)/gi, score: 10, label: 'obiter_dictum', countOnce: true },

    // ── Segnale strutturale: sezioni separate = ragionamento denso ──
    { pattern: /^\s*DIRITTO\s*$/m, score: 10, label: 'sezione_diritto_separata', countOnce: true },
    { pattern: /^\s*FATTO\s*$/m, score: 5, label: 'sezione_fatto_separata', countOnce: true },
];

/**
 * Segnali NEGATIVI — indici di sentenza routinaria/procedurale.
 * Applicati SOLO se appaiono nelle prime 800 chars (intestazione/incipit).
 */
const NEGATIVE_RULES_INCIPIT = [
    { pattern: /improcedibil[ei]/gi, score: -25, label: 'improcedibile' },
    { pattern: /cessata\s+la\s+materia\s+del\s+contendere/gi, score: -25, label: 'cessata_materia' },
    { pattern: /sopravvenuta\s+carenza\s+di\s+interesse/gi, score: -20, label: 'carenza_interesse' },
    { pattern: /perenzione/gi, score: -20, label: 'perenzione' },
    { pattern: /estinzione\s+del\s+giudizio/gi, score: -20, label: 'estinzione' },
    { pattern: /inammissibil[ei]/gi, score: -15, label: 'inammissibile' },
];

/**
 * Segnali negativi generali (tutto il testo).
 */
const NEGATIVE_RULES_GLOBAL = [
    { pattern: /conformemente\s+alla\s+giurisprudenza\s+(costante|consolidata|pacifica)/gi, score: -5, label: 'giurisp_pacifica', countOnce: true },
];

// ── Segnali dimensionali ──
function getSizeScore(charCount) {
    if (charCount < 2000) return { score: -999, label: 'SCARTO_TROPPO_CORTO' };
    if (charCount < 3000) return { score: -20, label: 'molto_corto' };
    if (charCount < 5000) return { score: -15, label: 'corto' };
    if (charCount < 10000) return { score: -5, label: 'medio_corto' };
    if (charCount > 100000) return { score: 15, label: 'molto_lungo' };
    if (charCount > 50000) return { score: 10, label: 'lungo' };
    if (charCount > 20000) return { score: 5, label: 'medio_lungo' };
    return { score: 0, label: 'medio' };
}

// ═══════════════════════════════════════════════════════
// MOTORE DI SCORING
// ═══════════════════════════════════════════════════════

function scoreSentenza(record) {
    const text = record.testo_completo || '';
    const charCount = text.length;
    
    let totalScore = 0;
    const matchedRules = [];

    // 1. Dimensione
    const sizeResult = getSizeScore(charCount);
    totalScore += sizeResult.score;
    matchedRules.push({ label: sizeResult.label, score: sizeResult.score });

    if (sizeResult.score === -999) {
        return { score: -999, tier: 'SCARTO', matchedRules, charCount };
    }

    // 2. Segnali positivi (tutto il testo)
    for (const rule of POSITIVE_RULES) {
        const matches = text.match(rule.pattern);
        if (matches && matches.length > 0) {
            const count = rule.countOnce ? 1 : Math.min(matches.length, rule.maxCount || matches.length);
            const ruleScore = rule.score * count;
            totalScore += ruleScore;
            matchedRules.push({ label: rule.label, score: ruleScore, count: matches.length });
        }
    }

    // 3. Segnali negativi (incipit — prime 800 chars)
    const incipit = text.substring(0, 800);
    for (const rule of NEGATIVE_RULES_INCIPIT) {
        if (rule.pattern.test(incipit)) {
            totalScore += rule.score;
            matchedRules.push({ label: rule.label, score: rule.score });
        }
        rule.pattern.lastIndex = 0; // Reset regex
    }

    // 4. Segnali negativi globali
    for (const rule of NEGATIVE_RULES_GLOBAL) {
        if (rule.pattern.test(text)) {
            totalScore += rule.score;
            matchedRules.push({ label: rule.label, score: rule.score });
        }
        rule.pattern.lastIndex = 0;
    }

    // 5. Bonus: sentenza citata nelle riviste
    const yearNumMatch = `${record.anno_pubblicazione}_${record.numero_provvedimento}`;
    if (rivisteSet.has(yearNumMatch)) {
        totalScore += 50; // Auto-boost decisivo
        matchedRules.push({ label: 'CITATA_IN_RIVISTE', score: 50 });
    }

    // 6. Bonus: Plenaria
    if (record.sezione_nome && record.sezione_nome.toUpperCase().includes('PLENARIA')) {
        totalScore += 50;
        matchedRules.push({ label: 'ADUNANZA_PLENARIA_SEZIONE', score: 50 });
    }

    // ── Classificazione tier ──
    let tier;
    if (totalScore >= 55) tier = 'VIP_CANDIDATA';
    else if (totalScore >= 15) tier = 'TIER_2';
    else tier = 'TIER_3';

    return { score: totalScore, tier, matchedRules, charCount };
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  FILTRO 2 — SCORING EURISTICO SENTENZE GA');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Campione: ${SAMPLE_SIZE === 0 ? 'TUTTE' : SAMPLE_SIZE}`);
    if (SEDE_FILTER) console.log(`  Sede: ${SEDE_FILTER}`);
    console.log(`  Verbose: ${VERBOSE}`);
    console.log();

    // ── Statistiche aggregate ──
    const stats = {
        total: 0,
        tiers: { VIP_CANDIDATA: 0, TIER_2: 0, TIER_3: 0, SCARTO: 0 },
        scoreDistribution: {},
        topVIP: [],       // Top 20 VIP candidate
        topScarto: [],    // Campione scarti
        ruleHits: {},     // Quante volte ciascuna regola ha matchato
        bySede: {},       // Distribuzione per sede
    };

    // ── Fetch in batch ──
    const BATCH_SIZE = 100;
    let offset = 0;
    let fetched = 0;

    while (SAMPLE_SIZE === 0 || fetched < SAMPLE_SIZE) {
        const remaining = SAMPLE_SIZE === 0 ? BATCH_SIZE : Math.min(BATCH_SIZE, SAMPLE_SIZE - fetched);

        let query = supabase
            .from('provvedimenti_ga')
            .select('id, tipo_provvedimento, sede_slug, sede_nome, numero_provvedimento, anno_pubblicazione, sezione_nome, testo_completo')
            .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE'])
            .not('testo_completo', 'is', null)
            .range(offset, offset + remaining - 1);

        if (SEDE_FILTER) query = query.eq('sede_slug', SEDE_FILTER);

        const { data, error } = await query;

        if (error) {
            console.error('❌ Errore fetch:', error.message);
            break;
        }
        if (!data || data.length === 0) {
            if (fetched === 0) console.log('⚠️ Nessun record trovato.');
            break;
        }

        for (const record of data) {
            const result = scoreSentenza(record);
            stats.total++;
            stats.tiers[result.tier]++;

            // Score distribution (buckets di 10)
            const bucket = result.score === -999 ? 'SCARTO' : `${Math.floor(result.score / 10) * 10}`;
            stats.scoreDistribution[bucket] = (stats.scoreDistribution[bucket] || 0) + 1;

            // Rule hits
            for (const rule of result.matchedRules) {
                stats.ruleHits[rule.label] = (stats.ruleHits[rule.label] || 0) + 1;
            }

            // Per sede
            const sede = record.sede_slug || 'unknown';
            if (!stats.bySede[sede]) stats.bySede[sede] = { VIP_CANDIDATA: 0, TIER_2: 0, TIER_3: 0, SCARTO: 0, total: 0 };
            stats.bySede[sede][result.tier]++;
            stats.bySede[sede].total++;

            // Top VIP
            if (result.tier === 'VIP_CANDIDATA') {
                stats.topVIP.push({
                    id: record.id,
                    titolo: `${record.tipo_provvedimento} n.${record.numero_provvedimento}/${record.anno_pubblicazione}`,
                    sede: record.sede_slug,
                    sezione: record.sezione_nome,
                    score: result.score,
                    chars: result.charCount,
                    rules: result.matchedRules.filter(r => r.score > 0).map(r => r.label).join(', ')
                });
            }

            if (VERBOSE) {
                const emoji = result.tier === 'VIP_CANDIDATA' ? '🌟' : result.tier === 'TIER_2' ? '📄' : result.tier === 'SCARTO' ? '🗑️' : '📋';
                console.log(`${emoji} [${result.score.toString().padStart(4)}] ${record.tipo_provvedimento} n.${record.numero_provvedimento}/${record.anno_pubblicazione} (${record.sede_slug}) → ${result.tier}`);
                if (result.matchedRules.length > 0 && result.tier !== 'SCARTO') {
                    const significantRules = result.matchedRules.filter(r => Math.abs(r.score) >= 10);
                    if (significantRules.length > 0) {
                        console.log(`     Segnali: ${significantRules.map(r => `${r.label}(${r.score > 0 ? '+' : ''}${r.score})`).join(', ')}`);
                    }
                }
            }
        }

        fetched += data.length;
        offset += data.length;

        // Progress
        if (!VERBOSE && fetched % 500 === 0) {
            process.stdout.write(`  📊 Processate ${fetched} sentenze...\r`);
        }

        if (data.length < remaining) break; // Fine dei record
    }

    // ═══════════════════════════════════════════════════════
    // REPORT
    // ═══════════════════════════════════════════════════════
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  RISULTATI SCORING');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Totale sentenze analizzate: ${stats.total}\n`);

    // ── Distribuzione Tier ──
    console.log('  📊 DISTRIBUZIONE TIER:');
    console.log('  ─────────────────────────────────────────');
    for (const [tier, count] of Object.entries(stats.tiers)) {
        const pct = ((count / stats.total) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(pct / 2));
        console.log(`  ${tier.padEnd(16)} ${count.toString().padStart(6)} (${pct.padStart(5)}%) ${bar}`);
    }

    // ── Distribuzione Score ──
    console.log('\n  📈 DISTRIBUZIONE SCORE (bucket da 10):');
    console.log('  ─────────────────────────────────────────');
    const sortedBuckets = Object.entries(stats.scoreDistribution)
        .sort((a, b) => {
            if (a[0] === 'SCARTO') return -1;
            if (b[0] === 'SCARTO') return 1;
            return parseInt(a[0]) - parseInt(b[0]);
        });
    for (const [bucket, count] of sortedBuckets) {
        const pct = ((count / stats.total) * 100).toFixed(1);
        const bar = '▓'.repeat(Math.min(40, Math.round(pct)));
        const label = bucket === 'SCARTO' ? '  SCARTO ' : `  ${bucket.padStart(4)}-${(parseInt(bucket) + 9).toString().padEnd(3)}`;
        console.log(`${label} ${count.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
    }

    // ── Regole più frequenti ──
    console.log('\n  🎯 REGOLE PIÙ FREQUENTI:');
    console.log('  ─────────────────────────────────────────');
    const sortedRules = Object.entries(stats.ruleHits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25);
    for (const [rule, count] of sortedRules) {
        const pct = ((count / stats.total) * 100).toFixed(1);
        console.log(`  ${rule.padEnd(30)} ${count.toString().padStart(5)} (${pct.padStart(5)}%)`);
    }

    // ── Top VIP ──
    if (stats.topVIP.length > 0) {
        stats.topVIP.sort((a, b) => b.score - a.score);
        console.log(`\n  🌟 TOP 20 VIP CANDIDATE (su ${stats.topVIP.length} totali):`);
        console.log('  ─────────────────────────────────────────');
        for (const vip of stats.topVIP.slice(0, 20)) {
            console.log(`  [${vip.score.toString().padStart(3)}] ${vip.titolo} (${vip.sede}) — ${(vip.chars / 1000).toFixed(0)}KB`);
            console.log(`        Segnali: ${vip.rules}`);
        }
    }

    // ── Distribuzione per Sede ──
    console.log('\n  🏛️ DISTRIBUZIONE PER SEDE:');
    console.log('  ─────────────────────────────────────────────────────────────────────');
    console.log('  ' + 'SEDE'.padEnd(32) + 'TOT'.padStart(6) + 'VIP'.padStart(7) + 'T2'.padStart(7) + 'T3'.padStart(7) + 'SCRT'.padStart(7));
    console.log('  ' + '─'.repeat(66));
    const sortedSedi = Object.entries(stats.bySede).sort((a, b) => b[1].total - a[1].total);
    for (const [sede, counts] of sortedSedi) {
        console.log('  ' + 
            sede.padEnd(32) + 
            counts.total.toString().padStart(6) +
            counts.VIP_CANDIDATA.toString().padStart(7) +
            counts.TIER_2.toString().padStart(7) +
            counts.TIER_3.toString().padStart(7) +
            counts.SCARTO.toString().padStart(7)
        );
    }

    // ── Proiezione su 150K ──
    console.log('\n  🔮 PROIEZIONE SU TUTTE LE 149.753 SENTENZE:');
    console.log('  ─────────────────────────────────────────');
    const factor = 149753 / stats.total;
    for (const [tier, count] of Object.entries(stats.tiers)) {
        const projected = Math.round(count * factor);
        console.log(`  ${tier.padEnd(16)} ~${projected.toLocaleString('it-IT').padStart(8)}`);
    }
    console.log();
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
