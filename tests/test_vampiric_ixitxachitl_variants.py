import hashlib,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];m=runpy.run_path(str(ROOT/'scripts/audit-vampiric-ixitxachitl-variants-2014.py'))
def card(ident,spell=False,attack='1d6+2'):
 url='https://dnd.su/bestiary/'+ident+'-vampiric-ixitxachitl/'
 p='<li>Класс Доспеха 16 (природный доспех)</li><li>Хиты 44 (8к8 + 8)</li><li>Сил14 (+2)Лов18 (+4)Тел13 (+1)Инт12 (+1)Мдр13 (+1)Хар7 (-2)</li><li>Опасность 2 (450 опыта)</li>'
 feature='<p><strong>Использование заклинаний.</strong> synthetic spellcasting body</p>' if spell else ''
 return ('<div class="card" data-id="bestiary:'+ident+'" data-cardlink="'+url.removeprefix('https://dnd.su')+'"><h2 class="card-title">Икситксачитль [Vampiric Ixitxachitl]<span class="source-plaque" title="Out of the Abyss">OTA</span></h2><div class="card__body new-article"><ul class="params card__article-body">'+p+'</ul><p><strong>Регенерация.</strong> synthetic regeneration body</p>'+feature+'<h3>Действия</h3><p>Укус '+attack+'</p><h3>Описание</h3><p>unselected narrative.</p></div></div>').encode()
def data():
 scope,root,policy=[json.loads((ROOT/p).read_text(encoding='utf-8')) for p in m['FILES']];pages={p['id']:p for p in scope['records']};raws={i:card(i.split(':')[-1],i.endswith('5832')) for i in m['IDS']};manifest=[{'observationId':i,'requestedUrl':pages[i]['url'],'resolvedUrl':pages[i]['url'],'status':200,'sha256':hashlib.sha256(raws[i]).hexdigest()} for i in m['IDS']]
 primary=b'<ul class="rpgmonster-listing"><div class="monster-name"><a href="/monsters/17381-vampiric-ixitxachitl">Vampiric Ixitxachitl</a><span class="source">Out of the Abyss</span></div></ul>';url='https://www.dndbeyond.com/monsters?filter-search=Vampiric%20Ixitxachitl';pm={'requestedUrl':url,'resolvedUrl':url,'status':200,'sha256':hashlib.sha256(primary).hexdigest()};detail={'requestedUrl':'https://www.dndbeyond.com/monsters/17381-vampiric-ixitxachitl','fullPrimaryRulesCompared':False,'error':'synthetic timeout'}
 return [scope,root,policy,manifest,raws,pm,primary,detail]
def rehash(a):
 for row in a[3]:row['sha256']=hashlib.sha256(a[4][row['observationId']]).hexdigest()
class VariantTests(unittest.TestCase):
 def test_equal_numeric_fields_do_not_hide_spellcasting_difference(self):
  r=m['audit'](*data());c=r['comparison'];self.assertTrue(c['selectedNumericFieldsEqual']);self.assertFalse(c['normalizedSecondaryRegionsEqual']);self.assertTrue(c['textOutsideSelectedSpellcastingEqual']);self.assertFalse(c['automaticMergeApproved']);self.assertIsNone(r['proposedCanonicalEntityCount']);self.assertIsNone(r['approvedDenominator']);self.assertNotIn('synthetic spellcasting body',json.dumps(r))
 def test_other_attack_change_is_not_reported_equal(self):
  a=data();a[4][m['IDS'][1]]=card('5832',True,'2d6+2');rehash(a);r=m['audit'](*a);self.assertFalse(r['comparison']['textOutsideSelectedSpellcastingEqual']);self.assertFalse(r['comparison']['duplicateDeletionApproved'])
 def test_block_markup_does_not_create_a_false_word_join_difference(self):
  a=data();a[4][m['IDS'][0]]=a[4][m['IDS'][0]].replace(b'</p><h3>',b'</p>   <h3>');rehash(a);self.assertTrue(m['audit'](*a)['comparison']['textOutsideSelectedSpellcastingEqual'])
 def test_description_or_script_mentions_do_not_prove_spellcasting(self):
  a=data();a[4][m['IDS'][1]]=card('5832',False).replace(b'unselected narrative.',('Использование заклинаний.').encode());rehash(a)
  with self.assertRaisesRegex(ValueError,'spellcasting distinction'):m['audit'](*a)
  a=data();a[4][m['IDS'][1]]=card('5832',False).replace(b'<h3>',('<script>Использование заклинаний.</script><h3>').encode(),1);rehash(a)
  with self.assertRaisesRegex(ValueError,'spellcasting distinction'):m['audit'](*a)
 def test_hash_redirect_and_wrong_card_fail(self):
  a=data();a[3][0]['resolvedUrl']='https://example.test'
  with self.assertRaisesRegex(ValueError,'capture attribution'):m['audit'](*a)
  a=data();a[4][m['IDS'][0]]+=b'changed'
  with self.assertRaisesRegex(ValueError,'capture attribution'):m['audit'](*a)
  a=data();a[4][m['IDS'][0]]=a[4][m['IDS'][0]].replace(b'bestiary:5830',b'bestiary:999');rehash(a)
  with self.assertRaisesRegex(ValueError,'exact secondary'):m['audit'](*a)
 def test_missing_mechanical_end_and_ambiguous_actions_fail(self):
  a=data();a[4][m['IDS'][0]]=a[4][m['IDS'][0]].replace('<h3>Описание</h3>'.encode(),b'');rehash(a)
  with self.assertRaisesRegex(ValueError,'region end'):m['audit'](*a)
  a=data();a[4][m['IDS'][0]]=a[4][m['IDS'][0]].replace('<h3>Действия</h3>'.encode(),'<h3>Действия</h3><h3>Действия</h3>'.encode());rehash(a)
  with self.assertRaisesRegex(ValueError,'actions boundary'):m['audit'](*a)
 def test_primary_index_not_a_statblock_or_assignment_to_both_observations(self):
  r=m['audit'](*data());self.assertTrue(all(not r['assignedToSecondaryObservation'] for r in r['primaryIndex']['records']));self.assertFalse(r['primaryIndex']['fullPrimaryStatBlockRead'])
  a=data();a[7].pop('error');a[7]['status']=200
  with self.assertRaisesRegex(ValueError,'access limitation'):m['audit'](*a)
 def test_wrong_publication_or_root_group_cannot_be_substituted(self):
  a=data();a[6]=a[6].replace(b'Out of the Abyss',b'Monsters of the Multiverse');a[5]['sha256']=hashlib.sha256(a[6]).hexdigest()
  with self.assertRaisesRegex(ValueError,'publisher index'):m['audit'](*a)
  a=data();g=next(g for g in a[1]['identityGroups'] if g['reviewId']=='name-review:33a60c9b712e1ff852ad');g['members'].pop()
  with self.assertRaisesRegex(ValueError,'D03 group'):m['audit'](*a)
 def test_committed_evidence_retains_two_observations_not_accepted_units(self):
  r=json.loads((ROOT/'catalog/vampiric-ixitxachitl-variant-evidence-2014.json').read_text(encoding='utf-8'));self.assertEqual(len(r['records']),2);self.assertEqual(r['canonicalUnitsAccepted'],0);self.assertFalse(r['accepted']);self.assertFalse(r['complete'])
if __name__=='__main__':unittest.main()
