// Rule diagnostics do not authorize mutations or validate the transport envelope.
const SkazProfileRules = (() => {
  const abilities = ['str','dex','con','int','wis','cha'];
  const maxAcknowledgements = 32;
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const validKey = key => typeof key === 'string' &&
    (/^ability:(str|dex|con|int|wis|cha)$/.test(key) || key === 'level' || /^counter:[a-zA-Z0-9-]{8,80}$/.test(key));
  function validateAcknowledgements(value, scope) {
    if (!Array.isArray(value) || value.length > maxAcknowledgements) throw Error('Invalid rule acknowledgements');
    const seen = new Set();
    return value.map(row => {
      if (!exact(row, ['key','facts','note']) || !validKey(row.key) || seen.has(row.key) ||
          typeof row.facts !== 'string' || row.facts.length > 512 || typeof row.note !== 'string' || row.note.length > 500) {
        throw Error('Invalid rule acknowledgement');
      }
      if (scope === 'stats' && !row.key.startsWith('ability:') || scope === 'sheet' && row.key.startsWith('ability:')) throw Error('Wrong acknowledgement scope');
      let facts;
      try { facts = JSON.parse(row.facts); } catch { throw Error('Invalid acknowledgement facts'); }
      if (!exact(facts, ['version','key','actual','minimum','maximum']) || facts.version !== 1 || facts.key !== row.key ||
          ![facts.actual,facts.minimum,facts.maximum].every(Number.isSafeInteger) || facts.minimum > facts.maximum ||
          JSON.stringify(facts) !== row.facts) throw Error('Invalid acknowledgement facts');
      seen.add(row.key);
      return {key:row.key, facts:row.facts, note:row.note};
    });
  }
  function warning(key, actual, minimum, maximum, acknowledgements) {
    if (!Number.isSafeInteger(actual) || !Number.isSafeInteger(maximum) || actual >= minimum && actual <= maximum) return null;
    const facts = JSON.stringify({version:1,key,actual,minimum,maximum});
    const record = acknowledgements.find(row => row.key === key && row.facts === facts);
    return {key,actual,minimum,maximum,facts,blocking:false,acknowledged:Boolean(record),note:record?.note ?? ''};
  }
  function warnings({stats=null, sheet=null} = {}) {
    const result = [];
    const statAcknowledgements = validateAcknowledgements(stats && Object.hasOwn(stats,'ruleAcknowledgements') ? stats.ruleAcknowledgements : [], 'stats');
    const sheetAcknowledgements = validateAcknowledgements(sheet && Object.hasOwn(sheet,'ruleAcknowledgements') ? sheet.ruleAcknowledgements : [], 'sheet');
    for (const id of abilities) {
      const item = warning('ability:'+id, stats?.abilities?.[id], 1, 30, statAcknowledgements);
      if (item) result.push(item);
    }
    const level = warning('level', sheet?.level, 1, 20, sheetAcknowledgements);
    if (level) result.push(level);
    for (const counter of sheet?.counters ?? []) {
      // Negative resource balances remain a technical error, never a rule exception.
      if (!Number.isSafeInteger(counter.current) || counter.current < 0 || !Number.isSafeInteger(counter.max) || counter.max < 0) {
        throw Error('Invalid resource balance');
      }
      if (!validKey('counter:'+counter.id)) throw Error('Invalid counter identity');
      const item = warning('counter:'+counter.id, counter.current, 0, counter.max, sheetAcknowledgements);
      if (item) result.push(item);
    }
    return result;
  }
  function acknowledge(item, note = '') {
    return validateAcknowledgements([{key:item.key,facts:item.facts,note}])[0];
  }
  function reconcile(profile) {
    const result = structuredClone(profile);
    const active = warnings(result);
    for (const section of ['stats','sheet']) {
      if (!result[section] || !Object.hasOwn(result[section], 'ruleAcknowledgements')) continue;
      result[section].ruleAcknowledgements = result[section].ruleAcknowledgements.filter(row =>
        active.some(item => item.key === row.key && item.facts === row.facts));
    }
    return result;
  }
  function requiresV15(profile) {
    return warnings(profile).length > 0 || ['stats','sheet'].some(key => profile[key] && Object.hasOwn(profile[key], 'ruleAcknowledgements'));
  }
  function proficiency(level) {
    return Number.isSafeInteger(level) && level >= 1 && level <= 20 ? 2 + Math.floor((level - 1) / 4) : null;
  }
  function adjustCounter(counter, delta) {
    if (!counter || !validKey('counter:'+counter.id) || ![1,-1].includes(delta) ||
        !Number.isSafeInteger(counter.current) || counter.current < 0 ||
        !Number.isSafeInteger(counter.max) || counter.max < 0) throw Error('Invalid resource adjustment');
    const current = counter.current + delta;
    if (!Number.isSafeInteger(current) || current < 0) throw Error('Invalid resource adjustment');
    return {...counter,current};
  }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(items, editable = false, profile = {}) {
    if (!items.length) return '';
    const names = {str:'Сила',dex:'Ловкость',con:'Телосложение',int:'Интеллект',wis:'Мудрость',cha:'Харизма'};
    const rows = items.map((item,index) => {
      const label = item.key === 'level' ? 'Уровень' : item.key.startsWith('ability:') ? names[item.key.slice(8)] :
        profile.sheet?.counters?.find(c => 'counter:'+c.id === item.key)?.name ?? 'Ресурс';
      return '<div class="rule-warning"><p><strong>'+escape(label)+': '+item.actual+'</strong>. Обычный диапазон: '+item.minimum+'–'+item.maximum+'. '+
        (item.acknowledged?'Согласовано с мастером.':'Можно сохранить личное значение.')+'</p>'+
        (editable?'<label><input type="checkbox" data-rule-agree="'+index+'" '+(item.acknowledged?'checked':'')+'> Согласовано с мастером (необязательно)</label><label>Пояснение (необязательно)<textarea data-rule-note="'+index+'" maxlength="500">'+escape(item.note)+'</textarea></label>':item.note?'<p class="small">'+escape(item.note)+'</p>':'')+'</div>';
    }).join('');
    if (!editable && items.every(item => item.acknowledged)) return '<details class="rule-warnings"><summary>Согласованные отклонения: '+items.length+'</summary>'+rows+'</details>';
    return '<section class="panel rule-warnings" aria-label="Отклонения от правил"><h3>Личные значения</h3><p>Правила предупреждают об отличиях. Подтверждение мастера не требуется для сохранения.</p>'+rows+'</section>';
  }
  function readAcknowledgements(root, items) {
    return items.flatMap((item,index) => root.querySelector('[data-rule-agree="'+index+'"]')?.checked ?
      [acknowledge(item,root.querySelector('[data-rule-note="'+index+'"]')?.value ?? '')] : []);
  }
  return {warnings,requiresV15,validateAcknowledgements,acknowledge,reconcile,proficiency,adjustCounter,render,readAcknowledgements,maxAcknowledgements};
})();
if (typeof module !== 'undefined') module.exports = SkazProfileRules;
