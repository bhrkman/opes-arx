/* §CONTROLLER a full season and Divide with a HUMAN seat, every month and window answered with nothing, fingerprinted:
   the controller change must not move a thing with one human in the game. `record` then `check`. */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js'), R = require(D + 'reputation.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const out = [];
for (const seed of ['fpA', 'fpB']) {
  const rng = P.mulberry32(P.seedFrom(seed)); const c = S.openFleet(rng, oa, {});
  const me = oa[2].id; const st = S.beginSeason(rng, c, oa, { human: me });
  while (st.month <= S.CONST.PREP_MONTHS) S.stepMonth(st, { [me]: {} });
  S.closeSeasonToDrop(st); const d = S.prepareDivide(st); d.opts.human = me;
  const gen = DIV.divideCore(d.rng, d.opts); let step = gen.next(), windows = 0;
  while (!step.done) { windows++; step = gen.next({}); }
  const r = step.value || {};
  /* the Divide's result is its stats: the contest's own fight count lives in r.contest, the grid's in r.engagements */
  if (!r.contest || !(r.contest.fights > 0) || !(r.engagements > 0)) { console.log('  FAIL  ' + seed + ': no fights counted (contest ' + JSON.stringify(r.contest) + ', engagements ' + r.engagements + ')'); process.exit(1); }
  out.push({ seed, windows, winner: r.winner || (r.stats && r.stats.winner) || null,
    dead: r.dead, fights: r.contest ? r.contest.fights : null, engagements: r.engagements,
    rep: st.ids.map(id => [id, Math.round(R.standing(st.corps[id].rep, 'crowd')), Math.round(R.standing(st.corps[id].rep, 'houses'))]),
    money: st.ids.map(id => Math.round(st.corps[id].account.treasury)),
    roster: st.ids.map(id => st.corps[id].roster.length) });
}
const f = '/home/claude/opes-arx/harness/fingerprint_human.json';
if (process.argv[2] === 'record') { fs.writeFileSync(f, JSON.stringify(out)); console.log('fingerprint recorded:', out.map(o => o.seed + ' ' + o.windows + ' windows, winner ' + o.winner).join(' | ')); }
else { const was = JSON.parse(fs.readFileSync(f, 'utf8')); const same = JSON.stringify(was) === JSON.stringify(out);
  console.log(same ? '  ok    one human, identical: the controller changed nothing' : '  FAIL  with one human the game came out different');
  if (!same) for (let i = 0; i < out.length; i++) for (const k in out[i]) if (JSON.stringify(out[i][k]) !== JSON.stringify(was[i][k])) console.log('    ' + out[i].seed + ' ' + k + ': ' + String(JSON.stringify(was[i][k])).slice(0, 80) + ' -> ' + String(JSON.stringify(out[i][k])).slice(0, 80));
  process.exit(same ? 0 : 1); }
