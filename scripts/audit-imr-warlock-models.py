"""Audit selected NPC casting models without assigning them to player classes."""
import argparse,hashlib,json,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
headers=runpy.run_path(str(ROOT/'scripts/audit-imr-secondary-headers.py'))
LOCATORS={'dndsu:bestiary:638':('Warlock of the Great Old One','111'),'dndsu:bestiary:639':('Warlock of the Fiend','111'),'dndsu:bestiary:7067':('Warlock of the Great Old One','158'),'dndsu:bestiary:7066':('Warlock of the Fiend','158')}
def require(pattern,text):
 found=list(re.finditer(pattern,text))
 if len(found)!=1:raise ValueError('Missing/ambiguous witness: '+pattern)
 return found[0]
def spell_names(text):return re.findall(r'\[([A-Za-z][A-Za-z ,\x27-]*)\]',text)
def parse_model(text,legacy,selected_slot_spells):
 parts=text.split('Использование заклинаний.')
 if len(parts)!=2:raise ValueError('Exactly one selected casting ability required')
 before,casting=parts
 casting=re.split(r'Шепчущая аура\.|Удача темнейшего|Реакции|Описание|Действия',casting,maxsplit=1)[0]
 require(r'Харизм[ауы]',casting)
 dc=int(require(r'Сл спасброска от заклинани[яй] (\d+)',casting)[1])
 if legacy:
  level=int(require(r'заклинателем (\d+)-го уровня',casting)[1]);attack=int(require(r'\+(\d+) к попаданию атаками заклинаниями',casting)[1])
  slots=require(r'1[–-]5 уровни \((\d+) ячейки (\d+)-го уровня\): (.+)',casting)
  require(r'восстанавливает свои ячейки заклинаний после короткого или продолжительного отдыха',casting)
  actual=spell_names(slots[3])
  if len(set(selected_slot_spells))!=len(selected_slot_spells) or not selected_slot_spells or any(s not in actual for s in selected_slot_spells):raise ValueError('Slot spell outside selected pool')
  innate=before.split('Врождённое колдовство.')
  if len(innate)!=2:raise ValueError('Missing separate innate ability')
  require(r'без материальных компонентов',innate[1]);daily_text=innate[1]
  pool={'count':int(slots[1]),'level':int(slots[2]),'recharge':['short-rest','long-rest']}
 else:
  require(r'Колдун накладывает одно из следующих заклинаний',casting)
  if re.search(r'ячейк|заклинателем \d+-го уровня|к попаданию атаками заклинаниями',casting) or selected_slot_spells:raise ValueError('Unexpected imported slot model')
  level=attack=pool=None;daily_text=casting
 daily=require(r'1/день каждое: (.+?)(?:\.|$)',daily_text)[1]
 daily_spells=spell_names(daily)
 if not daily_spells or len(set(daily_spells))!=len(daily_spells):raise ValueError('Invalid daily list')
 at_will=require(r'Неограниченно: (.+?)1/день каждое:',daily_text)[1]
 require(r'\[mage armor\] \(только на себя\)',at_will)
 return {'spellcastingAbility':'charisma','saveDc':dc,'casterLevel':level,'spellAttackBonus':attack,'slotPool':pool,'selectedSlotSpells':selected_slot_spells,'dailySpellAbility':'innate-spellcasting' if legacy else 'spellcasting-action','dailyUsesPerSpell':1,'dailySpells':daily_spells,'mageArmorAtWillSelfOnly':True,'innateMaterialsWaived':True if legacy else None}
def audit(data,observations,captures):
 if any(data[k] for k in ['accepted','complete','automaticPatch']):raise ValueError('Evidence promoted')
 by_id={o['observationId']:o for o in observations};seen=set()
 for row in data['records']:
  ident=row['observationId'];o=by_id.get(ident)
  if ident in seen or ident not in LOCATORS or o is None:raise ValueError('Unknown/duplicate identity')
  seen.add(ident);name,source=LOCATORS[ident]
  if row['observedName']!=name or row['sourceIds']!=[source] or any(row[k]!=o[k] for k in ['observedName','sourceIds','readUrl']):raise ValueError('Identity or source mismatch')
  if row['evidenceKind']!='secondary-observation' or row['primaryFullRulesRead'] or row['automaticPatch']:raise ValueError('Secondary model promoted')
  text=headers['clean'](headers['card_node'](captures[ident],o))
  actual=parse_model(text,source=='111',row['selectedModel']['selectedSlotSpells'])
  if json.dumps(actual,sort_keys=True)!=json.dumps(row['selectedModel'],sort_keys=True):raise ValueError('Casting model differs: '+ident)
 if seen!=set(LOCATORS):raise ValueError('Incomplete model set')
 return len(seen)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_directory',type=Path);a=p.parse_args()
 data=json.loads((ROOT/'catalog/imr-warlock-models-2014.json').read_text(encoding='utf-8-sig'))
 for path,sha in data['inputSha256'].items():
  if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Pinned observations changed')
 observations=json.loads((ROOT/'catalog/imr-version-boundaries-2014.json').read_text(encoding='utf-8-sig'))['observations']
 captures={ident:(a.capture_directory/(ident.split(':')[-1]+'.html')).read_text(encoding='utf-8') for ident in LOCATORS}
 print(audit(data,observations,captures),'selected secondary casting models; not primary/player-class rules')
