"""Read-only comparison of bundled monster statistics with the pinned SRD PDF.

Checks base statistics, declared prepared/innate lists and selected primary melee attacks; other effects remain manual.
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


def innate_spellcasting(text,name):
    text=normalize(text)
    start=re.search(re.escape(name)+r'\s+(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',text)
    if not start:raise ValueError('Missing innate caster heading')
    body=text[start.end():]
    next_block=re.search(r'\b(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',body)
    if next_block:body=body[:next_block.start()]
    caster=re.search(r"spellcasting ability is (Charisma|Intelligence)(?: \(spell save DC (\d+)(?:, \+\d+ to hit with spell attacks)?\))?\..*?following spells, requiring (only verbal|no material) components: (.*?)(?: Magic Resistance\.| Magic Weapons\.| Regeneration\.| Actions)",body)
    if not caster:raise ValueError('Unsupported innate spellcasting block for '+name)
    marks=list(re.finditer(r'At will:|([1-9])/day each:',caster[4]))
    if not marks or marks[0].start()!=0:raise ValueError('Unsupported innate frequency')
    groups=[]
    for i,mark in enumerate(marks):
        names=caster[4][mark.end():marks[i+1].start() if i+1<len(marks) else len(caster[4])].strip().split(', ')
        spells=[]
        for name_text in names:
            target='self' if name_text.endswith(' (self only)') else None
            name_text=name_text.removesuffix(' (self only)')
            if not re.fullmatch(r'[a-z]+(?: [a-z]+)*',name_text):raise ValueError('Unsupported innate spell name')
            spells.append({'id':'srd51:2014:spell:'+name_text.replace(' ','-'),'target':target})
        groups.append({'usesPerDay':int(mark[1]) if mark[1] else None,'spells':spells})
    if len({g['usesPerDay'] for g in groups})!=len(groups):raise ValueError('Duplicate innate frequency')
    return {'ability':{'Charisma':'cha','Intelligence':'int'}[caster[1]],'saveDC':int(caster[2]) if caster[2] else None,'components':'verbal-only' if caster[3]=='only verbal' else 'no-material','groups':groups}


def innate_spell_attack_bonus(text,name):
    text=normalize(text)
    heading=re.search(re.escape(name)+r'\s+(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',text)
    if not heading:raise ValueError('Missing innate attack caster')
    body=text[heading.end():]
    next_block=re.search(r'\b(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',body)
    if next_block:body=body[:next_block.start()]
    found=re.search(r'spellcasting ability is (?:Charisma|Intelligence) \(spell save DC \d+, \+(\d+) to hit with spell attacks\)',body)
    return int(found[1]) if found else None


def authored_innate_spellcasting(text):
    """Compare this project's explicit RU frequency lists with the source, not inferred class math."""
    text=normalize(text)
    header=re.search(r'Врождённая магия: (Харизма|Интеллект)(?:, Сл (\d+))?',text)
    listing=re.search(r'Без ограничений — (.*?)(?:\.|$)',text)
    if not header or not listing:raise ValueError('Missing authored innate casting list')
    components='verbal-only' if 'только вербальные компоненты' in text.lower() else 'no-material' if 'без материальных компонентов' in text.lower() else None
    listing='Без ограничений — '+listing[1]
    marks=list(re.finditer(r'Без ограничений —|([1-9]) раз(?:а|ов)? в день каждое —',listing))
    groups=[]
    for i,mark in enumerate(marks):
        names=listing[mark.end():marks[i+1].start() if i+1<len(marks) else len(listing)].strip(' ;').split(', ')
        spells=[]
        for title in names:
            target='self' if title.endswith(' только на себя') else None
            title=title.removesuffix(' только на себя')
            if not re.fullmatch(r'[a-z]+(?: [a-z]+)*',title):raise ValueError('Unsupported authored innate spell name')
            spells.append({'id':'srd51:2014:spell:'+title.replace(' ','-'),'target':target})
        groups.append({'usesPerDay':int(mark[1]) if mark[1] else None,'spells':spells})
    return {'ability':{'Харизма':'cha','Интеллект':'int'}[header[1]],'saveDC':int(header[2]) if header[2] else None,'components':components,'groups':groups}


def check_innate_spellcasting_inventory(pages,manifest,cards,spells):
    if manifest['sourceSha256']!=SHA256:raise ValueError('Wrong innate source')
    result={}
    for declared in manifest['innateSpellcastingChecks']:
        card=next((c for c in cards if c['id']==declared['monsterId']),None)
        row=next((r for r in manifest['entries'] if r['id']==declared['monsterId']),None)
        if card is None or row is None:raise ValueError('Missing innate caster')
        expected=innate_spellcasting(' '.join(pages[n] for n in row['pages']),declared['nameEn'])
        if expected!={k:declared[k] for k in ['ability','saveDC','components','groups']}:raise ValueError('Innate source, frequency or self restriction differs')
        if authored_innate_spellcasting(card['text'])!=expected:raise ValueError('Authored innate DC/components/frequency/spells differ from source')
        if 'spellAttackBonus' in declared:
            source_bonus=innate_spell_attack_bonus(' '.join(pages[n] for n in row['pages']),declared['nameEn'])
            authored_bonus=re.search(r'атака заклинанием \+(\d+)',card['text'])
            if source_bonus is None or not authored_bonus or source_bonus!=declared['spellAttackBonus'] or int(authored_bonus[1])!=declared['spellAttackBonus']:raise ValueError('Innate spell attack bonus differs')
        checked=[]
        for group in expected['groups']:
            for ref in group['spells']:
                spell=next((s for s in spells if s['id']==ref['id']),None)
                if spell is None or ref['id'] not in card['links']:raise ValueError('Missing innate spell link')
                title=re.escape(normalize(spell['name']['en']).lower())
                if not re.search(r'(?<![a-z])'+title+r'(?![a-z])',normalize(card['text']).lower()):raise ValueError('Missing innate spell text')
                if ref['target']=='self' and not re.search(title+r' только на себя',normalize(card['text']).lower()):raise ValueError('Missing authored self restriction')
                checked.append(ref['id'])
        if len(set(checked))!=len(checked):raise ValueError('Duplicate innate spell')
        result[declared['nameEn']]=len(checked)
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


def fiend_headings(pages):
    rows=[]
    for page,text in sorted(pages.items()):
        text=normalize(text).replace('Demons ','').replace('Devils ','')
        for match in re.finditer(r'([A-Z][a-z]+(?:/[A-Z][a-z]+)?(?: [A-Z][a-z]+){0,2}) (?:'+SIZES+r') fiend\b',text):
            name=match[1]
            rows.append({'id':'srd51:2014:monster:'+name.lower().replace('/','-').replace(' ','-'),'nameEn':name,'page':page})
    return rows


def dragon_headings(pages):
    rows=[]
    for page,text in sorted(pages.items()):
        text=normalize(text)
        found=list(re.finditer(r'(?<![A-Za-z/’–-])([A-Z][a-z]+(?: [A-Z][a-z]+){0,3}) (?:'+SIZES+r') dragon\b',text))
        if len(found)!=len(re.findall(r'\b(?:'+SIZES+r') dragon\b',text)):
            raise ValueError('Unsupported dragon heading')
        for match in found:
            name=match[1]
            if name.startswith('Dragon Ancient '):name=name.removeprefix('Dragon ')
            rows.append({'id':'srd51:2014:monster:'+name.lower().replace(' ','-'),'nameEn':name,'page':page})
    return rows


def type_headings(pages, kind):
    if kind == 'dragon':return dragon_headings(pages)
    if kind == 'fiend':return fiend_headings(pages)
    if kind == 'construct':
        return animated_headings(pages)
    if kind not in ('fey', 'plant','celestial','giant','aberration'):
        raise ValueError('Unsupported source inventory type')
    rows = []
    for page, text in sorted(pages.items()):
        for match in re.finditer(r'([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:' + SIZES + r') ' + kind + r'\b', normalize(text)):
            # The section heading immediately precedes Shrieker on page 309.
            name = match[1].removeprefix('Fungi ').removeprefix('Angels ')
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


def check_type_inventory(pages, manifest, cards, expected_types=('fey', 'plant'), allow_missing=False):
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
        prepared=0
        for row in rows:
            found = [card for card in cards if card['id'] == row['id']]
            if not found and allow_missing:continue
            if (len(found) != 1 or found[0]['name']['en'] != row['nameEn'] or
                    found[0]['monster']['type'] != kind or
                    not found[0]['source']['url'].endswith('#page=' + str(row['page']))):
                raise ValueError('Missing or mismatched typed card: ' + row['nameEn'])
            prepared+=1
        result[kind] = {'expected':len(rows),'prepared':prepared} if allow_missing else len(rows)
    return result


def melee_weapon_attack(text,creature,name):
    text=normalize(text)
    heading=re.search(re.escape(creature)+r'\s+(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',text)
    if not heading:raise ValueError('Missing melee creature')
    body=text[heading.end():]
    next_block=re.search(r'\b(?:'+SIZES+r')\s+(?:'+TYPES+r')\b[^.]*? Armor Class \d+',body)
    if next_block:body=body[:next_block.start()]
    pattern=(r'(?<![a-zA-Z])'+re.escape(name)+r'\. Melee Weapon Attack: \+(\d+) to hit, reach (\d+) ft\., '
             r'one (?:target|creature)\. Hit: (\d+) \((\d+d\d+(?: [+-] \d+)?)\) ([a-z]+) damage')
    found=list(re.finditer(pattern,body))
    if len(found)!=1:raise ValueError('Missing, duplicate or unsupported melee attack: '+creature+'/'+name)
    match=found[0]
    return {'nameEn':name,'attackBonus':int(match[1]),'reach':int(match[2]),'averageDamage':int(match[3]),'damageDice':match[4],'damageType':match[5]}


def melee_additional_damage(text,creature,name):
    text=normalize(text)
    heading=re.search(re.escape(creature)+r'\s+(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',text)
    if not heading:raise ValueError('Missing additional-damage creature')
    body=text[heading.end():]
    next_block=re.search(r'\b(?:'+SIZES+r')\s+(?:'+TYPES+r')\b[^.]*? Armor Class \d+',body)
    if next_block:body=body[:next_block.start()]
    pattern=(r'(?<![a-zA-Z])'+re.escape(name)+r'\. Melee Weapon Attack: \+\d+ to hit, reach \d+ ft\., one (?:target|creature)\. '
             r'Hit: \d+ \(\d+d\d+(?: [+-] \d+)?\) [a-z]+ damage([^.]*?)\.')
    hits=list(re.finditer(pattern,body))
    if len(hits)!=1:raise ValueError('Missing or duplicate additional-damage attack')
    tail=hits[0][1]
    damage_pattern=r' plus (\d+) \((\d+d\d+(?: [+-] \d+)?)\) ([a-z]+) damage'
    found=re.match('(?:'+damage_pattern+')+',tail)
    if not found:raise ValueError('Unsupported additional-damage notation: '+creature+'/'+name)
    suffix=tail[found.end():]
    if suffix and not re.fullmatch(r', and the target must (?:succeed on|make) a DC \d+ (?:Strength|Constitution) saving throw.*',suffix):
        raise ValueError('Unsupported trailing damage clause: '+creature+'/'+name)
    return [{'averageDamage':int(a),'damageDice':dice,'damageType':kind} for a,dice,kind in re.findall(damage_pattern,found[0])]


def check_melee_weapon_inventory(pages,manifest,cards):
    if manifest['sourceSha256']!=SHA256:raise ValueError('Wrong melee source')
    count=0
    for declared in manifest.get('weaponAttackChecks',[]):
        row=next((r for r in manifest['entries'] if r['id']==declared['monsterId']),None)
        card=next((c for c in cards if c['id']==declared['monsterId']),None)
        if row is None or card is None or row['nameEn']!=declared['nameEn']:raise ValueError('Missing melee creature manifest')
        attacks=declared['attacks']
        if not attacks or len({a['nameEn'] for a in attacks})!=len(attacks):raise ValueError('Duplicate melee declaration')
        for attack in attacks:
            source=melee_weapon_attack(' '.join(pages[n] for n in row['pages']),declared['nameEn'],attack['nameEn'])
            if source!={k:v for k,v in attack.items() if k!='additionalDamage'}:raise ValueError('Melee source statistics differ')
            if 'additionalDamage' in attack:
                additional=melee_additional_damage(' '.join(pages[n] for n in row['pages']),declared['nameEn'],attack['nameEn'])
                if additional!=attack['additionalDamage']:raise ValueError('Additional melee damage differs')
                for damage in additional:
                    ru_type={'acid':'кислотного','lightning':'электрического','poison':'урона ядом','fire':'огненного','cold':'холодного'}.get(damage['damageType'])
                    fragment=str(damage['averageDamage'])+' ('+damage['damageDice']+') '+str(ru_type)
                    if ru_type is None or fragment not in normalize(card['text']):raise ValueError('Authored additional melee damage differs')
            if str(source['averageDamage'])+' ('+source['damageDice']+')' not in normalize(card['text']):raise ValueError('Melee damage missing in authored text')
            count+=1
    return count


def dragon_breath(text,creature,name):
    text=re.sub(r'[-\u00ad\u2010\u2011]+','-',normalize(text))
    heading=re.search(re.escape(creature)+r'\s+(?:'+SIZES+r')\s+(?:'+TYPES+r')\b',text)
    if not heading:raise ValueError('Missing breath creature')
    body=text[heading.end():]
    next_block=re.search(r'\b(?:'+SIZES+r')\s+(?:'+TYPES+r')\b[^.]*? Armor Class \d+',body)
    if next_block:body=body[:next_block.start()]
    pattern=(re.escape(name)+r' \(Recharge ([1-6])[–-]([1-6])\)\. The (?:dragon turtle|dragon) exhales [^.]*? in an? '
             r'(\d+)-foot (line|cone)(?: that is (\d+) feet wide)?\. Each creature in that (?:line|area) must make a DC (\d+) '
             r'(Dexterity|Constitution) saving throw, taking (\d+) \((\d+d\d+(?: [+-] \d+)?)\) ([a-z]+) damage on a failed save, '
             r'or half as much damage on a successful one\.')
    found=list(re.finditer(pattern,body))
    if len(found)!=1:raise ValueError('Missing, duplicate or unsupported breath weapon: '+creature+'/'+name)
    match=found[0]
    if (match[4]=='line')!=(match[5] is not None):raise ValueError('Unsupported breath geometry')
    return {'nameEn':name,'recharge':[int(match[1]),int(match[2])],'shape':match[4],'length':int(match[3]),'width':int(match[5]) if match[5] else None,
            'saveAbility':{'Dexterity':'dex','Constitution':'con'}[match[7]],'saveDC':int(match[6]),'averageDamage':int(match[8]),'damageDice':match[9],'damageType':match[10]}


def check_dragon_breath_inventory(pages,manifest,cards):
    if manifest['sourceSha256']!=SHA256:raise ValueError('Wrong breath source')
    count=0;seen=set()
    for row in manifest.get('breathChecks',[]):
        key=(row['monsterId'],row['breath']['nameEn'])
        if key in seen:raise ValueError('Duplicate breath declaration')
        seen.add(key)
        source_row=next((r for r in manifest['entries'] if r['id']==row['monsterId']),None)
        card=next((c for c in cards if c['id']==row['monsterId']),None)
        if source_row is None or card is None or source_row['nameEn']!=row['nameEn']:raise ValueError('Missing breath card')
        text=' '.join(pages[n] for n in source_row['pages']);declared=row['breath']
        expected=dragon_breath(text,row['nameEn'],declared['nameEn'])
        if expected!={k:v for k,v in declared.items() if k!='underwaterResistance'}:raise ValueError('Breath geometry, save or damage differs')
        ru=normalize(card['text']);geometry=('линия '+str(expected['length'])+' футов шириной '+str(expected['width'])+' футов') if expected['shape']=='line' else ('конус '+str(expected['length'])+' футов')
        fragments=[geometry,{'dex':'Ловкость','con':'Телосложение'}[expected['saveAbility']]+' Сл '+str(expected['saveDC']),str(expected['averageDamage'])+' ('+expected['damageDice']+')','перезарядка '+str(expected['recharge'][0])+'–'+str(expected['recharge'][1]),'половина при успехе']
        if any(fragment not in ru for fragment in fragments):raise ValueError('Authored breath geometry, save, recharge or damage differs')
        if 'underwaterResistance' in declared:
            if declared['underwaterResistance'] is not False or "Being underwater doesn't grant resistance against this damage." not in normalize(text) or 'Нахождение под водой не даёт сопротивления этому урону' not in ru:
                raise ValueError('Underwater breath exception differs')
        count+=1
    return count


def check_selected_monster_manifest(pages,manifest,cards):
    """Audit a bounded source pack without treating its size as full type coverage."""
    rows=manifest['entries']
    if (manifest['schemaVersion']!=1 or manifest['ruleset']!='5e-2014' or manifest['sourceSha256']!=SHA256 or
        manifest['completeGameCatalog'] is not False or manifest['expectedSubsetCount']!=len(rows) or not rows or
        len({r['id'] for r in rows})!=len(rows) or len({r['nameEn'] for r in rows})!=len(rows)):
        raise ValueError('Invalid selected creature source manifest')
    for row in rows:
        numbers=row['pages']
        if not numbers or numbers!=sorted(set(numbers)) or any(type(n)!=int or n<254 or n>394 for n in numbers):
            raise ValueError('Invalid selected creature source pages')
        found=[c for c in cards if c['id']==row['id']]
        if (len(found)!=1 or found[0]['ruleset']!='5e-2014' or found[0]['source']['usage']!='cc-by-4.0' or
            found[0]['name']['en']!=row['nameEn'] or found[0]['source']['url']!=manifest['sourceUrl']+'#page='+str(numbers[0])):
            raise ValueError('Selected source card identity differs')
        expected=statistics(' '.join(pages[n] for n in numbers),row['nameEn'])
        if expected!=found[0]['monster']:raise ValueError('Selected source card statistics differ')
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only the pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    reader = PdfReader(args.pdf)
    monster_pages={p:reader.pages[p-1].extract_text() for p in range(254,395)}
    appendix = npc_headings({p: reader.pages[p-1].extract_text() for p in range(395, 404)})
    inventory = json.loads((ROOT / 'catalog/srd51-npc-inventory.json').read_text(encoding='utf-8-sig'))
    if inventory['sourceSha256'] != SHA256 or inventory['expectedCount'] != len(appendix) or inventory['entries'] != appendix:
        raise SystemExit('NPC inventory differs from the pinned Appendix B headings/pages.')
    code = "import{bundledCatalog}from'./server/bundled-catalog.mjs';process.stdout.write(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='monster')))"
    cards = json.loads(subprocess.check_output(['node','--input-type=module','-e',code], cwd=ROOT, encoding='utf-8'))
    ooze_manifest = json.loads((ROOT / 'catalog/srd51-oozes.coverage.json').read_text(encoding='utf-8-sig'))
    ooze_count = check_ooze_coverage({p: reader.pages[p-1].extract_text() for p in range(337, 340)}, ooze_manifest, cards)
    type_inventory = json.loads((ROOT / 'catalog/srd51-fey-plant-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts = check_type_inventory(monster_pages, type_inventory, cards)
    construct_inventory = json.loads((ROOT / 'catalog/srd51-constructs-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory(monster_pages, construct_inventory, cards, ('construct',)))
    undead_inventory=json.loads((ROOT/'catalog/srd51-undead-inventory.json').read_text(encoding='utf-8-sig'))
    undead_count=check_undead_inventory(monster_pages,undead_inventory,cards)
    celestial_inventory=json.loads((ROOT/'catalog/srd51-celestial-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory(monster_pages,celestial_inventory,cards,('celestial',)))
    giant_inventory=json.loads((ROOT/'catalog/srd51-giant-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory(monster_pages,giant_inventory,cards,('giant',)))
    aberration_inventory=json.loads((ROOT/'catalog/srd51-aberration-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory(monster_pages,aberration_inventory,cards,('aberration',)))
    fiend_inventory=json.loads((ROOT/'catalog/srd51-fiend-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory(monster_pages,fiend_inventory,cards,('fiend',),allow_missing=True))
    dragon_inventory=json.loads((ROOT/'catalog/srd51-dragon-inventory.json').read_text(encoding='utf-8-sig'))
    type_counts.update(check_type_inventory(monster_pages,dragon_inventory,cards,('dragon',),allow_missing=True))
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
    innate_manifest=json.loads((ROOT/'catalog/srd51-angels.coverage.json').read_text(encoding='utf-8-sig'))
    innate_pages={n:reader.pages[n-1].extract_text() for row in innate_manifest['entries'] for n in row['pages']}
    innate_counts=check_innate_spellcasting_inventory(innate_pages,innate_manifest,cards,spells)
    giant_manifest=json.loads((ROOT/'catalog/srd51-giants.coverage.json').read_text(encoding='utf-8-sig'))
    giant_pages={n:reader.pages[n-1].extract_text() for row in giant_manifest['entries'] for n in row['pages']}
    innate_counts.update(check_innate_spellcasting_inventory(giant_pages,giant_manifest,cards,spells))
    kin_manifest=json.loads((ROOT/'catalog/srd51-giant-kin.coverage.json').read_text(encoding='utf-8-sig'))
    kin_pages={n:reader.pages[n-1].extract_text() for row in kin_manifest['entries'] for n in row['pages']}
    innate_counts.update(check_innate_spellcasting_inventory(kin_pages,kin_manifest,cards,spells))
    night_manifest=json.loads((ROOT/'catalog/srd51-night-fiends.coverage.json').read_text(encoding='utf-8-sig'))
    night_pages={n:reader.pages[n-1].extract_text() for row in night_manifest['entries'] for n in row['pages']}
    innate_counts.update(check_innate_spellcasting_inventory(night_pages,night_manifest,cards,spells))
    for package in ['srd51-demon-casters','srd51-pit-fiend','srd51-fiend-intrigues']:
        manifest=json.loads((ROOT/('catalog/'+package+'.coverage.json')).read_text(encoding='utf-8-sig'))
        source_pages={n:monster_pages[n] for row in manifest['entries'] for n in row['pages']}
        innate_counts.update(check_innate_spellcasting_inventory(source_pages,manifest,cards,spells))
    selected_fiends=0
    melee_checked=0
    additional_melee_checked=0
    for package in ['srd51-night-fiends','srd51-lesser-fiends','srd51-devil-guards','srd51-demon-casters','srd51-demon-horrors','srd51-demon-commanders','srd51-devil-enforcers','srd51-devil-warriors','srd51-pit-fiend','srd51-fiend-intrigues']:
        manifest=json.loads((ROOT/('catalog/'+package+'.coverage.json')).read_text(encoding='utf-8-sig'))
        source_pages={n:monster_pages[n] for row in manifest['entries'] for n in row['pages']}
        selected_fiends+=check_selected_monster_manifest(source_pages,manifest,cards)
        melee_checked+=check_melee_weapon_inventory(source_pages,manifest,cards)
        additional_melee_checked+=sum(len(a.get('additionalDamage',[])) for row in manifest.get('weaponAttackChecks',[]) for a in row['attacks'])
    selected_dragons=0
    breath_checked=0
    for package in ['srd51-dragon-kin','srd51-chromatic-young']:
        manifest=json.loads((ROOT/('catalog/'+package+'.coverage.json')).read_text(encoding='utf-8-sig'))
        source_pages={n:monster_pages[n] for row in manifest['entries'] for n in row['pages']}
        selected_dragons+=check_selected_monster_manifest(source_pages,manifest,cards)
        breath_checked+=check_dragon_breath_inventory(source_pages,manifest,cards)
        melee_checked+=check_melee_weapon_inventory(source_pages,manifest,cards)
        additional_melee_checked+=sum(len(a.get('additionalDamage',[])) for row in manifest.get('weaponAttackChecks',[]) for a in row['attacks'])
    pages, failures = dict(monster_pages), []
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
    print(json.dumps({'checked': len(cards), 'npcHeadingsChecked': len(appendix), 'familiarFormsChecked': len(familiar_names), 'oozeHeadingsChecked': ooze_count, 'typedHeadingsChecked': type_counts, 'animatedHeadingsChecked': animated_count, 'undeadHeadingsChecked':undead_count, 'preparedCasterSpellsChecked':caster_counts,'innateCasterSpellsChecked':innate_counts, 'selectedFiendCardsChecked':selected_fiends, 'selectedDragonCardsChecked':selected_dragons, 'breathWeaponsChecked':breath_checked, 'meleeAttacksChecked':melee_checked, 'additionalMeleeDamageGroupsChecked':additional_melee_checked, 'failures': failures,
                      'scope': 'Base statistics, declared prepared/innate spell lists and selected primary melee attack fields; other effects need manual source review.'}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
