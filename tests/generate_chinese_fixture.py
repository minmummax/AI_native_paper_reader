"""Chinese CID font fixture requiring bundled UniGB-UCS2-H and Adobe-GB1 CMaps."""
from pathlib import Path
import tempfile


def generate(path: Path):
    lines = ['中文论文阅读测试', '摘要：本地阅读器应完整显示中文、数字 2024 与标点。', '这是一段用于选择、下划线和搜索的中文文本。']
    commands = 'BT /F1 18 Tf 40 750 Td 36 TL\n' + '\nT*\n'.join(f'<{text.encode("utf-16-be").hex()}> Tj' for text in lines) + '\nET'
    content = commands.encode('ascii')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
        b'<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >>',
        b'<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 6 0 R /DW 1000 >>',
        b'<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>',
        f'<< /Length {len(content)} >>\nstream\n'.encode('ascii') + content + b'\nendstream',
    ]
    output = bytearray(b'%PDF-1.7\n')
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f'{number} 0 obj\n'.encode('ascii') + obj + b'\nendobj\n')
    xref = len(output)
    output.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode('ascii'))
    for offset in offsets[1:]:
        output.extend(f'{offset:010d} 00000 n \n'.encode('ascii'))
    output.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode('ascii'))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(output)


if __name__ == '__main__':
    path = Path(tempfile.gettempdir()) / 'paper-reader-phase1-qa' / 'chinese-cmap.pdf'
    generate(path)
    print(path)
