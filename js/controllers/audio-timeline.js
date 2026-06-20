/* ============================================================
   AUDIO-TIMELINE.JS — Modello puro della timeline audio

   Nessun accesso a DOM / Web Audio / rete: solo la matematica di
   posizioni, durate e seek. È il "righello" su cui poggia il motore
   audio (audio-engine.js) e che alimenterà sia la barra scrubabile,
   sia l'evidenziazione del testo, sia lo scorrimento delle slide.

   Tenendolo puro è interamente testabile in Node (vedi
   tests/unit/audio-timeline.test.mjs) — la parte real-time delicata
   resta confinata altrove.

   Durate: ogni segmento nasce con una durata STIMATA (dal n. di parole)
   e la sostituisce con quella REALE non appena l'audio è decodificato.
   La timeline funziona quindi anche "a metà buffering", come lo
   scrubber di un video in streaming.
   ============================================================ */

const WORDS_PER_SEC = 2.4; // ~144 parole/min con prosody rate -5%

// Stima di durata (secondi) dal testo, usata finché non si conosce
// la durata reale dell'audio. Minimo 1s: mai zero/negativi.
export function estimateDuration(text) {
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, words / WORDS_PER_SEC);
}

// Livello sonoro (0..1) dall'onda nel dominio del tempo: byte 0..255 centrati
// su 128 (silenzio). Calcola l'RMS della deviazione e lo amplifica (gain) per
// portarlo in un range visivo utile. Alimenta l'orb audio-reattivo (Fase 4):
// pura e testabile a parte (l'AnalyserNode vive nel motore browser).
export function computeLevel(bytes, gain = 4) {
    if (!bytes || bytes.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
        const v = (bytes[i] - 128) / 128;
        sum += v * v;
    }
    const rms = Math.sqrt(sum / bytes.length);
    return Math.max(0, Math.min(1, rms * gain));
}

export class AudioTimeline {
    // segments: [{ estDuration: number }]
    constructor(segments = []) {
        this.segments = segments.map(s => ({
            estDuration: Math.max(0, Number(s.estDuration) || 0),
            realDuration: null
        }));
    }

    get length() {
        return this.segments.length;
    }

    // Registra la durata reale (da AudioBuffer.duration) di un segmento.
    setRealDuration(index, seconds) {
        const seg = this.segments[index];
        if (!seg) return;
        const d = Number(seconds);
        if (Number.isFinite(d) && d >= 0) seg.realDuration = d;
    }

    // Durata effettiva: reale se nota, altrimenti la stima.
    duration(index) {
        const seg = this.segments[index];
        if (!seg) return 0;
        return seg.realDuration != null ? seg.realDuration : seg.estDuration;
    }

    // Istante d'inizio del segmento sulla timeline globale.
    start(index) {
        let t = 0;
        const upTo = Math.min(index, this.segments.length);
        for (let i = 0; i < upTo; i++) t += this.duration(i);
        return t;
    }

    // Durata totale della timeline (somma di reali + stimate).
    get total() {
        let t = 0;
        for (let i = 0; i < this.segments.length; i++) t += this.duration(i);
        return t;
    }

    // true quando TUTTE le durate reali sono note: la barra non si
    // "riassesterà" più mentre si ascolta.
    get isFullyMeasured() {
        return this.segments.length > 0 && this.segments.every(s => s.realDuration != null);
    }

    // Tempo globale → { index, offset } del segmento che lo contiene.
    // Fa clamp sotto zero (→ inizio) e oltre la fine (→ fine ultimo seg).
    resolve(globalTime) {
        if (this.segments.length === 0) return { index: 0, offset: 0 };

        // NaN/negativi → inizio; +Infinity cade nel clamp "oltre la fine" sotto.
        let t = Number(globalTime);
        if (Number.isNaN(t) || t < 0) t = 0;

        const total = this.total;
        const last = this.segments.length - 1;
        if (t >= total) return { index: last, offset: this.duration(last) };

        let acc = 0;
        for (let i = 0; i < this.segments.length; i++) {
            const d = this.duration(i);
            // Sul confine esatto preferiamo l'inizio del segmento successivo.
            if (t < acc + d) return { index: i, offset: t - acc };
            acc += d;
        }
        return { index: last, offset: this.duration(last) };
    }

    // Inverso di resolve: segmento + offset → tempo globale.
    globalTime(index, offset = 0) {
        return this.start(index) + Math.max(0, Number(offset) || 0);
    }
}
