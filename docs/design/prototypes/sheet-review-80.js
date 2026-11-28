// @ts-check
'use strict';

/** Numeric input is text until reviewed: blank is not zero, null is explicit unknown.
 * @typedef {{key: string, label: string, value: number|null, min?: number, max?: number|null, sourceField?: string, hint?: string}} FieldDefinition
 * @typedef {{total: number|null, expended: number|null}} SlotEvidence
 * @typedef {{operation: 'total-minus-expended', total: number, expended: number}} SlotDerivation
 * @typedef {FieldDefinition & {derivation: SlotDerivation|null, input: HTMLInputElement, status: HTMLParagraphElement, unknownBox: HTMLInputElement, agreement: HTMLLabelElement, agreementBox: HTMLInputElement, changed: boolean, edited: boolean, leaveUnknown: boolean, agreedValue: string|null, valid?: boolean}} ReviewField
 * @typedef {{kind: string, page: number, file: string}} PageAsset
 * @typedef {{field: string, page: number, box: [number, number, number, number]}} SourceRegion
 * @typedef {{id: string, assets: PageAsset[], regions: SourceRegion[], sourceReview?: 'labels-outside-frame', unassignedTokens?: string[], slotEvidence?: SlotEvidence}} Scenario
 * @typedef {{cases: Scenario[], extraCases?: Scenario[]}} Manifest
 * @typedef {{fieldId: string, value: number, selection: 'confirmed', provenance: 'ocr-confirmed'} | {fieldId: string, value: number, selection: 'corrected', provenance: 'manual-correction'} | {fieldId: string, value: null, selection: 'left-unknown', provenance: 'manual-unknown'} | {fieldId: string, value: number, selection: 'confirmed', provenance: 'derived-confirmed', derivation: SlotDerivation}} ConfirmedField
 * @typedef {{rowId: string, name: string, source: 'wizard'|'warlock'|null, location: 'book'|'prepared'|'known'|null}} SpellReviewRow
 * @typedef {{fieldId: 'spells', value: null, selection: 'left-unknown', provenance: 'manual-unknown'} | {fieldId: 'spells', value: {coverage: 'partial'|'complete', rows: SpellReviewRow[]}, selection: 'corrected', provenance: 'manual-correction'}} SpellListSelection
 * @typedef {{readonly values: ReadonlyArray<Readonly<ConfirmedField>>, readonly spells?: SpellListSelection}} ReviewConfirmation
 * @typedef {{kind: 'unknown'|'invalid'|'overflow'|'equal'|'mismatch', fingerprint: string, text: string, sum?: number, total?: number}} ClassComparison
 */

/** Check DOM bindings once. An ID with the wrong element type fails explicitly.
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function element(id, type) {
 const node = document.getElementById(id);
 if (!(node instanceof type)) throw new Error('Missing/wrong review element: ' + id);
 return node;
}
const nodes = {
 scenario: element('scenario', HTMLSelectElement), theme: element('theme', HTMLSelectElement),
 page: element('page', HTMLSelectElement), 'fragment-page': element('fragment-page', HTMLSelectElement),
 confirmed: element('confirmed', HTMLInputElement), 'class-agreement': element('class-agreement', HTMLInputElement),
 apply: element('apply', HTMLButtonElement), reset: element('reset', HTMLButtonElement),
 source: element('source', HTMLImageElement), crop: element('crop', HTMLCanvasElement),
 fragment: element('fragment', HTMLDialogElement), discard: element('discard', HTMLDialogElement),
 review: element('review', HTMLFormElement), fields: element('fields', HTMLDivElement),
 summary: element('summary', HTMLParagraphElement), result: element('result', HTMLDivElement),
 'class-comparison': element('class-comparison', HTMLElement), 'class-status': element('class-status', HTMLParagraphElement),
 'class-agreement-label': element('class-agreement-label', HTMLLabelElement),
 'crop-status': element('crop-status', HTMLParagraphElement), 'fragment-title': element('fragment-title', HTMLHeadingElement),
 'spell-review': element('spell-review', HTMLElement), 'spell-coverage': element('spell-coverage', HTMLSelectElement),
 'spell-rows': element('spell-rows', HTMLDivElement), 'spell-row-choice': element('spell-row-choice', HTMLSelectElement),
 'spell-row-details': element('spell-row-details', HTMLDivElement), 'spell-row-source': element('spell-row-source', HTMLSelectElement),
 'spell-row-location': element('spell-row-location', HTMLSelectElement), 'spell-review-status': element('spell-review-status', HTMLParagraphElement),
};
/** @template {keyof typeof nodes} K @param {K} id @returns {(typeof nodes)[K]} */
const $ = id => nodes[id];
/** @type {Manifest} */
let manifest = {cases: []};
/** @type {Scenario} */
let current = {id: '', assets: [], regions: []};
/** @type {ReviewField[]} */
let fields = [];
/** @type {ReviewField|null} */
let selectedField = null;
/** A snapshot of reviewed values, never permission to accept future input.
 * @type {ReviewConfirmation|null} */
let confirmation = null;
let cropRequest = 0;
/** @type {string|null} */
let pendingScenario = null;
/** @type {string|null} */
let classAgreement = null;
let spellsDirty = false;
const spellListControls = /** @type {const} */ (['spell-coverage','spell-row-choice','spell-row-source','spell-row-location']);
/** @type {Record<string, FieldDefinition[]>} */
const definitions={
 'unknown-hp':[{key:'hp.max',label:'Максимум хитов',value:27,min:1,max:999},{key:'hp.current',label:'Текущие хиты',value:null,max:27},{key:'hp.temp',label:'Временные хиты',value:0,max:9999}],
 'cropped-hp':[
  {key:'hp.max',label:'Максимум хитов',value:null,min:1,max:999,hint:'На снимке остались числа, а подписи к ним срезаны.'},
  {key:'hp.current',label:'Текущие хиты',value:null,max:999},
  {key:'hp.temp',label:'Временные хиты',value:null,max:9999},
 ],
 'ambiguous-dex':[{key:'dex',label:'Ловкость',value:null,min:1,max:30,hint:'На исходнике число неоднозначно. Модификатор +1 не выбирает значение за вас.'}],
 'zero-charges':[{key:'charges',label:'Осталось зарядов из 7',value:0,max:7},{key:'quantity',label:'Количество зелий',value:null,max:999}],
 'multiclass-pact':[{key:'level.wizard',sourceField:'classes',label:'Волшебник — уровень',value:3,min:1,max:20},{key:'level.warlock',sourceField:'classes',label:'Колдун — уровень',value:2,min:1,max:20},{key:'totalLevel',label:'Общий уровень — ручной итог',value:5,min:1,max:20},{key:'spellcasting.1',sourceField:'resourceGroups.0',label:'Spellcasting — ячеек 1-го круга',value:4},{key:'spellcasting.2',sourceField:'resourceGroups.0',label:'Spellcasting — ячеек 2-го круга',value:2},{key:'pact.1',sourceField:'resourceGroups.1',label:'Pact Magic — ячеек 1-го круга',value:2}],
 'expended-slots':[{key:'spellcasting.1.remaining',sourceField:'slots.printed',label:'Осталось ячеек 1-го круга',value:null}],
 'conflicting-pages':[{key:'classLevel',label:'Уровень барда',value:null,min:1,max:20,hint:'Страница 1: 5. Страница 2: 4. Уточните актуальное значение.'},{key:'hpMax',label:'Максимум хитов',value:null,min:1,max:999,hint:'Страница 1: 33. Страница 2: 27. Ни одна страница не выбирается автоматически.'}]
};
/** @param {SlotEvidence} evidence @returns {SlotDerivation|null} */
function slotDerivation({total,expended}){
 if(typeof total!=='number'||typeof expended!=='number'||!Number.isSafeInteger(total)||
  !Number.isSafeInteger(expended)||expended<0||total<expended)return null;
 return {operation:'total-minus-expended',total,expended};
}
/** @param {SlotEvidence} evidence */
function printedSlots(evidence){return 'Всего '+(evidence.total??'неизвестно')+' (SLOTS TOTAL), потрачено '+(evidence.expended??'неизвестно')+' (SLOTS EXPENDED).';}
/** @param {ReviewField} field @param {SlotEvidence} evidence */
function slotSource(field,evidence){
 const region=document.createElement('div');
 const printed=document.createElement('p');
 printed.textContent=printedSlots(evidence);
 const candidate=slotDerivation(evidence);
 const status=document.createElement('p');
 region.append(printed,status);
 if(!candidate){
  status.textContent='Остаток требует сверки. Введите его вручную или оставьте неизвестным.';
  return region;
 }
 const remaining=candidate.total-candidate.expended;
 status.textContent='Предложенный остаток: '+candidate.total+' − '+candidate.expended+' = '+remaining+'.';
 const choose=document.createElement('button');
 choose.id='use-slot-remainder';
 choose.type='button';
 choose.textContent='Подставить остаток '+remaining;
 choose.onclick=()=>{
  field.input.value=String(remaining);
  field.leaveUnknown=false;
  field.derivation=candidate;
  changed(field);
  field.input.focus();
 };
 region.append(choose);
 return region;
}
/** @param {HTMLSelectElement} select */
function options(select){select.replaceChildren();const pages=current.assets.filter(a=>a.kind==='png');for(const a of pages){const o=document.createElement('option');o.value=String(a.page);o.textContent='Страница '+a.page;select.append(o);}}
/** @param {string} raw @param {number} min @param {number|null|undefined} max */
function reviewValue(raw,min,max){
 const n=Number(raw),valid=/^\d+$/.test(raw)&&Number.isSafeInteger(n);
 return {valid,warning:valid&&(n<min||(typeof max==='number'&&Number.isFinite(max)&&n>max))};
}
/** @param {ReviewField} f */
function agreementKey(f){return JSON.stringify([f.input.value.trim(),f.min??0,f.max]);}
/** @param {ReviewField} f */
function agreementApplies(f){return !f.leaveUnknown&&reviewValue(f.input.value.trim(),f.min??0,f.max).warning&&f.agreedValue===agreementKey(f);}
/** Undefined means not ready; explicit unknown is null; a valid entered zero stays zero.
 * @param {ReviewField} f @returns {number|null|undefined} */
function selectedValue(f){
 if(f.leaveUnknown)return null;
 const raw=f.input.value.trim();
 return reviewValue(raw,f.min??0,f.max).valid?Number(raw):undefined;
}
/** @param {ReviewField[]} items @returns {ClassComparison|null} */
function classReviewState(items){
 const selected=['level.wizard','level.warlock','totalLevel'].map(key=>items.find(f=>f.key===key));
 const [wizardField,warlockField,totalField]=selected;
 if(!wizardField||!warlockField||!totalField)return null;
 const complete=[wizardField,warlockField,totalField];
 const fingerprint=JSON.stringify(complete.map(f=>[f.input.value.trim(),f.leaveUnknown===true]));
 if(complete.some(f=>f.leaveUnknown))return {kind:'unknown',fingerprint,text:'Есть неизвестные уровни. Общий уровень не вычислен и не подставлен; ручные значения сохранены.'};
 if(complete.some(f=>!reviewValue(f.input.value.trim(),f.min??0,f.max).valid))return {kind:'invalid',fingerprint,text:'Для сравнения уровней сверите числа или явно оставьте неизвестное.'};
 const [wizard,warlock,total]=complete.map(f=>Number(f.input.value.trim())),sum=wizard+warlock;
 if(!Number.isSafeInteger(sum))return {kind:'overflow',fingerprint,text:'Сумма уровней не вычисляется безопасно. Сохраните ручные значения; автоматический расчёт не выполнен.'};
 return {kind:sum===total?'equal':'mismatch',fingerprint,sum,total,text:sum===total?`Общий уровень ${total} совпадает с суммой ${wizard} + ${warlock}.`:`Предупреждение: сумма уровней ${wizard} + ${warlock} = ${sum}, ручной общий уровень ${total}. Можно подтвердить свой выбор без отметки мастера.`};
}
/** Evaluate the explicit list choice independently of the class and slot totals.
 * @returns {SpellListSelection|undefined}
 */
function selectedSpellList(){
 const fieldId='spells';
 const coverage=$('spell-coverage').value;
 if(coverage==='unknown')return {fieldId,selection:'left-unknown',value:null,provenance:'manual-unknown'};
 if(coverage==='empty')return {fieldId,selection:'corrected',value:{coverage:'complete',rows:[]},provenance:'manual-correction'};
 if(coverage!=='partial'&&coverage!=='complete')return;
 const choice=$('spell-row-choice').value;
 if(choice==='later'&&coverage==='complete')return;
 if(choice!=='later'&&choice!=='exclude'&&choice!=='keep')return;
 /** @type {SpellReviewRow[]} */
 const rows=[{rowId:'example-shield',name:'Щит',source:'wizard',location:'book'}];
 if(choice==='keep'){
  const source=$('spell-row-source').value,location=$('spell-row-location').value;
  if(source!=='unknown'&&source!=='wizard'&&source!=='warlock')return;
  if(location!=='unknown'&&location!=='book'&&location!=='prepared'&&location!=='known')return;
  rows.push({rowId:'example-misty-step',name:'Туманный шаг',source:source==='unknown'?null:source,location:location==='unknown'?null:location});
 }
 return {fieldId,selection:'corrected',value:{coverage,rows},provenance:'manual-correction'};
}
/** @param {SpellListSelection} choice */
function spellListSummary(choice){
 if(choice.value===null)return 'Список заклинаний оставлен неизвестным.';
 if(choice.value.rows.length===0)return 'Подтверждён пустой список заклинаний.';
 const detail=choice.value.coverage==='partial'?' Остальные строки неизвестны.':' Список сверён целиком.';
 return 'Строк заклинаний сверено: '+choice.value.rows.length+'.'+detail;
}
function updateSpellReview(){
 const coverage=$('spell-coverage').value;
 const showRows=coverage==='partial'||coverage==='complete';
 $('spell-rows').hidden=!showRows;
 const rowChoice=$('spell-row-choice').value;
 $('spell-row-details').hidden=!showRows||rowChoice!=='keep';
 const selection=selectedSpellList();
 $('spell-review-status').textContent=selection?spellListSummary(selection):
  coverage==='complete'&&rowChoice==='later'?
   'Есть несверенная строка. Сверьте её или отметьте список как частичный.':
   'Выберите состояние списка и явно отметьте неизвестные данные.';
 return selection!==undefined;
}
function spellListChanged(){
 spellsDirty=true;
 invalidateConfirmation();
 update();
}
function update(){
 const hpMax=fields.find(f=>f.key==='hp.max'),hpCurrent=fields.find(f=>f.key==='hp.current');
 if(hpMax&&hpCurrent){
  const raw=hpMax.input.value.trim();
  hpCurrent.max=!hpMax.leaveUnknown&&reviewValue(raw,hpMax.min??0,hpMax.max).valid?Number(raw):null;
 }
 let missing=0;
 for(const f of fields){
  const raw=f.input.value.trim(),assessment=reviewValue(raw,f.min??0,f.max),unknown=f.leaveUnknown===true,valid=unknown||assessment.valid;
  f.valid=valid;f.input.disabled=unknown;f.input.hidden=unknown;
  if(f.unknownBox)f.unknownBox.checked=unknown;
  if(f.agreedValue&&!agreementApplies(f))f.agreedValue=null;
  if(!valid)missing++;
  f.status.textContent=unknown?'Оставлено неизвестным вами. Это не ноль.':raw===''?'Не указано — введите значение или выберите «Оставить неизвестным»':valid?(f.edited?'Исправлено вами':'Значение из сценария — сверьте'):'Введите неотрицательное целое число без дробной части';
  if(f.derivation&&!unknown&&valid)f.status.textContent='Выбран вычисленный остаток.';
  const warning=!unknown&&assessment.warning;
  if(warning)f.status.textContent='Предупреждение: значение выходит за ожидаемый диапазон '+(f.min??0)+'–'+(f.max??'неизвестно')+'. Можно подтвердить вручную.';
  if(warning&&agreementApplies(f))f.status.textContent='Согласовано с мастером для этого значения. Ожидаемый диапазон: '+(f.min??0)+'–'+f.max+'.';
  if(f.agreement){f.agreement.hidden=!warning;f.agreementBox.checked=warning&&agreementApplies(f);}
  f.status.classList.toggle('invalid',!unknown&&raw!==''&&!valid);
  f.input.setAttribute('aria-invalid',String(!unknown&&raw!==''&&!valid));
 }
 const comparison=$('class-comparison'),state=classReviewState(fields);
 if(comparison){
  comparison.hidden=!state;
  if(state){
   if(classAgreement!==state.fingerprint||state.kind!=='mismatch')classAgreement=null;
   $('class-status').textContent=state.text+(classAgreement?' Согласовано с мастером для этих уровней.':'');
   $('class-agreement-label').hidden=state.kind!=='mismatch';
   $('class-agreement').checked=classAgreement===state.fingerprint;
  }else classAgreement=null;
 }
 const spellReview=$('spell-review');
 if(spellReview&&!spellReview.hidden&&!updateSpellReview())missing++;
 const unknown=fields.filter(f=>f.leaveUnknown).length;
 $('summary').textContent=confirmation?'Сверка подтверждена.':missing?`Нужно уточнить полей: ${missing}`:`Все поля сверены или явно оставлены неизвестными (${unknown}); подтвердите сверку.`;
 $('apply').disabled=fields.length===0||missing>0||!$('confirmed').checked||confirmation!==null;
}
/** Every user edit invalidates the whole confirmation without rebuilding fields or moving focus. */
function invalidateConfirmation(){
 confirmation=null;$('confirmed').checked=false;$('result').hidden=true;
}
/** @param {ReviewField} f */
function changed(f){
 f.agreedValue=null;f.changed=true;invalidateConfirmation();update();
}
/** Only valid, explicitly reviewed choices enter a confirmation snapshot.
 * @returns {ReviewConfirmation|null} */
function reviewedSelection(){
 if(fields.length===0)return null;
 /** @type {ConfirmedField[]} */
 const values=[];
 for(const f of fields){
  const value=selectedValue(f);
  if(value===undefined)return null;
  if(value===null)values.push({fieldId:f.key,value:null,selection:'left-unknown',provenance:'manual-unknown'});
  else if(f.derivation)values.push({fieldId:f.key,value,selection:'confirmed',provenance:'derived-confirmed',derivation:{...f.derivation}});
  else if(f.edited)values.push({fieldId:f.key,value,selection:'corrected',provenance:'manual-correction'});
  else values.push({fieldId:f.key,value,selection:'confirmed',provenance:'ocr-confirmed'});
 }
 const spellReview=$('spell-review');
 if(!spellReview||spellReview.hidden)return {values};
 const spells=selectedSpellList();
 return spells?{values,spells}:null;
}

function load(){
 const next=[...manifest.cases,...(manifest.extraCases??[])].find(c=>c.id===$('scenario').value);
 if(!next||!definitions[next.id])throw new Error('Unknown review scenario');
 current=next;fields=[];classAgreement=null;invalidateConfirmation();$('fields').replaceChildren();
 $('spell-review').hidden=current.id!=='multiclass-pact';
 for(const id of spellListControls)$(id).value='';
 spellsDirty=false;
 options($('page'));options($('fragment-page'));showPage();
 for(const def of definitions[current.id]){
  const wrap=document.createElement('div');wrap.className='field';
  const label=document.createElement('label');label.htmlFor='field-'+def.key;label.textContent=def.label;
  const input=document.createElement('input');input.id=label.htmlFor;input.type='text';input.inputMode='numeric';
  input.value=def.value===null?'':String(def.value);input.autocomplete='off';
  const status=document.createElement('p');status.id=input.id+'-status';status.className='status';
  input.setAttribute('aria-describedby',status.id);
  const unknown=document.createElement('label');unknown.className='choice';
  const unknownBox=document.createElement('input');unknownBox.type='checkbox';
  unknownBox.setAttribute('aria-label','Оставить неизвестным: '+def.label);
  unknown.append(unknownBox,document.createTextNode('Оставить неизвестным'));
  const agreement=document.createElement('label');agreement.className='choice';
  const agreementBox=document.createElement('input');agreementBox.type='checkbox';
  agreement.append(agreementBox,document.createTextNode('Согласовано с мастером (необязательно)'));
  const slotEvidence=def.key==='spellcasting.1.remaining'?current.slotEvidence:undefined;
  /** @type {ReviewField} */
  const f={...def,...(slotEvidence?{max:slotEvidence.total}:{}),derivation:null,input,status,unknownBox,agreement,agreementBox,changed:false,edited:false,leaveUnknown:false,agreedValue:null};
  unknownBox.onchange=()=>{f.leaveUnknown=unknownBox.checked;changed(f);};
  input.oninput=()=>{f.edited=true;f.derivation=null;changed(f);};
  agreementBox.onchange=()=>{f.agreedValue=agreementBox.checked?agreementKey(f):null;f.changed=true;invalidateConfirmation();update();};
  const source=document.createElement('button');source.type='button';source.className='source-button';
  source.textContent='Показать источник: '+f.label;source.onclick=()=>openSource(f);
  if(slotEvidence)wrap.append(slotSource(f,slotEvidence));
  wrap.append(label,input,status);
  if(f.hint){const hint=document.createElement('p');hint.textContent=f.hint;wrap.append(hint);}
  wrap.append(unknown,agreement,source);$('fields').append(wrap);fields.push(f);
 }
 update();
}
function showPage(){
 const asset=current.assets.find(a=>a.kind==='png'&&a.page===Number($('page').value));
 if(!asset)return;
 $('source').src='../fixtures/sheet-visual/'+asset.file;
 $('source').alt=current.sourceReview==='labels-outside-frame'?
  'Вымышленный снимок. Подписи к числам срезаны.':'Вымышленный исходный лист';
}
async function drawCrop(){
 const field=selectedField;
 if(!field)return;
 const token=++cropRequest;
 const page=Number($('fragment-page').value);
 const region=current.regions.find(r=>r.field===(field.sourceField||field.key)&&r.page===page);
 const asset=current.assets.find(a=>a.kind==='png'&&a.page===page);
 const showWhole=!region&&current.sourceReview==='labels-outside-frame';
 const canvas=$('crop'),status=$('crop-status');
 canvas.hidden=true;
 status.textContent='Загружаем фрагмент…';
 if(!asset||(!region&&!showWhole)){
  status.textContent='Для этого поля нет фрагмента на выбранной странице.';
  return;
 }
 try{
  const image=new Image();
  image.src='../fixtures/sheet-visual/'+asset.file;
  await image.decode();
  if(token!==cropRequest)return;
  const [x,y,w,h]=region?[region.box[0]-20,region.box[1]-30,region.box[2]+40,Math.max(100,region.box[3]+40)]:
   [0,0,image.naturalWidth,image.naturalHeight];
  const scale=Math.min(720/w,(region?150:480)/h);
  canvas.width=region?720:Math.ceil(w*scale);
  canvas.height=region?150:Math.ceil(h*scale);
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas unavailable');
  ctx.fillStyle='white';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,x,y,w,h,0,0,w*scale,h*scale);
  canvas.hidden=false;
  if(showWhole){
   const tokens=current.unassignedTokens?.join(', ');
   status.textContent=(tokens?'Видимые числа: '+tokens+'. ':'')+'Подписи срезаны. Поле по этому снимку определить нельзя.';
  }else status.textContent='Источник: страница '+page+(current.slotEvidence?' · '+printedSlots(current.slotEvidence):'');
 }catch{
  if(token===cropRequest)status.textContent='Не удалось показать фрагмент. Закрой его и открой источник ещё раз.';
 }
}
/** @param {ReviewField} f */
function openSource(f){selectedField=f;$('fragment-title').textContent=current.sourceReview==='labels-outside-frame'?'Обрезанный снимок':f.label+' — исходник';$('fragment-page').value=$('page').value;drawCrop();$('fragment').showModal();}
$('fragment-page').onchange=drawCrop;
$('fragment').addEventListener('close',()=>{
 cropRequest++;
 (selectedField?.leaveUnknown?selectedField.unknownBox:selectedField?.input)?.focus();
});
$('theme').onchange=()=>document.body.dataset.theme=$('theme').value;
$('page').onchange=showPage;
/** @param {string} next */
function restart(next){
 if((spellsDirty||fields.some(f=>f.changed))&&!confirmation){
  pendingScenario=next;$('scenario').value=current.id;$('discard').showModal();
 }else{$('scenario').value=next;load();}
}
$('scenario').onchange=()=>restart($('scenario').value);
$('reset').onclick=()=>restart(current.id);
$('discard').addEventListener('submit',event=>{
 // Settle this choice before a deferred close can affect a subsequent dialog.
 const next=pendingScenario;
 pendingScenario=null;
 if(event.submitter instanceof HTMLButtonElement&&event.submitter.value==='discard'&&next!==null){
  $('scenario').value=next;
  load();
 }
});
$('discard').addEventListener('cancel',()=>{pendingScenario=null;});
$('confirmed').onchange=update;
for(const id of spellListControls)$(id).onchange=spellListChanged;
$('class-agreement').onchange=()=>{
 const state=classReviewState(fields);
 classAgreement=$('class-agreement').checked&&state?.kind==='mismatch'?state.fingerprint:null;
 const total=fields.find(f=>f.key==='totalLevel');if(total)total.changed=true;
 invalidateConfirmation();update();
};
$('review').onsubmit=e=>{
 e.preventDefault();update();if($('apply').disabled)return;
 confirmation=reviewedSelection();if(!confirmation)return;
 $('result').textContent='Пример подтверждён. Профиль в СКАЗ не создавался. '+confirmation.values.map((choice,i)=>
  fields[i].label+': '+(choice.value===null?'неизвестно (оставлено вами)':String(choice.value))+
  (choice.provenance==='derived-confirmed'?' (вычислено по общему числу и расходу)':'')+
  (agreementApplies(fields[i])?' (согласовано с мастером)':'')
 ).join('; ')+(classAgreement?' Общий уровень согласован с мастером для выбранных классовых уровней.':'');
 if(confirmation.spells)$('result').textContent+=' '+spellListSummary(confirmation.spells);
 $('result').hidden=false;update();$('result').focus();
};
fetch('../fixtures/sheet-visual/manifest.json').then(r=>{if(!r.ok)throw Error('source unavailable');return r.json();}).then(m=>{manifest=m;load();}).catch(()=>{$('summary').textContent='Не удалось загрузить вымышленные образцы. Обновите страницу; результаты не подставлены.';});
