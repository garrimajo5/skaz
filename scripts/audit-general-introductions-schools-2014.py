"""Four remaining common introduction/school scopes, with exact article boundary and explicit school mapping."""
import argparse
import hashlib
from html.parser import HTMLParser
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import re
INPUT_PINS={'catalog/general-areas-effects-2014.json': '64aef4dd8001785004414ed3cee11cb7d1d0a7084563294d1a7db2cee5139896', 'catalog/spellcasting-reference-scopes-2014.json': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3'}
SPECS=[('what-is-spell',1,3,[100],'What Is a Spell?','Spell Level'),('spell-level',2,3,[100],'Spell Level','Known and Prepared Spells'),('casting-introduction',12,2,[101],'Casting a Spell','Casting Time'),('schools',27,10,[103,104],'The Schools of Magic','Combining Magical Effects')]
SCHOOL_LABELS={'Заклинания Воплощения':'evocation','Заклинания Вызова':'conjuration','Заклинания Иллюзии':'illusion','Заклинания Некромантии':'necromancy','Заклинания Ограждения':'abjuration','Заклинания Очарования':'enchantment','Заклинания Преобразования':'transmutation','Заклинания Прорицания':'divination'}
PRIMARY_SCHOOL_ORDER=['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation']


def sha(raw):return hashlib.sha256(raw).hexdigest()


def module():
    p=Path(__file__).with_name('audit-general-casting-clauses-2014.py');s=importlib.util.spec_from_file_location('casting',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


class DescriptionBoundary(HTMLParser):
    def __init__(self,html):
        super().__init__(convert_charrefs=True);self.html=html;self.offsets=[0];self.depth=0;self.roots=0;self.begin=None;self.end=None
        for line in html.splitlines(keepends=True):self.offsets.append(self.offsets[-1]+len(line))
    def position(self):
        line,col=self.getpos();return self.offsets[line-1]+col
    def handle_starttag(self,tag,attrs):
        if tag!='div':return
        if self.depth:self.depth+=1
        elif set(dict(attrs).get('class','').split())=={'desc','card__article-body'}:
            self.roots+=1;self.depth=1;self.begin=self.position()+len(self.get_starttag_text())
    def handle_endtag(self,tag):
        if tag=='div' and self.depth:
            self.depth-=1
            if not self.depth:self.end=self.position()
    def result(self):
        self.feed(self.html);self.close()
        if self.roots!=1 or self.depth or self.begin is None or self.end is None:raise ValueError('Ambiguous/unclosed description boundary')
        return self.html[self.begin:self.end]


def secondary_school_map(raw_paragraphs,primary_text):
    m=module().helper();secondary=[];repairs=[]
    if len(raw_paragraphs)!=10:raise ValueError('Expected overview2 plus8school paragraphs')
    for index,raw in enumerate(raw_paragraphs[2:],2):
        fragments=[m.visible(x) for x in re.findall(r'<strong\b[^>]*>(.*?)</strong>',raw,re.S)]
        if fragments==['З','аклинания Преобразования']:
            label=''.join(fragments);repairs.append({'secondaryParagraphIndex':index,'kind':'label-only-join-adjacent-strong-fragments','bodyTextRewritten':False,'fragmentSha256':[sha(x.encode()) for x in fragments]})
        elif len(fragments)==1:label=fragments[0]
        else:raise ValueError('Unknown school label fragments')
        key=SCHOOL_LABELS.get(label)
        if key is None:raise ValueError('Unknown school label')
        secondary.append({'school':key,'secondaryParagraphIndex':index,'secondaryParagraphTextSha256':sha(m.visible(raw).encode())})
    if len({r['school'] for r in secondary})!=8 or {r['school'] for r in secondary}!=set(PRIMARY_SCHOOL_ORDER):raise ValueError('Missing/duplicate school category')
    locations=[]
    for key in PRIMARY_SCHOOL_ORDER:
        marker=key.title()+' spells'
        if primary_text.count(marker)!=1:raise ValueError('Changed complete primary school marker')
        locations.append(primary_text.index(marker))
    if locations!=sorted(locations):raise ValueError('Changed primary school sequence')
    primary={key:primary_text[locations[i]:locations[i+1] if i+1<len(locations) else len(primary_text)].strip() for i,key in enumerate(PRIMARY_SCHOOL_ORDER)}
    for row in secondary:
        unit=primary[row['school']];row.update(primaryCategoryTextSha256=sha(unit.encode()),primaryCategoryWordCount=len(unit.split()),completeCategoryParagraphCompared=True)
    return {'primaryOrder':PRIMARY_SCHOOL_ORDER,'secondaryOrder':[r['school'] for r in secondary],'rows':secondary,'labelProjectionRepairs':repairs,'sameOrderClaimed':False,'primaryIllusionContinuationOn104Retained':True}


def audit(article_raw,srd_raw,root=Path('.'),*,rendered_primary_pages_inspected=False):
    if not rendered_primary_pages_inspected:raise ValueError('Inspect selected SRD100/101/103/104 scopes before assessment')
    data={}
    for path,digest in INPUT_PINS.items():
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=digest:raise ValueError('Changed manual context requires reassessment')
        data[path]=json.loads(raw)
    m=module()
    if sha(article_raw)!=m.ARTICLE_SHA:raise ValueError('Changed retained article')
    desc=DescriptionBoundary(article_raw.decode('utf-8')).result();headings=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',desc,re.S))
    if len(headings)!=48:raise ValueError('Changed original heading inventory')
    pages=m.primary_pages(srd_raw,m.SRD_SHA,[100,101,103,104]);base=data['catalog/spellcasting-reference-scopes-2014.json'];records=[];school_map=None
    for key,n,pcount,nums,start,stop in SPECS:
        h=headings[n-1];raw=desc[h.end():headings[n].start()];ps=m.helper().Paragraphs().result(raw);old=base['inventory']['blocks'][n]
        if len(ps)!=pcount or sha(' '.join(ps).encode())!=old['bodyTextSha256'] or m.helper().visible(h[2])!=old['title']:raise ValueError('Lost/changed complete secondary scope')
        unit=m.selected_span(pages,nums,start,stop)
        record={'key':key,'headingOrdinal':n,'title':old['title'],'secondaryBodySha256':old['bodyTextSha256'],'secondaryParagraphSha256':[sha(p.encode()) for p in ps],
            'primary':{'source':'srd51','pdfPages':nums,'startHeading':start,'stopHeadingExcluded':stop,'selectedTextSha256':sha(unit.encode()),'wordCount':len(unit.split()),'completeSelectedTextScope':True},
            'assessment':'manual selected semantic correspondence; not literal translation equality','fullTranslationAccepted':False,'acceptedForRuntime':False}
        if key=='schools':
            raw_ps=re.findall(r'<p\b[^>]*>(.*?)</p>',raw,re.S);school_map=secondary_school_map(raw_ps,unit)
        records.append(record)
    prior=data['catalog/general-areas-effects-2014.json']['remainingHeadingOrdinalsWithoutSelectedProseReview'];remaining=[n for n in prior if n not in [r['headingOrdinal'] for r in records]]
    return {'schemaVersion':1,'status':'four-selected-introduction-school-scopes-not-full-catalog-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'selectedScopes':4,'secondaryParagraphs':18,'schoolCategoriesExplicitlyMapped':8,'remainingHeadingsWithoutSelectedProseReview':len(remaining),'canonicalUnitsAccepted':0},
        'sources':{'secondary':base['source'],'srd':{'sha256':m.SRD_SHA,'pdfPages':[100,101,103,104]},'extractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedPrimaryScopesInspected':True},
        'articleBoundary':{'mode':'parsed-desc-container-end-not-literal-div-search','descriptionRawHtmlSha256':sha(desc.encode()),'commentsScriptsAndFooterIncluded':False},
        'records':records,'schoolCorrespondence':school_map,
        'ordinarySelectedFacts':{'spellIsDiscreteMagicEffect':True,'narrativeDoesNotFixEveryCastingTimeToSeconds':True,'spellLevelRange':[0,9],'cantripSpellLevel':0,'spellLevelEqualsCharacterLevel':False,'ordinaryLevel9SpellTypicallyNeedsAtLeastCharacterLevel17':True,'typicalThresholdDoesNotOverrideItemsOrSpecificFeatures':True,
            'descriptionMetadataFields':['name','level','school','castingTime','range','components','duration'],'effectDescriptionSeparate':True,'newImporterHardRequirementImplemented':False,
            'schoolCategoriesHaveNoOwnRulesButOtherRulesCanReferToThem':True,'schoolMembershipAutomaticallyGrantsClassSpellAccess':False,'necromancyLoreCreatesAlignmentCreationGate':False,'schoolSubclassRulesAccepted':False,'manualDeviationAllowedWithWarning':True},
        'remainingHeadingOrdinalsWithoutSelectedProseReview':remaining,'unverifiedDiagramHeadingOrdinals':data['catalog/general-areas-effects-2014.json']['headingOrdinalsWithUnverifiedDiagramInsertions'],
        'nextWorkItem':{'role':'content','phase':'ready-and-repeated-bonus-reference','action':'Compare secondary Ready17 selected spell procedure against corresponding full combat Ready primary context and errata, and bonus18 against checked bonus14 rule; preserve trigger/slot timing and partial scope distinctions.'},
        'limits':['Four selected text scopes/18paragraphs/eight categories only, not full class/subclass/spell list/rights/canonical acceptance.',
            'School paragraphs are mapped explicitly across different orders; the one fragmented strong-label projection does not rewrite body witnesses.',
            'Narrative/category descriptions do not grant spells, set universal casting times or enforce alignment gates.',
            '14remaining heading bodies plus five unverified diagram insertions remain; no runtime/profile change or owner milestone closure.'],
        'inputSha256':INPUT_PINS,'generator':{'path':'scripts/audit-general-introductions-schools-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParsers':[{'path':'scripts/'+name+'.py','sha256':sha(Path(__file__).with_name(name+'.py').read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-general-casting-clauses-2014','audit-wizard-candidate-concordance-2014']]}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('article',type=Path);p.add_argument('srd',type=Path);p.add_argument('--rendered-primary-pages-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.article.read_bytes(),a.srd.read_bytes(),rendered_primary_pages_inspected=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
