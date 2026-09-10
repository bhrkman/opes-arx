/* WHAT A FLEET ACTUALLY WALKS ONTO THE GROUND CARRYING.
   Balance measured on badly equipped squads is measured on a game nobody plays: every probe
   that built `generateSquad` bodies was reading fighters with no kit at all, who fall back to
   a default medium weapon and nothing else. This asks the question of a REAL built fleet —
   every house, every squad — and fails if anybody is short of the things a fighter is supposed
   to leave the ship with. `node measure_kit.cjs [--quiet]` */
const fs = require('fs');
const P = require('./prng.js'), D = require('./divide.js'), MAP = require('./map.js'),
      C = require('./combat.js'), R = require('./roster.js');
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const SEEDS = ['kit-a', 'kit-b', 'kit-c'];
let n = 0, prim = 0, armr = 0, side = 0, cons = 0, bare = 0, cellNoSide = 0;
const byHouse = {};
for (const seed of SEEDS) {
  const rng = P.mulberry32(P.seedFrom(seed));
  const planet = MAP.generatePlanet(rng, {});
  for (const p of oa) {
    const c = D.buildCorp(rng, p, 'standard', null, 0.5, null, planet, null, 1);
    const h = byHouse[p.id] || (byHouse[p.id] = { n: 0, side: 0, bare: 0 });
    for (const sq of (c.squads || [])) for (const f of (sq.bodies || [])) {
      n++; h.n++;
      const lo = f.loadout || {}, kit = lo.kit || {};
      if (lo.primary || kit.weapon) prim++;
      if (lo.armor || kit.armor) armr++;
      if (lo.sidearm || kit.sidearm) { side++; h.side++; }
      if ((lo.consumables || []).length) cons++;
      const u = C.makeCombatant(f, { traitIndex: R.traitById, day: 1 });
      if (!u.weapon || (u.weapon.power || 0) <= 0) { bare++; h.bare++; }
      /* a cell-fed primary with nothing to draw is a fighter whose fight ends when it runs dry */
      if (u.heatCap > 0 && !u.sidearm) cellNoSide++;
    }
  }
}
const pc = v => (v / n * 100).toFixed(0) + '%';
console.log(JSON.stringify({ hands: n, primary: pc(prim), armor: pc(armr), sidearm: pc(side),
                             consumable: pc(cons), unarmed: bare, cellFedWithNoSidearm: cellNoSide }));
for (const id in byHouse) {
  const h = byHouse[id];
  console.log('  ' + id.padEnd(20) + ' sidearm ' + (h.side / h.n * 100).toFixed(0) + '%' +
              (h.bare ? '   <-- ' + h.bare + ' walk on unable to hurt anybody' : ''));
}
const fails = [];
if (bare) fails.push(bare + ' hands deploy with nothing that can hurt anybody');
if (prim < n || armr < n) fails.push('somebody is short a primary or armour');
if (side / n < 0.7) fails.push('only ' + pc(side) + ' carry a sidearm');
if (cons / n < 0.6) fails.push('only ' + pc(cons) + ' carry a consumable');
if (fails.length) { console.log('\n  FAIL: ' + fails.join('; ')); process.exit(1); }
console.log('\n  the fleet leaves the ship properly equipped');
