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

const OUTPUT_DIR = path.join(process.cwd(), 'schede_civile_vip', 'notariato');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SYSTEM_PROMPT = `Sei un Notaio, Professore Universitario e Senior Data Engineer.
Hai una conoscenza enciclopedica degli Studi della Commissione Studi Civilistici del Consiglio Nazionale del Notariato (CNN).
Il tuo compito è ricostruire fedelmente e in maniera estremamente tecnica e approfondita il contenuto dottrinale di specifici studi notarili, strutturandoli nel formato Scheda VIP.

[FORMATO DELL'OGGETTO JSON]
Devi restituire esclusivamente un array JSON contenente le schede. Ogni scheda DEVE avere i seguenti campi stringa:
- "titolo_file": Un nome file logico (es. "cnn_fondo_patrimoniale_2384")
- "materia": Usa "Diritto Civile (Notariato)"
- "rilevanza_concorsuale": "Alta"
- "tags": Inserisci hashtag pertinenti (es. "#FondoPatrimoniale #ConvenzioniMatrimoniali")
- "autorita": Usa "Consiglio Nazionale del Notariato (CNN)"
- "provvedimento": Inserisci il numero e titolo dello studio
- "thema_decidendum": Inquadramento Sistematico dell'istituto (Di cosa stiamo parlando, nozione essenziale).
- "quadro_normativo": Riferimenti normativi puntuali.
- "ratio_decidendi": L'analisi tecnica, i profili operativi e le criticità interpretative affrontate dallo Studio CNN.
- "principio_di_diritto": Il "Takeaway" fondamentale sancito dallo Studio (es. "La società può costituire fondo patrimoniale a condizione che...").
- "caso_specifico": Esempi di clausole, prassi applicativa o fattispecie ricorrenti nella pratica notarile.
- "effetti_sistematici": L'impatto di questo studio sulla circolazione dei beni e sulla sicurezza dei traffici.
- "spendibilita": Consigli concorsuali per i candidati.

Rispondi SOLO con l'array JSON valido.`;

const STUDI_DA_RICOSTRUIRE = [
    "Studio n. 2384: Obbligazioni familiari e fondo patrimoniale: i limiti all'esecuzione (Focus: art. 170 c.c. e debiti per bisogni della famiglia)",
    "Studio n. 5848/C/2005: Gli incrementi del fondo patrimoniale e l'autonomia convenzionale dei coniugi (Focus: coacervo e nuovi beni)",
    "Studio n. 4-2019/P: La pubblicità dei regimi patrimoniali nell'unione civile e nella convivenza di fatto (Focus: Legge Cirinnà e registri anagrafici)",
    "Studio n. 196-2017/C: Comunione legale, contratto di convivenza e circolazione dei beni dopo la legge Cirinnà (Focus: autonomia negoziale e trascrizione dei contratti di convivenza)",
    "Studio n. 31-2017/T: L'intervento del notaio nella soluzione della crisi coniugale, della unione civile e della convivenza: profili fiscali (Focus: trasferimenti immobiliari in sede di separazione/divorzio)",
    "Studio in materia di Negozio Fiduciario e Trust (Focus: differenza strutturale, trascrivibilità e tutela del fiduciante)",
    "Studio sulle Associazioni non riconosciute e gli Enti del Terzo Settore (Focus: acquisti immobiliari e responsabilità degli amministratori)"
];

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
                contents: [{ role: 'user', parts: [{ text: `Genera le schede VIP estremamente approfondite per i seguenti Studi Notarili:\n\n${textChunk}` }] }],
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
    console.log(`💎 Generazione Sintetica Schede VIP (Notariato)\n`);
    
    let totalSchede = 0;
    
    console.log(`🚀 Avvio generazione dal bagaglio di conoscenza LLM...`);
    const listString = STUDI_DA_RICOSTRUIRE.join('\n- ');
    const schede = await extractSchedeJSON(listString);
    
    if (schede.length > 0) {
        console.log(`Trovate/Generate ${schede.length} schede!`);
        for (const s of schede) {
            const md = mdFormat(s);
            const safeName = s.titolo_file ? s.titolo_file.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : `cnn_${Date.now()}`;
            const outFile = path.join(OUTPUT_DIR, `${safeName}.md`);
            fs.writeFileSync(outFile, md, 'utf8');
            totalSchede++;
            console.log(`    💾 Salvato: ${safeName}.md`);
        }
    }
    
    console.log(`\n🎉 Processo Concluso. Generate ${totalSchede} schede VIP in ${OUTPUT_DIR}`);
}

main().catch(console.error);
