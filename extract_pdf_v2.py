import fitz
import sys
import json

def extract(pdf_path, output_json):
    doc = fitz.open(pdf_path)
    pages_text = []
    for page_num in range(doc.page_count):
        page = doc.load_page(page_num)
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        page_text = ""
        for b in blocks:
            page_text += b[4] + "\n"
        pages_text.append(page_text)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(pages_text, f)

if __name__ == '__main__':
    extract(sys.argv[1], sys.argv[2])
