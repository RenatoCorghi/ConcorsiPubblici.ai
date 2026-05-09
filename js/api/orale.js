/* ============================================================
   ORALE API — Simulazione esame orale (chat e valutazione)
   ============================================================ */
import { APP_CONFIG } from '../config.js';
import { AppState } from '../state.js';
import { handleProxyError, fixJSONNewlines, extractJSON, getAuthHeaders } from './helpers.js';

export const oraleApi = {

    /**
     * Valuta l'intero storico dell'orale per generare il voto finale
     */
    evaluateOrale: async function(apiKey, historyMessages, materia) {
        var transcript = historyMessages.map(m => (m.role === 'ai' ? 'Esaminatore: ' : 'Candidato: ') + m.text).join('\n\n');
        var concorsoTarget = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Magistratura";
        
        var promptSystem = `Sei l'esaminatore spietato del concorso in ${concorsoTarget}. Devi valutare la performance orale del candidato in ${materia}.
METRO DI GIUDIZIO: 
Valuta la padronanza del lessico giuridico, la fermezza nel rispondere a tranelli, e l'esattezza degli istituti.
Se il candidato balbetta o risponde in modo vago/generico, BOCCIALO.
Restituisci SOLO un JSON: {"voto": numero_da_0_a_10, "feedback": "giudizio analitico cattivo ma giusto di 2-3 frasi", "idoneo": booleano_true_o_false}`;
        
        var promptUser = "TRASCRIZIONE DELL'ESAME:\n" + transcript + "\n\nValuta la trascrizione e restituisci il JSON.";

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CORR,
                    messages: [
                        {"role": "system", "content": promptSystem},
                        {"role": "user", "content": promptUser}
                    ],
                    temperature: 0.2,
                    response_format: { type: "json_object" }
                })
            });

            if(!response.ok) await handleProxyError(response);

            const data = await response.json();
            let content = extractJSON(data.choices[0].message.content.trim());
            
            try {
                return { success: true, result: JSON.parse(fixJSONNewlines(content)) };
            } catch (jsonErr) {
                console.error("Failed to parse Orale JSON. Raw content:", content);
                return { success: false, result: null };
            }
        } catch (e) {
            return { success: false, result: null };
        }
    },

    /**
     * Invia la cronologia della conversazione orale all'AI e restituisce la replica testuale dell'esaminatore
     */
    chatOrale: async function(apiKey, historyMessages, materia, mode) {
        var concorsoTarget = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Magistratura";
        var baseSystemPrompt = `Sei un esaminatore del concorso per ${concorsoTarget} in Italia. Stai interrogando il candidato in: ${materia}.
REGOLA: Mantieni le tue risposte sotto le 60-80 parole. Usa un lessico tecnico ineccepibile. Non dare MAI la soluzione esatta al candidato, costringilo a ragionare. Fai una sola domanda per volta. `;
        
        if (mode === 'commissione') {
            baseSystemPrompt += "La commissione è composta da Presidente, Professore Universitario e Avvocato. Inizia la tua risposta con il tag di chi sta parlando, per esempio '[Presidente] Buongiorno candidato...'. I tre hanno toni diversi: il Presidente è impaziente, il Professore è teorico, l'Avvocato è pratico. ";
        } else if (mode === 'incalzante') {
            baseSystemPrompt += "Sii spietato e incalzante. Fai domande a tranello, interrompi, metti pressione. Sottolinea ogni minima incertezza o atecnicità lessicale. Fai sentire il candidato sotto esame. ";
        } else {
            baseSystemPrompt += "Sii formale ma equilibrato. Ascolta la risposta e procedi logico, scavando a fondo negli istituti. Concludi se sei soddisfatto o gravemente insoddisfatto. ";
        }

        var apiMessages = [{ role: 'system', content: baseSystemPrompt }];
        
        // Conversione dello storico App (role === 'ai' || 'user') a storico OpenAI ('assistant' || 'user')
        historyMessages.forEach(msg => {
            apiMessages.push({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.text
            });
        });

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CHAT,
                    messages: apiMessages,
                    temperature: 0.7,
                    max_tokens: 150
                })
            });

            if(!response.ok) await handleProxyError(response);

            const data = await response.json();
            return { success: true, text: data.choices[0].message.content };
        } catch (e) {
            console.error("OpenAI Chat Error:", e);
            return { success: false, text: "Candidato, a causa di un problema tecnico dobbiamo sospendere l'esame un momento. (Errore Connessione AI)" };
        }
    }
};
