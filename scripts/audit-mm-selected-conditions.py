"""Check narrowly selected MM2014 corrections; never infer a complete ability."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LOCATORS={'Banshee':(23,1),'Doppelganger':(82,1),'Kenku':(194,2),'Intellect Devourer':(191,2),'Lich':(202,2),'Otyugh':(248,2),'Rakshasa':(257,2),'Revenant':(259,2),'Thri-kreen':(288,2),'Water Elemental':(125,2),'Werewolf':(211,2),'Ettercap':(131,1)}
def sections(pages):
    result={}
    for page,text in enumerate(pages,1):
        text=' '.join(re.sub(r'(?<=\w)[ \t]*-\s*\n\s*','',text).split()).replace('\u201c','"').replace('\u201d','"').replace('\u2019',"'")
        heads=list(re.finditer(r'(?:\[New\]\s*)?([A-Z][A-Za-z,\-\x27 ]+?) \(p\. ([0-9\u2013\-]+)\)\.',text))
        for i,h in enumerate(heads):
            name=h[1].strip()
            if name not in LOCATORS:continue
            if name in result or (int(h[2]),page)!=LOCATORS[name]:raise ValueError('Duplicate/wrong location')
            result[name]=text[h.end():heads[i+1].start() if i+1<len(heads) else len(text)].strip()
    if set(result)!=set(LOCATORS):raise ValueError('Missing selected conditions')
    return result

def require(pattern,s):
    found=list(re.finditer(pattern,s,re.I))
    if len(found)!=1:raise ValueError('Missing/ambiguous correction witness: '+pattern)
    return found[0]
def parse_condition(name,s):
    if name=='Banshee':
        m=require(r'is now "creatures up to (\d+) miles away that aren\x27t undead or constructs',s)
        return {'rangeMiles':int(m[1]),'excludedCreatureTypes':['undead','construct']}
    if name in ['Doppelganger','Kenku']:
        require(r'In the first round of a combat, the '+name+r' has advantage on attack rolls against any creature it surprised',s)
        return {'combatRound':1,'attackRollAdvantage':True,'targetSurprisedByActor':True}
    if name=='Intellect Devourer':
        require(r'that isn\x27t protected by protection from evil and good',s);require(r'is now "the host body dies',s)
        return {'protectedByProtectionFromEvilAndGoodPreventsTargeting':True,'forcedExitTrigger':'host-body-dies'}
    if name=='Lich':
        require(r'"living creature" is now "nonundead creature\.?"',s)
        return {'excludedCreatureTypes':['undead']}
    if name=='Otyugh':
        require(r'Tentacle slam: Constitution saving throw \[was Strength saving throw\]',s)
        return {'rollKind':'saving-throw','ability':'constitution'}
    if name=='Rakshasa':
        m=require(r'can\x27t be affected or detected by spells of (\d+)(?:st|nd|rd|th) level or lower unless it wishes to be',s)
        return {'maximumSpellLevel':int(m[1]),'prevents':['affected','detected'],'unlessWilling':True}
    if name=='Revenant':
        require(r'is changed to "animates another humanoid corpse\.?"',s)
        return {'newCorpseCreatureType':'humanoid'}
    if name=='Thri-kreen':
        require(r'The poisoned target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success',s)
        return {'repeatSaveEligibleTarget':'poisoned-target','repeatSaveTiming':'end-of-each-own-turn','successEndsEffectOnSelf':True}
    if name=='Water Elemental':
        m=require(r'Whelm: added the word "check" after "DC (\d+) Strength" in the final sentence',s)
        return {'rollKind':'ability-check','ability':'strength','dc':int(m[1])}
    if name=='Werewolf':
        require(r'Multiattack \(Humanoid or Hybrid Form Only\)',s)
        require(r'two with its spear \(humanoid form\) or one with its bite and one with its claws \(hybrid form\)',s)
        return {'forms':['humanoid','hybrid'],'humanoidAttacks':['spear','spear'],'hybridAttacks':['bite','claws']}
    if name=='Ettercap':
        require(r'Web: the webbing is vulnerable to fire damage and immune to bludgeoning damage',s)
        return {'appliesTo':'webbing','vulnerabilities':['fire'],'immunities':['bludgeoning']}
    raise ValueError('Unknown correction')

def same(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))
def audit(data,parsed,scope):
    if data['rulesEdition']!='5e-2014' or data['accepted'] or data['automaticPatch'] or data['approvedDenominator'] is not None:raise ValueError('Invalid acceptance')
    obs={r['id']:r for r in scope['records']};seen=set();summary={'primaryConditions':0,'secondaryMatches':0,'secondaryDifferences':0,'secondaryUnverified':0}
    for r in data['records']:
        name=r['primaryName'];o=obs.get(r['observationId'])
        if name in seen or name not in LOCATORS:raise ValueError('Repeated/unknown creature')
        seen.add(name)
        if not o or o['section']!='bestiary' or o['names']['en']!=r['observedName'] or o['url']!=r['secondaryUrl'] or o['sourceIds']!=r['sourceIds'] or r['sourceIds']!=['103']:raise ValueError('Identity mismatch')
        if r['primaryLocator']!={'bookPage':LOCATORS[name][0],'pdfPage':LOCATORS[name][1]}:raise ValueError('Location mismatch')
        actual=parse_condition(name,parsed[name])
        if not same(actual,r['primarySelectedConditions']):raise ValueError('Primary condition differs: '+name)
        if r['fullAbilityVerified'] or r['fullStatBlockCompared'] or r['automaticPatch'] or r['canonicalId'] is not None:raise ValueError('Evidence promoted')
        observed=r['observedSelectedConditions'];status=r['comparison']
        if observed is None:
            if status!='secondary-unverified':raise ValueError('Unread secondary falsely compared')
            summary['secondaryUnverified']+=1
        elif same(actual,observed):
            if status!='selected-conditions-match':raise ValueError('False difference')
            summary['secondaryMatches']+=1
        else:
            if status!='selected-condition-missing' or name!='Doppelganger' or not same(observed,dict(actual,combatRound=None)):raise ValueError('Unsupported difference')
            summary['secondaryDifferences']+=1
        summary['primaryConditions']+=1
    if seen!=set(LOCATORS):raise ValueError('Incomplete selected set')
    return summary
if __name__=='__main__':
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/mm-selected-errata-conditions-2014.json').read_text(encoding='utf-8'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['primaryEvidence']['sha256']:raise ValueError('PDF changed')
    for path,sha in d['inputSha256'].items():
        if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Input changed')
    s=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8'))
    print(json.dumps(audit(d,sections([p.extract_text() for p in PdfReader(a.pdf).pages]),s)))
