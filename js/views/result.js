/* ============================================================
   RESULT.JS — Vista risultati con tab correzione/schema/confronto/elaborato
   ============================================================ */

import { AppState } from '../state.js';
import { formatTime, escapeHtml } from '../utils.js';

export function renderResult() {
    var res = AppState.currentResult || (AppState.history.length > 0 ? AppState.history[AppState.history.length-1] : null);
    
    if(!res) {
        return `<div class="text-center p-12 text-gray-400">Nessun risultato disponibile. <br><button onclick="app.navigate('home')" class="mt-4 text-magis-400 underline">Torna alla Home</button></div>`;
    }

    var tabs = [
        { id: 'correzione', label: 'Correzione', icon: 'check-circle' },
        { id: 'schema', label: 'Schema Ideale', icon: 'lightbulb' },
        { id: 'confronto', label: 'Confronto', icon: 'git-compare' },
        { id: 'elaborato', label: 'Il tuo elaborato', icon: 'file-text' }
    ];

    var tabButtons = tabs.map(t => {
        var isActive = AppState.resultTab === t.id;
        return `
        <button onclick="app.setResultTab('${t.id}')" class="flex-1 py-3 px-4 font-semibold text-sm flex items-center justify-center gap-2 transition border-b-2 ${isActive ? 'text-magis-400 border-magis-500 bg-magis-900/10' : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800'}">
            <i data-lucide="${t.icon}" class="w-4 h-4"></i> ${t.label}
        </button>`;
    }).join('');

    var tabContent = '';
    
    if (AppState.resultTab === 'correzione') {
        tabContent = renderResultCorrezione(res);
    } else if (AppState.resultTab === 'schema') {
        tabContent = renderResultSchema(res);
    } else if (AppState.resultTab === 'confronto') {
        tabContent = renderResultConfronto(res);
    } else if (AppState.resultTab === 'elaborato') {
        tabContent = renderResultElaborato(res);
    }

    return `
        <div class="max-w-5xl mx-auto flex flex-col h-full fade-in pb-12">
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
                <div class="flex items-center gap-4">
                    <button onclick="app.navigate('home')" class="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition group border border-gray-800">
                        <i data-lucide="arrow-left" class="w-5 h-5 group-hover:-translate-x-0.5 transition-transform"></i>
                    </button>
                    <div>
                        <h1 class="text-3xl font-display font-bold text-white">Analisi Risultato</h1>
                        <p class="text-sm text-gray-500 mt-1">Review elaborato in ${res.materia}</p>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button onclick="app.shareResult()" class="px-4 py-2 bg-blue-600/20 border border-blue-500/50 hover:bg-blue-600/40 text-blue-400 rounded-lg flex items-center gap-2 transition text-sm font-semibold shadow-sm">
                        <i data-lucide="share-2" class="w-4 h-4"></i> Condividi
                    </button>
                    <button onclick="app.exportPDF()" class="px-4 py-2 bg-gray-900 border border-gray-700 hover:bg-gray-800 text-gray-200 rounded-lg flex items-center gap-2 transition text-sm font-semibold shadow-sm">
                        <i data-lucide="download" class="w-4 h-4"></i> Scarica PDF
                    </button>
                </div>
            </div>

            <!-- Certificato Banner (se superato ad alto livello) -->
            ${res.voto >= 14 ? `
                <div class="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-900/40 to-yellow-600/10 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center">
                            <i data-lucide="award" class="w-5 h-5 text-yellow-500"></i>
                        </div>
                        <div>
                            <h3 class="text-yellow-500 font-bold text-sm uppercase tracking-widest">Eccellenza Raggiunta</h3>
                            <p class="text-gray-300 text-xs">Hai superato la simulazione con un punteggio di eccellenza. Ottieni il tuo certificato.</p>
                        </div>
                    </div>
                    <button class="px-4 py-2 bg-yellow-600 text-white font-bold rounded-lg text-sm hover:bg-yellow-500 transition shadow-lg shadow-yellow-600/20">Richiedi Certificato</button>
                </div>
            ` : ''}

            <!-- TAB BAR -->
            <div id="result-tab-bar" class="flex w-full mb-8 rounded-xl bg-gray-900/50 border border-gray-800 p-1.5 overflow-hidden">
                ${tabButtons}
            </div>

            <!-- CONTENUTO DEL TAB -->
            <div id="result-tab-content" class="flex-grow">
                ${tabContent}
            </div>
        </div>
    `;
}

// --- Sub-tabs ---

function renderResultCorrezione(res) {
    var metriche = res.metriche || { correttezza: 60, struttura: 60, terminologia: 60, pertinenza: 60 };

    var matitaBluHtml = (res.matita_blu && res.matita_blu.length > 0) ? res.matita_blu.map(l => `<li class="mb-2 last:mb-0">${escapeHtml(l)}</li>`).join('') : '';

    return `
        <div class="fade-in space-y-8">
            <!-- Voto e Riepilogo -->
            <div class="flex flex-col md:flex-row gap-8 items-center bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                <div class="absolute right-0 top-0 opacity-[0.03] scale-150 transform translate-x-1/4 -translate-y-1/4"><i data-lucide="award" class="w-64 h-64"></i></div>
                <div class="flex-shrink-0 flex flex-col items-center justify-center w-40 h-40 rounded-full border-[6px] ${res.voto >= 15 ? 'border-emerald-500/30 text-emerald-400' : res.voto >= 12 ? 'border-yellow-500/30 text-yellow-400' : 'border-red-500/30 text-red-500'} bg-gray-950 shadow-inner z-10">
                    <span class="text-xs uppercase font-bold tracking-widest text-gray-500 mb-1">Voto Finale</span>
                    <div class="text-5xl font-display font-bold leading-none">${res.voto}</div>
                    <span class="text-[10px] uppercase tracking-widest font-bold mt-2 px-3 py-1 rounded-full ${res.voto >= 12 ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}">${escapeHtml(res.giudizio_idoneita || 'NON IDONEO')}</span>
                </div>
                <div class="flex-grow z-10 w-full">
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        ${[
                            { n: 'Correttezza Giuridica', p: metriche.correttezza, c: 'bg-indigo-500' },
                            { n: 'Struttura Sistematica', p: metriche.struttura, c: 'bg-blue-500' },
                            { n: 'Terminologia', p: metriche.terminologia, c: 'bg-purple-500' },
                            { n: 'Pertinenza', p: metriche.pertinenza, c: 'bg-teal-500' }
                        ].map(crit => `
                        <div>
                            <div class="flex justify-between text-xs mb-1"><span class="text-gray-400 font-semibold">${crit.n}</span><span class="text-gray-500">${crit.p}%</span></div>
                            <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div class="h-full ${crit.c}" style="width: ${crit.p}%;"></div></div>
                        </div>
                        `).join('')}
                    </div>
                    
                    ${res.keywords && res.keywords.length > 0 ? `<div class="mt-4"><div class="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Keyword Rilevate:</div><div class="flex flex-wrap gap-2">${res.keywords.map(function(k){ return '<span class="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-magis-300 font-bold">' + escapeHtml(k) + '</span>'; }).join('')}</div></div>` : ''}
                </div>
            </div>

            <!-- Matita Blu (Solo se presente) -->
            ${matitaBluHtml ? `
            <div class="bg-red-950/20 border border-red-900/50 rounded-2xl p-6 relative overflow-hidden">
                <div class="absolute left-0 top-0 bottom-0 w-1.5 bg-red-600"></div>
                <h3 class="text-red-400 font-bold mb-4 flex items-center gap-2"><i data-lucide="edit-3" class="w-5 h-5"></i> La Matita Blu (Errori Dirimenti)</h3>
                <ul class="list-disc list-inside text-red-200/90 text-sm marker:text-red-600 space-y-1">
                    ${matitaBluHtml}
                </ul>
            </div>
            ` : ''}

            <!-- Giudizio Strutturato -->
            <div class="space-y-4">
                <div class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h3 class="text-magis-400 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider"><i data-lucide="target" class="w-4 h-4"></i> 1. Centratura e Forma</h3>
                    <p class="text-gray-300 text-sm leading-relaxed">${escapeHtml(res.feedback_centratura || '')}</p>
                </div>
                
                <div class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h3 class="text-blue-400 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider"><i data-lucide="layers" class="w-4 h-4"></i> 2. Inquadramento Sistematico e Bilanciamento</h3>
                    <p class="text-gray-300 text-sm leading-relaxed">${escapeHtml(res.feedback_inquadramento || '')}</p>
                </div>
                
                <div class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                    <h3 class="text-indigo-400 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider"><i data-lucide="network" class="w-4 h-4"></i> 3. Gerarchia e Nomofilachia</h3>
                    <p class="text-gray-300 text-sm leading-relaxed">${escapeHtml(res.feedback_gerarchia || '')}</p>
                </div>
            </div>

            <!-- Il Consiglio del Presidente -->
            ${res.consiglio_presidente ? `
            <div class="bg-gradient-to-r from-yellow-900/20 to-transparent border-l-4 border-yellow-600 rounded-r-2xl p-6">
                <h3 class="text-yellow-500 font-bold mb-2 flex items-center gap-2 text-sm"><i data-lucide="lightbulb" class="w-4 h-4"></i> Il Consiglio del Presidente</h3>
                <p class="text-yellow-100/80 text-sm leading-relaxed italic">"${escapeHtml(res.consiglio_presidente)}"</p>
            </div>
            ` : ''}

            <!-- Fonti RAG (Vettoriale) -->
            ${res.rag_sources && res.rag_sources.length > 0 ? `
            <div class="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-6">
                <h3 class="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                    <i data-lucide="scale" class="w-5 h-5"></i> Fonti Giuridiche Consultate dall'AI
                    <span class="ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-900/50 text-emerald-300 border border-emerald-800">RAG</span>
                </h3>
                <p class="text-xs text-gray-500 mb-4">L'AI ha consultato queste fonti dal database vettoriale per valutare il tuo elaborato.</p>
                <div class="space-y-3">
                    ${res.rag_sources.map(s => `
                        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 relative overflow-hidden hover:border-emerald-800/50 transition">
                            <div class="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                            <div class="flex flex-wrap items-center gap-2 mb-2 ml-2">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/50 text-emerald-300 border border-emerald-800">${escapeHtml(s.tipo || 'documento')}</span>
                                <span class="text-xs font-bold text-white">${escapeHtml(s.materia || '')}</span>
                                <span class="text-[10px] text-gray-500 ml-auto">Affinità: ${(s.similarity * 100).toFixed(0)}%</span>
                            </div>
                            <p class="text-xs text-gray-400 leading-relaxed ml-2 line-clamp-2">${escapeHtml((s.snippet || '').substring(0, 200))}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

function renderResultSchema(res) {
    var schema = res.schema_ideale || [];
    var schemaHtml = schema.length > 0 ? schema.map(s => `
        <h3 class="text-lg font-bold text-white mb-2">${escapeHtml(s.titolo)}</h3>
        <p class="text-gray-300 text-sm mb-6 leading-relaxed">${escapeHtml(s.desc)}</p>
    `).join('') : '<p class="text-gray-500">Nessuno schema disponibile.</p>';

    return `
        <div class="fade-in flex flex-col md:flex-row gap-6">
            <div class="w-full md:w-2/3 space-y-6">
                <div class="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
                    <h2 class="text-sm uppercase font-bold text-magis-400 tracking-widest border-b border-gray-800 pb-3 mb-6">Come lo avrebbe scritto l'AI</h2>
                    ${schemaHtml}
                </div>
            </div>
            
            <div class="w-full md:w-1/3">
                <div class="sticky top-20 bg-blue-950/20 border border-blue-900/30 rounded-2xl p-6">
                    <h3 class="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2"><i data-lucide="scale" class="w-4 h-4"></i> Sentenze Pertinenti</h3>
                    <div class="space-y-4">
                        ${res.rag_sources && res.rag_sources.length > 0 ? res.rag_sources.map(s => `
                            <div class="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
                                <div class="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600"></div>
                                <div class="text-[10px] font-bold text-emerald-400 mb-1">${escapeHtml(s.tipo || 'documento')} — ${escapeHtml(s.materia || '')}</div>
                                <p class="text-[11px] text-gray-500 mb-1">Affinità: ${(s.similarity * 100).toFixed(0)}%</p>
                                <p class="text-xs text-gray-300 line-clamp-3">${escapeHtml((s.snippet || '').substring(0, 150))}</p>
                            </div>
                        `).join('') : `
                            <div class="bg-gray-900 border border-gray-800 rounded-lg p-3 relative overflow-hidden">
                                <div class="absolute left-0 top-0 bottom-0 w-1 bg-gray-600"></div>
                                <p class="text-xs text-gray-500">Nessuna sentenza trovata nel database per questa traccia.</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderResultConfronto(res) {
    var conf = res.confronto || [];
    var errHtml = conf.length > 0 ? conf.map(c => `<li class="bg-gray-950 p-4 rounded-xl border border-gray-800 text-sm text-gray-300">${escapeHtml(c.errore_candidato)}</li>`).join('') : '<li class="text-gray-500">Nessun errore grave rilevato.</li>';
    var corHtml = conf.length > 0 ? conf.map(c => `<li class="bg-magis-950/20 p-4 rounded-xl border border-magis-900/30 text-sm text-gray-200">${escapeHtml(c.correzione_ideale)}</li>`).join('') : '<li class="text-gray-500">-</li>';

    return `
        <div class="fade-in grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-900/80 border border-gray-800 p-6 rounded-2xl border-t-4 border-t-gray-500">
                <h3 class="text-gray-400 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2"><i data-lucide="user-x" class="w-4 h-4"></i> Cosa hai scritto tu</h3>
                <ul class="space-y-4">
                    ${errHtml}
                </ul>
            </div>
            <div class="bg-gray-900 border border-gray-800 p-6 rounded-2xl border-t-4 border-t-magis-500 shadow-xl shadow-magis-500/10">
                <h3 class="text-magis-400 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i> Cosa mancava / Correzione AI</h3>
                <ul class="space-y-4">
                    ${corHtml}
                </ul>
            </div>
        </div>
    `;
}

function renderResultElaborato(res) {
    return `
        <div class="fade-in bg-gray-950 border border-gray-800 rounded-2xl shadow-inner min-h-[500px] overflow-hidden flex flex-col">
            <div class="bg-gray-900 px-6 py-3 border-b border-gray-800 flex justify-between items-center">
                <span class="text-sm font-semibold text-gray-400 flex items-center gap-2"><i data-lucide="lock" class="w-4 h-4 text-gray-600"></i> Copia ReadOnly</span>
                <span class="text-xs text-gray-500">Consegnato il: ${new Date(res.date).toLocaleDateString('it-IT')}</span>
            </div>
            <div class="p-8 text-gray-300 leading-relaxed font-serif text-lg whitespace-pre-wrap overflow-y-auto flex-grow">${escapeHtml(res.text)}</div>
        </div>
    `;
}

// --- AGGIORNAMENTO MIRATO DEI TAB (senza full re-render) ---

export function updateResultTabContent() {
    var tabBar = document.getElementById('result-tab-bar');
    var tabContent = document.getElementById('result-tab-content');
    if (!tabBar || !tabContent) { renderView(); return; }
    
    var res = AppState.currentResult || (AppState.history.length > 0 ? AppState.history[AppState.history.length-1] : null);
    if (!res) return;
    
    var tabs = [
        { id: 'correzione', label: 'Correzione', icon: 'check-circle' },
        { id: 'schema', label: 'Schema Ideale', icon: 'lightbulb' },
        { id: 'confronto', label: 'Confronto', icon: 'git-compare' },
        { id: 'elaborato', label: 'Il tuo elaborato', icon: 'file-text' }
    ];
    
    // Aggiorna bottoni tab
    tabBar.innerHTML = tabs.map(function(t) {
        var isActive = AppState.resultTab === t.id;
        return '<button onclick="app.setResultTab(\'' + t.id + '\')" class="flex-1 py-3 px-4 font-semibold text-sm flex items-center justify-center gap-2 transition border-b-2 ' + (isActive ? 'text-magis-400 border-magis-500 bg-magis-900/10' : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800') + '"><i data-lucide="' + t.icon + '" class="w-4 h-4"></i> ' + t.label + '</button>';
    }).join('');
    
    // Aggiorna contenuto tab
    var content = '';
    if (AppState.resultTab === 'correzione') content = renderResultCorrezione(res);
    else if (AppState.resultTab === 'schema') content = renderResultSchema(res);
    else if (AppState.resultTab === 'confronto') content = renderResultConfronto(res);
    else if (AppState.resultTab === 'elaborato') content = renderResultElaborato(res);
    
    tabContent.innerHTML = content;
    lucide.createIcons();
}
