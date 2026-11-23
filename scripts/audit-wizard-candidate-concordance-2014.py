"""Bounded manual concordance of retained secondary Wizard clauses; no catalog/runtime acceptance."""
import argparse
import copy
import hashlib
from html import unescape
from html.parser import HTMLParser
import importlib.metadata
import json
from pathlib import Path
import re

CANDIDATE = 'scope:wizard:class-features:feature.spellcasting'
INPUTS = {
    'boundaries': 'catalog/wizard-source-boundary-proposals-2014.json',
    'candidates': 'catalog/dndsu-reviewed-class-proposals.json',
    'inventory': 'catalog/wizard-spellcasting-scope-2014.json',
    'sidebar': 'catalog/wizard-spellbook-sidebar-2014.json',
    'ritual': 'catalog/wizard-ritual-source-comparison-2014.json',
    'selected': 'catalog/rest-spellcasting-source-comparison-2014.json',
}
COUNTS = [1, 1, 8, 3, 3, 1, 1, 1]
SCROLL_SHA = '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'

# Exact manually assessed data, independent of JSON layout or mutable manifest validation.
MANUALLY_ASSESSED_INPUT_FINGERPRINTS = {'boundaries': '53607fc2113e1831e69f361ef98bf597c112d91a8f91b0c39f58311a64994dfc', 'candidates': '08a12bd0cf2311b161bdbd4517efc6e68ca665044293f830b9539a29a431fce6', 'inventory': '12e6a583a2501e60ed48013152e505c5b2af80b565b7130f4784c35c7fb14fd7', 'sidebar': '64573eef1fda82ff757e16af338a603ebd3774f1598beba99eddd827883cd6fa', 'ritual': '719ce1f838917eec9d407565e2319b890b99b95a3834a1aeae5937fb5d737fb4', 'selected': '7fe8abb6f2930385fc68a3734c2278a9a2bdb7eb387826bab4e31f1e52557b10'}
MANUALLY_ASSESSED_SECONDARY_FINGERPRINT = '8134849ba4e7404c532dfc077097ea48c808cc88063de35c5f898ec67b6e2787'

def fingerprint(data):
    return sha(json.dumps(data,ensure_ascii=False,separators=(",",":"),sort_keys=True).encode())


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def compact(text):
    return ' '.join(text.split())


def visible(raw):
    return compact(unescape(re.sub('<[^>]*>', ' ', raw)))


class Paragraphs(HTMLParser):
    """Fail closed on visible content outside paragraphs or unknown semantic elements."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.active = False
        self.parts = []
        self.paragraphs = []

    def handle_starttag(self, tag, attrs):
        if tag not in {'p', 'div', 'br', 'a', 'strong', 'em', 'b', 'i', 'span'}:
            raise ValueError('Unknown semantic element: ' + tag)
        if tag == 'p':
            if self.active:
                raise ValueError('Nested paragraph')
            self.active = True
            self.parts = []
        elif self.active:
            self.parts.append(' ')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in {'br'}:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == 'p':
            if not self.active:
                raise ValueError('Unmatched paragraph close')
            text = compact(''.join(self.parts))
            if not text:
                raise ValueError('Empty paragraph')
            self.paragraphs.append(text)
            self.active = False
        elif tag not in {'div', 'br', 'a', 'strong', 'em', 'b', 'i', 'span'}:
            raise ValueError('Unknown semantic close: ' + tag)
        elif self.active:
            self.parts.append(' ')

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)
        elif data.strip():
            raise ValueError('Visible content outside paragraph')

    def result(self, raw):
        self.feed(raw)
        self.close()
        if self.active:
            raise ValueError('Unclosed paragraph')
        if compact(' '.join(self.paragraphs)) != visible(raw):
            raise ValueError('Lost visible body content')
        return self.paragraphs


def load_inputs(root):
    texts = {key: (root / path).read_bytes().replace(b'\r\n', b'\n') for key, path in INPUTS.items()}
    return {key: json.loads(raw) for key, raw in texts.items()}, {INPUTS[key]: sha(raw) for key, raw in texts.items()}


def extract_secondary(raw, manifest):
    if sha(raw) != manifest['freshCapture']['sha256']:
        raise ValueError('Retained secondary snapshot SHA changed')
    text = raw.decode('utf-8')
    start = list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>', text))
    if len(start) != 1:
        raise ValueError('Ambiguous article body')
    footer = text.find('<div class="card__footer', start[0].end())
    if footer < 0:
        raise ValueError('Missing article end')
    article = text[start[0].end():footer]
    headings = list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>', article, re.S))
    ordinal = 0
    rows = []
    for i, heading in enumerate(headings):
        title = visible(heading[2])
        if not title:
            continue
        ordinal += 1
        if ordinal not in range(20, 28):
            continue
        expected = next(r for r in manifest['classifications'] if r['heading']['ordinal'] == ordinal)
        body = article[heading.end():headings[i+1].start() if i+1 < len(headings) else len(article)]
        if title != expected['heading']['title'] or int(heading[1]) != expected['heading']['level']:
            raise ValueError('Heading structure changed')
        if sha(visible(body).encode()) != expected['heading']['bodySha256']:
            raise ValueError('Body witness changed')
        if expected['parentFeatureObservationId'] != CANDIDATE:
            raise ValueError('Wrong parent class feature')
        paragraphs = Paragraphs().result(body)
        if len(paragraphs) != COUNTS[ordinal-20]:
            raise ValueError('Paragraph boundary changed')
        rows.append({'ordinal': ordinal, 'title': title, 'level': int(heading[1]),
                     'bodySha256': sha(visible(body).encode()), 'parentCandidateId': CANDIDATE,
                     'paragraphSha256': [sha(p.encode()) for p in paragraphs]})
    if [r['ordinal'] for r in rows] != list(range(20, 28)):
        raise ValueError('Selected sections missing or duplicated')
    return {'url': manifest['freshCapture']['url'], 'sha256': sha(raw), 'bytes': len(raw),
            'receiptBasis': 'retained public HTML and existing freshCapture manifest; HTTP status/time/redirect receipt unavailable',
            'historicalCandidateSnapshotSha256': manifest['snapshotPageSha256'],
            'sameAsHistoricalCandidateSnapshot': sha(raw) == manifest['snapshotPageSha256'], 'sections': rows}


def extract_scroll(raw, *, rendered_page_inspected=False):
    if not rendered_page_inspected:
        raise ValueError("Rendered primary scroll page must be inspected")
    if sha(raw) != SCROLL_SHA:
        raise ValueError('Wrong SRD PDF')
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(raw)
    page = pdf[241]
    textpage = page.get_textpage()
    text = compact(textpage.get_text_range())
    start = 'A wizard spell on a spell scroll'
    stop = 'Spellguard Shield'
    if text.count(start) != 1 or text.count(stop) != 1:
        raise ValueError('Ambiguous scroll copy boundaries')
    unit = text[text.index(start):text.index(stop)].strip()
    for anchor in ['Intelligence (Arcana)', '10 + the spell’s level', 'Whether the check succeeds or fails', 'the spell scroll is destroyed.']:
        if anchor not in unit:
            raise ValueError('Scroll copy clause missing')
    result = {'sourceKey': 'srd51', 'pdfSha256': sha(raw), 'pdfPage': 242, 'start': start, 'stop': stop,
              'selectedTextSha256': sha(unit.encode()), 'wordCount': len(unit.split()),
              'textExtractor': 'pypdfium2', 'extractorVersion': importlib.metadata.version('pypdfium2'),
              'renderedPageInspected': rendered_page_inspected, 'scope': 'whole final Spell Scroll copying paragraph only; casting checks/table excluded'}
    textpage.close(); page.close(); pdf.close()
    return result


def clause(key, ordinal, paragraphs, primary, assessment, note):
    return {'key': key, 'secondaryHeadingOrdinal': ordinal, 'secondaryParagraphIndexes': paragraphs,
            'primaryReference': primary, 'assessment': assessment, 'finding': note,
            'assessmentMethod': 'manual semantic comparison bound to exact body/paragraph witnesses; not automatic keyword equivalence',
            'wholeTranslationAccepted': False, 'runtimeAccepted': False}


def assemble(secondary, scroll, data, pins):
    if {key:fingerprint(value) for key,value in data.items()} != MANUALLY_ASSESSED_INPUT_FINGERPRINTS or fingerprint(secondary) != MANUALLY_ASSESSED_SECONDARY_FINGERPRINT:
        raise ValueError('Changed manual assessment witnesses require explicit reassessment')
    manifest = data['boundaries']
    if secondary['sha256'] != manifest['freshCapture']['sha256'] or secondary['historicalCandidateSnapshotSha256'] != manifest['snapshotPageSha256']:
        raise ValueError('Snapshot identities collapsed or changed')
    if secondary['sameAsHistoricalCandidateSnapshot'] or secondary['sha256'] == secondary['historicalCandidateSnapshotSha256']:
        raise ValueError('Fresh and original identity must remain distinct')
    if scroll['pdfSha256'] != SCROLL_SHA or scroll['pdfPage'] != 242 or scroll['wordCount'] != 66 or scroll['selectedTextSha256'] != '739dca795da32a0a05c12076d2c90ceef1406dc7b3888e5eb3cf27eb6c7c9c56':
        raise ValueError('Changed selected primary scroll scope')
    rows = secondary['sections']
    if [r['ordinal'] for r in rows] != list(range(20, 28)):
        raise ValueError('Changed selected section order')
    for row, count in zip(rows, COUNTS):
        old = next(r for r in manifest['classifications'] if r['heading']['ordinal'] == row['ordinal'])
        if row['bodySha256'] != old['heading']['bodySha256'] or row['parentCandidateId'] != CANDIDATE or row['title'] != old['heading']['title'] or row['level'] != old['heading']['level'] or len(row['paragraphSha256']) != count:
            raise ValueError('Changed secondary witness/parent/boundary')
        if any(not re.fullmatch('[0-9a-f]{64}', p) for p in row['paragraphSha256']):
            raise ValueError('Invalid paragraph digest')
    candidate = next(r for c in data['candidates']['classes'] for r in c['records'] if r['id'] == CANDIDATE)
    if candidate['sourceIds'] != ['102'] or candidate['fullRules'] != 'unverified':
        raise ValueError('Original source claims or acceptance changed')
    units = {u['key']: u for u in data['selected']['units']}
    for key in ['wizard-preparation-selected', 'wizard-spellcasting-bonuses', 'wizard-learning-on-level', 'multiclass-spellcasting-selected']:
        if key not in units:
            raise ValueError('Missing primary reference ' + key)
    if not units['wizard-learning-on-level']['facts']['ordinarySpellLevelUsesWizardTable'] or not units['multiclass-spellcasting-selected']['facts']['knownPreparedAndCantripsByIndividualClass']:
        raise ValueError('Lost per-class context')
    comparisons = {r['headingId']: r for r in data['inventory']['selectedNewComparisons']}
    for key in ['Cantrips6', 'Spellbook', 'SpellcastingFocus7']:
        if key not in comparisons or comparisons[key]['acceptedForRuntime']:
            raise ValueError('Changed selected comparison/runtime boundary')
    if comparisons['Cantrips6']['ordinaryFacts']['ordinaryWizardClassEntryCantripCount'] != 3 or comparisons['Spellbook']['ordinaryFacts']['ordinaryWizardClassEntryBookSpellCount'] != 6:
        raise ValueError('Initial class facts changed')
    if data['sidebar']['ordinaryFacts']['newSpellCopyHoursPerSpellLevel'] != 2 or data['sidebar']['ordinaryFacts']['ownBookCopyHoursPerSpellLevel'] != 1 or data['ritual']['ordinaryFacts']['preparationRequiredByThisFeature']:
        raise ValueError('Copy or ritual facts changed')
    if data['sidebar']['acceptedForRuntime'] or data['ritual']['acceptedForRuntime']:
        raise ValueError('No runtime acceptance inheritance')
    # Stable report-key references, not inferred PHB print-version equivalence.
    refs = {
        'initial-cantrips': ('inventory', 'selectedNewComparisons', 'Cantrips6'),
        'initial-book': ('inventory', 'selectedNewComparisons', 'Spellbook'),
        'book-copy': ('sidebar', 'ordinaryFacts', None),
        'preparation': ('selected', 'units', 'wizard-preparation-selected'),
        'ability': ('selected', 'units', 'wizard-spellcasting-bonuses'),
        'ritual': ('ritual', 'ordinaryFacts', None),
        'focus': ('inventory', 'selectedNewComparisons', 'SpellcastingFocus7'),
        'learning': ('selected', 'units', 'wizard-learning-on-level'),
        'multiclass': ('selected', 'units', 'multiclass-spellcasting-selected'),
        'scroll': ('newSelectedPrimaryScroll', 'selectedTextSha256', None),
    }
    def ref(key):
        input_key, container, unit_key = refs[key]
        return {'input': INPUTS.get(input_key, input_key), 'container': container, 'unitKey': unit_key}
    c = [
        clause('initial-cantrips',20,[0],ref('initial-cantrips'),'selected-facts-correspond','Wizard1: three choices from Wizard list; later counts refer to Wizard table.'),
        clause('initial-book',21,[0],ref('initial-book'),'selected-facts-correspond','Wizard1: six level1 Wizard spells; cantrips remembered, not stored in this spellbook.'),
        clause('copy-preparable-level',22,[1,2],ref('book-copy'),'selected-facts-correspond','New level1+ Wizard spell; preparable spell level and time/notation procedure retained.'),
        clause('new-copy-cost',22,[3],ref('book-copy'),'selected-facts-correspond','Ordinary new copy: 2hours and50gp per spell level; not own-book backup cost.'),
        clause('scroll-insert',22,[4],ref('scroll'),'explicit-mixed-source-insert','DMG-labelled paragraph is not in the seven-paragraph English Wizard sidebar. Compare separately with SRD242 scroll-copy paragraph.'),
        clause('own-book-copy',22,[5],ref('book-copy'),'selected-facts-correspond','Own notation/backup:1hour and10gp per spell level, distinct from new-source copying.'),
        clause('lost-book',22,[6],ref('book-copy'),'selected-facts-correspond','Reconstruct prepared spells; remaining spells must be found normally. No restoration of all known spells.'),
        clause('spellbook-narrative',22,[0,7],ref('book-copy'),'narrative-scope-corresponds','Discovery/appearance narrative retained as paragraph witnesses; no exact translation or numerical capability claim.'),
        clause('slot-rest-context',23,[0],ref('preparation'),'selected-primary-scope-retained','Russian paragraph refers to Wizard table, appropriate-or-higher slot expenditure and long rest. Source unit covers this paragraph; no new full feature acceptance.'),
        clause('preparation-count',23,[1],ref('preparation'),'requires-multiclass-context','Int modifier + Wizard class level, minimum1, from Wizard book. Available slots wording must be read with per-class multiclass rules.'),
        clause('change-preparation',23,[2],ref('preparation'),'selected-primary-scope-retained','Change after long rest, at least1minute per spell level for each spell in list; retain bounded primary paragraph scope.'),
        clause('intelligence',24,[0],ref('ability'),'selected-facts-correspond','Wizard spellcasting uses Intelligence; no inference for item or other-class spells.'),
        clause('save-dc',24,[1],ref('ability'),'selected-facts-correspond','DC8 + proficiency bonus + Intelligence modifier.'),
        clause('spell-attack',24,[2],ref('ability'),'selected-facts-correspond','Attack proficiency bonus + Intelligence modifier.'),
        clause('wizard-ritual',25,[0],ref('ritual'),'selected-facts-correspond','Wizard spell + ritual tag + Wizard book; preparation not required by this feature. No Artificer rule transfer.'),
        clause('wizard-focus',26,[0],ref('focus'),'localization-term-needs-canonical-mapping','Russian magic-focus wording corresponds in this Wizard context to arcane focus; not every magic item, not a general component exemption.'),
        clause('two-new-spells',27,[0],ref('learning'),'selected-facts-correspond','Two Wizard spell choices on subsequent Wizard level; initial six and imported levels are separate.'),
        clause('learning-table-qualifier',27,[0],ref('learning'),'explicit-qualifier-omission','Russian clause omits explicit Wizard-table qualification present in checked English. Combined higher-level slots must not expand ordinary Wizard learning.'),
        clause('learning-free-qualifier',27,[0],ref('learning'),'explicit-qualifier-omission','English for-free qualifier is absent from this Russian paragraph; do not infer a copy fee for the two ordinary level-up choices.'),
    ]
    by_ordinal = {r['ordinal']: r for r in rows}
    for item in c:
        item['secondaryParagraphSha256'] = [by_ordinal[item['secondaryHeadingOrdinal']]['paragraphSha256'][n] for n in item['secondaryParagraphIndexes']]
    return {'schemaVersion':1,'status':'bounded-manual-secondary-clause-concordance-not-full-translation-or-source-acceptance',
        'accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'candidateReference':copy.deepcopy(candidate),'secondaryWitness':copy.deepcopy(secondary),
        'newSelectedPrimaryScroll':copy.deepcopy(scroll),
        'summary':{'selectedSecondarySections':8,'selectedSecondaryParagraphs':sum(COUNTS),'clauseAssessments':len(c),'sourceBoundaryFindings':1,'omittedQualifierFindings':2,'canonicalUnitsAccepted':0},
        'clauses':c,
        'sourceSegmentationProposal':{'originalCandidateSourceIdsPreserved':['102'],'headingOrdinal':22,
            'coreSidebarParagraphIndexes':[0,1,2,3,5,6,7],'scrollInsertParagraphIndexes':[4],
            'scrollInsertVisibleSourceLabel':'DMG','proposedHistoricalBookSourceId':'101',
            'primaryCorroboration':'SRD5.1 selected Spell Scroll copying paragraph, PDF242',
            'exactDmgPrintVersionVerified':False,'parentSourceArrayRewritten':False,'canonicalSourceAssignmentAccepted':False},
        'scrollCopyOrdinaryFacts':{'wizardSpellRequired':True,'spellbookCopyProcedureStillApplies':True,'checkAbility':'intelligence','checkSkill':'arcana','checkDC':'10 + spellLevel','successfulCheckCopiesSpell':True,'scrollDestroyedOnCopyCheckSuccess':True,'scrollDestroyedOnCopyCheckFailure':True,'castingCheckSubstitutedForCopyCheck':False,'genericInventoryDeletionImplemented':False},
        'syntheticDecisionCases':[
            {'case':'wizard5-cleric3','basis':'synthetic fixture, both full casters; SRD52 Wizard5 and SRD58 multiclass8 rows visually checked; not full table acceptance','sourcePdfSha256':SCROLL_SHA,'inspectedPdfPages':[52,58],'combinedCasterLevel':8,'combinedHighestSlot':4,'ordinaryWizardHighestSpellLevel':3,'canOrdinarilyLearnWizardLevel4FromPool':False,'manualDeviationAllowedWithWarning':True},
            {'case':'copy-level2-scroll-success','check':'intelligence-arcana','DC':12,'spellCopied':True,'scrollDestroyed':True,'ordinaryBookCostsStillApply':True},
            {'case':'copy-level2-scroll-failure','check':'intelligence-arcana','DC':12,'spellCopied':False,'scrollDestroyed':True},
            {'case':'own-book-backup-level2','hours':2,'gp':20,'scrollCheckInferred':False},
            {'case':'import-existing-wizard-levels','newSpellChoicesReapplied':False,'copyingCostsChargedAgain':False},
            {'case':'artificer-multiclass-contribution','inferredFromSrdPaladinRangerRounding':False,'exactArtificerSourceRequired':True}],
        'remainingCriteria':['Wizard Spellcasting parent introductory paragraph19, Wizard table, general spellcasting and full Wizard list remain separate reference work.',
            'Exact original PHB/DMG publication and translation versions, canonical focus term and publication rights remain unresolved.',
            'Artificer complete TCE feature text/version applicability is not supplied by Wizard or Eberron errata.'],
        'nextWorkItem':{'role':'content','phase':'wizard-table-reference-concordance','action':'Check Wizard table rows and parent introduction against corresponding retained 2014 English scopes; preserve mixed-source insert and omitted qualifiers as findings, not silent edits.'},
        'limits':['Manual selected-clause concordance is not an automatic translation-equivalence detector, full candidate acceptance, or catalog denominator.',
            'No source prose/PDF, personal profile, runtime, grants, spending, source-array rewrite or milestone acceptance exported.',
            'Ordinary game deviations warn and permit manual action; authentication, integrity and source provenance protections remain.'],
        'inputSha256':pins,'generator':{'path':'scripts/audit-wizard-candidate-concordance-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('secondary_html',type=Path);p.add_argument('srd_pdf',type=Path);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output',type=Path,required=True)
    p.add_argument('--rendered-scroll-page-checked',action='store_true');a=p.parse_args(); data,pins=load_inputs(a.root)
    d=assemble(extract_secondary(a.secondary_html.read_bytes(),data['boundaries']),extract_scroll(a.srd_pdf.read_bytes(),rendered_page_inspected=a.rendered_scroll_page_checked),data,pins)
    a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8')); print(json.dumps(d['summary']))
