/**
 * CROSS-REFERENCE: Sentenze citate nelle riviste vs nostro archivio
 * 
 * Legge: data/riviste_sentenze_index.json
 * Cerca in:
 *   - sentenze_ssuu_vip/          (SS.UU. civili + penali)
 *   - sentenze_sez_semplici/      (Sezioni semplici)
 *   - sentenze_admin_vip/         (CdS + TAR)
 *   - massimario_vip/             (Massimario)
 *   - data/discrimen_pdfs/        (Penale dottrina)
 *   - data/sistemapenale_articles/ (Sistema Penale)
 * 
 * Output:
 *   - data/riviste_crossref.json
 *   - data/riviste_crossref_report.md
 */

import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════
// Carica l'indice delle sentenze citate
// ═══════════════════════════════════════════════════
const indexPath = path.resolve('data/riviste_sentenze_index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const sentenze = index.sentenze; // Tutte con dati completi (numero + anno)

console.log(`📋 Sentenze da cercare: ${sentenze.length}`);

// ═══════════════════════════════════════════════════
// Costruisci un set di lookup veloce per i nostri file
// ═══════════════════════════════════════════════════

function getFilesFlat(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) results.push(...getFilesFlat(full));
            else results.push(entry.name.toLowerCase());
        }
    } catch (e) { /* skip */ }
    return results;
}

// --- 1. CASSAZIONE SS.UU. ---
// Pattern: snciv2021U05425S.md → corte=Cassazione, sez=ssuu, anno=2021, num=5425
// Pattern: snpen2021U27421S.md → corte=Cassazione, sez=ssuu (penale), anno=2021, num=27421
console.log('🔍 Indicizzando SS.UU. VIP...');
const ssuuFiles = getFilesFlat(path.resolve('sentenze_ssuu_vip'));
const ssuuSet = new Set();
for (const f of ssuuFiles) {
    // snciv2021U05425S.md or snpen2021U27421S.md
    const m = f.match(/sn(?:civ|pen)(\d{4})u(\d+)[so]\.md/i);
    if (m) ssuuSet.add(`${m[1]}_${parseInt(m[2])}`); // "2021_5425"
}
console.log(`   ${ssuuSet.size} sentenze SS.UU. indicizzate`);

// --- 2. CASSAZIONE SEZ. SEMPLICI ---
// Pattern: snciv2021115789S.md → anno=2021, num=15789 (il primo digit è la sezione: 1)
// Pattern: snciv2025602340S.md → anno=2025, num=02340 sezione 6
console.log('🔍 Indicizzando Sez. Semplici...');
const sezSemplFiles = getFilesFlat(path.resolve('sentenze_sez_semplici'));
const sezSemplSet = new Set();
for (const f of sezSemplFiles) {
    // snciv2021115789S.md — after the year, the first digit is sezione (1-6), rest is number
    const m = f.match(/sn(?:civ|pen)(\d{4})\d(\d+)[so]\.md/i);
    if (m) sezSemplSet.add(`${m[1]}_${parseInt(m[2])}`); // "2021_15789"
}
console.log(`   ${sezSemplSet.size} sentenze Sez. Semplici indicizzate`);

// --- 3. CONSIGLIO DI STATO (Admin VIP) ---
// Pattern: cds_2024_202400001.md → anno=2024, num=1
console.log('🔍 Indicizzando Admin VIP (CdS)...');
const adminFiles = getFilesFlat(path.resolve('sentenze_admin_vip'));
const cdsSet = new Set();
const tarSet = new Set();
for (const f of adminFiles) {
    const mCds = f.match(/cds_(\d{4})_\d{4}0*(\d+)\.md/i);
    if (mCds) {
        cdsSet.add(`${mCds[1]}_${parseInt(mCds[2])}`);
        continue;
    }
    const mTar = f.match(/tar_(\w+)_(\d{4})_\d{4}0*(\d+)\.md/i);
    if (mTar) {
        tarSet.add(`${mTar[2]}_${parseInt(mTar[3])}`);
    }
}
console.log(`   ${cdsSet.size} sentenze CdS indicizzate`);
console.log(`   ${tarSet.size} sentenze TAR indicizzate`);

// --- 4. MASSIMARIO VIP ---
console.log('🔍 Indicizzando Massimario VIP...');
const massFiles = getFilesFlat(path.resolve('massimario_vip'));
const massSet = new Set();
for (const f of massFiles) {
    const m = f.match(/sn(?:civ|pen)(\d{4})(?:u|\d)(\d+)[so]\.md/i);
    if (m) massSet.add(`${m[1]}_${parseInt(m[2])}`);
}
console.log(`   ${massSet.size} massime indicizzate`);

// ═══════════════════════════════════════════════════
// CROSS-REFERENCE
// ═══════════════════════════════════════════════════
console.log('\n🔗 Cross-reference in corso...');

let found = 0;
let notFound = 0;
const foundList = [];
const missingList = [];

for (const s of sentenze) {
    const key = `${s.anno}_${s.numero}`;
    let matched = false;
    let matchSource = '';

    if (s.corte === 'Cassazione') {
        if (s.sezione === 'ssuu') {
            if (ssuuSet.has(key)) { matched = true; matchSource = 'sentenze_ssuu_vip'; }
            else if (massSet.has(key)) { matched = true; matchSource = 'massimario_vip'; }
        } else {
            // civ, pen, lav, trib → cerca in sez semplici, poi ssuu, poi massimario
            if (sezSemplSet.has(key)) { matched = true; matchSource = 'sentenze_sez_semplici'; }
            else if (ssuuSet.has(key)) { matched = true; matchSource = 'sentenze_ssuu_vip'; }
            else if (massSet.has(key)) { matched = true; matchSource = 'massimario_vip'; }
        }
    } else if (s.corte === 'Consiglio di Stato') {
        if (cdsSet.has(key)) { matched = true; matchSource = 'sentenze_admin_vip'; }
    } else if (s.corte === 'TAR') {
        if (tarSet.has(key)) { matched = true; matchSource = 'sentenze_admin_vip'; }
    }
    // Corte Costituzionale, Corte dei Conti, CEDU, CGUE, Corte d'Appello → non abbiamo archivio dedicato

    if (matched) {
        found++;
        foundList.push({ ...s, matchSource });
    } else {
        notFound++;
        missingList.push(s);
    }
}

// ═══════════════════════════════════════════════════
// STATISTICHE
// ═══════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`📊 RISULTATI CROSS-REFERENCE:`);
console.log(`   Sentenze cercate:     ${sentenze.length}`);
console.log(`   ✅ Trovate:           ${found} (${(found / sentenze.length * 100).toFixed(1)}%)`);
console.log(`   ❌ Mancanti:          ${notFound} (${(notFound / sentenze.length * 100).toFixed(1)}%)`);

// Per corte
const byCorte = {};
for (const s of sentenze) {
    const key = s.corte;
    if (!byCorte[key]) byCorte[key] = { total: 0, found: 0, missing: 0 };
    byCorte[key].total++;
}
for (const s of foundList) byCorte[s.corte].found++;
for (const s of missingList) byCorte[s.corte].missing++;

console.log('\n📋 Per Corte:');
for (const [corte, stats] of Object.entries(byCorte).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`   ${corte}: ${stats.found}/${stats.total} trovate (${(stats.found / stats.total * 100).toFixed(0)}%) | ${stats.missing} mancanti`);
}

// Top missing per citazioni
const topMissing = missingList
    .sort((a, b) => b.citazioni - a.citazioni)
    .slice(0, 30);

console.log('\n🏆 TOP 30 SENTENZE MANCANTI (più citate):');
for (let i = 0; i < topMissing.length; i++) {
    const s = topMissing[i];
    const label = `${s.corte}${s.sezione ? ' (' + s.sezione + ')' : ''} n. ${s.numero}/${s.anno}`;
    console.log(`   ${i + 1}. [${s.citazioni}x] ${label}  (fonti: ${s.fonti.join(', ')})`);
}

// ═══════════════════════════════════════════════════
// Salva JSON
// ═══════════════════════════════════════════════════
const outDir = path.resolve('data');
const crossref = {
    metadata: {
        generatedAt: new Date().toISOString(),
        totalSentenze: sentenze.length,
        found,
        missing: notFound,
        percentFound: (found / sentenze.length * 100).toFixed(1) + '%',
        perCorte: byCorte,
    },
    found: foundList.sort((a, b) => b.citazioni - a.citazioni),
    missing: missingList.sort((a, b) => b.citazioni - a.citazioni),
};

fs.writeFileSync(path.join(outDir, 'riviste_crossref.json'), JSON.stringify(crossref, null, 2), 'utf8');

// ═══════════════════════════════════════════════════
// Genera Report Markdown
// ═══════════════════════════════════════════════════
let md = '';
md += '# Cross-Reference: Sentenze Citate vs Archivio Disponibile\n\n';
md += '> Generato il ' + new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n\n---\n\n';

md += '## Panoramica\n\n';
md += '| Metrica | Valore |\n|---|---|\n';
md += '| Sentenze cercate | **' + sentenze.length + '** |\n';
md += '| Trovate nel nostro archivio | **' + found + '** (' + (found / sentenze.length * 100).toFixed(1) + '%) |\n';
md += '| Mancanti | **' + notFound + '** (' + (notFound / sentenze.length * 100).toFixed(1) + '%) |\n\n';

md += '## Per Corte\n\n';
md += '| Corte | Totale | Trovate | % | Mancanti |\n|---|---|---|---|---|\n';
for (const [corte, stats] of Object.entries(byCorte).sort((a, b) => b[1].total - a[1].total)) {
    md += '| ' + corte + ' | ' + stats.total + ' | ' + stats.found + ' | ' + (stats.found / stats.total * 100).toFixed(0) + '% | ' + stats.missing + ' |\n';
}
md += '\n';

// Missing per corte con dettaglio
md += '---\n\n## Sentenze Mancanti per Corte\n\n';

// Ordina missing per corte e citazioni
const missingByCorte = {};
for (const s of missingList) {
    if (!missingByCorte[s.corte]) missingByCorte[s.corte] = [];
    missingByCorte[s.corte].push(s);
}

// Per ogni corte, le più citate missing
for (const [corte, refs] of Object.entries(missingByCorte).sort((a, b) => b[1].length - a[1].length)) {
    refs.sort((a, b) => b.citazioni - a.citazioni);
    md += '### ' + corte + ' (' + refs.length + ' mancanti)\n\n';

    // Classificazione per reperibilità
    let reperibile = '';
    if (corte === 'Cassazione') reperibile = 'ItalGiure (italgiure.giustizia.it)';
    else if (corte === 'Corte Costituzionale') reperibile = 'Corte Costituzionale (cortecostituzionale.it)';
    else if (corte === 'Consiglio di Stato' || corte === 'TAR') reperibile = 'Giustizia Amministrativa (giustizia-amministrativa.it)';
    else if (corte === 'Corte dei Conti') reperibile = 'Corte dei Conti (corteconti.it)';
    else reperibile = 'Da verificare';

    md += '> Fonte di reperimento: **' + reperibile + '**\n\n';

    // Top citate
    md += '| # | Cit. | Sentenza | Anno | Fonti |\n|---|---|---|---|---|\n';
    const showCount = Math.min(refs.length, corte === 'Cassazione' ? 50 : 30);
    for (let i = 0; i < showCount; i++) {
        const r = refs[i];
        const sez = r.sezione ? ' (' + r.sezione + ')' : '';
        md += '| ' + (i + 1) + ' | ' + r.citazioni + 'x | n. ' + r.numero + sez + ' | ' + r.anno + ' | ' + r.fonti.join(', ') + ' |\n';
    }
    if (refs.length > showCount) md += '\n*... e altre ' + (refs.length - showCount) + ' sentenze*\n';
    md += '\n';

    // Per anno breakdown
    const byY = {};
    refs.forEach(r => { if (!byY[r.anno]) byY[r.anno] = []; byY[r.anno].push(r); });
    md += '**Per anno**: ';
    const years = Object.keys(byY).sort((a, b) => parseInt(b) - parseInt(a));
    md += years.slice(0, 10).map(y => y + ' (' + byY[y].length + ')').join(', ');
    if (years.length > 10) md += ', ...';
    md += '\n\n';
}

// Sentenze trovate — riepilogo
md += '---\n\n## Sentenze Trovate (Top 50 per citazioni)\n\n';
md += '| # | Cit. | Sentenza | Anno | Fonte Archivio |\n|---|---|---|---|---|\n';
const topFound = foundList.sort((a, b) => b.citazioni - a.citazioni).slice(0, 50);
for (let i = 0; i < topFound.length; i++) {
    const r = topFound[i];
    const label = r.corte + (r.sezione ? ' (' + r.sezione + ')' : '') + ' n. ' + r.numero;
    md += '| ' + (i + 1) + ' | ' + r.citazioni + 'x | ' + label + ' | ' + r.anno + ' | ' + r.matchSource + ' |\n';
}
md += '\n';

const mdPath = path.join(outDir, 'riviste_crossref_report.md');
fs.writeFileSync(mdPath, md, 'utf8');
console.log('\n💾 JSON salvato: data/riviste_crossref.json');
console.log('📄 Report salvato: data/riviste_crossref_report.md (' + (md.length / 1024).toFixed(0) + ' KB)');

main_summary(byCorte, missingByCorte);

function main_summary(byCorte, missingByCorte) {
    console.log('\n' + '='.repeat(60));
    console.log('📌 RIEPILOGO AZIONI RACCOMANDATE:');
    
    const cassMissing = (missingByCorte['Cassazione'] || []);
    const cassSsuu = cassMissing.filter(s => s.sezione === 'ssuu');
    const cassCiv = cassMissing.filter(s => s.sezione === 'civ');
    const cassPen = cassMissing.filter(s => s.sezione === 'pen');
    const cassLav = cassMissing.filter(s => s.sezione === 'lav');
    const ccost = (missingByCorte['Corte Costituzionale'] || []);
    const cds = (missingByCorte['Consiglio di Stato'] || []);
    const tar = (missingByCorte['TAR'] || []);
    const cconti = (missingByCorte['Corte dei Conti'] || []);
    
    console.log(`\n   1. CASSAZIONE mancanti: ${cassMissing.length}`);
    console.log(`      - SS.UU.: ${cassSsuu.length} → ItalGiure (priorità ALTA)`);
    console.log(`      - Civile: ${cassCiv.length} → ItalGiure`);
    console.log(`      - Penale: ${cassPen.length} → ItalGiure`);
    console.log(`      - Lavoro: ${cassLav.length} → ItalGiure`);
    console.log(`   2. CORTE COST.: ${ccost.length} → cortecostituzionale.it`);
    console.log(`   3. CONS. STATO: ${cds.length} → giustizia-amministrativa.it`);
    console.log(`   4. TAR: ${tar.length} → giustizia-amministrativa.it`);
    console.log(`   5. CORTE CONTI: ${cconti.length} → corteconti.it`);
}
