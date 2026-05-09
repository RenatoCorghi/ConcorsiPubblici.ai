/* ============================================================
   HISTORY.JS — Vista storico prove
   ============================================================ */

import { AppState } from '../state.js';


export function renderHistory() {
    var history = AppState.history;
    
    var cardsHtml = '';
    
    if (history.length === 0) {
        cardsHtml = `
            <div class="col-span-full py-20 text-center">
                <div class="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-800">
                    <i data-lucide="clipboard-list" class="text-gray-600 w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">Ancora nessuna prova</h3>
                <p class="text-gray-500 max-w-xs mx-auto">Le tue simulazioni salvate appariranno qui. Inizia la tua prima prova dalla Dashboard!</p>
                <button onclick="app.navigate('home')" class="mt-8 px-6 py-2 bg-magis-600 text-white rounded-lg font-bold hover:bg-magis-500 transition">Torna alla Dashboard</button>
            </div>
        `;
    } else {
        // Mostriamo le più recenti per prime
        [...history].reverse().forEach((res, i) => {
            var dateStr = new Date(res.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            var colorClass = res.materia === 'Civile' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : 
                               res.materia === 'Penale' ? 'text-red-400 bg-red-400/10 border-red-400/20' : 
                               'text-green-400 bg-green-400/10 border-green-400/20';
            
            cardsHtml += `
            <div class="glass-panel p-6 rounded-2xl flex flex-col border border-gray-800 bg-gray-900/40 hover:border-magis-500/50 transition-all cursor-pointer group fade-in" style="animation-delay: ${i * 0.05}s" onclick="app.viewResult('${res.id}')">
                <div class="flex justify-between items-start mb-4">
                    <span class="px-2.5 py-1 text-[10px] font-bold uppercase rounded border ${colorClass}">${res.materia}</span>
                    <span class="text-[10px] text-gray-500 font-mono">${dateStr}</span>
                </div>
                <div class="mb-6">
                    <div class="text-3xl font-display font-bold text-white mb-1">${res.voto}<span class="text-sm text-gray-600">/20</span></div>
                    <p class="text-xs text-gray-400 line-clamp-2 italic">"${escapeHtml(res.text.substring(0, 100))}..."</p>
                </div>
                <div class="mt-auto flex justify-end">
                    <span class="text-xs font-bold text-magis-400 group-hover:text-magis-300 flex items-center gap-1">Vedi Analisi <i data-lucide="chevron-right" class="w-3 h-3"></i></span>
                </div>
            </div>
            `;
        });
    }

    return `
        <div class="fade-in max-w-6xl mx-auto pb-12">
            <div class="flex items-center gap-4 mb-6">
                <button onclick="app.navigate('home')" class="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition">
                    <i data-lucide="arrow-left" class="w-5 h-5"></i>
                </button>
                <div>
                    <h1 class="text-3xl font-display font-bold text-white">Storico Prove</h1>
                    <p class="text-sm text-gray-500 mt-1">Tutte le tue simulazioni salvate in locale.</p>
                </div>
                <div class="ml-auto flex gap-2">
                    <button onclick="app.exportHistoryCSV()" class="px-3 py-1.5 text-xs font-bold bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg flex items-center gap-1.5 transition border border-gray-700">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i> CSV
                    </button>
                    <button onclick="app.exportHistoryPDF()" class="px-3 py-1.5 text-xs font-bold bg-magis-600 border border-magis-500 text-white hover:bg-magis-500 rounded-lg flex items-center gap-1.5 transition">
                        <i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF
                    </button>
                </div>
            </div>

            <!-- Chart Container -->
            ${history.length > 0 ? `
            <div class="mb-8 p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl w-full">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest"><i data-lucide="trending-up" class="w-4 h-4 inline mr-1"></i> Andamento Voti</h3>
                </div>
                <div class="relative h-48 w-full">
                    <canvas id="historyChart"></canvas>
                </div>
            </div>
            ` : ''}

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${cardsHtml}
            </div>
        </div>
    `;
}

// Global chart instance to avoid destroying non-existent ones
var currentHistoryChart = null;

export function initHistoryChart() {
    var ctx = document.getElementById('historyChart');
    if (!ctx) return;
    
    // Sort array by date ascending for the chart
    var sortedHistory = AppState.history.slice().sort(function(a, b) {
        return new Date(a.date) - new Date(b.date);
    });

    var labels = sortedHistory.map(function(h) { 
        return new Date(h.date).toLocaleDateString('it-IT', {day: '2-digit', month: 'short'}); 
    });
    var dataPoints = sortedHistory.map(function(h) { return h.voto; });

    if (currentHistoryChart) {
        currentHistoryChart.destroy();
    }

    var computedStyle = getComputedStyle(document.documentElement);
    var themeColor400 = computedStyle.getPropertyValue('--magis-400').trim() || '#a78bfa';
    var themeColor500 = computedStyle.getPropertyValue('--magis-500').trim() || '#8b5cf6';

    currentHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Voto / 20',
                data: dataPoints,
                borderColor: themeColor400,
                backgroundColor: themeColor400 + '1a', // ~10% opacity via hex alpha
                borderWidth: 3,
                pointBackgroundColor: themeColor500,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3 // curva morbida
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#6b7280', font: { family: 'Inter' } }
                },
                y: {
                    min: 0,
                    max: 20,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: { color: '#6b7280', font: { family: 'Inter' }, stepSize: 5 }
                }
            }
        }
    });
}
