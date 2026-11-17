import {createHash} from 'node:crypto';
export function classScope(page,sources,spec){
 const {subclasses,optionalAnchors,defaultSourceSubclasses}=spec;
 if(page.url!==spec.url)throw Error('Unexpected class page');
 const phb=sources.find(s=>s.title===(spec.baseSourceTitle||"Player's Handbook")),tce=sources.find(s=>s.title==="Tasha's Cauldron of Everything");if(!phb||!tce)throw Error('Missing baseline source');
 const records=[],excluded=[],seen=new Set();
 const baseStart=page.headings.find(h=>h.level===2&&h.anchors.includes(spec.baseSection));
 const baseEnd=page.headings.find(h=>h.level===2&&h.anchors.some(a=>subclasses.includes(a)));
 if(!baseStart||!baseEnd||baseStart.ordinal>=baseEnd.ordinal)throw Error('Missing base feature section');
 const parentSources=new Map();
 for(const anchor of subclasses){const heading=page.headings.find(h=>h.level===2&&h.anchors.includes(anchor));if(!heading)throw Error('Missing reviewed subclass');const resolved=heading.sourceResolution||[];if((!resolved.length&&!defaultSourceSubclasses.includes(anchor))||resolved.some(s=>s.status!=='source-identified'))throw Error('Unresolved subclass source');parentSources.set(anchor,resolved.length?resolved.flatMap(s=>s.sourceIds):[phb.sourceId]);}
 for(const h of page.headings){
  const own=h.anchors.find(a=>subclasses.includes(a)),base=h.level===3&&h.ordinal>baseStart.ordinal&&h.ordinal<baseEnd.ordinal&&(h.anchors.some(a=>a.startsWith('feature.'))||(spec.baseTitles||[]).includes(h.title));
  const feature=h.level===3&&subclasses.includes(h.sectionAnchor);
  if(!own&&!base&&!feature)continue;
  const exclusion=spec.exclusions.find(e=>e.parent===h.sectionAnchor&&e.title===h.title);if(exclusion){excluded.push({ordinal:h.ordinal,title:h.title,reason:exclusion.reason});continue;}
  if(h.inclusion!=='needs-section-source-review')throw Error('Excluded/unreviewed region selected');
  if(base&&(optionalAnchors.some(a=>h.anchors.includes(a))||(spec.optionalTitles||[]).includes(h.title))&&!h.optionalSourceTags.includes('TCE'))throw Error('Missing optional source evidence');
  if(h.optionalSourceTags.some(t=>t!=='TCE'))throw Error('Unexpected optional source');
  const override=spec.overrides.find(o=>o.parent===h.sectionAnchor&&o.title===h.title);
  const kind=override?.kind||(own?'subclass':base?'base-feature':'subclass-feature');
  const parent=own||(base?spec.baseSection:h.sectionAnchor);
  const headingKey=h.anchors[0]||createHash('sha256').update(h.title.normalize('NFKC').toLowerCase()).digest('hex').slice(0,16);
  const id='scope:'+spec.key+':'+parent+':'+headingKey;if(seen.has(id))throw Error('Duplicate reviewed heading');seen.add(id);
  const sourceIds=base?[h.optionalSourceTags.includes('TCE')?tce.sourceId:phb.sourceId]:parentSources.get(parent);
  if(!sourceIds?.length||sourceIds.some(id=>!sources.some(s=>s.sourceId===id)||sources.some(s=>s.sourceId===id&&s.group==='Homebrew')))throw Error('Missing or excluded proposal source');
  records.push({id,canonicalCatalogId:null,identityStatus:'proposal-observation',kind,title:h.title,sourceUrl:page.url+(h.anchors[0]?'#'+h.anchors[0]:'#'+parent),headingOrdinal:h.ordinal,parent,sourceIds,sourceBasis:base?(h.optionalSourceTags.length?'explicit-option-TCE-marker':'base-class-page-source'):(defaultSourceSubclasses.includes(parent)?'base-class-page-PHB':'explicit-subclass-source'),sourceCompleteness:'not-verified-in-full-text',observedInitialLevels:h.levelEvidence,levelProgression:'not-verified-by-heading',fullRules:'unverified',automation:'not-audited',inclusion:'proposed-2014-awaiting-review'});
 }
 if(!records.some(r=>r.kind==='base-feature'))throw Error('Missing base feature section');
 return {classUrl:page.url,inputPageSha256:page.rawSha256,status:'content-proposal-awaiting-independent-review',summary:Object.fromEntries(['base-feature','subclass','subclass-feature',...new Set(spec.overrides.map(o=>o.kind))].map(k=>[k,records.filter(r=>r.kind===k).length])),records,excluded};
}
