/* ============================================================
   ORALE.JS (Controller) — Logica AI per esame orale
   ============================================================ */
import { AppState } from '../state.js';
import { APP_CONFIG } from '../config.js';
import { apiService } from '../api.js';
import { showToast } from '../utils.js';
import { navigateToRoute, renderView } from '../router.js';
import { appendOraleMessage } from '../views/orale.js';
import { Gamification } from '../gamification.js';
import { Metering } from '../metering.js';


export const OraleController = {

    // --- Web Speech & TTS ---
    recognition: null,
    isDictating: false,

    speakTTS: function(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        
        // Estrai il tag per capire chi parla
        var speakerMatch = text.match(/\[(.*?)\]/);
        var speaker = speakerMatch ? speakerMatch[1].toLowerCase() : 'esaminatore';
        
        var cleanText = text.replace(/\[.*?\]\s*/, '');
        var msg = new SpeechSynthesisUtterance(cleanText);
        msg.lang = 'it-IT';
        
        // Modifica i parametri della voce in base al commissario
        if (speaker.includes('presidente')) {
            msg.rate = 0.90; // Lento e solenne
            msg.pitch = 0.6; // Molto grave
        } else if (speaker.includes('professore') || speaker.includes('professoressa')) {
            msg.rate = 1.05; // Spigliato
            msg.pitch = 1.2; // Più acuto
        } else if (speaker.includes('avvocato')) {
            msg.rate = 1.15; // Furbo e veloce
            msg.pitch = 1.0; // Normale
        } else {
            msg.rate = 1.05; // Default Esaminatore
            msg.pitch = 0.95;
        }
        
        window.speechSynthesis.speak(msg);
    },

    toggleDictation: function() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            showToast("Il tuo browser non supporta la dettatura vocale. Usa un browser moderno come Chrome.", "error");
            return;
        }
        
        var iconObj = document.getElementById('icon-mic');
        var btnObj = document.getElementById('btn-mic');

        if (OraleController.isDictating) {
            OraleController.isDictating = false;
            if (OraleController.recognition) OraleController.recognition.stop();
            if (iconObj) iconObj.classList.remove('text-red-500', 'pulse');
            if (btnObj) btnObj.classList.remove('border-red-500');
            return;
        }

        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        OraleController.recognition = new SpeechRec();
        OraleController.recognition.lang = 'it-IT';
        OraleController.recognition.continuous = false;
        OraleController.recognition.interimResults = true;

        OraleController.recognition.onstart = function() {
            OraleController.isDictating = true;
            if (iconObj) iconObj.classList.add('text-red-500', 'pulse');
            if (btnObj) btnObj.classList.add('border-red-500');
            showToast("In ascolto...", "info");
        };

        OraleController.recognition.onresult = function(event) {
            var input = document.getElementById('orale-input');
            if(!input) return;
            var finalTranscript = '';
            for (var i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                input.value += (input.value ? ' ' : '') + finalTranscript;
            }
        };

        OraleController.recognition.onerror = function(event) {
            console.error("Speech error", event.error);
            OraleController.isDictating = false;
            if (iconObj) iconObj.classList.remove('text-red-500', 'pulse');
            if (btnObj) btnObj.classList.remove('border-red-500');
        };

        OraleController.recognition.onend = function() {
            OraleController.isDictating = false;
            if (iconObj) iconObj.classList.remove('text-red-500', 'pulse');
            if (btnObj) btnObj.classList.remove('border-red-500');
        };

        OraleController.recognition.start();
    },

    setOraleMateria: function(materia) {
        AppState.orale.materia = materia;
        renderView();
    },

    setOraleMode: function(mode) {
        AppState.orale.mode = mode;
        renderView();
    },

    startOrale: function() {
        // Paywall gate: orale è Pro-only
        if (!Metering.canUse('oralSessions')) {
            Metering.showPaywall('oralSessions');
            return;
        }
        if(!AppState.orale.materia) return;
        Metering.consume('oralSessions');
        var startMsg = 'Benvenuto. Iniziamo l\'interrogazione in ' + AppState.orale.materia + '. Mi parli dell\'istituto principale di riferimento per questa sessione.';
        AppState.orale.messages = [{
            role: 'ai', 
            text: startMsg
        }];
        navigateToRoute('orale-session');
        
        setTimeout(function() { OraleController.speakTTS(startMsg); }, 500);
    },

    sendOraleMessage: async function() {
        var input = document.getElementById('orale-input');
        if(!input || !input.value.trim()) return;
        
        if (OraleController.isDictating && OraleController.recognition) {
            OraleController.recognition.stop();
        }
        
        var userText = input.value.trim();
        var userMsg = {role: 'user', text: userText};
        AppState.orale.messages.push(userMsg);
        input.value = '';
        
        appendOraleMessage(userMsg);
        
        var apiKey = "proxy-protected";
        var loaderAiMsg = {role: 'ai', text: "...", _isLoader: true};
        appendOraleMessage(loaderAiMsg);

        if (apiKey) {
            var result = await apiService.chatOrale(apiKey, AppState.orale.messages, AppState.orale.materia, AppState.orale.mode);
            
            var container = document.getElementById('orale-chat-container');
            if (container && container.lastElementChild) container.removeChild(container.lastElementChild);
            
            var aiText = result.text;
            var aiMsg = {role: 'ai', text: aiText};
            AppState.orale.messages.push(aiMsg);
            appendOraleMessage(aiMsg);
            OraleController.speakTTS(aiText);
        } else {
            setTimeout(function() {
                var container = document.getElementById('orale-chat-container');
                if (container && container.lastElementChild) container.removeChild(container.lastElementChild);
                
                var aiReplies = {
                    standard: "Bene. Andiamo più a fondo. Quali sono gli orientamenti giurisprudenziali recenti a riguardo?",
                    commissione: "[Professore] Intervengo su questo punto per chiederle della distinzione teorica che vi è sottesa. Come la inquadra?",
                    incalzante: "Non ci siamo. La sua definizione è approssimativa e salta passaggi logici fondamentali. Mi spieghi come giustifica l'applicabilità dell'art. rilevante senza girarci intorno."
                };
                var aiMsg = {role: 'ai', text: aiReplies[AppState.orale.mode]};
                AppState.orale.messages.push(aiMsg);
                appendOraleMessage(aiMsg);
                OraleController.speakTTS(aiReplies[AppState.orale.mode]);
            }, 1500);
        }
    },

    endOrale: function() {
        var loader = document.getElementById('llm-loader-modal');
        var loaderText = document.getElementById('llm-loader-text');
        var loaderBar = document.getElementById('llm-loader-bar');
        
        if(loader) loader.classList.remove('hidden');
        if(loaderBar) loaderBar.style.width = '0%';
        if(loaderText) loaderText.innerText = 'Valutazione orale in corso...';
        
        var steps = [
            { text: "Analisi risposte fornite...", progress: "30%", delay: 0 },
            { text: "Confronto con requisiti Bando...", progress: "60%", delay: 1500 },
            { text: "Processamento voto commissione...", progress: "100%", delay: 3000 }
        ];

        steps.forEach(function(step) {
            setTimeout(function() {
                if(loaderText) loaderText.innerText = step.text;
                if(loaderBar) loaderBar.style.width = step.progress;
            }, step.delay);
        });

        setTimeout(async function() {
            var apiKey = "proxy-protected";
            var finalVoto = 5;
            var finalFeedback = "";
            var isIdoneo = false;

            if (apiKey && AppState.orale.messages.length > 2) {
                if(loaderText) { loaderText.innerText = 'Consultazione AI finale...'; loaderBar.style.width = '95%'; }
                var resultResponse = await apiService.evaluateOrale(apiKey, AppState.orale.messages, AppState.orale.materia);
                if (resultResponse && resultResponse.success && resultResponse.result) {
                    finalVoto = resultResponse.result.voto;
                    finalFeedback = resultResponse.result.feedback;
                    isIdoneo = resultResponse.result.idoneo;
                } else {
                    finalVoto = Math.floor(Math.random() * 5) + 5;
                    isIdoneo = finalVoto >= 6;
                    finalFeedback = "Valutazione base per errore di rete AI.";
                }
            } else {
                // Fallback mock test
                finalVoto = Math.floor(Math.random() * 5) + 5; 
                isIdoneo = finalVoto >= 6;
                if(isIdoneo) {
                    finalFeedback = "Padronanza degli istituti accettabile. Mantenersi lucidi in modalità incalzante aiuta la commissione a valutare favorevolmente l'attitudine al ragionamento logico.";
                } else {
                    finalFeedback = "Hai mostrato indecisioni gravi e un uso approssimativo del lessico giuridico nella materia trattata. Necessario ripasso approfondito.";
                }
            }

            AppState.orale.voto = finalVoto;
            AppState.orale.result = {
                feedback: finalFeedback,
                idoneo: isIdoneo
            };

            if(loader) loader.classList.add('hidden');
            navigateToRoute('orale-result');

            // --- Gamification ---
            Gamification.addXP(150, "Simulazione Orale");
            if (isIdoneo) {
                Gamification.checkBadge('parlatore');
            }
        }, 3500);
    }
};
