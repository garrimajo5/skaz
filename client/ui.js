// Shared entry structure. Text fields are escaped here; HTML slots are generated
// only by the caller's trusted templates, never passed through from imported data.
const SkazUI = (()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function entryRow({entry,name,metadata='',badge='',description='',extra='',actions='',className='',detailsClass=''}){
  return `<article class="entry-row ${escape(className)}"><details class="entry-description ${escape(detailsClass)}"><summary>${entry&&typeof SkazArt!=='undefined'?SkazArt.markup(entry):''}<span class="entry-name"><strong>${escape(name?.ru)}</strong><small>${escape(name?.en)}</small></span><span class="entry-metadata">${metadata}</span>${badge?`<span class="entry-badge">${escape(badge)}</span>`:''}</summary><div class="entry-expanded"><p class="session-text">${escape(description||'Сохранена справочная ссылка; описание не импортировано.')}</p>${extra}</div></details><div class="entry-actions">${actions}</div></article>`;
 }
 return {entryRow};
})();
