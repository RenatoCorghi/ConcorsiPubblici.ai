import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

const env = {};
try {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
} catch (e) {
    console.warn("⚠️ Nessun file .env trovato:", e.message);
}

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3-flash-preview';

const DOC_PATH = path.join(process.cwd(), 'data', 'Civile New', 'Ricerca Diritto Civile Italiano Open Access.docx');
const OUTPUT_DIR = path.join(process.cwd(), 'schede_civile_vip', 'dottrina_oa');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SYSTEM_PROMPT = `Sei un esperto accademico e Magistrato.
Il tuo compito è analizzare trattati dottrinali e massime di Diritto Civile in Open Access.
Individua i "Macro-Argomenti" trattati nel testo e crea una Scheda VIP dettagliatissima per ciascuno.

[FORMATO DELL'OGGETTO JSON]
Restituisci esclusivamente un array JSON in cui ogni elemento rappresenta una scheda estratta.
- "titolo_file": Un nome file logico (es. "dottrina_responsabilita_medica")
- "materia": Usa "Diritto Civile"
- "rilevanza_concorsuale": "Alta", "Media" o "Bassa"
- "tags": es. "#Obbligazioni #Responsabilita"
- "autorita": Usa "Dottrina Open Access"
- "provvedimento": "Studio Dottrinale" o eventuali sentenze citate (es. "Cass. SS.UU. 1234/2021")
- "thema_decidendum": Inquadramento Sistematico dell'istituto.
- "quadro_normativo": Leggi e articoli di riferimento.
- "ratio_decidendi": Analisi dogmatica, problemi interpretativi affrontati dalla dottrina.
- "principio_di_diritto": Il nucleo concettuale o la massima estratta.
- "caso_specifico": Fattispecie applicative o esempi pratici discussi nel testo.
- "effetti_sistematici": L'evoluzione del diritto in questo ambito.
- "spendibilita": Consigli su come usare queste argomentazioni al concorso.

Rispondi SOLO con l'array JSON valido.`;

function chunkText(text, maxLen = 15000, overlap = 2000) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let end = i + maxLen;
        if (end < text.length) {
            const lastSpace = text.lastIndexOf(' ', end);
            if (lastSpace > i + (maxLen / 2)) end = lastSpace;
        }
        chunks.push(text.slice(i, end).trim());
        i = end - overlap;
    }
    return chunks;
}

function mdFormat(s) {
    return `🧾 METADATI RAG
* Materia/Area: ${s.materia}
* Rilevanza Concorsuale: ${s.rilevanza_concorsuale}
* Autorità: ${s.autorita}
* Provvedimento: ${s.provvedimento}

1. Inquadramento Sistematico (Thema Decidendum)
${s.thema_decidendum}

2. Il Quadro Normativo
${s.quadro_normativo}

3. I Concetti Fondamentali (Principio di Diritto)
**${s.principio_di_diritto}**

4. Analisi Tecnica e Profili Critici (Ratio)
${s.ratio_decidendi}

5. Prassi Applicativa (Fattispecie)
${s.caso_specifico}

6. Evoluzione e Ricadute Sistematiche
${s.effetti_sistematici}

7. Spendibilità Concorsuale
${s.spendibilita}

8. Tags
${s.tags}`;
}

async function extractSchedeJSON(textChunk, retryCount = 0) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: `Estrai le schede dal seguente estratto dottrinale:\n\n${textChunk}` }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
        
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) throw new Error("Risposta vuota");
        
        content = content.replace(/^```json/i, '').replace(/```$/i, '').trim();
        const schede = JSON.parse(content);
        return Array.isArray(schede) ? schede : [];
    } catch (e) {
        if (retryCount < 3) {
            console.log(`      ⏳ Errore estrazione (${e.message}). Ritento tra 5s...`);
            await new Promise(r => setTimeout(r, 5000 * (retryCount + 1)));
            return extractSchedeJSON(textChunk, retryCount + 1);
        }
        console.error(`      ❌ Fallito dopo 3 tentativi: ${e.message}`);
        return [];
    }
}

async function main() {
    console.log(`💎 Generazione Schede VIP Civile (Docx Deep Research)\n`);

    if (!fs.existsSync(DOC_PATH)) {
        console.error(`❌ File non trovato: ${DOC_PATH}`);
        return;
    }

    console.log(`📂 Estrazione testo da DOCX tramite Mammoth...`);
    const result = await mammoth.extractRawText({ path: DOC_PATH });
    const text = result.value.replace(/\s+/g, ' ').trim();
    
    console.log(`📄 Testo estratto: ${Math.round(text.length / 1024)} KB`);
    
    const chunks = chunkText(text, 15000, 2000);
    console.log(`✂️  Suddiviso in ${chunks.length} chunks (con overlap)`);
    
    console.log(`\n🚀 Avvio estrazione...`);
    let totalSchede = 0;

    for (let i = 0; i < chunks.length; i++) {
        process.stdout.write(`  [Chunk ${i+1}/${chunks.length}] Elaborazione LLM... `);
        const startTime = Date.now();
        const schede = await extractSchedeJSON(chunks[i]);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        
        if (schede.length === 0) {
            console.log(`Nessuna scheda trovata. (${elapsed}s)`);
        } else {
            console.log(`Trovate ${schede.length} schede! (${elapsed}s)`);
            for (const s of schede) {
                const md = mdFormat(s);
                const safeName = s.titolo_file ? s.titolo_file.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : `dottrina_${Date.now()}`;
                const outFile = path.join(OUTPUT_DIR, `${safeName}.md`);
                fs.writeFileSync(outFile, md, 'utf8');
                totalSchede++;
                console.log(`    💾 Salvato: ${safeName}.md`);
            }
        }
        await new Promise(r => setTimeout(r, 4000));
    }
    
    console.log(`\n🎉 Processo Concluso. Generate ${totalSchede} schede VIP in ${OUTPUT_DIR}`);
}

main().catch(console.error);
