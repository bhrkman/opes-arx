/* DOES SEEING THEM FIRST BUY ANYTHING? Passive sighting (§7.6) lets a squad notice another
   without meeting it, and whether it does turns on how far it marched, the cover the other is
   in, its own fieldcraft and the weather. This counts what it produces and whether the picture
   it builds is worth having: sightings a contest, how many are EARNED by watching rather than
   handed over by the landings or a mast, and how much of the fleet a manager can see on a
   given day. `node sim/probe_sight.cjs [divides]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 6);
let watched = 0, all = 0, days = 0, known = [], fresh = [], fights = 0;
for (let seed = 1; seed <= N; seed++) {
  const rng = P.mulberry32(P.seedFrom('sight' + seed));
  const corps = S.openFleet(rng, oa, {});
  const st = S.beginSeason(rng, corps, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const me = st.ids[0];
  d.opts.human = me;
  if (process.env.SIGHT_POLICY) Object.values(corps).forEach(c => { c.policy = process.env.SIGHT_POLICY; });
  const gen = DIV.divideCore(d.rng, d.opts);
  let step = gen.next();
  while (!step.done) {
    const w = step.value;
    days++;
    const pic = (w.picture || []);
    known.push(pic.filter(e => !e.landing).length);
    /* how FRESH the picture is: a sighting a manager can still act on */
    fresh.push(pic.filter(e => !e.landing && (w.day - e.day) <= 1).length);
    watched += pic.filter(e => e.via === 'watched').length;
    fights += (w.fights || []).length;
    step = gen.next({});
  }
  const res = step.value || {};
  all += (res.audit && res.audit.sightings) || 0;
}
const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log('\nSEEING WITHOUT MEETING \u00b7 ' + N + ' Divides');
console.log('  sightings earned by watching, per contest:  ' + (all / N).toFixed(1));
console.log('  fights per contest:                         ' + (fights / N).toFixed(1));
console.log('  foreign squads on your map at a window:     ' + mean(known).toFixed(2) +
            ' (of 7 OAs)');
console.log('  of those, seen by watching:                 ' + (watched / Math.max(1, days)).toFixed(2));
console.log('  FRESH — seen yesterday or today:            ' + mean(fresh).toFixed(2) + ' of 7');
