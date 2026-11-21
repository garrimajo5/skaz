import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('book',ROOT/'scripts/audit-wizard-spellbook-sidebar-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
END=M.END
START='Fixture spell level you can prepare; 2 hours 50 gp. Replacing the Book. Copy from your own spellbook into another book; you understand your own notation and already know how to cast the spell. 1 hour and 10 gp. Restore spells that you have prepared; find new spells. many wizards keep backup spellbooks in a safe place. The Book’s Appearance.'
def report():return json.loads((ROOT/'catalog/wizard-spellbook-sidebar-2014.json').read_text(encoding='utf-8'))

class SpellbookSidebarTest(unittest.TestCase):
    def test_basic_exact_sidebar_heading_ignores_inline_reference_and_requires_last_paragraph(self):
        text='Other text references Your Spellbook sidebar.\nYour Spellbook\nFixture '+END
        self.assertEqual(M.basic_sidebar(text),'Fixture '+END)
        for bad in [text.replace(END,'truncated'),text+'\nYour Spellbook']:
            with self.assertRaises(ValueError):M.basic_sidebar(bad)
    def test_srd_must_join_two_pages_and_remove_only_exact_header(self):
        p54='Other feature. Your Spellbook Fixture material components you';p55='System Reference Document 5.1 55 expend as you experiment; '+END
        value=M.srd_sidebar(p54,p55);self.assertIn('components you expend',value);self.assertNotIn('Document 5.1',value)
    def test_truncated_first_page_missing_or_foreign_continuation_is_rejected(self):
        start='Your Spellbook Fixture material components you';stop='System Reference Document 5.1 55 expend as you experiment; '+END
        for a,b in [(start,''),(start,stop.replace('5.1 55','5.2 55')),(start.replace('components you','components'),stop),(start,stop.replace(END,'truncated'))]:
            with self.assertRaises(ValueError):M.srd_sidebar(a,b)
    def test_duplicate_sidebar_start_is_ambiguous(self):
        with self.assertRaises(ValueError):M.srd_sidebar('Your Spellbook Your Spellbook material components you','System Reference Document 5.1 55 expend as you experiment '+END)
    def test_only_verified_srd_compound_hyphen_run_is_repaired(self):
        value,c=M.normalize('gilt-\u00ad\u2010edged and un- changed','srd');self.assertEqual(value,'gilt-edged and un- changed');self.assertEqual(c['verifiedSrdGiltHyphenRunRepairs'],1)
        self.assertEqual(M.normalize('yo ur text','srd')[0],'yo ur text')
        with self.assertRaises(ValueError):M.normalize('gilt-\u00ad\u2010edged gilt-\u00ad\u2010edged','srd')
    def test_new_spell_copy_and_own_backup_are_different_procedures(self):
        f=M.facts(START);self.assertEqual((f['newSpellCopyHoursPerSpellLevel'],f['newSpellCopyGpPerSpellLevel']),(2,50));self.assertEqual((f['ownBookCopyHoursPerSpellLevel'],f['ownBookCopyGpPerSpellLevel']),(1,10));self.assertTrue(f['ownNotationExplainsDifferentProcedure'])
    def test_missing_replacement_prepared_only_condition_or_cost_is_rejected(self):
        for a,b in [('Replacing the Book.','Other Feature.'),('spells that you have prepared','all known spells'),('1 hour and 10 gp','free'),('many wizards keep backup spellbooks in a safe place.','No backups.')]:
            with self.assertRaises(ValueError):M.facts(START.replace(a,b))
    def test_literal_basic_difference_is_preserved_and_srd_agrees_after_narrow_layout(self):
        d=report();self.assertFalse(d['allThreeLiteralTextsEqual']);self.assertEqual(d['digitalVersusCarrierDeltas']['basic'],[{'operation':'replace','leftWords':['that'],'rightWords':['a'],'leftWordCount':1,'rightWordCount':1}]);self.assertEqual(d['digitalVersusCarrierDeltas']['srd'],[])
        self.assertEqual({v['wordCount'] for v in d['witnesses'].values()},{415})
    def test_lost_book_never_restores_all_known_spells_or_charges_on_import(self):
        d=report();r=next(r for r in d['syntheticCases'] if r['event']=='lost-book');self.assertEqual(r['expectedReconstructibleByThisProcedure'],r['preparedSpellIds']);self.assertFalse(r['automaticRestoreAllKnown'])
        self.assertFalse(d['ordinaryFacts']['allKnownUnpreparedSpellsAutomaticallyRestored']);self.assertTrue(d['ordinaryFacts']['manualDeviationAllowedWithWarning']);self.assertFalse(d['ordinaryFacts']['genericInventoryDeleteEventImplementation'])
    def test_complete_sidebar_never_promotes_full_feature_runtime_or_parent_rewrite(self):
        d=report();self.assertFalse(d['acceptedForRuntime']);self.assertFalse(d['runtimeChanged']);self.assertFalse(d['existingManualParent']['rewritten']);self.assertFalse(d['existingManualParent']['newFeatureCreated']);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['sources']['srd']['inspectedPdfPages'],[54,55])
    def test_extractor_versions_and_all_input_code_pins_are_explicit(self):
        d=report();self.assertEqual(d['sources']['srd']['textExtractor'],'pypdfium2');self.assertTrue(d['sources']['srd']['extractorVersion'])
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for p in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/p['path']).read_bytes().replace(b'\r\n',b'\n')),p['sha256'])

if __name__=='__main__':unittest.main()
