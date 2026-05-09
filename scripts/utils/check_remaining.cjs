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
        if (entry.isDirectory()) {
            loadLocalSchede(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.md')) {
            existingFilenames.add(entry.name);
        }
    }
};
loadLocalSchede(OUTPUT_DIR);
console.log('Schede uniche fatte: ' + existingFilenames.size);

let toProcess = 0;
const checkDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            checkDir(path.join(dir, entry.name));
        } else if (entry.name.endsWith('S.md') || entry.name.endsWith('S.txt')) {
            const mdName = entry.name.replace(/\.txt$/, '.md');
            if (!existingFilenames.has(mdName)) {
                toProcess++;
            }
        }
    }
};

for (const dir of INPUT_DIRS) {
    checkDir(dir);
}
console.log('Schede ancora da fare: ' + toProcess);
