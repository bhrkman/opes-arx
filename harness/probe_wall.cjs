/* §WALL WHO THE DEATH WALL TAKES (ruled: outside the ring is death, and a death to the wall is a failure of the AI).
   Runs whole contests and counts every living person the wall takes, with what their squad was doing. A single one
   fails this. `node harness/probe_wall.cjs [contests]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 5);
let bodies = 0, free = 0, squads = 0; const cases = [];
for (let s = 1; s <= N; s++) {
  const rng = P.mulberry32(P.seedFrom('wall' + s));
  const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const r = DIV.runDivide(d.rng, d.opts);
  (r.wallDeaths || []).forEach(w => { cases.push(w); squads++; bodies += w.took || 0; if (w.free) free++; });
}
console.log('\nTHE DEATH WALL \u00b7 ' + N + ' contests\n');
console.log('  squads the wall took          ' + squads + ' (' + bodies + ' living people)');
console.log('  of them with a free way out   ' + free);
cases.slice(0, 14).forEach(w => console.log('    day ' + w.day + ' ' + w.corp + ' squad ' + w.s + ' took ' + w.took +
  ' \u00b7 ' + w.stance + ' \u00b7 ' + (w.region != null ? 'region ' + w.region : '') + ' \u00b7 intent ' + w.intent + (w.free ? ' \u00b7 HAD A FREE WAY' : ' \u00b7 shut in')));
console.log(squads ? '\n  FAIL  ' + squads + ' squad(s) caught by the wall (' + free + ' with a free way out) \u2014 every one is an AI fault to find' : '\n  ok    the wall took nobody');
process.exit(squads ? 1 : 0);
