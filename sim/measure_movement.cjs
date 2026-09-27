/* §COMMAND HOW NATURAL IS THE MOVEMENT? Tempered founded OAs, one fresh contest each. Per squad-day: how far away the
   place it is heading is, how often that changes, and whether an OA's squads are heading for places far apart; per
   trip, whether it got there. `COMMAND=oa|squad node sim/measure_movement.cjs [contests]` */
const D = __dirname + '/', fs = require('fs'), path = require('path');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js'), MAP = require(D + 'map.js');
const oa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const RIG = { nevlon_collective: 100, violets_enterprise: 95, knights_star: 80, new_line: 70, verdant_cradle: 55, mercy_concern: 40, alliance_house: 20, vantis_deepcore: 10 };
if (process.env.COMMAND) DIV.CONST.COMMAND = process.env.COMMAND;
const N = +(process.argv[2] || 16), DM = DIV.CONST.DAY_MARCH;
const R = { sd: 0, changes: 0, dists: [], trips: 0, reached: 0, split: 0, corpDays: 0, dead: 0, drop: 0, days: 0, noWinner: 0 };
for (let s = 0; s < N; s++) {
  let p = oa.map((o, i) => { const f = S.founderProfile(oa, 'F' + (i + 1), 'founder_' + (i + 1)); f.dials = JSON.parse(JSON.stringify(o.dials));
    f.engagement_lean = o.id === 'alliance_house' ? 'unyielding' : o.engagement_lean; f.no_negotiation = !!o.no_negotiation; f.rigidity = RIG[o.id]; return f; });
  const k = s % 8; p = p.slice(k).concat(p.slice(0, k));
  const rng = P.mulberry32(P.seedFrom('why' + s)); const c = S.openFleet(rng, p, {}); const st = S.beginSeason(rng, c, p, {});
  while (st.month <= 11) S.stepMonth(st); S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
  const d = S.prepareDivide(st); const prev = new Map();
  d.opts.onDay = (day, corps, planet, head) => { for (const cc of corps) { const live = cc.squads.filter(q => head(q).length); if (live.length < 2) continue; R.corpDays++;
    const aims = live.map(q => q.intent && q.intent.tx != null ? [q.intent.tx, q.intent.ty] : null).filter(Boolean);
    let far = 0; for (let i = 0; i < aims.length; i++) for (let j = i + 1; j < aims.length; j++) far = Math.max(far, MAP.dist(aims[i][0], aims[i][1], aims[j][0], aims[j][1]));
    if (far > DM * 3) R.split++;
    for (const q of live) { R.sd++; const it = q.intent, key = cc.id + q.sIdx, pr = prev.get(key);
      if (it && it.tx != null) R.dists.push(MAP.dist(q.x, q.y, it.tx, it.ty) / DM);
      const cur = it ? { t: it.type, x: it.tx, y: it.ty } : { t: 'none' };
      if (pr) { const moved = cur.x == null || pr.x == null || MAP.dist(cur.x, cur.y, pr.x, pr.y) > 0.03;
        if (moved || cur.t !== pr.t) { R.changes++; if (pr.x != null) { R.trips++; if (MAP.dist(q.x, q.y, pr.x, pr.y) < 0.03) R.reached++; } } }
      prev.set(key, cur); } } };
  const r = DIV.runDivide(d.rng, d.opts);
  R.dead += r.dead; R.drop += r.perCorp.reduce((t, x) => t + x.dropped, 0); R.days += r.days; if (!r.winner) R.noWinner++;
}
R.dists.sort((a, b) => a - b);
const pct = q => R.dists[Math.floor(R.dists.length * q)].toFixed(1);
console.log((DIV.CONST.COMMAND) + ' · ' + N + ' contests · fatality ' + (100 * R.dead / R.drop).toFixed(1) + '% · ' + (R.days / N).toFixed(1) + ' days · no winner ' + R.noWinner);
console.log('  heading changes per squad-day ' + (R.changes / R.sd).toFixed(2) + ' · trips that got there ' + (100 * R.reached / R.trips).toFixed(0) + '%');
console.log('  distance to where it is heading (days of march): median ' + pct(0.5) + ', 90th percentile ' + pct(0.9) + ' · more than 3 days ' + (100 * R.dists.filter(x => x > 3).length / R.dists.length).toFixed(0) + '%');
console.log('  OA-days with its squads heading for places 3+ days apart ' + (100 * R.split / R.corpDays).toFixed(0) + '%');
