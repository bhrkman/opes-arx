/* §CONTEST A CONTEST SAVED MID-WAY AND RESUMED IS THE SAME CONTEST. Two human seats play several windows with real
   answers; the contest is saved to JSON (where it began, and its journal); a second copy is RESUMED from that JSON alone.
   Both seats' views must match now, at every window after, and in the outcome, the two copies given the same answers.
   Every view must also be plain data (it survives JSON unchanged). `node harness/probe_resume.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const rng = P.mulberry32(P.seedFrom('resume')); const c = S.openFleet(rng, oa, {}); const A = oa[2].id, B = oa[6].id;
const st = S.beginSeason(rng, c, oa, { humans: [A, B] });
while (st.month <= S.CONST.PREP_MONTHS) { S.submitMonth(st, A, {}); S.submitMonth(st, B, {}); S.advanceMonth(st); }
S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
S.beginContest(st);
const fails = [];
const answersAt = (k) => ({
  [A]: k === 1 ? { withdrawOffer: { credits: 0.15 } } : k === 3 ? { squadStance: { 0: 'press' } } : {},
  [B]: k === 2 ? { withdrawReplies: { [A]: true } } : k === 3 ? { squadStance: { 0: 'wary' } } : {} });
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const plainOk = (v) => v == null || same(v, JSON.parse(JSON.stringify(v)));
let k = 0;
for (; k < 5; k++) {
  const status = S.contestStatus(st); if (status.done) break;
  for (const seat of status.seats) { if (!plainOk(S.contestView(st, seat))) fails.push('a view is not plain data'); S.answerContest(st, seat, answersAt(k)[seat] || {}); }
  S.advanceContest(st);
}
const saved = JSON.stringify(S.saveContest(st));
const copy = S.resumeContest(JSON.parse(saved), oa);
for (const seat of [A, B]) if (!same(S.contestView(st, seat), S.contestView(copy, seat))) fails.push('after resuming, ' + seat + "'s view differs");
let windows = 0;
while (!S.contestStatus(st).done && windows < 40) {
  for (const x of [st, copy]) { const status = S.contestStatus(x); for (const seat of status.seats) S.answerContest(x, seat, answersAt(k + windows)[seat] || {}); S.advanceContest(x); }
  windows++;
  if (S.contestStatus(st).done !== S.contestStatus(copy).done) { fails.push('the copies ended on different windows'); break; }
  if (!S.contestStatus(st).done) for (const seat of [A, B]) if (!same(S.contestView(st, seat), S.contestView(copy, seat))) { fails.push('window ' + (k + windows) + ': ' + seat + "'s view differs"); break; }
  if (fails.length) break;
}
const r1 = S.contestResult(st), r2 = S.contestResult(copy);
if (r1 && r2 && (r1.winner !== r2.winner || r1.days !== r2.days || (r1.stats || r1).dead !== (r2.stats || r2).dead)) fails.push('the outcomes differ');
console.log(fails.length ? '  FAIL  ' + [...new Set(fails)].slice(0, 4).join(' | ')
  : '  ok    a contest saved at window ' + k + ' (' + (saved.length / 1024).toFixed(0) + ' KB) and resumed is the same contest: ' + windows + ' more windows identical, the same outcome (' + (r1 ? (r1.winner || 'nobody') + ', day ' + r1.days : 'still running') + ')');
process.exit(fails.length ? 1 : 0);
