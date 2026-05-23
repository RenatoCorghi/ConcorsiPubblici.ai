/**
 * GENERAZIONE SCHEDE VIP — CORTE COSTITUZIONALE
 * 
 * Legge i file .md estratti dal portale Open Data CC (sentenze_corte_cost/)
 * e genera schede pedagogiche ad alta densità per il RAG.
 * 
 * Modello: Gemini 3 Flash Preview
 * Input: sentenze_corte_cost/cc_YYYY_NNNN.md
 * Output: sentenze_corte_cost_vip/cc_YYYY_NNNN.md
 */

import fs from 'fs';
import path from 'path';

// Caricamento .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview";

const INPUT_DIR = path.resolve('./sentenze_corte_cost');
const OUTPUT_DIR = path.resolve('./sentenze_corte_cost_vip');

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Giudice della Corte Costituzionale, un severo Commissario del Concorso in Magistratura e un Senior Data Engineer.

[C - CONTESTO]
Ti verrà fornito in input il testo integrale di una pronuncia della Corte Costituzionale (sentenza o ordinanza), estratta dal portale Open Data della Corte Costituzionale.

[F - FINALITÀ]
Il tuo obiettivo è fare reverse-engineering della pronuncia: devi estrarre il parametro costituzionale, la fattispecie normativa scrutinata, il tipo di sindacato esercitato (ragionevolezza, proporzionalità, bilanciamento) e cristallizzare la ratio decidendi in una "Scheda Manualistica Oggettiva" ad altissima densità informativa per un database vettoriale (RAG) destinato a candidati avanzati del concorso in magistratura.

[VINCOLI TASSATIVI]
1. Data Honesty e Divieto di Copia-Incolla: È SEVERAMENTE VIETATO trascrivere o parafrasare lunghi passaggi letterali della sentenza. Devi interiorizzare i concetti e riscriverli COMPLETAMENTE DA ZERO, usando una prosa accademica italiana asciutta e un lessico rigoroso.
2. Anonimizzazione Privacy: Ignora e ometti i nomi di persone fisiche coinvolte come parti, sostituendoli con qualifiche astratte (es. "il ricorrente", "il remittente"). I nomi dei Giudici costituzionali e del Relatore possono essere mantenuti.
3. Filtro di Triage e Qualità (MANDATORIO): Classifica la pronuncia:
   [TIER_1_TOP]: Sentenza che enuncia un principio costituzionale chiaro, dichiara l'illegittimità di una norma, opera un bilanciamento tra diritti fondamentali, o risolve una questione dogmatica di rilievo sistematico.
   [TIER_2_PROCEDURALE]: Pronuncia che, pur senza innovare sul piano sostanziale, contiene un'utile applicazione pratica (es. inammissibilità per difetto di rilevanza, rigetto per manifesta infondatezza, questioni di rito).
   [SCARTO_ASSOLUTO]: Decreto di mera fissazione udienza o atto privo di qualsiasi motivazione. (Fermati qui e non generare la scheda).

--- STRUTTURA DI OUTPUT RICHIESTA ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno, analizza logicamente la pronuncia passo dopo passo:
- Identifica il tipo di giudizio (in via incidentale, principale, conflitto di attribuzioni, ammissibilità referendum).
- Qualifica i parametri costituzionali invocati.
- Individua la norma oggetto di scrutinio e il tipo di decisione (accoglimento, rigetto, inammissibilità, interpretativa di rigetto, additiva, sostitutiva, monito).
- Valuta il Tier.

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown:

<thinking>
[Il tuo ragionamento analitico-dogmatico qui]
</thinking>

🧾 METADATI RAG
* Rilevanza: [TIER_1_TOP oppure TIER_2_PROCEDURALE]
* Pronuncia: [es. Corte Cost., Sent. n. 242/2019]
* Tipo Giudizio: [es. Giudizio di legittimità in via incidentale / Giudizio in via principale / Conflitto tra poteri]
* Tipo Decisione: [es. Accoglimento / Rigetto / Inammissibilità / Additiva di principio / Interpretativa di rigetto / Sostitutiva]
* Materia/Area: [es. Diritto penale – Fine vita / Diritto tributario – IRAP / Diritto del lavoro]
* Parametri Costituzionali: [es. Artt. 2, 13, 32 Cost.]

1. La Questione di Legittimità e il Giudizio a quo
[Sintetizza l'oggetto della questione: chi l'ha sollevata, quale norma è impugnata, quali parametri sono invocati e perché. Spiega la rilevanza nel giudizio a quo.]

2. Il Nodo Ermeneutico e il Quadro Normativo
[Spiega il dubbio interpretativo o il vulnus costituzionale lamentato. Se pertinente, illustra l'evoluzione normativa o il contesto in cui la questione si inserisce. Se esistono orientamenti divergenti, illustrali.]

3. Il Principio di Diritto (La Massima)
[Enuncia in modo netto e isolato (in grassetto) la regula iuris cristallizzata dalla Corte. Se la sentenza è di accoglimento, enuncia esattamente cosa viene dichiarato incostituzionale e in quale "nella parte in cui". Se è di rigetto, enuncia il principio interpretativo fatto salvo.]

4. Ratio Decidendi e Iter Argomentativo
[Ricostruisci l'iter logico-giuridico della Corte. Quali test ha applicato (ragionevolezza, proporzionalità, bilanciamento)? Perché la norma è o non è conforme a Costituzione? Separa visivamente [Dichiarato dalla Corte] da [Inquadramento Dogmatico Sistematico].]

5. Effetti della Pronuncia e Ricadute Sistematiche
[Quali sono le conseguenze pratiche della decisione? Se additiva, cosa viene "aggiunto" alla norma? Se interpretativa, quale interpretazione è costituzionalmente orientata? Se di monito, cosa si attende dal legislatore?]

6. Spendibilità Concorsuale
[Fornisci 2-3 consigli pratici a elenco puntato: in quali tracce concorsuali (es. "tema sui rapporti Stato-Regioni", "tema sul diritto alla salute") si usa questa sentenza? Quali errori dogmatici evitare?]

7. Tags
[5 hashtag essenziali per l'indicizzazione RAG, es. #BilanciamentoDiritti, #RagionevolezzaEx3Cost, #FineVita, #AdditivaDiPrincipio, #RapportiStatoRegioni]`;

async function generateVIP(text, meta) {
    const prompt = `Analizza la seguente pronuncia della Corte Costituzionale:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO INTEGRALE:\n${text.substring(0, 45000)}`;
    
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
        throw new Error('Risposta API vuota o senza contenuto');
    }
    return result.candidates[0].content.parts[0].text;
}

function extractMeta(content, filename) {
    // Estrai metadati dalla tabella markdown già presente nel file
    const meta = { filename };
    const getField = (label) => {
        const match = content.match(new RegExp(`\\| \\*\\*${label}\\*\\* \\| (.+?) \\|`));
        return match ? match[1].trim() : null;
    };
    meta.tipo = getField('Tipo') || 'Pronuncia';
    meta.numero = getField('Numero');
    meta.anno = getField('Anno');
    meta.ecli = getField('ECLI');
    meta.data_decisione = getField('Data Decisione');
    meta.presidente = getField('Presidente');
    meta.relatore = getField('Relatore');
    meta.citazioni = getField('Citazioni nelle Riviste');
    return meta;
}

async function main() {
    console.log(`💎 Avvio Generazione Schede VIP Corte Costituzionale (Modello: ${MODEL_NAME})...`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const files = fs.readdirSync(INPUT_DIR)
        .filter(f => f.endsWith('.md') && f.startsWith('cc_'))
        .sort();
    
    console.log(`📂 ${files.length} sentenze da processare`);

    // Filtra arg --from per ripresa
    const fromArg = process.argv.find(a => a.startsWith('--from='))?.split('=')[1];
    let startIdx = 0;
    if (fromArg) {
        startIdx = files.findIndex(f => f.includes(fromArg));
        if (startIdx < 0) startIdx = 0;
        console.log(`   ⏩ Ripresa da file #${startIdx}: ${files[startIdx]}`);
    }

    let processed = 0, skipped = 0, errors = 0, scarti = 0;

    for (let i = startIdx; i < files.length; i++) {
        const file = files[i];
        const outputPath = path.join(OUTPUT_DIR, file);

        // Skip se già generato
        if (fs.existsSync(outputPath)) {
            skipped++;
            continue;
        }

        const inputPath = path.join(INPUT_DIR, file);
        const content = fs.readFileSync(inputPath, 'utf8');

        // Pre-filtro: skip file troppo corti
        if (content.length < 2000) {
            console.log(`   ⏭️  [${i+1}/${files.length}] ${file} - troppo corto (${content.length} chars), salto.`);
            fs.writeFileSync(outputPath, "[SCARTO_ASSOLUTO] (Pre-filtro automatico: testo troppo corto)", 'utf8');
            scarti++;
            continue;
        }

        const meta = extractMeta(content, file);
        console.log(`   [${i+1}/${files.length}] Generazione VIP per: CC n. ${meta.numero}/${meta.anno} (${meta.citazioni})...`);

        let success = false;
        let retryCount = 0;

        while (!success && retryCount < 5) {
            try {
                const vipMarkdown = await generateVIP(content, meta);

                if (vipMarkdown.includes('[SCARTO_ASSOLUTO]')) {
                    console.log(`     ⏭️  SCARTO: Pronuncia senza principi utili.`);
                    scarti++;
                } else {
                    fs.writeFileSync(outputPath, vipMarkdown, 'utf8');
                    console.log(`     ✅ OK (${(vipMarkdown.length / 1024).toFixed(1)} KB)`);
                    processed++;
                }
                success = true;

                // Delay per rate limit
                await new Promise(r => setTimeout(r, 1500));

            } catch (e) {
                retryCount++;
                console.error(`     ❌ Errore (Tentativo ${retryCount}/5):`, e.message);
                if (e.message.includes("429") || e.message.includes("quota") || e.message.includes("overloaded") || e.message.includes("503") || e.message.includes("high demand") || e.message.includes("fetch failed")) {
                    const wait = Math.min(30000 * retryCount, 120000);
                    console.log(`⏳ Rate limit, attesa ${wait/1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                } else {
                    console.log("⏳ Attesa 10s prima del retry...");
                    await new Promise(r => setTimeout(r, 10000));
                }
            }
        }

        if (!success) {
            console.error(`     ❌ FALLITO dopo 5 tentativi: ${file}`);
            errors++;
        }

        // Progress report ogni 50
        if ((processed + scarti) % 50 === 0 && processed > 0) {
            console.log(`\n📊 Progresso: ${processed} generati | ${skipped} già presenti | ${scarti} scarti | ${errors} errori | ${i+1}/${files.length} totali\n`);
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 RIEPILOGO FINALE');
    console.log(`   ✅ Schede generate: ${processed}`);
    console.log(`   ⏭️  Già presenti: ${skipped}`);
    console.log(`   🗑️  Scarti: ${scarti}`);
    console.log(`   ❌ Errori: ${errors}`);
    console.log('═'.repeat(60));
}

main().catch(console.error);
