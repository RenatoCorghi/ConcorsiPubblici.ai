/* ============================================================
   BANDI.JS — API Serverless per bandi concorsi pubblici
   
   GET /api/bandi?q=funzionario&categoria=Università&aperto=true&limit=20&offset=0
   GET /api/bandi?action=stats
   GET /api/bandi?action=categorie
   GET /api/bandi?id=123
   ============================================================ */

import { createClient } from '@supabase/supabase-js';

import { ALLOWED_ORIGINS, isOriginAllowed } from './_cors.js';

const MAX_LIMIT = 100;

export default async function handler(req, res) {
    // CORS
    const origin = req.headers.origin || '';
    const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_9RLOMhYtEvC0ehjgupQqkQ_GbVdzJf6';
    if (!supabaseKey) return res.status(500).json({ error: 'Configurazione Supabase mancante' });

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const { action, q, categoria, aperto, limit, offset, id } = req.query;

        // ── Statistiche ──
        if (action === 'stats') {
            const { data: totale } = await supabase.from('bandi_concorsi').select('id', { count: 'exact', head: true });
            const { count: totaleCount } = await supabase.from('bandi_concorsi').select('id', { count: 'exact', head: true });
            const { count: apertiCount } = await supabase.from('bandi_concorsi').select('id', { count: 'exact', head: true }).gte('scadenza', new Date().toISOString().split('T')[0]);
            
            const { data: catData } = await supabase.from('bandi_concorsi').select('categoria');
            const categorie = {};
            (catData || []).forEach(r => {
                const cat = r.categoria || 'Altro';
                categorie[cat] = (categorie[cat] || 0) + 1;
            });

            // Scadenze imminenti (prossimi 7 giorni)
            const oggi = new Date().toISOString().split('T')[0];
            const tra7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
            const { data: urgenti } = await supabase
                .from('bandi_concorsi')
                .select('id, titolo, ente, scadenza')
                .gte('scadenza', oggi)
                .lte('scadenza', tra7)
                .order('scadenza', { ascending: true })
                .limit(5);

            return res.status(200).json({
                totale: totaleCount || 0,
                aperti: apertiCount || 0,
                per_categoria: categorie,
                scadenze_imminenti: urgenti || [],
                fonte: 'Gazzetta Ufficiale — 4ª Serie Speciale (Concorsi ed Esami)'
            });
        }

        // ── Lista categorie ──
        if (action === 'categorie') {
            const { data } = await supabase.from('bandi_concorsi').select('categoria');
            const cats = [...new Set((data || []).map(r => r.categoria).filter(Boolean))].sort();
            return res.status(200).json({ categorie: cats });
        }

        // ── Dettaglio ──
        if (id) {
            const { data, error } = await supabase
                .from('bandi_concorsi')
                .select('*')
                .eq('id', parseInt(id))
                .single();
            if (error) throw error;
            if (!data) return res.status(404).json({ error: 'Bando non trovato' });
            return res.status(200).json({ bando: data });
        }

        // ── Ricerca ──
        const searchLimit = Math.min(parseInt(limit) || 20, MAX_LIMIT);
        const searchOffset = parseInt(offset) || 0;
        const oggi = new Date().toISOString().split('T')[0];

        if (q && q.trim().length > 0) {
            const { data, error } = await supabase.rpc('search_bandi', {
                query_text: q.trim(),
                categoria_filter: categoria || null,
                solo_aperti: aperto === 'true',
                result_limit: searchLimit,
                result_offset: searchOffset
            });
            if (error) throw error;
            return res.status(200).json({
                query: q,
                risultati: data || [],
                count: (data || []).length,
                limit: searchLimit,
                offset: searchOffset
            });
        }

        // Filtro diretto
        let query = supabase
            .from('bandi_concorsi')
            .select('*', { count: 'exact' });

        if (categoria) query = query.eq('categoria', categoria);
        if (aperto === 'true') query = query.or(`scadenza.gte.${oggi},scadenza.is.null`);

        query = query.order('data_pubblicazione', { ascending: false }).range(searchOffset, searchOffset + searchLimit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({
            risultati: data || [],
            count: count || 0,
            limit: searchLimit,
            offset: searchOffset,
            fonte: 'Gazzetta Ufficiale — 4ª Serie Speciale'
        });

    } catch (error) {
        console.error('[Bandi API] Error:', error.message);
        return res.status(500).json({ error: 'Errore: ' + error.message });
    }
}
