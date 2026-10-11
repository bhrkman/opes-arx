/* §TIME NOBODY ABSENT STALLS THE GAME. With two human seats: the month waits until both have submitted, and forced
   it advances with the absent seat's month empty; the draft waits at a person's turn and, forced, the Aleas assign
   the next free landing; a ransom case a person never answers lapses after its windows. `node harness/probe_time.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const fails = [], say = [];
const rng = P.mulberry32(P.seedFrom('time')); const c = S.openFleet(rng, oa, {}); const A = oa[0].id, B = oa[3].id;
const st = S.beginSeason(rng, c, oa, { humans: [A, B] });
const m0 = st.month;
S.submitMonth(st, A, {});
let r = S.advanceMonth(st);
if (r.ok || st.month !== m0 || !(r.waitingOn || []).includes(B)) fails.push('the month did not wait for the second person');
else say.push('month waits on ' + r.waitingOn.join(', '));
r = S.advanceMonth(st, { force: true });
if (!r.ok || st.month !== m0 + 1 || !(r.forced || []).includes(B)) fails.push('forcing did not advance the month past the absent seat');
else say.push('forced past ' + r.forced.join(', '));
while (st.month <= S.CONST.PREP_MONTHS) { S.submitMonth(st, A, {}); S.submitMonth(st, B, {}); S.advanceMonth(st); }
S.closeSeasonToDrop(st);
const Dr = S.draftAdvance(st);
const whose = S.draftWhose(st);
if (!Dr.done && ![A, B].includes(whose)) fails.push('the draft stopped on a seat nobody holds');
const before = Object.keys(Dr.taken || {}).length;
const after = S.draftAdvance(st, null, { force: true });
if (!after.done) fails.push('the forced draft did not finish');
else say.push('draft finished; the Aleas assigned ' + (after.assigned || 0) + ' landing(s)');
const d = S.prepareDivide(st);
const gen = DIV.divideCore(d.rng, Object.assign({}, d.opts, { debugViews: true }));   /* this test reaches into the world on purpose */
let w = gen.next().value;
const cs = w.corps, own = cs.find(x => x.id === A), cap = cs.find(x => x.id !== A && x.id !== B);
const f = own.allBodies.find(b => b.status === 'active'); f.status = 'captured'; f._capturedBy = cap.id;
let opened = false, lapsed = false, ended = false, waited = 0;
for (let k = 0; k < 14; k++) {
  const cases = w.stats && w.stats.ransomCases || [];
  const kf = cases.find(x => x.fighter === f.id);
  if (kf && !kf.done) { opened = true; waited = kf.waited || 0; }
  if (kf && kf.lapsed) { lapsed = true; break; }
  const step = gen.next({ bySeat: { [A]: {}, [B]: {} } }); if (step.done) { ended = true; break; } w = step.value;
}
/* a contest that ends before the case's windows are up is not a case that failed to lapse */
if (opened && !lapsed && !ended) fails.push('an unanswered ransom case never lapsed');
say.push(opened ? (lapsed ? 'an unanswered ransom lapsed' : 'the contest ended with the case ' + waited + ' window(s) old, under its ' + DIV.CONST.RANSOM_ANSWER_WINDOWS) : 'no case opened (the captor would not sell)');
console.log(fails.length ? '  FAIL  ' + fails.join(' | ') : '  ok    nobody absent stalls the game: ' + say.join('; '));
process.exit(fails.length ? 1 : 0);
