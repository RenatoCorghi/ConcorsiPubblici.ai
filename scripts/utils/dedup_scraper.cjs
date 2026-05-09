const fs = require('fs');
const path = require('path');

function deduplicateDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    console.log('Deduplicating: ' + dirPath);
    const seenFilenames = new Set();
    let deletedCount = 0;

    function walk(currentDir) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                if (seenFilenames.has(entry.name)) {
                    fs.unlinkSync(fullPath);
                    deletedCount++;
                } else {
                    seenFilenames.add(entry.name);
                }
            }
        }
    }

    walk(dirPath);
    console.log('Deleted ' + deletedCount + ' duplicate files.');
}

deduplicateDir(path.resolve('./scraper_cassazione/sentenze_ssuu_civile_clean'));
deduplicateDir(path.resolve('./scraper_cassazione/sentenze_ssuu_penale_clean'));
