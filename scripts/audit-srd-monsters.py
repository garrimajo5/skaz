"""Read-only comparison of bundled monster statistics with the pinned SRD PDF.

Checks base statistics and declared prepared caster lists; other traits/actions remain manual.
Requires pypdf and the application's Node.js runtime.
"""
import argparse
import hashlib
import json
import re
import runpy
import subprocess
from pathlib import Path

shared = runpy.run_path(str(Path(__file__).with_name('audit-srd-spell-cards.py')))
normalize, ROOT, SHA256 = shared['normalize'], shared['ROOT'], shared['SHA256']
SIZES = 'Tiny|Small|Medium|Large|Huge|Gargantuan'
TYPES = 'aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead'


def statistics(text, name):
    # The pinned PDF encodes some hyphens as ASCII + soft hyphen + U+2010.
    clean = lambda value: re.sub(r'[-\u00ad\u2010\u2011]+', '-', normalize(value))
    text = clean(text)
    heading = re.search(re.escape(clean(name)) + r'\s+(' + SIZES + r')\s+(' + TYPES + r')\b', text)
    if not heading:
        raise ValueError('Missing creature heading: ' + name)
    body = text[heading.end():]
    # Never borrow a missing field from the next statblock.
    next_block = re.search(r'\b(?:' + SIZES + r')\s+(?:' + TYPES + r')\b', body)
    if next_block:
        body = body[:next_block.start()]
    def field(pattern, label):
        found = re.search(pattern, body)
        if not found:
            raise ValueError('Missing ' + label + ' for ' + name)
        return found
    ac = int(field(r'Armor Class (\d+)', 'AC')[1])
    hp = int(field(r'Hit Points (\d+)', 'HP')[1])
    speed_text = field(r'Speed (.*?) STR DEX CON INT WIS CHA', 'speed')[1]
    # Hover is retained in the authored trait text; the numeric schema stores speed only.
    speed_text = re.sub(r'\bfly (\d+) ft\. \(hover\)', r'fly \1 ft.', speed_text)
    speeds = {}
    for mode, number in re.findall(r'(?:(walk|climb|swim|fly|burrow) )?(\d+) ft\.', speed_text):
        speeds[mode or 'walk'] = int(number)
    if not speeds or re.sub(r'(?:(?:walk|climb|swim|fly|burrow) )?\d+ ft\.[, ]*', '', speed_text).strip():
        raise ValueError('Unsupported speed notation for ' + name)
    ability_text = field(r'STR DEX CON INT WIS CHA ((?:\d+ \([+−-]\d+\)\s*){6})', 'abilities')[1]
    scores = list(map(int, re.findall(r'(\d+) \(', ability_text)))
    cr = field(r'Challenge (\d+(?:/\d+)?) \(([\d,]+) XP\)', 'challenge/XP')
    return {'size': heading[1].lower(), 'type': heading[2], 'armorClass': ac,
            'hitPoints': hp, 'speed': speeds,
            'abilities': dict(zip(['str','dex','con','int','wis','cha'], scores)),
            'challenge': cr[1], 'xp': int(cr[2].replace(',', ''))}


def spellcasting_levels(text,name):
    """Read a prepared spell list and slots; not spell effects or class progression."""
    text=normalize(text)
    heading=re.search(re.escape(normalize(name))+r'\s+(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',text)
    if not heading:raise ValueError('Missing caster heading: '+name)
    body=text[heading.end():]
    next_block=re.search(r'\b(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',body)
    if next_block:body=body[:next_block.start()]
    listing=re.search(r'following (?:wizard|cleric) spells prepared: (.*?)(?: Turn Resistance\.| Actions)',body)
    if not listing:raise ValueError('Missing prepared spells for '+name)
    pattern=r'Cantrips \(at will\):|([1-9])(?:st|nd|rd|th) level \((\d+) slots?\):'
    marks=list(re.finditer(pattern,listing[1]))
    if not marks or marks[0].start()!=0:raise ValueError('Unsupported prepared list for '+name)
    rows=[]
    for i,mark in enumerate(marks):
        level=int(mark[1]) if mark[1] else 0
        names=listing[1][mark.end():marks[i+1].start() if i+1<len(marks) else len(listing[1])].strip().split(', ')
        if not names or any(not value or not re.fullmatch(r"[a-z][a-z '’-]+",value) for value in names):raise ValueError('Unsupported spell name for '+name)
        rows.append({'level':level,'slots':int(mark[2]) if mark[2] else None,'spellIds':['srd51:2014:spell:'+value.replace(' ','-') for value in names]})
    if len({row['level'] for row in rows})!=len(rows):raise ValueError('Duplicate spell level for '+name)
    return rows


def check_spellcasting_inventory(pages,manifest,cards,spells):
    if manifest['sourceSha256']!=SHA256:raise ValueError('Wrong caster source')
    result={}
    for caster in manifest['spellcastingChecks']:
        found=[c for c in cards if c['id']==caster['monsterId']]
        row=next((r for r in manifest['entries'] if r['id']==caster['monsterId']),None)
        if len(found)!=1 or row is None or found[0]['name']['en']!=caster['nameEn']:raise ValueError('Missing prepared caster')
        text=' '.join(pages[n] for n in row['pages'])
        levels=spellcasting_levels(text,caster['nameEn'])
        if levels!=caster['levels']:raise ValueError('Source spell list/slots differ for '+caster['nameEn'])
        ids=[id for level in levels for id in level['spellIds']]
        if len(set(ids))!=len(ids):raise ValueError('Duplicate prepared spell')
        for id in ids:
            source_level=next(level['level'] for level in levels if id in level['spellIds'])
            spell=next((spell for spell in spells if spell['id']==id),None)
            if (spell is None or spell['spell']['level']!=source_level or id not in found[0]['links'] or
                not re.search(r'(?<![a-z])'+re.escape(normalize(spell['name']['en']).lower())+r'(?![a-z])',normalize(found[0]['text']).lower())):
                raise ValueError('Missing linked/text spell '+id+' for '+caster['nameEn'])
        result[caster['nameEn']]=len(ids)
    return result


def npc_headings(pages):
    """Inventory the pinned appendix, independently of prepared catalog cards."""
    entries = []
    for page, text in sorted(pages.items()):
        for match in re.finditer(r'([A-Z][a-z]+(?: [A-Z][a-z]+)?) Medium humanoid', normalize(text)):
            name = match[1]
            entries.append({'id': 'srd51:2014:monster:' + name.lower().replace(' ', '-'),
                            'nameEn': name, 'page': page})
    return entries


def familiar_headings(text):
    match = re.search(r'animal form you choose: (.*?)\. Appearing', normalize(text))
    if not match:
        raise ValueError('Missing Find Familiar form list')
    names = match[1].replace(', or ', ', ').split(', ')
    aliases = {'frog (toad)': 'Frog', 'fish (quipper)': 'Quipper'}
    names = [aliases.get(name, name.title()) for name in names]
    if len(names) != 15 or len(set(names)) != 15:
        raise ValueError('Unexpected or duplicate familiar forms')
    return names


def ooze_headings(pages):
    """Inventory this source section independently of the authored card list."""
    rows = []
    for page, text in sorted(pages.items()):
        for match in re.finditer(r'([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:' + SIZES + r') ooze\b', normalize(text)):
            name = match[1]
            rows.append({'id': 'srd51:2014:monster:' + name.lower().replace(' ', '-'),
                         'nameEn': name, 'page': page})
    return rows


def check_ooze_coverage(pages, manifest, cards):
    rows = ooze_headings(pages)
    declared = [{'id': row['id'], 'nameEn': row['nameEn'], 'page': row['pages'][0]}
                for row in manifest['entries']]
    if (manifest['sourceSha256'] != SHA256 or not rows or
            manifest['expectedSubsetCount'] != len(rows) or declared != rows):
        raise ValueError('Ooze coverage differs from pinned section headings/pages.')
    for row in rows:
        found = [card for card in cards if card['id'] == row['id']]
        if (len(found) != 1 or found[0]['name']['en'] != row['nameEn'] or
                found[0]['monster']['type'] != 'ooze' or
                not found[0]['source']['url'].endswith('#page=' + str(row['page']))):
            raise ValueError('Missing, duplicate or mismatched ooze card: ' + row['nameEn'])
    return len(rows)


def animated_headings(pages):
    rows = []
    for page, text in sorted(pages.items()):
        text = normalize(text).replace('Animated Objects ', '').replace('Golems ', '')
        for match in re.finditer(r'([A-Z][a-z]+(?: (?:of )?[A-Z][a-z]+){0,2}) (?:' + SIZES + r') construct\b', text):
            name = match[1]
            rows.append({'id':'srd51:2014:monster:'+name.lower().replace(' ','-'),
                         'nameEn':name, 'page':page})
    return rows


def check_animated_coverage(pages, manifest, cards):
    rows = animated_headings(pages)
    declared = [{'id':row['id'],'nameEn':row['nameEn'],'page':row['pages'][0]} for row in manifest['entries']]
    if (manifest['sourceSha256'] != SHA256 or not rows or
            manifest['expectedSubsetCount'] != len(rows) or declared != rows):
        raise ValueError('Animated objects differ from source headings/pages')
    for row in rows:
        found = [card for card in cards if card['id'] == row['id']]
        if (len(found) != 1 or found[0]['name']['en'] != row['nameEn'] or
                found[0]['monster']['type'] != 'construct' or
                not found[0]['source']['url'].endswith('#page='+str(row['page']))):
            raise ValueError('Missing or mismatched animated object: '+row['nameEn'])
    return len(rows)


def type_headings(pages, kind):
    if kind == 'construct':
        return animated_headings(pages)
    if kind not in ('fey', 'plant'):
        raise ValueError('Unsupported source inventory type')
    rows = []
    for page, text in sorted(pages.items()):
        for match in re.finditer(r'([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:' + SIZES + r') ' + kind + r'\b', normalize(text)):
            # The section heading immediately precedes Shrieker on page 309.
            name = match[1].removeprefix('Fungi ')
            rows.append({'id': 'srd51:2014:monster:' + name.lower().replace(' ', '-'),
                         'nameEn': name, 'page': page})
    return rows


def undead_headings(pages):
    rows=[]
    for page,text in sorted(pages.items()):
        text=re.sub(r'[-\u00ad\u2010\u2011]+','-',normalize(text))
        for label in ('Ghouls ','Mummies ','Skeletons ','Vampires ','Zombies '):text=text.replace(label,'')
        for match in re.finditer(r"([A-Z][A-Za-z'-]+(?: [A-Z][a-z]+){0,2}) (?:"+SIZES+r') undead\b',text):
            name=match[1].replace("'",'’')
            rows.append({'id':'srd51:2014:monster:'+name.lower().replace('’','').replace(' ','-'),'nameEn':name,'page':page})
    return rows


def check_undead_inventory(pages,manifest,cards):
    rows=undead_headings(pages)
    if (manifest['sourceSha256']!=SHA256 or manifest['ruleset']!='5e-2014' or
        manifest['sourcePageRange']!=[254,394] or manifest['expectedCount']!=len(rows) or not rows or manifest['entries']!=rows):
        raise ValueError('Undead inventory differs from source headings/pages')
    prepared=0
    for row in rows:
        found=[card for card in cards if card['id']==row['id']]
        if not found:continue  # Missing source cards are explicitly shown in the public inventory.
        if (len(found)!=1 or found[0]['name']['en']!=row['nameEn'] or found[0]['monster']['type']!='undead' or
            not found[0]['source']['url'].endswith('#page='+str(row['page']))):
            raise ValueError('Duplicate or mismatched prepared undead: '+row['nameEn'])
        prepared+=1
    return {'expected':len(rows),'prepared':prepared}


def check_type_inventory(pages, manifest, cards, expected_types=('fey', 'plant')):
    if (manifest['sourceSha256'] != SHA256 or manifest['ruleset'] != '5e-2014' or
            manifest['sourcePageRange'] != [254, 394] or
            [section['monsterType'] for section in manifest['sections']] != list(expected_types)):
        raise ValueError('Wrong typed source inventory')
    result = {}
    for section in manifest['sections']:
        kind = section['monsterType']
        rows = type_headings(pages, kind)
        if not rows or section['expectedCount'] != len(rows) or section['entries'] != rows:
            raise ValueError('Typed headings/pages differ from source: ' + kind)
        for row in rows:
            found = [card for card in cards if card['id'] == row['id']]
            if (len(found) != 1 or found[0]['name']['en'] != row['nameEn'] or
                    found[0]['monster']['type'] != kind or
                    not found[0]['source']['url'].endswith('#page=' + str(row['page']))):
                raise ValueError('Missing or mismatched typed card: ' + row['nameEn'])
        result[kind] = len(rows)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only the pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    reader = PdfReader(args.pdf)
    appendix = npc_headings({p: reader.pages[p-1].extract_text() for p in range(395, 404)})
    inventory = json.loads((ROOT / 'catalog/srd51-npc-inventory.json').read_text(encoding='utf-8-sig'))
    if inventory['sourceSha256'] != SHA256 or inventory['expectedCount'] != len(appendix) or inventory['entries'] != appendix:
        raise SystemExit('NPC inventory differs from the pinned Appendix B headings/pages.')
    code = "import{bundledCatalog}from'./server/bundled-catalog.mjs';process.stdout.write(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='monster')))"
    cards = json.loads(subprocess.check_output(['node','--input-type=module','-e',code], cwd=ROOT, encoding='utf-8'))
    ooze_manifest = json.loads((ROOT / 'catalog/srd51-oozes.coverage.json').read_text(encoding='utf-8-sig'))
    ooze_count = check_ooze_coverage({p: reader.pages[p-1].extract_text() for p in range(337, 340)}, ooze_manifest, cards)
    type_inventory = json.loads((ROOT / 'catalog/srd51-fey-plant-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts = check_type_inventory({p: reader.pages[p-1].extract_text() for p in range(254, 395)}, type_inventory, cards)
    construct_inventory = json.loads((ROOT / 'catalog/srd51-constructs-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory({p:reader.pages[p-1].extract_text() for p in range(254,395)}, construct_inventory, cards, ('construct',)))
    undead_inventory=json.loads((ROOT/'catalog/srd51-undead-inventory.json').read_text(encoding='utf-8-sig'))
    undead_count=check_undead_inventory({p:reader.pages[p-1].extract_text() for p in range(254,395)},undead_inventory,cards)
    animated_manifest = json.loads((ROOT / 'catalog/srd51-animated-objects.coverage.json').read_text(encoding='utf-8-sig'))
    animated_count = check_animated_coverage({p:reader.pages[p-1].extract_text() for p in [263,264]}, animated_manifest, cards)
    familiar = json.loads((ROOT / 'catalog/srd51-familiar-forms.coverage.json').read_text(encoding='utf-8-sig'))
    familiar_names = familiar_headings(reader.pages[142].extract_text())
    if familiar['sourceSha256'] != SHA256 or familiar['expectedSubsetCount'] != 15 or sorted(row['nameEn'] for row in familiar['entries']) != sorted(familiar_names):
        raise SystemExit('Familiar inventory differs from the pinned spell on page 143.')
    for row in familiar['entries']:
        matches = [card for card in cards if card['id'] == row['id']]
        if len(matches) != 1 or matches[0]['name']['en'] != row['nameEn'] or not matches[0]['source']['url'].endswith('#page=' + str(row['pages'][0])):
            raise SystemExit('Missing or mismatched familiar card: ' + row['nameEn'])
    spell_code="import{bundledCatalog}from'./server/bundled-catalog.mjs';process.stdout.write(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='spell')))"
    spells=json.loads(subprocess.check_output(['node','--input-type=module','-e',spell_code],cwd=ROOT,encoding='utf-8'))
    caster_counts={}
    for package in ['srd51-undead-elites','srd51-undead-rulers']:
        caster_manifest=json.loads((ROOT/('catalog/'+package+'.coverage.json')).read_text(encoding='utf-8-sig'))
        source_pages={n:reader.pages[n-1].extract_text() for row in caster_manifest['entries'] for n in row['pages']}
        caster_counts.update(check_spellcasting_inventory(source_pages,caster_manifest,cards,spells))
    pages, failures = {}, []
    for card in cards:
        page = int(card['source']['url'].rsplit('#page=', 1)[1])
        for n in range(page, min(page + 1, len(reader.pages)) + 1):
            if n not in pages:
                pages[n] = reader.pages[n-1].extract_text()
        try:
            expected = statistics(pages[page] + pages.get(page+1, ''), card['name']['en'])
            errors = [key for key in expected if expected[key] != card['monster'][key]]
            if errors:
                failures.append({'id': card['id'], 'fields': errors, 'source': expected})
        except ValueError as error:
            failures.append({'id': card['id'], 'error': str(error)})
    print(json.dumps({'checked': len(cards), 'npcHeadingsChecked': len(appendix), 'familiarFormsChecked': len(familiar_names), 'oozeHeadingsChecked': ooze_count, 'typedHeadingsChecked': type_counts, 'animatedHeadingsChecked': animated_count, 'undeadHeadingsChecked':undead_count, 'preparedCasterSpellsChecked':caster_counts, 'failures': failures,
                      'scope': 'Base statistics and declared prepared spell lists; other actions/traits need manual source review.'}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
