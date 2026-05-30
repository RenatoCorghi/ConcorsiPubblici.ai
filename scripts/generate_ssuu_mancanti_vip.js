/**
 * GENERAZIONE SCHEDE VIP — SS.UU. Mancanti (appena scaricate)
 * 
 * Processa i 66 file SS.UU. appena scaricati da ItalGiure (testo grezzo)
 * e genera schede VIP nella directory sentenze_ssuu_vip_schede.
 * 
 * Input: sentenze_ssuu_vip/{anno}/*.md (testo grezzo con formato "n. XXXXX/YYYY")
 * Output: sentenze_ssuu_vip_schede/{anno}/*.md
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

const INPUT_DIR = path.resolve('./sentenze_ssuu_vip');
const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip_schede');

const SYSTEM_PROMPT = `Ruolo: Sei un illustre Consigliere della Suprema Corte di Cassazione, un severo Commissario del Concorso in Magistratura e un Data Engineer.
Il tuo compito è analizzare la sentenza fornita in input e redigere un "Dossier d'Autore" (Scheda VIP) ad altissimo contenuto scientifico per un database RAG destinato a candidati avanzati.

VINCOLI FORMALI (Strict RAG-Friendly):
- Usa una prosa accademica italiana fluida ma asciutta e moderna. VIETATO lo stile barocco o ridondante.
- Usa elenchi puntati e il grassetto chirurgico sui concetti chiave per massimizzare la leggibilità e la densità semantica.
- Non inventare nulla: attieniti al testo. Se un elemento manca, scrivi "Non presente".
- ANONIMIZZAZIONE: Ometti i nomi di persone fisiche, sostituendoli con qualifiche astratte.

STRUTTURA RIGOROSA (Markdown):

# [Estremi della Sentenza]

## 1. Il Fatto Storico e il Merito Sostanziale
Sintetizza in massimo 3 righe la vicenda concreta. Spiega come la Corte ha risolto la questione di diritto sostanziale sottesa alla lite.

## 2. Il Contrasto Giurisprudenziale (La Questione Rimessa)
Spiega analiticamente il dubbio ermeneutico che ha richiesto l'intervento nomofilattico. Scomponi chiaramente la Tesi Minoritaria e la Tesi Maggioritaria preesistenti.

## 3. Il Principio di Diritto (Massima)
Enuncia in modo netto, isolato e in grassetto la regula iuris definitiva cristallizzata dalla Corte.

## 4. Ratio Decidendi (Il nucleo vincolante)
Ricostruisci l'iter logico-giuridico della Corte. Spiega PERCHÉ è stata preferita una tesi rispetto all'altra.

## 5. Obiter Dicta (Spunti Sistematici)
Estrai passaggi non strettamente necessari per decidere il caso, ma fondamentali per inquadrare il sistema.

## 6. Spendibilità Concorsuale
Fornisci 2-3 consigli pratici a elenchi puntati. In quali tracce si usa questa sentenza? Quali sono gli errori dogmatici da evitare?

## 7. Tags per RAG
Genera 5 parole chiave precedute dall'hashtag per facilitare l'indicizzazione.`;

async function generateVIP(text) {
    const prompt = `Analizza la seguente sentenza delle Sezioni Unite della Corte di Cassazione:\n\n${text.substring(0, 40000)}`;
    
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
    if (!result.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error('Risposta vuota');
    return result.candidates[0].content.parts[0].text;
}

async function main() {
    console.log(`💎 Generazione Schede VIP — SS.UU. Mancanti (Modello: ${MODEL_NAME})`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Trova tutti i file SS.UU. non ancora processati
    const toProcess = [];
    const years = fs.readdirSync(INPUT_DIR).filter(d => /^\d{4}$/.test(d) && fs.statSync(path.join(INPUT_DIR, d)).isDirectory());
    
    for (const year of years) {
        const yearDir = path.join(INPUT_DIR, year);
        const outYearDir = path.join(OUTPUT_DIR, year);
        fs.mkdirSync(outYearDir, { recursive: true });
        
        const files = fs.readdirSync(yearDir).filter(f => f.endsWith('.md'));
        for (const f of files) {
            const outPath = path.join(outYearDir, f);
            if (fs.existsSync(outPath)) continue; // già processato
            
            const content = fs.readFileSync(path.join(yearDir, f), 'utf8');
            // ═══ SAFETY GATE: Oscuramento e contenuto minimo ═══
            const isOscurato = /in fase di oscuramento|sentenza richiesta.*oscuramento|provvedimento.*non.*disponibile|testo.*non.*disponibile|documento.*non.*reperibile/i.test(content);
            const strippedLen = content.replace(/\s+/g, ' ').trim().length;
            if (isOscurato) {
                console.warn(`   🚫 SKIP (sentenza oscurata): ${f}`);
                continue;
            }
            if (strippedLen < 1000) {
                console.warn(`   ⚠️ SKIP (contenuto troppo breve: ${strippedLen} chars): ${f}`);
                continue;
            }
            // Processa solo file con testo sufficiente e che non sono già schede VIP
            if (!content.includes('## 1.')) {
                toProcess.push({ year, file: f, size: content.length });
            }
        }
    }

    console.log(`📂 ${toProcess.length} sentenze da processare\n`);

    let processed = 0, errors = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const { year, file } = toProcess[i];
        const inputPath = path.join(INPUT_DIR, year, file);
        const outputPath = path.join(OUTPUT_DIR, year, file);

        const content = fs.readFileSync(inputPath, 'utf8');
        // ═══ SAFETY GATE (doppio check al processing) ═══
        if (/in fase di oscuramento|sentenza richiesta.*oscuramento/i.test(content) || content.replace(/\s+/g, ' ').trim().length < 1000) {
            console.log(`[${i+1}/${toProcess.length}] ${year}/${file}... 🚫 SKIP (oscurato/breve)`);
            continue;
        }
        process.stdout.write(`[${i+1}/${toProcess.length}] ${year}/${file}... `);

        let success = false;
        let retryCount = 0;
        while (!success && retryCount < 5) {
            try {
                const vip = await generateVIP(content);
                fs.writeFileSync(outputPath, vip, 'utf8');
                console.log(`✅ (${(vip.length/1024).toFixed(1)} KB)`);
                processed++;
                success = true;
                await new Promise(r => setTimeout(r, 1500));
            } catch (e) {
                retryCount++;
                console.error(`❌ (${retryCount}/5): ${e.message}`);
                if (e.message.includes('429') || e.message.includes('quota') || e.message.includes('high demand') || e.message.includes('overloaded')) {
                    const wait = Math.min(30000 * retryCount, 120000);
                    console.log(`⏳ Rate limit, attesa ${wait/1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                } else {
                    await new Promise(r => setTimeout(r, 10000));
                }
            }
        }
        if (!success) errors++;

        if ((processed) % 50 === 0 && processed > 0) {
            console.log(`\n📊 Progresso: ${processed} generate | ${errors} errori | ${i+1}/${toProcess.length}\n`);
        }
    }

    console.log('\n' + '═'.repeat(55));
    console.log(`📊 COMPLETATO: ${processed} schede generate | ${errors} errori`);
    console.log('═'.repeat(55));
}

main().catch(console.error);
