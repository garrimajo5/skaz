// Read-only DOM audit. Run in a rendered browser page; never reads application data stores.
export function auditGameUI(){
 const visible=element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);if(!rect.width||!rect.height||style.visibility==='hidden'||style.display==='none'||element.closest('[hidden],.visually-hidden'))return false;const closed=element.closest('details:not([open])');return !closed||closed.querySelector('summary')?.contains(element);};
 const fonts=[],buttons=[];
 for(const element of document.querySelectorAll('body *')){
  if(!visible(element))continue;
  const label=element.textContent.trim().slice(0,80);
  if([...element.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())){const size=Number(getComputedStyle(element).fontSize.replace('px',''));if(size<12)fonts.push({label,size});}
  if(element.matches('button,[role="button"],summary')){const rect=element.getBoundingClientRect();if(rect.width<43.9||rect.height<43.9)buttons.push({label,width:rect.width,height:rect.height});}
 }
 return {page:document.body.dataset.page,theme:document.body.dataset.theme,width:innerWidth,height:innerHeight,fonts,buttons};
}
