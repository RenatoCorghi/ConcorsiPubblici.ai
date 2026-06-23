import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const scratchDir = 'C:\\Users\\Pc\\.gemini\\antigravity\\brain\\87495386-19b0-404d-b302-752267b2a4ae\\scratch';

async function selectiveCleanup() {
    console.log("🔍 Avvio pulizia selettiva (salviamo le schede Deep Research!)...");
    
    // 1. Fetch dei documenti SSM da Supabase usando l'autore "Manuale (User)"
    const { data: docs, error: fetchError } = await supabase
        .from('rag_documents')
        .select('id')
        .eq('autore', 'Manuale (User)');
        
    if (fetchError) {
        console.error("❌ Errore fetch documenti:", fetchError);
        return;
    }
    
    const idsToDelete = docs.map(doc => doc.id);
    console.log(`Trovati ${idsToDelete.length} record 'Manuale (User)' in Supabase da eliminare.`);
    
    // 2. Elimina da Supabase
    if (idsToDelete.length > 0) {
        const { error: chunkError } = await supabase
            .from('rag_chunks')
            .delete()
            .in('document_id', idsToDelete);
            
        if (chunkError) console.error("❌ Errore eliminazione chunks:", chunkError);
        else console.log("✅ Chunks SSM eliminati da Supabase.");
        
        const { error: docError } = await supabase
            .from('rag_documents')
            .delete()
            .in('id', idsToDelete);
            
        if (docError) console.error("❌ Errore eliminazione documenti:", docError);
        else console.log("✅ Documenti SSM eliminati da Supabase.");
    }
    
    // 3. Trova tutti i file markdown da eliminare (quelli che contengono "Quaderno SSM")
    const files = fs.readdirSync(scratchDir).filter(f => f.startsWith('scheda_') && f.endsWith('.md'));
    const filesToDelete = [];
    
    for (const file of files) {
        const fullPath = path.join(scratchDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('Quaderno SSM')) {
            filesToDelete.push(file);
        }
    }
    
    console.log(`Trovate ${filesToDelete.length} schede SSM locali da eliminare.`);
    
    // 4. Elimina i file locali
    for (const file of filesToDelete) {
        fs.unlinkSync(path.join(scratchDir, file));
    }
    console.log("✅ File locali SSM eliminati.");
    
    console.log("🚀 Pulizia selettiva completata! Il database è puro e inattaccabile.");
}

selectiveCleanup();
