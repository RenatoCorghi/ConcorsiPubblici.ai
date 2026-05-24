import { AppState } from '../state.js';
import { clearDraft } from '../state.js';

export function renderAdmin() {
    // Array di email abilitate (God Mode)
    const adminEmails = [
        'renatocorghi80@gmail.com',
        'david.dimeo@gmail.com',
        'chantconte@gmail.com',
        'admin@concorsipubblici.ai'
    ];

    // Controllo di sicurezza lato Client 
    // (In produzione vera serve protezione lato Server API)
    if (!window.cloud || !cloud.user || !adminEmails.includes(cloud.user.email)) {
        return `
            <div class="h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <i data-lucide="shield-alert" class="w-16 h-16 text-red-500 mb-4"></i>
                <h1 class="text-3xl font-bold border-b border-red-500/30 pb-2 mb-4 text-white">Accesso Negato</h1>
                <p class="text-gray-400">Non hai i permessi per visualizzare l'area Ghost Recon.</p>
                <button onclick="app.navigate('home')" class="mt-6 px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition">Torna alla Base</button>
            </div>
        `;
    }

    // Qui siamo in God Mode
    return `
        <div class="max-w-6xl mx-auto py-8">
            <div class="flex items-center gap-4 mb-8 border-b border-gray-800 pb-4">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-lg shadow-red-600/20">
                    <i data-lucide="crosshairs" class="w-6 h-6 text-white"></i>
                </div>
                <div>
                    <h1 class="text-3xl font-bold font-display text-white">Admin God Mode</h1>
                    <p class="text-gray-400 text-sm">Pannello di controllo segregato per fondatori.</p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Card 1: Utente Attuale -->
                <div class="bg-gray-900 border border-red-900/50 rounded-2xl p-6 glass-panel relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-2 opacity-10"><i data-lucide="fingerprint" class="w-24 h-24 text-red-500"></i></div>
                    <h3 class="text-white font-bold mb-4 flex items-center gap-2"><i data-lucide="user-check" class="w-4 h-4 text-red-400"></i> Sessione Autenticata</h3>
                    <div class="space-y-2 text-sm">
                        <p class="text-gray-400">Email: <span class="text-white">${cloud.user.email}</span></p>
                        <p class="text-gray-400">ID: <span class="text-xs text-mono text-gray-500">${cloud.user.id}</span></p>
                        <p class="text-gray-400">Status DB Local: <span class="text-emerald-400 font-bold">${AppState.userProfile?.tier || 'N/A'}</span></p>
                    </div>
                </div>

                <!-- Card 2: Azioni Rapide Formattazione -->
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 glass-panel">
                    <h3 class="text-white font-bold mb-4 flex items-center gap-2"><i data-lucide="terminal" class="w-4 h-4 text-gray-400"></i> Debug Actions</h3>
                    <div class="space-y-3">
                        <button onclick="
                            localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.USER_PROFILE);
                            localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.METERING);
                            alert('Cache Utente e Limiti Azzerrati. Ricarica la pagina.');
                            window.location.reload();
                        " class="w-full py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900 rounded-lg text-sm transition">
                            <i data-lucide="trash-2" class="w-4 h-4 inline mr-1"></i> Nuke Local Storage (Self)
                        </button>
                        
                        <button onclick="
                            import('../gamification.js').then(m => m.Gamification.addXP(1000, 'God Mode Cheat'));
                        " class="w-full py-2 bg-purple-950/40 hover:bg-purple-900/60 text-purple-400 border border-purple-900 rounded-lg text-sm transition">
                            <i data-lucide="zap" class="w-4 h-4 inline mr-1"></i> Aggiungi 1000 XP
                        </button>
                    </div>
                </div>

                <!-- Card 3: Sviluppi Futuri -->
                <div class="bg-gray-900 border border-dashed border-gray-700 rounded-2xl p-6 glass-panel opacity-60 flex flex-col items-center justify-center text-center">
                    <i data-lucide="box" class="w-8 h-8 text-gray-500 mb-2"></i>
                    <h3 class="text-gray-300 font-bold mb-1">Modulo Modifica Tier</h3>
                    <p class="text-xs text-gray-500">In futuro, da qui potrai cercare gli utenti e flaggarli PRO bypassando Stripe.</p>
                </div>
            </div>
            <div class="mt-8 pt-8 border-t border-gray-800">
                <button onclick="app.navigate('home')" class="text-gray-500 hover:text-white transition flex items-center gap-2 text-sm"><i data-lucide="arrow-left" class="w-4 h-4"></i> Torna alla Home</button>
            </div>
        </div>
    `;
}
