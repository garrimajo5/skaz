// QA-only shortcut; injected only by the loopback RAM fixture, never app build.
addEventListener('keydown',async event=>{
 if(!event.ctrlKey||!event.shiftKey)return;
 const key=event.code;if(!['KeyY','Digit1','Digit2','Digit3'].includes(key))return;
 event.preventDefault();
 const capture=key==='KeyY';
 const data=capture?auditSkazTheme():{mode:({Digit1:'normal',Digit2:'pending',Digit3:'conflict'})[key]};
 try{const response=await fetch(capture?'/_qa/report':'/_qa/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!response.ok)throw Error('HTTP '+response.status);const result=await response.json();console.info('QA theme '+(capture?'capture '+result.count:result.mode));}
 catch(error){console.error('QA measurement not saved',error.message);}
});
