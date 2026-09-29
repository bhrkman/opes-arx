/* Capital Divide — /sim/reputation.js
 *
 * Who is watching, what they think of you, and what that costs.
 *
 * THE AUDIENCES (ruled at the standing pass). Every standing is 0 to 100, and 50 is indifference.
 *   YOUR CROWD is six factions, each with a warmth and a share of the stands: Bloodhounds (blood), Tacticians
 *     (craft), Fairweathers (glory, and quick to leave), Underdogs (grit, long odds), Families (care, people
 *     home) and Diehards (the word kept; the largest share, moved only by grave acts). The shares drift each
 *     year toward the factions an OA feeds, so the mix of the stands becomes the OA's identity. The crowd's
 *     warmth is the share-weighted mean.
 *   THE HOUSES are the seven other OAs, each how that house and its people regard you. A house judges by its own
 *     crowd's mix — what its stands like, it likes to see — plus what you did to it directly.
 *   THE BOARD is patience, 0 to 100.
 * The Aleas and a single "fleet" audience are gone (ruled).
 *
 * AN ACT DECLARES WHAT IT IS — how much blood, craft, glory, grit, care and word is in it — and each audience
 * weighs that by its taste, so one act splits the stands instead of nudging one bar.
 *
 * WHAT THIS DOES NOT OWN: money. There is no exchange rate between standing and credits in this file.
 *
 * Plain serialisable data; pure logic; every roll takes an injected rng.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require('./prng.js') : global.CDPRNG;

  const CONST = {
    /* §2.1 the scale — 0 to 100, and 50 is indifference (ruled) */
    STANDING_FLOOR: 0,                  // [S]
    STANDING_CEIL: 100,                 // [S]
    STANDING_MID: 50,                   // [S] where every audience starts that has no reason not to
    SOFT_AT: 25,                        // [C] §2.2 past this far from indifference the scale compresses: the last
    SOFT_SCALE: 30,                     //     points cost the most, and nothing pins at the ends
    DRIFT: 0.22,                        // [C] §2.3 the share of what is felt that fades each season
    MONTHLY_FADE: 0.025,                // [C] §2.3 and what fades each month: a crowd has to be fed, or it cools back toward indifference

    /* §2.1 the memory — recency and permanence together (R8) */
    MEMORY_HALFLIFE: 3,                 // [C] seasons, the default
    MEMORY_CAP: 80,                     // [S] acts kept before the oldest are folded into the base
    HEADLINE_AT: 12,                    // [C] §3.3 an act this big to anyone is remembered by name

    /* §2.4 the crowd */
    SHARE_SHIFT: 0.30,                  // [C] how far a year moves the stands toward the factions an OA feeds
    SHARE_FLOOR: 0.04,                  // [C] no faction ever leaves entirely
    DIEHARD_DAMP: 0.30,                 // [C] what an ordinary act moves the Diehards, of what it moves anyone else
    DIEHARD_GRAVE: 1.20,                // [C] and what a grave one does
    /* §2.5 the houses */
    HOUSE_SPECTATE: 0.45,               // [C] a house watches you with its own crowd's taste, at this weight

    /* §4 fame — attention, not approval (R11) */
    FAME_FLOOR: 0,                      // [S]
    FAME_CEIL: 100,                     // [S]
    FAME_DECAY: 0.88,                   // [C] per season; the fleet forgets a person faster
    PRESENCE_FAME: 1.5,                 // [C] §PRESENCE fame earned, across the stat's spread (was 0.5, kills only)
    PRESENCE_FAME_MIN: 0.25,            // [C] the least visible hand earns this share
    PRESENCE_FAME_MAX: 2.5,             // [C] the most visible, this
    PRESENCE_FAME_KEEP: 0.06,           // [C] and how much longer (or shorter) the fleet remembers them
                                        //     than it forgets a corp, which is the right way round
    FAME_KILL_TRANSFER: 0.22,           // [C] §4.2 share of a famous victim's fame that moves
                                        //     to whoever put them down. Beating a nobody moves
                                        //     nothing — the same definition of "worth beating"
                                        //     the day loop already hunts by

    /* §6 the board */
    PATIENCE_FLOOR: 0,                  // [S] dismissal. Step 8 owns the firing; this owns the number
    PATIENCE_CEIL: 100,                 // [S]
    GOAL_DEMANDS: [3, 4],               // [S] R25 — fewer discrete asks, because two standing
                                        //     ones are now always on the card as well
    /* R25 — the standing demands, judged on a spectrum every season rather than met/unmet. */
    /* THE NEUTRAL POINT OF THE FUNDING SPECTRUM IS 1.0 AND IS NOT A TUNED NUMBER. A board is
       not merely un-delighted by an expensive year, it is ANNOYED by one — so the neutral has
       to be exceedable, which the old baseline (the whole ceiling plus every contract in full)
       was not. `season.js` now measures spend against WHAT THE BOARD PUT IN: §6.5's stipend,
       which covers wages, the entry fee and arming a full force and nothing else. Living inside
       your stipend is exactly neutral.

       A constant was briefly fitted here to the measured median instead, and the next change in
       the same session made that median stop existing. The relationship is structural and
       re-anchors itself as the economy moves; the number did not. */
    STANDING_THRIFT_W: 1.30,            // [C] how hard a cheap year moves a board with no
                                        //     interest in the planet; scaled DOWN by interest
    STANDING_POPULARITY_W: 0.85,        // [C] §5.3 what the crowd is worth beside the books
    POPULARITY_NEUTRAL: 50,             // [C] the crowd a board takes for granted: indifference is unremarkable, not a failure
    POPULARITY_SPAN: 20,                // [C] the distance from that to delight or fury
    STANDING_CARE_W: 0.70,              // [C] how hard bringing people home moves one
    CARE_NEUTRAL_LOSS: 0.29,            // [C] the loss rate a board considers unremarkable.
                                        //     MEASURED, not assumed, and re-measured whenever
                                        //     the resolver changes: 0.30 -> 0.398 (abstract
                                        //     model) -> 0.496 (the grid). Each time it went
                                        //     -> 0.28 once an orderly withdrawal stopped
                                        //     being scored as an overrun. Each time it went
                                        //     stale, every board in the fleet became
                                        //     permanently disappointed about a normal year and
                                        //     all eight corps' patience trended down together.
                                        //     A constant anchored to a measurement has to be
                                        //     re-anchored when the measurement moves.
    GOAL_CONTENT_FRACTION: 0.50,        // [C] R25 — the score at which a board is merely content
    /* [C] R25b — anchored to the measured spread of card scores (p25 0.45, median 0.62,
       p75 0.76), not chosen. Re-anchor these whenever the card or the resolver moves. */
    /* §5.4 RE-MEASURED. The cuts were set against a card pool that has since lost two demands
       (losses and surplus, each a second reading of a standing demand) and gained a third
       standing one (popularity). Measured over seventy-two card years — three fleets, three
       seasons — the scores now run: p10 0.34, p25 0.44, median 0.60, p75 0.71, p90 0.78, and
       almost nothing above 0.88. Against the old cuts a board was delighted once in seventy-two
       years and content in half of them. The cuts follow the distribution: the top tenth
       delights, the top quarter pleases, the bottom quarter disappoints, the bottom tenth is a
       sacking offence. `measure_board.cjs` is the instrument. */
    BOARD_CUTS: { delighted: 0.78, pleased: 0.66, disappointed: 0.44, unhappy: 0.33 },
    HOME_CUSHION: 0.40,                 // [C] §6.4 how much popular support blunts a bad year
    /* §6.1 THE STORES ARE SHIPS' HOLDS, not shelves. "The ship has 4 food" is a silly
       sentence: a store is measured in UNITS OF A THOUSAND, so a full hold of grain is nine
       thousand and a year's demand is three. The share is unchanged — every ratio in the game
       reads the same — only the words a manager sees have a scale a fleet would use. And the
       stores fall a little EVERY MONTH rather than all at once at the year's turn, for the
       same annual total: a hold that empties in twelve small bites is a thing a manager
       watches, not a number that jumps once while he is looking elsewhere. */
    UNIT_SCALE: 1000,                   // [C] what one unit is, in the words the page uses
    HOLDS_DRAIN: 0.12,                  // [H] §6.1 of a full store, per YEAR. [OPEN-R1]
    HOLDS_DRAIN_MONTHS: 11,             // [C] spread across the preparation's months
    HOLDS_CEIL: 1.0,                    // [S]
    RESOURCE_ASK: 0.33,                 // [C] the share of a store a board asks for, in units
    UNITS_PER_STORE: 9,                 // [H] assay units that fill a store. RE-DERIVED: the
                                        //     first pass took 40, and a corp digs two to six
                                        //     out of a Divide, so every resource demand on
                                        //     every card failed and eight boards sacked eight
                                        //     managers inside three seasons. [OPEN-R1]
    EASY_CARD_SPAN: 4,                  // [C] places of softening that count as a discount
    EASY_CARD_DISCOUNT: 0.88,           // [C] §6.1a how little a trivial card is worth clearing
    AMBITION_PIVOT: 50,                 // [S] §6.2 patience at which a board asks for its anchor
    AMBITION_SCALE: 12,                 // [C] patience points per place demanded — the harder
                                        //     you have made it look, the harder they ask
    CALL_PATIENCE_RATE: 0.055,          // [C] §6.5 patience per 10,000 credits asked of the board
    CALL_ESCALATOR: 0.80,               // [C] and asking twice costs more than asking once

    /* §11 the mercenary price — a price, not an audience (R7) */
    MERC_INDEX_HALFLIFE: 2,             // [C] seasons
    MERC_PRICE_SWING: 0.35              // [H] how far the market moves for how you spend people
  };

  /* §2.4 THE CROWD'S FACTIONS, and what each wants to see. A taste is a weight on each quality an act can carry. */
  const FACTIONS = ['bloodhounds', 'tacticians', 'fairweathers', 'underdogs', 'families', 'diehards'];
  const QUALITIES = ['blood', 'craft', 'glory', 'grit', 'care', 'word'];
  const TASTE = {
    bloodhounds:  { blood: 1.00, craft: 0.00, glory: 0.35, grit: 0.25, care: -0.10, word: 0.00 },
    tacticians:   { blood: -0.15, craft: 1.00, glory: 0.30, grit: 0.10, care: 0.10, word: 0.20 },
    fairweathers: { blood: 0.15, craft: 0.10, glory: 1.40, grit: -0.20, care: 0.00, word: 0.00 },
    underdogs:    { blood: 0.10, craft: 0.10, glory: -0.15, grit: 1.10, care: 0.10, word: 0.20 },
    families:     { blood: -0.40, craft: 0.00, glory: 0.10, grit: 0.00, care: 1.10, word: 0.45 },
    diehards:     { blood: 0.00, craft: 0.00, glory: 0.20, grit: 0.20, care: 0.50, word: 0.90 }
  };
  /* how long each faction remembers, in seasons: a Fairweather forgets a triumph by next year, a Diehard does not */
  const HALFLIFE = { bloodhounds: 3, tacticians: 3, fairweathers: 1, underdogs: 3, families: 3, diehards: 5 };
  const CATEGORIES = ['minerals', 'fuels', 'luxuries', 'foods'];
  const REGISTERS = ['gracious', 'defiant', 'humble', 'deflecting', 'candid', 'evasive'];
  /* the audiences a caller may ask for by name */
  const AUDIENCES = FACTIONS.concat(['crowd', 'house', 'houses']);

  /* --- §3.1 the act table ------------------------------------------------------------
     Every act says what it IS, and the audiences decide what they make of it.
        q        the qualities in it, each -1..1 (blood, craft, glory, grit, care, word)
        mag      how big it is: a number, [lo, hi] scaled by ctx.scale, or {per: n} by ctx.count
                 (ctx.famous counted at famousMult)
        target   felt by the house the act was done to (ctx.targetId), on top of how it watched
        houses   felt by every house directly — envy of a winner, respect for a gracious word
        buyer    felt by the house that bought from you (ctx.buyerId)
        grave    the Diehards feel it in full; ctx.grave marks one case of an act as grave
        residue  the share never forgotten (R8)
     ctx.mult (and the older ctx.storyMult) scales the whole act: who it happened to changes how loudly it lands. */
  const ACTS = {
    /* --- the Divide, and its settlement --- */
    won_planet:         { q: { glory: 1.0 }, mag: 14, houses: -5, residue: 0.55 },       /* ctx.scale adds grit: how unlikely it was */
    finished:           { q: { glory: 1.0 }, mag: { per: 2.0 }, residue: 0.15 },   /* ctx.count: places above the middle of the table, negative below */
    ceded:              { q: { glory: -1.0, grit: -0.6, care: 0.5 }, mag: [4, 14], buyer: 3, residue: 0.15 },
    bought_win:         { q: { grit: -1.0, glory: -0.3, word: -0.2 }, mag: [4, 10], target: -6, residue: 0.15 },
    held_out:           { q: { grit: 1.0, blood: 0.3 }, mag: [3, 10], residue: 0.20 },
    refused_all:        { q: { grit: 0.8, word: 0.4, blood: 0.3 }, mag: 7, houses: -3, residue: 0.30 },
    last_ground:        { q: { grit: 0.7, blood: 0.5, glory: 0.5 }, mag: 6, houses: 1, residue: 0.15 },
    everyone_came_home: { q: { care: 1.0, craft: 0.4 }, mag: 8, residue: 0.20 },
    few_lost:           { q: { care: 1.0 }, mag: 4, residue: 0.20 },
    our_dead:           { q: { care: -1.0, craft: -0.35, glory: -0.25 }, mag: { per: 0.8 }, famousMult: 3, residue: 0.15 },   /* ctx.grave when it was most of them */
    their_dead:         { q: { blood: 1.0, craft: 0.2, glory: 0.25 }, mag: { per: 0.35 }, target: { per: -0.5 }, famousMult: 3, residue: 0.15 },
    worthy_fight:       { q: { blood: 0.5, craft: 0.5, grit: 0.3 }, mag: { per: 1.2 }, houses: { per: 0.3 }, residue: 0.15 },
    hid:                { q: { blood: -1.0, grit: -0.6 }, mag: { per: 1.2 }, houses: { per: -0.5 }, residue: 0.15 },
    kept_truce:         { q: { word: 1.0 }, mag: 3, target: 8, residue: 0.15 },
    betrayed:           { q: { word: -1.0 }, mag: 22, target: -45, houses: -8, grave: true, residue: 0.85 },
    generous_terms:     { q: { word: 0.5 }, mag: 2, target: 6, residue: 0.20 },
    ransomed_home:      { q: { care: 1.0, word: 0.4 }, mag: 8, target: 4, residue: 0.15 },
    abandoned_ours:     { q: { care: -1.0, word: -0.5 }, mag: 14, grave: true, residue: 0.30 },
    released_captives:  { q: { word: 0.6, blood: -0.5, care: 0.3 }, mag: 4, target: 11, residue: 0.15 },
    killed_captives:    { q: { blood: 0.8, word: -1.0 }, mag: 12, target: -26, houses: -4, grave: true, residue: 0.85 },
    kept_captive:       { q: { blood: 0.3 }, mag: 2, target: -9, residue: 0.15 },
    /* --- the year --- */
    a_star_rose:        { q: { glory: 1.0, blood: 0.3 }, mag: 5, residue: 0.20 },
    took_the_purse:     { q: { glory: 1.0, craft: 0.5 }, mag: 5, residue: 0.20 },
    the_gate_was_good:  { q: { glory: 0.6 }, mag: 2, residue: 0.15 },
    won_the_eight:      { q: { glory: 1.0, blood: 0.5 }, mag: 6, houses: 1, residue: 0.25 },
    paid_the_wages:     { q: { care: 1.0, word: 0.3 }, mag: 2.5, residue: 0.30 },
    granted_a_raise:    { q: { care: 1.0 }, mag: 3, residue: 0.25 },
    kept_a_debtor:      { q: { care: 0.8, word: 0.6 }, mag: 4, residue: 0.25 },
    silent_before_board:{ q: { word: -1.0 }, mag: 3, residue: 0.20 },
    snubbed_letter:     { target: -4, residue: 0.25 },
    media_day:          { q: { glory: 1.0 }, mag: 4, houses: -1, residue: 0.15 },
    /* --- the market, seen from the stands: ctx.count is the fighter's fame --- */
    sold_away:          { q: { word: -1.0, care: -0.3 }, mag: { per: 0.2 }, buyer: { per: 0.18 }, residue: 0.20 },   /* ctx.grave for a star */
    sold_anyone:        { q: { word: -0.5 }, mag: 1.5, residue: 0.15 },
    /* --- §8.2 the address: one per register, so every register moves somebody --- */
    said_gracious:      { q: { word: 0.6 }, mag: 3, houses: 4, residue: 0.15 },
    said_defiant:       { q: { blood: 0.6, grit: 0.5 }, mag: 5, houses: -2, residue: 0.15 },
    said_humble:        { q: { care: 0.5, word: 0.4 }, mag: 3, houses: 2, residue: 0.15 },
    said_deflecting:    { q: { glory: 0.3, word: -0.5 }, mag: 3, residue: 0.15 },
    said_candid:        { q: { word: 0.8, craft: 0.3 }, mag: 4, houses: 3, residue: 0.15 },
    said_evasive:       { q: { word: -0.4 }, mag: 2, houses: -1, residue: 0.15 },
    /* --- the dispatches --- */
    sold_a_fighter:     { q: { word: -0.8, care: -0.3 }, mag: 4, residue: 0.20 },
    refused_an_offer:   { q: { word: 0.6 }, mag: 2, target: -2, residue: 0.15 },
    answered_a_slight:  { q: { blood: 0.5, grit: 0.4 }, mag: 3, target: -4, residue: 0.20 },
    ignored_a_slight:   { q: { grit: -0.5, word: 0.2 }, mag: 2, residue: 0.15 },
    laughed_off_a_slight:{ q: { glory: 0.3 }, mag: 1, residue: 0.10 },
    profiled:           { q: { glory: 1.0 }, mag: 2, residue: 0.10 },
    spoke_well:         { q: { glory: 0.6, word: 0.4 }, mag: 2, houses: 1, residue: 0.10 },
    owned_it:           { q: { word: 1.0 }, mag: 3, residue: 0.15 },
    no_comment:         { q: { word: -0.6, glory: -0.3 }, mag: 2, residue: 0.10 },
    media_cut_against:  { q: { glory: -1.0 }, mag: 3, houses: -2, residue: 0.20 },
    sent_regrets:       { q: { glory: -0.5 }, mag: 1, houses: -1, residue: 0.05 },
    petitioned:         { q: { word: 0.4, care: 0.3 }, mag: 1.5, residue: 0.10 },
    refused_a_raise:    { q: { care: -0.6, word: -0.2 }, mag: 2, residue: 0.15 },
    released_a_fighter: { q: { care: -0.8, word: -0.4 }, mag: 3, residue: 0.20 },          /* ctx.grave for a star */
    left_a_debtor:      { q: { care: -1.0, blood: 0.2 }, mag: 3, residue: 0.20 },
    disciplined:        { q: { craft: 0.5, blood: -0.4, care: -0.2 }, mag: 2, residue: 0.10 },
    fined_both:         { q: { craft: 0.3, care: -0.2 }, mag: 1.5, residue: 0.10 },
    let_it_lie:         { q: { blood: 0.6, craft: -0.4 }, mag: 2, residue: 0.10 },
    bought_rare_kit:    { q: { blood: 0.5, glory: 0.5, craft: 0.2 }, mag: 2, residue: 0.10 },
    a_hand_handled:     { q: {}, mag: 1.5, residue: 0.10 },                                    /* ctx.q: what the answer was made of */
    lost_the_dividend:  { q: { glory: -0.5 }, mag: 2, residue: 0.10 },
    lost_the_eight:     { q: { glory: -0.6 }, mag: 2, residue: 0.10 },
    /* --- the year's work, month by month: ctx.count is the focus spent --- */
    drilled_hard:       { q: { craft: 0.5, blood: 0.3, care: -0.5 }, mag: { per: 0.30 }, residue: 0.05 },
    rested_them:        { q: { care: 0.8, craft: -0.2, blood: -0.3 }, mag: { per: 0.30 }, residue: 0.05 },
    scouted:            { q: { craft: 0.8, blood: -0.2 }, mag: { per: 0.22 }, residue: 0.05 },
    courted:            { q: { glory: 0.5, word: -0.2 }, mag: { per: 0.16 }, residue: 0.05 },
    /* --- who comes aboard, and who is let go --- */
    signed_our_own:     { q: { word: 0.6, care: 0.3 }, mag: 1.2, residue: 0.10 },
    hired_a_gun:        { q: { glory: 0.7, blood: 0.3, word: -0.3 }, mag: [1, 5], residue: 0.10 },   /* ctx.scale: their fame */
    took_a_conscript:   { q: { blood: 0.4, grit: 0.3, care: -0.2 }, mag: 1, residue: 0.10 },
    let_a_veteran_go:   { q: { word: -0.6, care: -0.3 }, mag: [1, 5], residue: 0.20 },      /* ctx.scale: their years; ctx.grave for a star */
    /* --- the crowd's own dispatches --- */
    gave_it_away:       { q: { care: 1.0, word: 0.6 }, mag: 4, grave: true, residue: 0.20 },
    took_the_collection:{ q: { glory: 0.3 }, mag: 1, residue: 0.05 },
    read_the_papers:    { q: { craft: 0.6, word: -0.3 }, mag: 2, target: -4, residue: 0.15 },
    sent_the_papers_back:{ q: { word: 1.0 }, mag: 3, target: 8, grave: true, residue: 0.20 },
    went_out_to_them:   { q: { word: 0.6, care: 0.4 }, mag: 4, residue: 0.15 },
    shut_the_gate:      { q: { word: -0.6, glory: -0.4 }, mag: 3, residue: 0.15 },
    settled_a_strike:   { q: { care: 0.6 }, mag: 2, residue: 0.10 },
    /* §TALKS a promise to one of your own gets out, kept or broken */
    kept_a_promise:     { q: { word: 0.8, care: 0.3 }, mag: 1.5, residue: 0.10 },
    broke_a_promise:    { q: { word: -1.0, care: -0.3 }, mag: 4, residue: 0.25 },     /* ctx.grave for a star */
    /* §STAFF the backroom's acts */
    poached_staff:      { q: { craft: 0.4, word: -0.3 }, mag: 1.5, target: -10, residue: 0.20 },
    mole_exposed:       { q: { word: -0.8, craft: 0.2 }, mag: 3, target: -18, residue: 0.25 },
    /* §FACILITIES a facility stands: each faction sees what it cares for (ctx.q) */
    raised_a_facility:  { q: {}, mag: 2, residue: 0.15 }
  };

  /* §2.6 THE HOUSES' HISTORY. The eight engine OAs carry written relationships with one another; they seed how one
     house regards another, at half their written weight. A founded OA has none: it stands at indifference with every
     house and is judged from the start by seven different tastes (ruled: no preset grudges against a person's seat). */
  const DISPOSITION = {
    kinship: 35, sympathy: 28, respect: 25, dependence: 12, leverage: -5,
    poaching: -12, friction: -15, rivalry: -18, disdain: -22, distrust: -25, hostility: -45
  };

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /* ================================================================================
     §2 — the crowd, the houses, the memory
     ================================================================================ */

  /* §2.4 THE STANDS AN OA OPENS WITH. An engine OA's crowd is read from its character: an aggressive OA draws
     Bloodhounds, a showman Fairweathers, a careful one Tacticians, a thrifty one Families, a traditional one
     Diehards, and a poor one Underdogs. A founded OA opens balanced, with the Diehards any OA has — and becomes what
     its record makes it (ruled: off record). */
  function openingShares(profile, founded) {
    if (founded) {
      const s = { diehards: 0.30 };
      for (const f of FACTIONS) if (f !== 'diehards') s[f] = 0.14;
      return s;
    }
    const d = (profile && profile.dials) || {};
    const x = k => (d[k] != null ? d[k] : 50) / 100;
    const diff = ((profile && profile.difficulty) || 3);
    const raw = {
      bloodhounds: 0.5 + 1.2 * x('aggression'),
      tacticians: 0.5 + 0.8 * x('patience') + 0.3 * (1 - x('aggression')),
      fairweathers: 0.5 + 1.2 * x('showmanship'),
      underdogs: 0.2 + 0.30 * (diff - 1),
      families: 0.5 + 0.8 * x('thrift') + 0.3 * (1 - x('treachery')),
      diehards: 1.0 + 1.0 * x('tradition')
    };
    return normShares(raw);
  }
  function normShares(raw) {
    let t = 0; for (const f of FACTIONS) t += Math.max(0, raw[f] || 0);
    const out = {};
    for (const f of FACTIONS) out[f] = t ? Math.max(0, raw[f] || 0) / t : 1 / FACTIONS.length;
    /* the floor, then renormalised */
    for (const f of FACTIONS) out[f] = Math.max(CONST.SHARE_FLOOR, out[f]);
    let t2 = 0; for (const f of FACTIONS) t2 += out[f];
    for (const f of FACTIONS) out[f] /= t2;
    return out;
  }
  /** the taste of a crowd with these shares — what a house built of these stands likes to see */
  function tasteOfShares(shares) {
    const t = {};
    for (const q of QUALITIES) t[q] = 0;
    for (const f of FACTIONS) for (const q of QUALITIES) t[q] += (shares[f] || 0) * TASTE[f][q];
    return t;
  }
  function tasteOf(rep) { return tasteOfShares(rep.shares); }

  /** an OA founded at the desk (season.founderProfile marks it) */
  function isFounded(profile) { return !!(profile && (profile.founded || profile.founding === 'lean' || profile.canon_status === 'player-founded')); }

  /** A corp's persistent record. `profile` is an oa_profiles entry; `opts.founded` for a desk-founded OA. */
  function open(profile, allProfiles, opts) {
    opts = opts || {};
    const founded = !!(opts.founded || isFounded(profile));
    const shares = openingShares(profile, founded);
    /* an engine OA's own people start where its profile says they stand, on the new scale */
    const own0 = !founded && profile && profile.reputation && profile.reputation.own != null ? profile.reputation.own / 8 : 0;
    const base = { factions: {}, houses: {} };
    for (const f of FACTIONS) base.factions[f] = own0;
    const houseTaste = {};
    for (const other of (allProfiles || [])) {
      if (!other || other.id === profile.id) continue;
      let v = 0;
      if (!founded && !isFounded(other)) {
        const theirs = (other.relationships || []).filter(r => r.with === profile.id)[0];
        if (theirs) v = (DISPOSITION[theirs.disposition] || 0) / 2;
        else {
          const ours = (profile.relationships || []).filter(r => r.with === other.id)[0];
          if (ours) v = (DISPOSITION[ours.disposition] || 0) / 4;
        }
      }
      base.houses[other.id] = v;
      houseTaste[other.id] = tasteOfShares(openingShares(other, isFounded(other)));
    }
    return {
      corpId: profile.id,
      season: opts.season || 1,
      shares: shares,
      base: base,
      houseTaste: houseTaste,           // how each house watches — its own crowd's taste, refreshed each season
      memory: [],                       // remembered acts, §2.1
      patience: (profile.finance && profile.finance.board_patience) || 50,
      calls: 0,                         // §6.5 calls on the board this season
      holds: Object.assign({ minerals: 0.5, fuels: 0.5, luxuries: 0.5, foods: 0.5 },
                           profile.holds || {}),
      goal: null,                       // §6.2, set by openSeason
      casualties: [],                   // §11 { season, permanent, famous }
      history: []                       // { season, placement, won }
    };
  }
  /** §2.5 each season the houses are re-read: a house watches with the taste of the stands it has NOW */
  function setHouseTastes(rep, tastes) {
    for (const id in tastes) {
      rep.houseTaste[id] = tastes[id];
      if (rep.base.houses[id] == null) rep.base.houses[id] = 0;
    }
  }

  /* §2.2 THE LAST POINTS COST THE MOST: within SOFT_AT of indifference the scale is linear, and past it compresses
     toward the ends and never reaches them, so adored and worshipped stay legible and nothing pins. */
  function soft(v) {
    const a = CONST.SOFT_AT, span = CONST.STANDING_CEIL - CONST.STANDING_MID - 0.5 - a, k = CONST.SOFT_SCALE;
    if (v > a) return a + span * (1 - Math.exp(-(v - a) / k));
    if (v < -a) return -a - span * (1 - Math.exp(-(-v - a) / k));
    return v;
  }
  /** How much of a remembered act is still being felt. Residue never washes off (R8). */
  function decay(m, season, halflife) {
    const age = Math.max(0, season - m.s), hl = halflife || m.hl || CONST.MEMORY_HALFLIFE;
    return m.res + (1 - m.res) * Math.pow(0.5, age / hl);
  }
  function rawFaction(rep, f) {
    let v = rep.base.factions[f] || 0;
    for (const m of rep.memory) if (m.fx && m.fx[f]) v += m.fx[f] * decay(m, rep.season, HALFLIFE[f]);
    return v;
  }
  function rawHouse(rep, id) {
    let v = rep.base.houses[id] || 0;
    for (const m of rep.memory) if (m.hx && m.hx[id]) v += m.hx[id] * decay(m, rep.season);
    return v;
  }
  function houseIds(rep) { return Object.keys(rep.base.houses); }

  /**
   * §2.1 — standing is COMPUTED, never stored. 0..100, 50 indifferent.
   *   a faction's name   that faction's warmth
   *   'crowd'            the stands as a whole: each faction's warmth by its share
   *   'house', id        how that house regards you
   *   'houses'           the mean of the houses — how the fleet regards you
   */
  function standing(rep, audience, targetId) {
    const mid = CONST.STANDING_MID;
    if (TASTE[audience]) return mid + soft(rawFaction(rep, audience));
    if (audience === 'crowd') {
      let v = 0;
      for (const f of FACTIONS) v += (rep.shares[f] || 0) * (mid + soft(rawFaction(rep, f)));
      return v;
    }
    if (audience === 'house') return mid + soft(rawHouse(rep, targetId));
    if (audience === 'houses') {
      const ids = houseIds(rep);
      if (!ids.length) return mid;
      let v = 0; for (const id of ids) v += mid + soft(rawHouse(rep, id));
      return v / ids.length;
    }
    throw new Error('reputation: no such audience ' + audience);
  }

  /** Every audience at once, for the board and the viewer. */
  function readAll(rep) {
    const out = { crowd: standing(rep, 'crowd'), houses: {}, housesMean: standing(rep, 'houses'),
                  factions: {}, shares: Object.assign({}, rep.shares) };
    for (const f of FACTIONS) out.factions[f] = standing(rep, f);
    for (const id of houseIds(rep)) out.houses[id] = standing(rep, 'house', id);
    return out;
  }

  function resolve(v, ctx) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
      const s = clamp(ctx.scale == null ? 0.5 : ctx.scale, 0, 1);
      return v[0] + (v[1] - v[0]) * s;
    }
    if (v.per != null) {
      const n = ctx.count || 0, fam = Math.min(n, ctx.famous || 0), mult = ctx.famousMult || 1;
      return v.per * ((n - fam) + fam * mult);
    }
    return 0;
  }

  /** What an act would do to every audience, without doing it: { fx: {faction: v}, hx: {house: v} } */
  function impact(rep, type, ctx) {
    ctx = ctx || {};
    const spec = ACTS[type];
    if (!spec) throw new Error('reputation: unknown act ' + type);
    const c = Object.assign({}, ctx, { famousMult: spec.famousMult || 1 });
    const loud = (ctx.storyMult || 1) * (ctx.mult || 1);
    const mag = resolve(spec.mag, c) * loud;
    const q = Object.assign({}, spec.q || {}, ctx.q || {});
    /* a win against the odds is grit as well as glory (ctx.scale: how unlikely it was) */
    if (type === 'won_planet' && ctx.scale != null) q.grit = (q.grit || 0) + clamp(ctx.scale, 0, 1);
    const grave = !!(spec.grave || ctx.grave);
    const fx = {}, hx = {};
    for (const f of FACTIONS) {
      let v = 0;
      for (const k in q) v += (TASTE[f][k] || 0) * q[k] * mag;
      if (f === 'diehards') v *= grave ? CONST.DIEHARD_GRAVE : CONST.DIEHARD_DAMP;
      if (v) fx[f] = v;
    }
    const direct = resolve(spec.houses, c) * loud;
    for (const id of houseIds(rep)) {
      const t = rep.houseTaste[id] || tasteOfShares(normShares({}));
      let v = 0;
      for (const k in q) v += (t[k] || 0) * q[k] * mag;
      v = v * CONST.HOUSE_SPECTATE + direct;
      if (v) hx[id] = v;
    }
    if (spec.target != null && ctx.targetId && rep.base.houses[ctx.targetId] != null)
      hx[ctx.targetId] = (hx[ctx.targetId] || 0) + resolve(spec.target, c) * loud;
    if (spec.buyer != null && ctx.buyerId && rep.base.houses[ctx.buyerId] != null)
      hx[ctx.buyerId] = (hx[ctx.buyerId] || 0) + resolve(spec.buyer, c) * loud;
    return { fx, hx, grave };
  }
  /** the change to the crowd as a whole and to the houses' mean that `impact` amounts to — for a preview */
  function impactSummary(rep, im) {
    let crowd = 0; for (const f in im.fx) crowd += (rep.shares[f] || 0) * im.fx[f];
    const ids = houseIds(rep); let houses = 0; for (const id in im.hx) houses += im.hx[id];
    return { crowd: crowd, houses: ids.length ? houses / ids.length : 0 };
  }

  /**
   * §3 — a corp is seen doing something. Remembers what each audience made of it and returns what moved, so the
   * day loop and the viewer can show the reason beside the number.
   * ctx: { targetId, buyerId, count, famous, scale, grave, mult, storyMult, season }
   */
  function act(rep, type, ctx) {
    ctx = ctx || {};
    const spec = ACTS[type];
    const im = impact(rep, type, ctx);
    /* §STAFF A FIXER'S HAND: good news carried further, bad news softened, the houses courted —
       set on the rep by the season from whoever holds the post, read here where every act lands */
    const sp = rep._spin;
    if (sp) {
      for (const f in im.fx) im.fx[f] *= im.fx[f] > 0 ? sp.good : sp.bad;
      for (const id in im.hx) im.hx[id] *= im.hx[id] > 0 ? sp.good * sp.houses : sp.bad;
    }
    const season = ctx.season != null ? ctx.season : rep.season;
    let peak = 0;
    for (const f in im.fx) peak = Math.max(peak, Math.abs(im.fx[f]));
    for (const id in im.hx) peak = Math.max(peak, Math.abs(im.hx[id]));
    if (!peak) return [];
    const headline = peak >= CONST.HEADLINE_AT;
    rep.memory.push({ s: season, t: type, fx: im.fx, hx: im.hx, res: spec.residue,
                      hl: headline ? CONST.MEMORY_HALFLIFE * 2 : CONST.MEMORY_HALFLIFE, h: headline, g: im.grave || undefined });
    foldTail(rep);
    const sum = impactSummary(rep, im);
    const moved = [];
    for (const f in im.fx) moved.push({ audience: f, target: null, by: im.fx[f], headline: headline });
    for (const id in im.hx) moved.push({ audience: 'house', target: id, by: im.hx[id], headline: headline });
    moved.crowd = sum.crowd; moved.houses = sum.houses;
    return moved;
  }

  /**
   * §2.1 — past MEMORY_CAP acts the oldest are folded into the base at their present value, so a save file does not
   * grow without bound and a century of history is not a century of list.
   */
  function foldTail(rep) {
    if (rep.memory.length <= CONST.MEMORY_CAP) return;
    rep.memory.sort((a, b) => a.s - b.s);
    const excess = rep.memory.splice(0, rep.memory.length - CONST.MEMORY_CAP);
    for (const m of excess) {
      for (const f in (m.fx || {})) rep.base.factions[f] = (rep.base.factions[f] || 0) + m.fx[f] * decay(m, rep.season, HALFLIFE[f]);
      for (const id in (m.hx || {})) rep.base.houses[id] = (rep.base.houses[id] || 0) + m.hx[id] * decay(m, rep.season);
    }
  }

  /** What an audience remembers, heaviest first — for the viewer. `audience` a faction, or 'house' with an id. */
  function why(rep, audience, targetId, limit) {
    const out = [];
    for (const m of rep.memory) {
      const v = audience === 'house' ? (m.hx || {})[targetId] : (m.fx || {})[audience];
      if (!v) continue;
      const hl = audience === 'house' ? null : HALFLIFE[audience];
      out.push({ season: m.s, act: m.t, at: v, now: v * decay(m, rep.season, hl), headline: m.h });
    }
    out.sort((a, b) => Math.abs(b.now) - Math.abs(a.now) || b.season - a.season);
    return limit ? out.slice(0, limit) : out;
  }

  /* §2.4 THE STANDS FOLLOW THE SHOW. Each season the shares move toward the factions that are warm and away from the
     cold ones — the Diehards barely — so an OA that feeds blood for three years has Bloodhounds in its stands. */
  function shiftShares(rep) {
    const raw = {};
    for (const f of FACTIONS) {
      const w = (standing(rep, f) - CONST.STANDING_MID) / CONST.STANDING_MID;
      const k = CONST.SHARE_SHIFT * (f === 'diehards' ? 0.25 : 1);
      raw[f] = (rep.shares[f] || 0) * Math.max(0.2, 1 + k * w);
    }
    rep.shares = normShares(raw);
    return rep.shares;
  }

  /* ================================================================================
     §4 — fame
     ================================================================================ */

  /** §4.2 — killing or capturing a famous fighter moves a share of their fame. */
  function fameTransfer(victimFame, visibility) {
    const v = visibility == null ? 1 : clamp(visibility, 0, 1.5);
    return clamp((victimFame || 0) * CONST.FAME_KILL_TRANSFER * v, 0, CONST.FAME_CEIL);
  }

  function addFame(fighter, amount) {
    fighter.fame = clamp((fighter.fame || 0) + amount, CONST.FAME_FLOOR, CONST.FAME_CEIL);
    return fighter.fame;
  }

  /** §4.2 — between Divides the fleet forgets a person. */
  /* §PRESENCE (ruled) PRESENCE IS THE FAME STAT. A hand the crowd can see is made famous faster by the same
     work — every source of fame, not only a kill on the ground — and forgotten slower: at the top of the
     scale nearly twice the fame and held longer, at the bottom a third of it and gone sooner. */
  function presenceFameMult(f) {
    const pres = (f && f.stats && f.stats.presence) || 90;
    return clamp(1 + ((pres - 90) / 110) * CONST.PRESENCE_FAME, CONST.PRESENCE_FAME_MIN, CONST.PRESENCE_FAME_MAX);
  }
  /** fame a fighter earns, for any reason: what the work is worth, times how visible they are */
  function earnFame(f, amount) {
    if (!f) return 0;
    const got = amount > 0 ? amount * presenceFameMult(f) : amount;
    f.fame = clamp((f.fame || 0) + got, CONST.FAME_FLOOR, CONST.FAME_CEIL);
    return got;
  }
  function decayFame(roster) {
    for (const f of roster) {
      const pres = (f.stats && f.stats.presence) || 90;
      const keep = clamp(CONST.FAME_DECAY + ((pres - 90) / 110) * CONST.PRESENCE_FAME_KEEP, 0.70, 0.97);
      f.fame = clamp((f.fame || 0) * keep, CONST.FAME_FLOOR, CONST.FAME_CEIL);
    }
    return roster;
  }

  /* ================================================================================
     §5 — placement
     ================================================================================ */

  /**
   * §5.1 — your finish is fixed the moment your banner stops standing, and the last banner
   * standing is first. So the first corp to sell finishes last, and a corp wiped out fighting
   * on day three finishes above a corp that sold on day two.
   *
   * `fallen` is every corp that stopped standing, EARLIEST FIRST. `winner` is the last banner.
   * `disqualified` take the bottom slots, earliest disqualification worst of all.
   */
  function placements(fallen, winner, disqualified, total) {
    const dq = disqualified || [];
    const n = total || (fallen.length + 1 + dq.length);
    const out = {};
    let slot = n;
    for (const id of dq) { out[id] = slot; slot--; }        // below last (R18)
    /* The winner is placed first BY BEING THE WINNER, not by the order they stopped standing.
       This numbered every fallen banner from last upwards and then stamped `1` on the winner
       afterwards — so whenever the winner also appeared in the fallen list, which happens when
       a banner is carried by the settlement rather than by being the last one up, two corps
       held first place and one place number went missing entirely. Measured: 1,1,2,3,4,6,7,8.
       It sat here undetected because the guard that checks it could only fail loudly once
       something else changed the outcome. */
    for (const id of fallen) {
      if (out[id] != null) continue;
      if (winner && id === winner) continue;
      out[id] = slot; slot--;
    }
    if (winner) out[winner] = 1;
    return out;
  }

  /* ================================================================================
     §6 — the board
     ================================================================================ */

  /** §6.1 — the stores drain every season and are refilled by what comes home. */
  function drainHolds(rep, scale) {
    const s = scale == null ? 1 : scale;
    for (const c of CATEGORIES) {
      /* the year's fall is taken monthly now (drainHolds); what remains here is the share for
         any season a caller settles without stepping its months */
      rep.holds[c] = clamp((rep.holds[c] || 0) - CONST.HOLDS_DRAIN * s * (rep._drainedThisYear ? 0 : 1), 0, CONST.HOLDS_CEIL);
    }
    return rep.holds;
  }


  /** What a Divide brought home. §UNITS `banked` is { category: SHARE OF A HOLD } — the thing
      a manager actually receives, with no invented middle unit between the ground and the
      store. It was a count of "crates" read here as though it were already a share, so one
      crate filled a warehouse that takes eight years to drain; the crate is gone and the sites
      yield the share directly (see `divide.js yieldOf`). */
  /* §PRIZE and what a store cannot hold is SOLD. The haul goes to the OA's own stores; only
     what spills over a full hold is sold on to the fleet — which is what the settlement's own
     comment always said, and not what it did: every dug unit was stored AND sold in full, so a
     site paid twice for the same haul. `fillHolds` returns the overflow, by store, and the
     season sells it. */
  function fillHolds(rep, banked) {
    const spilled = {};
    for (const c of CATEGORIES) {
      const want = (rep.holds[c] || 0) + ((banked && banked[c]) || 0);
      rep.holds[c] = clamp(want, 0, CONST.HOLDS_CEIL);
      if (want > CONST.HOLDS_CEIL) spilled[c] = want - CONST.HOLDS_CEIL;
    }
    rep._spilled = spilled;
    return rep.holds;
  }

  /**
   * §6.2 — the card. Five or six demands, one of them the priority, drawn against what the
   * corp is SHORT OF rather than what it is famous for (R14). Identity set where the holds
   * started; need sets what is asked for, and after two or three seasons no author is
   * deciding anything.
   */
  function goalCard(rep, planet, rng, opts) {
    opts = opts || {};
    const want = CONST.GOAL_DEMANDS[0] + (P.chance(rng, 0.5) ? 1 : 0);
    const pool = [];
    /* RE-DERIVED DURING IMPLEMENTATION. The first version put one resource demand on the card
       for EVERY category a corp was short of, at triple weight — which made resource asks
       nearly half of all demands. Measured, 61% of corps come home from a Divide having dug
       nothing at all out of the ground: there are about seven assay sites, eight corps, and
       most of them spend the month fighting instead. So a resource demand failed 96% of the
       time and eight boards sacked eight managers inside three seasons.
       A board asks for ONE thing out of the ground, for the thing it is shortest of that the
       planet actually carries, and one measure of it satisfies. */
    const shortages = CATEGORIES.slice().sort((a, b) => (rep.holds[a] || 0) - (rep.holds[b] || 0));
    for (const cat of shortages) {
      const there = (planet && planet.composition || []).filter(r => r.category === cat);
      if (!there.length) continue;
      const pick = there.slice().sort((a, b) => b.density - a.density)[0];
      /* THE DEMAND IS IN UNITS, and it was in stores. `amount` was a fraction of a store
         (1/9) while `banked` counts assay units, so the test compared 3 units against 0.11
         and every resource demand on every card passed the moment a corp dug anything. The
         board asks for a share of a store IN THE UNITS THAT FILL IT. */
      const want = Math.max(1, Math.round(CONST.UNITS_PER_STORE * CONST.RESOURCE_ASK));
      pool.push({ weight: 2.2 * (1 - (rep.holds[cat] || 0)), demand: {
        kind: 'resource', category: cat, resource: pick.id, units: want, amount: want
      } });
      break;                                    /* one, not one per shortage */
    }
    const standingNow = standing(rep, 'houses');
    /* THE CARD SCALES WITH WHERE THE CORP STANDS NOW, not only with what it was born as.
       `opts.expect` is the profile's anchor — what this board would ask of a corp at even
       standing. What it actually asks moves with the patience already banked: a board that
       has been delighted three years running expects more, and a board that has watched the
       same manager fail expects less and is easier to satisfy. Without this the demand is a
       fixed handicap, and measured over ten seasons the strongest corp bled patience from 70
       to 21 while the weakest climbed to the ceiling and stayed there, because neither card
       ever moved. */
    const anchor = opts.expect || 5;
    let ambition = clamp(Math.round(anchor - (rep.patience - CONST.AMBITION_PIVOT) / CONST.AMBITION_SCALE),
                           1, 8);
    /* §SNOWBALL A CHAMPION'S BOARD RAISES THE BAR: an OA that finished in the top three last year is asked to finish
       at least as high again — the champion's board wants the title again — so defending is harder than winning */
    if (opts.lastPlace && opts.lastPlace <= 3) ambition = Math.min(ambition, opts.lastPlace);
    rep.ambition = ambition; rep.anchor = anchor;
    pool.push({ weight: 2.4, demand: { kind: 'placement', at: ambition } });
    pool.push({ weight: opts.lastPlace === 1 ? 2.0 : ambition <= 2 ? 0.9 : 0.25, demand: { kind: 'win' } });
    /* THE SURPLUS DEMAND LEFT THE CARD. "End the year N up" and the standing Spending demand
       read the same money two ways, and a card that asks twice for one thing is a card with
       one fewer ask. Spending grades it every year on its own spectrum. */
    /* THE LOSSES DEMAND LEFT THE CARD. "Lose no more than N for good" measured the same thing
       the standing Casualties demand grades on a spectrum every year; two readings of one
       number is not a spread of asks. The bag is smaller, so a seed's card draws differently
       than it did; the verdict cuts below are anchored to a score distribution that this
       moves, and want re-measuring. */
    pool.push({ weight: rep.patience < 45 ? 2.0 : 1.0, demand: { kind: 'stipend' } });
    pool.push({ weight: standingNow < 50 ? 1.6 : 0.8,
                demand: { kind: 'standing', audience: 'houses',
                          above: Math.round(Math.min(90, standingNow + 3)) } });
    /* two more that a corp of any size can actually satisfy, so a card is a spread of
       achievable asks rather than a list of long shots */
    pool.push({ weight: 1.2, demand: { kind: 'standing', audience: 'crowd',
                                       above: Math.round(Math.min(90, standing(rep, 'crowd') - 2)) } });

    /* One demand per KIND. The first version padded a thin card with a second `losses` and a
       second `standing` entry, and boards duly asked for "no more than 13 of ours" and "no
       more than 15 of ours" on the same card — which is not a spread of asks, it is one ask
       printed twice with the easier number making the harder one free. */
    const demands = [];
    const bag = pool.slice();
    const taken = {};
    while (demands.length < want && bag.length) {
      const idx = weightedIndex(rng, bag);
      const d = bag[idx].demand;
      bag.splice(idx, 1);
      const key = d.kind === 'standing' ? 'standing:' + d.audience : d.kind;
      if (taken[key]) continue;
      taken[key] = true;
      demands.push(d);
    }
    rep.goal = { season: rep.season, demands: demands, priority: 0 };
    /* the priority is the thing the board actually cares about, said out loud */
    rep.goal.priority = Math.floor(rng() * demands.length);

    /* R25 — THE STANDING DEMANDS.
     *
     * The card was five or six discrete asks scored met/unmet, and it had no way to say
     * *this rock is not worth much to us, keep it cheap*. So a board always wanted you to try
     * to win, a small cheap force was always a handicap and never a plan, and the choice to
     * field sixteen instead of twenty-four existed on paper only — measured, 86 of 96
     * corp-seasons fielded the full twenty-four and the ten that did not were corps that could
     * not fill one.
     *
     * These are not met or unmet. They are judged on a spectrum every season, they are always
     * on the card, and the largest is what you spent. Come in under what the board expected to
     * pay and it warms to you; overspend and it cools, whatever else you achieved. A board with
     * little interest in this planet weights thrift heavily, which is what finally makes a
     * small well-armed force a way to please somebody rather than a way to lose slowly.
     *
     * It works identically for a human manager and a computer one — nobody needs a special
     * "field small" behaviour bolted on, they are both just answering the same board.
     */
    const interest = planet && planet.pot ? clamp01((planet.pot.richness - 0.7) / 0.7) : 0.5;
    /* §5.3 POPULARITY IS A STANDING DEMAND. The gate is the board's money too, and an OA
       the fleet will not watch is an OA the board cannot sell: what the crowd thinks is
       graded every year beside the spending and the casualties. */
    rep.goal.standing = [
      { kind: 'thrift', weight: CONST.STANDING_THRIFT_W * (1 - interest) + 0.35,
        expected: 1.0 },
      { kind: 'care', weight: CONST.STANDING_CARE_W },
      { kind: 'popularity', weight: CONST.STANDING_POPULARITY_W, expected: CONST.POPULARITY_NEUTRAL }
    ];
    rep.goal.interest = interest;
    return rep.goal;
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /**
   * A standing demand returns a number in [-1, +1] rather than a yes or a no.
   * `spendRatio` is what the corp actually laid out against what the board expected;
   * `lossRate` is permanent losses as a share of the force it sent.
   */
  function standingScore(s, outcome) {
    if (s.kind === 'thrift') {
      const r = outcome.spendRatio != null ? outcome.spendRatio : 1;
      /* 1.0 is exactly what was expected: neutral. Half of it is a delighted board. */
      return Math.max(-1, Math.min(1, (s.expected - r) / 0.5));
    }
    if (s.kind === 'care') {
      const r = outcome.lossRate != null ? outcome.lossRate : 0.3;
      return Math.max(-1, Math.min(1, (CONST.CARE_NEUTRAL_LOSS - r) / CONST.CARE_NEUTRAL_LOSS));
    }
    if (s.kind === 'popularity') {
      /* what the crowd thought of the OA this year (0..100), against what a board takes for granted */
      const v = outcome.popularity != null ? outcome.popularity : (s.expected || 0);
      return Math.max(-1, Math.min(1, (v - (s.expected || 0)) / CONST.POPULARITY_SPAN));
    }
    return 0;
  }

  function weightedIndex(rng, bag) {
    let total = 0;
    for (const e of bag) total += Math.max(0.01, e.weight);
    let r = rng() * total;
    for (let i = 0; i < bag.length; i++) {
      r -= Math.max(0.01, bag[i].weight);
      if (r <= 0) return i;
    }
    return bag.length - 1;
  }

  /** Was a demand met? `outcome` is what the season actually produced. */
  function demandMet(d, outcome, rep) {
    switch (d.kind) {
      case 'resource':  return ((outcome.banked || {})[d.category] || 0) >= (d.units != null ? d.units : d.amount);
      case 'placement': return (outcome.placement || 99) <= d.at;
      case 'win':       return !!outcome.won;
      case 'surplus':   return (outcome.surplus || 0) >= d.amount;
      case 'losses':    return (outcome.permanentLosses || 0) <= d.max;
      case 'stipend':   return (outcome.calls != null ? outcome.calls : rep.calls) === 0;
      case 'standing':  return standing(rep, d.audience) >= d.above;
      default:          throw new Error('reputation: unscoreable demand ' + d.kind);
    }
  }

  /** §6.3 — the priority counts twice. */
  function scoreGoal(rep, outcome) {
    const g = rep.goal;
    if (!g) return { met: 0, total: 0, fraction: 0, lines: [] };
    let met = 0, total = 0;
    const lines = [];
    g.demands.forEach((d, i) => {
      const w = i === g.priority ? 2 : 1;
      const ok = demandMet(d, outcome, rep);
      total += w; if (ok) met += w;
      lines.push({ demand: d, priority: i === g.priority, met: ok });
    });
    /* R25 — and the standing demands, which are not met or unmet. Each returns a number in
       [-1, +1] and contributes its weight in both directions, so a board can be pleased by a
       thrifty year that achieved little and annoyed by an expensive one that achieved a lot. */
    const standingLines = [];
    for (const s of (g.standing || [])) {
      const v = standingScore(s, outcome);
      total += s.weight;
      met += s.weight * (v + 1) / 2;       /* -1 scores nothing, +1 scores the full weight */
      standingLines.push({ demand: s, standing: true, value: v, met: v > 0 });
    }
    return { met: met, total: total, fraction: total ? met / total : 0,
             lines: lines.concat(standingLines) };
  }

  /** §6.3/§6.4 — what the board makes of it, cushioned by your own ships. */
  function movePatience(rep, score) {
    /* `content` was GOAL_CONTENT/6 — four demands met out of six — which stopped meaning
       anything the moment the card became three or four discrete asks plus two standing ones.
       Left derived, it sat at 0.667, exactly the median score, so half the fleet fell below it
       every season and all eight corps drifted down together. It is a stated number now. */
    /* R25b — THE VERDICTS HAVE TO MATCH THEIR OWN NAMES.
     *
     * These thresholds were magic numbers set against a score distribution that has since
     * stopped existing twice over — once when the card gained its standing demands, and again
     * when the grid became the engagement model and pushed the fleet's loss rate from 0.398 to
     * 0.496. Measured against them: "asking questions" and "unhappy" together were **27% of
     * all corp-seasons**, and "delighted" was 0%. A board was more likely to be furious than
     * pleased, patience drained at two points a season across the whole fleet, and every corp
     * in the league trended the same way — which is what S7 catches.
     *
     * A verdict named "asking questions" has to be rare or it is not a warning, it is the
     * weather. The cuts are anchored to the measured distribution of card scores so the words
     * mean roughly what they say: delighted is the top twentieth, content is about half, and
     * the bottom two together are a twentieth. */
    const f = score.fraction, content = CONST.GOAL_CONTENT_FRACTION;
    const B = CONST.BOARD_CUTS;
    let delta;
    if (f >= B.delighted) delta = 14;
    else if (f >= B.pleased) delta = 7;
    else if (f >= content) delta = 1;
    else if (f >= B.disappointed) delta = -8;
    else if (f >= B.unhappy) delta = -16;
    else delta = -26;
    let band = delta >= 7 ? 'delighted' : delta >= 1 ? (delta === 1 ? 'content' : 'pleased')
             : delta >= -8 ? 'disappointed' : delta >= -16 ? 'unhappy' : 'asking questions';
    if (delta === 14) band = 'delighted'; else if (delta === 7) band = 'pleased';
    if (delta > 0) {
      /* CREDIT IS SCALED BY WHAT WAS ASKED.
         §6.1a made the card soften as patience falls, which was right and had a consequence
         that had to be constructed to be seen: a corp on the floor got the easiest possible
         card, cleared it by merely turning up, and gained patience every season forever. The
         bottom became an attractor and dismissal became unreachable — the fail state S12
         hangs the whole career on could not fire at all.
         Meeting a trivial ask is therefore worth almost nothing. A corp at the floor can hold
         station; it cannot climb out without being asked for something and delivering it. */
      /* measured against the ANCHOR, not against zero: a corp asked for exactly what its
         board would ask at even standing earns full credit, so the middle of the range is
         neutral and the fleet does not bleed. Only the discount a FALLEN corp gets — a card
         softened below its own anchor — is worth less to clear. */
      const slack = (rep.ambition != null ? rep.ambition : 5) - (rep.anchor != null ? rep.anchor : 5);
      const ease = clamp(slack, 0, CONST.EASY_CARD_SPAN) / CONST.EASY_CARD_SPAN;
      delta *= (1 - CONST.EASY_CARD_DISCOUNT * ease);
    }
    if (delta < 0) {
      /* a manager the crowd loves is hard to sack for the same result */
      delta *= (1 - CONST.HOME_CUSHION * Math.max(0, standing(rep, 'crowd') - CONST.STANDING_MID) / CONST.STANDING_MID);
    }
    rep.patience = clamp(rep.patience + delta, CONST.PATIENCE_FLOOR, CONST.PATIENCE_CEIL);
    return { delta: Math.round(delta * 10) / 10, band: band, patience: rep.patience };
  }

  /**
   * §6.5 — the money is always there, and taking it is what gets you sacked. This is where
   * the difficulty gradient lives: the hardest start is not the one that ends its seasons
   * poorest, it is the one that has to keep asking.
   */
  function callOnBoard(rep, amount) {
    if (!(amount > 0)) return { amount: 0, patienceCost: 0, patience: rep.patience };
    const cost = CONST.CALL_PATIENCE_RATE * (amount / 10000)
               * (1 + CONST.CALL_ESCALATOR * rep.calls);
    rep.calls++;
    rep.patience = clamp(rep.patience - cost, CONST.PATIENCE_FLOOR, CONST.PATIENCE_CEIL);
    return { amount: amount, patienceCost: Math.round(cost * 100) / 100, patience: rep.patience };
  }

  /* ================================================================================
     §11 — the mercenary price. A price, not an audience.
     ================================================================================ */

  function recordCasualties(rep, permanent, famous) {
    rep.casualties.push({ season: rep.season, permanent: permanent || 0, famous: famous || 0 });
    return rep;
  }

  /** Recency-weighted permanent losses per Divide. */
  function mercIndex(rep) {
    let num = 0, den = 0;
    for (const c of rep.casualties) {
      const w = Math.pow(0.5, Math.max(0, rep.season - c.season) / CONST.MERC_INDEX_HALFLIFE);
      num += w * (c.permanent + c.famous * 2);   // spending a famous fighter costs more
      den += w;
    }
    return den ? num / den : 0;
  }

  /** What the market charges this corp, against what it charges the fleet. */
  function mercPriceMult(rep, fleetMean) {
    const m = fleetMean > 0 ? fleetMean : 1;
    const idx = mercIndex(rep);
    return clamp(1 + CONST.MERC_PRICE_SWING * (idx - m) / m, 0.6, 1.8);
  }

  /* ================================================================================
     §8 — the address
     ================================================================================ */

  /* §8.2 — the question is drawn from what actually happened; the answers come from a
     standing vocabulary reused across every event, so the content is authored once. */
  const QUESTIONS = [
    { id: 'sold_early',  when: o => o.ceded && o.cededDay <= 5,
      ask: "You had a full roster and you sold your claim in the first week. What do you say to the people who paid to watch?" },
    { id: 'sold_late',   when: o => o.ceded,
      ask: "You took the deal. Was there a point where you knew you were going to?" },
    { id: 'wiped',       when: o => o.permanentLosses >= 14,
      ask: "You lost most of the people you dropped with. Was it worth it?" },
    { id: 'won',         when: o => o.won,
      ask: "The planet is yours. Who paid for it?" },
    { id: 'near_miss',   when: o => o.placement === 2,
      ask: "Second. Closer than anyone expected. Does that count for anything?" },
    { id: 'lost_famous', when: o => o.famousLosses > 0,
      ask: "You went down there with a name the fleet knew, and you came back without them." },
    /* §ADDRESS a third place got asked what changes after "another finish outside the frame": the fallback was
       written for a poor year and asked of every year that was not a win or a loss. A good finish gets its own. */
    { id: 'placed',      when: o => o.placement != null && o.placement <= 3,
      ask: "On the podium, and the people who paid to watch want to know if that was the ceiling or the floor." },
    { id: 'quiet',       when: () => true,
      ask: "Another Divide, another finish outside the frame. What changes next year?" }
  ];

  /** What the press ask this corp, given what its Divide actually was. */
  function question(outcome) {
    for (const q of QUESTIONS) if (q.when(outcome || {})) return q;
    return QUESTIONS[QUESTIONS.length - 1];
  }

  /**
   * §8.2 — the six registers, always all six. None is correct; each is the right answer to
   * some situation and the wrong answer to another. A manager is never scored on delivery,
   * because the manager is not a character with stats — what they choose is a stance, and
   * the audiences do the rest.
   *
   * `speaker` is optional: the fighter or captain put in front of the drones. The traits
   * written for exactly this and read by nothing until now change what the register lands as.
   */
  function address(rep, register, ctx) {
    ctx = ctx || {};
    if (REGISTERS.indexOf(register) < 0) throw new Error('reputation: no such register ' + register);
    const type = 'said_' + register;
    const sp = ctx.speaker || null;
    /* Read by HOOK. `ctx.hooks` is a Set supplied by the caller, who has the trait index;
       this module deliberately does not load traits.json. */
    const h = ctx.hooks || new Set();
    let amp = 1;
    if (h.has('media_statement_impact_amplified')) amp *= 1.6;   // every line fits a chyron
    if (h.has('media_statements_flat')) amp *= 0.45;             // and both clips are famous
    if (h.has('rare_quote_fame_spike')) amp *= 1.3;
    if (h.has('fame_volatility_up')) amp *= 1.4;
    if (h.has('fame_gain_down')) amp *= 0.6;
    /* fame carries a statement further: the fleet hears a name it knows */
    if (sp) amp *= 1 + 0.5 * ((sp.fame || 0) / CONST.FAME_CEIL);
    const moved = act(rep, type, { mult: amp, targetId: ctx.targetId, season: ctx.season });
    return { register: register, amplified: amp, moved: moved };
  }

  /**
   * §8.3 — some answers do something beyond moving an audience. Only the consequences this
   * step can HONOUR are listed as available: benching a fighter means nothing while rosters
   * are regenerated every Divide, so it is designed (§8.3) and deliberately not offered here.
   * A choice that quietly does nothing is the failure this project keeps catching.
   */
  function addressOptions(rep, outcome) {
    return REGISTERS.map(function (r) {
      const sum = impactSummary(rep, impact(rep, 'said_' + r, {}));
      return { register: r, moves: { crowd: sum.crowd, houses: sum.houses } };
    });
  }

  /* ================================================================================
     the season boundary — the only thing in the project that crosses one
     ================================================================================ */

  function openSeason(rep, planet, rng, opts) {
    rep.calls = 0;
    drainHolds(rep, (opts && opts.drainScale) || 1);
    goalCard(rep, planet, rng, opts);
    return rep;
  }

  /* §2.3 EVERY AUDIENCE DRIFTS BACK toward what it expects of an OA. Without it the sums
     ratchet: a good year is carried for ever and a bad one never forgiven, whatever happens
     after. The drift moves the BASE, so it is the OA's resting place that changes and the
     memory stays what it was. */
  /** §6.1 a month's share of the year's fall, so a hold empties in bites a manager can watch */
  function drainHolds(rep) {
    for (const c of CATEGORIES) {
      rep.holds[c] = clamp((rep.holds[c] || 0) - CONST.HOLDS_DRAIN / CONST.HOLDS_DRAIN_MONTHS, 0, CONST.HOLDS_CEIL);
    }
    rep._drainedThisYear = true;
  }
  function drift(rep) {
    /* THE RESTING PLACE IS WHERE AN OA STARTED: what drifts is the memory — each season the accumulated feeling loses a
       share of itself, so an old triumph stops carrying an OA for ever and an old disgrace stops damning it */
    for (const m of rep.memory) {
      for (const f in (m.fx || {})) m.fx[f] *= (1 - CONST.DRIFT);
      for (const id in (m.hx || {})) m.hx[id] *= (1 - CONST.DRIFT);
    }
  }
  /** §2.3 a month passes: every feeling fades a little, so warmth is what an OA has done lately */
  function fade(rep) {
    const k = 1 - CONST.MONTHLY_FADE;
    for (const m of rep.memory) {
      for (const f in (m.fx || {})) m.fx[f] *= k;
      for (const id in (m.hx || {})) m.hx[id] *= k;
    }
  }
  function closeSeason(rep, outcome) {
    shiftShares(rep);                  /* the stands follow the show, before the year's feeling fades */
    drift(rep);
    const score = scoreGoal(rep, outcome || {});
    const moved = movePatience(rep, score);
    fillHolds(rep, (outcome && outcome.banked) || {});
    recordCasualties(rep, (outcome && outcome.permanentLosses) || 0,
                          (outcome && outcome.famousLosses) || 0);
    rep.history.push({ season: rep.season, placement: (outcome && outcome.placement) || null,
                       won: !!(outcome && outcome.won) });
    rep.season++;
    return { score: score, board: moved };
  }

  const api = {
    CONST, ACTS, AUDIENCES, FACTIONS, QUALITIES, TASTE, HALFLIFE, CATEGORIES, REGISTERS, DISPOSITION,
    open, standing, readAll, act, impact, impactSummary, why, decay, foldTail, soft, drift, drainHolds,
    openingShares, normShares, tasteOf, tasteOfShares, setHouseTastes, shiftShares, fade,
    fameTransfer, addFame, decayFame, presenceFameMult, earnFame,
    placements,
    drainHolds, fillHolds, goalCard, demandMet, scoreGoal, movePatience, callOnBoard,
    recordCasualties, mercIndex, mercPriceMult,
    QUESTIONS, question, address, addressOptions, standingScore,
    openSeason, closeSeason
  };
  if (isNode) module.exports = api;
  global.CDREP = api;
})(typeof window !== "undefined" ? window : globalThis);
