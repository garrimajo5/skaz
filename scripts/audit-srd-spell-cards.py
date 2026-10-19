"""Compare prepared spell metadata to headers in the pinned SRD PDF.

Read-only. Requires pypdf and Node.js (the app runtime). Does not validate the
authored summaries: those still require human-readable source review.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

SHA256 = '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
ROOT = Path(__file__).resolve().parents[1]


def normalize(text):
    text = re.sub(r'System\s+Reference\s+Document\s+5\.1\s+\d+', ' ', text)
    return re.sub(r'\s+', ' ', text).replace('’', "'").strip()


def source_header(text, name):
    # Match a heading followed by edition metadata, not a mention in another spell.
    title = re.escape(normalize(name))
    match = re.search(title + r'\s+(?:(?:[1-9](?:st|nd|rd|th)\W*level\s+\w+)|(?:\w+\s+cantrip))\s*(\(ritual\))?\s*Casting Time:\s*([^:]*?)\s*Range:\s*([^:]*?)\s*Components:\s*([VSM](?:\s*,\s*[VSM])*)(?:\s*\([^()]*\))?\s*Duration:\s*(Concentration,?\s*)?(Instantaneous|Until dispelled(?: or triggered)?|Special|(?:up to\s+)?\d+\s+(?:round|minute|hour|day)s?)', normalize(text), re.I)
    if not match:
        raise ValueError('Unrecognized spell header: ' + name)
    ritual, casting, distance, components, concentration, duration = match.groups()
    if re.fullmatch(r'\d+ feet', distance):
        distance = {'type': 'feet', 'feet': int(distance.split()[0])}
    elif re.fullmatch(r'\d+ miles?', distance):
        distance = {'type': 'feet', 'feet': int(distance.split()[0]) * 5280}
    elif distance.lower().startswith('self'):
        distance = {'type': 'self'}
    elif distance.lower() in ('touch', 'sight', 'unlimited', 'special'):
        distance = {'type': distance.lower()}
    else:
        raise ValueError('Unrecognized range for ' + name + ': ' + distance)
    return {'ritual': bool(ritual), 'casting': casting, 'range': distance,
            'components': sorted(re.findall('[VSM]', components)),
            'concentration': bool(concentration), 'duration': duration.lower()}


def duration_key(text):
    text = text.lower().replace('концентрация, ', '').replace('до ', 'up to ')
    if text in ('мгновенная', 'мгновенно'):
        return 'instantaneous'
    if text == 'пока не рассеяно':
        return 'until dispelled'
    if text == 'пока не рассеяно или не сработает':
        return 'until dispelled or triggered'
    for ru, en in [('раунд', 'round'), ('минут', 'minute'), ('час', 'hour'), ('дн', 'day')]:
        if ru in text:
            match = re.fullmatch(r'(up to )?(\d+)\s+\S+', text)
            if match:
                return (match[1] or '') + match[2] + ' ' + en + ('s' if int(match[2]) != 1 else '')
    return text


def differences(card, header):
    spell = card['spell']
    errors = []
    for field in ('ritual', 'range', 'concentration'):
        if spell[field] != header[field]:
            errors.append(field)
    if sorted(spell['components']) != header['components']:
        errors.append('components')
    if duration_key(spell['duration']) != header['duration']:
        errors.append('duration')
    casting = spell['castingTime']
    # Reaction trigger wording is reviewed manually; check action type here.
    translated = {'1 действие': '1 action', '1 бонусное действие': '1 bonus action',
                  '1 минута': '1 minute', '1 час': '1 hour', '10 минут': '10 minutes',
                  '1 действие или 8 часов': '1 action or 8 hours'}
    if casting.startswith('1 реакция,'):
        if not header['casting'].startswith('1 reaction,'):
            errors.append('castingTime')
    elif translated.get(casting) != header['casting']:
        errors.append('castingTime')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only the pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    reader = PdfReader(args.pdf)
    pages = {n: reader.pages[n-1].extract_text() for n in range(114, 195)}
    code = "import{bundledCatalog}from'./server/bundled-catalog.mjs';process.stdout.write(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='spell')))"
    cards = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=ROOT, encoding='utf-8'))
    index = {e['id']: e for e in json.loads((ROOT/'catalog/srd51-spells.index.json').read_text(encoding='utf-8'))['entries']}
    failures = []
    for card in cards:
        ref = index[card['id']]
        try:
            header = source_header(pages[ref['page']] + pages[ref['page']+1], ref['nameEn'])
            errors = differences(card, header)
            if errors:
                failures.append({'id': card['id'], 'fields': errors, 'source': header})
        except ValueError as error:
            failures.append({'id': card['id'], 'error': str(error)})
    print(json.dumps({'checked': len(cards), 'failures': failures,
                      'scope': 'Header metadata only; summaries and reaction triggers need source review.'}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
