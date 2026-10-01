/* §PRIZE THE RECAP SHOWS THE STORES. Plays a contest to its end, gives the outcome the stores a
   winner of a rich planet brings home, and reads the recap: fails if the stores are not listed
   beside the credits. `node harness/drive_recap.cjs` */
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
       const G=w.__G; let k=0;
       while(G.div && !G.div.done && k++<60) d.getElementById('advwin').onclick();
       setTimeout(()=>{
         const bo=G._boardOutcome||{};
         G._boardOutcome = G._boardOutcome || {};
         G._boardOutcome.banked = { minerals: 1.0, foods: 0.42, fuels: 0.12 };   /* as a winner of a rich planet would bring home */
         try{ w.__showRecap(); }catch(e){ console.log('recap error', e.message); }
         const t=(d.getElementById('recapbody')||{}).textContent||'';
         const i=t.indexOf('Stores');
         const ok = i >= 0 && /A Full Hold/.test(t) && /Half a Hold/.test(t);
         console.log(ok ? 'the recap lists the stores beside the credits' : 'FAIL the recap does not list the stores');
         process.exit(ok ? 0 : 1);
       },500);
     },400);
   },500);},300);},200);},300);
