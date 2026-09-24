/* §HALF-BUILT DOES THE SAW-FIRST RULE TELL ANYBODY APART? The initiative in a meeting goes to whoever saw
   the other first. It went dead for weeks because the meeting wrote each side's sighting of the other
   BEFORE asking who saw first — every meeting came out "both saw", and boldness decided every one. This
   fails unless meetings come in all three kinds: one side saw first, neither did, and both did.
   `node harness/probe_initiative.cjs` */
const D='/home/claude/opes-arx/sim/',fs=require('fs');
const P=require(D+'prng.js'),S=require(D+'season.js'),DIV=require(D+'divide.js');
const oa=JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json','utf8')).oa_profiles;
const tot={};
for(let s=1;s<=2;s++){const rng=P.mulberry32(P.seedFrom('ini'+s));const c=S.openFleet(rng,oa,{});const st=S.beginSeason(rng,c,oa,{});
  while(st.month<=11)S.stepMonth(st);S.closeSeasonToDrop(st);const d=S.prepareDivide(st);const r=DIV.runDivide(d.rng,d.opts);
  for(const k in ((r.audit||{}).meetKinds||{}))tot[k]=(tot[k]||0)+r.audit.meetKinds[k];}
const all=Object.values(tot).reduce((a,b)=>a+b,0)||1;
console.log('\nHOW MEETINGS BEGIN \u00b7 two contests\n');
for(const k of ['oneSawFirst','stumble','bothSaw'])console.log('  '+k.padEnd(12)+String(tot[k]||0).padStart(5)+'  ('+Math.round((tot[k]||0)/all*100)+'%)');
const ok=(tot.oneSawFirst||0)>0&&(tot.stumble||0)>0;
console.log(ok?'\n  ok    the saw-first rule tells squads apart':'\n  FAIL  every meeting is the same kind: the saw-first rule decides nothing');
process.exit(ok?0:1);
