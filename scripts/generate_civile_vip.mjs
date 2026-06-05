import fs from 'fs';
import path from 'path';

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

const INPUT_DIR = path.join(process.cwd(), 'data', 'Civile New');
const OUTPUT_DIR = path.join(process.cwd(), 'schede_civile_vip', 'corte_costituzionale');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SYSTEM_PROMPT = `Sei un Magistrato e Senior Data Engineer.
Il tuo compito è analizzare complessi testi giuridici (Sentenze della Corte Costituzionale) in materia di Diritto Civile, Diritti della Personalità, Bio-Diritto e Famiglia.

[REGOLE DI ESTRAZIONE]
1. Il testo contiene sentenze istituzionali. Individua i "Macro-Argomenti" (istituti giuridici) e crea una Scheda VIP per ciascuno.
2. Formatta i concetti in modo che si adattino alla nostra struttura a 7 sezioni (VIP format).
3. Restituisci esclusivamente un array JSON in cui ogni elemento rappresenta una scheda estratta.

[FORMATO DELL'OGGETTO JSON]
Ogni scheda estratta DEVE avere i seguenti campi stringa:
- "titolo_file": Un nome file logico (es. "costituzionale_fine_vita", "costituzionale_identita_genere")
- "materia": Usa "Diritto Civile e Costituzionale"
- "rilevanza_concorsuale": "Alta", "Media" o "Bassa"
- "tags": es. "#BioDiritto #Famiglia #DirittiPersonalita"
- "autorita": Usa "Corte Costituzionale"
- "provvedimento": Inserisci il numero della sentenza se lo trovi (es. "Sentenza 242/2019 Corte Costituzionale") o "Analisi Istituzionale"
- "thema_decidendum": Inquadramento Sistematico dell'istituto (Di cosa stiamo parlando).
- "quadro_normativo": Le leggi e i riferimenti normativi incostituzionali o interpretati.
- "ratio_decidendi": Il ragionamento della Corte, i profili critici e il bilanciamento dei diritti.
- "principio_di_diritto": La Massima o il "Takeaway" fondamentale sancito dalla Consulta.
- "caso_specifico": La questione di legittimità sollevata dal giudice a quo.
- "effetti_sistematici": L'evoluzione del diritto civile a seguito della pronuncia.
- "spendibilita": Consigli concorsuali (es. "Ottimo per temi sui diritti personalissimi").

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
                contents: [{ role: 'user', parts: [{ text: `Estrai le schede dalla sentenza (HTML/Testo):\n\n${textChunk}` }] }],
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
    console.log(`💎 Generazione Schede VIP Civile (Corte Costituzionale)\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella non trovata: ${INPUT_DIR}`);
        return;
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.html'));
    console.log(`📂 Trovati ${files.length} file HTML da processare.\n`);
    
    let totalSchede = 0;

    for (const file of files) {
        console.log(`\n========================================`);
        console.log(`📂 Lettura ${file}...`);
        
        let text = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
        // Rimuove la maggior parte dei tag HTML per alleggerire il payload
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();

        console.log(`📄 Testo pulito: ${Math.round(text.length / 1024)} KB`);
        
        const chunks = chunkText(text, 15000, 2000);
        console.log(`✂️  Suddiviso in ${chunks.length} chunks (con overlap)`);
        
        console.log(`\n🚀 Avvio estrazione su ${file}...`);

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
                    const safeName = s.titolo_file ? s.titolo_file.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : `costituzionale_${Date.now()}`;
                    const outFile = path.join(OUTPUT_DIR, `${safeName}.md`);
                    fs.writeFileSync(outFile, md, 'utf8');
                    totalSchede++;
                    console.log(`    💾 Salvato: ${safeName}.md`);
                }
            }
            await new Promise(r => setTimeout(r, 4000));
        }
        console.log(`✅ File ${file} completato!`);
    }
    
    console.log(`\n🎉 Processo Concluso. Generate ${totalSchede} schede VIP in ${OUTPUT_DIR}`);
}

main().catch(console.error);
