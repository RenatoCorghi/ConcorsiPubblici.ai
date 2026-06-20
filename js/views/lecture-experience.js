/* ============================================================
   LECTURE-EXPERIENCE VIEW — Esperienza lezione a due modalità

   Overlay full-screen con UN motore audio condiviso (audio-engine.js)
   e due modalità switchabili al volo, senza interrompere la voce:

   - STUDIO        : testo completo, il blocco in lettura si illumina
                     (karaoke), click su una frase per saltarci.
   - PRESENTAZIONE : slide + voce + spazio per l'avatar AI (sfera).

   Transport condiviso: barra scrubabile reale, play/pausa, ±15s,
   slide prec/succ, riascolta. Anti-download preservato.
   ============================================================ */

import { AudioEngine } from '../controllers/audio-engine.js';
import { buildLecture, buildSlidePrompt, mergeAISlides } from '../controllers/lecture-content.js';
import { escapeHtml } from '../utils.js';
import { APP_CONFIG } from '../config.js';
import { getAuthHeaders, extractJSON } from '../api/helpers.js';

// Cache delle slide AI per firma-lezione: riaprire la stessa lezione nella
// sessione non rigenera (niente latenza né costo ripetuto).
const aiSlidesCache = new Map();

const MATERIA_COLORS = {
    'Civile': { accent: '#60a5fa', glow: 'rgba(96,165,250,0.15)' },
    'Penale': { accent: '#f87171', glow: 'rgba(248,113,113,0.15)' },
    'Amministrativo': { accent: '#4ade80', glow: 'rgba(74,222,128,0.15)' },
    'Costituzionale': { accent: '#c084fc', glow: 'rgba(192,132,252,0.15)' },
    'Tributario': { accent: '#fbbf24', glow: 'rgba(251,191,36,0.15)' }
};

let content = null;        // { blocks, slides }
let mode = 'studio';       // 'studio' | 'presentazione'
let lastBlock = -1;
let lastSlide = -1;
let isDragging = false;
let overlayEl = null;

export function openLectureExperience(moduleTexts, argomento, materia) {
    content = buildLecture(moduleTexts);
    if (!content.blocks.length) {
        console.error('[LectureExperience] Nessun blocco generato dalla lezione');
        return;
    }

    AudioEngine.load(content.blocks.map(b => ({ text: b.ttsText })));

    mode = 'studio';
    lastBlock = -1;
    lastSlide = -1;

    overlayEl = document.createElement('div');
    overlayEl.id = 'lecture-exp-overlay';
    overlayEl.innerHTML = _shellHTML(argomento, materia);
    document.body.appendChild(overlayEl);
    document.body.style.overflow = 'hidden';
    overlayEl.addEventListener('contextmenu', e => e.preventDefault()); // anti-download

    _renderStudio();
    _renderSlide(0);
    _bindControls();
    _bindKeyboard();

    AudioEngine.onProgress = _onProgress;
    AudioEngine.onProgress(AudioEngine.getState());

    requestAnimationFrame(() => overlayEl.classList.add('lx-visible'));

    // Fase 3: migliora le slide con l'AI in background (non blocca l'apertura).
    _enhanceSlides(moduleTexts);
}

// Arricchisce titolo/bullet delle slide via AI. Fallback silenzioso: se
// qualcosa va storto restano le slide euristiche. Cache per firma-lezione.
async function _enhanceSlides(moduleTexts) {
    const sig = _signature(moduleTexts);
    try {
        let parsed = aiSlidesCache.get(sig);
        if (!parsed) {
            const prompt = buildSlidePrompt(content.slides, content.blocks);
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].GEN,
                    feature: 'lectureSlides',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 4000,
                    skipExpansion: true   // niente RAG/expansion: è una sintesi del testo dato
                })
            });
            if (!response.ok) return; // silenzioso: tieni le euristiche
            const data = await response.json();
            const raw = data?.choices?.[0]?.message?.content;
            if (!raw) return;
            parsed = JSON.parse(extractJSON(raw));
            aiSlidesCache.set(sig, parsed);
        }
        const n = mergeAISlides(content.slides, parsed);
        if (n > 0 && overlayEl) {
            _renderSlide(lastSlide < 0 ? 0 : lastSlide); // riflette i nuovi testi
            console.log(`[LectureExperience] ✨ ${n} slide ottimizzate dall'AI`);
        }
    } catch (e) {
        console.warn('[LectureExperience] Ottimizzazione slide non riuscita (uso euristiche):', e.message);
    }
}

function _signature(moduleTexts) {
    const joined = (moduleTexts || []).join('|');
    let h = 0;
    for (let i = 0; i < joined.length; i++) {
        h = (Math.imul(31, h) + joined.charCodeAt(i)) | 0;
    }
    return `${joined.length}:${h}`;
}

export function closeLectureExperience() {
    AudioEngine.onProgress = null;
    AudioEngine.destroy();
    _unbindKeyboard();
    if (overlayEl) {
        overlayEl.classList.remove('lx-visible');
        const el = overlayEl;
        overlayEl = null;
        setTimeout(() => { el.remove(); document.body.style.overflow = ''; }, 280);
    }
}

// ============================
// RENDER — shell
// ============================

function _shellHTML(argomento, materia) {
    const c = MATERIA_COLORS[materia] || MATERIA_COLORS['Civile'];
    return `
    <div class="lx-container" style="--lp-accent:${c.accent}; --lp-glow:${c.glow}">
        <header class="lx-header">
            <button class="lx-icon-btn" data-act="close" title="Chiudi (Esc)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <div class="lx-header-info">
                <span class="lx-materia-badge">${escapeHtml(materia)}</span>
                <h2 class="lx-title">${escapeHtml(argomento)}</h2>
            </div>
            <div class="lx-mode-switch" role="tablist">
                <button class="lx-mode-btn lx-mode-active" data-mode="studio" role="tab">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                    Studio
                </button>
                <button class="lx-mode-btn" data-mode="presentazione" role="tab">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                    Presentazione
                </button>
            </div>
        </header>

        <div class="lx-stage">
            <!-- STUDIO -->
            <section class="lx-studio" id="lx-studio" aria-label="Testo della lezione"></section>

            <!-- PRESENTAZIONE -->
            <section class="lx-presentazione" id="lx-presentazione" hidden>
                <div class="lx-orb" id="lx-orb">
                    <div class="lx-orb-core"></div>
                    <div class="lx-orb-ring"></div>
                    <div class="lx-orb-ring lx-orb-ring2"></div>
                </div>
                <div class="lx-slide" id="lx-slide"></div>
                <div class="lx-dots" id="lx-dots"></div>
            </section>
        </div>

        <footer class="lx-transport">
            <div class="lx-bar-wrap">
                <div class="lx-bar" id="lx-bar">
                    <div class="lx-bar-buffer" id="lx-bar-buffer"></div>
                    <div class="lx-bar-fill" id="lx-bar-fill"></div>
                    <div class="lx-bar-dot" id="lx-bar-dot"></div>
                </div>
                <div class="lx-times">
                    <span id="lx-time-cur">0:00</span>
                    <span id="lx-time-tot">0:00</span>
                </div>
            </div>
            <div class="lx-buttons">
                <button class="lx-btn" data-act="back15" title="Indietro 15s">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></svg>
                    <span class="lx-btn-sub">15</span>
                </button>
                <button class="lx-btn" data-act="prev" title="Slide precedente">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                <button class="lx-btn lx-btn-play" data-act="toggle" title="Play/Pausa (Spazio)">
                    <svg id="lx-ic-play" width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <svg id="lx-ic-pause" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>
                    <div id="lx-ic-load" class="lx-spinner" style="display:none"></div>
                </button>
                <button class="lx-btn" data-act="next" title="Slide successiva">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zM16 6v12h2V6z"/></svg>
                </button>
                <button class="lx-btn" data-act="fwd15" title="Avanti 15s">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 17l5-5-5-5"/><path d="M6 17l5-5-5-5"/></svg>
                    <span class="lx-btn-sub">15</span>
                </button>
                <button class="lx-btn lx-btn-replay" data-act="replay" title="Riascolta da capo">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 103-7.7L3 8"/></svg>
                </button>
            </div>
        </footer>
    </div>`;
}

function _renderStudio() {
    const host = overlayEl.querySelector('#lx-studio');
    let lastModule = 0;
    host.innerHTML = content.blocks.map(b => {
        const moduleDivider = b.moduleNum !== lastModule
            ? `<div class="lx-module-divider">Modulo ${b.moduleNum}</div>`
            : '';
        lastModule = b.moduleNum;
        return `${moduleDivider}<div class="lx-block" data-block="${b.index}">${b.html}</div>`;
    }).join('');
}

function _renderSlide(slideIndex) {
    const slide = content.slides[slideIndex];
    if (!slide) return;
    const slideEl = overlayEl.querySelector('#lx-slide');
    slideEl.innerHTML = `
        <div class="lx-slide-module">Modulo ${slide.moduleNum} · Slide ${slideIndex + 1} / ${content.slides.length}${slide.aiEnhanced ? ' · <span class="lx-ai-badge">✨ AI</span>' : ''}</div>
        <h3 class="lx-slide-title">${escapeHtml(slide.title)}</h3>
        ${slide.bullets.length ? `<ul class="lx-slide-bullets">${slide.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
        ${slide.articles.length ? `<div class="lx-slide-articles">${slide.articles.map(a => `<span class="lx-art-tag">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
    `;
    slideEl.classList.remove('lx-slide-enter');
    void slideEl.offsetWidth;
    slideEl.classList.add('lx-slide-enter');

    // Dots
    const dots = overlayEl.querySelector('#lx-dots');
    if (dots.children.length !== content.slides.length) {
        dots.innerHTML = content.slides.map((_, i) =>
            `<button class="lx-dot" data-slide="${i}" title="Slide ${i + 1}"></button>`).join('');
    }
    dots.querySelectorAll('.lx-dot').forEach((d, i) => {
        d.classList.toggle('lx-dot-active', i === slideIndex);
        d.classList.toggle('lx-dot-done', i < slideIndex);
    });
}

// ============================
// SYNC — aggiornamento da onProgress
// ============================

function _onProgress(state) {
    // Transport: barra + tempi (ogni frame, salvo durante il drag)
    const dur = state.duration || 0;
    const pct = dur > 0 ? Math.min(state.currentTime / dur, 1) * 100 : 0;
    if (!isDragging) {
        _setBar(pct);
    }
    _setText('#lx-time-cur', _fmt(state.currentTime));
    _setText('#lx-time-tot', _fmt(dur));

    // Icona play/pausa/loading
    const ic = (id, show) => { const e = overlayEl.querySelector(id); if (e) e.style.display = show ? 'block' : 'none'; };
    ic('#lx-ic-load', state.isLoading);
    ic('#lx-ic-play', !state.isLoading && !state.isPlaying);
    ic('#lx-ic-pause', !state.isLoading && state.isPlaying);

    // Orb audio-reattiva: attiva quando si ascolta, scala/glow dall'ampiezza
    // reale della voce (state.level 0..1). Lo smussamento è affidato alla
    // transition CSS, così tra un frame e l'altro il movimento è fluido.
    const orb = overlayEl.querySelector('#lx-orb');
    if (orb) {
        orb.classList.toggle('lx-orb-active', state.isPlaying);
        orb.style.setProperty('--lx-level', (state.level || 0).toFixed(3));
    }

    // Cambi discreti di blocco/slide (non a ogni frame)
    if (state.index !== lastBlock) {
        lastBlock = state.index;
        _highlightBlock(state.index);
        const slideIdx = content.blocks[state.index]?.slideIndex ?? 0;
        if (slideIdx !== lastSlide) {
            lastSlide = slideIdx;
            _renderSlide(slideIdx);
        }
    }
}

function _highlightBlock(index) {
    const blocks = overlayEl.querySelectorAll('.lx-block');
    blocks.forEach(b => b.classList.remove('lx-block-active'));
    const active = overlayEl.querySelector(`.lx-block[data-block="${index}"]`);
    if (active) {
        active.classList.add('lx-block-active');
        if (mode === 'studio') active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function _setBar(pct) {
    const fill = overlayEl.querySelector('#lx-bar-fill');
    const dot = overlayEl.querySelector('#lx-bar-dot');
    if (fill) fill.style.width = pct + '%';
    if (dot) dot.style.left = pct + '%';
}

function _setText(sel, txt) {
    const e = overlayEl.querySelector(sel);
    if (e) e.textContent = txt;
}

// ============================
// CONTROLS
// ============================

function _bindControls() {
    // Pulsanti transport + header (delega via data-act)
    overlayEl.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
            switch (btn.dataset.act) {
                case 'close': closeLectureExperience(); break;
                case 'toggle': AudioEngine.toggle(); break;
                case 'back15': AudioEngine.skip(-15); break;
                case 'fwd15': AudioEngine.skip(15); break;
                case 'prev': _gotoSlide(lastSlide - 1); break;
                case 'next': _gotoSlide(lastSlide + 1); break;
                case 'replay': AudioEngine.restart(); break;
            }
        });
    });

    // Switch modalità
    overlayEl.querySelectorAll('.lx-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => _setMode(btn.dataset.mode));
    });

    // Click su un blocco di testo (Studio) → salta lì
    overlayEl.querySelector('#lx-studio').addEventListener('click', e => {
        const block = e.target.closest('.lx-block');
        if (block) AudioEngine.seekToSegment(parseInt(block.dataset.block, 10));
    });

    // Click su un puntino (Presentazione) → salta alla slide
    overlayEl.querySelector('#lx-dots').addEventListener('click', e => {
        const dot = e.target.closest('.lx-dot');
        if (dot) _gotoSlide(parseInt(dot.dataset.slide, 10));
    });

    // Barra scrubabile (click + drag)
    _bindScrubber();
}

function _gotoSlide(slideIndex) {
    const slide = content.slides[Math.max(0, Math.min(slideIndex, content.slides.length - 1))];
    if (slide) AudioEngine.seekToSegment(slide.blockStart);
}

function _setMode(next) {
    if (next === mode) return;
    mode = next;
    overlayEl.querySelectorAll('.lx-mode-btn').forEach(b =>
        b.classList.toggle('lx-mode-active', b.dataset.mode === mode));
    overlayEl.querySelector('#lx-studio').hidden = (mode !== 'studio');
    overlayEl.querySelector('#lx-presentazione').hidden = (mode !== 'presentazione');
    // Allinea la vista appena mostrata allo stato corrente
    if (mode === 'studio') _highlightBlock(lastBlock < 0 ? 0 : lastBlock);
    else _renderSlide(lastSlide < 0 ? 0 : lastSlide);
}

function _bindScrubber() {
    const bar = overlayEl.querySelector('#lx-bar');
    const pctFromEvent = clientX => {
        const r = bar.getBoundingClientRect();
        return Math.max(0, Math.min((clientX - r.left) / r.width, 1));
    };
    const preview = clientX => {
        const p = pctFromEvent(clientX);
        _setBar(p * 100);
        _setText('#lx-time-cur', _fmt(p * AudioEngine.duration));
        return p;
    };
    bar.addEventListener('pointerdown', e => {
        isDragging = true;
        bar.setPointerCapture(e.pointerId);
        preview(e.clientX);
    });
    bar.addEventListener('pointermove', e => {
        if (isDragging) preview(e.clientX);
    });
    bar.addEventListener('pointerup', e => {
        if (!isDragging) return;
        isDragging = false;
        const p = pctFromEvent(e.clientX);
        AudioEngine.seekTo(p * AudioEngine.duration);
    });
}

// ============================
// KEYBOARD
// ============================

function _keyHandler(e) {
    switch (e.code) {
        case 'Space': e.preventDefault(); AudioEngine.toggle(); break;
        case 'ArrowLeft': AudioEngine.skip(-15); break;
        case 'ArrowRight': AudioEngine.skip(15); break;
        case 'ArrowUp': e.preventDefault(); _gotoSlide(lastSlide - 1); break;
        case 'ArrowDown': e.preventDefault(); _gotoSlide(lastSlide + 1); break;
        case 'KeyS': _setMode('studio'); break;
        case 'KeyP': _setMode('presentazione'); break;
        case 'Escape': closeLectureExperience(); break;
    }
}

function _bindKeyboard() { document.addEventListener('keydown', _keyHandler); }
function _unbindKeyboard() { document.removeEventListener('keydown', _keyHandler); }

// ============================
// UTILS
// ============================

function _fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
