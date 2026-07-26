from pathlib import Path

import pymupdf


repo = Path(__file__).resolve().parents[1]
source = repo / "docs" / "whitepaper" / "astrolabe.pdf"
output = repo / "film" / "remotion" / "public"

document = pymupdf.open(source)
for index in range(min(2, document.page_count)):
    page = document.load_page(index)
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2.4, 2.4), alpha=False)
    pixmap.save(output / f"report-page-{index + 1}.png")

print(f"Rendered {min(2, document.page_count)} report pages")
