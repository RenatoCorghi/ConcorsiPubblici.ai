import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Patterns that indicate oscurated/fabricated content
const SUSPECT_PATTERNS = [
    // Content generated from oscurated PDFs typically starts with <thinking>
    // and contains fabricated legal analysis. We detect by checking:
    // 1. The rag_documents table for source info
    // 2. The content for telltale signs of fabrication
];

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('🔬 AUDIT DB: Struttura rag_documents');
    console.log('═══════════════════════════════════════════════\n');

    // 1. Check rag_documents schema
    const { data: docSample, error: docErr } = await supabase
        .from('rag_documents')
        .select('*')
        .limit(3);
    
    if (docErr) {
        console.error('Errore rag_documents:', docErr);
    } else if (docSample && docSample[0]) {
        console.log('Colonne rag_documents:', Object.keys(docSample[0]));
        for (const doc of docSample) {
            const display = {...doc};
            if (display.content) display.content = display.content.substring(0, 100) + '...';
            console.log('\nDoc sample:', JSON.stringify(display, null, 2));
        }
    }

    // 2. Count rag_documents
    const { count: docCount } = await supabase.from('rag_documents').select('*', { count: 'exact', head: true });
    console.log(`\nTotale rag_documents: ${docCount}`);

    // 3. Check how chunks link to documents
    console.log('\n\n🔗 LINK chunk→document:');
    const { data: chunkWithDoc } = await supabase
        .from('rag_chunks')
        .select('id, document_id, tipo, materia, content')
        .eq('tipo', 'nomofilachia_ssuu')
        .limit(2);
    
    if (chunkWithDoc) {
        for (const chunk of chunkWithDoc) {
            console.log(`\nChunk tipo=${chunk.tipo}, document_id=${chunk.document_id}`);
            console.log(`  Content: ${(chunk.content || '').substring(0, 200)}...`);
            
            // Look up the document
            if (chunk.document_id) {
                const { data: doc } = await supabase
                    .from('rag_documents')
                    .select('*')
                    .eq('id', chunk.document_id)
                    .single();
                if (doc) {
                    const display = {...doc};
                    if (display.content) display.content = display.content.substring(0, 100) + '...';
                    console.log(`  Document:`, JSON.stringify(display, null, 2));
                }
            }
        }
    }

    // 4. Find VIP chunks with <thinking> tag (sign of AI generation)
    console.log('\n\n🤖 CHUNK CON <thinking> TAG:');
    const { count: thinkingCount } = await supabase
        .from('rag_chunks')
        .select('*', { count: 'exact', head: true })
        .ilike('content', '%<thinking>%');
    console.log(`  Chunk con <thinking>: ${thinkingCount}`);

    // 5. Check a VIP chunk to see its document source
    console.log('\n\n📖 CAMPIONE CHUNK VIP con thinking:');
    const { data: vipThinking } = await supabase
        .from('rag_chunks')
        .select('id, document_id, tipo, materia, content')
        .ilike('content', '%<thinking>%')
        .limit(2);
    
    if (vipThinking) {
        for (const chunk of vipThinking) {
            console.log(`\n  Tipo: ${chunk.tipo} | Materia: ${chunk.materia}`);
            console.log(`  Doc ID: ${chunk.document_id}`);
            console.log(`  Content (300): ${(chunk.content || '').substring(0, 300)}...`);
            
            if (chunk.document_id) {
                const { data: doc } = await supabase
                    .from('rag_documents')
                    .select('titolo, source_file, materia')
                    .eq('id', chunk.document_id)
                    .single();
                if (doc) console.log(`  Document: titolo="${doc.titolo}" source="${doc.source_file}"`);
            }
        }
    }

    // 6. Search in rag_documents for the suspect sentences
    console.log('\n\n🔍 RICERCA DOCUMENTI SOSPETTI:');
    const suspects = ['34778', '40756', '1414', '35823', '3566', '5089'];
    for (const num of suspects) {
        const { data: docs } = await supabase
            .from('rag_documents')
            .select('id, titolo, source_file, materia')
            .ilike('titolo', `%${num}%`)
            .limit(3);
        console.log(`\n  Documenti con "${num}" nel titolo:`, docs);
    }
}

main();
