/**
 * REVERSE ENGINEERING RIVISTE → Estrazione Riferimenti Giurisprudenziali
 * 
 * Scandaglia tutte le schede VIP generate da:
 *   1. Giurisprudenza Italiana (giurit_*)
 *   2. Federalismi (federalismi_*)
 *   3. Rivista della Corte dei Conti (corteconti_*)
 *   4. Riviste Penale (riviste_penale_vip_v3)
 * 
 * Estrae ogni riferimento a sentenza/ordinanza/decreto citato,
 * normalizzandolo in un formato strutturato.
 * 
 * Output: data/riviste_sentenze_index.json
 */

import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════
// SORGENTI DA SCANDAGLIARE
// ═══════════════════════════════════════════════════
const SOURCES = [
    { name: 'Giurisprudenza Italiana (v2)', dir: 'riviste_vip_schede_v2', filter: d => d.startsWith('giurit_') },
    { name: 'Giurisprudenza Italiana (v1)', dir: 'riviste_vip_schede', filter: d => d.startsWith('giurit_') },
    { name: 'Federalismi (v2)', dir: 'riviste_vip_schede_v2/federalismi', filter: () => true },
    { name: 'Federalismi (v1)', dir: 'riviste_vip_schede/federalismi', filter: () => true },
    { name: 'Immobili & Proprietà', dir: 'riviste_vip_schede_v2', filter: d => d.startsWith('immo_') },
    { name: 'Danno e Responsabilità', dir: 'riviste_vip_schede_v2', filter: d => d.startsWith('dannresp_') },
    { name: 'Rivista Corte dei Conti', dir: 'corte_conti_vip_schede', filter: () => true },
    { name: 'Riviste Penale v3', dir: 'riviste_penale_vip_v3', filter: () => true },
];

// ═══════════════════════════════════════════════════
// REGEX PATTERNS per catturare riferimenti
// ═══════════════════════════════════════════════════
const PATTERNS = [
    // --- CASSAZIONE ---
    // "Cass. Civ., Sez. Un., 17 marzo 2022, n. 8763"
    // "Cass. Pen., Sez. III, 12 gennaio 2024, n. 1234"
    // "Cass. Civ. n. 10902/2024"
    // "Cass., Sez. Un., n. 1234/2024"
    // "Cass. civ., sez. un., 12 maggio 2023, n. 1234"
    {
        name: 'Cassazione estesa',
        regex: /Cass(?:azione)?\.?\s*(?:,\s*)?(?:Civ|Pen|civ|pen|S\.U|SS\.?\s*UU)\.?,?\s*(?:(?:Sez(?:ione|\.)\s*(?:Un(?:ite)?\.?|I{1,3}V?|VI?I?|L|Lav|Trib)\.?,?\s*)?)?(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4},?\s*)?n\.?\s*(\d+)(?:\s*\/\s*(\d{4}))?/gi,
        extract: (m, text) => {
            const num = m[1];
            let year = m[2];
            if (!year) {
                // Cerca anno nel contesto vicino
                const pos = m.index;
                const ctx = text.substring(Math.max(0, pos - 50), pos + m[0].length + 30);
                const yearMatch = ctx.match(/\b(20[012]\d)\b/);
                if (yearMatch) year = yearMatch[1];
            }
            // Determina se civile o penale
            const full = m[0].toLowerCase();
            let sezione = 'civ';
            if (/pen/i.test(full)) sezione = 'pen';
            if (/s\.?\s*u|ss\.?\s*uu|un(?:ite)?/i.test(full)) sezione = 'ssuu';
            if (/lav/i.test(full)) sezione = 'lav';
            if (/trib/i.test(full)) sezione = 'trib';
            return {
                corte: 'Cassazione',
                sezione,
                numero: parseInt(num),
                anno: year ? parseInt(year) : null,
                raw: m[0].trim()
            };
        }
    },
    // --- CORTE COSTITUZIONALE ---
    // "Corte Cost., sent. n. 123/2024"  "C. Cost. n. 45/2023"
    {
        name: 'Corte Costituzionale',
        regex: /(?:Corte\s+Cost(?:ituzionale)?|C\.\s*Cost)\.?,?\s*(?:sent(?:enza)?\.?\s*)?(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4},?\s*)?n\.?\s*(\d+)\s*\/\s*(\d{4})/gi,
        extract: (m) => ({
            corte: 'Corte Costituzionale',
            sezione: null,
            numero: parseInt(m[1]),
            anno: parseInt(m[2]),
            raw: m[0].trim()
        })
    },
    // --- CONSIGLIO DI STATO ---
    // "Cons. Stato, Sez. IV, 12 marzo 2024, n. 1234"
    // "Cons. St., n. 1234/2024"
    {
        name: 'Consiglio di Stato',
        regex: /Cons(?:iglio)?\.?\s*(?:di\s+)?St(?:ato)?\.?,?\s*(?:(?:Sez(?:ione)?\.?\s*(?:I{1,3}V?|VI?I?|Ad\.?\s*Plen)\.?,?\s*)?)?(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4},?\s*)?n\.?\s*(\d+)(?:\s*\/\s*(\d{4}))?/gi,
        extract: (m, text) => {
            const num = m[1];
            let year = m[2];
            if (!year) {
                const pos = m.index;
                const ctx = text.substring(Math.max(0, pos - 50), pos + m[0].length + 30);
                const ym = ctx.match(/\b(20[012]\d)\b/);
                if (ym) year = ym[1];
            }
            const full = m[0].toLowerCase();
            let sez = null;
            if (/ad\.?\s*plen/i.test(full)) sez = 'ad_plen';
            return {
                corte: 'Consiglio di Stato',
                sezione: sez,
                numero: parseInt(num),
                anno: year ? parseInt(year) : null,
                raw: m[0].trim()
            };
        }
    },
    // --- TAR ---
    // "TAR Lazio, Roma, Sez. I, n. 1234/2024"
    // "T.A.R. Campania, Napoli, n. 5678/2023"
    {
        name: 'TAR',
        regex: /T\.?A\.?R\.?\s+([A-ZÀ-Ú][a-zàèéìòù]+)(?:,?\s*(?:Roma|Napoli|Milano|Palermo|Catania|Bari|Firenze|Torino|Venezia|Bologna|Brescia|Lecce|Salerno|Reggio Calabria|Cagliari|Ancona|Pescara|Perugia|Trento|Trieste|Genova|Potenza|Catanzaro))?,?\s*(?:Sez\.?\s*(?:I{1,3}V?|VI?I?)\.?,?\s*)?(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4},?\s*)?n\.?\s*(\d+)(?:\s*\/\s*(\d{4}))?/gi,
        extract: (m, text) => {
            const regione = m[1];
            const num = m[2];
            let year = m[3];
            if (!year) {
                const pos = m.index;
                const ctx = text.substring(Math.max(0, pos - 30), pos + m[0].length + 30);
                const ym = ctx.match(/\b(20[012]\d)\b/);
                if (ym) year = ym[1];
            }
            return {
                corte: 'TAR',
                sezione: regione,
                numero: parseInt(num),
                anno: year ? parseInt(year) : null,
                raw: m[0].trim()
            };
        }
    },
    // --- CORTE DEI CONTI ---
    // "Corte dei Conti, Sez. Giurisd. Lazio, n. 123/2024"
    // "C. Conti, Sez. Riunite, n. 1/2023"
    {
        name: 'Corte dei Conti',
        regex: /(?:Corte\s+dei\s+Conti|C\.\s*Conti)\.?,?\s*(?:Sez(?:ione)?\.?\s*(?:(?:Giurisd(?:izionale)?\.?\s*)?(?:[A-ZÀ-Ú][a-zàèéìòù]+|Riunite|Centr(?:ale)?|Appello|I{1,3}V?|VI?I?)\.?,?\s*)?)?(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4},?\s*)?n\.?\s*(\d+)(?:\s*\/\s*(\d{4}))?/gi,
        extract: (m, text) => {
            const num = m[1];
            let year = m[2];
            if (!year) {
                const pos = m.index;
                const ctx = text.substring(Math.max(0, pos - 30), pos + m[0].length + 30);
                const ym = ctx.match(/\b(20[012]\d)\b/);
                if (ym) year = ym[1];
            }
            return {
                corte: 'Corte dei Conti',
                sezione: null,
                numero: parseInt(num),
                anno: year ? parseInt(year) : null,
                raw: m[0].trim()
            };
        }
    },
    // --- CORTE D'APPELLO ---
    {
        name: 'Corte d\'Appello',
        regex: /Corte\s+d['']?\s*Appello\s+(?:di\s+)?([A-ZÀ-Ú][a-zàèéìòù]+)(?:,?\s*(?:Sez\.?\s*(?:Spec\.?\s*(?:Imprese)?|I{1,3}V?|VI?I?|Lav)\.?,?\s*)?)?(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4},?\s*)?(?:n\.?\s*(\d+)(?:\s*\/\s*(\d{4}))?)?/gi,
        extract: (m, text) => {
            const sede = m[1];
            const num = m[2] ? parseInt(m[2]) : null;
            let year = m[3] ? parseInt(m[3]) : null;
            if (!year) {
                const pos = m.index;
                const ctx = text.substring(Math.max(0, pos - 20), pos + m[0].length + 30);
                const ym = ctx.match(/\b(20[012]\d)\b/);
                if (ym) year = parseInt(ym[1]);
            }
            return {
                corte: 'Corte d\'Appello',
                sezione: sede,
                numero: num,
                anno: year,
                raw: m[0].trim()
            };
        }
    },
    // --- CGUE / CEDU ---
    {
        name: 'CGUE',
        regex: /(?:CGUE|Corte\s+di\s+Giustizia\s*(?:UE|dell['']?Unione\s+Europea)?|C\.G\.U\.E\.?),?\s*(?:(?:Grande\s+Sezione|Sez\.?\s*(?:I{1,3}V?|VI?I?))\.?,?\s*)?(?:(?:sent(?:enza)?\.?\s*)?(\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4}),?\s*)?(?:causa\s+)?(?:C[-–]\d+\/\d+)?/gi,
        extract: (m) => ({
            corte: 'CGUE',
            sezione: null,
            numero: null,
            anno: null,
            raw: m[0].trim()
        })
    },
    // --- CEDU ---
    {
        name: 'CEDU',
        regex: /(?:CEDU|Corte\s+(?:EDU|Europea\s+dei\s+Diritti\s+dell['']?Uomo|Eur\.\s*Dir\.\s*Uomo)),?\s*(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})?/gi,
        extract: (m) => ({
            corte: 'CEDU',
            sezione: null,
            numero: null,
            anno: null,
            raw: m[0].trim()
        })
    },
];

// ═══════════════════════════════════════════════════
// FUNZIONE DI ESTRAZIONE
// ═══════════════════════════════════════════════════
function extractReferences(text) {
    const refs = [];
    for (const pat of PATTERNS) {
        let m;
        pat.regex.lastIndex = 0;
        while ((m = pat.regex.exec(text)) !== null) {
            try {
                const ref = pat.extract(m, text);
                if (ref) refs.push(ref);
            } catch (e) { /* skip malformed */ }
        }
    }
    return refs;
}

function deduplicateKey(ref) {
    return `${ref.corte}|${ref.sezione || ''}|${ref.numero || ''}|${ref.anno || ''}`;
}

function getFilesRecursive(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...getFilesRecursive(full));
        else if (entry.name.endsWith('.md')) results.push(full);
    }
    return results;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════
async function main() {
    console.log('🔍 REVERSE ENGINEERING RIVISTE — Estrazione Sentenze Citate');
    console.log('='.repeat(60));

    const allRefs = [];       // Tutti i riferimenti (con duplicati per conteggio)
    const refMap = new Map(); // Dedup: key -> { ref, count, sources[] }
    let totalFiles = 0;

    for (const source of SOURCES) {
        const baseDir = path.resolve(source.dir);
        if (!fs.existsSync(baseDir)) {
            console.log(`⚠️  ${source.name}: directory non trovata (${baseDir})`);
            continue;
        }

        // Identifica le sottocartelle da analizzare
        let dirs = [];
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory() && source.filter(e.name)) {
                dirs.push(path.join(baseDir, e.name));
            }
        }

        // Se non ci sono sottocartelle filtrate, usa la base stessa
        if (dirs.length === 0 && source.filter('')) {
            dirs = [baseDir];
        }

        let sourceRefs = 0;
        let sourceFiles = 0;

        for (const dir of dirs) {
            const files = getFilesRecursive(dir);
            sourceFiles += files.length;
            totalFiles += files.length;

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf8');
                const refs = extractReferences(content);

                for (const ref of refs) {
                    ref.fonte_rivista = source.name;
                    ref.fonte_file = path.relative('.', file);
                    allRefs.push(ref);
                    sourceRefs++;

                    const key = deduplicateKey(ref);
                    if (!refMap.has(key)) {
                        refMap.set(key, { ...ref, citazioni: 1, fonti: [source.name] });
                    } else {
                        const existing = refMap.get(key);
                        existing.citazioni++;
                        if (!existing.fonti.includes(source.name)) {
                            existing.fonti.push(source.name);
                        }
                    }
                }
            }
        }

        console.log(`📚 ${source.name}: ${sourceFiles} schede → ${sourceRefs} riferimenti estratti`);
    }

    // Ordina per numero di citazioni (le più citate prima)
    const uniqueRefs = [...refMap.values()].sort((a, b) => b.citazioni - a.citazioni);
    const byCorte = {};
    for (const ref of uniqueRefs) byCorte[ref.corte] = (byCorte[ref.corte] || 0) + 1;
    const byAnno = {};
    for (const ref of uniqueRefs) { if (ref.anno) byAnno[ref.anno] = (byAnno[ref.anno] || 0) + 1; }
    const rankable = uniqueRefs.filter(r => r.numero);

    console.log('\n' + '='.repeat(60));
    console.log('Sentenze uniche:', uniqueRefs.length, '| Con dati completi:', rankable.length);

    // ── JSON ──
    const outDir = path.resolve('data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const jsonOut = { metadata: { generatedAt: new Date().toISOString(), totalFiles, totalCitazioniRaw: allRefs.length, sentenzeUniche: uniqueRefs.length, perCorte: byCorte, perAnno: byAnno }, top100: rankable.slice(0, 100), sentenze: uniqueRefs.filter(r => r.anno && r.numero) };
    fs.writeFileSync(path.join(outDir, 'riviste_sentenze_index.json'), JSON.stringify(jsonOut, null, 2), 'utf8');

    // ── MARKDOWN REPORT ──
    let md = '';
    md += '# Indice Sentenze Citate nelle Riviste Giuridiche\n\n';
    md += '> Generato automaticamente il ' + new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n\n---\n\n';

    md += '## Panoramica Generale\n\n';
    md += '| Metrica | Valore |\n|---|---|\n';
    md += '| File analizzati | **' + totalFiles + '** |\n';
    md += '| Citazioni totali (raw) | **' + allRefs.length + '** |\n';
    md += '| Sentenze uniche identificate | **' + uniqueRefs.length + '** |\n';
    md += '| Di cui con dati completi | **' + jsonOut.sentenze.length + '** |\n\n';

    // PER RIVISTA
    md += '## Dettaglio per Rivista\n\n';
    md += '| # | Rivista | Schede | Citazioni |\n|---|---|---|---|\n';
    let si = 1;
    for (const s of SOURCES) {
        const sr = allRefs.filter(r => r.fonte_rivista === s.name);
        const sf = new Set(sr.map(r => r.fonte_file)).size;
        if (sr.length > 0) md += '| ' + si++ + ' | ' + s.name + ' | ' + sf + ' | ' + sr.length + ' |\n';
    }
    md += '\n';

    // PER CORTE
    md += '## Distribuzione per Corte\n\n';
    md += '| Corte | Sentenze uniche | % |\n|---|---|---|\n';
    for (const [corte, count] of Object.entries(byCorte).sort((a, b) => b[1] - a[1])) {
        md += '| ' + corte + ' | ' + count + ' | ' + (count / uniqueRefs.length * 100).toFixed(1) + '% |\n';
    }
    md += '\n';

    // Cassazione per sezione
    const cassSez = {};
    uniqueRefs.filter(r => r.corte === 'Cassazione').forEach(r => { cassSez[r.sezione || 'altro'] = (cassSez[r.sezione || 'altro'] || 0) + 1; });
    md += '### Cassazione - per sezione\n\n| Sezione | Sentenze |\n|---|---|\n';
    for (const [sez, c] of Object.entries(cassSez).sort((a, b) => b[1] - a[1])) {
        const label = { civ: 'Civile', pen: 'Penale', ssuu: 'Sezioni Unite', lav: 'Lavoro', trib: 'Tributaria' }[sez] || sez;
        md += '| ' + label + ' | ' + c + ' |\n';
    }
    md += '\n';

    // PER ANNO
    md += '## Distribuzione per Anno\n\n| Anno | Sentenze |\n|---|---|\n';
    for (const [anno, count] of Object.entries(byAnno).sort((a, b) => parseInt(b) - parseInt(a))) {
        md += '| ' + anno + ' | ' + count + ' |\n';
    }
    md += '\n';

    // TOP 50
    md += '## TOP 50 Sentenze Piu Citate\n\n';
    md += '| # | Cit. | Sentenza | Fonti |\n|---|---|---|---|\n';
    for (let i = 0; i < Math.min(50, rankable.length); i++) {
        const r = rankable[i];
        const label = r.corte + (r.sezione ? ' (' + r.sezione + ')' : '') + ' n. ' + r.numero + '/' + (r.anno || '?');
        md += '| ' + (i + 1) + ' | **' + r.citazioni + 'x** | ' + label + ' | ' + r.fonti.join(', ') + ' |\n';
    }
    md += '\n';

    // PER OGNI CORTE PRINCIPALE
    const corti = ['Cassazione', 'Corte Costituzionale', 'Consiglio di Stato', 'Corte dei Conti', 'TAR', "Corte d'Appello"];
    for (const corte of corti) {
        const refs = rankable.filter(r => r.corte === corte && r.anno).sort((a, b) => b.citazioni - a.citazioni || b.anno - a.anno);
        if (refs.length === 0) continue;
        md += '---\n\n## ' + corte + ' (' + refs.length + ' sentenze)\n\n';
        md += '### Le piu citate\n\n| # | Cit. | Sentenza | Anno | Fonti |\n|---|---|---|---|---|\n';
        for (let i = 0; i < Math.min(20, refs.length); i++) {
            const r = refs[i];
            md += '| ' + (i + 1) + ' | ' + r.citazioni + 'x | n. ' + r.numero + (r.sezione ? ' (' + r.sezione + ')' : '') + ' | ' + r.anno + ' | ' + r.fonti.join(', ') + ' |\n';
        }
        md += '\n';

        if (corte === 'Cassazione') {
            for (const sez of ['ssuu', 'civ', 'pen', 'lav']) {
                const sezRefs = refs.filter(r => r.sezione === sez);
                if (sezRefs.length < 3) continue;
                const sezLabel = { ssuu: 'Sezioni Unite', civ: 'Civile', pen: 'Penale', lav: 'Lavoro' }[sez];
                md += '#### ' + sezLabel + ' (' + sezRefs.length + ' sentenze)\n\n';
                const byY = {};
                sezRefs.forEach(r => { if (!byY[r.anno]) byY[r.anno] = []; byY[r.anno].push(r); });
                for (const y of Object.keys(byY).sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 6)) {
                    const yr = byY[y].sort((a, b) => b.citazioni - a.citazioni);
                    md += '**' + y + '** (' + yr.length + '): ' + yr.slice(0, 10).map(r => 'n. ' + r.numero + ' [' + r.citazioni + 'x]').join(', ');
                    if (yr.length > 10) md += ', ... +' + (yr.length - 10);
                    md += '\n\n';
                }
            }
        } else {
            const byY = {};
            refs.forEach(r => { if (!byY[r.anno]) byY[r.anno] = []; byY[r.anno].push(r); });
            for (const y of Object.keys(byY).sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 6)) {
                const yr = byY[y].sort((a, b) => b.citazioni - a.citazioni);
                md += '**' + y + '** (' + yr.length + '): ' + yr.slice(0, 8).map(r => 'n. ' + r.numero + ' [' + r.citazioni + 'x]').join(', ');
                if (yr.length > 8) md += ', ... +' + (yr.length - 8);
                md += '\n\n';
            }
        }
    }

    // CROSS RIVISTA
    md += '---\n\n## Sentenze Cross-Rivista (citate in 2+ fonti diverse)\n\n';
    const crossRivista = rankable.filter(r => r.fonti.length >= 2).sort((a, b) => b.fonti.length - a.fonti.length || b.citazioni - a.citazioni);
    md += '> ' + crossRivista.length + ' sentenze citate in almeno 2 riviste diverse — massima probabilita di rilevanza concorsuale.\n\n';
    md += '| # | Cit. | Sentenza | N. Fonti | Fonti |\n|---|---|---|---|---|\n';
    for (let i = 0; i < Math.min(50, crossRivista.length); i++) {
        const r = crossRivista[i];
        const label = r.corte + (r.sezione ? ' (' + r.sezione + ')' : '') + ' n. ' + r.numero + '/' + (r.anno || '?');
        md += '| ' + (i + 1) + ' | ' + r.citazioni + 'x | ' + label + ' | ' + r.fonti.length + ' | ' + r.fonti.join(', ') + ' |\n';
    }
    md += '\n';

    // ELENCO COMPLETO
    md += '---\n\n## Elenco Completo (' + jsonOut.sentenze.length + ' sentenze con dati completi)\n\n';
    for (const corte of corti) {
        const cRefs = jsonOut.sentenze.filter(r => r.corte === corte).sort((a, b) => b.anno - a.anno || b.numero - a.numero);
        if (cRefs.length === 0) continue;
        md += '### ' + corte + ' (' + cRefs.length + ')\n\n';
        const byY = {};
        cRefs.forEach(r => { const y = r.anno; if (!byY[y]) byY[y] = []; byY[y].push(r); });
        for (const y of Object.keys(byY).sort((a, b) => parseInt(b) - parseInt(a))) {
            const yr = byY[y].sort((a, b) => b.citazioni - a.citazioni);
            md += '- **' + y + '**: ' + yr.map(r => 'n. ' + r.numero + (r.sezione ? ' (' + r.sezione + ')' : '') + ' [' + r.citazioni + 'x]').join(', ') + '\n';
        }
        md += '\n';
    }

    const mdPath = path.join(outDir, 'riviste_sentenze_report.md');
    fs.writeFileSync(mdPath, md, 'utf8');
    console.log('Report Markdown salvato: ' + mdPath + ' (' + (md.length / 1024).toFixed(0) + ' KB)');
}

main().catch(console.error);

