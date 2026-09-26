/* §MARKET THE WITHDRAWAL MARKET, MEASURED: offers posted, exits by deal against banners pulled, promises kept, the share
   of the pot that reaches anyone but the winner, and fatality — over N AI contests. `node harness/probe_market.cjs [n]` */
const D=require('path').join(__dirname,'..','sim')+'/',fs=require('fs');const P=require(D+'prng.js'),S=require(D+'season.js'),DIV=require(D+'divide.js');
const oa=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','data','oa_profiles.json'))).oa_profiles;
const N=+(process.argv[2]||6);const t={offers:0,takenBack:0,standDowns:0,pulled:0,walked:0,promises:0,kept:0,paidToLeavers:0,pot:0,dead:0,drop:0};const asks=[];
for(let s=1;s<=N;s++){const rng=P.mulberry32(P.seedFrom((process.env.SEEDP||'mkt')+s));const c=S.openFleet(rng,oa,{});const st=S.beginSeason(rng,c,oa,{});while(st.month<=11)S.stepMonth(st);S.closeSeasonToDrop(st);const d=S.prepareDivide(st);const r=DIV.runDivide(d.rng,d.opts);
 const a=r.audit||{};t.offers+=(a.offerLog||[]).length;(a.offerLog||[]).forEach(o=>asks.push(o.ask));t.takenBack+=a.withdrawTakenBack||0;t.pulled+=a.bannersPulled||0;t.walked+=a.walkedAway||0;
 t.standDowns+=(r.perCorp||[]).filter(x=>x.withdrawn||x.standDown).length;
 const pr=r.promises||(r.settlement&&r.settlement.promises)||[];t.promises+=pr.length;t.kept+=pr.filter(x=>x.kept).length;
 const take=(r.settlement||{}).take||{};t.pot+=(r.settlement||{}).pot||0;for(const id in take)if(id!==r.winner&&take[id]>0)t.paidToLeavers+=take[id];
 t.dead+=r.dead||0;(r.perCorp||[]).forEach(x=>t.drop+=x.dropped||0);}
console.log(JSON.stringify(t));
console.log('offers a contest',(t.offers/N).toFixed(1),'| asks',asks.slice(0,10).join(' '),'| exits by deal',t.standDowns-t.pulled-t.walked,'| banners pulled',t.pulled,'| walked',t.walked,'| share of pot paid to anyone but the winner',(100*t.paidToLeavers/Math.max(1,t.pot)).toFixed(1)+'%','| fatality',(100*t.dead/t.drop).toFixed(1)+'%');
