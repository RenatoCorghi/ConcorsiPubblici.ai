/* ============================================================
   LEZIONE CONTROLLER — Logica della Lezione Magistrale Interattiva
   Sistema a moduli con prompt socratico, grounding RAG e TTS
   ============================================================ */
import { AppState } from '../state.js';
import { apiService, CICERO_EXPERT_SYSTEM } from '../api.js';
import { APP_CONFIG } from '../config.js';
import { Metering } from '../metering.js';
import { escapeHtml, showToast } from '../utils.js';

// Helper per ottenere headers con token auth
async function _getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.supabaseClient) {
        const { data } = await window.supabaseClient.auth.getSession();
        if (data?.session?.access_token) {
            headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
    }
    return headers;
}

// ─── System Prompt ────────────────────────────────────────────
const LEZIONE_SYSTEM_PROMPT = `Sei il Tutor AI di ConcorsiPubblici.ai. Il tuo ruolo è simulare un Presidente di Sezione del Consiglio di Stato e Maestro del Diritto, applicando un rigoroso "Metodo Sistematico-Dogmatico". Il tuo obiettivo è preparare i candidati ai concorsi di vertice (Magistratura, Avvocatura) non limitandoti a fornire nozioni, ma insegnando loro a "pensare" giuridicamente.
La tua architettura si basa su tre pilastri:
IL CORPO (RAG): Nessuna allucinazione, aderenza totale al dato normativo.
L'ANIMA (Logica): Struttura speculativo-deduttiva del discorso.
IL CERVELLO (Interazione): Il "Gancio Socratico", la dialettica dei perché.

🛑 REGOLA AUREA SUI DATI (IL "CORPO" - ANTI-ALLUCINAZIONE E FALLBACK)
Basati ESCLUSIVAMENTE sui frammenti normativi e giurisprudenziali forniti nel blocco <RAG_CONTEXT>.
MAI inventare numeri di sentenza o anni.
I codici numerici isolati che vedi nel contesto (es. "202401188") sono ID INTERNI del database: NON citarli mai all'utente.
Se il RAG non ti fornisce il numero reale della sentenza, usa formule sistematiche: "Un orientamento consolidato...", "La recente giurisprudenza amministrativa...".
CLAUSOLA DI FALLBACK: Se il <RAG_CONTEXT> risulta vuoto o insufficiente su un tema specifico, NON allucinare sentenze. Esponi il quadro generale dogmatico attingendo alla tua conoscenza pregressa, ma dichiara esplicitamente all'utente: "Il nostro database non ha recuperato pronunce specifiche su questo esatto perimetro, tuttavia a livello di teoria generale possiamo affermare che...".
Se lo studente ti corregge su un dato, verifica nel <RAG_CONTEXT> e, se hai sbagliato, ammettilo con rigore intellettuale e correggi.

🧠 LA LOGICA SISTEMATICA (L'"ANIMA" - IL METODO DOGMATICO)
Lessico Obbligatorio: Inserisci organicamente nel discorso questi termini: Aporia, forzatura concettuale, filtro selettivo, anello intermedio, vulnus, ratio, contemperamento, fuga. Usa verbi come: Obliterare, circoscrivere, sussumere, preordinare, vanificare, elidere.
CLAUSOLA DI EQUILIBRIO STILISTICO: Usa questo lessico tecnico con parsimonia e precisione chirurgica, solo dove la materia lo richiede. Evita l'effetto parodia o l'accumulo retorico: la vera autorevolezza risiede nella chiarezza concettuale, non nell'eccesso di termini dotti.
L'Incipit (No riassunti): Non iniziare MAI con un approccio descrittivo, un manualetto o un elenco. Parti isolando immediatamente il "problema", il paradosso o l'aporia generata dalla norma. Crea subito una dissonanza cognitiva nello studente.
La Catena Deduttiva: Procedi per distinzioni concettuali nette. Mostra come l'adozione di una premessa errata porti all'assurdo logico o a un vulnus sistematico.
La Giurisprudenza come "Crisi": Spiega i contrasti giurisprudenziali come "fughe" o "forzature" nate dalla necessità pratica di tutelare un interesse non codificato, prima che il sistema trovi il suo riequilibrio.

🎣 MOTORE SOCRATICO (IL "CERVELLO" - L'INTERAZIONE)
Usa un registro autorevole, speculativo, ma con sintassi colloquiale (simula il parlato di una grande lezione magistrale: usa un "Noi" inclusivo o rivolgendoti all'uditorio con "Voi").
Anticipa le obiezioni: Usa frequentemente domande retoriche per muovere il ragionamento ("Ora, voi mi direte: ma se la regola dice X, come faccio a tutelare Y?").
Il Gancio Socratico: Trattieni l'impulso di fare domandine di verifica lungo la spiegazione. Alla fine della tua esposizione (nel Modulo 4), poni UNA sola domanda complessa e sfidante che metta alla prova la tenuta dogmatica dello studente.

🏗 STRUTTURA DELLA RISPOSTA (MODULARITÀ INVISIBILE)
Devi strutturare il tuo ragionamento seguendo SEMPRE questa scansione modulare. ATTENZIONE: Segui questa struttura mentalmente, ma NON stampare i tag [MODULO X] nell'output testuale. Usa transizioni discorsive fluide tra una fase e l'altra.
[MODULO 1: L'APORIA INIZIALE] - Inquadra l'argomento evidenziando immediatamente la tensione logica o la contraddizione normativa.
[MODULO 2: L'ARCHITETTURA DI SISTEMA] - Ricostruisci la catena logica e normativa (usando i dati del RAG).
[MODULO 3: LE TENSIONI GIURISPRUDENZIALI] - Analizza il dato pretorio (CdS, Cassazione, TAR) trattando le evoluzioni come "fuga interpretativa" o "ritorno all'ordine dogmatico".
[MODULO 4: LA VERIFICA DOGMATICA] - Poni al candidato il tuo "Gancio Socratico".
(IMPORTANTE: Dopo aver generato fino al Modulo 4, fermati e attendi SEMPRE la risposta dello studente. Solo nel tuo turno di risposta successivo attiverai il modulo finale:)
[MODULO 5: DEBRIEFING] - Analizza la risposta dello studente. Smonta i suoi eventuali errori logici, correggi implacabilmente il suo linguaggio, e fissa la sintesi del principio di diritto risolutore.\r
\r
📋 SFRUTTAMENTO SCHEDE VIP: Se il RAG restituisce documenti strutturati in 7-8 sezioni (Fatto, Contrasto, Massima, Ratio, Obiter, Spendibilità, Tags, Rete Sistematica), utilizza la Sezione 2 (Contrasto Giurisprudenziale) come base per il Gancio Socratico nel Modulo 4: "La Cassazione ha accolto la Tesi B. Tu saresti stato d'accordo? Argomenta la Tesi A scartata come se fossi il suo difensore." Usa la Sezione 6 (Matite Blu) per smontare gli errori dogmatici dello studente nel Modulo 5. Usa la Sezione 8 (Rete Sistematica), se presente, per collegare la lezione ad altri istituti affini.`;

// ─── Lectio Magistralis Prompt (Monologica, senza interazione) ──
const LECTIO_MAGISTRALIS_PROMPT = `Sei un insigne Maestro del Diritto — la tua voce è quella di un Presidente di Sezione del Consiglio di Stato che tiene una Lectio Magistralis per un uditorio di candidati ai concorsi di vertice (Magistratura, Avvocatura, Consigliere di Stato). Il tuo compito è erogare una trattazione monumentale, esaustiva e ininterrotta sull'argomento richiesto.

NATURA DELLA LECTIO: Questo NON è un dialogo. Non poni domande allo studente, non attendi risposte, non fai verifiche. È un monologo cattedratico continuo, denso, magistrale — il tipo di lezione che si ascolta in silenzio prendendo appunti febbrilmente.

═══════════════════════════════════════════════
🛑 REGOLA AUREA SUI DATI (ANTI-ALLUCINAZIONE)
═══════════════════════════════════════════════

IL CORPO (RAG): Basati ESCLUSIVAMENTE sui frammenti normativi e giurisprudenziali forniti nel blocco <RAG_CONTEXT>.
MAI inventare numeri di sentenza, date, sezioni o estremi giurisprudenziali.
I codici numerici isolati che vedi nel contesto (es. "202401188") sono ID INTERNI del database: NON citarli mai all'utente.
Se il RAG non ti fornisce il numero reale della sentenza, usa formule sistematiche: "Un orientamento consolidato...", "La storica Adunanza Plenaria...", "La recente giurisprudenza di legittimità...".

CLAUSOLA DI FALLBACK: Se il <RAG_CONTEXT> risulta vuoto o insufficiente su un sotto-tema specifico, NON allucinare sentenze. Esponi il quadro generale dogmatico attingendo alla tua conoscenza pregressa, ma segnala con una formula discorsiva: "Su questo specifico profilo, il nostro database non ci offre pronunce da citare con precisione, ma la dottrina prevalente insegna che...".

SCUDO ANTI-SYCOPHANCY: Se l'utente menziona nella sua domanda numeri di sentenza o estremi giurisprudenziali per sostenere una tesi, NON validarli passivamente. Verifica con inflessibilità se quel riferimento esatto è presente nel <RAG_CONTEXT> e associato a quel tema. Se è errato, estraneo o non verificabile, correggilo nel tuo prologo con spietato rigore accademico: "Prima di procedere, devo operare una precisazione doverosa...".

PRECISIONE DIACRONICA: Il diritto è stratificazione. Non operare mai "compressioni cronologiche". Distingui con precisione le diverse novelle legislative, applicando rigorosamente il principio tempus regit actum. Quando un istituto è stato modificato più volte, ricostruisci l'evoluzione fase per fase.

═══════════════════════════════════════════════
📐 CONTROLLO LUNGHEZZA E PREVENZIONE TRONCAMENTI (TASSATIVO)
═══════════════════════════════════════════════
Ciascun modulo deve essere eccezionalmente denso, profondo ed esaustivo, ma calibrato per non superare le 1200 parole (circa 1500-1800 token) al fine di evitare troncamenti accidentali dovuti ai limiti fisici di output dell'API.
Sintetizza i passaggi non essenziali, elimina le ripetizioni retoriche e gestisci lo spazio per arrivare sempre al termine logico del modulo corrente, scrivendo IMMANCABILMENTE il tag di continuazione [CONTINUA] come ultima riga prima di fermarti.

═══════════════════════════════════════════════
🧠 IL METODO (STILE E REGISTRO)
═══════════════════════════════════════════════

REGISTRO: Autorevole, speculativo, ma con sintassi colloquiale. Simula il parlato di una grande lezione magistrale: usa un "Noi" inclusivo o rivolgiti all'uditorio con "Voi". Anticipa le obiezioni con domande retoriche ("Ora, voi mi direte: ma se la regola dice X, come si concilia con Y?"). Il tuo monologo deve avere il ritmo di chi parla dall'alto di una cattedra, non di chi scrive un manuale.

VINCOLO DI PROSA: È SEVERAMENTE VIETATO usare elenchi puntati, bullet point o numerazioni a cascata. Scrivi in prosa accademica continua, densa, con paragrafi lunghi e ben concatenati. Le eventuali enumerazioni devono essere discorsive ("In primo luogo...", "Sotto un secondo e decisivo profilo...", "V'è poi un terzo ordine di considerazioni...").

LESSICO OBBLIGATORIO: Inserisci organicamente nel discorso questi termini — Aporia, forzatura concettuale, filtro selettivo, anello intermedio, vulnus, ratio, contemperamento, fuga — e verbi come: obliterare, circoscrivere, sussumere, preordinare, vanificare, elidere.

CLAUSOLA DI EQUILIBRIO STILISTICO: Usa questo lessico tecnico con parsimonia e precisione chirurgica, solo dove la materia lo richiede. La vera autorevolezza risiede nella chiarezza concettuale, non nell'accumulo retorico. Se un termine tecnico appare tre volte nello stesso paragrafo, stai esagerando.

L'INCIPIT: Non iniziare MAI con una definizione da manuale. Parti isolando immediatamente il "problema", il paradosso o l'aporia generata dalla norma.

LA DIALETTICA DEI PERCHÉ: Usa domande retoriche per scandire il ritmo del monologo e creare dissonanza cognitiva ("Ma allora, se il sistema già prevedeva X, perché il legislatore ha sentito il bisogno di codificare Y?").

DIMOSTRAZIONE PER ASSURDO: Quando illustri un contrasto di tesi, mostra come l'adozione della premessa errata porti logicamente a conseguenze insostenibili per il sistema.

LA GIURISPRUDENZA COME "CRISI": Spiega i contrasti giurisprudenziali come "fughe" o "forzature" nate dalla necessità pratica di tutelare un interesse non codificato, prima che il sistema trovi il suo riequilibrio.

═══════════════════════════════════════════════
🏗 PRINCIPIO DI ESAUSTIVITÀ
═══════════════════════════════════════════════

Il tuo obiettivo è NON LASCIARE ZONE D'OMBRA. Per ogni istituto, per ogni distinzione concettuale, per ogni contrasto giurisprudenziale, chiediti: "Ho sviscerato questo punto fino al suo esaurimento logico?"

Per espandere il discorso in modo UTILE:
— Parallelismi con istituti affini
— Ricostruzioni diacroniche dettagliate
— Analisi delle ricadute logiche di ciascuna tesi
— Raccordi con principi costituzionali e sovranazionali
— Casistica concreta che illustri i problemi applicativi
— Cross-references con moduli precedenti ("Come abbiamo visto trattando l'inquadramento sistematico...")

ANCORAGGIO OPERATIVO: Ogni sviluppo dogmatico deve periodicamente ricongiungersi al terreno concreto. Non permettere mai che il discorso si arresti nella pura astrazione sistematica: dopo ogni passaggio teorico, chiediti "e in pratica, questo cosa comporta?" — e rispondi in termini di conseguenze processuali (riparto, legittimazione, termini, onere della prova), problemi applicativi reali, casi limite e ricadute sulla tutela effettiva del privato. Il candidato ai concorsi deve saper tradurre ogni principio in un atto difensivo, in una sentenza, in una strategia processuale.\r
\r
═══════════════════════════════════════════════\r
📋 SFRUTTAMENTO DELLE SCHEDE VIP STRUTTURATE\r
═══════════════════════════════════════════════\r
\r
Alcuni documenti nel RAG sono "Schede VIP" — dossier giurisprudenziali ad alta densità strutturati in 7-8 sezioni. Quando li trovi nel contesto, SFRUTTALI come segue:\r
— Sezione 2 (Contrasto Giurisprudenziale): È il tuo materiale dialettico primario per il Modulo 3. Esponi la tesi scartata con pari dignità argomentativa prima di smontarla con la ratio decidendi. Usa la tecnica della "dimostrazione per assurdo" sulla tesi minoritaria.\r
— Sezione 4 (Ratio Decidendi): Estraila e sviscerala nel Modulo 4 come "il nucleo vincolante" — il ragionamento logico-giuridico che l'uditorio deve interiorizzare.\r
— Sezione 5 (Obiter Dicta): Usali nel Modulo 5 come spunti prospettici per la visione di sistema — aperture a scenari futuri o frizioni sistematiche ancora irrisolte.\r
— Sezione 6 (Spendibilità / Matite Blu): Incorpora gli errori dogmatici segnalati come ammonimenti all'uditorio ("Attenzione: chi qualifica questo istituto come X incorre in un errore fatale...").\r
— Sezione 8 (Rete Sistematica): Se presente, usa i cross-link per costruire catene argomentative tra pronunce diverse, mostrando l'evoluzione dell'orientamento nel tempo — questo è il vero valore aggiunto della tua Lectio.

═══════════════════════════════════════════════
🏛 STRUTTURA DELLA LECTIO (5 MACRO-MODULI)
═══════════════════════════════════════════════

Sviluppa il monologo seguendo questa scansione. Trattali come BINARI MENTALI: adatta la proporzione alla materia.

⚠️ ISTRUZIONE OPERATIVA: Genera UN MODULO ALLA VOLTA. Alla fine di ogni modulo (tranne l'ultimo), scrivi su una riga separata:
[CONTINUA — MODULO X: titolo del prossimo modulo]
Nel MODULO 5, chiudi in modo definitivo senza tag di continuazione.

**MODULO 1 — L'APORIA SISTEMATICA E L'INQUADRAMENTO**
Isola il paradosso iniziale. Mostra come la norma, letta in modo piatto, crei un vicolo cieco logico. Poni le fondamenta illustrando la tensione tra i principi costituzionali in gioco. Contestualizza l'istituto nel suo sotto-sistema. Anticipa le tensioni che verranno sviluppate nei moduli successivi.

**MODULO 2 — L'ARCHITETTURA DOGMATICA E DIACRONICA**
Ricostruisci le basi normative con distinzioni concettuali nette. Spiega la ratio profonda. Illustra l'evoluzione storica senza compressioni: perché il legislatore è dovuto intervenire, cosa non funzionava prima, quale lacuna ha generato la necessità di una nuova disciplina.

**MODULO 3 — LE TENSIONI E LE FUGHE GIURISPRUDENZIALI**
Analizza l'evoluzione pretoria con rigore cronologico. Mostra le "forzature concettuali" o "fughe interpretative" dei giudici per colmare lacune. Spiega minutamente le ragioni dietro a questi tentativi. I contrasti non sono errori: sono sintomi di tensioni irrisolte nel sistema.

**MODULO 4 — IL PUNTO DI CADUTA NOMOFILATTICO**
Illustra la soluzione definitiva (SS.UU., Adunanza Plenaria, Corte Cost., o nuovo dato normativo). Spiega passaggio logico dopo passaggio logico perché ricompone l'aporia. Se il contrasto è ancora aperto, dillo esplicitamente e illustra verso quale soluzione tende.

**MODULO 5 — COROLLARI APPLICATIVI E VISIONE DI SISTEMA**
Sintetizza le ricadute operative. Illustra i profili processuali. Poi innalza il discorso alla teoria generale — Stato di diritto, rapporto autorità-libertà, legalità vs certezza. Chiudi con un principio di diritto risolutore formulato come massima della Cassazione. Non concludere con saluti o formule di commiato.`;

// ─── Controller ───────────────────────────────────────────────
export const LezioneController = {
    currentModule: 0,
    isLectio: false,        // true = Lectio Magistralis (monologica), false = Socratica
    autoGenerating: false,  // true = auto-continuation in corso
    isSpeaking: false,
    synth: window.speechSynthesis || null,

    /**
     * Avvia una lezione partendo dalla traccia selezionata nel Briefing.
     * Pre-compila argomento e materia dalla traccia corrente.
     */
    startFromTraccia: function() {
        // --- GATE: Ospiti devono registrarsi ---
        if (!Metering.requireRegistration('Lezione Magistrale')) return;

        var traccia = AppState.currentSimulationTask;
        if (!traccia) return;

        // Salva il contesto della traccia per il ritorno post-lezione
        AppState.lezioneFromTraccia = true;

        // Estrai argomento dalla traccia
        var argomento = traccia.testo;
        // Se la traccia è molto lunga, prendi solo le prime 200 parole
        if (argomento.length > 800) {
            argomento = argomento.substring(0, 800) + '...';
        }
        var materia = 'Diritto ' + (traccia.materia || 'Civile');

        // Pre-popola lo stato e naviga alla pagina lezione
        AppState.lezioneChat = [];
        AppState.lezioneMeta = {
            argomento: argomento,
            materia: materia,
            livello: 'avanzato', // chi fa il tema è già avanzato
            fromTraccia: true,
            tracciaOriginale: traccia
        };

        // Naviga alla pagina lezione — la sessione partirà auto
        import('../router.js').then(({ navigateToRoute }) => {
            navigateToRoute('lezione');
            // Dopo che la pagina è renderizzata, avvia automaticamente
            setTimeout(() => this._startAutoFromTraccia(argomento, materia), 300);
        });
    },

    /**
     * Avvio automatico della lezione quando si arriva dalla traccia.
     */
    _startAutoFromTraccia: async function(argomento, materia) {
        // Eliminiamo _showTrialModal. Limiti applicati al numero di interazioni per il tier Free.

        // --- GATE: Free lifetime (una sola volta) ---
        if (Metering.hasUsedFreeLifetime('lezione')) {
            showToast('🔒 Hai già usato la tua anteprima gratuita della Lezione Socratica. Passa al piano Premium!', 'warning');
            setTimeout(() => { if (window.app) window.app.navigate('pricing'); }, 500);
            return;
        }

        // Paywall mensile
        if (!Metering.canUse('tutorChats')) {
            Metering.showPaywall('tutorChats');
            return;
        }

        this.currentModule = 1;

        // Nascondi setup, mostra chat
        document.getElementById('lezione-setup')?.classList.add('hidden');
        document.getElementById('lezione-chat-area')?.classList.remove('hidden');
        this._updateProgressBar(1);

        var userPrompt = `ATTENZIONE: Questa lezione è propedeutica allo svolgimento di un tema d'esame. La traccia che lo studente dovrà svolgere dopo la lezione è la seguente:\n\n"${argomento}"\n\nMateria: ${materia}.\n\nLo studente si è dichiarato di livello avanzato. Calibra la lezione con focus specifico sui profili problematici di QUESTA traccia. Nel Modulo 5, dai consigli specifici su come impostare QUESTO tema, non consigli generici.`;

        this._addMessage('user', `📝 Vorrei una lezione preparatoria alla traccia:\n*"${argomento.substring(0, 200)}..."*`);
        this._showTyping("Analisi della traccia d'esame e preparazione del percorso...");

        var ragContext = await this._fetchRAGContext(argomento, materia);

        try {
            var systemPrompt = LEZIONE_SYSTEM_PROMPT;
            if (ragContext) {
                systemPrompt += `\n\n--- CONTESTO RAG (Dati dal Database Giurisprudenziale) ---\n${ragContext}\n--- FINE CONTESTO RAG ---\nISTRUZIONE CRITICA: Basa la tua lezione PRINCIPALMENTE sulle informazioni contenute nel CONTESTO RAG sopra. Citale esplicitamente quando possibile.`;
            }

            var concorso = AppState.userProfile?.concorso || 'Magistratura';
            if (CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]) {
                systemPrompt += `\nNOTA: Lo studente si prepara per il concorso in ${concorso}. ${CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]}`;
            }

            // Aggiungi istruzione speciale per la lezione da traccia
            systemPrompt += `\n\nISTRUZIONE SPECIALE: Questa lezione è PROPEDEUTICA a un tema d'esame. Al termine del Modulo 5, ricorda allo studente che può tornare al briefing per iniziare la simulazione scrivendo "Sono pronto per il tema".`;

            var response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await _getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'tutorChats',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].LESSON,
                    useRAG: true,
                    materia: materia,
                    ragQuery: this._getExpandedRAGQuery(argomento, 1),
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 4000
                })
            });

            this._hideTyping();
            if (!response.ok) {
                this._addMessage('ai', 'Mi scuso, non riesco a collegarmi al server. Riprovi tra qualche istante.');
                return;
            }

            var data = await response.json();
            var reply = data.choices[0].message.content.trim();

            Metering.consume('tutorChats');
            Metering.consumeFreeLifetime('lezione'); // Segna la socratica come usata per sempre
            this._addMessage('ai', reply);
            this._speakIfEnabled(reply);

        } catch (err) {
            this._hideTyping();
            this._addMessage('ai', 'Errore di connessione.');
            console.error('[Lezione da Traccia] Errore:', err);
        }
    },

    /**
     * Avvia una nuova lezione.
     */
    start: async function() {
        // --- GATE: Ospiti devono registrarsi ---
        if (!Metering.requireRegistration('Lezione Magistrale')) return;

        // Eliminiamo _showTrialModal. Limiti applicati al numero di interazioni per il tier Free.

        var argomento = document.getElementById('lezione-argomento')?.value?.trim();
        var materia = document.getElementById('lezione-materia')?.value;
        var livello = window._lezione_livello || 'principiante';

        if (!argomento) {
            document.getElementById('lezione-argomento')?.classList.add('ring-2', 'ring-red-500');
            setTimeout(() => document.getElementById('lezione-argomento')?.classList.remove('ring-2', 'ring-red-500'), 2000);
            return;
        }

        // Paywall mensile
        if (!Metering.canUse('tutorChats')) {
            Metering.showPaywall('tutorChats');
            return;
        }

        // --- GATE: Free lifetime (una sola volta) ---
        if (Metering.hasUsedFreeLifetime('lezione')) {
            showToast('🔒 Hai già usato la tua anteprima gratuita della Lezione Socratica. Passa al piano Premium!', 'warning');
            setTimeout(() => { if (window.app) window.app.navigate('pricing'); }, 500);
            return;
        }

        // Reset stato
        AppState.lezioneChat = [];
        AppState.lezioneMeta = { argomento, materia, livello };
        this.currentModule = 1;

        // Mostra area chat, nascondi setup
        document.getElementById('lezione-setup')?.classList.add('hidden');
        document.getElementById('lezione-chat-area')?.classList.remove('hidden');
        this._updateProgressBar(1);

        // Costruisci il prompt iniziale con calibrazione livello
        var userPrompt = `Argomento della lezione di oggi: "${argomento}" (Materia: ${materia}).`;
        if (livello === 'avanzato') {
            userPrompt += ` Lo studente dichiara di conoscere già le basi dell'istituto. Comprimi il Modulo 1 e il Modulo 2 e concentra la tua profondità sul Modulo 3 (contrasti giurisprudenziali) e sul Modulo 4 (casi limite).`;
        } else {
            userPrompt += ` Lo studente è alla prima volta su questo argomento. Espandi il Modulo 1 e il Modulo 2 con esempi chiari e linguaggio accessibile.`;
        }

        // Aggiungi messaggio utente alla chat
        this._addMessage('user', `Vorrei una lezione su: **${argomento}** (${materia})`);
        this._showTyping("Preparazione della lezione su misura...");

        // Cerca nel RAG
        var ragContext = await this._fetchRAGContext(argomento, materia);

        // Chiamata API
        try {
            var systemPrompt = LEZIONE_SYSTEM_PROMPT;
            if (ragContext) {
                systemPrompt += `\n\n--- CONTESTO RAG (Dati dal Database Giurisprudenziale) ---\n${ragContext}\n--- FINE CONTESTO RAG ---\nISTRUZIONE CRITICA: Basa la tua lezione PRINCIPALMENTE sulle informazioni contenute nel CONTESTO RAG sopra. Citale esplicitamente quando possibile.`;
            }

            var concorso = AppState.userProfile?.concorso || 'Magistratura';
            if (CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]) {
                systemPrompt += `\nNOTA: Lo studente si prepara per il concorso in ${concorso}. ${CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]}`;
            }

            var response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await _getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'tutorChats',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].LESSON,
                    useRAG: true,
                    materia: materia,
                    ragQuery: this._getExpandedRAGQuery(argomento, 1),
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 4000
                })
            });

            this._hideTyping();

            if (!response.ok) {
                this._addMessage('ai', 'Mi scuso, ma non riesco a collegarmi al server in questo momento. Riprovi tra qualche istante.');
                return;
            }

            var data = await response.json();
            var reply = data.choices[0].message.content.trim();

            Metering.consume('tutorChats');
            Metering.consumeFreeLifetime('lezione'); // Segna la socratica come usata per sempre
            this._addMessage('ai', reply);
            this._speakIfEnabled(reply);

        } catch (err) {
            this._hideTyping();
            this._addMessage('ai', 'Errore di connessione. Verifichi la connessione Internet e riprovi.');
            console.error('[Lezione] Errore:', err);
        }
    },

    /**
     * Avvia una Lectio Magistralis (monologica, senza interazione).
     * Genera il Modulo 1, poi auto-continua fino al Modulo 5.
     */
    startLectio: async function() {
        // --- GATE: Ospiti devono registrarsi ---
        if (!Metering.requireRegistration('Lectio Magistralis')) return;

        // Eliminiamo _showTrialModal. Limiti applicati al numero di interazioni per il tier Free.

        var argomento = document.getElementById('lezione-argomento')?.value?.trim();
        var materia = document.getElementById('lezione-materia')?.value;

        if (!argomento) {
            document.getElementById('lezione-argomento')?.classList.add('ring-2', 'ring-red-500');
            setTimeout(() => document.getElementById('lezione-argomento')?.classList.remove('ring-2', 'ring-red-500'), 2000);
            return;
        }

        // --- GATE: Free lifetime (una sola volta) ---
        if (Metering.hasUsedFreeLifetime('lectio')) {
            showToast('🔒 Hai già usato la tua anteprima gratuita della Lectio Magistralis. Passa al piano Premium!', 'warning');
            setTimeout(() => { if (window.app) window.app.navigate('pricing'); }, 500);
            return;
        }

        // Paywall mensile
        if (!Metering.canUse('tutorChats')) {
            Metering.showPaywall('tutorChats');
            return;
        }

        // Reset stato
        AppState.lezioneChat = [];
        AppState.lezioneMeta = { argomento, materia, livello: 'avanzato', isLectio: true };
        this.currentModule = 1;
        this.isLectio = true;
        this.autoGenerating = true;

        // Mostra area chat, nascondi setup, nascondi input utente
        document.getElementById('lezione-setup')?.classList.add('hidden');
        document.getElementById('lezione-chat-area')?.classList.remove('hidden');
        var inputArea = document.querySelector('#lezione-input-form')?.parentElement;
        if (inputArea) inputArea.style.display = 'none'; // Nascondi input nella lectio
        this._updateProgressBar(1);

        // Messaggio iniziale
        this._addMessage('user', `📖 Lectio Magistralis su: **${argomento}** (${materia})`);
        this._showTyping("Inizializzazione della Lectio Magistralis...");

        var userPrompt = `Argomento della Lectio Magistralis: "${argomento}" (Materia: ${materia}). Genera ora il MODULO 1.`;

        try {
            var systemPrompt = LECTIO_MAGISTRALIS_PROMPT;
            var concorso = AppState.userProfile?.concorso || 'Magistratura';
            if (CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]) {
                systemPrompt += `\nNOTA: L'uditorio si prepara per il concorso in ${concorso}. ${CICERO_EXPERT_SYSTEM.CONCORSI_SPECIFIC[concorso]}`;
            }

            var response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await _getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'tutorChats',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].LESSON,
                    useRAG: true,
                    materia: materia,
                    ragQuery: this._getExpandedRAGQuery(argomento, 1),
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 8000
                })
            });

            this._hideTyping();

            if (!response.ok) {
                var errBody = '';
                try { errBody = await response.text(); } catch(_e) {}
                console.error('[Lectio] Proxy error:', response.status, errBody);
                this._addMessage('ai', `Errore dal server (${response.status}). Dettagli in console.`);
                this.autoGenerating = false;
                return;
            }

            var data = await response.json();
            var reply = data.choices[0].message.content.trim();

            Metering.consume('tutorChats');
            Metering.consumeFreeLifetime('lectio'); // Segna la lectio come usata per sempre
            this._addMessage('ai', reply);
            this.currentModule = 1;
            this._updateProgressBar(1);

            // Analizza la risposta per mostrare il pulsante per il modulo successivo o completare!
            this._handleLectioResponse(reply);

        } catch (err) {
            this._hideTyping();
            this._addMessage('ai', 'Errore di connessione.');
            this.autoGenerating = false;
            console.error('[Lectio] Errore:', err);
        }
    },

    /**
     * Gestisce la risposta del modulo Lectio Magistralis.
     * Analizza la continuazione e renderizza un pulsante di avanzamento manuale.
     */
    _handleLectioResponse: function(reply) {
        // Controllo per tier Free: blocca la Lectio dopo il modulo 2
        var tier = Metering._getTier();
        if (tier === 'Free' && this.currentModule >= 2) {
            console.log('[Lectio] ✅ Bloccata al Modulo 2 per utente Free.');
            var paywallMsg = Metering.showFreePaywall('lectio');
            this._addMessage('ai', paywallMsg);
            this._showListenButton();
            
            var container = document.getElementById('lezione-messages');
            if (container) {
                container.innerHTML += `<div class="flex justify-center mt-4 mb-6 fade-in">
                    <button onclick="app.navigate('pricing')" class="px-6 py-3 bg-gradient-to-r from-magis-700 to-magis-600 hover:from-magis-600 hover:to-magis-500 text-white rounded-xl font-bold flex items-center gap-2 transition hover:scale-105">
                        <i data-lucide="unlock" class="w-5 h-5"></i> Sblocca la Lezione Completa
                    </button>
                </div>`;
            }
            return;
        }

        // Cerca il tag di continuazione
        var continuaMatch = reply.match(/\[CONTINUA\s*[—–-]\s*MODULO\s*(\d+)\s*:\s*(.+?)\]/i);
        
        var nextModNum;
        var nextModTitle;
        
        if (continuaMatch) {
            nextModNum = parseInt(continuaMatch[1]);
            nextModTitle = continuaMatch[2].trim();
        } else if (this.currentModule < 5) {
            // FALLBACK ROBUSTO: Se il tag manca o la risposta è stata troncata a causa del limite di token,
            // autodetectiamo il modulo successivo per continuare in autonomia senza bloccarsi.
            nextModNum = this.currentModule + 1;
            const fallbackTitles = {
                2: "L'ARCHITETTURA DOGMATICA E DIACRONICA",
                3: "LE TENSIONI E LE FUGHE GIURISPRUDENZIALI",
                4: "IL PUNTO DI CADUTA NOMOFILATTICO",
                5: "COROLLARI APPLICATIVI E VISIONE DI SISTEMA"
            };
            nextModTitle = fallbackTitles[nextModNum] || "Modulo successivo";
            console.warn(`[Lectio] ⚠️ Tag [CONTINUA] mancante o troncato a Modulo ${this.currentModule}. Fallback automatico.`);
        } else {
            // Lectio completata (Modulo 5 o nessun tag alla fine)
            this._updateProgressBar(5);
            console.log('[Lectio] ✅ Completata! Tutti i moduli generati.');
            this._showListenButton();
            // Mostra input per domande post-lectio
            var inputArea = document.querySelector('#lezione-input-form')?.parentElement;
            if (inputArea) inputArea.style.display = '';
            return;
        }

        // Mostra il pulsante per far progredire il modulo manualmente
        var container = document.getElementById('lezione-messages');
        if (container) {
            container.innerHTML += `
            <div class="flex justify-center my-6 fade-in lp-continue-block">
                <button onclick="window.Lezione?.generateLectioModule(${nextModNum}, '${nextModTitle.replace(/'/g, "\\'")}')" 
                    class="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/20 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all transform hover:scale-[1.03] cursor-pointer">
                    <svg class="w-4 h-4 animate-bounce-horizontal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    Eroga Modulo ${nextModNum}: ${nextModTitle}
                </button>
            </div>`;
            container.scrollTop = container.scrollHeight;
            lucide.createIcons();
        }
    },

    /**
     * Eroga un singolo modulo Lectio Magistralis in modo manuale.
     */
    generateLectioModule: async function(nextModNum, nextModTitle) {
        // Rimuove blocchi di avanzamento precedenti per evitare disordine visivo
        document.querySelectorAll('.lp-continue-block').forEach(el => el.remove());

        this.currentModule = nextModNum;
        this._updateProgressBar(nextModNum);

        console.log(`[Lectio] Generazione Manuale Modulo ${nextModNum}: ${nextModTitle}`);

        this._showTyping(`Stesura Modulo ${nextModNum}: ${nextModTitle}...`);

        try {
            // Ricostruisci la conversazione completa per mantenere contesto
            var messages = [
                { role: 'system', content: LECTIO_MAGISTRALIS_PROMPT }
            ];

            // Aggiungi gli ultimi 20 messaggi precedenti per contesto coerente
            var chatSlice = AppState.lezioneChat.slice(-20);
            chatSlice.forEach(msg => {
                messages.push({
                    role: msg.role === 'ai' ? 'assistant' : 'user',
                    content: msg.content
                });
            });

            // Chiedi esplicitamente il prossimo modulo
            messages.push({
                role: 'user',
                content: `Prosegui con il **MODULO ${nextModNum}: ${nextModTitle}**. Mantieni lo stesso registro e la stessa profondità. Ricorda: genera SOLO questo modulo, poi inserisci il tag [CONTINUA] per il successivo (o chiudi definitivamente se è il Modulo 5).`
            });

            var response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await _getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'tutorChats',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].LESSON,
                    useRAG: true,
                    materia: AppState.lezioneMeta?.materia || null,
                    ragQuery: this._getExpandedRAGQuery(AppState.lezioneMeta?.argomento, nextModNum),
                    messages: messages,
                    temperature: 0.5,
                    max_tokens: 8000
                })
            });

            this._hideTyping();

            if (!response.ok) {
                var errBody = '';
                try { errBody = await response.text(); } catch(_e) {}
                console.error('[Lectio] Modulo continuazione manuale errore:', response.status, errBody);
                this._addMessage('ai', `Errore nella generazione del modulo successivo (${response.status}). Riprova tra qualche istante.`);
                return;
            }

            var data = await response.json();
            var reply = data.choices[0].message.content.trim();

            Metering.consume('tutorChats');
            this._addMessage('ai', reply);

            // Analizza la risposta per mostrare il pulsante del modulo successivo o chiudere
            this._handleLectioResponse(reply);

        } catch (err) {
            this._hideTyping();
            this._addMessage('ai', 'Errore durante la generazione del modulo.');
            console.error(`[Lectio] Errore modulo ${nextModNum}:`, err);
        }
    },

    sendMessage: async function(e) {
        if (e) e.preventDefault();
        var input = document.getElementById('lezione-user-input');
        if (!input) return;

        var text = input.value.trim();
        if (!text) return;
        input.value = '';

        // Paywall
        if (!Metering.canUse('tutorChats')) {
            Metering.showPaywall('tutorChats');
            return;
        }

        // Detect se sta chiedendo di avanzare
        var isAdvance = /avanti|prosegu|prossimo modulo|continua|vai avanti|next/i.test(text);
        if (isAdvance && this.currentModule < 5) {
            this.currentModule++;
            this._updateProgressBar(this.currentModule);
        }

        // Controllo interazioni per Lezione Socratica (Free Tier)
        // L'utente Free ha diritto a 2 turni di dialogo (2 domande + 2 risposte AI)
        var tier = Metering._getTier();
        if (tier === 'Free' && !this.isLectio) {
            // Conta quante volte l'utente ha scritto (escludendo il prompt iniziale generato dal sistema)
            var userMsgCount = AppState.lezioneChat.filter(m => m.role === 'user').length;
            // Il primo messaggio user è il prompt iniziale ("Vorrei una lezione su...").
            // Quindi l'utente può mandare 2 messaggi manuali aggiuntivi (turni 2 e 3).
            // Al 3° messaggio manuale (indice 3 nel conteggio totale) blocchiamo.
            if (userMsgCount >= 3) {
                this._addMessage('user', text);
                var paywallMsg = Metering.showFreePaywall('lezione');
                this._addMessage('ai', paywallMsg);
                var container = document.getElementById('lezione-messages');
                if (container) {
                    container.innerHTML += `<div class="flex justify-center mt-4 mb-6 fade-in">
                        <button onclick="app.navigate('pricing')" class="px-6 py-3 bg-gradient-to-r from-magis-700 to-magis-600 hover:from-magis-600 hover:to-magis-500 text-white rounded-xl font-bold flex items-center gap-2 transition hover:scale-105">
                            <i data-lucide="unlock" class="w-5 h-5"></i> Sblocca Lezioni Illimitate
                        </button>
                    </div>`;
                    container.scrollTop = container.scrollHeight;
                }
                return;
            }
        }

        this._addMessage('user', text);
        this._showTyping();

        // Ricostruisci conversazione per l'API — usa il prompt giusto in base alla modalità
        var activePrompt = this.isLectio ? LECTIO_MAGISTRALIS_PROMPT : LEZIONE_SYSTEM_PROMPT;
        var messages = [
            { role: 'system', content: activePrompt }
        ];

        // Aggiungi il RAG al primo system message se disponibile
        if (AppState.lezioneMeta?._ragContext) {
            messages[0].content += `\n\n--- CONTESTO RAG ---\n${AppState.lezioneMeta._ragContext}\n--- FINE CONTESTO RAG ---`;
        }

        // Ricostruisci la chat completa (ultimi 20 messaggi per evitare token overflow)
        var chatSlice = AppState.lezioneChat.slice(-20);
        chatSlice.forEach(msg => {
            messages.push({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.content
            });
        });

        try {
            var response = await fetch('/api/proxy', {
                method: 'POST',
                headers: await _getAuthHeaders(),
                body: JSON.stringify({
                    feature: 'tutorChats',
                    provider: APP_CONFIG.ACTIVE_AI_STACK,
                    model: APP_CONFIG.AI_MODELS[APP_CONFIG.ACTIVE_AI_STACK].LESSON,
                    useRAG: true,
                    materia: AppState.lezioneMeta?.materia || null,
                    ragQuery: this._getExpandedRAGQuery(AppState.lezioneMeta?.argomento, this.currentModule || 1),
                    messages: messages,
                    temperature: 0.5,
                    max_tokens: 4000
                })
            });

            this._hideTyping();

            if (!response.ok) {
                this._addMessage('ai', 'Mi scuso, si è verificato un errore nella connessione.');
                return;
            }

            var data = await response.json();
            var reply = data.choices[0].message.content.trim();

            Metering.consume('tutorChats');
            this._addMessage('ai', reply);
            this._speakIfEnabled(reply);

            // Auto-detect quale modulo sta trattando dalla risposta
            this._autoDetectModule(reply);

        } catch (err) {
            this._hideTyping();
            this._addMessage('ai', 'Errore di connessione.');
            console.error('[Lezione] Errore:', err);
        }
    },

    /**
     * Quick action buttons.
     */
    quickAction: function(text) {
        var input = document.getElementById('lezione-user-input');
        if (input) {
            input.value = text;
            this.sendMessage(new Event('submit'));
        }
    },

    /**
     * Apre il Lecture Player full-screen (audio + slide).
     */
    openLectureMode: function() {
        if (!AppState.lezioneChat || AppState.lezioneChat.length === 0) return;
        
        // Estrai solo i messaggi AI (i moduli della lezione)
        var moduleTexts = AppState.lezioneChat
            .filter(m => m.role === 'ai')
            .map(m => m.content);
        
        if (moduleTexts.length === 0) return;
        
        var argomento = AppState.lezioneMeta?.argomento || 'Lezione';
        var materia = AppState.lezioneMeta?.materia || 'Civile';
        
        import('../views/lecture-player.js').then(({ openLecturePlayer }) => {
            openLecturePlayer(moduleTexts, argomento, materia);
        });
    },

    /**
     * Mostra il pulsante "Ascolta la Lezione" nella chat.
     */
    _showListenButton: function() {
        var container = document.getElementById('lezione-messages');
        if (!container) return;
        
        container.innerHTML += `
        <div class="flex justify-center my-6 fade-in">
            <button onclick="window.Lezione?.openLectureMode()" 
                class="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-amber-500/30 flex items-center gap-3 transition hover:scale-105 group">
                <svg class="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>
                🎧 Ascolta la Lezione
            </button>
        </div>`;
        container.scrollTop = container.scrollHeight;
    },

    /**
     * Reset per nuova lezione.
     */
    reset: function() {
        AppState.lezioneChat = [];
        AppState.lezioneMeta = null;
        this.currentModule = 0;
        this.isLectio = false;
        this.autoGenerating = false;
        this.stopSpeaking();

        document.getElementById('lezione-setup')?.classList.remove('hidden');
        document.getElementById('lezione-chat-area')?.classList.add('hidden');
        var msgs = document.getElementById('lezione-messages');
        if (msgs) msgs.innerHTML = '';
        // Ripristina input area (potrebbe essere nascosta dalla Lectio)
        var inputArea = document.querySelector('#lezione-input-form')?.parentElement;
        if (inputArea) inputArea.style.display = '';
    },

    /**
     * Toggle TTS.
     */
    toggleSpeech: function() {
        if (this.isSpeaking) {
            this.stopSpeaking();
        }
    },

    stopSpeaking: function() {
        if (this.synth) {
            this.synth.cancel();
            this.isSpeaking = false;
        }
    },

    // ─── Private Methods ─────────────────────────────────────────

    _addMessage: function(role, content) {
        var msg = { role: role, content: content, id: 'lez-' + Date.now() };
        if (!AppState.lezioneChat) AppState.lezioneChat = [];
        AppState.lezioneChat.push(msg);

        var container = document.getElementById('lezione-messages');
        if (!container) return;

        var formatted = escapeHtml(content)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br/>');

        // Determina se è un messaggio di "attesa" (non ha senso leggerlo ad alta voce)
        var isWaitMsg = content.includes('Tempo stimato:') || content.includes('Preparazione della');

        if (role === 'user') {
            container.innerHTML += `
            <div class="flex flex-col max-w-[85%] ml-auto items-end">
                <div class="bg-amber-600/90 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-md">
                    <p class="text-sm">${formatted}</p>
                </div>
            </div>`;
        } else {
            var ttsBtn = '';
            if (!isWaitMsg) {
                ttsBtn = `
                <div class="mt-4 pt-3 border-t border-gray-700/30">
                    <button onclick="window.Lezione?._playMessageTTS(this, '${msg.id}')" 
                        class="tts-msg-btn w-full flex items-center justify-center gap-2 text-sm font-semibold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 hover:border-amber-400/60 transition-all duration-200 px-4 py-2.5 rounded-xl group"
                        title="Ascolta questo messaggio">
                        <svg class="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
                        <span>🎧 Ascolta questo modulo</span>
                    </button>
                </div>`;
            }
            container.innerHTML += `
            <div class="flex gap-3 max-w-[95%]">
                <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-tr from-amber-600 to-orange-500 mt-1 shadow-lg shadow-amber-500/20">
                    <i data-lucide="graduation-cap" class="w-4 h-4 text-white"></i>
                </div>
                <div class="bg-gray-800/80 border border-gray-700/50 text-gray-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-md relative leading-relaxed text-sm format-content">
                    ${formatted}
                    ${ttsBtn}
                </div>
            </div>`;
        }

        lucide.createIcons();
        container.scrollTop = container.scrollHeight;
    },

    /**
     * Riproduce il TTS di un singolo messaggio AI.
     * @param {HTMLElement} btn - Il bottone cliccato
     * @param {string} msgId - L'ID del messaggio
     */
    _playMessageTTS: async function(btn, msgId) {
        // Trova il messaggio
        var msg = (AppState.lezioneChat || []).find(m => m.id === msgId);
        if (!msg) return;

        var spanEl = btn.querySelector('span');
        var state = btn.dataset.ttsState || 'idle'; // idle | loading | playing | paused

        // === PAUSA (sta suonando → metti in pausa) ===
        if (state === 'playing') {
            if (window._currentTtsAudio) {
                window._currentTtsAudio.pause();
            }
            btn.dataset.ttsState = 'paused';
            spanEl.textContent = '▶️ Riprendi';
            btn.classList.remove('text-amber-400');
            btn.classList.add('text-blue-400');
            return;
        }

        // === RIPRENDI (era in pausa → riprendi da dove eravamo) ===
        if (state === 'paused' && window._currentTtsAudio && window._currentTtsBtn === btn) {
            window._currentTtsAudio.play();
            btn.dataset.ttsState = 'playing';
            spanEl.textContent = '⏸ Pausa';
            btn.classList.remove('text-blue-400');
            btn.classList.add('text-amber-400');
            return;
        }

        // === PLAY (prima volta o da un altro messaggio) ===

        // Ferma eventuale audio precedente di un ALTRO messaggio
        if (window._currentTtsAudio) {
            window._currentTtsAudio.pause();
            window._currentTtsAudio = null;
            // Reset bottone precedente
            if (window._currentTtsBtn && window._currentTtsBtn !== btn) {
                window._currentTtsBtn.dataset.ttsState = 'idle';
                var prevSpan = window._currentTtsBtn.querySelector('span');
                if (prevSpan) prevSpan.textContent = '🎧 Ascolta questo modulo';
                window._currentTtsBtn.classList.remove('text-amber-400', 'text-blue-400', 'text-green-500');
                window._currentTtsBtn.classList.add('text-amber-300');
            }
        }

        btn.dataset.ttsState = 'loading';
        spanEl.textContent = '⏳ Caricamento audio...';
        btn.classList.add('animate-pulse');

        try {
            var { getAuthHeaders } = await import('../api/helpers.js');
            var headers = await getAuthHeaders();

            // Pulisci il testo per il TTS
            var cleanText = msg.content
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/#{1,6}\s*/g, '')
                .replace(/\[CONTINUA[^\]]*\]/g, '')
                .replace(/---/g, '')
                .replace(/⏳|🕐|📝|📖|🎧/g, '')
                .trim();

            if (cleanText.length > 5000) cleanText = cleanText.substring(0, 5000);

            var response = await fetch('/api/tts', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    text: cleanText,
                    voice: 'it-IT-GiuseppeNeural',
                    rate: '-5%'
                })
            });

            if (!response.ok) throw new Error('TTS error ' + response.status);

            var blob = await response.blob();
            var audioUrl = URL.createObjectURL(blob);
            var audio = new Audio(audioUrl);

            window._currentTtsAudio = audio;
            window._currentTtsBtn = btn;
            btn.dataset.ttsState = 'playing';
            btn.classList.remove('animate-pulse');
            spanEl.textContent = '⏸ Pausa';
            btn.classList.remove('text-amber-300');
            btn.classList.add('text-amber-400');

            audio.onended = function() {
                btn.dataset.ttsState = 'idle';
                spanEl.textContent = '🔁 Riascolta';
                btn.classList.remove('text-amber-400');
                btn.classList.add('text-green-500');
                URL.revokeObjectURL(audioUrl);
                window._currentTtsAudio = null;
                window._currentTtsBtn = null;
            };

            audio.play();

        } catch(e) {
            console.error('[TTS] Errore:', e);
            btn.dataset.ttsState = 'idle';
            btn.classList.remove('animate-pulse');
            spanEl.textContent = '❌ Errore TTS';
            btn.classList.add('text-red-400');
            setTimeout(() => { 
                spanEl.textContent = '🎧 Ascolta questo modulo'; 
                btn.classList.remove('text-red-400'); 
                btn.classList.add('text-amber-300'); 
            }, 3000);
        }
    },

    _showTyping: function(customLabel) {
        var container = document.getElementById('lezione-messages');
        if (!container) return;
        
        this._hideTyping();

        var title = customLabel || (this.isLectio ? `Stesura Modulo ${this.currentModule} in corso...` : "Il Maestro sta elaborando...");
        
        container.innerHTML += `
        <div id="lezione-typing" class="flex gap-3 max-w-[95%] fade-in">
            <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-tr from-amber-600 to-orange-500 mt-1 shadow-lg shadow-amber-500/20">
                <i data-lucide="graduation-cap" class="w-4 h-4 text-white"></i>
            </div>
            <div class="bg-gray-800/80 border border-gray-700/50 text-gray-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-md relative leading-relaxed text-sm w-full md:max-w-md">
                <div class="flex items-center justify-between mb-2">
                    <span class="font-bold text-amber-400 flex items-center gap-2">
                        <svg class="animate-spin w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ${title}
                    </span>
                    <span id="lezione-typing-pct" class="text-xs font-mono text-gray-400">0%</span>
                </div>
                
                <p id="lezione-typing-status" class="text-xs text-gray-400 mb-3 italic">Inizializzazione della sessione...</p>
                
                <div class="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                    <div id="lezione-typing-bar" class="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
                
                <div class="mt-2 text-[10px] text-gray-500 flex justify-between">
                    <span>Tempo stimato: 30-45s per modulo</span>
                    <span>Non chiudere la pagina</span>
                </div>
            </div>
        </div>`;
        
        lucide.createIcons();
        container.scrollTop = container.scrollHeight;

        this._startTypingProgress();
    },

    _startTypingProgress: function() {
        this._stopTypingProgress();
        
        var bar = document.getElementById('lezione-typing-bar');
        var pctEl = document.getElementById('lezione-typing-pct');
        var statusEl = document.getElementById('lezione-typing-status');
        if (!bar || !pctEl || !statusEl) return;

        var start = Date.now();
        var duration = 40000; // 40 secondi per raggiungere il 95%
        
        var statuses = [
            { pct: 0, text: "Consultazione del database giurisprudenziale (RAG)..." },
            { pct: 20, text: "Analisi sistematica e inquadramento dei principi..." },
            { pct: 45, text: "Sintesi dei contrasti ed elaborazione della ratio decidendi..." },
            { pct: 70, text: "Stesura accademica e calibrazione dello stile magistrale..." },
            { pct: 90, text: "Rifinitura finale e apposizione dei tag di continuazione..." }
        ];

        this._typingInterval = setInterval(() => {
            var elapsed = Date.now() - start;
            var pct = Math.min((elapsed / duration) * 95, 95);
            
            var barEl = document.getElementById('lezione-typing-bar');
            var pctTextEl = document.getElementById('lezione-typing-pct');
            var statusTextEl = document.getElementById('lezione-typing-status');
            
            if (barEl) barEl.style.width = pct + '%';
            if (pctTextEl) pctTextEl.textContent = Math.round(pct) + '%';
            
            var currentStatus = statuses[0].text;
            for (var i = 0; i < statuses.length; i++) {
                if (pct >= statuses[i].pct) {
                    currentStatus = statuses[i].text;
                }
            }
            if (statusTextEl) statusTextEl.textContent = currentStatus;

        }, 100);
    },

    _stopTypingProgress: function() {
        if (this._typingInterval) {
            clearInterval(this._typingInterval);
            this._typingInterval = null;
        }
    },

    _hideTyping: function() {
        this._stopTypingProgress();
        var el = document.getElementById('lezione-typing');
        if (el) el.remove();
    },

    _updateProgressBar: function(mod) {
        var label = document.getElementById('lezione-modulo-label');
        if (label) label.textContent = `Modulo ${mod} di 5`;

        for (var i = 1; i <= 5; i++) {
            var bar = document.querySelector(`#mod-bar-${i} > div`);
            if (!bar) continue;
            if (i < mod) {
                bar.style.width = '100%';
            } else if (i === mod) {
                bar.style.width = '50%';
            } else {
                bar.style.width = '0%';
            }
        }
    },

    _autoDetectModule: function(text) {
        var lower = text.toLowerCase();
        if (lower.includes('modulo 5') || lower.includes('matite blu') || lower.includes('consigli per il tema')) {
            this.currentModule = 5;
        } else if (lower.includes('modulo 4') || lower.includes('casi limite') || lower.includes('intersezioni')) {
            this.currentModule = 4;
        } else if (lower.includes('modulo 3') || lower.includes('contrast')) {
            this.currentModule = 3;
        } else if (lower.includes('modulo 2') || lower.includes('anatomia')) {
            this.currentModule = 2;
        }
        this._updateProgressBar(this.currentModule);
    },

    /**
     * Cerca nel RAG di Supabase contenuti pertinenti all'argomento.
     */
    _fetchRAGContext: async function(argomento, materia) {
        // Il RAG vettoriale viene iniettato automaticamente dal proxy
        // tramite useRAG:true + materia quando si fa la chiamata principale.
        // La ricerca sulla giustizia amministrativa (provvedimenti_ga) è 
        // temporaneamente disabilitata per timeout su 287k record.
        // Le sentenze CdS sono già presenti nel database vettoriale (rag_chunks).
        
        if (!AppState.lezioneMeta) AppState.lezioneMeta = {};
        AppState.lezioneMeta._ragContext = '';
        return '';
    },

    /**
     * Genera una query RAG espansa e mirata per ciascun modulo specifico
     * per massimizzare la diversità e pertinenza dei frammenti estratti.
     */
    _getExpandedRAGQuery: function(argomento, modNum) {
        if (!argomento) return "";
        const cleanArg = argomento.replace(/["'“”«»]/g, '').trim();
        
        const suffixes = {
            1: "inquadramento sistematico dogmatico principi costituzionali legalità",
            2: "evoluzione storica riforme legislative novità legge diacronica 21-nonies PNRR DDL Semplificazione A.S. 1184 6 mesi",
            3: "contrasto giurisprudenziale Adunanza Plenaria Cassazione Sezioni Unite responsabilità risarcimento danno affidamento gemelle 2021",
            4: "casi speciali eccezioni SCIA edilizia beni culturali Corte Costituzionale 88 2025 Plenaria 8 2017 Plenaria 14 2024",
            5: "profili processuali giurisdizione decadenza vincolata GSE Adunanza Plenaria 18 2020 errori comuni"
        };
        
        return `${cleanArg} ${suffixes[modNum] || ""}`.trim();
    },

    /**
     * Web Speech API per lettura vocale.
     */
    _speakIfEnabled: function(text) {
        // Per ora il TTS è opt-in: l'utente può attivarlo in futuro
        // Lasciamo la struttura pronta
        if (!this.synth || !window._lezione_tts_enabled) return;

        this.stopSpeaking();

        // Pulisci il testo per il TTS
        var cleanText = text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/\n/g, '. ');

        var utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'it-IT';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        // Cerca una voce italiana
        var voices = this.synth.getVoices();
        var italianVoice = voices.find(v => v.lang.startsWith('it'));
        if (italianVoice) utterance.voice = italianVoice;

        this.isSpeaking = true;
        utterance.onend = () => { this.isSpeaking = false; };

        this.synth.speak(utterance);
    }
};
