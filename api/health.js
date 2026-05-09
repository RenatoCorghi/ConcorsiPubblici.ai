import { createClient } from '@supabase/supabase-js';
import { ALLOWED_ORIGINS, isOriginAllowed } from './_cors.js';

export default async function handler(req, res) {
    // CORS
    const origin = req.headers.origin || '';
    const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const supabaseUrl = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    let supabaseStatus = 'missing_key';
    let dbTime = null;
    
    if (supabaseKey) {
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const start = Date.now();
            const { error } = await supabase.from('profiles').select('id').limit(1);
            if (error) {
                supabaseStatus = 'error: ' + error.message;
            } else {
                supabaseStatus = 'connected';
                dbTime = Date.now() - start;
            }
        } catch (e) {
            supabaseStatus = 'exception: ' + e.message;
        }
    }

    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'development',
        services: {
            supabase: {
                status: supabaseStatus,
                ping_ms: dbTime
            },
            keys: {
                hasOpenAI: !!process.env.OPENAI_API_KEY,
                hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
                hasGemini: !!process.env.GEMINI_API_KEY,
                hasStripeSecret: !!process.env.STRIPE_SECRET_KEY
            }
        }
    };

    return res.status(200).json(health);
}
