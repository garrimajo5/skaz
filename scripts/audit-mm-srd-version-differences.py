"""Verify three source-version differences without modifying catalog records."""
import argparse, hashlib, json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
LOCATORS = {'Priest': (401, 348, 'catalog/srd51-npc-roles.json'), 'Lich': (325, 202, 'catalog/srd51-undead-rulers.json')}

def number(pattern, text):
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise ValueError('Missing or ambiguous field: ' + pattern)
    return int(matches[0][1])

def primary_fields(name, srd_page, mm_page):
    srd = ' '.join(srd_page.split())
    mm = ' '.join(mm_page.split())
    # Bound the SRD header before actions/other stat blocks and MM by its next heading.
    header = re.findall(r'\b' + name + r' Medium .*?Challenge \d+ \([^)]*\)', srd)
    correction = re.findall(r'\b' + name + r' \(p\. ' + str(LOCATORS[name][1]) + r'\)\. (.*?)(?=(?:\[New\] )?[A-Z][A-Za-z, -]+ \(p\.|$)', mm)
    if len(header) != 1 or len(correction) != 1:
        raise ValueError('Missing or ambiguous creature section')
    a, b = header[0], correction[0]
    patterns = {'speedFeet': r'Speed (\d+) ft\.', 'religionBonus': r'Religion \+(\d+)'} if name == 'Priest' else {'arcanaBonus': r'Arcana \+(\d+)'}
    srd_fields = {key: number(pattern, a) for key, pattern in patterns.items()}
    mm_fields = {key: number(pattern.replace('Speed ', 'Speed: '), b) for key, pattern in patterns.items()}
    return srd_fields, mm_fields

def audit(data, pages, catalogs):
    if data['rulesEdition'] != '5e-2014' or any(data[k] for k in ['automaticPatch', 'complete', 'accepted']):
        raise ValueError('Evidence promoted')
    seen = set()
    for row in data['records']:
        name = row['name']
        if name not in LOCATORS or name in seen:
            raise ValueError('Duplicate or unknown creature')
        seen.add(name)
        page, book, path = LOCATORS[name]
        if (row['srdPage'], row['mmBookPage'], row['catalogPath'], row['mmErrataPdfPage']) != (page, book, path, 2):
            raise ValueError('Wrong source locator')
        srd, mm = primary_fields(name, pages['srd'][page], pages['mm'][2])
        if row['srdFields'] != srd or row['existingFields'] != srd or row['mmErrataFields'] != mm or srd == mm:
            raise ValueError('Source-version difference not proven')
        if row['automaticPatch'] or row['fullStatBlockCompared'] or row['comparison'] != 'existing-matches-declared-srd-source-differs-from-mm-errata':
            raise ValueError('Invalid conclusion')
        ident = 'srd51:2014:monster:' + name.lower()
        entries = [e for e in catalogs[path]['entries'] if e['id'] == ident]
        if row['existingId'] != ident or len(entries) != 1:
            raise ValueError('Wrong stable ID')
        entry = entries[0]
        if entry['source']['url'] != data['sources']['srd']['url'] + '#page=' + str(page) or entry['source']['usage'] != 'cc-by-4.0':
            raise ValueError('Existing attribution differs')
        if name == 'Priest':
            actual = {'speedFeet': entry['monster']['speed']['walk'], 'religionBonus': number(r'Религия \+(\d+)', entry['text'])}
            if number(r'скорость (\d+) футов', entry['text']) != actual['speedFeet']:
                raise ValueError('Text and structured speed disagree')
        else:
            actual = {'arcanaBonus': number(r'Магия \+(\d+)', entry['text'])}
        if actual != srd:
            raise ValueError('Existing entry differs from declared source')
    if seen != set(LOCATORS):
        raise ValueError('Incomplete selected set')
    return 2, 3

if __name__ == '__main__':
    from pypdf import PdfReader
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('srd', type=Path)
    parser.add_argument('mm', type=Path)
    args = parser.parse_args()
    data = json.loads((ROOT / 'catalog/mm-srd-version-differences-2014.json').read_text(encoding='utf-8-sig'))
    pages = {}
    for key, path, numbers in [('srd', args.srd, [325, 401]), ('mm', args.mm, [2])]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != data['sources'][key]['sha256']:
            raise ValueError('Primary PDF changed')
        reader = PdfReader(path)
        pages[key] = {n: reader.pages[n-1].extract_text() for n in numbers}
    catalogs = {}
    for path, sha in data['inputSha256'].items():
        raw = (ROOT / path).read_bytes()
        if hashlib.sha256(raw.replace(b'\r\n', b'\n')).hexdigest() != sha:
            raise ValueError('Catalog input changed')
        catalogs[path] = json.loads(raw)
    print(audit(data, pages, catalogs), 'creatures / fields; source differences only, no automatic patch')
