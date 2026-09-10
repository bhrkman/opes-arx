/* HOW A FIGHT ENDS — the gate the snapshots could not be. Three re-blessings in a row taught
   the suite to accept whatever the engine now does; this measures the SHAPE of a fight instead
   of its exact frames: how long it runs, and whether it ends because somebody broke or because
   the clock ran out. A fight that always hits the cap is a fight nobody loses.
   `node measure_fight.cjs [fights]` */
const fs = require('fs');
const P = require('./prng.js'), T = require('./tactical.js'), C = require('./combat.js'),
      R = require('./roster.js'), D = require('./divide.js'), MAP = require('./map.js');
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 16);
/* THE SQUADS MUST CARRY THE KIT THE GAME GIVES THEM. This measured `generateSquad` bodies,
   which are not equipped — so every fighter fell back to `DEFAULT_WEAPON`, medium range, and
   the instrument was reading a fleet in which no short or long weapon existed at all. It said
   the fight shape was fine, and it was, for a game nobody plays. A built corp resolves its kit
   from the catalogue: 44 short, 123 medium, 29 long across a fleet. */
const mk = (n, tag) => {
  const rng = P.mulberry32(P.seedFrom('shape' + n));
  const planet = MAP.generatePlanet(rng, {});
  const c = D.buildCorp(rng, oa[n % oa.length], 'standard', null, 0.5, null, planet, null, 1);
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard',
           units: c.squads[0].bodies.map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 })) };
};
let turns = 0, cap = 0, broke = 0, dead = 0, down = 0, shots = 0, hits = 0;
for (let s = 1; s <= N; s++) {
  const r = T.resolve(P.mulberry32(s), mk(s, 'A'), mk(s + 60, 'B'),
                      { terrain: 'broken_ground', openingBand: 1, prep: [0.5, 0.5] });
  turns += r.turns; shots += r.telemetry.shots; hits += r.telemetry.hits;
  if (r.result === 'cap') cap++; else broke++;
  for (const k of ['A', 'B']) { dead += r.casualties[k].dead; down += r.casualties[k].down + r.casualties[k].stable; }
}
const out = { fights: N, meanTurns: +(turns / N).toFixed(1), endedByCap: cap, endedByBreak: broke,
              dead, down, shots, hitRate: +(hits / Math.max(1, shots)).toFixed(3) };
console.log(JSON.stringify(out));
/* THE BAND. A fight that always caps is broken; one that always ends in three turns is not a
   fight. Measured on the last good commit: 10 turns a fight, every one ended by a break. */
if (cap > N * 0.35) { console.log('FAIL: ' + cap + ' of ' + N + ' fights ran out the clock'); process.exit(1); }
if (out.meanTurns > 18) { console.log('FAIL: fights run long (' + out.meanTurns + ' turns)'); process.exit(1); }
console.log('fight shape ok');
