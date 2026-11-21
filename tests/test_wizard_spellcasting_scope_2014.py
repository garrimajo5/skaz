import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('scope',ROOT/'scripts/audit-wizard-spellcasting-scope-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def html():
    body='<div class="p-article-content"><h2 id="Wizard">Wizard</h2><h2 id="ClassFeatures12">Class Features</h2><h3 id="WizardSpellcasting">Spellcasting</h3><p>Fixture intro.</p>'
    for id,name in M.HEADINGS:body+='<h4 id="'+id+'">'+name+'</h4><p>Fixture '+name+'.</p>'
    return body+'<blockquote><p class="Sidebar-Styles_Sidebar-Heading"><strong>YOUR SPELLBOOK</strong></p><p>Fixture complete sidebar paragraph.</p></blockquote><h3 id="ArcaneRecovery">Next unselected feature</h3><p>Outside.</p></div>'
def report():return json.loads((ROOT/'catalog/wizard-spellcasting-scope-2014.json').read_text(encoding='utf-8'))

class WizardSpellcastingScopeTest(unittest.TestCase):
    def test_entire_inventory_retains_intro_seven_subsections_and_separate_sidebar(self):
        p=M.SpellcastingParser();blocks=p.result(html());self.assertEqual([b['headingId'] for b in blocks],M.EXPECTED);self.assertEqual(len(blocks),9);self.assertEqual(p.paragraph_count,10)
        self.assertTrue(all('Outside' not in p for b in blocks for p in b['paragraphs']))
    def test_missing_sidebar_or_any_inline_component_is_rejected(self):
        for text in [html().replace('<blockquote>','<div>').replace('</blockquote>','</div>'),html().replace('id="Cantrips6"','id="OtherCantrips"')]:
            with self.assertRaises(ValueError):M.SpellcastingParser().result(text)
    def test_class_base_context_and_subsection_order_are_not_guessed(self):
        for a,b in [('id="Wizard"','id="Bard"'),('ClassFeatures12','ClassFeatures2'),('WizardSpellcasting','OtherSpellcasting')]:
            with self.assertRaises(ValueError):M.SpellcastingParser().result(html().replace(a,b))
        with self.assertRaises(ValueError):M.SpellcastingParser().result(html().replace('id="Cantrips6"','id="Spellbook"'))
    def test_visible_text_list_image_and_nested_paragraph_cannot_disappear(self):
        for content in ['Extra condition.','<ul><li>Extra condition.</li></ul>','<img alt="Extra condition">','<p>Unclosed condition.<p>']:
            with self.assertRaises(ValueError):M.SpellcastingParser().result(html().replace('<h4 id="Cantrips6">',content+'<h4 id="Cantrips6">'))
    def test_extra_paragraph_is_captured_instead_of_discarded(self):
        blocks=M.SpellcastingParser().result(html().replace('<h4 id="Cantrips6">','<p>Additional source paragraph.</p><h4 id="Cantrips6">'))
        self.assertEqual(blocks[0]['paragraphs'],['Fixture intro.','Additional source paragraph.'])
    def test_unclosed_sidebar_or_paragraph_at_stop_is_rejected(self):
        for text in [html().replace('</blockquote>',''),html().replace('</p></blockquote>','</blockquote>')]:
            with self.assertRaises(ValueError):M.SpellcastingParser().result(text)
    def test_duplicate_heading_context_or_source_container_is_ambiguous(self):
        for text in [html()+html(),html().replace('<h3 id="WizardSpellcasting">','<h2 id="ClassFeatures12">Class Features</h2><h3 id="WizardSpellcasting">')]:
            with self.assertRaises(ValueError):M.SpellcastingParser().result(text)
    def test_cantrips_heading_in_table_is_not_the_feature_paragraph(self):
        page='Cantrips\nKnown table header\nSpellcasting\nFixture intro\nCantrips\nAt 1st level, fixture cantrips.\nCantrips\nKnown column in wrapped body.\nSpellbook\nAt 1st level, fixture book.\nPreparing and Casting Spells'
        d=M.pdf_new_units(page,'basic');self.assertTrue(d['Cantrips6'].startswith('At 1st level'));self.assertIn('Known column',d['Cantrips6']);self.assertNotIn('Known table header',d['Cantrips6'])
    def test_pdf_page_end_must_finish_the_complete_book_or_focus_paragraph(self):
        page='Spellcasting\nIntro\nCantrips\nAt 1st level, fixture.\nSpellbook\nAt 1st level, truncated'
        with self.assertRaises(ValueError):M.pdf_new_units(page,'srd')
        with self.assertRaises(ValueError):M.pdf_focus('Spellcasting Focus\nIncomplete text','basic')
    def test_repairs_are_limited_to_verified_carrier_component(self):
        text='wizard cantrips of your choic e at higher levels';fixed,counts=M.normalize(text,'srd','Cantrips6');self.assertIn('choice',fixed);self.assertEqual(counts['visuallyCheckedSrdChoiceSplitRepairs'],1)
        self.assertIn('choic e',M.normalize(text,'digital','Cantrips6')[0]);self.assertEqual(M.normalize('repos - itory','basic','Spellbook')[0],'repository');self.assertEqual(M.normalize('repos - itory','srd','Spellbook')[0],'repos - itory')
    def test_all_three_comparisons_preserve_focus_literal_reference_difference(self):
        comparisons={r['headingId']:r for r in report()['selectedNewComparisons']};self.assertTrue(comparisons['Cantrips6']['allThreeLiteralTextsEqual']);self.assertTrue(comparisons['Spellbook']['allThreeLiteralTextsEqual'])
        f=comparisons['SpellcastingFocus7'];self.assertFalse(f['allThreeLiteralTextsEqual']);self.assertEqual(f['differenceClassification'],'document-cross-reference-wording-differs-only');self.assertTrue(f['digitalVersusSrdDeltas'])
    def test_initial_choices_are_not_granted_on_import_or_as_other_class_options(self):
        d={r['headingId']:r['ordinaryFacts'] for r in report()['selectedNewComparisons']};self.assertEqual(d['Cantrips6']['ordinaryWizardClassEntryCantripCount'],3);self.assertEqual(d['Spellbook']['ordinaryWizardClassEntryBookSpellCount'],6);self.assertFalse(d['Spellbook']['reappliedOnImportedLevelsOrEveryLevel']);self.assertFalse(d['Spellbook']['cantripsStoredInBook']);self.assertFalse(d['SpellcastingFocus7']['otherClassFocusRuleInferred'])
    def test_full_inventory_does_not_close_sidebar_reference_graph_or_prior_partial_scopes(self):
        d=report();self.assertEqual(d['summary']['digitalParagraphsIncludingSidebarTitle'],21);self.assertEqual(d['summary']['digitalComponentBlocks'],9);self.assertTrue(d['scopeBoundaries']['sidebarCapturedSeparately']);self.assertFalse(d['scopeBoundaries']['sidebarCompleteTextComparedAcrossCarriers']);self.assertFalse(d['scopeBoundaries']['oldPreparationUnitPromotedToWholeFeature']);self.assertFalse(d['scopeBoundaries']['existingRitualUnitRecountedAsNew']);self.assertTrue(d['openReferenceGraph']);self.assertFalse(d['acceptedForRuntime']);self.assertFalse(d['summary']['wholeFeatureAccepted'])
    def test_no_mutated_report_or_code_pin_passes_as_current(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for p in [d['generator'],d['upstreamParser']]:self.assertEqual(M.sha((ROOT/p['path']).read_bytes().replace(b'\r\n',b'\n')),p['sha256'])

if __name__=='__main__':unittest.main()
