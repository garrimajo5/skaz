"""Extract class spell membership from the pinned SRD; join only existing stable IDs."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
from pypdf import PdfReader
SHA256='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
CLASSES={'Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard'}
def normalize(value):return re.sub(r'[^a-z0-9]','',value.lower().replace('’',"'"))
def extract(pages,spells):
 lookup={normalize(e['name']['en']):e for e in spells}
 if len(lookup)!=len(spells):raise ValueError('Ambiguous catalog names')
 memberships={};current=None;level=None;seen=set()
 for page,text in pages:
  text=re.sub(r'\t\s*\xa0',' ',text)
  for line in text.splitlines():
   line=' '.join(line.split())
   if not line or line=='Spell Lists' or re.fullmatch(r'System Reference Document 5\.1 \d+',line):continue
   match=re.fullmatch(r'(\w+) Spells',line)
   if match:
    current=match[1].lower()
    if match[1] not in CLASSES or current in memberships:raise ValueError('Unexpected class header '+line)
    memberships[current]=[];level=None;continue
   if line=='Cantrips (0 Level)':level=0;continue
   match=re.fullmatch(r'([1-9])(?:st|nd|rd|th) Level',line)
   if match:level=int(match[1]);continue
   if current is None or level is None:raise ValueError('Spell without class/level '+line)
   card=lookup.get(normalize(line))
   if not card:raise ValueError('Unmatched spell heading '+line)
   if card['spell']['level']!=level:raise ValueError('Spell level differs '+line)
   key=(current,card['id'])
   if key in seen:raise ValueError('Duplicate membership '+line)
   seen.add(key);memberships[current].append({'spellId':card['id'],'level':level,'sourcePage':page})
 if set(memberships)!={c.lower() for c in CLASSES}:raise ValueError('Missing class list')
 if {x['spellId'] for entries in memberships.values() for x in entries}!={e['id'] for e in spells}:raise ValueError('Missing catalog spells')
 return memberships
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('pdf',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise SystemExit('Unexpected SRD source hash')
 root=Path(__file__).resolve().parent.parent
 raw=subprocess.check_output(['node','--input-type=module','-e',"import {bundledCatalog} from './server/bundled-catalog.mjs';console.log(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='spell')))"],cwd=root)
 spells=json.loads(raw);reader=PdfReader(args.pdf)
 memberships=extract([(i+1,reader.pages[i].extract_text()) for i in range(104,113)],spells)
 data={'schemaVersion':1,'ruleset':'5e-2014','sourceUrl':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sourceSha256':SHA256,'scope':'SRD 5.1 base class spell lists only; subclass, feat, race and optional expanded lists excluded. Attribution is in srd51-class-progression.json.','classes':memberships}
 args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print({k:len(v) for k,v in memberships.items()})
