"""Audit explicit tribal edit operations, without reconstructing a canonical book list."""
import argparse,hashlib,json,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
normalize=runpy.run_path(str(ROOT/'scripts/audit-skt-spellcasting-actions.py'))['normalize']

def split_outside_parentheses(value):
    parts=[];start=0;depth=0
    for i,char in enumerate(value):
        if char=='(':depth+=1
        elif char==')':
            depth-=1
            if depth<0:raise ValueError('Unbalanced removal clause')
        elif char==',' and depth==0:parts.append(value[start:i].strip());start=i+1
    if depth:raise ValueError('Unbalanced removal clause')
    parts.append(value[start:].strip())
    return parts

def parse_edits(page):
    text=normalize(page)
    removed=re.findall(r'following spells have been cut from the sidebar: (.*?)\. In the “Black Raven”',text)
    if len(removed)!=1:raise ValueError('Missing unique removal block')
    removals={}
    for item in split_outside_parentheses(removed[0]):
        match=re.fullmatch(r'([a-z ]+) \(([A-Za-z, ]+)\)',item)
        if not match:raise ValueError('Unknown removal syntax: '+item)
        for tribe in match[2].split(', '):
            for name in match[1].split(' and '):
                values=removals.setdefault(tribe,[])
                if name in values:raise ValueError('Duplicate removal')
                values.append(name)
    replacement=re.findall(r'spells in the “Sky Pony” section of the sidebar are now “([a-z ,]+)\.”',text)
    if len(replacement)!=1:raise ValueError('Missing Sky Pony replacement')
    # Witnesses retain source-specific restrictions; unknown wording requires manual review.
    witnesses=[
      '“polymorph (self only; into a raven only).”',
      '“find steed (cast as 1 action; elk only).”',
      '“beast sense (birds only)” has been added to the spell list before fly.',
      'changes reduce the number of spells per tribe to two',
      'all the spells listed can be cast as 1 action.',
    ]
    for witness in witnesses:
        if witness not in text:raise ValueError('Primary edit witness missing: '+witness)
    return {'removals':removals,'replacement':{'Sky Pony':replacement[0].split(', ')},
      'additions':{'Griffon':[{'spell':'beast sense','before':'fly'}]},
      'overrides':{'Black Raven':{'polymorph':{'target':'self only; raven only'}},'Elk':{'find steed':{'castingTime':'1 action','form':'elk only'}},'Griffon':{'beast sense':{'target':'birds only'}}},
      'claimSpellsPerTribe':2,'castingTimeOverride':'1 action'}

def audit(manifest,edits):
    if manifest['accepted'] or manifest['fullRulesVerified'] or manifest['automaticPatch'] or manifest['canonicalId'] is not None:raise ValueError('Unsupported acceptance')
    if len(manifest['tribes'])!=11 or len({t['name'] for t in manifest['tribes']})!=11:raise ValueError('Invalid tribe set')
    if manifest['primaryClaimSpellsPerTribe']!=edits['claimSpellsPerTribe'] or manifest['primaryCastingTimeOverride']!=edits['castingTimeOverride']:raise ValueError('General claim changed')
    names={t['name'] for t in manifest['tribes']}
    if not set(edits['removals']).issubset(names):raise ValueError('Missing affected tribe')
    for tribe in manifest['tribes']:
        name=tribe['name'];removed=edits['removals'].get(name,[])
        if name in edits['replacement']:
            if tribe['replaceWith']!=edits['replacement'][name] or tribe['remove'] or tribe['add']:raise ValueError('Replacement changed')
            if not set(removed).issubset(tribe['observedSpells']) or set(removed)&set(tribe['replaceWith']):raise ValueError('Replacement ignores removals')
        elif tribe['replaceWith'] is not None or sorted(tribe['remove'])!=sorted(removed):raise ValueError('Removal scope changed')
        if tribe['add']!=edits['additions'].get(name,[]):raise ValueError('Insertion changed')
        if tribe['primaryOverrides']!=edits['overrides'].get(name,{}):raise ValueError('Local override changed')
    return sum(len(names) for names in edits['removals'].values())

if __name__=='__main__':
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/skt-tribal-spell-reconstruction-2014.json').read_text(encoding='utf-8-sig'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['primaryEvidence']['sha256']:raise ValueError('PDF changed')
    count=audit(d,parse_edits(PdfReader(a.pdf).pages[2].extract_text()))
    print(f'{count} primary removals plus replacement/insertion/overrides match; complete tribal lists remain unverified')
