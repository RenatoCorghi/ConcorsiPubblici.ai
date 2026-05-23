/**
 * Converte i PDF dei provvedimenti tributari in file Markdown
 * usando pdf2json per estrarre il testo.
 * 
 * Input:  data/tributario_raw_pdfs/prov_*.pdf  (+ massima_*.pdf)
 * Output: data/tributario_testi/pdf_{id}.md
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');
const OUT_DIR = path.join(__dirname, '..', 'data', 'tributario_testi');

fs.mkdirSync(OUT_DIR, { recursive: true });

// Estrae testo da un buffer PDF usando pdf2json
function extractTextFromPDF(buf) {
    return new Promise((resolve, reject) => {
        const parser = new PDFParser();
        const timeoutId = setTimeout(() => {
            parser.removeAllListeners('pdfParser_dataReady');
            parser.removeAllListeners('pdfParser_dataError');
            reject(new Error('PDF parsing timed out (30s)'));
        }, 30000);

        parser.on('pdfParser_dataError', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
        parser.on('pdfParser_dataReady', (data) => {
            clearTimeout(timeoutId);
            const pages = data.Pages || [];
            let text = '';
            pages.forEach(p => {
                let lineText = '';
                p.Texts?.forEach(t => {
                    t.R?.forEach(r => {
                        try {
                            lineText += decodeURIComponent(r.T) + ' ';
                        } catch (e) {
                            lineText += r.T + ' '; // fallback: usa il valore grezzo
                        }
                    });
                });
                text += lineText.trim() + '\n';
            });
            resolve(text.trim());
        });
        parser.parseBuffer(buf);
    });
}

async function main() {
    const provFiles = fs.readdirSync(PDF_DIR)
        .filter(f => f.startsWith('prov_') && f.endsWith('.pdf'))
        .sort();
    
    console.log(`📂 ${provFiles.length} provvedimenti PDF da convertire`);

    let ok = 0, skip = 0, err = 0;

    for (const f of provFiles) {
        const id = f.replace('prov_', '').replace('.pdf', '');
        const outFile = path.join(OUT_DIR, `pdf_${id}.md`);
        const massimaFile = path.join(PDF_DIR, `massima_${id}.pdf`);

        const hasMassima = fs.existsSync(massimaFile);
        const alreadyConverted = fs.existsSync(outFile) && fs.statSync(outFile).size > 1000;

        if (alreadyConverted) {
            let needsReconvert = false;
            if (hasMassima) {
                const currentContent = fs.readFileSync(outFile, 'utf8');
                if (!currentContent.includes('## Massima Ufficiale')) {
                    needsReconvert = true;
                }
            }
            if (!needsReconvert) {
                console.log(`  ⏭  ${f.substring(0, 40)}... — già presente`);
                skip++;
                continue;
            }
        }

        try {
            const buf = fs.readFileSync(path.join(PDF_DIR, f));
            const text = await extractTextFromPDF(buf);

            if (text.length < 300) {
                console.log(`  ⚠️  ${f.substring(0, 40)}... — testo troppo breve (${text.length} chars)`);
                err++;
                continue;
            }

            // Estrai massima se presente
            let massimaText = '';
            if (hasMassima) {
                try {
                    const massBuf = fs.readFileSync(massimaFile);
                    massimaText = await extractTextFromPDF(massBuf);
                } catch (e) {
                    console.error(`  ⚠️  Errore conversione massima per ${id}: ${e.message}`);
                }
            }

            // Estrai metadati dal testo
            const corteMatch = text.match(/((?:CGT|CTR|CTP|Corte di Giustizia Tributaria)[^\n]*)/i);
            const numMatch = text.match(/Sentenza[^n]*n\.\s*(\d+\/\d{4})/i);
            const dataMatch = text.match(/in data\s+(\d{2}\/\d{2}\/\d{4})/i) ||
                              text.match(/(\d{2}\/\d{2}\/\d{4})/);
            
            const corte = corteMatch?.[1]?.trim().substring(0, 100) || 'Corte Giustizia Tributaria';
            const numero = numMatch?.[1] || id.substring(0, 20);
            const data = dataMatch?.[1] || 'N.D.';

            // Cerca materia (es. IVA, IRPEF, ecc.)
            const materieKeywords = ['Iva', 'IRPEF', 'IRAP', 'IMU', 'Accertamento', 'Riscossione', 
                                     'Agevolazioni', 'Rimborso', 'Sanzioni', 'Contraddittorio'];
            const materia = materieKeywords.find(m => text.includes(m)) || 'Diritto Tributario';

            const md = [
                `# ${corte} — Sentenza n. ${numero}`,
                '',
                '## Metadati RAG',
                `- **Corte**: ${corte}`,
                `- **Numero**: ${numero}`,
                `- **Data**: ${data}`,
                `- **Materia**: ${materia}`,
                `- **ID Portale**: ${id}`,
                `- **Fonte**: PDF Provvedimento`,
                '',
                massimaText ? `## Massima Ufficiale\n\n${massimaText}\n` : '',
                '## Testo Integrale della Sentenza',
                '',
                text,
            ].filter(Boolean).join('\n');

            fs.writeFileSync(outFile, md, 'utf8');
            console.log(`  ✅ ${f.substring(0, 40)}... → ${Math.round(text.length / 1024)} KB testo ${hasMassima ? '(con massima)' : ''}`);
            ok++;

        } catch (e) {
            console.error(`  ❌ ${f.substring(0, 40)}...: ${e.message.substring(0, 60)}`);
            err++;
        }
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📊 COMPLETATO: ✅ ${ok} | ⏭ ${skip} | ❌ ${err}`);
    console.log(`${'═'.repeat(50)}`);
}

main().catch(console.error);
