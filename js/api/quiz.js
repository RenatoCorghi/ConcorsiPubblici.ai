/* ============================================================
   QUIZ API — Generazione quiz AI e quiz da casi reali
   ============================================================ */
import { APP_CONFIG } from '../config.js';
import { AppState } from '../state.js';
import { handleProxyError, getAuthHeaders } from './helpers.js';

/**
 * Parser robusto per il formato quiz testuale dell'AI.
 * Estrae domande, opzioni, risposta corretta e spiegazione.
 */
function parseQuizBlocks(content) {
    let quizData = { titolo: "Quiz generato dall'AI", domande: [] };
    
    let titleMatch = content.match(/TITOLO:\s*(.+)/i);
    if (titleMatch) quizData.titolo = titleMatch[1].trim();
    
    let blocks = content.split(/---/);
    
    for (let block of blocks) {
        if (!block.toUpperCase().includes('DOMANDA:')) continue;
        
        let qTextMatch = block.match(/DOMANDA:\s*([\s\S]*?)(?=A\))/i);
        if (!qTextMatch) continue;
        
        let optA = block.match(/A\)\s*(.+)/i);
        let optB = block.match(/B\)\s*(.+)/i);
        let optC = block.match(/C\)\s*(.+)/i);
        let optD = block.match(/D\)\s*(.+)/i);
        let corrMatch = block.match(/CORRETTA:\s*([A-D])/i);
        let spiegMatch = block.match(/SPIEGAZIONE:\s*([\s\S]*?)$/i);
        
        if (optA && optB && optC && optD && corrMatch) {
            let letter = corrMatch[1].toUpperCase();
            let correctIndex = letter === 'A' ? 0 : letter === 'B' ? 1 : letter === 'C' ? 2 : 3;
            
            quizData.domande.push({
                testo: qTextMatch[1].trim(),
                opzioni: [
                    "A) " + optA[1].trim(),
                    "B) " + optB[1].trim(),
                    "C) " + optC[1].trim(),
                    "D) " + optD[1].trim()
                ],
                corretta: correctIndex,
                spiegazione: spiegMatch ? spiegMatch[1].trim() : "Nessuna spiegazione fornita."
            });
        }
    }
    
    return quizData;
}

export const quizApi = {

    generateQuiz: async function(apiKey, materia, numQuestions) {
        let concorsoTarget = AppState.userProfile?.concorso || "Magistratura";
        let prompt = `Sei l'esaminatore del concorso per ${concorsoTarget}. 
Genera un quiz difficile a risposta multipla su argomenti di: ${materia}.
Devono esserci esattamente ${numQuestions} domande.

Devi TASSATIVAMENTE usare questo esatto formato di testo semplice (NON usare JSON):

TITOLO: Quiz generato su ${materia}
---
DOMANDA: Testo della prima domanda?
A) Prima opzione
B) Seconda opzione
C) Terza opzione
D) Quarta opzione
CORRETTA: A
SPIEGAZIONE: Breve spiegazione del perché A è corretta.
---
DOMANDA: Testo della seconda domanda?
A) Prima opzione
...`;

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].GEN,
                    messages: [{"role": "user", "content": prompt}],
                    temperature: 0.5, max_tokens: 2000
                })
            });
            if (!response.ok) await handleProxyError(response);

            const data = await response.json();
            let content = data.choices[0].message.content.trim();
            let quizData = parseQuizBlocks(content);
            
            if (quizData.domande.length === 0) {
                throw new Error("Il parser non ha trovato domande valide. RAW: " + content.substring(0, 150));
            }
            return { success: true, data: quizData };
        } catch (e) {
            console.error('Quiz Generation Error:', e);
            return { success: false, error: e.message };
        }
    },

    generateQuizFromCase: async function(apiKey, numQuestions) {
        let concorsoTarget = AppState.userProfile?.concorso || "Magistratura";
        try {
            const randomOffset = Math.floor(Math.random() * 200);
            const res = await fetch(`/api/giustizia?tipo=SENTENZA&limit=5&offset=${randomOffset}`);
            if (!res.ok) throw new Error('Errore ricerca sentenze');
            const searchData = await res.json();
            
            const sentenze = (searchData.risultati || []).filter(s => 
                s.oggetto_ricorso && s.oggetto_ricorso.length > 30 && s.esito
            );
            if (sentenze.length === 0) {
                return { success: false, error: 'Nessuna sentenza idonea trovata nel database.' };
            }

            const sentenza = sentenze[0];
            let prompt = `Sei l'esaminatore del concorso per ${concorsoTarget}.
HAI DAVANTI UN CASO REALE tratto dalla Giustizia Amministrativa:
- Tipo: ${sentenza.tipo_provvedimento}
- Sede: ${sentenza.sede_nome || sentenza.sede_slug}
- Numero: ${sentenza.numero_provvedimento}/${sentenza.anno_pubblicazione}
- Esito: ${sentenza.esito || 'Non specificato'}

Genera ${numQuestions} domande a risposta multipla su questo caso.
Usa il formato: TITOLO / --- / DOMANDA / A) B) C) D) / CORRETTA / SPIEGAZIONE`;

            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].GEN,
                    messages: [{"role": "user", "content": prompt}],
                    temperature: 0.5, max_tokens: 2500
                })
            });
            if (!response.ok) await handleProxyError(response);

            const data = await response.json();
            let content = data.choices[0].message.content.trim();
            let quizData = parseQuizBlocks(content);
            quizData.caso_reale = {
                tipo: sentenza.tipo_provvedimento,
                sede: sentenza.sede_nome || sentenza.sede_slug,
                numero: sentenza.numero_provvedimento,
                anno: sentenza.anno_pubblicazione,
                esito: sentenza.esito || '',
                oggetto: (sentenza.oggetto_ricorso || '').substring(0, 300)
            };
            
            if (quizData.domande.length === 0) {
                throw new Error("Il parser non ha trovato domande valide nel formato dell'AI.");
            }
            return { success: true, data: quizData };
        } catch (e) {
            console.error('Quiz From Case Error:', e);
            return { success: false, error: e.message };
        }
    }
};
