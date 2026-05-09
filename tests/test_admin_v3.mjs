import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3-flash-preview";

const SENTENZA_TEST = `
L’odierna ricorrente dichiara di essere subentrata alla società la Finint s.g.r., quale soggetto gestore di un fondo immobiliare denominato “AM Sviluppi Immobiliari”.
La Finint s.g.r., in attuazione di una convenzione di lottizzazione, ha realizzato un complesso edilizio all’interno del Comune di Campobasso, in località Vazzieri.
Nel corso dell’edificazione, in virtù di alcune varianti in corso d’opera, è stato necessario richiedere un cambio di destinazione d’uso dei fabbricati, in ragione del quale erano stati corrisposti al Comune, a titolo di oneri di urbanizzazione, importi ammontanti ad oltre 250.000,00 euro.

Già nell’ambito del procedimento di determinazione degli importi dovuti era stato contestato il diritto del Comune di richiedere i predetti oneri e comunque la quantificazione del loro relativo ammontare; tali domande costituivano oggetto di un ricorso dinanzi al Tribunale amministrativo regionale del Molise rubricato sub r.g. n. 243/2015.
Secondo la ricostruzione allegata da parte ricorrente in quel giudizio, il Comune di Campobasso aveva imposto all’originario Fondo immobiliare, e quindi alla ricorrente - subentrata nella gestione della realizzazione del complesso immobiliare -, di versare integralmente, una seconda volta, gli oneri di urbanizzazione, senza scomputare quanto precedentemente già corrisposto, in tal modo conseguendo un’indebita locupletazione.

Da qui la richiesta della società ricorrente di una condanna del Comune alla restituzione delle somme indebitamente percepite. Il ricorso veniva affidato sostanzialmente a due censure...

[... OMETTENDO PER BREVITÀ IL DETTAGLIO DELLE FASI INTERMEDIE ...]

LA DECISIONE SULLA COMPETENZA (Art. 113 c.p.a.)
Con ordinanza n. 278 del 2023 il T.a.r. per il Molise ha dichiarato la propria incompetenza a trattare il giudizio di ottemperanza, ritenendo sussistente, in proposito, la competenza funzionale del Consiglio di Stato. Il Collegio condivide le motivazioni del T.a.r. per cui “va quindi escluso che l’odierno giudizio riguardi la pura e semplice esecuzione della sentenza n. 17/2020 di questo Tribunale, dovendosi invece affermare, ai sensi dell’art. 113, comma 1, 2° periodo del cod. proc. amm., che l’ottemperanza da assicurare debba avere imprescindibile riguardo alla distinta sentenza n. 6668/2019 resa dal Consiglio di Stato, in quanto pronuncia additiva e integrativa della sentenza non definitiva n.114/2018 che era stata emessa in prime cure”.

LA DECISIONE FINALE
In data 14 ottobre 2025 la società ricorrente ha depositato atto di rinuncia al ricorso con richiesta di compensazione delle spese di lite, sottoscritto per accettazione dal difensore del Comune di Campobasso. Tanto premesso il presente giudizio di ottemperanza va dichiarato estinto, ai sensi dell’art. 84 c.p.a.

P.Q.M.
Il Consiglio di Stato in sede giurisdizionale (Sezione Quarta), definitivamente pronunciando sul ricorso, come in epigrafe proposto, dichiara l’estinzione del giudizio di ottemperanza e compensa le spese di giudizio tra le parti
`;

const SYSTEM_PROMPT = `
[R - RUOLO]
Sei un illustre Consigliere di Stato, un severo Commissario del Concorso in Magistratura e un Senior Data Engineer. 

[C - CONTESTO]
Ti verrà fornito in input il testo grezzo di una pronuncia della Giustizia Amministrativa. 

[F - FINALITÀ]
Il tuo obiettivo è fare reverse-engineering della sentenza: devi estrarre le coordinate del potere pubblico esercitato, la pura "Regula Iuris" e la ratio decidendi, trasformando il tutto in una "Scheda Manualistica Oggettiva" ad uso di un sistema RAG.

[VINCOLI TASSATIVI]
1. Data Honesty e Divieto di Copia-Incolla: È SEVERAMENTE VIETATO trascrivere o parafrasare passaggi letterali. Riscrivi tutto da zero con lessico rigoroso.
2. Anonimizzazione Privacy: Ignora e ometti i nomi di persone fisiche.
3. Filtro di Triage e Qualità (MANDATORIO): 
Al termine del blocco <thinking>, devi classificare la pronuncia in una di queste tre categorie e inserire la relativa etichetta nei Metadati:

[TIER_1_TOP]: Usa questa etichetta se la sentenza enuncia un principio di diritto chiaro, risolve un contrasto, o affronta una questione dogmatica/sistematica rilevante. (Procedi con la generazione completa della scheda).

[TIER_2_PROCEDURALE]: Usa questa etichetta se la sentenza NON enuncia un nuovo principio generale, MA contiene comunque un'utile applicazione pratica del rito processuale (es. riparto di giurisdizione, competenza, estinzione) o un fatto storico interessante. (Procedi con la generazione della scheda, focalizzandoti sugli aspetti procedurali).

[SCARTO_ASSOLUTO]: Usa questa etichetta SOLO SE il testo è un mero rinvio di udienza, una correzione di errore materiale o un decreto privo di qualsiasi motivazione giuridica. (In questo caso, fermati qui e non generare la scheda).

--- STRUTTURA DI OUTPUT RICHIESTA ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno, analizza logicamente la sentenza passo dopo passo.

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown:

<thinking>
[Il tuo ragionamento analitico-dogmatico qui]
</thinking>

🧾 METADATI RAG
* Rilevanza: [TIER_1_TOP oppure TIER_2_PROCEDURALE oppure SCARTO_ASSOLUTO]
* Giudice: [es. Consiglio di Stato, Sez. IV / Adunanza Plenaria]
* Materia/Area: [es. Edilizia, Appalti, Pubblico Impiego]
* Tipo Rito: [es. Rito Appalti, Rito Ordinario, Giudizio di Ottemperanza]

1. Il Fatto Storico, il Potere Esercitato e la Giurisdizione
2. Il Nodo Ermeneutico e l'Evoluzione Dogmatica
3. Il Principio di Diritto (La Massima)
4. Ratio Decidendi e Profili Sistematici
5. Spendibilità Concorsuale
6. Tags
`;

async function test() {
    console.log("Invio a Gemini 3 Flash Preview (TEST TRIAGE)...");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL_NAME + ":generateContent?key=" + API_KEY;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: "Analizza questa sentenza secondo le regole di Triage:\n\n" + SENTENZA_TEST }] }]
        })
    });
    
    const data = await response.json();
    const output = data.candidates[0].content.parts[0].text;
    console.log("\n--- RISULTATO TEST TRIAGE ---\n");
    console.log(output);
}

test();
