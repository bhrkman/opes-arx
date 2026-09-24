/* §SEATS TWO PEOPLE AT ONE TABLE. A season and a Divide with two human seats: one pause holds both views, each sees
   its own OA, and each answer lands on its own OA — seat A posts a withdrawal offer, seat B sees it as an offer to
   answer and promises, and A reads B's promise. Fails if any step does not. `node harness/probe_seats.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const rng = P.mulberry32(P.seedFrom('two6')); const c = S.openFleet(rng, oa, {}); const A = oa[1].id, B = oa[5].id;
const st = S.beginSeason(rng, c, oa, { humans: [A, B] });
while (st.month <= S.CONST.PREP_MONTHS) S.stepMonth(st, { [A]: {}, [B]: {} });
S.closeSeasonToDrop(st); const d = S.prepareDivide(st);
const gen = DIV.divideCore(d.rng, d.opts); let w = gen.next().value; const fails = [];
if (!w.seats || !w.seats[A] || !w.seats[B]) fails.push('one pause does not hold both seats');
else {
  if (!(w.seats[A].you && w.seats[A].you.id === A && w.seats[B].you && w.seats[B].you.id === B)) fails.push('a seat does not see its own OA');
  w = gen.next({ bySeat: { [A]: { withdrawOffer: { credits: 0.2 } }, [B]: {} } }).value;
  if (!(w.seats[A].withdrawOffer)) fails.push("A's offer did not land on A");
  if (!(w.seats[B].withdrawAsks || []).some(a => a.from === A)) fails.push("B does not see A's offer to answer");
  w = gen.next({ bySeat: { [A]: {}, [B]: { withdrawReplies: { [A]: true } } } }).value;
  if (!((w.seats[A].withdrawReplies || {})[B] === true)) fails.push("B's promise did not reach A");
}
console.log(fails.length ? '  FAIL  ' + fails.join(' | ') : '  ok    two people at one table: one pause, two views, each answer on its own OA');
process.exit(fails.length ? 1 : 0);
