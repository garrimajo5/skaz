// Local, decorative UI symbols. Imported text can never select arbitrary SVG markup.
const SkazIcons=(()=>{
 const shapes={
 "play": "<path d=\"m12 3 9 6v6l-9 6-9-6V9zM3 9l9 6 9-6M12 15v6M12 3v6\"/>",
 "magic": "<path d=\"m4 20 12-12m-2-2 4 4M5 3v4M3 5h4M19 15v6M16 18h6M12 2v3\"/>",
 "bag": "<path d=\"M5 8h14l1 13H4zM8 8V6a4 4 0 0 1 8 0v2M9 12h6\"/>",
 "journal": "<path d=\"M6 3h14v18H6a3 3 0 0 1 0-6h14M6 3a3 3 0 0 0-3 3v12M9 7h7M9 11h5\"/>",
 "flag": "<path d=\"M5 22V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0\"/>",
 "map": "<path d=\"m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15\"/>",
 "library": "<path d=\"M3 4h4v17H3zM10 4h4v17h-4zM17 3l4 1 2 16-4 1zM3 8h4M10 8h4\"/>",
 "search": "<circle cx=\"10\" cy=\"10\" r=\"6\"/><path d=\"m15 15 6 6\"/>",
 "undo": "<path d=\"m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14\"/>",
 "rest": "<path d=\"M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z\"/>",
 "note": "<path d=\"M13 4H4v17h17v-9M16 3l5 5-9 9-5 1 1-5zM14 5l5 5\"/>",
 "settings": "<path d=\"M4 6h16M4 12h16M4 18h16\"/><circle cx=\"9\" cy=\"6\" r=\"2\"/><circle cx=\"16\" cy=\"12\" r=\"2\"/><circle cx=\"8\" cy=\"18\" r=\"2\"/>",
 "focus": "<circle cx=\"12\" cy=\"12\" r=\"7\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3\"/>",
 "mail": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 6 9 7 9-7\"/>",
 "monster": "<path d=\"m5 9-2-6 7 4h4l7-4-2 6v7l-7 5-7-5zM8 12h1M15 12h1M9 17h6\"/>",
 "school-abjuration": "<path d=\"m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6\"/>",
 "school-conjuration": "<ellipse cx=\"12\" cy=\"16\" rx=\"9\" ry=\"5\"/><path d=\"M12 17V3m-4 4 4-4 4 4M5 9v3M19 9v3\"/>",
 "school-divination": "<path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
 "school-enchantment": "<path d=\"M12 20 3 11C-2 3 9 0 12 7c3-7 14-4 9 4Z\"/>",
 "school-evocation": "<path d=\"m14 2-10 12h7l-1 8 10-12h-7z\"/>",
 "school-illusion": "<path d=\"M5 4h14v16H5zM2 8h6M16 16h6M9 8h6v8H9z\"/>",
 "school-necromancy": "<path d=\"M7 15a8 8 0 1 1 10 0v6H7zM10 18v3M14 18v3\"/><circle cx=\"8.5\" cy=\"10\" r=\"1.5\"/><circle cx=\"15.5\" cy=\"10\" r=\"1.5\"/>",
 "school-transmutation": "<path d=\"M3 7h15l-4-4M21 17H6l4 4M3 11V7M21 13v4\"/>",
 "school-unknown": "<path d=\"m12 2 10 10-10 10L2 12zM9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01\"/>"
};
 shapes.refresh='<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>';
 shapes.close='<path d="m6 6 12 12M18 6 6 18"/>';
 shapes.more='<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>';
 shapes.saved='<path d="m4 12 5 5L20 6"/>';
 shapes.pending='<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>';
 shapes.warning='<path d="m12 2 10 19H2zM12 8v5M12 17h.01"/>';
 shapes.offline='<path d="m3 3 18 18M2 8a17 17 0 0 1 6-3M13 4a17 17 0 0 1 9 4M6 12a11 11 0 0 1 5-2M17 11l1 1M9 16l3-1 3 1M12 20h.01"/>';
 const own=name=>Object.prototype.hasOwnProperty.call(shapes,name);
 function markup(name){return own(name)?'<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="#skaz-icon-'+name+'"/></svg>':'';}
 function mount(root=document){for(const node of root.querySelectorAll('[data-ui-icon]:not([data-icon-ready])')){node.setAttribute('data-icon-ready','');node.setAttribute('aria-hidden','true');node.innerHTML=markup(node.getAttribute('data-ui-icon'));}}
 function install(){const holder=document.createElement('div');holder.setAttribute('aria-hidden','true');holder.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;overflow:hidden" focusable="false"><defs>'+Object.entries(shapes).map(([name,body])=>'<symbol id="skaz-icon-'+name+'" viewBox="0 0 24 24">'+body+'</symbol>').join('')+'</defs></svg>';document.body.prepend(holder);mount();let queued=false;new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;mount();});}}).observe(document.body,{childList:true,subtree:true});}
 if(typeof document!=='undefined'&&typeof MutationObserver==='function')install();
 return {markup,mount,names:Object.freeze(Object.keys(shapes))};
})();
