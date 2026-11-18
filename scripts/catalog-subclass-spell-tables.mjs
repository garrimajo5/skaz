import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {normalizeName} from './audit-dndsu-names.mjs';
import {decode} from './catalog-additional-discovery.mjs';
const text=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attributes=s=>Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],decode(m[3])]));
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,20);
export function spellReference(href,label,classUrl,knownSpells){
 const url=new URL(href,classUrl);
 if(url.origin!=='https://dnd.su'||url.username||url.password||url.search||url.hash)throw Error('Unexpected spell reference origin or suffix');
 const match=url.pathname.match(/^\/spells\/(\d+)-[^/]+\/$/);if(!match)throw Error('Unexpected spell reference path');
 const pageId='dndsu:spells:'+match[1];
 const cleanedLabel=text(label),metadata=knownSpells instanceof Map?knownSpells.get(pageId):null;
 const en=cleanedLabel.match(/\[([^\]]+)(?:\]|$)/)?.[1],ru=cleanedLabel.split('[')[0].trim(),labelFormatIssue=cleanedLabel.includes('[')&&!cleanedLabel.includes(']')?'unclosed-bracket':null;
 const nameEvidence=!cleanedLabel?'empty-label':!metadata?'not-compared':(en&&normalizeName(en)===normalizeName(metadata.en))||normalizeName(ru)===normalizeName(metadata.ru)?'index-name-match':'index-name-differs';
 return {pageId,url:url.href,label:cleanedLabel,nameEvidence,...(labelFormatIssue?{labelFormatIssue}:{}),...(metadata?{indexSpellLevel:metadata.fields.level}:{}),registryStatus:knownSpells.has(pageId)?'observed-in-spell-index':'not-in-spell-index',canonicalCatalogId:null,fullRules:'unverified'};
}
export function subclassSpellTables(html,{classUrl,proposal,knownSpells}){
 if(proposal.classUrl!==classUrl)throw Error('Mismatched class proposal');
 html=html.replace(/<!--[\s\S]*?-->/g,'');
 const start=html.search(/<div\b[^>]*class="card__body new-article"[^>]*>/),end=html.indexOf('<div class="card__footer"',start);
 if(start<0||end<start)throw Error('Missing class article boundary');
 const body=html.slice(start,end),heads=[...body.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(m=>({index:m.index,end:m.index+m[0].length,level:Number(m[1]),title:text(m[2]),anchors:[...m[2].matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map(m=>m[2])}));
 const subclasses=new Map(proposal.records.filter(r=>r.kind==='subclass').map(r=>[r.parent,r]));
 const tables=[],excluded=[],seen=new Set();let candidateCount=0;
 for(const match of body.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)){
  const links=[...match[0].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter(m=>/\/spells\//.test(attributes(m[1]).href||''));if(!links.length)continue;
  candidateCount++;
  const previous=heads.filter(h=>h.index<match.index),parent=previous.filter(h=>h.level===2).at(-1),anchor=parent?.anchors.find(a=>subclasses.has(a));
  if(!anchor){excluded.push({tableOrdinal:candidateCount,heading:previous.at(-1)?.title||null,reason:'outside-reviewed-subclasses',spellLinks:links.length});continue;}
  const rows=[...match[0].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].map(row=>({attributes:attributes(row[1]),cells:[...row[2].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/g)].map(c=>({attributes:attributes(c[1]),html:c[2],label:text(c[2])}))}));
  const headerIndex=rows.findIndex(r=>r.cells.length>1&&(/^(?:Уровень(?:\s|$)|Склонность$)/iu.test(r.cells[0].label)||r.cells.map(c=>c.label).join('|')==='Дюнамантия|Хронургия|Гравитургия'));
  if(headerIndex<0){excluded.push({tableOrdinal:candidateCount,parent:anchor,heading:previous.at(-1)?.title||null,reason:'not-a-reviewed-spell-list-shape',spellLinks:links.length});continue;}
  const header=rows[headerIndex].cells.map(c=>c.label),matrix=header.join('|')==='Дюнамантия|Хронургия|Гравитургия';if(header.some(s=>s.length>120))throw Error('Unexpected spell table header');
  const context=previous.filter(h=>h.index>=parent.index).map(h=>h.title);
  const heading=previous.at(-1).title,id='scope-spell-table:'+hash(classUrl+'#'+anchor+'\n'+heading);
  if(seen.has(id))throw Error('Ambiguous spell table identity');seen.add(id);
  const data=[];
  for(const row of rows.slice(headerIndex+1)){
   if(!row.cells.length)continue;
   if(row.cells.length<2)throw Error('Incomplete spell row');
   const selector=matrix?null:row.cells[0].label;if(!matrix&&(!selector||selector.length>60))throw Error('Unexpected spell table selector');
   const cells=[];let column=0;
   for(const cell of row.cells){
    const span=Number(cell.attributes.colspan||1),rowSpan=Number(cell.attributes.rowspan||1);
    if(!Number.isInteger(span)||span<1||span>header.length||rowSpan!==1)throw Error('Unsupported table span');
    const refs=[...cell.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m=>spellReference(attributes(m[1]).href||'',m[2],classUrl,knownSpells));
    if(!matrix&&column===0&&refs.length)throw Error('Spell link in selector column');
    if(matrix||column>0){const residual=text(cell.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g,'')).replace(/^[\s,;]+|[\s,;]+$/g,'');if(residual.length>160)throw Error('Unexpected prose in spell list');cells.push({columnStart:column,columnSpan:span,headerLabels:header.slice(column,column+span),spells:refs,...(residual?{unlinkedText:residual}:{})});}
    column+=span;
   }
   if(column!==header.length)throw Error('Spell table width mismatch');
   data.push({selector,selectorMeaning:matrix?'matrix-row-not-level':/заклинани/iu.test(header[0])?'spell-level':/^уровень$/iu.test(header[0])?'unqualified-level':/уровень/iu.test(header[0])?'class-level':'choice-label',cells});
  }
  for(const row of data)for(const cell of row.cells)for(const ref of cell.spells){
   const level=row.selector?.match(/^(\d+)(?:-й)?$/)?.[1];
   ref.levelComparison=row.selectorMeaning!=='spell-level'?'not-applicable':level===undefined||ref.indexSpellLevel===undefined?'not-checked':Number(level)===ref.indexSpellLevel?'matches-table-selector':'differs-from-table-selector';
  }
  const extracted=data.flatMap(r=>r.cells.flatMap(c=>c.spells)).length;
  if(extracted!==links.length)throw Error('Spell links lost during table parsing');
  if(!data.length)throw Error('Empty spell table');
  tables.push({id,classUrl,parent:anchor,heading,context,tableKind:matrix?'spell-category-matrix':'spell-selector-table',sourceIds:subclasses.get(anchor).sourceIds,sourceBasis:'reviewed-subclass-source',headers:header,rows:data,fullRules:'unverified',automation:'not-applied',tableSemantics:'requires-rule-review',inclusion:'proposed-2014-awaiting-review'});
 }
 return {classUrl,candidateTables:candidateCount,tables,excluded};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');
 const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));
 const proposals=[read('dndsu-bard-scope-proposal.json'),read('dndsu-barbarian-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes];
 const spellIndex=read('dndsu-spell-index-metadata.json'),knownSpells=new Map(spellIndex.records.map(r=>[r.pageId,r]));
 const classes=proposals.map(proposal=>{const bytes=readFileSync(directory+'/class-'+proposal.classUrl.match(/\/class\/(\d+)/)[1]+'.html');return {...subclassSpellTables(bytes.toString('utf8'),{classUrl:proposal.classUrl,proposal,knownSpells}),rawSha256:createHash('sha256').update(bytes).digest('hex')};});
 const summary={classes:classes.length,tables:classes.reduce((n,c)=>n+c.tables.length,0),rows:classes.flatMap(c=>c.tables).reduce((n,t)=>n+t.rows.length,0),spellReferences:classes.flatMap(c=>c.tables).flatMap(t=>t.rows).flatMap(r=>r.cells).reduce((n,c)=>n+c.spells.length,0),excludedTables:classes.reduce((n,c)=>n+c.excluded.length,0)};
 const refs=classes.flatMap(c=>c.tables).flatMap(t=>t.rows).flatMap(r=>r.cells).flatMap(c=>c.spells);
 Object.assign(summary,{namedSpellReferences:refs.filter(r=>r.label).length,blankSpellReferences:refs.filter(r=>!r.label).length,uniqueSpellPages:new Set(refs.map(r=>r.pageId)).size,missingIndexReferences:refs.filter(r=>r.registryStatus==='not-in-spell-index').length,labelFormatIssues:refs.filter(r=>r.labelFormatIssue).length,nameConflicts:refs.filter(r=>r.nameEvidence==='index-name-differs').length,levelConflicts:refs.filter(r=>r.levelComparison==='differs-from-table-selector').length});
 writeFileSync(output,JSON.stringify({schemaVersion:1,observedOn:spellIndex.observedOn,spellIndexSha256:createHash('sha256').update(readFileSync(new URL('../catalog/dndsu-spell-index-metadata.json',import.meta.url))).digest('hex'),status:'subclass-spell-table-observations-awaiting-review',summary,classes},null,2)+'\n');console.log(summary);
}
