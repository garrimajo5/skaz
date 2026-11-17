import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {jsonAssignment,parseIndex} from './audit-dndsu-names.mjs';
import {spellFields} from './dndsu-rule-fields.mjs';
export function spellIndexMetadata(html){
 const rows=parseIndex(html,'spells'),list=jsonAssignment(html,'LIST'),seen=new Set();
 return rows.map(row=>{
  const id=new URL(row.url).pathname.match(/^\/spells\/(\d+)-/)[1],pageId='dndsu:spells:'+id;
  if(seen.has(pageId))throw Error('Duplicate numeric spell identity');seen.add(pageId);
  const cards=list.cards.filter(c=>'https://dnd.su'+c.link===row.url);if(cards.length!==1)throw Error('Ambiguous spell metadata');
  return {pageId,url:row.url,ru:row.ru,en:row.en,sourceIds:row.sources,fields:spellFields(cards[0]),fullRules:'unverified',automation:'not-audited'};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,input,date,output]=process.argv;if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!output)throw Error('Usage: spell-index.html YYYY-MM-DD output.json');
 const bytes=readFileSync(input),records=spellIndexMetadata(bytes.toString('utf8'));
 writeFileSync(output,JSON.stringify({schemaVersion:1,observedOn:date,url:'https://dnd.su/piece/spells/index-list/',rawSha256:createHash('sha256').update(bytes).digest('hex'),status:'index-fields-not-full-rules',records},null,2)+'\n');console.log({spells:records.length});
}
