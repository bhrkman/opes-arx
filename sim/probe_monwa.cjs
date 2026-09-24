/* A SQUAD OF EIGHT MON-WA AGAINST EIGHT HUMANS, on the grid, both sides kitted the same.
   One seat is one pair, so eight seats of Mon-Wa is SIXTEEN bodies against eight — the
   question the one-seat ruling asks is whether two guns behind one wound track is a bargain
   or a liability. Read in SEATS: a pair with either half down is a seat out of the fight,
   which is what a squad actually loses. `node sim/probe_monwa.cjs [engagements]` */
const D='/home/claude/opes-arx/sim/';
const fs=require('fs');
const P=require(D+'prng.js'), R=require(D+'roster.js'), C=require(D+'combat.js'),
      T=require(D+'tactical.js'), I=require(D+'items.js'), M=require(D+'map.js');
const oa=JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json','utf8')).oa_profiles;

function side(rng, race, seats, prof, policy) {
  /* draw until we have `seats` BEINGS of the race asked for */
  const bodies=[]; let seatsGot=0, guard=0;
  while (seatsGot<seats && guard++<400) {
    const b=R.generateSquad(rng, 6, { corpId: prof.id, race: race }).bodies.filter(f=>f.race===race);
    for (const f of b) {
      if (seatsGot>=seats) break;
      if (f.mirror_of) continue;                 /* halves arrive with their partner below */
      bodies.push(f); seatsGot++;
      if (f.bond_partner) { const mate=b.find(x=>x.id===f.bond_partner); if (mate) bodies.push(mate); }
    }
  }
  I.equipForce(bodies, 'balanced');
  let cap=bodies[0]; for (const b2 of bodies) if (b2.stats.tactics>cap.stats.tactics) cap=b2;
  const units=bodies.map(f=>C.makeCombatant(f,{traitIndex:R.traitById,isCaptain:f.id===cap.id,day:12}));
  const byId={}; units.forEach(u=>byId[u.id]=u);
  units.forEach(u=>{
    if (u.ref.bond_partner && byId[u.ref.bond_partner] && !u.pair) {
      const o=byId[u.ref.bond_partner];
      const pair={comp:Math.round((u.comp+o.comp)/2),halves:[u,o],downed:false,strained:false};
      u.pair=pair;o.pair=pair;u.comp=o.comp=pair.comp;
    }
  });
  return {corpId:prof.id,policy:policy,units,hasMedkit:true,fidelity:C.captainFidelity(cap,R.traitById)};
}

const N=+(process.argv[2]||120);
let aSeatsT=0,bSeatsT=0;
let aWin=0,bWin=0,draw=0, aDeadT=0,bDeadT=0, aDownT=0,bDownT=0, turns=0, aShots=0,bShots=0;
for (let i=0;i<N;i++){
  const rng=P.mulberry32(P.seedFrom('mwfight'+i));
  const A=side(rng,'mon_wa',8,oa[0],'standard');
  const B=side(rng,'human',8,oa[1],'standard');
  const planet=M.generatePlanet(P.mulberry32(P.seedFrom('mwground'+i)),{season:1});
  const res=T.resolve(P.mulberry32(P.seedFrom('mwres'+i)),[A,B],{planet:planet,day:12,x:planet.cx,y:planet.cy});
  const cnt=(s,st)=>s.units.filter(u=>u.state===st).length;
  const aDead=cnt(A,'dead'), bDead=cnt(B,'dead');
  const aUp=A.units.filter(u=>u.state==='ok'||u.state==='light').length;
  const bUp=B.units.filter(u=>u.state==='ok'||u.state==='light').length;
  aDeadT+=aDead; bDeadT+=bDead;
  aDownT+=A.units.length-aUp; bDownT+=B.units.length-bUp;
  turns+=res.exchanges||0; aShots+=(res.shotsBy&&res.shotsBy[0])||0; bShots+=(res.shotsBy&&res.shotsBy[1])||0;
  /* a side is beaten when it has no seat left standing: a pair with either half down is out */
  const seatsUp=(S)=>{const seen={};let n=0;S.units.forEach(u=>{const key=u.pair?u.pair.halves[0].id:u.id;if(seen[key])return;seen[key]=1;
    const ok=u.pair?u.pair.halves.every(h=>h.state==='ok'||h.state==='light'):(u.state==='ok'||u.state==='light');if(ok)n++;});return n;};
  const aSeats=seatsUp(A), bSeats=seatsUp(B);
  aSeatsT+=aSeats; bSeatsT+=bSeats;
  if (aSeats>bSeats) aWin++; else if (bSeats>aSeats) bWin++; else draw++;
}
const f=n=>(n/N).toFixed(2);
console.log('\nEIGHT SEATS OF MON-WA (16 bodies) v EIGHT HUMANS (8 bodies) \u00b7 '+N+' engagements, same kit');
console.log('  left standing        Mon-Wa win '+aWin+'  Humans win '+bWin+'  even '+draw);
console.log('  per engagement       Mon-Wa dead '+f(aDeadT)+' of 16, out of action '+f(aDownT));
console.log('                       Humans dead '+f(bDeadT)+' of 8,  out of action '+f(bDownT));
console.log('  share of the side lost   Mon-Wa '+(aDownT/N/16*100).toFixed(0)+'%   Humans '+(bDownT/N/8*100).toFixed(0)+'%');
console.log('  seats still standing Mon-Wa '+f(aSeatsT)+' of 8   Humans '+f(bSeatsT)+' of 8');
console.log('  mean exchanges       '+f(turns));
