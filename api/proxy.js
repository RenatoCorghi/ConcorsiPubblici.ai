import { createClient } from '@supabase/supabase-js';

// --- TOPIC TAXONOMY (per enrichment query expansion) ---
// Inline per compatibilità Vercel serverless (no filesystem access)
const TOPIC_TAXONOMY = [
  {
    "materia": "Diritto Penale",
    "topic": "reati contro la pubblica amministrazione",
    "keywords": ["reati contro la PA", "reati dei pubblici ufficiali", "delitti contro la pubblica amministrazione", "reati contro la P.A.", "concorso reati PA"],
    "sotto_query_forzate": [
      "peculato art 314 c.p. peculato d'uso",
      "concussione art 317 c.p. costrizione abuso qualità",
      "corruzione per esercizio della funzione art 318 c.p.",
      "corruzione propria art 319 c.p. atto contrario doveri ufficio",
      "corruzione in atti giudiziari art 319-ter c.p.",
      "induzione indebita dare promettere utilità art 319-quater c.p.",
      "istigazione alla corruzione art 322 c.p.",
      "abuso d'ufficio art 323 c.p. abolizione riforma Nordio 2024",
      "traffico influenze illecite art 346-bis c.p.",
      "concorso extraneus nel reato proprio pubblico ufficiale intraneus"
    ]
  },
  {
    "materia": "Diritto Penale",
    "topic": "concorso di persone nel reato",
    "keywords": ["concorso di persone", "concorso eventuale", "concorso nel reato", "partecipazione criminosa", "concorso morale"],
    "sotto_query_forzate": [
      "concorso di persone nel reato art 110 c.p. elementi strutturali",
      "concorso morale istigazione determinazione agevolazione",
      "concorso dell'extraneus nel reato proprio mutamento titolo art 117 c.p.",
      "responsabilità concorsuale cooperazione colposa art 113 c.p.",
      "desistenza volontaria recesso attivo nel concorso art 114 c.p.",
      "concorso anomalo art 116 c.p. reato diverso prevedibilità"
    ]
  },
  {
    "materia": "Diritto Penale",
    "topic": "concussione induzione corruzione",
    "keywords": ["concussione", "induzione indebita", "differenza concussione corruzione", "Sezioni Unite Maldera"],
    "sotto_query_forzate": [
      "Sezioni Unite Maldera differenza concussione induzione indebita",
      "concussione costrizione metus publicae potestatis art 317",
      "induzione indebita vantaggio indebito art 319-quater",
      "corruzione in atti giudiziari art 319-ter processo",
      "concorso extraneus concussione corruzione qualifica soggettiva"
    ]
  },
  {
    "materia": "Diritto Penale",
    "topic": "reati contro il patrimonio",
    "keywords": ["reati contro il patrimonio", "delitti contro il patrimonio", "furto rapina estorsione", "reati patrimoniali"],
    "sotto_query_forzate": [
      "furto aggravato art 624-bis 625 c.p.",
      "rapina propria impropria art 628 c.p.",
      "estorsione art 629 c.p. vis compulsiva",
      "truffa art 640 c.p. artifici raggiri",
      "ricettazione art 648 c.p. riciclaggio art 648-bis",
      "appropriazione indebita art 646 c.p.",
      "sequestro di persona a scopo di estorsione art 630 c.p."
    ]
  },
  {
    "materia": "Diritto Penale",
    "topic": "dolo colpa elemento soggettivo",
    "keywords": ["dolo", "colpa", "elemento soggettivo", "imputabilità", "dolo eventuale colpa cosciente"],
    "sotto_query_forzate": [
      "dolo diretto intenzionale indiretto eventuale",
      "dolo eventuale colpa cosciente Sezioni Unite Thyssen confine",
      "colpa generica specifica colpa professionale medica",
      "errore sul fatto errore sul divieto art 5 47 c.p.",
      "imputabilità capacità intendere volere art 85 c.p."
    ]
  },
  {
    "materia": "Diritto Penale",
    "topic": "tentativo",
    "keywords": ["tentativo", "delitto tentato", "desistenza volontaria", "recesso attivo"],
    "sotto_query_forzate": [
      "tentativo art 56 c.p. idoneità univocità atti",
      "desistenza volontaria recesso attivo art 56 comma 3 4",
      "tentativo nel reato omissivo improprio",
      "reato impossibile art 49 c.p.",
      "tentativo nei reati di pericolo"
    ]
  },
  {
    "materia": "Diritto Penale",
    "topic": "cause di giustificazione",
    "keywords": ["cause di giustificazione", "scriminanti", "legittima difesa", "stato di necessità", "antigiuridicità"],
    "sotto_query_forzate": [
      "legittima difesa art 52 c.p. proporzionalità riforma domiciliare",
      "stato di necessità art 54 c.p. pericolo attuale inevitabile",
      "esercizio del diritto adempimento del dovere art 51 c.p.",
      "consenso dell'avente diritto art 50 c.p.",
      "eccesso colposo nelle scriminanti art 55 c.p.",
      "cause di giustificazione putative art 59 c.p."
    ]
  },
  {
    "materia": "Diritto Civile",
    "topic": "responsabilità civile",
    "keywords": ["responsabilità civile", "danno ingiusto", "responsabilità extracontrattuale", "illecito civile", "art 2043"],
    "sotto_query_forzate": [
      "responsabilità extracontrattuale art 2043 c.c. ingiustizia del danno",
      "nesso di causalità giuridica equivalenza adeguatezza art 1223 c.c.",
      "responsabilità oggettiva custodia art 2051 attività pericolosa art 2050",
      "danno non patrimoniale biologico morale esistenziale Sezioni Unite San Martino",
      "responsabilità del produttore difettoso art 114-127 codice consumo",
      "concorso del danneggiato art 1227 c.c."
    ]
  },
  {
    "materia": "Diritto Civile",
    "topic": "contratto simulato frode alla legge",
    "keywords": ["simulazione", "contratto simulato", "frode alla legge", "negozio indiretto", "interposizione fittizia"],
    "sotto_query_forzate": [
      "simulazione assoluta relativa art 1414 c.c. effetti tra parti terzi",
      "interposizione fittizia reale di persona differenza",
      "frode alla legge art 1344 c.c. norma imperativa elusa",
      "negozio indiretto e negozio fiduciario distinzione",
      "prova simulazione tra le parti e terzi creditori art 1417 c.c.",
      "trust e segregazione patrimoniale opponibilità creditori"
    ]
  },
  {
    "materia": "Diritto Civile",
    "topic": "obbligazioni e adempimento",
    "keywords": ["obbligazioni", "adempimento", "inadempimento", "responsabilità contrattuale", "mora"],
    "sotto_query_forzate": [
      "inadempimento obbligazione art 1218 c.c. impossibilità sopravvenuta",
      "mora del debitore art 1219 c.c. effetti perpetuatio obligationis",
      "risarcimento danno contrattuale prevedibilità art 1225 c.c.",
      "responsabilità contrattuale extracontrattuale concorso cumulo",
      "obbligazioni solidali regresso art 1292-1299 c.c.",
      "clausola penale caparra confirmatoria penitenziale art 1382 1385 1386 c.c."
    ]
  },
  {
    "materia": "Diritto Civile",
    "topic": "azione revocatoria",
    "keywords": ["azione revocatoria", "revocatoria ordinaria", "pauliana", "art 2901", "frode ai creditori"],
    "sotto_query_forzate": [
      "azione revocatoria ordinaria art 2901 c.c. presupposti eventus damni",
      "scientia damni consilium fraudis atti gratuiti onerosi",
      "revocatoria fallimentare art 64-67 legge fallimentare CCII",
      "rapporto revocatoria simulazione azione surrogatoria",
      "revocatoria atti di dotazione trust conferimenti societari",
      "participatio fraudis terzo acquirente art 2901 comma 2"
    ]
  },
  {
    "materia": "Diritto Amministrativo",
    "topic": "silenzio della pubblica amministrazione",
    "keywords": ["silenzio", "silenzio assenso", "silenzio inadempimento", "inerzia PA", "silenzio amministrativo"],
    "sotto_query_forzate": [
      "silenzio assenso art 20 legge 241/1990 presupposti limiti",
      "silenzio inadempimento art 31 CPA ricorso avverso inerzia",
      "silenzio diniego silenzio rigetto significato",
      "SCIA segnalazione certificata inizio attività art 19 legge 241",
      "obbligo di provvedere termini procedimentali art 2 legge 241",
      "danno da ritardo della PA art 2-bis legge 241"
    ]
  },
  {
    "materia": "Diritto Amministrativo",
    "topic": "vizi dell'atto amministrativo",
    "keywords": ["vizi atto amministrativo", "annullabilità", "nullità atto", "illegittimità", "eccesso di potere"],
    "sotto_query_forzate": [
      "annullabilità atto amministrativo art 21-octies legge 241 vizi formali sostanziali",
      "eccesso di potere figure sintomatiche sviamento",
      "nullità atto amministrativo art 21-septies tassatività",
      "autotutela annullamento d'ufficio art 21-nonies limiti temporali",
      "irregolarità atto amministrativo differenza illegittimità",
      "motivazione atto amministrativo art 3 legge 241"
    ]
  },
  {
    "materia": "Diritto Amministrativo",
    "topic": "appalti pubblici contratti",
    "keywords": ["appalti pubblici", "contratti pubblici", "codice contratti", "gara d'appalto", "offerta anomala"],
    "sotto_query_forzate": [
      "principi contratti pubblici codice 36/2023 trasparenza concorrenza",
      "procedure di aggiudicazione aperta ristretta negoziata",
      "esclusione automatica offerte anomale soglia calcolo",
      "subappalto limiti nuovo codice contratti",
      "accesso agli atti gara riservatezza bilanciamento",
      "risarcimento in forma specifica interesse legittimo pretensivo"
    ]
  }
];

/* ============================================================
   PROXY.JS — Serverless API Proxy for OpenAI
   
   Security layers:
   1. CORS origin whitelist
   2. Model whitelist (solo modelli economici)
   3. Max tokens cap (previene abuso costi)
   4. Payload sanitization (no campi arbitrari)
   5. In-memory IP rate limiting (60 req/min)
   ============================================================ */

// --- CONFIGURAZIONE SICUREZZA ---

// Nota: la whitelist dei modelli è stata rimossa perché i modelli sono
// dinamici (Gemini, Claude, GPT) e vengono gestiti tramite APP_CONFIG lato frontend.

const MAX_TOKENS_LIMIT = 8000;   // Cap assoluto su max_tokens (alzato per Lectio Magistralis)
const MAX_MESSAGES = 100;         // Max messaggi in una conversazione (alzato per sessioni lunghe)
const MAX_MESSAGE_LENGTH = 150000; // Max lunghezza singolo messaggio (chars) — alzato per saggi/temi lunghe ed evoluzioni RAG
const MAX_TOTAL_CHARS = 400000;   // Cap complessivo payload (system incluso) — senza questo, 100 msg × 150k = 15M chars per richiesta
const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 60;      // 60 richieste per finestra

// --- WEB SEARCH WHITELIST & PROTOCOLLO COMPLIANCE v2.0 ---
// Aggiornata il 2026-06-04 — Deep Research su licenze, ToS, Legge 132/2025, GDPR.
// REGOLE:
//   GREEN LIGHT = Open Data / CC BY 4.0 / consultazione libera → consentite
//   RED LIGHT   = ToS restrittivi / paywall / opt-out attivo → VIETATE
//   YELLOW LIGHT = Licenza NC (Non-Commerciale) → VIETATE (app monetizzata)
// Il modello viene istruito a cercare ESCLUSIVAMENTE su fonti GREEN LIGHT.

// ENFORCEMENT HARD (non solo prompt): domini passati al parametro allowed_domains
// del web search tool di Anthropic — il modello NON può ricevere risultati da
// fuori questa lista. DEVE rispecchiare §1 (GREEN LIGHT) del prompt qui sotto:
// se aggiorni una, aggiorna l'altra. Per le fonti consentite solo su un percorso
// (es. SentenzeWeb, Cardozo) si include il path: la root resta esclusa.
const WEB_SEARCH_ALLOWED_DOMAINS = [
    // Istituzionali (Open Data / consultazione libera)
    'gazzettaufficiale.it',
    'normattiva.it',
    'eur-lex.europa.eu',
    'cortecostituzionale.it',
    'curia.europa.eu',
    'giustizia-amministrativa.it',      // include il sottodominio openga.*
    'italgiure.giustizia.it/sncass',    // SOLO SentenzeWeb: la root italgiure è VIETATA
    'cortedicassazione.it',
    'scuolamagistratura.it',
    'agenas.gov.it',
    'camera.it',
    'senato.it',
    // Riviste scientifiche con licenza compatibile (CC BY / Open Access pieno)
    'rivista.eurojus.it',
    'ojs.unito.it/index.php/cardozo',   // SOLO Cardozo Electronic Law Bulletin
    'theitalianlawjournal.it',
    'pmc.ncbi.nlm.nih.gov',
    'mdpi.com',
    'amsacta.unibo.it',
    'giureta.unipa.it',
    'dirittoepoliticadeitrasporti.it'
];

// Verifica se un URL ricade in un dominio consentito (sottodomini inclusi,
// path rispettato dove specificato). Usata come rete di sicurezza sulle
// citazioni mostrate. Pura e testabile.
export function isWebDomainAllowed(url, allowed = WEB_SEARCH_ALLOWED_DOMAINS) {
    let host, path;
    try {
        const u = new URL(url);
        host = u.hostname.toLowerCase().replace(/^www\./, '');
        path = u.pathname.toLowerCase();
    } catch {
        return false;
    }
    return allowed.some(entry => {
        const slash = entry.indexOf('/');
        const eHost = (slash === -1 ? entry : entry.slice(0, slash)).toLowerCase().replace(/^www\./, '');
        const ePath = slash === -1 ? '' : entry.slice(slash).toLowerCase();
        const hostOk = host === eHost || host.endsWith('.' + eHost);
        if (!hostOk) return false;
        if (!ePath) return true;
        return path === ePath || path.startsWith(ePath + '/');
    });
}

const WEB_SEARCH_WHITELIST_PROMPT = `
═══════════════════════════════════════════════════════════════════
🌐 ACCESSO INTERNET ATTIVO — PROTOCOLLO WHITELIST BLINDATA v2.0
═══════════════════════════════════════════════════════════════════

Hai accesso a Internet tramite lo strumento di ricerca web. USALO per verificare e integrare le informazioni del RAG con fonti aggiornate in tempo reale.

══════════════════════════════════════════════
§1 — FONTI CONSENTITE (GREEN LIGHT — TASSATIVE)
══════════════════════════════════════════════

🔒 VINCOLO DI FONTE ESCLUSIVA (TASSATIVO):
Puoi cercare e citare informazioni ESCLUSIVAMENTE dai portali e riviste elencati qui sotto. Qualsiasi altra fonte web (blog, forum, siti commerciali, enciclopedie collaborative, banche dati a pagamento) è SEVERAMENTE VIETATA.

FONTI ISTITUZIONALI (Primarie — Open Data / Consultazione libera):
• gazzettaufficiale.it — Gazzetta Ufficiale (Art. 52 CAD, dati aperti per default)
• normattiva.it — Portale normativa vigente, interrogazione multivigenza
• eur-lex.europa.eu — Legislazione e giurisprudenza UE (CC BY 4.0 / CC0)
• cortecostituzionale.it — Corte Costituzionale (Open Data ex CAD)
• curia.europa.eu — Corte di Giustizia UE (riproduzione libera con citazione "CGUE")
• giustizia-amministrativa.it — Consiglio di Stato e TAR
• openga.giustizia-amministrativa.it — Portale Open GA (dati liberamente riutilizzabili con citazione fonte)
• italgiure.giustizia.it/sncass/ — SentenzeWeb (consultazione libera e gratuita delle massime)
• cortedicassazione.it — Sito ufficiale della Suprema Corte (incl. Relazioni Ufficio del Massimario)
• scuolamagistratura.it — Scuola Superiore della Magistratura (Quaderni SSM, esenti ex Art. 5 L. 633/1941)
• agenas.gov.it — Portale governativo dei dati aperti sanitari (CC-BY)
• camera.it / senato.it — Lavori parlamentari e dossier

RIVISTE SCIENTIFICHE FASCIA A — SOLO LICENZE COMPATIBILI (CC BY 4.0 o Open Access pieno):
• rivista.eurojus.it — Diritto UE e internazionale (CC BY 4.0 — riutilizzo commerciale consentito)
• ojs.unito.it/index.php/cardozo — Cardozo Electronic Law Bulletin (CC BY 4.0)
• theitalianlawjournal.it — Issues (CC BY 3.0 / 4.0)
• pmc.ncbi.nlm.nih.gov — PubMed Central (filtro "Open Access - CC BY")
• mdpi.com — MDPI (filtro "Open Access - CC BY")
• amsacta.unibo.it — Repository IRIS Bologna (solo pubblicazioni/dispense CC BY)
• www.giureta.unipa.it — Diritto dell'Economia e dei Trasporti (Open Access pieno)
• www.dirittoepoliticadeitrasporti.it — Dottrina dei Trasporti (CC BY 4.0 Gold Open Access)

══════════════════════════════════════════════
§2 — FONTI VIETATE (RED LIGHT — DIVIETO ASSOLUTO)
══════════════════════════════════════════════

⛔ Se nei risultati di ricerca compaiono pagine da questi domini, IGNORA COMPLETAMENTE quei risultati. NON citarli, NON utilizzarne il contenuto, NON menzionarli nemmeno indirettamente.

BANCHE DATI COMMERCIALI (ToS vietano uso automatizzato):
• italgiure.giustizia.it (ESCLUSO /sncass/) — ItalgiureWeb CED: accesso a pagamento, ToS vietano scraping e uso commerciale
• dejure.it — Giuffrè: banca dati commerciale protetta da copyright
• iusexplorer.it — Wolters Kluwer: banca dati commerciale
• pluris-cedam.utetgiuridica.it — CEDAM/UTET: accesso a pagamento

RIVISTE CON OPT-OUT ATTIVO (Legge 132/2025 — Art. 171, c.1, lett. a-ter LDA):
• Qualsiasi rivista privata di Fascia A che espone protocolli di riserva TDM (tdm-reservation: 1)

RIVISTE OPEN ACCESS CON LICENZA NON-COMMERCIALE (incompatibili con app monetizzata):
• sistemapenale.it (BY-NC-ND) • ceridap.eu (BY-NC-ND) • federalismi.it (BY-NC)
• biodiritto.org (BY-NC) • dirittopenaleuomo.org (BY-NC) • medialaws.eu (BY-NC)
• archiviopenale.it (BY-NC) • lalegislazionepenale.eu (BY-NC)
• teseo.unitn.it/biolaw (BY-NC-ND) • cortisupremeesalute.it (BY-NC-ND)
• iusetsalus.it (diritti riservati) • osservatorioaic.it (BY-NC-ND)
• snlg.iss.it (non commerciale - Manuale Operativo SNLG)
• judicium.it (diritti riservati) • Milan Law Review (BY-NC-SA)

══════════════════════════════════════════════
§3 — FINALITÀ E OBBLIGHI DELLA RICERCA WEB
══════════════════════════════════════════════

QUANDO USARE LA RICERCA WEB:
— Verificare estremi di sentenze recenti (post-2024) non presenti nel RAG
— Cercare novelle legislative recentissime in Gazzetta Ufficiale o Normattiva
— Controllare aggiornamenti normativi e riforme in itinere
— Verificare lo stato vigente di una norma (multivigenza via Normattiva)
— Integrare con dottrina scientifica delle sole riviste in §1

OBBLIGO DI CITAZIONE: Per ogni informazione reperita online, CITA SEMPRE la fonte con URL completo e data di accesso. Le citazioni web devono essere DISTINTE dalle fonti RAG interne.

DIVIETO DI FONTI NON VERIFICATE: Se i risultati della ricerca provengono da fonti NON presenti in §1, IGNORA quei risultati e prosegui con il solo RAG interno.

══════════════════════════════════════════════
§4 — GUARDRAILS DI COMPLIANCE (OBBLIGATORI)
══════════════════════════════════════════════

4A. DOUBLE-CHECK TEMPORALE (PREVENZIONE ANACRONISMI):
Estrai SEMPRE la data di pubblicazione di ogni documento web inserito nel contesto.
Se un parere dottrinale o una sentenza è ANTERIORE a una di queste riforme cardine:
  — Riforma Cartabia (D.Lgs. 149/2022 e 150/2022)
  — Nuovo Codice Contratti Pubblici (D.Lgs. 36/2023)
  — Riforma fiscale (D.Lgs. 219-221/2023)
  — Abolizione abuso d'ufficio (L. 114/2024, c.d. "Riforma Nordio")
  — Direttiva Danni da Prodotto (2024/2853)
  — Legge IA e Copyright (L. 132/2025)
…allora NON applicare quel documento come diritto vigente. Qualificalo come "storico dibattito dogmatico" e avvia una ricerca secondaria sul quadro normativo vigente.

4B. ANONIMIZZAZIONE STRATEGICA CITAZIONI ISOLATE:
Se dalla ricerca web emerge una sentenza citata solo per estremi numerici (es. "Cass. n. 8604/2025") SENZA testo integrale o massima dettagliata, è VIETATO inventarne il fatto o la motivazione. Converti la citazione in formula astratta:
  ✅ «La giurisprudenza di legittimità ha chiarito che l'efficacia probatoria...»
  ❌ «La sentenza n. 8604/2025 ha stabilito che... [fatto inventato]»

4C. GERARCHIA DELLE FONTI:
  1° — Normativa vigente (Normattiva, Gazzetta Ufficiale, Eur-Lex)
  2° — Giurisprudenza istituzionale (Corte Cost., CGUE, CdS, Cassazione SentenzeWeb)
  3° — Riviste scientifiche Fascia A (solo quelle in §1)
  4° — MAI fonti non verificate o non in whitelist
`;

// --- MODEL WHITELIST (anti-abuso costi) ---
export const MODEL_WHITELIST = {
    google: [
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
    ],
    anthropic: [
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022'
    ],
    openai: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-3.5-turbo'
    ]
};

import { ALLOWED_ORIGINS, isOriginAllowed } from './_cors.js';

// --- RATE LIMITER ---
// Primario: Upstash Redis via REST (condiviso tra tutte le istanze serverless).
// Fallback: in-memory (per-istanza, debole su serverless) se Upstash non è configurato.
// Per attivare Upstash: creare un DB su upstash.com e impostare su Vercel
// UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.

async function isRateLimitedUpstash(ip) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const key = `rl:proxy:${ip}`;
    const windowSecs = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    // Finestra fissa: INCR del contatore, TTL impostato solo alla prima richiesta (NX)
    const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
            ['INCR', key],
            ['EXPIRE', key, String(windowSecs), 'NX'],
            ['TTL', key]
        ])
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const data = await res.json();
    const count = data[0]?.result;
    const ttl = data[2]?.result;
    if (typeof count !== 'number') throw new Error('Risposta Upstash inattesa');

    if (count > RATE_LIMIT_MAX_REQUESTS) {
        return { limited: true, remaining: 0, retryAfter: (typeof ttl === 'number' && ttl > 0) ? ttl : windowSecs };
    }
    return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - count };
}

async function checkRateLimit(ip) {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
            return await isRateLimitedUpstash(ip);
        } catch (e) {
            console.warn(`[RateLimit] Upstash non raggiungibile (${e.message}) — fallback in-memory.`);
        }
    }
    return isRateLimited(ip);
}

const rateLimitStore = new Map();

export function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitStore.get(ip);

    // Pulizia periodica (evita memory leak)
    if (rateLimitStore.size > 10000) {
        for (const [key, val] of rateLimitStore) {
            if (now - val.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
                rateLimitStore.delete(key);
            }
        }
    }

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        // Nuova finestra
        rateLimitStore.set(ip, { windowStart: now, count: 1 });
        return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
    }

    entry.count++;

    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
        return { limited: true, remaining: 0, retryAfter };
    }

    return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

// --- NORMALIZZATORE INTELLIGENTE MATERIE ---
// Risolve il problema del RAG che si "impunta" sulle differenze testuali.
// Mappa sinonimi e varianti (es. "Procedura Civile", "amministrativo") a un formato canonico.
export function normalizeMateria(inputMateria) {
    if (!inputMateria || inputMateria === 'Tutte le materie') return null;
    const str = inputMateria.toLowerCase().trim();
    
    if (str.includes('amministrativ')) return 'Diritto Amministrativo';
    if (str.includes('costituzional')) return 'Diritto Costituzionale';
    
    // Processuale Penale
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('penal')) {
        return 'Diritto Processuale Penale';
    }
    // Processuale Civile
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('civil')) {
        return 'Diritto Processuale Civile';
    }
    // Sostanziale Penale
    if (str.includes('penal')) return 'Diritto Penale';
    // Sostanziale Civile
    if (str.includes('civil')) return 'Diritto Civile';
    
    // Ritorna la stringa formattata con la prima lettera maiuscola per altre materie
    return inputMateria.replace(/\b\w/g, l => l.toUpperCase());
}

// Mappa materia del chunk → famiglia canonica per matching soft
// Es: "Giurisprudenza Civile" e "Diritto Processuale Civile" matchano con "Diritto Civile"
export function materiaFamily(materia) {
    if (!materia || materia === 'Tutte le materie') return null;
    const s = materia.toLowerCase();
    if (s.includes('civile') || s.includes('lavoro') || s.includes('commerciale')) return 'civile';
    if (s.includes('penale')) return 'penale';
    if (s.includes('amministrativ')) return 'amministrativo';
    if (s.includes('tributar')) return 'tributario';
    if (s.includes('costituzional')) return 'costituzionale';
    if (s.includes('massimario')) return 'civile'; // Massimario della Cassazione = prevalentemente civile
    return null;
}

// Verifica se la materia del chunk è compatibile con il filtro richiesto
export function materiaMatches(chunkMateria, filterMateria) {
    if (!filterMateria) return true;  // Nessun filtro → tutto passa
    if (!chunkMateria) return true;   // Materia null → tieni (potrebbe essere cross-disciplinare)
    if (chunkMateria === filterMateria) return true; // Match esatto
    // Match per famiglia: "Giurisprudenza Civile" matcha con "Diritto Civile"
    return materiaFamily(chunkMateria) === materiaFamily(filterMateria);
}

// --- TAXONOMY ENRICHMENT ---
// Arricchisce le sotto-query con query forzate dalla tassonomia degli argomenti.
// Garantisce copertura completa per argomenti-ombrello (es. "reati contro la PA" → tutti gli artt. 314-323)
function enrichWithTaxonomy(subQueries, userQuery, materia) {
    if (!TOPIC_TAXONOMY || TOPIC_TAXONOMY.length === 0) return subQueries;
    
    const queryLower = userQuery.toLowerCase();
    const materiaLower = (materia || '').toLowerCase();
    
    // Cerca match nella tassonomia
    const matching = TOPIC_TAXONOMY.filter(t => {
        // Match materia (se specificata)
        const materiaMatch = !materia || 
            t.materia.toLowerCase().includes(materiaLower.replace('diritto ', '')) ||
            materiaLower.includes(t.materia.toLowerCase().replace('diritto ', ''));
        if (!materiaMatch) return false;
        
        // Match keywords nel topic o nella query utente
        return t.keywords.some(kw => queryLower.includes(kw.toLowerCase())) ||
               queryLower.includes(t.topic.toLowerCase());
    });
    
    if (matching.length === 0) return subQueries;
    
    // Raccogli tutte le sotto-query forzate
    const forcedQueries = matching.flatMap(t => t.sotto_query_forzate);
    
    // Filtra quelle già coperte dalle sotto-query esistenti
    const existingText = subQueries.join(' ').toLowerCase();
    const newQueries = forcedQueries.filter(fq => {
        // Controlla se i primi 3 termini significativi della query forzata sono già coperti
        const keyTerms = fq.toLowerCase().split(' ').filter(w => w.length > 3).slice(0, 3);
        return !keyTerms.every(term => existingText.includes(term));
    });
    
    if (newQueries.length > 0) {
        console.log(`[RAG] 📚 Taxonomy enrichment: +${newQueries.length} sotto-query forzate da ${matching.length} topic match`);
        // Limita a max 8 query totali per non sovraccaricare l'embedding
        const enriched = [...subQueries, ...newQueries].slice(0, 8);
        return enriched;
    }
    
    return subQueries;
}

// --- QUERY EXPANSION (Multi-Query RAG) ---
// Decompone titoli complessi in sotto-query atomiche usando Gemini Flash.
// Es: "Contratto simulato e in frode alla legge, con rif. al contratto di società"
//   → ["simulazione contrattuale art 1414 cc", "frode alla legge art 1344 cc", ...]
async function expandQuery(query, materia, googleKey) {
    // Solo per query lunghe (titoli di lezione complessi)
    if (!query || query.length < 60) return [query];
    
    try {
        const prompt = `Sei un Magistrato Ordinario e docente di diritto. Il tuo compito è ottimizzare l'estrazione RAG (Retrieval-Augmented Generation) per la generazione di una "lezione magistrale" su questa traccia:
"${query}" (Materia: ${materia || 'Non specificata'}).

Il database vettoriale su cui faremo la ricerca usa ricerca semantica. Scomponi la traccia in un massimo di 4 sotto-query distinte e ultra-focalizzate, scritte come se fossero massime giurisprudenziali. Se è semplice, forniscine una sola.

REGOLE TASSATIVE:
1. Restituisci SOLO un array JSON valido di stringhe.
2. Formato esatto: ["sotto query 1", "sotto query 2"]
3. Nessun markdown.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(4000),
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { 
                        temperature: 0.2, 
                        maxOutputTokens: 2048,
                        responseMimeType: "application/json"
                    }
                })
            }
        );
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        // Il JSON arriva già pulito grazie a responseMimeType
        const queries = JSON.parse(text);
        if (Array.isArray(queries) && queries.length >= 1 && queries.length <= 6) {
            console.log(`[RAG] 🔀 Query Expansion: "${query.substring(0,60)}..." → ${queries.length} sotto-query: ${JSON.stringify(queries)}`);
            return queries.slice(0, 5);
        }
    } catch (e) {
        console.warn(`[RAG] ⚠️ Query Expansion fallita, uso query originale: ${e.message}`);
    }
    return [query];
}

// --- RE-RANKER LLM (secondo parere sulla pertinenza) ---
// Dopo il retrieval ibrido, Gemini Flash rilegge i top candidati e dà un voto
// di pertinenza 0-10 rispetto alla richiesta. Scarta i falsi positivi
// semantici (frammenti "simili" ma fuori tema) che il coseno da solo non
// distingue. Fallback silenzioso: se la chiamata fallisce, scade o risponde
// in modo troppo parziale, si mantiene l'ordinamento boostato originale.
export async function rerankCandidates(query, candidates, googleKey) {
    try {
        const lista = candidates.map((m, i) =>
            `[${i + 1}] (${m.tipo || 'documento'}${m.titolo ? ` — ${String(m.titolo).substring(0, 80)}` : ''})\n${(m.content || '').substring(0, 600)}`
        ).join('\n\n');
        const prompt = `Sei un magistrato che seleziona le fonti per una lezione di diritto.\nRICHIESTA: "${String(query || '').substring(0, 300)}"\n\nVALUTA la pertinenza di OGNI frammento rispetto alla richiesta (0 = irrilevante, 10 = essenziale):\n\n${lista}\n\nRispondi SOLO con un array JSON: [{"i":1,"s":8},{"i":2,"s":3},...] — un elemento per OGNI frammento.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${googleKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000),
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' }
                })
            }
        );
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const votes = JSON.parse(text);
        if (!Array.isArray(votes) || votes.length === 0) return null;

        const scoreByIndex = new Map();
        votes.forEach(v => {
            const idx = parseInt(v.i, 10) - 1;
            const s = Number(v.s);
            if (idx >= 0 && idx < candidates.length && Number.isFinite(s)) {
                scoreByIndex.set(idx, Math.max(0, Math.min(10, s)));
            }
        });
        // Risposta troppo parziale → non fidarsi del re-rank
        if (scoreByIndex.size < candidates.length / 2) return null;

        const reranked = candidates
            .map((m, i) => ({ m, llmScore: scoreByIndex.has(i) ? scoreByIndex.get(i) : 5 })) // non votati → neutro
            .filter(x => x.llmScore > 2)  // i chiaramente irrilevanti escono anche se restano meno di 8 fonti
            .sort((a, b) => (b.llmScore - a.llmScore) || (b.m.boostedScore - a.m.boostedScore))
            .map(x => x.m);
        return reranked.length > 0 ? reranked : null;
    } catch (e) {
        console.warn(`[RAG] ⚠️ Re-rank fallito (mantengo ordine boostato): ${e.message}`);
        return null;
    }
}

// --- LOG QUALITÀ RAG (fire-and-forget) ---
// Una riga per richiesta su rag_quality_log (migration 012): query, materia,
// n. risultati, punteggio del top. Serve a vedere DOVE il retrieval fallisce
// in produzione e ad alimentare l'eval set con casi reali. Mai await-ata:
// l'insert viaggia mentre il provider genera la risposta.
function logRagQuality(supabaseKey, entry) {
    try {
        fetch(`${process.env.SUPABASE_URL}/rest/v1/rag_quality_log`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(entry)
        }).catch(() => {});
    } catch { /* il log non deve mai rompere il RAG */ }
}

// --- FUNZIONE RAG (RETRIEVAL-AUGMENTED GENERATION) ---
// Ritorna { contextText, sources } — contextText per il prompt, sources per il frontend
// USA: match_documents_hybrid RPC (vector 70% + full-text 30%, con metadata filtering)
// FALLBACK: match_rag_chunks (vector-only) se la hybrid RPC non è ancora deployata
async function fetchRAGContext(userMessageText, materiaFilter = null, skipExpansion = false, feature = null) {
    const googleKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    
    if (!process.env.SUPABASE_URL || !supabaseKey || !googleKey) {
        console.warn("[RAG] ⚠️ Configurazione incompleta (URL, Key o GoogleKey mancante). Salto RAG.");
        return null;
    }
    try {
        // 1. QUERY EXPANSION: decomponi titoli complessi in sotto-query atomiche.
        // Saltata se il client dichiara una ragQuery già mirata (continuazioni di
        // modulo): risparmia una chiamata Gemini Flash (~1-2s) a richiesta.
        let subQueries = skipExpansion ? [userMessageText] : await expandQuery(userMessageText, materiaFilter, googleKey);
        
        // 1b. TAXONOMY ENRICHMENT: arricchisci con sotto-query forzate dalla tassonomia
        subQueries = enrichWithTaxonomy(subQueries, userMessageText, materiaFilter);
        
        // 2. Genera embedding per query principale + sotto-query (in parallelo)
        const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${googleKey}`;
        const materiaPrefix = materiaFilter ? `${normalizeMateria(materiaFilter)}: ` : '';

        // Embedding asimmetrico (query vs documento): impostare su Vercel
        // RAG_QUERY_TASK_TYPE=RETRIEVAL_QUERY SOLO DOPO aver completato il
        // re-embed del corpus con scripts/reembed_task_type.mjs — i task type
        // diversi vivono in spazi vettoriali leggermente diversi e mischiare
        // query tipizzate con un corpus non tipizzato peggiora il retrieval.
        const queryTaskType = process.env.RAG_QUERY_TASK_TYPE || null;

        const allEmbedRequests = subQueries.map(sq =>
            fetch(embedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000),
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text: materiaPrefix + sq }] },
                    outputDimensionality: 768,
                    ...(queryTaskType ? { taskType: queryTaskType } : {})
                })
            }).then(r => r.json()).then(data => {
                if (data.error) console.error("[RAG] ❌ Embed Error:", data.error);
                return data;
            }).catch(err => {
                console.error("[RAG] ❌ Embed Fetch Error:", err);
                return null;
            })
        );
        
        const embedResults = await Promise.all(allEmbedRequests);
        // Accoppia PRIMA di filtrare: filtrare prima fa scalare gli indici e
        // assocerebbe i vettori alle sotto-query sbagliate quando un embedding fallisce
        const vectors = embedResults
            .map((r, i) => ({ vector: r?.embedding?.values, query: subQueries[i] }))
            .filter(v => v.vector);

        if (vectors.length === 0) return null;
        
        console.log(`[RAG] 📐 Embedding generati: ${vectors.length}/${subQueries.length} (${subQueries.length > 1 ? 'multi-query' : 'single'})`);

        // 3. HYBRID SEARCH: vettore + full-text + metadata filtering
        const hybridUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/match_documents_hybrid`;
        const legacyUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/match_rag_chunks`;
        const rpcHeaders = {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        };

        // Multi-query retrieval parallelo:
        // A) Broad search per OGNI sotto-query → massima copertura tematica
        // B) Premium search (con vettore primario) → garanzia fonti autorevoli
        let matches = [];
        let usedHybrid = false;
        const normalizedMateria = materiaFilter ? normalizeMateria(materiaFilter) : null;
        if (normalizedMateria) console.log(`[RAG] 🎯 Filtro materia attivo: ${normalizedMateria}`);

        try {
            const searchPromises = vectors.map((v) => {
                const isVeryShort = v.query.length < 20;

                if (isVeryShort) {
                    // FTS sul GIN esistente (idx_rag_chunks_fts) invece di ILIKE:
                    // content=ilike.*q* su 35k chunk era una scansione completa
                    // server-side. Fallback ILIKE solo se la FTS non trova nulla
                    // (es. sigle o parole troncate che il tokenizer non matcha).
                    let baseUrl = `${process.env.SUPABASE_URL}/rest/v1/rag_chunks?select=id,document_id,content,materia,tipo,rag_documents(titolo)&limit=15`;
                    if (normalizedMateria) {
                        baseUrl += `&materia=eq.${encodeURIComponent(normalizedMateria)}`;
                    }
                    const ftsUrl = `${baseUrl}&fts=plfts(italian).${encodeURIComponent(v.query)}`;
                    const ilikeUrl = `${baseUrl}&content=ilike.*${encodeURIComponent(v.query)}*`;

                    return fetch(ftsUrl, {
                        method: 'GET',
                        headers: rpcHeaders
                    }).then(r => r.json()).then(data =>
                        (Array.isArray(data) && data.length > 0)
                            ? data
                            : fetch(ilikeUrl, { method: 'GET', headers: rpcHeaders }).then(r => r.json())
                    ).then(data => {
                        if (!Array.isArray(data)) return [];
                        // Aggiungi una finta similarity per i risultati FTS così vengono presi in considerazione
                        return data.map(m => ({
                            ...m,
                            similarity: 0.8,
                            keyword_score: 1.0,
                            hybrid_score: 0.9,
                            titolo: m.rag_documents ? m.rag_documents.titolo : null
                        }));
                    }).catch(() => null);
                } else {
                    const hybridUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/match_documents_hybrid`;
                    return fetch(hybridUrl, {
                        method: 'POST',
                        headers: rpcHeaders,
                        body: JSON.stringify({
                            query_embedding: v.vector,
                            query_text: v.query,
                            filter_materia: normalizedMateria,
                            match_count: Math.ceil(15 / vectors.length) + 3,
                            match_threshold: 0.40
                        })
                    }).then(r => r.json()).catch(() => null);
                }
            });
            
            const responses = await Promise.all(searchPromises);
            const allResults = [];
            for (const r of responses) {
                if (Array.isArray(r)) {
                    allResults.push(...r);
                }
            }
            
            // De-duplica e filtra per materia (lato JS, dato che match_rag_chunks non ha filtri)
            const seen = new Set();
            for (const m of allResults) {
                if (!seen.has(m.id)) {
                    // Filtro materia soft: usa materiaMatches per accettare varianti
                    // Es: "Giurisprudenza Civile" e "Diritto Processuale Civile" passano per "Diritto Civile"
                    if (!materiaMatches(m.materia, normalizedMateria)) continue;
                    seen.add(m.id);
                    m.similarity = m.similarity || 0;
                    matches.push(m);
                }
            }
            console.log(`[RAG] 🔍 match_rag_chunks: ${allResults.length} raw → ${matches.length} dopo filtro materia (${vectors.length} query)`);
        } catch (searchErr) {
            console.error(`[RAG] ❌ Ricerca fallita: ${searchErr.message}`);
            return null;
        }
        
        if (matches && matches.length > 0) {
            let contextText = "\n\n<RAG_CONTEXT>\n";
            contextText += "⚠️ AVVERTENZA: I frammenti seguenti provengono dal database giurisprudenziale e dottrinale (Cassazione, Consiglio di Stato, TAR, Corte Costituzionale, Riviste). Alcuni documenti sono \"Schede VIP\" strutturate in 7-8 sezioni (Fatto, Contrasto, Massima, Ratio, Obiter, Spendibilità, Tags, Rete Sistematica): SFRUTTA TUTTE LE SEZIONI per costruire argomentazioni profonde. I codici numerici lunghi (es. 202401188) sono ID INTERNI del database, NON numeri di sentenza. NON citarli MAI come estremi giurisprudenziali.\n\n";
            // Re-ranking con boost per fonti autorevoli e RECENCY.
            // Base = hybrid_score della RPC (70% vettore + 30% keyword): prima si usava
            // la sola similarity e il segnale keyword (numeri di articolo, latinismi,
            // lessico tecnico esatto) veniva calcolato in SQL ma ignorato nel ranking.
            matches.forEach(m => {
                m.boostedScore = (typeof m.hybrid_score === 'number' && m.hybrid_score > 0) ? m.hybrid_score : m.similarity;
                
                // 1. Boost per Autorità
                if (m.tipo === 'teoria_massimario') m.boostedScore *= 1.35;    // Riviste VIP
                if (m.tipo === 'massimario_cassazione') m.boostedScore *= 1.30; // Massimari Cassazione
                if (m.tipo === 'nomofilachia_ssuu') m.boostedScore *= 1.25;     // SS.UU. VIP
                if (m.tipo === 'sentenza_ssuu') m.boostedScore *= 1.20;         // SS.UU. schede
                // Boost per codici e testi unici (fondamento normativo, essenziali per la lezione)
                if (m.tipo === 'codice') m.boostedScore *= 1.15;               // Codici e T.U.
                // Boost per schede VIP strutturate (hand-crafted, alta densità semantica)
                if (m.tipo === 'sentenza_sez_semplici_vip') m.boostedScore *= 1.10;
                if (m.tipo === 'giurisprudenza_sez_semplici') m.boostedScore *= 1.10;
                if (m.tipo === 'sentenza_admin_vip') m.boostedScore *= 1.10;
                if (m.tipo === 'sentenza_cgt_vip') m.boostedScore *= 1.10;
                if (m.tipo === 'giurisprudenza_tributaria') m.boostedScore *= 1.10;
                
                // 2. Boost per Recency (Priorità assoluta alle novelle 2024/2025/2026)
                // Estrae l'anno dal titolo o, se assente, dal frammento iniziale del contenuto.
                const searchStr = (m.titolo + " " + (m.content || '').substring(0, 200)).match(/\b(202[0-9])\b/);
                if (searchStr) {
                    const anno = parseInt(searchStr[1], 10);
                    if (anno === 2026 || anno === 2025) {
                        m.boostedScore *= 1.15; // Massimo boost per l'anno in corso
                    } else if (anno === 2024) {
                        m.boostedScore *= 1.08; // Forte boost per il 2024 (riforma fiscale/Cartabia)
                    } else if (anno === 2023) {
                        m.boostedScore *= 1.02; // Lieve boost per 2023
                    } else if (anno <= 2019) {
                        m.boostedScore *= 0.95; // Penalizzazione lieve per sentenze vecchie
                    }
                }

                // 3. Penalizzazione chunk PQM/Dispositivi (inutili per didattica)
                // I frammenti che contengono solo "P.Q.M." o dispositivo sono privi di
                // contenuto argomentativo — penalizzarli pesantemente.
                const contentLower = (m.content || '').toLowerCase();
                // Penalizza solo chunk CORTI che sono dispositivo puro: un chunk lungo che
                // menziona "P.Q.M." in coda contiene comunque motivazione utile
                const isPQM = ((contentLower.includes('p.q.m') || contentLower.includes('per questi motivi')) && contentLower.length < 800) ||
                              (contentLower.includes('rigetta') && contentLower.includes('ricorso') && contentLower.length < 500) ||
                              (contentLower.includes('annulla') && contentLower.includes('rinvia') && contentLower.length < 500);
                if (isPQM) {
                    m.boostedScore *= 0.50; // Penalizzazione severa: dispositivi inutili
                    m._isPQMOnly = true;
                }
            });
            
            // Hard-filter PQM: se abbiamo abbastanza risultati non-PQM, elimina i PQM
            const nonPQM = matches.filter(m => !m._isPQMOnly);
            const pqmCount = matches.length - nonPQM.length;
            if (nonPQM.length >= 2 && pqmCount > 0) {
                console.log(`[RAG] 🗑️ PQM hard-filter: rimossi ${pqmCount} chunk dispositivo (${nonPQM.length} risultati utili rimasti)`);
                matches = nonPQM;
            } else if (pqmCount > 0) {
                console.warn(`[RAG] ⚠️ ${pqmCount}/${matches.length} risultati sono PQM/dispositivo — qualità RAG degradata`);
            }
            
            // Riordina per score boostato e prendi i top 8.
            // Soglia ricalibrata sulla scala ibrida (hybrid = 0.7×sim quando il
            // keyword_score è 0): 0.35 qui equivale a ~0.50 della vecchia scala solo-vettore.
            matches = matches.filter(m => m.boostedScore > 0.35);

            // 4. Filtro post-retrieval per materia (safety net anti-contaminazione)
            // Se abbiamo richiesto una materia specifica, rimuovi i risultati di materie diverse
            // Penalizza i chunk senza materia (potenziale contaminazione cross-branch)
            if (normalizedMateria && matches.length > 3) {
                const materiaLower = normalizedMateria.toLowerCase();
                const beforeFilter = matches.length;
                
                // Hard-block cross-branch contamination map
                const INCOMPATIBLE_BRANCHES = {
                    'penale': ['civile', 'processuale civile', 'giurisprudenza civile'],
                    'civile': ['penale', 'processuale penale', 'giurisprudenza penale'],
                    'processuale civile': ['penale', 'processuale penale'],
                    'processuale penale': ['civile', 'processuale civile'],
                };
                const requestedBranch = materiaLower.replace('diritto ', '');
                const incompatibleList = INCOMPATIBLE_BRANCHES[requestedBranch] || [];
                
                matches = matches.filter(m => {
                    // Chunk senza materia: tieni ma penalizza (potrebbero essere cross-branch)
                    if (!m.materia) {
                        m.boostedScore *= 0.75;
                        return true;
                    }
                    const mLower = m.materia.toLowerCase();
                    const mBranch = mLower.replace('diritto ', '');
                    
                    // Hard-block: se il chunk è di una materia INCOMPATIBILE, rimuovilo
                    if (incompatibleList.some(inc => mBranch.includes(inc) || inc.includes(mBranch))) {
                        console.log(`[RAG] ⛔ Cross-branch block: "${m.materia}" incompatibile con "${normalizedMateria}" — rimosso`);
                        return false;
                    }
                    
                    // Match se la materia contiene la keyword (es. "Civile" in "Diritto Civile")
                    if (mLower.includes(materiaLower.replace('diritto ', '')) || materiaLower.includes(mLower.replace('diritto ', ''))) return true;
                    // Eccezione: tieni fonti VIP autorevoli anche se cross-materia (boostScore > 0.90)
                    if (m.boostedScore > 0.90 && (m.tipo || '').includes('teoria_massimario')) return true;
                    return false;
                });
                if (beforeFilter !== matches.length) {
                    console.log(`[RAG] 🧹 Filtro materia post-retrieval: ${beforeFilter} → ${matches.length} (rimossi ${beforeFilter - matches.length} risultati di materie diverse)`);
                }
            }
            matches.sort((a, b) => b.boostedScore - a.boostedScore);

            // RE-RANK LLM: secondo parere di Gemini Flash sui top 24 candidati.
            // Solo quando c'è davvero una scelta da fare (più di 8 candidati);
            // se fallisce si tiene l'ordine boostato (rerankCandidates → null).
            // NOTA: disabilitato temporaneamente — il re-ranker aggiunge 5-8s
            // di latenza e spesso fallisce su Vercel Hobby (10s limit).
            // Il ranking boostato (authority + recency + hybrid_score) è già
            // efficace (top match ~67-80%). Riabilitare su piano Pro.
            let reranked = null;
            /* RE-RANKER DISABLED — Hobby plan constraint
            if (matches.length > 8) {
                reranked = await rerankCandidates(userMessageText, matches.slice(0, 24), googleKey);
                if (reranked) console.log(`[RAG] 🧠 Re-rank LLM applicato su ${Math.min(matches.length, 24)} candidati`);
            }
            */
            const topMatches = (reranked || matches).slice(0, 8);

            topMatches.forEach((m, i) => {
                let cleanContent = (m.content || '')
                    .replace(/^Documento:\s*\S+\s+\d{4}\s+\d+\s*\n?/m, '')
                    .replace(/\b(?:cds|tar[\w-]*)\s+\d{4}\s+\d{8,}\b/gi, '[riferimento registro GA]')
                    .replace(/\bNumero registro:\s*\d{8,}[^\n]*/gi, 'Numero registro: [codice interno — non citare]')
                    .replace(/\b20\d{7,}\b/g, '[cod. registro]')
                    .trim();
                
                let cleanTitolo = (m.titolo || '')
                    .replace(/\b(?:cds|tar[\w-]*)\s+\d{4}\s+\d{8,}\b/gi, '[Sentenza GA]')
                    .replace(/N\.\s*\d{8,}/g, 'N. [registro]');
                
                // Etichetta speciale per boost
                let sourceLabel = m.materia;
                if (m.tipo === 'teoria_massimario') sourceLabel = `📚 [RIVISTA VIP / DOTTRINA]`;
                else if (m.tipo === 'massimario_cassazione') sourceLabel = `📖 [MASSIMARIO DELLA CASSAZIONE]`;
                else if (m.tipo === 'nomofilachia_ssuu') sourceLabel = `🏛️ [NOMOFILACHIA / SS.UU.]`;
                else if (m.tipo === 'sentenza_ssuu') sourceLabel = `⚖️ [SS.UU. CASSAZIONE]`;
                else if (m.tipo === 'sentenza_sez_semplici_vip' || m.tipo === 'giurisprudenza_sez_semplici') sourceLabel = `⚖️ [SCHEDA VIP — CASSAZIONE]`;
                else if (m.tipo === 'sentenza_admin_vip') sourceLabel = `🏛️ [SCHEDA VIP — GIUSTIZIA AMMINISTRATIVA]`;
                else if (m.tipo === 'sentenza_cgt_vip' || m.tipo === 'giurisprudenza_tributaria') sourceLabel = `⚖️ [SCHEDA VIP — GIUSTIZIA TRIBUTARIA]`;
                else if (m.tipo === 'sentenza_sez_semplici') {
                    if (m._isEvolutionSignal) {
                        sourceLabel = `📡 [SEGNALE EVOLUZIONE RECENTE — CASS. SEZ. SEMPLICE]`;
                    } else {
                        sourceLabel = `📄 [CASSAZIONE — SEZ. SEMPLICE (Tier 2)]`;
                    }
                }
                
                const label = cleanTitolo ? `${sourceLabel} - ${cleanTitolo}` : sourceLabel;
                contextText += `[Fonte ${i+1} (${(m.boostedScore*100).toFixed(1)}% match): ${label}]\n${cleanContent}\n\n`;
            });
            
            if (topMatches.length > 0) {
                console.log(`[RAG] Recuperati ${matches.length} chunk, top ${topMatches.length} dopo boost. Top: ${topMatches[0].tipo} (${(topMatches[0].boostedScore*100).toFixed(1)}%)`);
            } else {
                console.log(`[RAG] Recuperati 0 chunk utili dopo boost.`);
            }
            contextText += "</RAG_CONTEXT>\nISTRUZIONE: Usa questo contesto normativo per fondare le tue risposte. Cita SOLO articoli di legge e principi di diritto riportati testualmente. NON inventare numeri di sentenza. I codici lunghi tipo '202601187' sono ID interni, NON numeri di sentenza.\n";
            
            // Metadati delle fonti per il frontend (include fullContent per la verifica citazioni lato client)
            const sources = topMatches.map(m => ({
                tipo: m.titolo || 'documento',
                titolo: m.titolo || 'documento',
                materia: m.materia || 'Giurisprudenza',
                similarity: m.similarity || 0,
                snippet: (m.content || '').substring(0, 250),
                content: m.content || '',
                fullContent: m.content || ''
            }));

            logRagQuality(supabaseKey, {
                feature,
                query: String(userMessageText || '').substring(0, 300),
                materia: normalizedMateria,
                sub_query_count: subQueries.length,
                skip_expansion: skipExpansion,
                reranked: !!reranked,
                result_count: topMatches.length,
                top_score: topMatches[0] ? Number(topMatches[0].boostedScore.toFixed(4)) : null,
                top_tipo: topMatches[0]?.tipo || null,
                top_titolo: topMatches[0] ? String(topMatches[0].titolo || '').substring(0, 200) : null
            });

            return { contextText, sources };
        } else {
            // Anche i buchi vanno misurati: result_count 0 è il segnale più utile
            logRagQuality(supabaseKey, {
                feature,
                query: String(userMessageText || '').substring(0, 300),
                materia: normalizedMateria,
                sub_query_count: subQueries.length,
                skip_expansion: skipExpansion,
                reranked: false,
                result_count: 0,
                top_score: null,
                top_tipo: null,
                top_titolo: null
            });
        }
    } catch (e) {
        console.error("[RAG] Errore durante estrazione contesto:", e.message);
    }
    return null;
}

// --- SANITIZZAZIONE PAYLOAD ---

export function sanitizePayload(body) {
    const errors = [];

    // Rimossa whitelist rigida dei modelli perché saranno dinamici (Gemini/Claude test)
    if (!body.model || typeof body.model !== 'string') {
        errors.push(`Modello mancante o non valido.`);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        errors.push('Il campo "messages" è obbligatorio e deve essere un array non vuoto.');
    } else if (body.messages.length > MAX_MESSAGES) {
        errors.push(`Troppi messaggi (${body.messages.length}). Max: ${MAX_MESSAGES}.`);
    } else {
        // Valida msg
        for (let i = 0; i < body.messages.length; i++) {
            const msg = body.messages[i];
            if (!msg.role || msg.content == null) {
                errors.push(`Messaggio [${i}] mancante di role o content.`);
                break;
            }
            // Enforce lunghezza massima solo per messaggi utente/assistant (non system:
            // il system prompt può essere lungo perché include il nostro prompt + RAG context)
            if (msg.role !== 'system' && typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH) {
                errors.push(`Messaggio [${i}] troppo lungo (${msg.content.length} chars). Max: ${MAX_MESSAGE_LENGTH}.`);
                break;
            }
        }

        const totalChars = body.messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
        if (totalChars > MAX_TOTAL_CHARS) {
            errors.push(`Payload complessivo troppo grande (${totalChars} chars). Max: ${MAX_TOTAL_CHARS}.`);
        }
    }

    if (errors.length > 0) return { valid: false, errors };

    const cleanPayload = {
        model: body.model,
        messages: body.messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : String(m.content)
        })),
        temperature: typeof body.temperature === 'number' ? Math.max(0, Math.min(2, body.temperature)) : 0.5
    };

    cleanPayload.max_tokens = typeof body.max_tokens === 'number' ? Math.min(body.max_tokens, MAX_TOKENS_LIMIT) : MAX_TOKENS_LIMIT;
    if (body.response_format && body.response_format.type === 'json_object') {
        cleanPayload.response_format = { type: 'json_object' };
    }

    return { valid: true, payload: cleanPayload };
}

// --- METERING SERVER-SIDE ---
// Limiti mensili del tier Free. 0 = feature esclusiva Pro.
export const FREE_LIMITS = { aiCalls: 3, oralSessions: 0, tutorChats: 5, aiTraces: 0, pdfExports: 0, aiQuiz: 5, phantomTutor: 0, normeTooltip: 30, lectureSlides: 30 };

// Valida il JWT, controlla il tier e consuma un credito per gli utenti Free.
// Il client Supabase è iniettato come parametro per poter testare la logica senza rete.
export async function applyMetering(supabaseAdmin, token, requestedFeature) {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
        return { ok: false, status: 401, error: 'Token scaduto o non valido.' };
    }
    const userId = userData.user.id;

    const { data: profile } = await supabaseAdmin.from('profiles').select('tier').eq('id', userId).single();
    const tier = (profile && profile.tier) || 'Free';

    if (tier === 'Free') {
        const limit = FREE_LIMITS[requestedFeature];
        if (limit === undefined) return { ok: false, status: 400, error: 'Feature non valida.' };
        if (limit === 0) return { ok: false, status: 403, error: 'Feature esclusiva Pro.' };

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const { data: usageData } = await supabaseAdmin
            .from('usage_metering')
            .select(requestedFeature)
            .eq('user_id', userId)
            .eq('month', currentMonth)
            .single();

        const currentUsage = usageData ? (usageData[requestedFeature] || 0) : 0;
        if (currentUsage >= limit) {
            return { ok: false, status: 403, error: 'Crediti mensili esauriti per questa funzionalità.' };
        }

        // Incrementa il credito
        const upsertPayload = { user_id: userId, month: currentMonth };
        upsertPayload[requestedFeature] = currentUsage + 1;
        await supabaseAdmin.from('usage_metering').upsert(upsertPayload, { onConflict: 'user_id, month' });
    }

    return { ok: true, tier };
}

// I modelli Anthropic Opus 4.7/4.8 hanno DEPRECATO il parametro `temperature`:
// inviarlo provoca un 400 ("`temperature` is deprecated for this model").
// Sonnet 4.6 e Haiku 4.5 lo accettano ancora. Verificato via API il 2026-06-21.
// Se Anthropic rilascia nuovi Opus, aggiungerli qui.
export function anthropicSupportsTemperature(model) {
    return !/^claude-opus-4-[78]\b/.test(model || '');
}

// --- HANDLER PRINCIPALE ---
// In produzione su Vercel la funzione viene comunque uccisa al raggiungimento di
// maxDuration (default 60s): lo streaming evita il taglio lato Anthropic ma NON
// quello della piattaforma, quindi alziamo il tetto per le lezioni Opus lunghe.
// (Richiede piano Vercel Pro; su Hobby resta cappato a 60s.)
export const maxDuration = 300;

export default async function handler(req, res) {
    console.log(`\n[Proxy] 📥 RICHIESTA IN ARRIVO: ${req.method} | Provider: ${req.body?.provider || 'default'}`);
    
    // --- CORS: Origin Whitelist ---
    const origin = req.headers.origin || '';
    const allowedOrigin = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // --- CORS: Reject unauthorized origins ---
    if (!isOriginAllowed(origin)) {
        return res.status(403).json({ error: 'Origin non autorizzata.' });
    }

    // --- Rate Limiting ---
    // x-forwarded-for può essere una lista "client, proxy1, proxy2": il client reale è il primo
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = (typeof forwardedFor === 'string' && forwardedFor.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(ip);
    if (rateCheck.limited) {
        res.setHeader('Retry-After', rateCheck.retryAfter);
        return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche secondo.', retryAfter: rateCheck.retryAfter });
    }

    let ragSources = []; // Fonti RAG trovate, da restituire al frontend

    // --- HANDLER VELOCE: Verifica Citazione Globale ---
    // Controlla se un numero di sentenza esiste nel DB globale (per Tiered Verification)
    if (req.body.feature === 'verifyCitation') {
        const citNum = req.body.citationNumber; // es. "35823/2023"
        if (!citNum || typeof citNum !== 'string') {
            return res.status(400).json({ error: 'citationNumber mancante o non valido' });
        }
        
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        if (!process.env.SUPABASE_URL || !supabaseKey) {
            return res.status(500).json({ error: 'Configurazione Supabase mancante', found: false });
        }
        
        try {
            // Estrai numero e anno
            const parts = citNum.match(/(\d+)\s*[\/\-]\s*(20\d{2})/);
            if (!parts) return res.status(200).json({ found: false, reason: 'formato non valido' });
            
            const sentNum = parts[1];
            const sentYear = parts[2];
            const searchKey = `${sentNum}/${sentYear}`;
            
            // STRATEGIA: Full-Text Search diretto sull'indice GIN (colonna fts) — esatto
            // e in millisecondi, zero chiamate AI. Prima: embedding + ricerca vettoriale,
            // semanticamente debole sui token numerici e con costo/latenza di una embed call.
            // Il parser tsvector tokenizza "35823/2023" come token unico (tipo file) e
            // "n. 35823 del 2023" come due token numerici: copriamo entrambe le forme.
            const restHeaders = {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            };
            const ftsBase = `${process.env.SUPABASE_URL}/rest/v1/rag_chunks?select=id,document_id,content&limit=10`;
            const slashUrl = `${ftsBase}&fts=wfts(italian).${encodeURIComponent(`${sentNum}/${sentYear}`)}`;
            const splitUrl = `${ftsBase}&fts=plfts(italian).${encodeURIComponent(`${sentNum} ${sentYear}`)}`;

            const [slashRows, splitRows] = await Promise.all([
                fetch(slashUrl, { headers: restHeaders }).then(r => r.ok ? r.json() : []).catch(() => []),
                fetch(splitUrl, { headers: restHeaders }).then(r => r.ok ? r.json() : []).catch(() => [])
            ]);
            const seenIds = new Set();
            const matches = [...(Array.isArray(slashRows) ? slashRows : []), ...(Array.isArray(splitRows) ? splitRows : [])]
                .filter(m => !seenIds.has(m.id) && seenIds.add(m.id));
            
            // 3. Filtra: il numero deve comparire nel content del chunk
            // Word boundary: evita che "123" matchi dentro "20123" validando citazioni inesistenti
            const numRegex = new RegExp(`\\b${sentNum}\\b`);
            const yearRegex = new RegExp(`\\b${sentYear}\\b`);
            const verified = matches.filter(m => {
                const content = m.content || '';
                return numRegex.test(content) && yearRegex.test(content);
            });
            
            console.log(`[Verify] 🔍 Citazione ${searchKey}: ${verified.length > 0 ? '✅ TROVATA' : '❌ NON trovata'} (${matches.length} candidati, ${verified.length} confermati)`);
            
            return res.status(200).json({
                found: verified.length > 0,
                count: verified.length,
                snippets: verified.slice(0, 3).map(r => ({
                    document_id: r.document_id || '',
                    excerpt: (r.content || '').substring(0, 300)
                }))
            });
        } catch (verifyErr) {
            console.error(`[Verify] Errore verifica citazione: ${verifyErr.message}`);
            return res.status(200).json({ found: false, error: verifyErr.message });
        }
    }

    try {
        const provider = req.body.provider || 'openai'; // google | anthropic | openai
        const useRAG = req.body.useRAG === true;
        const useWebSearch = req.body.useWebSearch === true;
        const validation = sanitizePayload(req.body);

        if (!validation.valid) {
            return res.status(400).json({ error: 'Payload non valido', details: validation.errors });
        }

        // --- Validazione Modello (anti-abuso costi) ---
        const allowedModels = MODEL_WHITELIST[provider] || [];
        if (allowedModels.length > 0 && !allowedModels.includes(validation.payload.model)) {
            return res.status(400).json({ 
                error: `Modello "${validation.payload.model}" non consentito per il provider "${provider}". Modelli ammessi: ${allowedModels.join(', ')}` 
            });
        }

        // --- METERING SERVER-SIDE (Anti-Abuso) ---
        const requestedFeature = req.body.feature; 
        if (!requestedFeature) {
            return res.status(400).json({ error: 'Payload rifiutato: Manca la feature. Sicurezza anti-abuso attivata.' });
        }
        
        // Bypass metering SOLO in sviluppo locale (server-side check, non spoofabile)
        const isLocalDev = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production';
        
        if (requestedFeature && !isLocalDev) {
            const authHeader = req.headers.authorization;
            
            if (authHeader) {
                // Utente autenticato → metering completo via Supabase DB
                const token = authHeader.replace('Bearer ', '');
                
                const supabaseUrl = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
                const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
                
                if (supabaseUrl && supabaseKey) {
                    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
                    const meterResult = await applyMetering(supabaseAdmin, token, requestedFeature);
                    if (!meterResult.ok) {
                        return res.status(meterResult.status).json({ error: meterResult.error });
                    }
                }
            } else {
                // Ospite (nessun token) → in fase beta, lasciamo passare.
                // Il rate limiter in-memory (sopra) protegge già da abusi.
                console.warn(`[Proxy] Richiesta guest senza auth per feature "${requestedFeature}" — rate limiter only.`);
            }
        }

        // --- RAG INJECTION ---
        if (useRAG) {
            const requestedMateria = req.body.materia || null; // <--- Routing dinamico per materia
            const userMessages = validation.payload.messages.filter(m => m.role === 'user');
            const explicitRagQuery = typeof req.body.ragQuery === 'string' ? req.body.ragQuery.trim().substring(0, 300) : null;
            
            if (explicitRagQuery || userMessages.length > 0) {
                // Prende la query esplicita se presente, altrimenti l'ultimo messaggio dell'utente per la ricerca semantica
                const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';
                const queryText = explicitRagQuery || lastUserMessage;
                
                // Cerca nel DB usando il filtro materia (se presente)
                // Se il client ha fornito una ragQuery esplicita (già mirata),
                // skippa la query expansion server-side per risparmiare ~2s
                // (critico su Vercel Hobby con limite 10s)
                const shouldSkipExpansion = req.body.skipExpansion === true || !!explicitRagQuery;
                const ragResult = await fetchRAGContext(queryText, requestedMateria, shouldSkipExpansion, requestedFeature);
                
                if (ragResult) {
                    // Il RAG va in un messaggio system SEPARATO, non concatenato al prompt:
                    // con Anthropic diventa un blocco cache a sé, così il prompt statico
                    // fa cache-HIT anche quando il contesto RAG cambia a ogni modulo.
                    const ragMessage = `═══════════════════════════════════════════════\n📌 NOTA CRITICA: IL CONTESTO RAG QUI SOTTO È STATO RECUPERATO DAL DATABASE ED È A TUA DISPOSIZIONE.\nHai a disposizione ${ragResult.sources?.length || 'diversi'} frammenti normativi e giurisprudenziali pertinenti.\nUSA QUESTI DATI per fondare la tua risposta. Se contengono estremi di sentenze reali, PUOI citarli.\n═══════════════════════════════════════════════\n${ragResult.contextText}`;
                    const systemIdx = validation.payload.messages.findIndex(m => m.role === 'system');
                    if (systemIdx >= 0) {
                        validation.payload.messages.splice(systemIdx + 1, 0, { role: 'system', content: ragMessage });
                    } else {
                        validation.payload.messages.unshift(
                            { role: 'system', content: 'Sei un assistente giuridico esperto.' },
                            { role: 'system', content: ragMessage }
                        );
                    }
                    ragSources = ragResult.sources || [];
                    console.log(`[RAG] Contesto iniettato con successo! (Materia: ${requestedMateria || 'Tutte'}, Fonti: ${ragSources.length})`);
                } else {
                    console.log(`[RAG] Nessun articolo trovato (Materia: ${requestedMateria || 'Tutte'}).`);
                }
            }
        }

        let fetchUrl;
        let fetchHeaders;
        let fetchBody;

        if (provider === 'google') {
            const googleKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
            if(!googleKey) throw new Error("GOOGLE_AI_KEY o GEMINI_API_KEY mancante");
            
            // L'endpoint OpenAI di Google non supporta la stringa gemini-2.0-flash (dà 404 cieco).
            // L'endpoint Nativo invece la supporta benissimo. Usiamo il nativo.
            let geminiModel = validation.payload.model || 'gemini-3-flash-preview';
            fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleKey}`;
            fetchHeaders = {
                'Content-Type': 'application/json'
            };
            
            // Map messages from OpenAI format to Gemini native format
            let contents = [];
            let systemParts = [];

            validation.payload.messages.forEach(m => {
                if (m.role === 'system') {
                    // Più messaggi system (prompt statico + RAG) → più parts, in ordine.
                    // Prima l'assegnazione sovrascriveva: con due system sopravviveva solo l'ultimo.
                    systemParts.push({ text: m.content });
                } else {
                    contents.push({
                        role: m.role === 'user' ? 'user' : 'model',
                        parts: [{ text: m.content }]
                    });
                }
            });

            if(contents.length === 0) contents.push({role: 'user', parts: [{text: 'Inizia'}]});

            let systemInstruction = systemParts.length > 0 ? { parts: systemParts } : null;

            let geminiPayload = {
                contents: contents,
                generationConfig: {
                    temperature: validation.payload.temperature,
                    maxOutputTokens: validation.payload.max_tokens
                }
            };
            
            if (systemInstruction) {
                geminiPayload.systemInstruction = systemInstruction;
            }

            // Web Search: Gemini Grounding with Google Search
            // ⚠️ ATTENZIONE COMPLIANCE: il tool googleSearch NON supporta una
            // restrizione di dominio (non esiste un allowed_domains) e le citazioni
            // tornano come URL-redirect di Google, quindi nemmeno un filtro a
            // posteriori è affidabile. Qui la whitelist è SOLO soft (prompt): il
            // modello può sforare. Per la ricerca web a norma usare lo stack
            // Anthropic (ACTIVE_AI_STACK='anthropic'), dove allowed_domains è hard.
            if (useWebSearch) {
                geminiPayload.tools = [{ googleSearch: {} }];
                // Inject whitelist instruction into system instruction
                const webSearchDirective = WEB_SEARCH_WHITELIST_PROMPT;
                if (geminiPayload.systemInstruction) {
                    geminiPayload.systemInstruction.parts.push({ text: webSearchDirective });
                } else {
                    geminiPayload.systemInstruction = { parts: [{ text: webSearchDirective }] };
                }
                console.log('[WebSearch] Gemini Grounding attivato');
            }

            fetchBody = JSON.stringify(geminiPayload);
        } 
        else if (provider === 'anthropic') {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if(!anthropicKey) throw new Error("ANTHROPIC_API_KEY mancante");

            fetchUrl = 'https://api.anthropic.com/v1/messages';
            fetchHeaders = {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'prompt-caching-2024-07-31'
            };
            
            // Map to Anthropic format
            let systemBlocks = [];
            let mappedMessages = [];

            validation.payload.messages.forEach(m => {
                if (m.role === 'system') {
                    systemBlocks.push(m.content);
                } else {
                    mappedMessages.push({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content
                    });
                }
            });

            // Se l'array messaggi ora è vuoto (aveva solo un system prompt), aggiungi un dummy
            if(mappedMessages.length === 0) mappedMessages.push({role: 'user', content: 'Inizia.'});

            const anthropicPayload = {
                model: validation.payload.model,
                max_tokens: validation.payload.max_tokens,
                messages: mappedMessages
            };
            // `temperature` solo per i modelli che lo supportano (Opus 4.7/4.8 lo
            // hanno deprecato → 400). Anthropic accetta max 1.0.
            if (anthropicSupportsTemperature(validation.payload.model) && typeof validation.payload.temperature === 'number') {
                anthropicPayload.temperature = Math.min(validation.payload.temperature, 1);
            }

            // Web Search: Claude Native Web Search Tool
            if (useWebSearch) {
                anthropicPayload.tools = [
                    {
                        type: "web_search_20250305",
                        name: "web_search",
                        max_uses: 3,  // Cost control: max 3 ricerche per chiamata
                        // ENFORCEMENT HARD: il tool restituisce SOLO risultati da questi
                        // domini. La whitelist nel prompt resta come guida, ma qui è il
                        // filtro tecnico che impedisce davvero fonti fuori lista.
                        allowed_domains: WEB_SEARCH_ALLOWED_DOMAINS
                    }
                ];
                // Direttiva statica: accodata al PRIMO blocco system (il prompt statico),
                // così resta dentro il blocco cacheabile
                if (systemBlocks.length > 0) systemBlocks[0] += '\n\n' + WEB_SEARCH_WHITELIST_PROMPT;
                else systemBlocks.push(WEB_SEARCH_WHITELIST_PROMPT);
                console.log('[WebSearch] Claude Native Web Search attivato (max 3 uses)');
            }

            // PROMPT CACHING A BLOCCHI: ogni messaggio system diventa un blocco con il suo
            // breakpoint. Blocco 1 = prompt statico (identico tra moduli e utenti → cache HIT),
            // blocco 2 = contesto RAG (cambia per modulo → write solo su quel blocco).
            // Prima erano concatenati in un unico blocco: il RAG invalidava TUTTA la cache.
            const sysBlocks = systemBlocks.map(t => t.trim()).filter(t => t.length > 0);
            if (sysBlocks.length > 3) {
                // Max 4 breakpoint cache totali (3 system + 1 sull'ultimo messaggio): accorpa gli extra
                sysBlocks.splice(2, sysBlocks.length - 2, sysBlocks.slice(2).join('\n\n'));
            }
            if (sysBlocks.length > 0) {
                anthropicPayload.system = sysBlocks.map(text => ({
                    type: "text",
                    text: text,
                    cache_control: { type: "ephemeral" }
                }));
            }

            // Breakpoint anche sull'ultimo messaggio: cacha la storia conversazionale,
            // i turni successivi della stessa sessione riusano il prefisso già cachato
            const lastMsg = mappedMessages[mappedMessages.length - 1];
            if (lastMsg && typeof lastMsg.content === 'string' && lastMsg.content.length > 0) {
                lastMsg.content = [{ type: "text", text: lastMsg.content, cache_control: { type: "ephemeral" } }];
            }

            // STREAMING obbligatorio: con output lunghi (lezioni Opus fino a 4000
            // token) la chiamata NON-streaming viene troncata da Anthropic intorno
            // ai ~60s → la generazione muore a metà e il client vede "Errore di
            // connessione". Con stream:true la connessione resta viva per tutta la
            // durata; qui sotto riaggreghiamo i delta e restituiamo al frontend lo
            // STESSO JSON di prima (nessuna modifica lato client).
            anthropicPayload.stream = true;

            fetchBody = JSON.stringify(anthropicPayload);
        }
        else {
            // Default OpenAI
            const openaiKey = process.env.OPENAI_API_KEY;
            if(!openaiKey) throw new Error("OPENAI_API_KEY mancante");
            
            fetchUrl = 'https://api.openai.com/v1/chat/completions';
            fetchHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            };
            fetchBody = JSON.stringify(validation.payload);
        }

        // Esegui Chiamata Server-to-Server
        const response = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody, signal: AbortSignal.timeout(120000) });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Proxy] Provider ${provider} Error (${response.status}):`, errorText.substring(0, 500));
            
            let detailedError = `Errore dal service provider AI (${provider}).`;
            try {
                const parsedError = JSON.parse(errorText);
                if (parsedError.error && parsedError.error.message) {
                    detailedError += ` Dettaglio: ${parsedError.error.message}`;
                }
            } catch(e) {
                if (errorText) detailedError += ` Dettaglio: ${errorText.substring(0, 150)}`;
            }

            return res.status(response.status >= 500 ? 502 : response.status).json({ 
                error: detailedError 
            });
        }

        // Anthropic risponde in SSE (stream:true): riaggreghiamo i delta in un
        // oggetto con la STESSA forma della risposta non-streaming, così tutta la
        // normalizzazione qui sotto resta identica. Gli altri provider invariati.
        const data = (provider === 'anthropic')
            ? await readAnthropicStream(response)
            : await response.json();

        // Normalizza Anthropic e Google in formato OpenAI
        let normalizedResponse = data;
        
        if (provider === 'google') {
            let contentText = "";
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
                contentText = data.candidates[0].content.parts.map(p => p.text).join("");
            }
            console.log(`[Proxy] Gemini response received: ${contentText.length} chars`);
            normalizedResponse = {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: contentText
                    }
                }],
                usage: {
                    total_tokens: (data.usageMetadata?.totalTokenCount) || 0
                }
            };

            // Estrai citazioni web da Gemini Grounding metadata
            if (useWebSearch && data.candidates?.[0]?.groundingMetadata) {
                const gm = data.candidates[0].groundingMetadata;
                const webCitations = (gm.groundingChunks || []).map(chunk => ({
                    titolo: chunk.web?.title || 'Fonte web',
                    url: chunk.web?.uri || '',
                    tipo: 'web_search',
                    materia: 'Ricerca Web'
                })).filter(c => c.url);
                if (webCitations.length > 0) {
                    normalizedResponse.web_citations = webCitations;
                    console.log(`[WebSearch] Gemini: ${webCitations.length} citazioni web estratte`);
                }
            }
        }
        else if (provider === 'anthropic') {
            // Anthropic: gestione response con/senza web search
            let contentText = "";
            let webCitations = [];

            if (Array.isArray(data.content)) {
                for (const block of data.content) {
                    if (block.type === 'text') {
                        contentText += block.text;
                        // Estrai citazioni inline dal blocco testo
                        if (Array.isArray(block.citations)) {
                            for (const cit of block.citations) {
                                if (cit.type === 'web_search_result_location') {
                                    webCitations.push({
                                        titolo: cit.title || cit.cited_text?.substring(0, 120) || 'Fonte web',
                                        url: cit.url || '',
                                        snippet: cit.cited_text?.substring(0, 200) || '',
                                        tipo: 'web_search',
                                        materia: 'Ricerca Web'
                                    });
                                }
                            }
                        }
                    }
                    // Ignora blocchi tool_use e server_tool_use (interni al web search)
                }
            } else if (data.content?.[0]?.text) {
                contentText = data.content[0].text;
            }

            // Deduplica per URL + rete di sicurezza: scarta eventuali citazioni
            // fuori whitelist (allowed_domains dovrebbe già impedirle a monte).
            const seenUrls = new Set();
            const beforeFilter = webCitations.length;
            webCitations = webCitations.filter(c => {
                if (!c.url || seenUrls.has(c.url)) return false;
                if (!isWebDomainAllowed(c.url)) return false;
                seenUrls.add(c.url);
                return true;
            });
            if (beforeFilter !== webCitations.length) {
                console.warn(`[WebSearch] Anthropic: scartate ${beforeFilter - webCitations.length} citazioni fuori whitelist`);
            }

            normalizedResponse = {
                choices: [{
                    message: { 
                        role: 'assistant', 
                        content: contentText
                    }
                }],
                usage: {
                    total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
                }
            };

            if (webCitations.length > 0) {
                normalizedResponse.web_citations = webCitations;
                console.log(`[WebSearch] Anthropic: ${webCitations.length} citazioni web estratte`);
            }
        }

        // Aggiungi le fonti RAG alla response per il frontend
        if (ragSources.length > 0) {
            normalizedResponse.rag_sources = ragSources;
        }

        return res.status(200).json(normalizedResponse);

    } catch (error) {
        console.error('[Proxy] Internal Error:', error.message);
        return res.status(500).json({ error: 'System Error: ' + error.message });
    }
}

// Legge lo stream SSE di Anthropic (stream:true) e lo riaggrega in un oggetto con
// la STESSA forma della risposta non-streaming: { content: [blocchi], usage }.
// In questo modo la normalizzazione nel handler resta invariata. Ricostruisce i
// blocchi 'text' (con relative citations del web search) e accumula i token usati;
// i blocchi tool_use/server_tool_use vengono ignorati a valle, come prima.
async function readAnthropicStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const blocks = [];                                    // indicizzati per evt.index
    const usage = { input_tokens: 0, output_tokens: 0 };

    const handleEvent = (raw) => {
        let evt;
        try { evt = JSON.parse(raw); } catch { return; }
        switch (evt.type) {
            case 'message_start':
                if (evt.message?.usage) {
                    usage.input_tokens = evt.message.usage.input_tokens || 0;
                    usage.output_tokens = evt.message.usage.output_tokens || 0;
                }
                break;
            case 'content_block_start':
                blocks[evt.index] = (evt.content_block?.type === 'text')
                    ? { type: 'text', text: evt.content_block.text || '', citations: [] }
                    : { type: evt.content_block?.type || 'other' };
                break;
            case 'content_block_delta': {
                const b = blocks[evt.index];
                if (!b) break;
                if (evt.delta?.type === 'text_delta') {
                    b.text = (b.text || '') + (evt.delta.text || '');
                } else if (evt.delta?.type === 'citations_delta' && evt.delta.citation) {
                    (b.citations = b.citations || []).push(evt.delta.citation);
                }
                break;
            }
            case 'message_delta':
                if (evt.usage?.output_tokens != null) usage.output_tokens = evt.usage.output_tokens;
                break;
        }
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of chunk.split('\n')) {
                const t = line.trim();
                if (t.startsWith('data:')) handleEvent(t.slice(5).trim());
            }
        }
    }

    return { content: blocks.filter(Boolean), usage };
}
