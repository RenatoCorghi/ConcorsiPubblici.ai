import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { validateSheet } from './lint_vip_sheets.mjs';

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
            console.log("⏳ Quota embedding, attesa 15s...");
            await new Promise(r => setTimeout(r, 15000));
        }
        return null;
    }
}

// ==========================================
// MAIN
// ==========================================
const INPUT_DIR = path.resolve('./massimario_vip');
const CATEGORIES = ["Diritto Civile", "Diritto Penale"];

// Mapper per le cartelle fisiche se diverse dai nomi nel DB
const FOLDER_MAP = {
    "Diritto Civile": "civile",
    "Diritto Penale": "penale"
};

async function main() {
    console.log(`\n🚀 Avvio Vettorializzazione Dossier Massimario...\n`);

    for (const category of CATEGORIES) {
        const dirPath = path.join(INPUT_DIR, FOLDER_MAP[category] || category);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        if (files.length === 0) continue;

        console.log(`📂 Trovati ${files.length} Dossier nella categoria: ${category.toUpperCase()}`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fullPath = path.join(dirPath, file);
            
            // Verifica se è già a database
            const { data: existing } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('filename', file)
                .single();

            if (existing) {
                console.log(`[${i+1}/${files.length}] ⏭️ Già vettorializzato: ${file}`);
                continue;
            }

            console.log(`[${i+1}/${files.length}] 🧠 Elaborazione: ${file}`);
            const textContent = fs.readFileSync(fullPath, 'utf8');

            try {
                // Valida tramite il linter prima dell'ingestione
                validateSheet(fullPath, textContent);
            } catch (err) {
                console.error(`  ⚠️  [LINTER BLOCKED] Scheda non valida: ${file}`);
                console.error(`      Motivo: ${err.message}`);
                continue;
            }

            // Generiamo l'embedding
            const vector = await getEmbedding(textContent);
            if (!vector) {
                console.log("    ⚠️ Riproviamo il file...");
                i--; // Retry
                continue;
            }

            // Inseriamo in RAG Documents
            const { data: docData, error: docError } = await supabase
                .from('rag_documents')
                .insert([{
                    titolo: file.replace('.md', ''),
                    tipo: 'dottrina_massimario',
                    materia: category,
                    filename: file,
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
                    embedding: vector
                }]);

            if (chunkError) {
                console.error("    ❌ Errore salvataggio chunk:", chunkError.message);
            } else {
                console.log(`    ✅ Salvato in Supabase!`);
            }

            // Rate limit di cortesia
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    console.log(`\n✨ VETTORIALIZZAZIONE MASSIMARIO COMPLETATA! ✨`);
}

main().catch(console.error);
