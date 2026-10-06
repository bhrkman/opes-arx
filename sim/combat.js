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
  /* §3.4 actions */
  AMMO: { shot: 1, suppress: 3, overwatch: 1 },        // [S]
  /* §GUNS the magazine is the gun's own (`mag`); a fighter carries SPARE magazines, and a reload costs rounds */
  LOADOUT_MAGS: 3,                        // [C] spare magazines a fighter carries into a Divide
  LOADOUT_MAGS_SIDEARM: 2,                // [C] and spare magazines for the sidearm
  LOADOUT_CELLS: 1,                       // [C] spare cells for a cell-fed weapon (it used to carry none)
  NEAR_FALLOFF: 5,                        // [C] aim lost per tile inside a gun's `near` — a long gun in a knife fight
  FALLOFF_DEFAULT: 3,                     // [C] aim lost per tile beyond a gun's reach, when a gun names none
  LOADOUT_AMMO: 16,                       // [C] NEW in v1 — COMBAT.md v0.3 should adopt this
  LOADOUT_RATE_CAP: 1.5,                  // [C] a fast weapon is issued more, but not unboundedly
  LOADOUT_BELT: 6,                        // [C] what a belt-fed weapon carries beyond a magazine

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
  TEMPO_AIM: 34,                         // [C] aim a slow gun earns per point of rate under one (the catalogue's single_shot: +1.7 at half rate); a fast gun pays none — its follow-up rounds pay (tactical FOLLOWUP_HIT)
  TEMPO_PIERCE: 1.6,                      // [C] protection a deliberate weapon defeats, per point under rate

  /* §3.5 shot resolution */
  HIT_SLOPE: 0.004, HIT_PIVOT: 100,
  /* §ONE AIM what a trait adds to a shot, in AIM ON THE SHEET — the same points a manager reads on
     a fighter, and the same yardstick as the quirks ("+15 is where a person starts to feel it").
     These were bare numbers in aimEff, written on the invisible copy's scale. */
  TRAIT_AIM: { accuracy: 20, squadLink: 10, overwatch: 20, firstStrike: 30, firstShotLong: 40, optics: 10 },
  FATIGUE_AIM_STEP: 10,                   // [C] aim lost per 25 fatigue, three steps at most
  LIGHT_WOUND_AIM: 10,                    // [C] aim a light wound costs                        // [C]
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
    entrenched:    [0.10, 0.25, 0.40, 0.25],
    /* the specials, one per kind of world (map.js TERRAIN) */
    crevasse_field: [0.20, 0.40, 0.30, 0.10],   // lips and seracs; deep but treacherous
    deep_canopy:    [0.15, 0.45, 0.30, 0.10],   // trunks and roots everywhere, little of it hard
    salt_flats:     [0.78, 0.18, 0.04, 0.00],   // nothing to hide behind at all
    lava_field:     [0.20, 0.30, 0.40, 0.10],   // basalt ridges: hard cover, hard going
    tidal_marsh:    [0.35, 0.45, 0.20, 0.00]    // reeds and channels: soft cover, soft ground
  },
  MOTION_HOLD: 1.00, MOTION_REPOS: 1.15, MOTION_HOVER: 1.35,   // [S]
  TETHER_AIM_MULT: 0.82,                  // [C] §RACES what a stretched half's shooting is worth
  SVALBARD_MOVING: 1.22,                  // [C] §RACES what firing on the move is worth to them
  EXPOSED_HIT: 1.10,                      // [C] §QUIRKS what injury_exposure_up is worth against them
  KELLIS_MEASURE: 0.06,                   // [C] §RACES per turn of measure held, on the shot
  ATTORAK_FRENZY_AIM: 0.85,               // [C] §RACES what the frenzy costs their shooting
  ATTORAK_FRENZY_DMG: 1.30,               // [C] and what it is worth when they land one
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
  UNSPOTTED_AIM: 30,                                            // [H]
  BAND_HIT_MULT: [0.80, 1.00, 1.32],      // [C] §3.2 long / medium / short
  BAND_SEV_BONUS: [-7, 0, 6],             // [C] §3.2 lethality by band

  CROSS_EXPOSURE: 1.30,                   // [C] motion penalty while crossing

  /* COMPOSITION.md §6 — tags that were declared, priced, sold, and inert. */
  DISORIENT_COMP: -8,                     // [C] composure a disorienting hit costs beyond the wound
  RICOCHET_P: 0.25,                       // [C] chance a miss finds somebody else
  BAND_MISMATCH_PENALTY: 15,             // [S] per band off optimal — softened from 2 in Step 3b
  /* A SPECIALIST IS SPECIALISED. On the grid, fights settle toward medium, so a medium-band
     weapon is in its element about half the time whatever happens while a long or short weapon
     is in its element only when it wins the argument about range. Measured, that put the three
     medium rifles in the top three places of the league — battle rifle 11-0 — with a balanced
     squad fourth, and it is a property of the CATEGORY rather than of any weapon in it.
     A generalist should be ok all the time; a specialist should be good sometimes and bad
     sometimes, and this is what pays for the sometimes. Medium weapons get nothing: never
     being out of your element also means never being in it. */
  BAND_SPECIALIST_BONUS: 25,             // [C] aim, for a long or short weapon at its own band
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
  SUPPRESSED_AIM_PENALTY: 40,
  NIGHT_AIM_PENALTY: 20,                   // [OPEN-C1] proposed

  /* §3.6 severity */
  SEV_POWER_MULT: 0.75,                   // [H] §BASELINE (temporary, ruled): 1.15 → 0.75 — one of two levers toward a 25–30% Divide                   // [H] C12: retuned again in v1.2 (2 → 1.4 → 1.15)
  SEV_PROTECTION_MULT: 1.90,              // [H] C12: retuned again in v1.2 (3 → 2.0 → 1.65)
  SEV_GRIT_DIVISOR: 20,                    // [H]
  /* SWUNG BACK (ruled). critical was bumped 94.2 → 93.2 as a stopgap toward the Divide's fatality baseline, flagged
     the first thing returned if fatality ran too high. It did, once the wounded of a taken field died there
     (37.7% of those dropped on 24 seeds, against a 30% aim), so it is back at 94.2. */
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
  HP_PER_GRIT: 0.035,              // [H] what being hard to put down is worth
  DMG_PER_POINT: 6,               // [H] severity points above a graze per point of damage
  DMG_MIN: 1,                     // [S] a hit that lands does something
  POWER_REF: 5,                   // [C] §GUNS the power whose round does the severity roll's damage as it stands; others scale from it
  POWER_FLOOR: 0.2,               // [C] and the least a round does, of that (a gun of no power still lands)
  HP_OVERKILL: 5,                 // [H] how far past empty a stun round leaves a body (a live round past empty kills)
  /* [H] the chance a downed fighter is stabilised rather than dying, by the round that dropped
     them. Worn down by grazes and they are nearly always carried out; opened up by a critical
     and it is close to even. Half the deaths in the game come through here. */
  RECOVER_BY_SEV: { graze: 0.94, light: 0.90, serious: 0.78, critical: 0.60, killed: 0.45 },

  /* §3.7 downed */
  TREAT_BASE: 0.35, TREAT_MEDKIT: 0.15, TREAT_TRAIT: 0.15, TREAT_FIELDCRAFT: 0.002,  // [C]
  /* MEDKIT_RATE deleted at Step 5b-2: whether a squad has medical kit is no longer a
     coin flip, it is whether somebody bought one and is carrying it (PROCUREMENT.md §10). */

  /* §4 composure */
  COMP_BASE: 30, COMP_MORALE: 0.20, COMP_RESOLVE: 0.2,          // [C]
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
  AIM_PENALTY_BY_BAND: { steady: 0, shaken: 10, rattled: 30, broken: 50 },  // [S]
  /* §6 energy weapons: heat inside the fight, charge across the day. A ballistic weapon
     is limited by supply; an energy weapon is limited by tempo. */
  HEAT_SHED: 2,                           // [S] per exchange the weapon does not fire
  /* §10 consumables — single use, each a real action in the exchange, not a modifier. */
  GRENADE_POWER: 7,                       // [C] frag; incendiary adds its quirk on top
  GRENADE_WEIGHT: 0.22,                   // [H] how readily a fighter reaches for one
  GRENADE_LAND_P: 0.50,                   // [C] per target, before cover: it is thrown, not aimed
  GRENADE_COVER_P: 0.16,                  // [C] each grade of cover this much less likely to matter
  /* §DEVICES the abstract model's turret and drone constants lived here — designed, tuned and never
     run once the grid replaced that resolver. The turret and the drone are the grid's now
     (tactical.js, §DEVICES). Two ideas from this block are recorded in PROJECT.md for the grid's
     turret: it can be shot and destroyed, and it draws fire, being the loudest thing there. */
  /* REMOVED in the Step 6 audit: SIDEARM_TIER_FLOOR. Declared, never read. */
  MOTION_AIM_RECOVERY: 20,                 // [C] what `stabilized` gives back when firing on the move

  /* §5 rout / capture */
  ROUT_SQUAD_FRACTION: 0.40,              // [C] squad breaks when this share has routed
  CAPTURE_P: { preservationist: 0.15, measured: 0.15, standard: 0.08, unyielding: 0.03, death_or_glory: 0.00 },

  /* §8.1 (DIVIDE.md) captain judgment — replaces the deleted policy notch table.
     `own_down` is a COUNT, so HOLD_BASE is calibrated up from the spec's 1.4. */
  TREAT_EXPOSURE_MULT: 1.30,              // [S] §3.7 worse than open ground; see hitChance

  /* §7 injuries */
  SPINAL_PERMANENT_P: 0.55,               // [C]
  WING_SPAR_PERMANENT_P: 0.20,            // [C]

  /* §8 racial */
  MONWA_TETHER_COMP: -25,                 // [S]
  THYTHYN_HOVER_P: 0.22,                  // [C] share of Ththyn repositions that hover
  GIL_GOGGLE_DAMAGE_P: 0.40,              // [S] on head-location hit
  GIL_GOGGLE_AIM_PENALTY: 50,              // [S]
  ATTORAK_INTENSITY_COMP: 4,              // [S]
  ETU_DEVOUT_COMP: 8, ETU_ZEALOT_COMP: 15,// [S]

  /* §9 gear */
  DEFAULT_WEAPON: { power: 5, range: 'medium', tier: 3 },        // [C] tier-3 median kit
  DEFAULT_ARMOR: { protection: 3 },                              // [C]
  GEAR_TIER_ACCURACY: 5.0                                       // [S] per tier from 3 (1 → 0.6 → 0.50)
};

/* DIVIDE.md §7.2 — declared stance governs fight SELECTION in the day loop. What survives inside the firefight
   is PURSUIT, here, and the point at which the captain orders the squad back, which is the day loop's
   `STANCE_WITHDRAW_AT` (divide.js) handed to the grid as the side's `withdrawAt`. Two fields stood here that
   nothing read: `holdNudge` (superseded by that threshold) and `recoveryUrgency` (exchanges before someone goes
   to a downed squadmate — a mechanic never built; losing your wounded is a consequence of being overrun, §3.7).
   Both deleted rather than left as knobs that turn nothing. */
const STANCE = {
  preservationist: { pursuit: 'if_free'    },
  measured:        { pursuit: 'if_free'    },
  standard:        { pursuit: 'yes'        },
  unyielding:      { pursuit: 'aggressive' },
  death_or_glory:  { pursuit: 'always'     }
};
/* back-compat alias: callers still say squad.policy */
const POLICY = STANCE;

const BANDS = ['long', 'medium', 'short'];

/* §7.1 general injury table (d100 upper bounds) */
const INJURY_TABLE = [
  [18, 'inj_arm'], [36, 'inj_leg'], [52, 'inj_torso'], [62, 'inj_head'],
  [72, 'inj_internal'], [82, 'inj_burns'], [90, 'inj_chest'], [96, 'inj_spinal'], [100, 'inj_catastrophic']
];
/* §7.2 Ththyn wing table */
const WING_TABLE = [[40, 'inj_wing_tear'], [72, 'inj_wing_strut'], [92, 'inj_wing_spar'], [100, 'inj_wing_loss']];

const RECOVERY = { minor: [5, 15], serious: [20, 60], critical: [45, 120], permanent: [120, 240] };

/* ------------------------------------------------------------------ */
/* Combatant construction                                              */
/* ------------------------------------------------------------------ */

/* §QUIRKS THE CONDITIONS A SITUATIONAL BONUS MAY ASK ABOUT. A closed vocabulary, deliberately:
   each one is answerable from what the fight already knows at the moment a body is built. A
   condition the engine cannot see is not a condition, it is a wish, and a quirk written against
   one would read as working and do nothing — which is the whole fault this catalogue is being
   rebuilt to escape. Adding a condition means adding a line here, and the validator refuses any
   quirk that names one this list does not have. */
const SITUATIONS = {
  squad_at_most_4:   ctx => (ctx.squadSize || 99) <= 4,
  squad_at_most_6:   ctx => (ctx.squadSize || 99) <= 6,
  squad_at_least_7:  ctx => (ctx.squadSize || 0) >= 7,
  is_captain:        ctx => !!ctx.isCaptain,
  not_captain:       ctx => !ctx.isCaptain,
  first_divide:      ctx => !!ctx.firstEngagement,
  alongside_conscript: ctx => !!ctx.withConscript,
  alone_of_their_race: ctx => !!ctx.onlyOfRace,
  /* the rest of the closed vocabulary, each answerable where a body is built */
  veteran:             ctx => (ctx.divides || 0) >= 2,
  green:               ctx => (ctx.divides || 0) === 0,
  young:               ctx => (ctx.age || 30) <= 24,
  old_hand:            ctx => (ctx.age || 30) >= 34,
  hurt:                ctx => (ctx.health == null ? 100 : ctx.health) < 100,
  settled:             ctx => (ctx.stress || 0) <= 20,
  rattled:             ctx => (ctx.stress || 0) >= 50,
  with_their_captain:  ctx => !!ctx.captainPresent && !ctx.isCaptain,
  is_conscript:        ctx => ctx.origin === 'prisoner',
  is_mercenary:        ctx => ctx.origin === 'mercenary'
};
function situationalStats(fighter, traitIndex, ctx) {
  const out = {};
  const list = (fighter.traits || []);
  for (const tid of list) {
    const t = traitIndex && traitIndex[tid];
    const sits = t && t.effects && t.effects.situational;
    if (!sits) continue;
    for (const s of sits) {
      const test = SITUATIONS[s.when];
      if (!test || !test(ctx || {})) continue;
      for (const k in (s.stats || {})) out[k] = (out[k] || 0) + s.stats[k];
    }
  }
  return out;
}
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
    + CONST.COMP_RESOLVE * f.stats.resolve
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

function chargedCarry(fighter, kit) {
  const ids = (kit && kit.consumables) ? kit.consumables.map(x => x.id) : [];
  const ch = fighter && fighter._charges;
  if (!ch) return ids;
  const seen = {}, out = [];
  for (const id of ids) {
    if (seen[id]) continue;                 /* one of each item a fight */
    seen[id] = true;
    if ((ch[id] || 0) > 0) out.push(id);
  }
  return out;
}
function makeCombatant(fighter, opts) {
  opts = opts || {};
  const hooks = hooksOf(fighter, opts.traitIndex);
  const sit = situationalStats(fighter, opts.traitIndex, opts);
  /* PROCUREMENT.md §3 — a fighter's kit is resolved from the catalog at equip time and
     carried on loadout.kit. The defaults below are the pre-catalog field and remain the
     fallback for harnesses and probes that build combatants without a loadout. */
  const kit = fighter.loadout && fighter.loadout.kit ? fighter.loadout.kit : null;
  const weapon = kit ? Object.assign({}, kit.weapon, { tags: kit.tags || [] })
                     : (fighter.loadout && fighter.loadout.weapon) || CONST.DEFAULT_WEAPON;
  const armor = kit ? kit.armor : (fighter.loadout && fighter.loadout.armor) || CONST.DEFAULT_ARMOR;
  return {
    ref: fighter, id: fighter.id, race: fighter.race,
    /* §QUIRKS A SITUATIONAL BONUS IS THE POINT OF A QUIRK. "+25 Grit in a squad of four or
       fewer" is a thing a manager can BUILD AROUND; a flat bonus is a thing he reads once. The
       conditions are a small, closed vocabulary, and each one is answerable from what the
       fight already knows — anything that needs a fact the engine cannot see is not a
       condition, it is a wish. Points are REAL points, on the 10..200 scale, added before the
       division combat works in. */
    /* STEP D — EFFECTIVE AIM: the hand and the trade, averaged. The weapon carries its
       skillClass and skillType (stamped at resolve, from items.js); a fighter without skills, or
       a weapon without a trade, reads as pure aim — so fixtures and defaults are
       untouched. */
    /* §ONE AIM a fighter's combat stats ARE the sheet's stats. They were the sheet ÷ 10, and every
       constant downstream was tuned to that invisible copy — so a mod's "+1 Aim" meant ten points of
       the Aim a manager can see, and `tactical.js sightRange`, written for the sheet, read the copy
       and gave every fighter the same seven tiles. One scale now (docs/STAT_SCALE_MIGRATION.md). */
    stats: { aim: (() => {
               /* §SKILLS the shot: the average of Aim, the damage class and the weapon type (a fighter with
                  no skill in one yet reads as their Aim there) */
               const a = fighter.stats.aim + (sit.aim || 0), sk = fighter.skills || {};
               const cls = weapon.skillClass && sk[weapon.skillClass] != null ? sk[weapon.skillClass] : fighter.stats.aim;
               const typ = weapon.skillType && sk[weapon.skillType] != null ? sk[weapon.skillType] : fighter.stats.aim;
               return (a + cls + typ) / 3;
             })(),
             /* a rested body walks on harder, and a settled one steadier — both spent here */
             grit: (fighter.stats.grit + (sit.grit || 0) +
                    ((fighter._conditioned && fighter._conditioned.grit) || 0)),
             reflex: (fighter.stats.reflex + (sit.reflex || 0)),
             fieldcraft: (fighter.stats.fieldcraft + (sit.fieldcraft || 0)),
             tactics: (fighter.stats.tactics + (sit.tactics || 0)),
             presence: (fighter.stats.presence + (sit.presence || 0)),
             resolve: (fighter.stats.resolve + (sit.resolve || 0) +
                       ((fighter._conditioned && fighter._conditioned.resolve) || 0)) }, hooks,
    /* the wound pool — see `damageOf`; in a Divide it starts where the last fight left it (`_hpFrac`, divide.js §WOUNDS) */
    hpMax: hpFor(fighter), hp: Math.max(1, Math.round(hpFor(fighter) * (fighter._hpFrac != null ? fighter._hpFrac : 1))),
    _hpStart: Math.max(1, Math.round(hpFor(fighter) * (fighter._hpFrac != null ? fighter._hpFrac : 1))),
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
    /* §GUNS the first magazine is loaded; `ammo` is every round the fighter carries BEYOND it (spare magazines,
       a bulk hand's extra, a mod's) — a gun that names no magazine keeps the old flat issue */
    magLeft: weapon.mag || loadoutFor(weapon),
    ammo: (weapon.mag ? weapon.mag * (weapon.damage === 'energy' ? CONST.LOADOUT_CELLS : CONST.LOADOUT_MAGS) : loadoutFor(weapon)) + (hooks.has('carry_bulk_up_2') ? 6 : 0) + ((kit && kit.mod && kit.mod.ammo) || 0),
    reloading: 0,
    /* §MODS what the fitted mods add to the shot (items.js resolve) */
    mod: (kit && kit.mod) || null,
    /* §6 — an energy weapon carries its own resources; a ballistic one leaves these at 0
       and the whole heat path is skipped. */
    /* §10 — carried consumables, spent once each. */
    /* §CHARGES A CONSUMABLE HAS CHARGES FOR THE DIVIDE, AT MOST ONE A FIGHT (ruled). This was a
       fresh copy of the kit every fight and nothing ever came off the fighter: measured, 169 uses
       from about 85 items across 76 fights — one per fight, forever, never bought again. A fighter
       now carries ONE of each item it still has charges for (`fighter._charges`, set at the drop),
       and the fight's spend is taken off the fighter afterwards (divide.js). With no charges table
       — outside a Divide — it carries its kit as before. */
    carried: chargedCarry(fighter, kit),
    _carriedIn: null,
    /* §ENERGY WHAT MAKES A WEAPON CELL-FED is that it has a cell, not that it runs hot.
       `isEnergy` tested `heatCap > 0`, so taking the overheat out of the catalogue would have
       stopped cells being spent at all and quietly turned every energy weapon into a ballistic
       one firing ammunition it does not carry. The family is named by its cell. */
    cellFed: !!(kit && kit.charge > 0),
    /* §GRUDGE the one OA this man remembers, carried onto the ground with him */
    _grudge: fighter._grudge || null,
    heat: 0, heatCap: (kit && kit.heatCap) || 0, heatPerShot: (kit && kit.heat) || 0,
    _heatShed: CONST.HEAT_SHED, _firedThisExchange: false,
    /* §6 — charge is the fighter's, not the engagement's: it persists across every fight
       in a day and only comes back at camp. Ammunition, by contrast, currently refills
       between engagements (see [OPEN-P11]) — so the supply half of the contrast is not
       modelled yet and the tempo half is. */
    /* §ENERGY A CELL HOLDS WHAT THE WEAPON'S CELL HOLDS. What a fighter carried out of the
       last fight is remembered, and it was restored WITHOUT REGARD TO THE WEAPON THEY ARE
       HOLDING NOW: a hand who ended a fight with twenty-seven in a repeater and then drew a
       beam lance began with twenty-seven in a cell that takes ten. Latent for as long as the
       cells were all much of a size; visible the moment they were not. */
    charge: Math.min((fighter._charge != null ? fighter._charge : (kit && kit.charge) || 0),
                     (kit && kit.charge) || 0),
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

function isEnergy(u) { return !!u.cellFed || u.heatCap > 0; }

/** Can this fighter fire their PRIMARY this exchange? */
function primaryReady(u) {
  if (u.venting > 0) return false;
  /* §GUNS a gun with a magazine going in, or rounds still carried for it, is not dry — dry is what the sidearm is for */
  if (u.reloading > 0) return true;
  if (isEnergy(u)) return u.charge > 0 || u.ammo > 0;
  return u.magLeft >= ammoCost(u, CONST.AMMO.shot) || u.ammo > 0;
}

/**
 * §7 — the sidearm answers exactly two failures now: dry and damaged. (It answered venting
 * too, until the overheat was retired; `venting` stays at zero and the guards below are left
 * standing rather than unpicked, so a future heat rule has somewhere to land.) Never otherwise.
 * Swapping is not free: it costs the exchange's aim, which is why a sidearm is a hedge
 * rather than a second primary.
 */
function useSidearm(u) {
  if (!u.sidearm || u.onSidearm) return false;
  u.primary = u.weapon;
  u._primaryRounds = { magLeft: u.magLeft, ammo: u.ammo, reloading: u.reloading };
  u.weapon = Object.assign({}, u.sidearm, { tags: u.sidearm.tags || [] });
  /* §GUNS the sidearm has a magazine of its own, and spares of its own */
  const sm = u.weapon.mag || CONST.LOADOUT_AMMO;
  u.magLeft = sm; u.ammo = sm * CONST.LOADOUT_MAGS_SIDEARM; u.reloading = 0;
  u.onSidearm = true;
  u._justSwapped = true;
  return true;
}
function backToPrimary(u) {
  if (!u.onSidearm || !u.primary) return;
  u.weapon = u.primary; u.primary = null; u.onSidearm = false;
  if (u._primaryRounds) { u.magLeft = u._primaryRounds.magLeft; u.ammo = u._primaryRounds.ammo; u.reloading = u._primaryRounds.reloading; u._primaryRounds = null; }
}
/** Between exchanges a reload counts down; when it is done the next magazine goes in. */
function tickReload(u) {
  if (!(u.reloading > 0)) return;
  u.reloading--;
  if (u.reloading > 0) return;
  const cap = (u.weapon && u.weapon.mag) || CONST.LOADOUT_AMMO;
  const load = Math.min(cap, u.ammo);
  if (isEnergy(u) && !u.onSidearm) u.charge = load; else u.magLeft = load;
  u.ammo -= load;
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
  if (isEnergy(u) && !u.onSidearm) {
    /* §ENERGY A SHOT COSTS WHAT IT COSTS, and the cell must hold it. The guard asked only
       whether anything was left, then took the draw — so a `heavy_draw` weapon firing on its
       last unit of charge spent two and left the cell at MINUS ONE. Latent while cells were
       small and fights short; the moment cells grew and hands fired half again as often, it
       showed up on seven of every eight energy fighters. */
    /* §LIGHT a sun-fed weapon DREADS THE NIGHT: in the planet's dark every shot costs it double */
    const draw = (hasQuirk(u, 'heavy_draw') ? 2 : 1) * (u._dark && hasQuirk(u, 'daylight') ? 2 : 1);
    if (u.reloading > 0) return false;
    if (u.charge < draw) {
      /* §GUNS the cell is spent: a spare goes in, and that takes the gun's reload rounds */
      if (u.ammo > 0 && !(u.reloading > 0)) u.reloading = Math.max(1, u.weapon.reload || 1);
      return false;
    }
    u.charge -= draw;
    /* §ENERGY THE OVERHEAT IS GONE, AND `heatCap` IS NOW ONLY THE MARK OF A CELL-FED WEAPON.
       Every one of the fifteen cell-fed primaries fired two or three shots and then lost an
       exchange cooling — the tier-5 Phase Lance and the tier-1 Surplus Las-Carbine alike, so
       it was the family and not the bad weapons. Measured, the family cost about the same
       money as ballistic, hit slightly SOFTER at every tier a fleet actually fields, and put
       out 37% fewer rounds a fight, in exchange for freedom from a resupply burden that costs
       three per cent. It was worse in nearly every way.

       THE OVERHEAT WAS ALSO A RATE LIMITER, and taking it out alone would have traded a weapon
       that shoots slowly for one that shoots itself empty: output rose to within 18% of
       ballistic and the share running flat inside one engagement went from 23% to 72%. The two
       systems were coupled. The cells are half again as large in the catalogue to answer it,
       and the family now out-shoots ballistic slightly — which is what a slightly dearer
       weapon that cannot be resupplied should do. */
    return true;
  }
  let cost = ammoCost(u, kind === 'suppress' ? CONST.AMMO.suppress
                         : kind === 'overwatch' ? CONST.AMMO.overwatch : CONST.AMMO.shot);
  /* §MODS a recoil compensator holds suppressing fire down for a round less */
  if (kind === 'suppress' && u.mod && u.mod.suppressCost) cost = Math.max(1, cost - u.mod.suppressCost);
  /* §GUNS a shot comes out of the MAGAZINE; an empty magazine means a reload, which costs the gun's rounds, and only
     when the spares are gone too is the fighter dry */
  if (u.reloading > 0) return false;
  if (u.magLeft == null) u.magLeft = u.ammo;             /* an older combatant with no magazine */
  if (u.magLeft < cost) {
    if (u.ammo > 0) u.reloading = Math.max(1, (u.weapon && u.weapon.reload) || 1);
    return false;
  }
  u.magLeft -= cost;
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
     (on a miss: `cover_shred`, `ricochet` act at the grid's shot)
   A quirk may implement any subset. Absent phase = no effect in that phase. */
const QUIRK = {
  /* --- aim --- */
  /* The catalog's own words: "At short band the target's cover counts one grade worse; at
     long, aim_eff -3." The aim half read the engagement band correctly. The cover half read
     `weaponBandOf(s)` — the shooter's WEAPON band — which is `short` for every weapon that carries
     spread, so the condition was always true and a shotgun ignored a grade of cover from
     across the map. It measured 8-1 in the league and this is most of why. */
  spread: { aim: (c, b) => b === 0 ? -30 : 0,
            cover: (s, t, i, b) => (b === 2 ? Math.max(0, i - 1) : i) },
  stabilized: { aim: (c, b, ctx) => c.repositioning ? CONST.MOTION_AIM_RECOVERY : 0 },
  /* Capped at two, not three. In the abstraction "the same side" changed often enough for a
     cap of three to be an achievement; on a grid, keeping your fire on one person is easy and
     the tag became a flat, unconditional +3 aim — better than the specialist bonus and with
     none of the conditions. What is cheap to achieve is worth less. */
  sustained: { aim: (c, b, ctx) => 10 * Math.min(CONST.SUSTAINED_CAP, c._sustain || 0) },
  smart_link: {},                                                  /* waives the range penalty: in `aimEff` */
  min_band_medium: { aim: (c, b) => b === 2 ? -990 : 0 },          /* cannot engage at short */
  single_shot: {},                                                 /* handled in the action loop */
  spool: {},                                                       /* handled in the action loop */
  recoil_heavy: { aim: (c) => c._movedLast ? -20 : 0 },
  burst: {},                                                       /* handled in the action loop */

  /* --- cover --- */
  cover_shred: {}, ricochet: {},                                   /* on a miss, at the grid's call site */

  /* --- severity --- */
  /* §ARMOUR (fixed) piercing is points of the target's protection defeated, and only the protection the round actually
     met: `pierce` returns points, summed with the gun's `pen` and a slow gun's bite and capped at what was there.
     Each was rounded into severity on its own, read the armour's protection even where the round missed it, and
     together could defeat more than existed — so against a pen gun, wearing armour got you killed more often. */
  pierce_1: { pierce: () => 1 },
  pierce_2: { pierce: () => 2 },
  pierce_3: { pierce: () => 3 },
  flechette: { sev: (s, t) => { const p = t._effProt != null ? t._effProt : effectiveProtection(s, t); return p <= 1 ? 6 : p >= 4 ? -6 : 0; } },
  incendiary: { sev: () => 8 },
  disorient: {},                                                   /* composure, applied on hit */
  chill: {},                                                       /* movement, applied on hit */
  emp: {},                                                         /* frames, drones, turrets: at the grid's shot */
  arc_chain: {},                                                   /* second target, at the call site */
  area: {},                                                        /* multi-target, at the call site */

  /* --- declared, no effect until their system exists --- */
  suppressive: {}, suppressive_2: {}, silent: {}, crowd_pleaser: {},
  mobile_cover: {}, daylight: {}, heavy_draw: {}, nonlethal: {},
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
  /* §GUNS a gun's RATE OF FIRE is its own stat — shots a round; the tags decide it only for a gun that names none */
  if (c.weapon && c.weapon.rof != null) return c.weapon.rof;
  let t = null;
  for (const q of quirksOf(c)) {
    const v = CONST.TEMPO[q];
    if (v != null) t = t == null ? v : Math.max(t, v);
  }
  return t == null ? CONST.TEMPO_DEFAULT : t;
}
/** Deliberate weapons aim better; spraying weapons aim worse. Centred on the default rate. */
function tempoAim(c) {
  /* §GUNS (fixed) rate was charged twice: a flat −50 aim a point of rate over one on every round, on top of the gun's own
     handling, which already prices its precision — so an SMG sat on the hit floor at every range and could not buy its
     accuracy back with volume. A slow gun's aim is the catalogue's; a fast gun's rate costs it on the rounds after the
     first, where recoil lives (tactical.js). */
  const r = tempoOf(c);
  return r < CONST.TEMPO_DEFAULT ? CONST.TEMPO_AIM * (CONST.TEMPO_DEFAULT - r) : 0;
}
/** And they defeat protection, which is the other half of "hits when others cannot". */
function tempoPierce(shooter) {
  const under = CONST.TEMPO_DEFAULT - tempoOf(shooter);
  return under > 0 ? under * CONST.TEMPO_PIERCE : 0;   /* points of protection, capped with the rest in `pierceSev` */
}
/** §8 — protection as this shooter's damage type actually meets it. */
function effectiveProtection(shooter, target) {
  const t = (shooter.weapon && shooter.weapon.damage) || 'ballistic';
  const r = (target.armor.resist && target.armor.resist[t]) || 0;
  return Math.max(0, (target.armor.protection || 0) + r);
}
function quirksOf(c) { return (c.weapon && c.weapon.tags) || []; }
/** §GUNS how hard a gun pins: 0 not at all, 1 the man it fires at, 2 him and whoever stands near — the gun's own
    number, the old tags deciding it only for a gun that names none */
function suppressOf(c) {
  if (c.weapon && c.weapon.suppress != null) return c.weapon.suppress;
  return hasQuirk(c, 'suppressive_2') ? 2 : hasQuirk(c, 'suppressive') ? 1 : 0;
}
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
/* §GUNS PENETRATION: what armour the round goes through — the gun's own `pen`, the `pierce_N` tags, a slow gun's bite —
   as points of the protection this round met (`met`: none where it found no armour), never more than was there */
function pierceSev(shooter, met) {
  let pts = (shooter.weapon && shooter.weapon.pen) || 0;
  for (const q of quirksOf(shooter)) { const h = QUIRK[q]; if (h && h.pierce) pts += h.pierce(); }
  pts += tempoPierce(shooter);
  return Math.round(CONST.SEV_PROTECTION_MULT * Math.min(pts, met));
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
  if (c.race === 'ththyn') return 0;                       // no_range_band_penalty (ratified)
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
  if (c.hooks.has('accuracy_bonus')) a += CONST.TRAIT_AIM.accuracy;
  if (ctx.squadLink || (ctx.side && ctx.side._psi && ctx.side._psi.link)) a += CONST.TRAIT_AIM.squadLink;   // Gil psion_squad_link
  /* §QUIRKS a fighter who shoots better waiting than moving, when the shot is a reaction */
  if (ctx.overwatch && c.hooks.has('overwatch_bonus')) a += CONST.TRAIT_AIM.overwatch;
  if (c.hooks.has('first_strike_bonus') && ctx.exchange === 1) a += CONST.TRAIT_AIM.firstStrike;
  /* Shooting before they know where you are. The grid sets this when the target's side has
     neither eyes on the shooter nor a recent shot to look toward; nothing else passes it, so
     an abstract-model caller is unaffected. Sized against `first_strike_bonus` above, which
     is +3 for a closely related reason, rather than picked to hit a casualty figure. */
  if (ctx.unseen) a += CONST.UNSPOTTED_AIM;
  if (c.hooks.has('first_shot_long_range_bonus') && ctx.exchange === 1 && bandIdx === 0) a += CONST.TRAIT_AIM.firstShotLong;
  a += Math.round(CONST.GEAR_TIER_ACCURACY * ((c.weapon.tier || 3) - 3) * 10) / 10;
  if (c.hooks.has('optics_gear_synergy')) a += CONST.TRAIT_AIM.optics;
  /* §MODS an optic steadies every shot; a bipod steadies a held shot and fouls a moving one;
     a target link steadies a reaction; a rangefinder halves the cost of the wrong distance */
  const md = c.mod;
  if (md) {
    a += md.aim || 0;
    a += c.repositioning ? (md.aimMoving || 0) : (md.aimHolding || 0);
    if (ctx.overwatch) a += md.overwatchAim || 0;
  }
  /* §GUNS RANGE IN TILES: beyond a gun's reach the aim falls off per tile; inside its `near` a long gun suffers per
     tile; within them, a specialist's gun (not a medium one) keeps its bonus. A gun that names no reach, or a shot
     that does not know its distance, keeps the band step. */
  let mis;
  if (c.weapon && c.weapon.reach != null && ctx.dist != null && !(c.race === 'ththyn')) {
    const far = Math.max(0, ctx.dist - c.weapon.reach) * (c.weapon.falloff != null ? c.weapon.falloff : CONST.FALLOFF_DEFAULT);
    const near = Math.max(0, (c.weapon.near || 0) - ctx.dist) * CONST.NEAR_FALLOFF;
    mis = far + near;
    /* §GUNS (fixed) a specialist's bonus is for its own band: a long gun at long range, a short gun at short. It was
       granted anywhere between `near` and `reach` — five to nineteen tiles for the marksman, so it shot best at four */
    const own = (c.weapon.range === 'long' && bandIdx === 0) || (c.weapon.range === 'short' && bandIdx === 2);
    if (mis === 0 && own)
      mis = -CONST.BAND_SPECIALIST_BONUS * (c.weapon.range === 'short' ? CONST.BAND_SPECIALIST_SHORT : 1);
  } else mis = bandMismatch(c, bandIdx);
  /* `smart_link` — "waives band_mismatch_penalty entirely": the penalty for the wrong distance, never the bonus for the
     right one. It added `bandMismatch` itself, which at a gun's own band is the NEGATIVE of the specialist bonus, so
     a smart-linked SMG lost thirty aim exactly where it was built to fight. */
  if (mis > 0 && hasQuirk(c, 'smart_link')) {
    /* …and only what the band penalty was: so many bands off its own, at BAND_MISMATCH_PENALTY each. Under the range model
       the falloff past a gun's reach is not that penalty, and waiving all of it let an eight-tile SMG shoot at twenty
       tiles as if it were in reach */
    const off = Math.abs(BANDS.indexOf(c.weapon.range || 'medium') - bandIdx);
    mis = Math.max(0, mis - off * CONST.BAND_MISMATCH_PENALTY);
  }
  a -= (mis > 0 && md && md.bandMult != null) ? mis * md.bandMult : mis;
  a += quirkAim(c, bandIdx, ctx);                     /* PROCUREMENT.md §4.2 */
  /* §GUNS HANDLING is the gun's own precision, apart from the hand that holds it; and a SNAP SHOT — shooting in the same
     turn as moving — costs a gun what it costs, a pistol little and a belt-fed gun a great deal. Nothing charged a
     moving shooter before: `stabilized` gave twenty aim back for firing on the move, and there was nothing to give back. */
  if (c.weapon) { a += c.weapon.handling || 0; if (c.repositioning || ctx.snap) a -= c.weapon.snap || 0; }
  a += tempoAim(c);                                   /* COMPOSITION.md §4 */
  if (c.suppressed) a -= CONST.SUPPRESSED_AIM_PENALTY;

  const cb = compBandOf(c);
  const kellisNerve = c.hooks.has('aim_bonus_under_pressure') && cb !== 'broken';
  if (!kellisNerve) a -= CONST.AIM_PENALTY_BY_BAND[cb];

  a -= CONST.FATIGUE_AIM_STEP * Math.min(3, Math.floor(c.fatigue / 25));
  if (c.state === 'light') a -= CONST.LIGHT_WOUND_AIM;
  if (c.gogglesBroken) a -= CONST.GIL_GOGGLE_AIM_PENALTY;
  if (ctx.night && !c.hooks.has('night_encounter_bonus')) a -= CONST.NIGHT_AIM_PENALTY;
  return a;
}

function hitChance(shooter, target, bandIdx, ctx, overwatch) {
  const base = clamp(CONST.HIT_SLOPE * (aimEff(shooter, bandIdx, ctx) - CONST.HIT_PIVOT) + CONST.HIT_BASE, CONST.HIT_MIN, CONST.HIT_MAX);
  let coverIdx = target.cover;
  if (target._bulwarked) coverIdx = Math.min(3, coverIdx + 1);        // Olmac walking_bulwark
  if (target._shielded) coverIdx = Math.min(3, coverIdx + 1);         // §GUNS a squadmate's `mobile_cover`
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
  if (target.hooks.has('bombardment_evasion_bonus') && overwatch) m *= 0.70;
  /* the long band is hard shooting for a gun not built for it; a long gun is (fixed: it took the penalty too) */
  m *= (bandIdx === 0 && shooter.weapon && shooter.weapon.range === 'long') ? 1 : CONST.BAND_HIT_MULT[bandIdx];
  /* §3.7 Going to a downed man is the most dangerous thing in a firefight — WORSE than
     simply standing in the open. You are not shooting, so nothing is keeping their heads
     down, and you are moving fast rather than carefully. */
  if (target.treating) m *= CONST.TREAT_EXPOSURE_MULT;
  /* §RACES a half working outside the tether does not shoot like a whole being */
  if (shooter._tetherStrained) m *= CONST.TETHER_AIM_MULT;
  /* §RACES SVALBARD FIRE ON THE MOVE. A quadruped built like cavalry does not stand off and
     snipe — a first cut gave them the long band, which was the wrong animal entirely. They
     shoot from the gallop: what costs everybody else their aim while crossing ground costs
     them much less, and a squad they are moving through is a squad that is still shooting. */
  if (shooter.repositioning && shooter.race === 'svalbard') m *= CONST.SVALBARD_MOVING;
  /* §RACES THE BLOOD IN A GNOLL'S EYES. An Attorak with a body in front of them fights harder
     and shoots worse: they close, they swing, and their aim goes with the frenzy. */
  if (shooter._frenzy > 0) m *= CONST.ATTORAK_FRENZY_AIM;
  /* §RACES A KELLIS IN MEASURE. Every turn held rather than crossed is a turn spent reading
     the exchange, and the duelling drill is what makes that worth something. */
  if (shooter._measure) m *= 1 + shooter._measure * CONST.KELLIS_MEASURE;
  /* §QUIRKS a body that is easier to hurt is easier to hit hard: injury_exposure_up was
     carried and never read */
  if (target.hooks && target.hooks.has('injury_exposure_up')) m *= CONST.EXPOSED_HIT;
  /* §3.9 WHY THE SHOT WAS THAT LIKELY. The chance was a number with no account of itself, so
     a manager watching a replay could see a squad lose and never learn what beat it. The two
     or three things that moved this shot most are named, in the order they mattered, and the
     page prints them beside the percentage. Nothing here changes the odds. */
  const why = [];
  const cw = ['No Cover', 'Light Cover', 'Hard Cover', 'Dug In'][coverIdx];
  if (coverIdx > 0) why.push([cw, CONST.COVER_MULT[coverIdx]]);
  const bandName = ['Long', 'Medium', 'Close'][bandIdx] || '';   /* bands run long, medium, short */
  if (CONST.BAND_HIT_MULT[bandIdx] !== 1) why.push([bandName + ' Range', CONST.BAND_HIT_MULT[bandIdx]]);
  if (target.flanked) why.push(['Flanked', 1.4]);
  if (!target.spotted) why.push(['Unspotted', CONST.SPOT_UNSPOTTED]);
  if (overwatch) why.push(['Overwatch', CONST.SPOT_OVERWATCH]);
  if (target.hovering) why.push(['Hovering', CONST.MOTION_HOVER]);
  else if (target._crossed) why.push(['Caught Crossing', CONST.CROSS_EXPOSURE]);
  else if (target.repositioning) why.push(['Moving', CONST.MOTION_REPOS]);
  if (target.treating) why.push(['Treating the Wounded', CONST.TREAT_EXPOSURE_MULT]);
  if (shooter.ammo != null && shooter.ammo <= 2) why.push(['Low on Rounds', 0.9]);
  why.sort((a, b) => Math.abs(Math.log(b[1])) - Math.abs(Math.log(a[1])));
  hitChance.why = why.slice(0, 3).map(x => x[0]);
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
  const grit = ((fighter.stats && fighter.stats.grit) || 100) + cond;
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
  /* §ARMOUR COVERAGE: a hit that lands where the armour is not — a bare arm under a vest — gets none of it */
  const covered = target.armor.coverage == null || rng() < target.armor.coverage;
  const effProt = covered ? Math.max(0, (target.armor.protection || 0) + resist) : 0;
  target._effProt = effProt;   /* what this round met, for the quirks that read armour */
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
           + pierceSev(shooter, effProt);                              /* COMPOSITION.md §4, §GUNS */
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
    /* §CAPTIVES (fixed) A BODY LEFT LYING ON GROUND ITS SIDE HAS GIVEN UP IS TAKEN. Somebody stunned, or held at a breath
       by an injector, cannot walk off with a withdrawal; when nobody of his is left standing on the field and the other
       side is, they have him. Only an overrun took anyone — and a side that called its retreat was never overrun, so a
       stun build could not take a prisoner, and its victims woke and were carried off by nobody. */
    const abandoned = !active(S).length && active(E).length > 0 && E !== S;
    for (const u of S.units) {
      if (u.state === 'down' && abandoned && (u._stunnedDown || u._upAfter)) {
        u.state = 'captured'; tel.takenOffField = (tel.takenOffField || 0) + 1;
        if (log) log.push({ exchange, type: 'captured', actors: [u.id], significance: 4 });
        continue;
      }
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
        else if (u._stunnedDown || u._upAfter) { u.state = 'stable'; }   /* a stun round, or a stasis injector */
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
  if (unit._killedBy && (hasQuirk(unit._killedBy, 'crowd_pleaser') || ((unit._killedBy.armor && unit._killedBy.armor.tags) || []).indexOf('crowd_pleaser') >= 0)) {
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


function rollInjury(rng, u, worst) {
  let roll = 1 + Math.floor(rng() * 100);
  const isThthyn = u.race === 'ththyn';
  let wingRange = 35;
  if (u.hooks.has('wing_injury_susceptibility_up')) wingRange = 46;
  if (u.hooks.has('flight_mobility_bonus')) wingRange = 28;

  let type;
  if (isThthyn && roll <= wingRange) {
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
  /* §RACES a hurt wing does not fly: the injury table already knew where a Ththyn is hit,
     and now the grid does too */
  if (String(type).indexOf('inj_wing') === 0) u.wingHurt = true;
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
  let f = 0.003 * fighter.stats.tactics + 0.004 * (fighter.loyalty == null ? 50 : fighter.loyalty);
  if (hooks.has('captain_fidelity_up')) f += 0.15;
  if (fighter.race === 'human') f += 0.05;
  f -= 0.006 * (fighter._stress || 0);
  return clamp(f, 0.15, 0.98);
}

const API = {
  QUIRK, CONST, resolveSeverity, effectiveProtection, bandMismatch, hpFor, damageOf,
  spendShot, primaryReady, SITUATIONS, situationalStats, useSidearm, backToPrimary, isEnergy, hasQuirk, tempoOf, quirksOf,
  settleAftermath, onDeath, persistCharge, coolWeapons, tickReload, suppressOf, POLICY, STANCE, BANDS, makeCombatant, captainFidelity, seedComposure, hooksOf, hitChance, aimEff, compBandOf, rollInjury, INJURY_TABLE, WING_TABLE };
/* Node AND browser. This file exported only to Node for five steps, which meant `divide.js`
   could never run in a page — it reaches for `global.CDCOMBAT` and found nothing. Every other
   module in the sim already did both; this one was the odd one out, and nothing noticed
   because no viewer had tried to run a live Divide until now. */
if (typeof module !== 'undefined' && module.exports) module.exports = API;
(typeof window !== 'undefined' ? window : globalThis).CDCOMBAT = API;
