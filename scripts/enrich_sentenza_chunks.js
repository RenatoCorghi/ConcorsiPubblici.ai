import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const DRY_RUN = !process.argv.includes('--apply');

async function enrichChunks() {
    console.log(`🔧 ARRICCHIMENTO CHUNK SENTENZE — ${DRY_RUN ? '🧪 DRY RUN' : '⚡ APPLICAZIONE REALE'}\n`);

    // Trova tutti i rag_documents di tipo sentenza_admin (CdS, TAR) con chunks
    let allDocs = [];
    let offset = 0;
    const PAGE = 1000;
    
    while (true) {
        const { data: batch } = await supabase
            .from('rag_documents')
            .select('id, titolo, tipo, materia')
            .in('tipo', ['sentenza', 'sentenza_admin'])
            .gt('chunks_count', 0)
            .range(offset, offset + PAGE - 1);
        
        if (!batch || batch.length === 0) break;
        allDocs.push(...batch);
        offset += PAGE;
        if (batch.length < PAGE) break;
    }

    console.log(`Documenti sentenza GA con chunks: ${allDocs.length}\n`);

    let enriched = 0, skipped = 0, notFound = 0, errors = 0, alreadyDone = 0;

    for (const doc of allDocs) {
        // Estrai numero_provvedimento e sede dal titolo
        let numProvv, sedeSlug;
        
        // Formato 1: "cds 2025 202509430"
        const fmt1 = doc.titolo?.match(/^(cds|tar-[\w-]+)\s+\d{4}\s+(\d+)$/i);
        // Formato 2: "TAR LAZIO - ROMA - SENTENZA N. 202518340 del 2025-10-22"  
        const fmt2 = doc.titolo?.match(/N\.\s*(\d+)\s+del/);
        // Formato 2 sede
        const fmt2sede = doc.titolo?.match(/^(TAR\s+\w+\s*-\s*\w+|CdS)/i);

        if (fmt1) {
            sedeSlug = fmt1[1].toLowerCase();
            numProvv = fmt1[2];
        } else if (fmt2) {
            numProvv = fmt2[1];
            if (fmt2sede) {
                const raw = fmt2sede[1].toLowerCase().replace(/\s+/g, '-').replace(/--+/g, '-');
                // "tar-lazio---roma" → "tar-lazio-roma"
                sedeSlug = raw.replace(/--+/g, '-');
            }
        }

        if (!numProvv || !sedeSlug) {
            skipped++;
            continue;
        }

        // Cerca in provvedimenti_ga
        const { data: gaData } = await supabase
            .from('provvedimenti_ga')
            .select('tipo_provvedimento, sede_nome, sezione_nome, numero_provvedimento, data_pubblicazione, esito, oggetto_ricorso')
            .eq('sede_slug', sedeSlug)
            .eq('numero_provvedimento', numProvv)
            .limit(1);

        if (!gaData || gaData.length === 0) {
            notFound++;
            continue;
        }

        const ga = gaData[0];

        // Header strutturato per l'AI
        const header = `[PROVVEDIMENTO GIUSTIZIA AMMINISTRATIVA]
Tipo: ${ga.tipo_provvedimento}
Organo: ${ga.sede_nome}
Sezione: ${ga.sezione_nome || 'Non specificata'}
Numero registro: ${ga.numero_provvedimento} (ATTENZIONE: questo è un codice interno del registro, NON il numero della sentenza per citazione giurisprudenziale)
Data pubblicazione: ${ga.data_pubblicazione}
Esito: ${ga.esito || 'Non disponibile'}
Oggetto: ${(ga.oggetto_ricorso || 'Non specificato').substring(0, 400)}
---`;

        // Trova i chunk di questo documento
        const { data: chunks } = await supabase
            .from('rag_chunks')
            .select('id, content, chunk_index')
            .eq('document_id', doc.id)
            .order('chunk_index')
            .limit(1);

        if (!chunks || chunks.length === 0) { skipped++; continue; }

        const firstChunk = chunks[0];
        
        // Skip se già arricchito
        if (firstChunk.content.startsWith('[PROVVEDIMENTO')) {
            alreadyDone++;
            continue;
        }

        // Rimuovi la riga "Documento: xxx" se presente
        let cleanContent = firstChunk.content
            .replace(/^Documento:\s*\S+\s+\d{4}\s+\d+\s*\n?/m, '')
            .trim();

        const newContent = `${header}\n\n${cleanContent}`;

        if (DRY_RUN) {
            if (enriched < 3) {
                console.log(`─── PREVIEW #${enriched+1}: ${doc.titolo} ───`);
                console.log(`GA Match: ${ga.tipo_provvedimento} | ${ga.sede_nome} | ${ga.sezione_nome} | ${ga.data_pubblicazione}`);
                console.log(`PRIMA (100 car): ${firstChunk.content.substring(0, 100)}...`);
                console.log(`DOPO  (300 car): ${newContent.substring(0, 300)}...`);
                console.log('');
            }
        } else {
            const { error: updateErr } = await supabase
                .from('rag_chunks')
                .update({ content: newContent })
                .eq('id', firstChunk.id);
            
            if (updateErr) {
                errors++;
                if (errors <= 5) console.error(`  ❌ Errore: ${updateErr.message}`);
            }
            
            if (enriched % 100 === 0) process.stdout.write(`\r  Processati: ${enriched}...`);
        }

        enriched++;
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`📊 RIEPILOGO:`);
    console.log(`   ✅ Arricchiti:     ${enriched}`);
    console.log(`   ⏭️  Già arricchiti: ${alreadyDone}`);
    console.log(`   ⏭️  Saltati:        ${skipped}`);
    console.log(`   ❌ Non in GA:      ${notFound}`);
    console.log(`   ❌ Errori:         ${errors}`);
    console.log(`   📦 Totale:         ${allDocs.length}`);
    if (DRY_RUN) {
        console.log(`\n🧪 DRY RUN completato. Per applicare: node scripts/enrich_sentenza_chunks.js --apply`);
    } else {
        console.log(`\n✅ Arricchimento completato!`);
    }
}

enrichChunks().catch(e => console.error("Fatal:", e));
