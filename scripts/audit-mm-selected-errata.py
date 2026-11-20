"""Audit selected MM2014 errata parameters against a pinned primary PDF."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LOCATORS={'Acolyte':(342,1),'Cult Fanatic':(345,1),'Noble':(348,2),'Priest':(348,2),'Veteran':(350,2),'Guard':(347,1),'Druid':(346,1),'Assassin':(343,1),'Night Hag':(178,2),'Gynosphinx':(282,1)}

def one(pattern,text):
    matches=list(re.finditer(pattern,text,re.I))
    if len(matches)!=1:raise ValueError('Missing or ambiguous parameter: '+pattern)
    return matches[0]
def number(pattern,text):return int(one(pattern,text)[1])
def sections(pages):
    result={}
    for page_no,text in enumerate(pages,1):
        text=re.sub(r'-\s*\n\s*','',text)
        text=' '.join(text.split())
        headings=list(re.finditer(r'(?:\[New\]\s*)?([A-Z][A-Za-z,\u2019\u2018\-\x27 ]+?) \(p\. (\d+)\)\.',text))
        for i,m in enumerate(headings):
            name=m[1].strip()
            if name not in LOCATORS:continue
            if name in result:raise ValueError('Repeated selected heading')
            if (int(m[2]),page_no)!=LOCATORS[name]:raise ValueError('Wrong primary location')
            result[name]=text[m.end():headings[i+1].start() if i+1<len(headings) else len(text)]
    if set(result)!=set(LOCATORS):raise ValueError('Missing selected headings')
    return result

def parse_fields(name,s):
    if name in ['Acolyte','Cult Fanatic','Noble']:return {'passivePerception':number(r'passive Perception (\d+)',s)}
    if name=='Priest':return {'speedFeet':number(r'Speed: (\d+) ft',s),'religionBonus':number(r'Religion \+(\d+)',s)}
    if name in ['Veteran','Guard','Druid']:
        m=one(r'(\d+) \((\d+d\d+\s*\+\s*\d+)\)',s)
        prefixes={'Veteran':'heavyCrossbow','Guard':'spearTwoHandedMelee','Druid':'quarterstaffWithShillelagh'}
        p=prefixes[name];fields={p+'AverageDamage':int(m[1]),p+'DamageDice':re.sub(r'\s+','',m[2])}
        if name=='Guard':
            one(r'used with two hands to make a melee attack',s);fields.update(requiresTwoHands=True,requiresMeleeAttack=True)
        if name=='Druid':one(r'damage with shillelagh',s);fields['requiresShillelagh']=True
        return fields
    if name=='Assassin':
        patterns={'dexteritySaveBonus':r'Dex \+(\d+)','intelligenceSaveBonus':r'Int \+(\d+)','acrobaticsBonus':r'Acrobatics \+(\d+)','deceptionBonus':r'Deception \+(\d+)','perceptionBonus':r'Perception \+(\d+)','stealthBonus':r'Stealth \+(\d+)','passivePerception':r'passive Perception (\d+)','sneakAttackAverageDamage':r'Avg\. damage is (\d+)'}
        d={k:number(p,s) for k,p in patterns.items()};bonus=number(r'Shortsword and light crossbow: \+(\d+) to hit',s)
        return dict(d,shortswordAttackBonus=bonus,lightCrossbowAttackBonus=bonus)
    if name=='Night Hag':return {'spellSaveDc':number(r'spell save DC (\d+)',s),'spellAttackBonus':number(r'\+(\d+) to hit with spell attacks',s),'clawsAttackBonus':number(r'Claws: \+(\d+) to hit',s)}
    if name=='Gynosphinx':
        patterns={'arcanaBonus':r'Arcana \+(\d+)','historyBonus':r'History \+(\d+)','perceptionBonus':r'Perception \+(\d+)','religionBonus':r'Religion \+(\d+)','passivePerception':r'passive Perception (\d+)','spellSaveDc':r'spell save DC (\d+)','spellAttackBonus':r'\+(\d+) to hit with spell attacks','clawAttackBonus':r'Claw: \+(\d+) to hit','teleportRangeFeet':r'Teleport: up to (\d+) feet'}
        return {k:number(p,s) for k,p in patterns.items()}
    raise ValueError('Unknown selected creature')

def audit(manifest,parsed,scope):
    if manifest['rulesEdition']!='5e-2014' or manifest['accepted'] or manifest['complete'] or manifest['automaticPatch'] or manifest['approvedDenominator'] is not None:raise ValueError('Invalid evidence boundary')
    observations={r['id']:r for r in scope['records']};seen=set();total=0
    for r in manifest['records']:
        name=r['primaryName'];o=observations.get(r['observationId'])
        if name in seen or name not in LOCATORS:raise ValueError('Repeated or unknown primary name')
        seen.add(name)
        if not o or o['section']!='bestiary' or o['names']['en']!=r['observedName'] or o['url']!=r['secondaryUrl'] or o['sourceIds']!=r['sourceIds'] or r['sourceIds']!=['103']:raise ValueError('Observation identity mismatch')
        if r['primaryLocator']!={'bookPage':LOCATORS[name][0],'pdfPage':LOCATORS[name][1]}:raise ValueError('Locator mismatch')
        actual=parse_fields(name,parsed[name])
        if actual!=r['primarySelectedFields']:raise ValueError('Primary fields differ: '+name)
        if r['comparison']!='selected-fields-match' or r['observedSelectedFields']!=actual:raise ValueError('Secondary comparison differs: '+name)
        if r['fullStatBlockCompared'] or r['automaticPatch'] or r['canonicalId'] is not None:raise ValueError('Unsupported promotion')
        total+=len(actual)
    if seen!=set(LOCATORS):raise ValueError('Incomplete record set')
    return len(seen),total

if __name__=='__main__':
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/mm-selected-errata-parameters-2014.json').read_text(encoding='utf-8-sig'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['primaryEvidence']['sha256']:raise ValueError('PDF changed')
    for path,sha in d['inputSha256'].items():
        if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Input changed')
    scope=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8-sig'))
    count,fields=audit(d,sections([p.extract_text() for p in PdfReader(a.pdf).pages]),scope)
    print(f'{count}/10 creatures, {fields} selected fields verified against primary errata; secondary values are recorded observations, not re-fetched by this script')
