// Private image delivery has no CacheStorage/localStorage and no shared URL.
const SkazPersonalArtView=(()=>{
 let current='',generation=0,closed=false;const active=new Set(),waiting=[];let running=0;
 const scope=()=>typeof SkazStorage==='undefined'?null:SkazStorage.personalArtReadScope?.();
 const key=value=>value?JSON.stringify([value.identity,value.characterId,value.viewId]):'';
 function invalidate(){generation++;for(const transport of active)transport.destroy();active.clear();if(typeof SkazArt!=='undefined')SkazArt.refreshPrivate();}
 function sync(){const next=key(scope());if(next!==current){current=next;invalidate();}}
 async function read(catalogId,role){
  sync();const captured=scope(),version=generation;if(closed||!captured)return null;
  if(running>=4)await new Promise(resolve=>waiting.push(resolve));else running++;
  const release=()=>{if(waiting.length)waiting.shift()();else running--;};
  if(closed||version!==generation||key(scope())!==key(captured)){release();throw Error('Область изображения изменилась.');}
  const transport=SkazPersonalArtTransport.create({...captured,catalogId});active.add(transport);
  try{const value=await transport.snapshot({characterId:captured.characterId,catalogId},role==='thumbnail'?'thumbnail':'master');if(closed||version!==generation||key(scope())!==key(captured))throw Error('Область изображения изменилась.');return value.standard?null:value.blob;}
  finally{active.delete(transport);transport.destroy();release();}
 }
 function lock(){closed=true;invalidate();while(waiting.length)waiting.shift()();}
 if(typeof SkazPersonalArtSession!=='undefined')SkazPersonalArtSession.register(lock);
 return {read,sync,invalidate,lock};
})();