/* ============================================================
   LEZIONE.JS — View: Lezione Magistrale Interattiva Pre-Tema
   ============================================================ */
import { AppState } from '../state.js';

export function renderLezione() {
    var concorso = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : 'Magistratura';
    
    // Se c'è una lezione in corso, renderizza la chat
    var chatHTML = '';
    if (AppState.lezioneChat && AppState.lezioneChat.length > 0) {
        chatHTML = AppState.lezioneChat.map(msg => _renderLezioneMsgHTML(msg)).join('');
    }

    return `
    <div class="max-w-4xl mx-auto p-4 md:p-8">
        
        <!-- Header -->
        <div class="mb-8">
            <div class="flex items-center gap-3 mb-2">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <i data-lucide="book-open" class="w-6 h-6 text-white"></i>
                </div>
                <div>
                    <h1 class="text-2xl font-display font-bold text-white">Lezione Magistrale</h1>
                    <p class="text-gray-400 text-sm">Preparazione guidata al tema con il Maestro</p>
                </div>
            </div>
        </div>

        <!-- Selettore Argomento (visibile solo se non c'è sessione attiva) -->
        <div id="lezione-setup" class="${AppState.lezioneChat && AppState.lezioneChat.length > 0 ? 'hidden' : ''}">
            <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 mb-6">
                <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <i data-lucide="search" class="w-5 h-5 text-amber-400"></i>
                    Scegli l'argomento della lezione
                </h2>
                <div class="mb-4">
                    <label class="block text-sm text-gray-400 mb-2">Materia</label>
                    <select id="lezione-materia" class="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 focus:border-transparent transition">
                        <option value="Tutte le materie">Tutte le materie (Interdisciplinare)</option>
                        <option value="Diritto Civile">Diritto Civile</option>
                        <option value="Diritto Penale">Diritto Penale</option>
                        <option value="Diritto Amministrativo">Diritto Amministrativo</option>
                        <option value="Diritto Processuale Civile">Diritto Processuale Civile</option>
                        <option value="Diritto Processuale Penale">Diritto Processuale Penale</option>
                        <option value="Diritto Costituzionale">Diritto Costituzionale</option>
                        <option value="Diritto dell'Unione Europea">Diritto dell'Unione Europea</option>
                    </select>
                </div>
                <div class="mb-4">
                    <label class="block text-sm text-gray-400 mb-2">Istituto o argomento specifico</label>
                    <input id="lezione-argomento" type="text" 
                        placeholder="Es: La responsabilità precontrattuale, Il concorso di persone nel reato..."
                        class="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 focus:border-transparent transition placeholder-gray-500">
                </div>
                <div class="mb-6">
                    <label class="block text-sm text-gray-400 mb-2">Modalità di lezione</label>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('ring-2','ring-amber-500'));this.classList.add('ring-2','ring-amber-500');window._lezione_mode='socratica'" 
                            class="mode-btn bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center hover:bg-gray-700 transition cursor-pointer ring-2 ring-amber-500">
                            <div class="text-xl mb-1">🎯</div>
                            <div class="text-white font-bold text-sm">Socratica</div>
                            <div class="text-gray-500 text-xs">Dialogo interattivo con domande</div>
                        </button>
                        <button onclick="document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('ring-2','ring-amber-500'));this.classList.add('ring-2','ring-amber-500');window._lezione_mode='lectio'" 
                            class="mode-btn bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center hover:bg-gray-700 transition cursor-pointer">
                            <div class="text-xl mb-1">📖</div>
                            <div class="text-white font-bold text-sm">Lectio Magistralis</div>
                            <div class="text-gray-500 text-xs">Monologo cattedratico, stile "noi/voi"</div>
                        </button>
                        <button onclick="document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('ring-2','ring-amber-500'));this.classList.add('ring-2','ring-amber-500');window._lezione_mode='smart'" 
                            class="mode-btn bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center hover:bg-gray-700 transition cursor-pointer">
                            <div class="text-xl mb-1">📚</div>
                            <div class="text-white font-bold text-sm">Lezione Smart</div>
                            <div class="text-gray-500 text-xs">Trattato asettico, stile Gazzoni</div>
                        </button>
                        <button onclick="document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('ring-2','ring-amber-500'));this.classList.add('ring-2','ring-amber-500');window._lezione_mode='tema'" 
                            class="mode-btn bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center hover:bg-gray-700 transition cursor-pointer">
                            <div class="text-xl mb-1">📝</div>
                            <div class="text-white font-bold text-sm">Simulazione Tema</div>
                            <div class="text-gray-500 text-xs">Svolgimento modello in stile glaciale</div>
                        </button>
                    </div>
                </div>
                <!-- Web Search Toggle (compact) -->
                <div class="mb-4 p-3 bg-gray-800/50 border border-gray-700/40 rounded-xl flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <i data-lucide="globe" class="w-4 h-4 ${AppState.webSearchEnabled ? 'text-blue-400' : 'text-gray-500'}"></i>
                        <div>
                            <span class="text-sm font-bold text-white">Ricerca Web</span>
                            <span class="text-[10px] text-gray-500 ml-1">(portali istituzionali)</span>
                        </div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer shrink-0">
                        <input type="checkbox" id="web-search-toggle-lezione"
                               ${AppState.webSearchEnabled ? 'checked' : ''}
                               onchange="app.toggleWebSearch(this.checked)"
                               class="sr-only peer">
                        <div class="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer 
                                    peer-checked:after:translate-x-full peer-checked:bg-blue-600 
                                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                    after:bg-white after:rounded-full after:h-4 after:w-4 
                                    after:transition-all transition-colors"></div>
                    </label>
                </div>
                <button id="lezione-start-btn" onclick="window._lezione_mode==='lectio' ? app.startLectio() : window._lezione_mode==='smart' ? app.startSmart() : window._lezione_mode==='tema' ? app.startTemaFromLezione() : app.startLezione()" 
                    class="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                    <i data-lucide="play" class="w-5 h-5"></i>
                    Inizia la Lezione
                </button>
            </div>
        </div>

        <!-- Area Chat Lezione -->
        <div id="lezione-chat-area" class="${!AppState.lezioneChat || AppState.lezioneChat.length === 0 ? 'hidden' : ''}">
            
            <!-- Barra Moduli Progress -->
            <div id="lezione-progress" class="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 mb-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-gray-400 font-bold uppercase tracking-wider">Avanzamento ${AppState.lezioneMeta?.isSmart ? 'Trattato' : 'Lezione'}</span>
                    <span id="lezione-modulo-label" class="text-xs text-amber-400 font-bold">${AppState.lezioneMeta?.isSmart ? 'Capitolo 1 di 5' : 'Modulo 1 di 7'}</span>
                </div>
                <div class="flex gap-1">
                    ${Array.from({ length: AppState.lezioneMeta?.isSmart ? 5 : 7 }, (_, i) => `
                        <div id="mod-bar-${i + 1}" class="h-1.5 rounded-full flex-1 bg-amber-500/30 transition-all duration-500">
                            <div class="h-full rounded-full bg-amber-500 transition-all duration-500" style="width:0%"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="flex justify-between mt-1.5 text-[9px] md:text-[10px] text-gray-500 gap-1 overflow-x-auto whitespace-nowrap">
                    ${AppState.lezioneMeta?.isSmart 
                        ? '<span>Inquadramento</span><span>Presupposti</span><span>Evoluzione</span><span>Nomofilachia</span><span>Applicazioni</span>'
                        : '<span>Aporia</span><span>Basi</span><span>Storia</span><span>Contrasti</span><span>Nomofilachia</span><span>Gancio/Processo</span><span>Matite Blu</span>'}
                </div>
            </div>

            <!-- Messaggi -->
            <div id="lezione-messages" class="space-y-4 mb-4 max-h-[60vh] overflow-y-auto scroll-smooth pr-2">
                ${chatHTML}
            </div>

            <!-- Input Utente -->
            <div class="sticky bottom-0 bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent pt-6 pb-2">
                <form id="lezione-input-form" onsubmit="app.sendLezioneMessage(event)" class="flex gap-2">
                    <input id="lezione-user-input" type="text" 
                        placeholder="Fai una domanda, chiedi un esempio, o scrivi 'Avanti' per proseguire..."
                        class="flex-1 bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 focus:border-transparent transition placeholder-gray-500 text-sm">
                    <button type="submit" class="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all transform hover:scale-105 shrink-0 flex items-center gap-1.5">
                        <i data-lucide="send" class="w-4 h-4"></i>
                    </button>
                </form>
                <div class="flex flex-wrap justify-between mt-3 gap-1">
                    <button onclick="app.sendLezioneQuickAction('Puoi farmi un esempio pratico?')" class="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded-lg hover:bg-gray-800/50">💡 Esempio pratico</button>
                    <button onclick="app.sendLezioneQuickAction('Avanti, prosegui con il prossimo modulo.')" class="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded-lg hover:bg-gray-800/50">⏭️ Prossimo modulo</button>
                    <button onclick="app.sendLezioneQuickAction('Puoi ripetere questo concetto in modo più semplice?')" class="text-xs text-gray-500 hover:text-amber-400 transition px-2 py-1 rounded-lg hover:bg-gray-800/50">🔄 Semplifica</button>
                    ${AppState.lezioneFromTraccia ? `
                    <button onclick="app.backToBriefing()" class="text-xs text-magis-400 hover:text-magis-300 transition px-3 py-1.5 rounded-lg bg-magis-500/10 border border-magis-500/20 hover:bg-magis-500/20 font-bold">✍️ Sono pronto, inizia il Tema!</button>
                    ` : ''}
                    <button onclick="app.resetLezione()" class="text-xs text-gray-500 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-gray-800/50">🗑️ Nuova lezione</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

function _renderLezioneMsgHTML(msg) {
    var formatted = (msg.content || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');

    if (msg.role === 'user') {
        return `
        <div class="flex flex-col max-w-[85%] ml-auto items-end">
            <div class="bg-amber-600/90 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-md">
                <p class="text-sm">${formatted}</p>
            </div>
        </div>`;
    } else {
        var isWaitMsg = msg.content.includes('Tempo stimato:') || msg.content.includes('Preparazione della');
        var ttsBtn = '';
        if (!isWaitMsg) {
            ttsBtn = `
            <div class="mt-4 pt-3 border-t border-gray-700/30">
                <button onclick="window.Lezione?.openLectureAtModule('${msg.id}')" 
                    class="tts-msg-btn w-full flex items-center justify-center gap-2 text-sm font-semibold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 hover:border-amber-400/60 transition-all duration-200 px-4 py-2.5 rounded-xl group"
                    title="Apri l'esperienza lezione su questo modulo">
                    <svg class="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
                    <span>🎧 Ascolta questo modulo</span>
                </button>
            </div>`;
        }

        return `
        <div class="flex gap-3 max-w-[95%]">
            <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-tr from-amber-600 to-orange-500 mt-1 shadow-lg shadow-amber-500/20">
                <i data-lucide="graduation-cap" class="w-4 h-4 text-white"></i>
            </div>
            <div class="bg-gray-800/80 border border-gray-700/50 text-gray-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-md relative leading-relaxed text-sm format-content">
                ${formatted}
                ${ttsBtn}
            </div>
        </div>`;
    }
}
