import { apiService } from '../api.js';
import { AppState } from '../state.js';
import { Metering } from '../metering.js';
import { Gamification } from '../gamification.js';
import { showToast, escapeHtml } from '../utils.js';
import { navigateToRoute } from '../router.js';

let currentQuizData = null;
let currentQuestionIndex = 0;
let userAnswers = []; // { selectedIdx: int, isCorrect: bool, questionObj: {} }

export const QuizController = {
    startGenerator: async function(materia) {
        if (!Metering.canUse('aiQuiz')) {
            return Metering.showPaywall('aiQuiz');
        }

        const apiKey = "proxy-protected";

        document.getElementById('quiz-loading').classList.remove('hidden');
        document.getElementById('quiz-setup-view').classList.add('opacity-50', 'pointer-events-none');

        const NUM_QUESTIONS = 5;
        const res = await apiService.generateQuiz(apiKey, materia, NUM_QUESTIONS);
        
        document.getElementById('quiz-loading').classList.add('hidden');
        document.getElementById('quiz-setup-view').classList.remove('opacity-50', 'pointer-events-none');

        if (res.success && res.data && res.data.domande && res.data.domande.length > 0) {
            Metering.consume('aiQuiz');
            
            currentQuizData = res.data;
            currentQuestionIndex = 0;
            userAnswers = [];
            
            document.getElementById('quiz-setup-view').classList.add('hidden');
            document.getElementById('quiz-active-view').classList.remove('hidden');
            
            this.renderQuestion();
        } else {
            showToast("Errore durante la generazione del quiz: " + (res.error || "Formato non valido"), "error");
        }
    },

    startQuizFromCase: async function() {
        if (!Metering.canUse('aiQuiz')) {
            return Metering.showPaywall('aiQuiz');
        }

        const apiKey = "proxy-protected";

        document.getElementById('quiz-loading').classList.remove('hidden');
        document.getElementById('quiz-setup-view').classList.add('opacity-50', 'pointer-events-none');

        const res = await apiService.generateQuizFromCase(apiKey, 5);

        document.getElementById('quiz-loading').classList.add('hidden');
        document.getElementById('quiz-setup-view').classList.remove('opacity-50', 'pointer-events-none');

        if (res.success && res.data && res.data.domande && res.data.domande.length > 0) {
            Metering.consume('aiQuiz');

            currentQuizData = res.data;
            currentQuestionIndex = 0;
            userAnswers = [];

            document.getElementById('quiz-setup-view').classList.add('hidden');
            document.getElementById('quiz-active-view').classList.remove('hidden');

            this.renderQuestion();
        } else {
            showToast("Errore: " + (res.error || "Nessuna sentenza trovata nel database."), "error");
        }
    },

    renderQuestion: function() {
        if (!currentQuizData || currentQuestionIndex >= currentQuizData.domande.length) {
            return this.showResults();
        }

        const q = currentQuizData.domande[currentQuestionIndex];
        
        const total = currentQuizData.domande.length;
        document.getElementById('quiz-progress-text').innerText = `${currentQuestionIndex + 1}/${total}`;
        document.getElementById('quiz-progress-bar').style.width = `${((currentQuestionIndex) / total) * 100}%`;
        
        // Banner caso reale (se presente)
        const casoBanner = document.getElementById('quiz-caso-banner');
        if (casoBanner) {
            if (currentQuizData.caso_reale && currentQuestionIndex === 0) {
                const c = currentQuizData.caso_reale;
                casoBanner.innerHTML = `
                    <div class="mb-4 p-3 rounded-xl border border-emerald-800/50 bg-emerald-950/30 text-xs">
                        <div class="flex items-center gap-2 mb-1">
                            <i data-lucide="scale" class="w-3.5 h-3.5 text-emerald-400"></i>
                            <span class="font-bold text-emerald-400 uppercase tracking-wider">Caso Reale</span>
                        </div>
                        <p class="text-gray-400">${escapeHtml(c.tipo)} n. ${escapeHtml(String(c.numero))}/${escapeHtml(String(c.anno))} — ${escapeHtml(c.sede)} — Esito: ${escapeHtml(c.esito || 'N/D')}</p>
                        <p class="text-gray-500 mt-1 line-clamp-2">${escapeHtml(c.oggetto || '')}</p>
                    </div>
                `;
                casoBanner.classList.remove('hidden');
                if (window.lucide) lucide.createIcons();
            } else if (!currentQuizData.caso_reale) {
                casoBanner.classList.add('hidden');
            }
        }
        
        document.getElementById('quiz-question-text').innerText = q.testo;
        const container = document.getElementById('quiz-options-container');
        
        // Render Options
        container.innerHTML = q.opzioni.map((opt, idx) => `
            <button onclick="app.selectQuizOption(${idx})" id="quiz-opt-${idx}" class="w-full text-left p-4 rounded-xl border border-gray-700 bg-gray-800/50 hover:bg-gray-700 hover:border-gray-500 text-gray-200 transition">
                ${escapeHtml(opt)}
            </button>
        `).join('');

        document.getElementById('quiz-next-btn').classList.add('hidden');
    },

    selectOption: function(idx) {
        const q = currentQuizData.domande[currentQuestionIndex];
        const isCorrect = (idx === parseInt(q.corretta));
        
        // Store answer (Exam style - no immediate feedback, just selection)
        userAnswers[currentQuestionIndex] = {
            selectedIdx: idx,
            isCorrect: isCorrect,
            questionObj: q
        };

        // Highlight Selection
        q.opzioni.forEach((_, i) => {
            const btn = document.getElementById(`quiz-opt-${i}`);
            btn.classList.remove('border-magis-500', 'bg-magis-900/30', 'ring-2', 'ring-magis-500/50');
            if (i === idx) {
                btn.classList.add('border-magis-500', 'bg-magis-900/30', 'ring-2', 'ring-magis-500/50');
            }
        });

        document.getElementById('quiz-next-btn').classList.remove('hidden');
    },

    nextQuestion: function() {
        if (!userAnswers[currentQuestionIndex]) return; // Non ha selezionato nulla
        
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuizData.domande.length) {
            this.renderQuestion();
        } else {
            document.getElementById('quiz-progress-bar').style.width = `100%`;
            this.showResults();
        }
    },

    showResults: function() {
        document.getElementById('quiz-active-view').classList.add('hidden');
        const resultsView = document.getElementById('quiz-results-view');
        resultsView.classList.remove('hidden');

        let correctCount = userAnswers.filter(a => a.isCorrect).length;
        let total = currentQuizData.domande.length;
        
        // Gamification
        let xpGained = correctCount * 20; 
        if (correctCount === total) xpGained += 50; // Perfect bonus
        Gamification.addXP(xpGained, "Quiz Completato");

        let recapHtml = userAnswers.map((ans, idx) => {
            const q = ans.questionObj;
            const isOk = ans.isCorrect;
            const colorClass = isOk ? 'text-green-400 border-green-500/30 bg-green-900/10' : 'text-red-400 border-red-500/30 bg-red-900/10';
            const icon = isOk ? '<i data-lucide="check-circle" class="w-5 h-5 mt-1 shrink-0"></i>' : '<i data-lucide="x-circle" class="w-5 h-5 mt-1 shrink-0"></i>';
            
            return `
                <div class="p-4 rounded-xl border ${colorClass} mb-4">
                    <div class="flex items-start gap-3">
                        ${icon}
                        <div>
                            <p class="text-sm font-bold text-gray-200 mb-2">${idx + 1}. ${escapeHtml(q.testo)}</p>
                            <p class="text-xs text-gray-400 mb-2">La tua risposta: <span class="font-semibold text-white">${escapeHtml(q.opzioni[ans.selectedIdx] || 'Nessuna')}</span></p>
                            ${!isOk ? `<p class="text-xs text-red-300 font-semibold mb-2">Risposta Giusta: ${escapeHtml(q.opzioni[q.corretta])}</p>` : ''}
                            <div class="mt-3 text-xs bg-gray-950/50 p-3 rounded border border-gray-800 text-gray-400 border-l-2 ${isOk ? 'border-l-green-500' : 'border-l-magis-500'}">
                                ${escapeHtml(q.spiegazione)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        resultsView.innerHTML = `
            <div class="text-center mb-8">
                <div class="w-20 h-20 bg-gray-900 rounded-full border-4 ${correctCount > total/2 ? 'border-green-500' : 'border-orange-500'} flex items-center justify-center mx-auto mb-4 shadow-xl">
                    <span class="text-2xl font-bold text-white">${correctCount}/${total}</span>
                </div>
                <h2 class="text-3xl font-bold text-white mb-2">Quiz Terminato!</h2>
                <p class="text-magis-400 font-bold">+${xpGained} XP Guadagnati</p>
            </div>
            
            <h3 class="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">Pagella e Spiegazioni</h3>
            <div class="max-h-[60vh] overflow-y-auto pr-2 pb-8">
                ${recapHtml}
            </div>
            
            <div class="mt-8 text-center pb-8">
                <button onclick="app.navigate('quiz')" class="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition">Fai un altro Quiz</button>
            </div>
        `;
        
        // Reinizializza le icone lucide nella nuova UI iniettata
        if (window.lucide) window.lucide.createIcons();
    },

    abort: function() {
        if(confirm('Vuoi davvero abbandonare il quiz in corso? Nessun XP verrà salvato.')){
            navigateToRoute('quiz');
        }
    }
};
