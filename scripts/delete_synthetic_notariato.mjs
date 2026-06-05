import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function purgeSyntheticData() {
    console.log("🗑️ AVVIO RIMOZIONE SCHEDE SINTETICHE NOTARIATO DAL DB...");

    try {
        // 1. Rimuovi i chunk
        const { error: chunkErr, count: chunkCount } = await supabase.from('rag_chunks')
            .delete({ count: 'exact' })
            .eq('tipo', 'vip_notariato');

        if (chunkErr) throw new Error("Errore eliminazione chunk: " + chunkErr.message);
        console.log(`✅ Rimossi ${chunkCount} chunks sintetici.`);

        // 2. Rimuovi i documenti
        const { error: docErr, count: docCount } = await supabase.from('rag_documents')
            .delete({ count: 'exact' })
            .eq('materia', 'Diritto Civile (Notariato)')
            .eq('autore', 'Antigravity AI VIP');

        if (docErr) throw new Error("Errore eliminazione documenti: " + docErr.message);
        console.log(`✅ Rimossi ${docCount} documenti sintetici.`);

    } catch (e) {
        console.error("❌ ERRORE:", e.message);
    }
}

purgeSyntheticData().catch(console.error);
