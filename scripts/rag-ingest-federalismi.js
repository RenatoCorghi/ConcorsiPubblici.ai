import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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
const INPUT_DIR = path.resolve('./riviste_vip_schede/federalismi');

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
                    console.log(`  ⏳ Rate limit! Attesa ${wait / 1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${response.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === retries) return null;
            await new Promise(r => setTimeout(r, 10000 * attempt));
        }
    }
    return null;
}

function parseFederalismiMeta(dirName) {
    // es. federalismi_fascicolo_10_2024
    const match = dirName.match(/fascicolo_(\d+)_(\d{4})/);
    return {
        editore: 'Federalismi.it',
        anno: match ? parseInt(match[2]) : null,
        fascicolo: match ? match[1] : dirName
    };
}

async function main() {
    console.log(`\n🚀 Avvio Vettorializzazione BATCH Federalismi.it\n`);
    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella ${INPUT_DIR} non trovata.`);
        return;
    }

    // STEP 1: Indice esistenti
    const existingFilenames = new Set();
    let offset = 0;
    while (true) {
        const { data } = await supabase.from('rag_documents').select('filename').eq('editore', 'Federalismi.it').range(offset, offset + 999);
        if (!data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += 1000;
        if (data.length < 1000) break;
    }

    // STEP 2: Scansione
    const allFiles = [];
    const dirs = fs.readdirSync(INPUT_DIR).filter(d => fs.statSync(path.join(INPUT_DIR, d)).isDirectory());

    for (const dir of dirs) {
        const fascicoloDir = path.join(INPUT_DIR, dir);
        const files = fs.readdirSync(fascicoloDir).filter(f => f.endsWith('.md'));
        files.forEach(f => allFiles.push({ dir, fullPath: path.join(fascicoloDir, f), fileName: f }));
    }

    const toProcess = allFiles.filter(f => !existingFilenames.has(f.fileName));
    console.log(`🆕 Da caricare: ${toProcess.length} su ${allFiles.length} totali.`);

    if (toProcess.length === 0) return;

    // STEP 3: Batch Ingest
    const BATCH_SIZE = 10;
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batchFiles = toProcess.slice(i, i + BATCH_SIZE);
        console.log(`🔄 Batch ${Math.floor(i/BATCH_SIZE)+1}...`);

        const batchData = batchFiles.map(({ dir, fullPath, fileName }) => {
            const textContent = fs.readFileSync(fullPath, 'utf8');
            const cleanContent = textContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
            const { editore, anno, fascicolo } = parseFederalismiMeta(dir);
            return { fileName, dir, textContent: cleanContent, titolo: `[Federalismi - Fasc. ${fascicolo}/${anno}] ${fileName}`, editore, anno };
        });

        const vectors = await getBatchEmbeddings(batchData.map(d => d.textContent));
        if (!vectors) continue;

        for (let j = 0; j < batchData.length; j++) {
            const { fileName, textContent, titolo, editore, anno } = batchData[j];
            const vector = vectors[j];

            const { data: docData, error: docError } = await supabase
                .from('rag_documents')
                .insert([{
                    titolo,
                    tipo: 'rivista_vip',
                    materia: 'Diritto Costituzionale',
                    editore,
                    anno,
                    filename: fileName,
                    status: 'completed'
                }])
                .select().single();

            if (docError) continue;

            await supabase.from('rag_chunks').insert([{
                document_id: docData.id,
                chunk_index: 1,
                content: textContent,
                materia: 'Diritto Costituzionale',
                tipo: 'rivista_vip',
                embedding: vector
            }]);
        }
    }
}

main().catch(console.error);
