// Shared entry structure. Text fields are escaped here; HTML slots are generated
// only by the caller's trusted templates, never passed through from imported data.
const SkazUI = (()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function entryRow({entry,name,metadata='',badge='',description='',extra='',actions='',className='',detailsClass='',primary=null,preview=''}){
  if(primary){
   if(!['data-personal-spell','data-catalog-entry'].includes(primary.attribute))throw new Error('Unsupported row action');
   return `<article class="entry-row ${escape(className)}"><button class="entry-primary" ${primary.attribute}="${escape(primary.value)}" aria-label="Открыть: ${escape(name?.ru)}">${entry&&typeof SkazArt!=='undefined'?SkazArt.markup(entry):''}<span class="entry-name"><strong>${escape(name?.ru)}</strong><small>${escape(name?.en)}</small></span><span class="entry-metadata">${metadata}</span>${badge?`<span class="entry-badge">${escape(badge)}</span>`:''}${preview}</button></article>`;
  }
  return `<article class="entry-row ${escape(className)}"><details class="entry-description ${escape(detailsClass)}"><summary>${entry&&typeof SkazArt!=='undefined'?SkazArt.markup(entry):''}<span class="entry-name"><strong>${escape(name?.ru)}</strong><small>${escape(name?.en)}</small></span><span class="entry-metadata">${metadata}</span>${badge?`<span class="entry-badge">${escape(badge)}</span>`:''}<span class="ui-inline-icon entry-disclosure-icon" data-ui-icon="chevron-down"></span></summary><div class="entry-expanded"><p class="session-text">${escape(description||'Сохранена справочная ссылка; описание не импортировано.')}</p>${extra}</div></details><div class="entry-actions">${actions}</div></article>`;
 }
 function patchButton(button,next){
  for(const attr of [...button.attributes])if(!next.hasAttribute(attr.name))button.removeAttribute(attr.name);
  for(const attr of next.attributes)if(button.getAttribute(attr.name)!==attr.value)button.setAttribute(attr.name,attr.value);
  if(button.innerHTML!==next.innerHTML)button.innerHTML=next.innerHTML;
 }
  function noticePlacement(top,bottom,start,end,obstacles){
    const gap=8;
    const offsets=obstacles.flatMap(rect=>[rect.top-gap-bottom,rect.bottom+gap-top]);
    return offsets.sort((a,b)=>Math.abs(a)-Math.abs(b)).find(offset=>
      top+offset>=start+gap && bottom+offset<=end-gap &&
      obstacles.every(rect=>bottom+offset<=rect.top-gap || top+offset>=rect.bottom+gap));
  }
 // Try the nearest column first and move vertically only as much as needed.
 function noticeClearance(notice, viewport, obstacles){
  const gap=8, {left,right,top,bottom}=viewport;
  const candidates=[0,...obstacles.flatMap(rect=>[rect.left-gap-notice.right,rect.right+gap-notice.left])]
   .filter(x=>notice.left+x>=left+gap&&notice.right+x<=right-gap)
   .sort((a,b)=>Math.abs(a)-Math.abs(b));
  for(const x of candidates){
   const nearby=obstacles.filter(rect=>rect.left<notice.right+x&&rect.right>notice.left+x);
   const clear=y=>nearby.every(rect=>rect.bottom<=notice.top+y||rect.top>=notice.bottom+y);
   if(notice.top>=top&&notice.bottom<=bottom&&clear(0))return [x,0];
   const y=noticePlacement(notice.top,notice.bottom,top,bottom,nearby);
   if(y!==undefined)return [x,y];
   const min=top+gap-notice.top,max=bottom-gap-notice.bottom;
   if(min<=max){
    const edge=Math.min(max,Math.max(min,0));
    if(clear(edge))return [x,edge];
   }
  }
 }
 return {entryRow,patchButton,noticePlacement,noticeClearance};
})();
