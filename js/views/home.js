import { AppState } from '../state.js';
import { DB_TRACCE } from '../../data.js';
import { escapeHtml } from '../utils.js';
import { Gamification } from '../gamification.js';
import { renderDashboardInsights } from './analytics.js';
import { Metering } from '../metering.js';

export function renderHome() {
    var today = new Date();
    // Algoritmo deterministico della settimana: prendiamo l'id basato su settimana
    var weekNum = Math.ceil(today.getDate() / 7);
    var tracciaSettimana = DB_TRACCE.length > 0 ? DB_TRACCE[weekNum % DB_TRACCE.length] : null;
    
    // Se c'è una simulazione in corso
    var resumeCard = '';
    if (AppState.timer.active) {
        resumeCard = `
            <div class="col-span-1 md:col-span-1 border border-timerOrange/30 bg-timerOrange/10 rounded-2xl p-6 glass-panel fade-in flex flex-col justify-center items-center cursor-pointer card-hover" onclick="app.navigate('simulation')">
                <i data-lucide="timer" class="text-timerOrange w-8 h-8 mb-3 pulse-ani"></i>
                <h3 class="text-xl font-bold text-timerOrange mb-1">Riprendi la Prova</h3>
                <p class="text-gray-300 text-sm">Hai una simulazione in corso.</p>
            </div>
        `;
    }

    // Stats per Dashboard
    var numProve = AppState.history.length;
    var avgVoto = numProve > 0 ? (AppState.history.reduce((a, b) => a + (b.voto || 0), 0) / numProve).toFixed(1) : '-';
    
    // Gamification Stats
    var xpProgress = Gamification.getLevelProgress();
    var level = AppState.stats.level;
    var streak = AppState.stats.streak;
    var badges = AppState.stats.badges;

    // Push Notification Banner
    var pushBanner = '';
    if ('Notification' in window && Notification.permission === 'default') {
        pushBanner = `
        <div class="mb-8 border border-blue-500/30 bg-blue-500/10 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between fade-in">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <i data-lucide="bell-ring" class="w-5 h-5 text-blue-400"></i>
                </div>
                <div>
                    <h3 class="text-white font-bold text-sm">Attiva le notifiche Push</h3>
                    <p class="text-gray-400 text-xs">Ricevi avvisi per risposte ai tuoi post e messaggi diretti dalla community.</p>
                </div>
            </div>
            <button onclick="app.requestPushPermissions()" class="w-full md:w-auto shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition">Abilita Notifiche</button>
        </div>
        `;
    }

    return `
        <div class="fade-in space-y-8">
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 class="text-4xl font-display font-bold text-white mb-2">Dashboard</h1>
                    <div class="flex items-center gap-3">
                        <p class="text-gray-400">Bentornato${AppState.userProfile ? ', ' + escapeHtml(AppState.userProfile.name) : ''}.</p>
                        ${AppState.userProfile ? `<span class="px-2 py-0.5 text-[10px] rounded font-bold uppercase tracking-widest cursor-pointer hover:opacity-80 transition ${AppState.userProfile.tier === 'Pro' ? 'bg-magis-900/50 text-magis-400 border border-magis-800' : 'bg-gray-800 text-gray-400 border border-gray-700'}" onclick="app.navigate('pricing')">Tier ${AppState.userProfile.tier}</span>` : ''}
                    </div>
                </div>
                <!-- Gamification Quick Stats -->
                <div class="flex flex-wrap items-center gap-4 bg-gray-900/50 p-4 rounded-2xl border border-gray-800 cursor-pointer hover:bg-gray-800 hover:border-magis-500/50 transition-all group" onclick="app.toggleGamification()">
                    <div class="flex items-center gap-3 pr-4 border-r border-gray-800">
                        <div class="relative w-12 h-12 flex items-center justify-center">
                            <svg class="w-full h-full -rotate-90">
                                <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3" fill="transparent" class="text-gray-800" />
                                <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3" fill="transparent" class="text-magis-500" stroke-dasharray="${2 * Math.PI * 20}" stroke-dashoffset="${2 * Math.PI * 20 * (1 - xpProgress / 100)}" style="transition: stroke-dashoffset 1s ease-out;" />
                            </svg>
                            <span class="absolute text-[10px] font-bold text-white group-hover:text-magis-400 transition-colors">Lvl ${level}</span>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Esperienza</div>
                            <div class="text-sm font-bold text-white stat-glow group-hover:text-magis-300 transition-colors"><span class="count-up">${AppState.stats.xp}</span> XP <i data-lucide="chevron-down" class="w-3 h-3 inline ml-1 opacity-50"></i></div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <div class="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <i data-lucide="flame" class="w-5 h-5 ${streak > 0 ? 'text-orange-500' : 'text-gray-600'}"></i>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Day Streak</div>
                            <div class="text-sm font-bold text-white">${streak} giorni</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Gamification DROPDOWN (Traguardi) -->
            <div id="gamification-dropdown" class="hidden bg-gray-900/50 border border-gray-800 rounded-2xl p-6 fade-in shadow-2xl">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <i data-lucide="award" class="w-4 h-4 text-magis-400"></i> Traguardi e Medaglie
                    </h3>
                    <span class="text-[10px] text-gray-500 font-medium">${badges.length} / ${Object.keys(Gamification.BADGE_CATALOG).length} Completati</span>
                </div>
                
                <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
                    ${Object.entries(Gamification.BADGE_CATALOG).map(([id, info]) => {
                        const isUnlocked = badges.find(b => b.id === id);
                        return `
                        <div class="flex flex-col items-center text-center p-4 rounded-xl border transition-all duration-500 ${isUnlocked ? 'bg-magis-900/10 border-magis-500/30 scale-100' : 'bg-gray-950/50 border-gray-800 opacity-40 grayscale'}">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isUnlocked ? 'bg-magis-500 text-white shadow-lg shadow-magis-500/20' : 'bg-gray-800 text-gray-500'}">
                                <i data-lucide="${info.icon}" class="w-6 h-6"></i>
                            </div>
                            <h4 class="text-xs font-bold ${isUnlocked ? 'text-white' : 'text-gray-400'} mb-1">${info.name}</h4>
                            <p class="text-[9px] text-gray-500 leading-tight">${info.desc}</p>
                            ${isUnlocked ? `<div class="mt-2 text-[8px] font-bold text-magis-400 uppercase tracking-tighter">Sbloccato</div>` : ''}
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            ${pushBanner}

            <!-- RAG EXPLAINER HERO -->
            <div class="relative rounded-2xl overflow-hidden border border-indigo-500/30 shadow-xl shadow-indigo-500/10">
                <!-- Animated gradient background -->
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-950/80 via-gray-900/90 to-magis-950/80"></div>
                <div class="absolute -top-24 -right-24 w-72 h-72 bg-indigo-600/15 rounded-full blur-3xl animate-pulse"></div>
                <div class="absolute -bottom-24 -left-24 w-72 h-72 bg-magis-600/15 rounded-full blur-3xl animate-pulse" style="animation-delay: 1.5s;"></div>
                
                <div class="relative z-10 p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
                    <!-- Icon -->
                    <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-magis-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30" style="animation: float 3s ease-in-out infinite;">
                        <i data-lucide="brain-circuit" class="w-9 h-9 md:w-11 md:h-11 text-white"></i>
                    </div>
                    
                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                        <h3 class="text-lg md:text-xl font-display font-bold text-white mb-3 leading-tight">Cosa rende ConcorsiPubblici.ai uno strumento a prova di commissione?</h3>
                        <div class="space-y-3 text-sm text-gray-300 leading-relaxed">
                            <p>A differenza delle comuni AI che <strong class="text-indigo-300">"indovinano" le parole sulla base di probabilità statistiche</strong>, ConcorsiPubblici.ai utilizza un'architettura <strong class="text-white">RAG avanzata</strong>.</p>
                            <p>Dottrina, massime e sentenze vengono scomposte, trasformate in <strong class="text-magis-300">rappresentazioni matematiche</strong> e mappate in una rete semantica. Questo permette al sistema di individuare relazioni sostanziali tra principi, istituti e orientamenti giurisprudenziali, andando ben oltre la semplice ricerca per parole chiave.</p>
                            <div class="flex items-start gap-3 mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                <i data-lucide="shield-check" class="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"></i>
                                <p class="text-gray-200"><strong class="text-emerald-300">Il risultato?</strong> Un'intelligenza artificiale ancorata a un <strong class="text-white">corpus giuridico verificabile</strong>, progettata per neutralizzare il rischio di allucinazioni e offrire analisi rigorose, precise e sistematicamente coerenti.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ONBOARDING WIZARD OVERLAY -->
            ${!AppState.tutorialSeen ? `
                <div id="onboarding-tutorial" class="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-3 md:p-4 pt-16 md:pt-4 bg-gray-950/90 backdrop-blur-sm fade-in">
                    <div class="bg-gray-900 border border-gray-800 rounded-3xl p-5 md:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden max-h-[85dvh] flex flex-col">
                        <div class="absolute -top-32 -right-32 w-64 h-64 bg-magis-600/20 rounded-full blur-3xl"></div>
                        <div class="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
                        
                        <div class="relative z-10 text-center flex-1 overflow-y-auto min-h-0">
                            <div class="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-magis-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 md:mb-6 shadow-lg shadow-magis-500/30">
                                <i data-lucide="sparkles" class="w-6 h-6 md:w-8 md:h-8 text-white"></i>
                            </div>
                            
                            <h2 class="text-xl md:text-2xl font-bold text-white mb-1 md:mb-2">Benvenuto a Bordo!</h2>
                            <p class="text-gray-400 text-sm mb-4 md:mb-8 text-balance">Usa il nostro Simulatore potenziato dall'Intelligenza Artificiale per superare l'esame.</p>
                            
                            <div class="space-y-3 md:space-y-4 mb-4 md:mb-8 text-left">
                                <div class="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                                    <div class="mt-0.5"><i data-lucide="book-open" class="w-5 h-5 text-amber-400"></i></div>
                                    <div>
                                        <h4 class="text-sm font-bold text-gray-200">1. Lectio Magistralis Interattiva</h4>
                                        <p class="text-xs text-gray-500 mt-1">Vivi l'esperienza di una vera e propria lezione di livello concorsuale. Un'alta docenza simulata in tempo reale, alimentata dal nostro vastissimo database giuridico per garantirti un rigore dogmatico inattaccabile.</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                                    <div class="mt-0.5"><i data-lucide="compass" class="w-5 h-5 text-red-400"></i></div>
                                    <div>
                                        <h4 class="text-sm font-bold text-gray-200">2. Debrief Strategico & Commissario AI</h4>
                                        <p class="text-xs text-gray-500 mt-1">Domina la traccia in anticipo grazie al Debrief Strategico, la tua mappa mentale per individuare i nodi nomofilattici e schivare le insidie.</p>
                                        <p class="text-xs text-gray-500 mt-1">Affida poi la tua prova al Commissario AI: una correzione spietata, riga per riga, con gli stessi criteri di valutazione e le "matite blu" di una vera Commissione.</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                                    <div class="mt-0.5"><i data-lucide="list-todo" class="w-5 h-5 text-yellow-500"></i></div>
                                    <div>
                                        <h4 class="text-sm font-bold text-gray-200">3. Quiz AI & Casi Reali</h4>
                                        <p class="text-xs text-gray-500 mt-1">Mettiti alla prova con il nostro sistema di Quiz: affronta le varianti infinite generate dall'Intelligenza Artificiale o cimentati con le insidie dei casi reali. L'allenamento definitivo per trasformare lo studio dogmatico in prontezza operativa.</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                                    <div class="mt-0.5"><i data-lucide="scale" class="w-5 h-5 text-magis-400"></i></div>
                                    <div>
                                        <h4 class="text-sm font-bold text-gray-200">4. L'Arsenale Completo</h4>
                                        <p class="text-xs text-gray-500 mt-1">Sfida il rigore del Tutor, esplora un Glossario con centinaia di schede tra dottrina e sentenze storiche, e confrontati con l'élite della nostra Community. Un ecosistema vivo e in continua evoluzione.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CTA sempre visibile, fuori dall'area scrollabile -->
                        <div class="relative z-10 pt-3 md:pt-4 shrink-0">
                            <button onclick="app.skipTutorial()" class="w-full py-3 md:py-4 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition shadow-[0_0_20px_rgba(255,255,255,0.3)]">Ho Capito, Iniziamo!</button>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${Metering.renderUsageWidget()}

            ${renderDashboardInsights()}

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 stagger-in">
                <!-- Traccia della settimana -->
                ${tracciaSettimana ? `
                <div class="col-span-1 md:col-span-2 card-gradient-border rounded-2xl p-6 glass-panel relative overflow-hidden bg-glow-theme">
                    <div class="absolute top-0 right-0 p-3 opacity-20"><i data-lucide="award" class="w-32 h-32"></i></div>
                    <div class="relative z-10">
                        <span class="px-3 py-1 text-xs font-semibold rounded-full bg-magis-900/50 text-magis-300 border border-magis-800 mb-4 inline-block">Traccia della Settimana</span>
                        <div class="mb-4">
                            <span class="text-sm font-semibold text-gray-500 uppercase tracking-widest">${tracciaSettimana.materia}</span>
                            <h2 class="text-2xl font-bold text-white mt-1 leading-tight">${escapeHtml(tracciaSettimana.testo)}</h2>
                        </div>
                        <div class="flex gap-4 mt-6">
                            <button onclick="app.openBriefing(${tracciaSettimana.id})" class="px-6 py-3 btn-premium bg-magis-600 hover:bg-magis-500 text-white rounded-lg font-medium transition shadow-lg shadow-magis-600/50 flex items-center gap-2 text-sm">
                                <i data-lucide="play" class="w-4 h-4"></i> Inizia Prova (8h)
                            </button>
                            <button onclick="app.startSimulation(1, true, ${tracciaSettimana.id})" class="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg font-medium transition flex items-center gap-2 text-sm" title="Usa questo per testare l'auto-submit rapido">
                                <i data-lucide="zap" class="w-4 h-4 text-yellow-500"></i> Sprint Test (1 min)
                            </button>
                        </div>
                    </div>
                </div>
                ` : `
                <div class="col-span-1 md:col-span-2 card-gradient-border rounded-2xl p-6 glass-panel relative overflow-hidden">
                    <div class="relative z-10 flex items-center justify-center h-40">
                        <div class="text-center">
                            <div class="w-8 h-8 rounded-full border-2 border-magis-500 border-t-transparent animate-spin mx-auto mb-3"></div>
                            <p class="text-gray-400 text-sm">Caricamento tracce...</p>
                        </div>
                    </div>
                </div>
                `}

                ${resumeCard}

                <!-- LEZIONE AI — Hero Card -->
                <div class="col-span-1 md:col-span-2 border border-amber-500/30 rounded-2xl p-6 glass-panel card-hover flex flex-col justify-between bg-gradient-to-br from-amber-950/30 to-gray-900/50 cursor-pointer group relative overflow-hidden shadow-lg shadow-amber-500/10" onclick="app.navigate('lezione')">
                    <div class="absolute top-0 right-0 p-3 opacity-10"><i data-lucide="graduation-cap" class="w-28 h-28 text-amber-400"></i></div>
                    <div class="relative z-10">
                        <span class="px-3 py-1 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-700/50 mb-4 inline-block uppercase tracking-widest">Consigliato</span>
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                                <i data-lucide="book-open" class="w-6 h-6 text-amber-400"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">Lezione AI Interattiva</h3>
                                <p class="text-gray-400 text-sm">Studia qualsiasi argomento giuridico con CiceroAI</p>
                            </div>
                        </div>
                        <button class="mt-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition shadow-lg shadow-amber-600/30 flex items-center gap-2 text-sm">
                            <i data-lucide="play" class="w-4 h-4"></i> Inizia Lezione
                        </button>
                    </div>
                </div>
                
                <div class="col-span-1 border border-blue-500/30 rounded-2xl p-6 glass-panel card-hover flex flex-col justify-center items-center bg-gradient-to-br from-blue-950/30 to-gray-900/50 cursor-pointer group relative overflow-hidden shadow-lg shadow-blue-500/10" onclick="app.navigate('schedule')">
                    <div class="absolute top-0 right-0 p-3 opacity-10"><i data-lucide="calendar-days" class="w-20 h-20 text-blue-400"></i></div>
                    <div class="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                        <i data-lucide="calendar-days" class="text-blue-400 w-6 h-6"></i>
                    </div>
                    <h3 class="text-lg font-bold text-white mb-1">Piano di Studio</h3>
                    <p class="text-gray-400 text-sm text-center">Organizza la settimana</p>
                </div>

                <div class="col-span-1 border border-purple-500/30 rounded-2xl p-6 glass-panel card-hover flex flex-col justify-center items-center bg-gradient-to-br from-purple-950/30 to-gray-900/50 cursor-pointer group relative overflow-hidden shadow-lg shadow-purple-500/10" onclick="app.navigate('history')">
                    <div class="absolute top-0 right-0 p-3 opacity-10"><i data-lucide="clock" class="w-20 h-20 text-purple-400"></i></div>
                    <div class="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                        <i data-lucide="clock" class="text-purple-400 w-6 h-6"></i>
                    </div>
                    <h3 class="text-lg font-bold text-white mb-1">Storico Prove</h3>
                    <p class="text-gray-400 text-sm text-center">Rivedi i progressi</p>
                </div>

                <div class="col-span-1 md:col-span-2 border border-yellow-500/30 rounded-2xl p-6 glass-panel card-hover flex flex-col md:flex-row justify-between items-center gap-4 bg-gradient-to-br from-yellow-950/20 to-gray-900/50 cursor-pointer group shadow-lg shadow-yellow-500/10 relative overflow-hidden" onclick="app.navigate('quiz')">
                    <div class="absolute top-0 right-0 p-3 opacity-10"><i data-lucide="brain" class="w-24 h-24 text-yellow-400"></i></div>
                    <div class="flex items-center gap-4 relative z-10">
                        <div class="w-11 h-11 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                            <i data-lucide="list-todo" class="text-yellow-500 w-6 h-6"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-white mb-1">Quiz AI & Casi Reali</h3>
                            <p class="text-gray-400 text-sm">Domande generate dall'AI su materie giuridiche e sentenze reali</p>
                        </div>
                    </div>
                    <button class="relative z-10 shrink-0 px-5 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold transition shadow-lg shadow-yellow-600/30 flex items-center gap-2 text-sm">
                        <i data-lucide="zap" class="w-4 h-4"></i> Avvia Quiz
                    </button>
                </div>

                <div class="col-span-1 md:col-span-2 border border-emerald-500/30 rounded-2xl p-6 glass-panel card-hover flex flex-col md:flex-row justify-center items-center gap-4 bg-gradient-to-r from-emerald-950/30 to-gray-900/50 cursor-pointer group shadow-lg shadow-emerald-500/10 relative overflow-hidden" onclick="app.navigate('giurisprudenza')">
                    <div class="absolute top-0 right-0 p-3 opacity-10"><i data-lucide="landmark" class="w-24 h-24"></i></div>
                    <i data-lucide="scale" class="text-emerald-400 w-10 h-10 transition-transform group-hover:scale-110 shrink-0"></i>
                    <div class="text-center md:text-left relative z-10">
                        <h3 class="text-lg font-bold text-white mb-1">La Giurisprudenza Decodificata</h3>
                        <p class="text-gray-400 text-sm">Migliaia di pronunce di Sezioni Unite, Consiglio di Stato e TAR analizzate riga per riga per estrarne il cuore dogmatico.</p>
                    </div>
                </div>

                <div class="col-span-1 md:col-span-4 border border-amber-500/30 rounded-2xl p-6 glass-panel card-hover flex flex-col md:flex-row justify-between items-center gap-4 bg-gradient-to-r from-gray-900/50 to-amber-950/20 cursor-pointer group shadow-lg shadow-amber-500/10 relative overflow-hidden" onclick="app.navigate('bandi')">
                    <div class="absolute top-0 right-0 p-3 opacity-10"><i data-lucide="megaphone" class="w-24 h-24 text-amber-500"></i></div>
                    <div class="flex items-center gap-4 relative z-10">
                        <div class="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0">
                            <i data-lucide="megaphone" class="text-amber-500 w-6 h-6 transition-transform group-hover:scale-110"></i>
                        </div>
                        <div class="text-left">
                            <h3 class="text-lg font-bold text-white mb-1 flex items-center gap-2">Bandi in Corso <span class="px-2 py-0.5 text-[10px] font-bold rounded-full badge-new">NUOVO</span></h3>
                            <p class="text-gray-400 text-sm">Tutti i concorsi della Gazzetta Ufficiale aggiornati in tempo reale</p>
                        </div>
                    </div>
                    <div class="relative z-10 shrink-0">
                        <button class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold rounded-lg transition border border-gray-700 flex items-center gap-2">
                            Esplora <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>

                <!-- Orale — Coming Soon -->
                <div class="col-span-1 md:col-span-4 border border-dashed border-gray-700 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-900/30 opacity-60 group relative overflow-hidden">
                    <div class="flex items-center gap-4 relative z-10">
                        <div class="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
                            <i data-lucide="mic" class="text-gray-500 w-6 h-6"></i>
                        </div>
                        <div class="text-left">
                            <h3 class="text-lg font-bold text-gray-400 mb-1 flex items-center gap-2">Simulatore Orale <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-800 text-gray-500 border border-gray-700">COMING SOON</span></h3>
                            <p class="text-gray-600 text-sm">Allenati per l'esame orale con l'esaminatore AI vocale</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- DOMINA L'ECOSISTEMA -->
            <div class="mt-16 mb-8">
                <div class="text-center mb-10">
                    <span class="px-4 py-1.5 text-[10px] font-bold rounded-full bg-magis-900/50 text-magis-300 border border-magis-800 uppercase tracking-widest">Il tuo arsenale</span>
                    <h2 class="text-2xl md:text-3xl font-display font-bold text-white mt-4">Domina l'ecosistema di ConcorsiPubblici.ai</h2>
                    <p class="text-gray-500 text-sm mt-2 max-w-xl mx-auto">Ogni strumento è progettato per portarti un passo più vicino alla Toga. Scopri cosa ti aspetta.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                    <div class="flex items-start gap-4 p-5 rounded-2xl bg-gray-900/60 border border-gray-800 hover:border-amber-500/30 transition group cursor-pointer" onclick="app.navigate('lezione')">
                        <div class="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <i data-lucide="book-open" class="w-5 h-5 text-amber-400"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-white mb-1">1. Lectio Magistralis Interattiva</h4>
                            <p class="text-xs text-gray-500 leading-relaxed">Vivi l'esperienza di una vera e propria lezione di livello concorsuale. Un'alta docenza simulata in tempo reale, alimentata dal nostro vastissimo database giuridico per garantirti un rigore dogmatico inattaccabile.</p>
                        </div>
                    </div>

                    <div class="flex items-start gap-4 p-5 rounded-2xl bg-gray-900/60 border border-gray-800 hover:border-red-500/30 transition group cursor-pointer" onclick="app.navigate('tracce')">
                        <div class="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <i data-lucide="compass" class="w-5 h-5 text-red-400"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-white mb-1">2. Debrief Strategico & Commissario AI</h4>
                            <p class="text-xs text-gray-500 leading-relaxed">Domina la traccia in anticipo grazie al Debrief Strategico, la tua mappa mentale per individuare i nodi nomofilattici e schivare le insidie.</p>
                            <p class="text-xs text-gray-500 leading-relaxed mt-1">Affida poi la tua prova al Commissario AI: una correzione spietata, riga per riga, con gli stessi criteri di valutazione e le "matite blu" di una vera Commissione.</p>
                        </div>
                    </div>

                    <div class="flex items-start gap-4 p-5 rounded-2xl bg-gray-900/60 border border-gray-800 hover:border-yellow-500/30 transition group cursor-pointer" onclick="app.navigate('quiz')">
                        <div class="w-11 h-11 rounded-xl bg-yellow-500/15 border border-yellow-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <i data-lucide="list-todo" class="w-5 h-5 text-yellow-500"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-white mb-1">3. Quiz AI & Casi Reali</h4>
                            <p class="text-xs text-gray-500 leading-relaxed">Mettiti alla prova con il nostro sistema di Quiz: affronta le varianti infinite generate dall'Intelligenza Artificiale o cimentati con le insidie dei casi reali. L'allenamento definitivo per trasformare lo studio dogmatico in prontezza operativa.</p>
                        </div>
                    </div>

                    <div class="flex items-start gap-4 p-5 rounded-2xl bg-gray-900/60 border border-gray-800 hover:border-magis-500/30 transition group cursor-pointer" onclick="app.navigate('community')">
                        <div class="w-11 h-11 rounded-xl bg-magis-500/15 border border-magis-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <i data-lucide="scale" class="w-5 h-5 text-magis-400"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-white mb-1">4. L'Arsenale Completo</h4>
                            <p class="text-xs text-gray-500 leading-relaxed">Sfida il rigore del Tutor, esplora un Glossario con centinaia di schede tra dottrina e sentenze storiche, e confrontati con l'élite della nostra Community. Un ecosistema vivo e in continua evoluzione.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RAG STATS BANNER -->
            <div class="mt-16 mb-8 border border-magis-500/30 rounded-2xl p-8 glass-panel relative overflow-hidden bg-gradient-to-br from-gray-900 to-magis-950/40 shadow-2xl">
                <!-- Background animations -->
                <div class="absolute -top-24 -right-24 w-72 h-72 bg-magis-600/10 rounded-full blur-3xl animate-pulse"></div>
                <div class="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" style="animation-delay: 2s;"></div>
                
                <div class="relative z-10 text-center mb-10">
                    <span class="px-4 py-1.5 text-[10px] font-bold rounded-full bg-magis-900/50 text-magis-300 border border-magis-800 uppercase tracking-widest mb-4 inline-block">Il Motore Giuridico</span>
                    <h2 class="text-3xl font-display font-bold text-white mb-4">Un Patrimonio di Oltre 80.000 Pronunce</h2>
                    <p class="text-gray-400 text-sm max-w-2xl mx-auto leading-relaxed">ConcorsiPubblici.ai non "inventa" le risposte. Il suo motore neurale (RAG) interroga in tempo reale un database giurisprudenziale immenso, garantendo risposte ancorate a fonti reali, esatte e costantemente aggiornate.</p>
                </div>

                <div class="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    <div class="flex flex-col items-center justify-center p-6 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-magis-500/50 transition-all card-hover group">
                        <div class="text-3xl font-bold text-white mb-2 group-hover:text-magis-400 transition-colors" style="text-shadow: 0 0 20px rgba(99,102,241,0.5);">66.500+</div>
                        <div class="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest font-bold text-center">Cassazione<br/>(SS.UU. & Semplici)</div>
                    </div>
                    
                    <div class="flex flex-col items-center justify-center p-6 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-blue-500/50 transition-all card-hover group">
                        <div class="text-3xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors" style="text-shadow: 0 0 20px rgba(59,130,246,0.5);">11.000+</div>
                        <div class="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest font-bold text-center">Giust. Amministr.<br/>(TAR e CdS)</div>
                    </div>
                    
                    <div class="flex flex-col items-center justify-center p-6 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/50 transition-all card-hover group">
                        <div class="text-3xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors" style="text-shadow: 0 0 20px rgba(16,185,129,0.5);">1.000+</div>
                        <div class="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest font-bold text-center">Giust. Tributaria<br/>(CGT)</div>
                    </div>
                    
                    <div class="flex flex-col items-center justify-center p-6 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-amber-500/50 transition-all card-hover group">
                        <div class="text-3xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors" style="text-shadow: 0 0 20px rgba(245,158,11,0.5);">~2.000</div>
                        <div class="text-[10px] md:text-xs text-gray-500 uppercase tracking-widest font-bold text-center">Casi di Rilievo<br/>Sistematico</div>
                    </div>
                </div>
            </div>

            <!-- PWA INSTALL BANNER (bottom) -->
            ${window.deferredPrompt ? `
                <div id="pwa-install-banner" class="mt-8 border border-green-500/30 bg-green-500/10 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between fade-in">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                            <i data-lucide="download" class="w-5 h-5 text-green-400"></i>
                        </div>
                        <div>
                            <h3 class="text-white font-bold text-sm">Installa L'App</h3>
                            <p class="text-green-400/80 text-xs text-balance">Aggiungi ConcorsiPubblici.ai alla tua Home o Desktop per accedere istantaneamente e usare la modalità offline.</p>
                        </div>
                    </div>
                    <button onclick="app.installPWA()" class="w-full md:w-auto shrink-0 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold transition flex items-center gap-2 justify-center"><i data-lucide="monitor-smartphone" class="w-4 h-4"></i> Installa Ora</button>
                </div>
            ` : ''}

            <!-- Footer con link legali -->
            <div class="pt-12 pb-6 border-t border-gray-900 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-600">
                <p>© 2026 ConcorsiPubblici.ai - Tutti i diritti riservati.</p>
                <div class="flex gap-6">
                    <button onclick="app.navigate('legal')" class="hover:text-gray-400 transition">Privacy & Legal</button>
                    <button onclick="window.open('mailto:info@concorsipubblici.ai')" class="hover:text-gray-400 transition">Supporto</button>
                </div>
            </div>
        </div>
    `;
}
