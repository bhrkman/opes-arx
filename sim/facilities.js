/* ============================================================================================
   FACILITIES — what an OA builds, and keeps. Long-horizon money.

   RULED (the facilities pass):
   - Six facilities, each tied to a backroom post. Level one of a facility is needed before a
     staffer can hold its post; every level above one multiplies what that staffer's Craft does.
     The facility also does a little on its own, staffed or not.
   - THE ARMOURY GATES GEAR. Everyone begins without one, issuing tiers one and two. Each level
     opens the next tier, to tier five at level three. Gear above an OA's tier is
     STORED, never lost — captured kit waits in the rack for the day the Armoury can issue it.
     A mercenary's own gear is theirs, and they carry it whatever the Armoury says.
   - Building is paid in full when it is ordered and stands at the start of next month (ruled: a
     build that did nothing for a year was a toll, not a choice). One build a month.
   - A standing facility costs upkeep every month. The board does not judge construction (it is
     capital, not a year's spending); it does see the upkeep.
   - No board sign-off: the money is the only gate.

   SYMMETRY (ruled): the engine's OAs build by the same rules, by their own temperament.
   ============================================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CDFAC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* levels[i] is what level i+1 costs: credits up front, and upkeep a month once standing. RULED (the value pass):
     one price for every facility, set so a level pays for itself in about two years at a typical house — the first
     sooner, the third later. Measured against the Press Office, the one facility that pays in credits. */
  const LEVELS = [{ cost: 30000, upkeep: 300 }, { cost: 75000, upkeep: 700 }, { cost: 150000, upkeep: 1200 }];
  const FACILITIES = {
    armoury:   { name: 'Armoury', post: 'quartermaster', start: 0, seen: { blood: 0.8, craft: 0.4 },
                 levels: LEVELS },
    infirmary: { name: 'Infirmary', post: 'surgeon', start: 0, seen: { care: 1.0 },
                 levels: LEVELS },
    yard:      { name: 'Training Yard', post: 'drill', start: 0, seen: { craft: 1.0, grit: 0.3 },
                 levels: LEVELS },
    barracks:  { name: 'Barracks', post: 'sergeant', start: 0, seen: { care: 0.7, word: 0.3 },
                 levels: LEVELS },
    press:     { name: 'Press Office', post: 'fixer', start: 0, seen: { glory: 1.0 },
                 levels: LEVELS },
    listening: { name: 'Listening Post', post: 'spymaster', start: 0, seen: { craft: 0.8, word: -0.2 },
                 levels: LEVELS }
  };
  const IDS = Object.keys(FACILITIES);
  const FOR_POST = {}; for (const id of IDS) FOR_POST[FACILITIES[id].post] = id;

  const CONST = {
    STAFF_PER_LEVEL: 0.25,       // [C] what each level above one adds to a staffer's Craft's reach
    /* [C] RULED (the value pass): what a level adds to the thing it works on — the gate, the drills, the mending,
       the month's easing of strain. The same at every facility, so a level reads the same wherever it stands. At a
       typical house's gate the Press Office pays back its first level in about eighteen months and its second in
       about three and a half years; the third is capped here rather than doubling the gate, and is the long one. */
    LEVEL_PCT: [0, 0.18, 0.40, 0.60],
    PRESS_GATE_SHARE: 0.75,           // [C] (ruled) the Press Office lifts the gate by three quarters of a level's lift (+45% at the top)
    BARRACKS_LOYALTY: 0.3,       // [C] loyalty a month toward sixty, per level above one
    LISTEN_LEVELS: 2,            // [C] reports a month at level three, staffed or not
    TIER_OFFSET: 2               // [S] the Armoury issues up to level + this: tiers one and two unbuilt
  };

  function grounds(corp) {
    corp.facilities = corp.facilities || { levels: {}, build: null, history: [], v: 2 };
    const g0 = corp.facilities;
    /* a save from before the Armoury's free first level was cut: every level moves down one */
    if (g0.v !== 2) {
      if (g0.levels.armoury != null) g0.levels.armoury = Math.max(0, g0.levels.armoury - 1);
      if (g0.build && g0.build.id === 'armoury') g0.build.level = Math.max(1, g0.build.level - 1);
      g0.v = 2;
    }
    for (const id of IDS) if (corp.facilities.levels[id] == null) corp.facilities.levels[id] = FACILITIES[id].start;
    return corp.facilities;
  }
  function level(corp, id) { return corp ? Math.max(0, Math.min(FACILITIES[id] ? FACILITIES[id].levels.length : 0, grounds(corp).levels[id] || 0)) : 0; }   /* (fixed) never past the top, whatever a save says */
  function maxTier(corp) { return Math.min(5, level(corp, 'armoury') + CONST.TIER_OFFSET); }
  /** can this post be staffed at all */
  function postOpen(corp, post) { const id = FOR_POST[post]; return !id || level(corp, id) >= 1; }
  /** what the facility does to its staffer's Craft: nothing at level one, more above */
  function staffMult(corp, post) { const id = FOR_POST[post]; const L = id ? level(corp, id) : 1; return 1 + CONST.STAFF_PER_LEVEL * Math.max(0, L - 1); }

  const absOf = (season, month) => (season || 0) * 12 + (month || 0);
  /** what the next level of a facility would cost, or null at the top */
  function nextLevel(corp, id) {
    const F = FACILITIES[id], L = level(corp, id);
    if (L >= F.levels.length) return null;
    return Object.assign({ level: L + 1, does: does(id, L + 1) }, F.levels[L]);
  }
  /** can a build start: one at a time, and paid in full */
  /* the doctrine's ceiling is the Armoury's: past it, a level would open nothing */
  function capped(corp, id) {
    if (id !== 'armoury') return false;
    const cap = corp && corp._doctrineCap;
    return cap != null && maxTier(corp) >= cap;
  }
  function canBuild(corp, id, mult) {
    const g = grounds(corp), nx = nextLevel(corp, id);
    if (!nx) return { ok: false, why: 'At the Top' };
    if (capped(corp, id)) return { ok: false, why: 'The Doctrine Goes No Higher' };
    if (g.build) return { ok: false, why: 'One a Month' };
    nx.cost = Math.round(nx.cost * (mult || 1) / 1000) * 1000;   /* the fleet's month moves the builders' prices too */
    if (((corp.account && corp.account.treasury) || 0) < nx.cost) return { ok: false, why: 'Not Enough in the Treasury' };
    return { ok: true, next: nx };
  }
  function startBuild(corp, id, season, month, post, mult) {
    const c = canBuild(corp, id, mult); if (!c.ok) return c;
    const g = grounds(corp);
    if (post) post(corp.account, 'expense', 'Building the ' + FACILITIES[id].name, -c.next.cost);
    g.build = { id, level: c.next.level, ready: absOf(season, month) + 1 };   /* stands when this month turns */
    return { ok: true, build: g.build };
  }
  /** time passes: a build that has stood long enough stands. Returns what finished. */
  function tick(corp, season, month) {
    const g = grounds(corp);
    if (!g.build || absOf(season, month) < g.build.ready) return null;
    const b = g.build; g.levels[b.id] = b.level; g.build = null;
    g.history.push({ id: b.id, level: b.level, season });
    while (g.history.length > 30) g.history.shift();
    return b;
  }
  function upkeep(corp) {
    let n = 0;
    for (const id of IDS) { const L = level(corp, id); if (L > 0) n += FACILITIES[id].levels[L - 1].upkeep; }
    return n;
  }

  /** What a level does, in numbers read off the constants above, so the page never says more than the rules do.
      Every level above one also multiplies the staffer's Craft (`staffMult`). */
  const POST_WORD = { armoury: 'Quartermaster', infirmary: 'Surgeon', yard: 'Drillmaster', barracks: 'Sergeant', press: 'Fixer', listening: 'Spymaster' };
  function does(id, L) {
    const pct = () => Math.round(CONST.LEVEL_PCT[L] * 100);
    const staff = L >= 2 ? ['Staff ×' + (1 + CONST.STAFF_PER_LEVEL * (L - 1)).toFixed(2).replace(/0$/, '')] : [];
    const opens = L === 1 && id !== 'armoury' ? ['A ' + POST_WORD[id] + ' May Work'] : [];
    switch (id) {
      case 'armoury': return (L === 1 ? ['A Quartermaster May Work'] : []).concat(['Issues Tier ' + Math.min(5, L + CONST.TIER_OFFSET)], staff);
      case 'infirmary': return opens.concat(['Mending +' + pct() + '%'], L === 2 ? ['A Cutter May Operate'] : [], staff);
      case 'yard': return opens.concat(['Drills +' + pct() + '%'], staff);
      case 'barracks': return opens.concat(['Strain Eases +' + pct() + '%'],
                                           L >= 2 ? ['Loyalty +' + (CONST.BARRACKS_LOYALTY * (L - 1)).toFixed(1) + ' a Month, to 60'] : [], staff);
      case 'press': return opens.concat(['Gate +' + Math.round(CONST.LEVEL_PCT[L] * CONST.PRESS_GATE_SHARE * 100) + '%'], staff);
      case 'listening': return opens.concat(L === 2 ? ['A Mole May Be Planted'] : [], L === 3 ? [CONST.LISTEN_LEVELS + ' Reports a Month, Unstaffed'] : [], staff);
    }
    return staff;
  }

  /* ------------------------------------------------------------------ what they do alone */
  const pctAt = (corp, id) => CONST.LEVEL_PCT[Math.min(CONST.LEVEL_PCT.length - 1, level(corp, id))] || 0;
  function yardYield(corp) { return 1 + pctAt(corp, 'yard'); }
  function mendMult(corp) { return 1 + pctAt(corp, 'infirmary'); }
  /** how much more of a month's strain eases: the natural easing times this */
  function barracksEase(corp) { return 1 + pctAt(corp, 'barracks'); }
  function barracksLoyalty(corp) { return CONST.BARRACKS_LOYALTY * Math.max(0, level(corp, 'barracks') - 1); }
  function gateMult(corp) { return 1 + pctAt(corp, 'press') * CONST.PRESS_GATE_SHARE; }   /* (ruled: gently) the Press Office's share of a level's lift */
  function listenLevels(corp) { return level(corp, 'listening') >= 3 ? CONST.LISTEN_LEVELS : 0; }
  function cutterAllowed(corp) { return level(corp, 'infirmary') >= 2; }
  function moleAllowed(corp) { return level(corp, 'listening') >= 2; }

  /* --------------------------------------------------------------------- the engine builds */
  /** what an engine OA wants to build next, by its temperament and what it can afford to leave in the bank */
  /* §MONEY (ruled) from what the seat's reckoning leaves for building (season.js planFor), not a reserve of its own */
  function aiChoose(corp, budget, mult) {
    mult = mult || 1;   /* the year's price swing, as startBuild charges it */
    const g = grounds(corp); if (g.build) return null;
    const d = (corp.profile && corp.profile.dials) || {};
    const dial = k => (typeof d[k] === 'number' ? d[k] : 50) / 100;
    const want = {
      armoury: 1.2 + dial('aggression') * 0.6,
      yard: 1.0 + dial('tradition') * 0.4,
      infirmary: 0.8 + (1 - dial('aggression')) * 0.6,
      barracks: 0.7 + dial('patience') * 0.4,
      press: 0.5 + dial('showmanship') * 0.9,
      listening: 0.4 + dial('treachery') * 0.8
    };
    const purse = (corp.account && corp.account.treasury) || 0;
    const opts = IDS.map(id => ({ id, nx: nextLevel(corp, id) }))
      .filter(o => o.nx && o.nx.cost > 0 && !capped(corp, o.id) && o.nx.cost * mult <= budget && o.nx.cost * mult <= purse)
      /* §CENSUS A HOUSE CLIMBS WHAT IT CARES FOR. Measured: with a flat penalty on every level above one, all eight
         houses built all six first levels before any second, so a militarist had its Listening Post before a better
         Armoury. Want is squared: a strong taste outbids a cheap level of a thing the house barely wants. */
      .map(o => ({ id: o.id, score: want[o.id] * want[o.id] / (1 + o.nx.cost / 100000) }))
      .sort((a, b) => b.score - a.score);
    return opts.length ? opts[0].id : null;
  }

  return { FACILITIES, IDS, FOR_POST, CONST, does, grounds, level, maxTier, postOpen, staffMult, nextLevel, canBuild, startBuild,
           tick, upkeep, capped, yardYield, mendMult, barracksEase, barracksLoyalty, gateMult, listenLevels,
           cutterAllowed, moleAllowed, aiChoose };
});
