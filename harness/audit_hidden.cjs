/* AUDIT 1 — WHAT IS SIMULATED AND NEVER SHOWN. Lists every field the engine hands the page — a
   Divide window, your corp in it, a squad, a fighter; and between seasons an OA, its reputation, a
   contract, a condition — that the page never names. Never named is not the same as never shown:
   each hit still has to be judged. But it is where the invisible systems live.
   `node harness/audit_hidden.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const page = fs.readFileSync('/home/claude/opes-arx/viewers/corp_template.html', 'utf8');
const named = k => new RegExp('[.\\[\'"]' + k + '\\b').test(page);
function report(label, obj) {
  const keys = Object.keys(obj || {}).filter(x => !x.startsWith('_'));
  const unread = keys.filter(x => !named(x));
  console.log('\n' + label + ' \u2014 ' + keys.length + ' fields, ' + unread.length + ' never named on the page:');
  console.log('  ' + (unread.join(', ') || '(none)'));
}
{
  const rng = P.mulberry32(P.seedFrom('aud'));
  const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st); d.opts.human = st.ids[0];
  const gen = DIV.divideCore(d.rng, d.opts);
  let step = gen.next(), w = null, k = 0;
  while (!step.done && k++ < 4) { w = step.value; step = gen.next({}); }
  const sq = (w && w.you && w.you.squads || [])[0];
  report('THE WINDOW', w);
  report('YOUR CORP IN THE WINDOW', w && w.you);
  report('ONE OF YOUR SQUADS', sq);
  report('ONE OF YOUR FIGHTERS, IN A CONTEST', sq && sq.bodies && sq.bodies[0]);
}
{
  const c = S.openFleet(P.mulberry32(5), oa, {});
  S.runSeason(P.mulberry32(801), c, oa, {});
  const me = Object.values(c)[1];
  report('AN OA, BETWEEN SEASONS', me);
  report('ITS REPUTATION', me.rep);
  report('A FIGHTER ON ITS ROSTER', me.roster[0]);
  report('A FIGHTER\u2019S CONTRACT', me.roster[0].contract);
  report('A FIGHTER\u2019S CONDITION', me.roster[0].condition);
}
