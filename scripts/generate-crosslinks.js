/**
 * GENERATE CROSS-LINKS (Rete Sistematica)
 * 
 * Per ogni scheda VIP, genera una Sezione 8 — "Rete Sistematica" che contiene
 * i collegamenti espliciti con le 3-5 sentenze più affini nel database.
 * 
 * Usa Gemini 3.1 Pro per classificare la relazione tra sentenze:
 * conferma / supera / distingue / affina / applica
 * 
 * Uso:
 *   node scripts/generate-crosslinks.js [--dir=sentenze_sez_semplici_vip] [--limit=5] [--dry-run]
 * 
 * Opzioni:
 *   --dir=DIR       Directory da processare (default: tutte le VIP)
 *   --limit=N       Processa solo N schede (per test)
 *   --dry-run       Mostra i cross-link senza scrivere su file
 *   --concurrency=N Chiamate parallele (default: 2)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ─── ENV ─────────────────────────────────────────────────────
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

// ─── CLI ARGS ────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
    const found = args.find(a => a.startsWith(`--${name}=`) || a.startsWith(`--${name}`));
    if (!found) return null;
    if (found.includes('=')) return found.split('=')[1];
    return true;
};

const TARGET_DIR = getArg('dir') || null;  // null = tutte le VIP
const LIMIT = getArg('limit') ? parseInt(getArg('limit')) : Infinity;
const DRY_RUN = args.includes('--dry-run');
const CONCURRENCY = getArg('concurrency') ? parseInt(getArg('concurrency')) : 2;

// Directory VIP con schede strutturate a 7 sezioni
const VIP_DIRS = [
    'sentenze_ssuu_vip_schede',
    'sentenze_sez_semplici_vip',
    'sentenze_admin_vip',
    'sentenze_admin_mancanti_vip',
    'sentenze_corte_cost_vip',
];

// ─── HELPERS ─────────────────────────────────────────────────

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: text.substring(0, 8000) }] },  // Truncate for embedding
            outputDimensionality: 768
        })
    });
    const data = await res.json();
    if (!data.embedding) throw new Error("Embedding fallito: " + JSON.stringify(data).substring(0, 300));
    return data.embedding.values;
}

async function searchSimilarDocuments(embedding, excludeTitle) {
    // Usa l'RPC hybrid search per trovare documenti simili
    const { data, error } = await supabase.rpc('match_documents_hybrid', {
        query_embedding: embedding,
        query_text: '',  // solo vector search
        match_count: 10,
        match_threshold: 0.40
    });

    if (error) {
        console.error('  ⚠️ RPC error, trying fallback...', error.message);
        // Fallback a match_rag_chunks
        const { data: fallback, error: fbErr } = await supabase.rpc('match_rag_chunks', {
            query_embedding: embedding,
            match_count: 10,
            match_threshold: 0.40
        });
        if (fbErr) throw new Error('Fallback RPC failed: ' + fbErr.message);
        return (fallback || []).filter(d => !d.titolo?.includes(excludeTitle));
    }

    // Filtra il documento stesso e prendi max 6 candidati
    return (data || [])
        .filter(d => {
            const titleMatch = d.titolo && excludeTitle && d.titolo.includes(excludeTitle);
            return !titleMatch;
        })
        .slice(0, 6);
}

async function classifyRelationships(sourceScheda, candidates) {
    const candidateTexts = candidates.map((c, i) => {
        const content = (c.content || '').substring(0, 1500);
        return `--- CANDIDATO ${i+1} ---\nTitolo: ${c.titolo || 'N/A'}\nTipo: ${c.tipo || 'N/A'}\nMateria: ${c.materia || 'N/A'}\nSimilarità: ${((c.similarity || 0) * 100).toFixed(1)}%\nContenuto:\n${content}`;
    }).join('\n\n');

    const prompt = `Sei un giurista esperto. Analizza la sentenza SORGENTE e i candidati sottostanti.

Per ciascun candidato RILEVANTE (non tutti lo saranno), classifica la relazione giuridica con la sentenza sorgente.

REGOLE:
- Seleziona SOLO i candidati con una relazione giuridica reale (stesso istituto, stessa questione, stessa materia)
- Ignora candidati che trattano materie o istituti completamente diversi, anche se hanno similarità testuale alta
- Restituisci da 1 a 5 collegamenti, NON di più
- Se nessun candidato è realmente collegato, restituisci un array vuoto []
- Ogni "sintesi" deve essere BREVE: max 30 parole

RELAZIONI POSSIBILI:
- "CONFERMA": la sentenza candidata conferma lo stesso principio
- "SUPERA": la sentenza candidata supera/overrules il precedente orientamento  
- "DISTINGUE": la sentenza candidata distingue il caso, applicando una regola diversa a fattispecie apparentemente simile
- "AFFINA": la sentenza candidata sviluppa/precisa un aspetto del principio
- "APPLICA": la sentenza candidata applica lo stesso principio a un ambito diverso

FORMATO OUTPUT OBBLIGATORIO: Rispondi SOLO con un JSON array compatto, senza spazi superflui. Esempio:
[{"estremi":"Cass. Civ. n. 1234/2020","relazione":"CONFERMA","sintesi":"Conferma il principio X."}]

=== SENTENZA SORGENTE ===
${sourceScheda.substring(0, 3000)}

=== CANDIDATI ===
${candidateTexts}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
            }
        })
    });

    const data = await res.json();
    
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('  ⚠️ Gemini response vuota:', JSON.stringify(data).substring(0, 500));
        return [];
    }

    let responseText = data.candidates[0].content.parts[0].text.trim();
    
    // Pulisci eventuali backtick markdown
    responseText = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    // Normalizza: rimuovi newline dentro le stringhe JSON
    responseText = responseText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Recovery per JSON troncato: se finisce senza ']', prova a chiuderlo
    if (responseText.startsWith('[') && !responseText.endsWith(']')) {
        // Trova l'ultimo oggetto completo (che finisce con })
        const lastCloseBrace = responseText.lastIndexOf('}');
        if (lastCloseBrace > 0) {
            responseText = responseText.substring(0, lastCloseBrace + 1) + ']';
            console.log('    🔧 JSON troncato recuperato (chiuso dopo ultimo oggetto completo)');
        }
    }
    
    try {
        const parsed = JSON.parse(responseText);
        return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch (e) {
        // Secondo tentativo: cerca un array JSON nel testo
        const match = responseText.match(/\[.*\]/s);
        if (match) {
            try { 
                const parsed = JSON.parse(match[0]);
                return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
            } catch (_) {}
        }
        console.error('  ⚠️ JSON parse error. Response (first 500 chars):', responseText.substring(0, 500));
        return [];
    }
}

function extractTitle(content) {
    // Prima riga della scheda = titolo (es. "Cassazione Civile, Sez. III, 11 maggio 2021, n. 12437")
    const firstLine = content.split('\n')[0].trim();
    return firstLine;
}

function hasExistingCrosslinks(content) {
    return content.includes('8. Rete Sistematica') || content.includes('## Rete Sistematica');
}

function formatCrosslinks(links) {
    if (!links || links.length === 0) return null;
    
    let section = '\n8. Rete Sistematica (Cross-Link)\n\n';
    for (const link of links) {
        const rel = (link.relazione || 'COLLEGA').toUpperCase();
        const estremi = link.estremi || 'N/A';
        const sintesi = link.sintesi || '';
        section += `  - [${rel}] ${estremi}: ${sintesi}\n`;
    }
    return section;
}

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            results.push(...getFilesRecursive(full));
        } else if (entry.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── MAIN ────────────────────────────────────────────────────

async function processFile(filePath, index, total) {
    const content = fs.readFileSync(filePath, 'utf8');
    const title = extractTitle(content);
    const relPath = path.relative(process.cwd(), filePath);
    
    // Skip se ha già i cross-link
    if (hasExistingCrosslinks(content)) {
        console.log(`  [${index}/${total}] ⏭️  SKIP (già cross-linked): ${relPath}`);
        return { status: 'skipped', file: relPath };
    }
    
    // Skip se file troppo corto (probabilmente non è una scheda strutturata)
    if (content.length < 500) {
        console.log(`  [${index}/${total}] ⏭️  SKIP (troppo corto): ${relPath}`);
        return { status: 'skipped', file: relPath };
    }

    console.log(`  [${index}/${total}] 🔍 Processing: ${relPath}`);
    console.log(`    Titolo: ${title.substring(0, 80)}`);
    
    try {
        // Fase 1: Embedding della scheda
        const embedding = await getEmbedding(content);
        await sleep(300);  // Rate limiting
        
        // Fase 2: Cerca documenti simili
        const candidates = await searchSimilarDocuments(embedding, title.substring(0, 50));
        
        if (candidates.length === 0) {
            console.log(`    ❌ Nessun candidato trovato`);
            return { status: 'no_candidates', file: relPath };
        }
        
        console.log(`    📊 ${candidates.length} candidati trovati (top sim: ${((candidates[0]?.similarity || 0) * 100).toFixed(1)}%)`);
        
        // Fase 3: Classifica le relazioni con Gemini 3.1 Pro
        const links = await classifyRelationships(content, candidates);
        await sleep(500);  // Rate limiting Gemini Pro
        
        if (links.length === 0) {
            console.log(`    ⚠️  Nessun collegamento giuridico rilevante`);
            return { status: 'no_links', file: relPath };
        }
        
        // Fase 4: Formatta e scrivi
        const crosslinkSection = formatCrosslinks(links);
        
        if (DRY_RUN) {
            console.log(`    ✅ DRY-RUN — ${links.length} cross-link generati:`);
            for (const l of links) {
                console.log(`       [${l.relazione}] ${l.estremi}: ${l.sintesi?.substring(0, 80)}...`);
            }
            return { status: 'dry_run', file: relPath, links: links.length };
        }
        
        // Scrivi la Sezione 8 nel file
        const updatedContent = content.trimEnd() + '\n' + crosslinkSection;
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        
        console.log(`    ✅ ${links.length} cross-link scritti nel file`);
        for (const l of links) {
            console.log(`       [${l.relazione}] ${l.estremi}`);
        }
        
        return { status: 'success', file: relPath, links: links.length };
        
    } catch (err) {
        console.error(`    ❌ ERRORE: ${err.message}`);
        return { status: 'error', file: relPath, error: err.message };
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  GENERATE CROSS-LINKS (Rete Sistematica)    ║');
    console.log('║  Gemini 3.1 Pro — Analisi Relazionale       ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log();
    
    // Determina le directory da processare
    const dirs = TARGET_DIR ? [TARGET_DIR] : VIP_DIRS;
    const existingDirs = dirs.filter(d => fs.existsSync(d));
    
    if (existingDirs.length === 0) {
        console.error('❌ Nessuna directory VIP trovata! Verifica di essere nella root del progetto.');
        process.exit(1);
    }
    
    console.log(`📂 Directory: ${existingDirs.join(', ')}`);
    console.log(`🔢 Limite: ${LIMIT === Infinity ? 'Nessuno' : LIMIT}`);
    console.log(`📝 Modalità: ${DRY_RUN ? 'DRY-RUN (nessuna scrittura)' : 'SCRITTURA ATTIVA'}`);
    console.log(`⚡ Concorrenza: ${CONCURRENCY}`);
    console.log();
    
    // Raccoglie tutti i file
    let allFiles = [];
    for (const dir of existingDirs) {
        const files = getFilesRecursive(dir);
        console.log(`  📁 ${dir}: ${files.length} file .md`);
        allFiles.push(...files);
    }
    
    // Applica il limite
    if (LIMIT < allFiles.length) {
        allFiles = allFiles.slice(0, LIMIT);
    }
    
    console.log(`\n🚀 Inizio processamento di ${allFiles.length} file...\n`);
    
    // Processa con concorrenza limitata
    const results = { success: 0, skipped: 0, no_candidates: 0, no_links: 0, error: 0, dry_run: 0 };
    let totalLinks = 0;
    
    for (let i = 0; i < allFiles.length; i += CONCURRENCY) {
        const batch = allFiles.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map((file, j) => processFile(file, i + j + 1, allFiles.length))
        );
        
        for (const r of batchResults) {
            results[r.status] = (results[r.status] || 0) + 1;
            totalLinks += r.links || 0;
        }
        
        // Pausa tra batch per rate limiting
        if (i + CONCURRENCY < allFiles.length) {
            await sleep(1000);
        }
    }
    
    // Riepilogo
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 RIEPILOGO CROSS-LINKING');
    console.log('═══════════════════════════════════════════');
    console.log(`  ✅ Successo:        ${results.success}`);
    console.log(`  📝 Dry-run:         ${results.dry_run}`);
    console.log(`  ⏭️  Skipped:        ${results.skipped}`);
    console.log(`  ⚠️  No candidati:   ${results.no_candidates}`);
    console.log(`  🔗 No link:         ${results.no_links}`);
    console.log(`  ❌ Errori:          ${results.error}`);
    console.log(`  🔗 Cross-link totali: ${totalLinks}`);
    console.log('═══════════════════════════════════════════');
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
