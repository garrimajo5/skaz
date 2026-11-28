const SkazPersonalNote = (() => {
  const maxText = 2000;
  const maxCount = 2000;

  function entry({text, at, time}) {
    if (typeof text !== 'string' || !text || text !== text.trim() || text.length > maxText)
      throw new Error('Личная заметка должна содержать от 1 до 2000 символов');
    if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000 ||
        typeof time !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))
      throw new Error('Неверное время личной заметки');
    return {title: 'Моя заметка', text, at, time};
  }

  function append(notes, note) {
    if (!Array.isArray(notes) || notes.length >= maxCount)
      throw new Error('Достигнут предел личных заметок');
    return [...notes, entry(note)];
  }

  return {entry, append, maxText, maxCount};
})();
if (typeof module !== 'undefined') module.exports = SkazPersonalNote;
