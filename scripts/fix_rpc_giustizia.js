import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function migrate() {
    console.log("🚀 Ripristino funzione search_provvedimenti...");

    const sql = `
    CREATE OR REPLACE FUNCTION search_provvedimenti(
      query_text text,
      tipo_filter text default null,
      sede_filter text default null,
      anno_filter int default null,
      result_limit int default 20,
      result_offset int default 0
    ) RETURNS SETOF provvedimenti_ga AS $$
    BEGIN
      RETURN QUERY
      SELECT *
      FROM provvedimenti_ga
      WHERE 
        (query_text IS NULL OR query_text = '' OR 
         to_tsvector('italian', 
            coalesce(oggetto_ricorso, '') || ' ' || 
            coalesce(oggetto_parere, '') || ' ' || 
            coalesce(testo_completo, '')
         ) @@ plainto_tsquery('italian', query_text)
        )
        AND (tipo_filter IS NULL OR tipo_provvedimento = tipo_filter)
        AND (sede_filter IS NULL OR sede_slug = sede_filter)
        AND (anno_filter IS NULL OR anno_pubblicazione = anno_filter)
      ORDER BY data_pubblicazione DESC
      LIMIT result_limit
      OFFSET result_offset;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    // Nota: Supabase non permette di eseguire DDL arbitrario via RPC 'sql' di solito 
    // a meno che non sia stata creata una funzione di aiuto.
    // Proviamo a vedere se abbiamo 'exec_sql'.
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.error("Errore migrazione:", error.message);
        console.log("Tentativo alternativo: usa l'editor SQL di Supabase con questo codice:\n\n", sql);
    } else {
        console.log("✅ Funzione ripristinata con successo!");
    }
}

migrate();
