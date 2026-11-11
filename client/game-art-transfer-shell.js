// Gated integration with settings; resources never outlive the visible dialog.
const SkazGameArtTransferShell=(()=>{
 const mounted=new Set();
 const scope=()=>SkazStorage.personalTransferScope?.();
 const same=(a,b)=>a&&b&&a.identity===b.identity&&a.viewId===b.viewId&&a.characterId===b.characterId&&a.allowImport===b.allowImport;
 function sweep(){for(const item of mounted)if(!item.host.isConnected||!document.getElementById('dialog')?.open||!same(item.scope,scope()))item.destroy();}
 function mount(host){
  const captured=scope();if(!host||!captured)return null;
  const transport=SkazGameArtTransfer.create(captured);let panel,closed=false,unregister;
  const item={host,scope:captured,destroy(){if(closed)return;closed=true;mounted.delete(item);unregister?.();panel?.destroy();}};
  try{panel=SkazGameArtTransferPanel.create(host,{transport,allowImport:captured.allowImport,onImported:async()=>{item.destroy();await SkazStorage.reloadAfterArtTransfer();}});}catch(error){transport.destroy();throw error;}
  mounted.add(item);unregister=SkazPersonalArtSession.register(item.destroy);return item;
 }
 if(typeof MutationObserver!=='undefined')new MutationObserver(sweep).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 return {mount,sweep};
})();
