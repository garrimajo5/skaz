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
 const fields=[...scope.querySelectorAll('input:not([type=checkbox]):not([type=radio]),textarea,select')].filter(visible).map(e=>{const s=getComputedStyle(e),parent=paint(e.parentElement,[0,0,0,0]),own=paint(e,[0,0,0,0]),border=paint(e,rgba(s.borderTopColor));const edge=ratio(border.color,parent.color),fill=ratio(own.color,parent.color);return {tag:e.tagName,id:e.id,label:e.getAttribute('aria-label')||e.placeholder||e.tagName,border:s.borderTopColor,background:s.backgroundColor,edge:Number(edge.toFixed(3)),fill:Number(fill.toFixed(3)),target:3,pass:parent.manual.length||own.manual.length||border.manual.length?null:Math.max(edge,fill)>=3};});
 const active=document.activeElement,s=active?getComputedStyle(active):null;
 return {theme:document.body.dataset.theme,url:location.hash,viewport:{width:innerWidth,height:innerHeight},scope:'Rendered DOM text (including scrollable content); flat compositing including ancestor opacity; gradients/filters require manual review; field boundaries; synthetic data only',rows,fields,focus:active?{tag:active.tagName,id:active.id,visible:active.matches(':focus-visible'),outline:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset}:null};
}
