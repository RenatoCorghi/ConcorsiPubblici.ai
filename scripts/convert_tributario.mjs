/**
 * CONVERSIONE CODICI TRIBUTARI PDF -> MD
 * Estrae il testo dai PDF e lo salva in Markdown per il RAG
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import * as pdfjsLib from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';

async function extractPdfText(filePath) {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

const inputDir = 'data/codici/tributario';
const outputDir = 'data/codici/tributario_md';

async function main() {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.pdf'));
    console.log(`📂 Trovati ${files.length} file PDF da convertire...`);

    for (const file of files) {
        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file.replace('.pdf', '.md'));
        
        console.log(`   ⏳ Elaborazione ${file}...`);
        try {
            const text = await extractPdfText(inputPath);
            // Pulizia minima e aggiunta header
            const header = `---\ntitolo: ${file.replace(/_/g, ' ').replace('.pdf', '')}\ntipo: Codice Tributario\n---\n\n`;
            fs.writeFileSync(outputPath, header + text, 'utf8');
            console.log(`   ✅ Salvato: ${path.basename(outputPath)} (${Math.round(text.length/1024)}KB)`);
        } catch (err) {
            console.error(`   ❌ Errore su ${file}:`, err.message);
        }
    }
    console.log('\n✨ Conversione completata!');
}

main();
