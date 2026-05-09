/* ============================================================
   ORALE.JS — Viste simulatore esame orale (setup, session, result)
   ============================================================ */
import { AppState } from '../state.js';
import { OraleController } from '../controllers/orale.js';
import { escapeHtml } from '../utils.js';

var MATERIE_ORALI = [
    "Diritto Civile e Romano", "Procedura Civile", "Diritto Penale", 
    "Procedura Penale", "Diritto Amministrativo", "Costituzionale e Tributario",
    "Commerciale e Fallimentare", "Lavoro e Previdenza", "Diritto UE e Internazionale",
    "Diritto Ecclesiastico", "Ordinamento Giudiziario", "Lingua Straniera"
];

export function renderOraleSetup() {
    var matHtml = MATERIE_ORALI.map(m => `
        <div onclick="app.setOraleMateria('${m}')" class="p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${AppState.orale.materia === m ? 'bg-magis-600/20 border-magis-500' : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}">
            <span class="font-medium text-sm ${AppState.orale.materia === m ? 'text-white' : 'text-gray-300'}">${m}</span>
            ${AppState.orale.materia === m ? '<i data-lucide="check-circle" class="w-5 h-5 text-magis-400"></i>' : ''}
        </div>
    `).join('');

    var modes = [
        { id: 'standard', name: 'Standard', desc: 'Esaminatore unico, ritmo lineare.', icon: 'user' },
        { id: 'commissione', name: 'Commissione', desc: '3 AI persona (Presidente, Prof, Avv).', icon: 'users' },
        { id: 'incalzante', name: 'Incalzante', desc: 'Stress test. Interruzioni costanti.', icon: 'zap' }
    ];

    var modeHtml = modes.map(md => `
        <div onclick="app.setOraleMode('${md.id}')" class="p-4 rounded-xl border cursor-pointer transition flex gap-4 ${AppState.orale.mode === md.id ? (md.id === 'incalzante' ? 'bg-red-900/20 border-red-500' : 'bg-blue-900/20 border-blue-500') : 'bg-gray-900 border-gray-800 hover:bg-gray-800'}">
            <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${AppState.orale.mode === md.id ? (md.id === 'incalzante' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') : 'bg-gray-800 text-gray-400'}">
                <i data-lucide="${md.icon}" class="w-5 h-5"></i>
            </div>
            <div>
                <h4 class="font-bold text-white mb-1">${md.name}</h4>
                <p class="text-xs text-gray-400">${md.desc}</p>
            </div>
        </div>
    `).join('');

    return `
        <div class="fade-in max-w-6xl mx-auto">
            <div class="mb-8">
                <h1 class="text-4xl font-display font-bold text-white mb-2">Simulatore Orale</h1>
                <p class="text-gray-400">Seleziona la materia e la modalità di interrogazione per allenarti all'esame orale in modo intensivo.</p>
            </div>

            <div class="flex flex-col md:flex-row gap-8">
                <div class="w-full md:w-2/3">
                    <h3 class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Scegli Materia</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        ${matHtml}
                    </div>
                </div>

                <div class="w-full md:w-1/3 space-y-6">
                    <div>
                        <h3 class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Modalità AI</h3>
                        <div class="space-y-3">
                            ${modeHtml}
                        </div>
                    </div>
                    
                    <button onclick="app.startOrale()" class="w-full py-4 bg-white text-gray-950 font-bold rounded-xl hover:bg-gray-200 transition shadow-lg shadow-white/10 flex items-center justify-center gap-2 mt-8 ${!AppState.orale.materia ? 'opacity-50 cursor-not-allowed' : ''}">
                        <i data-lucide="play" class="w-5 h-5"></i> Avvia Interrogazione
                    </button>
                </div>
            </div>
        </div>
    `;
}

export function renderOraleSession() {
    var chatHtml = AppState.orale.messages.map(msg => {
        if(msg.role === 'ai') {
            var isCommissione = AppState.orale.mode === 'commissione';
            var prefix = 'Esaminatore';
            if (isCommissione) {
                if (msg.text.includes('[Professore]')) prefix = 'Professore';
                else if (msg.text.includes('[Avvocato]')) prefix = 'Avvocato';
                else prefix = 'Presidente';
            }
            var cleanText = escapeHtml(msg.text.replace(/\[.*?\]\s*/, ''));
            var color = AppState.orale.mode === 'incalzante' ? 'bg-red-900/20 border-red-900/50' : 'bg-gray-800 border-gray-700';

            return `
                <div class="flex gap-4 mb-6 fade-in">
                    <div class="w-10 h-10 shrink-0 rounded-full bg-gray-700 flex items-center justify-center border border-gray-600">
                        <i data-lucide="${AppState.orale.mode === 'incalzante' ? 'alert-octagon' : 'bot'}" class="w-5 h-5 ${AppState.orale.mode === 'incalzante' ? 'text-red-400' : 'text-gray-300'}"></i>
                    </div>
                    <div class="p-4 rounded-2xl rounded-tl-sm border ${color} max-w-[80%] text-gray-200 shadow-md">
                        <div class="text-[10px] uppercase font-bold ${AppState.orale.mode === 'incalzante' ? 'text-red-400' : 'text-gray-400'} mb-1 tracking-wider">${prefix}</div>
                        ${cleanText}
                    </div>
                </div>
            `;
        } else {
             return `
                <div class="flex justify-end gap-4 mb-6 fade-in">
                    <div class="p-4 rounded-2xl rounded-tr-sm bg-magis-600 text-white max-w-[80%] shadow-lg shadow-magis-600/20">
                        ${escapeHtml(msg.text)}
                    </div>
                    <div class="w-10 h-10 shrink-0 rounded-full bg-magis-800 flex items-center justify-center border border-magis-700">
                        <i data-lucide="user" class="w-5 h-5 text-gray-300"></i>
                    </div>
                </div>
            `;
        }
    }).join('');

    return `
        <div class="max-w-4xl mx-auto flex flex-col h-[calc(100vh-120px)] fade-in">
            <div class="flex items-center justify-between bg-gray-900 p-4 border border-gray-800 rounded-xl mb-4 shrink-0">
                 <div>
                    <h2 class="text-white font-bold">${escapeHtml(AppState.orale.materia)}</h2>
                    <div class="text-xs text-gray-500 uppercase tracking-widest flex items-center gap-1"><i data-lucide="activity" class="w-3 h-3 text-magis-400"></i> Modalità: ${AppState.orale.mode}</div>
                </div>
                <button onclick="app.endOrale()" class="px-4 py-2 bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white rounded-lg text-sm font-bold border border-red-600/30 transition flex items-center gap-1">
                    <i data-lucide="stop-circle" class="w-4 h-4"></i> Termina Exam
                </button>
            </div>

            <div id="orale-chat-container" class="flex-grow overflow-y-auto mb-4 px-2 scroll-smooth">
                ${chatHtml}
            </div>

            <div class="bg-gray-900 p-4 border border-gray-800 rounded-xl shrink-0 flex gap-3 items-end focus-within:border-gray-600 transition relative">
                <button id="btn-mic" onclick="app.toggleDictation()" class="w-12 h-12 rounded-full flex items-center justify-center transition shrink-0 bg-gray-800 text-gray-400 hover:text-white border border-gray-700" title="Usa il Microfono">
                    <i id="icon-mic" data-lucide="mic" class="w-5 h-5"></i>
                </button>
                <textarea id="orale-input" rows="2" class="flex-grow bg-transparent text-white font-sans outline-none resize-none px-2 py-1 placeholder-gray-600" placeholder="Rispondi all'esaminatore..." onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); app.sendOraleMessage(); }"></textarea>
                <button onclick="app.sendOraleMessage()" class="w-12 h-12 bg-white text-gray-950 rounded-full flex items-center justify-center hover:bg-gray-200 transition shrink-0 shadow-lg shadow-white/10">
                    <i data-lucide="send" class="w-5 h-5 ml-1"></i>
                </button>
            </div>
        </div>
    `;
}

export function renderOraleResult() {
    var isIdoneo = AppState.orale.result ? AppState.orale.result.idoneo : (AppState.orale.voto >= 6);
    var stimaTotale = (AppState.orale.voto * 10) + Math.floor(Math.random() * 5); 
    var feedbackMsg = AppState.orale.result ? AppState.orale.result.feedback : '';

    return `
        <div class="max-w-2xl mx-auto fade-in h-full flex flex-col items-center justify-center pt-8 pb-12">
            
            <div class="w-full bg-gray-900 border border-gray-800 rounded-3xl p-10 text-center relative overflow-hidden shadow-2xl">
                <div class="absolute inset-0 bg-gradient-to-tr ${isIdoneo ? 'from-green-900/20 to-transparent' : 'from-red-900/20 to-transparent'}"></div>
                
                <h2 class="text-sm uppercase font-bold text-gray-400 tracking-widest mb-2 relative z-10">Esito Interrogazione</h2>
                <h1 class="text-2xl font-bold text-white mb-8 relative z-10">${escapeHtml(AppState.orale.materia)}</h1>
                
                <div class="w-40 h-40 mx-auto rounded-full border-8 ${isIdoneo ? 'border-green-500' : 'border-red-500'} bg-gray-950 flex flex-col items-center justify-center shadow-inner relative z-10 mb-8">
                    <span class="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-1">Voto Finale</span>
                    <div class="text-6xl font-display font-bold leading-none ${isIdoneo ? 'text-green-400' : 'text-red-400'}">${AppState.orale.voto}</div>
                    <span class="text-xs text-gray-600 mt-1">/ 10</span>
                </div>

                <div class="max-w-md mx-auto relative z-10">
                    ${!isIdoneo 
                        ? `<div class="p-4 bg-red-900/40 border border-red-800 text-red-200 rounded-xl mb-6 text-sm text-left"><div class="font-bold flex items-center gap-2 mb-1"><i data-lucide="x-circle" class="w-4 h-4"></i> Non idoneo</div>${escapeHtml(feedbackMsg)}</div>` 
                        : `<div class="p-4 bg-green-900/40 border border-green-800 text-green-200 rounded-xl mb-6 text-sm text-left"><div class="font-bold flex items-center gap-2 mb-1"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Idoneo</div>${escapeHtml(feedbackMsg)}</div>`
                    }
                    
                    <div class="flex justify-between items-center px-4 py-3 bg-gray-950 border border-gray-800 rounded-lg shadow-inner">
                        <span class="text-xs text-gray-500 font-bold uppercase">Stima Computo Totale</span>
                        <span class="font-mono ${isIdoneo ? 'text-magis-400' : 'text-gray-400'} font-bold text-lg">${stimaTotale}/150</span>
                    </div>
                </div>
            </div>

            <button onclick="app.navigate('orale-setup')" class="mt-8 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition">Nuova Simulazione Orale</button>
        </div>
    `;
}

// --- RENDERING E APPEND SINGOLO MESSAGGIO (senza full re-render) ---

function renderSingleOraleMessage(msg) {
    if (msg.role === 'ai') {
        var isCommissione = AppState.orale.mode === 'commissione';
        var prefix = 'Esaminatore';
        var icon = AppState.orale.mode === 'incalzante' ? 'alert-octagon' : 'bot';
        var iconColor = AppState.orale.mode === 'incalzante' ? 'text-red-400' : 'text-gray-300';
        var bgIcon = 'bg-gray-700';
        var color = AppState.orale.mode === 'incalzante' ? 'bg-red-900/20 border-red-900/50' : 'bg-gray-800 border-gray-700';
        var textColor = AppState.orale.mode === 'incalzante' ? 'text-red-400' : 'text-gray-400';

        if (isCommissione) {
            var speakerMatch = msg.text.match(/\[(.*?)\]/);
            var speaker = speakerMatch ? speakerMatch[1].toLowerCase() : 'presidente';
            
            if (speaker.includes('professore') || speaker.includes('professoressa')) {
                prefix = 'Professore Universitario';
                icon = 'book-open';
                bgIcon = 'bg-green-900/50 border-green-700';
                iconColor = 'text-green-400';
                textColor = 'text-green-400';
                color = 'bg-green-900/10 border-green-900/50';
            } else if (speaker.includes('avvocato')) {
                prefix = 'Avvocato membro';
                icon = 'briefcase';
                bgIcon = 'bg-blue-900/50 border-blue-700';
                iconColor = 'text-blue-400';
                textColor = 'text-blue-400';
                color = 'bg-blue-900/10 border-blue-900/50';
            } else {
                prefix = 'Presidente Commissione';
                icon = 'scale';
                bgIcon = 'bg-magis-900/50 border-magis-700';
                iconColor = 'text-magis-400';
                textColor = 'text-magis-400';
                color = 'bg-magis-900/10 border-magis-900/50';
            }
        }
        
        var cleanText = escapeHtml(msg.text.replace(/\[.*?\]\s*/, ''));

        return `
            <div class="flex gap-4 mb-6 fade-in">
                <div class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center border ${bgIcon}">
                    <i data-lucide="${icon}" class="w-5 h-5 ${iconColor}"></i>
                </div>
                <div class="p-4 rounded-2xl rounded-tl-sm border ${color} max-w-[80%] text-gray-200 shadow-md">
                    <div class="text-[10px] uppercase font-bold ${textColor} mb-1 tracking-wider">${prefix}</div>
                    ${cleanText}
                </div>
            </div>
        `;
    } else {
        return `
            <div class="flex justify-end gap-4 mb-6 fade-in">
                <div class="p-4 rounded-2xl rounded-tr-sm bg-magis-600 text-white max-w-[80%] shadow-lg shadow-magis-600/20">
                    ${escapeHtml(msg.text)}
                </div>
                <div class="w-10 h-10 shrink-0 rounded-full bg-magis-800 flex items-center justify-center border border-magis-700">
                    <i data-lucide="user" class="w-5 h-5 text-gray-300"></i>
                </div>
            </div>
        `;
    }
}

export function appendOraleMessage(msg) {
    var container = document.getElementById('orale-chat-container');
    if (!container) { renderView(); return; }
    
    var wrapper = document.createElement('div');
    wrapper.innerHTML = renderSingleOraleMessage(msg);
    if (wrapper.firstElementChild) {
        container.appendChild(wrapper.firstElementChild);
    }
    lucide.createIcons();
    container.scrollTop = container.scrollHeight;
}
