/* §SIGHT SAW THEM FIRST, PROVED BY INTERVENTION. A side whose squads knew where an enemy squad in the fight stood
   before the tick of contact (seen, heard, briefed or relayed: its contest knowledge, `cq.know`) fights readier; a side
   that did not, does not. divide.js reads that in gridResolve. This probe hooks the contest's resolver and the tactical
   resolver (no engine file is touched) and runs the same contest several times from the same seed:
     run 0  the census: every fight, every side, did it know before contact (read here, from cq.know) and its readiness;
            fails unless both kinds of side turn up;
     run 1  the first fight with a knowing side: that side's prior knowledge is struck out just before the fight is
            resolved; its readiness must fall by the saw-first edge, and nobody else's may move;
     run 2  the first fight with a side that did not know: it is told where one enemy squad stood a tick before
            contact; its readiness must rise by the edge, nobody else's may move;
     run 3  the same side is told at the very tick of contact instead; that is not seeing them first, nothing moves.
   Each intervention run stops the contest once its fight's readiness is read.
   `node harness/probe_initiative.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const CONTEST = require(D + 'contest.js'), TACTICAL = require(D + 'tactical.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const EDGE = 0.15, EPS = 1e-9, TICKS = CONTEST.CONST.TICKS_A_DAY;
const SEED = process.argv[2] || 'ini1';

/* the hooks: one resolve call → `pending` (the fight, the knowledge read before it), the tactical call → its prep */
let hook = null;
const origOpen = CONTEST.open, origTac = TACTICAL.resolve;
CONTEST.open = function () {
  const st = origOpen.apply(this, arguments), inner = st.resolve;
  st.resolve = (s, f, r) => { if (hook) hook.before(s, f); return inner(s, f, r); };
  return st;
};
TACTICAL.resolve = function (rng, built, ctx) {
  if (hook) hook.prep(ctx.prep.slice());
  return origTac.apply(this, arguments);
};
const STOP = { stop: true };

/* who on each side knew where an enemy in the fight stood before now — the same squads gridResolve fields first
   (the early comers; an all-late side's first comer) */
function fielded(f) { return f.sides.map(Sd => { const e = Sd.squads.filter(x => x.atTurn <= 1); return e.length ? e : [Sd.squads[0]]; }); }
function knewBefore(st, f) {
  const nowT = st.day * TICKS + st.tick, field = fielded(f);
  return f.sides.map((Sd, gi) => {
    const foes = new Set(); f.sides.forEach((O, oi) => { if (oi !== gi) for (const y of O.squads) foes.add(y.id); });
    return field[gi].some(x => Object.values(st.squads[x.id].know || {}).some(k => k.squad != null && foes.has(k.squad) && k.at < nowT));
  });
}

function runOnce(h) {
  const rng = P.mulberry32(P.seedFrom(SEED)); const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st); S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  hook = h;
  try { DIV.runDivide(d.rng, d.opts); } catch (e) { if (e !== STOP) throw e; } finally { hook = null; }
}

/* run 0: the census */
const fights = [];
runOnce({ before(st, f) { fights.push({ knew: knewBefore(st, f), prep: null }); }, prep(p) { fights[fights.length - 1].prep = p; } });
const sides = [].concat(...fights.filter(x => x.prep).map(x => x.knew.map((k, i) => ({ k, p: x.prep[i] }))));
const knewN = sides.filter(s => s.k).length, notN = sides.filter(s => !s.k).length;
const mean = a => a.length ? a.reduce((t, s) => t + s.p, 0) / a.length : NaN;
console.log('\nSAW THEM FIRST · seed ' + SEED + ' · ' + fights.length + ' fights resolved\n');
console.log('  sides that knew before contact   ' + String(knewN).padStart(4) + '   mean readiness ' + mean(sides.filter(s => s.k)).toFixed(3));
console.log('  sides that did not               ' + String(notN).padStart(4) + '   mean readiness ' + mean(sides.filter(s => !s.k)).toFixed(3));
const fails = [];
if (!knewN || !notN) fails.push('every side meets its enemy the same way (' + knewN + ' knew, ' + notN + ' did not): the rule tells nobody apart');

/* the targets: readiness off the clamps so an edge of EDGE can show whole */
const roomDown = p => p - EDGE >= 0 && p < 1 - EPS, roomUp = p => p + EDGE <= 1 && p > EPS;
const A = fights.findIndex(x => x.prep && x.knew.some((k, i) => k && roomDown(x.prep[i])));
const B = fights.findIndex(x => x.prep && x.knew.some((k, i) => !k && roomUp(x.prep[i])));

function intervene(at, side, act) {
  let n = -1, got = null;
  runOnce({
    before(st, f) { n++; if (n !== at) return; act(st, f, side); },
    prep(p) { if (n === at) { got = p; throw STOP; } }
  });
  return got;
}
function check(label, base, got, side, want) {
  if (!got) { fails.push(label + ': the fight never came round again (the contest is not deterministic from its seed)'); return; }
  const moved = got[side] - base[side];
  const others = base.every((p, i) => i === side || Math.abs(p - got[i]) < 1e-6);
  const ok = Math.abs(moved - want) < 1e-6 && others;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label + ': readiness ' + base[side].toFixed(3) + ' -> ' + got[side].toFixed(3) + ' (want ' + (want >= 0 ? '+' : '') + want.toFixed(2) + ')' + (others ? '' : '; another side moved: ' + base.map(x => x.toFixed(3)).join('/') + ' -> ' + got.map(x => x.toFixed(3)).join('/')));
  if (!ok) fails.push(label);
}
console.log('');
if (A < 0) fails.push('no fight had a knowing side with room to lose the edge');
else {
  const side = fights[A].knew.findIndex((k, i) => k && roomDown(fights[A].prep[i]));
  const got = intervene(A, side, (st, f, gi) => {
    const nowT = st.day * TICKS + st.tick, foes = new Set(); f.sides.forEach((O, oi) => { if (oi !== gi) for (const y of O.squads) foes.add(y.id); });
    for (const x of f.sides[gi].squads) { const kn = st.squads[x.id].know; for (const z in kn) if (kn[z].squad != null && foes.has(kn[z].squad) && kn[z].at < nowT) delete kn[z]; }
  });
  check('fight ' + (A + 1) + ', a side that knew, its knowledge struck out', fights[A].prep, got, side, -EDGE);
}
if (B < 0) fails.push('no fight had an unknowing side with room to gain the edge');
else {
  const side = fights[B].knew.findIndex((k, i) => !k && roomUp(fights[B].prep[i]));
  const tell = (dt) => (st, f, gi) => {
    const nowT = st.day * TICKS + st.tick, foe = f.sides.find((O, oi) => oi !== gi).squads[0], q = st.squads[foe.id];
    st.squads[fielded(f)[gi][0].id].know['probe_' + foe.id] = { at: nowT + dt, oa: q.oa, n: q.n, squad: foe.id, how: 'probe' };
  };
  check('fight ' + (B + 1) + ', a side that did not know, told a tick before contact', fights[B].prep, intervene(B, side, tell(-1)), side, EDGE);
  check('fight ' + (B + 1) + ', the same side, told at the tick of contact', fights[B].prep, intervene(B, side, tell(0)), side, 0);
}
console.log(fails.length ? '\n  FAIL  ' + fails.join(' | ') : '\n  ok    a side that knew where its enemy stood before contact fights readier; one that did not, does not');
process.exit(fails.length ? 1 : 0);
