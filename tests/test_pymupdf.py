# -*- coding: utf-8 -*-
import os
import fitz  # PyMuPDF
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print("ERRORE: GEMINI_API_KEY non trovata nel file .env")
    exit(1)

genai.configure(api_key=api_key)

model = genai.GenerativeModel('gemini-1.5-pro')

PDF_PATH = r"C:\Users\Pc\OneDrive\Desktop\concorsi-ai\data\giurisprudena italiana\giurit_2022_1.pdf"
OUTPUT_PATH = r"C:\Users\Pc\OneDrive\Desktop\concorsi-ai\test_rivista_vip.md"

SYSTEM_PROMPT = """
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
"""

print("1. Apertura PDF tramite PyMuPDF...")
doc = fitz.open(PDF_PATH)

print(f"Il PDF ha {doc.page_count} pagine.")

start_page = 10
end_page = 15
extracted_text = ""

for page_num in range(start_page, end_page + 1):
    if page_num < doc.page_count:
        page = doc.load_page(page_num)
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        for b in blocks:
            text = b[4]
            extracted_text += text + "\n"

print(f"2. Estratti {len(extracted_text)} caratteri. Invio a Gemini...")

prompt = f"Analizza il seguente estratto dalla rivista Giurisprudenza Italiana:\n\n{extracted_text}"

try:
    response = model.generate_content(
        contents=prompt,
        generation_config={"temperature": 0.2},
        system_instruction=SYSTEM_PROMPT
    )
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(response.text)
    
    print(f"✅ Fatto! Scheda VIP generata e salvata in: {OUTPUT_PATH}")
except Exception as e:
    print(f"❌ Errore API: {e}")
