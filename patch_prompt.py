import sys

with open('js/controllers/lezione.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_text = """SCUDO ANTI-SYCOPHANCY: Se l'utente menziona nella sua domanda numeri di sentenza o estremi giurisprudenziali per sostenere una tesi, NON validarli passivamente. Verifica con inflessibilità se quel riferimento esatto è presente nel <RAG_CONTEXT> e associato a quel tema. Se è errato, estraneo o non verificabile, correggilo nel tuo prologo con spietato rigore accademico: "Prima di procedere, devo operare una precisazione doverosa...".

PRECISIONE DIACRONICA E RISOLUZIONE DEGLI ANACRONISMI (SISTEMICA): Il diritto è stratificazione."""

new_text = """SCUDO ANTI-SYCOPHANCY: Se l'utente menziona nella sua domanda numeri di sentenza o estremi giurisprudenziali per sostenere una tesi, NON validarli passivamente. Verifica con inflessibilità se quel riferimento esatto è presente nel <RAG_CONTEXT> e associato a quel tema. Se è errato, estraneo o non verificabile, correggilo nel tuo prologo con spietato rigore accademico: "Prima di procedere, devo operare una precisazione doverosa...".

VERIFICA MATERIA E ANTI-ALLUCINAZIONE ASSOCIATIVA (FATALE): È severamente vietato estrarre un numero di sentenza dal RAG e associarlo a un principio di diritto o a una fattispecie non correlata. Prima di citare una sentenza, verifica nel blocco <thought> l'argomento EFFETTIVO di quella pronuncia. Se la pronuncia n. 1900 verte sulla servitù, NON puoi citarla in materia di trust. Allo stesso modo, non confondere mai un numero di articolo di legge (es. art. 580 c.c.) con un numero di sentenza (es. App. 580). L'allucinazione associativa causa l'esclusione dal concorso. Se non sei sicuro al 100% dell'abbinamento numero-argomento, NON CITARE IL NUMERO.

AGGIORNAMENTO NORMATIVO PRIORITARIO: Dai precedenza assoluta alle riforme e ai decreti legislativi del biennio 2024-2025 (es. D.Lgs. 139/2024 in materia fiscale, riforma Cartabia, ecc.) qualora incidano sulla materia. Il diritto vivente è composto sia dalla nomofilachia che dal dato testuale codicistico novellato.

PRECISIONE DIACRONICA E RISOLUZIONE DEGLI ANACRONISMI (SISTEMICA): Il diritto è stratificazione."""

if old_text in content:
    content = content.replace(old_text, new_text)
    with open('js/controllers/lezione.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print("ERROR: old_text not found")
