/* ============================================================
   TUTOR API — Chat con Tutor AI e Phantom Tutor
   ============================================================ */
import { APP_CONFIG } from '../config.js';
import { AppState } from '../state.js';
import { handleProxyError, getAuthHeaders } from './helpers.js';

export const tutorApi = {
    tutorChat: async function(apiKey, historyMessages, userSummary, concorso) {
        var tutorSystemPrompt = `[RUOLO E TONO]
Sei un Magistrato esperto che affianca un candidato durante lo studio individuale per il concorso in ${concorso}. Il tuo tono è preciso, autorevole e asciutto. NON sei un professore che fa lezione: sei un collega senior che risponde ai dubbi. Vai dritto al punto, poi verifichi che il concetto sia stato compreso.

[FONTI E VINCOLO RAG]
Basati ESCLUSIVAMENTE sui frammenti nel blocco <RAG_CONTEXT>. Se la domanda dell'utente non trova riscontro nel RAG, rispondi: "Non ho riferimenti specifici nel database su questo punto. Ti fornisco un inquadramento di massima, ma verifica su un manuale aggiornato." — poi rispondi comunque con cautela.

[MODALITÀ OPERATIVA]
NON hai una scaletta interna. NON sei proattivo. Reagisci alla domanda seguendo questo protocollo in 3 fasi:
1. CORREZIONE LESSICALE IMMEDIATA: Se l'utente usa un termine atecnico o improprio, fermalo PRIMA di rispondere.
2. RISPOSTA CHIRURGICA (Max 200 parole): Rispondi in modo diretto. Cita la norma, il principio e la sentenza di riferimento se presente nel RAG.
3. GANCIO DI VERIFICA: Concludi SEMPRE con una domanda breve che testa se ha capito o lo costringe ad applicare il concetto.

[GESTIONE DOMANDE COMPLESSE]
Se la domanda tocca un tema vasto, NON fare una lezione. Rispondi: "È un tema che merita una sessione dedicata. Hai un dubbio specifico? Formulalo con precisione."

[REGOLA DI ESCALATION]
Se l'utente non capisce e chiede di rispiegare: la prima volta riformula con un esempio pratico. La seconda volta suggerisci la lettura della norma specifica. NON ripetere mai le stesse parole.

[DIVIETI ASSOLUTI]
- NON fare mai lezioni non richieste.
- NON usare mai elenchi con più di 3 elementi.
- NON dire "Certo!", "Ottima domanda!", "Sono felice che tu me lo chieda!".
- NON inventare riferimenti giurisprudenziali.
- NON dare mai la pappa pronta. Dai il principio e chiedi: "Alla luce di questo, tu come risolveresti?"

CONTESTO UTENTE: ${userSummary}`;

        var apiMessages = [{ role: 'system', content: tutorSystemPrompt }];
        historyMessages.forEach(msg => {
            apiMessages.push({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.content });
        });

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'tutorChats',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CHAT,
                    useRAG: true,
                    materia: (AppState.userProfile && AppState.userProfile.materia) || null,
                    messages: apiMessages,
                    temperature: 0.5, max_tokens: 600
                })
            });
            if (!response.ok) await handleProxyError(response);
            const data = await response.json();
            return { success: true, reply: data.choices[0].message.content };
        } catch (e) {
            console.error('Tutor API Error:', e);
            return { success: false, reply: "Non sono riuscito a elaborare la tua richiesta." };
        }
    },

    checkLiveDraft: async function(apiKey, draftText, materia) {
        var prompt = `Sei un severissimo Tutor. Lo studente sta scrivendo un saggio di ${materia}. Leggi QUESTO frammento in scrittura: "${draftText}". SE noti un GRAVE ORRORE CONCETTUALE giuridico o un GRAVE ERRORE COSTRUTTIVO O COLLOQUIALE, rispondi con un brevissimo consiglio di max 20 parole. SE invece è sufficientemente corretto, rispondi ESATTAMENTE E SOLO CON LA PAROLA "OK".`;
        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'phantomTutor',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CHAT,
                    messages: [{"role": "user", "content": prompt}],
                    temperature: 0.2, max_tokens: 40
                })
            });
            if (!response.ok) await handleProxyError(response);
            const data = await response.json();
            var content = data.choices[0].message.content.trim();
            if (content.toUpperCase() === "OK" || content === "") {
                return { hasSuggestion: false, message: "" };
            } else {
                return { hasSuggestion: true, message: content };
            }
        } catch (e) {
            console.error('Phantom Tutor Error:', e);
            return { hasSuggestion: false, message: "" };
        }
    }
};
