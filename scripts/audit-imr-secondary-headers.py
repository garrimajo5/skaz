"""Audit selected secondary headers inside the exact card ID, never adjacent versions."""
import argparse, hashlib, json, re, runpy
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
Tree,only,clean=shared['Tree'],shared['only'],shared['clean']
LABELS={'111':"Volo's guide to monsters",'113':"Mordenkainen's Tome of Foes",'158':'Mordenkainen Presents: Monsters of the Multiverse'}

def one_number(pattern,text):
 found=list(re.finditer(pattern,text))
 if len(found)!=1:raise ValueError('Missing/ambiguous field: '+pattern)
 return int(found[0][1])

def card_node(markup,observation):
 tree=Tree();tree.feed(markup)
 ident=observation['observationId'].removeprefix('dndsu:') if hasattr(str,'removeprefix') else observation['observationId'][6:]
 card=only(tree.root.find(lambda n:n.has('card') and n.attrs.get('data-id')==ident),'exact creature card ID')
 if card.attrs.get('data-cardlink')!=urlparse(observation['readUrl']).path:raise ValueError('Card path differs from requested version')
 heading=only(card.find(lambda n:n.tag=='h2' and n.has('card-title')),'card title')
 if '['+observation['observedName']+']' not in clean(heading):raise ValueError('Card name mismatch')
 source=only(heading.find(lambda n:n.has('source-plaque')),'source plaque')
 if source.attrs.get('title')!=LABELS[observation['sourceIds'][0]]:raise ValueError('Card source mismatch')
 return card

def selected_header(markup,observation):
 card=card_node(markup,observation)
 params=only(card.find(lambda n:n.tag=='ul' and n.has('params') and n.has('card__article-body')),'stat block parameters')
 def field(label):
  nodes=[]
  for li in params.find(lambda n:n.tag=='li'):
   strong=list(li.find(lambda n:n.tag=='strong'))
   if strong and clean(strong[0])==label:nodes.append(li)
  return clean(only(nodes,label))
 ac=field('Класс Доспеха'); hp=field('Хиты');cr=field('Опасность');senses=field('Чувства');speed=field('Скорость')
 cr_match=re.fullmatch(r'Опасность (\d+(?:/[1-9]\d*)?) \([^)]*\)',cr)
 if not cr_match:raise ValueError('Invalid challenge rating')
 result={'armorClass':one_number(r'^Класс Доспеха (\d+)',ac),'hitPoints':one_number(r'^Хиты (\d+)',hp),'challengeRating':cr_match[1],'passivePerception':one_number(r'пассивное Восприятие (\d+)',senses),'walkingSpeedFeet':one_number(r'^Скорость (\d+) футов',speed)}
 if observation['observedName'].startswith('Warlock of '):result['armorClassWithMageArmor']=one_number(r'\((\d+) с доспехами мага\)',ac)
 return result

def audit_observation(markup,observation):
 result=selected_header(markup,observation)
 if json.dumps(result,sort_keys=True)!=json.dumps(observation['selectedFields'],sort_keys=True):raise ValueError('Secondary header differs: '+observation['observationId']+' '+json.dumps(result))
 return len(result)

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_directory',type=Path);a=p.parse_args()
 manifest=json.loads((ROOT/'catalog/imr-version-boundaries-2014.json').read_text(encoding='utf-8-sig'))
 fields=0
 for o in manifest['observations']:
  path=a.capture_directory/(o['observationId'].split(':')[-1]+'.html')
  fields+=audit_observation(path.read_text(encoding='utf-8'),o)
 print(f'{len(manifest["observations"])} secondary cards / {fields} selected fields; primary full rules remain unverified')
