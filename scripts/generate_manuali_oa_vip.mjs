/**
 * GENERATORE MASSIVO VIP MANUALI OA — BUP & Roma TrE-Press
 * Estrae sistematicamente segmenti dottrinali di 8 pagine dai PDF ed elabora schede manualistiche v3.
 * Gestisce l'inferenza automatica della materia e salta i file già elaborati.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import * as pdfjsLib from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';

// === ENV ===
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

const REWRITE_PROMPT = `Sei un professore ordinario di diritto che scrive un MANUALE DIDATTICO COMPLETAMENTE ORIGINALE per la preparazione al concorso in Magistratura.
Ti viene fornita una scheda di approfondimento giuridico. Il tuo compito è RISCRIVERLA DA ZERO creando un'opera interamente nuova, seguendo TASSATIVAMENTE queste regole:

### REGOLE DI RISCRITTURA
1. **ANCORA TUTTO ALLA FONTE UFFICIALE:** Il punto di partenza deve essere la sentenza, la legge o l'istituto. MAI citare l'autore del contributo originale.
2. **RIFORMULA INTEGRALMENTE:** Non copiare nessuna frase. Rielabora ogni concetto con parole tue.
3. **NESSUN RIFERIMENTO EDITORIALE:** Non citare mai nomi di case editrici o autori. Sei un manualista, non un recensore.
4. **ANTI-PARAPHRASE LEAKAGE (CRITICO):** Sono VIETATI costrutti come "l'autore osserva/rileva/sottolinea". Usa ESCLUSIVAMENTE verbi assertivi: "la norma impone", "la Cassazione ha chiarito", "il principio consolidato sancisce".
5. **DISTRUZIONE STRUTTURALE:** Cambia l'ordine espositivo. Parti SEMPRE dal dato normativo, analizza la casistica, chiudi con la rilevanza concorsuale.

### STRUTTURA DI OUTPUT
🧾 METADATI RAG
* Tipo Documento: Scheda Manualistica
* Riferimento: [Estremi della sentenza/norma principale o istituto]
* Istituto Principale: [Nome Istituto]
* Materia: [Diritto Amministrativo / Diritto Civile / Diritto Processuale Civile / Diritto Penale / Diritto Tributario]
* Fonte Originale: Dottrina manualistica OA

1. Dato Normativo e Principio di Diritto
2. Casistica Giurisprudenziale e Orientamenti
3. Questioni Aperte e Profils Critici
4. Rilevanza Concorsuale
5. Tags
`;

// Inferenza automatica della materia in base al nome del file
function inferMateria(filename) {
    const fn = filename.toLowerCase();
    if (fn.includes('processo_civile') || fn.includes('proc_civile') || fn.includes('arbitrato')) {
        return 'Diritto Processuale Civile';
    }
    if (fn.includes('tributario')) {
        return 'Diritto Tributario';
    }
    if (fn.includes('penale') || fn.includes('punire') || fn.includes('discrezionalita_penale')) {
        return 'Diritto Penale';
    }
    if (fn.includes('responsabilita_pubbliche') || fn.includes('consiglio_stato') || fn.includes('beni_pubblici') || fn.includes('inconferibilita')) {
        return 'Diritto Amministrativo';
    }
    if (fn.includes('civile') || fn.includes('contratto') || fn.includes('moneta') || fn.includes('proprieta')) {
        return 'Diritto Civile';
    }
    return 'Diritto Civile'; // Default
}

async function extractPdfPages(filePath, startPage, endPage) {
    try {
        const data = new Uint8Array(fs.readFileSync(filePath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
        const pdf = await loadingTask.promise;
        let text = '';
        for (let i = startPage; i <= Math.min(endPage, pdf.numPages); i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return { text, totalPages: pdf.numPages };
    } catch (e) {
        throw new Error(`PDF Error: ${e.message}`);
    }
}

async function callGemini(content, materia, label) {
    const userPrompt = `Riscrivi COMPLETAMENTE da zero il seguente contributo giuridico in tema di ${materia} (${label}), seguendo le regole del sistema. Crea un'opera manualistica originale di alta qualità scientifica.

TESTO DA ELABORARE:
${content.substring(0, 16000)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: REWRITE_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.2 }
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
}

const OUTPUT_DIR = 'data/manuali_oa_vip_v3';

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const sources = [
        { name: 'BUP', dir: 'data/manuali_oa/bup' },
        { name: 'RomaTre', dir: 'data/manuali_oa/romatre' }
    ];

    // Segmenti predefiniti di 8 pagine distribuiti lungo il libro
    const segments = [
        { start: 20, end: 27 },
        { start: 50, end: 57 },
        { start: 80, end: 87 },
        { start: 110, end: 117 },
        { start: 140, end: 147 },
        { start: 170, end: 177 },
        { start: 200, end: 207 },
        { start: 230, end: 237 }
    ];

    for (const src of sources) {
        console.log(`\n📂 SORGENTE: ${src.name}`);
        if (!fs.existsSync(src.dir)) {
            console.log(`   ⚠️  Cartella ${src.dir} non trovata, salto.`);
            continue;
        }

        const files = fs.readdirSync(src.dir).filter(f => f.endsWith('.pdf'));
        console.log(`   Trovati ${files.length} libri PDF.`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filePath = path.join(src.dir, file);
            const materia = inferMateria(file);

            console.log(`\n📚 [${i+1}/${files.length}] Elaborazione: ${file} [MATERIA: ${materia}]`);

            for (let s = 0; s < segments.length; s++) {
                const seg = segments[s];
                const cleanName = file.replace('.pdf', '').replace(/[^a-zA-Z0-9_]/g, '_');
                const outFileName = `${src.name}_${cleanName}_Seg_${s + 1}.md`;
                const outPath = path.join(OUTPUT_DIR, outFileName);

                if (fs.existsSync(outPath)) {
                    process.stdout.write(`\r   [Segmento ${s+1}/8] Skip (già elaborato)`);
                    continue;
                }

                try {
                    // Estrae il testo del segmento e ottiene il numero totale di pagine
                    const { text, totalPages } = await extractPdfPages(filePath, seg.start, seg.end);

                    if (seg.start > totalPages) {
                        process.stdout.write(`\r   [Segmento ${s+1}/8] Skip (fuori dai limiti di pagina: ${totalPages})`);
                        continue;
                    }

                    if (text.trim().length < 600) {
                        process.stdout.write(`\r   [Segmento ${s+1}/8] Skip (testo insufficiente/immagini)`);
                        continue;
                    }

                    process.stdout.write(`\r   [Segmento ${s+1}/8] Generazione in corso...`);
                    
                    const result = await callGemini(text, materia, `${src.name} - ${file} (Seg. ${s + 1})`);
                    fs.writeFileSync(outPath, result, 'utf8');

                    process.stdout.write(`\r   [Segmento ${s+1}/8] ✅ Scheda salvata!`);
                    
                    // Delay anti rate-limit
                    await new Promise(r => setTimeout(r, 3000));

                } catch (e) {
                    console.log(`\n   ❌ Errore su segmento ${s+1} di ${file}: ${e.message}`);
                    if (e.message.includes('429')) {
                        console.log("   ⏳ Rate limit attivo... attesa 60s");
                        await new Promise(r => setTimeout(r, 60000));
                        s--; // Riprova lo stesso segmento
                    }
                }
            }
            console.log();
        }
    }
    console.log("\n✨ PIPELINE GENERAZIONE MASSIVA MANUALI OA COMPLETATA! ✨");
}

main().catch(console.error);
