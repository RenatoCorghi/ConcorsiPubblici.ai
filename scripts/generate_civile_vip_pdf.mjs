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
const OUTPUT_DIR = path.join(process.cwd(), 'schede_civile_vip', 'notariato');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SYSTEM_PROMPT = `Sei un Notaio, Professore Universitario e Senior Data Engineer.
Il tuo compito è analizzare complessi testi giuridici in formato PDF (Studi e Massime del Consiglio Nazionale del Notariato).
Individua i "Macro-Argomenti" (istituti giuridici) affrontati nello studio e crea una Scheda VIP estremamente tecnica per ciascuno.

[FORMATO DELL'OGGETTO JSON]
Devi restituire esclusivamente un array JSON contenente le schede. Ogni scheda DEVE avere i seguenti campi stringa:
- "titolo_file": Un nome file logico (es. "cnn_fondo_patrimoniale")
- "materia": Usa "Diritto Civile (Notariato)"
- "rilevanza_concorsuale": "Alta" o "Media"
- "tags": Inserisci hashtag pertinenti (es. "#FondoPatrimoniale")
- "autorita": Usa "Consiglio Nazionale del Notariato (CNN)"
- "provvedimento": Inserisci il titolo o numero dello studio se presente
- "thema_decidendum": Inquadramento Sistematico dell'istituto (Di cosa stiamo parlando).
- "quadro_normativo": Riferimenti normativi puntuali citati nello studio.
- "ratio_decidendi": L'analisi tecnica, i profili operativi e le criticità interpretative.
- "principio_di_diritto": Il nucleo concettuale o "Takeaway" fondamentale sancito dallo Studio.
- "caso_specifico": Esempi di clausole, prassi applicativa o fattispecie ricorrenti.
- "effetti_sistematici": L'impatto sulla circolazione dei beni e la sicurezza dei traffici.
- "spendibilita": Consigli concorsuali (come citare queste argomentazioni al concorso).

Rispondi SOLO con l'array JSON valido.`;

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

async function extractSchedeJSONFromPDF(pdfBase64, retryCount = 0) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ 
                    role: 'user', 
                    parts: [
                        { text: "Estrai le schede VIP JSON da questo Studio Notarile PDF." },
                        { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }
                    ] 
                }],
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
            console.log(`      ⏳ Errore estrazione (${e.message}). Ritento tra 10s...`);
            await new Promise(r => setTimeout(r, 10000 * (retryCount + 1)));
            return extractSchedeJSONFromPDF(pdfBase64, retryCount + 1);
        }
        console.error(`      ❌ Fallito dopo 3 tentativi: ${e.message}`);
        return [];
    }
}

async function main() {
    console.log(`💎 Generazione Schede VIP Notariato (Diretto da PDF via API)\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella non trovata: ${INPUT_DIR}`);
        return;
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.pdf') && f.toLowerCase().includes('notariato'));
    console.log(`📂 Trovati ${files.length} file PDF da processare.\n`);
    
    let totalSchede = 0;

    for (const file of files) {
        console.log(`\n========================================`);
        console.log(`📂 Lettura ${file}...`);
        
        const dataBuffer = fs.readFileSync(path.join(INPUT_DIR, file));
        const pdfBase64 = dataBuffer.toString('base64');
        
        console.log(`🚀 Avvio estrazione LLM diretta su ${file} (${Math.round(pdfBase64.length / 1024)} KB)...`);

        const startTime = Date.now();
        const schede = await extractSchedeJSONFromPDF(pdfBase64);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        
        if (schede.length === 0) {
            console.log(`Nessuna scheda trovata. (${elapsed}s)`);
        } else {
            console.log(`Trovate ${schede.length} schede! (${elapsed}s)`);
            for (const s of schede) {
                const md = mdFormat(s);
                const safeName = s.titolo_file ? s.titolo_file.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : `cnn_${Date.now()}`;
                const outFile = path.join(OUTPUT_DIR, `${safeName}.md`);
                fs.writeFileSync(outFile, md, 'utf8');
                totalSchede++;
                console.log(`    💾 Salvato: ${safeName}.md`);
            }
        }
        await new Promise(r => setTimeout(r, 5000));
        console.log(`✅ File ${file} completato!`);
    }
    
    console.log(`\n🎉 Processo Concluso. Generate ${totalSchede} schede VIP in ${OUTPUT_DIR}`);
}

main().catch(console.error);
