/**
 * GENERAZIONE SCHEDE VIP — CONSIGLIO DI STATO
 * 
 * Legge i file .md da sentenze_admin_mancanti/ (testo grezzo CdS/TAR)
 * e genera schede pedagogiche ad alta densità per il RAG.
 * 
 * Input: sentenze_admin_mancanti/CdS_YYYY_NNNN.md
 * Output: sentenze_admin_mancanti_vip/CdS_YYYY_NNNN.md
 */
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview";

const INPUT_DIR = path.resolve('./sentenze_admin_mancanti');
const OUTPUT_DIR = path.resolve('./sentenze_admin_mancanti_vip');

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Consigliere di Stato, un severo Commissario del Concorso in Magistratura e un Senior Data Engineer.

[C - CONTESTO]
Ti verrà fornito in input il testo integrale di una sentenza del Consiglio di Stato o di un Tribunale Amministrativo Regionale (TAR).

[F - FINALITÀ]
Il tuo obiettivo è fare reverse-engineering della pronuncia: devi estrarre la questione di diritto amministrativo, i principi enunciati, la fattispecie normativa e cristallizzare la ratio decidendi in una "Scheda Manualistica Oggettiva" ad altissima densità informativa per un database vettoriale (RAG) destinato a candidati avanzati del concorso in magistratura.

[VINCOLI TASSATIVI]
1. Data Honesty e Divieto di Copia-Incolla: È SEVERAMENTE VIETATO trascrivere o parafrasare lunghi passaggi letterali della sentenza. Devi interiorizzare i concetti e riscriverli COMPLETAMENTE DA ZERO.
2. Anonimizzazione Privacy: Ignora e ometti i nomi delle parti private, le loro generalità, i numeri fiscali, le denominazioni complete di società, ecc. Sostituiscili con qualifiche astratte (es. "il ricorrente", "l'appaltante", "la stazione appaltante").
3. Filtro di Triage e Qualità (MANDATORIO): Classifica la pronuncia:
   [TIER_1_TOP]: Sentenza che enuncia un principio di diritto amministrativo chiaro, interpreta norme del Codice dei Contratti Pubblici, del processo amministrativo, di urbanistica, o risolve questioni dogmatiche.
   [TIER_2_PROCEDURALE]: Pronuncia che contiene un'utile applicazione pratica ma non innova sul piano sostanziale.
   [SCARTO_ASSOLUTO]: Atto privo di motivazione sostanziale o testo troppo breve/corrotto. (Fermati qui.)

--- STRUTTURA DI OUTPUT RICHIESTA ---

🧾 METADATI RAG
* Rilevanza: [TIER_1_TOP oppure TIER_2_PROCEDURALE]
* Pronuncia: [es. Cons. Stato, Sez. V, Sent. n. 2270/2019]
* Materia/Area: [es. Diritto Amministrativo – Appalti / Urbanistica / Accesso agli atti / Pubblico impiego]
* Norme di Riferimento: [Principali articoli di legge applicati]

1. La Questione di Diritto e il Thema Decidendum
[Sintetizza cosa si discute: l'oggetto del ricorso, le posizioni delle parti, l'interesse legittimo azionato.]

2. Il Quadro Normativo e Giurisprudenziale
[Illustra le norme coinvolte e l'eventuale giurisprudenza precedente rilevante.]

3. Il Principio di Diritto (La Massima)
[Enuncia in grassetto e in modo netto la regula iuris cristallizzata dal Consiglio di Stato / TAR.]

4. Ratio Decidendi e Iter Argomentativo
[Ricostruisci l'iter logico-giuridico del Collegio.]

5. Effetti della Pronuncia e Ricadute Sistematiche
[Quali sono le conseguenze pratiche della decisione?]

6. Spendibilità Concorsuale
[2-3 consigli puntati: in quali tracce concorsuali si usa questa sentenza.]

7. Tags
[5 hashtag per RAG, es. #AppaltiPubblici, #CodiceContratti, #SilenzioAssenso, #AccessoAtti, #MotivazionePAA]`;

async function generateVIP(text, meta) {
    const prompt = `Analizza la seguente sentenza di giustizia amministrativa:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO INTEGRALE:\n${text.substring(0, 45000)}`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || `Errore API: ${response.status}`);
    if (!result.candidates || !result.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Risposta API vuota');
    }
    return result.candidates[0].content.parts[0].text;
}

async function main() {
    console.log(`💎 Generazione VIP Giustizia Amministrativa (${MODEL_NAME})`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const files = fs.readdirSync(INPUT_DIR)
        .filter(f => f.endsWith('.md') && (f.startsWith('CdS_') || f.startsWith('TAR_')))
        .sort();
    
    console.log(`📂 ${files.length} sentenze trovate`);

    // Filtra quelle troppo piccole (solo metadati, <3KB)
    const validFiles = files.filter(f => {
        const size = fs.statSync(path.join(INPUT_DIR, f)).size;
        return size >= 3000;
    });
    console.log(`✅ ${validFiles.length} con testo sufficiente (>3KB)`);

    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : validFiles.length;

    let processed = 0, skipped = 0, errors = 0, scarti = 0;

    for (let i = 0; i < Math.min(limit, validFiles.length); i++) {
        const file = validFiles[i];
        const outputPath = path.join(OUTPUT_DIR, file);

        if (fs.existsSync(outputPath)) { skipped++; continue; }

        const content = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
        
        // Estrai metadati dal filename
        const match = file.match(/(CdS|TAR)_(\d{4})_(\d+)/);
        const meta = {
            corte: match[1] === 'CdS' ? 'Consiglio di Stato' : 'TAR',
            anno: match ? match[2] : '?',
            numero: match ? match[3] : '?'
        };

        console.log(`  [${i+1}/${Math.min(limit, validFiles.length)}] ${file}...`);

        let success = false;
        let retryCount = 0;

        while (!success && retryCount < 5) {
            try {
                const vip = await generateVIP(content, meta);

                if (vip.includes('[SCARTO_ASSOLUTO]')) {
                    console.log(`    ⏭️ SCARTO`);
                    scarti++;
                } else {
                    fs.writeFileSync(outputPath, vip, 'utf8');
                    console.log(`    ✅ OK (${(vip.length / 1024).toFixed(1)} KB)`);
                    processed++;
                }
                success = true;
                await new Promise(r => setTimeout(r, 1500));

            } catch (e) {
                retryCount++;
                console.error(`    ❌ Errore (${retryCount}/5):`, e.message);
                if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('high demand')) {
                    const wait = Math.min(30000 * retryCount, 120000);
                    console.log(`⏳ Rate limit, attesa ${wait/1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                } else {
                    await new Promise(r => setTimeout(r, 10000));
                }
            }
        }

        if (!success) { errors++; }

        if ((processed + scarti) % 25 === 0 && processed > 0) {
            console.log(`\n📊 ${processed} generati | ${skipped} già | ${scarti} scarti | ${errors} errori | ${i+1}/${validFiles.length}\n`);
        }
    }

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RIEPILOGO');
    console.log(`   ✅ Generati: ${processed}`);
    console.log(`   ⏭️  Già presenti: ${skipped}`);
    console.log(`   🗑️  Scarti: ${scarti}`);
    console.log(`   ❌ Errori: ${errors}`);
    console.log('═'.repeat(55));
}

main().catch(console.error);
