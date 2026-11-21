import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('intro',ROOT/'scripts/audit-general-introductions-schools-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def report():return json.loads((ROOT/'catalog/general-introductions-schools-2014.json').read_text(encoding='utf-8'))


def school_fixture():
    ps=['overview','rules']
    for label in M.SCHOOL_LABELS:
        strong='<strong>З</strong><strong>аклинания Преобразования</strong>' if label=='Заклинания Преобразования' else '<strong>'+label+'</strong>'
        ps.append(strong+' sample')
    primary='Overview '+ ' '.join(k.title()+' spells complete text.' for k in M.PRIMARY_SCHOOL_ORDER)
    return ps,primary


class GeneralIntroductionsSchoolsTest(unittest.TestCase):
    def test_parsed_end_with_whitespace_excludes_scripts_and_footer(self):
        inner='\n<p>Пример</p><div title="a > b"><p>nested</p></div>\n'
        html='header\n<div class="desc card__article-body">'+inner+'</div >\n<script>outside()</script><h2>footer</h2>'
        self.assertEqual(M.DescriptionBoundary(html).result(),inner)

    def test_missing_duplicate_or_unclosed_description_fails(self):
        for html in ['<p>none</p>','<div class="desc card__article-body"><p>open</p>', '<div class="desc card__article-body"></div><div class="desc card__article-body"></div>']:
            with self.assertRaises(ValueError):M.DescriptionBoundary(html).result()

    def test_nested_div_does_not_end_article_early(self):
        html='<div class="desc card__article-body"><div>inside</div><p>tail</p></div>'
        self.assertEqual(M.DescriptionBoundary(html).result(),'<div>inside</div><p>tail</p>')

    def test_mapping_is_by_school_not_position(self):
        ps,primary=school_fixture();d=M.secondary_school_map(ps,primary)
        self.assertEqual(set(d['secondaryOrder']),set(d['primaryOrder']));self.assertNotEqual(d['secondaryOrder'],d['primaryOrder']);self.assertEqual(len(d['rows']),8);self.assertFalse(d['sameOrderClaimed'])

    def test_fragment_join_is_only_for_known_label_not_source_body(self):
        ps,primary=school_fixture();d=M.secondary_school_map(ps,primary);self.assertEqual(len(d['labelProjectionRepairs']),1);self.assertFalse(d['labelProjectionRepairs'][0]['bodyTextRewritten'])
        r=next(r for r in d['rows'] if r['school']=='transmutation');self.assertEqual(r['secondaryParagraphTextSha256'],M.sha(M.module().helper().visible(ps[r['secondaryParagraphIndex']]).encode()))

    def test_duplicate_unknown_and_missing_school_cannot_pass(self):
        for mode in ['duplicate','unknown','missing']:
            ps,primary=school_fixture()
            if mode=='duplicate':ps[-1]=ps[-2]
            elif mode=='unknown':ps[-1]='<strong>Unknown</strong> sample'
            else:ps.pop()
            with self.subTest(mode=mode),self.assertRaises(ValueError):M.secondary_school_map(ps,primary)

    def test_primary_marker_order_and_complete_school_set_required(self):
        ps,primary=school_fixture()
        for changed in [primary.replace('Illusion spells','Changed label'),primary+' Abjuration spells duplicate', ' '.join(k.title()+' spells text.' for k in reversed(M.PRIMARY_SCHOOL_ORDER))]:
            with self.assertRaises(ValueError):M.secondary_school_map(ps,changed)

    def test_complete_four_scopes_eighteen_paragraphs_match_original_inventory(self):
        d=report();base=json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))['inventory']['blocks'];self.assertEqual([r['headingOrdinal'] for r in d['records']],[1,2,12,27]);self.assertEqual(sum(len(r['secondaryParagraphSha256']) for r in d['records']),18)
        for r in d['records']:self.assertEqual(r['secondaryBodySha256'],base[r['headingOrdinal']]['bodyTextSha256'])

    def test_school_continuation_and_boundary_hold_are_explicit(self):
        d=report();r=next(r for r in d['records'] if r['key']=='schools');self.assertEqual(r['primary']['pdfPages'],[103,104]);self.assertTrue(d['schoolCorrespondence']['primaryIllusionContinuationOn104Retained']);self.assertFalse(d['articleBoundary']['commentsScriptsAndFooterIncluded'])

    def test_narrative_and_categories_do_not_become_access_or_alignment_gates(self):
        f=report()['ordinarySelectedFacts'];self.assertFalse(f['spellLevelEqualsCharacterLevel'] or f['schoolMembershipAutomaticallyGrantsClassSpellAccess'] or f['necromancyLoreCreatesAlignmentCreationGate'] or f['newImporterHardRequirementImplemented']);self.assertTrue(f['typicalThresholdDoesNotOverrideItemsOrSpecificFeatures'] and f['manualDeviationAllowedWithWarning']);self.assertEqual(len(f['descriptionMetadataFields']),7)

    def test_changed_context_cannot_inherit_manual_assessment(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for path in M.INPUT_PINS:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/path).read_bytes())
            p=root/next(iter(M.INPUT_PINS));p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'reassessment'):M.audit(b'fake',b'fake',root,rendered_primary_pages_inspected=True)

    def test_rendered_inspection_and_exact_article_required(self):
        with self.assertRaisesRegex(ValueError,'Inspect'):M.audit(b'fake',b'fake')
        with self.assertRaisesRegex(ValueError,'article'):M.audit(b'fake',b'fake',rendered_primary_pages_inspected=True)

    def test_current_input_and_code_pins(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])

    def test_remaining_work_and_scope_are_not_promoted(self):
        d=report();self.assertEqual(len(d['remainingHeadingOrdinalsWithoutSelectedProseReview']),14);self.assertEqual(d['nextWorkItem']['phase'],'ready-and-repeated-bonus-reference');self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator'])


if __name__=='__main__':unittest.main()
