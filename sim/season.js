/* SEASONS.md — the persistent Corp and the season loop.
 *
 * Owns the object that outlives a Divide and the year that wraps around it. Everything here
 * acts on people who were already there last season: they age, they get better, they get
 * slower, they retire, their contracts run out, and they die and stay dead.
 *
 * The one rule that shapes the file: the Corp OWNS, the Divide BORROWS. `runDivide` is handed
 * a drop force and hands it back changed, exactly as it is already handed a reputation record.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('./prng.js'), require('./roster.js'), require('./items.js'),
    require('./ledger.js'), require('./reputation.js'), require('./divide.js'),
    require('./combat.js'), require('./tactical.js'), require('./map.js'),
    require('./negotiate.js'), require('./sponsors.js'), require('./predivide.js'),
    require('./trade.js'));
  else root.CDSEASON = factory(root.CDPRNG, root.CDROSTER, root.CDITEMS,
                               root.CDLEDGER, root.CDREP, root.CDDIVIDE, root.CDCOMBAT,
                               root.CDTACTICAL, root.CDMAP, root.CDNEG, root.CDSPONSOR,
                               root.CDPREDIVIDE, root.CDTRADE);
}(typeof self !== 'undefined' ? self : this, function (P, ROSTER, ITEMS, LED, REP, DIVIDE, C, TAC, MAP, NEG, SPON, PRE, TRADE) {
  'use strict';

  const CONST = {
    /* --- the roster (S2, S3) --- */
    /* --- THE PREP CALENDAR (S16) ---
       Eleven of the twelve months are not the Divide, and until Step 8.6 none of them existed:
       the whole year happened in one function call that aged everybody, healed everybody to
       full, signed some people and stopped. A management game whose management is a lump is a
       combat simulator with persistence.

       The year is five two-month turns, then the lock, then the Divide. `DESIGN.md` §4 places
       the windows: T2 tryouts, T4 the Bastille auction, T5 the merc deadline. Each turn is a
       budget of ACTION POINTS a corp spends on the things it could be doing instead of each
       other, which is where a management decision actually lives — you cannot treat the
       wounded, drill the green and scout the planet in the same two months. */
    /* THE MONTH IS THE TURN. This was five two-month blocks of five action points. A block is
       not a thing anyone sits down to: a manager takes a month, spends what it allows, and says
       they are done, and the world moves on once EVERY manager has said it. That last clause is
       why the month is the unit — it is the shape a second human player slots into without
       anything being rebuilt, where a two-month block shared between two people is not.
       The budget is the old one cut in half and rounded up, which makes a year slightly richer
       than it was (33 points against 25). Nobody has played this yet, so the figure is not
       evidence of anything; the structure is what is being changed. */
    PREP_MONTHS: 11,             // [S] M1-M11. M12 is the Divide.
    PREP_MONTH_DAYS: 30,         // [S] healing and recovery run at this rate, per month
    /* RULED — THE FOCUS SYSTEM replaces action points. Everything happens every month;
       focus STRENGTHENS it. Eight points, at most three on any one track, and the
       calibration that kept the fleet's year recognizable: THREE FOCUS EQUALS ONE OLD
       ACT, so effects scale linearly by thirds — except the signing window, where every
       point is another pass over the lot (an act of attention, not a scaled block). */
    FOCUS_POINTS: 8,             // [H] focus a corp gets each month
    FOCUS_CAP: 3,                // [H] the most focus any one track accepts
    TRAIN_BASELINE: 0.1,         // [C] everyone below the green gap drifts this fraction of a
                                 //     drill block toward their ceiling monthly, unfocused —
                                 //     nobody stagnates because a manager looked away. Kept
                                 //     small and green-gated so S-T5 still holds: potential
                                 //     is a thing most people never reach.
    /* RULED — STRESS SOURCES AND RELIEF (dials provisional, probe_years is the referee):
       drastically during Divides (the divide's own event table, now persistent on bodies),
       moderately under focused training, minimally under the baseline drift, relieved by
       rest — which is for EVERYONE, not just the wounded. STRESS_CAP mirrors divide.js
       STRESS_MAX: one store, one ceiling. */
    STRESS_CAP: 100,             // [S] the store's ceiling, everywhere
    REST_STRESS_BASE: 6,         // [C] everyone breathes a little each month regardless
    REST_STRESS_FOCUS: 12,       // [C] a fully-focused rest month on top, scaled by thirds
    /* --- REST AND RECOVERY, painted (ruled). A body has two sides that mend: WOUNDS and
       STRESS. Both come down on their own every month; focus speeds either up sharply, and
       it is painted at the same four breadth tiers the drill grid uses, so the two verbs
       read the same way and a manager learns one grammar rather than two. The tier weights
       are the drill's own — the inverse-breadth rule does not change because the subject
       does. */
    /* [C] AND FOCUS IS NEVER WASTED. Pour physical recovery onto somebody with nothing to
       mend and it becomes CONDITIONING: they walk onto the ground harder than they left it.
       Stress focus on somebody already calm steadies them the same way. Both are temporary
       by construction — they last exactly one Divide and are spent there, because a
       permanent gain from resting would be a second training verb wearing a bandage. */
    REST_CONDITION_PER_BLOCK: 5, // [C] raw stat points (×10 scale) a full block of overflow buys
    REST_CONDITION_CAP: 15,      // [C] and the most any one body can carry into a Divide
    TRAIN_STRESS_FOCUS: 4,       // [C] drilling hard wears on the drilled, scaled by thirds
    /* RULED — BOOST. The verbs cost nothing inherent (they never did: the census at step e
       confirmed every prep credit is a purchase). Instead a manager may pay to DOUBLE the
       value of the focus already spent on a track. Priced PER FOCUS POINT boosted, not flat,
       so a three-point hammer costs three times a one-point tap — wealth cannot buy a sixth
       effective point cheaply. The purchase tracks are their own economy and take no boost:
       you cannot pay to sign two of one recruit. */
    BOOST_PER_POINT: 4000,       // [H] credits to double one focus point's effect for a month
    TRAIN_STRESS_BASE: 1,        // [C] even the baseline drift costs a little
    DIVIDEND_STRESS: 8,          // [C] the lights are pressure, stun-grade or not
    TREAT_DAYS: 45,              // [C] days of healing bought by one full block of physical focus
    TRAIN_GAIN: 3.0,             // [C] stat movement toward potential per drill block (×10 scale)
    /* [C] THE INVERSE-BREADTH RULE. The same pip is worth more the narrower its target, so a
       pip's gain to any one (body, stat) it touches is TRAIN_GAIN scaled by its tier. The four
       tiers STACK: a fighter's stat grows by the sum of every tier that covers it. Ruled by the
       readout the grid shows — marginal < solid < rounded < sharp — and sworn by probe_train. */
    TRAIN_W_ALL:  0.30,          // corner: whole roster, every stat — the thinnest spread
    TRAIN_W_COL:  0.80,          // a column: one stat across the roster — solid, shared
    TRAIN_W_ROW:  1.20,          // a row: one hand, all stats — a rounded push
    TRAIN_W_CELL: 2.50,          // a cell: one hand, one stat — the scalpel
    /* [H] `[OPEN-S2]` — how hard each lock lean pulls against raw quality */
    LOCK_PROSPECT_W: 0.9,
    LOCK_RESTED_W: 2.5,
    TRAIN_GREEN_GAP: 20,         // [S] (×10 scale) a drill block only reaches people this far off their
                                 //     ceiling — the same population chooseFocus counts
    /* --- GATHER INTEL (the Survey rework). Focus painted onto a target — the planet or a
       rival — sends scouts, who fill a dossier of rows. A pip grants INTEL_PER_PIP points
       (INTEL_PER_PIP_BOOST if the effort is boosted); points are spent blank-and-thinnest
       first, each depth level of a row costing INTEL_LEVEL_COST. A rival's rows decay a level
       each year and read by freshness; the planet's rows never age within a year, read by
       completeness, and reset when the next planet is announced. Payoff is preparedness at the
       Divide: a rival sheet buys readiness against THAT house scaled by freshness; the planet
       sheet buys readiness on the ground scaled by completeness. Informational-only by ruling:
       intel never reaches into resolution, only into what the manager can see and decide. */
    INTEL_PER_PIP: 2,            // [C] LEVELS one pip of focus buys
    INTEL_PER_PIP_BOOST: 3,      // [C] levels a boosted pip buys — breadth, not quality
    INTEL_MAX_DEPTH: 3,          // [H] blank/sparse/moderate/full
    INTEL_RIVAL_PREP: 0.20,      // [C] readiness a full, fresh rival sheet buys against them
    INTEL_PLANET_PREP: 0.15,     // [C] readiness a complete planet sheet buys on the ground
    INTEL_DECAY_YEARS: 3,        // [H] years a rival row takes to fade from full to blank
    /* [C] INTEL ARRIVES WHEN YOU LOOK FOR IT. Ruled: you focus on the intel, you get the
       intel — no delay. This was three months, which nobody ever asked for, and it made
       the verb incoherent: a report landing three months on is old news about a rival who
       has since moved, it cannot be acted on in the month you paid for it, and it fought
       the ruling that intel can be gathered repeatedly across a year. Zero means the
       gather resolves in the same month it is bought, every month, all year. */
    SURVEY_MONTHS: 0,
    SCOUT_APATHY: 0.45,          // [H] board interest below which a corp does not survey at all
    /* --- the Dividend (S17), the mid-year show-match at T3 --- */
    /* --- the merc deadline (S18), T5. A free professional picks their employer. --- */
    /* --- the Kier Bastille intake (S19), T4. Volunteers, on contract, with a way out. --- */
    BASTILLE_LOT: 6,             // [S] how many sign out of the Bastille a year
    BASTILLE_TERM: 3,            // [S] Divides to serve before the freedom clause opens
    BASTILLE_WAGE_FRAC: 0.62,    // [H] of an open-market wage — cheaper, and that is the trade
    MERC_LOT: 8,              // [S] professionals on the market a year
    TRYOUT_LOT: 10,           // [S] Natties who turn up to trial a year — more of them than
                              //     mercs, cheaper, and further from what they might become
    MERC_HUNGER: 0.45,        // [H] how much harder a corp short of bodies bids
    MERC_W_MONEY: 0.45,       // [H] weight a fighter puts on the purse
    MERC_W_SAFETY: 0.40,      // [H] and on how many of that corp's people came home
    MERC_W_FAME: 0.15,        // [H] and on whether the crowd knows the name
    /* [H] below this they would rather stay where they are. MUST EXCEED `MERC_W_MONEY`, or the
       branch is dead by arithmetic: the top bidder always scores money=1, so a reserve under
       the money weight is cleared by every offer however murderous the corp, and "they can
       refuse the lot of them" describes something that cannot happen. It sat at 0.35 against a
       money weight of 0.45 and refusals were 0 across every career ever run. */
    MERC_RESERVE: 0.52,
    /* [H] what one month of working a signing window is worth at the table, and the ceiling on
       stacking it. Two months of work should beat one and ten should not buy the lot outright,
       which is what the cap is for. Not fitted to anything — nobody has played a full career
       yet — but the SHAPE is the point: preparation shows up as money at the moment of the
       signing, and a manager who ignored the window still gets to bid. */
    MERC_FAME_SPAN: 120,      // [C] the span of fleet standing a free agent reads across, from
                              //     loathed at -120 to famous at +120. Not fitted to anything:
                              //     it exists so the term VARIES, which it never did.
    MERC_UNKNOWN_RECORD: 0.72,// [C] assumed survival rate for a corp with no history yet
    DIVIDEND_PURSE: 18000,       // [H] prestige money for the winning corp
    DIVIDEND_WITHDRAWAL_POINTS: 3, // [C] calling it off in front of the crowd is the knockout
    DIVIDEND_FAME: 2,            // [C] crowd standing for showing up and being seen
    DIVIDEND_FAME_WIN: 3,        // [C] and for winning in front of them
    OFFSEASON_DAYS: 330,         // [S] eleven months between the Divide and the next lock

    ROSTER_MIN: 16, ROSTER_MAX: 40, ROSTER_TARGET: 28,
    SIGNING_SHARE: 0.5,          // [H] of free cash a corp will put into new contracts
    DROP_MIN: 16,
    /* [H] S3 — how far a corp's own taste for economy amplifies the board's funding demand when
       sizing a drop. At 0.5 a thrift-neutral corp answers the board at roughly face value, a
       thrifty one leans further, and a spendthrift one resists. */
    DROP_THRIFT_BASE: 0.5,
    /* DROP_MAX is NOT declared here. It is the size the Aleas ceiling is written for, it lives
       in `items.js` beside the allowance it defines, and a second copy here is how a constant
       drifts. */
    DROP_MAX: ITEMS.CONST.DROP_MAX,
    /* SQUAD_MAX / SQUAD_MIN are NOT declared here. They belong to `divide.js`, which is what
       actually deals a drop force into squads; this file had a second copy and divide.js had
       a third as a local with a comment admitting it was a mirror. */
    /* [H] THE FOUNDING ROSTER IS NOT ONE NUMBER. It was a flat 30 against a target of 28, so
       every corp opened two bodies OVER the threshold that gates signing — and the gate is a
       hard `continue`, not a preference — which meant no corp could sign anybody in its first
       year, in the season a player is most likely to be looking at.

       It is now derived per corp from `difficulty`, which already encodes exactly this and is
       already read by the board's expectations: 1 is Violets Enterprise, richest in the fleet,
       and 5 is Verdant Cradle, poorest. A stronger house opens with more people. Nobody opens
       with enough — the ceiling is two short of a full drop force, so the first year is a real
       question about how many to add, who, and what is left for gear once you have.

       `FOUNDING_FLOOR` is `ROSTER_MIN` on purpose rather than by coincidence: a corp founded
       there can field a legal drop only if nobody is hurt, which is a position, not an error. */
    FOUNDING_TOP: 22,            // [H] what difficulty 1 opens with — two shy of a full drop
    FOUNDING_STEP: 2,            // [H] bodies lost per step down the difficulty ladder
    FOUNDING_FLOOR: 16,          // [H] = ROSTER_MIN; the legal minimum to field at all

    /* --- careers (S4) --- */
    DEVELOP_BASE: 5.5,           // [C] movement toward the ceiling, per Divide survived (×10 scale)
    /* [C] THE HIDDEN CEILING IS GONE (ruled). `potential` was a per-person cap that stopped
       growth and nobody could see: with careers this short and growth this slow almost
       nobody ever reached theirs, so all it could do was quietly forbid specialisation in
       the rare case somebody did. Growth now runs to the SCALE's ceiling, the same for
       everyone. Potential survives as what it honestly is — what a scout thinks of somebody
       at signing — and decides who a corp is interested in, not who they may become. */
    STAT_CEIL: 200,
    DEVELOP_GREEN_MULT: 1.7,     // [C] before prime opens
    DEVELOP_BENCH_FRAC: 0.35,    // [C] a season on the bench against one on the ground
    DECLINE_RATE: 6.5,           // [C] body-stat loss per year past `decline` (×10 scale)
    RETIRE_AT_DECLINE: 0.10,     // [C] chance of hanging them up in the first year past it
    RETIRE_SPAN: 4,              // [S] years past decline by which retirement is certain
    MIND: ['tactics', 'presence', 'resolve', 'fieldcraft'],
    BODY: ['grit', 'reflex'],

    /* --- what a life costs, the survivors' half (S6) --- */
    GRIEF_DIVIDES: 1, GRIEF_CLOSE_DIVIDES: 2,
    GRIEF_MORALE: 5, GRIEF_CLOSE_MULT: 2.4,
    BREAK_RESOLVE_AT: 8,
    FRENZY_TRAITS: ['hot_headed', 'grudge_holder', 'keshu_grudge'],

    /* --- the board (S5, S12) --- */
    UNDERWRITE_PATIENCE_FLOOR: 8,
    /* [C] THE SCRAPE. Ruled with the trade table: a corp may run its roster down to nothing
       all year — fluidity until the Divide — but somebody has to walk onto the ground. So
       the floor is enforced at the LAST possible moment, when the merc window shuts in M10:
       whatever is missing is bought at the cheapest asking price on the board, and the
       board's patience takes a beating for having to do it. This is not a service, it is
       an intervention. */
    SCRAPE_PATIENCE: 22,         // [C] patience burned for having to fill your roster for you
    UNDERWRITE_DEMANDS: 5,

    /* --- contracts ---
       LOOT_RECOVERY_P is NOT declared here. It was, and it was a second copy of
       `items.js`'s — the exact duplication the integration survey warns about, small enough
       to look harmless. Only the items.js copy is doc-parity checked, so this one could have
       drifted in silence. There is one number and `settleArmoury` reads it from its owner. */
    RENEWAL_FAME_PULL: 0.4,
    FREED_RESIGN_BASE: 0.35,     // [C] a freed prisoner's appetite to re-sign with their captor
    /* [C] A TERM ONLY RUNS DOWN ON THE GROUND. The Bastille's people are cheaper than
       the market and that is the trade (PROJECT.md) — but a corp that signs a term and
       then benches it has bought nothing, and the fighter's one road out never moves.
       Measured: 14 of 22 conscripts across an eight-season career had served ZERO
       Divides, because the lock sorted on quality alone and they sit a little under
       the market. This is the weight of an unserved clause at the lock. */
    LOCK_TERM_W: 0.5,
    RENEWAL_SEASONS: 2           // [H] how long a renewed contract runs

    /* `SEASON_MONTHS: 13` WAS DECLARED HERE and is gone. A year is twelve months — eleven of
       prep and the Divide — and the ledger already declared `SEASON_MONTHS: 12`, which is the
       one every wage calculation reads. Nothing has ever read this copy: zero readers, in the
       whole tree, since it was written. It was a second copy of a constant, disagreeing with
       the first, sitting eleven lines under the comment above warning about exactly that with
       LOOT_RECOVERY_P. The suite's calendar guard asserts SEASON_MONTHS === 12 and reads the
       LEDGER's copy, so it passed every run while a 13 sat here untouched.
       There is one number, and it lives in ledger.js. */
  };

  /* ------------------------------------------------------------------ the Corp */

  /** How many people a house opens with, from how hard it is to run. Exported so the suite can
      check the spread rather than trusting the arithmetic here. */
  function foundingRoster(profile) {
    const d = (profile && profile.difficulty) || 3;
    return Math.max(CONST.FOUNDING_FLOOR, CONST.FOUNDING_TOP - (d - 1) * CONST.FOUNDING_STEP);
  }

  /** Open the whole fleet once. After this nothing is ever regenerated. */
  function openFleet(rng, profiles, opts) {
    opts = opts || {};
    const corps = {};
    for (const profile of profiles) {
      const doc = ITEMS.doctrineForCorp(profile.id);
      const size = opts.rosterSize || foundingRoster(profile);
      const roster = [];
      /* generated ONCE, in squad-sized batches so the generator's own shape is preserved */
      let left = size;
      while (left > 0) {
        const n = Math.min(8, left);
        roster.push(...ROSTER.generateSquad(rng, n, { corpId: profile.id }).bodies);
        left -= n;
      }
      for (const f of roster) { f.divides = 0; f.seasonsHere = 0; f.retired = false; }
      corps[profile.id] = {
        id: profile.id, profile,
        roster: roster,
        armoury: ITEMS.foundingArmoury(doc.id, size, {}).stock,
        account: LED.open(profile),
        rep: REP.open(profile, profiles, { season: 1 }),
        doctrineId: doc.id,
        season: 0,
        underwritten: false, dismissed: 0,
        history: []
      };
    }
    return corps;
  }

  /* ------------------------------------------------------------------ the offseason */

  function ageOf(f) { return (f.age != null ? f.age : 24); }

  /* Age curves come straight from races.json. S4 is expressed against each race's own
     `decline`, not in literal years, which is what keeps Svalbard primes long. */
  let RACE_AGE = null;
  function raceAges() {
    if (RACE_AGE) return RACE_AGE;
    RACE_AGE = {};
    try {
      const rs = (typeof require === 'function')
        ? require('fs') && JSON.parse(require('fs').readFileSync(__dirname + '/../data/races.json', 'utf8')).races
        : (typeof CDRACES !== 'undefined' ? CDRACES.races : []);
      for (const r of rs) RACE_AGE[r.id] = r.age;
    } catch (e) { /* browser: seeded by the page */ }
    return RACE_AGE;
  }
  function curve(f) {
    const a = raceAges()[f.race];
    return a || { recruit_min: 17, prime: [22, 32], decline: 34, venerable: 42 };
  }

  /** A year passes: everybody older, the young better, the old slower. */
  /* ------------------------------------------------------------------ the Dividend */

  /**
   * S17 — THE DIVIDEND. `DESIGN.md` §4 (canon): the mid-year non-lethal show-match, at T3.
   * Stun-grade loadouts, minor-injury risk only, a prestige purse. Its jobs are to blood
   * rookies safely, build fame, showcase for sponsors, and feed the odds.
   *
   * It was deferred past Step 7 on the grounds that "the Dividend is a fame factory, and it
   * wanted fame to exist before it started manufacturing it." Fame exists. So does something
   * else: `experience.dividends` is rolled at character generation, is read by `combat.js` for
   * the composure seed at `XP_DIVIDEND` a piece — and has never been INCREMENTED by anything in
   * the project. Every fighter's dividend count was backstory. Nobody had ever fought one.
   *
   * NON-LETHALITY IS THE LOADOUT, not a filter over the result. Both sides carry the cheapest
   * shelf in the catalog with no mods and no consumables, which is what the fiction means by
   * stun-grade. A killing blow that lands anyway is converted to a downed fighter — the medics
   * are standing right there, which is the whole point of the format — and `conversions` counts
   * how often that happens, so if the loadouts stop doing the work the number says so instead
   * of the filter quietly covering for them.
   */
  const DIVIDEND_ARMS = ['itm_stun_carbine', 'itm_shock_lance', 'itm_dazzler'];
  function dividendLoadout(f, i) {
    /* REAL STUN WEAPONS, not cheap lethal ones. The first build handed both sides the cheapest
       rifles on the shelf and hoped — which is not non-lethality, it is a worse gun, and it was
       still killing 0.36 people a match. These carry `nonlethal` (COMBAT.md §9.3): a fatal hit
       puts the target down instead and nothing they do leaves a permanent wound. No sidearm,
       because a service pistol is a live round and would undo the whole format. */
    ITEMS.equip(f, { primary: DIVIDEND_ARMS[i % DIVIDEND_ARMS.length], armor: 'itm_flak_vest',
                     sidearm: null, mods: [], consumables: [] });
  }

  /** The eight greenest fit bodies — this is a place to blood people, not to win with veterans. */
  /* WHO YOU SEND TO THE LIGHTS. The fleet's own rule is the greenest fit bodies — an
     exhibition is where you blood people who have not seen a Divide. A manager may name
     their own eight instead (`corp._dividendPick`), which is the whole decision the format
     offers: blood the green, or put your names in front of a crowd that pays in fame. Only
     fit, unpledged bodies can take the floor either way, so the pick cannot smuggle a
     wounded fighter or a conscript owed to a term onto the card. */
  function dividendEligible(corp) {
    return corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired' &&
      !(f.contract && f.contract.divides_required != null &&
        (f.contract.divides_served || 0) < f.contract.divides_required) &&
      !((f.condition || {}).injuries || []).length);
  }
  function dividendSquad(corp) {
    const pick = corp._dividendPick;
    if (pick && pick.length) {
      const ok = dividendEligible(corp);
      const named = pick.map(id => ok.find(f => f.id === id)).filter(Boolean).slice(0, 8);
      if (named.length >= 4) return named;
      /* too few of the named are fit to show: fall through to the fleet's own rule rather
         than field a card that cannot legally take the floor */
    }
    /* THE FLEET HAS TASTE TOO (ruled). Every corp sending its greenest eight made the card
       the same every year and gave a manager who fielded names a free win over rookies.
       Each OA picks by its own lights instead, and which lights depends on what the corp is
       and how its year is going:

         BLOOD   the greenest — an exhibition nobody dies in is where you season people;
         SHOW    the famous — a paying crowd, and fame is worth more to some boards;
         DRILL   the best of the unblooded — the ones a corp is trying to bring on;
         SPARE   whoever is idlest — rest the people who matter, treat the night as noise.

       The lean is the corp's own: a board hungry for standing shows off, a corp deep in
       green hands bloods them, a corp with a thin roster spares it. Deterministic per corp
       and season, because a card that reshuffles on a re-run is not a decision. */
    const eligible = dividendEligible(corp);
    if (!eligible.length) return [];
    const seasonN = (corp._season || corp.season || 0);
    let h = 2166136261;
    const key = corp.id + '|dividend|' + seasonN;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const roll = ((h >>> 8) % 1000) / 1000;

    const green = eligible.filter(f => ((f.experience || {}).divides || 0) === 0).length;
    const patience = (corp.rep && corp.rep.patience != null) ? corp.rep.patience : 50;
    const thin = eligible.length <= CONST.ROSTER_MIN;
    /* WEIGHTS, NOT A LADDER OF GATES. The first cut stacked conditions in order and the
       first one that matched won — which in season one, when nearly every corp is deep in
       green hands, meant four fifths of the fleet chose BLOOD and the other two leans never
       appeared at all. Each corp now draws from a distribution that its own situation
       tilts, so the card varies from the first year on. */
    let w;
    if (thin) w = { spare: 0.55, blood: 0.20, drill: 0.15, show: 0.10 };
    else if (patience < 35) w = { show: 0.50, drill: 0.20, blood: 0.20, spare: 0.10 };
    else if (green >= 6) w = { blood: 0.40, drill: 0.30, show: 0.20, spare: 0.10 };
    else w = { drill: 0.30, show: 0.30, blood: 0.25, spare: 0.15 };
    let lean = 'blood', acc = 0;
    for (const k of ['blood', 'drill', 'show', 'spare']) {
      acc += w[k] || 0;
      if (roll < acc) { lean = k; break; }
    }

    const divides = f => ((f.experience || {}).divides || 0);
    const quality = f => (f.stats.aim + f.stats.tactics + f.stats.resolve + f.stats.grit) / 4;
    const sorters = {
      blood: (a, b) => divides(a) - divides(b),
      show:  (a, b) => (b.fame || 0) - (a.fame || 0),
      drill: (a, b) => (divides(a) - divides(b)) || (quality(b) - quality(a)),
      spare: (a, b) => (b.condition && b.condition.stress || 0) - (a.condition && a.condition.stress || 0)
    };
    corp._dividendLean = lean;
    return eligible.slice().sort(sorters[lean]).slice(0, 8);
  }

  function runDividend(rng, corps, ids, season, tally) {
    /* pair the fleet off: 1v2, 3v4, ... in standing order as it stands at mid-year */
    const order = ids.slice();
    for (let i = 0; i + 1 < order.length; i += 2) {
      const A = corps[order[i]], B = corps[order[i + 1]];
      const bodiesA = dividendSquad(A), bodiesB = dividendSquad(B);
      if (bodiesA.length < 4 || bodiesB.length < 4) continue;   /* not enough fit people to show */
      const saved = [];
      bodiesA.concat(bodiesB).forEach((f, i) => {
        saved.push([f, f.loadout]);
        dividendLoadout(f, i);
      });
      const side = (corp, bodies) => {
        let cap = bodies[0];
        for (const f of bodies) if (f.stats.tactics > cap.stats.tactics) cap = f;
        return { tag: corp.id, corpId: corp.id, policy: 'standard', policyName: 'standard',
                 hasMedkit: true,
                 units: bodies.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById,
                                                             isCaptain: f.id === cap.id, day: 1 })) };
      };
      /* THE DIVIDEND IS TELEVISION. Every match is kept whole — sides, frames, and now the
         log the old `log: false` threw away — riding the season's own dividend tally, so
         any surface can replay the lights all year and the record dies with the season the
         way everything in state does. The resolve keeps its own seeded stream, so keeping
         the footage costs the world no rolls. */
      const sA = side(A, bodiesA), sB = side(B, bodiesB);
      const res = TAC.resolve(P.mulberry32(P.seedFrom('dividend' + season + A.id)),
                              sA, sB,
                              { terrain: 'ruins', openingBand: 1, prep: [0.5, 0.5] });

      /* --- what the crowd saw, and what it cost ---
         SCORED ON POINTS, because it is an exhibition. The first version totalled dead and
         downed, which is how you win a Divide — and stun-grade loadouts produce almost none of
         either: a measured match came back 0 dead, 0 down, 1 light. So `scoreA === scoreB` in
         all twenty matches of a six-season career, every bout was a draw, and the purse was
         never once paid. A win condition borrowed from a lethal format, wired to a state this
         one does not reach.
         Hits landed carry it, a withdrawal is the knockout, and both are things the crowd can
         actually see happen. */
      /* `res.casualties` is keyed by the SIDE'S TAG, and these sides are tagged with corp ids —
         so reading `.A` and `.B` returned `undefined`, every field defaulted to zero, and all
         twenty matches scored 0-0. The same shape as the scoring bug it was hiding behind:
         a value read by a name nothing writes, failing silently into a plausible number. */
      const casA = (res.casualties[A.id] || {}), casB = (res.casualties[B.id] || {});
      const points = c => (c.light || 0) + 2 * (c.down || 0) + 2 * (c.dead || 0) +
                          ((c.fled || 0) + (c.panicked || 0)) +
                          (c.calledWithdrawal ? CONST.DIVIDEND_WITHDRAWAL_POINTS : 0);
      const scoreA = points(casB), scoreB = points(casA);   /* what each side did to the other */
      const winner = scoreA === scoreB ? null : (scoreA > scoreB ? A : B);
      for (const f of bodiesA.concat(bodiesB))
        if (f.condition) f.condition.stress = Math.min(CONST.STRESS_CAP,
          (f.condition.stress || 0) + CONST.DIVIDEND_STRESS);
      (tally.watch = tally.watch || []).push({
        corps: [A.id, B.id], sides: [sA, sB], res: res,
        score: [scoreA, scoreB], winnerId: winner ? winner.id : null });
      tally.matches++;
      tally.draws += winner ? 0 : 1;
      tally.conversions += (casA.dead || 0) + (casB.dead || 0);

      for (const [f, lo] of saved) {
        ITEMS.equip(f, lo);                       /* their real kit goes back on */
        f.experience = f.experience || { divides: 0, battles: 0, dividends: 0 };
        f.experience.dividends = (f.experience.dividends || 0) + 1;
        f.experience.battles = (f.experience.battles || 0) + 1;
        f.fame = Math.min(100, (f.fame || 0) + CONST.DIVIDEND_FAME);
        tally.fought++;
      }
      if (winner) {
        LED.post(winner.account, 'income', 'Dividend purse', CONST.DIVIDEND_PURSE);
        tally.purses++;
        for (const f of (winner === A ? bodiesA : bodiesB)) {
          f.fame = Math.min(100, (f.fame || 0) + CONST.DIVIDEND_FAME_WIN);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ the merc deadline */

  /**
   * S18 — THE MERC DEADLINE, at T5. **The mercenary chooses.**
   *
   * A free professional with a reputation is the one party in this economy with real leverage:
   * they are not a prospect hoping to be seen and not serving a sentence, they are for hire and
   * can walk. So the merc market is an OFFER MARKET — corps bid, and **the fighter picks**, and
   * can refuse the lot of them.
   *
   * Money is one term and not the only one. What a merc is being asked is whose drop force to
   * stand in, so they weigh the purse against **how many of that corp's people came home**,
   * which gives `care` and a corp's loss rate a reader with teeth. A corp that burns through
   * people finds it cannot hire, whatever it offers.
   *
   * *(This was built at T4 as the Bastille auction and moved by designer ruling. Choosing your
   * employer is a mercenary's luxury, and a prisoner's is not the same thing — see
   * `bastilleIntake`, which keeps the volunteering and the contract without pretending the two
   * parties negotiate from the same place.)*
   */
  function survivalRecord(corp) {
    /* what happened to the people this corp sent, over its whole history — the thing a
       prospective signing would actually ask about in the bar */
    let sent = 0, lost = 0;
    for (const h of (corp.history || [])) { sent += h.dropped || 0; lost += h.dead || 0; }
    if (sent < 8) return CONST.MERC_UNKNOWN_RECORD;   /* no record yet: benefit of the doubt */
    return 1 - (lost / sent);
  }

  /** What one fighter thinks of one offer. Higher is better; below zero they would rather not. */
  function weighOffer(f, corp, offer, best) {
    const money = best > 0 ? offer / best : 1;                       /* 0..1 against the top bid */
    const safety = survivalRecord(corp);                             /* 0..1, share who came home */
    /* THE CROWD. This read `rep.base.public`, and there is no `public` audience — the four are
       own, rival, fleet and aleas. So the fallback fired for every corp in every season and the
       term was a constant 0.5 across 24 corps in three careers: a weight of 0.15 wired to
       something that could never vary. The audience a mercenary would actually consult is the
       WIDER FLEET, which is the one that watches everybody rather than one corp's own ships.
       It is a signed scale — being loathed is a real position — so this maps the whole of it,
       and a corp the fleet detests now reads worse to a free agent than an unknown one. */
    const fleet = REP.standing(corp.rep, 'fleet');
    const standing = Math.max(0, Math.min(1, (fleet + CONST.MERC_FAME_SPAN) / (2 * CONST.MERC_FAME_SPAN)));
    return CONST.MERC_W_MONEY * money
         + CONST.MERC_W_SAFETY * safety
         + CONST.MERC_W_FAME * standing
         - CONST.MERC_RESERVE;
  }

  /**
   * THE LOT EXISTS BEFORE THE DEADLINE. It used to be generated inside the market at the moment
   * the market ran, which meant nobody could look at it: there was no window of time in which
   * the candidates existed and had not yet been allocated. That is why "work the signing
   * window" could only ever be an invisible modifier on an auction the player never saw. A
   * roster-building game where a button builds the roster for you is not the game.
   *
   * A lot is now opened at the START of its window and hangs on the season, so every month of
   * the run-up shows the same faces, and an offer is made against a NAMED fighter.
   */
  function openLot(rng, kind, corpId) {
    const spec = {
      tryouts:  { n: CONST.TRYOUT_LOT,   mix: [['nattie', 1]] },
      mercs:    { n: CONST.MERC_LOT,     mix: [['mercenary', 1]] },
      bastille: { n: CONST.BASTILLE_LOT, mix: [['prisoner', 1]] }
    }[kind];
    /* a tryout lot belongs to ONE ship — corpId weights the races to that ship's people */
    const lot = ROSTER.generateSquad(rng, spec.n, { corpId: corpId || null, poolMix: spec.mix }).bodies;
    for (const f of lot) { f.divides = 0; f.seasonsHere = 0; f.retired = false; }
    return lot;
  }

  /** What one fighter is asking for a year, before anybody bids. */
  function askingPrice(f) {
    return Math.round(((f.contract && f.contract.salary) || 0) * LED.CONST.SALARY_MONTHS);
  }

  /** What a corp can put into new contracts right now. */
  function signingBudget(c) {
    const alive = c.roster.filter(x => x.status !== 'dead' && x.status !== 'retired');
    const spare = c.account.treasury + c.account.grant - LED.CONST.ALEAS_ENTRY
                - LED.wageBill(alive) - LED.CONST.RESERVE_FLOOR;
    return Math.max(0, spare * CONST.SIGNING_SHARE);
  }

  /**
   * Run an offer market over an already-open lot. `bids` maps a corp id to
   * `{ fighterId: amount }` — a HUMAN'S named offers. Any corp without an entry bids the way it
   * always did. The fighter still chooses, and can still refuse the lot of them.
   */
  function runOfferMarket(rng, corps, ids, lot, tally, bids, kind) {
    tally.lot += lot.length;
    bids = bids || {};

    for (const f of lot) {
      /* --- who bids --- */
      const offers = [];
      const ask = askingPrice(f);
      for (const id of ids) {
        const c = corps[id];
        const alive = c.roster.filter(x => x.status !== 'dead' && x.status !== 'retired');
        const budget = signingBudget(c);

        /* A HUMAN'S NAMED OFFER comes first and is honoured as given. A manager who wants to
           overpay for somebody may; a manager who lowballs will watch them sign elsewhere. The
           only thing checked is that the money exists — the roster ceiling is the AI's
           appetite, not a rule, and a player who wants a deep bench may build one. */
        const named = bids[id] && bids[id][f.id];
        if (named != null) {
          if (budget >= named && named > 0) offers.push({ corp: c, bid: Math.round(named), human: true });
          continue;
        }

        if (alive.length >= CONST.ROSTER_TARGET) continue;           /* full, not interested */
        if (budget < ask) continue;                                  /* cannot cover the year */
        /* a corp short of bodies bids harder — need is the only lever now */
        const hunger = (CONST.ROSTER_TARGET - alive.length) / CONST.ROSTER_TARGET;
        offers.push({ corp: c, bid: Math.round(ask * (1 + hunger * CONST.MERC_HUNGER)) });
      }
      if (!offers.length) { tally.unbid++; continue; }
      tally.bids += offers.length;

      /* --- and then THE FIGHTER CHOOSES --- */
      const best = Math.max.apply(null, offers.map(o => o.bid));
      let pick = null, pickScore = 0;
      for (const o of offers) {
        const v = weighOffer(f, o.corp, o.bid, best);
        if (v > pickScore) { pickScore = v; pick = o; }
      }
      if (!pick) { tally.refused++; continue; }                      /* nobody was worth it */
      /* did they take the money, or turn it down for somebody safer? */
      if (pick.bid < best) tally.tookLessForSafety++;

      f.contract = f.contract || {};
      f.contract.salary = Math.round(pick.bid / LED.CONST.SALARY_MONTHS);
      f._fameAtSigning = f.fame || 0;
      pick.corp.roster.push(f);
      LED.post(pick.corp.account, 'expense', kind + ' signing',
               -((f.contract && f.contract.signing_cost) || 0));
      tally.signed++;
      /* who got them, and what everybody else offered — so a manager can be TOLD they were
         outbid and by how much, rather than watching a number fail to change. */
      (tally.results = tally.results || []).push({
        fighterId: f.id, name: f.name, to: pick.corp.id, at: pick.bid,
        offers: offers.map(o => ({ corp: o.corp.id, bid: o.bid }))
      });
    }
  }

  /** The merc deadline, over the lot opened at the start of its window. */
  function runMercMarket(rng, corps, ids, lot, tally, bids) {
    return runOfferMarket(rng, corps, ids, lot, tally, bids, 'mercs');
  }

  /** The Nattie tryouts. THIS MARKET DID NOT EXIST: the calendar offered a `tryouts` window in
      M3 and M4, the action spent a point recording that you had worked it, and nothing anywhere
      read it, because there was no tryouts event of any kind. Two of the six window-months in
      the year were guaranteed to do nothing. Prospects rather than professionals — younger,
      cheaper, further from their ceiling. */
  function runTryouts(rng, corps, ids, lots, tally, bids) {
    /* Natties sign FLAT: the listed salary for the listed years, the pension for the
       family, the Divide bonus on top — no premium, because there is no other bidder.
       The manager marks who they want from their own sheet; every other house signs from
       its own by the same budget test the Bastille uses, best ceiling first, capped at
       two a year (a provisional dial until a roster-target ruling exists). */
    for (const id of ids) {
      const corp = corps[id];
      const lot = (lots || {})[id] || [];
      tally.lot += lot.length;
      const marked = bids && bids[id] ? Object.keys(bids[id]) : null;
      /* working the tryout window runs a longer bench trial: a corp that spent its points
         here signs deeper from its own sheet. Without this the verb bought nothing at the
         very window it names — the fault the old market comment mocked, reborn.
         AND THE DEPTH IS NEED-DRIVEN, ruled by measurement: probe_years.cjs played six
         fleet-years and found rosters troughing to twelve against a drop floor of sixteen,
         because the shared markets are scarcity-capped while departures are not. The
         tryouts are the one supply a corp owns outright — its own ship — so a house bled
         below the floor calls up more of its own, to two above the floor, budget willing. */
      const aliveNow = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired').length;
      const shortfall = Math.max(0, (CONST.DROP_MIN + 2) - aliveNow);
      const depth = 2 + shortfall;
      const want = marked
        ? lot.filter(f => marked.indexOf(f.id) >= 0)
        : lot.slice().sort((a, b) => (b.potential || 0) - (a.potential || 0)).slice(0, depth);
      let took = 0;
      for (const f of want) {
        if (signingBudget(corp) < askingPrice(f)) { tally.refused++; continue; }
        f.divides = 0; f.seasonsHere = 0; f.retired = false;
        f._fameAtSigning = f.fame || 0;
        corp.roster.push(f);
        lots[id] = lots[id].filter(x => x !== f);
        tally.signed++; took++;
      }
      tally.bids += want.length;
    }
  }

  /* ------------------------------------------------------------------ the Bastille intake */

  /**
   * S19 — THE KIER BASTILLE INTAKE, at T4. A contract, and a way out of it.
   *
   * These are **volunteers**, and that word is doing real work: nobody is dragged out of a cell
   * and sold. Somebody serving a sentence put their name down for a term of Divides in exchange
   * for a wage and, at the end of it, their freedom. That is the distance the setting needs — a
   * lot auctioned off to die is an endorsement, and a bad bargain taken with open eyes is a
   * story about what people will trade for a way out.
   *
   * But it is NOT the merc market and must not be modelled as one. A merc picks their employer
   * because they can walk; someone signing out of the Bastille has one offer in front of them
   * and a sentence behind them, and pretending the two parties negotiate from the same place
   * would flatten exactly the thing that makes this setting uncomfortable on purpose.
   *
   * So: the corp chooses, from a pool that is cheaper than the open market and comes with
   * `divides_required` — the freedom clause. Serve the term and you are `freed`, the clause is
   * not re-armed, and `resignFreed` already decides whether you stay. What the fighter controls
   * is the exit, not the entrance.
   */
  function bastilleIntake(rng, corps, ids, season, tally, openedLot) {
    /* the lot is opened with the window now, so it can be walked before the intake day */
    const lot = openedLot && openedLot.length ? openedLot
              : ROSTER.generateSquad(rng, CONST.BASTILLE_LOT,
                                     { corpId: null, poolMix: [['prisoner', 1]] }).bodies;
    tally.lot += lot.length;
    /* the shortest rosters get first refusal — a corp that can field is not desperate enough to
       be at the Bastille, and this is the market of last resort by design */
    /* A corp that WORKED THE BASTILLE WINDOW jumps the queue by as many places as the months it
       put in — it has already walked the wing and knows which of them it wants. Effective
       roster size is what sorts, so the work reads as being hungrier than you are. */
    /* SORTED PER FIGHTER, NOT ONCE. This was computed once before the lot and then reused for
       every body in it, so the single shortest roster was first in the queue for all six and
       took all six — one corp hoovered the entire intake and every other corp, including the
       player's, got nothing whatever it did. "The shortest rosters get first refusal" is a rule
       about who is hungriest AT THAT MOMENT, and signing somebody makes you less hungry. */
    const queue = () => ids.slice().sort((a, b) => {
      const n = c => corps[c].roster.filter(f => f.status !== 'dead' && f.status !== 'retired').length;
      return n(a) - n(b);
    });
    for (const f of lot) {
      const order = queue();
      let taken = null;
      for (const id of order) {
        const c = corps[id];
        const alive = c.roster.filter(x => x.status !== 'dead' && x.status !== 'retired');
        if (alive.length >= CONST.ROSTER_TARGET) continue;
        const spare = c.account.treasury + c.account.grant - LED.CONST.ALEAS_ENTRY
                    - LED.wageBill(alive) - LED.CONST.RESERVE_FLOOR;
        const salary = Math.round(((f.contract && f.contract.salary) || 0) * CONST.BASTILLE_WAGE_FRAC);
        const year = salary * LED.CONST.SALARY_MONTHS;
        if (Math.max(0, spare * CONST.SIGNING_SHARE) < year) continue;
        f.contract = f.contract || {};
        f.contract.salary = salary;                       /* cheaper, and that is the trade */
        /* the clause was sampled per contract at generation (canon: freedom_divides_weights);
           the intake used to flatten every lot to the same term, erasing the variance the
           lot sheet is priced on. It now respects what the paper says. */
        f.contract.divides_required = f.contract.divides_required || CONST.BASTILLE_TERM;
        f.contract.divides_served = 0;
        /* STATUS IS A BODY'S STATE; the prison term is the CONTRACT'S. Signing with
           status 'prisoner' meant the squads' active-filter never fielded a single one:
           the Bastille's people were dropped, equipped, and served out their clauses as
           phantoms who never stood in a fight. They stand now. */
        f.status = 'active';
        f.divides = 0; f.seasonsHere = 0; f.retired = false;
        f._fameAtSigning = f.fame || 0;
        c.roster.push(f);
        LED.post(c.account, 'expense', 'Bastille intake',
                 -((f.contract && f.contract.signing_cost) || 0));
        taken = c; tally.signed++;
        break;
      }
      if (!taken) tally.unplaced++;
    }
  }

  /* ------------------------------------------------------------------ the prep calendar */

  /**
   * S16 — THE ELEVEN MONTHS THAT ARE NOT THE DIVIDE.
   *
   * `DESIGN.md` §4: the year is five two-month turns, then M11 lock, then M12 the Divide.
   * T1 season open · T2 Nattie tryouts · T3 survey drip · T4 Kier Bastille auction ·
   * T5 merc deadline and last pacts.
   *
   * Until Step 8.6 none of it existed. `offseason()` aged everybody, healed everybody to full,
   * signed some people and returned — eleven months in one call, with no decision anywhere in
   * it. The healing was the tell: a flat `OFFSEASON_DAYS 330` subtracted from every wound in a
   * single pass, which cures anything the game can inflict, so injuries could never persist
   * into a second season and a manager never had to choose between mending someone and doing
   * anything else.
   *
   * A turn is a budget. Five action points against verbs that cost two, two, one and two means
   * a corp cannot treat its wounded, drill its green and scout the planet in the same two
   * months — and THAT is the management game. The AI spends them by need through
   * `chooseFocus`, which is the same function a human manager's interface would call, per S1.
   */
  /* The eleven months. `signing` is the window open that month; `event` is the fleet-wide thing
     that happens at the END of it, after every corp has finished spending.
     The fixed dates sit on the second month of what used to be their two-month block, so the
     month before each is a run-up you can spend on it — you can work the merc window in M9 and
     M10 and the deadline falls at the close of M10. The lock is M11 and is a decision rather
     than a spend, but the month still carries a budget: patching somebody up in the last four
     weeks so they can stand at the drop is a real call, and it was not available before. */
  const MONTHS = {
    1:  { name: 'Season Open',      signing: null,       event: null },
    2:  { name: 'Season Open',      signing: null,       event: null },
    3:  { name: 'Nattie Tryouts',   signing: 'tryouts',  event: null },
    4:  { name: 'Nattie Tryouts',   signing: 'tryouts',  event: 'tryouts' },
    5:  { name: 'Survey Drip',      signing: null,       event: null },
    6:  { name: 'The Dividend',     signing: null,       event: 'dividend' },
    7:  { name: 'Bastille Run-Up',  signing: 'bastille', event: null },
    8:  { name: 'Bastille Intake',  signing: 'bastille', event: 'bastille' },
    9:  { name: 'Merc Run-Up',      signing: 'mercs',    event: null },
    10: { name: 'Merc Deadline',    signing: 'mercs',    event: 'mercs' },
    11: { name: 'The Lock',         signing: null,       event: null }
  };

  /**
   * What this corp would do with a turn's action points. Ranked by need, not by taste, and
   * capped by what the turn's window allows — you cannot sign in a month with no window open.
   * Returns the verbs in the order they will be paid for.
   */
  function chooseFocus(corp, month) {
    /* the same need signals the old chooser read, now sizing an allocation: the heaviest
       needs take the cap, the rest take what is left. SCOUTING IS NOT A FILLER (ruled):
       its weight is the board's interest, so an indifferent board still buys no surveys. */
    const alive = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
    const hurt = alive.filter(f => f.condition && (f.condition.injuries || []).length);
    const green = alive.filter(f => {
      const cap = CONST.STAT_CEIL;
      return CONST.MIND.some(k => f.stats[k] < cap - 20);
    });
    const interest = ((corp.rep || {}).goal || {}).interest;
    const open = {}; for (const o of monthTracks(corp, month)) open[o.kind] = o.available;
    const win = MONTHS[month];
    const stressed = alive.filter(f => ((f.condition && f.condition.stress) || 0) >= 50).length;
    const weights = [
      ['rest', hurt.length + stressed * 0.3],
      ['train', green.length * 0.5],
      ['scout', interest == null ? 0.5 : interest - CONST.SCOUT_APATHY],
      ['court', 0.55 - 0.2 * (((corp.sponsors || {}).contracts || []).length)]
    ].filter(w => w[1] > 0 && open[w[0]]).sort((a, b) => b[1] - a[1]);
    const focus = {};
    let left = CONST.FOCUS_POINTS;
    for (const [kind] of weights) {
      if (!left) break;
      const f = Math.min(CONST.FOCUS_CAP, left);
      focus[kind] = f; left -= f;
    }
    /* COURTING PICKS A HOUSE. If the AI spent focus on courting, aim it at the sponsor it fits
       best (weighted by any standing regard) — the same targeted courting a person paints on the
       desk, so the fleet and the player build sponsor standing through one path. */
    if (focus.court) {
      const best = SPON.prospects(corp)[0];
      if (best) focus.courtTarget = { [best.house]: focus.court };
      else delete focus.court;
    }
    return focus;
  }

  /**
   * WHAT A MANAGER COULD DO THIS MONTH, and what each verb would actually be for. This is the
   * seam the interface renders and the AI is measured against — one list, one set of costs, one
   * set of reasons a verb is unavailable. The AI ranks this list by need; a human reads the same
   * list and picks. If they ever came from two different places, the AI would be playing a
   * different game from the player, which is the whole failure this project keeps producing.
   *
   * `available` is false only for reasons that are TRUE OF THE WORLD — no window open, nobody
   * hurt to treat — never for reasons of taste. Cost is checked by the caller against what is
   * left, because a verb you cannot afford this second is still a verb that exists.
   */
  function monthTracks(corp, month) {
    const win = MONTHS[month] || { name: 'Month ' + month, signing: null, event: null };
    const alive = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
    const hurt = alive.filter(f => f.condition && (f.condition.injuries || []).length);
    const green = alive.filter(f => {
      const cap = CONST.STAT_CEIL;
      return CONST.MIND.some(k => f.stats[k] < cap - CONST.TRAIN_GREEN_GAP);
    });
    const interest = ((corp.rep || {}).goal || {}).interest;
    return [
      { kind: 'rest', cap: CONST.FOCUS_CAP, name: 'Rest and Recovery',
        available: true, subject: hurt.length,
        why: hurt.length + ' Carrying an Injury \u00b7 Mean Stress ' +
             Math.round(alive.reduce(function (a, f) {
               return a + ((f.condition && f.condition.stress) || 0); }, 0) /
               Math.max(1, alive.length)) },
      { kind: 'train', cap: CONST.FOCUS_CAP, name: 'Drill the Green',
        available: green.length > 0, subject: green.length,
        why: green.length ? green.length + ' Short of Their Ceiling' : 'Nobody Has Room to Grow' },
      /* A survey party sent this late cannot get back before the drop, so the verb is shut —
         a fact about the world, which is the only thing `available` is allowed to mean. The AI
         reads this same list, so it stops buying reports that arrive after the lock rather than
         having to be told separately not to; one path, one set of reasons. */
      /* the scouts report the month they are sent, so this track is open all year and
         never has to explain a wait it no longer imposes */
      { kind: 'scout', cap: CONST.FOCUS_CAP, name: 'Gather Intel',
        available: month + CONST.SURVEY_MONTHS <= CONST.PREP_MONTHS,
        subject: 0,
        why: month + CONST.SURVEY_MONTHS > CONST.PREP_MONTHS
               ? 'Scouts Sent Now Cannot Report Before the Lock'
               : 'Reports This Month' +
                 (interest == null ? '' : ' \u00b7 Board Interest ' + interest.toFixed(2)) },
      /* COURT SPONSORS. Spend focus to court houses; each sponsor backs one OA a year and signs
         the highest-standing courter at the lock, so courting builds toward THIS year's board.
         Shut only when a fixer sent this late could not build any standing before the year turns
         — a fact about the world, the only thing `available` is allowed to mean. */
      { kind: 'court', cap: CONST.FOCUS_CAP, name: 'Court a Sponsor',
        available: month + SPON.CONST.COURT_MONTHS <= CONST.PREP_MONTHS,
        subject: ((corp.sponsors || {}).contracts || []).length,
        why: month + SPON.CONST.COURT_MONTHS > CONST.PREP_MONTHS
               ? 'Sponsors Commit at the Lock \\u2014 Too Late to Build Standing Now'
               : (((corp.sponsors || {}).contracts || []).length
                   ? 'Backed by ' + corp.sponsors.contracts.map(c => c.house).join(', ')
                   : 'Court a Backer for the Year') }
    ];
  }

  /**
   * A HUMAN'S PICKS, filtered by the same rules the AI obeys. Anything unavailable or unaffordable
   * is dropped rather than silently costing nothing, and what survives is returned in the order
   * asked for. A manager who spends nothing spends nothing; that is a legal month.
   */
  function validateFocus(corp, month, wanted) {
    /* ONE PATH: a human's allocation passes the same availability and the same budget the
       AI obeys. Unknown and shut tracks are dropped; each track clamps to the cap; the
       total clamps to the budget in the order given. */
    const open = {}; for (const o of monthTracks(corp, month)) open[o.kind] = o.available;
    const focus = {};
    let left = CONST.FOCUS_POINTS;
    for (const kind in (wanted || {})) {
      if (kind === '_boost' || kind === 'trainTarget') continue;
      if (!open[kind] || !left) continue;
      const f = Math.min(CONST.FOCUS_CAP, Math.max(0, Math.floor(wanted[kind] || 0)), left);
      if (f) { focus[kind] = f; left -= f; }
    }
    /* a boost only survives for a track that actually took focus — no paying to double
       an effort you did not make */
    if (wanted && wanted._boost) {
      focus._boost = {};
      for (const k in wanted._boost)
        if (focus[k]) focus._boost[k] = true;
    }
    if (wanted && wanted.trainTarget) focus.trainTarget = wanted.trainTarget;
    /* courting's per-house map is a rider like trainTarget — carried through so the player's
       painted houses reach the spend, and clamped to nothing exotic (it is read as data). */
    if (wanted && wanted.courtTarget && typeof wanted.courtTarget === 'object')
      focus.courtTarget = wanted.courtTarget;
    return focus;
  }

  /* --------------------------------------------------------- consequences that land later */

  /**
   * A MONTH'S ACTION CAN HAVE AN OUTCOME THAT ARRIVES LATER. Everything used to resolve the
   * instant it was spent, which quietly forbade a whole class of decision: a survey that reports
   * in three months, a contract talk that needs two sittings, a treatment that might not take.
   * None of those were expressible, and none of them are content — they are a property of the
   * frame. Built now, with four verbs, because retrofitting it across a dozen is worse.
   *
   * A pending outcome is a plain record on the corp: what it is, when it lands, and what it
   * carries. It is resolved at the START of the month it is due, before anybody spends, so a
   * manager opens the month already knowing what the last one bought them.
   *
   * Two things this deliberately does NOT do. It does not fire a callback — a saved career
   * would have to store a function — so an outcome is a `kind` string dispatched here, and a
   * save file stays plain data. And it does not survive the turn of the year: an outcome due
   * after M11 is dropped when the season closes rather than landing into a season it was not
   * bought in. Both are the sort of thing that looks like a limitation and is a decision.
   */
  function schedule(corp, kind, monthsAhead, payload) {
    const due = (corp._month || 1) + monthsAhead;
    if (due > CONST.PREP_MONTHS) return null;          /* it would land after the lock */
    corp._pending = corp._pending || [];
    const item = { kind: kind, due: due, payload: payload || {} };
    corp._pending.push(item);
    return item;
  }

  /** Everything due this month, applied. Returns what landed, so an interface can say so. */
  function resolvePending(corp, month, tally, season, CORPS) {
    if (!corp._pending || !corp._pending.length) return [];
    const landed = [], keep = [];
    for (const item of corp._pending) {
      if (item.due > month) { keep.push(item); continue; }
      /* DISPATCH BY STRING, not by stored function — see above. An unknown kind is dropped and
         reported rather than thrown: a save from a build that knew a verb this one does not
         should degrade, not die. */
      if (item.kind === 'intel') {
        /* the scouts report. Spend the points onto the dossier, blank-and-thinnest first; for a
           rival, freeze a characterized reading of exactly the rows touched, stamped this month,
           so it is honestly dated and never silently updates. */
        const intel = ensureIntel(corp, season || 0);
        const p = item.payload;
        const absMonth = (season || 0) * 100 + month;   /* absolute stamp: freshness decodes season from /100 */
        if (p.target === 'rival' && p.oaId && CORPS && CORPS[p.oaId]) {
          const them = CORPS[p.oaId];
          gatherIntel(corp, 'rival', p.oaId, p.levels || 0, absMonth,
                      (rowKey, depth) => snapshotRival(them, rowKey, depth, season || 0));
        } else {
          gatherIntel(corp, 'planet', null, p.levels || 0, absMonth, null);
        }
        landed.push({ kind: 'intel', text: 'The Scouts Reported Back' });
        if (tally) tally.surveysLanded = (tally.surveysLanded || 0) + 1;
      } else {
        landed.push({ kind: item.kind, text: 'An Outcome This Build Does Not Know Arrived', unknown: true });
      }
    }
    corp._pending = keep;
    return landed;
  }

  /* ======================= GATHER INTEL — the dossier model =======================
     A corp keeps `_intel = { season, planet:{rows}, rivals:{ oaId:{rows} } }`. Every row is
     { depth, gathered, snapshot? } — depth 0..3, `gathered` the absolute month it was last
     filled (rival age), `snapshot` the frozen characterized reading (rivals only; the planet
     is read live because it does not change). The row LISTS below are the schema; the reading
     functions that turn a row into words live on the page and the divide, not here — this
     module owns the economy (points in, depth out) and the two aging axes. */
  const INTEL_RIVAL_ROWS = ['roster', 'finances', 'kit', 'training', 'moves', 'board'];
  /* the planet's fat row costs more to fill; everything else is an ordinary two-per-level row */
  const INTEL_PLANET_ROWS = ['archetype', 'prize', 'demand', 'terrain', 'hazards', 'supply', 'sectors'];
  const INTEL_FAT_ROWS = { sectors: 2 };   /* sectors costs 2 level-units per level — 6 to fill,
                                              making the planet a 24-level sheet (6×3 + 6) */

  function ensureIntel(corp, season) {
    if (!corp._intel || corp._intel.season !== season) {
      /* a new planet each year: the planet sheet resets, rival sheets persist and decay */
      const prior = corp._intel && corp._intel.rivals ? corp._intel.rivals : {};
      corp._intel = { season: season, planet: { rows: {} }, rivals: prior };
    }
    return corp._intel;
  }
  function intelRow(sheet, key) {
    if (!sheet.rows[key]) sheet.rows[key] = { depth: 0, gathered: 0 };
    return sheet.rows[key];
  }
  /* the level-units it costs to raise a row one depth. Ordinary rows cost 1; the planet's fat
     sectors row costs 2, so filling it eats 6 of a pip's levels rather than 3. */
  function levelCost(target, key) {
    return target === 'planet' ? (INTEL_FAT_ROWS[key] || 1) : 1;
  }

  /* SPEND LEVELS, blank-and-thinnest first. A pip grants INTEL_PER_PIP levels; each level
     raises the thinnest affordable row one depth. Deterministic order among equally-thin rows
     (schema order) so the gate can read it. Returns the rows touched for snapshot freezing. */
  function gatherIntel(corp, target, oaId, levels, month, snapFor) {
    const intel = corp._intel;
    const sheet = target === 'planet' ? intel.planet
                                      : (intel.rivals[oaId] = intel.rivals[oaId] || { rows: {} });
    const rowKeys = target === 'planet' ? INTEL_PLANET_ROWS : INTEL_RIVAL_ROWS;
    const touched = {};
    let left = levels, guard = 0;
    while (left > 0 && guard++ < 100) {
      let pick = null, pickDepth = 99;
      for (const k of rowKeys) {
        const r = intelRow(sheet, k);
        if (r.depth >= CONST.INTEL_MAX_DEPTH) continue;
        if (levelCost(target, k) > left) continue;
        if (r.depth < pickDepth) { pick = k; pickDepth = r.depth; }
      }
      if (!pick) break;
      const r = intelRow(sheet, pick);
      r.depth += 1;
      r.gathered = month;
      left -= levelCost(target, pick);
      touched[pick] = r.depth;
      if (target === 'rival' && snapFor) r.snapshot = snapFor(pick, r.depth);
    }
    return touched;
  }

  /* freshness of a rival row: 1.0 at the month gathered, falling to 0 over INTEL_DECAY_YEARS.
     Drives both how the row reads (page's problem) and the preparedness it still buys. */
  function rowFreshness(row, season) {
    if (!row || !row.depth) return 0;
    const yearsOld = Math.max(0, season - Math.floor((row.gathered || 0) / 100));
    return Math.max(0, 1 - yearsOld / CONST.INTEL_DECAY_YEARS);
  }

  /* the preparedness a RIVAL sheet buys against that house: depth × freshness, averaged over
     the rows, scaled to the cap. A blank or wholly-stale sheet buys nothing. */
  function rivalPreparedness(corp, oaId, season) {
    const sheet = corp._intel && corp._intel.rivals && corp._intel.rivals[oaId];
    if (!sheet) return 0;
    let sum = 0;
    for (const k of INTEL_RIVAL_ROWS) {
      const r = sheet.rows[k];
      if (r && r.depth) sum += (r.depth / CONST.INTEL_MAX_DEPTH) * rowFreshness(r, season);
    }
    return CONST.INTEL_RIVAL_PREP * (sum / INTEL_RIVAL_ROWS.length);
  }

  /* the preparedness the PLANET sheet buys on the ground: pure completeness, no aging. */
  function planetPreparedness(corp) {
    const sheet = corp._intel && corp._intel.planet;
    if (!sheet) return 0;
    let filled = 0, total = 0;
    for (const k of INTEL_PLANET_ROWS) {
      total += CONST.INTEL_MAX_DEPTH;
      const r = sheet.rows[k];
      if (r) filled += r.depth;
    }
    return total ? CONST.INTEL_PLANET_PREP * (filled / total) : 0;
  }

  /* CHARACTERIZE a rival's live state into a frozen reading for one row, at a given depth.
     Depth sharpens the read: 1 = a vague characterization, 3 = specifics. Read from real
     fields — roster, treasury, armoury, the training grid's focus, recent signings, the board
     demand — so the dossier is honest. Frozen by the caller and stamped with the month. */
  /* --- WHAT PARTIAL INTELLIGENCE IS (ruled) -------------------------------------------
     A thin dossier row is a WINDOW AROUND THE TRUTH, not an adjective. "A deep roster
     (partial)" told a manager nothing they could act on, and "Drilling unknown" was
     literally nothing at all — a row that had been paid for and said less than silence.
     Every row now brackets the real figure and the bracket tightens as the dossier
     deepens: 12–30 hands at a glance, 22–27 with work, 23 when it is known.

     The bracket is deterministic per rival, row and season, so looking twice at the same
     depth does not walk the window around — scouting harder narrows it, it never
     re-rolls it. And the window ALWAYS contains the truth: intel here is incomplete, not
     wrong. Lying to the manager is a different mechanic and it is not this one. */
  function intelWindow(them, rowKey, season, value, depth, opts) {
    const o = opts || {};
    /* a stable per-(rival, row, season) offset so the window sits honestly off-centre
       rather than always straddling the truth exactly */
    let h = 2166136261;
    const key = (them.id || '') + '|' + rowKey + '|' + (season || 0);
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const jitter = ((h >>> 8) % 1000) / 1000;               /* 0..1, stable */
    const spanFrac = depth >= 3 ? 0 : depth === 2 ? (o.mid != null ? o.mid : 0.12)
                                                  : (o.wide != null ? o.wide : 0.45);
    /* the floor keeps small numbers honest, but it has to tighten with depth too, or a
       deep look on a small figure reads no better than a glance */
    const floorAt = (o.floor || 1) * (depth === 2 ? 0.34 : 1);
    if (spanFrac <= 0) return null;                          /* known exactly */
    const span = Math.max(floorAt, Math.abs(value) * spanFrac);
    const below = span * (0.35 + jitter * 0.3);              /* how much of the window sits under */
    let lo = value - below, hi = lo + span;
    if (o.min != null && lo < o.min) { hi += (o.min - lo); lo = o.min; }
    if (o.max != null && hi > o.max) { lo -= (hi - o.max); hi = o.max; }
    if (o.min != null) lo = Math.max(o.min, lo);
    if (lo > value) lo = value;                              /* the truth never leaves the window */
    if (hi < value) hi = value;
    return { lo: lo, hi: hi };
  }

  function snapshotRival(them, rowKey, depth, season) {
    /* money wears the credit mark here too, so a dossier reads like every other surface */
    const nf = x => '\u20a1' + Math.round(x || 0).toLocaleString('en-US');
    const rng2 = null;
    /* a number, bracketed to what this depth can honestly claim */
    /* A GUESS SHOULD LOOK LIKE A GUESS. ₡199,725–₡314,475 is preposterously precise about
       being imprecise — nobody's scouts come back with the last seven credits of a range.
       Big figures round to a legible step, and they round OUTWARD (low down, high up) so the
       window can only ever grow: the truth stays inside it, which is the one thing about
       partial intelligence that must never break. Small counts — hands, drill points — are
       already legible and are left alone. */
    const niceStep = v => {
      const a = Math.abs(v);
      if (a >= 100000) return 5000;
      if (a >= 10000) return 500;
      if (a >= 1000) return 50;
      return 0;
    };
    const band = (rowKey2, value, opts) => {
      const w = intelWindow(them, rowKey2, season, value, depth, opts);
      const f = (opts && opts.fmt) || (x => String(Math.round(x)));
      if (!w) return f(value);
      const step = (opts && opts.round === false) ? 0 : niceStep(value);
      if (step) {
        w.lo = Math.floor(w.lo / step) * step;
        w.hi = Math.ceil(w.hi / step) * step;
        if (opts && opts.min != null) w.lo = Math.max(opts.min, w.lo);
        if (opts && opts.max != null) w.hi = Math.min(opts.max, w.hi);
      }
      const lo = f(w.lo), hi = f(w.hi);
      /* a window that has closed to a single figure SAYS the figure — "3\u20133 points"
         reads like a bug, and after formatting a tight range often is one number */
      return lo === hi ? lo : lo + '\u2013' + hi;
    };
    void rng2;
    const alive = (them.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired');
    const acct = them.account || {};
    const vague = depth <= 1, full = depth >= 3;
    switch (rowKey) {
      case 'roster': {
        const n = alive.length;
        const mix = { nattie: 0, mercenary: 0, prisoner: 0 };
        alive.forEach(f => { const k = (f.contract || {}).kind; if (mix[k] != null) mix[k]++; });
        const label = { nattie: 'Natural-Born', mercenary: 'Mercenary', prisoner: 'Conscript' };
        const parts = Object.keys(mix).filter(k => mix[k])
          .sort((a, b) => mix[b] - mix[a]).map(k => mix[k] + ' ' + label[k]);
        const hands = band('roster', n, { min: 0, floor: 3 }) + ' Fighters';
        if (vague) return hands;
        if (!full) return hands + ' \u00b7 Mostly ' + (parts[0] ? parts[0].replace(/^\d+ /, '') : '\u2014');
        return n + ' Fighters \u00b7 ' + parts.join(', ');
      }
      case 'finances': {
        const t = acct.treasury || 0;
        const wage = alive.reduce((s, f) => s + ((f.contract || {}).salary || 0), 0);
        const money = { fmt: nf, min: 0, floor: 1000 };
        if (vague) return band('finances', t, money);
        if (!full) return band('finances', t, money) +
                          ' \u00b7 Wage ' + band('finances_wage', wage, money);
        return nf(t) + ' \u00b7 Wage ' + nf(wage) + ' \u00b7 Grant ' + nf(acct.grant || 0);
      }
      case 'kit': {
        const arm = them.armoury || {};
        const held = Object.keys(arm).reduce((s, k) => s + (arm[k] || 0), 0);
        if (full) return held + ' Pieces in the Armoury';
        return band('kit', held, { min: 0, floor: 4 }) + ' Pieces in the Armoury';
      }
      case 'training': {
        /* "Drilling unknown" was a paid-for row that said less than silence. Training is
           reported as WHAT THEY ARE DRILLING and HOW HARD, in points of focus a manager
           can compare against their own board — bracketed like every other row. */
        /* the rival's own recorded drill (every corp, AI or human, writes this when it
           spends on the track); the human's painted board is the fallback */
        const dr = them._drill;
        const t = them.plan && them.plan.trainFocus;
        const col = (dr && dr.col) || (t && t.col) || {};
        const cols = Object.keys(col).filter(k => col[k] > 0)
                           .sort((a, b) => (col[b] || 0) - (col[a] || 0));
        const spent = dr ? (dr.points || 0)
          : ((t ? (t.all || 0) : 0) +
             Object.keys(col).reduce((s, k) => s + (col[k] || 0), 0) +
             Object.keys((t && t.cell) || {}).reduce((s, k) => s + (t.cell[k] || 0), 0));
        if (!spent) return full ? 'No Drilling This Month' : 'Little or No Drilling \u00b7 0\u20131 Points';
        const pts = band('training', spent, { min: 0, floor: 2 }) + ' Points of Drill';
        if (vague) return pts;
        if (!full) return pts + (cols[0] ? ' \u00b7 Mostly ' + cols[0] : ' \u00b7 Spread Wide');
        return spent + ' Points of Drill \u00b7 ' +
               (cols.length ? cols.map(k => k + ' ' + col[k]).join(', ') : 'Spread Across the Roster');
      }
      case 'moves': {
        const signed = (them._recruit && them._recruit.signed) || 0;
        if (full) return signed + ' Signed Recently \u00b7 ' +
                      (((them.sponsors || {}).contracts || []).length ? 'Courting Sponsors' : 'No Courting');
        /* a small count needs a wider floor to stay a window at all: 0\u20131 is a real
           statement, but it collapses to a certainty the moment the floor rounds away */
        return band('moves', signed, { min: 0, floor: 2 }) + ' Signed of Late';
      }
      case 'board': {
        /* the demand itself is a sentence, not a quantity — but board INTEREST is a
           number, and it is the one a manager acts on, so it brackets like the rest */
        const goal = (them.rep || {}).goal || {};
        const it = goal.interest;
        const pct = { fmt: x => Math.round(x * 100) + '%', min: 0, max: 100, floor: 0.08 };
        if (vague) return it != null
          ? 'Board Interest ' + band('board', it, pct)
          : 'Board Interest Unread';
        if (!full) return 'Board Wants ' + (goal.text || 'a strong Divide') +
                          (it != null ? ' \u00b7 Interest ' + band('board', it, pct) : '');
        return 'Board Demands: ' + (goal.text || 'a strong Divide') + ' \u00b7 Interest ' +
               (it != null ? Math.round(it * 100) + '%' : '\u2014');
      }
    }
    return '\u2014';
  }


  /* A TEMPORARY EDGE, SPENT IN THE NEXT DIVIDE. Conditioning is not training: it does not
     touch a fighter's stats, it rides beside them in `_conditioned`, combat reads it when a
     body becomes a combatant, and the settlement clears it. A permanent gain bought by
     resting would just be a second drill verb wearing a bandage. */
  function condition(f, stat, blocks) {
    if (!(blocks > 0)) return;
    f._conditioned = f._conditioned || {};
    const add = CONST.REST_CONDITION_PER_BLOCK * blocks;
    f._conditioned[stat] = Math.min(CONST.REST_CONDITION_CAP,
                                    (f._conditioned[stat] || 0) + add);
  }

  function prepMonth(rng, corp, month, season, tally, wanted, landedOut, corps) {
    const win = MONTHS[month] || { name: 'Month ' + month, signing: null, event: null };
    /* --- time passes whether or not anybody spends anything --- */
    let mended = 0;
    for (const f of corp.roster) {
      if (f.status === 'dead' || f.status === 'retired' || !f.condition) continue;
      f.condition.fatigue = Math.max(0, (f.condition.fatigue || 0) - 40);
      f.condition.stress = Math.max(0, (f.condition.stress || 0) - CONST.REST_STRESS_BASE);
      f.condition.health = Math.min(100, (f.condition.health || 0) + 30);
      if (f.condition.morale != null) f.condition.morale = Math.min(100, f.condition.morale + 3);
      const inj = f.condition.injuries || [];
      if (inj.length) {
        f.condition.injuries = inj.filter(w => {
          if (w.careerEnding || w.permanent) return true;
          w.days_remaining -= CONST.PREP_MONTH_DAYS;
          return w.days_remaining > 0;
        });
        mended += inj.length - f.condition.injuries.length;
        if (f.status === 'injured' && !f.condition.injuries.length) f.status = 'active';
      }
    }
    tally.mended += mended;
    /* RULED — everyone trains every month, slowly: the green drift a fraction of a drill
       block toward their ceiling whether or not anybody watches. Green-gated like the
       drill itself, so S-T5 holds: the last yards to a ceiling are never free. */
    for (const f of corp.roster) {
      if (f.status === 'dead' || f.status === 'retired') continue;
      const cap = CONST.STAT_CEIL;
      if (cap == null) continue;
      let drifted = false;
      for (const k of CONST.MIND)
        if (f.stats[k] < cap - CONST.TRAIN_GREEN_GAP) {
          f.stats[k] = Math.min(cap, f.stats[k] + CONST.TRAIN_GAIN * CONST.TRAIN_BASELINE);
          drifted = true;
        }
      if (drifted && f.condition)
        f.condition.stress = Math.min(CONST.STRESS_CAP,
                                      (f.condition.stress || 0) + CONST.TRAIN_STRESS_BASE);
    }

    /* --- and then the corp spends what it has --- */
    /* WHAT THE LAST FEW MONTHS BOUGHT, before anybody spends this one. */
    corp._month = month;
    const landed = resolvePending(corp, month, tally, season, corps);
    if (landedOut) for (const l of landed) landedOut.push(l);

    /* ONE PATH. A human's list is filtered by the same availability and the same budget the AI
       obeys, and then both arrive here as the same thing. S1 asks that the AI make its call
       through the function a human would use; this is the other half of that bargain. */
    const focus = wanted ? validateFocus(corp, month, wanted)
                         : chooseFocus(corp, month);
    for (const kind in focus) {
      if (kind === '_boost' || kind === 'trainTarget' || kind === 'courtTarget') continue;   /* riders, not tracks */
      const fpts = focus[kind];
      if (!fpts) continue;
      /* BOOST rides the focus map as `_boost: { track: true }`. Where set on a non-purchase
         track the effect doubles and the corp pays per point — billed HERE, once, against
         the same treasury the AI obeys, and only if it can afford the whole boost (a
         half-paid boost is the kind of split-state this project refuses). The window is a
         purchase-adjacent attention verb and takes no boost. */
      const boosts = (focus._boost) || {};
      let mult = 1;
      if (boosts[kind]) {
        const bill = fpts * CONST.BOOST_PER_POINT;
        if ((corp.account.treasury || 0) >= bill) {
          LED.post(corp.account, 'expense', kind + ' boost', -bill);
          mult = 2;
          tally.boosted = (tally.boosted || 0) + fpts;
          tally.boostSpend = (tally.boostSpend || 0) + bill;
        }
      }
      const third = fpts / 3 * mult;     /* three focus = one old act, ruled; boost doubles it */
      tally.focus += fpts;
      tally.acts[kind] = (tally.acts[kind] || 0) + fpts;
      const a = { kind: kind };
      if (a.kind === 'rest') {
        /* --- THE RECOVERY GRID. Two tracks per body — `wounds` and `stress` — painted at
           the drill's four tiers, which STACK: the corner (everyone, both tracks), a column
           (one track, everyone), a row (one body, both tracks), a cell (one body, one
           track). A bare `rest` scalar with no map is a corner paint, which is what the
           old whole-roster rest was, so nothing that used to call this changes its meaning.

           Focus is never wasted: physical effort with nothing to mend becomes conditioning
           (grit), calm-side effort on somebody already steady becomes composure (resolve),
           and both are spent in the next Divide. */
        const rt = (wanted && wanted.restTarget) || null;
        const rmap = rt && (rt.all != null || rt.col || rt.row || rt.cell)
          ? { all: rt.all || 0, col: rt.col || {}, row: rt.row || {}, cell: rt.cell || {} }
          : { all: fpts, col: {}, row: {}, cell: {} };
        const TRACKS = ['wounds', 'stress'];
        const blocks = (fighterId, track) => {
          /* the share of a full block this body gets on this track, summed over every tier
             that covers it — the drill's own arithmetic, subject changed */
          let b = 0;
          b += (rmap.all || 0) / 3 * CONST.TRAIN_W_ALL;
          b += ((rmap.col || {})[track] || 0) / 3 * CONST.TRAIN_W_COL;
          b += ((rmap.row || {})[fighterId] || 0) / 3 * CONST.TRAIN_W_ROW;
          b += ((rmap.cell || {})[fighterId + '|' + track] || 0) / 3 * CONST.TRAIN_W_CELL;
          return b * mult;
        };
        for (const f of corp.roster) {
          if (f.status === 'dead' || f.status === 'retired' || !f.condition) continue;
          const wB = blocks(f.id, 'wounds'), sB = blocks(f.id, 'stress');

          /* the calm side */
          if (sB > 0) {
            const before = f.condition.stress || 0;
            const after = Math.max(0, before - CONST.REST_STRESS_FOCUS * sB);
            f.condition.stress = after;
            const spent = before - after;
            /* whatever the effort could have taken off but found nothing to take */
            const spare = CONST.REST_STRESS_FOCUS * sB - spent;
            if (spare > 0) condition(f, 'resolve', spare / CONST.REST_STRESS_FOCUS);
          }
          /* the physical side */
          if (wB > 0) {
            const inj = f.condition.injuries || [];
            if (inj.length) {
              let budget = CONST.TREAT_DAYS * wB, used = 0;
              f.condition.injuries = inj.filter(w => {
                if (w.careerEnding || w.permanent) return true;
                const take = Math.min(w.days_remaining, budget - used);
                if (take > 0) { w.days_remaining -= take; used += take; }
                return w.days_remaining > 0;
              });
              if (f.status === 'injured' && !f.condition.injuries.length) f.status = 'active';
              tally.treated++;
              const spare = CONST.TREAT_DAYS * wB - used;
              if (spare > 0) condition(f, 'grit', spare / CONST.TREAT_DAYS);
            } else {
              condition(f, 'grit', wB);          /* nothing to mend: all of it is conditioning */
            }
          }
        }
      } else if (a.kind === 'train') {
        /* THE FOUR-TIER DRILL. Focus is painted onto stats at four breadth tiers that STACK:
           the corner (all.every), a column (one stat, everyone), a row (one hand, all stats),
           a cell (one hand, one stat). A fighter's stat grows by the SUM of every tier that
           covers it, each tier weighted by the inverse-breadth rule — narrower pays more per
           pip. Still green-gated against the ceiling: the last yards are never free (S-T5).
           `mult` (the boost rider) still doubles the whole effort. */
        const tgt = (wanted && wanted.trainTarget) || null;
        const map = tgt && (tgt.all != null || tgt.col || tgt.row || tgt.cell)
          ? { all: tgt.all || 0, col: tgt.col || {}, row: tgt.row || {}, cell: tgt.cell || {} }
          : { all: fpts, col: {}, row: {}, cell: {} };   /* a bare train scalar = a corner paint */
        /* WHAT A DRILL LOOKS LIKE FROM OUTSIDE. The dossier's training row used to read
           `plan.trainFocus`, which only the human's own corp ever carries — so for every
           AI rival the row was empty and reported "Drilling unknown", a paid-for line that
           said less than silence. The spend is recorded here, where it actually happens,
           so a scout has something true to find. */
        corp._drill = { month: month, points: fpts,
                        col: Object.assign({}, map.col || {}) };
        const STATS = CONST.MIND.concat(CONST.BODY || ['grit', 'reflex']);
        const isFam = id => CONST.MIND.indexOf(id) < 0 && (CONST.BODY || []).indexOf(id) < 0;
        /* pips of a tier become a share of a drill block: 3 pips = one full block at that weight */
        const w = (pips, tierW) => CONST.TRAIN_GAIN * tierW * (pips / 3) * mult;
        for (const f of corp.roster) {
          if (f.status === 'dead' || f.status === 'retired') continue;
          const cap = CONST.STAT_CEIL;
          if (cap == null) continue;
          let drilled = false;
          /* the stats this hand can be drilled on: the seven core stats, plus any weapon
             family that appears as a cell target for this fighter (aim is a talent, untrained) */
          const fams = {};
          for (const key in map.cell) { const p = key.split(':');
            if (p[0] === f.id && isFam(p[1])) fams[p[1]] = true; }
          const targets = STATS.filter(k => k !== 'aim').concat(Object.keys(fams));
          for (const k of targets) {
            const fam = isFam(k);
            const store = fam ? (f.skills = f.skills || {}) : f.stats;
            const cur = store[k] != null ? store[k] : (fam ? f.stats.aim : null);
            if (cur == null || cur >= cap - CONST.TRAIN_GREEN_GAP) continue;
            /* stack every tier that covers this (fighter, stat) */
            let gain = 0;
            if (!fam) gain += w(map.all, CONST.TRAIN_W_ALL);
            gain += w(map.col[k] || 0, CONST.TRAIN_W_COL);
            if (!fam) gain += w(map.row[f.id] || 0, CONST.TRAIN_W_ROW);
            gain += w(map.cell[f.id + ':' + k] || 0, CONST.TRAIN_W_CELL);
            if (gain <= 0) continue;
            store[k] = Math.min(cap, cur + gain);
            tally.trained++;
            drilled = true;
          }
          if (drilled && f.condition)
            f.condition.stress = Math.min(CONST.STRESS_CAP, (f.condition.stress || 0) +
                                          CONST.TRAIN_STRESS_FOCUS * third);
        }
      } else if (a.kind === 'scout') {
        /* GATHER INTEL. Focus is painted PER TARGET — the planet and any rivals — so the
           ride is a map, `wanted.intelTarget = { planet:pips, <oaId>:pips }`, and each
           painted target fills its own dossier with the levels its pips bought.

           YOU FOCUS ON THE INTEL, YOU GET THE INTEL. Ruled. This used to SCHEDULE the
           gather three months out, which nobody asked for and which made the verb
           incoherent: what came back was old news about a rival who had moved on, it
           could not be acted on in the month it was paid for, and it fought the ruling
           that a manager may look again and again across a year. It resolves inline now,
           in the month it is bought, against the rival as they stand TODAY — which is
           also what makes a second look later in the year worth buying.

           Absent a map, a bare scout falls to the planet with all its focus. */
        const perPip = (focus._boost && focus._boost.scout)
          ? CONST.INTEL_PER_PIP_BOOST : CONST.INTEL_PER_PIP;
        const map = (wanted && wanted.intelTarget && typeof wanted.intelTarget === 'object'
                     && !wanted.intelTarget.target)
          ? wanted.intelTarget : { planet: fpts };   /* legacy/bare scout → all on the planet */
        const intelNow = ensureIntel(corp, season || 0);
        const absMonth = (season || 0) * 100 + month;
        let anyGathered = false;
        for (const key in map) {
          const pips = map[key] || 0;
          if (pips <= 0) continue;
          const levels = pips * perPip;
          if (key !== 'planet' && corps && corps[key]) {
            const them = corps[key];
            gatherIntel(corp, 'rival', key, levels, absMonth,
                        (rowKey, depth) => snapshotRival(them, rowKey, depth, season || 0));
          } else {
            gatherIntel(corp, 'planet', null, levels, absMonth, null);
          }
          anyGathered = true;
        }
        if (anyGathered) {
          tally.scouted++;
          tally.surveysLanded = (tally.surveysLanded || 0) + 1;
          if (landedOut) landedOut.push({ kind: 'intel', text: 'The Scouts Reported' });
        }
        void intelNow;
      } else if (a.kind === 'court') {
        /* COURT SPONSORS. Focus is painted PER HOUSE, `courtTarget = { <houseId>:pips }`, and
           each painted house is courted NOW — the effort accumulates on the corp toward the
           lock, where each sponsor signs the highest-standing courter. No delay: courting is a
           relationship built across the year, read at its end. The map rides `focus` (the AI's
           chooser and the player's validated allocation both put it there), so one path. */
        const map = (focus.courtTarget && typeof focus.courtTarget === 'object')
          ? focus.courtTarget : null;
        if (map) {
          for (const house in map) {
            const pips = map[house] || 0;
            if (pips <= 0) continue;
            SPON.court(corp, house, pips);
            tally.courted = (tally.courted || 0) + 1;
          }
        }
      }
    }
    return focus;
  }

  /* worstWound() died with the treat verb: rest does not triage — it is for everyone */

  /* A per-corp `runPrep` was written first and deleted the same session: the calendar has to be
     stepped a TURN at a time across the whole fleet, not a year at a time per corp, because T3
     ends with the Dividend and a show-match nobody else is at is not a show. The loop in
     `runCareer` does it. */

  function offseason(rng, corp) {
    const out = { developed: 0, declined: 0, injured: 0, retired: [], expired: [], freed: [] };
    const keep = [];
    for (const f of corp.roster) {
      if (f.status === 'dead') continue;                       /* gone, and stays gone */
      f.age = ageOf(f) + 1;
      const a = curve(f);

      /* --- development: the mind grows with what it has survived --- */
      const onGround = !!f._droppedLastSeason;
      const rate = CONST.DEVELOP_BASE * (onGround ? 1 : CONST.DEVELOP_BENCH_FRAC)
                 * (f.age < a.prime[0] ? CONST.DEVELOP_GREEN_MULT : 1);
      /* `potential` is a single ceiling, not a map — the highest this person could ever be
         at anything. It has been rolled and hidden since Step 2 and nothing has ever
         approached it, because nobody has ever had a second season. */
      const cap = CONST.STAT_CEIL;
      for (const k of CONST.MIND) {
        if (f.stats[k] < cap) { f.stats[k] = Math.min(cap, f.stats[k] + rate); out.developed++; }
      }
      /* --- decline: the body goes late, and then quickly --- */
      if (f.age > a.decline) {
        for (const k of CONST.BODY) f.stats[k] = Math.max(10, f.stats[k] - CONST.DECLINE_RATE);
        out.declined++;
      }

      /* --- retirement: pressure from decline, certain by decline + span --- */
      const past = f.age - a.decline;
      if (past > 0) {
        const p = CONST.RETIRE_AT_DECLINE + (1 - CONST.RETIRE_AT_DECLINE) * (past / CONST.RETIRE_SPAN);
        if (rng() < p) { f.retired = true; f.status = 'retired'; out.retired.push(f); continue; }
      }
      if (f.status === 'retired') { out.retired.push(f); continue; }

      /* --- what the TURN OF THE YEAR does, which is not the same as what the year does ---
         This used to subtract a flat `OFFSEASON_DAYS 330` from every wound in one pass, set
         fatigue to 0 and health to 100, and it ran before anything else could look at the
         damage. 330 days cures everything the game can inflict, so no injury had ever survived
         into a second season and no manager had ever had to decide what to do about one.

         The mending now happens across the eleven prep months (S16), a month at a time, and a
         corp spends action points to speed it. What is left here is the turn of the year
         itself: the body is a year older, and grief fades. `PREP_MONTH_DAYS x 11 = 330` of
         natural healing plus whatever treatment was bought, against 330 given free — so a bad
         wound can now still be on the books at the lock, which is the point. */
      if (f.condition) {
        const inj = f.condition.injuries || [];
        let careerEnding = false, permanent = 0;
        f.condition.injuries = inj.filter(w => {
          if (w.careerEnding) { careerEnding = true; return true; }
          if (w.permanent) { permanent++; return true; }
          return w.days_remaining > 0;
        });
        out.injured += f.condition.injuries.length ? 1 : 0;
        if (careerEnding) { f.retired = true; f.status = 'retired'; out.retired.push(f); continue; }
        /* a permanent wound is carried, not cured, and costs the body a little for good */
        if (permanent) for (const k of CONST.BODY) f.stats[k] = Math.max(10, f.stats[k] - 4 * permanent);
        if (f.status === 'injured' && !f.condition.injuries.length) f.status = 'active';
        if (f._griefUntil != null) {
          f._griefUntil--;
          if (f._griefUntil <= 0) { delete f._griefUntil; delete f._grief; }
        }
        if (f.condition.morale != null) f.condition.morale = Math.min(100, f.condition.morale + 12);
      }

      /* --- the freedom clause first: a term served outranks a clock still running.
             RULED: the freed WALK — they may retire or hire back out as mercs, and either
             way they are no longer this corp's to field. (Feeding the freed into next
             year's merc lots is follow-up plumbing; today they leave.) --- */
      if (f.contract && f.contract.divides_required != null &&
          (f.contract.divides_served || 0) >= f.contract.divides_required) {
        f.status = 'freed'; out.freed.push(f);
        continue;
      }
      /* --- the contract clock, which has never ticked — and whose expiries, once it did,
             stayed on the roster anyway: an expired contract now means what it says. A merc
             signed for one Divide walks after it; extension is a fresh handshake at the
             next market, not an assumption. --- */
      if (f.contract && f.contract.seasons_remaining != null) {
        f.contract.seasons_remaining--;
        if (f.contract.seasons_remaining <= 0) { out.expired.push(f); continue; }
      }
      f.seasonsHere = (f.seasonsHere || 0) + 1;
      f._droppedLastSeason = false;
      keep.push(f);
    }
    corp.roster = keep;
    return out;
  }

  /**
   * Signing. Without this a roster only ever falls — eight or nine permanent losses a Divide
   * against a force of twenty-four is a corp that cannot field inside four years, which is
   * exactly what the first chain did. A poor corp signs fewer, so the difficulty gradient
   * shows up in PEOPLE as well as in money.
   */
  function recruit(rng, corp) {
    const alive = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
    const target = Math.min(CONST.ROSTER_MAX, CONST.ROSTER_TARGET);
    let need = target - alive.length;
    if (need <= 0) return { signed: 0, cost: 0 };
    /* what this corp can actually afford to sign and then pay for a year */
    const spare = corp.account.treasury + corp.account.grant - LED.CONST.ALEAS_ENTRY
                - LED.wageBill(alive) - LED.CONST.RESERVE_FLOOR;
    let budget = Math.max(0, spare * CONST.SIGNING_SHARE);
    /* THE FLOOR (S2, S12). Reaching the muster minimum is not optional and is not means-tested:
       a corp that cannot afford sixteen bodies signs them anyway and goes overdrawn, and the
       overdraft is what the board is asked to cover. Without this a roster could fall to zero
       — measured, the Verdant Cradle reached a roster of NOBODY in season five of the first
       chain, dropped seventeen and lost seventeen, and nothing in the loop noticed. Being
       unable to field is not a state this game has; being carried and then sacked is. */
    const mustSign = Math.max(0, CONST.ROSTER_MIN - alive.length);
    const signed = [];
    while (need > 0) {
      const batch = ROSTER.generateSquad(rng, Math.min(8, need), { corpId: corp.id }).bodies;
      let stop = false;
      for (const f of batch) {
        const cost = ((f.contract && f.contract.signing_cost) || 0)
                   + ((f.contract && f.contract.salary) || 0) * LED.CONST.SALARY_MONTHS;
        const forced = signed.length < mustSign;          /* below the floor: sign regardless */
        if (cost > budget && !forced) { stop = true; break; }
        budget -= cost;
        f.divides = 0; f.seasonsHere = 0; f.retired = false;
        f._fameAtSigning = f.fame || 0;
        signed.push(f);
        need--;
      }
      if (stop || !batch.length) break;
    }
    let spend = 0;
    for (const f of signed) spend += (f.contract && f.contract.signing_cost) || 0;
    if (spend) LED.post(corp.account, 'expense', 'signings', -spend);
    corp.roster = corp.roster.concat(signed);
    return { signed: signed.length, cost: spend };
  }

  /** What it would cost to keep somebody, priced against who they have become. */
  function renewalSalary(f) {
    const base = (f.contract && f.contract.salary) || 0;
    const fame = (f.fame || 0) - (f._fameAtSigning || 0);
    return Math.max(1, Math.round(base * (1 + CONST.RENEWAL_FAME_PULL * (fame / 100))));
  }

  /**
   * PREP — renew, release, and let the freed decide. All three were dead.
   *
   * The contract clock was ticking and `expired` was collected into a season record and read
   * by nobody: 755 contracts ran out over a twelve-season chain and not one fighter left a
   * roster because of it, while `renewalSalary` sat exported and uncalled. So the prospect
   * who came good never got expensive, the veteran past decline never got cheap, and a corp
   * paid the same wage for a person it had had for eight years. Same shape one level down:
   * `FREED_RESIGN_BASE` was declared and read nowhere, so a prisoner who served out their
   * freedom clause became `freed` and then simply stayed, for ever, unpaid-for and unasked.
   */
  function renewRoster(rng, corp, expiring, freed) {
    const out = { renewed: 0, released: 0, resigned: 0, walked: 0, cost: 0 };
    const gone = [];

    /* The freed choose first, because whether they stay changes what the wage bill is.
       A corp its own ships think well of is a corp a released prisoner signs with again. */
    for (const f of (freed || [])) {
      const own = corp.rep ? REP.standing(corp.rep, 'own') : 0;
      const p = CONST.FREED_RESIGN_BASE * (1 + 0.6 * Math.max(-1, Math.min(1, own / 100)));
      if (rng() < p) {
        f.status = 'active';
        f.contract = f.contract || {};
        f.contract.divides_required = null;          /* the clause is served; it is not re-armed */
        f.contract.seasons_remaining = CONST.RENEWAL_SEASONS;
        f.contract.seasons_total = CONST.RENEWAL_SEASONS;
        f._fameAtSigning = f.fame || 0;
        out.resigned++;
      } else { gone.push(f); out.walked++; }
    }

    if (expiring && expiring.length) {
      const staying = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired'
                                           && expiring.indexOf(f) < 0 && gone.indexOf(f) < 0);
      /* the same free-cash expression `recruit` uses — one copy of the arithmetic */
      let budget = Math.max(0, corp.account.treasury + corp.account.grant
                             - LED.CONST.ALEAS_ENTRY - LED.CONST.RESERVE_FLOOR
                             - LED.wageBill(staying));
      const worth = f => (f.stats.aim + f.stats.tactics + f.stats.resolve + f.stats.fieldcraft) / 40
                       + Math.min(3, f.divides || 0) * 0.4;
      /* A corp cannot release its way below the muster minimum. If letting somebody go would
         leave it unable to field a force, it re-signs them at whatever they are asking and
         eats the cost — which is exactly how a corp arrives at the board with a shortfall it
         did not choose. Without this line a roster could be released down to fifteen and the
         Divide fielded a force under the floor, which S14 caught. */
      let headroom = staying.length + expiring.length - CONST.ROSTER_MIN;
      for (const f of expiring.slice().sort((a, b) => worth(b) - worth(a))) {
        if (gone.indexOf(f) >= 0) continue;
        const ask = renewalSalary(f);
        const year = ask * LED.CONST.SALARY_MONTHS;
        if (year <= budget || headroom <= 0) {
          budget -= year;
          f.contract.salary = ask;
          f.contract.seasons_remaining = CONST.RENEWAL_SEASONS;
        f.contract.seasons_total = CONST.RENEWAL_SEASONS;
          f._fameAtSigning = f.fame || 0;
          out.renewed++; out.cost += year;
          if (year > budget + year) out.forced = (out.forced || 0) + 1;
        } else { gone.push(f); out.released++; headroom--; }
      }
    }

    if (gone.length) corp.roster = corp.roster.filter(f => gone.indexOf(f) < 0);
    return out;
  }

  /* ------------------------------------------------------------------ selection */

  /** Who drops. The AI's version and the manager's are the SAME function (S1). */
  /**
   * S3 — HOW MANY TO SEND. An AI corp answering the same board a human reads.
   *
   * `REPUTATION.md` §6.2 says of the funding spectrum: "it works identically for a human manager
   * and an AI one: nobody needs a special 'field small' behaviour, they are both answering the
   * same board." That was right about the human and left the AI with nothing to answer *with* —
   * `selectDrop` computed `want = min(DROP_MAX, opts.want || DROP_MAX)` and `opts.want` was
   * reachable only from the test harness, so **no AI corp had any path to fielding fewer**, and
   * by S1 that meant no human manager had one either. The choice was fully built, genuinely
   * profitable after Step 8.5b, and structurally impossible to take.
   *
   * This is not a "field small" behaviour. It reads the thrift weight the board actually handed
   * this corp, which is high exactly when the board has little interest in the planet, and it
   * sends fewer people when a cheap year is what is being asked for. A corp's own taste for
   * thrift tilts it, because a board asking for economy from the Verdant Cradle is pushing on an
   * open door and asking the same of Violet's is not.
   *
   * It cannot go below `DROP_MIN`, and it never overrides an explicit `opts.want`.
   */
  function wantedDropSize(corp) {
    const goal = corp.rep && corp.rep.goal;
    const th = goal && goal.standing && goal.standing.filter(s => s.kind === 'thrift')[0];
    if (!th) return CONST.DROP_MAX;
    /* Where this year's demand sits in the range the board can ask for. The weight is
       `STANDING_THRIFT_W × (1 − interest) + 0.35`, so it runs from 0.35 when the board badly
       wants this planet to `STANDING_THRIFT_W + 0.35` when it does not care at all. */
    const lo = 0.35, hi = REP.CONST.STANDING_THRIFT_W + 0.35;
    let lean = hi > lo ? (th.weight - lo) / (hi - lo) : 0;
    /* the corp's own appetite for economy, 0..1 around neutral */
    const dial = ((corp.profile && corp.profile.dials && corp.profile.dials.thrift) || 50) / 100;
    lean = lean * (CONST.DROP_THRIFT_BASE + dial);
    lean = Math.max(0, Math.min(1, lean));
    const span = CONST.DROP_MAX - CONST.DROP_MIN;
    return Math.round(CONST.DROP_MAX - span * lean);
  }

  /**
   * `[OPEN-S2]` — THE LOCK'S LEAN. M11 is where a manager says who goes, and S1 requires the AI
   * to make that call through the same function a human would. It had exactly one lean —
   * fittest available — which is not a decision, it is a sort.
   *
   * The ruling names three, and a corp picks by culture:
   *
   *   `fittest`   send the best available and worry about it later. Aggressive houses.
   *   `rested`    leave anybody carrying a wound at home even when they could be dragged out,
   *               and field a thinner, healthier force. Preservationist houses — and this only
   *               became a real choice when the prep calendar stopped healing everybody to full
   *               (§3b), because before it there was never anybody hurt to rest.
   *   `prospect`  give a green fighter with a high ceiling the ground time they need to reach
   *               it, ahead of a safer veteran. Houses that build rather than buy.
   */
  function lockLean(corp) {
    const d = (corp.profile && corp.profile.dials) || {};
    const agg = (d.aggression || 50) / 100, trad = (d.tradition || 50) / 100;
    const lean = (corp.profile && corp.profile.engagement_lean) || 'standard';
    if (lean === 'preservationist' || lean === 'measured') return 'rested';
    if (trad > 0.5 || agg < 0.5) return 'prospect';
    return 'fittest';
  }

  function selectDrop(corp, opts) {
    opts = opts || {};
    const fit = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired'
                                     && !(f.condition && (f.condition.injuries || []).length));
    if (opts.manual && opts.manual.length) {
      const byId = {}; for (const f of fit) byId[f.id] = f;
      return opts.manual.map(id => byId[id]).filter(Boolean).slice(0, CONST.DROP_MAX);
    }
    /* `[OPEN-S2]` — THE LEAN. This was a single sort by quality and is now the three-way call
       the ruling describes, made by culture through `lockLean`. */
    const lean = opts.lean || lockLean(corp);
    const quality = f => (f.stats.aim + f.stats.tactics + f.stats.resolve + f.stats.grit) / 40;
    const score = f => {
      let v = quality(f) + Math.min(3, (f.divides || 0)) * 0.4;
      /* an unserved term pulls its holder toward the drop — the corp bought the clause
         and the clause only advances on the ground; a served-out term stops pulling */
      if (f.contract && f.contract.divides_required != null) {
        const left = f.contract.divides_required - (f.contract.divides_served || 0);
        if (left > 0) v += CONST.LOCK_TERM_W;
      }
      if (lean === 'prospect') {
        /* room to grow, and the ground time is what closes it */
        const cap = typeof f.potential === 'number' ? f.potential : quality(f);
        v += Math.max(0, cap - quality(f)) * CONST.LOCK_PROSPECT_W
           - Math.min(4, f.divides || 0) * CONST.LOCK_PROSPECT_W;
      }
      if (lean === 'rested') v -= ((f.condition || {}).fatigue || 0) / 100 * CONST.LOCK_RESTED_W;
      return v;
    };
    corp._lockLean = lean;
    /* S3 — an explicit `want` still wins (the harness, and a human manager's choice); otherwise
       the corp answers its own board. This read `opts.want || DROP_MAX`, so absent a harness
       override it always wanted the maximum and the small-force build could never be taken. */
    const asked = opts.want != null ? opts.want : wantedDropSize(corp);
    const want = Math.min(CONST.DROP_MAX, Math.max(CONST.DROP_MIN, asked));
    const picked = fit.slice().sort((a, b) => score(b) - score(a)).slice(0, Math.min(want, fit.length));
    /* THE WALKING WOUNDED. A roster can hold twenty and still not field sixteen, because the
       drop takes only the uninjured — and S14 caught a force of fifteen going down. A corp
       that is short does not send a thin squad; it sends people who should be in a bunk. They
       go with their injuries, which is worse for them and worse for the corp, and that is the
       point: being short of bodies has to cost something on the ground, not just on paper. */
    if (picked.length < CONST.DROP_MIN) {
      const hurt = corp.roster
        .filter(f => f.status !== 'dead' && f.status !== 'retired' && picked.indexOf(f) < 0)
        .sort((a, b) => ((a.condition && a.condition.injuries) || []).length
                      - ((b.condition && b.condition.injuries) || []).length
                      || score(b) - score(a));
      for (const f of hurt) {
        if (picked.length >= CONST.DROP_MIN) break;
        f._pressed = true;
        picked.push(f);
      }
    }
    return picked;
  }

  /* ------------------------------------------------------------------ the muster */

  /** S5 + S12: a corp is never struck from a Divide. It is struck from a career. */
  /** Find money, or be carried. Used for both the wage shortfall and the arming shortfall. */
  function raise(corp, shortfall, REPMOD, log, why) {
    if (!(shortfall > 0)) return { raised: 0, called: 0, underwritten: false };
    let called = 0, underwritten = false;
    const patience = (corp.rep && corp.rep.patience != null) ? corp.rep.patience : 50;
    /* what the board will bear before this stops being an ask and becomes a rescue */
    const affordable = Math.max(0, patience - CONST.UNDERWRITE_PATIENCE_FLOOR) * 9000;
    if (shortfall <= affordable) {
      LED.callOnBoard(corp.account, corp.rep, shortfall, REPMOD);
      called = shortfall;
    } else {
      LED.post(corp.account, 'income', 'board underwrite', shortfall);
      corp.underwritten = true;
      if (corp.rep) corp.rep.patience = CONST.UNDERWRITE_PATIENCE_FLOOR;
      underwritten = true;
      if (log) log.push(corp.id + ': UNDERWRITTEN for ' + Math.round(shortfall) +
                        (why ? ' \u2014 ' + why : ''));
    }
    return { raised: shortfall, called: called, underwritten: underwritten };
  }

  function muster(corp, REPMOD, log) {
    const shortfall = corp._shortfall || 0;
    if (!shortfall) return { ok: true, called: 0, underwritten: false };
    let called = 0, underwritten = false;
    const patience = (corp.rep && corp.rep.patience != null) ? corp.rep.patience : 50;
    const affordable = Math.max(0, patience - CONST.UNDERWRITE_PATIENCE_FLOOR) * 9000;
    if (shortfall <= affordable) {
      LED.callOnBoard(corp.account, corp.rep, shortfall, REPMOD);
      called = shortfall;
    } else {
      /* THE UNDERWRITE (S5, S12) — the board pays the lot and expects the year of its life.
         Nobody is ever struck from a Divide for being poor; they are struck from a career. */
      LED.post(corp.account, 'income', 'board underwrite', shortfall);
      corp.underwritten = true;
      if (corp.rep) corp.rep.patience = CONST.UNDERWRITE_PATIENCE_FLOOR;
      underwritten = true;
      if (log) log.push(corp.id + ': UNDERWRITTEN for ' + Math.round(shortfall));
    }
    return { ok: true, called, underwritten };
  }

  /* ------------------------------------------------------------------ the armoury (S8) */

  /**
   * The locker is OWNED. It was rebuilt free every Divide, which is why kit money never
   * bound: a corp that lost twenty rifles on the ground found twenty more waiting at home.
   *
   * What happens to a corp's kit over a season:
   *   - everything the drop force carried came OUT of the locker
   *   - survivors bring theirs home, and it goes back in
   *   - the dead leave theirs on the ground; the side holding it recovers some
   *   - anything fielded that the locker did not hold was BOUGHT, and is kept
   */
  function settleArmoury(rng, corp, fielded, dead, heldGround) {
    const before = corp.armoury || {};
    const stock = {};
    for (const k in before) stock[k] = before[k];

    const carried = ids => { for (const id of ids) if (id) stock[id] = (stock[id] || 0) + 1; };
    const lost = ids => { for (const id of ids) if (id && stock[id] > 0) stock[id]--; };
    const idsOf = f => {
      const lo = f.loadout || {};
      return [lo.primary, lo.armor, lo.sidearm].concat(lo.mods || []);
    };

    /* start from what the plan left behind — the kit nobody took */
    const left = corp._stockLeft;
    if (left) { for (const k in stock) delete stock[k]; for (const k in left) stock[k] = left[k]; }

    let recovered = 0, destroyed = 0, kept = 0;
    for (const f of fielded) {
      const ids = idsOf(f);
      if (f.status !== 'dead') { carried(ids); continue; }      /* home, and back in the rack */
      /* PROCUREMENT.md §12 — `never_drops_gear` means what it says: this fighter's kit is
         recovered whether or not their side held the ground. The hook was declared at Step 2,
         repurposed in writing at Step 5, and read by nothing until the gear-damage cut went
         looking for what still depended on it. */
      if (C.hooksOf(f, ROSTER.traitById).has('never_drops_gear')) {
        for (const id of ids) if (id) { stock[id] = (stock[id] || 0) + 1; kept++; }
        continue;
      }
      /* left on the ground. The side that held it picks some of it up. */
      for (const id of ids) {
        if (!id) continue;
        if (heldGround && rng() < ITEMS.CONST.LOOT_RECOVERY_P) { stock[id] = (stock[id] || 0) + 1; recovered++; }
        else destroyed++;
      }
    }
    corp.armoury = stock;
    return { recovered, destroyed, kept,
             depth: Object.keys(stock).reduce((n, k) => n + stock[k], 0) };
  }

  /* ------------------------------------------------------------------ settlement */

  /** S6: a death moves the people who were standing next to it, and then it stops. */
  function grieve(corp, dead) {
    if (!dead.length) return 0;
    let touched = 0;
    for (const f of corp.roster) {
      if (f.status === 'dead' || !f.condition) continue;
      let hit = 0;
      for (const d of dead) {
        if (d === f) continue;
        const close = d._squadIdx != null && d._squadIdx === f._squadIdx;
        hit += CONST.GRIEF_MORALE * (close ? CONST.GRIEF_CLOSE_MULT : 1);
      }
      if (!hit) continue;
      const res = (f.stats.resolve || 100) / 10;
      /* `personality.aggression` does not exist on a fighter and never has — this branch read
         a field off an object that is not there, so it defaulted to 50 and frenzy could never
         fire. Aggression in this project is carried by TRAITS, which do exist. */
      const hot = (f.traits || []).some(t => CONST.FRENZY_TRAITS.indexOf(t) >= 0);
      if (hot) { f.condition.morale = Math.min(100, (f.condition.morale || 60) + hit * 0.5); f._grief = 'frenzy'; }
      else if (res < CONST.BREAK_RESOLVE_AT) { f.condition.morale = Math.max(0, (f.condition.morale || 60) - hit * 1.6); f._grief = 'break'; }
      else { f.condition.morale = Math.max(0, (f.condition.morale || 60) - hit); f._grief = 'mourning'; }
      f._griefUntil = f._grief === 'break' ? CONST.GRIEF_CLOSE_DIVIDES : CONST.GRIEF_DIVIDES;
      touched++;
    }
    return touched;
  }

  /* ------------------------------------------------------------------ the season */

  /**
   * THE SEASON IS THREE PHASES, NOT ONE CALL. `runSeason` used to run a whole year start to
   * finish with nothing able to stop it partway, which is fine for a fleet of AI corps and
   * useless for a manager who has to sit down eleven times and decide something.
   *
   * So it is split: open the year, step a month, close the year. `runSeason` is now a wrapper
   * that drives those three with the AI holding every seat — the SAME path a human takes, so a
   * player and an AI cannot drift into playing different games. A second human player needs
   * nothing new: `stepMonth` already waits for a choice per corp, and waiting for two is the
   * same shape as waiting for one.
   */
  function beginSeason(rng, corps, profiles, opts) {
    opts = opts || {};
    const ids = Object.keys(corps);
    const season = (corps[ids[0]].season || 0) + 1;
    const rec = { season, corps: {}, log: [] };

    /* ---- OFFSEASON ---- */
    for (const id of ids) {
      const c = corps[id];
      c.season = season;
      ensureIntel(c, season);      /* the planet dossier resets with the new year's planet, even
                                      if this corp never gathers again — rivals persist and decay */
      const off = season === 1 ? { retired: [], expired: [], freed: [], developed: 0, declined: 0 }
                               : offseason(P.mulberry32(P.seedFrom('off' + season + id)), c);
      c._off = off;
    }

    /* ---- THE PREP CALENDAR, M1-M11 (S16) ----
       Eleven months, each a budget of action points against verbs that compete: treat the
       wounded, drill the green, survey the planet, work a signing window. This is where a
       manager's year actually happens, and until Step 8.6 it did not exist — the offseason
       healed everybody to full in one pass and the next thing that happened was the muster.

       YEAR ONE USED TO BE SKIPPED ENTIRELY (`if (season > 1)`), so a new manager's first act
       was the muster and the part of the game the calendar exists for did not happen at all in
       the season a player is most likely to be looking at. It runs every year now. */
    for (const id of ids) {
      const c = corps[id];
      c._prep = { focus: 0, acts: {}, mended: 0, treated: 0, trained: 0, scouted: 0, windows: {} };
      /* NO OUTCOME CROSSES THE TURN OF THE YEAR. `schedule` already refuses anything that would
         land after M11, so this cannot normally be non-empty — it is cleared anyway, because
         the one thing that could carry a stale outcome in is a save file written by a build
         with different rules, and inheriting somebody else's promise is worse than losing it. */
      c._pending = [];
      c._month = 1;
      /* NOTHING FROM LAST YEAR'S DIVIDE CROSSES INTO THIS ONE. These are all scratch state a
         contest writes and the same contest reads; carried across the turn of the year they
         quietly corrupt the new season — a resource "already banked" that was last year's, kill
         and worthy-fight tallies double-counted into reputation, last year's pacts seen as still
         standing, a hook cache answering for last year's roster, a media reveal inflating a
         negotiation nobody attended. Each is a "loads fine, behaves differently" fault. Cleared
         here, beside `_pending`, for the same reason. */
      c._banked = {};
      c._killsBy = {};
      c._worthyFights = 0;
      c._pactsSigned = {};
      c._pactBrokeWith = null;
      c._hookCache = {};
      c._mediaReveal = 0;
      /* SPONSORS: the year's board opens. Each house backs at most one OA; you court with focus
         through the year and sponsors commit at the lock (Pass C wires the player's courting).
         The board's falling cost is a fleet-wide fact, so it lives on the season state, built
         once below after this per-corp loop. Here we only ensure the sponsor bag exists and
         clear last year's courting effort — regard persists, effort does not. */
      c.sponsors = c.sponsors || { regard: {}, contracts: [], offers: [], courted: {}, courting: {} };
      c.sponsors.contracts = [];       /* one-season terms: the board is fresh every year */
      c.sponsors.courting = {};        /* this year's effort starts empty; regard carries */
    }
    /* ---- M1: THE PLANET IS ANNOUNCED AND THE BOARD SETS ITS CARD ----
       This used to happen ELEVEN MONTHS LATER, inside `runDivide`. The consequence was not a
       crash and not a wrong number: it was that a manager spent the entire preparation year
       aimed at the card the board set LAST season — stamped with last season's number, visible
       in the record — and in year one aimed at no card at all, because there wasn't one yet.
       The survey verb read its interest off that stale card too.
       The design has always said M1-2 is where the planet is announced and the board sets
       funding and its demands. It says it now. The planet generated here is the SAME OBJECT the
       Divide fights on, handed down as `groundTruth`, because a board demanding a resource that
       is not on the ground is unsatisfiable for a reason no player could ever see. */
    const planet = MAP.generatePlanet(P.mulberry32(P.seedFrom('planet' + season)), {});
    /* THE POT IS PART OF THE ANNOUNCEMENT. Board interest reads `planet.pot.richness`, and a
       planet without one falls to a neutral 0.5 — silently, with no error and no crash, so
       every board in the fleet would have been exactly as interested in every rock for ever.
       Caught by measuring the interest figure across three seasons and finding one value. */
    planet.pot = NEG.rollPot(P.mulberry32(P.seedFrom('pot' + season)), planet.archetype, planet.richness);
    for (const id of ids) {
      const c = corps[id];
      if (!c.rep) continue;
      REP.openSeason(c.rep, planet,
                     P.mulberry32(P.seedFrom('goal' + season + id)),
                     { expect: Math.max(2, 3 + ((c.profile || {}).difficulty || 3)),
                       thinTreasury: ((c.profile || {}).finance || {}).treasury_band === 'low' });
    }

    const state = {
      rng, corps, profiles, opts, ids, season, rec, month: 1, done: false, planet,
      lots: {}, bids: { tryouts: {}, mercs: {} },
      /* the seam: everything decided at M11 that the Divide will read */
      drop: { sectors: {}, pacts: {}, media: {} },
      dividend: { matches: 0, fought: 0, purses: 0, conversions: 0, draws: 0 },
      mercs: { lot: 0, bids: 0, signed: 0, refused: 0, unbid: 0, tookLessForSafety: 0 },
      tryouts: { lot: 0, bids: 0, signed: 0, refused: 0, unbid: 0, tookLessForSafety: 0 },
      bastille: { lot: 0, signed: 0, unplaced: 0 },
      /* the year's sponsor board — one commitment per house, cost falls as it fills (Courting) */
      sponsorBoard: SPON.openBoard(SPON.houseIds())
    };
    ensureLot(state);
    return state;
  }

  /**
   * A LOT OPENS WHEN ITS MONTH BEGINS — not when the month is stepped. Opening it inside
   * `stepMonth` meant the candidates did not exist until after the manager had already decided
   * what to do with the month, so `lotFor` returned nothing all through the run-up and there
   * was nobody to bid on. Called at the end of `beginSeason` and at the end of every
   * `stepMonth`, so whatever month the season is sitting on already has its faces.
   * Opened once per window: the same people must still be there next month.
   */
  function ensureLot(state) {
    const kind = (MONTHS[state.month] || {}).signing;
    if (!kind || state.lots[kind]) return;
    if (kind === 'tryouts') {
      /* RULED: YOUR OWN SHIP DOES NOT AUCTION ITS CHILDREN. Every corp gets its own lot,
         drawn from its own ship's people — nobody else is at the table. */
      const byCorp = {};
      for (const id of state.ids)
        byCorp[id] = openLot(P.mulberry32(P.seedFrom('lot' + kind + state.season + id)), kind, id);
      state.lots[kind] = byCorp;
      return;
    }
    state.lots[kind] = openLot(P.mulberry32(P.seedFrom('lot' + kind + state.season)), kind);
  }

  /** The candidates a manager can look at right now, with what each is asking and what this
      corp has already offered. Empty outside a signing window. */
  function lotFor(state, corpId) {
    const kind = (MONTHS[state.month] || {}).signing;
    let lot = kind && state.lots[kind];
    if (kind === 'tryouts' && lot) lot = lot[corpId];   /* your own ship's sheet */
    if (!lot) return [];
    const mine = (state.bids[kind] || {})[corpId] || {};
    return lot.map(f => ({
      id: f.id, name: f.name, age: f.age, race: f.race,
      potential: f.potential, stats: f.stats, fame: f.fame || 0,
      ask: askingPrice(f), yourBid: mine[f.id] || 0, kind: kind,
      /* the paper's terms, so a display never has to guess them */
      contractKind: (f.contract && f.contract.kind) || kind,
      seasons: f.contract && f.contract.seasons_remaining,
      pension: f.contract && f.contract.death_benefit,
      bonus: f.contract && f.contract.divide_bonus,
      freedomReq: f.contract && f.contract.divides_required,
      record: f.experience || null
    }));
  }

  /** Offer a named fighter a named amount. Passing 0 withdraws. */
  function placeBid(state, corpId, fighterId, amount) {
    const kind = (MONTHS[state.month] || {}).signing;
    if (!kind || !state.lots[kind]) return false;
    if (kind === 'bastille') return false;      /* a prisoner's place is not negotiated */
    state.bids[kind] = state.bids[kind] || {};
    state.bids[kind][corpId] = state.bids[kind][corpId] || {};
    if (amount > 0) state.bids[kind][corpId][fighterId] = Math.round(amount);
    else delete state.bids[kind][corpId][fighterId];
    return true;
  }

  function bidsFor(state, corpId) {
    const kind = (MONTHS[state.month] || {}).signing;
    return (kind && (state.bids[kind] || {})[corpId]) || {};
  }

  /* ------------------------------------------------------------------------- the seam ---- */

  /**
   * THE SECTORS, as this corp can see them. What you know is what your survey bought: without
   * one they are names on a ring, and a corp that spent the year looking knows which ground is
   * worth arguing over. This is the other half of the survey verb — until now it paid a flat
   * readiness number nobody could point at.
   */
  function sectorsFor(state, corpId) {
    const c = state.corps[corpId];
    const secs = PRE.sectors(state.planet);
    const taken = {};
    for (const id of state.ids) {
      const pick = (state.drop.sectors || {})[id];
      if (pick != null && id !== corpId) taken[pick] = (taken[pick] || 0) + 1;
    }
    /* the planet dossier's `sectors` row is what buys ground detail now: its depth maps onto
       the reader's thresholds — 1 = the ground (terrain), 2+ = the prize, and it also unlocks
       seeing which rivals chose where. (Gather Intel replaced the old flat `_scouted` scalar.) */
    const secDepth = ((c._intel && c._intel.planet && c._intel.planet.rows.sectors) || { depth: 0 }).depth;
    const secIntel = secDepth >= 3 ? PRE.CONST.INTEL_PRIZE + 0.1
                   : secDepth >= 2 ? PRE.CONST.INTEL_PRIZE
                   : secDepth >= 1 ? PRE.CONST.INTEL_TERRAIN : 0;
    return secs.map(sec => {
      const seen = PRE.readSector(sec, secIntel);
      /* who ELSE you know is going there. You only see a rival's choice if you scouted the
         sectors — otherwise the first you know of it is on the ground. */
      seen.rivals = secIntel >= PRE.CONST.INTEL_TERRAIN ? (taken[sec.index] || 0) : null;
      seen.yours = (state.drop.sectors || {})[corpId] === sec.index;
      return seen;
    });
  }

  function chooseDropSector(state, corpId, index) {
    if (state.month < CONST.PREP_MONTHS) return { ok: false, why: 'The Drop Is Called at the Lock' };
    state.drop.sectors = state.drop.sectors || {};
    state.drop.sectors[corpId] = index;
    return { ok: true };
  }

  /** Rivals you could still approach, and how they are likely to take it. */
  function pactTargets(state, corpId) {
    const from = state.corps[corpId];
    return state.ids.filter(id => id !== corpId).map(id => ({
      corp: id,
      standing: Math.round(REP.standing(state.corps[id].rep, 'rival', corpId) || 0),
      already: !!(state.drop.pacts || {})[corpId + '>' + id],
      /* the chance is SHOWN. A blind bet on a rival's character is a decision; a blind bet on
         a hidden number is a coin the game refuses to let you look at. */
      chance: PRE.pactChance(from, state.corps[id])
    }));
  }

  function offerPact(state, corpId, toId) {
    if (state.month < CONST.PREP_MONTHS) return { ok: false, why: 'Nobody Talks Terms Before the Lock' };
    state.drop.pacts = state.drop.pacts || {};
    const key = corpId + '>' + toId;
    if (state.drop.pacts[key]) return { ok: false, why: 'Already Spoken to Them' };
    const r = PRE.proposePact(P.mulberry32(P.seedFrom('pact' + state.season + key)),
                              state.corps[corpId], state.corps[toId]);
    state.drop.pacts[key] = r;
    return { ok: true, agreed: r.agreed, chance: r.chance };
  }

  /** Perform, or don't. Paid in standing, charged in concealment. */
  function attendMediaDay(state, corpId) {
    if (state.month < CONST.PREP_MONTHS) return { ok: false, why: 'Media Day Is the Week of the Drop' };
    state.drop.media = state.drop.media || {};
    if (state.drop.media[corpId]) return { ok: false, why: 'You Have Already Been' };
    const r = PRE.mediaDay(state.corps[corpId]);
    state.drop.media[corpId] = r;
    return { ok: true, gain: r.gain, reveal: r.reveal };
  }

  /** What a given corp could do in the month the season is currently sitting on. */
  function optionsFor(state, corpId) {
    return monthTracks(state.corps[corpId], state.month);
  }

  /**
   * Step one month for the whole fleet. `choices` maps a corp id to the verbs its manager
   * picked; any corp without an entry decides for itself. The month's fleet event then fires,
   * after everybody has finished spending — which is what makes a deadline a deadline, and what
   * a second human player would wait on.
   */
  function stepMonth(state, choices) {
    if (state.done || state.month > CONST.PREP_MONTHS) return null;
    const m = state.month, win = MONTHS[m] || { name: 'Month ' + m, event: null };
    const spent = {}, landed = {};
    for (const id of state.ids) {
      landed[id] = [];
      spent[id] = prepMonth(P.mulberry32(P.seedFrom('prep' + state.season + id + m)),
                            state.corps[id], m, state.season, state.corps[id]._prep,
                            choices && choices[id], landed[id], state.corps);
    }
    /* the work is SPENT when its window fires: scouting the tryouts does not help you at the
       merc deadline, and it does not bank across seasons either. A credit that never clears is
       how a small edge becomes an untouchable one by season nine. */


    if (win.event === 'dividend')
      runDividend(P.mulberry32(P.seedFrom('div' + state.season)), state.corps, state.ids, state.season, state.dividend);
    if (win.event === 'tryouts') {
      runTryouts(P.mulberry32(P.seedFrom('try' + state.season)), state.corps, state.ids,
                 state.lots.tryouts || [], state.tryouts, state.bids.tryouts);
      state.lots.tryouts = null; state.bids.tryouts = {};
    }
    if (win.event === 'bastille') {
      bastilleIntake(P.mulberry32(P.seedFrom('bas' + state.season)), state.corps, state.ids,
                     state.season, state.bastille, state.lots.bastille);
      state.lots.bastille = null;
    }
    if (win.event === 'mercs') {
      runMercMarket(P.mulberry32(P.seedFrom('merc' + state.season)), state.corps, state.ids,
                    state.lots.mercs || [], state.mercs, state.bids.mercs);
      /* --- THE SCRAPE, at the last door out. The merc window is the final chance to put
         bodies on a roster, so this is where the floor lives now: anybody still short is
         filled to ROSTER_MIN with the cheapest paper on offer, charged for it, and made to
         feel it with the board. Deliberately AFTER the market, so a manager who bought
         their own way to sixteen never meets this at all. --- */
      for (const id of state.ids) {
        const corp = state.corps[id];
        const alive = corp.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
        const short = CONST.ROSTER_MIN - alive.length;
        if (short <= 0) continue;
        const rngS = P.mulberry32(P.seedFrom('scrape' + state.season + id));
        const filled = ROSTER.generateSquad(rngS, short, { corpId: id }).bodies
          .sort((a, b) => ((a.contract || {}).salary || 0) - ((b.contract || {}).salary || 0));
        let bill = 0;
        for (const f of filled) {
          bill += ((f.contract && f.contract.signing_cost) || 0)
                + ((f.contract && f.contract.salary) || 0) * LED.CONST.SALARY_MONTHS;
          corp.roster.push(f);
        }
        LED.post(corp.account, 'expense', 'the board fills your roster', -bill);
        if (corp.rep)
          corp.rep.patience = Math.max(CONST.UNDERWRITE_PATIENCE_FLOOR,
                                       (corp.rep.patience != null ? corp.rep.patience : 50)
                                       - CONST.SCRAPE_PATIENCE);
        state.mercs.scraped = (state.mercs.scraped || 0) + short;
      }
      state.lots.mercs = null; state.bids.mercs = {};
    }
    /* the other seven deal with each other too — see trade.js fleetTrades */
    if (TRADE && TRADE.tradingOpen(m))
      TRADE.fleetTrades(P.mulberry32(P.seedFrom('fleettrade' + state.season + m)),
                        state.corps, state.ids, m, {});
    state.month++;
    ensureLot(state);
    return { month: m, name: win.name, event: win.event || null, spent, landed };
  }

  /**
   * THE FLEET TAKES THE SEAM TOO. Every corp except the one a person is holding picks a sector,
   * decides whether to perform, and puts out feelers. Without this the seam would be a set of
   * advantages only the player can reach, and a drop where seven corps land on a default fan
   * while one chose its ground is not a contest — it is the same fault as sponsorship, one step
   * later, and it is the one this project keeps producing.
   */
  function fleetTakesTheSeam(state) {
    const human = (state.opts || {}).human;
    const secs = PRE.sectors(state.planet);
    for (const id of state.ids) {
      if (id === human) continue;
      const c = state.corps[id];
      const rng = P.mulberry32(P.seedFrom('seam' + state.season + id));
      const taken = {};
      for (const other of state.ids) {
        const pick = state.drop.sectors[other];
        if (pick != null) taken[pick] = (taken[pick] || 0) + 1;
      }
      state.drop.sectors[id] = PRE.chooseSector(rng, c, secs, taken);
      /* showmanship decides whether a house performs — the dial was already written */
      const show = ((c.profile || {}).dials || {}).showmanship || 50;
      if (rng() < show / 100) attendMediaDay(state, id);
      /* and a corp approaches ONE rival, the one it likes its chances with most */
      const targets = state.ids.filter(o => o !== id)
        .map(o => ({ o, p: PRE.pactChance(c, state.corps[o]) }))
        .sort((a, b) => b.p - a.p);
      if (targets.length && rng() < 0.6) offerPact(state, id, targets[0].o);
    }
  }

  /**
   * The muster, the lock and the drop — everything after the last month and before the shooting.
   * `closeSeason` runs this, then the contest, then the settlement; a caller that means to sit
   * through the contest runs this, takes `prepareDivide`, and calls `finishSeason` itself.
   */
  function closeSeasonToDrop(state) {
    const corps = state.corps, profiles = state.profiles, opts = state.opts;
    const ids = state.ids, season = state.season, rec = state.rec;
    state.done = true;
    /* SPONSORS COMMIT AT THE LOCK. A year of courting is over; each house signs the corp with
       the highest standing (regard plus this year's effort) and pays its advance. Conditions
       are judged after the Divide, in finishSeason. One commitment per house. The result lives
       on each corp's `sponsors.contracts` — the page and the record read it from there. */
    SPON.resolveBoard(state.sponsorBoard, corps, ids);
    /* the fleet's seam decisions are taken here, at the close, so a human has had all of M11 to
       make theirs first and the AI is reacting to a board that already has their pick on it */
    fleetTakesTheSeam(state);
    rec.dividend = state.dividend;
    rec.mercs = state.mercs;
    rec.tryouts = state.tryouts;
    rec.bastille = state.bastille;

    /* ---- PREP ----
       The grant lands, the wages land, the Aleas takes its entry fee. All of it through
       `ledger.settleSeason`, which already knows how to do this and writes the lines. A
       second copy of the wage arithmetic living here is exactly what the integration survey
       warned against, and the first draft of this file had one. */
    for (const id of ids) {
      const c = corps[id];
      c._openingTreasury = c.account.treasury;   /* for the surplus demand: "end the year N up" */
      c._grant = c.account.grant;
      /* RENEW, RELEASE, RECRUIT — and all three BEFORE the wage bill.
         They used to run after it, so every contract signed this year was paid nothing for
         its first season: eight signings a corp a year, wages never charged, which is a
         large share of the only real expense in the game arriving free. The prep order in
         SEASONS.md always said the roster settles first and the money follows it. */
      c._renew = renewRoster(P.mulberry32(P.seedFrom('renew' + season + id)), c,
                             c._off.expired, c._off.freed);
      c._recruit = recruit(P.mulberry32(P.seedFrom('sign' + season + id)), c);
      const alive = c.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
      /* S15 — this charges the RETAINER only. The purse is charged at the muster below, once
         there is a drop to pay it to. `c._wages` is completed there. */
      c._retainers = LED.retainerBill(alive);
      /* What this season COULD have cost in people, on the roster as it stood when the bills
         were set — before the Divide killed anybody. The thrift spectrum scores against this,
         so it must be captured here rather than recomputed at scoring time off a roster the
         Divide has already thinned. */
      c._committed = LED.wageBill(alive);
      LED.settleSeason(c.account, alive, {
        injuries: c._off.injured || 0,
        /* WHAT THE DEAD COST. `_lastDead` was read here and written by no code anywhere, so
           the death benefit — the first of the five ledgers, and one of the three channels
           by which a life is priced at all — has never been charged in any season of any
           chain. Settlement sets it now. */
        deaths: c._lastDead || 0
      });
      c._shortfall = c.account.treasury < 0 ? -c.account.treasury : 0;
    }

    /* ---- THE MUSTER ---- */
    for (const id of ids) {
      const c = corps[id];
      c._muster = muster(c, REP, rec.log);
      /* THE ASK HAS TO BE COUNTED HERE.
         `openSeason` resets rep.calls, and it runs inside runDivide — which happens AFTER the
         muster. So by the time the board scored its card, every call this corp had made had
         been wiped, and the demand "do not come asking for money" was met 100% of the time,
         including in the season the board underwrote the entire corp. */
      c._calls = (c._muster.called > 0 ? 1 : 0) + (c._muster.underwritten ? 1 : 0);
      /* THE LOCK IS A DECISION, NOT A SORT — and a human's half of it arrives here. `want` was
         the only thing a caller could set, so an interface could say how many but not who,
         which is the half of the ruling that carries the culture. All three now come through:
         how many, which lean, or a named list that overrides both. */
      c._drop = selectDrop(c, { want:   opts.want   && opts.want[id],
                                lean:   opts.lean   && opts.lean[id],
                                manual: opts.manual && opts.manual[id] });
      for (const f of c._drop) f._droppedLastSeason = true;
      /* S15 — THE PURSE, and this is the first moment it can be charged honestly: the drop
         exists now and did not a few lines ago. A manager who fields sixteen pays sixteen
         purses, which is what makes `SEASONS.md` §4.1's "pay less, arm each one to the cap,
         and be outnumbered" a sentence about the game rather than about an intention. */
      c._purses = LED.payPurse(c.account, c._drop);
      c._wages = (c._retainers || 0) + c._purses;
    }

    /* ---- THE DIVIDE: borrow, and take them back changed ---- */
    const persist = state._persist = {};
    for (const id of ids) {
      const c = corps[id];
      persist[id] = { drop: c._drop, account: c.account, armoury: c.armoury,
        /* the planet dossier's completeness, carried to the ground as readiness (Gather Intel) */
        intel: planetPreparedness(c),
        /* per-rival readiness: what this corp knows about each other house, freshness-scaled,
           so a squad that faces a house it scouted fights a little readier against THEM. */
        rivalIntel: (function () {
          const out = {};
          if (c._intel && c._intel.rivals) for (const oaId in c._intel.rivals) {
            const v = rivalPreparedness(c, oaId, c.season || 0);
            if (v > 0) out[oaId] = v;
          }
          return out;
        })(),
        /* the rack, not the wallet. Called from inside the lock, where the real number is. */
        onMuster: function (shortfall) {
          const got = raise(c, shortfall, REP, rec.log, 'cannot arm the drop');
          c._muster.called += got.called;
          c._muster.underwritten = c._muster.underwritten || got.underwritten;
          c._calls = (c._muster.called > 0 ? 1 : 0) + (c._muster.underwritten ? 1 : 0);
          return got.raised;
        } };
    }
    const reps = {}; for (const id of ids) reps[id] = corps[id].rep;
    state._divideOpts = {
      oaProfiles: profiles, corpCount: ids.length,
      season: season, reputations: reps, corps: persist,
      /* `openSeason` is FALSE now: the board already spoke in M1. Leaving it true would stamp a
         second card over the one the manager spent the year working against, which is the same
         bug in the other direction. */
      openSeason: false, groundTruth: state.planet,
      /* THE SEAM, HANDED OVER. Where everybody chose to land, and who agreed not to shoot at
         whom before anyone had seen anything. */
      dropSectors: state.drop.sectors,
      preDividePacts: state.drop.pacts,
      mediaRevealed: state.drop.media,
      human: (opts || {}).human || null
    };

    /* THE SEASON SPLITS AT THE DROP. Everything above assembles the contest — the lock, the
       muster, the purses, the seam — and everything below settles what came back. `closeSeason`
       used to call `runDivide` between the two and hand back a record, which is all an AI fleet
       needs and no use at all to a manager who is supposed to be answering a window every
       couple of days.
       So the two halves are callable separately: `prepareDivide` returns the assembled options,
       a caller sits through `divideCore` itself, and `finishSeason` settles the result. The
       all-at-once path below runs the same generator to the end through `runDivide`, so a
       stepped contest and an unstepped one cannot become two different games. */
    return null;
  }

  /**
   * A whole close with the contest run off in one go. A WRAPPER with no logic of its own — the
   * same discipline `runSeason` is held to, and for the same reason: if it grew a special case
   * the fleet would settle a season a manager cannot.
   */
  function closeSeason(state) {
    closeSeasonToDrop(state);
    const d = prepareDivide(state);
    return finishSeason(state, DIVIDE.runDivide(d.rng, d.opts));
  }

  /** The assembled contest, for a caller that means to sit through it. */
  function prepareDivide(state) {
    if (!state._divideOpts) throw new Error('prepareDivide: call closeSeasonToDrop first');
    return { opts: state._divideOpts,
             rng: P.mulberry32(P.seedFrom('divide' + state.season)) };
  }

  /** Settle a contest that has already been fought, stepped or otherwise. */
  function finishSeason(state, res) {
    /* THE EDGE IS SPENT. Conditioning bought in the prep year lasts exactly one Divide —
       it walks onto the ground, does its work, and is gone at the settlement. Cleared here
       rather than at the drop so a replayed or halted contest still sees it. */
    for (const id of state.ids)
      for (const f of state.corps[id].roster) if (f._conditioned) delete f._conditioned;
    const corps = state.corps, opts = state.opts;
    const ids = state.ids, season = state.season, rec = state.rec;
    /* built by `closeSeasonToDrop` and carried on the state rather than in a closure, because
       the two halves are no longer one function and a local that spans them is a local that
       only exists when nobody has stepped the contest */
    const persist = state._persist || {};

    /* ---- SETTLEMENT ---- */
    for (const id of ids) {
      const c = corps[id];
      const dropped = c._drop;
      const dead = dropped.filter(f => f.status === 'dead');
      let bonuses = 0;
      for (const f of dropped) {
        f.divides = (f.divides || 0) + 1;
        if (f.contract && f.contract.divides_required != null)
          f.contract.divides_served = (f.contract.divides_served || 0) + 1;
        /* the OR-A-WIN half of the freedom clause lives in the winner's settlement
           (negotiate.js N14, "the winner pays its own people") — one rule, one home */
        /* a nattie's contract pays a bonus for every Divide actually dropped into — the
           participation clause a merc's flat price conspicuously lacks */
        if (f.contract && f.contract.kind === 'nattie' && f.contract.divide_bonus)
          bonuses += f.contract.divide_bonus;
      }
      if (bonuses) LED.post(c.account, 'expense', 'Divide bonuses', -bonuses);
      /* what the corp actually put into kit this year is an expense like any other */
      /* Charge what was BOUGHT, not what was carried. `plan.total` is the catalog value of
         everything fielded, most of which the corp already owned — billing it every season
         was charging rent on its own rifles. `spentCash` is the money that actually left. */
      const kit = (persist[id] && persist[id].kitValue) || 0;
      const spend = (persist[id] && persist[id].kitSpend) || 0;
      if (spend) LED.post(c.account, 'expense', 'procurement', -spend);

      /* ---- THE MONEY THE DIVIDE WAS WORTH ----
         `ledger.bookDivide` has existed since Step 6 and had no caller anywhere in the season
         loop. Every settlement figure the negotiation engine produces — the pot on the last
         banner standing, the umbrella's cut of a cut, what a ceded claim was sold for, the
         winner's bonuses, ransoms both ways — was computed, reported, and never reached a
         treasury. A twelve-season career ran on the board's grant alone, so a corp's finances
         were grant minus wages and nothing a manager did on a planet moved them: everybody's
         treasury rose every year, nobody ever had to ask the board for anything, and the
         difficulty gradient that is supposed to be a burn rate on goodwill could not fire.
         This is the largest dead wire in the project so far and it is the oldest. */
      const pc = (res.perCorp || []).find(x => x.id === id) || {};
      LED.bookDivide(c.account, {
        season: season, escalator: ITEMS.CONST.ALLOWANCE_ESCALATOR,
        payout: pc.payout || 0,
        bonuses: pc.won ? ((res.settlement && res.settlement.bonuses
                            && res.settlement.bonuses.total) || 0) : 0,
        ransomPaid: pc.ransomPaid || 0,
        ransomTaken: pc.ransomTaken || 0
      });
      c._payout = pc.payout || 0;
      c._bonus = c.account.lastBonus || 0;
      /* charged at the next season's books, which is when a benefit is actually paid */
      c._lastDead = dead.length;
      /* ---- the locker ---- */
      c._stockLeft = persist[id] && persist[id].stockLeft;
      const heldGround = res.placement && res.placement[id] != null && res.placement[id] <= 3;
      c._armoury = settleArmoury(P.mulberry32(P.seedFrom('arm' + season + id)),
                                 c, dropped, dead, heldGround);
      const griefed = grieve(c, dead);

      /* ---- THE BOARD CLOSES ----
         The card is scored and patience moves. Without this the whole fail state is inert:
         the first ten-season chain ran with patience frozen at its opening value for every
         corp, so nobody was ever dismissed and the difficulty gradient had no expression
         except money. `reputation.closeSeason` has existed since Step 7 and had no caller. */
      const dc = (res.corps || []).find(x => x.id === id) || {};
      const close = REP.closeSeason(c.rep, {
        /* what the year actually did to the books, not what is in them */
        surplus: Math.round(c.account.treasury - (c._openingTreasury || 0)),
        calls: c._calls || 0,
        placement: res.placement ? res.placement[id] : null,
        won: res.winner === id,
        banked: (res.banked && res.banked[id]) || {},
        permanentLosses: dead.length,
        /* R25 — the two standing demands. `spendRatio` is what this corp actually laid out on
           wages and kit against WHAT A FULL COMMITMENT WOULD HAVE COST: the whole ceiling, and
           every living body paid in full. Field sixteen instead of twenty-four and it drops
           below one, which is a board pleased with a cheap year.

           THE DENOMINATOR USED TO BE `allowanceFor(season) + c._wages` — the corp's OWN actual
           wage bill — so the identical term sat on both sides of the ratio and every credit
           saved by resting somebody cancelled itself out exactly. A corp that saved 32,040 in
           purses watched its expectation fall by 32,040 and scored the same. The comment above
           this line already claimed the effect the arithmetic could not produce; the baseline
           has to be what the season COULD have cost, or a ratio measures nothing but itself. */
        spendRatio: (function () {
          /* WHAT THE BOARD PUT IN, which REPUTATION.md §6.5 already defines as an ordinary
             year: the stipend "covers wages, the entry fee, and arming twenty-four people,
             and nothing else". Living inside it is neutral, under it is thrift, over it is a
             board watching its money go. One is exceedable in both directions and needs no
             fitted constant — which the previous version did, and it was fitted to the median
             of a fleet that the very next change made stop existing.

             It also puts the difficulty gradient in the card, where §6.5 says it already
             lives: Violet's stipend covers a full commitment and the Verdant Cradle's does
             not, so the poor corp disappoints its board on money by existing. That is the
             intended shape, and it is not balanced here. */
          const funded = Math.max(1, (c.account.grant || 0) - LED.CONST.ALEAS_ENTRY);
          const actual = kit + (c._wages || 0);
          return actual / funded;
        })(),
        lossRate: dropped.length ? dead.length / dropped.length : 0,
        famousLosses: dead.filter(f => (f.fame || 0) >= 55).length,
        sitesClaimed: dc.sitesClaimed || 0,
        oreCredit: dc.oreCredit || 0,
        engagements: dc.engagements || 0
      });
      c._close = close;
      /* THE FAMILIES ARE PAID. Every contract has carried a death benefit since the pools
         were ratified, and the negotiation layer has been pricing RANSOMS off that number
         all along — while no family ever saw a credit, because nothing posted it. It posts
         here, at the one place the dead leave the books. Nattie pensions are the fleet's
         highest by canon, which is part of what a corp owes its own ship. */
      const pensions = c.roster.filter(f => f.status === 'dead')
                        .reduce((s2, f) => s2 + ((f.contract && f.contract.death_benefit) || 0), 0);
      if (pensions) LED.post(c.account, 'expense', 'Death benefits', -pensions);
      c.roster = c.roster.filter(f => f.status !== 'dead');
      c.history.push({ season, dropped: dropped.length, dead: dead.length,
                       roster: c.roster.length, treasury: Math.round(c.account.treasury),
                       patience: c.rep ? Math.round(c.rep.patience) : null,
                       cardScore: c._close ? c._close.score : null,
                       card: c._close && c._close.score
                             ? c._close.score.lines.map(function (l) {
                                 return { kind: l.demand.kind, met: !!l.met, priority: !!l.priority,
                                          d: l.demand };
                               })
                             : null,
                       underwritten: c._muster.underwritten,
                       retired: c._off.retired.length, expired: c._off.expired.length,
                       signed: (c._recruit && c._recruit.signed) || 0,
                       renewed: (c._renew && c._renew.renewed) || 0,
                       released: (c._renew && c._renew.released) || 0,
                       resigned: (c._renew && c._renew.resigned) || 0,
                       /* A TERM COMPLETING IS AN EVENT, and it was invisible: the freed
                          leave the roster, so nothing that reads a roster snapshot can
                          see one. `freed` is how many clauses ran out this year;
                          `walked` is how many of those did not re-sign. */
                       freed: (c._off && c._off.freed) ? c._off.freed.length : 0,
                       walked: (c._renew && c._renew.walked) || 0,
                       payout: c._payout || 0, bonus: c._bonus || 0,
                       kitValue: kit, kitSpend: spend,
                       locker: c._armoury ? c._armoury.depth : null,
                       lootRecovered: c._armoury ? c._armoury.recovered : 0,
                       gearLost: c._armoury ? c._armoury.destroyed : 0,
                       /* PROCUREMENT.md §12 — kit that came home because its owner would
                          never drop it, whoever held the ground. Reported so the hook has a
                          reader in the telemetry as well as in the settlement. */
                       gearKept: c._armoury ? c._armoury.kept : 0,
                       /* THE PREP YEAR, on the record. Eleven of the twelve months are now full
                          of decisions and none of them reached the season record, so no viewer
                          could show them and `audit_open.cjs` could not test them — a year built
                          and then not reported is one step from a year built and not read. */
                       prep: c._prep || null,
                       lockLean: c._lockLean || null,
                       intel: planetPreparedness(c) });
      rec.corps[id] = c.history[c.history.length - 1];

      /* ---- WHAT THE SPONSORS SAW ----
         Judged against the season that actually happened, and every figure it reads is one the
         game already produced. An obligation scored against a number invented for the purpose
         would be a contract with the bookkeeping rather than with the game. */
      const h = c.history[c.history.length - 1];
      const best = (c.roster || []).reduce((m, f) => Math.max(m, f.fame || 0), 0);
      /* the drop's loadout composition, for limitation-flavour conditions (e.g. mostly energy).
         Each fighter's kit already resolves its weapon family, so no catalogue lookup is needed. */
      const drop = c._drop || [];
      let energyGuns = 0, armedGuns = 0;
      for (const f of drop) {
        const fam = f.loadout && f.loadout.kit && f.loadout.kit.family;
        if (!fam || fam === 'none') continue;
        armedGuns++;
        if (fam === 'energy') energyGuns++;
      }
      const verdict = SPON.judge(c, {
        dropped: h.dropped || 0, dead: h.dead || 0,
        calledWithdrawal: !!c._calledWithdrawal,
        policyChanged: !!c._policyChanged,
        bestFame: best,
        treasury: c.account.treasury,
        energyFraction: armedGuns ? energyGuns / armedGuns : 0,
        dropSize: drop.length,
        /* how much of the drop had never seen a Divide before this one — what the Almsdesk
           is actually buying: somewhere for the unproven to be proven */
        greenDropped: drop.filter(f => (((f.experience || {}).divides || 0) <= 1)).length
      });
      rec.corps[id].sponsors = {
        advance: verdict.advance || 0, paid: verdict.paid || 0,
        kept: verdict.kept.length, broken: verdict.broken.map(b => b.house),
        rewards: verdict.rewards || []
      };
      /* IN-KIND REWARDS land in the armoury. The sponsor module names a tag (it must not know
         item ids); the mapping to a concrete piece lives here, beside the armoury it fills. A
         kept energy contract arms you a little further toward being the corp that fits them. */
      const KIT_FOR_TAG = { energy: 'itm_pulse_carbine', medical: 'itm_medkit' };
      for (const r of (verdict.rewards || [])) {
        const rw = r.reward || {};
        if (rw.kind !== 'kit') continue;
        const itemId = KIT_FOR_TAG[rw.tag];
        if (!itemId) continue;
        c.armoury = c.armoury || {};
        c.armoury[itemId] = (c.armoury[itemId] || 0) + (rw.count || 1);
        rec.corps[id].sponsors.rewards = rec.corps[id].sponsors.rewards || [];
      }
      /* ---- DISMISSAL ----
         S5 is explicit and I had built only half of it: the board pays the whole bill ONCE,
         and if the manager does not deliver in a huge way the following season, they are
         fired. Without that second half the underwrite was a free rescue and dismissal was
         unreachable — a corp on the floor gets the easiest card, clears it by turning up, and
         survives forever. So the fail state has two routes and both are now live: spend all
         the goodwill, or be carried and then fail to repay it. */
      const owed = c._owedYear;
      c._owedYear = c._muster.underwritten;          /* next season is the one that must pay */
      if (owed) {
        const frac = close && close.score ? close.score.fraction : 0;
        if (frac < CONST.UNDERWRITE_DEMANDS / 6) {
          c.dismissed++; c.underwritten = false; c._owedYear = false;
          if (c.rep) c.rep.patience = 35;
          rec.log.push(c.id + ': carried last year and did not deliver — manager dismissed');
          c.history[c.history.length - 1].dismissed = true;
          continue;
        }
        rec.log.push(c.id + ': repaid the underwrite and keeps the job');
        c.underwritten = false;
      }
      if (c.rep && c.rep.patience <= 0) {
        c.dismissed++; c.underwritten = false;
        c.rep.patience = 35;
        rec.log.push(c.id + ': manager dismissed at the end of season ' + season);
        rec.corps[id].dismissed = true;
      }
    }
    return rec;
  }

  /**
   * A whole season with the AI in every seat. This is a WRAPPER and deliberately has no logic of
   * its own — if it grew a special case, the fleet would start playing a season a human cannot
   * play, and there would be no way to tell from the outside.
   */
  function runSeason(rng, corps, profiles, opts) {
    const state = beginSeason(rng, corps, profiles, opts);
    while (state.month <= CONST.PREP_MONTHS) stepMonth(state);
    return closeSeason(state);
  }

  /* ------------------------------------------------------------------- save and load ---- */

  /**
   * SAVE_VERSION is bumped whenever the shape below changes. An old save loading into a new
   * build and half-working is worse than an old save refusing to load.
   */
  const SAVE_VERSION = 1;

  /**
   * A career, written down. Three things are NOT stored, on purpose:
   *
   *  - **The planet and its pot.** Derived from the season number alone
   *    (`seedFrom('planet' + season)`), so they are rebuilt rather than recorded. Storing them
   *    would mean two sources for one fact, and the one in the file would be the one that could
   *    drift.
   *  - **The open lot.** Same reason: `seedFrom('lot' + kind + season)`. A lot is either open
   *    for the current month's window or already resolved, and which of those is known from the
   *    month.
   *  - **Anything in the item catalogue.** Kit refers into `items.json`; those references are
   *    read-only and shared, and duplicating them per fighter would inflate the file for
   *    nothing. They come back through the same catalogue on load.
   *
   * What IS stored is the part that cannot be derived: the people, the money, the standing, the
   * board's memory, and the exact position of the random stream. The stream matters more than
   * it looks — mulberry32's whole state is one integer, so a career resumes bit-for-bit rather
   * than approximately, and "approximately" in a game about a twelve-season career is a
   * different career.
   */
  function saveCareer(state) {
    const corps = state.corps || state;
    const out = { version: SAVE_VERSION, corps: {} };
    /* EVERYTHING EXCEPT THE CATALOGUE. This began as a list of fields to keep and that is the
       wrong shape: an allowlist silently drops whatever is added next, and the symptom is a
       career that loads fine and behaves differently — the exact class of fault this project
       keeps producing. It missed `_off` within a minute of being written.
       So the rule is inverted. Everything on a corp is saved except what is knowably static
       (`profile`, which is catalogue data and comes back from the profile list). A new field
       added to a corp is saved by default; a field that must NOT be saved has to be named here
       deliberately. */
    const NOT_SAVED = ['profile'];

    /* THE IDENTITY TRAP, and it is the whole difficulty of saving this game.
       A fighter is one object with many pointers at it. `roster` mostly owns them, but `_drop`,
       `_renew` and the four lists on `_off` hold the SAME objects and the code relies on it —
       `closeSeason` settles contracts through `_off.expired` and expects the roster to see it.
       At one mid-season point 150 fighter objects are reachable by two paths.

       JSON has no concept of a pointer, so a naive save turns every alias into a separate copy.
       Nothing errors. The file looks right, every name and stat is correct, and the career
       quietly becomes one where the board settles contracts with clones of your people. It
       diverged only from season two onward, because season one has no offseason to build the
       aliases — which is exactly how a fault like this survives a test suite.

       The first fix was "roster owns everyone, everything else is an id" and it was wrong:
       `_off.retired` holds people who have LEFT the roster, so their only record was the alias
       and resolving against the roster deleted them. Hence a register with a fixed visiting
       order — whoever sees a fighter first writes them down in full, everyone after that
       writes an id. Order is fixed so a save is reproducible. */
    const OWNER_ORDER = ['roster', '_off.retired', '_off.expired', '_off.freed', '_off.injured',
                         '_drop', '_renew'];
    const getList = (c, path) => {
      const bits = path.split('.');
      const v = bits.length === 1 ? c[bits[0]] : (c[bits[0]] || {})[bits[1]];
      return Array.isArray(v) ? v : null;
    };
    const setList = (o, path, val) => {
      const bits = path.split('.');
      if (bits.length === 1) o[bits[0]] = val;
      else { o[bits[0]] = o[bits[0]] || {}; o[bits[0]][bits[1]] = val; }
    };

    for (const id of Object.keys(corps)) {
      const c = corps[id], keep = {};
      for (const k of Object.keys(c)) {
        if (NOT_SAVED.indexOf(k) >= 0) continue;
        if (k === '_off' && c[k]) { keep[k] = {}; for (const ok of Object.keys(c[k])) keep[k][ok] = c[k][ok]; }
        else keep[k] = c[k];
      }
      const written = {};
      for (const path of OWNER_ORDER) {
        const list = getList(c, path);
        if (!list) continue;
        setList(keep, path, list.map(f => {
          if (!f || !f.id) return f;
          if (written[f.id]) return { $ref: f.id };
          written[f.id] = true;
          return f;
        }));
      }
      keep.$order = OWNER_ORDER;
      out.corps[id] = keep;
    }
    /* mid-season position, if a year is open */
    if (state.corps) {
      out.open = {
        season: state.season, month: state.month, done: !!state.done,
        rngState: state.rng && state.rng.state ? state.rng.state() : null,
        /* the broadcast is live, not archived: the Dividend's footage (frames, sides,
           body refs) does not ride a save — a loaded year re-lists an empty card */
        dividend: state.dividend
          ? Object.assign({}, state.dividend, { watch: undefined }) : state.dividend,
        mercs: state.mercs, tryouts: state.tryouts,
        bastille: state.bastille, bids: state.bids, rec: state.rec, drop: state.drop,
        /* `human` rides too, or a loaded game never pauses at a comms window again */
        opts: { want: (state.opts || {}).want, lean: (state.opts || {}).lean,
                manual: (state.opts || {}).manual, human: (state.opts || {}).human },
        lotSpent: !state.lots[(MONTHS[state.month] || {}).signing]
      };
    }
    return JSON.parse(JSON.stringify(out));
  }

  /**
   * Read a career back. Returns `{ corps, state }` — `state` is null if the save was taken
   * between seasons rather than inside one.
   *
   * The rebuilt objects are NEW objects; nothing else is possible across a file. What must
   * survive is the invariant, not the addresses: from here on a survivor carries to next season
   * as the same object, exactly as it did before the save, and a season played after loading
   * must be indistinguishable from one played without ever saving. Both are guarded.
   */
  function loadCareer(saved, profiles) {
    if (!saved || saved.version !== SAVE_VERSION) {
      throw new Error('save file is version ' + (saved && saved.version) +
                      ', this build reads version ' + SAVE_VERSION);
    }
    const byId = {};
    for (const p of profiles) byId[p.id] = p;
    const corps = {};
    for (const id of Object.keys(saved.corps)) {
      const c = JSON.parse(JSON.stringify(saved.corps[id]));
      /* the profile is static data, not save data — it comes from the catalogue */
      c.profile = byId[id];
      /* Rebuild the register in the SAME visiting order it was written in, so whoever owned a
         fighter in the file owns them here, and every id after that becomes a pointer at that
         one object rather than a second person with the same name. */
      const own = {};
      const order = c.$order || ['roster'];
      delete c.$order;
      const get = (path) => { const b = path.split('.');
        const v = b.length === 1 ? c[b[0]] : (c[b[0]] || {})[b[1]];
        return Array.isArray(v) ? v : null; };
      const set = (path, val) => { const b = path.split('.');
        if (b.length === 1) c[b[0]] = val;
        else { c[b[0]] = c[b[0]] || {}; c[b[0]][b[1]] = val; } };
      for (const path of order) {
        const list = get(path);
        if (!list) continue;
        set(path, list.map(f => {
          if (f && f.$ref) return own[f.$ref] || null;
          if (f && f.id) own[f.id] = f;
          return f;
        }).filter(f => f !== null));
      }
      corps[id] = c;
    }
    if (!saved.open) return { corps: corps, state: null };

    const o = saved.open;
    const state = {
      rng: P.mulberry32(o.rngState >>> 0),
      corps: corps, profiles: profiles, opts: o.opts || {},
      ids: Object.keys(corps), season: o.season, rec: o.rec,
      month: o.month, done: o.done,
      lots: {}, bids: o.bids || { tryouts: {}, mercs: {} },
      drop: o.drop || { sectors: {}, pacts: {}, media: {} },
      dividend: o.dividend, mercs: o.mercs, tryouts: o.tryouts, bastille: o.bastille,
      planet: null
    };
    /* rebuilt, not restored — see `saveCareer` */
    state.planet = MAP.generatePlanet(P.mulberry32(P.seedFrom('planet' + o.season)), {});
    state.planet.pot = NEG.rollPot(P.mulberry32(P.seedFrom('pot' + o.season)),
                                   state.planet.archetype, state.planet.richness);
    /* the sponsor board is derived too: the house list is fixed, and each corp's courting effort
       (which IS saved, on the corp) carries the year's progress. Rebuild an open board so the
       lock can resolve it from the restored courting. */
    state.sponsorBoard = SPON.openBoard(SPON.houseIds());
    if (!o.lotSpent) ensureLot(state);
    return { corps: corps, state: state };
  }

  /** Run a career. Nothing is regenerated between seasons. */
  function runCareer(rng, profiles, seasons, opts) {
    const corps = openFleet(rng, profiles, opts);
    const out = { seasons: [], corps: corps };
    for (let s = 0; s < seasons; s++) out.seasons.push(runSeason(rng, corps, profiles, opts));
    return out;
  }

  /* `runMercMarket` is exported so the refusal branch can be PROVED BY CONSTRUCTION rather than
     by running more careers hoping to see one. A corp murderous enough to be turned down by
     every free agent on the market should not appear in an ordinary decade, so the only honest
     way to know the branch is alive is to build the state and fire it. */
  return { CONST, MONTHS, openFleet, offseason, selectDrop, muster, grieve, renewRoster,
           renewalSalary, runSeason, runCareer, runMercMarket,
           /* the seam a manager sits in: open a year, look at a month, spend it, close the year */
           beginSeason, stepMonth, closeSeason, closeSeasonToDrop, prepareDivide,
           finishSeason, monthTracks, optionsFor, validateFocus,
           foundingRoster, openLot, ensureLot, saveCareer, loadCareer, SAVE_VERSION,
           schedule, resolvePending, sectorsFor, chooseDropSector, pactTargets,
           offerPact, attendMediaDay, askingPrice, signingBudget, lotFor, placeBid, bidsFor,
           chooseFocus, lockLean, wantedDropSize,
           /* Gather Intel — the dossier model, its readers, and its schema */
           ensureIntel, gatherIntel, snapshotRival, rowFreshness,
           rivalPreparedness, planetPreparedness,
           INTEL_RIVAL_ROWS, INTEL_PLANET_ROWS,
           /* Courting Sponsors — the module, for the desk to read costs, regard, and the roster */
           SPON };
}));
