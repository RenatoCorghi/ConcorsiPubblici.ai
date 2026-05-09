import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

async function audit() {
    console.log("═══════════════════════════════════════════════════");
    console.log("  🔬 AUDIT COMPLETO PIPELINE RAG — CONCORSI.AI");
    console.log("═══════════════════════════════════════════════════\n");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. STATO DATABASE ──────────────────────────────────────
    console.log("📊 1. STATO DATABASE\n");

    // Conteggio rag_documents
    const { count: docCount } = await supabase.from('rag_documents').select('*', { count: 'exact', head: true });
    console.log(`   rag_documents: ${docCount} documenti`);

    // Conteggio rag_chunks
    const { count: chunkCount } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true });
    console.log(`   rag_chunks:    ${chunkCount} chunks\n`);

    // Distribuzione per materia
    const { data: allChunks } = await supabase.from('rag_chunks').select('materia');
    const materiaStats = {};
    (allChunks || []).forEach(c => { materiaStats[c.materia] = (materiaStats[c.materia] || 0) + 1; });
    console.log("   Distribuzione per materia:");
    Object.entries(materiaStats).sort((a,b) => b[1]-a[1]).forEach(([m,c]) => {
        console.log(`     • ${m}: ${c} chunks`);
    });

    // ── 2. VERIFICA EMBEDDING DIMENSIONALITÀ ───────────────────
    console.log("\n📐 2. VERIFICA DIMENSIONALITÀ EMBEDDING\n");

    const { data: sampleChunk, error: sampleErr } = await supabase
        .from('rag_chunks')
        .select('id, materia, embedding')
        .limit(1)
        .single();

    if (sampleErr) {
        console.log(`   ❌ Errore lettura sample: ${sampleErr.message}`);
    } else if (sampleChunk?.embedding) {
        // L'embedding potrebbe tornare come stringa JSON o array
        let embArr;
        if (typeof sampleChunk.embedding === 'string') {
            try { embArr = JSON.parse(sampleChunk.embedding); } catch { embArr = null; }
        } else {
            embArr = sampleChunk.embedding;
        }
        if (Array.isArray(embArr)) {
            console.log(`   Dimensione embedding in DB: ${embArr.length}`);
            if (embArr.length === 768) {
                console.log(`   ✅ Corretto! Gemini embedding-002 produce vettori da 768.`);
            } else {
                console.log(`   ⚠️  ATTENZIONE: Dimensione ${embArr.length} ≠ 768 atteso!`);
            }
        } else {
            console.log(`   ⚠️  Formato embedding non riconosciuto (tipo: ${typeof sampleChunk.embedding})`);
            // Prova a contare i separatori nella stringa
            if (typeof sampleChunk.embedding === 'string') {
                const commas = (sampleChunk.embedding.match(/,/g) || []).length;
                console.log(`   ℹ️  Commas nel vettore: ${commas} → probabile dim: ${commas + 1}`);
            }
        }
    } else {
        console.log(`   ⚠️  Nessun embedding trovato nel sample chunk (id: ${sampleChunk?.id})`);
    }

    // ── 3. TEST EMBEDDING GEMINI (LIVE) ────────────────────────
    console.log("\n🧠 3. TEST EMBEDDING GEMINI (LIVE)\n");

    const testQuery = "autotutela amministrativa annullamento d'ufficio art 21 nonies";
    console.log(`   Query test: "${testQuery}"`);

    let testVector;
    try {
        const embedRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text: testQuery }] },
                    outputDimensionality: 768
                })
            }
        );
        const embedData = await embedRes.json();
        testVector = embedData.embedding?.values;
        if (testVector) {
            console.log(`   ✅ Embedding generato! Dimensione: ${testVector.length}`);
        } else {
            console.log(`   ❌ Embedding fallito:`, JSON.stringify(embedData).substring(0, 200));
            return;
        }
    } catch (e) {
        console.log(`   ❌ Errore API Gemini: ${e.message}`);
        return;
    }

    // ── 4. TEST RPC search_knowledge ───────────────────────────
    console.log("\n🔍 4. TEST RPC search_knowledge\n");

    // Test senza filtro materia
    try {
        const { data: results, error } = await supabase.rpc('search_knowledge', {
            query_embedding: testVector,
            match_count: 5,
            similarity_threshold: 0.5
        });
        if (error) {
            console.log(`   ❌ RPC search_knowledge FALLITA: ${error.message}`);
            console.log(`   → Dettaglio: ${error.details || 'nessuno'}`);
            console.log(`   → Hint: ${error.hint || 'nessuno'}`);
        } else {
            console.log(`   ✅ search_knowledge (senza filtro): ${(results || []).length} risultati`);
            (results || []).slice(0, 3).forEach((r, i) => {
                console.log(`     ${i+1}. [${r.materia}/${r.tipo}] sim=${r.similarity?.toFixed(3)} → "${(r.content || '').substring(0, 80)}..."`);
            });
        }
    } catch (e) {
        console.log(`   ❌ Errore RPC: ${e.message}`);
    }

    // Test CON filtro materia
    try {
        const { data: results2, error: err2 } = await supabase.rpc('search_knowledge', {
            query_embedding: testVector,
            match_count: 5,
            similarity_threshold: 0.5,
            filter_materia: 'Diritto Amministrativo'
        });
        if (err2) {
            console.log(`\n   ❌ search_knowledge CON filtro materia FALLITA: ${err2.message}`);
        } else {
            console.log(`\n   ✅ search_knowledge (materia='Diritto Amministrativo'): ${(results2 || []).length} risultati`);
            (results2 || []).slice(0, 3).forEach((r, i) => {
                console.log(`     ${i+1}. [${r.materia}/${r.tipo}] sim=${r.similarity?.toFixed(3)} → "${(r.content || '').substring(0, 80)}..."`);
            });
        }
    } catch (e) {
        console.log(`   ❌ Errore RPC (filtro): ${e.message}`);
    }

    // ── 5. TEST RPC match_rag_chunks (alternativa) ─────────────
    console.log("\n🔍 5. TEST RPC match_rag_chunks (se esiste)\n");

    try {
        const { data: results3, error: err3 } = await supabase.rpc('match_rag_chunks', {
            query_embedding: testVector,
            match_count: 3,
            match_threshold: 0.5
        });
        if (err3) {
            console.log(`   ⚠️  match_rag_chunks non disponibile: ${err3.message}`);
        } else {
            console.log(`   ✅ match_rag_chunks: ${(results3 || []).length} risultati`);
        }
    } catch (e) {
        console.log(`   ⚠️  match_rag_chunks errore: ${e.message}`);
    }

    // ── 6. VERIFICA COERENZA MATERIA NELLA NORMALIZZAZIONE ─────
    console.log("\n🏷️  6. COERENZA MATERIE\n");

    const problematic = ['amministrativo', 'civile', 'penale', 'procedura civile', 'procedura penale'];
    for (const mat of problematic) {
        const { count } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true }).eq('materia', mat);
        if (count > 0) {
            console.log(`   ⚠️  "${mat}": ${count} chunks NON normalizzati!`);
        }
    }
    const canonicals = ['Diritto Amministrativo', 'Diritto Civile', 'Diritto Penale', 'Diritto Processuale Civile', 'Diritto Processuale Penale', 'Diritto Costituzionale'];
    for (const mat of canonicals) {
        const { count } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true }).eq('materia', mat);
        if (count > 0) {
            console.log(`   ✅ "${mat}": ${count} chunks`);
        }
    }

    // ── 7. VERIFICA provvedimenti_ga ───────────────────────────
    console.log("\n⚖️  7. TABELLA provvedimenti_ga (GIUSTIZIA AMMINISTRATIVA)\n");

    const { count: gaCount } = await supabase.from('provvedimenti_ga').select('*', { count: 'exact', head: true });
    console.log(`   Totale record: ${gaCount}`);
    
    if (gaCount > 100000) {
        console.log(`   ⚠️  ATTENZIONE: ${gaCount} record è ENORME.`);
        console.log(`   → La RPC search_provvedimenti va in timeout su ILIKE con questo volume.`);
        console.log(`   → SOLUZIONE: Serve un indice GIN su to_tsvector oppure si deve`);
        console.log(`     limitare il campo di ricerca a anno_pubblicazione >= 2024.`);
    }

    // ── RIEPILOGO ──────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════");
    console.log("  📋 FINE AUDIT");
    console.log("═══════════════════════════════════════════════════\n");
}

audit().catch(e => console.error("Fatal:", e));
