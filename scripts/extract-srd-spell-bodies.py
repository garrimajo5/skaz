"""Extract review text using the pinned SRD spell index, never guessed headings.

Usage: python extract-srd-spell-bodies.py data/srd51-source.pdf data/spell-bodies.json
Requires pypdf. Output is a review aid, not an importable or translated catalog.
"""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

shared = runpy.run_path(str(Path(__file__).with_name('audit-srd-spell-cards.py')))
normalize, ROOT, SHA256 = shared['normalize'], shared['ROOT'], shared['SHA256']


def extract_bodies(pages, index):
    text, boundaries = '', []
    for page, content in sorted(pages.items()):
        boundaries.append((len(text), page))
        text += normalize(content) + ' '
    headings = []
    for entry in index:
        level = entry['level']
        ordinal = {1: '1st', 2: '2nd', 3: '3rd'}.get(level, str(level)+'th')
        school = re.escape(entry['school'])
        metadata = school + r'\s+cantrip' if level == 0 else ordinal + r'\W*level\s+' + school
        pattern = re.escape(normalize(entry['nameEn'])) + r'\s+' + metadata + r'\s*(?:\(ritual\)\s*)?Casting Time:'
        matches = list(re.finditer(pattern, text, re.I))
        if len(matches) != 1:
            raise ValueError(f"Expected one heading for {entry['nameEn']}; got {len(matches)}")
        headings.append((matches[0].start(), entry))
    headings.sort(key=lambda x: x[0])
    def page_at(position):
        return next(page for start, page in reversed(boundaries) if start <= position)
    result = []
    for i, (start, entry) in enumerate(headings):
        end = headings[i+1][0] if i+1 < len(headings) else len(text)
        while end > start and text[end-1].isspace():
            end -= 1
        first, last = page_at(start), page_at(end-1)
        if first != entry['page']:
            raise ValueError('Heading page differs from index: ' + entry['nameEn'])
        result.append({**entry, 'pages': list(range(first, last+1)), 'body': text[start:end]})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.pdf.resolve() == args.output.resolve():
        raise SystemExit('Output must not overwrite the source PDF.')
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    reader = PdfReader(args.pdf)
    index = json.loads((ROOT/'catalog/srd51-spells.index.json').read_text(encoding='utf8'))
    entries = extract_bodies({p: reader.pages[p-1].extract_text() for p in range(114,195)}, index['entries'])
    # Do not overwrite an existing review artifact silently.
    with args.output.open('x', encoding='utf8') as target:
        json.dump({'sourceUrl': index['sourceUrl'], 'sourceSha256': SHA256,
                   'scope': 'Review text only, not an import bundle', 'entries': entries}, target, ensure_ascii=False, indent=2)
        target.write('\n')
    print(f'Extracted {len(entries)} source bodies; summaries still require manual review.')


if __name__ == '__main__':
    main()
