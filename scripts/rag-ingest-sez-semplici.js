/**
 * INGESTIONE SENTENZE SEZIONI SEMPLICI (TIER 2)
 * 
 * Pipeline di ingestione massiva per ~100K sentenze di Cassazione
 * a sezione semplice (2021-2026) nel sistema RAG come tier 2 (Silver).
 * 
 * Filtri pre-ingestione:
 *   1. Solo Sentenze (file *S.md, escluse Ordinanze *O.md)
 *   2. Solo file sostanziali (>500 bytes, esclusi stub oscurati)
 *   3. Scarto inammissibilità/incompetenza via Gemini Flash
 * 
 * Uso:
 *   node scripts/rag-ingest-sez-semplici.js                        # Tutti gli anni 2021-2026
 *   node scripts/rag-ingest-sez-semplici.js --anno=2025             # Solo un anno
 *   node scripts/rag-ingest-sez-semplici.js --limit=100             # Limite per test
 *   node scripts/rag-ingest-sez-semplici.js --skip-classification   # Salta filtro Gemini (più veloce)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Caricamento .env ──
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

// ── CLI Arguments ──
const args = process.argv.slice(2);
const getArg = (name) => {
    const found = args.find(a => a.startsWith(`--${name}`));
    return found ? found.split('=')[1] : null;
};
const LIMIT = getArg('limit') ? parseInt(getArg('limit')) : Infinity;
const ANNO_FILTER = getArg('anno') ? parseInt(getArg('anno')) : null;
const SKIP_CLASSIFICATION = args.includes('--skip-classification');

// ── Costanti ──
const INPUT_DIR = 'sentenze_sez_semplici';
const ANNI = ANNO_FILTER ? [ANNO_FILTER] : [2021, 2022, 2023, 2024, 2025, 2026];
const BATCH_SIZE = 20;        // File per batch di embedding
const CHUNK_MAX_CHARS = 6000; // ~1500 token per chunk
const CHUNK_OVERLAP = 300;    // Overlap tra chunks
const MIN_FILE_SIZE = 500;    // Minimo bytes per non essere stub
const TIPO_DB = 'sentenza_sez_semplici';

// ── Utility ──
function generateUUID(name) {
    return crypto.createHash('sha256')
        .update(name)
        .digest('hex')
        .substring(0, 32)
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

/**
 * Estrae metadati dal nome del file.
 * Formato: snciv{ANNO}{SEZ}{NUM}{TIPO}.md
 * Es: snciv2025101327S.md → anno=2025, sezione=1, sentenza
 */
function parseFilename(filename) {
    const match = filename.match(/snciv(\d{4})(\d)(\d+)([SO])\.md/i);
    if (!match) return null;
    return {
        anno: parseInt(match[1]),
        sezione: parseInt(match[2]),
        numero: match[3],
        isSentenza: match[4].toUpperCase() === 'S'
    };
}

/**
 * Estrae il titolo dall'header markdown del file.
 * Es: "# [Cass. Civ., Sez. Semplice, , n. 1327]" → "Cass. Civ., Sez. 1, n. 1327/2025"
 */
function extractTitle(content, meta) {
    const headerMatch = content.match(/^#\s*\[(.+?)\]/m);
    if (headerMatch) {
        let title = headerMatch[1].trim();
        // Aggiungi anno se non presente
        if (!title.includes(String(meta.anno))) {
            title += ` (${meta.anno})`;
        }
        return title;
    }
    return `Cass. Civ., Sez. ${meta.sezione}, n. ${meta.numero}/${meta.anno}`;
}

/**
 * Chunking intelligente: divide la sentenza per sezioni logiche.
 * Se il testo è sotto CHUNK_MAX_CHARS, lo restituisce intero.
 */
function chunkContent(content) {
    if (content.length <= CHUNK_MAX_CHARS) {
        return [content];
    }

    const chunks = [];
    // Prova a splittare per sezioni logiche della sentenza
    const sectionHeaders = [
        /FATTI?\s+DI\s+CAUSA/i,
        /RAGIONI?\s+DELLA\s+DECISIONE/i,
        /MOTIVI?\s+DELLA\s+DECISIONE/i,
        /IN\s+DIRITTO/i,
        /P\.Q\.M\./i,
        /CONSIDERATO\s+IN\s+DIRITTO/i,
        /RITENUTO\s+IN\s+FATTO/i
    ];

    // Trova tutte le posizioni delle sezioni
    const splits = [0];
    for (const regex of sectionHeaders) {
        const match = content.match(regex);
        if (match && match.index > 0) {
            splits.push(match.index);
        }
    }
    splits.push(content.length);
    splits.sort((a, b) => a - b);

    // Costruisci chunks dalle sezioni, unendo quelle piccole
    let currentChunk = '';
    for (let i = 0; i < splits.length - 1; i++) {
        const section = content.substring(splits[i], splits[i + 1]);
        
        if (currentChunk.length + section.length <= CHUNK_MAX_CHARS) {
            currentChunk += section;
        } else {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }
            // Se la sezione stessa è troppo grande, split per paragrafi
            if (section.length > CHUNK_MAX_CHARS) {
                let pos = 0;
                while (pos < section.length) {
                    const end = Math.min(pos + CHUNK_MAX_CHARS, section.length);
                    // Cerca un punto fermo vicino alla fine per un taglio pulito
                    let cutPoint = end;
                    if (end < section.length) {
                        const lastPeriod = section.lastIndexOf('. ', end);
                        if (lastPeriod > pos + CHUNK_MAX_CHARS * 0.5) {
                            cutPoint = lastPeriod + 2;
                        }
                    }
                    chunks.push(section.substring(pos, cutPoint));
                    pos = Math.max(cutPoint - CHUNK_OVERLAP, pos + 1);
                }
                currentChunk = '';
            } else {
                currentChunk = section;
            }
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [content.substring(0, CHUNK_MAX_CHARS)];
}

/**
 * Classifica se una sentenza è di merito o inammissibile/incompetente.
 * Usa Gemini Flash con prompt minimale (~50 token output).
 * Restituisce true se la sentenza è di merito, false se va scartata.
 */
async function classifySentenza(content, retries = 3) {
    const dispositivo = content.substring(content.length - 2000); // Ultimi 2000 chars (P.Q.M.)
    
    // Euristica veloce: se contiene keyword di inammissibilità nel dispositivo, scarta subito
    const dispositivoLower = dispositivo.toLowerCase();
    const skipKeywords = [
        'dichiara inammissibile il ricorso',
        'dichiara inammissibili i ricorsi',
        'dichiara la incompetenza',
        'dichiara l\'incompetenza',
        'dichiara la propria incompetenza'
    ];
    
    for (const kw of skipKeywords) {
        if (dispositivoLower.includes(kw)) {
            // Verifica rapida: se c'è SOLO inammissibilità senza ratio di merito
            const hasRatio = dispositivoLower.includes('principio di diritto') ||
                           dispositivoLower.includes('in applicazione del') ||
                           dispositivoLower.includes('deve affermarsi');
            if (!hasRatio) return false;
        }
    }
    
    return true; // Default: mantieni
}

/**
 * Batch Embedding tramite Gemini embedding-2 con retry esponenziale.
 */
async function getBatchEmbeddings(texts, retries = 5) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${GEMINI_API_KEY}`;
    
    const requests = texts.map(text => ({
        model: 'models/gemini-embedding-2',
        content: { parts: [{ text: text.substring(0, 8000) }] },
        outputDimensionality: 768
    }));

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests })
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 429) {
                    const wait = 10000 * attempt + Math.random() * 5000;
                    console.log(`\n⏳ [Gemini 429] Rate limit. Attesa ${(wait / 1000).toFixed(1)}s (tentativo ${attempt}/${retries})...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${response.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === retries) {
                console.error(`\n❌ Batch Embedding fallito dopo ${retries} tentativi:`, e.message);
                return null;
            }
            await new Promise(r => setTimeout(r, 3000 * attempt));
        }
    }
    return null;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('════════════════════════════════════════════════════════');
    console.log('🏛️  INGESTIONE TIER 2 — SENTENZE SEZIONI SEMPLICI');
    console.log('════════════════════════════════════════════════════════\n');
    console.log(`📅 Anni: ${ANNI.join(', ')}`);
    console.log(`🔍 Classificazione: ${SKIP_CLASSIFICATION ? 'DISATTIVATA (--skip-classification)' : 'Euristica veloce'}`);
    if (LIMIT < Infinity) console.log(`⚠️  Limite: ${LIMIT} file`);

    // ── FASE 1: Scansione e filtraggio file ──
    console.log('\n📂 FASE 1: Scansione directory...');
    let allCandidates = [];

    for (const anno of ANNI) {
        const dir = path.join(INPUT_DIR, String(anno));
        if (!fs.existsSync(dir)) {
            console.log(`   ⚠️  Directory ${anno} non trovata, skip.`);
            continue;
        }
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        let sentenze = 0, ordinanze = 0, stub = 0;

        for (const f of files) {
            const meta = parseFilename(f);
            if (!meta) continue;
            
            // Filtro 1: Solo Sentenze (no Ordinanze)
            if (!meta.isSentenza) { ordinanze++; continue; }
            
            // Filtro 2: Solo file sostanziali (no stub oscurati)
            const fullPath = path.join(dir, f);
            const stat = fs.statSync(fullPath);
            if (stat.size < MIN_FILE_SIZE) { stub++; continue; }

            sentenze++;
            allCandidates.push({ path: fullPath, filename: f, meta });
        }
        console.log(`   ${anno}: ${sentenze} sentenze valide, ${ordinanze} ordinanze scartate, ${stub} stub scartati`);
    }

    console.log(`\n📋 Totale candidati dopo filtro file: ${allCandidates.length}`);

    // Applica limite
    if (LIMIT < Infinity) {
        allCandidates = allCandidates.slice(0, LIMIT);
        console.log(`   ⚠️  Limitato a ${allCandidates.length} file per test.`);
    }

    // ── FASE 2: Deduplicazione contro DB ──
    console.log('\n📡 FASE 2: Controllo idempotenza (deduplicazione)...');
    const candidatesWithUuid = allCandidates.map(c => ({
        ...c,
        docUuid: generateUUID(c.filename)
    }));

    const existingUuids = new Set();
    const checkBatchSize = 200;
    const allUuids = candidatesWithUuid.map(c => c.docUuid);

    for (let i = 0; i < allUuids.length; i += checkBatchSize) {
        const batch = allUuids.slice(i, i + checkBatchSize);
        const { data, error } = await supabase
            .from('rag_documents')
            .select('id')
            .in('id', batch);

        if (!error && data) {
            data.forEach(d => existingUuids.add(d.id));
        }
        process.stdout.write(`   Controllati ${Math.min(i + checkBatchSize, allUuids.length)} / ${allUuids.length}\r`);
    }

    const toProcess = candidatesWithUuid.filter(c => !existingUuids.has(c.docUuid));
    console.log(`\n   ✅ Già nel DB: ${existingUuids.size} | 🆕 Da processare: ${toProcess.length}`);

    if (toProcess.length === 0) {
        console.log('\n✨ Tutto allineato! Niente da ingerire.');
        return;
    }

    // ── FASE 3: Classificazione + Chunking + Embedding + Inserimento ──
    console.log(`\n🚀 FASE 3: Ingestione (batch di ${BATCH_SIZE})...`);
    let successCount = 0, skipCount = 0, failCount = 0, totalChunks = 0;
    const startTime = Date.now();

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batchItems = toProcess.slice(i, i + BATCH_SIZE);
        const batchData = [];

        // ── Lettura, classificazione e chunking ──
        for (const item of batchItems) {
            try {
                const content = fs.readFileSync(item.path, 'utf8').trim();
                
                // Filtro 3: Classificazione inammissibilità (euristica veloce)
                if (!SKIP_CLASSIFICATION) {
                    const isMerito = await classifySentenza(content);
                    if (!isMerito) {
                        skipCount++;
                        continue;
                    }
                }

                const titolo = extractTitle(content, item.meta);
                const cleanContent = content
                    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
                    .replace(/CORTE SUPREMA DI CASSAZIONE\s+ITALGIUREWEB/gi, '')
                    .trim();

                const chunks = chunkContent(cleanContent);

                batchData.push({
                    ...item,
                    titolo,
                    chunks,
                    cleanContent: cleanContent.substring(0, 8000) // Per embedding documento
                });
            } catch (err) {
                failCount++;
            }
        }

        if (batchData.length === 0) continue;

        // ── Embedding: tutti i chunks del batch in una sola chiamata ──
        const allChunks = [];
        const chunkMap = []; // Mappa chunk → item index
        for (let j = 0; j < batchData.length; j++) {
            for (let k = 0; k < batchData[j].chunks.length; k++) {
                allChunks.push(batchData[j].chunks[k]);
                chunkMap.push({ itemIdx: j, chunkIdx: k });
            }
        }

        // Embeddings a sotto-batch di 100 (limite Gemini batch)
        const allEmbeddings = [];
        for (let e = 0; e < allChunks.length; e += 100) {
            const subBatch = allChunks.slice(e, e + 100);
            const embeddings = await getBatchEmbeddings(subBatch);
            if (!embeddings) {
                failCount += batchData.length;
                break;
            }
            allEmbeddings.push(...embeddings);
        }

        if (allEmbeddings.length !== allChunks.length) {
            failCount += batchData.length;
            continue;
        }

        // ── Preparazione record DB ──
        const docRows = [];
        const chunkRows = [];

        for (let j = 0; j < batchData.length; j++) {
            const item = batchData[j];
            docRows.push({
                id: item.docUuid,
                titolo: item.titolo,
                materia: null, // Non classificato per materia
                tipo: TIPO_DB,
                autore: 'Corte di Cassazione',
                filename: item.filename,
                status: 'completed'
            });
        }

        for (let c = 0; c < chunkMap.length; c++) {
            const { itemIdx, chunkIdx } = chunkMap[c];
            const item = batchData[itemIdx];
            chunkRows.push({
                document_id: item.docUuid,
                content: allChunks[c],
                chunk_index: chunkIdx,
                materia: null,
                tipo: TIPO_DB,
                tier: 2,
                anno: item.meta.anno,
                embedding: allEmbeddings[c]
            });
        }

        // ── Inserimento Supabase ──
        const { error: docsErr } = await supabase
            .from('rag_documents')
            .insert(docRows);

        if (docsErr && !docsErr.message.includes('duplicate')) {
            console.error(`\n❌ Errore DB documenti:`, docsErr.message);
            failCount += batchData.length;
            continue;
        }

        const { error: chunksErr } = await supabase
            .from('rag_chunks')
            .insert(chunkRows);

        if (chunksErr) {
            console.error(`\n❌ Errore DB chunks:`, chunksErr.message);
            failCount += batchData.length;
            // Rollback documenti orfani
            const idsToDelete = docRows.map(r => r.id);
            await supabase.from('rag_documents').delete().in('id', idsToDelete);
            continue;
        }

        successCount += batchData.length;
        totalChunks += chunkRows.length;

        // Progress bar
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = successCount / elapsed;
        const remaining = toProcess.length - (successCount + skipCount + failCount);
        const eta = remaining > 0 ? remaining / speed : 0;
        const etaMin = Math.floor(eta / 60);
        const etaSec = Math.floor(eta % 60);

        process.stdout.write(`\r🚀 OK: ${successCount} | Skip: ${skipCount} | Fail: ${failCount} | Chunks: ${totalChunks} | ${speed.toFixed(1)} file/s | ETA: ${etaMin}m${etaSec}s`);

        // Anti rate-limit
        await new Promise(r => setTimeout(r, 800));
    }

    const totalElapsed = (Date.now() - startTime) / 1000;
    console.log(`\n\n════════════════════════════════════════════════════════`);
    console.log(`✨ INGESTIONE TIER 2 COMPLETATA!`);
    console.log(`   • Sentenze ingerite: ${successCount}`);
    console.log(`   • Chunks totali:     ${totalChunks}`);
    console.log(`   • Scartate (inamm.): ${skipCount}`);
    console.log(`   • Errori:            ${failCount}`);
    console.log(`   • Tempo:             ${(totalElapsed / 60).toFixed(1)} minuti`);
    console.log(`════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
