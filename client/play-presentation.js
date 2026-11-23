// @ts-check

/**
 * @typedef {object} WorkspaceActor
 * @property {string} heroName
 * @property {string} className
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
   */
  function castCost(enabled, spellLevel, manual, slotLevel) {
    if (spellLevel === 0) return 'Без ячейки';
    if (!enabled) return '';
    if (manual) return 'Выбор счётчика';
    return slotLevel === undefined ? '' : `1 ячейка · ${slotLevel} круг`;
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

  /** @param {WorkspaceActor} view */
  function actorBand(view) {
    const character = [view.className, Number.isInteger(view.level) ? `${view.level} уровень` : ''].filter(Boolean).join(' · ');
    const initial = Array.from(view.heroName.trim())[0] || '?';
    return `<div class="play-hero-band" role="group" aria-label="Состояние активного персонажа">
        <div class="play-hero-name">
          <span class="play-hero-initial" aria-hidden="true">${escape(initial)}</span>
          <div><strong>${escape(view.heroName)}</strong><small>${escape(character)}</small></div>
        </div>
        <div class="play-hp-summary"><small>Хиты</small><strong>${escape(view.hp)}<span> / ${escape(view.maxHp)}</span></strong><progress value="${escape(view.hp)}" max="${escape(view.maxHp)}" aria-hidden="true"></progress>${view.tempHp ? `<small>+${escape(view.tempHp)} временных</small>` : ''}</div>
        <div><small>КД</small><strong>${escape(view.armorClass)}</strong></div>
        <div class="play-effects"><small>Состояния и эффекты</small>
          <div>${[view.concentration, ...view.conditions].filter(effect => !!effect).map(effect => `<span>${escape(effect || '')}</span>`).join('') || '<span>Без отмеченных эффектов</span>'}</div>
        </div>
        ${typeof view.gold === 'number' ? `<div class="play-gold"><small>Кошелёк</small><strong>${escape(view.gold)} зм</strong></div>` : ''}
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
      ${heading('Быстрый доступ', view.session, `<button id="play-edit"><span data-ui-icon="profile" aria-hidden="true"></span> Лист персонажа</button><button id="play-search">Поиск правил</button>`)}
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

  return {castCost, prepare, screen};
})();
