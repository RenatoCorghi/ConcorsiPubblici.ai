import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// CONFIGURAZIONE
// ==========================================
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

// ==========================================
// EMBEDDING
// ==========================================
async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text: text.substring(0, 8000) }] }, 
                outputDimensionality: 768
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'API Error');
        return data.embedding.values;
    } catch (e) {
        console.error(`  ❌ Errore embedding:`, e.message);
        if (e.message.includes("429") || e.message.includes("quota")) {
            console.log("⏳ Quota embedding raggiunta, attesa 30s...");
            await new Promise(r => setTimeout(r, 30000));
        }
        return null;
    }
}

// ==========================================
// UTILITY PER RICERCA RICORSIVA
// ==========================================
function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.md') && !file.startsWith('TEST_') && !file.startsWith('ORIGINALE_')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

// ==========================================
// MAIN
// ==========================================
const INPUT_DIR = path.resolve('./sentenze_ssuu_vip');

async function main() {
    console.log(`\n🚀 Avvio Vettorializzazione Schede VIP SS.UU....\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella ${INPUT_DIR} non trovata.`);
        return;
    }

    const allFiles = getAllFiles(INPUT_DIR);
    console.log(`📂 Trovate ${allFiles.length} Schede VIP da processare.`);

    for (let i = 0; i < allFiles.length; i++) {
        const fullPath = allFiles[i];
        const fileName = path.basename(fullPath);
        
        // Determina la materia (civile o penale) dal nome file (snciv... o snpen...)
        const materia = fileName.startsWith('snciv') ? 'Diritto Civile' : (fileName.startsWith('snpen') ? 'Diritto Penale' : 'Generale');
        
        // Verifica se è già a database
        const { data: existing } = await supabase
            .from('rag_documents')
            .select('id')
            .eq('filename', fileName)
            .single();

        if (existing) {
            console.log(`[${i+1}/${allFiles.length}] ⏭️ Già presente: ${fileName}`);
            continue;
        }

        console.log(`[${i+1}/${allFiles.length}] 🧠 Elaborazione: ${fileName} (${materia})`);
        const textContent = fs.readFileSync(fullPath, 'utf8');

        // Estrai titolo dalla prima riga (se presente come # [Cass...])
        const firstLine = textContent.split('\n')[0];
        const titolo = firstLine.startsWith('# ') ? firstLine.replace('# ', '').replace('[', '').replace(']', '').trim() : fileName.replace('.md', '');

        // Generiamo l'embedding
        const vector = await getEmbedding(textContent);
        if (!vector) {
            console.log("    ⚠️ Problema embedding, salto file...");
            continue;
        }

        // Inseriamo in RAG Documents
        const { data: docData, error: docError } = await supabase
            .from('rag_documents')
            .insert([{
                titolo: titolo,
                tipo: 'sentenza_ssuu',
                materia: materia,
                filename: fileName,
                chunks_count: 1,
                status: 'completed'
            }])
            .select()
            .single();

        if (docError) {
            console.error("    ❌ Errore salvataggio doc:", docError.message);
            continue;
        }

        // Inseriamo in RAG Chunks
        const { error: chunkError } = await supabase
            .from('rag_chunks')
            .insert([{
                document_id: docData.id,
                chunk_index: 1,
                content: textContent,
                materia: materia,
                tipo: 'sentenza_ssuu',
                embedding: vector
            }]);

        if (chunkError) {
            console.error("    ❌ Errore salvataggio chunk:", chunkError.message);
        } else {
            console.log(`    ✅ Salvato in Supabase!`);
        }

        // Rate limit di cortesia (Gemini 1.5 embedding ha limiti generosi ma meglio essere cauti)
        await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\n✨ VETTORIALIZZAZIONE SS.UU. COMPLETATA! ✨`);
}

main().catch(console.error);
