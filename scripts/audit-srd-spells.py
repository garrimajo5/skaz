"""Read-only extraction of the spell heading inventory from the pinned SRD 5.1 PDF.
Requires pypdf. No downloads, database access or copyrighted non-SRD source imports.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from pypdf import PdfReader

parser=argparse.ArgumentParser()
parser.add_argument('pdf',type=Path)
parser.add_argument('--output',type=Path)
args=parser.parse_args()
expected='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=expected:
    raise SystemExit('Source hash differs: this audit supports only the checked SRD 5.1 PDF.')
reader=PdfReader(args.pdf)
entries=[]
page_text={}
for index in range(113,193):
    lines={}
    def visit(text,cm,tm,font,size):
        if font and 'GillSans-SemiBold' in str(font.get('/BaseFont')) and abs(tm[0]*size-12)<.1 and text.strip():
            # Some titles are split across separate PDF text runs. Merge on baseline and column.
            key=(round(tm[5],1),0 if tm[4]<300 else 1)
            lines.setdefault(key,[]).append((tm[4],text))
    page_text[index+1]=reader.pages[index].extract_text(visitor_text=visit)
    for (y,column),pieces in sorted(lines.items(),key=lambda item:(item[0][1],-item[0][0])):
        name=re.sub(r'\s+',' ',''.join(t for x,t in sorted(pieces))).strip()
        slug=re.sub(r'[^a-z0-9]+','-',name.lower().replace('’','').replace("'",'')).strip('-')
        entries.append({'id':'srd51:2014:spell:'+slug,'nameEn':name,'page':index+1})
normalize=lambda text:re.sub(r'\s+',' ',text).replace('’',"'")
schools='abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation'
for entry in entries:
    pattern=re.escape(normalize(entry['nameEn']))+r'\s+(?:([1-9])(?:st|nd|rd|th)\W*level\s+('+schools+r')|('+schools+r')\s+cantrip)'
    match=re.search(pattern,normalize(page_text[entry['page']]),re.IGNORECASE)
    if not match:raise SystemExit('Missing level/school metadata: '+entry['nameEn'])
    entry['level']=int(match.group(1)) if match.group(1) else 0
    entry['school']=(match.group(2) or match.group(3)).lower()
class_lists=normalize(' '.join(reader.pages[index].extract_text() for index in range(104,113)))
missing=[entry['nameEn'] for entry in entries if normalize(entry['nameEn']) not in class_lists]
if len(entries)!=319 or len({entry['id'] for entry in entries})!=319 or missing:
    raise SystemExit('Inventory cross-check failed: '+repr(missing))
result={'schemaVersion':1,'ruleset':'5e-2014','scope':'SRD 5.1 spell headings, pages 114–193 (final description continues on page 194); not all D&D publications','sourceUrl':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sourceSha256':expected,'extractionVersion':2,'count':319,'crossCheck':'All 319 unique headings also occur in class spell lists on pages 105–113; apostrophes normalized.','entries':entries}
text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
if args.output:args.output.write_text(text,encoding='utf-8')
else:print(text,end='')
