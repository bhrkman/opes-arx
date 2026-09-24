/* §CONSUMABLES THE STIM, THE THERMOBARIC AND THE SCRAMBLER, ON THE GRID. Side A carries one of each; side B
   fights with Mon-Wa pairs so the scrambler has something to break. Fails if any of the three is never used,
   or if a thermobaric leaves cover standing. (Once contraband; nothing is banned now.)
   `node harness/probe_contraband.cjs [fights]` */
const D='/home/claude/opes-arx/sim/',fs=require('fs');
const P=require(D+'prng.js'),C=require(D+'combat.js'),T=require(D+'tactical.js'),R=require(D+'roster.js'),I=require(D+'items.js'),M=require(D+'map.js');
const oa=JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json','utf8')).oa_profiles;
const N=+(process.argv[2]||40);
const kit=['itm_stim_shot','itm_thermobaric_charge','itm_cortical_scrambler'];
let st=0,th=0,sc=0,off=0,flat=0,contra=0;
for(let i=0;i<N;i++){const rng=P.mulberry32(P.seedFrom('cb'+i));
  const mk=(prof,give,opts)=>{const g=R.generateSquad(rng,6,Object.assign({corpId:prof.id},opts||{}));const b=g.bodies;
    b.forEach(f=>{const lo={primary:'itm_surplus_rifle',armor:'itm_flak_vest',sidearm:null,mods:[],consumables:give.slice()};I.equip(f,lo);});
    const units=b.map(f=>C.makeCombatant(f,{traitIndex:R.traitById,day:5}));
    /* link Mon-Wa halves as the Divide does before a fight (divide.js liveSquad) */
    const byId={};units.forEach(u=>byId[u.id]=u);
    units.forEach(u=>{if(u.ref.bond_partner&&byId[u.ref.bond_partner]&&!u.pair){const o=byId[u.ref.bond_partner];const pair={comp:Math.round((u.comp+o.comp)/2),halves:[u,o],downed:false,strained:false};u.pair=pair;o.pair=pair;}});
    return {corpId:prof.id,policy:'standard',hasMedkit:false,fidelity:0.7,units};};
  const A=mk(oa[0],kit), B=mk(oa[1],[],{race:'mon_wa'});
  /* opened at short range: a plain grid fight otherwise ends in a withdrawal before anyone is in throwing reach */
  const pl=M.generatePlanet(P.mulberry32(i),{season:1});
  const r=T.resolve(P.mulberry32(i+3),[A,B],{planet:pl,day:5,x:pl.cx,y:pl.cy,fog:true,openingBand:2});
  const t=r.telemetry||{};st+=t.stims||0;th+=t.thermobarics||0;sc+=t.scrambles||0;flat+=t.coverFlattened||0;contra+=(t.contraband||[]).length;}
console.log('\nTHE STIM, THE THERMOBARIC AND THE SCRAMBLER \u00b7 '+N+' fights, one side carrying all three\n');
console.log('  stims given           '+st);
console.log('  thermobarics thrown   '+th+'   (cover tiles flattened to bare ground: '+flat+')');
console.log('  scramblers set off    '+sc);
const ok=st>0&&th>0&&sc>0&&flat>0;
console.log(ok?'\n  ok    all three do what they say':'\n  FAIL  one of the three is not being used');
process.exit(ok?0:1);
