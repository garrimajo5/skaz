// Review aid only: perceptual proximity never proves duplication or acceptance.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeSource,derivePng} from './art-derivatives.mjs';
import {createArtLibrary} from '../server/art-library.mjs';

const edge=32;
const cos=Array.from({length:8},(_,u)=>Array.from({length:edge},(_,x)=>Math.cos((2*x+1)*u*Math.PI/(2*edge))));
export function perceptualHash(bytes,background=0){
 if(background!==0&&background!==255)throw Error('Invalid hash background');
 const src=decodeSource(derivePng(bytes,edge)),values=new Float64Array(edge*edge);
 // Fit without stretching and composite alpha before luminance. Transparent RGB
 // must not affect similarity; both black and white surfaces are assessed.
 values.fill(background);
 const ox=Math.floor((edge-src.width)/2),oy=Math.floor((edge-src.height)/2);
 for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
  const i=(y*src.width+x)*src.channels,a=src.channels===4?src.pixels[i+3]/255:1;
  values[(y+oy)*edge+x+ox]=(0.2126*src.pixels[i]+0.7152*src.pixels[i+1]+0.0722*src.pixels[i+2])*a+background*(1-a);
 }
 const coefficients=[];
 for(let v=0;v<8;v++)for(let u=0;u<8;u++){
  if(u===0&&v===0)continue;
  let sum=0;for(let y=0;y<edge;y++)for(let x=0;x<edge;x++)sum+=values[y*edge+x]*cos[u][x]*cos[v][y];
  coefficients.push(Math.abs(sum)<1e-7?0:sum);
 }
 const median=[...coefficients].sort((a,b)=>a-b)[31];
 return coefficients.reduce((hash,value)=>(hash<<1n)|(value>median?1n:0n),0n).toString(16).padStart(16,'0');
}
export function hashDistance(a,b){
 if(!/^[0-7][0-9a-f]{15}$/.test(a)||!/^[0-7][0-9a-f]{15}$/.test(b))throw Error('Invalid perceptual hash');
 let bits=BigInt('0x'+a)^BigInt('0x'+b),count=0;
 while(bits){bits&=bits-1n;count++;}return count;
}
export function similarPairs(entries,maxDistance=10){
 if(!Number.isSafeInteger(maxDistance)||maxDistance<0||maxDistance>63)throw Error('Invalid similarity threshold');
 const sorted=[...entries].sort((a,b)=>a.id.localeCompare(b.id)),seen=new Set();
 for(const e of sorted){if(typeof e.id!=='string'||!e.id||seen.has(e.id))throw Error('Invalid or duplicate art ID');seen.add(e.id);hashDistance(e.dark,e.light);}
 const pairs=[];
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
  const a=sorted[i],b=sorted[j],dark=hashDistance(a.dark,b.dark),light=hashDistance(a.light,b.light);
  if(Math.max(dark,light)<=maxDistance)pairs.push({ids:[a.id,b.id],distance:{dark,light},review:'required'});
 }
 return pairs.sort((a,b)=>Math.max(a.distance.dark,a.distance.light)-Math.max(b.distance.dark,b.distance.light)||a.ids.join('|').localeCompare(b.ids.join('|')));
}
export function measureSimilarity(library){
 const entries=library.index().entries.map(e=>{const file=library.read(e.files.thumbnail.url);if(!file)throw Error('Missing art: '+e.id);return {id:e.id,dark:perceptualHash(file.bytes,0),light:perceptualHash(file.bytes,255)};});
 return {schemaVersion:1,method:'63-bit DCT pHash; 32px alpha composite on black and white; maximum distance 10 on BOTH',purpose:'Candidates for human comparison only; not duplicate detection, mechanical validation or acceptance',count:entries.length,pairs:similarPairs(entries),fingerprints:entries.sort((a,b)=>a.id.localeCompare(b.id))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=measureSimilarity(createArtLibrary(JSON.parse(readFileSync('catalog/art-manifest.json')),{base:process.cwd()}));
 if(process.argv.includes('--write'))writeFileSync('docs/design/art-similarity.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({count:report.count,pairs:report.pairs},null,2));
}
