/* THE WHOLE YEAR, DIVIDE INCLUDED. measure_economy stops at the lock, so it has never seen what a
   Divide pays — and the settlement scale (what the ground pays against what an OA's people cost)
   was being judged without the settlement in it. This runs whole seasons for the fleet and reads,
   for every OA and every year, the treasury in and out, what the Divide paid it, and whether it
   won. `node sim/measure_year.cjs [seasons]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 4);
const corps = S.openFleet(P.mulberry32(5), oa, {});
const lowest = {}, broke = new Set(), dug = [];
const rows = { won: [], lost: [] }, divPay = { won: [], lost: [] }, surplus = [], kitSpend = [], kitHeld = [];
for (let y = 1; y <= N; y++) {
  const before = {};
  for (const id in corps) before[id] = corps[id].account.treasury;
  const rec = S.runSeason(P.mulberry32(700 + y), corps, oa, {});
  for (const id in corps) {
    const c = corps[id], pc = (rec.corps && rec.corps[id]) || {};
    const won = !!pc.won || rec.winner === id;
    const k = won ? 'won' : 'lost';
    rows[k].push(c.account.treasury - before[id]);
    divPay[k].push(pc.payout || c._payout || 0);
    surplus.push(c._surplusSold || 0);
    dug.push(c._sitesDug || 0);
    lowest[id] = Math.min(lowest[id] == null ? Infinity : lowest[id], c.account.treasury);
    if (c.account.treasury < 0 || c.account.solvent === false) broke.add(id);
    /* THE KIT PASS: what an OA actually spends on kit in a year, against what it fields */
    const spent = (c.account.ledger || []).filter(l => /procurement/i.test(l.label || l.kind || ''))
      .reduce((t, l) => t + Math.abs(l.amount || 0), 0);
    kitSpend.push(spent);
    const armoury = c.armoury || {};
    kitHeld.push(Object.keys(armoury).reduce((t, k) => t + (armoury[k] || 0), 0));
  }
}
const mean = a => a.length ? a.reduce((x, z) => x + z, 0) / a.length : 0;
const f = v => (v >= 0 ? '+' : '') + Math.round(v).toLocaleString();
console.log('\nTHE WHOLE YEAR, DIVIDE INCLUDED \u00b7 ' + N + ' seasons, the eight\n');
console.log('  the OA that WON    year ' + f(mean(rows.won)).padStart(12) + '   the Divide paid it ' + f(mean(divPay.won)).padStart(12) + '   (' + rows.won.length + ' seasons)');
console.log('  the OAs that LOST  year ' + f(mean(rows.lost)).padStart(12) + '   the Divide paid it ' + f(mean(divPay.lost)).padStart(12) + '   (' + rows.lost.length + ' OA-seasons)');
console.log('  surplus sold to the fleet, a season, per OA  ' + f(mean(surplus)));
const worst = Math.min.apply(null, rows.lost), best = Math.max.apply(null, rows.lost);
console.log('  a losing OA\u2019s year ranged ' + f(worst) + ' to ' + f(best));
console.log('  sites dug, per OA per season           ' + mean(dug).toFixed(1));
console.log('\n  SOLVENCY \u00b7 the lowest each OA\u2019s treasury fell');
Object.keys(lowest).forEach(k => console.log('    ' + k.slice(0, 18).padEnd(19) + f(lowest[k])));
console.log('  went under: ' + (broke.size ? [...broke].join(', ') : 'nobody'));
console.log('\n  THE KIT PASS');
console.log('  spent on kit, per OA over the run   ' + f(mean(kitSpend)));
console.log('  pieces in the armoury at the end    ' + Math.round(mean(kitHeld)));
