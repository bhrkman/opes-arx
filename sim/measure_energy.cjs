/* WHAT AN ENERGY WEAPON COSTS AND WHAT IT BUYS.
   The bargain as written: a cell carries a fixed number of shots, recharges only at camp
   overnight, and cannot be resupplied mid-contest — against a ballistic weapon that eats
   ammunition but can always be fed. The question is whether the power and the freedom from
   resupply pay for running dry inside a single engagement. This measures the catalogue and the
   fight, and proposes nothing. `node measure_energy.cjs [fights]` */
const fs = require('fs');
const P = require('./prng.js'), T = require('./tactical.js'), C = require('./combat.js'),
      R = require('./roster.js'), D = require('./divide.js'), MAP = require('./map.js');
const items = JSON.parse(fs.readFileSync(__dirname + '/../data/items.json', 'utf8'));
const arr = items.items || Object.values(items);
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const prim = arr.filter(x => x.slot === 'primary');
/* A WEAPON IS CELL-FED IF IT HAS A CELL. It was identified by its heat cap, which stopped
   naming anything the moment the overheat came out of the catalogue. */
const isE = x => !!(x.effects && x.effects.charge > 0);

/* ---------- 1. the catalogue: what you pay for a point of power ---------- */
console.log('\n== THE CATALOGUE ==');
[['energy', prim.filter(isE)], ['ballistic', prim.filter(x => !isE(x))]].forEach(([label, list]) => {
  const byTier = {};
  list.forEach(x => {
    const t = x.tier, e = x.effects || {};
    (byTier[t] = byTier[t] || { n: 0, cost: 0, power: 0, shots: 0 });
    byTier[t].n++; byTier[t].cost += x.cost; byTier[t].power += e.power || 0;
    byTier[t].shots += e.charge || 0;
  });
  Object.keys(byTier).sort().forEach(t => {
    const b = byTier[t];
    console.log('  ' + label.padEnd(9) + ' tier ' + t + ' · ' + b.n + ' items · mean cost ' +
      Math.round(b.cost / b.n) + ' · mean power ' + (b.power / b.n).toFixed(1) +
      ' · credits per point ' + Math.round(b.cost / b.power) +
      (label === 'energy' ? ' · shots in the cell ' + (b.shots / b.n).toFixed(0) : ''));
  });
});

/* ---------- 2. the fight: how quickly a cell runs flat ---------- */
const N = +(process.argv[2] || 12);
const mk = (n, tag) => {
  const rng = P.mulberry32(P.seedFrom('en' + n));
  const planet = MAP.generatePlanet(rng, {});
  const c = D.buildCorp(rng, oa[n % oa.length], 'standard', null, 0.5, null, planet, null, 1);
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard',
           units: c.squads[0].bodies.map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 })) };
};
let eN = 0, bN = 0, eDry = 0, eShotsFired = 0, bShotsFired = 0, eStart = 0;
let eSide = 0, bSide = 0, eHits = 0, bHits = 0;
for (let s = 1; s <= N; s++) {
  const A = mk(s, 'A'), B = mk(s + 40, 'B');
  const all = A.units.concat(B.units);
  const before = all.map(u => ({ id: u.id, e: !!u.cellFed || u.heatCap > 0, charge: u.charge, ammo: u.ammo }));
  const r = T.resolve(P.mulberry32(s), A, B, { terrain: 'broken_ground', openingBand: 1, prep: [0.5, 0.5] });
  all.forEach((u, i) => {
    const b = before[i];
    if (b.e) {
      eN++; eStart += b.charge;
      eShotsFired += Math.max(0, b.charge - (u.charge || 0));
      if ((u.charge || 0) <= 0) eDry++;
      if (u.onSidearm) eSide++;
      eHits += u._hitsLanded || 0;
    } else {
      bN++; bShotsFired += Math.max(0, b.ammo - (u.ammo || 0));
      if (u.onSidearm) bSide++;
      bHits += u._hitsLanded || 0;
    }
  });
  void r;
}
console.log('\n== THE FIGHT (' + N + ' engagements, squads carrying what the game issues) ==');
console.log('  energy hands    ' + eN + ' · mean cell ' + (eStart / eN).toFixed(1) + ' shots · fired ' +
  (eShotsFired / eN).toFixed(1) + ' · RAN FLAT ' + eDry + ' (' + (eDry / eN * 100).toFixed(0) + '%)' +
  ' · on the sidearm at the end ' + eSide);
console.log('  ballistic hands ' + bN + ' · fired ' + (bShotsFired / bN).toFixed(1) +
  ' · on the sidearm at the end ' + bSide);
console.log('\n  A cell holds ' + (eStart / eN).toFixed(1) + ' shots and a fight asks for ' +
  (eShotsFired / eN).toFixed(1) + '.');

/* ---------- 3. the other half of the bargain: heat, and what resupply costs ---------- */
let vent = 0, eTurns = 0, dryB = 0, shotsB = 0;
for (let s = 1; s <= N; s++) {
  const A = mk(s + 100, 'A'), B = mk(s + 140, 'B');
  const r = T.resolve(P.mulberry32(s + 7), A, B, { terrain: 'broken_ground', openingBand: 1, prep: [0.5, 0.5] });
  vent += r.telemetry.vents || 0;
  dryB += r.telemetry.dry || 0;
  shotsB += r.telemetry.shots || 0;
  eTurns += r.turns;
}
console.log('\n== HEAT AND RESUPPLY ==');
console.log('  exchanges lost to venting across ' + N + ' fights: ' + vent +
            '  (' + (vent / eN).toFixed(1) + ' per energy hand per fight)');
/* the overheat was retired: a cell-fed weapon fires until the cell is flat */
console.log('  shot attempts that failed for want of a loaded weapon: ' + dryB + ' of ' + shotsB +
            ' (' + (dryB / shotsB * 100).toFixed(0) + '%)');
console.log('\n  Energy hands fire ' + (eShotsFired / eN).toFixed(1) + ' rounds a fight; ballistic hands fire ' +
            (bShotsFired / bN).toFixed(1) + ' — a gap of ' +
            ((1 - (eShotsFired / eN) / (bShotsFired / bN)) * 100).toFixed(0) + '%.');
