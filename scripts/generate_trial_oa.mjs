/**
 * GENERATORE DI PROVA PER RISORSE OA BUP E ROMATRE
 * Estrae alcune pagine significative ed elabora schede manualistiche v3 (Amministrativo e Processo Civile)
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
* Materia: [Diritto Amministrativo / Diritto Civile / Diritto Processuale Civile]
* Fonte Originale: Dottrina manualistica OA

1. Dato Normativo e Principio di Diritto
2. Casistica Giurisprudenziale e Orientamenti
3. Questioni Aperte e Profili Critici
4. Rilevanza Concorsuale
5. Tags
`;

async function extractPdfPages(filePath, startPage, endPage) {
    try {
        const data = new Uint8Array(fs.readFileSync(filePath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
        const pdf = await loadingTask.promise;
        let text = '';
        console.log(`Estraendo da pagina ${startPage} a ${endPage} di ${pdf.numPages} pagine...`);
        for (let i = startPage; i <= Math.min(endPage, pdf.numPages); i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return text;
    } catch (e) {
        throw new Error(`PDF Error: ${e.message}`);
    }
}

async function callGemini(content, materia, label) {
    const userPrompt = `Riscrivi COMPLETAMENTE da zero il seguente contributo giuridico in tema di ${materia} (${label}), seguendo le regole del sistema. Crea un'opera manualistica originale.

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

async function main() {
    fs.mkdirSync('data/trial_oa_schede', { recursive: true });
    
    // Prova 1: BUP (Manes, Battini - Responsabilità Pubbliche)
    console.log("\n--- PROVA 1: Bonomia University Press ---");
    const bupPath = 'data/manuali_oa/bup/Responsabilita_pubbliche_Manes_Battini.pdf';
    // Estraiamo pagine di capitolo sostanziale (es. pag 25-28)
    const bupText = await extractPdfPages(bupPath, 25, 29);
    console.log(`Estratti ${bupText.length} caratteri. Generazione scheda...`);
    const bupResult = await callGemini(bupText, 'Diritto Amministrativo', 'BUP - Responsabilità Pubbliche');
    fs.writeFileSync('data/trial_oa_schede/BUP_Responsabilita_Pubbliche_Trial.md', bupResult, 'utf8');
    console.log("✅ Scheda BUP generata!");

    // Prova 2: Roma TrE-Press (Satta - Quaderni del processo civile)
    console.log("\n--- PROVA 2: Roma TrE-Press ---");
    const romatrePath = 'data/manuali_oa/romatre/Quaderni_processo_civile_Satta_Vol_I.pdf';
    // Estraiamo pagine (es. pag 18-22)
    const romatreText = await extractPdfPages(romatrePath, 18, 22);
    console.log(`Estratti ${romatreText.length} caratteri. Generazione scheda...`);
    const romatreResult = await callGemini(romatreText, 'Diritto Processuale Civile', 'Roma TrE-Press - Salvatore Satta');
    fs.writeFileSync('data/trial_oa_schede/RomaTre_Satta_Processo_Civile_Trial.md', romatreResult, 'utf8');
    console.log("✅ Scheda Roma TrE-Press generata!");
}

main().catch(console.error);
