/* ============================================================
   GLOSSARIO.JS — Vista Glossario Smart con dettagli istituti
   ============================================================ */

import { AppState } from '../state.js';
import { GLOSSARIO_ISTITUTI, DB_TRACCE, FALLBACK_GLOSSARIO } from '../../data.js';
import { escapeHtml } from '../utils.js';

export function renderGlossario() {
    var now = new Date();
    var srsDueHtml = '';
    var dueItems = [];

    if (AppState.srs) {
        for (const [ist, data] of Object.entries(AppState.srs)) {
            if (new Date(data.nextReviewDate) <= now) {
                dueItems.push(ist);
            }
        }
    }

    if (dueItems.length > 0) {
        srsDueHtml = `
            <div class="mb-6 p-4 rounded-xl border border-magis-500/30 bg-magis-500/10 shrink-0">
                <h3 class="text-sm font-bold text-magis-400 uppercase tracking-widest mb-3 flex items-center gap-2"><i data-lucide="brain" class="w-4 h-4"></i> Da Ripassare Oggi (${dueItems.length})</h3>
                <div class="flex flex-col gap-2">
                    ${dueItems.map(ist => `
                        <div class="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 hover:border-magis-500 cursor-pointer transition text-xs font-medium text-gray-300" onclick="app.showIstituto('${ist.replace(/'/g, "\\'")}', 'Generale')">${ist}</div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    var html = `<div class="fade-in flex flex-col h-[calc(100vh-100px)]">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 shrink-0 gap-4">
            <h1 class="text-3xl font-display font-bold text-white">Glossario Smart: Istituti</h1>
            <div class="relative w-full md:w-64">
                <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"></i>
                <input type="text" onkeyup="app.filterGlossario(this.value)" placeholder="Cerca istituto..." class="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:border-magis-500 focus:outline-none transition">
            </div>
        </div>
        
        <div class="flex-grow flex flex-col lg:flex-row gap-6 overflow-hidden">
            <!-- Colonna Sinistra: Griglia Istituti -->
            <div class="lg:w-1/3 flex flex-col gap-2 overflow-y-auto pr-2 pb-10 shrink-0 max-h-[40vh] lg:max-h-full custom-scrollbar">
                ${srsDueHtml}
    `;

    // 1. Aggiungiamo prima la barra speciale per gli ISTITUTI CHIAVE (Storici)
    let istitutiChiaveAll = [];
    Object.keys(FALLBACK_GLOSSARIO).forEach(k => {
        let materia = k === 'Civile' ? 'Diritto Civile' : k === 'Penale' ? 'Diritto Penale' : 'Diritto Amministrativo';
        FALLBACK_GLOSSARIO[k].forEach(ist => {
            istitutiChiaveAll.push({ nome: ist, materia: materia });
        });
    });
    // Ordiniamo alfabeticamente l'intera lista chiave
    istitutiChiaveAll.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));

    html += `<div class="glossario-section shrink-0 bg-magis-900/40 border border-magis-500/50 rounded-xl overflow-hidden mb-4" style="flex-shrink: 0;">
        <div class="px-4 py-3 bg-magis-900/60 flex justify-between items-center cursor-pointer hover:bg-magis-800 transition" onclick="app.toggleGlossarioSection(this)">
            <div class="flex items-center gap-2">
                <i data-lucide="star" class="w-4 h-4 text-magis-400"></i>
                <h3 class="text-sm font-bold text-magis-200 uppercase tracking-wider">Istituti Chiave <span class="ml-2 px-2 py-0.5 bg-magis-800 rounded-full text-[10px]">${istitutiChiaveAll.length}</span></h3>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-magis-300 icon-toggle transition-transform"></i>
        </div>
        <div class="glossario-list hidden flex flex-col gap-1 p-2">`;
    
    istitutiChiaveAll.forEach(item => {
        html += `
            <div class="glossario-item px-3 py-2.5 rounded-lg hover:bg-gray-800 hover:border-gray-700 cursor-pointer transition flex justify-between items-start group" data-text="${escapeHtml(item.nome.replace(/"/g, '&quot;'))}" onclick="app.showIstituto('${item.nome.replace(/'/g, "\\'")}', '${item.materia}')">
                <div class="flex flex-col gap-1 pr-3 flex-grow">
                    <span class="text-sm font-medium text-magis-100 group-hover:text-white break-words whitespace-normal leading-tight">${item.nome}</span>
                    <span class="text-[10px] text-gray-500 uppercase">${item.materia}</span>
                </div>
                <i data-lucide="chevron-right" class="w-4 h-4 text-gray-600 group-hover:text-magis-400 shrink-0 mt-0.5"></i>
            </div>
        `;
    });
    html += `</div></div>`;

    // 2. Renderizziamo normalmente tutte le altre materie
    Object.keys(GLOSSARIO_ISTITUTI).forEach(materia => {
        // Aggiunto flex-shrink inline per impedire che il layout flex schiacci gli accordion quando ce ne sono tanti
        html += `<div class="glossario-section shrink-0 bg-gray-900/30 border border-gray-800 rounded-xl overflow-hidden mb-2" style="flex-shrink: 0;">
            <div class="px-4 py-3 bg-gray-900 flex justify-between items-center cursor-pointer hover:bg-gray-800 transition" onclick="app.toggleGlossarioSection(this)">
                <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider">${materia} <span class="ml-2 px-2 py-0.5 bg-gray-800 rounded-full text-[10px]">${GLOSSARIO_ISTITUTI[materia].length}</span></h3>
                <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 icon-toggle transition-transform"></i>
            </div>
            <div class="glossario-list hidden flex flex-col gap-1 p-2">`;
        
        GLOSSARIO_ISTITUTI[materia].forEach(ist => {
            html += `
                <div class="glossario-item px-3 py-2.5 rounded-lg hover:bg-gray-800 hover:border-gray-700 cursor-pointer transition flex justify-between items-start group" data-text="${escapeHtml(ist.replace(/"/g, '&quot;'))}" onclick="app.showIstituto('${ist.replace(/'/g, "\\'")}', '${materia}')">
                    <span class="text-sm font-medium text-gray-300 group-hover:text-white break-words whitespace-normal leading-tight flex-grow pr-3">${ist}</span>
                    <i data-lucide="chevron-right" class="w-4 h-4 text-gray-600 group-hover:text-magis-400 shrink-0 mt-0.5"></i>
                </div>
            `;
        });
        html += `</div></div>`;
    });

            html += `<div id="vip-dossiers-container" class="mt-4 opacity-0 transition-opacity duration-500">
            </div>
            </div>
            <!-- Colonna Destra: Dettagli (Vuota di default) -->
            <div id="glossario-dettagli" class="lg:w-2/3 flex-grow glass-panel rounded-2xl border border-gray-800 p-6 lg:p-8 flex flex-col items-center justify-center text-center text-gray-500 min-h-[300px]">
                <div class="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
                    <i data-lucide="book-open" class="text-gray-400 w-8 h-8"></i>
                </div>
                <p>Seleziona un istituto dalla colonna a sinistra per aprire l'archivio connesso e la ricerca sentenze intelligenti.</p>
            </div>
        </div>
    </div>`;
    return html;
}

export async function showIstitutoDettagli(istituto, materia) {
    var detailContainer = document.getElementById('glossario-dettagli');
    detailContainer.classList.remove('items-center', 'justify-center', 'text-center');
    
    // Mostriamo uno skeleton loader mentre carichiamo
    detailContainer.innerHTML = `
        <div class="animate-pulse flex flex-col gap-4">
            <div class="h-8 bg-gray-800 rounded w-1/3"></div>
            <div class="h-4 bg-gray-800 rounded w-1/2"></div>
            <div class="h-64 bg-gray-800 rounded mt-4"></div>
        </div>
    `;

    // 1. Fetch Dati Reali da Supabase
    let saggioReal = null;
    
    if (window.supabaseClient) {
        // Usiamo ilike per essere sicuri che trovi il match anche con maiuscole/minuscole diverse
        const { data, error } = await window.supabaseClient
            .from('dottrina_sintetica')
            .select('*')
            .ilike('istituto', istituto)
            .eq('materia', materia)
            .maybeSingle();
        
        if (error) {
            console.error("❌ [Glossario] Errore Supabase:", error);
        } else if (data) {
            console.log("✅ [Glossario] Contenuto trovato!", data.istituto);
            saggioReal = data.contenuto_markdown;
        } else {
            console.warn("⚠️ [Glossario] Nessun contenuto trovato per questo istituto.");
        }
    } else {
        console.error("❌ [Glossario] Supabase Client non trovato!");
    }

    // 2. Trova tracce correlate
    var relTracce = DB_TRACCE.filter(t => t.materia === materia).slice(0, 3);
    var tracceHtml = relTracce.length > 0 
        ? relTracce.map(t => `
            <div class="p-3 border border-gray-700 bg-gray-800/30 rounded-lg mb-2">
                <div class="text-[10px] font-bold text-magis-500 mb-1 uppercase tracking-tighter">Anno ${t.anno} ${t.estratta ? '• Estratta' : ''}</div>
                <div class="text-sm text-gray-300 line-clamp-2">${escapeHtml(t.testo)}</div>
            </div>
        `).join('')
        : '<p class="text-xs text-gray-600 italic">Nessuna traccia storica trovata.</p>';

    // 3. Render Finale
    detailContainer.innerHTML = `
        <div class="fade-in h-full flex flex-col overflow-y-auto custom-scrollbar pr-2">
            <div class="flex flex-col sm:flex-row items-start justify-between border-b border-gray-800 pb-6 mb-6 gap-4 shrink-0">
                <div>
                    <span class="text-xs font-semibold text-magis-400 uppercase tracking-widest">${escapeHtml(materia)}</span>
                    <h2 class="text-2xl lg:text-3xl font-display font-bold text-white mt-1">${escapeHtml(istituto)}</h2>
                </div>
                <div class="flex gap-2 shrink-0">
                     <button onclick="app.setOraleMateria('${materia}'); app.navigate('orale-setup');" class="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition border border-gray-700 flex items-center gap-2">
                        <i data-lucide="brain-circuit" class="w-4 h-4 text-magis-400"></i> Ripassa
                    </button>
                    <button onclick="app.startSimulation(8, false, ${relTracce[0] ? relTracce[0].id : 1})" class="px-3 py-2 bg-magis-600 hover:bg-magis-500 text-white text-xs font-medium rounded-lg transition shadow-lg shadow-magis-600/30 flex items-center gap-2">
                        <i data-lucide="edit-3" class="w-4 h-4"></i> Scrivi
                    </button>
                </div>
            </div>
            
            <div class="flex flex-col lg:flex-row gap-6 lg:gap-8 flex-grow">
                <!-- Colonna Contenuto Lisia -->
                <div class="lg:w-2/3 flex flex-col">
                    <h3 class="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-2"><i data-lucide="book-open" class="w-4 h-4"></i> Compendio Dogmatico (Lisia AI)</h3>
                    
                    ${saggioReal ? `
                        <div class="prose-dottrina max-w-none bg-gray-900/40 p-6 lg:p-10 rounded-3xl border border-gray-800 shadow-2xl">
                            ${window.marked ? window.marked.parse(saggioReal) : saggioReal}
                        </div>
                    ` : `
                        <div class="flex flex-col items-center justify-center p-12 text-center bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
                            <div class="w-12 h-12 rounded-full bg-magis-500/10 flex items-center justify-center mb-4">
                                <i data-lucide="loader-2" class="w-6 h-6 text-magis-500 animate-spin"></i>
                            </div>
                            <h4 class="text-white font-medium mb-1">Contenuto in fase di generazione</h4>
                            <p class="text-xs text-gray-500">Lisia sta scrivendo il manuale per questo istituto. Torna tra qualche istante.</p>
                        </div>
                    `}
                </div>
                
                <!-- Colonna Laterale: Tracce e SRS -->
                <div class="lg:w-1/3 flex flex-col gap-8">
                    <div>
                        <h3 class="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-2"><i data-lucide="history" class="w-4 h-4"></i> Tracce Correlate</h3>
                        <div class="flex flex-col">
                            ${tracceHtml}
                        </div>
                    </div>

                    <!-- Modulo Spaced Repetition (SRS) -->
                    <div class="bg-magis-500/5 border border-magis-500/20 p-5 rounded-2xl">
                        <h3 class="text-xs font-bold text-magis-400 uppercase mb-3 flex items-center gap-2"><i data-lucide="brain" class="w-4 h-4"></i> Livello di Padronanza</h3>
                        <p class="text-[10px] text-gray-500 mb-4 leading-relaxed">Valuta la tua preparazione per programmare il ripasso intelligente.</p>
                        <div class="flex flex-col gap-2">
                            <button onclick="app.answerSrs('${istituto.replace(/'/g, "\\'")}', 'wrong')" class="w-full py-2 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 text-red-400 rounded-lg text-[10px] font-bold transition">DA RIVEDERE (Oggi)</button>
                            <button onclick="app.answerSrs('${istituto.replace(/'/g, "\\'")}', 'hard')" class="w-full py-2 bg-yellow-900/20 hover:bg-yellow-900/40 border border-yellow-800/50 text-yellow-400 rounded-lg text-[10px] font-bold transition">DIFFICILE (1 Giorno)</button>
                            <button onclick="app.answerSrs('${istituto.replace(/'/g, "\\'")}', 'easy')" class="w-full py-2 bg-green-900/20 hover:bg-green-900/40 border border-green-800/50 text-green-400 rounded-lg text-[10px] font-bold transition">FACILE (4+ Giorni)</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

export async function initVIPDossiers() {
    console.log("⏳ [Glossario] initVIPDossiers() chiamata!");
    
    // Wait for DOM to settle after route transition
    await new Promise(r => setTimeout(r, 200));
    
    const container = document.getElementById('vip-dossiers-container');
    console.log("📦 [Glossario] Container trovato:", container !== null);
    if (!container) return;
    
    if (!window.supabaseClient) {
        console.warn("⚠️ [Glossario] Supabase Client non trovato!");
        return;
    }

    try {
        console.log("🌐 [Glossario] Fetching documenti VIP da Supabase...");
        
        // Fetch paginato per tutti i tipi di documenti strutturati
        async function fetchAllDocs(tipoFilter) {
            let allDocs = [];
            let offset = 0;
            const limit = 1000;
            while (true) {
                const { data, error } = await window.supabaseClient
                    .from('rag_documents')
                    .select('titolo, tipo, materia, filename')
                    .in('tipo', tipoFilter)
                    .order('titolo', { ascending: true })
                    .range(offset, offset + limit - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allDocs.push(...data);
                offset += limit;
                if (data.length < limit) break;
            }
            return allDocs;
        }

        // Fetch documenti con parent document (sentenza_ssuu, sentenza_ssuu_vip, sentenza_admin, massimario_cassazione)
        const allDocs = await fetchAllDocs(['sentenza_ssuu', 'sentenza_ssuu_vip', 'sentenza_admin', 'massimario_cassazione']);
        
        console.log(`✅ [Glossario] Docs: ${allDocs.length}`);

        // Bail out if we navigated away during fetch
        if (!document.getElementById('vip-dossiers-container')) return;

        // Deduplicazione documenti
        const uniqueDocs = [];
        const seen = new Set();
        allDocs.forEach(d => {
            const key = d.filename + d.titolo;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueDocs.push(d);
            }
        });

        // Categorie documenti (normalizza le due convenzioni di naming per materia)
        let ssuuCivile = uniqueDocs.filter(d => 
            (d.tipo === 'sentenza_ssuu' || d.tipo === 'sentenza_ssuu_vip') && 
            (d.materia === 'Diritto Civile' || d.materia === 'Giurisprudenza Civile')
        );
        let ssuuPenale = uniqueDocs.filter(d => 
            (d.tipo === 'sentenza_ssuu' || d.tipo === 'sentenza_ssuu_vip') && 
            (d.materia === 'Diritto Penale' || d.materia === 'Giurisprudenza Penale')
        );
        let massimari = uniqueDocs.filter(d => d.tipo === 'massimario_cassazione');
        let adminCds = uniqueDocs.filter(d => d.tipo === 'sentenza_admin' && d.filename && d.filename.startsWith('cds_'));
        let adminTar = uniqueDocs.filter(d => d.tipo === 'sentenza_admin' && d.filename && d.filename.startsWith('tar-'));

        let html = '';
        
        const buildSection = (title, items, icon, collapsed = true) => {
            if (items.length === 0) return '';
            let sectionHtml = `
                <div class="glossario-section shrink-0 bg-magis-900/20 border border-magis-500/30 rounded-xl overflow-hidden mb-2" style="flex-shrink: 0;">
                    <div class="px-4 py-3 bg-magis-900/40 flex justify-between items-center cursor-pointer hover:bg-magis-800 transition" onclick="app.toggleGlossarioSection(this)">
                        <div class="flex items-center gap-2">
                            <i data-lucide="${icon}" class="w-4 h-4 text-magis-400"></i>
                            <h3 class="text-sm font-bold text-magis-200 uppercase tracking-wider">${title} <span class="ml-2 px-2 py-0.5 bg-magis-800 rounded-full text-[10px]">${items.length}</span></h3>
                        </div>
                        <i data-lucide="chevron-right" class="w-4 h-4 text-magis-300 icon-toggle transition-transform"></i>
                    </div>
                    <div class="glossario-list hidden flex flex-col gap-1 p-2">
            `;
            items.forEach(item => {
                const onclickFn = item._isChunk
                    ? `app.showVIPChunk('${escapeHtml(item.filename)}')`
                    : `app.showVIPDossier('${escapeHtml(item.filename.replace(/'/g, "\\\\'"))}', '${item.tipo}')`;
                sectionHtml += `
                    <div class="glossario-item px-3 py-2.5 rounded-lg hover:bg-gray-800 hover:border-gray-700 cursor-pointer transition flex justify-between items-start group" data-text="${escapeHtml(item.titolo.replace(/"/g, '&quot;'))}" onclick="${onclickFn}">
                        <div class="flex flex-col gap-1 pr-3 flex-grow">
                            <span class="text-sm font-medium text-magis-100 group-hover:text-white break-words whitespace-normal leading-tight">${escapeHtml(item.titolo)}</span>
                        </div>
                        <i data-lucide="chevron-right" class="w-4 h-4 text-gray-600 group-hover:text-magis-400 shrink-0 mt-0.5"></i>
                    </div>
                `;
            });
            sectionHtml += `</div></div>`;
            return sectionHtml;
        };

        html += buildSection('⚖️ SS.UU. Civili', ssuuCivile, 'scale');
        html += buildSection('🔨 SS.UU. Penali', ssuuPenale, 'gavel');
        html += buildSection('📖 Massimari della Cassazione', massimari, 'book-marked');
        html += buildSection('🏛️ Sentenze CdS', adminCds, 'landmark');
        html += buildSection('📄 Sentenze TAR Lazio', adminTar, 'file-text');

        container.innerHTML = html;
        lucide.createIcons();
        
        // Smooth fade-in after content is ready
        requestAnimationFrame(() => {
            container.classList.remove('opacity-0');
            container.classList.add('opacity-100');
        });
        
        console.log("✨ [Glossario] Contenitore VIP aggiornato con successo.");
    } catch (err) {
        console.error("❌ Errore caricamento VIP Dossiers:", err);
        if (container) {
            container.innerHTML = '<p class="text-xs text-red-500 p-4">Errore di caricamento</p>';
            container.classList.remove('opacity-0');
        }
    }
}

export async function showVIPDossierDettagli(filename, tipo) {
    var detailContainer = document.getElementById('glossario-dettagli');
    detailContainer.classList.remove('items-center', 'justify-center', 'text-center');
    
    // Mostriamo uno skeleton loader mentre carichiamo
    detailContainer.innerHTML = `
        <div class="animate-pulse flex flex-col gap-4 w-full">
            <div class="h-8 bg-gray-800 rounded w-1/3"></div>
            <div class="h-4 bg-gray-800 rounded w-1/2"></div>
            <div class="h-64 bg-gray-800 rounded mt-4"></div>
        </div>
    `;

    if (!window.supabaseClient) {
        detailContainer.innerHTML = `<p class="text-red-500">Supabase Client non trovato!</p>`;
        return;
    }

    try {
        // Fetch the document ID first (limit 1 to avoid PGRST116 if duplicates exist)
        const { data: docData, error: docError } = await window.supabaseClient
            .from('rag_documents')
            .select('id, titolo, materia')
            .eq('filename', filename)
            .limit(1)
            .maybeSingle();

        if (docError || !docData) throw docError || new Error("Document not found");

        // Fetch the chunk content
        const { data: chunkData, error: chunkError } = await window.supabaseClient
            .from('rag_chunks')
            .select('content')
            .eq('document_id', docData.id)
            .order('chunk_index', { ascending: true });

        if (chunkError || !chunkData || chunkData.length === 0) throw chunkError || new Error("Chunks not found");

        // Combine chunks
        const fullContent = chunkData.map(c => c.content).join('\\n\\n');

        let displayMateria = docData.materia ? docData.materia.toUpperCase() : "GIURISPRUDENZA VIP";

        detailContainer.innerHTML = `
            <div class="fade-in h-full flex flex-col overflow-y-auto custom-scrollbar w-full">
                <div class="flex flex-col sm:flex-row items-start justify-between border-b border-gray-800 pb-6 mb-6 gap-4 shrink-0">
                    <div>
                        <span class="text-xs font-semibold text-magis-400 uppercase tracking-widest">${displayMateria}</span>
                        <h2 class="text-2xl lg:text-3xl font-display font-bold text-white mt-1">${escapeHtml(docData.titolo)}</h2>
                    </div>
                </div>
                
                <div class="w-full flex flex-col">
                    <h3 class="text-xs font-bold text-magis-500 uppercase mb-4 flex items-center gap-2"><i data-lucide="award" class="w-4 h-4"></i> Scheda VIP (Giurisprudenza)</h3>
                    
                    <div class="prose-dottrina max-w-none bg-gray-900/40 p-6 lg:p-10 rounded-3xl border border-magis-500/20 shadow-2xl">
                        ${window.marked ? window.marked.parse(fullContent) : fullContent}
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("❌ Errore fetch VIP:", err);
        detailContainer.innerHTML = `
            <div class="text-center">
                <i data-lucide="alert-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4"></i>
                <p class="text-gray-400">Impossibile caricare questa scheda. Riprova più tardi.</p>
            </div>
        `;
        lucide.createIcons();
    }
}

export async function showVIPChunkDettagli(chunkId) {
    var detailContainer = document.getElementById('glossario-dettagli');
    detailContainer.classList.remove('items-center', 'justify-center', 'text-center');
    
    detailContainer.innerHTML = `
        <div class="animate-pulse flex flex-col gap-4 w-full">
            <div class="h-8 bg-gray-800 rounded w-1/3"></div>
            <div class="h-4 bg-gray-800 rounded w-1/2"></div>
            <div class="h-64 bg-gray-800 rounded mt-4"></div>
        </div>
    `;

    if (!window.supabaseClient) {
        detailContainer.innerHTML = `<p class="text-red-500">Supabase Client non trovato!</p>`;
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('rag_chunks')
            .select('content, tipo, materia')
            .eq('id', chunkId)
            .maybeSingle();

        if (error || !data) throw error || new Error("Chunk not found");

        // Estrai titolo dai metadati
        let title = 'Scheda Dottrinale';
        const titleMatch = data.content.match(/Istituto Principale:\s*\*{0,2}(.+?)\*{0,2}\s*$/m);
        if (titleMatch) title = titleMatch[1].trim();
        else {
            const h1Match = data.content.match(/^#\s+(.+)$/m);
            if (h1Match) title = h1Match[1].trim();
        }

        detailContainer.innerHTML = `
            <div class="fade-in h-full flex flex-col overflow-y-auto custom-scrollbar w-full">
                <div class="flex flex-col sm:flex-row items-start justify-between border-b border-gray-800 pb-6 mb-6 gap-4 shrink-0">
                    <div>
                        <span class="text-xs font-semibold text-magis-400 uppercase tracking-widest">📚 RIVISTA VIP / DOTTRINA</span>
                        <h2 class="text-2xl lg:text-3xl font-display font-bold text-white mt-1">${escapeHtml(title)}</h2>
                    </div>
                </div>
                
                <div class="w-full flex flex-col">
                    <h3 class="text-xs font-bold text-magis-500 uppercase mb-4 flex items-center gap-2"><i data-lucide="book-open" class="w-4 h-4"></i> Scheda Dottrinale (Rivista VIP)</h3>
                    
                    <div class="prose-dottrina max-w-none bg-gray-900/40 p-6 lg:p-10 rounded-3xl border border-magis-500/20 shadow-2xl">
                        ${window.marked ? window.marked.parse(data.content) : data.content}
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("❌ Errore fetch chunk teoria:", err);
        detailContainer.innerHTML = `
            <div class="text-center">
                <i data-lucide="alert-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4"></i>
                <p class="text-gray-400">Impossibile caricare questa scheda. Riprova più tardi.</p>
            </div>
        `;
        lucide.createIcons();
    }
}
