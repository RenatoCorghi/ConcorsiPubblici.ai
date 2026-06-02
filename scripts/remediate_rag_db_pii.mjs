/**
/**
 * REMEDIATE RAG DB PII
 * 
 * Bonifica in-place per tutti i chunk RAG su Supabase.
 * Scansiona tutti i chunk delle tipologie contaminate ('sentenza_sez_semplici' e 'sentenza_cc_vip')
 * ed applica l'anonymizer v3 in-place su Supabase.
 * 
 * Uso:
 *   node scripts/remediate_rag_db_pii.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// ── Caricamento .env ──
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ── ANONYMIZER v3.0 Two-Pass ──
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

// ── PII Regex Patterns per lo scan veloce ──
const PII_PATTERNS = [
    { name: 'CF', regex: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi },
    { name: 'Nascita', regex: /\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi },
    { name: 'Avv+Nome', regex: /\b(?:Avv\.?\s*t?o?|Avvocat[oa])\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Dott+Nome', regex: /\b(?:Dott\.?\s*(?:ssa)?)\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Sig+Nome', regex: /\b(?:Sig\.?\s*(?:ra)?|Signor[ae]?)\s+[A-ZÀ-Ú][a-zàèéìòù']+\s+[A-ZÀ-Ú][a-zàèéìòù']+/g },
    { name: 'Indirizzo', regex: /\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+/gi },
    { name: 'Email', regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g }
];

function hasPII(content) {
    for (const { name, regex } of PII_PATTERNS) {
        regex.lastIndex = 0;
        const matches = content.match(regex);
        if (matches) {
            for (const m of matches) {
                // Escludi falsi positivi noti
                if (/Avvocat[oa]\s+General/i.test(m)) continue;
                if (/Avvocat[oa]\s+dello\s+Stato/i.test(m)) continue;
                if (/Avvocat[oi]\s+dello\s+Stato/i.test(m)) continue;
                if (/Procurator/i.test(m)) continue;
                return true;
            }
        }
    }
    return false;
}

const TARGET_TYPES = ['sentenza_sez_semplici', 'sentenza_cc_vip'];

async function remediateType(tipo) {
    console.log(`\n🚀 Avvio bonifica per tipo: '${tipo}'`);
    console.log('='.repeat(50));

    let offset = 0;
    const PAGE_SIZE = 1000;
    let scanned = 0;
    let modified = 0;
    let errors = 0;

    const startTime = Date.now();

    while (true) {
        // Legge solo id e content del tipo target
        const { data, error } = await supabase
            .from('rag_chunks')
            .select('id, content')
            .eq('tipo', tipo)
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            console.error(`\n❌ Errore di caricamento all'offset ${offset}:`, error.message);
            break;
        }

        if (!data || data.length === 0) break;

        // 1. Scansiona i chunk della pagina locali e identifica quelli che necessitano di bonifica
        const chunksToUpdate = [];
        for (const chunk of data) {
            scanned++;
            const original = chunk.content || '';
            if (hasPII(original)) {
                const anonymized = anonymizeText(original);
                if (anonymized !== original) {
                    chunksToUpdate.push({ id: chunk.id, content: anonymized });
                }
            }
        }

        // 2. Esegui gli update in micro-gruppi di 5 alla volta per evitare statement timeout ed FTS lock contention
        const BATCH_UPDATE_SIZE = 5;
        for (let u = 0; u < chunksToUpdate.length; u += BATCH_UPDATE_SIZE) {
            const batch = chunksToUpdate.slice(u, u + BATCH_UPDATE_SIZE);
            await Promise.all(batch.map(async (item) => {
                let attempts = 3;
                while (attempts > 0) {
                    try {
                        const { error: updateErr } = await supabase
                            .from('rag_chunks')
                            .update({ content: item.content })
                            .eq('id', item.id);

                        if (updateErr) {
                            throw updateErr;
                        }
                        modified++;
                        break; // Success!
                    } catch (e) {
                        attempts--;
                        if (attempts === 0) {
                            errors++;
                            if (errors <= 10) {
                                console.error(`\n❌ Errore durante l'update del chunk ${item.id} dopo 3 tentativi:`, e.message);
                            }
                        } else {
                            // Attesa esponenziale prima del retry (es. 200ms, poi 400ms)
                            const waitTime = 200 * (3 - attempts);
                            await new Promise(r => setTimeout(r, waitTime));
                        }
                    }
                }
            }));
            
            // Un piccolo delay di 60ms per dare respiro al DB
            await new Promise(r => setTimeout(r, 60));
        }

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = scanned / elapsed;
        process.stdout.write(`\r🔍 Scansionati: ${scanned} | Bonificati: ${modified} | Errori: ${errors} | Velocità: ${speed.toFixed(1)} chunks/s`);

        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    console.log(`\n\n✅ Completata bonifica per '${tipo}'!`);
    console.log(`   • Chunk totali analizzati: ${scanned}`);
    console.log(`   • Chunk bonificati nel DB: ${modified}`);
    console.log(`   • Errori riscontrati:      ${errors}`);
    console.log(`   • Tempo impiegato:         ${((Date.now() - startTime) / 1000).toFixed(1)} secondi`);
}

async function main() {
    console.log('========================================================');
    console.log('🏛️  BONIFICA RAG DATABASE IN-PLACE — GDPR PRIVACY SAFETY');
    console.log('========================================================\n');

    const totalStartTime = Date.now();

    for (const tipo of TARGET_TYPES) {
        await remediateType(tipo);
    }

    console.log('\n========================================================');
    console.log('🎉 BONIFICA RAG COMPLETATA CON SUCCESSO!');
    console.log(`   • Tempo totale: ${(((Date.now() - totalStartTime) / 1000) / 60).toFixed(1)} minuti`);
    console.log('========================================================\n');
}

main().catch(console.error);
