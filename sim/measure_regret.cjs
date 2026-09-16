/* HOW WELL DO THE OAs DECIDE? A REGRET INSTRUMENT.
   Every tweak to a weight at the table was a guess dressed as a ruling, because nothing
   measured whether an OA's decisions were any good. This does, the only honest way there
   is: it runs a Divide, records every decision the AI made at the table (act or hold; which
   banner to approach; accept or refuse an ask), then for a sample of them REPLAYS THE WHOLE
   DIVIDE FROM ITS SEED with that one decision forced the other way and everything after left
   to the AI, and scores the OA's outcome under each. The score is the OA's own money —
   what the settlement paid it, less what its dead cost in pensions and replacements — the same
   currency the table prices in. THE NUMBER IS SIGNED: the other way minus the way taken. The
   first cut reported "best option minus chosen", which cannot be negative — an OA deciding
   perfectly still read as leaving money on the table from noise alone, and the first reading
   said principals were overpaying for joiners when the signed figure said the opposite. A
   single counterfactual is one draw of a noisy contest, so this is read over many decisions,
   not one; the sign of the mean is the finding, not any one row.
   `node sim/measure_regret.cjs [divides] [decisions per divide]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js'), DIV = require('./divide.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const DIVIDES = +(process.argv[2] || 4), PER = +(process.argv[3] || 6);

/* the fleet at the lock, rebuilt identically each time from the same seeds — a replay must
   start from the same drop, and runDivide mutates the corps it is given */
function atTheLock(seed) {
  const rng = P.mulberry32(P.seedFrom('regret' + seed));
  const founder = S.founderProfile(oa, 'X');
  const berth = oa.slice().sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0))[0].id;
  const profiles = oa.map(p => p.id === berth ? founder : p);
  const corps = S.openFleet(rng, profiles, {});
  const st = S.beginSeason(P.mulberry32(P.seedFrom('regret-y' + seed)), corps, profiles, { human: founder.id });
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  return { st: st, corps: corps, d: S.prepareDivide(st) };
}

/* what the Divide was worth to an OA, in its own money */
function worth(res, corps, id) {
  const c = corps[id];
  const take = (res.settlement && res.settlement.take && res.settlement.take[id]) || 0;
  /* `permanent` on the Divide's per-OA record is the dead and the career-ended, the
     losses an OA does not get back; priced at the mean of its contracts' pension and
     replacement, as the table prices a body */
  const pc = (res.perCorp || []).filter(x => x.id === id)[0] || {};
  return take - (pc.permanent || 0) * meanBody(c);
}
function meanBody(c) {
  const bs = (c.roster || []).filter(b => b.contract);
  if (!bs.length) return 0;
  return bs.reduce((t, b) => t + (b.contract.death_benefit || 0) + (b.contract.signing_cost || 0), 0) / bs.length;
}

const sameKey = (a, b) => a.kind === b.kind && a.day === b.day && a.corp === b.corp && (a.joiner || '') === (b.joiner || '');

const k = n => (n > 0 ? '+' : '') + Math.round(n / 1000) + 'k';
const rows = [];
for (let seed = 1; seed <= DIVIDES; seed++) {
  /* 1. the reference run, recording every decision */
  const base = atTheLock(seed);
  const log = [];
  base.d.opts.onDecision = (k, dflt, options, pick) => { if (options.length > 1) log.push({ key: k, dflt: dflt, options: options }); };
  const res0 = DIV.runDivide(base.d.rng, base.d.opts);
  const ref = {}; for (const id of Object.keys(base.corps)) ref[id] = worth(res0, base.corps, id);

  /* 2. a sample of decisions, spread across kinds and days */
  /* the principal's accept/refuse is the decision that binds (measured: 29 of 30 act/target
     replays were moot), so it is sampled first and the rest fill what is left */
  const kinds = ['take', 'act', 'target'];
  const sample = [];
  for (const kind of kinds) {
    const of = log.filter(l => l.key.kind === kind);
    const room = PER - sample.length; if (room <= 0) break;
    const step = Math.max(1, Math.floor(of.length / room));
    for (let i = 0; i < of.length && sample.length < PER; i += step) sample.push(of[i]);
  }

  /* 3. each one forced the other way, the rest of the Divide left to the AI */
  for (const dec of sample) {
    const alts = dec.options.filter(o => o !== dec.dflt);
    const alt = {};
    for (const o of alts.slice(0, 2)) {                 /* at most two alternatives a decision */
      const run = atTheLock(seed);
      let fired = false;
      run.d.opts.decide = (k, d, options) => { if (!fired && sameKey(k, dec.key)) { fired = true; return o; } return undefined; };
      const res = DIV.runDivide(run.d.rng, run.d.opts);
      if (!fired) continue;                            /* the stream drifted before the point; skip */
      alt[o] = worth(res, run.corps, dec.key.corp);
    }
    if (!Object.keys(alt).length) continue;
    /* signed: the best of the other ways, minus the way taken */
    const bestAlt = Math.max.apply(null, Object.keys(alt).map(o => alt[o]));
    const regret = bestAlt - ref[dec.key.corp];
    if (process.env.ROWS) console.log('   ', dec.key.kind, dec.key.corp.slice(0, 8), 'day', dec.key.day, 'chose', dec.dflt, '=', k(ref[dec.key.corp]), 'alts', JSON.stringify(Object.keys(alt).reduce((o, x) => (o[x] = k(alt[x]), o), {})));
    rows.push({ seed: seed, kind: dec.key.kind, corp: dec.key.corp, day: dec.key.day,
                chosen: dec.dflt, chosenWorth: ref[dec.key.corp], alt: alt, regret: regret });
  }
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log('\nREGRET AT THE TABLE \u00b7 ' + DIVIDES + ' Divides \u00b7 ' + rows.length + ' decisions replayed the other way');
/* a decision is MOOT when every other way led to the same money — an offer that could not
   close whichever banner it went to, a hold that changed nothing. Those are counted, not scored:
   they say how much of the AI's deciding is theatre. */
const moot = r => Object.keys(r.alt).length > 0 && Object.keys(r.alt).every(o => Math.abs(r.alt[o] - r.chosenWorth) < 1);
for (const kind of ['act', 'target', 'take']) {
  const rs = rows.filter(r => r.kind === kind);
  if (!rs.length) continue;
  const live = rs.filter(r => !moot(r));
  const wrong = live.filter(r => r.regret > 0).length;
  console.log('  ' + kind.padEnd(7) + ' n ' + String(rs.length).padStart(3) + '   moot ' + String(rs.length - live.length).padStart(3) +
              '   live ' + String(live.length).padStart(3) + '   other way minus chosen, mean ' + k(mean(live.map(r => r.regret))).padStart(7) +
              '   the other way was better in ' + wrong + '/' + live.length);
}
console.log('\n  by OA');
const byCorp = {};
for (const r of rows) if (!moot(r)) (byCorp[r.corp] = byCorp[r.corp] || []).push(r.regret);
for (const id of Object.keys(byCorp).sort()) console.log('    ' + id.padEnd(20) + ' n ' + String(byCorp[id].length).padStart(2) + '  other way minus chosen ' + k(mean(byCorp[id])));
console.log('\n  negative: the OA chose better than the other way, on average. positive: money left on the table. one replay each, so read the mean over many rows.');
