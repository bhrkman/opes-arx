/* Capital Divide — /sim/contest.js  (the Divide rebuild, step c)
 *
 * THE CONTEST ON THE GROUND: movement, sight and noise, and the engine seats' planner over regions.
 * This is the rebuilt Divide's day loop, built beside divide.js and switched in when the table,
 * reserve, captives and settlement are ported (conversion list, item 31). A contact is a fight: the
 * fight is shaped here (who is in it, from which edge, who walks in late, how long it holds the
 * zone, who breaks off where, what becomes of the captured) and resolved by a resolver — the grid,
 * once step e hands it bodies; a stand-in of the same shape until then.
 *
 * The clock is ticks: twelve a day, two hours each. A squad stands in one zone, or is on its way
 * to the next one paying ticks against the step; nobody else's squad stands in its zone. Sight is
 * the zone and its neighbours, a ring more per level of height; hearing is a summed loudness
 * against distance in zones within the region; what a seat tells a squad at a window stands until
 * the next. The wall takes whole regions on the ground's schedule and kills whoever is still in one.
 *
 * Every seat alike: an engine seat's squads and a person's squads run on the same planner; a
 * person's hand is the stances, the briefing at the window and the table (steps d and e).
 *
 * Pure logic. One rng in; the same ground, seed and decisions are the same contest anywhere.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./prng.js") : global.CDPRNG;
  const GROUND = isNode ? require("./ground.js") : global.CDGROUND;

  const CONST = {
    TICKS_A_DAY: 12,                 // [C] two hours a tick
    WINDOW_TICK: 0,                  // [C] a comms window stands at dawn
    /* §NOISE the loudness a squad carries, summed over its bodies, read in zone-rings against a listener */
    LOUD_HOLD: 0.6,                  // [C] a squad standing still, before its bodies are counted
    LOUD_MARCH: 1.0,                 // [C] added while it moves
    LOUD_PER_BODY: 0.22,             // [C] footfall and kit, a body: eight marching on open ground carry three zones
    LOUD_REPORT: 0.5,                // [C] a fighter's weapon report when it fires, unsilenced; a suppressor halves it
    LOUD_FIGHT: 2.0,                 // [C] a fight is the loudest thing a squad does
    LOUD_COVER: 0.75,                // [C] cover and hiding multiply the total; night too
    LOUD_NIGHT: 0.85,                // [C]
    HEAR_AT: 1.0,                    // [C] heard when loudness >= distance in zones × this
    /* §PLAN the engine's planner over regions */
    PLAN_REACH_ROUTES: 2,            // [C] an objective is at most this many regions away
    PLAN_TICK_COST: 1 / 12,          // [C] a day's walk is worth this much of a site's worth
    PLAN_WORTH: { deposit: 3.0, rest: 1.2, strongpoint: 1.6, mast: 1.4, munitions: 1.0, beacon: 0.4, high: 0.5 },   // [C]
    PLAN_MARGIN_DAYS: 2,             // [C] the wall is announced this many days ahead: a region is left, and not walked into, from then
    PLAN_LEAVE_SLACK: 12,            // [C] ticks: a squad leaves when the wall is this close beyond its cheapest way out
    PATH_DETOUR: 6,                  // [C] ticks: a way round a squad in the road is taken only if it is at most this much longer
    PLAN_INWARD_FROM: 8,             // [C] with this few regions standing, everyone drifts inward
    SEEN_ENEMY_W: 1.5,               // [C] a zone a stronger enemy is known to hold is worth this much less
    BRIEF_RINGS: 1,                  // [C] a briefing at the window shows a squad its own and the adjacent regions
    /* §FIGHT a contact is a fight on the grid; the grid's own clock is turns, six to a tick (divide.js) */
    FIGHT_TURNS_PER_TICK: 6,         // [H] grid turns inside one two-hour block
    FIGHT_TICKS_MAX: 6,              // [H] the pile-up: no fight holds a zone longer than half a day, and none runs past a window
    JOIN_TURNS_PER_TICK: 6,          // [C] a neighbour walks in a turn late for every tick its step costs
    HEIGHT_PREP: 0.08,               // [C] readiness edge a level of height gives the side that holds it
    COVER_PREP: 0.06,                // [C] and the side already in cover
    STANCE_WITHDRAW_AT: { preservationist: 0.10, measured: 0.20, standard: 0.35, unyielding: 0.50, death_or_glory: 0.65 },   // [C] mirrors divide.js
    /* §HARASS fire into the next zone from long rifles: picks at a squad that will not close, is weak once rushed */
    HARASS_LONG: 0.25,               // [C] the share of a squad that reaches the next zone, until bodies say which guns
    HARASS_P: 0.05,                  // [C] a long rifle's chance a tick to put a body down across a zone
    HARASS_TICKS: 6,                 // [C] a squad picks at a zone this long before it thinks again
    HARASS_RUSHED_PREP: -0.25,       // [C] a harasser that is rushed is caught at long range with its eye on the next zone
    /* §CAPTIVES decided at the capture: kept ones walk with the squad */
    CAPTIVE_STEP_TICKS: 1,           // [C] a step costs this much more with captives in tow
    CAPTIVE_PREP: -0.04,             // [C] readiness lost to every captive watched in a fight
    CAPTURE_SHARE: 0.35,             // [C] stand-in only: of a broken side's down, the share taken alive when the field is held against it
    STANDIN_HIT: 0.04                // [C] stand-in only: a body's chance a turn to put a body down
  };
  /* the stance dials the planner reads (mirrors divide.js until the switch) */
  const STANCE = {
    preservationist: { seek: 0.15, accept: 0.38, ground: 0.56 },
    measured:        { seek: 0.28, accept: 0.56, ground: 0.71 },
    standard:        { seek: 0.45, accept: 0.75, ground: 0.85 },
    unyielding:      { seek: 0.64, accept: 0.88, ground: 0.96 },
    death_or_glory:  { seek: 0.80, accept: 0.96, ground: 1.00 }
  };

  /* ---------------- opening ---------------- */
  /** `squads`: [{ oa, s, bodies:[{status, silenced?}] or n, stance?, zone }] placed at the drop (one a zone, one a region per OA is the draft's business) */
  function open(rng, ground, squads, opts) {
    opts = opts || {};
    const st = { ground, day: 1, tick: 0, seed: opts.seed || 'contest', squads: [], events: [], log: [], human: opts.human || {}, done: false,
                 audit: { steps: 0, contacts: 0, heard: 0, plans: 0, wall: 0, wallFree: 0, windows: 0 }, _contacts: {} };
    squads.forEach((q, i) => {
      const n = q.bodies ? q.bodies.filter(b => !b.status || b.status === 'active').length : (q.n || 5);
      st.squads.push({ id: i, oa: q.oa, s: q.s, zone: q.zone, n, bodies: q.bodies || null, stance: q.stance || 'standard', long: q.long != null ? q.long : CONST.HARASS_LONG,
                       moving: null, intent: null, know: {}, brief: null, alive: true, rest: 0, visited: [q.zone], fightTicks: 0, fight: null, captives: [], lost: 0 });
    });
    st.fights = []; st.resolve = opts.resolve || standIn; st.allied = opts.allied || ((a, b) => a === b); st.captivePolicy = opts.captivePolicy || captiveByStance;
    st.audit.fights = 0; st.audit.joined = 0; st.audit.harassed = 0; st.audit.captured = 0; st.audit.wiped = 0;
    const taken = {}; for (const q of st.squads) { if (taken[q.zone]) throw new Error('contest: two squads dropped on one zone ' + q.zone); taken[q.zone] = q.id; }
    st.rng = rng;
    return st;
  }
  const r01 = st => st.rng();
  const alive = st => st.squads.filter(q => q.alive);
  const regionOf = (st, q) => st.ground.regions[st.ground.zones[q.zone].region];
  /** §ROAD a squad a tick or more along a route between regions is on the road: it stands in neither zone, holds
      neither, and is seen and heard from the zone it left (a squad once waited a day on a friend sixteen ticks
      out along a route who still 'held' the door) */
  const onRoad = q => !!(q.moving && q.moving.kind === 'route' && q.moving.paid >= 1);
  const holder = (st, zid) => st.squads.find(q => q.alive && q.zone === zid && !onRoad(q));
  const isHuman = (st, oa) => !!st.human[oa];
  function standing(st) { return GROUND.standingOn(st.ground, st.day).map(r => r.id); }
  function deadZone(st, zid) { return goesOn(st, st.ground.zones[zid].region) <= st.day; }
  function goesOn(st, regId) { const t = st.ground.wall.takeAt.find(x => x.region === regId); return t ? t.day : Infinity; }

  /* ---------------- sight and noise ---------------- */
  /** the zones this squad sees from where it stands */
  function sees(st, q) { return GROUND.seenFrom(st.ground, q.zone); }
  /** distance in zones inside a region (null across regions) */
  function zoneDist(st, a, b) {
    const Z = st.ground.zones; if (Z[a].region !== Z[b].region) return null;
    const d = { [a]: 0 }, queue = [a];
    while (queue.length) { const c = queue.shift(); if (c === b) return d[c]; for (const n of Z[c].nb) if (d[n] == null) { d[n] = d[c] + 1; queue.push(n); } }
    return null;
  }
  /** what a squad sounds like this tick */
  function loudness(st, q) {
    let L = CONST.LOUD_HOLD + CONST.LOUD_PER_BODY * q.n + (q.moving ? CONST.LOUD_MARCH : 0) + (q.fightTicks > 0 ? CONST.LOUD_FIGHT : 0);
    if (q.firing) L += q.firing * CONST.LOUD_REPORT;    /* set by the fight step (d): bodies that fired, suppressors counted as half */
    const z = st.ground.zones[q.zone];
    if (z.cover >= 1) L *= CONST.LOUD_COVER;
    if (z.hiding < 1) L *= z.hiding;
    if (st.night) L *= CONST.LOUD_NIGHT;
    return L;
  }
  /** a listener's hearing: every other squad in its region whose loudness reaches it */
  function hears(st, q) {
    const out = [];
    for (const o of alive(st)) { if (o === q || o.oa === q.oa) continue; const d = zoneDist(st, q.zone, o.zone); if (d == null) continue; if (loudness(st, o) >= d * CONST.HEAR_AT) out.push({ squad: o, dist: d, loud: loudness(st, o) }); }
    return out;
  }
  /** refresh a squad's knowledge from sight, hearing and its briefing */
  function perceive(st, q) {
    const seen = sees(st, q), now = st.day * CONST.TICKS_A_DAY + st.tick;
    for (const zid of seen) { const h = holder(st, zid); q.know[zid] = { at: now, oa: h && h.oa !== q.oa ? h.oa : null, n: h && h.oa !== q.oa ? h.n : 0, how: 'seen' }; }
    for (const hd of hears(st, q)) { if (seen.indexOf(hd.squad.zone) >= 0) continue; q.know[hd.squad.zone] = { at: now, oa: null, n: Math.round(hd.loud / CONST.LOUD_PER_BODY / 2), how: 'heard' }; st.audit.heard++; }
  }
  /** the briefing a seat gives at the window: the overview of the squad's own and adjacent regions */
  function brief(st, q) {
    const reg = regionOf(st, q), regs = [reg.id].concat(reg.links.map(l => l.to));
    const now = st.day * CONST.TICKS_A_DAY + st.tick, known = {};
    for (const o of alive(st)) { if (o.oa === q.oa) continue; const rid = st.ground.zones[o.zone].region; if (regs.indexOf(rid) >= 0) known[o.zone] = { at: now, oa: o.oa, n: o.n, how: 'briefed' }; }
    q.brief = { until: nextWindowDay(st), known };
    Object.assign(q.know, known);
  }
  function nextWindowDay(st) { for (let d = st.day + 1; d <= st.ground.days + 1; d++) if (GROUND.isWindowDay(st.ground, d)) return d; return st.ground.days + 1; }

  /* ---------------- the planner, over regions ---------------- */
  /** what a group knows about a zone: the freshest of its squads' knowledge */
  function groupKnows(group, zid) { let best = null; for (const q of group) { const k = q.know[zid]; if (k && (!best || k.at > best.at)) best = k; } return best; }
  function plan(st, oa, opts) {
    const G = st.ground, mine = alive(st).filter(q => q.oa === oa);
    const byRegion = {}; for (const q of mine) (byRegion[G.zones[q.zone].region] = byRegion[G.zones[q.zone].region] || []).push(q);
    const left = standing(st).length;
    for (const rid in byRegion) planGroup(st, oa, byRegion[rid], +rid, left, opts || {});
  }
  /** the cheapest way out of a group's region, over its squads, to any route's far end on ground that stands */
  function exitTicks(st, group) {
    const G = st.ground, reg = G.regions[G.zones[group[0].zone].region]; let best = Infinity;
    for (const q of group) for (const l of reg.links) { if (goesOn(st, l.to) <= goesOn(st, reg.id)) continue;
      const p = GROUND.ticksBetween(G, q.zone, l.at, { avoid: v => deadZone(st, v) }); if (p && p.ticks < best) best = p.ticks; }
    return best;
  }
  function planGroup(st, oa, group, rid, left, opts) {
    const G = st.ground, dial = STANCE[group[0].stance] || STANCE.standard;
    const force = group.reduce((t, q) => t + q.n, 0);
    /* §PRESSED pressed is the wall against the real way out: a region whose one exit is sixteen ticks off
       presses two days sooner than one whose exit is three */
    const goes = goesOn(st, rid), ticksLeft = (goes - st.day) * CONST.TICKS_A_DAY - st.tick;
    const pressed = goes !== Infinity && (goes - st.day <= CONST.PLAN_MARGIN_DAYS || ticksLeft <= exitTicks(st, group) + CONST.PLAN_LEAVE_SLACK);   /* the announcement, or the way out against the clock */
    /* the regions in reach: this one and up to PLAN_REACH_ROUTES routes out */
    const reach = { [rid]: 0 }, edge = [rid];
    for (let k = 0; k < CONST.PLAN_REACH_ROUTES; k++) { const nxt = []; for (const r of edge) for (const l of G.regions[r].links) if (reach[l.to] == null) { reach[l.to] = k + 1; nxt.push(l.to); } edge.splice(0, edge.length, ...nxt); }
    const cands = [];
    for (const r in reach) {
      const reg = G.regions[+r], rg = goesOn(st, reg.id);
      if (rg <= st.day + CONST.PLAN_MARGIN_DAYS && reg.id !== G.wall.last) continue;   /* not worth walking into */
      for (const zid of reg.zones) {
        const z = G.zones[zid];
        let worth = 0;
        if (z.site && z.site.kind !== 'beacon') { if (z.site.kind === 'deposit') { if (z.site.opens <= st.day + 1) worth += CONST.PLAN_WORTH.deposit + (z.site.units || 0) * 0.3; } else worth += CONST.PLAN_WORTH[z.site.kind] || 0; }
        if (z.height >= 1) worth += CONST.PLAN_WORTH.high * z.height;
        if (left <= CONST.PLAN_INWARD_FROM || pressed) worth += (G.days + 2 - rg) <= 0 ? 0 : Math.min(3, (rg - st.day) / 6);   /* late, ground that lasts is worth something */
        const own = group.some(q => q.zone === zid) || st.squads.some(q => q.alive && q.oa === oa && q.zone === zid && group.indexOf(q) < 0);
        if (own) continue;
        const k = groupKnows(group, zid);
        if (k && k.oa && k.oa !== oa) { if (k.n > force * dial.accept || pressed) worth -= CONST.SEEN_ENEMY_W * (pressed ? 2 : 1); else worth += dial.seek * 0.8; }
        if (worth <= 0 && !pressed) continue;
        cands.push({ zid, worth, reg: reg.id });
      }
    }
    /* mid-day (after a contact) only the squads turned back think again; the rest keep their way, and their
       objectives stay taken */
    /* an order from the seat (why 'order') stands until it is carried out or the seat changes it */
    const again = q => !(q.intent && q.intent.why === 'order' && (q.intent.type !== 'take' || q.intent.zone !== q.zone)) && (!opts.only || (q.intent && opts.only.indexOf(q.intent.why) >= 0));
    const taken = {};
    for (const q of group) if (!again(q) && q.intent && q.intent.type === 'take') taken[q.intent.zone] = true;
    if (!cands.length && !pressed) { for (const q of group) if (again(q)) q.intent = { type: 'hold', zone: q.zone }; return; }
    /* each squad takes the best objective by worth less the walk; two squads of one group do not take one zone */
    const order = group.slice().sort((a, b) => b.n - a.n).filter(again).filter(q => !onRoad(q) && q.fight == null);   /* one on the road finishes its road; one in a fight finishes its fight */
    for (const q of order) {
      let best = null, bestV = -Infinity;
      for (const c of cands) {
        if (taken[c.zid]) continue;
        if (q.shut && q.shut[c.zid] === st.day) continue;   /* a zone it was turned back from today is not tried again today */
        const path = GROUND.ticksBetween(G, q.zone, c.zid, { avoid: v => deadZone(st, v) || (v !== c.zid && !!holder(st, v) && holder(st, v).oa !== oa) });   /* friends are passed when they move; the way waits for them */
        if (!path) continue;
        if (pressed && c.reg !== rid && path.ticks > ticksLeft - 1) continue;   /* it would not get there */
        const v = c.worth - path.ticks * CONST.PLAN_TICK_COST / Math.max(0.3, dial.ground) + (pressed && c.reg !== rid ? 2 : 0);
        if (v > bestV) { bestV = v; best = { zid: c.zid, path }; }
      }
      const before = q.intent && q.intent.type === 'take' ? q.intent.zone : null;
      if (!best && pressed && goesOn(st, rid) !== Infinity) {
        /* nothing it can reach: the nearest door out, whoever stands in it; a friend makes way, a rival is a contact */
        let door = null, dT = Infinity;
        for (const l of G.regions[rid].links) { if (goesOn(st, l.to) <= goesOn(st, rid) || (q.shut && q.shut[l.at] === st.day)) continue;
          const p = GROUND.ticksBetween(G, q.zone, l.at, { avoid: v => deadZone(st, v) }); if (p && p.ticks < dT) { dT = p.ticks; door = { zid: l.at, path: p }; } }
        if (door) { best = door; bestV = 0; }
      }
      if (best && (bestV > 0 || pressed)) { taken[best.zid] = true; q.intent = { type: 'take', zone: best.zid, why: pressed ? 'the wall' : 'the ground' }; st.audit.plans++; }
      else {
        /* nothing worth walking to: a known rival next door it will not close with is picked at from here */
        const nb = st.ground.zones[q.zone].nb.find(v => { const k = q.know[v], h = holder(st, v); return k && k.oa && !st.allied(k.oa, oa) && h && !st.allied(h.oa, oa) && h.fight == null && k.n > q.n * dial.accept && !(q.harass && q.harass.zone === v && q.harass.ticks >= CONST.HARASS_TICKS); });
        q.intent = nb != null && !pressed ? { type: 'harass', zone: nb, why: 'picking' } : { type: 'hold', zone: q.zone };
        if (q.intent.type !== 'harass') q.firing = 0;
      }
      if (before !== (q.intent.type === 'take' ? q.intent.zone : null)) { q.path = null; q.wait = 0; }   /* a new aim is a new way */
    }
  }

  /* ---------------- movement ---------------- */
  function stepOf(st, q, to) {
    const G = st.ground, z = G.zones[q.zone];
    if (z.nb.indexOf(to) >= 0) return { to, cost: G.regions[z.region].ticks, kind: 'step' };
    const l = G.regions[z.region].links.find(x => x.from === q.zone && x.at === to);
    if (l) return { to, cost: l.ticks, kind: 'route' };
    return null;
  }
  /** ground a way may not cross: dead ground, and ground that goes within the margin unless it is where the squad
      stands or where it is going (a blocked step once sent a squad back through its dying region on a sixteen-tick route) */
  function offLimits(st, q, target, v) {
    const Z = st.ground.zones, r = Z[v].region;
    return deadZone(st, v) || (r !== Z[q.zone].region && r !== Z[target].region && goesOn(st, r) <= st.day + CONST.PLAN_MARGIN_DAYS);
  }
  function pathFor(st, q, target) {
    /* the way past everybody if it is not much longer than the way through them; else past rivals only, friends
       waited on; else straight through, and the rival in the way is a contact (a squad once walked sixteen steps
       round three regions to avoid a rival three ticks off) */
    const direct = GROUND.ticksBetween(st.ground, q.zone, target, { avoid: v => offLimits(st, q, target, v) });
    if (!direct) return null;
    const near = p => p && p.ticks <= direct.ticks + CONST.PATH_DETOUR;
    let path = GROUND.ticksBetween(st.ground, q.zone, target, { avoid: v => offLimits(st, q, target, v) || (holder(st, v) && v !== target) });
    if (!near(path)) path = GROUND.ticksBetween(st.ground, q.zone, target, { avoid: v => { const o = holder(st, v); return offLimits(st, q, target, v) || !!(o && o.oa !== q.oa && v !== target); } });
    if (!near(path)) path = direct;
    return path && path.path.length >= 2 ? path.path.slice(1) : null;
  }
  function move(st, q) {
    if (!q.alive) return;
    if (q.rest > 0) { q.rest--; return; }
    if (q.moving) {
      if (q.moving.paid < q.moving.cost) q.moving.paid++;
      if (q.moving.paid < q.moving.cost) return;
      const to = q.moving.to, h = holder(st, to);
      if (deadZone(st, to)) { q.moving = null; q.intent = null; q.path = null; return; }   /* the ground it was walking to is gone */
      if (h && !st.allied(h.oa, q.oa)) {
        /* §CONTACT the zone is held against it: a fight, there and then, unless one is already on in that zone,
           in which case it waits at the edge for the end of it */
        const key = q.id + ':' + h.id + ':' + st.day; q.metToday = true;
        if (!st._contacts[key]) { st._contacts[key] = 1; st.events.push({ t: 'contact', day: st.day, tick: st.tick, zone: to, mover: q.id, holder: h.id, oas: [q.oa, h.oa] }); st.audit.contacts++; }
        if (h.fight != null) { q.moving.paid = q.moving.cost; q.intent = { type: 'hold', zone: q.zone, why: 'contact', at: to }; return; }
        openFight(st, q, h, to);
        return;
      }
      if (h && st.allied(h.oa, q.oa)) {
        /* a friend stands there: wait for it to move on, unless a way around it is open; two friends each
           bound for the other's zone pass each other */
        q.moving.paid = q.moving.cost;
        if (h.moving && h.moving.to === q.zone && h.moving.paid >= h.moving.cost) { h.zone = q.zone; q.zone = to; h.moving = null; q.moving = null; q.visited.push(to); h.visited.push(h.zone); st.audit.steps += 2;
          if (q.path && q.path[0] === to) q.path.shift(); if (h.path && h.path[0] === h.zone) h.path.shift(); return; }
        if (q.intent && to !== q.intent.zone) {
          const around = GROUND.ticksBetween(st.ground, q.zone, q.intent.zone, { avoid: v => deadZone(st, v) || (!!holder(st, v) && v !== q.intent.zone) });
          if (around && around.path.length >= 2) { q.moving = null; q.path = around.path.slice(1); return; }
        }
        /* no way around: a friend standing still in the door makes way, to the nearest free zone of its own */
        if (!h.moving && (!h.intent || h.intent.type !== 'take' || h.intent.zone === h.zone) && !(h.intent && h.intent.why === 'contact')) {   /* not one stopped at a rival's door */
          const aside = st.ground.zones[h.zone].nb.filter(v => !deadZone(st, v) && !holder(st, v)).sort((a, b) => a - b)[0];
          if (aside != null) { h.intent = { type: 'take', zone: aside, why: 'making way' }; h.path = null; h.wait = 0; }
        }
        return;
      }
      st.events.push({ t: 'move', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to, kind: q.moving.kind });
      q.zone = to; q.moving = null; q.visited.push(to); st.audit.steps++;
      if (q.harass) q.harass = null;
      /* out of a dying region and at its door: it thinks again within the day, so the door is not held against the friends behind it */
      if (q.intent && q.intent.type === 'take' && q.intent.zone === to && q.intent.why === 'the wall') q.intent = { type: 'hold', zone: to, why: 'arrived' };
      if (q.path && q.path[0] === to) q.path.shift();
      return;
    }
    if (q.intent && q.intent.type === 'harass') { harass(st, q); return; }
    if (!q.intent || q.intent.type !== 'take' || q.intent.zone === q.zone) { q.path = null; return; }
    /* §ROUTES A SQUAD KEEPS TO ITS WAY. The path is found once and followed, and found again only when a step of it
       is held or gone: found afresh every step, the cheapest way flipped as others moved and a squad walked back
       and forth between two zones until the wall took it. */
    const target = q.intent.zone;
    const next = q.path && q.path.length ? q.path[0] : null;
    const hNext = next != null ? holder(st, next) : null;
    const blocked = next != null && (deadZone(st, next) || (hNext && hNext.oa !== q.oa && next !== target) || !stepOf(st, q, next));
    if (next == null || blocked) q.path = pathFor(st, q, target);
    if (!q.path || !q.path.length) { if (!q.wait) q.wait = 0; if (++q.wait > 6) { q.intent = { type: 'hold', zone: q.zone }; q.wait = 0; } return; }
    q.wait = 0;
    const stp = stepOf(st, q, q.path[0]); if (!stp) { q.path = null; return; }
    q.moving = { to: stp.to, paid: 1, cost: stp.cost + (q.captives.length ? CONST.CAPTIVE_STEP_TICKS : 0), kind: stp.kind };
    if (stp.kind === 'route') st.events.push({ t: 'road', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to: stp.to });   /* on the road: in neither zone till it arrives */
  }

  /* ---------------- fights ---------------- */
  /** §FIGHT A CONTACT IS A FIGHT. The mover is at the holder's edge; the fight is on the holder's zone, and the
      grid is fed what the zone is: its region's terrain, its cover, its height against the comers', night. Every
      squad comes on from the edge that faces the zone it came from; squads of one banner that came from different
      sides flank. Neighbours in the zones next door walk in late, a turn for every tick their step costs, if they
      will — their own banner's fight pulls them, a stranger's draws by the seek dial. The fight is resolved when it
      opens (a squad decides on the sound of shooting, not on how long it turns out to last) and holds the zone for
      as many ticks as it ran, never past the window at dawn. At its end the beaten break off a zone back together,
      the winner holds the ground, and the captured are decided then and there. */
  const absTick = st => st.day * CONST.TICKS_A_DAY + st.tick;
  function bearingOf(st, from, to) { const A = st.ground.zones[from], B = st.ground.zones[to]; return Math.atan2(B.y - A.y, B.x - A.x); }
  function ticksToWindow(st) { for (let d = st.day + 1; d <= st.ground.days + 1; d++) if (GROUND.isWindowDay(st.ground, d)) return (d - st.day) * CONST.TICKS_A_DAY - st.tick; return CONST.TICKS_A_DAY; }
  function prepOf(st, q, zone, holdsIt) {
    const z = st.ground.zones[zone], from = st.ground.zones[q.zone];
    let p = 0.5 + CONST.HEIGHT_PREP * ((holdsIt ? z.height : from.height) - (holdsIt ? from.height : z.height)) + (holdsIt && z.cover >= 1 ? CONST.COVER_PREP : 0);
    p += CONST.CAPTIVE_PREP * q.captives.length;
    if (q.harass && q.harass.rushed) p += CONST.HARASS_RUSHED_PREP;
    return Math.max(0, Math.min(1, p));
  }
  function openFight(st, mover, held, zone) {
    const f = { id: st.fights.length, zone, region: st.ground.zones[zone].region, day: st.day, tick: st.tick, sides: [], joiners: [], done: false };
    const sideFor = oa => { let S = f.sides.find(x => st.allied(x.oa, oa)); if (!S) { S = { tag: String.fromCharCode(65 + f.sides.length), oa, squads: [] }; f.sides.push(S); } return S; };
    /* a squad that came by road fights from the road's end and stands in neither zone till it is over */
    const put = (q, from, late) => { const S = sideFor(q.oa); S.squads.push({ id: q.id, from, bearing: from === zone ? null : bearingOf(st, from, zone), prep: prepOf(st, q, zone, from === zone), atTurn: late || 1, n: q.n, stance: q.stance }); q.fight = f.id; if (onRoad(q)) q.moving.paid = q.moving.cost; else q.moving = null; q.path = null; };
    put(held, zone); put(mover, mover.zone);
    /* the neighbours: anybody in a zone next door, not in a fight, not on the road, not pressed by the wall */
    const Z = st.ground.zones;
    for (const nb of Z[zone].nb) { const o = holder(st, nb); if (!o || o === mover || o.fight != null || onRoad(o)) continue;
      if (o.intent && (o.intent.why === 'the wall' || o.intent.why === 'order')) continue;   /* pressed, or under orders */
      const dial = STANCE[o.stance] || STANCE.standard, friend = f.sides.some(S => st.allied(S.oa, o.oa));
      const foe = f.sides.filter(S => !st.allied(S.oa, o.oa)).reduce((t, S) => t + S.squads.reduce((u, x) => u + x.n, 0), 0);
      const want = friend ? 0.9 : (foe <= o.n * dial.accept * 1.5 ? dial.seek : dial.seek * 0.4);
      if (r01(st) >= want) continue;
      const cost = st.ground.regions[Z[nb].region].ticks;
      put(o, nb, 1 + cost * CONST.JOIN_TURNS_PER_TICK); f.joiners.push(o.id); st.audit.joined++; }
    f.ctx = { terrain: st.ground.regions[f.region].terrain, cover: Z[zone].cover, height: Z[zone].height, night: st.night, day: st.day,
              prep: f.sides.map(S => S.squads[0].prep), bearings: f.sides.map(S => S.squads[0].bearing) };
    const res = st.resolve(st, f, st.rng);
    f.res = res;
    const ticks = Math.max(1, Math.min(CONST.FIGHT_TICKS_MAX, ticksToWindow(st), Math.ceil((res.turns || 1) / CONST.FIGHT_TURNS_PER_TICK)));
    f.ticks = ticks; f.until = absTick(st) + ticks;
    for (const S of f.sides) for (const x of S.squads) { const q = st.squads[x.id]; q.fightTicks = ticks; q.intent = { type: 'fight', zone, why: 'contact' }; }
    st.fights.push(f); st.audit.fights++;
    st.events.push({ t: 'fight', day: st.day, tick: st.tick, zone, fight: f.id, sides: f.sides.map(S => ({ oa: S.oa, squads: S.squads.map(x => x.id) })), ticks, turns: res.turns });
  }
  /** the fight's end: losses booked, the beaten off a zone back, the winner on the ground, the captured decided */
  function settleFight(st, f) {
    const res = f.res, Z = st.ground.zones, winner = res.winner != null ? f.sides.find(S => S.tag === res.winner) : null;
    f.done = true;
    const wiped = [];
    for (const S of f.sides) for (const x of S.squads) {
      const q = st.squads[x.id], r = (res.squads && res.squads[q.id]) || { dead: 0, down: 0, captured: 0 };
      const gone = (r.dead || 0) + (r.down || 0) + (r.captured || 0);
      q.n = Math.max(0, q.n - gone); q.lost += gone; q.fight = null; q.fightTicks = 0; q.harass = null; q.moving = null;
      if (r.captured && winner && winner !== S) takeCaptives(st, winner, q, r.captured, f);
      if (q.n <= 0) { q.alive = false; wiped.push(q); st.audit.wiped++; st.events.push({ t: 'wiped', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, zone: f.zone, by: winner ? winner.oa : null });
        /* wiping a holder passes its captives to the wiper */
        if (winner && q.captives.length) { const w = st.squads[winner.squads[0].id]; if (w.alive) { w.captives = w.captives.concat(q.captives); st.events.push({ t: 'captives_pass', day: st.day, from: q.id, to: w.id, n: q.captives.length }); } q.captives = []; }
      }
    }
    /* who stands where: the winner's lead squad on the zone, the rest of it and the beaten back where they came from,
       together: a beaten group shares its line of retreat */
    const live = S => S.squads.map(x => st.squads[x.id]).filter(q => q.alive);
    const back = (q, from) => { let to = from;
      const other = v => st.squads.some(o => o.alive && o !== q && o.zone === v && !onRoad(o));
      if (to === f.zone || deadZone(st, to) || other(to)) to = nearestFree(st, f.zone, q);
      if (to == null) {
        /* beaten with nowhere to break to: overrun, and every body still standing is a captive of the winner */
        q.alive = false; st.audit.wiped++; st.events.push({ t: 'wiped', day: st.day, squad: q.id, oa: q.oa, zone: f.zone, by: winner ? winner.oa : null, how: 'overrun' });
        if (winner) takeCaptives(st, winner, q, q.n, f); q.n = 0; return;
      }
      if (to !== q.zone) { st.events.push({ t: 'move', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to, kind: 'break' }); q.zone = to; q.visited.push(to); }
      q.intent = { type: 'hold', zone: to, why: 'beaten' }; q.shut = q.shut || {}; q.shut[f.zone] = st.day; };
    const holderNow = holder(st, f.zone);
    if (winner) {
      const ws = live(winner).sort((a, b) => b.n - a.n);
      for (const S of f.sides) if (S !== winner) for (const q of live(S)) { if (q.zone === f.zone) q.zone = -1; }   /* off the ground first */
      for (const S of f.sides) if (S !== winner) for (const q of live(S)) { const x = S.squads.find(y => y.id === q.id); if (q.zone === -1) q.zone = f.zone; back(q, x.from === f.zone ? f.zone : x.from); }
      ws.forEach((q, i) => { const x = winner.squads.find(y => y.id === q.id);
        if (i === 0) { if (q.zone !== f.zone) { st.events.push({ t: 'move', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to: f.zone, kind: 'took' }); q.zone = f.zone; q.visited.push(f.zone); } q.intent = { type: 'hold', zone: f.zone, why: 'won' }; }
        else back(q, x.from); });
    } else {
      /* everyone broke, or nobody: each side back the way it came; the holder keeps the ground only if it stood */
      for (const S of f.sides) for (const q of live(S)) { const x = S.squads.find(y => y.id === q.id); if (x.from === f.zone && holderNow === q) { q.intent = { type: 'hold', zone: q.zone, why: 'stood' }; continue; } back(q, x.from); }
    }
    for (const S of f.sides) for (const q of live(S)) if (q.intent && q.intent.type === 'hold') plan(st, q.oa, { only: [q.intent.why] });
    st.events.push({ t: 'fight_over', day: st.day, tick: st.tick, fight: f.id, zone: f.zone, winner: winner ? winner.oa : null, result: res.result || null });
  }
  function nearestFree(st, zone, q) {
    const Z = st.ground.zones, d = { [zone]: 0 }, queue = [zone];
    while (queue.length) { const c = queue.shift(); if (c !== zone && !deadZone(st, c) && !st.squads.some(o => o.alive && o !== q && o.zone === c && !onRoad(o))) return c;
      const outs = Z[c].nb.concat(st.ground.regions[Z[c].region].links.filter(l => l.from === c).map(l => l.at));
      for (const n of outs) if (d[n] == null) { d[n] = d[c] + 1; queue.push(n); } }
    return null;
  }
  /** §CAPTIVES decided at the capture, one by one, by the captor's seat: killed, kept or let go. Keeping costs a
      tick a step and attention in a fight (and rations, step e); an execution costs standing and sparing warms the
      other banner (step e prices both; the events carry it) */
  function takeCaptives(st, winner, from, n, f) {
    const w = st.squads[winner.squads[0].id]; if (!w || !w.alive) return;
    for (let i = 0; i < n; i++) {
      const fate = st.captivePolicy(st, w, from, f) || 'keep';
      st.audit.captured++;
      st.events.push({ t: 'captive', day: st.day, tick: st.tick, zone: f.zone, captor: w.id, captorOa: w.oa, from: from.id, fromOa: from.oa, fate });
      if (fate === 'keep') w.captives.push({ oa: from.oa, squad: from.id, day: st.day });
    }
  }
  function captiveByStance(st, captor, from) {
    const s = captor.stance; return s === 'death_or_glory' ? 'kill' : (s === 'preservationist' || s === 'measured') ? 'release' : 'keep';
  }
  /** §HARASS fire from the next zone: a squad that will not close picks at one that holds; it is loud, it is seen,
      and the squad under it may rush — a harasser rushed is caught looking the wrong way */
  function harass(st, q) {
    const tgt = q.intent.zone, h = holder(st, tgt);
    if (!h || st.allied(h.oa, q.oa) || st.ground.zones[q.zone].nb.indexOf(tgt) < 0 || h.fight != null) { q.intent = { type: 'hold', zone: q.zone, why: 'harass_done' }; q.harass = null; q.firing = 0; return; }
    q.harass = q.harass || { zone: tgt, ticks: 0, hits: 0 }; q.harass.ticks++;
    const rifles = Math.max(1, Math.round(q.n * q.long)); q.firing = rifles;
    let hits = 0; for (let i = 0; i < rifles; i++) if (r01(st) < CONST.HARASS_P) hits++;
    if (hits) { h.n = Math.max(0, h.n - hits); h.lost += hits; q.harass.hits += hits; st.events.push({ t: 'harass', day: st.day, tick: st.tick, from: q.id, oa: q.oa, zone: tgt, on: h.id, hits });
      if (h.n <= 0) { h.alive = false; st.audit.wiped++; st.events.push({ t: 'wiped', day: st.day, tick: st.tick, squad: h.id, oa: h.oa, zone: tgt, by: q.oa, how: 'picked off' }); } }
    st.audit.harassed++;
    h.know[q.zone] = { at: absTick(st), oa: q.oa, n: q.n, how: 'fired on' };
    /* the squad under fire: by its dial it rushes the rifles or holds; a rush is a contact at the harasser's zone */
    if (h.alive && !h.moving && !(h.intent && h.intent.type === 'fight')) {
      const dial = STANCE[h.stance] || STANCE.standard;
      if (q.n <= h.n * dial.accept * 1.3 && r01(st) < dial.seek + 0.3) { q.harass.rushed = true; h.intent = { type: 'take', zone: q.zone, why: 'rushing' }; h.path = [q.zone]; }
    }
    if (q.harass.ticks >= CONST.HARASS_TICKS) { q.intent = { type: 'hold', zone: q.zone, why: 'harass_done' }; q.firing = 0; }
  }
  /** §STANDIN the resolver of the same shape as the grid, until step e hands it bodies: sides trade hits a turn by
      strength and readiness; a side breaks at its stance's share down; the field is held by the last side standing */
  function standIn(st, f, rng) {
    const sides = f.sides.map(S => ({ tag: S.tag, n: S.squads.reduce((t, x) => t + x.n, 0), start: 0, down: 0, in: S.squads.map(x => ({ id: x.id, n: x.n, at: x.atTurn, down: 0, with: CONST.STANCE_WITHDRAW_AT[x.stance] || 0.35, prep: x.prep })), broke: false }));
    for (const S of sides) { S.start = S.n; S.n = 0; }
    let turn = 0; const maxTurns = CONST.FIGHT_TICKS_MAX * CONST.FIGHT_TURNS_PER_TICK;
    while (++turn <= maxTurns) {
      for (const S of sides) S.n = S.in.filter(x => x.at <= turn).reduce((t, x) => t + Math.max(0, x.n - x.down), 0);
      const up = sides.filter(S => !S.broke && S.n > 0); if (up.length <= 1) break;
      for (const S of up) { const foes = up.filter(o => o !== S); if (!foes.length) continue;
        const prep = S.in.reduce((t, x) => t + x.prep, 0) / S.in.length;
        for (const x of S.in) { if (x.at > turn) continue; for (let b = 0; b < x.n - x.down; b++) if (rng() < CONST.STANDIN_HIT * (0.7 + 0.6 * prep)) {
          const T = foes[Math.floor(rng() * foes.length)], ys = T.in.filter(y => y.at <= turn && y.n - y.down > 0); if (!ys.length) continue;
          ys[Math.floor(rng() * ys.length)].down++; } } }
      for (const S of sides) { const here = S.in.filter(x => x.at <= turn); const d = here.reduce((t, x) => t + x.down, 0), n0 = here.reduce((t, x) => t + x.n, 0);
        if (n0 && here.length && d / n0 >= Math.min.apply(null, here.map(x => x.with))) S.broke = true; }
    }
    const standingSides = sides.filter(S => !S.broke && S.in.some(x => x.n - x.down > 0));
    const winner = standingSides.length === 1 ? standingSides[0].tag : null;
    const squads = {};
    for (const S of sides) for (const x of S.in) { const held = winner && winner !== S.tag; let cap = 0; if (held) for (let i = 0; i < x.down; i++) if (rng() < CONST.CAPTURE_SHARE) cap++;
      const dead = Math.round((x.down - cap) * 0.45); squads[x.id] = { dead, down: x.down - cap - dead, captured: cap }; }
    return { turns: turn, winner, result: winner ? 'won_' + winner : 'disengage_both', squads };
  }

  /* ---------------- the clock ---------------- */
  function tick(st) {
    if (st.done) return;
    const G = st.ground;
    if (st.tick === 0) {
      /* dawn: the wall, then the window, then the plans */
      for (const t of G.wall.takeAt) if (t.day === st.day) {
        for (const q of alive(st)) if (G.zones[q.zone].region === t.region) { q.alive = false; st.events.push({ t: 'wall', day: st.day, squad: q.id, oa: q.oa, region: t.region, free: !!q.freeWay && !q.metToday }); st.audit.wall++; if (q.freeWay && !q.metToday) st.audit.wallFree = (st.audit.wallFree || 0) + 1; }
        st.events.push({ t: 'region_gone', day: st.day, region: t.region });
      }
      if (GROUND.isWindowDay(G, st.day)) {
        st.audit.windows++; st.events.push({ t: 'window', day: st.day, next: GROUND.nextToGo(G, st.day) });
        for (const q of alive(st)) brief(st, q);   /* every seat briefs its squads with the broadcast; a person's seat the same (step e lets him choose) */
      }
      /* §FREEWAY the audit's question of every catch: at the last dawn, was there a way out past nobody, and did
         nobody then stand in its way? a catch with a free way is the planner's fault; one without is the fight
         step's (d) to settle */
      for (const q of alive(st)) { const rid = G.zones[q.zone].region; q.freeWay = false; q.metToday = false;
        if (goesOn(st, rid) === st.day + 1 && !onRoad(q)) for (const l of G.regions[rid].links) { if (goesOn(st, l.to) <= st.day + 1) continue;
          const p = GROUND.ticksBetween(G, q.zone, l.at, { avoid: v => deadZone(st, v) || !!holder(st, v) });
          if (p && p.ticks <= CONST.TICKS_A_DAY - 1) { q.freeWay = true; break; } } }
      for (const oa of oasOf(st)) plan(st, oa);
    } else if (st.tick % 4 === 0) {
      /* a squad stopped by a contact thinks again within the day, not at the next dawn: pressed by the wall, a day's
         wait was death */
      const again = ['contact', 'arrived', 'beaten', 'won', 'stood', 'harass_done'];
      for (const oa of oasOf(st)) if (alive(st).some(q => q.oa === oa && q.fight == null && q.intent && again.indexOf(q.intent.why) >= 0)) plan(st, oa, { only: again });
    }
    st.night = (st.tick >= 9 || st.tick < 3);
    for (const f of st.fights) if (!f.done && f.until <= absTick(st)) settleFight(st, f);
    for (const q of alive(st)) perceive(st, q);
    for (const q of alive(st)) if (q.fight == null) move(st, q);
    st.tick++;
    if (st.tick >= CONST.TICKS_A_DAY) { st.tick = 0; st.day++; }
    if (st.day > G.days) st.done = true;
    const oasLeft = new Set(alive(st).map(q => q.oa));
    if (oasLeft.size <= 1 && st.day > 1) st.done = true;
  }
  function oasOf(st) { const s = []; for (const q of st.squads) if (s.indexOf(q.oa) < 0) s.push(q.oa); return s; }
  function runDay(st) { const d = st.day; while (!st.done && st.day === d) tick(st); }
  function runToWindow(st) { do { runDay(st); } while (!st.done && !GROUND.isWindowDay(st.ground, st.day)); }
  function run(st) { while (!st.done) tick(st); return st; }

  /** what a seat may read: everything (the broadcast), and what its own squads know */
  function view(st, oa) {
    return { day: st.day, tick: st.tick, me: oa,
             squads: alive(st).map(q => ({ oa: q.oa, s: q.s, zone: q.zone, n: q.n, moving: q.moving ? { to: q.moving.to, paid: q.moving.paid, cost: q.moving.cost } : null, intent: q.oa === oa ? q.intent : null })),
             fights: st.fights.filter(f => !f.done).map(f => ({ id: f.id, zone: f.zone, sides: f.sides.map(S => ({ oa: S.oa, squads: S.squads.map(x => x.id) })), until: f.until })),
             standing: standing(st), next: GROUND.nextToGo(st.ground, st.day) };
  }

  const api = { CONST, STANCE, open, tick, runDay, runToWindow, run, view, sees, hears, loudness, plan, standing, onRoad, standIn };
  if (isNode) module.exports = api;
  global.CDCONTEST = api;
})(typeof window !== "undefined" ? window : globalThis);
