/* DO THE QUIRKS ACTUALLY BITE?
   The old catalogue's failure was not that it was badly written — it was that most of it never
   did anything a manager could feel. A rebuilt quirk that names a condition the game never
   reaches is the same failure in better prose. This builds real fleets, fields them, and counts
   how often each condition is TRUE at the moment a body is made, and what the quirks are worth
   in points when they are. `node sim/measure_quirks.cjs [fleets]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), R = require('./roster.js'), C = require('./combat.js'),
      DV = require('./divide.js'), MAP = require('./map.js'), S = require('./season.js');
const T = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'traits.json'), 'utf8')).traits;
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const byId = {}; T.forEach(t => byId[t.id] = t);
const pool = T.filter(t => t.draw === 'pool');

const N = +(process.argv[2] || 6);
const fires = {}, carried = {}, points = {};
Object.keys(C.SITUATIONS).forEach(k => fires[k] = 0);
let bodies = 0, situations = 0;

for (let s = 1; s <= N; s++) {
  /* BUILD THE FLEET THE WAY A SEASON DOES. The first cut called `buildCorp` with no persisted
     drop, and without one the squad sizes fall to the [8,8,8] default — so every squad measured
     was eight or more and `squad_at_most_4` read as a condition the game never reaches. It
     reaches it constantly; the probe was not looking at the game. */
  const rng = P.mulberry32(P.seedFrom('mq' + s));
  const planet = MAP.generatePlanet(rng, {});
  const fleet = S.openFleet(P.mulberry32(P.seedFrom('mqf' + s)), oa, {});
  for (const p of oa) {
    const held = fleet[p.id];
    const drop = held ? held.roster.filter(f => f.status === 'active') : null;
    const corp = DV.buildCorp(rng, p, 'standard', null, 0.5, null, planet,
                              drop && drop.length ? { drop: drop } : null, 1);
    for (const sq of (corp.squads || [])) {
      const avail = sq.bodies || [];
      const raceCount = {};
      for (const b of avail) raceCount[b.race] = (raceCount[b.race] || 0) + 1;
      const withConscript = avail.some(b => ((b.contract || {}).kind) === 'prisoner');
      for (const f of avail) {
        bodies++;
        const ctx = { squadSize: avail.length, isCaptain: f.id === sq.captainId,
                      withConscript, onlyOfRace: raceCount[f.race] === 1,
                      divides: (f.experience && f.experience.divides) || 0, age: f.age,
                      health: (f.condition || {}).health, stress: (f.condition || {}).stress,
                      captainPresent: true, origin: (f.contract || {}).kind,
                      firstEngagement: true };
        for (const k in C.SITUATIONS) if (C.SITUATIONS[k](ctx)) fires[k]++;
        for (const tid of (f.traits || [])) {
          const t = byId[tid]; if (!t || t.draw !== 'pool') continue;
          carried[tid] = (carried[tid] || 0) + 1;
          /* ATTRIBUTE ONLY THIS QUIRK'S OWN POINTS. The first cut summed the whole body's
             situational total and credited it to EVERY quirk the body carried, so a quirk whose
             condition never came true still showed points from its neighbours — Close Company
             read 9.0 on a condition that fires 0% of the time. A measurement that flatters is
             worse than none. */
          const solo = { traits: [tid] };
          const got = C.situationalStats(solo, R.traitById, ctx);
          let sum = 0; for (const k in got) sum += Math.abs(got[k]);
          if (sum) { situations++; points[tid] = (points[tid] || 0) + sum; }
        }
      }
    }
  }
}
console.log('\n== DO THE CONDITIONS EVER COME TRUE? (' + bodies + ' bodies fielded) ==');
Object.keys(fires).sort((a, b) => fires[b] - fires[a]).forEach(k => {
  const pc = (fires[k] / bodies * 100);
  console.log('  ' + k.padEnd(22) + String(fires[k]).padStart(5) + '  ' + pc.toFixed(1) + '%' +
              (fires[k] === 0 ? '   <-- NEVER' : pc < 2 ? '   <-- barely' : ''));
});
console.log('\n== WHAT EACH QUIRK IS WORTH WHEN IT LANDS ==');
pool.filter(t => (t.effects || {}).situational).sort((a, b) => (carried[b.id] || 0) - (carried[a.id] || 0))
  .forEach(t => {
    const n = carried[t.id] || 0, pts = points[t.id] || 0;
    console.log('  ' + t.name.padEnd(24) + 'carried ' + String(n).padStart(4) +
                '  ·  situational points when fielded: ' + (n ? (pts / n).toFixed(1) : '0') +
                (n && pts === 0 ? '   <-- its condition never came true' : ''));
  });
const dead = Object.keys(fires).filter(k => fires[k] === 0);
if (dead.length) { console.log('\n  ' + dead.length + ' condition(s) the game never reaches: ' + dead.join(', ')); process.exit(1); }
console.log('\n  every condition the catalogue may name is one the game reaches');
