import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function audit() {
    console.log("⚖️  DISTRIBUZIONE provvedimenti_ga PER SEDE\n");

    // Conteggio per sede
    const sedi = ['cds', 'tar-lazio-roma', 'tar-lazio-latina', 'tar-lombardia-milano', 
        'tar-campania-napoli', 'tar-sicilia-palermo', 'tar-sicilia-catania',
        'tar-puglia-bari', 'tar-puglia-lecce', 'tar-toscana', 'tar-veneto',
        'tar-piemonte', 'tar-emilia-romagna-bologna', 'tar-liguria', 'tar-calabria-catanzaro',
        'tar-sardegna', 'tar-marche', 'tar-umbria', 'tar-abruzzo-l-aquila',
        'tar-campania-salerno', 'tar-friuli-venezia-giulia', 'tar-basilicata',
        'tar-molise', 'tar-valle-d-aosta', 'cga-sicilia',
        'trga-trento', 'trga-bolzano', 'tar-lombardia-brescia',
        'tar-emilia-romagna-parma', 'tar-calabria-reggio-calabria',
        'tar-abruzzo-pescara'];

    let totalKeep = 0;
    let totalDiscard = 0;
    const KEEP = ['cds', 'tar-lazio-roma'];

    for (const sede of sedi) {
        const { count } = await supabase.from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .eq('sede_slug', sede);
        
        // Controlla quanti hanno testo completo
        const { count: withText } = await supabase.from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .eq('sede_slug', sede)
            .not('testo_completo', 'is', null);

        if (count > 0) {
            const keep = KEEP.includes(sede);
            const icon = keep ? '✅' : '🗑️';
            console.log(`  ${icon} ${sede.padEnd(35)} ${String(count).padStart(7)} record | ${withText} con testo`);
            if (keep) totalKeep += count;
            else totalDiscard += count;
        }
    }

    console.log(`\n  📊 Da TENERE (CdS + TAR Lazio): ${totalKeep}`);
    console.log(`  🗑️  Da DISABILITARE (altri TAR): ${totalDiscard}`);
    console.log(`  📦 TOTALE: ${totalKeep + totalDiscard}`);
}

audit().catch(e => console.error(e));
