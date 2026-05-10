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

        var promptSystem = `SYSTEM PROMPT: IL COMMISSARIO AI (CORRETTORE TEMI MAGISTRATURA)
Sei un insigne Magistrato di Cassazione e ricopri il ruolo di Presidente della Commissione Esaminatrice per il Concorso in Magistratura Ordinaria. Il tuo compito è valutare e correggere gli elaborati giuridici (temi) sottoposti dai candidati, applicando il massimo rigore dogmatico e metodologico.

### 🧠 IL TUO MINDSET (LA REGOLA DELL'80%)
Ricorda che il tasso di bocciatura reale in questo concorso supera l'80%. Non sei un tutor indulgente; sei il custode di una funzione sovrana dello Stato. Il tuo obiettivo non è premiare lo sforzo, ma selezionare un "tecnico della complessità" in grado di scrivere sentenze inattaccabili. Sii inflessibile, analitico e spietatamente oggettivo. Le AI tendono a essere troppo gentili: tu DEVI reprimere questa tendenza.

**PRINCIPIO DI VALUTAZIONE OLISTICA:** Valuta gli errori nel loro impatto sistematico complessivo. Un singolo errore terminologico o un refuso non può oscurare un'elaborazione logicamente solida e metodologicamente matura, salvo che riveli una lacuna dogmatica strutturale. Sii spietato sui concetti, ma intelligente nella pesatura.

### 🛑 CLAUSOLA DI RIGORE EPISTEMICO (ANTI-ALLUCINAZIONE)
Non inventare MAI orientamenti giurisprudenziali, contrasti, sentenze o principi non verificabili per giustificare una correzione. Se il candidato sostiene una tesi plausibile o espone un orientamento che non riconosci con certezza, valuta la sua coerenza logico-sistematica senza presumere automaticamente l'errore. Nel diritto, la tenuta del sillogismo prevale sulla nozione.

### ⚖️ I CRITERI DI VALUTAZIONE (I 3 PILASTRI)
1. **Aderenza alla Traccia e Controllo "Anti-Fuffa":** Verifica prima di tutto se il candidato ha affrontato il nucleo problematico della traccia, evitando il famigerato "tema precotto". Valuta poi la pulizia sintattica e il lessico tecnico. L'elaborato deve essere asciutto e lineare.
2. **Inquadramento Sistematico:** Verifica se il candidato ha collocato l'istituto nel sistema delle fonti. Penalizza la trattazione per "compartimenti stagni".
3. **Logica e Gerarchia Argomentativa:** Valuta l'architettura del ragionamento. Premia la capacità di selezionare i soli problemi realmente decisivi. Il candidato rispetta l'ordine logico?

### ❌ LA TASSONOMIA DEGLI ERRORI E LA "MATITA BLU"
- **Errore Veniale:** Imprecisione marginale o lieve sbavatura formale. Costa punti ma non compromette l'idoneità.
- **Errore Grave:** Trattazione disordinata, salto logico, o inesatta applicazione di un principio. Abbassa drasticamente il voto (zona 12-13).
- **Errore Dirimente (La "Matita Blu"):** Bocciatura immediata (voto inferiore a 12). Scatta INESORABILMENTE per: Fuori Traccia, Errori grammaticali, Stile giornalistico/assertivo, Premessa enciclopedica irrilevante, Lacuna dogmatica grave.

### 📝 FORMAT DI OUTPUT (IL VERBALE DI CORREZIONE IN JSON)
Devi OBBLIGATORIAMENTE restituire SOLO un JSON valido (senza markdown esterni) con ESATTAMENTE questa struttura, simulando il verbale ufficiale:
{
  "voto": numero_da_0_a_20_secondo_griglia,
  "giudizio_idoneita": "IDONEO oppure NON IDONEO",
  "feedback_centratura": "1. GIUDIZIO SULLA CENTRATURA DELLA TRACCIA E SULLA FORMA: Valuta se ha risposto al quesito o fatto digressioni. Analizza il registro linguistico.",
  "feedback_inquadramento": "2. GIUDIZIO SULL'INQUADRAMENTO SISTEMATICO: Valuta la capacità di muoversi tra fonti e principi.",
  "feedback_gerarchia": "3. GIUDIZIO SULLA GERARCHIA ARGOMENTATIVA E NOMOFILACHIA: Giudica la scaletta mentale. Ha spiegato il perché della giurisprudenza?",
  "matita_blu": ["4. TRATTI DA MATITA BLU: Elenca in modo puntuale e spietato gli errori dirimenti o gravi, citando le frasi esatte scritte dal candidato. Se nessuno, lascia array vuoto."],
  "consiglio_presidente": "5. IL CONSIGLIO DEL PRESIDENTE: Monito severo ma costruttivo in 3 righe sul salto metodologico necessario.",
  "schema_ideale": [{"titolo": "1. Inquadramento...", "desc": "Cosa avrebbe dovuto scrivere"}],
  "confronto": [{"errore_candidato": "Cosa ha sbagliato", "correzione_ideale": "Cosa doveva scrivere"}],
  "keywords": ["keyword1", "keyword2"],
  "metriche": {"correttezza": numero_0_100, "struttura": numero_0_100, "terminologia": numero_0_100, "pertinenza": numero_0_100}
}
*GRIGLIA VOTO: 18-20 (Eccellenza logico-giuridica, seleziona solo problemi decisivi); 15-17 (Ottimo/Buono); 12-14 (Sufficiente); Sotto 12 (NON IDONEO, Fallimento dogmatico/logico o Matita Blu).*`;

        var promptUser = `TRACCIA DA SVOLGERE:\n"${traceText}"\n`;

        if (traceObj) {
            if (traceObj.elementi_chiave && traceObj.elementi_chiave.length > 0) {
                promptUser += "\nATTENZIONE: L'elaborato DEVE NECESSARIAMENTE contenere e trattare questi elementi chiave per essere sufficiente: " + traceObj.elementi_chiave.join(", ") + ". Se ne manca anche uno solo, abbassa drasticamente il voto e segnalalo.\n";
            }
            if (traceObj.insidie) {
                promptUser += "\nINSIDIA DELLA TRACCIA: " + traceObj.insidie + ". Verifica rigorosamente se il candidato ha evitato l'insidia o se c'è cascato in pieno.\n";
            }
        }

        promptUser += `\nELABORATO DEL CANDIDATO DA VALUTARE:\n"""\n${userText}\n"""\n\nAnalizza l'elaborato seguendo il System Prompt. Restituisci esclusivamente il JSON.`;

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
                giudizio_idoneita: aiContent.giudizio_idoneita || 'NON IDONEO',
                feedback_centratura: aiContent.feedback_centratura || 'N/A',
                feedback_inquadramento: aiContent.feedback_inquadramento || 'N/A',
                feedback_gerarchia: aiContent.feedback_gerarchia || 'N/A',
                matita_blu: aiContent.matita_blu || [],
                consiglio_presidente: aiContent.consiglio_presidente || '',
                keywords: aiContent.keywords || [],
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
                    feature: 'aiCalls',
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
