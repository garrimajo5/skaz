"""Current D05 work triage: preserve15 historical references and reviewed witness boundaries."""
import argparse
import hashlib
import json
from pathlib import Path

CONTEXT='catalog/library-current-publication-context-2014.json'
EXPECTED_RESIDUAL=[1,34,37,53,62,92,93,94,105,116,122,126,128,129,135]
# Review citations bind exact reviewed report bytes (UTF-8/LF), not mutable future reports.
WITNESSES={
 1:{'path':'catalog/basic-rules-publication-boundary-2014.json','sha256':'581a431600b794854b840c4d1ab7f5ed210c5ddb3286cf3058905ff506cdf5b6',
    'kind':'distinct-basic-rules-carriers-with-different-tocs','pr':208,'head':'ad5fe49630f26852fb8bae700f16cae32929ba1a','review':'https://github.com/garrimajo5/skaz/pull/208#issuecomment-7053222317',
    'reviewedScope':'three artifact identities, PDF1-2/TOC, legal and12SRD headings only',
    'remaining':['carrier/version and canonical-unit decision','other full shared rules and source-specific differences','publication/translation rights'],
    'doNotRepeat':'PDF4classes/14chapters/3appendices versus digital12/15/4; SRD name match is not global text identity'},
 53:{'path':'catalog/sage-advice-publication-boundary-2014.json','sha256':'d1ffcbfb426aaedef84f083d639603b2f0a37e4d60579da5d69b105b8861fde6',
     'kind':'original-5e-rules-clarification-reference','pr':206,'head':'061c33010c0db1997c71ba391d74e6fde532c28e','review':'https://github.com/garrimajo5/skaz/pull/206#issuecomment-7052955503',
     'reviewedScope':'first-page bibliography/authority boundaries only; not all23pages',
     'remaining':['full answers versus catalogue rule units','exact digital/PDF answer versions','publication/translation rights'],
     'doNotRepeat':'PDFv2.7 copyright2021 versus URLdirectory2020; DM adjudication retained'},
 62:{'path':'catalog/frozen-sick-publication-component-2014.json','sha256':'6232b75208a501d5437b8c2fd70595eaf5b09c9f3c0b76171e211d7dc625c625',
     'kind':'adventure-chapter-with-separate-public-distribution','pr':211,'head':'5cb56a4c41acf6034500b2e024af1fd8445d2e32','review':'https://github.com/garrimajo5/skaz/pull/211#issuecomment-7053584544',
     'reviewedScope':'publisher paragraph, parent TOC, public child canonical/h1; no full adventure',
     'remaining':['independent child scope/version and full-record provenance','comparison to original parent chapter and canonical units','publication/translation rights'],
     'doNotRepeat':'provider62 to59 and historicalparent116; CriticalRole display versus existing WotC publication evidence'},
 105:{'path':'catalog/prisoner13-publication-component-2014.json','sha256':'c93eea64905079fb4b06610e6e008504577f90cf816b78ecabf91c4c58ec5321',
      'kind':'adventure-component-with-separate-distribution-entry','pr':209,'head':'f76e940a67b51f4841649b9effc9bb8ef67a08a8','review':'https://github.com/garrimajo5/skaz/pull/209#issuecomment-7053308663',
      'reviewedScope':'publisher paragraph, parent TOC and anonymous redirect only; no standalone full text',
      'remaining':['lawful standalone access for exact text/version comparison','adventure versus creature canonical units and provenance','publication/translation rights'],
      'doNotRepeat':'provider105 to103 and historicalparent189; adventure versus same-name statblock; claim landing is not full text'},
}
WITNESSES.update({34: {'path': 'catalog/rrakkma-publication-boundary-2014.json', 'sha256': '2d39d1bfe6220a0bb6a49cbc82eb69b8f0c1cd67962f203564d4fa86e066cfc5', 'kind': 'introductory-companion-adventure-for-book', 'pr': 213, 'head': 'c5720249c8f618496a4f735e886b2d88e5c4393b', 'review': 'https://github.com/garrimajo5/skaz/pull/213#issuecomment-7053766906', 'reviewedScope': 'own introductory metadata and one editorial3e-to5e rewrite paragraph only', 'remaining': ['full5e record inventory and exact versions', 'independent canonical units versus introduced book and generic AL observations', 'publication/translation rights'], 'doNotRepeat': 'ownDDIA-MORD, introductory-forMToF not contained-in/alias;3e-origin versus5e-rewrite; no genericAL169 attribution'}})
WITNESSES.update({37: {'path': 'catalog/wayfinder-version-boundary-2014.json', 'sha256': '8e452fef30ac75e59707802705180f1ef654728aa2b44348b59d55ca578c75ac', 'kind': 'version-specific-prototype-and-revised-mechanics-boundary', 'pr': 215, 'head': '247e8e59f96bf7a0d482bdb516020b2ea6103b20', 'review': 'https://github.com/garrimajo5/skaz/pull/215#issuecomment-7054000867', 'reviewedScope': 'marketing, first staff post and AL guide18 only', 'remaining': ['current version-specific official status and exact rules', 'independent canonical-unit decisions and publication/translation rights'], 'doNotRepeat': 'old specific mechanics versus updated version; AL restriction is not a home-game ban'}, 92: {'path': 'catalog/radiant-citadel-chapter-boundary-2014.json', 'sha256': '8a827e4613d771c9abe0a8a98c207fc28dac0b9864ebe48a0e169b37f26ca169', 'kind': 'setting-hub-first-chapter-with-separate-promotion', 'pr': 216, 'head': 'de4c95cb5169ac35362dc299bf10c2dc8bb17080', 'review': 'https://github.com/garrimajo5/skaz/pull/216#issuecomment-7054101863', 'reviewedScope': 'two publisher paragraphs, Contents TOC and ended claim notice only', 'remaining': ['full chapter versions, rule units and rights', 'independent canonical-unit decisions and publication/translation rights'], 'doNotRepeat': 'setting chapter is not whole anthology or zero-record proof'}, 93: {'path': 'catalog/spelljammer-academy-series-boundary-2014.json', 'sha256': '4c1d4a9a5f8e375b392d7abd6439c9d2509b220f45cfed6d62eeb211489c78e3', 'kind': 'four-part-preparatory-adventure-series', 'pr': 217, 'head': 'f71b48574aff95782f0fb995495426c010d3b9d3', 'review': 'https://github.com/garrimajo5/skaz/pull/217#issuecomment-7054227077', 'reviewedScope': 'ordered four-part TOC, publisher paragraph, claim notice and AL48 only', 'remaining': ['full adventures and creature units, exact versions and rights', 'independent canonical-unit decisions and publication/translation rights'], 'doNotRepeat': 'prepares Light of Xaryxis is not contained-in; before-completion4 is not global cap'}, 94: {'path': 'catalog/stormwreck-publication-pair-boundary-2014.json', 'sha256': '645497b5dc08d08ed2559b9444cfb2703008b49b46d0dded792abdeaac4834ed', 'kind': 'starter-adventure-source-reference', 'pr': 218, 'head': 'ace59446ef84695770b820e4a42c831f50a0f2e1', 'review': 'https://github.com/garrimajo5/skaz/pull/218#issuecomment-7062251720', 'reviewedScope': 'publisher paragraph, two encounter items and one full-book TOC reference only', 'remaining': ['full book/intro text and exact record provenance, versions and rights', 'independent canonical-unit decisions and publication/translation rights'], 'doNotRepeat': 'Drowned Sailors partial reuse does not identify the whole Intro or invent historical IDs', 'provenanceCaveat': 'Saved bodies only; HTTP status/final URL unretained; Intro body-read timed out, not retried.'}, 128: {'path': 'catalog/stormwreck-publication-pair-boundary-2014.json', 'sha256': '645497b5dc08d08ed2559b9444cfb2703008b49b46d0dded792abdeaac4834ed', 'kind': 'two-encounter-intro-with-explicit-partial-reuse', 'pr': 218, 'head': 'ace59446ef84695770b820e4a42c831f50a0f2e1', 'review': 'https://github.com/garrimajo5/skaz/pull/218#issuecomment-7062251720', 'reviewedScope': 'publisher paragraph, two encounter items and one full-book TOC reference only', 'remaining': ['full book/intro text and exact record provenance, versions and rights', 'independent canonical-unit decisions and publication/translation rights'], 'doNotRepeat': 'Voyage origin unknown; Intro body unread and no whole-chapter equivalence', 'provenanceCaveat': 'Saved bodies only; HTTP status/final URL unretained; Intro body-read timed out, not retried.'}})
RULE={'path':'catalog/wizard-recovery-source-comparison-2014.json','sha256':'0b62cc3ae12d944811eabbaf69ec8693eb180a46120057084e61358a696df5c4',
      'pr':210,'head':'111f21b3cdc6f0c5be9ca6ca137541d3f5c6d621','review':'https://github.com/garrimajo5/skaz/pull/210#issuecomment-7053517446',
      'scope':'one complete94-word unit across3carriers; final boundary delta retested, not a fresh full-source download'}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def normalized(text):return text.replace('\r\n','\n')
def reviewed_json(text,expected):
    if sha(normalized(text).encode())!=expected:raise ValueError('Changed witness cannot inherit cited independent review')
    return json.loads(text)

def validate_identity(pid,witness):
    if witness.get('accepted') or witness.get('complete') or witness.get('approvedDenominator') is not None:
        raise ValueError('Bounded witness unexpectedly claims canonical acceptance')
    identity=witness.get('relationship',witness)
    if 'perProviderWitnesses' in witness:
        if witness.get('providerSourceIds')!=[94,128] or set(witness['perProviderWitnesses'])!={'94','128'} or pid not in [94,128]:
            raise ValueError('Unexpected paired witness identities')
        identity=witness['perProviderWitnesses'][str(pid)]
        if identity.get('accepted') or identity.get('fullRulesReviewed'):
            raise ValueError('Paired bounded witness cannot imply acceptance or full rules')
        actual=identity.get('providerSourceId')
    else:actual=identity.get('childProviderSourceId',witness.get('providerSourceId'))
    if actual!=pid:raise ValueError('Wrong witness provider namespace/identity')
    if (witness.get('canonicalSourceId') is not None or witness.get('numericDndsuSourceId') is not None
            or identity.get('childDndsuSourceId') is not None or identity.get('canonicalSourceId') is not None or identity.get('automaticRecordAttribution',False)
            or identity.get('automaticSourceReplacement',False) or witness.get('automaticAttribution',False)
            or identity.get('numericDndsuSourceId') is not None or identity.get('automaticAttribution',False)):
        raise ValueError('Bounded evidence cannot automatically replace or attribute catalogue records')

def validate_context(context):
    if context.get('accepted') or context.get('complete') or context.get('approvedDenominator') is not None:
        raise ValueError('Context moved beyond this unaccepted historical work-triage stage')
    ids=[r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']]
    if ids!=EXPECTED_RESIDUAL:raise ValueError('Changed original residual; refresh context rather than dropping/adding/reordering rows')
    historical=[r['dndsuSourceId'] for r in context['historicalSourceLedger']]
    if len(historical)!=70 or len(set(historical))!=70:raise ValueError('Changed historical source ledger')
    return historical

def validate_rule(rule):
    if (rule.get('unitId')!='wizard-arcane-recovery' or not rule.get('normalizedSelectedUnitTextEqual')
            or rule.get('acceptedForRuntime') or rule.get('runtimeChanged') or rule.get('accepted') or rule.get('complete') or rule.get('approvedDenominator') is not None):
        raise ValueError('Selected source comparison cannot become runtime/class/denominator acceptance')

def build(root=Path('.')):
    paths=[CONTEXT,*[w['path'] for w in WITNESSES.values()],RULE['path']]
    texts={path:normalized((root/path).read_text(encoding='utf-8')) for path in paths}
    context=json.loads(texts[CONTEXT]);historical=validate_context(context);verified={}
    for pid,spec in WITNESSES.items():
        data=reviewed_json(texts[spec['path']],spec['sha256']);validate_identity(pid,data);verified[pid]=data
    rule=reviewed_json(texts[RULE['path']],RULE['sha256']);validate_rule(rule)
    rows=[];untriaged=[]
    for original in context['remainingUnlinkedProviderReferences']:
        pid=original['providerSourceId'];row={'originalProviderReference':original,'providerSourceId':pid,
            'canonicalUnitAccepted':False,'missingPublicationProven':False,'automaticSourceReplacement':False}
        if pid in WITNESSES:
            spec=WITNESSES[pid];row.update({'triageState':'independently-reviewed-bounded-witness-present','publicationKindWitness':spec['kind'],
                'witnessPath':spec['path'],'reviewedReportSha256':spec['sha256'],
                'independentReviewCited':{k:spec[k] for k in ['pr','head','review','reviewedScope']},
                'doNotRepeat':spec['doNotRepeat'],'remainingCriteria':spec['remaining']})
            if 'provenanceCaveat' in spec:row['provenanceCaveat']=spec['provenanceCaveat']
            if pid==1:row['additionalSelectedRuleComparison']={**RULE,'unitId':'wizard-arcane-recovery','acceptedForRuntime':False}
        else:
            row.update({'triageState':'awaiting-primary-publication-kind-or-component-witness',
                        'remainingCriteria':['primary publication kind/parent/version evidence','canonical units, full record provenance and rights']})
            untriaged.append({'providerSourceId':pid,'title':original['title'],'sourceUrl':original['sourceUrl']})
        rows.append(row)
    return {'schemaVersion':1,'status':'current-work-triage-not-completeness-denominator-or-policy-approval',
            'accepted':False,'complete':False,'approvedDenominator':None,
            'summary':{'preservedHistoricalSources':70,'preservedOriginalProviderResidual':15,'withReviewedBoundedKindWitness':len(verified),
                       'withoutBoundedKindWitness':len(untriaged),'selectedCompleteRuleComparisons':1,'canonicalUnitsAccepted':0},
            'historicalSourceIdSequence':historical,'records':rows,'primaryKindWorkQueue':untriaged,
            'nextUntriagedProviderSourceId':untriaged[0]['providerSourceId'],
            'unlinkedHistoricalRowsPreserved':context['remainingHistoricalRows'],
            'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
            'generator':{'path':'scripts/review-d05-current-triage-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['10+5 partitions15 work references, not the game catalogue or count of missing publications.',
                      'A reviewed bounded witness does not close its remaining full-text/version/scope/rights/canonical-unit criteria.',
                      'Current work is separate from original15-row/70-source observations; no input or policy is mutated.',
                      'Review citations are pinned to the checked report and exact PR head; changed evidence needs new review.',
                      'The selected Wizard rule is neither an eleventh publication witness nor working runtime automation.',
                      'Owner milestones, private matrix, application/VPS state and catalogue denominator remain unchanged.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output');args=p.parse_args();d=build(args.root)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({**d['summary'],'nextUntriagedProviderSourceId':d['nextUntriagedProviderSourceId']}))
