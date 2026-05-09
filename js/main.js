/* ============================================================
   MAIN.JS — Entry point: facade app, inizializzazione, error handling
   ============================================================ */

window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    // La logica UI di mostrare la card d'installazione è legata a home.js se questo event lancia prima o dopo del render
});


import { APP_CONFIG, migrateLocalStorageKeys } from './config.js';
import { AppState, saveDraft, initUserProfile, initHistoryState, initSrsState, saveSrsState, saveAiTracesState, initTutorChatState, initAiTracesState, skipTutorial as doSkipTutorial } from './state.js';
import { DB_TRACCE, GLOSSARIO_ISTITUTI, DB_COMMUNITY } from '../data.js';
import { cloud } from './cloud.js';
import { showToast, escapeHtml } from './utils.js';
import { apiService } from './api.js';
import { initTimerState, updateNavTimer } from './timer.js';
import { navigateToRoute, renderView, getRouteFromHash } from './router.js';
import { showIstitutoDettagli, showVIPDossierDettagli, showVIPChunkDettagli } from './views/glossario.js';
import { handleEditorInput } from './views/simulation.js';
import { SimulationController } from './controllers/simulation.js';
import { OraleController } from './controllers/orale.js';
import { AuthController } from './controllers/auth.js';
import { CommunityController } from './controllers/community.js';
import { Modals } from './views/modals.js';
import { Gamification } from './gamification.js';
import { TutorController } from './controllers/tutor.js';
import { LezioneController } from './controllers/lezione.js';
import { Metering } from './metering.js';
import { QuizController } from './controllers/quiz.js';
import { applyThemeColor } from './theme.js';
import { searchBandi, filterBandiCategoria, toggleBandiAperti, bandiPagina } from './views/bandi.js';

// --- ERROR BOUNDARY GLOBALE ---

window.onerror = function (msg, source, line, col, error) {
    console.error('[ConcorsiPubblici.AI Error]', msg, 'at', source, ':', line);
    showToast("Si è verificato un errore imprevisto. Ricarica la pagina se il problema persiste.", "error");
    return false; // Non sopprime l'errore nella console
};

window.addEventListener('unhandledrejection', function (event) {
    console.error('[ConcorsiPubblici.AI Promise Rejection]', event.reason);
    // Non mostrare toast per ogni promise rejection non gestita durante il caricamento iniziale
    if (document.readyState === 'complete') {
        showToast("Errore di rete o processamento. Controlla la connessione.", "error");
    }
});

// --- OGGETTO APP GLOBALE (facade per onclick nell'HTML) ---

export const app = {

    // Navigazione
    navigate: function (route) {
        if (AppState.currentRoute === 'simulation' && AppState.timer.active && route !== 'simulation') {
            var editor = document.getElementById('exam-editor');
            if (editor) saveDraft(editor.value);

            if (!confirm('Hai una simulazione in corso. La bozza è stata salvata. Vuoi davvero uscire?')) {
                return;
            }
        }

        navigateToRoute(route);
    },

    // Filtri
    setFilter: function (materia) { AppState.filterMateria = materia; renderView(); },

    // --- Delegation: Simulazione Scritto ---
    startSimulation: function (h, t, id) { SimulationController.startSimulation(h, t, id); },
    openBriefing: function (id) { SimulationController.openBriefing(id); },
    startSimulationFromBriefing: function (dur, isTest) { SimulationController.startSimulationFromBriefing(dur, isTest); },
    retryBriefing: function () { SimulationController.retryBriefing(); },
    autoSubmit: function () { SimulationController.autoSubmit(); },
    openWithdrawModal: function () { SimulationController.openWithdrawModal(); },
    closeWithdrawModal: function () { SimulationController.closeWithdrawModal(); },
    confirmWithdraw: function () { SimulationController.confirmWithdraw(); },
    toggleTimerPause: function () { SimulationController.toggleTimerPause(); },
    setResultTab: function (tab) { SimulationController.setResultTab(tab); },
    viewResult: function (resId) { SimulationController.viewResult(resId); },
    exportPDF: function () { SimulationController.exportPDF(); },
    shareResult: function () { SimulationController.shareResult(); },

    // --- Delegation: Orale ---
    speakTTS: function (text) { OraleController.speakTTS(text); },
    toggleDictation: function () { OraleController.toggleDictation(); },
    setOraleMateria: function (m) { OraleController.setOraleMateria(m); },
    setOraleMode: function (m) { OraleController.setOraleMode(m); },
    startOrale: function () { OraleController.startOrale(); },
    sendOraleMessage: function () { OraleController.sendOraleMessage(); },
    endOrale: function () { OraleController.endOrale(); },

    // --- Delegation: Auth & Settings ---
    toggleAuthMode: function () { AuthController.toggleAuthMode(); },
    submitAuth: function () { AuthController.submitAuth(); },
    loginAsGuest: function () { AuthController.loginAsGuest(); },
    loginWithGoogle: function () { AuthController.loginWithGoogle(); },
    logout: function () { AuthController.logout(); },
    openAuthModal: function () { AuthController.openAuthModal(); },
    saveUserProfile: function () { AuthController.saveUserProfile(); },
    upgradeTier: function () { AuthController.upgradeTier(); },
    joinWaitlist: function () {
        var emailInput = document.getElementById('waitlist-email');
        if (!emailInput || !emailInput.value.trim()) {
            showToast("Inserisci un'email valida.", "warning");
            return;
        }
        // In futuro: inviare a Supabase o Mailchimp
        showToast("Grazie! Ti avviseremo al lancio del piano Pro.", "success");
        var btn = document.getElementById('waitlist-btn');
        if (btn) { btn.innerText = '✅ Iscritto!'; btn.disabled = true; }
    },
    requestPushPermissions: function () { AuthController.requestPushPermissions(); },
    openAiModal: function () { AuthController.openAiModal(); },
    closeAiModal: function () { AuthController.closeAiModal(); },
    saveSettings: function () { AuthController.saveSettings(); },

    // --- Delegation: Community ---
    closeUserModal: function () { CommunityController.closeUserModal(); },
    openUserModal: function (id) { CommunityController.openUserModal(id); },
    setCommunityForumChannel: function (ch) { CommunityController.setCommunityForumChannel(ch); },
    setCommunityUsersFilter: function (f) { CommunityController.setCommunityUsersFilter(f); },
    openCommunityChat: function (id) { CommunityController.openCommunityChat(id); },
    sendCommunityMessage: function () { CommunityController.sendCommunityMessage(); },
    openNewPostModal: function () { CommunityController.openNewPostModal(); },
    closeNewPostModal: function () { CommunityController.closeNewPostModal(); },
    submitNewPost: function () { CommunityController.submitNewPost(); },
    likePost: function (id) { CommunityController.likePost(id); },

    // --- Glossario & SRS ---
    showIstituto: function (istituto, materia) { showIstitutoDettagli(istituto, materia); },
    showVIPDossier: function(filename, tipo) { showVIPDossierDettagli(filename, tipo); },
    showVIPChunk: function(chunkId) { showVIPChunkDettagli(chunkId); },
    
    filterGlossario: function(term) {
        const termLower = term.toLowerCase();
        const items = document.querySelectorAll('.glossario-item');
        const sections = document.querySelectorAll('.glossario-section');
        
        items.forEach(el => {
            const text = el.getAttribute('data-text').toLowerCase();
            if (text.includes(termLower)) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        });
        
        sections.forEach(sec => {
            const list = sec.querySelector('.glossario-list');
            const hasVisible = Array.from(sec.querySelectorAll('.glossario-item')).some(el => el.style.display !== 'none');
            sec.style.display = hasVisible ? 'block' : 'none';
            
            // Auto-espandi le sezioni se c'è una ricerca attiva
            if (termLower.trim().length > 0) {
                if (list) list.classList.remove('hidden');
                const icon = sec.querySelector('.icon-toggle');
                if (icon) { icon.setAttribute('data-lucide', 'chevron-down'); lucide.createIcons({ name: 'chevron-down' }); }
            } else {
                // Riporta chiuso se la ricerca è vuota
                if (list) list.classList.add('hidden');
                const icon = sec.querySelector('.icon-toggle');
                if (icon) { icon.setAttribute('data-lucide', 'chevron-right'); lucide.createIcons({ name: 'chevron-right' }); }
            }
        });
    },
    
    toggleGlossarioSection: function(el) {
        const list = el.nextElementSibling;
        const icon = el.querySelector('.icon-toggle');
        if (list.classList.contains('hidden')) {
            list.classList.remove('hidden');
            if (icon) icon.setAttribute('data-lucide', 'chevron-down');
        } else {
            list.classList.add('hidden');
            if (icon) icon.setAttribute('data-lucide', 'chevron-right');
        }
        lucide.createIcons();
    },

    answerSrs: function (istitutoNome, answerType) {
        // answerType: 'wrong' (1m), 'hard' (1d), 'easy' (4d interval based)
        var srsData = AppState.srs[istitutoNome] || { interval: 0, easeFactor: 2.5, repetitions: 0 };
        var now = new Date();
        var nextDate = new Date();

        if (answerType === 'wrong') {
            srsData.repetitions = 0;
            srsData.interval = 1 / (24 * 60); // 1 minuto (circa) espresso in giorni
            srsData.easeFactor = Math.max(1.3, srsData.easeFactor - 0.2);
            nextDate.setMinutes(now.getMinutes() + 1);
            showToast("Ripasso programmato tra 1 minuto", "error");
        } else if (answerType === 'hard') {
            srsData.repetitions = srsData.repetitions > 0 ? srsData.repetitions : 1;
            srsData.interval = 1;
            srsData.easeFactor = Math.max(1.3, srsData.easeFactor - 0.15);
            nextDate.setDate(now.getDate() + 1);
            showToast("Ripasso programmato tra 1 giorno", "warning");
        } else if (answerType === 'easy') {
            if (srsData.repetitions === 0) srsData.interval = 1;
            else if (srsData.repetitions === 1) srsData.interval = 4;
            else srsData.interval = Math.round(srsData.interval * srsData.easeFactor);

            srsData.repetitions++;
            srsData.easeFactor += 0.1;
            nextDate.setDate(now.getDate() + srsData.interval);
            showToast("Ottimo! Ripasso programmato tra " + srsData.interval + " giorni", "success");
        }

        srsData.nextReviewDate = nextDate.toISOString();
        AppState.srs[istitutoNome] = srsData;
        saveSrsState();

        // Se siamo nella view del glossario, re-renderizziamo
        if (AppState.currentRoute === 'glossario') {
            renderView();
        }

        // Chiude modale istituto se aperto
        var modal = document.getElementById('istituto-modal');
        if (modal) modal.classList.add('hidden');

        // --- Gamification ---
        if (answerType !== 'wrong') {
            Gamification.addXP(25, "Studio Glossario");
            AppState.stats.srsCount = (AppState.stats.srsCount || 0) + 1;
            if (AppState.stats.srsCount >= 10) {
                Gamification.checkBadge('enciclopedico');
            }
        }
    },

    // --- Editor Helpers ---
    handleEditorInput: function (t) { handleEditorInput(t); },

    // --- Phantom Tutor ---
    togglePhantomTutor: function() {
        AppState.phantomTutorEnabled = !AppState.phantomTutorEnabled;
        var track = document.getElementById('phantom-tutor-track');
        var thumb = document.getElementById('phantom-tutor-thumb');
        
        if (AppState.phantomTutorEnabled) {
            if(track) track.classList.add('bg-magis-600');
            if(thumb) thumb.classList.add('translate-x-full', 'border-magis-500');
            showToast("Tutor Attivo: Inizierà a monitorare quando fai delle pause.", "info");
        } else {
            if(track) track.classList.remove('bg-magis-600');
            if(thumb) thumb.classList.remove('translate-x-full', 'border-magis-500');
            
            var btn = document.getElementById('phantom-suggestion-btn');
            var balloon = document.getElementById('phantom-suggestion-balloon');
            if(btn) btn.classList.add('hidden');
            if(balloon) balloon.classList.add('hidden');
        }
    },
    
    showPhantomSuggestion: function() {
        var balloon = document.getElementById('phantom-suggestion-balloon');
        if (balloon) {
            balloon.classList.toggle('hidden');
        }
    },
    
    triggerPhantomTutor: async function(fullText) {
        if (!AppState.phantomTutorEnabled || !fullText || fullText.length < 50) return;
        
        const apiKey = "proxy-protected";
        
        // Estrai solo gli ultimi 500 caratteri per non intasare i token e rimanere sul contesto attuale
        var slice = fullText.slice(-500);
        var materia = AppState.currentSimulationTask ? AppState.currentSimulationTask.materia : "Diritto";
        
        try {
            var response = await apiService.checkLiveDraft(apiKey, slice, materia);
            
            var btn = document.getElementById('phantom-suggestion-btn');
            var balloon = document.getElementById('phantom-suggestion-balloon');
            var textEl = document.getElementById('phantom-suggestion-text');
            
            if (response.hasSuggestion) {
                if (textEl) textEl.innerText = response.message;
                if (btn) btn.classList.remove('hidden');
            } else {
                if (btn) btn.classList.add('hidden');
                if (balloon) balloon.classList.add('hidden');
            }
        } catch(e) {
            console.error(e);
        }
    },

    // --- Gamification UI ---
    toggleGamification: function () {
        const panel = document.getElementById('gamification-dropdown');
        if (panel) {
            panel.classList.toggle('hidden');
            // Smoothly scroll into view if opening
            if (!panel.classList.contains('hidden')) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                lucide.createIcons(); // Ensure icons are rendered
            }
        }
    },
    
    // --- AI Tutor ---
    toggleTutorChat: function() {
        TutorController.toggle();
    },
    tutorSendMessage: function(e) {
        TutorController.sendMessage(e);
    },

    // --- Lezione Magistrale ---
    startLezione: function() {
        LezioneController.start();
    },
    startLectio: function() {
        LezioneController.startLectio();
    },
    sendLezioneMessage: function(e) {
        LezioneController.sendMessage(e);
    },
    sendLezioneQuickAction: function(text) {
        LezioneController.quickAction(text);
    },
    resetLezione: function() {
        LezioneController.reset();
    },
    startLezioneFromTraccia: function() {
        LezioneController.startFromTraccia();
    },
    backToBriefing: function() {
        AppState.lezioneFromTraccia = false;
        navigateToRoute('briefing');
    },
    
    // --- Generazione Tracce AI ---
    confirmGenerateAiTrace: async function() {
        if (!Metering.canUse('aiTraces')) {
            document.getElementById('ai-trace-modal').classList.add('hidden');
            return Metering.showPaywall('aiTraces');
        }

        const mat = document.getElementById('ai-trace-materia').value;
        const apiKey = "proxy-protected";
        
        // Hide modal and show loader
        document.getElementById('ai-trace-modal').classList.add('hidden');
        const loader = document.getElementById('llm-loader-modal');
        const loaderText = document.getElementById('llm-loader-text');
        const loaderBar = document.getElementById('llm-loader-bar');
        
        if(loaderText) loaderText.innerText = 'Consultazione dello storico e generazione traccia...';
        if(loader) loader.classList.remove('hidden');
        if(loaderBar) loaderBar.style.width = '70%';
        
        try {
            // Build simple context
            let worstSubjectHistory = AppState.history.filter(h => h.id !== 'mock-1' && h.materia === mat);
            let weaknesses = "";
            if (worstSubjectHistory.length > 0) {
                // Focus slightly on words mentioned in feedbacks
                weaknesses = worstSubjectHistory.map(h => h.feedback).join(". ").substring(0, 500); 
            }
            
            let concorsoTarget = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Magistratura";
            
            var generatedTrace = await apiService.generateTrace(apiKey, mat, concorsoTarget, weaknesses);
            
            if (generatedTrace.success && generatedTrace.trace) {
                Metering.consume('aiTraces');
                // Push to AI traces
                var newTrace = {
                        id: 'ai-' + Date.now(),
                        materia: generatedTrace.trace.materia,
                        anno: 'OGGI / AI',
                        testo: generatedTrace.trace.testo,
                        elementi_chiave: generatedTrace.trace.elementi_chiave,
                        insidie: generatedTrace.trace.insidie,
                        estratta: false,
                        isAI: true,
                        saved: false
                    };
                    
                    AppState.aiTraces.unshift(newTrace);
                    // Rerender view
                    if (AppState.currentRoute === 'tracce') {
                        renderView();
                    }
                    showToast("Sartoria AI completata. Traccia generata sulle tue lacune!", "success");
            } else {
                showToast("Errore durante la sintesi della traccia.", "error");
            }
        } catch (e) {
             showToast("Errore di connessione.", "error");
        } finally {
            if(loader) loader.classList.add('hidden');
            if(loaderBar) loaderBar.style.width = '0%';
        }
    },
    
    toggleSaveAiTrace: function(id) {
        let trace = AppState.aiTraces.find(t => t.id === id);
        if (trace) {
            trace.saved = !trace.saved;
            saveAiTracesState();
            renderView();
            showToast(trace.saved ? "Traccia salvata nel tuo archivio!" : "Traccia non salvata permanentemente.");
        }
    },
    
    // --- Data Export & Analytics (History) ---
    exportHistoryCSV: function() {
        if (!Metering.canUse('pdfExports')) return Metering.showPaywall('pdfExports');
        Metering.consume('pdfExports');
        var data = AppState.history.filter(h => h.id !== 'mock-1');
        if (data.length === 0) {
            showToast("Nessuna prova disponibile da esportare.", "warning");
            return;
        }
        var headers = ["Data", "Materia", "Voto", "Correttezza", "Struttura", "Terminologia", "Pertinenza", "Lunghezza Testo"];
        var rows = data.map(function(h) {
            var date = new Date(h.date).toLocaleDateString('it-IT');
            var mat = h.materia || "N/A";
            var voto = h.voto || 0;
            var corr = h.metriche ? h.metriche.correttezza : 0;
            var stru = h.metriche ? h.metriche.struttura : 0;
            var term = h.metriche ? h.metriche.terminologia : 0;
            var pert = h.metriche ? h.metriche.pertinenza : 0;
            var len = h.text ? h.text.length : 0;
            return [date, mat, voto, corr, stru, term, pert, len].join(',');
        });
        
        var csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + "\n" + rows.join("\n");
        var encodedUri = encodeURI(csvContent);
        var link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "concorsi_ai_storico_" + Date.now() + ".csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Export CSV completato!", "success");
    },
    
    exportHistoryPDF: function() {
        if (!Metering.canUse('pdfExports')) return Metering.showPaywall('pdfExports');
        Metering.consume('pdfExports');
        var container = document.getElementById('main-content'); // Esporta l'intera history page per includere grafici
        if (!container || typeof html2pdf === 'undefined') {
            showToast("Errore di inizializzazione PDF.", "error");
            return;
        }
        
        showToast("Generazione PDF in corso...", "info");
        var opt = {
            margin: 10,
            filename: 'concorsi_ai_storico_' + Date.now() + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#030712' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(container).save().then(() => {
            showToast("PDF dello storico scaricato con successo!", "success");
        });
    },

    installPWA: async function() {
        if (!window.deferredPrompt) {
            showToast("L'app è già installata o il browser non lo supporta al momento.", "info");
            return;
        }
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User accepted PWA install');
            showToast("Installazione in corso...", "success");
            // Hide the prompt card in the UI
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.style.display = 'none';
        }
        window.deferredPrompt = null;
    },

    skipTutorial: function() {
        const el = document.getElementById('onboarding-tutorial');
        if(el) el.classList.add('hidden');
        doSkipTutorial();
        if (window.confetti) {
            window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }});
        }
    },

    // --- QUIZ METHODS ---
    startQuizGenerator: function(materia) {
        QuizController.startGenerator(materia);
    },
    startQuizFromCase: function() {
        QuizController.startQuizFromCase();
    },
    selectQuizOption: function(idx) {
        QuizController.selectOption(idx);
    },
    nextQuizQuestion: function() {
        QuizController.nextQuestion();
    },
    abortQuiz: function() {
        QuizController.abort();
    },

    // --- BANDI METHODS ---
    searchBandi: function() { searchBandi(); },
    filterBandiCategoria: function(cat) { filterBandiCategoria(cat); },
    toggleBandiAperti: function() { toggleBandiAperti(); },
    bandiPagina: function(dir) { bandiPagina(dir); },

    async init() {
        console.log("App Booting...");

        // 0. Esegui la migrazione delle chiavi localStorage (se necessaria)
        migrateLocalStorageKeys();

        try {
            await fetchRemoteData(); // Aspetta che tracce e glossario siano caricati da Supabase

            Modals.init();
            lucide.createIcons();
            initUserProfile();
            applyThemeColor(); // Applica i colori dinamici del concorso
            initTimerState();
            initHistoryState();
            initSrsState(); // Initialize SRS State
            
            // Initialize Tutor Chat & AI Traces
            initTutorChatState();
            initAiTracesState();
            TutorController.renderMessages();

            Gamification.updateStreak(); // Aggiorna la streak giornaliera
            checkDailyReminders(); // Invia Notifiche Locali

            if (window.cloud) cloud.initAuthListener();

            initNetworkListeners();

            AppState.currentRoute = getRouteFromHash();
            navigateToRoute(AppState.currentRoute);

            setInterval(updateNavTimer, 1000);

            console.log('%c' + APP_CONFIG.APP_NAME + ' v' + APP_CONFIG.APP_VERSION + ' initialized', 'color: #a78bfa; font-weight: bold; font-size: 14px;');
        } catch (e) {
            console.error('[ConcorsiPubblici.AI] Init Error:', e);
            document.getElementById('main-content').innerHTML = `
                <div class="text-center p-12 max-w-lg mx-auto bg-gray-900 border border-red-900/30 rounded-2xl shadow-2xl">
                    <div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i data-lucide="alert-circle" class="text-red-500 w-8 h-8"></i>
                    </div>
                    <h2 class="text-2xl font-display font-bold text-white mb-2">Errore di Caricamento</h2>
                    <p class="text-gray-400 text-sm mb-8">Si è verificato un problema tecnico durante l'inizializzazione dei moduli. Prova a riparare l'installazione locale.</p>
                    <div class="flex flex-col gap-3">
                        <button onclick="location.reload()" class="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition">Riprova</button>
                        <button onclick="localStorage.clear(); navigator.serviceWorker.getRegistrations().then(regs => { for(let r of regs) r.unregister(); }); setTimeout(() => location.reload(), 500);" 
                                class="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition shadow-lg shadow-red-600/20">Reset & Ripara (Clean Cache)</button>
                    </div>
                </div>`;
            if (window.lucide) lucide.createIcons();
        }
    }
};

// --- OGGETTO APP GLOBALE ---
// Solo le referenze usate direttamente in HTML onclick o da script non-module
window.app = app;
window.cloud = cloud;          // Usato in admin.js view e cloud.initAuthListener
window.escapeHtml = escapeHtml; // Usato in tutor._createMessageHTML
window.showToast = showToast;   // Usato dal Service Worker update handler
window.Modals = Modals;         // Usato nel cookie banner onclick
window.applyThemeColor = applyThemeColor; // Usato in settings

// --- INIZIALIZZAZIONE ---

import { fetchRemoteData } from '../data.js';

function initNetworkListeners() {
    function updateOnlineStatus() {
        var banner = document.getElementById('offline-banner');
        if (!navigator.onLine) {
            if (banner) banner.classList.remove('hidden');
            showToast("Sei disconnesso. L'app continuerà a funzionare offline.", "info");
        } else {
            if (banner) banner.classList.add('hidden');
            showToast("Connessione ripristinata!", "success");
        }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    if (!navigator.onLine) updateOnlineStatus();
}

function checkDailyReminders() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        const lastLogin = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.LAST_LOGIN);
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        if (lastLogin !== todayStr) {
            // Primo login del giorno, inviamo una notifica promo/reminder finta (in prod andrebbe gestita dal server)
            setTimeout(function () {
                var notification = new Notification(APP_CONFIG.APP_NAME, {
                    body: "Ben tornato! Non dimenticare di allenarti oggi per non perdere la tua streak 🔥.",
                    icon: "./icon-192.png"
                });
            }, 3000); // Ritardo leggero per evitare spam immediato
        }
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LAST_LOGIN, todayStr);
    }
}

// Avvia l'applicazione quando il DOM è pronto (in realtà module è defer default)
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM Ready. Starting App Init...');
    app.init();
});
