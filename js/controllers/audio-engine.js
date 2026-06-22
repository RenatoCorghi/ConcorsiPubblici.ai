/* ============================================================
   AUDIO-ENGINE.JS — Motore audio condiviso (spina dorsale)

   UN solo motore per le due modalità (Studio / Presentazione): la voce
   è la stessa, cambia solo il vestito visivo intorno. Tutto ciò che è
   visivo — barra scrubabile, evidenziazione del testo, scorrimento
   slide, pulsazione dell'avatar — legge la posizione DA QUI.

   Caratteristiche:
   - Timeline reale e scrubabile (non più durate stimate "finte").
   - Narra il testo COMPLETO, segmentato per blocchi; le slide sono
     finestre su questa stessa timeline.
   - seekTo / skip(±) / restart, play / pause / resume con offset corretti.
   - Buffering progressivo: parte subito sul primo blocco, pre-carica il
     resto in background e raffina le durate man mano (come uno streaming).
   - ANTI-DOWNLOAD preservato: usa Web Audio API (AudioBuffer), non un
     <audio src> con URL scaricabile col tasto destro.

   La matematica di posizioni/seek vive in audio-timeline.js (pura,
   testata). Qui c'è solo la guida real-time del Web Audio.
   ============================================================ */

import { AudioTimeline, estimateDuration, computeLevel } from './audio-timeline.js';
import { getAuthHeaders } from '../api/helpers.js';

const PREFETCH_CONCURRENCY = 2;            // decodifiche in background in parallelo
const TTS_VOICE = 'it-IT-GiuseppeNeural';
const TTS_RATE = '-5%';
const LEVEL_GAIN = 4;                       // amplifica l'RMS della voce per l'orb reattivo

export const AudioEngine = {
    audioContext: null,
    analyser: null,        // tap d'ampiezza per l'orb audio-reattivo (Fase 4)
    _levelData: null,
    timeline: null,
    segments: [],          // [{ text, buffer, status }]  status: idle|loading|ready|error
    _decodePromises: [],

    isPlaying: false,
    isPaused: false,
    _isLoading: false,
    currentIndex: 0,
    _segmentOffset: 0,     // offset (s) da cui è partito il segmento corrente
    _audioStartTime: 0,    // audioContext.currentTime all'ultimo source.start()
    _source: null,
    _seekToken: 0,         // invalida onended/decodifiche superate da un nuovo seek/stop
    _rafId: null,

    onProgress: null,      // callback(state) — vedi _buildPayload()

    /**
     * Carica i segmenti di testo e prepara la timeline.
     * @param {{text:string, estDuration?:number}[]} rawSegments
     */
    load(rawSegments) {
        this.destroy();
        this.segments = (rawSegments || [])
            .filter(s => s && typeof s.text === 'string' && s.text.trim().length > 0)
            .map(s => ({ text: s.text, buffer: null, status: 'idle' }));
        this.timeline = new AudioTimeline(
            this.segments.map((s, i) => ({
                estDuration: rawSegments[i]?.estDuration ?? estimateDuration(s.text)
            }))
        );
        this.currentIndex = 0;
        this._segmentOffset = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this._isLoading = false;
        this._decodePromises = [];

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Analyser nel grafo audio: i source si collegano qui, e da qui al
        // destination. Legge l'ampiezza in tempo reale per l'orb reattivo.
        if (!this.analyser) {
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.connect(this.audioContext.destination);
            this._levelData = new Uint8Array(this.analyser.frequencyBinCount);
        }

        // Pre-carica tutto in background per consolidare le durate reali.
        this._prefetchAll();
        this._emit();
        return this.timeline;
    },

    // ---- POSIZIONE (lette dalla UI) ----

    // Posizione (s) DENTRO il segmento corrente.
    get _withinSegment() {
        if (this.isPlaying && this._source) {
            return this._segmentOffset + (this.audioContext.currentTime - this._audioStartTime);
        }
        return this._segmentOffset;
    },

    get currentTime() {
        return this.timeline ? this.timeline.globalTime(this.currentIndex, this._withinSegment) : 0;
    },

    get duration() {
        return this.timeline ? this.timeline.total : 0;
    },

    // ---- CONTROLLI ----

    async play() {
        if (!this.timeline || this.timeline.length === 0) return;
        try {
            if (this.audioContext.state === 'suspended') await this.audioContext.resume();
        } catch (e) {
            console.warn('[AudioEngine] Impossibile fare resume del contesto audio:', e);
            throw e; // Rilancia per far catturare al chiamante
        }
        if (this.isPlaying) return;
        this.isPaused = false;
        this.isPlaying = true;
        this._startRaf();
        try {
            await this._startSegment(this.currentIndex, this._segmentOffset);
        } catch (e) {
            console.error('[AudioEngine] Errore avvio segmento:', e);
            this._finish();
        }
    },

    pause() {
        if (!this.isPlaying) return;
        this._segmentOffset = this._withinSegment;  // congela il punto esatto
        this.isPlaying = false;
        this.isPaused = true;
        this._stopSource();
        this._stopRaf();
        this._emit();
    },

    toggle() {
        if (this.isPlaying) this.pause();
        else this.play().catch(e => console.warn('[AudioEngine] play() fallito su toggle:', e));
    },

    // Salta a un tempo globale (click sulla barra). Mantiene lo stato
    // play/pausa: se stavi ascoltando riparte da lì, se eri in pausa
    // resta in pausa pronto a ripartire dal nuovo punto.
    async seekTo(globalTime) {
        if (!this.timeline) return;
        const { index, offset } = this.timeline.resolve(globalTime);
        const wasPlaying = this.isPlaying;
        this._stopSource();
        this.currentIndex = index;
        this._segmentOffset = offset;
        if (wasPlaying) {
            await this._startSegment(index, offset);
        } else {
            this._emit();
        }
    },

    skip(deltaSeconds) {
        return this.seekTo(this.currentTime + deltaSeconds);
    },

    // Salta all'inizio di un blocco/segmento (click sul testo in Studio,
    // sui puntini in Presentazione).
    seekToSegment(index) {
        if (!this.timeline || this.timeline.length === 0) return Promise.resolve();
        const i = Math.max(0, Math.min(index, this.timeline.length - 1));
        return this.seekTo(this.timeline.globalTime(i, 0));
    },

    restart() {
        return this.seekTo(0);
    },

    destroy() {
        this._stopSource();
        this._stopRaf();
        this._seekToken++;     // invalida ogni callback in volo
        this.isPlaying = false;
        this.isPaused = false;
        this._isLoading = false;
        this.currentIndex = 0;
        this._segmentOffset = 0;
        if (this.segments) this.segments.forEach(s => { s.buffer = null; s.status = 'idle'; });
        this._decodePromises = [];
        this._emit();
    },

    getState() {
        return this._buildPayload(false);
    },

    // Livello sonoro corrente (0..1) per l'orb reattivo. 0 se in pausa/fermo.
    getLevel() {
        if (!this.analyser || !this.isPlaying || !this._levelData) return 0;
        this.analyser.getByteTimeDomainData(this._levelData);
        return computeLevel(this._levelData, LEVEL_GAIN);
    },

    // ---- INTERNI ----

    async _startSegment(index, offset) {
        const token = ++this._seekToken;
        if (index >= this.segments.length) { this._finish(); return; }

        this._setLoading(true);
        let buffer;
        try {
            buffer = await this._ensureDecoded(index);
        } catch (e) {
            console.error('[AudioEngine] Decodifica fallita sul segmento', index, e.message);
            if (token !== this._seekToken) return;     // superato da un altro seek/stop
            this._setLoading(false);
            // Salta il segmento rotto e prosegui, se possibile.
            if (this.isPlaying && index + 1 < this.segments.length) {
                this.currentIndex = index + 1;
                this._segmentOffset = 0;
                return this._startSegment(index + 1, 0);
            }
            this._finish();
            return;
        }

        if (token !== this._seekToken) return;         // un nuovo seek ha vinto: non suonare questo
        this._setLoading(false);
        if (!this.isPlaying) { this._emit(); return; } // es. messo in pausa durante il caricamento

        // Pre-carica il prossimo per un passaggio fluido.
        if (index + 1 < this.segments.length) this._ensureDecoded(index + 1).catch(() => {});

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyser || this.audioContext.destination);
        source.onended = () => {
            if (token !== this._seekToken) return;     // stop manuale: non auto-avanzare
            this.currentIndex = index + 1;
            this._segmentOffset = 0;
            if (this.currentIndex < this.segments.length) {
                this._startSegment(this.currentIndex, 0);
            } else {
                this._finish();
            }
        };

        this._source = source;
        this._segmentOffset = offset;
        this._audioStartTime = this.audioContext.currentTime;
        // offset oltre la durata reale → niente da suonare: lascia che onended avanzi.
        const safeOffset = Math.min(offset, Math.max(0, buffer.duration - 0.02));
        source.start(0, safeOffset);
        this._emit();
    },

    _finish() {
        this.isPlaying = false;
        this.isPaused = false;
        this._stopSource();
        this._stopRaf();
        if (this.timeline && this.segments.length > 0) {
            this.currentIndex = this.segments.length - 1;
            this._segmentOffset = this.timeline.duration(this.currentIndex);
        }
        this._emit(true);
    },

    _stopSource() {
        if (this._source) {
            this._source.onended = null;               // evita auto-avanzamento sullo stop manuale
            try { this._source.stop(); } catch (_) { /* già fermato */ }
            this._source = null;
        }
    },

    // Garantisce che il segmento sia scaricato+decodificato (una sola volta).
    async _ensureDecoded(index) {
        const seg = this.segments[index];
        if (!seg) throw new Error(`segmento ${index} inesistente`);
        if (seg.status === 'ready' && seg.buffer) return seg.buffer;
        if (seg.status === 'loading' && this._decodePromises[index]) return this._decodePromises[index];

        const p = (async () => {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers,
                body: JSON.stringify({ text: seg.text, voice: TTS_VOICE, rate: TTS_RATE })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `TTS ${res.status}`);
            }
            const arr = await res.arrayBuffer();
            const buf = await this.audioContext.decodeAudioData(arr);
            seg.buffer = buf;
            seg.status = 'ready';
            this.timeline.setRealDuration(index, buf.duration);
            this._emit();   // durata reale nota → la UI può raffinare la barra
            return buf;
        })();

        seg.status = 'loading';
        this._decodePromises[index] = p;
        try {
            return await p;
        } catch (e) {
            seg.status = 'error';
            throw e;
        }
    },

    _prefetchAll() {
        let i = 0;
        const next = () => {
            if (i >= this.segments.length) return;
            const idx = i++;
            this._ensureDecoded(idx).catch(() => {}).finally(next);
        };
        for (let k = 0; k < PREFETCH_CONCURRENCY; k++) next();
    },

    _setLoading(v) {
        this._isLoading = v;
        this._emit();
    },

    // Loop a ~60fps per aggiornare la posizione durante la riproduzione.
    _startRaf() {
        this._stopRaf();
        const tick = () => {
            this._emit();
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    },

    _stopRaf() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    _buildPayload(ended) {
        return {
            currentTime: this.currentTime,
            duration: this.duration,
            index: this.currentIndex,
            total: this.segments.length,
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            isLoading: this._isLoading,
            isFullyMeasured: this.timeline ? this.timeline.isFullyMeasured : false,
            level: this.getLevel(),
            ended: !!ended
        };
    },

    _emit(ended = false) {
        if (typeof this.onProgress === 'function') this.onProgress(this._buildPayload(ended));
    }
};
