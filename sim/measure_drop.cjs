/* THE DROP'S BASELINE: one Divide per seed, grouped landings against dispersed ones, at a
   radius and a wall hold — engagements in the first three days and in all, deaths, the end
   day, banners standing. `node measure_drop.cjs <seed> <mode grouped|spread> <radius> <hold>` */
const fs = require('fs');
const P = require('./prng.js'), S = require('./season.js'), D = require('./divide.js'), M = require('./map.js');
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const seed = process.argv[2] || '1', mode = process.argv[3] || 'grouped', radius = +(process.argv[4] || M.CONST.PLANET_RADIUS), hold = +(process.argv[5] || 0);
const rng = P.mulberry32(P.seedFrom('drop-' + seed));
const corps = S.openFleet(rng, oa, {});
const st = S.beginSeason(rng, corps, oa, {});
while (st.month <= 11) S.stepMonth(st);
S.closeSeasonToDrop(st);
const d = S.prepareDivide(st);
const arch = st.planet.archetype;
d.opts.groundTruth = M.generatePlanet(P.mulberry32(P.seedFrom('drop-planet-' + seed)), { archetype: arch, radius, wallHold: hold });
if (mode === 'spread') {
  /* a dumb strict draft: lowest standing first, three picks each, spread evenly round the ring */
  const ids = st.ids.slice();
  const slots = []; for (let i = 0; i < 24; i++) slots.push(i);
  const picks = {}; let k = 0;
  const shuffled = slots.slice().sort(() => rng() - 0.5);
  for (let round = 0; round < 3; round++) for (const id of ids) { (picks[id] = picks[id] || []).push(shuffled[k++]); }
  d.opts.dropSlots = picks; d.opts.slotCount = 24;
}
const res = D.runDivide(d.rng, d.opts);
const byWeek = res.engagementsByWeek || [];
let dead = 0; for (const f of res.fallen || []) if (f.how === 'wiped') dead++;
const casualties = (res.fallenBodies != null) ? res.fallenBodies : Object.values(res.settlement && res.settlement.take || {}).length;
let bodiesDead = 0; for (const id of st.ids) bodiesDead += corps[id].roster.filter(f => f.status === 'dead').length;
console.log(JSON.stringify({ seed, mode, radius, hold, fightsWeek1: byWeek[0] || 0, fights: res.engagements, days: res.days, deaths: res.dead, injured: res.injured, standing: (res.fallen || []).filter(f => f.how === 'standing').length, wiped: dead, joins: res.joins || 0 }));
