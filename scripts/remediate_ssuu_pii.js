/**
 * BONIFICA PII — Schede VIP SS.UU.
 * 
 * Strategia in 3 fasi:
 * 
 * FASE 1: Applica l'anonymizer v3 alle 488 schede VIP contaminate.
 *         Questo è un passaggio locale, velocissimo — niente API calls.
 *         Sovrascrive i file .md locali con la versione pulita.
 * 
 * FASE 2: Re-embeds e re-upsert i chunk nel database Supabase.
 *         Usa lo script rag-ingest-ssuu-vip.js dopo aver pulito i file.
 * 
 * FASE 3: Verifica finale — ri-scansione per ZERO PII.
 * 
 * NOTA: Questo script esegue solo la FASE 1 (pulizia locale).
 *       La FASE 2 (re-ingest) va fatta separatamente.
 */
import fs from 'fs';
import path from 'path';

// ══════════════════════════════════════════════════════════════════
// ANONYMIZER v3.0 Two-Pass (copia da generate_sezioni_semplici_vip.js)
// ══════════════════════════════════════════════════════════════════
function anonymizeText(text) {
    if (!text) return '';
    let clean = text;

    // Normalizza apostrofi tipografici
    clean = clean.replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'");

    // PASS 1: Estrazione nomi
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
    // 1a. MAIUSCOLI + "nato a"
    const upperNameRegex = /\b([A-ZÀ-Ú'][A-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'][A-ZÀ-Ú']+){1,4})\s+(?:nat[oa]\s+a|avverso|Parti|parte)/g;
    while ((m = upperNameRegex.exec(clean)) !== null) addName(m[1]);
    // 1b. "proposto da"
    const propRegex = /(?:proposto da|sul ricorso (?:proposto )?da)[:\s]+([A-ZÀ-Ú'][a-zàèéìòùA-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'a-zàèéìòù]+){1,4})\s+(?:nat[oa]|avverso|con sede|elettivamente)/gi;
    while ((m = propRegex.exec(clean)) !== null) addName(m[1]);
    // 1c. Prefissi professionali
    const prefixRegex = /(?:Avvocat[oi]|Avv\.?\s*t?o?|Dott\.?\s*(?:ssa)?|Prof\.?\s*(?:ssa)?|Sig\.?\s*(?:ra)?|Signor[ae]?|Ing\.|Geom\.|Rag\.)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = prefixRegex.exec(clean)) !== null) addName(m[1]);
    // 1c-bis. Contrazioni
    const contractedPrefixRegex = /(?:l['']|dall['']|dell['']|all[''])(?:Avv|avv)\.?\s*t?o?\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = contractedPrefixRegex.exec(clean)) !== null) addName(m[1]);
    // 1c-ter. Multi-avvocato
    const multiLawyerRegex = /(?:dagli|degli|dalle)\s+(?:Avvocat[oi]|avvocat[oi])\s+(.+?)(?=\s+giusta|\s+con\s+procura|\s+rappresentat)/gi;
    while ((m = multiLawyerRegex.exec(clean)) !== null) {
        for (const part of m[1].split(/\s+e\s+/)) addName(part.replace(/\([^)]+\)/g, '').trim());
    }
    // 1c-quater. "a mezzo dell'avv."
    const mezzoRegex = /a mezzo (?:dell['']avv\.?\s*t?o?|del difensore)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/gi;
    while ((m = mezzoRegex.exec(clean)) !== null) addName(m[1]);
    // 1d. Ruoli
    const roleRegex = /(?:Consigliere|Magistrato|Giudice|Presidente|Sostituto Procuratore Generale|Procuratore Generale)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:De|Di|D'[A-Za-zàèéìòùÀ-Ú]|del|della)\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/g;
    while ((m = roleRegex.exec(clean)) !== null) addName(m[1]);
    // 1e. Keyword contestuali
    const ctxRegex = /(?:posizione di|istanza di|carico di|confronti di|difensore di|difeso da|difesa da|a favore di|nei confronti di|parte civile[:\s]+|Parti civili[:\s]+|ricorso di|figlio|figlia|coniuge)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/gi;
    while ((m = ctxRegex.exec(clean)) !== null) addName(m[1]);

    // Filtra parole legali
    const legalWords = new Set([
        'Corte', 'Tribunale', 'Cassazione', 'Sezione', 'Penale', 'Civile',
        'Repubblica', 'Italiana', 'Fatto', 'Diritto', 'Sentenza', 'Ordinanza',
        'Decreto', 'Ricorso', 'Appello', 'Procuratore', 'Generale', 'Pubblico',
        'Ministero', 'Camera', 'Consiglio', 'Stato', 'Presidente', 'Consigliere',
        'Commissario', 'Giudice', 'Udienza', 'Semplice', 'Concordato', 'con', 'del',
        'della', 'che', 'per', 'non', 'nel', 'una', 'suo', 'sua', 'gli', 'dei',
        'Aggiunto', 'Generale',
    ]);
    for (const name of [...extractedNames]) {
        if (legalWords.has(name) || name.length < 3) extractedNames.delete(name);
    }

    // PASS 2: Sostituzione globale
    const sortedNames = [...extractedNames].sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
        if (name.length < 3) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<=[\\s,;:.("\\-]|^)${escaped}(?=[\\s,;:.)"\\-]|$)`, 'g');
        clean = clean.replace(regex, '[OMISSIS]');
    }

    // PASS 3: Regex strutturali
    clean = clean.replace(/\(?[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\)?/gi, '[CF_OMISSIS]');
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a a [OMISSIS] il [OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a il [OMISSIS]');
    clean = clean.replace(/\b(?:residente|domiciliat[oa]|domicilio|con sede)\s+(?:in|a)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s,]+?(?:(?:via|viale|piazza|p\.zza|corso|largo|contrada|alla via)\s+[A-Za-zàèéìòùÀ-Ú'\s.]+?(?:n\.\s*\d+[\/\w]*)?)?(?=\s*[,;.\-]|\s+presso|\s+rappresentat|\s+in persona|\s+elettivamente)/gi, '[DOMICILIO_OMISSIS]');
    clean = clean.replace(/\b(?:R\.?G\.?|r\.?g\.?)\s*(?:n\.?\s*)?\d+[\/\-]\d{4}/g, 'R.G. [OMISSIS]');
    clean = clean.replace(/\bn\.?\s*\d+[\/\-]\d{4}\s*R\.?G\.?/gi, 'R.G. [OMISSIS]');
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\/\w]*/gi, '[INDIRIZZO_OMISSIS]');

    return clean;
}

// ══════════════════════════════════════════════════════════════════
// FASE 1: PULIZIA LOCALE
// ══════════════════════════════════════════════════════════════════

function getAllFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...getAllFiles(full));
        else if (entry.name.endsWith('.md')) results.push(full);
    }
    return results;
}

const VIP_DIR = path.resolve('./sentenze_ssuu_vip');

// Carica il report delle schede contaminate
const reportPath = path.resolve('./pii_scan_ssuu_report.json');
let contaminatedFiles;

if (fs.existsSync(reportPath)) {
    contaminatedFiles = JSON.parse(fs.readFileSync(reportPath, 'utf8')).map(r => r.file);
    console.log(`📋 Report PII caricato: ${contaminatedFiles.length} file da bonificare.`);
} else {
    // Se non c'è report, bonifica TUTTE le schede per sicurezza
    console.log('⚠️  Nessun report PII trovato. Bonifica TUTTE le schede.');
    contaminatedFiles = getAllFiles(VIP_DIR).map(f => path.relative(VIP_DIR, f));
}

console.log(`\n🔧 FASE 1: Pulizia locale di ${contaminatedFiles.length} schede VIP...`);
console.log('='.repeat(60));

let cleaned = 0;
let errors = 0;

for (const relFile of contaminatedFiles) {
    const filePath = path.join(VIP_DIR, relFile);
    if (!fs.existsSync(filePath)) {
        console.log(`   ⏭️  ${relFile} non trovato, salto.`);
        continue;
    }

    try {
        const original = fs.readFileSync(filePath, 'utf8');
        const sanitized = anonymizeText(original);

        if (sanitized !== original) {
            fs.writeFileSync(filePath, sanitized, 'utf8');
            cleaned++;
            if (cleaned <= 10) console.log(`   ✅ ${relFile} — bonificato (${original.length} → ${sanitized.length} chars)`);
        }
    } catch (e) {
        console.error(`   ❌ Errore su ${relFile}: ${e.message}`);
        errors++;
    }
}

if (cleaned > 10) console.log(`   ... e altri ${cleaned - 10} file bonificati.`);

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 RISULTATI FASE 1:`);
console.log(`   File processati: ${contaminatedFiles.length}`);
console.log(`   File modificati: ${cleaned}`);
console.log(`   Errori:          ${errors}`);
console.log(`\n📌 PROSSIMO STEP: Esegui 'node scripts/scan_ssuu_pii.js' per verificare ZERO PII.`);
console.log(`📌 POI: Esegui 'node scripts/rag-ingest-ssuu-vip.js' per re-vettorializzare le schede pulite.`);
