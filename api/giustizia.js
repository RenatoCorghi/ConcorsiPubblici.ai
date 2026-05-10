/* ============================================================
   GIUSTIZIA.JS — API Serverless per ricerca provvedimenti
   
   Endpoint Vercel per interrogare la banca dati della
   Giustizia Amministrativa su Supabase.
   
   GET /api/giustizia?q=appalto&tipo=SENTENZA&sede=cds&anno=2025&limit=20&offset=0
   GET /api/giustizia?action=stats
   GET /api/giustizia?action=sedi
   GET /api/giustizia?id=12345  (con download on-demand del testo)
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

import { ALLOWED_ORIGINS, isOriginAllowed } from './_cors.js';

const VALID_TIPI = ['SENTENZA', 'ORDINANZA', 'DECRETO', 'PARERE'];
const MAX_LIMIT = 100;
const MDP_BASE = 'https://mdp.giustizia-amministrativa.it/visualizza/';

// Sedi attive — solo CdS e TAR Lazio Roma hanno dati significativi.
// Gli altri ~186k record sono gusci vuoti che causano timeout.
const ACTIVE_SEDI = ['cds', 'tar-lazio-roma'];

// Mappa sede_slug → schema MDP
const SEDE_TO_SCHEMA = {
    'cds': 'cds', 'cga-sicilia': 'cga',
    'tar-abruzzo-l-aquila': 'tar_aq', 'tar-abruzzo-pescara': 'tar_pe',
    'tar-basilicata': 'tar_pz', 'tar-calabria-catanzaro': 'tar_cz',
    'tar-calabria-reggio-calabria': 'tar_rc', 'tar-campania-napoli': 'tar_na',
    'tar-campania-salerno': 'tar_sa', 'tar-emilia-romagna-bologna': 'tar_bo',
    'tar-emilia-romagna-parma': 'tar_pr', 'tar-friuli-venezia-giulia': 'tar_ts',
    'tar-lazio-roma': 'tar_rm', 'tar-lazio-latina': 'tar_lt',
    'tar-liguria': 'tar_ge', 'tar-lombardia-milano': 'tar_mi',
    'tar-lombardia-brescia': 'tar_bs', 'tar-marche': 'tar_an',
    'tar-molise': 'tar_cb', 'tar-piemonte': 'tar_to',
    'tar-puglia-bari': 'tar_ba', 'tar-puglia-lecce': 'tar_le',
    'tar-sardegna': 'tar_ca', 'tar-sicilia-palermo': 'tar_pa',
    'tar-sicilia-catania': 'tar_ct', 'tar-toscana': 'tar_fi',
    'trga-trento': 'trga_tn', 'trga-bolzano': 'trga_bz',
    'tar-umbria': 'tar_pg', 'tar-valle-d-aosta': 'tar_ao',
    'tar-veneto': 'tar_ve',
};

// --- HELPER: Estrai testo leggibile da XML ---
function extractTextFromXML(xmlContent) {
    if (!xmlContent) return null;
    let text = xmlContent
        .replace(/<\?xml[^?]*\?>/g, '')
        .replace(/<\?xml-stylesheet[^?]*\?>/g, '');
    text = text.replace(/<h:div\s*\/>/g, '\n');
    text = text.replace(/<\/h:div>/g, '\n');
    text = text.replace(/<h:div[^>]*>/g, '');
    text = text.replace(/<corsivo>/g, '*');
    text = text.replace(/<\/corsivo>/g, '*');
    text = text.replace(/<[^>]+>/g, '');
    text = text
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
    text = text.replace(/\t+/g, ' ').replace(/ +/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    return text;
}

// --- HELPER: Download on-demand del testo completo ---
async function fetchFullText(record) {
    const schema = SEDE_TO_SCHEMA[record.sede_slug];
    if (!schema || !record.numero_ricorso || !record.numero_provvedimento) return null;

    // A volte la G.A. salva i file con suffissi diversi se ci sono correzioni o documenti multipli
    const suffixes = schema === 'cds' ? ['11', '01', '12', '02', '03'] : ['01', '11', '02', '12', '03'];
    
    for (const suffix of suffixes) {
        const nomeFile = `${record.numero_provvedimento}_${suffix}.html`;
        const url = `${MDP_BASE}?nodeRef=&schema=${schema}&nrg=${record.numero_ricorso}&nomeFile=${nomeFile}&subDir=Provvedimenti`;

        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(8000), // Riduciamo timeout per non bloccare troppo nei loop
                headers: { 'User-Agent': 'ConcorsiPubblici.ai/1.0 (Educational)', 'Accept': 'text/html, application/xml, */*' }
            });
            if (!response.ok) continue; // Prova il prossimo suffisso
            
            const rawContent = await response.text();
            if (!rawContent || rawContent.length < 200 || !rawContent.includes('<Provvedimento>')) continue;
            if (rawContent.includes('Pagina non trovata') || rawContent.includes('404')) continue;
            
            const cleanText = extractTextFromXML(rawContent);
            if (cleanText && cleanText.length > 50) return cleanText;
        } catch {
            // Ignora timeout/network error su questo specifico tentativo e passa al prossimo
            continue; 
        }
    }
    
    // Se tutti i suffissi falliscono, il testo non è disponibile in HTML
    return null;
}

// --- HANDLER ---
export default async function handler(req, res) {
    // CORS
    const origin = req.headers.origin || '';
    const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Cache 1h per le query (dati cambiano raramente)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    // Supabase client — per l'on-demand usa service_role key per scrivere
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.APP_SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
    const supabaseReadKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseWriteKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseReadKey) {
        return res.status(500).json({ error: 'Configurazione Supabase mancante' });
    }

    const supabase = createClient(supabaseUrl, supabaseReadKey);

    try {
        const { action, q, tipo, sede, anno, esito, limit, offset, id } = req.query;

        // ── ACTION: Statistiche ──
        if (action === 'stats') {
            const { data, error } = await supabase.rpc('get_provvedimenti_stats');
            if (error) throw error;
            
            const summary = {};
            let totale = 0;
            for (const row of data || []) {
                if (!summary[row.tipo]) summary[row.tipo] = { totale: 0, perAnno: {} };
                summary[row.tipo].totale += parseInt(row.conteggio);
                summary[row.tipo].perAnno[row.anno] = (summary[row.tipo].perAnno[row.anno] || 0) + parseInt(row.conteggio);
                totale += parseInt(row.conteggio);
            }
            
            return res.status(200).json({ 
                totale_provvedimenti: totale,
                per_tipo: summary,
                fonte: 'OpenGA - Giustizia Amministrativa (CC-BY 4.0)',
                raw: data 
            });
        }

        // ── ACTION: Lista sedi ──
        if (action === 'sedi') {
            const { data, error } = await supabase
                .from('provvedimenti_ga')
                .select('sede_slug, sede_nome')
                .order('sede_slug');
            
            if (error) throw error;
            
            const sedi = [...new Map(data.map(r => [r.sede_slug, r])).values()];
            return res.status(200).json({ sedi });
        }

        // ── ACTION: Dettaglio singolo (con download on-demand) ──
        if (id) {
            const { data, error } = await supabase
                .from('provvedimenti_ga')
                .select('*')
                .eq('id', parseInt(id))
                .single();
            
            if (error) throw error;
            if (!data) return res.status(404).json({ error: 'Provvedimento non trovato' });
            
            // === ON-DEMAND: Se il testo completo manca, scaricalo al volo ===
            if (!data.testo_completo && data.numero_ricorso) {
                console.log(`[On-Demand] Scarico testo per provvedimento ${data.numero_provvedimento} (${data.sede_slug})`);
                const fullText = await fetchFullText(data);
                
                if (fullText) {
                    data.testo_completo = fullText;
                    
                    // Salva in DB per i prossimi utenti (serve service_role key)
                    if (supabaseWriteKey) {
                        const supabaseWrite = createClient(supabaseUrl, supabaseWriteKey);
                        await supabaseWrite
                            .from('provvedimenti_ga')
                            .update({ testo_completo: fullText })
                            .eq('id', data.id);
                        console.log(`[On-Demand] ✅ Testo salvato: ${fullText.length} caratteri`);
                    }
                }
            }
            
            // Non cachare i dettagli (il testo potrebbe cambiare)
            res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
            return res.status(200).json({ provvedimento: data });
        }

        // ── ACTION: Ricerca ──
        const searchLimit = Math.min(parseInt(limit) || 20, MAX_LIMIT);
        const searchOffset = parseInt(offset) || 0;

        if (tipo && !VALID_TIPI.includes(tipo.toUpperCase())) {
            return res.status(400).json({ 
                error: `Tipo non valido. Valori ammessi: ${VALID_TIPI.join(', ')}` 
            });
        }

        if (q && q.trim().length > 0) {
            // Ricerca full-text con indice GIN (istantanea su qualsiasi volume)
            // Richiede: CREATE INDEX idx_ga_oggetto_fts ON provvedimenti_ga USING GIN (to_tsvector('italian', coalesce(oggetto_ricorso, '')));
            let searchQuery = supabase
                .from('provvedimenti_ga')
                .select('id, tipo_provvedimento, sede_slug, sede_nome, sezione_nome, numero_provvedimento, anno_pubblicazione, data_pubblicazione, esito, oggetto_ricorso, oggetto_parere, tipo_ricorso')
                .in('sede_slug', sede ? [sede] : ACTIVE_SEDI)
                .textSearch('oggetto_ricorso', q.trim().split(/\s+/).join(' & '), { type: 'plain', config: 'italian' });

            if (tipo) searchQuery = searchQuery.ilike('tipo_provvedimento', `${tipo.toUpperCase()}%`);
            if (anno) searchQuery = searchQuery.eq('anno_pubblicazione', parseInt(anno));

            searchQuery = searchQuery
                .order('data_pubblicazione', { ascending: false })
                .range(searchOffset, searchOffset + searchLimit - 1);

            const { data, error } = await searchQuery;
            if (error) throw error;

            return res.status(200).json({
                query: q,
                risultati: data || [],
                count: (data || []).length,
                limit: searchLimit,
                offset: searchOffset,
                fonte: 'OpenGA - Giustizia Amministrativa (CC-BY 4.0)'
            });
        }

        let query = supabase
            .from('provvedimenti_ga')
            .select('id, tipo_provvedimento, sede_slug, sede_nome, sezione_nome, numero_provvedimento, anno_pubblicazione, data_pubblicazione, esito, oggetto_ricorso, oggetto_parere, tipo_ricorso', { count: 'exact' });

        if (tipo) query = query.ilike('tipo_provvedimento', `${tipo.toUpperCase()}%`);
        if (sede) query = query.eq('sede_slug', sede);
        else query = query.in('sede_slug', ACTIVE_SEDI); // Default: solo sedi attive
        if (anno) query = query.eq('anno_pubblicazione', parseInt(anno));
        if (esito) query = query.ilike('esito', `%${esito}%`);

        query = query
            .order('data_pubblicazione', { ascending: false })
            .range(searchOffset, searchOffset + searchLimit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({
            risultati: data || [],
            count: count || 0,
            limit: searchLimit,
            offset: searchOffset,
            fonte: 'OpenGA - Giustizia Amministrativa (CC-BY 4.0)'
        });

    } catch (error) {
        console.error('[Giustizia API] Error:', error.message);
        return res.status(500).json({ error: 'Errore nella ricerca: ' + error.message });
    }
}
