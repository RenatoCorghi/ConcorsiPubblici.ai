/* ============================================================
   GIURISPRUDENZA.JS — Banca Dati Giustizia Amministrativa
   Ricerca e consultazione provvedimenti (CC-BY 4.0)
   ============================================================ */

import { APP_CONFIG } from '../config.js';
import { escapeHtml } from '../utils.js';

// State locale per la vista
let searchState = {
    query: '',
    tipo: '',
    sede: '',
    anno: '',
    results: [],
    loading: false,
    totalCount: 0,
    offset: 0,
    stats: null,
    selectedId: null,
    tab: 'schede',       // Rimosso amministrativa di default
    vipDocs: null,       // Cache per schede VIP
    vipFilter: '',       // Filtro testo per schede VIP
    vipCategory: '',     // Categoria attiva VIP (di default vuota per lazy loading)
    contentMatchIds: null,   // Set<document_id> da ricerca FTS nel contenuto
    contentSearching: false, // Flag ricerca contenuto in corso
    vipOffset: 0,        // Offset per paginazione delle schede VIP
    vipHasMore: false    // Flag se ci sono altri elementi da caricare nelle schede VIP
};

const TIPI = ['SENTENZA', 'ORDINANZA', 'DECRETO', 'PARERE'];
const ANNI = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

// ── API CALLS ──

async function apiCall(params) {
    const endpoint = searchState.tab === 'cassazione' ? '/api/ssuu' : '/api/giustizia';
    const base = window.location.hostname === 'localhost' ? endpoint : endpoint;
    const url = new URL(base, window.location.origin);
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function loadStats() {
    try {
        if (searchState.tab !== 'cassazione') {
            searchState.stats = await apiCall({ action: 'stats' });
        }
    } catch { searchState.stats = null; }
}

async function doSearch(append = false) {
    searchState.loading = true;
    updateResultsUI();
    try {
        let params = {
            q: searchState.query || undefined,
            limit: '20',
            offset: String(searchState.offset)
        };
        
        if (searchState.tab !== 'cassazione') {
            params.tipo = searchState.tipo || undefined;
            params.sede = searchState.sede || undefined;
            params.anno = searchState.anno || undefined;
        }

        const data = await apiCall(params);
        if (append) {
            searchState.results = [...searchState.results, ...(data.risultati || [])];
        } else {
            searchState.results = data.risultati || [];
        }
        searchState.totalCount = data.count || searchState.results.length;
    } catch (err) {
        console.error('Errore ricerca:', err);
        searchState.results = [];
    }
    searchState.loading = false;
    updateResultsUI();
}

async function loadDetail(id) {
    try {
        const data = await apiCall({ id: String(id) });
        if (data.provvedimento) {
            searchState.selectedId = id;
            showDetailModal(data.provvedimento);
        } else if (data.documento) {
            searchState.selectedId = id;
            showDetailModal(data.documento);
        }
    } catch (err) {
        console.error('Errore dettaglio:', err);
    }
}

// ── RENDER ──

export function renderGiurisprudenza() {
    // Carichiamo subito le schede VIP dato che questa è l'unica vista ora
    setTimeout(loadVIPSchede, 0);

    return `
        <div class="fade-in space-y-6">
            <!-- Header -->
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-display font-bold text-white mb-1">La Giurisprudenza Decodificata</h1>
                    <p class="text-gray-400 text-sm">Migliaia di pronunce di Sezioni Unite, Consiglio di Stato e TAR analizzate riga per riga per estrarne il cuore dogmatico.</p>
                </div>
            </div>

            <!-- SCHEDE VIP TAB -->
            <div id="ga-vip-container" class="space-y-4">
                <div class="glass-panel border border-gray-800 rounded-2xl p-5">
                    <div class="flex flex-col md:flex-row gap-3 mb-4">
                        <div class="flex-grow relative">
                            <i data-lucide="search" class="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"></i>
                            <input id="ga-vip-search" type="text" placeholder="Cerca per titolo o contenuto (es. ricettazione, appalti, risarcimento...)" 
                                class="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:border-emerald-500 focus:outline-none transition"
                                value="${searchState.vipFilter}"
                                oninput="window._gaVipFilter(this.value)">
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${[{id:'all',label:'Tutte',icon:'layers'},{id:'ssuu_civili',label:'SS.UU. Civili',icon:'scale'},{id:'ssuu_penali',label:'SS.UU. Penali',icon:'gavel'},{id:'corte_cost',label:'Corte Costituzionale',icon:'building-2'},{id:'sez_semplici',label:'Cass. Sez. Semplici',icon:'scale-3d'},{id:'massimari',label:'Massimari',icon:'book-marked'},{id:'riviste',label:'Casi Rilievo Sistematico',icon:'book-open-check'},{id:'cds',label:'Consiglio di Stato',icon:'landmark'},{id:'tar',label:'TAR',icon:'file-text'},{id:'cgt',label:'Corti Giust. Tributaria',icon:'coins'}].map(c => 
                            `<button onclick="window._gaVipCategory('${c.id}')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${searchState.vipCategory === c.id ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'}">
                                <i data-lucide="${c.icon}" class="w-3.5 h-3.5"></i> ${c.label}
                            </button>`
                        ).join('')}
                    </div>
                </div>
                <div id="ga-vip-results" class="space-y-2">
                    <div class="text-center py-12"><div class="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div><p class="text-gray-500 text-sm mt-3">Caricamento schede...</p></div>
                </div>
            </div>
        </div>
    `;
}

function renderStatsBarPlaceholder() {
    return [
        { icon: 'scale', label: 'Sentenze', color: 'magis' },
        { icon: 'file-text', label: 'Ordinanze', color: 'blue' },
        { icon: 'stamp', label: 'Decreti', color: 'orange' },
        { icon: 'message-square', label: 'Pareri', color: 'emerald' }
    ].map(s => `
        <div class="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <div class="flex items-center gap-2 mb-1">
                <i data-lucide="${s.icon}" class="w-4 h-4 text-${s.color}-400"></i>
                <span class="text-xs text-gray-500 font-medium">${s.label}</span>
            </div>
            <div class="text-lg font-bold text-white">—</div>
        </div>
    `).join('');
}

function renderStatsBar(stats) {
    if (!stats?.per_tipo) return renderStatsBarPlaceholder();
    const items = [
        { icon: 'scale', label: 'Sentenze', color: 'magis', macroType: 'SENTENZA', keys: ['SENTENZA', 'SENTENZA BREVE'] },
        { icon: 'file-text', label: 'Ordinanze', color: 'blue', macroType: 'ORDINANZA', keys: ['ORDINANZA CAUTELARE', 'ORDINANZA COLLEGIALE', 'ORDINANZA PRESIDENZIALE'] },
        { icon: 'stamp', label: 'Decreti', color: 'orange', macroType: 'DECRETO', keys: ['DECRETO DECISORIO', 'DECRETO CAUTELARE', 'DECRETO COLLEGIALE', 'DECRETO INGIUNTIVO', 'DECRETO PRESIDENZIALE'] },
        { icon: 'message-square', label: 'Pareri', color: 'emerald', macroType: 'PARERE', keys: ['PARERE DEFINITIVO', 'PARERE INTERLOCUTORIO', 'PARERE SOSPENSIVO'] }
    ];
    // Update badge
    const badge = document.getElementById('ga-total-badge');
    if (badge) badge.textContent = `${stats.totale_provvedimenti?.toLocaleString('it-IT') || '~290.000'} atti`;

    return items.map(s => {
        const total = s.keys.reduce((sum, k) => sum + (stats.per_tipo[k]?.totale || 0), 0);
        return `
            <div class="p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:border-${s.color}-500/30 transition cursor-pointer" onclick="window._gaFilterTipo('${s.macroType}')">
                <div class="flex items-center gap-2 mb-1">
                    <i data-lucide="${s.icon}" class="w-4 h-4 text-${s.color}-400"></i>
                    <span class="text-xs text-gray-500 font-medium">${s.label}</span>
                </div>
                <div class="text-lg font-bold text-white">${total.toLocaleString('it-IT')}</div>
            </div>
        `;
    }).join('');
}

function renderEmptyState() {
    return `
        <div class="text-center py-16 text-gray-500">
            <div class="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto mb-4">
                <i data-lucide="scale" class="w-8 h-8 text-gray-600"></i>
            </div>
            <p class="text-lg font-medium text-gray-400 mb-2">Cerca nella banca dati</p>
            <p class="text-sm">Scrivi un termine nell'oggetto del ricorso o usa i filtri per esplorare.</p>
        </div>
    `;
}

function renderResults() {
    const isCassazione = searchState.tab === 'cassazione';

    const esitoBadge = (esito) => {
        if (!esito) return '';
        const lower = esito.toLowerCase();
        let color = 'gray';
        if (lower.includes('accog') || lower.includes('accolto')) color = 'emerald';
        else if (lower.includes('respin') || lower.includes('rigett')) color = 'red';
        else if (lower.includes('improc') || lower.includes('inammissibil')) color = 'yellow';
        return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-${color}-900/50 text-${color}-300 border border-${color}-800/50 uppercase">${escapeHtml(esito.length > 30 ? esito.substring(0, 30) + '…' : esito)}</span>`;
    };

    const tipoBadge = (tipo) => {
        let color = 'magis';
        if (tipo?.includes('ORDINANZA')) color = 'blue';
        else if (tipo?.includes('DECRETO')) color = 'orange';
        else if (tipo?.includes('PARERE')) color = 'emerald';
        return `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-${color}-900/50 text-${color}-300 border border-${color}-800/50">${escapeHtml(tipo || '')}</span>`;
    };

    let html = `<div class="text-xs text-gray-500 mb-2">${searchState.totalCount > 0 ? searchState.totalCount.toLocaleString('it-IT') + ' risultati' : searchState.results.length + ' risultati'}</div>`;

    html += searchState.results.map(r => {
        if (isCassazione) {
            return `
                <div class="p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/70 hover:border-magis-500/50 transition cursor-pointer group relative overflow-hidden" onclick="window._gaDetail('${r.id}')">
                    <div class="absolute right-0 top-0 w-32 h-32 bg-magis-600/10 rounded-bl-full -z-0"></div>
                    <div class="flex flex-wrap items-center gap-2 mb-2 relative z-10">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-magis-900/50 text-magis-300 border border-magis-800/50 flex items-center gap-1">
                            <i data-lucide="sparkles" class="w-3 h-3"></i> VIP DOSSIER
                        </span>
                        <span class="text-[10px] text-gray-500 font-mono">${escapeHtml(r.filename || '')}</span>
                        ${r.created_at ? `<span class="text-[10px] text-gray-600 ml-auto">${new Date(r.created_at).toLocaleDateString('it-IT')}</span>` : ''}
                    </div>
                    <p class="text-md font-bold text-gray-200 group-hover:text-white transition relative z-10">${escapeHtml(r.titolo || 'Sezioni Unite Civili')}</p>
                </div>
            `;
        }

        const oggetto = r.oggetto || r.oggetto_ricorso || r.oggetto_parere || 'Oggetto non disponibile';
        return `
            <div class="p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/70 hover:border-gray-700 transition cursor-pointer group" onclick="window._gaDetail('${r.id}')">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    ${tipoBadge(r.tipo_provvedimento)}
                    ${esitoBadge(r.esito)}
                    <span class="text-[10px] text-gray-500">n. ${escapeHtml(String(r.numero_provvedimento))} · ${escapeHtml(r.sede_nome || r.sede_slug)} ${r.sezione_nome ? '· ' + escapeHtml(r.sezione_nome) : ''}</span>
                    ${r.data_pubblicazione ? `<span class="text-[10px] text-gray-600 ml-auto">${new Date(r.data_pubblicazione).toLocaleDateString('it-IT')}</span>` : ''}
                </div>
                <p class="text-sm text-gray-300 group-hover:text-white transition line-clamp-2">${escapeHtml(oggetto)}</p>
                ${r.tipo_ricorso ? `<p class="text-[11px] text-gray-600 mt-1">${escapeHtml(r.tipo_ricorso)}</p>` : ''}
            </div>
        `;
    }).join('');

    if (searchState.results.length < searchState.totalCount) {
        html += `
            <button onclick="window._gaLoadMore()" class="w-full py-3 text-sm text-magis-400 hover:text-white border border-gray-800 rounded-xl hover:border-magis-500/50 transition font-medium">
                Carica altri risultati...
            </button>
        `;
    }

    return html;
}

function showDetailModal(data) {
    let existing = document.getElementById('ga-detail-modal');
    if (existing) existing.remove();

    const isCassazione = searchState.tab === 'cassazione';
    let prov = isCassazione ? data : data; // data è il record

    const modal = document.createElement('div');
    modal.id = 'ga-detail-modal';
    modal.className = 'fixed inset-0 z-[200] flex items-start justify-center p-4 pt-12 bg-gray-950/90 backdrop-blur-sm fade-in overflow-y-auto';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    let innerContent = '';

    if (data._isVip) {
        // Scheda VIP aperta dal tab Schede
        innerContent = `
            <div class="mb-4 flex flex-wrap items-center gap-2">
                <span class="px-2 py-1 rounded text-xs font-bold bg-emerald-900/50 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> SCHEDA VIP
                </span>
                <span class="text-xs text-gray-500">${escapeHtml(data._materia || '')}</span>
            </div>
            <h2 class="text-2xl font-display font-bold text-white mb-6">${escapeHtml(data.titolo)}</h2>
            <div class="prose prose-invert prose-dottrina max-w-none">
                ${data._mdHtml}
            </div>
            <div class="mt-8 pt-4 border-t border-gray-800 text-[10px] text-gray-600 text-center">
                Elaborato da ConcorsiPubblici.ai — Analisi dogmatica automatizzata
            </div>
        `;
    } else if (isCassazione) {
        // Formattazione per Dossier VIP (usiamo il markdown renderer se disponibile, altrimenti testo)
        let mdHtml = '';
        if (window.marked && typeof window.marked.parse === 'function') {
            mdHtml = window.marked.parse(prov.testo_completo || '*Contenuto in elaborazione*');
        } else {
            mdHtml = `<div class="whitespace-pre-wrap">${escapeHtml(prov.testo_completo || '')}</div>`;
        }

        innerContent = `
            <div class="mb-4 flex flex-wrap items-center gap-2">
                <span class="px-2 py-1 rounded text-xs font-bold bg-magis-900/50 text-magis-300 border border-magis-800 flex items-center gap-1">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> DOSSIER VIP
                </span>
                <span class="text-xs text-gray-500 font-mono">${escapeHtml(prov.filename)}</span>
            </div>
            <h2 class="text-2xl font-display font-bold text-white mb-6">${escapeHtml(prov.titolo)}</h2>
            <div class="prose prose-invert prose-dottrina max-w-none">
                ${mdHtml}
            </div>
            <div class="mt-8 pt-4 border-t border-gray-800 text-[10px] text-gray-600 text-center">
                Elaborato da Concorsi.AI — Fonte: Corte Suprema di Cassazione
            </div>
        `;
    } else {
        // Formattazione Amministrativa
        const oggetto = prov.oggetto_ricorso || prov.oggetto_parere || '';
        const testo = prov.testo_completo || null;
        innerContent = `
            <div class="mb-6">
                <div class="flex flex-wrap items-center gap-2 mb-3">
                    <span class="px-2 py-1 rounded text-xs font-bold bg-magis-900/50 text-magis-300 border border-magis-800">${prov.tipo_provvedimento}</span>
                    ${prov.esito ? `<span class="px-2 py-1 rounded text-xs font-bold bg-gray-800 text-gray-300 border border-gray-700">${prov.esito}</span>` : ''}
                </div>
                <h2 class="text-xl font-bold text-white mb-2">Provvedimento n. ${prov.numero_provvedimento}</h2>
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span><strong>Sede:</strong> ${prov.sede_nome || prov.sede_slug}</span>
                    ${prov.sezione_nome ? `<span><strong>Sezione:</strong> ${prov.sezione_nome}</span>` : ''}
                    ${prov.data_pubblicazione ? `<span><strong>Pubblicato:</strong> ${new Date(prov.data_pubblicazione).toLocaleDateString('it-IT')}</span>` : ''}
                    ${prov.tipo_udienza ? `<span><strong>Udienza:</strong> ${prov.tipo_udienza}</span>` : ''}
                    ${prov.num_membri_collegio ? `<span><strong>Collegio:</strong> ${prov.num_membri_collegio} membri</span>` : ''}
                </div>
            </div>

            ${oggetto ? `
                <div class="mb-6">
                    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Oggetto</h3>
                    <p class="text-sm text-gray-300 leading-relaxed">${escapeHtml(oggetto)}</p>
                </div>
            ` : ''}

            ${testo ? `
                <div class="border-t border-gray-800 pt-6">
                    <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <i data-lucide="file-text" class="w-4 h-4"></i> Testo Integrale
                    </h3>
                    <div class="max-h-[50vh] overflow-y-auto pr-2 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-mono text-[12px] bg-gray-950/50 rounded-xl p-4 border border-gray-800">${escapeHtml(testo.substring(0, 50000))}</div>
                </div>
            ` : `
                <div class="border-t border-gray-800 pt-6 text-center py-8">
                    <p class="text-sm text-gray-500">Testo integrale non ancora disponibile per questo provvedimento.</p>
                    <p class="text-xs text-gray-600 mt-1">I testi vengono scaricati progressivamente.</p>
                </div>
            `}

            <div class="mt-6 pt-4 border-t border-gray-800 text-[10px] text-gray-600 text-center">
                Fonte: OpenGA — Giustizia Amministrativa · Licenza CC-BY 4.0
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 md:p-8 max-w-3xl w-full shadow-2xl relative mb-12" onclick="event.stopPropagation()">
            <button onclick="document.getElementById('ga-detail-modal').remove()" class="absolute top-4 right-4 p-2 text-gray-500 hover:text-white transition"><i data-lucide="x" class="w-5 h-5"></i></button>
            ${innerContent}
        </div>
    `;

    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();
}

// ── UI UPDATE ──

function updateResultsUI() {
    const el = document.getElementById('ga-results');
    if (!el) return;
    if (searchState.loading) {
        el.innerHTML = `<div class="text-center py-12"><div class="inline-block w-8 h-8 border-2 border-magis-500 border-t-transparent rounded-full animate-spin"></div><p class="text-gray-500 text-sm mt-3">Ricerca in corso...</p></div>`;
    } else {
        el.innerHTML = searchState.results.length > 0 ? renderResults() : (searchState.query || searchState.tipo || searchState.anno ? '<div class="text-center py-12 text-gray-500"><p>Nessun risultato trovato.</p></div>' : renderEmptyState());
    }
    if (window.lucide) lucide.createIcons();
}

// ── GLOBAL HANDLERS ──

window._biblioTab = (tabId) => {
    searchState.tab = tabId;
    searchState.query = '';
    searchState.tipo = '';
    searchState.sede = '';
    searchState.anno = '';
    searchState.offset = 0;
    searchState.results = [];
    if (tabId === 'cassazione') {
        doSearch();
    }
    // Re-render
    const main = document.getElementById('main-content');
    if (main) {
        main.innerHTML = renderGiurisprudenza();
        if (window.lucide) lucide.createIcons();
    }
    // Load VIP schede if tab is 'schede'
    if (tabId === 'schede') {
        loadVIPSchede();
    }
};

window._gaSearch = () => {
    const input = document.getElementById('ga-search-input');
    searchState.query = input?.value || '';
    searchState.offset = 0;
    doSearch();
};

window._gaFilterChange = () => {
    searchState.tipo = document.getElementById('ga-filter-tipo')?.value || '';
    searchState.anno = document.getElementById('ga-filter-anno')?.value || '';
    searchState.offset = 0;
    doSearch();
};

window._gaFilterTipo = (tipo) => {
    searchState.tipo = tipo;
    searchState.offset = 0;
    const sel = document.getElementById('ga-filter-tipo');
    if (sel) sel.value = tipo;
    doSearch();
};

window._gaReset = () => {
    searchState.query = '';
    searchState.tipo = '';
    searchState.sede = '';
    searchState.anno = '';
    searchState.offset = 0;
    searchState.results = [];
    const input = document.getElementById('ga-search-input');
    if (input) input.value = '';
    const tipoSel = document.getElementById('ga-filter-tipo');
    if (tipoSel) tipoSel.value = '';
    const annoSel = document.getElementById('ga-filter-anno');
    if (annoSel) annoSel.value = '';
    updateResultsUI();
};

window._gaLoadMore = () => {
    searchState.offset += 20;
    doSearch(true);
};

window._gaDetail = (id) => { loadDetail(id); };

// ── VIP SCHEDE LOGIC ──

async function loadVIPSchede() {
    const container = document.getElementById('ga-vip-results');
    if (!container) return;

    // Se non c'è nessuna categoria selezionata e non c'è ricerca attiva, mostriamo lo stato iniziale vuoto
    if (!searchState.vipCategory && !searchState.vipFilter) {
        container.innerHTML = `
            <div class="text-center py-16 text-gray-500">
                <div class="w-16 h-16 rounded-full bg-gray-800/30 flex items-center justify-center mx-auto mb-4 border border-gray-800/50">
                    <i data-lucide="sparkles" class="w-8 h-8 text-emerald-500/70 animate-pulse"></i>
                </div>
                <p class="text-base font-medium text-gray-300 mb-1">Seleziona una sezione</p>
                <p class="text-xs text-gray-500 max-w-md mx-auto">Scegli una categoria di sentenze qui sopra oppure digita un termine nella barra di ricerca per visualizzare le schede della giurisprudenza decodificata.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Se c'è una ricerca attiva, la deleghiamo interamente a _searchVIPContent per trovare tutti i risultati nel DB
    if (searchState.vipFilter) {
        _searchVIPContent(searchState.vipFilter);
        return;
    }

    // Use cache if available and we are not doing a paginated load
    if (searchState.vipDocs && searchState.vipDocs.length > 0 && searchState.vipOffset > 0 && searchState.vipOffset % 90 !== 0) {
        renderVIPSchede();
        return;
    }

    if (!window.supabaseClient) {
        container.innerHTML = '<p class="text-red-500 text-center py-8">Database non connesso.</p>';
        return;
    }

    // Mostra caricamento solo sul primo blocco
    if (!searchState.vipDocs || searchState.vipDocs.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-gray-500 text-sm mt-3">Caricamento schede...</p>
            </div>
        `;
    }

    try {
        const limit = 90;

        // Costruiamo la query mirata in base alla categoria selezionata per caricare solo il necessario!
        let queryBuilder = window.supabaseClient.from('rag_documents').select('id, titolo, tipo, materia, filename, is_caso_sistematico');

        const cat = searchState.vipCategory;
        if (cat && cat !== 'all') {
            if (cat === 'ssuu_civili') {
                queryBuilder = queryBuilder
                    .in('tipo', ['sentenza_ssuu', 'sentenza_ssuu_vip'])
                    .in('materia', ['Diritto Civile', 'Giurisprudenza Civile']);
            } else if (cat === 'ssuu_penali') {
                queryBuilder = queryBuilder
                    .in('tipo', ['sentenza_ssuu', 'sentenza_ssuu_vip'])
                    .in('materia', ['Diritto Penale', 'Giurisprudenza Penale']);
            } else if (cat === 'corte_cost') {
                queryBuilder = queryBuilder.in('tipo', ['sentenza_corte_cost_vip', 'sentenza_cc_vip']);
            } else if (cat === 'sez_semplici') {
                queryBuilder = queryBuilder.in('tipo', ['sentenza_sez_semplici_vip', 'scheda_manualistica_v3']);
            } else if (cat === 'massimari') {
                queryBuilder = queryBuilder.eq('tipo', 'massimario_cassazione');
            } else if (cat === 'riviste') {
                queryBuilder = queryBuilder.eq('is_caso_sistematico', true);
            } else if (cat === 'cds') {
                queryBuilder = queryBuilder
                    .in('tipo', ['sentenza_admin', 'sentenza_admin_vip'])
                    .like('filename', 'cds_%');
            } else if (cat === 'tar') {
                queryBuilder = queryBuilder
                    .in('tipo', ['sentenza_admin', 'sentenza_admin_vip'])
                    .like('filename', 'tar-%');
            } else if (cat === 'cgt') {
                queryBuilder = queryBuilder.in('tipo', ['sentenza_cgt_vip', 'scheda_manualistica']);
            }
        } else {
            // Per 'all' carichiamo l'intero dataset strutturato in blocchi da 90
            queryBuilder = queryBuilder.in('tipo', ['sentenza_ssuu', 'sentenza_ssuu_vip', 'sentenza_admin', 'sentenza_admin_vip', 'massimario_cassazione', 'sentenza_sez_semplici_vip', 'rivista_vip', 'sentenza_cgt_vip', 'sentenza_corte_cost_vip', 'sentenza_corte_cost', 'sentenza_cc_vip', 'scheda_manualistica', 'scheda_manualistica_v3']);
        }

        const { data, error } = await queryBuilder
            .order('titolo', { ascending: true })
            .range(searchState.vipOffset, searchState.vipOffset + limit - 1);

        if (error) throw error;

        if (!searchState.vipDocs) searchState.vipDocs = [];
        
        // Dedup su inserimento
        const seen = new Set(searchState.vipDocs.map(d => d.filename + d.titolo));
        const newDocs = (data || []).filter(d => {
            const key = d.filename + d.titolo;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        searchState.vipDocs.push(...newDocs);
        
        if (!data || data.length < limit) {
            searchState.vipHasMore = false;
        } else {
            searchState.vipHasMore = true;
            searchState.vipOffset += limit;
        }

        renderVIPSchede();
    } catch (err) {
        console.error('[VIP] Errore:', err);
        if (container && (!searchState.vipDocs || searchState.vipDocs.length === 0)) {
            container.innerHTML = '<p class="text-red-500 text-center py-8">Errore di caricamento.</p>';
        }
    }
}

function renderVIPSchede() {
    const container = document.getElementById('ga-vip-results');
    if (!container || !searchState.vipDocs) return;

    let docs = searchState.vipDocs;

    // Category filter
    if (searchState.vipCategory !== 'all') {
        const catMap = {
            'ssuu_civili': d => (d.tipo === 'sentenza_ssuu' || d.tipo === 'sentenza_ssuu_vip') && (d.materia === 'Diritto Civile' || d.materia === 'Giurisprudenza Civile'),
            'ssuu_penali': d => (d.tipo === 'sentenza_ssuu' || d.tipo === 'sentenza_ssuu_vip') && (d.materia === 'Diritto Penale' || d.materia === 'Giurisprudenza Penale'),
            'corte_cost': d => d.tipo === 'sentenza_corte_cost_vip' || d.tipo === 'sentenza_cc_vip',
            'sez_semplici': d => d.tipo === 'sentenza_sez_semplici_vip' || d.tipo === 'scheda_manualistica_v3',
            'massimari': d => d.tipo === 'massimario_cassazione',
            'riviste': d => d.is_caso_sistematico === true,
            'cds': d => (d.tipo === 'sentenza_admin' || d.tipo === 'sentenza_admin_vip') && d.filename?.startsWith('cds_'),
            'tar': d => (d.tipo === 'sentenza_admin' || d.tipo === 'sentenza_admin_vip') && d.filename?.startsWith('tar-'),
            'cgt': d => d.tipo === 'sentenza_cgt_vip' || d.tipo === 'scheda_manualistica',
        };
        if (catMap[searchState.vipCategory]) docs = docs.filter(catMap[searchState.vipCategory]);
    }

    // Text filter — titolo/filename + contenuto (FTS)
    let contentOnlyIds = new Set();
    if (searchState.vipFilter) {
        const q = searchState.vipFilter.toLowerCase();
        docs = docs.filter(d => {
            const titleMatch = d.titolo?.toLowerCase().includes(q) || d.filename?.toLowerCase().includes(q);
            const contentMatch = searchState.contentMatchIds?.has(d.id);
            if (contentMatch && !titleMatch) contentOnlyIds.add(d.id);
            return titleMatch || contentMatch;
        });
        // Ordina: match titolo prima, match solo-contenuto dopo
        docs.sort((a, b) => {
            const aContent = contentOnlyIds.has(a.id);
            const bContent = contentOnlyIds.has(b.id);
            if (aContent !== bContent) return aContent ? 1 : -1;
            return 0;
        });
    }

    const catLabel = (d) => {
        if (d.is_caso_sistematico) return { text: 'Casi di Rilievo', color: 'indigo' };
        if (d.tipo === 'sentenza_cgt_vip' || d.tipo === 'scheda_manualistica') return { text: 'Corti Tributarie', color: 'slate' };
        if (d.tipo === 'massimario_cassazione') return { text: 'Massimario', color: 'amber' };
        if ((d.tipo === 'sentenza_ssuu' || d.tipo === 'sentenza_ssuu_vip') && (d.materia === 'Diritto Penale' || d.materia === 'Giurisprudenza Penale')) return { text: 'SS.UU. Penali', color: 'red' };
        if (d.tipo === 'sentenza_ssuu' || d.tipo === 'sentenza_ssuu_vip') return { text: 'SS.UU. Civili', color: 'magis' };
        if (d.tipo === 'sentenza_corte_cost_vip' || d.tipo === 'sentenza_cc_vip') return { text: 'Corte Costituzionale', color: 'rose' };
        if (d.tipo === 'sentenza_sez_semplici_vip' || d.tipo === 'scheda_manualistica_v3') return { text: 'Cass. Sez. Semplici', color: 'purple' };
        if (d.filename?.startsWith('cds_')) return { text: 'CdS', color: 'emerald' };
        if (d.filename?.startsWith('tar-')) return { text: 'TAR', color: 'blue' };
        return { text: 'Altro', color: 'gray' };
    };

    let countExtra = '';
    if (searchState.vipFilter && searchState.contentSearching) {
        countExtra = ' · <span class="text-emerald-400"><span class="inline-block animate-pulse">🔍</span> Ricerca nel contenuto...</span>';
    } else if (searchState.vipFilter && contentOnlyIds.size > 0) {
        countExtra = ` · <span class="text-amber-400">${contentOnlyIds.size} trovate nel contenuto</span>`;
    }
    let html = `<div class="text-xs text-gray-500 mb-2">${docs.length} schede${searchState.vipFilter ? ` per "${escapeHtml(searchState.vipFilter)}"` : ''}${countExtra}</div>`;

    if (docs.length === 0) {
        html += '<div class="text-center py-12 text-gray-500"><p>Nessuna scheda trovata.</p></div>';
    } else {
        html += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">';
        docs.forEach(d => {
            const cat = catLabel(d);
            html += `
                <div class="p-4 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/70 hover:border-${cat.color}-500/50 transition cursor-pointer group relative overflow-hidden" onclick="window._gaVipOpen('${escapeHtml(d.filename.replace(/'/g, "\\'"))}', '${d.tipo}')">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-${cat.color}-900/50 text-${cat.color}-300 border border-${cat.color}-800/50">${cat.text}</span>
                        ${contentOnlyIds.has(d.id) ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-900/50 text-amber-300 border border-amber-800/50 flex items-center gap-0.5"><i data-lucide="search" class="w-2.5 h-2.5"></i>contenuto</span>' : ''}
                    </div>
                    <p class="text-sm font-medium text-gray-200 group-hover:text-white transition line-clamp-2 leading-snug">${escapeHtml(d.titolo || d.filename)}</p>
                </div>
            `;
        });
        html += '</div>';

        // Aggiungiamo il pulsante di caricamento se ci sono altre schede da mostrare
        if (searchState.vipHasMore && !searchState.vipFilter) {
            html += `
                <div class="mt-6 text-center">
                    <button id="ga-vip-loadmore-btn" onclick="window._gaVipLoadMore()" class="px-5 py-2.5 text-xs font-bold text-emerald-400 hover:text-white border border-gray-700 bg-gray-850 hover:bg-gray-800 rounded-xl hover:border-emerald-500/30 transition flex items-center justify-center mx-auto gap-2">
                        <i data-lucide="chevron-down" class="w-4 h-4"></i> Carica altre schede...
                    </button>
                </div>
            `;
        }
    }

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

let _contentSearchTimeout = null;

window._gaVipFilter = (val) => {
    searchState.vipFilter = val;
    clearTimeout(_contentSearchTimeout);

    if (!val || val.length < 3) {
        searchState.contentMatchIds = null;
        searchState.contentSearching = false;
        searchState.vipDocs = null;
        searchState.vipOffset = 0;
        searchState.vipHasMore = false;
        loadVIPSchede();
        return;
    }

    // Setta flag PRIMA del render così l'indicatore appare subito
    searchState.contentSearching = true;

    // Filtro immediato per titolo/filename (+ mostra indicatore ricerca)
    renderVIPSchede();

    // Ricerca nel contenuto debounced (600ms)
    _contentSearchTimeout = setTimeout(() => _searchVIPContent(val), 600);
};

async function _searchVIPContent(query) {
    if (!window.supabaseClient || !query || query.length < 3) return;
    // Se la query è cambiata nel frattempo, ignora
    if (searchState.vipFilter !== query) return;

    try {
        // FASE 1: plainto_tsquery — stemming italiano preciso (usando 'simple' coerentemente con la colonna del DB!)
        // "ricettazione" → trova ricettazione (coincidenza esatta delle parole)
        let { data, error } = await window.supabaseClient
            .from('rag_chunks')
            .select('document_id')
            .textSearch('fts', query, { type: 'plain', config: 'simple' })
            .limit(1000);

        if (error) throw error;
        if (searchState.vipFilter !== query) return;

        // FASE 2: Se plainto_tsquery non trova nulla, fallback a prefix matching con :* (usando 'simple')
        if (!data || data.length === 0) {
            const words = query.trim().split(/\s+/).filter(w => w.length >= 2);
            if (words.length > 0) {
                const tsQuery = words.map((w, i) => {
                    const cleaned = w.replace(/[^a-zA-ZàèéìòùÀÈÉÌÒÙ0-9]/g, '');
                    if (!cleaned) return null;
                    return i === words.length - 1 ? `${cleaned}:*` : cleaned;
                }).filter(Boolean).join(' & ');

                if (tsQuery) {
                    const fallback = await window.supabaseClient
                           .from('rag_chunks')
                           .select('document_id')
                           .textSearch('fts', tsQuery, { config: 'simple' })
                           .limit(1000);

                    if (searchState.vipFilter !== query) return;
                    if (!fallback.error && fallback.data) {
                        data = fallback.data;
                    }
                }
            }
        }

        const matchedDocIds = Array.from(new Set(data.map(d => d.document_id)));
        searchState.contentMatchIds = new Set(matchedDocIds);

        // Cerchiamo sempre i documenti che hanno fatto match dal database,
        // garantendo una ricerca globale su tutte le schede (e non solo su quelle precaricate in prima pagina!)
        // Eseguiamo anche il filtro sui soli tipi VIP validi per evitare che sentenze semplici non filtrate inquinino l'elenco.
        if (matchedDocIds.length > 0) {
            const { data: matchedDocs, error: docsError } = await window.supabaseClient
                .from('rag_documents')
                .select('id, titolo, tipo, materia, filename, is_caso_sistematico')
                .in('id', matchedDocIds)
                .in('tipo', ['sentenza_ssuu', 'sentenza_ssuu_vip', 'sentenza_admin', 'sentenza_admin_vip', 'massimario_cassazione', 'sentenza_sez_semplici_vip', 'rivista_vip', 'sentenza_cgt_vip', 'sentenza_corte_cost_vip', 'sentenza_corte_cost', 'sentenza_cc_vip', 'scheda_manualistica', 'scheda_manualistica_v3']);

            if (docsError) throw docsError;
            if (searchState.vipFilter !== query) return;

            // Dedup
            const seen = new Set();
            searchState.vipDocs = matchedDocs.filter(d => {
                const key = d.filename + d.titolo;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        } else {
            searchState.vipDocs = [];
        }

        searchState.contentSearching = false;
        renderVIPSchede();
    } catch (err) {
        console.error('[VIP] Errore ricerca contenuto:', err);
        searchState.contentSearching = false;
        searchState.contentMatchIds = null;
        renderVIPSchede();
    }
}

window._gaVipCategory = (cat) => {
    searchState.vipCategory = cat;
    searchState.vipDocs = null; // Forza il ricaricamento mirato per la nuova categoria!
    searchState.vipOffset = 0;   // Reset offset per nuova categoria!
    searchState.vipHasMore = false;
    // Re-render tabs to show active state + results
    const main = document.getElementById('main-content');
    if (main) {
        main.innerHTML = renderGiurisprudenza();
        if (window.lucide) lucide.createIcons();
    }
    loadVIPSchede();
};

window._gaVipLoadMore = async () => {
    const btn = document.getElementById('ga-vip-loadmore-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="inline-block w-4.5 h-4.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-2"></div> Caricamento...`;
    }
    await loadVIPSchede();
};

window._gaVipOpen = async (filename, tipo) => {
    if (!window.supabaseClient) return;
    try {
        const { data: docData, error: docError } = await window.supabaseClient
            .from('rag_documents')
            .select('id, titolo, materia')
            .eq('filename', filename)
            .limit(1)
            .maybeSingle();
        if (docError || !docData) throw docError || new Error('Not found');

        const { data: chunkData, error: chunkError } = await window.supabaseClient
            .from('rag_chunks')
            .select('content')
            .eq('document_id', docData.id)
            .order('chunk_index', { ascending: true });
        if (chunkError || !chunkData || chunkData.length === 0) throw chunkError || new Error('Chunks not found');

        const fullContent = chunkData.map(c => c.content).join('\n\n');
        let mdHtml = window.marked ? window.marked.parse(fullContent) : `<div class="whitespace-pre-wrap">${escapeHtml(fullContent)}</div>`;

        // Wrap legal references per Tooltip
        const regex = /\b(?:art|artt)\.?\s+\d+(?:\s+(?:bis|ter|quater|quinquies))?(?:\s+e\s+\d+)?(?:(?:,\s*)?commi?\s*\d+(?:\s+e\s+\d+)?)?(?:\s+della\s+)?\s+(?:c\.c\.|c\.p\.c\.|c\.p\.|c\.p\.p\.|Cost\.|T\.U\.I\.|TUSP|TUEL|d\.lgs\.\s*(?:n\.\s*)?\d+\/\d+|l\.\s*(?:n\.\s*)?\d+\/\d+|d\.P\.R\.\s*(?:n\.\s*)?\d+\/\d+)/gi;
        
        mdHtml = mdHtml.replace(regex, (match) => {
            return `<span class="norma-hover cursor-help text-magis-400 font-semibold border-b border-magis-400/50 hover:bg-magis-900/50 transition-colors rounded px-0.5" data-norma="${escapeHtml(match.trim())}">${match}</span>`;
        });
        showDetailModal({
            titolo: docData.titolo,
            filename: filename,
            testo_completo: fullContent,
            _isVip: true,
            _mdHtml: mdHtml,
            _materia: docData.materia
        });
    } catch (err) {
        console.error('[VIP] Errore apertura:', err);
    }
};
