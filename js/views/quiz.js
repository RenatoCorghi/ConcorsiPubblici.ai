import { AppState } from '../state.js';
import { GLOSSARIO_ISTITUTI } from '../../data.js';

export function renderQuizView() {
    return `
        <div class="max-w-4xl mx-auto py-8 px-4 fade-in" id="quiz-container">
            <!-- Setup View -->
            <div id="quiz-setup-view" class="text-center">
                <div class="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-yellow-500/20">
                    <i data-lucide="list-todo" class="w-8 h-8 text-white"></i>
                </div>
                <h1 class="text-3xl font-bold text-white mb-2 font-display">Generatore Quiz AI</h1>
                <p class="text-gray-400 mb-8 max-w-lg mx-auto">Mettiti alla prova con domande a risposta multipla generate istantaneamente sulla materia che preferisci. Guadagna XP e rafforza la memoria.</p>

                <div class="bg-gray-900 border border-gray-800 rounded-3xl p-6 md:p-8 text-left max-w-md mx-auto shadow-2xl relative overflow-hidden">
                    <label class="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Materia del Quiz</label>
                    <select id="quiz-materia" class="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-magis-500 transition mb-6">
                        ${Object.keys(GLOSSARIO_ISTITUTI).map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>

                    <button onclick="app.startQuizGenerator(document.getElementById('quiz-materia').value)" class="w-full py-4 rounded-xl font-bold text-white bg-magis-600 hover:bg-magis-500 transition shadow-lg shadow-magis-600/30 flex items-center justify-center gap-2">
                        <i data-lucide="zap" class="w-5 h-5"></i> Quiz Teorico (5 Domande)
                    </button>

                    <div class="relative my-4">
                        <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-800"></div></div>
                        <div class="relative flex justify-center"><span class="bg-gray-900 px-3 text-xs text-gray-500 uppercase tracking-widest">oppure</span></div>
                    </div>

                    <button onclick="app.startQuizFromCase()" class="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 relative overflow-hidden">
                        <i data-lucide="scale" class="w-5 h-5"></i> Quiz da Caso Reale
                        <span class="ml-2 px-2 py-0.5 text-[9px] font-bold rounded-full bg-white/20 border border-white/30">NUOVO</span>
                    </button>
                    <p class="text-[11px] text-gray-600 text-center mt-2">Domande generate da sentenze vere della Giustizia Amministrativa</p>

                    <!-- Loading State -->
                    <div id="quiz-loading" class="hidden mt-8 text-center bg-gray-950/80 p-6 rounded-2xl border border-magis-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)] relative overflow-hidden">
                        <div class="absolute inset-0 bg-gradient-to-b from-transparent via-magis-500/10 to-transparent animate-scan-vertical"></div>
                        
                        <div class="relative w-20 h-20 mx-auto mb-5 flex items-center justify-center">
                            <div class="absolute inset-0 rounded-full border-4 border-gray-800 border-t-magis-500 animate-spin" style="animation-duration: 1s;"></div>
                            <div class="absolute inset-2 rounded-full border-4 border-gray-800 border-b-indigo-400 animate-spin" style="animation-duration: 1.5s; animation-direction: reverse;"></div>
                            <div class="absolute inset-4 rounded-full border-2 border-gray-800 border-l-cyan-400 animate-spin" style="animation-duration: 2s;"></div>
                            <i data-lucide="brain" class="w-6 h-6 text-magis-400 animate-pulse relative z-10"></i>
                        </div>
                        <h4 class="text-white font-bold mb-1 font-display text-lg">CiceroAI sta pensando...</h4>
                        <p id="quiz-loading-status" class="text-xs text-magis-200/70 mb-4 h-8 flex items-center justify-center transition-opacity duration-500">Connessione al modello AI in corso...</p>
                        
                        <!-- Progress dots -->
                        <div class="w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden mb-3">
                            <div class="h-full bg-gradient-to-r from-magis-500 via-indigo-500 to-magis-500 rounded-full animate-progress-shimmer"></div>
                        </div>
                        <p class="text-[10px] text-gray-600 mt-2">La generazione richiede circa 10-15 secondi</p>

                        <script>
                            (function() {
                                const msgs = [
                                    "Connessione al modello AI in corso...",
                                    "Analisi della materia selezionata...",
                                    "Formulazione di quesiti inediti...",
                                    "Creazione delle trappole logiche...",
                                    "Calibrazione del livello di difficoltà...",
                                    "Verifica della correttezza giuridica...",
                                    "Rifinitura delle spiegazioni...",
                                    "Quasi pronto, ultimi controlli..."
                                ];
                                let i = 0;
                                window._quizLoadingInterval = setInterval(() => {
                                    const el = document.getElementById('quiz-loading-status');
                                    if (!el) { clearInterval(window._quizLoadingInterval); return; }
                                    el.style.opacity = '0';
                                    setTimeout(() => {
                                        i = (i + 1) % msgs.length;
                                        el.textContent = msgs[i];
                                        el.style.opacity = '1';
                                    }, 400);
                                }, 3000);
                            })();
                        </script>

                        <style>
                            @keyframes scan-vertical {
                                0% { transform: translateY(-100%); }
                                100% { transform: translateY(100%); }
                            }
                            .animate-scan-vertical {
                                animation: scan-vertical 2s linear infinite;
                            }
                            @keyframes progress-shimmer {
                                0% { transform: translateX(-100%); width: 100%; }
                                50% { width: 60%; }
                                100% { transform: translateX(200%); width: 100%; }
                            }
                            .animate-progress-shimmer {
                                animation: progress-shimmer 2.5s ease-in-out infinite;
                            }
                        </style>
                    </div>
                </div>
            </div>

            <!-- Active Quiz View (Hidden by default) -->
            <div id="quiz-active-view" class="hidden max-w-2xl mx-auto align-middle">
                <!-- Progress Bar -->
                <div class="flex items-center gap-4 mb-8">
                    <button onclick="app.abortQuiz()" class="text-gray-500 hover:text-white transition"><i data-lucide="x" class="w-6 h-6"></i></button>
                    <div class="flex-grow bg-gray-800 h-3 rounded-full overflow-hidden">
                        <div id="quiz-progress-bar" class="bg-gradient-to-r from-magis-500 to-indigo-500 h-full rounded-full transition-all duration-300 w-0"></div>
                    </div>
                    <span id="quiz-progress-text" class="text-sm font-bold text-gray-400">1/5</span>
                </div>

                <div class="bg-gray-900 border border-gray-800 rounded-3xl p-6 md:p-10 shadow-2xl">
                    <div id="quiz-caso-banner" class="hidden"></div>
                    <h2 id="quiz-question-text" class="text-2xl font-bold text-white mb-8 leading-tight">Caricamento domanda...</h2>
                    
                    <div id="quiz-options-container" class="space-y-3">
                        <!-- Options injected via JS -->
                    </div>
                </div>
                
                <div class="mt-8 flex justify-end">
                    <button id="quiz-next-btn" onclick="app.nextQuizQuestion()" class="hidden px-8 py-4 bg-magis-600 hover:bg-magis-500 text-white font-bold rounded-xl shadow-lg transition">Continua</button>
                </div>
            </div>

            <!-- Results View (Hidden by default) -->
            <div id="quiz-results-view" class="hidden max-w-3xl mx-auto align-middle">
                <!-- Recap injected via JS -->
            </div>
        </div>
    `;
}
