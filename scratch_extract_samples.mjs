import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const BASE_DIR = 'C:\\Users\\Pc\\OneDrive\\Desktop\\concorsi-ai\\data\\diritto_sanitario';

const samples = [
    path.join(BASE_DIR, 'ssm', 'SSM_Quaderno_6412555.pdf'),
    path.join(BASE_DIR, 'cassazione', 'Cass_Rassegna_Civile_2020_Vol2.pdf'),
    path.join(BASE_DIR, 'pubmed', 'PMC_13241901_OpenAccess.pdf'),
    path.join(BASE_DIR, 'mdpi', 'MDPI_Healthcare_Healthcare_2025_CC_BY.pdf')
];

async function extractSample(filePath) {
    console.log(`\n--- Analizzando: ${path.basename(filePath)} ---`);
    try {
        const dataBuffer = fs.readFileSync(filePath);
        let text = '';
        if (pdfParse.PDFParse) {
            const parser = new pdfParse.PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            text = result.text || '';
            await parser.destroy();
        } else {
            const data = await pdfParse(dataBuffer);
            text = data.text || '';
        }
        
        console.log("Primi 1500 caratteri:");
        console.log(text.substring(0, 1500));
        console.log("...\n");
    } catch (error) {
        console.error("Errore nell'estrazione:", error.message);
    }
}

async function main() {
    for (const file of samples) {
        await extractSample(file);
    }
}

main();
