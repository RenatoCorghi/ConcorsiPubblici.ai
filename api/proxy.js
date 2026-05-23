import { createClient } from '@supabase/supabase-js';

/* ============================================================
   PROXY.JS — Serverless API Proxy for OpenAI
   
   Security layers:
   1. CORS origin whitelist
   2. Model whitelist (solo modelli economici)
   3. Max tokens cap (previene abuso costi)
   4. Payload sanitization (no campi arbitrari)
   5. In-memory IP rate limiting (60 req/min)
   ============================================================ */

// --- CONFIGURAZIONE SICUREZZA ---

// Nota: la whitelist dei modelli è stata rimossa perché i modelli sono
// dinamici (Gemini, Claude, GPT) e vengono gestiti tramite APP_CONFIG lato frontend.

const MAX_TOKENS_LIMIT = 8000;   // Cap assoluto su max_tokens (alzato per Lectio Magistralis)
const MAX_MESSAGES = 30;          // Max messaggi in una conversazione
const MAX_MESSAGE_LENGTH = 25000;  // Max lunghezza singolo messaggio (chars) — alzato per Lectio multi-modulo
const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 60;      // 60 richieste per finestra

// --- MODEL WHITELIST (anti-abuso costi) ---
const MODEL_WHITELIST = {
    google: [
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
    ],
    anthropic: [
        'claude-opus-4-7',
        'claude-sonnet-4-6',
        'claude-haiku-4',
        'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022'
    ],
    openai: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-3.5-turbo'
    ]
};

import { ALLOWED_ORIGINS, isOriginAllowed } from './_cors.js';

// --- RATE LIMITER IN-MEMORY ---
// Nota: funziona per singola istanza Vercel. Per produzione ad alto traffico
// sostituire con Upstash Redis (@upstash/ratelimit).

const rateLimitStore = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitStore.get(ip);

    // Pulizia periodica (evita memory leak)
    if (rateLimitStore.size > 10000) {
        for (const [key, val] of rateLimitStore) {
            if (now - val.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
                rateLimitStore.delete(key);
            }
        }
    }

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        // Nuova finestra
        rateLimitStore.set(ip, { windowStart: now, count: 1 });
        return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
    }

    entry.count++;

    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
        return { limited: true, remaining: 0, retryAfter };
    }

    return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

// --- NORMALIZZATORE INTELLIGENTE MATERIE ---
// Risolve il problema del RAG che si "impunta" sulle differenze testuali.
// Mappa sinonimi e varianti (es. "Procedura Civile", "amministrativo") a un formato canonico.
function normalizeMateria(inputMateria) {
    if (!inputMateria) return null;
    const str = inputMateria.toLowerCase().trim();
    
    if (str.includes('amministrativ')) return 'Diritto Amministrativo';
    if (str.includes('costituzional')) return 'Diritto Costituzionale';
    
    // Processuale Penale
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('penal')) {
        return 'Diritto Processuale Penale';
    }
    // Processuale Civile
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('civil')) {
        return 'Diritto Processuale Civile';
    }
    // Sostanziale Penale
    if (str.includes('penal')) return 'Diritto Penale';
    // Sostanziale Civile
    if (str.includes('civil')) return 'Diritto Civile';
    
    // Ritorna la stringa formattata con la prima lettera maiuscola per altre materie
    return inputMateria.replace(/\b\w/g, l => l.toUpperCase());
}

// --- FUNZIONE RAG (RETRIEVAL-AUGMENTED GENERATION) ---
// Ritorna { contextText, sources } — contextText per il prompt, sources per il frontend
// USA: match_documents_hybrid RPC (vector 70% + full-text 30%, con metadata filtering)
// FALLBACK: match_rag_chunks (vector-only) se la hybrid RPC non è ancora deployata
async function fetchRAGContext(userMessageText, materiaFilter = null) {
    const googleKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    
    if (!process.env.SUPABASE_URL || !supabaseKey || !googleKey) {
        console.warn("[RAG] ⚠️ Configurazione incompleta (URL, Key o GoogleKey mancante). Salto RAG.");
        return null;
    }
    try {
        // 1. Genera l'embedding della query utente tramite Gemini
        const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${googleKey}`;
        const embedRes = await fetch(embedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text: userMessageText }] },
                outputDimensionality: 768
            })
        });
        const embedData = await embedRes.json();
        const vector = embedData.embedding?.values;
        if (!vector) return null;

        // 2. HYBRID SEARCH: vettore + full-text + metadata filtering
        const hybridUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/match_documents_hybrid`;
        const legacyUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/match_rag_chunks`;
        const rpcHeaders = {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        };

        // Due ricerche ibride parallele:
        // A) Broad search — trova i migliori match globali (vector+keyword)
        // B) Premium search — garantisce fonti autorevoli (SS.UU., Massimari, Riviste)
        let matches = [];
        let usedHybrid = false;

        try {
            const allResponses = await Promise.all([
                // A) Broad: tutto il corpus, soglia 0.30, top 12
                fetch(hybridUrl, {
                    method: 'POST',
                    headers: rpcHeaders,
                    body: JSON.stringify({
                        query_embedding: vector,
                        query_text: userMessageText,
                        match_count: 12,
                        match_threshold: 0.30
                    })
                }),
                // B) Premium: solo fonti di alta autorità, soglia bassa
                ...['teoria_massimario', 'nomofilachia_ssuu', 'sentenza_ssuu', 'massimario_cassazione'].map(tipo =>
                    fetch(hybridUrl, {
                        method: 'POST',
                        headers: rpcHeaders,
                        body: JSON.stringify({
                            query_embedding: vector,
                            query_text: userMessageText,
                            match_count: 2,
                            match_threshold: 0.25,
                            filter_tipo: tipo
                        })
                    })
                )
            ]);

            const broadRes = allResponses[0];
            const premiumResponses = allResponses.slice(1); // 4 risposte premium

            if (!broadRes.ok) throw new Error(`Hybrid RPC error ${broadRes.status}`);
            
            const broadMatches = await broadRes.json();
            const premiumResults = await Promise.all(
                premiumResponses.filter(r => r && r.ok).map(r => r.json())
            );
            
            // Unisci e de-duplica
            const seen = new Set();
            for (const m of [...broadMatches, ...premiumResults.flat()]) {
                if (!seen.has(m.id)) {
                    seen.add(m.id);
                    m.similarity = m.similarity || 0;
                    m.keyword_score = m.keyword_score || 0;
                    matches.push(m);
                }
            }
            usedHybrid = true;
            console.log(`[RAG] 🔀 HYBRID: Broad=${broadMatches.length}, Premium=${premiumResults.flat().length}, Merged=${matches.length}`);
        } catch (hybridErr) {
            // FALLBACK: se la hybrid RPC non è deployata, usa la vecchia vector-only
            console.warn(`[RAG] ⚠️ Hybrid RPC non disponibile (${hybridErr.message}), fallback a vector-only`);
            const fallbackRes = await fetch(legacyUrl, {
                method: 'POST',
                headers: rpcHeaders,
                body: JSON.stringify({
                    query_embedding: vector,
                    match_count: 10,
                    match_threshold: 0.55
                })
            });
            if (!fallbackRes.ok) {
                const errText = await fallbackRes.text();
                console.error(`[RAG] RPC match_rag_chunks errore ${fallbackRes.status}: ${errText.substring(0, 200)}`);
                return null;
            }
            matches = await fallbackRes.json();
            console.log(`[RAG] 🔍 VECTOR-ONLY (fallback): ${matches.length} risultati`);
        }
        
        if (matches && matches.length > 0) {
            let contextText = "\n\n<RAG_CONTEXT>\n";
            contextText += "⚠️ AVVERTENZA: I frammenti seguenti provengono dal database giurisprudenziale e dottrinale (Cassazione, Consiglio di Stato, TAR, Corte Costituzionale, Riviste). Alcuni documenti sono \"Schede VIP\" strutturate in 7-8 sezioni (Fatto, Contrasto, Massima, Ratio, Obiter, Spendibilità, Tags, Rete Sistematica): SFRUTTA TUTTE LE SEZIONI per costruire argomentazioni profonde. I codici numerici lunghi (es. 202401188) sono ID INTERNI del database, NON numeri di sentenza. NON citarli MAI come estremi giurisprudenziali.\n\n";
            // Re-ranking con boost per fonti autorevoli (tipo arriva dall'RPC)
            matches.forEach(m => {
                m.boostedScore = m.similarity;
                if (m.tipo === 'teoria_massimario') m.boostedScore *= 1.35;    // Riviste VIP
                if (m.tipo === 'massimario_cassazione') m.boostedScore *= 1.30; // Massimari Cassazione
                if (m.tipo === 'nomofilachia_ssuu') m.boostedScore *= 1.25;     // SS.UU. VIP
                if (m.tipo === 'sentenza_ssuu') m.boostedScore *= 1.20;         // SS.UU. schede
                // Boost per schede VIP strutturate (hand-crafted, alta densità semantica)
                if (m.tipo === 'sentenza_sez_semplici_vip') m.boostedScore *= 1.10;
                if (m.tipo === 'giurisprudenza_sez_semplici') m.boostedScore *= 1.10;
                if (m.tipo === 'sentenza_admin_vip') m.boostedScore *= 1.10;
                if (m.tipo === 'sentenza_cgt_vip') m.boostedScore *= 1.10;
                if (m.tipo === 'giurisprudenza_tributaria') m.boostedScore *= 1.10;
            });
            
            // Riordina per score boostato e prendi i top 8
            matches.sort((a, b) => b.boostedScore - a.boostedScore);
            const topMatches = matches.slice(0, 8);

            topMatches.forEach((m, i) => {
                let cleanContent = (m.content || '')
                    .replace(/^Documento:\s*\S+\s+\d{4}\s+\d+\s*\n?/m, '')
                    .replace(/\b(?:cds|tar[\w-]*)\s+\d{4}\s+\d{8,}\b/gi, '[riferimento registro GA]')
                    .replace(/\bNumero registro:\s*\d{8,}[^\n]*/gi, 'Numero registro: [codice interno — non citare]')
                    .replace(/\b20\d{7,}\b/g, '[cod. registro]')
                    .trim();
                
                let cleanTitolo = (m.titolo || '')
                    .replace(/\b(?:cds|tar[\w-]*)\s+\d{4}\s+\d{8,}\b/gi, '[Sentenza GA]')
                    .replace(/N\.\s*\d{8,}/g, 'N. [registro]');
                
                // Etichetta speciale per boost
                let sourceLabel = m.materia;
                if (m.tipo === 'teoria_massimario') sourceLabel = `📚 [RIVISTA VIP / DOTTRINA]`;
                else if (m.tipo === 'massimario_cassazione') sourceLabel = `📖 [MASSIMARIO DELLA CASSAZIONE]`;
                else if (m.tipo === 'nomofilachia_ssuu') sourceLabel = `🏛️ [NOMOFILACHIA / SS.UU.]`;
                else if (m.tipo === 'sentenza_ssuu') sourceLabel = `⚖️ [SS.UU. CASSAZIONE]`;
                else if (m.tipo === 'sentenza_sez_semplici_vip' || m.tipo === 'giurisprudenza_sez_semplici') sourceLabel = `⚖️ [SCHEDA VIP — CASSAZIONE]`;
                else if (m.tipo === 'sentenza_admin_vip') sourceLabel = `🏛️ [SCHEDA VIP — GIUSTIZIA AMMINISTRATIVA]`;
                else if (m.tipo === 'sentenza_cgt_vip' || m.tipo === 'giurisprudenza_tributaria') sourceLabel = `⚖️ [SCHEDA VIP — GIUSTIZIA TRIBUTARIA]`;
                
                const label = cleanTitolo ? `${sourceLabel} - ${cleanTitolo}` : sourceLabel;
                contextText += `[Fonte ${i+1} (${(m.boostedScore*100).toFixed(1)}% match): ${label}]\n${cleanContent}\n\n`;
            });
            
            console.log(`[RAG] Recuperati ${matches.length} chunk, top ${topMatches.length} dopo boost. Top: ${topMatches[0].tipo} (${(topMatches[0].boostedScore*100).toFixed(1)}%)`);
            contextText += "</RAG_CONTEXT>\nISTRUZIONE: Usa questo contesto normativo per fondare le tue risposte. Cita SOLO articoli di legge e principi di diritto riportati testualmente. NON inventare numeri di sentenza. I codici lunghi tipo '202601187' sono ID interni, NON numeri di sentenza.\n";
            
            // Metadati delle fonti per il frontend (senza il contenuto completo per non appesantire la response)
            const sources = topMatches.map(m => ({
                tipo: m.titolo || 'documento',
                materia: m.materia || '',
                similarity: m.similarity || 0,
                snippet: (m.content || '').substring(0, 250)
            }));
            
            return { contextText, sources };
        }
    } catch (e) {
        console.error("[RAG] Errore durante estrazione contesto:", e.message);
    }
    return null;
}

// --- SANITIZZAZIONE PAYLOAD ---

function sanitizePayload(body) {
    const errors = [];

    // Rimossa whitelist rigida dei modelli perché saranno dinamici (Gemini/Claude test)
    if (!body.model || typeof body.model !== 'string') {
        errors.push(`Modello mancante o non valido.`);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        errors.push('Il campo "messages" è obbligatorio e deve essere un array non vuoto.');
    } else if (body.messages.length > MAX_MESSAGES) {
        errors.push(`Troppi messaggi (${body.messages.length}). Max: ${MAX_MESSAGES}.`);
    } else {
        // Valida msg
        for (let i = 0; i < body.messages.length; i++) {
            const msg = body.messages[i];
            if (!msg.role || msg.content == null) {
                errors.push(`Messaggio [${i}] mancante di role o content.`);
                break;
            }
            // Enforce lunghezza massima solo per messaggi utente/assistant (non system:
            // il system prompt può essere lungo perché include il nostro prompt + RAG context)
            if (msg.role !== 'system' && typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH) {
                errors.push(`Messaggio [${i}] troppo lungo (${msg.content.length} chars). Max: ${MAX_MESSAGE_LENGTH}.`);
                break;
            }
        }
    }

    if (errors.length > 0) return { valid: false, errors };

    const cleanPayload = {
        model: body.model,
        messages: body.messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : String(m.content)
        })),
        temperature: typeof body.temperature === 'number' ? Math.max(0, Math.min(2, body.temperature)) : 0.5
    };

    cleanPayload.max_tokens = typeof body.max_tokens === 'number' ? Math.min(body.max_tokens, MAX_TOKENS_LIMIT) : MAX_TOKENS_LIMIT;
    if (body.response_format && body.response_format.type === 'json_object') {
        cleanPayload.response_format = { type: 'json_object' };
    }

    return { valid: true, payload: cleanPayload };
}

// --- HANDLER PRINCIPALE ---
export default async function handler(req, res) {
    console.log(`\n[Proxy] 📥 RICHIESTA IN ARRIVO: ${req.method} | Provider: ${req.body?.provider || 'default'}`);
    
    // --- CORS: Origin Whitelist ---
    const origin = req.headers.origin || '';
    const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // --- CORS: Reject unauthorized origins ---
    if (!isOriginAllowed(origin)) {
        return res.status(403).json({ error: 'Origin non autorizzata.' });
    }

    // --- Rate Limiting ---
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateCheck = isRateLimited(ip);
    if (rateCheck.limited) {
        res.setHeader('Retry-After', rateCheck.retryAfter);
        return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche secondo.', retryAfter: rateCheck.retryAfter });
    }

    let ragSources = []; // Fonti RAG trovate, da restituire al frontend
    try {
        const provider = req.body.provider || 'openai'; // google | anthropic | openai
        const useRAG = req.body.useRAG === true;
        const validation = sanitizePayload(req.body);

        if (!validation.valid) {
            return res.status(400).json({ error: 'Payload non valido', details: validation.errors });
        }

        // --- Validazione Modello (anti-abuso costi) ---
        const allowedModels = MODEL_WHITELIST[provider] || [];
        if (allowedModels.length > 0 && !allowedModels.includes(validation.payload.model)) {
            return res.status(400).json({ 
                error: `Modello "${validation.payload.model}" non consentito per il provider "${provider}". Modelli ammessi: ${allowedModels.join(', ')}` 
            });
        }

        // --- METERING SERVER-SIDE (Anti-Abuso) ---
        const requestedFeature = req.body.feature; 
        if (!requestedFeature) {
            return res.status(400).json({ error: 'Payload rifiutato: Manca la feature. Sicurezza anti-abuso attivata.' });
        }
        
        // Bypass metering SOLO in sviluppo locale (server-side check, non spoofabile)
        const isLocalDev = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production';
        
        if (requestedFeature && !isLocalDev) {
            const authHeader = req.headers.authorization;
            
            if (authHeader) {
                // Utente autenticato → metering completo via Supabase DB
                const token = authHeader.replace('Bearer ', '');
                
                const supabaseUrl = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
                const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
                
                if (supabaseUrl && supabaseKey) {
                    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
                    
                    // Valida JWT per ottenere utente
                    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
                    if (userError || !userData?.user) {
                        return res.status(401).json({ error: 'Token scaduto o non valido.' });
                    }
                    const userId = userData.user.id;
                    
                    // Controlla il piano
                    const { data: profile } = await supabaseAdmin.from('profiles').select('tier').eq('id', userId).single();
                    const tier = (profile && profile.tier) || 'Free';
                    
                    const freeLimits = { aiCalls: 3, oralSessions: 0, tutorChats: 5, aiTraces: 0, pdfExports: 0, aiQuiz: 5, phantomTutor: 0 };
                    
                    if (tier === 'Free') {
                        const limit = freeLimits[requestedFeature];
                        if (limit === undefined) return res.status(400).json({ error: 'Feature non valida.' });
                        if (limit === 0) return res.status(403).json({ error: 'Feature esclusiva Pro.' });
                        
                        const now = new Date();
                        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                        
                        const { data: usageData } = await supabaseAdmin
                            .from('usage_metering')
                            .select(requestedFeature)
                            .eq('user_id', userId)
                            .eq('month', currentMonth)
                            .single();
                            
                        const currentUsage = usageData ? (usageData[requestedFeature] || 0) : 0;
                        if (currentUsage >= limit) {
                            return res.status(403).json({ error: 'Crediti mensili esauriti per questa funzionalità.' });
                        }
                        
                        // Incrementa il credito
                        const upsertPayload = { user_id: userId, month: currentMonth };
                        upsertPayload[requestedFeature] = currentUsage + 1;
                        await supabaseAdmin.from('usage_metering').upsert(upsertPayload, { onConflict: 'user_id, month' });
                    }
                }
            } else {
                // Ospite (nessun token) → in fase beta, lasciamo passare.
                // Il rate limiter in-memory (sopra) protegge già da abusi.
                console.warn(`[Proxy] Richiesta guest senza auth per feature "${requestedFeature}" — rate limiter only.`);
            }
        }

        // --- RAG INJECTION ---
        if (useRAG) {
            const requestedMateria = req.body.materia || null; // <--- Routing dinamico per materia
            const userMessages = validation.payload.messages.filter(m => m.role === 'user');
            const explicitRagQuery = typeof req.body.ragQuery === 'string' ? req.body.ragQuery.trim().substring(0, 300) : null;
            
            if (explicitRagQuery || userMessages.length > 0) {
                // Prende la query esplicita se presente, altrimenti l'ultimo messaggio dell'utente per la ricerca semantica
                const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';
                const queryText = explicitRagQuery || lastUserMessage;
                
                // Cerca nel DB usando il filtro materia (se presente)
                const ragResult = await fetchRAGContext(queryText, requestedMateria);
                
                if (ragResult) {
                    let systemMsg = validation.payload.messages.find(m => m.role === 'system');
                    if (systemMsg) {
                        systemMsg.content += `\n\n═══════════════════════════════════════════════\n📌 NOTA CRITICA: IL CONTESTO RAG QUI SOTTO È STATO RECUPERATO DAL DATABASE ED È A TUA DISPOSIZIONE.\nHai a disposizione ${ragResult.sources?.length || 'diversi'} frammenti normativi e giurisprudenziali pertinenti.\nUSA QUESTI DATI per fondare la tua risposta. Se contengono estremi di sentenze reali, PUOI citarli.\n═══════════════════════════════════════════════\n${ragResult.contextText}`;
                    } else {
                        validation.payload.messages.unshift({ role: 'system', content: `Sei un assistente giuridico esperto. ${ragResult.contextText}` });
                    }
                    ragSources = ragResult.sources || [];
                    console.log(`[RAG] Contesto iniettato con successo! (Materia: ${requestedMateria || 'Tutte'}, Fonti: ${ragSources.length})`);
                } else {
                    console.log(`[RAG] Nessun articolo trovato (Materia: ${requestedMateria || 'Tutte'}).`);
                }
            }
        }

        let fetchUrl;
        let fetchHeaders;
        let fetchBody;

        if (provider === 'google') {
            const googleKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
            if(!googleKey) throw new Error("GOOGLE_AI_KEY o GEMINI_API_KEY mancante");
            
            // L'endpoint OpenAI di Google non supporta la stringa gemini-2.0-flash (dà 404 cieco).
            // L'endpoint Nativo invece la supporta benissimo. Usiamo il nativo.
            let geminiModel = validation.payload.model || 'gemini-1.5-flash';
            fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleKey}`;
            fetchHeaders = {
                'Content-Type': 'application/json'
            };
            
            // Map messages from OpenAI format to Gemini native format
            let contents = [];
            let systemInstruction = null;
            
            validation.payload.messages.forEach(m => {
                if (m.role === 'system') {
                    systemInstruction = { parts: [{ text: m.content }] };
                } else {
                    contents.push({
                        role: m.role === 'user' ? 'user' : 'model',
                        parts: [{ text: m.content }]
                    });
                }
            });

            if(contents.length === 0) contents.push({role: 'user', parts: [{text: 'Inizia'}]});

            let geminiPayload = {
                contents: contents,
                generationConfig: {
                    temperature: validation.payload.temperature,
                    maxOutputTokens: validation.payload.max_tokens
                }
            };
            
            if (systemInstruction) {
                geminiPayload.systemInstruction = systemInstruction;
            }

            fetchBody = JSON.stringify(geminiPayload);
        } 
        else if (provider === 'anthropic') {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if(!anthropicKey) throw new Error("ANTHROPIC_API_KEY mancante");

            fetchUrl = 'https://api.anthropic.com/v1/messages';
            fetchHeaders = {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'prompt-caching-2024-07-31'
            };
            
            // Map to Anthropic format
            let systemInstruction = "";
            let mappedMessages = [];
            
            validation.payload.messages.forEach(m => {
                if (m.role === 'system') {
                    systemInstruction += m.content + "\n";
                } else {
                    mappedMessages.push({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content
                    });
                }
            });

            // Se l'array messaggi ora è vuoto (aveva solo un system prompt), aggiungi un dummy
            if(mappedMessages.length === 0) mappedMessages.push({role: 'user', content: 'Inizia.'});

            const anthropicPayload = {
                model: validation.payload.model,
                max_tokens: validation.payload.max_tokens,
                messages: mappedMessages
            };

            // Abilita Prompt Caching sul System Prompt
            if (systemInstruction.trim().length > 0) {
                anthropicPayload.system = [
                    {
                        type: "text",
                        text: systemInstruction.trim(),
                        cache_control: { type: "ephemeral" }
                    }
                ];
            }

            fetchBody = JSON.stringify(anthropicPayload);
        }
        else {
            // Default OpenAI
            const openaiKey = process.env.OPENAI_API_KEY;
            if(!openaiKey) throw new Error("OPENAI_API_KEY mancante");
            
            fetchUrl = 'https://api.openai.com/v1/chat/completions';
            fetchHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            };
            fetchBody = JSON.stringify(validation.payload);
        }

        // Esegui Chiamata Server-to-Server
        const response = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Proxy] Provider ${provider} Error (${response.status}):`, errorText.substring(0, 500));
            
            let detailedError = `Errore dal service provider AI (${provider}).`;
            try {
                const parsedError = JSON.parse(errorText);
                if (parsedError.error && parsedError.error.message) {
                    detailedError += ` Dettaglio: ${parsedError.error.message}`;
                }
            } catch(e) {
                if (errorText) detailedError += ` Dettaglio: ${errorText.substring(0, 150)}`;
            }

            return res.status(response.status >= 500 ? 502 : response.status).json({ 
                error: detailedError 
            });
        }

        const data = await response.json();

        // Normalizza Anthropic e Google in formato OpenAI
        let normalizedResponse = data;
        
        if (provider === 'google') {
            let contentText = "";
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
                contentText = data.candidates[0].content.parts.map(p => p.text).join("");
            }
            console.log(`[Proxy] Gemini response received: ${contentText.length} chars`);
            normalizedResponse = {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: contentText
                    }
                }],
                usage: {
                    total_tokens: (data.usageMetadata?.totalTokenCount) || 0
                }
            };
        }
        else if (provider === 'anthropic') {
            normalizedResponse = {
                choices: [{
                    message: { 
                        role: 'assistant', 
                        content: data.content && data.content[0] ? data.content[0].text : "" 
                    }
                }],
                usage: {
                    total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
                }
            };
        }

        // Aggiungi le fonti RAG alla response per il frontend
        if (ragSources.length > 0) {
            normalizedResponse.rag_sources = ragSources;
        }

        return res.status(200).json(normalizedResponse);

    } catch (error) {
        console.error('[Proxy] Internal Error:', error.message);
        return res.status(500).json({ error: 'System Error: ' + error.message });
    }
}
