"""Build original synthetic sheet fragments; no personal inputs, network or OCR."""
from pathlib import Path
import hashlib, json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/design/fixtures/sheet-visual'
OUT.mkdir(parents=True,exist_ok=True)
FONT=Path(os.environ.get('SKAZ_FIXTURE_FONT', 'C:/Windows/Fonts/arial.ttf' if os.name=='nt' else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sheet',str(FONT)))
W,H=1240,1754
font=ImageFont.truetype(str(FONT),30)
small=ImageFont.truetype(str(FONT),22)
heading=ImageFont.truetype(str(FONT),44)
semantic=json.loads((ROOT/'docs/design/fixtures/sheet-review-cases.json').read_text(encoding='utf-8-sig'))
manifest={'schemaVersion':1,'synthetic':True,'status':'original-visual-design-samples-not-ocr-benchmark','ruleset':'5e-2014','generator':'scripts/build-sheet-visual-fixtures.py','generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'semanticSourceSha256':hashlib.sha256((ROOT/'docs/design/fixtures/sheet-review-cases.json').read_bytes()).hexdigest(),'fontSha256':hashlib.sha256(FONT.read_bytes()).hexdigest(),'regionCoordinates':'Canonical upright PNG pixels; resolve EXIF orientation before applying any manual rotation. PDF uses proportional A4 coordinates.','sourceLicense':'Original project QA layouts; no external sheet or personal data copied','cases':[]}

layouts={
'single-class': [('name','Имя','Лира'),('classes','Класс и уровень','Бард 5'),('abilities.str','Сила','8'),('abilities.dex','Ловкость','14'),('abilities.con','Телосложение','12'),('abilities.int','Интеллект','10'),('abilities.wis','Мудрость','13'),('abilities.cha','Харизма','16'),('hp.max','Максимум хитов','33'),('hp.current','Текущие хиты','21'),('hp.temp','Временные хиты','0')],
'multiclass-pact':[('name','Имя','Кей'),('classes','Классы','Волшебник 3 / Колдун 2'),('totalLevel','Общий уровень','5'),('resourceGroups.0','Spellcasting','1: 4     2: 2'),('resourceGroups.1','Pact Magic','1: 2')],
'unknown-hp':[('name','Имя','Рин'),('hp.max','Максимум хитов','27'),('hp.current','Текущие хиты',''),('hp.temp','Временные хиты','0')],
'ambiguous-dex':[('name','Имя','Арно'),('dex','Ловкость','13'),('printedModifier','Модификатор','+1')],
'unknown-spell':[('spellCandidates.0','Заклинание','Healing Word'),('spellCandidates.1','Дополнительная запись','The Moon Door')],
'proficiency-mark':[('acrobaticsProficient','Акробатика','+2'),('stealthProficient','Скрытность','+4'),('perceptionProficient','Восприятие','+3')],
'zero-charges':[('charges','Заряды жезла','0 / 7'),('quantity','Количество зелий','')],
'same-name':[('name','Имя','Лира'),('classes','Класс и уровень','Воин 2')],
'unsupported-2024':[('ruleset','Редакция','D&D 2024 Character Sheet'),('feature','Умение','Weapon Mastery')]
}

def sheet(case,rows,page=1):
 im=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(im)
 title='ЛИСТ ПЕРСОНАЖА / 2014' if case!='unsupported-2024' else 'CHARACTER SHEET / 2024'
 d.text((70,65),title,font=heading,fill='#18232a')
 d.text((70,130),'Вымышленный образец для сверки полей',font=small,fill='#52616b')
 regions=[];texts=[(70,65,title,44),(70,130,'Вымышленный образец для сверки полей',22)]
 for i,(key,label,value) in enumerate(rows):
  y=210+i*116
  if y+100>H-130: raise ValueError('Too many rows')
  d.rectangle((70,y,W-70,y+100),outline='#53636b',width=2)
  d.text((90,y+12),label,font=small,fill='#34434b')
  vx=560 if case!='proficiency-mark' else 610
  if d.textbbox((0,0),value,font=font)[2]>W-90-vx:raise ValueError('Value clips: '+value)
  d.text((vx,y+37),value,font=font,fill='#101820')
  regions.append({'field':key,'page':page,'box':[vx,y+30,W-90-vx,60],'blank':value==''})
  texts.extend([(90,y+12,label,22),(vx,y+37,value,30)])
  if case=='proficiency-mark':
   box=(550,y+40,580,y+70);d.ellipse(box,outline='black',width=2)
   if i==1:d.ellipse(box,fill='black')
   if i==2:
    d.ellipse((550,y+40,570,y+70),fill='#8a8a8a')
    region=im.crop((540,y+30,590,y+80)).filter(ImageFilter.GaussianBlur(5));im.paste(region,(540,y+30))
   regions[-1]['box']=[540,y+30,90,60]
  if case=='ambiguous-dex' and key=='dex':
   # Visually ambiguous digit: overlay and blur, not printed instructions/candidates.
   overlay=Image.new('RGB',(100,70),'white');od=ImageDraw.Draw(overlay)
   od.text((5,5),'13',font=font,fill='#777777');od.text((7,6),'18',font=font,fill='#999999')
   im.paste(overlay.filter(ImageFilter.GaussianBlur(2.2)),(vx,y+30))
  if case=='unknown-spell' and i==1:
   # Simulated slanted annotation; deliberately not called actual handwriting.
   tile=Image.new('RGBA',(500,70),(255,255,255,0));ImageDraw.Draw(tile).text((5,10),value,font=font,fill='black')
   im.paste('white',(vx,y+30,W-90,y+98));tile=tile.rotate(3,resample=Image.Resampling.BICUBIC);im.paste(tile,(vx,y+25),tile)
 footer=f'SYNTHETIC QA - NOT A REAL CHARACTER | {case} | page {page}'
 d.text((70,H-90),footer,font=small,fill='#52616b');texts.append((70,H-90,footer,22))
 return im,regions,texts

def info(path,kind,**extra):
 return {'file':path.name,'kind':kind,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,**extra}

def text_pdf(path,pages):
 c=canvas.Canvas(str(path),pagesize=(595.28,841.89),invariant=1)
 for rows in pages:
  c.saveState();c.scale(595.28/W,841.89/H)
  c.setStrokeColorRGB(.33,.39,.42);c.setLineWidth(2)
  for i in range((len(rows)-3)//2):c.rect(70,H-(210+i*116)-100,W-140,100)
  for x,y,text,size in rows:
   c.setFont('Sheet',size);c.drawString(x,H-y-size,text)
  c.restoreState();c.showPage()
 c.save()

for semantic_case in semantic['cases']:
 case=semantic_case['id'];entry={'id':case,'expected':semantic_case['expected'],'review':semantic_case['review'],'assets':[],'regions':[]}
 if case=='same-name':entry['context']={'existingCharacterName':'Лира','expectedAction':'new-character-confirmation'}
 if case=='conflicting-pages':
  groups=[[('name','Имя','Лира'),('classLevel','Класс и уровень','Бард 5'),('hpMax','Максимум хитов','33')],[('name','Имя','Лира'),('classLevel','Класс и уровень','Бард 4'),('hpMax','Максимум хитов','27')]]
 else:groups=[layouts[case]]
 pdfpages=[]
 for n,rows in enumerate(groups,1):
  im,regions,texts=sheet(case,rows,n);name=f'{case}-{n}.png';path=OUT/name;im.save(path)
  entry['assets'].append(info(path,'png',width=W,height=H,page=n));entry['regions'].extend(regions);pdfpages.append(texts)
  if case=='single-class':
   pdf=OUT/'single-class-text.pdf';text_pdf(pdf,[texts]);entry['assets'].append(info(pdf,'text-pdf',pages=1))
   pdf=OUT/'single-class-scan.pdf';c=canvas.Canvas(str(pdf),pagesize=(595.28,841.89),invariant=1);c.drawImage(ImageReader(im),0,0,595.28,841.89);c.save();entry['assets'].append(info(pdf,'image-pdf',pages=1))
   stored=im.transpose(Image.Transpose.ROTATE_90)
   jpg=OUT/'single-class-rotated.jpg';stored.save(jpg,quality=90)
   entry['assets'].append(info(jpg,'jpeg-rotated',width=H,height=W,rotationToUprightClockwise=90))
   exif=Image.Exif();exif[0x0112]=6
   jpg=OUT/'single-class-exif6.jpg';stored.save(jpg,quality=90,exif=exif)
   entry['assets'].append(info(jpg,'jpeg-exif',width=H,height=W,page=n,exifOrientation=6,
                               uprightWidth=W,uprightHeight=H,derivedFromSha256=entry['assets'][0]['sha256']))
 if case=='conflicting-pages':
  path=OUT/'conflicting-pages.pdf';text_pdf(path,pdfpages);entry['assets'].append(info(path,'text-pdf',pages=2))
 manifest['cases'].append(entry)

# A second original layout exercises English labels and two-column reading order.
en_rows=[('name','CHARACTER NAME','Lyra'),('classes','CLASS / LEVEL','Bard 5'),('abilities.str','STRENGTH','8'),('abilities.dex','DEXTERITY','14'),('abilities.con','CONSTITUTION','12'),('abilities.int','INTELLIGENCE','10'),('abilities.wis','WISDOM','13'),('abilities.cha','CHARISMA','16'),('hp.max','HIT POINT MAXIMUM','33'),('hp.current','CURRENT HIT POINTS','21'),('hp.temp','TEMPORARY HIT POINTS','0'),('armorClass','ARMOR CLASS','13'),('initiative','INITIATIVE','+2'),('spellSaveDC','SPELL SAVE DC','14')]
en=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(en);pdf=OUT/'english-two-column.pdf';c=canvas.Canvas(str(pdf),pagesize=(595.28,841.89),invariant=1);c.scale(595.28/W,841.89/H)
regions=[]
def both_text(x,y,t,size):
 d.text((x,y),t,font=ImageFont.truetype(str(FONT),size),fill='#18232a');c.setFont('Sheet',size);c.drawString(x,H-y-size,t)
both_text(70,65,'CHARACTER SHEET / 2014',44);both_text(70,130,'Original synthetic QA layout - not an official template',22)
for i,(key,label,value) in enumerate(en_rows):
 x=70+(i%2)*580;y=210+(i//2)*150
 d.rectangle((x,y,x+520,y+125),outline='#53636b',width=2);c.setLineWidth(2);c.rect(x,H-y-125,520,125)
 both_text(x+20,y+15,label,22);both_text(x+20,y+55,value,36)
 regions.append({'field':key,'page':1,'box':[x+15,y+50,490,65],'blank':False})
both_text(70,H-90,'SYNTHETIC QA - NOT A REAL CHARACTER | English layout | page 1',22)
c.save();png=OUT/'english-two-column.png';en.save(png)
expected=json.loads(json.dumps(semantic['cases'][0]['expected']));expected.update({'name':'Lyra','armorClass':13,'initiative':2,'spellSaveDC':14});expected['classes'][0]['name']='Bard'
manifest['extraCases']=[{'id':'english-two-column','expected':expected,'regions':regions,'assets':[info(png,'png',width=W,height=H,page=1),info(pdf,'text-pdf',pages=1)],'review':['English labels and two-column reading order; not proof of a legal complete character build']}]

im=Image.open(OUT/'single-class-1.png');low=im.resize((62,88),Image.Resampling.BILINEAR).resize((W,H),Image.Resampling.NEAREST).filter(ImageFilter.GaussianBlur(2));path=OUT/'insufficient-quality.jpg';low.save(path,quality=20)
manifest['qualityCase']={'id':'insufficient-quality','asset':info(path,'jpeg-degraded',width=W,height=H),'expectedAction':'request-better-source-or-manual-entry','expectedValues':None,'mustNot':'report confident values from semantic fixture without reading the actual asset'}
manifest['coverageLimits']=['Original sparse layouts, not representative of all commercial/official sheets','No real camera photo, handwriting corpus, encryption, corruption or decompression-bomb fixture','No OCR engine has run; expected ambiguity is a UX review requirement','Formats and thresholds await backend/game-designer agreement']
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Generated',sum(len(c['assets']) for c in manifest['cases']+manifest['extraCases'])+1,'assets; semantic benchmark still unapproved')
