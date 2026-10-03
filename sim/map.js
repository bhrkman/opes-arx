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
      name: "Ice Shelf", seaLevel: 0.21, waterName: 'Meltwater',
      terrain: [["open_basin", 45], ["broken_ground", 40], ["entrenched", 10], ["crevasse_field", 5]],
      forageMult: 0.25, supplyStrain: 1.15, bandBias: 0,
      hazards: [["cold", 34], ["whiteout", 26], ["crevasse", 18], ["storm", 22]],
      places: ["Shelf", "Rift", "Pale", "Drift", "Floe", "Sound", "Cairn", "Reach"],
      adjectives: ["White", "Iron", "Long", "Broken", "Still", "Bitter", "Grey", "Far"]
    },
    jungle_cradle: {
      name: "Jungle Cradle", seaLevel: 0.23, waterName: 'River',
      terrain: [["forest", 60], ["broken_ground", 25], ["deep_canopy", 10], ["open_basin", 5]],
      forageMult: 1.35, supplyStrain: 0.90, bandBias: 2,
      hazards: [["fever", 32], ["downpour", 30], ["heat", 20], ["rot", 18]],
      places: ["Canopy", "Hollow", "Green", "Basin", "Thicket", "Delta", "Shade", "Root"],
      adjectives: ["Deep", "Wet", "Old", "Tangled", "Low", "Quiet", "Fat", "Drowned"]
    },
    desert_pan: {
      name: "Desert Pan", seaLevel: 0, waterName: 'Water',
      terrain: [["open_basin", 58], ["broken_ground", 30], ["salt_flats", 8], ["entrenched", 4]],
      forageMult: 0.15, supplyStrain: 1.20, bandBias: 0,
      hazards: [["heat", 36], ["thirst", 28], ["sandstorm", 24], ["glare", 12]],
      places: ["Pan", "Flat", "Scarp", "Wash", "Dune", "Salt", "Mesa", "Draw"],
      adjectives: ["Wide", "Red", "Blind", "Empty", "Hot", "Cracked", "Long", "Bright"]
    },
    volcanic_waste: {
      name: "Volcanic Waste", seaLevel: 0.19, waterName: 'Lava',
      terrain: [["broken_ground", 48], ["lava_field", 24], ["open_basin", 18], ["entrenched", 10]],
      forageMult: 0.45, supplyStrain: 1.10, bandBias: 1,
      hazards: [["ashfall", 32], ["gas_vent", 28], ["tremor", 22], ["heat", 18]],
      places: ["Caldera", "Flow", "Vent", "Slag", "Cone", "Ridge", "Fume", "Crag"],
      adjectives: ["Black", "Burnt", "Sullen", "New", "Hard", "Smoking", "Low", "Cinder"]
    },
    drowned_world: {
      name: "Drowned World", seaLevel: 0.30, waterName: 'Sea',
      terrain: [["broken_ground", 34], ["forest", 24], ["tidal_marsh", 22], ["open_basin", 20]],
      forageMult: 0.85, supplyStrain: 1.00, bandBias: 1,
      hazards: [["flooding", 34], ["cold", 24], ["current", 24], ["storm", 18]],
      places: ["Shallows", "Causeway", "Bank", "Spit", "Narrows", "Mouth", "Bar", "Weir"],
      adjectives: ["Grey", "Slow", "Sunk", "Half", "Green", "Cold", "Thin", "Turning"]
    },
    dead_industrial: {
      name: "Dead Industrial", seaLevel: 0.22, waterName: 'Flood',
      terrain: [["ruins", 46], ["entrenched", 24], ["broken_ground", 22], ["open_basin", 8]],
      forageMult: 0.30, supplyStrain: 1.05, bandBias: 2, salvage: true,
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
  const OBJECTIVE_TYPES = [
    /* §RESERVE a cache is a LANDING BEACON: held, not looted, and an OA's reserve lands on it (divide.js) */
    { id: "sponsor_cache",  label: "Landing Beacon", weight: 34, claimDays: 2 },   /* 22 → 34: two a planet were brawls, not landings */
    { id: "munitions_drop", label: "Munitions Drop", weight: 22, claimDays: 2 },
    /* §SITES a rest site: food and shelter. It fed a squad and did nothing for its hurt, so a
       wounded squad had no place on the map to go to — now it mends them too, which gives a
       beaten squad a reason to walk somewhere and a hunter a place to look for it */
    { id: "ration_site",    label: "Rest Site",      weight: 20, claimDays: 2 },
    /* §7.4 A SITE IS NAMED FOR WHAT IS IN IT. It was an "ore assay" whatever the ground held,
       which read as mining even where the haul was grain or water, and "assay" is a surveyor's
       word for a thing a squad does with its hands. A deposit is a seam, a well, a stand or a
       vault by its category, and a squad WORKS it. */
    { id: "resource_site",  label: "Deposit",       weight: 34, claimDays: 2 },
    { id: "relay_mast",     label: "Relay Mast",     weight: 14, claimDays: 2 },
    /* §SITES A STRONGPOINT: ground worth fighting FROM. It is held, not emptied — a squad that
       stands on one fights from better ground for as long as it stays — and it is placed only
       in the EARLY waves, on the outer ground, so the closing wall retires it. That makes it a
       middle-game prize to hold while you can and then leave, rather than a place to sit out
       the contest (ruled: not in the centre). */
    { id: "strongpoint",    label: "Strongpoint",    weight: 16, claimDays: 1, maxWave: 1 }
  ];

  /* §7 what a planet is made of. Loaded from planets.json in node; a viewer injects it with
     `setResourcePool`. Absent, a planet generates with no composition and richness falls back
     to the archetype lean, which is what the pre-Step-7 code did. */
  let POOL = null;
  function setResourcePool(pool) { POOL = pool || null; return POOL; }

  const CONST = {
    PCD_MAX: 4,                         // [S] §LIGHT cycles per day at the fast end (and 1/4 at the slow end)
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
    RELAY_COOLDOWN: 3,                   // [C] days a fired mast stays dark
    LOOT_TICKS: 2,                       // [S] long enough to be interrupted, not an occupation
  };

  function placeName(rng, arch, used) {
    for (let i = 0; i < 14; i++) {
      const n = P.pick(rng, arch.adjectives) + " " + P.pick(rng, arch.places);
      if (!used.has(n)) { used.add(n); return n; }
    }
    return P.pick(rng, arch.adjectives) + " " + P.pick(rng, arch.places) + " " + (used.size + 1);
  }

  /* §GROUND THE PLANET IS THE DOSSIER. What it is made of and worth, its hazards, its light, its name — what the
     board writes its card against and the survey reads. The ground it is fought on is sim/ground.js, generated
     with the season from the world seed; the disc, its patches, hills, water and ring went with the ring. */
  function generatePlanet(rng, opts) {
    opts = opts || {};
    const keys = Object.keys(ARCHETYPES);
    const archKey = opts.archetype && ARCHETYPES[opts.archetype] ? opts.archetype : P.pick(rng, keys);
    const arch = ARCHETYPES[archKey];
    const composition = rollComposition(rng, archKey);
    const richness = richnessOf(composition, archKey);
    /* §LIGHT TERMS (ruled). A DAY is the fleet's: twenty-four Earth hours, the unit of its calendar and
       of the Divide. A CYCLE is the planet's: one full turn, light and then dark. A planet's stat is its
       PCD — planetary CYCLES PER DAY — from 0.25 (one cycle every four days: two days of light, two of
       dark) to 4 (four cycles in a day), any value between, and likeliest near one. It has nothing to do
       with the fleet's clock. Drawn as a triangle in log space, so PCD 4 is exactly as rare as PCD 0.25;
       derived from the planet's own make-up rather than the generation stream. */
    const lightRng = P.mulberry32(P.seedFrom('light:' + archKey + ':' + JSON.stringify(composition) + ':' + richness));
    const lnPcd = Math.log(CONST.PCD_MAX) * (lightRng() + lightRng() - 1);
    const pcd = Math.round(Math.exp(lnPcd) * 100) / 100;
    const hours = 24 / pcd;
    const cycle = { pcd, hours, phase: lightRng() * hours };
    let flood = 0;
    return {
      cycle,
      archetype: archKey, archetypeName: arch.name,
      composition, richness,             // §7.2, §7.3 — one source for how good this world is
      supplyStrain: arch.supplyStrain, forageMult: arch.forageMult, salvage: !!arch.salvage,
      hazards: arch.hazards, bandBias: arch.bandBias, waterName: arch.waterName || 'Water',
      /* the weather's flood, kept as a figure for the day's reading */
      setFlood: h => { flood = Math.max(0, h || 0); }, floodNow: () => flood
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

  function resourceCategory(id) {
    if (!POOL) return null;
    for (const r of (POOL.resources || [])) if (r.id === id) return r.category;
    return null;
  }

  const api = {
    CONST, ARCHETYPES, OBJECTIVE_TYPES, DEPOSIT_LABEL, TERRAIN, TERRAIN_NAMES,
    generatePlanet, lightAt, placeName,
    setResourcePool, rollComposition, richnessOf, resourceCategory,
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
