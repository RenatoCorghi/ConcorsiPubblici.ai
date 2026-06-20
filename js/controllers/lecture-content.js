/* ============================================================
   LECTURE-CONTENT.JS — Dal testo della lezione a blocchi + slide

   Unità atomica = BLOCCO (un paragrafo). Ogni blocco è insieme:
   - un segmento di narrazione per il motore audio (ttsText, ripulito),
   - un elemento evidenziabile nella modalità Studio (html),
   - parte di una SLIDE (gruppo di blocchi) per la modalità Presentazione.

   Blocchi e slide condividono gli indici: l'audio è nel blocco i →
   Studio evidenzia il blocco i → Presentazione mostra la slide che
   contiene il blocco i. Un'unica timeline, tre viste sincronizzate.
   ============================================================ */

import { escapeHtml } from '../utils.js';

const MAX_BLOCK_CHARS = 1200;     // sopra questa soglia spezzo il paragrafo per frasi
const SLIDE_TARGET_CHARS = 1500;  // raggruppo blocchi in una slide fino a ~questa lunghezza

// --- Pulizia testo per il TTS (niente markdown, niente marcatori interni) ---
function toPlainText(md) {
    return (md || '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/`+/g, '')
        .replace(/\[CONTINUA[^\]]*\]/gi, '')
        .replace(/^[-—]{2,}$/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// --- Markdown "leggero" di un blocco → HTML (per la modalità Studio) ---
function blockToHtml(raw) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const out = [];
    let listBuffer = [];

    const flushList = () => {
        if (listBuffer.length) {
            out.push(`<ul class="lx-ul">${listBuffer.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`);
            listBuffer = [];
        }
    };

    for (const line of lines) {
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const bullet = line.match(/^[-*]\s+(.*)$/);
        if (heading) {
            flushList();
            out.push(`<h4 class="lx-h">${inline(heading[2])}</h4>`);
        } else if (bullet) {
            listBuffer.push(bullet[1]);
        } else {
            flushList();
            out.push(`<p class="lx-p">${inline(line)}</p>`);
        }
    }
    flushList();
    return out.join('');
}

// Inline: grassetto/corsivo, su testo già HTML-escapato.
function inline(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// Rimuove blocchi di servizio (ragionamento interno, scaletta, marcatori).
function stripServiceBlocks(text) {
    return (text || '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/<scaletta>[\s\S]*?<\/scaletta>/gi, '')
        .replace(/\[CONTINUA[^\]]*\]/gi, '')
        .replace(/^\s*[-—]{3,}\s*$/gm, '')
        .trim();
}

// Spezza un paragrafo troppo lungo in sotto-blocchi per frase.
function splitLongParagraph(para) {
    if (toPlainText(para).length <= MAX_BLOCK_CHARS) return [para];
    const sentences = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [para];
    const chunks = [];
    let buf = '';
    for (const s of sentences) {
        if ((buf + s).length > MAX_BLOCK_CHARS && buf) {
            chunks.push(buf.trim());
            buf = '';
        }
        buf += s;
    }
    if (buf.trim()) chunks.push(buf.trim());
    return chunks;
}

// Titolo di una slide: primo grassetto, o prima riga heading, o prima frase.
function slideTitle(blocks) {
    const raw = blocks.map(b => b.raw).join('\n');
    const bold = raw.match(/\*\*(.+?)\*\*/);
    if (bold) return bold[1].substring(0, 80).trim();
    const heading = raw.match(/^#{1,6}\s+(.+)$/m);
    if (heading) return heading[1].substring(0, 80).trim();
    const firstSentence = toPlainText(raw).split(/[.!?]/)[0] || '';
    return firstSentence.substring(0, 80).trim();
}

// Estrae articoli di legge citati nel testo (per le slide).
function extractArticles(plain) {
    const articles = [];
    const re = /art(?:icol[oi])?\.?\s*\d+[\w-]*(?:\s*(?:Cost|c\.c|c\.p|c\.p\.c|c\.p\.p|CEDU|TUE|TFUE)\.?)?/gi;
    let m;
    while ((m = re.exec(plain)) !== null) {
        const a = m[0].trim();
        if (!articles.includes(a) && articles.length < 5) articles.push(a);
    }
    return articles;
}

// Bullet di una slide: le frasi più "dense" di lessico giuridico.
function extractBullets(plain) {
    const sentences = plain.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 40 && s.length < 220);
    const scored = sentences.map(s => ({
        text: s,
        score: (s.match(/principio|diritto|norma|giurisprudenza|Corte|articolo|comma|legge|decreto|sentenza|dottrina|responsabilit|legittim|costituzional|interesse|obbligazione|contratto|reato|nullit/gi) || []).length
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, 3).map(s => s.text + '.');
}

/**
 * Costruisce blocchi + slide dai testi dei moduli.
 * @param {string[]} moduleTexts
 * @returns {{ blocks: object[], slides: object[] }}
 */
export function buildLecture(moduleTexts) {
    const blocks = [];

    (moduleTexts || []).forEach((moduleText, mi) => {
        const clean = stripServiceBlocks(moduleText);
        const paragraphs = clean.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);

        paragraphs.forEach(para => {
            splitLongParagraph(para).forEach(chunk => {
                const ttsText = toPlainText(chunk);
                if (ttsText.length < 2) return; // scarta frammenti vuoti (es. separatori)
                blocks.push({
                    index: blocks.length,
                    moduleNum: mi + 1,
                    raw: chunk,
                    html: blockToHtml(chunk),
                    ttsText,
                    slideIndex: -1 // assegnato sotto
                });
            });
        });
    });

    // Raggruppa blocchi consecutivi in slide (nuova slide al cambio modulo).
    const slides = [];
    let cur = null;
    let curChars = 0;
    for (const b of blocks) {
        const moduleChanged = cur && cur.moduleNum !== b.moduleNum;
        if (!cur || moduleChanged || curChars >= SLIDE_TARGET_CHARS) {
            cur = { index: slides.length, moduleNum: b.moduleNum, blockStart: b.index, blockEnd: b.index };
            slides.push(cur);
            curChars = 0;
        }
        cur.blockEnd = b.index;
        b.slideIndex = cur.index;
        curChars += b.ttsText.length;
    }

    // Arricchisce ogni slide (titolo, bullet, articoli) dal testo dei suoi blocchi.
    slides.forEach(s => {
        const own = blocks.slice(s.blockStart, s.blockEnd + 1);
        const plain = own.map(b => b.ttsText).join(' ');
        s.title = slideTitle(own) || `Slide ${s.index + 1}`;
        s.bullets = extractBullets(plain);
        s.articles = extractArticles(plain);
    });

    return { blocks, slides };
}
