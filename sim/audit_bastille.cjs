/* THE OAs OFFER BLIND, AND THIS IS WHAT PROVES IT.
   The Bastille sheet hides a man's stats, ceiling and traits from the manager. If the seven AI
   OAs could read them, the intake would be rigged: they would buy the diamonds a short road
   out and leave the busts to the player at the sentence, and a blind market would be blind for
   one side only. So: run the Kier over many seasons of one fleet, and set the Divides each
   OA bought off a man's sentence against the stat total it was not allowed to see. The
   correlation must sit at zero. Also checks the arithmetic the sheet stands on: the same wage
   and the same fee for every volunteer, remission charged for exactly the Divides forgiven,
   and the money going to the Kier. `node sim/audit_bastille.cjs [seasons]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const rec = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'recruitment.json'), 'utf8'));
const KIER = rec.pools.prisoner.kier_wage_monthly, FEE = rec.pools.prisoner.kier_processing_fee,
      REM = rec.pools.prisoner.remission_per_divide;

const SEASONS = +(process.argv[2] || 30);
const STAT = ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve'];
const tot = f => STAT.reduce((a, k) => a + (f.stats[k] || 0), 0);
const corr = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

const bought = [], totals = [], roads = [], sentences = [];
let wageWrong = 0, feeWrong = 0, sold = 0, lot = 0, feePaid = 0, remPaid = 0, remDue = 0, fleetOffers = 0, human = 0;
/* ONE FLEET, MANY SEASONS. A lot is seeded by kind, season and month; a probe that opened a
   fresh fleet every pass was at season one every pass and auctioned the same six men forty
   times, and read a correlation of -0.55 between youth and a stat total off six people. */
const rng = P.mulberry32(P.seedFrom('bas-audit'));
const corps = S.openFleet(rng, oa, {});
const ids = Object.keys(corps);
for (let y = 1; y <= SEASONS; y++) {
  const st = S.beginSeason(rng, corps, oa, { human: ids[0] });
  while (st.month <= 11) {
    /* read the UNDERLYING fighters off the open lot — the instrument may X-ray, the OAs may not */
    const open = st.lots.bastille;
    const byId = {};
    if (open) for (const f of open) {
      byId[f.id] = f;
      if (f.contract.salary !== KIER) wageWrong++;
      if (f.contract.signing_cost !== FEE) feeWrong++;
    }
    const n0 = (st.bastille.results || []).length;
    S.stepMonth(st);
    for (const r of (st.bastille.results || [])) {
      const f = byId[r.fighterId]; if (!f) continue;
      const t = tot(f);
      for (const o of r.offers) {
        if (o.corp === ids[0]) { human++; continue; }        /* the manager's OA offers the sentence */
        bought.push(r.sentence - o.term); totals.push(t);
      }
      roads.push(r.term); sentences.push(r.sentence);
      remDue += REM * (r.sentence - r.term);
      sold++;
    }
  }
  lot += st.bastille.lot; fleetOffers += st.bastille.bids;
  S.closeSeasonToDrop(st);
}
for (const id of ids) for (const l of corps[id].account.ledger || []) {
  if (l.label === 'Kier processing') feePaid += -l.amount;
  if (l.label === 'Kier remission') remPaid += -l.amount;
}

const cBuy = corr(bought, totals);
const q = (a, p) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length * p)]; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
console.log('\nTHE KIER BASTILLE \u00b7 ' + SEASONS + ' seasons \u00b7 ' + lot + ' on the sheet, ' + sold +
            ' placed, ' + fleetOffers + ' offers, \u20a1' + Math.round(feePaid) + ' in fees and \u20a1' +
            Math.round(remPaid) + ' in remission to the Kier');
console.log('  offers per man        ' + (lot ? (fleetOffers / lot).toFixed(1) : '-'));
console.log('  sentence              mean ' + mean(sentences).toFixed(2) + '   road taken  mean ' + mean(roads).toFixed(2) +
            '   forgiven ' + mean(sentences.map((x, i) => x - roads[i])).toFixed(2) + ' a man');
console.log('  Divides bought by AI  mean ' + mean(bought).toFixed(2) + '   p90 ' + q(bought, 0.9));
console.log('  bought ~ hidden stats r = ' + cBuy.toFixed(3) + '   (the OAs cannot see them)');
console.log('  wage off the scale    ' + wageWrong + '   fee off the scale  ' + feeWrong +
            '   remission charged ' + Math.round(remPaid) + ' of ' + Math.round(remDue) + ' due');

const fails = [];
/* the offers are clustered by man — eight OAs read one sheet — so the sample that matters is
   the men, not the offers; the bound is two standard errors on that count */
const bound = 2 / Math.sqrt(Math.max(1, sold));
if (Math.abs(cBuy) > bound) fails.push('AI remission tracks the hidden numbers (r=' + cBuy.toFixed(3) + ', bound ' + bound.toFixed(3) + ')');
if (wageWrong) fails.push(wageWrong + ' volunteers not on the Kier wage');
if (feeWrong) fails.push(feeWrong + ' fees off the Kier scale');
if (Math.abs(remPaid - remDue) > 1) fails.push('remission charged does not match the Divides forgiven');
if (!sold) fails.push('nobody placed');
if (sold && feePaid <= 0) fails.push('the Kier was never paid');
if (fails.length) { console.log('\n  FAIL\n    ' + fails.join('\n    ')); process.exit(1); }
console.log('  ok');
