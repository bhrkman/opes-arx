/* THE MACRO LAYER, AUDITED. The Divide is meant to read as a battle royale at the scale of a
   planet: a drop, a closing wall, a shrinking field, and squads that find each other. This
   measures whether the GEOMETRY can carry that — how much ground there is per squad, how far a
   squad can see and shoot compared with the size of the field, and how contact is spread across
   the contest — and states each against the genre it is imitating.
   `node sim/audit_macro.cjs [divides]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js'), MAP = require(D + 'map.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 3);
const C = DIV.CONST;

const rng0 = P.mulberry32(7);
const pl = MAP.generatePlanet(rng0, { season: 1 });
const R = pl.radius, W = R * 2, area = Math.PI * R * R;

/* how many squads actually drop */
let squads = 0, bodies = 0, byDay = {}, contactsAll = 0, days = 0, nearest = [], standing = {}, sides = {};
const sidesAt = {}, corpsAt = {};   /* §STAGE-0 the curve this migration is judged on */
const runs = [];                    /* §STAGE-7 each contest's heat, in its own length */
for (let seed = 1; seed <= N; seed++) {
  const rng = P.mulberry32(P.seedFrom('macro' + seed));
  const corps = S.openFleet(rng, oa, {});
  const st = S.beginSeason(rng, corps, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const thisRun = { heat: {}, last: 0 };
  runs.push(thisRun);
  const d = S.prepareDivide(st);
  d.opts.replay = true;
  if (process.env.INSTANT) d.opts.instantDeals = true;
  /* the generator only yields for a MANAGER — with no human OA the contest runs straight
     through and there are no windows to read the banners at. One of the eight stands in. */
  d.opts.human = st.ids[0];
  /* §STAGE-0 SIDES ARE BANNERS, NOT CORPS. A corp that has joined another is not a side of its
     own — it is a squad under somebody else's flag, and counting it separately hides exactly
     the thing this measures. Read at each comms window off the live corps, where `joinedTo`
     lives; the recording does not carry it. */
    const gen = DIV.divideCore(d.rng, d.opts);
    let step = gen.next();
    while (!step.done) {
      const w = step.value;
      const rootOf = (c) => { let r = c, g = 0;
        while (r.joinedTo && g++ < 8) { r = (w.corps || []).filter(x => x.id === r.joinedTo)[0] || r; }
        return r.id; };
      const alive = (w.corps || []).filter(c => (c.squads || []).some(q => (q.bodies || []).some(b => b.status === 'active')));
      const banners = new Set(alive.map(rootOf));
      (sidesAt[w.day] = sidesAt[w.day] || []).push(banners.size);
      (corpsAt[w.day] = corpsAt[w.day] || []).push(alive.length);
      step = gen.next({});
    }
    const res = step.value || {};
  const rec = (res.replay && res.replay.days) || [];
  if (seed === 1) {
    const d0 = rec[0];
    if (d0) {
      squads = d0.sq.filter(q => q.n).length;
      bodies = d0.sq.reduce((t, q) => t + (q.n || 0), 0);
    }
  }
  rec.forEach(day => {
    days++;
    const f = (day.ev || []).filter(e => e.t === 'fight').length;
    byDay[day.d] = (byDay[day.d] || 0) + f;
    contactsAll += f;
    /* §STAGE-7 HOW HOT THE DAY IS, not how many fights it holds. There are 26 squads on day 1
       and a handful at the end, so a raw count falls even when the survivors are fighting
       harder than anyone did at the drop. What a battle royale's last third feels like is
       contacts PER SQUAD STILL STANDING. */
    const liveN = day.sq.filter(q => q.n && !q.ghost).length;
    /* §INSTRUMENT EACH CONTEST IS MEASURED IN ITS OWN LENGTH. The thirds were cut off the
       longest day ANY run reached, so a contest that ended on day 22 beside one that ran to 36
       reported an empty "last third" — the measure said the end was quiet when the end had
       simply already happened. A contest's heat is banded against its OWN last day. */
    /* the recording runs on past the contest, so the last day is the last one anybody was
       STANDING on, not the last one written down */
    if (!liveN) return;
    (thisRun.heat[day.d] = thisRun.heat[day.d] || []).push(f / liveN);
    thisRun.last = Math.max(thisRun.last, day.d);
    /* nearest foreign squad, for every squad standing */
    const live = day.sq.filter(q => q.n && !q.ghost);
    /* who is still on the ground late, and how many SIDES they belong to: a contest the table
       has already settled has nobody left to fight */
    (standing[day.d] = standing[day.d] || []).push(live.length);
    (sides[day.d] = sides[day.d] || []).push(new Set(live.map(q => q.c)).size);
    live.forEach(a => {
      let best = 9;
      live.forEach(b => { if (b === a || b.c === a.c) return;
        const dd = Math.hypot(a.x - b.x, a.y - b.y); if (dd < best) best = dd; });
      if (best < 9) nearest.push(best);
    });
  });
}
const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const med = a => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)] || 0; };
const perSquad = area / Math.max(1, squads);
const spacing = 2 * Math.sqrt(perSquad / Math.PI);

console.log('\nTHE MACRO LAYER \u00b7 ' + N + ' Divides\n');
console.log('  THE FIELD');
console.log('    across            ' + W.toFixed(3) + ' map units \u00b7 ' + (W / C.DAY_MARCH).toFixed(1) + ' days\u2019 march');
console.log('    squads at the drop ' + squads + ' (' + bodies + ' bodies)');
console.log('    ground per squad   ' + perSquad.toFixed(4) + ' \u00b7 they would sit ' +
            spacing.toFixed(3) + ' apart if spread evenly (' + (spacing / C.DAY_MARCH).toFixed(1) + ' days\u2019 march)');
console.log('\n  WHAT A SQUAD REACHES, as a share of the field');
const shows = [['a day\u2019s march', C.DAY_MARCH], ['sight (watching)', C.SEE_RANGE],
               ['noticing', C.SIGHT_RANGE], ['contact', C.ENGAGE_RANGE]];
shows.forEach(([lab, v]) => console.log('    ' + lab.padEnd(18) + (v).toFixed(3) + '  = ' +
  (v / W * 100).toFixed(1) + '% of the width  \u00b7 ' + (Math.PI * v * v / area * 100).toFixed(1) + '% of the ground'));
console.log('\n  HOW CLOSE THEY ACTUALLY ARE');
console.log('    nearest foreign squad: median ' + med(nearest).toFixed(3) + ' \u00b7 mean ' + mean(nearest).toFixed(3));
console.log('    within contact range   ' + (nearest.filter(d2 => d2 <= C.ENGAGE_RANGE).length / nearest.length * 100).toFixed(0) + '% of squad-days');
console.log('    within a day\u2019s march   ' + (nearest.filter(d2 => d2 <= C.DAY_MARCH).length / nearest.length * 100).toFixed(0) + '% of squad-days');
console.log('\n  THE ARC \u00b7 contacts per day, averaged');
const ks = Object.keys(byDay).map(Number).sort((a, b) => a - b);
let line = '';
ks.forEach(k => { line += String(k).padStart(3) + ':' + (byDay[k] / N).toFixed(1).padStart(5); if (k % 6 === 0) { console.log('   ' + line); line = ''; } });
if (line) console.log('   ' + line);
/* §STAGE-0 THE CURVE THIS MIGRATION IS JUDGED ON. A battle royale's last third is loud because
   everyone left is an enemy; the join lets the table merge the field into one or two sides while
   the wall is still closing, and this is the number that says so. Recorded now as the baseline,
   before a line of the withdrawal work is written. */
console.log('\n  SIDES STANDING, at each comms window  (a banner is one side, whatever it absorbed)');
const wdays = Object.keys(sidesAt).map(Number).sort((a, b) => a - b);
let curve = [];
wdays.forEach(k => {
  const sd = mean(sidesAt[k]), cp = mean(corpsAt[k]);
  curve.push({ day: k, sides: +sd.toFixed(2), corps: +cp.toFixed(2) });
  console.log('    day ' + String(k).padStart(2) + '   OAs alive ' + cp.toFixed(1).padStart(4) +
              '   sides ' + sd.toFixed(2).padStart(5) + (cp > sd ? '   \u2190 ' + (cp - sd).toFixed(1) + ' under somebody else\u2019s flag' : ''));
});
const late = curve.filter(c => c.day >= 13);
const lateSides = late.length ? mean(late.map(c => c.sides)) : 0;
console.log('\n    from day 13 on, the field averages ' + lateSides.toFixed(2) + ' sides');
console.log('    BASELINE for the withdrawal migration (docs/WITHDRAWAL_MIGRATION.md):');
console.log('      the pass condition at Stage 7 is that this rises \u2014 the last third of a');
console.log('      contest should be fought between enemies, not inside one banner.');
if (process.env.MACRO_JSON) {
  fs.writeFileSync(process.env.MACRO_JSON, JSON.stringify({ curve: curve, lateSides: lateSides }, null, 1));
  console.log('      written to ' + process.env.MACRO_JSON);
}
console.log('\n  HOW HOT THE DAY IS \u00b7 contacts per squad still standing');
/* each contest banded in ITS OWN length, then the bands averaged across contests */
const bands = [[], [], []];
runs.forEach(r => {
  if (!r.last) return;
  const cut = r.last / 3;
  const at = i => { const v = Object.keys(r.heat).map(Number)
    .filter(k => k > cut * i && k <= cut * (i + 1)).map(k => mean(r.heat[k]));
    return v.length ? mean(v) : null; };
  for (let i = 0; i < 3; i++) { const v = at(i); if (v != null) bands[i].push(v); }
});
const b = i => bands[i].length ? mean(bands[i]) : 0;
const lens = runs.map(r => r.last).filter(Boolean);
console.log('    contests ran ' + Math.min.apply(null, lens) + '\u2013' + Math.max.apply(null, lens) + ' days');
console.log('    first third  ' + b(0).toFixed(3));
console.log('    middle       ' + b(1).toFixed(3));
console.log('    LAST THIRD   ' + b(2).toFixed(3) + (b(2) > b(0) ? '   \u2190 hotter than the drop' : ''));
console.log('\n    contacts per contest ' + (contactsAll / N).toFixed(1));
