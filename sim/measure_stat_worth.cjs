/* WHAT A STAT POINT IS WORTH, in the only currency that matters: fights won.
   A quirk sized in points is a guess until somebody says what a point does. */
const fs = require('fs');
const D0 = '/home/claude/opes-arx/sim/';
const P = require(D0+'prng.js'), T = require(D0+'tactical.js'), C = require(D0+'combat.js'),
      R = require(D0+'roster.js'), D = require(D0+'divide.js'), MAP = require(D0+'map.js');
const oa = JSON.parse(fs.readFileSync(D0+'../data/oa_profiles.json','utf8')).oa_profiles;
function squad(n, tag, bump, stat) {
  const rng = P.mulberry32(P.seedFrom('wz'+n));
  const pl = MAP.generatePlanet(rng, {});
  const c = D.buildCorp(rng, oa[n % oa.length], 'standard', null, 0.5, null, pl, null, 1);
  const u = c.squads[0].bodies.map((f, i) => {
    const g = JSON.parse(JSON.stringify(f));
    if (bump) g.stats[stat] = Math.max(1, Math.min(200, g.stats[stat] + bump));
    return C.makeCombatant(g, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 });
  });
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard', units: u };
}
const N = +(process.argv[2] || 40);
const stat = process.argv[3] || 'aim';
console.log('\n== WHAT ' + stat.toUpperCase() + ' POINTS BUY (' + N + ' fights a step) ==');
console.log('  stats run 10..200, median ~90; p10..p90 is about 45..140\n');
for (const bump of [0, 5, 10, 15, 25, 40]) {
  let aWon = 0, done = 0, aDead = 0, bDead = 0;
  for (let s = 1; s <= N; s++) {
    const A = squad(s, 'A', bump, stat), B = squad(s + 90, 'B', 0, stat);
    const r = T.resolve(P.mulberry32(s), A, B, { terrain: 'broken_ground', openingBand: 1, prep: [0.5, 0.5] });
    const ca = r.casualties.A || {}, cb = r.casualties.B || {};
    aDead += ca.dead || 0; bDead += cb.dead || 0;
    /* casualty differential is far quieter than win/loss on a small sample: every fight
       contributes a magnitude instead of a single bit */
    const aLeft = (ca.ok || 0), bLeft = (cb.ok || 0);
    done++; aWon += (bLeft < aLeft) ? 1 : (bLeft > aLeft ? 0 : 0.5);
  }
  const pct = done ? (aWon / done * 100) : 50;
  const diff = (bDead - aDead) / N;
  console.log('  +' + String(bump).padStart(2) + '  wins ' + pct.toFixed(0) + '%' +
              '   kill differential ' + (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' a fight' +
              (bump === 0 ? '   <- the even fight' : ''));
}
