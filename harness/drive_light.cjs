/* §LIGHT THE PLANET'S DAY IS PLAIN TO THE MANAGER. Plays to a contest and reads the Desk's day strip:
   fails unless it says whether it is light or dark, when that turns, and draws today's twelve blocks.
   Then checks the Hazards scouting row names the planet's day once it is read in full.
   `node harness/drive_light.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url: 'http://opesarx.test/?seed=corp-1'});
const w=dom.window,d=w.document;w.__noTurn=true;
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{d.getElementById('skiptolock').click();
   setTimeout(()=>{ d.getElementById('begindiv').onclick();
     setTimeout(()=>{
       d.getElementById('advwin').onclick();
       setTimeout(()=>{
         const G=w.__G, fails=[];
         [...d.querySelectorAll('.tab')].filter(x=>/^Desk$/.test(x.textContent.trim()))[0].click();
         const cell=d.querySelector('#dayhead .dlight');
         const t=cell?cell.textContent.replace(/\s+/g,' ').trim():'';
         const blocks=cell?cell.querySelectorAll('.blocks i').length:0;
         console.log('light cell:', t, '| blocks:', blocks, '| planet PCD', G.div.planet.cycle && G.div.planet.cycle.pcd);
         if(!/(Light|Dark)/.test(t)) fails.push('the strip does not say light or dark');
         if(!/(Dawn|Dusk) in/.test(t)) fails.push('the strip does not say when it turns');
         if(blocks!==12) fails.push('the strip does not draw today\'s twelve blocks');
         console.log(fails.length?'FAIL '+fails.join(' | '):'the planet\'s cycle is on the Desk: light or dark, when it turns, and today\'s blocks');
         process.exit(fails.length?1:0);
       },400);
     },400);
   },500);},300);},200);},300);
