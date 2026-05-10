/* ============================================================
   CONFIG.JS — Configurazione centralizzata dell'applicazione
   ============================================================ */

export const APP_CONFIG = {
    // --- Supabase ---
    // Le credenziali DEVONO essere iniettate via env (Vercel / .env.local).
    // Se mancano, l'app fallisce esplicitamente — niente fallback hardcoded.
    SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL || (() => { console.error('❌ VITE_SUPABASE_URL mancante!'); return ''; })(),
    SUPABASE_KEY: import.meta.env?.VITE_SUPABASE_KEY || (() => { console.error('❌ VITE_SUPABASE_KEY mancante!'); return ''; })(),

    // --- Stripe ---
    STRIPE_PAYMENT_LINK: import.meta.env?.VITE_STRIPE_LINK || '',

    // --- AI Model Routing ---
    // Scegli lo stack attivo globale: 'google' oppure 'anthropic'
    ACTIVE_AI_STACK: 'anthropic',

    // Mappa dei task ai modelli da utilizzare. Sostituisci i placeholder con i nomi tecnici reali.
    AI_MODELS: {
        google: {
            CORR:   'gemini-3.1-pro-preview',  // Correzione temi profonda
            LESSON: 'gemini-3.1-pro-preview',  // Lezione Socratica + Lectio Magistralis
            CHAT:   'gemini-3-flash-preview',  // Tutor CiceroAI e Orale
            GEN:    'gemini-3-flash-preview'   // Generazione Quiz e Tracce
        },
        anthropic: {
            CORR:   'claude-opus-4-7',              // 🏆 Top: Debrief e Correzione temi
            LESSON: 'claude-opus-4-7',              // 🏆 Top: Lezione Socratica + Lectio Magistralis
            CHAT:   'claude-sonnet-4-6',            // ⚡ Mid: Tutor CiceroAI e Orale
            GEN:    'claude-haiku-4-5-20251001'     // 🚀 Fast: Quiz AI e generazione tracce
        }
    },

    // --- localStorage Keys (namespace unificato: concorsi_*) ---
    STORAGE_KEYS: {
        USER_PROFILE: 'concorsi_user',
        HISTORY: 'concorsi_history',
        TIMER: 'concorsi_timer',
        DRAFT: 'concorsi_draft',
        OPENAI_KEY: 'concorsi_openai_key',
        SRS_DATA: 'concorsi_srs_data',
        STATS: 'concorsi_stats',
        TUTOR_CHAT: 'concorsi_tutor_chat',
        AI_TRACES: 'concorsi_ai_traces',
        LAST_LOGIN: 'concorsi_last_login',
        METERING: 'concorsi_metering',
        COOKIE_CONSENT: 'concorsi_cookie_consent'
    },

    // --- Timer Defaults ---
    TIMER_SAVE_INTERVAL: 10,     // Ogni quanti secondi salvare il timer
    TIMER_HALF_THRESHOLD: 300,   // Durata minima (sec) per alert metà tempo
    TIMER_CRITICAL_SECS: 1800,   // 30 minuti in secondi

    // --- Valutazione ---
    VOTO_MIN: 0,
    VOTO_MAX: 20,
    MIN_WORDS_FOR_AI: 10,        // Minimo parole per attivare correzione AI

    // --- App Info ---
    APP_NAME: 'ConcorsiPubblici.ai',
    APP_VERSION: '1.4.1',
    CACHE_VERSION: 'concorsi-ai-v31'
};

/**
 * Migrazione automatica delle chiavi localStorage legacy.
 * Sposta i dati dalle vecchie chiavi (magistrati_*, magis_*) alle nuove (concorsi_*).
 * Eseguita una sola volta — le vecchie chiavi vengono cancellate dopo la copia.
 */
export function migrateLocalStorageKeys() {
    const migrations = [
        ['magistrati_user',       APP_CONFIG.STORAGE_KEYS.USER_PROFILE],
        ['magistrati_history',    APP_CONFIG.STORAGE_KEYS.HISTORY],
        ['magistrati_timer',      APP_CONFIG.STORAGE_KEYS.TIMER],
        ['magistrati_draft',      APP_CONFIG.STORAGE_KEYS.DRAFT],
        ['magistrati_openai_key', APP_CONFIG.STORAGE_KEYS.OPENAI_KEY],
        ['magistrati_srs_data',   APP_CONFIG.STORAGE_KEYS.SRS_DATA],
        ['magistrati_stats',      APP_CONFIG.STORAGE_KEYS.STATS],
        ['magis_tutor_chat',      APP_CONFIG.STORAGE_KEYS.TUTOR_CHAT],
        ['magis_ai_traces',       APP_CONFIG.STORAGE_KEYS.AI_TRACES],
        ['magis_last_login',      APP_CONFIG.STORAGE_KEYS.LAST_LOGIN],
    ];

    let migrated = 0;
    for (const [oldKey, newKey] of migrations) {
        const oldVal = localStorage.getItem(oldKey);
        if (oldVal !== null && localStorage.getItem(newKey) === null) {
            localStorage.setItem(newKey, oldVal);
            localStorage.removeItem(oldKey);
            migrated++;
        }
    }

    if (migrated > 0) {
        console.log(`[Migration] Migrate ${migrated} localStorage keys da legacy a concorsi_*.`);
    }
}
