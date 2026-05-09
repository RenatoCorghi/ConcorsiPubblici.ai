/* ============================================================
   SSUU.JS — API Serverless per ricerca Dossier VIP Cassazione
   ============================================================ */

import { createClient } from '@supabase/supabase-js';
import { ALLOWED_ORIGINS, isOriginAllowed } from './_cors.js';

const MAX_LIMIT = 50;

export default async function handler(req, res) {
    const origin = req.headers.origin || '';
    const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
    const supabaseReadKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    
    if (!supabaseReadKey) {
        return res.status(500).json({ error: 'Configurazione Supabase mancante' });
    }

    const supabase = createClient(supabaseUrl, supabaseReadKey);

    try {
        const { action, q, limit, offset, id } = req.query;

        // ── ACTION: Dettaglio singolo ──
        if (id) {
            const { data, error } = await supabase
                .from('rag_documents')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw error;
            if (!data) return res.status(404).json({ error: 'Documento non trovato' });
            
            return res.status(200).json({ documento: data });
        }

        // ── ACTION: Ricerca ──
        const searchLimit = Math.min(parseInt(limit) || 20, MAX_LIMIT);
        const searchOffset = parseInt(offset) || 0;

        let query = supabase
            .from('rag_documents')
            .select('id, titolo, filename, created_at', { count: 'exact' })
            .eq('tipo', 'sentenza_ssuu');

        if (q && q.trim().length > 0) {
            // Semplice ILIKE per ora, potremmo usare full text search se impostato su DB
            query = query.ilike('titolo', `%${q.trim()}%`);
        }

        query = query
            .order('created_at', { ascending: false })
            .range(searchOffset, searchOffset + searchLimit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return res.status(200).json({
            risultati: data || [],
            count: count || 0,
            limit: searchLimit,
            offset: searchOffset
        });

    } catch (error) {
        console.error('[SSUU API] Error:', error.message);
        return res.status(500).json({ error: 'Errore nella ricerca: ' + error.message });
    }
}
