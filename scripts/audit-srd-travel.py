"""Compare travel table distances against the pinned SRD, without editing files.

This narrow audit does not verify translated effects, forced march or transport.
"""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

shared = runpy.run_path(str(Path(__file__).with_name('audit-srd-spell-cards.py')))
normalize, ROOT, SHA256 = shared['normalize'], shared['ROOT'], shared['SHA256']


def source_distances(text):
    text = normalize(text)
    heading = 'Pace Distance Traveled per'
    if text.count(heading) != 1:
        raise ValueError('Missing or ambiguous Travel Pace table')
    table = text.split(heading)[1]
    rows = re.findall(r'\b(Fast|Normal|Slow) (\d+) feet (\d+) miles (\d+) miles\b', table)
    if [row[0] for row in rows] != ['Fast', 'Normal', 'Slow']:
        raise ValueError('Missing, duplicate or reordered travel rows')
    return {row[0]: [int(value) for value in row[1:]] for row in rows}


def card_distances(text):
    rows = re.findall(r'^(Быстрый|Обычный|Медленный): (\d+) футов в минуту, (\d+) мили в час, (\d+) мил[ьи] в день;', text, re.M)
    labels = {'Быстрый': 'Fast', 'Обычный': 'Normal', 'Медленный': 'Slow'}
    if [row[0] for row in rows] != list(labels):
        raise ValueError('Missing, duplicate or unsupported card rows')
    return {labels[row[0]]: [int(value) for value in row[1:]] for row in rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only the pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    expected = source_distances(PdfReader(args.pdf).pages[83].extract_text())
    pack = json.loads((ROOT / 'catalog/srd51-exploration.json').read_text(encoding='utf-8'))
    cards = [entry for entry in pack['entries'] if entry['id'] == 'srd51:2014:mechanic:travel-pace']
    if len(cards) != 1:
        raise SystemExit('Expected exactly one Travel Pace card')
    actual = card_distances(cards[0]['text'])
    failures = [pace for pace in expected if expected[pace] != actual[pace]]
    print(json.dumps({'checkedRows': 3, 'distances': actual, 'failures': failures,
                      'scope': 'Feet per minute, miles per hour and miles per day only; effects need manual review.'}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
