// @ts-check

/**
 * @typedef {object} WorkspaceActor
 * @property {string} heroName
 * @property {string} className
 * @property {string} [subclass]
 * @property {number | null | undefined} level
 * @property {string} session
 * @property {number} hp
 * @property {number} maxHp
 * @property {number | undefined} tempHp
 * @property {number} armorClass
 * @property {string | null | undefined} concentration
 * @property {string[]} conditions
 * @property {number | undefined} gold
 * @property {boolean} historyAvailable
 */

/**
 * @typedef {WorkspaceActor & {initiative:number, speed:number, checks:string, magicStats:string, content:string}} QuickAccessScreen
 */

/**
 * @typedef {object} PreparationScreen
 * @property {WorkspaceActor} actor
 * @property {string} title
 * @property {string} [actions] Trusted markup from the current page renderer.
 * @property {string} content Trusted markup from the current page renderer.
 */

const SkazPlayPresentation = (() => {
  const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};

  /** @param {string | number} value */
  function escape(value) {
    return String(value).replace(/[&<>"']/g, character => entities[/** @type {keyof typeof entities} */ (character)]);
  }

  /**
   * Describes the cost already selected by the existing cast controls.
   * @param {boolean} enabled
   * @param {number | undefined} spellLevel
   * @param {boolean} manual
   * @param {number | undefined} slotLevel
   * @param {boolean} [circleShown] The adjacent selector shows the chosen circle.
   */
  function castCost(enabled, spellLevel, manual, slotLevel, circleShown = false) {
    if (spellLevel === 0) return 'Без ячейки';
    if (!enabled) return '';
    if (manual) return 'Выбор счётчика';
    if (slotLevel === undefined) return '';
    const amount = '1 ячейка';
    return circleShown ? amount : `${amount} · ${slotLevel} круг`;
  }


  /**
   * @param {{name: string, number: number|null} | undefined} session
   * @param {string} fallback
   */
  function sessionCaption(session, fallback) {
    if (!session || typeof session.number !== 'number' || !Number.isSafeInteger(session.number) || session.number < 1) return fallback;
    const index = 'Сессия ' + String(session.number).padStart(2, '0');
    return session.name ? index + ' · ' + session.name : index;
  }

  /**
   * @param {string} title
   * @param {string} session
   * @param {string} actions Trusted markup from the current page renderer.
   */
  function heading(title, session, actions = '') {
    return `<div class="play-heading">
      <div>${session ? `<p class="play-session">${escape(session)}</p>` : ''}<h1>${escape(title)}</h1></div>
      ${actions}
    </div>`;
  }

  /** Formats the label, cost and warning already chosen by the action controller.
   * @param {string} label
   * @param {string} [cost]
   * @param {string} [warning]
   * @param {boolean} [hasFixedPrice] The cost is known before opening the action.
   */
  function commandCopy(label, cost = '', warning = '', hasFixedPrice = false) {
    const caption = hasFixedPrice && cost ? '<small class="play-price-caption" aria-hidden="true">Цена</small>' : '';
    const price = cost ? `${caption}<small class="play-cost">${escape(cost)}</small>` : '';
    const caution = warning ? `<small class="play-cast-warning">${escape(warning)}</small>` : '';
    return `${price}<span class="play-command-label">${escape(label)}</span>${caution}`;
  }

  /** @param {Pick<WorkspaceActor, 'heroName' | 'className' | 'level'>} view */
  function identityCopy(view) {
    const character = [view.className, Number.isInteger(view.level) ? `${view.level} уровень` : ''].filter(Boolean).join(' · ');
    return {character, initial: Array.from(view.heroName.trim())[0] || '?'};
  }

  /** @param {WorkspaceActor} view */
  function actorBand(view) {
    const {character, initial} = identityCopy(view);
    const effects = view.conditions.map(condition => `<span class="play-condition-effect">${escape(condition)}</span>`);
    if (view.concentration) effects.unshift(`<span class="play-concentration-effect"><span class="ui-inline-icon" data-ui-icon="focus" aria-hidden="true"></span><span class="visually-hidden">Концентрация </span>${escape(view.concentration)}</span>`);
    return `<div class="play-hero-band" role="group" aria-label="Состояние активного персонажа">
        <div class="play-hero-name">
          <span class="play-hero-initial" aria-hidden="true">${escape(initial)}</span>
          <div><small class="play-active-hero-label" aria-hidden="true">Активный персонаж</small><strong>${escape(view.heroName)}</strong><small>${escape(character)}${view.subclass?`<span class="play-hero-subclass"> · ${escape(view.subclass)}</span>`:''}</small></div>
        </div>
        <div class="play-hp-summary"><small>Хиты</small><strong>${escape(view.hp)}<span> / ${escape(view.maxHp)}</span></strong><progress value="${escape(view.hp)}" max="${escape(view.maxHp)}" aria-hidden="true"></progress>${view.tempHp ? `<small>+${escape(view.tempHp)} временных</small>` : ''}</div>
        <div class="play-armor-summary"><small>КД</small><strong>${escape(view.armorClass)}</strong></div>
        <div class="play-effects"><small>Состояния и эффекты</small>
          <div>${effects.join('') || '<span>Без отмеченных эффектов</span>'}</div>
        </div>
        ${typeof view.gold === 'number' ? `<div class="play-gold"><small>Кошелёк</small><strong>${escape(view.gold)} зм</strong></div>` : ''}
      </div>`;
  }

  /**
   * @param {string} value
   * @param {string} context
   */
  function healthAmount(value, context) {
    return `<div class="quick-health-amount">
      <label for="quick-hp-amount">Изменить хиты</label>
      <button type="button" data-health-step="-1" aria-label="Уменьшить количество хитов">−</button>
      <input id="quick-hp-amount" type="number" inputmode="numeric" min="1" max="999" step="1" value="${escape(value)}" data-health-context="${escape(context)}" autocomplete="off">
      <button type="button" data-health-step="1" aria-label="Увеличить количество хитов">+</button>
    </div>`;
  }

  /** @param {boolean} historyAvailable */
  function resources(historyAvailable) {
    return `<aside class="play-resources" aria-labelledby="play-resources-title">
          <h2 id="play-resources-title">Ресурсы</h2>
          <div id="play-quick-slot"></div>
          ${historyAvailable ? '<button id="play-history"><span data-ui-icon="undo" aria-hidden="true"></span> История и отмена</button>' : ''}
        </aside>`;
  }

  /** @param {PreparationScreen} view */
  function prepare(view) {
    return `<section class="play-screen workspace-prepare">
      ${heading(view.title, view.actor.session, view.actions)}
      ${actorBand(view.actor)}
      <div class="play-layout">
        <div class="workspace-content">${view.content}</div>
        ${resources(view.actor.historyAvailable)}
      </div>
    </section>`;
  }

  /** @param {QuickAccessScreen} view */
  function screen(view) {
    const initiative = `${view.initiative >= 0 ? '+' : ''}${view.initiative}`;
    return `<section class="play-screen" aria-label="Игровой экран">
      ${heading('Быстрый доступ', view.session, `<button id="play-edit"><span data-ui-icon="profile" aria-hidden="true"></span> Лист <span class="play-edit-detail">персонажа</span></button><button id="play-search">Поиск правил</button>`)}
      ${actorBand(view)}
      <div class="play-layout">
        <div class="play-actions">
          <h2>Быстрые действия</h2>
          <div id="play-content" tabindex="-1" aria-live="polite">${view.content}</div>
          <details class="play-character-checks">
            <summary>Характеристики и проверки</summary>
            <div class="play-stats"><span>Инициатива ${escape(initiative)}</span><span>Скорость ${escape(view.speed)} фт</span><div class="play-spell-stats">${view.magicStats}</div>${view.checks}</div>
          </details>
        </div>
        ${resources(view.historyAvailable)}
      </div>
    </section>`;
  }

  /**
   * @param {{title:string, text:string, time:string, at:number, kind?:string}} entry
   * @param {{level:number, agreed:boolean, reason:string} | null} manual
   */
  function note(entry,manual){
    if(!manual)return entry;
    const agreement=manual.agreed?' Согласовано с мастером.':'';
    return {...entry,kind:'Ручное сотворение',
      time:new Date(entry.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),
      text:manual.level+' круг · без расхода ячейки.'+agreement+(manual.reason?' '+manual.reason:'')};
  }

  return {castCost, commandCopy, healthAmount, identityCopy, sessionCaption, prepare, resources, screen, note};
})();
