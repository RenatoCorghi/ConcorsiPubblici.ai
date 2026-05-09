/* ============================================================
   EVALUATION API — Correzione elaborati scritti e Briefing
   ============================================================ */
import { APP_CONFIG } from '../config.js';
import { AppState } from '../state.js';
import { handleProxyError, fixJSONNewlines, extractJSON, getAuthHeaders } from './helpers.js';
import { CICERO_EXPERT_SYSTEM } from './prompts.js';

export const evaluationApi = {

    /**
     * Invia un elaborato all'API e restituisce la valutazione strutturata
     * @param {Object} [traceObj] - Opzionale: l'oggetto traccia intero per estrapolare focus, insidie o elementi chiave
     * @returns {Object} JSON completo
     */
    evaluateEssay: async function(apiKey, userText, subject, traceText, traceObj = null) {
        var defaultRes = {
            voto: 12,
            feedback: "Valutazione base a causa di un errore.",
            keywords: [], lacune: [], schema_ideale: [], confronto: [],
            metriche: { correttezza: 60, struttura: 60, terminologia: 60, pertinenza: 60 },
            rag_sources: []
        };
        var concorsoTarget = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Magistratura";

        // Costruzione dinamica del Prompt basato su CiceroAI's Master Prompts
        var promptSystem = CICERO_EXPERT_SYSTEM.GLOBAL_MASTER_PROMPT + "\n";
        if (CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorsoTarget]) {
            promptSystem += "DIRETTIVA SPECIFICA PER CONCORSO: " + CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorsoTarget] + "\n";
        }
        promptSystem += "\nFormato Output: Devi OBBLIGATORIAMENTE restituire SOLO un JSON valido (senza markdown o blocchi di codice esterni) con questa esatta struttura: {\"voto\": numero_da_0_a_20, \"feedback\": \"giudizio generale rigoroso\", \"keywords\": [\"keyword1\", \"keyword2\"], \"lacune\": [\"lacuna 1\", \"lacuna 2\"], \"schema_ideale\": [{\"titolo\": \"1. Inquadramento\", \"desc\": \"Descrizione\"}, {\"titolo\": \"2. Sviluppo\", \"desc\": \"Desc\"}], \"confronto\": [{\"errore_candidato\": \"Cosa ha sbagliato\", \"correzione_ideale\": \"Cosa doveva scrivere\"}], \"metriche\": {\"correttezza\": num_0-100, \"struttura\": num, \"terminologia\": num, \"pertinenza\": num}}";

        var promptUser = `TRACCIA DA SVOLGERE:\n"${traceText}"\n`;

        // Aggiunta dinamica di rubrica specifica della traccia (se presente)
        if (traceObj) {
            if (traceObj.elementi_chiave && traceObj.elementi_chiave.length > 0) {
                promptUser += "\nATTENZIONE: L'elaborato DEVE NECESSARIAMENTE contenere e trattare questi elementi chiave per essere sufficiente: " + traceObj.elementi_chiave.join(", ") + ". Se ne manca anche uno solo, abbassa drasticamente il voto e indicalo come lacuna grave nel feedback.\n";
            }
            if (traceObj.insidie) {
                promptUser += "\nINSIDIA DELLA TRACCIA: " + traceObj.insidie + ". Verifica rigorosamente se il candidato ha evitato l'insidia o se c'è cascato in pieno.\n";
            }
        }

        promptUser += `\nELABORATO DEL CANDIDATO DA VALUTARE:\n"""\n${userText}\n"""\n\nAnalizza l'elaborato seguendo le regole del Sillogismo Giuridico e applicando il Metro di Giudizio. Restituisci esclusivamente il JSON.`;

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'aiCalls',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CORR,
                    useRAG: true,
                    materia: subject,
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
            
            // Recupera le fonti RAG dal proxy (iniettate server-side)
            var ragSourcesFromProxy = data.rag_sources || [];

            let aiContent;
            try {
                aiContent = JSON.parse(fixJSONNewlines(content));
            } catch (jsonErr) {
                console.error("Failed to parse Feedback JSON. Raw content:", content);
                throw new Error("Errore formato JSON dal server AI nella correzione.");
            }
            
            return { 
                success: true, 
                voto: aiContent.voto || 12, 
                feedback: aiContent.feedback || "Valutata.", 
                keywords: aiContent.keywords || [],
                lacune: aiContent.lacune || [],
                schema_ideale: aiContent.schema_ideale || [],
                confronto: aiContent.confronto || [],
                metriche: aiContent.metriche || defaultRes.metriche,
                rag_sources: ragSourcesFromProxy
            };

        } catch (e) {
            console.error("API Error: ", e);
            defaultRes.success = false;
            return defaultRes;
        }
    },

    /**
     * Genera il Briefing Pre-Svolgimento per una traccia.
     */
    generateBriefing: async function(traceText, subject, traceObj = null) {
        var concorsoTarget = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : "Magistratura";

        var promptSystem = `[RUOLO E TONO]
Sei un Consigliere di Stato che ha fatto parte di commissioni di concorso in ${concorsoTarget}. Il tuo tono è strategico, chirurgico e diretto. Il tuo obiettivo NON è fare una lezione sull'istituto, ma insegnare al candidato come si SMONTA questa traccia e come si COSTRUISCE un tema che prende 18/20.

[FONTI E VINCOLO RAG]
Basati sui frammenti giurisprudenziali forniti nel contesto per i riferimenti specifici. NON inventare numeri di sentenza o date.

[ANALISI STRATEGICA]
Devi generare un briefing che segua questa logica operativa:
1. DECODIFICA: Cosa chiede DAVVERO il commissario? Qual è il focus nascosto?
2. INSIDIE: Cosa NON scrivere per non farsi bocciare. Quali argomenti correlati portano fuori tema?
3. SCALETTA OPERATIVA: L'ordine esatto dei paragrafi, con indicazione di quante righe dedicare a ciascuno.
4. REGULA IURIS: La frase di chiusura che lascia al commissario l'impressione di un candidato maturo.

[DIVIETI]
- NON essere generico. Ogni consiglio deve essere specifico per QUESTA traccia.
- NON usare toni entusiastici. Sii operativo: "Traccia insidiosa. Il commissario vuole portarti qui..."
- NON inventare giurisprudenza.

Restituisci SOLO un JSON valido con questa struttura:
{
  "schema": [ {"titolo": "1. Inquadramento", "desc": "Descrizione logica"} ],
  "istituti": ["Istituto 1", "Istituto 2"],
  "giurisprudenza": ["Sentenza o orientamento 1", "Orientamento 2"],
  "insidie": ["Errore tipico 1", "Errore tipico 2"],
  "consiglio": "Consiglio strategico del Debriefer (2-3 frasi incisive e operative)"
}
IMPORTANTE:
- Lo schema deve avere 4-6 sezioni logiche e progressive
- Gli istituti devono essere quelli DAVVERO centrali, non generici
- La giurisprudenza deve essere specifica con estremi reali (Cass. SS.UU., Corte Cost., CdS)
- Le insidie devono essere concrete: cosa farebbe bocciare il candidato su QUESTA traccia`;

        var promptUser = `TRACCIA (${subject}): "${traceText}"\n`;
        if (traceObj && traceObj.elementi_chiave) promptUser += `ELEMENTI CHIAVE NOTI: ${traceObj.elementi_chiave.join(', ')}\n`;
        if (traceObj && traceObj.insidie) promptUser += `INSIDIE NOTE: ${traceObj.insidie}\n`;
        promptUser += "\nGenera il Briefing per questa traccia. Restituisci esclusivamente il JSON.";

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].CORR,
                    useRAG: true,
                    materia: subject,
                    messages: [
                        {"role": "system", "content": promptSystem},
                        {"role": "user", "content": promptUser}
                    ],
                    temperature: 0.4,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) await handleProxyError(response);

            const data = await response.json();
            let content = extractJSON(data.choices[0].message.content.trim());

            let briefing;
            try {
                briefing = JSON.parse(fixJSONNewlines(content));
            } catch (jsonErr) {
                console.error("Failed to parse Briefing JSON. Raw content:", content);
                throw new Error("Errore formato JSON dal server AI nel Briefing.");
            }
            return {
                success: true,
                schema: briefing.schema || [],
                istituti: briefing.istituti || [],
                giurisprudenza: briefing.giurisprudenza || [],
                insidie: briefing.insidie || [],
                consiglio: briefing.consiglio || '',
                rag_sources: data.rag_sources || []
            };

        } catch (e) {
            console.error("[Briefing API Error]", e);
            return { success: false, error: e.message || 'Errore nella generazione del briefing.' };
        }
    }
};
