// data.js — Non importa più cloud.js: usa direttamente window.supabaseClient

export let DB_TRACCE = [];
export let GLOSSARIO_ISTITUTI = {};

const FALLBACK_TRACCE = [
    // Civile 2018-2024
    { id: 1, materia: "Civile", anno: "2024", testo: "Premessi cenni sui criteri di liquidazione del danno, tratti il candidato del danno non patrimoniale da inadempimento contrattuale e dei suoi presupposti.", estratta: true, elementi_chiave: ["Art. 1218 c.c.", "Sentenze di S. Martino", "Nesso di causalità"], insidie: "Non confondere il danno morale con il danno biologico e non allargare eccessivamente sulla responsabilità extracontrattuale." },
    { id: 2, materia: "Civile", anno: "2023", testo: "La caparra confirmatoria, la clausola penale e le tutele del contraente fedele in caso di inadempimento.", estratta: true },
    { id: 3, materia: "Civile", anno: "2022", testo: "Usucapione di beni indivisi e dinamiche della comunione ereditaria.", estratta: true },
    { id: 4, materia: "Civile", anno: "2021", testo: "La prelazione volontaria e legale: natura, effetti e tutela del prelazionario pretermesso.", estratta: true },
    { id: 5, materia: "Civile", anno: "2019", testo: "Il trust e il divieto del patto commissorio.", estratta: true },
    { id: 6, materia: "Civile", anno: "2018", testo: "Le servitù prediali: costituzione, estinzione e tutela giurisdizionale.", estratta: true },
    { id: 7, materia: "Civile", anno: "2025", testo: "Il danno biologico e i profili risarcitori nella giurisprudenza della Cassazione a Sezioni Unite.", estratta: false },
    { id: 8, materia: "Civile", anno: "2025", testo: "Le azioni a tutela della proprietà e il confine con il possesso.", estratta: false },
    
    // Penale 2018-2024
    { id: 9, materia: "Penale", anno: "2024", testo: "Premessi cenni sul concorso formale, tratti il candidato del reato continuato e dei limiti alla sua configurabilità.", estratta: true },
    { id: 10, materia: "Penale", anno: "2023", testo: "Il dolo eventuale e la colpa cosciente nella più recente giurisprudenza di legittimità.", estratta: true },
    { id: 11, materia: "Penale", anno: "2022", testo: "La legittima difesa domiciliare e l'eccesso colposo ex art. 55 c.p.", estratta: true },
    { id: 12, materia: "Penale", anno: "2021", testo: "Il falso ideologico e le sue declinazioni in concorso con i reati contro la P.A.", estratta: true },
    { id: 13, materia: "Penale", anno: "2019", testo: "I reati omissivi impropri e le posizioni di garanzia del datore di lavoro.", estratta: true },
    { id: 14, materia: "Penale", anno: "2018", testo: "Concorso esterno in associazione mafiosa: presupposti e profili probatori.", estratta: true },
    { id: 15, materia: "Penale", anno: "2025", testo: "Reati informatici e sequestro dei dispositivi: profili sostanziali e processuali.", estratta: false },
    { id: 16, materia: "Penale", anno: "2025", testo: "L'ergastolo ostativo alla luce delle sentenze della Corte Costituzionale.", estratta: false },

    // Amministrativo 2018-2024
    { id: 17, materia: "Amministrativo", anno: "2024", testo: "L'interesse legittimo pretensivo e le nuove frontiere del risarcimento del danno.", estratta: true },
    { id: 18, materia: "Amministrativo", anno: "2023", testo: "Il soccorso istruttorio e i limiti di regolarizzazione nei contratti pubblici.", estratta: true },
    { id: 19, materia: "Amministrativo", anno: "2022", testo: "Il silenzio assenso tra riforme di semplificazione e autotutela amministrativa.", estratta: true },
    { id: 20, materia: "Amministrativo", anno: "2021", testo: "L'avvalimento nei contratti pubblici: profili di responsabilità e giurisprudenza recente.", estratta: true },
    { id: 21, materia: "Amministrativo", anno: "2019", testo: "Gli aiuti di Stato e la giurisdizione del giudice amministrativo e civile.", estratta: true },
    { id: 22, materia: "Amministrativo", anno: "2018", testo: "Il riparto di giurisdizione e la colpa della P.A. nel provvedimento illegittimo.", estratta: true },
    { id: 23, materia: "Amministrativo", anno: "2025", testo: "La revoca e l'annullamento d'ufficio degli atti amministrativi.", estratta: false },
    { id: 24, materia: "Amministrativo", anno: "2025", testo: "Le ordinanze contingibili e urgenti dei sindaci: limiti e tutele.", estratta: false }
];

export const FALLBACK_GLOSSARIO = {
    "Civile": ["Azione Revocatoria", "Azione Surrogatoria", "Caparra Confirmatoria", "Cessione del Credito", "Clausola Penale", "Comunione Ereditaria", "Contratto Preliminare", "Danno Biologico", "Danno Non Patrimoniale", "Danno Punitivo", "Delegazione", "Divieto del Patto Commissorio", "Eccezione di Inadempimento", "Enfiteusi", "Espromissione", "Fideiussione", "Fondo Patrimoniale", "Garanzia per Evizione", "Gestione di Affari Altrui", "Impossibilità Sopravvenuta", "Impugnazione del Testamento", "Indebito Oggettivo", "Ingiustificato Arricchimento", "Legato", "Mandato", "Mutuo", "Negozio Fiduciario", "Novazione", "Nullità di Protezione", "Obbligazioni Naturali", "Patto di Famiglia", "Prelazione", "Rappresentanza", "Rescissione", "Responsabilità Aquiliana", "Responsabilità Oggettiva", "Responsabilità Precontrattuale", "Riservatezza (Privacy)", "Risoluzione per Eccessiva Onerosità", "Servitù Prediali", "Simulazione", "Successione Necessaria", "Superficie", "Transazione", "Trust", "Usucapione"],
    "Penale": ["Abolitio Criminis", "Accertamento del Nesso Causale", "Appropriazione Indebita", "Associazione a Delinquere", "Autoriciclaggio", "Azione Penalmente Rilevante", "Bancarotta Fraudolenta", "Causa di Giustificazione", "Colpa Cosciente", "Colpa Medica", "Concorso di Cause", "Concorso di Persone nel Reato", "Concorso Esterno in Associazione Mafiosa", "Concussione", "Confisca", "Consenso dell'Avente Diritto", "Corruzione", "Delitto Tentato", "Dolo Eventuale", "Dolo Specifico", "Eccesso Colposo", "Ergastolo Ostativo", "Estorsione", "Falso Ideologico", "Furto", "Imputabilità", "Legittima Difesa", "Malversazione", "Minorata Difesa", "Omicidio Preterintenzionale", "Omissione di Soccorso", "Peculato", "Posizione di Garanzia", "Reato Aberrante", "Reato Continuato", "Reato Impossibile", "Reati Informatici", "Reato Omissivo Improprio", "Responsabilità degli Enti (D.Lgs. 231)", "Ricettazione", "Riciclaggio", "Sostituzione di Persona", "Stalking (Atti Persecutori)", "Stato di Necessità", "Truffa"],
    "Amministrativo": ["Abuso d'Ufficio", "Accesso agli Atti", "Accordo di Programma", "Aiuti di Stato", "Annullamento di Ufficio", "Autotutela", "Avvalimento", "Bando di Gara", "Concessione", "Conferenza di Servizi", "Contratti Pubblici", "Danno da Ritardo", "DIA/SCIA", "Difetto di Motivazione", "Direttive Europee", "Discrezionalità Amministrativa", "Discrezionalità Tecnica", "Eccesso di Potere", "Elementi Essenziali del Provvedimento", "Espropriazione per Pubblica Utilità", "Giudicato Amministrativo", "Giurisdizione Esclusiva", "Giurisdizione di Merito", "Incompetenza", "Interesse Legittimo", "Nullità del Provvedimento", "Ordinanze Contingibili e Urgenti", "Partenariato Pubblico Privato", "PGT/Piano Regolatore", "Preavviso di Rigetto", "Principio di Precauzione", "Principio di Proporzionalità", "Project Financing", "Promotore Finanziario", "Project Review", "Responsabilità della P.A.", "Revoca del Provvedimento", "Ricorso Straordinario", "Riparto di Giurisdizione", "Rito Appalti", "Silenzio Assenso", "Silenzio Inadempimento", "Sindacato Intrinseco", "Soccorso Istruttorio", "Termine di Conclusione del Procedimento", "Vizi di Legittimità"]
};

export const DB_COMMUNITY = {
    channels: [
        { id: 'general', name: 'Generale', icon: 'hash' },
        { id: 'magistratura', name: 'Magistratura', icon: 'scale' },
        { id: 'avvocatura', name: 'Avvocatura', icon: 'briefcase' },
        { id: 'notariato', name: 'Notariato', icon: 'scroll-text' },
        { id: 'commissari', name: 'Commissari di Polizia', icon: 'shield' },
        { id: 'dirigenti', name: 'Dirigenti PA', icon: 'building' },
        { id: 'segretari', name: 'Segretari Comunali', icon: 'landmark' },
        { id: 'diplomatica', name: 'Carriera Diplomatica', icon: 'globe' },
        { id: 'study_groups', name: 'Gruppi di Studio', icon: 'users' },
        { id: 'resources', name: 'Risorse e Sentenze', icon: 'book-open' },
        { id: 'offtopic', name: 'Off-Topic', icon: 'coffee' }
    ],
    users: [
        { id: 'u1', name: 'Marco Rossi', avatar: 'https://i.pravatar.cc/150?u=u1', tier: 'Plus', concorso: 'Magistratura', online: true, stats: { corretti: 45, media: 16.5, streak: 12 } },
        { id: 'u2', name: 'Elena Bianchi', avatar: 'https://i.pravatar.cc/150?u=u2', tier: 'Free', concorso: 'Avvocatura', online: false, stats: { corretti: 12, media: 14.0, streak: 3 } },
        { id: 'u3', name: 'Giuseppe Verdi', avatar: 'https://i.pravatar.cc/150?u=u3', tier: 'Plus', concorso: 'Magistratura', online: true, stats: { corretti: 89, media: 18.2, streak: 45 } },
        { id: 'u4', name: 'Sara Conti', avatar: 'https://i.pravatar.cc/150?u=u4', tier: 'Free', concorso: 'Magistratura', online: true, stats: { corretti: 5, media: 12.0, streak: 1 } },
        { id: 'u5', name: 'Admin', avatar: 'https://i.pravatar.cc/150?u=admin', tier: 'Admin', concorso: 'Tutti', online: true, stats: { corretti: 999, media: 20.0, streak: 365 } }
    ],
    posts: [
        { id: 'p1', channel_id: 'magistratura', user_id: 'u3', content: 'Qualcuno sa se la sentenza a Sezioni Unite sul concorso esterno è prevista come traccia probabile?', likes: 12, timestamp: '2 ore fa' },
        { id: 'p2', channel_id: 'magistratura', user_id: 'u4', content: 'Io ho appena fatto una simulazione, spero non capiti 😅', likes: 2, timestamp: '1 ora fa' },
        { id: 'p3', channel_id: 'resources', user_id: 'u5', content: 'Ho caricato il nuovo compendio sulle novità legislative. Lo trovate nella sezione drive condivisa.', likes: 45, timestamp: 'Ieri' },
        { id: 'p4', channel_id: 'study_groups', user_id: 'u1', content: 'Cerco compagno di studi per interrogazioni crociate su amministrativo la sera. Qualcuno interessato?', likes: 5, timestamp: '3 ore fa' },
        { id: 'p5', channel_id: 'general', user_id: 'u2', content: 'Buono studio a tutti per questo weekend lungo!', likes: 18, timestamp: 'Venerdì scorso' }
    ],
    messages: [
        { id: 'm1', chat_id: 'u3', text: 'Ciao! Ho visto il tuo post, anche a me preoccupa il concorso esterno.', me: false, time: '10:30' },
        { id: 'm2', chat_id: 'u3', text: 'Sì, è un tema insidioso. Hai appunti a riguardo?', me: true, time: '10:35' },
        { id: 'm3', chat_id: 'u3', text: 'Te li giro tra poco!', me: false, time: '10:40', unread: true },
        { id: 'm4', chat_id: 'u1', text: 'Per amministrativo ci sn io stasera se vuoi', me: false, time: 'Ieri', unread: false }
    ]
};

export async function fetchRemoteData() {
    try {
        if (!window.supabaseClient) {
            console.warn("Supabase client non inizializzato. Uso dati fallback locale.");
            DB_TRACCE.push(...FALLBACK_TRACCE);
            Object.assign(GLOSSARIO_ISTITUTI, FALLBACK_GLOSSARIO);
            return;
        }

        // --- CACHE LAYER FOR INSTANT BOOT ---
        const cachedTracce = localStorage.getItem('concorsi_cache_tracce');
        const cachedGlossario = localStorage.getItem('concorsi_cache_glossario');
        
        if (cachedTracce && cachedGlossario) {
            try {
                DB_TRACCE.push(...JSON.parse(cachedTracce));
                Object.assign(GLOSSARIO_ISTITUTI, JSON.parse(cachedGlossario));
                console.log("⚡ [DATA.JS] Caricato da Cache Locale. Boot Istantaneo.");
                
                // Fetch in background senza bloccare il boot UI
                _fetchAndSyncSupabaseData().catch(e => console.error("Errore Background Sync:", e));
                return; // Resolve immediately
            } catch(e) {
                console.warn("Cache corrotta, forzo fetch remoto.");
            }
        }

        // Se non c'è cache, blocca il boot e aspetta il fetch (primo avvio)
        await _fetchAndSyncSupabaseData();

    } catch(err) {
        console.error("Errore fetchRemoteData:", err);
        if (DB_TRACCE.length === 0) DB_TRACCE.push(...FALLBACK_TRACCE);
        if (Object.keys(GLOSSARIO_ISTITUTI).length === 0) Object.assign(GLOSSARIO_ISTITUTI, FALLBACK_GLOSSARIO);
    }
}

async function _fetchAndSyncSupabaseData() {
    console.log("🚀 [DATA.JS] Sync Remoto in corso...");
    
    // FETCH TRACCE
    const { data: tracce, error: errT } = await window.supabaseClient.from('tracce').select('*').order('id', { ascending: true });
    if (!errT && tracce && tracce.length > 0) {
        DB_TRACCE.length = 0;
        DB_TRACCE.push(...tracce);
        localStorage.setItem('concorsi_cache_tracce', JSON.stringify(tracce));
    } else if (DB_TRACCE.length === 0) {
        DB_TRACCE.push(...FALLBACK_TRACCE);
    }

    // FETCH GLOSSARIO (Pagination)
    let glossario = [];
    let from = 0;
    let step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data: pageData, error: errG } = await window.supabaseClient
            .from('dottrina_sintetica')
            .select('materia, istituto')
            .order('istituto', { ascending: true })
            .range(from, from + step - 1);

        if (errG) {
            console.error("Errore fetch Glossario:", errG);
            hasMore = false;
            break;
        }

        if (pageData && pageData.length > 0) {
            glossario = glossario.concat(pageData);
            from += step;
            if (pageData.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    if (glossario.length > 0) {
        const mapped = {};
        
        // Mappa i vecchi nomi
        for (let k in FALLBACK_GLOSSARIO) {
            let newKey = k;
            if (k === 'Civile') newKey = 'Diritto Civile';
            if (k === 'Penale') newKey = 'Diritto Penale';
            if (k === 'Amministrativo') newKey = 'Diritto Amministrativo';
            mapped[newKey] = [...FALLBACK_GLOSSARIO[k]];
        }
        
        glossario.forEach(g => {
            let m = g.materia;
            if (!mapped[m]) mapped[m] = [];
            if (!mapped[m].includes(g.istituto)) {
                mapped[m].push(g.istituto);
            }
        });
        
        for (let m in mapped) {
            mapped[m].sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
        }
        
        for (let key in GLOSSARIO_ISTITUTI) delete GLOSSARIO_ISTITUTI[key];
        Object.assign(GLOSSARIO_ISTITUTI, mapped);
        localStorage.setItem('concorsi_cache_glossario', JSON.stringify(mapped));
    } else if (Object.keys(GLOSSARIO_ISTITUTI).length === 0) {
        Object.assign(GLOSSARIO_ISTITUTI, FALLBACK_GLOSSARIO);
    }
    
    console.log(`✅ [DATA.JS] Sync completato: ${DB_TRACCE.length} tracce.`);
}

