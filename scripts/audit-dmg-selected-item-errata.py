"""Verify selected factual item corrections in the pinned 2014 DMG errata."""
import argparse,hashlib,json,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
normalize=runpy.run_path(str(ROOT/'scripts/audit-skt-spellcasting-actions.py'))['normalize']
HEADINGS=['Amulet of Health','Bag of Tricks','Belt of Giant Strength','Gauntlets of Ogre Power','Headband of Intellect','Instrument of the Bards','Pearl of Power','Ring of the Ram','Rod of Lordly Might','Spell Scroll','Wand of Paralysis']

def capture(pattern,text):
    found=re.findall(pattern,text)
    if len(found)!=1:raise ValueError('Missing or ambiguous condition: '+pattern)
    return found[0]

def require(pattern,text):
    if not re.search(pattern,text):raise ValueError('Missing condition: '+pattern)

def parse_items(text):
    text=normalize(text)
    headings=list(re.finditer(r'('+ '|'.join(map(re.escape,HEADINGS))+r') \(pg?\. (\d+)\)\.',text))
    if [m[1] for m in headings]!=HEADINGS:raise ValueError('Unexpected selected item headings/order')
    rows=[]
    for i,heading in enumerate(headings):
        name=heading[1];body=text[heading.end():headings[i+1].start() if i+1<len(headings) else len(text)]
        if name in ('Amulet of Health','Gauntlets of Ogre Power','Headband of Intellect'):
            attribute,threshold=capture(r'(Constitution|Strength|Intelligence) is (\d+) or higher without (?:it|them)',body)
            require(r'no effect on you',body)
            fields={'attribute':attribute.lower(),'noEffectWhenWithoutItemAtLeast':int(threshold)}
        elif name=='Belt of Giant Strength':
            require(r'no effect on you if your Strength without the belt is equal to or greater than the belt’s score',body)
            fields={'attribute':'strength','noEffectWhenWithoutItemAtLeast':'belt score'}
        elif name=='Bag of Tricks':
            hp=capture(r'creature vanishes at the next dawn or when it is reduced to (\d+) hit points',body)
            fields={'creatureVanishesAt':'next dawn','alsoVanishesAtHitPoints':int(hp)}
        elif name=='Instrument of the Bards':
            require(r'play the instrument while casting a spell',body)
            require(r'charmed on a failed saving throw, thereby imposing disadvantage on the save',body)
            require(r'only if the spell has a somatic or a material component',body)
            fields={'playDuringCasting':True,'failedSaveCauses':'charmed','saveModifier':'disadvantage','requiredComponentAnyOf':['somatic','material']}
        elif name=='Pearl of Power':
            require(r'pearl is on your person',body);require(r'use an action to speak its command word and regain one expended spell slot',body)
            old,new=capture(r'expended slot was of (\d+)(?:st|nd|rd|th) level or higher, the new slot is (\d+)(?:st|nd|rd|th) level',body)
            fields={'onPerson':True,'activation':'action and command word','restoresExpendedSlots':1,'expendedLevelAtLeast':int(old),'recoveredLevelForThatCase':int(new)}
        elif name=='Ring of the Ram':
            require(r'to make a ranged spell attack against',body);fields={'attackType':'ranged spell attack'}
        elif name=='Rod of Lordly Might':
            button=capture(r'sentence on button (\d+)',body);require(r'you choose the type of sword',body)
            fields={'button':int(button),'choice':'sword type chosen by user'}
        elif name=='Spell Scroll':
            require(r'If the spell is on your class’s spell list',body);require(r'without providing any material components',body)
            require(r'requires the spell’s normal casting time',body);require(r'Once the spell is cast, the words on the scroll fade',body)
            require(r'If the casting is interrupted, the scroll is not lost',body)
            fields={'ordinaryPrerequisite':'spell on class list','componentWaiver':'material-only','castingTime':'normal spell casting time','consumedAfterCasting':True,'consumedOnInterruptedCasting':False}
        else:
            dc,duration=capture(r'DC (\d+) Constitution saving throw or be paralyzed for (\d+) minute',body)
            fields={'saveAbility':'constitution','saveDc':int(dc),'failureCondition':'paralyzed','durationMinutes':int(duration)}
        rows.append({'primaryHeading':name,'bookPage':int(heading[2]),'primaryFields':fields})
    return rows

def audit(manifest,rows):
    if manifest['ruleset']!='5e-2014' or manifest['accepted'] or manifest['complete'] or manifest['automaticPatch'] or manifest['approvedDenominator'] is not None:raise ValueError('Invalid evidence boundary')
    if len(manifest['records'])!=11 or len(rows)!=11:raise ValueError('Missing item')
    for expected,actual in zip(manifest['records'],rows):
        if expected['accepted'] or expected['fullRulesVerified'] or expected['wholeItemCompared'] or expected['automaticPatch'] or expected['canonicalId'] is not None:raise ValueError('Unsupported whole-item acceptance')
        if expected['comparisonStatus'] not in ('selected-fields-match','secondary-fetch-timeout-unverified') or expected['secondaryFieldsMatched']!=(expected['comparisonStatus']=='selected-fields-match'):raise ValueError('Unsupported secondary verification claim')
        if {k:expected[k] for k in actual}!=actual:raise ValueError('Primary item mismatch: '+actual['primaryHeading'])
    return len(rows)

if __name__=='__main__':
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/dmg-selected-item-errata-2014.json').read_text(encoding='utf-8-sig'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['primaryEvidence']['sha256']:raise ValueError('Primary PDF changed')
    for path,sha in d['inputSha256'].items():
        if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Input changed')
    print(str(audit(d,parse_items(PdfReader(a.pdf).pages[0].extract_text())))+'/11 selected primary item corrections match; two secondary pages remain unverified')
