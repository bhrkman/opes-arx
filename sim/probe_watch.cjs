/* DOES HOLDING STILL BUY SIGHT? §7.6 passive sighting is meant to be something a squad can
   purchase with its pace: a squad that stays put has its eyes up, one that marches all day has
   its head down. The per-squad stance rests entirely on that being true, so this measures it
   directly, bucketing every squad-day by how far that squad walked. It FAILS if a squad that
   held still does not see clearly more than one that marched hard.
   `node sim/probe_watch.cjs [contests]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 3);
const W = [0, 0, 0, 0], Sn = [0, 0, 0, 0];
for (let s = 1; s <= N; s++) {
  const rng = P.mulberry32(P.seedFrom('sg' + s));
  const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const res = DIV.runDivide(d.rng, d.opts);
  (res.audit.watchBy || []).forEach((v, i) => W[i] += v);
  (res.audit.seenBy || []).forEach((v, i) => Sn[i] += v);
}
const rate = i => Sn[i] / Math.max(1, W[i]);
const lab = ['held still', 'walked a little', 'walked most of a day', 'marched hard'];
console.log('\nDOES HOLDING STILL BUY SIGHT? \u00b7 ' + N + ' contests\n');
lab.forEach((l, i) => console.log('  ' + l.padEnd(22) + 'sightings per squad-day ' + rate(i).toFixed(3) +
                                  '   (' + W[i] + ' squad-days)'));
const ratio = rate(0) / Math.max(1e-9, rate(3));
console.log('\n  a squad that holds still sees ' + ratio.toFixed(1) + '\u00d7 what a hard-marching one does');
const ok = ratio >= 2 && rate(0) >= 0.05;
console.log('  ' + (ok ? 'ok    patience buys sight, and enough of it to act on'
                       : 'FAIL  patience does not buy enough sight for a stance to rest on'));
process.exit(ok ? 0 : 1);
