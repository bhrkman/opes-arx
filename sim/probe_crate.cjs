/* THE CRATE — is a sponsor's cache worth walking to?
 *
 * `divide.js` `openCrate` hands a squad ONE primary or armour piece at the crate's tier, to
 * whoever gains most by it, plus supplies. This asks what that is worth on the ground.
 *
 * It deliberately contains NO copy of the resolver's logic. It equips real catalog items
 * through `ITEMS.equip` and lets `tactical.js` resolve, so it cannot drift into measuring a
 * frozen mirror of code that has moved — which is why `approach_lab.html` was deleted.
 *
 * Follows COMBAT.md 0a: >=200 fights a matchup, both directions, two independent populations.
 * A number the two populations disagree about is not a number.
 *
 *   node probe_crate.cjs [trials]
 */
const P = require('./prng.js');
const C = require('./combat.js');
const T = require('./tactical.js');
const ITEMS = require('./items.js');
const ROSTER = require('./roster.js');

const GROUNDS = ['open_basin', 'broken_ground', 'ruins', 'forest', 'entrenched'];
const BANDS = [0, 1, 2];
const PREP = [[0.73, 0.73], [0.87, 0.48], [0.48, 0.87], [0.95, 0.20]];
const TRIALS = parseInt(process.argv[2] || '20', 10);

/* A squad armed the way a mid-table corp actually arms one: the corners of the shelf at the
   tiers a treasury reaches, not eight of the best gun in the game. */
const MIX = ['itm_carbine', 'itm_carbine', 'itm_surplus_rifle', 'itm_surplus_rifle',
             'itm_drum_shotgun', 'itm_battle_rifle', 'itm_machine_gun', 'itm_carbine'];
for (const id of MIX) {
  if (!ITEMS.byId(id)) { console.error('no item "' + id + '"'); process.exit(1); }
}

/** Every legal, non-exotic primary and armour piece at `tier` — the crate's own pool. */
function cratePool(tier) {
  return ITEMS.catalog.filter(i => (i.slot === 'primary' || i.slot === 'armor') &&
                                   i.legality === 'legal' && !i.exotic && i.tier === tier);
}
function exoticPool() {
  return ITEMS.catalog.filter(i => (i.slot === 'primary' || i.slot === 'armor') &&
                                   i.legality === 'legal' && !!i.exotic);
}

/**
 * `pick` null = the squad as mustered. Otherwise the crate's piece goes to whoever gains most
 * by it, which is the rule `openCrate` uses — lowest tier currently in that slot.
 */
function squad(seed, pick) {
  const bodies = ROSTER.generateSquad(P.mulberry32(P.seedFrom(seed)), 8,
                                      { corpId: 'alliance_house' }).bodies;
  bodies.forEach((b, i) => {
    ITEMS.equip(b, { primary: MIX[i], armor: 'itm_plate_carrier',
                     sidearm: 'itm_service_pistol', consumables: [] });
  });
  if (pick) {
    const slot = pick.slot === 'armor' ? 'armor' : 'primary';
    let best = null, bestTier = 99;
    for (const b of bodies) {
      const cur = ITEMS.byId(b.loadout[slot]);
      const t = cur ? cur.tier : 0;
      if (t < bestTier) { bestTier = t; best = b; }
    }
    if (best && pick.tier > bestTier) {
      const lo = best.loadout;
      ITEMS.equip(best, { primary: slot === 'primary' ? pick.id : lo.primary,
                          armor: slot === 'armor' ? pick.id : lo.armor,
                          mods: lo.mods, sidearm: lo.sidearm, consumables: lo.consumables });
    }
  }
  let cap = bodies[0];
  for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
  return bodies.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById,
                                              isCaptain: f.id === cap.id, day: 12 }));
}

const side = (tag, units) => ({ tag, corpId: tag, policy: 'standard',
                                policyName: 'standard', hasMedkit: true, units });

/** net casualty advantage of the squad that opened the crate over the same squad that did not */
function duel(pick, base) {
  let a = 0, b = 0, n = 0;
  for (let t = 0; t < TRIALS; t++) {
    for (const g of GROUNDS) {
      const ob = BANDS[(t + GROUNDS.indexOf(g)) % 3];
      const pp = PREP[(t + GROUNDS.indexOf(g)) % PREP.length];
      for (const swap of [false, true]) {
        const A = side('A', squad(base + t + (swap ? 'b' : 'a'), swap ? null : pick));
        const B = side('B', squad(base + t + (swap ? 'a' : 'b'), swap ? pick : null));
        const r = T.resolve(P.mulberry32(P.seedFrom('crate' + t + g + ob)), A, B,
                            { terrain: g, openingBand: ob,
                              prep: swap ? [pp[1], pp[0]] : pp, log: false });
        const c = x => (x.dead || 0) + (x.down || 0);
        a += swap ? c(r.casualties.B) : c(r.casualties.A);   /* opened the crate */
        b += swap ? c(r.casualties.A) : c(r.casualties.B);   /* did not */
        n++;
      }
    }
  }
  return { net: (b - a) / n, fights: n };
}

console.log('\nWhat one crate is worth: the squad that opened it against the squad that did not');
console.log('-'.repeat(78));
console.log('crate held'.padEnd(30) + 'pop A     pop B     mean      agree?');

const shown = [];
for (const tier of [3, 4, 5]) {
  const pool = cratePool(tier);
  if (!pool.length) continue;
  shown.push([('tier ' + tier + ' piece (' + pool.length + ' in pool)'), pool[0]]);
}
const ex = exoticPool();
if (ex.length) shown.push(['an exotic (' + ex.length + ' in pool)', ex[0]]);

for (const [label, pick] of shown) {
  const A = duel(pick, 'popA'), B = duel(pick, 'popB');
  const mean = (A.net + B.net) / 2;
  const agree = (A.net >= 0) === (B.net >= 0);
  console.log((label + ' — ' + pick.name).slice(0, 29).padEnd(30) +
              (A.net >= 0 ? '+' : '') + A.net.toFixed(3) + '    ' +
              (B.net >= 0 ? '+' : '') + B.net.toFixed(3) + '    ' +
              (mean >= 0 ? '+' : '') + mean.toFixed(3) + '    ' +
              (agree ? 'yes' : 'NO — not a number'));
}
console.log('-'.repeat(78));
console.log(TRIALS * GROUNDS.length * 2 + ' fights per matchup per population. One body upgraded,');
console.log('which is what a crate gives — not eight. A number near zero is a finding, not a gap.');
