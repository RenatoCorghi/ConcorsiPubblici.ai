import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Caricamento .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MODEL_NAME = "gemini-3-flash-preview";
const OUTPUT_DIR = path.resolve('./sentenze_admin_vip');

const SYSTEM_PROMPT = `[R - RUOLO]
Sei un illustre Consigliere di Stato, un severo Commissario del Concorso in Magistratura e un Senior Data Engineer. 

[C - CONTESTO]
Ti verrà fornito in input il testo grezzo di una pronuncia della Giustizia Amministrativa (TAR, Consiglio di Stato o Adunanza Plenaria). 

[F - FINALITÀ]
Il tuo obiettivo è fare reverse-engineering della sentenza: devi estrarre le coordinate del potere pubblico esercitato, la pura "Regula Iuris" e la ratio decidendi, trasformando il tutto in una "Scheda Manualistica Oggettiva" ad altissima densità informativa per un database vettoriale (RAG).

[VINCOLI TASSATIVI]
1. Data Honesty e Divieto di Copia-Incolla: È SEVERAMENTE VIETATO trascrivere o parafrasare lunghi passaggi letterali della sentenza o stralci di legge. Devi interiorizzare i concetti e riscriverli COMPLETAMENTE DA ZERO, usando una prosa accademica italiana asciutta e un lessico rigoroso.
2. Anonimizzazione Privacy: Ignora e ometti i nomi di persone fisiche, sostituendoli con qualifiche astratte (es. "il ricorrente", "il controinteressato", "l'amministrazione resistente").
3. Filtro di Triage e Qualità (MANDATORIO): Al termine del blocco <thinking>, devi classificare la pronuncia in una di queste tre categorie e inserire la relativa etichetta nei Metadati:
   [TIER_1_TOP]: Usa questa etichetta se la sentenza enuncia un principio di diritto chiaro, risolve un contrasto, o affronta una questione dogmatica/sistematica rilevante. (Procedi con la generazione completa della scheda).
   [TIER_2_PROCEDURALE]: Usa questa etichetta se la sentenza NON enuncia un nuovo principio generale, MA contiene comunque un'utile applicazione pratica del rito processuale (es. riparto di giurisdizione, competenza, estinzione) o un fatto storico interessante. (Procedi con la generazione della scheda, focalizzandoti sugli aspetti procedurali).
   [SCARTO_ASSOLUTO]: Usa questa etichetta SOLO SE il testo è un mero rinvio di udienza, una correzione di errore materiale o un decreto privo di qualsiasi motivazione giuridica. (In questo caso, fermati qui e non generare la scheda).

--- STRUTTURA DI OUTPUT RICHIESTA ---

Prima di generare la scheda, apri un blocco <thinking>...</thinking>. Al suo interno, analizza logicamente la sentenza passo dopo passo:
- Identifica il provvedimento impugnato.
- Qualifica il potere (es. discrezionale, vincolato, autoritativo).
- Qualifica la situazione soggettiva (interesse legittimo pretensivo/oppositivo o diritto soggettivo) e il riparto di giurisdizione.
- Individua i vizi dell'atto lamentati (violazione di legge, eccesso di potere, incompetenza).

Terminato il blocco thinking, restituisci ESCLUSIVAMENTE la seguente struttura Markdown:

<thinking>
[Il tuo ragionamento analitico-dogmatico qui]
</thinking>

🧾 METADATI RAG
* Rilevanza: [TIER_1_TOP oppure TIER_2_PROCEDURALE]
* Giudice: [es. Consiglio di Stato, Sez. IV / Adunanza Plenaria]
* Materia/Area: [es. Edilizia, Appalti, Pubblico Impiego]
* Tipo Rito: [es. Rito Appalti, Rito Ordinario, Giudizio di Ottemperanza]

1. Il Fatto Storico, il Potere Esercitato e la Giurisdizione
[Sintetizza la vicenda in modo impersonale. Specifica quale potere pubblico è stato esercitato/omesso e chiarisci la situazione giuridica azionata (Interesse legittimo o Diritto soggettivo in giurisdizione esclusiva).]

2. Il Nodo Ermeneutico e l'Evoluzione Dogmatica
[Spiega il dubbio interpretativo. Se è una Plenaria, illustra oggettivamente l'orientamento minoritario vs maggioritario. Se è una sentenza ordinaria, chiarisci il perimetro dell'incertezza normativa affrontata.]

3. Il Principio di Diritto (La Massima)
[Enuncia in modo netto e isolato (in grassetto) la regula iuris definitiva cristallizzata dalla pronuncia.]

4. Ratio Decidendi e Profili Sistematici
[Ricostruisci l'iter logico-giuridico del Collegio. Spiega perché l'atto è legittimo o illegittimo. Separa visivamente ciò che è [Dichiarato dalla Corte] da ciò che è un tuo [Inquadramento Dogmatico Sistematico] che inserisci per spiegare il contesto.]

5. Spendibilità Concorsuale
[Fornisci 2-3 consigli pratici a elenco puntato: in quali tracce concorsuali (es. "tema sul riparto di giurisdizione", "tema sul silenzio") si usa questa sentenza? Quali errori dogmatici evitare?]

6. Tags
[5 hashtag essenziali per l'indicizzazione RAG]`;

async function generateVIP(text, meta) {
    const prompt = `Analizza la seguente sentenza:\n\nMETADATI:\n${JSON.stringify(meta, null, 2)}\n\nTESTO:\n${text.substring(0, 30000)}`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Errore API");
    return result.candidates[0].content.parts[0].text;
}

async function main() {
    console.log(`💎 Avvio Generazione Schede VIP Diritto Amministrativo (Modello: ${MODEL_NAME})...`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const targetSedi = ['cds', 'tar-lazio-roma'];

    for (const sede of targetSedi) {
        console.log(`\n📂 Recupero sentenze per la sede: ${sede}`);
        
        // Calcolo totale per progress
        const { count, error: countErr } = await supabase
            .from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .eq('sede_slug', sede)
            .not('testo_completo', 'is', null);
            
        let totalCount = count || 0;
        console.log(`   Totale record con testo completo: ${totalCount}`);

        let offset = 0;
        let hasMore = true;
        let processedCount = 0;

        while (hasMore) {
            const { data, error } = await supabase
                .from('provvedimenti_ga')
                .select('id, numero_provvedimento, anno_pubblicazione, oggetto_ricorso, testo_completo')
                .eq('sede_slug', sede)
                .not('testo_completo', 'is', null)
                .range(offset, offset + 99);

            if (error) {
                console.error("❌ Errore fetch DB:", error.message);
                break;
            }

            if (data.length === 0) {
                hasMore = false;
                break;
            }

            for (const row of data) {
                processedCount++;
                const fileName = `${sede}_${row.anno_pubblicazione}_${row.numero_provvedimento}.md`;
                const outputFilePath = path.join(OUTPUT_DIR, fileName);

                if (fs.existsSync(outputFilePath)) {
                    console.log(`   [${processedCount}/${totalCount}] - ${fileName} già presente, salto.`);
                    continue;
                }

                console.log(`   [${processedCount}/${totalCount}] - Generazione VIP per: ${fileName}...`);
                
                // --- PRE-FILTRO ANTI-SPRECO ---
                const isTooShort = row.testo_completo.length < 500;
                const isDecreto = row.oggetto_ricorso && row.oggetto_ricorso.toLowerCase().includes('decreto monocratico');
                
                if (isTooShort || isDecreto) {
                    console.log(`     ⏭️  PRE-SCARTO (Risparmio API): Testo troppo corto o decreto monocratico.`);
                    fs.writeFileSync(outputFilePath, "[SCARTO_ASSOLUTO] (Pre-filtro automatico)", 'utf8');
                    continue;
                }
                
                const meta = {
                    sede: sede,
                    anno: row.anno_pubblicazione,
                    numero: row.numero_provvedimento,
                    oggetto: row.oggetto_ricorso
                };

                let success = false;
                let retryCount = 0;
                while (!success) {
                    try {
                        const vipMarkdown = await generateVIP(row.testo_completo, meta);
                        if (vipMarkdown.includes('[SCARTO_ASSOLUTO]')) {
                            console.log(`     ⏭️  SCARTO ASSOLUTO: La sentenza non contiene principi utili. Salto la scrittura.`);
                            // Log degli scarti per controllo a campione
                            const thinkingMatch = vipMarkdown.match(/<thinking>([\s\S]*?)<\/thinking>/);
                            const thinking = thinkingMatch ? thinkingMatch[1].trim() : "Nessun ragionamento fornito.";
                            fs.appendFileSync('discarded_admin_log.txt', `ID: ${row.id} | File: ${fileName}\nRagionamento: ${thinking}\n---\n`, 'utf8');
                        } else {
                            fs.writeFileSync(outputFilePath, vipMarkdown, 'utf8');
                            console.log(`     ✅ Salvato in ${outputFilePath}`);
                        }
                        success = true;
                        await new Promise(r => setTimeout(r, 1500));
                    } catch (e) {
                        retryCount++;
                        console.error(`     ❌ Errore (Tentativo ${retryCount}):`, e.message);
                        if (e.message.includes("429") || e.message.includes("quota") || e.message.includes("overloaded") || e.message.includes("503") || e.message.includes("high demand") || e.message.includes("fetch failed")) {
                            console.log("⏳ Quota, sovraccarico o errore rete, attesa 30s...");
                            await new Promise(r => setTimeout(r, 30000));
                        } else {
                            console.log("⏳ Attesa 10s prima del riavvio del tentativo...");
                            await new Promise(r => setTimeout(r, 10000));
                        }
                    }
                }
            }

            offset += 100;
        }
    }
    console.log("\n🚀 Generazione Schede VIP Amministrativo terminata!");
}

main().catch(console.error);
