import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

function generateUUID(name) {
    return crypto.createHash('sha256').update(name).digest('hex').substring(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] },
            outputDimensionality: 768
        })
    });
    const data = await response.json();
    if (!data.embedding) throw new Error("Embedding fallito: " + JSON.stringify(data));
    return data.embedding.values;
}

function getFiles(dir, allFiles) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    allFiles = allFiles || [];
    files.forEach(function(file) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            allFiles = getFiles(fullPath, allFiles);
        } else {
            if (file.endsWith('.txt') || file.endsWith('.md')) {
                allFiles.push(fullPath);
            }
        }
    });
    return allFiles;
}

async function ingestMassimari() {
    console.log("📚 AVVIO INGESTIONE SCHEDE SINGOLE (RIVISTE VIP SPLIT)");
    
    const baseDir = 'riviste_priority_split';
    if (!fs.existsSync(baseDir)) {
        console.error(`❌ Cartella ${baseDir} non trovata!`);
        return;
    }
    const filesList = getFiles(baseDir);
    console.log(`Trovati ${filesList.length} file CRITICI SPLITTATI da processare.`);
    
    const filesToProcess = filesList;

    for (const file of filesToProcess) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const fileName = path.basename(file);
            const docUuid = generateUUID(fileName);
            
            // Titolo pulito dal nome file
            const titolo = fileName.replace(/_/g, ' ').replace('.txt', '').replace('.md', '');
            const materia = "Dottrina e Teoria Generale";

            // 1. Assicurati che il documento esista
            const { data: docExists } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('id', docUuid)
                .single();

            if (!docExists) {
                await supabase.from('rag_documents').insert({
                    id: docUuid,
                    titolo: titolo,
                    materia: materia,
                    tipo: 'massimario_teoria',
                    autore: 'Ufficio del Massimario',
                    filename: fileName,
                    status: 'completed'
                });
            }

            // 2. Inserimento Chunk (Massimari possono essere lunghi, ma per ora facciamo chunk unico se sotto i 4k char)
            // Se sono troppo lunghi andrebbero splittati, ma i file VIP sono solitamente brevi.
            const embedding = await getEmbedding(content.substring(0, 8000)); // Limite di sicurezza

            const { error } = await supabase.from('rag_chunks').insert({
                document_id: docUuid,
                content: `[TEORIA DOGMATICA - MASSIMARIO]\nArgomento: ${titolo}\n---\n${content}`,
                chunk_index: 0,
                materia: materia,
                tipo: 'teoria_massimario',
                embedding: embedding
            });

            if (error) {
                if (error.code !== '23505') console.error(`❌ Errore ${fileName}:`, error.message);
            } else {
                console.log(`✅ Ingerito Massimario: ${titolo}`);
            }

            await new Promise(r => setTimeout(r, 600));

        } catch (e) {
            console.error(`💥 Errore su ${file}:`, e.message);
        }
    }
    console.log("🏁 Operazione completata.");
}

ingestMassimari();
