/* ============================================================
   BRIEFING.JS — Vista "Briefing del Commissario"
   
   Schermata intermedia tra la selezione della traccia e 
   l'inizio della simulazione. L'AI genera indicazioni 
   strutturate su come affrontare la traccia.
   ============================================================ */

import { AppState } from '../state.js';
import { escapeHtml } from '../utils.js';
import { Metering } from '../metering.js';

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
                <svg class="w-12 h-12 text-magis-400 relative z-10 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                    <path d="M12 18v4"/><path d="M9 2.5a3 3 0 0 1 6 0"/>
                </svg>
            </div>
            
            <div class="text-center space-y-4">
                <h3 class="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-magis-400 to-indigo-400 animate-pulse">
                    Il Commissario sta preparando il tuo Debrief...
                </h3>
                
                <!-- Messaggio ad effetto -->
                <div class="max-w-md mx-auto px-6 py-4 rounded-2xl bg-gradient-to-br from-magis-500/10 to-indigo-500/10 border border-magis-500/20">
                    <p class="text-gray-300 text-sm leading-relaxed italic">
                        "Un'analisi giurisprudenziale profonda richiede tempo — come quella di un vero Magistrato di Cassazione."
                    </p>
                    <div class="mt-3 flex items-center justify-center gap-2">
                        <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span class="text-amber-300 font-bold text-sm">Tempo stimato: 30–60 secondi</span>
                    </div>
                    <p class="text-gray-500 text-xs mt-2">Non chiudere questa pagina.</p>
                </div>
                
                <div class="space-y-2 opacity-80 mt-4">
                    <div class="flex items-center justify-center gap-3 text-sm text-gray-400" id="loading-step-1">
                        <div class="w-4 h-4 rounded-full border-2 border-magis-500 border-t-transparent animate-spin"></div>
                        <span>Ricerca giurisprudenza nel database RAG</span>
                    </div>
                    <div class="flex items-center justify-center gap-3 text-sm text-gray-500" id="loading-step-2">
                        <div class="w-4 h-4 rounded-full border-2 border-gray-600"></div>
                        <span>Analisi delle insidie e trabocchetti</span>
                    </div>
                    <div class="flex items-center justify-center gap-3 text-sm text-gray-500" id="loading-step-3">
                        <div class="w-4 h-4 rounded-full border-2 border-gray-600"></div>
                        <span>Stesura dello schema logico di svolgimento</span>
                    </div>
                </div>
            </div>
            
            <!-- Barra di caricamento con timer -->
            <div class="w-72 space-y-2">
                <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden relative shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                    <div class="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-magis-500 to-transparent animate-scan"></div>
                </div>
                <div class="text-center text-gray-600 text-xs font-mono" id="briefing-timer">00:00</div>
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
        <script>
            (function() {
                var start = Date.now();
                var steps = ['loading-step-1','loading-step-2','loading-step-3'];
                var stepTimes = [8000, 18000, 30000];
                var timerEl = document.getElementById('briefing-timer');
                var iv = setInterval(function() {
                    var elapsed = Math.floor((Date.now() - start) / 1000);
                    var m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                    var s = String(elapsed % 60).padStart(2, '0');
                    if (timerEl) timerEl.textContent = m + ':' + s;
                    for (var i = 0; i < steps.length; i++) {
                        var el = document.getElementById(steps[i]);
                        if (el && Date.now() - start > stepTimes[i]) {
                            el.querySelector('div').className = 'w-4 h-4 rounded-full border-2 border-magis-500 border-t-transparent animate-spin';
                            el.querySelector('span').className = 'text-gray-300';
                            if (i > 0) {
                                var prevEl = document.getElementById(steps[i-1]);
                                if (prevEl) {
                                    prevEl.querySelector('div').className = 'w-4 h-4 rounded-full bg-green-500';
                                    prevEl.querySelector('div').innerHTML = '<svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
                                }
                            }
                        }
                    }
                    if (!document.getElementById('briefing-timer')) clearInterval(iv);
                }, 1000);
            })();
        </script>
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
    const sections = [];

    if (briefing.decodifica) {
        sections.push({
            icon: 'microscope',
            title: 'Decodifica Profonda della Traccia',
            color: 'text-indigo-400',
            bgColor: 'bg-indigo-500/10 border-indigo-500/20',
            content: briefing.decodifica,
            type: 'paragraph'
        });
    }

    // Se l'utente è Free, tronchiamo qui e mostriamo il paywall
    if (Metering._getTier() === 'Free') {
        const paywallMsg = Metering.showFreePaywall('briefing');
        sections.push({
            icon: 'lock',
            title: 'Contenuto Premium Bloccato',
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/10 border-amber-500/20',
            content: paywallMsg,
            type: 'paywall'
        });
        
        return `
            <div class="space-y-6">
                ${sections.map((section, idx) => `
                    <div class="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 fade-in hover:border-gray-700 transition" style="animation-delay: ${idx * 0.08}s">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-9 h-9 rounded-xl ${section.bgColor} border flex items-center justify-center">
                                <i data-lucide="${section.icon}" class="w-4 h-4 ${section.color}"></i>
                            </div>
                            <h3 class="font-bold text-white text-base">${section.title}</h3>
                        </div>
                        ${renderSectionContent(section)}
                    </div>
                `).join('')}
            </div>
        `;
    }

    sections.push({
        icon: 'map',
        title: 'Schema di Svolgimento Consigliato',
        color: 'text-magis-400',
        bgColor: 'bg-magis-500/10 border-magis-500/20',
        content: briefing.schema || [],
        type: 'steps'
    });

    if (briefing.intersezioni_sistemiche) {
        sections.push({
            icon: 'git-branch',
            title: 'Intersezioni Sistemiche — Il Quid Pluris',
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/10 border-amber-500/20',
            content: briefing.intersezioni_sistemiche,
            type: 'paragraph'
        });
    }

    sections.push({
        icon: 'alert-triangle',
        title: 'Insidie e Red Flags',
        color: 'text-red-400',
        bgColor: 'bg-red-500/10 border-red-500/20',
        content: briefing.insidie || [],
        type: 'warnings'
    });

    if (briefing.time_management) {
        sections.push({
            icon: 'clock',
            title: 'Time Management & Monoscrittura',
            color: 'text-cyan-400',
            bgColor: 'bg-cyan-500/10 border-cyan-500/20',
            content: briefing.time_management,
            type: 'paragraph'
        });
    }

    if (briefing.arsenale_lessicale && briefing.arsenale_lessicale.length > 0) {
        sections.push({
            icon: 'swords',
            title: 'Arsenale Lessicale',
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/10 border-purple-500/20',
            content: briefing.arsenale_lessicale,
            type: 'tags'
        });
    }

    sections.push({
        icon: 'lightbulb',
        title: 'Forma, Stile e Lessico Concorsuale',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10 border-yellow-500/20',
        content: briefing.consiglio || '',
        type: 'quote'
    });

    const ragCount = (briefing.rag_sources && briefing.rag_sources.length > 0) ? briefing.rag_sources.length : 0;
    const ragBadgeHtml = ragCount > 0 ? `
        <div class="mb-6 flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl max-w-fit">
            <i data-lucide="database" class="w-4 h-4 text-emerald-400"></i>
            <span class="text-xs font-bold text-emerald-300">Intelligenza Giuridica Attiva: estratti ${ragCount} frammenti normativi/giurisprudenziali dal database.</span>
        </div>
    ` : '';

    return `
        <div class="space-y-6">
            ${ragBadgeHtml}
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
        case 'paragraph':
            return `
                <div class="prose prose-sm prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap">
                    ${escapeHtml(section.content)}
                </div>
            `;
        case 'steps':
            return `
                <div class="space-y-4 ml-1">
                    ${section.content.map((step, i) => `
                        <div class="flex gap-3">
                            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-magis-600/20 border border-magis-500/30 flex items-center justify-center mt-0.5">
                                <span class="text-sm font-bold text-magis-400">${i + 1}</span>
                            </div>
                            <div>
                                <p class="text-gray-100 font-bold text-sm">${escapeHtml(step.titolo || step)}</p>
                                ${step.desc ? `<p class="text-gray-400 text-sm mt-1.5 leading-relaxed">${escapeHtml(step.desc)}</p>` : ''}
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
                <div class="space-y-3">
                    ${section.content.map(ref => `
                        <div class="flex items-start gap-3 p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                            <i data-lucide="bookmark" class="w-5 h-5 text-amber-400 mt-0.5 shrink-0"></i>
                            <div>
                                ${typeof ref === 'object' && ref.estremi ? `<p class="font-bold text-amber-300 text-sm mb-1">${escapeHtml(ref.estremi)}</p>` : ''}
                                <p class="text-gray-300 text-sm leading-relaxed">${escapeHtml(typeof ref === 'string' ? ref : ref.principio || ref.testo || ref)}</p>
                            </div>
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
                    <p class="text-yellow-500/50 text-xs mt-2 font-bold">— CiceroAI, Tutor AI</p>
                </div>
            `;
        case 'paywall':
            return `
                <div class="prose prose-sm prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap mb-4">
                    ${escapeHtml(section.content)}
                </div>
                <div class="flex justify-center mt-4">
                    <button onclick="app.navigate('pricing')" class="px-6 py-3 bg-gradient-to-r from-magis-700 to-magis-600 hover:from-magis-600 hover:to-magis-500 text-white rounded-xl font-bold flex items-center gap-2 transition hover:scale-105">
                        <i data-lucide="unlock" class="w-5 h-5"></i> Sblocca il Briefing Completo
                    </button>
                </div>
            `;
        default:
            return '';
    }
}
