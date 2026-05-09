import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function check() {
    console.log("🔬 VERIFICA SS.UU. — Titoli e Contenuti\n");

    // 1. Campione di titoli SSUU
    const { data: docs } = await supabase
        .from('rag_documents')
        .select('id, titolo, filename, materia')
        .eq('tipo', 'sentenza_ssuu')
        .limit(10);

    console.log("=== TITOLI DOCUMENTI SS.UU. (sample) ===\n");
    for (const d of (docs || [])) {
        console.log(`  Titolo: "${d.titolo}"`);
        console.log(`  File:   ${d.filename}`);
        console.log(`  Materia: ${d.materia}`);
        
        // Verifica: il titolo contiene un numero di sentenza reale?
        const hasRealNumber = /n\.\s*\d+/i.test(d.titolo);
        const hasDate = /\d{1,2}\s+\w+\s+\d{4}|\d{2}\/\d{2}\/\d{4}/.test(d.titolo);
        console.log(`  Numero sentenza nel titolo: ${hasRealNumber ? '✅' : '❌'}`);
        console.log(`  Data nel titolo: ${hasDate ? '✅' : '❌'}`);

        // Primo chunk
        const { data: chunks } = await supabase
            .from('rag_chunks')
            .select('content')
            .eq('document_id', d.id)
            .limit(1);
        
        if (chunks?.[0]) {
            const first200 = chunks[0].content.substring(0, 200);
            console.log(`  Content (inizio): ${first200}...`);
        }
        console.log('');
    }

    // 2. Conteggio totale
    const { count } = await supabase.from('rag_documents')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'sentenza_ssuu');
    console.log(`\nTotale documenti SS.UU.: ${count}`);
    
    // 3. Verifica i filename per capire se possono confondere
    const { data: filenames } = await supabase
        .from('rag_documents')
        .select('filename')
        .eq('tipo', 'sentenza_ssuu')
        .limit(15);
    
    console.log("\n=== NOMI FILE SS.UU. ===");
    (filenames || []).forEach(d => console.log(`  ${d.filename}`));
}

check().catch(e => console.error(e));
