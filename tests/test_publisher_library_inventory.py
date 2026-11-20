import importlib.util
from copy import deepcopy
import json
import hashlib
from pathlib import Path
import unittest

SPEC=importlib.util.spec_from_file_location('library_inventory',Path(__file__).resolve().parents[1]/'scripts/audit-publisher-library-inventory.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def book(ident=1, **changes):
    row={'id':ident,'name':'Example','relativePath':'/sources/dnd/example','publisher':'Wizards of the Coast','isThirdParty':False,'ruleset':{'name':'5e','label':'5e'},'type':'sourcebook','isLegacy':False,'isFree':False,'isReleased':True,'sku':'SRC-1','releaseDate':'2020-01-01T00:00:00Z','isOwned':True,'isFavorite':True,'accountNote':'do-not-export'}
    row.update(changes);return row

def html(rows, listed=None):
    linked=rows if listed is None else listed
    ld={'@context':'https://schema.org','@graph':[{'@type':'ItemList','@id':M.ITEM_LIST_ID,'numberOfItems':len(linked),'itemListElement':[{'@type':'ListItem','position':i+1,'item':{'name':r['name'],'url':'https://www.dndbeyond.com'+r['relativePath']}} for i,r in enumerate(linked)]}]}
    flight=[1,'1a:'+json.dumps({'catalogue':json.dumps({'sources':rows})})+'\n']
    return '<script type="application/ld+json">'+json.dumps(ld)+'</script><script>self.__next_f.push('+json.dumps(flight)+')</script>'

class PublisherLibraryTest(unittest.TestCase):
    def test_committed_manifest_pins_generator_without_misusing_json_input_pins(self):
        root=Path(__file__).resolve().parents[1]
        data=json.loads((root/'catalog/publisher-library-observations-2026-11-21.json').read_text(encoding='utf-8'))
        generator=data['generator']
        raw=(root/generator['path']).read_bytes().replace(b'\r\n',b'\n')
        self.assertEqual(hashlib.sha256(raw).hexdigest(),generator['sha256'])
        self.assertNotIn('inputSha256',data)

    def test_exact_public_metadata_and_privacy_allowlist(self):
        data=M.extract(html([book()]))
        self.assertEqual(data['summary']['publicCatalogueRows'],1)
        output=json.dumps(data)
        for private in ['isOwned','isFavorite','accountNote','do-not-export']:
            self.assertNotIn(private,output)
        self.assertEqual(data['records'][0]['providerSourceId'],1)

    def test_cobrand_is_not_discarded_by_publisher_string(self):
        row=M.extract(html([book(publisher='Critical Role')]))['records'][0]
        self.assertEqual(row['metadataBucket'],'non-third-party-co-brand-provider-5e')
        self.assertEqual(row['displayedPublisher'],'Critical Role')

    def test_third_party_and_other_ruleset_keep_separate_signals(self):
        row=M.extract(html([book(isThirdParty=True)]))['records'][0]
        self.assertEqual(row['metadataBucket'],'provider-third-party-flag')
        row=M.extract(html([book(ruleset={'name':'5.5e','label':'5.5e'})]))['records'][0]
        self.assertEqual(row['metadataBucket'],'provider-other-ruleset')

    def test_unknown_ruleset_is_not_accepted_as_2014_or_silently_discarded(self):
        row=M.extract(html([book(ruleset={'name':'future','label':'Future'})]))['records'][0]
        self.assertEqual(row['metadataBucket'],'provider-unresolved-ruleset')
        self.assertEqual(row['providerRuleset']['name'],'future')

    def test_non_scalar_optional_fields_fail(self):
        with self.assertRaisesRegex(ValueError,'optional'):M.public_book(book(sku={'private':'no'}))

    def test_no_name_based_version_merge(self):
        rows=[book(),book(2,relativePath='/sources/dnd/example-2024',ruleset={'name':'5.5e','label':'5.5e'})]
        self.assertEqual(M.extract(html(rows))['summary']['distinctProviderSourceIds'],2)

    def test_incomplete_list_or_changed_public_metadata_fails(self):
        with self.assertRaisesRegex(ValueError,'differ'):M.extract(html([book()],[]))
        row=book();del row['publisher']
        with self.assertRaisesRegex(ValueError,'Incomplete'):M.extract(html([row]))

    def test_conflicting_same_provider_id_is_not_last_wins(self):
        with self.assertRaisesRegex(ValueError,'Conflicting'):M.extract(html([book(),book(name='Other')]))

    def test_source_paths_cannot_be_foreign_or_traverse(self):
        for path in ['/sources/../private','https://evil.test/sources/x','//evil.test/sources/x','/sources/dnd/x?token=private']:
            with self.assertRaises(ValueError):M.public_book(book(relativePath=path))

    def test_repeated_identical_jsonld_is_not_a_second_catalogue(self):
        page=html([book()]);first=page[:page.index('<script>')]
        self.assertEqual(M.extract(page+first)['summary']['structuredListCopies'],2)
        with self.assertRaisesRegex(ValueError,'consistent'):
            M.extract(page+html([book(name='Different')])[:html([book(name='Different')]).index('<script>')])

    def test_no_executable_javascript_is_evaluated(self):
        with self.assertRaisesRegex(ValueError,'Non-JSON'):M.extract(html([book()])+'<script>self.__next_f.push(evil())</script>')

if __name__=='__main__':unittest.main()
