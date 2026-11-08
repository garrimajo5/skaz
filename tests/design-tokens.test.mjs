import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
const css=await readFile(new URL('../client/style.css',import.meta.url),'utf8')+'\n'+await readFile(new URL('../client/quick.css',import.meta.url),'utf8');
const properties=body=>Object.fromEntries([...body.matchAll(/(--[\w-]+):([^;}]+)/g)].map(m=>[m[1],m[2].trim()]));
const base=Object.assign({},...[...css.matchAll(/:root\{([^}]+)\}/g)].map(m=>properties(m[1])));
const luminance=hex=>{assert.match(hex,/^#[0-9a-f]{6}$/i);const values=hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
for(const theme of ['coal','atlas','polar'])test('game token text contrast is at least 4.5:1 in '+theme,()=>{
 const colors={...base};for(const rule of css.matchAll(/body\[data-theme=["']?(\w+)["']?\]\{([^}]+)\}/g))if(rule[1]===theme)Object.assign(colors,properties(rule[2]));
 for(const foreground of ['--text','--muted','--accent','--green','--red','--warn'])for(const background of ['--bg','--panel','--raised'])assert.ok(contrast(colors[foreground],colors[background])>=4.5,theme+' '+foreground+' on '+background);
 assert.ok(contrast(colors['--ink'],colors['--accent'])>=4.5);assert.equal(colors['--ok'],'var(--green)');assert.equal(colors['--danger'],'var(--red)');
});
test('game size tokens preserve the declared readability and touch minimums',()=>{for(const[key,min]of [['--touch',44],['--resource-touch',48],['--ui-small',12],['--ui-secondary',14],['--ui-body',16],['--ui-number',28],['--ui-hp',48]]){assert.match(base[key],/^\d+px$/);assert.ok(parseInt(base[key])>=min,key);}assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);});
