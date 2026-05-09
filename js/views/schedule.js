/* ============================================================
   SCHEDULE.JS — Vista Calendario e Pianificatore di Studio
   ============================================================ */

import { AppState } from '../state.js';



export function renderSchedule() {
    var today = new Date();
    var currentDay = today.getDay(); // 0 = Domenica, 1 = Lunedì
    
    // Mappatura Giorni della settimana
    var days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    
    // Generiamo la riga dei giorni per la settimana in corso
    var weekHtml = '';
    for (let i = 1; i <= 7; i++) {
        var dayIndex = i === 7 ? 0 : i; // Sabato -> Domenica
        var isToday = dayIndex === currentDay;
        
        // Mocking activities
        var hasActivity = (i === 1 || i === 3 || i === 5); // Simuliamo impegni Lun, Mer, Ven
        var isDone = hasActivity && dayIndex < currentDay;
        var activityIcon = '';
        if (hasActivity) {
            activityIcon = isDone 
                ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500 mx-auto mt-2"></i>' 
                : '<i data-lucide="pen-tool" class="w-5 h-5 text-magis-400 mx-auto mt-2"></i>';
        } else {
             activityIcon = '<i data-lucide="minus" class="w-5 h-5 text-gray-700 mx-auto mt-2"></i>';
        }

        weekHtml += `
            <div class="flex-1 flex flex-col items-center p-3 rounded-xl border ${isToday ? 'border-magis-500 bg-magis-900/20 shadow-lg shadow-magis-500/10' : 'border-gray-800 bg-gray-900/50'}">
                <span class="text-xs font-bold uppercase tracking-widest ${isToday ? 'text-magis-400' : 'text-gray-500'}">${days[dayIndex].substr(0,3)}</span>
                ${activityIcon}
            </div>
        `;
    }

    return `
        <div class="fade-in max-w-5xl mx-auto flex flex-col min-h-screen pb-20">
            <div class="mb-8">
                <div class="flex items-center gap-3 mb-2">
                    <button onclick="app.navigate('home')" class="text-gray-500 hover:text-white transition"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                    <h1 class="text-3xl font-display font-bold text-white">Piano di Studio</h1>
                </div>
                <p class="text-gray-400 text-sm pl-8">Pianifica le tue simulazioni settimanali e mantieni la costanza.</p>
            </div>

            <!-- Widget Streak -->
            <div class="bg-gradient-to-r from-magis-900/30 to-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                        <i data-lucide="flame" class="w-6 h-6 text-orange-500"></i>
                    </div>
                    <div>
                        <h3 class="text-white font-bold text-lg">Streak Attuale: ${(AppState.stats && AppState.stats.streak) || 1} Giorni</h3>
                        <p class="text-gray-400 text-sm">Hai studiato regolarmente questa settimana.</p>
                    </div>
                </div>
                <button class="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg transition border border-gray-700">Imposta Obiettivo</button>
            </div>

            <!-- Calendario Settimanale -->
            <h2 class="text-xl font-bold text-white mb-4">Questa Settimana</h2>
            <div class="flex gap-2 w-full overflow-x-auto pb-4 mb-8">
                ${weekHtml}
            </div>

            <!-- Prossimi Eventi -->
            <h2 class="text-xl font-bold text-white mb-4">In programma per Te</h2>
            <div class="space-y-4">
                <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-lg bg-magis-900/30 flex flex-col items-center justify-center border border-magis-500/30">
                            <span class="text-[10px] text-magis-400 font-bold uppercase tracking-widest">Oggi</span>
                        </div>
                        <div>
                            <h4 class="text-white font-bold mb-1">Esercitazione Scritta: Civile</h4>
                            <p class="text-gray-400 text-sm">Durata prevista: 8h. Traccia selezionata dall'AI.</p>
                        </div>
                    </div>
                    <button onclick="app.startSimulation(8, false, 1)" class="w-full sm:w-auto px-6 py-2 bg-magis-600 hover:bg-magis-500 text-white font-bold rounded-lg transition shadow-lg shrink-0">Inizia Ora</button>
                </div>

                <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-start gap-4 opacity-70">
                        <div class="w-10 h-10 rounded-lg bg-gray-800 flex flex-col items-center justify-center">
                            <span class="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center leading-none mt-1">Dom<br>20</span>
                        </div>
                        <div>
                            <h4 class="text-white font-bold mb-1">Simulazione Orale Mensile</h4>
                            <p class="text-gray-500 text-sm">Test a caso tra le 3 materie fondamentali.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
