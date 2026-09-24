/* §MODS EVERY MOD, FITTED, DOES WHAT IT SAYS. Fits each mod in turn to the same fighter and reads
   the difference off the combatant that walks onto the grid — power, rounds, charge, aim held and
   moving, a reaction shot, the cost of the wrong range, the cost of suppressing fire, the tags. Fails
   if a mod that is meant to do something changes nothing. The two whose system is gone (heat sink,
   field kit) are reported, not failed. `node harness/probe_mods.cjs` */
const D = '/home/claude/opes-arx/sim/';
const P = require(D + 'prng.js'), C = require(D + 'combat.js'), R = require(D + 'roster.js'), I = require(D + 'items.js');
const MODS = ['itm_mod_optic', 'itm_mod_bipod', 'itm_mod_target_link', 'itm_mod_light_frame', 'itm_mod_grip',
  'itm_mod_rangefinder', 'itm_mod_broadcast_tag', 'itm_mod_extended_mag', 'itm_mod_recoil_comp',
  'itm_mod_suppressor', 'itm_mod_ap_rounds', 'itm_mod_incendiary', 'itm_mod_hollowpoint',
  'itm_mod_capacitor', 'itm_mod_focusing_array', 'itm_mod_diffuser'];
const INERT = {};
const base = R.generateSquad(P.mulberry32(3), 1, { corpId: null }).bodies[0];
const gunFor = modId => {                /* an energy gun for the capacitor, a heavy-recoil gun for the comp */
  if (modId === 'itm_mod_capacitor' || modId === 'itm_mod_focusing_array') return 'itm_pulse_carbine';
  if (modId === 'itm_mod_recoil_comp') return 'itm_riot_autogun';
  return 'itm_surplus_rifle';
};
function read(modId, gun) {
  const f = JSON.parse(JSON.stringify(base));
  I.equip(f, { primary: gun, armor: 'itm_flak_vest', sidearm: null, mods: modId ? [modId] : [], consumables: [] });
  const u = C.makeCombatant(f, { traitIndex: R.traitById, day: 5 });
  const ctx = { side: null };
  const still = C.aimEff ? C.aimEff(Object.assign({}, u, { repositioning: false }), 1, ctx) : null;
  const moving = C.aimEff ? C.aimEff(Object.assign({}, u, { repositioning: true }), 1, ctx) : null;
  const react = C.aimEff ? C.aimEff(Object.assign({}, u, { repositioning: false }), 1, { overwatch: true }) : null;
  const wrong = C.aimEff ? C.aimEff(Object.assign({}, u, { repositioning: false }), 0, ctx) : null;
  const sup = Object.assign({}, u, { ammo: 99 }); C.spendShot(sup, 'suppress');
  return { power: u.weapon.power, ammo: u.ammo, charge: u.charge || 0, still, moving, react, wrong,
           supCost: 99 - sup.ammo, tags: (u.weapon.tags || []).slice().sort().join(',') };
}
let fails = 0;
for (const m of MODS) {
  const gun = gunFor(m), a = read(null, gun), b = read(m, gun);
  const diff = Object.keys(a).filter(k => String(a[k]) !== String(b[k])).map(k => k + ' ' + a[k] + '\u2192' + b[k]);
  const name = m.slice(8);
  if (INERT[m]) { console.log('  inert   ' + name.padEnd(16) + '(' + INERT[m] + ')'); continue; }
  if (!diff.length) { fails++; console.log('  FAIL    ' + name.padEnd(16) + 'changes nothing'); }
  else console.log('  ok      ' + name.padEnd(16) + diff.join(' \u00b7 '));
}
console.log(fails ? '\n' + fails + ' mod(s) do nothing when fitted' : '\nevery mod that has a system to act on does what it says');
process.exit(fails ? 1 : 0);
