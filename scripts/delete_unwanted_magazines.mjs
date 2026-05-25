import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l=>l).map(l=>l.split('=').map(s=>s.trim())));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function deleteUnwanted() {
    let allData = [];
    let offset = 0;
    while(true){
        const {data} = await sb.from('rag_documents').select('id, titolo, filename').range(offset, offset+999);
        if(!data || data.length===0) break;
        allData.push(...data);
        offset += 1000;
    }
    
    const kws = ['immo', 'giurit', 'giurisprudenza italiana', 'federalismi', 'corte dei conti'];
    
    const matches = allData.filter(d => {
        const s = (d.titolo + ' ' + d.filename).toLowerCase();
        return kws.some(k => s.includes(k));
    });
    
    console.log(`Found ${matches.length} documents to delete.`);
    
    const idsToDelete = matches.map(m => m.id);
    
    // Delete chunks first (in batches of 500) just in case there's no ON DELETE CASCADE
    console.log('Deleting chunks...');
    for (let i = 0; i < idsToDelete.length; i += 500) {
        const batch = idsToDelete.slice(i, i + 500);
        const { error } = await sb.from('rag_chunks').delete().in('document_id', batch);
        if (error) console.error('Error deleting chunks:', error);
        else console.log(`Deleted chunks for docs ${i} to ${i + batch.length}`);
    }
    
    // Delete documents (in batches of 500)
    console.log('Deleting documents...');
    for (let i = 0; i < idsToDelete.length; i += 500) {
        const batch = idsToDelete.slice(i, i + 500);
        const { error } = await sb.from('rag_documents').delete().in('id', batch);
        if (error) console.error('Error deleting docs:', error);
        else console.log(`Deleted docs ${i} to ${i + batch.length}`);
    }
    
    console.log('Done.');
}

deleteUnwanted();
