/* ============================================================
   BRIEFING.JS — Vista "Briefing del Commissario"
   
   Schermata intermedia tra la selezione della traccia e 
   l'inizio della simulazione. L'AI genera indicazioni 
   strutturate su come affrontare la traccia.
   ============================================================ */

import { AppState } from '../state.js';
import { escapeHtml } from '../utils.js';

/**
 * Renderizza la vista briefing.
 * Il briefing viene generato dall'AI e salvato in AppState.currentBriefing.
 */
export function renderBriefing() {
    const traccia = AppState.currentSimulationTask;
    if (!traccia) {
        return `<div class="fade-in text-center py-20">
            <p class="text-gray-400">Nessuna traccia selezionata.</p>
            <button onclick="app.navigate('tracce')" class="mt-4 px-6 py-2 bg-magis-600 text-white rounded-lg">Torna alle Tracce</button>
        </div>`;
    }

    const briefing = AppState.currentBriefing;
    const isLoading = !briefing || briefing.loading;
    const hasError = briefing && briefing.error;
    const concorso = AppState.userProfile?.concorso || 'Magistratura';

    // Colore per materia
    const materiaColors = {
        'Civile': { badge: 'text-blue-400 bg-blue-400/10 border-blue-400/20', glow: 'shadow-blue-500/10' },
        'Penale': { badge: 'text-red-400 bg-red-400/10 border-red-400/20', glow: 'shadow-red-500/10' },
        'Amministrativo': { badge: 'text-green-400 bg-green-400/10 border-green-400/20', glow: 'shadow-green-500/10' }
    };
    const colors = materiaColors[traccia.materia] || materiaColors['Civile'];

    return `
        <div class="fade-in max-w-4xl mx-auto">
            <!-- Header -->
            <div class="flex items-center gap-3 mb-2">
                <button onclick="app.navigate('tracce')" class="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition">
                    <i data-lucide="arrow-left" class="w-5 h-5"></i>
                </button>
                <div>
                    <h1 class="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-3">
                        <i data-lucide="compass" class="w-7 h-7 text-magis-400"></i>
                        Briefing Pre-Svolgimento
                    </h1>
                    <p class="text-gray-500 text-sm mt-1">Analisi strategica della traccia prima di iniziare</p>
                </div>
            </div>

            <!-- Traccia Card -->
            <div class="mt-6 bg-gray-900/80 border border-gray-800 rounded-2xl p-6 ${colors.glow} shadow-lg">
                <div class="flex items-center justify-between mb-3">
                    <span class="px-3 py-1 text-xs font-bold rounded-lg border ${colors.badge}">${traccia.materia}</span>
                    <span class="text-gray-500 text-xs font-mono">${traccia.anno || 'AI'} · ${concorso}</span>
                </div>
                <p class="text-gray-200 font-medium leading-relaxed">${escapeHtml(traccia.testo)}</p>
                ${traccia.elementi_chiave ? `
                    <div class="flex flex-wrap gap-2 mt-4">
                        ${traccia.elementi_chiave.map(k => `<span class="px-2 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded-full border border-gray-700">${escapeHtml(k)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>

            <!-- Briefing Content -->
            <div class="mt-8">
                ${isLoading ? renderLoadingState() : (hasError ? renderErrorState(briefing.error) : renderBriefingContent(briefing))}
            </div>

            <!-- Action Bar -->
            <div class="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-center pb-8">
                ${!isLoading ? `
                    <button onclick="app.startSimulationFromBriefing()" 
                        class="px-8 py-4 bg-gradient-to-r from-magis-600 to-indigo-600 hover:from-magis-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-magis-600/30 flex items-center gap-3 transition hover:scale-105 group">
                        <i data-lucide="play" class="w-5 h-5 group-hover:scale-110 transition-transform"></i>
                        Inizia la Simulazione (8 ore)
                    </button>
                    <button onclick="app.startLezioneFromTraccia()" 
                        class="px-6 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 hover:text-white hover:border-amber-400 rounded-xl font-bold transition flex items-center gap-2 hover:scale-105 group">
                        <i data-lucide="book-open" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
                        📖 Lezione Magistrale Prima
                    </button>
                    <button onclick="app.startSimulationFromBriefing(30, true)" 
                        class="px-6 py-3 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 rounded-xl font-medium transition flex items-center gap-2">
                        <i data-lucide="timer" class="w-4 h-4"></i>
                        Prova Veloce (30 min)
                    </button>
                ` : `
                    <div class="text-gray-500 text-sm animate-pulse">Preparazione del briefing in corso...</div>
                `}
            </div>
        </div>
    `;
}

function renderLoadingState() {
    return `
        <div class="flex flex-col items-center justify-center py-16 space-y-8 fade-in">
            <!-- Cerchi animati -->
            <div class="relative w-32 h-32 flex items-center justify-center">
                <div class="absolute inset-0 rounded-full border-4 border-magis-500/20 border-t-magis-500 animate-spin" style="animation-duration: 2s;"></div>
                <div class="absolute inset-4 rounded-full bg-magis-500/10 animate-ping" style="animation-duration: 1.5s;"></div>
                <div class="absolute inset-8 rounded-full border border-indigo-500/30 animate-spin-reverse"></div>
                <i data-lucide="brain" class="w-12 h-12 text-magis-400 relative z-10 animate-pulse"></i>
            </div>
            
            <div class="text-center space-y-4">
                <h3 class="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-magis-400 to-indigo-400 animate-pulse">
                    Elaborazione Strategia in corso...
                </h3>
                
                <div class="space-y-2 opacity-80">
                    <div class="flex items-center justify-center gap-3 text-sm text-gray-400">
                        <i data-lucide="database" class="w-4 h-4 text-magis-500 animate-bounce"></i>
                        <span>Ricerca giurisprudenza pertinente nel database</span>
                    </div>
                    <div class="flex items-center justify-center gap-3 text-sm text-gray-400">
                        <i data-lucide="shield-alert" class="w-4 h-4 text-red-400 animate-bounce" style="animation-delay: 0.2s"></i>
                        <span>Analisi delle insidie e trabocchetti nascosti</span>
                    </div>
                    <div class="flex items-center justify-center gap-3 text-sm text-gray-400">
                        <i data-lucide="map" class="w-4 h-4 text-blue-400 animate-bounce" style="animation-delay: 0.4s"></i>
                        <span>Stesura dello schema logico di svolgimento</span>
                    </div>
                </div>
            </div>
            
            <!-- Barra di caricamento infinita -->
            <div class="w-64 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-6 relative shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                <div class="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-magis-500 to-transparent animate-scan"></div>
            </div>
        </div>
        <style>
            @keyframes scan {
                0% { left: -50%; }
                100% { left: 100%; }
            }
            .animate-scan {
                animation: scan 1.5s infinite linear;
            }
            @keyframes spin-reverse {
                from { transform: rotate(360deg); }
                to { transform: rotate(0deg); }
            }
            .animate-spin-reverse {
                animation: spin-reverse 3s linear infinite;
            }
        </style>
    `;
}

function renderErrorState(error) {
    return `
        <div class="bg-red-950/30 border border-red-800/50 rounded-2xl p-8 text-center">
            <i data-lucide="alert-triangle" class="w-10 h-10 text-red-400 mx-auto mb-4"></i>
            <h3 class="text-lg font-bold text-red-300 mb-2">Errore nel Briefing</h3>
            <p class="text-red-400/70 text-sm mb-4">${escapeHtml(error)}</p>
            <div class="flex gap-3 justify-center">
                <button onclick="app.retryBriefing()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition font-medium text-sm">Riprova</button>
                <button onclick="app.startSimulationFromBriefing()" class="px-4 py-2 border border-gray-700 text-gray-400 rounded-lg hover:bg-gray-800 transition text-sm">Procedi senza briefing</button>
            </div>
        </div>
    `;
}

function renderBriefingContent(briefing) {
    const sections = [
        {
            icon: 'map',
            title: 'Schema di Svolgimento Consigliato',
            color: 'text-magis-400',
            bgColor: 'bg-magis-500/10 border-magis-500/20',
            content: briefing.schema || [],
            type: 'steps'
        },
        {
            icon: 'scale',
            title: 'Istituti Giuridici Chiave',
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10 border-blue-500/20',
            content: briefing.istituti || [],
            type: 'tags'
        },
        {
            icon: 'book-open',
            title: 'Riferimenti Giurisprudenziali',
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/10 border-amber-500/20',
            content: briefing.giurisprudenza || [],
            type: 'references'
        },
        {
            icon: 'alert-triangle',
            title: 'Insidie e Trappole da Evitare',
            color: 'text-red-400',
            bgColor: 'bg-red-500/10 border-red-500/20',
            content: briefing.insidie || [],
            type: 'warnings'
        },
        {
            icon: 'lightbulb',
            title: 'Consiglio Strategico di Lisia',
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-500/10 border-yellow-500/20',
            content: briefing.consiglio || '',
            type: 'quote'
        }
    ];

    return `
        <div class="space-y-6">
            ${sections.map((section, idx) => {
                if (!section.content || (Array.isArray(section.content) && section.content.length === 0)) return '';
                
                return `
                    <div class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 fade-in hover:border-gray-700 transition" style="animation-delay: ${idx * 0.08}s">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-9 h-9 rounded-xl ${section.bgColor} border flex items-center justify-center">
                                <i data-lucide="${section.icon}" class="w-4 h-4 ${section.color}"></i>
                            </div>
                            <h3 class="font-bold text-white text-base">${section.title}</h3>
                        </div>
                        ${renderSectionContent(section)}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderSectionContent(section) {
    switch (section.type) {
        case 'steps':
            return `
                <div class="space-y-3 ml-1">
                    ${section.content.map((step, i) => `
                        <div class="flex gap-3">
                            <div class="flex-shrink-0 w-7 h-7 rounded-full bg-magis-600/20 border border-magis-500/30 flex items-center justify-center mt-0.5">
                                <span class="text-xs font-bold text-magis-400">${i + 1}</span>
                            </div>
                            <div>
                                <p class="text-gray-200 font-medium text-sm">${escapeHtml(step.titolo || step)}</p>
                                ${step.desc ? `<p class="text-gray-500 text-xs mt-1 leading-relaxed">${escapeHtml(step.desc)}</p>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        case 'tags':
            return `
                <div class="flex flex-wrap gap-2">
                    ${section.content.map(tag => `
                        <span class="px-3 py-1.5 text-sm bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-lg font-medium">${escapeHtml(typeof tag === 'string' ? tag : tag.nome || tag)}</span>
                    `).join('')}
                </div>
            `;
        case 'references':
            return `
                <div class="space-y-2">
                    ${section.content.map(ref => `
                        <div class="flex items-start gap-2 p-3 bg-gray-800/30 rounded-xl">
                            <i data-lucide="bookmark" class="w-4 h-4 text-amber-400 mt-0.5 shrink-0"></i>
                            <p class="text-gray-300 text-sm leading-relaxed">${escapeHtml(typeof ref === 'string' ? ref : ref.testo || ref)}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        case 'warnings':
            return `
                <div class="space-y-2">
                    ${section.content.map(warn => `
                        <div class="flex items-start gap-2 p-3 bg-red-950/30 rounded-xl border border-red-900/30">
                            <i data-lucide="x-circle" class="w-4 h-4 text-red-400 mt-0.5 shrink-0"></i>
                            <p class="text-red-200/80 text-sm leading-relaxed">${escapeHtml(typeof warn === 'string' ? warn : warn.testo || warn)}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        case 'quote':
            return `
                <div class="relative pl-5 border-l-2 border-yellow-500/40">
                    <i data-lucide="quote" class="w-5 h-5 text-yellow-500/30 absolute -left-3 -top-1 bg-gray-900"></i>
                    <p class="text-gray-300 text-sm leading-relaxed italic">${escapeHtml(section.content)}</p>
                    <p class="text-yellow-500/50 text-xs mt-2 font-bold">— Lisia, Tutor AI</p>
                </div>
            `;
        default:
            return '';
    }
}
