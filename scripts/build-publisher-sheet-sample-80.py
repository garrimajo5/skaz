"""Build a local fictional sample from the pinned Russian publisher's print sheet."""
import argparse
from collections import Counter
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from PIL import Image, ImageChops
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

SOURCE_URL = 'https://hobbyworld.ru//download/rules/DnD_character_list.pdf'
SOURCE_SHA = 'a823c2264a6f8ea218d908c0e60997eecc17c5e25e78935b96169a7fe10dc4c0'
FONT_SHA = 'c9b76220a5be42ead4733611e417cd65c5fd8aeaa33eb56576ac378a37d130a1'
PAGE_WIDTH, PAGE_HEIGHT = 595.276, 782.362
DPI = 144

# Page number, stable field ID, top-left rectangle in PDF points, printed value, font size.
FIELDS = (
    (1, 'name', (55, 57, 158, 22), 'Лира Искра', 15),
    (1, 'classes', (263, 41, 99, 11), 'Волшебник 3 / Колдун 2', 7),
    (1, 'abilities.dex', (30, 223, 39, 18), '14', 14),
    (1, 'modifier.dex', (39, 249, 20, 13), '+2', 9),
    (1, 'hp.max', (269, 191, 103, 12), None, None),
    (1, 'hp.current', (227, 209, 133, 22), '0', 18),
    (1, 'hp.temp', (227, 266, 133, 23), '0', 18),
    (2, 'name.repeat', (59, 61, 150, 22), 'Лира Искра', 15),
    (3, 'spellcasting.class', (63, 56, 161, 23), 'Волшебник', 14),
    (3, 'spellcasting.ability', (278, 49, 60, 22), 'Интеллект', 9),
    (3, 'spellcasting.dc', (381, 49, 53, 22), '13', 14),
    (3, 'spellcasting.attack', (482, 49, 50, 22), '+5', 14),
    (3, 'spellcasting.cantrip.0', (32, 165, 158, 12), 'Волшебная рука', 9),
    (3, 'spellcasting.slots.1.total', (44, 308, 40, 15), '4', 12),
    (3, 'spellcasting.slots.1.expended', (104, 308, 80, 15), '1', 12),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_source(path):
    if digest(path) != SOURCE_SHA:
        raise ValueError('Pinned publisher PDF SHA mismatch')
    reader = PdfReader(path)
    if reader.is_encrypted or len(reader.pages) != 3 or reader.get_fields():
        raise ValueError('Expected the public three-page non-fillable form')
    for page in reader.pages:
        box = [0, 0, PAGE_WIDTH, PAGE_HEIGHT]
        if (page.rotation or list(map(float, page.mediabox)) != box or
                list(map(float, page.cropbox)) != box or page.extract_text().strip()):
            raise ValueError('Publisher page geometry or text layer changed')
    return reader


def build_overlay(font_path):
    if digest(font_path) != FONT_SHA:
        raise ValueError('Fixture font SHA mismatch')
    pdfmetrics.registerFont(TTFont('Fixture', str(font_path)))
    buffer = BytesIO()
    layer = Canvas(buffer, pagesize=(PAGE_WIDTH, PAGE_HEIGHT), invariant=1)
    for number in range(1, 4):
        for page, field, (x, y, width, height), value, size in FIELDS:
            if page != number or value is None:
                continue
            if pdfmetrics.stringWidth(value, 'Fixture', size) + 2 > width or size + 2 > height:
                raise ValueError('Text does not fit its rectangle: ' + field)
            layer.setFont('Fixture', size)
            layer.drawCentredString(x + width / 2, PAGE_HEIGHT - y - (height + size) / 2 + 1, value)
        layer.showPage()
    layer.save()
    buffer.seek(0)
    return PdfReader(buffer)


def render_pages(path, prefix):
    subprocess.run(['pdftoppm', '-r', str(DPI), '-png', str(path), str(prefix)],
                   check=True, capture_output=True)
    return sorted(prefix.parent.glob(prefix.name + '-*.png'))


def raster_regions(page, blank_path, rendered_path):
    with Image.open(blank_path) as blank, Image.open(rendered_path) as rendered:
        if blank.size != rendered.size:
            raise ValueError('Generated and source raster sizes differ')
        for number, key, (x, y, width, height), value, _ in FIELDS:
            if number != page:
                continue
            # Poppler rounds page dimensions up. Scale by DPI, not by rounded dimensions.
            scale = DPI / 72
            left, top = math.floor(x * scale), math.floor(y * scale)
            right, bottom = math.ceil((x + width) * scale), math.ceil((y + height) * scale)
            if not (0 <= left < right <= rendered.width and 0 <= top < bottom <= rendered.height):
                raise ValueError('Raster region outside page: ' + key)
            box = (left, top, right, bottom)
            changed = ImageChops.difference(blank.crop(box), rendered.crop(box)).getbbox()
            if (changed is None) != (value is None):
                raise ValueError('Raster does not preserve blank or printed value: ' + key)
            yield {'fieldId': key, 'page': number, 'pointRect': [x, y, width, height],
                   'pixelRect': [left, top, right - left, bottom - top], 'printed': value}


def build(source, output, font_path):
    source, output, font_path = map(Path, (source, output, font_path))
    if output.exists():
        raise FileExistsError('A new output folder is required')
    reader = check_source(source)
    overlay = build_overlay(font_path)
    writer = PdfWriter()
    for page, additions in zip(reader.pages, overlay.pages, strict=True):
        page.merge_page(additions)
        writer.add_page(page)
    output.mkdir(parents=True, exist_ok=False)
    pdf = output / 'publisher-ru-fictional.pdf'
    with pdf.open('wb') as stream:
        writer.write(stream)

    result = PdfReader(pdf)
    if result.get_fields():
        raise ValueError('Published case should remain a non-fillable PDF')
    for number, page in enumerate(result.pages, 1):
        expected = Counter(value for p, _, _, value, _ in FIELDS if p == number and value is not None)
        observed = Counter(line.strip() for line in page.extract_text().splitlines() if line.strip())
        if observed != expected:
            raise ValueError('Text layer differs on page ' + str(number))

    artifact_sha = digest(pdf)
    rasters = render_pages(pdf, output / 'page')
    regions, image_info = [], []
    with TemporaryDirectory() as temp:
        blanks = render_pages(source, Path(temp) / 'blank')
        if len(blanks) != len(rasters) or len(rasters) != 3:
            raise ValueError('Expected three original and filled pages')
        for page, (blank, raster) in enumerate(zip(blanks, rasters, strict=True), 1):
            regions.extend(raster_regions(page, blank, raster))
            with Image.open(raster) as image:
                image_info.append({'file': raster.name, 'page': page, 'width': image.width,
                                   'height': image.height, 'dpi': DPI, 'bytes': raster.stat().st_size,
                                   'sha256': digest(raster), 'derivedFromPdfSha256': artifact_sha})
    version = subprocess.run(['pdftoppm', '-v'], check=True, capture_output=True, text=True)
    report = {
        'schemaVersion': 1, 'synthetic': True, 'accepted': False, 'ruleset': '5e-2014', 'locale': 'ru',
        'source': {'url': SOURCE_URL, 'sha256': SOURCE_SHA, 'bytes': source.stat().st_size,
                   'pages': 3, 'fillable': False, 'extractableText': False},
        'generator': {'file': 'scripts/build-publisher-sheet-sample-80.py',
                      'sha256': hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n', b'\n')).hexdigest(),
                      'fontSha256': FONT_SHA, 'renderer': (version.stderr or version.stdout).splitlines()[0]},
        'artifact': {'file': pdf.name, 'sha256': artifact_sha, 'bytes': pdf.stat().st_size,
                     'pages': 3, 'redistributedInGit': False},
        'rasterPages': image_info,
        'inputVariants': [{'kind': 'non-fillable-pdf', 'files': [pdf.name], 'pages': 3},
                          {'kind': 'png-pages', 'files': [row['file'] for row in image_info], 'pages': 3}],
        'regions': regions,
        'expectedInterpretation': {
            'selectionStatus': 'unreviewed',
            'hp': {'max': None, 'current': 0, 'temp': 0},
            'dexterity': {'score': 14, 'printedModifier': 2},
            'classes': [{'name': 'Волшебник', 'level': 3}, {'name': 'Колдун', 'level': 2}],
            'printedTotalLevel': None,
            'slots': {'printedLabel': 'Потрачено ячеек', 'circle': 1, 'printedTotal': 4,
                      'printedExpended': 1, 'printedRemaining': None, 'derivedRemainingCandidate': 3,
                      'chosenRemaining': None, 'pactMagic': None},
        },
    }
    (output / 'sample-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n',
                                               encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('publisher_blank_pdf')
    parser.add_argument('new_output_folder')
    parser.add_argument('arial_font')
    args = parser.parse_args()
    report = build(args.publisher_blank_pdf, args.new_output_folder, args.arial_font)
    print(json.dumps(report['artifact']))
