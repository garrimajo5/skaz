import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// Tiny DOM adapter only for lifecycle/transport races; visual and native input
// behavior are checked separately in the browser and on Android.
export class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;}
 get value(){return this.tagName==='select'&&this._value===''?(this.children.find(c=>c.tagName==='option')?.value||''):this._value;} set value(v){this._value=v;}
 append(e){this.children.push(e);e.parent=this;}
 replaceChildren(...children){this.children=[];for(const e of children)this.append(e);}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 querySelectorAll(selector){const tags=selector.split(',');return walk(this).filter(e=>tags.includes(e.tagName));}
 emit(type){for(const fn of this.listeners[type]||[])fn({preventDefault(){}});this.parent?.emit(type);}
}
export const walk=root=>root.children.flatMap(e=>[e,...walk(e)]);
export function environment(){const root=new Element('div'),ctx=vm.createContext({document:{createElement:tag=>new Element(tag)},crypto:{randomUUID:()=> 'mutation-ui-test'}});vm.runInContext(readFileSync(new URL('../../client/class-advancement.js',import.meta.url),'utf8')+';globalThis.editor=SkazClassAdvancement;',ctx);return {root,mount:ctx.editor.mount,button:text=>walk(root).find(e=>e.tagName==='button'&&e.textContent===text),status:()=>root.children[0].textContent};}
