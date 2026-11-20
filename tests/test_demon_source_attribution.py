import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/audit-demon-source-attribution.py'));audit,primary_rows=mod['audit'],mod['primary_rows']
class DemonSourceTests(unittest.TestCase):
 def setUp(self):
  self.m=json.loads((ROOT/'catalog/demon-source-attribution-2014.json').read_text(encoding='utf-8-sig'))
  self.scope=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8-sig'));self.html={}
  for g in self.m['groups']:
   rows=[]
   for r in g['rows']:
    badge='<span class="badge-label" aria-label="legacy">Legacy</span>' if r['legacyBadge'] else ''
    rows.append(f'<div class="info" data-type="monsters"><span class="monster-name"><a href="{r["cardUrl"].replace("https://www.dndbeyond.com","")}">{g["name"]}</a>{badge}<span class="source">{r["displayedSource"]}</span></span></div>')
    plaques=''.join(f'<span class="source-plaque" title="{title}">SRC</span>' for title in r['observedSourcePlaques'])
    self.html[r['candidateObservationId'].split(':')[-1]]=f'<div class="card" data-id="{r["candidateObservationId"][6:]}" data-cardlink="{r["readUrl"].replace("https://dnd.su","")}"><h2 class="card-title">[{g["name"]}]{plaques}</h2></div>'
   self.html[g['indexCapture']]='<ul class="rpgmonster-listing">'+''.join(rows)+'</ul>'
 def run_audit(self):return audit(self.m,self.scope,self.html)
 def test_shared_secondary_source_does_not_merge_four_primary_versions(self):
  self.assertEqual(self.run_audit(),{'groups':2,'primaryVersionRows':4,'secondaryObservations':4,'canonicalAccepted':0})
 def test_partial_name_match_is_excluded(self):
  key='zuggtmoy-index';extra='<div class="info" data-type="monsters"><span class="monster-name"><a href="/monsters/123-bridesmaid">Bridesmaid of Zuggtmoy</a><span class="source">Out of the Abyss</span></span></div>'
  self.html[key]=self.html[key].replace('</ul>',extra+'</ul>');self.assertEqual(self.run_audit()['primaryVersionRows'],4)
 def test_missing_or_duplicate_primary_version_fails(self):
  original=self.html['juiblex-index']
  self.html['juiblex-index']=original.replace('>Juiblex</a>','>Other</a>',1)
  with self.assertRaises(ValueError):self.run_audit()
  self.html['juiblex-index']=original.replace('</ul>',original.split('<ul class="rpgmonster-listing">')[1])
  with self.assertRaises(ValueError):self.run_audit()
 def test_legacy_badge_and_publication_are_not_inferred_from_url_numbers(self):
  for old,new in [('aria-label="legacy"','aria-label="current"'),('Out of the Abyss','Different Book')]:
   original=self.html['juiblex-index'];self.html['juiblex-index']=original.replace(old,new)
   with self.assertRaises(ValueError):self.run_audit()
   self.html['juiblex-index']=original
 def test_source_overlap_and_original_urls_cannot_be_erased(self):
  for change in [lambda r:r.update(observedSourceIds=['158']),lambda r:r.update(originalUrl='https://wrong.example/'),lambda r:r.update(sourceIdOfPrimaryListing='158'),lambda r:r.update(fullPrimaryStatBlockRead=True),lambda r:r.update(canonicalId='merged')]:
   original=copy.deepcopy(self.m);change(self.m['groups'][0]['rows'][0])
   with self.assertRaises(ValueError):self.run_audit()
   self.m=original
 def test_wrong_secondary_card_path_or_source_fails(self):
  for old,new in [('bestiary:1752','bestiary:4910'),('/bestiary/1752-juiblex/','/bestiary/wrong/'),("Mordenkainen's Tome of Foes",'Other Source')]:
   original=self.html['1752'];self.html['1752']=original.replace(old,new)
   with self.assertRaises(ValueError):self.run_audit()
   self.html['1752']=original
 def test_input_evidence_is_not_mutated(self):
  before=copy.deepcopy((self.m,self.scope,self.html));self.run_audit();self.assertEqual((self.m,self.scope,self.html),before)
if __name__=='__main__':unittest.main()
