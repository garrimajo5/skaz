// Conservative Russian word forms, with explicit alternating roots used in spell names.
export const normalizeSearch=value=>String(value).toLocaleLowerCase('ru').replaceAll('ё','е').trim();
function stem(word){
 if(!/^[а-я]+$/.test(word)||word.length<4)return word;
 if(/^(огонь|огня|огню|огнем|огне|огнен.*)$/.test(word))return 'огн';
 if(/^(лечени.*|лечащ.*|лечить|лечит|лечат)$/.test(word))return 'леч';
 const ending=word.match(/(иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ов|ев|ам|ям|ах|ях|ом|ем|ы|и|а|я|у|ю|е|ь)$/)?.[0];
 return ending&&word.length-ending.length>=3?word.slice(0,-ending.length):word;
}
const words = text => text.match(/[\p{L}\p{N}]+/gu) || [];

export function createSearchRank(query, includeText = false) {
 const q = normalizeSearch(query);
 if (!q) return () => 0;
 const tokens = words(q).map(stem);
 const literal = /[^\p{L}\p{N}\s-]/u.test(q);
 const matches = text => {
  if (literal) return text.includes(q);
  if (!tokens.length) return false;
  const stems = words(text).map(stem);
  return tokens.every(token => stems.some(word => word.startsWith(token)));
 };

 return entry => {
  const names = [entry.name.ru, entry.name.en].map(normalizeSearch);
  if (names.includes(q)) return 0;
  if (names.some(name => name.startsWith(q))) return 1;
  if (matches(names.join(' '))) return 2;
  if (names.some(name => name.includes(q))) return 3;
  return includeText && matches(normalizeSearch(entry.text || '')) ? 4 : Infinity;
 };
}
