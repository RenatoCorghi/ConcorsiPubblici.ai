/* ============================================================
   LECTURE-PLAYER.JS — Controller Audio/Slide per Lectio
   
   Gestisce:
   - Sintesi TTS via Azure (chunk-by-chunk)
   - Playback con Web Audio API (anti-download)
   - Generazione slide dal testo markdown
   - Sincronizzazione slide ↔ audio
   ============================================================ */

import { AppState } from '../state.js';
import { getAuthHeaders } from '../api/helpers.js';

// ============================
// SLIDE GENERATOR
// ============================

/**
 * Parsa il testo markdown di una lezione in slide visualizzabili.
 * Ogni slide ha: title, bullets, articles, rawText (per TTS).
 */
export function generateSlides(moduleTexts) {
    const slides = [];
    
    moduleTexts.forEach((text, moduleIndex) => {
        const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 30);
        
        // Raggruppa ~2-3 paragrafi per slide
        let slideGroup = [];
        let charCount = 0;
        const MAX_CHARS_PER_SLIDE = 800;
        
        paragraphs.forEach(para => {
            slideGroup.push(para.trim());
            charCount += para.length;
            
            if (charCount >= MAX_CHARS_PER_SLIDE) {
                slides.push(_buildSlide(slideGroup, moduleIndex + 1, slides.length + 1));
                slideGroup = [];
                charCount = 0;
            }
        });
        
        // Rimanente
        if (slideGroup.length > 0) {
            slides.push(_buildSlide(slideGroup, moduleIndex + 1, slides.length + 1));
        }
    });
    
    return slides;
}

function _buildSlide(paragraphs, moduleNum, slideNum) {
    const rawText = paragraphs.join('\n\n');
    
    // Estrai titolo dal primo paragrafo
    let title = '';
    const firstPara = paragraphs[0] || '';
    
    // Cerca testo in grassetto come titolo
    const boldMatch = firstPara.match(/\*\*(.+?)\*\*/);
    if (boldMatch) {
        title = boldMatch[1].substring(0, 80);
    } else {
        // Prima frase come titolo
        const firstSentence = firstPara.split(/[.!?]/)[0];
        title = firstSentence.substring(0, 80);
    }
    
    // Estrai articoli di legge citati
    const articles = [];
    const artRegex = /(?:art(?:icol[oi])?\.?\s*\d+[\w-]*(?:\s*(?:Cost|c\.c|c\.p|c\.p\.c|c\.p\.p|l\.\s*\d+|CEDU|TUE|TFUE)\.?)?)/gi;
    let artMatch;
    while ((artMatch = artRegex.exec(rawText)) !== null) {
        const art = artMatch[0].trim();
        if (!articles.includes(art) && articles.length < 5) {
            articles.push(art);
        }
    }
    
    // Estrai concetti chiave (testo in grassetto)
    const keyTerms = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let bm;
    while ((bm = boldRegex.exec(rawText)) !== null) {
        if (bm[1].length < 60 && !keyTerms.includes(bm[1]) && keyTerms.length < 4) {
            keyTerms.push(bm[1]);
        }
    }
    
    // Crea bullet points dalle frasi chiave
    const bullets = [];
    const sentences = rawText
        .replace(/\*\*/g, '')
        .split(/[.!?]/)
        .map(s => s.trim())
        .filter(s => s.length > 40 && s.length < 200);
    
    // Prendi le frasi più "dense" (con termini giuridici)
    const scored = sentences.map(s => ({
        text: s,
        score: (s.match(/principio|diritto|norma|giurisprudenza|Corte|articolo|comma|legge|decreto|sentenza|dottrina|annullamento|revoca|legittimo|costituzional|interesse pubblico/gi) || []).length
    }));
    scored.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < Math.min(3, scored.length); i++) {
        if (scored[i].score > 0) {
            bullets.push(scored[i].text + '.');
        }
    }
    
    // Stima durata TTS (~150 parole/minuto, rallentato al -5%)
    const wordCount = rawText.split(/\s+/).length;
    const estimatedDurationSec = Math.ceil(wordCount / 2.4); // ~144 WPM con -5%
    
    return {
        slideNum,
        moduleNum,
        title: title || `Slide ${slideNum}`,
        bullets,
        articles,
        keyTerms,
        rawText, // Per il TTS
        estimatedDurationSec,
        wordCount
    };
}


// ============================
// TTS AUDIO ENGINE
// ============================

export const LecturePlayer = {
    // Stato
    audioContext: null,
    currentSource: null,
    slides: [],
    currentSlideIndex: 0,
    isPlaying: false,
    isLoading: false,
    isPaused: false,
    audioBufferCache: new Map(), // slideIndex -> AudioBuffer
    currentStartTime: 0,        // Quando ha iniziato il playback
    pauseOffset: 0,             // Offset accumulato durante le pause
    onStateChange: null,        // Callback per aggiornare la UI
    
    /**
     * Inizializza il player con i moduli della lezione.
     * @param {string[]} moduleTexts - Array di testi dei moduli
     */
    init(moduleTexts) {
        this.slides = generateSlides(moduleTexts);
        this.currentSlideIndex = 0;
        this.isPlaying = false;
        this.isLoading = false;
        this.isPaused = false;
        this.pauseOffset = 0;
        this.audioBufferCache.clear();
        
        // AudioContext (creato al primo play per rispettare autoplay policy)
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        this._notifyStateChange();
        return this.slides;
    },
    
    /**
     * Avvia o riprende il playback.
     */
    async play() {
        if (this.slides.length === 0) return;
        
        // Resume AudioContext se sospeso (autoplay policy)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        if (this.isPaused && this.currentSource) {
            // Riprendi da dove eravamo
            this.isPaused = false;
            this.isPlaying = true;
            this._notifyStateChange();
            await this._playSlide(this.currentSlideIndex, this.pauseOffset);
            return;
        }
        
        this.isPlaying = true;
        this.isPaused = false;
        this._notifyStateChange();
        
        // Pre-fetch del primo chunk
        await this._playSlide(this.currentSlideIndex);
    },
    
    /**
     * Mette in pausa il playback.
     */
    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        this.isPaused = true;
        
        // Calcola dove siamo nell'audio
        if (this.currentSource) {
            this.pauseOffset = this.audioContext.currentTime - this.currentStartTime;
            this.currentSource.stop();
            this.currentSource = null;
        }
        
        this._notifyStateChange();
    },
    
    /**
     * Toggle play/pause.
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    },
    
    /**
     * Va alla slide successiva.
     */
    async nextSlide() {
        if (this.currentSlideIndex < this.slides.length - 1) {
            this._stopCurrentAudio();
            this.currentSlideIndex++;
            this.pauseOffset = 0;
            this._notifyStateChange();
            if (this.isPlaying) {
                await this._playSlide(this.currentSlideIndex);
            }
        }
    },
    
    /**
     * Va alla slide precedente.
     */
    async prevSlide() {
        if (this.currentSlideIndex > 0) {
            this._stopCurrentAudio();
            this.currentSlideIndex--;
            this.pauseOffset = 0;
            this._notifyStateChange();
            if (this.isPlaying) {
                await this._playSlide(this.currentSlideIndex);
            }
        }
    },
    
    /**
     * Va a una slide specifica.
     */
    async goToSlide(index) {
        if (index >= 0 && index < this.slides.length) {
            this._stopCurrentAudio();
            this.currentSlideIndex = index;
            this.pauseOffset = 0;
            this._notifyStateChange();
            if (this.isPlaying) {
                await this._playSlide(this.currentSlideIndex);
            }
        }
    },
    
    /**
     * Ferma tutto e pulisce i buffer.
     */
    destroy() {
        this._stopCurrentAudio();
        this.isPlaying = false;
        this.isPaused = false;
        this.audioBufferCache.clear();
        this.slides = [];
        this._notifyStateChange();
    },
    
    /**
     * Ritorna il tempo totale stimato.
     */
    getTotalDuration() {
        return this.slides.reduce((sum, s) => sum + s.estimatedDurationSec, 0);
    },
    
    /**
     * Ritorna il tempo trascorso stimato.
     */
    getElapsedDuration() {
        let elapsed = 0;
        for (let i = 0; i < this.currentSlideIndex; i++) {
            elapsed += this.slides[i].estimatedDurationSec;
        }
        if (this.currentSlideIndex < this.slides.length) {
            elapsed += Math.min(this.pauseOffset, this.slides[this.currentSlideIndex].estimatedDurationSec);
        }
        return elapsed;
    },

    // ============================
    // PRIVATE METHODS
    // ============================
    
    async _playSlide(index, offset = 0) {
        if (index >= this.slides.length) {
            // Fine della lezione
            this.isPlaying = false;
            this.isPaused = false;
            this._notifyStateChange();
            return;
        }
        
        const slide = this.slides[index];
        this.isLoading = true;
        this._notifyStateChange();
        
        // Pre-fetch prossima slide in background
        if (index + 1 < this.slides.length) {
            this._prefetchAudio(index + 1);
        }
        
        try {
            const audioBuffer = await this._getAudioBuffer(index);
            
            if (!this.isPlaying && !this.isPaused) return; // Fermato nel frattempo
            
            this.isLoading = false;
            this._notifyStateChange();
            
            // Crea source node
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // Quando finisce, vai alla prossima
            source.onended = () => {
                if (this.isPlaying && !this.isPaused) {
                    this.currentSlideIndex++;
                    this.pauseOffset = 0;
                    this._notifyStateChange();
                    this._playSlide(this.currentSlideIndex);
                }
            };
            
            this.currentSource = source;
            this.currentStartTime = this.audioContext.currentTime;
            
            // Avvia dall'offset se in ripresa da pausa
            source.start(0, offset);
            
        } catch (err) {
            console.error('[TTS] Errore playback slide', index, err);
            this.isLoading = false;
            this.isPlaying = false;
            this._notifyStateChange();
        }
    },
    
    async _getAudioBuffer(slideIndex) {
        // Controlla cache
        if (this.audioBufferCache.has(slideIndex)) {
            return this.audioBufferCache.get(slideIndex);
        }
        
        const slide = this.slides[slideIndex];
        
        // Pulisci il testo per il TTS (rimuovi markdown)
        const cleanText = slide.rawText
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#{1,6}\s*/g, '')
            .replace(/\[CONTINUA[^\]]*\]/g, '')
            .replace(/---/g, '')
            .trim();
        
        // Chiama il proxy TTS
        const headers = await getAuthHeaders();
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                text: cleanText,
                voice: 'it-IT-GiuseppeNeural',
                rate: '-5%'
            })
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Errore TTS' }));
            throw new Error(err.error || `TTS error ${response.status}`);
        }
        
        // Decodifica l'audio MP3 in AudioBuffer
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        // Salva in cache (in memoria, non su disco)
        this.audioBufferCache.set(slideIndex, audioBuffer);
        
        return audioBuffer;
    },
    
    _prefetchAudio(slideIndex) {
        if (this.audioBufferCache.has(slideIndex)) return;
        // Pre-fetch silenzioso
        this._getAudioBuffer(slideIndex).catch(() => {
            // Silenzioso — riproveremo al momento del play
        });
    },
    
    _stopCurrentAudio() {
        if (this.currentSource) {
            try { this.currentSource.stop(); } catch (e) { /* già fermato */ }
            this.currentSource = null;
        }
    },
    
    _notifyStateChange() {
        if (typeof this.onStateChange === 'function') {
            this.onStateChange({
                isPlaying: this.isPlaying,
                isPaused: this.isPaused,
                isLoading: this.isLoading,
                currentSlideIndex: this.currentSlideIndex,
                totalSlides: this.slides.length,
                currentSlide: this.slides[this.currentSlideIndex] || null,
                elapsed: this.getElapsedDuration(),
                total: this.getTotalDuration()
            });
        }
    }
};
