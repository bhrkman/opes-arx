/* §SECRECY THE SEASON, SEALED PER SEAT. Through a season with two human seats, each seat's view of the season is plain
   data (it survives JSON unchanged), a rival is a shell (no roster, treasury, armoury, plans or intel), and a rival's
   fighter appears only where this seat legitimately knows them — its own intel, a letter offering them, or an open lot.
   `node harness/probe_season_secrecy.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const rng = P.mulberry32(P.seedFrom('ssecret')); const c = S.openFleet(rng, oa, {}); const A = oa[1].id, B = oa[5].id;
const st = S.beginSeason(rng, c, oa, { humans: [A, B] });
const fails = []; let checked = 0;
const LEGIT = /^view\.(you\._intel|letters|lot)\b/;
while (st.month <= S.CONST.PREP_MONTHS) {
  for (const seat of [A, B]) {
    const v = S.seatView(st, seat); checked++;
    if (JSON.stringify(v) !== JSON.stringify(JSON.parse(JSON.stringify(v)))) fails.push('month ' + st.month + ': not plain data');
    for (const r of v.fleet) for (const k of ['roster', 'account', 'armoury', '_seat', '_intel', '_lock', 'rep'])
      if (r[k] !== undefined) fails.push('month ' + st.month + ': a rival shell carries ' + k);
    const rivalIds = new Set(); for (const id of st.ids) if (id !== seat) c[id].roster.forEach(f => rivalIds.add(f.id));
    (function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const val = o[k], p = path + '.' + k;
        if (typeof val === 'string' && rivalIds.has(val) && !LEGIT.test(p)) fails.push('month ' + st.month + ': ' + seat + ' holds a rival fighter at ' + p.replace(/\.\d+/g, '[]'));
        else if (val && typeof val === 'object') walk(val, p);
      }
    })(v, 'view');
  }
  S.submitMonth(st, A, {}); S.submitMonth(st, B, {}); S.advanceMonth(st);
}
const uniq = [...new Set(fails)];
console.log(uniq.length ? '  FAIL  ' + uniq.slice(0, 5).join(' | ') + (uniq.length > 5 ? ' … (' + uniq.length + ')' : '')
                        : '  ok    the season, sealed per seat: ' + checked + ' views over a season, plain data, rivals as shells, no rival fighter but what the seat knows');
process.exit(uniq.length ? 1 : 0);
