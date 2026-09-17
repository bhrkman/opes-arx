/* WHAT THE MAP ACTUALLY DOES, DAY BY DAY.
   A manager skipping days and watching his squads sees them jump, vanish and die without a
   fight. How much of that is the engine and how much is the page? This reads the same
   recording the page replays from and checks the engine's side of it: how far each squad moved
   in a day against the day's march budget (a jump is a move past what legs allow), whether a
   squad that went down had a fight recorded at its position that day (a death without one is
   the engine's to explain), whether a squad ever leaves the record (a vanishing that is not a
   death), and where squads sit when not moving. `node sim/measure_map.cjs [divides]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js'), DIV = require('./divide.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const N = +(process.argv[2] || 3);
const MARCH = DIV.CONST.DAY_MARCH;

const out = { days: 0, squadDays: 0, moves: [], overBudget: 0, teleports: 0, downNoFight: 0, downWithFight: 0, vanished: 0,
              reappeared: 0, still: 0, downAtOrigin: 0, whys: {}, fightsPerDay: [], farFight: 0, examples: [] };
for (let seed = 1; seed <= N; seed++) {
  const rng = P.mulberry32(P.seedFrom('map' + seed));
  const corps = S.openFleet(rng, oa, {});
  const st = S.beginSeason(rng, corps, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  d.opts.replay = true;
  const res = DIV.runDivide(d.rng, d.opts);
  const REC = res.replay || res.rec || res.REC;
  if (!REC || !REC.days) { console.log('no recording on the result; keys:', Object.keys(res).join(',')); process.exit(1); }
  const prev = {};                     /* key c:s -> last record */
  for (const day of REC.days) {
    out.days++;
    const seen = {};
    const fights = (day.ev || []).filter(e => e.t === 'fight');
    out.fightsPerDay.push(fights.length);
    for (const q of day.sq) {
      const key = q.c + ':' + q.s; seen[key] = true; out.squadDays++;
      const p = prev[key];
      out.whys[q.w] = (out.whys[q.w] || 0) + 1;
      if (p) {
        if (p.gone) { out.reappeared++; }
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (q.n && p.n) {
          out.moves.push(dist / MARCH);
          if (dist > MARCH * 1.6) { out.overBudget++; (out.overWhy = out.overWhy || {})[q.w + '<' + p.w] = (out.overWhy[q.w + '<' + p.w] || 0) + 1; }
          if (dist > MARCH * 3) { out.teleports++; if (out.examples.length < 5) out.examples.push({ seed, day: day.d, corp: REC.corps[q.c].id, squad: q.s, from: [p.x, p.y], to: [q.x, q.y], marches: +(dist / MARCH).toFixed(1), why: q.w, prevWhy: p.w }); }
          if (dist < MARCH * 0.05) out.still++;
        }
        if (p.n && !q.n) {
          /* went down today: was there a fight near where it stood — or the wall, or a hazard? */
          const near = fights.some(f => Math.hypot(f.x - q.x, f.y - q.y) < MARCH * 2.6);
          const walls = (day.ev || []).filter(e => e.t === 'wall' && e.c === REC.corps[q.c].id && Math.hypot(e.x - q.x, e.y - q.y) < MARCH * 0.5);
          const haz = (day.ev || []).filter(e => e.t === 'hazard' && Math.hypot(e.x - q.x, e.y - q.y) < MARCH * 1.5);
          const outside = day.z ? Math.hypot(q.x - day.z.cx, q.y - day.z.cy) > day.z.r * 1.001 : false;
          const reforms = (day.ev || []).filter(e => e.t === 'reform' && e.c === REC.corps[q.c].id && Math.hypot(e.x - q.x, e.y - q.y) < MARCH * 0.5);
          if (near) out.downWithFight++;
          else if (reforms.length) out.downReform = (out.downReform || 0) + 1;
          else if (walls.length) out.downWall = (out.downWall || 0) + 1;
          else if (haz.length) out.downHazard = (out.downHazard || 0) + 1;
          else { out.downNoFight++; if (out.examples.length < 10) out.examples.push({ seed, day: day.d, corp: REC.corps[q.c].id, squad: q.s, downAt: [q.x, q.y], why: p.w, outsideZone: outside, fightsToday: fights.length, nearest: fights.length ? +Math.min.apply(null, fights.map(f => Math.hypot(f.x - q.x, f.y - q.y) / MARCH)).toFixed(1) : null, evKinds: [...new Set((day.ev || []).map(e => e.t))].join(',') }); }
        }
      }
      prev[key] = Object.assign({}, q, { gone: false });
    }
    for (const key in prev) if (!seen[key] && !prev[key].gone) { prev[key].gone = true; out.vanished++; }
  }
}
const q = (a, p) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(p * v.length)] : 0; };
console.log('\nTHE MAP, DAY BY DAY \u00b7 ' + N + ' Divides \u00b7 ' + out.days + ' days \u00b7 ' + out.squadDays + ' squad-days');
console.log('  a day\u2019s move, in marches: p50 ' + q(out.moves, .5).toFixed(2) + '  p90 ' + q(out.moves, .9).toFixed(2) + '  p99 ' + q(out.moves, .99).toFixed(2) + '  max ' + q(out.moves, 1 - 1e-9).toFixed(2));
console.log('  moves past 1.6 marches (over any budget): ' + out.overBudget + '   past 3 marches (a jump): ' + out.teleports);
console.log('  over budget, by why (today<yesterday): ' + JSON.stringify(out.overWhy || {}));
console.log('  squads standing still (< 5% of a march): ' + out.still + ' of ' + out.moves.length);
console.log('  squads that went down with a fight recorded beside them: ' + out.downWithFight + '   broken up into other squads (a reform, not a death): ' + (out.downReform || 0) + '   to the wall: ' + (out.downWall || 0) + '   to a hazard: ' + (out.downHazard || 0) + '   with none of those: ' + out.downNoFight);
console.log('  squads that left the record without going down: ' + out.vanished + '   reappeared: ' + out.reappeared);
console.log('  why a squad moved, by squad-day: ' + JSON.stringify(out.whys));
console.log('  fights recorded per day: mean ' + (out.fightsPerDay.reduce((a, b) => a + b, 0) / out.fightsPerDay.length).toFixed(2));
console.log('\n  examples:'); out.examples.forEach(e => console.log('   ', JSON.stringify(e)));
