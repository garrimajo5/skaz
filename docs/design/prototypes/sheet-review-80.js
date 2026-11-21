// @ts-check
'use strict';

/** Numeric input is text until reviewed: blank is not zero, null is explicit unknown.
 * @typedef {{key: string, label: string, value: number|null, min?: number, max?: number|null, sourceField?: string, hint?: string}} FieldDefinition
 * @typedef {FieldDefinition & {input: HTMLInputElement, status: HTMLParagraphElement, unknownBox: HTMLInputElement, agreement: HTMLLabelElement, agreementBox: HTMLInputElement, changed: boolean, edited: boolean, leaveUnknown: boolean, agreedValue: string|null, valid?: boolean}} ReviewField
 * @typedef {{kind: string, page: number, file: string}} PageAsset
 * @typedef {{field: string, page: number, box: [number, number, number, number]}} SourceRegion
 * @typedef {{id: string, assets: PageAsset[], regions: SourceRegion[]}} Scenario
 * @typedef {{cases: Scenario[]}} Manifest
 * @typedef {{fieldId: string, value: number, selection: 'confirmed', provenance: 'ocr-confirmed'} | {fieldId: string, value: number, selection: 'corrected', provenance: 'manual-correction'} | {fieldId: string, value: null, selection: 'left-unknown', provenance: 'manual-unknown'}} ConfirmedField
 * @typedef {{readonly values: ReadonlyArray<Readonly<ConfirmedField>>}} ReviewConfirmation
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
/** @type {Record<string, FieldDefinition[]>} */
const definitions={
 'unknown-hp':[{key:'hp.max',label:'Максимум хитов',value:27,min:1,max:999},{key:'hp.current',label:'Текущие хиты',value:null,max:27},{key:'hp.temp',label:'Временные хиты',value:0,max:9999}],
 'ambiguous-dex':[{key:'dex',label:'Ловкость',value:null,min:1,max:30,hint:'На исходнике число неоднозначно. Модификатор +1 не выбирает значение за вас.'}],
 'zero-charges':[{key:'charges',label:'Осталось зарядов из 7',value:0,max:7},{key:'quantity',label:'Количество зелий',value:null,max:999}],
 'multiclass-pact':[{key:'level.wizard',sourceField:'classes',label:'Волшебник — уровень',value:3,min:1,max:20},{key:'level.warlock',sourceField:'classes',label:'Колдун — уровень',value:2,min:1,max:20},{key:'totalLevel',label:'Общий уровень — ручной итог',value:5,min:1,max:20},{key:'spellcasting.1',sourceField:'resourceGroups.0',label:'Spellcasting — ячеек 1-го круга',value:4},{key:'spellcasting.2',sourceField:'resourceGroups.0',label:'Spellcasting — ячеек 2-го круга',value:2},{key:'pact.1',sourceField:'resourceGroups.1',label:'Pact Magic — ячеек 1-го круга',value:2}],
 'conflicting-pages':[{key:'classLevel',label:'Уровень барда',value:null,min:1,max:20,hint:'Страница 1: 5. Страница 2: 4. Уточните актуальное значение.'},{key:'hpMax',label:'Максимум хитов',value:null,min:1,max:999,hint:'Страница 1: 33. Страница 2: 27. Ни одна страница не выбирается автоматически.'}]
};
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
  f.status.textContent=unknown?'Оставлено неизвестным вами. Это не ноль.':raw===''?'Не указано — введите значение или выберите «Оставить неизвестным»':valid?(f.changed?'Исправлено вами':'Значение из сценария — сверьте'):'Введите неотрицательное целое число без дробной части';
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
 const unknown=fields.filter(f=>f.leaveUnknown).length;
 $('summary').textContent=missing?`Нужно уточнить полей: ${missing}`:`Все поля сверены или явно оставлены неизвестными (${unknown}); подтвердите сверку.`;
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
  else if(f.edited)values.push({fieldId:f.key,value,selection:'corrected',provenance:'manual-correction'});
  else values.push({fieldId:f.key,value,selection:'confirmed',provenance:'ocr-confirmed'});
 }
 return {values};
}

function load(){
 const next=manifest.cases.find(c=>c.id===$('scenario').value);
 if(!next||!definitions[next.id])throw new Error('Unknown review scenario');
 current=next;fields=[];classAgreement=null;invalidateConfirmation();$('fields').replaceChildren();
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
  /** @type {ReviewField} */
  const f={...def,input,status,unknownBox,agreement,agreementBox,changed:false,edited:false,leaveUnknown:false,agreedValue:null};
  unknownBox.onchange=()=>{f.leaveUnknown=unknownBox.checked;changed(f);};
  input.oninput=()=>{f.edited=true;changed(f);};
  agreementBox.onchange=()=>{f.agreedValue=agreementBox.checked?agreementKey(f):null;f.changed=true;invalidateConfirmation();update();};
  const source=document.createElement('button');source.type='button';source.className='source-button';
  source.textContent='Показать источник: '+f.label;source.onclick=()=>openSource(f);
  wrap.append(label,input,status);
  if(f.hint){const hint=document.createElement('p');hint.textContent=f.hint;wrap.append(hint);}
  wrap.append(unknown,agreement,source);$('fields').append(wrap);fields.push(f);
 }
 update();
}
function showPage(){const a=current.assets.find(a=>a.kind==='png'&&a.page===Number($('page').value));if(a)$('source').src='../fixtures/sheet-visual/'+a.file;}
async function drawCrop(){const field=selectedField;if(!field)return;const token=++cropRequest,page=Number($('fragment-page').value),r=current.regions.find(r=>r.field===(field.sourceField||field.key)&&r.page===page),a=current.assets.find(a=>a.kind==='png'&&a.page===page);$('crop').hidden=true;$('crop-status').textContent='Загружаем фрагмент…';if(!r||!a){$('crop-status').textContent='Для этого поля нет фрагмента на выбранной странице.';return;}try{const im=new Image();im.src='../fixtures/sheet-visual/'+a.file;await im.decode();if(token!==cropRequest)return;const ctx=$('crop').getContext('2d');if(!ctx)throw new Error('Canvas unavailable');ctx.fillStyle='white';ctx.fillRect(0,0,720,150);const [valueX,valueY,valueW,valueH]=r.box;const x=valueX-20,y=valueY-30,w=valueW+40,h=100,scale=Math.min(720/w,150/h);ctx.drawImage(im,x,y,w,h,0,0,w*scale,h*scale);$('crop').hidden=false;$('crop-status').textContent='Источник: страница '+page;}catch{if(token===cropRequest)$('crop-status').textContent='Не удалось загрузить фрагмент. Не считайте его пустым полем; откройте источник ещё раз.';}}
/** @param {ReviewField} f */
function openSource(f){selectedField=f;$('fragment-title').textContent=f.label+' — исходник';$('fragment-page').value=$('page').value;drawCrop();$('fragment').showModal();}
$('fragment-page').onchange=drawCrop;
$('fragment').addEventListener('close',()=>{
 cropRequest++;
 (selectedField?.leaveUnknown?selectedField.unknownBox:selectedField?.input)?.focus();
});
$('theme').onchange=()=>document.body.dataset.theme=$('theme').value;
$('page').onchange=showPage;
/** @param {string} next */
function restart(next){
 if(fields.some(f=>f.changed)&&!confirmation){
  pendingScenario=next;$('scenario').value=current.id;$('discard').returnValue='stay';$('discard').showModal();
 }else{$('scenario').value=next;load();}
}
$('scenario').onchange=()=>restart($('scenario').value);
$('reset').onclick=()=>restart(current.id);
$('discard').addEventListener('close',()=>{
 if($('discard').returnValue==='discard'&&pendingScenario!==null){$('scenario').value=pendingScenario;load();}
 pendingScenario=null;
});
$('confirmed').onchange=update;
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
  (agreementApplies(fields[i])?' (согласовано с мастером)':'')
 ).join('; ')+(classAgreement?' Общий уровень согласован с мастером для выбранных классовых уровней.':'');
 $('result').hidden=false;update();$('result').focus();
};
fetch('../fixtures/sheet-visual/manifest.json').then(r=>{if(!r.ok)throw Error('source unavailable');return r.json();}).then(m=>{manifest=m;load();}).catch(()=>{$('summary').textContent='Не удалось загрузить вымышленные образцы. Обновите страницу; результаты не подставлены.';});
