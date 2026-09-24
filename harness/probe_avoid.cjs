/* §STANCE WHY DOES A CAREFUL SQUAD DIE MORE? Holds one OA's squads to a notch across four contests and
   breaks every one of its fights down: sought or found, how it ended, who ran, how the dead died
   (outright or on the recovery roll), and where the hits landed (range, per-hit lethality). Reads
   the fight recorder in divide.js (global.__FIGHTS). `node harness/probe_avoid.cjs <notch>` */
global.__FIGHTS=[];
const D='/home/claude/opes-arx/sim/',fs=require('fs');
const P=require(D+'prng.js'),S=require(D+'season.js'),DIV=require(D+'divide.js');
const oa=JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json')).oa_profiles;
const NOTCH=process.argv[2];let me=null;
for(let s=1;s<=4;s++){const rng=P.mulberry32(P.seedFrom('ss'+s));const c=S.openFleet(rng,oa,{});const st=S.beginSeason(rng,c,oa,{});
 while(st.month<=11)S.stepMonth(st);S.closeSeasonToDrop(st);const d=S.prepareDivide(st);me=st.ids[0];d.opts.human=me;
 const gen=DIV.divideCore(d.rng,d.opts);let step=gen.next();
 while(!step.done){const w=step.value,ans={};const mine=(w.corps||[]).find(x=>x.id===me);
  if(mine){ans.squadStance={};(mine.squads||[]).forEach((q,i)=>ans.squadStance[i]=NOTCH);}step=gen.next(ans);}
 global.__FIGHTS.forEach(f=>f.me=f.me||me);}
const mine=[];global.__FIGHTS.forEach(f=>{const r=f.rows.find(x=>x.corp===f.me);if(r){const foe=f.rows.filter(x=>x!==r);mine.push({f,r,foe});}});
const agg=(list)=>{const n=list.length;const lost=list.reduce((t,x)=>t+x.r.lost,0),dead=list.reduce((t,x)=>t+x.r.dead,0),flost=list.reduce((t,x)=>t+x.foe.reduce((a,b)=>a+b.lost,0),0),prep=list.reduce((t,x)=>t+x.r.prep,0)/Math.max(1,n),fprep=list.reduce((t,x)=>t+(x.foe[0]?x.foe[0].prep:0),0)/Math.max(1,n),size=list.reduce((t,x)=>t+x.r.n,0)/Math.max(1,n),fsize=list.reduce((t,x)=>t+x.foe.reduce((a,b)=>a+b.n,0),0)/Math.max(1,n);
 return 'fights '+String(n).padStart(3)+' | own lost/fight '+(lost/Math.max(1,n)).toFixed(2)+' (dead '+(dead/Math.max(1,n)).toFixed(2)+') | foe lost/fight '+(flost/Math.max(1,n)).toFixed(2)+' | prep own '+prep.toFixed(2)+' vs foe '+fprep.toFixed(2)+' | size own '+size.toFixed(1)+' vs foe '+fsize.toFixed(1);};
console.log(NOTCH.padEnd(16),'ALL     ',agg(mine));
console.log(''.padEnd(16),'SOUGHT  ',agg(mine.filter(x=>x.r.seeker)));
console.log(''.padEnd(16),'FOUND   ',agg(mine.filter(x=>x.r.found)));
console.log(''.padEnd(16),'NEITHER ',agg(mine.filter(x=>!x.r.seeker&&!x.r.found)));
{const n=mine.length;const ov=mine.filter(x=>x.r.gone/Math.max(1,x.r.n)>=0.5).length;
 console.log('   fled or panicked per fight '+(mine.reduce((t,x)=>t+x.r.gone,0)/n).toFixed(2)+' | withdrew in order per fight '+(mine.reduce((t,x)=>t+x.r.away,0)/n).toFixed(2)+' | fights where half or more ran '+ov+' of '+n);}
{const n=mine.length;const o=mine.reduce((t,x)=>t+x.r.outright,0),b=mine.reduce((t,x)=>t+x.r.bledOut,0);
 const sv={};mine.forEach(x=>(x.r.sev||'').split(',').filter(Boolean).forEach(k=>sv[k]=(sv[k]||0)+1));
 const tot=Object.values(sv).reduce((a,c)=>a+c,0)||1;
 console.log('   killed outright per fight '+(o/n).toFixed(2)+' | died on the recovery roll per fight '+(b/n).toFixed(2)+' | how the downed went down: '+Object.entries(sv).map(([k,v])=>k+' '+Math.round(v/tot*100)+'%').join(', '));}
{const n=mine.length;const h=mine.reduce((t,x)=>t+x.r.hitsTaken,0),sh=mine.reduce((t,x)=>t+x.r.shotsAt,0),o=mine.reduce((t,x)=>t+x.r.outright,0);
 const bands={0:0,1:0,2:0};mine.forEach(x=>(x.r.bandWhenHit||'').split('').forEach(b=>bands[b]=(bands[b]||0)+1));const bt=Object.values(bands).reduce((a,c)=>a+c,0)||1;
 console.log('   shots at us per fight '+(sh/n).toFixed(1)+' | hits taken per fight '+(h/n).toFixed(2)+' | enemy hit rate on us '+(h/Math.max(1,sh)*100).toFixed(1)+'% | killed outright per hit '+(o/Math.max(1,h)*100).toFixed(1)+'% | hit at long/medium/short '+[0,1,2].map(b=>Math.round((bands[b]||0)/bt*100)+'%').join('/'));}
{const tt={},bb={0:0,1:0,2:0};mine.forEach(x=>{tt[x.f.terrain]=(tt[x.f.terrain]||0)+1;bb[x.f.band]=(bb[x.f.band]||0)+1;});const n=mine.length;
 console.log('   terrain of our fights: '+Object.entries(tt).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+Math.round(v/n*100)+'%').join(', ')+' | opening range long/medium/short '+[0,1,2].map(b=>Math.round((bb[b]||0)/n*100)+'%').join('/'));}
{const n=mine.length;const pr=mine.reduce((t,x)=>t+x.r.prep,0)/n,fp=mine.reduce((t,x)=>t+(x.foe.length?x.foe.reduce((a,b)=>a+b.prep,0)/x.foe.length:0),0)/n;
 const fl=mine.filter(x=>x.r.flanked).length,ob=mine.filter(x=>x.r.objective>0).length;
 console.log('   our preparedness '+pr.toFixed(2)+' vs theirs '+fp.toFixed(2)+' | we were flanked in '+fl+' of '+n+' | fought over a site in '+ob+' of '+n);}
{const own={},foe={};mine.forEach(x=>{(x.r.ranges||'').split(',').forEach(r=>own[r]=(own[r]||0)+1);x.foe.forEach(f=>(f.ranges||'').split(',').forEach(r=>foe[r]=(foe[r]||0)+1));});
 const pct=o=>{const t=Object.values(o).reduce((a,c)=>a+c,0)||1;return ['long','medium','short'].map(k=>k+' '+Math.round((o[k]||0)/t*100)+'%').join(' ');};
 console.log('   our guns: '+pct(own)+' | the guns across from us: '+pct(foe));}
{const all=[];mine.forEach(x=>(x.r.closeHits||[]).forEach(h=>all.push(h)));const n=all.length||1;
 const m=k=>(all.reduce((t,h)=>t+h[k],0)/n).toFixed(1);
 console.log('   CLOSE HITS ON US: '+all.length+' | began '+m('d0')+' tiles apart, shot at '+m('d1')+' | the SHOOTER walked in '+m('shooterIn')+' tiles, WE walked in '+m('targetIn')+' | shooter arrived mid-fight '+Math.round(all.filter(h=>h.arrived).length/n*100)+'% | mean turn '+m('turn'));}
{const n=mine.length;const t=mine.reduce((a,x)=>a+(x.f.turns||0),0)/n,sd=mine.reduce((a,x)=>a+x.f.rows.length,0)/n;
 const two=mine.filter(x=>x.f.rows.length===2),multi=mine.filter(x=>x.f.rows.length>2);
 const dpf=l=>l.length?(l.reduce((a,x)=>a+x.r.dead,0)/l.length).toFixed(2):'-';
 const tpf=l=>l.length?(l.reduce((a,x)=>a+(x.f.turns||0),0)/l.length).toFixed(1):'-';
 console.log('   FIGHT LENGTH '+t.toFixed(1)+' turns | sides per fight '+sd.toFixed(1)+' | two-sided: '+two.length+' fights, '+tpf(two)+' turns, '+dpf(two)+' dead | three or more: '+multi.length+' fights, '+tpf(multi)+' turns, '+dpf(multi)+' dead');}
{const found=mine.filter(x=>x.r.found);const b={};found.forEach(x=>{const k=x.f.day<=7?'days 1-7':x.f.day<=14?'days 8-14':x.f.day<=20?'days 15-20':'days 21+';b[k]=(b[k]||0)+1;});
 const gone=found.filter(x=>x.f.rows.some(r=>r===x.r)&&x.r.grounded).length;
 console.log('   FOUND BY DAY: '+['days 1-7','days 8-14','days 15-20','days 21+'].map(k=>k+' '+(b[k]||0)).join(' | ')+' | of '+found.length);}
/* who broke off: the result names the sides that disengaged (A, B, ...); ours is our row's letter */
const cls={held:{n:0,lost:0,dead:0},broke:{n:0,lost:0,dead:0}};
mine.forEach(x=>{const own=x.f.rows.indexOf(x.r);const L=String.fromCharCode(65+own);const res=x.f.result||'';
 const m=res.match(/^disengage_([A-Z]+|both)$/);const we=m&&(m[1]==='both'||m[1].indexOf(L)>=0);
 const k=we?'broke':'held';cls[k].n++;cls[k].lost+=x.r.lost;cls[k].dead+=x.r.dead;});
for(const k of ['held','broke']){const v=cls[k];console.log('   '+(k==='held'?'held the ground ':'broke off       ')+' fights '+String(v.n).padStart(3)+' | lost/fight '+(v.lost/Math.max(1,v.n)).toFixed(2)+' | died/fight '+(v.dead/Math.max(1,v.n)).toFixed(2)+' | share of the lost who died '+(v.lost?Math.round(v.dead/v.lost*100):0)+'%');}
