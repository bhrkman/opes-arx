/* Capital Divide — /sim/items.js  (Step 5b-1)
 *
 * The catalog and the arithmetic around it. Implements PROCUREMENT.md:
 *   §2 the three limits (treasury, Kit Allowance, bulk) · §3 the loadout · §4 pricing
 *
 * STAGE 1 IS PLUMBING ONLY. Nothing here changes a fight. `defaultLoadout()` resolves to
 * exactly combat.js's historical DEFAULT_WEAPON {power 5, medium, tier 3} and DEFAULT_ARMOR
 * {protection 3} — the Pattern Carbine and the Plate Carrier are those numbers by design, so
 * the pipe can be proved before anything flows through it. No RNG is drawn anywhere in this
 * file: equipping a force must not shift a single stream (5b-2 owns real assignment).
 *
 * A resolved loadout carries BOTH the item ids and the flat `weapon` / `armor` objects the
 * resolver already reads, so combat.js needs no change at this stage.
 *
 * Pure logic: no DOM, no Math.random, no I/O beyond the node bootstrap.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;

  const CONST = {
    /* §2.2 the Aleas cost cap — uniform, per body in the drop force */
    /* §2.2 — the force size the Aleas ceiling is WRITTEN FOR. The ceiling is this many bodies'
       worth, and a corp gets it whether it fields that many or not. `season.js` reads its
       DROP_MAX from here rather than declaring a second copy, because the two numbers are the
       same fact and this project has three times found a constant declared twice. */
    DROP_MAX: 24,
    /* §2.2 THE ALEAS CEILING IS GONE (ruled at the money pass). A kit allowance — 2,500 a body, 60,000 a
       force, up 6% a year — capped what any OA could field. It was there to stop a rich OA buying the field;
       the economy now does that (a year's kit is a year's wages), and a ceiling is the kind of thing this
       project cuts. What bounds a force's kit is its treasury and the bulk its people can carry. */

    /* §2.3 bulk */
    SQUAD_BULK_PER_HEAD: 8,         // [C] a standard kit is exactly 8
    OVER_BULK_FATIGUE: 3,           // [C] per point over, per day

    /* §6 energy weapons — declared here, read from 5b-3 */

    /* §12 loot — declared here, read from 5b-3. `LOOT_DAMAGE_P` and `REPAIR_COST_FRAC` stood
       beside this one and are DELETED with the gear-damage cut (COMBAT.md §9.2). Neither was
       ever read by any system; their only reader was the check asserting the documents quoted
       them correctly, which is a guard certifying that a number nothing uses is described
       accurately. `REPAIR_COST_FRAC` was additionally declared a second time in `ledger.js`. */
    LOOT_RECOVERY_P: 0.60,          // [C] per item off enemy dead on held ground

    /* §2.4 quotas */
    QUOTA_SATCHEL_PER_BODY: 1,      // [S] Step 9 owns the violation
    QUOTA_CELL_PER_BODY: 1,         // [S]

    DEVICE_SHARE: 0.34,             // [C] §DEVICES share of a force the richest OA fits with a device
    MOD_OVERWATCH_AIM: 20,          // [C] a target link's reaction-shot steadiness, in sheet Aim (the overwatch trait's size)
    FOUNDING_DEPTH: 1.25,           // [H] spares a corp arrives with, over one force's worth
    FOUNDING_SPARES: 0.35,          // [H] cheap spares per body per slot (ruled smaller)
    /* §14a — HOW MUCH A CORP ACTUALLY FIELDS (Step 6b).
       The Aleas cap is one number for every corp and always will be — that is P1 and it is
       not negotiable. What varies is how close to it a corp gets, and that turned out to be
       the whole underdog problem: every corp was fielding 2247-2250 against a cap of 2250,
       within three credits of each other, because the founding locker held 119,690 credits
       of kit against a 54,000 ceiling. The locker was more than twice the cap, so money
       could never bind and difficulty never reached the ground.

       Two things now decide what a corp brings:
         CAN  — its locker depth (a poor corp's history is thin) plus its procurement budget
         WILL — whether this planet is worth kitting up for, and whether it is a spender

       A corp that reckons a poor rock is not worth the outlay fields under its means on
       purpose, which is a decision a manager should be able to make too. */
    LOCKER_DEPTH_POOR: 0.34,        // [C] the thinnest history in the fleet
    LOCKER_DEPTH_RICH: 1.30,        // [C] the deepest
    KIT_FLOOR_PER_BODY: 1000,       // [S] the cheapest force that can actually muster is
                                    //     919/body, so this is the real floor, not a guess
    WILL_RICHNESS_PULL: 0.13,       // [C] how much a fat planet opens the purse
    WILL_THRIFT_PULL: 0.11,         // [C] and how much a thrifty board closes it
    WILL_FLOOR: 0.72,               // [C] appetite MODULATES; wealth decides. Set wider and a
                                    //     poor planet drags the whole fleet to the floor
                                    //     together, which re-flattens the field it is meant
                                    //     to spread
    KIT_BUDGET_REFERENCE: 9000,     // [C] budget per body, in credits, at which a corp is rich for kit: its locker
                                    //     is deep and it fields tier 4 for everyone (a tier-4 kit is ~7,400)
    KIT_GUN_SHARE: 0.62,            // [C] of a body's share of the OA's kit outlay, what the gun may take; the armour the rest
    KIT_SHARE_SLACK: 1.35,          // [C] and how far past an even share one body's piece may go
    KIT_TASTE_SWING: 12,            // [C] §QUARTERMASTER the doctrine's favourite gun is worth this much Aim in the choosing
    KIT_AIM_EDGE: 0.01,             // [C] §QUARTERMASTER a point of Aim with a gun, against its measured edge (log): ten points ≈ a tenth more
    KIT_SPREAD: 5,                  // [C] the doctrine's favourite guns a locker holds, and a nameless body rotates through
    KIT_GOOD: 5,                    // [C] the guns a fighter shoots best, that the quartermaster will buy them
    KIT_BUY_MARGIN: 4,
    KIT_MUSTER_SLACK: 1.35,
    KIT_BAND_MIN_FORCE: 9,
    ESSENTIAL_MAX_COST: 300,        // [C] the most the essential consumable everyone gets first may cost
    KIT_MUSTER_BODY_SHARE: 1.6,     // [C] the most of a body's fair share of the allowance one rack piece may take at the muster          // [C] a force this size carries a gun of every band         // [C] the cheap end of the rack a named fighter chooses from at the muster              // [C] how much better they must shoot it to be bought it
    MEDKIT_SHARE: 0.25,             // [C] the best-Fieldcraft share of a force that carries a medkit first
    MOD_RESERVE: 0.12,              // [H] share of the allowance kept back for mods/consumables
    MOD_SLOTS: 2,                   // [S] §3
    CONSUMABLE_SLOTS: 2,            // [S] §3
    EXOTIC_PRICE_FLOOR_MULT: 1.5    // [C] cheapest exotic vs dearest formula item (3.0 → 1.5 at the money pass: tiers 1–4 doubled, the exotics held)
  };

  /* The default loadout. Chosen so a fielded force is numerically identical to the
     pre-catalog field: carbine power 5 / medium / tier 3, plate carrier protection 3.

     THIS IS A FALLBACK, NOT WHAT A FIELDED SQUAD CARRIES. It is what bodies get when a corp
     fails to muster, or when there are more bodies than planned kits. Real kit comes from
     `planForce`, and it is various: six of the catalog's weapons carry `suppressive` or
     `suppressive_2`, and none of them is a carbine.

     So a squad equipped this way is a squad with no machine guns in it, and any mechanism that
     hangs off a weapon tag will read as dead when measured on one. Three probes did exactly
     that and reported that suppression NEVER FIRES — 0 pins across 21,386 shots. Through two
     real contests, where corporations buy their own kit, it is 4,705 pins, and suppression is
     true on 31.85% of all shot evaluations: the most-used modifier in the game. The finding was
     entirely an artifact of arming everybody the same way.

     If you are measuring whether something works, equip the way the contest does, or run the
     contest. This constant is for filling a gap, not for building a world to measure. */
  /* §FACILITIES THE FALLBACK IS ISSUE KIT, AND ISSUE KIT IS THE ARMOURY'S FIRST LEVEL. It was a tier-three
     carbine and plate, which handed an OA that could not arm its drop better kit than one that could. */
  const DEFAULT_LOADOUT = {
    primary: "itm_pattern_auto",
    mods: [],
    sidearm: null,
    armor: "itm_patrol_vest",
    consumables: []
  };
  /* There is no free kit (ruled). A body the armoury cannot cover carries nothing, which
     is a real and survivable state for the sim and a disastrous one for the manager. */
  const UNARMED = { primary: null, mods: [], sidearm: null, armor: null, consumables: [] };

  let CATALOG = null, INDEX = {}, QUIRKS = {}, PRICING = null, TIER_MULT = null, DOCTRINES = [];

  function init(data) {
    CATALOG = data.items.slice();
    INDEX = {};
    for (const it of CATALOG) INDEX[it.id] = it;
    if (typeof fillSkillTypes === 'function') fillSkillTypes();
    QUIRKS = {};
    for (const q of data.quirks) QUIRKS[q.id] = q;
    DOCTRINES = (data.doctrines || []).slice();
    PRICING = data.constants.pricing;
    TIER_MULT = data.constants.TIER_MULT;
    return api;
  }

  function byId(id) { return INDEX[id] || null; }
  function all() { return CATALOG.slice(); }
  function bySlot(slot) { return CATALOG.filter(i => i.slot === slot); }
  const COVER_SHARE = { torso: 0.26, head: 0.10, arms: 0.18, legs: 0.18 };
  function coverageShare(covers) {
    if (!covers || !covers.length) return 1;
    let s = 0.28;                                    /* the wounds no location on the body owns */
    for (const c of covers) s += COVER_SHARE[c] || 0;
    return Math.min(1, Math.round(s * 100) / 100);
  }
  function quirkPoints(tags, effects) {
    let p = 0;
    for (const t of tags || []) if (QUIRKS[t]) p += QUIRKS[t].points;
    /* §GUNS penetration and suppression are a gun's own numbers now, priced at the points their tags carried */
    const e = effects || {};
    if (e.pen) p += (QUIRKS['pierce_' + Math.min(3, e.pen)] || {}).points || 0;
    if (e.suppress) p += (QUIRKS[e.suppress >= 2 ? 'suppressive_2' : 'suppressive'] || {}).points || 0;
    if (e.noise === 0) p += (QUIRKS.silent || {}).points || 0;      /* a silenced gun is priced as `silent` was */
    return p;
  }

  /** §4.3 — regenerate a formula price. The guard diffs this against the data file, so a
      hand-edited cost fails the suite rather than quietly rebalancing the game. */
  function formulaCost(item) {
    const P = PRICING, m = TIER_MULT[String(item.tier)];
    const e = item.effects || {}, qp = quirkPoints(e.tags, e);
    let raw;
    if (item.slot === "sidearm") raw = P.SIDEARM_BASE + P.SIDEARM_POWER * (e.power || 0) + P.SIDEARM_QUIRK * qp;
    /* §ARMOUR what it covers moves the price, softly: a torso vest is not worth half a full weave */
    else if (item.slot === "armor") raw = (P.ARMOR_BASE + P.PROTECTION_COST * (e.protection || 0)) * (0.6 + 0.4 * coverageShare(e.covers))
                                       + P.QUIRK_COST * qp - P.BULK_REBATE * (item.bulk || 0);
    else raw = P.WEAPON_BASE + P.POWER_COST * (e.power || 0)
             + P.QUIRK_COST * qp - P.BULK_REBATE * (item.bulk || 0);
    const r = P.ROUND_TO;
    return Math.round(raw * m / r) * r;
  }

  /* ------------------------------------------------------------------ */
  /* Loadouts                                                            */
  /* ------------------------------------------------------------------ */

  function normalise(lo) {
    lo = lo || {};
    return {
      primary: lo.primary || null,
      mods: (lo.mods || []).slice(),
      sidearm: lo.sidearm || null,
      armor: lo.armor || null,
      consumables: (lo.consumables || []).slice()
    };
  }

  function itemsOf(lo) {
    const out = [];
    for (const id of [lo.primary, lo.sidearm, lo.armor].concat(lo.mods, lo.consumables)) {
      if (!id) continue;
      const it = byId(id);
      if (it) out.push(it);
    }
    return out;
  }

  function value(lo) { return itemsOf(normalise(lo)).reduce((s, i) => s + (i.cost || 0), 0); }
  function bulk(lo) { return itemsOf(normalise(lo)).reduce((s, i) => s + (i.bulk || 0), 0); }

  /** The flat shapes combat.js already consumes, plus what 5b-3 will need. */
  function resolve(lo) {
    lo = normalise(lo);
    const p = byId(lo.primary);
    const a = byId(lo.armor);
    const s = lo.sidearm ? byId(lo.sidearm) : null;
    const pe = (p && p.effects) || {}, ae = (a && a.effects) || {};
    let tags = (pe.tags || []).slice();
    /* §MODS A MOD DOES WHAT IT SAYS. This read exactly one field from a mod — `grants`, a tag — and
       dropped every other effect on the floor: eleven of eighteen mods did nothing when fitted,
       ₡3,190 of kit at list price (audit 2), and two more lost their power penalty. Every effect a
       mod declares is now folded into the kit, and combat reads `kit.mod`. Two remain inert because
       the system they act on is gone: the heat sink (heat) and the field kit (gear damage). */
    const mod = { power: 0, charge: 0, ammo: 0, aim: 0, aimHolding: 0, aimMoving: 0,
                  overwatchAim: 0, bandMult: 1, suppressCost: 0 };
    const cancels = [];
    for (const id of lo.mods) {
      const m = byId(id);
      const e = (m && m.effects) || {};
      if (e.grants) tags.push(e.grants);
      /* a mod's `tags` reach the gun as its `grants` do */
      for (const t of (e.tags || [])) tags.push(t);
      mod.power += e.power || 0;
      mod.charge += e.charge || 0;
      mod.ammo += e.ammo || 0;
      mod.aim += e.gear_accuracy || 0;
      mod.aimHolding += e.aim_holding || 0;
      mod.aimMoving += e.aim_moving || 0;
      /* "waits better than you do": sized as the overwatch trait is (+2 on a reaction shot) */
      if (e.overwatch_mult) mod.overwatchAim += CONST.MOD_OVERWATCH_AIM;
      if (e.band_mismatch_mult) mod.bandMult *= e.band_mismatch_mult;
      /* "holds the line down": suppressing fire costs a round less */
      if (e.suppress_drain) mod.suppressCost += 1;
      if (e.cancels) cancels.push(e.cancels);
    }
    if (cancels.length) tags = tags.filter(t => cancels.indexOf(t) < 0);
    return {
      unarmed: !p,
      /* `id` and `name` are carried so a viewer can say WHICH gun fired. The resolver never
         reads them; the shot log does, and a log that cannot name the weapon is useless for
         judging weapons. */
      weapon: { power: Math.max(0, (pe.power || 0) + (p ? mod.power : 0)), range: pe.range || "medium", tier: p ? p.tier : 1,
                id: p ? p.id : null, name: p ? p.name : "unarmed",
                /* the trade this weapon belongs to — combat reads effective aim through it,
                   and the class and type have ONE home each: skillClassOf, skillTypeOf */
                skillClass: skillClassOf(p), skillType: skillTypeOf(p),
                mobility: pe.mobility || 0, damage: pe.damage || (p ? p.family : "ballistic"),
                /* §GUNS (ruled) what a gun IS on the grid: shots a round, rounds a magazine, rounds to reload, the
                   tiles it is made for, the tiles it is too close at, and how the aim falls off beyond its reach */
                rof: pe.rof, mag: pe.mag, reload: pe.reload, reach: pe.reach, near: pe.near, falloff: pe.falloff,
                /* §GUNS stage 2: its own precision and the cost of a snap shot; what armour it goes through; how hard it pins */
                handling: pe.handling, snap: pe.snap, pen: pe.pen, suppress: pe.suppress,
                /* §GUNS stage 3: how many more it catches beside the one it hits, and how far a shot of it carries */
                spread: pe.spread, noise: pe.noise },
      armor: { id: a ? a.id : null, name: a ? a.name : null, tags: (ae.tags || []).slice(),
               protection: ae.protection || 0, mobility: ae.mobility || 0,
               resist: ae.resist || { ballistic: 0, energy: 0, explosive: 0 },
               /* §ARMOUR what it covers, and the share of hits that land on it — from the injury table's own odds
                  (arm 18, leg 18, torso and chest 26, head 10, the rest 28 — the internal, burns, spinal and
                  catastrophic, which any armour is reckoned to stand between). Nothing listed means full. */
               covers: ae.covers || null, coverage: coverageShare(ae.covers) },
      /* THE SAME FIELDS AS THE PRIMARY, which it did not have. The note three lines above says
         `id` and `name` are carried so a viewer can say WHICH gun fired — and the sidearm built
         directly beneath it carried neither, nor `mobility`. When a fighter runs dry,
         `useSidearm` copies this object over `weapon`, so from that moment the body has a
         weapon with no name: every shot it fires afterwards is logged nameless and the event
         panel prints the sentence with the gun missing off the end. It also has no `mobility`,
         which the movement code reads to work out how far it can walk. */
      sidearm: s ? { power: (s.effects || {}).power || 0, range: (s.effects || {}).range || "short",
                     tier: s.tier, id: s.id, name: s.name,
                     mobility: (s.effects || {}).mobility || 0,
                     damage: (s.effects || {}).damage || s.family,
                     rof: (s.effects || {}).rof, mag: (s.effects || {}).mag, reload: (s.effects || {}).reload,
                     reach: (s.effects || {}).reach, near: (s.effects || {}).near, falloff: (s.effects || {}).falloff,
                     handling: (s.effects || {}).handling, snap: (s.effects || {}).snap, pen: (s.effects || {}).pen, suppress: (s.effects || {}).suppress,
                     spread: (s.effects || {}).spread, noise: (s.effects || {}).noise,
                     tags: (s.effects || {}).tags || [] } : null,
      family: p ? p.family : "none", tags,
      heat: pe.heat || 0, heatCap: pe.heat_cap || 0,
      charge: (pe.charge || 0) + ((pe.charge || 0) > 0 ? mod.charge : 0),
      mod: mod,
      /* §10 — what this fighter is carrying to spend. Single use, each with an action. */
      consumables: lo.consumables.map(function (id) {
        const c = byId(id);
        return c ? { id: c.id, action: c.action, tags: (c.effects || {}).tags || [] } : null;
      }).filter(Boolean),
      value: value(lo), bulk: bulk(lo)
    };
  }

  /** §3 legality. Returns [] when the loadout is legal. */
  function validate(lo) {
    lo = normalise(lo);
    const errs = [];
    const p = lo.primary ? byId(lo.primary) : null;
    if (lo.primary && !p) errs.push("unknown primary " + lo.primary);
    if (p && p.slot !== "primary") errs.push(p.id + " is not a primary");
    if (lo.sidearm) {
      const s = byId(lo.sidearm);
      if (!s) errs.push("unknown sidearm " + lo.sidearm);
      else if (s.slot !== "sidearm") errs.push(s.id + " is not a sidearm");
    }
    if (lo.armor) {
      const a = byId(lo.armor);
      if (!a) errs.push("unknown armor " + lo.armor);
      else if (a.slot !== "armor") errs.push(a.id + " is not armor");
    }
    if (lo.mods.length > CONST.MOD_SLOTS) errs.push("too many mods (" + lo.mods.length + ")");
    for (const id of lo.mods) {
      const m = byId(id);
      if (!m) { errs.push("unknown mod " + id); continue; }
      if (m.slot !== "mod") { errs.push(m.id + " is not a mod"); continue; }
      /* §9 family locks: a heat sink on a ballistic rifle is not a purchase, it is a bug */
      if (m.family !== "any" && p && m.family !== p.family) errs.push(m.id + " does not fit a " + p.family + " primary");
    }
    if (lo.consumables.length > CONST.CONSUMABLE_SLOTS) errs.push("too many consumables");
    for (const id of lo.consumables) {
      const c = byId(id);
      if (!c) { errs.push("unknown consumable " + id); continue; }
      if (c.slot !== "consumable") errs.push(c.id + " is not a consumable");
    }
    /* quotas (§2.4) */
    const n = (id) => lo.consumables.filter(c => c === id).length;
    if (n("itm_ammo_satchel") > CONST.QUOTA_SATCHEL_PER_BODY) errs.push("over the ammunition satchel quota");
    if (n("itm_power_cell") > CONST.QUOTA_CELL_PER_BODY) errs.push("over the power cell quota");
    return errs;
  }

  /* ------------------------------------------------------------------ */
  /* Force-level arithmetic                                              */
  /* ------------------------------------------------------------------ */

  /** §2.2. `season` is 1-based; the escalator is declared now and read when seasons exist. */
  /* ------------------------------------------------------------------ */
  /* §15 — composition, then lean                                        */
  /* ------------------------------------------------------------------ */


  /** How well an item matches a doctrine's taste. Deterministic; no RNG anywhere. */
  function tasteScore(item, taste) {
    if (!taste || !taste.length) return 0;
    let s = 0;
    for (let i = 0; i < taste.length; i++) {
      const t = taste[i], w = taste.length - i;      /* earlier in the list counts for more */
      if (t === 'cheap') { s += w * (1 - Math.min(1, item.cost / 2500)); continue; }
      if (t === item.family) { s += w; continue; }
      if ((item.effects.tags || []).includes(t)) s += w;
    }
    return s;
  }
  const cheapest = (ids) => ids.map(byId).filter(Boolean).sort((a, b) => a.cost - b.cost)[0];
  /* A role's candidate list is written in preference order — the point man's armors start
     with the plate carrier because that is what a point man should be wearing. Taste
     reorders that list; it does not replace it with a price list. Falling back to `cheapest`
     here is what put a hundred and two fighters in the lightest vest in the catalog. */
  const rankBy = (ids, taste) => {
    const idx = {};
    ids.forEach((id, i) => { idx[id] = i; });
    return ids.map(byId).filter(Boolean)
      .sort((a, b) => (tasteScore(b, taste) - tasteScore(a, taste)) || (idx[a.id] - idx[b.id]));
  };
  const preferred = (ids, taste) => rankBy(ids, taste)[0];

  /**
   * §15 — build a whole drop force under the cap.
   * Floor everyone in their role's cheapest legal kit, then spend what is left in the
   * doctrine's priority order: preferred primary, then armor, then mods. A corp with
   * expensive taste upgrades fewer bodies; nobody ends up with two unit types.
   */
  /* §QUARTERMASTER (ruled) ONE QUARTERMASTER, FOR EVERY OA, BUILT AROUND THE FIGHTERS. The kit used to be
     planned by ROLE — point, line, marksman, support, medic, scout: templates in the first upload, never
     discussed, that the fight never read and the page never named — so many of each kit, each from its own
     list, dealt out afterwards to whoever fit the role. Now each fighter is kitted as themselves: a gun from
     the types they shoot best (the doctrine's taste the tiebreak), armour and a sidearm by the doctrine, the
     first consumable a medkit for the best-Fieldcraft share of the force and the doctrine's favourite for the
     rest. Every OA's un-kitted fighters go through this, a manager's included (his own hand-kit comes first).
     With no fighters named (the suite, the founding), bodies take the doctrine's favourite guns in turn.
     The phases and the economics are the old planner's, unchanged: the Aleas' cap, the reserve kept for
     sidearms and consumables, sponsor discounts, the muster before any upgrade, upgrades from the locker. */
  /* §QUARTERMASTER (ruled: a gun is chosen for what it does) a gun's measured EDGE in a fight — what it takes out against
     what it loses, beside one reference rifle (gunworth.cjs, written onto the catalog) — and the stats it was measured on */
  function statPrint(it) {
    const str = JSON.stringify({ t: it.tier, e: it.effects });
    let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function edgeOf(g) { return (g && g.worth && g.worth.edge) || 1; }
  /* what a gun is worth in this fighter's hands: its edge, and how well they shoot its kind (and the doctrine's taste) in
     Aim points, on one scale */
  function gunScore(g, aim) { return Math.log(edgeOf(g)) + CONST.KIT_AIM_EDGE * (aim - 100); }
  /* the engine does not arm anybody with a stun gun (ruled): that is a manager's own choice, at the Armoury, by hand */
  const engineIssues = (it) => !(it.slot === 'primary' && ((it.effects || {}).tags || []).indexOf('nonlethal') >= 0);
  /* the guns in a doctrine's order of taste, the better gun first where taste does not choose */
  const rankGuns = (ids, taste) => ids.map(byId).filter(Boolean)
    .sort((a, b) => (tasteScore(b, taste) - tasteScore(a, taste)) || (edgeOf(b) - edgeOf(a)));
  function shotOf(f, g) {
    const a = (f && f.stats && f.stats.aim) || 100, sk = (f && f.skills) || {};
    const c = sk[skillClassOf(g)], t = sk[skillTypeOf(g)];
    return (a + (c != null ? c : a) + (t != null ? t : a)) / 3;
  }
  const DEVICE_IDS = ['itm_spotter_drone', 'itm_auto_turret'];
  function planForce(doctrineId, bodyCount, opts) {
    opts = (typeof opts === 'number') ? { season: opts } : (opts || {});
    const d = api.doctrine(doctrineId);
    if (!d) return null;
    /* Two numbers: `allowance` is what THIS OA means to lay out on kit for this drop (its own target, from its
       budget and its will — the Aleas' ceiling it once was is gone), and `budget` is the treasury credits that
       actually buy it (§14). A corp fields min(budget, allowance); with no target given, the money is the limit. */
    const allow = opts.allowance != null ? opts.allowance : Infinity;
    const budget = Math.max(0, opts.budget || 0);
    const armoury = opts.armoury || foundingArmoury(doctrineId, bodyCount, opts).stock;
    const taste = d.taste || [];
    /* §FACILITIES the Armoury decides what can be issued: the doctrine's ceiling, and the Armoury's below it */
    const maxTier = Math.min(d.armoury_max_tier || 5, opts.maxTier || 5);
    const ofSlot = (slot) => CATALOG.filter(it => it.slot === slot && (it.tier || 1) <= maxTier && it.price_model !== 'none' && (it.cost || 0) > 0 && engineIssues(it));
    const stock = {};
    for (const k in armoury) stock[k] = armoury[k];
    const take = (id) => { if (stock[id] > 0) { stock[id]--; return true; } return false; };
    const give = (id) => { if (id) stock[id] = (stock[id] || 0) + 1; };
    const fighters = (opts.fighters || []).slice(0, bodyCount);
    const bodies = [];
    for (let i = 0; i < bodyCount; i++) bodies.push({ i: i, f: fighters[i] || null, loadout: normalise(UNARMED) });

    const disc = (item) => {
      if (!item || !opts || typeof opts.discount !== 'function') return 0;
      const fam = item.slot === 'armor' ? 'armor'
                : (item.damage === 'energy' || item.family === 'energy') ? 'energy' : 'ballistic';
      return Math.max(0, Math.min(0.6, opts.discount(fam) || 0));
    };
    const priceOf = (item) => Math.round((item.cost || 0) * (1 - disc(item)));
    const cheapFirst = (items) => items.slice().sort((x, y) => x.cost - y.cost);
    let spent = 0, money = budget, cash = 0;

    /* what this body would carry, best first */
    const gunTaste = rankGuns(ofSlot('primary').map(g => g.id), taste);
    const tasteBonus = {};
    gunTaste.forEach((g, k) => { tasteBonus[g.id] = CONST.KIT_TASTE_SWING * (1 - k / Math.max(1, gunTaste.length - 1)); });
    const gunsFor = (b) => {
      if (!b.f || !b.f.skills) {                  /* no fighter named: the doctrine's favourites in turn */
        const top = gunTaste.slice(0, Math.min(CONST.KIT_SPREAD, gunTaste.length)), k = b.i % Math.max(1, top.length);
        return top.slice(k).concat(top.slice(0, k)).concat(gunTaste.slice(top.length));
      }
      return gunTaste.slice().sort((x, y) => gunScore(y, shotOf(b.f, y) + tasteBonus[y.id]) - gunScore(x, shotOf(b.f, x) + tasteBonus[x.id]));
    };
    const armours = rankBy(ofSlot('armor').map(a => a.id), taste);
    const sidearms = rankBy(ofSlot('sidearm').map(a => a.id), taste);
    const listFor = (b, slot) => slot === 'primary' ? gunsFor(b) : slot === 'armor' ? armours : sidearms;

    /* ---- phase 1: muster from the locker ---- */
    /* Stock costs no money, so exhaust it before opening the wallet — and the guns respect the same
       reserve the mods do (the essentials stop at the gun allowance). CHEAPEST available, not best: muster
       is about arming everyone. A named fighter takes the cheapest gun of the few they shoot best. */
    /* THE ESSENTIALS ARE HELD BACK FIRST: a medkit for the carriers and the doctrine's first consumable for everyone
       else. The gun allowance kept a share back for them, but the purchase's last resort — buy the cheapest gun
       anyway — ignored it, and one OA armed its force with ₡67 of the cap left and sent its squads out with no
       medkit at all. The arming now stops short of the essentials' price, last resort included. */
    const consRanked = rankBy(ofSlot('consumable').map(c => c.id).filter(id => DEVICE_IDS.indexOf(id) < 0), taste);
    /* the first consumable everyone gets is an ESSENTIAL, so it is the cheapest of the doctrine's three favourites and never
       dearer than a grenade's kind: a doctrine whose favourite was the ₡3,470 thermobaric charge handed one to each of
       nineteen fighters and spent the whole cap on them */
    const firstOther = cheapFirst(consRanked.filter(c => c.id !== 'itm_medkit').slice(0, 3)).find(c => c.cost <= CONST.ESSENTIAL_MAX_COST)
                    || cheapFirst(consRanked.filter(c => c.id !== 'itm_medkit'))[0];
    const medN = Math.max(1, Math.round(bodies.length * CONST.MEDKIT_SHARE));
    const medkit = byId('itm_medkit');
    const essentials = medN * ((medkit && medkit.cost) || 0) + Math.max(0, bodies.length - medN) * ((firstOther && firstOther.cost) || 0);
    const mustAllow = Math.min(Math.round(allow * (1 - CONST.MOD_RESERVE)), allow - essentials);
    const SLOTS = ['primary', 'armor'];
    /* the CHEAP END of the rack arms everyone — and among the guns there (no more than a third over the cheapest
       one in stock), a named fighter takes the one they shoot best, not simply the cheapest */
    /* AND THE MUSTER KEEPS BACK ENOUGH TO ARM EVERYONE STILL WAITING, at the cheapest price there is — the purchase
       below always did; the muster did not, and a locker of mostly favourites armed eleven of nineteen, left too
       little to buy the rest, and the buying ate the medkits */
    const floorOf = (slot) => { const c = cheapFirst(slot === 'primary' ? gunTaste : armours); return c.length ? c[0].cost : 0; };
    let floorLeft = bodies.length * (floorOf('primary') + floorOf('armor')), bareFloor = 0;
    for (const b of bodies) for (const slot of SLOTS) {
      floorLeft -= floorOf(slot);
      /* a slot left bare still has to be bought below, so its floor stays held */
      /* and nobody takes a rack piece worth more than a fair share of the allowance until everyone is kitted: a rack of
         favourite armour, handed to two-thirds of a force at the muster, spent the whole cap before a gun was chosen */
      const fairShare = mustAllow / bodies.length * CONST.KIT_MUSTER_BODY_SHARE;
      let order2 = cheapFirst(listFor(b, slot)).filter(c => stock[c.id] > 0 && priceOf(c) <= fairShare && spent + priceOf(c) + floorLeft + bareFloor <= mustAllow);
      if (slot === 'primary' && b.f && b.f.skills && order2.length) {
        const floor = order2[0].cost * CONST.KIT_MUSTER_SLACK;
        const cheapEnd = order2.filter(c => c.cost <= floor).sort((x, y) => gunScore(y, shotOf(b.f, y)) - gunScore(x, shotOf(b.f, x)));
        order2 = cheapEnd.concat(order2.filter(c => c.cost > floor));
      }
      const got = order2.find(c => spent + priceOf(c) <= mustAllow && take(c.id));
      if (got) { b.loadout[slot] = got.id; spent += priceOf(got); }
      else bareFloor += floorOf(slot);
    }
    /* ---- phase 2: buy what the locker could not cover, once ---- */
    /* Each purchase leaves enough behind to muster everybody still bare, money AND allowance. */
    const bare = () => { const out = []; for (const b of bodies) for (const slot of SLOTS) if (!b.loadout[slot]) out.push({ b, slot }); return out; };
    const floorCost = (slot) => { const c = cheapFirst(slot === 'primary' ? gunTaste : armours); return c.length ? c[0].cost : Infinity; };
    let queue = bare();
    let reserve = queue.reduce((s2, q) => s2 + floorCost(q.slot), 0);
    let shortfall = 0;
    if (reserve > money) shortfall = reserve - money;
    if (!shortfall) {
      for (const q of queue) {
        reserve -= floorCost(q.slot);
        /* THE OUTLAY IS SHARED: a body buys within its share of what the OA means to spend (a gun most of it), a
           little past it for a piece worth having — the first body in the queue does not buy the railgun and leave
           the rest surplus rifles. Measured, the tier everyone carries is what wins fights. */
        const share = (allow / bodies.length) * (q.slot === 'primary' ? CONST.KIT_GUN_SHARE : 1 - CONST.KIT_GUN_SHARE) * CONST.KIT_SHARE_SLACK;
        const ceilingHere = Math.min(money - reserve, mustAllow - spent - reserve, share);
        const ranked = listFor(q.b, q.slot);
        const fits = ranked.filter(c => spent + c.cost <= mustAllow);
        /* never past its outlay for a gun this hand merely prefers: if nothing they would rather carry fits, they take
           what the rack holds before anything is bought over the line */
        let pick = fits.find(c => c.cost <= ceilingHere);
        if (!pick) {
          /* the rack before any purchase — but short of the essentials too, like everything else here */
          const onRack = cheapFirst(q.slot === 'primary' ? gunTaste : armours)
            .find(c => stock[c.id] > 0 && spent + priceOf(c) <= allow - essentials && take(c.id));
          if (onRack) { q.b.loadout[q.slot] = onRack.id; spent += priceOf(onRack); continue; }
          pick = cheapFirst(fits)[0] || cheapFirst(ranked).find(c => spent + c.cost <= allow - essentials) || cheapFirst(ranked)[0];
        }
        money -= pick.cost; cash += pick.cost; spent += pick.cost;
        q.b.loadout[q.slot] = pick.id;
        if (q.slot === 'primary') q.b.boughtPrimary = true;   /* a corp does not buy one body two guns */
      }
    }
    if (shortfall > 0) {
      for (const b of bodies) { give(b.loadout.primary); give(b.loadout.armor); b.loadout = normalise(UNARMED); }
      return { doctrine: d, mustered: false, shortfall: shortfall, bodies: [], counts: {},
               allowance: allow, budget: budget, musterCash: reserve, total: 0, unarmed: bodyCount,
               bands: {}, primaries: {}, distinctPrimaries: 0, headroom: allow, spentCash: 0, boundBy: 'muster' };
    }
    /* ---- phase 3: essentials — one consumable a body before a single upgrade ---- */
    /* A medkit for the best-Fieldcraft share of the force (Fieldcraft is what treating a wound reads); the
       doctrine's favourite consumable for everyone else. */
    /* EVERY SQUAD FIRST: its best-Fieldcraft hand carries one (when the squads are known — `opts.squadOf`), then
       the rest of the share by Fieldcraft across the force. By the force alone, medkits bunched into whichever
       squads held the good hands, and a squad could go out with none. */
    const fcOf = (b) => (b.f && b.f.stats && b.f.stats.fieldcraft) || 0;
    const byFc = bodies.slice().sort((x, y) => (fcOf(y) - fcOf(x)) || (x.i - y.i));
    const medics = new Set();
    if (typeof opts.squadOf === 'function') {
      const firstIn = {};
      for (const b of byFc) { const q = b.f ? opts.squadOf(b.f) : null; if (q != null && firstIn[q] == null) firstIn[q] = b.i; }
      for (const q in firstIn) medics.add(firstIn[q]);
    }
    for (const b of byFc) {
      if (medics.size >= medN) break;
      if (b.f ? true : (b.i % Math.max(1, Math.round(1 / CONST.MEDKIT_SHARE)) === 0)) medics.add(b.i);
    }
    /* the medkits first — each squad's before any second — and only then everyone else's first consumable: in
       body order, early grenades spent the cap a later squad's medkit needed */
    const firstMedics = [...medics];
    const essentialOrder = firstMedics.map(i => bodies[i]).concat(bodies.filter(b => !medics.has(b.i)));
    for (const b of essentialOrder) {
      if (b.loadout.consumables.length) continue;
      const c = medics.has(b.i) ? byId('itm_medkit') : firstOther;
      if (!c || spent + c.cost > allow) continue;
      if (take(c.id)) { b.loadout.consumables = [c.id]; spent += c.cost; }
      else if (c.cost <= money) { money -= c.cost; cash += c.cost; b.loadout.consumables = [c.id]; spent += c.cost; }
    }
    /* ---- phase 3b: a sidearm is not a luxury — the cell-fed first, then everyone, cheapest first ---- */
    {
      const needsSide = bodies.filter(b => !b.loadout.sidearm);
      const cellFed = b => { const pr = byId(b.loadout.primary); return !!(pr && pr.effects && (pr.effects.heat_cap || pr.effects.charge)); };
      needsSide.sort((x, y) => (cellFed(y) ? 1 : 0) - (cellFed(x) ? 1 : 0));
      const list = cheapFirst(sidearms);
      for (const b of needsSide) for (const c of list) {
        if (spent + c.cost > allow) continue;
        if (take(c.id)) { b.loadout.sidearm = c.id; spent += c.cost; break; }
        if (c.cost <= money) { money -= c.cost; cash += c.cost; b.loadout.sidearm = c.id; spent += c.cost; break; }
      }
    }
    const gunAllow = Math.round(allow * (1 - CONST.MOD_RESERVE));
    /* ---- phase 3c: EVERY BAND ANSWERED ---- */
    /* A force of nine or more carries at least one gun of each band — somebody for close work, somebody who reaches —
       whatever its doctrine's tastes: the fighter who shoots that band's types best takes the cheapest gun of the band,
       from the rack or bought, within the money and the gun allowance. (A cap-bound doctrine bought no short gun at
       all once its cheap ones grew dearer — and running this after the upgrades found the cap already spent.) */
    if (bodies.length >= CONST.KIT_BAND_MIN_FORCE) {
      for (const band of ['short', 'medium', 'long']) {
        if (bodies.some(b => { const g = byId(b.loadout.primary); return g && (g.effects || {}).range === band; })) continue;
        const guns = cheapFirst(gunTaste.filter(g => (g.effects || {}).range === band));
        if (!guns.length) continue;
        /* of the four best hands for the band, the one holding the costliest gun — the swap must free cap, not spend it */
        const costOf = (b) => { const g = byId(b.loadout.primary); return g ? (g.cost || 0) : 0; };
        const hands = bodies.filter(b => b.f && b.f.skills).sort((x, y) => shotOf(y.f, guns[0]) - shotOf(x.f, guns[0])).slice(0, 4);
        const pickBody = (hands.length ? hands : bodies.slice(0, 4)).sort((x, y) => costOf(y) - costOf(x))[0];
        for (const g of guns) {
          const cur = byId(pickBody.loadout.primary), curCost = cur ? (cur.cost || 0) : 0;
          if (spent - curCost + g.cost > gunAllow) continue;
          if (take(g.id)) { give(pickBody.loadout.primary); pickBody.loadout.primary = g.id; spent += g.cost - curCost; break; }
          if (!pickBody.boughtPrimary && priceOf(g) <= money) { money -= priceOf(g); cash += priceOf(g); give(pickBody.loadout.primary); pickBody.loadout.primary = g.id; spent += g.cost - curCost; pickBody.boughtPrimary = true; break; }
        }
      }
    }
    /* ---- phase 4: upgrade, from the locker only (a corp does not buy one body two guns) ---- */
    const swap = (b, slot, next) => {
      const prev = b.loadout[slot] ? byId(b.loadout[slot]) : null;
      if (spent - (prev ? prev.cost : 0) + next.cost > gunAllow) return false;
      if (!take(next.id)) return false;
      give(b.loadout[slot]);
      b.loadout[slot] = next.id;
      spent += next.cost - (prev ? prev.cost : 0);
      return true;
    };
    for (const slot of ['primary', 'armor', 'sidearm']) for (const b of bodies) {
      if (slot === 'primary') {               /* the best gun on the rack this hand would rather carry */
        for (const g of gunsFor(b)) { if (g.id === b.loadout.primary) break; if (stock[g.id] > 0 && swap(b, slot, g)) break; }
      } else {
        const ranked = listFor(b, slot);
        const want = (ranked.length > 1 && b.i % 3 === 2) ? ranked[1] : ranked[0];
        if (want && want.id !== b.loadout[slot]) swap(b, slot, want);
      }
    }
    /* ---- phase 4b: BUY FOR THE SPECIALIST ---- */
    /* Everyone is armed and the rack has given what it can; now the money left buys hands the gun they shoot
       best — the biggest improvement first, only while the money and the gun allowance both hold, the muster gun
       going back on the rack. (Letting a specialist wait at the muster for the right gun instead let one OA spend
       its whole gun allowance arming nine people.) */
    {
      const want = [];
      for (const b of bodies) {
        if (!b.f || !b.f.skills || !b.loadout.primary || b.boughtPrimary) continue;   /* one gun bought a body */
        const cur = byId(b.loadout.primary), base = shotOf(b.f, cur);
        const best = gunsFor(b).slice(0, CONST.KIT_GOOD).find(g => shotOf(b.f, g) >= base + CONST.KIT_BUY_MARGIN);
        if (best) want.push({ b, cur, best, gain: shotOf(b.f, best) - base });
      }
      want.sort((x, y) => y.gain - x.gain);
      for (const w of want) {
        const g = w.best, p2 = priceOf(g);
        if (p2 > money || spent - (w.cur.cost || 0) + g.cost > gunAllow) continue;
        money -= p2; cash += p2; spent += g.cost - (w.cur.cost || 0);
        give(w.cur.id); w.b.loadout.primary = g.id; w.b.boughtPrimary = true;
      }
    }
    /* mods are durable, consumables are bought fresh for the drop */
    for (const b of bodies) {
      for (const modId of (d.mod_wishlist || [])) {
        if (b.loadout.mods.length >= CONST.MOD_SLOTS) break;
        const m = byId(modId);
        if (!m || m.tier > maxTier || b.loadout.mods.includes(modId)) continue;
        const next = Object.assign({}, b.loadout, { mods: b.loadout.mods.concat([modId]) });
        if (validate(next).length || spent + m.cost > allow) continue;
        if (take(modId)) { b.loadout = next; spent += m.cost; }
        else if (m.cost <= money) { money -= m.cost; cash += m.cost; b.loadout = next; spent += m.cost; }
      }
      for (const c of consRanked) {
        if (b.loadout.consumables.length >= CONST.CONSUMABLE_SLOTS) break;
        if (spent + c.cost > allow) continue;
        const next = Object.assign({}, b.loadout, { consumables: b.loadout.consumables.concat([c.id]) });
        if (validate(next).length) continue;
        if (take(c.id)) { b.loadout = next; spent += c.cost; }
        else if (c.cost <= money) { money -= c.cost; cash += c.cost; b.loadout = next; spent += c.cost; }
      }
    }
    /* §DEVICES an OA whose money runs to it fits devices, spread through the force (ruled) */
    {
      const want = Math.round(bodies.length * CONST.DEVICE_SHARE * Math.max(0, Math.min(1, opts.wealth || 0)));
      const step = want > 0 ? bodies.length / want : 0;
      for (let k = 0; k < want; k++) {
        const b = bodies[Math.floor(k * step)]; if (!b) continue;
        const dId = DEVICE_IDS[k % 2], dv = byId(dId); if (!dv || (dv.tier || 1) > maxTier) continue;   /* §FACILITIES within the Armoury */
        if ((b.loadout.consumables || []).indexOf(dId) >= 0) continue;
        const cons = (b.loadout.consumables || []).slice();
        if (cons.length >= CONST.CONSUMABLE_SLOTS) {
          let cheap = -1, cv = Infinity;
          cons.forEach((c, i) => { const it = byId(c); const v = it ? it.cost : 0; if (v < cv) { cv = v; cheap = i; } });
          if (cheap < 0) continue;
          give(cons[cheap]); cons.splice(cheap, 1);
        }
        const next = Object.assign({}, b.loadout, { consumables: cons.concat([dId]) });
        if (validate(next).length) continue;
        if (take(dId)) b.loadout = next;
        else if (dv.cost <= money) { money -= dv.cost; cash += dv.cost; b.loadout = next; }
      }
    }
    const prim = {}, band = {};
    for (const b of bodies) {
      prim[b.loadout.primary] = (prim[b.loadout.primary] || 0) + 1;
      const r = resolve(b.loadout).weapon.range;
      band[r] = (band[r] || 0) + 1;
    }
    return { doctrine: d, bodies: bodies.map(b => ({ loadout: b.loadout, fighter: b.f ? b.f.id : null })), counts: {},
             mustered: true, shortfall: 0, unarmed: 0,
             allowance: allow, budget: budget, spentCash: cash,
             boundBy: (spent >= allow - 400 ? 'cap' : (money < 400 ? 'wallet' : 'armoury')),
             total: spent, headroom: allow - spent, stockLeft: stock,
             bulk: bodies.reduce((s, b) => s + bulk(b.loadout), 0),
             primaries: prim, bands: band, distinctPrimaries: Object.keys(prim).length };
  }

  /** §2.2. `season` is 1-based; the escalator is declared now and read when seasons exist. */
  /**
   * §3 — the founding armoury. A corp arrives with kit from seasons nobody simulated:
   * one force's worth of durables in its own taste, plus `depth` spares. Deterministic.
   * Depth is supplied by the caller (the ledger, at 5b-4) — the doctrine holds no money.
   */
  function foundingArmoury(doctrineId, bodyCount, opts) {
    opts = opts || {};
    const d = api.doctrine(doctrineId);
    if (!d) return { stock: {}, value: 0 };
    const depth = opts.depth == null ? CONST.FOUNDING_DEPTH : opts.depth;
    const maxTier = Math.min(d.armoury_max_tier || 5, opts.maxTier || 5), taste = d.taste || [];
    const n = bodyCount;
    const stock = {};
    const add = (id, k) => { if (id && k > 0) stock[id] = (stock[id] || 0) + k; };
    const ofSlot = (slot) => CATALOG.filter(it => it.slot === slot && (it.tier || 1) <= maxTier && it.price_model !== 'none' && (it.cost || 0) > 0 && engineIssues(it)).map(it => it.id);
    const cheapest = (items) => items.slice().sort((a, b) => a.cost - b.cost)[0];
    /* §QUARTERMASTER a locker a force of specialists can be armed from: the doctrine's favourite guns,
       SPREAD across several of them rather than two per role, so there is a type on the rack for more than
       one kind of hand — and, as ever, the old cheap kit that arms a body when the good ones are spoken for */
    const guns = rankGuns(ofSlot('primary'), taste), top = guns.slice(0, Math.min(CONST.KIT_SPREAD, guns.length));
    for (const g of top) add(g.id, Math.ceil(n / top.length * depth));
    /* the cheap spares are the best gun at the cheap end of the rack, not merely the cheapest */
    if (guns.length) { const lo = cheapest(guns).cost * CONST.KIT_MUSTER_SLACK;
      add(guns.filter(g => g.cost <= lo).sort((a, b) => edgeOf(b) / b.cost - edgeOf(a) / a.cost)[0].id, Math.ceil(n * CONST.FOUNDING_SPARES)); }
    for (const slot of ['armor', 'sidearm']) {
      const ranked = rankBy(ofSlot(slot), taste);
      if (!ranked.length) continue;
      const main = Math.ceil(n * 2 / 3), alt = n - main;
      add(ranked[0].id, Math.ceil(main * depth));
      if (alt > 0 && ranked[1]) add(ranked[1].id, Math.ceil(alt * depth));
      add(cheapest(ranked).id, Math.ceil(n * CONST.FOUNDING_SPARES));
    }
    for (const modId of (d.mod_wishlist || [])) {
      const m = byId(modId);
      if (m && m.tier <= maxTier) add(modId, Math.ceil(n * 0.5 * depth));
    }
    /* consumables deplete rather than appearing each season: medkits for the share that carries them, and
       the doctrine's two favourites for everyone */
    add('itm_medkit', Math.ceil(n * CONST.MEDKIT_SHARE * depth));
    rankBy(ofSlot('consumable').filter(id => DEVICE_IDS.indexOf(id) < 0 && id !== 'itm_medkit'), taste)
      .slice(0, CONST.CONSUMABLE_SLOTS).forEach(c => add(c.id, Math.ceil(n * depth)));
    let value = 0;
    for (const id in stock) value += byId(id).cost * stock[id];
    /* §DEVICES a rich OA founds with devices in the rack, in proportion to its wealth (ruled) */
    const devN = Math.round(n * CONST.DEVICE_SHARE * Math.max(0, Math.min(1, (opts && opts.wealth) || 0)));
    for (let k = 0; k < devN; k++) { const dv = k % 2 ? 'itm_auto_turret' : 'itm_spotter_drone'; if ((byId(dv) || { tier: 9 }).tier <= maxTier) add(dv, 1); }
    return { stock, value };
  }


  /** §2.3 — bulk pools at the squad, so light bodies pay for the gunner. */
  function squadBulk(bodies, carryBonus) {
    const used = bodies.reduce((s, b) => s + bulk(b.loadout), 0);
    const cap = bodies.length * CONST.SQUAD_BULK_PER_HEAD + (carryBonus || 0);
    return { used, cap, over: Math.max(0, used - cap) };
  }

  /** Equip a body. Draws no RNG; writes ids AND the resolved flat shapes the resolver reads. */
  function equip(fighter, lo) {
    const norm = normalise(lo || DEFAULT_LOADOUT);
    const r = resolve(norm);
    fighter.loadout = {
      primary: norm.primary, mods: norm.mods, sidearm: norm.sidearm,
      armor: norm.armor, consumables: norm.consumables,
      kit: r                       /* resolved stats; the ids above stay ids */
    };
    return fighter;
  }

  function equipForce(bodies, lo) {
    for (const b of bodies) equip(b, lo || DEFAULT_LOADOUT);
    return bodies;
  }

  /* node bootstrap, layout-agnostic like roster.js */
  function autoInit() {
    if (!isNode) return null;
    const fs = require("fs"), path = require("path");
    const d = __dirname;
    for (const c of [path.join(d, "items.json"), path.join(d, "..", "data", "items.json"),
                     path.join(d, "..", "items.json"), path.join(d, "data", "items.json")]) {
      if (fs.existsSync(c)) return init(JSON.parse(fs.readFileSync(c, "utf8")));
    }
    throw new Error("items: cannot find items.json");
  }

  /* ------------------------------------------------------------------ */
  /* WEAPON SKILL FAMILIES (step d). The catalog's own vocabulary, folded once: family
     crossed with reach, long guns against everything nearer. Four trades a hand can be
     trained in — this function is the single home of that fold; roster births skills by
     it and combat reads effective aim through it. */
  /* §SKILLS (ruled) A SHOT IS AIM, A DAMAGE CLASS AND A WEAPON TYPE. The six "families" (ballistic/energy ×
     long/medium/close) matched nothing a manager sees — a sidearm could be any of four, a scattergun three.
     Now a fighter has Aim, a skill with each damage CLASS (ballistic, energy) and a skill with each weapon
     TYPE — the shop's own sections — and a shot is the average of the three. */
  const SKILL_CLASSES = [{ id: 'ballistic', name: 'Ballistic' }, { id: 'energy', name: 'Energy' }];
  const typeId = t => String(t || '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
  /* filled when the catalogue loads (init), in the shop's own order */
  const SKILL_TYPES = [];
  function fillSkillTypes() {
    SKILL_TYPES.length = 0;
    const seen = {};
    for (const it of CATALOG || []) if ((it.slot === 'primary' || it.slot === 'sidearm') && it.type && !seen[it.type]) {
      seen[it.type] = true; SKILL_TYPES.push({ id: typeId(it.type), name: it.type });
    }
  }
  function skillClassOf(item) { return item && (item.family === 'ballistic' || item.family === 'energy') ? item.family : null; }
  function skillTypeOf(item) { return item && item.type ? typeId(item.type) : null; }

  const api = { SKILL_CLASSES, SKILL_TYPES, skillClassOf, skillTypeOf,
    CONST, DEFAULT_LOADOUT, UNARMED, init, autoInit,
    byId, all, bySlot, quirkPoints, formulaCost,
    normalise, itemsOf, value, bulk, resolve, validate, planForce, foundingArmoury, statPrint, edgeOf,
    squadBulk, equip, equipForce,
    get catalog() { return CATALOG; },
    get quirks() { return QUIRKS; },
    doctrineForCorp(corpId) { return DOCTRINES.find(d => d.corp_id === corpId) || api.doctrine('std_issue'); },
    get doctrines() { return DOCTRINES; },
    tasteScore, shotOf, coverageShare,
    doctrine(id) { return DOCTRINES.find(d => d.id === id) || null; }
  };
  if (isNode) { autoInit(); module.exports = api; }
  global.CDITEMS = api;
})(typeof window !== "undefined" ? window : globalThis);
