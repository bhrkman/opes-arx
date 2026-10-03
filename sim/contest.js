/* Capital Divide — /sim/contest.js
 *
 * THE CONTEST ON THE GROUND: movement, sight and noise, and every seat's planner over regions,
 * ticked by divide.js's day loop. A contact is a fight: the fight is shaped here (who is in it, from
 * which edge, who walks in late, how long it holds the zone, who breaks off where, what becomes of
 * the captured) and resolved by the resolver divide.js hands it — the grid, built from the squads'
 * bodies; run alone (harness/contest_watch.cjs, contestRules), a stand-in of the same shape.
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
    DAY_TICKS: 6,                    // [C] the fleet marches these and camps the rest: only the wall, a rush or a fight moves anybody after
    /* §NOISE the loudness a squad carries, summed over its bodies, read in zone-rings against a listener */
    LOUD_HOLD: 0.6,                  // [C] a squad standing still, before its bodies are counted
    LOUD_MARCH: 1.0,                 // [C] added while it moves
    LOUD_PER_BODY: 0.22,             // [C] footfall and kit, a body: eight marching on open ground carry three zones
    LOUD_REPORT: 0.5,                // [C] a fighter's weapon report when it fires, unsilenced; a suppressor halves it
    LOUD_FIGHT: 2.0,                 // [C] a fight is the loudest thing a squad does
    LOUD_BEACON: 3.0,                // [C] a lit beacon carries further than a fight: it is meant to be found
    LOUD_COVER: 0.75,                // [C] cover and hiding multiply the total; night too
    LOUD_NIGHT: 0.85,                // [C]
    HEAR_AT: 1.0,                    // [C] heard when loudness >= distance in zones × this
    /* §PLAN the engine's planner over regions */
    PLAN_REACH_ROUTES: 2,            // [C] an objective is at most this many regions away
    PLAN_TICK_COST: 1 / 12,          // [C] a day's walk is worth this much of a site's worth
    PLAN_WORTH: { deposit: 3.0, rest: 1.2, strongpoint: 1.6, mast: 1.4, munitions: 1.0, beacon: 3.3, high: 0.5 },   // [C] a beacon only to an OA with a reserve to land (the driver says so)
    PLAN_MARGIN_DAYS: 3,             // [C] a region is left, and not walked into, this many days before the wall takes it: two left squads caught at a held door with no day to try another
    EXIT_HELD_TICKS: 12,
    PRESSED_HELD_W: 4,
    WALL_REFLEX_SLACK: 24,
    WALL_WORST_PACE: 0.55,
    WALL_CROSS_SLACK: 12,            // [C] ground crossed on the way out must stand this many ticks past the squad's passing           // [C] the slowest a day's weather makes the march (a storm): the wall's walk is reckoned at it            // [C] ticks of margin a squad keeps between the walk to lasting ground and the wall               // [C] what a rival on a zone takes off its worth to a squad leaving ahead of the wall             // [C] what a door a rival is known to hold adds to the way out: a fight, and maybe a day to find another
    PLAN_LEAVE_SLACK: 12,            // [C] ticks: a squad leaves when the wall is this close beyond its cheapest way out
    PATH_DETOUR: 6,                  // [C] ticks: a way round a squad in the road is taken only if it is at most this much longer
    PLAN_INWARD_FROM: 8,             // [C] with this few regions standing, everyone drifts inward
    SEEN_ENEMY_W: 1.5,
    /* §CAPTAIN the squad's captain reads the ground for it (divide.js captainMind: judge 1.1–3.4, sight 0.10–0.55, nerve 0–1) */
    NERVE_SWING: 0.45,               // [C] how far nerve bends the count of what is out there: a shaken captain sees more of them
    JUDGE_NOISE: 0.6,                // [C] how far a captain misweighs what a zone is worth, divided by his judgement
    SIGHT_FAR_AT: 0.45,              // [C] a captain who reads ground this well sees a ring further than the ground alone gives
    SIGHT_SHORT_AT: 0.2,             // [C] and one below this sees no further than the zones next to him, whatever the height
    /* §WEATHER the day's weather on the ground (divide.js rolls it) */
    WEATHER_BLIND_AT: 0.3,           // [C] sight cut below this: a squad sees only its own zone
    WEATHER_SHORT_AT: 0.6,           // [C] below this: only the zones next to it
    LOST_PACE: 0.3,                  // [C] a squad that has lost its bearings makes this much of its way
    HUNT_W: 2.0,                     // [C] §HUNT what a rival squad it can beat is worth, before the stance, the edge and the close-out               // [C] a zone a stronger enemy is known to hold is worth this much less
    /* §FIGHT a contact is a fight on the grid; the grid's own clock is turns, six to a tick (divide.js) */
    FIGHT_TURNS_PER_TICK: 6,         // [H] grid turns inside one two-hour block
    WALL_FIGHT_SLACK: 6,             // [C] ticks a fight on ground the wall takes leaves before the wall, to walk out in
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
    CAPTIVE_STEP_TICKS: 0.5,         // [C] a step costs this much more for every captive in tow, rounded up: one adds a tick, four add two, eight four
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
    const st = { ground, day: 1, tick: 0, seed: opts.seed || 'contest', squads: [], events: [], log: [], done: false,
                 audit: { steps: 0, contacts: 0, heard: 0, plans: 0, wall: 0, wallFree: 0, windows: 0 }, _contacts: {} };
    squads.forEach((q, i) => {
      const n = q.bodies ? q.bodies.filter(b => !b.status || b.status === 'active').length : (q.n || 5);
      st.squads.push({ id: i, oa: q.oa, s: q.s, zone: q.zone, n, bodies: q.bodies || null, ref: q.ref || null, stance: q.stance || 'standard', long: q.long != null ? q.long : CONST.HARASS_LONG,
                       moving: null, intent: null, know: {}, brief: null, alive: true, rest: 0, visited: [q.zone], fightTicks: 0, fight: null, captives: [], lost: 0 });
    });
    st.fights = []; st.resolve = opts.resolve || standIn; st.allied = opts.allied || ((a, b) => a === b); st.captivePolicy = opts.captivePolicy || captiveByStance;
    st.livingOf = opts.livingOf || null;   /* with bodies behind a squad, how many are on the ground with it, carried or not */
    st.paceOf = opts.paceOf || null;       /* with bodies behind a squad, the pace its hurt leave it */
    st.headOf = opts.headOf || null;   /* with bodies behind a squad, how many stand: read at dawn and after every fight */
    st.driven = !!opts.driven;         /* a day loop outside drives the clock: the contest does not call its own end */
    st.onSettle = opts.onSettle || null; st.onOverrun = opts.onOverrun || null; st.siteFor = opts.siteFor || null; st.onShed = opts.onShed || null; st.onTaken = opts.onTaken || null; st.reportOf = opts.reportOf || null;
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
  function standing(st) { return GROUND.standingOn(st.ground, st.day).map(r => r.id); }
  function deadZone(st, zid) { return GROUND.zoneGone(st.ground, zid, st.day); }
  /** the day the wall takes a zone: its region's day, or on the last ground its own */
  function zoneGoes(st, zid) { return GROUND.zoneGoesOn(st.ground, zid); }
  function goesOn(st, regId) { const t = st.ground.wall.takeAt.find(x => x.region === regId); return t ? t.day : Infinity; }
  /** the day a zone goes: its region's, or on the last ground its own */
  function zoneEnds(st, zid) { return Math.min(goesOn(st, st.ground.zones[zid].region), zoneGoes(st, zid)); }
  /** §WOUNDS §WEATHER how fast a squad walks now: the day's going, a lost bearing, and the hurt it carries */
  function walkPace(st, q) { return (st.weather && st.weather.pace ? st.weather.pace : 1) * (q.lostDay ? CONST.LOST_PACE : 1) * (st.paceOf && q.ref ? st.paceOf(q.ref) : 1); }
  /** a squad with nobody left standing: everyone in it is carried, it cannot fight, and whoever reaches it takes it */
  function helpless(q) { return q.alive && q.n <= 0; }
  /** §WALL THE WALL IS NEVER LET CATCH ANYBODY. Every tick, every squad on ground that goes weighs the walk to ground
      that lasts — a zone that stands at least a day past its own, past nobody if it can, a held one counted as a fight
      in the way; its captives, the weather and a lost bearing slow the walk — against the ticks left. When the walk
      eats into the margin, it drops whatever it was doing and goes; a fight it is in is broken off for it. */
  function wallWay(st, q) {
    const G = st.ground, mine = zoneEnds(st, q.zone); if (mine === Infinity) return null;
    const left = (mine - st.day) * CONST.TICKS_A_DAY - st.tick;
    /* the weather can turn by morning: the walk is reckoned at the worst pace the sky gives, or today's if worse */
    const today = walkPace(st, q);
    /* a friend's zone is no place to stand (one squad a zone) but the final zone, and a way through it waits on the friend */
    const friendAt = zid => { const h = holder(st, zid); return !!(h && h !== q && st.allied(h.oa, q.oa) && zoneEnds(st, zid) !== Infinity); };
    const ok = zid => !deadZone(st, zid) && zoneEnds(st, zid) > Math.max(mine, st.day + 2) && !friendAt(zid);
    let best = null;
    /* reckoned at the worst pace with time in hand first; failing that, at today's pace with none: it goes anyway */
    for (const [clear, worst] of [[true, true], [false, true], [true, false], [false, false]]) {
      const pace = worst ? Math.min(CONST.WALL_WORST_PACE * (q.lostDay ? CONST.LOST_PACE : 1) * (st.paceOf && q.ref ? st.paceOf(q.ref) : 1), today) : today, slack = worst ? CONST.WALL_CROSS_SLACK : 0;
      const cost = {}, prev = {}, done = new Set(); cost[q.zone] = 0;
      while (true) {
        let u = null; for (const k in cost) if (!done.has(+k) && (u == null || cost[k] < cost[u])) u = +k;
        if (u == null) break; done.add(u);
        if (u !== q.zone && ok(u)) { best = { zone: u, ticks: cost[u] }; break; }
        const outs = G.zones[u].nb.map(v => [v, G.regions[G.zones[u].region].ticks]).concat(G.regions[G.zones[u].region].links.filter(l => l.from === u).map(l => [l.at, l.ticks]));
        for (const [v, t0] of outs) { if (deadZone(st, v)) continue; const h = holder(st, v);
          const held = (h && !st.allied(h.oa, q.oa)) || friendAt(v); if (held && clear) continue;
          const c = cost[u] + Math.ceil(t0 / pace) + captiveTicks(q.captives.length) + (held ? CONST.EXIT_HELD_TICKS : 0);
          /* never through ground that will be gone by the time it gets there */
          if (zoneEnds(st, v) !== Infinity && (zoneEnds(st, v) - st.day) * CONST.TICKS_A_DAY - st.tick <= c + slack) continue;
          if (cost[v] == null || c < cost[v]) { cost[v] = c; prev[v] = u; } }
      }
      if (best) { best.path = []; for (let z = best.zone; z !== q.zone; z = prev[z]) best.path.unshift(z); best.left = left; break; }
    }
    return best || { zone: null, ticks: Infinity, left };
  }
  function wallReflex(st) {
    for (const q of alive(st)) {
      if (onRoad(q) && q.fight == null) continue;
      const w = wallWay(st, q); if (!w) continue;
      if (w.left - w.ticks > CONST.WALL_REFLEX_SLACK) continue;
      if (q.fight != null) { const f = st.fights[q.fight]; if (f && !f.done && f.until > absTick(st)) { f.until = absTick(st); st.audit.wallBreaks = (st.audit.wallBreaks || 0) + 1; } continue; }
      if (onRoad(q)) continue;
      /* a column too slow to make it with its captives lets them go: they walk off, and the squad lives */
      if (q.captives.length && (w.zone == null || w.left - w.ticks <= 0) && st.onShed) {
        const before = q.captives.length; st.onShed(st, q); if (q.captives.length < before) { st.audit.shed = (st.audit.shed || 0) + 1; const w2 = wallWay(st, q); if (w2) { w.zone = w2.zone; w.path = w2.path; w.ticks = w2.ticks; } } }
      if (w.zone == null) continue;
      /* a step already under way on the walk out is finished, not thrown away for a way a tick cheaper: a slow column
         that turned each time the reckoning tied walked in place until the wall came */
      if (q.intent && q.intent.why === 'the wall' && q.moving && !onRoad(q) && !deadZone(st, q.moving.to)
          && zoneEnds(st, q.moving.to) >= zoneEnds(st, q.zone) && (zoneEnds(st, q.moving.to) - st.day) * CONST.TICKS_A_DAY - st.tick > q.moving.cost - q.moving.paid) continue;
      const same = q.intent && q.intent.why === 'the wall' && q.intent.zone === w.zone && q.path && q.path.length && q.path[0] === w.path[0];
      if (same) continue;
      q.intent = { type: 'take', zone: w.zone, why: 'the wall' }; q.path = w.path.slice(); q.wait = 0;
      if (q.moving && !onRoad(q) && q.moving.to !== w.path[0]) q.moving = null;
      st.audit.wallReflex = (st.audit.wallReflex || 0) + 1;
    }
  }

  /* ---------------- sight and noise ---------------- */
  /** the zones this squad sees from where it stands */
  function sees(st, q) {
    const G = st.ground, z = G.zones[q.zone]; if (z.height <= -1) return [q.zone];
    const m = q.mind ? q.mind.sight : CONST.SIGHT_FAR_AT - 0.1;
    let rings = 1 + Math.max(0, z.height) + (m >= CONST.SIGHT_FAR_AT ? 1 : 0) - (m < CONST.SIGHT_SHORT_AT ? Math.max(0, z.height) : 0);
    const w = st.weather && st.weather.sight != null ? st.weather.sight : 1;
    if (w < CONST.WEATHER_BLIND_AT) rings = 0; else if (w < CONST.WEATHER_SHORT_AT) rings = Math.min(rings, 1);
    if (st.night) rings = Math.min(rings, 1);   /* §LIGHT in the dark a squad sees the zones next to it at most */
    const seen = new Set([q.zone]); let edge = [q.zone];
    for (let r = 0; r < rings; r++) { const nxt = []; for (const id of edge) for (const n of G.zones[id].nb) if (!seen.has(n)) { seen.add(n); nxt.push(n); } edge = nxt; }
    return [...seen];
  }
  /** how a squad's captain counts a rival force: his nerve bends it (a shaken man sees more of them) */
  function feared(q, n) { const nerve = q && q.mind ? q.mind.nerve : 0.5; return n * (1 + (0.5 - nerve) * CONST.NERVE_SWING * 2); }
  /** distance in zones inside a region (null across regions) */
  function zoneDist(st, a, b) {
    const Z = st.ground.zones; if (Z[a].region !== Z[b].region) return null;
    const d = { [a]: 0 }, queue = [a];
    while (queue.length) { const c = queue.shift(); if (c === b) return d[c]; for (const n of Z[c].nb) if (d[n] == null) { d[n] = d[c] + 1; queue.push(n); } }
    return null;
  }
  /** what a squad sounds like this tick */
  function loudness(st, q) {
    let L = CONST.LOUD_HOLD + CONST.LOUD_PER_BODY * q.n + (q.moving ? CONST.LOUD_MARCH : 0) + (q.fightTicks > 0 ? CONST.LOUD_FIGHT : 0) + (q.beacon ? CONST.LOUD_BEACON : 0);
    if (q.firing) L += q.firing * CONST.LOUD_REPORT;    /* the guns firing: what each carries, a silenced one half a report (the driver counts them) */
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
    for (const zid of seen) { const h = holder(st, zid); q.know[zid] = { at: now, oa: h && h.oa !== q.oa ? h.oa : null, n: h && h.oa !== q.oa ? h.n : 0, squad: h && h.oa !== q.oa ? h.id : null, how: 'seen' };
      /* §STANCE a rival seen on its way, or on its objective, beyond what the stance accepts: it thinks again */
      if (h && !st.allied(h.oa, q.oa) && q.intent && q.intent.type === 'take' && q.intent.why !== 'the wall' && q.intent.why !== 'order' && q.intent.why !== 'rushing'
          && (zid === q.intent.zone || (q.path && q.path[0] === zid)) && feared(q, h.n) > q.n * (STANCE[q.stance] || STANCE.standard).accept) { q.intent = { type: 'hold', zone: q.zone, why: 'seen', at: zid }; if (q.moving && q.moving.to === zid && !onRoad(q)) q.moving = null; q.path = null; } }
    for (const hd of hears(st, q)) { if (seen.indexOf(hd.squad.zone) >= 0) continue; q.know[hd.squad.zone] = { at: now, oa: null, n: Math.round(hd.loud / CONST.LOUD_PER_BODY / 2), squad: hd.squad.id, how: 'heard' }; st.audit.heard++; }
  }
  /** the briefing a seat gives at the window: the overview of the squad's own and adjacent regions */
  function brief(st, q) {
    const reg = regionOf(st, q), regs = [reg.id].concat(reg.links.map(l => l.to));
    const now = st.day * CONST.TICKS_A_DAY + st.tick, known = {};
    for (const o of alive(st)) { if (o.oa === q.oa) continue; const rid = st.ground.zones[o.zone].region; if (regs.indexOf(rid) >= 0) known[o.zone] = { at: now, oa: o.oa, n: o.n, squad: o.id, how: 'briefed' }; }
    q.brief = { until: nextWindowDay(st), known };
    Object.assign(q.know, known);
  }
  function nextWindowDay(st) { for (let d = st.day + 1; d <= st.day + 3; d++) if (GROUND.isWindowDay(st.ground, d)) return d; return st.day + 1; }

  /* ---------------- the planner, over regions ---------------- */
  /** what a group knows about a zone: the freshest of its squads' knowledge */
  function groupKnows(group, zid) { let best = null; for (const q of group) { const k = q.know[zid]; if (k && (!best || k.at > best.at)) best = k; } return best; }
  function plan(st, oa, opts) {
    const G = st.ground, mine = alive(st).filter(q => q.oa === oa && !helpless(q));
    for (const q of alive(st)) if (q.oa === oa && helpless(q)) planCarried(st, q);
    const byRegion = {}; for (const q of mine) (byRegion[G.zones[q.zone].region] = byRegion[G.zones[q.zone].region] || []).push(q);
    const left = standing(st).length;
    for (const rid in byRegion) planGroup(st, oa, byRegion[rid], +rid, left, opts || {});
  }
  /** §WOUNDS a squad with nobody standing makes for its own: the nearest free zone beside a squad of its OA that can
      fight, past every rival and off ground the wall is about to take; with none, it lies low where it is. The wall's
      walk overrides this as it overrides everything. */
  function planCarried(st, q) {
    if (q.intent && q.intent.why === 'the wall') return;
    const G = st.ground; let best = null, bt = Infinity;
    for (const o of alive(st)) { if (o === q || !st.allied(o.oa, q.oa) || helpless(o)) continue;
      if (G.zones[q.zone].nb.indexOf(o.zone) >= 0) { best = null; bt = 0; break; }
      for (const v of G.zones[o.zone].nb) { if (deadZone(st, v) || holder(st, v) || zoneEnds(st, v) <= st.day + CONST.PLAN_MARGIN_DAYS && zoneEnds(st, v) < zoneEnds(st, q.zone)) continue;
        const p = GROUND.ticksBetween(G, q.zone, v, { avoid: z => offLimits(st, q, v, z) || (z !== v && !!holder(st, z) && !st.allied(holder(st, z).oa, q.oa)) });
        if (p && p.ticks < bt) { bt = p.ticks; best = v; } } }
    if (best != null) { if (!(q.intent && q.intent.type === 'take' && q.intent.zone === best)) { q.intent = { type: 'take', zone: best, why: 'carried' }; q.path = null; q.wait = 0; } }
    else q.intent = { type: 'hold', zone: q.zone, why: 'carried' };
  }
  /** the cheapest way out of a group's region, over its squads, to any route's far end on ground that stands */
  function exitTicks(st, group) {
    const G = st.ground, reg = G.regions[G.zones[group[0].zone].region]; let best = Infinity;
    for (const q of group) for (const l of reg.links) { if (goesOn(st, l.to) <= goesOn(st, reg.id)) continue;
      const p = GROUND.ticksBetween(G, q.zone, l.at, { avoid: v => deadZone(st, v) });
      /* its captives slow every step of the way out, and a door a rival holds is a fight first */
      const k = groupKnows(group, l.at), held = k && k.oa && !st.allied(k.oa, q.oa);
      const t = p ? p.ticks + Math.max(0, p.path.length - 1) * captiveTicks(q.captives.length) + (held ? CONST.EXIT_HELD_TICKS : 0) : Infinity;
      if (t < best) best = t; }
    return best;
  }
  /** the rival strength a group knows of in a region, from knowledge no older than `since` */
  function knownIn(st, group, reg, since) {
    let n = 0; const oa = group[0].oa;
    for (const zid of reg.zones) { const k = groupKnows(group, zid); if (k && k.oa && !st.allied(k.oa, oa) && k.at >= since) n += k.n; }
    return n;
  }
  function planGroup(st, oa, group, rid, left, opts) {
    const G = st.ground, dial = STANCE[group[0].stance] || STANCE.standard, now = st.day * CONST.TICKS_A_DAY + st.tick;
    const force = group.reduce((t, q) => t + q.n, 0);
    const lead = group.slice().sort((a, b) => b.n - a.n)[0];   /* the biggest squad's captain reads for the group */
    /* §SITES what a zone's site is to this group now: a driver that keeps the sites says whether it is spent, held,
       dark or wanted (a beacon only with a reserve to land; a rest site more to the hurt and the hungry; the deposit the
       board asked for more); alone, the ground's own site */
    const siteOf = (zid, staying) => st.siteFor ? st.siteFor(zid, oa, group, staying) : G.zones[zid].site;
    const siteWorth = (site) => { if (!site) return 0;
      if (site.kind === 'deposit') return site.opens <= st.day + 1 ? (CONST.PLAN_WORTH.deposit + (site.units || 0) * 0.3) * (site.need || 1) : 0;
      if (site.kind === 'beacon' && !st.siteFor) return 0;
      return (CONST.PLAN_WORTH[site.kind] || 0) * (site.need || 1); };
    /* §PRESSED pressed is the wall against the real way out: a region whose one exit is sixteen ticks off
       presses two days sooner than one whose exit is three */
    /* §WEATHER the day's pace, and a squad that has lost its way, shorten the time left in walking terms */
    const pace = Math.min(...group.map(q => walkPace(st, q)));
    const goes = goesOn(st, rid), ticksLeft = Math.floor(((goes - st.day) * CONST.TICKS_A_DAY - st.tick) * pace);
    /* on the last ground the wall comes zone by zone: a squad whose own zone goes soon is pressed toward the zones that last */
    const margin = CONST.PLAN_MARGIN_DAYS;   /* the hurt a group carries is in its pace, and so in its walk out */
    /* ... or whose walk to ground that lasts, at its own pace, leaves less than the margin in hand */
    const zonePressed = goes === Infinity && group.some(q => { if (zoneGoes(st, q.zone) - st.day <= margin) return true;
      const w = wallWay(st, q); return !!w && w.left - w.ticks <= margin * CONST.TICKS_A_DAY; });
    const pressed = zonePressed || (goes !== Infinity && (goes - st.day <= margin || ticksLeft <= exitTicks(st, group) + CONST.PLAN_LEAVE_SLACK));   /* the announcement, or the way out against the clock */
    /* the regions in reach: this one and up to PLAN_REACH_ROUTES routes out */
    const reach = { [rid]: 0 }, edge = [rid];
    for (let k = 0; k < CONST.PLAN_REACH_ROUTES; k++) { const nxt = []; for (const r of edge) for (const l of G.regions[r].links) if (reach[l.to] == null) { reach[l.to] = k + 1; nxt.push(l.to); } edge.splice(0, edge.length, ...nxt); }
    const cands = [];
    for (const r in reach) {
      const reg = G.regions[+r], rg = goesOn(st, reg.id);
      /* a column slowed by captives needs a day more to get back out of a region than one that walks free */
      if (rg <= st.day + margin + (reg.id !== rid && group.some(q => captiveTicks(q.captives.length) >= 2) ? 1 : 0) && reg.id !== G.wall.last) continue;   /* not worth walking into */
      for (const zid of reg.zones) {
        const z = G.zones[zid], zg = Math.min(rg, zoneGoes(st, zid));
        if (reg.id === G.wall.last && zg <= st.day + margin && zid !== G.wall.finalZone) continue;   /* a zone of the last ground that goes soon */
        let worth = 0;
        worth += siteWorth(siteOf(zid, false));
        if (z.height >= 1) worth += CONST.PLAN_WORTH.high * z.height;
        if (left <= CONST.PLAN_INWARD_FROM || pressed) worth += zg === Infinity ? 3 : (G.days + 2 - zg) <= 0 ? 0 : Math.min(3, (zg - st.day) / 6);   /* late, ground that lasts is worth something */
        const own = group.some(q => q.zone === zid) || st.squads.some(q => q.alive && q.oa === oa && q.zone === zid && group.indexOf(q) < 0);
        if (own) continue;
        /* §STANCE a zone a rival is known to hold: beyond what the stance accepts it is no objective at all (pressed by
           the wall, it is a poor one); within it, a fight the stance seeks */
        const k = groupKnows(group, zid);
        if (k && k.oa && !st.allied(k.oa, oa)) {
          if (feared(lead, k.n) > force * dial.accept) { if (!pressed) continue; worth -= CONST.SEEN_ENEMY_W * 2; }
          if (pressed) worth -= CONST.PRESSED_HELD_W;   /* §WALL leaving, a held zone is a fight in the way: an open door first */
          else {
            /* §HUNT A FIGHT WORTH TAKING. A rival it can beat is worth going for by how far it outnumbers it, how much of
               that banner the squad is — taking the last squad of a house closes it out — and how few banners are left,
               where every one gone is a share of the pot; the stance says how much it wants that. */
            const theirs = alive(st).filter(o => o.oa === k.oa).reduce((t, o) => t + o.n, 0) || k.n;
            const edge = Math.max(0, Math.min(2, force / Math.max(1, k.n) - 1));
            const closes = Math.min(1, k.n / Math.max(1, theirs));
            const late = left <= CONST.PLAN_INWARD_FROM ? 1 + (CONST.PLAN_INWARD_FROM - left) / CONST.PLAN_INWARD_FROM : 1;
            worth += (pressed ? 0.5 : 1) * CONST.HUNT_W * dial.seek * edge * (0.5 + closes) * late;
          }
        }
        /* and the rivals known in that region as a whole, fresh within a day: a region held in strength beyond the
           stance's acceptance is not walked into for a site */
        if (!pressed && reg.id !== rid) { const near = knownIn(st, group, reg, now - CONST.TICKS_A_DAY); if (feared(lead, near) > force * dial.accept) continue; }
        if (worth <= 0 && !pressed) continue;
        cands.push({ zid, worth, reg: reg.id });
      }
    }
    /* mid-day (after a contact) only the squads turned back think again; the rest keep their way, and their
       objectives stay taken */
    /* an order from the seat (why 'order') stands until it is carried out or the seat changes it */
    /* §ORDERS an order stands until it is carried out or the seat changes it: whatever the squad did meanwhile (a
       fight, a harass, a turn back), it goes back to its order when it next thinks */
    for (const q of group) if (q.order && q.fight == null) {
      if (q.order.type === 'take' && q.zone === q.order.zone) q.order = null;
      else if (!q.intent || q.intent.why !== 'order') { q.intent = Object.assign({}, q.order); q.path = null; q.wait = 0; }
    }
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
        if (q.shut && q.shut[c.zid] >= st.day - (pressed ? 1 : 0)) continue;   /* a zone it was turned back from is not tried again today — nor tomorrow, with the wall coming */
        const path = GROUND.ticksBetween(G, q.zone, c.zid, { avoid: v => deadZone(st, v) || (v !== c.zid && !!holder(st, v) && holder(st, v).oa !== oa) });   /* friends are passed when they move; the way waits for them */
        if (!path) continue;
        if (pressed && !zonePressed && c.reg !== rid && path.ticks + Math.max(0, path.path.length - 1) * captiveTicks(q.captives.length) > ticksLeft - 1) continue;   /* it would not get there */
        /* §CAPTAIN a captain weighs what a zone is worth only as well as his judgement lets him */
        const judged = c.worth * (1 + (r01(st) - 0.5) * 2 * CONST.JUDGE_NOISE / (q.mind ? q.mind.judge : 2));
        const v = judged - path.ticks * CONST.PLAN_TICK_COST / Math.max(0.3, dial.ground) + (pressed && (c.reg !== rid || zonePressed) ? 2 : 0);
        if (v > bestV) { bestV = v; best = { zid: c.zid, path }; }
      }
      /* §SITES the ground it stands on can be worth staying for: a strongpoint its OA holds, a deposit it is working */
      if (best && !pressed) { const stay = siteWorth(siteOf(q.zone, true)); if (stay > 0 && stay >= bestV) { best = null; bestV = -Infinity; st.audit.stayed = (st.audit.stayed || 0) + 1; } }
      const before = q.intent && q.intent.type === 'take' ? q.intent.zone : null;
      if (!best && zonePressed) {
        /* the last ground closing on it and nothing it can take: the nearest zone that lasts longer, whoever stands in it */
        let to = null, dT = Infinity; const mine = zoneGoes(st, q.zone);
        for (const zid of G.regions[rid].zones) { if (zoneGoes(st, zid) <= mine || deadZone(st, zid)) continue;
          const p = GROUND.ticksBetween(G, q.zone, zid, { avoid: v => deadZone(st, v) }); if (p && p.ticks < dT) { dT = p.ticks; to = { zid, path: p }; } }
        if (to) { best = to; bestV = 0; }
      }
      if (!best && pressed && goesOn(st, rid) !== Infinity) {
        /* nothing it can reach: the nearest door out, whoever stands in it; a friend makes way, a rival is a contact */
        let door = null, dT = Infinity;
        for (const l of G.regions[rid].links) { if (goesOn(st, l.to) <= goesOn(st, rid) || (q.shut && q.shut[l.at] >= st.day - 1)) continue;
          const p = GROUND.ticksBetween(G, q.zone, l.at, { avoid: v => deadZone(st, v) }); if (p && p.ticks < dT) { dT = p.ticks; door = { zid: l.at, path: p }; } }
        if (door) { best = door; bestV = 0; }
      }
      if (best && (bestV > 0 || pressed)) { taken[best.zid] = true; q.intent = { type: 'take', zone: best.zid, why: pressed ? 'the wall' : 'the ground' }; st.audit.plans++; }
      else {
        /* nothing worth walking to: a known rival next door it will not close with is picked at from here */
        const nb = st.ground.zones[q.zone].nb.find(v => { const k = q.know[v], h = holder(st, v); return k && k.oa && !st.allied(k.oa, oa) && h && !st.allied(h.oa, oa) && h.fight == null && feared(q, k.n) > q.n * dial.accept && !(q.harass && q.harass.zone === v && q.harass.ticks >= CONST.HARASS_TICKS); });
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
    if (!near(path)) path = GROUND.ticksBetween(st.ground, q.zone, target, { avoid: v => { const o = holder(st, v); return offLimits(st, q, target, v) || !!(o && !st.allied(o.oa, q.oa) && v !== target); } });
    /* straight through a rival only when it must: pressed by the wall, under orders, or rushing the rifles */
    const must = q.intent && (q.intent.why === 'the wall' || q.intent.why === 'order' || q.intent.why === 'rushing');
    if (!near(path)) path = must ? direct : null;
    return path && path.path.length >= 2 ? path.path.slice(1) : null;
  }
  function move(st, q) {
    if (!q.alive) return;
    if (q.rest > 0) { q.rest--; return; }
    if (q.moving) {
      /* §WEATHER the going changes under a squad already walking: what is left of the step is walked at the pace now */
      const paceNow = walkPace(st, q);
      if (q.moving.pace && paceNow !== q.moving.pace && q.moving.paid < q.moving.cost) {
        q.moving.cost = q.moving.paid + Math.max(1, Math.ceil((q.moving.cost - q.moving.paid) * q.moving.pace / paceNow)); q.moving.pace = paceNow; }
      if (q.moving.paid < q.moving.cost) q.moving.paid++;
      if (q.moving.paid < q.moving.cost) return;
      const to = q.moving.to, h = holder(st, to);
      if (deadZone(st, to)) { q.moving = null; q.intent = null; q.path = null; return; }   /* the ground it was walking to is gone */
      /* §WOUNDS a zone held by nobody who can fight is taken by whoever walks in standing; nobody standing walks into a rival */
      if (h && !st.allied(h.oa, q.oa) && helpless(q)) { q.moving = null; q.path = null; q.shut = q.shut || {}; q.shut[to] = st.day; q.intent = { type: 'hold', zone: q.zone, why: 'carried' }; return; }
      if (h && !st.allied(h.oa, q.oa) && h.fight == null) {
        const theirs = st.squads.filter(o => o.alive && o.zone === to && !onRoad(o) && st.allied(o.oa, h.oa));
        if (theirs.every(helpless)) { for (const o of theirs) takeCarried(st, q, o, to); }
      }
      const h2 = holder(st, to);
      if (h2 !== h) return move(st, q);   /* the zone is free now: walk on in */
      if (h && !st.allied(h.oa, q.oa)) {
        /* §CONTACT the zone is held against it: a fight, there and then, unless one is already on in that zone,
           in which case it waits at the edge for the end of it */
        const key = q.id + ':' + h.id + ':' + st.day; q.metToday = true;
        if (!st._contacts[key]) { st._contacts[key] = 1; st.events.push({ t: 'contact', day: st.day, tick: st.tick, zone: to, mover: q.id, holder: h.id, oas: [q.oa, h.oa] }); st.audit.contacts++; }
        if (h.fight != null) { q.moving.paid = q.moving.cost; q.intent = { type: 'hold', zone: q.zone, why: 'contact', at: to }; return; }
        /* §STANCE arriving to find the zone held in strength beyond what it accepts, a squad that is not driven
           stops short and thinks again; the fight is the one it chooses */
        const must = q.intent && (q.intent.why === 'the wall' || q.intent.why === 'order' || q.intent.why === 'rushing');
        if (!must && feared(q, h.n) > q.n * (STANCE[q.stance] || STANCE.standard).accept) {
          if (onRoad(q)) { q.moving.paid = q.moving.cost; q.intent = { type: 'hold', zone: q.zone, why: 'contact', at: to }; return; }
          q.moving = null; q.path = null; q.shut = q.shut || {}; q.shut[to] = st.day;
          q.intent = { type: 'hold', zone: q.zone, why: 'seen', at: to }; plan(st, q.oa, { only: ['seen'] }); return;
        }
        openFight(st, q, h, to);
        return;
      }
      /* §WALL the final zone holds whoever is left: friends stand on it together */
      if (h && st.allied(h.oa, q.oa) && zoneEnds(st, to) !== Infinity) {
        /* a friend stands there: wait for it to move on, unless a way around it is open; two friends each
           bound for the other's zone pass each other */
        q.moving.paid = q.moving.cost;
        if (h.moving && h.moving.to === q.zone && h.moving.paid >= h.moving.cost) {
          st.events.push({ t: 'move', day: st.day, tick: st.tick, squad: h.id, oa: h.oa, from: h.zone, to: q.zone, kind: 'pass' }, { t: 'move', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to, kind: 'pass' });
          h.zone = q.zone; q.zone = to; h.moving = null; q.moving = null; q.visited.push(to); h.visited.push(h.zone); st.audit.steps += 2;
          if (q.path && q.path[0] === to) q.path.shift(); if (h.path && h.path[0] === h.zone) h.path.shift(); return; }
        if (q.intent && to !== q.intent.zone && !onRoad(q)) {   /* one on the road is at the far door and goes round nothing */
          const around = GROUND.ticksBetween(st.ground, q.zone, q.intent.zone, { avoid: v => offLimits(st, q, q.intent.zone, v) || (!!holder(st, v) && v !== q.intent.zone) });   /* round a friend, never through ground the wall is about to take */
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
    /* §WEATHER the day's weather slows the march; a squad that has lost its bearings makes a third of its way */
    const pace = walkPace(st, q);
    const cost = Math.ceil(stp.cost / pace) + captiveTicks(q.captives.length);
    /* §WALL never a step onto ground that goes sooner than its own and before the squad is through it: it stops and thinks again
       (the wall's own walk was reckoned already) */
    const ends = zoneEnds(st, stp.to);
    const toEnd = (ends - st.day) * CONST.TICKS_A_DAY - st.tick;
    if (ends !== Infinity && ends < zoneEnds(st, q.zone) && toEnd <= cost + CONST.WALL_CROSS_SLACK && q.intent.why !== 'the wall') {
      q.path = null; q.intent = { type: 'hold', zone: q.zone, why: 'the wall ahead' }; st.audit.wallAhead = (st.audit.wallAhead || 0) + 1; return; }
    q.moving = { to: stp.to, paid: 1, cost, kind: stp.kind, pace };
    if (stp.kind === 'route') st.events.push({ t: 'road', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to: stp.to });   /* on the road: in neither zone till it arrives */
  }

  /** the ticks captives add to a step: every one slows the column */
  function captiveTicks(n) { return n > 0 ? Math.ceil(n * CONST.CAPTIVE_STEP_TICKS) : 0; }
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
  /** the compass direction from one zone to another: a comer's bearing is the way back to where it came from, the edge
      of the fight's board it comes on at */
  function bearingOf(st, from, to) { const A = st.ground.zones[from], B = st.ground.zones[to]; return Math.atan2(B.y - A.y, B.x - A.x); }
  function ticksToWindow(st) { for (let d = st.day + 1; d <= st.day + 3; d++) if (GROUND.isWindowDay(st.ground, d)) return (d - st.day) * CONST.TICKS_A_DAY - st.tick; return CONST.TICKS_A_DAY - st.tick; }   /* past the month the windows are daily */
  function prepOf(st, q, zone, holdsIt) {
    const z = st.ground.zones[zone], from = st.ground.zones[q.zone];
    let p = 0.5 + CONST.HEIGHT_PREP * ((holdsIt ? z.height : from.height) - (holdsIt ? from.height : z.height)) + (holdsIt && z.cover >= 1 ? CONST.COVER_PREP : 0);
    if (q.harass && q.harass.rushed) p += CONST.HARASS_RUSHED_PREP;
    return Math.max(0, Math.min(1, p));
  }
  function openFight(st, mover, held, zone) {
    const f = { id: st.fights.length, zone, region: st.ground.zones[zone].region, day: st.day, tick: st.tick, sides: [], joiners: [], done: false };
    const sideFor = oa => { let S = f.sides.find(x => st.allied(x.oa, oa)); if (!S) { S = { tag: String.fromCharCode(65 + f.sides.length), oa, squads: [] }; f.sides.push(S); } return S; };
    /* a squad that came by road fights from the road's end and stands in neither zone till it is over */
    const put = (q, from, late) => { const S = sideFor(q.oa); S.squads.push({ id: q.id, from, bearing: from === zone ? null : bearingOf(st, zone, from), prep: prepOf(st, q, zone, from === zone), atTurn: late || 1, n: q.n, stance: q.stance }); q.fight = f.id; if (onRoad(q)) q.moving.paid = q.moving.cost; else q.moving = null; q.path = null; };
    put(held, zone); put(mover, mover.zone);
    for (const o of st.squads) if (o.alive && !helpless(o) && o !== held && o !== mover && o.zone === zone && o.fight == null && !onRoad(o)) put(o, zone);   /* friends standing with the holder on the final zone */
    /* the neighbours: anybody in a zone next door, not in a fight, not on the road, not pressed by the wall */
    const Z = st.ground.zones;
    for (const nb of Z[zone].nb) { const o = holder(st, nb); if (!o || o === mover || o.fight != null || onRoad(o) || helpless(o)) continue;   /* nobody standing joins nothing */
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
    /* §WALL no fight runs into the wall: on ground that goes, it is over with time left to walk out */
    const goesAt = Math.min(goesOn(st, f.region), zoneGoes(st, zone));
    const toWall = goesAt === Infinity ? Infinity : (goesAt - st.day) * CONST.TICKS_A_DAY - st.tick - CONST.WALL_FIGHT_SLACK;
    const ticks = Math.max(1, Math.min(CONST.FIGHT_TICKS_MAX, ticksToWindow(st), toWall, Math.ceil((res.turns || 1) / CONST.FIGHT_TURNS_PER_TICK)));
    f.ticks = ticks; f.until = absTick(st) + ticks;
    for (const S of f.sides) for (const x of S.squads) { const q = st.squads[x.id]; q.fightTicks = ticks; q.firing = st.reportOf ? st.reportOf(q) : q.n; q.intent = { type: 'fight', zone, why: 'contact' }; }
    st.fights.push(f); st.audit.fights++;
    st.events.push({ t: 'fight', day: st.day, tick: st.tick, zone, fight: f.id, sides: f.sides.map(S => ({ oa: S.oa, squads: S.squads.map(x => x.id) })), ticks, turns: res.turns });
  }
  /** the fight's end: losses booked, the beaten off a zone back, the winner on the ground, the captured decided */
  function settleFight(st, f) {
    const res = f.res, Z = st.ground.zones, winner = res.winner != null ? f.sides.find(S => S.tag === res.winner) : null;
    f.done = true;
    const wiped = [], wasRoad = {};
    for (const S of f.sides) for (const x of S.squads) {
      const q = st.squads[x.id], r = (res.squads && res.squads[q.id]) || { dead: 0, down: 0, captured: 0 };
      wasRoad[q.id] = onRoad(q);
      const capN = Array.isArray(r.captured) ? r.captured.length : (r.captured || 0);
      const gone = (r.dead || 0) + (r.down || 0) + capN;
      q.n = st.headOf && q.ref ? st.headOf(q.ref) : Math.max(0, q.n - gone); q.lost += gone;   /* a driver's bodies are the count: one the grid had down but who stands is standing */ q.fight = null; q.fightTicks = 0; q.firing = 0; q.harass = null; q.moving = null;
      if (capN && winner && winner !== S) takeCaptives(st, winner, q, r.captured, f);
      if ((st.livingOf && q.ref ? st.livingOf(q.ref) : q.n) <= 0) { q.alive = false; wiped.push(q);   /* §WOUNDS nobody left on the field of it: the carried nobody took are still with it */ st.audit.wiped++; st.events.push({ t: 'wiped', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, zone: f.zone, by: winner ? winner.oa : null });
        /* wiping a holder passes its captives to the wiper */
        if (winner && q.captives.length) { const w = st.squads[winner.squads[0].id]; if (w.alive) { w.captives = w.captives.concat(q.captives); st.events.push({ t: 'captives_pass', day: st.day, from: q.id, to: w.id, n: q.captives.length }); } q.captives = []; }
      }
    }
    /* who stands where: the winner's lead squad on the zone, the rest of it and the beaten back where they came from,
       together: a beaten group shares its line of retreat */
    const live = S => S.squads.map(x => st.squads[x.id]).filter(q => q.alive);
    const back = (q, from) => { let to = from;
      const other = v => st.squads.some(o => o.alive && o !== q && o.zone === v && !onRoad(o) && !(zoneEnds(st, v) === Infinity && st.allied(o.oa, q.oa)));
      if (to === f.zone || deadZone(st, to) || zoneEnds(st, to) <= st.day + 2 || other(to)) to = nearestFree(st, f.zone, q);
      /* nowhere free to break to and nobody standing against it to take it: it stays on the ground the fight was on,
         and the wall reflex walks it out from there like anyone else */
      const byOf = () => (winner && !st.allied(winner.oa, q.oa) ? winner : null) || f.sides.filter(S => !st.allied(S.oa, q.oa) && live(S).length).sort((a, b) => live(b).reduce((t, x) => t + x.n, 0) - live(a).reduce((t, x) => t + x.n, 0))[0] || null;
      if (to == null && !byOf()) to = deadZone(st, f.zone) ? from : f.zone;
      if (to == null || deadZone(st, to)) {
        /* beaten with nowhere to break to: overrun, and every body still standing is a captive of the winner */
        q.alive = false; st.audit.wiped++; st.events.push({ t: 'wiped', day: st.day, squad: q.id, oa: q.oa, zone: f.zone, by: winner ? winner.oa : null, how: 'overrun' });
        /* a driver that holds the bodies hands over the ones taken (and marks them held); alone, a count */
        /* taken by the winner, or with no winner by whoever across the zone is still standing strongest */
        const by = byOf();
        if (by) takeCaptives(st, by, q, st.onOverrun ? st.onOverrun(st, q, by.oa) : q.n, f); q.n = 0; q.gone = true; return;
      }
      if (to !== q.zone || wasRoad[q.id]) { st.events.push({ t: 'move', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to, kind: 'break' }); q.zone = to; q.visited.push(to); }
      q.intent = { type: 'hold', zone: to, why: 'beaten' }; q.shut = q.shut || {}; q.shut[f.zone] = st.day; };
    const holderNow = holder(st, f.zone);
    if (winner) {
      const ws = live(winner).sort((a, b) => b.n - a.n);
      for (const S of f.sides) if (S !== winner) for (const q of live(S)) { if (q.zone === f.zone) q.zone = -1; }   /* off the ground first */
      for (const S of f.sides) if (S !== winner) for (const q of live(S)) { const x = S.squads.find(y => y.id === q.id); if (q.zone === -1) q.zone = f.zone; back(q, x.from === f.zone ? f.zone : x.from); }
      ws.forEach((q, i) => { const x = winner.squads.find(y => y.id === q.id);
        if (i === 0) { if (q.zone !== f.zone || wasRoad[q.id]) { st.events.push({ t: 'move', day: st.day, tick: st.tick, squad: q.id, oa: q.oa, from: q.zone, to: f.zone, kind: 'took' }); q.zone = f.zone; q.visited.push(f.zone); } q.intent = { type: 'hold', zone: f.zone, why: 'won' };
          /* §WOUNDS whoever of the beaten lies on the ground it took, nobody standing, is taken with it */
          for (const o of st.squads) if (helpless(o) && o.zone === f.zone && !onRoad(o) && !st.allied(o.oa, q.oa)) takeCarried(st, q, o, f.zone); }
        else if (x.from === f.zone && zoneEnds(st, f.zone) === Infinity) q.intent = { type: 'hold', zone: f.zone, why: 'won' };   /* stood on it with the lead: stays */
        else back(q, x.from); });
    } else {
      /* everyone broke, or nobody: each side back the way it came; the holder keeps the ground only if it stood */
      for (const S of f.sides) for (const q of live(S)) { const x = S.squads.find(y => y.id === q.id); if (x.from === f.zone && holderNow && (holderNow === q || (zoneEnds(st, f.zone) === Infinity && st.allied(holderNow.oa, q.oa)))) { q.intent = { type: 'hold', zone: q.zone, why: 'stood' }; continue; } back(q, x.from); }
      /* a road squad that stood its ground at the far door is back where it started */
    }
    syncHeads(st);
    if (st.onSettle) st.onSettle(st, f, winner ? winner.oa : null);
    for (const S of f.sides) for (const q of live(S)) if (q.intent && q.intent.type === 'hold') plan(st, q.oa, { only: [q.intent.why] });
    st.events.push({ t: 'fight_over', day: st.day, tick: st.tick, fight: f.id, zone: f.zone, winner: winner ? winner.oa : null, result: res.result || null });
  }
  function nearestFree(st, zone, q) {
    const Z = st.ground.zones;
    /* §WALL a zone the wall takes within two dawns is nowhere to break to: the walk out of it may already be shut; the
       beaten break first to ground they would not have to leave at once, and only failing that to ground that lasts two days */
    for (const days of [CONST.PLAN_MARGIN_DAYS, 2]) {
      const d = { [zone]: 0 }, queue = [zone];
      while (queue.length) { const c = queue.shift(); if (c !== zone && !deadZone(st, c) && zoneEnds(st, c) > st.day + days && !st.squads.some(o => o.alive && o !== q && o.zone === c && !onRoad(o) && !(zoneEnds(st, c) === Infinity && st.allied(o.oa, q.oa)))) return c;
        const outs = Z[c].nb.concat(st.ground.regions[Z[c].region].links.filter(l => l.from === c).map(l => l.at));
        for (const n of outs) if (d[n] == null) { d[n] = d[c] + 1; queue.push(n); } } }
    return null;
  }
  /** §CAPTIVES decided at the capture, one by one, by the captor's seat: killed, kept or let go. Keeping costs a
      tick a step for every second captive; the driver feeds them and prices the standing
      of each fate (divide.js §CAPTIVES) */
  function takeCaptives(st, winner, from, who, f) {
    const w = st.squads[winner.squads[0].id]; if (!w || !w.alive) return;
    const list = Array.isArray(who) ? who : new Array(who).fill(null);
    for (const body of list) {
      const fate = st.captivePolicy(st, w, from, f, body) || 'keep';
      st.audit.captured++;
      st.events.push({ t: 'captive', day: st.day, tick: st.tick, zone: f.zone, captor: w.id, captorOa: w.oa, from: from.id, fromOa: from.oa, fate, body: body ? (body.id || null) : null });
      /* a driven contest hands every decided captive to its driver, which kills or frees the body as the fight settles;
         alone, the contest keeps only those it holds */
      if (fate === 'keep' || fate === 'pending' || (st.driven && body)) w.captives.push({ oa: from.oa, squad: from.id, day: st.day, body: body || null, fate });
    }
  }
  /** §WOUNDS a squad with nobody standing, reached by a rival who can fight: everybody in it is taken */
  function takeCarried(st, q, h, zone) {
    const bodies = st.onOverrun ? st.onOverrun(st, h, q.oa) : h.n;
    takeCaptives(st, { squads: [{ id: q.id }] }, h, bodies, { zone });
    if (h.captives.length) { q.captives = q.captives.concat(h.captives); st.events.push({ t: 'captives_pass', day: st.day, from: h.id, to: q.id, n: h.captives.length }); h.captives = []; }
    h.alive = false; h.gone = true; h.n = 0; h.moving = null; h.path = null; st.audit.wiped++;
    st.events.push({ t: 'wiped', day: st.day, tick: st.tick, squad: h.id, oa: h.oa, zone, by: q.oa, how: 'taken' });
    if (st.onTaken) st.onTaken(st, q, h);
  }
  function captiveByStance(st, captor, from) {
    const s = captor.stance; return s === 'death_or_glory' ? 'kill' : (s === 'preservationist' || s === 'measured') ? 'release' : 'keep';
  }
  /** §HARASS fire from the next zone: a squad that will not close picks at one that holds; it is loud, it is seen,
      and the squad under it may rush — a harasser rushed is caught looking the wrong way */
  function harass(st, q) {
    const tgt = q.intent.zone, h = holder(st, tgt);
    if (!h || st.allied(h.oa, q.oa) || st.ground.zones[q.zone].nb.indexOf(tgt) < 0 || h.fight != null || helpless(h) || helpless(q)) { q.intent = { type: 'hold', zone: q.zone, why: 'harass_done' }; q.harass = null; q.firing = 0; return; }
    q.harass = q.harass || { zone: tgt, ticks: 0, hits: 0 }; q.harass.ticks++;
    const rifles = Math.max(1, Math.round(q.n * q.long)); q.firing = rifles;
    let hits = 0; for (let i = 0; i < rifles; i++) if (r01(st) < CONST.HARASS_P) hits++;
    if (hits) { h.n = Math.max(0, h.n - hits); h.lost += hits; q.harass.hits += hits; st.events.push({ t: 'harass', day: st.day, tick: st.tick, from: q.id, oa: q.oa, zone: tgt, on: h.id, hits });
      if (h.n <= 0 && !st.livingOf) { h.alive = false; st.audit.wiped++; st.events.push({ t: 'wiped', day: st.day, tick: st.tick, squad: h.id, oa: h.oa, zone: tgt, by: q.oa, how: 'picked off' }); } }   /* a driver's bodies say who is left: syncHeads */
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
  /** dawn: the wall, the window's briefing, the free-way audit — and then, separately, the plans (a caller holding
      the contest does its own window between the two) */
  function dawn(st) {
    const G = st.ground;
    if (st.dawned === st.day) return;
    st.dawned = st.day;
    syncHeads(st);
    /* §WALL a fight still on where the wall comes this dawn is over before it comes: the beaten break to ground that
       stands, or are taken; the winner walks out with the rest */
    for (const f of st.fights) if (!f.done && (zoneEnds(st, f.zone) <= st.day || f.sides.some(S => S.squads.some(x => zoneEnds(st, st.squads[x.id].zone) <= st.day)))) { f.until = absTick(st); settleFight(st, f); }
    {
      for (const t of G.wall.takeAt) if (t.day === st.day) {
        /* a squad on the road out — a tick or more along a route to a region that stands — is outside already */
        for (const q of alive(st)) if (G.zones[q.zone].region === t.region && !(onRoad(q) && G.zones[q.moving.to].region !== t.region)) { q.alive = false; st.events.push({ t: 'wall', day: st.day, squad: q.id, oa: q.oa, region: t.region, free: !!q.freeWay && !q.metToday }); st.audit.wall++; if (q.freeWay && !q.metToday) st.audit.wallFree = (st.audit.wallFree || 0) + 1; }
        st.events.push({ t: 'region_gone', day: st.day, region: t.region });
      }
      /* §ENDGAME the last ground closes a zone at a time */
      for (const t of (G.wall.zoneAt || [])) if (t.day === st.day) {
        for (const q of alive(st)) if (q.zone === t.zone && !onRoad(q)) { q.alive = false; st.events.push({ t: 'wall', day: st.day, squad: q.id, oa: q.oa, region: G.zones[t.zone].region, zone: t.zone, free: !!q.freeWay && !q.metToday }); st.audit.wall++; if (q.freeWay && !q.metToday) st.audit.wallFree = (st.audit.wallFree || 0) + 1; }
        st.events.push({ t: 'zone_gone', day: st.day, zone: t.zone, region: G.zones[t.zone].region });
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
          if (p && p.ticks <= CONST.TICKS_A_DAY - 1) { q.freeWay = true; break; } }
        /* on the last ground: a zone that lasts longer, reachable past nobody within the day */
        if (goesOn(st, rid) === Infinity && zoneGoes(st, q.zone) === st.day + 1 && !onRoad(q)) for (const zid of G.regions[rid].zones) { if (zoneGoes(st, zid) <= st.day + 1 || holder(st, zid)) continue;
          const p = GROUND.ticksBetween(G, q.zone, zid, { avoid: v => deadZone(st, v) || (!!holder(st, v) && v !== q.zone) });
          if (p && p.ticks <= CONST.TICKS_A_DAY - 1) { q.freeWay = true; break; } } }
    }
  }
  function plans(st) { for (const oa of oasOf(st)) plan(st, oa); }
  /** squads with bodies behind them stand as many as their bodies do */
  function syncHeads(st) {
    if (!st.headOf) return;
    /* §WOUNDS a squad is on the ground while anybody in it lives, standing or carried; `n` is who can fight */
    for (const q of st.squads) { if (!q.ref) continue; const n = st.headOf(q.ref), on = st.livingOf ? st.livingOf(q.ref) : n; q.n = n;
      if (on <= 0 && q.alive && q.fight == null) { q.alive = false; q.moving = null; } if (on > 0 && !q.alive && !q.gone) q.alive = true; }
  }
  function tick(st) {
    if (st.done) return;
    const G = st.ground;
    if (st.tick === 0) {
      dawn(st); plans(st);
    } else if (st.tick % 4 === 0) {
      /* a squad stopped by a contact thinks again within the day, not at the next dawn: pressed by the wall, a day's
         wait was death */
      const again = ['contact', 'arrived', 'beaten', 'won', 'stood', 'harass_done', 'seen'];
      for (const oa of oasOf(st)) if (alive(st).some(q => q.oa === oa && q.fight == null && q.intent && again.indexOf(q.intent.why) >= 0)) plan(st, oa, { only: again });
    }
    st.night = st.dark != null ? !!st.dark : (st.tick >= 9 || st.tick < 3);   /* the planet's dark when a driver reads it; the fleet's clock else */
    st.camp = st.tick >= CONST.DAY_TICKS;
    wallReflex(st);
    for (const f of st.fights) if (!f.done && f.until <= absTick(st)) settleFight(st, f);
    for (const q of alive(st)) perceive(st, q);
    for (const q of alive(st)) if (q.fight == null && (!st.camp || q.moving || (q.intent && (q.intent.why === 'the wall' || q.intent.why === 'rushing' || q.intent.why === 'order')))) move(st, q);
    st.tick++;
    if (st.tick >= CONST.TICKS_A_DAY) { st.tick = 0; st.day++; }
    if (st.driven) return;
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

  const api = { wallWay, zoneEnds, captiveTicks, CONST, STANCE, open, tick, dawn, plans, runDay, runToWindow, run, view, sees, hears, loudness, plan, standing, onRoad, standIn, holder, zoneDist, absTick, syncHeads };
  if (isNode) module.exports = api;
  global.CDCONTEST = api;
})(typeof window !== "undefined" ? window : globalThis);
