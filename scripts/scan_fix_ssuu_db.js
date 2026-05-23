/**
 * SCANNER + BONIFICA PII nei chunk SS.UU. già nel database Supabase.
 * 
 * Tipo target: 'sentenza_ssuu' (677 chunk)
 * 
 * Fase 1: Scansiona tutti i chunk per PII
 * Fase 2: Se --fix, applica anonymizer v3 e aggiorna il chunk in-place (UPDATE)
 * 
 * Uso: 
 *   node scripts/scan_fix_ssuu_db.js          # solo scan
 *   node scripts/scan_fix_ssuu_db.js --fix     # scan + fix in-place
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const FIX_MODE = process.argv.includes('--fix');

// ═══ ANONYMIZER v3 ═══
function anonymizeText(text) {
    if (!text) return '';
    let clean = text;
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
    const upperNameRegex = /\b([A-ZÀ-Ú'][A-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'][A-ZÀ-Ú']+){1,4})\s+(?:nat[oa]\s+a|avverso|Parti|parte)/g;
    while ((m = upperNameRegex.exec(clean)) !== null) addName(m[1]);
    const propRegex = /(?:proposto da|sul ricorso (?:proposto )?da)[:\s]+([A-ZÀ-Ú'][a-zàèéìòùA-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'a-zàèéìòù]+){1,4})\s+(?:nat[oa]|avverso|con sede|elettivamente)/gi;
    while ((m = propRegex.exec(clean)) !== null) addName(m[1]);
    const prefixRegex = /(?:Avvocat[oi]|Avvocata|Avv\.?\s*t?o?|Dott\.?\s*(?:ssa)?|Prof\.?\s*(?:ssa)?|Sig\.?\s*(?:ra)?|Signor[ae]?|Ing\.|Geom\.|Rag\.)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = prefixRegex.exec(clean)) !== null) addName(m[1]);
    const contractedPrefixRegex = /(?:l['']|dall['']|dell['']|all[''])(?:Avv|avv)\.?\s*t?o?\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = contractedPrefixRegex.exec(clean)) !== null) addName(m[1]);
    const multiLawyerRegex = /(?:dagli|degli|dalle)\s+(?:Avvocat[oi]|avvocat[oi])\s+(.+?)(?=\s+giusta|\s+con\s+procura|\s+rappresentat)/gi;
    while ((m = multiLawyerRegex.exec(clean)) !== null) {
        for (const part of m[1].split(/\s+e\s+/)) addName(part.replace(/\([^)]+\)/g, '').trim());
    }
    const mezzoRegex = /a mezzo (?:dell['']avv\.?\s*t?o?|del difensore)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/gi;
    while ((m = mezzoRegex.exec(clean)) !== null) addName(m[1]);
    const roleRegex = /(?:Consigliere|Magistrato|Giudice|Presidente|Sostituto Procuratore Generale|Procuratore Generale)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:De|Di|D'[A-Za-zàèéìòùÀ-Ú]|del|della)\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/g;
    while ((m = roleRegex.exec(clean)) !== null) addName(m[1]);
    const ctxRegex = /(?:posizione di|istanza di|carico di|confronti di|difensore di|difeso da|difesa da|a favore di|nei confronti di|parte civile[:\s]+|Parti civili[:\s]+|ricorso di|figlio|figlia|coniuge)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/gi;
    while ((m = ctxRegex.exec(clean)) !== null) addName(m[1]);

    const legalWords = new Set([
        'Corte','Tribunale','Cassazione','Sezione','Penale','Civile',
        'Repubblica','Italiana','Fatto','Diritto','Sentenza','Ordinanza',
        'Decreto','Ricorso','Appello','Procuratore','Generale','Pubblico',
        'Ministero','Camera','Consiglio','Stato','Presidente','Consigliere',
        'Commissario','Giudice','Udienza','Semplice','Concordato','Aggiunto',
        'con','del','della','che','per','non','nel','una','suo','sua','gli','dei',
    ]);
    for (const name of [...extractedNames]) {
        if (legalWords.has(name) || name.length < 3) extractedNames.delete(name);
    }

    const sortedNames = [...extractedNames].sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
        if (name.length < 3) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        clean = clean.replace(new RegExp(`(?<=[\\s,;:.("\\-]|^)${escaped}(?=[\\s,;:.)"\\-]|$)`, 'g'), '[OMISSIS]');
    }

    clean = clean.replace(/\(?[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\)?/gi, '[CF_OMISSIS]');
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a a [OMISSIS] il [OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a il [OMISSIS]');
    clean = clean.replace(/\b(?:residente|domiciliat[oa]|domicilio|con sede)\s+(?:in|a)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s,]+?(?:(?:via|viale|piazza|p\.zza|corso|largo|contrada)\s+[A-Za-zàèéìòùÀ-Ú'\s.]+?(?:n\.\s*\d+[\/\w]*)?)?(?=\s*[,;.\-]|\s+presso|\s+rappresentat|\s+in persona|\s+elettivamente)/gi, '[DOMICILIO_OMISSIS]');
    clean = clean.replace(/\b(?:R\.?G\.?|r\.?g\.?)\s*(?:n\.?\s*)?\d+[\/\-]\d{4}/g, 'R.G. [OMISSIS]');
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\/\w]*/gi, '[INDIRIZZO_OMISSIS]');
    return clean;
}

// ═══ PII PATTERNS per scan ═══
const PII_PATTERNS = [
    { name: 'CF', regex: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi },
    { name: 'Nascita', regex: /\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi },
    { name: 'Avv+Nome', regex: /\b(?:Avv\.?\s*t?o?|Avvocat[oa])\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Dott+Nome', regex: /\b(?:Dott\.?\s*(?:ssa)?)\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Indirizzo', regex: /\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+/gi },
    { name: 'Email', regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g },
];

async function main() {
    console.log(`🔍 SCAN${FIX_MODE ? ' + FIX' : ''} PII — chunk SS.UU. nel database`);
    console.log('='.repeat(60));

    // Fetch tutti i chunk sentenza_ssuu (paginated)
    let allChunks = [];
    let from = 0;
    const PAGE = 500;
    while (true) {
        const { data, error } = await supabase
            .from('rag_chunks')
            .select('id, content, document_id')
            .eq('tipo', 'sentenza_ssuu')
            .range(from, from + PAGE - 1);
        if (error) { console.error('DB error:', error.message); break; }
        if (!data || data.length === 0) break;
        allChunks.push(...data);
        from += PAGE;
        if (data.length < PAGE) break;
    }

    console.log(`📦 Recuperati ${allChunks.length} chunk con tipo 'sentenza_ssuu'.`);

    let contaminated = 0, totalHits = 0, fixed = 0, fixErrors = 0;

    for (const chunk of allChunks) {
        const content = chunk.content;
        let hits = 0;

        for (const { name, regex } of PII_PATTERNS) {
            regex.lastIndex = 0;
            const matches = content.match(regex);
            if (matches) {
                for (const m of matches) {
                    if (/Avvocat[oa]\s+General/i.test(m)) continue;
                    if (/Procurator/i.test(m)) continue;
                    hits++;
                }
            }
        }

        if (hits > 0) {
            contaminated++;
            totalHits += hits;
            if (contaminated <= 10) {
                console.log(`❌ chunk ${chunk.id.substring(0, 8)}... (${hits} hit PII)`);
            }

            // FIX: applica anonymizer e aggiorna nel DB
            if (FIX_MODE) {
                try {
                    const cleaned = anonymizeText(content);
                    const { error } = await supabase
                        .from('rag_chunks')
                        .update({ content: cleaned })
                        .eq('id', chunk.id);
                    if (error) throw error;
                    fixed++;
                    await new Promise(r => setTimeout(r, 50));
                } catch (e) {
                    fixErrors++;
                    if (fixErrors <= 5) console.error(`   Fix error: ${e.message}`);
                }
            }
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RISULTATI:`);
    console.log(`   Chunk scansionati:    ${allChunks.length}`);
    console.log(`   Chunk contaminati:    ${contaminated} (${(contaminated/allChunks.length*100).toFixed(1)}%)`);
    console.log(`   Hit PII totali:       ${totalHits}`);
    if (FIX_MODE) {
        console.log(`   ✅ Chunk bonificati:  ${fixed}`);
        console.log(`   ❌ Errori fix:        ${fixErrors}`);
    } else if (contaminated > 0) {
        console.log(`\n💡 Per bonificare, rilancia con: node scripts/scan_fix_ssuu_db.js --fix`);
    }
}

main();
