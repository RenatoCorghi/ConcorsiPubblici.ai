# 🛡️ PROTOCOLLO COMPLIANCE WEB SEARCH v2.0
# Aggiornato il 2026-06-04
# Origine: Deep Research su licenze, ToS, Legge 132/2025, GDPR
# Implementato in: api/proxy.js → WEB_SEARCH_WHITELIST_PROMPT

---

## Obiettivo

Questo protocollo governa quali fonti web l'Agente IA può consultare durante la ricerca internet in tempo reale (Gemini Grounding / Claude Web Search). Si applica a tutte le feature con `useWebSearch=true`.

---

## Sezione 1: Whitelist delle Fonti Consentite (GREEN LIGHT)

| Canale / Sito | URL | Licenza / Modalità d'uso |
|---|---|---|
| **Gazzetta Ufficiale** | `gazzettaufficiale.it` | Dati aperti per default (Art. 52 CAD) |
| **Normattiva** | `normattiva.it` | Interrogazione multivigenza dei testi di legge |
| **Eur-Lex** | `eur-lex.europa.eu` | CC BY 4.0 (editoriale) / CC0 (metadata) |
| **Corte Costituzionale** | `cortecostituzionale.it` | Open Data ex CAD |
| **Corte di Giustizia UE** | `curia.europa.eu` | Riproduzione libera con citazione "CGUE" |
| **Giustizia Amministrativa** | `giustizia-amministrativa.it` | Open GA — dati riutilizzabili con citazione |
| **Open GA** | `openga.giustizia-amministrativa.it` | Dati liberamente distribuibili |
| **SentenzeWeb** | `italgiure.giustizia.it/sncass/` | Consultazione libera e gratuita delle massime |
| **Corte di Cassazione** | `cortedicassazione.it` | Sito istituzionale |
| **Parlamento** | `camera.it` / `senato.it` | Lavori parlamentari pubblici |
| **Eurojus (Fascia A)** | `rivista.eurojus.it` | CC BY 4.0 — riutilizzo commerciale consentito |
| **Cardozo Bulletin (Fascia A)** | `ojs.unito.it/index.php/cardozo` | Open Access pieno |
| **Giureta (Fascia A)** | `www.giureta.unipa.it` | Open Access pieno |
| **Dottrina Trasporti (Fascia A)** | `www.dirittoepoliticadeitrasporti.it` | CC BY 4.0 Gold Open Access |

---

## Sezione 2: Fonti Vietate (RED LIGHT)

### Banche Dati Commerciali (ToS vietano uso automatizzato)
| Fonte | URL | Motivo blocco |
|---|---|---|
| ItalgiureWeb (CED) | `italgiure.giustizia.it` (escluso `/sncass/`) | Accesso a pagamento, ToS click-wrap vietano scraping |
| DeJure Giuffrè | `dejure.it` | Banca dati commerciale protetta da copyright |
| IusExplorer | `iusexplorer.it` | Wolters Kluwer, accesso commerciale |
| Pluris CEDAM | `pluris-cedam.utetgiuridica.it` | CEDAM/UTET, accesso a pagamento |

### Riviste con Opt-Out TDM (Legge 132/2025)
Qualsiasi rivista che espone:
- File `/.well-known/tdmrep.json` con diritti riservati
- Header HTTP `tdm-reservation: 1`
- Meta tag `<meta name="tdm-reservation" content="1"/>`
- Direttive anti-bot nel `robots.txt`

### Riviste Open Access con Licenza Non-Commerciale (NC)
| Rivista | Licenza | Motivo blocco |
|---|---|---|
| Sistema Penale | BY-NC-ND | Clausola NC incompatibile con app monetizzata |
| Ceridap | BY-NC-ND | Clausola NC incompatibile |
| Federalismi | BY-NC | Clausola NC incompatibile |
| Biodiritto | BY-NC | Clausola NC incompatibile |
| Diritto Penale Uomo | BY-NC | Clausola NC incompatibile |
| MediaLaws | BY-NC | Clausola NC incompatibile |
| Archivio Penale | BY-NC | Clausola NC incompatibile |
| La Legislazione Penale | BY-NC | Clausola NC incompatibile |
| Judicium | Diritti riservati | Nessuna licenza aperta |
| Milan Law Review | BY-NC-SA | Clausola NC incompatibile |

---

## Sezione 3: Guardrails di Sicurezza

### 3A. Double-Check Temporale (Anti-Anacronismi)
Ogni documento web deve essere verificato cronologicamente rispetto a queste riforme cardine:
- **Riforma Cartabia** — D.Lgs. 149/2022 e 150/2022
- **Nuovo Codice Contratti** — D.Lgs. 36/2023
- **Riforma Fiscale** — D.Lgs. 219-221/2023
- **Abolizione Abuso d'Ufficio** — L. 114/2024 ("Riforma Nordio")
- **Direttiva Danni da Prodotto** — 2024/2853
- **Legge IA e Copyright** — L. 132/2025

Se il documento è anteriore alla riforma pertinente → qualificarlo come "storico dibattito dogmatico".

### 3B. Anonimizzazione Strategica Citazioni Isolate
Se emerge una sentenza con soli estremi numerici (senza testo/massima), convertire in formula astratta.

### 3C. Gerarchia delle Fonti
1. Normativa vigente (Normattiva, GU, Eur-Lex)
2. Giurisprudenza istituzionale (Corte Cost., CGUE, CdS, Cassazione)
3. Riviste scientifiche Fascia A (solo quelle in §1)
4. MAI fonti non verificate o non in whitelist

---

## Changelog

### v2.0 (2026-06-04)
- **RIMOSSI** da whitelist: ItalgiureWeb CED, DeJure Giuffrè (RED — ToS commerciali)
- **RIMOSSI** da whitelist: 9 riviste Fascia A con licenza NC (sistemapenale, ceridap, federalismi, biodiritto, dirittopenaleuomo, medialaws, archiviopenale, lalegislazionepenale, judicium)
- **AGGIUNTI** in whitelist: curia.europa.eu, openga.giustizia-amministrativa.it, SentenzeWeb (/sncass/), rivista.eurojus.it, Cardozo Bulletin, Giureta, Dottrina Trasporti
- **AGGIUNTA** sezione §2 Blacklist esplicita nel prompt
- **AGGIUNTA** sezione §4 Guardrails compliance (double-check temporale, anonimizzazione, gerarchia fonti)

### v1.0 (2026-05-xx)
- Versione iniziale con 18 fonti senza distinzione RED/YELLOW/GREEN
- Nessuna blacklist esplicita
- Nessun guardrail compliance

---

> **Nota:** Il prompt effettivo è in `api/proxy.js` nella costante `WEB_SEARCH_WHITELIST_PROMPT`.
> Questo file .md è la documentazione di riferimento.
