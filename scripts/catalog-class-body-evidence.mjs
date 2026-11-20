import {createHash} from 'node:crypto';
import {decode} from './catalog-additional-discovery.mjs';
import {classHeadings} from './catalog-class-headings.mjs';
export const sha=s=>createHash('sha256').update(s).digest('hex');
function isHeaderRow(attributes){
 const attrs=[...attributes.matchAll(/([^\s=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)];
 return attrs.some(a=>a[1].toLowerCase()==='class'&&decode(a[2]??a[3]??a[4]??'').split(/\s+/).includes('table_header'));
}
export function classBodyEvidence(html){
 const start=html.search(/<div\b[^>]*class="card__body new-article"[^>]*>/),end=html.indexOf('<div class="card__footer"',start);
 if(start<0||end<start)throw Error('Missing article boundary');
 const article=html.slice(start,end),matches=[...article.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)],parsed=classHeadings(html).headings;
 const rows=[];
 for(const [i,m] of matches.entries()){
  const title=decode(m[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();if(!title)continue;
  const raw=article.slice(m.index+m[0].length,matches[i+1]?.index??article.length),text=decode(raw.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  const heading=parsed[rows.length];if(heading.title!==title)throw Error('Body heading alignment differs');
  const tables=[...raw.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map(t=>({rows:[...t[1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].filter(r=>/<td\b/i.test(r[2])&&!isHeaderRow(r[1])).length}));
  rows.push({ordinal:heading.ordinal,title,level:heading.level,anchors:heading.anchors,sectionAnchor:heading.sectionAnchor,bodySha256:sha(text),bodyEmpty:text.length===0,tables});
 }
 return rows;
}

export const structureSha=rows=>sha(JSON.stringify(rows.map(h=>[h.ordinal,h.title,h.level,h.anchors,h.sectionAnchor])));

// A stable title/anchor layout does not prove that a publication label stayed the same.
export function verifyClassSourceLabels(snapshotHeadings,html){
 const labels=rows=>rows.map(h=>[h.ordinal,h.explicitSources]);
 if(JSON.stringify(labels(snapshotHeadings))!==JSON.stringify(labels(classHeadings(html).headings)))throw Error('Class publication labels changed');
 return true;
}

export function verifyClassBodyPrefix(html,ordinal,prefix){
 const start=html.search(/<div\b[^>]*class="card__body new-article"[^>]*>/),end=html.indexOf('<div class="card__footer"',start);
 if(start<0||end<start)throw Error('Missing article boundary');
 const article=html.slice(start,end),heads=[...article.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].filter(m=>decode(m[2].replace(/<[^>]*>/g,' ')).trim());
 const h=heads[ordinal-1];if(!h||!prefix)throw Error('Missing source prefix evidence');
 const text=decode(article.slice(h.index+h[0].length,heads[ordinal]?.index??article.length).replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
 if(!text.startsWith(prefix))throw Error('Leading source label changed');return true;
}
