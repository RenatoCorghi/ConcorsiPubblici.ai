/* ============================================================
   API HELPERS — Utility condivise per tutti i moduli API
   ============================================================ */
import { showToast } from '../utils.js';

/**
 * Helper centralizzato per gestire gli errori del proxy.
 * Mostra toast specifici per rate limiting, CORS, e errori server.
 */
export async function handleProxyError(response) {
    let errorMsg = 'Errore di comunicazione con il server AI.';
    try {
        const errData = await response.json();
        if (errData.error) errorMsg = errData.error;
    } catch (_) { /* json parse failed, use default */ }

    if (response.status === 429) {
        showToast("⏳ Troppe richieste. Attendi qualche secondo e riprova.", "warning");
    } else if (response.status === 403) {
        showToast("🚫 Accesso bloccato dal server.", "error");
    } else if (response.status === 400) {
        showToast("⚠️ Richiesta non valida: " + errorMsg, "error");
    } else {
        showToast("Errore AI: " + errorMsg, "error");
    }

    throw new Error(`Proxy ${response.status}: ${errorMsg}`);
}

/**
 * Corregge newline/tab letterali dentro stringhe JSON
 * che altrimenti romperebbero JSON.parse()
 */
export function fixJSONNewlines(str) {
    let inString = false;
    let result = '';
    for (let i = 0; i < str.length; i++) {
        let c = str[i];
        if (c === '"' && str[i - 1] !== '\\') {
            inString = !inString;
        }
        if (inString && c === '\n') {
            result += '\\n';
        } else if (inString && c === '\r') {
            // skip
        } else if (inString && c === '\t') {
            result += '\\t';
        } else {
            result += c;
        }
    }
    return result;
}

/**
 * Estrae il blocco JSON puro da una stringa che potrebbe
 * contenere markdown o testo prima/dopo il JSON.
 */
export function extractJSON(content) {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        content = content.substring(firstBrace, lastBrace + 1);
    }
    // Fix trailing commas (e.g. `}, ]` or `", }`)
    content = content.replace(/,\s*([\}\]])/g, '$1');
    return content;
}

/**
 * Helper per iniettare il token Supabase nelle richieste API
 */
export async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.supabaseClient) {
        const { data } = await window.supabaseClient.auth.getSession();
        if (data?.session?.access_token) {
            headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
    }
    return headers;
}

/**
 * Wrapper fetch con timeout automatico.
 * Previene fetch che pendono all'infinito quando il server o il provider
 * AI non rispondono. Lancia un AbortError se il timeout scade.
 * @param {string} url - URL della richiesta
 * @param {object} options - Opzioni fetch standard
 * @param {number} [timeoutMs=290000] - Timeout in ms (default ~5 min, appena sotto
 *   il maxDuration=300s di Vercel Pro: le generazioni lunghe Opus — magistrale,
 *   tema con max_tokens 8000 — possono superare i 2 minuti. Il server aborta a 280s,
 *   quindi il client (290s) riceve sempre una risposta/errore prima di scadere.
 * @returns {Promise<Response>}
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = 290000) {
    const controller = new AbortController();
    const existingSignal = options.signal;

    // Se il chiamante ha già un signal, combina entrambi
    if (existingSignal) {
        existingSignal.addEventListener('abort', () => controller.abort(existingSignal.reason));
    }

    const timeoutId = setTimeout(() => controller.abort(new DOMException('Timeout: il server non ha risposto in tempo.', 'TimeoutError')), timeoutMs);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
}
