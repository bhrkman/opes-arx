/* §WALL NOBODY IS CAUGHT BY THE DEATH WALL (ruled). Runs whole contests and counts every living
   person the wall takes, with what their squad was doing — a single one is a behaviour to
   investigate. Fails if the wall takes anybody. `node harness/probe_wall.cjs [contests]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 5);
let bodies = 0, runs = 0; const cases = [];
for (let s = 1; s <= N; s++) {
  const rng = P.mulberry32(P.seedFrom('wall' + s));
  const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const r = DIV.runDivide(d.rng, d.opts);
  bodies += (r.audit && r.audit.domeDeaths) || 0;
  runs += (r.audit && r.audit.wallRuns) || 0;
  (r.wallDeaths || (r.stats && r.stats.wallDeaths) || []).forEach(w => cases.push(w));
}
console.log('\nTHE DEATH WALL \u00b7 ' + N + ' contests\n');
console.log('  living people the wall took   ' + bodies);
console.log('  sprints for the line          ' + runs);
cases.slice(0, 12).forEach(w => console.log('    day ' + w.day + ' ' + w.corp + ' squad ' + w.s + ' took ' + w.took +
  ' \u00b7 ' + w.stance + ' \u00b7 ' + (w.out) + ' outside \u00b7 intent ' + w.intent + ' \u00b7 moved ' + w.moved + ' \u00b7 ' + w.living));
console.log(bodies ? '\n  FAIL  the wall took ' + bodies + ' \u2014 each one is a behaviour to find' : '\n  ok    nobody was caught outside the ring');
process.exit(bodies ? 1 : 0);
