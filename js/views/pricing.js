/* ============================================================
   PRICING.JS — Vista Paywall / Upgrade Premium
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

    const usage = Metering.getUsageSummary();
    const aiCalls = usage.find(u => u.feature === 'aiCalls');
    const tutorChats = usage.find(u => u.feature === 'tutorChats');

    return `
        <div class="fade-in max-w-6xl mx-auto py-12 px-4">
            <div class="text-center mb-12">
                <h1 class="text-4xl md:text-5xl font-display font-bold text-white mb-4">Sblocca il tuo potenziale da ${potenzialeTesto}</h1>
                <p class="text-gray-400 text-lg max-w-2xl mx-auto">Passa a ConcorsiPubblici.ai Pro per sbloccare l'incalzante commissario vocale assistito da AI, i download PDF e le statistiche storiche illimitate.</p>
            </div>

            <div class="flex flex-col lg:flex-row gap-8 justify-center items-stretch max-w-6xl mx-auto">
                
                <!-- FREE TIER -->
                <div class="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl flex flex-col">
                    <h3 class="text-2xl font-bold text-white mb-2">Basic</h3>
                    <p class="text-gray-400 mb-6 text-sm flex-grow">Le fondamenta per iniziare a saggiare l'ecosistema di simulazioni offline.</p>
                    <div class="text-4xl font-display font-bold text-white mb-6">Gratis <span class="text-sm text-gray-500 font-normal">/ per sempre</span></div>
                    
                    <ul class="space-y-4 mb-8">
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> 
                            <div class="flex flex-col">
                                <span class="text-sm text-gray-300">Correzioni Scritte AI</span>
                                <span class="text-xs text-gray-500 font-mono">${aiCalls.used}/${aiCalls.limit} usate questo mese</span>
                            </div>
                        </li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> 
                            <div class="flex flex-col">
                                <span class="text-sm text-gray-300">Chat Tutor AI</span>
                                <span class="text-xs text-gray-500 font-mono">${tutorChats.used}/${tutorChats.limit} usate questo mese</span>
                            </div>
                        </li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> <span class="text-sm text-gray-300">Hub Tracce, Glossario e Community</span></li>
                        <li class="flex items-start gap-3 opacity-50"><i data-lucide="x" class="w-5 h-5 text-gray-600 shrink-0"></i> <span class="text-sm text-gray-500 line-through">Simulatore Orale Vocale</span></li>
                        <li class="flex items-start gap-3 opacity-50"><i data-lucide="x" class="w-5 h-5 text-gray-600 shrink-0"></i> <span class="text-sm text-gray-500 line-through">Sartoria Tracce AI Inedite</span></li>
                        <li class="flex items-start gap-3 opacity-50"><i data-lucide="x" class="w-5 h-5 text-gray-600 shrink-0"></i> <span class="text-sm text-gray-500 line-through">Export Storico PDF / CSV</span></li>
                    </ul>

                    <button class="w-full py-3 rounded-lg border border-gray-700 text-gray-400 font-bold transition hover:bg-gray-800 cursor-not-allowed">Il tuo piano attuale</button>
                </div>

                <!-- PRO TIER -->
                <div class="flex-1 bg-gray-900 border-2 border-magis-500 rounded-2xl p-8 shadow-2xl shadow-magis-900/20 relative flex flex-col transform lg:-translate-y-4">
                    <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-magis-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">Il più scelto</div>
                    <h3 class="text-2xl font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="sparkles" class="w-5 h-5 text-magis-400"></i> Pro</h3>
                    <p class="text-magis-200/60 mb-6 text-sm flex-grow">Tutta la potenza di modelli NLP per simulare un esame reale e incalzante.</p>
                    <div class="text-4xl font-display font-bold text-white mb-6">29€ <span class="text-sm text-magis-300/50 font-normal">/ mese</span></div>
                    
                    <ul class="space-y-4 mb-8">
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-magis-400 shrink-0"></i> <span class="text-sm text-gray-100 font-medium">Correzioni AI Illimitate</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-magis-400 shrink-0"></i> <span class="text-sm text-gray-100 font-medium">Chat Tutor AI Illimitate</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-magis-400 shrink-0"></i> <span class="text-sm text-gray-100 font-medium">Esaminatore Orale Vocale OpenAI</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-magis-400 shrink-0"></i> <span class="text-sm text-gray-100 font-medium">Sartoria Tracce AI Inedite (Mirate)</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-magis-400 shrink-0"></i> <span class="text-sm text-gray-100 font-medium">Download illimitato PDF & CSV</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-magis-400 shrink-0"></i> <span class="text-sm text-gray-100 font-medium">Cloud Sync Database (Supabase)</span></li>
                    </ul>

                    <button onclick="app.upgradeTier()" class="w-full py-3 rounded-lg bg-gradient-to-r from-magis-600 to-indigo-600 text-white font-bold transition hover:from-magis-500 hover:to-indigo-500 shadow-lg shadow-magis-600/30 flex justify-center items-center gap-2">
                        <i data-lucide="zap" class="w-4 h-4"></i> Fai l'Upgrade Ora
                    </button>
                    <p class="text-center text-[10px] text-gray-500 mt-3 hidden md:block">Abbonamento mensile cancellabile in qualsiasi momento.</p>
                </div>

                <!-- TEAM TIER -->
                <div class="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl flex flex-col opacity-80 mt-8 lg:mt-0 relative overflow-hidden">
                    <div class="absolute inset-0 bg-gray-900/40 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center pointer-events-none">
                        <div class="bg-gray-800/90 text-white text-xs font-bold px-4 py-2 rounded-full border border-gray-700 shadow-lg backdrop-blur-md">Coming Soon</div>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-300 mb-2 flex items-center gap-2"><i data-lucide="users" class="w-5 h-5 text-gray-500"></i> Studio</h3>
                    <p class="text-gray-500 mb-6 text-sm flex-grow">Per gruppi di studio, scuole di diritto o studi legali associati.</p>
                    <div class="text-4xl font-display font-bold text-gray-400 mb-6">49€ <span class="text-sm text-gray-600 font-normal">/ mese</span></div>
                    
                    <ul class="space-y-4 mb-8 grayscale opacity-60">
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> <span class="text-sm text-gray-400">Tutto il pacchetto Pro</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> <span class="text-sm text-gray-400">Fino a 5 Account Collegati</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> <span class="text-sm text-gray-400">Dashboard Medie di Gruppo</span></li>
                        <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-gray-500 shrink-0"></i> <span class="text-sm text-gray-400">Condivisione Tracce Personalizzate</span></li>
                    </ul>

                    <button class="w-full py-3 rounded-lg border border-gray-700 text-gray-500 font-bold transition hover:bg-gray-800 cursor-not-allowed">Contattaci</button>
                </div>

            </div>
            
            <div class="text-center mt-12">
                <p class="text-sm text-gray-500 mb-4 max-w-2xl mx-auto">Tutti i pagamenti sono elaborati in modo sicuro tramite <strong class="text-gray-400">Stripe</strong>. Nessun dato della carta di credito viene memorizzato sui nostri server.</p>
                <button onclick="app.navigate('home')" class="px-6 py-2 rounded-full border border-gray-700 hover:bg-gray-800 text-gray-400 transition font-medium text-sm">Torna alla Dashboard</button>
            </div>
        </div>
    `;
}
