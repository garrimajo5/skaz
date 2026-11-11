// Conservative Russian word forms, with explicit alternating roots used in spell names.
export const normalizeSearch=value=>String(value).toLocaleLowerCase('ru').replaceAll('ё','е').trim();
function stem(word){
 if(!/^[а-я]+$/.test(word)||word.length<4)return word;
 if(/^(огонь|огня|огню|огнем|огне|огнен.*)$/.test(word))return 'огн';
 if(/^(лечени.*|лечащ.*|лечить|лечит|лечат)$/.test(word))return 'леч';
 const ending=word.match(/(иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ов|ев|ам|ям|ах|ях|ом|ем|ы|и|а|я|у|ю|е|ь)$/)?.[0];
 return ending&&word.length-ending.length>=3?word.slice(0,-ending.length):word;
}
export function searchRank(entry,query,includeText=false){
 const q=normalizeSearch(query),names=[entry.name.ru,entry.name.en].map(normalizeSearch);if(!q)return 0;
 if(names.includes(q))return 0;if(names.some(n=>n.startsWith(q)))return 1;
 const tokens=q.match(/[\p{L}\p{N}]+/gu)||[],literal=/[^\p{L}\p{N}\s-]/u.test(q);
 const matches=text=>literal?text.includes(q):tokens.length>0&&tokens.every(t=>(text.match(/[\p{L}\p{N}]+/gu)||[]).some(w=>stem(w).startsWith(stem(t))));
 if(matches(names.join(' ')))return 2;
 if(names.some(n=>n.includes(q)))return 3;
 return includeText&&matches(normalizeSearch(entry.text||''))?4:Infinity;
}
