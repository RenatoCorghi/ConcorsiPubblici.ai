/* ============================================================
   SIMULATION.JS (Controller) — Logica business simulazione scritta
   ============================================================ */
import { AppState, saveDraft, clearDraft, saveHistoryState } from '../state.js';
import { DB_TRACCE } from '../../data.js';
import { APP_CONFIG } from '../config.js';
import { apiService } from '../api.js';
import { showToast } from '../utils.js';
import { navigateToRoute, renderView } from '../router.js';
import { updateResultTabContent } from '../views/result.js';
import { startTimerLoop, stopTimerLoop, saveTimerState } from '../timer.js';
import { Gamification } from '../gamification.js';
import { Metering } from '../metering.js';

// _showTrialModal removed in favor of dynamic free tier limits


export const SimulationController = {

    // Flag per prevenire doppio submit
    _isSubmitting: false,

    /**
     * Apre il briefing pre-svolgimento per una traccia.
     * Chiamato dal pulsante Play nelle card tracce.
     */
    openBriefing: async function(tracciaId) {
        // --- GATE 1: Ospiti devono registrarsi ---
        if (!Metering.requireRegistration('Briefing Pre-Tema')) return;

        // Usa == invece di === perché tracciaId può arrivare come stringa dal DOM ('1') o intero (1)
        const traccia = DB_TRACCE.find(t => t.id == tracciaId) || (AppState.aiTraces || []).find(t => t.id == tracciaId);
        if (!traccia) {
            showToast("Traccia non trovata.", "error");
            return;
        }

        // Eliminiamo il trial pre-confezionato: andiamo diretti al briefing
        // Il troncamento dei dati per il Free Tier avviene nella view del briefing.

        // --- GATE 2: Limite settimanale Debrief ---
        if (!Metering.canUseWeekly('briefing', '_global')) {
            Metering.showWeeklyPaywall('briefing', '_global');
            return;
        }

        AppState.currentSimulationTask = traccia;
        AppState.currentBriefing = { loading: true };
        navigateToRoute('briefing');

        // Genera il briefing AI in background
        try {
            const result = await apiService.generateBriefing(
                traccia.testo,
                traccia.materia,
                traccia
            );
            if (result.success) {
                AppState.currentBriefing = result;
                // Consuma il credito settimanale solo se il briefing è stato generato con successo
                Metering.consumeWeekly('briefing', '_global');
            } else {
                AppState.currentBriefing = { error: result.error || 'Errore sconosciuto' };
            }
        } catch (e) {
            AppState.currentBriefing = { error: e.message || 'Errore di rete' };
        }
        
        // Re-render per mostrare il briefing caricato
        if (AppState.currentRoute === 'briefing') {
            renderView();
        }
    },

    /**
     * Avvia la simulazione dalla schermata di briefing.
     * La traccia è già in AppState.currentSimulationTask.
     */
    startSimulationFromBriefing: function(durationHoursOrMinutes, isTestMinutes) {
        const traccia = AppState.currentSimulationTask;
        if (!traccia) return;
        var totalSeconds = isTestMinutes ? (durationHoursOrMinutes || 30) * 60 : (durationHoursOrMinutes || 8) * 3600;
        AppState.timer = {
            active: true,
            duration: totalSeconds,
            remaining: totalSeconds,
            lastTick: Date.now(),
            halfAlertRaised: false,
            thirtyMinAlertRaised: false
        };
        clearDraft();
        saveTimerState();
        startTimerLoop();
        navigateToRoute('simulation');
    },

    /**
     * Rigenera il briefing se fallito.
     */
    retryBriefing: function() {
        const traccia = AppState.currentSimulationTask;
        if (traccia) {
            SimulationController.openBriefing(traccia.id);
        }
    },

    startSimulation: function(durationHours, isTestMinutes, tracciaId) {
        if (tracciaId) {
            AppState.currentSimulationTask = DB_TRACCE.find(function(t) { return t.id === tracciaId; }) || DB_TRACCE[0];
        } else {
            AppState.currentSimulationTask = DB_TRACCE[0];
        }
        var totalSeconds = isTestMinutes ? durationHours * 60 : durationHours * 3600;
        AppState.timer = {
            active: true,
            duration: totalSeconds,
            remaining: totalSeconds,
            lastTick: Date.now(),
            halfAlertRaised: false,
            thirtyMinAlertRaised: false
        };
        clearDraft();
        saveTimerState();
        startTimerLoop();
        navigateToRoute('simulation');
    },

    autoSubmit: function() {
        // Previeni doppio submit
        if (SimulationController._isSubmitting) return;
        SimulationController._isSubmitting = true;

        var editor = document.getElementById('exam-editor');
        var userText = editor ? editor.value : '';
        if(editor) editor.disabled = true;
        
        var loader = document.getElementById('llm-loader-modal');
        var loaderText = document.getElementById('llm-loader-text');
        var loaderBar = document.getElementById('llm-loader-bar');
        
        if(loader) loader.classList.remove('hidden');
        if(loaderBar) loaderBar.style.width = '0%';
        
        stopTimerLoop();
        AppState.timer.active = false;
        saveTimerState();

        var steps = [
            { text: "Lettura dell'elaborato...", progress: "20%", delay: 0 },
            { text: "Verifica correttezza giuridica...", progress: "45%", delay: 1500 },
            { text: "Ricerca sentenze pertinenti...", progress: "70%", delay: 3000 },
            { text: "Estrazione lacune e valutazione...", progress: "90%", delay: 4500 },
            { text: "Generazione risultato...", progress: "100%", delay: 6000 }
        ];

        steps.forEach(function(step) {
            setTimeout(function() {
                if(loaderText) loaderText.innerText = step.text;
                if(loaderBar) loaderBar.style.width = step.progress;
            }, step.delay);
        });

        setTimeout(async function() {
            if(loader) loader.classList.add('hidden');
            
            var subject = AppState.currentSimulationTask ? AppState.currentSimulationTask.materia : 'Generale';
            var apiKey = "proxy-protected";
            var baseVoto = 10;
            var matchedKeys = [];
            var schemaPunti = [];
            var confrontoPunti = [];
            var metrix = { correttezza: 60, struttura: 60, terminologia: 60, pertinenza: 60 };
            var sentenzeCitate = [];
            var giudizio_idoneita = 'NON IDONEO';
            var feedback_centratura = '';
            var feedback_inquadramento = '';
            var feedback_gerarchia = '';
            var matita_blu = [];
            var consiglio_presidente = '';
            
            if (apiKey && userText.trim().length > APP_CONFIG.MIN_WORDS_FOR_AI) {
                // Paywall gate: controlla crediti AI
                if (!Metering.canUse('aiCalls')) {
                    Metering.showPaywall('aiCalls');
                    if(loader) loader.classList.add('hidden');
                    return;
                }
                if(loaderText) { 
                    loaderText.innerText = 'Consultazione OpenAI in corso...'; 
                    loader.classList.remove('hidden'); 
                    loaderBar.style.width = '95%'; 
                }
                
                var traceText = AppState.currentSimulationTask ? AppState.currentSimulationTask.testo : '';
                var currentTraceObj = AppState.currentSimulationTask;
                var result = await apiService.evaluateEssay(apiKey, userText, subject, traceText, currentTraceObj);
                
                if (result.success) {
                    // Consuma un credito AI solo se la correzione ha avuto successo
                    Metering.consume('aiCalls');
                }
                
                baseVoto = result.voto;
                giudizio_idoneita = result.giudizio_idoneita || (baseVoto >= 12 ? 'IDONEO' : 'NON IDONEO');
                feedback_centratura = result.feedback_centratura || '';
                feedback_inquadramento = result.feedback_inquadramento || '';
                feedback_gerarchia = result.feedback_gerarchia || '';
                matita_blu = result.matita_blu || [];
                consiglio_presidente = result.consiglio_presidente || '';
                matchedKeys = result.keywords || [];
                schemaPunti = result.schema_ideale || [];
                confrontoPunti = result.confronto || [];
                metrix = result.metriche || metrix;
                sentenzeCitate = result.rag_sources || [];
                
                if(loader) loader.classList.add('hidden');
            } else {
                var currentTracciaText = AppState.currentSimulationTask ? AppState.currentSimulationTask.testo : '';
                var wordCount = userText.trim().split(/\s+/).filter(function(x) { return x.length > 0; }).length;
                
                if (wordCount < 50) {
                    baseVoto = Math.floor(Math.random() * 3) + 6;
                    feedback_centratura = "Trattazione inesistente o troppo sintetica (" + wordCount + " parole).";
                    feedback_inquadramento = "Inquadramento completamente assente.";
                    feedback_gerarchia = "Impossibile valutare la gerarchia argomentativa su un testo così breve.";
                    matita_blu = ["Assenza totale di analisi dogmatica.", "Elaborato incompatibile con la funzione giudiziaria."];
                    metrix = { correttezza: 40, struttura: 30, terminologia: 40, pertinenza: 50 };
                } else if (wordCount < 200) {
                    baseVoto = Math.floor(Math.random() * 3) + 10;
                    feedback_centratura = "Trattazione superficiale (" + wordCount + " parole). Gli argomenti sono stati solo sfiorati.";
                    feedback_inquadramento = "Inquadramento superficiale delle fonti.";
                    feedback_gerarchia = "La scaletta logica è appena abbozzata.";
                    metrix = { correttezza: 65, struttura: 55, terminologia: 60, pertinenza: 70 };
                } else {
                    baseVoto = 13 + Math.floor(Math.random() * 3);
                    feedback_centratura = "Buona ampiezza argomentativa (" + wordCount + " parole). La struttura regge l'impalcatura teorica.";
                    feedback_inquadramento = "L'istituto è stato inquadrato correttamente nel sistema delle fonti.";
                    feedback_gerarchia = "La scaletta logica segue i principi generali, sebbene alcune conclusioni siano affrettate.";
                    metrix = { correttezza: 85, struttura: 80, terminologia: 80, pertinenza: 90 };
                }
                
                giudizio_idoneita = baseVoto >= 12 ? 'IDONEO' : 'NON IDONEO';
                consiglio_presidente = "Si raccomanda uno studio più approfondito delle sentenze a Sezioni Unite e una maggiore attenzione alla gerarchia argomentativa.";
                
                schemaPunti = [
                    { titolo: "1. Inquadramento dogmatico", desc: "Definizione dell'istituto e fondamento normativo." },
                    { titolo: "2. Sviluppo e contrasto giurisprudenziale", desc: "Esposizione delle diverse tesi in campo e della decisione finale delle SS.UU." },
                    { titolo: "3. Soluzione del caso", desc: "Sussunzione della fattispecie astratta al caso concreto." }
                ];
                confrontoPunti = [
                    { 
                        errore_candidato: "Hai affrontato il tema in modo troppo discorsivo nella prima parte.", 
                        correzione_ideale: "Occorreva puntare subito sugli artt. pertinenti per dare base tecnica."
                    }
                ];

                var expectedKeywords = [];
                if (subject === 'Civile') expectedKeywords = ['contratto', 'danno', 'cassazione', 'inadempimento', 'tutela', 'codice', 'nullità', 'buona fede', 'sezioni unite'];
                else if (subject === 'Penale') expectedKeywords = ['dolo', 'colpa', 'reato', 'corte', 'bene giuridico', 'condotta', 'nesso causale', 'cassazione', 'legittimità', 'tipicità'];
                else expectedKeywords = ['provvedimento', 'interesse legittimo', 'pubblica amministrazione', 'legge', 'giudice', 'annullamento', 'potere', 'discrezionalità', 'consiglio di stato'];
                
                var traceWords = currentTracciaText.toLowerCase().replace(/[^\w\sàèéìòù]/g, '').split(' ').filter(function(w){ return w.length > 5; });
                expectedKeywords = expectedKeywords.concat(traceWords);
                
                var lowerUserText = userText.toLowerCase();
                expectedKeywords.forEach(function(kw) {
                    if (lowerUserText.includes(kw) && !matchedKeys.includes(kw)) {
                        matchedKeys.push(kw);
                    }
                });
                
                if (wordCount >= 50) {
                    if (matchedKeys.length >= 8) {
                        baseVoto += 1;
                        metrix.terminologia += 10;
                    } else {
                        metrix.terminologia -= 10;
                    }
                }
            }
            
            if (baseVoto > APP_CONFIG.VOTO_MAX) baseVoto = APP_CONFIG.VOTO_MAX;
            if (baseVoto < APP_CONFIG.VOTO_MIN) baseVoto = APP_CONFIG.VOTO_MIN;
            
            var newRes = {
                id: 'res-' + Date.now(),
                date: new Date().toISOString(),
                voto: baseVoto,
                materia: subject,
                text: userText || "Nessun testo inserito dal candidato.",
                giudizio_idoneita: giudizio_idoneita,
                feedback_centratura: feedback_centratura,
                feedback_inquadramento: feedback_inquadramento,
                feedback_gerarchia: feedback_gerarchia,
                matita_blu: matita_blu,
                consiglio_presidente: consiglio_presidente,
                keywords: matchedKeys,
                schema_ideale: schemaPunti,
                confronto: confrontoPunti,
                metriche: metrix,
                rag_sources: sentenzeCitate
            };
            AppState.history.push(newRes);
            saveHistoryState();
            
            if (window.cloud && cloud.user) {
                cloud.pushResult(newRes);
            }
            
            clearDraft();
            
            AppState.currentResult = newRes;
            AppState.resultTab = 'correzione';
            navigateToRoute('result');
            showToast("Simulazione consegnata con successo!", "success");

            // --- Gamification ---
            // Conta solo le prove "reali" (quelle con id che inizia per 'res-')
            const realSimulations = AppState.history.filter(h => h.id && h.id.startsWith('res-')).length;
            Gamification.addXP(500, "Simulazione Scritta");
            if (realSimulations === 1) {
                Gamification.checkBadge('pioniere');
            }
            if (baseVoto >= 16) {
                Gamification.checkBadge('secchione');
            }

            // Reset del flag anti-doppio-submit
            SimulationController._isSubmitting = false;
        }, 7500);
    },

    openWithdrawModal: function() {
        document.getElementById('withdraw-modal').classList.remove('hidden');
    },

    closeWithdrawModal: function() {
        document.getElementById('withdraw-modal').classList.add('hidden');
    },

    confirmWithdraw: function() {
        stopTimerLoop();
        AppState.timer = { active: false, duration: 0, remaining: 0, lastTick: 0 };
        saveTimerState();
        clearDraft();
        SimulationController.closeWithdrawModal();
        navigateToRoute('home');
    },

    toggleTimerPause: function() {
        if (!AppState.timer.active) return;
        AppState.timer.paused = !AppState.timer.paused;
        AppState.timer.lastTick = Date.now();
        saveTimerState();
        renderView();
    },

    setResultTab: function(tab) {
        AppState.resultTab = tab;
        updateResultTabContent();
    },

    viewResult: function(resId) {
        AppState.currentResult = AppState.history.find(function(h) { return h.id === resId; });
        AppState.resultTab = 'correzione';
        navigateToRoute('result');
    },

    exportPDF: function() {
        // Paywall gate: export PDF
        if (!Metering.canUse('pdfExports')) return Metering.showPaywall('pdfExports');
        
        if (typeof html2pdf === 'undefined') {
            showToast("Libreria PDF non caricata. Ricarica la pagina.", "error");
            return;
        }
        
        var res = AppState.currentResult || (AppState.history.length > 0 ? AppState.history[AppState.history.length-1] : null);
        if (!res) {
            showToast("Nessun risultato da esportare.", "error");
            return;
        }

        Metering.consume('pdfExports');
        showToast("Generazione PDF in corso...", "info");

        // Build a clean, print-friendly HTML document
        var metriche = res.metriche || { correttezza: 60, struttura: 60, terminologia: 60, pertinenza: 60 };
        
        var matitaBluHtml = '';
        if (res.matita_blu && res.matita_blu.length > 0) {
            matitaBluHtml = `
                <div style="margin-top: 20px; padding: 16px; border-left: 4px solid #dc2626; background: #fef2f2; border-radius: 8px;">
                    <h3 style="color: #dc2626; font-size: 14px; font-weight: bold; margin: 0 0 12px 0;">✏️ La Matita Blu (Errori Dirimenti)</h3>
                    <ul style="margin: 0; padding-left: 20px; color: #991b1b; font-size: 12px; line-height: 1.6;">
                        ${res.matita_blu.map(function(l) { return '<li style="margin-bottom: 8px;">' + l.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</li>'; }).join('')}
                    </ul>
                </div>`;
        }

        var schemaHtml = '';
        if (res.schema_ideale && res.schema_ideale.length > 0) {
            schemaHtml = `
                <div style="margin-top: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
                    <h3 style="color: #0369a1; font-size: 14px; font-weight: bold; margin: 0 0 12px 0;">📋 Schema Ideale di Svolgimento</h3>
                    ${res.schema_ideale.map(function(s) { 
                        return '<div style="margin-bottom: 12px;"><strong style="color: #1e3a5f; font-size: 13px;">' + (s.titolo || '').replace(/</g, '&lt;') + '</strong><p style="color: #475569; font-size: 12px; margin: 4px 0 0 0; line-height: 1.5;">' + (s.desc || '').replace(/</g, '&lt;') + '</p></div>'; 
                    }).join('')}
                </div>`;
        }

        var confrontoHtml = '';
        if (res.confronto && res.confronto.length > 0) {
            confrontoHtml = `
                <div style="margin-top: 24px; padding: 16px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
                    <h3 style="color: #92400e; font-size: 14px; font-weight: bold; margin: 0 0 12px 0;">🔄 Confronto: Errori e Correzioni</h3>
                    ${res.confronto.map(function(c) {
                        return '<div style="margin-bottom: 16px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">' +
                            '<p style="color: #dc2626; font-size: 12px; margin: 0 0 6px 0;"><strong>❌ Errore:</strong> ' + (c.errore_candidato || '').replace(/</g, '&lt;') + '</p>' +
                            '<p style="color: #059669; font-size: 12px; margin: 0;"><strong>✅ Correzione:</strong> ' + (c.correzione_ideale || '').replace(/</g, '&lt;') + '</p></div>';
                    }).join('')}
                </div>`;
        }

        var pdfContent = `
            <div style="font-family: 'Georgia', 'Times New Roman', serif; color: #1a1a1a; padding: 24px; max-width: 700px; margin: 0 auto; background: white;">
                <!-- Header -->
                <div style="text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 24px;">
                    <h1 style="font-size: 22px; color: #1e1b4b; margin: 0 0 4px 0;">ConcorsiPubblici.ai</h1>
                    <p style="font-size: 12px; color: #6b7280; margin: 0;">Verbale di Correzione — ${res.materia || 'Generale'}</p>
                    <p style="font-size: 11px; color: #9ca3af; margin: 4px 0 0 0;">Data: ${new Date(res.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>

                <!-- Voto -->
                <div style="text-align: center; padding: 20px; margin-bottom: 24px; background: ${res.voto >= 12 ? '#f0fdf4' : '#fef2f2'}; border: 2px solid ${res.voto >= 12 ? '#86efac' : '#fca5a5'}; border-radius: 12px;">
                    <div style="font-size: 48px; font-weight: bold; color: ${res.voto >= 15 ? '#059669' : res.voto >= 12 ? '#d97706' : '#dc2626'};">${res.voto}/20</div>
                    <div style="font-size: 14px; font-weight: bold; color: ${res.voto >= 12 ? '#166534' : '#991b1b'}; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">${res.giudizio_idoneita || (res.voto >= 12 ? 'IDONEO' : 'NON IDONEO')}</div>
                </div>

                <!-- Metriche -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px;">
                    <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="font-size: 11px; color: #64748b;">Correttezza Giuridica</span>
                        <div style="font-size: 16px; font-weight: bold; color: #1e293b;">${metriche.correttezza}%</div>
                    </div>
                    <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="font-size: 11px; color: #64748b;">Struttura Sistematica</span>
                        <div style="font-size: 16px; font-weight: bold; color: #1e293b;">${metriche.struttura}%</div>
                    </div>
                    <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="font-size: 11px; color: #64748b;">Terminologia</span>
                        <div style="font-size: 16px; font-weight: bold; color: #1e293b;">${metriche.terminologia}%</div>
                    </div>
                    <div style="padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="font-size: 11px; color: #64748b;">Pertinenza</span>
                        <div style="font-size: 16px; font-weight: bold; color: #1e293b;">${metriche.pertinenza}%</div>
                    </div>
                </div>

                ${matitaBluHtml}

                <!-- Giudizi -->
                <div style="margin-top: 24px;">
                    <div style="padding: 16px; margin-bottom: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #6366f1;">
                        <h3 style="font-size: 13px; font-weight: bold; color: #4338ca; margin: 0 0 8px 0;">1. Centratura della Traccia e Forma</h3>
                        <p style="font-size: 12px; color: #334155; line-height: 1.6; margin: 0;">${(res.feedback_centratura || 'N/A').replace(/</g, '&lt;')}</p>
                    </div>
                    <div style="padding: 16px; margin-bottom: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
                        <h3 style="font-size: 13px; font-weight: bold; color: #1d4ed8; margin: 0 0 8px 0;">2. Inquadramento Sistematico e Bilanciamento</h3>
                        <p style="font-size: 12px; color: #334155; line-height: 1.6; margin: 0;">${(res.feedback_inquadramento || 'N/A').replace(/</g, '&lt;')}</p>
                    </div>
                    <div style="padding: 16px; margin-bottom: 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #8b5cf6;">
                        <h3 style="font-size: 13px; font-weight: bold; color: #6d28d9; margin: 0 0 8px 0;">3. Gerarchia Argomentativa e Nomofilachia</h3>
                        <p style="font-size: 12px; color: #334155; line-height: 1.6; margin: 0;">${(res.feedback_gerarchia || 'N/A').replace(/</g, '&lt;')}</p>
                    </div>
                </div>

                ${schemaHtml}
                ${confrontoHtml}

                <!-- Consiglio del Presidente -->
                ${res.consiglio_presidente ? `
                <div style="margin-top: 24px; padding: 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px;">
                    <h3 style="font-size: 13px; font-weight: bold; color: #92400e; margin: 0 0 8px 0;">💡 Il Consiglio del Presidente</h3>
                    <p style="font-size: 12px; color: #78350f; line-height: 1.6; margin: 0; font-style: italic;">"${res.consiglio_presidente.replace(/</g, '&lt;')}"</p>
                </div>
                ` : ''}

                <!-- Footer -->
                <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="font-size: 10px; color: #9ca3af; margin: 0;">Generato da ConcorsiPubblici.ai — Simulatore AI per Concorsi Pubblici</p>
                    <p style="font-size: 10px; color: #d1d5db; margin: 4px 0 0 0;">Questo documento è stato prodotto da un'intelligenza artificiale e non ha valore ufficiale.</p>
                </div>
            </div>
        `;

        // Create a temporary container
        var tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.style.background = 'white';
        tempDiv.innerHTML = pdfContent;
        document.body.appendChild(tempDiv);

        var opt = {
            margin: [10, 10, 10, 10],
            filename: 'ConcorsiAI_Valutazione_' + (res.materia || 'Generale') + '_' + new Date(res.date).toLocaleDateString('it-IT').replace(/\//g, '-') + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        html2pdf().set(opt).from(tempDiv.firstChild).save().then(function() {
            document.body.removeChild(tempDiv);
            showToast("PDF scaricato con successo!", "success");
        }).catch(function(err) {
            console.error("PDF generation error:", err);
            document.body.removeChild(tempDiv);
            showToast("Errore nella generazione del PDF.", "error");
        });
    },

    shareResult: function() {
        var res = AppState.currentResult || (AppState.history.length > 0 ? AppState.history[AppState.history.length-1] : null);
        if (!res) return;

        var textToShare = "Ho appena preso " + res.voto + "/20 in " + res.materia + " su ConcorsiPubblici.ai!\n" +
                          "Feedback AI: " + res.feedback + "\n" +
                          "Scrivi anche tu il tuo elaborato e mettiti alla prova!";
        
        if (navigator.share) {
            navigator.share({
                title: 'Il mio risultato su CONCORSI.AI',
                text: textToShare,
                url: window.location.href
            }).then(() => {
                showToast("Condiviso con successo!", "success");
            }).catch(console.error);
        } else {
            showToast("La condivisione nativa non è supportata dal tuo browser.", "warning");
        }
    }
};
