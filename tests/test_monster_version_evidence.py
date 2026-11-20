import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('monster_evidence',Path(__file__).resolve().parent.parent/'scripts/extract-monster-version-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def page(link='/sources/vgtm/bestiary#Banderhobb',title="Volo's Guide to Monsters",label='Banderhobb'):
 return ('<h1>'+title+'</h1><a href="'+link+'">'+label+'</a><p>Do not retain rule bodies.</p>').encode()
class EvidenceTests(unittest.TestCase):
 def test_selected_metadata_only(self):
  result=m.extract(page(),'vgtm',['banderhobb']);self.assertEqual(result['records'][0]['heading'],'Banderhobb');self.assertNotIn('rule bodies',str(result));self.assertEqual(len(result['htmlSha256']),64)
 def test_missing_and_ambiguous_names_stay_explicit(self):
  result=m.extract(page()+b'<a href="/sources/vgtm/bestiary#Banderhobb">Banderhobb</a>','vgtm',['banderhobb','absent']);self.assertEqual(result['records'],[]);self.assertEqual([x['reason'] for x in result['missing']],['ambiguous-index-heading','missing-index-heading'])
 def test_wrong_title_or_link_cannot_prove_publication(self):
  with self.assertRaises(ValueError):m.extract(page(title='Wrong book'),'vgtm',['banderhobb'])
  for link in ['https://untrusted.invalid/sources/vgtm/bestiary#Banderhobb','/sources/dmg/bestiary#Banderhobb','/sources/vgtm/character-races#Banderhobb','/sources/vgtm/bestiary?q=1#Banderhobb','/sources/vgtm/../dmg/bestiary#Banderhobb']:
   with self.subTest(link=link),self.assertRaises(ValueError):m.extract(page(link=link),'vgtm',['banderhobb'])
 def test_nested_text_and_legacy_npc_path(self):
  result=m.extract(page(link='/compendium/rules/vgtm/appendix-b-nonplayer-characters#Banderhobb',label='<span>Banderhobb</span>'),'vgtm',['banderhobb']);self.assertEqual(len(result['records']),1)
 def test_no_transliteration_or_variant_inference(self):
  result=m.extract(page(label='Deep Rothé'),'vgtm',['deep rothe']);self.assertEqual(result['records'],[]);self.assertEqual(result['missing'][0]['name'],'deep rothe')
 def test_same_name_race_and_monster_are_separated_by_chapter(self):
  raw=b'<h1>Mordenkainen Presents: Monsters of the Multiverse</h1><a href="/sources/motm/fantastical-races-continued#Tortle">Tortle</a><a href="/sources/motm/bestiary-su#Tortle">Tortle</a>'
  result=m.extract(raw,'motm',['tortle']);self.assertEqual(len(result['records']),1);self.assertIn('/bestiary-su#',result['records'][0]['targetUrl'])
  with self.assertRaises(ValueError):m.extract(raw.replace(b'/sources/motm/bestiary-su#Tortle',b'https://untrusted.invalid/sources/motm/bestiary-su#Tortle'),'motm',['tortle'])
 def test_race_only_heading_and_duplicate_bestiary_cannot_pass(self):
  raw=b'<h1>Mordenkainen Presents: Monsters of the Multiverse</h1><a href="/sources/motm/fantastical-races-continued#Tortle">Tortle</a>'
  with self.assertRaises(ValueError):m.extract(raw,'motm',['tortle'])
  raw+=b'<a href="/sources/motm/bestiary-su#Tortle">Tortle</a>'*2
  self.assertEqual(m.extract(raw,'motm',['tortle'])['missing'][0]['reason'],'ambiguous-index-heading')
 def test_explicit_pair_selection_preserves_the_default(self):
  review={'identityGroups':[{'section':'bestiary','decision':'define-separate-source-version-units','members':[{'sourceIds':['111']},{'sourceIds':['158']}]},{'section':'bestiary','decision':'define-separate-source-version-units','members':[{'sourceIds':['113']},{'sourceIds':['158']}]}]}
  self.assertEqual(m.selected_groups(review),[review['identityGroups'][0]])
  self.assertEqual(m.selected_groups(review,'mtof-motm'),[review['identityGroups'][1]])
if __name__=='__main__':unittest.main()
