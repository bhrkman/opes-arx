/* §SEATS CAUTION OR COMPOSITION? Identical founded OAs; each seat is given a temperament and a FORCED squad count, the
   list rotated each contest, one fresh season each. natural | crossed | stance_eqsq | squads_eqst. node sim/measure_composition.cjs EXP FROM TO */
const D=__dirname+'/',fs=require('fs');const P=require(D+'prng.js'),S=require(D+'season.js'),DIV=require(D+'divide.js');
const oa=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','data','oa_profiles.json'))).oa_profiles;
const CAUT={lean:'preservationist',aggr:30,pat:70}, BOLD={lean:'unyielding',aggr:85,pat:35}, MID={lean:'standard',aggr:50,pat:50};
const EXP={
 /* stance varies, squads forced equal */
 stance_eqsq:[[CAUT,3],[CAUT,3],[{lean:'measured',aggr:45,pat:60},3],[{lean:'measured',aggr:45,pat:60},3],[MID,3],[MID,3],[BOLD,3],[BOLD,3]],
 /* temperament identical, squad count varies */
 squads_eqst:[[MID,2],[MID,2],[MID,3],[MID,3],[MID,4],[MID,4],[MID,5],[MID,5]],
 /* crossed: caution x squad count */
 crossed:[[CAUT,2],[CAUT,2],[CAUT,5],[CAUT,5],[BOLD,2],[BOLD,2],[BOLD,5],[BOLD,5]],
 /* natural: temperament picks its own squad count (control) */
 natural:[[CAUT,0],[CAUT,0],[CAUT,0],[CAUT,0],[BOLD,0],[BOLD,0],[BOLD,0],[BOLD,0]],
};
const [exp,a,b]=[process.argv[2],+process.argv[3],+process.argv[4]];const spec=EXP[exp];const T={};
for(let s=a;s<b;s++){let seats=spec.map((x,i)=>{const f=S.founderProfile(oa,'F'+(i+1),'founder_'+(i+1));f.dials=Object.assign({},f.dials,{aggression:x[0].aggr,patience:x[0].pat});f.engagement_lean=x[0].lean;f._sq=x[1];
  f._like=x[0].lean.slice(0,5)+'/'+(x[1]||'own')+'sq';return f;});
 const k=s%8;seats=seats.slice(k).concat(seats.slice(0,k));const like={},sq={};seats.forEach(p=>{like[p.id]=p._like;sq[p.id]=p._sq;});
 const rng=P.mulberry32(P.seedFrom('comp'+s));const c=S.openFleet(rng,seats,{});const st=S.beginSeason(rng,c,seats,{});
 while(st.month<=11)S.stepMonth(st);S.closeSeasonToDrop(st);S.draftAdvance(st,null,{force:true});const d=S.prepareDivide(st);
 for(const id in d.opts.corps) if(sq[id]) d.opts.corps[id]._wantSquads=sq[id];
 const r=DIV.runDivide(d.rng,d.opts);const fallen={};(r.fallen||[]).forEach(x=>fallen[x.id]=x.day);
 for(const cc of (r.corps||r._corps)){const e=(T[like[cc.id]]=T[like[cc.id]]||{wins:0,place:0,n:0,exit:0,squads:0,size:0,drop:0,sites:0});
  e.wins+=r.winner===cc.id?1:0;e.place+=r.placement[cc.id];e.n++;e.exit+=fallen[cc.id]||r.days;e.squads+=cc.squads.length;
  e.drop+=cc.squads.reduce((t,q)=>t+(q._startN||0),0);e.size+=cc.squads.reduce((t,q)=>t+(q._startN||0),0)/cc.squads.length;e.sites+=cc.sitesClaimed||0;}}
console.log(JSON.stringify(T));
