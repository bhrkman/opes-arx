/* ============================================================================================
   FACILITIES — what an OA builds, and keeps. Long-horizon money.

   RULED (the facilities pass):
   - Six facilities, each tied to a backroom post. Level one of a facility is needed before a
     staffer can hold its post; every level above one multiplies what that staffer's Craft does.
     The facility also does a little on its own, staffed or not.
   - THE ARMOURY GATES GEAR. Everyone begins with the Armoury at level one: tiers one and two.
     Each level above opens the next tier, to tier five at level four. Gear above an OA's tier is
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

  /* levels[i] is what level i+1 costs: credits up front, and upkeep a month once standing */
  const FACILITIES = {
    armoury:   { name: 'Armoury', post: 'quartermaster', start: 1, seen: { blood: 0.8, craft: 0.4 },
                 levels: [{ cost: 0, upkeep: 600 },
                          { cost: 110000, upkeep: 1600 },
                          { cost: 240000, upkeep: 3200 },
                          { cost: 420000, upkeep: 5200 }],
                 does: ['Issues Tiers 1–2', 'Issues Tier 3', 'Issues Tier 4', 'Issues Tier 5'] },
    infirmary: { name: 'Infirmary', post: 'surgeon', start: 0, seen: { care: 1.0 },
                 levels: [{ cost: 55000, upkeep: 900 }, { cost: 130000, upkeep: 2000 }, { cost: 280000, upkeep: 3800 }],
                 does: ['A Surgeon Can Work · Wounds Mend Faster', 'A Cutter Can Operate · Faster Still', 'Wounds Mend Fastest'] },
    yard:      { name: 'Training Yard', post: 'drill', start: 0, seen: { craft: 1.0, grit: 0.3 },
                 levels: [{ cost: 50000, upkeep: 900 }, { cost: 120000, upkeep: 2000 }, { cost: 260000, upkeep: 3600 }],
                 does: ['A Drillmaster Can Work · Drills Gain More', 'Drills Gain More', 'Drills Gain Most'] },
    barracks:  { name: 'Barracks', post: 'sergeant', start: 0, seen: { care: 0.7, word: 0.3 },
                 levels: [{ cost: 45000, upkeep: 800 }, { cost: 110000, upkeep: 1800 }, { cost: 240000, upkeep: 3400 }],
                 does: ['A Sergeant Can Work · Strain Eases', 'Strain Eases More · Loyalty Settles', 'Strain Eases Most · Loyalty Settles Faster'] },
    press:     { name: 'Press Office', post: 'fixer', start: 0, seen: { glory: 1.0 },
                 levels: [{ cost: 50000, upkeep: 900 }, { cost: 120000, upkeep: 2000 }, { cost: 260000, upkeep: 3600 }],
                 does: ['A Fixer Can Work · A Bigger Gate', 'A Bigger Gate', 'The Biggest Gate'] },
    listening: { name: 'Listening Post', post: 'spymaster', start: 0, seen: { craft: 0.8, word: -0.2 },
                 levels: [{ cost: 55000, upkeep: 1000 }, { cost: 130000, upkeep: 2200 }, { cost: 280000, upkeep: 4000 }],
                 does: ['A Spymaster Can Work', 'A Mole Can Be Planted', 'Reports Every Month, Staffed or Not'] }
  };
  const IDS = Object.keys(FACILITIES);
  const FOR_POST = {}; for (const id of IDS) FOR_POST[FACILITIES[id].post] = id;

  const CONST = {
    STAFF_PER_LEVEL: 0.25,       // [C] what each level above one adds to a staffer's Craft's reach
    YARD_BASE: 0.06,             // [C] drill yield per level, staffed or not
    INFIRMARY_BASE: 0.20,        // [C] the body's own mending per level
    BARRACKS_CALM: 1.0,          // [C] stress off everyone a month, per level
    BARRACKS_LOYALTY: 0.3,       // [C] loyalty a month toward sixty, per level above one
    PRESS_GATE: 0.05,            // [C] gate per level
    LISTEN_LEVELS: 2,            // [C] reports a month at level three, staffed or not
    TIER_OFFSET: 1               // [S] the Armoury issues up to level + this
  };

  function grounds(corp) {
    corp.facilities = corp.facilities || { levels: {}, build: null, history: [] };
    for (const id of IDS) if (corp.facilities.levels[id] == null) corp.facilities.levels[id] = FACILITIES[id].start;
    return corp.facilities;
  }
  function level(corp, id) { return corp ? (grounds(corp).levels[id] || 0) : 0; }
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
    return Object.assign({ level: L + 1, does: F.does[L] }, F.levels[L]);
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

  /* ------------------------------------------------------------------ what they do alone */
  function yardYield(corp) { return 1 + CONST.YARD_BASE * level(corp, 'yard'); }
  function mendMult(corp) { return 1 + CONST.INFIRMARY_BASE * level(corp, 'infirmary'); }
  function barracksCalm(corp) { return CONST.BARRACKS_CALM * level(corp, 'barracks'); }
  function barracksLoyalty(corp) { return CONST.BARRACKS_LOYALTY * Math.max(0, level(corp, 'barracks') - 1); }
  function gateMult(corp) { return 1 + CONST.PRESS_GATE * level(corp, 'press'); }
  function listenLevels(corp) { return level(corp, 'listening') >= 3 ? CONST.LISTEN_LEVELS : 0; }
  function cutterAllowed(corp) { return level(corp, 'infirmary') >= 2; }
  function moleAllowed(corp) { return level(corp, 'listening') >= 2; }

  /* --------------------------------------------------------------------- the engine builds */
  /** what an engine OA wants to build next, by its temperament and what it can afford to leave in the bank */
  function aiChoose(corp, reserve) {
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
      .filter(o => o.nx && o.nx.cost > 0 && !capped(corp, o.id) && purse - o.nx.cost >= reserve)
      /* the cheaper next step of a wanted thing first: a house climbs, it does not leap */
      .map(o => ({ id: o.id, score: want[o.id] / (1 + o.nx.cost / 100000) / (1 + 0.5 * (o.nx.level - 1)) }))
      .sort((a, b) => b.score - a.score);
    return opts.length ? opts[0].id : null;
  }

  return { FACILITIES, IDS, FOR_POST, CONST, grounds, level, maxTier, postOpen, staffMult, nextLevel, canBuild, startBuild,
           tick, upkeep, capped, yardYield, mendMult, barracksCalm, barracksLoyalty, gateMult, listenLevels,
           cutterAllowed, moleAllowed, aiChoose };
});
