import {readFileSync} from 'node:fs';
import {article,sha} from './dndsu-rule-fields.mjs';
const folder=process.argv[2];
if(!folder)throw Error('Usage: node scripts/verify-dndsu-rule-sources.mjs RAW_SAMPLE_DIR');
const manifest=JSON.parse(readFileSync(new URL('../catalog/dndsu-rule-clauses-2026-11-15.json',import.meta.url),'utf8'));
for(const source of manifest.sources) {
  const raw=readFileSync(`${folder}/${source.file}`,'utf8');
  const text=article(raw);
  if(sha(text)!==source.articleSha256)throw Error('Article changed; manually re-review: '+source.url);
  for(const clause of manifest.clauses.filter(c=>c.url===source.url)) {
    if(!clause.sourcePatterns.length || !clause.sourcePatterns.every(pattern=>new RegExp(pattern,'u').test(text))) throw Error('Source no longer supports '+clause.id+' '+clause.field);
  }
}
console.log(JSON.stringify({articles:manifest.sources.length,clauses:manifest.clauses.length,status:'verified against pinned article hashes and source anchors'}));
