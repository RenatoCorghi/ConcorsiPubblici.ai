import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { validateSheet } from './lint_vip_sheets.mjs';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !GEMINI_API_KEY) {
    console.error("❌ Chiavi mancanti nel .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const INPUT_DIR = path.resolve('./riviste_vip_schede');

// Skip la cartella duplicata _v2 (è la versione precedente di giurit_2022_1)
const SKIP_DIRS = ['giurit_2022_1_v2'];

// ==========================================
// EMBEDDING BATCH
// ==========================================
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
                    const wait = 60000 * attempt;
                    console.log(`  ⏳ Rate limit! Attesa ${wait / 1000}s (tentativo ${attempt}/${retries})...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${response.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === retries) {
                console.error(`  ❌ Batch Embedding fallito dopo ${retries} tentativi:`, e.message);
                return null;
            }
            await new Promise(r => setTimeout(r, 10000 * attempt));
        }
    }
    return null;
}

// ==========================================
// UTILITY — Ricava anno e fascicolo dal path
// ==========================================
function parseFascicoloMeta(dirName, fileName) {
    // es. giurit_2022_1 → anno=2022, editore=Giurisprudenza Italiana
    // es. dannresp_2026_2 → anno=2026, editore=Danno e Responsabilità
    let editore = 'Giurisprudenza Italiana';
    let anno = null;

    const giuritMatch = dirName.match(/giurit_(\d{4})/);
    const dannrespMatch = dirName.match(/dannresp_(\d{4})/);
    const immoMatch = dirName.match(/immo_(\d{4})/);

    if (giuritMatch) { anno = giuritMatch[1]; editore = 'Giurisprudenza Italiana'; }
    else if (dannrespMatch) { anno = dannrespMatch[1]; editore = 'Danno e Responsabilità'; }
    else if (immoMatch) { anno = immoMatch[1]; editore = 'Immobiliare'; }

    return { editore, anno: anno ? parseInt(anno) : null };
}

// ==========================================
// MAIN
// ==========================================
async function main() {
    console.log(`\n🚀 Avvio Vettorializzazione BATCH Riviste Giuridiche\n`);
    console.log(`📂 Cartella input: ${INPUT_DIR}\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella ${INPUT_DIR} non trovata.`);
        return;
    }

    // STEP 1: Indice file già in DB
    console.log("📡 Caricamento indice DB in corso...");
    const existingFilenames = new Set();
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'rivista_vip')
            .range(offset, offset + 999);
        if (error || !data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += 1000;
        if (data.length < 1000) break;
    }
    console.log(`✅ File già presenti in DB: ${existingFilenames.size}\n`);

    // STEP 2: Scansione cartelle
    const allFiles = [];
    const fascicoli = fs.readdirSync(INPUT_DIR).filter(d => {
        const fullPath = path.join(INPUT_DIR, d);
        return fs.statSync(fullPath).isDirectory() && !SKIP_DIRS.includes(d);
    });

    for (const fascicolo of fascicoli) {
        const fascicoloDir = path.join(INPUT_DIR, fascicolo);
        const files = fs.readdirSync(fascicoloDir).filter(f => f.endsWith('.md'));
        files.forEach(f => allFiles.push({ fascicolo, fullPath: path.join(fascicoloDir, f), fileName: f }));
    }

    const toProcess = allFiles.filter(f => !existingFilenames.has(f.fileName));

    console.log(`📂 File totali su disco:  ${allFiles.length}`);
    console.log(`⏭️  Già in DB (skip):      ${allFiles.length - toProcess.length}`);
    console.log(`🆕 Da caricare:            ${toProcess.length}\n`);

    if (toProcess.length === 0) {
        console.log("✨ Tutto già vettorializzato! Niente da fare.");
        return;
    }

    // STEP 3: Elaborazione Batch
    const BATCH_SIZE = 10; // Conservativo per file lunghi (riviste)
    let success = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batchFiles = toProcess.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);
        console.log(`🔄 Batch ${batchNum}/${totalBatches} [${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length}]...`);

        const batchData = [];
        for (const { fascicolo, fullPath, fileName } of batchFiles) {
            try {
                const textContent = fs.readFileSync(fullPath, 'utf8');
                
                // Valida tramite il linter prima dell'ingestione
                validateSheet(fullPath, textContent);
                
                // Salta i blocchi <thinking> e prendi solo la scheda pulita
                const cleanContent = textContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
                const { editore, anno } = parseFascicoloMeta(fascicolo, fileName);
                const titolo = `[${editore} - ${fascicolo}] ${fileName.replace('.md', '')}`;
                
                batchData.push({ fileName, fascicolo, textContent: cleanContent, titolo, editore, anno, fullPath });
            } catch (err) {
                console.error(`  ⚠️  [LINTER BLOCKED] Scheda non valida: ${fileName}`);
                console.error(`      Motivo: ${err.message}`);
                failed++;
            }
        }

        const textsToEmbed = batchData.map(d => d.textContent);
        const vectors = await getBatchEmbeddings(textsToEmbed);

        if (!vectors || vectors.length !== batchData.length) {
            console.log(`    ⚠️ Embedding fallito per il batch. Salto ${batchFiles.length} file.`);
            failed += batchFiles.length;
            continue;
        }

        for (let j = 0; j < batchData.length; j++) {
            const { fileName, textContent, titolo, editore, anno } = batchData[j];
            const vector = vectors[j];

            const { data: docData, error: docError } = await supabase
                .from('rag_documents')
                .insert([{
                    titolo,
                    tipo: 'rivista_vip',
                    materia: 'Diritto Civile',
                    editore,
                    anno,
                    filename: fileName,
                    chunks_count: 1,
                    status: 'completed'
                }])
                .select()
                .single();

            if (docError) {
                if (docError.code === '23505') {
                    // Già presente, skip silenzioso
                    success++;
                } else {
                    console.error(`    ❌ Errore doc ${fileName}:`, docError.message);
                    failed++;
                }
                continue;
            }

            const { error: chunkError } = await supabase
                .from('rag_chunks')
                .insert([{
                    document_id: docData.id,
                    chunk_index: 1,
                    content: textContent,
                    materia: 'Diritto Civile',
                    tipo: 'rivista_vip',
                    embedding: vector
                }]);

            if (chunkError) {
                console.error(`    ❌ Errore chunk ${fileName}:`, chunkError.message);
                failed++;
            } else {
                success++;
            }
        }

        console.log(`    ✅ Batch completato. Successi cumulativi: ${success}`);
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n✨ COMPLETATO! Caricati: ${success} | Falliti: ${failed}`);
}

main().catch(console.error);
