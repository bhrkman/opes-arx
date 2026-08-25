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
     honest — it is an extreme a manager may declare, not a house style anyone runs. */
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

  /* One number each, because two things need them and a second copy is how they come apart. */
  const ENGAGE_RANGE = 0.068;
  const DAY_MARCH = 0.052;

  const CONST = {
    /* §6.2 how much closer a site the board asked for looks than one it did not. A corp will
       cross the map for the thing it was sent to fetch, and further still if it is the
       priority. Not a certainty: somebody else may be standing on it. */
    BOARD_ASK_PULL: 0.55,                // [H] §6.2 a site the board asked for looks closer
    BOARD_ASK_PULL_P: 0.35,              // [H] and closer still when it is the priority
    PROSPECT_BASE: 0.85,                 // [H] how much a corp wants what it was sent for
    PROSPECT_PRIORITY: 1.35,             // [H] and when it is the priority demand
    /* §6.1 detection */
    DETECT_BASE: 0.175,                 // [C] tuned to §6.2's engagement curve
    DETECT_NIGHT: 0.55,                 // [C]
    DETECT_COMPRESSION_MAX: 2.60,       // [C] §10.1 — the ramp lives here, not in region count
    DETECT_OBJECTIVE_PULL: 1.45,        // [C] contested ground finds you
    DETECT_HUNTING: 1.55,
    DETECT_FLOOR: 0.42,                 // [C] what the closing line guarantees, whatever your stance               // [C] a squad that spent today hunting finds people
    RELAY_DETECT_BONUS: 0.35,           // [C] §9 intelligence
    RELAY_ESCAPE_BONUS: 0.18,           // [C] §9 the mast is the careful corp's weapon

    /* §6.1 acceptance / evasion */
    ESCAPE_BASE: 0.85,                  // [C] "preservationist squads mostly slip away" (§6.1)
    ESCAPE_FIELDCRAFT: 0.020,           // [C] per point over 10
    ESCAPE_ROOM_MIN: 0.15,              // [C] floor once there is nowhere to go
    CORNERED_ZONE_FRAC: 0.45,           // [C] zone/planet ratio below which escape collapses
    CORNERED_EDGE: 0.030,               // [C] backed against the closing edge

    /* §5.1 movement — open ground, so distance not adjacency */
    DAY_MARCH: DAY_MARCH,               // [C] map units per day at full effort
    NIGHT_MARCH_P: 0.18,                // [C]
    NIGHT_MARCH_FATIGUE: 6,             // [C]
    ARRIVE_SLACK: 0.012,                // [C] close enough to have arrived

    /* §6.1 contact geometry */
    SIGHT_RANGE: 0.105,                 // [C] how far a squad can be noticed at all
    ENGAGE_RANGE: ENGAGE_RANGE,         // [C] inside this, contact is possible
    JOIN_RANGE: 0.072,                  // [C] a third corp close enough to pile in
    /* --- SHOOTING IS HEARD ---
       Until now the only way a squad learned where anybody was, was `flares`: every live
       squad's exact position handed to every corp's planner. Perfect knowledge, gated by
       nothing but distance. Noise is the opposite kind of signal — you know something happened
       over there because you could hear it, and how far that carries depends on what was being
       fired. Measured against contact range because that is what it is competing with: a fight
       is audible from further away than the people in it can shoot.
       This is also the first reader `silent` has ever had. Four things carry the quirk — the
       Whisper, the photon marksman rifle, the needle derringer and the suppressor — it is
       priced at 1.2 points in the catalogue, and every corp that has ever bought one has been
       paying for nothing. Its written purpose waits on a spotting model that is not being
       built; being hard to hear does not. */
    /* [H] Anchored to a DAY'S MARCH rather than to contact range, because the question noise
       answers is "can I get there while it still means something". At 3.2 x contact range the
       first version was audible from three and a half days away — a squad would set off toward
       shooting that had finished long before it arrived, which is not a signal, it is a rumour.
       Two and a half days' march is a sound you can do something about. DAY_MARCH is declared
       below and hoisted for the same reason ENGAGE_RANGE is: one number, two readers. */
    NOISE_RANGE: DAY_MARCH * 2.5,       // [H] how far an ordinary firefight carries
    NOISE_QUIET_FLOOR: 0.45,            // [H] what a force shooting entirely silenced weapons
                                        //     still gives away — muzzle flash, shouting, bodies
    NOISE_EXCHANGE_SPAN: 8,             // [C] exchanges by which a fight is at full volume
    NOISE_DAYS: 1,                      // [S] how long ago a sound is still worth walking to
    /* [H] YOU RUN TOWARD GUNFIRE, OR YOU DO NOT GET THERE. Squads close on a fight in progress
       at their marching pace plus this much again, scaled by their taste for finding a fight —
       a preservationist barely quickens and a death-or-glory house sprints.
       Without it, arriving partway through is arithmetically impossible and the first build of
       it fired four times in 279 fights: a squad covers 0.026 in the longest engagement the
       game can produce, while squads within 0.072 are already bundled into the fight at the
       start. The whole arrival window sat inside the window that already existed. What this
       reaches is the band just outside it, and — more to the point — the squads who were close
       enough to pile in at the outset, chose not to, and then heard it go on. */
    RUSH_SEEK_GAIN: 2.6,                // [H] extra pace toward a fight, times the seek dial
    JOIN_P: 0.55,                       // [C] and willing to
    JOIN_OWN_P: 0.90,                   // [C] your own squad, converging on a planned strike
    JOIN_ALLY_P: 0.55,                  // [C] N5 — an ally has no shared plan bringing it in
    FLANK_ARC: 1.75,                    // [C] radians between approaches that counts as flanked

    /* §8.3 coordination — how well a corp runs a planned attack */
    COORD_LEADER: 0.030,                // [C] the drop leader's tactics
    COORD_CAPTAINS: 0.015,              // [C] mean captain tactics
    COORD_LOYALTY: 0.0016,              // [C] they have to actually do as asked
    COORD_STRESS: 0.004,                // [C] a rattled command post plans badly
    PLAN_RANGE: 0.30,                   // [C] how far away a target is worth planning against
    PLAN_LIFE: 6,                       // [C] days before a plan is reconsidered
    /* [C] The target moved and the plan is dead — but "moved how far" has to be measured
       against the approach, not against a bare number. This was 0.085 while flankers staged at
       0.048, and staging now happens at 1.55 x contact range because the old ring sat inside
       the enemy's own reach. That takes about two days, in which a target can cover 0.105 — so
       the tolerance was tighter than the drift the approach itself guarantees, and pincers
       started dying on the way in: flank moves fell from 17.3 a contest to 11.5.
       Tied to the staging ring, which is the thing it is really about: if they have moved
       further than the circle you were going to spring from, you are flanking empty ground. */
    PLAN_DRIFT_TOLERANCE: ENGAGE_RANGE * 1.55,   // [C] = the staging radius
    /* WHERE FLANKERS WAIT, AND IT HAS TO BE OUTSIDE THE ENEMY'S REACH. This was 0.048 against
       a contact range of 0.068 — so the staging ring sat at 0.71 of the distance at which
       squads find each other, and the whole pincer set itself up INSIDE the bubble it was
       supposed to spring from. A flanker waiting for the strike was already close enough to be
       detected and pulled into a fight on its own.
       Worse, it made the prongs one blob: with the ring that tight, the fixer and a flanker
       stood 0.71 to 1.12 of contact range apart at every level of coordination, so three
       squads "coming round the sides" were all within one engagement of each other. That is
       what a manager sees on the map as three arrows converging on one dot.
       The reference point already existed in the world and measures the same thing: contact
       range. You stage outside it or you are not staging. Expressed as a multiple so the two
       can never drift apart again — moving one moves the other. */
    STAGE_RADIUS: ENGAGE_RANGE * 1.55,  // [C] where flankers wait — outside contact range
    STAGE_SLACK: 0.014,                 // [C] close enough to be in position
    DROP_RING: 0.82,                    // [C] share of the planet radius the drop lands on
    DROP_RING_JITTER: 0.10,             // [C]
    DROP_FAN: 0.22,                     // [C] radians a corp's squads spread across
    DROP_MIN_GAP: 0.17,                 // [C] no corp opens a Divide already surrounded
    SQUAD_MAX: 8, SQUAD_MIN: 5,         // [S] a drop deals into squads inside these bounds
    SPENT_SQUAD_CAUTION: 0.80,          // [C] barely flinches; they play on
    REFORM_AT: 3,                       // [C] below this the survivors are redistributed
    CONSOLIDATE_RANGE: 0.16,            // [C] if one is close enough to reach
    BREAK_DISTANCE: 0.075,              // [C] how far a beaten squad actually runs
    REST_DAYS_LOSER: 1,                 // [C] you do not march the morning after
    REST_DAYS_WINNER: 1,                // [C]
    REST_MARCH_MULT: 0.25,              // [C] a resting squad barely moves
    REST_RECOVERY_MULT: 1.6,            // [C] but recovers faster for it
    PURSUE_DAYS: 2,                     // [C] a chase is short
    /* REMOVED in the Step 6 audit: WITHDRAW_TRIGGER_FRAC. DIVIDE.md quoted it as governing
       when a squad reads a threat as close, and no code had read it since the approach model
       was rebuilt. The doc entry goes with it. */
    WITHDRAW_RUN_FRAC: 0.60,            // [C] and you can only fall back into room you have
    KNOWN_STALE: 3,                     // [S] a sighting older than this is not information
    WITHDRAW_DAYS: 3,                   // [C] a pull-back is worked for days, not re-rolled
    PATROL_DAYS: 5,                     // [C]

    /* §5.2 rations */
    RATION_DROP_DAYS: 14,               // [C] §5.2 — cannot cover 30 days; you forage or claim
    RATION_SHORT_AT: 3,                 // [S]
    FORAGE_YIELD: [0.08, 0.5, 1.05, 1.7],  // [C] rations/fighter/day by region forage class
    FORAGE_FIELDCRAFT: 0.03,            // [C] per point over 10
    FORAGE_POSTURE_MULT: 1.6,           // [C]

    /* §5.3 hazards */
    HAZARD_P: 0.16,                     // [C] per squad-day

    /* §5.4 camp */
    /* A day is twelve ticks, six of light and six of dark, not two phases. Movement is
       subdivided (a squad covers a sixth of its march in each day tick) so the total ground
       covered is unchanged, but positions are sampled twelve times instead of twice — which
       is what turns near-misses into contact and lets a squad be drawn into two firefights
       between dawn and dusk. */
    TICKS_PER_DAY: 12,                  // [S]
    DAY_TICKS: 6,                       // [S] the rest are night
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
    FATIGUE_MARCH: 5,                   // [C] per day moved
    UNTREATED_DEGRADE_DAYS: 3,          // [S] COMBAT.md §7.1
    DEGRADE_P: 0.55,                    // [C] a wound left in the field usually worsens

    /* §8.2 captain stress */
    STRESS: {
      killed: 4, downed: 1.5, overrun: 10, outnumbered: 3, stanceChange: 12,
      rationDry: 2, succession: 15, quietDay: -3, cleanWin: -5
    },
    STRESS_MAX: 100,

    /* §9 objectives */
    CLAIM_CACHE_TIER: 4,                // [S] a crate's tier when the wave did not set one
    INTEL_CAP: 0.18,                    // [S] most readiness a season of scouting can buy
    CACHE_EXOTIC_P: 0.12,               // [S] chance a tier-5 crate holds an exotic
    CACHE_CONSUMABLES: 2,               // [S] supplies in every crate, +1 with a quartermaster
    RELAY_INTEL_DAYS: 5,                // [C]
    RESUPPLY_MULT: 1.75,                // [C] §9 what a claimed munitions site is worth

    /* §6.3 standing / target selection */
    STANDING_PER_ENGAGEMENT: 0.015,     // [C] fighting in public builds your reputation
    STANDING_PER_SITE: 0.050,           // [C] holding ground the crowd can see
    STANDING_MIN: 0.12, STANDING_MAX: 1.0,
    PRESTIGE_FLOOR: 0.16,               // [C] a hunter's willingness against a nobody
    WEAK_TARGET_DISCOUNT: 0.55,         // [C] beating a shattered squad proves nothing

    /* §7.3 mid-Divide stance change */
    /* §7 how near the closing edge each pole is willing to work (zoneRisk) */
    FORAGE_POOR: 0.18,                  // [C] ground the trait counts as poor
    FORAGE_IMMUNE_FLOOR: 0.25,          // [C] and what its carrier gets anyway
    MEDKIT_USES: 6,                     // [H] wounds one kit can tend before it is empty
    ZONE_MARGIN_SAFE: 0.90,             // [C] a preservationist keeps this much of the ring
    ZONE_MARGIN_BOLD: 1.00,             // [C] death_or_glory works right up against the wall
    STANCE_PULL_HURT: 2.6,              // [C] notches toward care, at total loss
    STANCE_PULL_PENNED: 1.1,            // [C] and toward aggression once the ring closes
    STANCE_PULL_AHEAD: 0.7,             // [C] an opening is worth taking
    STANCE_SPREAD: 0.95,                // [C] how widely a corp explores around its target
    PACT_BREAK_P: 0.30,                 // [C] at SIGNING, per point of treachery (N8) —
                                        //     an intent decided once, not a per-scan roll
    PACT_BREAK_CROWD: 0.35              // [C] cheaper than betraying a banner, not free
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
  function kitIntent(profile, planet, bodyCount, kitBudget, season) {
    /* THE ESCALATOR, AT LAST. This read `KIT_ALLOWANCE_PER_BODY` flat, so the 6%-a-season
       rise `allowanceFor` has implemented since Step 5 could not reach the ground: measured
       over a twelve-season career, kit fielded per body topped out at exactly 2,500 in season
       one and in season twelve alike. It was named as an inherited dead wire at Step 8 and
       reported closed, and it was not — the guard called `allowanceFor` directly and proved
       the function escalates, which is a different claim from the game ever calling it with a
       season. The cap is one number for everyone (P1); what rises is the number itself. */
    /* Step 8.5b: the ceiling stopped scaling with headcount, so this asks for the per-body
       share of a corp ceiling divided by who is actually going — which is the number a planner
       spends against, and which RISES when a corp fields fewer. */
    const cap = ITEMS.allowancePerBody(bodyCount, season);
    /* CROSS-STEP FIX. This used to re-derive a corp's wealth from its treasury band with its
       own hand-rolled 0-1 scale, while `ledger.js` computed `procurementBudget` — real credits,
       after wages, the Aleas entry and the reserve floor — and the day loop ignored it. Two
       steps answering "what can this corp spend on kit" by different methods, and disagreeing.
       Step 5's economy is the source of truth now; this reads it. */
    const budget = kitBudget != null ? kitBudget : 0;
    const perBodyAfford = budget / Math.max(1, bodyCount);
    const w = Math.max(0, Math.min(1, perBodyAfford / (cap * ITEMS.CONST.KIT_BUDGET_REFERENCE)));
    const depth = ITEMS.CONST.LOCKER_DEPTH_POOR
                + (ITEMS.CONST.LOCKER_DEPTH_RICH - ITEMS.CONST.LOCKER_DEPTH_POOR) * w;

    /* WILL — a fat planet opens the purse; a thrifty board closes it. A corp that reckons a
       poor rock is not worth the outlay drops under its means deliberately. */
    const rich = planet.pot ? (planet.pot.richness - 0.70) / 0.70 : 0.5;
    const thrift = ((profile.dials && profile.dials.thrift) || 50) / 100;
    let will = 0.90
             + ITEMS.CONST.WILL_RICHNESS_PULL * (Math.max(0, Math.min(1, rich)) - 0.5) * 2
             - ITEMS.CONST.WILL_THRIFT_PULL * (thrift - 0.5) * 2;
    will = Math.max(ITEMS.CONST.WILL_FLOOR, Math.min(1, will));

    /* CAN — money is the other half. The poorest corps cannot reach the cap however keen. */
    const perBody = (0.35 + 0.85 * w) * cap;
    const target = Math.round(Math.min(cap, perBody * will));
    return {
      allowance: Math.max(ITEMS.CONST.KIT_FLOOR_PER_BODY, target) * bodyCount,
      depth: depth, will: will, wealth: w
    };
  }

  function equipCorp(corp, profile, loadoutOverride, planet, season) {
    if (loadoutOverride) { ITEMS.equipForce(corp.allBodies, loadoutOverride); return corp; }
    const doc = ITEMS.doctrineForCorp(profile.id);
    const total = corp.allBodies.length;
    /* What the ledger says this corp can actually put into kit this season. */
    /* SEASONS.md — ONE treasury. This used to call LED.open(profile) every Divide, so the
       money that decided kit was the band midpoint no matter what last season did. A
       persistent Corp hands its actual account in; a one-off Divide still opens one. */
    const acct = (corp.persist && corp.persist.account) || LED.open(profile);
    corp.kitBudget = LED.procurementBudget(acct, corp.allBodies);
    const intent = kitIntent(profile, planet || { pot: { richness: 1.0 } }, total, corp.kitBudget, season);
    corp.kitIntent = intent;
    let plan = ITEMS.planForce(doc.id, total, {
      /* SEASONS.md — the locker is OWNED. foundingArmoury is called once at fleet creation
         and never again; only a corp without one falls back to a fresh founding stock. */
      armoury: (corp.persist && corp.persist.armoury)
            || ITEMS.foundingArmoury(doc.id, total, { depth: intent.depth }).stock,
      /* SEASONS.md S8 — REAL MONEY. This was `budget: 0`, which was right while the locker
         was rebuilt free every Divide: a corp's wealth reached the ground through the DEPTH
         of that founding stock, not through cash. Now the locker persists and
         `foundingArmoury` runs once, so that channel is gone and a rich corp had no way to
         restock at all — every locker could only ever thin. Cash buys kit again, and what it
         buys stays in the rack. */
      allowance: intent.allowance, budget: corp.kitBudget || 0
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
        plan = ITEMS.planForce(doc.id, total, {
          armoury: (corp.persist && corp.persist.armoury)
                || ITEMS.foundingArmoury(doc.id, total, { depth: intent.depth }).stock,
          allowance: intent.allowance, budget: corp.kitBudget
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
    corp.kitValue = plan.total;          /* catalog value FIELDED — what they carry */
    corp.kitSpend = plan.spentCash || 0; /* CASH SPENT — what the ledger should be charged */

    /* Deal the force plan across the squads role by role, so each squad gets an even share
       of every role and the counts match the plan exactly. Recomputing composition per
       squad does not sum back to the force, which drains the pools and leaves the last
       squad holding whatever is left — which is how the third squad ended up with no
       medic's kit. */
    const byRole = {};
    for (const b of plan.bodies) (byRole[b.role] = byRole[b.role] || []).push(b.loadout);
    const nSq = corp.squads.length;
    const deal = corp.squads.map(() => []);
    for (const role of ITEMS.roles) {
      const pool = byRole[role.id] || [];
      for (let i = 0; i < pool.length; i++) deal[i % nSq].push({ role: role.id, loadout: pool[i] });
    }
    /* Any remainder (Mon-Wa second halves inflate the body count) rides as line. */
    let spare = [];
    for (const k in byRole) if (!ITEMS.roles.find(r => r.id === k)) spare = spare.concat(byRole[k]);

    for (let si = 0; si < nSq; si++) {
      const sq = corp.squads[si];
      const left = sq.bodies.slice();
      const want = deal[si].slice();
      /* Fill the picky roles first: whoever is left over becomes line, which is what line is. */
      want.sort((x, y) => {
        const rx = ITEMS.roles.find(r => r.id === x.role), ry = ITEMS.roles.find(r => r.id === y.role);
        return (ry.picks_for ? 1 : 0) - (rx.picks_for ? 1 : 0);
      });
      for (const entry of want) {
        if (!left.length) break;
        const stat = (ITEMS.roles.find(r => r.id === entry.role) || {}).picks_for;
        let pick = 0;
        if (stat) for (let j = 1; j < left.length; j++) if (left[j].stats[stat] > left[pick].stats[stat]) pick = j;
        const f = left.splice(pick, 1)[0];
        f._role = entry.role;
        ITEMS.equip(f, entry.loadout);
      }
      for (const f of left) {                /* more bodies than planned kits: should not happen */
        f._role = "line";
        ITEMS.equip(f, spare.pop() || ITEMS.DEFAULT_LOADOUT);
      }
      /* §10 — a squad has medical kit because somebody bought it and is carrying it.
         MEDKIT_RATE's coin flip is gone. CONSUMPTION IS LIVE (Step 6 audit): the note here
         used to say it landed at 5b-3, and it never did. Kits were counted once and never
         spent, so `hasMedkit` was true for all 144 squads of every Divide forever, no field
         wound was ever untended, and COMBAT.md §7.1's degradation could not fire once. */
      /* A medkit is a KIT, not a single dressing: it treats several wounds before it is
         empty. A squad carries 1.42 of them on average, and takes far more casualties than
         that in a month, so counting one kit as one wound made two thirds of all wounds
         untended and drove permanent losses to 40% of the field. Charges, not units. */
      sq.medkits = sq.bodies.reduce((s, f) => s + (f.loadout.consumables || []).filter(c => c === "itm_medkit").length, 0)
                 * CONST.MEDKIT_USES;
      sq.hasMedkit = sq.medkits > 0;
    }
    return corp;
  }

  /* SEASONS.md S2/S3 — a drop force of 16 to 24 deals into squads of at most eight and at
     least five. The named splits still win when the force is a full 24. */
  function dealSizes(n, split) {
    if (n === 24 && split === '2x12') return [12, 12];
    if (n === 24 && split === '4x6') return [6, 6, 6, 6];
    /* SQUAD_MAX and SQUAD_MIN live HERE, where the dealing happens, and season.js reads them
       off this module. They were declared in both files — `SQUAD_MAX` as a local with a
       comment saying it mirrored the other copy, which is a duplication announcing itself —
       and `SQUAD_MIN` was declared in season.js and read by nothing at all, so the "at least
       five" in the comment below was true only by arithmetic accident. */
    const SQUAD_MAX = CONST.SQUAD_MAX, SQUAD_MIN = CONST.SQUAD_MIN;
    let squads = Math.max(2, Math.ceil(n / SQUAD_MAX));
    while (squads > 2 && Math.floor(n / squads) < SQUAD_MIN) squads--;
    const base = Math.floor(n / squads), extra = n % squads;
    const out = [];
    for (let i = 0; i < squads; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  function buildCorp(rng, profile, stance, split, rigidity, loadout, planet, persist, season) {
    /* SEASONS.md — the drop force is BORROWED when a persistent Corp supplies one. The
       people outlive the Divide; the squads, positions and banner do not. Without a Corp
       the roster is generated as it always was, so a one-off Divide is unchanged. */
    const drop = persist && persist.drop && persist.drop.length ? persist.drop.slice() : null;
    const sizes = drop ? dealSizes(drop.length, split)
                : split === '2x12' ? [12, 12] : split === '4x6' ? [6, 6, 6, 6] : [8, 8, 8];
    const corp = {
      id: profile.id, profile, policy: stance, declaredAt: stance,
      rigidity: rigidity != null ? rigidity : (DEFAULT_RIGIDITY[profile.id] != null ? DEFAULT_RIGIDITY[profile.id] : 50),
      squads: [], allBodies: [], stanceChanges: 0, oreCredit: 0, sitesClaimed: 0, engagements: 0,
      /* Step 6 — the banner. Every corp drops holding its own claim. `joinedTo` is the corp
         it ceded that claim to, if any; follow the chain to the principal. Irreversible
         (N4): once set it is never cleared and never repointed. */
      joinedTo: null, terms: null, standDown: false, joinedOnDay: 0, betrayed: false, disqualified: false,
      offersMade: 0,
      /* set BEFORE equipCorp runs at the foot of this function — it reads the account and
         the locker off it, and setting it at the call site was too late. */
      persist: persist || null
    };
    let taken = 0;
    for (let i = 0; i < sizes.length; i++) {
      const bodies = drop ? drop.slice(taken, taken + sizes[i])
                          : ROSTER.generateSquad(rng, sizes[i], { corpId: profile.id }).bodies;
      taken += sizes[i];
      let cap = bodies[0];
      for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
      corp.squads.push({
        corpId: profile.id, corp, policy: stance, bodies, captainId: cap.id, sIdx: i, known: {},
        hasMedkit: false,        // set by equipCorp from what the squad actually carries (§10)
        x: 0.5, y: 0.5, hx: 0.5, hy: 0.5,           // position, and where they came from
        rations: CONST.RATION_DROP_DAYS * sizes[i], rationDry: false,
        stress: 0, crates: 0, ammoResupplied: 0, intelUntil: 0,
        /* S20 — the prep year's scouting, the same for every squad this corp drops */
        _intel: (persist && persist.intel) || 0,
        claiming: null, movedToday: false, foughtToday: false, engagements: 0
      });
      /* SEASONS.md S6 — which squad somebody actually stood in. The grief rule needs this to
         know who was CLOSE to the dead, and nothing recorded it: the close-loss multiplier
         read a field that no code anywhere ever set. */
      for (const b of bodies) b._squadIdx = i;
      corp.allBodies.push(...bodies);
    }
    /* PROCUREMENT.md §15 — kit the force. Planning draws no RNG, so it cannot shift the
       stream; what it changes is what everybody is holding when the shooting starts.

       6b: what a corp brings now VARIES. It used to not: every corp fielded 2247-2250
       against a cap of 2250 because the founding locker held twice the ceiling in kit, so
       neither money nor appetite could bind and the eight corps were interchangeable on the
       ground. `kitIntent` decides how near the cap this corp gets, from its wealth and from
       whether it fancies this particular planet. The cap itself is still one number for
       everyone (P1). */
    equipCorp(corp, profile, loadout, planet, season);
    return corp;
  }

  function squadHead(sq) { return sq.bodies.filter(b => b.status === 'active'); }

  /* ------------------------------------------------------------------ */
  /* Step 6 — banners and the umbrella (NEGOTIATION.md §3)               */
  /* ------------------------------------------------------------------ */

  /** The corp at the top of this corp's chain of joins. Itself, if it never joined. */
  function principalOf(corp) {
    let c = corp, guard = 0;
    while (c.joinedTo && guard++ < 16) {
      const up = c._corps && c._corps.find(x => x.id === c.joinedTo);
      if (!up) break;
      c = up;
    }
    return c;
  }

  /** Two corps are allied when they are under the same banner. */
  function allied(a, b) {
    if (a === b || a.id === b.id) return true;
    return principalOf(a).id === principalOf(b).id;
  }

  /** A banner is standing while any one of its people is on their feet (N18). */
  function bannersStanding(corps) {
    const live = new Set();
    for (const c of corps) {
      if (c.disqualified) continue;
      if (c.allBodies.some(b => b.status === 'active')) live.add(principalOf(c).id);
    }
    return live;
  }

  /** §6.3 — how much the crowd cares about beating this corp. */
  function standing(corp) {
    const base = STANCE_STANDING[corp.policy] != null ? STANCE_STANDING[corp.policy] : 0.5;
    const v = base + CONST.STANDING_PER_ENGAGEMENT * corp.engagements
                   + CONST.STANDING_PER_SITE * corp.sitesClaimed
    /* CROSS-STEP FIX. Step 6 charges a corp for quitting, for buying a win and for breaking
       its word, and wrote the total to `crowdHit` — which nothing read. Step 4's `standing`
       was the crowd's opinion and never moved for any of it. Two numbers for one idea, one
       of them write-only. The charge now lands on the number that does the work, so a corp
       that sells its claim really does become less interesting to hunt.
       Step 7 replaces this whole scalar with the four audiences; until then it is ONE number. */
                   - (corp.crowdHit || 0);
    return Math.max(CONST.STANDING_MIN, Math.min(CONST.STANDING_MAX, v));
  }

  /** What a hunter stands to gain from this particular squad. */
  function prestigeOf(sq) {
    const strength = squadHead(sq).length / Math.max(1, sq.bodies.length);
    const weak = strength < 0.55 ? CONST.WEAK_TARGET_DISCOUNT : 1;
    return standing(sq.corp) * weak;
  }

  /**
   * HOW LOUD THAT FIGHT WAS, and therefore how far away it was heard.
   *
   * Two things set it. What was being fired: a force shooting suppressed weapons gives less
   * away, down to `NOISE_QUIET_FLOOR` — never to nothing, because muzzle flash, shouting and
   * people going down are not silenced by a can on a barrel. And how long it went on: a
   * two-exchange brush carries less than a sustained firefight.
   *
   * `silent` is read here, and this is the first time anything in the project has read it. It
   * has been priced in the catalogue since the beginning and delivered nothing.
   */
  function loudnessOf(bodies, exchanges) {
    let armed = 0, quiet = 0;
    for (const f of bodies) {
      /* THE RESOLVED KIT IS `loadout.kit`, NOT `loadout`. `loadout` holds the item ids a
         fighter was issued; `kit` is what those ids resolve to, and the tags live there. Read
         one level too high this counted zero armed fighters in every fight of every contest,
         so the silent quirk would have gone on doing nothing behind a reader written
         specifically to give it something to do. Caught by counting carriers and getting
         nought out of two thousand. */
      const kit = f.loadout && f.loadout.kit;
      if (!kit || kit.unarmed) continue;
      armed++;
      if ((kit.tags || []).indexOf('silent') >= 0) quiet++;
    }
    const quietFrac = armed ? quiet / armed : 0;
    const volume = CONST.NOISE_QUIET_FLOOR + (1 - CONST.NOISE_QUIET_FLOOR) * (1 - quietFrac);
    /* a longer fight is heard further, levelling off — you do not hear a battle twice as far
       away because it lasted twice as long */
    const length = Math.min(1, (exchanges || 1) / CONST.NOISE_EXCHANGE_SPAN);
    return CONST.NOISE_RANGE * volume * (0.6 + 0.4 * length);
  }

  /* ------------------------------------------------------------------ */
  /* Step 6 — the corp channel (NEGOTIATION.md §6, §11)                  */
  /* ------------------------------------------------------------------ */

  /** The banners currently on the field, each with everyone under it. */
  function umbrellasOf(corps) {
    const by = new Map();
    for (const c of corps) {
      if (!c.allBodies.some(b => b.status === 'active' || b.status === 'injured')) continue;
      if (c.disqualified) continue;
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
  /** N8 — is there a live truce between these two right now? */
  function pactHolds(a, b, day) {
    return !!(a._pacts && a._pacts[b.id] != null && a._pacts[b.id] >= day);
  }

  /* PACTS AGREED BEFORE ANYBODY LANDED. Written onto the same `_pacts` map the in-Divide truces
     use, so the ground has ONE notion of who is not shooting at whom — a second, parallel
     record of pre-Divide understandings would be a truce the resolver did not know about. They
     run from day one, because that is the point of agreeing early. */
  function seedPreDividePacts(corps, agreed) {
    if (!agreed) return 0;
    let n = 0;
    for (const key of Object.keys(agreed)) {
      if (!agreed[key] || !agreed[key].agreed) continue;
      const bits = key.split('>');
      const a = corps.filter(c => c.id === bits[0])[0];
      const b = corps.filter(c => c.id === bits[1])[0];
      if (!a || !b) continue;
      a._pacts = a._pacts || {}; b._pacts = b._pacts || {};
      a._pacts[b.id] = NEG.CONST.PACT_DAYS[1];
      b._pacts[a.id] = NEG.CONST.PACT_DAYS[1];
      n++;
    }
    return n;
  }

  /** Tear one up. Cheap by the standards of §8 — no payouts to void and no Aleas ruling —
      but the crowd sees it, and it is the cheap betrayal that makes the expensive one mean
      something. */
  /**
   * Whether one of these two walks into a truce meaning to break it. The INTENT is decided
   * once, when the pact is signed, and executed the first time they meet — not re-rolled on
   * every scan. Rolling per contact made a corp break the same pact several times a day and
   * turned a rare treachery into eight a Divide.
   */
  function breaksPact(rng, a, b, day, stats) {
    const breaker = (a._pactBreak && a._pactBreak[b.id]) || null;
    if (!breaker) return false;
    const x = breaker === a.id ? a : b, y = breaker === a.id ? b : a;
    if (x._pacts) delete x._pacts[y.id];
    if (y._pacts) delete y._pacts[x.id];
    if (x._pactBreak) delete x._pactBreak[y.id];
    if (y._pactBreak) delete y._pactBreak[x.id];
    x.crowdHit = (x.crowdHit || 0) + NEG.CONST.BETRAY_PENALTY * CONST.PACT_BREAK_CROWD;
    x.pactsBroken = (x.pactsBroken || 0) + 1;
    /* REPUTATION.md §3.1 — their supporters take this far harder than anyone else does, and
       most of it never washes off (§3.2, residue 0.55). */
    if (x.rep) REP.act(x.rep, 'broke_truce', { targetId: y.id });
    if (y.rep) y._truceBrokenOn = true;
    stats.pactsBroken = (stats.pactsBroken || 0) + 1;
    if (stats._rec) stats._rec({ t: 'pactbreak', c: x.id, on: y.id });
    return true;
  }

  function sealed(corp) {
    return !!(corp.profile && corp.profile.no_negotiation);
  }

  /** What fraction of its own take a corp has already promised away. */
  function owedBy(corp) {
    let owed = 0;
    for (const d of (corp._dealsAsPrincipal || [])) if (!d.void) owed += d.share;
    return Math.min(0.95, owed);
  }

  /* §5.1 — placement is recorded as banners stop standing, earliest first, so the finish
     order falls out of the Divide rather than being scored at the end. */
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
    function oddsWithJoin(joiner, principal) {
      const jP = principalOf(joiner), pP = principalOf(principal);
      const jU = umbrellas.filter(x => x.principal.id === jP.id)[0];
      if (!jU) return odds[pP.id] || 0;
      const merged = umbrellas
        .filter(u => u.principal.id !== jP.id)
        .map(u => u.principal.id === pP.id
          ? { principal: u.principal, members: u.members.concat(jU.members) }
          : u);
      const o = NEG.oddsBoard(merged, { meanEngagements: meanEng });
      return o[pP.id] || 0;
    }
    const corpHasHook = (corp, hook) =>
      (corp.allBodies || []).some(b => b.status === 'active' &&
        (b.hooks ? b.hooks.has(hook) : (b.traits || []).some(t => t === hook)));
    return {
      pot: planet.pot.value, odds: odds, day: day, lastDay: MAP.CONST.LAST_GROUND_DAY,
      principalOf: principalOf, sealed: sealed, owedBy: owedBy,
      oddsWithJoin: oddsWithJoin, rng: rng, banners: umbrellas.length,
      resource: planet.archetypeName || planet.archetype,
      hasHook: corpHasHook, refusals: stats.refusals, umbrellas: umbrellas
    };
  }

  function runCorpChannel(rng, corps, planet, day, stats, opts) {
    const corpIds = corps.map(c => c.id);
    const umbrellas = umbrellasOf(corps);
    if (umbrellas.length < 2) return;

    const meanEng = corps.reduce((a, c) => a + c.engagements, 0) / Math.max(1, corps.length);
    const odds = NEG.oddsBoard(umbrellas, { meanEngagements: meanEng });

    /* The board as it would read with one corp's force moved under another's banner. This
       is the only thing either side needs that they cannot read off the public board, and
       both sides compute it the same way. */
    function oddsWithJoin(joiner, principal) {
      const jP = principalOf(joiner), pP = principalOf(principal);
      const merged = umbrellas
        .filter(u => u.principal.id !== jP.id)
        .map(u => u.principal.id === pP.id
          ? { principal: u.principal, members: u.members.concat(umbrellas.find(x => x.principal.id === jP.id).members) }
          : u);
      const o = NEG.oddsBoard(merged, { meanEngagements: meanEng });
      return o[pP.id] || 0;
    }

    const ctx = {
      pot: planet.pot.value, odds: odds, day: day, lastDay: MAP.CONST.LAST_GROUND_DAY,
      principalOf: principalOf, sealed: sealed, owedBy: owedBy,
      oddsWithJoin: oddsWithJoin, rng: rng, banners: umbrellas.length,
      resource: planet.archetypeName || planet.archetype,
      /* Trait hooks the negotiation engine can read. All three were declared in traits.json
         and read by nothing: a psion who can tell when a rival is bluffing, and the two
         traits that make a corp's own people refuse to be party to a broken deal. */
      hasHook: corpHasHook,
      refusals: stats.refusals
    };

    /* A hook so an interface — or a test standing in for one — can see the board exactly as
       the AI sees it, and compose offers against the same context. */
    if (opts.onWindow) opts.onWindow(ctx, corps);

    /* Stop the Divide dead at a chosen window, with every corp left exactly as it stood.
       This is for tooling — an interface needs a real board it can negotiate against, and a
       board reconstructed from a summary is a board that can drift out of step with the
       engine. Nothing in a played game halts. */
    if (opts.haltAt === day) { stats.halted = { day: day, ctx: ctx, corps: corps }; return true; }

    /* Offers, in a fixed order so the stream is deterministic. */
    for (const joiner of corps) {
      if (joiner.joinedTo || joiner.disqualified || sealed(joiner)) continue;
      /* A PERSON'S CORP DOES NOT NEGOTIATE BEHIND THEM. Ceding your banner is irreversible and
         it is the largest decision in the contest; having the AI make it on your behalf while
         you watch is not a management game. Every other corp deals exactly as it always did. */
      if (joiner.id === opts.human) continue;
      if (!joiner.allBodies.some(b => b.status === 'active')) continue;
      let sent = 0;
      /* You approach the banners doing best, because that is where a share is worth having. */
      const targets = umbrellas
        .filter(u => u.principal.id !== principalOf(joiner).id)
        .sort((a, b) => (odds[b.principal.id] || 0) - (odds[a.principal.id] || 0));
      for (const t of targets) {
        if (sent >= NEG.CONST.OFFERS_PER_WINDOW) break;
        sent++;
        joiner.offersMade++;
        stats.offersSent = (stats.offersSent || 0) + 1;
        t.principal._offersReceived = (t.principal._offersReceived || 0) + 1;
        joiner._offersReceived = (joiner._offersReceived || 0) + 1;
        const deal = NEG.considerJoin(rng, joiner, t.principal, ctx);
        if (!deal) continue;

        /* Struck. It is announced on air, and it is irreversible (N4). */
        joiner.joinedTo = t.principal.id;
        joiner.terms = deal;
        joiner.standDown = deal.standDown;
        joiner.joinedOnDay = day;
        (t.principal._dealsAsPrincipal = t.principal._dealsAsPrincipal || []).push(deal);
        stats.deals.push(deal);
        stats.joins = (stats.joins || 0) + 1;
        if (deal.standDown) stats.standDowns = (stats.standDowns || 0) + 1;
        /* §7 — both sides pay the crowd, the folder more than the buyer. `crowdHit` is kept
           as the in-Divide scalar it always was; what is NEW is that the same act is now
           also remembered by four audiences who each read it differently, which is the whole
           of Step 7. REPUTATION.md §3.1. */
        joiner.crowdHit = (joiner.crowdHit || 0)
          + NEG.foldPenalty(odds[principalOf(joiner).id] || 0, day, MAP.CONST.LAST_GROUND_DAY, deal.standDown);
        t.principal.crowdHit = (t.principal.crowdHit || 0) + NEG.buyPenalty(deal.share, 0.5);
        const foldScale = deal.why && deal.why.seller
          ? Math.min(1, deal.why.seller.damage / Math.max(1e-6, deal.why.seller.tolerance) / REP.CONST.UGLY_WALL)
          : 0.5;
        REP.act(joiner.rep, deal.standDown ? 'stood_down' : 'ceded',
                { scale: foldScale, buyerId: t.principal.id, rivalIds: corpIds });
        REP.act(t.principal.rep, 'bought_win',
                { scale: Math.min(1, deal.share), rivalIds: corpIds });
        /* §5.1 — your finish is fixed the moment your banner stops standing. */
        recordFall(stats, joiner.id, day, 'ceded');
        if (stats._rec) stats._rec({ t: 'deal', c: joiner.id, to: t.principal.id,
                                     sh: Math.round(deal.share * 100), sd: deal.standDown ? 1 : 0 });
        break;                                  /* you cede once */
      }
    }

    /* Non-aggression pacts — between corps that have NOT joined each other, and the one
       kind of agreement a corp can be stabbed in the back over (N8). */
    for (let i = 0; i < corps.length; i++) {
      for (let j = i + 1; j < corps.length; j++) {
        const a = corps[i], b = corps[j];
        if (a.joinedTo || b.joinedTo) continue;
        if (!a.allBodies.some(x => x.status === 'active') || !b.allBodies.some(x => x.status === 'active')) continue;
        if (pactHolds(a, b, day)) continue;
        const pact = NEG.considerPact(rng, a, b, ctx);
        if (!pact) continue;
        /* Held per PAIR, not per corp — a corp may have a truce with one rival and be at
           war with another, which the single `_pactUntil` flag could not express. */
        (a._pacts = a._pacts || {})[b.id] = day + pact.days;
        (b._pacts = b._pacts || {})[a.id] = day + pact.days;
        (a._pactsSigned = a._pactsSigned || {})[b.id] = day;
        (b._pactsSigned = b._pactsSigned || {})[a.id] = day;
        /* Does either side sign it already meaning to break it? Decided here, once. */
        let breaker = null;
        for (const pair of [[a, b], [b, a]]) {
          const dl = (pair[0].profile && pair[0].profile.dials) || {};
          let tr = (dl.treachery != null ? dl.treachery : 50) / 100;
          /* `betrayal_resistance` — a pact keeper in the ranks makes bad faith harder to
             organise. Declared since Step 2, read by nothing until now. */
          if (corpHasHook(pair[0], 'betrayal_resistance')) { tr *= 0.35; stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1; }
          if (!breaker && rng() < CONST.PACT_BREAK_P * tr) breaker = pair[0].id;
        }
        if (breaker) {
          (a._pactBreak = a._pactBreak || {})[b.id] = breaker;
          (b._pactBreak = b._pactBreak || {})[a.id] = breaker;
        }
        pact.breaker = breaker;
        /* The recompense actually moves. `a` is the weaker party buying the truce; `b` hands
           over rations for it. Recorded and never transferred until now. */
        if (pact.supply > 0) {
          const give = Math.min(pact.supply, Math.max(0, b.squads.reduce((t, q) => t + q.rations, 0) - 4));
          if (give > 0) {
            let left = give;
            for (const q of b.squads) { const take = Math.min(q.rations, left); q.rations -= take; left -= take; if (left <= 0) break; }
            const share = give / Math.max(1, a.squads.length);
            for (const q of a.squads) q.rations += share;
            pact.supplyMoved = give;
            stats.supplyMoved = (stats.supplyMoved || 0) + give;
          }
        }
        stats.deals.push(pact);
        stats.pacts = (stats.pacts || 0) + 1;
      }
    }

    /* N10 — prisoners bought back, as their own small deal at the same window. */
    for (const owner of corps) {
      for (const f of owner.allBodies) {
        if (f.status !== 'captured' || !f._capturedBy) continue;
        const captor = corps.find(c => c.id === f._capturedBy);
        if (!captor || captor.disqualified) continue;
        const deal = NEG.considerRansom(rng, captor, owner, f, ctx);
        if (!deal) continue;
        f.status = 'injured';                     /* they come home, and they come home hurt */
        f._capturedBy = null;
        owner.ransomPaid = (owner.ransomPaid || 0) + deal.price;
        captor.ransomTaken = (captor.ransomTaken || 0) + deal.price;
        /* §3.1 — buying your people back is the thing your own ships care about most, and
           the captor's fanbase notices you dealt straight with them. */
        if (owner.rep) REP.act(owner.rep, 'ransomed_home', { targetId: captor.id });
        stats.deals.push(deal);
        stats.ransoms = (stats.ransoms || 0) + 1;
        if (stats._rec) stats._rec({ t: 'ransom', c: owner.id, from: captor.id, p: deal.price });
      }
    }

    /* §8 — betrayal. Rare, ruinous, and occasionally done against the corp's own interest. */
    for (const c of corps) {
      if (!c.joinedTo && !(c._dealsAsPrincipal || []).length) continue;
      const targets = corps.filter(o => o !== c && allied(c, o));
      /* `refuses_betrayal_orders` — a corp whose people will not do it, does not do it.
         The order can be given; the squads will not carry it out. */
      if (corpHasHook(c, 'refuses_betrayal_orders')) { stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1; continue; }
      for (const t of targets) {
        if (!NEG.considerBetrayal(rng, c, t, ctx)) continue;
        c.betrayed = true;
        for (const d of stats.deals) {
          if (d.kind === 'pact') continue;
          if (d.joiner === c.id || d.principal === c.id) d.void = true;
        }
        c.crowdHit = (c.crowdHit || 0) + NEG.CONST.BETRAY_PENALTY;
        /* REPUTATION.md §9.2 — THE SENTENCE NEVER VARIES; THE VERDICT DOES. The roll keeps
           its shape and changes its meaning: the odour it reads is no longer a placeholder
           derived from two personality dials but a standing earned across seasons. In good
           odour the drone lost the shot and it goes down as friendly fire; in bad odour the
           same footage convicts you. */
        const odour = (REP.standing(c.rep, 'aleas') - REP.CONST.STANDING_FLOOR)
                    / (REP.CONST.STANDING_CEIL - REP.CONST.STANDING_FLOOR);
        if (NEG.disqualificationRoll(rng, c, odour)) {
          c.disqualified = true;
          stats.disqualifications = (stats.disqualifications || 0) + 1;
          /* §9.1 — carried out on the ground by the drones that have been filming it. Not
             extracted: a punishment whose first effect is that your people stop dying is one
             a losing corp would choose. */
          for (const b of c.allBodies) {
            if (b.status === 'active' || b.status === 'injured') b.status = 'dead';
          }
          c.executed = true;
          REP.act(c.rep, 'betrayed', { targetId: t.id, rivalIds: corpIds });
          for (const other of corps) {
            if (other === c) continue;
            REP.act(other.rep, 'worthy_fight', { targetId: c.id, scale: 0.2 });
          }
          recordFall(stats, c.id, day, 'disqualified');
        } else {
          /* §9.2 — the camera missed it. Cheaper, and not free: the fleet has suspicions
             even when the Aleas has no case. */
          REP.act(c.rep, 'betrayed_covered', { targetId: t.id, rivalIds: corpIds });
        }
        /* The banner is broken by the betrayal: the betrayer stands alone again, and so
           does anyone whose only link ran through it. Nobody may join them afterwards. */
        c.joinedTo = null; c.standDown = false;
        stats.betrayals = (stats.betrayals || 0) + 1;
        if (stats._rec) stats._rec({ t: 'betray', c: c.id, on: t.id });
        break;
      }
    }
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
      sq.stress = Math.min(CONST.STRESS_MAX, sq.stress + CONST.STRESS.succession);
      heir._stress = sq.stress;
      sq._successions = (sq._successions || 0) + 1;
    }
    return heir;
  }

  function squadStat(sq, stat) {
    const a = squadHead(sq);
    if (!a.length) return 8;
    return a.reduce((s, b) => s + b.stats[stat], 0) / a.length;
  }

  /* Build the live combat squad from surviving bodies. */
  function liveSquad(rng, corp, sq, day, engagementNo, traitIndex, ctxExtra) {
    const avail = squadHead(sq);
    if (!avail.length) return null;
    const cap = squadCaptain(sq);
    const mentorPresent = avail.some(b => (b.traits || []).includes('mentor'));
    const units = avail.map(f => C.makeCombatant(f, {
      traitIndex, isCaptain: f.id === cap.id, day,
      firstEngagement: engagementNo === 0, rookieSupport: mentorPresent, captainBonus: 0
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
       See `openCrate`. */
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
      fidelity: C.captainFidelity(cap, traitIndex),
      rationDry: sq.rationDry, directiveNudge: 0, _sq: sq
    }, ctxExtra || {});
  }

  /** Build one SIDE of a fight from one or more squads of the same corp. Two squads that
      arrived together fight as one body — that is what the pincer was for. */
  function liveSquadGroup(rng, squads, day, engagementNo, traitIndex) {
    const parts = squads.map(sq => liveSquad(rng, sq.corp, sq, day, engagementNo, traitIndex))
                        .filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    const units = [];
    for (const p of parts) for (const u of p.units) units.push(u);
    return {
      corpId: parts[0].corpId, policy: parts[0].policy, units,
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
    let demand = rationDemand(sq, raceById) * planet.supplyStrain;
    if (hooksOfSquad.has('squad_supply_efficiency_up')) { demand *= 0.9; if (stats) stats.audit.supplyHooks++; }
    if (hooksOfSquad.has('supply_consumption_down')) { demand *= 0.92; if (stats) stats.audit.supplyHooks++; }
    sq.rations -= demand;
    if (sq.rations < 0) sq.rations = 0;
    const heldDays = demand > 0 ? sq.rations / demand : 99;
    sq.rationShort = heldDays < CONST.RATION_SHORT_AT;
    sq.rationDry = sq.rations <= 0;
    if (sq.rationDry) sq.rationDryDays = (sq.rationDryDays || 0) + 1;
    else sq.rationDryDays = 0;
    return demand;
  }

  function forage(rng, sq, planet, hooksOfSquad, posture, stats) {
    let yieldPer = CONST.FORAGE_YIELD[Math.max(0, Math.min(3, Math.round(planet.forageAt(sq.x, sq.y))))] || 0;
    /* A forager whose people can eat what the rest cannot. The guard used to require
       `yieldPer === 0` — an exactly-barren tile — which never occurred on any archetype, so
       the trait was inert. It now applies wherever the ground is poor, which is what the
       trait is for. */
    if (yieldPer <= CONST.FORAGE_POOR && hooksOfSquad.has('forage_penalty_immune')) {
      yieldPer = Math.max(yieldPer, CONST.FORAGE_IMMUNE_FLOOR);
      if (stats) stats.audit.forageImmune = (stats.audit.forageImmune || 0) + 1;
    }
    if (planet.salvage) yieldPer += 0.15;
    yieldPer *= 1 + CONST.FORAGE_FIELDCRAFT * (squadStat(sq, 'fieldcraft') - 10);
    if (hooksOfSquad.has('forage_bonus')) yieldPer *= 1.4;
    if (hooksOfSquad.has('forage_value_up')) yieldPer *= 1.25;
    if (posture === 'forage') yieldPer *= CONST.FORAGE_POSTURE_MULT;
    const got = Math.max(0, yieldPer * squadHead(sq).length * (0.6 + 0.8 * rng()));
    sq.rations += got;
    if (stats) { stats.audit.forageEvents++; stats.audit.forageYield += got; }
    return got;
  }

  /* ------------------------------------------------------------------ */
  /* §5.3 hazards, §5.4 camp                                             */
  /* ------------------------------------------------------------------ */

  function hazardCheck(rng, sq, planet, hooksOfSquad, stats) {
    if (rng() > CONST.HAZARD_P) return null;
    const kind = P.weightedPick(rng, planet.hazards);
    if (hooksOfSquad.has('hazard_forecast_bonus') && rng() < 0.60) return null;   // warned
    stats.hazards++;
    stats.audit.hazardKind[kind] = (stats.audit.hazardKind[kind] || 0) + 1;
    if (stats._rec) stats._rec({ t: 'hazard', x: sq.x, y: sq.y, kind, c: sq.corpId });
    const bodies = squadHead(sq);
    const roll = rng();
    if (roll < 0.50) {
      for (const b of bodies) b.condition.fatigue = Math.min(100, b.condition.fatigue + 8);
    } else if (roll < 0.78) {
      sq.rations = Math.max(0, sq.rations - bodies.length * 0.8);
    } else if (roll < 0.94) {
      /* §13.1 navigation_bonus: you do not get lost */
      if (!hooksOfSquad.has('navigation_bonus')) sq._lostDay = true;
    } else if (bodies.length) {
      const victim = bodies[Math.floor(rng() * bodies.length)];
      victim.condition.injuries.push({ type: 'inj_torso', severity: 'minor', days_remaining: P.int(rng, 4, 10), untreated: false });
      victim.status = 'injured'; victim._recovery = P.int(rng, 4, 10); victim._untreatedDays = 0;
      stats.hazardInjuries++;
    }
    return kind;
  }

  /** Does anyone still standing in this squad carry the hook? Module-scope, uncached. */
  function squadHasHook(sq, hook) {
    for (const b of squadHead(sq)) if (C.hooksOf(b, ROSTER.traitById).has(hook)) return true;
    return false;
  }

  /** Is anybody here carrying a primary a sponsor's crate would improve on? */
  function poorlyArmed(sq) {
    for (const b of squadHead(sq)) {
      const w = ITEMS.byId((b.loadout || {}).primary);
      if (!w || w.tier < CONST.CLAIM_CACHE_TIER) return true;
    }
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
      if (f._chargeMax > 0) f._charge = Math.min(f._chargeMax, (f._charge == null ? f._chargeMax : f._charge) + CONST.CELL_RECHARGE);
    }

    /* PROCUREMENT.md §2.3 — bulk. A squad carrying more than it can comfortably haul pays
       for it every day, and the Olmac and Svalbard `carry_bonus` is what lets a squad field
       the heavy weapons at all. Over capacity is legal; it is not free. */
    {
      const heads = squadHead(sq);
      const bonus = heads.reduce((s, b) => s + ((b.race && b.race.carry_bonus) || 0), 0)
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
    if (hooksOfSquad.has('camp_morale_aura')) { moraleDelta += 2; stats.audit.campMoraleHooks++; }
    if (hooksOfSquad.has('camp_morale_bonus_meals') && !sq.rationDry) { moraleDelta += 3; stats.audit.campMoraleHooks++; }
    if (sq.rationShort) moraleDelta -= 1;
    if (sq.rationDry) moraleDelta -= 4;
    if (sq.rationDryDays >= 4) moraleDelta -= 2;
    /* --- Step 6 audit: hooks declared in traits.json that no code had ever read ---------
       Every one of these belongs to a system that already runs, so their being inert was a
       gap rather than a deferral. Grouped here because they are all camp morale. */
    const day = sq._day || 1;
    const late = Math.min(1, day / MAP.CONST.LAST_GROUND_DAY);
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
    if (corp.joinedTo) {
      if (hooksOfSquad.has('cede_loyalty_morale_penalty_major')) { moraleDelta -= 5; stats.audit.traitHooks++; }
      else if (hooksOfSquad.has('cede_loyalty_morale_penalty')) { moraleDelta -= 3; stats.audit.traitHooks++; }
    }
    /* squad chemistry: who is standing next to whom */
    if (hooksOfSquad.has('friction_with_keshu_rival_race')
        && bodies.some(b => b.race && /keshu/i.test(b.race.id || ''))) { moraleDelta -= 2; stats.audit.traitHooks++; }
    if (hooksOfSquad.has('ankoth_sympathy_chemistry')
        && bodies.some(b => b.race && /ankoth/i.test(b.race.id || ''))) { moraleDelta += 2; stats.audit.traitHooks++; }
    /* a steady pair of hands gets the wounded back on their feet sooner */
    if (hooksOfSquad.has('evac_stabilize_bonus')) {
      for (const b of sq.bodies) if (b.status === 'injured' && b._recovery > 0) b._recovery -= 0.35;
      stats.audit.traitHooks++;
    }
    if (hooksOfSquad.has('camp_morale_contagion_both_ways')) moraleDelta *= 1.5;

    for (const b of bodies) {
      b.condition.fatigue = Math.max(0, b.condition.fatigue - recovery);
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

  function addStress(sq, amount, stats) {
    sq.stress = Math.max(0, Math.min(CONST.STRESS_MAX, sq.stress + amount));
    /* combat.js reads `fighter._stress`; this is the bridge. Without it captain fidelity
       ran at stress 0 for the whole Divide and §8.2 was decorative. */
    const cap = squadCaptain(sq);
    if (cap) cap._stress = sq.stress;
    if (stats) stats.audit.stressApplied++;
  }

  /* ------------------------------------------------------------------ */
  /* §8.3 The drop leader's plan — coordination, and where flanking comes from */
  /* ------------------------------------------------------------------ */

  /** How well this corp can run a coordinated attack. Tactics, loyalty, and steadiness. */
  function coordination(corp) {
    const caps = [];
    for (const sq of corp.squads) {
      const c = squadCaptain(sq);
      if (c) caps.push({ c, sq });
    }
    if (!caps.length) return 0.1;
    const leader = caps.reduce((a, b) => a.c.stats.tactics > b.c.stats.tactics ? a : b);
    let meanT = 0, meanL = 0, meanS = 0;
    for (const k of caps) { meanT += k.c.stats.tactics; meanL += k.c.loyalty == null ? 50 : k.c.loyalty; meanS += k.sq.stress; }
    meanT /= caps.length; meanL /= caps.length; meanS /= caps.length;
    const v = CONST.COORD_LEADER * leader.c.stats.tactics
            + CONST.COORD_CAPTAINS * meanT
            + CONST.COORD_LOYALTY * meanL
            - CONST.COORD_STRESS * meanS;
    return Math.max(0.06, Math.min(0.95, v));
  }

  /** Is this intent still worth working? */
  function intentValid(sq, planet, day) {
    const it = sq.intent;
    if (!it) return false;
    if (day > it.expires) return false;
    if (it.type === 'strike') {
      const t = it.targetSquad;
      if (!t || squadHead(t).length < 1) return false;
      /* the plan is built on where they were; if they have gone a long way it is dead */
      if (MAP.dist(t.x, t.y, it.tx, it.ty) > CONST.PLAN_DRIFT_TOLERANCE) return false;
      return true;
    }
    if (it.type === 'claim' || it.type === 'hold') {
      const o = it.obj;
      if (!o || !o.revealed) return false;
      if (it.type === 'claim' && o.heldBy === sq.corpId) return false;
      return true;
    }
    if (it.arrived) return false;
    return true;
  }

  /**
   * The corp's dawn planning. Runs once per corp per day and only re-tasks squads whose
   * intent has run out, so squads keep working a plan instead of re-deciding every morning.
   */
  function planCorp(rng, corp, planet, day, flares, stats, noises) {
    const zNow = MAP.zoneOn(planet, day);
    const mine = corp.squads.filter(sq => squadHead(sq).length >= 1);
    if (!mine.length) return;
    const dials = STANCE_DIALS[corp.policy];
    const coord = coordination(corp);
    const z = MAP.zoneOn(planet, day);
    const foreign = flares.filter(f => f.corpId !== corp.id);

    for (const sq of mine) if (!intentValid(sq, planet, day)) sq.intent = null;
    const free = mine.filter(sq => !sq.intent);
    if (!free.length) return;

    /* ---- 0. shooting, somewhere over there ----
       The only thing a squad could previously act on was `flares` — every live squad's exact
       position, handed to every corp, gated by nothing but distance. Perfect knowledge, which
       is a large part of why three squads of one corp so often set off for the same dot.
       A sound is a different kind of information and a poorer one: you know something happened
       roughly there, you do not know who, how many, or whether they are still standing. What a
       corp does about it is its temperament. A house that seeks fights goes and has a look; a
       preservationist hears the same thing and puts distance between itself and it.
       Taken per squad rather than for the corp, so one squad going to look does not commit the
       whole house — which is the other half of the convergence problem. */
    if (noises && noises.length) {
      for (const sq of free.slice()) {
        if (sq.intent) continue;
        let heard = null, hd = Infinity;
        for (const nz of noises) {
          if (nz.corps.indexOf(corp.id) >= 0) continue;      /* your own fight is not news */
          const d = MAP.dist(sq.x, sq.y, nz.x, nz.y);
          if (d > nz.r || d >= hd) continue;
          heard = nz; hd = d;
        }
        if (!heard) continue;
        /* seek is the taste for finding a fight; it runs 0.15 for a preservationist to 0.80
           for death-or-glory, so this is the dial deciding it and not a new one. */
        const go = rng() < dials.seek;
        const away = rng() < (1 - dials.seek) * 0.5;
        if (!go && !away) continue;
        const a = Math.atan2(sq.y - heard.y, sq.x - heard.x);
        const reach = go ? 0 : CONST.NOISE_RANGE;
        sq.intent = {
          type: go ? 'sound' : 'avoid',
          tx: go ? heard.x : heard.x + Math.cos(a) * reach,
          ty: go ? heard.y : heard.y + Math.sin(a) * reach,
          expires: day + CONST.PLAN_LIFE
        };
        stats.audit.soundMoves = (stats.audit.soundMoves || 0) + (go ? 1 : 0);
        stats.audit.soundAvoided = (stats.audit.soundAvoided || 0) + (go ? 0 : 1);
      }
    }

    /* ---- 1. a coordinated strike, if there is a target worth it ---- */
    if (free.length >= 2 && foreign.length && rng() < dials.seek * (0.45 + coord)) {
      let best = null, bs = 0;
      for (const f of foreign) {
        const d = Math.min.apply(null, free.map(sq => MAP.dist(sq.x, sq.y, f.x, f.y)));
        if (d > CONST.PLAN_RANGE) continue;
        const sc = f.prestige / (0.05 + d);
        if (sc > bs) { bs = sc; best = f; }
      }
      if (best) {
        /* the closest free squad fixes them; the others come round the sides */
        const sorted = free.slice().sort((a, b) =>
          MAP.dist(a.x, a.y, best.x, best.y) - MAP.dist(b.x, b.y, best.x, best.y));
        const party = sorted.slice(0, Math.min(3, sorted.length));
        const fixer = party[0];
        const baseBearing = Math.atan2(fixer.y - best.y, fixer.x - best.x);
        /* a well-led corp comes in at a wide angle; a badly led one barely spreads at all,
           and its "pincer" is three squads walking up the same road */
        const spread = CONST.FLANK_ARC * (0.45 + 0.75 * coord);
        const travel = [];
        for (let i = 0; i < party.length; i++) {
          const sq = party[i];
          const off = i === 0 ? 0 : (i === 1 ? spread : -spread);
          const jitter = (rng() - 0.5) * (1 - coord) * 1.1;
          const a = baseBearing + off + jitter;
          const stage = CONST.STAGE_RADIUS * (0.85 + rng() * 0.3);
          const sx = best.x + Math.cos(a) * stage;
          const sy = best.y + Math.sin(a) * stage;
          const budget = CONST.DAY_MARCH * dials.ground;
          travel.push(Math.ceil(MAP.dist(sq.x, sq.y, sx, sy) / Math.max(1e-6, budget)));
          sq._plan = { sx, sy, a };
        }
        /* everybody goes on the same day — if the leader can time it. A poor one gives an
           order that half the corp cannot meet, and they arrive piecemeal. */
        const slowest = Math.max.apply(null, travel);
        const sync = rng() < coord;
        for (let i = 0; i < party.length; i++) {
          const sq = party[i];
          const strike = day + (sync ? slowest : travel[i]) + (sync ? 0 : Math.round((rng() - 0.5) * 2));
          sq.intent = {
            type: 'strike', role: i === 0 ? 'fix' : 'flank',
            targetSquad: best.sq, targetCorp: best.corpId,
            tx: best.x, ty: best.y, sx: sq._plan.sx, sy: sq._plan.sy,
            strikeDay: Math.max(day, strike),
            expires: day + CONST.PLAN_LIFE
          };
          sq._plan = null;
        }
        stats.audit.strikes = (stats.audit.strikes || 0) + 1;
        if (party.length > 1) stats.audit.pincers = (stats.audit.pincers || 0) + 1;
        if (sync && party.length > 1) stats.audit.synced = (stats.audit.synced || 0) + 1;
        return;
      }
    }

    /* ---- 2. otherwise: every squad works an APPROACH (§14) ----
       Not a flinch re-rolled every morning. A squad scores what its situation calls for,
       the corp's stance multiplies that score without ever forbidding anything, and it
       commits for days. Withdrawal is no longer in this list at all — being shot at is a
       REACTION, handled in the fight resolution, and it must never overwrite the approach.
       That conflation is what pinned squads to the wall for the last week of a Divide. */
    for (const sq of free) {
      if (sq.approach && day < sq.approachUntil && approachValid(sq, planet, day)) continue;
      chooseApproach(rng, sq, corp, planet, day, foreign, stats);
    }
  }

  const APPROACH_LEAN = {
    preservationist: { hunting:0.50, resupplying:1.25, scouting:1.30, hiding:1.80, recovering:1.40, consolidating:1.20, prospecting:1.45, days:4 },
    measured:        { hunting:0.75, resupplying:1.15, scouting:1.15, hiding:1.30, recovering:1.20, consolidating:1.10, prospecting:1.20, days:4 },
    standard:        { hunting:1.00, resupplying:1.00, scouting:1.00, hiding:1.00, recovering:1.00, consolidating:1.00, prospecting:1.00, days:3 },
    unyielding:      { hunting:1.35, resupplying:0.90, scouting:0.85, hiding:0.60, recovering:0.85, consolidating:0.90, prospecting:0.75, days:3 },
    death_or_glory:  { hunting:1.75, resupplying:0.75, scouting:0.60, hiding:0.35, recovering:0.65, consolidating:0.80, prospecting:0.45, days:2 }
  };
  /* `prospecting` is new at Step 7 and it exists because the board's ask had no verb behind
     it. A corp was told at season open to bring back a named resource, and mining was a side
     effect of resupplying — so a demand was satisfied only if the right site happened to fall
     in the corp's lap, which measured at 1.6%. Weighting the site chooser did almost nothing
     (1.6% → 2.7%), because a squad only looks at sites when it is already short of supplies.
     What was missing was not a weight. It was an intention. */
  const APPROACHES = ['resupplying', 'hunting', 'scouting', 'hiding', 'recovering',
                      'consolidating', 'prospecting'];

  /** A sighting older than this is not information. */
  function knownCount(sq, day) {
    let n = 0;
    for (const k in (sq.known || {})) if (day - sq.known[k] <= CONST.KNOWN_STALE) n++;
    return n;
  }

  function approachValid(sq, planet, day) {
    if (sq.approach === 'resupplying') return planet.objectives.some(o => MAP.siteLive(o, day));
    /* nothing left to dig means nothing to prospect for */
    if (sq.approach === 'prospecting') return planet.objectives.some(o => o.type === 'ore_assay' && MAP.siteLive(o, day));
    return true;
  }

  function approachNeed(sq, ap, corp, planet, day, foreign) {
    const head = squadHead(sq).length;
    const hurt = 1 - head / Math.max(1, sq.bodies.length);
    const fatigue = head ? sq.bodies.filter(b => b.status === 'active')
      .reduce((s, b) => s + b.condition.fatigue, 0) / head : 0;
    const wounded = sq.bodies.filter(b => b.status === 'injured').length;
    const z = MAP.zoneOn(planet, day);

    let near = null, nearD = 9;
    for (const f of foreign) {
      const dd = MAP.dist(sq.x, sq.y, f.x, f.y);
      if (dd < nearD) { nearD = dd; near = f; }
    }
    let site = null, sd = 9;
    for (const o of planet.objectives) {
      if (!MAP.siteLive(o, day) || o.type === 'relay_mast') continue;
      const dd = MAP.dist(sq.x, sq.y, o.x, o.y);
      if (dd < sd) { sd = dd; site = o; }
    }
    const mastUp = planet.objectives.some(o => o.type === 'relay_mast' && MAP.siteLive(o, day));
    const kc = knownCount(sq, day);
    const blind = kc === 0 ? 1 : kc === 1 ? 0.40 : 0.12;
    const mates = corp.squads.filter(s => s !== sq && squadHead(s).length);
    const mateD = mates.length ? Math.min.apply(null, mates.map(s => MAP.dist(sq.x, sq.y, s.x, s.y))) : 9;

    switch (ap) {
      case 'resupplying':
        /* The kit term used to read `sq.gearTier < 3`, and `gearTier` started at 3 and was
           only ever raised, so it was FALSE in all 1,417 squad-fights of six Divides. The
           live question is whether this squad is carrying kit a crate would improve on, which
           the catalog can answer for real: a corp that could only afford surplus rifles has a
           reason to walk to a sponsor's crate and a well-armed one does not. */
        return (sq.rations < head * 4 ? 0.55 : 0) + (poorlyArmed(sq) ? 0.20 : 0) +
               (site && sd < z.r * 1.3 ? 0.40 : 0);
      case 'hunting':
        if (!near) return 0.10;
        return 0.25 + (near.strength && near.strength < head ? 0.45 : 0) + (1 - hurt) * 0.35 +
               (nearD < z.r ? 0.20 : 0);
      case 'scouting':
        return 0.05 + blind * 0.40 + (mastUp ? blind * 0.45 : 0);
      case 'hiding':
        return hurt * 0.70 + (near && near.strength > head + 2 ? 0.45 : 0);
      case 'recovering':
        return wounded * 0.16 + (fatigue > 55 ? 0.40 : 0) + (fatigue > 75 ? 0.35 : 0);
      case 'consolidating':
        return (head <= CONST.REFORM_AT ? 0.65 : 0) + (mateD < CONST.CONSOLIDATE_RANGE && head < 5 ? 0.25 : 0);
      case 'prospecting': {
        /* REPUTATION.md §6.2 — what the board sent you for. A corp with no resource demand
           has no reason to prospect at all, which is correct: digging is not free, it is a
           month of not fighting, and only a board's ask makes it worth doing. */
        const g = corp.rep && corp.rep.goal;
        const ask = g ? g.demands.filter(d => d.kind === 'resource')[0] : null;
        if (!ask) return 0;
        if (((corp._banked || {})[ask.resource] || 0) > 0) return 0.05;   /* already have it */
        let d2 = 9, found = false;
        for (const o of planet.objectives) {
          if (o.type !== 'ore_assay' || !MAP.siteLive(o, day) || o.resource !== ask.resource) continue;
          found = true;
          d2 = Math.min(d2, MAP.dist(sq.x, sq.y, o.x, o.y));
        }
        if (!found) return 0;
        const priority = g.demands[g.priority] === ask;
        return (priority ? CONST.PROSPECT_PRIORITY : CONST.PROSPECT_BASE)
             * (1 - hurt * 0.6)                       /* a mauled squad has other problems */
             * (d2 < z.r * 1.6 ? 1 : 0.45);
      }
    }
    return 0;
  }

  /** Score, lean, commit. Nothing re-opens the question until it expires or is invalidated. */
  function chooseApproach(rng, sq, corp, planet, day, foreign, stats) {
    const lean = APPROACH_LEAN[corp.policy] || APPROACH_LEAN.standard;
    let best = 'scouting', bestV = -1;
    for (const ap of APPROACHES) {
      const v = approachNeed(sq, ap, corp, planet, day, foreign) * (lean[ap] || 1);
      if (v > bestV) { bestV = v; best = ap; }
    }
    sq.approach = best;
    sq.approachUntil = day + lean.days;
    sq.intent = approachIntent(rng, sq, corp, planet, day, foreign);
    stats.audit.approaches = stats.audit.approaches || {};
    stats.audit.approaches[best] = (stats.audit.approaches[best] || 0) + 1;
  }

  /** The approach says what a squad wants; this says where that puts its feet. */
  function approachIntent(rng, sq, corp, planet, day, foreign) {
    const z = MAP.zoneOn(planet, day);
    const exp = day + (CONST.PATROL_DAYS || 5);
    let near = null, nearD = 9;
    for (const f of foreign) {
      const dd = MAP.dist(sq.x, sq.y, f.x, f.y);
      if (dd < nearD) { nearD = dd; near = f; }
    }
    /* REPUTATION.md §6.2 — A CORP GOES AFTER WHAT ITS BOARD ASKED FOR.
       This was missing and it was the whole point: the board named a resource at season open,
       nothing in the day loop read it, and a corp satisfied a resource demand only if the
       right site happened to fall in its lap. A demand nothing pursues is not a demand.
       Sites carrying the named resource are pulled closer — the corp will cross the map for
       one — and the priority demand pulls harder than an ordinary one. */
    const want = sq.corp && sq.corp.rep && sq.corp.rep.goal
      ? sq.corp.rep.goal.demands.filter(d => d.kind === 'resource')[0] : null;
    const wantPriority = want && sq.corp.rep.goal.demands[sq.corp.rep.goal.priority] === want;
    const site = (filter) => {
      let b = null, bd = 9;
      for (const o of planet.objectives) {
        if (!MAP.siteLive(o, day) || !filter(o)) continue;
        let dd = MAP.dist(sq.x, sq.y, o.x, o.y);
        if (want && o.resource === want.resource) dd *= wantPriority ? CONST.BOARD_ASK_PULL_P
                                                                    : CONST.BOARD_ASK_PULL;
        if (dd < bd) { bd = dd; b = o; }
      }
      return b;
    };
    switch (sq.approach) {
      case 'hunting':
        if (near) return { type: 'hunt', tx: near.x, ty: near.y, expires: day + CONST.PLAN_LIFE };
        break;
      case 'resupplying': {
        const o = site(o2 => o2.type !== 'relay_mast');
        if (o) return { type: 'claim', obj: o, tx: o.x, ty: o.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'prospecting': {
        const g = sq.corp && sq.corp.rep && sq.corp.rep.goal;
        const ask = g ? g.demands.filter(d => d.kind === 'resource')[0] : null;
        const o = site(o2 => o2.type === 'ore_assay' && (!ask || o2.resource === ask.resource))
               || site(o2 => o2.type === 'ore_assay');
        if (o) return { type: 'claim', obj: o, tx: o.x, ty: o.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'scouting': {
        const m = site(o2 => o2.type === 'relay_mast');
        if (m) return { type: 'claim', obj: m, tx: m.x, ty: m.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'hiding': {
        if (near && nearD < CONST.SIGHT_RANGE) {
          const dx = sq.x - near.x, dy = sq.y - near.y;
          const m2 = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
          const run = Math.min(CONST.DAY_MARCH * 1.4, z.r * 0.40);
          const p = MAP.clampInside(planet, day, sq.x + (dx / m2) * run, sq.y + (dy / m2) * run);
          return { type: 'withdraw', tx: p.x, ty: p.y, expires: day + CONST.WITHDRAW_DAYS };
        }
        break;
      }
      case 'recovering':
        return { type: 'hold', tx: sq.x, ty: sq.y, expires: day + 3 };
      case 'consolidating': {
        let m3 = null, md = 9;
        for (const s of corp.squads) {
          if (s === sq || !squadHead(s).length) continue;
          const dd = MAP.dist(sq.x, sq.y, s.x, s.y);
          if (dd < md) { md = dd; m3 = s; }
        }
        if (m3) return { type: 'hold', tx: m3.x, ty: m3.y, expires: day + 3 };
        break;
      }
    }
    const a = rng() * Math.PI * 2, reach = z.r * (0.25 + rng() * 0.5);
    return { type: 'patrol', tx: z.cx + Math.cos(a) * reach, ty: z.cy + Math.sin(a) * reach, expires: exp };
  }

  function compressionFactor(planet, day) {
    const z = MAP.zoneOn(planet, day);
    const frac = z.r / planet.radius;                    // 1.0 at drop -> 0.34 at the close
    const t = Math.min(1, Math.max(0, (1 - frac) / 0.66));
    return 1 + (CONST.DETECT_COMPRESSION_MAX - 1) * t;
  }

  function detectChance(rng, sqA, sqB, planet, day, night, mx, my, sep) {
    const dA = STANCE_DIALS[sqA.corp.policy], dB = STANCE_DIALS[sqB.corp.policy];
    /* The seekers ARE the term, not a bonus on top of a flat base. With `1 + seekA + seekB`
       the span between two hiding corps and two hunting ones was only 2.5x, and co-location
       swamped it — so the six dials never produced the ladder. This spans ~9x. */
    let p = CONST.DETECT_BASE * (dA.seek + dB.seek);
    p *= planet.concealAt(mx, my);
    /* closer is easier to notice: full weight at contact, tailing off to nothing at range */
    p *= 1.35 - 0.9 * Math.min(1, sep / CONST.ENGAGE_RANGE);
    if (night) p *= CONST.DETECT_NIGHT;
    /* `pre_battle_intel_bonus` — an augur reads the ground before anyone else does. */
    if (squadHasHook(sqA, 'pre_battle_intel_bonus') || squadHasHook(sqB, 'pre_battle_intel_bonus')) p *= 1.25;
    p *= compressionFactor(planet, day);
    for (const o of planet.objectives) {
      if (o.revealed && MAP.dist(mx, my, o.x, o.y) <= MAP.CONST.CLAIM_RADIUS * 2.5) {
        p *= CONST.DETECT_OBJECTIVE_PULL; break;
      }
    }
    /* hunting is an ACTION, not just a disposition — a squad that spent the day working
       toward the flares is far more likely to make contact than one that merely would. */
    /* applied PER hunting squad: two squads working toward each other find each other far
       faster than one hunting a squad that is not looking. A flat bonus gave a standard
       field the same boost as one where everybody is out looking for a fight. */
    if (sqA._hunted) p *= CONST.DETECT_HUNTING;
    if (sqB._hunted) p *= CONST.DETECT_HUNTING;
    if (sqA.intelUntil >= day || sqB.intelUntil >= day) { p += CONST.RELAY_DETECT_BONUS; if (sqA._st) sqA._st.audit.relayIntelUsed++; }
    /* Compression beats fieldcraft. Twenty-four squads inside a circle a mile across see
       each other whatever their stance — that is the whole job of the closing line
       (DESIGN.md §5.6). Without this floor an all-careful field produced three fights in a
       month and never resolved at all. */
    const comp = compressionFactor(planet, day);
    const floor = CONST.DETECT_FLOOR * (comp - 1) / (CONST.DETECT_COMPRESSION_MAX - 1);
    return Math.min(0.95, Math.max(p, floor));
  }

  /* Declining is an ATTEMPT, not a guarantee (§6.1). Escape room collapses as the map does. */
  function tryEscape(rng, sq, planet, day, seekerStat) {
    const z = MAP.zoneOn(planet, day);
    /* A corp that declared preservationist is genuinely trying to leave; a standard corp
       declining a fight is half-hearted about it. Effort scales with (1 - accept). */
    const accept = STANCE_DIALS[sq.corp.policy].accept;
    let p = CONST.ESCAPE_BASE * (0.60 + 0.80 * (1 - accept))
      + CONST.ESCAPE_FIELDCRAFT * (squadStat(sq, 'fieldcraft') - 10)
      - CONST.ESCAPE_FIELDCRAFT * (seekerStat - 10);
    const room = z.r / planet.radius;
    if (z.r <= planet.radius * CONST.CORNERED_ZONE_FRAC) p = CONST.ESCAPE_ROOM_MIN;
    else p *= Math.min(1, 0.45 + 0.55 * room * 1.6);
    /* backed against the line, there is nowhere behind you to go */
    const edgeGap = z.r - MAP.dist(sq.x, sq.y, z.cx, z.cy);
    if (edgeGap < CONST.CORNERED_EDGE * 2) p *= 0.5;
    if (sq.rationDry) p -= 0.10;
    if (sq.intelUntil >= (sq._day || 0)) { p += CONST.RELAY_ESCAPE_BONUS; if (sq._st) sq._st.audit.relayEscapeUsed++; }

    /* The 15% floor used to apply however little ground was left, so a cornered squad slipped
       away one time in seven on a circle it could not have crossed. Escape now collapses WITH
       the ground: the term is the ring's diameter measured against contact range, so when the
       ring is narrower than the range at which squads meet, there is nowhere to slip to and
       the floor is zero. Built from both live constants, so moving either alone shows up. */
    const span = (2 * z.r - CONST.ENGAGE_RANGE) / CONST.ENGAGE_RANGE;
    const room01 = Math.max(0, Math.min(1, span));
    const floor = CONST.ESCAPE_ROOM_MIN * room01;
    return rng() < Math.max(floor, Math.min(0.92, p * room01));
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
  /**
   * PROCUREMENT.md §13 — what is actually in a sponsor's crate.
   *
   * One primary or armour piece at the crate's tier, plus supplies, and on a late crate
   * sometimes an exotic. The piece goes to whoever gains most by it and is only taken if it
   * is genuinely an upgrade — a tier-2 crate holds nothing a fielded squad wants, which is
   * what makes the ring's escalating waves matter: early crates are supplies, late crates
   * are weapons, and `DIVIDE.md` §2.5's "a late crate is where the exotica live" becomes
   * true rather than aspirational.
   *
   * It is equipped onto the BODY, not onto the per-engagement combatant, so it survives the
   * fight, keeps its tags, damage type and resistances like any other catalog item, and is
   * carried home into the armoury by `season.js` if its owner lives. That is the honest path
   * to a railgun: you win it, you keep it, and then you spend seasons deciding whether it is
   * worth seven bodies' allowance to bring back.
   *
   * `sponsor_drop_handling_bonus` (the Mon-Wa quartermaster) reads HERE at last, closing half
   * of `[OPEN-E3]` — it was declared at Step 2 and read nowhere in the project.
   */
  function openCrate(rng, sq, obj, stats) {
    const bodies = squadHead(sq);
    if (!bodies.length) return false;
    const tier = Math.max(1, Math.min(5, obj.tier || CONST.CLAIM_CACHE_TIER));
    const knack = squadHasHook(sq, 'sponsor_drop_handling_bonus');
    if (knack && stats.audit) stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1;
    let took = false;

    /* ---- the piece ----
       The ordinary shelf STOPS AT TIER 4: every tier-5 primary and armour piece in the catalog
       is exotic (§11.1), by design. So an exact-tier filter left the best crates in the game
       holding nothing 88% of the time — the one branch that most needed to fire, wired to a
       condition almost never true, written while cutting a system for that exact fault and
       caught by measuring rather than reading. The pool is therefore "the best ordinary grade
       AT OR BELOW the crate's tier": a tier-5 crate holds a tier-4 piece unless it rolls the
       exotic, and a tier-2 crate holds a tier-2 piece that a fielded squad will refuse. */
    const wantExotic = tier >= 5 && rng() < CONST.CACHE_EXOTIC_P * (knack ? 2 : 1);
    let pool = ITEMS.catalog.filter(i =>
      (i.slot === 'primary' || i.slot === 'armor') && i.legality === 'legal' &&
      (wantExotic ? !!i.exotic : (!i.exotic && i.tier <= tier)));
    if (!wantExotic && pool.length) {
      const top = Math.max.apply(null, pool.map(i => i.tier));
      pool = pool.filter(i => i.tier === top);
    }
    if (pool.length) {
      const pick = pool[Math.floor(rng() * pool.length)];
      const slot = pick.slot === 'armor' ? 'armor' : 'primary';
      /* to whoever gains most: the lowest tier currently in that slot */
      let best = null, bestTier = 99;
      for (const f of bodies) {
        const cur = ITEMS.byId((f.loadout || {})[slot]);
        const t = cur ? cur.tier : 0;
        if (t < bestTier) { bestTier = t; best = f; }
      }
      if (best && pick.tier > bestTier) {
        const lo = best.loadout || {};
        ITEMS.equip(best, {
          primary: slot === 'primary' ? pick.id : lo.primary,
          armor:   slot === 'armor'   ? pick.id : lo.armor,
          mods: lo.mods, sidearm: lo.sidearm, consumables: lo.consumables
        });
        took = true;
        if (pick.exotic) stats.audit.cacheExotics = (stats.audit.cacheExotics || 0) + 1;
        stats.audit.cachePieces = (stats.audit.cachePieces || 0) + 1;
      }
    }

    /* ---- the supplies ----
       THE ALEAS CAPS CONSUMABLE SLOTS (`CONSUMABLE_SLOTS 2`, PROCUREMENT.md §2.4), and the first
       version of this appended to `consumables` without looking — so a squad that emptied two
       crates walked around with three and four, over a quota the Aleas is broadcasting. Five
       fighters in a four-season career. Found by the corp schema at Step 8.5b, which is the
       first thing in the project ever to walk a live fighter against its own declared shape.
       Supplies now go to somebody who has a free slot, and a full squad simply cannot take
       them — which is a real cost of having looted already, not a validation error. */
    const want = CONST.CACHE_CONSUMABLES + (knack ? 1 : 0);
    const shelf = ITEMS.catalog.filter(i => i.slot === 'consumable' && i.legality === 'legal');
    for (let k = 0; k < want && shelf.length; k++) {
      const room = bodies.filter(f => ((f.loadout || {}).consumables || []).length
                                      < ITEMS.CONST.CONSUMABLE_SLOTS);
      if (!room.length) break;
      const item = shelf[Math.floor(rng() * shelf.length)];
      const f = room[Math.floor(rng() * room.length)];
      const lo = f.loadout || {};
      ITEMS.equip(f, { primary: lo.primary, armor: lo.armor, mods: lo.mods, sidearm: lo.sidearm,
                       consumables: (lo.consumables || []).concat([item.id]) });
      took = true;
      stats.audit.cacheSupplies = (stats.audit.cacheSupplies || 0) + 1;
    }

    /* a medkit in the crate is a medkit in the squad — the tally is built at the muster and
       has to be rebuilt when the squad's consumables change, or the crate is invisible to it */
    sq.medkits = bodies.reduce((s, f) => s + ((f.loadout || {}).consumables || [])
                   .filter(c => c === 'itm_medkit').length, 0) * CONST.MEDKIT_USES;
    sq.hasMedkit = sq.medkits > 0;
    sq.crates++;
    return took;
  }

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
    if (obj.type === 'ore_assay' && obj.resource && sq.corp) {
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
      case 'sponsor_cache':  if (openCrate(rng, sq, obj, stats)) stats.audit.gearUpgraded++; break;
      case 'munitions_drop': sq.ammoResupplied += Math.max(1, Math.round(pot)); stats.audit.ammoResupply++; break;
      case 'ration_site':    sq.rations += CONST.RATION_DROP_DAYS * squadHead(sq).length * 0.8 * pot; break;
      case 'ore_assay':      sq.corp.oreCredit += Math.round(pot); break;
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
    const head = squadHead(sq);
    if (head.length) {
      const fc = head.reduce((s, b) => s + b.stats.fieldcraft, 0) / head.length;
      p += (fc - 10) * 0.012;                   /* fieldcraft is the choosing-ground stat */
    }
    if (sq._resting) p += 0.10;
    /* INTEL OPS (S20). What a corp spent its prep turns looking at. `season.js` accumulates
       `SCOUT_INTEL` a block onto the corp and passes it down with the drop, and it buys
       readiness on the ground for the whole Divide — you have seen this rock before, and the
       people who have not are finding out.

       The scout verb was written at Step 8.6 and this was the other end of it, which did not
       exist: `_scouted` was incremented every turn a corp chose to look at the planet and read
       by NOTHING, for a whole step, in the session that catalogued dead wires for a living. It
       is capped, because ten turns of staring does not make you psychic. */
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
    const spread = CONST.STANCE_SPREAD;
    const weights = NOTCHES.map((_, i) => Math.exp(-Math.pow(i - target, 2) / (2 * spread * spread)));
    const tot = weights.reduce((a, b) => a + b, 0);
    let roll = rng() * tot, pick = 0;
    for (let i = 0; i < weights.length; i++) { if ((roll -= weights[i]) <= 0) { pick = i; break; } }

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
    if (sq.corp) for (const q of sq.corp.squads) if (q.medkits > 0 && MAP.dist(q.x, q.y, sq.x, sq.y) <= CONST.JOIN_RANGE) return q;
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
  function transferFame(victim, takers) {
    const gain = REP.fameTransfer(victim.fame || 0, 1);
    if (!(gain > 0) || !takers.length) return 0;
    const each = gain / takers.length;
    for (const t of takers) {
      let g = each;
      /* The crowd finds some people and loses others. Read by HOOK, not by trait id: the
         hooks are the contract, ids are not, and reading ids is how a renamed trait silently
         stops working. Eight of these had been declared and read by nothing since Step 2. */
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
          transferFame(f, victors.bodies || []);
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
        if (kit) { kit.medkits--; kit.hasMedkit = kit.medkits > 0; if (stats) stats.audit.medkitsUsed = (stats.audit.medkitsUsed || 0) + 1; }
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
       the Divide fights on the same object the board wrote its card against. Absent one, the
       Divide rolls its own exactly as before. The failure this guards is recorded a few lines
       below: a survey and a ground that were two different planets produced boards demanding a
       resource that was not down there. */
    const planet = opts.groundTruth || MAP.generatePlanet(rng, opts.planet || {});
    /* NEGOTIATION.md §2.1 — what is being fought over, rolled with the planet and public
       from the season open, because board goals are set against it. A planet handed in from the
       season open ALREADY CARRIES ITS POT, and re-rolling it here would move the prize out from
       under the card the board wrote against it — quietly, and only in the value. */
    if (!planet.pot) planet.pot = NEG.rollPot(rng, planet.archetype, planet.richness);

    const corps = [];
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
      /* REPUTATION.md R1 — the ONE thing that survives a Divide. A caller running a season
         chain hands last season's records back in; a caller running a single Divide gets
         fresh ones off the profile. Either way every corp carries one, because the wall in
         `negotiate.valueJoin` reads it, and a corp without a record cannot be stopped from
         selling its claim on day one. */
      corp.rep = (opts.reputations && opts.reputations[profile.id])
              || REP.open(profile, oaProfiles, { season: opts.season || 1 });
      /* §6.2 — THE BOARD'S CARD IS SET AGAINST THIS PLANET, not against one generated
         alongside it. A caller that rolled its own planet to read the survey from, then let
         `runDivide` roll another, produced boards demanding a resource that was not down
         there — which is unsatisfiable for a reason no player could ever see. The survey and
         the ground have to be the same object. */
      if (opts.openSeason) {
        REP.openSeason(corp.rep, planet,
                       P.mulberry32(P.seedFrom('goal' + (opts.season || 1) + profile.id)),
                       { expect: Math.max(2, 3 + (profile.difficulty || 3)),
                         thinTreasury: (profile.finance || {}).treasury_band === 'low' });
      }
      corps.push(corp);
    }
    /* Every corp can see the field, so `principalOf` can walk a chain of joins. */
    for (const c of corps) c._corps = corps;

    /* The drop puts each corp on its own arc of the rim. Slots are evenly spaced with ONE
       rotation for the whole drop — per-corp jitter used to let adjacent corps overlap, and
       squads landed 0.003 apart when sight range is 0.105. A corp should never open the
       Divide already surrounded. */
    /* WHERE EACH CORP LANDS IS A DECISION NOW. It was an even fan around the ring at a random
       spin — nobody chose anything, and two corps could never land near each other on purpose.
       `opts.dropSectors` maps a corp id to a sector index chosen at M11; absent one, a corp
       falls back to its old evenly-spaced slot, so an unaltered call behaves exactly as before.
       Corps that pick the same sector LAND TOGETHER, which is the entanglement the seam is for:
       ruinous without an understanding, and a deliberate alliance with one. */
    /* the pacts have to be on the corps BEFORE the drop, but `stats` does not exist yet at this
       point in the function — assigning to it here put this line in its temporal dead zone,
       which is the same fault the day-loop comment further down was written about. The count is
       held in a local and recorded once the audit object exists. */
    /* what the seam decided about being seen, carried onto the corps the ground reads */
    for (const c of corps) {
      const m = (opts.mediaRevealed || {})[c.id];
      if (m) c._mediaReveal = m.reveal || 0;
    }
    const preDeals = seedPreDividePacts(corps, opts.preDividePacts);
    const spin = rng() * Math.PI * 2;
    const sectorPick = opts.dropSectors || {};
    const sectorCount = 6;
    for (let ci = 0; ci < corps.length; ci++) {
      const picked = sectorPick[corps[ci].id];
      const a0 = picked != null
        ? (picked / sectorCount) * Math.PI * 2 + spin * 0.05
        : spin + (ci / corps.length) * Math.PI * 2;
      const squads = corps[ci].squads;
      for (let si = 0; si < squads.length; si++) {
        const sq = squads[si];
        const fan = squads.length > 1 ? (si / (squads.length - 1) - 0.5) : 0;
        const a = a0 + fan * CONST.DROP_FAN;
        const d = planet.radius * (CONST.DROP_RING - CONST.DROP_RING_JITTER / 2 + rng() * CONST.DROP_RING_JITTER);
        sq.x = planet.cx + Math.cos(a) * d;
        sq.y = planet.cy + Math.sin(a) * d;
        sq.hx = sq.x; sq.hy = sq.y;
      }
    }
    for (const c of corps) for (const sq of c.squads) {
      const p = MAP.towardZone(planet, 1, sq.x, sq.y, 0.2);
      sq.x = p.x; sq.y = p.y;
    }
    /* guarantee, not hope: nudge apart anything that still landed inside sight range */
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      const all = [];
      for (const c of corps) for (const sq of c.squads) all.push(sq);
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          if (all[i].corpId === all[j].corpId) continue;
          const d = MAP.dist(all[i].x, all[i].y, all[j].x, all[j].y);
          if (d >= CONST.DROP_MIN_GAP) continue;
          const push = (CONST.DROP_MIN_GAP - d) / 2 + 1e-4;
          const ux = (all[j].x - all[i].x) / Math.max(1e-6, d), uy = (all[j].y - all[i].y) / Math.max(1e-6, d);
          all[i].x -= ux * push; all[i].y -= uy * push;
          all[j].x += ux * push; all[j].y += uy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const c of corps) for (const sq of c.squads) {
      const dd = MAP.dist(sq.x, sq.y, planet.cx, planet.cy);
      if (dd > planet.radius * 0.95) {
        const k = (planet.radius * 0.95) / dd;
        sq.x = planet.cx + (sq.x - planet.cx) * k;
        sq.y = planet.cy + (sq.y - planet.cy) * k;
      }
      sq.hx = sq.x; sq.hy = sq.y;
    }

    if (opts.captureDrop) {
      opts.captureDrop(corps.map(c => c.squads.map(q => ({ corpId: c.id, x: q.x, y: q.y }))));
    }

    const stats = {
      dead: 0, captured: 0, injured: 0, careerEnded: 0, lightWounds: 0, monwaShock: 0,
      engagements: 0, exchanges: 0, shots: 0, hits: 0, downs: 0, killedOutright: 0, downDeaths: 0,
      zeroCasualtyEngagements: 0, routEngagements: 0, brokenEngagements: 0, squadsBroken: 0,
      sidesEngaged: 0, sidearmDraws: 0, vents: 0, capExits: 0, days: 0,
      wingInjuries: 0, thythynSerious: 0, hazards: 0, hazardInjuries: 0, degradations: 0,
      _corps: corps,   /* the relay broadcast needs the whole field, §2.4 */
      claims: 0, relayFirings: 0, stanceChanges: 0, windows: 0, forcedContacts: 0, escapes: 0,
      deals: [], refusals: [], joins: 0, pacts: 0, standDowns: 0, betrayals: 0, disqualifications: 0, offersSent: 0,
      ransoms: 0, pactsBroken: 0, contactsDeclined: 0, supplyMoved: 0,
      contactOffers: 0, engagementsByWeek: [0, 0, 0, 0, 0], rationShortDays: 0, squadDays: 0,
      corpCount, perCorp: corps.map(c => ({ id: c.id, policy: c.policy, declaredAt: c.declaredAt, permanent: 0, injuredHome: 0, engagements: 0 })),
      archetype: planet.archetype, offersBy: {}, escapesBy: {}, colocDays: {}, passedOver: 0,
      audit: {
        preDividePacts: preDeals,
        forageEvents: 0, forageYield: 0, closurePush: 0, zoneRiskVeto: 0, nightMarch: 0,
        /* `stats.passedOver` is declared and `stats.audit.passedOver` was not, while both are
           raised on the same line — so one counted and the other was NaN from the first
           increment. Found by running a contest and looking for NaN, not by reading. */
        passedOver: 0,
        huntMoves: 0, evadeMoves: 0, driftMoves: 0, objectiveMoves: 0,
        awarded: {}, hazardKind: {}, terrainUsed: {}, bandOpen: [0, 0, 0],
        relayIntelUsed: 0, relayEscapeUsed: 0, gearUpgraded: 0, ammoResupply: 0,
        weakDiscount: 0, lateReveals: 0, campMoraleHooks: 0, supplyHooks: 0,
        stressApplied: 0, successions: 0, rationDryDays: 0, degradeChecks: 0,
        nightEngagements: 0, objectiveFights: 0, capturedAlive: 0
      }
    };
    const pcOf = {};
    for (const pc of stats.perCorp) pcOf[pc.id] = pc;
    stats._pcOf = pcOf;

    /* Replay capture (opt-in). The viewer is a pure viewer: everything it needs is
       recorded here, so no sim has to run in a browser. */
    const REC = opts.replay ? { planet: null, days: [], corps: [] } : null;
    let dayEvents = [];
    /* where shooting has been heard lately, and how far each one carried */
    const noises = [];
    const rec = e => { if (REC) dayEvents.push(e); };
    if (REC) {
      REC.planet = {
        archetype: planet.archetype, name: planet.archetypeName,
        cx: planet.cx, cy: planet.cy, radius: planet.radius,
        patches: planet.patches.map(p => ({
          x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000, t: p.type, n: p.name
        })),
        warp: planet.warp.map(w => ({
          fx: Math.round(w.fx * 1000) / 1000, fy: Math.round(w.fy * 1000) / 1000,
          px: Math.round(w.px * 1000) / 1000, py: Math.round(w.py * 1000) / 1000,
          a: Math.round(w.a * 100000) / 100000
        })),
        zone: planet.zone.map(z => ({ d: z.fromDay, cx: Math.round(z.cx * 1000) / 1000,
          cy: Math.round(z.cy * 1000) / 1000, r: Math.round(z.r * 1000) / 1000 })),
        objectives: planet.objectives.map(o => ({
          id: o.id, x: Math.round(o.x * 1000) / 1000, y: Math.round(o.y * 1000) / 1000,
          t: o.type, lbl: o.label, place: o.place, rd: o.revealDay
        }))
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

    const liveSquads = () => {
      const out = [];
      for (const c of corps) for (const sq of c.squads) if (squadHead(sq).length >= 1) out.push(sq);
      return out;
    };

    let day = 0;
    let engagementsRun = 0;

    /* N18 — the clock is a schedule, not a limit. The ring closes to the last ground on
       LAST_GROUND_DAY and stops closing; the CONTEST does not stop until one banner is
       left. Days past that are overtime, run on the same ground with rest, escape and
       pass-over suspended. OVERTIME_MAX is a safety rail, not a design constant: if a
       Divide ever reaches it, the last ground has failed to do its job and that is a fault
       in the radius, not a reason to adjudicate. It is asserted in `regress`. */
    const OVERTIME_MAX = 12;
    let overtime = false;
    /* Drop day: the devout arrive elated. Declared in traits.json since Step 2 and read by
       nothing until the Step 6 audit. Placed here rather than at corp construction because
       the squad hook cache does not exist until the loop is set up. */
    for (const c of corps) {
      for (const q of c.squads) {
        const h = squadHooks(q);
        const surge = h.has('divide_start_morale_surge_major') ? 8 : h.has('divide_start_morale_surge') ? 4 : 0;
        if (!surge) continue;
        for (const b of squadHead(q)) b.condition.morale = Math.min(95, b.condition.morale + surge);
        stats.audit.traitHooks = (stats.audit.traitHooks || 0) + 1;
      }
    }

    while (true) {
      day++;
      stats.days = day;
      overtime = day > MAP.CONST.LAST_GROUND_DAY;
      if (overtime) stats.overtimeDays = (stats.overtimeDays || 0) + 1;

      /* --- DAWN: the zone, the flares, the reveals --- */
      dayEvents = [];
      const zNow = MAP.zoneOn(planet, day);
      if (MAP.tighteningTomorrow(planet, day)) {
        const nx = MAP.zoneNext(planet, day);
        rec({ t: 'zone_warn', cx: nx.cx, cy: nx.cy, r: nx.r });
      }
      if (planet.zone.some(z => z.fromDay === day) && day > 1) {
        rec({ t: 'zone', cx: zNow.cx, cy: zNow.cy, r: zNow.r });
      }
      const shown = MAP.revealObjectives(planet, day);
      stats.audit.lateReveals += shown.length;
      for (const o of shown) rec({ t: 'reveal', x: o.x, y: o.y, lbl: o.label, place: o.place });

      /* The wall closed. Nobody is left outside it, because outside it does not exist: the
         field displaces whatever it reaches. It moves the wounded and the spent as readily
         as the walking, so a squad that is all stretcher cases is carried in too — anything
         less leaves stale bodies stranded on ground that no longer exists. */
      for (const c of corps) for (const sq of c.squads) {
        if (!sq.bodies.length) continue;
        const push = MAP.clampInside(planet, day, sq.x, sq.y);
        if (push.pushed <= 0) continue;
        sq.x = push.x; sq.y = push.y;
        if (!squadHead(sq).length) continue;
        stats.audit.closurePush++;
        sq.intent = null; sq._why = 'zone';
        for (const b of squadHead(sq)) b.condition.fatigue = Math.min(100, b.condition.fatigue + CONST.FATIGUE_MARCH);
        addStress(sq, 3, stats);
        rec({ t: 'pushed', x: sq.x, y: sq.y, c: sq.corpId });
      }

      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        sq._day = day; sq._st = stats;
        sq.movedToday = false; sq.foughtToday = false; sq._lostDay = false; sq._hunted = false;
      }
      if (day % MAP.windowCadence(planet, day) === 0) stats.windows++;

      /* --- DAWN: the drop leader plans (§8.3) ---
         Squads do not re-decide every morning. A captain forms an INTENT and works it for
         days, and the drop leader can put two or three squads on the same target from
         different bearings. How well that is done is the tactics of the people doing it:
         a well-led corp arrives together from two sides, a badly led one trickles in one
         squad at a time and gets flanked itself. */
      const flares = liveSquads().map(s => ({
        sq: s, corpId: s.corpId, x: s.x, y: s.y, prestige: prestigeOf(s), n: squadHead(s).length
      }));
      for (const c of corps) planCorp(rng, c, planet, day, flares, stats, noises);

      /* --- DAY: supply --- */
      for (const sq of liveSquads()) {
        const hooks = squadHooks(sq);
        consumeRations(sq, planet, raceById, hooks, stats);
        forage(rng, sq, planet, hooks, posture, stats);
        stats.squadDays++;
        if (sq.rationShort) stats.rationShortDays++;
        if (sq.rationDry) { addStress(sq, CONST.STRESS.rationDry, stats); stats.audit.rationDryDays++; }
      }

      /* --- DAY: hazards --- */
      for (const sq of liveSquads()) hazardCheck(rng, sq, planet, squadHooks(sq), stats);

      /* --- THE DAY, IN TWELVE TICKS ---
         Six of light, six of dark. Movement happens on the light ticks at a sixth of the
         day's march each; contact is checked on every one of the twelve. */
      for (const q of liveSquads()) { q._heldToday = 0; q._joinedToday = false; }
      /* a sound is worth walking to for a day and then it is just a place something happened */
      for (let i = noises.length - 1; i >= 0; i--)
        if (day - noises[i].day > CONST.NOISE_DAYS) noises.splice(i, 1);
      if (REC) for (const q of liveSquads()) q._track = [];
      for (let tick = 0; tick < CONST.TICKS_PER_DAY; tick++) {
        const night = tick >= CONST.DAY_TICKS;
        /* One clock for the whole contest. `busyUntil` has to outlive the day boundary — a
           fight starting in the last block of the evening runs into the small hours. */
        const absTick = (day - 1) * CONST.TICKS_PER_DAY + tick;
        if (!night) {
      /* --- DAY: movement over open ground ---
         Positions are public at dawn and stale by dusk (DESIGN.md §5.6), which is what
         makes a coordinated approach possible at all. */
      for (const sq of liveSquads()) {
        const dials = STANCE_DIALS[sq.corp.policy];
        const hooks = squadHooks(sq);
        if (tick === 0) { sq.hx = sq.x; sq.hy = sq.y; }   /* bearing is where they started the day */

        const terrainSpeed = planet.speedAt(sq.x, sq.y);
        let budget = (CONST.DAY_MARCH / CONST.DAY_TICKS) * terrainSpeed * dials.ground;
        if (posture === 'fortify') budget *= 0.45;
        if (hooks.has('march_efficiency_up')) budget *= 1.12;
        if (sq._lostDay) budget *= 0.3;
        /* licking wounds: you do not march the morning after a firefight */
        /* N18 — nobody rests on the last ground. */
        if (!overtime && sq.restUntil && day <= sq.restUntil) { budget *= CONST.REST_MARCH_MULT; sq._resting = true; }
        else sq._resting = false;

        /* IN A FIGHT IS A PLACE YOU ARE. They cannot march, they cannot claim, and the wall
           is still closing while they are held there — which is the cost the contest never
           charged for a battle. */
        if (sq._busyUntil != null && sq._busyUntil > absTick) {
          sq._why = 'fighting'; sq._aim = null; continue;
        }

        const it = sq.intent;
        if (!it) { sq._why = sq.approach || 'hold'; sq._aim = null; continue; }

        /* Staging: a flanker in position waits for the strike, rather than walking in
           alone and being killed piecemeal. This is what makes the pincer arrive at once. */
        let tx = it.tx, ty = it.ty;
        if (it.type === 'strike') {
          const staged = MAP.dist(sq.x, sq.y, it.sx, it.sy) <= CONST.STAGE_SLACK;
          if (day < it.strikeDay && !staged) { tx = it.sx; ty = it.sy; sq._why = 'stage'; }
          else if (day < it.strikeDay) { sq._why = 'stage'; tx = sq.x; ty = sq.y; }
          else {
            const t = it.targetSquad;
            if (t && squadHead(t).length >= 1) { tx = t.x; ty = t.y; }
            sq._why = it.role === 'flank' ? 'flank' : 'hunt';
            sq._hunted = true;
            if (it.role === 'flank') stats.audit.flankMoves = (stats.audit.flankMoves || 0) + 1;
            else stats.audit.huntMoves++;
          }
        } else {
          sq._why = it.type;
          if (it.type === 'withdraw') stats.audit.evadeMoves++;
          /* The objective/drift tally used to hang off an `else` of the line BELOW, so the
             `sq.approach` assignment swallowed it and objectiveMoves was unreachable. The
             label and the tally are two different jobs; they are separated now. */
          if (it.type === 'claim' || it.type === 'hold') stats.audit.objectiveMoves++;
          else if (it.type !== 'withdraw') stats.audit.driftMoves++;
          if (sq.approach && it.type !== 'strike') sq._why = sq.approach;
        }

        /* Hold the destination inside the current line — a captain can see the edge.
        
           §7 zoneRisk, WIRED AT LAST. It is one of the six declared fight-selection dials
           and it was read exactly zero times anywhere in the codebase: five stance rows each
           carried a value from 0.10 to 0.88 and none of them did anything. What it means is
           how near the closing edge a corp is willing to work. A careful corp keeps a wide
           margin and gives up the ground at the rim; a reckless one loots right up against
           the wall and takes the chance that the ring does not catch it out.

           A margin, not a veto: everyone still gets clamped inside the line, but where the
           line effectively sits for THIS corp depends on what it declared. */
        const zc = MAP.zoneOn(planet, day);
        const zr = STANCE_DIALS[sq.corp.policy].zoneRisk;
        const margin = CONST.ZONE_MARGIN_SAFE
                     - (CONST.ZONE_MARGIN_SAFE - CONST.ZONE_MARGIN_BOLD) * zr;
        const dt = MAP.dist(tx, ty, zc.cx, zc.cy);
        if (dt > zc.r * margin) {
          const k = (zc.r * margin) / Math.max(1e-6, dt);
          tx = zc.cx + (tx - zc.cx) * k;
          ty = zc.cy + (ty - zc.cy) * k;
          stats.audit.zoneRiskVeto++;
        }

        /* WHERE THEY ARE ACTUALLY GOING, after staging, after the target moved, and after the
           closing line has clamped it back inside what this corp is willing to risk. Captured
           here rather than from `sq.intent` because the intent's raw destination is often not
           the place they are walking to. A viewer drawing the route they already walked shows
           the past and implies nothing; this is the thing a manager would want to see. */
        sq._aim = { x: tx, y: ty, why: sq._why };

        const d = MAP.dist(sq.x, sq.y, tx, ty);
        if (d > CONST.ARRIVE_SLACK) {
          const step = Math.min(budget, d);
          const nx = sq.x + (tx - sq.x) / d * step, ny = sq.y + (ty - sq.y) / d * step;
          const inside = MAP.clampInside(planet, day, nx, ny);   /* the wall is a wall */
          sq.x = inside.x; sq.y = inside.y;
          sq.movedToday = true;
          for (const b of squadHead(sq)) b.condition.fatigue = Math.min(100, b.condition.fatigue + CONST.FATIGUE_MARCH);
          if (tick === 0 && rng() < CONST.NIGHT_MARCH_P && !hooks.has('march_efficiency_up')) {
            stats.audit.nightMarch++;
            for (const b of squadHead(sq)) b.condition.fatigue = Math.min(100, b.condition.fatigue + CONST.NIGHT_MARCH_FATIGUE);
          }
        } else if (it.type === 'claim' || it.type === 'patrol') {
          it.arrived = true;
        }
      }


        }
      /* --- DAY + NIGHT: contact (§6) --- */
      {
        const live = liveSquads();
        for (const sq of live) { sq._offered = false; sq.foughtPhase = false; }

        for (let i = 0; i < live.length; i++) {
          for (let j = i + 1; j < live.length; j++) {
            const sqA = live[i], sqB = live[j];
            if (sqA.corpId === sqB.corpId) continue;
            /* N5 — corps under one banner have stopped shooting at each other. They are not
               a merged force and they do not share a plan; they simply are not enemies. */
            if (allied(sqA.corp, sqB.corp)) continue;
            /* N8 — a non-aggression pact, HONOURED. These were being signed at the table and
               then ignored on the ground: the flag was written and never read, so two corps
               under a truce shot each other the same afternoon they agreed not to.
               A pact is also the one agreement that can be torn up (§8) — the cheap betrayal,
               which is what makes the expensive one mean anything. */
            if (pactHolds(sqA.corp, sqB.corp, day)) {
              if (!breaksPact(rng, sqA.corp, sqB.corp, day, stats)) {
                stats.contactsDeclined = (stats.contactsDeclined || 0) + 1;
                continue;
              }
            }
            if (sqA.foughtPhase || sqB.foughtPhase) continue;
            /* still shooting at somebody else, from a block or more ago */
            if ((sqA._busyUntil || 0) > absTick || (sqB._busyUntil || 0) > absTick) continue;
            if (squadHead(sqA).length < 1 || squadHead(sqB).length < 1) continue;

            const sep = MAP.dist(sqA.x, sqA.y, sqB.x, sqB.y);
            if (sep > CONST.ENGAGE_RANGE) continue;

            const mx = (sqA.x + sqB.x) / 2, my = (sqA.y + sqB.y) / 2;
            if (rng() >= detectChance(rng, sqA, sqB, planet, day, night, mx, my, sep)) continue;
            stats.contactOffers++;
            stats.offersBy[sqA.corp.policy] = (stats.offersBy[sqA.corp.policy] || 0) + 1;
            stats.offersBy[sqB.corp.policy] = (stats.offersBy[sqB.corp.policy] || 0) + 1;

            const dA = STANCE_DIALS[sqA.corp.policy], dB = STANCE_DIALS[sqB.corp.policy];
            const seeker = dA.seek >= dB.seek ? sqA : sqB;
            const other = seeker === sqA ? sqB : sqA;
            const otherDials = STANCE_DIALS[other.corp.policy];

            /* the nearest objective, if they are standing on one */
            let onObj = null;
            for (const o of planet.objectives) {
              if (!o.revealed) continue;
              if (MAP.dist(mx, my, o.x, o.y) <= MAP.CONST.CLAIM_RADIUS * 2.2) { onObj = o; break; }
            }

            /* cornered: the circle is small, or your back is against its edge */
            const z = MAP.zoneOn(planet, day);
            const edgeGap = z.r - MAP.dist(other.x, other.y, z.cx, z.cy);
            let forced = z.r <= planet.radius * CONST.CORNERED_ZONE_FRAC || edgeGap <= CONST.CORNERED_EDGE;
            if (onObj && onObj.heldBy === other.corpId && rng() < otherDials.contest) forced = true;
            /* N18 — on the last ground there is no such thing as declining. */
            if (overtime) forced = true;

            let accept = otherDials.accept;
            if (onObj) accept = Math.min(1, accept + otherDials.contest * 0.5);
            /* A battered squad does not stop playing. It fights on knowing how that ends —
               a section down to one man still hunting is the best thing on the broadcast,
               and the old half-strength discount quietly deleted it. */
            const strength = squadHead(other).length / Math.max(1, other.bodies.length);
            if (strength < 0.35) { accept *= CONST.SPENT_SQUAD_CAUTION; stats.audit.weakDiscount++; }

            if (!forced) {
              /* Late on, with the ground nearly gone, you stop choosing your fights — the
                 crowd wants a winner and there is nobody left to be choosy about.

                 The ramp is built FROM the live last-ground fraction. It used to carry the
                 old final radius (0.34) as a literal, so the moment the schedule moved it
                 would have been measuring against a circle that no longer existed, silently.

                 In overtime the gate is not merely steep, it is gone (N18): on the last
                 ground nothing is beneath fighting. */
              const minFrac = MAP.CONST.LAST_GROUND_FRAC;
              const room = z.r / planet.radius;
              const late = overtime ? 1
                : 1 - Math.min(1, Math.max(0, (room - minFrac) / (0.55 - minFrac)));
              const worth = Math.min(1, CONST.PRESTIGE_FLOOR
                + (1 - CONST.PRESTIGE_FLOOR) * prestigeOf(other) + 0.55 * late);
              if (rng() >= worth) {
                stats.passedOver++; stats.audit.passedOver++;
                rec({ t: 'pass', x: mx, y: my, c: seeker.corpId, on: other.corpId });
                continue;
              }
            }
            if (!forced && rng() >= accept) {
              if (tryEscape(rng, other, planet, day, squadStat(seeker, 'fieldcraft'))) {
                stats.escapes++;
                stats.escapesBy[other.corp.policy] = (stats.escapesBy[other.corp.policy] || 0) + 1;
                rec({ t: 'escape', x: mx, y: my, c: other.corpId, by: seeker.corpId });
                continue;
              }
            }
            if (forced) stats.forcedContacts++;

            /* Anyone close enough may pile in — INCLUDING your own other squads, which is
               the entire point of a planned pincer. Same-corp arrivals reinforce one side;
               a third corp opens a new one ([OPEN-C2]).

               NO CAP (ruled, Step 6). The old six-squad ceiling almost never bound in an
               ordinary fight — it bound on the last ground, where every surviving squad is
               inside contact range of every other and the final brawl is the whole point.
               Capping there would have split the deciding fight into arbitrary pieces. */
            const party = [sqA, sqB];
            for (const t of live) {
              if (party.indexOf(t) >= 0) continue;
              if (t.foughtPhase || squadHead(t).length < 1) continue;
              if ((t._busyUntil || 0) > absTick) continue;   /* already committed elsewhere */
              if (MAP.dist(t.x, t.y, mx, my) > CONST.JOIN_RANGE) continue;
              /* A squad may only pile in on a fight that has a side it belongs to — you do
                 not walk into a firefight between two corps you are allied to neither of. */
              const own = party.some(p => p.corpId === t.corpId);
              const ally = !own && party.some(p => allied(p.corp, t.corp));
              const td = STANCE_DIALS[t.corp.policy];
              /* your own squad converging on a fight you planned together joins readily;
                 an ALLY has no shared plan bringing it in, only proximity and willingness
                 (N5 — an umbrella is not a merged force); a stranger has to want it. */
              const p = own ? CONST.JOIN_OWN_P
                : ally ? CONST.JOIN_ALLY_P
                : CONST.JOIN_P * (0.35 + td.seek);
              if (rng() < p) party.push(t);
            }

            /* Group the party into sides — one per BANNER, not one per corp. Corps under
               the same banner are not shooting at each other, so they are one side in the
               exchange. A side may therefore span several corps, and the casualty
               attribution below has to be per-corp rather than per-side because of it. */
            const order = [];
            const bySide = new Map();
            for (const p of party) {
              const key = principalOf(p.corp).id;
              if (!bySide.has(key)) { bySide.set(key, []); order.push(key); }
              bySide.get(key).push(p);
            }
            const groups = order.map(id => bySide.get(id));

            /* §3.2b who got flanked. Bearings of every ENEMY squad's approach: if two of
               them came in from arcs this far apart, your cover only faces one of them.
               This is what a well-timed pincer buys, and what arriving piecemeal costs. */
            const bearingOf = p => Math.atan2(p.hy - my, p.hx - mx);
            const flanked = groups.map((g, gi) => {
              const enemies = [];
              groups.forEach((h, hi) => { if (hi !== gi) for (const p of h) enemies.push(bearingOf(p)); });
              for (let k = 0; k < enemies.length; k++) {
                for (let l = k + 1; l < enemies.length; l++) {
                  let gap = Math.abs(enemies[k] - enemies[l]);
                  if (gap > Math.PI) gap = Math.PI * 2 - gap;
                  if (gap >= CONST.FLANK_ARC) return true;
                }
              }
              return false;
            });

            const objectiveValue = !onObj ? 0 : (onObj.heldBy ? 1.5 : 0.8);
            const built = groups.map(g => liveSquadGroup(rng, g, day, engagementsRun, traitIndex));
            if (built.some(b => !b)) continue;

            const terrain = planet.terrainAt(mx, my);
            const ctx = {
              day, night, terrain,
              openingBand: P.weightedPick(rng, planet.bandBias === 0 ? [[0, 46], [1, 42], [2, 12]]
                : planet.bandBias === 2 ? [[0, 16], [1, 46], [2, 38]] : [[0, 28], [1, 50], [2, 22]]),
              objectiveValue, flanked,
              firstEngagement: engagementsRun === 0,
              /* WATCHING THE FIGHT BACK. The grid logs every tick BY DEFAULT and returns it on
                 the result — `ctx.log === false` is the only thing that turns it off. So the
                 detail was being built for every firefight in every Divide and then dropped on
                 the floor by this function, which is worse than not having it: all of the cost
                 and none of the use.
                 It is switched OFF for fights the manager's corp is not in, which is most of
                 them, and read off the result for the ones they are. A replay of seven rivals'
                 skirmishes is not what anybody sits down to watch. */
              log: !!(opts.human && groups.some(g => g.some(sq => sq.corpId === opts.human)))
                     ? undefined : false,
              /* one figure per side, in the same order as `built` (§14 → tactical) */
              prep: groups.map(g => {
                const lead = g[0];
                const theyKnewUs = g.some(s => Object.keys(s.known || {}).length > 0);
                return preparedness(lead, { sawFirst: theyKnewUs });
              })
            };
            /* [E10] THE GRID. This line called `C.simulateEngagement` — the abstract band
               model — for every firefight in every Divide, for three whole steps, while the
               documents said the grid was the engagement model and nothing in the project
               ever called it. Every casualty figure, weapon league table and difficulty
               gradient measured before Step 7.5 answered a question about the wrong resolver.
               `combat.js` is still here and still load-bearing: the grid calls it for stats,
               aim, severity, injuries, morale and the post-engagement settlement. What it no
               longer does is decide where anybody is standing. */
            /* ---- WHO CAN GET THERE WHILE IT IS STILL HAPPENING ----
               A fight now takes hours, so the ground around it is not frozen. Anybody close
               enough to cover the distance inside that time, who is not already committed and
               is willing to go, walks in partway through — on the bearing they came from.
               The duration is not known until the fight is resolved, so the window is taken
               from the longest it could run. That is deliberate rather than a shortcut: a
               squad decides to go on the sound of shooting, not on how long it turns out to
               last, and giving them the answer first would be the AI reading the future. */
            const reinforce = [];
            {
              const inIt = new Set();
              for (const grp of groups) for (const sq of grp) inIt.add(sq);
              const march = CONST.DAY_MARCH / CONST.TICKS_PER_DAY;
              for (const other of liveSquads()) {
                if (inIt.has(other) || other.foughtPhase) continue;
                if ((other._busyUntil || 0) > absTick) continue;
                if (squadHead(other).length < 1) continue;
                const seek = STANCE_DIALS[other.corp.policy].seek;
                const perTick = march * (1 + CONST.RUSH_SEEK_GAIN * seek);
                const d = MAP.dist(other.x, other.y, mx, my);
                const ticksAway = Math.ceil(d / Math.max(1e-9, perTick));
                if (ticksAway > CONST.FIGHT_TICKS_MAX) continue;
                /* their own people already in it pull harder than a stranger's fight does */
                const friend = groups.some(grp => grp.some(sq => allied(sq.corp, other.corp)));
                const want = STANCE_DIALS[other.corp.policy].seek * (friend ? 1.6 : 1);
                if (rng() >= Math.min(0.95, want)) continue;
                reinforce.push({ sq: other, ticksAway: ticksAway,
                                 bearing: Math.atan2(my - other.y, mx - other.x) });
              }
            }
            if (reinforce.length) {
              const byTag = {};
              for (let gi = 0; gi < groups.length; gi++) byTag[principalOf(groups[gi][0].corp).id] = built[gi];
              ctx.reinforce = [];
              for (const R of reinforce) {
                const side = liveSquadGroup(rng, [R.sq], day, engagementsRun, traitIndex);
                if (!side) continue;
                /* turns, not ticks: the grid runs its own clock inside the block */
                ctx.reinforce.push({
                  side: side, bearing: R.bearing, prep: 0.5,
                  atTurn: 1 + R.ticksAway * CONST.FIGHT_TURNS_PER_TICK
                });
                R.sq.foughtPhase = true; R.sq.foughtToday = true;
                /* walked into somebody else's fight today — reported, because a squad arriving
                   behind a firefight is the whole point of this and a number cannot show it */
                R.sq._joinedToday = true;
              }
              stats.audit.joinedInProgress = (stats.audit.joinedInProgress || 0) + ctx.reinforce.length;
            }
            /* and the bearing each side already on the ground came in from */
            ctx.bearings = groups.map(g => {
              const lead = g[0];
              return Math.atan2(my - lead.hy, mx - lead.hx);
            });

            const res = TACTICAL.resolve(rng, built, ctx);
            /* THE LENGTH OF THE FIGHT, IN THE WORLD'S OWN CLOCK. `telemetry.turn` is how many
               turns the grid actually took to decide it. One block minimum: even a brush where
               somebody breaks contact immediately is an afternoon of being somewhere, being
               careful, and carrying people. */
            const fightTicks = Math.max(1, Math.min(CONST.FIGHT_TICKS_MAX,
              Math.ceil(((res.telemetry && res.telemetry.turn) || 1) / CONST.FIGHT_TURNS_PER_TICK)));
            stats.fightTicks = (stats.fightTicks || 0) + fightTicks;
            stats.longFights = (stats.longFights || 0) + (fightTicks > 1 ? 1 : 0);
            /* THE SOUND OF IT. Everyone in the fight contributes to how far it carried. */
            {
              const inFight = [];
              for (const grp of groups) for (const sq of grp) for (const b of squadHead(sq)) inFight.push(b);
              const heard = loudnessOf(inFight, res.exchanges);
              noises.push({ x: mx, y: my, r: heard, day: day,
                            corps: groups.map(grp => grp[0].corpId) });
              stats.noiseHeard = (stats.noiseHeard || 0) + 1;
              stats.noiseRange = (stats.noiseRange || 0) + heard;
              if (stats._rec) stats._rec({ t: 'noise', x: mx, y: my, r: Math.round(heard * 1000) / 1000 });
            }
            /* held against the day, so a window can hand back everything since it last spoke */
            if (ctx.log !== false && res.log && res.log.length) {
              (stats._fights = stats._fights || []).push({
                day: day, night: !!night, terrain: terrain, x: mx, y: my,
                corps: groups.map(g => g[0].corpId),
                band: res.band, result: res.result, exchanges: res.exchanges,
                casualties: res.casualties, log: res.log
              });
            }

            engagementsRun++;
            stats.engagements++;
            stats.engagementsByWeek[Math.min(4, Math.floor((day - 1) / 7))]++;
            stats.audit.terrainUsed[terrain] = (stats.audit.terrainUsed[terrain] || 0) + 1;
            stats.audit.bandOpen[ctx.openingBand]++;
            if (night) stats.audit.nightEngagements++;
            if (objectiveValue > 0) stats.audit.objectiveFights++;
            if (groups.length > 2) stats.audit.multiSide = (stats.audit.multiSide || 0) + 1;
            if (party.length > groups.length) stats.audit.combinedArms = (stats.audit.combinedArms || 0) + 1;
            if (flanked.some(Boolean)) stats.audit.flanked = (stats.audit.flanked || 0) + 1;

            const t = res.telemetry;
            stats.exchanges += t.exchanges; stats.shots += t.shots; stats.hits += t.hits;
            stats.downs += t.downs; stats.killedOutright += t.killedOutright; stats.downDeaths += t.downDeaths;
            stats.monwaShock += (t.monwaPairLoss || 0);
            if (t.routs > 0) stats.routEngagements++;
            if (t.squadsBroken > 0) stats.brokenEngagements++;
            stats.squadsBroken += t.squadsBroken || 0;
            stats.sidesEngaged += t.sidesEngaged || 0;
            stats.sidearmDraws += t.sidearmDraws || 0;
            stats.vents += t.vents || 0;
            if (res.result === 'cap') stats.capExits++;

            const before = { d: stats.dead, i: stats.injured, c: stats.careerEnded };
            const recBefore = { d: stats.dead, c: stats.careerEnded };
            for (let gi = 0; gi < groups.length; gi++) {
              const side = built[gi];
              for (const u of side.units) {
                if (u.race === 'thythyn' && u.injury) {
                  stats.thythynSerious++;
                  if (u.injury.type.startsWith('inj_wing')) stats.wingInjuries++;
                }
              }
              const b0 = { d: stats.dead, c: stats.careerEnded, i: stats.injured };
              /* A side may span several corps under one banner, so the books are kept from
                 each corp's own bodies rather than from the side as a whole. With a
                 single-corp side this is identical to the delta it replaces. */
              const corpsHere = [];
              for (const sq of groups[gi]) if (corpsHere.indexOf(sq.corp) < 0) corpsHere.push(sq.corp);
              const snap = corpsHere.map(c => tallyCorp(c));
              /* Whoever took the most of the fight against them is holding the prisoners. */
              let captorId = null, best = -1;
              for (let hi = 0; hi < groups.length; hi++) {
                if (hi === gi) continue;
                const n = groups[hi].reduce((a, q) => a + squadHead(q).length, 0);
                if (n > best) { best = n; captorId = groups[hi][0].corpId; }
              }
              /* the other side of this fight, for kill credit and fame transfer */
              let victors = null;
              if (captorId) {
                const vc = corps.find(c => c.id === captorId);
                if (vc) {
                  const here = [];
                  for (let hi = 0; hi < groups.length; hi++) {
                    if (hi === gi) continue;
                    for (const q of groups[hi]) if (q.corpId === captorId) here.push(...squadHead(q));
                  }
                  victors = { corp: vc, bodies: here };
                  /* §3.1 — a fight against somebody worth beating. Uses the same prestige
                     the day loop already hunts by, so "worth beating" has ONE definition. */
                  for (const c of corpsHere) {
                    if (!c || c === vc) continue;
                    if (standing(vc) > standing(c) * 1.35) c._worthyFights = (c._worthyFights || 0) + 1;
                  }
                }
              }
              applyOutcome(groups[gi][0], side, stats, captorId, victors);
              for (let k = 0; k < corpsHere.length; k++) {
                const now = tallyCorp(corpsHere[k]);
                const p = pcOf[corpsHere[k].id];
                p.permanent += now.permanent - snap[k].permanent;
                p.injuredHome += now.injured - snap[k].injured;
                p.engagements++;
                corpsHere[k].engagements++;
              }
              for (const sq of groups[gi]) {
                sq.foughtToday = true; sq.foughtPhase = true;
                sq.engagements++;
                if (sq.ammoResupplied > 0) sq.ammoResupplied--;
                /* HOW LONG THIS ONE TOOK. Derived from the fight that actually happened rather
                   than from a flat figure, so a two-exchange brush costs an afternoon and a
                   pinned grind costs the day. */
                sq._busyUntil = absTick + fightTicks;
                /* HOW LONG THIS SQUAD WAS HELD TODAY. `_why = 'fighting'` is a per-tick label
                   and the recorder snapshots once a day, so by nightfall it has been written
                   over by whatever they did next — a viewer keyed to it would draw the marker
                   never. Blocks held accumulate across the day and survive to the snapshot. */
                sq._heldToday = (sq._heldToday || 0) + fightTicks;
                /* `_fightFrom` was written here for the arrival step to read LATER and the
                   cross-step audit flagged it as write-only within a minute — one write, zero
                   readers, exactly the fault this project keeps producing, committed by the
                   person who had just been complaining about it. State earns its place when
                   something reads it. The arrival step can add it then. */
              }
            }
            /* The contest resolves. Whoever broke contact runs — a real distance, not a
               notional one — and whoever held may chase. Standing on the same ground after
               a firefight is what stretched a 3v3 across a month of skirmishing. */
            const broke = {};
            const m = /^disengage_(.+)$/.exec(res.result);
            if (m) { for (const tag of m[1].split('')) broke[tag] = true; }
            if (m && m[1] === 'both') for (const g of groups) broke[String.fromCharCode(65 + groups.indexOf(g))] = true;
            for (let gi = 0; gi < groups.length; gi++) {
              const tag = String.fromCharCode(65 + gi);
              const g = groups[gi];
              const lost = broke[tag] || (m && m[1] === 'both');
              for (const sq of g) {
                const dx = sq.x - mx, dy = sq.y - my;
                const len = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
                if (lost) {
                  /* Breaking contact is also measured against the room that is left. On the
                     open disc a beaten squad runs a long way; inside the final circle there
                     is nowhere to run to, and ordering the run anyway is what pinned losers
                     to the wall for the rest of the Divide. */
                  const roomNow = MAP.zoneOn(planet, day).r;
                  const run = Math.min(CONST.BREAK_DISTANCE * (0.8 + rng() * 0.5),
                                       roomNow * CONST.WITHDRAW_RUN_FRAC);
                  const p = MAP.clampInside(planet, day, sq.x + (dx / len) * run, sq.y + (dy / len) * run);
                  sq.x = p.x; sq.y = p.y;
                  const cornered = roomNow <= planet.radius * CONST.CORNERED_ZONE_FRAC;
                  sq.intent = cornered ? null
                    : { type: 'withdraw', tx: sq.x + (dx / len) * run,
                        ty: sq.y + (dy / len) * run, expires: day + CONST.WITHDRAW_DAYS };
                  sq.restUntil = day + CONST.REST_DAYS_LOSER;
                } else {
                  sq.restUntil = day + CONST.REST_DAYS_WINNER;
                  const pursuit = C.STANCE[sq.corp.policy].pursuit;
                  const chase = pursuit === 'always' ? 0.85 : pursuit === 'aggressive' ? 0.6
                              : pursuit === 'yes' ? 0.35 : pursuit === 'if_free' ? 0.15 : 0;
                  if (rng() < chase) {
                    const beaten = groups.find((h, hi) => broke[String.fromCharCode(65 + hi)]);
                    if (beaten && beaten[0]) {
                      sq.intent = { type: 'strike', role: 'fix', targetSquad: beaten[0],
                                    targetCorp: beaten[0].corpId, tx: beaten[0].x, ty: beaten[0].y,
                                    sx: sq.x, sy: sq.y, strikeDay: day,
                                    expires: day + CONST.PURSUE_DAYS };
                      sq.restUntil = day;
                      stats.audit.pursuits = (stats.audit.pursuits || 0) + 1;
                    }
                  }
                }
              }
            }
            rec({ t: 'fight', x: mx, y: my, corps: order, squads: party.length, night: !!night,
                  ex: t.exchanges, band: res.band, res: res.result, terrain,
                  lost: (stats.dead - recBefore.d) + (stats.careerEnded - recBefore.c),
                  obj: objectiveValue > 0, forced: !!forced, flank: flanked.some(Boolean) });
            if (stats.dead === before.d && stats.injured === before.i && stats.careerEnded === before.c) {
              stats.zeroCasualtyEngagements++;
            }
          }
        }
      }

      /* --- objective claim clocks (§9) --- */
      const tickedToday = new Set();
      /* Emptying a crate takes a tick or two, not two days, and a rival standing on it
         interrupts the work rather than freezing a claim clock. */
      for (const sq of liveSquads()) {
        let o = null;
        for (const cand of planet.objectives) {
          if (!MAP.siteLive(cand, day)) continue;
          if (MAP.dist(sq.x, sq.y, cand.x, cand.y) <= MAP.CONST.CLAIM_RADIUS) { o = cand; break; }
        }
        if (!o || sq.foughtToday) { sq.claiming = null; continue; }
        const rival = liveSquads().some(s => s.corpId !== sq.corpId &&
          MAP.dist(s.x, s.y, o.x, o.y) <= MAP.CONST.CLAIM_RADIUS);
        if (rival) { sq.claiming = o.id; o.work = {}; continue; }
        const key = sq.corpId + ':' + sq.sIdx;
        o.work[key] = (o.work[key] || 0) + 1;
        sq.claiming = o.id;
        if (o.work[key] >= MAP.CONST.LOOT_TICKS) {
          awardObjective(rng, sq, o, stats);
          o.work = {};
          sq.claiming = null;
        }
      }


        /* Only the daylight ticks are worth recording: nothing moves after dark, and six
           duplicate points a squad a day doubles the replay for nothing. */
        if (REC && !night) for (const q of liveSquads()) {
          if (!q._track) q._track = [];
          q._track.push(Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000);
        }
      }

      /* The wall again, at dusk. Reforms, consolidations and deaths all move bodies around
         during a day; the ruling is that outside the line does not exist, so it is enforced
         at both ends rather than nearly-enforced at one. */
      for (const c of corps) for (const sq of c.squads) {
        if (!sq.bodies.length) continue;
        const p = MAP.clampInside(planet, day, sq.x, sq.y);
        sq.x = p.x; sq.y = p.y;
      }

      /* --- NIGHT: camp --- */
      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        camp(rng, c, sq, squadHooks(sq), stats);
        if (!sq.foughtToday) addStress(sq, CONST.STRESS.quietDay, stats);
        if (sq._successions) { stats.audit.successions += sq._successions; sq._successions = 0; }
      }

      /* --- THE CORP CHANNEL: negotiation (NEGOTIATION.md §11) ---
             Deals happen only in a corp comms window, on air, and never through a drop
             leader — a field commander interprets standing orders and nothing else. The
             cadence is the map's, not the calendar's, so as the ring closes the table opens
             daily, which is exactly when there is something to talk about. */
      if (!opts.noNegotiation && day % MAP.windowCadence(planet, day) === 0) {
        if (runCorpChannel(rng, corps, planet, day, stats, opts) === true) break;
      }

      /* --- reform: a spent squad is broken up and its survivors SPREAD across the corp's
             other squads, two here and two there, rather than dumped whole on the nearest.
             Only at a comms window, and only if the others are close enough to reach. --- */
      if (day % MAP.windowCadence(planet, day) === 0) {
        for (const c of corps) {
          const alive = c.squads.filter(q => squadHead(q).length > 0);
          if (alive.length < 2) continue;
          for (const q of alive) {
            const n = squadHead(q).length;
            if (n === 0 || n >= CONST.REFORM_AT) continue;
            const hosts = alive.filter(o => o !== q && squadHead(o).length >= CONST.REFORM_AT
              && MAP.dist(q.x, q.y, o.x, o.y) <= CONST.CONSOLIDATE_RANGE)
              .sort((a, b) => squadHead(a).length - squadHead(b).length);
            if (!hosts.length) continue;
            const movers = q.bodies.slice();
            const share = q.rations / Math.max(1, hosts.length);
            movers.forEach((b, i) => {
              const host = hosts[i % hosts.length];
              host.bodies.push(b);
              host.stress = Math.max(host.stress, q.stress);
            });
            for (const h of hosts) h.rations += share;
            q.bodies = []; q.rations = 0; q.intent = null;
            stats.audit.reforms = (stats.audit.reforms || 0) + 1;
            rec({ t: 'reform', x: q.x, y: q.y, c: c.id, n, into: hosts.length });
          }
        }
      }

      /* --- §7.3 stance: EVERY corp picks its approach for the next couple of days ---
             At the corp window, free, every time. Not "a few corps rethink" — all of them
             choose, which is what a turn-by-turn dial means. */
      /* `stanceFixed` pins the notch for the whole Divide. Nothing in the game does this —
         it exists so a test can still isolate what a notch DOES, now that no corp holds one.
         Measuring "a preservationist corp" against "a death_or_glory corp" over a Divide is
         no longer a meaningful thing to do without it, because neither exists. */
      if (stats.halted) break;
      if (day % MAP.windowCadence(planet, day) === 0) {
        const board = NEG.oddsBoard(umbrellasOf(corps), {
          meanEngagements: corps.reduce((a, c) => a + c.engagements, 0) / Math.max(1, corps.length)
        });
        const zNow = MAP.zoneOn(planet, day);
        const penned = zNow.r <= planet.radius * CONST.CORNERED_ZONE_FRAC;
        if (!opts.stanceFixed) for (const c of corps) {
          /* the corp a person is holding is NOT re-stanced by its own AI — that is the whole
             point of the window. Everybody else's squad leaders reorganise as they always did. */
          if (c.id === opts.human) continue;
          const mine = board[principalOf(c).id] || 0;
          reconsiderStance(rng, c, stats, { penned: penned, ahead: mine > 0.28 });
        }

        /* THE WINDOW. Comms are up; this is where a manager speaks to their people and to the
           other banners. Yielding here rather than at a fixed number of days is deliberate: the
           cadence is the planet's, tightening from two days to one as the ring closes, and a
           player's rhythm has to be the same one the fleet is on. */
        if (opts.human) {
          const you = corps.filter(c => c.id === opts.human)[0];
          /* WHAT IS ON THE TABLE. Priced by `offerRange` and `evaluateOffer` — the same
             functions the AI is scored by, which is why they were split out in the first place.
             A parallel valuation for the human would be a second game. */
          const nctx = makeNegContext(rng, corps, planet, day, stats);
          const table = { canJoin: [], wouldTake: [], pacts: [] };
          if (you && !you.joinedTo && !you.disqualified && !sealed(you)) {
            for (const u of umbrellasOf(corps)) {
              if (u.principal.id === principalOf(you).id) continue;
              if (sealed(u.principal)) continue;
              const range = NEG.offerRange(you, u.principal, nctx);
              /* VIABILITY IS SHOWN, not hidden. Where `joinerMin` exceeds `principalMax` there
                 is no number both sides would sign, and offering a manager a row they can never
                 close is the same as a button that does nothing. `band` is what they can
                 actually offer between. */
              if (range) table.canJoin.push({
                principal: u.principal.id, range: range, odds: board[u.principal.id] || 0,
                viable: range.gain > 0 && range.joinerMin <= range.principalMax,
                band: range.expectedTake > 0
                  ? { minShare: range.joinerMin / range.expectedTake,
                      maxShare: range.principalMax / range.expectedTake } : null });
            }
          }
          /* and who would come in under YOUR banner, if you offered them terms */
          for (const other of corps) {
            if (other.id === opts.human || other.joinedTo || other.disqualified) continue;
            if (sealed(other)) continue;
            const range = NEG.offerRange(other, you, nctx);
            if (range) table.wouldTake.push({
              corp: other.id, range: range, odds: board[other.id] || 0,
              viable: range.gain > 0 && range.joinerMin <= range.principalMax,
              band: range.expectedTake > 0
                ? { minShare: range.joinerMin / range.expectedTake,
                    maxShare: range.principalMax / range.expectedTake } : null });
          }
          for (const other of corps) {
            if (other.id === opts.human || other.disqualified) continue;
            if (pactHolds(you, other, day)) continue;
            /* A PACT IS ASKED FOR BY THE WEAKER SIDE, and the gate has more to it than that —
               how far apart the odds are, and how much the other house cares. Asked of
               `negotiate.js`, which owns the rule, rather than re-derived here: two descriptions
               of one rule agree until somebody edits one of them. */
            const pv = NEG.pactViability(you, other, nctx);
            table.pacts.push({ corp: other.id, live: false,
                               viable: pv.possible, chance: pv.p, why: pv.why || null });
          }

          /* everything your people were in since the last window — handed over once, then
             cleared, so the list is "what happened while you were away" rather than a log that
             grows all contest and is re-read every time. */
          const since = stats._fights || [];
          stats._fights = [];

          const answer = yield {
            kind: 'window', day: day, lastDay: MAP.CONST.LAST_GROUND_DAY,
            fights: since,
            cadence: MAP.windowCadence(planet, day),
            odds: board, penned: penned, zone: zNow, table: table,
            corps: corps, stats: stats, planet: planet, you: you
          };
          /* what came back: a stance, and any deals the manager chose to answer */
          if (answer && answer.stance) {
            const you = corps.filter(c => c.id === opts.human)[0];
            /* NOT gated on `sealed`. That flag means a house refuses to NEGOTIATE — a permanent
               cultural thing held in the profile — and §7.3 is explicit that no corp is ever
               locked out of any notch and that culture is not a stance. Guarding the dial with
               it silently pinned Nevlon and every other no-negotiation house to whatever they
               dropped with, which is the exact conflation the ruling was written to end. It
               gates the negotiation half of the window below, where it belongs. */
            if (you) {
              const idx = NOTCHES.indexOf(answer.stance);
              if (idx >= 0) {
                if (you.policy !== answer.stance) you.stanceChanges++;
                you.policy = answer.stance;
                for (const q of you.squads) q.policy = answer.stance;
              }
            }
          }

          /* THE NEGOTIATION HALF. The comment above claimed this existed for two steps and it
             did not: only `answer.stance` was ever read, so a manager could be handed a window
             and had nothing to say in it but a notch. Prose describing work that was not done.

             `sealed` gates HERE, and only here — a house that refuses to negotiate is a
             cultural fact and not a stance, and gating the dial with it pinned every
             no-negotiation house to whatever it dropped with. */
          const you2 = corps.filter(c => c.id === opts.human)[0];
          if (answer && answer.deal && you2 && !sealed(you2)) {
            const d = answer.deal;
            const nctx2 = makeNegContext(rng, corps, planet, day, stats);
            if (d.kind === 'join' && !you2.joinedTo) {
              /* you cede your banner to somebody. Scored by the principal, not granted. */
              const principal = corps.filter(c => c.id === d.principal)[0];
              if (principal && !sealed(principal) && principalOf(principal).id !== principalOf(you2).id) {
                const verdict = NEG.evaluateOffer(you2, principal, d.terms || {}, nctx2);
                if (verdict && verdict.accepted) {
                  const deal = verdict.deal;
                  you2.joinedTo = principalOf(principal).id;
                  you2.terms = deal; you2.standDown = !!deal.standDown; you2.joinedOnDay = day;
                  (principal._dealsAsPrincipal = principal._dealsAsPrincipal || []).push(deal);
                  stats.deals.push(deal); stats.joins = (stats.joins || 0) + 1;
                  if (deal.standDown) stats.standDowns = (stats.standDowns || 0) + 1;
                  stats.audit.humanJoins = (stats.audit.humanJoins || 0) + 1;
                } else if (verdict) stats.audit.humanRefused = (stats.audit.humanRefused || 0) + 1;
              }
            } else if (d.kind === 'take') {
              /* somebody comes in under YOUR banner on terms you set */
              const joiner = corps.filter(c => c.id === d.corp)[0];
              if (joiner && !joiner.joinedTo && !sealed(joiner)) {
                const verdict = NEG.evaluateOffer(joiner, you2, d.terms || {}, nctx2);
                if (verdict && verdict.accepted) {
                  const deal = verdict.deal;
                  joiner.joinedTo = principalOf(you2).id;
                  joiner.terms = deal; joiner.standDown = !!deal.standDown; joiner.joinedOnDay = day;
                  (you2._dealsAsPrincipal = you2._dealsAsPrincipal || []).push(deal);
                  stats.deals.push(deal); stats.joins = (stats.joins || 0) + 1;
                  if (deal.standDown) stats.standDowns = (stats.standDowns || 0) + 1;
                  stats.audit.humanTakes = (stats.audit.humanTakes || 0) + 1;
                } else if (verdict) stats.audit.humanRefused = (stats.audit.humanRefused || 0) + 1;
              }
            } else if (d.kind === 'pact') {
              const other = corps.filter(c => c.id === d.corp)[0];
              if (other && !sealed(other)) {
                const pact = NEG.considerPact(rng, you2, other, nctx2);
                if (pact) {
                  you2._pacts = you2._pacts || {}; other._pacts = other._pacts || {};
                  const until = day + NEG.CONST.PACT_DAYS[1];
                  you2._pacts[other.id] = until; other._pacts[you2.id] = until;
                  stats.audit.humanPacts = (stats.audit.humanPacts || 0) + 1;
                }
              }
            }
          }
        }
      }

      if (REC) {
        const sq = [];
        for (let ci = 0; ci < corps.length; ci++) {
          const c = corps[ci];
          for (let si = 0; si < c.squads.length; si++) {
            const q = c.squads[si];
            const alive = squadHead(q).length;
            const demand = Math.max(0.001, rationDemand(q, raceById) * planet.supplyStrain);
            /* `ax`,`ay` — where this squad is heading, which is also what it is facing.
               `tr`, the route already walked, is kept because the replay guard compares
               whole recordings, but a viewer should draw the aim: where somebody has been is
               a straight line between two points they are no longer at. */
            sq.push({ c: ci, s: si,
                      x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000,
                      ax: q._aim ? Math.round(q._aim.x * 1000) / 1000 : null,
                      ay: q._aim ? Math.round(q._aim.y * 1000) / 1000 : null,
                      w: q._why || 'drift', n: alive,
                      st: Math.round(q.stress),
                      rat: Math.round(Math.min(30, q.rations / demand)),
                      g: q.crates, cl: q.claiming ? 1 : 0,
                      hb: q._heldToday || 0,        /* two-hour blocks spent in a firefight */
                      jn: q._joinedToday ? 1 : 0,   /* walked into one already in progress */
                      tr: q._track || [] });
          }
        }
        REC.days.push({
          d: day,
          z: (function () { const z = MAP.zoneOn(planet, day);
                return { cx: Math.round(z.cx * 1000) / 1000, cy: Math.round(z.cy * 1000) / 1000,
                         r: Math.round(z.r * 1000) / 1000 }; })(),
          zn: (function () { const n = MAP.zoneNext(planet, day);
                return n && n.fromDay === day + 1
                  ? { cx: Math.round(n.cx * 1000) / 1000, cy: Math.round(n.cy * 1000) / 1000,
                      r: Math.round(n.r * 1000) / 1000 } : null; })(),
          sq,
          obj: planet.objectives.filter(o => o.revealed).map(o => ({
                 x: Math.round(o.x * 1000) / 1000, y: Math.round(o.y * 1000) / 1000,
                 h: o.heldBy, t: o.type, lbl: o.label })),
          corp: corps.map(c => ({
            e: c.engagements, p: c.allBodies.filter(b => b.status === 'dead' || b.status === 'retired').length,
            a: c.allBodies.filter(b => b.status === 'active').length,
            w: c.allBodies.filter(b => b.status === 'injured').length,
            o: c.oreCredit, si: c.sitesClaimed, st: c.policy,
            sd: Math.round(standing(c) * 100)
          })),
          ev: dayEvents
        });
      }

      /* --- termination (N18) --- */
      /* ONE ending. A Divide is over when exactly one banner is left standing, and a banner
         stands while any one of its people is on their feet. The Aleas never calls time,
         never weighs anything, and never declares a winner on points — the ring does it.

         What this replaces: a day-30 stop with nothing adjudicated, plus a `contesting <= 1`
         guard that counted a corp out at four bodies. Four was always arbitrary; two
         survivors are still a banner, and on the last ground they will not be two for long.

         OVERTIME_MAX is a rail. Reaching it means the last ground failed to force a result,
         which is a fault in its radius or in the three suspensions above — not a licence to
         adjudicate. It is recorded loudly and asserted in `regress`. */
      /* NB: not `standing` — that is the module-level function for a corp's crowd standing,
         and shadowing it here put the whole day loop in its temporal dead zone. The fault
         only fired on the replay path, which the suite did not exercise. */
      const bannersLeft = bannersStanding(corps);
      stats.bannersStanding = bannersLeft.size;
      if (bannersLeft.size <= 1) { stats.winner = bannersLeft.size ? Array.from(bannersLeft)[0] : null; break; }
      if (day >= MAP.CONST.LAST_GROUND_DAY + OVERTIME_MAX) {
        stats.overtimeExhausted = true;
        stats.winner = null;
        break;
      }
    }

    const corpIds = corps.map(c => c.id);

    /* --- N10: captives left to the whims of their captor -------------------------------
       Anyone still held when the shooting stops. Killed, released, or kept — leaned by who
       is holding them, not rolled flat. `kept` transfers the fighter to the captor on their
       existing contract, which is the second mechanism in the project that moves a developed
       person between corps without money changing hands. */
    stats.captiveOutcomes = { released: 0, kept: 0, killed: 0 };
    for (const owner of corps) {
      for (const f of owner.allBodies) {
        if (f.status !== 'captured') continue;
        const captor = corps.find(c => c.id === f._capturedBy) || null;
        const out = captor ? NEG.resolveCaptive(rng, captor, owner, f) : 'released';
        stats.captiveOutcomes[out]++;
        if (out === 'killed') f.status = 'dead';
        else if (out === 'released') f.status = 'injured';
        else { f.status = 'active'; f._transferredTo = captor ? captor.id : null; }
        /* REPUTATION.md §3.1 — what a captor did with someone else's people is the single
           thing that rival's supporters care about most. */
        if (captor && captor.rep) {
          REP.act(captor.rep,
                  out === 'killed' ? 'killed_captives' : out === 'released' ? 'released_captives'
                                                       : 'kept_captive',
                  { targetId: owner.id, rivalIds: corpIds });
        }
        /* And your own ships judge whether you got yours home. */
        if (out === 'killed' && owner.rep) {
          REP.act(owner.rep, 'abandoned_ours', { targetId: captor ? captor.id : null,
                                                 rivalIds: corpIds });
        }
      }
    }

    /* --- §3.1 the ledger of the dead ---------------------------------------------------
       Counted once, at the end, with the famous counted separately: a favourite's death
       swings an audience at triple weight, and until now fame had no reader but ransom. */
    for (const c of corps) {
      if (!c.rep) continue;
      let ourDead = 0, ourFamous = 0;
      for (const b of c.allBodies) {
        if (b.status !== 'dead') continue;
        ourDead++;
        if ((b.fame || 0) >= REP.CONST.FAME_CEIL * 0.35) ourFamous++;
      }
      if (ourDead) REP.act(c.rep, 'our_dead', { count: ourDead, famous: ourFamous });
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
      if (!c.joinedTo && !c.disqualified
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
      /* a truce kept to its end, per rival — the counterpart to breaking one */
      for (const other of corps) {
        if (other === c) continue;
        if ((c._pactsSigned || {})[other.id] && !(c.pactsBroken && c._pactBrokeWith === other.id)) {
          REP.act(c.rep, 'kept_truce', { targetId: other.id });
        }
      }
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
      if (!c.joinedTo && (c._offersReceived || 0) >= 2 && !(c._dealsAsPrincipal || []).length) {
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
      const alive = c.allBodies.some(b => b.status === 'active' || b.status === 'injured');
      recordFall(stats, c.id, c._downedOn || stats.days || 30, alive ? 'standing' : 'wiped');
    }
    /* §7.4 — what each corp actually dug out, by name. The assay bank was a single credit
       figure; the sites carry a resource now, so what comes home can be counted in the thing
       itself, which is what a board demand is written against. */
    stats.banked = {};
    for (const c of corps) stats.banked[c.id] = {};
    for (const o of planet.objectives) {
      if (o.type !== 'ore_assay' || !o.looted || !o.lootedBy || !o.resource) continue;
      const cat = MAP.resourceCategory(o.resource);
      if (!cat || !stats.banked[o.lootedBy]) continue;
      const b = stats.banked[o.lootedBy];
      b[cat] = (b[cat] || 0) + Math.round(o.potency || 1);
      b[o.resource] = (b[o.resource] || 0) + Math.round(o.potency || 1);
    }

    const dq = (stats.fallen || []).filter(f => f.how === 'disqualified').map(f => f.id);
    const fellIds = (stats.fallen || [])
      .filter(f => f.how !== 'disqualified')
      .sort((a, b) => a.day - b.day).map(f => f.id);
    stats.placement = REP.placements(fellIds, stats.winner, dq, corps.length);

    /* --- §3.1 the finish, and the planet ----------------------------------------------- */
    for (const c of corps) {
      if (!c.rep) continue;
      const place = stats.placement[c.id];
      if (place != null) {
        REP.act(c.rep, 'finished', { count: Math.max(0, corps.length - place) });
      }
      if (stats.winner === c.id) REP.act(c.rep, 'won_planet', { rivalIds: corpIds });
    }

    /* --- §10.3 settlement --------------------------------------------------------------
       The pot lands on the last banner standing, the umbrella settles down the chain, the
       assay banks pay out whatever happened, and the winner pays its own people. Nothing
       here decides anything: the winner was decided by the last fighter left standing. */
    let unclaimedAssay = 0;
    for (const o of planet.objectives) {
      if (o.type === 'ore_assay' && !o.looted) unclaimedAssay += Math.round(o.potency || 1);
    }
    stats.settlement = NEG.settle(rng, corps, {
      pot: planet.pot.value, winnerId: stats.winner,
      deals: stats.deals, unclaimedAssay: unclaimedAssay
    });

    for (const pc of stats.perCorp) {
      const c = corps.find(x => x.id === pc.id);
      pc.dropped = c.allBodies.length;
      pc.policy = c.policy;
      pc.oreCredit = c.oreCredit;
      pc.sitesClaimed = c.sitesClaimed;
      pc.stress = c.squads.reduce((s, q) => s + q.stress, 0) / c.squads.length;
      pc.captured = c.allBodies.filter(b => b.status === 'captured').length;
      /* Step 6 — what the Divide was worth to them. */
      pc.payout = stats.settlement.take[c.id] || 0;
      pc.won = stats.winner === c.id;
      pc.joinedTo = c.joinedTo;
      pc.standDown = !!c.standDown;
      pc.crowdHit = c.crowdHit || 0;
      pc.ransomPaid = c.ransomPaid || 0;
      pc.ransomTaken = c.ransomTaken || 0;
      pc.disqualified = !!c.disqualified;
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

  const api = { CONST, STANCE_DIALS, preparedness, loudnessOf, STANCE_STANDING, NOTCHES, standing, prestigeOf, DEFAULT_RIGIDITY, STANCE_OVERRIDE, runDivide, divideCore, buildCorp, liveSquad, openCrate, principalOf, allied, bannersStanding, umbrellasOf, sealedCorp: sealed };
  if (isNode) module.exports = api;
  global.CDDIVIDE = api;
})(typeof window !== "undefined" ? window : globalThis);
