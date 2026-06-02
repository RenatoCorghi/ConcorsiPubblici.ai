/**
 * FILTRO 3 — MICRO-TRIAGE LLM (Gemini Flash)
 * 
 * Prende le sentenze con importance_tier = 'VIP_CANDIDATA' (score >= 55 dal Filtro 2)
 * e le sottopone a un micro-triage veloce con Gemini Flash.
 * 
 * Input per ogni sentenza (solo ~1500 chars):
 *   - Prime 300 chars (intestazione: corte, sezione, estremi)
 *   - 1200 chars che PRECEDONO "P.Q.M." o "PER QUESTI MOTIVI"
 *     (= dove il giudice enuncia il principio prima del dispositivo)
 * 
 * Output: {vip: boolean, materia: string, motivo: string}
 * 
 * Le sentenze confermate vip=true vengono marcate per la generazione VIP completa.
 * 
 * Uso:
 *   node scripts/filtro3-micro-triage.mjs                      # processa tutte le VIP_CANDIDATA
 *   node scripts/filtro3-micro-triage.mjs --sample=50          # campione di 50
 *   node scripts/filtro3-micro-triage.mjs --dry-run             # mostra cosa manderebbe senza chiamare API
 *   node scripts/filtro3-micro-triage.mjs --sede=cds            # solo CdS
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
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';

// ── CLI ARGS ──
const args = process.argv.slice(2);
const sampleArg = args.find(a => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1]) : Infinity;
const DRY_RUN = args.includes('--dry-run');
const sedeArg = args.find(a => a.startsWith('--sede='));
const SEDE_FILTER = sedeArg ? sedeArg.split('=')[1] : null;
const annoArg = args.find(a => a.startsWith('--anno='));
const ANNO_FILTER = annoArg ? parseInt(annoArg.split('=')[1]) : null;

// ═══════════════════════════════════════════════════════
// ESTRAZIONE CONTESTO PRE-P.Q.M.
// ═══════════════════════════════════════════════════════

/**
 * Estrae i 1200 caratteri che precedono "P.Q.M." o "PER QUESTI MOTIVI".
 * Questo è il punto dove il giudice cristallizza il suo ragionamento
 * giuridico prima del dispositivo.
 * 
 * Fallback: se P.Q.M. non trovato, prende gli ultimi 1200 chars del testo.
 */
function extractPrePQM(text, chars = 1200) {
    // Cerca P.Q.M. o varianti
    const pqmPatterns = [
        /P\s*\.\s*Q\s*\.\s*M\s*\./gi,
        /PER\s+QUESTI\s+MOTIVI/gi,
        /P\.Q\.M\./gi,
    ];

    let pqmIndex = -1;
    for (const pattern of pqmPatterns) {
        const match = pattern.exec(text);
        if (match && (pqmIndex === -1 || match.index < pqmIndex)) {
            pqmIndex = match.index;
        }
        pattern.lastIndex = 0; // Reset regex
    }

    if (pqmIndex === -1) {
        // Fallback: ultimi 1200 chars
        return text.substring(Math.max(0, text.length - chars));
    }

    // Prendi i 1200 chars PRIMA di P.Q.M.
    const start = Math.max(0, pqmIndex - chars);
    return text.substring(start, pqmIndex).trim();
}

/**
 * Estrae le prime 300 chars (intestazione: corte, sezione, data, estremi)
 */
function extractHeader(text, chars = 300) {
    return text.substring(0, chars);
}

// ═══════════════════════════════════════════════════════
// PROMPT MICRO-TRIAGE
// ═══════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Sei un Consigliere di Stato con 30 anni di esperienza e un Commissario del Concorso in Magistratura Amministrativa.

Ti viene fornito un FRAMMENTO di una sentenza del TAR o del Consiglio di Stato: l'intestazione e il ragionamento giuridico immediatamente precedente al dispositivo (P.Q.M.).

Devi decidere se questa sentenza merita una scheda VIP (dossier d'autore) per candidati a concorsi in magistratura.

RISPONDI ESCLUSIVAMENTE con un JSON valido (nessun testo prima o dopo):
{
  "vip": true/false,
  "materia": "breve etichetta della materia (es. Appalti, Urbanistica, Pubblico Impiego, Processo Amministrativo, Silenzio-Inadempimento, Autotutela, Concessioni, Sanzioni)",
  "motivo": "1 riga: perché sì o perché no"
}

CRITERI per vip=true (TUTTI devono valere):
1. La sentenza ENUNCIA un PRINCIPIO DI DIRITTO esplicito o implicito, NON si limita ad applicare la legge al caso concreto
2. Il principio ha RILEVANZA DOGMATICA (utile per un tema concorsuale, non è banale applicazione di norme pacifiche)
3. La sentenza affronta un NODO ERMENEUTICO (contrasto, interpretazione innovativa, estensione di un istituto)

CRITERI per vip=false:
- Mera applicazione di giurisprudenza costante senza aggiungere nulla
- Decisione su questioni puramente fattuali/probatorie
- Rigetto per motivi procedurali (tardività, inammissibilità, difetto di legittimazione)
- Semplice conferma di orientamento consolidato senza approfondimento`;

// ═══════════════════════════════════════════════════════
// CHIAMATA GEMINI FLASH
// ═══════════════════════════════════════════════════════

async function microTriage(header, prePQM, meta, retries = 5) {
    const userPrompt = `METADATI: ${JSON.stringify(meta)}

INTESTAZIONE (prime 300 chars):
${header}

RAGIONAMENTO PRE-DISPOSITIVO (1200 chars prima del P.Q.M.):
${prePQM}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
                })
            });

            const data = await response.json();

            if (!response.ok) {
                const errMsg = data.error?.message || `HTTP ${response.status}`;
                if (response.status === 429 || response.status === 503) {
                    if (attempt === retries) {
                        return { vip: false, materia: 'ERRORE', motivo: 'Rate limit persistente (429/503)' };
                    }
                    const wait = 5000 * attempt + Math.random() * 3000;
                    console.log(`     ⏳ Rate limit. Attendo ${(wait/1000).toFixed(1)}s (tentativo ${attempt}/${retries})...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(errMsg);
            }

            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Risposta vuota da Gemini');

            // Parse JSON (estrai solo l'oggetto JSON per ignorare testo aggiuntivo "Here is the...")
            let cleanJson = rawText;
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleanJson = jsonMatch[0];
            } else {
                cleanJson = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            }

            try {
                return JSON.parse(cleanJson);
            } catch (parseErr) {
                console.error(`\n[PARSE ERROR] Raw text was:\n${rawText}\n`);
                throw parseErr;
            }

        } catch (e) {
            if (attempt === retries) {
                return { vip: false, materia: 'ERRORE', motivo: e.message };
            }
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    return { vip: false, materia: 'ERRORE', motivo: 'Max retries superati senza esito' };
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  FILTRO 3 — MICRO-TRIAGE GEMINI FLASH');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Modello: ${MODEL}`);
    console.log(`  Campione: ${SAMPLE_SIZE === Infinity ? 'TUTTE' : SAMPLE_SIZE}`);
    console.log(`  Dry-run: ${DRY_RUN}`);
    if (SEDE_FILTER) console.log(`  Sede: ${SEDE_FILTER}`);
    console.log();

    // ── Fetch VIP candidate dal DB ──
    let query = supabase
        .from('provvedimenti_ga')
        .select('id, tipo_provvedimento, sede_slug, sede_nome, numero_provvedimento, anno_pubblicazione, sezione_nome, importance_score, testo_completo')
        .eq('importance_tier', 'VIP_CANDIDATA')
        .not('testo_completo', 'is', null)
        .order('importance_score', { ascending: false });

    if (SEDE_FILTER) query = query.eq('sede_slug', SEDE_FILTER);
    if (ANNO_FILTER) query = query.eq('anno_pubblicazione', ANNO_FILTER);
    if (SAMPLE_SIZE !== Infinity) query = query.limit(SAMPLE_SIZE);

    const { data: records, error } = await query;

    if (error) {
        console.error('❌ Errore fetch:', error.message);
        process.exit(1);
    }

    if (!records || records.length === 0) {
        console.log('⚠️ Nessuna VIP_CANDIDATA trovata. Hai eseguito il Filtro 2 (batch scoring)?');
        return;
    }

    console.log(`📋 Trovate ${records.length} VIP candidate da triare.\n`);

    // ── Statistiche ──
    const stats = {
        total: 0,
        confirmed: 0,
        rejected: 0,
        errors: 0,
        byMateria: {},
        confirmedList: [],
    };

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        stats.total++;

        const header = extractHeader(record.testo_completo);
        const prePQM = extractPrePQM(record.testo_completo);
        const meta = {
            corte: record.sede_slug?.startsWith('cds') ? 'Consiglio di Stato' : 'TAR',
            sede: record.sede_nome,
            numero: record.numero_provvedimento,
            anno: record.anno_pubblicazione,
            sezione: record.sezione_nome,
            score_filtro2: record.importance_score,
        };

        const titolo = `${record.tipo_provvedimento} n.${record.numero_provvedimento}/${record.anno_pubblicazione} (${record.sede_slug})`;

        if (DRY_RUN) {
            console.log(`\n📄 [${i + 1}/${records.length}] ${titolo} — score: ${record.importance_score}`);
            console.log(`   Header: ${header.substring(0, 100)}...`);
            console.log(`   PrePQM: ${prePQM.substring(0, 100)}...`);
            continue;
        }

        // ── Chiamata Gemini Flash ──
        const result = await microTriage(header, prePQM, meta);

        const emoji = result.vip ? '🌟' : '📋';
        console.log(`${emoji} [${i + 1}/${records.length}] [score:${record.importance_score}] ${titolo} → ${result.vip ? 'VIP ✅' : 'NO ❌'} | ${result.materia} | ${result.motivo}`);

        if (result.materia === 'ERRORE') {
            stats.errors++;
        } else if (result.vip) {
            stats.confirmed++;
            stats.confirmedList.push({ titolo, score: record.importance_score, materia: result.materia, motivo: result.motivo });
        } else {
            stats.rejected++;
        }

        // Track materia
        if (result.materia && result.materia !== 'ERRORE') {
            stats.byMateria[result.materia] = (stats.byMateria[result.materia] || 0) + 1;
        }

        // ── Aggiorna DB ──
        const newTier = result.vip ? 'VIP_CONFERMATA' : 'TIER_2'; // Se non è VIP, ricade in Tier 2
        await supabase
            .from('provvedimenti_ga')
            .update({
                importance_tier: newTier,
                // Salva anche la materia rilevata dall'LLM per uso futuro
            })
            .eq('id', record.id);

        // Rate limiting — Aumentato a 4000ms per evitare il rate limit di 15 RPM su free-tier
        await new Promise(r => setTimeout(r, 4000));
    }

    if (DRY_RUN) {
        console.log('\n🔍 DRY RUN completato. Nessuna chiamata API effettuata.');
        return;
    }

    // ── Report ──
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  RISULTATI MICRO-TRIAGE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Totale analizzate:   ${stats.total}`);
    console.log(`  VIP confermate:      ${stats.confirmed} (${((stats.confirmed / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  Rigettate → Tier 2:  ${stats.rejected} (${((stats.rejected / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  Errori:              ${stats.errors}`);

    console.log('\n  📊 DISTRIBUZIONE PER MATERIA:');
    const sortedMaterie = Object.entries(stats.byMateria).sort((a, b) => b[1] - a[1]);
    for (const [materia, count] of sortedMaterie) {
        console.log(`  ${materia.padEnd(35)} ${count}`);
    }

    if (stats.confirmedList.length > 0) {
        console.log(`\n  🌟 VIP CONFERMATE (prime 20):`);
        for (const vip of stats.confirmedList.slice(0, 20)) {
            console.log(`  [${vip.score}] ${vip.titolo} — ${vip.materia}`);
            console.log(`       ${vip.motivo}`);
        }
    }

    // Proiezione
    if (stats.total > 0) {
        const confirmRate = stats.confirmed / stats.total;
        console.log(`\n  🔮 TASSO DI CONFERMA: ${(confirmRate * 100).toFixed(1)}%`);
        console.log(`  Se applicato a ~12.000-15.000 candidate → ~${Math.round(confirmRate * 13500)} schede VIP finali`);
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
