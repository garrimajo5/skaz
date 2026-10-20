(()=>{
 const form=document.getElementById('login-form'),status=document.getElementById('login-status'),submit=form.querySelector('button');
 try{const theme=localStorage.getItem('skaz-theme');if(['polar','atlas','coal'].includes(theme))document.body.dataset.theme=theme;}catch{}
 document.addEventListener('click',event=>{const theme=event.target.closest('[data-login-theme]')?.dataset.loginTheme;if(!theme)return;document.body.dataset.theme=theme;try{localStorage.setItem('skaz-theme',theme);}catch{}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submit.disabled)return;submit.disabled=true;status.textContent='Входим…';
  const password=document.getElementById('login-password');
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body:JSON.stringify({login:document.getElementById('login-name').value,password:password.value}),signal:AbortSignal.timeout(15000)});
   let body;try{body=await r.json();}catch{throw new Error('Сервер временно недоступен. Попробуй ещё раз.');}if(!r.ok)throw new Error(body.error||'Не удалось войти');
   if(body.signedIn!==true)throw new Error('Сервер не подтвердил вход. Попробуй ещё раз.');
   password.value='';try{localStorage.setItem('skaz-auth-change',crypto.randomUUID());}catch{}location.replace('/');
  }catch(error){password.value='';status.textContent=error.name==='TimeoutError'||error.name==='TypeError'?'Нет связи с сервером. Попробуй ещё раз.':error.message;submit.disabled=false;password.focus();}
 });
})();
