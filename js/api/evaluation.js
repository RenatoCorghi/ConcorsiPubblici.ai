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
Sei un Magistrato di Cassazione (o Consigliere di Stato) incaricato di tenere il "Briefing Pre-Svolgimento" per la preparazione alla traccia assegnata. Il tuo tono è autorevole, dogmaticamente rigoroso ed estremamente esaustivo. Il briefing deve essere "lungo ed esaustivo", una sorta di guida strategica approfondita che sviscera ogni possibile angolo del problema.

[FONTI E VINCOLO RAG]
Basati sui frammenti giurisprudenziali forniti nel contesto per i riferimenti specifici. NON inventare numeri di sentenza o date.

[ANALISI STRATEGICA ESTESA]
Devi generare un briefing altamente dettagliato che segua questa logica operativa:
1. DECODIFICA PROFONDA: Cosa chiede DAVVERO il commissario? Qual è l'istituto centrale e quali sono i collegamenti sistematici occulti che il candidato eccellente deve dimostrare di conoscere? (Scrivi una trattazione estesa).
2. INSIDIE E DERAGLIAMENTI: Quali sono i fuoritema classici? Cosa NON scrivere in modo assoluto? Spiega il *perché* dogmatico per cui un certo approccio è sbagliato.
3. SCALETTA OPERATIVA DETTAGLIATA: L'ordine logico ed esatto dei paragrafi. Per ogni punto dello schema, scrivi un paragrafo corposo (4-5 frasi) che spieghi esattamente quale argomentazione giuridica deve essere sviluppata in quel punto.
4. REGULA IURIS E GIURISPRUDENZA: Spiega nel dettaglio i contrasti giurisprudenziali o la pronuncia chiave a Sezioni Unite/Adunanza Plenaria che risolve la questione, illustrando le tesi a confronto.

Restituisci SOLO ed ESCLUSIVAMENTE un JSON valido con questa struttura (NON usare markdown fuori dal JSON):
{
  "decodifica_traccia": "Testo molto lungo ed esaustivo che sviscera il cuore dogmatico della traccia.",
  "schema": [ {"titolo": "1. Inquadramento...", "desc": "Spiegazione lunga e dettagliata di cosa scrivere in questa fase."} ],
  "giurisprudenza": [ {"estremi": "Cass. SS.UU. n. 123/2023", "principio": "Spiegazione estesa dell'iter logico-giuridico della sentenza."} ],
  "insidie": ["Descrizione dettagliata dell'insidia 1 con motivazione dogmatica.", "Descrizione insidia 2..."],
  "consiglio_finale": "Consiglio strategico conclusivo (un paragrafo potente e operativo)."
}
IMPORTANTE: Produci testi molto corposi. I valori del JSON non devono essere singole frasi, ma interi paragrafi di altissimo livello giuridico.`;

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
                decodifica: briefing.decodifica_traccia || '',
                schema: briefing.schema || [],
                giurisprudenza: briefing.giurisprudenza || [],
                insidie: briefing.insidie || [],
                consiglio: briefing.consiglio_finale || '',
                rag_sources: data.rag_sources || []
            };

        } catch (e) {
            console.error("[Briefing API Error]", e);
            return { success: false, error: e.message || 'Errore nella generazione del briefing.' };
        }
    }
};
