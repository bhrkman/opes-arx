/* Capital Divide — /sim/divide.js  (Step 4)
 *
 * The day loop that sits above combat. Implements DIVIDE.md end to end:
 *   §2 shape and comms windows · §4 the tick · §5 movement, supply, hazards, camp
 *   §6 encounters · §7 declared stance · §8 captain stress · §9 objectives · §10 closures
 *
 * The declared stance governs FIGHT SELECTION here (D1). What happens once shooting
 * starts belongs to combat.js, which no longer knows what a stance is beyond two nudges.
 *
 * Pure logic: no DOM, no Math.random, no I/O. Seed ⇒ identical Divide, map included.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./prng.js") : global.CDPRNG;
  const MAP = isNode ? require("./map.js") : global.CDMAP;
  const C = isNode ? require("./combat.js") : global.CDCOMBAT;
  /* [E10] the engagement model. `combat.js` above is the shared library it calls into. */
  const TACTICAL = isNode ? require("./tactical.js") : global.CDTACTICAL;
  const ROSTER = isNode ? require("./roster.js") : global.CDROSTER;
  const ITEMS = isNode ? require("./items.js") : global.CDITEMS;
  const NEG = isNode ? require("./negotiate.js") : global.CDNEG;
  const LED = isNode ? require("./ledger.js") : global.CDLEDGER;
  const REP = isNode ? require("./reputation.js") : global.CDREP;
  /* the numbered landings the draft deals; the drop reads them so a pick means the ground the
     manager pointed at (predivide depends on prng, map and reputation — no cycle back here) */
  const GROUND = isNode ? require("./ground.js") : global.CDGROUND;
  const CONTEST = isNode ? require("./contest.js") : global.CDCONTEST;
  /* the standings an OA holds, which reach the yard as a discount and the drop as its rations */
  const SPON = isNode ? require("./sponsors.js") : global.CDSPONSORS;

  /* ------------------------------------------------------------------ */
  /* §7.1 the six selection dials — the mechanism                        */
  /* ------------------------------------------------------------------ */

  /* The poles are pulled in from where DIVIDE_POLICY.md first put them. A preservationist
     corp is careful, not absent: at seek 0.10 they simply never appeared, which made the
     careful pole a way of not playing rather than a way of playing differently. */
  const STANCE_DIALS = {
    preservationist: { seek: 0.15, accept: 0.38, ground: 0.56, contest: 0.26, zoneRisk: 0.10 },
    measured:        { seek: 0.28, accept: 0.56, ground: 0.71, contest: 0.46, zoneRisk: 0.26 },
    standard:        { seek: 0.45, accept: 0.75, ground: 0.85, contest: 0.70, zoneRisk: 0.45 },
    unyielding:      { seek: 0.64, accept: 0.88, ground: 0.96, contest: 0.86, zoneRisk: 0.66 },
    death_or_glory:  { seek: 0.80, accept: 0.96, ground: 1.00, contest: 0.96, zoneRisk: 0.88 }
  };

  const NOTCHES = ['preservationist', 'measured', 'standard', 'unyielding', 'death_or_glory'];
  /* §STANCE ONE CONTROL, NOT TWO. A manager set a stance for the whole contest and then, on top
     of it, a 1–5 leaning at each rival — two dials saying nearly the same thing, and the second
     rarely mattered because an OA meets two or three of the seven in a Divide. RULED: the
     stance IS the leaning. A manager sets a notch AT EACH OA, and the five notches are the five
     stances the game already had, read against one OA instead of against the world: Avoid ·
     Wary · Engage · Press · All In. `corp.policy` remains the OA's DECLARED stance — its
     culture, what the board hears, and what it falls back on toward anyone it has said nothing
     about — so its own conduct (how it plans, how it marches, what it risks at the wall) still
     reads off its temperament. */
  const NOTCH_WORDS = { preservationist: 'Avoid', measured: 'Wary', standard: 'Engage',
                        unyielding: 'Press', death_or_glory: 'All In' };
  /* §STANCE A SQUAD HAS ITS OWN. The stance was a dial set once for the whole contest and then
     aimed at each rival — and measured, aiming it at a rival bought a tenth of a fight: a
     meeting needs only one side to want it, so "avoid them" was a preference the contest
     ignored. What a stance really shapes is how a squad SPENDS ITS DAY — how fast it moves,
     how near the wall it works, whether it takes a site off somebody, whether it goes looking
     — and that is a property of a squad, not of a relationship. RULED: every squad carries its
     own notch. Alpha hunts while Charlie keeps its head down, and the trade is real, because
     pace now buys or costs sight (§7.6): a squad that holds still sees 4.4x what a marching one
     does. A squad that has been told nothing falls back on its OA's declared stance. */
  function squadStance(sq) {
    const v = sq && sq.stance;
    return (v && STANCE_DIALS[v]) ? v : (sq && sq.corp && sq.corp.policy) || 'standard';
  }
  function squadDials(sq) { return STANCE_DIALS[squadStance(sq)]; }
  /* §ALEAS THE CASES, THE FAVOURS AND DISQUALIFICATION ARE GONE (ruled). Nothing on the ground is
     banned — it is a blood sport — so there is nothing to film, nothing to pay the Aleas to lose, and nobody
     to put off the field for it. */
  /* §CHARGES a fighter's charges for the Divide, from the items in its stores: each item carries
     its own number (items.json `charges`; the stronger, the fewer). `keep` tops up only the items
     newly added (a crate opened) and leaves what has been spent spent; without it every charge
     is refilled to full (a munitions drop, or the drop itself). */
  function chargeUp(f, keep) {
    const full = {};
    for (const id of ((f.loadout || {}).consumables || [])) {
      const it = ITEMS.byId(id);
      full[id] = (full[id] || 0) + ((it && it.charges) || 1);
    }
    if (!keep || !f._charges) { f._charges = full; return; }
    for (const id in full) if (f._charges[id] == null) f._charges[id] = full[id];
  }
  function medkitCharges(bodies) {
    return (bodies || []).reduce((t, f) => t + ((f._charges || {}).itm_medkit || 0), 0);
  }
  function takeMedkitCharge(bodies) {
    for (const f of bodies) if (f._charges && f._charges.itm_medkit > 0) { f._charges.itm_medkit--; return; }
  }
  function setStance(corp, otherId, notch) {
    if (!STANCE_DIALS[notch]) return false;
    corp._stance = corp._stance || {};
    corp._stance[otherId] = notch;
    return true;
  }

  /* §7.3 doctrine — most corps do not move off their stance. Rigidity 100 = identity. */
  const DEFAULT_RIGIDITY = {
    nevlon_collective: 100, violets_enterprise: 95, knights_star: 80, new_line: 70,
    verdant_cradle: 55, mercy_concern: 40, alliance_house: 20, vantis_deepcore: 10
  };
  /* §7.3 — Nevlon's override is REMOVED (Step 6). It existed on the reasoning that Nevlon's
     lore treats negotiation as something that happens to other corps, and that this WAS the
     far pole's no-negotiation stance. That reasoning is void: refusing to deal is a corp
     identity carried in `oa_profiles.json → no_negotiation`, not a property of the notch.
     Nevlon reverts to the `engagement_lean` its own data has always stated, which closes
     half of [OPEN-E4] by deleting the disagreement rather than choosing a side.

     Consequence worth knowing when reading a per-notch table: no corp in the canon eight now
     declares death_or_glory, so the far pole appears only in homogeneous test fields. That is
     honest — it is an extreme a manager may declare, not an OA style anyone runs. */
  const STANCE_OVERRIDE = {
    alliance_house: 'unyielding'
  };

  /* §6.3 STANDING — the crowd's read on a corp, and the reason hunters pick their fights.
     Popularity comes from close fights against opponents worth beating (DESIGN.md §8), so
     picking off the weak or the timid earns almost nothing. This is a Step 7 placeholder:
     one scalar standing in for fame, sponsor value, and the odds board.

     The consequence is the one C9 always needed: a corp that hides has nothing worth
     taking off it, so nobody comes looking. Its safety is bought with irrelevance. */
  const STANCE_STANDING = {
    preservationist: 0.30, measured: 0.40, standard: 0.50, unyielding: 0.65, death_or_glory: 0.76
  };

  const CONST = {
    /* [C] §STANCE share of a side down before it pulls out, by stance (standard is the grid's own 35%) */
    STANCE_WITHDRAW_AT: { preservationist: 0.10, measured: 0.20, standard: 0.35, unyielding: 0.50, death_or_glory: 0.65 },
    STIM_NIGHT_COST: 5,                 // [C] §CONSUMABLES fatigue recovery a stim costs that night (its line)
    SITE_CASH_GUESS: 15000,             // [C] §WITHDRAWAL what a dug site pays, for pricing the ground left (the season passes its own SITE_CASH)
    LEAVE_OWN_RATE: 0.5,                // [C] §WITHDRAWAL how much an OA's own rate of loss so far (against the field's) shapes what it expects staying to cost
    /* §STANDING what the crowd does on the ground (ruled at the standing pass) */
    CROWD_DROP_MORALE: 12,              // [C] morale a crowd of 100 (or 0, the other way) sends down with every fighter
    UNDERDOG_MORALE: 6,                 // [C] a day's morale a warm, full-share Underdogs faction lends an OA past hope
    BLOODHOUND_FAME: 1.0,               // [C] how much further a kill's fame travels with a warm, full-share Bloodhounds faction
    LOOT_AIM_SLACK: 3,                  // [C] §LOOT a taken gun may shoot this much worse (Total Aim) than his own and still be taken
    /* §RANK what a captaincy changing hands is worth to a man who wanted it */
    RANK_SURGE: 8,                      // [C] off the stress of the one who takes it
    RANK_SNUB: 6,                       // [C] onto the stress of one passed over
    STORY_MOURNED: 1.50,                // [C] a company family's dead
    STORY_BLAME: 1.30,                  // [C] and a blame magnet wears it
    /* §PRESENCE what being a man the room looks at is worth */
    PRESENCE_STEADIES: 0.12,            // [C] and what the squad's steadiest hand lends a captain
    KESHU_FRICTION: 3,                  // [C] §KESHU what an old war costs a squad that holds
                                        //     both sides of it
    GRUDGE_COMP: 6,                     // [C] §GRUDGE what it is worth to face the OA that
                                        //     tried to buy you, for a man who remembers
    SQUAD_MAX: 8, SQUAD_MIN: 3,
    SQUADS_MAX: 6,                      // [S] §SQUADS the most an OA may field, as ruled
    SPREAD_BASE: 0.25,                  // [C] the net every OA casts before its dials (was a `greed` dial no profile has, read as 0.5 × 0.5)
    SPREAD_AGGRESSION: 0,               // [C] §FLANK (ruled) appetite for contact no longer spreads an OA thin: measured, a
                                        //     force split small loses whatever its stance (two squads 20% of titles, five 8%);
                                        //     the bold concentrate, and work their squads together (the strike planner)
    SPREAD_PATIENCE: 0.45,              // [C] against what a careful OA keeps massed         // [S] squads live inside these bounds. RULED: the
                                        // floor is THREE — it binds the manager's own squad
                                        // page, which reads it from here. The auto-deal's
                                        // arithmetic (two-squad minimum against an eight cap)
                                        // cannot produce a squad under five regardless, so
                                        // the old floor of five never actually bound anything.
    REFORM_AT: 3,                       // [C] below this the survivors are redistributed
    REST_TICKS_AFTER: 2,                // [C] §GROUND a squad that fought stands where it ended for this many ticks before it walks on
    REST_RECOVERY_MULT: 1.6,            // [C] a squad that rests the day recovers faster for it
    HARASS_WOUND_DAYS: 6,               // [C] §GROUND a body put down by fire across a zone is out this many days
    RELEASED_RECOVERY: 4,               // [C] §CAPTIVES a released captive walks home hurt: out at least this many days
    /* REMOVED in the Step 6 audit: WITHDRAW_TRIGGER_FRAC. DIVIDE.md quoted it as governing
       when a squad reads a threat as close, and no code had read it since the approach model
       was rebuilt. The doc entry goes with it. */
    KNOWN_STALE: 3,                     // [S] a sighting older than this is not information
    MAP_STALE: 8,                       // [S] but the manager's map keeps it, as last-known, this long
    /* §KNOW THE PICTURE. Ruled with the dispersed drop: every OA knows where every other
       came down — the draft is posted — and after that only what its own squads (and its
       banner's) have seen, where they saw it, until it goes stale. */
    LANDING_KNOWN_DAYS: 2,              // [S] the posted landings are current information this long
    /* §MIND THE CAPTAIN DECIDES, AND CAPTAINS DIFFER. Every squad weighed its choices with the
       same cold arithmetic, so a squad led by a brilliant tactician behaved exactly like one
       led by a frightened corporal. A captain now brings three things to the decision:
         JUDGEMENT (tactics) — how sharply the weighing favours the best answer. A poor captain
           draws nearly at random from what seems reasonable; a great one almost always takes
           the strongest need.
         SIGHT (fieldcraft, and what the OA knows) — how much of the picture the captain is
           actually weighing. A poor captain reads only what is close; a great one reads what
           the OA has seen, and reads it as it is.
         NERVE (resolve and presence) — whether the numbers are read hopefully or fearfully.
           A frightened captain sees more enemies than there are and fewer of his own.
       A captain also thinks further ahead the better he is: a plan he sets, he keeps. */
    MIND_LOW: 25, MIND_MID: 90, MIND_HIGH: 135,   // [C] the spread a roster's stats actually deal
    HUMAN_COMMAND: 0.12,                // [C] §RACES what a human's aptitude for command is worth
    JUDGE_MIN: 1.1, JUDGE_MAX: 3.4,     // [C] the sharpness the worst and best captains bring
    SIGHT_NEAR: 0.10,                   // [C] the ground a captain of 0 can weigh at all
    SIGHT_FAR: 0.55,                    // [C] and what a captain of 100 weighs
    PLAN_DAYS_MIN: 2, PLAN_DAYS_MAX: 6, // [C] how long a captain's plan stands before rethinking
    /* §UNITS §7.3 what a planet's whole endowment in ONE category is worth, as a share of a
       hold: a planet RICH in it can fill one from empty. A moderate planet lands near 0.40 and
       a slim one near 0.20 by its own `richness`, which map.js derives from the composition. */
    HOLD_RICH: 1.0,
    SITE_SHARE: 0.25,
    REST_HALVES: 0.5,         /* [H] §SITES what is left of each wound after a rest site */
    REST_STANDS_UNDER: 12,    /* [H] §SITES a wound it brings under this many days stands up */
    STRONGPOINT_PREP: 0.25,   /* [H] §SITES the ground a held strongpoint gives the one on it */         /* [H] §PRIZE what all of a planet's sites together carry of its
                                 endowment: the grab, beside the prize the winner takes */
    RATION_DROP_DAYS: 14,               // [C] §5.2 — cannot cover 30 days; you forage or claim
    RATION_PACK_DAYS: 6,                // [C] §5.2 — what a carried Field Rations pack adds for its bearer
    RATION_CARRY_DAYS: 14,              // [C] §5.2 — what one body can carry: foraging fills to this and no further
    /* §7.5 ELEVATION, read three ways */
    HIGH_GROUND_PREP: 0.25,             // [C] readiness edge for the side that came from the higher ground
    RATION_SHORT_AT: 3,                 // [S]
    FORAGE_YIELD: [0.08, 0.5, 1.05, 1.7],  // [C] rations/fighter/day by region forage class
    FORAGE_FIELDCRAFT: 0.003,           // [C] per point of fieldcraft over 100
    FORAGE_POSTURE_MULT: 1.6,           // [C]
    /* §5.3 HAZARDS ARE WEATHER. One condition over the whole planet for a day, drawn from the
       archetype's own list, each kind doing what its name says: a whiteout blinds, a storm
       slows, cold burns rations, a flood raises the water, a crevasse field or a gas vent
       hurts only the squads standing on that terrain. The old check rolled the same four
       effects per squad-day whatever the hazard was called. */
    WEATHER_P: 0.42,                    // [C] chance a day brings a hazard at all
    WEATHER_HURT_MULT: 1.0,             // [C] scales every terrain-bound injury chance
    /* A day is twelve ticks, six of light and six of dark, not two phases. Movement is
       subdivided (a squad covers a sixth of its march in each day tick) so the total ground
       covered is unchanged, but positions are sampled twelve times instead of twice — which
       is what turns near-misses into contact and lets a squad be drawn into two firefights
       between dawn and dusk. */
    TICKS_PER_DAY: 12,                  // [S]
    DAY_TICKS: 6,                       // [S] the fleet marches these; it camps for the rest
    HOURS_PER_TICK: 2,                  // [S] §LIGHT a block is two hours of the contest
    /* --- HOW LONG A FIREFIGHT TAKES ---
       A firefight used to take NO TIME AT ALL. Contact was detected on a tick, the whole
       engagement was fought to its conclusion inside that tick, and everyone involved was free
       to march again before the clock moved. That is why nothing could ever walk into a fight:
       there was no moment at which one was in progress. It also meant being in a battle cost a
       squad nothing but casualties — not an afternoon, not the ground the wall took while they
       were busy.
       A fight now occupies whole ticks, and longer fights occupy more of them. Measured over
       four contests, a firefight runs a median of 4 grid turns, 10 at the ninetieth percentile
       and 27 at the worst, so at six turns to the tick an ordinary engagement is one two-hour
       block, a hard one is two, and a grinding pin can swallow most of a working day. */
    FIGHT_TURNS_PER_TICK: 6,            // [H] grid turns that fit inside one two-hour block
    FIGHT_TICKS_MAX: 6,                 // [H] no engagement swallows more than half a day
    FATIGUE_RECOVERY: 14,               // [C] per night
    CELL_RECHARGE: 24,                  // [C] §6 energy cells, per night at camp
    UNTREATED_DEGRADE_DAYS: 3,          // [S] COMBAT.md §7.1
    DEGRADE_P: 0.55,                    // [C] a wound left in the field usually worsens
    /* §8.2 captain stress */
    STRESS: {
      killed: 4, downed: 1.5, overrun: 10, outnumbered: 3, stanceChange: 12,
      rationDry: 2, succession: 15, quietDay: -3, cleanWin: -5
    },
    STRESS_MAX: 100,
    /* §9 objectives */
    INTEL_CAP: 0.18,                    // [S] most readiness a season of scouting can buy
    BEACON_PREY: 0.5,                   // [C] §RESERVE how much more a squad on a lit beacon is worth going after
    BEACON_TICKS: 2,                    // [C] §RESERVE two-hour blocks a beacon must be held, uncontested, for one landing
    /* §RESERVE only an enemy ON the beacon stops a landing — the same radius as standing on a site — and any two enemy
       squads on one lit beacon are in contact (below). The first cut blocked from 0.04 against an engage range of 0.02,
       so a rival parked beside a beacon blocked every landing and could never be fought: a standoff by geometry. */
    RELAY_INTEL_DAYS: 5,                // [C]
    RESUPPLY_MULT: 1.75,                // [C] §9 what a claimed munitions site is worth
    /* §6.3 standing / target selection */
    STANDING_PER_ENGAGEMENT: 0.015,     // [C] fighting in public builds your reputation
    STANDING_PER_SITE: 0.050,           // [C] holding ground the crowd can see
    STANDING_MIN: 0.12, STANDING_MAX: 1.0,
    WEAK_TARGET_DISCOUNT: 0.55,         // [C] beating a shattered squad proves nothing
    /* §7 how near the closing edge each pole is willing to work (zoneRisk) */
    FORAGE_POOR: 0.18,                  // [C] ground the trait counts as poor
    FORAGE_IMMUNE_FLOOR: 0.25,          // [C] and what its carrier gets anyway
    STANCE_PULL_HURT: 2.6,              // [C] notches toward care, at total loss
    STANCE_PULL_PENNED: 1.1,            // [C] and toward aggression once the ring closes
    STANCE_PULL_AHEAD: 0.7,             // [C] an opening is worth taking
    RANSOM_ANSWER_WINDOWS: 2,           // [C] §TIME the windows a person has to answer a ransom before it lapses
    LEAVE_OVERTIME_GUESS: 6,            // [C] the days past the last ground an OA expects a contest to run
    UNDERDOG_FAME_PER_PLACE: 0.12,      // [C] §SNOWBALL fame for a kill, per place the victim's OA finished above the killer's
    UNDERDOG_FAME_FLOOR: 0.4,           // [C] and the least it falls to, hitting all the way down
    CHAMPION_FAME_BONUS: 0.5,           // [C] and half again on top for one of the champion's own
    BANNER_PULL_AT: 0.45,
    PULL_MARGIN: 0.25,                  // [C] §MARKET how far above the line a force's staying starts to lose its worth               // [C] §BASELINE (temporary) below this share standing, an OA's banner is pulled
    LEAVE_EARLIEST_DAY: 5,              // [C] before this an OA has seen too little of its own losses to price them: on the rebuilt ground the drop itself is the first two days' fighting, so the first window reads only the drop
    CEDE_STANDING_POINTS: 20,           // [C] §WITHDRAWAL the standing ceding costs, own and fleet together (4–14 + 5–18)
    STANDING_CREDIT: 2000,              // [H] a point of it in credits: about a year of gate (₡68/month) and its pull
                                        //     on prices, mercenaries and sponsors; an OA's pride scales it 0.5–1.5×
    STANCE_HYSTERESIS: 0.6,             // [C] §COMMAND how far its target must be from where an OA stands before it changes notch
  };

  /* ------------------------------------------------------------------ */
  /* Corp and squad construction                                         */
  /* ------------------------------------------------------------------ */


  /* ---------------------------------------------------------------- */
  /* Kit — PROCUREMENT.md §15                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Roles are handed out inside each squad, so every squad keeps the full spread, and the
   * job goes to the fighter suited to it: the marksman rifle to the best shot, the scout
   * kit to the best fieldcraft. Deterministic — no RNG is drawn anywhere in here.
   */
  /**
   * What this corp CAN and WILL bring, in credits a body. The Aleas ceiling is the same for
   * everyone (P1); this is how near it they get.
   *
   *   can  — locker depth scaled by their standing in the fleet, plus procurement money
   *   will — whether this particular planet is worth kitting up for, and how tight the board is
   *
   * Returns the allowance the corp CHOOSES to field to, never above the Aleas cap.
   */
  /* §2.2 WHAT AN OA MEANS TO SPEND ON KIT (ruled at the money pass: no ceiling). It read an Aleas allowance —
     2,500 a body, up 6% a year — as the cap every OA fielded under, and the fleet bought surplus rifles under it
     (₡200–700 a body, tier 1) while a person buying tier 3 took +13 points of win rate off every fight. The
     allowance is gone. An OA spends from its procurement budget (`ledger.procurementBudget`: what is free after
     wages, the entry and the reserve, at KIT_SHARE), tempered by its WILL — a fat planet opens the purse, a thrifty
     board closes it — and the money is laid out evenly across the force (`planForce` shares it), because the
     measured worth of kit is in the tier everyone carries, not in one railgun: each tier step is worth about
     ten points of win rate and half the casualties. Wealth, for the locker's depth, is budget per body against
     KIT_BUDGET_REFERENCE, the point at which a corp is rich enough to field tier 4 for all. */
  function kitIntent(profile, planet, bodyCount, kitBudget, season) {
    const budget = kitBudget != null ? kitBudget : 0;
    const perBodyAfford = budget / Math.max(1, bodyCount);
    const w = Math.max(0, Math.min(1, perBodyAfford / ITEMS.CONST.KIT_BUDGET_REFERENCE));
    const depth = ITEMS.CONST.LOCKER_DEPTH_POOR
                + (ITEMS.CONST.LOCKER_DEPTH_RICH - ITEMS.CONST.LOCKER_DEPTH_POOR) * w;
    const rich = planet.pot ? (planet.pot.richness - 0.70) / 0.70 : 0.5;
    const thrift = ((profile.dials && profile.dials.thrift) || 50) / 100;
    let will = 0.90
             + ITEMS.CONST.WILL_RICHNESS_PULL * (Math.max(0, Math.min(1, rich)) - 0.5) * 2
             - ITEMS.CONST.WILL_THRIFT_PULL * (thrift - 0.5) * 2;
    will = Math.max(ITEMS.CONST.WILL_FLOOR, Math.min(1, will));
    const target = Math.round(perBodyAfford * will);
    return {
      allowance: Math.max(ITEMS.CONST.KIT_FLOOR_PER_BODY, target) * bodyCount,
      depth: depth, will: will, wealth: w
    };
  }

  /* §DEVICES which OA the manager runs, for the one decision a quartermaster must not take for him */
  /* §CONTROLLER (ruled) the seats people hold in this contest — any number of them. An AI fills every other.
     `opts.humans` lists them; `opts.human`, one id, still works. */
  let _humans = new Set();
  function isHumanOA(id) { return _humans.has(id); }
  /* STEP 6 is not built: the comms window still serves ONE manager, asked for here and marked where used */
  let _manager = null;
  let corpsRef = [];   /* the contest's OAs, for helpers that live outside the day loop */
  function equipCorp(corp, profile, loadoutOverride, planet, season) {
    if (loadoutOverride) { ITEMS.equipForce(corp.allBodies, loadoutOverride); return corp; }
    const doc = ITEMS.doctrineForCorp(profile.id);
    const total = corp.allBodies.length;
    /* What the ledger says this corp can actually put into kit this season. */
    /* SEASONS.md — ONE treasury. This used to call LED.open(profile) every Divide, so the
       money that decided kit was the band midpoint no matter what last season did. A
       persistent Corp hands its actual account in; a one-off Divide still opens one. */
    const acct = (corp.persist && corp.persist.account) || LED.open(profile);
    corp.kitBudget = LED.procurementBudget(acct, corp.allBodies) * ((corp.persist && corp.persist.kitBoost) || 1);   /* §STAFF an Armourer */
    const intent = kitIntent(profile, planet || { pot: { richness: 1.0 } }, total, corp.kitBudget, season);
    corp.kitIntent = intent;
    /* THE MANAGER'S HAND. `persist.hand` maps a body's id to a named loadout, and the
       hand OUTRANKS the quartermaster: it draws from the rack first, buys what the rack
       lacks with the same procurement money, and counts against the same Aleas ceiling —
       no private channel around either constraint. A plan is honored WHOLE or refused
       whole per body: one that names no working primary or armor, or that the wallet and
       ceiling cannot cover, goes back to the quartermaster (no cripples, ruled), and the
       refusals are counted where a surface can show them. */
    for (const f of corp.allBodies) f._handKitted = false;   /* bodies persist across locks */
    const handSrc = (corp.persist && corp.persist.hand) || null;
    const baseArmoury = (corp.persist && corp.persist.armoury)
          || ITEMS.foundingArmoury(doc.id, total, { depth: intent.depth, maxTier: (corp.persist && corp.persist.maxTier) || 5 }).stock;
    const handStock = {};
    for (const k in baseArmoury) handStock[k] = baseArmoury[k];
    let handSpend = 0, handValue = 0, handed = 0;
    corp.handRefused = 0;
    /* §FACILITIES A MERCENARY'S OWN GEAR IS THEIRS: carried whatever the Armoury allows, and not drawn from the rack */
    for (const f of corp.allBodies) {
      if (!f.ownKit || (handSrc && handSrc[f.id])) continue;
      ITEMS.equip(f, { primary: f.ownKit.primary, armor: f.ownKit.armor, sidearm: f.ownKit.sidearm || null, mods: [], consumables: [] });
      f._handKitted = true; handed++;
    }
    if (handSrc) {
      /* §FACILITIES the Armoury's tier, and the doctrine's, bound a manager's hand as they bind the quartermaster */
      const maxTier = Math.min((ITEMS.doctrine(doc.id) || {}).armoury_max_tier || 5, (corp.persist && corp.persist.maxTier) || 5);
      let own = null;
      const slotOk = (id, slot) => {
        const it = id ? ITEMS.byId(id) : null;
        const mine = own && [own.primary, own.armor, own.sidearm].indexOf(id) >= 0;   /* a merc's own piece is always theirs to carry */
        return it && it.slot === slot && (it.tier <= maxTier || mine) ? it : null;
      };
      for (const f of corp.allBodies) {
        const h = handSrc[f.id];
        if (!h) continue;
        own = f.ownKit || null;
        const prim = slotOk(h.primary, 'primary');
        const arm = slotOk(h.armor, 'armor');
        if (!prim || !arm) { corp.handRefused++; continue; }
        const items = [prim, arm];
        const side = slotOk(h.sidearm, 'sidearm');
        if (side) items.push(side);
        const mods = (h.mods || []).map(m => slotOk(m, 'mod')).filter(Boolean);
        const cons = (h.consumables || []).map(c => slotOk(c, 'consumable')).filter(Boolean);
        items.push.apply(items, mods); items.push.apply(items, cons);
        /* priced against a trial of the rack, the wallet, and the ceiling before a single
           item moves, so a refusal leaves no half-drawn kit behind */
        let buy = 0, val = 0;
        const trial = {};
        for (const it of items) {
          val += it.cost;
          if ((handStock[it.id] || 0) - (trial[it.id] || 0) > 0)
            trial[it.id] = (trial[it.id] || 0) + 1;
          else buy += it.cost;
        }
        if (buy > (corp.kitBudget || 0) - handSpend ||
            handValue + val > intent.allowance) { corp.handRefused++; continue; }
        for (const k in trial) handStock[k] -= trial[k];
        handSpend += buy; handValue += val; handed++;
        ITEMS.equip(f, { primary: prim.id, armor: arm.id, sidearm: side ? side.id : null,
                         mods: mods.map(it => it.id), consumables: cons.map(it => it.id) });
        f._handKitted = true;
      }
    }
    const bareFighters = corp.allBodies.filter(f => !f._handKitted);
    let plan = ITEMS.planForce(doc.id, total - handed, {
      maxTier: (corp.persist && corp.persist.maxTier) || 5,   /* §FACILITIES what the Armoury can issue */
      fighters: bareFighters,   /* §QUARTERMASTER planned as themselves */
      squadOf: (f) => { const si = corp.squads.findIndex(q => q.bodies.indexOf(f) >= 0); return si < 0 ? null : si; },
      /* §SPONSORS what this OA's standings take off the yard's price, by family */
      discount: fam => (SPON && SPON.standingDiscount ? SPON.standingDiscount(corp, fam) : 0),
      /* SEASONS.md — the locker is OWNED. foundingArmoury is called once at fleet creation
         and never again; only a corp without one falls back to a fresh founding stock. */
      armoury: handStock,   /* the hand drew first; the quartermaster plans from what is left */
      /* SEASONS.md S8 — REAL MONEY. This was `budget: 0`, which was right while the locker
         was rebuilt free every Divide: a corp's wealth reached the ground through the DEPTH
         of that founding stock, not through cash. Now the locker persists and
         `foundingArmoury` runs once, so that channel is gone and a rich corp had no way to
         restock at all — every locker could only ever thin. Cash buys kit again, and what it
         buys stays in the rack. */
      allowance: Math.max(0, intent.allowance - handValue),
      budget: Math.max(0, (corp.kitBudget || 0) - handSpend),
      /* §DEVICES how rich this OA is decides how much of its force carries a device */
      /* a manager's own force carries a device only when he fits one: his squads are his to kit */
      wealth: LED.wealthOf(profile)   /* §CONTROLLER devices for any OA whose money runs to them, a manager's too */
    });
    /* SEASONS.md [OPEN-S11] — THE MUSTER IS DECIDED HERE, BECAUSE THIS IS WHERE IT IS KNOWN.
       The season loop used to test the treasury going negative and call that the muster, which
       is a different question: a corp can be flush and still have an empty rack. `planForce`
       computes the real shortfall, and it computes it in here, after the loop had already
       decided whether to ask the board. So the loop passes a handler down instead. It raises
       the money — a call, or the underwrite — and we plan again with it. */
    if (!plan.mustered && corp.persist && typeof corp.persist.onMuster === 'function') {
      const raised = corp.persist.onMuster(plan.shortfall, corp) || 0;
      if (raised > 0) {
        corp.kitBudget = (corp.kitBudget || 0) + raised;
        plan = ITEMS.planForce(doc.id, total - handed, {
          maxTier: (corp.persist && corp.persist.maxTier) || 5,
          fighters: bareFighters,
          squadOf: (f) => { const si = corp.squads.findIndex(q => q.bodies.indexOf(f) >= 0); return si < 0 ? null : si; },
      /* §SPONSORS what this OA's standings take off the yard's price, by family */
      discount: fam => (SPON && SPON.standingDiscount ? SPON.standingDiscount(corp, fam) : 0),
          armoury: handStock,
          allowance: Math.max(0, intent.allowance - handValue),
          budget: Math.max(0, corp.kitBudget - handSpend)
        });
      }
    }
    corp.doctrineId = doc.id;
    corp.muster = plan.mustered ? null : plan.shortfall;
    /* SEASONS.md S8 — what the locker has left after arming the drop. `planForce` has
       returned this since Step 5 and nothing has ever read it, because the locker was
       rebuilt free every Divide. It is now the corp's actual remaining stock. */
    if (corp.persist && plan.mustered) corp.persist.stockLeft = plan.stockLeft;
    if (!plan.mustered) {                    /* §3.1 — the ledger's problem, not the day loop's */
      ITEMS.equipForce(corp.allBodies, ITEMS.DEFAULT_LOADOUT);
      return corp;
    }
    corp.kitValue = plan.total + handValue;              /* catalog value FIELDED */
    corp.kitSpend = (plan.spentCash || 0) + handSpend;   /* CASH SPENT — the ledger's charge */
    corp.handKitted = handed;

    /* §QUARTERMASTER each un-kitted fighter was planned AS THEMSELVES (items.js planForce) — a gun from the
       types they shoot best, a medkit if they are among the force's best at Fieldcraft — so each simply
       carries what was planned for them. The role-by-role deal that stood here (templates, a round-robin,
       whoever-fits-the-role, a rack swap and a specialist's purchase bolted on after) is gone with roles. */
    const planned = {};
    for (const b of plan.bodies) if (b.fighter) planned[b.fighter] = b.loadout;
    const nSq = corp.squads.length;
    for (let si = 0; si < nSq; si++) {
      const sq = corp.squads[si];
      for (const f of sq.bodies.filter(b => !b._handKitted)) ITEMS.equip(f, planned[f.id] || ITEMS.DEFAULT_LOADOUT);
      /* §10 — a squad has medical kit because somebody bought it and is carrying it.
         MEDKIT_RATE's coin flip is gone. CONSUMPTION IS LIVE (Step 6 audit): the note here
         used to say it landed at 5b-3, and it never did. Kits were counted once and never
         spent, so `hasMedkit` was true for all 144 squads of every Divide forever, no field
         wound was ever untended, and COMBAT.md §7.1's degradation could not fire once. */
      /* A medkit is a KIT, not a single dressing: it treats several wounds before it is
         empty. A squad carries 1.42 of them on average, and takes far more casualties than
         that in a month, so counting one kit as one wound made two thirds of all wounds
         untended and drove permanent losses to 40% of the field. Charges, not units. */
      /* §5.2 FIELD RATIONS: a pack in the store slot feeds its bearer past the drop's fourteen
         days — the one thing a kit can do about a planet that is hard to keep fed */
      const packs = sq.bodies.reduce((s, f) => s + (f.loadout.consumables || []).filter(c => c === "itm_field_rations").length, 0);
      if (packs) sq.rations += packs * CONST.RATION_PACK_DAYS;
      /* §SPONSORS a victualler's standing order stretches what the drop carries, for good:
         the same fourteen days' load feeds the squad longer */
      const vict = SPON && SPON.standingValue ? SPON.standingValue(corp, 'victualler') : 0;
      if (vict) sq.rations = Math.round(sq.rations * (1 + vict));
      sq._rationPerHead = (sq.rations - packs * CONST.RATION_PACK_DAYS) / Math.max(1, sq.bodies.length);
      /* §CHARGES every fighter lands with the charges its stores carry for the Divide */
      for (const f of sq.bodies) chargeUp(f);
      sq.medkits = medkitCharges(sq.bodies);
      sq.hasMedkit = sq.medkits > 0;
    }
    return corp;
  }

  /* SEASONS.md S2/S3 — a drop force of 16 to 24 deals into squads of at most eight and at
     least five. The named splits still win when the force is a full 24. */
  /* §MON-WA A SQUAD HOLDS EIGHT BEINGS, and a pair is one of them with two bodies in it. The
     AI deals by BODY count, so a squad that drew four pairs came out eight bodies where eight
     seats were meant; sizes are dealt in seats and the bodies follow their partner. */
  function seatsOf(bodies) { return bodies.filter(b => !b.mirror_of).length; }
  function dealSizes(n, split, profile, want) {
    if (n === 24 && split === '2x12') return [12, 12];
    if (n === 24 && split === '4x6') return [6, 6, 6, 6];
    /* SQUAD_MAX and SQUAD_MIN live HERE, where the dealing happens, and season.js reads them
       off this module. They were declared in both files — `SQUAD_MAX` as a local with a
       comment saying it mirrored the other copy, which is a duplication announcing itself —
       and `SQUAD_MIN` was declared in season.js and read by nothing at all, so the "at least
       five" in the comment below was true only by arithmetic accident. */
    const SQUAD_MAX = CONST.SQUAD_MAX, SQUAD_MIN = CONST.SQUAD_MIN;
    let squads = squadCountFor(n, profile, want);
    while (squads > 2 && Math.floor(n / squads) < SQUAD_MIN) squads--;
    const base = Math.floor(n / squads), extra = n % squads;
    const out = [];
    for (let i = 0; i < squads; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  /* §SQUADS HOW WIDE A NET A OA CASTS. Every OA packed its people into squads of eight
     and so fielded three, which is why nobody noticed the draft only dealt three landings. The
     rule allows six, and six is a real choice with real terms: more squads means more landings
     drafted, more ground covered and more deposits worked at once — and thinner squads that
     lose the fights they pick. An OA leans on its dials: the aggressive spread to be everywhere a fight is, and the
     patient mass. */
  function squadCountFor(n, profile, want) {
    const packed = Math.max(2, Math.ceil(n / CONST.SQUAD_MAX));       /* what packing gives */
    const most = Math.max(2, Math.min(CONST.SQUADS_MAX, Math.floor(n / CONST.SQUAD_MIN)));
    if (want && want >= 2) return Math.max(2, Math.min(most, want));  /* a manager's own call */
    const d = (profile && profile.dials) || {};
    const dial = k => (typeof d[k] === 'number' ? d[k] : 50) / 100;
    /* what an OA wants: ground-hunger and appetite for contact push it wider */
    const spread = CONST.SPREAD_BASE
                 + dial('aggression') * CONST.SPREAD_AGGRESSION
                 - dial('patience') * CONST.SPREAD_PATIENCE;
    const reach = Math.round(packed + spread * (most - packed) * 2);
    return Math.max(2, Math.min(most, Math.max(packed, reach)));
  }
  function buildCorp(rng, profile, stance, split, rigidity, loadout, planet, persist, season) {
    /* SEASONS.md — the drop force is BORROWED when a persistent Corp supplies one. The
       people outlive the Divide; the squads, positions and banner do not. Without a Corp
       the roster is generated as it always was, so a one-off Divide is unchanged. */
    const drop = persist && persist.drop && persist.drop.length ? persist.drop.slice() : null;
    /* THE MANAGER'S OWN SQUADS. A persistent Corp may hand in `persist.groups` — arrays of
       body ids partitioning the drop — and `persist.leaders`, one id per group (or null to
       let tactics decide, which is the rule below and always was). This is only who stands
       with whom and who they look to: everything squads DO still belongs to the Divide, and
       succession still runs when the named leader goes down. Groups are the manager's
       authority and are taken as given — they are validated where the manager works, not
       re-judged here. Absent groups, the deal is exactly what it was. */
    const groups = drop && persist.groups && persist.groups.length
                 ? persist.groups.filter(g => g && g.length) : null;
    const leaders = (groups && persist.leaders) || null;
    const dropById = {};
    if (groups) for (const b of drop) dropById[b.id] = b;
    const sizes = groups ? groups.map(g => g.length)
                : drop ? dealSizes(seatsOf(drop), split, profile, (persist && persist._wantSquads) || 0)
                : split === '2x12' ? [12, 12] : split === '4x6' ? [6, 6, 6, 6] : [8, 8, 8];
    const corp = {
      id: profile.id, profile, policy: stance, declaredAt: stance,
      rigidity: rigidity != null ? rigidity : profile.rigidity != null ? profile.rigidity : (DEFAULT_RIGIDITY[profile.id] != null ? DEFAULT_RIGIDITY[profile.id] : 50),
      squads: [], allBodies: [], stanceChanges: 0, hauled: 0, sitesClaimed: 0, engagements: 0,
      /* §WITHDRAWAL Step 6 — every corp drops holding its own claim, and keeps it until it
         concedes. The join stood here: the corp this one ceded its claim to and then fought
         on BEHIND, which merged the two sides and is struck with the join itself (stages 2-6
         of docs/WITHDRAWAL_MIGRATION.md). What is left is `withdrawn`: it conceded the ground,
         took its people off the planet, and is nobody's vassal. Irreversible, as the join was. */
      terms: null,
      withdrawn: null,          /* { day, toId, terms } once it has conceded and gone */
      offersMade: 0,
      /* set BEFORE equipCorp runs at the foot of this function — it reads the account and
         the locker off it, and setting it at the call site was too late. */
      persist: persist || null
    };
    let taken = 0;
    for (let i = 0; i < sizes.length; i++) {
      /* deal SEATS: a pair's second body rides with its partner and does not spend a seat,
         and a squad never closes between two halves */
      let bodies;
      if (groups) bodies = groups[i].map(id => dropById[id]).filter(Boolean);
      else if (drop) {
        bodies = [];
        let seats = 0;
        while (taken < drop.length && seats < sizes[i]) {
          const b = drop[taken++];
          bodies.push(b);
          if (!b.mirror_of) seats++;
          const mate = b.bond_partner && drop[taken];
          if (mate && drop[taken].id === b.bond_partner) bodies.push(drop[taken++]);
        }
      } else {
        bodies = ROSTER.generateSquad(rng, sizes[i], { corpId: profile.id }).bodies;
        taken += sizes[i];
      }
      if (!bodies.length) continue;          /* a named group whose bodies all fell unfit */
      let cap = bodies[0];
      for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
      const named = !!(leaders && leaders[i] && bodies.some(b => b.id === leaders[i]));
      const led = named ? leaders[i] : cap.id;
      /* the squad's index is its place in the LIST — a skipped empty group must not leave
         a gap that `_squadIdx` lookups fall into — and rations feed the bodies that stand */
      const si = corp.squads.length;
      corp.squads.push({
        corpId: profile.id, corp, policy: stance, bodies, captainId: led, sIdx: si, known: {},
        hasMedkit: false,        // set by equipCorp from what the squad actually carries (§10)
        x: 0.5, y: 0.5, hx: 0.5, hy: 0.5,           // position, and where they came from
        rations: CONST.RATION_DROP_DAYS * bodies.length, rationDry: false,
        crates: 0, ammoResupplied: 0, intelUntil: 0,
        /* S20 — the prep year's scouting, the same for every squad this corp drops */
        _intel: (persist && persist.intel) || 0,
        /* per-opponent readiness this corp gathered (Gather Intel), keyed by rival corpId */
        _rivalIntel: (persist && persist.rivalIntel) || null,
        claiming: null, movedToday: false, foughtToday: false, engagements: 0,
        _startN: bodies.length,          /* §RESERVE what it dropped with: a squad below this has losses to replace */
        _named: named
      });
      /* SEASONS.md S6 — which squad somebody actually stood in. The grief rule needs this to
         know who was CLOSE to the dead, and nothing recorded it: the close-loss multiplier
         read a field that no code anywhere ever set. */
      for (const b of bodies) b._squadIdx = si;
      corp.allBodies.push(...bodies);
    }
    /* §TALKS THE YEAR'S CAPTAINS LEAD WHERE THEY LAND. A dealt drop (no manager's groups) moves a
       second captain in one squad across to a squad that has none, trading places with its least
       tactical single hand; then every squad without a leader named at the Lock is led by the
       sharpest captain standing in it. A pair is never split to do it. No dice. */
    const capSet = new Set((persist && persist.captains) || []);
    if (capSet.size && corp.squads.length) {
      const single = b => !b.mirror_of && !b.bond_partner;
      if (!groups) {
        const bare = corp.squads.filter(sq => !sq.bodies.some(b => capSet.has(b.id)));
        for (const sq of corp.squads) {
          const cs = sq.bodies.filter(b => capSet.has(b.id) && single(b));
          while (cs.length > 1 && bare.length) {
            const extra = cs.pop(), dest = bare.shift();
            const swap = dest.bodies.filter(b => !capSet.has(b.id) && single(b))
              .sort((a, b) => a.stats.tactics - b.stats.tactics)[0];
            if (!swap) continue;
            sq.bodies[sq.bodies.indexOf(extra)] = swap; dest.bodies[dest.bodies.indexOf(swap)] = extra;
            swap._squadIdx = sq.sIdx; extra._squadIdx = dest.sIdx;
          }
        }
      }
      for (const sq of corp.squads) {
        if (sq._named) continue;
        const cs = sq.bodies.filter(b => capSet.has(b.id));
        if (cs.length) sq.captainId = cs.sort((a, b) => b.stats.tactics - a.stats.tactics)[0].id;
      }
    }
    /* PROCUREMENT.md §15 — kit the force. Planning draws no RNG, so it cannot shift the
       stream; what it changes is what everybody is holding when the shooting starts.

       6b: what a corp brings now VARIES. It used to not: every corp fielded 2247-2250
       against a cap of 2250 because the founding locker held twice the ceiling in kit, so
       neither money nor appetite could bind and the eight corps were interchangeable on the
       ground. `kitIntent` decides how near the cap this corp gets, from its wealth and from
       whether it fancies this particular planet. The cap itself is still one number for
       everyone (P1). */
    /* §RESERVE the fighters held in orbit are kitted with the force, inside the same cap, and wait to land */
    corp.reserve = (persist && persist.reserve) ? persist.reserve.slice() : [];
    corp.reserveStart = corp.reserve.filter(f => !f.mirror_of).length;
    corp.landed = 0;
    const onGroundBodies = corp.allBodies;
    if (corp.reserve.length) corp.allBodies = onGroundBodies.concat(corp.reserve);
    equipCorp(corp, profile, loadout, planet, season);
    corp.allBodies = onGroundBodies;
    return corp;
  }

  function squadHead(sq) { return sq.bodies.filter(b => b.status === 'active'); }

  /* ------------------------------------------------------------------ */
  /* Step 6 — banners and the umbrella (NEGOTIATION.md §3)               */
  /* ------------------------------------------------------------------ */

  /** The corp at the top of this corp's chain of joins. Itself, if it never joined. */
  /* §WITHDRAWAL NOBODY STANDS UNDER ANYBODY. An OA used to cede its claim and fight on behind
     the buyer's flag, so this walked a chain of banners to find who a corp really answered for.
     A beaten OA now concedes the ground and leaves; every OA on the planet answers for itself.
     Kept as a function because two hundred lines call it, and because a chain may return if
     some later ruling brings one back. */
  function principalOf(corp) { return corp; }

  /** Two corps are allied when they are under the same banner. */
  function allied(a, b) {
    if (a === b || a.id === b.id) return true;
    return principalOf(a).id === principalOf(b).id;
  }

  /** A banner is standing while any one of its people is on their feet (N18). */
  /* §WITHDRAWAL STANDING MEANS STANDING ON THE GROUND. This counted any corp with a living
     body — and a withdrawn OA's people are all alive, at home, off the planet. So an OA that
     conceded went on counting as a banner in the contest it had left, the field could never
     reach one banner, and every contest a manager withdrew from ran to overtime and ended with
     NO WINNER — which left every promise made to him moot, since there was nobody to honour it.
     A corp is standing if it has not conceded and has somebody still on the ground. */
  function bannersStanding(corps) {
    const live = new Set();
    for (const c of corps) {
      if (c.withdrawn) continue;
      if ((c.squads || []).some(q => (q.bodies || []).some(b => b.status === 'active'))) live.add(principalOf(c).id);
    }
    return live;
  }

  /** §6.3 — how much the crowd cares about beating this corp. */
  function standing(corp) {
    const base = STANCE_STANDING[corp.policy] != null ? STANCE_STANDING[corp.policy] : 0.5;
    const v = base + CONST.STANDING_PER_ENGAGEMENT * corp.engagements
                   + CONST.STANDING_PER_SITE * corp.sitesClaimed;   /* (the crowd charge that stood here is cut: nothing wrote it) */
    return Math.max(CONST.STANDING_MIN, Math.min(CONST.STANDING_MAX, v));
  }

  /** What a hunter stands to gain from this particular squad. */
  function prestigeOf(sq) {
    const strength = squadHead(sq).length / Math.max(1, sq.bodies.length);
    /* §RESERVE A SQUAD DRAWING ON A BEACON IS THE ONE TO STOP. A weak squad is discounted as not worth hunting — and a
       squad on a beacon is weak by definition, since it went there to replace its losses, so the hunters rated the one
       squad about to be made whole among the least worth their time. Lit today or yesterday, it is a mark, not a
       discount: stop it before it is whole again. */
    const lit = sq._beaconLit != null && sq._beaconLit >= (sq._day || 0) - 1;
    const weak = !lit && strength < 0.55 ? CONST.WEAK_TARGET_DISCOUNT : 1;
    return standing(sq.corp) * weak * (lit ? 1 + CONST.BEACON_PREY : 1);
  }


  /* ------------------------------------------------------------------ */
  /* Step 6 — the corp channel (NEGOTIATION.md §6, §11)                  */
  /* ------------------------------------------------------------------ */

  /** The banners currently on the field, each with everyone under it. */
  function umbrellasOf(corps) {
    const by = new Map();
    for (const c of corps) {
      if (!c.allBodies.some(b => b.status === 'active' || b.status === 'injured')) continue;
      /* an OA that stood down took its people home standing: still 'active' bodies, no longer a banner. Left in,
         it drew a share of everyone's Chance of Winning after it had left the ground. */
      if (c.withdrawn) continue;
      const p = principalOf(c);
      if (!by.has(p.id)) by.set(p.id, { principal: p, members: [] });
      by.get(p.id).members.push(c);
    }
    return Array.from(by.values());
  }

  /**
   * N11 (corrected) — refusing to deal is a CORP IDENTITY, not a property of the far pole.
   * Exactly one OA in the fleet is known for it, and its fans adore it for exactly that.
   * A corp may declare death_or_glory and still take a call; what it will not do is retreat.
   *
   * The first build read this off the declared stance, which sealed every death_or_glory
   * corp out of the table and cost the far pole five times what unyielding paid. The flag
   * lives in `oa_profiles.json` because data is truth.
   */
  function sealed(corp) {
    return !!(corp.profile && corp.profile.no_negotiation);
  }

  /* §JOINING RETIRED `owedBy` — the share a banner had promised its joiners — went with the banners. */

  /* §5.1 — placement is recorded as banners stop standing, earliest first, so the finish
     order falls out of the Divide rather than being scored at the end. */
  /** what corp `a` has had with the banner `p` stands under: summed over its members */
  function contactWith(a, p, corps) {
    const out = { fights: 0, lostTo: 0, beat: 0, huntedBy: 0, hunting: 0, lastDay: 0 };
    if (!a || !a._contact || !p) return out;
    const pid = principalOf(p).id;
    for (const id in a._contact) {
      const other = (corps || []).find(c => c.id === id);
      const under = other ? principalOf(other).id : id;
      if (under !== pid) continue;
      const r = a._contact[id];
      out.fights += r.fights; out.lostTo += r.lostTo; out.beat += r.beat;
      out.huntedBy = Math.max(out.huntedBy, r.huntedBy); out.hunting = Math.max(out.hunting, r.hunting);
      out.lastDay = Math.max(out.lastDay, r.lastDay);
    }
    return out;
  }

  /**
   * §6.9 WHO IS ON WHOM. The engine counted engagements per OA and never whom; the hunting
   * intent never told the hunted. So the table could look at the board and never at the
   * OA whose squads were standing on it. A per-pair record, kept on each corp: fights
   * between them, the last day of contact, how many of those it lost to them and how many it
   * won, and whether they are hunting it now. `a` and `b` are corps.
   */
  function noteContact(a, b, day, what) {
    if (!a || !b || a === b) return;
    a._contact = a._contact || {};
    const r = a._contact[b.id] = a._contact[b.id] || { fights: 0, lostTo: 0, beat: 0, huntedBy: 0, hunting: 0, lastDay: 0 };
    if (what === 'fight') r.fights++;
    else if (what === 'lost') r.lostTo++;
    else if (what === 'beat') r.beat++;
    else if (what === 'huntedBy') r.huntedBy = day;
    else if (what === 'hunting') r.hunting = day;
    r.lastDay = Math.max(r.lastDay, day);
  }

  function recordFall(stats, id, day, how) {
    stats.fallen = stats.fallen || [];
    if (stats.fallen.some(f => f.id === id)) return;
    stats.fallen.push({ id: id, day: day, how: how });
  }

  /**
   * THE NEGOTIATION CONTEXT, built in ONE place. It used to be constructed inline in the corp
   * channel, and the decision window — which runs later in the same day — tried to reuse the
   * object the AI had been scored on. That does not work and the reason is worth writing down:
   * `oddsWithJoin` is a CLOSURE over the umbrella list as it stood during the channel, so a
   * corp that joined a banner in between left the saved context describing a fleet that no
   * longer existed, and it crashed on the first lookup. Saving a context is saving a photograph
   * of the board and calling it the board.
   * Both callers build a fresh one from the same function instead, which is what "the human's
   * offer is scored by the identical function" was always supposed to mean.
   */
  function makeNegContext(rng, corps, planet, day, stats) {
    const umbrellas = umbrellasOf(corps);
    const meanEng = corps.reduce((a, c) => a + c.engagements, 0) / Math.max(1, corps.length);
    const odds = NEG.oddsBoard(umbrellas, { meanEngagements: meanEng });
    /* §WITHDRAWAL THE BUYER DOES NOT GET THEIR GUNS. This merged the seller's squads INTO the
       buyer's umbrella and read the buyer's odds off the result — which was right when a beaten
       OA ceded its claim and fought on behind the buyer's flag. It concedes the ground and takes
       its people off the planet now, so the buyer acquires nothing: what happens is that the
       seller's strength LEAVES THE BOARD and everyone's odds rise a little. Merging made the
       buyer pay for guns it never receives, and pay more the stronger the seller was. What it
       is really buying is the difference between winning against seven and winning against six. */
    function oddsWithout(joiner, principal) {
      const jP = principalOf(joiner), pP = principalOf(principal);
      if (jP.id === pP.id) return odds[pP.id] || 0;
      const without = umbrellas.filter(u => u.principal.id !== jP.id);
      if (!without.length) return odds[pP.id] || 0;
      const o = NEG.oddsBoard(without, { meanEngagements: meanEng });
      return o[pP.id] || 0;
    }
    const corpHasHook = (corp, hook) =>
      (corp.allBodies || []).some(b => b.status === 'active' &&
        (b.hooks ? b.hooks.has(hook) : (b.traits || []).some(t => t === hook)));
    return {
      pot: planet.pot.value, odds: odds, day: day, lastDay: GROUND.CONST.DAYS,
      principalOf: principalOf, sealed: sealed,
      oddsWithout: oddsWithout, rng: rng, banners: umbrellas.length,
      resource: planet.archetypeName || planet.archetype,
      planet: planet, categoryOf: MAP.resourceCategory, categories: REP.CATEGORIES,
      hasHook: corpHasHook, refusals: stats.refusals, umbrellas: umbrellas,
      contact: (a, b) => contactWith(a, b, corps),
      corps: corps
    };
  }

  /* §WITHDRAWAL (ruled: eight players) ANY OA CAN LEAVE A PLANET, the same way. It was the manager's alone: one
     offer in a contest, his, and nothing an AI OA could post. Now every OA may have an offer out, the field
     answers each (an AI by its weighing, a person at their window), and standing down is one act for everyone:
     whoever said yes is on record, and the winner decides each promise at the settlement. */
  /* §MARKET (ruled: the Divide is a negotiation) WHO KEEPS THEIR WORD. A promise was kept at one minus treachery, less
     half the share — an average OA (treachery 50) at ~45% — so every promise a leaver weighed was worth under half its
     face, and the market it was meant to drive barely traded: in six contests one exit by deal, 1.3% of the pot to
     anyone but the winner, one promise in six kept. Breaking a promise costs the breaker standing that scales with the
     promise, on a stage the whole fleet watches, so keeping it is the ordinary course and character bends that: an
     honest OA keeps ~90%, an average one ~70%, a treacherous one ~50%, a little less for a larger promise. One formula,
     for what a leaver expects and for what the winner does. */
  function keepChance(j, share) {
    const t = (j && j.profile && j.profile.dials && j.profile.dials.treachery != null) ? j.profile.dials.treachery : 50;
    return Math.max(0.05, Math.min(0.97, 0.97 - 0.55 * t / 100 - 0.25 * (share || 0)));
  }
  function standDown(c, day, stats, corps, how) {
    if (c._downedOn == null) c._downedOn = day;          /* §PLACEMENT the day it left the ground */
    const off = (stats.withdrawOffers || {})[c.id];
    const promises = [];
    if (off) for (const id in off.replies) if (off.replies[id]) promises.push({ to: c.id, from: id, terms: off.terms, day: day });
    /* `how`: 'withdrew' (its own call, or a sold exit) or 'pulled' (the Aleas took a spent banner off the ground) */
    c.withdrawn = { day: day, toId: null, terms: (off && off.terms) || null, promises: promises, byChoice: how !== 'pulled', how: how || 'withdrew' };
    for (const q of c.squads || []) {
      if (!squadHead(q).length) continue;
      for (const b of q.bodies || []) if (b.status === 'active') b._withdrew = day;
      q._withdrawn = day; q.bodies = []; q.intent = null;
    }
    (stats.promises = stats.promises || []).push.apply(stats.promises, promises);
    if (stats.withdrawOffers) delete stats.withdrawOffers[c.id];
    stats.withdrawals = (stats.withdrawals || 0) + 1;
    REP.act(c.rep, 'ceded', { rivalIds: corps.map(x => x.id) });
  }
  function postWithdrawOffer(c, terms, day, stats) {
    (stats.withdrawOffers = stats.withdrawOffers || {})[c.id] = { from: c.id, terms: terms, sentDay: day, replies: {} };
    stats.audit.withdrawOffers = (stats.audit.withdrawOffers || 0) + 1;
  }
  function runCorpChannel(rng, corps, planet, day, stats, opts) {
    const corpIds = corps.map(c => c.id);
    const umbrellas = umbrellasOf(corps);
    if (umbrellas.length < 2) return;

    const meanEng = corps.reduce((a, c) => a + c.engagements, 0) / Math.max(1, corps.length);
    const odds = NEG.oddsBoard(umbrellas, { meanEngagements: meanEng });
    /* §3.1a the low-water mark: the worst an OA's banner ever read on the board, and how
       many engagements it had then — so the finish can tell who fought on past hope */
    for (const c of corps) {
      if (c.withdrawn) continue;
      const o = odds[principalOf(c).id] || 0;
      if (c._minOdds == null || o < c._minOdds) { c._minOdds = o; c._engAtLow = c.engagements || 0; }
      /* §STANDING THE UNDERDOGS SING LOUDEST WHEN IT IS HOPELESS: an OA below half its fair share of the odds, with a warm
         Underdogs faction, finds its people steadier each day it holds on */
      if (o < 0.5 / Math.max(1, umbrellas.length)) {
        const lift = Math.max(0, factionLeanOf(c, 'underdogs')) * CONST.UNDERDOG_MORALE;
        if (lift > 0) for (const q of c.squads) for (const b of squadHead(q)) b.condition.morale = Math.min(95, b.condition.morale + lift);
      }
      if (c._openingOdds == null) c._openingOdds = o;     /* §6.12 what it dropped with */
    }

    /* §WITHDRAWAL A LEAVER'S STRENGTH LEAVES THE BOARD. This copy still MERGED the leaver's force into each
       rival's banner — joining's arithmetic, fixed long ago in `makeNegContext` and never here, which is the
       copy the table used — so every rival thought a withdrawal handed it an army, and nearly all said yes
       (79 promises in four contests). A rival's odds with the leaver gone is what its going is worth. */
    function oddsWithout(leaver, rival) {
      const lP = principalOf(leaver), rP = principalOf(rival);
      if (lP.id === rP.id) return odds[rP.id] || 0;
      const without = umbrellas.filter(u => u.principal.id !== lP.id);
      if (!without.length) return odds[rP.id] || 0;
      const o = NEG.oddsBoard(without, { meanEngagements: meanEng });
      return o[rP.id] || 0;
    }

    const ctx = {
      pot: planet.pot.value, odds: odds, day: day, lastDay: GROUND.CONST.DAYS,
      principalOf: principalOf, sealed: sealed,
      oddsWithout: oddsWithout, rng: rng, banners: umbrellas.length, umbrellas: umbrellas,
      resource: planet.archetypeName || planet.archetype,
      planet: planet, categoryOf: MAP.resourceCategory, categories: REP.CATEGORIES,
      /* Trait hooks the negotiation engine can read. All three were declared in traits.json
         and read by nothing: a psion who can tell when a rival is bluffing, and the two
         traits that make a corp's own people refuse to be party to a broken deal. */
      hasHook: corpHasHook,
      refusals: stats.refusals,
      /* §6.9 what `a` has had with `b`'s whole banner this Divide */
      contact: (a, b) => contactWith(a, b, corps),
      corps: corps
    };

    /* A hook so an interface — or a test standing in for one — can see the board exactly as
       the AI sees it, and compose offers against the same context. */
    if (opts.onWindow) opts.onWindow(ctx, corps);

    /* Stop the Divide dead at a chosen window, with every corp left exactly as it stood.
       This is for tooling — an interface needs a real board it can negotiate against, and a
       board reconstructed from a summary is a board that can drift out of step with the
       engine. Nothing in a played game halts. */
    if (opts.haltAt === day) { stats.halted = { day: day, ctx: ctx, corps: corps }; return true; }

    /* STRUCK. It is announced on air, and it is irreversible (N4). One door for an ask a
       principal accepted and for an invitation an OA took. */
    /* §JOINING RETIRED `strike` settled a join — the joiner under the banner, its claims named, its
       stand-down recorded. Nothing strikes one now. */

    /* §6.11 A DECISION IS A THING AN INSTRUMENT CAN OVERRIDE. Every choice the AI makes at the
       table passes through `decide`: the default is what the AI would do; `opts.decide` may
       return another of the options; `opts.onDecision` sees every one. That is how
       `measure_regret.cjs` replays a Divide from its seed and forces one decision the other way
       to see what it was worth. Nothing in a played game passes either hook. */
    const decide = (kind, key, dflt, options) => {
      const k = Object.assign({ kind: kind, day: day }, key);
      let pick = dflt;
      if (opts.decide) { const forced = opts.decide(k, dflt, options); if (forced !== undefined) pick = forced; }
      if (opts.onDecision) opts.onDecision(k, dflt, options, pick);
      return pick;
    };

    /* a ransom paid: he comes home hurt, the money moves at the books, both crowds notice */
    function settleRansom(deal, f, owner, captor) {
      f.status = 'injured';                     /* they come home, and they come home hurt */
      f._capturedBy = null;
      owner.ransomPaid = (owner.ransomPaid || 0) + deal.price;
      captor.ransomTaken = (captor.ransomTaken || 0) + deal.price;
      /* §3.1 — buying your people back is the thing your own ships care about most, and
         the captor's fanbase notices you dealt straight with them. */
      if (owner.rep) REP.act(owner.rep, 'ransomed_home', { targetId: captor.id });
      stats.deals.push(deal);
      stats.ransoms = (stats.ransoms || 0) + 1;
      (stats.captiveLog = stats.captiveLog || []).push({ fighter: f.id, name: f.name, owner: owner.id, captor: captor.id, out: 'ransomed', price: deal.price, day: deal.day });
      if (stats._rec) stats._rec({ t: 'ransom', c: owner.id, from: captor.id, p: deal.price });
    }
    stats._settleRansom = settleRansom;

    /* §WITHDRAWAL one reckoning of what a departure is worth, for the leaver and the field alike */
    const W8 = NEG.CONST.CONCESSION_ASK_WEIGHT, POT = (planet.pot && planet.pot.value) || 0;
    const keepOf = (j, share) => keepChance(j, share);
    const onGround = (j) => !j.withdrawn && (j.squads || []).some(q => squadHead(q).length);
    /* a rival gains two things when an OA leaves: better odds, and the losses it is spared — the leaver's share of
       the strength on the ground, of what fighting on would have cost it. A BIG THREAT GOING spares a lot, which
       is why a strong OA can ask a hefty share and still be promised it. */
    const livingOf = (j) => (j.allBodies || []).filter(b => b.status === 'active').length;
    const spared = (leaver, j) => {
      const total = corps.filter(onGround).reduce((t, x) => t + livingOf(x), 0);
      return total ? stayCost(j) * livingOf(leaver) / total : 0;
    };
    const maxAskFor = (leaver, j) => {
      const mine = odds[j.id] || 0, withGone = Math.max(mine, ctx.oddsWithout(leaver, j) || 0);
      const value = (withGone - mine) * POT + spared(leaver, j);
      return { withGone: withGone, maxAsk: withGone > 0 && POT > 0 ? Math.min(0.9, value / (withGone * POT * W8)) : 0 };
    };
    const leaveRows = (c) => corps.filter(j => j.id !== c.id && onGround(j)).map(j => Object.assign({ j: j }, maxAskFor(c, j)));
    const promisesWorth = (rows, ask, who) => POT * rows.filter(r => who(r)).reduce((t, r) => t + r.withGone * ask * keepOf(r.j, ask), 0);
    const standingCost = (c) => {
      const dl = (c.profile && c.profile.dials) || {};
      const pride = 0.5 + ((dl.showmanship != null ? dl.showmanship : 50) + (dl.tradition != null ? dl.tradition : 50)) / 200;
      return CONST.CEDE_STANDING_POINTS * CONST.STANDING_CREDIT * pride;
    };
    /* WHAT STAYING COSTS. On the pot alone leaving can never pay — the most the field will promise adds up to
       roughly the leaver's own odds, discounted by trust — so what makes leaving an economic act is what staying
       spends: the people (and the kit they carry) an OA expects to lose if it fights on, at ITS OWN rate of loss
       so far, over the days likely left, each worth what replacing them costs. An OA pricing its own assets. */
    const kitWorth = (lo) => !lo ? 0 : [lo.primary, lo.armor, lo.sidearm].concat(lo.mods || [], lo.consumables || [])
      .reduce((t, id) => { const it = id && ITEMS.byId(id); return t + (it ? (it.cost || 0) : 0); }, 0);
    /* its rate of loss is its own blended with the whole field's — one man lost on day one does not say an OA
       will lose everyone — and nobody reads it before the third day */
    /* §GROUND THE RATE IS THE LAST WINDOW'S, NOT THE DROP'S. On the rebuilt ground the drop is contested from the
       first day and quiet after, so a rate read since day one — written for a ring where nobody met before day
       five — priced the whole month at the drop's pace and sent six banners home at the second window. What an OA
       reads now is what the last window cost it, and the field, over the days the wall leaves. */
    const since = (j) => { const a2 = j.allBodies || [], was = j._aliveAtWindow != null ? j._aliveAtWindow : a2.length; return Math.max(0, was - a2.filter(b => b.status === 'active').length); };
    const cadenceDays = Math.max(1, day - (stats._lastWindowDay || 1));
    const fieldRate = (() => {
      let lostAll = 0, bodiesAll = 0;
      for (const j of corps) { const a2 = j.allBodies || []; bodiesAll += a2.length; lostAll += since(j); }
      return bodiesAll ? lostAll / bodiesAll / cadenceDays : 0;
    })();
    const lastGroundDay = (() => { const t = (planet.ground && planet.ground.wall.takeAt) || []; return t.length ? t[t.length - 1].day : GROUND.CONST.DAYS; })();
    const stayCost = (c) => {
      if (day < CONST.LEAVE_EARLIEST_DAY) return 0;
      const all = c.allBodies || [], alive = all.filter(b => b.status === 'active');
      const lost = since(c);
      const daysLeft = Math.max(1, lastGroundDay + CONST.LEAVE_OVERTIME_GUESS - day);
      const rate = CONST.LEAVE_OWN_RATE * (lost / Math.max(1, all.length) / cadenceDays) + (1 - CONST.LEAVE_OWN_RATE) * fieldRate;
      const expect = Math.min(alive.length, rate * all.length * daysLeft);
      const worth = alive.length ? alive.reduce((t, b) => t + ((b.contract && b.contract.salary) || 0) *
                    LED.CONST.SALARY_MONTHS + kitWorth(b.loadout), 0) / alive.length : 0;
      return expect * worth;
    };
    /* §WITHDRAWAL THE FIELD ANSWERS. An offer posted last window is read by every OA still on
       the ground: each says yes or no from what the manager's exit is worth to IT — the odds it
       gains by his going, against what he is asking of the pot it hopes to win — and its own
       appetite for a bargain. Saying yes binds nobody; it is a promise, and the record of who
       keeps promises is what a manager reads next time. */
    for (const fromId in (stats.withdrawOffers || {})) {
      const off = stats.withdrawOffers[fromId];
      if (!(off.sentDay < day)) continue;
      const leaver = corps.filter(c => c.id === off.from)[0];
      for (const c of corps) {
        if (!leaver || c.id === off.from || c.withdrawn) continue;
        if (isHumanOA(c.id)) continue;        /* a person answers at their own window */
        if (!(c.squads || []).some(q => squadHead(q).length)) continue;
        if (off.replies[c.id] != null) continue;
        /* What his going is worth to THIS OA: the odds it gains by having one fewer rival,
           against what he is asking of the pot it hopes to win. The ask is weighed by the odds
           it has of ever paying — a long shot promises freely because it will likely never owe
           anything, which is exactly why a manager must read WHO said yes and not merely how
           many. */
        /* the same reckoning the leaver used: what this OA would gain by its going — the odds, and the losses it is
           spared — against what the leaver asks of the pot it hopes to win */
        /* §CENSUS a share of the stores is weighed too, at the rate the settlement weighs it (a quarter of a credit
           share): this read the credits alone, so an ask for no credits and all the stores was waved through */
        let storeAsk = 0;
        for (const k in (off.terms || {})) if (k !== 'credits' && REP.CATEGORIES.indexOf(k) >= 0) storeAsk += Math.max(0, Math.min(1, off.terms[k] || 0));
        const asked = Math.max(0, Math.min(1, ((off.terms && off.terms.credits) || 0) + storeAsk / 4));
        let yes = asked <= maxAskFor(leaver, c).maxAsk;
        yes = decide('withdrawReply', { corp: c.id, from: off.from }, yes, [true, false]);
        off.replies[c.id] = yes;
        if (!yes) c._refusedOffers = (c._refusedOffers || 0) + 1;
        stats.audit.withdrawReplies = (stats.audit.withdrawReplies || 0) + 1;
      }
    }

    /* §WITHDRAWAL (ruled) LEAVING IS AN ECONOMIC DECISION, NOT A SURRENDER. An AI OA weighs, every window:
       STAYING — its odds of winning, times the pot; LEAVING — for the ask it would make, what the promises are
       worth: over each rival that would accept that ask, the rival's odds once this OA is gone × the share ×
       how likely that rival is to keep its word (its treachery, and the size of the promise, as the settlement
       judges it); less the standing it loses with the fans, valued as credits and weighted by its pride.
       A STRONG OA has the strongest hand: its going lifts every rival most, so they will promise it most. It
       posts when leaving beats staying, and a window later stands down only if the promises it actually got
       still do; otherwise it takes the offer back and fights on. (It replaced "leave below 4% odds" — ruled an
       oversimplification, and chosen for keeping a fatality rate steady, which the standing instruction says
       is not to be considered at all.) */
    /* §BASELINE THE ALEAS PULL A SPENT BANNER (temporary, ruled; a rule for every seat alike): an OA with fewer than
       this share of its people still standing is out of the contest, and those still standing come home. Measured:
       of 32 OA-contests 28 were eliminated and none left — a fighter is worth ₡3–10k and the pot ₡1.28M, so fighting
       to the last is the rational play — and the fallen lost 60% of those they fielded dead. No tuning of a hit moved
       that below ~42%: gentler hits only meant more fights. This rule, with severity's power weight at 0.75, puts
       a Divide at ~31% (six fresh Divides, 24–35% each); contests run ~21 days, not 28. */
    if (day >= CONST.LEAVE_EARLIEST_DAY) for (const c of corps) {
      if (!onGround(c)) continue;
      const all = c.allBodies || [], up = all.filter(b => b.status === 'active').length;
      if (all.length && up / all.length < CONST.BANNER_PULL_AT && corps.filter(onGround).length > 1) {
        stats.audit.bannersPulled = (stats.audit.bannersPulled || 0) + 1;
        standDown(c, day, stats, corps, 'pulled');
      }
    }
    for (const c of corps) {
      if (isHumanOA(c.id) || !onGround(c)) continue;
      /* §WITHDRAWAL THE LAST ONE STANDING HAS WON, AND DOES NOT LEAVE. Every OA in this pass weighs the field as it
         stood at dawn, so three could each find staying worthless and all three walk in one pass, the third off an
         empty ground: a contest with nobody left and no winner (one in forty). Once the others have gone, there is
         nothing to leave. */
      if (corps.filter(onGround).length <= 1) { stats.audit.lastStood = (stats.audit.lastStood || 0) + 1; break; }
      /* §MARKET THE DEADLINE: a force nearing the line is about to be pulled with nothing, so what fighting on is worth
         shrinks to nothing at the line — which is what makes selling an exit, while the force still counts, the play */
      const allB = c.allBodies || [], upShare = allB.length ? allB.filter(b => b.status === 'active').length / allB.length : 1;
      const margin = Math.max(0, Math.min(1, (upShare - CONST.BANNER_PULL_AT) / CONST.PULL_MARGIN));
      /* §GROUND WHAT STAYING IS WORTH IS THE POT AND THE GROUND. The pot share alone never paid for a month of
         losses — on the rebuilt ground, where the drop is fought over from day one, every banner priced itself off
         the field by the second window. The deposits are where the money is: an OA weighs its share of what is
         still open on standing ground, at what a dug site pays, beside its chance at the pot. */
      const openLeft = (planet.objectives || []).filter(o => o.type === 'resource_site' && !o.looted && (o.revealed || o.revealDay == null || o.revealDay <= day + 4) && (!planet.ground || GROUND.standingOn(planet.ground, day).some(r => r.id === o.region))).length;
      const digWorth = (opts.siteCash != null ? opts.siteCash : CONST.SITE_CASH_GUESS) * openLeft * (odds[c.id] || 0);
      const rows = leaveRows(c), stay = (POT * (odds[c.id] || 0) + digWorth) * margin - stayCost(c), cost = standingCost(c);
      const off = (stats.withdrawOffers || {})[c.id];
      if (off && off.sentDay < day) {
        let ask = (off.terms && off.terms.credits) || 0;
        for (const k in (off.terms || {})) if (k !== 'credits' && REP.CATEGORIES.indexOf(k) >= 0) ask += Math.max(0, Math.min(1, off.terms[k] || 0)) / 4;   /* its stores at their worth */
        /* §CENSUS a promise from a house that is itself leaving is worth nothing — only a winner pays — and seven
           houses had been standing down on the strength of each other's yeses, off an empty ground by the evening */
        const leaving = j => !!(stats.withdrawOffers || {})[j.id] || !onGround(j);
        const got = promisesWorth(rows, ask, r => off.replies[r.j.id] === true && !leaving(r.j));
        if (got - cost > stay) standDown(c, day, stats, corps);
        else { delete stats.withdrawOffers[c.id]; stats.audit.withdrawTakenBack = (stats.audit.withdrawTakenBack || 0) + 1; }
      } else if (!off) {
        let best = { ask: 0, ev: 0 };
        for (const r of rows) {
          const ask = Math.floor(r.maxAsk * 100) / 100;
          if (ask <= 0) continue;
          const ev = promisesWorth(rows, ask, x => x.maxAsk >= ask && !(stats.withdrawOffers || {})[x.j.id]);   /* not from those already on their way out */
          if (ev > best.ev) best = { ask: ask, ev: ev };
        }
        /* §WITHDRAWAL AN OA CAN WALK AWAY WITH NOTHING. It could leave only through a deal — an offer some rival
           promised against — so a beaten OA with no buyer for its exit fought on until it was eliminated, whatever
           staying cost it: in four contests 28 of 32 OAs fell, none left, and the fallen lost 60% of those they
           fielded dead. Walking off is the plain economic choice when staying is worth less than the standing it
           costs to go — the same Withdraw Now a manager has. It is weighed before any offer, and a deal worth more
           than walking still wins. */
        if (-cost > stay && !(best.ask > 0 && best.ev - cost > -cost)) {
          stats.audit.walkedAway = (stats.audit.walkedAway || 0) + 1;
          standDown(c, day, stats, corps);
          continue;
        }
        if (best.ask > 0 && best.ev - cost > stay) {
          /* §CENSUS a house whose board wants a store takes part of its price in that store, at the same worth */
          const terms = { credits: best.ask };
          const dem = ((c.rep && c.rep.goal && c.rep.goal.demands) || []).find(g => g.kind === 'resource' && g.category);
          if (dem && planet.pot) { terms.credits = Math.round(best.ask * 0.75 * 100) / 100; terms[dem.category] = Math.min(1, Math.round(best.ask * 100) / 100); }
          postWithdrawOffer(c, terms, day, stats);
          (stats.audit.offerLog = stats.audit.offerLog || []).push({ from: c.id, day: day, ask: best.ask,
            odds: Math.round((odds[c.id] || 0) * 1000) / 1000,
            standing: (c.allBodies || []).filter(b => b.status === 'active').length + '/' + (c.allBodies || []).length });
        }
      }
    }

    /* §JOINING RETIRED (ruled; finished here). Joining — an OA ceding the ground by coming in under
       another's banner — was replaced by the Withdrawal, and its panels cut; but the machinery went on
       running underneath: the post that carried join offers and invitations, the AI's join pass, and the
       principals courting spoilers. Measured before this cut: 10 joins and 7 stand-downs in four contests,
       none of it visible. All of it is gone. The Withdrawal is how an OA leaves. */

    /* §TRUCES CUT (ruled): there is no truce on the ground and none at the table. The Withdrawal is how an OA
       leaves; a ransom is the one deal struck over the wire. */

    /* N10 — prisoners bought back, as their own small deal at the same window. §6.15 A MANAGER
       ANSWERS HIS OWN: when his man is held, the captor's price waits on the window and he pays
       or does not; when he holds another OA's man, their offer to buy him back waits there and
       he sells or keeps. The willingness roll that used to answer for him answers only the AI. */
    /* §CHOICES (ruled: eight players) A RANSOM IS A CASE WITH TWO SIDES. The captor names a price — an engine seat
       by its policy (`ransomOffer`), a person at the list price — and each side answers: an engine seat at once by
       its policy (`ransomWorthPaying` for the owner), a person at their window. Both yes, it settles; either no, or
       the man no longer held, it closes. It was three branches — "the human is the owner", "the human is the
       captor", and the engine deciding BOTH sides at once for everyone else — and the manager's answers were
       never read at all: the window processed truces only, so Pay, Decline, Sell and Keep did nothing. */
    stats.ransomCases = (stats.ransomCases || []).filter(k => !k.done);
    for (const k of stats.ransomCases) {
      const owner = corps.find(c => c.id === k.owner), captor = corps.find(c => c.id === k.captor);
      const f = owner && owner.allBodies.find(b => b.id === k.fighter);
      if (!f || f.status !== 'captured' || !captor) { k.done = true; continue; }
      if (k.ownerYes === false || k.captorYes === false) { k.done = true; continue; }
      /* §TIME a person's answer is waited for, but not for ever: unanswered through its windows, the case lapses */
      if (k.ownerYes == null || k.captorYes == null) {
        k.waited = (k.waited || 0) + 1;
        if (k.waited > CONST.RANSOM_ANSWER_WINDOWS) { k.done = true; k.lapsed = true; stats.audit.ransomLapsed = (stats.audit.ransomLapsed || 0) + 1; continue; }
      }
      if (k.ownerYes && k.captorYes) {
        settleRansom({ kind: 'ransom', captor: captor.id, owner: owner.id, fighter: f.id, price: k.price, day: day, worth: k.worth }, f, owner, captor);
        k.done = true;
      }
    }
    for (const owner of corps) {
      for (const f of owner.allBodies) {
        if (f.status !== 'captured' || !f._capturedBy) continue;
        const captor = corps.find(c => c.id === f._capturedBy);
        if (!captor) continue;
        if (stats.ransomCases.some(k => k.fighter === f.id && !k.done)) continue;   /* already open */
        const aiCaptor = !isHumanOA(captor.id), aiOwner = !isHumanOA(owner.id);
        let price, worth;
        if (aiCaptor) {
          const offer = NEG.ransomOffer(rng, captor, owner, f, ctx);
          if (!offer) continue;                                        /* it will not sell him, this time */
          price = offer.price; worth = offer.worth;
        } else {
          price = Math.round(NEG.ransomPrice(f) * NEG.priceModifier(captor, owner));
          worth = Math.round(Math.max(300, NEG.bodyWorth(f)));
        }
        const ownerYes = aiOwner ? NEG.ransomWorthPaying(owner, f, price, ctx) : null;
        if (ownerYes === false) continue;                              /* the owner will not pay that */
        const k = { fighter: f.id, name: f.name, captor: captor.id, owner: owner.id, price: price, worth: worth,
                    day: day, captorYes: aiCaptor ? true : null, ownerYes: ownerYes, done: false };
        if (k.captorYes && k.ownerYes) {
          settleRansom({ kind: 'ransom', captor: captor.id, owner: owner.id, fighter: f.id, price: price, day: day, worth: worth }, f, owner, captor);
          continue;
        }
        stats.ransomCases.push(k);
      }
    }

    /* §JOINING RETIRED betrayal went with it: it turned on a banner — an OA that had come in under another
       and then turned on it — and with no banners it could not fire (0 in four contests). Breaking a TRUCE
       is the treachery left, and it is judged (§TRUCE). */
    /* what this window leaves standing, for the next window's reckoning */
    for (const j of corps) j._aliveAtWindow = (j.allBodies || []).filter(b => b.status === 'active').length;
    stats._lastWindowDay = day;
  }

  function squadCaptain(sq) {
    const avail = squadHead(sq);
    if (!avail.length) return null;
    const held = avail.find(b => b.id === sq.captainId);
    if (held) return held;
    /* COMBAT.md §10 succession: promote by tactics, and it costs. Previously the fallback
       silently returned a new captain with no succession cost at all. */
    /* `succession_candidate_priority` — a born captain is who the squad turns to, ahead of
       whoever merely has the best tactics score. Declared since Step 2, read by nothing;
       succession fires ~18 times a Divide, so it had plenty of chances to matter. */
    const heir = avail.slice().sort((a, b) => {
      const ba = C.hooksOf(a, ROSTER.traitById).has('succession_candidate_priority') ? 1 : 0;
      const bb = C.hooksOf(b, ROSTER.traitById).has('succession_candidate_priority') ? 1 : 0;
      if (ba !== bb) return bb - ba;
      return b.stats.tactics - a.stats.tactics;
    })[0];
    if (heir && sq.captainId !== heir.id) {
      /* §RANK SOMEBODY WANTED THAT JOB. Rank Climber's two hooks asked for promotion to be an
         event a fighter notices, and the first design for it was an ambition system. It is not
         needed: a captaincy already CHANGES HANDS here, on the day, when the last one falls.
         The man who takes it and is hungry for it steadies; the men passed over who wanted it
         take it badly. Nothing new happens — the same moment simply lands on people. */
      for (const b of avail) {
        const hk = C.hooksOf(b, ROSTER.traitById);
        if (b.id === heir.id) {
          if (hk.has('promotion_morale_surge')) b.condition.stress = Math.max(0, (b.condition.stress || 0) - CONST.RANK_SURGE);
        } else if (hk.has('captaincy_snub_morale_risk')) {
          b.condition.stress = (b.condition.stress || 0) + CONST.RANK_SNUB;
        }
      }
      sq.captainId = heir.id;
      addStress(sq, CONST.STRESS.succession);
      heir._stress = squadStress(sq);
      sq._successions = (sq._successions || 0) + 1;
    }
    return heir;
  }

  function squadStat(sq, stat) {
    const a = squadHead(sq);
    if (!a.length) return 80;
    /* §ONE AIM a squad's stat is the mean of its people's, on the sheet. This served the mean
       divided by ten to consumers written for the copy — and to one written for the sheet (the
       passive sighting below), which it silently broke. */
    return a.reduce((s, b) => s + b.stats[stat], 0) / a.length;
  }

  /* Build the live combat squad from surviving bodies. */
  function liveSquad(rng, corp, sq, day, engagementNo, traitIndex, ctxExtra) {
    const avail = squadHead(sq);
    if (!avail.length) return null;
    const cap = squadCaptain(sq);
    const mentorPresent = avail.some(b => (b.traits || []).includes('mentor'));
    /* §QUIRKS THE SITUATION A BODY IS IN, handed to the body as it is built — without it every
       situational condition answers false and a quirk written against one does nothing, which
       is the exact failure this catalogue is being rebuilt to escape. */
    const withConscript = avail.some(b => ((b.contract || {}).kind) === 'prisoner');
    const raceCount = {};
    for (const b of avail) raceCount[b.race] = (raceCount[b.race] || 0) + 1;
    const units = avail.map(f => C.makeCombatant(f, {
      traitIndex, isCaptain: f.id === cap.id, day,
      firstEngagement: engagementNo === 0, rookieSupport: mentorPresent, captainBonus: 0,
      squadSize: avail.length, withConscript: withConscript,
      onlyOfRace: raceCount[f.race] === 1,
      divides: (f.experience && f.experience.divides) || 0, age: f.age,
      health: (f.condition || {}).health, stress: (f.condition || {}).stress,
      captainPresent: !!cap, origin: (f.contract || {}).kind
    }));
    /* §9: a claimed sponsor cache is carried into the fight — as the REAL ITEMS it contained.
       What stood here was a squad-wide `gearTier` scalar and a five-row {power, protection}
       table, and when the tier was not exactly 3 it did not adjust a fighter's weapon, it
       REPLACED the object:

           u.weapon = { power, range, tier };   u.armor = { protection };

       so `tags` went (every quirk), `damage` went (the damage type), `resist` went (all three
       armour resistances), and with no rate tag tempo fell to default and ammunition was
       issued against that default. Measured over six Divides: it fired 64 times, on 291
       fighter-fights, discarding 339 weapon tags. A squad that looted a crate spent the rest
       of the Divide outside the model Step 7.5 built — and it read as a REWARD, +0.040 at
       tier 4 and +0.263 at tier 5 across two agreeing populations, because raw power 7/9
       outweighed everything it deleted. That is why nothing caught it.

       It was pre-catalog by construction: a five-row tier table is how you model kit before
       86 real items exist. PROCUREMENT.md §13 has said "that scalar is deleted" since Step 5
       and described the bundle that replaces it; this is that bundle, landed at last.
       (A crate once upgraded kit from the catalogue; a cache is a Landing Beacon now.) */
    const byId = {};
    for (const u of units) byId[u.id] = u;
    for (const u of units) {
      if (u.ref.bond_partner && byId[u.ref.bond_partner] && !u.pair) {
        const o = byId[u.ref.bond_partner];
        const pair = { comp: Math.round((u.comp + o.comp) / 2), halves: [u, o], downed: false, strained: false };
        u.pair = pair; o.pair = pair; u.comp = o.comp = pair.comp;
      }
    }
    /* §9 a munitions site is FOR this: the squad fights the next engagement resupplied */
    if (sq.ammoResupplied > 0) {
      for (const u of units) u.ammo = Math.round(u.ammo * CONST.RESUPPLY_MULT);
    }
    return Object.assign({
      corpId: corp.id, policy: corp.policy, units, hasMedkit: sq.hasMedkit,
      /* §STANCE HOW MUCH A SQUAD WILL LOSE BEFORE IT PULLS OUT — the one place a squad's stance
         belongs inside a fight. The grid called every withdrawal at the same 35% down, so a careful
         squad, once caught, fought on until two of four were down and then walked off under fire:
         measured, its one-on-one fights ran 11.3 turns to an All In squad's 5.0 and it lost more
         people than All In did. A careful squad pulls out at its first casualty; a reckless one holds. */
      withdrawAt: CONST.STANCE_WITHDRAW_AT[squadStance(sq)],
      fidelity: C.captainFidelity(cap, traitIndex),
      rationDry: sq.rationDry, directiveNudge: 0, _sq: sq
    }, ctxExtra || {});
  }

  /** Build one SIDE of a fight from one or more squads of the same corp. Two squads that
      arrived together fight as one body — that is what the pincer was for. */
  /* §LOOT (ruled) THE GROUND GOES TO WHOEVER HOLDS IT. A won fight cost the winner people and gave it nothing that
     helps it last, so in a contest won by the last banner standing every fight was a loss, only a smaller one for the
     side that fought better. Now the one side left holding the field strips today's enemy dead: their medkits, the
     rations their squads were carrying for them, and their guns — a fighter takes a dead man's gun when it is the
     better piece (it cost more) and he shoots it at least as well as his own, and carries his own home. What nobody
     takes up is carried off as spoils often enough (`LOOT_RECOVERY_P`), one spare a fighter, and comes home to the
     armoury if they do. Several sides still standing, or nobody: nobody loots. */
  function lootField(groups, broke, arrivals, deadBefore, day, stats, mx, my) {
    const tagOf = gi => String.fromCharCode(65 + gi);
    const holding = groups.map((g, gi) => gi).filter(gi => !broke[tagOf(gi)] && groups[gi].some(q => squadHead(q).length));
    if (holding.length !== 1) return;
    const wi = holding[0], winners = groups[wi].filter(q => squadHead(q).length);
    const wCorp = groups[wi][0].corp;
    for (const A of arrivals) if (A.gi === wi && squadHead(A.sq).length) winners.push(A.sq);
    const losers = [];
    groups.forEach((g, gi) => { if (gi !== wi) for (const q of g) losers.push(q); });
    for (const A of arrivals) if (A.gi !== wi && (A.gi < 0 || broke[tagOf(A.gi)])) losers.push(A.sq);
    const fallen = [];
    const L = stats.audit.loot = stats.audit.loot || { fights: 0, medkits: 0, rations: 0, guns: 0, spares: 0 };
    let took = false;
    for (const q of losers) {
      const here = q.bodies.filter(b => b.status === 'dead' && !deadBefore.has(b) && !b._stripped);
      if (!here.length) continue;
      /* the rations the dead were carrying: their share of the squad's */
      const alive = q.bodies.filter(b => b.status === 'active' || b.status === 'injured').length;
      const share = q.rations * here.length / Math.max(1, here.length + alive);
      if (share > 0) {
        q.rations -= share;
        const to = winners.slice().sort((a, b) => a.rations / Math.max(1, squadHead(a).length) - b.rations / Math.max(1, squadHead(b).length))[0];
        to.rations += share; L.rations += share; took = true;
      }
      for (const b of here) { b._stripped = true; fallen.push(b); }
    }
    if (!fallen.length) return;
    const standing = []; for (const q of winners) for (const b of squadHead(q)) standing.push({ b, q });
    if (!standing.length) return;
    /* medkits */
    for (const f of fallen) {
      const n = (f._charges && f._charges.itm_medkit) || 0;
      if (!n) continue;
      f._charges.itm_medkit = 0;
      const t = standing[0].b; t._charges = t._charges || {}; t._charges.itm_medkit = (t._charges.itm_medkit || 0) + n;
      L.medkits += n; took = true;
    }
    for (const q of winners) { q.medkits = medkitCharges(q.bodies); q.hasMedkit = q.medkits > 0; }
    /* guns: the best pieces first, each to the fighter it upgrades most */
    const costOf = id => { const it = id && ITEMS.byId(id); return it ? (it.cost || 0) : 0; };
    const guns = fallen.filter(f => f.loadout && f.loadout.primary && !C.hooksOf(f, ROSTER.traitById).has('never_drops_gear'))
      .map(f => ({ f, id: f.loadout.primary })).sort((a, b) => costOf(b.id) - costOf(a.id));
    for (const g of guns) {
      const it = ITEMS.byId(g.id); if (!it) continue;
      let best = null, gain = 0;
      for (const s of standing) {
        const lo = s.b.loadout || {}; if (!lo.primary) continue;
        const mine = ITEMS.byId(lo.primary);
        const up = costOf(g.id) - costOf(lo.primary);
        if (up <= 0) continue;
        if (ITEMS.shotOf(s.b, it) + CONST.LOOT_AIM_SLACK < ITEMS.shotOf(s.b, mine)) continue;   /* not a gun he shoots well */
        if (up > gain) { gain = up; best = s; }
      }
      g.f._lootedPrimary = true;
      if (best) {
        const lo = best.b.loadout;
        best.b._spareKit = [lo.primary].concat(lo.mods || []);       /* his own comes home on his back */
        ITEMS.equip(best.b, { primary: g.id, mods: [], sidearm: lo.sidearm, armor: lo.armor, consumables: lo.consumables || [] });
        L.guns++; took = true;
        stats._rec && stats._rec({ t: 'loot', x: mx, y: my, c: best.q.corpId, name: best.b.name, gun: it.name || g.id });
      } else if (P.mulberry32(P.seedFrom('loot' + day + g.f.id))() < ITEMS.CONST.LOOT_RECOVERY_P) {   /* its own draw: the fight's stream is untouched */
        const carrier = standing.find(s => !s.b._spareKit || !s.b._spareKit.length);
        if (carrier) { carrier.b._spareKit = [g.id]; L.spares++; took = true; }
      }
    }
    if (took) { L.fights++; if (wCorp) wCorp._lootFights = (wCorp._lootFights || 0) + 1; }
  }
  function liveSquadGroup(rng, squads, day, engagementNo, traitIndex) {
    const parts = squads.map(sq => liveSquad(rng, sq.corp, sq, day, engagementNo, traitIndex))
                        .filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    const units = [];
    for (const p of parts) for (const u of p.units) units.push(u);
    return {
      corpId: parts[0].corpId, policy: parts[0].policy, units,
      /* squads fighting as one side pull out together, at the mean of their thresholds */
      withdrawAt: parts.reduce((t, p) => t + (p.withdrawAt != null ? p.withdrawAt : CONST.STANCE_WITHDRAW_AT.standard), 0) / parts.length,
      hasMedkit: parts.some(p => p.hasMedkit),
      fidelity: Math.max.apply(null, parts.map(p => p.fidelity)),
      rationDry: parts.every(p => p.rationDry),
      directiveNudge: 0,
      _sq: parts[0]._sq, _parts: parts
    };
  }

  /* ------------------------------------------------------------------ */
  /* §5.2 supply                                                         */
  /* ------------------------------------------------------------------ */

  function rationDemand(sq, raceById) {
    let d = 0;
    for (const b of squadHead(sq)) {
      const r = raceById[b.race];
      d += (r && r.supply_mult) ? r.supply_mult : 1.0;
    }
    return d;
  }

  function consumeRations(sq, planet, raceById, hooksOfSquad, stats) {
    let demand = rationDemand(sq, raceById) * planet.supplyStrain * ((stats && stats.weatherToday && stats.weatherToday.fx.rations) || 1);
    /* §HALF-BUILT STRUCK (ruled): this read two hooks — `squad_supply_efficiency_up` (demand ×0.9) and
       `supply_consumption_down` (×0.92) — that NO TRAIT declares, so a squad that eats less could not exist
       and the lines never ran. To be rebuilt with the quirks, where the traits that carry them belong. */
    sq.rations -= demand;
    if (sq.rations < 0) sq.rations = 0;
    const heldDays = demand > 0 ? sq.rations / demand : 99;
    sq.rationShort = heldDays < CONST.RATION_SHORT_AT;
    sq.rationDry = sq.rations <= 0;
    if (sq.rationDry) sq.rationDryDays = (sq.rationDryDays || 0) + 1;
    else sq.rationDryDays = 0;
    return demand;
  }

  /* §5.2 FORAGING IS A DAY'S WORK, NOT A BACKGROUND HUM. It ran every morning for every squad, marching or fighting
     or not, with no ceiling on what a squad could hold — so on any ground better than barren the rations only grew
     (70 at the drop, 321 by day 20 in the play-through) and supply never bound anything. Now a squad forages at
     camp only on a day it neither marched nor fought, and carries no more than its people landed with plus the
     packs they brought: a column on the move eats down, a squad that holds good ground eats up. The planner knows
     it: a group short of rations weighs a rest site and holding ground higher (`CMD_W_SUPPLY`). */
  function rationCap(sq) {
    const packs = (sq.bodies || []).reduce((s, f) => s + ((f.loadout && f.loadout.consumables) || []).filter(c => c === "itm_field_rations").length, 0);
    /* a victualler's standing order stretched the drop's load past the plain carry; what they landed with per head is the cap */
    return Math.max(CONST.RATION_CARRY_DAYS, sq._rationPerHead || 0) * squadHead(sq).length + packs * CONST.RATION_PACK_DAYS;
  }
  function forage(rng, sq, planet, hooksOfSquad, posture, stats) {
    /* a squad that fought, or marched more than half a day, had no day to forage; a short shift to better ground did */
    if (sq.foughtToday || (sq._marched || 0) > CONST.TICKS_PER_DAY / 2) return 0;   /* §GROUND marched is ticks walked today */
    const cap = rationCap(sq);
    if (sq.rations >= cap) return 0;
    const reg = planet.ground && sq.zone != null ? planet.ground.regions[planet.ground.zones[sq.zone].region] : null;
    let yieldPer = CONST.FORAGE_YIELD[Math.max(0, Math.min(3, Math.round(reg ? reg.forage : 1)))] || 0;
    /* A forager whose people can eat what the rest cannot. The guard used to require
       `yieldPer === 0` — an exactly-barren tile — which never occurred on any archetype, so
       the trait was inert. It now applies wherever the ground is poor, which is what the
       trait is for. */
    if (yieldPer <= CONST.FORAGE_POOR && hooksOfSquad.has('forage_penalty_immune')) {
      yieldPer = Math.max(yieldPer, CONST.FORAGE_IMMUNE_FLOOR);
      if (stats) stats.audit.forageImmune = (stats.audit.forageImmune || 0) + 1;
    }
    if (planet.salvage) yieldPer += 0.15;
    yieldPer *= 1 + CONST.FORAGE_FIELDCRAFT * (squadStat(sq, 'fieldcraft') - 100);
    if (hooksOfSquad.has('forage_bonus')) yieldPer *= 1.4;
    if (hooksOfSquad.has('forage_value_up')) yieldPer *= 1.25;
    if (posture === 'forage') yieldPer *= CONST.FORAGE_POSTURE_MULT;
    const got = Math.min(cap - sq.rations, Math.max(0, yieldPer * squadHead(sq).length * (0.6 + 0.8 * rng())));
    sq.rations += got;
    if (stats) { stats.audit.forageEvents++; stats.audit.forageYield += got; }
    return got;
  }

  /* ------------------------------------------------------------------ */
  /* §5.3 hazards, §5.4 camp                                             */
  /* ------------------------------------------------------------------ */

  /* §5.3 what each kind of weather does. sight: detection that day; pace: the march; fatigue:
     per body per day; rations: the burn; lost: chance a squad loses its bearing; hurt: an
     injury chance per squad-day, on that terrain only (or anywhere, if no terrain is named);
     flood: how far the water rises, in height. */
  const WEATHER = {
    /* the Ice Shelf */
    cold:      { fatigue: 5, rations: 1.30 },
    whiteout:  { sight: 0.15, pace: 0.65, lost: 0.25 },
    crevasse:  { hurt: { terrain: 'crevasse_field', p: 0.40 }, pace: 0.85 },
    storm:     { sight: 0.45, pace: 0.55 },
    /* the Jungle Cradle */
    fever:     { hurt: { terrain: 'deep_canopy', p: 0.30 }, fatigue: 3 },
    downpour:  { sight: 0.55, pace: 0.70 },
    heat:      { fatigue: 7, rations: 1.20 },
    rot:       { rations: 1.35 },
    /* the Desert Pan */
    thirst:    { rations: 1.50, fatigue: 4 },
    sandstorm: { sight: 0.20, pace: 0.60, lost: 0.20 },
    glare:     { sight: 0.70, hurt: { terrain: 'salt_flats', p: 0.15 } },
    /* the Volcanic Waste */
    ashfall:   { sight: 0.40, fatigue: 4 },
    gas_vent:  { hurt: { terrain: 'lava_field', p: 0.45 } },
    tremor:    { pace: 0.75, hurt: { terrain: null, p: 0.06 } },
    /* the Drowned World */
    flooding:  { flood: 0.06, pace: 0.80 },
    current:   { hurt: { terrain: 'tidal_marsh', p: 0.30 }, pace: 0.85 },
    /* Dead Industrial */
    collapse:  { hurt: { terrain: 'ruins', p: 0.35 } },
    toxicity:  { hurt: { terrain: 'ruins', p: 0.20 }, fatigue: 4 },
    void:      { sight: 0.60, lost: 0.15 },
    fire:      { hurt: { terrain: 'ruins', p: 0.25 }, sight: 0.75 }
  };
  const CLEAR = {};
  /* the day's weather: rolled at dawn, carried on stats for every reader below */
  function rollWeather(rng, planet, stats, day) {
    let kind = null;
    if (rng() < CONST.WEATHER_P && planet.hazards && planet.hazards.length) kind = P.weightedPick(rng, planet.hazards);
    const fx = kind ? (WEATHER[kind] || CLEAR) : CLEAR;
    stats.weatherToday = { day, kind, fx };
    (stats.weather = stats.weather || []).push({ day, kind });
    if (kind) { stats.hazards++; stats.audit.hazardKind[kind] = (stats.audit.hazardKind[kind] || 0) + 1; }
    if (planet.setFlood) planet.setFlood(fx.flood || 0);
    if (stats._rec && kind) stats._rec({ t: 'weather', kind });
    return kind;
  }
  /* the weather's toll on one squad, once a day */
  function weatherCheck(rng, sq, planet, hooksOfSquad, stats) {
    const w = stats.weatherToday; if (!w || !w.kind) return null;
    const fx = w.fx, bodies = squadHead(sq);
    if (hooksOfSquad.has('hazard_forecast_bonus') && rng() < 0.60) return null;   // warned, and sheltered
    if (fx.fatigue) for (const b of bodies) b.condition.fatigue = Math.min(100, b.condition.fatigue + fx.fatigue);
    if (fx.lost && rng() < fx.lost && !hooksOfSquad.has('navigation_bonus')) sq._lostDay = true;
    if (fx.hurt && bodies.length) {
      const onIt = fx.hurt.terrain ? (planet.ground && sq.zone != null && planet.ground.regions[planet.ground.zones[sq.zone].region].terrain === fx.hurt.terrain) : true;
      if (onIt && rng() < fx.hurt.p * CONST.WEATHER_HURT_MULT) {
        const victim = bodies[Math.floor(rng() * bodies.length)];
        victim.condition.injuries.push({ type: 'inj_torso', severity: 'minor', days_remaining: P.int(rng, 4, 10), untreated: false });
        victim.status = 'injured'; victim._recovery = P.int(rng, 4, 10); victim._untreatedDays = 0;
        stats.hazardInjuries++;
        if (stats._rec) stats._rec({ t: 'hazard', x: sq.x, y: sq.y, kind: w.kind, c: sq.corpId });
      }
    }
    return w.kind;
  }

  /** Does anyone still standing in this squad carry the hook? Module-scope, uncached. */
  function squadHasHook(sq, hook) {
    for (const b of squadHead(sq)) if (C.hooksOf(b, ROSTER.traitById).has(hook)) return true;
    return false;
  }

  /** Does anyone in this corp carry the hook? Cached per Divide-day, since it is asked a lot. */
  function corpHasHook(corp, hook) {
    corp._hookCache = corp._hookCache || {};
    if (corp._hookCache[hook] === undefined) {
      let found = false;
      for (const b of corp.allBodies) {
        if (b.status === 'dead' || b.status === 'retired') continue;
        if (C.hooksOf(b, ROSTER.traitById).has(hook)) { found = true; break; }
      }
      corp._hookCache[hook] = found;
    }
    return corp._hookCache[hook];
  }

  function camp(rng, corp, sq, hooksOfSquad, stats) {
    const bodies = squadHead(sq);
    /* §6 — cells recharge overnight, and only overnight. A squad that fought twice today
       goes into tomorrow thin, which is the whole cost of carrying energy weapons. */
    for (const f of sq.bodies) {
      if (f._chargeMax == null) {
        const k = f.loadout && f.loadout.kit;
        f._chargeMax = (k && k.charge) || 0;
      }
      /* §LIGHT a sun-fed weapon is not charged at camp from cells: it takes what the day's light gave it —
         a whole day of sun fills it, a day of dark leaves it as it was */
      const solar = f.loadout && f.loadout.kit && (f.loadout.kit.tags || []).indexOf('daylight') >= 0;
      const gain = solar ? Math.round(f._chargeMax * ((stats && stats._lightShare != null) ? stats._lightShare : 0.5))
                         : CONST.CELL_RECHARGE;
      if (f._chargeMax > 0) f._charge = Math.min(f._chargeMax, (f._charge == null ? f._chargeMax : f._charge) + gain);
    }

    /* PROCUREMENT.md §2.3 — bulk. A squad carrying more than it can comfortably haul pays
       for it every day, and the Olmac and Svalbard `carry_bonus` is what lets a squad field
       the heavy weapons at all. Over capacity is legal; it is not free. */
    {
      const heads = squadHead(sq);
      /* `b.race` is the race's id; the bonus is on the race record's `special` (races.json). Read off the string, it was 0 for everyone. */
      const bonus = heads.reduce((s, b) => s + (((ROSTER.raceById[b.race] || {}).special || {}).carry_bonus || 0), 0)
                  + heads.filter(b => C.hooksOf(b, ROSTER.traitById).has('carry_bulk_up_2')).length * 2;
      const load = ITEMS.squadBulk(heads, bonus);
      sq.overBulk = load.over;
      if (load.over > 0) {
        const cost = load.over * ITEMS.CONST.OVER_BULK_FATIGUE;
        for (const b of heads) b.condition.fatigue = Math.min(100, b.condition.fatigue + cost / Math.max(1, heads.length));
        stats.audit.overBulkDays = (stats.audit.overBulkDays || 0) + 1;
      }
    }

    let recovery = CONST.FATIGUE_RECOVERY;
    if (sq._resting) recovery *= CONST.REST_RECOVERY_MULT;
    /* §13.1 stakeout_fatigue_reduced: holding position costs a squad far less */
    if (!sq.movedToday && hooksOfSquad.has('stakeout_fatigue_reduced')) recovery *= 1.5;
    if (hooksOfSquad.has('fatigue_recovery_down')) recovery *= 0.6;
    else if (hooksOfSquad.has('fatigue_recovery_down_slight')) recovery *= 0.85;

    let moraleDelta = 0;
    /* §HALF-BUILT STRUCK (ruled): the same — `camp_morale_aura` (+2 morale in camp) and
       `camp_morale_bonus_meals` (+3 on a full ration) are read by nothing that can ever be true, because no
       trait carries either hook. Camp morale comes back with the quirks. */
    if (sq.rationShort) moraleDelta -= 1;
    if (sq.rationDry) moraleDelta -= 4;
    if (sq.rationDryDays >= 4) moraleDelta -= 2;
    /* --- Step 6 audit: hooks declared in traits.json that no code had ever read ---------
       Every one of these belongs to a system that already runs, so their being inert was a
       gap rather than a deferral. Grouped here because they are all camp morale. */
    const day = sq._day || 1;
    const late = Math.min(1, day / GROUND.CONST.DAYS);
    /* a war priest steadies everyone around them */
    if (hooksOfSquad.has('faith_morale_aura')) { moraleDelta += 2; stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1; }
    /* gallows humour is worth most after a bad day */
    if (hooksOfSquad.has('squad_morale_support_after_losses') && sq._lostSomeone) { moraleDelta += 3; stats.audit.traitHooks++; }
    /* homesickness bites as the month drags */
    if (hooksOfSquad.has('morale_decay_long_divide')) { moraleDelta -= 1 + 2 * late; stats.audit.traitHooks++; }
    /* a prisoner counting down to freedom pulls the other way */
    if (hooksOfSquad.has('morale_up_as_freedom_nears')) { moraleDelta += 1 + 2 * late; stats.audit.traitHooks++; }
    /* the devout want a fight, and are told what the corp declared this turn */
    if (hooksOfSquad.has('death_or_glory_affinity')) {
      moraleDelta += (corp.policy === 'death_or_glory' ? 3 : corp.policy === 'unyielding' ? 1 : -2);
      stats.audit.traitHooks++;
    }
    /* ...and they take a corp selling its claim personally (N2 — ceding IS the deal) */
    if (corp.withdrawn) {
      if (hooksOfSquad.has('cede_loyalty_morale_penalty_major')) { moraleDelta -= 5; stats.audit.traitHooks++; }
      else if (hooksOfSquad.has('cede_loyalty_morale_penalty')) { moraleDelta -= 3; stats.audit.traitHooks++; }
    }
    /* squad chemistry: who is standing next to whom */
    /* §KESHU THE GRUDGE TESTED FOR A RACE THAT DOES NOT EXIST. It looked for somebody of race
       "keshu" in the squad — and Keshu is a PLANET, the water world the Attorak and the Gil
       fought over for fifty-five years before the Opes Arx brokered the peace. The trait is
       race-locked to those two, so the friction is between THEM: an Attorak who never signed
       the peace standing beside a Gil, or the other way round. As written it could never once
       have fired. */
    if (hooksOfSquad.has('friction_with_keshu_rival_race')) {
      const hasAttorak = bodies.some(b => b.race && b.race.id === 'attorak');
      const hasGil = bodies.some(b => b.race && b.race.id === 'gil');
      if (hasAttorak && hasGil) { moraleDelta -= CONST.KESHU_FRICTION; stats.audit.traitHooks++; }
    }
    if (hooksOfSquad.has('ankoth_sympathy_chemistry')
        && bodies.some(b => b.race && /ankoth/i.test(b.race.id || ''))) { moraleDelta += 2; stats.audit.traitHooks++; }
    /* a steady pair of hands gets the wounded back on their feet sooner */
    if (hooksOfSquad.has('evac_stabilize_bonus')) {
      for (const b of sq.bodies) if (b.status === 'injured' && b._recovery > 0) b._recovery -= 0.35;
      stats.audit.traitHooks++;
    }
    if (hooksOfSquad.has('camp_morale_contagion_both_ways')) moraleDelta *= 1.5;

    for (const b of bodies) {
      /* §CONSUMABLES a stimmed fighter pays for it that night: less rest out of the same camp */
      const rec = b._stimmed ? Math.max(0, recovery - CONST.STIM_NIGHT_COST) : recovery;
      b._stimmed = false;
      b.condition.fatigue = Math.max(0, b.condition.fatigue - rec);
      b.condition.morale = Math.max(5, Math.min(95, b.condition.morale + moraleDelta));
    }
    /* untreated wounds degrade in the field — nothing leaves a Divide (§5.4) */
    for (const b of sq.bodies) {
      if (b.status !== 'injured') continue;
      b._recovery = (b._recovery || 0) - 1;
      if (b._recovery <= 0) { b.status = 'active'; b.condition.fatigue = 25; continue; }
      /* COMBAT.md §7.1 degradation applies ONLY to wounds nobody has tended. A fighter
         carried back to your own camp is being tended — that is what a recovery IS. A
         squad with no medical kit cannot do that in the field, and those wounds walk.
         Guarding this on a flag nothing sets made every wound terminal (129/Divide). */
      const inj = b.condition.injuries[b.condition.injuries.length - 1];
      if (!inj || !inj.untreated) continue;
      b._untreatedDays = (b._untreatedDays || 0) + 1;
      if (b._untreatedDays < CONST.UNTREATED_DEGRADE_DAYS) continue;
      b._untreatedDays = 0;
      stats.audit.degradeChecks++;
      if (rng() >= CONST.DEGRADE_P) continue;
      const steps = ['minor', 'serious', 'critical'];      // never straight to permanent
      const i = steps.indexOf(inj.severity);
      if (i < 0 || i >= steps.length - 1) continue;
      inj.severity = steps[i + 1];
      stats.degradations++;
      b._recovery += 12;
    }
  }

  /* ------------------------------------------------------------------ */
  /* §8.2 captain stress                                                 */
  /* ------------------------------------------------------------------ */

  /* RULED — ONE STORE, THREE READERS. Stress lives on the BODY (`condition.stress`),
     persists past the Divide, and everything else derives: the squad's stress is the live
     mean of its people, the settlement aggregates the same truth, and combat's composure
     reads the same number. The old squad-level counter died with the squad each season, so
     a Divide's terror evaporated at the settlement; now it comes home in the people it
     happened to, and the year's rest is what works it back down. */
  function squadStress(sq) {
    let n = 0, sum = 0;
    for (const b of sq.bodies) {
      if (b.status === 'dead') continue;
      sum += (b.condition && b.condition.stress) || 0; n++;
    }
    return n ? sum / n : 0;
  }

  function addStress(sq, amount, stats) {
    for (const b of sq.bodies) {
      if (b.status === 'dead') continue;
      if (!b.condition) b.condition = {};
      b.condition.stress = Math.max(0, Math.min(CONST.STRESS_MAX,
                                                (b.condition.stress || 0) + amount));
    }
    /* combat.js reads `fighter._stress`; this is the bridge. Without it captain fidelity
       ran at stress 0 for the whole Divide and §8.2 was decorative. */
    const cap = squadCaptain(sq);
    if (cap) cap._stress = squadStress(sq);
    if (stats) stats.audit.stressApplied++;
  }




  /**
   * The corp's dawn planning. Runs once per corp per day and only re-tasks squads whose
   * intent has run out, so squads keep working a plan instead of re-deciding every morning.
   */
  /* ---- THE PICTURE: what a corp knows of everyone else's whereabouts ----
     `corp._picture[key]` = { sq, corpId, x, y, day, n, prestige } — where a foreign squad was
     when it was last seen, by whom it does not matter. Written by the landing (every OA,
     day 1), by contact (both sides, and their banners), and by the relay mast (everyone under
     the tower's banner). Read fresh: a sighting older than KNOWN_STALE is dropped, a landing
     after LANDING_KNOWN_DAYS. Nothing else hands a corp another's position. */
  /** §MIND how near an OA reads to this one: 5 pulls them in, 1 pushes them away, 3 is the
      truth. The manager's second lever, and the AI's own standing preferences ride the same
      wire — an OA that hates another leans toward it without being told. */
  /* §MAP HOW IT WAS SEEN, not only where: `via` travels with the sighting (a landing posted at the drop, a relay
     mast, a beacon heard, a squad watched or heard from the next zone, a contact), and so does the zone. */
  function recordSighting(corp, other, day, live, via) {
    if (!corp || !other || other.corpId === corp.id) return;
    corp._picture = corp._picture || {};
    corp._picture[other.corpId + ':' + other.sIdx] = { sq: other, corpId: other.corpId, zone: other.zone, x: other.x, y: other.y, day,
      n: squadHead(other).length, strength: squadHead(other).length, prestige: prestigeOf(other),
      landing: !!live, via: via || (live ? 'landing' : 'contact') };
  }
  function pictureOf(corp, day) {
    const out = [], P2 = corp._picture || {};
    for (const k in P2) {
      const e = P2[k];
      const age = day - e.day, limit = e.landing ? CONST.LANDING_KNOWN_DAYS : CONST.KNOWN_STALE;
      if (age > limit) continue;
      if (!squadHead(e.sq).length) continue;                  /* the dead do not need watching */
      if (allied(corp, e.sq.corp)) continue;                   /* your own side is not foreign */
      out.push(e);
    }
    return out;
  }
  /* §MAP WHAT THE MANAGER'S MAP MAY KEEP. The planner drops a sighting after KNOWN_STALE days
     and the moment the squad dies ("the dead do not need watching") — right for deciding,
     wrong for a map, where a foreign squad simply vanished. The map keeps a sighting to
     MAP_STALE days as last-known, with its age, and a squad known to be down as a remnant. */
  function pictureForMap(corp, day) {
    const out = [], P2 = corp._picture || {};
    for (const k in P2) {
      const e = P2[k];
      const age = day - e.day, limit = e.landing ? CONST.LANDING_KNOWN_DAYS : CONST.MAP_STALE;
      if (age > limit) continue;
      if (allied(corp, e.sq.corp)) continue;
      out.push(Object.assign({}, e, { down: !squadHead(e.sq).length, stale: age > (e.landing ? CONST.LANDING_KNOWN_DAYS : CONST.KNOWN_STALE) }));
    }
    return out;
  }
  /* ======================================================================================================
     §ROUTES (stage 2 of the AI rebuild) A SQUAD WALKS A ROUTE, NOT A RULER LINE. It stepped straight at its aim and,
     meeting water or a peak, swung its heading a little either way and took the first open footing — or stood still
     if there was none — so it bumped along lake shores and stalled against ridges. Now a squad whose straight line is
     blocked is given a route: a grid over the planet (`NAV_CELL`), the fastest way round by the ground's own pace
     (open plain before broken ground, the flat before the steep), pulled tight so it walks the corners and not the
     cells. Routes are kept until the aim moves or the day turns; the grid is rebuilt only when a flood changes what
     is passable.
     ====================================================================================================== */
  const NAV = new WeakMap();



  const APPROACH_LEAN = {
    preservationist: { contesting:0.35, reinforcing:1.00, hunting:0.50, resupplying:1.25, scouting:1.30, hiding:1.80, recovering:1.40, consolidating:1.20, prospecting:0.80, rallying:1.35, entrenching:1.40, baiting:0.30, sweeping:1.25, pressing:0.35, shadowing:1.20, screening:1.30, days:4 },
    measured:        { contesting:0.70, reinforcing:1.10, hunting:0.75, resupplying:1.15, scouting:1.15, hiding:1.30, recovering:1.20, consolidating:1.10, prospecting:0.90, rallying:1.20, entrenching:1.20, baiting:0.70, sweeping:1.15, pressing:0.70, shadowing:1.10, screening:1.15, days:4 },
    standard:        { contesting:1.00, reinforcing:1.20, hunting:1.00, resupplying:1.00, scouting:1.00, hiding:1.00, recovering:1.00, consolidating:1.00, prospecting:1.00, rallying:1.00, entrenching:1.00, baiting:1.00, sweeping:1.00, pressing:1.00, shadowing:1.00, screening:1.00, days:3 },
    unyielding:      { contesting:1.60, reinforcing:1.35, hunting:1.00, resupplying:0.90, scouting:0.85, hiding:0.60, recovering:0.85, consolidating:0.90, prospecting:1.25, rallying:0.80, entrenching:0.75, baiting:1.30, sweeping:0.85, pressing:1.10, shadowing:0.70, screening:0.85, days:3 },
    death_or_glory:  { contesting:1.90, reinforcing:1.45, hunting:1.25, resupplying:0.75, scouting:0.60, hiding:0.35, recovering:0.65, consolidating:0.80, prospecting:1.40, rallying:0.55, entrenching:0.45, baiting:1.60, sweeping:0.60, pressing:1.30, shadowing:0.40, screening:0.60, days:2 }
  };
  /* `prospecting` is new at Step 7 and it exists because the board's ask had no verb behind
     it. A corp was told at season open to bring back a named resource, and mining was a side
     effect of resupplying — so a demand was satisfied only if the right site happened to fall
     in the corp's lap, which measured at 1.6%. Weighting the site chooser did almost nothing
     (1.6% → 2.7%), because a squad only looks at sites when it is already short of supplies.
     What was missing was not a weight. It was an intention. */
  /* §MIND WHAT A SQUAD MAY BE DOING. The manager sets a stance and says which OAs he would
     rather his people found; everything below is the squads' own. The list is long on purpose —
     it is invisible to a manager, so it costs nothing to be various, and a contest where every
     squad is doing one of four things reads as four squads. */
  const APPROACHES = ['reinforcing', 'contesting', 'resupplying', 'hunting', 'scouting', 'hiding', 'recovering',
                      'consolidating', 'prospecting', 'rallying', 'shadowing', 'screening',
                      'entrenching', 'baiting', 'sweeping', 'pressing'];



  /* §BOLD WHAT IS WORTH TAKING. Boldness is fighting for the ground that pays — a deposit (cash at the close), a
     beacon (the OA's reinforcements, while it has anyone in orbit), a strongpoint, a crate — and taking it off whoever
     is working it when the odds allow, not walking about looking for people to kill. The best live objective in reach,
     inside tomorrow's line, by what it is worth to this OA; one an enemy is on counts for more to a bold squad and is
     skipped if that enemy is more than it can take. */


  /** Score, lean, commit. Nothing re-opens the question until it expires or is invalidated. */
  /** §MIND what the captain brings to the decision: judgement, sight, nerve, and how long a
      plan of theirs stands. A squad with nobody left to lead it decides badly, which is right. */
  function captainMind(sq) {
    const c = squadCaptain(sq);
    if (!c) return { judge: CONST.JUDGE_MIN, sight: CONST.SIGHT_NEAR, nerve: 0.55, days: CONST.PLAN_DAYS_MIN, cap: null };
    /* THE STATS RUN WIDER THAN A HUNDRED — a roster's tactics run about 14 to 144, the middle
       near 95 — so a captain is read against the spread the game actually deals, not against a
       hundred. Read against 100 every captain came out excellent. */
    const st = c.stats || {};
    const band = v => Math.max(0, Math.min(1, ((v == null ? CONST.MIND_MID : v) - CONST.MIND_LOW) / (CONST.MIND_HIGH - CONST.MIND_LOW)));
    let tac = band(st.tactics), fld = band(st.fieldcraft);
    /* §RACES A HUMAN LEADS. `captain_aptitude_bonus` sat in the data reading "feeds captain
       fidelity" and fed nothing. Captains decide now — judgement, sight, nerve — so the
       aptitude is worth exactly what it says: a human reads a situation better than the sheet
       alone would say. */
    if (c.race === 'human') tac = Math.min(1, tac + CONST.HUMAN_COMMAND);
    /* §PRESENCE AND A STEADY MAN STEADIES THE ONES AROUND HIM. A captain's nerve was his own
       resolve and presence; the squad he stands in had no say in it. The strongest presence
       among the others lifts (or drags) what the captain can hold together — which is what a
       squad's steadiest hand is FOR, and the second thing the stat now does. */
    let nerve = band((st.resolve || CONST.MIND_MID) * 0.65 + (st.presence || CONST.MIND_MID) * 0.35);
    const others = (sq && sq.bodies || []).filter(b => b !== c && b.status === 'active');
    if (others.length) {
      const best = Math.max.apply(null, others.map(b => (b.stats && b.stats.presence) || 90));
      nerve = Math.max(0, Math.min(1, nerve + ((best - 90) / 110) * CONST.PRESENCE_STEADIES));
    }
    /* a captain worn down reads worse than a fresh one: fatigue and stress are on the sheet */
    const worn = 1 - Math.min(0.5, ((c.condition && c.condition.fatigue || 0) * 0.004 + (c.condition && c.condition.stress || 0) * 0.003));
    return {
      cap: c,
      judge: CONST.JUDGE_MIN + (CONST.JUDGE_MAX - CONST.JUDGE_MIN) * tac * worn,
      sight: CONST.SIGHT_NEAR + (CONST.SIGHT_FAR - CONST.SIGHT_NEAR) * fld * worn,
      nerve: Math.max(0.1, Math.min(1, nerve * worn)),
      days: Math.round(CONST.PLAN_DAYS_MIN + (CONST.PLAN_DAYS_MAX - CONST.PLAN_DAYS_MIN) * tac * worn)
    };
  }



  /* the two ways size reads on the ground — see the RULED comment on the constants */
  /* §ROUTES the roles a company marches in (a squad's own rate, `rateOf`, lives in the day loop) */
  const COMPANY_ROLES = { take: 1, reinforce: 1, mend: 1, join: 1, advance: 1, hold: 1, support: 1, close: 1 };



  /* ------------------------------------------------------------------ */
  /* §9 objectives                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * §2.4 — a crate is looted, not claimed. The squad empties it and walks away with what
   * was inside; nobody owns the spot afterwards and nobody retakes it, because it is empty.
   * A relay mast is the exception, and not because it is held: it is infrastructure, so it
   * is SPENT rather than consumed. Firing it puts every squad on the planet on the corp's
   * map, then it goes dark for a few days and anyone may use it next. Staying at one would
   * waste the freedom it just handed you.
   */

  function awardObjective(rng, sq, obj, stats) {
    stats.audit.awarded[obj.type] = (stats.audit.awarded[obj.type] || 0) + 1;
    const pot = obj.potency || 1;
    if (obj.type === 'relay_mast') {
      obj.dark = (sq._day || 0) + MAP.CONST.RELAY_COOLDOWN;
      obj.work = {};
      obj.lootedBy = sq.corpId;
      /* N22 (ruled) — an UMBRELLA shares intelligence. A mast fired by one member maps the
         planet for everyone under the same banner, not just the corp that climbed the tower.
         This is a real benefit of joining, and one of the few that costs the principal
         nothing to give: a banner that can see is a banner worth being under.

         Note who is excluded. Corps in a non-aggression pact are NOT allied — a truce is an
         agreement not to shoot, not a shared map — and neither is a corp that has stood down,
         since standing down is a promise not to fight rather than a promise to be blind. */
      const sharers = [];
      for (const c of (stats._corps || [])) if (allied(sq.corp, c)) sharers.push(c);
      if (!sharers.length) sharers.push(sq.corp);
      for (const holder of sharers) {
        for (const mate of holder.squads) {
          if (!squadHead(mate).length) continue;
          mate.intelUntil = (sq._day || 0) + CONST.RELAY_INTEL_DAYS + (obj.wave || 0);
          mate.known = mate.known || {};
          for (const c of (stats._corps || [])) {
            if (allied(sq.corp, c)) continue;             /* you already know your own side */
            for (const other of c.squads) {
              if (!squadHead(other).length) continue;
              mate.known[other.corpId + ':' + other.sIdx] = sq._day || 0;
              recordSighting(holder, other, sq._day || 0, false, 'relay');
            }
          }
        }
      }
      if (sharers.length > 1) stats.intelShared = (stats.intelShared || 0) + sharers.length - 1;
      sq.noise = 1;                          /* you transmitted: everyone heard it */
      if (stats._rec) stats._rec({ t: 'relay', x: obj.x, y: obj.y, c: sq.corpId, place: obj.place });
      stats.relayFirings = (stats.relayFirings || 0) + 1;
      return;
    }
    if (obj.looted) return;
    obj.looted = true; obj.lootedBy = sq.corpId;
    /* WHO HOLDS IT. `heldBy` was read in four places and written in none, anywhere in the tree:
       a squad would not plan a claim on a site it already held (never true, so it re-planned
       them), an engagement was FORCED when you stood on a rival's claim (never true, so ground
       was never contested), a fight over a held site was worth 1.5 against 0.8 for an empty one
       (always 0.8, so taking ground off somebody was worth exactly what walking onto empty
       ground was worth), and the recorder reported who held every site as `undefined`, which is
       why no map could ever have shown it. Claiming a site is what makes you the holder. */
    obj.heldBy = sq.corpId;
    /* running tally so a corp that already has what its board asked for stops prospecting
       and goes back to the contest — otherwise the new approach never releases the squad */
    if (obj.type === 'resource_site' && obj.resource && sq.corp) {
      sq.corp._banked = sq.corp._banked || {};
      sq.corp._banked[obj.resource] = (sq.corp._banked[obj.resource] || 0) + Math.round(obj.potency || 1);
    }
    /* `retake` stays the literal false, and that is correct rather than lazy: a site is
       looted once (`if (obj.looted) return` above) because these are crates, not capture
       points, by ruling. Ground does not change hands, so nothing can be retaken. Computing it
       would produce a field that is false by construction, which is the thing this project
       keeps finding and removing. */
    if (stats._rec) stats._rec({ t: 'claim', x: obj.x, y: obj.y, c: sq.corpId, lbl: obj.label, place: obj.place, retake: false });
    sq.corp.sitesClaimed++;
    stats.claims++;
    switch (obj.type) {
      case 'munitions_drop': for (const f of sq.bodies || []) chargeUp(f); sq.medkits = medkitCharges(sq.bodies || []); sq.hasMedkit = sq.medkits > 0;
        stats.audit.restocks = (stats.audit.restocks || 0) + 1;
        sq.ammoResupplied += Math.max(1, Math.round(pot)); stats.audit.ammoResupply++; break;
      case 'ration_site': {
        /* §5.2 a site fills the packs; it does not make them bigger (the carry cap holds here as at the forage) */
        sq.rations = Math.min(Math.max(sq.rations, rationCap(sq)), sq.rations + CONST.RATION_DROP_DAYS * squadHead(sq).length * 0.8 * pot);
        /* §SITES and it mends: a day's shelter and care takes the edge off every wound the
           squad is carrying, and stands a lightly hurt fighter back up */
        /* in a contest a wound is carried as `_recovery`, the days until a fighter can stand
           again (the season's `condition` is written from it at the close) */
        /* A wound in a contest runs 20 to 95 days, and a contest runs about 24: a fixed six
           days off could never stand anybody back up — it was inert by construction. Shelter
           halves what is left of every wound, and stands up anyone whose wound it brings under
           a few days, which is the difference between a fighter lost for the contest and one
           who can walk the last ground. */
        for (const b of sq.bodies || []) {
          if (b.status !== 'injured') continue;
          b._recovery = (b._recovery || 0) * CONST.REST_HALVES;
          if (b._recovery <= CONST.REST_STANDS_UNDER) {
            b.status = 'active'; b._recovery = 0;
            stats.audit.restedBack = (stats.audit.restedBack || 0) + 1;
          }
        }
        stats.audit.restSites = (stats.audit.restSites || 0) + 1;
        break;
      }
      case 'strongpoint':
        /* held rather than emptied: the site stays, and belongs to whoever is standing on it */
        obj.looted = false; obj.heldBy = sq.corpId;
        stats.audit.strongpointsTaken = (stats.audit.strongpointsTaken || 0) + 1;
        break;
      case 'resource_site':      sq.corp.hauled += Math.round(pot); break;
    }
  }

  /**
   * §14 → the tactical resolver: how ready a squad was for the fight it is now in.
   * This is the bridge between the approach a squad was working and the ground it gets to
   * fight from. A squad that spent the day choosing where to be starts behind cover; one
   * that walked into contact starts wherever it was walking. It is a lean, not a verdict —
   * an aggressor should pay something for aggression, not be beaten by it.
   */
  const PREP_BY_APPROACH = {
    hiding: 0.30, recovering: 0.25, holding: 0.20, scouting: 0.05,
    resupplying: 0.00, consolidating: 0.00, hunting: -0.20, flanking: -0.25
  };
  function preparedness(sq, opts) {
    opts = opts || {};
    let p = 0.50;
    p += PREP_BY_APPROACH[sq.approach] || 0;
    if (!sq.movedToday) p += 0.15;              /* you had time to look at the ground */
    if (sq._hunted) p -= 0.10;                  /* you came looking: you take what is there */
    if (opts.sawFirst) p += 0.15;               /* you watched them walk into it */
    /* §SITES fighting from a strongpoint you hold is fighting from ground you chose and dug */
    if (opts.strongpoint) { p += CONST.STRONGPOINT_PREP; sq._onStrongpoint = true; }
    if (opts.rivalEdge) p += opts.rivalEdge;    /* Gather Intel: you studied this OA's game */
    const head = squadHead(sq);
    if (head.length) {
      const fc = head.reduce((s, b) => s + b.stats.fieldcraft, 0) / head.length;
      p += (fc - 100) * 0.0012;                   /* fieldcraft is the choosing-ground stat */
    }
    if (sq._resting) p += 0.10;
    /* INTEL OPS. What a corp spent its prep turns looking at. Gather Intel keeps a per-corp
       dossier on the planet; `season.js` reads its completeness into `planetPreparedness` and
       passes that down with the drop as `_intel`, and it buys readiness on the ground for the
       whole Divide — you have seen this rock before, and the people who have not are finding
       out. (This replaced a flat `_scouted` scalar that was accumulated but, for a whole step,
       read by nothing.) It is capped, because ten turns of staring does not make you psychic. */
    if (sq._intel) p += Math.min(CONST.INTEL_CAP, sq._intel);
    return Math.max(0.05, Math.min(0.95, p));
  }

  /* ------------------------------------------------------------------ */
  /* §7.3 STANCE IS A TURN-BY-TURN DIAL (rewritten, Step 6)              */
  /* ------------------------------------------------------------------ */

  /* What this replaces, and why it was wrong.
     
     Stance used to be picked once and held for the whole Divide: a rigidity score above
     RIGIDITY_BLOCK forbade any change at all (Nevlon at 100 could never move), a change
     required losing 30% of the force, and it cost 12 stress a squad. Nevlon and Violet's
     therefore never shifted once, in any Divide, ever.

     That was a misreading. The engagement notches are a LIGHT TUNING DIAL — the manager's
     way of nudging how squad leaders organise for the next couple of days. Both poles do
     everything; they just reach for different options at different rates. It is not a
     costly public oath, it is a setting you change when the board changes.

       - changing costs NOTHING (the stress charge was invented, and is gone)
       - no corp is locked out of any notch, ever
       - what varies is the PULL: a corp's culture gives it a home on the ladder, and
         `rigidity` is now how hard that culture pulls it back rather than a gate
       - the situation pulls too — being hurt pulls toward care, being ahead and being
         penned in pull toward aggression

     Cultural identity — Nevlon refusing to negotiate, a corp known for keeping its people
     alive — is a SEPARATE and permanent thing, held in oa_profiles. It is not a stance. */

  /** Where a corp's culture sits on the ladder, 0 (preservationist) to 4 (death_or_glory). */
  function culturalHome(corp) {
    const d = (corp.profile && corp.profile.dials) || {};
    const agg = (d.aggression != null ? d.aggression : 50) / 100;
    const pat = (d.patience != null ? d.patience : 50) / 100;
    /* aggression pushes up the ladder, patience pulls down it */
    return Math.max(0, Math.min(4, 0.6 + 3.4 * agg - 1.1 * (pat - 0.5)));
  }

  /**
   * Pick the notch for the next couple of days. Called at every corp window, for every corp,
   * and it is free. Returns true if the notch actually moved.
   */
  /* §STANCE each squad's notch around its OA's: the strongest a step bolder, the weakest a step more careful */
  function seatSquadStances(corp) {
    const base = NOTCHES.indexOf(corp.policy || 'standard');
    const live = (corp.squads || []).filter(q => squadHead(q).length);
    const ranked = live.slice().sort((a, b) => squadHead(b).length - squadHead(a).length);
    ranked.forEach((q, i) => {
      const step = i === 0 && ranked.length > 1 ? 1 : i === ranked.length - 1 && ranked.length > 1 ? -1 : 0;
      q.stance = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, (base < 0 ? 2 : base) + step))];
    });
  }
  /* §CENSUS THE GROUND HAS A SAY ABOUT EACH RIVAL. An engine OA set its notch at every rival once, at the drop, by
     regard, and never looked again. Each window it now starts from that and weighs what is on the ground: a rival much
     stronger than it is handled more carefully, a bled one pressed harder by a house with the stomach for it. */
  function reconsiderRivals(corp, corps) {
    if (!corp._stanceBase) return;
    const living = j => (j.allBodies || []).filter(b => b.status === 'active').length;
    const mine = Math.max(1, living(corp));
    const d = (corp.profile && corp.profile.dials) || {};
    const bold = (typeof d.aggression === 'number' ? d.aggression : 50) / 100;
    for (const other of corps) {
      if (other === corp || corp._stanceBase[other.id] == null) continue;
      const ratio = living(other) / mine;
      const adj = ratio > 1.6 ? -1 : ratio < 0.6 && bold > 0.5 ? 1 : 0;
      const base = NOTCHES.indexOf(corp._stanceBase[other.id]);
      corp._stance[other.id] = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, (base < 0 ? 2 : base) + adj))];
    }
  }
  function reconsiderStance(rng, corp, stats, ctx) {
    ctx = ctx || {};
    const home = culturalHome(corp);
    const alive = corp.allBodies.filter(b => b.status === 'active' || b.status === 'injured').length;
    const lostFrac = 1 - alive / Math.max(1, corp.allBodies.length);

    /* The situation's opinion, in notches away from home. */
    let pull = 0;
    pull -= CONST.STANCE_PULL_HURT * lostFrac;              /* bleeding pulls toward care */
    if (ctx.penned) pull += CONST.STANCE_PULL_PENNED;       /* nowhere left to hide */
    if (ctx.ahead) pull += CONST.STANCE_PULL_AHEAD;         /* an opening is worth taking */
    if (corp.standDown) pull -= 2.0;                        /* they agreed not to fight */

    /* Rigidity is now a WEIGHT, not a gate: a rigid corp's culture argues louder than the
       board does. Nevlon still trends aggressive without ever being locked to one notch. */
    const w = corp.rigidity / 100;
    const target = home + pull * (1 - w * 0.65);

    /* Sample around the target rather than snapping to it, so a corp explores the ladder
       and no notch is ever off the table. */
    let pick = 0;
    {
      /* §COMMAND A STANCE IS A DECISION, NOT A DRAW. It was sampled around its target with a spread near a whole notch,
         so an OA lurched between death-or-glory and unyielding and back from one window to the next, and its squads'
         whole bearing with it. It now moves toward the notch its culture and its situation point at, one step a
         window, and only when that target is clearly away from where it stands. */
      const cur = Math.max(0, NOTCHES.indexOf(corp.policy));
      pick = Math.abs(target - cur) < CONST.STANCE_HYSTERESIS ? cur : cur + Math.sign(target - cur);
      pick = Math.max(0, Math.min(NOTCHES.length - 1, pick));
    }


    const next = NOTCHES[pick];
    if (next === corp.policy) return false;
    /* A tradition keeper's people dislike being redirected every other day. The hook was
       written for the old once-a-season model and never read; under a turn-by-turn dial it
       finally has something to resist. It does not BLOCK the change — the manager decides —
       it charges morale for the whiplash. */
    if (corpHasHook(corp, 'doctrine_change_resistance') || corpHasHook(corp, 'policy_whiplash_morale_penalty_up')) {
      const bite = corpHasHook(corp, 'policy_whiplash_morale_penalty_up') ? 2 : 1;
      for (const q of corp.squads) for (const b of squadHead(q)) {
        b.condition.morale = Math.max(5, b.condition.morale - bite);
      }
      stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1;
    }
    const from = corp.policy;
    corp.policy = next;
    corp.stanceChanges++;
    stats.stanceChanges++;
    if (stats._rec) stats._rec({ t: 'stance', c: corp.id, from: from, to: next });
    /* No stress. Changing your mind about how to approach the next two days is not an injury. */
    for (const sq of corp.squads) sq.policy = next;
    /* §STANCE THE NEW NOTCH REACHES THE SQUADS. An AI OA seats each squad's own notch at the drop, and a squad's own
       notch is what its behaviour reads — so every window's reconsidering changed the OA's word and none of its squads:
       they fought the whole contest on the notch they landed with. They are re-seated around the new one. */
    seatSquadStances(corp);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Outcome application                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Whoever in this squad — or in the squads it is fighting alongside — still has a kit.
   * A combined position shares its medical supplies; that is what a combined position is.
   */
  function medkitHolder(sq) {
    if (sq.medkits > 0) return sq;
    for (const p of (sq._parts || [])) if (p.medkits > 0) return p;
    /* a friend's kit is to hand in the same zone or the next */
    if (sq.corp && sq.zone != null) for (const q of sq.corp.squads) if (q.medkits > 0 && q.zone != null && (q.zone === sq.zone || (sq.corp._ground && sq.corp._ground.zones[q.zone].nb.indexOf(sq.zone) >= 0))) return q;
    return null;
  }

  /** Permanent losses and current wounded, read from a corp's own bodies. */
  function tallyCorp(corp) {
    let permanent = 0, injured = 0;
    for (const b of corp.allBodies) {
      if (b.status === 'dead' || b.status === 'retired') permanent++;
      else if (b.status === 'injured') injured++;
    }
    return { permanent: permanent, injured: injured };
  }

  /**
   * REPUTATION.md §4.2 — a share of a famous victim's fame moves to whoever put them down.
   * The resolver does not attribute a kill to a shooter (it works on sides, not duels), so
   * the transfer is spread across the fighters who were actually there on the other side.
   * That is the honest resolution at this granularity: the squad that took them down gets
   * the credit, not a name drawn out of a hat.
   */
  /* §SNOWBALL EVERYONE LOVES AN UNDERDOG: fame for a kill scales with how far UP it was aimed — against an OA that
     finished above yours last year it pays more, against one below less — and one of last year's champion's own is
     worth the most of all. The places are last year's (1 the champion); a first year has none. */
  let CORPS_REF = [];                    /* the contest being run, for the hunters' view of the field */
  const lastPlaceOf = (c) => c ? ((c.persist && c.persist.lastPlace) || c._lastPlace || null) : null;
  function underdogMult(victimCorp, takerCorp) {
    const vp = lastPlaceOf(victimCorp), tp = lastPlaceOf(takerCorp);
    if (!vp || !tp) return 1;
    let m = 1 + CONST.UNDERDOG_FAME_PER_PLACE * (tp - vp);           /* places climbed: positive hitting up */
    if (vp === 1) m += CONST.CHAMPION_FAME_BONUS;
    return Math.max(CONST.UNDERDOG_FAME_FLOOR, m);
  }
  /* §STANDING a faction's lean, −1..1 about indifference and weighted by its share of the stands */
  function factionLeanOf(corp, f) { return corp && corp.rep ? (corp.rep.shares[f] || 0) * (REP.standing(corp.rep, f) - 50) / 50 : 0; }
  function transferFame(victim, takers, victimCorp, takerCorp) {
    /* §STANDING a warm Bloodhounds faction roars for a kill: the name travels further */
    const gain = REP.fameTransfer(victim.fame || 0, 1) * underdogMult(victimCorp, takerCorp)
               * (1 + Math.max(0, factionLeanOf(takerCorp, 'bloodhounds')) * CONST.BLOODHOUND_FAME);
    if (!(gain > 0) || !takers.length) return 0;
    const each = gain / takers.length;
    for (const t of takers) {
      let g = each;
      /* The crowd finds some people and loses others. Read by HOOK, not by trait id: the
         hooks are the contract, ids are not, and reading ids is how a renamed trait silently
         stops working. Eight of these had been declared and read by nothing since Step 2. */
      /* §PRESENCE THE CROWD NOTICES SOME PEOPLE MORE. Presence was copied onto every combatant
         and read NOWHERE in the fight, and outside it was thirty-five per cent of one captain's
         nerve and nothing else — a stat on every sheet, raised by training, bought by quirks,
         and worth almost nothing. A hand the crowd can see earns fame faster for the same work:
         at the bottom of the scale a little less than his share, at the top half again. */
      /* the middle of the sheet's range when a stat is missing — MIND_MID is already on the sheet
         scale (90); multiplying it by ten again put a missing Presence at 900 */
      g *= REP.presenceFameMult(t);    /* §PRESENCE the one rule for every fame a fighter earns */
      const h = C.hooksOf(t, ROSTER.traitById);
      if (h.has('fame_gain_up')) g *= 1.5;
      if (h.has('heel_fame_gain')) g *= 1.4;
      if (h.has('fame_gain_up_on_aggression')) g *= 1.35;
      if (h.has('fame_volatility_up')) g *= 1.8;
      if (h.has('crowd_pleaser_movement')) g *= 1.25;
      /* the broadcast reads some fighters better than others: one whose brutality cuts
         cleanly, one whose voice the relay keeps for colour */
      if (h.has('crowd_legible_savagery')) g *= 1.3;
      if (h.has('broadcast_color')) g *= 1.15;
      if (h.has('fame_gain_down')) g *= 0.4;
      if (h.has('media_statements_flat')) g *= 0.7;
      REP.addFame(t, g);
    }
    return gain;
  }

  function applyOutcome(sq, side, stats, captorId, victors) {
    let killed = 0, downed = 0;
    /* a combined side hands each fighter back to the squad they marched in with */
    const owner = {};
    if (side._parts) for (const p of side._parts) for (const u of p.units) owner[u.id] = p._sq;
    for (const u of side.units) {
      const f = u.ref;
      if (u.state === 'dead') {
        f.status = 'dead'; stats.dead++; killed++;
        /* §3.1 / §4.2 — who did it, whose they were, and how well known they were. Without
           this the `their_dead` act and every fame transfer are unreachable. */
        if (victors && victors.corp && victors.corp.rep) {
          const bag = (victors.corp._killsBy = victors.corp._killsBy || {});
          const e = (bag[f._oaId || sq.corpId] = bag[f._oaId || sq.corpId] || { n: 0, famous: 0 });
          e.n++;
          if ((f.fame || 0) >= REP.CONST.FAME_CEIL * 0.35) e.famous++;
          /* the victim's OA: a combined side hands each fighter back to the squad they marched in with */
          const vsq = owner[u.id] || sq;
          transferFame(f, victors.bodies || [], vsq && vsq.corp, victors.corp);
        }
      }
      else if (u.state === 'captured') {
        f.status = 'captured'; stats.captured++; stats.audit.capturedAlive++;
        /* N10 — a captive belongs to somebody, and who that is decides their fate at the
           end. Recording it was missing: they were taken by nobody and resolved by nobody. */
        f._capturedBy = captorId || null;
      }
      else if (u.injury) {
        /* A wound is tended if there is a kit left to tend it with. Kits are finite and
           nothing resupplies them mid-Divide, so a squad that takes casualties steadily
           runs out and the later wounds walk (§5.4, §7.1). */
        const kit = medkitHolder(sq);
        if (kit) { kit.medkits--; kit.hasMedkit = kit.medkits > 0; takeMedkitCharge(kit.bodies || []); if (stats) stats.audit.medkitsUsed = (stats.audit.medkitsUsed || 0) + 1; }
        else { u.injury.untreated = true; if (stats) stats.audit.untendedWounds = (stats.audit.untendedWounds || 0) + 1; }
        f.condition.injuries.push(u.injury);
        downed++;
        if (u.injury.permanent) { f.status = 'retired'; stats.careerEnded++; }
        else { f.status = 'injured'; f._recovery = u.injury.days_remaining; f._untreatedDays = 0; stats.injured++; }
      } else if (u._braindead || u._traumatized) { f.status = 'retired'; stats.careerEnded++; }
      else {
        f.condition.morale = Math.max(5, Math.min(95, Math.round(0.7 * f.condition.morale + 0.3 * u.comp)));
        f.condition.fatigue = Math.min(100, f.condition.fatigue + 12
          + (u.hooks.has('post_engagement_fatigue_spike') ? 8 : 0));
        if (u.wounds.length) stats.lightWounds++;
      }
    }
    if (side._parts) {
      for (const p of side._parts) addStress(p._sq, (CONST.STRESS.killed * killed + CONST.STRESS.downed * downed) / side._parts.length, stats);
    } else {
      addStress(sq, CONST.STRESS.killed * killed + CONST.STRESS.downed * downed, stats);
    }
    if (!killed && !downed) addStress(sq, CONST.STRESS.cleanWin, stats);
    return killed + downed;
  }

  /* ------------------------------------------------------------------ */
  /* The Divide                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * THE DIVIDE IS STEPPABLE. It was one call that ran a whole contest with nothing able to stop
   * it partway — fine for a fleet of AI corps and useless for a manager who is supposed to sit
   * down every couple of days and decide something.
   *
   * It is a GENERATOR rather than a begin/step/finish split like the season's. The season broke
   * cleanly into phases; this does not — the day loop closes over the planet, the corps, the
   * stats, the recorder and a dozen other locals, and prising those apart into a state object
   * would be a rewrite of the one function in the tree least able to afford a silent mistake.
   * A generator pauses and resumes with every closure intact, so the loop below is the loop
   * that was already there, with one `yield` added at the decision window.
   *
   * `runDivide` remains, and is now a driver that runs the generator to the end. Every existing
   * caller is untouched, and — this is the part that matters — the stepped path and the
   * unstepped path are the SAME code, so they cannot drift into two different contests.
   */
  function* divideCore(rng, opts) {
    opts = opts || {};
    const traitIndex = opts.traitIndex || ROSTER.traitById;
    const raceById = opts.raceById || ROSTER.raceById;
    const oaProfiles = opts.oaProfiles;
    const split = opts.split || '3x8';
    const posture = opts.posture || 'standard';

    /* THE PLANET IS ANNOUNCED AT THE SEASON OPEN, not discovered on the way down. A caller that
       already told its corps which rock this is passes that rock in as `opts.groundTruth`, and
       the Divide fights on the same object the board wrote its card against. */
    const planet = opts.groundTruth || MAP.generatePlanet(rng, opts.planet || {});
    if (!planet.pot) planet.pot = NEG.rollPot(rng, planet.archetype, planet.richness);
    /* §GROUND THE GROUND IS REGIONS OF ZONES (sim/ground.js), generated with the season from the world seed; a
       caller running a single Divide gets one rolled here. The planet dossier's objectives are the ground's sites. */
    const ground = opts.ground || planet.ground || GROUND.generate(rng, { archetype: planet.archetype });
    if (planet.ground !== ground) { planet.ground = ground; planet.objectives = GROUND.objectivesOf(ground); }
    const objAt = {}; for (const o of planet.objectives) if (o.zone != null) objAt[o.zone] = o;
    const LAST_DAY = ground.days;
    const Z = ground.zones, RG = ground.regions;
    /* §SITES whether a site is worth standing on today */
    const siteLive = (o, day) => { if (!o) return false; if (o.type === 'relay_mast') return day >= (o.dark || 0); if (o.type === 'resource_site' && day < (o.opens || 1)) return false; return !o.looted; };

    const corps = [];
    CORPS_REF = corps;
    _humans = new Set((opts.humans && opts.humans.length) ? opts.humans : (opts.human ? [opts.human] : []));
    _manager = (opts.humans && opts.humans.length) ? opts.humans[0] : (opts.human || null);
    corpsRef = corps;
    const corpCount = opts.corpCount || 8;
    for (let i = 0; i < corpCount; i++) {
      const profile = oaProfiles[i % oaProfiles.length];
      let stance;
      if (opts.policyFor) stance = opts.policyFor(i, profile);
      else stance = STANCE_OVERRIDE[profile.id] || profile.engagement_lean || 'standard';
      const rigidity = opts.flatRigidity != null ? opts.flatRigidity : null;
      const persist = (opts.corps && opts.corps[profile.id]) || null;
      const corp = buildCorp(rng, profile, stance, split, rigidity, null, planet, persist, opts.season || 1);
      if (persist) { persist.fielded = corp.allBodies; persist.kitValue = corp.kitValue || 0; persist.kitSpend = corp.kitSpend || 0; }
      /* REPUTATION.md R1 — the ONE thing that survives a Divide. */
      corp.rep = (opts.reputations && opts.reputations[profile.id])
              || REP.open(profile, oaProfiles, { season: opts.season || 1 });
      if (opts.openSeason) {
        REP.openSeason(corp.rep, planet,
                       P.mulberry32(P.seedFrom('w' + ((persist && persist._worldSeed) || 0) + ':goal' + (opts.season || 1) + profile.id)),
                       { expect: Math.max(2, 3 + (profile.difficulty || 3)),
                         thinTreasury: (profile.finance || {}).treasury_band === 'low' });
      }
      corps.push(corp);
    }
    for (const c of corps) { c._corps = corps; c._ground = ground; }
    for (const c of corps) { const m = (opts.mediaRevealed || {})[c.id]; if (m) c._mediaReveal = m.reveal || 0; }

    /* §DROP WHERE EVERYBODY COMES DOWN. The draft dealt zones (`opts.dropZones = { corpId: [zone a squad] }`): one
       squad a zone, one squad a region for each OA. A corp without picks (a bare Divide, a test) is dealt the same
       way here, in list order: a free zone off the last ground in a region it has none in, as far from everybody
       else's as the ground allows. */
    const zoneTaken = {};
    const regionsOf = c => c.squads.filter(q => q.zone != null).map(q => Z[q.zone].region);
    const farFrom = (zid) => { let d = Infinity; for (const k in zoneTaken) { const o = Z[+k]; d = Math.min(d, Math.hypot(o.x - Z[zid].x, o.y - Z[zid].y)); } return d; };
    const picks = opts.dropZones || {};
    for (const c of corps) for (let si = 0; si < c.squads.length; si++) {
      const sq = c.squads[si]; sq.zone = null;
      const mine = picks[c.id] || [];
      let zid = mine[si] != null ? mine[si] : null;
      if (zid == null || zoneTaken[zid] != null || Z[zid].region === ground.wall.last || regionsOf(c).indexOf(Z[zid].region) >= 0) {
        const have = regionsOf(c);
        let free = Z.filter(z => zoneTaken[z.id] == null && z.region !== ground.wall.last && have.indexOf(z.region) < 0);
        if (!free.length) free = Z.filter(z => zoneTaken[z.id] == null && z.region !== ground.wall.last);
        if (!free.length) free = Z.filter(z => zoneTaken[z.id] == null);
        free.sort((a, b) => farFrom(b.id) - farFrom(a.id) || a.id - b.id);
        zid = free[0].id;
      }
      zoneTaken[zid] = c.id; sq.zone = zid; sq.x = Z[zid].x; sq.y = Z[zid].y;
    }
    /* THE DRAFT IS POSTED: every OA knows where every other came down */
    for (const c of corps) for (const oc of corps) if (oc !== c) for (const sq of oc.squads) recordSighting(c, sq, 1, true);
    /* §5.3b THE FLEET'S REGARD FOR EACH OA, read once and carried on the corp */
    if (REP && opts.reputations) for (const c of corps) {
      const rp = opts.reputations[c.id];
      if (rp) c._fleetStanding = REP.standing(rp, 'houses');
      if (!isHumanOA(c.id)) seatSquadStances(c);
      if (rp && !isHumanOA(c.id)) {
        c._stance = c._stance || {};
        const base = NOTCHES.indexOf(c.policy || 'standard');
        for (const other of corps) {
          if (other === c) continue;
          const orp = opts.reputations[other.id];
          const r = orp && orp.base.houses[c.id] != null ? (REP.standing(orp, 'house', c.id) - 50) * 2 : 0;
          const step = r < -20 ? 2 : r < -5 ? 1 : r > 20 ? -2 : r > 5 ? -1 : 0;
          c._stance[other.id] = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, (base < 0 ? 2 : base) + step))];
        }
        c._stanceBase = Object.assign({}, c._stance);
      }
    }
    if (opts.captureDrop) opts.captureDrop(corps.map(c => c.squads.map(q => ({ corpId: c.id, zone: q.zone, x: q.x, y: q.y }))));

    const stats = {
      dead: 0, captured: 0, injured: 0, careerEnded: 0, lightWounds: 0, monwaShock: 0,
      engagements: 0, exchanges: 0, shots: 0, hits: 0, downs: 0, killedOutright: 0, downDeaths: 0,
      zeroCasualtyEngagements: 0, routEngagements: 0, brokenEngagements: 0, squadsBroken: 0,
      sidesEngaged: 0, sidearmDraws: 0, vents: 0, capExits: 0, days: 0,
      wingInjuries: 0, ththynSerious: 0, hazards: 0, hazardInjuries: 0, degradations: 0,
      _corps: corps,
      claims: 0, relayFirings: 0, stanceChanges: 0, windows: 0, forcedContacts: 0, escapes: 0,
      deals: [], offersSent: 0,
      ransoms: 0,
      contactOffers: 0, engagementsByWeek: [0, 0, 0, 0, 0], rationShortDays: 0, squadDays: 0,
      corpCount, perCorp: corps.map(c => ({ id: c.id, policy: c.policy, declaredAt: c.declaredAt, permanent: 0, injuredHome: 0, engagements: 0 })),
      archetype: planet.archetype, offersBy: {}, escapesBy: {}, colocDays: {}, passedOver: 0,
      audit: {
        forageEvents: 0, forageYield: 0, domeDeaths: 0, lineEvade: 0, carriedOut: 0, zoneRiskVeto: 0, nightMarch: 0,
        passedOver: 0,
        huntMoves: 0, evadeMoves: 0, driftMoves: 0, objectiveMoves: 0,
        awarded: {}, hazardKind: {}, terrainUsed: {}, bandOpen: [0, 0, 0],
        relayIntelUsed: 0, relayEscapeUsed: 0, landed: 0, beaconContested: 0, ammoResupply: 0,
        weakDiscount: 0, lateReveals: 0,
        stressApplied: 0, successions: 0, rationDryDays: 0, degradeChecks: 0,
        nightEngagements: 0, objectiveFights: 0, capturedAlive: 0,
        steps: 0, contacts: 0, joined: 0, harassed: 0, wallFree: 0
      }
    };
    const pcOf = {};
    for (const pc of stats.perCorp) pcOf[pc.id] = pc;
    stats._pcOf = pcOf;

    /* §RECORD Replay capture (opt-in). The viewer is a pure viewer: everything it needs is recorded here, on the
       ground's own terms — a squad is in a zone, a fight is on a zone, the wall takes regions. */
    const REC = opts.replay ? { ground: null, days: [], corps: [] } : null;
    let dayEvents = [];
    const rec = e => { if (REC) dayEvents.push(e); };
    if (REC) {
      REC.ground = { name: ground.name, archetype: ground.archetype, archetypeName: ground.archetypeName, days: ground.days,
        regions: RG.map(r => ({ id: r.id, name: r.name, terrain: r.terrain, terrainName: r.terrainName, ticks: r.ticks, cx: r.cx, cy: r.cy, zones: r.zones, links: r.links })),
        zones: Z.map(z => ({ id: z.id, region: z.region, x: z.x, y: z.y, height: z.height, cover: z.cover, site: z.site ? z.site.kind : null, nb: z.nb })),
        wall: { last: ground.wall.last, order: ground.wall.order, takeAt: ground.wall.takeAt },
        windows: ground.windows,
        objectives: planet.objectives.map(o => ({ id: o.id, zone: o.zone, x: o.x, y: o.y, t: o.type, lbl: o.label, place: o.place, opens: o.opens || 1 }))
      };
      REC.corps = corps.map(c => ({
        id: c.id, name: c.profile.name, tag: c.profile.tag,
        colour: (c.profile.colors && c.profile.colors.primary) || '#888',
        stance: c.policy, rigidity: c.rigidity, dropped: c.allBodies.length
      }));
    }
    stats._rec = rec;
    const hookCache = new WeakMap();
    function squadHooks(sq) {
      let h = hookCache.get(sq);
      if (h && h._n === squadHead(sq).length) return h;
      h = new Set(); h._n = squadHead(sq).length;
      for (const b of squadHead(sq)) for (const t of (b.traits || [])) {
        const tr = traitIndex[t];
        if (tr && tr.effects && tr.effects.hooks) for (const k of tr.effects.hooks) h.add(k);
      }
      hookCache.set(sq, h);
      return h;
    }
    const liveSquads = () => { const out = []; for (const c of corps) for (const sq of c.squads) if (squadHead(sq).length >= 1) out.push(sq); return out; };

    let day = 0;
    let engagementsRun = 0;
    const OVERTIME_MAX = 12;
    let overtime = false;
    /* §STANDING THE CROWD GOES DOWN WITH THEM: a loved OA's people drop steadier, a jeered one's shaken */
    for (const c of corps) {
      if (!c.rep) continue;
      const lean = (REP.standing(c.rep, 'crowd') - 50) / 50;
      for (const q of c.squads) for (const b of squadHead(q))
        b.condition.morale = Math.max(5, Math.min(95, b.condition.morale + lean * CONST.CROWD_DROP_MORALE));
    }
    for (const c of corps) for (const q of c.squads) {
      const h = squadHooks(q);
      const surge = h.has('divide_start_morale_surge_major') ? 8 : h.has('divide_start_morale_surge') ? 4 : 0;
      if (!surge) continue;
      for (const b of squadHead(q)) b.condition.morale = Math.min(95, b.condition.morale + surge);
      stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1;
    }

    /* ================================================================================================
       §CONTEST THE GROUND RUNS ON contest.js: sight, noise, the planner, movement in ticks, the wall, and the shape
       of every fight. The grid resolves the fights, through the glue below; the economy of a day — rations,
       weather, camp, forage, the sites, the beacons, the table — is this file's, around the contest's ticks.
       ================================================================================================ */
    const squadOf = new Map();   /* a contest squad → the corp's squad it stands for */
    const cqOf = new Map();      /* and back */
    const csquads = [];
    for (const c of corps) for (const sq of c.squads) csquads.push({ oa: c.id, s: sq.sIdx, zone: sq.zone, bodies: sq.bodies, stance: squadStance(sq), ref: sq, long: longShare(sq) });
    const cst = CONTEST.open(rng, ground, csquads, {
      seed: 'contest', human: Object.fromEntries([..._humans].map(id => [id, true])), driven: true,
      allied: (a, b) => a === b,
      headOf: sq => squadHead(sq).length,
      resolve: (st, f, rngF) => gridResolve(st, f),
      captivePolicy: (st, captor, from, f, body) => captiveFate(captor, from, body),
      onSettle: (st, f, winnerOa) => afterFight(st, f, winnerOa)
    });
    for (const cq of cst.squads) { squadOf.set(cq, cq.ref); cqOf.set(cq.ref, cq); cq.ref._cq = cq; }
    const corpById = {}; for (const c of corps) corpById[c.id] = c;
    const mirror = () => { for (const cq of cst.squads) { const sq = cq.ref; sq.zone = cq.zone; sq.x = Z[cq.zone].x; sq.y = Z[cq.zone].y; sq.stance = sq.stance || cq.stance; cq.stance = squadStance(sq); } };
    const regionName = zid => RG[Z[zid].region].name;
    function longShare(sq) {
      /* the share of a squad that reaches the next zone: long rifles and heavier */
      const heads = squadHead(sq); if (!heads.length) return 0;
      return heads.filter(b => b.loadout && b.loadout.kit && b.loadout.kit.weapon && (b.loadout.kit.weapon.range || 0) >= 2).length / heads.length;
    }
    /* §CAPTIVES (ruled: case by case, at the capture) an engine seat decides by its stance; a person's seat is asked at
       its next window, and holds the captive until it answers */
    function captiveFate(captor, from, body) {
      if (isHumanOA(captor.oa)) return 'pending';
      const s = captor.stance;
      return s === 'death_or_glory' ? 'kill' : (s === 'preservationist' || s === 'measured') ? 'release' : 'keep';
    }
    function applyFate(body, fate, captorId, ownerId) {
      const captor = corpById[captorId], owner = corpById[ownerId];
      stats.captiveOutcomes = stats.captiveOutcomes || { released: 0, kept: 0, killed: 0 };
      stats.captiveLog = stats.captiveLog || [];
      const out = fate === 'kill' ? 'killed' : fate === 'release' ? 'released' : 'kept';
      if (out === 'killed') { body.status = 'dead'; stats.dead++; }
      else if (out === 'released') { body.status = 'injured'; body._recovery = Math.max(body._recovery || 0, CONST.RELEASED_RECOVERY); body._released = day; }
      if (out !== 'kept') {
        stats.captiveOutcomes[out]++;
        stats.captiveLog.push({ fighter: body.id, name: body.name, owner: ownerId, captor: captorId, out, day });
        if (captor && captor.rep) REP.act(captor.rep, out === 'killed' ? 'killed_captives' : 'released_captives', { targetId: ownerId, rivalIds: corps.map(c => c.id) });
        if (out === 'killed' && owner && owner.rep) REP.act(owner.rep, 'abandoned_ours', { targetId: captorId, rivalIds: corps.map(c => c.id) });
      }
      rec({ t: 'captive', c: captorId, from: ownerId, name: body.name, out });
    }
    /* the captives a contest squad walks with, settled as they are decided */
    function settleCaptives(cq) {
      for (let i = cq.captives.length - 1; i >= 0; i--) {
        const k = cq.captives[i]; if (!k.body) continue;
        if (k.fate === 'pending') continue;
        if (k.fate === 'kill' || k.fate === 'release') { applyFate(k.body, k.fate, cq.oa, k.oa); cq.captives.splice(i, 1); }
      }
    }

    /* ---- §GRID THE FIGHT, RESOLVED. The contest says who is in it, from which edge, who walks in late and on what
       ground; the grid is handed the sides built from their bodies, the zone's terrain and cover, the comers'
       bearings, readiness from height and from what each squad was doing, and the night; its result is booked to
       every body, and the contest is told what each squad lost and whom it holds. ---- */
    function gridResolve(st, f) {
      const night = !!st.night, zone = f.zone, terrain = RG[Z[zone].region].terrain, zObj = objAt[zone];
      const sidesSq = f.sides.map(S => S.squads.map(x => st.squads[x.id].ref));
      const early = f.sides.map((S, i) => S.squads.filter(x => x.atTurn <= 1).map(x => st.squads[x.id].ref));
      const late = []; f.sides.forEach((S, i) => { for (const x of S.squads) if (x.atTurn > 1) late.push({ gi: i, sq: st.squads[x.id].ref, x }); });
      const groups = early.map((g, i) => g.length ? g : [sidesSq[i][0]]);
      const built = groups.map(g => liveSquadGroup(rng, g, day, engagementsRun, traitIndex));
      if (built.some(b => !b)) return { turns: 1, winner: null, result: 'cap', squads: {} };
      const holderSide = f.sides.findIndex(S => S.squads.some(x => x.from === zone));
      const objectiveValue = !zObj || !siteLive(zObj, day) ? 0 : (zObj.heldBy ? 1.5 : 0.8);
      const ctx = {
        day, night, terrain,
        openingBand: P.weightedPick(rng, Z[zone].cover >= 1 ? [[0, 46], [1, 42], [2, 12]] : Z[zone].height >= 1 ? [[0, 16], [1, 46], [2, 38]] : [[0, 28], [1, 50], [2, 22]]),
        objectiveValue, flanked: f.sides.map(() => false),
        firstEngagement: engagementsRun === 0,
        log: groups.some(g => g.some(sq => isHumanOA(sq.corpId))) ? undefined : false,
        prep: groups.map((g, gi) => {
          const lead = g[0];
          const theyKnewUs = g.some(s => Object.keys(s.known || {}).length > 0);
          let rivalEdge = 0; const ri = lead && lead._rivalIntel;
          if (ri) groups.forEach((og, oi) => { if (oi === gi) return; og.forEach(os => { if (os.corpId && ri[os.corpId] > rivalEdge) rivalEdge = ri[os.corpId]; }); });
          /* §7.5 the side that holds the zone fights from its height and its cover; the comers from theirs */
          const xs = f.sides[gi].squads[0];
          const heightEdge = CONST.HIGH_GROUND_PREP * (xs.from === zone ? Z[zone].height - (f.sides.filter((S, k) => k !== gi).reduce((t, S) => t + Z[S.squads[0].from].height, 0) / Math.max(1, f.sides.length - 1)) : Z[xs.from].height - Z[zone].height) / 2;
          const strong = zObj && zObj.type === 'strongpoint' && zObj.heldBy === lead.corpId && xs.from === zone;
          const captives = (st.squads[xs.id].captives || []).length * CONTEST.CONST.CAPTIVE_PREP;
          const rushed = st.squads[xs.id].harass && st.squads[xs.id].harass.rushed ? CONTEST.CONST.HARASS_RUSHED_PREP : 0;
          return Math.max(0, Math.min(1, preparedness(lead, { sawFirst: theyKnewUs, rivalEdge, strongpoint: !!strong }) + heightEdge + captives + rushed));
        }),
        bearings: f.sides.map(S => S.squads[0].bearing != null ? S.squads[0].bearing : 0)
      };
      /* the late: a neighbour walks in on the side of its own banner, a turn a tick of its step */
      const arrivals = [];
      if (late.length) {
        ctx.reinforce = [];
        for (const L of late) {
          const side = liveSquadGroup(rng, [L.sq], day, engagementsRun, traitIndex);
          if (!side) continue;
          side.tag = String.fromCharCode(65 + L.gi);
          const host = built[L.gi];
          if (!host._parts) host._parts = [{ units: host.units.slice(), _sq: groups[L.gi][0] }];
          host._parts.push(side);
          arrivals.push({ sq: L.sq, side, gi: L.gi });
          ctx.reinforce.push({ side, bearing: L.x.bearing != null ? L.x.bearing : 0, prep: 0.5, atTurn: L.x.atTurn });
          L.sq._joinedToday = true;
        }
        stats.audit.joinedInProgress = (stats.audit.joinedInProgress || 0) + ctx.reinforce.length;
      }
      /* §FLANK every squad comes on where it came from */
      built.forEach((side, gi) => { const parts = side._parts || [side];
        for (const part of parts) { const q = part._sq; if (!q) continue; const xs = f.sides[gi].squads.find(y => st.squads[y.id].ref === q);
          const b = xs && xs.bearing != null ? xs.bearing : (xs && xs.from === zone ? Math.PI : 0); for (const u of part.units) u._bearing = b; } });
      for (const R of (ctx.reinforce || [])) for (const u of (R.side.units || [])) u._bearing = R.bearing;
      ctx.forceBearings = true;
      /* §GRUDGE a man fighting the OA he remembers */
      for (const side of built) {
        const foes = built.filter(o => o !== side).map(o => o.corpId);
        for (const u of side.units) {
          if (!u._grudge || foes.indexOf(u._grudge) < 0) continue;
          if (!u.hooks || !u.hooks.has('morale_up_vs_grudge_target')) continue;
          u.comp = Math.min(100, u.comp + CONST.GRUDGE_COMP); stats.audit.traitHooks++;
        }
      }
      for (const sd of built) for (const u of (sd.units || [])) u._carriedIn = (u.carried || []).slice();
      const deadBefore = new Set();
      for (const g of sidesSq) for (const q of g) for (const b of q.bodies) if (b.status === 'dead') deadBefore.add(b);
      const statusBefore = new Map(); for (const g of sidesSq) for (const q of g) for (const b of q.bodies) statusBefore.set(b, b.status);
      const res = TACTICAL.resolve(rng, built, ctx);
      /* §CHARGES the spend comes off the fighter */
      for (const sd of built) for (const u of (sd.units || [])) {
        const fb = u.ref; if (!fb || !fb._charges || !u._carriedIn) continue;
        const left = (u.carried || []).slice();
        for (const id of u._carriedIn) { const i = left.indexOf(id); if (i >= 0) { left.splice(i, 1); continue; } fb._charges[id] = Math.max(0, (fb._charges[id] || 0) - 1); stats.audit.chargesSpent = (stats.audit.chargesSpent || 0) + 1; }
      }
      const fightTicks = Math.max(1, Math.min(CONST.FIGHT_TICKS_MAX, Math.ceil(((res.telemetry && res.telemetry.turn) || 1) / CONST.FIGHT_TURNS_PER_TICK)));
      stats.fightTicks = (stats.fightTicks || 0) + fightTicks;
      stats.longFights = (stats.longFights || 0) + (fightTicks > 1 ? 1 : 0);
      if (ctx.log !== false && res.log && res.log.length) {
        (stats._fights = stats._fights || []).push({ day, night, terrain, zone, place: regionName(zone), x: Z[zone].x, y: Z[zone].y,
          corps: groups.map(g => g[0].corpId), band: res.band, result: res.result, exchanges: res.exchanges, casualties: res.casualties, log: res.log });
      }
      if (opts.onBattle && groups.some(g => g.some(sq => isHumanOA(sq.corpId)))) {
        opts.onBattle({ day, night, terrain, zone, x: Z[zone].x, y: Z[zone].y, corps: groups.map(g => g[0].corpId), sides: built, res });
      }
      engagementsRun++;
      stats.engagements++;
      stats.engagementsByWeek[Math.min(4, Math.floor((day - 1) / 7))]++;
      stats.audit.terrainUsed[terrain] = (stats.audit.terrainUsed[terrain] || 0) + 1;
      stats.audit.bandOpen[ctx.openingBand]++;
      if (night) stats.audit.nightEngagements++;
      if (objectiveValue > 0) stats.audit.objectiveFights++;
      if (groups.length > 2) stats.audit.multiSide = (stats.audit.multiSide || 0) + 1;
      if (sidesSq.some(g => g.length > 1)) stats.audit.combinedArms = (stats.audit.combinedArms || 0) + 1;
      if (res.telemetry && res.telemetry.flankFight) stats.audit.flankFights = (stats.audit.flankFights || 0) + 1;
      const t = res.telemetry || {};
      for (const k of ['drones', 'turrets', 'turretShots', 'turretHits', 'stims', 'scrambles', 'thermobarics']) stats.audit[k] = (stats.audit[k] || 0) + (t[k] || 0);
      stats.audit.grenades = (stats.audit.grenades || 0) + (t.grenades || 0);
      stats.audit.consumablesUsed = (stats.audit.consumablesUsed || 0) + (t.consumables || 0);
      stats.exchanges += t.exchanges || 0; stats.shots += t.shots || 0; stats.hits += t.hits || 0;
      stats.downs += t.downs || 0; stats.killedOutright += t.killedOutright || 0; stats.downDeaths += t.downDeaths || 0;
      stats.monwaShock += (t.monwaPairLoss || 0);
      if (t.routs > 0) stats.routEngagements++;
      if (t.squadsBroken > 0) stats.brokenEngagements++;
      stats.squadsBroken += t.squadsBroken || 0; stats.sidesEngaged += t.sidesEngaged || 0;
      stats.sidearmDraws += t.sidearmDraws || 0; stats.vents += t.vents || 0;
      stats.audit.coverChipped = (stats.audit.coverChipped || 0) + (t.coverChipped || 0);
      stats.audit.coverFlattened = (stats.audit.coverFlattened || 0) + (t.coverFlattened || 0);
      if (res.result === 'cap') stats.capExits++;
      const before = { d: stats.dead, i: stats.injured, c: stats.careerEnded };
      const recBefore = { d: stats.dead, c: stats.careerEnded };
      /* §6.9 every corp on one side met every corp on the others */
      for (let gi = 0; gi < groups.length; gi++) for (let hi = 0; hi < groups.length; hi++) { if (gi === hi) continue; for (const a of sidesSq[gi]) for (const b of sidesSq[hi]) noteContact(a.corp, b.corp, day, 'fight'); }
      /* who broke */
      const broke = {};
      const m = /^disengage_(.+)$/.exec(res.result);
      if (m) { for (const tag of m[1].split('')) broke[tag] = true; }
      if (m && m[1] === 'both') for (let gi = 0; gi < groups.length; gi++) broke[String.fromCharCode(65 + gi)] = true;
      const standingSides = groups.map((g, gi) => gi).filter(gi => !broke[String.fromCharCode(65 + gi)] && built[gi].units.some(u => u.state === 'ok' || u.state === 'light'));
      const winnerGi = standingSides.length === 1 ? standingSides[0] : -1;
      for (let gi = 0; gi < groups.length; gi++) {
        const side = built[gi];
        for (const u of side.units) if (u.race === 'ththyn' && u.injury) { stats.ththynSerious++; if (u.injury.type.startsWith('inj_wing')) stats.wingInjuries++; }
        const corpsHere = []; for (const sq of sidesSq[gi]) if (corpsHere.indexOf(sq.corp) < 0) corpsHere.push(sq.corp);
        const snap = corpsHere.map(c => tallyCorp(c));
        /* whoever holds the field holds the prisoners; nobody does, nobody is held */
        let captorId = null, victors = null;
        if (winnerGi >= 0 && winnerGi !== gi) {
          captorId = sidesSq[winnerGi][0].corpId;
          const vc = corpById[captorId];
          const here = []; for (const q of sidesSq[winnerGi]) if (q.corpId === captorId) here.push(...squadHead(q));
          victors = { corp: vc, bodies: here };
          for (const c of corpsHere) if (c && c !== vc) { noteContact(c, vc, day, 'lost'); noteContact(vc, c, day, 'beat'); if (standing(vc) > standing(c) * 1.35) c._worthyFights = (c._worthyFights || 0) + 1; }
        }
        applyOutcome(sidesSq[gi][0], side, stats, captorId, victors);
        for (let k = 0; k < corpsHere.length; k++) {
          const now = tallyCorp(corpsHere[k]), p = pcOf[corpsHere[k].id];
          p.permanent += now.permanent - snap[k].permanent; p.injuredHome += now.injured - snap[k].injured; p.engagements++; corpsHere[k].engagements++;
        }
        for (const sq of sidesSq[gi]) { sq.foughtToday = true; sq.engagements++; if (sq.ammoResupplied > 0) sq.ammoResupplied--; sq._heldToday = (sq._heldToday || 0) + fightTicks; }
      }
      /* the standing carry the fallen of their own banner out of this fight; wounded with no friend standing fall to
         whoever won */
      for (let gi = 0; gi < groups.length; gi++) for (const sq of sidesSq[gi]) {
        if (squadHead(sq).length) continue;
        const carriers = sidesSq[gi].filter(s2 => s2 !== sq && s2.corpId === sq.corpId && squadHead(s2).length);
        if (carriers.length) { const wounded = sq.bodies.filter(b => b.status === 'injured'); for (const b of wounded) { carriers[0].bodies.push(b); sq.bodies.splice(sq.bodies.indexOf(b), 1); } if (wounded.length) stats.audit.carriedOut = (stats.audit.carriedOut || 0) + wounded.length; continue; }
        if (winnerGi < 0 || winnerGi === gi) continue;
        const takerId = sidesSq[winnerGi][0].corpId;
        for (const b of sq.bodies) { if (b.status !== 'injured') continue; b.status = 'captured'; b._capturedBy = takerId; stats.captured++; stats.audit.capturedAlive++; stats.audit.woundedTakenCaptive = (stats.audit.woundedTakenCaptive || 0) + 1; }
      }
      lootField(sidesSq, broke, arrivals, deadBefore, day, stats, Z[zone].x, Z[zone].y);
      /* what every squad lost, for the contest's books: the captured by name, so their fate can be decided */
      const squads = {};
      for (const S of f.sides) for (const x of S.squads) {
        const sq = st.squads[x.id].ref; const r = { dead: 0, down: 0, captured: [] };
        for (const b of sq.bodies) { const was = statusBefore.get(b);
          if (b.status === 'captured' && was !== 'captured') { r.captured.push(b); continue; }   /* the wounded taken count too: their fate is asked */
          if (was !== 'active') continue;
          if (b.status === 'dead') r.dead++; else if (b.status !== 'active') r.down++; }
        squads[x.id] = r;
      }
      /* CAPTIVES MARCH OFF THE FIELD */
      for (const g of sidesSq) for (const sq of g) for (let bi = sq.bodies.length - 1; bi >= 0; bi--) if (sq.bodies[bi].status === 'captured') { sq.bodies.splice(bi, 1); stats.audit.captivesMarchedOff = (stats.audit.captivesMarchedOff || 0) + 1; }
      rec({ t: 'fight', zone, x: Z[zone].x, y: Z[zone].y, corps: groups.map(g => g[0].corpId), squads: sidesSq.reduce((n, g) => n + g.length, 0), night, ex: t.exchanges, band: res.band, res: res.result, terrain,
            lost: (stats.dead - recBefore.d) + (stats.careerEnded - recBefore.c), obj: objectiveValue > 0, flank: !!(res.telemetry && res.telemetry.flankFight) });
      if (stats.dead === before.d && stats.injured === before.i && stats.careerEnded === before.c) stats.zeroCasualtyEngagements++;
      return { turns: res.turns || 1, winner: winnerGi >= 0 ? f.sides[winnerGi].tag : null, result: res.result, squads };
    }
    /* after the contest settles a fight: the winner takes the ground; everybody rests a block; a strongpoint
       changes hands with the zone */
    function afterFight(st, f, winnerOa) {
      for (const S of f.sides) for (const x of S.squads) { const cq = st.squads[x.id]; if (cq.alive) cq.rest = CONST.REST_TICKS_AFTER; }
      const o = objAt[f.zone];
      if (winnerOa && o && o.type === 'strongpoint') { o.heldBy = winnerOa; stats.audit.tookTheGround = (stats.audit.tookTheGround || 0) + 1; }
      /* a captor wiped passes its captives to the wiper: their bodies' keeper changes with them */
      for (const S of f.sides) for (const x of S.squads) { const cq = st.squads[x.id]; for (const k of cq.captives) if (k.body) k.body._capturedBy = cq.oa; settleCaptives(cq); }
    }

    /* ---- the day's bookkeeping on the ground ---- */
    const headsOf = c => c.allBodies.filter(b => b.status === 'active').length;
    const standsNow = (c) => !c.withdrawn && (c.squads || []).some(q => (q.bodies || []).some(b => b.status === 'active'));
    /* §RESERVE a beacon zone draws an OA's reserve down while its squad stands on it uncontested: a rival in the
       zones next door stops the landing; while it is in use it fires — every rival hears it across the region and
       knows whose it is */
    const beaconTick = (sq, o) => {
      const corp = sq.corp, cq = sq._cq;
      if (!corp || !corp.reserve || !corp.reserve.length) { sq.claiming = null; cq.beacon = false; return; }
      sq.claiming = o.id; cq.beacon = true;
      o.litBy = corp.id; o.litDay = day; o.heldBy = corp.id;
      for (const c of corps) if (c !== corp) recordSighting(c, sq, day, false, 'beacon');
      o.draw = o.draw || {};
      const rival = Z[o.zone].nb.some(v => { const h = CONTEST.holder(cst, v); return h && h.oa !== corp.id; });
      if (rival) { o.draw[corp.id] = 0; stats.audit.beaconContested++; return; }
      const seats = s => squadHead(s).filter(b => !b.mirror_of).length;
      if (seats(sq) >= CONST.SQUAD_MAX) return;
      const knack = squadHasHook(sq, 'sponsor_drop_handling_bonus');
      o.draw[corp.id] = (o.draw[corp.id] || 0) + 1;
      if (o.draw[corp.id] < CONST.BEACON_TICKS - (knack ? 1 : 0)) return;
      o.draw[corp.id] = 0;
      const lead = corp.reserve.shift(), group = [lead];
      if (corp.reserve[0] && corp.reserve[0].mirror_of === lead.id) group.push(corp.reserve.shift());
      for (const fb of group) { fb.status = 'active'; fb._squadIdx = sq.sIdx; fb._landedDay = day; sq.bodies.push(fb); corp.allBodies.push(fb);
        if (corp.persist && corp.persist.drop && corp.persist.drop.indexOf(fb) < 0) corp.persist.drop.push(fb); }
      if (corp.persist && corp.persist.account) LED.payPurse(corp.persist.account, group);
      sq.rations += CONST.RATION_DROP_DAYS * group.length;
      sq.medkits = medkitCharges(sq.bodies); sq.hasMedkit = sq.medkits > 0;
      corp.landed += group.length; stats.audit.landed += group.length;
      (stats.landings = stats.landings || []).push({ day, corp: corp.id, squad: sq.sIdx, fighter: lead.id, name: lead.name, pair: group.length > 1, seats: seats(sq), site: o.label, place: o.place, left: corp.reserve.filter(fb => !fb.mirror_of).length });
      rec({ t: 'landed', zone: o.zone, x: o.x, y: o.y, c: corp.id, name: lead.name, place: o.place });
      CONTEST.syncHeads(cst);
    };
    /* a squad standing on a site works it: a tick or two, interrupted by a rival next door */
    const siteTick = (sq) => {
      const cq = sq._cq, o = objAt[cq.zone];
      cq.beacon = false;
      if (!o || !siteLive(o, day) || cq.moving || cq.fight != null || sq.foughtToday) { sq.claiming = null; return; }
      if (o.type === 'sponsor_cache') { beaconTick(sq, o); return; }
      const rival = Z[cq.zone].nb.some(v => { const h = CONTEST.holder(cst, v); return h && h.oa !== cq.oa; });
      if (rival) { sq.claiming = o.id; o.work = {}; return; }
      const key = sq.corpId + ':' + sq.sIdx;
      o.work[key] = (o.work[key] || 0) + 1;
      sq.claiming = o.id;
      if (o.work[key] >= MAP.CONST.LOOT_TICKS) { awardObjective(rng, sq, o, stats); o.work = {}; sq.claiming = null; }
    };
    /* the picture: what a squad came to know this tick reaches its OA's dossier */
    const noticed = () => {
      const now = cst.day * CONTEST.CONST.TICKS_A_DAY + cst.tick;
      for (const cq of cst.squads) { if (!cq.alive) continue;
        for (const zid in cq.know) { const k = cq.know[zid]; if (k.at !== now || k.squad == null) continue; const o = cst.squads[k.squad]; if (!o || o.oa === cq.oa) continue;
          recordSighting(cq.ref.corp, o.ref, day, false, k.how === 'seen' ? 'watched' : k.how); if (k.how === 'seen') { stats.audit.sightings = (stats.audit.sightings || 0) + 1; if (isHumanOA(cq.oa)) stats.audit.sightingsMine = (stats.audit.sightingsMine || 0) + 1; } } }
    };

    while (true) {
      day++;
      for (const c of corps) if (c._downedOn == null && (c.withdrawn || !(c.squads || []).some(q => squadHead(q).length))) c._downedOn = day - 1;
      stats.days = day;
      rollWeather(rng, planet, stats, day);
      overtime = day > LAST_DAY;
      if (overtime) stats.overtimeDays = (stats.overtimeDays || 0) + 1;
      dayEvents = [];
      cst.day = day; cst.tick = 0;

      /* --- DAWN: the wall takes its regions, the windows brief --- */
      const evBefore = cst.events.length;
      CONTEST.dawn(cst);
      /* §WALL the wall takes everyone in the region — the standing, whom the contest counted, and the immobilised
         it does not know, who lie where they fell */
      const dawnEv = cst.events.slice(evBefore);
      for (const e of dawnEv) {
        if (e.t !== 'region_gone') continue;
        rec({ t: 'region_gone', region: e.region, name: RG[e.region].name });
        for (const c of corps) for (const sq of c.squads) {
          if (sq.zone == null || Z[sq.zone].region !== e.region) continue;
          if (sq._cq && sq._cq.alive && CONTEST.onRoad(sq._cq) && Z[sq._cq.moving.to].region !== e.region) continue;   /* on the road out: outside already */
          let took = 0;
          for (const b of sq.bodies) if (b.status !== 'dead' && b.status !== 'retired') { b.status = 'dead'; took++; }
          for (const k of (sq._cq ? sq._cq.captives : [])) if (k.body && k.body.status === 'captured') { k.body.status = 'dead'; took++; }
          if (sq._cq) sq._cq.captives = [];
          if (!took) continue;
          const w = dawnEv.find(x => x.t === 'wall' && x.squad === sq._cq.id);
          (stats.wallDeaths = stats.wallDeaths || []).push({ day, corp: sq.corpId, s: sq.sIdx, took, at: 'dawn', region: RG[e.region].name, free: !!(w && w.free), stance: squadStance(sq), intent: sq._cq.intent && sq._cq.intent.type });
          stats.audit.domeDeaths = (stats.audit.domeDeaths || 0) + took;
          (stats.audit.wallBy = stats.audit.wallBy || {})[sq.corpId] = ((stats.audit.wallBy || {})[sq.corpId] || 0) + took;
          rec({ t: 'wall', zone: sq.zone, x: sq.x, y: sq.y, c: sq.corpId, n: took, region: RG[e.region].name });
        }
      }
      stats.audit.wallFree = cst.audit.wallFree || 0;
      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        sq._day = day; sq._st = stats;
        sq.movedToday = false; sq._marched = 0; sq.foughtToday = false; sq._lostDay = false; sq._hunted = false; sq._heldToday = 0; sq._joinedToday = false;
      }
      const windowDay = GROUND.isWindowDay(ground, day);
      if (windowDay) stats.windows++;
      for (const c of corps) for (const q of c.squads) if (!q._mind && squadHead(q).length) {
        const mind = captainMind(q);
        q._mind = { judge: Math.round(mind.judge * 100) / 100, sight: Math.round(mind.sight * 100) / 100, nerve: Math.round(mind.nerve * 100) / 100, cap: mind.cap ? mind.cap.name : null };
      }
      /* --- THE CORP CHANNEL at the window: ransoms, withdrawals, the winner's word (NEGOTIATION.md §11) --- */
      if (!opts.noNegotiation && windowDay) {
        if (runCorpChannel(rng, corps, planet, day, stats, opts) === true) break;
      }
      /* --- reform at the window: a spent squad's survivors spread across the corp's other squads in the region --- */
      if (windowDay) {
        for (const c of corps) {
          const alive = c.squads.filter(q => squadHead(q).length > 0);
          if (alive.length < 2) continue;
          for (const q of alive) {
            const n = squadHead(q).length;
            if (n === 0 || n >= CONST.REFORM_AT) continue;
            const hosts = alive.filter(o => o !== q && squadHead(o).length >= CONST.REFORM_AT && Z[o.zone].region === Z[q.zone].region).sort((a, b) => squadHead(a).length - squadHead(b).length);
            if (!hosts.length) continue;
            const movers = q.bodies.slice(), share = q.rations / Math.max(1, hosts.length);
            movers.forEach((b, i) => { hosts[i % hosts.length].bodies.push(b); });
            for (const h of hosts) h.rations += share;
            /* and the captives it walked with */
            if (q._cq.captives.length) { hosts[0]._cq.captives = hosts[0]._cq.captives.concat(q._cq.captives); q._cq.captives = []; }
            q.bodies = []; q.rations = 0; q.intent = null; q._reformed = day; q._downAt = { zone: q.zone };
            stats.audit.reforms = (stats.audit.reforms || 0) + 1;
            rec({ t: 'reform', zone: q.zone, x: q.x, y: q.y, c: c.id, n, into: hosts.length });
          }
        }
        CONTEST.syncHeads(cst);
      }
      if (stats.halted) break;
      /* --- stance: every engine corp picks its approach at the window; the person's is the window's --- */
      if (windowDay) {
        const board = NEG.oddsBoard(umbrellasOf(corps), { meanEngagements: corps.reduce((a, c) => a + c.engagements, 0) / Math.max(1, corps.length) });
        const penned = CONTEST.standing(cst).length <= ground.windows.dailyWhenLeft;
        if (!opts.stanceFixed) for (const c of corps) {
          if (isHumanOA(c.id)) continue;
          const mine = board[principalOf(c).id] || 0;
          const pol = opts.stancePolicy && opts.stancePolicy[c.id];
          if (pol) {
            const all = c.allBodies || [];
            const got = pol({ day, penned, odds: mine, ahead: mine > 0.28, lostFrac: 1 - all.filter(b => b.status === 'active' || b.status === 'injured').length / Math.max(1, all.length),
              reserve: (c.reserve || []).length, corp: c, squads: c.squads.filter(q => squadHead(q).length), head: q => squadHead(q).length, known: pictureOf(c, day) });
            if (got && got.corp && STANCE_DIALS[got.corp] && got.corp !== c.policy) { c.policy = got.corp; c.stanceChanges++; stats.stanceChanges++; }
            if (got && got.squads) { for (const q of c.squads) { const n = got.squads[q.sIdx]; if (n && STANCE_DIALS[n]) q.stance = n; } }
            else seatSquadStances(c);
          } else { reconsiderStance(rng, c, stats, { penned, ahead: mine > 0.28 }); reconsiderRivals(c, corps); }
        }
        mirror();
        /* THE WINDOW: comms are up; a seat still on the ground speaks to its people and the table */
        const seatIds = corps.filter(c => isHumanOA(c.id) && standsNow(c)).map(c => c.id);
        if (seatIds.length) {
          stats._fightCursor = stats._fightCursor || {}; stats._echo = stats._echo || {};
          const shellOf = (c) => { const all = c.allBodies || [];
            return { id: c.id, profile: c.profile ? { id: c.profile.id, name: c.profile.name } : null, withdrawn: c.withdrawn ? { day: c.withdrawn.day } : null,
                     standing: { up: all.filter(b => b.status === 'active').length, of: all.length }, squads: [], allBodies: [], shell: true }; };
          const snapshotOwn = (c) => {
            const seen = new Map(), rivals = new Set(corps.filter(x => x.id !== c.id).map(x => x.id));
            const DROP = { _st: 1, _picture: 1, _corps: 1, persist: 1, _cq: 1 };
            const clone = (v) => {
              if (v === null || typeof v !== 'object') return v;
              if (seen.has(v)) return seen.get(v);
              if (v !== c && v.allBodies && v.squads && rivals.has(v.id)) return { id: v.id };
              if (v.corpId && rivals.has(v.corpId) && v.bodies) return { corpId: v.corpId };
              const out = Array.isArray(v) ? [] : {};
              seen.set(v, out);
              for (const k of Object.keys(v)) { if (DROP[k]) continue; const x = v[k]; if (typeof x === 'function') continue; out[k] = clone(x); }
              return out;
            };
            return clone(c);
          };
          const worldFor = (seatId) => {
            if (opts.debugViews) return { corps, stats, planet, ground, record: REC ? REC.days : null };
            return { corps: corps.map(c => c.id === seatId ? snapshotOwn(c) : shellOf(c)),
                     record: REC ? REC.days : null };
          };
          const viewFor = (seatId) => {
            const world = worldFor(seatId);
            const you = corps.filter(c => c.id === seatId)[0];
            const table = { ransoms: [] };
            for (const k of (stats.ransomCases || [])) {
              if (k.done) continue;
              const side = k.owner === you.id && k.ownerYes == null ? 'owner' : k.captor === you.id && k.captorYes == null ? 'captor' : null;
              if (!side) continue;
              table.ransoms.push({ side, fighter: k.fighter, name: k.name, corp: side === 'owner' ? k.captor : k.owner, price: k.price, worth: k.worth, day: k.day });
            }
            const cur = stats._fightCursor[seatId] || 0;
            const since = (stats._fights || []).slice(cur).filter(fx => (fx.corps || []).indexOf(seatId) >= 0);
            stats._fightCursor[seatId] = (stats._fights || []).length;
            const echo = stats._echo[seatId] || null; stats._echo[seatId] = null;
            /* §CAPTIVES the captives this seat's squads hold and have not yet decided on, squad by squad */
            const toDecide = [];
            for (const cq of cst.squads) if (cq.oa === seatId && cq.alive) for (const k of cq.captives) if (k.fate === 'pending' && k.body) toDecide.push({ fighter: k.body.id, name: k.body.name, race: k.body.race, from: k.oa, fame: Math.round(k.body.fame || 0), squad: cq.s, day: k.day });
            return {
              kind: 'window', day, lastDay: LAST_DAY, fights: since,
              cadence: GROUND.isWindowDay(ground, day + 1) ? 1 : 2,
              odds: board, penned, table,
              captives: (function () { const taken = [], held = [];
                for (const o of corps) for (const fb of (o.allBodies || [])) { if (fb.status !== 'captured' || !fb._capturedBy) continue;
                  if (o.id === seatId) taken.push({ fighter: fb.id, name: fb.name, by: fb._capturedBy }); else if (fb._capturedBy === seatId) held.push({ fighter: fb.id, name: fb.name, from: o.id }); }
                return { taken, held, toDecide }; })(),
              weather: stats.weatherToday ? { day: stats.weatherToday.day, kind: stats.weatherToday.kind, fx: stats.weatherToday.fx } : null,
              landings: (stats.landings || []).filter(l => l.corp === seatId),
              reserveLeft: ((corps.find(c => c.id === seatId) || {}).reserve || []).filter(fb => !fb.mirror_of).length,
              withdrawOffer: (stats.withdrawOffers || {})[you.id] ? { terms: stats.withdrawOffers[you.id].terms, sentDay: stats.withdrawOffers[you.id].sentDay } : null,
              withdrawReplies: (stats.withdrawOffers || {})[you.id] ? Object.assign({}, stats.withdrawOffers[you.id].replies) : null,
              withdrawAsks: Object.keys(stats.withdrawOffers || {}).filter(k => k !== you.id).map(k => { const o = stats.withdrawOffers[k]; return { from: k, terms: o.terms, sentDay: o.sentDay, yours: o.replies[you.id] == null ? null : o.replies[you.id] }; }),
              /* the picture: where this seat's squads last saw each rival squad, by zone */
              picture: pictureForMap(you, day).map(e => ({ key: e.corpId + ':' + e.sq.sIdx, corpId: e.corpId, zone: e.zone, x: e.x, y: e.y, day: e.day, n: e.n, landing: !!e.landing, via: e.via || 'contact', down: !!e.down, stale: !!e.stale })),
              /* §SEATS its own squads: where each stands, what it is doing, whom it holds */
              squads: cst.squads.filter(cq => cq.oa === seatId).map(cq => ({ s: cq.s, zone: cq.zone, alive: cq.alive, n: cq.n, intent: cq.intent, moving: cq.moving ? { to: cq.moving.to, paid: cq.moving.paid, cost: cq.moving.cost } : null, fight: cq.fight, captives: cq.captives.length, stance: cq.stance })),
              /* §VISION the broadcast: a manager sees every squad on the ground, whose and where (ruled) */
              field: cst.squads.map(cq => ({ oa: cq.oa, s: cq.s, zone: cq.zone, alive: cq.alive, n: cq.n, fight: cq.fight })),
              fightsOn: cst.fights.filter(fx => !fx.done).map(fx => ({ zone: fx.zone, sides: fx.sides.map(S => S.oa), until: fx.until })),
              leanings: Object.assign({}, you._leanings || {}),
              contact: (function () { const o = {}; for (const c of corps) if (c.id !== you.id) { const r = contactWith(you, c, corps); if (r.fights || r.huntedBy || r.hunting) o[c.id] = r; } return o; })(),
              /* the wall: what stands, what goes next and when */
              wall: { standing: CONTEST.standing(cst), next: GROUND.nextToGo(ground, day), takeAt: ground.wall.takeAt.filter(x => x.day > day), last: ground.wall.last },
              banked: Object.assign({}, you._banked || {}),
              bankedBy: (function () { const by = {}; for (const rid in (you._banked || {})) { const cat = MAP.resourceCategory ? MAP.resourceCategory(rid) : null; if (cat) by[cat] = (by[cat] || 0) + you._banked[rid]; } return by; })(),
              openBy: (function () { const by = {}; for (const o of planet.objectives || []) { if (o.type !== 'resource_site' || o.looted) continue; const cat = o.category || (MAP.resourceCategory ? MAP.resourceCategory(o.resource) : null); if (cat) by[cat] = (by[cat] || 0) + Math.round(o.potency || 1); } return by; })(),
              record: world.record,
              corps: world.corps, you: opts.debugViews ? you : world.corps.find(c => c.id === seatId), echo,
              stats: opts.debugViews ? stats : undefined, planet: opts.debugViews ? planet : undefined, ground: opts.debugViews ? ground : undefined
            };
          };
          const views = {};
          for (const id of seatIds) views[id] = viewFor(id);
          const seen = Math.min.apply(null, seatIds.map(id => stats._fightCursor[id] || 0));
          if (seen > 0 && stats._fights) { stats._fights.splice(0, seen); for (const id of seatIds) stats._fightCursor[id] -= seen; }
          const lead = (_manager && views[_manager]) ? _manager : seatIds[0];
          const reply = yield Object.assign({}, views[lead], { seats: views, lead });
          const answers = (reply && reply.bySeat) ? reply.bySeat : { [lead]: reply };
          if (reply && reply.seats) {
            for (const id in reply.seats) { if (!corps.some(c => c.id === id)) continue; if (reply.seats[id] === 'human') _humans.add(id); else _humans.delete(id); }
            if (!_humans.has(_manager)) _manager = _humans.size ? [..._humans][0] : null;
            cst.human = Object.fromEntries([..._humans].map(id => [id, true]));
          }
          const applyAnswer = (seatId, answer) => {
            const you = corps.filter(c => c.id === seatId)[0];
            if (answer && answer.stance && you) {
              const idx = NOTCHES.indexOf(answer.stance);
              if (idx >= 0) { if (you.policy !== answer.stance) you.stanceChanges++; you.policy = answer.stance; for (const q of you.squads) { q.policy = answer.stance; q.stance = answer.stance; if (q._cq) q._cq.stance = answer.stance; } }   /* the whole banner's notch: every squad takes it */
            }
            if (answer && answer.squadStance && you) for (const k in answer.squadStance) { const q = you.squads[+k], n = answer.squadStance[k]; if (q && STANCE_DIALS[n]) q.stance = n; }
            if (answer && (answer.stanceAt || answer.leanings) && you) {
              you._stance = you._stance || {};
              for (const k in (answer.stanceAt || {})) setStance(you, k, answer.stanceAt[k]);
              for (const k in (answer.leanings || {})) { const n = NOTCHES[Math.max(0, Math.min(4, (+answer.leanings[k] || 3) - 1))]; if (n) setStance(you, k, n); }
            }
            /* §ORDERS a seat may send a squad somewhere: an order stands until it is carried out */
            if (answer && answer.orders && you) for (const k in answer.orders) {
              const q = you.squads[+k], o = answer.orders[k]; if (!q || !q._cq || !q._cq.alive) continue;
              if (o && o.zone != null && Z[o.zone] && o.zone !== q._cq.zone) { q._cq.intent = { type: 'take', zone: o.zone, why: 'order' }; q._cq.path = null; q._cq.wait = 0; }
              else if (o && o.hold) q._cq.intent = { type: 'hold', zone: q._cq.zone, why: 'order' };
              else if (o === null) q._cq.intent = null;
            }
            /* §CAPTIVES the seat decides each captive it holds: kill, keep or release; the undecided stay pending */
            if (answer && answer.captiveFate && you) for (const cq of cst.squads) { if (cq.oa !== seatId) continue;
              for (const k of cq.captives) { const f = k.body && answer.captiveFate[k.body.id]; if (f === 'kill' || f === 'release' || f === 'keep') k.fate = f; }
              settleCaptives(cq); }
            if (answer && answer.withdrawOffer && you && !you.withdrawn) postWithdrawOffer(you, answer.withdrawOffer, day, stats);
            if (answer && answer.withdrawReplies && you && !you.withdrawn) for (const fromId in answer.withdrawReplies) { const o = (stats.withdrawOffers || {})[fromId]; if (o && o.from !== you.id) o.replies[you.id] = !!answer.withdrawReplies[fromId]; }
            if (answer && answer.withdrawNow && you && !you.withdrawn && corps.filter(c2 => !c2.withdrawn && (c2.squads || []).some(q => squadHead(q).length)).length > 1) standDown(you, day, stats, corps);
            if (answer && answer.deal && you && /^ransom_/.test(answer.deal.kind || '')) {
              const d = answer.deal, yes = d.kind === 'ransom_pay' || d.kind === 'ransom_sell';
              const k = (stats.ransomCases || []).find(x => !x.done && x.fighter === d.fighter);
              if (k && k.owner === you.id && (d.kind === 'ransom_pay' || d.kind === 'ransom_decline')) k.ownerYes = yes;
              if (k && k.captor === you.id && (d.kind === 'ransom_sell' || d.kind === 'ransom_keep')) k.captorYes = yes;
              if (k && k.ownerYes && k.captorYes) {
                const owner = corps.find(c => c.id === k.owner), captor = corps.find(c => c.id === k.captor);
                const fb = owner && owner.allBodies.find(b => b.id === k.fighter);
                if (fb && fb.status === 'captured' && captor && stats._settleRansom) { stats._settleRansom({ kind: 'ransom', captor: captor.id, owner: owner.id, fighter: fb.id, price: k.price, day, worth: k.worth }, fb, owner, captor);
                  for (const cq of cst.squads) cq.captives = cq.captives.filter(x => x.body !== fb); }
                k.done = true;
              }
              stats._echo[seatId] = { kind: d.kind, corp: d.corp, name: k ? k.name : '', price: k ? k.price : 0 };
            }
          };
          for (const id of seatIds) applyAnswer(id, answers[id] || null);
        }
      }
      /* a withdrawn OA's squads leave the ground */
      for (const c of corps) if (c.withdrawn) for (const sq of c.squads) if (sq._cq && sq._cq.alive) { sq._cq.alive = false; sq._cq.gone = true; }
      /* --- the plans: every seat's squads, on the same planner --- */
      CONTEST.plans(cst);
      /* somebody goes back for the immobilised: the nearest standing squad of the corp in the region is ordered to them */
      for (const c of corps) for (const sq of c.squads) {
        if (squadHead(sq).length || !sq.bodies.some(b => b.status === 'injured')) continue;
        const cands = c.squads.filter(s2 => s2 !== sq && squadHead(s2).length && s2._cq && s2._cq.fight == null && Z[s2.zone].region === Z[sq.zone].region && !(s2._cq.intent && s2._cq.intent.why === 'order'));
        if (!cands.length) continue;
        const best = cands.sort((a, b) => (CONTEST.zoneDist(cst, a.zone, sq.zone) || 9) - (CONTEST.zoneDist(cst, b.zone, sq.zone) || 9))[0];
        best._cq.intent = { type: 'take', zone: sq.zone, why: 'order' }; best._cq.path = null; best._cq.wait = 0;
        stats.audit.rescuesSent = (stats.audit.rescuesSent || 0) + 1;
        rec({ t: 'rescue', zone: sq.zone, x: sq.x, y: sq.y, c: sq.corpId });
      }

      if (opts.onDay) opts.onDay(day, corps, ground, squadHead);
      /* --- DAY: supply --- */
      for (const sq of liveSquads()) {
        const hooks = squadHooks(sq);
        sq._captives = sq._cq ? sq._cq.captives.length : 0;
        consumeRations(sq, planet, raceById, hooks, stats);
        stats.squadDays++;
        if (sq.rationShort) stats.rationShortDays++;
        if (sq.rationDry) { addStress(sq, CONST.STRESS.rationDry, stats); stats.audit.rationDryDays++; }
      }
      /* --- DAY: hazards --- */
      for (const sq of liveSquads()) weatherCheck(rng, sq, planet, squadHooks(sq), stats);

      /* --- THE DAY, IN TWELVE TICKS: six of march, six of camp; the contest moves, meets and fights --- */
      for (const cq of cst.squads) cq.track = [cq.zone];
      for (let tick = 0; tick < CONST.TICKS_PER_DAY; tick++) {
        cst.tick = tick;
        /* §LIGHT the planet's own dark, for the fights and the watch */
        const absT = (day - 1) * CONST.TICKS_PER_DAY + tick;
        cst.dark = MAP.lightAt(planet, absT * CONST.HOURS_PER_TICK).dark;
        const before = cst.events.length;
        CONTEST.tick(cst);
        mirror();
        for (const e of cst.events.slice(before)) {
          if (e.t === 'move') { const cq0 = cst.squads[e.squad]; cq0.track.push(e.to); cq0.ref.movedToday = true; cq0.ref._marched = (cq0.ref._marched || 0) + (e.kind === 'route' ? 4 : ground.regions[Z[e.to].region].ticks); stats.audit.steps++; }
          if (e.t === 'contact') stats.audit.contacts++;
          if (e.t === 'harass') { const h = cst.squads[e.on].ref; for (let i = 0; i < e.hits; i++) { const b = squadHead(h)[0]; if (!b) break; b.status = 'injured'; b._recovery = CONST.HARASS_WOUND_DAYS; stats.injured++; } CONTEST.syncHeads(cst); rec({ t: 'harass', zone: e.zone, c: e.oa, on: h.corpId, hits: e.hits }); }
          if (e.t === 'wiped' && e.how === 'overrun') rec({ t: 'overrun', zone: e.zone, c: cst.squads[e.squad].oa, by: e.by });
        }
        noticed();
        /* the sites: whoever stands on one and is not fighting works it */
        for (const sq of liveSquads()) siteTick(sq);
        if (cst.tick === CONST.DAY_TICKS - 1) {
          /* dusk: the pickup — a standing squad on or beside an immobilised squad of its own gathers the wounded */
          for (const c of corps) for (const sq of c.squads) {
            if (squadHead(sq).length || !sq.bodies.some(b => b.status === 'injured')) continue;
            for (const s2 of c.squads) {
              if (s2 === sq || !squadHead(s2).length) continue;
              if (s2.zone !== sq.zone && Z[s2.zone].nb.indexOf(sq.zone) < 0) continue;
              for (let bi3 = sq.bodies.length - 1; bi3 >= 0; bi3--) { const b3 = sq.bodies[bi3]; if (b3.status !== 'injured') continue; s2.bodies.push(b3); sq.bodies.splice(bi3, 1); stats.audit.carriedOut = (stats.audit.carriedOut || 0) + 1; }
              if (s2._cq.intent && s2._cq.intent.why === 'order' && s2._cq.intent.zone === sq.zone) s2._cq.intent = null;
              break;
            }
          }
        }
      }
      cst.tick = 0; cst.day = day + 1;   /* the contest's clock turns with the day loop's */

      /* --- NIGHT: camp --- */
      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        if (stats._lightDay !== day) {
          let lit = 0;
          for (let tk = 0; tk < CONST.TICKS_PER_DAY; tk++) if (!MAP.lightAt(planet, ((day - 1) * CONST.TICKS_PER_DAY + tk) * CONST.HOURS_PER_TICK).dark) lit++;
          stats._lightDay = day; stats._lightShare = lit / CONST.TICKS_PER_DAY;
        }
        camp(rng, c, sq, squadHooks(sq), stats);
        forage(rng, sq, planet, squadHooks(sq), posture, stats);
        if (sq.rations > rationCap(sq)) sq.rations = rationCap(sq);
        if (!sq.foughtToday) addStress(sq, CONST.STRESS.quietDay, stats);
        if (sq._successions) { stats.audit.successions += sq._successions; sq._successions = 0; }
      }

      /* --- the record of the day --- */
      if (REC) {
        const sqRec = [];
        corps.forEach((c, ci) => c.squads.forEach((q, si) => {
          const cq = q._cq, alive = squadHead(q).length;
          if (alive) q._downAt = null;
          if (!alive && !q._downAt) q._downAt = { zone: q.zone };
          const demand = Math.max(0.001, rationDemand(q, raceById) * planet.supplyStrain);
          const it = cq.intent || {};
          sqRec.push({ c: ci, s: si, z: alive ? cq.zone : q._downAt.zone, x: alive ? q.x : Z[q._downAt.zone].x, y: alive ? q.y : Z[q._downAt.zone].y,
                       az: alive && it.type === 'take' ? it.zone : null,
                       w: alive ? (it.type === 'fight' ? 'fighting' : it.type === 'harass' ? 'picking' : it.type === 'take' ? (it.why === 'the wall' ? 'wall' : it.why === 'order' ? 'ordered' : it.why === 'rushing' ? 'rushing' : 'walking') : it.why === 'beaten' ? 'beaten' : it.why === 'won' ? 'won' : 'holding') : (q._reformed ? 'folded' : 'down'),
                       n: alive, st: Math.round(squadStress(q)), rat: Math.round(Math.min(30, q.rations / demand)), g: q.crates, cl: q.claiming ? 1 : 0,
                       hb: q._heldToday || 0, jn: q._joinedToday ? 1 : 0, cp: cq.captives.length, tr: alive ? cq.track.slice() : [] });
        }));
        REC.days.push({
          d: day, standing: CONTEST.standing(cst), next: GROUND.nextToGo(ground, day), window: windowDay,
          sq: sqRec,
          obj: planet.objectives.map(o => ({ id: o.id, z: o.zone, h: o.heldBy || null, t: o.type, lbl: o.label, open: siteLive(o, day), on: o.type === 'sponsor_cache' && o.litDay === day ? o.litBy : null })),
          corp: corps.map(c => ({ e: c.engagements, p: c.allBodies.filter(b => b.status === 'dead' || b.status === 'retired').length, a: c.allBodies.filter(b => b.status === 'active').length,
                                  w: c.allBodies.filter(b => b.status === 'injured').length, h: c.allBodies.filter(b => b.status === 'captured').length,
                                  o: c.hauled, si: c.sitesClaimed, st: c.policy, sd: Math.round(standing(c) * 100) })),
          ev: dayEvents
        });
      }

      /* ONE ending: a Divide is over when one banner is left standing, and a banner stands while any one of its
         people is on their feet. The wall does the rest. */
      const bannersLeft = bannersStanding(corps);
      stats.bannersStanding = bannersLeft.size;
      if (bannersLeft.size <= 1) { stats.winner = bannersLeft.size ? Array.from(bannersLeft)[0] : null; break; }
      if (day >= LAST_DAY + OVERTIME_MAX) { stats.overtimeExhausted = true; stats.winner = null; break; }
    }
    stats._cst = cst;   /* the contest's own state, for the harnesses that read its events */
    stats.contest = { steps: cst.audit.steps, contacts: cst.audit.contacts, fights: cst.audit.fights, joined: cst.audit.joined, harassed: cst.audit.harassed, heard: cst.audit.heard, wall: cst.audit.wall, wallFree: cst.audit.wallFree, captured: cst.audit.captured, wiped: cst.audit.wiped };
    /* §CAPTIVES still held when the shooting stops are kept: they go to the captor on their contracts, and the
       captor's standing answers for it (killed and released were answered at the capture) */
    stats.captiveOutcomes = stats.captiveOutcomes || { released: 0, kept: 0, killed: 0 };
    stats.captiveLog = stats.captiveLog || [];

    const corpIds = corps.map(c => c.id);

    /* §JOINING RETIRED "left to die" — a surrender refused at the table — went with the table's joins */

    for (const owner of corps) {
      for (const f of owner.allBodies) {
        if (f.status !== 'captured') continue;
        const captor = corps.find(c => c.id === f._capturedBy) || null;
        const out = captor ? 'kept' : 'released';
        stats.captiveOutcomes[out]++;
        stats.captiveLog.push({ fighter: f.id, name: f.name, owner: owner.id, captor: captor ? captor.id : null, out: out });
        if (out === 'released') f.status = 'injured';
        else { f.status = 'active'; f._transferredTo = captor.id; }
        if (captor && captor.rep) REP.act(captor.rep, 'kept_captive', { targetId: owner.id, rivalIds: corpIds });
      }
    }

    /* --- §3.1 the ledger of the dead ---------------------------------------------------
       Counted once, at the end, with the famous counted separately: a favourite's death
       swings an audience at triple weight, and until now fame had no reader but ransom. */
    for (const c of corps) {
      if (!c.rep) continue;
      let ourDead = 0, ourFamous = 0, loudest = 1;
      for (const b of c.allBodies) {
        if (b.status !== 'dead') continue;
        ourDead++;
        if ((b.fame || 0) >= REP.CONST.FAME_CEIL * 0.35) ourFamous++;
        /* §STORY WHOSE DEATH IT WAS. A company family's dead are mourned louder and a blame
           magnet is who the fleet decides it was about — the loudest name among the fallen
           carries the whole notice, which is how a fleet reads a casualty list. Read through
           `C.hooksOf`, the reader this module already uses, rather than reaching into events. */
        const hk = C.hooksOf(b, ROSTER.traitById);
        let m = 1;
        if (hk.has('death_pr_event_amplified')) m *= CONST.STORY_MOURNED;
        if (hk.has('blame_magnet')) m *= CONST.STORY_BLAME;
        if (m > loudest) loudest = m;
      }
      if (ourDead) REP.act(c.rep, 'our_dead', { count: ourDead, famous: ourFamous, storyMult: loudest });
      /* their dead, by your hand — attributed per victim's corp so the right fanbase reacts */
      const bag = c._killsBy || {};
      for (const victimCorp in bag) {
        REP.act(c.rep, 'their_dead', { targetId: victimCorp, count: bag[victimCorp].n,
                                       famous: bag[victimCorp].famous });
      }
      /* §3.1 — REDEFINED for the same reason: most Divides are decided before the ring
         finishes closing, so "reached the last ground" as a geographic fact almost never
         happened. What it means is that the contest came down to you — your banner was still
         up when it ended. */
      if (!c.withdrawn
          && c.allBodies.some(b => b.status === 'active' || b.status === 'injured')) {
        c.reachedLastGround = true;
        REP.act(c.rep, 'last_ground', { rivalIds: corpIds });
      }
    }

    /* --- §3.1 conduct read off the whole Divide -----------------------------------------
       Three acts that are properties of how a corp spent thirty days rather than of any one
       moment, so they are counted once here rather than accumulated day by day. */
    const engs = corps.map(c => c.engagements || 0).sort((a, b) => a - b);
    const fieldMedianEngagements = engs[Math.floor(engs.length / 2)] || 1;
    for (const c of corps) {
      if (!c.rep) continue;
      /* Hiding. REDEFINED DURING IMPLEMENTATION, because the first version could never be
         true: it counted weeks in which a corp was not seen fighting, and the closing ring
         means the LEAST engaged corp in the field still fights five times. Nobody hides for
         a week on a shrinking planet. What is real, and what the fleet actually punishes, is
         fighting far less than everyone else — so it is measured against the field rather
         than against the calendar. */
      const rate = c.engagements || 0;
      if (rate < fieldMedianEngagements * 0.5) {
        REP.act(c.rep, 'hid', { count: Math.max(1, Math.round((fieldMedianEngagements * 0.5 - rate) / 3)) });
      }
      /* refusing the table all the way through. Not a flag on a profile — a corp that was
         offered a way out and never took one, which is the far end of the same scale the
         wall lives on. */
      /* §JOINING RETIRED refusing the table is refusing to LEAVE it now: an OA that answered two or more
         public withdrawal offers with a no and stayed on the ground to the end (`_refusedOffers`, counted
         at the withdrawal replies) — it used to count join offers, which nobody sends any more. */
      if (!c.withdrawn && (c._refusedOffers || 0) >= 2) {
        REP.act(c.rep, 'refused_all', { rivalIds: corpIds });
      }
      /* and taking on somebody worth beating */
      if (c._worthyFights) REP.act(c.rep, 'worthy_fight', { count: c._worthyFights, scale: 1 });
    }

    /* --- §5.1 placement ----------------------------------------------------------------
       Everyone who never ceded and never was disqualified stopped standing when their last
       fighter went down; the ones still on their feet under a broken banner fall now. */
    for (const c of corps) {
      if (stats.winner === c.id) continue;
      if ((stats.fallen || []).some(f => f.id === c.id)) continue;
      /* on its feet means a squad with a body standing; the wounded lying in the holds are not a banner */
      const alive = (c.squads || []).some(q => (q.bodies || []).some(b => b.status === 'active'));
      recordFall(stats, c.id, c._downedOn || stats.days || 30, c.withdrawn ? (c.withdrawn.how || 'withdrew') : alive ? 'standing' : 'wiped');
    }
    /* §7.4 — what each corp actually dug out, by name. The assay bank was a single credit
       figure; the sites carry a resource now, so what comes home can be counted in the thing
       itself, which is what a board demand is written against. */
    stats.banked = {};
    /* §UNITS WHAT A SITE IS WORTH, as a share of a hold. It used to yield "crates" —
       `Math.round(potency)`, a count of nothing — which `fillHolds` then read as though it were
       already a share of a store, so one crate filled a warehouse that takes eight years to
       drain. The middle unit meant nothing at either end and is gone: a site yields the thing a
       manager actually receives. The RULING that sizes it: a planet RICH in a resource can fill
       a hold from empty, a moderate one about 40%, a slim one about 20% — which is `richness`,
       already derived in map.js from the composition, spread across the sites that carry the
       category and weighted by how deep each one is. */
    const siteTotals = {};
    for (const o of planet.objectives || []) {
      if (o.type !== 'resource_site' || !o.resource) continue;
      const cat0 = MAP.resourceCategory(o.resource); if (!cat0) continue;
      siteTotals[cat0] = (siteTotals[cat0] || 0) + (o.potency || 1);
    }
    const endowment = CONST.HOLD_RICH * Math.max(0.2, Math.min(1, planet.richness != null ? planet.richness : 1));
    /* §PRIZE THE SITES ARE THE QUICK GRAB, THE PLANET IS THE PRIZE (ruled). The fight is for a
       planet's mineral rights, and the circle the squads fight on is a sliver of it: the dug
       sites are something a squad can run for and keep, guaranteed, win or lose — but they are
       not the planet. They carry `SITE_SHARE` of the endowment between them; the planet's full
       endowment is the winner's, as the pot's resources (below). This spread the WHOLE
       endowment across the sites, which made "a rich planet fills a hold" a statement about
       digging when it was meant to be a statement about winning. */
    const yieldOf = (o, cat) => endowment * CONST.SITE_SHARE * ((o.potency || 1) / (siteTotals[cat] || 1));
    for (const c of corps) stats.banked[c.id] = {};
    /* §4.3 named claims: a site dug by the banner (the principal or anyone under it) that a
       deal promised to a joiner banks to the joiner */
    /* §JOINING RETIRED sites a join named for the joiner: no join names one now */
    for (const o of planet.objectives) {
      if (o.type !== 'resource_site' || !o.looted || !o.lootedBy || !o.resource) continue;
      const cat = MAP.resourceCategory(o.resource);
      if (!cat || !stats.banked[o.lootedBy]) continue;
      let to = o.lootedBy;
      const b = stats.banked[to] || (stats.banked[to] = {}), got = yieldOf(o, cat);
      b[cat] = (b[cat] || 0) + got;
      b[o.resource] = (b[o.resource] || 0) + got;
    }
    /* §4.1 and then the deals in kind settle: a share of the haul moves down each chain, roots
       first, so a joiner's joiner takes a share of a share and a banner that banked nothing
       owes nothing. The per-resource entries stay with the digger; the card and the holds
       read categories. */
    stats.haulLines = NEG.settleHaul(stats.banked, corps, stats.deals, stats.winner, REP.CATEGORIES);

    /* earliest off the ground places lowest; on the same day, the one with fewer people still standing */
    const upOf = (id) => { const c = corps.find(x => x.id === id); return c ? c.allBodies.filter(b => b.status === 'active' || b.status === 'injured').length : 0; };
    const fellIds = (stats.fallen || []).slice().sort((a, b) => (a.day - b.day) || (upOf(a.id) - upOf(b.id))).map(f => f.id);
    stats.placement = REP.placements(fellIds, stats.winner, [], corps.length);

    /* --- §3.1 the finish, and the planet ----------------------------------------------- */
    for (const c of corps) {
      if (!c.rep) continue;
      const place = stats.placement[c.id];
      if (place != null) {
        REP.act(c.rep, 'finished', { count: (corps.length + 1) / 2 - place });   /* above the middle of the table glory, below it the reverse */
      }
      if (stats.winner === c.id) REP.act(c.rep, 'won_planet', { rivalIds: corpIds });
      /* §3.1a held out: never sold, odds fell under the floor, and fought on from there */
      if (!c.withdrawn && stats.winner !== c.id && c._minOdds != null && c._minOdds < 0.15) {
        const after = Math.max(0, (c.engagements || 0) - (c._engAtLow || 0));
        if (after > 0) REP.act(c.rep, 'held_out', { scale: (1 - c._minOdds / 0.15) * Math.min(1, after / 3) });
      }
    }

    /* --- §10.3 settlement --------------------------------------------------------------
       The pot lands on the last banner standing, the umbrella settles down the chain, the
       assay banks pay out whatever happened, and the winner pays its own people. Nothing
       here decides anything: the winner was decided by the last fighter left standing. */
    let unclaimedHaul = 0;
    for (const o of planet.objectives) {
      if (o.type === 'resource_site' && !o.looted) unclaimedHaul += Math.round(o.potency || 1);
    }
    /* §PRIZE THE POT IS CREDITS AND RESOURCES. The winner takes the planet's mineral rights: the
       rolled credits, and the planet's endowment in every store it carries, into its holds. A
       rich planet fills a hold from empty (ruled); a moderate one about 40%, a slim one 20% —
       which is `richness`, derived in map.js from the composition. This is the thing a
       withdrawal bargains for a share of. */
    stats.potResources = {};
    for (const cat of REP.CATEGORIES) if (siteTotals[cat]) stats.potResources[cat] = endowment;
    if (stats.winner && stats.banked[stats.winner]) {
      const wb = stats.banked[stats.winner];
      for (const cat in stats.potResources) wb[cat] = (wb[cat] || 0) + stats.potResources[cat];
    }
    stats.settlement = NEG.settle(rng, corps, {
      pot: planet.pot.value, winnerId: stats.winner,
      deals: stats.deals, unclaimedHaul: unclaimedHaul
    });
    /* §WITHDRAWAL THE WINNER ANSWERS FOR ITS WORD. Every promise made to a leaver was
       non-binding: the OA that took the ground now decides, one by one, which it keeps. Nothing
       compels it — the contest is over and the only cost is what the fleet remembers — so the
       decision is made from its own character (an OA that deals straight keeps its word; one
       that does not, does not) and weighed against what the promise costs. Kept or broken, it
       is written to the OA's record, and the cost of breaking SCALES WITH THE SIZE of the
       promise: a cheap yes on a huge ask is a large liability, which is what stops a yes being
       free insurance. The record is what a manager reads on the withdrawal tab next time. */
    {
      const w = stats.winner ? corps.filter(c => c.id === stats.winner)[0] : null;
      const take = (stats.settlement && stats.settlement.take) || {};
      /* §SEATS (ruled: eight players) A PERSON'S WORD IS THEIRS TO KEEP. The engine's OAs answer for their word
         out of their character below; a person's OA was rolled the same way, and the fleet charged a manager
         for a betrayal nobody chose. The winner's seat, if a person holds it, is asked once here — a settlement
         window carrying each promise and what keeping it costs — and answers `{ keepWord: { toId: true|false } }`.
         Unanswered, a promise is kept: the honest default. */
      const owed = (stats.promises || []).filter(pr => w && pr.from === w.id);
      if (w && isHumanOA(w.id) && owed.length) {
        const ask = owed.map(pr => {
          const share = Math.max(0, Math.min(1, (pr.terms && pr.terms.credits) || 0));
          const stores = {}; for (const cat in (stats.potResources || {})) { const f = Math.max(0, Math.min(1, (pr.terms && pr.terms[cat]) || 0)); if (f > 0) stores[cat] = f; }
          return { to: pr.to, day: pr.day, share: share, owed: Math.round((take[w.id] || 0) * share), stores: stores };
        });
        const view = { day: day, settlement: true, winner: w.id, promises: ask, you: { id: w.id } };
        const reply = yield Object.assign({}, view, { seats: { [w.id]: view }, lead: w.id });
        const answer = (reply && reply.bySeat) ? reply.bySeat[w.id] : reply;
        stats._keepWord = (answer && answer.keepWord) || {};
      }
      for (const pr of (stats.promises || [])) {
        if (!w || pr.from !== w.id) { pr.moot = true; continue; }
        /* §HALF-BUILT A WIN THAT WAS BOUGHT: the winner promised a rival a share to leave the planet, and the
           fleet thinks less of a win paid for than one fought for (`bought_win`, written and never raised) —
           whether or not the promise is then kept, which is judged on its own below */
        if (w.rep) REP.act(w.rep, 'bought_win', { targetId: pr.to, rivalIds: corps.map(c => c.id) });
        const share = Math.max(0, Math.min(1, (pr.terms && pr.terms.credits) || 0));
        const owed = Math.round((take[w.id] || 0) * share);
        /* §PRIZE and a share of the PLANET'S STORES: what the winner took into its holds with
           the ground, not what it happened to dig — which is what a manager was asking for when
           he dragged a store's slider, and what the tile on the tab says is there to be won */
        const stores = {};
        let storesAsked = 0;
        for (const cat in (stats.potResources || {})) {
          const f = Math.max(0, Math.min(1, (pr.terms && pr.terms[cat]) || 0));
          if (f > 0) { stores[cat] = stats.potResources[cat] * f; storesAsked += f; }
        }
        /* §WITHDRAWAL an OA keeps its word out of its CHARACTER — its `treachery`. This read an
           `honesty` dial that does not exist, so every OA in the fleet kept its word at the same
           coin-flip rate and a manager's read of "who is good for it" was reading nothing. */
        const treach = (w.profile && w.profile.dials && w.profile.dials.treachery != null)
          ? w.profile.dials.treachery : 50;
        const straight = 1 - treach / 100;
        /* the settlement is past the last window, so this is not a manager's choice to make
           and takes no `decide` hook: an OA answers for its word out of its own character. */
        /* the larger the whole promise, the harder it is to keep: credits and stores alike */
        const keep = isHumanOA(w.id)
          ? !(stats._keepWord && stats._keepWord[pr.to] === false)     /* a person's own call; unanswered is kept */
          : rng() < keepChance(w, share + storesAsked / 4);            /* §MARKET the same trust the leaver priced */
        pr.kept = keep; pr.owed = owed; pr.stores = stores;
        if (keep) {
          const wb = stats.banked[w.id] || {}, lb = stats.banked[pr.to] || (stats.banked[pr.to] = {});
          for (const cat in stores) {
            const moved = Math.min(stores[cat], wb[cat] || 0);
            wb[cat] = (wb[cat] || 0) - moved; lb[cat] = (lb[cat] || 0) + moved;
          }
        }
        if (keep && owed > 0) {
          take[w.id] = (take[w.id] || 0) - owed;
          take[pr.to] = (take[pr.to] || 0) + owed;
          (stats.settlement.lines = stats.settlement.lines || []).push(
            { corp: pr.to, kind: 'promise_kept', amount: owed, from: w.id });
          REP.act(w.rep, 'generous_terms', { targetId: pr.to });
        } else if (!keep) {
          (stats.settlement.lines = stats.settlement.lines || []).push(
            { corp: pr.to, kind: 'promise_broken', amount: -owed, from: w.id });
          /* the weight of the lie is the weight of what was promised */
          for (let k = 0; k < Math.max(1, Math.round(1 + share * 4)); k++) {
            REP.act(w.rep, 'betrayed', { targetId: pr.to, rivalIds: corpIds });
          }
          const rec = (w.persist && (w.persist.wordRecord = w.persist.wordRecord || {})) || null;
          if (rec) { rec.broken = (rec.broken || 0) + 1; }
        }
        if (keep) {
          const rec = (w.persist && (w.persist.wordRecord = w.persist.wordRecord || {})) || null;
          if (rec) { rec.kept = (rec.kept || 0) + 1; }
        }
      }
    }

    /* §6.14 LEARNING INSIDE A CAREER. Every deal at the table was a promise about a take that
       had not happened yet. Now it has: a joiner learns whether joining THAT banner paid what
       it was promised (the take it got against the value it signed for), a principal learns
       whether buying THAT OA's help won. Kept per pair on the season corp (`persist.dealRecord`)
       and read into the price (`priceModifier`): an OA burned by a banner asks more of it next
       year; one paid in full asks a little less. Private — nobody else's opinion moves. */
    {
      const take = stats.settlement.take || {};
      const note = (who, other, good) => {
        const rec = who.persist && who.persist.dealRecord; if (!rec) return;
        const r = rec[other] = rec[other] || { good: 0, bad: 0 };
        if (good) r.good++; else r.bad++;
        stats.audit.lessons = (stats.audit.lessons || 0) + 1;
      };
      for (const dl of stats.deals) {
        if (dl.kind !== 'share' && dl.kind !== 'flat') continue;
        const j = corps.find(c => c.id === dl.joiner), p = corps.find(c => c.id === dl.principal);
        if (!j || !p) continue;
        const promised = (dl.why && dl.why.value) || 0;
        const paid = (take[dl.joiner] || 0) + (dl.credits || 0);
        note(j, dl.principal, promised <= 0 || paid >= NEG.CONST.DEAL_PAID_AT * promised);
        note(p, dl.joiner, stats.winner === dl.principal);
      }
    }

    for (const pc of stats.perCorp) {
      const c = corps.find(x => x.id === pc.id);
      pc.dropped = c.allBodies.length;
      pc.policy = c.policy;
      pc.hauled = c.hauled;
      pc.sitesClaimed = c.sitesClaimed;
      pc.stress = c.squads.reduce((s, q) => s + squadStress(q), 0) / c.squads.length;
      pc.captured = c.allBodies.filter(b => b.status === 'captured').length;
      /* Step 6 — what the Divide was worth to them. */
      pc.payout = stats.settlement.take[c.id] || 0;
      /* §PRIZE the sites this OA dug, for the quick buck each one pays beside its stores */
      pc.sitesDug = (planet.objectives || []).filter(o => o.type === 'resource_site' && o.looted && o.lootedBy === c.id).length;
      /* §WITHDRAWAL A CONCESSION IT CANNOT AFFORD IS A DEBT, NOT A GIFT. When a buyer's take
         could not cover the price of the ground it took, the shortfall was written as an
         `owed` line and no money moved — so an OA with nothing in the pot bought an enemy off
         the board for free, which is the one way to get a concession without paying for it.
         The debt rides home with the payout and the season charges it against the treasury. */
      pc.owed = (stats.settlement.lines || [])
        .filter(l => l.kind === 'owed' && l.corp === c.id)
        .reduce((t, l) => t + Math.abs(l.amount || 0), 0);
      pc.owedTo = (stats.settlement.lines || [])
        .filter(l => l.kind === 'owed' && l.corp === c.id).map(l => ({ to: l.to, amount: Math.abs(l.amount || 0) }));
      pc.won = stats.winner === c.id;
      pc.withdrawn = c.withdrawn ? { day: c.withdrawn.day, toId: c.withdrawn.toId } : null;
      pc.standDown = !!c.standDown;
      pc.ransomPaid = c.ransomPaid || 0;
      pc.ransomTaken = c.ransomTaken || 0;
    }
    if (REC) stats.replay = REC;
    stats.planet = planet;
    stats.corps = corps;
    stats.meanStress = stats.perCorp.reduce((s, p) => s + p.stress, 0) / stats.perCorp.length;
    return stats;
  }

  /**
   * Run a Divide to the end with nobody sitting in the window. This is a DRIVER and has no
   * logic of its own — the moment it grew a special case, a watched Divide and a played one
   * would be different contests and nothing outside would be able to tell.
   */
  function runDivide(rng, opts) {
    const g = divideCore(rng, opts || {});
    let step = g.next();
    while (!step.done) step = g.next();
    return step.value;
  }

  /* `applyOutcome` is exported for the unified viewer: a fight it stages settles back to the
     roster through the same function the Divide uses, because a second settler would drift the
     way the replay's two frame builders drifted. */
  const api = { CONST, squadCountFor, STANCE_DIALS, preparedness, STANCE_STANDING, NOTCHES,
                /* §STANCE the notch a manager sets at each OA, and what it is worth */
                setStance, NOTCH_WORDS, squadStance, squadDials, standing, prestigeOf, DEFAULT_RIGIDITY, STANCE_OVERRIDE, runDivide, divideCore, buildCorp, liveSquad, applyOutcome, principalOf, allied, bannersStanding, umbrellasOf, sealedCorp: sealed,
    squadStress, WEATHER };
  if (isNode) module.exports = api;
  global.CDDIVIDE = api;
})(typeof window !== "undefined" ? window : globalThis);
