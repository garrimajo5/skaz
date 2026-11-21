"""Prelude and Weave prose only, retaining embedded navigation and a separate Basic carrier/version witness."""
import argparse
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import re
INPUT_PINS={'catalog/ready-bonus-context-2014.json': 'd921d0707996439739a7e678fc6da9406c108424b2669db0446d05d5d9dbae5a', 'catalog/general-introductions-schools-2014.json': '8618b63a316e83bdc40eebc5124f1826244bad5a32e341f74c6998ddf4a01dc1', 'catalog/general-areas-effects-2014.json': '64aef4dd8001785004414ed3cee11cb7d1d0a7084563294d1a7db2cee5139896', 'catalog/spellcasting-reference-scopes-2014.json': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3'}
BASIC_SHA='7a0c5d8bf52d15092f156d78418aa3d43307e271f810d2f06bf2f0258e9288a3'


def sha(raw):return hashlib.sha256(raw).hexdigest()


def intro_module():
    p=Path(__file__).with_name('audit-general-introductions-schools-2014.py');s=importlib.util.spec_from_file_location('intro',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def prelude_parts(raw):
    m=intro_module().module().helper();menus=list(re.finditer(r'<ul\b[^>]*class="new-article-menu"[^>]*>.*?</ul>',raw,re.S))
    if len(menus)!=1 or len(re.findall(r'<ul\b',menus[0][0]))!=1:raise ValueError('Changed exact embedded navigation boundary')
    menu=menus[0][0];prose=raw[:menus[0].start()]+raw[menus[0].end():];ps=m.Paragraphs().result(prose)
    if len(ps)!=2:raise ValueError('Lost prelude prose paragraphs')
    return ps,{'kind':'embedded-navigation-not-rule-prose','rawHtmlSha256':sha(menu.encode()),'visibleTextSha256':sha(m.visible(menu).encode()),'hrefs':re.findall(r'href="([^"]+)"',menu),'dataAnchors':re.findall(r'data-anchor="([^"]+)"',menu),'retainedInOriginalBodyWitness':True,'newRulesCreated':False}


def weave_primary(text):
    start='The Weave of Magic';stop='RICHARD WHITTERS'
    if text.count(start)!=1 or text.count(stop)!=1:raise ValueError('Changed complete Weave/artist-credit boundaries')
    unit=text[text.index(start)+len(start):text.index(stop)].strip()
    if not unit.endswith('or not at all.'):raise ValueError('Lost Weave continuation/end')
    return {'source':'basic2018','pdfPage':85,'startHeading':start,'stopExcluded':'artist credit RICHARD WHITTERS','selectedTextSha256':sha(unit.encode()),'wordCount':len(unit.split()),'completeSelectedNarrative':True}


def basic_combination(text):
    start='Combining Magical Effects';stop='The Weave of Magic'
    if text.count(start)!=1 or text.count(stop)!=1:raise ValueError('Changed adjacent Basic carrier boundary')
    unit=text[text.index(start)+len(start):text.index(stop)].strip()
    if 'Or the most recent effect applies if the castings are equally potent and their durations overlap.' not in unit:raise ValueError('Known 2014 correction missing from Basic carrier')
    return {'source':'basic2018','pdfPage':85,'selectedTextSha256':sha(unit.encode()),'knownEqualPotencyMostRecentSentencePresent':True,'wholeCarrierIdentityWithSrdClaimed':False,'existingSrdWitnessRewritten':False,'publicationYearAloneDeterminesTextVersion':False}


def audit(article_raw,srd_raw,basic_raw,root=Path('.'),*,rendered_pages_inspected=False):
    if not rendered_pages_inspected:raise ValueError('Inspect SRD100 and Basic85 before narrative assessment')
    data={}
    for path,digest in INPUT_PINS.items():
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=digest:raise ValueError('Changed narrative manual context; reassessment required')
        data[path]=json.loads(raw)
    i=intro_module();m=i.module()
    if sha(article_raw)!=m.ARTICLE_SHA:raise ValueError('Changed retained article')
    desc=i.DescriptionBoundary(article_raw.decode('utf-8')).result();hs=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',desc,re.S));base=data['catalog/spellcasting-reference-scopes-2014.json'];records=[]
    pre_raw=desc[:hs[0].start()];ps,navigation=prelude_parts(pre_raw);weave_raw=desc[hs[-1].end():];ws=m.helper().Paragraphs().result(weave_raw)
    if len(ws)!=5:raise ValueError('Lost complete secondary Weave narrative')
    srd=m.primary_pages(srd_raw,m.SRD_SHA,[100])[100];basic=m.primary_pages(basic_raw,BASIC_SHA,[85])[85]
    pre_primary=m.selected_span({100:srd},[100],'Spellcasting','What Is a Spell?');weave=weave_primary(basic);carrier=basic_combination(basic)
    old_effect=next(r for r in data['catalog/general-areas-effects-2014.json']['records'] if r['key']=='combining-effects')
    if not old_effect['secondaryAndSrdOmitEqualPotencyMostRecentClause']:raise ValueError('Changed prior version finding')
    carrier['priorSrdSelectedTextSha256']=old_effect['primary']['selectedTextSha256'];carrier['priorErrataRawSelectedTextSha256']=old_effect['additionalPrimaryEvidence']['rawSelectedTextSha256']
    for n,key,paragraphs,raw,primary in [(0,'prelude',ps,pre_raw,{'source':'srd51','pdfPage':100,'startHeading':'Spellcasting','stopExcluded':'What Is a Spell?','selectedTextSha256':sha(pre_primary.encode()),'wordCount':len(pre_primary.split()),'completeSelectedNarrative':True}),(48,'weave',ws,weave_raw,weave)]:
        old=base['inventory']['blocks'][n];bodysha=sha(m.helper().visible(raw).encode())
        if bodysha!=old['bodyTextSha256']:raise ValueError('Lost original prose/navigation body witness')
        records.append({'headingOrdinal':n,'key':key,'originalCombinedBodySha256':bodysha,'selectedProseParagraphSha256':[sha(p.encode()) for p in paragraphs],'primary':primary,'completeSelectedNarrativeProseCompared':True,'wholeCombinedBodyAcceptedAsRules':False,'assessment':'manual selected narrative correspondence,not literal translation or gameplay grant','fullTranslationAccepted':False,'acceptedForRuntime':False})
    remaining=[n for n in data['catalog/ready-bonus-context-2014.json']['remainingHeadingOrdinalsWithoutSelectedProseReview'] if n!=48]
    return {'schemaVersion':1,'status':'two-selected-narrative-prose-scopes-with-navigation-and-carrier-holds','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'selectedNarrativeProseScopes':2,'selectedSecondaryParagraphs':7,'embeddedNavigationBlocksRetained':1,'newBasicCarrierVersionWitnesses':1,'remainingHeadingsWithoutSelectedProseReview':len(remaining),'canonicalUnitsAccepted':0},
        'sources':{'secondary':base['source'],'srd':{'sha256':m.SRD_SHA,'pdfPage':100},'basic':{'sha256':BASIC_SHA,'url':'https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf','version':'1.0(2018),2014rules','pdfPage':85,'srdLicenseInherited':False},'extractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedScopesInspected':True},
        'records':records,'preludeNavigation':navigation,'basicAdjacentCarrierWitness':carrier,
        'narrativeBoundaries':{'settingLoreDoesNotRequireProfileWorldOrDeity':True,'arcaneDivineDescriptionsGrantNoClassSpells':True,'damagedWeaveLoreCreatesNoAutomaticResourceMutation':True,'milesToKilometersIsNarrativeLocalizationNotMechanicalRange':True,'specificRulesAndManualExceptionsRemainSeparate':True,'noSourceBodyRewritten':True},
        'remainingHeadingOrdinalsWithoutSelectedProseReview':remaining,'unverifiedDiagramHeadingOrdinals':data['catalog/ready-bonus-context-2014.json']['unverifiedDiagramHeadingOrdinals'],
        'nextWorkItem':{'role':'content','phase':'wizard-spell-list-reference','action':'Locate retained primary Wizard spell-list boundaries and compare actual secondary list/version/source scope; keep optional additions, names versus full rules, and general variant/media criteria separate.'},
        'limits':['Prelude2p and Weave5p only; embedded TOC is retained navigation,not extra spell rules.',
            'Basic85 carrier corroborates known correction without overwriting older SRD/secondary witnesses or accepting whole PHB equivalence.',
            'Narrative distance/setting descriptions do not create mechanical range, required deity or spell grants.',
            'Eleven other heading bodies and five diagram insertions remain; no rights/canonical denominator/runtime/owner-stage acceptance.'],
        'inputSha256':INPUT_PINS,'generator':{'path':'scripts/audit-weave-narrative-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParsers':[{'path':'scripts/'+name+'.py','sha256':sha(Path(__file__).with_name(name+'.py').read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-general-introductions-schools-2014','audit-general-casting-clauses-2014','audit-wizard-candidate-concordance-2014']]}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('article',type=Path);p.add_argument('srd',type=Path);p.add_argument('basic',type=Path);p.add_argument('--rendered-primary-pages-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.article.read_bytes(),a.srd.read_bytes(),a.basic.read_bytes(),rendered_pages_inspected=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
