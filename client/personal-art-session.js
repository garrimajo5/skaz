// All private UI resources belong to this document's authenticated session.
// Closing the session synchronously drops URLs, files and pending RAM commands.
const SkazPersonalArtSession=(()=>{
 let locked=false;const disposers=new Set();
 function assertOpen(){if(locked)throw Error('Сеанс личных изображений закрыт. Открой приложение заново.');}
 function register(dispose){assertOpen();if(typeof dispose!=='function')throw Error('Нужна очистка личного компонента.');disposers.add(dispose);return ()=>disposers.delete(dispose);}
 function lock(){
  if(locked)return;locked=true;const current=[...disposers];disposers.clear();
  // A failing component must not retain another component's private image.
  for(const dispose of current)try{dispose();}catch{}
 }
 if(typeof window!=='undefined')window.addEventListener('pagehide',lock,{once:true});
 return {assertOpen,register,lock};
})();
