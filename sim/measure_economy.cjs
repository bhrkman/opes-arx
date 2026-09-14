/* WHAT A YEAR COSTS AND WHAT IT PAYS.
   Every other system assumes credits are scarce — the Market, the Paper, the sponsors, the kit
   cap, the boost button. If they are not, none of those decisions is a decision, and every
   balance pass measured against them is measured against a false constraint. Nothing had ever
   read the books end to end. `node sim/measure_economy.cjs [years]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js'), L = require('./ledger.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;

const YEARS = +(process.argv[2] || 3);
const rng = P.mulberry32(P.seedFrom('econ'));
const corps = S.openFleet(rng, oa, {});
const me = Object.keys(corps)[0];
const c = corps[me];
console.log('\n== A CORPORATION\'S BOOKS ==');
console.log('  opening treasury ' + Math.round(c.account.treasury) +
            ', board grant ' + Math.round(c.account.grant || 0));

const totals = {};
for (let y = 1; y <= YEARS; y++) {
  const st = S.beginSeason(P.mulberry32(P.seedFrom('econ' + y)), corps, oa, { human: me });
  const n0 = (c.account.ledger || []).length;
  const open = c.account.treasury;
  while (st.month <= 11) S.stepMonth(st);
  const led = (c.account.ledger || []).slice(n0);
  const by = {};
  for (const l of led) { by[l.label || l.kind] = (by[l.label || l.kind] || 0) + l.amount; }
  for (const k in by) totals[k] = (totals[k] || 0) + by[k];
  const alive = c.roster.filter(f => f.status === 'active');
  console.log('\n  YEAR ' + y + '  roster ' + alive.length +
              '  treasury ' + Math.round(open) + ' \u2192 ' + Math.round(c.account.treasury) +
              '  (' + (c.account.treasury >= open ? '+' : '') + Math.round(c.account.treasury - open) + ')');
  Object.entries(by).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .forEach(([k, v]) => console.log('      ' + k.padEnd(26) + (v > 0 ? '+' : '') + Math.round(v)));
  S.closeSeasonToDrop(st);        /* the lock takes the entry fee */
  console.log('      ' + 'at the lock'.padEnd(26) + Math.round(c.account.treasury));
}
const net = Object.values(totals).reduce((a, b) => a + b, 0);
console.log('\n  over ' + YEARS + ' years the books moved ' + (net > 0 ? '+' : '') + Math.round(net) +
            ', a year averaging ' + (net > 0 ? '+' : '') + Math.round(net / YEARS));
/* the two costs that were computed and never charged; if either goes missing again this
   instrument is the thing that will notice */
const hasWages = (c.account.ledger || []).some(l => /Wages/.test(l.label || ''));
const hasFee = (c.account.ledger || []).some(l => /Aleas entry/.test(l.label || ''));
console.log('  wages charged: ' + (hasWages ? 'yes' : 'NO \u2014 the largest cost in the game is unposted'));
console.log('  entry fee charged: ' + (hasFee ? 'yes' : 'NO \u2014 a house enters the Divide free'));
if (!hasWages || !hasFee) process.exit(1);
