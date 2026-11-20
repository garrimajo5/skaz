import copy
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('item_attributions',ROOT/'scripts/review-item-publication-attributions-2014.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def listing_html(name,rows):
    cards=''.join('<div class="info" data-type="magic-items"><div class="item-name"><a href="/magic-items/'+str(i)+'-example"'+(' aria-describedby="legacy-badge"' if legacy else '')+'>'+name+'</a></div></div>' for i,legacy in rows)
    return ('<h1>Magic Items</h1><input value="'+name+'"><ul class="rpgmagic-item-listing">'+cards+'</ul>').encode()

class ItemPublicationTests(unittest.TestCase):
    def data(self):
        review=json.loads((ROOT/'catalog/effective-m0-review-2014.json').read_text(encoding='utf-8'));policy=json.loads((ROOT/'catalog/numeric-source-scope-policy-2014.json').read_text(encoding='utf-8'));selection=json.loads((ROOT/'catalog/item-publication-source-selection-2014.json').read_text(encoding='utf-8'))
        raws={};manifest=[]
        for source in selection['sources']:
            names=sorted({g['comparisonKey'] for g in review['identityGroups'] if g['reviewId'] in selection['selectedReviewIds'] and any(m['sourceIds']==[source['sourceId']] for m in g['members'])})
            links=''.join('<a href="/sources/'+source['bookCode']+'/magic-items#'+mod.shared['fragment'](name)+'">'+name+'</a>' for name in names)
            raw=('<h1>'+source['expectedPublishedTitle']+'</h1><div class="compendium-toc-full">'+links+'</div>').encode()
            raws[source['sourceId']]=raw;manifest.append({'sourceId':source['sourceId'],'requestedUrl':source['sourceUrl'],'resolvedUrl':source['sourceUrl'],'file':source['sourceId']+'.html','htmlSha256':hashlib.sha256(raw).hexdigest()})
        names=['Pixie Dust','Staff of Defense','Spider Staff','Powered Armor'];listings=[];lraw={};attempts=[]
        for i,name in enumerate(names,1):
            raw=listing_html(name,[(i,False)]);lraw[name]=raw;u='https://www.dndbeyond.com/magic-items?filter-search='+quote(name)
            listings.append({'name':name,'url':u,'resolvedUrl':u,'htmlSha256':hashlib.sha256(raw).hexdigest()});attempts.append({'name':name,'url':f'https://www.dndbeyond.com/magic-items/{i}-example','error':'synthetic unavailable'})
        return [review,policy,selection,manifest,raws,listings,lraw,attempts]
    def test_fixture_all_headings_still_cannot_accept_versions(self):
        r=mod.build(*self.data());self.assertEqual(r['summary']['preservedObservations'],8);self.assertEqual(r['summary']['exactPublicationHeadingClaims'],8)
        self.assertFalse(r['accepted']);self.assertFalse(r['complete']);self.assertIsNone(r['approvedDenominator']);self.assertTrue(all(not g['automaticMerge'] for g in r['groups']))
    def test_legacy_and_other_card_are_both_retained_without_edition_inference(self):
        r=mod.extract_listing(listing_html('Staff of Defense',[(1,False),(2,True)]),'Staff of Defense','https://example.test')
        self.assertEqual([x['legacyBadge'] for x in r['records']],[False,True]);self.assertTrue(all(not x['editionInferredFromBadge'] and not x['publicationAssigned'] for x in r['records']))
    def test_query_value_and_script_mentions_do_not_make_a_card(self):
        raw=b'<h1>Magic Items</h1><input value="Pixie Dust"><script>"Pixie Dust"</script><ul class="rpgmagic-item-listing"></ul>'
        self.assertEqual(mod.extract_listing(raw,'Pixie Dust','https://example.test')['records'],[])
    def test_duplicate_listing_id_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Duplicate item'):
            mod.extract_listing(listing_html('Powered Armor',[(1,False),(1,True)]),'Powered Armor','https://example.test')
    def test_source_substitution_or_changed_observation_fails(self):
        a=self.data();a[3][0]['resolvedUrl']='https://example.test'
        with self.assertRaisesRegex(ValueError,'Substituted'):mod.build(*a)
        a=self.data();g=next(g for g in a[0]['identityGroups'] if g['reviewId'] in a[2]['selectedReviewIds']);g['members'][0]['sourceIds']=['999']
        with self.assertRaisesRegex(ValueError,'attribution changed'):mod.build(*a)
    def test_wrong_publication_heading_fails_without_search_fallback(self):
        a=self.data();ident=a[3][0]['sourceId'];a[4][ident]=b'<h1>Wrong Book</h1>';a[3][0]['htmlSha256']=hashlib.sha256(a[4][ident]).hexdigest()
        with self.assertRaisesRegex(ValueError,'publisher title'):mod.build(*a)
    def test_no_name_matched_card_can_be_assigned_to_source(self):
        r=mod.build(*self.data());self.assertTrue(all(x['usedAsPublicationWitness'] is False and x['rulesRead'] is False for x in r['cardAccess']))
    def test_access_attempt_must_correspond_to_exact_selected_id_and_name(self):
        a=self.data();a[-1][0]['name']='Different item'
        with self.assertRaisesRegex(ValueError,'Access attempt'):mod.build(*a)
    def test_missing_heading_reduces_metadata_only(self):
        a=self.data();ident=a[3][0]['sourceId'];title=a[2]['sources'][0]['expectedPublishedTitle'];a[4][ident]=('<h1>'+title+'</h1><div class="compendium-toc-full"></div>').encode();a[3][0]['htmlSha256']=hashlib.sha256(a[4][ident]).hexdigest()
        r=mod.build(*a);self.assertLess(r['summary']['exactPublicationHeadingClaims'],8);self.assertFalse(r['complete']);self.assertIsNone(r['approvedDenominator'])

if __name__=='__main__':unittest.main()
