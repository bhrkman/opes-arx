const D='/home/claude/opes-arx/sim/',fs=require('fs');
const P=require(D+'prng.js'),C=require(D+'combat.js'),T=require(D+'tactical.js'),R=require(D+'roster.js'),I=require(D+'items.js'),M=require(D+'map.js');
const oa=JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json')).oa_profiles;
const GIVE=process.argv[2]==='none'?[]:['itm_spotter_drone','itm_auto_turret'];
/* §DEVICES THE DRONE AND THE TURRET, ON THE GRID. Side A carries a spotter drone and an auto-turret each,
   side B nothing; fails if either device stops being used, the turret stops hitting, or the replay
   stops recording them. Run with `none` for the control. `node harness/probe_devices.cjs` */
let dr=0,tu=0,ts=0,th=0,fx=0,fights=0,carried=0,winsA=0,downsB=0;
for(let i=0;i<40;i++){const rng=P.mulberry32(P.seedFrom('dv'+i));
 const mk=(prof,give)=>{const bodies=R.generateSquad(rng,5,{corpId:prof.id}).bodies;I.equipForce(bodies,'balanced');
   bodies.forEach(b=>{const lo=Object.assign({},b.loadout);delete lo.kit;lo.consumables=give.slice();I.equip(b,lo);});
   return {corpId:prof.id,policy:'standard',units:bodies.map(f=>C.makeCombatant(f,{traitIndex:R.traitById,day:5})),hasMedkit:false,fidelity:0.7};};
 const A=mk(oa[0],GIVE),B=mk(oa[1],[]);
 carried+=A.units.reduce((t,u)=>t+u.carried.length,0);
 const pl=M.generatePlanet(P.mulberry32(i),{season:1});
 const r=T.resolve(P.mulberry32(i+7),[A,B],{planet:pl,day:5,x:pl.cx,y:pl.cy,fog:true});
 const t=r.telemetry||{};dr+=t.drones||0;tu+=t.turrets||0;ts+=t.turretShots||0;th+=t.turretHits||0;fights++;
 fx+=(r.frames||[]).filter(f=>f.fx&&((f.fx.dr||[]).length||(f.fx.tu||[]).length)).length;
 downsB+=B.units.filter(u=>u.state!=='ok'&&u.state!=='light').length;}
console.log((GIVE.length?'side A carries a drone and a turret each':'side A carries nothing')+' | 40 fights | carried in',carried,'| drones',dr,'| turrets',tu,'| turret shots',ts,'hits',th,'| frames with a device',fx,'| side B put down',downsB);
if (GIVE.length) {
  const ok = dr > 0 && tu > 0 && th > 0 && fx > 0;
  console.log(ok ? 'the drone goes up, the turret fires and hits, and the replay records both'
                 : 'FAIL a device is not being used, not hitting, or not on the replay');
  process.exit(ok ? 0 : 1);
}
