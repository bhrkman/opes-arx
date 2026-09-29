/* §SHOWN AUDIT 1's FIVE, ON THE PAGE. Plays to a contest and reads back what audit 1 found
   simulated and invisible: a fighter's morale and loyalty on the sheet, a squad's medkits on its
   card. Fails if any is missing.
   `node harness/drive_shown.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url: 'http://opesarx.test/?seed=corp-1'});
const w=dom.window,d=w.document;w.__noTurn=true;
const txt=id=>((d.getElementById(id)||{}).textContent||'').replace(/\s+/g,' ');
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{d.getElementById('skiptolock').click();
   setTimeout(()=>{ d.getElementById('begindiv').onclick();
     setTimeout(()=>{
       d.getElementById('advwin').onclick();
       setTimeout(()=>{
         const G=w.__G, fails=[];
         [...d.querySelectorAll('.tab')].filter(x=>/^Desk$/.test(x.textContent.trim()))[0].click();
         if(!/Medkits \d/.test(txt('tsquads'))) fails.push('no medkit count on the squad card');
         const who=d.querySelector('#tsquads [data-sheet]');
         if(who){ who.click(); const sheet=txt('unitpanel');
           if(!/Morale/.test(sheet)) fails.push('no morale on the fighter sheet');
           if(!/Loyalty/.test(sheet)) fails.push('no loyalty on the fighter sheet'); }
         else fails.push('no fighter to open');
         /* §ALEAS disqualification is gone with the cases (ruled): nothing on the ground is banned */
         console.log(fails.length?'FAIL '+fails.join(' | '):'morale, loyalty and medkits all reach the page');
         process.exit(fails.length?1:0);
       },400);
     },400);
   },500);},300);},200);},300);
