/* ============================================================
   PRICING.JS — Vista Piani & Abbonamenti
   Struttura a 4 tier: Free, Starter, Pro, Elite (TBD)
   ============================================================ */

import { AppState } from '../state.js';
import { Metering } from '../metering.js';

export function renderPricing() {
    var c = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : 'Magistratura';
    
    var potenzialeTesto = "Magistrato";
    if (c === "Avvocatura") potenzialeTesto = "Avvocato";
    else if (c === "Notariato") potenzialeTesto = "Notaio";
    else if (c === "Commissari") potenzialeTesto = "Commissario";
    else if (c === "Dirigenti") potenzialeTesto = "Dirigente";
    else if (c === "Segretari Comunali") potenzialeTesto = "Segretario Comunale";
    else if (c === "Carriera Diplomatica") potenzialeTesto = "Diplomatico";

    const tier = Metering._getTier();

    return `
        <div class="fade-in max-w-7xl mx-auto py-10 px-4">
            <!-- Header -->
            <div class="text-center mb-12">
                <div class="inline-flex items-center gap-2 bg-magis-500/10 text-magis-400 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border border-magis-500/20 mb-4">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Scegli il tuo percorso
                </div>
                <h1 class="text-3xl md:text-5xl font-display font-bold text-white mb-4">Diventa il prossimo ${potenzialeTesto}</h1>
                <p class="text-gray-400 text-base md:text-lg max-w-2xl mx-auto">Preparazione ai concorsi pubblici con intelligenza artificiale di livello magistrale. Scegli il piano più adatto al tuo percorso.</p>
            </div>

            <!-- Pricing Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 max-w-7xl mx-auto items-start">
                
                <!-- ═══ FREE ═══ -->
                <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col h-full backdrop-blur-sm ${tier === 'Free' ? 'ring-1 ring-gray-600' : ''}">
                    <div class="mb-5">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-8 h-8 rounded-xl bg-gray-800 flex items-center justify-center">
                                <i data-lucide="user" class="w-4 h-4 text-gray-400"></i>
                            </div>
                            <h3 class="text-lg font-bold text-white">Free</h3>
                        </div>
                        <p class="text-gray-500 text-xs mt-1">Per esplorare la piattaforma</p>
                    </div>
                    <div class="text-3xl font-display font-bold text-white mb-5">€0 <span class="text-sm text-gray-600 font-normal">/ per sempre</span></div>
                    
                    <ul class="space-y-2.5 mb-6 flex-grow text-sm">
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-green-500 shrink-0"></i>
                            <span class="text-gray-300"><strong class="text-white">10 Quiz AI</strong> a settimana</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-green-500 shrink-0"></i>
                            <span class="text-gray-300">Hub Tracce & Glossario</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-green-500 shrink-0"></i>
                            <span class="text-gray-300">Community & Bandi in Corso</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="eye" class="w-4 h-4 text-amber-500/70 shrink-0"></i>
                            <span class="text-gray-400">Anteprima Lezione & Debrief</span>
                        </li>
                        <li class="flex items-center gap-2.5 opacity-40">
                            <i data-lucide="x" class="w-4 h-4 text-gray-600 shrink-0"></i>
                            <span class="text-gray-500 line-through">Correzione Tema AI</span>
                        </li>
                        <li class="flex items-center gap-2.5 opacity-40">
                            <i data-lucide="x" class="w-4 h-4 text-gray-600 shrink-0"></i>
                            <span class="text-gray-500 line-through">Simulatore Orale</span>
                        </li>
                    </ul>

                    ${tier === 'Free' ? 
                        `<button class="w-full py-2.5 rounded-xl border border-gray-700 text-gray-500 text-sm font-bold cursor-default">Piano attuale</button>` :
                        `<div></div>`
                    }
                </div>

                <!-- ═══ STARTER ═══ -->
                <div class="bg-gray-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl flex flex-col h-full backdrop-blur-sm relative ${tier === 'Starter' ? 'ring-2 ring-amber-500' : ''}">
                    <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">Provalo</div>
                    <div class="mb-5">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                                <i data-lucide="flame" class="w-4 h-4 text-amber-400"></i>
                            </div>
                            <h3 class="text-lg font-bold text-white">Starter</h3>
                        </div>
                        <p class="text-amber-400/60 text-xs mt-1">Pacchetto di prova completo</p>
                    </div>
                    <div class="text-3xl font-display font-bold text-white mb-1">€7<span class="text-lg">,99</span> <span class="text-sm text-gray-500 font-normal">/ una tantum</span></div>
                    <p class="text-amber-400/50 text-[10px] mb-5">Nessun abbonamento. Paghi una volta, provi tutto.</p>
                    
                    <ul class="space-y-2.5 mb-6 flex-grow text-sm">
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-amber-400 shrink-0"></i>
                            <span class="text-gray-300">Tutto il piano <strong class="text-white">Free</strong></span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-amber-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Lectio Magistralis AI</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-amber-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Lezione Socratica AI</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-amber-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Debrief Pre-Tema AI</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-amber-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Correzione Tema AI</span>
                        </li>
                    </ul>

                    <button onclick="app.upgradeTier('starter')" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                        <i data-lucide="zap" class="w-4 h-4"></i> Prova a €7,99
                    </button>
                </div>

                <!-- ═══ PRO ═══ -->
                <div class="bg-gray-900/80 border-2 border-magis-500 rounded-2xl p-6 shadow-2xl shadow-magis-900/20 flex flex-col h-full backdrop-blur-sm relative transform xl:-translate-y-3 ${tier === 'Pro' ? 'ring-2 ring-magis-400' : ''}">
                    <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-magis-500 to-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">Più scelto</div>
                    <div class="mb-5">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-magis-500/20 to-indigo-500/20 flex items-center justify-center">
                                <i data-lucide="crown" class="w-4 h-4 text-magis-400"></i>
                            </div>
                            <h3 class="text-lg font-bold text-white">Pro</h3>
                        </div>
                        <p class="text-magis-300/60 text-xs mt-1">Per chi fa sul serio</p>
                    </div>
                    <div class="text-3xl font-display font-bold text-white mb-1">€39 <span class="text-sm text-magis-300/50 font-normal">/ mese</span></div>
                    <p class="text-magis-400/50 text-[10px] mb-5">Cancellabile in qualsiasi momento.</p>
                    
                    <ul class="space-y-2.5 mb-6 flex-grow text-sm">
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">Quiz AI illimitati</strong></span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="refresh-cw" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Lectio Magistralis <span class="text-gray-500">/ settimana</span></span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="refresh-cw" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Lezione Socratica <span class="text-gray-500">/ settimana</span></span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="refresh-cw" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Debrief Pre-Tema <span class="text-gray-500">/ settimana</span></span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="refresh-cw" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200"><strong class="text-white">1</strong> Correzione Tema <span class="text-gray-500">/ settimana</span></span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200">Simulatore Orale Vocale</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-magis-400 shrink-0"></i>
                            <span class="text-gray-200">Sartoria Tracce AI Inedite</span>
                        </li>
                    </ul>

                    <button onclick="app.upgradeTier('pro')" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-magis-600 to-indigo-600 hover:from-magis-500 hover:to-indigo-500 text-white font-bold text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-magis-600/30 flex items-center justify-center gap-2">
                        <i data-lucide="sparkles" class="w-4 h-4"></i> Abbonati a €39/mese
                    </button>
                </div>

                <!-- ═══ ELITE (Coming Soon) ═══ -->
                <div class="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col h-full backdrop-blur-sm relative overflow-hidden">
                    <div class="absolute inset-0 bg-gray-900/50 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center pointer-events-none">
                        <div class="bg-gray-800/90 text-white text-[10px] font-bold px-4 py-2 rounded-full border border-gray-700 shadow-lg backdrop-blur-md uppercase tracking-wider">In arrivo</div>
                    </div>
                    <div class="mb-5">
                        <div class="flex items-center gap-2 mb-1">
                            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                                <i data-lucide="gem" class="w-4 h-4 text-purple-400"></i>
                            </div>
                            <h3 class="text-lg font-bold text-gray-300">Elite</h3>
                        </div>
                        <p class="text-gray-600 text-xs mt-1">Preparazione intensiva illimitata</p>
                    </div>
                    <div class="text-3xl font-display font-bold text-gray-400 mb-1">€— <span class="text-sm text-gray-600 font-normal">/ mese</span></div>
                    <p class="text-gray-600 text-[10px] mb-5">Dettagli in arrivo.</p>
                    
                    <ul class="space-y-2.5 mb-6 flex-grow text-sm opacity-50">
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-purple-500/60 shrink-0"></i>
                            <span class="text-gray-400">Tutto il piano Pro</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-purple-500/60 shrink-0"></i>
                            <span class="text-gray-400">Crediti settimanali estesi</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-purple-500/60 shrink-0"></i>
                            <span class="text-gray-400">Tutor Personale Prioritario</span>
                        </li>
                        <li class="flex items-center gap-2.5">
                            <i data-lucide="check" class="w-4 h-4 text-purple-500/60 shrink-0"></i>
                            <span class="text-gray-400">Export PDF illimitati</span>
                        </li>
                    </ul>

                    <button class="w-full py-2.5 rounded-xl border border-gray-700 text-gray-500 text-sm font-bold cursor-not-allowed">In arrivo</button>
                </div>

            </div>
            
            <!-- Footer -->
            <div class="text-center mt-10">
                <p class="text-xs text-gray-500 mb-3 max-w-xl mx-auto">Pagamenti sicuri con <strong class="text-gray-400">Stripe</strong>. Nessun dato della carta memorizzato. Abbonamento cancellabile in ogni momento dal tuo profilo.</p>
                <button onclick="app.navigate('home')" class="px-5 py-2 rounded-full border border-gray-800 hover:bg-gray-800 text-gray-500 transition font-medium text-xs">Torna alla Dashboard</button>
            </div>
        </div>
    `;
}
