/* ============================================================
   STATE.JS — Stato globale dell'applicazione e persistenza
   ============================================================ */
import { APP_CONFIG } from './config.js';

export const AppState = {
    currentRoute: 'home',
    filterMateria: 'Tutte',
    userProfile: null,
    currentSimulationTask: null,
    currentBriefing: null,
    
    // Timer state persisted in localStorage
    timer: {
        active: false,
        duration: 0,
        remaining: 0,
        lastTick: 0,
        halfAlertRaised: false,
        thirtyMinAlertRaised: false
    },
    
    intervalId: null,
    
    // History & Results
    history: [],
    currentResult: null,
    resultTab: 'correzione', // correzione, schema, confronto, elaborato
    
    // Oral Simulator State
    orale: {
        materia: null,
        mode: 'standard', // standard, commissione, incalzante
        messages: [],
        voto: null
    },

    // Community / Social State
    community: {
        activeTab: 'forum', // forum, users, dm
        forumFilterChannel: 'general',
        usersFilter: 'Tutti', // Tutti, Online, Magistratura
        activeUserModal: null,
        activeChatUser: null
    },

    // AI Tutor State
    tutorChat: [], // Insieme di messaggi pregressi del chatbot fluttuante
    aiTraces: [],  // Tracce generate dinamicamente dall'AI sulle lacune (se saved: true, sono persistenti)
    phantomTutorEnabled: false, // Toggle per la correzione live non invasiva
    tutorialSeen: false,

    // Spaced Repetition System
    srs: {},

    // --- Gamification & Progress ---
    stats: {
        xp: 0,
        level: 1,
        streak: 0,
        srsCount: 0, // Contatore recensioni glossario
        lastActivityDate: null, // YYYY-MM-DD
        badges: [] // {id, date, name, icon}
    }
};

// --- PERSISTENZA PROFILO UTENTE ---

export function initUserProfile() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.USER_PROFILE);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            AppState.userProfile = parsed;
            AppState.tutorialSeen = !!parsed.tutorialSeen;
            initStatsState(); // Inizializza le statistiche dopo il profilo
        } catch(e) { console.error("Error parsing User Profile", e); }
    } else {
        // Show onboarding modal
        const modal = document.getElementById('onboarding-modal');
        if(modal) modal.classList.remove('hidden');
    }
}

export function initStatsState() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.STATS);
    if (saved) {
        try {
            AppState.stats = JSON.parse(saved);
        } catch(e) { console.error("Error parsing Stats", e); }
    }
}

export function saveStatsState() {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.STATS, JSON.stringify(AppState.stats));
}

export function updateUserProfile(data) {
    AppState.userProfile = { ...AppState.userProfile, ...data, tutorialSeen: AppState.tutorialSeen };
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.USER_PROFILE, JSON.stringify(AppState.userProfile));
}

// --- PERSISTENZA STORICO PROVE ---

export function initHistoryState() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.HISTORY);
    if (saved) {
        try {
            AppState.history = JSON.parse(saved);
        } catch(e) { console.error("Error parsing History", e); }
    }
    
    // Al primo caricamento mock per far veder la dashboard popolata
    if (!AppState.history || AppState.history.length === 0) {
        AppState.history = [{
            id: 'mock-1',
            date: new Date().toISOString(),
            voto: 16.5,
            materia: 'Civile',
            text: 'Il candidato ha redatto un breve excursus storico-giuridico sulla nullità parziale e le sue conseguenze sull\'intero negozio. Tuttavia, manca un affondo sul ruolo dell\'interesse...',
            feedback: {
                positive: "Ottima inquadratura della nullità parziale e dei riferimenti pre-codice.",
                negative: "Scarsa analisi giurisprudenziale recente (Cass. SU mancate).",
                votoEspresso: 16.5,
                improvement: "Concentrarsi sulla regola di conservazione del contratto."
            },
            keywords: ["Nullità", "Vizi", "Interesse", "Conservazione"]
        }];
        saveHistoryState();
    }
}

export function saveHistoryState() {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.HISTORY, JSON.stringify(AppState.history));
}

// --- TUTORIAL / ONBOARDING ---
export function skipTutorial() {
    AppState.tutorialSeen = true;
    updateUserProfile(AppState.userProfile);
}

// --- AREA SRS (Spaced Repetition) ---

export function initSrsState() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.SRS_DATA);
    if (saved) {
        try {
            AppState.srs = JSON.parse(saved);
        } catch(e) { console.error("Error parsing SRS Data", e); }
    } else {
        AppState.srs = {}; // key: nome_istituto, value: { nextReviewDate, interval, easeFactor }
        saveSrsState();
    }
}

export function saveSrsState() {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.SRS_DATA, JSON.stringify(AppState.srs || {}));
}

// --- PERSISTENZA BOZZA SIMULAZIONE ---

export function saveDraft(text) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.DRAFT, text);
}

export function loadDraft() {
    return localStorage.getItem(APP_CONFIG.STORAGE_KEYS.DRAFT) || '';
}

export function clearDraft() {
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.DRAFT);
}

// --- PERSISTENZA TUTOR CHAT ---
export function initTutorChatState() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.TUTOR_CHAT);
    if (saved) {
        try { AppState.tutorChat = JSON.parse(saved); } catch(e) { AppState.tutorChat = []; }
    } else {
        AppState.tutorChat = [];
    }
}

export function saveTutorChatState() {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.TUTOR_CHAT, JSON.stringify(AppState.tutorChat));
}

// --- PERSISTENZA AI TRACES ---
export function initAiTracesState() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.AI_TRACES);
    if (saved) {
        try { 
            // Carica solo quelle marcate come salvate dall'utente in passato
            let traces = JSON.parse(saved);
            AppState.aiTraces = traces.filter(t => t.saved === true); 
        } catch(e) { AppState.aiTraces = []; }
    } else {
        AppState.aiTraces = [];
    }
}

export function saveAiTracesState() {
    // Al salvataggio pialla il DB mantenendo solo quelle esplicitamente salvate
    const toSave = AppState.aiTraces.filter(t => t.saved === true);
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.AI_TRACES, JSON.stringify(toSave));
}
