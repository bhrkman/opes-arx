/* WHAT THE BARGAIN LOOKS LIKE WITH THE OVERHEAT TAKEN OUT — a hypothetical, run against the
   engine as it stands with one switch flipped, and nothing written back. */
const fs = require('fs');
const D0 = '/home/claude/opes-arx/sim/';
const P = require(D0 + 'prng.js'), T = require(D0 + 'tactical.js'), C = require(D0 + 'combat.js'),
      R = require(D0 + 'roster.js'), D = require(D0 + 'divide.js'), MAP = require(D0 + 'map.js');
const oa = JSON.parse(fs.readFileSync(D0 + '../data/oa_profiles.json', 'utf8')).oa_profiles;
const mk = (n, tag) => {
  const rng = P.mulberry32(P.seedFrom('en' + n));
  const planet = MAP.generatePlanet(rng, {});
  const c = D.buildCorp(rng, oa[n % oa.length], 'standard', null, 0.5, null, planet, null, 1);
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard',
           units: c.squads[0].bodies.map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 })) };
};
function run(N, label) {
  let eN = 0, bN = 0, eDry = 0, eFired = 0, bFired = 0, eStart = 0, vents = 0, dead = 0, turns = 0, cap = 0;
  for (let s = 1; s <= N; s++) {
    const A = mk(s, 'A'), B = mk(s + 40, 'B');
    const all = A.units.concat(B.units);
    const before = all.map(u => ({ e: u.heatCap > 0, charge: u.charge, ammo: u.ammo }));
    const r = T.resolve(P.mulberry32(s), A, B, { terrain: 'broken_ground', openingBand: 1, prep: [0.5, 0.5] });
    vents += r.telemetry.vents || 0; turns += r.turns; if (r.result === 'cap') cap++;
    for (const k of Object.keys(r.casualties)) dead += r.casualties[k].dead;
    all.forEach((u, i) => {
      const b = before[i];
      if (b.e) { eN++; eStart += b.charge; eFired += Math.max(0, b.charge - (u.charge || 0)); if ((u.charge || 0) <= 0) eDry++; }
      else { bN++; bFired += Math.max(0, b.ammo - (u.ammo || 0)); }
    });
  }
  console.log('  ' + label.padEnd(18) +
    ' energy fires ' + (eFired / eN).toFixed(1) + ' · ballistic fires ' + (bFired / bN).toFixed(1) +
    ' · gap ' + ((1 - (eFired / eN) / (bFired / bN)) * 100).toFixed(0) + '%' +
    ' · ran flat ' + (eDry / eN * 100).toFixed(0) + '%' +
    ' · vents ' + vents + ' · dead/fight ' + (dead / N).toFixed(2) +
    ' · turns ' + (turns / N).toFixed(1) + ' · clock ' + cap + '/' + N);
}
const N = +(process.argv[2] || 12);
console.log('\n== THE ENERGY BARGAIN, WITH AND WITHOUT THE OVERHEAT ==');
run(N, 'as it stands');
/* the switch: a weapon that never reaches its cap never vents */
C.CONST.VENT_EXCHANGES = 0;
const bigCap = 10000;
const realMake = C.makeCombatant;
C.makeCombatant = function (f, o) { const u = realMake(f, o); if (u.heatCap > 0) u.heatCap = bigCap; return u; };
run(N, 'no overheat');
/* the overheat was throttling the cell so it lasted; take it away and the CELL becomes the
   binding constraint. How much cell would it take? */
console.log('');
[1.25, 1.5, 2].forEach(mult => {
  C.makeCombatant = function (f, o) {
    const u = realMake(f, o);
    if (u.heatCap > 0) { u.heatCap = bigCap; u.charge = Math.round(u.charge * mult); }
    return u;
  };
  run(N, 'no heat, cell x' + mult);
});
