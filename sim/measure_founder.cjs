/* THE FOUNDER'S YEARS, PLAYED THROUGH THE FIGHTS.
   `measure_economy.cjs` reads the year up to the moment the drop is chosen. Everything that
   decides whether a year was good lands after it — the win bonus, ransoms both ways, death
   benefits, the kit bill — and can swing a year by tens of thousands either way. This founds a
   OA the way the desk does, plays it carefully (own people from the tryouts, prisoners at
   their sentence, a mercenary only to fill), and follows it through the Divide for several
   careers, so "tight early, more choices as he grows" is checked against what happens on the
   ground and not against the lock. `node sim/measure_founder.cjs [years] [careers]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const YEARS = +(process.argv[2] || 3), CAREERS = +(process.argv[3] || 6);
const alive = c => c.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
const nf = n => (n > 0 ? '+' : '') + Math.round(n);
const k = n => (n > 0 ? '+' : '') + Math.round(n / 1000) + 'k';

const rows = [];            /* one per career-year */
for (let cr = 1; cr <= CAREERS; cr++) {
  const rng = P.mulberry32(P.seedFrom('founder' + cr));
  const founder = S.founderProfile(oa, 'The Measured OA');
  const berth = oa.slice().sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0))[0].id;
  const profiles = oa.map(p => p.id === berth ? founder : p);
  const corps = S.openFleet(rng, profiles, {});
  const me = founder.id, c = corps[me];
  const careful = st => {
    for (const f of (S.lotFor(st, me) || [])) {
      const n = alive(c).length;
      if (f.contractKind === 'nattie') { if (n < 24) S.placeBid(st, me, f.id, f.ask || 1); }
      else if (f.contractKind === 'mercenary') {
        st.bids.mercs[me] = st.bids.mercs[me] || {};
        if (n < 22) S.placeBid(st, me, f.id, f.ask); else st.bids.mercs[me][f.id] = 0;
      }
    }
  };
  for (let y = 1; y <= YEARS; y++) {
    const n0 = c.account.ledger.length, open = c.account.treasury;
    const st = S.beginSeason(P.mulberry32(P.seedFrom('founder' + cr + 'y' + y)), corps, profiles, { human: me });
    while (st.month <= 11) { careful(st); S.stepMonth(st); }
    const rec = S.closeSeason(st);
    const by = {};
    for (const l of c.account.ledger.slice(n0)) by[l.label || l.kind] = (by[l.label || l.kind] || 0) + l.amount;
    const last = (c.rep && c.rep.history && c.rep.history[c.rep.history.length - 1]) || {};
    const dead = (c.roster.filter(f => f.status === 'dead') || []).length;
    rows.push({ cr, y, open, close: c.account.treasury, net: c.account.treasury - open, by,
                roster: alive(c).length, won: !!last.won, dead });
  }
}

const sum = (rs, key) => rs.reduce((t, r) => t + (r.by[key] || 0), 0) / (rs.length || 1);
const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log('\nTHE FOUNDED OA THROUGH THE DIVIDE \u00b7 ' + CAREERS + ' careers \u00b7 ' + YEARS + ' years each');
for (let y = 1; y <= YEARS; y++) {
  const rs = rows.filter(r => r.y === y);
  const nets = rs.map(r => r.net).sort((a, b) => a - b);
  const wins = rs.filter(r => r.won).length;
  console.log('\n  YEAR ' + y + '  net: mean ' + k(mean(nets)) + '  worst ' + k(nets[0]) + '  best ' + k(nets[nets.length - 1]) +
              '  \u00b7 won ' + wins + '/' + rs.length + '  \u00b7 roster after ' + mean(rs.map(r => r.roster)).toFixed(0) +
              '  \u00b7 treasury after: ' + rs.map(r => Math.round(r.close / 1000) + 'k').join(' '));
  const keys = {}; rs.forEach(r => Object.keys(r.by).forEach(x => { keys[x] = 1; }));
  const lines = Object.keys(keys).map(x => [x, sum(rs, x)]).filter(([, v]) => Math.abs(v) >= 1500)
                      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  console.log('      ' + lines.map(([x, v]) => x + ' ' + k(v)).join(' \u00b7 '));
}
/* the lines that only land after the lock, so the gap between the two instruments is a number */
const after = ['Divide bonus (the OA takes the rights)', 'ransoms paid', 'ransoms received', 'Death benefits',
               'death benefits', 'procurement', 'Divide bonuses', 'winner bonuses'];
const post = mean(rows.map(r => after.reduce((t, x) => t + (r.by[x] || 0), 0)));
console.log('\n  what lands after the lock, a year on average: ' + k(post) +
            '   (the win bonus, ransoms, death benefits, the kit bill, the Divide bonuses)');
console.log('  careers ending above the opening bank: ' +
            rows.filter(r => r.y === YEARS && r.close > 210000).length + '/' + CAREERS);
