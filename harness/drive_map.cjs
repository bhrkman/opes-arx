/* §GROUND THE MAP, READ. Plays to the drop, advances a window, and reads the Ground's hover
   for a squad of yours and for the sites — through the two functions that build it, since
   the harness has no layout to point a mouse at. Fails if the sites are not told what they
   are or a squad's hover does not list who is in it. `node harness/drive_map.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://opesarx.test/'});
const w=dom.window,d=w.document;w.__noTurn=true;
const txt=h=>{const e=d.createElement('div');e.innerHTML=h;return e.textContent.replace(/\s+/g,' ').trim();};
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{d.getElementById('skiptolock').click();
   setTimeout(()=>{ d.getElementById('begindiv').onclick();
     setTimeout(()=>{
       d.getElementById('advwin').onclick();
       setTimeout(()=>{
         const G=w.__G, D=w.__gDay();
         const mine=(D.sq||[]).find(q=>q.s>=0 && !q.ghost && !q.met);
         const fails=[];
         const st=mine ? txt(w.__gtip.squadTip(mine)) : '';
         console.log('squad: ' + st.slice(0,110));
         if(!mine) fails.push('no squad of yours on the map');
         else if(!/Standing|Hurt|Down/.test(st) || (st.match(/\u00b7/g)||[]).length < 2) fails.push('the squad hover does not list its fighters');
         const kinds=new Set((D.obj||[]).map(o=>o.t));
         if(kinds.size < 3) fails.push('the map is not told what its sites are (' + [...kinds].join(',') + ')');
         (D.obj||[]).slice(0,3).forEach(o=>{ const t=txt(w.__gtip.siteTip(o)); console.log('site:  ' + t);
           if(!t || /undefined/.test(t)) fails.push('a site hover says nothing: ' + o.t); });
         console.log(fails.length ? 'FAIL ' + fails.join(' | ') : 'the map names its sites, and your squads say who is in them');
         process.exit(fails.length ? 1 : 0);
       },400);
     },400);
   },500);},300);},200);},300);
