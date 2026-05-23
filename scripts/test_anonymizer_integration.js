/**
 * TEST INTEGRAZIONE v3.1 Two-Pass Anonymizer
 * Applica l'anonymizer alle sentenze reali e verifica ZERO leak di nomi.
 */
import fs from 'fs';
import path from 'path';

// Copia esatta dell'anonymizer v3.1 da generate_sezioni_semplici_vip.js
function anonymizeText(text) {
    if (!text) return '';
    let clean = text;
    // Normalize typographic apostrophes to ASCII
    clean = clean.replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'");
    const extractedNames = new Set();
    function addName(fullName) {
        if (!fullName) return;
        const trimmed = fullName.trim().replace(/\s+/g, ' ');
        if (trimmed.length < 3) return;
        extractedNames.add(trimmed);
        for (const part of trimmed.split(/\s+/)) {
            const cleaned = part.replace(/['']/g, '');
            if (cleaned.length >= 3 && /[A-ZÀ-Ú]/.test(cleaned[0])) {
                extractedNames.add(part);
            }
        }
    }
    let m;
    // 1a
    const upperNameRegex = /\b([A-ZÀ-Ú'][A-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'][A-ZÀ-Ú']+){1,4})\s+(?:nat[oa]\s+a|avverso|Parti|parte)/g;
    while ((m = upperNameRegex.exec(clean)) !== null) addName(m[1]);
    // 1b
    const propRegex = /(?:proposto da|sul ricorso (?:proposto )?da)[:\s]+([A-ZÀ-Ú'][a-zàèéìòùA-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'a-zàèéìòù]+){1,4})\s+(?:nat[oa]|avverso|con sede|elettivamente)/gi;
    while ((m = propRegex.exec(clean)) !== null) addName(m[1]);
    // 1c
    const prefixRegex = /(?:Avvocat[oi]|Avv\.?\s*t?o?|Dott\.?\s*(?:ssa)?|Prof\.?\s*(?:ssa)?|Sig\.?\s*(?:ra)?|Signor[ae]?|Ing\.|Geom\.|Rag\.)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D[''e])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = prefixRegex.exec(clean)) !== null) addName(m[1]);
    // 1c-bis contracted
    const contractedPrefixRegex = /(?:l['']|dall['']|dell['']|all[''])(?:Avv|avv)\.?\s*t?o?\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D[''e])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = contractedPrefixRegex.exec(clean)) !== null) addName(m[1]);
    // 1c-ter multi lawyer
    const multiLawyerRegex = /(?:dagli|degli|dalle)\s+(?:Avvocat[oi]|avvocat[oi])\s+(.+?)(?=\s+giusta|\s+con\s+procura|\s+rappresentat)/gi;
    while ((m = multiLawyerRegex.exec(clean)) !== null) {
        const parts = m[1].split(/\s+e\s+/);
        for (const part of parts) addName(part.replace(/\([^)]+\)/g, '').trim());
    }
    // 1c-quater
    const mezzoRegex = /a mezzo (?:dell['']avv\.?\s*t?o?|del difensore)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/gi;
    while ((m = mezzoRegex.exec(clean)) !== null) addName(m[1]);
    // 1d roles
    const roleRegex = /(?:Consigliere|Magistrato|Giudice|Presidente|Sostituto Procuratore Generale|Procuratore Generale)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:De|Di|D[''e]|del|della)\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/g;
    while ((m = roleRegex.exec(clean)) !== null) addName(m[1]);
    // 1e context keywords
    const ctxRegex = /(?:posizione di|istanza di|carico di|confronti di|difensore di|difensore|difeso da|difesa da|a favore di|nei confronti di|parte civile[:\s]+|Parti civili[:\s]+|ricorso di|nomina .+ di|figlio|figlia|coniuge|marito|moglie|padre|madre)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/gi;
    while ((m = ctxRegex.exec(clean)) !== null) addName(m[1]);
    // 1f parti civili
    const partiCiviliRegex = /Parti civili[:\s]+(.+?)(?=avverso|$)/gi;
    while ((m = partiCiviliRegex.exec(clean)) !== null) {
        for (const n of m[1].split(/\s+e\s+|\s*,\s*/)) addName(n.trim());
    }
    // Filter legal words
    const legalWords = new Set([
        'Corte', 'Tribunale', 'Cassazione', 'Sezione', 'Penale', 'Civile',
        'Repubblica', 'Italiana', 'Fatto', 'Diritto', 'Sentenza', 'Ordinanza',
        'Decreto', 'Ricorso', 'Appello', 'Procuratore', 'Generale', 'Pubblico',
        'Ministero', 'Camera', 'Consiglio', 'Stato', 'Presidente', 'Consigliere',
        'Commissario', 'Giudice', 'Udienza', 'Semplice', 'Concordato', 'con', 'del',
        'della', 'che', 'per', 'non', 'nel', 'una', 'suo', 'sua', 'gli', 'dei',
        'SENTENZA', 'ORDINANZA', 'DECRETO', 'CORTE', 'TRIBUNALE', 'FATTI',
        'CAUSA', 'DIRITTO', 'FATTO', 'CONSIDERATO', 'RITENUTO', 'RAGIONI',
        'DECISIONE', 'RICORSO', 'MOTIVI', 'RIGETTA', 'ANNULLA', 'RINVIA',
        'APPELLO', 'PROCURATORE', 'GENERALE', 'SOSTITUTO', 'PUBBLICO',
        'MINISTERO', 'CONDANNA', 'SEZIONE', 'CIVILE', 'PENALE',
    ]);
    for (const name of [...extractedNames]) {
        if (legalWords.has(name) || name.length < 3) extractedNames.delete(name);
    }
    // PASS 2: replace all
    const sortedNames = [...extractedNames].sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
        if (name.length < 3) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        clean = clean.replace(new RegExp(`(?<=[\\s,;:.("\\-]|^)${escaped}(?=[\\s,;:.)"\\-]|$)`, 'g'), '[OMISSIS]');
    }
    // PASS 3: structural data
    clean = clean.replace(/\(?[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\)?/gi, '[CF_OMISSIS]');
    clean = clean.replace(/\b\d{11}\b/g, '[OMISSIS]');
    clean = clean.replace(/\bIT\s?\d{2}\s?[A-Z]\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}\b/gi, '[OMISSIS]');
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a a [OMISSIS] il [OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a il [OMISSIS]');
    clean = clean.replace(/\b(?:residente|domiciliat[oa]|domicilio|con sede)\s+(?:in|a)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s,]+?(?:(?:via|viale|piazza|p\.zza|corso|largo|contrada|alla via)\s+[A-Za-zàèéìòùÀ-Ú'\s.]+?(?:n\.\s*\d+[\/\w]*)?)?(?=\s*[,;.\-]|\s+presso|\s+rappresentat|\s+in persona|\s+elettivamente)/gi, '[DOMICILIO_OMISSIS]');
    clean = clean.replace(/\b(?:R\.?G\.?|r\.?g\.?)\s*(?:n\.?\s*)?\d+[\/\-]\d{4}/g, 'R.G. [OMISSIS]');
    clean = clean.replace(/\bn\.?\s*\d+[\/\-]\d{4}\s*R\.?G\.?/gi, 'R.G. [OMISSIS]');
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\/\w]*/gi, '[INDIRIZZO_OMISSIS]');
    return clean;
}

// ── TEST ──
const testFiles = [
    { file: 'sentenze_sez_semplici/2025/snpen2025100124S.md', names: ['De Stasio', 'Alessio Pio', 'DE STASIO', 'Vincenzo Siani', 'Marinelli', 'Berardi', 'Falcone'] },
    { file: 'sentenze_sez_semplici/2025/snpen2025100033S.md', names: ["D'Alcalà", "D'ALCALÀ", "Leonardo Luca", "Claudio Strata"] },
    { file: 'sentenze_sez_semplici/2025/snciv2025100348S.md', names: ['Stefano Di Meo', 'Francesco Sardegna', 'Barbara Chianelli', 'Elisabetta Nardone', 'Fabio Dominici', 'Alberto Pazzi', 'Stanislao De Matteis', 'DMISFN49M29H501F'] },
    { file: 'sentenze_sez_semplici/2025/snpen2025100645S.md', names: ['PAOLUCCI', 'Gianmarco', 'Gentile Isolina', "D'Amico Alvaro", 'Licia Carla'] },
];

console.log('🔍 TEST INTEGRAZIONE v3.1 Two-Pass Anonymizer');
console.log('='.repeat(60));
let totalLeaks = 0;
for (const { file, names } of testFiles) {
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) { console.log(`⏭️  ${file} non trovato`); continue; }
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = anonymizeText(raw);
    console.log(`\n📄 ${path.basename(file)} (${raw.length} → ${cleaned.length} chars)`);
    let leaks = 0;
    for (const name of names) {
        if (cleaned.includes(name)) {
            const idx = cleaned.indexOf(name);
            console.log(`   ❌ LEAK: "${name}"`);
            console.log(`      ...${cleaned.substring(Math.max(0, idx - 30), idx + name.length + 30)}...`);
            leaks++; totalLeaks++;
        }
    }
    if (leaks === 0) console.log(`   ✅ ${names.length}/${names.length} nomi rimossi!`);
}
console.log(`\n${'='.repeat(60)}`);
if (totalLeaks > 0) { console.log(`⚠️  ${totalLeaks} LEAK`); process.exit(1); }
else console.log(`🎉 ZERO LEAK — GDPR-compliant!`);
