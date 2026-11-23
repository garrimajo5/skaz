"""Read-only metadata audit of one pinned public, blank 2014 character sheet.

No OCR, form repair/filling, downloads, or profile/API access.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

URL = 'https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf'
SHA = '8e7b282db42af119c46fef696b15e7430cb1e93bd09a478780623ca1a1908a48'
SELECTED = ['ClassLevel', 'CharacterName', 'HPMax', 'HPCurrent', 'HPTemp',
            'Spellcasting Class 2', 'SpellcastingAbility 2', 'SpellSaveDC  2',
            'SpellAtkBonus 2', 'SlotsTotal 19', 'SlotsRemaining 19', 'CHARACTER IMAGE']


def object_key(ref):
    indirect = ref if hasattr(ref, 'idnum') else getattr(ref, 'indirect_reference', None)
    if indirect is None:
        raise ValueError('Expected an indirect PDF object')
    return f'{indirect.idnum}:{indirect.generation}'


def inherited(ref, key):
    seen = set()
    while ref is not None:
        ident = object_key(ref)
        if ident in seen:
            raise ValueError('Cyclic PDF parent chain')
        seen.add(ident)
        node = ref.get_object()
        if key in node:
            return node[key]
        ref = node.get('/Parent')
    return None


def page_annotations(page):
    return page['/Annots'] if '/Annots' in page else []


def inventory(reader):
    canonical = {}
    seen = set()

    def walk(ref):
        ident = object_key(ref)
        if ident in seen:
            raise ValueError('Repeated or cyclic canonical field object')
        seen.add(ident)
        node = ref.get_object()
        if '/T' in node:
            canonical[ident] = str(node['/T'])
        for child in node.get('/Kids', []):
            walk(child)

    for ref in reader.trailer['/Root']['/AcroForm']['/Fields']:
        walk(ref)
    rows = []
    for page_number, page in enumerate(reader.pages, 1):
        for ordinal, ref in enumerate(page_annotations(page)):
            node = ref.get_object()
            if node.get('/Subtype') != '/Widget':
                continue
            owner = ref
            owner_seen = set()
            while '/T' not in owner.get_object():
                ident = object_key(owner)
                if ident in owner_seen:
                    raise ValueError('Cyclic widget owner chain')
                owner_seen.add(ident)
                owner = owner.get_object().get('/Parent')
                if owner is None:
                    raise ValueError('Widget without a named owner')
            owner_key = object_key(owner)
            if owner_key not in canonical:
                raise ValueError('Widget owner absent from AcroForm field tree')
            value = inherited(ref, '/V')
            rows.append({'page': page_number, 'annotationOrdinal': ordinal,
                         'widgetRef': object_key(ref), 'ownerRef': owner_key,
                         'fieldName': canonical[owner_key],
                         'fieldType': str(inherited(ref, '/FT')),
                         'rect': [float(x) for x in node.get('/Rect', [])],
                         'valueIsBlank': value is None or value == '' or value == '/Off'})
    by_owner, by_name = defaultdict(list), defaultdict(set)
    for row in rows:
        by_owner[row['ownerRef']].append(row)
        by_name[row['fieldName']].add(row['ownerRef'])
    return {'canonical': canonical, 'rows': rows,
            'repeatedOwnerGroups': [v for v in by_owner.values() if len(v) > 1],
            'ambiguousNames': sorted(k for k, v in by_name.items() if len(v) > 1)}


def audit(path):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA:
        raise ValueError('Pinned public blank PDF SHA mismatch; no arbitrary/private sheet accepted')
    reader = PdfReader(path)
    if reader.is_encrypted or len(reader.pages) != 3:
        raise ValueError('Unexpected public form shape')
    data = inventory(reader)
    rows = data['rows']
    if any(not row['valueIsBlank'] for row in rows):
        raise ValueError('Expected a blank public form')
    page3 = ' '.join(reader.pages[2].extract_text().split())
    if 'SLOTS TOTAL' not in page3 or 'SLOTS EXPENDED' not in page3:
        raise ValueError('Visible slot-column labels changed')
    if any(name not in {r['fieldName'] for r in rows} for name in SELECTED):
        raise ValueError('Selected public field missing')
    selected = [{k: v for k, v in row.items() if k != 'valueIsBlank'}
                for row in rows if row['fieldName'] in SELECTED]
    return {'schemaVersion': 1, 'status': 'public-blank-layout-witness-not-ocr-or-corpus-acceptance',
            'accepted': False, 'complete': False,
            'inputHashEncoding': 'UTF-8; CRLF normalized to LF; all other bytes preserved',
            'inputSha256': {'scripts/audit-official-sheet-layout-80.py': hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n', b'\n')).hexdigest()},
            'source': {'url': URL, 'sha256': SHA, 'bytes': len(raw), 'pages': 3,
                       'editionWitness': '2014 footer on all three pages; author rendered and inspected',
                       'redistributionPermission': 'not-established; PDF retained outside Git'},
            'summary': {'canonicalNamedFields': len(data['canonical']), 'pageWidgets': len(rows),
                        'widgetsByPage': [sum(r['page'] == n for r in rows) for n in range(1, 4)],
                        'widgetsByType': dict(sorted(Counter(r['fieldType'] for r in rows).items())),
                        'allWidgetValuesBlank': True, 'repeatedOwnerGroups': len(data['repeatedOwnerGroups']),
                        'ambiguousSeparateFieldNames': data['ambiguousNames']},
            'selectedWidgets': selected,
            'sharedOwnerWidgets': data['repeatedOwnerGroups'],
            'slotLabelWitness': {'page': 3, 'internalFieldName': 'SlotsRemaining 19',
                                 'visibleColumnLabel': 'SLOTS EXPENDED',
                                 'meaning': 'spent-not-remaining', 'automaticMappingAccepted': False},
            'limitations': ['One blank English form; no user values, OCR or recognition accuracy.',
                            'Metadata names and appearance are distinct signals; no form repair or fill.',
                            'Shared widgets with one canonical parent are not three independent fields.',
                            'Existing synthetic corpus is not proved representative by this layout witness.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf')
    parser.add_argument('--output', help='Optional explicit JSON output; default is summary only')
    args = parser.parse_args()
    report = audit(args.pdf)
    if args.output:
        Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report['summary'], ensure_ascii=False))
