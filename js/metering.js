/* ============================================================
   METERING.JS — Sistema di Usage Metering & Paywall
   
   Traccia l'utilizzo delle feature AI per tier (Free / Pro).
   Persiste i contatori in localStorage con reset mensile.
   ============================================================ */

import { AppState } from './state.js';
import { APP_CONFIG } from './config.js';
import { showToast } from './utils.js';

// --- LIMITI PER TIER ---

const TIER_LIMITS = {
    Free: {
        aiCalls: 3,         // Correzioni AI scritte al mese
        oralSessions: 0,    // Sessioni orale AI (bloccato)
        tutorChats: 999,     // Messaggi tutor AI al mese (alto per sviluppo — server-side metering gestisce i limiti reali)
        aiTraces: 0,         // Tracce generate dall'AI (bloccato)
        pdfExports: 0,       // Export PDF (bloccato)
        aiQuiz: 5,           // Quiz generati dall'AI
        phantomTutor: 0      // Correzione live silente (bloccato)
    },
    Pro: {
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
    aiCalls: 'Correzioni AI',
    oralSessions: 'Simulatore Orale',
    tutorChats: 'Chat Tutor AI',
    aiTraces: 'Tracce AI',
    pdfExports: 'Export PDF',
    aiQuiz: 'Generazione Quiz AI',
    phantomTutor: 'Tutor in Tempo Reale'
};

const STORAGE_KEY = 'concorsi_metering';

// --- MODULO METERING ---

export const Metering = {

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
     * Restituisce il tier corrente dell'utente.
     */
    _getTier() {
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
