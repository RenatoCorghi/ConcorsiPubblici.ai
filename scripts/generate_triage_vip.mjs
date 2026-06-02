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

const OUTPUT_DIR = path.resolve('./sentenze_admin_vip');

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
    clean = clean.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[OMISSIS]');
    clean = clean.replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g, '[OMISSIS]');
    clean = clean.replace(/\b\d{11}\b/g, '[OMISSIS]');
    clean = clean.replace(/\bIT\s?\d{2}\s?[A-Z]\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{3}\b/gi, '[OMISSIS]');
    clean = clean.replace(/\b(?:via|viale|piazza|p\.zza|corso|largo)\s+[A-ZÀ-Ú][A-Za-zàèéìòùÀ-Ú'\s.]+?n\.\s*\d+[\\/\w]*/gi, '[INDIRIZZO_OMISSIS]');
    return clean;
}

async function generateVIP(text, meta, retries = 5) {
    const prompt = `Analizza la seguente sentenza amministrativa:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO:\n${text.substring(0, 30000)}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s timeout
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ role: "user", parts: [{ text: prompt }] }]
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
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
            clearTimeout(timeoutId);
            const isAbort = e.name === 'AbortError';
            const errMsg = isAbort ? 'Request Timeout (60s)' : e.message;
            
            if (isAbort || errMsg.startsWith("RETRY_") || errMsg.includes('fetch failed')) {
                if (attempt === retries) throw new Error("Massimo tentativi superati: " + errMsg);
                const waitTime = attempt * 10000;
                console.log(`     ⏳ API satura, timeout o rete ko (${errMsg}). Attendo ${waitTime/1000}s (Tentativo ${attempt}/${retries})...`);
                await new Promise(r => setTimeout(r, waitTime));
            } else {
                throw e;
            }
        }
    }
}

async function main() {
    console.log(`⚖️  Generazione VIP Sentenze Triage GA (Modello: ${MODEL_NAME})`);
    console.log(`${'='.repeat(70)}\n`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith('--limit='));
    const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
    const sedeArg = args.find(a => a.startsWith('--sede='));
    const SEDE_FILTER = sedeArg ? sedeArg.split('=')[1] : null;
    const annoArg = args.find(a => a.startsWith('--anno='));
    const ANNO_FILTER = annoArg ? parseInt(annoArg.split('=')[1]) : null;

    console.log("📡 Fetching VIP_CONFERMATA dal DB...");
    let query = supabase
        .from('provvedimenti_ga')
        .select('id, tipo_provvedimento, sede_slug, sede_nome, numero_provvedimento, anno_pubblicazione, testo_completo')
        .eq('importance_tier', 'VIP_CONFERMATA')
        .not('testo_completo', 'is', null);

    if (SEDE_FILTER) query = query.eq('sede_slug', SEDE_FILTER);
    if (ANNO_FILTER) query = query.eq('anno_pubblicazione', ANNO_FILTER);

    const { data: records, error } = await query;

    if (error) {
        console.error("❌ Errore fetch DB:", error);
        return;
    }

    if (!records || records.length === 0) {
        console.log("Nessuna sentenza VIP_CONFERMATA trovata.");
        return;
    }

    console.log(`🎯 Trovate ${records.length} sentenze VIP_CONFERMATA nel database.\n`);

    const filesToProcess = LIMIT < Infinity ? records.slice(0, LIMIT) : records;

    let processed = 0, skipped = 0, discarded = 0, errors = 0;

    for (const record of filesToProcess) {
        // Formato filename: es. TAR_2024_1234.md o CdS_2023_567.md
        // Se è TAR ed è diverso da tar-lazio-roma, aggiungiamo la sede per evitare collisioni
        const prefix = record.sede_slug.startsWith('cds') ? 'CdS' : 'TAR';
        const sedeSuffix = (record.sede_slug === 'tar-lazio-roma' || !record.sede_slug) ? '' : `_${record.sede_slug}`;
        const fileName = `${prefix}${sedeSuffix}_${record.anno_pubblicazione}_${record.numero_provvedimento}.md`;
        const outputFilePath = path.join(OUTPUT_DIR, fileName);

        if (fs.existsSync(outputFilePath)) {
            skipped++;
            continue;
        }

        console.log(`\n📄 [${processed + discarded + skipped + errors + 1}/${filesToProcess.length}] Elaborazione: ${fileName} (ID DB: ${record.id})`);
        
        try {
            const rawText = record.testo_completo;

            // --- SAFETY GATES ---
            const MIN_CONTENT_LENGTH = 1000;
            const cleanedText = rawText.replace(/\s+/g, ' ').trim();
            if (cleanedText.length < MIN_CONTENT_LENGTH) {
                console.log(`   ⏭️  SCARTO AUTOMATICO: Testo troppo corto (${cleanedText.length} caratteri < ${MIN_CONTENT_LENGTH}).`);
                fs.writeFileSync(outputFilePath, `[SCARTO_ASSOLUTO] (Pre-filtro locale: Testo troppo breve, ${cleanedText.length} chars)`, 'utf8');
                discarded++;
                continue;
            }

            const OSCURAMENTO_PATTERNS = [
                /in fase di oscuramento/i,
                /sentenza richiesta.*oscuramento/i,
                /provvedimento.*non.*disponibile/i,
                /testo.*non.*disponibile/i
            ];
            const isOscurato = OSCURAMENTO_PATTERNS.some(p => p.test(rawText));
            if (isOscurato) {
                console.log(`   ⏭️  SCARTO AUTOMATICO: Sentenza oscurata.`);
                fs.writeFileSync(outputFilePath, "[SCARTO_ASSOLUTO] (Pre-filtro locale: Sentenza oscurata)", 'utf8');
                discarded++;
                continue;
            }
            // ---------------------

            const anonymizedText = anonymizeText(rawText);

            const meta = {
                id: record.id,
                tipo: prefix === 'CdS' ? 'Consiglio di Stato' : 'TAR',
                anno: record.anno_pubblicazione,
                numero: record.numero_provvedimento,
                sede: record.sede_nome
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

            // Aumentato a 4000ms per rispettare i limiti di rate limit del modello preview
            await new Promise(r => setTimeout(r, 4000));

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
