// Read-only DOM audit. Run only on a synthetic game: labels appear in its report.
// Exposed gradients/images, unknown filters and blend modes need manual review.
// Numeric brightness() and ancestor opacity are included in flat compositing.
function auditSkazTheme(){
 const rgba=value=>{if(value==='transparent')return [0,0,0,0];let m=value.match(/^rgba?\(([^)]+)\)$/);if(m){const n=m[1].replaceAll(',',' ').replace('/',' ').trim().split(/\s+/).map(Number);return [n[0],n[1],n[2],n[3]??1];}m=value.match(/^color\(srgb\s+([^)]+)\)$/);if(m){const n=m[1].replace('/',' ').trim().split(/\s+/).map(Number);return [n[0]*255,n[1]*255,n[2]*255,n[3]??1];}throw Error('Unsupported color '+value);};
 const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [0,1,2].map(i=>alpha?(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha:0).concat(alpha);};
 const lum=a=>a.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 function visible(e){if(!e.getClientRects().length)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}return true;}
 function paint(e,color){const manual=[];let result=color;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);const bright=s.filter.match(/^brightness\(([0-9.]+)\)$/);if((s.backgroundImage!=='none'&&result[3]<1)||(s.filter!=='none'&&!bright)||s.mixBlendMode!=='normal')manual.push(n.tagName+'.'+n.className);result=over(result,rgba(s.backgroundColor));if(bright)for(let i=0;i<3;i++)result[i]=Math.min(255,result[i]*Number(bright[1]));result[3]*=Number(s.opacity);}return {color:over(result,[255,255,255,1]),manual};}
 const rows=[],scope=document.querySelector('dialog[open]')||document.body;
 for(const e of scope.querySelectorAll('*')){
  if(!visible(e)||['SCRIPT','STYLE','OPTION'].includes(e.tagName))continue;
  const s=getComputedStyle(e),label=[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).filter(Boolean).join(' ')||(['INPUT','TEXTAREA','SELECT'].includes(e.tagName)?e.getAttribute('aria-label')||e.placeholder||e.tagName:'');
  if(!label)continue;
  try{const fg=paint(e,rgba(s.color)),bg=paint(e,[0,0,0,0]),target=Number(s.fontSize.replace('px',''))>=24||(Number(s.fontSize.replace('px',''))>=18.6667&&Number(s.fontWeight)>=700)?3:4.5;
   rows.push({tag:e.tagName,id:e.id,className:e.className,label:label.slice(0,120),color:s.color,background:s.backgroundColor,opacity:s.opacity,fontSize:s.fontSize,fontWeight:s.fontWeight,foreground:fg.color,backdrop:bg.color,target,ratio:Number(ratio(fg.color,bg.color).toFixed(3)),manual:[...new Set([...fg.manual,...bg.manual])],pass:fg.manual.length||bg.manual.length?null:ratio(fg.color,bg.color)>=target});
  }catch(error){rows.push({tag:e.tagName,id:e.id,label:label.slice(0,120),manual:[error.message],pass:null});}
 }
 const fields=[...scope.querySelectorAll('input:not([type=checkbox]):not([type=radio]),textarea,select')].filter(visible).map(e=>{const s=getComputedStyle(e),parent=paint(e.parentElement,[0,0,0,0]),own=paint(e,[0,0,0,0]),border=paint(e,rgba(s.borderTopColor));const edge=ratio(border.color,parent.color),fill=ratio(own.color,parent.color);return {tag:e.tagName,id:e.id,label:e.getAttribute('aria-label')||e.placeholder||e.tagName,border:s.borderTopColor,background:s.backgroundColor,edge:Number(edge.toFixed(3)),fill:Number(fill.toFixed(3)),target:3,borderWidth:s.borderTopWidth,borderStyle:s.borderTopStyle,pass:parent.manual.length||own.manual.length||border.manual.length?null:Math.max(Number.parseFloat(s.borderTopWidth)>0&&!'none hidden'.split(' ').includes(s.borderTopStyle)?edge:1,fill)>=3};});
 const placeholders=[...scope.querySelectorAll('input[placeholder],textarea[placeholder]')].filter(e=>visible(e)&&e.matches(':placeholder-shown')).map(e=>{
  try{const s=getComputedStyle(e,'::placeholder'),color=rgba(s.color);color[3]*=Number(s.opacity);const fg=paint(e,color),bg=paint(e,[0,0,0,0]),manual=[...new Set([...fg.manual,...bg.manual])],value=ratio(fg.color,bg.color);
   // Unsupported pseudo-element effects must not be silently certified.
   if(s.filter&&s.filter!=='none')manual.push('placeholder filter');
   return {id:e.id,label:e.getAttribute('placeholder'),color:s.color,opacity:s.opacity,ratio:Number(value.toFixed(3)),target:4.5,manual,pass:manual.length?null:value>=4.5};
  }catch(error){return {id:e.id,manual:[error.message],pass:null};}
 });
 const active=document.activeElement,s=active?getComputedStyle(active):null;let focus=null;
 if(active){focus={tag:active.tagName,id:active.id,visible:active.matches(':focus-visible'),outline:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset,pass:null};
  if(focus.visible){
   try{const inset=Number(s.outlineOffset.replace('px',''))<0,base=inset?active:active.parentElement,fg=paint(base,rgba(s.outlineColor)),bg=paint(base,[0,0,0,0]),manual=[...new Set([...fg.manual,...bg.manual])];
    // An external outline is painted outside its own background, but shares
    // the element's opacity/filter. Those effects need pixel-level review.
    if(!inset&&(Number(s.opacity)!==1||s.filter!=='none'))manual.push('external outline element effect');
    const value=ratio(fg.color,bg.color),drawn=Number(s.outlineWidth.replace('px',''))>0&&!['none','hidden'].includes(s.outlineStyle);
    Object.assign(focus,{ratio:Number(value.toFixed(3)),target:3,manual,pass:manual.length?null:drawn&&value>=3});
   }catch(error){Object.assign(focus,{manual:[error.message],pass:null});}
  }
 }
 const controls=[...scope.querySelectorAll('button,[role="button"],[aria-selected],[aria-current],input[type="checkbox"],input[type="radio"]')].filter(visible).map(e=>{
  const s=getComputedStyle(e),parent=paint(e.parentElement,[0,0,0,0]),own=paint(e,[0,0,0,0]),border=paint(e,rgba(s.borderTopColor)),manual=[...new Set([...parent.manual,...own.manual,...border.manual])];
  const native=['checkbox','radio'].includes(e.type);if(native)manual.push('native control pixels');
  return {tag:e.tagName,id:e.id,className:e.className,label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,120)||'',disabled:Boolean(e.disabled)||e.getAttribute('aria-disabled')==='true',pressed:e.getAttribute('aria-pressed'),selected:e.getAttribute('aria-selected'),current:e.getAttribute('aria-current'),border:s.borderTopColor,borderWidth:s.borderTopWidth,borderStyle:s.borderTopStyle,background:s.backgroundColor,opacity:s.opacity,edge:Number(ratio(border.color,parent.color).toFixed(3)),fill:Number(ratio(own.color,parent.color).toFixed(3)),manual,classification:'informational: labelled button boundaries may be decorative; selected marker requires explicit review'};
 });
 const resourceMarks=[...scope.querySelectorAll('.tracker-mark')].filter(visible).map(e=>{
  const s=getComputedStyle(e),bg=paint(e.parentElement,[0,0,0,0]),edge=paint(e,rgba(s.borderTopColor)),fill=paint(e,rgba(s.backgroundColor)),manual=[...new Set([...bg.manual,...edge.manual,...fill.manual])];
  const edgeRatio=ratio(edge.color,bg.color),fillRatio=ratio(fill.color,bg.color),drawn=Number.parseFloat(s.borderTopWidth)>0&&!['none','hidden'].includes(s.borderTopStyle),value=Math.max(drawn?edgeRatio:1,fillRatio);
  return {label:e.parentElement?.getAttribute('aria-label')||'',className:e.className,border:s.borderTopColor,background:s.backgroundColor,borderWidth:s.borderTopWidth,borderStyle:s.borderTopStyle,foreground:edge.color,backdrop:bg.color,edge:Number(edgeRatio.toFixed(3)),fill:Number(fillRatio.toFixed(3)),target:3,manual,pass:manual.length?null:value>=3};
 });
 const icons=[...scope.querySelectorAll('svg')].filter(visible).map(e=>{
  const s=getComputedStyle(e),fg=paint(e,rgba(s.color)),bg=paint(e,[0,0,0,0]),manual=[...new Set([...fg.manual,...bg.manual])];
  const shapes=[...e.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')];
  if(!shapes.length||shapes.some(n=>{const t=getComputedStyle(n);return (t.stroke!=='none'&&t.stroke!==s.color)||(t.fill!=='none'&&t.fill!==s.color)||Number(t.opacity)!==1||Number(t.strokeOpacity)!==1||Number(t.fillOpacity)!==1;}))manual.push('icon paint differs from currentColor or empty SVG');
  const value=ratio(fg.color,bg.color);return {label:e.getAttribute('aria-label')||e.parentElement?.getAttribute('aria-label')||'',className:e.getAttribute('class'),color:s.color,foreground:fg.color,backdrop:bg.color,ratio:Number(value.toFixed(3)),target:3,manual,pass:manual.length?null:value>=3};
 });
 return {theme:document.body.dataset.theme,url:location.hash,viewport:{width:innerWidth,height:innerHeight},scope:'Rendered DOM text, shown placeholders and focus outline; flat compositing including ancestor opacity; gradients/filters require manual review; field boundaries; synthetic data only',rows,fields,placeholders,focus,controls,icons,resourceMarks};
}
