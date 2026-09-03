/* sim/combat.js — Combat v1 (Step 3b)
 *
 * Implements COMBAT.md v0.2 (ratified). Pure logic: no DOM, no Math.random, no I/O.
 * Every rng draw comes from the injected generator, so a seed reproduces a Divide exactly.
 *
 * Entry points:
 *   makeCombatant(fighter, opts)                 -> per-engagement combat state
 *   (the engagement resolver lives in tactical.js; this file is the library it calls)
 *
 * EVERY tunable number lives in CONST below, keyed to its COMBAT.md section. Balancing
 * is an edit to that block, never surgery on the logic. Constants tagged:
 *   [S] structure   [C] calibrated to a §13 target   [H] handle for the balance pass
 */

const CONST = {
  /* §3.3 exchange loop */
  EXCHANGE_CAP: 12,                       // [C]
  STALEMATE_EXCHANGES: 7,                 // [C] consecutive scoreless exchanges before both break off

  /* §3.4 actions */
  AMMO: { shot: 1, suppress: 3, overwatch: 1 },        // [S]
  LOADOUT_AMMO: 16,                       // [C] NEW in v1 — COMBAT.md v0.3 should adopt this
  LOADOUT_RATE_CAP: 1.5,                  // [C] a fast weapon is issued more, but not unboundedly
  LOADOUT_BELT: 6,                        // [C] what a belt-fed weapon carries beyond a magazine
  SUPPRESS_WEIGHT: 0.18,                  // [C]
  OVERWATCH_WEIGHT: 0.06,                 // [C]

  /* COMPOSITION.md §4 — TEMPO. Shots per fighter per exchange.
   *
   * Until Step 7.5 every weapon in the game fired exactly once per fighter per exchange, so a
   * railgun at power 12 fired as often as a carbine at power 5 and was simply better. Reach
   * was then the only axis left separating weapons, which is why five wildly different squad
   * compositions measured 0.13 casualties apart: there was nothing else to be different about.
   *
   * A fraction banks across exchanges, so 0.5 means every other one. Where a weapon carries
   * more than one rate tag the fastest wins — a burst suppressive weapon is a fast weapon.
   * `spool` is NOT a rate: the catalog says it cannot fire on the first exchange of contact,
   * and that is what it does. It was carrying a rate value in the draft table and would have
   * been charged twice for one drawback.
   */
  TEMPO: { single_shot: 0.5, burst: 2.0, suppressive: 1.6, suppressive_2: 2.4 },
  TEMPO_DEFAULT: 1.0,                     // [S]
  TEMPO_AIM: 5.0,                         // [C] aim swing between the most deliberate and the loosest
  TEMPO_PIERCE: 1.6,                      // [C] protection a deliberate weapon defeats, per point under rate

  /* §3.5 shot resolution */
  HIT_SLOPE: 0.04,                        // [C]
  HIT_BASE: 0.38,                         // [C] at aim_eff 10 — raised from 0.30 in Step 3b (see report)
  HIT_MIN: 0.04, HIT_MAX: 0.72,           // [C]
  /* WHAT YOUR EXPOSURE DOES TO A SHOT AT YOU. The open case used to be 1.00, which made it the
     CEILING: cover only ever subtracted, so catching a body in the open was worth nothing in
     itself and the very best a flank could do was claw back to ordinary. That is backwards. A
     man with nothing in front of him should be a windfall, and it is the reason to spend an
     action going somewhere — the movement scorer was not malfunctioning, it was correctly
     reading a game in which moving bought about six points of hit chance for a whole action.
     Measured across 500 fights on identical seeds, walking this from 1.00 to 1.60: fights that
     ran out the clock 64 -> 28, body-turns containing a move 42.6% -> 49.0%, mid-fight movement
     up about a quarter, and the season's permanent losses flat, because fights end sooner and
     the shots saved pay for the shots that land. This is a chosen number, not a derived one:
     1.85 was better on every measure and was rejected because a body caught in the open at
     close range reached 93% and had no answer left. At 1.60 that worst case is 80%. */
  COVER_MULT: [1.60, 0.70, 0.45, 0.28],   // [S] open / light / heavy / hard
  /* §3.2 cover is a SCARCE POSITIONAL RESOURCE, not a per-fighter attribute. The ground
     offers a fixed set of firing positions by grade; fieldcraft decides who gets the good
     ones. Profiles give the share of positions at each grade. [S] */
  COVER_PROFILES: {
    open_basin:    [0.55, 0.35, 0.10, 0.00],
    broken_ground: [0.25, 0.45, 0.25, 0.05],
    forest:        [0.20, 0.50, 0.28, 0.02],
    ruins:         [0.14, 0.34, 0.36, 0.16],
    entrenched:    [0.10, 0.25, 0.40, 0.25]
  },
  COVER_POSITIONS_PER_FIGHTER: 1.6,       // [C] slack in the pool — room to move, not room for everyone
  COVER_IMPROVE_P: 0.75,                  // [C] chance the take-cover action lands a better slot
  COVER_SUPPRESSED_DEGRADE_P: 0.12,       // [C] sustained fire chips a position down a grade
  MOTION_HOLD: 1.00, MOTION_REPOS: 1.15, MOTION_HOVER: 1.35,   // [S]
  SPOT_UNSPOTTED: 0.50, SPOT_OVERWATCH: 1.40,                  // [S]
  /* TRIED AND REMOVED: making a body on overwatch easier to hit, so that holding an arc cost
     something. It did what it said — watching fell from 99.8% of body-turns to 37% — and it did
     NOT reduce bunkering. Across a range of 1.15 to 3.00 the share of body-turns containing a
     move stayed flat at about 49%, and fights got marginally longer. The reason is worth
     keeping: the movement scorer never knew overwatch existed, so reaction fire was never
     deterring anybody. It was damage arriving, not a tax being weighed. Removing a tax nobody
     was paying attention to changes nothing. See PROJECT.md. */
  /* Aim for a shot taken before the other side knows where you are. DECLARED HERE, WHERE IT
     IS READ. It was first written into `tactical.js`'s constants beside the rest of the fog
     work, which reads well and is wrong: `aimEff` lives in this file and would have resolved
     it to `undefined`, so `a += undefined` makes the whole hit chance NaN and `rng() < NaN`
     is false every time. Every concealed shot would have missed, silently, and fog would have
     measured as a penalty — the project has already lost a courting delay to exactly this and
     `audit_cross` was given a check for undeclared reads because of it. */
  UNSPOTTED_AIM: 3,                                            // [H]
  BAND_HIT_MULT: [0.80, 1.00, 1.32],      // [C] §3.2 long / medium / short
  BAND_SEV_BONUS: [-7, 0, 6],             // [C] §3.2 lethality by band
  BAND_COMP_DRAIN: [0, -1, -2],           // [C] §3.2 "composure collapses fast" at short
  BAND_SHIFT_AGREED: 0.38,                // [C] both sides want the same range
  BAND_SHIFT_CONTESTED: 0.24,             // [C] winner of the contest moves it

  /* COMPOSITION.md §5.2 — CLOSING AND OPENING ARE DIFFERENT ACTS.
   *
   * The contest above was a symmetric tug-of-war, and the equilibrium of a symmetric tug-of-war
   * is the midpoint: measured, a long squad against a short squad settled at medium 58% of the
   * time. Nobody could impose a band on an unwilling enemy, so nothing was ever swarmed and
   * nothing was ever picked off from a ridge, and reach — the only axis separating weapons —
   * did nothing. You can cross ground if you are willing to be shot at while you do it; you
   * cannot reliably back away, because breaking contact under fire exposes you.
   */
  BAND_OPEN_UNDER_FIRE: 0.35,             // [C] how badly backing away goes while being shot at
  /* And crossing costs the exchange. Without this line closing is free and the short build
     loses to nothing at all. The ground decides how survivable it is, which is what makes the
     planet a counter to a composition through the terrain system that already exists. */
  CROSS_EXPOSURE: 1.30,                   // [C] motion penalty while crossing
  CROSS_COST_P: { open_basin: 0.95, broken_ground: 0.70, forest: 0.55,
                  ruins: 0.50, entrenched: 0.62 },   // [C] chance a crosser loses the exchange
  /* §5.1 — a pinned squad does not cross ground. This is the half that turns suppression from
     a small aim debuff into the thing the machine gun exists for. */
  SUPPRESS_PIN: 1.0,                      // [S] share of a suppressed unit's push that is lost

  /* COMPOSITION.md §6 — tags that were declared, priced, sold, and inert. */
  DISORIENT_COMP: -8,                     // [C] composure a disorienting hit costs beyond the wound
  ARC_CHAIN_FRAC: 0.5,                    // [C] what the second body in the arc takes
  RICOCHET_P: 0.25,                       // [C] chance a miss finds somebody else
  MOB_STEP: 1,                            // [S] what mob_up / mob_down move a weapon's mobility by

  BAND_CLOSE_BIAS: 1.55,                  // [C] closing is marginally easier than opening under fire
  BAND_MISMATCH_PENALTY: 1.5,             // [S] per band off optimal — softened from 2 in Step 3b
  /* A SPECIALIST IS SPECIALISED. On the grid, fights settle toward medium, so a medium-band
     weapon is in its element about half the time whatever happens while a long or short weapon
     is in its element only when it wins the argument about range. Measured, that put the three
     medium rifles in the top three places of the league — battle rifle 11-0 — with a balanced
     squad fourth, and it is a property of the CATEGORY rather than of any weapon in it.
     A generalist should be ok all the time; a specialist should be good sometimes and bad
     sometimes, and this is what pays for the sometimes. Medium weapons get nothing: never
     being out of your element also means never being in it. */
  BAND_SPECIALIST_BONUS: 2.5,             // [C] aim, for a long or short weapon at its own band
  /* [C] AND THE SHORT SHELF IS PAID MORE FOR THE SAME THING, because it is not the same thing.
     A long weapon begins the fight in its own band — contact is made at range and it simply
     stands there. A short weapon has to CROSS GROUND under fire to reach its band, spend a
     dash to get there, give up its cover doing it and draw overwatch twice on the way.
     Measured across 200 fights a cell on two agreeing populations, the range triangle is real
     but lopsided: being the longer weapon at long contact was worth about 0.26 casualties a
     fight, being the shorter weapon at short contact only about 0.14. The reward should match
     the work, and the work is not symmetric. */
  BAND_SPECIALIST_SHORT: 1.35,             // [C] multiplier on the bonus at short band
  SUSTAINED_CAP: 2,                       // [C] most that walking your fire onto one mark is worth
  /* [C] Ratified at 4. Halved to 2 at Step 7.5 on the reasoning that suppression was winning
     fights by itself rather than buying ground — measured on the ABSTRACT model, which is not
     the engagement model, at a sample size that could not have told the difference either way.
     Re-measured properly on the grid by the only test that asks the right question of an
     enabler — does ADDING one improve a squad — it was worth -0.111 casualties a fight at 2
     and +0.004 at 4, over 225 fights a cell across two populations. 6 is no better than 4.
     The original number was right and the change was wrong twice over: wrong resolver, and
     underpowered. */
  SUPPRESSED_AIM_PENALTY: 4,
  SUPPRESSED_HARDER_TO_HIT: 0.85,         // [C]
  NIGHT_AIM_PENALTY: 2,                   // [OPEN-C1] proposed

  /* §3.6 severity */
  SEV_POWER_MULT: 1.15,                   // [H] C12: retuned again in v1.2 (2 → 1.4 → 1.15)
  SEV_PROTECTION_MULT: 1.90,              // [H] C12: retuned again in v1.2 (3 → 2.0 → 1.65)
  SEV_GRIT_DIVISOR: 2,                    // [H]
  SEV_BANDS: { graze: 40, light: 70, serious: 88, critical: 94.2 },  // [C] >critical = killed outright

  /* --- THE WOUND POOL (ruled) ---
     A hit used to roll once and land in one of five outcomes with no memory between hits, so a
     single roll could remove somebody and a firefight had no middle. A pool gives armour and
     stats somewhere to live and gives the "two more and he is out" decision the genre is built
     on.
     DAMAGE IS DERIVED FROM THE SEVERITY ROLL THAT ALREADY HAPPENS. It draws no random number of
     its own, deliberately: adding a draw would shift the stream and every fixed-seed fight in
     the suite with it, and the roll already carries weapon power, the range band, armour
     protection, resistance against this damage type, the target's grit and every quirk. There
     is nothing left for a second roll to add except noise.
     Sized so an ordinary solid hit takes two to three: the pool is grit-scaled around
     `HP_BASE`, and a roll landing just past a graze does about a fifth of it. */
  /* Sized against what it replaces rather than by taste. The bands put 4.30 people down a
     fight; this pool empties 1.93 times, which is deliberately fewer — a single serious hit
     used to remove somebody outright and now takes about two, which is the middle a firefight
     did not have. It also pulls on the loss rate, which is sitting at 42.6% of everyone who
     drops against a ruling of about a quarter; the two are the same problem and are tuned
     together rather than one at a time. */
  HP_BASE: 7,                     // [H] a body's wound pool before grit
  HP_PER_GRIT: 0.35,              // [H] what being hard to put down is worth
  DMG_PER_POINT: 6,               // [H] severity points above a graze per point of damage
  DMG_MIN: 1,                     // [S] a hit that lands does something
  HP_OVERKILL: 5,                 // [H] past empty, the round did not merely put them down
  /* [H] the chance a downed fighter is stabilised rather than dying, by the round that dropped
     them. Worn down by grazes and they are nearly always carried out; opened up by a critical
     and it is close to even. Half the deaths in the game come through here. */
  RECOVER_BY_SEV: { graze: 0.94, light: 0.90, serious: 0.78, critical: 0.60, killed: 0.45 },

  /* §3.7 downed */
  BLEED_SERIOUS: 6, BLEED_CRITICAL: 3,    // [C] exchanges
  TREAT_BASE: 0.35, TREAT_MEDKIT: 0.15, TREAT_TRAIT: 0.15, TREAT_FIELDCRAFT: 0.02,  // [C]
  /* MEDKIT_RATE deleted at Step 5b-2: whether a squad has medical kit is no longer a
     coin flip, it is whether somebody bought one and is carrying it (PROCUREMENT.md §10). */

  /* §4 composure */
  COMP_BASE: 30, COMP_MORALE: 0.20, COMP_RESOLVE: 2.0,          // [C]
  COMP_STRESS: 0.20,   // [C] persistent stress costs composure: at the cap of 100 it costs
                       //     what a serious wound costs (-20) — the fought-out break sooner.
                       //     Zero at zero, so a fresh world's fights are untouched.
  XP_CAP: 18, XP_DIVIDE: 5, XP_BATTLE: 1.0, XP_DIVIDEND: 2,     // [C]
  COMP: {                                                        // [C] §4.2
    suppressed: -6, mateDown: -8, bondDown: -25, captainDown: -12,
    graze: -3, light: -10, serious: -22, flanked: -5, ammoOut: -10,
    nearMiss: -1.2, quiet: +4, cover: +7, enemyDown: +5
  },
  COMP_BANDS: { steady: 70, shaken: 45, rattled: 25 },           // [S]
  AIM_PENALTY_BY_BAND: { steady: 0, shaken: 1, rattled: 3, broken: 5 },  // [S]
  ROUT_SLOPE: 0.018, ROUT_MAX: 0.60, ROUT_THRESHOLD: 25,         // [C] aligned to §4.3's broken band
  /* §6 energy weapons: heat inside the fight, charge across the day. A ballistic weapon
     is limited by supply; an energy weapon is limited by tempo. */
  HEAT_SHED: 2,                           // [S] per exchange the weapon does not fire
  HEAT_SUPPRESS_MULT: 3,                  // [S] holding an arc down is what cooks a laser
  VENT_EXCHANGES: 1,                      // [S] 2 with the vent_2 quirk
  /* §10 consumables — single use, each a real action in the exchange, not a modifier. */
  GRENADE_POWER: 7,                       // [C] frag; incendiary adds its quirk on top
  GRENADE_TARGETS: 3,                     // [S] up to three in band
  GRENADE_WEIGHT: 0.22,                   // [H] how readily a fighter reaches for one
  GRENADE_LAND_P: 0.50,                   // [C] per target, before cover: it is thrown, not aimed
  GRENADE_COVER_P: 0.16,                  // [C] each grade of cover this much less likely to matter
  SMOKE_EXCHANGES: 2,                     // [S] how long a screen lasts
  STIM_COMPOSURE: 25,                     // [C]
  /* §10 `deploy` — a turret is not a body: it shoots, it cannot be routed, it is not a
     casualty and it does not count toward a squad breaking. A drone does not shoot at all;
     it takes the dark away from the people you are shooting at. */
  TURRET_EXCHANGES: 4,                    // [S]
  TURRET_AIM: 9,                          // [C] steady, unimaginative, never flinches
  TURRET_COVER: 1,                        // [C] emplaced, but a machine that cannot duck.
                                          //     At hard cover nothing but an EMP could kill
                                          //     one, which made it a consumable with no
                                          //     counter — 2.60 inflicted against 1.40.
  TURRET_HP: 2,                           // [C] hits it takes before it stops working
  TURRET_TARGET_P: 0.40,                  // [C] share of fire that goes at the gun instead
                                          //     of the people — it is the loudest thing there
  TURRET_EMP_MULT: 3,                     // [S] §4.2 `emp`: built to kill machines
  DRONE_EXCHANGES: 4,                     // [S] how long the sky stays lit
  /* REMOVED in the Step 6 audit: SIDEARM_TIER_FLOOR. Declared, never read. */
  MOTION_AIM_RECOVERY: 2,                 // [C] what `stabilized` gives back when firing on the move
  WITHDRAW_ROUT_MULT: 0.62,               // [C] a called withdrawal is not a rout — bounding, not scattering
  CAPTAIN_STEADY_MAX: 0.72,               // [C] floor on the multiplier a standing captain can apply

  /* §5 rout / capture */
  ROUT_SQUAD_FRACTION: 0.40,              // [C] squad breaks when this share has routed
  CAPTURE_P: { preservationist: 0.15, measured: 0.15, standard: 0.08, unyielding: 0.03, death_or_glory: 0.00 },

  /* §8.1 (DIVIDE.md) captain judgment — replaces the deleted policy notch table.
     `own_down` is a COUNT, so HOLD_BASE is calibrated up from the spec's 1.4. */
  BASE_COVER_BIAS: 0.35,                  // [C] was POLICY.coverBias; now flat (D1)
  CAP_THREAT_DOWN: 1.0,                   // [C] per own fighter down
  CAP_THREAT_COMPOSURE: 3.0,              // [C] × (1 − avg composure/100)
  CAP_THREAT_AMMO: 2.0,                   // [C] × dry fraction
  CAP_THREAT_RATIONS: 1.0,                // [C] starving squads leave sooner
  CAP_THREAT_ENEMY_DOWN: 0.35,            // [C] subtracted; 0.6 cancelled own losses in symmetric fights
  CAP_HOLD_BASE: 1.9,                     // [C] see note above; tuned against the real day loop
  CAP_HOLD_TACTICS: 0.10,                 // [C] judgment accuracy, not stubbornness
  RECOVERY_BASE_P: 0.72,                  // [C] eagerness to go to a downed squadmate
  TREAT_EXPOSURE_MULT: 1.30,              // [S] §3.7 worse than open ground; see hitChance

  /* §7 injuries */
  UNTREATED_DEGRADE_DAYS: 3,              // [S]
  SPINAL_PERMANENT_P: 0.55,               // [C]
  WING_SPAR_PERMANENT_P: 0.20,            // [C]

  /* §8 racial */
  MONWA_TETHER_COMP: -25,                 // [S]
  THYTHYN_HOVER_P: 0.22,                  // [C] share of Thythyn repositions that hover
  GIL_GOGGLE_DAMAGE_P: 0.40,              // [S] on head-location hit
  GIL_GOGGLE_AIM_PENALTY: 5,              // [S]
  ATTORAK_INTENSITY_COMP: 4,              // [S]
  ETU_DEVOUT_COMP: 8, ETU_ZEALOT_COMP: 15,// [S]

  /* §9 gear */
  DEFAULT_WEAPON: { power: 5, range: 'medium', tier: 3 },        // [C] tier-3 median kit
  DEFAULT_ARMOR: { protection: 3 },                              // [C]
  GEAR_TIER_ACCURACY: 0.50                                       // [S] per tier from 3 (1 → 0.6 → 0.50)
};

/* DIVIDE.md §7.2 — declared stance governs fight SELECTION in the day loop. What survives
   inside the firefight is two nudges and pursuit, and nothing else (D1).
   `recoveryUrgency` = exchanges before someone goes to a downed squadmate. Death-or-glory
   goes back FASTEST (D2): that mentality carries strong bonds of kinship. Their wounded
   still die more often because they are the squad still standing there when it collapses,
   and losing your wounded is a consequence of being overrun (§3.7), not of indifference. */
const STANCE = {
  preservationist: { holdNudge: -0.30, recoveryUrgency: 2, pursuit: 'if_free'    },
  measured:        { holdNudge: -0.15, recoveryUrgency: 2, pursuit: 'if_free'    },
  standard:        { holdNudge:  0.00, recoveryUrgency: 2, pursuit: 'yes'        },
  unyielding:      { holdNudge: +0.25, recoveryUrgency: 2, pursuit: 'aggressive' },
  death_or_glory:  { holdNudge: +0.45, recoveryUrgency: 2, pursuit: 'always'     }
};
/* back-compat alias: callers still say squad.policy */
const POLICY = STANCE;

const BANDS = ['long', 'medium', 'short'];

/* §7.1 general injury table (d100 upper bounds) */
const INJURY_TABLE = [
  [18, 'inj_arm'], [36, 'inj_leg'], [52, 'inj_torso'], [62, 'inj_head'],
  [72, 'inj_internal'], [82, 'inj_burns'], [90, 'inj_chest'], [96, 'inj_spinal'], [100, 'inj_catastrophic']
];
/* §7.2 Thythyn wing table */
const WING_TABLE = [[40, 'inj_wing_tear'], [72, 'inj_wing_strut'], [92, 'inj_wing_spar'], [100, 'inj_wing_loss']];

const RECOVERY = { minor: [5, 15], serious: [20, 60], critical: [45, 120], permanent: [120, 240] };

/* ------------------------------------------------------------------ */
/* Combatant construction                                              */
/* ------------------------------------------------------------------ */

function hooksOf(fighter, traitIndex) {
  const h = new Set();
  for (const tid of (fighter.traits || [])) {
    const t = traitIndex && traitIndex[tid];
    if (!t) continue;
    for (const hook of ((t.effects && t.effects.hooks) || [])) h.add(hook);
  }
  return h;
}

/* §4.1 composure seed */
function seedComposure(f, hooks, opts) {
  const xp = f.experience || {};
  const experienceBonus = Math.min(
    CONST.XP_CAP,
    CONST.XP_DIVIDE * (xp.divides || 0) + CONST.XP_BATTLE * (xp.battles || 0) + CONST.XP_DIVIDEND * (xp.dividends || 0)
  );
  let c = CONST.COMP_BASE
    + CONST.COMP_MORALE * ((f.condition && f.condition.morale) || 50)
    + CONST.COMP_RESOLVE * (f.stats.resolve / 10)   /* roster-scale caller */
    + experienceBonus
    /* the third reader of the one store: what a career of Divides has left in a person
       walks into every fight with them */
    - CONST.COMP_STRESS * ((f.condition && f.condition.stress) || 0);

  /* §11.1 composure hooks */
  if (hooks.has('composure_bonus')) c += 10;
  if (hooks.has('seen_worse_composure')) c += 12;
  if (hooks.has('first_engagement_surge') && opts.firstEngagement) c += 15;
  if (hooks.has('early_divide_penalty') && opts.day <= 7) c -= 8;
  if (hooks.has('late_divide_bonus') && opts.day >= 15) c += 8;
  if (opts.rookieSupport && (xp.divides || 0) < 1) c += 8;   // mentor's rookie_composure_support
  if (f.race === 'etu') {
    if ((f.traits || []).includes('et_y_bellum_zealot')) c += CONST.ETU_ZEALOT_COMP;
    else if ((f.traits || []).includes('et_y_bellum_devout')) c += CONST.ETU_DEVOUT_COMP;
  }
  c += opts.captainBonus || 0;
  return clamp(Math.round(c), 5, 100);
}

function makeCombatant(fighter, opts) {
  opts = opts || {};
  const hooks = hooksOf(fighter, opts.traitIndex);
  /* PROCUREMENT.md §3 — a fighter's kit is resolved from the catalog at equip time and
     carried on loadout.kit. The defaults below are the pre-catalog field and remain the
     fallback for harnesses and probes that build combatants without a loadout. */
  const kit = fighter.loadout && fighter.loadout.kit ? fighter.loadout.kit : null;
  const weapon = kit ? Object.assign({}, kit.weapon, { tags: kit.tags || [] })
                     : (fighter.loadout && fighter.loadout.weapon) || CONST.DEFAULT_WEAPON;
  const armor = kit ? kit.armor : (fighter.loadout && fighter.loadout.armor) || CONST.DEFAULT_ARMOR;
  return {
    ref: fighter, id: fighter.id, race: fighter.race,
    /* ×10 migration: roster stats live at ten times the founding scale; combat's whole
       formula body was written for the old one, so the unit takes a DIVIDED COPY at this
       one boundary — one seam instead of thirty swept constants, and float-exact while
       births are multiples of ten. The roster object is never touched. */
    /* STEP D — EFFECTIVE AIM: the hand and the trade, averaged. The weapon carries its
       skillFamily (stamped at resolve, one home in items.js); a fighter without skills, or
       a weapon without a trade, reads as pure aim — so fixtures and defaults are
       untouched. */
    stats: { aim: (fighter.stats.aim +
                   (weapon.skillFamily && fighter.skills &&
                    fighter.skills[weapon.skillFamily] != null
                      ? fighter.skills[weapon.skillFamily] : fighter.stats.aim)) / 2 / 10,
             /* a rested body walks on harder, and a settled one steadier — both spent here */
             grit: (fighter.stats.grit +
                    ((fighter._conditioned && fighter._conditioned.grit) || 0)) / 10,
             reflex: fighter.stats.reflex / 10, fieldcraft: fighter.stats.fieldcraft / 10,
             tactics: fighter.stats.tactics / 10, presence: fighter.stats.presence / 10,
             resolve: (fighter.stats.resolve +
                       ((fighter._conditioned && fighter._conditioned.resolve) || 0)) / 10 }, hooks,
    /* the wound pool, carried but not yet deciding anything — see `damageOf` */
    hpMax: hpFor(fighter), hp: hpFor(fighter),
    weapon, armor,
    state: 'ok',                 // ok | light | down | stable | dead | captured | routed
    comp: seedComposure(fighter, hooks, opts),
    cover: 1,                    // overwritten by initCover() at engagement start
    pos: -1,                     // index into the side's cover pool
    /* WHAT THE QUARTERMASTER ISSUES. This was a flat 16 for every weapon in the game, which
       was harmless while everything fired once a turn and became a serious distortion the
       moment tempo existed: measured, a machine gunner ran dry 32.5 times a fight and half
       the squad finished on pistols, while a marksman rifle ran dry 0.7 times. The gun whose
       entire job is sustained fire was the one that could not sustain it.
       A weapon is issued ammunition in proportion to how fast it eats it. That is not a
       balance patch, it is what a quartermaster does. */
    ammo: loadoutFor(weapon) + (hooks.has('carry_bulk_up_2') ? 6 : 0),
    /* §6 — an energy weapon carries its own resources; a ballistic one leaves these at 0
       and the whole heat path is skipped. */
    /* §10 — carried consumables, spent once each. */
    carried: (kit && kit.consumables) ? kit.consumables.map(x => x.id) : [],
    heat: 0, heatCap: (kit && kit.heatCap) || 0, heatPerShot: (kit && kit.heat) || 0,
    _heatShed: CONST.HEAT_SHED, _firedThisExchange: false,
    /* §6 — charge is the fighter's, not the engagement's: it persists across every fight
       in a day and only comes back at camp. Ammunition, by contrast, currently refills
       between engagements (see [OPEN-P11]) — so the supply half of the contrast is not
       modelled yet and the tempo half is. */
    charge: (fighter._charge != null ? fighter._charge : (kit && kit.charge) || 0),
    chargeMax: (kit && kit.charge) || 0, venting: 0,
    sidearm: (kit && kit.sidearm) || null, primary: null, onSidearm: false,
    fatigue: (fighter.condition && fighter.condition.fatigue) || 0,
    suppressed: false, spotted: true, hovering: false, repositioning: false,
    bleed: null, wounds: [], gogglesBroken: false,
    isCaptain: !!opts.isCaptain, pair: null,
    _compDelta: 0
  };
}

/* ------------------------------------------------------------------ */
/* §6 energy resources · §7 the sidearm fallback                       */
/* ------------------------------------------------------------------ */

function isEnergy(u) { return u.heatCap > 0; }

/** Can this fighter fire their PRIMARY this exchange? */
function primaryReady(u) {
  if (u.venting > 0) return false;
  if (isEnergy(u)) return u.charge > 0;
  return u.ammo >= ammoCost(u, CONST.AMMO.shot);
}

/**
 * §7 — the sidearm answers exactly three failures: dry, venting, damaged. Never otherwise.
 * Swapping is not free: it costs the exchange's aim, which is why a sidearm is a hedge
 * rather than a second primary.
 */
function useSidearm(u) {
  if (!u.sidearm || u.onSidearm) return false;
  u.primary = u.weapon;
  u.weapon = Object.assign({}, u.sidearm, { tags: u.sidearm.tags || [] });
  u.onSidearm = true;
  u._justSwapped = true;
  return true;
}
function backToPrimary(u) {
  if (!u.onSidearm || !u.primary) return;
  u.weapon = u.primary; u.primary = null; u.onSidearm = false;
}

  /* Removed at this step: spendConsumable, pairSync, preferredBand, bandMobility, claimRandom, initCover, downedUnits — defined here and called from nowhere in the tree.
     They are the last of the abstract band resolver cut at Step 8.9, plus one movement
     helper in `tactical.js` whose docstring described behaviour the live scorer does by
     an entirely different method a thousand lines away. A change was made to that dead
     one, measured at no effect, and the no-effect was read as the mechanism not
     mattering rather than as the code not running. `audit_cross` looks for uncalled
     functions now, so the next one is caught before somebody edits it. */


/** Spend the shot. Returns false if the weapon could not fire at all. */
function spendShot(u, kind) {
  const mult = kind === 'suppress' ? CONST.HEAT_SUPPRESS_MULT : 1;
  if (isEnergy(u) && !u.onSidearm) {
    const h = u.heatPerShot * mult;
    if (u.charge <= 0) return false;
    u.charge -= (hasQuirk(u, 'heavy_draw') ? 2 : 1);
    u.heat += h;
    if (u.heat >= u.heatCap) {
      u.heat = 0;
      u.venting = hasQuirk(u, 'vent_2') ? 2 : CONST.VENT_EXCHANGES;
      u._ventJustSet = true;          /* do not tick it down in the same exchange it began */
      u._vented = (u._vented || 0) + 1;
    }
    return true;
  }
  const cost = ammoCost(u, kind === 'suppress' ? CONST.AMMO.suppress
                         : kind === 'overwatch' ? CONST.AMMO.overwatch : CONST.AMMO.shot);
  if (u.ammo < cost) return false;
  u.ammo -= cost;
  return true;
}

/** Between exchanges: bleed heat off, tick the vent down, come off the sidearm. */
function coolWeapons(side) {
  for (const u of side.units) {
    if (!isEnergy(u)) continue;
    if (u._ventJustSet) u._ventJustSet = false;         /* it begins now; it costs next exchange */
    else if (u.venting > 0) u.venting--;
    else if (!u._firedThisExchange) u.heat = Math.max(0, u.heat - (u._heatShed || CONST.HEAT_SHED));
    if (u.onSidearm && primaryReady(u)) backToPrimary(u);
    u._firedThisExchange = false;
  }
}

/* ------------------------------------------------------------------ */
/* §3.5 shot resolution                                                */
/* ------------------------------------------------------------------ */

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

/* ==================================================================== */
/* WEAPON QUIRKS — PROCUREMENT.md §4.2                                  */
/* ==================================================================== */
/* ONE table, deliberately. Twenty-six quirks sprinkled through hitChance and
   resolveSeverity as inline conditionals is exactly how §11 ended up with seventeen trait
   hooks that were declared and never read. Every quirk lives here, in the phase it acts on,
   and `arx.cjs` asserts that every quirk in items.json appears in this table.

   Phases:
     aim(q, c, bandIdx, ctx)         -> number added to aim_eff
     cover(q, shooter, target, idx)  -> new cover index for the target
     sev(q, shooter, target, band)   -> number added to the severity roll
     onMiss(q, ...)                  -> side effects when a shot misses
   A quirk may implement any subset. Absent phase = no effect in that phase. */
const QUIRK = {
  /* --- aim --- */
  /* The catalog's own words: "At short band the target's cover counts one grade worse; at
     long, aim_eff -3." The aim half read the engagement band correctly. The cover half read
     `bandOf(s)` — the shooter's WEAPON band — which is `short` for every weapon that carries
     spread, so the condition was always true and a shotgun ignored a grade of cover from
     across the map. It measured 8-1 in the league and this is most of why. */
  spread: { aim: (c, b) => b === 0 ? -3 : 0,
            cover: (s, t, i, b) => (b === 2 ? Math.max(0, i - 1) : i) },
  stabilized: { aim: (c, b, ctx) => c.repositioning ? CONST.MOTION_AIM_RECOVERY : 0 },
  /* Capped at two, not three. In the abstraction "the same side" changed often enough for a
     cap of three to be an achievement; on a grid, keeping your fire on one person is easy and
     the tag became a flat, unconditional +3 aim — better than the specialist bonus and with
     none of the conditions. What is cheap to achieve is worth less. */
  sustained: { aim: (c, b, ctx) => Math.min(CONST.SUSTAINED_CAP, c._sustain || 0) },
  smart_link: { aim: (c, b) => bandMismatch(c, b) },              /* refunds the whole penalty */
  min_band_medium: { aim: (c, b) => b === 2 ? -99 : 0 },          /* cannot engage at short */
  single_shot: {},                                                 /* handled in the action loop */
  spool: {},                                                       /* handled in the action loop */
  recoil_heavy: { aim: (c) => c._movedLast ? -2 : 0 },
  burst: {},                                                       /* handled in the action loop */

  /* --- cover --- */
  cover_shred: { onMiss: (rng, shooter, target, side) => degradeCover(side, target) },
  /* `ricochet` claimed a call site that did not exist. A miss looks for somebody else. */
  ricochet: { onMiss: (rng, shooter, target, enemySide) => {
    if (rng() >= CONST.RICOCHET_P) return;
    const others = enemySide.units.filter(u => u !== target && (u.state === 'ok' || u.state === 'light'));
    if (others.length) others[Math.floor(rng() * others.length)]._ricochetHit = true;
  } },

  /* --- severity --- */
  pierce_1: { sev: (s, t) => Math.round(CONST.SEV_PROTECTION_MULT * Math.min(1, effectiveProtection(s, t))) },
  pierce_2: { sev: (s, t) => Math.round(CONST.SEV_PROTECTION_MULT * Math.min(2, effectiveProtection(s, t))) },
  pierce_3: { sev: (s, t) => Math.round(CONST.SEV_PROTECTION_MULT * Math.min(3, effectiveProtection(s, t))) },
  flechette: { sev: (s, t) => (t.armor.protection || 0) <= 1 ? 6 : (t.armor.protection || 0) >= 4 ? -6 : 0 },
  incendiary: { sev: () => 8 },
  disorient: {},                                                   /* composure, applied on hit */
  chill: {},                                                       /* movement, applied on hit */
  emp: {},                                                         /* nothing mechanical to hit yet */
  arc_chain: {},                                                   /* second target, at the call site */
  area: {},                                                        /* multi-target, at the call site */

  /* --- declared, no effect until their system exists --- */
  suppressive: {}, suppressive_2: {}, silent: {}, crowd_pleaser: {},
  mobile_cover: {}, daylight: {}, vent_2: {}, heavy_draw: {}, nonlethal: {},
  mob_up: {}, mob_down: {}
};

/**
 * WHAT THE QUARTERMASTER ISSUES.
 *
 * Flat 16 for everything until Step 7.5, which was harmless while every weapon fired once a
 * turn. Scaling it straight off rate of fire then overshot in the other direction: the Drum
 * Shotgun came out at 32 rounds — twice a carbine, more than a belt-fed machine gun — because
 * `burst` doubles the multiplier, while measured it spent a median of 9 and ran dry in 0% of
 * fights. A weapon's RATE is what it could fire; what it actually spends depends on how much
 * of the fight it can shoot at all, and a short-range weapon spends most of one out of band.
 *
 * So the rate multiplier is capped, and the one thing that genuinely eats ammunition on this
 * resolver gets its own allowance: a suppressive weapon is belt-fed and spends three rounds
 * every time it holds an arc down. Sized against MEASURED consumption — issue near the 90th
 * percentile of what the weapon actually gets through, so a long fight leaves you scraping and
 * an ordinary one does not.
 */
function loadoutFor(weapon) {
  const t = Math.max(0.5, Math.min(CONST.LOADOUT_RATE_CAP, tempoOf({ weapon: weapon })));
  const tags = weapon.tags || [];
  const belt = (tags.indexOf('suppressive') >= 0 || tags.indexOf('suppressive_2') >= 0)
             ? CONST.LOADOUT_BELT : 0;
  return Math.round(CONST.LOADOUT_AMMO * t) + belt;
}

function bandOf(c) { return BANDS.indexOf(c.weapon.range || 'medium'); }

/* Verbose-only: what this fighter chose to do, so a viewer can step one BODY at a time
   instead of one exchange at a time. Costs nothing when verbose is off. */
let _actLog = null, _actExchange = 0;
function act(u, S, what) {
  if (!_actLog) return;
  _actLog.push({ exchange: _actExchange, type: 'act', significance: 0, actors: [u.id],
                 side: S.tag, act: what, actorName: (u.ref || {}).name,
                 weapon: (u.weapon || {}).name || (u.weapon || {}).id || 'unarmed',
                 comp: Math.round(u.comp), cover: u.cover, state: u.state,
                 suppressed: !!u.suppressed,
                 ammo: isEnergy(u) && !u.onSidearm ? null : u.ammo,
                 charge: isEnergy(u) && !u.onSidearm ? u.charge : null });
}

/* COMPOSITION.md §4 — how often this weapon fires, and what it earns for firing rarely.
   Per the Step 7.5 ruling: a deliberate weapon's compensation is ACCURACY and ARMOUR, not
   damage. Measured, walking a half-rate rifle from power 6 to power 10 — most of the
   catalog's whole range — bought back a quarter of the gap, because severity has diminishing
   returns and volume compounds: more shots is more chances to wound, more composure checks
   forced, more suppression applied, more cover chipped. You cannot buy participation back
   with damage. So the marksman's rifle beats the rock somebody is behind and the plate they
   are wearing, which is the fiction anyway. */
function tempoOf(c) {
  let t = null;
  for (const q of quirksOf(c)) {
    const v = CONST.TEMPO[q];
    if (v != null) t = t == null ? v : Math.max(t, v);
  }
  return t == null ? CONST.TEMPO_DEFAULT : t;
}
/** Deliberate weapons aim better; spraying weapons aim worse. Centred on the default rate. */
function tempoAim(c) {
  return CONST.TEMPO_AIM * (CONST.TEMPO_DEFAULT - tempoOf(c));
}
/** And they defeat protection, which is the other half of "hits when others cannot". */
function tempoPierce(shooter, target) {
  const under = CONST.TEMPO_DEFAULT - tempoOf(shooter);
  if (under <= 0) return 0;
  const bite = Math.min(under * CONST.TEMPO_PIERCE, effectiveProtection(shooter, target));
  return Math.round(CONST.SEV_PROTECTION_MULT * bite);
}
/** §8 — protection as this shooter's damage type actually meets it. */
function effectiveProtection(shooter, target) {
  const t = (shooter.weapon && shooter.weapon.damage) || 'ballistic';
  const r = (target.armor.resist && target.armor.resist[t]) || 0;
  return Math.max(0, (target.armor.protection || 0) + r);
}
function quirksOf(c) { return (c.weapon && c.weapon.tags) || []; }
function hasQuirk(c, q) { return quirksOf(c).indexOf(q) >= 0; }

function quirkAim(c, bandIdx, ctx) {
  let a = 0;
  for (const q of quirksOf(c)) { const h = QUIRK[q]; if (h && h.aim) a += h.aim(c, bandIdx, ctx) || 0; }
  return a;
}
/* `bandIdx` is the ENGAGEMENT band — where the fight is actually happening. It was not passed
   at all, so `spread` fell back to asking what band the shooter's own weapon liked, which for
   a shotgun is `short` and therefore always true. The one tag in the game that ignores cover
   was ignoring it at every distance, on every shot, for every weapon carrying it. */
function quirkCover(shooter, target, idx, bandIdx) {
  let i = idx;
  for (const q of quirksOf(shooter)) { const h = QUIRK[q]; if (h && h.cover) i = h.cover(shooter, target, i, bandIdx); }
  return i;
}
function quirkSev(shooter, target, bandIdx) {
  let s = 0;
  for (const q of quirksOf(shooter)) { const h = QUIRK[q]; if (h && h.sev) s += h.sev(shooter, target, bandIdx) || 0; }
  return s;
}
function degradeCover(side, target) {
  if (!side || !side.pool || target.cover == null || target.cover <= 0) return;
  target.cover = Math.max(0, target.cover - 1);
}



/* §11.1 ammo_consumption_down / _up */
function ammoCost(u, base) {
  let m = 1;
  if (u.hooks.has('ammo_consumption_down')) m *= 0.75;
  if (u.hooks.has('ammo_consumption_up')) m *= 1.35;
  return Math.max(1, Math.round(base * m));
}

function compBandOf(c) {
  if (c.comp >= CONST.COMP_BANDS.steady) return 'steady';
  if (c.comp >= CONST.COMP_BANDS.shaken) return 'shaken';
  if (c.comp >= CONST.COMP_BANDS.rattled) return 'rattled';
  return 'broken';
}

function bandMismatch(c, bandIdx) {
  if (c.race === 'thythyn') return 0;                       // no_range_band_penalty (ratified)
  const optimal = BANDS.indexOf(c.weapon.range || 'medium');
  const off = Math.abs(optimal - bandIdx);
  /* in your own element, and your element is not the one every fight drifts into */
  if (off === 0 && optimal !== 1) {
    return -CONST.BAND_SPECIALIST_BONUS * (optimal === 2 ? CONST.BAND_SPECIALIST_SHORT : 1);
  }
  return off * CONST.BAND_MISMATCH_PENALTY;
}

function aimEff(c, bandIdx, ctx) {
  let a = c.stats.aim;
  if (c.hooks.has('accuracy_bonus')) a += 2;
  if (ctx.squadLink) a += 1;                                          // Gil psion_squad_link
  if (c.hooks.has('first_strike_bonus') && ctx.exchange === 1) a += 3;
  /* Shooting before they know where you are. The grid sets this when the target's side has
     neither eyes on the shooter nor a recent shot to look toward; nothing else passes it, so
     an abstract-model caller is unaffected. Sized against `first_strike_bonus` above, which
     is +3 for a closely related reason, rather than picked to hit a casualty figure. */
  if (ctx.unseen) a += CONST.UNSPOTTED_AIM;
  if (c.hooks.has('first_shot_long_range_bonus') && ctx.exchange === 1 && bandIdx === 0) a += 4;
  a += Math.round(CONST.GEAR_TIER_ACCURACY * ((c.weapon.tier || 3) - 3) * 10) / 10;
  if (c.hooks.has('optics_gear_synergy')) a += 1;
  a -= bandMismatch(c, bandIdx);
  a += quirkAim(c, bandIdx, ctx);                     /* PROCUREMENT.md §4.2 */
  a += tempoAim(c);                                   /* COMPOSITION.md §4 */
  if (c.suppressed) a -= CONST.SUPPRESSED_AIM_PENALTY;

  const cb = compBandOf(c);
  const kellisNerve = c.hooks.has('aim_bonus_under_pressure') && cb !== 'broken';
  if (!kellisNerve) a -= CONST.AIM_PENALTY_BY_BAND[cb];

  a -= Math.min(3, Math.floor(c.fatigue / 25));
  if (c.state === 'light') a -= 1;
  if (c.gogglesBroken) a -= CONST.GIL_GOGGLE_AIM_PENALTY;
  if (ctx.night && !c.hooks.has('night_encounter_bonus')) a -= CONST.NIGHT_AIM_PENALTY;
  return a;
}

function hitChance(shooter, target, bandIdx, ctx, overwatch) {
  const base = clamp(CONST.HIT_SLOPE * (aimEff(shooter, bandIdx, ctx) - 10) + CONST.HIT_BASE, CONST.HIT_MIN, CONST.HIT_MAX);
  let coverIdx = target.cover;
  if (target._bulwarked) coverIdx = Math.min(3, coverIdx + 1);        // Olmac walking_bulwark
  if (target.hovering) coverIdx = Math.max(0, coverIdx - 1);            // hover ignores a step of cover
  if (target.exposed) coverIdx = Math.max(0, coverIdx - 1);             // §3.4: you have to lean out to shoot
  if (target.flanked) coverIdx = Math.max(0, coverIdx - 1);             // §3.2b: cover faces one way
  if (target.treating) coverIdx = 0;                                    // §3.7: no cover at all
  coverIdx = quirkCover(shooter, target, coverIdx, bandIdx);            /* §4.2 spread */
  let m = CONST.COVER_MULT[coverIdx];
  m *= target.hovering ? CONST.MOTION_HOVER
     : target._crossed ? CONST.CROSS_EXPOSURE                    /* COMPOSITION.md §5.2 */
     : (target.repositioning ? CONST.MOTION_REPOS : CONST.MOTION_HOLD);
  if (!target.spotted) m *= CONST.SPOT_UNSPOTTED;
  if (overwatch) m *= CONST.SPOT_OVERWATCH;
  /* `overwatch_fatigue_immune` — a long-watch sentry does not lose their edge holding it.
     Declared in traits.json since Step 2 and read by nothing until the Step 6 audit. */
  if (overwatch && shooter.hooks.has('overwatch_fatigue_immune')) m *= 1.12;
  if (target.suppressed) m *= CONST.SUPPRESSED_HARDER_TO_HIT;
  if (target.hooks.has('bombardment_evasion_bonus') && overwatch) m *= 0.70;
  m *= CONST.BAND_HIT_MULT[bandIdx];
  /* §3.7 Going to a downed man is the most dangerous thing in a firefight — WORSE than
     simply standing in the open. You are not shooting, so nothing is keeping their heads
     down, and you are moving fast rather than carefully. */
  if (target.treating) m *= CONST.TREAT_EXPOSURE_MULT;
  return clamp(base * m, 0.005, 0.95);
}

/** How much punishment this body can take before it goes down. */
function hpFor(fighter) {
  /* ×10 migration: called with the ROSTER fighter, before the unit's divided copy exists,
     so grit normalizes here. This was the reader the gate's slowness named: tenfold grit
     made tenfold hit points, and every fight in the world ran to the turn cap.
     `_conditioned` is a month's rest spent on somebody with nothing to mend — it rides
     beside the stats rather than in them, and it is spent in this Divide. */
  const cond = (fighter._conditioned && fighter._conditioned.grit) || 0;
  const grit = (((fighter.stats && fighter.stats.grit) || 100) + cond) / 10;
  return Math.round(CONST.HP_BASE + CONST.HP_PER_GRIT * grit);
}

/** What a severity roll costs in wounds. No RNG of its own — see `HP_BASE` above. */
function damageOf(roll) {
  return Math.max(CONST.DMG_MIN,
                  Math.round((roll - CONST.SEV_BANDS.graze) / CONST.DMG_PER_POINT));
}

/* §3.6 severity → outcome */
function resolveSeverity(rng, shooter, target, policy, bandIdx, vlog, exchange) {
  /* Continuous, not d100. The integer roll quantised the outcome bands so coarsely that
     one point of SEV_BANDS.critical moved the killed-outright rate by twelve points —
     wider than the target band itself, so T4 was unreachable at ANY integer value.
     The bands read the same; they are simply now tunable at the resolution they need. */
  const d = rng() * 100;
  let roll = d;
  const band = CONST.BAND_SEV_BONUS[bandIdx == null ? 1 : bandIdx];
  roll += band;
  roll += Math.round(CONST.SEV_POWER_MULT * (shooter.weapon.power || 0));
  /* §8 — armour is three numbers, not one. Plate stops bullets and conducts heat; an
     ablative harness boils a beam away and cracks under a rifle. A squad in one kind of
     vest has an answer to one kind of enemy. */
  const dmgType = (shooter.weapon && shooter.weapon.damage) || 'ballistic';
  const resist = (target.armor.resist && target.armor.resist[dmgType]) || 0;
  const effProt = Math.max(0, (target.armor.protection || 0) + resist);
  roll -= Math.round(CONST.SEV_PROTECTION_MULT * effProt);
  roll -= Math.floor(target.stats.grit / CONST.SEV_GRIT_DIVISOR);
  if (target.hooks.has('injury_severity_risk_up')) roll += 10;
  /* AMBUSH INSTINCT — "The first volley is theirs. It usually decides the rest."
     This read `!target.spotted`, which is a fact about whether the SHOOTER has found the
     target — so as written it paid out for firing blindly at somebody whose position you did
     not have, which is the opposite of what the trait says and the worse shot of the two. It
     never paid out at all, because nothing wrote `spotted`; but had the flag ever started
     moving it would have rewarded the wrong thing. The same miswiring already recorded against
     Trigger Itch, which was hooked to widen a spread that the guns carrying it do not have.
     `_unseen` is set by the grid around the shot: the shooter is the one nobody has placed. */
  if (shooter.hooks.has('unspotted_open_fire_bonus') && shooter._unseen) roll += 12;
  const qs = quirkSev(shooter, target, bandIdx)                         /* §4.2 */
           + tempoPierce(shooter, target);                             /* COMPOSITION.md §4 */
  roll += qs;
  /* casualty_scalar deleted (DIVIDE.md §7.2). Declared stance does not touch lethality;
     the ladder comes from how many fights a corp goes looking for. `policy` is retained
     in the signature only so the pursuit call site reads the same as the main one. */

  const B = CONST.SEV_BANDS;
  /* carried on the target so `applyHit` can charge the wound pool from the same roll rather
     than drawing a second one. Read there and nowhere else. */
  target._sevRoll = roll;
  const out = roll <= B.graze ? 'graze' : roll <= B.light ? 'light'
            : roll <= B.serious ? 'serious' : roll <= B.critical ? 'critical' : 'killed';
  if (vlog) vlog.push({ exchange, type: 'severity', significance: 0, actors: [target.id],
    math: { d100: d, band, power: Math.round(CONST.SEV_POWER_MULT * (shooter.weapon.power || 0)),
            protection: -Math.round(CONST.SEV_PROTECTION_MULT * effProt), damage: dmgType, resist: resist,
            grit: -Math.floor(target.stats.grit / CONST.SEV_GRIT_DIVISOR), quirks: qs,
            total: roll, result: out } });
  return out;
}

/* ------------------------------------------------------------------ */
/* Composure                                                           */



/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

function active(sq) { return sq.units.filter(u => u.state === 'ok' || u.state === 'light'); }
function avgComp(sq) { const a = active(sq); return a.length ? a.reduce((s, u) => s + u.comp, 0) / a.length : 0; }

/* DIVIDE.md §8.1 — the captain reads the fight. Replaces the deleted policy notch table.
   Tactics buys ACCURACY OF JUDGMENT, not stubbornness: a high-tactics captain breaks when
   the fight is actually lost, a low-tactics one breaks on panic or far too late. */
function captainReadsFight(S, E, ctx) {
  const a = active(S);
  const downs = S.units.filter(u => u.state === 'down' || u.state === 'dead').length;
  const enemyDowns = E.units.filter(u => u.state === 'down' || u.state === 'dead').length;
  const dry = a.length ? a.filter(u => u.ammo < CONST.AMMO.shot).length / a.length : 1;

  const threat = CONST.CAP_THREAT_DOWN * downs
    + CONST.CAP_THREAT_COMPOSURE * (1 - avgComp(S) / 100)
    + CONST.CAP_THREAT_AMMO * dry
    + CONST.CAP_THREAT_RATIONS * (S.squadRef.rationDry ? 1 : 0)
    - CONST.CAP_THREAT_ENEMY_DOWN * enemyDowns;

  const cap = a.find(u => u.isCaptain);
  const hold = CONST.CAP_HOLD_BASE
    + CONST.CAP_HOLD_TACTICS * (cap ? cap.stats.tactics : 8)
    + (ctx && ctx.objectiveValue ? ctx.objectiveValue : 0)
    + (S.stance.holdNudge || 0)
    + (S.squadRef.directiveNudge || 0);

  return threat > hold;
}

/* `makeSide` WAS HERE — the abstract resolver's side-builder, the last function of that
   family. It survived the Step 8.9 cut because two page templates still called it (the
   weapons bench and the standalone firefight); when those pages were retired it lost its
   last caller and came out, per the rule that anything measuring as no change comes out. */

/* `simulateEngagement` WAS HERE — 622 lines, the abstract band resolver, cut at Step 8.9.
   The Divide stopped calling it at Step 7.5 and nothing in the game has called it since. The
   suite kept calling it, which meant the project's largest safety net — 600 engagements a run —
   was guarding a model nobody played while the grid ran unguarded. Pointing that sweep at the
   grid found, within one run: a casualty tally with no field for `stable` that had never
   accounted for every body, a duplicated cooling pass that shed heat twice an exchange so no
   weapon could ever reach a vent, and three telemetry counters never initialised, so
   `undefined += 327` left NaN and every reader's `|| 0` reported a confident zero.
   None of those were reachable while the guard was aimed elsewhere.
   Time of day went with it: `night` was read only here, the grid has no notion of it, and it
   stays on the deferred list until it is built for the resolver that exists.
   What remains in this file is the shared library the grid calls: stats, aim, severity,
   injuries, composure, morale and the post-engagement settlement. */



/**
 * POST-ENGAGEMENT — capture, stabilisation, and what happens to a bond that lost a half.
 *
 * Factored out of `simulateEngagement` at Step 7.5 so the GRID can call it too. The grid
 * resolver had no aftermath phase at all: everyone it knocked down stayed `down` for ever, so
 * nobody bled out and — more importantly — **nobody was ever captured**, which silently
 * removes ransom, the freedom clause, prisoner reputation and the captive outcomes from the
 * game the moment the grid becomes the engagement model. Copying the block into `tactical.js`
 * would have been a second copy of a rule, which is the one thing this project will not do.
 *
 * `overrunOf` lets each resolver say what "this side came apart" means in its own terms:
 * the abstract model counts routed fighters, the grid counts withdrawals and panic.
 */
function settleAftermath(rng, sides, tel, log, exchange, overrunOf) {
  for (let si = 0; si < sides.length; si++) {
    const S = sides[si];
    const E = sides.filter(o => o !== S).sort((a, b) => active(b).length - active(a).length)[0] || S;
    const captureP = CONST.CAPTURE_P[E.policyName] != null ? CONST.CAPTURE_P[E.policyName] : 0.08;
    /* A squad BREAKING is not the same event as one fighter running, and conflating them
       made half of all firefights read as routs. `routs` counts individuals; `squadsBroken`
       counts sides that actually came apart. */
    const overrun = overrunOf ? overrunOf(S)
                  : (!active(S).length || (S.routed / S.units.length) >= CONST.ROUT_SQUAD_FRACTION);
    tel.sidesEngaged = (tel.sidesEngaged || 0) + 1;
    if (overrun) tel.squadsBroken = (tel.squadsBroken || 0) + 1;
    const lost = overrun;
    for (const u of S.units) {
      if (u.state === 'down') {
        /* D2: every squad carries its wounded out. Losing them is a consequence of being
           OVERRUN (§3.7), not of stance — which is why death-or-glory still loses more. */
        /* HOW THEY WENT DOWN DECIDES WHETHER THEY GET UP. A flat 0.78 was right while the
           only way to go down was a serious or critical round. With a wound pool a body can be
           emptied by grazes, and dying one time in five after being worn down is not the same
           event as dying after being opened up.
           This roll is where HALF THE DEATHS IN THE GAME HAPPEN — 48% of a contest's dead, more
           than are killed outright by a round. It read as zero for one session because
           `downDeaths` was never initialised in the grid's telemetry, so the contest total went
           NaN on the first engagement where nobody died here and every `|| 0` downstream
           reported a confident nought. The same fault, in the same words, as the three counters
           already recorded in this project.
           Being overrun still costs the same 0.40: that is about the field being taken while
           your wounded are on it, and has nothing to do with the round. */
        const bySev = CONST.RECOVER_BY_SEV[u._downSev] != null
                    ? CONST.RECOVER_BY_SEV[u._downSev] : CONST.RECOVER_BY_SEV.serious;
        const recoverP = clamp(bySev - (lost ? 0.40 : 0), 0.15, 0.97);
        if (lost && rng() < captureP) { u.state = 'captured'; if (log) log.push({ exchange, type: 'captured', actors: [u.id], significance: 4 }); }
        /* SOMEBODY PUT DOWN BY A STUN ROUND GETS UP. This roll kills a downed fighter about
           one time in five whatever put them there, so the Dividend was still producing 19
           deaths across six seasons AFTER the round stopped killing and the bleed was stopped —
           they were dying on the recovery roll at the end of a show-match. A non-lethal weapon
           has to survive every death path in the resolver, not the one it fires down. */
        else if (u._stunnedDown) { u.state = 'stable'; }
        else if (u._sharedDown && u.bleed == null) { u.state = 'stable'; }
        else if (rng() < recoverP) { u.state = 'stable'; }
        else { u.state = 'dead'; tel.downDeaths = (tel.downDeaths || 0) + 1; onDeath(rng, u, S, log || [], tel); }
      } else if (u.state === 'stable' && lost && rng() < captureP) {
        u.state = 'captured'; if (log) log.push({ exchange, type: 'captured', actors: [u.id], significance: 4 });
      } else if (u.state === 'routed') {
        u.state = 'ok';   // routers regroup after the fight
      }
    }
    /* §8.1 reconcile pairs: a surviving half whose partner is gone cannot simply stand up */
    for (const u of S.units) {
      if (!u.pair) continue;
      const up = h => h.state === 'ok' || h.state === 'light';
      const halves = u.pair.halves;
      if (halves.some(up) && halves.some(h => !up(h))) {
        for (const h of halves) if (up(h)) h.state = 'stable';
      }
    }
  }
}


/* Mon-Wa bond-shock (§8.1, V13) fires the moment a half dies */
function onDeath(rng, unit, side, log, tel) {
  /* `crowd_pleaser` — fame on kills. Declared at 0.3 points and read by nothing; the corp
     whose whole pitch is showmanship was buying a tag with no effect. The killer is not
     tracked through the wound chain, so credit goes to whoever on the other side is carrying
     one — a showy weapon gets the story whether or not it fired the round. */
  if (tel) tel._lastKillSide = side && side.tag;
  if (unit._killedBy && hasQuirk(unit._killedBy, 'crowd_pleaser')) {
    unit._killedBy._fameEarned = (unit._killedBy._fameEarned || 0) + 1;
    if (tel) tel.crowdPleaser = (tel.crowdPleaser || 0) + 1;
  }
  if (!unit.pair) return;
  const other = unit.pair.halves.find(h => h !== unit);
  if (!other || other.state === 'dead') return;
  const r = rng();
  if (r < 0.60) {
    other.state = 'dead';
    log.push({ type: 'bond_shock_death', actors: [other.id], significance: 4 });
  } else if (r < 0.85) {
    other.state = 'down'; other.bleed = null; other._braindead = true;
    log.push({ type: 'bond_shock_braindead', actors: [other.id], significance: 4 });
  } else {
    other.state = 'down'; other.bleed = null; other._traumatized = true;
    log.push({ type: 'bond_shock_traumatized', actors: [other.id], significance: 4 });
  }
  tel.monwaPairLoss = (tel.monwaPairLoss || 0) + 1;
}

/* roll injuries for everyone who took a serious+ wound and survived */
/** §6 — hand the cells back to the people who carry them. */
function persistCharge(S, tel) {
  for (const u of S.units) {
    if (u.chargeMax > 0 && u.ref) u.ref._charge = u.charge;
    if (tel) tel.vents += (u._vented || 0);
  }
}

function tallySide(rng, S) {
  const out = { dead: [], captured: [], injured: [], light: [], intact: [] };
  for (const u of S.units) {
    if (u.state === 'dead') { out.dead.push(u); continue; }
    if (u.state === 'captured') { out.captured.push(u); continue; }
    const worst = u.wounds.reduce((a, w) => (w.sev === 'critical' ? 'critical' : (w.sev === 'serious' && a !== 'critical' ? 'serious' : a)), null);
    if (worst) {
      const inj = rollInjury(rng, u, worst);
      u.injury = inj;
      out.injured.push(u);
    } else if (u.wounds.length) { out.light.push(u); }
    else out.intact.push(u);
  }
  return out;
}

function rollInjury(rng, u, worst) {
  let roll = 1 + Math.floor(rng() * 100);
  const isThythyn = u.race === 'thythyn';
  let wingRange = 35;
  if (u.hooks.has('wing_injury_susceptibility_up')) wingRange = 46;
  if (u.hooks.has('flight_mobility_bonus')) wingRange = 28;

  let type;
  if (isThythyn && roll <= wingRange) {
    const wr = 1 + Math.floor(rng() * 100);
    type = WING_TABLE.find(e => wr <= e[0])[1];
  } else {
    type = INJURY_TABLE.find(e => roll <= e[0])[1];
  }

  let severity = worst === 'critical' ? 'critical' : 'serious';
  let permanent = false;
  /* §9.3 — a stun round leaves you on the ground, not in a chair. A weapon tagged `nonlethal`
     cannot end a career or take a wing: the wound heals. Without this the Dividend would still
     be permanently maiming people in a show-match, which is the same fault as killing them. */
  const stunned = u._killedBy && hasQuirk(u._killedBy, 'nonlethal');
  if (!stunned && type === 'inj_spinal' && rng() < CONST.SPINAL_PERMANENT_P) { severity = 'permanent'; permanent = true; }
  if (!stunned && type === 'inj_wing_loss') { severity = 'permanent'; permanent = true; }
  if (type === 'inj_wing_strut') severity = 'serious';
  if (type === 'inj_wing_spar') { severity = 'critical'; if (!stunned && rng() < CONST.WING_SPAR_PERMANENT_P) { severity = 'permanent'; permanent = true; } }
  if (type === 'inj_wing_tear') severity = 'minor';

  const band = RECOVERY[severity] || RECOVERY.serious;
  let days = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
  if (u.hooks.has('injury_recovery_time_down')) days = Math.round(days * 0.7);

  /* Gil goggles (§8.3) */
  if (type === 'inj_head' && u.race === 'gil' && rng() < CONST.GIL_GOGGLE_DAMAGE_P) u.gogglesBroken = true;

  return { type, severity, days_remaining: days, untreated: false, permanent, careerEnding: permanent };
}

/* §10 captain fidelity — sim logic, not harness logic. */
function captainFidelity(fighter, traitIndex) {
  if (!fighter) return 0.8;
  const hooks = hooksOf(fighter, traitIndex);
  /* ×10 migration: roster-called (the captain is a roster body), so tactics normalizes */
  let f = 0.030 * (fighter.stats.tactics / 10) + 0.004 * (fighter.loyalty == null ? 50 : fighter.loyalty);
  if (hooks.has('captain_fidelity_up')) f += 0.15;
  if (fighter.race === 'human') f += 0.05;
  f -= 0.006 * (fighter._stress || 0);
  return clamp(f, 0.15, 0.98);
}

const API = {
  QUIRK, CONST, resolveSeverity, effectiveProtection, bandMismatch, hpFor, damageOf,
  spendShot, primaryReady, useSidearm, backToPrimary, isEnergy, hasQuirk, tempoOf, quirksOf,
  settleAftermath, tallySide, persistCharge, coolWeapons, POLICY, STANCE, BANDS, captainReadsFight, makeCombatant, captainFidelity, seedComposure, hooksOf, hitChance, aimEff, compBandOf, rollInjury, INJURY_TABLE, WING_TABLE };
/* Node AND browser. This file exported only to Node for five steps, which meant `divide.js`
   could never run in a page — it reaches for `global.CDCOMBAT` and found nothing. Every other
   module in the sim already did both; this one was the odd one out, and nothing noticed
   because no viewer had tried to run a live Divide until now. */
if (typeof module !== 'undefined' && module.exports) module.exports = API;
(typeof window !== 'undefined' ? window : globalThis).CDCOMBAT = API;
