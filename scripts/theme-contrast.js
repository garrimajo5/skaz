/* Shared arithmetic for the browser fixture and regression tests. */
const SkazContrast=(()=>{
 function composite(front,back){const a=front[3]??1,b=back[3]??1,out=a+b*(1-a);return [0,1,2].map(i=>out?(front[i]*a+back[i]*b*(1-a))/out:0).concat(out);}
 function luminance(rgb){return rgb.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
 function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
 return {composite,luminance,ratio};
})();
if(typeof module!=='undefined')module.exports=SkazContrast;
