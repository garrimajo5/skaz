"""Read only public index metadata; never infer full rules or canonical aliases."""
import argparse,hashlib,html,json,re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse,parse_qs
ROOT=Path(__file__).resolve().parents[1]
class Node:
    def __init__(self,tag='',attrs=()):self.tag=tag;self.attrs=dict(attrs);self.children=[]
    def text(self):return ''.join(x.text() if isinstance(x,Node) else x for x in self.children)
    def find(self,predicate):
        for child in self.children:
            if isinstance(child,Node):
                if predicate(child):yield child
                yield from child.find(predicate)
    def has(self,css):return css in self.attrs.get('class','').split()
class Tree(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        node=Node(tag,attrs);self.stack[-1].children.append(node)
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:self.stack.append(node)
    def handle_startendtag(self,tag,attrs):self.stack[-1].children.append(Node(tag,attrs))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,data):self.stack[-1].children.append(data)
def only(nodes,label):
    nodes=list(nodes)
    if len(nodes)!=1:raise ValueError('Expected one '+label)
    return nodes[0]
def clean(node):return ' '.join(node.text().split())
def parse_page(markup,filter_value,filter_option_id,allowed_sources=None):
    tree=Tree();tree.feed(markup)
    option=only(tree.root.find(lambda n:n.tag=='option' and n.attrs.get('id')==filter_option_id),'source option')
    if option.attrs.get('value')!=filter_value or 'selected' not in option.attrs:raise ValueError('Source filter not selected')
    listing=only(tree.root.find(lambda n:n.tag=='ul' and n.has('rpgmonster-listing')),'monster listing')
    next_pages=set()
    for link in tree.root.find(lambda n:n.tag=='a' and (n.attrs.get('rel')=='next' or clean(n).lower()=='next')):
        url=urlparse(link.attrs.get('href',''));query=parse_qs(url.query)
        if url.scheme or url.netloc or url.path!='/monsters' or query.get('filter-source')!=[filter_value] or len(query.get('page',[]))!=1 or not query['page'][0].isdigit():raise ValueError('Unexpected next page URL')
        next_pages.add(int(query['page'][0]))
    if len(next_pages)>1:raise ValueError('Conflicting next page links')
    rows=[]
    for n in listing.find(lambda n:n.has('info') and n.attrs.get('data-type')=='monsters'):
        named=only(n.find(lambda x:x.has('monster-name')),'name cell')
        link=only(named.find(lambda x:x.tag=='a' and x.attrs.get('href','').startswith('/monsters/')),'monster link')
        source=clean(only(named.find(lambda x:x.has('source')),'source'))
        if not source or (allowed_sources is not None and source not in allowed_sources):raise ValueError('Unexpected source')
        path=link.attrs['href']
        if not re.fullmatch(r'/monsters/\d+-[a-z0-9-]+',path):raise ValueError('Invalid monster URL')
        cr=clean(only(n.find(lambda x:x.has('monster-challenge')),'CR'))
        if not re.fullmatch(r'\d+(?:/\d+)?',cr):raise ValueError('Missing/invalid CR')
        rows.append({'displayedSource':source,'digitalName':clean(link),'cardUrl':'https://www.dndbeyond.com'+path,'challengeRating':cr,'type':clean(only(n.find(lambda x:x.has('monster-type')),'type')),'size':clean(only(n.find(lambda x:x.has('monster-size')),'size')),'alignment':clean(only(n.find(lambda x:x.has('monster-alignment')),'alignment'))})
    if not rows or len(rows)>20 or len({r['cardUrl'] for r in rows})!=len(rows):raise ValueError('Unexpected digital unit set')
    return {'rows':rows,'nextPage':next(iter(next_pages),None)}
def parse_index(markup):
    page=parse_page(markup,'57','filter-source-mordenkainens-fiendish-folio-volume-1',{"Mordenkainen's Fiendish Folio Volume 1",'Infernal Machine Rebuild'})
    if page['nextPage'] is not None:raise ValueError('Additional page requires review')
    rows=page['rows']
    if len(rows)!=18 or len({r['digitalName'] for r in rows})!=18:raise ValueError('Unexpected digital unit set')
    return rows
def audit(manifest,rows):
    if manifest['accepted'] or manifest['complete'] or manifest['approvedDenominator'] is not None:raise ValueError('Unsupported acceptance')
    expected=manifest['digitalIndexEvidence']['rows']
    if len(expected)!=len(rows):raise ValueError('Missing digital row')
    for e,r in zip(expected,rows):
        if {k:e[k] for k in r}!=r:raise ValueError('Digital field or order mismatch')
    return len(rows)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('html',type=Path);a=p.parse_args()
    rows=parse_index(a.html.read_text(encoding='utf-8-sig'))
    d=json.loads((ROOT/'catalog/fiendish-folio-version-evidence-2014.json').read_text(encoding='utf-8-sig'))
    print(str(audit(d,rows))+'/18 public digital index rows match; stat blocks and canonical aliases not verified')
if __name__=='__main__':main()
