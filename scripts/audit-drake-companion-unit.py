"""Verify identity witnesses for a proposed companion unit, not its full rules."""
import argparse, hashlib, json, re, runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
Tree,only,clean=shared['Tree'],shared['only'],shared['clean']

def audit(proposal,scope,markups,primary):
 if proposal['accepted'] is not False or proposal['complete'] is not False or proposal['canonicalId'] is not None or proposal['approvedDenominator'] is not None or proposal['automaticMerge'] is not False or proposal['runtimeChanged'] is not False:
  raise ValueError('Proposal cannot promote catalog acceptance')
 if proposal['proposedUnitKind']!='one-companion-with-level-states' or proposal['proposedEntityCount']!=1 or proposal['proposedStateCount']!=3 or proposal['sourceId']!='152':raise ValueError('Unit boundary changed')
 expected={'dndsu:bestiary:4842':(3,'Small','Маленький'),'dndsu:bestiary:14130':(7,'Medium','Средний'),'dndsu:bestiary:14131':(15,'Large','Большой')}
 members=proposal['members']
 if len(members)!=3 or set(m['observationId'] for m in members)!=set(expected):raise ValueError('Missing/duplicate companion state')
 pages={p['id']:p for p in scope['records']}
 for m in members:
  ident=m['observationId'];level,size,ru=expected[ident];page=pages.get(ident)
  if not page or page['sourceIds']!=['152'] or page['names']['en']!='Drake Companion' or page['url']!=m['url']:raise ValueError('Observation attribution changed')
  if m['rangerLevelThreshold']!=level or m['size']!=size or m['countsAsSeparateCreature'] is not False:raise ValueError('State mapping changed')
  tree=Tree();tree.feed(markups[ident])
  card=only(tree.root.find(lambda n:n.has('card') and n.attrs.get('data-id')==ident[6:]),'exact card')
  if card.attrs.get('data-cardlink')!=m['url'].replace('https://dnd.su',''):raise ValueError('Card path changed')
  heading=only(card.find(lambda n:n.tag=='h2' and n.has('card-title')),'title')
  if '[Drake Companion]' not in clean(heading):raise ValueError('Wrong companion name')
  plaque=only(heading.find(lambda n:n.has('source-plaque')),'source')
  if plaque.attrs.get('title')!=proposal['sourceTitle']:raise ValueError('Wrong source')
  params=only(card.find(lambda n:n.tag=='ul' and n.has('params') and n.has('card__article-body')),'parameters')
  size_rows=list(params.find(lambda n:n.tag=='li'))
  if not size_rows or not re.fullmatch(ru+r'\?? Дракон',clean(size_rows[0])):raise ValueError('Wrong size')
  levels=re.findall(r'Спутник архетипа следопыта.*?(\d+)-го уровня\.',clean(params))
  if levels!=[str(level)]:raise ValueError('Missing/ambiguous level witness')
 t=Tree();t.feed(primary)
 if proposal['primaryEvidence']['kind']!='official-publisher-summary-not-full-final-rulebook' or proposal['previewCaution']['usedForFinalParameters'] is not False:raise ValueError('Primary evidence overclaimed')
 for label,size in [('Drake Companion (3rd level):','Small'),('Bond of Fang and Scale (7th level):','Medium'),('Perfected Bond (15th level):','Large')]:
  row=only(t.root.find(lambda n:n.tag=='li' and clean(n).startswith(label)),'official feature summary')
  if not re.search(r'\b'+size+r'\b',clean(row)):raise ValueError('Official size differs')
 return {'observations':3,'proposedEntities':1,'proposedStates':3,'accepted':False}


def verify_captures(proposal,directory):
 expected={m['observationId'].split(':')[-1]+'.html':m['url'] for m in proposal['members']}
 expected['official-2022.html']=proposal['primaryEvidence']['url']
 rows=proposal['captures']
 if len(rows)!=4 or len(expected)!=4 or {r['capture'] for r in rows}!=set(expected):raise ValueError('Missing or duplicate capture evidence')
 for row in rows:
  if row['url']!=expected[row['capture']] or row['resolvedUrl']!=row['url']:raise ValueError('Capture attribution changed')
  if not re.fullmatch('[0-9a-f]{64}',row['sha256']):raise ValueError('Invalid capture SHA')
  if hashlib.sha256((directory/row['capture']).read_bytes()).hexdigest()!=row['sha256']:raise ValueError('Capture changed; review before replacing evidence')

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('captures',type=Path);a=p.parse_args()
 proposal=json.loads((ROOT/'catalog/drake-companion-unit-proposal-2014.json').read_text(encoding='utf-8-sig'))
 verify_captures(proposal,a.captures)
 scope=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8-sig'))
 markups={m['observationId']:(a.captures/(m['observationId'].split(':')[-1]+'.html')).read_text(encoding='utf-8') for m in proposal['members']}
 print(json.dumps(audit(proposal,scope,markups,(a.captures/'official-2022.html').read_text(encoding='utf-8'))))
