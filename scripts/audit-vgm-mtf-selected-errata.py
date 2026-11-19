"""Audit bounded VGM/MTF corrections, keeping source editions and table units distinct."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
LOCATORS={'vgtm':{'Kobold Scale Sorcerer':167,'Neogi Master':180,'Yuan-ti Mind Whisperer':204,'Champion':212,'Conjurer':212,'Evoker':214,'Grassland Creatures':223,'Hill Creatures':223},'mtf':{'Orcus':152,'Red Abishai':162,'Hellfire Engine':165,'Zariel':180}}
def sections(text,source):
 text=' '.join(re.sub(r'(?<=\w)[ \t]*-\s*\n\s*','',text).split()).replace('“','"').replace('”','"').replace('’',"'")
 # MTF PDF has letter-spaced drop caps in exactly these headings.
 for a,b in [('O rcus (','Orcus ('),('R ed Abishai (','Red Abishai ('),('Z ariel (','Zariel (')]:text=text.replace(a,b)
 heads=list(re.finditer(r'(?:\[New\]\s*)?([A-Z][A-Za-z\x27 -]+?) \(p\. (\d+)\)\.',text));result={}
 for i,h in enumerate(heads):
  name=h[1].strip()
  # Chapter/Appendix labels may immediately precede the selected heading after normalization.
  for prefix in ['Chapter 3 ','Chapter 6 ','Appendix B ','Appendix C ']:
   if name.startswith(prefix):name=name[len(prefix):]
  if name not in LOCATORS[source]:continue
  if name in result or int(h[2])!=LOCATORS[source][name]:raise ValueError('Duplicate/wrong correction location')
  result[name]=text[h.end():heads[i+1].start() if i+1<len(heads) else len(text)]
 if set(result)!=set(LOCATORS[source]):raise ValueError('Missing selected correction headings: '+str(set(LOCATORS[source])-set(result)))
 return result

def require(pattern,text):
 matches=list(re.finditer(pattern,text,re.I))
 if len(matches)!=1:raise ValueError('Missing/ambiguous correction: '+pattern)
 return matches[0]
def fields(name,s):
 if name=='Kobold Scale Sorcerer':
  require(r'regains all its spent sorcery points when it finishes a long rest',s);return {'sorceryPointsRecovery':'finish-long-rest'}
 if name=='Neogi Master':
  m=require(r'is now "(\d+d\d+ \+ \d+)\.',s);return {'hitDice':m[1].replace(' ','')}
 if name=='Yuan-ti Mind Whisperer':return {'wisdomScore':int(require(r'Wisdom score is now (\d+)',s)[1])}
 if name=='Champion':
  require(r'"Light Crossbow" is now "Shortbow\.',s);m=require(r'is now "(\d+) \((\d+d\d+ \+ \d+)\)',s);return {'correctedWeapon':'shortbow','averageDamage':int(m[1]),'damageDice':m[2].replace(' ','')}
 if name=='Conjurer':
  require(r'cantrips now have no asterisks',s);return {'cantripAsterisksRemoved':True}
 if name=='Evoker':
  require(r'is now "forces other creatures it can see to make a saving throw',s);return {'sculptSpellsRequiresSavingThrow':True}
 if name in ['Grassland Creatures','Hill Creatures']:
  require(r'In the Flind entry',s);m=require(r'is now "(\d+) \(([\d,]+) XP\)',s);return {'creatureName':'Flind','challengeRating':m[1],'experiencePoints':int(m[2].replace(',',''))}
 if name=='Orcus':
  require(r'Orcus\x27s first lair action',s);m=require(r'"\(save DC (\d+)\)" has been removed',s);return {'lairActionOrdinal':1,'removedSaveDcAnnotation':int(m[1])}
 if name=='Red Abishai':
  require(r'bite attack',s);m=require(r'has changed to "\((\d+d\d+ \+ \d+)\)',s);return {'biteDamageDice':m[1].replace(' ','')}
 if name=='Hellfire Engine':
  require(r'flesh-crushing stride',s);require(r'On a successful save, the creature is pushed to the nearest space out of the hellfire engine\x27s path',s);return {'ability':'flesh-crushing-stride','successEffect':'push-to-nearest-space-outside-path'}
 if name=='Zariel':
  require(r'javelin attack',s);m=require(r'now "reach (\d+) ft\. or range (\d+)/(\d+) ft\.',s);return {'javelinReachFeet':int(m[1]),'javelinRangeFeet':[int(m[2]),int(m[3])]}
 raise ValueError('Unknown correction')
def audit(data,parsed,scope):
 if data['rulesEdition']!='5e-2014' or any(data[k] for k in ['accepted','complete','automaticPatch']) or data['approvedDenominator'] is not None:raise ValueError('Evidence promoted')
 originals={r['id']:r for r in scope['records']};seen=set();ids=set()
 for r in data['records']:
  src,name=r['sourceKey'],r['correctionHeading'];key=(src,name)
  if key in seen or src not in LOCATORS or name not in LOCATORS[src]:raise ValueError('Repeated/unknown correction')
  seen.add(key)
  if r['bookPage']!=LOCATORS[src][name] or r['pdfPage']!=(2 if src=='vgtm' else 1):raise ValueError('Wrong primary location')
  actual=fields(name,parsed[src][name])
  if json.dumps(actual,sort_keys=True)!=json.dumps(r['primarySelectedCorrection'],sort_keys=True):raise ValueError('Primary correction differs')
  env=name in ['Grassland Creatures','Hill Creatures'];expected='Flind' if env else name
  if r['unitKind']!=('environment-table-entry' if env else 'named-stat-block-correction'):raise ValueError('Wrong unit kind')
  c=r['observationCandidate'];o=originals.get(c['observationId']);sid='111' if src=='vgtm' else '113'
  if not o or o['section']!='bestiary' or o['names']['en'].lower()!=expected.lower() or sid not in o['sourceIds'] or c['sourceIds']!=o['sourceIds'] or c['observedName']!=o['names']['en'] or c['url']!=o['url'] or c['relation']!='name-and-source-candidate-not-full-identity':raise ValueError('Candidate identity changed')
  ids.add(c['observationId'])
  if r['secondaryCompared'] or r['fullStatBlockCompared'] or r['canonicalId'] is not None or r['automaticPatch']:raise ValueError('Unsupported verification')
 if seen!={(src,name) for src,names in LOCATORS.items() for name in names}:raise ValueError('Missing correction unit')
 return {'correctionUnits':len(seen),'distinctCreatureCandidates':len(ids),'environmentUnits':2}
if __name__=='__main__':
 from pypdf import PdfReader
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('vgtm',type=Path);p.add_argument('mtf',type=Path);a=p.parse_args();data=json.loads((ROOT/'catalog/vgm-mtf-selected-errata-2014.json').read_text(encoding='utf-8-sig'));parsed={}
 for src,path,num in [('vgtm',a.vgtm,2),('mtf',a.mtf,1)]:
  if hashlib.sha256(path.read_bytes()).hexdigest()!=data['sources'][src]['sha256']:raise ValueError('Primary PDF changed')
  parsed[src]=sections(PdfReader(path).pages[num-1].extract_text(),src)
 for path,sha in data['inputSha256'].items():
  if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Pinned scope changed')
 print(json.dumps(audit(data,parsed,json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8-sig')))))
