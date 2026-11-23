import copy,hashlib,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];m=runpy.run_path(str(ROOT/'scripts/audit-extra-life-publication-witnesses-2014.py'))
def data():
 c,r,l=[json.loads((ROOT/p).read_text(encoding='utf-8')) for p in m['FILES']];b={s['id']:s['id'].encode() for s in c['sources']};pages={s['id']:['']*s['pageCount'] for s in c['sources']}
 for s in c['sources']:s['sha256']=hashlib.sha256(b[s['id']]).hexdigest()
 for u in c['units']:pages[u['source']][u['pdfPage']-1]+=' '+u['start']+' '+' '.join(u['anchors'])+' '+u['stop']
 return [c,r,l,b,pages]
class BibliographicWitnessTests(unittest.TestCase):
 def test_scoped_metadata_never_accepts_rules_or_rights(self):
  r=m['audit'](*data());self.assertEqual(r['unitCount'],5);self.assertEqual(r['anchorCount'],9);self.assertFalse(r['fullCharacterRulesVerified']);self.assertFalse(r['accepted']);self.assertIsNone(r['approvedDenominator']);self.assertEqual(r['textReusePermission'],'not-established')
 def test_unscoped_or_duplicated_anchor_is_not_a_witness(self):
  a=data();u=a[0]['units'][0];a[-1][u['source']][u['pdfPage']-1]=' '.join(u['anchors'])+' '+u['start']+' '+u['stop']
  with self.assertRaises(ValueError):m['audit'](*a)
  a=data();a[-1]['grung2017'][1]+=' ONE GRUNG ABOVE'
  with self.assertRaises(ValueError):m['audit'](*a)
 def test_foreign_bytes_or_full_book_page_count_fail(self):
  a=data();a[-2]['grung2017']=b'changed'
  with self.assertRaisesRegex(ValueError,'hash'):m['audit'](*a)
  a=data();a[-1]['locathah2019'].append('unselected extra page')
  with self.assertRaisesRegex(ValueError,'page count'):m['audit'](*a)
 def test_year_is_copyright_or_historical_evidence_not_exact_printing(self):
  a=data();a[0]['observations'][0]['originalEraYear']=2024
  with self.assertRaisesRegex(ValueError,'era scope'):m['audit'](*a)
 def test_cc_does_not_expand_to_every_wotc_book(self):
  a=data();a[0]['rightsBoundary']['allWotcBooksCoveredBySrdLicense']=True
  with self.assertRaisesRegex(ValueError,'rights boundary'):m['audit'](*a)
  a=data();a[0]['rightsBoundary']['findingOfUnlawfulness']=True
  with self.assertRaisesRegex(ValueError,'rights boundary'):m['audit'](*a)
 def test_rule_acceptance_and_relation_substitution_fail(self):
  a=data();a[0]['observations'][0]['fullCharacterRulesVerified']=True
  with self.assertRaisesRegex(ValueError,'era scope'):m['audit'](*a)
  a=data();a[1]['relations'][0]['bibliographyEvidenceId']='foreign'
  with self.assertRaisesRegex(ValueError,'relation basis'):m['audit'](*a)
 def test_scope_cannot_be_changed_to_unrelated_rules(self):
  a=data();a[0]['units'][0]['source']='locathah2019'
  with self.assertRaisesRegex(ValueError,'unit scope'):m['audit'](*a)
 def test_committed_audit_remains_bibliographic_only(self):
  r=json.loads((ROOT/'catalog/extra-life-publication-witness-audit-2014.json').read_text(encoding='utf-8'));self.assertEqual(r['unitCount'],5);self.assertFalse(r['acceptedForRuntime']);self.assertFalse(r['interpretationAccepted']);self.assertFalse(r['complete'])
if __name__=='__main__':unittest.main()
