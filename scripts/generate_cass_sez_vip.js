/**
 * GENERAZIONE SCHEDE VIP — Cassazione Sez. Semplici (Mancanti)
 * 
 * Processa i file .md appena scaricati in sentenze_sez_semplici/{anno}/
 * che NON hanno ancora una scheda VIP in sentenze_sez_semplici_vip/{anno}/
 * 
 * Input:  sentenze_sez_semplici/{anno}/*.md  (testo grezzo da ItalGiure)
 * Output: sentenze_sez_semplici_vip/{anno}/*.md
 * 
 * Lo script è idempotente: salta i file già processati.
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

const INPUT_DIR  = path.resolve('./sentenze_sez_semplici');
const OUTPUT_DIR = path.resolve('./sentenze_sez_semplici_vip');

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Consigliere della Suprema Corte di Cassazione, un severo Commissario del Concorso in Magistratura e un Data Engineer.

[C - CONTESTO]
Ti verrà fornito il testo integrale di una sentenza della Cassazione (sezione semplice — civile, penale, lavoro o tributaria).

[F - FINALITÀ]
Estrarre la ratio decidendi e cristallizzarla in una "Scheda Manualistica Oggettiva" ad altissima densità informativa per un database RAG destinato a candidati del concorso in magistratura.

[VINCOLI TASSATIVI]
1. Divieto copia-incolla: rielabora completamente, non trascrivere passaggi letterali.
2. Anonimizzazione: ometti nomi di persone fisiche, dati fiscali, denominazioni societarie specifiche. Usa qualifiche astratte ("il ricorrente", "la società", "la parte lesa").
3. Filtro di Triage (MANDATORIO):
   [TIER_1_TOP]: Sentenza che enuncia un principio di diritto chiaro e riutilizzabile.
   [TIER_2_APPLICATIVO]: Applicazione di principio noto a fattispecie specifica.
   [SCARTO_ASSOLUTO]: Dichiarata inammissibile/improcedibile per vizi formali, o testo troppo breve/corrotto per estrarre principi. FERMATI QUI.

--- STRUTTURA OUTPUT ---

🧾 METADATI RAG
* Rilevanza: [TIER_1_TOP / TIER_2_APPLICATIVO]
* Pronuncia: [es. Cass. Civ., Sez. I, Sent. n. 10902/2024]
* Materia: [es. Diritto Civile — Contratti / Diritto Penale — Reati contro la PA]
* Norme: [principali articoli applicati]

## 1. La Questione e il Thema Decidendum
[Cosa si discute: il motivo di ricorso, la questione interpretativa, l'interesse tutelato.]

## 2. Il Principio di Diritto
**[Enuncia in grassetto la regula iuris cristallizzata dalla Corte.]**

## 3. Ratio Decidendi
[L'iter logico-giuridico: perché la Corte ha deciso così, quali argomenti ha usato.]

## 4. Spendibilità Concorsuale
[2-3 punti: in quali tracce si usa questa sentenza, errori dogmatici da evitare.]

## 5. Tags
[5 hashtag per RAG, es. #DirittoContratti, #Inadempimento, #Cassazione, #RicorsoInammissibile, #OnereProva]`;

async function generateVIP(text, meta) {
    const prompt = `Analizza la seguente sentenza della Cassazione:\n\nMETADATI FILE: ${JSON.stringify(meta)}\n\nTESTO:\n${text.substring(0, 40000)}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            })
        }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`);
    const text_out = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text_out) throw new Error('Risposta API vuota');
    return text_out;
}

async function main() {
    console.log(`💎 Generazione VIP Cassazione Sez. Semplici (${MODEL_NAME})`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Raccogli tutti i file da processare (solo quelli appena scaricati, che NON hanno già VIP)
    const toProcess = [];

    for (const yearDir of fs.readdirSync(INPUT_DIR).filter(d => /^\d{4}$/.test(d)).sort()) {
        const inDir  = path.join(INPUT_DIR, yearDir);
        const outDir = path.join(OUTPUT_DIR, yearDir);
        fs.mkdirSync(outDir, { recursive: true });

        for (const file of fs.readdirSync(inDir).filter(f => f.endsWith('.md'))) {
            const outPath = path.join(outDir, file);
            if (fs.existsSync(outPath)) continue; // già fatto

            const size = fs.statSync(path.join(inDir, file)).size;
            if (size < 1000) continue; // troppo piccolo

            // Includi SOLO i file con un'intestazione riconoscibile (scaricati da noi)
            const fd = fs.openSync(path.join(inDir, file), 'r');
            const buf = Buffer.alloc(200);
            fs.readSync(fd, buf, 0, 200, 0);
            fs.closeSync(fd);
            const firstLine = buf.toString('utf8').split('\n')[0] || '';
            if (!firstLine.includes('Cass.') && !firstLine.includes('n.')) continue;

            toProcess.push({ year: yearDir, file, size });
        }
    }

    console.log(`📂 ${toProcess.length} sentenze da processare\n`);
    if (toProcess.length === 0) {
        console.log('✅ Niente da fare — tutte già processate o nessun file nuovo.');
        return;
    }

    let processed = 0, scarti = 0, errors = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const { year, file } = toProcess[i];
        const inPath  = path.join(INPUT_DIR, year, file);
        const outPath = path.join(OUTPUT_DIR, year, file);

        const content = fs.readFileSync(inPath, 'utf8');
        const firstLine = content.split('\n')[0] || '';

        // Estrai numero/anno dalla prima riga per i metadati
        const numMatch = firstLine.match(/n\.\s*(\d+)/);
        const meta = {
            anno: year,
            numero: numMatch?.[1] || '?',
            tipo: file.startsWith('snpen') ? 'penale' : file.startsWith('snciv') ? 'civile' : '?'
        };

        process.stdout.write(`[${i+1}/${toProcess.length}] ${year}/${file} (${Math.round(toProcess[i].size/1024)}KB)... `);

        let success = false;
        let retryCount = 0;

        while (!success && retryCount < 5) {
            try {
                const vip = await generateVIP(content, meta);

                if (vip.includes('[SCARTO_ASSOLUTO]')) {
                    console.log('⏭️ SCARTO');
                    scarti++;
                } else {
                    fs.writeFileSync(outPath, vip, 'utf8');
                    console.log(`✅ (${(vip.length/1024).toFixed(1)} KB)`);
                    processed++;
                }
                success = true;
                await new Promise(r => setTimeout(r, 1200));

            } catch (e) {
                retryCount++;
                const isRateLimit = e.message.includes('429') || e.message.includes('quota') ||
                                    e.message.includes('high demand') || e.message.includes('overloaded');
                if (isRateLimit) {
                    const wait = Math.min(30000 * retryCount, 120000);
                    console.error(`❌ (${retryCount}/5) Rate limit — attesa ${wait/1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                } else {
                    console.error(`❌ (${retryCount}/5): ${e.message.substring(0, 80)}`);
                    await new Promise(r => setTimeout(r, 8000));
                }
            }
        }
        if (!success) errors++;

        if ((processed + scarti) % 50 === 0 && processed > 0) {
            console.log(`\n📊 ${processed} gen | ${scarti} scarti | ${errors} errori | ${i+1}/${toProcess.length}\n`);
        }
    }

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RIEPILOGO Cass. Sez. Semplici VIP');
    console.log(`   ✅ Generati: ${processed}`);
    console.log(`   🗑️  Scarti:   ${scarti}`);
    console.log(`   ❌ Errori:   ${errors}`);
    console.log('═'.repeat(55));
}

main().catch(console.error);
