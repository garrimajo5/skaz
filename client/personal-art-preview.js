// Prepared personal-art editor. Not loaded by the production shell until the
// game transfer flow can preserve personal files. No network or storage here.
const SkazPersonalArtPreview=(()=>{
 const limit=4*1024*1024;
 function dimensions(bytes){
  const data=new Uint8Array(bytes),signature=[137,80,78,71,13,10,26,10];
  if(data.length<33||data.length>limit||signature.some((v,i)=>data[i]!==v)||String.fromCharCode(...data.slice(12,16))!=='IHDR')throw Error('Выбери PNG размером до 4 МиБ.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),width=view.getUint32(16),height=view.getUint32(20);
  if(view.getUint32(8)!==13||!width||!height||width>2048||height>2048||data[24]!==8||![2,6].includes(data[25])||data[26]||data[27]||data[28])throw Error('Нужен обычный RGB/RGBA PNG до 2048×2048.');
  return {width,height};
 }
 function crop(width,height,zoom=100,horizontal=50,vertical=50){
  if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=2048)||!Number.isFinite(zoom)||zoom<100||zoom>400||![horizontal,vertical].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Неверное кадрирование');
  const size=Math.max(1,Math.floor(Math.min(width,height)*100/zoom));
  return {x:Math.round((width-size)*horizontal/100),y:Math.round((height-size)*vertical/100),size};
 }
 function create(container,{label,onSave}={}){
  if(!container||typeof onSave!=='function')throw Error('Нужен контейнер и обработчик сохранения');
  let image=null,bytes=null,serial=0,closed=false,saving=false;
  const nodes=[],el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
  const section=el('section');section.className='personal-art-preview';
  section.append(el('h2','Личное изображение'),el('p',label||'Только для тебя и выбранного персонажа. Общий каталог не изменится.'));
  const input=el('input');input.type='file';input.accept='image/png';input.style.cssText='min-height:44px;max-width:100%;box-sizing:border-box';input.setAttribute('aria-label','Выбрать PNG');section.append(input);
  section.append(el('p','PNG до 4 МиБ, до 2048×2048. Файл остаётся в этом окне до сохранения.'));
  const status=el('p');status.setAttribute('role','status');
  const controls=el('fieldset');controls.style.minWidth='0';controls.disabled=true;controls.append(el('legend','Кадрирование'));
  const sliders={};
  for(const [name,title,min,max,value] of [['zoom','Масштаб',100,400,100],['horizontal','По горизонтали',0,100,50],['vertical','По вертикали',0,100,50]]){
   const wrap=el('label',title),range=el('input');range.type='range';range.min=min;range.max=max;range.step=1;range.value=value;range.setAttribute('aria-label',title);range.style.minHeight='44px';range.style.width='100%';wrap.append(range);controls.append(wrap);sliders[name]=range;range.addEventListener('input',draw);
  }
  section.append(controls);
  const previews=el('div');previews.style.display='flex';previews.style.flexWrap='wrap';previews.style.gap='12px';
  for(const [theme,bg,fg] of [['Полярис','#17263a','#edf4fc'],['Уголь','#1d2220','#eeeee5'],['Атлас','#faf8f0','#263f38']]){
   const panel=el('div');panel.style.cssText=`background:${bg};color:${fg};padding:12px;border-radius:12px`;panel.append(el('p',theme));
   for(const [size,circle] of [[96,false],[32,false],[40,true]]){const canvas=el('canvas');canvas.width=canvas.height=size*2;canvas.style.width=canvas.style.height=size+'px';canvas.style.verticalAlign='middle';canvas.style.marginRight='8px';if(circle)canvas.style.borderRadius='50%';canvas.setAttribute('aria-label',`${theme}: ${size} пикселей${circle?', круг':''}`);nodes.push({canvas,size,circle});panel.append(canvas);}previews.append(panel);
  }
  section.append(previews);
  const save=el('button','Сохранить личное изображение');save.type='button';save.disabled=true;save.style.cssText='min-height:44px;max-width:100%;white-space:normal';section.append(save,status);container.append(section);
  const selectedCrop=()=>crop(image.width,image.height,Number(sliders.zoom.value),Number(sliders.horizontal.value),Number(sliders.vertical.value));
  function draw(){
   if(!image||closed)return;
   const box=selectedCrop();
   for(const {canvas,circle} of nodes){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();if(circle){ctx.beginPath();ctx.arc(canvas.width/2,canvas.height/2,canvas.width/2,0,Math.PI*2);ctx.clip();}ctx.drawImage(image,box.x,box.y,box.size,box.size,0,0,canvas.width,canvas.height);ctx.restore();}
  }
  input.addEventListener('change',async()=>{
   const generation=++serial,file=input.files?.[0];bytes=null;image?.close();image=null;controls.disabled=save.disabled=true;
   for(const {canvas} of nodes)canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
   if(!file)return;
   try{
    if(file.size>limit)throw Error('Выбери PNG размером до 4 МиБ.');
    const loaded=await file.arrayBuffer(),size=dimensions(loaded);
    if(closed||generation!==serial)return;
    const decoded=await createImageBitmap(new Blob([loaded],{type:'image/png'}));
    if(closed||generation!==serial){decoded.close();return;}
    if(decoded.width!==size.width||decoded.height!==size.height){decoded.close();throw Error('Размер изображения не совпадает с PNG.');}
    image=decoded;bytes=loaded;sliders.zoom.value=100;sliders.horizontal.value=sliders.vertical.value=50;controls.disabled=save.disabled=false;status.textContent='Проверь квадрат, миниатюру и круг на трёх темах. Сервер отдельно проверит файл.';draw();
   }catch(error){if(!closed&&generation===serial)status.textContent=error.message||'Не удалось прочитать PNG.';}
  });
  save.addEventListener('click',async()=>{
   if(!bytes||!image||saving||closed)return;
   saving=true;save.disabled=input.disabled=controls.disabled=true;
   try{await onSave({bytes:bytes.slice(0),crop:selectedCrop()});if(!closed)status.textContent='Личное изображение сохранено.';}
   catch(error){if(!closed)status.textContent=error.message||'Не удалось сохранить изображение. Повтори после проверки связи.';}
   finally{saving=false;if(!closed){save.disabled=!bytes;input.disabled=false;controls.disabled=!image;status.scrollIntoView({block:'nearest'});}}
  });
  return {setStatus(message){if(!closed)status.textContent=message;},destroy(){closed=true;serial++;image?.close();image=null;bytes=null;section.remove();}};
 }
 return {dimensions,crop,create};
})();
