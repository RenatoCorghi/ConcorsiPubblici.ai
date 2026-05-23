/**
 * GENERAZIONE SCHEDE VIP — CORTI GIUSTIZIA TRIBUTARIA
 * 
 * Prende i testi estratti dai PDF (data/tributario_testi/pdf_*.md)
 * e genera schede pedagogiche VIP per il RAG.
 * 
 * Input:  data/tributario_testi/pdf_*.md
 * Output: schede_tributario_vip/{id}_vip.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

const INPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_testi');
const OUTPUT_DIR = path.join(__dirname, '..', 'schede_tributario_vip');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Giudice della Corte di Giustizia Tributaria (ex Commissione Tributaria), un severo Commissario del Concorso in Magistratura e un Senior Data Engineer.

[C - CONTESTO]
Ti verrà fornito il testo integrale di una sentenza della Corte di Giustizia Tributaria (CGT di primo o secondo grado, ex CTP/CTR) o di sentenze SS.UU. in materia tributaria.

[F - FINALITÀ]
Il tuo obiettivo è estrarre la questione di diritto tributario, i principi enunciati, la fattispecie normativa e cristallizzare la ratio decidendi in una "Scheda Manualistica Oggettiva" ad altissima densità informativa per un database vettoriale (RAG) destinato a candidati avanzati del concorso in magistratura.

[VINCOLI TASSATIVI]
1. Data Honesty: È SEVERAMENTE VIETATO trascrivere passaggi letterali della sentenza. Interiorizza i concetti e riscrivili da zero.
2. Anonimizzazione Privacy: Ignora e ometti i nomi delle parti private. Sostituiscili con qualifiche astratte (es. "il contribuente", "l'ufficio finanziario", "la società appellante").
3. Filtro di Qualità: Classifica la pronuncia:
   [TIER_1_TOP]: Sentenza che enuncia un principio di diritto tributario chiaro, interpreta norme fiscali, o risolve questioni dogmatiche.
   [TIER_2_PROCEDURALE]: Pronuncia con utile applicazione pratica ma senza innovazione sostanziale.
   [SCARTO_ASSOLUTO]: Atto privo di motivazione o testo troppo breve/corrotto. (Fermati qui.)

--- STRUTTURA DI OUTPUT RICHIESTA ---

🧾 METADATI RAG
* Rilevanza: [TIER_1_TOP oppure TIER_2_PROCEDURALE]
* Pronuncia: [es. CGT I grado Roma, Sez. 16, Sent. n. 17787/2025]
* Materia/Area: [es. Diritto Tributario – IVA / Accertamento / Riscossione / Agevolazioni]
* Norme di Riferimento: [Principali articoli di legge applicati]

1. La Questione di Diritto e il Thema Decidendum
[Sintetizza cosa si discute: l'oggetto del ricorso, le posizioni delle parti, il tributo contestato.]

2. Il Quadro Normativo e Giurisprudenziale
[Illustra le norme fiscali coinvolte e l'eventuale giurisprudenza precedente rilevante.]

3. Il Principio di Diritto (La Massima)
[Enuncia in grassetto e in modo netto la regula iuris cristallizzata dalla Corte.]

4. Ratio Decidendi e Iter Argomentativo
[Ricostruisci l'iter logico-giuridico del Collegio. Perché ha prevalso la tesi accolta?]

5. Effetti della Pronuncia e Ricadute Sistematiche
[Quali sono le conseguenze pratiche? Impatto su contribuenti, uffici finanziari, processo tributario?]

6. Spendibilità Concorsuale
[2-3 consigli puntati: in quali tracce si usa questa sentenza. Es: "Traccia su contraddittorio preventivo", "Traccia sull'IVA comunitaria".]

7. Tags
[5 hashtag per RAG, es. #ContaddittorioPreventivo #DLgs218/1997 #AccertamentoIVA #ProcedimentoTributario #CodiceTributario]`;

async function generateVIP(text, filename) {
    const prompt = `Analizza la seguente sentenza della Corte di Giustizia Tributaria:\n\n${text.substring(0, 50000)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`);
        if (!result.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error('Risposta API vuota');
        return result.candidates[0].content.parts[0].text;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

async function main() {
    console.log(`💎 Generazione Schede VIP — Corti Giustizia Tributaria (${MODEL_NAME})`);

    const files = fs.readdirSync(INPUT_DIR)
        .filter(f => f.startsWith('pdf_') && f.endsWith('.md'))
        .sort();

    console.log(`📂 ${files.length} sentenze trovate\n`);

    let processed = 0, skipped = 0, errors = 0, scarti = 0;

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const outFile = path.join(OUTPUT_DIR, f.replace('pdf_', 'cgt_'));

        let needsRegenerate = false;
        if (fs.existsSync(outFile)) {
            // Verifica se il file di testo è più recente della scheda VIP (es. perché è stata aggiunta la massima ufficiale)
            const textMtime = fs.statSync(path.join(INPUT_DIR, f)).mtimeMs;
            const vipMtime = fs.statSync(outFile).mtimeMs;
            if (vipMtime < textMtime) {
                needsRegenerate = true;
            }
        }

        if (fs.existsSync(outFile) && !needsRegenerate) {
            console.log(`  [${i+1}/${files.length}] ⏭  ${f.substring(0,40)}...`);
            skipped++;
            continue;
        }

        const content = fs.readFileSync(path.join(INPUT_DIR, f), 'utf8');
        console.log(`  [${i+1}/${files.length}] ${f.substring(0,40)}... (${Math.round(content.length/1024)}KB)`);

        let success = false, retryCount = 0;

        while (!success && retryCount < 5) {
            try {
                const vip = await generateVIP(content, f);

                if (vip.includes('[SCARTO_ASSOLUTO]')) {
                    console.log(`    ⏭️ SCARTO`);
                    scarti++;
                } else {
                    fs.writeFileSync(outFile, vip, 'utf8');
                    console.log(`    ✅ OK (${(vip.length / 1024).toFixed(1)} KB)`);
                    processed++;
                }
                success = true;
                await new Promise(r => setTimeout(r, 1500));

            } catch (e) {
                retryCount++;
                console.error(`    ❌ Errore (${retryCount}/5): ${e.message.substring(0, 60)}`);
                if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('overloaded')) {
                    const wait = Math.min(30000 * retryCount, 120000);
                    console.log(`    ⏳ Rate limit, attesa ${wait/1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                } else {
                    await new Promise(r => setTimeout(r, 8000));
                }
            }
        }
        if (!success) errors++;
    }

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RIEPILOGO TRIBUTARIO VIP');
    console.log(`   ✅ Generati: ${processed}`);
    console.log(`   ⏭️  Già presenti: ${skipped}`);
    console.log(`   🗑️  Scarti: ${scarti}`);
    console.log(`   ❌ Errori: ${errors}`);
    console.log('═'.repeat(55));
}

main().catch(console.error);
