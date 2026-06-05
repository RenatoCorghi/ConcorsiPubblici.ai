import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

const docPath = path.join(process.cwd(), 'data', 'Deep Research tributario', 'Ricerca Fonti Open Access Diritto Penale.docx');
const outPath = path.join(process.cwd(), 'data', 'Deep Research tributario', 'Ricerca_Penale_Output.txt');

async function main() {
    console.log("Leggo il file...");
    const result = await mammoth.extractRawText({ path: docPath });
    fs.writeFileSync(outPath, result.value, 'utf8');
    console.log(`Finito! Salvato in ${outPath}`);
}
main().catch(console.error);
