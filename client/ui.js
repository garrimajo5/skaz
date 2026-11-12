// Shared entry structure. Text fields are escaped here; HTML slots are generated
// only by the caller's trusted templates, never passed through from imported data.
const SkazUI = (()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function entryRow({entry,name,metadata='',badge='',description='',extra='',actions='',className='',detailsClass='',primary=null,preview=''}){
  if(primary){
   if(!['data-personal-spell','data-catalog-entry'].includes(primary.attribute))throw new Error('Unsupported row action');
   return `<article class="entry-row ${escape(className)}"><button class="entry-primary" ${primary.attribute}="${escape(primary.value)}" aria-label="Открыть: ${escape(name?.ru)}">${entry&&typeof SkazArt!=='undefined'?SkazArt.markup(entry):''}<span class="entry-name"><strong>${escape(name?.ru)}</strong><small>${escape(name?.en)}</small></span><span class="entry-metadata">${metadata}</span>${badge?`<span class="entry-badge">${escape(badge)}</span>`:''}${preview}</button></article>`;
  }
  return `<article class="entry-row ${escape(className)}"><details class="entry-description ${escape(detailsClass)}"><summary>${entry&&typeof SkazArt!=='undefined'?SkazArt.markup(entry):''}<span class="entry-name"><strong>${escape(name?.ru)}</strong><small>${escape(name?.en)}</small></span><span class="entry-metadata">${metadata}</span>${badge?`<span class="entry-badge">${escape(badge)}</span>`:''}</summary><div class="entry-expanded"><p class="session-text">${escape(description||'Сохранена справочная ссылка; описание не импортировано.')}</p>${extra}</div></details><div class="entry-actions">${actions}</div></article>`;
 }
 return {entryRow};
})();
