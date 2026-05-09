import fitz  # PyMuPDF
import sys
import json
import os

def extract_columns(pdf_path, output_json):
    try:
        doc = fitz.open(pdf_path)
        pages_text = []
        
        print(f"🧐 Analisi colonne per: {os.path.basename(pdf_path)}")
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            width = page.rect.width
            middle = width / 2
            
            # Otteniamo i blocchi di testo con le loro coordinate
            blocks = page.get_text("blocks")
            
            left_col = []
            right_col = []
            
            for b in blocks:
                # b[0], b[1], b[2], b[3] sono x0, y0, x1, y1
                # b[4] è il testo
                x0 = b[0]
                
                # Se il blocco inizia nella metà sinistra, va in left_col
                # Usiamo un piccolo margine per i titoli che potrebbero centrare la pagina
                if x0 < middle - 10:
                    left_col.append(b)
                else:
                    right_col.append(b)
            
            # Ordiniamo ogni colonna dall'alto verso il basso (coordinata y)
            left_col.sort(key=lambda b: b[1])
            right_col.sort(key=lambda b: b[1])
            
            # Uniamo il testo: prima tutta la colonna sinistra, poi tutta la destra
            page_text = ""
            for b in left_col:
                page_text += b[4] + "\n"
            for b in right_col:
                page_text += b[4] + "\n"
                
            pages_text.append(page_text)
            
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(pages_text, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Estrazione completata in {output_json}")
    except Exception as e:
        print(f"❌ Errore durante l'estrazione: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python riviste_extractor.py <input_pdf> <output_json>")
    else:
        extract_columns(sys.argv[1], sys.argv[2])
