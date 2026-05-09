import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

// La nostra "Lista d'Oro" estratta dalla Deep Research
const VIP_TARGETS = [
    'Art. 1227 - REGIO DECRETO 16 marzo 1942 n. 262', // Concorso del fatto colposo del creditore
    'Art. 2043 - REGIO DECRETO 16 marzo 1942 n. 262', // Risarcimento per fatto illecito
    'Art. 2059 - REGIO DECRETO 16 marzo 1942 n. 262', // Danno non patrimoniale
    'Art. 2744 - REGIO DECRETO 16 marzo 1942 n. 262', // Divieto del patto commissorio
    'Art. 2041 - REGIO DECRETO 16 marzo 1942 n. 262', // Azione di arricchimento
    'Art. 110 - REGIO DECRETO 19 ottobre 1930 n. 1398', // Concorso di persone
    'Art. 116 - REGIO DECRETO 19 ottobre 1930 n. 1398', // Reato diverso da quello voluto
    'Art. 117 - REGIO DECRETO 19 ottobre 1930 n. 1398'  // Mutamento del titolo del reato
];

const SYSTEM_PROMPT = `Sei un illustre Professore Ordinario di Diritto ed ex Presidente di Sezione della Suprema Corte di Cassazione. Il tuo compito è redigere una scheda dottrinale ad altissimo contenuto scientifico sull'articolo di legge fornito.

Il testo finale NON deve essere una parafrasi della norma, ma deve preparare un candidato al Concorso in Magistratura o Notariato.

STRUTTURA RIGOROSA DEL TESTO (In Markdown):

# {TITOLO_ARTICOLO}

## 1. Genesi, Ratio e Inquadramento Sistematico
[Spiega da dove nasce l'istituto, qual è l'interesse protetto dal legislatore e come si inserisce nel sistema generale. Usa un linguaggio forbito, tecnico e assertivo].

## 2. Il Dibattito Dottrinale e i Contrasti Giurisprudenziali
[Esponi analiticamente:
- La tesi tradizionale/minoritaria.
- La tesi contrapposta.
- L'intervento risolutore delle Sezioni Unite o dell'Adunanza Plenaria (cita le sentenze storiche, se del caso, menzionate nei manuali, ad es. SS.UU. sull'anatocismo, Plenaria sul silenzio, ecc.).
- Eventuali profili di incompatibilità con il Diritto UE o costituzionale].

## 3. Ricadute Pratiche ed Errori Comuni da Evitare nel Tema
[Fornisci al candidato 2-3 "pro-tips" su come utilizzare questo articolo se dovesse uscire come traccia d'esame. Quali sono i tranelli logici in cui cadono i candidati medi?].

Vincolo Formale: Redigi un saggio in prosa accademica italiana fluida e densa. Non utilizzare in alcun caso elenchi puntati, numerati o bullet points per le disquisizioni qualitative. Utilizza terminologia tecnica superiore.`;

async function upgradeToVIP() {
    console.log("💎 Inizio Upgrade Modulo VIP per i Top-Tier Institutes...");

    for (const target of VIP_TARGETS) {
        console.log(`\n🔍 Elaborazione VIP per: ${target}`);
        
        // 1. Recupero testo base dal DB
        const { data, error } = await supabase
            .from('dottrina_sintetica')
            .select('id, istituto, contenuto_markdown, materia')
            .eq('istituto', target)
            .single();

        if (error || !data) {
            console.log(`⚠️ Istituto non trovato nel DB: ${target}`);
            continue;
        }

        // Estrai il testo puro eliminando i vecchi commenti AI (per pulire il prompt)
        const testoOriginale = data.contenuto_markdown;

        // 2. Chiamata a Gemini Pro 1.5
        const userPrompt = `Redigi l'elaborato VIP per il seguente istituto: ${data.istituto}\nEcco il testo o i riferimenti di base dell'articolo:\n\n${testoOriginale.substring(0, 4000)}`;
        const finalSystemPrompt = SYSTEM_PROMPT.replace('{TITOLO_ARTICOLO}', data.istituto);

        let tentativi = 0;
        const maxTentativi = 10;
        let successo = false;

        while (tentativi < maxTentativi && !successo) {
            tentativi++;
            if (tentativi > 1) console.log(`🔄 Riprovo (tentativo ${tentativi}/${maxTentativi})...`);

            try {
                console.log("🧠 Interrogazione Gemini 3.1 Pro in corso...");
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: finalSystemPrompt }] },
                        contents: [{ role: "user", parts: [{ text: userPrompt }] }]
                    })
                });

                if (response.status === 429 || response.status === 503) {
                    const attesa = 20000 * tentativi;
                    console.warn(`⚠️ API Sovraccarica (${response.status}). Attesa di ${attesa/1000}s...`);
                    await new Promise(r => setTimeout(r, attesa));
                    continue;
                }

                const result = await response.json();
                
                if (!response.ok) {
                    if (result.error?.message && result.error.message.includes("demand")) {
                        const attesa = 30000 * tentativi;
                        console.warn(`⚠️ High demand detected. Attesa di ${attesa/1000}s...`);
                        await new Promise(r => setTimeout(r, attesa));
                        continue;
                    }
                    console.error("❌ Errore API:", result.error?.message);
                    break;
                }

                const vipMarkdown = result.candidates[0].content.parts[0].text;

                // 3. Aggiornamento DB
                const { error: updateError } = await supabase
                    .from('dottrina_sintetica')
                    .update({ 
                        contenuto_markdown: vipMarkdown,
                        versione_ai: 'Gemini 3.1 Pro - VIP' 
                    })
                    .eq('id', data.id);

                if (updateError) {
                    console.error(`❌ Errore salvataggio VIP per ${target}:`, updateError);
                } else {
                    console.log(`✅ Upgrade VIP completato con successo per ${target}!`);
                    successo = true;
                }

            } catch (err) {
                console.error("❌ Errore di rete/connessione:", err.message);
                const attesa = 15000 * tentativi;
                console.log(`Attesa ${attesa/1000}s prima del riavvio...`);
                await new Promise(r => setTimeout(r, attesa));
            }
        }
    }
    console.log("\n🚀 Upgrade VIP Terminato!");
}

upgradeToVIP();
