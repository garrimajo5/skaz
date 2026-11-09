// Image-only preparation for personal artwork. No HTTP route or storage is
// enabled here: callers must authorize the character before reading any file.
import {deflateSync} from 'node:zlib';
import {inspectPng,crc32,sha256} from '../scripts/art-registry.mjs';
import {decodeSource,derivePng} from '../scripts/art-derivatives.mjs';

export const personalArtLimits=Object.freeze({inputBytes:4*1024*1024,maxEdge:2048,masterEdge:512,thumbnailEdge:96});
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}

export function normalizePersonalArt(input,crop){
 if(!Buffer.isBuffer(input)||!input.length||input.length>personalArtLimits.inputBytes)throw Error('Personal image must be a PNG of at most 4 MiB');
 // Strict CRC/chunk/decoded-size validation happens before allocating pixels.
 // SVG, animation, EXIF/text and unknown chunks are rejected, not trusted.
 const info=inspectPng(input);
 const box=crop??{x:Math.floor((info.width-Math.min(info.width,info.height))/2),y:Math.floor((info.height-Math.min(info.width,info.height))/2),size:Math.min(info.width,info.height)};
 if(!box||typeof box!=='object'||Array.isArray(box)||Object.keys(box).some(k=>!['x','y','size'].includes(k))||!['x','y','size'].every(k=>Number.isSafeInteger(box[k]))||box.x<0||box.y<0||box.size<1||box.x+box.size>info.width||box.y+box.size>info.height)throw Error('Invalid personal image crop');
 const source=decodeSource(input),stride=box.size*4+1,raw=Buffer.alloc(stride*box.size);
 for(let y=0;y<box.size;y++)for(let x=0;x<box.size;x++){
  const from=((box.y+y)*source.width+box.x+x)*source.channels,to=y*stride+1+x*4;
  const alpha=source.channels===4?source.pixels[from+3]:255;
  // Hidden RGB is discarded as well as ancillary metadata.
  if(alpha)source.pixels.copy(raw,to,from,from+3);
  raw[to+3]=alpha;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(box.size);header.writeUInt32BE(box.size,4);header[8]=8;header[9]=6;
 const square=Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 const result={source:{width:info.width,height:info.height},crop:{...box},files:{}};
 for(const [role,edge] of [['master',personalArtLimits.masterEdge],['thumbnail',personalArtLimits.thumbnailEdge]]){
  const bytes=derivePng(square,edge),measured=inspectPng(bytes);
  result.files[role]={bytes,width:measured.width,height:measured.height,sha256:sha256(bytes),type:'image/png'};
 }
 return result;
}
