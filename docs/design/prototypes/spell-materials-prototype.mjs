import {materialView,escapeMaterialHtml as esc} from './material-view.mjs';
let examples=[],opener=null;
const cards=document.querySelector('#cards'),dialog=document.querySelector('#details');
function render(){
 const q=document.querySelector('#search').value.trim().toLocaleLowerCase('ru'),filter=document.querySelector('#filter').value;
 const shown=examples.filter(e=>(filter==='all'||(e.materials?.consumption.kind||'unknown')===filter)&&`${e.name.ru} ${e.name.en}`.toLocaleLowerCase('ru').includes(q));
 cards.innerHTML=shown.map((e,index)=>{const v=materialView(e.materials);return `<article class="catalog-tile"><button class="catalog-tile-open" data-id="${esc(e.id)}" aria-label="Материалы: ${esc(e.name.ru)}" aria-describedby="material-status-${index} material-summary-${index}"><span class="catalog-tile-top"><span class="catalog-tile-level">${e.level} круг</span><span class="material-badge" id="material-status-${index}">${esc(v.badge)}</span></span><span class="catalog-tile-heading">${e.art?`<img src="/${esc(e.art)}" alt="" width="88" height="88" loading="lazy" onerror="this.style.visibility='hidden'">`:''}<span><strong>${esc(e.name.ru)}</strong><small>${esc(e.name.en)}</small></span></span><span class="material-lines" id="material-summary-${index}"><span><small>Стоимость материалов</small>${esc(v.price)}</span><span><small>Расход</small>${esc(v.consumption)}</span></span><span class="catalog-tile-read">Материалы и условия →</span></button></article>`;}).join('');
 document.querySelector('#status').textContent=shown.length?`Показано ${shown.length} из ${examples.length}`:'Ничего не найдено. Измените поиск или выберите все варианты расхода.';
}
cards.addEventListener('click',event=>{
 const button=event.target.closest('[data-id]');if(!button)return;const e=examples.find(e=>e.id===button.dataset.id);if(!e)return;const v=materialView(e.materials);opener=button;
 document.querySelector('#detail-body').innerHTML=`<h2 id="detail-title">${esc(e.name.ru)}</h2><p>${esc(v.description)}</p><dl><dt>Стоимость материалов</dt><dd>${esc(v.price)}</dd><dt>Расход</dt><dd>${esc(v.consumption)}</dd></dl><p>${esc(v.note)}</p><p>Это справочные условия. Наличие компонентов не проверяется, вещи не списываются, действия героя не блокируются.</p><p>${e.pages?`SRD 5.1, стр. ${esc(e.pages.join(', '))}. <a href="https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=${e.pages[0]}" target="_blank" rel="noopener noreferrer">Открыть источник</a>`:'Материальные условия этой записи ещё не проверены.'}</p><small>Редакция 2014. Русское изложение СКАЗ; не официальный перевод. SRD 5.1 © Wizards of the Coast LLC, CC BY 4.0.</small>`;
 dialog.showModal();document.querySelector('#close').focus();
});
document.querySelector('#close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>opener?.isConnected&&opener.focus({preventScroll:true}));
document.querySelector('#theme').addEventListener('change',e=>document.body.dataset.theme=e.target.value);
document.querySelector('#search').addEventListener('input',render);document.querySelector('#filter').addEventListener('change',render);
try{const response=await fetch('/examples.json');if(!response.ok)throw new Error('load');examples=await response.json();render();}catch{document.querySelector('#status').textContent='Не удалось загрузить примеры. Перезагрузите страницу.';}
