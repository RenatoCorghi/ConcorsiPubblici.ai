/**
 * CROSS-REFERENCE: SS.UU. Riviste vs Archivio VIP
 * 
 * Confronta le sentenze Cass. SS.UU. citate nelle riviste con quelle già
 * presenti nel nostro archivio VIP, estraendo il numero sentenza dal contenuto.
 */
import fs from 'fs';
import path from 'path';

// 1. Carica i target dalle riviste
const idx = JSON.parse(fs.readFileSync('data/riviste_sentenze_index.json', 'utf8'));
const ssuu = idx.sentenze
    .filter(s => s.corte === 'Cassazione' && s.sezione === 'ssuu' && s.anno && s.numero)
    .sort((a, b) => b.citazioni - a.citazioni);

console.log('🎯 SS.UU. citate nelle riviste:', ssuu.length);

// 2. Scansiona tutti i file VIP SSUU ed estrai numero/anno dalla prima riga
const vipDirs = [
    'sentenze_ssuu_vip',
    'sentenze_ssuu_vip_clean', 
    'sentenze_ssuu_vip_schede',
    'sentenze_sez_semplici_vip'  // a volte le SS.UU. finiscono qui
];

const availableMap = new Map(); // key "anno_numero" -> filepath

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scanDir(full);
        } else if (entry.name.endsWith('.md')) {
            try {
                // Leggi solo le prime 500 chars per velocità
                const fd = fs.openSync(full, 'r');
                const buf = Buffer.alloc(500);
                fs.readSync(fd, buf, 0, 500, 0);
                fs.closeSync(fd);
                const head = buf.toString('utf8');
                
                // Pattern: "Sentenza n. 12345/2023" o "n. 12345 del" + anno nel path
                const m = head.match(/n\.?\s*(\d+)\s*[\/]\s*(\d{4})/);
                if (m) {
                    const key = m[2] + '_' + parseInt(m[1]);
                    if (!availableMap.has(key)) availableMap.set(key, full);
                } else {
                    // Prova "n. 12345 del DD/MM/YYYY" oppure "n. 12345" + anno dal path
                    const m2 = head.match(/n\.?\s*(\d+)\s+del\s+\d{1,2}[\/.]\d{1,2}[\/.]\s*(\d{4})/);
                    if (m2) {
                        const key = m2[2] + '_' + parseInt(m2[1]);
                        if (!availableMap.has(key)) availableMap.set(key, full);
                    } else {
                        // Fallback: numero dal contenuto + anno dal path
                        const yearFromPath = full.match(/[\/\\](20\d{2})[\/\\]/);
                        const numFromContent = head.match(/n\.?\s*(\d{4,6})/);
                        if (yearFromPath && numFromContent) {
                            const key = yearFromPath[1] + '_' + parseInt(numFromContent[1]);
                            if (!availableMap.has(key)) availableMap.set(key, full);
                        }
                    }
                }
            } catch (e) { /* skip */ }
        }
    }
}

console.log('\n📂 Scansione archivi VIP...');
for (const d of vipDirs) {
    const dirPath = path.resolve(d);
    if (fs.existsSync(dirPath)) {
        scanDir(dirPath);
        console.log(`  ${d}: scansionato`);
    } else {
        console.log(`  ${d}: non trovato`);
    }
}
console.log(`  Sentenze VIP uniche identificate: ${availableMap.size}`);

// 3. Cross-reference
let found = 0, missing = 0;
const missingList = [];
const foundList = [];

for (const s of ssuu) {
    const key = s.anno + '_' + s.numero;
    if (availableMap.has(key)) {
        found++;
        foundList.push({ ...s, vipFile: availableMap.get(key) });
    } else {
        missing++;
        missingList.push(s);
    }
}

console.log('\n' + '═'.repeat(60));
console.log('📊 RISULTATO CROSS-REFERENCE SS.UU.');
console.log(`  ✅ Presenti nel nostro archivio: ${found}/${ssuu.length} (${(found/ssuu.length*100).toFixed(1)}%)`);
console.log(`  ❌ MANCANTI: ${missing}/${ssuu.length}`);

// Dettaglio mancanti per anno
const missByAnno = {};
missingList.forEach(s => { missByAnno[s.anno] = (missByAnno[s.anno] || 0) + 1; });

console.log('\n  Mancanti per anno:');
for (const [anno, count] of Object.entries(missByAnno).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    console.log(`    ${anno}: ${count} sentenze`);
}

// Pre-2021 vs Post-2021
const pre2021 = missingList.filter(s => s.anno < 2021).length;
const post2021 = missingList.filter(s => s.anno >= 2021).length;
console.log(`\n  Pre-2021 (non scaricate da ItalGiure): ${pre2021}`);
console.log(`  Post-2021 (dovrebbero esserci): ${post2021}`);

// Top mancanti
console.log('\n  TOP 30 SS.UU. mancanti (per citazioni):');
for (let i = 0; i < Math.min(30, missingList.length); i++) {
    const s = missingList[i];
    console.log(`    ${i+1}. n.${s.numero}/${s.anno} (${s.citazioni}x) — ${s.fonti.join(', ')}`);
}

// Salva report JSON
fs.writeFileSync('data/ssuu_crossref_report.json', JSON.stringify({
    totale_riviste: ssuu.length,
    trovate: found,
    mancanti: missing,
    mancanti_pre2021: pre2021,
    mancanti_post2021: post2021,
    mancanti_per_anno: missByAnno,
    lista_mancanti: missingList,
    lista_trovate: foundList.map(s => ({ numero: s.numero, anno: s.anno, citazioni: s.citazioni }))
}, null, 2), 'utf8');

console.log('\n📄 Report salvato in data/ssuu_crossref_report.json');
