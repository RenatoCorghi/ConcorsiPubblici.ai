/**
 * TEST UNITARIO DELL'ANONYMIZER v2.0
 * Verifica che tutti i pattern PII trovati nelle sentenze reali vengano catturati.
 */
import fs from 'fs';
import path from 'path';

// --- Inlining della funzione anonymizeText dal generate_sezioni_semplici_vip.js ---
function anonymizeText(text) {
    if (!text) return '';
    let clean = text;

    clean = clean.replace(/\(?[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\)?/gi, '[CF_OMISSIS]');
    clean = clean.replace(/\b\d{11}\b/g, '[OMISSIS]');
    clean = clean.replace(/\bIT\s?\d{2}\s?[A-Z]\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}\b/gi, '[OMISSIS]');
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');
    clean = clean.replace(/(?:\+?39[\s.\-]?)?\b(?:0\d{1,3}|\d{3})[\s.\-\/]?\d{6,8}\b/g, '[TEL_OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a a [OMISSIS] il [OMISSIS]');
    clean = clean.replace(/\b(?:residente|domiciliat[oa]|domicilio|con sede)\s+(?:in|a)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s,]+?(?:(?:via|viale|piazza|p\.zza|corso|largo|contrada|loc\.|località|alla via)\s+[A-Za-zàèéìòùÀ-Ú'\s.]+?(?:n\.\s*\d+[\/\w]*)?)?(?=\s*[,;.\-]|\s+presso|\s+rappresentat|\s+in persona|\s+elettivamente)/gi, '[DOMICILIO_OMISSIS]');
    clean = clean.replace(/\b(Avvocat[oa]|Avv\.?\s*t?o?|Dott\.?\s*(?:ssa)?|Prof\.?\s*(?:ssa)?|Sig\.?\s*(?:ra)?|Signor[ae]?|Ing\.|Geom\.|Rag\.)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:di|del|della|De|Di|D')[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/g, '$1 [OMISSIS]');

    const legalUppercaseWords = new Set([
        'SENTENZA', 'ORDINANZA', 'DECRETO', 'CORTE', 'TRIBUNALE', 'CASSAZIONE',
        'SEZIONE', 'SEZIONI', 'UNITE', 'PENALE', 'CIVILE', 'SUPREMA', 'REPUBBLICA',
        'ITALIANA', 'NOME', 'DEL', 'DELLA', 'DELLE', 'DELLO', 'DEGLI', 'PER',
        'DI', 'DA', 'IN', 'CON', 'SU', 'TRA', 'FRA', 'ALLE', 'ALLA', 'ALLO',
        'DALLE', 'DALLA', 'DALLO', 'NELLE', 'NELLA', 'NELLO', 'SULLE', 'SULLA',
        'FATTO', 'DIRITTO', 'CONSIDERATO', 'RITENUTO', 'RAGIONI', 'DECISIONE',
        'FATTI', 'CAUSA', 'MOTIVI', 'RICORSO', 'RIGETTA', 'ANNULLA', 'RINVIA',
        'APPELLO', 'PROCURATORE', 'GENERALE', 'SOSTITUTO', 'PUBBLICO', 'MINISTERO',
        'UDIENZA', 'CONSIGLIO', 'STATO', 'CAMERA', 'SEZIONE', 'SEMPLICE',
        'RIS', 'DNA', 'PG', 'PM', 'ART', 'COD', 'PROC', 'PEN', 'CIV',
        'CONCORDATO', 'PREVENTIVO', 'FALLIMENTARE', 'COMMISSARIO', 'GIUDICE',
        'CONSIGLIERE', 'PRESIDENTE', 'RELAZIONE', 'CONCLUSIONI', 'CONDANNA',
    ]);

    clean = clean.replace(/\b([A-ZÀ-Ú'][A-ZÀ-Ú']{1,}(?:\s+(?:D[''E]|DE[LLAI]*|DELL[AEO]?)\s+)?(?:\s+[A-ZÀ-Ú'][A-ZÀ-Ú']+){1,4})\b/g, (match) => {
        const words = match.split(/\s+/);
        const allLegal = words.every(w => legalUppercaseWords.has(w.replace(/['']/g, '')));
        if (allLegal) return match;
        const nonLegalCount = words.filter(w => !legalUppercaseWords.has(w.replace(/['']/g, ''))).length;
        if (nonLegalCount >= 1 && words.length >= 2) return '[NOME_OMISSIS]';
        return match;
    });

    // 9b. COGNOME MAIUSCOLO + Nome misto
    clean = clean.replace(/\b([A-ZÀ-Ú'][A-ZÀ-Ú']{2,})\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,2})\b/g, (match, surname) => {
        if (legalUppercaseWords.has(surname.replace(/['']/g, ''))) return match;
        return '[NOME_OMISSIS]';
    });

    clean = clean.replace(/\b(proposto da|ricorso di|imputat[oa]|ricorrente|indagat[oa]|condan[nt]at[oa]|convenu[ot][oa]|resistente|appellante|parte civile|difensore di|difeso da|difesa da|a favore di|nei confronti di|confronti del|carico di|posizione di|istanza di)\s*:?\s*([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:di|del|della|D[''e]|De|Di)[a-z]*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){1,3})/gi, '$1 [OMISSIS]');
    clean = clean.replace(/\b(?:R\.?G\.?|r\.?g\.?)\s*(?:n\.?\s*)?\d+[\/\-]\d{4}/g, 'R.G. [OMISSIS]');
    clean = clean.replace(/\bn\.?\s*\d+[\/\-]\d{4}\s*R\.?G\.?/gi, 'R.G. [OMISSIS]');
    clean = clean.replace(/\bnato\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato il [OMISSIS]');
    clean = clean.replace(/\bnata\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nata il [OMISSIS]');
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\/\w]*/gi, '[INDIRIZZO_OMISSIS]');

    return clean;
}

// ==============================
// TEST CASES ESTRATTI DA SENTENZE REALI
// ==============================
const tests = [
    // --- Codici Fiscali (con e senza parentesi) ---
    { input: "dell'Avvocato Stefano Di Meo (DMISFN49M29H501F)", should_not_contain: "DMISFN49M29H501F", label: "CF tra parentesi" },
    { input: "Francesco Sardegna (SRDFNC56H02G478P)", should_not_contain: "SRDFNC56H02G478P", label: "CF tra parentesi 2" },
    { input: "Barbara Chianelli (CHNBBR67C49G478N)", should_not_contain: "CHNBBR67C49G478N", label: "CF tra parentesi 3" },

    // --- Nomi MAIUSCOLI (sentenze penali) ---
    { input: "proposto da: DE STASIO ALESSIO PIO nato a SAN SEVERO", should_not_contain: "DE STASIO ALESSIO PIO", label: "Nome MAIUSCOLO 3 parole" },
    { input: "D'ALCALÀ VINCENZO nato a ROGGIANO GRAVINA", should_not_contain: "D'ALCALÀ VINCENZO", label: "Nome con apostrofo MAIUSCOLO" },
    { input: "PAOLUCCI Gianmarco nato a", should_not_contain: "PAOLUCCI Gianmarco", label: "Nome MAIUSC+misto" },

    // --- Nomi misti dopo keyword contestuali ---
    { input: "posizione di Vincenzo D'Alcalà (soggetto in espiazione)", should_not_contain: "Vincenzo D'Alcalà", label: "Nome misto con apostrofo dopo 'posizione di'" },
    { input: "istanza di Alessio Pio De Stasio di sostituzione", should_not_contain: "Alessio Pio De Stasio", label: "Nome misto 3 parole dopo 'istanza di'" },

    // --- Nascita con città MAIUSCOLA ---
    { input: "nato a SAN SEVERO il 28/10/1988", should_not_contain: "28/10/1988", label: "Data nascita con città MAIUSCOLA" },
    { input: "nato a ROGGIANO GRAVINA il 18/10/1957", should_not_contain: "18/10/1957", label: "Data nascita con doppia città MAIUSCOLA" },
    { input: "nato a L'AQUILA il 29/05/1995", should_not_contain: "29/05/1995", label: "Data nascita con apostrofo città" },

    // --- Avvocati ---
    { input: "dall'Avvocato Stefano Di Meo per la ricorrente", should_not_contain: "Stefano Di Meo", label: "Avvocato + nome" },
    { input: "difeso dall'Avvocato Fabio Dominici", should_not_contain: "Fabio Dominici", label: "Avvocato + nome 2" },
    { input: "Avv. Claudio Strata, deducendo", should_not_contain: "Claudio Strata", label: "Avv. abbreviato + nome" },

    // --- Domicili e indirizzi ---
    { input: "domiciliata in Roma, via Giuseppe Pisanelli n. 2, presso lo studio", should_not_contain: "via Giuseppe Pisanelli n. 2", label: "Domicilio con indirizzo completo" },
    { input: "con sede in Mugnano, in persona del legale rappresentante", should_not_contain: "Mugnano", label: "Sede società" },

    // --- R.G. ---
    { input: "iscritto al n. 16710/2021 R.G.", should_not_contain: "16710/2021", label: "Numero R.G." },

    // --- Parti civili senza prefisso (pattern difficile) ---
    { input: "a favore di Gentile Isolina e D'Amico Alvaro", should_not_contain: "Gentile Isolina", label: "Parte civile senza prefisso" },

    // --- Conferma NON-anonimizzazione termini legali ---
    { input: "CONSIDERATO IN DIRITTO", should_contain: "CONSIDERATO IN DIRITTO", label: "Termine legale NON anonimizzato" },
    { input: "RITENUTO IN FATTO", should_contain: "RITENUTO IN FATTO", label: "Termine legale NON anonimizzato 2" },
];

console.log("🔒 TEST UNITARIO ANONYMIZER v2.0");
console.log("=".repeat(60));

let passed = 0, failed = 0;

for (const t of tests) {
    const result = anonymizeText(t.input);
    let ok;
    
    if (t.should_not_contain) {
        ok = !result.includes(t.should_not_contain);
        if (!ok) {
            console.log(`\n❌ FAIL: ${t.label}`);
            console.log(`   Input:    "${t.input}"`);
            console.log(`   Output:   "${result}"`);
            console.log(`   TROVATO:  "${t.should_not_contain}" (doveva essere rimosso!)`);
            failed++;
        } else {
            console.log(`✅ PASS: ${t.label}`);
            passed++;
        }
    } else if (t.should_contain) {
        ok = result.includes(t.should_contain);
        if (!ok) {
            console.log(`\n❌ FAIL: ${t.label}`);
            console.log(`   Input:    "${t.input}"`);
            console.log(`   Output:   "${result}"`);
            console.log(`   MANCANTE: "${t.should_contain}" (doveva essere preservato!)`);
            failed++;
        } else {
            console.log(`✅ PASS: ${t.label}`);
            passed++;
        }
    }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`📊 Risultati: ${passed} PASS, ${failed} FAIL su ${tests.length} test`);
if (failed > 0) {
    console.log("⚠️  CI SONO FALLE DA CORREGGERE!");
    process.exit(1);
} else {
    console.log("🎉 TUTTI I TEST SUPERATI — Anonymizer sicuro!");
}
