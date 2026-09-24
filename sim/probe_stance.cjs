/* WHAT A NOTCH IS WORTH. The stance a manager sets AT one OA reaches the contest in four
   places: how near that OA reads when a squad is choosing who to walk toward (leanOf), whether
   a meeting becomes a fight (seek/accept, read by BOTH sides toward each other), how hard a
   squad tries to break off from THEM, and whether a squad piles into a fight they are already
   in. This runs the same Divide — same seed, same ground, same drop — five times, changing
   ONLY the notch the manager holds toward one rival, and counts what changed.
   `node sim/probe_stance.cjs [divides] [target]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 12);
const NOTCHES = DIV.NOTCHES, W = DIV.NOTCH_WORDS;

function run(seed, notch, targetIdx) {
  const rng = P.mulberry32(P.seedFrom('stance' + seed));
  const founder = S.founderProfile(oa, 'X');
  const profiles = oa.map((p, i) => i === 0 ? founder : p);
  const corps = S.openFleet(rng, profiles, {});
  const st = S.beginSeason(rng, corps, profiles, { human: founder.id });
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const ids = st.ids.filter(id => id !== founder.id);
  const target = ids[targetIdx % ids.length];
  d.opts.human = founder.id;
  /* run the contest a WINDOW AT A TIME: the fights of a window are handed out there and
     cleared, so they cannot be counted off the finished result */
  const gen = DIV.divideCore(d.rng, d.opts);
  let metTarget = 0, fightsMine = 0, res = null, step = gen.next();
  while (!step.done) {
    const w = step.value;
    (w.fights || []).forEach(f => {
      const ids2 = (f.corps || []);
      if (ids2.indexOf(founder.id) < 0) return;
      fightsMine++;
      if (ids2.indexOf(target) >= 0) metTarget++;
    });
    const me = (w.corps || []).filter(c => c.id === founder.id)[0];
    if (me) { me._stance = me._stance || {}; me._stance[target] = notch; }
    step = gen.next({ });
  }
  res = step.value || {};
  const me2 = (res.corps || []).filter(c => c.id === founder.id)[0] || {};
  const dead = (me2.allBodies || []).filter(b => b.status === 'dead').length;
  const place = (res.placement || {})[founder.id] || null;
  return { metTarget, fightsMine, dead, place, target };
}

console.log('\nWHAT A NOTCH IS WORTH \u00b7 ' + N + ' Divides, the same ground each time,\n  changing only the stance held toward ONE rival\n');
const rows = [];
for (const notch of NOTCHES) {
  let met = 0, fights = 0, dead = 0, placed = 0, placeN = 0, tgt = '';
  for (let s = 1; s <= N; s++) {
    const r = run(s, notch, 0);
    met += r.metTarget; fights += r.fightsMine; dead += r.dead; tgt = r.target;
    if (r.place) { placed += r.place; placeN++; }
  }
  rows.push({ notch, met: met / N, fights: fights / N, dead: dead / N, place: placeN ? placed / placeN : null });
  console.log('  ' + W[notch].padEnd(7) +
    '  met them ' + (met / N).toFixed(2).padStart(5) +
    '   all fights ' + (fights / N).toFixed(2).padStart(5) +
    '   your dead ' + (dead / N).toFixed(2).padStart(5) +
    (placeN ? '   finished ' + (placed / placeN).toFixed(2) : ''));
}
const a = rows[0], z = rows[rows.length - 1];
console.log('\n  Avoid \u2192 All In: meetings with them ' + a.met.toFixed(2) + ' \u2192 ' + z.met.toFixed(2) +
            ', your dead ' + a.dead.toFixed(2) + ' \u2192 ' + z.dead.toFixed(2));
