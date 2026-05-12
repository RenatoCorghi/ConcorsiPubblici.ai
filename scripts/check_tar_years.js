
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY);

async function checkTarYears() {
    console.log('🔍 Analisi anni Sentenze Admin (TAR/CdS) in RAG...\n');

    const { data, error } = await supabase
        .from('rag_documents')
        .select('titolo, filename, materia')
        .eq('tipo', 'sentenza_admin');

    if (error) {
        console.error('❌ Errore:', error.message);
        return;
    }

    const stats = {};
    data.forEach(doc => {
        // Estrai anno dal titolo o filename (es: "cds_2024_01_01" o "TAR Lazio Sez. I n. 123/2024")
        const yearMatch = doc.titolo.match(/20\d{2}/) || doc.filename.match(/20\d{2}/);
        const year = yearMatch ? yearMatch[0] : 'Sconosciuto';
        
        let type = 'Altro';
        if (doc.filename?.startsWith('cds_')) type = 'CdS';
        if (doc.filename?.startsWith('tar-')) type = 'TAR Lazio';

        if (!stats[type]) stats[type] = {};
        stats[type][year] = (stats[type][year] || 0) + 1;
    });

    console.table(stats);
}

checkTarYears();
