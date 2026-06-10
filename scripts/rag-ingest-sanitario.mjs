import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Caricamento variabili d'ambiente
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

const BASE_DIR = path.join(process.cwd(), 'data', 'diritto_sanitario');
const MANIFEST_PATH = path.join(BASE_DIR, 'compliance_manifest.json');

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

// ----------------------------------------------------
// GEMINI FLASH SEMANTIC CHUNKING
// ----------------------------------------------------
async function generateSemanticChunksWithGemini(textWindow) {
    const prompt = `Sei un esperto di Diritto Sanitario e Responsabilità Medica.
Il seguente testo è un estratto di un documento istituzionale molto lungo.
Il tuo compito è:
1. Comprendere il contesto legale di questo estratto.
2. Suddividere il testo in chunk semantici indipendenti (massimo 1500 caratteri per chunk), preservando fedelmente le nozioni giuridiche, le norme e i riferimenti giurisprudenziali.
3. Se necessario, aggiungi all'inizio di ogni chunk una brevissima intestazione per dare contesto (es. "[Responsabilità contrattuale - Linee Guida]").

Devi restituire ESCLUSIVAMENTE un array JSON valido di stringhe. Nessun altro testo, nessuna formattazione markdown fuori dal JSON.
Esempio di output desiderato:
[
  "chunk 1 text...",
  "chunk 2 text..."
]

TESTO DA ANALIZZARE:
${textWindow}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
    
    let retries = 3;
    while (retries > 0) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        responseMimeType: "application/json"
                    }
                })
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error?.message || "Errore API Gemini Flash");
            
            const rawJson = result.candidates[0].content.parts[0].text;
            const chunks = JSON.parse(rawJson);
            
            if (Array.isArray(chunks)) {
                return chunks;
            } else {
                throw new Error("L'output JSON non è un array.");
            }
        } catch (e) {
            console.error(`      ⚠️ Errore Gemini (tentativi rimasti: ${retries - 1}):`, e.message);
            retries--;
            if (retries === 0) return [];
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return [];
}

async function extractPdfText(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    if (pdfParse.PDFParse) {
        const parser = new pdfParse.PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        const text = result.text || '';
        await parser.destroy();
        return text;
    } else {
        const data = await pdfParse(dataBuffer);
        return data.text || '';
    }
}

async function ingestSanitario() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test-chunking');

    console.log(`\n🩺 AVVIO INGESTIONE DIRITTO SANITARIO (GEMINI FLASH CHUNKING) ${testMode ? '[TEST MODE - NO DB WRITE]' : ''}`);

    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error("❌ Manifest non trovato in", MANIFEST_PATH);
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    
    for (const [url, info] of Object.entries(manifest)) {
        if (info.status !== 'COMPLIANT') continue;
        if (info.target !== 'ssm' && info.target !== 'cassazione') continue;

        const filePath = path.join(BASE_DIR, info.target, info.fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File mancante: ${filePath}`);
            continue;
        }

        console.log(`\n📄 Processando: ${info.fileName} [${info.target}]`);

        try {
            const rawText = await extractPdfText(filePath);
            console.log(`   Estratti ${rawText.length} caratteri.`);
            
            // Pulisce formattazioni di impaginazione
            const cleanText = rawText.replace(/-- \d+ of \d+ --/g, '');
            
            const docUuid = generateUUID(info.fileName);
            const titolo = info.fileName.replace('.pdf', '').replace(/_/g, ' ');
            const materia = "Diritto Sanitario"; // NUOVA SEZIONE COME DA RICHIESTA
            const autore = info.target === 'cassazione' ? 'Corte Suprema di Cassazione' : 'Scuola Superiore della Magistratura';

            if (!testMode) {
                // Upsert documento
                const { error: docError } = await supabase.from('rag_documents').upsert({
                    id: docUuid,
                    titolo: titolo,
                    materia: materia,
                    tipo: 'sanitario_istituzionale',
                    autore: autore,
                    filename: info.fileName,
                    status: 'completed'
                });

                if (docError) {
                    console.error(`   ❌ Errore DB Documento: ${docError.message}`);
                    continue;
                }
            }

            // Windowing per prevenire OOM ed error token limits
            const WINDOW_SIZE = 40000;
            const OVERLAP = 1000;
            let successCount = 0;
            let globalChunkIndex = 0;

            for (let start = 0; start < cleanText.length; start += (WINDOW_SIZE - OVERLAP)) {
                let end = start + WINDOW_SIZE;
                if (end > cleanText.length) end = cleanText.length;
                
                const textWindow = cleanText.substring(start, end);
                console.log(`   🔄 Inviando window a Gemini Flash: caratteri da ${start} a ${end}...`);
                
                const chunks = await generateSemanticChunksWithGemini(textWindow);
                
                if (chunks.length === 0) {
                    console.warn("      ⚠️ Nessun chunk generato per questa window, skippo.");
                    continue;
                }
                
                console.log(`      ✨ Gemini ha generato ${chunks.length} chunks semantici.`);

                if (testMode) {
                    console.log(`\n--- ESEMPIO CHUNKS DA QUESTA WINDOW ---`);
                    for (let i = 0; i < Math.min(2, chunks.length); i++) {
                        console.log(`[CHUNK ${globalChunkIndex + i}] (${chunks[i].length} chars)\n${chunks[i].substring(0, 300)}...\n------------------`);
                    }
                    globalChunkIndex += chunks.length;
                    
                    // Solo una window in modalità test per velocità
                    console.log("   [TEST MODE] Interrompo la lettura dopo la prima window.");
                    break;
                }

                // Inserimento a DB
                for (let i = 0; i < chunks.length; i++) {
                    const chunkContent = `[DIRITTO SANITARIO - ${autore.toUpperCase()}]\nTitolo: ${titolo}\n---\n${chunks[i]}`;
                    
                    try {
                        const embedding = await getEmbedding(chunkContent);

                        const { error: chunkError } = await supabase.from('rag_chunks').insert({
                            document_id: docUuid,
                            content: chunkContent,
                            chunk_index: globalChunkIndex,
                            materia: materia,
                            tipo: 'sanitario_istituzionale',
                            embedding: embedding
                        });

                        if (chunkError) {
                            if (chunkError.code !== '23505') console.error(`      ❌ Errore DB Chunk ${globalChunkIndex}:`, chunkError.message);
                        } else {
                            successCount++;
                        }
                    } catch (embErr) {
                         console.error(`      ❌ Errore Embedding Chunk ${globalChunkIndex}:`, embErr.message);
                    }
                    globalChunkIndex++;
                    
                    // Rate limit su embeddings
                    await new Promise(r => setTimeout(r, 200));
                }
            }
            
            console.log(`   ✅ Inseriti ${successCount} chunks totali per ${info.fileName}.`);

        } catch (e) {
            console.error(`   💥 Errore fatale su ${info.fileName}:`, e.message);
        }
    }
    
    console.log(`\n🏁 Operazione conclusa.`);
}

ingestSanitario();
