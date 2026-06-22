import { createClient } from '@supabase/supabase-js';
import { isOriginAllowed } from './_cors.js';

// Vercel Hobby: max 60s per la generazione audio
export const config = { maxDuration: 60 };

/* ============================================================
   TTS.JS — Serverless TTS Proxy via Azure Cognitive Services
   
   Riceve testo → genera audio MP3 via Azure Neural TTS
   Protezione: auth JWT, rate limit, no cache, no download
   ============================================================ */

const MAX_TEXT_LENGTH = 5000; // Max caratteri per richiesta
const TTS_RATE_LIMIT = 20;   // Max richieste TTS per minuto per utente
const ttsRateLimiter = new Map();

function checkTtsRateLimit(userId) {
    const now = Date.now();
    const windowMs = 60_000;
    if (!ttsRateLimiter.has(userId)) ttsRateLimiter.set(userId, []);
    const timestamps = ttsRateLimiter.get(userId).filter(t => now - t < windowMs);
    if (timestamps.length >= TTS_RATE_LIMIT) return false;
    timestamps.push(now);
    ttsRateLimiter.set(userId, timestamps);
    return true;
}

export default async function handler(req, res) {
    // --- CORS ---
    const origin = req.headers.origin || '';
    if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // --- AUTH ---
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token mancante' });
    }

    const token = authHeader.slice(7);
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.APP_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error('[TTS] Supabase URL o Key mancante');
        return res.status(500).json({ error: 'Configurazione auth mancante' });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Token non valido' });
    }

    // --- RATE LIMIT ---
    if (!checkTtsRateLimit(user.id)) {
        return res.status(429).json({ error: 'Troppe richieste TTS. Riprova fra un minuto.' });
    }

    // --- VALIDAZIONE ---
    const { text, voice, rate } = req.body || {};
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Testo mancante' });
    }
    if (text.length > MAX_TEXT_LENGTH) {
        return res.status(400).json({ error: `Testo troppo lungo (max ${MAX_TEXT_LENGTH} caratteri)` });
    }

    // voice/rate finiscono in attributi SSML delimitati da apici singoli: vanno
    // validati a whitelist di formato, altrimenti un client può iniettare SSML
    // (es. <audio src='...'> → Azure scarica URL arbitrari = SSRF/abuso).
    const SAFE_VOICE = /^[a-z]{2,3}-[A-Z]{2,}-[A-Za-z0-9]+$/;   // es. it-IT-GiuseppeNeural
    const SAFE_RATE = /^[+-]?\d{1,3}%$/;                         // es. -5%, +10%, 0%
    const voiceName = SAFE_VOICE.test(voice || '') ? voice : 'it-IT-GiuseppeNeural';
    const prosodyRate = SAFE_RATE.test(rate || '') ? rate : '-5%';

    const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
    const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'italynorth';

    if (!AZURE_KEY) {
        console.error('[TTS] AZURE_SPEECH_KEY non configurata');
        return res.status(500).json({ error: 'Servizio TTS non configurato' });
    }

    // --- SSML ---
    const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='it-IT'>
        <voice name='${voiceName}'>
            <prosody rate='${prosodyRate}'>
                ${escapedText}
            </prosody>
        </voice>
    </speak>`;

    // --- CHIAMATA AZURE ---
    try {
        const ttsEndpoint = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

        const azureRes = await fetch(ttsEndpoint, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
                'User-Agent': 'ConcorsiAI-TTS/1.0'
            },
            body: ssml
        });

        if (!azureRes.ok) {
            const errBody = await azureRes.text().catch(() => '');
            console.error(`[TTS] Azure error ${azureRes.status}:`, errBody);
            return res.status(502).json({ error: 'Errore nella generazione audio' });
        }

        const audioBuffer = await azureRes.arrayBuffer();

        // --- ANTI-DOWNLOAD HEADERS ---
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Previene embedding in iframe esterne
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');

        return res.status(200).send(Buffer.from(audioBuffer));

    } catch (err) {
        console.error('[TTS] Errore interno:', err);
        return res.status(500).json({ error: 'Errore interno del server TTS' });
    }
}
