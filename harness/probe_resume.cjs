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
/* §STANCE a squad's stance by its engine key (NOTCHES: preservationist … death_or_glory). At window 2 seat A sends a
   page word ('press'), which is no key and must change nothing; at window 3 each seat sets its first standing squad to
   a notch it is not at; from window 4 on the view must show it, and the resumed copy must show it too. */
const NOTCHES = require(D + 'divide.js').NOTCHES;
const setAt = {}, stanceWas = {};
const firstUp = (v) => (v && v.squads || []).find(q => q.alive);
const answersAt = (k, x) => {
  const out = { [A]: k === 1 ? { withdrawOffer: { credits: 0.15 } } : {}, [B]: k === 2 ? { withdrawReplies: { [A]: true } } : {} };
  if (x && k === 2) { const q = firstUp(S.contestView(x, A)); if (q) { stanceWas[A] = { s: q.s, n: q.stance }; out[A] = { squadStance: { [q.s]: 'press' } }; } }
  if (x && k === 3) for (const seat of [A, B]) { const q = firstUp(S.contestView(x, seat)); if (!q) continue;
    const want = seat === A ? (q.stance === 'unyielding' ? 'death_or_glory' : 'unyielding') : (q.stance === 'preservationist' ? 'measured' : 'preservationist');
    setAt[seat] = { s: q.s, n: want }; out[seat] = Object.assign({}, out[seat], { squadStance: { [q.s]: want } }); }
  return out;
};
const stanceOf = (x, seat, s) => { const q = ((S.contestView(x, seat) || {}).squads || []).find(y => y.s === s); return q && q.alive ? q.stance : null; };
let stanceChecks = 0;
const checkStances = (x, label) => {
  for (const seat in setAt) { const got = stanceOf(x, seat, setAt[seat].s); if (got == null) continue; stanceChecks++;
    if (got !== setAt[seat].n) fails.push(label + ': ' + seat + ' squad ' + setAt[seat].s + ' stands at ' + got + ', was set to ' + setAt[seat].n); }
};
if (NOTCHES.join() !== 'preservationist,measured,standard,unyielding,death_or_glory') fails.push('the engine notches are not the five this probe knows: ' + NOTCHES.join());
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const plainOk = (v) => v == null || same(v, JSON.parse(JSON.stringify(v)));
let k = 0;
for (; k < 5; k++) {
  const status = S.contestStatus(st); if (status.done) break;
  if (k === 3 && stanceWas[A]) { const got = stanceOf(st, A, stanceWas[A].s); if (got != null && got !== stanceWas[A].n) fails.push('a page word (press) moved a stance: ' + stanceWas[A].n + ' -> ' + got); }
  if (k >= 4) checkStances(st, 'window ' + k);
  const ans = answersAt(k, st);
  for (const seat of status.seats) { if (!plainOk(S.contestView(st, seat))) fails.push('a view is not plain data'); S.answerContest(st, seat, ans[seat] || {}); }
  S.advanceContest(st);
}
if (Object.keys(setAt).length < 2) fails.push('the stance was never set on both seats (no standing squad at window 3)');
const saved = JSON.stringify(S.saveContest(st));
const copy = S.resumeContest(JSON.parse(saved), oa);
for (const seat of [A, B]) if (!same(S.contestView(st, seat), S.contestView(copy, seat))) fails.push('after resuming, ' + seat + "'s view differs");
checkStances(copy, 'the resumed copy');
if (!stanceChecks) fails.push('no squad set at window 3 was still standing to be checked');
let windows = 0;
while (!S.contestStatus(st).done && windows < 40) {
  for (const x of [st, copy]) { const status = S.contestStatus(x); for (const seat of status.seats) S.answerContest(x, seat, answersAt(k + windows)[seat] || {}); S.advanceContest(x); }
  windows++;
  if (S.contestStatus(st).done !== S.contestStatus(copy).done) { fails.push('the copies ended on different windows'); break; }
  if (!S.contestStatus(st).done) for (const seat of [A, B]) if (!same(S.contestView(st, seat), S.contestView(copy, seat))) { fails.push('window ' + (k + windows) + ': ' + seat + "'s view differs"); break; }
  if (fails.length) break;
}
const r1 = S.contestResult(st), r2 = S.contestResult(copy);
if (r1 && r2 && (r1.winner !== r2.winner || r1.days !== r2.days || r1.dead !== r2.dead)) fails.push('the outcomes differ');
console.log(fails.length ? '  FAIL  ' + [...new Set(fails)].slice(0, 4).join(' | ')
  : '  ok    a contest saved at window ' + k + ' (' + (saved.length / 1024).toFixed(0) + ' KB) and resumed is the same contest: ' + windows + ' more windows identical, the same outcome (' + (r1 ? (r1.winner || 'nobody') + ', day ' + r1.days : 'still running') + '); squad stances by engine key held through the save (' + stanceChecks + ' checks), a page word ignored');
process.exit(fails.length ? 1 : 0);
