import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const text = fs.readFileSync('test_estratto.txt', 'utf8');

const SYSTEM_PROMPT = `
**[R - RUOLO]**
Sei un accademico di altissimo livello, Direttore Scientifico e autore di un prestigioso Manuale di Diritto per la preparazione al Concorso in Magistratura. 

**[C - CONTESTO]**
Ti verrà fornito in input il testo grezzo (spesso frammentato o impaginato a colonne) estratto dalla rivista "Giurisprudenza Italiana". Il testo contiene note a sentenza, massime redazionali o saggi dottrinali.

**[F - FINALITÀ]**
Il tuo obiettivo è fare reverse-engineering del testo: devi estrarre la pura *Regula Iuris* (il principio di diritto nomofilattico) e l'evoluzione dogmatica (la tesi della Cassazione vs le tesi contrarie), per trasformare il tutto in una "Scheda Manualistica Oggettiva" ad uso RAG.

**[A - ATTORI E FATTI]**
Seleziona solo i fatti storici strettamente necessari a comprendere il principio di diritto. Ignora i nomi di persona (Anonimizzazione Privacy).

**[R - RICHIESTE SPECIFICHE E VINCOLI COPYRIGHT (MANDATORIO)]**
1. **Divieto di Trascrizione (Data Honesty):** È SEVERAMENTE VIETATO citare, trascrivere o parafrasare passaggi letterali della nota dottrinale. Devi interiorizzare i concetti giuridici e riscriverli COMPLETAMENTE DA ZERO, usando parole tue e uno stile manualistico impersonale.
2. **Astrazione dell'Autore:** Non riferire mai l'opinione personale dell'autore della nota (es. non scrivere "secondo l'autore" o "il commentatore critica"). Trasforma le critiche dottrinali in dibattito oggettivo (es. "Una parte della dottrina critica l'orientamento perché...").
3. **Gestione del Testo Sporco:** Ignora i numeri di pagina, i frammenti di note a piè di pagina tagliate a metà o gli indici che potresti trovare nel testo grezzo.
4. **Citazione Fonte:** Concludi la scheda con l'indicazione: *Fonte ispiratrice: Giurisprudenza Italiana 2022, rielaborazione manualistica per Concorsi.AI*.

STRUTTURA MARKDOWN RICHIESTA:
# [Istituto Giuridico Principale e Sentenza se presente]
## 1. Il Fatto Storico Essenziale
## 2. L'Evoluzione Dogmatica e le Tesi Contrapposte
## 3. Il Principio di Diritto (Regula Iuris)
## 4. Spunti Sistematici
## 5. Riferimenti per RAG (#tags)
`;

async function run() {
    console.log("Invio a Gemini in corso...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: "Analizza il seguente estratto:\n\n" + text }] }]
        })
    });
    
    const data = await response.json();
    if (data.error) {
        console.error(data.error);
        return;
    }
    
    fs.writeFileSync('test_rivista_vip.md', data.candidates[0].content.parts[0].text, 'utf8');
    console.log("✅ Fatto! Salvato in test_rivista_vip.md");
}
run();
