import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ==========================================
// CONFIGURAZIONE
// ==========================================
const env = {};
try {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
} catch (e) {
    console.warn("⚠️ Nessun file .env trovato:", e.message);
}

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !GEMINI_API_KEY) {
    console.error("❌ Chiavi mancanti nel .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const INPUT_DIR = path.join(process.cwd(), 'data', 'commerciale_oa');
if (!fs.existsSync(INPUT_DIR)) {
    console.error(`❌ Directory non trovata: ${INPUT_DIR}`);
    process.exit(1);
}

// Mappa titoli e editori in base al file
const FILE_META = {
    'Cass_Rel_87_2022_Crisi.pdf': { titolo: "Relazione 87/2022 Cassazione (Crisi d'impresa)", editore: 'Corte Suprema di Cassazione' },
    'Cass_Rassegna_2020_Vol2.pdf': { titolo: "Rassegna Civile Cassazione 2020 Vol II", editore: 'Corte Suprema di Cassazione' },
    'Cass_Rassegna_2021_Vol2.pdf': { titolo: "Rassegna Civile Cassazione 2021 Vol II", editore: 'Corte Suprema di Cassazione' },
    'CaFoscari_Crisi_Bancarie.pdf': { titolo: "La disciplina italiana in tema di gestione delle crisi bancarie ed i modelli europei", editore: 'Edizioni Ca Foscari (CC BY 4.0)' },
    'BancaDItalia_QRG_99.pdf': { titolo: "Quaderni di Ricerca Giuridica N. 99 - A 30 anni dal TUB", editore: 'Banca d Italia' },
    'BancaDItalia_QRG_101.pdf': { titolo: "Quaderni di Ricerca Giuridica N. 101 - SSM Regulation", editore: 'Banca d Italia' },
    'Luiss_Regolazione_Fintech.pdf': { titolo: "Regolazione Fintech e Testo Unico Bancario", editore: 'IRIS Luiss (Open Access)' }
};

// ==========================================
// FUNZIONI UTILI
// ==========================================

function chunkText(text, maxLen = 1500, overlap = 200) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        let end = i + maxLen;
        if (end < text.length) {
            // Cerca uno spazio o punto per non tagliare a metà parola
            const lastSpace = text.lastIndexOf(' ', end);
            if (lastSpace > i + (maxLen / 2)) end = lastSpace;
        }
        chunks.push(text.slice(i, end).trim());
        i = end - overlap;
    }
    return chunks;
}

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
        return null;
    }
}

// ==========================================
// MAIN
// ==========================================
async function main() {
    console.log(`\n📚 Ingestione Fonti Diritto Commerciale (OA/Pubblico Dominio)`);
    
    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.pdf'));
    
    for (const file of files) {
        console.log(`\n📂 Elaborazione: ${file}`);
        
        const meta = FILE_META[file] || { titolo: file, editore: 'Sconosciuto' };
        
        // Verifica se già presente
        const { count } = await supabase.from('rag_documents')
            .select('id', { count: 'exact', head: true })
            .eq('filename', file);
            
        if (count > 0) {
            console.log(`⏭️  File già presente nel DB, skip.`);
            continue;
        }

        // Estrazione testo PDF
        const dataBuffer = fs.readFileSync(path.join(INPUT_DIR, file));
        let text = '';
        try {
            const parser = new pdfParse.PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            text = result.text;
            await parser.destroy();
        } catch(e) {
            console.error(`❌ Errore parsing PDF ${file}: ${e.message}`);
            continue;
        }
        
        text = text.replace(/\n{2,}/g, '\n').replace(/\s{2,}/g, ' ');
        if (!text || text.length < 500) {
            console.log(`⚠️ Testo troppo breve estratto, skip.`);
            continue;
        }
        
        const chunks = chunkText(text, 1500, 200);
        console.log(`✂️  Suddiviso in ${chunks.length} chunks`);
        
        // Registrazione documento
        const { data: docData, error: docError } = await supabase
            .from('rag_documents')
            .insert([{
                titolo: meta.titolo,
                tipo: 'dottrina_massimario',
                materia: 'Diritto Commerciale',
                editore: meta.editore,
                filename: file,
                chunks_count: chunks.length,
                status: 'completed'
            }])
            .select()
            .single();

        if (docError) {
            console.error(`❌ Errore DB Documento:`, docError.message);
            continue;
        }
        const docId = docData.id;
        
        // Vettorializzazione chunks
        let ok = 0, fail = 0;
        const BATCH_SIZE = 10;
        
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const inserts = [];
            
            for (let j = 0; j < batch.length; j++) {
                const chunkIndex = i + j + 1;
                const chunkText = `[${meta.titolo} | ${meta.editore}]\n\n${batch[j]}`;
                const vector = await getEmbedding(chunkText);
                
                if (vector) {
                    inserts.push({
                        document_id: docId,
                        content: chunkText,
                        chunk_index: chunkIndex,
                        materia: 'Diritto Commerciale',
                        tipo: 'dottrina_massimario',
                        embedding: vector
                    });
                } else {
                    fail++;
                }
            }
            
            if (inserts.length > 0) {
                const { error } = await supabase.from('rag_chunks').insert(inserts);
                if (error) {
                    console.error(`❌ Errore DB inserimento chunks: ${error.message}`);
                    fail += inserts.length;
                } else {
                    ok += inserts.length;
                    process.stdout.write('.');
                }
            }
            // Rate limit prevention
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log(`\n✅ ${file} completato: ${ok} chunks salvati, ${fail} falliti.`);
    }
    
    console.log(`\n🎉 Ingestione globale completata!`);
}

main().catch(console.error);
