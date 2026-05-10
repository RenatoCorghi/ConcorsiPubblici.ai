/* ============================================================
   LECTURE-PLAYER VIEW — UI Full-Screen per Lectio Audio+Slide
   
   Player immersivo con:
   - Slide auto-generate dal testo
   - Controlli audio play/pause/prev/next
   - Barra di progresso
   - Anti-download (no right-click, no selezione testo audio)
   ============================================================ */

import { LecturePlayer } from '../controllers/tts-player.js';
import { escapeHtml } from '../utils.js';

/**
 * Apre il lecture player come overlay full-screen.
 * @param {string[]} moduleTexts - Array dei testi dei moduli
 * @param {string} argomento - Titolo della lezione
 * @param {string} materia - Materia
 */
export function openLecturePlayer(moduleTexts, argomento, materia) {
    // Inizializza il player
    const slides = LecturePlayer.init(moduleTexts);
    
    if (slides.length === 0) {
        console.error('[LecturePlayer] Nessuna slide generata');
        return;
    }
    
    // Crea overlay
    const overlay = document.createElement('div');
    overlay.id = 'lecture-player-overlay';
    overlay.innerHTML = _renderPlayerHTML(argomento, materia, slides);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    
    // Anti right-click sull'overlay
    overlay.addEventListener('contextmenu', e => e.preventDefault());
    
    // Callback per aggiornare la UI ad ogni cambio stato
    LecturePlayer.onStateChange = (state) => _updatePlayerUI(state);
    
    // Render prima slide
    _updatePlayerUI({
        isPlaying: false,
        isPaused: false,
        isLoading: false,
        currentSlideIndex: 0,
        totalSlides: slides.length,
        currentSlide: slides[0],
        elapsed: 0,
        total: LecturePlayer.getTotalDuration()
    });
    
    // Bind keyboard controls
    _bindKeyboardControls();
    
    // Anima ingresso
    requestAnimationFrame(() => {
        overlay.classList.add('lp-visible');
    });
}

/**
 * Chiude il lecture player.
 */
export function closeLecturePlayer() {
    LecturePlayer.destroy();
    const overlay = document.getElementById('lecture-player-overlay');
    if (overlay) {
        overlay.classList.remove('lp-visible');
        setTimeout(() => {
            overlay.remove();
            document.body.style.overflow = '';
        }, 300);
    }
    _unbindKeyboardControls();
}

// ============================
// RENDER HTML
// ============================

function _renderPlayerHTML(argomento, materia, slides) {
    const totalDuration = LecturePlayer.getTotalDuration();
    const materiaColors = {
        'Civile': { accent: '#60a5fa', glow: 'rgba(96,165,250,0.15)' },
        'Penale': { accent: '#f87171', glow: 'rgba(248,113,113,0.15)' },
        'Amministrativo': { accent: '#4ade80', glow: 'rgba(74,222,128,0.15)' }
    };
    const colors = materiaColors[materia] || materiaColors['Civile'];
    
    return `
        <div class="lp-container" style="--lp-accent: ${colors.accent}; --lp-glow: ${colors.glow}">
            <!-- Header -->
            <div class="lp-header">
                <button onclick="window._closeLecturePlayer()" class="lp-back-btn" title="Chiudi">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
                <div class="lp-header-info">
                    <span class="lp-materia-badge">${escapeHtml(materia)}</span>
                    <h2 class="lp-title">${escapeHtml(argomento)}</h2>
                </div>
                <div class="lp-header-meta">
                    <span id="lp-slide-counter">1 / ${slides.length}</span>
                </div>
            </div>

            <!-- Slide Area -->
            <div class="lp-slide-area" id="lp-slide-area">
                <div class="lp-slide" id="lp-slide-content">
                    <!-- Popolata dinamicamente -->
                </div>
            </div>

            <!-- Controls -->
            <div class="lp-controls">
                <!-- Progress Bar -->
                <div class="lp-progress-wrapper">
                    <div class="lp-progress-bar" id="lp-progress-bar">
                        <div class="lp-progress-fill" id="lp-progress-fill" style="width: 0%"></div>
                        <div class="lp-progress-dot" id="lp-progress-dot" style="left: 0%"></div>
                    </div>
                    <div class="lp-time">
                        <span id="lp-time-elapsed">0:00</span>
                        <span id="lp-time-total">${_formatTime(totalDuration)}</span>
                    </div>
                </div>

                <!-- Buttons -->
                <div class="lp-buttons">
                    <button onclick="window._lpPrev()" class="lp-btn lp-btn-secondary" title="Slide precedente">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                    </button>
                    
                    <button onclick="window._lpToggle()" class="lp-btn lp-btn-primary" id="lp-play-btn" title="Play/Pausa">
                        <svg id="lp-icon-play" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        <svg id="lp-icon-pause" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        <div id="lp-icon-loading" class="lp-spinner" style="display:none"></div>
                    </button>
                    
                    <button onclick="window._lpNext()" class="lp-btn lp-btn-secondary" title="Slide successiva">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                    </button>
                </div>

                <!-- Slide dots -->
                <div class="lp-dots" id="lp-dots">
                    ${slides.map((s, i) => `<button class="lp-dot ${i === 0 ? 'lp-dot-active' : ''}" onclick="window._lpGoTo(${i})" title="Slide ${i + 1}"></button>`).join('')}
                </div>
            </div>
        </div>
    `;
}

// ============================
// UI UPDATE
// ============================

function _updatePlayerUI(state) {
    // Slide content
    const slideEl = document.getElementById('lp-slide-content');
    if (slideEl && state.currentSlide) {
        slideEl.innerHTML = _renderSlideContent(state.currentSlide);
        slideEl.classList.remove('lp-slide-enter');
        void slideEl.offsetWidth; // Trigger reflow
        slideEl.classList.add('lp-slide-enter');
    }
    
    // Counter
    const counter = document.getElementById('lp-slide-counter');
    if (counter) counter.textContent = `${state.currentSlideIndex + 1} / ${state.totalSlides}`;
    
    // Play/Pause/Loading icons
    const playIcon = document.getElementById('lp-icon-play');
    const pauseIcon = document.getElementById('lp-icon-pause');
    const loadingIcon = document.getElementById('lp-icon-loading');
    if (playIcon && pauseIcon && loadingIcon) {
        playIcon.style.display = state.isLoading ? 'none' : (state.isPlaying ? 'none' : 'block');
        pauseIcon.style.display = state.isLoading ? 'none' : (state.isPlaying ? 'block' : 'none');
        loadingIcon.style.display = state.isLoading ? 'block' : 'none';
    }
    
    // Progress
    const progressFill = document.getElementById('lp-progress-fill');
    const progressDot = document.getElementById('lp-progress-dot');
    const timeElapsed = document.getElementById('lp-time-elapsed');
    if (progressFill && state.total > 0) {
        const pct = Math.min((state.elapsed / state.total) * 100, 100);
        progressFill.style.width = pct + '%';
        if (progressDot) progressDot.style.left = pct + '%';
    }
    if (timeElapsed) timeElapsed.textContent = _formatTime(state.elapsed);
    
    // Dots
    const dots = document.querySelectorAll('.lp-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('lp-dot-active', i === state.currentSlideIndex);
        dot.classList.toggle('lp-dot-played', i < state.currentSlideIndex);
    });
}

function _renderSlideContent(slide) {
    return `
        <div class="lp-slide-module">Modulo ${slide.moduleNum}</div>
        <h3 class="lp-slide-title">${escapeHtml(slide.title)}</h3>
        
        ${slide.bullets.length > 0 ? `
            <ul class="lp-slide-bullets">
                ${slide.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
            </ul>
        ` : ''}
        
        ${slide.articles.length > 0 ? `
            <div class="lp-slide-articles">
                ${slide.articles.map(a => `<span class="lp-article-tag">${escapeHtml(a)}</span>`).join('')}
            </div>
        ` : ''}
        
        ${slide.keyTerms.length > 0 ? `
            <div class="lp-slide-terms">
                ${slide.keyTerms.map(t => `<span class="lp-term-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
        ` : ''}
    `;
}

// ============================
// KEYBOARD CONTROLS
// ============================

function _keyHandler(e) {
    if (e.code === 'Space') { e.preventDefault(); LecturePlayer.togglePlayPause(); }
    if (e.code === 'ArrowRight') LecturePlayer.nextSlide();
    if (e.code === 'ArrowLeft') LecturePlayer.prevSlide();
    if (e.code === 'Escape') closeLecturePlayer();
}

function _bindKeyboardControls() {
    document.addEventListener('keydown', _keyHandler);
}

function _unbindKeyboardControls() {
    document.removeEventListener('keydown', _keyHandler);
}

// ============================
// GLOBAL BINDINGS (per onclick)
// ============================

window._closeLecturePlayer = closeLecturePlayer;
window._lpToggle = () => LecturePlayer.togglePlayPause();
window._lpNext = () => LecturePlayer.nextSlide();
window._lpPrev = () => LecturePlayer.prevSlide();
window._lpGoTo = (i) => LecturePlayer.goToSlide(i);

// ============================
// UTILS
// ============================

function _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
