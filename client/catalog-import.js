const SkazCatalogImport = (() => {
  const maxBytes=512*1024;
  const example={schemaVersion:1,entries:[{id:'personal:table:session-check',ruleset:'5e-2014',kind:'mechanic',name:{ru:'Сверка имён перед сессией',en:'Session name check'},source:{url:'https://example.com/my-table',title:'Моя памятка для игры',version:'1',usage:'personal',terms:'Мой собственный текст для личной игры.'},text:'Перед началом игры сверяем имена персонажей. Это личная памятка, не официальное правило D&D.',links:[]}]};
  let serial=0, busy=false;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const visible=token=>token===serial && document.getElementById('dialog')?.open && document.getElementById('catalog-import-panel');
  async function request(path,body){
    const encoded=JSON.stringify(body);
    if(new Blob([encoded]).size>maxBytes)throw new Error('Файл слишком велик для интерфейса: максимум 512 КиБ. Раздели подборку или используй локальный импорт на компьютере.');
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1'},body:encoded,signal:AbortSignal.timeout(10000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось проверить файл');return result;
  }
  function open(){
    if(busy)return;
    ++serial;
    modal('<div id="catalog-import-panel"><div class="overline">ЛИЧНАЯ БИБЛИОТЕКА · D&D 2014</div><h2>Добавить материалы из файла</h2><p>Выбери JSON-подборку СКАЗ с названиями, редакцией, источниками и условиями использования. Импортируй собственный материал или текст, на использование которого у тебя есть разрешение.</p><p>Файл проверится до записи. Прогресс, предметы и заклинания персонажей не меняются. Совпадающие записи не дублируются, конфликтующие ID не заменяются.</p><label>JSON-подборка, до 512 КиБ<input id="personal-catalog-file" type="file" accept="application/json,.json"></label><details><summary>Как подготовить JSON-подборку</summary><p>Скопируй пример в текстовый файл с расширением .json. Замени ID, названия, текст и источник своими данными. Для другого материала используй новый ID. Адрес example.com — пример, укажи свой источник.</p><textarea id="catalog-example" aria-label="Пример JSON-подборки" rows="12" readonly></textarea></details><p id="catalog-import-message" role="status"></p></div>');
    document.getElementById('catalog-example').textContent=JSON.stringify(example,null,2);
    document.getElementById('personal-catalog-file').onchange=event=>preview(event.target.files?.[0]);
  }
  async function preview(file){
    if(!file)return;
    const token=++serial;
    document.getElementById('catalog-import-message').textContent='Проверяем файл…';
    try{
      if(file.size>maxBytes)throw new Error('Файл больше 512 КиБ. Раздели подборку или используй локальный импорт на компьютере.');
      let bundle;try{bundle=JSON.parse(await file.text());}catch{throw new Error('Не удалось прочитать JSON. Проверь формат файла.');}
      // Reserve the reviewed hash envelope before showing a confirm button.
      if(new Blob([JSON.stringify({bundle,version:'0'.repeat(64)})]).size>maxBytes)throw new Error('Подборка с данными проверки превышает 512 КиБ. Раздели файл на части.');
      const value=await request('/api/catalog/import/preview',{bundle});if(!visible(token))return;
      modal(`<div id="catalog-import-panel"><div class="overline">ПРЕДПРОСМОТР · ЕЩЁ НЕ ЗАПИСАНО</div><h2>${escape(file.name)}</h2><p>Записей в файле: ${Number(value.records)}. Добавится: ${Number(value.added)}. Уже совпадает: ${Number(value.unchanged)}.</p><p>Только ссылки: ${Number(value.usage['reference-only'])}; личные материалы: ${Number(value.usage.personal)}; заявлено CC BY 4.0: ${Number(value.usage['cc-by-4.0'])}.</p><p>Проверена структура и связи. Достоверность правил и разрешение внешнего источника автоматически не проверяются.</p><details><summary>Примеры записей и источников (${value.sample.length} из ${Number(value.records)})</summary>${value.sample.map(item=>`<article class="panel"><h3>${escape(item.name.ru)}</h3><p>${escape(item.name.en)}</p><p>${escape(item.source.title)} · ${escape(item.source.version)}</p><p>${escape(item.source.terms)}</p></article>`).join('')}</details><div class="dialog-actions"><button id="confirm-catalog-import" class="primary" ${value.added===0?'disabled':''}>${value.added===0?'Все записи уже есть':'Добавить материалы'}</button><button id="choose-catalog-file">Другой файл</button></div><p id="catalog-import-message" role="status"></p></div>`);
      document.getElementById('confirm-catalog-import').onclick=()=>apply(bundle,value.version,token);
      document.getElementById('choose-catalog-file').onclick=open;
    }catch(error){if(visible(token))document.getElementById('catalog-import-message').textContent=error.message;}
  }
  async function apply(bundle,version,token){
    if(busy||!visible(token))return;
    busy=true;const button=document.getElementById('confirm-catalog-import');button.disabled=true;document.getElementById('catalog-import-message').textContent='Добавляем материалы…';
    try{
      const value=await request('/api/catalog/import',{bundle,version});
      if(visible(token))modal(`<div id="catalog-import-panel"><h2>Материалы добавлены</h2><p>Новых: ${Number(value.added)}. Уже совпадало: ${Number(value.unchanged)}. Прогресс игры не изменён.</p><button id="close-catalog-import" class="primary">К справочнику</button></div>`);
      if(visible(token))document.getElementById('close-catalog-import').onclick=closeModal;
      await SkazCatalog.reload();
    }catch(error){if(visible(token)){button.disabled=false;document.getElementById('catalog-import-message').textContent=error.message+' Можно повторить: одинаковые записи не дублируются. После перезагрузки выбери тот же файл заново.';}}
    finally{busy=false;}
  }
  return {open};
})();
