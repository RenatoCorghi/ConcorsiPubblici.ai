/* ============================================================
   BANDI.JS — Vista "Bandi in Corso" (Concorsi Pubblici)
   
   Mostra i bandi pubblicati sulla Gazzetta Ufficiale con filtri,
   ricerca, countdown scadenze e card premium.
   ============================================================ */

import { escapeHtml } from '../utils.js';

let bandiState = {
    risultati: [],
    filtroCategoria: '',
    filtroQuery: '',
    soloAperti: true,
    stats: null,
    loading: false,
    offset: 0,
    limit: 20
};

// --- Fetch bandi dall'API ---
async function fetchBandi() {
    bandiState.loading = true;
    renderBandiContent();
    
    try {
        let url = `/api/bandi?limit=${bandiState.limit}&offset=${bandiState.offset}`;
        if (bandiState.soloAperti) url += '&aperto=true';
        if (bandiState.filtroCategoria) url += `&categoria=${encodeURIComponent(bandiState.filtroCategoria)}`;
        if (bandiState.filtroQuery) url += `&q=${encodeURIComponent(bandiState.filtroQuery)}`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Errore caricamento bandi');
        const data = await res.json();
        
        bandiState.risultati = data.risultati || [];
        bandiState.loading = false;
        renderBandiContent();
    } catch (e) {
        bandiState.loading = false;
        bandiState.risultati = [];
        renderBandiContent();
    }
}

async function fetchStats() {
    try {
        const res = await fetch('/api/bandi?action=stats');
        if (!res.ok) return;
        bandiState.stats = await res.json();
    } catch (_) { /* silent */ }
}

// --- Helpers ---
function giorniAllaScadenza(scadenza) {
    if (!scadenza) return null;
    const diff = Math.ceil((new Date(scadenza) - new Date()) / 86400000);
    return diff;
}

function badgeScadenza(scadenza) {
    const giorni = giorniAllaScadenza(scadenza);
    if (giorni === null) return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-500 border border-gray-700">Scadenza N/D</span>';
    if (giorni < 0) return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-900 text-gray-600 border border-gray-800 line-through">Scaduto</span>';
    if (giorni <= 3) return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-800 animate-pulse">🔴 ${giorni === 0 ? 'SCADE OGGI' : giorni + 'g rimasti'}</span>`;
    if (giorni <= 10) return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-900/50 text-orange-300 border border-orange-800">🟠 ${giorni}g rimasti</span>`;
    if (giorni <= 30) return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-800">🟡 ${giorni}g rimasti</span>`;
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/50 text-emerald-300 border border-emerald-800">🟢 ${giorni}g rimasti</span>`;
}

function categoriaIcon(cat) {
    const icons = {
        'Università': 'graduation-cap',
        'Enti Locali': 'landmark',
        'Amministrazioni Centrali': 'building-2',
        'Sanità': 'heart-pulse',
        'Regioni': 'map-pin',
        'Enti di Ricerca': 'microscope',
        'Forze Armate e Polizia': 'shield',
        'Istruzione': 'book-open',
        'Giustizia': 'scale',
        'Agenzie Fiscali': 'receipt',
        'Altro': 'file-text'
    };
    return icons[cat] || 'file-text';
}

function categoriaColor(cat) {
    const colors = {
        'Università': 'from-blue-600 to-indigo-600',
        'Enti Locali': 'from-amber-600 to-orange-600',
        'Amministrazioni Centrali': 'from-purple-600 to-violet-600',
        'Sanità': 'from-red-600 to-rose-600',
        'Regioni': 'from-teal-600 to-cyan-600',
        'Enti di Ricerca': 'from-emerald-600 to-green-600',
        'Forze Armate e Polizia': 'from-slate-600 to-zinc-600',
        'Istruzione': 'from-sky-600 to-blue-600',
        'Giustizia': 'from-fuchsia-600 to-pink-600',
        'Agenzie Fiscali': 'from-lime-600 to-green-600',
    };
    return colors[cat] || 'from-gray-600 to-gray-700';
}

// --- Render principale ---
export function renderBandiView() {
    // Avvia fetch in background
    setTimeout(() => {
        fetchStats().then(() => renderBandiContent());
        fetchBandi();
    }, 100);

    return `
        <div class="max-w-6xl mx-auto py-6 px-4 fade-in" id="bandi-container">
            <!-- Header -->
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                <div class="flex items-center gap-4">
                    <button onclick="app.navigate('home')" class="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition border border-gray-800">
                        <i data-lucide="arrow-left" class="w-5 h-5"></i>
                    </button>
                    <div>
                        <h1 class="text-3xl font-display font-bold text-white flex items-center gap-3">
                            <div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                                <i data-lucide="megaphone" class="w-5 h-5 text-white"></i>
                            </div>
                            Bandi in Corso
                        </h1>
                        <p class="text-sm text-gray-500 mt-1">Gazzetta Ufficiale — 4ª Serie Speciale (Concorsi ed Esami)</p>
                    </div>
                </div>
                <div id="bandi-stats-mini" class="flex gap-3"></div>
            </div>

            <!-- Stats Cards -->
            <div id="bandi-stats-cards" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"></div>

            <!-- Filtri -->
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                <div class="flex-grow relative">
                    <i data-lucide="search" class="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"></i>
                    <input id="bandi-search" type="text" placeholder="Cerca bandi (es. funzionario, dirigente, Roma...)" 
                        class="w-full bg-gray-950 border border-gray-800 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 transition"
                        onkeydown="if(event.key==='Enter')app.searchBandi()"
                        value="${escapeHtml(bandiState.filtroQuery)}" />
                </div>
                <select id="bandi-categoria" onchange="app.filterBandiCategoria(this.value)"
                    class="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 transition">
                    <option value="">Tutte le categorie</option>
                    <option value="Amministrazioni Centrali" ${bandiState.filtroCategoria === 'Amministrazioni Centrali' ? 'selected' : ''}>🏛️ Amministrazioni Centrali</option>
                    <option value="Enti Locali" ${bandiState.filtroCategoria === 'Enti Locali' ? 'selected' : ''}>🏘️ Enti Locali</option>
                    <option value="Università" ${bandiState.filtroCategoria === 'Università' ? 'selected' : ''}>🎓 Università</option>
                    <option value="Sanità" ${bandiState.filtroCategoria === 'Sanità' ? 'selected' : ''}>🏥 Sanità</option>
                    <option value="Giustizia" ${bandiState.filtroCategoria === 'Giustizia' ? 'selected' : ''}>⚖️ Giustizia</option>
                    <option value="Forze Armate e Polizia" ${bandiState.filtroCategoria === 'Forze Armate e Polizia' ? 'selected' : ''}>🛡️ Forze Armate</option>
                    <option value="Istruzione" ${bandiState.filtroCategoria === 'Istruzione' ? 'selected' : ''}>📚 Istruzione</option>
                    <option value="Enti di Ricerca" ${bandiState.filtroCategoria === 'Enti di Ricerca' ? 'selected' : ''}>🔬 Ricerca</option>
                    <option value="Agenzie Fiscali" ${bandiState.filtroCategoria === 'Agenzie Fiscali' ? 'selected' : ''}>🧾 Agenzie Fiscali</option>
                    <option value="Regioni" ${bandiState.filtroCategoria === 'Regioni' ? 'selected' : ''}>📍 Regioni</option>
                </select>
                <label class="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer hover:border-gray-700 transition">
                    <input type="checkbox" id="bandi-aperti" ${bandiState.soloAperti ? 'checked' : ''} onchange="app.toggleBandiAperti()" class="accent-amber-500" />
                    <span class="text-sm text-gray-300 whitespace-nowrap">Solo aperti</span>
                </label>
                <button onclick="app.searchBandi()" class="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition shadow-lg shadow-amber-600/20 whitespace-nowrap">
                    <i data-lucide="search" class="w-4 h-4 inline"></i> Cerca
                </button>
            </div>

            <!-- Risultati -->
            <div id="bandi-results" class="space-y-4">
                <div class="text-center py-12 text-gray-500"><div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>Caricamento bandi...</div>
            </div>

            <!-- Paginazione -->
            <div id="bandi-pagination" class="flex justify-center gap-3 mt-8"></div>
        </div>
    `;
}

// --- Render dinamico dei contenuti ---
function renderBandiContent() {
    // Stats cards
    const statsContainer = document.getElementById('bandi-stats-cards');
    if (statsContainer && bandiState.stats) {
        const s = bandiState.stats;
        statsContainer.innerHTML = `
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                <div class="text-3xl font-bold text-amber-400 font-display">${s.totale || 0}</div>
                <div class="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">Bandi Totali</div>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                <div class="text-3xl font-bold text-emerald-400 font-display">${s.aperti || 0}</div>
                <div class="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">Ancora Aperti</div>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                <div class="text-3xl font-bold text-red-400 font-display">${(s.scadenze_imminenti || []).length}</div>
                <div class="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">Scadono a Breve</div>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                <div class="text-3xl font-bold text-purple-400 font-display">${Object.keys(s.per_categoria || {}).length}</div>
                <div class="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">Categorie</div>
            </div>
        `;
    }
    
    // Risultati
    const resultsContainer = document.getElementById('bandi-results');
    if (!resultsContainer) return;

    if (bandiState.loading) {
        resultsContainer.innerHTML = `<div class="text-center py-12 text-gray-500"><div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>Caricamento bandi...</div>`;
        return;
    }

    if (bandiState.risultati.length === 0) {
        resultsContainer.innerHTML = `
            <div class="text-center py-16 bg-gray-900/50 rounded-2xl border border-gray-800">
                <i data-lucide="inbox" class="w-12 h-12 text-gray-700 mx-auto mb-4"></i>
                <h3 class="text-xl font-bold text-gray-400 mb-2">Nessun bando trovato</h3>
                <p class="text-gray-600 text-sm">Prova a modificare i filtri o la ricerca.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    resultsContainer.innerHTML = bandiState.risultati.map(b => {
        const giorni = giorniAllaScadenza(b.scadenza);
        const isScaduto = giorni !== null && giorni < 0;
        const borderColor = isScaduto ? 'border-gray-800 opacity-60' : (giorni !== null && giorni <= 7) ? 'border-red-900/50' : 'border-gray-800';
        const gradientColor = categoriaColor(b.categoria);
        
        return `
            <div class="bg-gray-900 border ${borderColor} rounded-2xl p-5 hover:border-gray-700 transition group ${isScaduto ? 'hover:opacity-80' : ''}">
                <div class="flex flex-col md:flex-row gap-4">
                    <!-- Icona Categoria -->
                    <div class="flex-shrink-0">
                        <div class="w-12 h-12 bg-gradient-to-br ${gradientColor} rounded-xl flex items-center justify-center shadow-lg">
                            <i data-lucide="${categoriaIcon(b.categoria)}" class="w-6 h-6 text-white"></i>
                        </div>
                    </div>
                    <!-- Contenuto -->
                    <div class="flex-grow min-w-0">
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">${escapeHtml(b.tipo || 'CONCORSO')}</span>
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-amber-400 border border-gray-700">${escapeHtml(b.categoria || 'Altro')}</span>
                            ${b.posti ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/50 text-blue-300 border border-blue-800">${b.posti} post${b.posti > 1 ? 'i' : 'o'}</span>` : ''}
                            ${badgeScadenza(b.scadenza)}
                        </div>
                        <h3 class="text-white font-bold text-sm md:text-base leading-snug mb-2 group-hover:text-amber-300 transition line-clamp-2">${escapeHtml(b.titolo)}</h3>
                        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            ${b.ente ? `<span class="flex items-center gap-1"><i data-lucide="building-2" class="w-3 h-3"></i> ${escapeHtml(b.ente.substring(0, 60))}</span>` : ''}
                            ${b.data_pubblicazione ? `<span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3"></i> GU ${new Date(b.data_pubblicazione).toLocaleDateString('it-IT')}</span>` : ''}
                            ${b.scadenza ? `<span class="flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> Scade: ${new Date(b.scadenza).toLocaleDateString('it-IT')}</span>` : ''}
                        </div>
                    </div>
                    <!-- CTA -->
                    <div class="flex-shrink-0 flex items-center">
                        ${b.url_gazzetta ? `
                            <a href="${escapeHtml(b.url_gazzetta)}" target="_blank" rel="noopener noreferrer"
                                class="px-4 py-2.5 bg-gray-800 hover:bg-amber-600 border border-gray-700 hover:border-amber-500 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap shadow-sm">
                                <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Leggi Bando
                            </a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Paginazione
    const pagContainer = document.getElementById('bandi-pagination');
    if (pagContainer && bandiState.risultati.length >= bandiState.limit) {
        pagContainer.innerHTML = `
            ${bandiState.offset > 0 ? `<button onclick="app.bandiPagina(-1)" class="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-bold transition">← Precedenti</button>` : ''}
            <button onclick="app.bandiPagina(1)" class="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-amber-600/20">Successivi →</button>
        `;
    } else if (pagContainer) {
        pagContainer.innerHTML = bandiState.offset > 0 ? `<button onclick="app.bandiPagina(-1)" class="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-bold transition">← Precedenti</button>` : '';
    }

    if (window.lucide) lucide.createIcons();
}

// --- Azioni esposte ---
export function searchBandi() {
    const input = document.getElementById('bandi-search');
    bandiState.filtroQuery = input ? input.value.trim() : '';
    bandiState.offset = 0;
    fetchBandi();
}

export function filterBandiCategoria(cat) {
    bandiState.filtroCategoria = cat;
    bandiState.offset = 0;
    fetchBandi();
}

export function toggleBandiAperti() {
    bandiState.soloAperti = !bandiState.soloAperti;
    bandiState.offset = 0;
    fetchBandi();
}

export function bandiPagina(dir) {
    bandiState.offset = Math.max(0, bandiState.offset + (dir * bandiState.limit));
    fetchBandi();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
