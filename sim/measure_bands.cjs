/* WHERE A FIGHT IS ACTUALLY FOUGHT, with squads carrying the kit the game gives them.
   An earlier read of this used UNEQUIPPED bodies, so every fighter fell back to the default
   medium weapon and the answer was medium by construction. */
const fs = require('fs');
const P = require('./prng.js'), D = require('./divide.js'), MAP = require('./map.js'),
      C = require('./combat.js'), R = require('./roster.js'), T = require('./tactical.js');
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
function kitted(seed, which) {
  const rng = P.mulberry32(P.seedFrom('band' + seed));
  const planet = MAP.generatePlanet(rng, {});
  const c = D.buildCorp(rng, oa[which % oa.length], 'standard', null, 0.5, null, planet, null, 1);
  const sq = c.squads[0];
  return { tag: 'S' + which, corpId: 'S' + which, policy: 'standard', policyName: 'standard',
           units: sq.bodies.map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 })) };
}
const N = +(process.argv[2] || 18);
[0, 1, 2].forEach(band => {
  const tally = { 0: 0, 1: 0, 2: 0 };
  let dead = 0, down = 0, turns = 0, cap = 0, shots = 0, hits = 0;
  for (let s = 1; s <= N; s++) {
    const A = kitted(s, s), B = kitted(s + 40, s + 3);
    const r = T.resolve(P.mulberry32(s), A, B, { terrain: 'broken_ground', openingBand: band, prep: [0.5, 0.5] });
    ['A', 'B'].forEach(k => { const cc = r.casualties[A.tag] || r.casualties[k]; });
    for (const k of Object.keys(r.casualties)) { dead += r.casualties[k].dead; down += r.casualties[k].down + r.casualties[k].stable; }
    turns += r.turns; shots += r.telemetry.shots; hits += r.telemetry.hits;
    if (r.result === 'cap') cap++;
    (r.log || []).forEach(e => { if ((e.type === 'hit' || e.type === 'miss') && e.band != null) tally[e.band]++; });
  }
  const t = tally[0] + tally[1] + tally[2] || 1;
  console.log(['long', 'medium', 'short'][band].padEnd(7) +
    ' opening | shots at long ' + (tally[0] / t * 100).toFixed(0) + '% medium ' + (tally[1] / t * 100).toFixed(0) +
    '% short ' + (tally[2] / t * 100).toFixed(0) + '%' +
    ' | dead/fight ' + (dead / N).toFixed(2) + ' | turns ' + (turns / N).toFixed(1) +
    ' | hit ' + (hits / shots).toFixed(3) + ' | clock ' + cap + '/' + N);
});
