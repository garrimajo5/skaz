"""Read-only PDFium metadata witnesses reusing the selected-witness contract."""
import argparse,hashlib,json,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-selected-rule-witnesses.py'))
FILES=['catalog/extra-life-publication-witnesses-2014.json','catalog/unnumbered-publication-relations-2014.json','catalog/source-rights-evidence-2014.json']
def audit(contract,relations,rights,blobs,pages):
 if contract['scope']!='bibliographic-era-and-permission-witnesses-only' or contract['accepted'] is not False or contract['complete'] is not False or contract['approvedDenominator'] is not None:raise ValueError('Metadata acceptance cannot be promoted')
 expected={'bibliography:one-grung-above':2017,'bibliography:locathah-rising':2019,'bibliography:the-tortle-package':2017}
 observed={r['bibliographyEvidenceId'] for r in relations['relations']}
 if observed!=set(expected) or len(relations['relations'])!=3 or relations['accepted'] is not False:raise ValueError('Changed explicit relation basis')
 if {r['bibliographyEvidenceId']:r['originalEraYear'] for r in contract['observations']}!=expected or len(contract['observations'])!=3 or any(r['fullCharacterRulesVerified'] is not False for r in contract['observations']):raise ValueError('Changed bibliography-era scope')
 boundary=contract['rightsBoundary']
 if boundary['textReusePermission']!='not-established' or boundary['translationReusePermission']!='not-established' or boundary['allWotcBooksCoveredBySrdLicense'] is not False or boundary['findingOfUnlawfulness'] is not False or rights['srd51']['scope']!='SRD 5.1 English document':raise ValueError('Changed rights boundary')
 expected_units={'grung-copyright-era':('grung2017',2),'team-historical-publications':('kwalish2018',1),'locathah-edition-context':('locathah2019',1),'locathah-legal-era-and-permission':('locathah2019',1),'locathah-character-option-reference':('locathah2019',2)}
 if {u['key']:(u['source'],u['pdfPage']) for u in contract['units']}!=expected_units or len(contract['units'])!=5:raise ValueError('Changed metadata unit scope')
 result=shared['audit'](contract,blobs,pages)
 return {**result,'scope':contract['scope'],'accepted':False,'complete':False,'approvedDenominator':None,'fullCharacterRulesVerified':False,'sourceYears':expected,'textReusePermission':'not-established','translationReusePermission':'not-established','interpretationAccepted':False}
def build(directory):
 texts=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in FILES];contract,relations,rights=map(json.loads,texts)
 expected_files={'grung2017':('grung-preview.pdf','223738'),'locathah2019':('locathah-preview.pdf','289261'),'kwalish2018':('kwalish-preview.pdf','258047')}
 if len(contract['sources'])!=3 or {s['id'] for s in contract['sources']}!=set(expected_files):raise ValueError('Changed source selection')
 for s in contract['sources']:
  file,ident=expected_files[s['id']]
  if s['file']!=file or s['url']!='https://d1vzi28wh99zvq.cloudfront.net/pdf_previews/'+ident+'-sample.pdf':raise ValueError('Changed source locator')
 blobs={s['id']:(directory/s['file']).read_bytes() for s in contract['sources']}
 for s in contract['sources']:
  if hashlib.sha256(blobs[s['id']]).hexdigest()!=s['sha256']:raise ValueError('Source hash differs: '+s['id'])
 import pypdfium2 as pdfium
 readers={s['id']:pdfium.PdfDocument(directory/s['file']) for s in contract['sources']};pages={k:['']*len(d) for k,d in readers.items()}
 try:
  for u in contract['units']:
   key,i=u['source'],u['pdfPage']-1
   if not 0<=i<len(pages[key]):raise ValueError('Invalid source page')
   if not pages[key][i]:
    page=readers[key][i];textpage=page.get_textpage()
    try:pages[key][i]=textpage.get_text_range()
    finally:textpage.close();page.close()
  result=audit(contract,relations,rights,blobs,pages)
 finally:
  for d in readers.values():d.close()
 result['inputSha256']={p:hashlib.sha256(t.encode()).hexdigest() for p,t in zip(FILES,texts)};return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path);a=p.parse_args();r=build(a.directory);text=json.dumps(r,ensure_ascii=False,indent=2)+'\n'
 if a.output:shared['write_new_report'](a.output,text)
 else:print(text,end='')
