"""Compare selected Wizard table carriers, keeping optional TCE cells and added references separate."""
import argparse
import hashlib
from html import unescape
import importlib.util
import json
from pathlib import Path
import re

SECONDARY_SHA='5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
DIGITAL_SHA='a08b309c589644f9faee67201dc7e0b9752be152215bce54d33d4b1ca7688c5e'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
INPUTS=['catalog/srd51-class-progression.json','catalog/wizard-candidate-clause-concordance-2014.json','catalog/wizard-artificer-source-scopes-2014.json','catalog/wizard-spellcasting-scope-2014.json']
RUSSIAN_NAMES={'#feature.spellcasting':'Использование заклинаний','#feature.arcane-recovery':'Магическое восстановление','#feature.ASI':'Увеличение характеристик','#feature.spell-mastery':'Мастерство заклинателя','#feature.signature-spells':'Фирменное заклинание'}
MAPPINGS={'#feature.spellcasting':'Spellcasting','#feature.arcane-recovery':'Arcane Recovery','#feature.ASI':'Ability Score Improvement','#feature.spell-mastery':'Spell Mastery','#feature.signature-spells':'Signature Spells'}


def sha(raw):return hashlib.sha256(raw).hexdigest()


def visible(raw):return ' '.join(unescape(re.sub('<[^>]*>',' ',raw)).split())


def module(name):
    p=Path(__file__).with_name(name+'.py');s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def checked(raw,expected):
    if sha(raw)!=expected:raise ValueError('Changed retained source SHA; reassess source and manual mappings')
    return raw.decode('utf-8')


def one_table(html):
    tables=re.findall(r'<table\b[^>]*>.*?</table>',html,re.S)
    if len(tables)!=1:raise ValueError('Ambiguous selected table')
    if len(re.findall(r'<table\b',tables[0]))!=1:raise ValueError('Nested table')
    return tables[0]


def cells(table):
    raw_rows=re.findall(r'<tr\b[^>]*>(.*?)</tr>',table,re.S)
    if len(raw_rows)!=22:raise ValueError('Expected two headers and20 rows')
    leftover=re.sub(r'<tr\b[^>]*>.*?</tr>','',table,flags=re.S)
    if visible(leftover):raise ValueError('Visible content outside table rows')
    result=[]
    for row in raw_rows:
        cs=re.findall(r'<(?:td|th)\b([^>]*)>(.*?)</(?:td|th)>',row,re.S)
        if visible(re.sub(r'<(?:td|th)\b[^>]*>.*?</(?:td|th)>','',row,flags=re.S)):
            raise ValueError('Visible row data outside cells')
        if not cs:raise ValueError('Missing cells')
        for attrs,body in cs:
            if any(t.lower() not in {'a','span','p','br','strong','em','b','i'} for t in re.findall(r'</?([a-zA-Z][\w-]*)\b',body)):
                raise ValueError('Unknown/nested semantic cell element')
        result.append(cs)
    if len(result[0])!=5 or len(result[1])!=9 or any(len(r)!=13 for r in result[2:]):raise ValueError('Changed column count')
    if any(re.search(r'rowspan|colspan',attrs,re.I) for row in result[2:] for attrs,body in row):raise ValueError('Spanned data cell')
    return result


def refs(raw):
    return [{'href':unescape(href),'title':visible(title)} for href,title in re.findall(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>',raw,re.S)]


def feature_cell(raw,secondary):
    optional=[]
    if secondary:
        for m in re.finditer(r'<span\b([^>]*)>(.*?)</span>',raw,re.S):
            cls=re.search(r'class="([^"]+)"',m[1])
            if cls is None or cls[1] not in ['TCE-feature-on','TCE-feature-off'] or '<span' in m[2]:raise ValueError('Unknown optional feature projection')
            if cls[1]=='TCE-feature-on':optional.append({'visibleTextSha256':sha(visible(m[2]).encode()),'references':refs(m[2]),'sourceClaim':'117','optional':True})
        base=re.sub(r'<span\b[^>]*class="TCE-feature-on"[^>]*>.*?</span>','',raw,flags=re.S)
    else:
        if re.search(r'TCE-feature|<span',raw):raise ValueError('Unexpected primary optional projection')
        base=raw
    links=refs(base)
    remainder=visible(re.sub(r'<a\b[^>]*>.*?</a>','',base,flags=re.S)).strip(', -—')
    if remainder:raise ValueError('Unmapped visible feature text')
    if not links and visible(base) not in ['-','—']:raise ValueError('Unmapped feature cell')
    return links,optional


def parse_table(table,secondary):
    grid=cells(table)
    expected_headers=(['Уровень ур','Бонус мастерства бм','Умения','Известные заговоры из','Ячейки заклинаний на уровень заклинаний ячейки'] if secondary else ['Level','Proficiency Bonus','Features','Cantrips Known','— Spell Slots per Spell Level —'])
    if [visible(body) for attrs,body in grid[0]]!=expected_headers:raise ValueError('Changed header meaning/order')
    if any(not re.search(r'rowspan="2"',attrs) for attrs,body in grid[0][:4]) or not re.search(r'colspan="9"',grid[0][4][0]):raise ValueError('Changed header spans')
    numbers=[re.sub(r'(st|nd|rd|th)$','',visible(body)) for attrs,body in grid[1]]
    if numbers!=[str(n) for n in range(1,10)]:raise ValueError('Changed spell-level column order')
    rows=[]
    for n,row in enumerate(grid[2:],1):
        texts=[visible(body) for attrs,body in row]
        if re.sub(r'(st|nd|rd|th)$','',texts[0])!=str(n):raise ValueError('Changed row level/order')
        for i in [0,1,3,*range(4,13)]:
            if '<a' in row[i][1] or 'TCE-feature' in row[i][1]:raise ValueError('Unexpected numeric markup')
        if not re.fullmatch(r'\+[2-6]',texts[1]):raise ValueError('Invalid proficiency cell')
        if not re.fullmatch('[345]',texts[3]):raise ValueError('Invalid cantrip count')
        slots=[]
        for value in texts[4:]:
            if value in ['-','—']:slots.append(0)
            elif re.fullmatch('[1-4]',value):slots.append(int(value))
            else:raise ValueError('Invalid spell-slot value')
        links,optional=feature_cell(row[2][1],secondary)
        if secondary:
            features=[]
            for link in links:
                href=link['href']
                value=('Arcane Tradition' if n==2 else 'Arcane Tradition feature') if href=='#feature.arcane-tradition' else MAPPINGS.get(href)
                expected_name=('Магические традиции' if n==2 else 'Умение магической традиции') if href=='#feature.arcane-tradition' else RUSSIAN_NAMES.get(href)
                if link['title']!=expected_name:raise ValueError('Changed manually mapped feature label')
                if value is None:raise ValueError('Unknown base feature reference')
                features.append(value)
        else:features=[r['title'] for r in links]
        rows.append({'level':n,'proficiency':int(texts[1][1:]),'cantrips':int(texts[3]),'spellSlots':slots,'featuresEn':features,
                     'observedFeatureReferences':links,'optionalFeatureObservations':optional})
    return rows


def projection(rows):return [{k:r[k] for k in ['level','proficiency','cantrips','spellSlots','featuresEn']} for r in rows]


def compare_rows(secondary,digital,srd):
    numeric=lambda rows:[{k:r[k] for k in ['level','proficiency','cantrips','spellSlots']} for r in rows]
    if numeric(secondary)!=numeric(digital) or numeric(digital)!=numeric(srd) or [r['level'] for r in srd]!=list(range(1,21)):
        raise ValueError('Wizard numeric table discrepancy; retain difference instead of accepting equality')
    deltas=[]
    for left,middle,right in zip(secondary,digital,srd):
        names=(left['featuresEn'],middle['featuresEn'],right['featuresEn'])
        n=left['level']
        if n in [6,10,14]:
            if names!=(['Arcane Tradition feature'],['Arcane Tradition Feature'],['Arcane Tradition feature']):raise ValueError('Changed named capitalization difference')
            kind='retained-literal-capitalization-difference'
        elif n==20:
            if names!=(['Signature Spells'],['Signature Spells'],['Signature Spell']):raise ValueError('Changed named singular/plural difference')
            kind='retained-literal-singular-plural-name-difference-not-full-feature-equivalence'
        elif names[0]!=names[1] or names[1]!=names[2]:raise ValueError('Unknown feature-name discrepancy')
        else:continue
        deltas.append({'level':n,'secondaryMappedFeatureNames':names[0],'digitalFeatureNames':names[1],'srdFeatureNames':names[2],'classification':kind})
    optional=[{'level':r['level'],**entry} for r in secondary for entry in r['optionalFeatureObservations']]
    actual=[(r['level'],tuple(x['href'] for x in r['references'])) for r in optional]
    if actual!=[(1,('#feature.extra-spells',)),(3,('#feature.cantrip-formulas',))]:raise ValueError('Changed optional TCE cells')
    return optional,deltas


def audit(secondary_raw,digital_raw,srd_raw,root=Path('.')):
    secondary=checked(secondary_raw,SECONDARY_SHA);digital=checked(digital_raw,DIGITAL_SHA)
    if sha(srd_raw)!=SRD_SHA:raise ValueError('Changed primary PDF')
    a=secondary.index('<div class="card__body new-article"');b=secondary.index('<div class="card__footer',a);article=secondary[a:b]
    selected=re.findall(r'<table\b[^>]*class="class_table"[^>]*>.*?</table>',article,re.S)
    if len(selected)!=1:raise ValueError('Ambiguous secondary class table')
    secondary_table=one_table(selected[0])
    start=re.search(r'<h2\b[^>]*id="Wizard"[^>]*>',digital);stop=re.search(r'<h[34]\b[^>]*id="WizardSpellcasting"[^>]*>',digital)
    if not start or not stop or start.end()>=stop.start():raise ValueError('Missing digital Wizard boundaries')
    digital_table=one_table(digital[start.end():stop.start()])
    secondary_rows=parse_table(secondary_table,True);digital_rows=parse_table(digital_table,False)
    from pypdf import PdfReader
    from io import BytesIO
    reader=PdfReader(BytesIO(srd_raw));extractor=module('extract-srd-class-tables')
    srd_rows=extractor.parse_table(reader.pages[51].extract_text(),'wizard',10,'Spellcasting')
    optional,deltas=compare_rows(secondary_rows,digital_rows,srd_rows)
    texts={path:(root/path).read_bytes().replace(b'\r\n',b'\n') for path in INPUTS};data={path:json.loads(raw) for path,raw in texts.items()}
    stored=next(c for c in data[INPUTS[0]]['classes'] if c['slug']=='wizard')['levels']
    if srd_rows!=stored:raise ValueError('Existing Wizard progression table drifted from selected primary')
    # Level marker and added cross-reference links are not silently removed to claim exact translation.
    headings=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0;intro_raw=None
    for i,h in enumerate(headings):
        if not visible(h[2]):continue
        ordinal+=1
        if ordinal==19:
            if visible(h[2])!='Использование заклинаний':raise ValueError('Changed intro heading')
            intro_raw=article[h.end():headings[i+1].start()];break
    helper=module('audit-wizard-candidate-concordance-2014')
    ps=helper.Paragraphs().result(intro_raw)
    if len(ps)!=2 or '1-й уровень' not in ps[0]:raise ValueError('Changed introduction marker/body')
    primary=module('audit-wizard-spellcasting-scope-2014').SpellcastingParser().result(digital)[0]
    if primary['headingId']!='WizardSpellcasting' or len(primary['paragraphs'])!=1:raise ValueError('Changed primary introduction')
    links=refs(intro_raw)
    if [r['href'] for r in links]!=['/spells/?search=&class=21','/articles/mechanics/157-spellcasting/']:raise ValueError('Changed added reference graph')
    candidate=data[INPUTS[1]]['candidateReference']
    if candidate['id']!='scope:wizard:class-features:feature.spellcasting' or candidate['sourceIds']!=['102']:raise ValueError('Changed parent/source claims')
    for item in optional:
        anchor=item['references'][0]['href'][1:]
        matches=[r['candidateReference'] for r in data[INPUTS[2]]['candidateRows'] if r['candidateReference']['id']=='scope:wizard:class-features:'+anchor]
        if len(matches)!=1 or matches[0]['sourceIds']!=['117']:raise ValueError('Optional source claim not supported by original candidate map')
        item['candidateReference']=matches[0]
    primary_intro=' '.join(primary['paragraphs'][0].split())
    expected_intro=data[INPUTS[3]]['inventory'][0]['paragraphTextSha256'][0]
    if sha(primary_intro.encode())!=expected_intro:raise ValueError('Changed primary paragraph witness')
    return {'schemaVersion':1,'status':'selected-wizard-table-and-intro-concordance-not-full-class-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'levelsCompared':20,'numericCellsComparedExcludingLevel':220,'baseFeatureCellsCompared':20,'literalFeatureNameDifferencesPreserved':len(deltas),'optionalTceObservationsPreserved':2,'secondaryIntroductionParagraphs':2,'primaryIntroductionParagraphs':1,'canonicalUnitsAccepted':0},
        'sources':{'secondary':{'url':'https://dnd.su/class/105-wizard/','sha256':SECONDARY_SHA,'tableVisibleTextSha256':sha(visible(secondary_table).encode()),'historicalCandidateSnapshotSha256':data[INPUTS[1]]['secondaryWitness']['historicalCandidateSnapshotSha256'],'receiptBasis':'retained HTML; no new HTTP receipt claimed'},
                   'digital':{'url':data[INPUTS[3]]['sources']['digital']['finalUrl'],'sha256':DIGITAL_SHA,'tableVisibleTextSha256':sha(visible(digital_table).encode())},
                   'srd':{'url':data[INPUTS[0]]['source']['url'],'sha256':SRD_SHA,'pdfPage':52,'existingWizardRowsReproduced':True}},
        'table':{'numericProjectionEqualAcrossThreeCarriers':True,'baseFeatureNameCorrespondence':'manual href-to-existing English feature-name mapping; not full feature text equivalence','rows':projection(secondary_rows),'literalFeatureNameDifferences':deltas,'optionalObservations':optional,'optionalGrantsApplied':False,'secondaryProjections':{'baseFeatureReferences':[{ 'level':r['level'],'references':r['observedFeatureReferences']} for r in secondary_rows]}},
        'introduction':{'candidateReferencePreserved':candidate,'secondaryBodySha256':sha(visible(intro_raw).encode()),'secondaryParagraphSha256':[sha(p.encode()) for p in ps],'primaryParagraphSha256':expected_intro,
            'assessment':'narrative subject corresponds; secondary level marker and two navigation references are additional, not exact translation equality',
            'additionalReferences':links,'addedReferencesVerifiedInFull':False,'literalTranslationEqualityClaimed':False,'newMechanicalCapabilityInferred':False},
        'referenceGraphProgress':{'wizardTableNumericAndBaseFeatureNamesCompared':True,'wizardTableFullFeatureRulesAccepted':False,'remaining':['general spellcasting rules','Wizard spell list'],'originalGraphRewritten':False},
        'nextWorkItem':{'role':'content','phase':'wizard-general-spellcasting-reference','action':'Inventory the secondary general Spellcasting reference article linked by Wizard19 and map bounded corresponding primary scopes, preserving Wizard spell list and multiclass context as separate references.'},
        'limits':['Only Wizard table rows are re-extracted; existing twelve-class implementation is not duplicated or changed.',
            'TCE optional source117 observations remain separate from base PHB102 names; optional grants or full TCE text not accepted.',
            'The three source snapshots are pinned independently; no exact PHB/translation/rights/canonical acceptance inherited.',
            'No runtime/profile/resource change or stage closure. Ordinary game deviations still warn and allow manual action.'],
        'inputSha256':{path:sha(raw) for path,raw in texts.items()},
        'generator':{'path':'scripts/audit-wizard-table-concordance-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
        'upstreamParsers':[{'path':'scripts/'+name+'.py','sha256':sha(Path(__file__).with_name(name+'.py').read_bytes().replace(b'\r\n',b'\n'))} for name in ['extract-srd-class-tables','audit-wizard-candidate-concordance-2014','audit-wizard-spellcasting-scope-2014']]}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('secondary',type=Path);p.add_argument('digital',type=Path);p.add_argument('srd',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.secondary.read_bytes(),a.digital.read_bytes(),a.srd.read_bytes());a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
