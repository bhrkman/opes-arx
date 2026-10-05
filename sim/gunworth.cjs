/* §QUARTERMASTER (ruled: a gun is chosen for what it does) WHAT EVERY GUN DOES IN A FIGHT, measured in the grid.
 *
 * Each primary is fielded by five identical bodies in identical armour against five more carrying one reference
 * rifle, from both sides in turn, over the terrains and opening distances in rotation. What it is worth is how many
 * of them it takes out of a fight against how many it loses: `edge`, written onto the gun in data/items.json with a
 * fingerprint of the stats it was measured on. The suite fails a gun whose stats have moved since; run this again.
 *
 *   node gunworth.cjs            all primaries, the shipping sample
 *   node gunworth.cjs 40 a,b     a quick look at a few, nothing written
 */
const fs = require('fs');
const D = __dirname + '/';
const P = require(D + 'prng.js'), T = require(D + 'tactical.js'), C = require(D + 'combat.js'), R = require(D + 'roster.js'), ITEMS = require(D + 'items.js');

const REF = 'itm_vanguard_rifle', ARMOUR = 'itm_plate_carrier', SIZE = 5;
const TERRAINS = ['broken_ground', 'open_plain', 'urban_ruin', 'forest'];
const N = +(process.argv[2] || 150);
const only = process.argv[3] ? process.argv[3].split(',') : null;

function side(seed, gun, tag) {
  const rng = P.mulberry32(P.seedFrom('gunworth' + seed));
  const bodies = R.generateSquad(rng, SIZE, { corpId: tag, poolMix: [['nattie', 1]] }).bodies.filter(f => !f.mirror_of).slice(0, SIZE);
  for (const f of bodies) {
    f.status = 'active';
    f.condition = f.condition || { health: 100, fatigue: 0, morale: 60, injuries: [], stress: 0 };
    ITEMS.equip(f, { primary: gun, armor: ARMOUR, sidearm: null, mods: [], consumables: [] });
  }
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard', hasMedkit: true,
           units: bodies.map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 })) };
}
const out = u => u.dead + u.down + u.stable;
function measure(gun) {
  let took = 0, lost = 0;
  for (let s = 1; s <= N; s++) for (const flip of [0, 1]) {
    const G = side(s, gun, 'G'), F = side(s, REF, 'F');
    const r = T.resolve(P.mulberry32(s * 13 + flip), flip ? F : G, flip ? G : F,
                        { terrain: TERRAINS[s % TERRAINS.length], openingBand: s % 3, prep: [0.5, 0.5] });
    took += out(r.casualties.F); lost += out(r.casualties.G);
  }
  /* half a body each way, so a gun that never loses anyone is not worth infinity */
  return Math.round(((took + N) / (lost + N)) * 1000) / 1000;
}

const path = D + '../data/items.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const guns = data.items.filter(it => it.slot === 'primary' && (!only || only.indexOf(it.id) >= 0));
for (const it of guns) {
  const edge = measure(it.id);
  console.log(it.id.padEnd(28) + ' tier ' + it.tier + '  ' + String(it.cost).padStart(5) + '  edge ' + edge.toFixed(3));
  if (!only) it.worth = { edge, of: ITEMS.statPrint(it) };
}
if (!only) { fs.writeFileSync(path, JSON.stringify(data, null, 1) + '\n'); console.log('written: ' + guns.length + ' guns'); }
