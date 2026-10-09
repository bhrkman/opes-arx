/* Capital Divide — /sim/divide.js
 *
 * THE DIVIDE'S DAY LOOP AND ITS ECONOMY. The ground is sim/ground.js and what happens on it — movement,
 * sight, noise, the planner, the shape of a fight — is sim/contest.js, ticked from here. This file owns
 * what the people carry and what it costs: building the corps and their kit, rations, forage, camp and
 * the weather, the grid fight built from the squads' bodies and booked back to them, loot and fame,
 * stress, the sites worked, the reserve landed on beacons, the captives, the windows and the table
 * (ransoms and the Withdrawal; there are no truces), and the settlement.
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
  /* §7.1 the stances — what is left of the selection dials here        */
  /* ------------------------------------------------------------------ */

  /* The march, the sight and the meeting read their own dials (contest.js `STANCE`); what this
     file still reads is `seek`, how hard a grudge pulls an engine seat toward killing a captive.
     A preservationist corp is careful, not absent. */
  const STANCE_DIALS = {
    preservationist: { seek: 0.15 },
    measured:        { seek: 0.28 },
    standard:        { seek: 0.45 },
    unyielding:      { seek: 0.64 },
    death_or_glory:  { seek: 0.80 }
  };

  const NOTCHES = ['preservationist', 'measured', 'standard', 'unyielding', 'death_or_glory'];
  /* §STANCE the five notches, as a manager reads them: Avoid · Wary · Engage · Press · All In.
     `corp.policy` is the OA's DECLARED stance — its culture, what the board hears, and what a
     squad told nothing falls back on. */
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
    /* 'restock' (a munitions drop): every store back up to full, and what he picked up besides kept */
    if (keep === 'restock') { for (const id in full) f._charges[id] = Math.max(f._charges[id] || 0, full[id]); return; }
    for (const id in full) if (f._charges[id] == null) f._charges[id] = full[id];
  }
  function medkitCharges(bodies) {
    return (bodies || []).reduce((t, f) => t + ((f._charges || {}).itm_medkit || 0), 0);
  }
  function takeMedkitCharge(bodies) {
    for (const f of bodies) if (f._charges && f._charges.itm_medkit > 0) { f._charges.itm_medkit--; return; }
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
    /* §FIGHTS (ruled: fights end sooner) halved at the fatality pass: a standard squad breaks off a sixth down */
    STANCE_WITHDRAW_AT: { preservationist: 0.05, measured: 0.10, standard: 0.175, unyielding: 0.25, death_or_glory: 0.325 },
    STIM_NIGHT_COST: 5,                 // [C] §CONSUMABLES fatigue recovery a stim costs that night (its line)
    SHOWDOWN_HORIZON: 12,               // [C] §ENDGAME days before the last ground closes that an OA starts to price the showdown in full
    LEAVE_RATE_HORIZON: 4,              // [C] §WITHDRAWAL days the loss rate since the last window is projected over: the next two windows
    LEAVE_TRAINING_PER_DIVIDE: 3000,    // [C] §WITHDRAWAL the training a Divide survived puts into a man, that a replacement does not have
    LEAVE_TRAINING_CAP: 4,              // [C] and the Divides it counts, at most
    LEAVE_OWN_RATE: 0.5,                // [C] §WITHDRAWAL how much an OA's own rate of loss so far (against the field's) shapes what it expects staying to cost
    /* §STANDING what the crowd does on the ground (ruled at the standing pass) */
    CROWD_DROP_MORALE: 12,              // [C] morale a crowd of 100 (or 0, the other way) sends down with every fighter
    UNDERDOG_MORALE: 6,                 // [C] a day's morale a warm, full-share Underdogs faction lends an OA past hope
    BLOODHOUND_FAME: 1.0,               // [C] how much further a kill's fame travels with a warm, full-share Bloodhounds faction
    LOOT_AIM_SLACK: 3,                  // [C] §LOOT a taken gun may shoot this much worse (Total Aim) than his own and still be taken
    /* §PRESENCE what being a man the room looks at is worth */
    PRESENCE_STEADIES: 0.12,            // [C] and what the squad's steadiest hand lends a captain
    KESHU_FRICTION: 3,                  // [C] §KESHU what an old war costs a squad that holds
                                        //     both sides of it
    SQUAD_MAX: 8, SQUAD_MIN: 3,         // [S] squads live inside these bounds. RULED: the floor is THREE —
                                        //     it binds the manager's own squad page, which reads it from here
    SQUADS_MAX: 6,                      // [S] §SQUADS the most an OA may field, as ruled
    SPREAD_BASE: 0.25,                  // [C] the net every OA casts before its dials (was a `greed` dial no profile has, read as 0.5 × 0.5)
    SPREAD_AGGRESSION: 0,               // [C] §FLANK (ruled) appetite for contact no longer spreads an OA thin: measured, a
                                        //     force split small loses whatever its stance (two squads 20% of titles, five 8%);
                                        //     the bold concentrate, and work their squads together (the strike planner)
    SPREAD_PATIENCE: 0.45,              // [C] against what a careful OA keeps massed
    REFORM_AT: 3,                       // [C] below this the survivors are redistributed
    REST_TICKS_AFTER: 2,                // [C] §GROUND a squad that fought stands where it ended for this many ticks before it walks on
    REST_RECOVERY_MULT: 1.6,            // [C] a squad that rests the day recovers faster for it
    /* §WOUNDS (ruled) WHAT A FIGHT LEAVES, CARRIED TO THE NEXT. Health at a fight's end falls into a band and the fighter
       stands at the band's top until it mends after the Divide: 80% and over whole, 50–79 at 80%, 10–49 at 50%, under
       10 at 10%. A wound does not make anyone fight worse; it is how much less it takes to kill them. */
    HP_BANDS: [{ at: 0.8, to: 1 }, { at: 0.5, to: 0.8 }, { at: 0.1, to: 0.5 }, { at: 0, to: 0.1 }],
    CROWD_PLEASER_FAME: 1.5,            // [C] fame a `crowd_pleaser` kill pays its shooter, on the fame scale (0–100)
    RELEASED_RECOVERY: 4,               // [C] §CAPTIVES a released captive walks home hurt: out at least this many days
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
           A frightened captain sees more enemies than there are and fewer of his own. */
    MIND_LOW: 25, MIND_MID: 90, MIND_HIGH: 135,   // [C] the spread a roster's stats actually deal
    HUMAN_COMMAND: 0.12,                // [C] §RACES what a human's aptitude for command is worth
    JUDGE_MIN: 1.1, JUDGE_MAX: 3.4,     // [C] the sharpness the worst and best captains bring
    SIGHT_NEAR: 0.10,                   // [C] the ground a captain of 0 can weigh at all
    SIGHT_FAR: 0.55,                    // [C] and what a captain of 100 weighs
    SITE_SHARE: 0.25,         /* [H] §PRIZE what all of a planet's sites of one store together carry of the planet's
                                 amount of it: the grab, beside the prize the winner takes */
    STRONGPOINT_PREP: 0.25,   /* [H] §SITES the ground a held strongpoint gives the one on it */
    /* §5.2 (ruled) RATIONS ARE CARRIED BY CHOICE. Every squad lands with the days of food its seat chose for it (the
       engine's seats choose by the ground's forage); each day weighs a fifth of a Bulk and costs credits, and a fighter's
       Bulk limit carries the default load. More food is less foraging and a squad that can sit; less is lighter. */
    RATION_DEFAULT_DAYS: 15,            // [R] the default load, and the floor foraging fills to
    RATION_DAYS_RANGE: [5, 30],         // [C] what a seat may choose
    RATION_BULK_PER_DAY: 0.2,           // [R] a day's food for one fighter, in Bulk
    RATION_PRICE: 25,                   // [C] credits a fighter-day of food
    RATION_ENGINE_PULL: 8,              // [C] days an engine seat adds per unit of forage the ground lacks (below the middle)
    RATION_FORAGE_MID: 0.5,             // [C] the forage yield the default load is sized for
    STARVE_AFTER: 3,                    // [R] dry days before hunger takes health
    STARVE_HARM: 0.05,                  // [C] a day's hunger, as a share of a body's health
    STARVE_FLOOR: 0.30,                 // [C] hunger alone takes nobody below this
    /* §7.5 ELEVATION, read three ways */
    HIGH_GROUND_PREP: 0.25,             // [C] readiness edge for the side that came from the higher ground
    RATION_SHORT_AT: 3,                 // [S]
    FORAGE_YIELD: [0.08, 0.5, 1.05, 1.7],  // [C] rations/fighter/day by region forage class
    FORAGE_FIELDCRAFT: 0.003,           // [C] per point of fieldcraft over 100
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
    /* §8.2 captain stress */
    STRESS: {
      killed: 4, downed: 1.5, rationDry: 2, succession: 15, quietDay: -3, cleanWin: -5
    },
    STRESS_MAX: 100,
    /* §9 objectives */
    INTEL_CAP: 0.18,                    // [S] most readiness a season of scouting can buy
    BEACON_SEAT_PULL: 3,                // [C] §RESERVE what a beacon is worth to a squad, by its open seats: half empty, two and a half
    BEACON_TICKS: 2,                    // [C] §RESERVE two-hour blocks a beacon must be held, uncontested, for one landing
    /* §RESERVE only an enemy ON the beacon stops a landing — the same radius as standing on a site — and any two enemy
       squads on one lit beacon are in contact (below). The first cut blocked from 0.04 against an engage range of 0.02,
       so a rival parked beside a beacon blocked every landing and could never be fought: a standoff by geometry. */
    /* §ROUNDS (ruled) rounds carry from fight to fight; a squad short of them fights and chooses as one */
    AMMO_READY_SHARE: 0.35,             // [C] of a full load, below which a fighter counts as running dry
    AMMO_DRY_WORTH: 0.35,               // [C] what a fighter with nothing left for his gun counts for (his sidearm)
    AMMO_DRY_NEED: 3,                   // [C] how much more a munitions drop is worth to a squad the drier it runs
    /* §6.3 standing */
    STANDING_PER_ENGAGEMENT: 0.015,     // [C] fighting in public builds your reputation
    STANDING_PER_SITE: 0.050,           // [C] holding ground the crowd can see
    STANDING_MIN: 0.12, STANDING_MAX: 1.0,
    STANCE_PULL_HURT: 2.6,              // [C] notches toward care, at total loss
    STANCE_PULL_PENNED: 1.1,            // [C] and toward aggression once the wall pens it in
    STANCE_PULL_AHEAD: 0.7,             // [C] an opening is worth taking
    RANSOM_ANSWER_WINDOWS: 2,           // [C] §TIME the windows a person has to answer a ransom before it lapses
    LEAVE_OVERTIME_GUESS: 6,            // [C] the days past the last ground an OA expects a contest to run
    UNDERDOG_FAME_PER_PLACE: 0.12,      // [C] §SNOWBALL fame for a kill, per place the victim's OA finished above the killer's
    UNDERDOG_FAME_FLOOR: 0.4,           // [C] and the least it falls to, hitting all the way down
    CHAMPION_FAME_BONUS: 0.5,           // [C] and half again on top for one of the champion's own
    LEAVE_EARLIEST_DAY: 5,              // [C] before this an OA has seen too little of its own losses to price them: on the rebuilt ground the drop itself is the first two days' fighting, so the first window reads only the drop
    CEDE_STANDING_POINTS: 20,           // [C] §WITHDRAWAL the standing ceding costs, own and fleet together (4–14 + 5–18)
    STANDING_CREDIT: 2000,
    WITHDRAW_ASK_MAX: 0.9,              // [C] the most of the pot any seat may ask for its exit
    WORD_RECORD_WEIGHT: 3,              // [C] §WITHDRAWAL promises on the record before it counts as much as character
    KELLIS_PACT_SHARE: 0.25,            // [C] §RACES the share of a house's people that makes it a Kellis house to the fleet
    KELLIS_PACT_TRUST: 0.08,            // [C] and what that adds to the trust in its word
    GREED_SPAN: 0.5,                    // [C] §WITHDRAWAL (ruled: an element of greed) a house weighs its shot at the prize up by as much as half again, by its aggression
    PLAN_ASKED: 2.2,                    // [C] §BOARD a deposit of the resource the OA's board demanded, against 1 for any other (the old CMD_W_ASKED)
    /* §CAPTIVES what holding people costs, and what an engine seat weighs when it decides */
    CAPTIVE_RANSOM_P: 0.5,              // [C] the chance a held captive is bought back, as an engine seat reckons it
    CAPTIVE_ROSTER_SHARE: 0.6,          // [C] what a captive kept to the end is worth on the captor's roster, of what he cost his own
    CAPTIVE_REP_W: 0.25,                // [C] a point of an act's weighted taste, as standing points an engine seat prices at STANDING_CREDIT
    CAPTIVE_GRUDGE_W: 0.5,              // [C] how much of a captive's worth what his captor thinks of his OA swings toward killing (a grudge) or sparing (warmth)
    RANSOM_TEETH_W: 1.0,                // [C] §RANSOM after a refusal, what being believed next time is worth to the captor, of the price refused
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
     allowance is gone. An OA spends what its reckoning leaves for kit at the drop (season.js planFor, ledger.plan),
     tempered by its WILL — a fat planet opens the purse — and the money is laid out evenly across the force (`planForce` shares it), because the
     measured worth of kit is in the tier everyone carries, not in one railgun: each tier step is worth about
     ten points of win rate and half the casualties. Wealth, for the locker's depth, is budget per body against
     KIT_BUDGET_REFERENCE, the point at which a corp is rich enough to field tier 4 for all. */
  function kitIntent(profile, planet, bodyCount, kitBudget, season) {
    const budget = kitBudget != null ? kitBudget : 0;
    const perBodyAfford = budget / Math.max(1, bodyCount);
    const w = Math.max(0, Math.min(1, perBodyAfford / ITEMS.CONST.KIT_BUDGET_REFERENCE));
    const depth = ITEMS.CONST.LOCKER_DEPTH_POOR
                + (ITEMS.CONST.LOCKER_DEPTH_RICH - ITEMS.CONST.LOCKER_DEPTH_POOR) * w;
    const rich = planet.pot && planet.pot.worth != null ? planet.pot.worth - 0.5 : 0.5;   /* an average world (worth 1) is the middle */
    let will = 0.90
             + ITEMS.CONST.WILL_WORTH_PULL * (Math.max(0, Math.min(1, rich)) - 0.5) * 2;   /* (ruled: one judgement, no house's thrift) */
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
  /* §WITHDRAWAL (ruled) A PERSON'S HOUSE STILL LEAVES WHEN STAYING COSTS MORE THAN GOING, when nobody is deciding for it:
     a seat whose window passes unanswered (a simulated house), or whose person has left the call to the books, weighs
     leaving — and answers others' offers to leave — by the same reckoning every engine seat uses. A person who wants
     the call keeps it. */
  function decidesItself(c) { return !isHumanOA(c.id) || c._autoLeave !== false; }
  /* STEP 6 is not built: the comms window still serves ONE manager, asked for here and marked where used */
  let _manager = null;
  function equipCorp(corp, profile, loadoutOverride, planet, season) {
    if (loadoutOverride) { ITEMS.equipForce(corp.allBodies, loadoutOverride); return corp; }
    const doc = ITEMS.doctrineFor(profile);
    const total = corp.allBodies.length;
    /* What the ledger says this corp can actually put into kit this season. */
    /* SEASONS.md — ONE treasury. This used to call LED.open(profile) every Divide, so the
       money that decided kit was the band midpoint no matter what last season did. A
       persistent Corp hands its actual account in; a one-off Divide still opens one. */
    const acct = (corp.persist && corp.persist.account) || LED.open(profile);
    /* §MONEY what the seat's reckoning leaves for kit at the drop (season.js planFor); a one-off Divide spends what it holds */
    corp.kitBudget = Math.max(0, (corp.persist && corp.persist.kitMoney != null) ? corp.persist.kitMoney : acct.treasury);
    const intent = kitIntent(profile, planet || { pot: { worth: 1 } }, total, corp.kitBudget, season);
    /* §STAFF an Armourer stretches what the house means to field, not the cash: the cash is all the reckoning leaves
       (boosting it spent the families' hold and the cushion) */
    intent.allowance *= ((corp.persist && corp.persist.kitBoost) || 1);
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
    /* §QUARTERMASTER (fixed) a founder's issue goes back on the rack before the plan: it is owned kit */
    for (const f of corp.allBodies) if (f._issued) { for (const id of f._issued) handStock[id] = (handStock[id] || 0) + 1; f._issued = null; }
    /* §QUARTERMASTER (fixed) WHAT IT OWNS IS IN THE OUTLAY. The allowance is the kit the force fields, owned kit counted at its
       price — and it was set from cash alone, so a corp holding a rack of tier-three rifles could not afford to carry them and
       bought tier-one guns instead. What the force can use of its own rack (a gun and an armour a body, within the Armoury)
       is added to what it means to spend. */
    {
      const capT = Math.min((ITEMS.doctrine(doc.id) || {}).armoury_max_tier || 5, (corp.persist && corp.persist.maxTier) || 5);
      let owned = 0;
      for (const slot of ['primary', 'armor']) {
        const prices = [];
        for (const id in handStock) { const it = ITEMS.byId(id); if (!it || it.slot !== slot || (it.tier || 1) > capT) continue;
          for (let k = 0; k < handStock[id]; k++) prices.push(it.cost || 0); }
        prices.sort((a, b) => b - a);
        owned += prices.slice(0, total).reduce((t, v) => t + v, 0);
      }
      intent.allowance += owned; intent.owned = owned;
    }
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
        /* (fixed) bought at the quartermaster's price: the year's swing, less a standing's discount by family — it was the
           list price, so a hand-kitted gun was cheaper than the quartermaster's in a dear year and dearer in a cheap one */
        const handPrice = (it) => { const fam = it.slot === 'armor' ? 'armor' : (it.damage === 'energy' || it.family === 'energy') ? 'energy' : 'ballistic';
          const d = SPON && SPON.standingDiscount && (it.slot === 'primary' || it.slot === 'sidearm' || it.slot === 'armor') ? Math.max(0, Math.min(0.6, SPON.standingDiscount(corp, fam) || 0)) : 0;
          return Math.round((it.cost || 0) * ((corp.persist && corp.persist.priceMult) || 1) * (1 - d)); };
        for (const it of items) {
          val += it.cost;
          if ((handStock[it.id] || 0) - (trial[it.id] || 0) > 0)
            trial[it.id] = (trial[it.id] || 0) + 1;
          else buy += handPrice(it);
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
      family: (corp.persist && corp.persist.kitFamily) || null,   /* §SPONSORS the guns a contract asks for */
      priceMult: (corp.persist && corp.persist.priceMult) || 1,
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
          family: (corp.persist && corp.persist.kitFamily) || null,
          priceMult: (corp.persist && corp.persist.priceMult) || 1,
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
    /* §3.1 a muster that failed is the ledger's problem, not the day loop's: whoever was not kitted by hand (a
       manager's own, a mercenary's own) carries the default issue, and the squads are stocked as any other */
    corp.kitValue = (plan.mustered ? plan.total : 0) + handValue;              /* catalog value FIELDED */
    corp.kitSpend = (plan.mustered ? (plan.spentCash || 0) : 0) + handSpend;   /* CASH SPENT — the ledger's charge */
    corp.handKitted = handed;

    /* §QUARTERMASTER each un-kitted fighter was planned AS THEMSELVES (items.js planForce) — a gun from the
       types they shoot best, a medkit if they are among the force's best at Fieldcraft — so each simply
       carries what was planned for them. The role-by-role deal that stood here (templates, a round-robin,
       whoever-fits-the-role, a rack swap and a specialist's purchase bolted on after) is gone with roles. */
    const planned = {};
    if (plan.mustered) for (const b of plan.bodies) if (b.fighter) planned[b.fighter] = b.loadout;
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
      /* §SPONSORS a victualler's standing order stretches what the drop carries, for good:
         the same load feeds the squad longer */
      const vict = SPON && SPON.standingValue ? SPON.standingValue(corp, 'victualler') : 0;
      if (vict) sq.rations = Math.round(sq.rations * (1 + vict));
      sq._rationPerHead = sq.rations / Math.max(1, sq.bodies.length);
      /* §CHARGES every fighter lands with the charges its stores carry for the Divide */
      for (const f of sq.bodies) chargeUp(f);
      sq.medkits = medkitCharges(sq.bodies);
      sq.hasMedkit = sq.medkits > 0;
    }
    /* §RESERVE and the fighters held in orbit carry what was planned for them: they were planned and paid for with
       the force, and land with it at a beacon. (The issue walked the squads only, so the reserve landed with the
       dress kit it came in, or none.) */
    for (const f of (corp.reserve || [])) { if (f._handKitted) continue; ITEMS.equip(f, planned[f.id] || ITEMS.DEFAULT_LOADOUT); chargeUp(f); }
    return corp;
  }

  /* SEASONS.md S2/S3 — a drop force deals into squads of at most eight and at least three. */
  /* §MON-WA A SQUAD HOLDS EIGHT BEINGS, and a pair is one of them with two bodies in it. The
     AI deals by BODY count, so a squad that drew four pairs came out eight bodies where eight
     seats were meant; sizes are dealt in seats and the bodies follow their partner. */
  function seatsOf(bodies) { return bodies.filter(b => !b.mirror_of).length; }
  function dealSizes(n, profile, want) {
    /* SQUAD_MAX and SQUAD_MIN live HERE, where the dealing happens, and season.js reads them
       off this module. */
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
    /* a manager's own call, or the landings drafted — never fewer squads than eight a squad needs */
    if (want && want >= 2) return Math.max(packed, Math.min(most, want));
    const d = (profile && profile.dials) || {};
    const dial = k => (typeof d[k] === 'number' ? d[k] : 50) / 100;
    /* what an OA wants: ground-hunger and appetite for contact push it wider */
    const spread = CONST.SPREAD_BASE
                 + dial('aggression') * CONST.SPREAD_AGGRESSION
                 - dial('patience') * CONST.SPREAD_PATIENCE;
    const reach = Math.round(packed + spread * (most - packed) * 2);
    return Math.max(2, Math.min(most, Math.max(packed, reach)));
  }
  function buildCorp(rng, profile, stance, rigidity, loadout, planet, persist, season) {
    /* SEASONS.md — the drop force is BORROWED when a persistent Corp supplies one. The
       people outlive the Divide; the squads, positions and banner do not. Without a Corp
       the roster is generated as it always was, so a one-off Divide is unchanged. */
    let drop = persist && persist.drop && persist.drop.length ? persist.drop.slice() : null;
    /* THE MANAGER'S OWN SQUADS. A persistent Corp may hand in `persist.groups` — arrays of
       body ids partitioning the drop — and `persist.leaders`, one id per group (or null to
       let tactics decide, which is the rule below and always was). This is only who stands
       with whom and who they look to: everything squads DO still belongs to the Divide, and
       succession still runs when the named leader goes down. Groups are the manager's
       authority and are taken as given — they are validated where the manager works, not
       re-judged here. Absent groups, the deal is exactly what it was. */
    const keepIdx = drop && persist.groups && persist.groups.length ? persist.groups.map((g, i) => (g && g.length) ? i : -1).filter(i => i >= 0) : null;
    const groups = keepIdx ? keepIdx.map(i => persist.groups[i]) : null;
    const leaders = (groups && persist.leaders) ? keepIdx.map(i => persist.leaders[i] || null) : null;   /* (fixed) kept in step with the groups */
    /* §5.2 (ruled) the days of food each squad carries: its seat's choice, or the engine's by the ground */
    const RANGE = CONST.RATION_DAYS_RANGE, engineDays = engineRationDays(planet);
    const rationDaysOf = (i) => {
      const asked = groups && persist.rations ? persist.rations[keepIdx[i]] : null;
      return asked != null && isFinite(asked) ? Math.max(RANGE[0], Math.min(RANGE[1], Math.round(asked))) : engineDays;
    };
    /* §SQUADS (fixed, at the root) NO PATH FIELDS A SQUAD PAST EIGHT. The squads asked for (one a drafted landing) are
       held to eight apiece whatever chose the drop: what they cannot hold — the lowest of the drop, a pair together — goes
       to the front of the reserve, its purse already paid, to land at a beacon as seats open. The season caps an engine
       seat's drop at its landings, but not where the draft was still open at the muster, nor for a person who never set
       a board; twenty went down in two squads of ten. */
    if (persist && persist.reserve) for (const b of persist.reserve) b._pursePaid = false;   /* last year's mark does not carry */
    if (drop && !groups && persist && persist._wantSquads >= 2 && seatsOf(drop) > persist._wantSquads * CONST.SQUAD_MAX) {
      const room = persist._wantSquads * CONST.SQUAD_MAX, keep = [], over = [];
      let seats = 0;
      for (const b of drop) { if (b.mirror_of) continue;
        const mate = drop.find(x => x.mirror_of === b.id);
        if (seats < room) { keep.push(b); if (mate) keep.push(mate); seats++; } else { over.push(b); if (mate) over.push(mate); } }
      for (const b of drop) if (keep.indexOf(b) < 0 && over.indexOf(b) < 0) keep.push(b);   /* a half with no lead in the drop */
      for (const b of over) b._pursePaid = true;
      persist.reserve = over.concat(persist.reserve || []);
      if (persist.drop) for (const b of over) { const k = persist.drop.indexOf(b); if (k >= 0) persist.drop.splice(k, 1); }
      drop = keep;
    }
    const dropById = {};
    if (groups) for (const b of drop) dropById[b.id] = b;
    const sizes = groups ? groups.map(g => g.length)
                : drop ? dealSizes(seatsOf(drop), profile, (persist && persist._wantSquads) || 0)
                : persist ? []          /* (fixed) a house with nobody to drop fields nobody — it fielded twenty-four strangers */
                : [8, 8, 8];
    const corp = {
      id: profile.id, profile, policy: stance,
      rigidity: rigidity != null ? rigidity : profile.rigidity != null ? profile.rigidity : (DEFAULT_RIGIDITY[profile.id] != null ? DEFAULT_RIGIDITY[profile.id] : 50),
      squads: [], allBodies: [], stanceChanges: 0, hauled: 0, sitesClaimed: 0, engagements: 0,
      withdrawn: null,          /* { day, terms, promises, how } once it has conceded and gone */
      /* set BEFORE equipCorp runs at the foot of this function — it reads the account and
         the locker off it, and setting it at the call site was too late. */
      persist: persist || null
    };
    let taken = 0;
    /* §MON-WA a pair's two bodies stand side by side in the order dealt, lead first, so a squad never closes between them */
    if (drop && !groups) {
      const byId = {}; for (const b of drop) byId[b.id] = b;
      const seen = new Set(), ordered = [];
      for (const b of drop) { if (seen.has(b.id)) continue;
        const lead = b.mirror_of && byId[b.mirror_of] ? byId[b.mirror_of] : b, mate = lead.bond_partner && byId[lead.bond_partner];
        for (const x of [lead, mate]) if (x && !seen.has(x.id)) { seen.add(x.id); ordered.push(x); } }
      drop = ordered;
    }
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
        corpId: profile.id, corp, bodies, captainId: led, sIdx: si,
        hasMedkit: false,        // set by equipCorp from what the squad actually carries (§10)
        x: 0.5, y: 0.5, hx: 0.5, hy: 0.5,           // position, and where they came from
        rations: rationDaysOf(i) * bodies.length, rationDays: rationDaysOf(i), rationDry: false,
        crates: 0,
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
          /* every captain here counts (a pair's captain too); only a single body can be moved, so with two captains in
             one squad the single one goes, whoever has the better tactics */
          const all = sq.bodies.filter(b => capSet.has(b.id) && !b.mirror_of);
          const movable = all.filter(single).sort((a, b) => a.stats.tactics - b.stats.tactics);
          let extra = all.length - 1;
          while (extra > 0 && movable.length && bare.length) {
            const mover = movable.shift();
            let placed = false;
            for (let k = 0; k < bare.length && !placed; k++) {
              const dest = bare[k];
              const swap = dest.bodies.filter(b => !capSet.has(b.id) && single(b)).sort((a, b) => a.stats.tactics - b.stats.tactics)[0];
              if (!swap) continue;
              sq.bodies[sq.bodies.indexOf(mover)] = swap; dest.bodies[dest.bodies.indexOf(swap)] = mover;
              swap._squadIdx = sq.sIdx; mover._squadIdx = dest.sIdx; bare.splice(k, 1); placed = true;
            }
            if (!placed) break;
            extra--;
          }
        }
      }
      for (const sq of corp.squads) {
        if (sq._named) continue;
        const cs = sq.bodies.filter(b => capSet.has(b.id));
        if (cs.length) sq.captainId = cs.sort((a, b) => b.stats.tactics - a.stats.tactics)[0].id;
      }
    }
    /* §TALKS who actually led a squad down: a promise of a squad to lead is judged on this, not on who was named */
    if (persist) persist.ledAtDrop = corp.squads.map(sq => sq.captainId).filter(Boolean);
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
  /* Step 6 — who stands on the field (NEGOTIATION.md §3)               */
  /* ------------------------------------------------------------------ */

  /* §WITHDRAWAL NOBODY STANDS UNDER ANYBODY: a beaten OA concedes the ground and leaves, and every
     OA on the planet answers for itself. Each OA is its own banner. */
  function principalOf(corp) { return corp; }


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


  /* ------------------------------------------------------------------ */
  /* Step 6 — the corp channel (NEGOTIATION.md §6, §11)                  */
  /* ------------------------------------------------------------------ */

  /** The banners currently on the field, each with everyone under it. */
  function umbrellasOf(corps) {
    const by = new Map();
    for (const c of corps) {
      if (!c.allBodies.some(b => b.status === 'active')) continue;   /* the hurt have gone home (ruled) */
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

  /** §CAPTIVES a captive given back — bought, or let go — comes home hurt: held, marched and kept from his kit, he is
      off his feet a few days, with the wound on his sheet like any other */
  function comeHome(f) {
    f._capturedBy = null;
    f.status = 'injured';
    f._recovery = Math.max(f._recovery || 0, CONST.RELEASED_RECOVERY);
    f.condition = f.condition || {}; f.condition.injuries = f.condition.injuries || [];
    if (!f.condition.injuries.some(x => (x.days_remaining || 0) > 0))
      f.condition.injuries.push({ type: 'inj_torso', severity: 'minor', days_remaining: CONST.RELEASED_RECOVERY, untreated: false });
  }

  /**
   * §6.9 WHO IS ON WHOM. A per-pair record, kept on each corp: fights between them, the last
   * day of contact, how many of those it lost to them and how many it won, and whether they
   * are hunting it now. `a` and `b` are corps.
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

  /* §5.1 — placement is recorded as banners stop standing, earliest first, so the finish
     order falls out of the Divide rather than being scored at the end. */
  function recordFall(stats, id, day, how) {
    stats.fallen = stats.fallen || [];
    if (stats.fallen.some(f => f.id === id)) return;
    stats.fallen.push({ id: id, day: day, how: how });
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
  /* how likely an OA is to keep a promise of this size, out of its own character (its `treachery`) */
  function wordOf(j, share) {
    const t = (j && j.profile && j.profile.dials && j.profile.dials.treachery != null) ? j.profile.dials.treachery : 50;
    return Math.max(0.05, Math.min(0.97, 0.97 - 0.55 * t / 100 - 0.25 * (share || 0)));
  }
  /* §WITHDRAWAL (ruled) HOW FAR THE FLEET TRUSTS AN OA'S WORD: what its character promises, moved by its record of promises
     to leavers kept and broken (the more of them, the more the record counts), and a little more for a house whose people
     are Kellis, whose word the fleet takes. This is what a leaver prices and what the page shows; an OA keeps or breaks
     its word out of its character (wordOf). */
  function keepChance(j, share) {
    const base = wordOf(j, share);
    const rec = (j && (j._wordRecord || (j.persist && j.persist.wordRecord))) || {};
    const kept = rec.kept || 0, broken = rec.broken || 0, n = kept + broken;
    const seen = n ? (kept + 1) / (n + 2) - 0.25 * (share || 0) : base;
    const w = n / (n + CONST.WORD_RECORD_WEIGHT);
    const people = (j && (j.allBodies || j.roster)) || [];
    const kellis = people.filter(b => b.status !== 'dead' && b.status !== 'retired' && (((ROSTER.raceById[b.race && b.race.id ? b.race.id : b.race] || {}).special || {}).pact_reputation)).length;   /* the race's own `pact_reputation` */
    const pact = people.length && kellis / people.length >= CONST.KELLIS_PACT_SHARE ? CONST.KELLIS_PACT_TRUST : 0;
    return Math.max(0.05, Math.min(0.97, base * (1 - w) + seen * w + pact));
  }
  function standDown(c, day, stats, corps, how) {
    if (c._downedOn == null) c._downedOn = day;          /* §PLACEMENT the day it left the ground */
    const off = (stats.withdrawOffers || {})[c.id];
    const promises = [];
    if (off) for (const id in off.replies) if (off.replies[id]) promises.push({ to: c.id, from: id, terms: off.terms, day: day });
    /* `how`: 'withdrew' — its own call, or a sold exit. Nobody is taken off the ground: an OA stays until it leaves or falls. */
    c.withdrawn = { day: day, terms: (off && off.terms) || null, promises: promises, byChoice: true, how: how || 'withdrew' };
    for (const q of c.squads || []) {
      if (!squadHead(q).length) continue;
      q.bodies = []; q.intent = null;
    }
    (stats.promises = stats.promises || []).push.apply(stats.promises, promises);
    if (stats.withdrawOffers) delete stats.withdrawOffers[c.id];
    stats.withdrawals = (stats.withdrawals || 0) + 1;
    REP.act(c.rep, 'ceded', { rivalIds: corps.map(x => x.id) });
  }
  /* (ruled) NO OA PROMISES MORE THAN THE WHOLE POT: what it has said yes to already — to those gone and to offers still
     standing — and this ask together stay within all of the credits and all of each store. A yes past it is a no. */
  function promiseRoom(cid, terms, stats) {
    const sum = { credits: 0 };
    const add = t => { for (const k in (t || {})) sum[k] = (sum[k] || 0) + Math.max(0, +t[k] || 0); };
    for (const p of (stats.promises || [])) if (p.from === cid) add(p.terms);
    for (const fid in (stats.withdrawOffers || {})) { const o = stats.withdrawOffers[fid]; if (o && o.replies && o.replies[cid] === true) add(o.terms); }
    for (const k in (terms || {})) if ((sum[k] || 0) + Math.max(0, +terms[k] || 0) > 1 + 1e-9) return false;
    return true;
  }
  function postWithdrawOffer(c, terms, day, stats) {
    /* (fixed) one bound on every seat's ask: credits to nine tenths of the pot (the engine's cap), each store to a whole */
    const t = {};
    for (const k in (terms || {})) { const v = Math.max(0, Math.min(1, +terms[k] || 0)); t[k] = k === 'credits' ? Math.min(CONST.WITHDRAW_ASK_MAX, v) : v; }
    (stats.withdrawOffers = stats.withdrawOffers || {})[c.id] = { from: c.id, terms: t, sentDay: day, replies: {} };
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

    /* §WITHDRAWAL A LEAVER'S STRENGTH LEAVES THE BOARD: a rival's odds with the leaver gone is what its going
       is worth. */
    function oddsWithout(leaver, rival) {
      const lP = principalOf(leaver), rP = principalOf(rival);
      if (lP.id === rP.id) return odds[rP.id] || 0;
      const without = umbrellas.filter(u => u.principal.id !== lP.id);
      if (!without.length) return odds[rP.id] || 0;
      const o = NEG.oddsBoard(without, { meanEngagements: meanEng });
      return o[rP.id] || 0;
    }

    /* what the table reads (negotiate.js: the ransom's two sides and appetite) */
    const ctx = {
      odds: odds, day: day, principalOf: principalOf, sealed: sealed, oddsWithout: oddsWithout,
      planet: planet, categoryOf: MAP.resourceCategory, corps: corps
    };

    /* Stop the Divide dead at a chosen window, with every corp left exactly as it stood.
       This is for tooling — an interface needs a real board it can negotiate against, and a
       board reconstructed from a summary is a board that can drift out of step with the
       engine. Nothing in a played game halts. */
    if (opts.haltAt === day) { stats.halted = { day: day, corps: corps }; return true; }

    /* a ransom paid: he comes home hurt, the money moves at the books, both crowds notice */
    function settleRansom(deal, f, owner, captor) {
      /* §MON-WA a pair bought back comes home in both bodies */
      const both = [f].concat(owner.allBodies.filter(b => b.id === f.bond_partner && b.bond_partner === f.id && b.status === 'captured' && b._capturedBy === captor.id));
      for (const b of both) comeHome(b);        /* they come home, and they come home hurt */
      /* and the captor's squad no longer walks him */
      if (stats._cst) for (const oa in stats._cst.held) stats._cst.held[oa] = stats._cst.held[oa].filter(k => both.indexOf(k.body) < 0);
      owner.ransomPaid = (owner.ransomPaid || 0) + deal.price;
      captor.ransomTaken = (captor.ransomTaken || 0) + deal.price;
      /* §3.1 — buying your people back is the thing your own ships care about most, and
         the captor's fanbase notices you dealt straight with them. */
      if (owner.rep) REP.act(owner.rep, 'ransomed_home', { targetId: captor.id });
      stats.deals.push(deal);
      stats.ransoms = (stats.ransoms || 0) + 1;
      (stats.captiveLog = stats.captiveLog || []).push({ fighter: f.id, name: f.pair_name || f.name, owner: owner.id, captor: captor.id, out: 'ransomed', price: deal.price, day: deal.day });   /* §MON-WA one row: the pair is bought back as one */
      if (stats._rec) stats._rec({ t: 'ransom', c: owner.id, from: captor.id, p: deal.price });
    }
    stats._settleRansom = settleRansom;

    /* §WITHDRAWAL one reckoning of what a departure is worth, for the leaver and the field alike */
    const W8 = NEG.CONST.CONCESSION_ASK_WEIGHT, POT = (planet.pot && planet.pot.value) || 0;   /* the pot reaches the winner's books whole (ruled) */
    const keepOf = (j, share) => keepChance(j, share);
    const onGround = (j) => !j.withdrawn && (j.squads || []).some(q => squadHead(q).length);
    /* a rival gains two things when an OA leaves: better odds, and the losses it is spared — the leaver's share of
       the strength on the ground, of what fighting on would have cost it. A BIG THREAT GOING spares a lot, which
       is why a strong OA can ask a hefty share and still be promised it. */
    const livingOf = (j) => (j.allBodies || []).filter(b => b.status === 'active').length;
    /* `seenBy`: the OA doing the reckoning. A rival knows its own cost of staying; a leaver guessing at a rival's does
       not see its books (wages, families, kit) and reckons it as its own per head, by the rival's people standing.
       (fixed: the leaver read every rival's true cost, so an engine leaver knew each one's exact yes) */
    const stayAsSeen = (j, seenBy) => {
      if (!seenBy || seenBy === j) return stayCost(j);
      const mine = livingOf(seenBy);
      return mine ? stayCost(seenBy) / mine * livingOf(j) : 0;
    };
    const spared = (leaver, j, seenBy) => {
      const total = corps.filter(onGround).reduce((t, x) => t + livingOf(x), 0);
      return total ? stayAsSeen(j, seenBy) * livingOf(leaver) / total : 0;
    };
    const maxAskFor = (leaver, j, seenBy) => {
      const mine = odds[j.id] || 0, withGone = Math.max(mine, ctx.oddsWithout(leaver, j) || 0);
      const value = (withGone - mine) * POT + spared(leaver, j, seenBy);
      return { withGone: withGone, maxAsk: withGone > 0 && POT > 0 ? Math.min(CONST.WITHDRAW_ASK_MAX, value / (withGone * POT * W8)) : 0 };
    };
    const leaveRows = (c) => corps.filter(j => j.id !== c.id && onGround(j)).map(j => Object.assign({ j: j }, maxAskFor(c, j, c)));
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
       will lose everyone — and nobody reads it before LEAVE_EARLIEST_DAY */
    const lastGroundDay = (() => { const w = planet.ground && planet.ground.wall; if (!w) return GROUND.CONST.DAYS; return Math.max(w.takeAt.reduce((m, t) => Math.max(m, t.day), 0), (w.zoneAt || []).reduce((m, t) => Math.max(m, t.day), 0)); })();
    const aliveOf = (j) => (j.allBodies || []).filter(b => b.status === 'active').length;
    /* §WITHDRAWAL (ruled: an OA weighs what it keeps by going) THE RATE IS THE DIVIDE'S SO FAR. Read off the last window
       alone, a quiet window priced staying at nothing and a bad one at a fortune, and a house stayed through the quiet
       ones until half its people were gone: its own losses since the drop, beside the field's, over the days it has
       fought (the first window still reads only the drop). */
    const fought = Math.max(1, day - 1);
    const lostOf = (j) => { const a2 = j.allBodies || []; return a2.length - a2.filter(b => b.status === 'active').length; };
    const fieldRateAll = (() => { let lost = 0, all = 0; for (const j of corps) { lost += lostOf(j); all += (j.allBodies || []).length; } return all ? lost / all / fought : 0; })();
    const stayCost = (c) => {
      if (day < CONST.LEAVE_EARLIEST_DAY) return 0;
      const all = c.allBodies || [], alive = all.filter(b => b.status === 'active');
      const daysLeft = Math.max(1, lastGroundDay + CONST.LEAVE_OVERTIME_GUESS - day);
      const rate = CONST.LEAVE_OWN_RATE * (lostOf(c) / Math.max(1, all.length) / fought) + (1 - CONST.LEAVE_OWN_RATE) * fieldRateAll;
      /* §ENDGAME AND THE END IS CERTAIN. The last ground closes to one zone at the month's end, so whoever is still on
         the ground then fights it out: what that costs is the share of its people an OA loses against everyone else
         still standing — little to a strong house, nearly all to a spent one. Read as the days run out, beside the
         rate it has been losing at; a quiet week is not a cheap month when the wall will put everybody together. */
      const rivals = corps.filter(j => j !== c && onGround(j)).reduce((t, j) => t + aliveOf(j), 0);
      const showdown = alive.length * rivals / Math.max(1, alive.length + rivals);
      const near = Math.max(0, Math.min(1, 1 - (lastGroundDay - day) / CONST.SHOWDOWN_HORIZON));
      /* the rate it has been losing at, over the days until it next decides — it reconsiders every window, so the rate
         is not a month's sentence — beside the showdown the end will cost it */
      const expect = Math.min(alive.length, Math.max(rate * all.length * Math.min(daysLeft, CONST.LEAVE_RATE_HORIZON), showdown * near));
      /* §WITHDRAWAL (ruled) WHAT A MAN LOST COSTS, ALL OF IT: his family's benefit, a year's wage to put somebody in his
         place, the Divides he has been through (the training that does not come back with the replacement), and the kit
         he carries. It was the wage and the kit, so the families — real money in the books — were never weighed. */
      /* (a pair's one contract is paid once: the Wa's mirrored copy carries no benefit and no wage — LED.paid) */
      const worth = alive.length ? alive.reduce((t, b) => t + (LED.paid(b) ? ((b.contract && b.contract.death_benefit) || 0)
                    + ((b.contract && b.contract.salary) || 0) * LED.CONST.SALARY_MONTHS : 0)
                    + Math.min(CONST.LEAVE_TRAINING_CAP, (b.experience || {}).divides || 0)   /* (fixed) career Divides, counted once (f.divides is the same Divides at this house) */ * CONST.LEAVE_TRAINING_PER_DIVIDE
                    + kitWorth(b.loadout), 0) / alive.length : 0;
      return expect * worth;
    };
    /* §CONNECT what staying is expected to cost each OA, as the engine seats weigh it: a person deciding whether to
       leave sees the same figure (the window carries it) */
    for (const c of corps) c._stayCost = stayCost(c);
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
        if (!decidesItself(c)) continue;        /* a person answers at their own window */
        if (sealed(c)) { off.replies[c.id] = false; continue; }   /* N11 no deals, of any size */
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
        const yes = asked <= maxAskFor(leaver, c).maxAsk && promiseRoom(c.id, off.terms, stats);
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
    for (const c of corps) {
      if (!decidesItself(c) || !onGround(c)) continue;
      if (sealed(c)) continue;   /* N11 the OA that does not deal does not retreat either: it is on the ground to the end */
      /* §WITHDRAWAL THE LAST ONE STANDING HAS WON, AND DOES NOT LEAVE. Every OA in this pass weighs the field as it
         stood at dawn, so three could each find staying worthless and all three walk in one pass, the third off an
         empty ground: a contest with nobody left and no winner (one in forty). Once the others have gone, there is
         nothing to leave. */
      if (corps.filter(onGround).length <= 1) { stats.audit.lastStood = (stats.audit.lastStood || 0) + 1; break; }
      /* §GROUND WHAT STAYING IS WORTH IS THE POT AND THE GROUND. The pot share alone never paid for a month of
         losses — on the rebuilt ground, where the drop is fought over from day one, every banner priced itself off
         the field by the second window. The deposits are where the money is: an OA weighs its share of what is
         still open on standing ground, at what a dug site pays, beside its chance at the pot. */
      const openLeft = (planet.objectives || []).filter(o => o.type === 'resource_site' && !o.looted && (o.revealed || o.revealDay == null || o.revealDay <= day)   /* (fixed) only what is known: it counted deposits four days before anyone could see them */ && (!planet.ground || (GROUND.standingOn(planet.ground, day).some(r => r.id === o.region) && !GROUND.zoneGone(planet.ground, o.zone, day))));
      /* §WITHDRAWAL AN OA READS ITSELF TRUE. The board is public — it cannot see wounds, so a house walking twenty hurt
         reads as twenty — and an OA that read its own chances off it believed a spent force could still win, stayed,
         and was wiped to the last man. It knows its own tent: a body counts for the health it has left (ruled: health, not
         heads), and the hurt who went home do not count at all. And it prices losing honestly: whoever does not win loses the standing a fall costs whether it walks
         or is wiped, so only its real chance of winning buys anything by staying — that, the ground still open, and
         the people the end will cost it. */
      const trueF = (c.allBodies || []).reduce((t, b) => t + (b.status === 'active' ? fightWorth(b) : 0), 0);
      /* like for like: the board counts every body not dead, retired or taken; the OA knows which of them stand */
      const seenN = Math.max(1, (c.allBodies || []).filter(b => b.status !== 'dead' && b.status !== 'retired' && b.status !== 'captured').length);
      const o0 = odds[c.id] || 0, tilt = Math.pow(Math.max(0.0001, trueF) / seenN, NEG.CONST.ODDS_SHARPNESS);
      const myOdds = o0 > 0 ? o0 * tilt / (o0 * tilt + (1 - o0)) : 0;
      /* a site pays whoever digs it, win or lose: the open deposits are worth its share of the field that will reach them */
      const fieldUp = corps.filter(j => !j.withdrawn).reduce((t, j) => t + (j.allBodies || []).filter(b => b.status === 'active').length, 0);
      const digWorth = openLeft.reduce((t, o) => t + (stats._sitePay ? stats._sitePay(o) : 0), 0) * Math.min(1, trueF / Math.max(1, fieldUp));   /* (ruled) the open sites at what they pay */
      const cost = standingCost(c);
      /* §WITHDRAWAL (ruled) GREED. A house judges the prize honestly and then wants it more than the sums say: the pot
         and the open ground are weighed up by its aggression (the cost of staying and of losing are not) */
      const dl = (c.profile && c.profile.dials) || {};
      const greed = 1 + CONST.GREED_SPAN * (dl.aggression != null ? dl.aggression : 50) / 100;
      const rows = leaveRows(c), stay = greed * (POT * myOdds + digWorth) - stayCost(c) - (1 - myOdds) * cost;
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
      if (k.ownerYes === false) { k.done = true; if (stats._refusedRansom) stats._refusedRansom(k.captor, k.fighter); continue; }
      if (k.captorYes === false) { k.done = true; continue; }
      /* §TIME a person's answer is waited for, but not for ever: unanswered through its windows, the case lapses */
      if (k.ownerYes == null || k.captorYes == null) {
        k.waited = (k.waited || 0) + 1;
        if (k.waited > CONST.RANSOM_ANSWER_WINDOWS) { k.done = true; k.lapsed = true; stats.audit.ransomLapsed = (stats.audit.ransomLapsed || 0) + 1;
          /* the owner's silence is a refusal; the captor's own is not — and (fixed) an owner that had no window to answer in
             (it left the ground, or fell, and a window is only for a seat still on it) has not been silent */
          const ownerAsked = owner && !owner.withdrawn && (owner.squads || []).some(q => squadHead(q).length);
          if (k.ownerYes == null && ownerAsked && stats._refusedRansom) stats._refusedRansom(k.captor, k.fighter); continue; }
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
        { const lead = leadAmong(corps, f); if (lead !== f && lead.status === 'captured' && lead._capturedBy === f._capturedBy) continue; }   /* §MON-WA one price, for the being */
        if (stats.ransomCases.some(k => k.fighter === f.id && !k.done)) continue;   /* already open */
        if (f._ransomRefused) continue;                                /* refused once: his captor has had its answer */
        const aiCaptor = !isHumanOA(captor.id), aiOwner = !isHumanOA(owner.id);
        let price, worth;
        if (aiCaptor) {
          const offer = NEG.ransomOffer(stats._choiceRng('ransom:' + f.id + ':' + day), captor, owner, f, ctx);
          if (!offer) continue;                                        /* it will not sell him, this time */
          price = offer.price; worth = offer.worth;
        } else {
          price = Math.round(NEG.ransomPrice(f) * NEG.priceModifier(captor, owner));
          worth = Math.round(Math.max(300, NEG.bodyWorth(f)));
        }
        const ownerYes = aiOwner ? (!sealed(owner) && NEG.ransomWorthPaying(owner, f, price, ctx)) : null;   /* N11 a sealed OA buys nobody back */
        if (ownerYes === false) { if (stats._refusedRansom) stats._refusedRansom(captor.id, f.id); continue; }   /* the owner will not pay that */
        const k = { fighter: f.id, name: f.pair_name || f.name, captor: captor.id, owner: owner.id, price: price, worth: worth,
                    day: day, captorYes: aiCaptor ? true : null, ownerYes: ownerYes, done: false };
        if (k.captorYes && k.ownerYes) {
          settleRansom({ kind: 'ransom', captor: captor.id, owner: owner.id, fighter: f.id, price: price, day: day, worth: worth }, f, owner, captor);
          continue;
        }
        stats.ransomCases.push(k);
      }
    }

  }

  /* §MON-WA what the partner-death roll did, for the audit and for the OA's own record (finishSeason → corp._bondLog) */
  function bondNote(stats, f, fate, corpId, was) {
    stats.audit.bondFates = stats.audit.bondFates || {}; stats.audit.bondFates[fate] = (stats.audit.bondFates[fate] || 0) + 1;
    (stats.bondEvents = stats.bondEvents || []).push({ id: f.id, name: f.name, was: was || null, corp: corpId, fate });
    if (fate === 'traumatized') (stats.severed = stats.severed || []).push({ id: f.id, name: f.name, corp: corpId });
  }
  /* §MON-WA a Wa whose Mon is in the Divide (alive or not): its pair's rows are written on the Mon */
  function hasLead(corps, b) {
    return !!(b && b.mirror_of && corps.some(c => (c.allBodies || []).some(x => x.id === b.mirror_of && x.bond_partner === b.id)));
  }
  /* §MON-WA a captive pair's lead: the Mon, wherever its body is held */
  function leadAmong(corps, b) {
    if (!b || !b.mirror_of) return b;
    for (const c of corps) for (const x of (c.allBodies || [])) if (x.id === b.mirror_of && x.bond_partner === b.id && x.status !== 'dead') return x;
    return b;
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
    /* §QUIRKS THE SITUATION A BODY IS IN, handed to the body as it is built — without it every
       situational condition answers false and a quirk written against one does nothing, which
       is the exact failure this catalogue is being rebuilt to escape. */
    const withConscript = avail.some(b => ((b.contract || {}).kind) === 'prisoner');
    const raceCount = {};
    for (const b of avail) raceCount[b.race] = (raceCount[b.race] || 0) + 1;
    const units = avail.map(f => C.makeCombatant(f, {
      traitIndex, isCaptain: f.id === cap.id, day,
      firstEngagement: engagementNo === 0, captainBonus: 0,
      squadSize: avail.length, withConscript: withConscript,
      onlyOfRace: raceCount[f.race] === 1,
      divides: (f.experience && f.experience.divides) || 0, age: f.age,
      /* "while carrying a wound" reads the harm he carries on the ground (_hpFrac) as well as the year's (fixed: a man
         hurt in his first fight was whole to his quirks in his second) */
      health: Math.min((f.condition || {}).health == null ? 100 : f.condition.health, f._hpFrac != null ? Math.round(f._hpFrac * 100) : 100),
      stress: (f.condition || {}).stress,
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
    TACTICAL.wirePairs(units);
    /* §CAPTIVES RULED: CAPTIVES COST NOTHING IN A FIGHT. A readiness and composure charge per captive was measured on
       the grid (equal squads of six, 2000 fights a count: 0, 1, 2 and 4 held lost 1.87, 1.87, 1.83, 1.76 of their own)
       and did nothing a fight could see; a cost is noticeable or it is not there. What holding costs is food, the
       march and standing. */
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
    const guns = fallen.filter(f => f.loadout && f.loadout.primary)
      .map(f => ({ f, id: f.loadout.primary })).sort((a, b) => costOf(b.id) - costOf(a.id));
    for (const g of guns) {
      const it = ITEMS.byId(g.id); if (!it) continue;
      let best = null, gain = 0;
      for (const s of standing) {
        const lo = s.b.loadout || {}; if (!lo.primary) continue;
        /* §STUN (fixed) a stun gun is a manager's choice, never the engine's (ruled) — and picking one up off a corpse is
           the engine's doing, for a person's people as for its own */
        if (((it.effects || {}).tags || []).indexOf('nonlethal') >= 0) continue;
        const mine = ITEMS.byId(lo.primary);
        const up = costOf(g.id) - costOf(lo.primary);
        if (up <= 0) continue;
        if (ITEMS.shotOf(s.b, it) + CONST.LOOT_AIM_SLACK < ITEMS.shotOf(s.b, mine)) continue;   /* not a gun he shoots well */
        if (up > gain) { gain = up; best = s; }
      }
      g.f._lootedPrimary = true;
      if (best) {
        const lo = best.b.loadout;
        best.b._spareKit = (best.b._spareKit || []).concat([lo.primary], lo.mods || []);       /* his own comes home on his back, beside anything he carried already */
        ITEMS.equip(best.b, { primary: g.id, mods: [], sidearm: lo.sidearm, armor: lo.armor, consumables: lo.consumables || [] });
        L.guns++; took = true;
        stats._rec && stats._rec({ t: 'loot', x: mx, y: my, c: best.q.corpId, name: best.b.name, gun: it.name || g.id });
      } else if (P.mulberry32(P.seedFrom('loot' + day + g.f.id))() < ITEMS.CONST.LOOT_RECOVERY_P) {   /* its own draw: the fight's stream is untouched */
        const carrier = standing.find(s => !s.b._spareKit || !s.b._spareKit.length);
        if (carrier) { carrier.b._spareKit = [g.id]; L.spares++; took = true; }
      }
    }
    if (took) L.fights++;
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
    /* §5.2 (ruled) HUNGER TAKES HEALTH: past a few dry days each body loses a share of its health a day, never past a floor */
    if (sq.rationDryDays > CONST.STARVE_AFTER) for (const b of squadHead(sq)) {
      const now = b._hpFrac != null ? b._hpFrac : 1;
      if (now > CONST.STARVE_FLOOR) { b._hpFrac = Math.max(CONST.STARVE_FLOOR, now - CONST.STARVE_HARM); if (stats) stats.audit.starved = (stats.audit.starved || 0) + 1; }
    }
    return demand;
  }

  /* §5.2 FORAGING IS A DAY'S WORK, NOT A BACKGROUND HUM. It ran every morning for every squad, marching or fighting
     or not, with no ceiling on what a squad could hold — so on any ground better than barren the rations only grew
     (70 at the drop, 321 by day 20 in the play-through) and supply never bound anything. Now a squad forages at
     camp only on a day it neither marched nor fought, and carries no more than its people landed with plus the
     packs they brought: a column on the move eats down, a squad that holds good ground eats up. The planner knows
     it: a group short of rations weighs a rest site and holding ground higher (`CMD_W_SUPPLY`). */
  function rationCap(sq) {
    /* what they landed with per head, or the default load if they chose less: foraging fills to it */
    return Math.max(CONST.RATION_DEFAULT_DAYS, sq._rationPerHead || 0) * squadHead(sq).length;
  }
  /* §5.2 (ruled) what an engine seat carries: the default load, more on ground that feeds a squad poorly and where the
     world eats more, less where it forages well */
  function engineRationDays(planet) {
    const g = planet && planet.ground;
    let y = CONST.RATION_FORAGE_MID;
    if (g && g.regions && g.regions.length) {
      let s = 0, a = 0;
      for (const r of g.regions) { const cls = Math.max(0, Math.min(3, Math.round((r.forage != null ? r.forage : 1) * (planet.forageMult || 1)))); s += CONST.FORAGE_YIELD[cls] * (r.area || 1); a += (r.area || 1); }
      y = a ? s / a : y;
    }
    const d = CONST.RATION_DEFAULT_DAYS * (planet && planet.supplyStrain || 1) + (CONST.RATION_FORAGE_MID - y) * CONST.RATION_ENGINE_PULL;
    return Math.max(CONST.RATION_DAYS_RANGE[0], Math.min(CONST.RATION_DAYS_RANGE[1], Math.round(d)));
  }
  function forage(rng, sq, planet, hooksOfSquad, stats) {
    /* a squad that fought, or marched more than half a day, had no day to forage; a short shift to better ground did */
    if (sq.foughtToday || (sq._marched || 0) > CONST.TICKS_PER_DAY / 2) return 0;   /* §GROUND marched is ticks walked today */
    const cap = rationCap(sq);
    if (sq.rations >= cap) return 0;
    const reg = planet.ground && sq.zone != null ? planet.ground.regions[planet.ground.zones[sq.zone].region] : null;
    /* the ground's forage class, thinned or thickened by the world it is on (an ice shelf yields a quarter of a cradle) */
    let yieldPer = CONST.FORAGE_YIELD[Math.max(0, Math.min(3, Math.round((reg ? reg.forage : 1) * (planet.forageMult || 1))))] || 0;
    if (planet.salvage) yieldPer += 0.15;
    yieldPer *= 1 + CONST.FORAGE_FIELDCRAFT * (squadStat(sq, 'fieldcraft') - 100);
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
    flooding:  { pace: 0.80 },
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
    if (stats._rec && kind) stats._rec({ t: 'weather', kind });
    return kind;
  }
  /* the weather's toll on one squad, once a day */
  function weatherCheck(rng, sq, planet, hooksOfSquad, stats) {
    const w = stats.weatherToday; if (!w || !w.kind) return null;
    const fx = w.fx, bodies = squadHead(sq);
    if (fx.fatigue) for (const b of bodies) b.condition.fatigue = Math.min(100, b.condition.fatigue + fx.fatigue);
    if (fx.lost && rng() < fx.lost) sq._lostDay = true;
    if (fx.hurt && bodies.length) {
      const onIt = fx.hurt.terrain ? (planet.ground && sq.zone != null && planet.ground.regions[planet.ground.zones[sq.zone].region].terrain === fx.hurt.terrain) : true;
      if (onIt && rng() < fx.hurt.p * CONST.WEATHER_HURT_MULT) {
        const victim = bodies[Math.floor(rng() * bodies.length)];
        /* §WOUNDS a wound short of going down is a result, not a weight: it keeps walking, and comes home as one */
        bandDown(victim);
        stats.hazardInjuries++;
        if (stats._rec) stats._rec({ t: 'hazard', x: sq.x, y: sq.y, kind: w.kind, c: sq.corpId });
      }
    }
    return w.kind;
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
      /* the cell's size is the gun's: read again whenever the gun in his hands is not the one it was read for */
      const gunId = f.loadout && f.loadout.primary;
      if (f._chargeMax == null || f._chargeFor !== gunId) {
        const k = f.loadout && f.loadout.kit;
        f._chargeMax = (k && k.charge) || 0; f._chargeFor = gunId;
        if (f._charge != null && f._charge > f._chargeMax) f._charge = f._chargeMax;
      }
      /* §LIGHT a sun-fed weapon is not charged at camp from cells: it takes what the day's light gave it —
         a whole day of sun fills it, a day of dark leaves it as it was */
      const solar = f.loadout && f.loadout.kit && (f.loadout.kit.tags || []).indexOf('daylight') >= 0;
      const gain = solar ? Math.round(f._chargeMax * ((stats && stats._lightShare != null) ? stats._lightShare : 0.5))
                         : CONST.CELL_RECHARGE;
      if (f._chargeMax > 0) {
        const was = f._charge == null ? f._chargeMax : f._charge;
        f._charge = Math.min(f._chargeMax, was + gain);
        /* §ROUNDS and what the cell in the gun does not take goes into the spares he carries: a cell-fed gun renews itself
           at camp, which a magazine never does */
        const R = f._rounds; let left = gain - (f._charge - was);
        if (R && R.cellMax > 0 && left > 0) R.spare = Math.min(R.spareMax, R.spare + left);
      }
    }

    /* PROCUREMENT.md §2.3 — bulk. A squad carrying more than it can comfortably haul pays
       for it every day, and the Olmac and Svalbard `carry_bonus` is what lets a squad field
       the heavy weapons at all. Over capacity is legal; it is not free. */
    {
      const heads = squadHead(sq);
      /* `b.race` is the race's id; the bonus is on the race record's `special` (races.json). Read off the string, it was 0 for everyone. */
      const bonus = heads.reduce((s, b) => s + (((ROSTER.raceById[b.race] || {}).special || {}).carry_bonus || 0), 0);
      /* §5.2 (ruled) the food is carried too, a fifth of a Bulk a day, and a fighter's limit carries the default load */
      const load = ITEMS.squadBulk(heads, bonus + heads.length * CONST.RATION_DEFAULT_DAYS * CONST.RATION_BULK_PER_DAY, (sq.rations || 0) * CONST.RATION_BULK_PER_DAY);
      sq.overBulk = load.over;
      if (load.over > 0) {
        const cost = load.over * ITEMS.CONST.OVER_BULK_FATIGUE;
        for (const b of heads) b.condition.fatigue = Math.min(100, b.condition.fatigue + cost / Math.max(1, heads.length));
        stats.audit.overBulkDays = (stats.audit.overBulkDays || 0) + 1;
      }
    }

    let recovery = CONST.FATIGUE_RECOVERY;
    if (sq._resting || sq.foughtToday) recovery *= CONST.REST_RECOVERY_MULT;   /* a squad that fought today rests tonight */

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
    /* the devout want a fight, and are told what the corp declared this turn */
    if (hooksOfSquad.has('death_or_glory_affinity')) {
      moraleDelta += (corp.policy === 'death_or_glory' ? 3 : corp.policy === 'unyielding' ? 1 : -2);
      stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1;
    }
    /* ...and they take a corp selling its claim personally (N2 — ceding IS the deal) */
    if (corp.withdrawn) {
      if (hooksOfSquad.has('cede_loyalty_morale_penalty_major')) { moraleDelta -= 5; stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1; }
      else if (hooksOfSquad.has('cede_loyalty_morale_penalty')) { moraleDelta -= 3; stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1; }
    }
    /* squad chemistry: who is standing next to whom */
    /* §KESHU THE GRUDGE TESTED FOR A RACE THAT DOES NOT EXIST. It looked for somebody of race
       "keshu" in the squad — and Keshu is a PLANET, the water world the Attorak and the Gil
       fought over for fifty-five years before the Opes Arx brokered the peace. The trait is
       race-locked to those two, so the friction is between THEM: an Attorak who never signed
       the peace standing beside a Gil, or the other way round. As written it could never once
       have fired. */
    if (hooksOfSquad.has('friction_with_keshu_rival_race')) {
      const hasAttorak = bodies.some(b => b.race === 'attorak')   /* (fixed) a fighter's race is its id: `.race.id` never matched */;
      const hasGil = bodies.some(b => b.race === 'gil');
      if (hasAttorak && hasGil) { moraleDelta -= CONST.KESHU_FRICTION; stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1; }
    }

    for (const b of bodies) {
      /* §CONSUMABLES a stimmed fighter pays for it that night: less rest out of the same camp */
      const rec = b._stimmed ? Math.max(0, recovery - CONST.STIM_NIGHT_COST) : recovery;
      b._stimmed = false;
      b.condition.fatigue = Math.max(0, b.condition.fatigue - rec);
      b.condition.morale = Math.max(5, Math.min(95, b.condition.morale + moraleDelta));
    }
    /* §WOUNDS (ruled: a medkit has its work now that harm is carried) a charge, at camp, lifts the worst hurt one band */
    if (sq.medkits > 0) {
      const worst = bodies.filter(b => b._hpFrac != null && b._hpFrac < 1).sort((a, b) => a._hpFrac - b._hpFrac)[0];
      if (worst) { bandUp(worst); sq.medkits--; sq.hasMedkit = sq.medkits > 0; takeMedkitCharge(sq.bodies); stats.audit.medkitsUsed = (stats.audit.medkitsUsed || 0) + 1; stats.audit.bandsMended = (stats.audit.bandsMended || 0) + 1; }
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

  /** §MIND what the captain brings to the decision: judgement, sight and nerve. A squad with nobody left to lead it decides badly, which is right. */
  function captainMind(sq) {
    const c = squadCaptain(sq);
    if (!c) return { judge: CONST.JUDGE_MIN, sight: CONST.SIGHT_NEAR, nerve: 0.55, cap: null };
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
      nerve: Math.max(0.1, Math.min(1, nerve * worn))
    };
  }






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
      /* §RELAY the mast maps the planet: every squad of the OA that fired it learns where every rival squad stands,
         as of now — knowledge its planner reads, and that a fight reads as having seen them first */
      const cst = stats._cst;
      if (cst) {
        const now = cst.day * CONTEST.CONST.TICKS_A_DAY + cst.tick;
        const mine = cst.squads.filter(q => q.alive && q.oa === sq.corpId);
        for (const o of cst.squads) { if (!o.alive || o.oa === sq.corpId) continue;
          for (const q of mine) q.know[o.zone] = { at: now, oa: o.oa, n: o.n, squad: o.id, how: 'relay' }; }
      }
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
    /* the running tally of what an OA has dug, by resource, which its window shows */
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
      case 'munitions_drop': for (const f of sq.bodies || []) chargeUp(f, 'restock'); sq.medkits = medkitCharges(sq.bodies || []); sq.hasMedkit = sq.medkits > 0;
        stats.audit.restocks = (stats.audit.restocks || 0) + 1;
        /* §ROUNDS a munitions drop puts a full load back: every magazine, every spare, every cell */
        for (const f of sq.bodies || []) { delete f._rounds; delete f._sideRounds; delete f._charge; }
        stats.audit.ammoResupply++; break;
      case 'ration_site': {
        /* §5.2 a site fills the packs; it does not make them bigger (the carry cap holds here as at the forage) */
        sq.rations = Math.min(Math.max(sq.rations, rationCap(sq)), sq.rations + CONST.RATION_DEFAULT_DAYS * squadHead(sq).length * 0.8 * pot);
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
  const PREP_BY_APPROACH = { holding: 0.20, hunting: -0.20 };   /* what the fight reads a squad as doing (gridResolve) */
  function preparedness(sq, opts) {
    opts = opts || {};
    let p = 0.50;
    p += PREP_BY_APPROACH[sq.approach] || 0;
    if (!sq.movedToday) p += 0.15;              /* you had time to look at the ground */
    if (sq._hunted) p -= 0.10;                  /* you came looking: you take what is there */
    if (opts.sawFirst) p += 0.15;               /* you watched them walk into it */
    /* §SITES fighting from a strongpoint you hold is fighting from ground you chose and dug */
    if (opts.strongpoint) p += CONST.STRONGPOINT_PREP;
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
  /**
   * Pick the notch for the next couple of days. Called at every corp window, for every corp,
   * and it is free. Returns true if the notch actually moved.
   */
  /* (fixed) A CHANGE OF STANCE COSTS THE SAME WHOEVER MAKES IT: the whiplash on a tradition keeper's people, and the count
     and the record. A person's change at the window set the notch and paid nothing. */
  function changeStance(corp, next, stats) {
    if (next === corp.policy) return;
    /* A tradition keeper's people dislike being redirected every other day. The hook was
       written for the old once-a-season model and never read; under a turn-by-turn dial it
       finally has something to resist. It does not BLOCK the change — the manager decides —
       it charges morale for the whiplash. */
    if (corpHasHook(corp, 'doctrine_change_resistance')) {
      const bite = 1;
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
  }
  function reconsiderStance(rng, corp, stats, ctx) {
    ctx = ctx || {};
    const home = culturalHome(corp);
    /* what it has left is health, not heads (ruled) */
    const alive = corp.allBodies.reduce((t, b) => t + (b.status === 'active' ? fightWorth(b) : 0), 0);
    const lostFrac = 1 - alive / Math.max(1, corp.allBodies.length);

    /* The situation's opinion, in notches away from home. */
    let pull = 0;
    pull -= CONST.STANCE_PULL_HURT * lostFrac;              /* bleeding pulls toward care */
    if (ctx.penned) pull += CONST.STANCE_PULL_PENNED;       /* nowhere left to hide */
    if (ctx.ahead) pull += CONST.STANCE_PULL_AHEAD;         /* an opening is worth taking */

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
    changeStance(corp, next, stats);
    /* No stress. Changing your mind about how to approach the next two days is not an injury. */
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
      if (h.has('media_statements_flat')) g *= 0.7;
      REP.addFame(t, g);
    }
    return gain;
  }

  function hpBand(frac) { for (const b of CONST.HP_BANDS) if (frac >= b.at) return b.to; return CONST.HP_BANDS[CONST.HP_BANDS.length - 1].to; }
  /* one band down, never past the last (fire from across a zone, the weather) */
  /* §ROUNDS what a body is worth in a fight now: the health it has left, and whether it has the rounds to fight with */
  function fightWorth(b) {
    const hp = b._hpFrac != null ? b._hpFrac : 1, r = C.roundsShare(b);
    const ready = r >= CONST.AMMO_READY_SHARE ? 1 : CONST.AMMO_DRY_WORTH + (1 - CONST.AMMO_DRY_WORTH) * r / CONST.AMMO_READY_SHARE;
    return hp * ready;
  }
  function bandDown(f) { const B = CONST.HP_BANDS, i = B.findIndex(b => b.to === hpBand(f._hpFrac == null ? 1 : f._hpFrac)); f._hpFrac = B[Math.min(B.length - 1, i + 1)].to; }
  function bandUp(f) { const B = CONST.HP_BANDS, i = B.findIndex(b => b.to === hpBand(f._hpFrac == null ? 1 : f._hpFrac)); f._hpFrac = B[Math.max(0, i - 1)].to; }
  function applyOutcome(sq, side, stats, captorId, victors) {
    let killed = 0, downed = 0;
    /* a combined side hands each fighter back to the squad they marched in with */
    const owner = {};
    if (side._parts) for (const p of side._parts) for (const u of p.units) owner[u.id] = p._sq;
    for (const u of side.units) {
      const f = u.ref;
      /* `crowd_pleaser` — "fame on kills": the kills were counted on the fighter in the fight and never paid out */
      if (u._fameEarned && f && REP.addFame) { REP.addFame(f, u._fameEarned * CONST.CROWD_PLEASER_FAME); stats.audit.crowdFame = (stats.audit.crowdFame || 0) + u._fameEarned; }
      /* §XP a fight fought is a battle on the career */
      if (u.state !== 'dead' && f) { f.experience = f.experience || {}; f.experience.battles = (f.experience.battles || 0) + 1; }
      /* §MON-WA (ruled) the partner-death roll's rare outcome: a traumatized survivor, one being from now on — renamed,
         scarred, on the pair's contract (roster.bereave). He is otherwise booked as any body that walked off hurt. */
      const ownerSq = owner[u.id] || sq;
      if (u._bondShock === 'traumatized' && f) {
        const g = u.pair && u.pair.halves.find(h => h !== u), was = f.pair_name;
        ROSTER.bereave(f, g ? g.ref : { id: f.bond_partner }, 'traumatized');
        bondNote(stats, f, 'traumatized', ownerSq.corpId, was);
      }
      if (u._bondShock === 'dead' && f) bondNote(stats, f, 'dead', ownerSq.corpId, f.pair_name);
      if (u.state === 'dead') {
        f.status = 'dead'; stats.dead++; killed++;
        /* §3.1 / §4.2 — who did it, whose they were, and how well known they were. Without
           this the `their_dead` act and every fame transfer are unreachable. */
        /* §MON-WA a pair killed in both bodies is one death to the crowds and one fame to take: its Wa is not counted */
        const halfOfDead = f.mirror_of && u.pair && u.pair.halves.every(h => h.state === 'dead');
        if (victors && victors.corp && victors.corp.rep && !halfOfDead) {
          const bag = (victors.corp._killsBy = victors.corp._killsBy || {});
          const e = (bag[sq.corpId] = bag[sq.corpId] || { n: 0, famous: 0 });
          e.n++;
          if ((f.fame || 0) >= REP.CONST.FAMOUS_AT) e.famous++;
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
      else if (u._bondShock === 'braindead') {
        /* §MON-WA (ruled) the partner-death roll's uncommon outcome: the mind went with the other body */
        const g = u.pair && u.pair.halves.find(h => h !== u), was = f.pair_name;
        ROSTER.bereave(f, g ? g.ref : { id: f.bond_partner }, 'braindead'); stats.careerEnded++;
        bondNote(stats, f, 'braindead', (owner[u.id] || sq).corpId, was);
      }
      else if (u._stunnedDown || u._upAfter) {
        /* §WOUNDS (ruled) held at a breath by a stasis injector: up again at the fight's end, at the lowest band. §STUN put
           down by stun: up again with the health he had, for a stun round does no harm */
        f._hpFrac = u._upAfter ? CONST.HP_BANDS[CONST.HP_BANDS.length - 1].to : hpBand((u.hp != null ? u.hp : u.hpMax) / Math.max(1, u.hpMax)); downed++;
        stats.audit.stunnedUp = (stats.audit.stunnedUp || 0) + 1;
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
        else { f.status = 'injured'; f._recovery = u.injury.days_remaining; stats.injured++; }
      }
      else {
        f.condition.morale = Math.max(5, Math.min(95, Math.round(0.7 * f.condition.morale + 0.3 * u.comp)));
        f.condition.fatigue = Math.min(100, f.condition.fatigue + 12);
        if (u.wounds.length) stats.lightWounds++;
        /* §WOUNDS (ruled) the harm a fight did stays for the next one, in four bands */
        f._hpFrac = hpBand((u.hp != null ? u.hp : u.hpMax) / Math.max(1, u.hpMax));
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

    /* THE PLANET IS ANNOUNCED AT THE SEASON OPEN, not discovered on the way down. A caller that
       already told its corps which rock this is passes that rock in as `opts.groundTruth`, and
       the Divide fights on the same object the board wrote its card against. */
    const planet = opts.groundTruth || MAP.generatePlanet(rng, opts.planet || {});
    if (!planet.pot) planet.pot = NEG.potOf(planet.worth);
    /* §GROUND THE GROUND IS REGIONS OF ZONES (sim/ground.js), generated with the season from the world seed; a
       caller running a single Divide gets one rolled here. The planet dossier's objectives are the ground's sites. */
    const ground = opts.ground || planet.ground || GROUND.generate(rng, { archetype: planet.archetype });
    if (planet.ground !== ground) { planet.ground = ground; planet.objectives = GROUND.objectivesOf(ground); }
    const objAt = {}; for (const o of planet.objectives) if (o.zone != null) objAt[o.zone] = o;
    /* §PRIZE what a dug deposit banks, as a share of a hold: its part of SITE_SHARE of the planet's amount of that store
       (ruled: slim a fifth of a hold, rich a full one), by its depth against the other deposits of its kind (the
       settlement banks exactly this; the window shows it), and what it pays its digger: those units at their price */
    const siteTotals = {};
    for (const o of planet.objectives || []) { if (o.type !== 'resource_site' || !o.resource) continue; const c0 = MAP.resourceCategory(o.resource); if (c0) siteTotals[c0] = (siteTotals[c0] || 0) + (o.potency || 1); }
    const storeAmt = MAP.storesOf(planet.composition);
    const holdShareOf = (o) => { const cat = o.resource && MAP.resourceCategory(o.resource); return cat ? (storeAmt[cat] || 0) * CONST.SITE_SHARE * ((o.potency || 1) / (siteTotals[cat] || 1)) : 0; };
    const UNITS_PER_HOLD = REP.CONST.UNITS_PER_STORE * REP.CONST.UNIT_SCALE;
    const sitePay = (o) => Math.round(holdShareOf(o) * UNITS_PER_HOLD * MAP.unitPrice(o.resource));
    const LAST_DAY = ground.days;
    const Z = ground.zones, RG = ground.regions;
    /* §SITES whether a site is worth standing on today */
    const siteLive = (o, day) => { if (!o) return false; if (o.type === 'relay_mast') return day >= (o.dark || 0); if (o.type === 'resource_site' && day < (o.opens || 1)) return false; return !o.looted; };

    const corps = [];
    _humans = new Set((opts.humans && opts.humans.length) ? opts.humans : (opts.human ? [opts.human] : []));
    _manager = (opts.humans && opts.humans.length) ? opts.humans[0] : (opts.human || null);
    const corpCount = opts.corpCount || 8;
    for (let i = 0; i < corpCount; i++) {
      const profile = oaProfiles[i % oaProfiles.length];
      const stance = (!profile.aligned && STANCE_OVERRIDE[profile.id]) || profile.engagement_lean || 'standard';   /* (fixed) an aligned house has no stance of its own */
      const persist = (opts.corps && opts.corps[profile.id]) || null;
      /* §DRAFT an engine OA fields as many squads as it drafted landings: the draft was sized off the roster, the
         squads off the drop, and the two disagreed in half the fleet (wasted picks, squads on undrafted ground). A
         person's squads are its squad board's, as its landings are. */
      const drafted = opts.dropZones && opts.dropZones[profile.id] ? opts.dropZones[profile.id].length : 0;
      if (persist && drafted >= 2 && !(persist.groups && persist.groups.length)) persist._wantSquads = drafted;
      const corp = buildCorp(rng, profile, stance, null, null, planet, persist, opts.season || 1);
      if (persist) { persist.kitValue = corp.kitValue || 0; persist.kitSpend = corp.kitSpend || 0;
        /* §5.2 (ruled) the food each squad was landed with, bought at the drop */
        persist.rationSpend = corp.squads.reduce((t, q) => t + (q.rationDays || 0) * q.bodies.length * CONST.RATION_PRICE, 0); }
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
    for (const c of corps) { c._corps = corps; c._ground = ground; for (const b of (c.allBodies || [])) { delete b._transferredTo; delete b._capturedBy; delete b._hpFrac; delete b._hpIn; delete b._rounds; delete b._sideRounds; delete b._charge;
      /* §WOUNDS (ruled) a man sent while mending lands carrying it: his harm on the ground starts at his health's band, so
         every reader of `_hpFrac` (his worth in a fight, the medkit, the weather, the withdrawal) sees it — and what he
         brought is remembered, so only what the Divide adds comes home as a new wound */
      const h = b.condition && b.condition.health;
      if (h != null && h < 100) { b._hpFrac = hpBand(h / 100); b._hpIn = b._hpFrac; } } }   /* last year's captivity is over, and every body lands on a full load */
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
    /* §5.3b THE FLEET'S REGARD FOR EACH OA, read once and carried on the corp */
    if (REP && opts.reputations) for (const c of corps) {
      const rp = opts.reputations[c.id];
      if (rp) c._fleetStanding = REP.standing(rp, 'houses');
      if (!isHumanOA(c.id)) seatSquadStances(c);
    }
    if (opts.captureDrop) opts.captureDrop(corps.map(c => c.squads.map(q => ({ corpId: c.id, zone: q.zone, x: q.x, y: q.y }))));

    const stats = {
      dead: 0, captured: 0, injured: 0, careerEnded: 0, lightWounds: 0, monwaShock: 0,
      engagements: 0, exchanges: 0, shots: 0, hits: 0, downs: 0, killedOutright: 0, downDeaths: 0,
      zeroCasualtyEngagements: 0, routEngagements: 0, brokenEngagements: 0, squadsBroken: 0,
      sidesEngaged: 0, sidearmDraws: 0, capExits: 0, days: 0,
      wingInjuries: 0, ththynSerious: 0, hazards: 0, hazardInjuries: 0, degradations: 0,
      _corps: corps,
      claims: 0, relayFirings: 0, stanceChanges: 0, windows: 0,
      deals: [], ransoms: 0,
      engagementsByWeek: [0, 0, 0, 0, 0], rationShortDays: 0, squadDays: 0,
      corpCount, perCorp: corps.map(c => ({ id: c.id, policy: c.policy, permanent: 0, injuredHome: 0, engagements: 0 })),
      archetype: planet.archetype,
      audit: {
        forageEvents: 0, forageYield: 0, domeDeaths: 0,
        awarded: {}, hazardKind: {}, terrainUsed: {}, bandOpen: [0, 0, 0],
        landed: 0, beaconContested: 0, ammoResupply: 0,
        stressApplied: 0, successions: 0, rationDryDays: 0, degradeChecks: 0,
        nightEngagements: 0, objectiveFights: 0, capturedAlive: 0,
        steps: 0, contacts: 0, joined: 0, harassed: 0, wallFree: 0
      }
    };
    stats._sitePay = sitePay;   /* the withdrawal weighs the open ground at what it pays */
    /* (fixed) A SEAT'S CHOICES DRAW THEIR OWN DICE. An engine seat's ransom ask and its keeping of its word drew from the
       Divide's one stream, so handing a seat to a person (who draws nothing there) shifted every roll after it. One draw
       here for every Divide, whoever sits where; each choice is seeded off it by name. */
    const CHOICE_SEED = Math.floor(rng() * 1e9);
    stats._choiceRng = (key) => P.mulberry32(P.seedFrom(CHOICE_SEED + ':' + key));
    const pcOf = {};
    for (const pc of stats.perCorp) pcOf[pc.id] = pc;

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
      seed: 'contest', driven: true,
      allied: (a, b) => a === b,
      headOf: sq => squadHead(sq).length,
      resolve: (st, f, rngF) => gridResolve(st, f),
      captivePolicy: (st, captor, from, f, body) => captiveFate(captor, from, body),
      onSettle: (st, f, winnerOa) => afterFight(st, f, winnerOa),
      /* §SITES what a site is to a group now, for the planner: gone once spent, dug or dark; a strongpoint its own OA
         holds only to the squad standing on it; a beacon only while the OA has a reserve to land, more to a group that
         has lost people; a rest site more to the hurt and the hungry; the deposit the board asked for more */
      siteFor: (zid, oa, group, staying) => {
        const o = objAt[zid], site = Z[zid].site; if (!o || !site) return null;
        const corp = corpById[oa]; let need = 1;
        if (o.type === 'resource_site') { if (o.looted) return null;
          const g = corp && corp.rep && corp.rep.goal, d = g && (g.demands || []).find(x => x.kind === 'resource' && x.resource);
          if (d && o.resource === d.resource) need = CONST.PLAN_ASKED; }
        else if (o.type === 'relay_mast') { if (day < (o.dark || 0)) return null; }
        else if (o.type === 'strongpoint') { if (o.heldBy === oa && !staying) return null; }
        else if (o.type === 'sponsor_cache') { const left = corp && corp.reserve ? corp.reserve.filter(fb => !fb.mirror_of).length : 0; if (!left) return null;
          /* §RESERVE (fixed) A BEACON IS FOR A SQUAD WITH ROOM. A man lands into the squad standing on it, and only if it has a
             seat; the beacon was worth going to for any group, so the intact squads took it and were turned away — measured,
             392 of 393 beacon hours refused for a full squad and nobody landed. It is worth nothing to a full group, and more
             the more seats it has open. */
          const open = group.reduce((t, q) => t + (q.ref ? Math.max(0, CONST.SQUAD_MAX - squadHead(q.ref).filter(b => !b.mirror_of).length) : 0), 0);
          if (open <= 0) return null;
          need = 1 + CONST.BEACON_SEAT_PULL * Math.min(open, left) / CONST.SQUAD_MAX; }
        else if (o.looted) return null;
        else if (o.type === 'munitions_drop') { const bodies = group.reduce((t, q) => t.concat(q.ref ? squadHead(q.ref) : []), []);
          const dry = bodies.length ? bodies.reduce((t, b) => t + (1 - C.roundsShare(b)), 0) / bodies.length : 0;
          need = 1 + CONST.AMMO_DRY_NEED * dry; }   /* §ROUNDS a munitions drop to a squad running dry */
        else if (o.type === 'ration_site') { need = 1 + (group.some(q => q.ref && q.ref.rationShort) ? 1 : 0); }
        return need === 1 ? site : Object.assign({}, site, { need });
      },
      /* the report a squad's guns make when they fire: each gun's noise against an ordinary rifle's, a silenced one half */
      /* §FIGHTS a squad weighs itself by the health its standing people have left (ruled), and the rounds (§ROUNDS) */
      strengthOf: (sq) => squadHead(sq).reduce((t, b) => t + fightWorth(b), 0),
      reportOf: (cq) => squadHead(cq.ref).reduce((t, b) => { const k = b.loadout && b.loadout.kit; if (!k || k.unarmed) return t;
        const quiet = (k.tags || []).indexOf('silent') >= 0 || (k.weapon && k.weapon.noise === 0);
        return t + (quiet ? 0.5 : k.weapon && k.weapon.noise != null ? Math.max(0.5, k.weapon.noise / 2) : 1); }, 0),
      /* overrun: every body still standing is taken by the winner */
      onOverrun: (st, cq, winnerOa) => { const taken = cq.ref.bodies.filter(b => b.status === 'active' || b.status === 'injured');   /* the hurt with them */
        for (const b of taken) { b.status = 'captured'; b._capturedBy = winnerOa; stats.captured++; stats.audit.capturedAlive++; }
        stats.audit.overrun = (stats.audit.overrun || 0) + 1; return taken; }
    });
    for (const cq of cst.squads) { squadOf.set(cq, cq.ref); cqOf.set(cq.ref, cq); cq.ref._cq = cq; }
    stats._cst = cst;
    const corpById = {}; for (const c of corps) corpById[c.id] = c;
    const mirror = () => { for (const cq of cst.squads) { const sq = cq.ref; sq.zone = cq.zone; sq.x = Z[cq.zone].x; sq.y = Z[cq.zone].y; sq.stance = sq.stance || cq.stance; cq.stance = squadStance(sq); } };
    const regionName = zid => RG[Z[zid].region].name;
    function longShare(sq) {
      /* the share of a squad that reaches the next zone: long rifles and heavier */
      const heads = squadHead(sq); if (!heads.length) return 0;
      return heads.filter(b => b.loadout && b.loadout.kit && b.loadout.kit.weapon && b.loadout.kit.weapon.range === 'long').length / heads.length;
    }
    /* §CAPTIVES (ruled: case by case, at the capture) a person's seat is asked at its next window and holds the captive
       until it answers. A captive kept goes at once to the captor's OA's hold (ruled): he is never fed, walked or guarded
       on the ground, so what he costs is nothing but what keeping him does to the OA's name. An engine seat weighs what
       he is worth held (bought back, or a fighter on its roster at the end) against what killing, sparing or keeping
       does to its standing, read through its own crowd's taste. What it thinks of the owner leans it, and the capturing
       squad's stance how hard a grudge pulls. No fate is fixed to a stance. */
    function heldOf(oa) { return (cst.held[oa] = cst.held[oa] || []); }
    /* §MON-WA (ruled) A PAIR IS ONE CAPTIVE. Both bodies are taken together (combat.js), and what is decided about one —
       killed, kept, let go, bought back — is decided about the being: on its lead, the Mon, and done to both. */
    const leadBody = b => leadAmong(corps, b);
    function heldPartner(oa, body) {
      if (!body || !body.bond_partner) return null;
      return heldOf(oa).find(x => x.body && x.body.id === body.bond_partner && x.body.bond_partner === body.id) || null;
    }
    function captiveWorths(captorOa, stance, body, ownerId, refused) {
      const c = corpById[captorOa], owner = corpById[ownerId];
      const worthOf = b => Math.max(300, NEG.bodyWorth(b));
      /* two ways to hold him: sell him back at the price it would ask, or keep him to the end for its own roster */
      const price = owner ? NEG.ransomPrice(body) * NEG.priceModifier(c, owner) : 0;
      const dial = STANCE_DIALS[stance] || STANCE_DIALS.standard;
      /* refused, nobody is buying him back: held, he is only a fighter on its roster at the end */
      const held = refused ? worthOf(body) * CONST.CAPTIVE_ROSTER_SHARE : Math.max(price * CONST.CAPTIVE_RANSOM_P, worthOf(body) * CONST.CAPTIVE_ROSTER_SHARE);
      /* §RANSOM (ruled: killing is the negotiation's teeth) a price refused and nothing done is a threat nobody believes
         the next time it asks; ending him is what makes the next price paid */
      const teeth = refused ? price * CONST.RANSOM_TEETH_W * (0.5 + dial.seek) : 0;
      /* standing: each act read through what its own crowd and the houses would make of it */
      const rep = act => { if (!c || !c.rep || !owner) return 0; const s = REP.impactSummary(c.rep, REP.impact(c.rep, act, { targetId: owner.id })); return (s.crowd + s.houses) * CONST.CAPTIVE_REP_W * CONST.STANDING_CREDIT; };
      /* what it thinks of the owner: a grudge leans to killing (a gun off a rival for good), warmth to sparing */
      const regard = owner && c ? (NEG.livingRegard(c, owner) || 0) / 100 : 0;
      const lean = worthOf(body) * CONST.CAPTIVE_GRUDGE_W;
      return {
        keep: held + rep('kept_captive'),
        release: rep('released_captives') + Math.max(0, regard) * lean,
        kill: rep('killed_captives') + Math.max(0, -regard) * lean * (0.5 + dial.seek) + teeth
      };
    }
    function bestFate(w) { return w.keep >= w.release && w.keep >= w.kill ? 'keep' : w.release >= w.kill ? 'release' : 'kill'; }
    function captiveFate(captor, from, body) {
      if (isHumanOA(captor.oa)) return 'pending';
      if (!body) return 'keep';
      return bestFate(captiveWorths(captor.oa, captor.stance, leadBody(body), from.oa));
    }
    function applyFate(body, fate, captorId, ownerId) {
      const captor = corpById[captorId], owner = corpById[ownerId];
      stats.captiveOutcomes = stats.captiveOutcomes || { released: 0, kept: 0, killed: 0 };
      stats.captiveLog = stats.captiveLog || [];
      const out = fate === 'kill' ? 'killed' : fate === 'release' ? 'released' : 'kept';
      if (out === 'killed') { body.status = 'dead'; stats.dead++; }
      else if (out === 'released') { comeHome(body); body._released = day; }
      /* decided: no ransom can be asked for him now */
      for (const k of (stats.ransomCases || [])) if (!k.done && k.fighter === body.id) k.done = true;
      if (out !== 'kept') {
        stats.captiveOutcomes[out]++;
        /* §MON-WA a pair's fate is one row, on its Mon */
        if (!hasLead(corps, body)) stats.captiveLog.push({ fighter: body.id, name: body.pair_name || body.name, owner: ownerId, captor: captorId, out, day });
        if (captor && captor.rep) REP.act(captor.rep, out === 'killed' ? 'killed_captives' : 'released_captives', { targetId: ownerId, rivalIds: corps.map(c => c.id) });
        if (out === 'killed' && owner && owner.rep) REP.act(owner.rep, 'abandoned_ours', { targetId: captorId, rivalIds: corps.map(c => c.id) });
      }
      rec({ t: 'captive', c: captorId, from: ownerId, name: body.name, out });
    }
    /* an OA's hold, settled as its captives are decided */
    /* §RANSOM a price refused, or never answered: the man goes back before his captor, to be killed, kept or let go.
       A person decides at its window; an engine seat weighs it again, now that nobody is buying him. */
    stats._refusedRansom = function (captorId, fighterId) {
      const k = heldOf(captorId).find(x => x.body && x.body.id === fighterId); if (!k) return;
      k.refused = day; k.body._ransomRefused = true;
      stats.audit.ransomRefused = (stats.audit.ransomRefused || 0) + 1;
      if (isHumanOA(captorId)) { k.fate = 'pending'; const kp = heldPartner(captorId, k.body); if (kp) { kp.fate = 'pending'; kp.body._ransomRefused = true; } return; }
      k.fate = bestFate(captiveWorths(captorId, k.stance, leadBody(k.body), k.oa, true));
      { const kp = heldPartner(captorId, k.body); if (kp) { kp.refused = day; kp.body._ransomRefused = true; kp.fate = k.fate; } }
      (stats.refusedLog = stats.refusedLog || []).push({ fighter: k.body.id, captor: captorId, day, fate: k.fate });
      if (k.fate === 'kill') stats.audit.killedRefused = (stats.audit.killedRefused || 0) + 1;
      settleHeld(captorId);
    };
    function settleHeld(oa) {
      const H = heldOf(oa);
      for (let i = H.length - 1; i >= 0; i--) {
        const k = H[i]; if (!k.body) continue;
        if (k.fate === 'pending') continue;
        if (k.fate === 'kill' || k.fate === 'release') { applyFate(k.body, k.fate, oa, k.oa); H.splice(i, 1); }
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
      /* a side that is all late comers (a third banner walking in) needs somebody on the board at the start: its first
         comer stands in from the off, and is taken out of the late so it is not fielded twice */
      const groups = early.map((g, i) => {
        if (g.length) return g;
        const k = late.findIndex(L => L.gi === i); if (k >= 0) return [late.splice(k, 1)[0].sq];
        return [sidesSq[i][0]];
      });
      /* §DEPLOY every comer comes on at the edge facing where it came from; the holder stands with its back to the
         ground behind it, facing the way its comers came (their mean bearing turned about) */
      const comers = []; f.sides.forEach(S => { for (const x of S.squads) if (x.bearing != null) comers.push(x.bearing); });
      const holderBearing = comers.length ? Math.atan2(-comers.reduce((t, b) => t + Math.sin(b), 0), -comers.reduce((t, b) => t + Math.cos(b), 0)) : 0;
      const edgeOf = xs => xs && xs.bearing != null ? xs.bearing : holderBearing;
      /* §FLANK a side is flanked when two of its enemies' squads came at it from arcs this far apart */
      const angGap = (a, b) => { let g = Math.abs(a - b) % (Math.PI * 2); return g > Math.PI ? Math.PI * 2 - g : g; };
      const flanked = f.sides.map((S, gi) => {
        const foes = []; f.sides.forEach((O, oi) => { if (oi !== gi) for (const x of O.squads) foes.push(edgeOf(x)); });
        return foes.some((a, k) => foes.some((b, l) => l > k && angGap(a, b) >= TACTICAL.CONST.FLANK_SPLIT_ARC));
      });
      if (flanked.some(Boolean)) stats.audit.flankFights = (stats.audit.flankFights || 0) + 1;
      const built = groups.map(g => liveSquadGroup(rng, g, day, engagementsRun, traitIndex));
      if (built.some(b => !b)) return { turns: 1, winner: null, result: 'cap', squads: {} };
      const objectiveValue = !zObj || !siteLive(zObj, day) ? 0 : (zObj.heldBy ? 1.5 : 0.8);
      const ctx = {
        day, night, terrain,
        openingBand: P.weightedPick(rng, Z[zone].cover >= 1 ? [[0, 46], [1, 42], [2, 12]] : Z[zone].height >= 1 ? [[0, 16], [1, 46], [2, 38]] : [[0, 28], [1, 50], [2, 22]]),
        objectiveValue, flanked,
        firstEngagement: engagementsRun === 0,
        log: groups.some(g => g.some(sq => isHumanOA(sq.corpId))) ? undefined : false,
        prep: groups.map((g, gi) => {
          const lead = g[0];
          /* what each squad was doing when it met them, read off the contest: the holder holding its ground, a squad
             that went for them hunting (and came looking, so takes what is there), a squad still settling from its
             last fight resting; a comer has walked today, whenever in the day the walk was booked */
          for (const sq of g) { const cq = sq._cq, xs = cq && f.sides[gi].squads.find(y => y.id === cq.id); if (!cq || !xs) continue;
            const going = cq.intent && cq.intent.type === 'fight';
            sq.approach = xs.from === zone ? 'holding' : going ? 'hunting' : null;
            sq._hunted = !!(going && xs.from !== zone);
            if (sq._hunted) groups.forEach((og, oi) => { if (oi !== gi) for (const os of og) if (os.corp !== sq.corp) { noteContact(sq.corp, os.corp, day, 'hunting'); noteContact(os.corp, sq.corp, day, 'huntedBy'); } });
            sq._resting = cq.rest > 0;
            if (xs.from !== zone) sq.movedToday = true; }
          /* §SIGHT saw them first: one of this side's squads knew where an enemy squad in this fight stood before the
             tick it met them — seen, heard, briefed or relayed */
          const nowT = st.day * CONTEST.CONST.TICKS_A_DAY + st.tick;
          const foeIds = new Set(); f.sides.forEach((O, oi) => { if (oi !== gi) for (const y of O.squads) foeIds.add(y.id); });
          const theyKnewUs = g.some(sq => sq._cq && Object.values(sq._cq.know).some(k => k.squad != null && foeIds.has(k.squad) && k.at < nowT));
          let rivalEdge = 0; const ri = lead && lead._rivalIntel;
          if (ri) groups.forEach((og, oi) => { if (oi === gi) return; og.forEach(os => { if (os.corpId && ri[os.corpId] > rivalEdge) rivalEdge = ri[os.corpId]; }); });
          /* §7.5 the side that holds the zone fights from its height and its cover; the comers from theirs */
          const xs = f.sides[gi].squads[0];
          const heightEdge = CONST.HIGH_GROUND_PREP * (xs.from === zone ? Z[zone].height - (f.sides.filter((S, k) => k !== gi).reduce((t, S) => t + Z[S.squads[0].from].height, 0) / Math.max(1, f.sides.length - 1)) : Z[xs.from].height - Z[zone].height) / 2;
          const strong = zObj && zObj.type === 'strongpoint' && zObj.heldBy === lead.corpId && xs.from === zone;
          const rushed = st.squads[xs.id].harass && st.squads[xs.id].harass.rushed ? CONTEST.CONST.HARASS_RUSHED_PREP : 0;
          return Math.max(0, Math.min(1, preparedness(lead, { sawFirst: theyKnewUs, rivalEdge, strongpoint: !!strong }) + heightEdge + rushed));
        }),
        bearings: f.sides.map(S => edgeOf(S.squads[0]))
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
          ctx.reinforce.push({ side, bearing: edgeOf(L.x), prep: 0.5, atTurn: L.x.atTurn });
          L.sq._joinedToday = true;
        }
        stats.audit.joinedInProgress = (stats.audit.joinedInProgress || 0) + ctx.reinforce.length;
      }
      /* §FLANK every squad comes on where it came from */
      built.forEach((side, gi) => { const parts = side._parts || [side];
        for (const part of parts) { const q = part._sq; if (!q) continue; const xs = f.sides[gi].squads.find(y => st.squads[y.id].ref === q);
          const b = edgeOf(xs); for (const u of part.units) u._bearing = b; } });
      for (const R of (ctx.reinforce || [])) for (const u of (R.side.units || [])) u._bearing = R.bearing;
      ctx.forceBearings = true;
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
      stats.sidearmDraws += t.sidearmDraws || 0;
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
        } else if (groups.length > 1) {
          /* no side held the field (both broke, the turn cap, or this side won): its dead are still somebody's kills —
             the biggest side that faced it — though nobody holds prisoners */
          let k = -1; for (let hi = 0; hi < groups.length; hi++) if (hi !== gi && (k < 0 || built[hi].units.length > built[k].units.length)) k = hi;
          const kc = corpById[sidesSq[k][0].corpId], here = []; for (const q of sidesSq[k]) if (q.corpId === kc.id) here.push(...squadHead(q));
          victors = { corp: kc, bodies: here };
        }
        applyOutcome(sidesSq[gi][0], side, stats, captorId, victors);
        for (let k = 0; k < corpsHere.length; k++) {
          const now = tallyCorp(corpsHere[k]), p = pcOf[corpsHere[k].id];
          p.permanent += now.permanent - snap[k].permanent; p.injuredHome += now.injured - snap[k].injured; p.engagements++; corpsHere[k].engagements++;
        }
        for (const sq of sidesSq[gi]) { sq.foughtToday = true; sq.engagements++; sq._heldToday = (sq._heldToday || 0) + fightTicks; }
      }
      /* §WOUNDS (ruled: a wound is a result of the Divide, not a weight in it) THE FIGHT'S HURT LEAVE THE GROUND. A squad
         with nobody standing, on a field another side still stands on, loses its downed to that side: taken. Every
         other fighter put down in it (and anyone the fight ended) goes home hurt, out of the Divide, and walks with
         nobody: there is no carrying, no rescue and no mending on the ground. */
      for (let gi = 0; gi < groups.length; gi++) for (const sq of sidesSq[gi]) {
        if (squadHead(sq).length) continue;
        /* no single winner: whoever is still on its feet across from them holds the field, and them */
        let tg = winnerGi;
        if (tg < 0) { let most = 0; for (let hi = 0; hi < groups.length; hi++) { if (hi === gi) continue; const up = sidesSq[hi].reduce((t, s2) => t + squadHead(s2).length, 0); if (up > most) { most = up; tg = hi; } } }
        if (tg < 0 || tg === gi) continue;
        const takerId = sidesSq[tg][0].corpId;
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
      /* and the hurt go home (above) */
      for (const g of sidesSq) for (const sq of g) for (let bi = sq.bodies.length - 1; bi >= 0; bi--) {
        const b = sq.bodies[bi]; if (b.status !== 'injured' && b.status !== 'retired') continue;
        sq.bodies.splice(bi, 1); stats.audit.wentHome = (stats.audit.wentHome || 0) + 1;
      }
      rec({ t: 'fight', zone, x: Z[zone].x, y: Z[zone].y, corps: groups.map(g => g[0].corpId), squads: sidesSq.reduce((n, g) => n + g.length, 0), night, ex: t.exchanges, band: res.band, res: res.result, terrain,
            lost: (stats.dead - recBefore.d) + (stats.careerEnded - recBefore.c), obj: objectiveValue > 0, flank: !!(res.telemetry && res.telemetry.flankFight),
            /* which squads stood in it, so a squad's record names its own fights and not every fight beside it */
            who: [].concat.apply([], sidesSq).filter(Boolean).map(q => q.corpId + ':' + q.sIdx) });
      if (stats.dead === before.d && stats.injured === before.i && stats.careerEnded === before.c) stats.zeroCasualtyEngagements++;
      return { turns: res.turns || 1, winner: winnerGi >= 0 ? f.sides[winnerGi].tag : null, result: res.result, squads };
    }
    /* after the contest settles a fight: the winner takes the ground; everybody rests a block; a strongpoint
       changes hands with the zone */
    function afterFight(st, f, winnerOa) {
      for (const S of f.sides) for (const x of S.squads) { const cq = st.squads[x.id]; if (cq.alive) cq.rest = CONST.REST_TICKS_AFTER; }
      const o = objAt[f.zone];
      if (winnerOa && o && o.type === 'strongpoint') { o.heldBy = winnerOa; stats.audit.tookTheGround = (stats.audit.tookTheGround || 0) + 1; }
      /* the captives this fight took, decided, are settled in their OAs' holds */
      const oas = {}; for (const S of f.sides) oas[S.oa] = 1; for (const oa in oas) settleHeld(oa);
    }

    /* ---- the day's bookkeeping on the ground ---- */
    const standsNow = (c) => !c.withdrawn && (c.squads || []).some(q => (q.bodies || []).some(b => b.status === 'active'));
    /* §RESERVE a beacon zone draws an OA's reserve down while its squad stands on it uncontested: a rival in the
       zones next door stops the landing; while it is in use it fires — every rival hears it across the region and
       knows whose it is */
    const beaconTick = (sq, o) => {
      const corp = sq.corp, cq = sq._cq;
      if (!corp || !corp.reserve || !corp.reserve.length) { sq.claiming = null; cq.beacon = false; return; }
      sq.claiming = o.id; cq.beacon = true;
      o.litBy = corp.id; o.litDay = day; o.heldBy = corp.id;
      o.draw = o.draw || {};
      const rival = Z[o.zone].nb.some(v => { const h = CONTEST.holder(cst, v); return h && h.oa !== corp.id; });
      if (rival) { o.draw[corp.id] = 0; stats.audit.beaconContested++; return; }
      const seats = s => squadHead(s).filter(b => !b.mirror_of).length;
      stats.audit.beaconTicks = (stats.audit.beaconTicks || 0) + 1;
      /* §RESERVE (fixed) the man lands into whichever of the OA's squads on this ground has a seat: the one holding the beacon
         was often the group's intact squad, with the hurt one standing beside it */
      let into = sq;
      if (seats(sq) >= CONST.SQUAD_MAX) {
        into = (corp.squads || []).filter(q => q !== sq && q._cq && q._cq.zone === cq.zone && !q._cq.moving && seats(q) > 0 && seats(q) < CONST.SQUAD_MAX)
                 .sort((a, b) => seats(a) - seats(b))[0] || null;
        if (!into) { stats.audit.beaconFull = (stats.audit.beaconFull || 0) + 1; return; }
      }
      o.draw[corp.id] = (o.draw[corp.id] || 0) + 1;
      if (o.draw[corp.id] < CONST.BEACON_TICKS) return;
      o.draw[corp.id] = 0;
      const lead = corp.reserve.shift(), group = [lead];
      if (corp.reserve[0] && corp.reserve[0].mirror_of === lead.id) group.push(corp.reserve.shift());
      for (const fb of group) { fb.status = 'active'; fb._squadIdx = into.sIdx; into.bodies.push(fb); corp.allBodies.push(fb);
        if (corp.persist && corp.persist.drop && corp.persist.drop.indexOf(fb) < 0) corp.persist.drop.push(fb); }
      /* a man moved off the drop into orbit (§SQUADS) has his purse paid already */
      if (corp.persist && corp.persist.account) LED.payPurse(corp.persist.account, group.filter(fb => !fb._pursePaid));
      for (const fb of group) fb._pursePaid = false;
      { const days = into.rationDays || CONST.RATION_DEFAULT_DAYS;   /* §5.2 a reserve lands with its squad's load, bought as it lands */
        into.rations += days * group.length;
        if (corp.persist) corp.persist.rationSpend = (corp.persist.rationSpend || 0) + days * group.length * CONST.RATION_PRICE; }
      into.medkits = medkitCharges(into.bodies); into.hasMedkit = into.medkits > 0;
      corp.landed += group.length; stats.audit.landed += group.length;
      (stats.landings = stats.landings || []).push({ day, corp: corp.id, squad: into.sIdx, fighter: lead.id, name: lead.pair_name || lead.name, pair: group.length > 1, seats: seats(into), site: o.label, place: o.place, left: corp.reserve.filter(fb => !fb.mirror_of).length });
      rec({ t: 'landed', zone: o.zone, x: o.x, y: o.y, c: corp.id, name: lead.pair_name || lead.name, place: o.place });
      CONTEST.syncHeads(cst);
    };
    /* a squad standing on a site works it: a tick or two, interrupted by a rival next door */
    const siteTick = (sq) => {
      const cq = sq._cq, o = objAt[cq.zone];
      cq.beacon = false;
      if (!o || !siteLive(o, day) || cq.moving || cq.fight != null || sq.foughtToday) { sq.claiming = null; return; }
      if (o.type === 'sponsor_cache') { beaconTick(sq, o); return; }
      if (o.type === 'strongpoint' && o.heldBy === sq.corpId) { sq.claiming = null; return; }   /* held: nothing more to take */
      const rival = Z[cq.zone].nb.some(v => { const h = CONTEST.holder(cst, v); return h && h.oa !== cq.oa; });
      if (rival) { sq.claiming = o.id; o.work = {}; return; }
      const key = sq.corpId + ':' + sq.sIdx;
      o.work[key] = (o.work[key] || 0) + 1;
      sq.claiming = o.id;
      if (o.work[key] >= MAP.CONST.LOOT_TICKS) { awardObjective(rng, sq, o, stats); o.work = {}; sq.claiming = null; }
    };

    /* (ruled) THERE IS ALWAYS A WINNER: the fight each banner had left this morning settles a day that ends with nobody
       standing, and the fight left settles a contest overtime runs out on */
    const fightLeft = (c) => c.withdrawn ? 0 : (c.squads || []).reduce((t, q) => t + squadHead(q).reduce((u, b) => u + (b.status === 'active' ? fightWorth(b) : 0), 0), 0);
    let morning = {};
    while (true) {
      day++;
      morning = {}; for (const c of corps) if (!c.withdrawn && (c.squads || []).some(q => squadHead(q).length)) morning[c.id] = fightLeft(c);
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
      mirror();   /* the fights dawn settled moved the beaten: the wall reads where they are now */
      /* §WALL the wall takes everyone in the region (the hurt have gone home: there is nobody lying where they fell) */
      const dawnEv = cst.events.slice(evBefore);
      for (const e of dawnEv) {
        if (e.t !== 'region_gone' && e.t !== 'zone_gone') continue;
        if (e.t === 'region_gone') rec({ t: 'region_gone', region: e.region, name: RG[e.region].name });
        else rec({ t: 'zone_gone', zone: e.zone, region: e.region, name: RG[e.region].name });
        for (const c of corps) for (const sq of c.squads) {
          /* an OA that has left the ground, or fallen, has nobody on it: its hurt went with it */
          if (c.withdrawn || c._downedOn != null) continue;
          if (sq.zone == null || (e.t === 'region_gone' ? Z[sq.zone].region !== e.region : sq.zone !== e.zone)) continue;
          if (sq._cq && sq._cq.alive && CONTEST.onRoad(sq._cq) && Z[sq._cq.moving.to].region !== e.region) continue;   /* on the road out: outside already */
          let took = 0;
          for (const b of sq.bodies) if (b.status !== 'dead' && b.status !== 'retired') { b.status = 'dead'; took++; }
          if (!took) continue;
          const w = dawnEv.find(x => x.t === 'wall' && x.squad === sq._cq.id);
          (stats.wallDeaths = stats.wallDeaths || []).push({ day, corp: sq.corpId, s: sq.sIdx, took, at: 'dawn', region: RG[e.region].name, free: !!(w && w.free), stance: squadStance(sq), intent: sq._cq.intent && sq._cq.intent.type });
          stats.audit.domeDeaths = (stats.audit.domeDeaths || 0) + took;
          stats.dead += took;   /* the wall's dead are dead like any other */
          (stats.audit.wallBy = stats.audit.wallBy || {})[sq.corpId] = ((stats.audit.wallBy || {})[sq.corpId] || 0) + took;
          rec({ t: 'wall', zone: sq.zone, x: sq.x, y: sq.y, c: sq.corpId, n: took, region: RG[e.region].name });
        }
      }
      stats.audit.wallFree = cst.audit.wallFree || 0;
      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        sq._day = day;
        sq.movedToday = false; sq._marched = 0; sq.foughtToday = false; sq._lostDay = false; sq._hunted = false; sq._heldToday = 0; sq._joinedToday = false;
        sq.medkits = medkitCharges(sq.bodies); sq.hasMedkit = sq.medkits > 0;   /* the kits are what its people carry, after any reform or carry-out */
      }
      const windowDay = GROUND.isWindowDay(ground, day);
      if (windowDay) stats.windows++;
      /* §CAPTAIN every morning the captain's mind is read afresh — a new captain after a death, a tired or strained one —
         and handed to the contest, whose planner it steers: how far the squad sees, how it counts a rival, how well it
         weighs ground */
      for (const c of corps) for (const q of c.squads) if (squadHead(q).length) {
        const mind = captainMind(q);
        q._mind = { judge: Math.round(mind.judge * 100) / 100, sight: Math.round(mind.sight * 100) / 100, nerve: Math.round(mind.nerve * 100) / 100, cap: mind.cap ? mind.cap.name : null };
        if (q._cq) q._cq.mind = { judge: mind.judge, sight: mind.sight, nerve: mind.nerve };
        if (q._cq) q._cq.long = longShare(q);   /* the long guns it carries now: after deaths, loot and landings */
      }
      /* --- THE CORP CHANNEL at the window: ransoms, withdrawals, the winner's word (NEGOTIATION.md §11) --- */
      if (windowDay) {
        if (runCorpChannel(rng, corps, planet, day, stats, opts) === true) break;
      }
      /* --- reform at the window: a spent squad's survivors spread across the corp's other squads in the region --- */
      if (windowDay) {
        for (const c of corps) {
          const alive = c.squads.filter(q => squadHead(q).length > 0);
          if (alive.length < 2) continue;
          for (const q of alive) {
            const n = seatsOf(squadHead(q));   /* §UNITS (ruled) counted in beings: a pair is one */
            if (n === 0 || n >= CONST.REFORM_AT) continue;
            /* §SQUADS (ruled) survivors join a squad on their own ground or the next zone over, and not one on the march: across
               a region it was a walk of several zones in no time at all */
            const near = o => o.zone === q.zone || (Z[q.zone].nb || []).indexOf(o.zone) >= 0;
            const hosts = alive.filter(o => o !== q && seatsOf(squadHead(o)) >= CONST.REFORM_AT && near(o) && !(o._cq && o._cq.moving)).sort((a, b) => squadHead(a).length - squadHead(b).length);
            if (!hosts.length) continue;
            /* §SQUADS (fixed) A REFORM KEEPS INSIDE THE BOUNDS. The survivors were dealt round the hosts whatever their size,
               so squads of nine, ten and eleven walked the Divide — past the ruled eight — and a host that had lost a man was
               refilled to the brim, leaving no seat for a reserve to land into. They go only where there is a seat (a pair's
               two bodies together), and if the hosts cannot take them all, the squad stands as it is. */
            const seatsIn = h => seatsOf(squadHead(h)), room = {};
            for (const h of hosts) room[h.id != null ? h.id : hosts.indexOf(h)] = CONST.SQUAD_MAX - seatsIn(h);
            const keyOf = h => h.id != null ? h.id : hosts.indexOf(h);
            const need = seatsOf(squadHead(q));
            if (hosts.reduce((t, h) => t + Math.max(0, room[keyOf(h)]), 0) < need) continue;
            const movers = q.bodies.slice(), share = q.rations / Math.max(1, hosts.length);
            const placed = new Map();
            for (const b of movers) {
              const lead = b.mirror_of ? movers.find(x => x.id === b.mirror_of) : null;
              let h = lead && placed.get(lead);
              if (!h) {
                const counts = b.status === 'active' && !b.mirror_of;
                h = hosts.filter(x => !counts || room[keyOf(x)] > 0).sort((x, y) => room[keyOf(y)] - room[keyOf(x)])[0] || hosts[0];
                if (counts) room[keyOf(h)]--;
              }
              placed.set(b, h); h.bodies.push(b);
            }
            for (const h of hosts) h.rations += share;
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
        for (const c of corps) {
          if (isHumanOA(c.id)) continue;
          const mine = board[principalOf(c).id] || 0;
          reconsiderStance(rng, c, stats, { penned, ahead: mine > 0.28 });
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
            const DROP = { _corps: 1, persist: 1, _cq: 1 };
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
          /* §SECRECY a seat's record of the contest: its own squads in full; a rival squad only on a day one of its
             squads knew where it stood (its zone and head count, nothing more), and at each window as the broadcast
             showed it; the events its own people were in, and the wall's and the weather's, which everyone sees; a
             rival banner's count as the last broadcast gave it */
          const recordFor = (seatId) => {
            if (!REC) return null;
            const ci = corps.findIndex(c => c.id === seatId), PUBLIC = { weather: 1, wall: 1, region_gone: 1, zone_gone: 1 };
            const lastA = {};
            return REC.days.map(D => {
              const known = (D.kn && D.kn[seatId]) || [];
              if (D.bc) { for (const k in lastA) lastA[k] = 0; for (const b of D.bc) if (b.c !== ci) lastA[b.c] = (lastA[b.c] || 0) + b.n; }
              return {
                d: D.d, standing: D.standing, next: D.next, window: D.window, gz: D.gz, nz: D.nz, obj: D.obj, bc: D.bc,
                sq: D.sq.filter(q => q.c === ci || known.indexOf(q.i) >= 0).map(q => q.c === ci ? q : { i: q.i, c: q.c, s: q.s, z: q.z, n: q.n, seen: 1 }),
                corp: D.corp.map((cr, k) => k === ci ? cr : { a: lastA[k] != null ? lastA[k] : null, sd: cr.sd }),
                ev: (D.ev || []).filter(e => PUBLIC[e.t] || [e.c, e.on, e.by, e.from].indexOf(seatId) >= 0 || (e.corps || []).indexOf(seatId) >= 0)
              };
            });
          };
          const worldFor = (seatId) => {
            if (opts.debugViews) return { corps, stats, planet, ground, record: REC ? REC.days : null };
            return { corps: corps.map(c => c.id === seatId ? snapshotOwn(c) : shellOf(c)),
                     record: recordFor(seatId) };
          };
          stats._broadcast = { day, field: cst.squads.filter(cq => cq.alive).map(cq => ({ c: corps.findIndex(c => c.id === cq.oa), s: cq.s, z: cq.zone, n: cq.n })) };
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
            /* §CAPTIVES the captives in this seat's hold it has not yet decided on */
            const toDecide = [];
            /* §MON-WA a pair is decided as one, on its Mon: the Wa's card did nothing (the Mon's answer is applied to both) */
            for (const k of heldOf(seatId)) if (k.fate === 'pending' && k.body && !(k.body.mirror_of && heldPartner(seatId, k.body))) toDecide.push({ fighter: k.body.id, name: k.body.pair_name || k.body.name, race: k.body.race, from: k.oa, fame: Math.round(k.body.fame || 0), squad: cst.squads[k.captor] ? cst.squads[k.captor].s : 0, day: k.day, refused: k.refused != null ? 1 : 0 });
            return {
              kind: 'window', day, lastDay: LAST_DAY, fights: since,
              cadence: GROUND.isWindowDay(ground, day + 1) ? 1 : 2,
              odds: board, penned, table,
              captives: (function () { const taken = [], held = [];
                for (const o of corps) for (const fb of (o.allBodies || [])) { if (fb.status !== 'captured' || !fb._capturedBy) continue;
                  if (fb.mirror_of && leadBody(fb) !== fb && leadBody(fb).status === 'captured') continue;   /* §MON-WA one captive, on its Mon */
                  if (o.id === seatId) taken.push({ fighter: fb.id, name: fb.pair_name || fb.name, by: fb._capturedBy }); else if (fb._capturedBy === seatId) held.push({ fighter: fb.id, name: fb.pair_name || fb.name, from: o.id }); }
                return { taken, held, toDecide }; })(),
              weather: stats.weatherToday ? { day: stats.weatherToday.day, kind: stats.weatherToday.kind, fx: stats.weatherToday.fx } : null,
              landings: (stats.landings || []).filter(l => l.corp === seatId),
              stayCost: Math.round((corps.find(c => c.id === seatId) || {})._stayCost || 0),
              reserveLeft: ((corps.find(c => c.id === seatId) || {}).reserve || []).filter(fb => !fb.mirror_of).length,
              reserveNames: ((corps.find(c => c.id === seatId) || {}).reserve || []).filter(fb => !fb.mirror_of).map(fb => fb.pair_name || fb.name),
              withdrawOffer: (stats.withdrawOffers || {})[you.id] ? { terms: stats.withdrawOffers[you.id].terms, sentDay: stats.withdrawOffers[you.id].sentDay } : null,
              withdrawReplies: (stats.withdrawOffers || {})[you.id] ? Object.assign({}, stats.withdrawOffers[you.id].replies) : null,
              withdrawAsks: Object.keys(stats.withdrawOffers || {}).filter(k => k !== you.id).map(k => { const o = stats.withdrawOffers[k]; return { from: k, terms: o.terms, sentDay: o.sentDay, yours: o.replies[you.id] == null ? null : o.replies[you.id] }; }),
              /* §SEATS its own squads: where each stands, what it is doing, whom it holds */
              squads: cst.squads.filter(cq => cq.oa === seatId).map(cq => ({ s: cq.s, zone: cq.zone, alive: cq.alive, n: cq.n, intent: cq.intent, moving: cq.moving ? { to: cq.moving.to, paid: cq.moving.paid, cost: cq.moving.cost } : null, fight: cq.fight, stance: cq.stance,
                /* the days its packs last at what it eats now (its people, the world, the weather), and whether it is working the site it stands on */
                food: cq.ref ? Math.floor((cq.ref.rations || 0) / Math.max(0.001, rationDemand(cq.ref, raceById) * planet.supplyStrain * ((stats.weatherToday && stats.weatherToday.fx.rations) || 1))) : 0,
                working: !!(cq.ref && cq.ref.claiming) })),
              /* §VISION the broadcast: a manager sees every squad on the ground, whose and where (ruled) */
              field: cst.squads.map(cq => ({ oa: cq.oa, s: cq.s, zone: cq.zone, alive: cq.alive, n: cq.n, fight: cq.fight })),
              fightsOn: cst.fights.filter(fx => !fx.done).map(fx => ({ zone: fx.zone, sides: fx.sides.map(S => S.oa), until: fx.until })),
              contact: (function () { const o = {}; for (const c of corps) if (c.id !== you.id) { const r = contactWith(you, c, corps); if (r.fights || r.huntedBy || r.hunting) o[c.id] = r; } return o; })(),
              /* the wall: what stands, what goes next and when */
              wall: { standing: CONTEST.standing(cst), next: GROUND.nextToGo(ground, day), nextZones: GROUND.nextZonesToGo(ground, day), zoneAt: (ground.wall.zoneAt || []).filter(x => x.day > day), takeAt: ground.wall.takeAt.filter(x => x.day > day), last: ground.wall.last },
              banked: Object.assign({}, you._banked || {}),
              /* in the settlement's measure, a share of a hold: what this seat has dug, and what stands open, by kind */
              bankedBy: (function () { const by = {}; for (const o of planet.objectives || []) { if (o.type !== 'resource_site' || !o.looted || o.lootedBy !== seatId) continue; const cat = MAP.resourceCategory(o.resource); if (cat) by[cat] = (by[cat] || 0) + holdShareOf(o); } return by; })(),
              siteShare: Object.fromEntries((planet.objectives || []).filter(o => o.type === 'resource_site').map(o => [o.zone, holdShareOf(o)])),
              openBy: (function () { const by = {}; for (const o of planet.objectives || []) { if (o.type !== 'resource_site' || o.looted) continue; const cat = o.category || (MAP.resourceCategory ? MAP.resourceCategory(o.resource) : null); if (cat) by[cat] = (by[cat] || 0) + holdShareOf(o); } return by; })(),
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
          }
          const applyAnswer = (seatId, answer) => {
            const you = corps.filter(c => c.id === seatId)[0];
            /* a window passed with no answer is a house nobody is running: the books decide whether it leaves */
            if (you) you._autoLeave = answer == null ? true : answer.autoLeave === true;
            if (answer && answer.stance && you) {
              const idx = NOTCHES.indexOf(answer.stance);
              if (idx >= 0) { changeStance(you, answer.stance, stats); for (const q of you.squads) { q.stance = answer.stance; if (q._cq) q._cq.stance = answer.stance; } }   /* the whole banner's notch: every squad takes it */
            }
            if (answer && answer.squadStance && you) for (const k in answer.squadStance) { const q = you.squads[+k], n = answer.squadStance[k]; if (q && STANCE_DIALS[n]) q.stance = n; }
            /* §ORDERS a seat may send a squad somewhere: an order stands until it is carried out */
            if (answer && answer.orders && you) for (const k in answer.orders) {
              const q = you.squads[+k], o = answer.orders[k]; if (!q || !q._cq || !q._cq.alive) continue;
              if (o && o.zone != null && Z[o.zone] && o.zone !== q._cq.zone) { q._cq.intent = { type: 'take', zone: o.zone, why: 'order' }; q._cq.path = null; q._cq.wait = 0; }
              else if (o && o.hold) q._cq.intent = { type: 'hold', zone: q._cq.zone, why: 'order' };
              else if (o === null) { q._cq.intent = null; q._cq.order = null; }
              /* the order itself is kept apart from what the squad is doing this tick: a fight or a rush does not undo it */
              if (o && (o.hold || (o.zone != null && Z[o.zone]))) q._cq.order = Object.assign({}, q._cq.intent);
            }
            /* §CAPTIVES the seat decides each captive it holds: kill, keep or release; the undecided stay pending */
            if (answer && answer.captiveFate && you) { for (const k of heldOf(seatId)) { const f = k.body && (answer.captiveFate[leadBody(k.body).id] || answer.captiveFate[k.body.id]); if (f === 'kill' || f === 'release' || f === 'keep') k.fate = f; }
              settleHeld(seatId); }
            if (answer && answer.withdrawOffer && you && !you.withdrawn) postWithdrawOffer(you, answer.withdrawOffer, day, stats);
            if (answer && answer.withdrawReplies && you && !you.withdrawn) for (const fromId in answer.withdrawReplies) { const o = (stats.withdrawOffers || {})[fromId]; if (o && o.from !== you.id) o.replies[you.id] = !!answer.withdrawReplies[fromId] && (o.replies[you.id] === true || promiseRoom(you.id, o.terms, stats)); }
            if (answer && answer.withdrawNow && you && !you.withdrawn && corps.filter(c2 => !c2.withdrawn && (c2.squads || []).some(q => squadHead(q).length)).length > 1) standDown(you, day, stats, corps);
            /* §RANSOM every case a seat holds is answered at its window, one answer a case */
            const dealsIn = answer && you ? (answer.deals ? Object.keys(answer.deals).map(k => answer.deals[k]) : answer.deal ? [answer.deal] : []) : [];
            for (const d of dealsIn) if (d && /^ransom_/.test(d.kind || '')) {
              const yes = d.kind === 'ransom_pay' || d.kind === 'ransom_sell';
              const k = (stats.ransomCases || []).find(x => !x.done && x.fighter === d.fighter);
              /* (fixed) a person pays only from money it has, as an engine owner does: the treasury less the drop's kit and the
                 ransoms already agreed (NEG.ransomWorthPaying's cash test) */
              const cashOk = (o, price) => { const acct = (o.persist && o.persist.account) || o.account || null;
                return !(acct && acct.treasury - ((o.kitSpend || 0) + (o.ransomPaid || 0) + ((o.persist && o.persist.rationSpend) || 0)) < price); };
              if (k && k.owner === you.id && d.kind === 'ransom_pay' && !cashOk(you, k.price)) { stats._echo[seatId] = { kind: 'ransom_short', corp: d.corp, name: k.name, price: k.price }; continue; }
              if (k && k.owner === you.id && (d.kind === 'ransom_pay' || d.kind === 'ransom_decline')) k.ownerYes = yes;
              if (k && k.captor === you.id && (d.kind === 'ransom_sell' || d.kind === 'ransom_keep')) k.captorYes = yes;
              if (k && k.ownerYes && k.captorYes) {
                const owner = corps.find(c => c.id === k.owner), captor = corps.find(c => c.id === k.captor);
                const fb = owner && owner.allBodies.find(b => b.id === k.fighter);
                if (fb && fb.status === 'captured' && captor && stats._settleRansom) { stats._settleRansom({ kind: 'ransom', captor: captor.id, owner: owner.id, fighter: fb.id, price: k.price, day, worth: k.worth }, fb, owner, captor);
                  cst.held[captor.id] = heldOf(captor.id).filter(x => x.body !== fb); }
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

      /* --- DAY: supply --- */
      for (const sq of liveSquads()) {
        const hooks = squadHooks(sq);
        consumeRations(sq, planet, raceById, hooks, stats);
        stats.squadDays++;
        if (sq.rationShort) stats.rationShortDays++;
        if (sq.rationDry) { addStress(sq, CONST.STRESS.rationDry, stats); stats.audit.rationDryDays++; }
      }
      /* --- DAY: hazards --- */
      for (const sq of liveSquads()) weatherCheck(rng, sq, planet, squadHooks(sq), stats);
      /* §WEATHER and the day's weather on the ground: sight and pace for everyone, the lost for those who lost their way */
      cst.weather = stats.weatherToday ? stats.weatherToday.fx : null;
      for (const cq of cst.squads) cq.lostDay = !!(cq.ref && cq.ref._lostDay);

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
          if (e.t === 'move') { const cq0 = cst.squads[e.squad]; cq0.track.push(e.to); cq0.ref.movedToday = true; cq0.ref._marched = (cq0.ref._marched || 0) + (e.cost != null ? e.cost : ground.regions[Z[e.to].region].ticks)   /* §UNITS the ticks the step actually took (a route's own length, not a flat four) */; stats.audit.steps++; }
          if (e.t === 'contact') stats.audit.contacts++;
          if (e.t === 'harass') { const h = cst.squads[e.on].ref; for (let i = 0; i < e.hits; i++) {
              /* §HARASS a long round across a zone: a wound short of going down, on whoever it finds; it keeps walking and
                 comes home as one (ruled: a wound is a result of the Divide) */
              const heads = squadHead(h); if (!heads.length) break; const b = heads[Math.floor(rng() * heads.length)];
              bandDown(b);
              addStress(h, CONST.STRESS.downed, stats); }
            CONTEST.syncHeads(cst); rec({ t: 'harass', zone: e.zone, c: e.oa, on: h.corpId, hits: e.hits }); }
          if (e.t === 'wiped' && e.how === 'overrun') rec({ t: 'overrun', zone: e.zone, c: cst.squads[e.squad].oa, by: e.by });
        }
        /* the sites: whoever stands on one and is not fighting works it */
        for (const sq of liveSquads()) siteTick(sq);
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
        forage(rng, sq, planet, squadHooks(sq), stats);
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
          sqRec.push({ i: cq.id, c: ci, s: si, z: alive ? cq.zone : q._downAt.zone, x: alive ? q.x : Z[q._downAt.zone].x, y: alive ? q.y : Z[q._downAt.zone].y,
                       az: alive && it.type === 'take' ? it.zone : null,
                       w: alive ? (it.type === 'fight' ? 'fighting' : it.type === 'harass' ? 'picking' : it.type === 'take' ? (it.why === 'the wall' ? 'wall' : it.why === 'order' ? 'ordered' : it.why === 'rushing' ? 'rushing' : it.why === 'evade' ? 'evading' : 'walking') : it.why === 'beaten' ? 'beaten' : it.why === 'won' ? 'won' : 'holding') : (q._reformed ? 'folded' : 'down'),
                       n: alive, st: Math.round(squadStress(q)), rat: Math.round(Math.min(30, q.rations / demand)), g: q.crates, cl: q.claiming ? 1 : 0,
                       hb: q._heldToday || 0, jn: q._joinedToday ? 1 : 0, cp: q.sIdx === 0 ? heldOf(c.id).length : 0, tr: alive ? cq.track.slice() : [] });
        }));
        /* §SECRECY what each seat's squads knew of the rivals today (seen, heard, briefed, relayed): a seat's record
           carries those rival squads and no others */
        const dayStart = day * CONTEST.CONST.TICKS_A_DAY, kn = {};
        for (const cq of cst.squads) { if (!cq.alive) continue; const set = kn[cq.oa] = kn[cq.oa] || [];
          for (const zid in cq.know) { const k = cq.know[zid]; if (k.at >= dayStart && k.squad != null && k.oa && k.oa !== cq.oa && set.indexOf(k.squad) < 0) set.push(k.squad); } }
        REC.days.push({
          d: day, standing: CONTEST.standing(cst), next: GROUND.nextToGo(ground, day), window: windowDay, kn,
          bc: windowDay && stats._broadcast && stats._broadcast.day === day ? stats._broadcast.field : null,
          gz: (ground.wall.zoneAt || []).filter(t => t.day <= day).map(t => t.zone), nz: GROUND.nextZonesToGo(ground, day),
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
      /* §MON-WA (ruled) a half that died off the field today — a captive killed, a body at the wall — and left the other
         alive: the other rolls now, as it would have where it fell */
      for (const c of corps) {
        const was = {}; for (const b of (c.allBodies || [])) if (b.pair_name) was[b.id] = b.pair_name;
        for (const x of ROSTER.settleBonds(c.allBodies || [], () => rng())) {
          if (x.fate === 'dead') stats.dead++;
          bondNote(stats, x.survivor, x.fate, c.id, was[x.survivor.id]);
        }
      }
      const bannersLeft = bannersStanding(corps);
      stats.bannersStanding = bannersLeft.size;
      const best = (ids) => ids.slice().sort((a, b) => (b[1] - a[1]) || (corps.findIndex(c => c.id === a[0]) - corps.findIndex(c => c.id === b[0])))[0];
      if (bannersLeft.size <= 1) {
        if (bannersLeft.size) stats.winner = Array.from(bannersLeft)[0];
        else { const m = best(Object.keys(morning).map(id => [id, morning[id]])); stats.winner = m ? m[0] : null; stats.wonOnTheMorning = true; }
        break;
      }
      if (day >= LAST_DAY + OVERTIME_MAX) {
        stats.overtimeExhausted = true;
        const m = best(Array.from(bannersLeft).map(id => [id, fightLeft(corps.find(c => c.id === id))]));
        stats.winner = m ? m[0] : null;
        break;
      }
    }
    stats._cst = cst;   /* the contest's own state, for the harnesses that read its events */
    stats.contest = { steps: cst.audit.steps, contacts: cst.audit.contacts, fights: cst.audit.fights, joined: cst.audit.joined, harassed: cst.audit.harassed, heard: cst.audit.heard, wall: cst.audit.wall, wallFree: cst.audit.wallFree, captured: cst.audit.captured, wiped: cst.audit.wiped };
    /* §CAPTIVES still held when the shooting stops are kept: they go to the captor on their contracts, and the
       captor's standing answers for it (killed and released were answered at the capture) */
    stats.captiveOutcomes = stats.captiveOutcomes || { released: 0, kept: 0, killed: 0 };
    stats.captiveLog = stats.captiveLog || [];

    const corpIds = corps.map(c => c.id);

    for (const owner of corps) {
      for (const f of owner.allBodies) {
        if (f.status !== 'captured') continue;
        const captor = corps.find(c => c.id === f._capturedBy) || null;
        const out = captor ? 'kept' : 'released';
        const once = !hasLead(corps, f);   /* §MON-WA a pair is one captive: counted and answered for once, on its Mon */
        if (once) stats.captiveOutcomes[out]++;
        if (!hasLead(corps, f)) stats.captiveLog.push({ fighter: f.id, name: f.pair_name || f.name, owner: owner.id, captor: captor ? captor.id : null, out: out });
        if (out === 'released') comeHome(f);
        else { f.status = 'active'; f._transferredTo = captor.id; }
        if (captor && captor.rep && once) REP.act(captor.rep, 'kept_captive', { targetId: owner.id, rivalIds: corpIds });
      }
    }

    /* --- §3.1 the ledger of the dead ---------------------------------------------------
       Counted once, at the end, with the famous counted separately: a favourite's death
       swings an audience at triple weight, and until now fame had no reader but ransom. */
    for (const c of corps) {
      if (!c.rep) continue;
      let ourDead = 0, ourFamous = 0;
      for (const b of c.allBodies) {
        if (b.status !== 'dead' || b._carriedOn) continue;
        if (b.mirror_of && c.allBodies.some(x => x.id === b.mirror_of && x.status === 'dead')) continue;   /* §MON-WA one person */
        ourDead++;
        if ((b.fame || 0) >= REP.CONST.FAMOUS_AT) ourFamous++;
      }
      if (ourDead) REP.act(c.rep, 'our_dead', { count: ourDead, famous: ourFamous });
      /* their dead, by your hand — attributed per victim's corp so the right fanbase reacts */
      const bag = c._killsBy || {};
      for (const victimCorp in bag) {
        REP.act(c.rep, 'their_dead', { targetId: victimCorp, count: bag[victimCorp].n,
                                       famous: bag[victimCorp].famous });
      }
      /* §3.1 — "reached the last ground" means the contest came down to you: your banner was
         still up when it ended. */
      if (!c.withdrawn
          && c.allBodies.some(b => b.status === 'active')) {
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
      /* Hiding: fighting far less than everyone else, measured against the field rather than
         against the calendar. */
      const rate = c.engagements || 0;
      if (rate < fieldMedianEngagements * 0.5) {
        REP.act(c.rep, 'hid', { count: Math.max(1, Math.round((fieldMedianEngagements * 0.5 - rate) / 3)) });
      }
      /* refusing the table all the way through: an OA that answered two or more public withdrawal
         offers with a no and stayed on the ground to the end (`_refusedOffers`, counted at the replies) */
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
       a hold from empty, a slim one about a fifth — the planet's amount of that store (map.js storesOf),
       spread across the sites that carry it and weighted by how deep each one is. */

    /* §PRIZE THE SITES ARE THE QUICK GRAB, THE PLANET IS THE PRIZE (ruled). The fight is for a
       planet's mineral rights, and the circle the squads fight on is a sliver of it: the dug
       sites are something a squad can run for and keep, guaranteed, win or lose — but they are
       not the planet. They carry `SITE_SHARE` of the endowment between them; the planet's full
       endowment is the winner's, as the pot's resources (below). This spread the WHOLE
       endowment across the sites, which made "a rich planet fills a hold" a statement about
       digging when it was meant to be a statement about winning. */
    const yieldOf = (o) => holdShareOf(o);
    for (const c of corps) stats.banked[c.id] = {};
    for (const o of planet.objectives) {
      if (o.type !== 'resource_site' || !o.looted || !o.lootedBy || !o.resource) continue;
      const cat = MAP.resourceCategory(o.resource);
      if (!cat || !stats.banked[o.lootedBy]) continue;
      const b = stats.banked[o.lootedBy], got = yieldOf(o, cat);
      b[cat] = (b[cat] || 0) + got;
      b[o.resource] = (b[o.resource] || 0) + got;
    }

    /* earliest off the ground places lowest; on the same day, the one with fewer people still standing */
    const upOf = (id) => { const c = corps.find(x => x.id === id); return c ? c.allBodies.filter(b => b.status === 'active').length : 0; };
    const fellIds = (stats.fallen || []).slice().sort((a, b) => (a.day - b.day) || (upOf(a.id) - upOf(b.id))).map(f => f.id);
    /* (fixed) a contest overtime ran out on places the banners still standing above the fallen, by the fight they had left */
    if (stats.overtimeExhausted) {
      const still = corps.filter(c => c.id !== stats.winner && fellIds.indexOf(c.id) < 0).sort((a, b) => fightLeft(a) - fightLeft(b));
      for (const c of still) fellIds.push(c.id);
    }
    stats.placement = REP.placements(fellIds, stats.winner, [], corps.length);
    /* (after the standing and the placings are read: a walking wound stood to the end) */
    /* §WOUNDS (ruled) what the Divide left on a body comes home as a wound, by its band, and mends there */
    for (const c of corps) for (const b of (c.allBodies || [])) {
      const frac = b._hpFrac, came = b._hpIn != null ? b._hpIn : 1; delete b._hpFrac; delete b._hpIn;
      if (frac == null || frac >= came || b.status !== 'active') continue;   /* only harm the Divide did */
      const sev = frac >= 0.8 ? 'minor' : frac >= 0.5 ? 'serious' : 'critical';
      const inj = sev === 'minor' ? { type: 'inj_torso', severity: 'minor', days_remaining: P.int(rng, 5, 15), untreated: false }
                : C.rollInjury(rng, { race: b.race && b.race.id ? b.race.id : b.race, hooks: C.hooksOf(b, ROSTER.traitById) }, sev);
      b.condition.injuries.push(inj); stats.injured++;
      if (inj.permanent) { b.status = 'retired'; stats.careerEnded++; }
      else { b.status = 'injured'; b._recovery = inj.days_remaining; }
    }

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
       The pot lands on the last banner standing and the winner pays its own people. Nothing
       here decides anything: the winner was decided by the last fighter left standing. */
    /* §PRIZE THE POT IS CREDITS AND RESOURCES. The winner takes the desk's share of the planet's worth in credits,
       and the planet's amount of every store into its holds: a full hold of one it is rich in, a fifth of one it is
       slim in (ruled). This is the thing a withdrawal bargains for a share of. */
    stats.potResources = {};
    for (const cat of REP.CATEGORIES) if (storeAmt[cat]) stats.potResources[cat] = storeAmt[cat];
    if (stats.winner && stats.banked[stats.winner]) {
      const wb = stats.banked[stats.winner];
      for (const cat in stats.potResources) wb[cat] = (wb[cat] || 0) + stats.potResources[cat];
    }
    stats.settlement = NEG.settle(corps, { pot: planet.pot.value, winnerId: stats.winner });
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
      /* §WITHDRAWAL a promise is a share OF THE POT, as it was offered, priced and shown — not of whatever the winner
         has left once earlier promises are paid, which shrank every later one */
      const POT_V = (planet.pot && planet.pot.value) || 0;
      const owed = (stats.promises || []).filter(pr => w && pr.from === w.id);
      if (w && isHumanOA(w.id) && owed.length) {
        const ask = owed.map(pr => {
          const share = Math.max(0, Math.min(1, (pr.terms && pr.terms.credits) || 0));
          const stores = {}; for (const cat in (stats.potResources || {})) { const f = Math.max(0, Math.min(1, (pr.terms && pr.terms[cat]) || 0)); if (f > 0) stores[cat] = f; }
          return { to: pr.to, day: pr.day, share: share, owed: Math.round(POT_V * share), stores: stores };
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
        const owed = Math.round(POT_V * share);
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
          : stats._choiceRng('word:' + w.id + ':' + pr.to)() < wordOf(w, share + storesAsked / 4);                /* its character keeps it; its record is what others read */
        pr.kept = keep; pr.owed = owed; pr.stores = stores;
        if (keep) {
          const wb = stats.banked[w.id] || {}, lb = stats.banked[pr.to] || (stats.banked[pr.to] = {});
          for (const cat in stores) {
            const moved = Math.min(stores[cat], wb[cat] || 0);
            wb[cat] = (wb[cat] || 0) - moved; lb[cat] = (lb[cat] || 0) + moved;
          }
        }
        if (keep && owed > 0) {
          /* a winner cannot pay out more than it took: past that, what is left is all there is */
          const pay = Math.min(owed, Math.max(0, take[w.id] || 0)); pr.paid = pay;
          take[w.id] = (take[w.id] || 0) - pay;
          take[pr.to] = (take[pr.to] || 0) + pay;
          (stats.settlement.lines = stats.settlement.lines || []).push(
            { corp: pr.to, kind: 'promise_kept', amount: pay, from: w.id });
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

    for (const pc of stats.perCorp) {
      const c = corps.find(x => x.id === pc.id);
      pc.dropped = c.allBodies.length;
      pc.policy = c.policy;
      pc.hauled = c.hauled;
      pc.sitesClaimed = c.sitesClaimed;
      pc.captured = c.allBodies.filter(b => b.status === 'captured').length;
      /* Step 6 — what the Divide was worth to them. */
      pc.payout = stats.settlement.take[c.id] || 0;
      /* §PRIZE (ruled) the sites this OA dug, and what they pay: what each brought home, at its price */
      const dug = (planet.objectives || []).filter(o => o.type === 'resource_site' && o.looted && o.lootedBy === c.id);
      pc.sitesDug = dug.length;
      pc.sitePay = dug.reduce((t, o) => t + sitePay(o), 0);
      pc.won = stats.winner === c.id;
      pc.withdrawn = c.withdrawn ? { day: c.withdrawn.day } : null;
      /* §BOARD what the board asks about: where it placed, whether and when it walked, whom it lost (the wall's dead
         with the rest), and how many of them the fleet knew by name */
      pc.placement = stats.placement ? stats.placement[c.id] : null;
      pc.ceded = !!c.withdrawn; pc.cededDay = c.withdrawn ? c.withdrawn.day : null;
      /* a body whose being lives on in a severed survivor (`_carriedOn`) is not a person lost */
      const lostBodies = (c.allBodies || []).filter(b => (b.status === 'dead' || b.status === 'retired') && !b._carriedOn);
      /* §MON-WA a board counts the people it lost: a pair that died is one */
      const lostHere = lostBodies.filter(b => !(b.mirror_of && lostBodies.some(x => x.id === b.mirror_of)));
      pc.permanent = lostHere.length; pc.dead = lostHere.length;
      pc.famousLosses = lostHere.filter(b => (b.fame || 0) >= REP.CONST.FAMOUS_AT).length;
      pc.ransomPaid = c.ransomPaid || 0;
      pc.ransomTaken = c.ransomTaken || 0;
    }
    if (REC) stats.replay = REC;
    stats.planet = planet;
    stats.corps = corps;
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
  const api = { CONST, keepChance, engineRationDays, squadCountFor, STANCE_DIALS, preparedness, STANCE_STANDING, NOTCHES,
                NOTCH_WORDS, squadStance, standing, DEFAULT_RIGIDITY, STANCE_OVERRIDE, runDivide, divideCore, buildCorp, liveSquad, applyOutcome, principalOf, bannersStanding, umbrellasOf, sealedCorp: sealed,
    squadStress, WEATHER };
  if (isNode) module.exports = api;
  global.CDDIVIDE = api;
})(typeof window !== "undefined" ? window : globalThis);
