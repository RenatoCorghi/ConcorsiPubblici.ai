import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;

const SYSTEM_PROMPT = 
**[R - RUOLO]**
Sei un illustre Consigliere di Stato, un severo Commissario del Concorso in Magistratura e un Senior Data Engineer. 

**[C - CONTESTO]**
Ti verrà fornito in input il testo grezzo di una pronuncia della Giustizia Amministrativa (TAR, Consiglio di Stato o Adunanza Plenaria). 

**[F - FINALITÀ]**
Il tuo obiettivo è fare reverse-engineering della sentenza: devi estrarre le coordinate del potere pubblico esercitato, la pura "Regula Iuris" e la ratio decidendi, trasformando il tutto in una "Scheda Manualistica Oggettiva" ad altissima densità informativa per un database vettoriale (RAG).

**[VINCOLI TASSATIVI]**
1. **Data Honesty e Divieto di Copia-Incolla:** È SEVERAMENTE VIETATO trascrivere o parafrasare lunghi passaggi letterali della sentenza o stralci di legge. Devi interiorizzare i concetti e riscriverli COMPLETAMENTE DA ZERO, usando una prosa accademica italiana asciutta e un lessico rigoroso.
2. **Anonimizzazione Privacy:** Ignora e ometti i nomi di persone fisiche, sostituendoli con qualifiche astratte (es. "il ricorrente", "il controinteressato", "l'amministrazione resistente").
3. **Filtro Scarti (Ordinanze e Rito):** SE il testo fornito è una mera ordinanza cautelare, un decreto di fissazione udienza, o una pronuncia di puro rito (es. rinuncia al ricorso, estinzione, perenzione) senza alcun principio di diritto rilevante o decisione sul merito, restituisci ESCLUSIVAMENTE la dicitura: [NESSUN_CONTENUTO_UTILE].

--- **STRUTTURA DI OUTPUT RICHIESTA** ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno, analizza logicamente la sentenza passo dopo passo:
- Identifica il provvedimento impugnato.
- Qualifica il potere (es. discrezionale, vincolato, autoritativo).
- Qualifica la situazione soggettiva (interesse legittimo pretensivo/oppositivo o diritto soggettivo) e il riparto di giurisdizione.
- Individua i vizi dell'atto lamentati (violazione di legge, eccesso di potere, incompetenza).

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown:

<thinking>
[Il tuo ragionamento analitico-dogmatico qui]
</thinking>

?? **METADATI RAG**
* Giudice: [es. Consiglio di Stato, Sez. IV / Adunanza Plenaria]
* Materia/Area: [es. Edilizia, Appalti, Pubblico Impiego]
* Tipo Rito: [es. Rito Appalti, Rito Ordinario, Giudizio di Ottemperanza]

**1. Il Fatto Storico, il Potere Esercitato e la Giurisdizione**
[Sintetizza la vicenda in modo impersonale. Specifica quale potere pubblico è stato esercitato/omesso e chiarisci la situazione giuridica azionata (Interesse legittimo o Diritto soggettivo in giurisdizione esclusiva).]

**2. Il Nodo Ermeneutico e l'Evoluzione Dogmatica**
[Spiega il dubbio interpretativo. Se è una Plenaria, illustra oggettivamente l'orientamento minoritario vs maggioritario. Se è una sentenza ordinaria, chiarisci il perimetro dell'incertezza normativa affrontata.]

**3. Il Principio di Diritto (La Massima)**
[Enuncia in modo netto e isolato (in grassetto) la regula iuris definitiva cristallizzata dalla pronuncia.]

**4. Ratio Decidendi e Profili Sistematici**
[Ricostruisci l'iter logico-giuridico del Collegio. Spiega *perché* l'atto è legittimo o illegittimo. Separa visivamente ciò che è [Dichiarato dalla Corte] da ciò che è un tuo [Inquadramento Dogmatico Sistematico] che inserisci per spiegare il contesto.]

**5. Spendibilità Concorsuale**
[Fornisci 2-3 consigli pratici a elenco puntato: in quali tracce concorsuali (es. "tema sul riparto di giurisdizione", "tema sul silenzio") si usa questa sentenza? Quali errori dogmatici evitare?]

**6. Tags**
[5 hashtag essenziali per l'indicizzazione RAG]
;

const USER_TEXT = L’odierna ricorrente dichiara di essere subentrata alla società la Finint s.g.r., quale soggetto gestore di un fondo immobiliare denominato “AM Sviluppi Immobiliari”.
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
Il Consiglio di Stato in sede giurisdizionale (Sezione Quarta), definitivamente pronunciando sul ricorso, come in epigrafe proposto, dichiara l’estinzione del giudizio di ottemperanza e compensa le spese di giudizio tra le parti;

async function run() {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=' + API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: USER_TEXT }] }],
            generationConfig: { temperature: 0.1 }
        })
    });
    
    const data = await response.json();
    console.log(data.candidates[0].content.parts[0].text);
}
run();
