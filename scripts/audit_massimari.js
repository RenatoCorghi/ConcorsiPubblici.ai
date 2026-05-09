import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const INPUT_DIR = path.resolve('./massimario_vip');

async function audit() {
    console.log("🔍 AUDIT MASSIMARI — Incrocio DB vs Disco\n");

    // 1. Recupera TUTTI i filename dal DB (senza limiti)
    let dbFiles = new Set();
    let offset = 0;
    while (true) {
        const { data } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'dottrina_massimario')
            .range(offset, offset + 999);
        if (!data || data.length === 0) break;
        data.forEach(d => dbFiles.add(d.filename));
        offset += 1000;
        if (data.length < 1000) break;
    }
    console.log(`DB: ${dbFiles.size} file registrati (tipo=dottrina_massimario)`);

    // 2. Leggi tutti i file su disco (dalle 2 cartelle)
    let diskFiles = [];
    for (const subdir of ['civile', 'penale']) {
        const dirPath = path.join(INPUT_DIR, subdir);
        if (!fs.existsSync(dirPath)) { console.log(`  ⚠️ Cartella non trovata: ${dirPath}`); continue; }
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        files.forEach(f => diskFiles.push({ file: f, subdir }));
    }
    console.log(`Disco: ${diskFiles.length} file .md totali`);

    // 3. Trova i mancanti
    const missing = diskFiles.filter(({ file }) => !dbFiles.has(file));
    console.log(`\n❌ File su disco NON presenti nel DB: ${missing.length}`);

    // 4. Analisi: per capire il perché, vediamo se lo script di ingestion 
    //    li trova lo stesso (ossia se esiste già un doc con lo STESSO filename ma tipo diverso)
    if (missing.length > 0) {
        console.log("\n📊 Campione dei 10 mancanti:");
        missing.slice(0, 10).forEach(({ file, subdir }) => console.log(`  [${subdir}] ${file}`));

        // Verifica: esistono nel DB con un tipo diverso?
        const sampleMissing = missing.slice(0, 5).map(m => m.file);
        for (const fname of sampleMissing) {
            const { data } = await supabase
                .from('rag_documents')
                .select('tipo, filename')
                .eq('filename', fname)
                .limit(3);
            if (data?.length) {
                console.log(`\n  ⚠️ "${fname}" esiste ma con tipo: ${data.map(d => d.tipo).join(', ')}`);
            }
        }

        // Verifica: lo script di ingest come trova i "già presenti"? 
        // (usa query diversa da filename?)
        console.log("\n🔬 Verifica query dello script rag-ingest-massimario.js:");
        // Lo script cerca per 'titolo', non per 'filename'. Verifichiamo il titolo del primo mancante
        const firstMissing = missing[0];
        const titolo = firstMissing.file.replace('.md', '');
        const { data: byTitolo } = await supabase
            .from('rag_documents')
            .select('id, titolo, tipo, filename')
            .eq('titolo', titolo)
            .limit(3);
        console.log(`  Ricerca per titolo="${titolo.substring(0, 60)}...":`);
        if (byTitolo?.length) {
            console.log(`  ✅ TROVATO per titolo (tipo: ${byTitolo[0].tipo}, filename: ${byTitolo[0].filename})`);
        } else {
            console.log(`  ❌ Non trovato per titolo`);
        }
    }

    // 5. Verifica: lo script usa 'titolo' per il dedup?
    // Leggiamo la logica dallo script
    console.log("\n📋 RIEPILOGO FINALE:");
    console.log(`  Disco:    ${diskFiles.length}`);
    console.log(`  DB:       ${dbFiles.size}`);
    console.log(`  Mancanti: ${missing.length}`);

    if (missing.length > 0) {
        // Salva lista dei mancanti per il prossimo step
        fs.writeFileSync('./scripts/missing_massimari.json', JSON.stringify(missing, null, 2));
        console.log(`\n💾 Lista mancanti salvata in scripts/missing_massimari.json`);
    }
}

audit().catch(e => console.error("Fatal:", e));
