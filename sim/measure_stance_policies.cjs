/* §STANCE WHICH WAY OF CHOOSING A STANCE WINS? Identical founded OAs; each seat is given a stance POLICY — a rule for
   picking its notch (and its squads' notches) at every comms window from what it can see — and the list is rotated.
     node sim/measure_stance_policies.cjs ffa FROM TO            eight policies, one seat each
     node sim/measure_stance_policies.cjs vs POLICY FROM TO      four flat-cautious seats against four of POLICY */
const D = __dirname + '/', fs = require('fs'), path = require('path');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const all = (n) => (x) => { const sq = {}; for (const q of x.squads) sq[q.sIdx] = n; return { corp: n, squads: sq }; };
const nearN = (x, q) => { let b = null, bd = 0.15; for (const e of x.known) { const d = x.dist(q.x, q.y, e.x, e.y); if (d < bd) { bd = d; b = e; } } return b ? (b.n || 1) : null; };
const byOdds = (fav, unfav) => (x) => { const sq = {}; for (const q of x.squads) { const n = nearN(x, q), h = x.head(q);
  sq[q.sIdx] = n == null ? 'standard' : h >= n * 1.3 ? fav : h < n * 0.8 ? unfav : 'standard'; } return { corp: 'standard', squads: sq }; };
const POL = {
  flatCautious:   { open: 'preservationist', f: all('preservationist') },
  flatBold:       { open: 'unyielding',      f: all('unyielding') },
  engine:         { open: 'standard',        f: null },                     /* the game's own: culture, hurt, penned, ahead */
  boldThenCareful:{ open: 'unyielding',      f: x => all(x.penned ? 'preservationist' : 'unyielding')(x) },
  carefulThenBold:{ open: 'preservationist', f: x => all(x.penned ? 'unyielding' : 'preservationist')(x) },
  hurtThenCareful:{ open: 'unyielding',      f: x => all(x.lostFrac > 0.25 ? 'preservationist' : 'unyielding')(x) },
  localOdds:      { open: 'standard',        f: byOdds('unyielding', 'preservationist') },   /* bold where it outnumbers, careful where outnumbered */
  boardOdds:      { open: 'standard',        f: x => all(x.odds > 0.16 ? 'unyielding' : x.odds < 0.09 ? 'preservationist' : 'standard')(x) },
  contraryOdds:   { open: 'standard',        f: byOdds('preservationist', 'unyielding') }    /* the other way round */
};
const mode = process.argv[2];
const seatsFor = mode === 'ffa'
  ? ['flatCautious', 'flatBold', 'engine', 'boldThenCareful', 'carefulThenBold', 'hurtThenCareful', 'localOdds', 'boardOdds']
  : ['flatCautious', 'flatCautious', 'flatCautious', 'flatCautious', process.argv[3], process.argv[3], process.argv[3], process.argv[3]];
const [a, b] = mode === 'ffa' ? [+process.argv[3], +process.argv[4]] : [+process.argv[4], +process.argv[5]];
const T = {};
for (let s = a; s < b; s++) {
  let prof = oa.map((o, i) => { const f = S.founderProfile(oa, 'F' + (i + 1), 'founder_' + (i + 1)); const p = POL[seatsFor[i]];
    f.engagement_lean = p.open; f._pol = seatsFor[i]; return f; });
  const k = s % 8; prof = prof.slice(k).concat(prof.slice(0, k));
  const rng = P.mulberry32(P.seedFrom('pol' + s)); const c = S.openFleet(rng, prof, {}); const st = S.beginSeason(rng, c, prof, {});
  while (st.month <= S.CONST.PREP_MONTHS) S.stepMonth(st); S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
  const d = S.prepareDivide(st);
  d.opts.stancePolicy = {}; for (const p of prof) if (POL[p._pol].f) d.opts.stancePolicy[p.id] = POL[p._pol].f;
  const r = DIV.runDivide(d.rng, d.opts);
  for (const p of prof) { const e = (T[p._pol] = T[p._pol] || { wins: 0, place: 0, n: 0 }); e.wins += r.winner === p.id ? 1 : 0; e.place += r.placement[p.id]; e.n++; }
}
console.log(JSON.stringify(T));
