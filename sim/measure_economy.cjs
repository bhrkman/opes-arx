/* WHAT A YEAR COSTS AND WHAT IT PAYS.
   Every other system assumes credits are scarce — the Market, the Paper, the sponsors, the kit
   cap, the boost button. If they are not, none of those decisions is a decision, and every
   balance pass measured against them is measured against a false constraint. Nothing had ever
   read the books end to end. `node sim/measure_economy.cjs [years]`
   THE FIRST CUT READ ELEVEN MONTHS OF ONE OA. The board grant, the entry fee, the retainer's
   last twelfth and the purse all land AT THE LOCK, which it stopped short of, and it read the
   OA that happened to be first. This reads every OA, through the lock, and says what the
   year was. (The Divide's own money — the bonus on a win, ransoms — lands after and is not here:
   this is what an OA clears BEFORE it fights.) */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js'), L = require('./ledger.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;

const YEARS = +(process.argv[2] || 3);
/* THE ONLY OA A MANAGER CAN PLAY IS THE ONE HE FOUNDS. The first cut of this instrument
   handed an established OA to the "human" and read its books; no such game exists. It
   founds an OA the way the desk does (`founderProfile`, in the weakest berth, as the desk
   does), plays it the way a careful manager would, and reports THAT OA first. The eight
   are read after it, because they are funded relative to it. */
const rng = P.mulberry32(P.seedFrom('econ'));
const founder = S.founderProfile(oa, 'The Measured OA');
const berth = oa.slice().sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0))[0].id;
const profiles = oa.map(p => p.id === berth ? founder : p);
const corps = S.openFleet(rng, profiles, {});
const me = founder.id;
const ids = [me].concat(Object.keys(corps).filter(id => id !== me));
const alive = c => c.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
const nf = n => (n > 0 ? '+' : '') + Math.round(n);
const diffOf = id => id === me ? 'F' : oa.filter(p => p.id === id)[0].difficulty;

/* A CAREFUL MANAGER: his own people from the tryouts until the roster is full, prisoners at
   their sentence (the engine's default for his OA), a mercenary only to fill the last
   slots. Not the best play — a baseline a new player would find on his own. */
function careful(st) {
  const c = corps[me];
  for (const f of (S.lotFor(st, me) || [])) {
    const n = alive(c).length;
    if (f.contractKind === 'nattie') { if (n < 24) S.placeBid(st, me, f.id, f.ask || 1); }
    else if (f.contractKind === 'mercenary') {
      st.bids.mercs[me] = st.bids.mercs[me] || {};
      if (n < 22) S.placeBid(st, me, f.id, f.ask); else st.bids.mercs[me][f.id] = 0;
    }
  }
}

const years = [];        /* per year: { id: { open, close, roster, by } } */
for (let y = 1; y <= YEARS; y++) {
  const st = S.beginSeason(P.mulberry32(P.seedFrom('econ' + y)), corps, profiles, { human: me });
  const mark = {}; for (const id of ids) mark[id] = { n0: corps[id].account.ledger.length, open: corps[id].account.treasury };
  while (st.month <= 11) { careful(st); S.stepMonth(st); }
  S.closeSeasonToDrop(st);        /* the lock: grant, entry fee, the last retainer, the purse */
  const yr = {};
  for (const id of ids) {
    const c = corps[id], by = {};
    for (const l of c.account.ledger.slice(mark[id].n0)) by[l.label || l.kind] = (by[l.label || l.kind] || 0) + l.amount;
    yr[id] = { open: mark[id].open, close: c.account.treasury, roster: alive(c).length, dropped: (c._drop || []).length, by };
  }
  years.push(yr);
}

/* ---- the founded OA, line by line, so the shape can be read ---- */
console.log('\n== THE FOUNDED OA, THROUGH THE LOCK (played carefully; opens with ' +
            Math.round(years[0][me].open / 1000) + 'k) ==');
years.forEach((yr, i) => {
  const r = yr[me];
  console.log('\n  YEAR ' + (i + 1) + '  roster ' + r.roster + ' (' + r.dropped + ' drop)  treasury ' +
              Math.round(r.open) + ' \u2192 ' + Math.round(r.close) + '  (' + nf(r.close - r.open) + ')');
  Object.entries(r.by).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .forEach(([k, v]) => console.log('      ' + k.padEnd(26) + nf(v)));
});

/* ---- every OA, the year's shape ---- */
console.log('\n== EVERY OA, AVERAGED OVER ' + YEARS + ' YEARS (F = the founded OA) ==');
console.log('  ' + 'OA'.padEnd(20) + 'diff  roster   grant     gate   purses+   pay(-)   entry   other      net');
let fleetNet = 0, founderNet = 0;
for (const id of ids) {
  const diff = diffOf(id);
  const sum = k => years.reduce((t, yr) => t + (yr[id].by[k] || 0), 0) / YEARS;
  const roster = years.reduce((t, yr) => t + yr[id].roster, 0) / YEARS;
  const grant = sum('board grant'), gate = sum('Gate and Merchandise');
  const won = sum('Dividend purse') + sum('The Eight\u2019s Purse');
  const pay = sum('retainers') + sum('purses');
  const entry = sum('Aleas entry');
  const net = years.reduce((t, yr) => t + (yr[id].close - yr[id].open), 0) / YEARS;
  const other = net - grant - gate - won - pay - entry;
  fleetNet += net; if (id === me) founderNet = net;
  console.log('  ' + id.padEnd(20) + String(diff).padStart(2) + String(roster.toFixed(0)).padStart(8) +
              String(Math.round(grant)).padStart(8) + String(Math.round(gate)).padStart(9) +
              String(Math.round(won)).padStart(9) + String(Math.round(pay)).padStart(9) +
              String(Math.round(entry)).padStart(8) + String(Math.round(other)).padStart(8) +
              String(nf(net)).padStart(9));
}
console.log('\n  the eight clear ' + nf((fleetNet - founderNet) / (ids.length - 1)) + ' an OA a year before the Divide is fought; the founded OA ' + nf(founderNet));

/* the two costs that were computed and never charged, and the one that was charged twice; if
   any goes wrong again this instrument is the thing that will notice */
const led = corps[me].account.ledger;
const hasRet = led.some(l => l.label === 'retainers'), hasPurse = led.some(l => l.label === 'purses');
const hasFee = led.some(l => /Aleas entry/.test(l.label || ''));
const paidTwice = led.some(l => l.label === 'Wages');
console.log('  retainers charged: ' + (hasRet ? 'yes' : 'NO') + ' \u00b7 purses charged: ' + (hasPurse ? 'yes' : 'NO') +
            ' \u00b7 entry fee charged: ' + (hasFee ? 'yes' : 'NO') +
            (paidTwice ? ' \u00b7 A FLAT WAGE LINE IS BACK BESIDE THE RETAINER: pay is charged twice' : ''));
if (!hasRet || !hasPurse || !hasFee || paidTwice) process.exit(1);
