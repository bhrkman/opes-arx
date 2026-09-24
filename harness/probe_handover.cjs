/* §SEATS A SEAT CHANGES HANDS. In the season: a person takes an engine seat and the month waits for them; they leave
   and it does not. In a contest: seat B's person leaves at a window — B drops out of the next pause and the engine
   plays it (its stances move on the engine's judgement) — and comes back, and B is in the pause again.
   `node harness/probe_handover.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const fails = [], say = [];
const rng = P.mulberry32(P.seedFrom('hand')); const c = S.openFleet(rng, oa, {}); const A = oa[0].id, B = oa[3].id;
const st = S.beginSeason(rng, c, oa, { human: A });
S.setController(st, B, 'human');
S.submitMonth(st, A, {});
let r = S.advanceMonth(st);
if (r.ok || !(r.waitingOn || []).includes(B)) fails.push('a person taking a seat mid-season was not waited for');
S.setController(st, B, 'ai');
r = S.advanceMonth(st);
if (!r.ok) fails.push('the month still waited on a seat its person had left');
else say.push('season: waited while B was held, moved on when B was left');
S.setController(st, B, 'human');
while (st.month <= S.CONST.PREP_MONTHS) { S.submitMonth(st, A, {}); S.submitMonth(st, B, {}); S.advanceMonth(st); }
S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
const d = S.prepareDivide(st);
const gen = DIV.divideCore(d.rng, d.opts); let w = gen.next().value;
if (!(w.seats && w.seats[A] && w.seats[B])) fails.push('the contest did not start with both seats');
w = gen.next({ bySeat: { [A]: {}, [B]: {} }, seats: { [B]: 'ai' } }).value;
if (w.seats && w.seats[B]) fails.push('B was still in the pause after its person left');
else say.push('contest: B left the pause when its person did');
w = gen.next({ bySeat: { [A]: {} }, seats: { [B]: 'human' } }).value;
if (!(w.seats && w.seats[B])) fails.push('B did not come back to the pause');
else say.push('and came back when a person took it again');
console.log(fails.length ? '  FAIL  ' + fails.join(' | ') : '  ok    a seat changes hands: ' + say.join('; '));
process.exit(fails.length ? 1 : 0);
