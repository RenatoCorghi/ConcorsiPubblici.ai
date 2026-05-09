/* ============================================================
   SIMULATION.JS — Vista editor simulazione esame scritto
   ============================================================ */

import { AppState, saveDraft } from '../state.js';
import { formatTime } from '../utils.js';
import { getTimerColorAndInfo } from '../timer.js';
import { SimulationController } from '../controllers/simulation.js';

export function renderSimulation() {
    if(!AppState.timer.active) {
        return '<div class="text-center p-12"><h2 class="text-2xl text-white">Nessuna simulazione attiva.</h2><button onclick="app.navigate(\'home\')" class="mt-4 text-magis-400 underline">Torna alla Home</button></div>';
    }
    
    // Otteniamo colore e stato testuale dal timer
    var info = getTimerColorAndInfo();
    var isCrisis = info.color === 'timerRed';
    
    return `
        <div class="fade-in max-w-4xl mx-auto flex flex-col h-[calc(100vh-120px)]">
            <!-- Header Editor & Timer -->
            <div class="flex justify-between items-center mb-6 bg-gray-900 p-4 rounded-xl border border-gray-800">
                <div class="flex items-center gap-4">
                     <button onclick="app.openWithdrawModal()" class="w-10 h-10 rounded-lg bg-gray-800 hover:bg-red-900/50 hover:text-red-400 text-gray-400 flex items-center justify-center transition" title="Ritirati">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                    <button onclick="app.toggleTimerPause()" class="w-10 h-10 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition" title="Pausa / Riprendi">
                        <i data-lucide="${AppState.timer.paused ? 'play' : 'pause'}" class="w-5 h-5"></i>
                    </button>
                    <div>
                        <div class="text-xs text-gray-500 uppercase font-bold tracking-wider">Simulazione in corso</div>
                        <div class="font-medium text-white text-sm">Tema di Diritto</div>
                    </div>
                </div>
                
                <!-- TIMER COMPONENT -->
                <div class="flex items-center gap-3 px-6 py-2 rounded-lg bg-gray-950 border border-gray-800 shadow-inner">
                    <div class="flex flex-col items-end">
                        <span class="text-[10px] uppercase font-bold text-gray-500">${info.label}</span>
                        <div class="text-3xl font-mono font-bold tracking-tighter text-${info.color} ${isCrisis ? 'pulse-fast text-shadow-red' : ''}" id="sim-timer-display">
                            ${formatTime(AppState.timer.remaining)}
                        </div>
                    </div>
                    <i data-lucide="clock" class="text-${info.color} w-6 h-6 ${isCrisis ? 'pulse-fast' : ''}"></i>
                </div>
            </div>

            <!-- Area di Testo / Editor -->
            <div class="flex-grow flex flex-col bg-[#0d1117] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden focus-within:border-gray-600 transition">
                <div class="border-b border-gray-800 p-2 flex gap-2 bg-gray-900 items-center px-4">
                    <div class="flex gap-1.5 mr-4">
                        <div class="w-3 h-3 rounded-full bg-red-500/50"></div>
                        <div class="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                        <div class="w-3 h-3 rounded-full bg-green-500/50"></div>
                    </div>
                    <!-- Mock Toolbar -->
                    <button class="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800"><i data-lucide="bold" class="w-4 h-4"></i></button>
                    <button class="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800"><i data-lucide="italic" class="w-4 h-4"></i></button>
                    <button class="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800"><i data-lucide="align-justify" class="w-4 h-4"></i></button>
                    
                    <div class="ml-auto flex items-center gap-4">
                        <!-- Phantom Tutor Toggle -->
                        <div class="flex items-center gap-2" title="Abilita il Tutor al fianco: ti invierà suggerimenti non invasivi se nota gravi errori mentre scrivi.">
                            <span class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Tutor AI</span>
                            <div class="relative inline-block w-8 py-2 align-middle select-none transition duration-200 ease-in cursor-pointer" onclick="app.togglePhantomTutor()">
                                <div class="w-8 h-4 bg-gray-700 rounded-full shadow-inner ${AppState.phantomTutorEnabled ? 'bg-magis-600' : ''}" id="phantom-tutor-track"></div>
                                <div class="absolute w-4 h-4 bg-white rounded-full shadow inset-y-0 left-0 flex items-center justify-center transition-transform duration-200 ease-in-out ${AppState.phantomTutorEnabled ? 'translate-x-full border-magis-500' : ''}" id="phantom-tutor-thumb">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Suggestion Button -->
                        <div class="relative">
                            <button id="phantom-suggestion-btn" onclick="app.showPhantomSuggestion()" class="hidden p-1.5 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-full transition pulse-fast" title="CiceroAI ha un suggerimento per te!">
                                <i data-lucide="lightbulb" class="w-4 h-4"></i>
                            </button>
                            <!-- Balloon -->
                            <div id="phantom-suggestion-balloon" class="hidden absolute top-10 right-0 w-64 bg-yellow-100 text-yellow-900 text-sm font-medium p-3 rounded-xl shadow-xl z-50 border border-yellow-300">
                                <div class="absolute -top-2 right-2 w-4 h-4 bg-yellow-100 border-t border-l border-yellow-300 transform rotate-45"></div>
                                <p id="phantom-suggestion-text" class="relative z-10 leading-relaxed"></p>
                                <button onclick="document.getElementById('phantom-suggestion-balloon').classList.add('hidden')" class="text-yellow-700/50 hover:text-yellow-800 mt-2 text-xs font-bold uppercase tracking-wider relative z-10">Ho capito, grazie</button>
                            </div>
                        </div>

                        <div class="text-xs text-gray-500" id="word-count">0 parole</div>
                    </div>
                </div>
                
                <textarea id="exam-editor" class="editor-textarea flex-grow bg-transparent text-gray-200 p-8 text-lg w-full h-full font-serif" placeholder="Inizia a svolgere il tuo tema qui... (Salvato in bozze automaticamente)" oninput="app.handleEditorInput(this)"></textarea>
            </div>
            
            <!-- Azione Consegna -->
            <div class="mt-6 flex justify-end">
                <button onclick="app.autoSubmit()" class="px-8 py-3 bg-white text-gray-950 font-bold rounded-lg hover:bg-gray-200 transition shadow-lg shadow-white/10 flex items-center gap-2">
                    <i data-lucide="send" class="w-4 h-4"></i> Consegna Prova
                </button>
            </div>
        </div>
    `;
}

// Handler dedicato per l'input dell'editor — evita problemi con regex inline nell'HTML
let phantomTimeout = null;

export function handleEditorInput(textarea) {
    saveDraft(textarea.value);
    var words = textarea.value.trim().split(/\s+/).filter(function(x) { return x.length > 0; });
    var countEl = document.getElementById('word-count');
    if (countEl) countEl.innerText = words.length + ' parole';
    
    // Logica Phantom Tutor (Debounce 5s)
    if (AppState.phantomTutorEnabled && window.app && window.app.triggerPhantomTutor) {
        if (phantomTimeout) clearTimeout(phantomTimeout);
        
        // Chiudi eventuali balloon aperti
        var balloon = document.getElementById('phantom-suggestion-balloon');
        if (balloon) balloon.classList.add('hidden');
        
        phantomTimeout = setTimeout(() => {
            window.app.triggerPhantomTutor(textarea.value);
        }, 5000);
    }
}
