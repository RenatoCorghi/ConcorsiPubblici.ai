/* ============================================================
   ROUTER.JS — Routing e rendering delle viste con Hash Router
   ============================================================ */
import { AppState, saveDraft, loadDraft } from './state.js';
import { renderHome } from './views/home.js';
import { renderTracce } from './views/tracce.js';
import { renderGlossario, initVIPDossiers } from './views/glossario.js';
import { renderSchedule } from './views/schedule.js';
import { renderSimulation } from './views/simulation.js';
import { renderResult } from './views/result.js';
import { renderHistory, initHistoryChart } from './views/history.js';
import { renderOraleSetup, renderOraleSession, renderOraleResult } from './views/orale.js';
import { renderPricing } from './views/pricing.js';
import { renderCommunityLayout } from './views/community.js';
import { renderLegal } from './views/legal.js';
import { renderAdmin } from './views/admin.js';
import { renderQuizView } from './views/quiz.js';
import { renderGiurisprudenza } from './views/giurisprudenza.js';
import { renderBandiView } from './views/bandi.js';
import { renderBriefing } from './views/briefing.js';
import { renderLezione } from './views/lezione.js';
import { renderProfile } from './views/profile.js';

// --- HASH ROUTER: supporta browser back/forward e deep-linking ---

export function getRouteFromHash() {
    var hash = window.location.hash.replace('#/', '').replace('#', '');
    
    // Ignora gli hash generati da Supabase OAuth (es. #access_token=...)
    // NON pulire l'URL qui — Supabase deve poterlo leggere per autenticarsi!
    if (hash.startsWith('access_token=') || hash.startsWith('error=') || hash.startsWith('type=')) {
        return 'home';
    }
    
    return hash || 'home';
}

export function navigateToRoute(route) {
    var newHash = '#/' + route;
    if (window.location.hash !== newHash) {
        window.location.hash = newHash;
    } else {
        // Se l'hash è già quello corretto, renderizza direttamente
        AppState.currentRoute = route;
        renderView();
    }
}

// Ascolta i cambiamenti di hash (back/forward button, link diretti)
window.addEventListener('hashchange', function() {
    var route = getRouteFromHash();
    
    // Protezione simulazione in corso
    if (AppState.currentRoute === 'simulation' && AppState.timer.active && route !== 'simulation') {
        var editor = document.getElementById('exam-editor');
        if (editor) saveDraft(editor.value);
    }
    
    AppState.currentRoute = route;
    renderView();
});

export function renderView() {
    var main = document.getElementById('main-content');
    
    // --- Route Exit Transition ---
    main.classList.add('route-exit');
    
    // Wait for exit animation to finish, then swap content
    setTimeout(function() {
        main.classList.remove('route-exit');
        main.innerHTML = '';
        
        _injectRouteContent(main);
        
        // --- Route Enter Transition ---
        main.classList.add('route-enter');
        setTimeout(function() { main.classList.remove('route-enter'); }, 350);
        
        // Scroll to top on route change
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        lucide.createIcons();
        updateActiveNav();
    }, 120); // Matches routeExit animation duration (150ms, slightly early for snappiness)
}

/**
 * Inietta il contenuto HTML della route corrente nel container principale.
 * Separato da renderView per chiarezza.
 */
function _injectRouteContent(main) {
    try {
    switch(AppState.currentRoute) {
        case 'home':
            main.innerHTML = renderHome();
            // Animate stat counters after render
            setTimeout(_animateCounters, 100);
            break;
        case 'tracce':
            main.innerHTML = renderTracce();
            break;
        case 'glossario':
            main.innerHTML = renderGlossario();
            initVIPDossiers();
            break;
        case 'schedule':
            main.innerHTML = renderSchedule();
            break;
        case 'simulation':
            main.innerHTML = renderSimulation();
            // Ripristina la bozza salvata
            var simEditor = document.getElementById('exam-editor');
            var savedDraft = loadDraft();
            if (simEditor && savedDraft) {
                simEditor.value = savedDraft;
                var wordCountEl = document.getElementById('word-count');
                if (wordCountEl) {
                    var words = savedDraft.trim().split(/\s+/).filter(function(x) { return x.length > 0; });
                    wordCountEl.innerText = words.length + ' parole';
                }
            }
            break;
        case 'result':
            main.innerHTML = renderResult();
            break;
        case 'orale-setup':
            main.innerHTML = renderOraleSetup();
            break;
        case 'orale-session':
            main.innerHTML = renderOraleSession();
            setTimeout(function() {
                var container = document.getElementById('orale-chat-container');
                if(container) container.scrollTop = container.scrollHeight;
            }, 50);
            break;
        case 'orale-result':
            main.innerHTML = renderOraleResult();
            break;
        case 'admin':
            main.innerHTML = renderAdmin();
            break;
        case 'quiz':
            main.innerHTML = renderQuizView();
            break;
        case 'history':
            main.innerHTML = renderHistory();
            initHistoryChart();
            break;
        case 'giurisprudenza':
            main.innerHTML = renderGiurisprudenza();
            break;
        case 'bandi':
            main.innerHTML = renderBandiView();
            break;
        case 'briefing':
            main.innerHTML = renderBriefing();
            break;
        case 'lezione':
            main.innerHTML = renderLezione();
            // Scroll automatico in basso per riprendere la conversazione da dove si era interrotta
            setTimeout(function() {
                var container = document.getElementById('lezione-messages');
                if (container) container.scrollTop = container.scrollHeight;

                // RIPRISTINA L'INDICATORE DI GENERAZIONE O IL TASTO CONTINUA
                if (window.Lezione) {
                    if (window.Lezione.isGenerating) {
                        window.Lezione.restoreActiveIndicator();
                    } else {
                        window.Lezione.restoreContinueButton();
                    }
                }
            }, 50);
            break;
        case 'pricing':
            main.innerHTML = renderPricing();
            break;
        case 'legal':
            main.innerHTML = renderLegal();
            break;
        case 'profile':
            main.innerHTML = renderProfile();
            break;
        case 'community-forum':
        case 'community-users':
        case 'community-dm':
        case 'community-leaderboard':
            main.innerHTML = renderCommunityLayout(AppState.currentRoute.replace('community-', ''));
            if (AppState.currentRoute === 'community-dm') {
                setTimeout(function() {
                    var container = document.getElementById('dm-chat-container');
                    if(container) container.scrollTop = container.scrollHeight;
                }, 50);
            }
            break;
    }
    } catch (viewError) {
        console.error(`[Router] Errore nel rendering della vista '${AppState.currentRoute}':`, viewError);
        main.innerHTML = `
            <div class="text-center p-12 max-w-lg mx-auto bg-gray-900 border border-red-900/30 rounded-2xl shadow-2xl mt-12">
                <div class="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="alert-triangle" class="text-red-500 w-7 h-7"></i>
                </div>
                <h2 class="text-xl font-display font-bold text-white mb-2">Errore di Rendering</h2>
                <p class="text-gray-400 text-sm mb-6">Si è verificato un problema nel caricamento di questa pagina. Prova a tornare alla dashboard.</p>
                <div class="flex gap-3 justify-center">
                    <button onclick="app.navigate('home')" class="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition">Dashboard</button>
                    <button onclick="location.reload()" class="px-6 py-2.5 bg-magis-600 hover:bg-magis-500 text-white rounded-lg font-bold transition">Ricarica</button>
                </div>
            </div>`;
    }
}

/**
 * Aggiorna lo stato visivo attivo nella navigazione (desktop + mobile).
 * Usa gli attributi data-route sui bottoni e la route corrente.
 */
function updateActiveNav() {
    var route = AppState.currentRoute;
    
    // Mappa route → nav route (per raggruppare sub-route)
    var navRoute = route;
    if (route.startsWith('community-')) navRoute = 'community-forum';
    if (route.startsWith('orale-')) navRoute = 'orale-setup';
    if (route === 'simulation' || route === 'result') navRoute = 'home';
    if (route === 'history' || route === 'schedule' || route === 'pricing') navRoute = 'home';
    if (route === 'lezione') navRoute = 'lezione';
    
    // Desktop nav buttons
    document.querySelectorAll('.nav-btn[data-route]').forEach(function(btn) {
        if (btn.dataset.route === navRoute) {
            btn.classList.add('nav-active');
        } else {
            btn.classList.remove('nav-active');
        }
    });
    
    // Mobile nav buttons
    document.querySelectorAll('.mobile-nav-btn[data-route]').forEach(function(btn) {
        if (btn.dataset.route === navRoute) {
            btn.classList.add('nav-active');
        } else {
            btn.classList.remove('nav-active');
        }
    });
}

/**
 * Anima i numeri nella dashboard con un effetto count-up fluido.
 * Cerca tutti gli elementi con classe .count-up e li anima da 0 al valore reale.
 */
function _animateCounters() {
    document.querySelectorAll('.count-up').forEach(el => {
        const target = parseInt(el.textContent, 10);
        if (isNaN(target) || target === 0) return;
        
        const duration = 1200; // ms
        const start = performance.now();
        
        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            el.textContent = Math.round(target * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }
        
        el.textContent = '0';
        requestAnimationFrame(tick);
    });
}
