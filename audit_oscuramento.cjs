const fs = require('fs');
const path = require('path');
const INPUT_DIRS = [
    path.resolve('./sentenze_ssuu_vip_clean'),
    path.resolve('./scraper_cassazione/sentenze_ssuu_civile_clean'),
    path.resolve('./scraper_cassazione/sentenze_ssuu_penale_clean')
];
const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip_schede');

const existingFilenames = new Set();
const loadLocalSchede = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) loadLocalSchede(path.join(dir, entry.name));
        else if (entry.name.endsWith('.md')) existingFilenames.add(entry.name);
    }
};
loadLocalSchede(OUTPUT_DIR);

let valid = 0;
let oscurati = 0;
let total = 0;

const checkDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            checkDir(fullPath);
        } else if (entry.name.endsWith('S.md') || entry.name.endsWith('S.txt')) {
            const mdName = entry.name.replace(/\.txt$/, '.md');
            if (!existingFilenames.has(mdName)) {
                total++;
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes('oscuramento') && content.length < 1000) {
                    oscurati++;
                } else {
                    valid++;
                }
            }
        }
    }
};

for (const dir of INPUT_DIRS) {
    checkDir(dir);
}
console.log('Totale file da processare: ' + total);
console.log('Di cui oscurati (da saltare): ' + oscurati);
console.log('Di cui validi (vere sentenze): ' + valid);
