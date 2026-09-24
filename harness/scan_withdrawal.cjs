/* §WITHDRAWAL (stage 5) THE STRAGGLER SCAN. Fifty-four page references spoke of banners,
   joining and fighting under somebody else's flag. This opens the game, plays it to the
   lock, drops, and runs five comms windows, reading every live surface at three points for
   words that describe a thing the game no longer does. `node harness/scan_withdrawal.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://opesarx.test/'});
const w=dom.window,d=w.document;w.__noTurn=true;
const scan=(label)=>{
  const bad=[];
  ['tdeal','tstance','tsquads','encounters','dayhead','gboard','gevents','tword','techo','recapbody']
   .forEach(id=>{const el=d.getElementById(id);if(!el)return;
     const t=(el.textContent||'').replace(/\s+/g,' ');
     [/Join Their Banner/,/Take Them Under Yours/,/Fight Under/,/A Request to Join/,/\bBanner\b/]
       .forEach(re=>{const m=t.match(re);if(m)bad.push(id+': '+m[0]);});});
  console.log(label, bad.length?('STRAGGLERS '+bad.join(' | ')):'clean');
};
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{d.getElementById('skiptolock').click();
   setTimeout(()=>{ scan('at the lock: ');
     d.getElementById('begindiv').onclick();
     setTimeout(()=>{ scan('after the drop:');
       for(let k=0;k<5;k++) d.getElementById('advwin').onclick();
       setTimeout(()=>{ scan('mid-contest:  '); },400);
     },400);
   },500);},300);},200);},300);
