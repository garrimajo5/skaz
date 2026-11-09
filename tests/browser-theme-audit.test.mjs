import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../scripts/browser-theme-audit.js',import.meta.url),'utf8');
function element(label,style={},parent=null,tag='SPAN'){return {tagName:tag,id:'',className:'',parentElement:parent,childNodes:label?[{nodeType:3,textContent:label}]:[],style:{display:'block',visibility:'visible',opacity:'1',color:'rgb(255, 255, 255)',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',filter:'none',mixBlendMode:'normal',fontSize:'14px',fontWeight:'400',borderTopColor:'rgb(255, 255, 255)',...style},getClientRects:()=>[{}],getAttribute:()=>null,matches:()=>false};}
function run(nodes,body,modal=null,active=null){body.dataset={theme:'fixture'};body.querySelectorAll=q=>q==='*'?nodes:nodes.filter(n=>n.tagName==='INPUT'&&(q.includes('[placeholder]')?n.placeholder:true));if(modal)modal.querySelectorAll=body.querySelectorAll;const context=vm.createContext({Node:{TEXT_NODE:3},document:{body,activeElement:active,querySelector:()=>modal},getComputedStyle:(e,pseudo)=>pseudo?e.placeholderStyle:e.style,location:{hash:'#fixture'},innerWidth:820,innerHeight:1180});return vm.runInContext(source+';auditSkazTheme()',context);}

test('shown placeholder includes pseudo opacity and excludes filled fields',()=>{
 const body=element('',{backgroundColor:'rgb(0, 0, 0)'}),input=element('',{},body,'INPUT'),filled=element('',{},body,'INPUT');
 for(const e of [input,filled]){e.placeholder='Search';e.getAttribute=()=>e.placeholder;e.placeholderStyle={color:'rgb(255, 255, 255)',opacity:'.3',filter:'none'};}
 input.matches=s=>s===':placeholder-shown';
 const r=run([input,filled],body);assert.equal(r.placeholders.length,1);assert.equal(r.placeholders[0].pass,false);assert.ok(r.placeholders[0].ratio<3);
 input.placeholderStyle.opacity='1';assert.equal(run([input],body).placeholders[0].pass,true);
});

test('focus outline uses external backdrop or inset fill and requires a visible stroke',()=>{
 const body=element('',{backgroundColor:'rgb(0, 0, 0)'}),button=element('Focus',{backgroundColor:'rgb(255, 255, 255)',outlineColor:'rgb(255, 255, 255)',outlineWidth:'2px',outlineStyle:'solid',outlineOffset:'3px'},body,'BUTTON');button.matches=s=>s===':focus-visible';
 assert.equal(run([button],body,null,button).focus.pass,true);
 button.style.outlineOffset='-2px';assert.equal(run([button],body,null,button).focus.pass,false);
 button.style.outlineOffset='3px';button.style.outlineWidth='0px';assert.equal(run([button],body,null,button).focus.pass,false);
 button.style.outlineWidth='2px';button.style.outlineStyle='none';assert.equal(run([button],body,null,button).focus.pass,false);
});

test('focus and placeholder on exposed gradients remain manual; absent focus is not a pass',()=>{
 const body=element('',{backgroundColor:'rgb(0, 0, 0)',backgroundImage:'linear-gradient(black,white)'}),input=element('',{outlineColor:'rgb(255, 255, 255)',outlineWidth:'2px',outlineStyle:'solid',outlineOffset:'3px'},body,'INPUT');
 input.placeholder='Search';input.getAttribute=()=>input.placeholder;input.placeholderStyle={color:'rgb(255, 255, 255)',opacity:'1',filter:'none'};input.matches=()=>true;
 const r=run([input],body,null,input);assert.equal(r.focus.pass,null);assert.equal(r.placeholders[0].pass,null);
 input.matches=()=>false;assert.equal(run([input],body,null,input).focus.pass,null);
});
test('live audit composites inherited group opacity and CSS color(srgb)',()=>{const body=element('',{backgroundColor:'rgb(0, 0, 0)'}),group=element('',{opacity:'.4'},body),text=element('dim',{color:'color(srgb 1 1 1)'},group);const r=run([text],body);assert.equal(r.rows[0].pass,false);assert.equal(r.rows[0].foreground[0],102);assert.ok(r.rows[0].ratio<4.5);});
test('opaque child hides ancestor gradient; transparent text requires manual review',()=>{const body=element('',{backgroundColor:'rgb(0, 0, 0)',backgroundImage:'linear-gradient(black,white)'}),opaque=element('opaque',{backgroundColor:'rgb(0, 0, 0)'},body),clear=element('clear',{},body);const r=run([opaque,clear],body);assert.equal(r.rows[0].pass,true);assert.equal(r.rows[1].pass,null);});
test('known brightness hover is measured; unknown effects are never certified',()=>{const body=element('',{backgroundColor:'rgb(0, 0, 0)'}),text=element('hover',{color:'rgb(100, 100, 100)',filter:'brightness(1.08)'},body),unknown=element('blur',{filter:'blur(1px)'},body);const r=run([text,unknown],body);assert.equal(r.rows[0].foreground[0],108);assert.equal(r.rows[1].pass,null);});
test('weak field edge fails despite readable text; hidden content is excluded',()=>{const body=element('',{backgroundColor:'rgb(0, 0, 0)'}),input=element('',{borderTopColor:'rgb(10, 10, 10)'},body,'INPUT'),hidden=element('hidden',{display:'none'},body);const r=run([input,hidden],body);assert.equal(r.rows.length,1);assert.equal(r.rows[0].pass,true);assert.equal(r.fields[0].pass,false);});
