import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l=>l).map(l=>l.split('=').map(s=>s.trim())));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const crossrefPath = 'data/riviste_crossref_updated.json';
const data = JSON.parse(fs.readFileSync(crossrefPath, 'utf8'));

async function populate() {
    console.log(`Trovate ${data.foundList.length} sentenze da taggare.`);
    let matchCount = 0;
    
    // Scarichiamo un dizionario veloce dei documenti
    let allDocs = [];
    let offset = 0;
    while(true){
        const {data: docs} = await sb.from('rag_documents').select('id, titolo, filename, anno, tipo').range(offset, offset+999);
        if(!docs || docs.length===0) break;
        allDocs.push(...docs);
        offset += 1000;
    }
    
    console.log(`Scaricati ${allDocs.length} documenti dal DB per il matching locale...`);
    
    // Pre-compute search string for performance
    allDocs.forEach(d => {
        d.searchString = (d.titolo + ' ' + d.filename).toLowerCase();
    });
    
    const idsToUpdate = new Set();
    
    for (const item of data.foundList) {
        // Cerca tra i documenti
        const matches = allDocs.filter(d => {
            const yearStr = item.anno ? item.anno.toString() : '';
            if (d.anno != item.anno && !d.searchString.includes(yearStr)) return false;
            
            
            // Check type based on corte
            if (item.corte === 'Cassazione') {
                if (item.sezione === 'ssuu' && !d.tipo.includes('ssuu')) return false;
                if (item.sezione !== 'ssuu' && !d.tipo.includes('sez_semplici')) return false;
            } else if (item.corte === 'Consiglio di Stato' || item.corte === 'TAR') {
                if (!d.tipo.includes('admin')) return false;
            } else if (item.corte === 'Corte Costituzionale') {
                if (!d.tipo.includes('cc')) return false;
            }
            
            // The number must be in the title or filename
            return d.searchString.includes(item.numero.toString());
        });
        
        if (matches.length > 0) {
            // Prendi il primo match utile
            idsToUpdate.add(matches[0].id);
        }
    }
    
    const idArray = Array.from(idsToUpdate);
    console.log(`Documenti unici da aggiornare: ${idArray.length}`);
    
    // Eseguiamo gli update a blocchi di 500
    for (let i = 0; i < idArray.length; i += 500) {
        const batch = idArray.slice(i, i + 500);
        const { error } = await sb.from('rag_documents')
            .update({ is_caso_sistematico: true })
            .in('id', batch);
            
        if (error) {
            console.error('Errore update:', error);
        } else {
            console.log(`Aggiornati documenti ${i} a ${i + batch.length}`);
        }
    }
    
    console.log('Fatto!');
}

populate().catch(console.error);
