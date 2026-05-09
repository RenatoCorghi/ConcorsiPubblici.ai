/* ============================================================
   TRACES API — Generazione tracce AI personalizzate
   ============================================================ */
import { APP_CONFIG } from '../config.js';
import { handleProxyError, fixJSONNewlines, extractJSON, getAuthHeaders } from './helpers.js';
import { LISIA_EXPERT_SYSTEM } from './prompts.js';

export const tracesApi = {

    /**
     * Genera una traccia inedita basata sulle lacune dello studente
     */
    generateTrace: async function(apiKey, materia, concorso, weaknesses) {
        var baseSystemPrompt = LISIA_EXPERT_SYSTEM.GLOBAL_MASTER_PROMPT + " ";
        if (LISIA_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]) {
            baseSystemPrompt += LISIA_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso] + " ";
        }
        
        var prompt = `${baseSystemPrompt}\n\nSei la commissione esaminatrice. Il candidato ha queste lacune specifiche tratte dai suoi ultimi temi in ${materia}: "${weaknesses}".\nCrea un'unica, realistica, difficile e inedita traccia d'esame in ${materia} che miri a testare proprio questi istituti o lacune.\nRestituisci SOLO un JSON valido con questa esatta struttura: {"materia": "${materia}", "testo": "testo della traccia molto verosimile...", "elementi_chiave": ["istituto 1", "istituto 2"], "insidie": "breve spiegazione del trabocchetto logico per il candidato"}`;

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].GEN,
                    messages: [{"role": "user", "content": prompt}],
                    temperature: 0.8,
                    max_tokens: 350
                })
            });

            if (!response.ok) await handleProxyError(response);

            const data = await response.json();
            let content = extractJSON(data.choices[0].message.content.trim());
            
            try {
                return { success: true, trace: JSON.parse(fixJSONNewlines(content)) };
            } catch (jsonErr) {
                console.error("Failed to parse Trace JSON. Raw content:", content);
                return { success: false, trace: null };
            }
        } catch (e) {
            console.error('Trace Generation Error:', e);
            return { success: false, trace: null };
        }
    }
};
