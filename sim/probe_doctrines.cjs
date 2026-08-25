/* W-T6 — "every corp is legible and none is free to beat".
 *
 * Never measured, on either resolver. The eight doctrines each plan a real force from the live
 * catalog; this runs those forces against each other and asks two things the target asks:
 * is each corp identifiably ITSELF, and is any of them free to beat? */
const P = require('./prng.js');
const C = require('./combat.js');
const T = require('./tactical.js');
const ITEMS = require('./items.js');
const ROSTER = require('./roster.js');
const fs = require('fs');
const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;

const TRIALS = parseInt(process.argv[2] || '10', 10);
const GROUNDS = ['open_basin', 'broken_ground', 'ruins', 'forest', 'entrenched'];
const PREP = [[0.73, 0.73], [0.87, 0.48], [0.48, 0.87], [0.95, 0.20]];

/** the eight doctrine-planned forces, as the game actually builds them */
/* An OA's id is not its doctrine's id — `nevlon_collective` plans against `nevlon`. Matching
   them by longest shared prefix rather than assuming, and reporting anything unmatched instead
   of silently planning nothing, because a probe that quietly measures an empty force is how a
   target gets certified against no data at all. */
const DOCS = ITEMS.doctrines.map(d => d.id);
const plans = {};
for (const oa of OA) {
  const doc = DOCS.find(d => oa.id === d || oa.id.indexOf(d) === 0 || d.indexOf(oa.id) === 0);
  if (!doc) { console.log('!! no doctrine for ' + oa.id); continue; }
  const plan = ITEMS.planForce(doc, 8, { season: 1 });
  if (!plan || !plan.bodies || !plan.bodies.length) { console.log('!! empty plan for ' + doc); continue; }
  plans[oa.id] = { name: oa.name || oa.id, doc: doc, plan: plan };
}

function squadFor(id, seed) {
  const bodies = ROSTER.generateSquad(P.mulberry32(P.seedFrom(seed)), 8, { corpId: id }).bodies;
  const picks = plans[id].plan.bodies;
  bodies.forEach((b, i) => {
    const L = (picks[i % picks.length] || {}).loadout || {};
    ITEMS.equip(b, { primary: L.primary || 'itm_carbine', armor: L.armor || 'itm_plate_carrier',
                     sidearm: L.sidearm || 'itm_service_pistol', consumables: L.consumables || [] });
  });
  let cap = bodies[0];
  for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
  return bodies.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById,
                                              isCaptain: f.id === cap.id, day: 12 }));
}
const side = (t, u) => ({ tag: t, corpId: t, policy: 'standard', policyName: 'standard',
                          hasMedkit: true, units: u });

/* ---- 1. is each corp identifiably itself? ---- */
console.log('\nWHAT EACH CORP ACTUALLY FIELDS');
console.log('-'.repeat(78));
const ids = Object.keys(plans);
for (const id of ids) {
  const picks = plans[id].plan.bodies;
  const guns = {}, bands = { long: 0, medium: 0, short: 0 };
  for (const B of picks) {
    const it = ITEMS.catalog.find(i => i.id === (B.loadout || {}).primary);
    if (!it) continue;
    guns[it.name] = (guns[it.name] || 0) + 1;
    bands[it.effects.range] = (bands[it.effects.range] || 0) + 1;
  }
  const spread = Object.keys(guns).length;
  console.log(plans[id].name.slice(0, 22).padEnd(24) +
              ('L' + bands.long + ' M' + bands.medium + ' S' + bands.short).padEnd(11) +
              spread + ' distinct  ' +
              Object.keys(guns).map(g => g + '\u00d7' + guns[g]).join(', ').slice(0, 40));
}

/* ---- 2. is any of them free to beat? ---- */
function duel(a, b, base) {
  let ca = 0, cb = 0, n = 0;
  for (let t = 0; t < TRIALS; t++) for (const g of GROUNDS) for (const ob of [0, 1, 2]) {
    for (const sw of [false, true]) {
      const pp = PREP[(t + GROUNDS.indexOf(g)) % PREP.length];
      /* The roster seed follows the CORP, not the side. It followed the side first, so every
         corp drew the same "first-named" fighter pool whenever it was the outer loop's `a` —
         and since the outer loop names each corp in turn, every corp got that pool against
         everybody. The averages summed to +2.07 across a round robin that must sum to zero,
         which is how the error announced itself. A corp's people are a property of the corp. */
      const A = side('A', squadFor(sw ? b : a, base + t + (sw ? b : a)));
      const B = side('B', squadFor(sw ? a : b, base + t + (sw ? a : b)));
      const r = T.resolve(P.mulberry32(P.seedFrom('doc' + t + g + ob)), A, B,
                          { terrain: g, openingBand: ob, prep: sw ? [pp[1], pp[0]] : pp, log: false });
      const c = x => (x.dead || 0) + (x.down || 0);
      ca += sw ? c(r.casualties.B) : c(r.casualties.A);
      cb += sw ? c(r.casualties.A) : c(r.casualties.B);
      n++;
    }
  }
  return (cb - ca) / n;
}

console.log('\nEACH CORP AGAINST THE FLEET  (' + TRIALS * GROUNDS.length * 3 * 2 + ' fights a matchup)');
console.log('-'.repeat(78));
const rows = [];
for (const a of ids) {
  let sum = 0, worst = 99, m = 0;
  for (const b of ids) {
    if (a === b) continue;
    const net = duel(a, b, 'dpop');
    sum += net; worst = Math.min(worst, net); m++;
  }
  rows.push({ name: plans[a].name, avg: sum / m, worst: worst });
}
rows.sort((x, y) => y.avg - x.avg);
for (const r of rows) {
  console.log(r.name.slice(0, 24).padEnd(26) +
              'avg ' + (r.avg >= 0 ? '+' : '') + r.avg.toFixed(3) +
              '   worst matchup ' + (r.worst >= 0 ? '+' : '') + r.worst.toFixed(3));
}
console.log('-'.repeat(78));
console.log('spread best-to-worst: ' + (rows[0].avg - rows[rows.length - 1].avg).toFixed(3) +
            ' casualties a fight');
