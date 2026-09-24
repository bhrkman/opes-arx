/* §STATS WHAT EACH STAT ON THE SHEET DOES IN A FIGHT. For each of the seven, two sides identical in every way
   but one: side A's fighters carry that stat at HIGH, side B's at LOW, everything else rolled the same. Against
   a control where both sides sit at 100, the lead side A gains is what the stat is worth on the grid. A stat
   whose lead is near nothing does little in a fight (it may matter elsewhere — the Divide, the season).
   `node harness/probe_stats.cjs [fights] [high] [low]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), C = require(D + 'combat.js'), T = require(D + 'tactical.js'),
      R = require(D + 'roster.js'), I = require(D + 'items.js'), M = require(D + 'map.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 40), HI = +(process.argv[3] || 150), LO = +(process.argv[4] || 50);
const STATS = ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve'];
function run(stat, a, b) {
  let downA = 0, downB = 0, ahead = 0;
  for (let i = 0; i < N; i++) {
    const rng = P.mulberry32(P.seedFrom('st' + i));
    const mk = (prof, v) => {
      const bodies = R.generateSquad(rng, 5, { corpId: prof.id }).bodies;
      bodies.forEach(f => { if (stat) { f.stats[stat] = v;
          /* a shot uses the MEAN of Aim and the weapon's skill: to test Aim, the skill moves with it */
          if (stat === 'aim' && f.skills) for (const k in f.skills) f.skills[k] = v; }
        I.equip(f, { primary: 'itm_surplus_rifle', armor: 'itm_flak_vest', sidearm: null, mods: [], consumables: [] }); });
      return { corpId: prof.id, policy: 'standard', hasMedkit: false, fidelity: 0.7,
               units: bodies.map(f => C.makeCombatant(f, { traitIndex: R.traitById, day: 5 })) };
    };
    const A = mk(oa[0], a), B = mk(oa[1], b);
    const pl = M.generatePlanet(P.mulberry32(i), { season: 1 });
    T.resolve(P.mulberry32(i + 3), [A, B], { planet: pl, day: 5, x: pl.cx, y: pl.cy, fog: true });
    const la = A.units.filter(u => u.state !== 'ok' && u.state !== 'light').length;
    const lb = B.units.filter(u => u.state !== 'ok' && u.state !== 'light').length;
    downA += la; downB += lb; if (lb > la) ahead++;
  }
  return { downA, downB, ahead };
}
const base = run(null);
console.log('\nWHAT EACH STAT DOES IN A FIGHT \u00b7 ' + N + ' fights each, side A at ' + HI + ', side B at ' + LO + '\n');
console.log('  control (both as rolled)'.padEnd(30) + 'A ahead ' + String(base.ahead).padStart(3) + ' of ' + N +
            ' \u00b7 A put down ' + base.downB + ', lost ' + base.downA);
for (const s of STATS) {
  const r = run(s, HI, LO);
  const lead = r.ahead - base.ahead;
  console.log('  ' + s.padEnd(28) + 'A ahead ' + String(r.ahead).padStart(3) + ' of ' + N +
              ' (' + (lead >= 0 ? '+' : '') + lead + ') \u00b7 A put down ' + r.downB + ', lost ' + r.downA);
}
