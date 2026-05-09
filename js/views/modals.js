'use strict';
/* ============================================================
   MODALS.JS — Generazione dinamica di tutti i modali dell'app
   
   I modali vengono iniettati nel DOM on-demand da JS,
   eliminando ~150 righe di HTML statico da index.html.
   ============================================================ */



export const Modals = {
    /** Container globale dove vengono iniettati i modali */
    _container: null,

    /** Inizializza il container modali (chiamato una sola volta all'avvio) */
    init() {
        let container = document.getElementById('modals-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'modals-container';
            document.body.appendChild(container);
        }
        this._container = container;

        // Inietta i modali persistenti (loader, toast, withdraw)
        this._container.innerHTML = this._renderWithdrawModal()
            + this._renderLLMLoaderModal()
            + this._renderToastContainer()
            + this._renderOnboardingModal()
            + this._renderSettingsModal()
            + this._renderCheckoutModal()
            + this._renderAiTraceModal()
            + this._renderCookieBanner();

        if (window.lucide) lucide.createIcons();

        // Mostra cookie banner se non ancora accettato
        this._initCookieBanner();
    },

    // ============================================================
    // MODALE: Ritiro Esercitazione
    // ============================================================
    _renderWithdrawModal() {
        return `
        <div id="withdraw-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="app.closeWithdrawModal()"></div>
            <div class="relative bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 modal-entry">
                <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <i data-lucide="alert-triangle" class="text-red-500 w-6 h-6"></i>
                </div>
                <h3 class="text-xl font-display font-bold text-white mb-2">Confermi il ritiro?</h3>
                <p class="text-gray-400 text-sm mb-6">Se ti ritiri ora, la tua prova non verrà salvata e il timer verrà azzerato. Questa azione è irreversibile.</p>
                <div class="flex gap-3">
                    <button onclick="app.closeWithdrawModal()" class="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition text-sm">Annulla</button>
                    <button onclick="app.confirmWithdraw()" class="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition shadow-lg shadow-red-600/20 text-sm">Mi ritiro</button>
                </div>
            </div>
        </div>`;
    },

    // ============================================================
    // MODALE: Caricamento LLM (Spinner + Progress)
    // ============================================================
    _renderLLMLoaderModal() {
        return `
        <div id="llm-loader-modal" class="hidden fixed inset-0 z-[200] flex items-center justify-center">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md"></div>
            <div class="relative flex flex-col items-center max-w-md mx-auto text-center modal-entry">
                <div class="relative w-24 h-24 mb-8">
                    <div class="absolute inset-0 border-4 border-magis-500/30 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-magis-500 rounded-full border-t-transparent animate-spin"></div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <i data-lucide="brain-circuit" class="w-8 h-8 text-magis-400 pulse-fast"></i>
                    </div>
                </div>
                <h2 class="text-3xl font-display font-bold text-white mb-2">Consegna in corso...</h2>
                <div id="llm-loader-text" class="text-magis-300 font-medium h-6 pulse-fast transition-all duration-300">Inizializzazione Motore AI...</div>
                <div class="w-64 h-1.5 bg-gray-800 rounded-full mt-8 overflow-hidden">
                    <div id="llm-loader-bar" class="h-full bg-gradient-to-r from-magis-600 to-magis-400 w-0 transition-all duration-1000 ease-in-out"></div>
                </div>
            </div>
        </div>`;
    },

    // ============================================================
    // Toast Container
    // ============================================================
    _renderToastContainer() {
        return `<div id="toast-container" class="fixed bottom-6 right-6 z-[300] flex flex-col gap-3 pointer-events-none"></div>`;
    },

    // ============================================================
    // MODALE: Auth / Onboarding
    // ============================================================
    _renderOnboardingModal() {
        return `
        <div id="onboarding-modal" class="hidden fixed inset-0 z-[250] flex items-center justify-center fade-in">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md"></div>
            <div class="relative bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 modal-entry">
                <button onclick="document.getElementById('onboarding-modal').classList.add('hidden')" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                <h3 class="text-2xl font-display font-bold text-white mb-2">Cloud Access</h3>
                <p class="text-gray-400 text-sm mb-6" id="auth-subtitle">Accedi per salvare le tue simulazioni in Cloud su tutti i tuoi dispositivi.</p>
                
                <div class="space-y-4 mb-6">
                    <div id="auth-name-group" class="hidden">
                        <div class="mb-4">
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Nome Completo</label>
                            <input type="text" id="auth-name" class="w-full bg-gray-950 border border-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:border-magis-500 transition" placeholder="Mario Rossi">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Percorso di Studio</label>
                            <select id="auth-concorso" class="w-full bg-gray-950 border border-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:border-magis-500 transition">
                                <option value="Magistratura">Magistratura</option>
                                <option value="Avvocatura">Avvocatura</option>
                                <option value="Notariato">Notariato</option>
                                <option value="Commissari">Commissari di Polizia</option>
                                <option value="Dirigenti">Dirigenti PA</option>
                                <option value="Segretari Comunali">Segretari Comunali</option>
                                <option value="Carriera Diplomatica">Carriera Diplomatica</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Email</label>
                        <input type="email" id="auth-email" class="w-full bg-gray-950 border border-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:border-magis-500 transition" placeholder="mario@email.com">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Password</label>
                        <input type="password" id="auth-password" class="w-full bg-gray-950 border border-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:border-magis-500 transition" placeholder="********">
                    </div>
                </div>
                <button onclick="app.submitAuth()" id="auth-submit-btn" class="w-full py-3 rounded-lg bg-magis-600 hover:bg-magis-500 text-white font-bold transition shadow-lg shadow-magis-600/30 mb-4">Accedi al Cloud</button>
                <button onclick="app.toggleAuthMode()" id="auth-toggle-btn" class="w-full text-sm text-gray-400 hover:text-white transition mb-6">Non hai un account? Registrati</button>

                <div class="border-t border-gray-800 pt-4">
                    <p class="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-3 text-center">Oppure</p>
                    <button onclick="app.loginWithGoogle()" class="w-full py-2.5 rounded-lg border border-gray-700 hover:border-gray-500 bg-white hover:bg-gray-100 text-gray-800 font-semibold text-sm transition flex items-center justify-center gap-3 mb-3">
                        <svg class="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Continua con Google
                    </button>
                    <button onclick="app.loginAsGuest()" class="w-full py-2.5 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 font-semibold text-sm transition flex items-center justify-center gap-2">
                        <i data-lucide="user" class="w-4 h-4"></i> Prosegui come Ospite
                    </button>
                </div>
            </div>
        </div>`;
    },

    // ============================================================
    // MODALE: Settings (AI & Piattaforma)
    // ============================================================
    _renderSettingsModal() {
        return `
        <div id="ai-settings-modal" class="hidden fixed inset-0 z-[250] flex items-center justify-center fade-in">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" onclick="app.closeAiModal()"></div>
            <div class="relative bg-gray-900 border border-theme-glow p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 modal-entry">
                <button onclick="app.closeAiModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                <h3 class="text-2xl font-display font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="settings" class="w-6 h-6 text-magis-400"></i> Impostazioni</h3>
                <p class="text-gray-400 text-sm mb-6">Configura il tuo motore d'intelligenza artificiale e le preferenze del percorso.</p>
                <div class="space-y-4 mb-6">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Percorso Attuale</label>
                        <select id="settings-concorso" class="w-full bg-gray-950 border border-gray-800 text-white rounded-lg px-4 py-2 outline-none focus:border-magis-500 transition cursor-pointer">
                            <option value="Magistratura">Magistratura</option>
                            <option value="Avvocatura">Avvocatura</option>
                            <option value="Notariato">Notariato</option>
                            <option value="Commissari">Commissari di Polizia</option>
                            <option value="Dirigenti">Dirigenti PA</option>
                            <option value="Segretari Comunali">Segretari Comunali</option>
                            <option value="Carriera Diplomatica">Carriera Diplomatica</option>
                        </select>
                    </div>
                </div>
                <button onclick="app.saveSettings()" class="w-full py-3 btn-premium rounded-lg bg-magis-600 hover:bg-magis-500 text-white font-bold transition shadow-lg shadow-magis-600/30">Salva Impostazioni</button>
                <div class="mt-4 flex items-center justify-between">
                    <button onclick="app.navigate('legal'); app.closeAiModal();" class="text-[10px] text-gray-600 hover:text-gray-400 transition uppercase tracking-widest font-bold">Privacy & Legal Policy</button>
                    <button onclick="app.logout()" class="text-[10px] text-red-500/80 hover:text-red-400 transition uppercase tracking-widest font-bold flex items-center gap-1">
                        <i data-lucide="log-out" class="w-3 h-3"></i> Esci dall'account
                    </button>
                </div>
            </div>
        </div>`;
    },

    // ============================================================
    // MODALE: Upgrade Pro (Coming Soon / Waitlist)
    // ============================================================
    _renderCheckoutModal() {
        return `
        <div id="checkout-modal" class="hidden fixed inset-0 z-[300] flex items-center justify-center fade-in">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" onclick="document.getElementById('checkout-modal').classList.add('hidden')"></div>
            <div class="relative bg-gray-900 border border-magis-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 modal-entry flex flex-col">
                <button onclick="document.getElementById('checkout-modal').classList.add('hidden')" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                
                <div class="text-center mb-8">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-magis-600 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-magis-600/30">
                        <i data-lucide="rocket" class="w-8 h-8 text-white"></i>
                    </div>
                    <h3 class="text-2xl font-display font-bold text-white mb-2">ConcorsiPubblici.ai Pro</h3>
                    <p class="text-gray-400 text-sm">Stiamo preparando il piano Pro con pagamento sicuro via Stripe.<br/>Lascia la tua email per essere tra i primi ad accedere.</p>
                </div>

                <div class="space-y-4 mb-6">
                    <div class="grid grid-cols-1 gap-3">
                        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                            <i data-lucide="infinity" class="w-5 h-5 text-magis-400 shrink-0"></i>
                            <span class="text-sm text-gray-300">Simulazioni scritte illimitate</span>
                        </div>
                        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                            <i data-lucide="mic" class="w-5 h-5 text-magis-400 shrink-0"></i>
                            <span class="text-sm text-gray-300">Simulatore Orale AI</span>
                        </div>
                        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                            <i data-lucide="bot" class="w-5 h-5 text-magis-400 shrink-0"></i>
                            <span class="text-sm text-gray-300">Tutor Personale + Sartoria Tracce</span>
                        </div>
                        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                            <i data-lucide="download" class="w-5 h-5 text-magis-400 shrink-0"></i>
                            <span class="text-sm text-gray-300">Export PDF e CSV completi</span>
                        </div>
                    </div>
                </div>

                <div class="space-y-3">
                    <input type="email" id="waitlist-email" class="w-full bg-gray-950 border border-gray-800 text-white rounded-lg px-4 py-3 outline-none focus:border-magis-500 transition placeholder-gray-600" placeholder="La tua email per la waitlist...">
                    <button onclick="app.joinWaitlist()" id="waitlist-btn" class="w-full py-3 btn-premium rounded-lg bg-gradient-to-r from-magis-600 to-indigo-600 hover:from-magis-500 hover:to-indigo-500 text-white font-bold transition shadow-lg shadow-magis-600/30 flex items-center justify-center gap-2">
                        <i data-lucide="bell" class="w-4 h-4"></i> Avvisami al Lancio
                    </button>
                </div>
                
                <div class="mt-4 text-center text-[10px] text-gray-600">
                    Nessun addebito. Ti contatteremo solo per il lancio del piano Pro.
                </div>
            </div>
        </div>`;
    },

    // ============================================================
    // MODALE: Generazione Traccia AI
    // ============================================================
    _renderAiTraceModal() {
        return `
        <div id="ai-trace-modal" class="hidden fixed inset-0 z-[200] flex items-center justify-center fade-in">
            <div class="absolute inset-0 bg-black/80 backdrop-blur-md" onclick="document.getElementById('ai-trace-modal').classList.add('hidden')"></div>
            <div class="relative bg-gray-900 border border-magis-500/50 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 modal-entry">
                <button onclick="document.getElementById('ai-trace-modal').classList.add('hidden')" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-full bg-magis-600/20 flex items-center justify-center font-bold text-magis-400">
                        <i data-lucide="wand-2" class="w-5 h-5"></i>
                    </div>
                    <h3 class="text-2xl font-display font-bold text-white">Sartoria AI</h3>
                </div>
                <p class="text-gray-400 text-sm mb-6">Scegli la materia. CiceroAI analizzerà il tuo storico e forgerà una traccia inedita mirata esattamente sui tuoi punti deboli recenti.</p>
                
                <div class="space-y-4 mb-8">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Materia della Prova</label>
                        <select id="ai-trace-materia" class="w-full bg-gray-950 text-white rounded-lg px-4 py-3 border border-gray-800 focus:border-magis-500 outline-none appearance-none">
                            <option value="Civile">Diritto Civile</option>
                            <option value="Penale">Diritto Penale</option>
                            <option value="Amministrativo">Diritto Amministrativo</option>
                        </select>
                    </div>
                </div>

                <button onclick="app.confirmGenerateAiTrace()" class="w-full py-3 bg-gradient-to-r from-magis-600 to-indigo-600 hover:from-magis-500 hover:to-indigo-500 text-white rounded-lg font-bold transition shadow-lg shadow-magis-600/30 flex items-center justify-center gap-2">
                    <i data-lucide="zap" class="w-4 h-4"></i> Genera Traccia Inedita
                </button>
            </div>
        </div>`;
    },

    // ============================================================
    // BANNER: Cookie / GDPR Consent
    // ============================================================
    _renderCookieBanner() {
        return `
        <div id="cookie-banner" class="hidden fixed bottom-0 inset-x-0 z-[400] p-4 lg:p-6 pointer-events-none" style="padding-bottom: env(safe-area-inset-bottom, 16px);">
            <div class="pointer-events-auto max-w-2xl mx-auto bg-gray-900/95 backdrop-blur-xl border border-gray-800 rounded-2xl p-5 shadow-2xl shadow-black/50 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div class="flex-grow">
                    <h4 class="text-white font-bold text-sm mb-1 flex items-center gap-2">
                        <i data-lucide="cookie" class="w-4 h-4 text-magis-400"></i> Cookie e Privacy
                    </h4>
                    <p class="text-gray-400 text-xs leading-relaxed">
                        ConcorsiPubblici.ai utilizza cookie tecnici essenziali per il funzionamento della piattaforma e localStorage per salvare i tuoi progressi.
                        Non utilizziamo cookie di profilazione o di terze parti commerciali.
                        <button onclick="app.navigate('legal')" class="text-magis-400 hover:text-magis-300 underline transition ml-1">Leggi la policy</button>
                    </p>
                </div>
                <div class="flex gap-2 shrink-0 w-full sm:w-auto">
                    <button onclick="Modals.acceptCookies()" class="flex-1 sm:flex-none px-5 py-2.5 bg-magis-600 hover:bg-magis-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-magis-600/20">Accetto</button>
                    <button onclick="Modals.acceptCookies()" class="flex-1 sm:flex-none px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition">Solo essenziali</button>
                </div>
            </div>
        </div>`;
    },

    _initCookieBanner() {
        const accepted = localStorage.getItem('concorsi_cookie_consent');
        if (!accepted) {
            const banner = document.getElementById('cookie-banner');
            if (banner) {
                // Mostra con leggero delay per non coprire il primo render
                setTimeout(() => banner.classList.remove('hidden'), 1500);
            }
        }
    },

    acceptCookies() {
        localStorage.setItem('concorsi_cookie_consent', new Date().toISOString());
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.style.transition = 'opacity 0.4s, transform 0.4s';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(20px)';
            setTimeout(() => banner.classList.add('hidden'), 400);
        }
    }
};
