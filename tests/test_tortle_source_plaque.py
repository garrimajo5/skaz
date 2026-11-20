import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];m=runpy.run_path(str(ROOT/'scripts/review-tortle-source-plaque-2014.py'))
def data():return [json.loads((ROOT/p).read_text(encoding='utf-8')) for p in ['catalog/effective-m0-review-2014.json','catalog/race-other-version-proposals-2014.json']]
def html(title='The Tortle Package'):return ('<meta property="og:url" content="https://dnd.su/race/184-tortle/"><div class="card__body new-article"><ul class="params card__article-body"><li><strong>Источник:</strong><span>'+title+'</span></li></ul><div class="desc">unrelated full rules must not be emitted</div></div>').encode()
class PlaqueTests(unittest.TestCase):
 def test_literal_secondary_title_never_assigns_source(self):
  r=m['review_plaque'](html(),*data());self.assertEqual(r['observedSourceIds'],[]);self.assertIsNone(r['proposedSourceId']);self.assertIsNone(r['canonicalId']);self.assertFalse(r['accepted']);self.assertFalse(r['secondaryEvidence']['primaryEvidence']);self.assertNotIn('unrelated full rules',json.dumps(r))
 def test_title_or_script_outside_parameters_is_not_evidence(self):
  with self.assertRaises(ValueError):m['review_plaque'](b'<title>The Tortle Package</title><script>The Tortle Package</script>',*data())
 def test_other_publication_cannot_silently_replace_literal(self):
  with self.assertRaisesRegex(ValueError,'Changed literal'):m['review_plaque'](html('Monsters of the Multiverse'),*data())
 def test_two_source_rows_are_ambiguous(self):
  raw=html().replace(b'</ul>',b'<li><strong>'+('Источник:').encode()+b'</strong><span>The Tortle Package</span></li></ul>')
  with self.assertRaises(ValueError):m['review_plaque'](raw,*data())
 def test_changed_original_source_array_fails(self):
  a=data();g=next(g for g in a[0]['identityGroups'] if g['reviewId']=='name-review:b8549edf1349f76678ca');next(u for u in g['members'] if u['id']=='dndsu:race:184')['sourceIds']=['158']
  with self.assertRaisesRegex(ValueError,'Changed prior'):m['review_plaque'](html(),*a)
 def test_committed_limits_remain_unaccepted(self):
  r=json.loads((ROOT/'catalog/tortle-source-plaque-2014.json').read_text(encoding='utf-8'));self.assertFalse(r['complete']);self.assertIsNone(r['approvedDenominator']);self.assertEqual(r['secondaryEvidence']['literalPublicationTitle'],'The Tortle Package')

class IdentityScopeTests(unittest.TestCase):
 def test_changed_page_url_rejected(self):
  with self.assertRaisesRegex(ValueError,'observation URL'):m['review_plaque'](html().replace(b'184-tortle',b'309-tortle'),*data())
 def test_nested_parameters_do_not_confuse_article_source(self):
  raw=html().replace(b'</div></div>',b'<ul class="params card__article-body"><li>nested rules metadata</li></ul></div></div>')
  self.assertEqual(m['review_plaque'](raw,*data())['secondaryEvidence']['literalPublicationTitle'],'The Tortle Package')

if __name__=='__main__':unittest.main()
