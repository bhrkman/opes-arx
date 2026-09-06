/* THE TABLE'S BASELINE: one Divide per seed — offers, refusals by cause (the seller's floor over
   the buyer's ceiling, or the crowd's wall), joins, deals in kind, claims, stand-downs, the day
   the contest ends and how many banners stood. `node measure_table.cjs <seed> '{"GREED_HOLDOUT":0.25}'`
   sweeps a constant. The numbers PROJECT.md quotes came from here. */
const fs=require('fs');
const P=require('./prng.js'), S=require('./season.js'), D=require('./divide.js'), NEG=require('./negotiate.js');
const oa=JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json','utf8')).oa_profiles;
const cfg=JSON.parse(process.argv[3] || '{}'); Object.assign(NEG.CONST,cfg);   /* constant overrides to sweep */
const seed=process.argv[2] || '1';
const rng=P.mulberry32(P.seedFrom('measure-'+seed));
const corps=S.openFleet(rng, oa, {});
const st=S.beginSeason(rng, corps, oa, {});
while (st.month <= 11) S.stepMonth(st);
S.closeSeasonToDrop(st);
const d=S.prepareDivide(st);
const res=D.runDivide(d.rng, d.opts);
let minOverMax=0,wall=0; (res.refusals||[]).forEach(r=>{const w=r.why||{}; if(w.wall) wall++; else if(w.joinerMin>w.principalMax) minOverMax++;});
S.finishSeason(st,res);
let dead=0, bodies=0; for (const id in corps){ for (const b of corps[id].roster||[]) { bodies++; if (b.status==='dead') dead++; } }
const standing=(res.fallen||[]).filter(f=>f.how==='standing').length;
console.log(JSON.stringify({seed, joins:res.joins||0, kind:res.deals.filter(x=>x.resources&&x.resources.length).length, claims:res.deals.filter(x=>x.claims&&x.claims.length).length, offers:res.offersSent||0, refused:(res.refusals||[]).length, minOverMax, wall, standDowns:res.standDowns||0, endDay:res.days, standing, dead, bodies}));
