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
  /* FOUR TERRAINS EVERY WORLD CAN HAVE, and one that belongs to each kind of world. Ruins on a
     planet nobody ever lived on were a strange sight; ruins are Dead Industrial's now, and
     every other archetype has its own — a crevasse field, the deep canopy, salt flats, a lava
     field, a tidal marsh — with its own concealment, forage and going, and its own cover
     profile in combat.js. `special` names it. */
  const TERRAIN = {
    open_basin:     { conceal: 1.30, forage: 0, speed: 1.15 },
    broken_ground:  { conceal: 1.00, forage: 1, speed: 0.95 },
    forest:         { conceal: 0.70, forage: 3, speed: 0.80 },
    entrenched:     { conceal: 0.85, forage: 0, speed: 0.75 },
    /* the specials */
    ruins:          { conceal: 0.75, forage: 1, speed: 0.85, special: 'dead_industrial' },
    crevasse_field: { conceal: 0.80, forage: 0, speed: 0.65, special: 'ice_shelf' },
    deep_canopy:    { conceal: 0.55, forage: 3, speed: 0.70, special: 'jungle_cradle' },
    salt_flats:     { conceal: 1.50, forage: 0, speed: 1.25, special: 'desert_pan' },
    lava_field:     { conceal: 0.90, forage: 0, speed: 0.60, special: 'volcanic_waste' },
    tidal_marsh:    { conceal: 0.80, forage: 2, speed: 0.60, special: 'drowned_world' }
  };
  const TERRAIN_NAMES = {
    open_basin: 'Open Basin', broken_ground: 'Broken Ground', forest: 'Forest', entrenched: 'Entrenched',
    ruins: 'Ruins', crevasse_field: 'Crevasse Field', deep_canopy: 'Deep Canopy', salt_flats: 'Salt Flats',
    lava_field: 'Lava Field', tidal_marsh: 'Tidal Marsh'
  };

  const ARCHETYPES = {
    ice_shelf: {
      name: "Ice Shelf", seaLevel: 0.21,
      terrain: [["open_basin", 45], ["broken_ground", 40], ["entrenched", 10], ["crevasse_field", 5]],
      forageMult: 0.25, supplyStrain: 1.15,
      hazards: [["cold", 34], ["whiteout", 26], ["crevasse", 18], ["storm", 22]],
      places: ["Shelf", "Rift", "Pale", "Drift", "Floe", "Sound", "Cairn", "Reach"],
      adjectives: ["White", "Iron", "Long", "Broken", "Still", "Bitter", "Grey", "Far"]
    },
    jungle_cradle: {
      name: "Jungle Cradle", seaLevel: 0.23,
      terrain: [["forest", 60], ["broken_ground", 25], ["deep_canopy", 10], ["open_basin", 5]],
      forageMult: 1.35, supplyStrain: 0.90,
      hazards: [["fever", 32], ["downpour", 30], ["heat", 20], ["rot", 18]],
      places: ["Canopy", "Hollow", "Green", "Basin", "Thicket", "Delta", "Shade", "Root"],
      adjectives: ["Deep", "Wet", "Old", "Tangled", "Low", "Quiet", "Fat", "Drowned"]
    },
    desert_pan: {
      name: "Desert Pan", seaLevel: 0,
      terrain: [["open_basin", 58], ["broken_ground", 30], ["salt_flats", 8], ["entrenched", 4]],
      forageMult: 0.15, supplyStrain: 1.20,
      hazards: [["heat", 36], ["thirst", 28], ["sandstorm", 24], ["glare", 12]],
      places: ["Pan", "Flat", "Scarp", "Wash", "Dune", "Salt", "Mesa", "Draw"],
      adjectives: ["Wide", "Red", "Blind", "Empty", "Hot", "Cracked", "Long", "Bright"]
    },
    volcanic_waste: {
      name: "Volcanic Waste", seaLevel: 0.19,
      terrain: [["broken_ground", 48], ["lava_field", 24], ["open_basin", 18], ["entrenched", 10]],
      forageMult: 0.45, supplyStrain: 1.10,
      hazards: [["ashfall", 32], ["gas_vent", 28], ["tremor", 22], ["heat", 18]],
      places: ["Caldera", "Flow", "Vent", "Slag", "Cone", "Ridge", "Fume", "Crag"],
      adjectives: ["Black", "Burnt", "Sullen", "New", "Hard", "Smoking", "Low", "Cinder"]
    },
    drowned_world: {
      name: "Drowned World", seaLevel: 0.30,
      terrain: [["broken_ground", 34], ["forest", 24], ["tidal_marsh", 22], ["open_basin", 20]],
      forageMult: 0.85, supplyStrain: 1.00,
      hazards: [["flooding", 34], ["cold", 24], ["current", 24], ["storm", 18]],
      places: ["Shallows", "Causeway", "Bank", "Spit", "Narrows", "Mouth", "Bar", "Weir"],
      adjectives: ["Grey", "Slow", "Sunk", "Half", "Green", "Cold", "Thin", "Turning"]
    },
    dead_industrial: {
      name: "Dead Industrial", seaLevel: 0.22,
      terrain: [["ruins", 46], ["entrenched", 24], ["broken_ground", 22], ["open_basin", 8]],
      forageMult: 0.30, supplyStrain: 1.05, salvage: true,
      hazards: [["collapse", 32], ["toxicity", 30], ["void", 20], ["fire", 18]],
      places: ["Works", "Yard", "Stack", "Line", "Pit", "Gantry", "Furnace", "Terminus"],
      adjectives: ["Cold", "Spent", "Number", "Long", "Dry", "Silent", "Upper", "Lower"]
    }
  };

  /* WHAT A DEPOSIT IS CALLED, by what is raw in it. Ferrite and chromite lie in a SEAM;
     helium-3 and clathrate are drawn from a WELL; algae, lichen and fungal mass grow in a
     BLOOM; pigment salt, songcoral, resin and amber lie in a BED. A stand and a vault were the wrong
     words twice over — both belong to somebody who was here first, and nobody was. */
  const DEPOSIT_LABEL = { minerals: 'Seam', fuels: 'Well', foods: 'Bloom', luxuries: 'Bed' };

  /* §7 what a planet is made of. Loaded from planets.json in node; a viewer injects it with
     `setResourcePool`. Absent, a planet generates with no composition and an average worth. */
  let POOL = null;
  function setResourcePool(pool) { POOL = pool || null; return POOL; }

  const CONST = {
    PCD_MAX: 4,                         // [S] §LIGHT cycles per day at the fast end (and 1/4 at the slow end)
    /* §7.2 (ruled) EVERY PLANET CARRIES SOME OF EVERYTHING, AND MUCH MORE OF SOME. Each of the four stores is on every
       world, in an amount measured as what it would put in a fleet hold: a planet rich in a store fills one from empty,
       a slim one a fifth of one. The archetype's lean says which it is rich in. */
    STORE_SLIM: 0.20,                    // [R] a hold's share of a store a planet is slim in
    STORE_RICH: 1.00,                    // [R] and one it is rich in: a full hold
    STORE_SWING: 0.30,                   // [C] how far a world strays from its archetype's lean
    /* §7.3 (ruled) A RESOURCE HAS A PRICE. A unit of a resource is worth its `value` times this, in credits: what a dug
       site pays its digger for what it brought home, and what a planet is worth. */
    CREDITS_PER_UNIT: 12.5,              // [C] calibrated: the average dug site pays about ₡15k (the ruled quick buck), from ₡5k to ₡27k
    /* the pot is the desk's share of what a planet is worth: NEG.POT_BASE on a world of average worth */
    WORTH_MEAN: 2.66,                    // [C] calibrated: Σ amount×value of the average world (most pots fall ₡335k–₡475k)
    RELAY_COOLDOWN: 3,                   // [C] days a fired mast stays dark
    LOOT_TICKS: 2,                       // [S] long enough to be interrupted, not an occupation
  };

  /* §GROUND THE PLANET IS THE DOSSIER. What it is made of and worth, its hazards, its light, its name — what the
     board writes its card against and the survey reads. The ground it is fought on is sim/ground.js, generated
     with the season from the world seed; the disc, its patches, hills, water and ring went with the ring. */
  function generatePlanet(rng, opts) {
    opts = opts || {};
    const keys = Object.keys(ARCHETYPES);
    const archKey = opts.archetype && ARCHETYPES[opts.archetype] ? opts.archetype : P.pick(rng, keys);
    const arch = ARCHETYPES[archKey];
    const composition = rollComposition(rng, archKey);
    const worth = worthOf(composition);
    /* §LIGHT TERMS (ruled). A DAY is the fleet's: twenty-four Earth hours, the unit of its calendar and
       of the Divide. A CYCLE is the planet's: one full turn, light and then dark. A planet's stat is its
       PCD — planetary CYCLES PER DAY — from 0.25 (one cycle every four days: two days of light, two of
       dark) to 4 (four cycles in a day), any value between, and likeliest near one. It has nothing to do
       with the fleet's clock. Drawn as a triangle in log space, so PCD 4 is exactly as rare as PCD 0.25;
       derived from the planet's own make-up rather than the generation stream. */
    const lightRng = P.mulberry32(P.seedFrom('light:' + archKey + ':' + JSON.stringify(composition) + ':' + worth));
    const lnPcd = Math.log(CONST.PCD_MAX) * (lightRng() + lightRng() - 1);
    const pcd = Math.round(Math.exp(lnPcd) * 100) / 100;
    const hours = 24 / pcd;
    const cycle = { pcd, hours, phase: lightRng() * hours };
    return {
      cycle,
      archetype: archKey, archetypeName: arch.name,
      composition, worth,                // §7.2, §7.3 — one source for how good this world is
      supplyStrain: arch.supplyStrain, forageMult: arch.forageMult, salvage: !!arch.salvage,
      hazards: arch.hazards
    };
  }

  /* §LIGHT whether the planet is dark at an hour of the contest (hour 0 = the drop), and how many
     hours until it turns — the planet's cycle, not the fleet's day */
  function lightAt(planet, hour) {
    const c = (planet && planet.cycle) || { pcd: 1, hours: 24, phase: 0 };
    const t = (((hour + c.phase) % c.hours) + c.hours) % c.hours;
    const half = c.hours / 2;
    const dark = t >= half;
    return { dark, toChange: dark ? c.hours - t : half - t, hours: c.hours, pcd: c.pcd };
  }
  function rollComposition(rng, archKey) {
    if (!POOL) return [];
    const lean = (POOL.leans || {})[archKey] || {};
    const cats = POOL.categories || [];
    const top = Math.max(0.0001, ...cats.map(c => lean[c] || 0));
    const out = [];
    for (const cat of cats) {
      const eligible = (POOL.resources || []).filter(r => r.category === cat && (!r.salvage || archKey === 'dead_industrial'));
      if (!eligible.length) continue;
      const rel = P.clamp((lean[cat] || 0) / top + (rng() - 0.5) * CONST.STORE_SWING, 0, 1);
      const amount = CONST.STORE_SLIM + (CONST.STORE_RICH - CONST.STORE_SLIM) * rel;
      /* a store a planet is rich in runs in more than one kind of ground */
      const n = Math.min(eligible.length, 1 + (amount >= 0.45 ? 1 : 0) + (amount >= 0.80 ? 1 : 0));
      const bag = eligible.slice(), picks = [];
      while (picks.length < n && bag.length) { const r = P.pick(rng, bag); bag.splice(bag.indexOf(r), 1); picks.push({ r, w: 0.5 + rng() }); }
      const wSum = picks.reduce((t, x) => t + x.w, 0);
      for (const x of picks) out.push({ id: x.r.id, name: x.r.name, category: cat, value: x.r.value, density: P.roundTo(amount * x.w / wSum, 0.01) });
    }
    return out.sort((a, b) => b.density * b.value - a.density * a.value);
  }

  /* how much of each store a planet carries, as a share of a hold (ruled: slim a fifth, rich a full hold) */
  function storesOf(composition) {
    const out = {};
    for (const r of composition || []) out[r.category] = (out[r.category] || 0) + (r.density || 0);
    for (const k in out) out[k] = P.roundTo(Math.min(CONST.STORE_RICH, out[k]), 0.01);
    return out;
  }
  /* what a unit of a resource is worth, in credits */
  function unitPrice(resourceId) {
    const r = POOL && (POOL.resources || []).find(x => x.id === resourceId);
    return (r ? r.value : 1) * CONST.CREDITS_PER_UNIT;
  }
  /* a planet's worth against the average world's: 1 is average, and the pot is NEG.POT_BASE times it */
  function worthOf(composition) {
    let raw = 0;
    for (const r of composition || []) raw += (r.value || 1) * (r.density || 0);
    return raw > 0 ? P.roundTo(raw / CONST.WORTH_MEAN, 0.001) : 1;
  }

  function resourceCategory(id) {
    if (!POOL) return null;
    for (const r of (POOL.resources || [])) if (r.id === id) return r.category;
    return null;
  }

  const api = {
    CONST, ARCHETYPES, DEPOSIT_LABEL, TERRAIN, TERRAIN_NAMES,
    generatePlanet, lightAt,
    setResourcePool, rollComposition, storesOf, unitPrice, worthOf, resourceCategory,
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
