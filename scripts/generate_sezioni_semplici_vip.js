import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caricamento .env
const envPath = path.join(__dirname, '..', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview";

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const INPUT_DIR = path.resolve('./sentenze_sez_semplici');
const OUTPUT_DIR = path.resolve('./sentenze_sez_semplici_vip');

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Consigliere della Suprema Corte di Cassazione, un severo Commissario del Concorso in Magistratura e un Senior Data Engineer.

[C - CONTESTO]
Ti verrà fornito in input il testo di una sentenza di Sezione Semplice (Civile o Penale) della Cassazione degli anni 2025/2026. Il testo è già stato pre-anonimizzato localmente tramite filtri regex, ma devi assicurarti che non ci sia traccia di nomi di persone fisiche o dati sensibili residui.

[F - FINALITÀ]
Il tuo obiettivo è redigere un "Dossier d'Autore" (Scheda VIP) ad altissimo contenuto scientifico, compatto ma estremamente denso di dogmatica giuridica, utile ad alimentare un database RAG per candidati avanzati a concorsi pubblici superiori (Magistratura, Avvocatura dello Stato).

[VINCOLI TASSATIVI]
1. Data Honesty e Divieto di Parafrasi: È SEVERAMENTE VIETATO fare copia-incolla pedissequo di interi paragrafi o riprodurre il testo normativo in modo ridondante. Rielabora i concetti con rigore, pulizia concettuale ed eccezionale precisione accademica.
2. Anonimizzazione Privacy: Sostituisci sistematicamente qualsiasi residuo nome di persona fisica o dato personale con qualifiche astratte (es. "il ricorrente", "il lavoratore", "la società cooperativa", "il terzo garante").
3. Filtro Triage (MANDATORIO): Se il provvedimento è un mero rinvio, una correzione di errore materiale o una decisione di inammissibilità per vizi procedurali banalissimi priva di qualsiasi interesse dogmatico o nomofilattico, apponi in cima la stringa [SCARTO_ASSOLUTO] e interrompi subito la generazione.

--- STRUTTURA DI OUTPUT RICHIESTA (Markdown) ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno analizza brevemente:
- La materia specifica e il rito applicato.
- La questione di diritto fondamentale affrontata.
- Se la sentenza introduce un principio rilevante o applica un orientamento consolidato (Triage).

Terminato il thinking, produci il seguente output:

# [Estremi del Provvedimento]

## 1. Il Fatto Storico e il Contesto Sostanziale
[Sintetizza in massimo 3-4 righe la vicenda materiale. Descrivi il nucleo del litigio sostanziale e la dinamica dei fatti.]

## 2. Il Nodo Ermeneutico
[Esponi con chiarezza il contrasto interpretativo o il dubbio normativo esaminato dalla Sezione. Chiarisci quali erano le opposte ricostruzioni teoriche sul punto.]

## 3. Il Principio di Diritto (La Massima)
[Enuncia in modo isolato, solenne e in **grassetto** il principio cardine cristallizzato dalla decisione.]

## 4. Ratio Decidendi e Profili Dogmatici
[Ricostruisci l'iter logico-giuridico seguito dal Collegio. Indica le norme interpretate (Costituzione, Codici, Leggi Speciali) e spiega perché la soluzione adottata è coerente con il sistema normativo generale.]

## 5. Spendibilità Concorsuale
[Fornisci 2 consigli pratici a elenco puntato: in quali tracce concorsuali (es. in tema di responsabilità civile, in tema di reati fallimentari) si usa questa sentenza e quale "trappola dogmatica" evitare nella stesura del tema.]

## 6. Tags
[5 hashtag per l'indicizzazione RAG, es. #ResponsabilitàMedica, #BancarottaSemplice]`;

// =========================================================================
// Funzione Locale di Pre-Anonimizzazione (MANDATORIA) — v3.0 Two-Pass
// =========================================================================
// v3.0: Approccio a DUE PASSATE.
//   PASS 1: Estrai tutti i nomi propri dall'intestazione della sentenza
//           usando pattern strutturali (prefissi, ruoli, keyword).
//   PASS 2: Cerca e sostituisci OGNI occorrenza di quei nomi nell'intero testo.
//   PASS 3: Regex residuali per CF, IBAN, email, indirizzi, date, etc.
// =========================================================================
function anonymizeText(text) {
    if (!text) return '';
    let clean = text;

    // Normalizza tutti gli apostrofi tipografici a ASCII standard
    // Questo elimina problemi di encoding nelle regex successivi
    clean = clean.replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'");
    // ══════════════════════════════════════════════════════════════════
    // PASS 1: ESTRAZIONE NOMI DAL TESTO
    // ══════════════════════════════════════════════════════════════════
    const extractedNames = new Set();

    // Helper: aggiunge nome e sue varianti (singole parole >= 3 char)
    function addName(fullName) {
        if (!fullName) return;
        const trimmed = fullName.trim().replace(/\s+/g, ' ');
        if (trimmed.length < 3) return;
        extractedNames.add(trimmed);
        // Aggiungi anche le singole parole del nome (cognomi usati da soli)
        for (const part of trimmed.split(/\s+/)) {
            const cleaned = part.replace(/['']/g, '');
            if (cleaned.length >= 3 && /[A-ZÀ-Ú]/.test(cleaned[0])) {
                extractedNames.add(part);
            }
        }
    }

    // 1a. Nomi MAIUSCOLI penali: "DE STASIO ALESSIO PIO nato a"
    const upperNameRegex = /\b([A-ZÀ-Ú'][A-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'][A-ZÀ-Ú']+){1,4})\s+(?:nat[oa]\s+a|avverso|Parti|parte)/g;
    let m;
    while ((m = upperNameRegex.exec(clean)) !== null) addName(m[1]);

    // 1b. Pattern "proposto da: COGNOME Nome" o "COGNOME Nome nato a"
    const propRegex = /(?:proposto da|sul ricorso (?:proposto )?da)[:\s]+([A-ZÀ-Ú'][a-zàèéìòùA-ZÀ-Ú']+(?:\s+[A-ZÀ-Ú'a-zàèéìòù]+){1,4})\s+(?:nat[oa]|avverso|con sede|elettivamente)/gi;
    while ((m = propRegex.exec(clean)) !== null) addName(m[1]);

    // 1c. Avvocato/Avv./Dott./Prof. + Nome (con o senza articolo contratto)
    // Copre: Avv., l'Avv., dall'Avv., dell'Avv., dell'avv., dagli Avvocati, etc.
    const prefixRegex = /(?:Avvocat[oi]|Avv\.?\s*t?o?|Dott\.?\s*(?:ssa)?|Prof\.?\s*(?:ssa)?|Sig\.?\s*(?:ra)?|Signor[ae]?|Ing\.|Geom\.|Rag\.)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D[''e])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = prefixRegex.exec(clean)) !== null) addName(m[1]);

    // 1c-bis. Stesso pattern ma con articolo contratto prima (l'avv., dall'avv., dell'avv.)
    const contractedPrefixRegex = /(?:l['']|dall['']|dell['']|all[''])(?:Avv|avv)\.?\s*t?o?\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:(?:di|del|della|De|Di|D[''e])\s*[A-Za-zàèéìòùÀ-Ú']*\s*)?(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/g;
    while ((m = contractedPrefixRegex.exec(clean)) !== null) addName(m[1]);

    // 1c-ter. "dagli Avvocati Nome1 Cognome1 ... e Nome2 Cognome2"
    const multiLawyerRegex = /(?:dagli|degli|dalle)\s+(?:Avvocat[oi]|avvocat[oi])\s+(.+?)(?=\s+giusta|\s+con\s+procura|\s+rappresentat)/gi;
    while ((m = multiLawyerRegex.exec(clean)) !== null) {
        // Split su " e " per catturare nomi multipli
        const parts = m[1].split(/\s+e\s+/);
        for (const part of parts) {
            // Rimuovi eventuali CF tra parentesi
            const cleaned = part.replace(/\([^)]+\)/g, '').trim();
            addName(cleaned);
        }
    }

    // 1c-quater. "a mezzo dell'avv./del difensore Nome Cognome"
    const mezzoRegex = /a mezzo (?:dell['']avv\.?\s*t?o?|del difensore)\s+([A-ZÀ-Ú](?:[a-zàèéìòùà-ú']+|\.)\s*(?:[A-ZÀ-Ú][a-zàèéìòùà-ú']+\s*){0,3})/gi;
    while ((m = mezzoRegex.exec(clean)) !== null) addName(m[1]);

    // 1d. Ruoli giudiziari: "dal Consigliere Alberto Pazzi"
    const roleRegex = /(?:Consigliere|Magistrato|Giudice|Presidente|Sostituto Procuratore Generale|Procuratore Generale)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:De|Di|D[''e]|del|della)\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/g;
    while ((m = roleRegex.exec(clean)) !== null) addName(m[1]);

    // 1e. Keyword contestuali: "posizione di Vincenzo D'Alcalà"
    const ctxRegex = /(?:posizione di|istanza di|carico di|confronti di|difensore di|difensore|difeso da|difesa da|a favore di|nei confronti di|parte civile[:\s]+|Parti civili[:\s]+|ricorso di|nomina .+ di|figlio|figlia|coniuge|marito|moglie|padre|madre)\s+([A-ZÀ-Ú][a-zàèéìòùà-ú']+(?:\s+(?:di|del|della|De|Di|D'[A-Za-zàèéìòùÀ-Ú])\s*[A-Za-zàèéìòùÀ-Ú']*)?(?:\s+[A-ZÀ-Ú][a-zàèéìòùà-ú']+){0,3})/gi;
    while ((m = ctxRegex.exec(clean)) !== null) addName(m[1]);

    // 1f. "Parti civili: Gentile Isolina D'Amico Alvaro"
    const partiCiviliRegex = /Parti civili[:\s]+(.+?)(?=avverso|$)/gi;
    while ((m = partiCiviliRegex.exec(clean)) !== null) {
        // Split su possibili separatori
        const names = m[1].split(/\s+e\s+|\s*,\s*/);
        for (const n of names) addName(n.trim());
    }

    // Filtra false positive (parole giuridiche comuni)
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

    // Rimuovi parole legali e parole troppo corte dalla lista
    for (const name of [...extractedNames]) {
        if (legalWords.has(name) || name.length < 3) {
            extractedNames.delete(name);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // PASS 2: SOSTITUZIONE DI TUTTI I NOMI ESTRATTI
    // ══════════════════════════════════════════════════════════════════
    // Ordina per lunghezza decrescente per evitare sostituzioni parziali
    const sortedNames = [...extractedNames].sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
        if (name.length < 3) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Usa boundary Unicode-aware: JS \b non tratta àèéìòù come word chars
        // Usiamo lookbehind/lookahead per spazi, punteggiatura o inizio/fine
        const regex = new RegExp(`(?<=[\\s,;:.("\\-]|^)${escaped}(?=[\\s,;:.)"\\-]|$)`, 'g');
        clean = clean.replace(regex, '[OMISSIS]');
    }

    // ══════════════════════════════════════════════════════════════════
    // PASS 3: REGEX RESIDUALI (dati strutturati)
    // ══════════════════════════════════════════════════════════════════

    // 3a. Codici Fiscali (anche tra parentesi)
    clean = clean.replace(/\(?[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\)?/gi, '[CF_OMISSIS]');

    // 3b. Partite IVA
    clean = clean.replace(/\b\d{11}\b/g, '[OMISSIS]');

    // 3c. IBAN
    clean = clean.replace(/\bIT\s?\d{2}\s?[A-Z]\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}\b/gi, '[OMISSIS]');

    // 3d. Email
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');

    // 3e. Nascita residua
    clean = clean.replace(/\bnat[oa]\s+a\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s]+?\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a a [OMISSIS] il [OMISSIS]');
    clean = clean.replace(/\bnat[oa]\s+il\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/gi, 'nato/a il [OMISSIS]');

    // 3f. Domicilio/residenza
    clean = clean.replace(/\b(?:residente|domiciliat[oa]|domicilio|con sede)\s+(?:in|a)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s,]+?(?:(?:via|viale|piazza|p\.zza|corso|largo|contrada|alla via)\s+[A-Za-zàèéìòùÀ-Ú'\s.]+?(?:n\.\s*\d+[\/\w]*)?)?(?=\s*[,;.\-]|\s+presso|\s+rappresentat|\s+in persona|\s+elettivamente)/gi, '[DOMICILIO_OMISSIS]');

    // 3g. R.G.
    clean = clean.replace(/\b(?:R\.?G\.?|r\.?g\.?)\s*(?:n\.?\s*)?\d+[\/\-]\d{4}/g, 'R.G. [OMISSIS]');
    clean = clean.replace(/\bn\.?\s*\d+[\/\-]\d{4}\s*R\.?G\.?/gi, 'R.G. [OMISSIS]');

    // 3h. Indirizzi isolati
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\/\w]*/gi, '[INDIRIZZO_OMISSIS]');

    return clean;
}

async function generateVIP(text, meta, retries = 5) {
    const prompt = `Analizza la seguente sentenza:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO:\n${text.substring(0, 30000)}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ role: "user", parts: [{ text: prompt }] }]
                })
            });

            const result = await response.json();
            
            if (!response.ok) {
                const errMsg = result.error?.message || `HTTP ${response.status}`;
                if (response.status === 429 || errMsg.includes('quota') || errMsg.includes('high demand') || response.status === 503) {
                    throw new Error("RETRY_" + errMsg);
                }
                throw new Error(errMsg);
            }
            
            return result.candidates[0].content.parts[0].text;
            
        } catch (e) {
            if (e.message.startsWith("RETRY_") || e.message.includes('fetch failed')) {
                if (attempt === retries) throw new Error("Massimo tentativi superati: " + e.message);
                
                const waitTime = attempt * 10000;
                console.log(`     ⏳ API satura o rete ko. Attendo ${waitTime/1000}s (Tentativo ${attempt}/${retries})...`);
                await new Promise(r => setTimeout(r, waitTime));
            } else {
                throw e;
            }
        }
    }
}

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            results.push(...getFilesRecursive(full));
        } else if (entry.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

async function main() {
    console.log(`💎 Generazione VIP Cassazione Sezioni Semplici 2025-2026 (Modello: ${MODEL_NAME})`);
    console.log(`${'='.repeat(70)}\n`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log("📡 Costruzione indice dei file già processati...");
    const existingFilenames = new Set();
    
    const loadLocalSchede = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                loadLocalSchede(path.join(dir, entry.name));
            } else if (entry.name.endsWith('.md')) {
                existingFilenames.add(entry.name);
            }
        }
    };
    loadLocalSchede(OUTPUT_DIR);
    console.log(`✅ localmente noti: ${existingFilenames.size} file.`);

    // Recupero ID dal DB Supabase per evitare duplicazioni
    let offset = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'sentenza_sez_semplici_vip')
            .range(offset, offset + limit - 1);
        if (error) { console.error("❌ Errore fetch DB:", error); break; }
        if (!data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += limit;
        if (data.length < limit) break;
    }
    console.log(`✅ Indice finale file già inseriti/processati: ${existingFilenames.size} totali.\n`);

    // Parse --limit flag
    const limitArg = process.argv.find(a => a.startsWith('--limit'));
    const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;

    // --- INIZIO FILTRO RIVISTE ---
    const indexData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'riviste_sentenze_index.json'), 'utf8'));
    const targetSentenze = indexData.sentenze.filter(s => s.corte === 'Cassazione' && s.sezione !== 'ssuu');
    const targetSet = new Set(targetSentenze.map(s => s.anno + '_' + s.numero));
    console.log(`🎯 Trovate ${targetSentenze.length} sentenze semplici citate nelle riviste.`);

    const rawFiles = getFilesRecursive(INPUT_DIR);
    let allFiles = [];
    for (const f of rawFiles) {
        const base = path.basename(f, '.md');
        const m = base.match(/^sn(?:civ|pen)(\d{4})[A-Z0-9]?0*(\d+)[SO]$/i);
        if (m) {
            const key = m[1] + '_' + m[2];
            if (targetSet.has(key)) {
                allFiles.push(f);
            }
        }
    }
    console.log(`📁 Delle ${targetSentenze.length} cercate, ${allFiles.length} sono presenti in archivio raw (sulle ${rawFiles.length} scaricate).`);
    // --- FINE FILTRO RIVISTE ---
    
    const filesToProcess = LIMIT < Infinity 
        ? allFiles.slice(0, LIMIT)
        : allFiles;
    console.log(`Processerò ${filesToProcess.length} file (limit: ${LIMIT < Infinity ? LIMIT : 'nessuno'}).\n`);

    let processed = 0, skipped = 0, discarded = 0, errors = 0;

    for (const file of filesToProcess) {
        const fileName = path.basename(file);
        const relPath = path.relative(INPUT_DIR, file);
        const outputFilePath = path.join(OUTPUT_DIR, relPath);

        if (existingFilenames.has(fileName) || fs.existsSync(outputFilePath)) {
            skipped++;
            continue;
        }

        console.log(`\n📄 [${processed + discarded + skipped + errors + 1}/${allFiles.length}] Elaborazione: ${fileName}`);
        
        try {
            const rawText = fs.readFileSync(file, 'utf8');

            // ═══ SAFETY GATE: Oscuramento ═══
            if (/in fase di oscuramento|sentenza richiesta.*oscuramento|provvedimento.*non.*disponibile|testo.*non.*disponibile/i.test(rawText)) {
                console.log(`   🚫 SKIP (sentenza oscurata)`);
                discarded++;
                continue;
            }
            // ═══ FINE SAFETY GATE ═══

            // --- 1. LOCAL PRE-FILTERS ---
            if (rawText.replace(/\s+/g, ' ').trim().length < 1000) {
                console.log(`   ⏭️  SCARTO AUTOMATICO: Testo troppo corto (<1000 caratteri effettivi).`);
                fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
                fs.writeFileSync(outputFilePath, "[SCARTO_ASSOLUTO] (Pre-filtro locale: Testo troppo breve)", 'utf8');
                discarded++;
                continue;
            }

            // --- 2. LOCAL ANONYMIZATION ---
            const anonymizedText = anonymizeText(rawText);

            // Estrazione metadati da filename / intestazione
            const match = fileName.match(/^sn(civ|pen)(\d{4})\d(\d+)[SO]$/);
            const meta = {
                id: fileName.replace('.md', ''),
                tipo: match ? (match[1] === 'civ' ? 'Civile' : 'Penale') : 'Cassazione',
                anno: match ? match[2] : '2025/2026',
                numero: match ? parseInt(match[3], 10).toString() : 'N/A'
            };

            // --- 3. GENERATION VIA LLM ---
            const vipMarkdown = await generateVIP(anonymizedText, meta);

            if (vipMarkdown.includes('[SCARTO_ASSOLUTO]')) {
                console.log(`   ⏭️  SCARTO ASSOLUTO (Triage LLM): Il provvedimento non contiene profili nomofilattici.`);
                fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
                fs.writeFileSync(outputFilePath, "[SCARTO_ASSOLUTO] (Rilevato da triage AI)", 'utf8');
                discarded++;
            } else {
                fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
                fs.writeFileSync(outputFilePath, vipMarkdown, 'utf8');
                console.log(`   ✅ OK! VIP Scheda salvata in ${outputFilePath}`);
                processed++;
            }

            // Rate-limiting preventivo gentile
            await new Promise(r => setTimeout(r, 800));

        } catch (e) {
            console.error(`   ❌ Errore: ${e.message}`);
            errors++;
        }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✨ COMPLETATO!`);
    console.log(`   ✅ Nuove schede VIP generate: ${processed}`);
    console.log(`   ⏭️  Skippate (già esistenti): ${skipped}`);
    console.log(`   🗑️  Scartate (triage/corte): ${discarded}`);
    console.log(`   ❌ Errori riscontrati:       ${errors}`);
}

main().catch(console.error);
