/**
 * SCANNER PII sulle schede VIP SS.UU. già generate.
 * 
 * Strategia: cerca pattern strutturali di PII nel testo delle schede VIP:
 * - Codici Fiscali
 * - Date di nascita ("nato a ... il DD/MM/YYYY")
 * - Prefissi professionali + nome ("Avv. Nome Cognome")
 * - Pattern "Nome Cognome" con cognomi italiani
 * - Indirizzi (via/piazza + civico)
 * - Email
 * 
 * Se l'LLM ha anonimizzato bene, queste schede non dovrebbero contenerne.
 * Se ne contengono, dobbiamo ri-generarle con il v3 anonymizer.
 */
import fs from 'fs';
import path from 'path';

const VIP_DIR = path.resolve('./sentenze_ssuu_vip');

// Pattern PII da cercare nelle schede VIP
const PII_PATTERNS = [
    { name: 'Codice Fiscale', regex: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi },
    { name: 'Nascita', regex: /\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi },
    { name: 'Avv+Nome', regex: /\b(?:Avv\.?\s*t?o?|Avvocat[oa])\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Dott+Nome', regex: /\b(?:Dott\.?\s*(?:ssa)?)\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Sig+Nome', regex: /\b(?:Sig\.?\s*(?:ra)?|Signor[ae]?)\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Indirizzo', regex: /\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+/gi },
    { name: 'Email', regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
    { name: 'IBAN', regex: /\bIT\d{2}[A-Z]\d{10,22}\b/gi },
];

// Scansiona ricorsivamente
function getAllFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...getAllFiles(full));
        else if (entry.name.endsWith('.md')) results.push(full);
    }
    return results;
}

console.log('🔍 SCANNER PII — Schede VIP SS.UU. già generate');
console.log('='.repeat(60));

const files = getAllFiles(VIP_DIR);
console.log(`📁 Trovate ${files.length} schede VIP da scansionare.\n`);

let totalFiles = 0;
let filesWithPII = 0;
let totalHits = 0;
const fileReport = [];

for (const filePath of files) {
    totalFiles++;
    const content = fs.readFileSync(filePath, 'utf8');
    const hits = [];

    for (const { name, regex } of PII_PATTERNS) {
        // Reset regex lastIndex
        regex.lastIndex = 0;
        const matches = content.match(regex);
        if (matches) {
            for (const m of matches) {
                // Escludi falsi positivi (titoli istituzionali)
                if (/Avvocat[oa]\s+General/i.test(m)) continue;
                if (/Procurator/i.test(m)) continue;
                hits.push({ type: name, match: m.substring(0, 60) });
            }
        }
    }

    if (hits.length > 0) {
        filesWithPII++;
        totalHits += hits.length;
        fileReport.push({ file: path.relative(VIP_DIR, filePath), hits });
        // Show first 20 problematic files
        if (filesWithPII <= 20) {
            console.log(`❌ ${path.relative(VIP_DIR, filePath)}`);
            for (const h of hits.slice(0, 3)) {
                console.log(`   [${h.type}] "${h.match}"`);
            }
            if (hits.length > 3) console.log(`   ... e altri ${hits.length - 3} hit`);
        }
    }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 RISULTATI SCANSIONE:`);
console.log(`   File totali scansionati: ${totalFiles}`);
console.log(`   File con PII residui:    ${filesWithPII} (${(filesWithPII/totalFiles*100).toFixed(1)}%)`);
console.log(`   Hit PII totali:          ${totalHits}`);

if (filesWithPII > 0) {
    console.log(`\n⚠️  ${filesWithPII} SCHEDE CONTENGONO PII — Necessaria rigenerazione!`);
    
    // Salva report completo
    const reportPath = path.resolve('./pii_scan_ssuu_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(fileReport, null, 2));
    console.log(`📄 Report completo salvato in: ${reportPath}`);
} else {
    console.log(`\n🎉 NESSUN PII TROVATO — Le schede VIP SS.UU. sono pulite!`);
}
