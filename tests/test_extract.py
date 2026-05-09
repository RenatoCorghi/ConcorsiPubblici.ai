import fitz
import sys

PDF_PATH = r"C:\Users\Pc\OneDrive\Desktop\concorsi-ai\data\giurisprudena italiana\giurit_2022_1.pdf"
OUTPUT_PATH = r"C:\Users\Pc\OneDrive\Desktop\concorsi-ai\test_estratto.txt"

doc = fitz.open(PDF_PATH)
start_page = 10
end_page = 15
extracted_text = ""

for page_num in range(start_page, end_page + 1):
    if page_num < doc.page_count:
        page = doc.load_page(page_num)
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        for b in blocks:
            extracted_text += b[4] + "\n"

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    f.write(extracted_text)
print("Estratto salvato!")
