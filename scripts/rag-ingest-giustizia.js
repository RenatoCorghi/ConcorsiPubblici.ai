import fs, { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Mini dotenv loader nativo
try {
    const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
} catch (e) {
    console.warn("⚠️ Nessun file .env trovato o errore di lettura:", e.message);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !GEMINI_API_KEY) {
    console.error("❌ ERRORE: Chiavi mancanti nel file .env (assicurati di avere SUPABASE_URL, SUPABASE_KEY e GEMINI_API_KEY)");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// CONFIGURAZIONE CARTELLE E FILE
// ==========================================
const DATA_DIR = path.resolve('./data/giustizia-amministrativa');
// Quali file processare (Consiglio di Stato sentenze e TAR Lazio Roma sentenze)
const FILES_TO_PROCESS = [
    'cds-sentenze-2026.json',
    'cds-sentenze-2025.json',
    'tar-lazio-roma-sentenze-2026.json',
    'tar-lazio-roma-sentenze-2025.json'
];

// ==========================================
// FUNZIONI EMBEDDING E SUPABASE (STESSA LOGICA)
// ==========================================
async function generateEmbedding(text) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/gemini-embedding-2",
            content: { parts: [{ text }] },
            outputDimensionality: 768
        }),
    });
    const data = await response.json();
    if (!data.embedding || !data.embedding.values) {
        throw new Error("API Gemini ha risposto senza embedding: " + JSON.stringify(data));
    }
    return data.embedding.values;
}

// Funzione di ritardo per non sfondare le quote
const delay = ms => new Promise(res => setTimeout(res, ms));

async function main() {
    console.log("🚀 Avvio Ingestion RAG per Giustizia Amministrativa...\n");

    const materia = "Diritto Amministrativo";

    for (const fileName of FILES_TO_PROCESS) {
        const filePath = path.join(DATA_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ File non trovato, salto: ${fileName}`);
            continue;
        }

        console.log(`\n===========================================`);
        console.log(`📂 Elaborazione file: ${fileName}`);
        console.log(`===========================================`);
        
        let fileContent;
        try {
            fileContent = JSON.parse(readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`❌ Errore parsing JSON per ${fileName}:`, e.message);
            continue;
        }

        // Il JSON è un array di sentenze
        const sentenze = Array.isArray(fileContent) ? fileContent : [];
        console.log(`Trovate ${sentenze.length} sentenze/provvedimenti in ${fileName}.`);

        let count = 0;
        let skipped = 0;

        for (const s of sentenze) {
            // Verifica se abbiamo materiale su cui lavorare
            if (!s.OGGETTO_RICORSO || s.OGGETTO_RICORSO.trim() === '') {
                skipped++;
                continue;
            }

            // Estrai i metadati utili
            const tipo = s.TIPO_PROVVEDIMENTO || 'Sentenza';
            const sede = s.NOME_SEDE || 'Sede Sconosciuta';
            const numero = s.NUMERO_PROVVEDIMENTO || 'Sconosciuto';
            const dataPubb = s.DATA_PUBBLICAZIONE || 'Sconosciuta';
            
            // Crea il titolo del documento per RAG
            const documentTitle = `${sede} - ${tipo} N. ${numero} del ${dataPubb}`;
            
            // Verifica se esiste già
            const { data: extDocs } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('titolo_atto', documentTitle)
                .single();
            
            if (extDocs) {
                // Già presente, skip per essere idempotente
                console.log(`⏭️  Già presente: ${documentTitle} (SKIP)`);
                skipped++;
                continue;
            }

            // Se arriviamo qui, dobbiamo processarla
            // Costruiamo il testo da salvare (Chunk di contesto utile)
            // NOTA: il NUMERO_PROVVEDIMENTO è un codice di registro interno, NON il numero della sentenza
            const chunkText = `[PROVVEDIMENTO GIUSTIZIA AMMINISTRATIVA]
Tipo: ${tipo}
Organo: ${sede}
Sezione: ${s.NOME_SEZIONE || 'Non specificata'}
Numero registro: ${numero} (ATTENZIONE: questo è un codice interno del registro, NON il numero della sentenza per citazione giurisprudenziale)
Data pubblicazione: ${dataPubb}
Esito: ${s.ESITO_PROVVEDIMENTO || 'Non disponibile'}
Tipo Ricorso: ${s.TIPO_RICORSO || 'N/A'}
---

OGGETTO DEL RICORSO / SINTESI:
${s.OGGETTO_RICORSO.trim()}`;

            console.log(`\n⏳ Genero embedding per: ${documentTitle}`);

            try {
                // Embedding (ritardo anti-rate limit)
                await delay(2500); 
                const embedding = await generateEmbedding(chunkText);

                // 1. Inserisci il documento genitore
                const { data: insertedDoc, error: docError } = await supabase
                    .from('rag_documents')
                    .insert([{
                        materia: materia,
                        tipo: 'sentenza',
                        titolo: documentTitle,
                        autore: sede,
                        filename: fileName,
                        status: 'completed'
                    }])
                    .select('id')
                    .single();

                if (docError) {
                    console.error("❌ Errore insert rag_documents:", docError);
                    continue;
                }

                // 2. Inserisci il chunk con i vettori
                const { error: chunkError } = await supabase
                    .from('rag_chunks')
                    .insert([{
                        document_id: insertedDoc.id,
                        content: chunkText,
                        chunk_index: 1,
                        materia: materia,
                        tipo: 'sentenza',
                        embedding: embedding
                    }]);

                if (chunkError) {
                    console.error("❌ Errore insert rag_chunks:", chunkError);
                } else {
                    console.log(`✅ INSERITO OK: ${documentTitle}`);
                    count++;
                }

            } catch (err) {
                console.error("⚠️ Errore durante l'elaborazione del chunk:", err.message);
                // rate limit? pausa più lunga
                await delay(5000);
            }
        }

        console.log(`\n✅ Fine file ${fileName}. Inserite: ${count}. Skippate: ${skipped}.`);
    }

    console.log("\n🎉 TUTTI I FILE PROCESSATI CON SUCCESSO! Il RAG Amministrativo è vivo.");
}

main().catch(console.error);
