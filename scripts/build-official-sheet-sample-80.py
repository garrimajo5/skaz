"""Create a local-only, fictional sample from one of two pinned public blank forms.

The source PDF and generated PDF are not redistributed in Git. This is corpus
preparation, not an OCR benchmark, profile import, or permission to publish a template.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import subprocess
from PIL import Image
from pathlib import Path
import pypdf
from pypdf import PdfReader, PdfWriter

SPEC = importlib.util.spec_from_file_location('sheet_layout_80', Path(__file__).with_name('audit-official-sheet-layout-80.py'))
LAYOUT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LAYOUT)
VALUES = {
    'CharacterName': 'Lyra QA', 'CharacterName 2': 'Lyra QA',
    'ClassLevel': 'Wizard 3 / Warlock 2', 'DEX': '14',
    'HPMax': '27', 'HPCurrent': '', 'HPTemp': '0',
    'Spellcasting Class 2': 'Wizard', 'SpellcastingAbility 2': 'INT',
    'SpellSaveDC  2': '13', 'SpellAtkBonus 2': '+5',
    'SlotsTotal 19': '4', 'SlotsRemaining 19': '1', 'Spells 1014': 'Mage Hand',
}


ALTERNATIVE_URL = 'https://media.wizards.com/2014/downloads/dnd/5E_CHARACTERSHEETSV3.ZIP'
ALTERNATIVE_MEMBER = 'Character Sheet - Alternative - Form Fillable.pdf'
ALTERNATIVE_ARCHIVE_SHA = '2d46a1f6cdaea2a09901c72de2f94f2920ed8d1102614212b87f65b303e57827'
ALTERNATIVE_SHA = 'a5c24cf034d93cd7c0dba1b8f740f648acac3ceb58e4103ff5aaaeac347ab561'
ALTERNATIVE_VALUES = {
    'CharacterName': 'Lyra QA', 'ClassLevel': 'Wizard 3 / Warlock 2',
    'DEX': '14', 'DEXmod ': '+2',
    'HPMax': '', 'HPCurrent': '0', 'HPTemp': '0',
}


def read_alternative_source(source):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ALTERNATIVE_SHA:
        raise ValueError('Pinned public alternate PDF SHA mismatch; no arbitrary/private sheet accepted')
    reader = PdfReader(source)
    if reader.is_encrypted or len(reader.pages) != 1:
        raise ValueError('Unexpected alternate form shape')
    data = LAYOUT.inventory(reader)
    if data['ambiguousNames'] or any(not row['valueIsBlank'] for row in data['rows']):
        raise ValueError('Expected an unambiguous blank public alternate form')
    fields = reader.get_fields() or {}
    if any(name not in fields or fields[name].get('/FT') != '/Tx' for name in ALTERNATIVE_VALUES):
        raise ValueError('Alternate form field identifiers or types changed')
    if not set(ALTERNATIVE_VALUES).issubset(row['fieldName'] for row in data['rows']):
        raise ValueError('Selected alternate form widgets are missing')
    return {
        'url': ALTERNATIVE_URL, 'archiveSha256': ALTERNATIVE_ARCHIVE_SHA, 'archiveMember': ALTERNATIVE_MEMBER,
        'sha256': ALTERNATIVE_SHA, 'bytes': len(raw), 'pages': 1,
    }, reader


def verify_values(reader, values=VALUES):
    fields = reader.get_fields() or {}
    for name, expected in values.items():
        if name not in fields or fields[name].get('/V') != expected:
            raise ValueError('Canonical sample field differs: ' + name)
    seen = set()
    for page in reader.pages:
        for ref in LAYOUT.page_annotations(page):
            node = ref.get_object()
            if node.get('/Subtype') != '/Widget':
                continue
            name = str(LAYOUT.inherited(ref, '/T'))
            if name not in values:
                continue
            if LAYOUT.inherited(ref, '/V') != values[name]:
                raise ValueError('Widget value differs: ' + name)
            appearance = node.get('/AP')
            normal = appearance.get_object().get('/N') if appearance else None
            if not normal or not normal.get_object().get_data():
                raise ValueError('Missing text appearance: ' + name)
            seen.add(name)
    if seen != set(values):
        raise ValueError('Missing selected widgets')


def build(source, folder, render=False, layout='standard'):
    folder = Path(folder)
    if folder.exists():
        raise FileExistsError('A new output folder is required; existing artifacts are never overwritten')
    source = Path(source)
    if layout == 'standard':
        source_info = LAYOUT.audit(source)['source']
        reader = PdfReader(source)
        values, counts = VALUES, (3, 334, 336)
        filename = 'official-layout-fictional.pdf'
        interpretation = {
            'selectionStatus': 'unreviewed', 'classes': [{'name': 'Wizard', 'level': 3}, {'name': 'Warlock', 'level': 2}],
            'printedTotalLevel': None, 'derivedTotalLevelCandidate': 5,
            'hp': {'max': 27, 'current': None, 'temp': 0},
            'spellPageClass': 'Wizard',
            'slots': {'spellLevel': 1, 'printedTotal': 4, 'printedExpended': 1,
                      'printedRemaining': None, 'derivedRemainingCandidate': 3, 'chosenRemaining': None},
            'rawSpellText': 'Mage Hand', 'catalogId': None,
        }
    elif layout == 'alternative':
        source_info, reader = read_alternative_source(source)
        values, counts = ALTERNATIVE_VALUES, (1, 100, 105)
        filename = 'official-alternative-fictional.pdf'
        interpretation = {
            'selectionStatus': 'unreviewed', 'classes': [{'name': 'Wizard', 'level': 3}, {'name': 'Warlock', 'level': 2}],
            'printedTotalLevel': None, 'derivedTotalLevelCandidate': 5,
            'hp': {'max': None, 'current': 0, 'temp': 0},
            'dexterity': {'score': 14, 'printedModifier': 2},
            'spellcastingPageIncluded': False,
        }
    else:
        raise ValueError('Unknown official sheet layout')
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.update_page_form_field_values(None, values, auto_regenerate=False)
    folder.mkdir(parents=True, exist_ok=False)
    output = folder / filename
    with output.open('wb') as stream:
        writer.write(stream)
    result = PdfReader(output)
    verify_values(result, values)
    before_fields, after_fields = reader.get_fields(), result.get_fields()
    if set(before_fields) != set(after_fields):
        raise ValueError('Canonical field names changed')
    for name in before_fields:
        if before_fields[name].get('/FT') != after_fields[name].get('/FT'):
            raise ValueError('Field type changed: ' + name)
        if name not in values and before_fields[name].get('/V') != after_fields[name].get('/V'):
            raise ValueError('Unselected field changed: ' + name)
    after = LAYOUT.inventory(result)
    page_count, canonical_count, widget_count = counts
    if (len(result.pages), len(after['canonical']), len(after['rows'])) != counts:
        raise ValueError('Form structure changed')
    rendered = []
    renderer = None
    if render:
        version = subprocess.run(['pdftoppm', '-v'], check=True, capture_output=True, text=True)
        renderer = (version.stderr or version.stdout).splitlines()[0]
        subprocess.run(['pdftoppm', '-r', '200', '-png', str(output), str(folder / 'page')], check=True, capture_output=True)
        images = sorted(folder.glob('page-*.png'))
        if len(images) != page_count:
            raise ValueError('The number of rendered pages differs from the form')
        for number, image_path in enumerate(images, 1):
            with Image.open(image_path) as image:
                rendered.append({'file': image_path.name, 'page': number, 'width': image.width,
                                 'height': image.height, 'dpi': 200, 'bytes': image_path.stat().st_size,
                                 'sha256': hashlib.sha256(image_path.read_bytes()).hexdigest(),
                                 'derivedFromPdfSha256': hashlib.sha256(output.read_bytes()).hexdigest()})
    regions = []
    for row in after['rows']:
        if row['fieldName'] not in values:
            continue
        page = result.pages[row['page'] - 1]
        region = {'fieldName': row['fieldName'], 'page': row['page'], 'pdfRect': row['rect'],
                  'blank': values[row['fieldName']] == '', 'normalizedBox': None}
        if render:
            if page.rotation != 0 or list(page.cropbox) != list(page.mediabox):
                raise ValueError('Only the pinned unrotated full-page geometry is supported')
            image = rendered[row['page'] - 1]
            sx, sy = image['width'] / float(page.cropbox.width), image['height'] / float(page.cropbox.height)
            x0, y0, x1, y1 = row['rect']
            left = math.floor((x0 - float(page.cropbox.left)) * sx)
            top = math.floor((float(page.cropbox.top) - y1) * sy)
            right = math.ceil((x1 - float(page.cropbox.left)) * sx)
            bottom = math.ceil((float(page.cropbox.top) - y0) * sy)
            if not (0 <= left < right <= image['width'] and 0 <= top < bottom <= image['height']):
                raise ValueError('Normalized source region outside raster')
            region['normalizedBox'] = [left, top, right-left, bottom-top]
        regions.append(region)
    report = {
        'schemaVersion': 1, 'status': 'local-fictional-layout-sample-not-ocr-acceptance',
        'synthetic': True, 'accepted': False, 'complete': False,
        'source': source_info,
        'generatorVersions': {'pypdf': pypdf.__version__, 'renderer': renderer},
        'inputHashEncoding': 'UTF-8; CRLF normalized to LF; all other bytes preserved',
        'inputSha256': {str(Path('scripts') / name).replace('\\', '/'): hashlib.sha256(Path(__file__).with_name(name).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
                       for name in ['audit-official-sheet-layout-80.py', 'build-official-sheet-sample-80.py']},
        'artifact': {'file': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                     'bytes': output.stat().st_size, 'pages': page_count, 'canonicalNamedFields': canonical_count, 'widgets': widget_count,
                     'interactive': True, 'redistributedInGit': False},
        'rasterPages': rendered,
        'regions': regions,
        'inputVariants': [{'kind': 'fillable-pdf', 'files': [output.name], 'pages': page_count}] +
                         ([{'kind': 'png-pages', 'files': [r['file'] for r in rendered], 'pages': page_count}] if rendered else []),
        'expectedPdfValues': values,
        'expectedInterpretation': interpretation,
        'limits': ['Only this pinned public blank template; no arbitrary user sheet is read.',
                   'Generated PDF and raster copies remain local-only; distribution rights are not established.',
                   'Canonical/widget values and appearances are checked; visual render is a separate review.',
                   'Derived candidates are not printed observations or automatic profile changes.',
                   'No OCR engine, accuracy measurement, API persistence or Ready/owner acceptance.'],
    }
    (folder / 'sample-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('public_blank_pdf')
    parser.add_argument('new_output_folder')
    parser.add_argument('--render', action='store_true', help='Render local PNGs at 200 dpi with Poppler')
    parser.add_argument('--layout', choices=['standard', 'alternative'], default='standard')
    args = parser.parse_args()
    report = build(args.public_blank_pdf, args.new_output_folder, render=args.render, layout=args.layout)
    print(json.dumps(report['artifact']))
