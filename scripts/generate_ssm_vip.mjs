import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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

const INPUT_DIR = path.join(process.cwd(), 'data', 'penale_pubblico_dominio', 'ssm');
const OUTPUT_DIR = path.join(process.cwd(), 'schede_ssm_vip');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SYSTEM_PROMPT = `Sei un Magistrato Ordinario, Revisore del Massimario e Senior Data Engineer per un sistema RAG giuridico di livello avanzato.
Il tuo compito è analizzare blocchi di testo estratti dai "Quaderni della Scuola Superiore della Magistratura".

[REGOLE DI ESTRAZIONE]
1. Ignora premesse generiche, discorsi di apertura, indici, normativa minore, provvedimenti organizzativi.
2. Concentrati su argomenti rilevanti per il Concorso in Magistratura: Diritto Civile, Diritto Penale (Parte generale e speciale), Diritto Amministrativo.
3. Estrai OGNI singola analisi dottrinale, contrasto giurisprudenziale o ricostruzione sistematica importante che trovi nel testo.
4. Se il testo inizia o finisce a metà di una trattazione (a causa del taglio del blocco), NON generare la scheda per quel principio incompleto (verrà catturato nel blocco adiacente grazie all'overlap).
5. Restituisci esclusivamente un array JSON in cui ogni elemento rappresenta una scheda estratta. Se non ci sono argomenti rilevanti, restituisci [].

[FORMATO DELL'OGGETTO JSON]
Ogni scheda estratta DEVE avere i seguenti campi stringa:
- "titolo_file": Un nome file logico, breve e senza spazi (es. "ssm_quaderno_20_concorso_persone_reato")
- "materia": es. "Diritto Penale", "Diritto Civile", "Diritto Amministrativo"
- "rilevanza_concorsuale": "Alta", "Media" o "Bassa"
- "tags": es. "#ConcorsoDiPersone #DoloEventuale #SSM"
- "autorita": "Scuola Superiore della Magistratura (SSM)"
- "provvedimento": Il riferimento al Quaderno (se intuibile, altrimenti "Quaderno SSM")
- "thema_decidendum": La questione giuridica o tematica trattata.
- "quadro_normativo": Le norme analizzate e i riferimenti storici.
- "ratio_decidendi": La ricostruzione dottrinale o l'iter argomentativo.
- "principio_di_diritto": La sintesi finale o la tesi accolta.
- "caso_specifico": Se viene analizzata una specifica sentenza o caso pratico, descrivilo.
- "effetti_sistematici": Quali conseguenze ha nel sistema giurisprudenziale.
- "spendibilita": Consigli concorsuali su come usare questi argomenti in un tema.

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

1. La Questione di Diritto e il Thema Decidendum
${s.thema_decidendum}

2. Il Quadro Normativo e Giurisprudenziale
${s.quadro_normativo}

3. Il Principio di Diritto (La Sintesi)
**${s.principio_di_diritto}**

4. Ratio Decidendi e Ricostruzione Dogmatica
${s.ratio_decidendi}

5. Caso Specifico (Fattispecie Analizzata)
${s.caso_specifico}

6. Effetti della Pronuncia e Ricadute Sistematiche
${s.effetti_sistematici}

7. Spendibilità Concorsuale
${s.spendibilita}

8. Tags
${s.tags}`;
}

async function extractSchedeJSON(textChunk, retryCount = 0) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL_NAME + ":generateContent?key=" + GEMINI_API_KEY;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: "Estrai le schede da questo testo:\n\n" + textChunk }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "HTTP " + response.status);
        
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) throw new Error("Risposta vuota");
        
        content = content.replace(/^```json/i, '').replace(/```$/i, '').trim();
        const schede = JSON.parse(content);
        return Array.isArray(schede) ? schede : [];
    } catch (e) {
        if (retryCount < 3) {
            console.log("      ⏳ Errore estrazione (" + e.message + "). Ritento tra 5s...");
            await new Promise(r => setTimeout(r, 5000 * (retryCount + 1)));
            return extractSchedeJSON(textChunk, retryCount + 1);
        }
        console.error("      ❌ Fallito dopo 3 tentativi: " + e.message);
        return [];
    }
}

async function main() {
    console.log("💎 Generazione Schede VIP Quaderni SSM (" + MODEL_NAME + ")\n");

    if (!fs.existsSync(INPUT_DIR)) {
        console.error("❌ Cartella " + INPUT_DIR + " non trovata!");
        return;
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.pdf'));
    console.log("📂 Trovati " + files.length + " file PDF SSM da processare.\n");
    
    let totalSchede = 0;

    for (const file of files) {
        console.log("\n========================================");
        console.log("📂 Lettura " + file + "...");
        
        const dataBuffer = fs.readFileSync(path.join(INPUT_DIR, file));
        let text = '';
        try {
            const parser = new pdfParse.PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            text = result.text.replace(/\n{2,}/g, '\n').replace(/\s{2,}/g, ' ');
            await parser.destroy();
        } catch (e) {
            console.error("❌ Errore parsing PDF " + file + ": " + e.message);
            continue;
        }
        
        console.log("📄 Testo estratto: " + Math.round(text.length / 1024) + " KB");
        
        const chunks = chunkText(text, 15000, 2000);
        console.log("✂️  Suddiviso in " + chunks.length + " chunks (con overlap)");
        
        console.log("\n🚀 Avvio estrazione su " + file + "...");

        for (let i = 0; i < chunks.length; i++) {
            process.stdout.write("  [Chunk " + (i+1) + "/" + chunks.length + "] Elaborazione LLM... ");
            const startTime = Date.now();
            const schede = await extractSchedeJSON(chunks[i]);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            
            if (schede.length === 0) {
                console.log("Nessuna scheda trovata. (" + elapsed + "s)");
            } else {
                console.log("Trovate " + schede.length + " schede! (" + elapsed + "s)");
                for (const s of schede) {
                    const md = mdFormat(s);
                    const safeName = s.titolo_file ? s.titolo_file.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : "scheda_" + Date.now();
                    const outFile = path.join(OUTPUT_DIR, safeName + ".md");
                    fs.writeFileSync(outFile, md, 'utf8');
                    totalSchede++;
                    console.log("    💾 Salvato: " + safeName + ".md");
                }
            }
            await new Promise(r => setTimeout(r, 4000));
        }
        console.log("✅ File " + file + " completato!");
    }
    
    console.log("\n🎉 Processo Globale Concluso. Generate " + totalSchede + " schede VIP SSM in totale nella cartella " + OUTPUT_DIR);
}

main().catch(console.error);
