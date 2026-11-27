"""Verify selected source-version differences without modifying catalog records."""
import argparse, hashlib, json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
LOCATORS = {'Priest': (401, 348, 'catalog/srd51-npc-roles.json'), 'Lich': (325, 202, 'catalog/srd51-undead-rulers.json')}

def unique(pattern, text):
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise ValueError('Missing or ambiguous field: ' + pattern)
    return matches[0]

def number(pattern, text):
    return int(unique(pattern, text)[1])

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


def audit_whelm(row, pages, catalogs):
    path = 'catalog/srd51-elementals.json'
    ident = 'srd51:2014:monster:water-elemental'
    locators = (row['srdPage'], row['mmBookPage'], row['mmErrataPdfPage'])
    if locators != (307, 125, 2) or row['catalogPath'] != path or row['existingId'] != ident:
        raise ValueError('Wrong Whelm source locator')

    srd_page = ' '.join(pages['srd'][307].split())
    whelm = unique(r'\bWater Elemental Large elemental, neutral\b.*?\bWhelm \(Recharge 4–6\)\. (.*?)(?=\bElf, Drow)', srd_page)[1]
    save_dc = number(r'\bmust make a DC (\d+) Strength saving throw\.', whelm)
    rescue = unique(r'\bA creature within 5 feet .*? by taking an action to make a DC (\d+) Strength(?: (check|saving throw))? and succeeding\.', whelm)
    srd = {'initialSaveDc': save_dc, 'rescueDc': int(rescue[1]), 'rescueRoll': rescue[2]}

    mm_page = ' '.join(re.sub(r'(?<=\w)-\s*\n\s*(?=\w)', '', pages['mm'][2]).split())
    erratum = unique(r'\bWater Elemental \(p\. 125\)\. Whelm: added the word “(check)” after “DC (\d+) Strength” in the final sentence\.', mm_page)
    mm = {'rescueDc': int(erratum[2]), 'rescueRoll': erratum[1]}

    entries = [entry for entry in catalogs[path]['entries'] if entry['id'] == ident]
    if len(entries) != 1:
        raise ValueError('Missing or ambiguous Whelm card')
    entry = entries[0]
    if entry['source']['url'] != 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=307' or entry['source']['usage'] != 'cc-by-4.0':
        raise ValueError('Existing Whelm attribution differs')
    existing = {
        'initialSaveDc': number(r'\bделает спасбросок Силы Сл (\d+)', entry['text']),
        'rescueDc': number(r'\bСущество в 5 футах может действием и успешной проверкой Силы Сл (\d+) вытащить существо или предмет', entry['text']),
        'rescueRoll': 'check',
    }
    if (srd, mm, existing) != (row['srdFields'], row['mmErrataFields'], row['existingFields']):
        raise ValueError('Whelm roll wording or difficulty differs')
    if srd['rescueRoll'] is not None or mm['rescueDc'] != srd['rescueDc'] or existing != {**srd, 'rescueRoll': mm['rescueRoll']}:
        raise ValueError('Whelm comparison does not establish an omitted rescue check')
    if row['automaticPatch'] is not False or row['fullStatBlockCompared'] is not False or row['comparison'] != 'rescue-check-omitted-in-srd-written-in-errata-and-existing-card':
        raise ValueError('Invalid Whelm conclusion')


def audit(data, pages, catalogs):
    if data['schemaVersion'] != 2 or data['rulesEdition'] != '5e-2014' or any(data[k] for k in ['automaticPatch', 'complete', 'accepted']):
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
    audit_whelm(data['whelmEvidence'], pages, catalogs)
    return 3, 4

if __name__ == '__main__':
    from pypdf import PdfReader
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('srd', type=Path)
    parser.add_argument('mm', type=Path)
    args = parser.parse_args()
    data = json.loads((ROOT / 'catalog/mm-srd-version-differences-2014.json').read_text(encoding='utf-8-sig'))
    pages = {}
    for key, path, numbers in [('srd', args.srd, [307, 325, 401]), ('mm', args.mm, [2])]:
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
    print(audit(data, pages, catalogs), 'creatures / differences; source differences only, no automatic patch')
