import { AppState, saveTutorChatState } from '../state.js';
import { apiService } from '../api.js';
import { Metering } from '../metering.js';
import { escapeHtml } from '../utils.js';

export const TutorController = {
    isOpen: false,

    // Toggle panel view
    toggle: function() {
        this.isOpen = !this.isOpen;
        var panel = document.getElementById('tutor-chat-panel');
        var badge = document.getElementById('tutor-badge');
        
        if (this.isOpen) {
            panel.classList.remove('scale-0', 'opacity-0');
            panel.classList.add('scale-100', 'opacity-100');
            // Hide badge when opening
            if(badge) badge.classList.add('opacity-0');
            
            // Scroll to bottom
            this.scrollToBottom();
            
            // Focus input
            setTimeout(() => {
                const input = document.getElementById('tutor-chat-input');
                if(input) input.focus();
            }, 300);

            // Pro-active init se la chat è vuota
            if (AppState.tutorChat.length === 0) {
                this._initProActiveChat();
            }
        } else {
            panel.classList.remove('scale-100', 'opacity-100');
            panel.classList.add('scale-0', 'opacity-0');
        }
    },

    // Initial greeting based on stats
    _initProActiveChat: function() {
        var c = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Concorsi Pubblici";
        var name = AppState.userProfile && AppState.userProfile.name ? AppState.userProfile.name : "Futuro " + c;
        
        // Analyze stats
        var historyLength = AppState.history.length;
        var avgMateria = "";
        
        var greetingMsg = `Ciao ${name}! Cliccando questo pulsante hai evocato me, CiceroAI, il tuo Tutor personale per il concorso in ${c}. `;
        
        if (historyLength > 0) {
            var validHistory = AppState.history.filter(h => h.id !== 'mock-1');
            if (validHistory.length > 0) {
                var avg = validHistory.reduce((sum, h) => sum + h.voto, 0) / validHistory.length;
                greetingMsg += `Ho notato che hai fatto ${validHistory.length} simulazioni con una media di ${avg.toFixed(1)}/20. Sono qui per aiutarti ad alzare questo punteggio, dove hai bisogno di me oggi?`;
            } else {
                greetingMsg += `Vedo che devi ancora farti correggere la prima vera simulazione. Fammi qualsiasi domanda di diritto su cui hai un dubbio!`;
            }
        } else {
            greetingMsg += `Vedo che sei agli inizi del tuo percorso. Fammi una domanda se ti blocchi!`;
        }

        this.addMessage('ai', greetingMsg);
    },

    // Renders all messages to the DOM
    renderMessages: function() {
        var container = document.getElementById('tutor-chat-messages');
        if (!container) return;
        
        container.innerHTML = '';
        
        AppState.tutorChat.forEach(msg => {
            const isMe = msg.role === 'user';
            container.innerHTML += this._createMessageHTML(isMe, msg.content, msg.id);
        });
        
        this.scrollToBottom();
    },

    // Aggiunge un nuovo messaggio
    addMessage: function(role, content) {
        const msg = {
            id: 'msg-' + Date.now(),
            role: role,
            content: content
        };
        AppState.tutorChat.push(msg);
        saveTutorChatState();
        
        var container = document.getElementById('tutor-chat-messages');
        if (container) {
            container.innerHTML += this._createMessageHTML(role === 'user', content, msg.id);
            this.scrollToBottom();
        }
        
        if (!this.isOpen && role === 'ai') {
            const badge = document.getElementById('tutor-badge');
            if(badge) badge.classList.remove('opacity-0');
        }
    },

    // Invia il messaggio all'API
    sendMessage: async function(e) {
        e.preventDefault();
        const input = document.getElementById('tutor-chat-input');
        if (!input) return;
        
        const text = input.value.trim();
        if (!text) return;
        
        // Add User Message
        this.addMessage('user', text);
        input.value = '';
        
        // Show Typing Indicator
        this._showTypingIndicator();

        // Paywall gate: controlla crediti tutor
        if (!Metering.canUse('tutorChats')) {
            this._hideTypingIndicator();
            Metering.showPaywall('tutorChats');
            return;
        }
        
        // ═══════════════════════════════════════════
        // RAG: Cerca sentenze pertinenti alla domanda
        // ═══════════════════════════════════════════
        let ragContext = '';
        try {
            const keywords = text
                .replace(/[^\w\sàèéìòù]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 4)
                .slice(0, 6)
                .join(' ');
            
            if (keywords.length > 5) {
                const res = await fetch(`/api/giustizia?q=${encodeURIComponent(keywords)}&tipo=SENTENZA&limit=2`);
                if (res.ok) {
                    const data = await res.json();
                    const sentenze = data.risultati || [];
                    if (sentenze.length > 0) {
                        ragContext = '\n\nSENTENZE PERTINENTI ALLA DOMANDA (citale nella risposta se rilevanti):\n';
                        sentenze.forEach((s, i) => {
                            const oggetto = s.oggetto_ricorso || s.oggetto_parere || '';
                            ragContext += `${i + 1}. ${s.tipo_provvedimento} n. ${s.numero_provvedimento}/${s.anno_pubblicazione} (${s.sede_nome || s.sede_slug}) — Esito: ${s.esito || 'N/D'} — Oggetto: ${oggetto.substring(0, 200)}\n`;
                        });
                    }
                }
            }
        } catch (err) {
            console.warn('[Tutor RAG] Ricerca sentenze fallita:', err.message);
        }

        // Call API
        try {
            const apiKey = "proxy-protected";
            
            // Recupera il riassunto della storia (Context Injection) + RAG
            var statsSummary = this._buildContextSummary() + ragContext;
            var concorso = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Magistratura";
            
            var response = await apiService.tutorChat(apiKey, AppState.tutorChat, statsSummary, concorso);
            
            this._hideTypingIndicator();
            if (response.success) {
                Metering.consume('tutorChats');
                this.addMessage('ai', response.reply);
            } else {
                this.addMessage('ai', "Scusa, non riesco a collegarmi ai server ora.");
            }
        } catch (err) {
            this._hideTypingIndicator();
            this.addMessage('ai', "Errore di connessione.");
        }
    },

    _buildContextSummary: function() {
        var summary = "Lo studente ha attualmente XP " + AppState.stats.xp + " e livello " + AppState.stats.level + ". ";
        var history = AppState.history.filter(h => h.id !== 'mock-1');
        if (history.length > 0) {
            var media = history.reduce((s, h) => s + h.voto, 0) / history.length;
            summary += "Ha fatto " + history.length + " simulazioni. La sua media è " + media.toFixed(1) + "/20. ";
            var ultima = history[history.length - 1];
            summary += "Ultimo voto: " + ultima.voto + "/20 in " + ultima.materia + ". Feedback ricevuto: " + ultima.feedback;
        } else {
            summary += "Questo è un nuovo utente e non ha ancora fatto simulazioni ufficiali.";
        }
        summary += " HAI ACCESSO a una banca dati di ~290.000 provvedimenti della Giustizia Amministrativa. Quando rispondi su argomenti di diritto amministrativo, CITA le sentenze reali che ti ho fornito nel contesto. Questo ti rende un tutor eccezionale.";
        return summary;
    },

    scrollToBottom: function() {
        var container = document.getElementById('tutor-chat-messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    _showTypingIndicator: function() {
        var container = document.getElementById('tutor-chat-messages');
        if (!container) return;
        const msgId = 'typing-indicator';
        if (document.getElementById(msgId)) return;
        
        container.innerHTML += `
        <div id="${msgId}" class="flex gap-3 max-w-[85%] mr-auto fade-in">
            <div class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-tr from-magis-600 to-indigo-500">
                <i data-lucide="bot" class="w-3 h-3 text-white"></i>
            </div>
            <div class="bg-gray-800/80 border border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3 relative">
                <div class="ai-typing">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
        `;
        lucide.createIcons();
        this.scrollToBottom();
    },

    _hideTypingIndicator: function() {
        const ind = document.getElementById('typing-indicator');
        if (ind) ind.remove();
    },

    _createMessageHTML: function(isMe, text, id) {
        // Parsa eventuali markdown per i grassetti
        var formatted = escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br/>');

        if (isMe) {
            return `
            <div id="${id}" class="flex flex-col max-w-[85%] ml-auto items-end">
                <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 shadow-md">
                    <p class="text-sm">${formatted}</p>
                </div>
            </div>
            `;
        } else {
            return `
            <div id="${id}" class="flex gap-3 max-w-[85%]">
                <div class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-tr from-magis-600 to-indigo-500 mt-1">
                    <i data-lucide="bot" class="w-3 h-3 text-white"></i>
                </div>
                <div class="bg-gray-800/80 border border-gray-700 text-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md relative leading-relaxed text-sm format-content">
                    ${formatted}
                </div>
            </div>
            `;
        }
    }
};
