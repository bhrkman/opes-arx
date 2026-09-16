/* WHAT A FIGHTER COSTS AND WHAT HE BRINGS.
   The fiction is that a Natural-Born is young, raw, cheap and signed long; a mercenary is
   proven, expensive and gone in a year; a conscript is cheap and damaged. Whether the DATA says
   that has never been checked. This reads the markets a manager actually sees, prices each hand
   over the whole term of the paper he would sign, and sets that against what he brings.
   `node sim/measure_value.cjs [years]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js'), R = require('./roster.js'), L = require('./ledger.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;

const YEARS = +(process.argv[2] || 4);
const seen = { tryouts: [], mercs: [], bastille: [] };
for (let y = 1; y <= YEARS; y++) {
  const rng = P.mulberry32(P.seedFrom('val' + y));
  const corps = S.openFleet(rng, oa, {});
  const me = Object.keys(corps)[0];
  const st = S.beginSeason(rng, corps, oa, { human: me });
  while (st.month <= 11) {
    for (const rec of (S.lotFor(st, me) || [])) {
      const k = rec.kind || rec.contractKind;
      if (!seen[k]) continue;
      /* §BASTILLE the sheet a manager sees is blind for a prisoner; the instrument reads the
         man underneath, because what it prices is what he IS, not what the auctioneer says.
         The ask for a prisoner is the Kier's scale, the same for every one of them; the reserve
         is a one-off paid at the hammer, and a year is a year. */
      const f = k === 'bastille' ? (st.lots.bastille || []).filter(x => x.id === rec.id)[0] || rec : rec;
      if (!f.stats) continue;
      const sum = ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve']
        .reduce((a, s2) => a + (f.stats[s2] || 0), 0);
      seen[k].push({ ask: rec.ask != null ? rec.ask : (rec.wage || 0),
                     age: f.age, pot: f.potential, sum: sum,
                     aim: f.stats.aim, exp: (f.experience && f.experience.divides) || 0,
                     years: rec.seasons || (R.seasonsRange(k === 'tryouts' ? 'nattie'
                            : k === 'mercs' ? 'mercenary' : 'prisoner') || [1])[0] });
    }
    S.stepMonth(st);
  }
}
const mid = (a, f) => { const v = a.map(f).sort((x, y) => x - y); return v[Math.floor(v.length / 2)] || 0; };

/* WHAT EACH POOL IS AS A PEOPLE, read by a fighter's OWN origin. `generateSquad` takes a pool
   option and ignores it — it deals the standard mix whatever is asked for — so a probe that
   passes `{pool:'prisoner'}` and compares the result to `{pool:'nattie'}` is comparing one
   population to itself and will find the three kinds identical. They are not. */
{
  const b = R.generateSquad(P.mulberry32(P.seedFrom('pools')), 1200, {}).bodies;
  const by = {};
  for (const f of b) { const k = (f.contract || {}).kind || '?'; (by[k] = by[k] || []).push(f); }
  console.log('\n== WHAT EACH POOL IS, BEFORE ANY PRICE ==');
  for (const k of ['nattie', 'mercenary', 'prisoner']) {
    const a = by[k] || []; if (!a.length) continue;
    const tot = f => ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve']
      .reduce((s2, x) => s2 + f.stats[x], 0);
    const v = a.map(tot).sort((x, y) => x - y);
    const q = pc => Math.round(v[Math.floor(v.length * pc)]);
    const neg = a.filter(f => (f.traits || []).some(t => {
      const d = R.traitById[t]; return d && (d.tags || []).includes('negative'); })).length;
    console.log('  ' + k.padEnd(11) + 'stats p10 ' + q(0.1) + '  median ' + q(0.5) + '  p90 ' + q(0.9) +
      '  spread ' + (q(0.9) - q(0.1)) +
      '  loyalty ' + mid(a, f => f.loyalty) +
      '  negative traits ' + Math.round(neg / a.length * 100) + '%');
  }
}
const NAME = { tryouts: 'Natural-Born', mercs: 'Mercenary', bastille: 'Conscript' };
console.log('\n== WHAT THE MARKETS ASK (median of ' + YEARS + ' careers) ==');
const rows = {};
for (const k of Object.keys(seen)) {
  const a = seen[k]; if (!a.length) continue;
  const ask = mid(a, x => x.ask), yrs = mid(a, x => x.years), sum = mid(a, x => x.sum);
  /* ASK IS A YEAR. `askingPrice` is salary × SALARY_MONTHS, so the ask on a sheet is already
     twelve months; this multiplied it by twelve again and put a ₡27,612 Natural-Born year into
     PROJECT.md that was ₡2,301. The ratios between the three pools survived the error, which
     is how it lasted — every figure was wrong by the same factor. */
  rows[k] = { ask, yrs, sum,
    year: ask, term: ask * yrs,
    perPoint: ask / sum, age: mid(a, x => x.age), exp: mid(a, x => x.exp),
    pot: mid(a, x => x.pot), n: a.length };
  const r = rows[k];
  console.log('  ' + NAME[k].padEnd(14) + 'n=' + String(r.n).padStart(3) +
    '  ask ' + String(Math.round(ask)).padStart(5) + '/yr' +
    '  term ' + r.yrs + 'y' +
    '  age ' + String(r.age).padStart(2) +
    '  divides ' + r.exp +
    '  stats ' + Math.round(sum) +
    '  potential ' + Math.round(r.pot));
}
/* COST PER YEAR OF SERVICE IS THE ONLY HONEST MEASURE. The first cut of this compared TOTAL
   OUTLAY over the term — 110,448 against 94,368 — and concluded a mercenary was the cheaper
   man. That is nonsense: a four-year paper BUYS FOUR YEARS. Comparing a four-year bill to a
   one-year bill and calling the smaller number better is comparing a mortgage to a night's
   rent. And a long contract is not even a full liability, because a hand who dies stops being
   paid: the term is an OPTION the OA holds, not a debt it owes. */
console.log('\n== WHAT A YEAR OF HIM COSTS ==');
for (const k of Object.keys(rows)) {
  const r = rows[k];
  console.log('  ' + NAME[k].padEnd(14) +
    'per year of service ' + String(Math.round(r.year)).padStart(7) +
    '   per stat point ' + String(Math.round(r.perPoint)).padStart(5) + '/yr' +
    '   term ' + r.yrs + 'y (' + String(Math.round(r.term)).padStart(6) + ' if he lives it out)');
}
const n = rows.tryouts, m = rows.mercs;
if (n && m) {
  console.log('\n  A MERCENARY COSTS ' + (m.year / n.year).toFixed(1) + 'x A NATURAL-BORN' +
              ' FOR EVERY YEAR HE SERVES, AND CARRIES ' + ((m.sum / n.sum - 1) * 100).toFixed(0) + '% MORE STAT.');
  console.log('  Per stat point that is ' + Math.round(m.perPoint) + '/yr against ' +
              Math.round(n.perPoint) + ' \u2014 ' + (m.perPoint / n.perPoint).toFixed(1) + 'x the price for the same quality.');
  console.log('  Measured worth of stat: +15 points on ONE stat is 54% wins against 46%,' +
              ' so ' + Math.round(m.sum - n.sum) + ' points spread over seven is a slim edge.');
  console.log('  The short term is the mercenary\'s COST, not his discount: the OA carries the');
  console.log('  risk of replacing him every year, and holds no option on him if he comes good.');
}
