/* ============================================================
   TIMER.JS — Logica timer esame e persistenza
   ============================================================ */
import { APP_CONFIG } from './config.js';
import { AppState } from './state.js';
import { showToast, formatTime } from './utils.js';

export function initTimerState() {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.TIMER);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.active && parsed.remaining > 0) {
                // Calculate time passed while tab was closed only if not paused
                if (!parsed.paused) {
                    const now = Date.now();
                    const diffSecs = Math.floor((now - parsed.lastTick) / 1000);
                    parsed.remaining = Math.max(0, parsed.remaining - diffSecs);
                }
                parsed.lastTick = Date.now();
                
                AppState.timer = parsed;
                if (parsed.remaining === 0) {
                    // Time expired while offline
                    AppState.timer.active = false;
                } else {
                    startTimerLoop();
                }
            } else {
                AppState.timer.active = false;
            }
        } catch(e) { console.error("Error parsing Timer", e); }
    }
}

export function saveTimerState() {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.TIMER, JSON.stringify(AppState.timer));
}

export function startTimerLoop() {
    if (AppState.intervalId) clearInterval(AppState.intervalId);
    AppState.intervalId = setInterval(tick, 1000);
}

export function stopTimerLoop() {
    if (AppState.intervalId) clearInterval(AppState.intervalId);
}

function tick() {
    if (!AppState.timer.active || AppState.timer.paused) return;
    
    // Update State
    AppState.timer.remaining -= 1;
    AppState.timer.lastTick = Date.now();
    
    // Salva solo ogni 10 secondi per ridurre i write su localStorage
    var shouldSave = (AppState.timer.remaining % 10 === 0);
    
    // Alerts Trigger
    var duration = AppState.timer.duration;
    var remaining = AppState.timer.remaining;
    
    if (!AppState.timer.halfAlertRaised && remaining <= duration / 2 && duration > 300) {
        AppState.timer.halfAlertRaised = true;
        showToast("⏱️ ATTENZIONE: Sei a metà del tempo a disposizione!", "warning");
        shouldSave = true; // Salva su evento importante
    }
    if (!AppState.timer.thirtyMinAlertRaised && remaining <= 1800 && duration > 1800) {
        AppState.timer.thirtyMinAlertRaised = true;
        showToast("⚠️ CRITICO: Mancano solo 30 minuti alla consegna forzata!", "error");
        shouldSave = true;
    }
    
    if (shouldSave) saveTimerState();
    
    // Expiration
    if (remaining <= 0) {
        AppState.timer.remaining = 0;
        saveTimerState(); // Salva sempre su scadenza
        if(AppState.currentRoute === 'simulation' && window.app) {
            window.app.autoSubmit();
        } else {
            AppState.timer.active = false;
            saveTimerState();
            stopTimerLoop();
            showToast("Il tempo per la simulazione in background è scaduto. Elaborato consegnato in bianco/parziale.", "error");
        }
    }
    
    // Update view if simulation is active
    if (AppState.currentRoute === 'simulation') {
        var display = document.getElementById('sim-timer-display');
        if (display) {
            display.innerText = formatTime(remaining);
            var info = getTimerColorAndInfo();
            display.className = `text-3xl font-mono font-bold tracking-tighter text-${info.color} ${info.color === 'timerRed' ? 'pulse-fast text-shadow-red' : ''}`;
        }
    }
}

// Salva lo stato del timer quando la pagina perde il focus (tab switch, minimize, mobile background)
document.addEventListener('visibilitychange', function() {
    if (document.hidden && AppState.timer.active) {
        saveTimerState();
    }
});

export function updateNavTimer() {
    var navContainer = document.getElementById('nav-timer-container');
    var navText = document.getElementById('nav-timer-text');
    var navDot = document.getElementById('nav-timer-dot');
    
    if (!navContainer || !navText || !navDot) return;
    
    if (AppState.timer.active && AppState.timer.remaining > 0) {
        navContainer.classList.remove('hidden');
        navContainer.classList.add('flex');
        navText.innerText = formatTime(AppState.timer.remaining) + (AppState.timer.paused ? ' (PAUSA)' : '');
        
        var info = getTimerColorAndInfo();
        navDot.className = `w-2 h-2 rounded-full ${AppState.timer.paused ? '' : 'pulse-ani'} bg-${AppState.timer.paused ? 'gray-500' : info.color}`;
        navText.className = `text-xs font-mono font-bold text-${AppState.timer.paused ? 'gray-400' : info.color}`;
    } else {
        navContainer.classList.add('hidden');
        navContainer.classList.remove('flex');
    }
}

export function getTimerColorAndInfo() {
    var r = AppState.timer.remaining;
    var d = AppState.timer.duration;
    
    if (r <= 1800) { // < 30 minuti
        return { color: 'timerRed', label: 'Tempo Critico' };
    }
    if (r <= d * 0.25) { // < 25% del tempo
        return { color: 'timerOrange', label: 'Ultima Fase' };
    }
    return { color: 'magis-400', label: 'Tempo residuo' };
}

