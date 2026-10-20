const SkazMembers=(()=>{
 const roles={player:'Игрок',gm:'Мастер',owner:'Владелец'};let serial=0,key='',data=null,pending=null,busy=false,stale=false;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const region=()=>document.getElementById('members-panel');
 const visible=token=>token===serial&&document.getElementById('dialog')?.open&&region()&&key===SkazStorage.contextKey();
 const options=selected=>Object.entries(roles).map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
 function render(message=''){
  const blocked=Boolean(pending||stale);
  modal(`<div id="members-panel"><div class="overline">УЧАСТНИКИ КАМПАНИИ</div><h2>Кто играет вместе</h2><p>Роль определяет общие действия. Доступ к каждому личному листу выдаётся отдельно. Пароли и аккаунты создаёт администратор сервера.</p><p role="status">${esc(message)}</p><button id="members-refresh">Проверить актуальный состав</button>${pending?'<p class="notice">Ответ сервера не получен. Можно повторить ту же команду или проверить состав. Новые решения пока заблокированы.</p><button id="members-retry" class="primary">Повторить подтверждение</button>':''}<div class="member-list">${data.members.map((member,index)=>`<section class="panel"><h3>${esc(member.displayName)}${member.id===data.actorId?' · Ты':''}</h3><p>${roles[member.role]}${member.enabled?'':' · Аккаунт отключён'}</p><details><summary>Код участника</summary><p>${esc(member.id)}</p></details><div class="member-actions"><label>Роль<select id="member-role-${index}" ${blocked||member.id===data.actorId?'disabled':''}>${options(member.role)}</select></label><button data-member-role="${index}" ${blocked||member.id===data.actorId||!member.enabled?'disabled':''}>Изменить роль</button><button data-member-remove="${index}" ${blocked||member.id===data.actorId?'disabled':''}>Убрать из кампании</button></div><h4>Личные листы</h4>${data.characters.map((hero,hi)=>{const granted=member.characterIds.includes(hero.id);return `<div class="list-row"><span>${esc(hero.name)} · ${granted?'доступ открыт':'доступа нет'}</span><button data-member-hero="${index}:${hi}" ${blocked||!member.enabled||granted&&member.id===data.actorId?'disabled':''}>${granted?'Отозвать':'Открыть доступ'}</button></div>`;}).join('')}</section>`).join('')}</div><h3>Добавить существующий аккаунт</h3><form id="member-add"><label>Код участника<input id="member-code" required maxlength="80" minlength="8" pattern="[a-zA-Z0-9-]{8,80}" ${blocked?'disabled':''}></label><label>Роль<select id="member-new-role" ${blocked?'disabled':''}>${options('player')}</select></label><button class="primary" ${blocked?'disabled':''}>Проверить решение</button></form><p>Попроси у игрока код аккаунта. Он не даёт права входа. Добавление участника ещё не открывает ему личные листы.</p></div>`);
  document.getElementById('members-refresh').onclick=()=>open();
  if(pending)document.getElementById('members-retry').onclick=()=>perform();
  for(const button of document.querySelectorAll('[data-member-role]'))button.onclick=()=>{if(pending||stale)return;const i=Number(button.dataset.memberRole),m=data.members[i],role=document.getElementById('member-role-'+i).value;if(role===m.role)return;review({action:'set-member',userId:m.id,role},`Изменить роль «${m.displayName}»: ${roles[m.role]} → ${roles[role]}. Владелец может управлять составом и выдавать доступ к героям.`);};
  for(const button of document.querySelectorAll('[data-member-remove]'))button.onclick=()=>{if(pending||stale)return;const m=data.members[Number(button.dataset.memberRemove)];review({action:'remove-member',userId:m.id},`Убрать «${m.displayName}» из этой кампании и отозвать все его разрешения на её героев. Персонажи и прогресс сохранятся.`);};
  for(const button of document.querySelectorAll('[data-member-hero]'))button.onclick=()=>{if(pending||stale)return;const [i,hi]=button.dataset.memberHero.split(':').map(Number),m=data.members[i],hero=data.characters[hi],granted=m.characterIds.includes(hero.id);review({action:granted?'revoke-character':'grant-character',userId:m.id,characterId:hero.id},`${granted?'Отозвать':'Открыть'} доступ «${m.displayName}» к личному листу «${hero.name}». Открытый лист включает ресурсы, заметки, инвентарь и заклинания. ${granted?'Данные героя сохранятся.':'Выдавай доступ только согласованному участнику.'}`);};
  document.getElementById('member-add').onsubmit=event=>{event.preventDefault();if(pending||stale)return;const userId=document.getElementById('member-code').value.trim(),role=document.getElementById('member-new-role').value;review({action:'set-member',userId,role},`Добавить аккаунт с кодом «${userId}» в эту кампанию с ролью «${roles[role]}». Проверь код с участником. Аккаунт должен быть создан администратором.`);};
 }
 function review(command,description){
  if(stale||!SkazStorage.can('members')||key!==SkazStorage.contextKey())return;
  modal(`<div id="members-panel"><h2>Проверить изменение доступа</h2><p>${esc(description)}</p><p>Изменение вступит в силу после подтверждения. Состав повторно проверится на сервере.</p><div class="dialog-actions"><button id="members-confirm" class="primary">Подтвердить изменение</button><button id="members-back">К составу</button></div></div>`);
  document.getElementById('members-back').onclick=()=>render();
  document.getElementById('members-confirm').onclick=()=>{if(busy||pending)return;pending={...command,mutationId:crypto.randomUUID(),campaignId:data.campaignId,expectedVersion:data.version};return perform();};
 }
 async function perform(){
  if(busy||!pending||!SkazStorage.can('members')||key!==SkazStorage.contextKey())return;
  const token=serial;busy=true;modal('<div id="members-panel"><h2>Сохраняем доступ…</h2><p role="status">Проверяем состав и права.</p></div>');
  try{const result=await SkazStorage.changeMembers(pending);pending=null;if(!visible(token))return;data=result;render(result.replayed?'Команда уже была подтверждена. Показан актуальный состав.':'Доступ сохранён.');}
  catch(error){if(!visible(token))return;if([400,403,404,409,422].includes(error.status))pending=null;if(error.status===409)stale=true;render(error.message||'Нет связи с сервером.');}
  finally{busy=false;}
 }
 async function open(){
  if(busy||!SkazStorage.can('members'))return;
  const token=++serial;key=SkazStorage.contextKey();pending=null;stale=false;modal('<div id="members-panel"><h2>Участники</h2><p role="status">Загружаем состав…</p></div>');
  try{const result=await SkazStorage.membersData();if(!visible(token))return;data=result;render();}
  catch(error){if(!visible(token))return;modal(`<div id="members-panel"><h2>Состав недоступен</h2><p>${esc(error.message||'Проверь соединение.')}</p><button id="members-load-retry">Повторить</button></div>`);document.getElementById('members-load-retry').onclick=open;}
 }
 document.addEventListener('click',event=>{if(event.target.closest('button')?.id==='campaign-members')open();});
 return {open};
})();
