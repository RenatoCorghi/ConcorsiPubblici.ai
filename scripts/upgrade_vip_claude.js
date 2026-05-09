import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

const VIP_TARGETS = [
    'Art. 20 - L. 241/1990',           
    'Art. 21-nonies - L. 241/1990',    
    'Art. 55-quater - T.U. Pubblico Impiego', 
    'Art. 36-bis - T.U. Edilizia',     
    'Art. 243-bis - T.U. Enti Locali', 
    'Art. 120 - TUB',                  
    'Art. 33 - Codice Consumo',        
    'Art. 73 - T.U. Stupefacenti'      
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
- L'intervento risolutore delle Sezioni Unite o dell'Adunanza Plenaria (cita le sentenze storiche, se del caso, menzionate nei manuali).
- Eventuali profili di incompatibilità con il Diritto UE o costituzionale].

## 3. Ricadute Pratiche ed Errori Comuni da Evitare nel Tema
[Fornisci al candidato 2-3 "pro-tips" su come utilizzare questo articolo se dovesse uscire come traccia d'esame. Quali sono i tranelli logici in cui cadono i candidati medi?].

Vincolo Formale: Redigi un saggio in prosa accademica italiana fluida e densa. Non utilizzare in alcun caso elenchi puntati, numerati o bullet points per le disquisizioni qualitative. Utilizza terminologia tecnica superiore.`;

async function upgradeToVIPClaude() {
    console.log("💎 Inizio Upgrade Modulo VIP con Claude Opus 4.7...");

    for (const target of VIP_TARGETS) {
        console.log(`\n🔍 Elaborazione VIP per: ${target}`);
        
        const { data, error } = await supabase
            .from('dottrina_sintetica')
            .select('id, istituto, contenuto_markdown')
            .eq('istituto', target)
            .single();

        if (error || !data) {
            console.log(`⚠️ Istituto non trovato nel DB: ${target}`);
            continue;
        }

        const testoOriginale = data.contenuto_markdown;
        const userPrompt = `Redigi l'elaborato VIP per il seguente istituto: ${data.istituto}\nEcco il testo o i riferimenti di base dell'articolo:\n\n${testoOriginale.substring(0, 4000)}`;
        const finalSystemPrompt = SYSTEM_PROMPT.replace('{TITOLO_ARTICOLO}', data.istituto);

        let tentativi = 0;
        const maxTentativi = 3;
        let successo = false;

        while (tentativi < maxTentativi && !successo) {
            tentativi++;
            if (tentativi > 1) console.log(`🔄 Riprovo (tentativo ${tentativi}/${maxTentativi})...`);

            try {
                console.log("🧠 Interrogazione Claude Opus 4.7 in corso...");
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'x-api-key': ANTHROPIC_API_KEY,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'claude-opus-4-7',
                        max_tokens: 4000,
                        system: finalSystemPrompt,
                        messages: [
                            { role: 'user', content: userPrompt }
                        ]
                    })
                });

                const result = await response.json();

                if (!response.ok) {
                    console.error("❌ Errore API Claude:", result.error?.message || response.statusText);
                    const attesa = 20000 * tentativi;
                    console.log(`Attesa di ${attesa/1000}s...`);
                    await new Promise(r => setTimeout(r, attesa));
                    continue;
                }

                const vipMarkdown = result.content[0].text;

                // Aggiornamento DB
                const { error: updateError } = await supabase
                    .from('dottrina_sintetica')
                    .update({ 
                        contenuto_markdown: vipMarkdown,
                        versione_ai: 'Claude Opus 4.7 - VIP' 
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
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    }
    console.log("\n🚀 Upgrade VIP con Claude Opus Terminato!");
}

upgradeToVIPClaude();
