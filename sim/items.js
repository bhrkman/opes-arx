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
    KIT_ALLOWANCE_PER_BODY: 2500,   // [H] a standard loadout is 2020, so ~10% of the force
                                    //     can be genuinely upgraded rather than only rearranged
    ALLOWANCE_ESCALATOR: 1.06,      // [H] per season, compounding. The catalog never inflates;
                                    //     the allowance does, so old kit stays honest while more
                                    //     of it becomes fieldable. Read from Step 8 (seasons).

    /* §2.3 bulk */
    SQUAD_BULK_PER_HEAD: 8,         // [C] a standard kit is exactly 8
    OVER_BULK_FATIGUE: 3,           // [C] per point over, per day

    /* §6 energy weapons — declared here, read from 5b-3 */
    HEAT_SHED: 2,                   // [S] per exchange not firing
    VENT_EXCHANGES: 1,              // [S] 2 with vent_2
    CELL_RECHARGE: 24,              // [C] per night at camp

    /* §12 loot — declared here, read from 5b-3. `LOOT_DAMAGE_P` and `REPAIR_COST_FRAC` stood
       beside this one and are DELETED with the gear-damage cut (COMBAT.md §9.2). Neither was
       ever read by any system; their only reader was the check asserting the documents quoted
       them correctly, which is a guard certifying that a number nothing uses is described
       accurately. `REPAIR_COST_FRAC` was additionally declared a second time in `ledger.js`. */
    LOOT_RECOVERY_P: 0.60,          // [C] per item off enemy dead on held ground

    /* §2.4 quotas */
    QUOTA_SATCHEL_PER_BODY: 1,      // [S] Step 9 owns the violation
    QUOTA_CELL_PER_BODY: 1,         // [S]

    FOUNDING_DEPTH: 1.25,           // [H] spares a corp arrives with, over one force's worth
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
    KIT_BUDGET_REFERENCE: 4.8,      // [C] budget-per-body, in caps, at which a corp can
                                    //     comfortably field to the ceiling
    MOD_RESERVE: 0.12,              // [H] share of the allowance kept back for mods/consumables
    MOD_SLOTS: 2,                   // [S] §3
    CONSUMABLE_SLOTS: 2,            // [S] §3
    EXOTIC_PRICE_FLOOR_MULT: 3.0    // [C] cheapest exotic vs dearest formula item
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
  const DEFAULT_LOADOUT = {
    primary: "itm_carbine",
    mods: [],
    sidearm: null,
    armor: "itm_plate_carrier",
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
    QUIRKS = {};
    for (const q of data.quirks) QUIRKS[q.id] = q;
    DOCTRINES = (data.doctrines || []).slice();
    ROLES = (data.roles || []).slice();
    PRICING = data.constants.pricing;
    TIER_MULT = data.constants.TIER_MULT;
    return api;
  }

  function byId(id) { return INDEX[id] || null; }
  function all() { return CATALOG.slice(); }
  function bySlot(slot) { return CATALOG.filter(i => i.slot === slot); }
  function quirkPoints(tags) {
    let p = 0;
    for (const t of tags || []) if (QUIRKS[t]) p += QUIRKS[t].points;
    return p;
  }

  /** §4.3 — regenerate a formula price. The guard diffs this against the data file, so a
      hand-edited cost fails the suite rather than quietly rebalancing the game. */
  function formulaCost(item) {
    const P = PRICING, m = TIER_MULT[String(item.tier)];
    const e = item.effects || {}, qp = quirkPoints(e.tags);
    let raw;
    if (item.slot === "sidearm") raw = P.SIDEARM_BASE + P.SIDEARM_POWER * (e.power || 0) + P.SIDEARM_QUIRK * qp;
    else if (item.slot === "armor") raw = P.ARMOR_BASE + P.PROTECTION_COST * (e.protection || 0)
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
    const tags = (pe.tags || []).slice();
    for (const id of lo.mods) {
      const m = byId(id);
      if (m && m.effects && m.effects.grants) tags.push(m.effects.grants);
    }
    return {
      unarmed: !p,
      /* `id` and `name` are carried so a viewer can say WHICH gun fired. The resolver never
         reads them; the shot log does, and a log that cannot name the weapon is useless for
         judging weapons. */
      weapon: { power: pe.power || 0, range: pe.range || "medium", tier: p ? p.tier : 1,
                id: p ? p.id : null, name: p ? p.name : "unarmed",
                /* the trade this weapon belongs to — combat reads effective aim through it,
                   and the fold has ONE home: skillFamilyOf, above */
                skillFamily: skillFamilyOf(p),
                mobility: pe.mobility || 0, damage: pe.damage || (p ? p.family : "ballistic") },
      armor: { protection: ae.protection || 0, mobility: ae.mobility || 0,
               resist: ae.resist || { ballistic: 0, energy: 0, explosive: 0 } },
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
                     tags: (s.effects || {}).tags || [] } : null,
      family: p ? p.family : "none", tags,
      heat: pe.heat || 0, heatCap: pe.heat_cap || 0, charge: pe.charge || 0,
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
    for (const it of itemsOf(lo)) if (it.legality === "contraband") errs.push(it.id + " is contraband (no acquisition path before Step 9)");
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

  let ROLES = [];
  const roleById = (id) => ROLES.find(r => r.id === id) || null;

  /** Baseline counts scaled to the force, then the doctrine's bias, then reconciled to size. */
  function composition(doctrineId, bodyCount) {
    const d = api.doctrine(doctrineId), bias = (d && d.composition) || {};
    const per8 = ROLES.reduce((s, r) => s + r.share_per_8, 0);
    const squads = Math.max(1, Math.round(bodyCount / 8));
    const counts = {};
    let assigned = 0;
    for (const r of ROLES) {
      const n = Math.round(bodyCount * r.share_per_8 / per8) + (bias[r.id] || 0);
      /* Every SQUAD keeps every role. A doctrine leans by what its people carry, not by
         deleting the marksman — otherwise two of three squads deploy without one. */
      counts[r.id] = Math.max(squads, n);
      assigned += counts[r.id];
    }
    /* reconcile to exactly bodyCount, taking from and giving to `line` first — it is the
       role that absorbs slack in a real squad too. */
    const order = ['line', 'scout', 'point', 'support', 'medic', 'marksman'];
    let i = 0;
    while (assigned !== bodyCount && i < 400) {
      const k = order[i % order.length];
      if (assigned > bodyCount) { if (counts[k] > squads) { counts[k]--; assigned--; } }
      else { counts[k]++; assigned++; }
      i++;
    }
    /* A drop can be smaller than one-of-every-role-per-squad — a spent corp fields five.
       The floor above then jams the loop against its bail-out and the plan arms MORE
       bodies than exist, which no deal downstream can conserve: the extra kit is drawn,
       paid for, and carried by nobody. When the floor is infeasible it gives: trim below
       it, rarest roles first, because a scratch force is riflemen before it is a marksman
       section. Found by probe_plan_stock.cjs counting, not by reading. */
    if (assigned > bodyCount) {
      const trim = order.slice().reverse();
      let j = 0;
      while (assigned > bodyCount && j < 400) {
        const k = trim[j % trim.length];
        if (counts[k] > 0) { counts[k]--; assigned--; }
        j++;
      }
    }
    return counts;
  }

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
  function planForce(doctrineId, bodyCount, opts) {
    opts = (typeof opts === 'number') ? { season: opts } : (opts || {});
    const d = api.doctrine(doctrineId);
    if (!d || !ROLES.length) return null;
    /* Two different numbers, and conflating them was a design error worth naming:
       `allowance` is the Aleas CEILING, shared by every corp and bought by nobody.
       `budget` is treasury credits, which is what actually buys the kit (§14).
       A corp fields min(budget, allowance) — the rich are cap-bound, the poor wallet-bound. */
    const allow = opts.allowance != null ? opts.allowance : allowanceFor(opts.season);
    const budget = Math.max(0, opts.budget || 0);      /* treasury credits for NEW kit */
    const armoury = opts.armoury || foundingArmoury(doctrineId, bodyCount, opts).stock;
    const counts = composition(doctrineId, bodyCount);
    const taste = d.taste || [];
    /* §2.2 — locker depth. A corp does not field what it does not own, however much
       allowance is left. This is the poor corp's real constraint, not thrift. */
    const maxTier = d.armoury_max_tier || 5;
    const owned = (ids) => ids.map(byId).filter(it => it && it.tier <= maxTier).map(it => it.id);

      /* Two phases, and the order matters.
       MUSTER first: every body must leave with a weapon and armor. You cannot deploy a
       fighter with nothing in their hands (ruled) — if the locker and the wallet together
       cannot cover the muster, this function does not invent kit and does not field a
       cripple. It reports a SHORTFALL and stops. Raising that money — liquidating kit,
       selling contracts, borrowing — is the manager's decision at §14, and failing to
       raise it is the OA's ruling, not procurement's.
       UPGRADE second: whatever cash is left buys better, in the doctrine's priority order. */
    const stock = {};
    for (const k in armoury) stock[k] = armoury[k];
    const take = (id) => { if (stock[id] > 0) { stock[id]--; return true; } return false; };
    const give = (id) => { if (id) stock[id] = (stock[id] || 0) + 1; };

    const bodies = [];
    for (const r of ROLES) for (let i = 0; i < (counts[r.id] || 0); i++) bodies.push({ role: r.id, loadout: normalise(UNARMED) });

    let spent = 0, money = budget, cash = 0;
    const bodyCount2 = bodyCount;
    const order = (d.spend_priority || ROLES.map(r => r.id));
    const cheapestOf = (r, listKey) => owned(r[listKey]).map(byId).filter(Boolean).sort((x, y) => x.cost - y.cost);

    /* ---- phase 1: muster from the locker ---- */
    /* Stock costs no money, so exhaust it before opening the wallet. */
    const SLOTS = [['primary', 'primaries'], ['armor', 'armors']];
    for (const roleId of order) for (const b of bodies.filter(x => x.role === roleId)) {
      const r = roleById(b.role);
      for (const [slot, listKey] of SLOTS) {
        /* CHEAPEST available, not best: muster is about arming everyone, and taking the
           good rifles here would spend the cap before the medic gets a medkit. Phase 4
           upgrades from the same locker once the essentials are covered. */
        const cheap = owned(r[listKey]).map(byId).filter(Boolean).sort((x, y) => x.cost - y.cost);
        const got = cheap.find(c => spent + c.cost <= allow && take(c.id));
        if (got) { b.loadout[slot] = got.id; spent += got.cost; }
      }
    }

    /* ---- phase 2: buy what the locker could not cover, once ---- */
    /* Each purchase must leave enough behind to muster everybody still bare, so nobody is
       upgraded into someone else's rifle. Buy the best the reserve allows, not the cheapest
       followed by a replacement — a corp does not buy a gun twice. */
    const bare = () => { const out = []; for (const b of bodies) for (const [slot, listKey] of SLOTS)
      if (!b.loadout[slot]) out.push({ b, slot, listKey }); return out; };
    const floorCost = (roleId, listKey) => {
      const c = owned(roleById(roleId)[listKey]).map(byId).filter(Boolean).sort((x, y) => x.cost - y.cost);
      return c.length ? c[0].cost : Infinity;
    };
    let queue = bare();
    let reserve = queue.reduce((s2, q) => s2 + floorCost(q.b.role, q.listKey), 0);
    let shortfall = 0;
    if (reserve > money) shortfall = reserve - money;
    if (!shortfall) {
      queue.sort((p, q) => order.indexOf(p.b.role) - order.indexOf(q.b.role));
      for (const q of queue) {
        const mine = floorCost(q.b.role, q.listKey);
        reserve -= mine;
        /* Reserve BOTH currencies for the bodies still bare: enough money to buy them
           something, and enough allowance to field it. Reserving only the money let an
           early buyer eat the cap and leave the last man unfieldable. */
        const ceilingHere = Math.min(money - reserve, allow - spent - reserve);
        const ranked = rankBy(owned(roleById(q.b.role)[q.listKey]), taste);
        const fits = ranked.filter(c => spent + c.cost <= allow);
        const pick = fits.find(c => c.cost <= ceilingHere) ||
                     fits.slice().sort((x, y) => x.cost - y.cost)[0] ||
                     ranked.slice().sort((x, y) => x.cost - y.cost)[0];
        money -= pick.cost; cash += pick.cost; spent += pick.cost;
        q.b.loadout[q.slot] = pick.id;
      }
    }
    if (shortfall > 0) {
      for (const b of bodies) { give(b.loadout.primary); give(b.loadout.armor); b.loadout = normalise(UNARMED); }
      return { doctrine: d, mustered: false, shortfall: shortfall, bodies: [], counts: counts,
               allowance: allow, budget: budget, musterCash: reserve, total: 0, unarmed: bodyCount,
               bands: {}, primaries: {}, distinctPrimaries: 0, headroom: allow, spentCash: 0, boundBy: 'muster' };
    }

    /* ---- phase 3: essentials ---- */
    /* One consumable per body before a single upgrade. A squad that spends its last credit
       on a fifth marksman rifle and deploys without a medkit loses people it did not have
       to, and no quartermaster in the fleet buys in that order. */
    for (const roleId of order) {
      const r = roleById(roleId);
      if (!r) continue;
      const cId = (r.consumables || [])[0];
      const c = cId ? byId(cId) : null;
      if (!c) continue;
      for (const b of bodies.filter(x => x.role === roleId)) {
        if (b.loadout.consumables.length) continue;
        if (spent + c.cost > allow) continue;
        if (take(cId)) { b.loadout.consumables = [cId]; spent += c.cost; }
        else if (c.cost <= money) { money -= c.cost; cash += c.cost; b.loadout.consumables = [cId]; spent += c.cost; }
      }
    }

    /* ---- phase 4: upgrade ---- */
    /* Upgrades draw from the LOCKER only. Phase 2 already bought the best the reserve
       allowed; buying a second weapon for the same body would be paying twice for one
       fighter, which no quartermaster does and no invariant should permit. */
    const swap = (b, slot, next) => {
      const prev = b.loadout[slot] ? byId(b.loadout[slot]) : null;
      if (spent - (prev ? prev.cost : 0) + next.cost > gunAllow) return false;
      if (!take(next.id)) return false;
      give(b.loadout[slot]);
      b.loadout[slot] = next.id;
      spent += next.cost - (prev ? prev.cost : 0);
      return true;
    };
    /* RESERVE for mods and consumables. Weapons and armour are bought first and used to eat
       the whole allowance, so mods and consumables were bought with whatever happened to be
       left — which at a 2500/body cap against a 2020 standard loadout was nothing. Two thirds
       of the mod and consumable catalog was therefore unreachable for ECONOMIC reasons even
       once every entry was referenced by a role. A quartermaster does not spend the last
       credit on rifles and then wonder why nobody has a grenade. */
    const gunAllow = Math.round(allow * (1 - CONST.MOD_RESERVE));
    const allowFor = key => (key === 'mods' || key === 'consumables') ? allow : gunAllow;
    for (const slotKey of ['primary', 'armor', 'sidearm']) {
      const listKey = slotKey === 'primary' ? 'primaries' : slotKey === 'armor' ? 'armors' : 'sidearms';
      for (const roleId of order) {
        const r = roleById(roleId);
        if (!r) continue;
        const ranked = rankBy(owned(r[listKey]), taste);
        const crew = bodies.filter(x => x.role === roleId);
        for (let bi = 0; bi < crew.length; bi++) {
          const b = crew[bi];
          const want = (crew.length >= 3 && ranked.length > 1 && bi % 3 === 2) ? ranked[1] : ranked[0];
          if (want && want.id !== b.loadout[slotKey]) swap(b, slotKey, want);
        }
      }
    }

    /* mods are durable, consumables are bought fresh for the drop */
    for (const roleId of order) {
      const r = roleById(roleId);
      if (!r) continue;
      for (const b of bodies.filter(x => x.role === roleId)) {
        for (const modId of (d.mod_wishlist || [])) {
          if (b.loadout.mods.length >= CONST.MOD_SLOTS) break;
          const m = byId(modId);
          if (!m || m.tier > maxTier || b.loadout.mods.includes(modId)) continue;
          const next = Object.assign({}, b.loadout, { mods: b.loadout.mods.concat([modId]) });
          if (validate(next).length || spent + m.cost > allow) continue;
          if (take(modId)) { b.loadout = next; spent += m.cost; }
          else if (m.cost <= money) { money -= m.cost; cash += m.cost; b.loadout = next; spent += m.cost; }
        }
        /* Rank the role's consumables by what this DOCTRINE likes, then fill the slots from
           the top. It used to take the first two entries of the list verbatim, so anything
           further down could never be bought however much a corp wanted it — which is why
           auto-turrets, drone jammers and every tier-5 charge were unreachable even after
           they were added to a role. A hard positional priority is not a preference. */
        const wanted = rankBy(r.consumables, taste).map(c => c.id);
        for (const cId of wanted) {
          if (b.loadout.consumables.length >= CONST.CONSUMABLE_SLOTS) break;
          const c = byId(cId);
          if (!c || spent + c.cost > allow) continue;
          const next = Object.assign({}, b.loadout, { consumables: b.loadout.consumables.concat([cId]) });
          if (validate(next).length) continue;
          if (take(cId)) { b.loadout = next; spent += c.cost; }
          else if (c.cost <= money) { money -= c.cost; cash += c.cost; b.loadout = next; spent += c.cost; }
        }
      }
    }

    const prim = {}, band = {};
    for (const b of bodies) {
      prim[b.loadout.primary] = (prim[b.loadout.primary] || 0) + 1;
      const r = resolve(b.loadout).weapon.range;
      band[r] = (band[r] || 0) + 1;
    }
    return { doctrine: d, bodies, counts, mustered: true, shortfall: 0, unarmed: 0,
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
    if (!d || !ROLES.length) return { stock: {}, value: 0 };
    const depth = opts.depth == null ? CONST.FOUNDING_DEPTH : opts.depth;
    const maxTier = d.armoury_max_tier || 5, taste = d.taste || [];
    const counts = composition(doctrineId, bodyCount);
    const stock = {};
    const add = (id, n) => { if (id) stock[id] = (stock[id] || 0) + n; };
    for (const r of ROLES) {
      const n = counts[r.id] || 0;
      for (const listKey of ['primaries', 'armors', 'sidearms']) {
        const ranked = rankBy((r[listKey] || []).filter(id => { const it = byId(id); return it && it.tier <= maxTier; }), taste);
        if (!ranked.length) continue;
        const main = Math.ceil(n * 2 / 3), alt = n - main;
        add(ranked[0].id, Math.ceil(main * depth));
        if (alt > 0 && ranked[1]) add(ranked[1].id, Math.ceil(alt * depth));
        /* A real locker also holds the old cheap kit — the rifles nobody wants but that
           arm a body when the good ones are spoken for. Muster reaches for these first. */
        const cheapest2 = ranked.slice().sort((a2, b2) => a2.cost - b2.cost)[0];
        /* The junk does NOT thin out with the locker. A poor corp is short of good rifles,
           not of old ones — its problem is quality, not whether everyone has something to
           carry. Scaling this with depth made the two poorest corps fail muster outright
           every Divide, which is the ledger's verdict on a corp that cannot arm itself, not
           something a thin history should cause on its own. */
        add(cheapest2.id, Math.ceil(n * Math.max(1, depth)));
      }
    }
    for (const modId of (d.mod_wishlist || [])) {
      const m = byId(modId);
      if (m && m.tier <= maxTier) add(modId, Math.ceil(bodyCount * 0.5 * depth));
    }
    /* Consumables are single-use, but a corp with a history arrives holding a store of
       them — the locker has grenades and medkits in it, and they deplete rather than
       appearing from nowhere each season. */
    for (const r of ROLES) {
      const n = counts[r.id] || 0;
      for (const cId of (r.consumables || []).slice(0, CONST.CONSUMABLE_SLOTS)) add(cId, Math.ceil(n * depth));
    }
    let value = 0;
    for (const id in stock) value += byId(id).cost * stock[id];
    return { stock, value };
  }

  /** §3 — what it costs to put a weapon and armor on every body. The ledger's question. */
  function musterCost(doctrineId, bodyCount, opts) {
    const p = planForce(doctrineId, bodyCount, Object.assign({}, opts || {}, { budget: 1e9 }));
    return p ? { cash: p.spentCash, fielded: p.total } : null;
  }

  /**
   * §2.2 — THE ALEAS CEILING. One number per corp per season, and it does NOT move with how
   * many bodies you field.
   *
   * This multiplied by `bodyCount` from Step 5 until Step 8.5, which meant a corp fielding
   * sixteen got a ceiling of 40,000 and a corp fielding twenty-four got 60,000 — a flat 2,500
   * a body either way, so there was nothing to concentrate and the small-force build of
   * `SEASONS.md` §4.1 was arithmetically impossible.
   *
   * THAT WAS NEVER DECIDED. The changelog shows `KIT_ALLOWANCE_PER_BODY` moving 2000 → 2050 →
   * 2250 → 2500, and every one of those adjustments reasons about **headroom per body in a full
   * force** — "at 2050 only one body in a squad could be meaningfully upgraded", "widen the
   * window at the top" — with "(54,000 for 24)" written beside it as the derived total. The
   * per-body figure was the unit the cap was TUNED in. It was never a rule that the ceiling
   * shrinks when you bring fewer people.
   *
   * It was invisible for three steps because every corp always fielded exactly 24, and under
   * that assumption `per-body × count` and `a flat corp cap` are the same number. `DROP_MIN`
   * falling to 16 made them different and nobody re-derived it. A formula that was correct
   * under an assumption which later stopped holding, never re-tested because it never failed.
   *
   * So: the ceiling is `KIT_ALLOWANCE_PER_BODY × DROP_MAX`, escalated. Field twenty-four and it
   * is 2,500 each, exactly as before. Field sixteen and it is 3,750 each — you may concentrate
   * what you saved into the people you actually sent, which is what quality-against-quantity
   * means and what S3 has always claimed was on offer.
   */
  function allowanceFor(season) {
    const s = Math.max(1, season || 1);
    return Math.round(CONST.KIT_ALLOWANCE_PER_BODY * Math.pow(CONST.ALLOWANCE_ESCALATOR, s - 1))
           * CONST.DROP_MAX;
  }

  /** The ceiling expressed per body actually fielded — what a planner spends against. */
  function allowancePerBody(bodyCount, season) {
    return allowanceFor(season) / Math.max(1, bodyCount || CONST.DROP_MAX);
  }
  function forceValue(bodies) { return bodies.reduce((s, b) => s + value(b.loadout), 0); }

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
  const SKILL_FAMILIES = [
    { id: 'ballistic_long',   name: 'long ballistics' },
    { id: 'ballistic_medium', name: 'medium ballistics' },
    { id: 'ballistic_close',  name: 'close ballistics' },
    { id: 'energy_long',   name: 'long energy' },
    { id: 'energy_medium', name: 'medium energy' },
    { id: 'energy_close',  name: 'close energy' }
  ];
  function skillFamilyOf(item) {
    if (!item || !item.family) return null;
    /* three ranges, three trades: a long gun, a workhorse at medium, and close-in work.
       Anything not long or medium (i.e. short) reads as close — the same fold as before, now
       with the middle band given its own trade instead of being swept into close. */
    var r = (item.effects || {}).range;
    var range = r === 'long' ? 'long' : r === 'medium' ? 'medium' : 'close';
    return item.family + '_' + range;
  }

  const api = { SKILL_FAMILIES, skillFamilyOf,
    CONST, DEFAULT_LOADOUT, UNARMED, init, autoInit,
    byId, all, bySlot, quirkPoints, formulaCost,
    normalise, itemsOf, value, bulk, resolve, validate, planForce, foundingArmoury, musterCost,
    allowanceFor, allowancePerBody, forceValue, squadBulk, equip, equipForce,
    get catalog() { return CATALOG; },
    get quirks() { return QUIRKS; },
    doctrineForCorp(corpId) { return DOCTRINES.find(d => d.corp_id === corpId) || api.doctrine('std_issue'); },
    get doctrines() { return DOCTRINES; },
    get roles() { return ROLES; },
    composition, tasteScore,
    doctrine(id) { return DOCTRINES.find(d => d.id === id) || null; }
  };
  if (isNode) { autoInit(); module.exports = api; }
  global.CDITEMS = api;
})(typeof window !== "undefined" ? window : globalThis);
