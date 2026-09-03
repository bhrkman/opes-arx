/* Capital Divide — /sim/roster.js  (Step 2 generation stack, consolidated)
 *
 * One file, four modules, unchanged behaviour: namegen · recruitgen · commentary · roster.
 * They were four uploads and one dependency chain; merging them costs nothing and removes
 * three files from every handoff. Each section is the original module verbatim apart from
 * its require/export lines.
 *
 *   CDNAMEGEN   name generation for the nine races (RACES.md Q28)
 *   CDRECRUIT   recruit generation: stats, traits, contracts, pricing
 *   CDCOMMENT   broadcast commentary selection
 *   CDROSTER    squad assembly for combat  ← module.exports
 *
 * Seeded via CDPRNG; no Math.random. UMD-ish, same pattern as the rest of /sim.
 */
(function (globalRoot) {
  "use strict";
  const isNodeRoot = typeof module !== "undefined" && module.exports;
  if (isNodeRoot) require("./prng.js");
  function __req(which) {
    const g = typeof window !== "undefined" ? window : globalThis;
    if (which === "items")
      return g.CDITEMS || (typeof require === "function" ? require("./items.js") : null);
    return which === "prng" ? g.CDPRNG : which === "namegen" ? g.CDNAMEGEN : g.CDRECRUIT;
  }

/* ================= namegen.js ================= */
/* Capital Divide — /sim/namegen.js
 * Name generation for the nine playable races, implementing the RATIFIED
 * conventions in RACES.md (Q28; current at v0.4). Data-driven from races.json naming blocks;
 * this file owns only structure. Seeded via CDPRNG; no Math.random.
 *
 * Styles: diaspora_list (human) · soft_two_word (kellis) · paired_halves (mon_wa)
 *         the_title (olmac) · vowel_starved (thythyn) · pride_classical (svalbard)
 *         doubled_mononym (etu) · onomatopoeia (attorak) · latinate_nickname (gil)
 *
 * Also exports: widowName() — Em-/-Em marks (canon) · applyEtHonorific() (ratified)
 *
 * Step 3 note: widowName() is consumed by COMBAT.md §8.1's bond-shock roll — when a
 * Mon-Wa half dies mid-engagement, a traumatised survivor is renamed here. That path
 * fires roughly 1.5 times per Divide fleet-wide (T13), so this is load-bearing, not
 * decorative.
 */
(function (global) {
  "use strict";
  const P = (typeof module !== "undefined" && module.exports)
    ? __req("prng")
    : global.CDPRNG;

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ------------------------------------------------------------------ */
  /* Per-style generators. Each returns { name, parts } where parts     */
  /* carries structured pieces (family/house/pride, halves, nickname).  */
  /* ------------------------------------------------------------------ */

  const styles = {

    /** Human — Earth-diaspora given + family lists; rare corp-tinged surnames. */
    diaspora_list(rng, n) {
      const given = P.pick(rng, n.givens);
      const family = P.chance(rng, n.corp_tinged_chance || 0)
        ? P.pick(rng, n.corp_tinged_families)
        : P.pick(rng, n.families);
      return { name: given + " " + family, parts: { given, family } };
    },

    /** Kellis — two soft measured words, head+tail syllables, no hard clusters. */
    soft_two_word(rng, n) {
      const word = () => {
        let w = P.pick(rng, n.heads) + P.pick(rng, n.tails);
        // Soften accidental doubles across the seam (e.g. "Kaan" fine, "Kall" fine,
        // but avoid triple letters like "Shaa"+"an").
        w = w.replace(/([a-z])\1\1+/gi, "$1$1");
        return cap(w.toLowerCase());
      };
      let given = word(), family = word();
      let guard = 0;
      while (family === given && guard++ < 8) family = word();
      return { name: given + " " + family, parts: { given, family } };
    },

    /** Mon-Wa — two halves, 3–4 letters, addressed {Mon}-{Wa}. */
    paired_halves(rng, n) {
      const mon = P.pick(rng, n.halves);
      let wa = P.pick(rng, n.halves);
      let guard = 0;
      while (wa === mon && guard++ < 8) wa = P.pick(rng, n.halves);
      return { name: mon + "-" + wa, parts: { mon, wa } };
    },

    /** Olmac — the definite article + one evocative title. */
    the_title(rng, n) {
      const title = P.pick(rng, n.titles);
      return { name: "The " + title, parts: { title } };
    },

    /** Thythyn — vowel-starved y-syllable given + doubled-consonant family. */
    vowel_starved(rng, n) {
      const onset = P.pick(rng, n.given_onsets);
      let coda = P.pick(rng, n.given_codas);
      // Avoid onset==coda single letters reading flat (e.g. "Sys" is fine, "Lyl" fine — allow).
      const given = cap((onset + "y" + coda).toLowerCase());
      const family = cap((P.pick(rng, n.family_starts) + P.pick(rng, n.family_doubles) + P.pick(rng, n.family_endings)).toLowerCase());
      return { name: given + " " + family, parts: { given, family } };
    },

    /** Svalbard — classical melodic given + finite pride name (repeats are kin). */
    pride_classical(rng, n) {
      const given = cap((P.pick(rng, n.given_stems) + P.pick(rng, n.given_endings)).toLowerCase());
      const pride = P.pick(rng, n.prides);
      return { name: given + " " + pride, parts: { given, pride, family: pride } };
    },

    /** Etu — hard mononym with a mandatory doubled letter; Et- applied later by trait. */
    doubled_mononym(rng, n) {
      const head = P.pick(rng, n.heads);
      const headEndsVowel = /[aeiou]$/i.test(head);
      // Vowel doubles (uu/oo) only read right after a consonant (Koruuth, not "Tauua").
      let dbl = P.pick(rng, n.doubles);
      let guard = 0;
      while (headEndsVowel && /^[aeiou]/i.test(dbl) && guard++ < 8) dbl = P.pick(rng, n.doubles);
      let tail = P.pick(rng, n.tails);
      let w = head + dbl + tail;
      w = w.replace(/([a-z])\1\1+/gi, "$1$1"); // collapse triples ("Kor"+"rr" → "Korr")
      if (!/([a-z])\1/i.test(w)) w = head + dbl; // the doubled letter is mandatory (canon)
      if (w.length < 4) w = head + dbl + (P.pick(rng, n.tails.filter(function (t) { return t.length > 0; })) || "ek");
      w = w.replace(/([a-z])\1\1+/gi, "$1$1");
      return { name: cap(w.toLowerCase()), parts: { mononym: cap(w.toLowerCase()) } };
    },

    /** Attorak — onomatopoeia; occasional reduplication (Tak-Tak). */
    onomatopoeia(rng, n) {
      const base = P.pick(rng, n.bases);
      const name = P.chance(rng, n.reduplication_chance || 0) ? base + "-" + base : base;
      return { name, parts: { base } };
    },

    /** Gil — long Latinate given (4–5 syl) → 3-letter nickname + finite house. */
    latinate_nickname(rng, n) {
      const head = P.pick(rng, n.given_heads);
      let mid = P.pick(rng, n.given_mids);
      // Consonant meeting consonant takes a linking vowel: Amb+e+lor+ius (canon pattern).
      if (/[^aeiou]$/i.test(head) && /^[^aeiou]/i.test(mid)) mid = P.pick(rng, ["e", "o", "i"]) + mid;
      const end = P.pick(rng, n.given_endings);
      let full = head + mid + end;
      full = full.replace(/([a-z])\1\1+/gi, "$1$1");
      full = cap(full.toLowerCase());
      const nick = cap(full.slice(0, 3).toLowerCase());
      const house = P.pick(rng, n.houses);
      return {
        name: full + " (" + nick + ") " + house,
        parts: { given: full, nickname: nick, house, family: house }
      };
    }
  };

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Generate a name for a race.
   * @param rng    seeded rng from CDPRNG
   * @param race   race object from races.json (needs .naming)
   * @returns { name, parts, style }
   */
  function generateName(rng, race) {
    const n = race.naming;
    const fn = styles[n.style];
    if (!fn) throw new Error("namegen: unknown style '" + n.style + "' for race " + race.id);
    const out = fn(rng, n);
    out.style = n.style;
    return out;
  }

  /**
   * Widow rename for a surviving Mon-Wa half (canon, ratified):
   *   widowed Mon → "Em-{name}"   ·   widowed Wa → "{name}-Em"
   * @param halfName  the survivor's own half name (e.g. "Mak")
   * @param half      "mon" | "wa"
   */
  function widowName(halfName, half, naming) {
    const pre = (naming && naming.widow_prefix) || "Em-";
    const suf = (naming && naming.widow_suffix) || "-Em";
    return half === "mon" ? pre + halfName : halfName + suf;
  }

  /**
   * Apply the Et- honorific (ratified: clergy and zealots) to an Etu mononym.
   * Idempotent.
   */
  function applyEtHonorific(name, naming) {
    const pre = (naming && naming.honorific_prefix) || "Et-";
    return name.startsWith(pre) ? name : pre + name;
  }

  /** Pick a broadcast callsign from the recruitment.json bank. */
  function generateCallsign(rng, callsignData) {
    return P.pick(rng, callsignData.bank);
  }

  /** Batch preview helper for eyeballing: n names for a race. */
  function sample(rng, race, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(generateName(rng, race).name);
    return out;
  }

  const api = { generateName, widowName, applyEtHonorific, generateCallsign, sample, styles };
  global.CDNAMEGEN = api;
})(typeof window !== "undefined" ? window : globalThis);


/* ================= recruitgen.js ================= */
/* Capital Divide — /sim/recruitgen.js
 * Recruit generation for the three pools (DESIGN.md §10):
 *   Natties (T2 tryouts, corp-demographic-weighted) · Mercs (T5 market) · Prisoners (T4 Kier auction)
 * Produces fighter objects valid against schemas/fighter.schema.json, wrapped with
 * generator metadata (scout view, market view, pair info) that stays OUT of the
 * fighter record so saves remain schema-pure.
 * Seeded via CDPRNG (mulberry32); no Math.random. Data-driven from /data.
 *
 * Step 3 note: produces fighters valid against fighter.schema.json v0.5. Arrival
 * injuries now use the COMBAT.md §7 injury ids so the Divide's degradation clock
 * (§7.1) can read them — they arrive `untreated`, which under the ratified evac
 * model (DIVIDE_POLICY.md §5) means they worsen if the Divide starts before a
 * medic sees them. `history.evacs` counts field recoveries, not departures: nothing
 * leaves a Divide.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? __req("prng") : global.CDPRNG;
  const NG = isNode ? __req("namegen") : global.CDNAMEGEN;

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const STATS = ["aim", "grit", "reflex", "fieldcraft", "tactics", "presence", "resolve"];

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function idSuffix(rng) {
    let s = "";
    for (let i = 0; i < 4; i++) s += "abcdefghjkmnpqrstuvwxyz23456789"[P.int(rng, 0, 30)];
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Core generator                                                      */
  /* ------------------------------------------------------------------ */

  function Generator(data) {
    this.races = data.races.races;
    this.traits = data.traits.traits;
    this.rec = data.recruitment;
    this.oa = data.oa ? data.oa.oa_profiles : [];
    this.raceById = {};
    for (const r of this.races) this.raceById[r.id] = r;
    this.traitById = {};
    for (const t of this.traits) this.traitById[t.id] = t;
    this.corpById = {};
    for (const c of this.oa) this.corpById[c.id] = c;
  }

  /** Race selection: pool base weights × (nattie only) corp ship demographics. */
  Generator.prototype.pickRace = function (rng, pool, corpId, raceFilter) {
    if (raceFilter) return this.raceById[raceFilter];
    const corp = pool === "nattie" && corpId ? this.corpById[corpId] : null;
    const entries = [];
    for (const r of this.races) {
      let w = r.pool_weights[pool === "mercenary" ? "merc" : pool] || 0;
      if (corp && corp.race_weights && corp.race_weights[r.id]) w *= corp.race_weights[r.id];
      if (w > 0) entries.push([r.id, w]);
    }
    return this.raceById[P.weightedPick(rng, entries)];
  };

  /** One 1–20 stat: normal(base_mean + qualityShift) + race lean, floored & clamped. */
  Generator.prototype.rollStat = function (rng, race, statName, qualityShift) {
    const m = this.rec.stat_model;
    let v = Math.round(P.normal(rng, m.base_mean + qualityShift, m.base_sd));
    v += (race.stat_leans && race.stat_leans[statName]) || 0;
    if (race.stat_floor) v = Math.max(v, race.stat_floor);
    return P.clamp(v, m.clamp[0], m.clamp[1]);
  };

  Generator.prototype.rollStats = function (rng, race, qualityShift) {
    const s = {};
    for (const k of STATS) s[k] = this.rollStat(rng, race, k, qualityShift);
    return s;
  };

  Generator.prototype.rollAge = function (rng, race, pool) {
    const a = race.age;
    if (pool === "nattie") {
      // Tryout kids: recruit_min .. +8, skewed young.
      const span = 8;
      return a.recruit_min + Math.floor(Math.pow(rng(), 1.7) * (span + 1));
    }
    if (pool === "mercenary") {
      // Prime-centered, wide.
      const mid = (a.prime[0] + a.prime[1]) / 2;
      const sd = (a.prime[1] - a.prime[0]) / 3.2;
      return Math.round(P.clamp(P.normal(rng, mid, sd), a.recruit_min + 2, a.venerable - 2));
    }
    // Prisoner: recruit_min+3 .. decline+4, wide and flat-ish.
    return P.int(rng, a.recruit_min + 3, a.decline + 4);
  };

  /** Hidden potential: gap above current max shrinks with age. */
  Generator.prototype.rollPotential = function (rng, race, age, stats) {
    const pm = this.rec.potential_model;
    const a = race.age;
    const t = P.clamp((age - a.recruit_min) / Math.max(1, a.prime[1] - a.recruit_min), 0, 1);
    const mean = pm.gap_start_mean * (1 - t) + pm.gap_end_mean * t;
    const gap = Math.max(0, Math.round(P.normal(rng, mean, pm.gap_sd)));
    const maxStat = Math.max.apply(null, STATS.map((k) => stats[k]));
    return P.clamp(maxStat + gap, Math.max(1, maxStat), 20);
  };

  Generator.prototype.scoutView = function (rng, potential) {
    const sm = this.rec.scout_model;
    const est = P.clamp(Math.round(potential + P.normal(rng, 0, sm.estimate_sd)), 1, 20);
    const starsLow = P.clamp(Math.round((est - 2) / sm.star_divisor), 1, 5);
    const starsHigh = P.clamp(Math.round((est + 2) / sm.star_divisor), 1, 5);
    return { estimate: est, starsLow, starsHigh };
  };

  /* ---------------------------- Traits ------------------------------ */

  Generator.prototype.rollTraits = function (rng, race, origin, batchTally) {
    const tm = this.rec.trait_model;
    const decay = tm.batch_repeat_decay === undefined ? 1 : tm.batch_repeat_decay;
    const seen = batchTally || {};
    const chosen = [];
    const blocked = new Set();
    const take = (id) => {
      const t = this.traitById[id];
      chosen.push(id);
      if (t && t.conflicts) for (const c of t.conflicts) blocked.add(c);
    };

    // 1) Pool draws.
    let count = parseInt(P.weightedPick(rng, tm.count_weights), 10);
    /* the Bastille does not sell finishing-school graduates: its pool carries a chance of
       one extra draw taken from the NEGATIVE-tagged traits only, on top of the normal
       rolls — a lean, not a sentence, and the dial lives in recruitment.json */
    const poolBias = ((this.rec.pools || {})[origin] || {}).negative_trait_bias || 0;
    const biasDraw = poolBias && P.chance(rng, poolBias);
    if (biasDraw) count = Math.min(4, count + 1);
    const variety = (race.special && race.special.trait_variety_bonus) || 0;
    if (variety && P.chance(rng, variety)) count = Math.min(4, count + 1);

    for (let i = 0; i < count; i++) {
      const entries = [];
      const negOnly = biasDraw && i === count - 1;   /* the lean's draw is the extra one */
      for (const t of this.traits) {
        if (t.draw !== "pool") continue;
        if (negOnly && !(t.tags || []).includes("negative")) continue;
        if (chosen.includes(t.id) || blocked.has(t.id)) continue;
        if (t.race_locked && t.race_locked.length && !t.race_locked.includes(race.id)) continue;
        if (t.origin_locked && t.origin_locked.length && !t.origin_locked.includes(origin)) continue;
        let w = tm.rarity_weights[t.rarity] || 1;
        if (t.race_weight && t.race_weight[race.id]) w *= t.race_weight[race.id];
        if (t.origin_weight && t.origin_weight[origin]) w *= t.origin_weight[origin];
        if (seen[t.id]) w *= Math.pow(decay, seen[t.id]); // shuffle-bag damper within a batch
        entries.push([t.id, w]);
      }
      if (!entries.length) break;
      take(P.weightedPick(rng, entries));
    }

    // 2) Special lines (never in pool draws).
    // Et-y-Bellum devotion (etu).
    if (race.special && race.special.devotion_lines) {
      const d = race.special.devotion_lines;
      const r = rng();
      if (r < (d.et_y_bellum_zealot || 0)) take("et_y_bellum_zealot");
      else if (r < (d.et_y_bellum_zealot || 0) + (d.et_y_bellum_devout || 0)) take("et_y_bellum_devout");
    }
    // Gil psionics.
    if (race.special && race.special.psionics && P.chance(rng, race.special.psionics.latent_rate)) {
      take(P.weightedPick(rng, race.special.psionics.expressions));
    }
    // Cradleborn Resentment (never on humans — rate is 0 there by data).
    let resentful = false;
    if ((race.resentment_rate || 0) > 0 && P.chance(rng, race.resentment_rate)) {
      take("cradleborn_resentment");
      resentful = true;
    }
    // Ankoth sympathies (any race; likelier with resentment).
    const sl = tm.special_lines;
    const pSym = sl.ankoth_sympathizer_base * (resentful ? sl.ankoth_sympathizer_with_resentment_mult : 1);
    if (P.chance(rng, pSym)) take("ankoth_sympathizer");
    // Keshu grudge (attorak & gil).
    if ((race.id === "attorak" || race.id === "gil") && P.chance(rng, sl.keshu_grudge_rate)) {
      take("keshu_grudge");
    }
    return chosen;
  };

  /* --------------------------- Experience ---------------------------- */

  Generator.prototype.rollExperience = function (rng, race, pool, age) {
    const a = race.age;
    if (pool === "nattie") {
      return { divides: 0, battles: 0, dividends: P.chance(rng, 0.35) ? 1 : 0 };
    }
    if (pool === "mercenary") {
      const years = Math.max(0, age - a.prime[0]);
      const divides = P.clamp(Math.round(0.45 * years + P.normal(rng, 0, 1)), 0, 12);
      const battles = divides * P.int(rng, 2, 5) + P.int(rng, 0, 3);
      const dividends = P.int(rng, 0, Math.min(6, divides + 2));
      return { divides, battles, dividends };
    }
    // Prisoner: checkered — some green, some with prior service under other banners.
    const prior = P.clamp(Math.round(P.normal(rng, (age - a.recruit_min) / 6, 1)), 0, 8);
    const battles = prior * P.int(rng, 2, 4) + P.int(rng, 0, 2);
    return { divides: prior, battles, dividends: P.int(rng, 0, 2) };
  };

  /* ----------------------------- Pricing ----------------------------- */

  Generator.prototype.qualityPoints = function (stats) {
    const w = this.rec.pricing.qp_weights;
    let qp = 0;
    for (const k of STATS) qp += (stats[k] / 10) * w[k];   /* pricing was written for 1–20 */
    return qp;
  };

  Generator.prototype.primeFactor = function (race, age) {
    const pf = this.rec.pricing.prime_factor;
    if (age < race.age.prime[0]) return pf.pre_prime;
    if (age <= race.age.prime[1]) return pf.in_prime;
    return pf.declining;
  };

  Generator.prototype.salaryFor = function (race, pool, stats, age) {
    const pr = this.rec.pricing;
    const qp = this.qualityPoints(stats);
    const poolMult = this.rec.pools[pool].salary_mult;
    const raw = pr.salary_base * Math.pow(qp / pr.qp_norm, pr.qp_exponent) *
      (race.market.salary_mult || 1) * poolMult * this.primeFactor(race, age);
    return Math.max(pr.round_to, P.roundTo(raw, pr.round_to));
  };

  /* --------------------------- Assembly ------------------------------ */

  Generator.prototype.buildFighter = function (rng, opts) {
    const pool = opts.pool; // 'nattie' | 'mercenary' | 'prisoner'
    const race = opts.race;
    const poolCfg = this.rec.pools[pool];

    const qualityShift = P.normal(rng, poolCfg.quality_shift.mean, poolCfg.quality_shift.sd);
    const age = opts.age !== undefined ? opts.age : this.rollAge(rng, race, pool);
    const stats = this.rollStats(rng, race, qualityShift);
    let potential = this.rollPotential(rng, race, age, stats);
    const scout = this.scoutView(rng, potential);
    /* ×10 — THE SCALE MIGRATION (ruled). Everything ABOVE this line computes at the
       founding 1–20 scale, so every draw, clamp and rounding is bit-identical to the old
       world; here the three player-facing numbers scale together, exactly. Births are
       therefore always multiples of ten — the fine grain between them belongs to TRAINING,
       which is the entire point of the scale. Every consumer below and in every other
       module was swept to match, and the proof is the untouched snapshot gate: the same
       seeds fight the same fights to the same frame. */
    for (const k of STATS) stats[k] *= 10;
    potential *= 10;
    scout.estimate *= 10;
    /* AND THEN THE GRAIN BETWEEN THE TENS. The migration left every birth on a multiple of
       ten — 80/90/120/40 — which reads as a rounded-off number rather than a person. Each
       stat is nudged within its own decade and the nudges are then BALANCED to sum to zero,
       so the roll's shape is untouched: the same pools produce the same average fighter,
       and nobody is quietly stronger than the draw intended. Only the texture changes. */
    {
      /* the clamp is written on the FOUNDING 1-20 scale, so it has to be lifted with the
         stats it guards — applied raw it crushed every birth to twenty */
      const jitter = {}, floor = this.rec.stat_model.clamp[0] * 10,
            ceil = this.rec.stat_model.clamp[1] * 10;
      let sum = 0;
      for (const k of STATS) { jitter[k] = P.int(rng, -9, 9); sum += jitter[k]; }
      /* hand the rounding remainder back, one point at a time, to whoever can take it */
      const keys = STATS.slice();
      while (sum !== 0) {
        const k = keys[P.int(rng, 0, keys.length - 1)];
        const step = sum > 0 ? -1 : 1;
        if (Math.abs(jitter[k] + step) > 9) continue;
        jitter[k] += step; sum += step;
      }
      for (const k of STATS)
        stats[k] = P.clamp(stats[k] + jitter[k], floor, ceil);
    }
    const traitIds = opts.traits || this.rollTraits(rng, race, pool === "mercenary" ? "mercenary" : pool, opts.batchTally);
    /* STEP D — TWO BIRTHS, ZERO NEW DRAWS (the stream must not move):
       TRAIT STAT_MODS MADE LIVE. The data has carried them since the traits were written
       and nothing ever read them — marksman's eye worked only through its hook. They apply
       here, ×10 for the scale, and a gift can raise the ceiling: potential follows the
       best stat up.
       WEAPON-FAMILY SKILLS, born from origin. A hand's skill in a trade starts at the
       fighter's aim, leaned by where they learned to shoot — the leans live in
       recruitment.json beside the rest of the generation's numbers. Effective aim with a
       carried weapon is (aim + trade) / 2, read at combat's boundary. */
    for (const tid of traitIds) {
      const tdef = this.traitById[tid];
      const tm = tdef && tdef.effects && tdef.effects.stat_mods;
      if (tm) for (const k in tm)
        if (stats[k] != null)
          stats[k] = Math.max(10, Math.min(200, stats[k] + tm[k] * 10));
    }
    potential = Math.max(potential,
                         Math.max.apply(null, STATS.map(k => stats[k])));
    const leans = ((this.rec.origin_family_leans || {})[pool]) || {};
    /* items resolved lazily: by the first birth, every module is loaded in both worlds */
    const IT = typeof ITEMS !== 'undefined' && ITEMS ? ITEMS
             : (typeof __req === 'function' ? __req('items')
                : (typeof window !== 'undefined' ? window : globalThis).CDITEMS);
    const skills = {};
    for (const fam of IT.SKILL_FAMILIES)
      skills[fam.id] = Math.max(10, Math.min(200,
                                             stats.aim + (leans[fam.id] || 0) * 10));

    // Name (Et- honorific for etu clergy/zealots — ratified).
    let named = opts.named || NG.generateName(rng, race);
    let displayName = named.name;
    if (race.id === "etu" && (traitIds.includes("et_y_bellum_zealot") || traitIds.includes("war_priest"))) {
      displayName = NG.applyEtHonorific(displayName, race.naming);
    }

    // Loyalty: race band + pool mod + trait mods.
    let loyalty = P.int(rng, race.loyalty_base[0], race.loyalty_base[1]) + poolCfg.loyalty_mod;
    for (const id of traitIds) {
      const t = this.traitById[id];
      if (t && t.effects && typeof t.effects.loyalty_mod === "number") loyalty += t.effects.loyalty_mod;
    }
    loyalty = P.clamp(Math.round(loyalty), 0, 100);

    // Fame: pool band, skewed low; merc experience adds notoriety.
    const exp = this.rollExperience(rng, race, pool, age);
    const [fLo, fHi] = poolCfg.fame_range;
    let fame = Math.round(fLo + (fHi - fLo) * Math.pow(rng(), 1.6));
    if (pool === "mercenary") fame = P.clamp(fame + exp.divides * 2, 0, 60);

    // Contract.
    const salary = this.salaryFor(race, pool, stats, age);
    const seasons = P.int(rng, poolCfg.seasons_range[0], poolCfg.seasons_range[1]);
    /* THE CONTRACT KNOWS WHAT KIND IT IS, because the three kinds are three different
       deals: a nattie is a flat multi-year wage with the fleet's best family pension and a
       bonus for every Divide actually dropped into; a merc is ONE Divide at the top price,
       paid whether or not they drop, extension a fresh handshake; a prisoner serves a
       freedom clause. The clause lives FLAT on the contract (divides_served / _required)
       because that is the shape the season reads and increments — the old nested
       `contract.freedom` object was a second shape that nothing downstream ever read. */
    const contract = { kind: pool, salary, seasons_remaining: seasons, seasons_total: seasons };
    contract.death_benefit = P.roundTo(salary * poolCfg.death_benefit_mult, 10);

    if (pool === "nattie") {
      contract.signing_cost = 0;
      if (poolCfg.divide_bonus_mult)
        contract.divide_bonus = P.roundTo(salary * poolCfg.divide_bonus_mult, 10);
    } else if (pool === "mercenary") {
      contract.signing_cost = P.roundTo(salary * (2 + 0.8 * seasons + 0.02 * fame), 10);
    } else {
      const req = parseInt(P.weightedPick(rng, poolCfg.freedom_divides_weights), 10);
      contract.divides_served = 0;
      contract.divides_required = req;
      const young = age <= race.age.prime[0] + 4;
      const premium = young ? 1 + 0.006 * Math.max(0, scout.estimate - 120) : 1;
      contract.signing_cost = P.roundTo(salary * (2.5 + 1.2 * req) * premium, 10);
    }

    // Condition (prisoner lots may sell as-is with a lingering knock).
    const condition = { health: 100, fatigue: 0, morale: P.int(rng, 45, 65), injuries: [],
                        stress: 0 };   /* the ONE stress store — see divide.js squadStress */
    if (pool === "prisoner" && P.chance(rng, poolCfg.arrival_injury_chance)) {
      condition.injuries.push({
        type: P.pick(rng, ["inj_arm", "inj_leg", "inj_torso"]),  // COMBAT.md §7.1 ids
        severity: "minor",
        days_remaining: P.int(rng, 5, 20),
        untreated: true
      });
      condition.health = P.int(rng, 80, 95);
    }

    // History.
    const kills = Math.max(0, Math.round(exp.battles * (0.12 + stats.aim / 1200 + P.normal(rng, 0, 0.04))));
    const evacs = exp.divides > 0 && P.chance(rng, 0.3) ? P.int(rng, 1, 2) : 0;

    const idBase = named.parts.mononym || named.parts.title && ("the_" + named.parts.title) ||
      (named.parts.given && named.parts.family ? named.parts.given + "_" + named.parts.family :
        named.parts.given || displayName);
    const fighter = {
      id: "ftr_" + slugify(String(idBase)) + "_" + (opts.suffix || idSuffix(rng)),
      name: displayName,
      race: race.id,
      origin: pool === "mercenary" ? "mercenary" : pool,
      age,
      stats,
      skills,                    /* the four trades — see the step-d birth above */
      potential,
      experience: exp,
      traits: traitIds,
      condition,
      loyalty,
      fame,
      contract,
      history: { kills, evacs, notable_events: [] },
      status: "active"
    };

    // Callsign: market veterans may arrive carrying one.
    if (fame >= this.rec.callsigns.chance_at_fame && P.chance(rng, 0.7)) {
      fighter.callsign = NG.generateCallsign(rng, this.rec.callsigns);
    }

    return { fighter, meta: { qualityShift: Math.round(qualityShift * 100) / 100, scout, named } };
  };

  /**
   * Generate one recruit. Mon-Wa produce a bonded PAIR: two fighters, one
   * roster slot, shared mind (traits/loyalty/fame/contract mirrored),
   * bond_partner cross-referenced (canon).
   */
  Generator.prototype.generateRecruit = function (rng, opts) {
    const pool = opts.pool;
    const race = this.pickRace(rng, pool, opts.corpId, opts.race);

    if (race.id !== "mon_wa") {
      const b = this.buildFighter(rng, { pool, race, batchTally: opts.batchTally });
      return {
        kind: "single", race: race.id, pool,
        fighters: [b.fighter],
        displayName: b.fighter.name,
        meta: b.meta
      };
    }

    // Mon-Wa pair: one being, two bodies.
    const named = NG.generateName(rng, race);
    const suffix = idSuffix(rng);
    const sharedTraits = this.rollTraits(rng, race, pool === "mercenary" ? "mercenary" : pool, opts.batchTally);
    const sharedAge = this.rollAge(rng, race, pool);

    const mon = this.buildFighter(rng, {
      pool, race, suffix, age: sharedAge, traits: sharedTraits,
      named: { name: named.parts.mon, parts: { given: named.parts.mon, family: "mon" } }
    });
    const wa = this.buildFighter(rng, {
      pool, race, suffix, age: sharedAge, traits: sharedTraits,
      named: { name: named.parts.wa, parts: { given: named.parts.wa, family: "wa" } }
    });

    // One being: mirror the shared ledgers from the Mon half.
    for (const f of [wa.fighter]) {
      f.loyalty = mon.fighter.loyalty;
      f.fame = mon.fighter.fame;
      f.experience = JSON.parse(JSON.stringify(mon.fighter.experience));
    }
    // One roster slot, one contract: pair salary on both records, flagged shared.
    const pairContract = mon.fighter.contract;
    wa.fighter.contract = JSON.parse(JSON.stringify(pairContract));
    mon.fighter.bond_partner = wa.fighter.id;
    wa.fighter.bond_partner = mon.fighter.id;
    if (mon.fighter.callsign) wa.fighter.callsign = mon.fighter.callsign;
    else delete wa.fighter.callsign;

    return {
      kind: "pair", race: race.id, pool,
      fighters: [mon.fighter, wa.fighter],
      displayName: named.name,
      halves: { mon: named.parts.mon, wa: named.parts.wa },
      meta: {
        qualityShift: mon.meta.qualityShift,
        scout: mon.meta.scout,
        scoutWa: wa.meta.scout,
        tether: race.special.tether_miles,
        contractNote: "one roster slot · one salary line · contract mirrored on both halves"
      }
    };
  };

  /** Batch with demographic tally (the roller's footer feeds on this). */
  Generator.prototype.generateBatch = function (rng, opts) {
    const recruits = [];
    const demographics = {};
    const batchTally = {}; // trait id -> appearances this batch (drives the repeat damper)
    for (let i = 0; i < opts.count; i++) {
      const r = this.generateRecruit(rng, Object.assign({}, opts, { batchTally }));
      recruits.push(r);
      demographics[r.race] = (demographics[r.race] || 0) + 1;
      for (const id of r.fighters[0].traits) batchTally[id] = (batchTally[id] || 0) + 1;
    }
    return { pool: opts.pool, corpId: opts.corpId || null, count: opts.count, recruits, demographics };
  };

  const api = {
    Generator,
    STATS,
    create(data) { return new Generator(data); }
  };
  global.CDRECRUIT = api;
})(typeof window !== "undefined" ? window : globalThis);


/* ================= commentary.js ================= */
/* Capital Divide — /sim/commentary.js
 * Broadcast one-liners for recruit cards: the hype voice and the dry analyst
 * (DESIGN.md §8). Lines are composed from the fighter's ACTUAL sheet — traits,
 * stat spikes and holes, clauses, ages, prices — so no two cards in a batch
 * read the same. A shared `used` set forbids template reuse within a batch.
 *
 * UI-facing for Step 2; graduates into the Step 7 media system. Deterministic
 * via CDPRNG. Returns { key, register, text, lex } — lex is an optional
 * fossil-lexicon word {word, gloss} the UI may render with a gloss tooltip.
 *
 * RELATIONSHIP TO COMBAT.md §12 (Step 3). Two tier systems now exist and they are
 * complementary, not competing:
 *   · this file's `tier` (3→0) is SPECIFICITY — which line best fits this subject
 *   · COMBAT.md §12's `significance` (0→4) is IMPORTANCE — whether to speak at all
 * The Step 7 unification should keep both: significance gates the event, specificity
 * picks the line, and the `used` set below carries over as the anti-repetition damper
 * the combat feed currently lacks. `register` (hype | dry) is already the canon
 * two-caster booth and needs no change.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? __req("prng") : global.CDPRNG;

  const STAT_FULL = { aim: "Aim", grit: "Grit", reflex: "Reflex", fieldcraft: "Fieldcraft", tactics: "Tactics", presence: "Presence", resolve: "Resolve" };

  /* Removed at this step: topStat — defined here and called from nowhere in the tree.
     They are the last of the abstract band resolver cut at Step 8.9, plus one movement
     helper in `tactical.js` whose docstring described behaviour the live scorer does by
     an entirely different method a thousand lines away. A change was made to that dead
     one, measured at no effect, and the no-effect was read as the mechanism not
     mattering rather than as the code not running. `audit_cross` looks for uncalled
     functions now, so the next one is caught before somebody edits it. */

  function lowStat(f) {
    let k = "aim";
    for (const s in f.stats) if (f.stats[s] < f.stats[k]) k = s;
    return k;
  }

  /* Template registry.
   * when(ctx) -> bool · text(ctx) -> string · register: "hype" | "dry"
   * tier: 3 = situation-specific · 2 = trait-specific · 1 = race color · 0 = generic
   * ctx = { f, rec, race, name, has(traitId), pool }
   */
  const T = [
    /* ---- tier 3: situation-specific ---- */
    { key: "pair_ledger", tier: 3, register: "dry",
      when: c => c.rec.kind === "pair",
      text: c => `Two bodies, one mind, one salary line — ${c.rec.halves.mon} and ${c.rec.halves.wa} bill as a single roster slot. The quartermasters are already in love.` },
    { key: "pair_uncanny", tier: 3, register: "hype",
      when: c => c.rec.kind === "pair",
      text: c => `${c.name} move like a rumor — you spot one half, and the other half has been watching you the whole time!` },
    { key: "freedom_one", tier: 3, register: "hype",
      when: c => c.pool === "prisoner" && c.f.contract.divides_required === 1,
      text: c => `One Divide between ${c.name} and the open door. Fleet, fighters like that FINISH things.` },
    { key: "freedom_long", tier: 3, register: "dry",
      when: c => c.pool === "prisoner" && c.f.contract.divides_required >= 4,
      text: c => `${c.f.contract.divides_required} Divides on the clause. Whoever buys ${c.name} is buying years — and years, in this sport, are the expensive part.` },
    { key: "lot_as_is", tier: 3, register: "dry",
      when: c => c.pool === "prisoner" && c.f.condition.injuries.length > 0,
      text: c => `Sold as-is — the Bastille's polite phrase for "ask no questions about the ${c.f.condition.injuries[0].type.replace(/_/g, " ")}."` },
    { key: "old_hand", tier: 3, register: "dry",
      when: c => c.f.age >= c.race.age.decline,
      text: c => `${c.f.age} and still on a sheet. Either the tank is empty or the fleet stopped looking. One of those is a bargain.` },
    { key: "too_young", tier: 3, register: "dry",
      when: c => c.pool === "nattie" && c.f.age <= c.race.age.recruit_min + 1,
      text: c => `${c.f.age} years old. The tryout rules say eligible. The tape says give it a season.` },
    { key: "spike_aim", tier: 3, register: "hype",
      when: c => c.f.stats.aim >= 150,
      text: c => `AIM ${c.f.stats.aim}! You don't coach that — you just point it at whatever the corp wants gone!` },
    { key: "spike_reflex", tier: 3, register: "hype",
      when: c => c.f.stats.reflex >= 15,
      text: c => `Blink and ${c.name} is already behind different cover. Reflex ${c.f.stats.reflex} moves odds boards.` },
    { key: "spike_tactics", tier: 3, register: "dry",
      when: c => c.f.stats.tactics >= 150,
      text: c => `Tactics ${c.f.stats.tactics}. Somebody will hand ${c.name} a captaincy and look clever for a decade.` },
    { key: "spike_presence", tier: 3, register: "hype",
      when: c => c.f.stats.presence >= 15,
      text: c => `Rooms reorganize when ${c.name} walks in. Presence ${c.f.stats.presence} — and yes, the cameras have noticed.` },
    { key: "spike_grit", tier: 3, register: "hype",
      when: c => c.f.stats.grit >= 150,
      text: c => `Grit ${c.f.stats.grit}. ${c.name} has been shot before. ${c.name} was extremely fine about it.` },
    { key: "spike_fieldcraft", tier: 3, register: "dry",
      when: c => c.f.stats.fieldcraft >= 150,
      text: c => `Fieldcraft ${c.f.stats.fieldcraft} — the quiet kind of number that eats an enemy's supply plan without firing a round.` },
    { key: "spike_resolve", tier: 3, register: "dry",
      when: c => c.f.stats.resolve >= 150,
      text: c => `Resolve ${c.f.stats.resolve}. The panic checks other people fail are, to ${c.name}, weather.` },
    { key: "sheet_hole", tier: 3, register: "dry",
      when: c => c.f.stats[lowStat(c.f)] <= 40,
      text: c => { const k = lowStat(c.f); return `The sheet has a hole at ${STAT_FULL[k]} ${c.f.stats[k]}. Holes can be schemed around — ask whoever does your scheming.`; } },
    { key: "callsign", tier: 3, register: "hype",
      when: c => !!c.f.callsign,
      text: c => `"${c.f.callsign}"! Nobody earns a handle like that filing clean paperwork!` },
    { key: "famous", tier: 3, register: "hype",
      when: c => c.f.fame >= 35 && !c.f.callsign,
      text: c => `Fame ${c.f.fame} before signing day — the chants come pre-installed with this one.` },
    { key: "bargain", tier: 3, register: "dry",
      when: c => c.rec.meta.scout.estimate >= 150 && c.f.contract.salary <= 300,
      text: c => `Priced like filler, scouted like a find. Someone in a back office can't do arithmetic, and it isn't yours.` },
    { key: "rich_ask", tier: 3, register: "dry",
      when: c => c.f.contract.salary >= 900 && c.rec.meta.scout.estimate <= 110,
      text: c => `That salary asks for a ceiling the scouts can't see. The broadcast loves a gamble. Treasuries don't.` },
    { key: "veteran_count", tier: 3, register: "dry",
      when: c => c.f.experience.divides >= 6,
      text: c => `${c.f.experience.divides} Divides survived. In this sport that number is the résumé, the reference, and the warning.` },

    /* ---- tier 2: trait-specific ---- */
    { key: "t_bleeder", tier: 2, register: "dry", when: c => c.has("bleeder"),
      text: c => `Medical flagged the file: wounds run a grade worse on ${c.name}. Budget for the evac retainer.` },
    { key: "t_gallows", tier: 2, register: "hype", when: c => c.has("gallows_humor"),
      text: c => `Cracked a joke during their own tryout shelling, we're told. Ten seconds late. Landed anyway.` },
    { key: "t_born_captain", tier: 2, register: "dry", when: c => c.has("born_captain"),
      text: c => `Reads a battlefield the way an auditor reads a ledger. Captain material — the market will figure it out eventually.` },
    { key: "t_kier", tier: 2, register: "dry", when: c => c.has("kier_hardened"),
      text: c => `Kier alumni. The Divide's worst day is the Bastille's Tuesday, and ${c.name} did years of Tuesdays.` },
    { key: "t_freedom_counter", tier: 2, register: "dry", when: c => c.has("freedom_counter"),
      text: c => `Keeps the clause tally scratched inside the armor, the guards say. That's not a habit. That's fuel.` },
    { key: "t_hot_headed", tier: 2, register: "hype", when: c => c.has("hot_headed"),
      text: c => `Burns HOT! Point the burn at the other banners and everyone goes home happy. Point it wrong and — well. Ratings.` },
    { key: "t_superstitious", tier: 2, register: "hype", when: c => c.has("superstitious"),
      text: c => `Won't drop without the dawn ritual. Three camps ago, the ritual squad lived. Make of that what the crowd will!` },
    { key: "t_odds_watcher", tier: 2, register: "dry", when: c => c.has("odds_watcher"),
      text: c => `Checks the board before breakfast. Undervalue ${c.name} at your own expense — the board is listening.` },
    { key: "t_mimic", tier: 2, register: "hype", when: c => c.has("mimic_call"),
      text: c => `Fifty meters of somebody else's voice, thrown into the wrong ravine. Comms crews hate it. The crowd emphatically does not.` },
    { key: "t_battle_joy", tier: 2, register: "hype", when: c => c.has("battle_joy"),
      text: c => `The grin gets wider as the fight gets worse. The intensity graphs and that smile track one-to-one.` },
    { key: "t_war_priest", tier: 2, register: "dry", when: c => c.has("war_priest"),
      text: c => `Every bandage a blessing. Squads with an Et- on the roster evac calmer and grieve shorter. The numbers back the faith.` },
    { key: "t_zealot", tier: 2, register: "dry", when: c => c.has("et_y_bellum_zealot"),
      text: c => `The Et- on the name is fair warning: the evac team should expect a theological argument.` },
    { key: "t_devout", tier: 2, register: "dry", when: c => c.has("et_y_bellum_devout") && !c.has("et_y_bellum_zealot"),
      text: c => `Holds the sacrament openly. Sign ${c.name} to a careful banner and you're buying friction with the faith.` },
    { key: "t_psi_battle", tier: 2, register: "dry", when: c => c.has("psion_battle_sense"),
      text: c => `Moves a heartbeat before the trigger. The Aleas insists its drones don't leak. The drones decline to comment.` },
    { key: "t_psi_link", tier: 2, register: "dry", when: c => c.has("psion_squad_link"),
      text: c => `Squads report they simply know where ${c.name} is. A whisper of the Mon-Wa gift, in a body that bills as one.` },
    { key: "t_psi_read", tier: 2, register: "dry", when: c => c.has("psion_pressure_read"),
      text: c => `Sits in on negotiations. Tells you, afterward, which offers were bluffs. Worth more than the rifle, frankly.` },
    { key: "t_resent", tier: 2, register: "dry", when: c => c.has("cradleborn_resentment"),
      text: c => `Serves the fleet. Hasn't forgiven it. The loyalty line prices that in — the camp chemistry is your problem.` },
    { key: "t_keshu", tier: 2, register: "dry", when: c => c.has("keshu_grudge"),
      text: c => `Some households never signed the Keshu peace. Check your roster for the other half of that war before you sign this one.` },
    { key: "t_few_words", tier: 2, register: "hype", when: c => c.has("few_words"),
      text: c => `Has spoken on broadcast twice in a career. Both clips are legendary. We live in hope of a third.` },
    { key: "t_savage", tier: 2, register: "hype", when: c => c.has("broadcast_savage"),
      text: c => `Fights like the cameras are family. The cameras, for the record, agree.` },
    { key: "t_darling", tier: 2, register: "hype", when: c => c.has("crowd_darling"),
      text: c => `The drones find ${c.name} on their own. Nobody programs that. The crowd just knows.` },
    { key: "t_climber", tier: 2, register: "dry", when: c => c.has("rank_climber"),
      text: c => `Reads every roster posting twice: once for the squad, once for their own name's position in it.` },
    { key: "t_tradition", tier: 2, register: "dry", when: c => c.has("tradition_keeper"),
      text: c => `Signed for a banner, not a mood. Change doctrine mid-Divide and you'll meet granite with a contract.` },
    { key: "t_cull", tier: 2, register: "dry", when: c => c.has("cull_tempered"),
      text: c => `Survived the training years. Panic was culled out of ${c.name} before adulthood — the pride kept receipts.` },
    { key: "t_dancer", tier: 2, register: "hype", when: c => c.has("battle_dancer"),
      text: c => `Every reposition a step, every shot a beat — the old dueling forms, live on your feed!` },
    { key: "t_mentor", tier: 2, register: "dry", when: c => c.has("mentor"),
      text: c => `Rookies orbit ${c.name}. The nerves settle. The habits stick. Cheap at twice the salary.` },
    { key: "t_pact", tier: 2, register: "dry", when: c => c.has("pact_keeper"),
      text: c => `A deal signed is a deal kept — even the ones the manager comes to regret. Negotiators, take note.` },
    { key: "t_clause", tier: 2, register: "dry", when: c => c.has("clause_reader"),
      text: c => `Knows the contract, your precedent, and the fleet's going rate to the credit. Renewal season will be an education.` },
    { key: "t_union", tier: 2, register: "dry", when: c => c.has("union_tongue"),
      text: c => `Knows every grievance in camp and how to say it out loud. A morale engine — pointed wherever ${c.name} decides.` },
    { key: "t_villain", tier: 2, register: "hype", when: c => c.has("villain_edit"),
      text: c => `The crowd LOVES to hate this one — and tunes in, every time, to do it properly!` },
    { key: "t_thrill", tier: 2, register: "hype", when: c => c.has("thrill_seeker"),
      text: c => `First hand up for the bad jobs! The medics keep the file open, and the crowd keeps the volume up.` },
    { key: "t_lucky", tier: 2, register: "hype", when: c => c.has("aleas_favorite"),
      text: c => `Closures miss them. Drops land beside them. Nobody can prove a thing, and the syndicates have STOPPED trying.` },
    { key: "t_omen", tier: 2, register: "dry", when: c => c.has("bad_omen"),
      text: c => `When things go wrong, camps remember who they went wrong near. Superstition isn't fair. It is, however, contagious.` },
    { key: "t_cook", tier: 2, register: "dry", when: c => c.has("camp_cook"),
      text: c => `Turns ration paste into something a squad queues for. Morale-per-credit, there's no better signing on this sheet.` },
    { key: "t_quotable", tier: 2, register: "hype", when: c => c.has("quotable"),
      text: c => `Everything ${c.name} says fits a chyron. We checked. It's uncanny. It occasionally gets people fined.` },
    { key: "t_loyal_fault", tier: 2, register: "dry", when: c => c.has("loyal_to_a_fault"),
      text: c => `Will follow the banner anywhere. Including, the tape suggests, the places it should not have gone.` },
    { key: "t_slow_start", tier: 2, register: "dry", when: c => c.has("slow_starter"),
      text: c => `A terrible first week, every recorded Divide. Then something clicks shut. Plan the schedule accordingly.` },
    { key: "t_homesick", tier: 2, register: "dry", when: c => c.has("homesick"),
      text: c => `Carries the ship in their chest. Long campaigns wear a hole in it — watch the morale line after week three.` },

    /* ---- tier 1: race color ---- */
    { key: "r_human", tier: 1, register: "dry", when: c => c.f.race === "human",
      text: c => `No leans, no floor, no gimmick — the founder stock runs on variety and volume, and ${c.name} is the volume.` },
    { key: "r_kellis", tier: 1, register: "hype", when: c => c.f.race === "kellis",
      text: c => `Kellis on the sheet! The most sought-after signature in the fleet, and the dueling grace is exactly why.` },
    { key: "r_mon_wa", tier: 1, register: "dry", when: c => c.f.race === "mon_wa",
      text: c => `Mon-Wa bookkeeping: one being, two bodies, one slot. The camp runs better the day they arrive.` },
    { key: "r_olmac", tier: 1, register: "dry", when: c => c.f.race === "olmac",
      text: c => `Olmac: cheap to sign, easy to lose, impossible to suppress. The Divide's load-bearing race, in every sense.` },
    { key: "r_thythyn", tier: 1, register: "hype", when: c => c.f.race === "thythyn",
      text: c => `Wings on the roster! Short careers, bright ones — Thythyn fight like the clock is audible, because to them it is.` },
    { key: "r_svalbard", tier: 1, register: "dry", when: c => c.f.race === "svalbard",
      text: c => `A Svalbard signature is a decades bet — no weak ones exist, and the price agrees.` },
    { key: "r_etu", tier: 1, register: "dry", when: c => c.f.race === "etu",
      text: c => `Etu logistics: eats less, endures more, believes battle is a sacrament. Two of those help the treasury.` },
    { key: "r_attorak", tier: 1, register: "hype", when: c => c.f.race === "attorak",
      text: c => `An Attorak in the packet — grammar optional, savagery legible from the cheap seats!` },
    { key: "r_gil", tier: 1, register: "dry", when: c => c.f.race === "gil",
      text: c => `Gil patience is a weapon system: the goggles see clearly, the ambush waits politely, the favor ledger never closes.` },

    /* ---- tier 0: generics (last resort) ---- */
    { key: "g_packet1", tier: 0, register: "dry", when: () => true,
      text: c => `${c.name}: serviceable numbers, honest price. Squads are built from exactly this.` },
    { key: "g_packet2", tier: 0, register: "hype", when: () => true,
      text: c => `Remember the name ${c.name}, fleet — say it now so you can say you said it first!` },
    { key: "g_packet3", tier: 0, register: "dry", when: () => true,
      text: c => `Nothing on the sheet explains the scout interest in ${c.name}. Something off-sheet might.` },
    { key: "g_packet4", tier: 0, register: "hype", when: () => true,
      text: c => `Somewhere, a syndicate board just moved half a point on ${c.name}. Draw your own conclusions!` },
    { key: "g_packet5", tier: 0, register: "dry", when: () => true,
      text: c => `${c.name} profiles as a system piece. Captains decide what that's worth; managers pay for the decision.` },
    { key: "g_packet6", tier: 0, register: "hype", when: () => true,
      text: c => `The decks will have a chant for ${c.name} by signing day. It won't rhyme. They won't care.` }
  ];

  /**
   * Compose one line for a recruit card.
   * @param rng   seeded rng (use a child stream per batch)
   * @param rec   recruit object from recruitgen (single or pair)
   * @param race  race object from races.json
   * @param used  Set of template keys already used this batch (mutated)
   * @param opts  { lexChance } — fossil-lexicon injection chance (default 0.35)
   */
  function compose(rng, rec, race, used, opts) {
    const f = rec.fighters[0];
    const ctx = {
      f, rec, race, pool: rec.pool,
      name: rec.displayName,
      has: id => f.traits.indexOf(id) !== -1
    };
    // Gather applicable, unused templates; pick from the highest tier available.
    let pick = null;
    for (let tier = 3; tier >= 0 && !pick; tier--) {
      const cands = T.filter(t => t.tier === tier && !used.has(t.key) && t.when(ctx));
      if (cands.length) pick = P.pick(rng, cands);
    }
    if (!pick) pick = P.pick(rng, T.filter(t => t.tier === 0)); // batch bigger than the registry: reuse a generic
    used.add(pick.key);

    // Optional fossil-lexicon word (races.json, all proposed).
    let lex = null;
    const lx = race.fossil_lexicon || [];
    const chance = opts && opts.lexChance !== undefined ? opts.lexChance : 0.35;
    if (lx.length && P.chance(rng, chance)) lex = P.pick(rng, lx);

    return { key: pick.key, register: pick.register, text: pick.text(ctx), lex };
  }

  const api = { compose, templates: T };
  global.CDCOMMENTARY = api;
})(typeof window !== "undefined" ? window : globalThis);


/* ================= roster.js ================= */
/* Capital Divide — /sim/roster.js
 * Squad assembly for combat: turns recruitgen output into drop squads.
 *
 * Replaces the Step 3 stand-in (sim/roster.js, deleted). Combat needs a flat
 * list of BODIES; recruitgen produces RECRUITS, and a Mon-Wa recruit is one roster slot
 * carrying two bodies (canon). This module owns only that translation plus captain
 * selection — every stat, trait, name, and contract comes from recruitgen unchanged.
 *
 * Seeded via CDPRNG. UMD-ish, same pattern as the rest of /sim.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? __req("prng") : global.CDPRNG;
  const RG = isNode ? __req("recruit") : global.CDRECRUIT;

  /* Pool mix for a drop squad. A roster is built across the three recruitment windows
     (DESIGN.md §4), so a squad on the ground is a blend. Test-fixture tuning, not canon. */
  const DEFAULT_POOL_MIX = [["nattie", 45], ["mercenary", 35], ["prisoner", 20]];

  let gen = null;
  let raceById = {};
  let traitById = {};

  function initRoster(data) {
    gen = RG.create(data);
    raceById = gen.raceById;
    traitById = gen.traitById;
    return gen;
  }

  /**
   * Build one drop squad.
   * @param rng    seeded rng
   * @param slots  roster slots (a Mon-Wa slot yields two bodies)
   * @param opts   { corpId, poolMix, batchTally }
   * @returns { bodies, captainId, slots, recruits }
   */
  function generateSquad(rng, slots, opts) {
    opts = opts || {};
    if (!gen) throw new Error("roster: call initRoster(data) first");
    const batchTally = opts.batchTally || {};
    const mix = opts.poolMix || DEFAULT_POOL_MIX;
    const bodies = [], recruits = [];

    for (let i = 0; i < slots; i++) {
      const pool = P.weightedPick(rng, mix);
      const rec = gen.generateRecruit(rng, { pool, corpId: opts.corpId, batchTally });
      recruits.push(rec);
      for (const f of rec.fighters) bodies.push(f);
      for (const id of rec.fighters[0].traits) batchTally[id] = (batchTally[id] || 0) + 1;
    }

    /* Captain: highest tactics, ties broken by loyalty. Mon-Wa halves are eligible but
       rarely win it — their tactics lean is flat and the pair is fragile. */
    let cap = bodies[0];
    for (const b of bodies) {
      if (b.stats.tactics > cap.stats.tactics) cap = b;
      else if (b.stats.tactics === cap.stats.tactics && b.loyalty > cap.loyalty) cap = b;
    }
    return { bodies, captainId: cap.id, slots, recruits };
  }

  /** A full drop force: three squads of eight by default (COMBAT.md §2.1). */
  function generateDropForce(rng, opts) {
    opts = opts || {};
    const split = opts.split || "3x8";
    const sizes = split === "2x12" ? [12, 12] : split === "4x6" ? [6, 6, 6, 6] : [8, 8, 8];
    const batchTally = {};
    return sizes.map(n => generateSquad(rng, n, { corpId: opts.corpId, batchTally }));
  }

  /* In node, bootstrap straight from /data so callers need no loader file.
     Layout-agnostic: works whether the project keeps folders or sits in one directory. */
  function autoInit() {
    if (!isNode) return null;
    const fs = require("fs"), path = require("path");
    const find = (name) => {
      const d = __dirname;
      for (const c of [path.join(d, name), path.join(d, "..", "data", name), path.join(d, "..", name),
                       path.join(d, "data", name)]) if (fs.existsSync(c)) return c;
      throw new Error("roster: cannot find " + name);
    };
    const J = (n) => JSON.parse(fs.readFileSync(find(n), "utf8"));
    return initRoster({ races: J("races.json"), traits: J("traits.json"),
                        recruitment: J("recruitment.json"), oa: J("oa_profiles.json") });
  }

  const api = { initRoster, autoInit, generateSquad, generateDropForce, DEFAULT_POOL_MIX,
                get raceById() { return raceById; },
                get traitById() { return traitById; },
                get generator() { return gen; } };
  if (isNode) autoInit();
  global.CDROSTER = api;
})(typeof window !== "undefined" ? window : globalThis);

  if (isNodeRoot) module.exports = (typeof window !== "undefined" ? window : globalThis).CDROSTER;
})(typeof window !== "undefined" ? window : globalThis);
