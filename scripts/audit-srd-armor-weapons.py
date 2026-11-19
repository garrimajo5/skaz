"""Read-only comparison of 13 armor and 37 weapon proposals to pinned SRD tables.

The table parser verifies all parameters; prose conditions require separate review.
No automatic content acceptance or runtime mutation.
"""
import argparse
import hashlib
import json
import re
import runpy
from fractions import Fraction
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
shared = runpy.run_path(str(ROOT / 'scripts/audit-srd-transport.py'))
SHA256 = shared['SHA256']
ARMOR_NAMES = ['Padded','Leather','Studded leather','Hide','Chain shirt','Scale mail','Breastplate','Half plate','Ring mail','Chain mail','Splint','Plate','Shield']
WEAPON_NAMES = ['Club','Dagger','Greatclub','Handaxe','Javelin','Light hammer','Mace','Quarterstaff','Sickle','Spear','Crossbow, light','Dart','Shortbow','Sling','Battleaxe','Flail','Glaive','Greataxe','Greatsword','Halberd','Lance','Longsword','Maul','Morningstar','Pike','Rapier','Scimitar','Shortsword','Trident','War pick','Warhammer','Whip','Blowgun','Crossbow, hand','Crossbow, heavy','Longbow','Net']
ALIASES = {'Crossbow, light':'Light crossbow','Crossbow, hand':'Hand crossbow','Crossbow, heavy':'Heavy crossbow'}
ARMOR_CATEGORIES = ['light-armor']*3 + ['medium-armor']*5 + ['heavy-armor']*4 + ['shield']
WEAPON_CATEGORIES = ['simple-melee']*10 + ['simple-ranged']*4 + ['martial-melee']*18 + ['martial-ranged']*5


def normalize(text):
    text = shared['normalize'](text)
    text = re.sub(r'-[\u00ad\u2010\u2011]+', '-', text)
    return re.sub(r'\s*-\s*handed', '-handed', text)


def bounded(text, start, end):
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError('Missing or ambiguous table boundary')
    return text.split(start)[1].split(end)[0].strip()


def split_rows(table, names):
    pattern = r'(' + '|'.join(re.escape(n) for n in sorted(names,key=len,reverse=True)) + r') (?=\d[\d,]* (?:gp|sp|cp) )'
    matches = list(re.finditer(pattern,table))
    if [m[1] for m in matches] != names or matches[0].start() != 0:
        raise ValueError('Missing, duplicate or reordered row')
    return [(m[1],table[m.end():matches[i+1].start() if i+1<len(matches) else len(table)].strip()) for i,m in enumerate(matches)]


def parse_armor(text):
    text=normalize(text)
    table=bounded(text,'Armor Armor Cost Armor Class (AC) Strength Stealth Weight Light Armor','Getting Into and Out of Armor')
    for heading in ['Medium Armor','Heavy Armor']:
        if table.count(heading)!=1:raise ValueError('Missing armor category')
        first={'Medium Armor':'Hide','Heavy Armor':'Ring mail'}[heading]
        if not re.search(re.escape(heading)+r' '+re.escape(first)+r' ',table):raise ValueError('Armor category misplaced')
        table=table.replace(heading,'')
    # Shield heading, followed by Shield row: preserve exactly one row label.
    if table.count('Shield Shield ')!=1:raise ValueError('Missing shield heading')
    table=table.replace('Shield Shield ','Shield ')
    table=re.sub(r'\s+',' ',table).strip()
    result={}
    for i,(name,row) in enumerate(split_rows(table,ARMOR_NAMES)):
        m=re.fullmatch(r'([\d,]+) gp (\+?\d+)( \+ Dex modifier(?: \(max 2\))?)? (—|Str (?:13|15)) (—|Disadvantage) (\d+) lb\.',row)
        if not m:raise ValueError('Unsupported armor row: '+name+' '+row)
        dex='not-applicable' if name=='Shield' else ('capped' if m[3] and 'max' in m[3] else 'full' if m[3] else 'ignored')
        result[name]={'category':ARMOR_CATEGORIES[i],'sourcePage':63 if name=='Padded' else 64,'costGp':int(m[1].replace(',','')),'armorClass':{'kind':'bonus' if name=='Shield' else 'base','value':int(m[2]),'dexterityMode':dex,'dexterityCap':2 if dex=='capped' else None,'negativeDexterityApplies':dex in ['full','capped']},'weightLb':int(m[6]),'strengthForUnreducedSpeed':None if m[4]=='—' else int(m[4][4:]),'stealthDisadvantage':m[5]=='Disadvantage'}
    times=bounded(text,'Donning and Doffing Armor Category Don Doff','Weapons Your')
    pattern=r'(Light Armor|Medium Armor|Heavy Armor|Shield) (\d+) (minutes?|action) (\d+) (minutes?|action)'
    rows=list(re.finditer(pattern,times))
    if re.sub(pattern,'',times).strip() or [m[1] for m in rows]!=['Light Armor','Medium Armor','Heavy Armor','Shield']:raise ValueError('Unexpected don/doff table')
    don_doff=[{'category':c,'don':{'amount':int(m[2]),'unit':m[3].rstrip('s')},'doff':{'amount':int(m[4]),'unit':m[5].rstrip('s')},'sourcePage':64} for c,m in zip(['light-armor','medium-armor','heavy-armor','shield'],rows)]
    return result,don_doff


def parse_properties(value):
    if value=='—':return []
    result=[]
    for token in value.split(', '):
        token=token.lower()
        m=re.fullmatch(r'(ammunition|thrown) \(range (\d+)/(\d+)\)',token)
        if m:result.append({'key':m[1],'rangeFeet':{'normal':int(m[2]),'long':int(m[3])}});continue
        m=re.fullmatch(r'versatile \((\d+d\d+)\)',token)
        if m:result.append({'key':'versatile','twoHandedMeleeDamage':m[1]});continue
        if token not in ['finesse','light','heavy','reach','special','loading','two-handed']:raise ValueError('Unknown property: '+token)
        result.append({'key':token})
    return result


def parse_weapons(text):
    text=normalize(text)
    table=bounded(text,'Weapons Name Cost Damage Weight Properties Simple Melee Weapons','Adventuring Gear')
    for heading in ['Simple Ranged Weapons','Martial Melee Weapons','Martial Ranged Weapons']:
        if table.count(heading)!=1:raise ValueError('Missing weapon category')
        first={'Simple Ranged Weapons':'Crossbow, light','Martial Melee Weapons':'Battleaxe','Martial Ranged Weapons':'Blowgun'}[heading]
        if not re.search(re.escape(heading)+r' '+re.escape(first)+r' ',table):raise ValueError('Weapon category misplaced')
        table=table.replace(heading,'')
    table=re.sub(r'\s+',' ',table).strip()
    result={}
    for i,(name,row) in enumerate(split_rows(table,WEAPON_NAMES)):
        m=re.fullmatch(r'(\d+) (gp|sp|cp) ((?:\d+d\d+|\d+) (?:bludgeoning|piercing|slashing)|—) ((?:\d+(?:/\d+)? lb\.)|—) (.+)',row)
        if not m:raise ValueError('Unsupported weapon row: '+name+' '+row)
        damage=None
        if m[3]!='—':
            amount,kind=m[3].split(' ')
            damage={'kind':'dice' if 'd' in amount else 'fixed','value':amount if 'd' in amount else int(amount),'type':kind}
        weight=None if m[4]=='—' else float(Fraction(m[4][:-4]))
        result[name]={'category':WEAPON_CATEGORIES[i],'sourcePage':66,'costCp':int(m[1])*{'gp':100,'sp':10,'cp':1}[m[2]],'damage':damage,'weightLb':weight,'weightNotation':'dash-in-source' if weight is None else 'pounds','properties':parse_properties(m[5])}
    return result


def audit(manifest, rows, identities, identity_path):
    if manifest['source']['sha256']!=SHA256 or manifest['ruleset']!='5e-2014':raise ValueError('Invalid source')
    if manifest['accepted'] is not False or manifest['complete'] is not False or manifest['approvedDenominator'] is not None:raise ValueError('Invalid acceptance boundary')
    if manifest['inputSha256'][identity_path]!=hashlib.sha256((ROOT/identity_path).read_bytes()).hexdigest():raise ValueError('Identity input changed')
    records=manifest['records']
    if len(records)!=len(rows) or len({r['nameEn'] for r in records})!=len(rows) or set(r['nameEn'] for r in records)!=set(rows):raise ValueError('Invalid record set')
    by_name={r['nameEn']:r for r in identities['records']}
    for r in records:
        name=r['nameEn']; identity=by_name[ALIASES.get(name,name)]
        if r['candidateItemId']!=identity['proposedCanonicalId']:raise ValueError('Identity/name mismatch: '+name)
        if r['accepted'] is not False or r['runtimeImported'] is not False:raise ValueError('Unexpected runtime acceptance')
        for key,value in rows[name].items():
            actual=identity.get(key) if key in ['costGp','costCp'] else r.get(key)
            if actual!=value:raise ValueError('Parameter mismatch: '+name+' / '+key)
    return len(records)


def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('pdf',type=Path);args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise ValueError('Unexpected PDF hash')
    reader=PdfReader(args.pdf)
    armor,times=parse_armor(' '.join(reader.pages[i].extract_text() for i in [62,63]))
    weapons=parse_weapons(' '.join(reader.pages[i].extract_text() for i in [64,65]))
    load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
    for kind,rows in [('armor',armor),('weapon',weapons)]:
        path=f'catalog/{kind}-canonical-proposal-2014.json';m=load(f'catalog/srd51-{kind}-parameters-2014.json')
        count=audit(m,rows,load(path),path)
        if kind=='armor' and m['donDoff']!=times:raise ValueError('Don/doff mismatch')
        print(f'{kind}: {count}/{len(rows)} table rows match pinned SRD, including identities and existing prices')
    print('4 don/doff rows match; prose conditions require independent review')
if __name__=='__main__':main()
