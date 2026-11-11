"""Extract 12 class progression tables from the pinned CC-BY SRD 5.1.
No class prose, subclasses, optional rules or non-SRD classes are imported.
"""
import argparse, hashlib, json, re
from pathlib import Path

SHA256='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
SPECS={
 'barbarian':('Варвар',8,12,None,3,'Rage',0),
 'bard':('Бард',11,8,'cha',3,'Spellcasting',11),
 'cleric':('Жрец',15,8,'wis',1,'Spellcasting',10),
 'druid':('Друид',19,8,'wis',2,'Druidic',10),
 'fighter':('Воин',24,10,None,3,'Fighting Style',0),
 'monk':('Монах',26,8,None,3,'Unarmored Defense',0),
 'paladin':('Паладин',30,10,'cha',3,'Divine Sense',5),
 'ranger':('Следопыт',35,10,'wis',3,'Favored Enemy',6),
 'rogue':('Плут',38,8,None,3,'Expertise',0),
 'sorcerer':('Чародей',42,6,'cha',1,'Spellcasting',11),
 'warlock':('Колдун',46,8,'cha',1,'Otherworldly Patron',5),
 'wizard':('Волшебник',52,6,'int',2,'Spellcasting',10),
}

def clean(text):
 text=re.sub(r'\t\s*\xa0',' ',text)
 text=re.sub(r'System\s+Reference\s+Document\s+5\.1\s+\d+','',text)
 return text.replace('\x8a','—').replace('\u00ad','').replace('‐','-').replace('‑','-').replace('--','-')

def parse_table(text, class_id, columns, end_heading):
 text=clean(text)
 start=text.index('The '+class_id.title())
 end_start=re.search(r'(?m)^20th\s+\+6\b',text[start:])
 if not end_start: raise ValueError('Missing final level: '+class_id)
 final=start+end_start.start()
 end=re.search(r'(?m)^'+re.escape(end_heading)+r'\s*$',text[final:])
 if not end: raise ValueError('Missing table boundary: '+class_id)
 block=text[start:final+end.start()]
 matches=list(re.finditer(r'(?m)^(\d+)(?:st|nd|rd|th)\s+\+(\d)\s+',block))
 if [int(m[1]) for m in matches]!=list(range(1,21)): raise ValueError('Not 20 ordered levels: '+class_id)
 rows=[]
 for i,m in enumerate(matches):
  level=int(m[1]); prof=int(m[2])
  if prof!=2+(level-1)//4: raise ValueError('Proficiency differs')
  body=' '.join(block[m.end():matches[i+1].start() if i<19 else len(block)].split())
  row={'level':level,'proficiency':prof}
  if class_id=='sorcerer':
   first,body=body.split(' ',1);row['sorceryPoints']=0 if first=='—' else int(first)
  if columns:
   parts=body.rsplit(' ',columns)
   if len(parts)!=columns+1: raise ValueError('Missing columns')
   body=parts[0]; cells=[0 if x=='—' else int(re.sub(r'(st|nd|rd|th)$','',x)) for x in parts[1:]]
   if class_id=='warlock':
    row.update(zip(['cantrips','spellsKnown','pactSlots','pactSlotLevel','invocationsKnown'],cells))
   else:
    offset=0
    if class_id in ['bard','cleric','druid','sorcerer','wizard']:row['cantrips']=cells[0];offset+=1
    if class_id in ['bard','sorcerer','ranger']:row['spellsKnown']=cells[offset];offset+=1
    row['spellSlots']=cells[offset:]
  elif class_id=='barbarian':
   body=re.sub(r'^Relentless (4 \+3) Rage$',r'Relentless Rage \1',body)
   body,rages,damage=body.rsplit(' ',2);row['rages']=None if rages=='Unlimited' else int(rages);row['rageDamage']=int(damage)
  elif class_id=='rogue':
   die,body=body.split(' ',1);row['sneakAttack']=die
  elif class_id=='monk':
   m=re.fullmatch(r'(1d\d+) (\d+|—) (—|\+\d+ ft\.) (.+)',body)
   if not m:raise ValueError('Malformed monk row')
   row.update(martialArts=m[1],kiPoints=0 if m[2]=='—' else int(m[2]),unarmoredMovement=0 if m[3]=='—' else int(m[3].split()[0]));body=m[4]
  row['featuresEn']=[] if body=='—' else [x.strip() for x in body.split(',')]
  if any(not x or re.search(r'\s\d+\s+\d+$',x) for x in row['featuresEn']):raise ValueError('Unparsed table cells')
  rows.append(row)
 return rows

def main():
 from pypdf import PdfReader
 parser=argparse.ArgumentParser();parser.add_argument('pdf',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
 if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise SystemExit('Unexpected SRD source hash')
 reader=PdfReader(args.pdf);classes=[]
 for cid,(ru,page,die,ability,subclass,end,columns) in SPECS.items():
  text='\n'.join(p.extract_text() for p in reader.pages[page-1:page+1])
  classes.append({'id':'srd51:2014:class:'+cid,'slug':cid,'name':{'ru':ru,'en':cid.title()},'hitDie':die,'spellcastingAbility':ability,'subclassLevel':subclass,'sourcePage':page,'levels':parse_table(text,cid,columns,end)})
 result={'schemaVersion':1,'ruleset':'5e-2014','scope':'Base class progression tables only. Feature descriptions, subclasses and choices are not complete. Artificer is outside SRD 5.1.','source':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SHA256,'usage':'cc-by-4.0','attribution':'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.','changes':'Tables extracted and structured; Russian class names added. No official translation claimed.'},'classes':classes}
 args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('12 classes / 240 levels extracted')
if __name__=='__main__':main()
