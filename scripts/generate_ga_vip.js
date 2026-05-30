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

const INPUT_DIR = path.resolve('./sentenze_admin_mancanti');
const OUTPUT_DIR = path.resolve('./sentenze_admin_mancanti_vip');

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Magistrato del Consiglio di Stato, un severo Commissario del Concorso in Magistratura Amministrativa e un Senior Data Engineer.

[C - CONTESTO]
Ti verrà fornito in input il testo di una sentenza del Consiglio di Stato o di un Tribunale Amministrativo Regionale (TAR). Il testo è già stato pre-anonimizzato localmente tramite filtri regex, ma devi assicurarti che non ci sia traccia di nomi di persone fisiche o dati sensibili residui.

[F - FINALITÀ]
Il tuo obiettivo è redigere un "Dossier d'Autore" (Scheda VIP) ad altissimo contenuto scientifico, compatto ma estremamente denso di dogmatica giuridica amministrativa, utile ad alimentare un database RAG per candidati avanzati a concorsi pubblici superiori (Magistratura Amministrativa, TAR, Avvocatura dello Stato, Concorso in Magistratura).

[VINCOLI TASSATIVI]
1. Data Honesty e Divieto di Parafrasi: È SEVERAMENTE VIETATO fare copia-incolla pedissequo di interi paragrafi o riprodurre il testo normativo in modo ridondante. Rielabora i concetti con rigore, pulizia concettuale ed eccezionale precisione accademica.
2. Anonimizzazione Privacy: Sostituisci sistematicamente qualsiasi residuo nome di persona fisica o dato personale con qualifiche astratte (es. "il ricorrente", "l'Amministrazione resistente", "la società appellante", "il controinteressato").
3. Filtro Triage (MANDATORIO): Se il provvedimento è un mero rinvio, una correzione di errore materiale, una declaratoria di improcedibilità per vizi procedurali banalissimi priva di qualsiasi interesse dogmatico o nomofilattico, apponi in cima la stringa [SCARTO_ASSOLUTO] e interrompi subito la generazione.

--- STRUTTURA DI OUTPUT RICHIESTA (Markdown) ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno analizza brevemente:
- La materia e l'oggetto del provvedimento impugnato (es. urbanistica, appalti, pubblico impiego, silenzio-inadempimento).
- La questione di diritto fondamentale affrontata.
- Se la sentenza introduce un principio rilevante o applica un orientamento consolidato (Triage).

Terminato il thinking, produci il seguente output:

# [Estremi del Provvedimento]

## 1. Il Fatto Storico e il Contesto Sostanziale
[Sintetizza in massimo 3-4 righe la vicenda materiale. Descrivi il provvedimento impugnato e il nucleo della contestazione.]

## 2. Il Nodo Ermeneutico
[Esponi con chiarezza il contrasto interpretativo o il dubbio normativo esaminato. Chiarisci quali erano le opposte ricostruzioni teoriche sul punto, con riferimento alle posizioni delle parti e della giurisprudenza precedente.]

## 3. Il Principio di Diritto (La Massima)
[Enuncia in modo isolato, solenne e in **grassetto** il principio cardine cristallizzato dalla decisione.]

## 4. Ratio Decidendi e Profili Dogmatici
[Ricostruisci l'iter logico-giuridico seguito dal Collegio. Indica le norme interpretate (Costituzione, Codice del Processo Amministrativo, Codice dei Contratti Pubblici, leggi speciali) e spiega perché la soluzione adottata è coerente con il sistema normativo generale e con i principi del diritto amministrativo (interesse legittimo, discrezionalità amministrativa, proporzionalità, legittimo affidamento ecc.)]

## 5. Spendibilità Concorsuale
[Fornisci 2 consigli pratici a elenco puntato: in quali tracce concorsuali (es. in tema di tutela cautelare, in tema di concessioni amministrative) si usa questa sentenza e quale "trappola dogmatica" evitare nella stesura del tema.]

## 6. Tags
[5 hashtag per l'indicizzazione RAG, es. #DirittoAmministrativo, #SilenzioInadempimento, #AppaltiPubblici]`;

function anonymizeText(text) {
    let clean = text;
    // Rimuovi email
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');
    // Rimuovi CF
    clean = clean.replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g, '[OMISSIS]');
    // Rimuovi Partite IVA
    clean = clean.replace(/\b\d{11}\b/g, '[OMISSIS]');
    // Rimuovi IBAN
    clean = clean.replace(/\bIT\s?\d{2}\s?[A-Z]\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}\b/gi, '[OMISSIS]');
    // Rimuovi indirizzi
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\\/\w]*/gi, '[INDIRIZZO_OMISSIS]');
    return clean;
}

async function generateVIP(text, meta, retries = 5) {
    const prompt = `Analizza la seguente sentenza amministrativa:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO:\n${text.substring(0, 30000)}`;
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
    console.log(`⚖️  Generazione VIP Sentenze Amministrative TAR / Consiglio di Stato (Modello: ${MODEL_NAME})`);
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
    console.log(`✅ Localmente noti: ${existingFilenames.size} file.`);

    // Recupero ID dal DB Supabase per evitare duplicazioni
    let offset = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'sentenza_admin_vip')
            .range(offset, offset + limit - 1);
        if (error) { console.error("❌ Errore fetch DB:", error); break; }
        if (!data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += limit;
        if (data.length < limit) break;
    }
    console.log(`✅ Indice finale: ${existingFilenames.size} file già elaborati.\n`);

    // Parse --limit flag
    const limitArg = process.argv.find(a => a.startsWith('--limit'));
    const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf(limitArg) + 1]) : Infinity;

    // Filtra solo le sentenze citate nelle riviste
    const indexData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'riviste_sentenze_index.json'), 'utf8'));
    const targetSentenze = indexData.sentenze.filter(s => s.corte === 'TAR' || s.corte === 'Consiglio di Stato');
    // Costruiamo un set di (numero, anno) per matching veloce
    const targetSet = new Set(targetSentenze.map(s => `${s.anno}_${s.numero}`));
    console.log(`🎯 Trovate ${targetSentenze.length} sentenze GA citate nelle riviste (${targetSentenze.filter(s=>s.corte==='TAR').length} TAR, ${targetSentenze.filter(s=>s.corte==='Consiglio di Stato').length} CdS).`);

    const rawFiles = getFilesRecursive(INPUT_DIR);
    // Filtra i file che corrispondono a una sentenza citata
    const allFiles = rawFiles.filter(f => {
        const base = path.basename(f, '.md');
        // Pattern: CdS_2024_9308.md or TAR_2023_1234.md
        const m = base.match(/^(?:CdS|TAR)_(\d{4})_(\d+)$/i);
        if (m) return targetSet.has(`${m[1]}_${m[2]}`);
        return true; // Se non matcha il pattern, includi comunque
    });

    console.log(`📁 File disponibili corrispondenti alle riviste: ${allFiles.length} (su ${rawFiles.length} totali in archivio).\n`);

    const filesToProcess = LIMIT < Infinity ? allFiles.slice(0, LIMIT) : allFiles;
    console.log(`Processerò ${filesToProcess.length} file (limit: ${LIMIT < Infinity ? LIMIT : 'nessuno'}).\n`);

    let processed = 0, skipped = 0, discarded = 0, errors = 0;

    for (const file of filesToProcess) {
        const fileName = path.basename(file);
        const outputFilePath = path.join(OUTPUT_DIR, fileName);

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

            if (rawText.replace(/\s+/g, ' ').trim().length < 1000) {
                console.log(`   ⏭️  SCARTO AUTOMATICO: Testo troppo corto (<1000 caratteri effettivi).`);
                fs.writeFileSync(outputFilePath, "[SCARTO_ASSOLUTO] (Pre-filtro locale: Testo troppo breve)", 'utf8');
                discarded++;
                continue;
            }

            const anonymizedText = anonymizeText(rawText);

            // Estrai metadati dal nome file: CdS_2024_9308.md
            const match = fileName.match(/^(CdS|TAR(?:_.+?)?)_(\d{4})_(\d+)\.md$/i);
            const corte = match ? (match[1].startsWith('CdS') ? 'Consiglio di Stato' : 'TAR') : 'Giustizia Amministrativa';
            const meta = {
                id: fileName.replace('.md', ''),
                tipo: corte,
                anno: match ? match[2] : 'N/A',
                numero: match ? match[3] : 'N/A',
            };

            const vipMarkdown = await generateVIP(anonymizedText, meta);

            if (vipMarkdown.includes('[SCARTO_ASSOLUTO]')) {
                console.log(`   ⏭️  SCARTO ASSOLUTO (Triage LLM): Il provvedimento non contiene profili dogmatici rilevanti.`);
                fs.writeFileSync(outputFilePath, "[SCARTO_ASSOLUTO] (Rilevato da triage AI)", 'utf8');
                discarded++;
            } else {
                fs.writeFileSync(outputFilePath, vipMarkdown, 'utf8');
                console.log(`   ✅ OK! VIP Scheda salvata in ${outputFilePath}`);
                processed++;
            }

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
