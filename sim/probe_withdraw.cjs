/* THE WITHDRAWAL, END TO END. A manager posts one public offer — I stand down now, whoever wins
   pays me this share of the credits — the field answers at the next window, he withdraws on the
   replies he has, and the OA that takes the ground decides at the settlement which promises it
   keeps. Nobody is bound at any point; what binds is the record.
   `node sim/probe_withdraw.cjs [contests] [share]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 3), SHARE = +(process.argv[3] || 0.15);

let engineSaw = 0, engineReplies = 0;
let posted = 0, replied = 0, yes = 0, left = 0, promises = 0, kept = 0, paid = 0, moot = 0;
for (let seed = 1; seed <= N; seed++) {
  const rng = P.mulberry32(P.seedFrom('wd' + seed));
  const corps = S.openFleet(rng, oa, {});
  const st = S.beginSeason(rng, corps, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const me = st.ids[0];
  d.opts.human = me;
  const gen = DIV.divideCore(d.rng, d.opts);
  let step = gen.next(), sent = false, went = false;
  while (!step.done) {
    const w = step.value, ans = {};
    const mine = (w.corps || []).filter(c => c.id === me)[0];
    const alive = mine && (mine.squads || []).some(q => (q.bodies || []).some(b => b.status === 'active'));
    /* post once, around the middle of the contest, when a beaten OA would be looking for a way out */
    if (!sent && alive && w.day >= 9) { ans.withdrawOffer = { credits: SHARE }; sent = true; posted++; }
    else if (sent && !went && alive && w.withdrawReplies) {
      const r = w.withdrawReplies;
      const n = Object.keys(r).length;
      if (n) { replied += n; yes += Object.values(r).filter(Boolean).length;
               ans.withdrawNow = true; went = true; left++; }
    }
    step = gen.next(Object.keys(ans).length ? ans : undefined);
  }
  const res = step.value || {};
  engineSaw += (res.audit && res.audit.withdrawOffers) || 0;
  engineReplies += (res.audit && res.audit.withdrawReplies) || 0;
  if (seed === 1) console.log('  [contest 1] winner:', res.winner || '(none)',
    '| promise senders:', [...new Set((res.promises || []).map(p2 => p2.from))].join(','));
  (res.promises || []).forEach(pr => {
    promises++;
    if (pr.moot) moot++;
    else if (pr.kept) { kept++; paid += pr.owed || 0; }
  });
}
console.log('\nTHE WITHDRAWAL, END TO END \u00b7 ' + N + ' contests, asking ' + Math.round(SHARE * 100) + '% of the credits\n');
console.log('  offers the probe sent    ' + posted);
console.log('  offers the ENGINE logged ' + engineSaw);
console.log('  replies the ENGINE made  ' + engineReplies);
console.log('  replies received         ' + replied + '  (' + yes + ' yes)');
console.log('  withdrew on the replies  ' + left);
console.log('  promises carried         ' + promises + '  (' + moot + ' moot \u2014 that OA did not win)');
console.log('  promises the winner kept ' + kept + '  worth \u20a1' + Math.round(paid).toLocaleString());
