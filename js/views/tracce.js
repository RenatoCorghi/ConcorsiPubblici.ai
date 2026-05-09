/* ============================================================
   TRACCE.JS — Vista Database Tracce Storiche
   ============================================================ */

import { AppState } from '../state.js';
import { DB_TRACCE } from '../../data.js';
import { escapeHtml } from '../utils.js';

export function renderTracce() {
    var html = `
        <div class="fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h1 class="text-3xl font-display font-bold text-white">Database Tracce Storiche</h1>
                <button onclick="document.getElementById('ai-trace-modal').classList.remove('hidden')" class="px-4 py-2.5 bg-gradient-to-r from-magis-600 to-indigo-600 hover:from-magis-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-magis-600/30 flex items-center justify-center gap-2 transition hover:scale-105 group whitespace-nowrap">
                    <i data-lucide="wand-2" class="w-4 h-4 group-hover:rotate-12 transition-transform"></i>
                    Sartoria AI
                </button>
            </div>
            
            <!-- Filters -->
            <div class="flex gap-2 mb-8 bg-gray-900/50 p-1 rounded-xl w-fit border border-gray-800 overflow-x-auto custom-scrollbar">
                ${['Tutte', 'Civile', 'Penale', 'Amministrativo'].map(m => `
                    <button onclick="app.setFilter('${m}')" class="px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${AppState.filterMateria === m ? 'bg-magis-600 text-white shadow-lg shadow-magis-600/20' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}">
                        ${m}
                    </button>
                `).join('')}
            </div>

            <!-- List -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    `;

    // Unisci tracce storiche con tracce generate dall'utente
    var allTraces = [...(AppState.aiTraces || []), ...DB_TRACCE];
    
    var filtered = allTraces.filter(t => AppState.filterMateria === 'Tutte' || t.materia === AppState.filterMateria);
    
    filtered.forEach((t, i) => {
        var delay = i * 0.05;
        var colorClass = t.materia === 'Civile' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : 
                           t.materia === 'Penale' ? 'text-red-400 bg-red-400/10 border-red-400/20' : 
                           'text-green-400 bg-green-400/10 border-green-400/20';
                           
        var badgeRight = '';
        var borderStyle = 'border-transparent';
        if (t.isAI) {
            borderStyle = 'border-magis-500/50 shadow-lg shadow-magis-500/10';
            badgeRight = `<span class="px-2 py-1 text-[10px] font-bold uppercase rounded bg-gradient-to-r from-magis-600 to-indigo-600 text-white flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3"></i> AI Gen</span>`;
        } else if (t.estratta) {
            badgeRight = `<span class="px-2 py-1 text-[10px] font-bold uppercase rounded bg-gray-800 border border-gray-700 text-white"><i data-lucide="check" class="w-3 h-3 inline mr-1"></i>Estratta</span>`;
        } else {
            badgeRight = `<span class="px-2 py-1 text-[10px] uppercase rounded text-gray-500 border border-gray-800">Non Estratta</span>`;
        }

        html += `
            <div class="card-hover glass-panel p-6 rounded-2xl flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-950 fade-in border ${borderStyle}" style="animation-delay: ${delay}s">
                <div class="flex justify-between items-start mb-4">
                    <span class="px-2.5 py-1 text-xs font-semibold rounded-md border ${colorClass}">${t.materia}</span>
                    <span class="text-gray-500 text-sm font-mono flex items-center gap-2">
                        ${t.isAI ? 
                            `<button onclick="app.toggleSaveAiTrace('${t.id}')" class="hover:text-magis-400 transition" title="Salva in memoria questa traccia AI"><i data-lucide="bookmark" class="w-4 h-4 ${t.saved ? 'fill-current text-magis-500' : ''}"></i></button>`
                            : t.anno}
                    </span>
                </div>
                <p class="text-gray-200 font-medium text-sm flex-grow mb-6 leading-relaxed">${escapeHtml(t.testo)}</p>
                <div class="mt-auto flex justify-between items-center border-t border-gray-800 pt-4">
                    ${badgeRight}
                    <button onclick="app.openBriefing('${t.id}')" class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center hover:bg-magis-600 hover:text-white transition group" title="Analizza e prepara la prova">
                        <i data-lucide="play" class="w-4 h-4 text-gray-400 group-hover:text-white ml-0.5"></i>
                    </button>
                </div>
            </div>
        `;
    });

    html += `</div></div>`;
    return html;
}
