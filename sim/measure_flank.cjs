/* §FLANK THE FLANK BENCH. Equal numbers, different geometry: does coming at a squad from two sides beat meeting it
   head on? Every scenario is 8 fighters against 8, drawn from the same kit and the same generator, sides swapped
   between runs so neither pool is favoured. `node sim/measure_flank.cjs [fights]`
     bulk      8 against 8, head on
     together  8 against 4+4 that came in on the same bearing
     side      8 against 4+4: one head on, one from 90° off
     rear      8 against 4+4: one head on, one from behind
     narrow    8 against 4+4: 45° apart (not a flank)
     bulk6 / side6 / rear6   the same against six
   The 8 always comes in from the west (bearing π). */
const fs = require('fs');
const P = require('./prng.js'), T = require('./tactical.js'), C = require('./combat.js'),
      R = require('./roster.js'), D = require('./divide.js'), MAP = require('./map.js');
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 200);
const only = process.argv[3] || null;
function pool(seed) {
  const rng = P.mulberry32(P.seedFrom('flank' + seed));
  const planet = MAP.generatePlanet(rng, {});
  const c = D.buildCorp(rng, oa[seed % oa.length], 'standard', '2x12', 0.5, null, planet, null, 1);
  const bodies = [].concat.apply([], c.squads.map(q => q.bodies)).filter(b => !b.mirror_of);
  return bodies.slice(0, 8).map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0 || i === 4, day: 1 }));
}
const W = Math.PI, E = 0, S = Math.PI / 2;
const SCEN = {
  bulk:     { sq: [[E, 8]] },
  together: { sq: [[E, 4], [E, 4]] },
  side:     { sq: [[E, 4], [S, 4]] },
  rear:     { sq: [[E, 4], [W, 4]] },
  narrow:   { sq: [[E, 4], [Math.PI / 4, 4]] },
  bulk6:    { sq: [[E, 6]] },
  side6:    { sq: [[E, 3], [S, 3]] },
  rear6:    { sq: [[E, 3], [W, 3]] }
};
const out = {};
for (const name of Object.keys(SCEN)) {
  if (only && name !== only) continue;
  let win8 = 0, winX = 0, lost8 = 0, lostX = 0, turns = 0, flankShots = 0;
  for (let s = 1; s <= N; s++) {
    const swap = s % 2;
    const p1 = pool(s), p2 = pool(s + 5000);
    const eight = swap ? p1 : p2, other = swap ? p2 : p1;
    const sq = SCEN[name].sq; let k = 0;
    const units = [];
    sq.forEach(([b, n], gi) => { for (let i = 0; i < n; i++) { const u = other[k++]; u._bearing = b; u._group = gi; units.push(u); } });
    for (const u of other) if (units.indexOf(u) < 0) u._bearing = null;
    for (const u of eight) { u._bearing = W; u._group = 0; }
    const A = { tag: 'A', corpId: 'A', policy: 'standard', policyName: 'standard', units: eight };
    const B = { tag: 'B', corpId: 'B', policy: 'standard', policyName: 'standard', units: units };
    const rng = P.mulberry32(P.seedFrom('bench' + name + s));
    const band = P.weightedPick(rng, [[0, 28], [1, 50], [2, 22]]);
    const flankedA = new Set(sq.map(x => x[0])).size > 1 && Math.abs(sq[0][0] - sq[sq.length - 1][0]) >= D.CONST.FLANK_ARC * 0.5;
    const r = T.resolve(rng, A, B, { terrain: 'broken_ground', openingBand: band, prep: [0.5, 0.5],
                                     flanked: [flankedA, false], bearings: [W, E] });
    const lost = t => { const c = r.casualties[t]; return (c.total - c.ok) / c.total; };
    const a = lost('A'), b = lost('B');
    lost8 += a; lostX += b; turns += r.turns; flankShots += r.telemetry.flankShots || 0;
    if (a < b) winX += 0; if (a < b) win8++; else if (b < a) winX++;
  }
  out[name] = { fights: N, eightWins: win8, splitWins: winX, eightLost: +(lost8 / N).toFixed(2), splitLost: +(lostX / N).toFixed(2),
                turns: +(turns / N).toFixed(1), flankShots: +(flankShots / N).toFixed(1) };
  console.log(name.padEnd(9), JSON.stringify(out[name]));
}
