"""Scoped publisher contents for the 18 remaining bestiary attribution groups.

No downloads/stat blocks, no aliases, no canonical splits or rule acceptance.
Raw public HTML is supplied separately and remains outside Git.
"""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class ScopedContents(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[]; self.anchor=None; self.h1=None
        self.headings=[]; self.links=[]; self.article_links=[]; self.toc_count=0
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        classes=lambda a:set(a.get('class','').split())
        in_toc=any('compendium-toc-full' in classes(a) for t,a in self.stack)
        in_article=any('article-main' in classes(a) for t,a in self.stack)
        if 'compendium-toc-full' in classes(attrs):self.toc_count+=1
        if tag=='a':self.anchor={'href':attrs.get('href',''),'label':'','inToc':in_toc,'inArticle':in_article}
        if tag=='h1':self.h1=''
        if tag not in VOID:self.stack.append((tag,attrs))
    def handle_data(self, text):
        if self.anchor is not None:self.anchor['label']+=text
        if self.h1 is not None:self.h1+=text
    def handle_endtag(self, tag):
        if tag=='a' and self.anchor is not None:
            a=self.anchor;self.anchor=None;a['label']=' '.join(a['label'].split())
            if a['inToc']:self.links.append(a)
            elif a['inArticle']:self.article_links.append(a)
        if tag=='h1' and self.h1 is not None:self.headings.append(' '.join(self.h1.split()));self.h1=None
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0]==tag:self.stack=self.stack[:i];break


def chapter_url(code, value, require_fragment=False):
    p=urlsplit(value)
    return (p.scheme=='https' and p.netloc=='www.dndbeyond.com' and not p.query
        and not p.username and not p.password and bool(code)
        and bool(re.fullmatch(r'/(?:sources/(?:dnd/)?|compendium/(?:rules|adventures)/)'+re.escape(code)+r'/[^?#]+',p.path))
        and (bool(p.fragment) or not require_fragment))


def fragment(label):
    return re.sub(r'[^A-Za-z0-9]','',label)


def extract_source(raw, spec, names, chapter_attempt=None):
    p=ScopedContents();p.feed(raw.decode('utf-8'));p.close()
    expected=spec['expectedPublishedTitle']
    title_verified=expected is not None and expected in p.headings
    if expected is not None and not title_verified:raise ValueError('Missing literal publisher title: '+spec['sourceId'])
    records=[];missing=[];alternates=[];contexts=[];article_mentions=[];anomalies=[]
    for name in names:
        found=[]
        if spec['kind']=='publisher-toc' and title_verified:
            for link in p.links:
                if link['label'].lower()!=name:continue
                target=urljoin('https://www.dndbeyond.com',link['href'])
                if not chapter_url(spec['bookCode'],target,True):raise ValueError('Exact title points outside its publication')
                row={'name':name,'heading':link['label'],'targetUrl':target}
                if urlsplit(target).fragment!=fragment(link['label']):
                    anomalies.append({**row,'reason':'label-fragment-mismatch','expectedFragment':fragment(link['label']),'automaticCorrection':False})
                else:found.append(row)
        if len(found)==1 and not any(a['name']==name for a in anomalies):records.append({**found[0],'kind':'publisher-scoped-toc-heading','publicationPresenceOnly':True})
        else:missing.append({'name':name,'reason':'ambiguous-scoped-heading' if len(found)>1 else 'exact-heading-unresolved'})
        for label in spec.get('unapprovedAlternates',{}).get(name,[]):
            for link in p.links:
                if link['label']!=label:continue
                target=urljoin('https://www.dndbeyond.com',link['href'])
                if not chapter_url(spec['bookCode'],target,True):raise ValueError('Alternative points outside publication')
                alternates.append({'observedKey':name,'heading':label,'targetUrl':target,'aliasAccepted':False,'usedAsExactWitness':False})
        if spec['kind']=='publisher-article':
            for link in p.article_links:
                if link['label'].lower()!=name:continue
                target=urljoin(spec['sourceUrl'],link['href'])
                if not re.fullmatch(r'https://www\.dndbeyond\.com/monsters/[0-9]+-[a-z0-9-]+',target):continue
                article_mentions.append({'name':name,'heading':link['label'],'targetUrl':target,'acceptedAsPublicationWitness':False})
    if spec['kind']=='publisher-toc':
        for link in p.links:
            if link['label'] not in spec.get('contextLabels',[]):continue
            target=urljoin('https://www.dndbeyond.com',link['href'])
            if not chapter_url(spec['bookCode'],target):raise ValueError('Parent chapter outside publication')
            contexts.append({'heading':link['label'],'targetUrl':target,'relation':'parent-chapter-only','satisfiesCreatureClaim':False})
    access=None
    if chapter_attempt is not None:
        requested=chapter_attempt['requestedUrl']
        if requested not in [x['targetUrl'].split('#')[0] for x in contexts]:raise ValueError('Chapter attempt has no selected parent link')
        access={k:chapter_attempt[k] for k in ['requestedUrl','resolvedUrl','htmlSha256','error'] if k in chapter_attempt}
        access['usedAsCreatureEvidence']=False
        access['status']='unavailable' if 'error' in chapter_attempt else 'redirected-chapter-not-read' if chapter_attempt['resolvedUrl']!=requested else 'heading-only-access-not-used-for-identity'
    return {'sourceId':spec['sourceId'],'policyTitle':spec['policyTitle'],'publishedIndexHeadings':p.headings,
        'kind':spec['kind'],'indexUrl':spec['sourceUrl'],'htmlSha256':hashlib.sha256(raw).hexdigest(),
        'literalPublicationTitleVerified':title_verified,'scopedTocPresent':bool(p.toc_count),'wantedNames':names,
        'records':records,'missing':missing,'parentContexts':contexts,'unapprovedAlternates':alternates,
        'articleMentions':article_mentions,'linkAnomalies':anomalies,'chapterAccess':access}


def build(selection, review, manifest, raw_files, chapter_manifest):
    prior=set()
    # The selection is pinned to the unmodified input reports by its consumer.
    wanted_ids=set(selection['selectedReviewIds'])
    groups=[g for g in review['identityGroups'] if g['reviewId'] in wanted_ids]
    if len(groups)!=selection['expectedGroups'] or sum(len(g['members']) for g in groups)!=selection['expectedObservations']:
        raise ValueError('Remaining bestiary scope changed')
    by_id={r['sourceId']:r for r in manifest}
    if len(by_id)!=len(manifest) or set(by_id)!={s['sourceId'] for s in selection['sources']}:raise ValueError('Source manifest changed')
    chapters={r['sourceId']:r for r in chapter_manifest}
    if len(chapters)!=len(chapter_manifest):raise ValueError('Duplicate chapter source')
    sources=[]
    for spec in selection['sources']:
        ident=spec['sourceId'];item=by_id[ident]
        if item.get('requestedUrl')!=spec['sourceUrl'] or item.get('resolvedUrl')!=spec['sourceUrl'] or item.get('file')!=ident+'.html':raise ValueError('Substituted source transport')
        raw=raw_files[ident]
        if hashlib.sha256(raw).hexdigest()!=item['htmlSha256']:raise ValueError('Raw source hash changed')
        names=sorted({g['comparisonKey'] for g in groups if any(ident in m['sourceIds'] for m in g['members'])})
        sources.append(extract_source(raw,spec,names,chapters.get(ident)))
    return {'schemaVersion':1,'status':'remaining-bestiary-publication-witnesses-not-full-rules','checkedOn':'2026-11-20',
        'selectedReviewIds':selection['selectedReviewIds'],'sources':sources,
        'limitations':['Only selected scoped headings establish literal publication presence; no stat-block identity or identical/full rules are established.',
            'Composite source arrays remain observations; each edge is a publication claim, not an accepted canonical version.',
            'Parent chapters, article mentions and unapproved spellings never fill an exact-heading gap.',
            'No translation reuse permission, accepted denominator, automatic merge or character migration is established.']}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    root=Path(__file__).resolve().parents[1]
    selection=json.loads((root/'catalog/remaining-bestiary-source-selection-2014.json').read_text(encoding='utf-8'))
    review=json.loads((root/'catalog/effective-m0-review-2014.json').read_text(encoding='utf-8'))
    manifest=json.loads((a.directory/'manifest.json').read_text(encoding='utf-8'));chapters=json.loads((a.directory/'chapter-manifest.json').read_text(encoding='utf-8'))
    result=build(selection,review,manifest,{s['sourceId']:(a.directory/(s['sourceId']+'.html')).read_bytes() for s in selection['sources']},chapters)
    if a.output.resolve() in {p.resolve() for p in a.directory.iterdir()}:raise SystemExit('Output cannot overwrite an existing source-folder file')
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'sources':len(result['sources']),'exactPublicationHeadings':sum(len(s['records']) for s in result['sources']),'unresolvedClaims':sum(len(s['missing']) for s in result['sources']),'parentContexts':sum(len(s['parentContexts']) for s in result['sources']),'unapprovedAlternates':sum(len(s['unapprovedAlternates']) for s in result['sources'])}))
