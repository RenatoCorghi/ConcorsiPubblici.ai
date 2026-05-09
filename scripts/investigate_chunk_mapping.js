import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Test: possiamo fare il match tra il titolo del rag_document e il provvedimenti_ga?
const testCases = [
    { titolo: 'CdS', numero: '202600834', sede: 'cds' },     // la sentenza "allucinata"
    { titolo: 'CdS', numero: '202401188', sede: 'cds' },     // l'altra allucinata
    { titolo: 'CdS', numero: '202600034', sede: 'cds' },     // la vera n. 34/2026
];

console.log("🔬 MAPPING numero_provvedimento → metadati reali\n");

for (const tc of testCases) {
    console.log(`─── Cerco: sede=${tc.sede}, numero_provvedimento=${tc.numero} ───`);
    
    const { data } = await supabase
        .from('provvedimenti_ga')
        .select('id, numero_provvedimento, tipo_provvedimento, sede_nome, sezione_nome, anno_pubblicazione, data_pubblicazione, esito, oggetto_ricorso')
        .eq('sede_slug', tc.sede)
        .eq('numero_provvedimento', tc.numero)
        .limit(1);
    
    if (data?.length) {
        const m = data[0];
        console.log(`  ✅ TROVATO!`);
        console.log(`  Tipo: ${m.tipo_provvedimento}`);
        console.log(`  Sede: ${m.sede_nome}`);
        console.log(`  Sezione: ${m.sezione_nome}`);
        console.log(`  Numero: ${m.numero_provvedimento}`);
        console.log(`  Data: ${m.data_pubblicazione}`);
        console.log(`  Anno: ${m.anno_pubblicazione}`);
        console.log(`  Esito: ${m.esito}`);
        console.log(`  Oggetto: ${(m.oggetto_ricorso||'').substring(0,200)}`);
    } else {
        console.log(`  ❌ Non trovato`);
    }
    console.log('');
}

// Verifica: che formato ha il "vero" numero sentenza?
console.log("─── CAMPIONE: come appaiono i numeri provvedimento per CdS 2026 ───\n");
const { data: sample26 } = await supabase
    .from('provvedimenti_ga')
    .select('numero_provvedimento, data_pubblicazione, sezione_nome')
    .eq('sede_slug', 'cds')
    .eq('anno_pubblicazione', 2026)
    .order('data_pubblicazione', { ascending: true })
    .limit(10);

(sample26||[]).forEach(s => {
    console.log(`  n. ${s.numero_provvedimento} del ${s.data_pubblicazione} (${s.sezione_nome})`);
});
