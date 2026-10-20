// The server marks authenticated HTML with a verified user ID. The shared/local
// app never enables this adapter. Tokens remain in HttpOnly cookies.
const SkazAccount=(()=>{
 const userId=document.body.dataset.userId;
 if(!userId)return {userId:null,prefix:kind=>kind==='pending'?'skaz-pending-v1:':'skaz-proposal-form-v1:'};
 if(!/^[a-zA-Z0-9-]{8,80}$/.test(userId))throw new Error('Invalid server identity');
 try{const theme=localStorage.getItem('skaz-theme');if(['polar','atlas','coal'].includes(theme))document.body.dataset.theme=theme;}catch{}
 const nativeFetch=window.fetch.bind(window);let locked=false;
 function lock(message='Сеанс изменился. Открой приложение заново, чтобы продолжить.'){
  locked=true;document.body.replaceChildren();
  const box=document.createElement('main');box.className='account-card';
  const title=document.createElement('h1');title.textContent='Сеанс закрыт';
  const text=document.createElement('p');text.textContent=message;
  const button=document.createElement('button');button.textContent='Открыть заново';button.className='primary';button.onclick=()=>location.replace('/');
  box.append(title,text,button);document.body.append(box);button.focus?.();
 }
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  if(locked)throw new Error('Сеанс закрыт');
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  new Headers(options.headers).forEach((value,key)=>headers.set(key,value));headers.set('X-Skaz-Identity',userId);
  const response=await nativeFetch(input,{...options,headers});
  if(response.status===404 && url.pathname==='/api/workspace'){await response.body?.cancel();lock('Доступ к герою изменился. Открой приложение заново, чтобы проверить назначение.');throw new Error('Доступ изменился');}
  if(response.status===401){await response.body?.cancel();lock();throw new Error('Сеанс закрыт');}
  if(locked){await response.body?.cancel();throw new Error('Сеанс закрыт');}
  return response;
 };
 window.addEventListener('pageshow',event=>{if(event.persisted)lock();});
 window.addEventListener('storage',event=>{if(event.key==='skaz-auth-change')lock();});
 document.addEventListener('click',async event=>{
  if(event.target.closest('button')?.id!=='account-logout')return;
  event.preventDefault();lock('Завершаем сеанс…');
  try{
   const r=await nativeFetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1','X-Skaz-Identity':userId},body:'{}',signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new Error('Logout failed');
   try{localStorage.setItem('skaz-auth-change',crypto.randomUUID());}catch{}
   location.replace('/');
  }catch{lock('Не удалось подтвердить выход на сервере. Открой приложение заново и повтори выход; личные данные сейчас скрыты.');}
 });
 return {userId,prefix:kind=>'skaz-user-v1:'+userId+':'+(kind==='pending'?'pending:':'proposal-form:'),lock};
})();
