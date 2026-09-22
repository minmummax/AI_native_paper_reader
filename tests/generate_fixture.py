"""Generate deterministic local QA PDFs; no external libraries or downloaded documents."""
from pathlib import Path
import tempfile


def generate(path: Path, pages: int = 30):
    objects = []
    def add(data):
        objects.append(data.encode('ascii') if isinstance(data, str) else data)
        return len(objects)
    add('<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>')
    page_ids = [7 + index * 2 for index in range(pages)]
    add(f'<< /Type /Pages /Count {pages} /Kids [{' '.join(f'{value} 0 R' for value in page_ids)}] >>')
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    add('<< /Type /Outlines /First 5 0 R /Last 6 0 R /Count 2 >>')
    add('<< /Title (Introduction) /Parent 4 0 R /Next 6 0 R /Dest [7 0 R /Fit] >>')
    add(f'<< /Title (Final page) /Parent 4 0 R /Prev 5 0 R /Dest [{page_ids[-1]} 0 R /Fit] >>')
    for index in range(pages):
        number = index + 1
        width, height = (842, 595) if number == 3 else (595, 842)
        rotation = 90 if number == 2 else 0
        add(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Rotate {rotation} /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objects)+2} 0 R >>')
        lines = [f'Local Reader QA - Page {number}', 'Ada Researcher; Ben Scientist - 2024',
                 'Abstract: An offline fixture for testing local academic paper reading.',
                 'Keywords: local, privacy, annotation', '1 Introduction',
                 'Select this sentence to create a persistent text highlight.',
                 'Add a thought, question, critique or idea to its annotation.',
                 'Zoom and rotate the document; annotations should stay aligned.',
                 'All data remains on this computer. No remote services are used.']
        commands = f'BT /F1 14 Tf 40 {height-60} Td 24 TL\n' + '\nT*\n'.join(f'({line}) Tj' for line in lines) + '\nET'
        stream = commands.encode('ascii')
        add(f'<< /Length {len(stream)} >>\nstream\n'.encode('ascii') + stream + b'\nendstream')
    info = add('<< /Title (Local Reader QA) /Author (Ada Researcher; Ben Scientist) /CreationDate (D:20240101000000Z) >>')
    data = bytearray(b'%PDF-1.7\n')
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f'{index} 0 obj\n'.encode('ascii') + obj + b'\nendobj\n')
    xref = len(data)
    data.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode('ascii'))
    for offset in offsets[1:]:
        data.extend(f'{offset:010d} 00000 n \n'.encode('ascii'))
    data.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R /Info {info} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode('ascii'))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


if __name__ == '__main__':
    fixture = Path(tempfile.gettempdir()) / 'paper-reader-phase1-qa' / 'reader-30-pages.pdf'
    generate(fixture)
    print(fixture)
