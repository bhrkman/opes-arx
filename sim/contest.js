/* Capital Divide — /sim/contest.js  (the Divide rebuild, step c)
 *
 * THE CONTEST ON THE GROUND: movement, sight and noise, and the engine seats' planner over regions.
 * This is the rebuilt Divide's day loop, built beside divide.js and switched in when the table,
 * reserve, captives and settlement are ported (conversion list, item 31). It owns no fight: contact
 * is recorded here and the hand-off to the grid is step d.
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
    BRIEF_RINGS: 1                   // [C] a briefing at the window shows a squad its own and the adjacent regions
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
      st.squads.push({ id: i, oa: q.oa, s: q.s, zone: q.zone, n, bodies: q.bodies || null, stance: q.stance || 'standard',
                       moving: null, intent: null, know: {}, brief: null, alive: true, rest: 0, visited: [q.zone], fightTicks: 0 });
    });
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
    const again = q => !opts.only || (q.intent && opts.only.indexOf(q.intent.why) >= 0);
    const taken = {};
    for (const q of group) if (!again(q) && q.intent && q.intent.type === 'take') taken[q.intent.zone] = true;
    if (!cands.length && !pressed) { for (const q of group) if (again(q)) q.intent = { type: 'hold', zone: q.zone }; return; }
    /* each squad takes the best objective by worth less the walk; two squads of one group do not take one zone */
    const order = group.slice().sort((a, b) => b.n - a.n).filter(again).filter(q => !onRoad(q));   /* one on the road finishes its road */
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
      else q.intent = { type: 'hold', zone: q.zone };
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
      if (h && h.oa !== q.oa) {
        /* §CONTACT the zone is held: the mover stops short, and the contact is recorded for step d (once a day a pair) */
        const key = q.id + ':' + h.id + ':' + st.day; q.metToday = true;
        if (!st._contacts[key]) { st._contacts[key] = 1; st.events.push({ t: 'contact', day: st.day, tick: st.tick, zone: to, mover: q.id, holder: h.id, oas: [q.oa, h.oa] }); st.audit.contacts++; }
        if (onRoad(q)) { q.intent = { type: 'hold', zone: q.zone, why: 'contact', at: to }; return; }   /* on the road it stays at the rival's door, till the door clears or the fight step settles it */
        q.moving = null; q.path = null;
        q.shut = q.shut || {}; q.shut[to] = st.day;
        q.intent = { type: 'hold', zone: q.zone, why: 'contact', at: to };
        plan(st, q.oa, { only: ['contact'] });   /* it thinks again at once, not at the next quarter-day */
        return;
      }
      if (h && h.oa === q.oa) {
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
      /* out of a dying region and at its door: it thinks again within the day, so the door is not held against the friends behind it */
      if (q.intent && q.intent.type === 'take' && q.intent.zone === to && q.intent.why === 'the wall') q.intent = { type: 'hold', zone: to, why: 'arrived' };
      if (q.path && q.path[0] === to) q.path.shift();
      return;
    }
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
    q.moving = { to: stp.to, paid: 1, cost: stp.cost, kind: stp.kind };
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
      for (const oa of oasOf(st)) if (alive(st).some(q => q.oa === oa && q.intent && (q.intent.why === 'contact' || q.intent.why === 'arrived'))) plan(st, oa, { only: ['contact', 'arrived'] });
    }
    st.night = (st.tick >= 9 || st.tick < 3);
    for (const q of alive(st)) perceive(st, q);
    for (const q of alive(st)) move(st, q);
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
             standing: standing(st), next: GROUND.nextToGo(st.ground, st.day) };
  }

  const api = { CONST, STANCE, open, tick, runDay, runToWindow, run, view, sees, hears, loudness, plan, standing, onRoad };
  if (isNode) module.exports = api;
  global.CDCONTEST = api;
})(typeof window !== "undefined" ? window : globalThis);
