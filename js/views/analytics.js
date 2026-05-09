/* ============================================================
   ANALYTICS.JS — Vista Insights & Analytics Avanzata
   
   Fornisce: radar chart per materia, heatmap metriche,
   raccomandazioni smart e KPI cards con trend.
   ============================================================ */

import { AppState } from '../state.js';
import { escapeHtml } from '../utils.js';

/**
 * Calcola tutte le statistiche aggregate dallo storico prove.
 * Restituisce un oggetto con metriche per materia, trend e raccomandazioni.
 */
export function computeAnalytics() {
    var history = AppState.history.filter(h => h.id && h.id !== 'mock-1');
    
    // --- KPI di base ---
    var totalProve = history.length;
    var avgVoto = totalProve > 0 ? history.reduce((a, b) => a + (b.voto || 0), 0) / totalProve : 0;
    
    // --- Breakdown per materia ---
    var materie = {};
    history.forEach(h => {
        var m = h.materia || 'Generale';
        if (!materie[m]) materie[m] = { count: 0, totalVoto: 0, metriche: { correttezza: 0, struttura: 0, terminologia: 0, pertinenza: 0 }, voti: [] };
        materie[m].count++;
        materie[m].totalVoto += (h.voto || 0);
        materie[m].voti.push(h.voto || 0);
        if (h.metriche) {
            materie[m].metriche.correttezza += (h.metriche.correttezza || 0);
            materie[m].metriche.struttura += (h.metriche.struttura || 0);
            materie[m].metriche.terminologia += (h.metriche.terminologia || 0);
            materie[m].metriche.pertinenza += (h.metriche.pertinenza || 0);
        }
    });
    
    // Calcola medie per materia
    Object.keys(materie).forEach(m => {
        var c = materie[m].count;
        materie[m].avgVoto = (materie[m].totalVoto / c).toFixed(1);
        materie[m].metriche.correttezza = Math.round(materie[m].metriche.correttezza / c);
        materie[m].metriche.struttura = Math.round(materie[m].metriche.struttura / c);
        materie[m].metriche.terminologia = Math.round(materie[m].metriche.terminologia / c);
        materie[m].metriche.pertinenza = Math.round(materie[m].metriche.pertinenza / c);
    });
    
    // --- Metriche globali medie ---
    var globalMetriche = { correttezza: 0, struttura: 0, terminologia: 0, pertinenza: 0 };
    var withMetrics = history.filter(h => h.metriche);
    if (withMetrics.length > 0) {
        withMetrics.forEach(h => {
            globalMetriche.correttezza += (h.metriche.correttezza || 0);
            globalMetriche.struttura += (h.metriche.struttura || 0);
            globalMetriche.terminologia += (h.metriche.terminologia || 0);
            globalMetriche.pertinenza += (h.metriche.pertinenza || 0);
        });
        var mc = withMetrics.length;
        globalMetriche.correttezza = Math.round(globalMetriche.correttezza / mc);
        globalMetriche.struttura = Math.round(globalMetriche.struttura / mc);
        globalMetriche.terminologia = Math.round(globalMetriche.terminologia / mc);
        globalMetriche.pertinenza = Math.round(globalMetriche.pertinenza / mc);
    }
    
    // --- Trend (ultime 3 vs precedenti 3 prove) ---
    var trend = 0;
    if (history.length >= 4) {
        var sorted = history.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        var recent3 = sorted.slice(-3);
        var prev3 = sorted.slice(-6, -3);
        if (prev3.length >= 2) {
            var avgRecent = recent3.reduce((a, b) => a + (b.voto || 0), 0) / recent3.length;
            var avgPrev = prev3.reduce((a, b) => a + (b.voto || 0), 0) / prev3.length;
            trend = +(avgRecent - avgPrev).toFixed(1);
        }
    }
    
    // --- Materia più debole ---
    var weakestSubject = null;
    var weakestScore = 100;
    Object.keys(materie).forEach(m => {
        var avgM = parseFloat(materie[m].avgVoto);
        if (avgM < weakestScore) {
            weakestScore = avgM;
            weakestSubject = m;
        }
    });
    
    // --- Metrica più debole ---
    var weakestMetric = null;
    var weakestMetricScore = 100;
    Object.keys(globalMetriche).forEach(k => {
        if (globalMetriche[k] < weakestMetricScore && globalMetriche[k] > 0) {
            weakestMetricScore = globalMetriche[k];
            weakestMetric = k;
        }
    });
    
    // --- Raccomandazioni Smart ---
    var recommendations = [];
    
    if (totalProve === 0) {
        recommendations.push({ icon: 'play', color: 'magis', title: 'Inizia la tua prima prova', desc: 'Completa una simulazione scritta per sbloccare le analitiche personalizzate.' });
    } else {
        // Raccomandazione per materia debole
        if (weakestSubject && Object.keys(materie).length > 1) {
            recommendations.push({ icon: 'target', color: 'red', title: 'Concentrati su ' + weakestSubject, desc: 'La tua media in ' + weakestSubject + ' è ' + weakestScore.toFixed(1) + '/20 — la più bassa. Un ripasso mirato aumenterà il tuo punteggio globale.' });
        }
        
        // Raccomandazione per metrica debole
        if (weakestMetric && weakestMetricScore < 70) {
            var metricLabels = { correttezza: 'Correttezza Giuridica', struttura: 'Struttura Argomentativa', terminologia: 'Lessico Tecnico', pertinenza: 'Pertinenza alla Traccia' };
            recommendations.push({ icon: 'alert-triangle', color: 'yellow', title: 'Migliora: ' + metricLabels[weakestMetric], desc: 'Il tuo punteggio medio è ' + weakestMetricScore + '/100. Lavora su questa competenza trasversale per salire di livello.' });
        }
        
        // Raccomandazione streak
        var streak = AppState.stats.streak || 0;
        if (streak >= 3) {
            recommendations.push({ icon: 'flame', color: 'orange', title: 'Streak di ' + streak + ' giorni! 🔥', desc: 'Stai studiando con costanza. Non fermarti — la coerenza è il tuo asset più potente per il concorso.' });
        } else if (streak === 0) {
            recommendations.push({ icon: 'calendar', color: 'blue', title: 'Ricomincia la tua serie', desc: 'Non hai studiato oggi. Anche 15 minuti di glossario mantengono la mente allenata.' });
        }
        
        // Trend
        if (trend > 0) {
            recommendations.push({ icon: 'trending-up', color: 'green', title: 'Trend positivo +' + trend, desc: 'I tuoi ultimi voti stanno migliorando rispetto a quelli precedenti. Continua così!' });
        } else if (trend < -1) {
            recommendations.push({ icon: 'trending-down', color: 'red', title: 'Trend in calo ' + trend, desc: 'I voti recenti sono in flessione. Prenditi una pausa e rileggi gli schemi ideali delle prove passate.' });
        }

        // Materia mai affrontata
        var allMaterie = ['Civile', 'Penale', 'Amministrativo'];
        var missingMaterie = allMaterie.filter(m => !materie[m]);
        if (missingMaterie.length > 0) {
            recommendations.push({ icon: 'book-open', color: 'magis', title: 'Esplora: ' + missingMaterie[0], desc: 'Non hai ancora sostenuto prove in ' + missingMaterie[0] + '. Il concorso richiede padronanza in tutte e tre le materie.' });
        }
    }
    
    return { totalProve, avgVoto, materie, globalMetriche, trend, weakestSubject, weakestMetric, recommendations };
}

/**
 * Renderizza la sezione "Insights Rapidi" nella Dashboard (widget compatto).
 */
export function renderDashboardInsights() {
    var data = computeAnalytics();
    
    if (data.totalProve === 0) {
        return ''; // Nessun dato: non mostrare nulla
    }
    
    // --- KPI Cards ---
    var trendIcon = data.trend >= 0 ? 'trending-up' : 'trending-down';
    var trendColor = data.trend >= 0 ? 'text-green-400' : 'text-red-400';
    var trendSign = data.trend >= 0 ? '+' : '';
    
    var kpiCards = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Prove Totali</div>
                <div class="text-2xl font-display font-bold text-white">${data.totalProve}</div>
            </div>
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Media Voto</div>
                <div class="text-2xl font-display font-bold text-white">${data.avgVoto.toFixed(1)}<span class="text-sm text-gray-600">/20</span></div>
            </div>
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Trend</div>
                <div class="text-2xl font-display font-bold ${trendColor} flex items-center gap-2">
                    <i data-lucide="${trendIcon}" class="w-5 h-5"></i> ${trendSign}${data.trend}
                </div>
            </div>
            <div class="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Punto Debole</div>
                <div class="text-sm font-bold text-yellow-400 truncate">${data.weakestMetric ? data.weakestMetric.charAt(0).toUpperCase() + data.weakestMetric.slice(1) : '-'}</div>
                <div class="text-[10px] text-gray-500">${data.weakestMetric ? data.globalMetriche[data.weakestMetric] + '/100' : ''}</div>
            </div>
        </div>
    `;
    
    // --- Heatmap Metriche (barre orizzontali colorate) ---
    var metricLabels = { correttezza: 'Correttezza', struttura: 'Struttura', terminologia: 'Lessico', pertinenza: 'Pertinenza' };
    var heatmapRows = Object.entries(data.globalMetriche).map(([key, value]) => {
        var barColor = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : value >= 40 ? 'bg-orange-500' : 'bg-red-500';
        return `
            <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400 w-24 shrink-0">${metricLabels[key] || key}</span>
                <div class="flex-grow bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div class="${barColor} h-full rounded-full transition-all duration-1000 ease-out" style="width: ${value}%"></div>
                </div>
                <span class="text-xs font-mono font-bold ${value >= 70 ? 'text-green-400' : value >= 50 ? 'text-yellow-400' : 'text-red-400'} w-10 text-right">${value}</span>
            </div>
        `;
    }).join('');
    
    // --- Breakdown per Materia (mini cards) ---
    var materiaColors = { Civile: 'blue', Penale: 'red', Amministrativo: 'green' };
    var materiaCards = Object.entries(data.materie).map(([name, info]) => {
        var color = materiaColors[name] || 'gray';
        return `
            <div class="bg-gray-950/50 border border-gray-800 rounded-xl p-3 text-center">
                <div class="text-[10px] font-bold text-${color}-400 uppercase tracking-widest mb-1">${name}</div>
                <div class="text-lg font-bold text-white mb-1">${info.avgVoto}<span class="text-[10px] text-gray-500">/20</span></div>
                <div class="text-[10px] text-gray-500">${info.count} prov${info.count === 1 ? 'a' : 'e'}</div>
            </div>
        `;
    }).join('');
    
    // --- Raccomandazioni ---
    var recColors = { magis: 'magis-500', red: 'red-500', yellow: 'yellow-500', orange: 'orange-500', green: 'green-500', blue: 'blue-500' };
    var recsHtml = data.recommendations.slice(0, 3).map(rec => `
        <div class="flex items-start gap-3 p-3 rounded-xl bg-gray-950/50 border border-gray-800">
            <div class="w-8 h-8 rounded-lg bg-${recColors[rec.color] || 'gray-500'}/10 flex items-center justify-center shrink-0 mt-0.5">
                <i data-lucide="${rec.icon}" class="w-4 h-4 text-${recColors[rec.color] || 'gray-400'}"></i>
            </div>
            <div>
                <h4 class="text-sm font-bold text-white mb-0.5">${escapeHtml(rec.title)}</h4>
                <p class="text-xs text-gray-400 leading-relaxed">${escapeHtml(rec.desc)}</p>
            </div>
        </div>
    `).join('');
    
    return `
        <!-- Analytics Insights Section -->
        <div class="border border-gray-800 rounded-2xl p-6 bg-gray-900/30 space-y-6">
            <div class="flex items-center justify-between">
                <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <i data-lucide="bar-chart-3" class="w-4 h-4 text-magis-400"></i> Insights & Analytics
                </h2>
                <button onclick="app.navigate('history')" class="text-xs text-magis-400 hover:text-magis-300 font-bold flex items-center gap-1 transition">
                    Storico completo <i data-lucide="chevron-right" class="w-3 h-3"></i>
                </button>
            </div>
            
            ${kpiCards}
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Heatmap Competenze -->
                <div class="space-y-3">
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Mappa Competenze</h3>
                    ${heatmapRows}
                </div>
                
                <!-- Breakdown Materie -->
                <div>
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Per Materia</h3>
                    <div class="grid grid-cols-3 gap-3">
                        ${materiaCards || '<div class="col-span-3 text-xs text-gray-500 text-center py-4">Dati insufficienti</div>'}
                    </div>
                </div>
            </div>
            
            <!-- Raccomandazioni Smart -->
            ${recsHtml ? `
                <div>
                    <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <i data-lucide="lightbulb" class="w-3 h-3 text-yellow-400"></i> Suggerimenti Personalizzati
                    </h3>
                    <div class="space-y-3">
                        ${recsHtml}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}
