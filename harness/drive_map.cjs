/* §GROUND THE MAP, READ. Plays to the drop, advances a window, and reads the Ground page: a squad of yours stands on
   a region, the region's hover names it, its ground and who is in it, opening it shows its zones with their sites, and
   the Yours panel lists your squads with where they stand. `node harness/drive_map.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url: 'http://opesarx.test/?seed=corp-1'});
const w=dom.window,d=w.document;w.__noTurn=true;
const txt=h=>{const e=d.createElement('div');e.innerHTML=h;return e.textContent.replace(/\s+/g,' ').trim();};
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{d.getElementById('skiptolock').click();
   setTimeout(()=>{ d.getElementById('begindiv').onclick();
     setTimeout(()=>{
       d.getElementById('advwin').onclick();
       setTimeout(()=>{
         const G=w.__G, fails=[];
         [...d.querySelectorAll('.tab')].filter(x=>/^The Ground$/.test(x.textContent.trim()))[0].click();
         const D=w.__gDay();
         const mine=(D.squads||[]).filter(q=>q.oa===G.me);
         if(!mine.length) fails.push('no squad of yours on the map');
         const g=D.ground, rid=mine.length?g.zones[mine[0].zone].region:0;
         const regEl=d.querySelector('#gvmap [data-gvreg="'+rid+'"]');
         if(!regEl) fails.push('your squad\'s region is not drawn');
         else {
           const ev=new w.MouseEvent('mousemove',{bubbles:true,clientX:10,clientY:10}); Object.defineProperty(ev,'target',{value:regEl});
           d.getElementById('gvmap').onmousemove(ev);
           const tip=d.getElementById('gvtip').textContent.replace(/\s+/g,' ').trim();
           console.log('hover: '+tip.slice(0,140));
           if(!(new RegExp(g.regions[rid].name)).test(tip) || !/Ticks? a Step/.test(tip) || !/Alpha|Squad/.test(tip)) fails.push('the region hover does not name the region, its going and who is in it');
           regEl.dispatchEvent(new w.Event('click'));
           const zones=d.querySelectorAll('#gvregion [data-gvzone]').length;
           console.log('zones drawn: '+zones+' of '+g.regions[rid].zones.length);
           if(zones!==g.regions[rid].zones.length) fails.push('opening the region does not show every zone');
         }
         const kinds=new Set(g.sites.map(s=>s.kind));
         if(kinds.size<3) fails.push('the ground has too few kinds of site ('+[...kinds].join(',')+')');
         const yours=d.getElementById('gvorders').textContent.replace(/\s+/g,' ').trim();
         console.log('yours: '+yours.slice(0,140));
         if(!yours || /undefined|null/.test(yours)) fails.push('the Yours panel says nothing of your squads');
         console.log(fails.length ? 'FAIL ' + fails.join(' | ') : 'the map names its regions and sites, and your squads say where they stand');
         process.exit(fails.length ? 1 : 0);
       },400);
     },400);
   },500);},300);},200);},300);
