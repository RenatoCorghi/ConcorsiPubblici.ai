/* ============================================================
   METERING.JS — Sistema di Usage Metering & Paywall
   
   Traccia l'utilizzo delle feature AI per tier (Free / Pro).
   Persiste i contatori in localStorage con reset mensile.
   Include gating settimanale per-categoria per briefing e lezioni.
   ============================================================ */

import { AppState } from './state.js';
import { APP_CONFIG } from './config.js';
import { showToast } from './utils.js';

// --- LIMITI PER TIER (mensili — safety net server-side) ---
// I limiti reali sono ora gestiti SETTIMANALMENTE sotto.
// Questi restano come cap mensile anti-abuso lato server.

const TIER_LIMITS = {
    Free: {
        aiCalls: 0,          // Correzioni AI: bloccate per Free
        oralSessions: 0,     // Sessioni orale AI: bloccate
        tutorChats: 0,       // Lezioni AI: bloccate per Free
        aiTraces: 0,         // Tracce generate dall'AI: bloccate
        pdfExports: 0,       // Export PDF: bloccato
        aiQuiz: 999,         // Quiz: gestito settimanalmente (10/settimana)
        phantomTutor: 0      // Correzione live silente: bloccata
    },
    Starter: {
        aiCalls: 1,          // 1 correzione tema (pacchetto di prova)
        oralSessions: 0,     // Non incluso
        tutorChats: 999,     // Per le lezioni socratiche (messaggi multipli)
        aiTraces: 0,         // Non incluso
        pdfExports: 0,       // Non incluso
        aiQuiz: 999,         // Quiz: gestito settimanalmente
        phantomTutor: 0      // Non incluso
    },
    Pro: {
        aiCalls: 999,        // Gestito settimanalmente (1/settimana)
        oralSessions: 999,   // Gestito settimanalmente
        tutorChats: 999,     // Per le lezioni (messaggi multipli)
        aiTraces: 999,       // Gestito settimanalmente
        pdfExports: 999,     // Incluso
        aiQuiz: Infinity,    // Quiz illimitati
        phantomTutor: 0      // Non ancora disponibile
    },
    Elite: {
        aiCalls: Infinity,
        oralSessions: Infinity,
        tutorChats: Infinity,
        aiTraces: Infinity,
        pdfExports: Infinity,
        aiQuiz: Infinity,
        phantomTutor: Infinity
    }
};

const FEATURE_LABELS = {
    aiCalls: 'Correzione Tema',
    oralSessions: 'Simulatore Orale',
    tutorChats: 'Lezione AI',
    aiTraces: 'Tracce AI',
    pdfExports: 'Export PDF',
    aiQuiz: 'Quiz AI',
    phantomTutor: 'Tutor in Tempo Reale'
};

const STORAGE_KEY = 'concorsi_metering';
const WEEKLY_STORAGE_KEY = 'concorsi_weekly_metering';

// --- WEEKLY LIMITS ---
// Gestiscono i limiti reali per Starter (one-shot) e Pro (settimanali)
const WEEKLY_CATEGORY_LIMITS = {
    Free: {
        briefing: 0,       // Bloccato (solo anteprima)
        lezione: 0,        // Bloccato (solo anteprima)
        lectio: 0,         // Bloccato (solo anteprima)
        correzione: 0,     // Bloccato
        quiz: 10           // 10 quiz totali a settimana
    },
    Starter: {
        briefing: 1,       // 1 debrief (pacchetto di prova, non resetta)
        lezione: 1,        // 1 lezione socratica
        lectio: 1,         // 1 lectio magistralis
        correzione: 1,     // 1 correzione tema
        quiz: 10           // 10 quiz a settimana
    },
    Pro: {
        briefing: 1,       // 1 debrief a settimana
        lezione: 1,        // 1 lezione socratica a settimana
        lectio: 1,         // 1 lectio magistralis a settimana
        correzione: 1,     // 1 correzione tema a settimana
        quiz: Infinity     // Quiz illimitati
    },
    Elite: {
        briefing: Infinity,
        lezione: Infinity,
        lectio: Infinity,
        correzione: Infinity,
        quiz: Infinity
    }
};


// --- HELPERS ---

/**
 * Calcola la settimana ISO corrente (es. "2026-W19")
 */
function _getCurrentWeek() {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now - jan1) / 86400000) + 1;
    const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// --- MODULO METERING ---

export const Metering = {

    /**
     * Controlla se l'utente corrente è un ospite (non registrato).
     */
    isGuest() {
        const p = AppState.userProfile;
        return !p || !p.id || p.id.startsWith('guest-');
    },

    /**
     * Verifica che l'utente sia registrato. Se è un ospite, mostra il modale
     * di registrazione con un messaggio specifico per la feature.
     * @param {string} featureLabel — Nome della feature (es. "Briefing Pre-Tema")
     * @returns {boolean} true se l'utente è registrato, false se è ospite
     */
    requireRegistration(featureLabel) {
        if (!this.isGuest()) return true;

        // Mostra il modale di auth con messaggio personalizzato
        const modal = document.getElementById('onboarding-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // Aggiorna il sottotitolo con il messaggio di gating
            const subtitle = document.getElementById('auth-subtitle');
            if (subtitle) {
                subtitle.innerHTML = `<span class="text-amber-400 font-bold">🔐 Registrazione richiesta</span><br><span class="text-gray-400">Per accedere a <strong>${featureLabel}</strong> devi creare un account gratuito. Bastano 30 secondi!</span>`;
            }
        }
        showToast(`Per usare ${featureLabel} devi registrarti (è gratuito!).`, "warning");
        return false;
    },

    // --- WEEKLY PER-CATEGORY METERING ---

    /**
     * Ottieni lo store settimanale per-categoria.
     */
    _getWeeklyStore() {
        const currentWeek = _getCurrentWeek();
        let store;
        try {
            store = JSON.parse(localStorage.getItem(WEEKLY_STORAGE_KEY));
        } catch (_) {
            store = null;
        }
        if (!store || store.week !== currentWeek) {
            store = { week: currentWeek, usage: {} };
            localStorage.setItem(WEEKLY_STORAGE_KEY, JSON.stringify(store));
        }
        return store;
    },

    _saveWeeklyStore(store) {
        localStorage.setItem(WEEKLY_STORAGE_KEY, JSON.stringify(store));
    },

    /**
     * Controlla se l'utente può usare una feature settimanale per una categoria.
     * @param {'briefing'|'lezione'} feature
     * @param {string} category — La materia (es. "Diritto Civile")
     * @returns {boolean}
     */
    canUseWeekly(feature, category) {
        const tier = this._getTier();
        const limits = WEEKLY_CATEGORY_LIMITS[tier] || WEEKLY_CATEGORY_LIMITS.Free;
        if (limits[feature] === Infinity) return true;

        const store = this._getWeeklyStore();
        const key = `${feature}_${category}`;
        return (store.usage[key] || 0) < limits[feature];
    },

    /**
     * Consuma un credito settimanale per feature+categoria.
     */
    consumeWeekly(feature, category) {
        const tier = this._getTier();
        const limits = WEEKLY_CATEGORY_LIMITS[tier] || WEEKLY_CATEGORY_LIMITS.Free;
        if (limits[feature] === Infinity) return;

        const store = this._getWeeklyStore();
        const key = `${feature}_${category}`;
        store.usage[key] = (store.usage[key] || 0) + 1;
        this._saveWeeklyStore(store);
    },

    /**
     * Mostra il paywall quando una feature settimanale è bloccata o esaurita.
     * Per Free: rimanda alla pagina pricing.
     * Per Starter/Pro: mostra il modale checkout.
     */
    showWeeklyPaywall(feature, category) {
        const tier = this._getTier();
        const limits = WEEKLY_CATEGORY_LIMITS[tier] || WEEKLY_CATEGORY_LIMITS.Free;
        const featureLabels = {
            briefing: 'Debrief Pre-Tema',
            lezione: 'Lezione Socratica',
            lectio: 'Lectio Magistralis',
            correzione: 'Correzione Tema',
            quiz: 'Quiz AI'
        };
        const label = featureLabels[feature] || category;

        if (limits[feature] === 0) {
            // Feature completamente bloccata per questo tier
            showToast(`🔒 ${label} è disponibile dal piano Starter in su. Scopri i piani!`, "warning");
            // Naviga alla pagina pricing
            setTimeout(() => {
                if (window.app && window.app.navigate) window.app.navigate('pricing');
            }, 500);
        } else {
            // Crediti settimanali esauriti
            showToast(`⏳ Hai già usato il tuo ${label} settimanale. Torna la prossima settimana o passa a un piano superiore!`, "warning");
            setTimeout(() => {
                var modal = document.getElementById('checkout-modal');
                if (modal) modal.classList.remove('hidden');
            }, 500);
        }
    },



    /**
     * Restituisce i dati di usage correnti dal localStorage.
     * Se il mese è cambiato, resetta i contatori.
     */
    _getStore() {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        let store;
        try {
            store = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (_) {
            store = null;
        }

        // Reset mensile o primo utilizzo
        if (!store || store.month !== currentMonth) {
            store = {
                month: currentMonth,
                usage: {
                    aiCalls: 0,
                    oralSessions: 0,
                    tutorChats: 0,
                    aiTraces: 0,
                    pdfExports: 0,
                    aiQuiz: 0
                }
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        }

        return store;
    },

    /**
     * Salva lo store aggiornato.
     */
    _saveStore(store) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    },

    /**
     * Email admin che hanno sempre accesso Elite (bypass tutti i limiti).
     */
    _ADMIN_EMAILS: [
        'renatocorghi80@gmail.com',
        // Aggiungi qui l'email di David quando la conosci
    ],

    /**
     * Restituisce il tier corrente dell'utente.
     * Admin whitelistati → sempre Elite.
     */
    _getTier() {
        // Cerca email da userProfile, cloud.user, o session Supabase
        const email = (
            AppState.userProfile?.email || 
            window.supabaseClient?._currentSession?.user?.email ||
            ''
        ).toLowerCase();
        if (email && this._ADMIN_EMAILS.includes(email)) {
            return 'Elite';
        }
        return (AppState.userProfile && AppState.userProfile.tier) || 'Free';
    },

    /**
     * Controlla se l'utente può usare una feature.
     * @param {string} feature — chiave della feature (es. 'aiCalls')
     * @returns {boolean}
     */
    canUse(feature) {
        const tier = this._getTier();
        const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;
        const limit = limits[feature];

        // Pro = nessun limite
        if (limit === Infinity) return true;

        // Feature completamente bloccata
        if (limit === 0) return false;

        // Controlla contatore
        const store = this._getStore();
        return (store.usage[feature] || 0) < limit;
    },

    /**
     * Consuma un credito per la feature.
     * @param {string} feature
     */
    consume(feature) {
        const tier = this._getTier();
        const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;

        // Pro non traccia
        if (limits[feature] === Infinity) return;

        const store = this._getStore();
        store.usage[feature] = (store.usage[feature] || 0) + 1;
        this._saveStore(store);
    },

    /**
     * Restituisce un oggetto con usage e limiti per il rendering UI.
     * @returns {{ feature: string, used: number, limit: number, label: string }[]}
     */
    getUsageSummary() {
        const tier = this._getTier();
        const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;
        const store = this._getStore();

        return Object.keys(FEATURE_LABELS).map(feature => ({
            feature,
            label: FEATURE_LABELS[feature],
            used: store.usage[feature] || 0,
            limit: limits[feature],
            remaining: limits[feature] === Infinity
                ? Infinity
                : Math.max(0, limits[feature] - (store.usage[feature] || 0)),
            isBlocked: limits[feature] === 0,
            isPro: tier === 'Pro'
        }));
    },

    /**
     * Mostra il paywall quando una feature è esaurita.
     * @param {string} feature
     */
    showPaywall(feature) {
        const tier = this._getTier();
        const limits = TIER_LIMITS[tier] || TIER_LIMITS.Free;
        const limit = limits[feature];
        const label = FEATURE_LABELS[feature] || feature;

        if (limit === 0) {
            // Feature completamente bloccata per Free
            showToast(`🔒 ${label} è disponibile solo con il piano Pro.`, "warning");
        } else {
            // Crediti esauriti
            showToast(`⚡ Hai esaurito i crediti per ${label} questo mese (${limit}/${limit}). Passa a Pro per uso illimitato!`, "warning");
        }

        // Apri modale upgrade dopo un piccolo delay
        setTimeout(() => {
            var modal = document.getElementById('checkout-modal');
            if (modal) modal.classList.remove('hidden');
        }, 500);
    },

    /**
     * Renderizza il widget di usage per la dashboard (solo Free).
     * @returns {string} HTML
     */
    renderUsageWidget() {
        const tier = this._getTier();
        if (tier === 'Pro') return '';

        const summary = this.getUsageSummary();
        const tracked = summary.filter(s => s.limit > 0 && s.limit !== Infinity);

        if (tracked.length === 0) return '';

        const bars = tracked.map(s => {
            const pct = Math.min(100, Math.round((s.used / s.limit) * 100));
            const color = pct >= 100 ? 'bg-red-500' : pct >= 66 ? 'bg-yellow-500' : 'bg-magis-500';
            const textColor = pct >= 100 ? 'text-red-400' : 'text-gray-400';
            return `
                <div class="flex items-center gap-3">
                    <span class="text-xs text-gray-400 w-28 shrink-0">${s.label}</span>
                    <div class="flex-grow bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div class="${color} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                    <span class="text-xs font-mono font-bold ${textColor} w-12 text-right">${s.used}/${s.limit}</span>
                </div>`;
        }).join('');

        return `
            <div class="border border-gray-800 rounded-2xl p-5 bg-gray-900/30 mb-6 fade-in">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <i data-lucide="gauge" class="w-3.5 h-3.5 text-magis-400"></i> Crediti Mensili (Piano Free)
                    </h3>
                    <button onclick="app.navigate('pricing')" class="text-[10px] text-magis-400 hover:text-magis-300 font-bold flex items-center gap-1 transition">
                        Passa a Pro <i data-lucide="arrow-right" class="w-3 h-3"></i>
                    </button>
                </div>
                <div class="space-y-2.5">
                    ${bars}
                </div>
            </div>`;
    }
};
