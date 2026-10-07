/* §PRICING (ruled: a tier price, moved by what the gun does in its role) WHAT EVERY GUN IS WORTH IN ITS ROLE, measured in
 * the grid. A balanced squad of six — two assault rifles, a marksman, a machine gun, an SMG and a shotgun, all tier 3 —
 * carries the gun in the slot its kind fills, against a field of mixed squads (the balanced squad itself among them),
 * over every terrain and opening, from both sides. What it is worth is what that squad takes out against what it loses:
 * `worth.role`, written onto the gun with a fingerprint of the stats it was measured on. The price follows it (items.js
 * formulaCost) and so does the quartermaster's choice. A gun whose stats move is re-measured here; the suite says which.
 *
 *   node roleworth.cjs              every lethal primary, written back
 *   node roleworth.cjs 10 a,b       a quick look at a few, nothing written
 *   node roleworth.cjs 10 a,b write re-measure a few and write them back
 */
const fs = require('fs');
const D = __dirname + '/';
const P = require(D + 'prng.js'), T = require(D + 'tactical.js'), C = require(D + 'combat.js'), R = require(D + 'roster.js'), ITEMS = require(D + 'items.js');
const N = +(process.argv[2] || 10);
const only = process.argv[3] ? process.argv[3].split(',') : null;
const write = !only || process.argv[4] === 'write';
const REF = ITEMS.ROLE_REFERENCE, SLOT = ITEMS.ROLE_SLOT;
const FIELD = [REF,
  ['itm_vanguard_rifle', 'itm_vanguard_rifle', 'itm_machine_gun', 'itm_marksman_rifle', 'itm_drum_shotgun', 'itm_drum_shotgun'],
  ['itm_marksman_rifle', 'itm_glint_rifle', 'itm_machine_gun', 'itm_machine_gun', 'itm_gyrojet', 'itm_gyrojet'],
  ['itm_marksman_rifle', 'itm_marksman_rifle', 'itm_vanguard_rifle', 'itm_vanguard_rifle', 'itm_whipcord_smg', 'itm_whipcord_smg']];
const TERRAINS = ['open_plain', 'broken_ground', 'urban_ruin', 'forest'];
function side(seed, kit, tag) {
  const rng = P.mulberry32(P.seedFrom('rw' + seed));
  const sq = R.generateSquad(rng, 6, { corpId: tag, poolMix: [['nattie', 1]] }).bodies.filter(f => !f.mirror_of).slice(0, 6);
  sq.forEach((f, i) => { f.status = 'active'; f.condition = f.condition || { health: 100, fatigue: 0, morale: 60, injuries: [], stress: 0 };
    ITEMS.equip(f, { primary: kit[i], armor: 'itm_plate_carrier', sidearm: null, mods: [], consumables: [] }); });
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard', hasMedkit: true,
           units: sq.map((f, i) => C.makeCombatant(f, { traitIndex: R.traitById, isCaptain: i === 0, day: 1 })) };
}
const out = u => u.dead + u.down + u.stable + (u.captured || 0);   /* §STUN a man taken is a man out */
function measure(kit) {
  let took = 0, lost = 0, F = 0;
  for (let ti = 0; ti < TERRAINS.length; ti++) for (let b = 0; b < 3; b++) for (const opp of FIELD) for (let k = 1; k <= N; k++) for (const flip of [0, 1]) {
    const X = side(k * 7 + ti, kit, 'X'), Y = side(k * 7 + ti + 500, opp, 'Y');
    const r = T.resolve(P.mulberry32(k * 31 + b * 7 + flip + ti * 1009), flip ? Y : X, flip ? X : Y, { terrain: TERRAINS[ti], openingBand: b, prep: [0.5, 0.5] });
    took += out(r.casualties.Y); lost += out(r.casualties.X); F++;
  }
  /* a quarter of a body each way a fight, so a squad that loses nobody is not worth infinity */
  return Math.round(((took + F * 0.25) / (lost + F * 0.25)) * 1000) / 1000;
}
const path = D + '../data/items.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const guns = data.items.filter(it => it.slot === 'primary' && SLOT[it.type] != null && (!only || only.indexOf(it.id) >= 0));
for (const it of guns) {
  const kit = REF.slice(); kit[SLOT[it.type]] = it.id;
  const role = measure(kit);
  console.log(it.id.padEnd(28) + ' tier ' + it.tier + '  ' + String(it.cost).padStart(6) + '  worth ' + role.toFixed(3));
  if (write) it.worth = { role, of: ITEMS.statPrint(it) };
}
if (write) { fs.writeFileSync(path, JSON.stringify(data, null, 1) + '\n'); console.log('written: ' + guns.length + ' guns'); }
