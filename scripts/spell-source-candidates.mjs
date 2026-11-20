// Read-only review helper. A name match never selects a spell or accepts a rule.
function nameKey(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('A nonempty name is required');
  return value.normalize('NFC').trim().toLocaleLowerCase('ru-RU');
}

export function buildSpellSourceCandidates(rows, entries) {
  if (!Array.isArray(rows) || !Array.isArray(entries)) throw new TypeError('Rows and catalog entries must be arrays');
  const names = new Map(), catalogIds = new Set(), rowIds = new Set();
  for (const entry of entries) {
    if (entry.kind !== 'spell' || entry.ruleset !== '5e-2014') continue;
    if (typeof entry.id !== 'string' || !entry.id || catalogIds.has(entry.id)) throw new TypeError('Duplicate or invalid spell ID');
    catalogIds.add(entry.id);
    const key = nameKey(entry.name?.ru);
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(entry.id);
  }
  return rows.map(row => {
    if (typeof row.rowId !== 'string' || !row.rowId || rowIds.has(row.rowId)) throw new TypeError('Duplicate or invalid row ID');
    rowIds.add(row.rowId);
    const candidateIds = [...(names.get(nameKey(row.name)) || [])].sort();
    return {rowId: row.rowId, candidateIds,
      status: candidateIds.length > 1 ? 'ambiguous-name-candidates' : candidateIds.length === 1 ? 'unique-name-candidate' : 'unmatched',
      selectedId: null, identityVerified: false, fullRuleAcceptance: false};
  });
}
