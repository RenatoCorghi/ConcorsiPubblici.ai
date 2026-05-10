/* ============================================================
   PROFILE.JS — Vista Profilo Personale
   ============================================================ */
import { AppState } from '../state.js';
import { Gamification } from '../gamification.js';
import { escapeHtml } from '../utils.js';

export function renderProfile() {
    const p = AppState.userProfile || {};
    const stats = AppState.stats || {};
    const isGuest = !p.id || p.id.startsWith('guest-');
    const isGoogleUser = !isGuest && window.cloud?.user?.app_metadata?.provider === 'google';
    
    const xpProgress = Gamification.getLevelProgress();
    const numProve = AppState.history?.length || 0;
    const avgVoto = numProve > 0 ? (AppState.history.reduce((a, b) => a + (b.voto || 0), 0) / numProve).toFixed(1) : '—';
    const quizCompletati = stats.badges?.filter(b => b.id?.includes('quiz'))?.length || 0;
    
    // Badge showcase
    const badgesHtml = (stats.badges || []).length > 0
        ? stats.badges.map(b => `
            <div class="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-xl">
                <span class="text-lg">${b.icon || '🏆'}</span>
                <div>
                    <p class="text-xs font-bold text-white">${escapeHtml(b.name || 'Badge')}</p>
                    <p class="text-[10px] text-gray-500">${b.date ? new Date(b.date).toLocaleDateString('it-IT') : ''}</p>
                </div>
            </div>
        `).join('')
        : '<p class="text-gray-600 text-sm italic col-span-2">Nessun badge ottenuto. Completa quiz e simulazioni per guadagnarne!</p>';

    return `
        <div class="max-w-3xl mx-auto py-8 px-4 fade-in">
            <!-- Profile Header Card -->
            <div class="relative bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl mb-8">
                <!-- Banner gradient -->
                <div class="h-32 bg-gradient-to-br from-magis-600 via-indigo-600 to-purple-700 relative">
                    <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-40"></div>
                    <div class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900 to-transparent"></div>
                </div>
                
                <!-- Avatar + Name overlay -->
                <div class="relative px-6 md:px-8 -mt-14 pb-6">
                    <div class="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">
                        <!-- Avatar -->
                        <div class="relative group">
                            <div class="w-24 h-24 rounded-2xl border-4 border-gray-900 shadow-2xl overflow-hidden bg-gray-800 ring-2 ring-magis-500/30">
                                <img id="profile-avatar-preview" src="${escapeHtml(p.avatar || 'https://i.pravatar.cc/150?u=guest')}" 
                                     alt="Avatar" class="w-full h-full object-cover" 
                                     onerror="this.src='https://i.pravatar.cc/150?u=fallback'">
                            </div>
                            ${!isGuest ? `
                            <label for="profile-avatar-upload" class="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition cursor-pointer flex items-center justify-center">
                                <i data-lucide="camera" class="w-6 h-6 text-white"></i>
                            </label>
                            <input type="file" id="profile-avatar-upload" accept="image/*" class="hidden" onchange="app.updateProfileAvatar(this)">
                            ` : ''}
                        </div>
                        
                        <!-- Name & Tier -->
                        <div class="flex-1 text-center sm:text-left mb-1">
                            <h1 class="text-2xl font-display font-bold text-white">${escapeHtml(p.name || 'Ospite Aspirante')}</h1>
                            <div class="flex items-center gap-2 justify-center sm:justify-start mt-1">
                                <span class="px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${p.tier === 'Pro' ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700'}">${escapeHtml(p.tier || 'Free')}</span>
                                <span class="text-xs text-gray-500">${escapeHtml(p.concorso || 'Magistratura')}</span>
                                ${isGoogleUser ? '<span class="text-[10px] text-gray-600 flex items-center gap-1"><i data-lucide="shield-check" class="w-3 h-3 text-green-500"></i>Google</span>' : ''}
                            </div>
                        </div>
                        
                        <!-- Edit button -->
                        <button onclick="app.toggleProfileEdit()" id="profile-edit-toggle" 
                                class="px-4 py-2 text-sm font-bold rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-magis-500 hover:bg-magis-500/10 transition flex items-center gap-2">
                            <i data-lucide="pencil" class="w-4 h-4"></i> Modifica
                        </button>
                    </div>
                    
                    <!-- Bio -->
                    <div class="mt-5">
                        <p id="profile-bio-display" class="text-sm text-gray-400 leading-relaxed ${p.bio ? '' : 'italic'}">${escapeHtml(p.bio || 'Nessuna bio impostata. Clicca "Modifica" per raccontare qualcosa di te!')}</p>
                    </div>
                </div>
            </div>

            <!-- Edit Panel (hidden by default) -->
            <div id="profile-edit-panel" class="hidden mb-8 bg-gray-900 border border-magis-500/30 rounded-3xl p-6 md:p-8 shadow-2xl shadow-magis-500/5 fade-in">
                <h3 class="text-lg font-display font-bold text-white mb-6 flex items-center gap-2">
                    <i data-lucide="user-cog" class="w-5 h-5 text-magis-400"></i> Modifica Profilo
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nome Visualizzato</label>
                        <input type="text" id="profile-edit-name" value="${escapeHtml(p.name || '')}" maxlength="40"
                               class="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-magis-500 transition placeholder-gray-600" 
                               placeholder="Il tuo nome...">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Concorso Target</label>
                        <select id="profile-edit-concorso" class="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-magis-500 transition">
                            ${['Magistratura', 'Avvocatura', 'Notariato', 'Segretari Comunali', 'Carriera Diplomatica'].map(c => 
                                `<option value="${c}" ${p.concorso === c ? 'selected' : ''}>${c}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Bio / Descrizione</label>
                        <textarea id="profile-edit-bio" rows="3" maxlength="250"
                                  class="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-magis-500 transition placeholder-gray-600 resize-none"
                                  placeholder="Racconta qualcosa di te, il tuo percorso, i tuoi obiettivi...">${escapeHtml(p.bio || '')}</textarea>
                        <p class="text-[10px] text-gray-600 mt-1 text-right"><span id="profile-bio-count">${(p.bio || '').length}</span>/250</p>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">URL Avatar (opzionale)</label>
                        <input type="url" id="profile-edit-avatar-url" value="${escapeHtml(p.avatar || '')}"
                               class="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:border-magis-500 transition placeholder-gray-600 text-xs"
                               placeholder="https://...">
                    </div>
                    <div class="flex items-end">
                        <p class="text-[10px] text-gray-600">Puoi anche caricare un'immagine cliccando sull'avatar in alto.</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-3 mt-6">
                    <button onclick="app.saveProfile()" class="px-6 py-3 bg-magis-600 hover:bg-magis-500 text-white font-bold rounded-xl transition shadow-lg shadow-magis-600/20 flex items-center gap-2">
                        <i data-lucide="save" class="w-4 h-4"></i> Salva Modifiche
                    </button>
                    <button onclick="app.toggleProfileEdit()" class="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl transition">
                        Annulla
                    </button>
                </div>
            </div>

            <!-- Stats Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                    <div class="w-10 h-10 rounded-xl bg-magis-500/10 flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="flame" class="w-5 h-5 text-magis-400"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">${stats.streak || 0}</p>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-1">Streak Giorni</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                    <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="star" class="w-5 h-5 text-indigo-400"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">${stats.xp || 0}</p>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-1">XP Totali</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="file-text" class="w-5 h-5 text-emerald-400"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">${numProve}</p>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-1">Prove Svolte</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                    <div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="trophy" class="w-5 h-5 text-amber-400"></i>
                    </div>
                    <p class="text-2xl font-bold text-white">${avgVoto}</p>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider font-bold mt-1">Media Voto</p>
                </div>
            </div>

            <!-- Level Progress -->
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-magis-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-magis-600/20">
                            <span class="text-white font-bold text-sm">${stats.level || 1}</span>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-white">Livello ${stats.level || 1}</p>
                            <p class="text-[10px] text-gray-500">${stats.xp || 0} XP totali</p>
                        </div>
                    </div>
                    <span class="text-xs text-magis-400 font-bold">${Math.round(xpProgress)}%</span>
                </div>
                <div class="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-magis-500 to-indigo-500 rounded-full transition-all duration-500" style="width: ${xpProgress}%"></div>
                </div>
                <p class="text-[10px] text-gray-600 mt-2">Completa quiz, simulazioni e lezioni per salire di livello</p>
            </div>

            <!-- Badges -->
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
                <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <i data-lucide="award" class="w-4 h-4 text-amber-400"></i> Badge Ottenuti
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    ${badgesHtml}
                </div>
            </div>

            <!-- Account Info -->
            ${!isGuest ? `
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                    <i data-lucide="shield" class="w-4 h-4 text-gray-400"></i> Account
                </h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-500">Email</span>
                        <span class="text-gray-300">${escapeHtml(window.cloud?.user?.email || '—')}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-500">Provider</span>
                        <span class="text-gray-300">${isGoogleUser ? 'Google OAuth' : 'Email/Password'}</span>
                    </div>
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-500">Piano</span>
                        <span class="text-gray-300 flex items-center gap-2">${escapeHtml(p.tier || 'Free')}
                            ${p.tier !== 'Pro' ? '<button onclick="app.upgradeTier()" class="text-[10px] text-magis-400 hover:text-magis-300 underline transition">Upgrade</button>' : ''}
                        </span>
                    </div>
                    <div class="border-t border-gray-800 pt-3 mt-3">
                        <button onclick="app.logout()" class="text-xs text-red-500/70 hover:text-red-400 transition flex items-center gap-1">
                            <i data-lucide="log-out" class="w-3 h-3"></i> Esci dall'account
                        </button>
                    </div>
                </div>
            </div>
            ` : `
            <div class="bg-gray-900 border border-magis-500/20 rounded-2xl p-6 text-center">
                <div class="w-14 h-14 rounded-2xl bg-magis-500/10 flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="user-plus" class="w-7 h-7 text-magis-400"></i>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Crea un account gratuito</h3>
                <p class="text-sm text-gray-400 mb-4 max-w-sm mx-auto">Registrati per salvare i tuoi progressi, personalizzare il profilo e accedere a tutte le funzionalità.</p>
                <button onclick="app.openAuthModal()" class="px-6 py-3 bg-magis-600 hover:bg-magis-500 text-white font-bold rounded-xl transition shadow-lg shadow-magis-600/20">
                    Registrati Ora
                </button>
            </div>
            `}
        </div>
    `;
}
