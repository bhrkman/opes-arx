/* Capital Divide — /sim/map.js  (Step 4)
 *
 * The planet: OPEN GROUND, not a web of rooms. A disc of continuous terrain with a zone
 * that tightens each week, and squads that move freely across it. Implements DIVIDE.md
 * §3 (the planet), §9 (objectives), §10 (the closing zone).
 *
 * Coordinates are normalised: the planet is the disc of radius 0.5 centred on (0.5, 0.5),
 * so a viewer maps straight onto a unit square. A squad covers roughly 0.06 of those units
 * in a day, which makes the planet about sixteen days wide on foot.
 *
 * Pure logic: no DOM, no Math.random, no I/O. Seed => identical planet.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./prng.js") : global.CDPRNG;

  /* Terrain types map 1:1 onto COMBAT.md 3.2's cover profiles, so the day loop hands the
     resolver a profile name and nothing in the resolver changes. `conceal` multiplies the
     detection roll: open ground gives you away, forest hides you. */
  const TERRAIN = {
    open_basin:    { conceal: 1.30, forage: 0, speed: 1.15 },
    broken_ground: { conceal: 1.00, forage: 1, speed: 0.95 },
    forest:        { conceal: 0.70, forage: 3, speed: 0.80 },
    ruins:         { conceal: 0.75, forage: 1, speed: 0.85 },
    entrenched:    { conceal: 0.85, forage: 0, speed: 0.75 }
  };

  const ARCHETYPES = {
    ice_shelf: {
      name: "Ice Shelf",
      terrain: [["open_basin", 45], ["broken_ground", 40], ["entrenched", 10], ["ruins", 5]],
      forageMult: 0.25, supplyStrain: 1.15, bandBias: 0,
      hazards: [["cold", 34], ["whiteout", 26], ["crevasse", 18], ["storm", 22]],
      places: ["Shelf", "Rift", "Pale", "Drift", "Floe", "Sound", "Cairn", "Reach"],
      adjectives: ["White", "Iron", "Long", "Broken", "Still", "Bitter", "Grey", "Far"]
    },
    jungle_cradle: {
      name: "Jungle Cradle",
      terrain: [["forest", 60], ["broken_ground", 25], ["ruins", 10], ["open_basin", 5]],
      forageMult: 1.35, supplyStrain: 0.90, bandBias: 2,
      hazards: [["fever", 32], ["downpour", 30], ["heat", 20], ["rot", 18]],
      places: ["Canopy", "Hollow", "Green", "Basin", "Thicket", "Delta", "Shade", "Root"],
      adjectives: ["Deep", "Wet", "Old", "Tangled", "Low", "Quiet", "Fat", "Drowned"]
    },
    desert_pan: {
      name: "Desert Pan",
      terrain: [["open_basin", 58], ["broken_ground", 30], ["ruins", 8], ["entrenched", 4]],
      forageMult: 0.15, supplyStrain: 1.20, bandBias: 0,
      hazards: [["heat", 36], ["thirst", 28], ["sandstorm", 24], ["glare", 12]],
      places: ["Pan", "Flat", "Scarp", "Wash", "Dune", "Salt", "Mesa", "Draw"],
      adjectives: ["Wide", "Red", "Blind", "Empty", "Hot", "Cracked", "Long", "Bright"]
    },
    volcanic_waste: {
      name: "Volcanic Waste",
      terrain: [["broken_ground", 48], ["ruins", 24], ["open_basin", 18], ["entrenched", 10]],
      forageMult: 0.45, supplyStrain: 1.10, bandBias: 1,
      hazards: [["ashfall", 32], ["gas_vent", 28], ["tremor", 22], ["heat", 18]],
      places: ["Caldera", "Flow", "Vent", "Slag", "Cone", "Ridge", "Fume", "Crag"],
      adjectives: ["Black", "Burnt", "Sullen", "New", "Hard", "Smoking", "Low", "Cinder"]
    },
    drowned_world: {
      name: "Drowned World",
      terrain: [["broken_ground", 34], ["forest", 24], ["ruins", 22], ["open_basin", 20]],
      forageMult: 0.85, supplyStrain: 1.00, bandBias: 1,
      hazards: [["flooding", 34], ["cold", 24], ["current", 24], ["storm", 18]],
      places: ["Shallows", "Causeway", "Bank", "Spit", "Narrows", "Mouth", "Bar", "Weir"],
      adjectives: ["Grey", "Slow", "Sunk", "Half", "Green", "Cold", "Thin", "Turning"]
    },
    dead_industrial: {
      name: "Dead Industrial",
      terrain: [["ruins", 46], ["entrenched", 24], ["broken_ground", 22], ["open_basin", 8]],
      forageMult: 0.30, supplyStrain: 1.05, bandBias: 2, salvage: true,
      hazards: [["collapse", 32], ["toxicity", 30], ["void", 20], ["fire", 18]],
      places: ["Works", "Yard", "Stack", "Line", "Pit", "Gantry", "Furnace", "Terminus"],
      adjectives: ["Cold", "Spent", "Number", "Long", "Dry", "Silent", "Upper", "Lower"]
    }
  };

  const OBJECTIVE_TYPES = [
    { id: "sponsor_cache",  label: "Sponsor Cache",  weight: 22, claimDays: 2 },
    { id: "munitions_drop", label: "Munitions Drop", weight: 22, claimDays: 2 },
    { id: "ration_site",    label: "Water & Forage", weight: 20, claimDays: 2 },
    { id: "ore_assay",      label: "Ore Assay",      weight: 34, claimDays: 2 },
    { id: "relay_mast",     label: "Relay Mast",     weight: 14, claimDays: 2 }
  ];

  /* §7 what a planet is made of. Loaded from planets.json in node; a viewer injects it with
     `setResourcePool`. Absent, a planet generates with no composition and richness falls back
     to the archetype lean, which is what the pre-Step-7 code did. */
  let POOL = null;
  function setResourcePool(pool) { POOL = pool || null; return POOL; }

  const CONST = {
    FINAL_DAY: 30,                       // [S] C1
    /* §7.2 how deep a world runs. A poor one carries two or three things worth having and a
       rich one five or six, leaned by archetype. */
    COMPOSITION_COUNT: [2, 6],           // [S] R23
    COMPOSITION_DENSITY: [0.20, 1.00],   // [C]
    /* §7.3 richness is DERIVED from the composition and is not rolled beside it. Two
       independent numbers both saying how good a planet is will drift apart, and this
       project has a written record of what that costs. These two map the summed value of
       what is down there onto the 0.70–1.40 the pot already uses. */
    RICHNESS_RAW: [0.55, 5.00],          // [C] the summed value×density this maps from
    RICHNESS_OUT: [0.70, 1.40],          // [S] and what negotiate.js multiplies the pot by
    PLANET_RADIUS: 0.29,                 // [C] sized against the march: a squad crosses it
                                         //     in about eleven days at full effort
    TERRAIN_PATCHES: [22, 34],           // [C] coherent country, not confetti
    WARP_OCTAVES: 3,                     // [C] domain warp: fingered, interlocking edges
    WARP_AMPLITUDE: 0.030,               // [C]
    /* §2.5 sponsor waves: a drop at every ring step, fewer at the start and more in total,
       each wave landing inside the ring as it will stand that day and worth more than the
       last. The ring stops being only a squeeze and becomes what reloads the map. */
    WAVE_DAYS: [1, 7, 13, 19, 24],       // [S] the ring steps
    WAVE_COUNT: [5, 6, 7, 8, 9],         // [C] 35 across a Divide
    RELAY_COOLDOWN: 3,                   // [C] days a fired mast stays dark
    LOOT_TICKS: 2,                       // [S] long enough to be interrupted, not an occupation
    /* REMOVED in the Step 6 audit: OBJECTIVES_AT_DROP (superseded by WAVE_COUNT — it said so
       in its own comment and nothing had read it since), and LATE_REVEALS / LATE_REVEAL_DAY.
       Late reveals DO happen, ~25 a Divide, but they come from each objective's own
       `revealDay` set at generation; these two constants were a second, orphaned way of
       describing the same thing and no code read either. A constant that looks like the
       source of a behaviour but is not is worse than no constant. */
    OBJECTIVE_MIN_GAP: 0.060,            // [C] closer together, but still worth walking to
    OBJECTIVE_DROP_CLEARANCE: 0.055,     // [C] no site sits under a squad's boots at the drop
    CLAIM_RADIUS: 0.026,                 // [C] how close is "standing on it"

    /* §2.3 THE CRUSH (Step 6, N15/N18). The ring closes on an explicit day schedule, not a
       weekly one, because the last week has to do work the middle weeks do not.

       The old schedule had five weekly steps and a final circle that both began on day 29,
       and the final one superseded the fifth — so the fifth step was DEAD CODE and the
       fourth (0.57) held from day 22 through day 28: a circle with room for roughly twenty
       squads to stay out of each other's reach, against six alive. That was the endgame
       lull, measured at ~1 firefight a day across days 23-28, the quietest stretch of the
       month, against 2-3 through the middle.

       Sized against ENGAGE_RANGE. The number that matters is how many squads can sit inside
       the ring without being in contact range of each other, ~3.63 x (r / ENGAGE_RANGE)^2:

         day  8  0.80  -> 42 squads     the map is still a map
         day 15  0.58  -> 22
         day 22  0.34  ->  7.6          collisions begin; also inside CORNERED_ZONE_FRAC,
                                        so from here contact is forced and nobody passes over
         day 26  0.20  ->  2.6          the grinder
         day 29  0.115 ->  1            the ring's DIAMETER is under contact range: every
                                        squad inside it is in reach of every other
         day 30  0.045     the last ground — everything on top of everything, held there
                           for as long as the contest takes (N18)

       LAST_GROUND_FRAC is asserted against ENGAGE_RANGE in arx.cjs from the live values of
       both, so moving either without the other fails. */
    ZONE_STEP_DAYS: [1, 7, 13, 19, 24, 28],       // [S]
    ZONE_STEPS: [1, 0.8, 0.52, 0.28, 0.16, 0.115],  // [C] x PLANET_RADIUS
    LAST_GROUND_DAY: 30,                  // [S] N18 — the ring stops closing; the fight does not
    LAST_GROUND_FRAC: 0.045,              // [S] the ground a Divide is decided on
    ZONE_DRIFT: 0.85,                     // [C] how far a new centre may sit off the old
    /* The line is a wall, not a hazard (ruled). Nothing survives outside it because
       nothing is outside it: the field closes and what it touches is moved. There is no
       out-of-bounds attrition because there is no out of bounds. */
    EDGE_MARGIN: 0.985,                   // [C] how close to the wall the field lets you stand
    /* [C] comms cadence switch, as a FRACTION OF THE PLANET'S RADIUS. It was compared as an
       absolute — 0.35 against a planet whose radius is 0.29 — so the test was true on day one
       of every Divide ever run and the cadence was daily throughout. The ruling it implements
       is that a manager speaks to their people every two days at first and daily once the ring
       closes; the two-day half of that had never happened once. `ZONE_STEPS` are already
       multiples of `PLANET_RADIUS`, so the comparison belongs in the same units. */
    DAILY_WINDOW_AT_RADIUS: 0.35          // [C] comms cadence switch — daily from ~day 20, which
                                          //     is when there is something to negotiate about
  };

  function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  /** Uniform point in a disc. The sqrt keeps it from clustering at the centre. */
  function pointIn(rng, cx, cy, r) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  }

  function placeName(rng, arch, used) {
    for (let i = 0; i < 14; i++) {
      const n = P.pick(rng, arch.adjectives) + " " + P.pick(rng, arch.places);
      if (!used.has(n)) { used.add(n); return n; }
    }
    return P.pick(rng, arch.adjectives) + " " + P.pick(rng, arch.places) + " " + (used.size + 1);
  }

  function generatePlanet(rng, opts) {
    opts = opts || {};
    const keys = Object.keys(ARCHETYPES);
    const archKey = opts.archetype && ARCHETYPES[opts.archetype] ? opts.archetype : P.pick(rng, keys);
    const arch = ARCHETYPES[archKey];
    const composition = rollComposition(rng, archKey);
    const richness = richnessOf(composition, archKey);
    const CX = 0.5, CY = 0.5, R = opts.radius || CONST.PLANET_RADIUS;
    const used = new Set();

    /* Terrain as coherent patches: a point takes the type of the nearest patch seed.
       Cheap, deterministic, and it produces country rather than confetti. */
    const nPatch = P.int(rng, CONST.TERRAIN_PATCHES[0], CONST.TERRAIN_PATCHES[1]);
    const patches = [];
    for (let i = 0; i < nPatch; i++) {
      const p = pointIn(rng, CX, CY, R * 1.04);
      patches.push({ x: p.x, y: p.y, type: P.weightedPick(rng, arch.terrain), name: placeName(rng, arch, used) });
    }

    /* Nearest-seed alone gives straight-edged cells, which read as a diagram rather than
       country. Warping the lookup coordinates first makes the boundaries finger and
       interlock the way a treeline meets a basin. Deterministic and exported, so a viewer
       can reproduce the same ground exactly rather than approximating it. */
    const warp = [];
    for (let k = 0; k < CONST.WARP_OCTAVES; k++) {
      warp.push({
        fx: 6 + rng() * 9, fy: 6 + rng() * 9,
        px: rng() * Math.PI * 2, py: rng() * Math.PI * 2,
        a: CONST.WARP_AMPLITUDE / (k + 1)
      });
    }
    function warpAt(x, y) {
      let wx = x, wy = y;
      for (const w of warp) {
        wx += Math.sin(y * w.fy + w.px) * w.a;
        wy += Math.cos(x * w.fx + w.py) * w.a;
      }
      return [wx, wy];
    }

    function patchAt(x, y) {
      const w = warpAt(x, y);
      let best = patches[0], bd = Infinity;
      for (const p of patches) {
        const d = (p.x - w[0]) * (p.x - w[0]) + (p.y - w[1]) * (p.y - w[1]);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
    const terrainAt = (x, y) => patchAt(x, y).type;
    const concealAt = (x, y) => TERRAIN[terrainAt(x, y)].conceal;
    const speedAt = (x, y) => TERRAIN[terrainAt(x, y)].speed;
    const forageAt = (x, y) => TERRAIN[terrainAt(x, y)].forage * arch.forageMult;

    /* The zone schedule. Each week's circle sits inside the last but offset, so some corps
       have to cross ground to stay in play and the pressure has a direction. */
    const zone = [];
    let cx = CX, cy = CY;
    for (let w = 0; w < CONST.ZONE_STEPS.length; w++) {
      const r = R * CONST.ZONE_STEPS[w];
      if (w > 0) {
        const slack = (zone[w - 1].r - r) * CONST.ZONE_DRIFT;
        const p = pointIn(rng, cx, cy, Math.max(0, slack));
        cx = p.x; cy = p.y;
      }
      zone.push({ fromDay: CONST.ZONE_STEP_DAYS[w], cx, cy, r });
    }
    /* N18 — the last ground. The ring closes one final time and then stops closing; the
       contest runs on it until one banner is left. It does not expire and does not move. */
    const finalR = R * CONST.LAST_GROUND_FRAC;
    const slackF = (zone[zone.length - 1].r - finalR) * CONST.ZONE_DRIFT;
    const pf = pointIn(rng, cx, cy, Math.max(0, slackF));
    zone.push({ fromDay: CONST.LAST_GROUND_DAY, cx: pf.x, cy: pf.y, r: finalR, lastGround: true });

    /* Objectives, spaced so they are worth travelling between. Late reveals are seeded
       inside the final circle so the endgame gets something new to fight over. */
    /* §2.4/§2.5 — crates, not capture points. Each wave lands inside the ring as it will
       stand on its day, so late drops fall on the ground everyone is being driven onto. */
    const objectives = [];
    const areaScale = (R / CONST.PLANET_RADIUS) * (R / CONST.PLANET_RADIUS);
    const gap = CONST.OBJECTIVE_MIN_GAP * (R / CONST.PLANET_RADIUS);
    const dropRing = R * (opts.dropRing || 0.82);
    const clearance = CONST.OBJECTIVE_DROP_CLEARANCE * (R / CONST.PLANET_RADIUS);
    let objId = 0;
    for (let w = 0; w < CONST.WAVE_DAYS.length; w++) {
      const day0 = CONST.WAVE_DAYS[w];
      let ring = zone[0];
      for (const zs of zone) if (day0 >= zs.fromDay) ring = zs;
      const n = Math.max(1, Math.round(CONST.WAVE_COUNT[w] * areaScale));
      for (let i = 0; i < n; i++) {
        let p = null;
        for (let tries = 0; tries < 220; tries++) {
          const q = pointIn(rng, ring.cx, ring.cy, ring.r * 0.88);
          if (w === 0 && Math.abs(dist(q.x, q.y, CX, CY) - dropRing) < clearance) continue;
          let ok = true;
          for (const o of objectives) if (dist(q.x, q.y, o.x, o.y) < gap * 0.7) { ok = false; break; }
          if (ok) { p = q; break; }
        }
        if (!p) p = pointIn(rng, ring.cx, ring.cy, ring.r * 0.6);
        const type = P.weightedPick(rng, OBJECTIVE_TYPES.map(t => [t, t.weight]));
        objectives.push({
          id: 'obj_' + (objId++), type: type.id, label: type.label,
          /* §7.4 an assay site sits on one of the planet's actual resources, weighted by
             density, so emptying it banks THAT and not a generic credit. Which turns the
             hedge into a targeted one: the corp that needs fuel goes for the fuel sites,
             and so does the other corp that needs fuel. */
          resource: type.id === 'ore_assay' && composition.length
            ? P.weightedPick(rng, composition.map(r => [r.id, r.density])) : null,
          x: p.x, y: p.y, place: patchAt(p.x, p.y).name,
          wave: w, tier: Math.min(5, 2 + w), potency: 1 + w * 0.35,
          revealed: w === 0, revealDay: day0,
          looted: false, lootedBy: null, work: {}, dark: 0
        });
      }
    }

    return {
      archetype: archKey, archetypeName: arch.name,
      composition, richness,             // §7.2, §7.3 — one source for how good this world is
      supplyStrain: arch.supplyStrain, salvage: !!arch.salvage,
      hazards: arch.hazards, bandBias: arch.bandBias,
      cx: CX, cy: CY, radius: R,
      patches, zone, objectives, warp,
      terrainAt, concealAt, speedAt, forageAt, patchAt, warpAt
    };
  }

  function zoneOn(planet, day) {
    /* THE DOME CLOSES CONTINUOUSLY. The schedule's entries are anchors now, not steps:
       between one and the next, centre and radius interpolate day by day, so the daily
       shrink is a fraction of anyone's march and out-walking the line is a matter of
       ordinary planning rather than luck. The old rule — flat for days, then an
       overnight jump bigger than a day's march, with whoever it caught displaced onto
       the new edge — guaranteed somebody got thrown, and the throw read as teleporting
       on any map honest enough to draw it. Ruled at the animation pass: the dome never
       moves anyone. It closes; the caught are simply gone. */
    let a = planet.zone[0], b = null;
    for (const s of planet.zone) { if (day >= s.fromDay) a = s; else { b = s; break; } }
    if (!b || day <= a.fromDay) return a;
    const t = (day - a.fromDay) / (b.fromDay - a.fromDay);
    return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t,
             r: a.r + (b.r - a.r) * t, fromDay: a.fromDay };
  }
  function zoneNext(planet, day) {
    /* tomorrow's circle — under continuous closing it is always a little smaller */
    const z = zoneOn(planet, day + 1);
    return { cx: z.cx, cy: z.cy, r: z.r, fromDay: day + 1 };
  }
  /** The Aleas announces a tightening a day ahead, so leaving is a decision. */
  function tighteningTomorrow(planet, day) {
    /* under continuous closing the dome tightens every day; the Aleas announces the
       BEATS — the schedule's anchor days, where the closing rate changes */
    return planet.zone.some(z => z.fromDay === day + 1);
  }
  function inZone(planet, day, x, y) {
    const z = zoneOn(planet, day);
    return dist(x, y, z.cx, z.cy) <= z.r;
  }
  /** How far outside the edge; 0 if inside. */
  function outsideBy(planet, day, x, y) {
    const z = zoneOn(planet, day);
    return Math.max(0, dist(x, y, z.cx, z.cy) - z.r);
  }
  /**
   * The closing wall. Any point the field has swallowed is pushed to just inside the edge —
   * this is displacement, not damage, and it is why a squad can never be out of bounds.
   */
  function clampInside(planet, day, x, y) {
    const z = zoneOn(planet, day);
    const d = dist(x, y, z.cx, z.cy);
    const limit = z.r * CONST.EDGE_MARGIN;
    if (d <= limit) return { x, y, pushed: 0 };
    const t = limit / Math.max(1e-6, d);
    return { x: z.cx + (x - z.cx) * t, y: z.cy + (y - z.cy) * t, pushed: d - limit };
  }

  /** Step toward safe ground, for a squad being driven in. */
  function towardZone(planet, day, x, y, step) {
    const z = zoneOn(planet, day);
    const d = dist(x, y, z.cx, z.cy);
    const want = z.r * 0.88;
    if (d <= want) return { x, y };
    const move = Math.min(step, d - want);
    const t = move / Math.max(1e-6, d);
    return { x: x + (z.cx - x) * t, y: y + (z.cy - y) * t };
  }

  /** A wave lands. Everything in it becomes real on the same morning. */
  function revealObjectives(planet, day) {
    const shown = [];
    for (const o of planet.objectives) {
      if (!o.revealed && day >= o.revealDay) { o.revealed = true; shown.push(o); }
    }
    return shown;
  }
  /** Is this crate still worth walking to? A mast is worth it again once it is back up. */
  function siteLive(o, day) {
    if (!o.revealed) return false;
    if (o.type === 'relay_mast') return day >= o.dark;
    return !o.looted;
  }

  function windowCadence(planet, day) {
    const r = zoneOn(planet, day).r / Math.max(1e-9, planet.radius);
    return r <= CONST.DAILY_WINDOW_AT_RADIUS ? 1 : 2;
  }

  /* ------------------------------------------------------------------ */
  /* §7 what a planet is made of                                         */
  /* ------------------------------------------------------------------ */

  /**
   * §7.2 — two or three things worth having on a poor world, five or six on a rich one, at
   * varying densities, with the archetype deciding which categories can appear at all.
   */
  function rollComposition(rng, archKey) {
    if (!POOL) return [];
    const lean = (POOL.leans || {})[archKey] || {};
    const eligible = (POOL.resources || []).filter(r => {
      if (r.salvage && archKey !== 'dead_industrial') return false;
      return (lean[r.category] || 0) > 0;
    });
    if (!eligible.length) return [];
    const lo = CONST.COMPOSITION_COUNT[0], hi = CONST.COMPOSITION_COUNT[1];
    const depth = P.clamp((lean.depth != null ? lean.depth : 0.5) * 0.60
                          + rng() * 0.85 - 0.16, 0, 1);
    const want = Math.min(eligible.length, lo + Math.round(depth * (hi - lo)));
    const bag = eligible.slice(), out = [];
    while (out.length < want && bag.length) {
      const r = P.weightedPick(rng, bag.map(x => [x, lean[x.category] || 0.01]));
      bag.splice(bag.indexOf(r), 1);
      const dlo = CONST.COMPOSITION_DENSITY[0], dhi = CONST.COMPOSITION_DENSITY[1];
      out.push({ id: r.id, name: r.name, category: r.category, value: r.value,
                 density: P.roundTo(dlo + (dhi - dlo) * (0.35 + 0.65 * depth) * rng(), 0.01) });
    }
    return out.sort((a, b) => b.density * b.value - a.density * a.value);
  }

  /**
   * §7.3 — richness comes OUT of the composition rather than being rolled beside it. One
   * source: changing what is down there changes what the planet is worth, automatically.
   */
  function richnessOf(composition, archKey) {
    const out = CONST.RICHNESS_OUT;
    if (!composition || !composition.length) {
      const lean = ((POOL || {}).leans || {})[archKey];
      return lean ? out[0] + (out[1] - out[0]) * lean.depth : 1.00;
    }
    let raw = 0;
    for (const r of composition) raw += r.value * r.density;
    const lo = CONST.RICHNESS_RAW[0], hi = CONST.RICHNESS_RAW[1];
    const t = P.clamp((raw - lo) / (hi - lo), 0, 1);
    return P.roundTo(out[0] + (out[1] - out[0]) * t, 0.001);
  }

  /** §7.1 — what one unit of a resource is worth, relative to a middling mineral. */
  function resourceValue(id) {
    if (!POOL) return 1;
    for (const r of (POOL.resources || [])) if (r.id === id) return r.value;
    return 1;
  }
  function resourceCategory(id) {
    if (!POOL) return null;
    for (const r of (POOL.resources || [])) if (r.id === id) return r.category;
    return null;
  }

  const api = {
    CONST, ARCHETYPES, OBJECTIVE_TYPES, TERRAIN,
    generatePlanet, zoneOn, zoneNext, tighteningTomorrow, inZone, outsideBy, towardZone,
    revealObjectives, siteLive, windowCadence, dist, pointIn, clampInside,
    setResourcePool, rollComposition, richnessOf, resourceValue, resourceCategory,
    get pool() { return POOL; }
  };
  if (isNode) {
    try {
      const fs = require("fs"), path = require("path");
      for (const c of [path.join(__dirname, "planets.json"),
                       path.join(__dirname, "..", "data", "planets.json"),
                       path.join(__dirname, "data", "planets.json")]) {
        if (fs.existsSync(c)) { setResourcePool(JSON.parse(fs.readFileSync(c, "utf8"))); break; }
      }
    } catch (e) { /* a planet with no composition still generates; §7.3 falls back */ }
  }
  if (isNode) module.exports = api;
  global.CDMAP = api;
})(typeof window !== "undefined" ? window : globalThis);
