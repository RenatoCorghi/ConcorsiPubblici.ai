import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const e = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) e[m[1].trim()] = m[2].trim();
});

const s = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_KEY);

const { data } = await s.from('rag_chunks')
    .select('id, content, fts')
    .eq('materia', 'Diritto Amministrativo')
    .limit(1);

const row = data[0];
const ftsStr = JSON.stringify(row.fts);

console.log('=== DIAGNOSTICA FTS ===');
console.log('Content has "legge":', row.content?.includes('legge'));
console.log('Content has "art":', row.content?.includes('art'));
console.log('Content has "241":', row.content?.includes('241'));
console.log('FTS type:', typeof row.fts);
console.log('FTS length:', ftsStr.length);
console.log('FTS first 500 chars:', ftsStr.substring(0, 500));
console.log('FTS has token legge:', ftsStr.includes("'legge'"));
console.log('FTS has token art:', ftsStr.includes("'art'"));
