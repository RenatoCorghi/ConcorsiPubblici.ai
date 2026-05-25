import { APP_CONFIG } from './config.js';
import { getAuthHeaders } from './api/helpers.js';

let tooltipEl = null;
let titleEl = null;
let contentEl = null;
let hoverTimeout = null;

// Semplice cache in-memory per evitare chiamate ripetute durante la stessa sessione
const memoryCache = new Map();

export function initNormeTooltip() {
    // Crea l'elemento HTML del tooltip se non esiste
    if (!document.getElementById('norma-tooltip')) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'norma-tooltip';
        tooltipEl.className = 'fixed z-[9999] hidden max-w-lg w-full bg-gray-950/95 backdrop-blur-xl border border-magis-500/30 rounded-2xl p-5 shadow-2xl opacity-0 transition-opacity duration-300';
        tooltipEl.innerHTML = `
            <div class="flex items-center gap-3 mb-3 border-b border-gray-800 pb-3">
                <div class="w-8 h-8 rounded-full bg-magis-500/20 flex items-center justify-center">
                    <i data-lucide="scale" class="w-4 h-4 text-magis-400"></i>
                </div>
                <h4 id="norma-tooltip-title" class="font-bold text-white text-sm"></h4>
            </div>
            <div id="norma-tooltip-content" class="text-sm text-gray-300 leading-relaxed min-h-[60px] max-h-[60vh] overflow-y-auto custom-scrollbar">
            </div>
        `;
        document.body.appendChild(tooltipEl);
        
        titleEl = document.getElementById('norma-tooltip-title');
        contentEl = document.getElementById('norma-tooltip-content');
        
        if (window.lucide) window.lucide.createIcons({ root: tooltipEl });

        // Aggiungi listener al tooltip stesso per tenerlo aperto se l'utente ci passa sopra
        tooltipEl.addEventListener('mouseenter', () => {
            if (hoverTimeout) clearTimeout(hoverTimeout);
        });
        tooltipEl.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(closeTooltip, 300);
        });
    }

    // Usiamo il delegation event sul body per catturare tutti gli hover su .norma-hover
    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);
    // Non seguiamo più il mouse in continuo per permettere all'utente di entrare nel tooltip e scrollare
}

function closeTooltip() {
    tooltipEl.classList.add('opacity-0');
    setTimeout(() => {
        if (tooltipEl.classList.contains('opacity-0')) {
            tooltipEl.classList.add('hidden');
        }
    }, 300);

async function handleMouseOver(e) {
    const target = e.target.closest('.norma-hover');
    if (!target) return;

    if (hoverTimeout) clearTimeout(hoverTimeout);

    const norma = target.getAttribute('data-norma');
    if (!norma) return;

    // Mostra il tooltip in stato di caricamento
    titleEl.textContent = norma;
    contentEl.innerHTML = `
        <div class="flex items-center gap-3 text-gray-500 justify-center py-4">
            <div class="w-5 h-5 border-2 border-magis-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Ricerca nel codice...</span>
        </div>
    `;
    
    positionTooltip(e);
    tooltipEl.classList.remove('hidden');
    // Piccolo delay per permettere il display:block prima dell'opacity
    requestAnimationFrame(() => {
        tooltipEl.classList.remove('opacity-0');
    });

    try {
        const text = await fetchNormaText(norma);
        if (titleEl.textContent === norma) { // Se nel frattempo l'utente non ha spostato il mouse su un'altra norma
            contentEl.innerHTML = `<p class="whitespace-pre-wrap">${text}</p>`;
        }
    } catch (err) {
        if (titleEl.textContent === norma) {
            contentEl.innerHTML = `<p class="text-red-400">Impossibile recuperare il testo della norma al momento.</p>`;
        }
    }
}

function handleMouseOut(e) {
    const target = e.target.closest('.norma-hover');
    if (!target) return;
    
    // Nascondi il tooltip con un ritardo per permettere di spostare il mouse sul tooltip
    hoverTimeout = setTimeout(closeTooltip, 300);
}

function positionTooltip(e) {
    const margin = 20;
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    
    const rect = tooltipEl.getBoundingClientRect();
    
    // Se esce dallo schermo a destra, spostalo a sinistra del mouse
    if (x + rect.width > window.innerWidth - margin) {
        x = e.clientX - rect.width - 15;
    }
    
    // Se esce dallo schermo in basso, spostalo sopra il mouse
    if (y + rect.height > window.innerHeight - margin) {
        y = e.clientY - rect.height - 15;
    }
    
    // Se esce sopra (improbabile, ma per sicurezza)
    if (y < margin) y = margin;
    // Se esce a sinistra
    if (x < margin) x = margin;

    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
}

async function fetchNormaText(riferimento) {
    // 1. Controllo cache in memoria
    if (memoryCache.has(riferimento)) {
        return memoryCache.get(riferimento);
    }

    // 2. Controllo DB Supabase
    if (window.supabaseClient) {
        const { data, error } = await window.supabaseClient
            .from('norme_cache')
            .select('testo')
            .eq('riferimento', riferimento)
            .maybeSingle();
            
        if (data && data.testo) {
            memoryCache.set(riferimento, data.testo);
            return data.testo;
        }
    }

    // 3. Fallback: chiediamo all'AI!
    // Chiamata diretta usando askRAG con una query mirata che bypassa il RAG e risponde direttamente.
    // Oppure, poiché askRAG cercherà nel DB vettoriale e potrebbe non trovare la norma pura, 
    // potremmo fare una call a un'Edge Function o semplicemente usare un prompt super specifico.
    
    const prompt = `Sei un assistente giuridico. L'utente richiede il testo ESATTO dell'articolo: "${riferimento}". Restituisci SOLO IL TESTO della norma, senza introduzioni, commenti o spiegazioni. Se la norma ha più commi, separali con ritorni a capo.`;
    
    try {
        const response = await fetch('/api/proxy', {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
                feature: 'normeTooltip',
                provider: APP_CONFIG.ACTIVE_AI_STACK,
                model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CHAT,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        let text = "";
        if (data && data.choices && data.choices[0]) {
            text = data.choices[0].message.content.trim();
        } else {
            throw new Error("Empty AI response");
        }
        
        // Pulizia
        text = text.replace(/Ecco il testo.+?:/gi, '').trim();

        // Salva in memoria
        memoryCache.set(riferimento, text);

        // Salva su Supabase
        if (window.supabaseClient) {
            try {
                const { error } = await window.supabaseClient.from('norme_cache').insert({
                    riferimento: riferimento,
                    testo: text
                });
                if (error) console.error("Failed to cache norma", error);
            } catch (dbErr) {
                console.error("DB Insert Exception:", dbErr);
            }
        }

        return text;
    } catch (e) {
        console.error("AI fetch error:", e);
        return "Errore nel recupero della norma. Riprova più tardi.";
    }
}
