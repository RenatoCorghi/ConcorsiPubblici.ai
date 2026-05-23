/**
 * GENERATORE VIP PENALE v3 — Discrimen & Sistema Penale
 * Utilizza il Prompt v3 (Institutional Tone + Anti-Paraphrase)
 * Estrae testo da PDF (Sistema Penale) o TXT (Discrimen)
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// PDF extraction (pdfjs legacy build)
import * as pdfjsLib from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';

// === ENV ===
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

// === PROMPT V3 (Institutional & Structural De-construction) ===
const REWRITE_PROMPT = `Sei un professore ordinario di diritto che scrive un MANUALE DIDATTICO COMPLETAMENTE ORIGINALE per la preparazione al concorso in Magistratura.
Ti viene fornita una scheda di approfondimento giuridico. Il tuo compito è RISCRIVERLA DA ZERO creando un'opera interamente nuova, seguendo TASSATIVAMENTE queste regole:

### REGOLE DI RISCRITTURA
1. **ANCORA TUTTO ALLA FONTE UFFICIALE:** Il punto di partenza deve essere la sentenza, la legge o l'istituto. MAI citare l'autore del contributo originale.
2. **RIFORMULA INTEGRALMENTE:** Non copiare nessuna frase. Rielabora ogni concetto con parole tue.
3. **NESSUN RIFERIMENTO EDITORIALE:** Non citare mai nomi di riviste (es. "Discrimen", "Sistema Penale") o autori. Sei un manualista, non un recensore.
4. **ANTI-PARAPHRASE LEAKAGE (CRITICO):** Sono VIETATI costrutti come "l'autore osserva/rileva/sottolinea". Usa ESCLUSIVAMENTE verbi assertivi: "la norma impone", "la Cassazione ha chiarito", "il principio consolidato sancisce".
5. **DISTRUZIONE STRUTTURALE:** Cambia l'ordine espositivo. Parti SEMPRE dal dato normativo, analizza la casistica, chiudi con la rilevanza concorsuale.

### STRUTTURA DI OUTPUT
🧾 METADATI RAG
* Tipo Documento: Scheda Manualistica
* Riferimento: [Estremi della sentenza/norma principale]
* Istituto Principale: [Nome Istituto]
* Materia: Diritto Penale
* Fonte Originale: Dottrina penalistica OA

1. Dato Normativo e Principio di Diritto
2. Casistica Giurisprudenziale e Orientamenti
3. Questioni Aperte e Profili Critici
4. Rilevanza Concorsuale
5. Tags
`;

// === HELPERS ===
async function extractPdfText(filePath) {
    try {
        const data = new Uint8Array(fs.readFileSync(filePath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
        const pdf = await loadingTask.promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
            if (text.length > 30000) break; // Safety limit
        }
        return text;
    } catch (e) {
        throw new Error(`PDF Error: ${e.message}`);
    }
}

async function callGemini(content, label) {
    const userPrompt = `Riscrivi COMPLETAMENTE da zero il seguente contributo giuridico (${label}), seguendo le regole del sistema. Crea un'opera manualistica originale.

TESTO DA ELABORARE:
${content.substring(0, 15000)}`;

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

// === MAIN ===
const OUTPUT_DIR = 'riviste_penale_vip_v3';

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    
    // Configurazione sorgenti
    const sources = [
        { name: 'Discrimen', dir: 'data/discrimen_pdfs', ext: '.txt', type: 'text' },
        { name: 'Sistema Penale', dir: 'data/sistemapenale_articles/pdfs', ext: '.pdf', type: 'pdf' }
    ];

    for (const src of sources) {
        console.log(`\n📂 SORGENTE: ${src.name}`);
        if (!fs.existsSync(src.dir)) {
            console.log(`   ⚠️  Cartella ${src.dir} non trovata, salto.`);
            continue;
        }

        const files = fs.readdirSync(src.dir).filter(f => f.endsWith(src.ext));
        console.log(`   Trovati ${files.length} file.`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const outPath = path.join(OUTPUT_DIR, `${src.name.replace(' ', '_')}_${file.replace(src.ext, '.md')}`);

            if (fs.existsSync(outPath)) {
                process.stdout.write(`\r   [${i+1}/${files.length}] Skip (già presente)`);
                continue;
            }

            try {
                let text = '';
                if (src.type === 'pdf') {
                    text = await extractPdfText(path.join(src.dir, file));
                } else {
                    text = fs.readFileSync(path.join(src.dir, file), 'utf8');
                }

                if (text.length < 500) continue;

                process.stdout.write(`\r   [${i+1}/${files.length}] Elaborazione ${file.substring(0, 30)}...`);
                
                const result = await callGemini(text, src.name);
                fs.writeFileSync(outPath, result, 'utf8');
                
                // Delay anti rate-limit
                await new Promise(r => setTimeout(r, 2500));

            } catch (e) {
                console.log(`\n   ❌ Errore su ${file}: ${e.message}`);
                if (e.message.includes('429')) {
                    console.log("   ⏳ Quota raggiunta, attesa 60s...");
                    await new Promise(r => setTimeout(r, 60000));
                }
            }
        }
    }
}

main().catch(console.error);
