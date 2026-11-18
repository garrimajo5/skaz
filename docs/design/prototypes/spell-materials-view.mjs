export function materialView(material){
 const price=material?.price;
 const consumption=material?.consumption;
 return {
  description:typeof material?.description==='string'?material.description:'Материальные условия ещё не проверены.',
  price:price?.kind==='stated'&&typeof price.text==='string'?price.text:price?.kind==='not-stated'?'Цена в правиле не указана.':'Стоимость не уточнена.',
  consumption:consumption?.kind&&consumption.kind!=='unknown'&&typeof consumption.text==='string'?consumption.text:'Расход не уточнён.',
  badge:({retained:'Сохраняется',consumed:'Расходуется',partial:'Частичный расход',conditional:'Расход по условию'}[consumption?.kind]||'Нужно уточнить'),
  note:typeof material?.note==='string'?material.note:'Сверьтесь с описанием и источником; отсутствие сведений не запрещает действие.'
 };
}
export const escapeMaterialHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
