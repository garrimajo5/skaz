// Presentation policy only: never rewrites stored marks or enforces spell limits.
const known = new Set(['bard', 'ranger', 'sorcerer', 'warlock']);
const prepared = new Set(['cleric', 'druid', 'paladin', 'artificer']);
export function spellLearningMode({classId, manual = false, selectedMode} = {}) {
  if (manual) return ['known', 'prepared', 'spellbook'].includes(selectedMode) ? selectedMode : null;
  if (known.has(classId)) return 'known';
  if (prepared.has(classId)) return 'prepared';
  return classId === 'wizard' ? 'spellbook' : null;
}
export function spellPresentation(status, mode) {
  if (!['known', 'prepared'].includes(status)) throw new TypeError('Unknown stored spell status');
  if (![null, 'known', 'prepared', 'spellbook'].includes(mode)) throw new TypeError('Unknown learning mode');
  const effectiveStatus = mode === 'known' ? 'known' : status;
  return {storedStatus: status, effectiveStatus,
    label: mode === 'known' ? 'Известно' : status === 'prepared' ? 'Подготовлено' : 'Изучено',
    availableInPlay: mode === 'known' || status === 'prepared'};
}
