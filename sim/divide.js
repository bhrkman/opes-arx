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
  const PRE = isNode ? require("./predivide.js") : global.CDPREDIVIDE;
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
  /* §WALL one step for ground well inside the ring, at the given share of a march tick: no arrival
     slack, water and peaks swung round in a full circle, and the step clamped inside the line */
  function wallRun(planet, day, sq, zW, dW, pace, stats) {
    const inR = zW.r * (1 - CONST.WALL_AIM_IN);
    const k = inR / Math.max(1e-9, dW);
    const wx = zW.cx + (sq.x - zW.cx) * k, wy = zW.cy + (sq.y - zW.cy) * k;
    const dd = MAP.dist(sq.x, sq.y, wx, wy);
    const step = Math.min((CONST.DAY_MARCH / CONST.DAY_TICKS) * pace, dd);
    const base = Math.atan2(wy - sq.y, wx - sq.x);
    let nx = sq.x + Math.cos(base) * step, ny = sq.y + Math.sin(base) * step;
    if (planet.passableAt && !planet.passableAt(nx, ny)) {
      let found = null;
      for (const off of [0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0, 2.4, -2.4])
        for (const f of [1, 0.5]) {
          const qx = sq.x + Math.cos(base + off) * step * f, qy = sq.y + Math.sin(base + off) * step * f;
          if (!found && planet.passableAt(qx, qy)) found = [qx, qy];
        }
      if (found) { nx = found[0]; ny = found[1]; }
    }
    const inside = MAP.clampInside(planet, day, nx, ny);
    sq.x = inside.x; sq.y = inside.y;
    sq.movedToday = true; sq._why = 'wall'; sq._aim = { x: wx, y: wy, why: 'wall' };
    for (const b of squadHead(sq)) b.condition.fatigue = Math.min(100, b.condition.fatigue + CONST.FATIGUE_MARCH);
    stats.audit.wallRuns = (stats.audit.wallRuns || 0) + 1;
  }
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
  /* §SITES the nearest shelter a hurt squad can reach and still be inside the ring, or null.
     A squad heads for it with the engine's own verb, `claim` carrying the objective — an
     invented `site` intent was silently ignored, which is why nobody ever arrived. */
  function shelterFor(sq, planet, day, reach) {
    if (!sq.bodies.some(b => b.status === 'injured')) return null;
    let best = null, bd = reach;
    for (const o of planet.objectives || []) {
      if (o.type !== 'ration_site' || !MAP.siteLive(o, day)) continue;
      if (!MAP.inZone(planet, day, o.x, o.y)) continue;
      const d = MAP.dist(sq.x, sq.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /* §RESERVE A BEATEN SQUAD FALLS BACK TO A BEACON when its OA has fighters in orbit and one is within reach: falling
     back and being made whole are the same move. (The plan lottery could not do this: a bloodied squad is ordered to
     break contact the moment it loses, and was usually pulled or finished before it chose again.) */
  function beaconFor(sq, planet, day, reach) {
    const c = sq.corp;
    if (!c || !c.reserve || !c.reserve.length) return null;
    if (squadHead(sq).length >= (sq._startN || 0)) return null;
    let best = null, bd = reach;
    for (const o of planet.objectives || []) {
      if (o.type !== 'sponsor_cache' || !MAP.siteLive(o, day)) continue;
      if (!MAP.inZone(planet, day, o.x, o.y)) continue;
      const d = MAP.dist(sq.x, sq.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
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

  /* One number each, because two things need them and a second copy is how they come apart. */
  /* §MACRO THE REACH WAS TOO LONG FOR THE FIELD. Measured against the genre the Divide
     imitates (audit_macro.cjs): 26 squads sit 20% of the map's width apart, which is a
     Fortnite lobby exactly — but contact happened within 11.7% of that width, where those
     games use 3-6%. The median nearest enemy was 0.065 and contact was 0.068, so the typical
     squad stood inside contact range of somebody EVERY DAY and 53% of squad-days did. There
     was no ground in which to be undiscovered, which is why stealth, scouting and every
     cautious stance could never bite: they were asked to work in a gap that did not exist.
     Cut to 3.4% of the width. The map is not too small; the arms were too long. */
  const ENGAGE_RANGE = 0.020;
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
    DETECT_NIGHT: 0.25,                 // [C] §LIGHT how much of the chance to notice another squad survives
                                        //     the planet's dark — greatly cut (ruled)
    NIGHT_MOVE: 0.85,                   // [C] §LIGHT a march in the dark: slightly slower (ruled)
    NIGHT_WATCH: 0.30,                  // [C] §LIGHT what a watch keeps in the dark
    DETECT_COMPRESSION_MAX: 2.60,       // [C] §10.1 — the ramp lives here, not in region count
    DETECT_OBJECTIVE_PULL: 1.45,        // [C] contested ground finds you
    DETECT_HUNTING: 1.55,
    DETECT_FLOOR: 0.42,                 // [C] what the closing line guarantees, whatever your stance               // [C] a squad that spent today hunting finds people
    RELAY_DETECT_BONUS: 0.35,           // [C] §9 intelligence
    RELAY_ESCAPE_BONUS: 0.18,           // [C] §9 the mast is the careful corp's weapon

    /* §6.1 acceptance / evasion */
    ESCAPE_BASE: 0.85,                  // [C] "preservationist squads mostly slip away" (§6.1)
    ESCAPE_FIELDCRAFT: 0.0020,          // [C] per point of fieldcraft over 100
    ESCAPE_ROOM_MIN: 0.15,              // [C] floor once there is nowhere to go
    CORNERED_ZONE_FRAC: 0.45,           // [C] zone/planet ratio below which escape collapses
    CORNERED_EDGE: 0.030,               // [C] backed against the closing edge

    /* §5.1 movement — open ground, so distance not adjacency */
    DAY_MARCH: DAY_MARCH,               // [C] map units per day at full effort
    /* RULED — SIZE READS ON THE GROUND. Three walk faster than eight and are harder to
       notice; that is the entire argument for fielding a small squad, and until now the
       map charged size nothing. Pivot six is the centre of gravity of a dealt drop, both
       terms read LIVE headcount so attrition lightens a squad, and both are kept gentle:
       stance, fieldcraft and the closing line still decide the day — size leans it. */
    SIZE_PIVOT: 6,                      // [S] the squad size that reads as neutral
    SIZE_MARCH_PER_BODY: 0.03,          // [C] ±3% march per body off the pivot: 3 walk ~9% over, 8 ~6% under
    SIZE_DETECT_PER_BODY: 0.045,        // [C] ±4.5% noticeability per body off the pivot, per squad in the pair
    NIGHT_MARCH_P: 0.18,                // [C]
    NIGHT_MARCH_FATIGUE: 6,             // [C]
    ARRIVE_SLACK: 0.012,                // [C] close enough to have arrived
    /* [C] §STANCE share of a side down before it pulls out, by stance (standard is the grid's own 35%) */
    STANCE_WITHDRAW_AT: { preservationist: 0.10, measured: 0.20, standard: 0.35, unyielding: 0.50, death_or_glory: 0.65 },
    STIM_NIGHT_COST: 5,                 // [C] §CONSUMABLES fatigue recovery a stim costs that night (its line)
    WALL_EDGE: 0,                       // [C] §WALL only a squad actually OUTSIDE runs: the ring does not
                                        //     move within a day, so a hair inside is safe until dawn — a guard
                                        //     band sent careful squads charging off the rim into the middle
    WALL_AIM_IN: 0.08,                  // [C] §WALL and runs for safe ground just inside, not the centre
    WALL_SPRINT: 1.6,                   // [C] §WALL a sprint: full pace and more, whatever the stance
    WALL_CRAWL: 0.35,                   // [C] §WALL the wounded who cannot walk drag themselves in

    /* §6.1 contact geometry */
    SIGHT_RANGE: 0.048,                 // [C] how far a squad can be noticed at all — a little
                                        //     over twice contact, the shape a battle royale uses:
                                        //     you see further than you can reach
    /* §7.6 PASSIVE SIGHTING — seeing without meeting. Measured against SIGHT_RANGE, which is
       what a squad notices while doing something else; watching costs a day's attention. */
    SEE_RANGE: 0.060,                   // [C] how far a squad that is looking can see: three
                                        //     times contact, the battle-royale shape — you see
                                        //     further than you can reach, and a patient squad
                                        //     can see its nearest neighbour (median 0.037)
    SEE_BASE: 0.55,                     // [H] the chance at the edge of nothing, before cover
    SEE_MARCH_COST: 0.75,               // [H] a full day's march costs this much of the watch
    SEE_MIN_ATTENTION: 0.25,            // [C] even a hard march notices something
    SEE_FIELDCRAFT: 0.40,               // [C] per full stat scale above or below the middle
    SEE_PER_BODY: 0.06,                 // [C] a big squad is easier to spot than a small one
    ENGAGE_RANGE: ENGAGE_RANGE,         // [C] inside this, contact is possible
    JOIN_RANGE: 0.072,                  // [C] a third corp close enough to pile in
    /* [C] OWN LINES DO NOT STACK. Two squads of one corp sent to the same point used to
       finish the walk standing inside each other — visually one marker, tactically one
       grenade, and it rewarded piling onto a single coordinate over holding a shape.
       The binding constraint is HALF this value under ARRIVE_SLACK (0.012): a pair pushed
       apart around a shared target each stand half the spacing from it, and both must
       still count as arrived, or arrival and spacing oscillate. 0.016 leaves that margin
       (0.008 < 0.012) and clears the largest map marker, so a formation reads as a
       formation. First cut was 0.010 — spaced the data, still overlapped the drawing. */
    OWN_SPACING: 0.016,
    /* [C] rule 3 of the march, and its inversion fixed: wounded bodies used to VANISH
       from the size count and speed their squad up. Somebody carries them. Four
       stretchers cost roughly a fifth of the day's march. */
    CARRY_SLOW_PER_BODY: 0.07,
    /* [C] how far a corp will send a squad to bring its immobilised wounded home —
       about two days' march. Beyond it, nobody is coming, and the dome decides. */
    RESCUE_RANGE: 0.09,
    /* [C] rule 2 of the march: pace follows the people. Reflex — the quick cover
       ground — was the emptiest stat in the game (one reader: grid initiative), so
       the march rides it rather than crowning an already-loaded one. Squad pace is
       the AVERAGE over its standing bodies, trainable like anything else; race
       flavour arrives through race stat spreads, never through a race multiplier. */
    /* §MAP THE MARCH WAS TWICE WHAT IT SAID. This read (reflex − 10) × 0.012 from the days
       when stats ran 10–20. Stats run 10–200 with a median near 90, so the MEDIAN squad
       marched at 1.9× DAY_MARCH and a quick one at 2.5× — past contact range in a day, which
       is most of why squads seemed to leap past each other between frames. Anchored at the
       median now: reflex 46 walks at 0.91, 133 at 1.09, the trainable difference kept, the
       day's march meaning what it says. (measure_map.cjs) */
    PACE_PIVOT: 90,                     // [C] the reflex at which a squad marches exactly DAY_MARCH
    PACE_PER_REFLEX: 0.002,             // [C] per point off the pivot
    PACE_MIN: 0.8, PACE_MAX: 1.25,      // [C]
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
    NOISE_NOMINAL: 2,                   // [C] §GUNS an ordinary rifle's noise: a fight of them carries NOISE_RANGE
    NOISE_LOUD_CAP: 1.3,                // [C] and a battery of support guns carries this much further
    NOISE_QUIET_FLOOR: 0.45,            // [H] what a force shooting entirely silenced weapons
                                        //     still gives away — muzzle flash, shouting, bodies
    NOISE_EXCHANGE_SPAN: 8,             // [C] exchanges by which a fight is at full volume
    NOISE_DAYS: 1,                      // [S] how long ago a sound is still worth walking to
    /* [H] YOU RUN TOWARD GUNFIRE, OR YOU DO NOT GET THERE. Squads close on a fight in progress
       at their marching pace plus this much again, scaled by their taste for finding a fight —
       a preservationist barely quickens and a death-or-glory OA sprints.
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
    COORD_LEADER: 0.0030,                // [C] the drop leader's tactics
    COORD_CAPTAINS: 0.0015,              // [C] mean captain tactics
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
    /* §STORY what a name does to the loudness of the notice its death makes */
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
    SPREAD_GREED: 0.5,                  // [C] how much ground-hunger widens the net
    SPREAD_AGGRESSION: 0.35,            // [C] and appetite for contact
    SPREAD_PATIENCE: 0.45,              // [C] against what a careful OA keeps massed         // [S] squads live inside these bounds. RULED: the
                                        // floor is THREE — it binds the manager's own squad
                                        // page, which reads it from here. The auto-deal's
                                        // arithmetic (two-squad minimum against an eight cap)
                                        // cannot produce a squad under five regardless, so
                                        // the old floor of five never actually bound anything.
    SPENT_SQUAD_CAUTION: 0.80,          // [C] barely flinches; they play on
    REFORM_AT: 3,                       // [C] below this the survivors are redistributed
    CONSOLIDATE_RANGE: 0.16,            // [C] if one is close enough to reach
    BREAK_DISTANCE: 0.075,              // [C] how far a beaten squad actually runs
    SLIP_STUMBLE: 0.70,                 // [C] §STANCE how often a careful squad turns away from a mutual stumble,
                                        //     as a share of its sighted chance
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
    MAP_STALE: 8,                       // [S] but the manager's map keeps it, as last-known, this long
    /* §KNOW THE PICTURE. Ruled with the dispersed drop: every OA knows where every other
       came down — the draft is posted — and after that only what its own squads (and its
       banner's) have seen, where they saw it, until it goes stale. */
    LANDING_KNOWN_DAYS: 2,              // [S] the posted landings are current information this long
    RALLY_THREAT_RANGE: 0.20,           // [C] a stronger known enemy within this makes a spread corp gather
    /* §MIND THE MANAGER'S TWO LEVERS. A manager does not tell a squad what to do — he sets the
       stance, and he says which OAs he would rather his people found. A leaning of 1 to 5
       (3 is nothing) multiplies how near a rival READS when a squad is choosing whom to seek
       or avoid: an OA leaned toward feels closer than it is, one leaned away feels further.
       It never forbids and never orders; the squad still decides by its stance. */
    /* APPROACH_SHARPNESS stood here until the captain's judgement replaced it: how sharply a
       squad favours its strongest need is the CAPTAIN's now, not one number for the fleet.
       Removed rather than left for somebody to read as though it still decided something. */
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
    NERVE_SWING: 0.45,                  // [C] how far nerve bends the count of what is out there
    PLAN_DAYS_MIN: 2, PLAN_DAYS_MAX: 6, // [C] how long a captain's plan stands before rethinking
    /* §MIND SHADOW AND SCREEN, the dispersed drop's manoeuvres. A shadowing squad keeps a
       stronger known enemy in sight at SHADOW_DIST — outside contact, inside knowledge — so the
       OA keeps its picture current without a fight. A screening squad stands between a
       digging mate and a known threat at STAGE_RADIUS from the mate. */
    SHADOW_RANGE: 0.22,                 // [C] a known stronger enemy this near is worth shadowing
    SHADOW_DIST: ENGAGE_RANGE * 1.9,    // [C] the distance a shadow keeps
    SCREEN_RANGE: 0.24,                 // [C] a threat this near a digging mate is worth screening
    WITHDRAW_DAYS: 3,                   // [C] a pull-back is worked for days, not re-rolled
    PATROL_DAYS: 5,                     // [C]

    /* §5.2 rations */
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
    /* §7.5 ELEVATION, read three ways */
    HEIGHT_SPOT: 0.60,                  // [C] detection × (1 + this × height difference): the high see the low
    HEIGHT_CLIMB: 0.50,                 // [C] pace × (1 − this × slope): steep ground is slow ground
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

    /* §5.4 camp */
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
    REINFORCE_NEED: 0.45,               // [C] §RESERVE the pull of a beacon on a squad with any loss to replace
    REINFORCE_PER_LOSS: 1.1,            // [C] and how much more for each share of its drop it has lost
    BEACON_FALLBACK_MARCHES: 3,         // [C] how many days' march a beaten squad will fall back to reach a beacon
    BEACON_TICKS: 2,                    // [C] §RESERVE two-hour blocks a beacon must be held, uncontested, for one landing
    BEACON_CONTEST_RADIUS: 0.04,        // [C] an enemy squad this near a beacon stops anything landing (0.06 made every beacon a standoff)        // [C] an enemy squad this near a beacon stops anything landing
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
    ZONE_MARGIN_SAFE: 0.90,             // [C] a preservationist keeps this much of the ring
    ZONE_MARGIN_BOLD: 1.00,             // [C] death_or_glory works right up against the wall
    STANCE_PULL_HURT: 2.6,              // [C] notches toward care, at total loss
    STANCE_PULL_PENNED: 1.1,            // [C] and toward aggression once the ring closes
    STANCE_PULL_AHEAD: 0.7,             // [C] an opening is worth taking
    RANSOM_ANSWER_WINDOWS: 2,           // [C] §TIME the windows a person has to answer a ransom before it lapses
    LEAVE_OVERTIME_GUESS: 6,
    CHAMPION_PREY: 0.35,                // [C] §SNOWBALL every hunter values last year's champion this much more
    CONTENDER_SHARE: 0.7,               // [C] a contender: its force at least this share of the strongest on the ground
    CONTENDER_FOCUS: 0.35,              // [C] and it values the champion and the front-runner this much more again
    CONTENDER_SMALL_FRY: 0.6,           // [C] and a small, weak OA only this much
    UNDERDOG_FAME_PER_PLACE: 0.12,      // [C] §SNOWBALL fame for a kill, per place the victim's OA finished above the killer's
    UNDERDOG_FAME_FLOOR: 0.4,           // [C] and the least it falls to, hitting all the way down
    CHAMPION_FAME_BONUS: 0.5,           // [C] and half again on top for one of the champion's own
    BANNER_PULL_AT: 0.45,
    PULL_MARGIN: 0.25,                  // [C] §MARKET how far above the line a force's staying starts to lose its worth               // [C] §BASELINE (temporary) below this share standing, an OA's banner is pulled
    LEAVE_EARLIEST_DAY: 3,              // [C] before this an OA has seen too little of its own losses to price them            // [C] the days past the last ground an OA expects a contest to run
    CEDE_STANDING_POINTS: 20,           // [C] §WITHDRAWAL the standing ceding costs, own and fleet together (4–14 + 5–18)
    STANDING_CREDIT: 2000,              // [H] a point of it in credits: about a year of gate (₡68/month) and its pull
                                        //     on prices, mercenaries and sponsors; an OA's pride scales it 0.5–1.5×
    STANCE_SPREAD: 0.95,                // [C] how widely a corp explores around its target
    /* §TRUCE a truce is never broken (ruled), so it has no price to break */
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
    corp.kitBudget = LED.procurementBudget(acct, corp.allBodies);
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
          || ITEMS.foundingArmoury(doc.id, total, { depth: intent.depth }).stock;
    const handStock = {};
    for (const k in baseArmoury) handStock[k] = baseArmoury[k];
    let handSpend = 0, handValue = 0, handed = 0;
    corp.handRefused = 0;
    if (handSrc) {
      const maxTier = (ITEMS.doctrine(doc.id) || {}).armoury_max_tier || 5;
      const slotOk = (id, slot) => {
        const it = id ? ITEMS.byId(id) : null;
        return it && it.slot === slot && it.tier <= maxTier ? it : null;
      };
      for (const f of corp.allBodies) {
        const h = handSrc[f.id];
        if (!h) continue;
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
     lose the fights they pick. An OA leans on its dials: the greedy spread to reach more
     ground, the aggressive spread to be everywhere a fight is, and the careful mass. */
  function squadCountFor(n, profile, want) {
    const packed = Math.max(2, Math.ceil(n / CONST.SQUAD_MAX));       /* what packing gives */
    const most = Math.max(2, Math.min(CONST.SQUADS_MAX, Math.floor(n / CONST.SQUAD_MIN)));
    if (want && want >= 2) return Math.max(2, Math.min(most, want));  /* a manager's own call */
    const d = (profile && profile.dials) || {};
    const dial = k => (typeof d[k] === 'number' ? d[k] : 50) / 100;
    /* what an OA wants: ground-hunger and appetite for contact push it wider */
    const spread = dial('greed') * CONST.SPREAD_GREED
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
      rigidity: rigidity != null ? rigidity : (DEFAULT_RIGIDITY[profile.id] != null ? DEFAULT_RIGIDITY[profile.id] : 50),
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
      const led = leaders && leaders[i] && bodies.some(b => b.id === leaders[i])
                ? leaders[i] : cap.id;
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
        _startN: bodies.length           /* §RESERVE what it dropped with: a squad below this has losses to replace */
      });
      /* SEASONS.md S6 — which squad somebody actually stood in. The grief rule needs this to
         know who was CLOSE to the dead, and nothing recorded it: the close-loss multiplier
         read a field that no code anywhere ever set. */
      for (const b of bodies) b._squadIdx = si;
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

  /* §SNOWBALL THE CHAMPION IS A MARK, and a contender hunts the top. Every hunter values last year's champion more — the
     fame of taking down the champ. A CONTENDER (its force near the strongest on the ground) values the champion and the
     current front-runner more again, and a small, weak OA less — beating those does not bring the title nearer, and a
     patient front-runner left alone is the one that outlasts everyone. */
  function prestigeFor(seeker, sq) {
    let p = prestigeOf(sq);
    const tc = sq && sq.corp, sc = seeker && seeker.corp;
    if (!tc || !sc || tc === sc) return p;
    if (lastPlaceOf(tc) === 1) p *= 1 + CONST.CHAMPION_PREY;
    const live = (c) => (c.allBodies || []).filter(b => b.status === 'active').length;
    const onG = CORPS_REF.filter(c => !c.withdrawn);
    const top = Math.max(1, ...onG.map(live));
    if (live(sc) >= CONST.CONTENDER_SHARE * top) {
      if (lastPlaceOf(tc) === 1 || live(tc) >= top) p *= 1 + CONST.CONTENDER_FOCUS;
      else if (live(tc) < 0.5 * live(sc)) p *= CONST.CONTENDER_SMALL_FRY;
    }
    return p;
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
    let armed = 0, quiet = 0, noiseSum = null;
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
      if (kit.weapon && kit.weapon.noise != null) noiseSum = (noiseSum || 0) + kit.weapon.noise;
    }
    /* §GUNS a fight is as loud as the guns in it: the mean of their noise against an ordinary rifle's, floored where a
       force of silenced guns used to sit and capped where a battery of support guns does */
    const quietFrac = armed ? quiet / armed : 0;
    let volume = CONST.NOISE_QUIET_FLOOR + (1 - CONST.NOISE_QUIET_FLOOR) * (1 - quietFrac);
    if (noiseSum != null && armed) volume = Math.max(CONST.NOISE_QUIET_FLOOR, Math.min(CONST.NOISE_LOUD_CAP, (noiseSum / armed) / CONST.NOISE_NOMINAL));
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


  /* §TRUCE A TRUCE IS NEVER BROKEN (ruled). The Aleas mandate it once it is struck, and breaking an
     Aleas-mandated truce is answered by the drones with the complete annihilation of every squad that
     broke it — so no OA has ever dared, and none ever will. It is not a choice anybody weighs: there is no
     code here that could break one. */

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
      pot: planet.pot.value, odds: odds, day: day, lastDay: MAP.CONST.LAST_GROUND_DAY,
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
  function standDown(c, day, stats, corps) {
    if (c._downedOn == null) c._downedOn = day;          /* §PLACEMENT the day it left the ground */
    const off = (stats.withdrawOffers || {})[c.id];
    const promises = [];
    if (off) for (const id in off.replies) if (off.replies[id]) promises.push({ to: c.id, from: id, terms: off.terms, day: day });
    c.withdrawn = { day: day, toId: null, terms: (off && off.terms) || null, promises: promises, byChoice: true };
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
      pot: planet.pot.value, odds: odds, day: day, lastDay: MAP.CONST.LAST_GROUND_DAY,
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
    const fieldRate = (() => {
      let lostAll = 0, bodiesAll = 0;
      for (const j of corps) { const a2 = j.allBodies || []; bodiesAll += a2.length; lostAll += a2.filter(b => b.status !== 'active').length; }
      return bodiesAll ? lostAll / bodiesAll / Math.max(1, day) : 0;
    })();
    const stayCost = (c) => {
      if (day < CONST.LEAVE_EARLIEST_DAY) return 0;
      const all = c.allBodies || [], alive = all.filter(b => b.status === 'active');
      const lost = Math.max(0, all.length - alive.length);
      const daysLeft = Math.max(1, MAP.CONST.LAST_GROUND_DAY + CONST.LEAVE_OVERTIME_GUESS - day);
      const rate = 0.5 * (lost / Math.max(1, all.length) / Math.max(1, day)) + 0.5 * fieldRate;
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
        const asked = Math.max(0, Math.min(1, (off.terms && off.terms.credits) || 0));
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
        standDown(c, day, stats, corps);
      }
    }
    for (const c of corps) {
      if (isHumanOA(c.id) || !onGround(c)) continue;
      /* §MARKET THE DEADLINE: a force nearing the line is about to be pulled with nothing, so what fighting on is worth
         shrinks to nothing at the line — which is what makes selling an exit, while the force still counts, the play */
      const allB = c.allBodies || [], upShare = allB.length ? allB.filter(b => b.status === 'active').length / allB.length : 1;
      const margin = Math.max(0, Math.min(1, (upShare - CONST.BANNER_PULL_AT) / CONST.PULL_MARGIN));
      const rows = leaveRows(c), stay = POT * (odds[c.id] || 0) * margin - stayCost(c), cost = standingCost(c);
      const off = (stats.withdrawOffers || {})[c.id];
      if (off && off.sentDay < day) {
        const ask = (off.terms && off.terms.credits) || 0;
        const got = promisesWorth(rows, ask, r => off.replies[r.j.id] === true);
        if (got - cost > stay) standDown(c, day, stats, corps);
        else { delete stats.withdrawOffers[c.id]; stats.audit.withdrawTakenBack = (stats.audit.withdrawTakenBack || 0) + 1; }
      } else if (!off) {
        let best = { ask: 0, ev: 0 };
        for (const r of rows) {
          const ask = Math.floor(r.maxAsk * 100) / 100;
          if (ask <= 0) continue;
          const ev = promisesWorth(rows, ask, x => x.maxAsk >= ask);
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
          postWithdrawOffer(c, { credits: best.ask }, day, stats);
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
       none of it visible. All of it is gone. The Withdrawal is how an OA leaves; truces, below, stay. */

    /* Non-aggression pacts — between corps that have NOT joined each other, and the one
       kind of agreement a corp can be stabbed in the back over (N8). */
    for (let i = 0; i < corps.length; i++) {
      for (let j = i + 1; j < corps.length; j++) {
        const a = corps[i], b = corps[j];
        if (a.withdrawn || b.withdrawn) continue;
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
    yieldPer *= 1 + CONST.FORAGE_FIELDCRAFT * (squadStat(sq, 'fieldcraft') - 100);
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
      const onIt = fx.hurt.terrain ? planet.terrainAt(sq.x, sq.y) === fx.hurt.terrain : true;
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
    for (const k of caps) { meanT += k.c.stats.tactics; meanL += k.c.loyalty == null ? 50 : k.c.loyalty; meanS += squadStress(k.sq); }
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
    /* a manager's HOLD stands where it is put until it runs out: arriving is the point */
    if (it.ordered && (it.type === 'hold' || it.type === 'meet')) return true;
    if (it.type === 'shadow' || it.type === 'screen') return true;   /* the dawn refresh decides these */
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
  /* ---- THE PICTURE: what a corp knows of everyone else's whereabouts ----
     `corp._picture[key]` = { sq, corpId, x, y, day, n, prestige } — where a foreign squad was
     when it was last seen, by whom it does not matter. Written by the landing (every OA,
     day 1), by contact (both sides, and their banners), and by the relay mast (everyone under
     the tower's banner). Read fresh: a sighting older than KNOWN_STALE is dropped, a landing
     after LANDING_KNOWN_DAYS. Nothing else hands a corp another's position. */
  /** §MIND how near an OA reads to this one: 5 pulls them in, 1 pushes them away, 3 is the
      truth. The manager's second lever, and the AI's own standing preferences ride the same
      wire — an OA that hates another leans toward it without being told. */
  /* §STANCE NO NOTCH IS AIMED AT AN OA ANY MORE (ruled). Aiming a stance at a rival bought a
     tenth of a fight between the ends of the ladder, because a meeting needs only one side to
     want it; the stance now belongs to each SQUAD and shapes how it spends its day. This was
     the last reader of the per-OA notch — a slight pull on which rival a hunter walked toward —
     and it reads neutral now, so the control that is gone from the page is gone from the game.
     Kept as a function: two readers call it, and the one question it answers (does this OA
     draw my squads toward it?) may yet come back as something other than a notch. */
  function leanOf(corp, otherId) { return 1; }

  /* §MAP HOW IT WAS SEEN, not only where. Three things write a sighting — the posted landings
     on day 1, a relay mast under whose banner everything is read, and contact — and the map
     showed all three the same way, so a manager who suddenly saw the whole fleet on day 5 had
     nothing to tell him a mast had done it. `via` travels with the sighting. */
  function recordSighting(corp, other, day, live, via) {
    if (!corp || !other || other.corpId === corp.id) return;
    corp._picture = corp._picture || {};
    corp._picture[other.corpId + ':' + other.sIdx] = { sq: other, corpId: other.corpId, x: other.x, y: other.y, day,
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
  function planCorp(rng, corp, planet, day, flares, stats, noises) {
    const zNow = MAP.zoneOn(planet, day);
    const mine = corp.squads.filter(sq => squadHead(sq).length >= 1);
    if (!mine.length) return;
    const dials = STANCE_DIALS[corp.policy];
    const coord = coordination(corp);
    const z = MAP.zoneOn(planet, day);
    /* what this OA knows, not where everyone is */
    const foreign = pictureOf(corp, day);

    /* SHADOW AND SCREEN follow what they watch: their aim is recomputed each dawn from the
       picture, and a shadow whose quarry has gone out of the picture is done */
    const pic = corp._picture || {};
    for (const sq of mine) {
      const it = sq.intent; if (!it) continue;
      if (it.type === 'shadow') {
        const e = pic[it.target];
        if (!e || day - e.day > CONST.KNOWN_STALE || !squadHead(e.sq).length) { sq.intent = null; continue; }
        const dx = sq.x - e.x, dy = sq.y - e.y, m = Math.max(1e-6, Math.hypot(dx, dy));
        const p = MAP.clampInside(planet, day, e.x + (dx / m) * CONST.SHADOW_DIST, e.y + (dy / m) * CONST.SHADOW_DIST);
        it.tx = p.x; it.ty = p.y; it.arrived = false;
      } else if (it.type === 'screen') {
        const mate = it.mate;
        if (!mate || !squadHead(mate).length) { sq.intent = null; continue; }
        const e = it.target ? pic[it.target] : null;
        let px = mate.x, py = mate.y;
        if (e && day - e.day <= CONST.KNOWN_STALE) { const dx = e.x - mate.x, dy = e.y - mate.y, m = Math.max(1e-6, Math.hypot(dx, dy)); px = mate.x + (dx / m) * CONST.STAGE_RADIUS; py = mate.y + (dy / m) * CONST.STAGE_RADIUS; }
        const p = MAP.clampInside(planet, day, px, py);
        it.tx = p.x; it.ty = p.y; it.arrived = false;
      } else if (it.type === 'meet' && it.arrived && it.then) {
        /* the rendezvous is made: the strike it carried takes over, if the quarry is still known */
        const e = pic[it.then];
        if (e && day - e.day <= CONST.KNOWN_STALE && squadHead(e.sq).length) { sq.intent = { type: 'hunt', tx: e.x, ty: e.y, expires: day + CONST.PLAN_LIFE, ordered: it.ordered }; stats.audit.meetThenStrike = (stats.audit.meetThenStrike || 0) + 1; }
        else sq.intent = null;
      }
    }
    for (const sq of mine) if (!intentValid(sq, planet, day)) sq.intent = null;
    /* a manager's order stands until it is done or runs out; the noises and the strikes below
       do not overwrite it */
    const free = mine.filter(sq => !sq.intent);
    if (!free.length) return;

    /* ---- 0. shooting, somewhere over there ----
       The only thing a squad could previously act on was `flares` — every live squad's exact
       position, handed to every corp, gated by nothing but distance. Perfect knowledge, which
       is a large part of why three squads of one corp so often set off for the same dot.
       A sound is a different kind of information and a poorer one: you know something happened
       roughly there, you do not know who, how many, or whether they are still standing. What a
       corp does about it is its temperament. An OA that seeks fights goes and has a look; a
       preservationist hears the same thing and puts distance between itself and it.
       Taken per squad rather than for the corp, so one squad going to look does not commit the
       whole OA — which is the other half of the convergence problem. */
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
        const sd = squadDials(sq);
        const go = rng() < sd.seek;
        const away = rng() < (1 - sd.seek) * 0.5;
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

    /* ---- 0b. §7.6 SEEN FIRST, SLIP AWAY ----
       A cautious squad now spots its enemies first (holding still buys 4.4x the sight), and
       did nothing with it: the planner only ever turned away from a fight it could HEAR, never
       from a squad it could SEE. So a careful squad watched a hunter walk up to it and was
       found anyway, and measured, its stance bought two fights between the ends of the ladder.
       Seeing first is only worth anything if you can act on it. A squad whose stance does not
       want the fight, and which has a fresh sighting of a foreign squad close enough to reach
       it, moves away from it before the meeting — which is the one kind of avoidance a hunter
       cannot simply overrule, because it has to find you again. How readily it goes is the
       same dial (`seek`) that decides whether it goes looking. */
    {
      const pic = pictureOf(corp, day).filter(e => day - e.day <= 1);
      for (const sq of mine) {
        if (sq.intent && sq.intent.type === 'avoid') continue;
        const sd = squadDials(sq);
        if (sd.seek >= 0.45) continue;                        /* it wants the fight, or does not mind */
        let near = null, nd = 9;
        for (const e of pic) {
          const d = MAP.dist(sq.x, sq.y, e.x, e.y);
          if (d < nd) { nd = d; near = e; }
        }
        if (!near || nd > CONST.SEE_RANGE) continue;
        if (rng() >= (1 - sd.seek)) continue;
        const a = Math.atan2(sq.y - near.y, sq.x - near.x);
        const step = CONST.SEE_RANGE * 1.2;
        sq.intent = { type: 'avoid', tx: sq.x + Math.cos(a) * step, ty: sq.y + Math.sin(a) * step,
                      expires: day + CONST.PLAN_LIFE };
        stats.audit.slippedAway = (stats.audit.slippedAway || 0) + 1;
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
          const budget = CONST.DAY_MARCH * dials.ground * sizeMarchMult(sq) * carryMult(sq) * paceMult(sq);
          /* the leader's travel ESTIMATE must include the size term the real march uses,
             or every mixed-size pincer is mistimed by design */
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
    preservationist: { hunting:0.50, resupplying:1.25, scouting:1.30, hiding:1.80, recovering:1.40, consolidating:1.20, prospecting:1.45, rallying:1.35, entrenching:1.40, baiting:0.30, sweeping:1.25, pressing:0.35, shadowing:1.20, screening:1.30, days:4 },
    measured:        { hunting:0.75, resupplying:1.15, scouting:1.15, hiding:1.30, recovering:1.20, consolidating:1.10, prospecting:1.20, rallying:1.20, entrenching:1.20, baiting:0.70, sweeping:1.15, pressing:0.70, shadowing:1.10, screening:1.15, days:4 },
    standard:        { hunting:1.00, resupplying:1.00, scouting:1.00, hiding:1.00, recovering:1.00, consolidating:1.00, prospecting:1.00, rallying:1.00, entrenching:1.00, baiting:1.00, sweeping:1.00, pressing:1.00, shadowing:1.00, screening:1.00, days:3 },
    unyielding:      { hunting:1.35, resupplying:0.90, scouting:0.85, hiding:0.60, recovering:0.85, consolidating:0.90, prospecting:0.75, rallying:0.80, entrenching:0.75, baiting:1.30, sweeping:0.85, pressing:1.35, shadowing:0.70, screening:0.85, days:3 },
    death_or_glory:  { hunting:1.75, resupplying:0.75, scouting:0.60, hiding:0.35, recovering:0.65, consolidating:0.80, prospecting:0.45, rallying:0.55, entrenching:0.45, baiting:1.60, sweeping:0.60, pressing:1.75, shadowing:0.40, screening:0.60, days:2 }
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
  const APPROACHES = ['reinforcing', 'resupplying', 'hunting', 'scouting', 'hiding', 'recovering',
                      'consolidating', 'prospecting', 'rallying', 'shadowing', 'screening',
                      'entrenching', 'baiting', 'sweeping', 'pressing'];

  /** A sighting older than this is not information. */
  function knownCount(sq, day) {
    let n = 0;
    for (const k in (sq.known || {})) if (day - sq.known[k] <= CONST.KNOWN_STALE) n++;
    return n;
  }

  function approachValid(sq, planet, day) {
    if (sq.approach === 'resupplying') return planet.objectives.some(o => MAP.siteLive(o, day) && o.type !== 'sponsor_cache');
    /* §RESERVE reinforcing is over when the reserve is empty or no beacon stands */
    if (sq.approach === 'reinforcing') return !!(sq.corp && sq.corp.reserve && sq.corp.reserve.length)
      && planet.objectives.some(o => o.type === 'sponsor_cache' && MAP.siteLive(o, day));
    /* nothing left to dig means nothing to prospect for */
    if (sq.approach === 'prospecting') return planet.objectives.some(o => o.type === 'resource_site' && MAP.siteLive(o, day));
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
      const dd = MAP.dist(sq.x, sq.y, f.x, f.y) * leanOf(corp, f.corpId);
      if (dd < nearD) { nearD = dd; near = f; }
    }
    /* §SITES A SQUAD GOES WHERE IT NEEDS TO. This picked the nearest live site of any kind,
       so a squad carrying three wounded walked past a rest site to empty a munitions crate,
       and a strongpoint was only ever taken by a squad that happened to be closest to it.
       Distance is now weighed by NEED: a hurt squad reads a rest site as nearer than it is,
       a careful one a strongpoint, and a strongpoint it already holds is not a destination. */
    const hurtN = sq.bodies.filter(b => b.status === 'injured').length;
    const pull = o => o.type === 'ration_site' && hurtN ? 0.45
                    : o.type === 'strongpoint' && o.heldBy !== sq.corpId && squadDials(sq).seek < 0.5 ? 0.6
                    : 1;
    let site = null, sd = 9;
    for (const o of planet.objectives) {
      if (!MAP.siteLive(o, day) || o.type === 'relay_mast' || o.type === 'sponsor_cache') continue;
      if (o.type === 'strongpoint' && o.heldBy === sq.corpId) continue;
      const dd = MAP.dist(sq.x, sq.y, o.x, o.y) * pull(o);
      if (dd < sd) { sd = dd; site = o; }
    }
    const mastUp = planet.objectives.some(o => o.type === 'relay_mast' && MAP.siteLive(o, day));
    const kc = knownCount(sq, day);
    const blind = kc === 0 ? 1 : kc === 1 ? 0.40 : 0.12;
    const mates = corp.squads.filter(s => s !== sq && squadHead(s).length);
    const mateD = mates.length ? Math.min.apply(null, mates.map(s => MAP.dist(sq.x, sq.y, s.x, s.y))) : 9;

    switch (ap) {
      /* §RESERVE A SQUAD WITH LOSSES TO REPLACE, and fighters waiting in orbit to replace them, goes to a beacon — the
         more it has lost the more it wants to — and a nearer beacon pulls harder. A squad at full strength never does. */
      case 'reinforcing': {
        const left = corp.reserve ? corp.reserve.length : 0;
        const lost = Math.max(0, (sq._startN || head) - head) / Math.max(1, sq._startN || head);
        if (!left || lost <= 0) return 0;
        let bd = 9;
        for (const o of planet.objectives)
          if (o.type === 'sponsor_cache' && MAP.siteLive(o, day) && MAP.inZone(planet, day, o.x, o.y)) bd = Math.min(bd, MAP.dist(sq.x, sq.y, o.x, o.y));
        if (bd > z.r * 1.3) return 0;
        return Math.min(1, CONST.REINFORCE_NEED + lost * CONST.REINFORCE_PER_LOSS);
      }
      case 'resupplying': {
        /* A SQUAD LOW ON ROUNDS wants a munitions drop as much as a hungry one wants water.
           Being dry was a state nothing wanted anything about. */
        const dry = 1 - Math.max(0, Math.min(1, (sq.ammo == null ? CONST.AMMO_LOAD : sq.ammo) / CONST.AMMO_LOAD));
        if (dry > 0.6) return 0.55 + dry * 0.2;
      }
      /* falls through to the kit and ration reasons */
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
      case 'recovering': {
        /* §SITES shelter in reach makes recovering worth choosing: a squad with wounded and a
           rest site within a couple of days' march has somewhere to go, not merely a reason to
           stand still — which is why it chose to recover six times in a whole contest */
        let restNear = false;
        for (const o of planet.objectives) {
          if (o.type === 'ration_site' && MAP.siteLive(o, day) &&
              MAP.dist(sq.x, sq.y, o.x, o.y) <= CONST.DAY_MARCH * 3) { restNear = true; break; }
        }
        return wounded * 0.16 + (wounded && restNear ? 0.35 : 0)
             + (fatigue > 55 ? 0.40 : 0) + (fatigue > 75 ? 0.35 : 0);
      }
      case 'consolidating':
        return (head <= CONST.REFORM_AT ? 0.65 : 0) + (mateD < CONST.CONSOLIDATE_RANGE && head < 5 ? 0.25 : 0);
      case 'entrenching': {
        /* good ground under us, a wall coming, and nothing worth walking to: dig in and let
           them come to it */
        const good = planet.heightAt ? planet.heightAt(sq.x, sq.y) : 0.5;
        const inZone = MAP.dist(sq.x, sq.y, z.cx, z.cy) < z.r * 0.8;
        return (good > 0.55 && inZone ? 0.30 : 0) + (head >= 5 ? 0.10 : 0) + (site && sd < CONST.CLAIM_RANGE ? 0.15 : 0);
      }
      case 'baiting': {
        /* let ourselves be seen on ground of our choosing, and meet whoever comes on it */
        if (!near || nearD > CONST.SIGHT_RANGE * 2) return 0;
        const cover = 1 / Math.max(0.2, planet.concealAt(sq.x, sq.y));
        return head >= 4 && cover > 1.1 ? 0.28 : 0;
      }
      case 'sweeping': {
        /* walk the ground nobody has walked: sites are found by looking */
        const unfound = (planet.objectives || []).filter(o => !o.revealed).length;
        return unfound > 2 && (sq.rations || 0) > head * 5 ? 0.22 + (fatigue < 40 ? 0.08 : 0) : 0;
      }
      case 'pressing': {
        /* they are hurt and they are near: do not let them mend */
        if (!near || nearD > CONST.SIGHT_RANGE * 1.5) return 0;
        return (near.n || 9) < head ? 0.34 : 0;
      }
      case 'shadowing': {
        /* a stronger known enemy nearby that I cannot fight but can watch */
        const t = foreign.filter(f => (f.n || 0) > head && MAP.dist(sq.x, sq.y, f.x, f.y) < CONST.SHADOW_RANGE)
                         .sort((a, b) => MAP.dist(sq.x, sq.y, a.x, a.y) - MAP.dist(sq.x, sq.y, b.x, b.y))[0];
        return t ? 0.35 + ((sq.rations || 0) > head * 6 ? 0.1 : 0) : 0;
      }
      case 'screening': {
        /* a mate is digging and a known threat is near it */
        const digger = corp.squads.find(s => s !== sq && squadHead(s).length && s.intent && (s.intent.type === 'claim' || s.intent.type === 'hold'));
        if (!digger) return 0;
        const threat = foreign.some(f => MAP.dist(digger.x, digger.y, f.x, f.y) < CONST.SCREEN_RANGE);
        return threat ? 0.45 : 0.05;
      }
      case 'rallying': {
        /* the dispersed drop's own approach: my squads are far apart and something I know of
           and cannot beat alone is near — go to each other before it comes */
        if (!mates.length || mateD < CONST.CONSOLIDATE_RANGE) return 0;
        const threat = foreign.some(f => MAP.dist(sq.x, sq.y, f.x, f.y) < CONST.RALLY_THREAT_RANGE && (f.n || 0) > head);
        return (mateD > CONST.CONSOLIDATE_RANGE * 2 ? 0.25 : 0.10) + (threat ? 0.45 : 0);
      }
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
          if (o.type !== 'resource_site' || !MAP.siteLive(o, day) || o.resource !== ask.resource) continue;
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
  /** §MIND the picture as THIS captain reads it: only what is within their sight, counted with
      their nerve — a frightened captain sees more of them than there are. */
  function asRead(sq, foreign, mind) {
    const out = [];
    for (const f of foreign) {
      const d = MAP.dist(sq.x, sq.y, f.x, f.y);
      if (d > mind.sight) continue;
      const fear = 1 + (0.5 - mind.nerve) * CONST.NERVE_SWING * 2;
      out.push(Object.assign({}, f, { n: Math.max(1, Math.round((f.n || 1) * fear)) }));
    }
    return out;
  }
  function chooseApproach(rng, sq, corp, planet, day, foreign, stats) {
    const lean = APPROACH_LEAN[corp.policy] || APPROACH_LEAN.standard;
    const mind = captainMind(sq);
    foreign = asRead(sq, foreign, mind);
    /* THE PICK IS A WEIGHING, NOT A MAXIMUM. Taking the highest need meant the four or five
       loudest approaches were the only ones a contest ever saw: a squad with a good reason to
       hunt never entrenched, baited, swept or pressed, however sensible those were, because
       hunting scored higher every time. Every approach with a real need goes in a hat weighted
       by that need, and the squad draws from it — so the loud ones still dominate and the
       quiet ones happen. */
    const hat = [];
    let best = 'scouting', bestV = -1;
    for (const ap of APPROACHES) {
      const v = approachNeed(sq, ap, corp, planet, day, foreign) * (lean[ap] || 1);
      if (v > 0.05) hat.push([ap, Math.pow(v, mind.judge)]);
      if (v > bestV) { bestV = v; best = ap; }
    }
    if (hat.length) best = P.weightedPick(rng, hat);
    sq.approach = best;
    /* a good captain's plan stands; a poor one is back at the start of it every other morning */
    sq.approachUntil = day + Math.max(1, Math.min(lean.days + 2, mind.days));
    sq._mind = { judge: Math.round(mind.judge * 100) / 100, sight: Math.round(mind.sight * 100) / 100, nerve: Math.round(mind.nerve * 100) / 100, cap: mind.cap ? mind.cap.name : null };
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
      const dd = MAP.dist(sq.x, sq.y, f.x, f.y) * leanOf(corp, f.corpId);
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
      case 'reinforcing': {
        /* §RESERVE to the nearest beacon inside the ring, and hold it while there is anyone left to land */
        let b = null, bd = 9;
        for (const o of planet.objectives) {
          if (o.type !== 'sponsor_cache' || !MAP.siteLive(o, day) || !MAP.inZone(planet, day, o.x, o.y)) continue;
          const dd = MAP.dist(sq.x, sq.y, o.x, o.y);
          if (dd < bd) { bd = dd; b = o; }
        }
        if (b) return { type: 'claim', obj: b, tx: b.x, ty: b.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'resupplying': {
        const o = site(o2 => o2.type !== 'relay_mast' && o2.type !== 'sponsor_cache');
        if (o) return { type: 'claim', obj: o, tx: o.x, ty: o.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'prospecting': {
        const g = sq.corp && sq.corp.rep && sq.corp.rep.goal;
        const ask = g ? g.demands.filter(d => d.kind === 'resource')[0] : null;
        const o = site(o2 => o2.type === 'resource_site' && (!ask || o2.resource === ask.resource))
               || site(o2 => o2.type === 'resource_site');
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
      case 'recovering': {
        /* §SITES A HURT SQUAD GOES TO SHELTER. It held where it stood, so a rest site on the map
           was only ever reached by a squad that happened to be walking to it for its food.
           A squad recovering makes for the nearest live rest site it can reach inside the
           ring — and is exposed on the way, which is the price of being mended. */
        let rs = null, rd = 9;
        for (const o of planet.objectives) {
          if (o.type !== 'ration_site' || !MAP.siteLive(o, day)) continue;
          const dd = MAP.dist(sq.x, sq.y, o.x, o.y);
          if (dd < rd && MAP.inZone(planet, day, o.x, o.y)) { rd = dd; rs = o; }
        }
        if (rs && rd <= CONST.DAY_MARCH * 3) {
          sq._soughtRest = (sq._soughtRest || 0) + 1;
          return { type: 'claim', obj: rs, tx: rs.x, ty: rs.y, expires: day + CONST.PLAN_LIFE };
        }
        return { type: 'hold', tx: sq.x, ty: sq.y, expires: day + 3 };
      }
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
      case 'entrenching': {
        const p5 = MAP.clampInside(planet, day + 4, sq.x, sq.y);
        return { type: 'hold', tx: p5.x, ty: p5.y, expires: day + CONST.PLAN_LIFE };
      }
      case 'baiting': {
        /* stand where we are and be seen; the crowd calls it nerve */
        return { type: 'hold', tx: sq.x, ty: sq.y, expires: day + 3, loud: true };
      }
      case 'sweeping': {
        /* the nearest ground nobody has looked at, inside the wall */
        const dark = (planet.objectives || []).filter(o => !o.revealed)
          .sort((a, b) => MAP.dist(sq.x, sq.y, a.x, a.y) - MAP.dist(sq.x, sq.y, b.x, b.y))[0];
        if (dark) { const p6 = MAP.clampInside(planet, day, dark.x, dark.y); return { type: 'patrol', tx: p6.x, ty: p6.y, expires: day + CONST.PLAN_LIFE }; }
        break;
      }
      case 'pressing': {
        if (near) return { type: 'hunt', tx: near.x, ty: near.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'shadowing': {
        const t = foreign.filter(f => (f.n || 0) > squadHead(sq).length && MAP.dist(sq.x, sq.y, f.x, f.y) < CONST.SHADOW_RANGE)
                         .sort((a, b) => MAP.dist(sq.x, sq.y, a.x, a.y) - MAP.dist(sq.x, sq.y, b.x, b.y))[0];
        if (t) return { type: 'shadow', target: t.corpId + ':' + t.sq.sIdx, tx: sq.x, ty: sq.y, expires: day + CONST.PLAN_LIFE };
        break;
      }
      case 'screening': {
        const digger = corp.squads.find(s => s !== sq && squadHead(s).length && s.intent && (s.intent.type === 'claim' || s.intent.type === 'hold'));
        if (digger) {
          const th = foreign.sort((a, b) => MAP.dist(digger.x, digger.y, a.x, a.y) - MAP.dist(digger.x, digger.y, b.x, b.y))[0];
          return { type: 'screen', mate: digger, target: th ? th.corpId + ':' + th.sq.sIdx : null, tx: digger.x, ty: digger.y, expires: day + CONST.PLAN_LIFE };
        }
        break;
      }
      case 'rallying': {
        /* to the middle of my own OA, inside the wall: everyone rallying meets there */
        const mates = corp.squads.filter(s => squadHead(s).length);
        if (mates.length > 1) {
          let cx = 0, cy = 0; for (const s of mates) { cx += s.x; cy += s.y; } cx /= mates.length; cy /= mates.length;
          const p = MAP.clampInside(planet, day, cx, cy);
          /* MEET, THEN STRIKE: if what drove us together is something we can beat together,
             the rendezvous carries the strike with it */
          const together = mates.reduce((n, s) => n + squadHead(s).length, 0);
          const th = foreign.filter(f => MAP.dist(cx, cy, f.x, f.y) < CONST.RALLY_THREAT_RANGE && together > (f.n || 0) * 1.25)
                            .sort((a, b) => MAP.dist(cx, cy, a.x, a.y) - MAP.dist(cx, cy, b.x, b.y))[0];
          return { type: 'meet', tx: p.x, ty: p.y, expires: day + CONST.PLAN_LIFE, then: th ? th.corpId + ':' + th.sq.sIdx : null };
        }
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

  /* the two ways size reads on the ground — see the RULED comment on the constants */
  function sizeMarchMult(sq) {
    return 1 + (CONST.SIZE_PIVOT - squadHead(sq).length) * CONST.SIZE_MARCH_PER_BODY;
  }
  function carryMult(sq) {
    const burden = sq.bodies.filter(b => b.status === 'injured').length;
    return 1 / (1 + burden * CONST.CARRY_SLOW_PER_BODY);
  }
  function paceMult(sq) {
    const head = squadHead(sq);
    if (!head.length) return 1;
    let sum = 0;
    for (const b of head) sum += (b.stats && b.stats.reflex) || CONST.PACE_PIVOT;
    return Math.max(CONST.PACE_MIN, Math.min(CONST.PACE_MAX, 1 + (sum / head.length - CONST.PACE_PIVOT) * CONST.PACE_PER_REFLEX));
  }
  function sizeDetectMult(sq) {
    return 1 + (squadHead(sq).length - CONST.SIZE_PIVOT) * CONST.SIZE_DETECT_PER_BODY;
  }

  function detectChance(rng, sqA, sqB, planet, day, night, mx, my, sep, stats) {
    /* §STANCE each side reads the OTHER through the notch it holds toward them */
    const dA = squadDials(sqA), dB = squadDials(sqB);
    /* The seekers ARE the term, not a bonus on top of a flat base. With `1 + seekA + seekB`
       the span between two hiding corps and two hunting ones was only 2.5x, and co-location
       swamped it — so the six dials never produced the ladder. This spans ~9x. */
    let p = CONST.DETECT_BASE * (dA.seek + dB.seek);
    p *= planet.concealAt(mx, my);
    /* §7.5 the high ground sees the low: the further apart in height, the sooner somebody
       is seen */
    if (planet.heightAt) p *= 1 + CONST.HEIGHT_SPOT * Math.abs(planet.heightAt(sqA.x, sqA.y) - planet.heightAt(sqB.x, sqB.y));
    if (stats && stats.weatherToday && stats.weatherToday.fx.sight) p *= stats.weatherToday.fx.sight;   /* §5.3 a whiteout blinds */
    /* eight leave a trail that three do not: size reads on both squads in the pair */
    p *= sizeDetectMult(sqA) * sizeDetectMult(sqB);
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
    /* §LIGHT the dark lowers the floor too: crowding still finds people, but a crowd in the dark finds
       them far less — without this the floor overrode the night entirely as the ring closed */
    const floor = CONST.DETECT_FLOOR * (comp - 1) / (CONST.DETECT_COMPRESSION_MAX - 1) * (night ? CONST.DETECT_NIGHT : 1);
    return Math.min(0.95, Math.max(p, floor));
  }

  /* Declining is an ATTEMPT, not a guarantee (§6.1). Escape room collapses as the map does. */
  function tryEscape(rng, sq, planet, day, seekerStat) {
    const z = MAP.zoneOn(planet, day);
    /* A corp that declared preservationist is genuinely trying to leave; a standard corp
       declining a fight is half-hearted about it. Effort scales with (1 - accept). */
    const accept = squadDials(sq).accept;
    let p = CONST.ESCAPE_BASE * (0.60 + 0.80 * (1 - accept))
      + CONST.ESCAPE_FIELDCRAFT * (squadStat(sq, 'fieldcraft') - 100)
      - CONST.ESCAPE_FIELDCRAFT * (seekerStat - 100);
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
        sq.rations += CONST.RATION_DROP_DAYS * squadHead(sq).length * 0.8 * pot;
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
    if (opts.planet && (opts.planet.objectives || []).some(o => o.type === 'strongpoint' &&
        o.heldBy === sq.corpId && MAP.dist(sq.x, sq.y, o.x, o.y) <= MAP.CONST.CLAIM_RADIUS * 1.6)) {
      p += CONST.STRONGPOINT_PREP;
      sq._onStrongpoint = true;
    }
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
  function transferFame(victim, takers, victimCorp, takerCorp) {
    const gain = REP.fameTransfer(victim.fame || 0, 1) * underdogMult(victimCorp, takerCorp);
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
    /* §RESERVE A SQUAD THAT LOST PEOPLE THINKS AGAIN. A plan is only remade when it runs out, and the first one is
       made at the drop, before anyone is lost — so a squad bled in a fight went on with the plan it had, and never
       weighed walking to a beacon to be made whole. If its OA still has fighters in orbit, its plan is set aside. */
    if (killed + downed > 0) {
      const squads = side._parts ? side._parts.map(p => p._sq) : [sq];
      for (const q of squads) if (q && q.corp && q.corp.reserve && q.corp.reserve.length) {   /* a strike is spent once fought */
        q.intent = null; q.approachUntil = 0;
      }
    }
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
    CORPS_REF = corps;                  /* §SNOWBALL the hunters’ view of who is on the ground */
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
    const spin = rng() * Math.PI * 2;
    const sectorPick = opts.dropSectors || {};
    const sectorCount = 6;
    /* §DROP THE DISPERSED DROP: opts.dropSlots = { corpId: [slotIndex per squad] } on a ring
       of opts.slotCount points. A corp's squads land where its picks put them — apart, if it
       chose apart — and know where every other OA came down (the draft is posted). A
       corp with no picks lands the old way, together in its sector. */
    /* §DROP A LANDING IS A PLACE ON THE GROUND, NOT AN INDEX ON A RING. The draft deals the
       numbered landings `predivide.slots()` lays out — several bands at different depths,
       nudged off each other and snapped to passable ground — and this placed a squad by
       recomputing `(slot / slotCount) × 2π` on ONE ring of its own. Every pick therefore
       landed somewhere else: five landings chosen together in one corner came down scattered
       round the rim, and a manager's whole drafting decision was thrown away between the
       screen that took it and the ground that used it. The slots themselves are the truth. */
    const slotPicks = opts.dropSlots || null, slotCount = opts.slotCount || 24;
    const slotList = slotPicks && PRE && PRE.slots ? PRE.slots(planet, slotCount) : null;
    for (let ci = 0; ci < corps.length; ci++) {
      const picked = sectorPick[corps[ci].id];
      if (slotPicks && slotPicks[corps[ci].id]) {
        const squads = corps[ci].squads, mine = slotPicks[corps[ci].id];
        for (let si = 0; si < squads.length; si++) {
          const slot = mine[si] != null ? mine[si] : mine[mine.length - 1];
          const sl = slotList && slotList[slot];
          if (sl) { squads[si].x = sl.x; squads[si].y = sl.y; }
          else {
            const a = (slot / slotCount) * Math.PI * 2, d = planet.radius * CONST.DROP_RING;
            squads[si].x = planet.cx + Math.cos(a) * d; squads[si].y = planet.cy + Math.sin(a) * d;
          }
          squads[si].hx = squads[si].x; squads[si].hy = squads[si].y; squads[si].slot = slot;
        }
        continue;
      }
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
      /* §7.6 nobody lands in the water or on a peak */
      const q = planet.nearestPassable ? planet.nearestPassable(p.x, p.y) : p;
      sq.x = q.x; sq.y = q.y;
    }
    /* THE DRAFT IS POSTED: every OA knows where every other came down */
    for (const c of corps) for (const oc of corps) if (oc !== c) for (const sq of oc.squads) recordSighting(c, sq, 1, true);
    /* §5.3b THE FLEET'S REGARD FOR EACH OA, read once and carried on the corp, so the
       negotiation can price a banner by what it costs a joiner's people to fight under it */
    if (REP && opts.reputations) for (const c of corps) {
      const rp = opts.reputations[c.id];
      if (rp) c._fleetStanding = REP.standing(rp, 'fleet');
      /* §MIND an AI OA leans the way its own regard leans: it seeks out the OAs it
         thinks least of and gives the ones it respects a wider berth */
      /* §STANCE AN OA IS NOT ONE MIND. An AI OA gives each of its squads a notch around its
         declared stance rather than the same one: its strongest squad a step bolder, its
         weakest a step more careful, the rest where its culture puts them. That is what a
         manager would do with the same squads, and it means an AI field is not eight blocks
         moving in lockstep. */
      if (!isHumanOA(c.id)) {
        const base = NOTCHES.indexOf(c.policy || 'standard');
        const live = (c.squads || []).filter(q => squadHead(q).length);
        const ranked = live.slice().sort((a, b) => squadHead(b).length - squadHead(a).length);
        ranked.forEach((q, i) => {
          const step = i === 0 && ranked.length > 1 ? 1 : i === ranked.length - 1 && ranked.length > 1 ? -1 : 0;
          q.stance = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, (base < 0 ? 2 : base) + step))];
        });
      }
      if (rp && !isHumanOA(c.id)) {
        /* §STANCE an AI OA sets the same control a manager does: a notch AT each rival, from
           its own declared stance, hardened toward the OAs it thinks least of and softened
           toward the ones it respects. (It was a separate 1-5 leaning; one control now.) */
        c._stance = c._stance || {};
        const base = NOTCHES.indexOf(c.policy || 'standard');
        for (const other of corps) {
          if (other === c) continue;
          const r = REP.standing(rp, 'rival', other.id);
          const step = r < -20 ? 2 : r < -5 ? 1 : r > 20 ? -2 : r > 5 ? -1 : 0;
          c._stance[other.id] = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, (base < 0 ? 2 : base) + step))];
        }
      }
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
      wingInjuries: 0, ththynSerious: 0, hazards: 0, hazardInjuries: 0, degradations: 0,
      _corps: corps,   /* the relay broadcast needs the whole field, §2.4 */
      claims: 0, relayFirings: 0, stanceChanges: 0, windows: 0, forcedContacts: 0, escapes: 0,
      deals: [], pacts: 0, offersSent: 0,
      ransoms: 0, pactsBroken: 0, contactsDeclined: 0, supplyMoved: 0,
      contactOffers: 0, engagementsByWeek: [0, 0, 0, 0, 0], rationShortDays: 0, squadDays: 0,
      corpCount, perCorp: corps.map(c => ({ id: c.id, policy: c.policy, declaredAt: c.declaredAt, permanent: 0, injuredHome: 0, engagements: 0 })),
      archetype: planet.archetype, offersBy: {}, escapesBy: {}, colocDays: {}, passedOver: 0,
      audit: {
        forageEvents: 0, forageYield: 0, domeDeaths: 0, lineEvade: 0, carriedOut: 0, zoneRiskVeto: 0, nightMarch: 0,
        /* `stats.passedOver` is declared and `stats.audit.passedOver` was not, while both are
           raised on the same line — so one counted and the other was NaN from the first
           increment. Found by running a contest and looking for NaN, not by reading. */
        passedOver: 0,
        huntMoves: 0, evadeMoves: 0, driftMoves: 0, objectiveMoves: 0,
        awarded: {}, hazardKind: {}, terrainUsed: {}, bandOpen: [0, 0, 0],
        relayIntelUsed: 0, relayEscapeUsed: 0, landed: 0, beaconContested: 0, ammoResupply: 0,
        weakDiscount: 0, lateReveals: 0,
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
      /* §PLACEMENT WHEN AN OA LEAVES THE GROUND is its place: the day it withdrew, had its banner pulled or lost its last
         fighter. Nothing recorded it, so every OA but the winner was ranked in LIST ORDER — the board's "place Nth or
         better" was decided by where an OA sat in the fleet's list; it only showed once most OAs left by withdrawal. */
      for (const c of corps) if (c._downedOn == null && (c.withdrawn || !(c.squads || []).some(q => squadHead(q).length))) c._downedOn = day - 1;
      stats.days = day;
      rollWeather(rng, planet, stats, day);
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

      /* THE DISPLACEMENT WAS HERE — the wall used to step overnight further than a day's
         march and throw whoever it caught onto the new edge. Ruled out at the animation
         pass: the dome closes continuously (see map.js zoneOn), it NEVER moves anyone,
         and its line is answered by the squads' own logic. Any able squad that dawn
         finds outside today's line drops what it was doing and walks in — its own legs,
         on the record. The dome takes whoever is still outside at dusk. */
      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        const dz = MAP.dist(sq.x, sq.y, zNow.cx, zNow.cy);
        if (dz <= zNow.r) continue;
        if ((sq._busyUntil || 0) > (day - 1) * CONST.TICKS_PER_DAY) {
          /* NOBODY ARGUES WITH THE DOME. A fight it reaches breaks off — both sides,
             each the moment its own dawn finds it outside the line — because staying
             is not a stance, it is a death. Breaking under fire costs composure. */
          sq._busyUntil = 0;
          addStress(sq, 4, stats);
          stats.audit.lineBrokeFight = (stats.audit.lineBrokeFight || 0) + 1;
        }
        /* AIM DEEP ENOUGH THAT ARRIVAL CANNOT PRE-EMPT THE WALK. The first cut aimed
           at 0.9·r; on the late contest's small circles that point sits inside
           ARRIVE_SLACK of a rim squad, movement ruled them “arrived”, and they stood
           obediently still — millimetres outside — while the line passed through
           them. The target now sits a real margin inside, whatever the circle's size. */
        const inR = Math.max(zNow.r * 0.5, zNow.r - Math.max(0.03, zNow.r * 0.2));
        const k = inR / Math.max(1e-9, dz);
        sq.intent = { type: 'withdraw',
                      tx: zNow.cx + (sq.x - zNow.cx) * k,
                      ty: zNow.cy + (sq.y - zNow.cy) * k };
        stats.audit.lineEvade = (stats.audit.lineEvade || 0) + 1;
      }


      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        sq._day = day; sq._st = stats;
        sq.movedToday = false; sq.foughtToday = false; sq._lostDay = false; sq._hunted = false;
      }
      if (MAP.isWindowDay(planet, day)) stats.windows++;

      /* §CLOCK a squad's reading of its captain is taken when it plans — after the window now — so on the
         first morning, at the drop, nobody had one yet and the Desk named no captain. It is read here too. */
      for (const c of corps) for (const q of c.squads) if (!q._mind && squadHead(q).length) {
        const mind = captainMind(q);
        q._mind = { judge: Math.round(mind.judge * 100) / 100, sight: Math.round(mind.sight * 100) / 100,
                    nerve: Math.round(mind.nerve * 100) / 100, cap: mind.cap ? mind.cap.name : null };
      }
      /* §CLOCK THE COMMS WINDOW STANDS AT DAWN, BEFORE THE MARCH (ruled). It was taken at DUSK, after the
         day's march and fights, so squads walked days 1 and 2 before a manager could give them a single
         order, and the first thing he saw was day 2. Everything a window does — the table, the reform of
         spent squads, the manager's answer — now happens here, after the ring and the weather are known and
         before any squad plans its day: the first window is the drop itself, and an order given on day 3
         shapes day 3. */
      /* --- THE CORP CHANNEL: negotiation (NEGOTIATION.md §11) ---
             Deals happen only in a corp comms window, on air, and never through a drop
             leader — a field commander interprets standing orders and nothing else. The
             cadence is the map's, not the calendar's, so as the ring closes the table opens
             daily, which is exactly when there is something to talk about. */
      if (!opts.noNegotiation && MAP.isWindowDay(planet, day)) {
        if (runCorpChannel(rng, corps, planet, day, stats, opts) === true) break;
      }

      /* --- reform: a spent squad is broken up and its survivors SPREAD across the corp's
             other squads, two here and two there, rather than dumped whole on the nearest.
             Only at a comms window, and only if the others are close enough to reach. --- */
      if (MAP.isWindowDay(planet, day)) {
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
              host.bodies.push(b);   /* their stress rides with them — it is theirs */
            });
            for (const h of hosts) h.rations += share;
            q.bodies = []; q.rations = 0; q.intent = null;
            /* §MAP the emptied squad is recorded as FOLDED, not down: on the map a squad with
               nobody left read as a death with no fight beside it, and this was most of those */
            q._reformed = day;
            q._downAt = { x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000 };
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
      if (MAP.isWindowDay(planet, day)) {
        const board = NEG.oddsBoard(umbrellasOf(corps), {
          meanEngagements: corps.reduce((a, c) => a + c.engagements, 0) / Math.max(1, corps.length)
        });
        const zNow = MAP.zoneOn(planet, day);
        const penned = zNow.r <= planet.radius * CONST.CORNERED_ZONE_FRAC;
        if (!opts.stanceFixed) for (const c of corps) {
          /* the corp a person is holding is NOT re-stanced by its own AI — that is the whole
             point of the window. Everybody else's squad leaders reorganise as they always did. */
          if (isHumanOA(c.id)) continue;
          const mine = board[principalOf(c).id] || 0;
          reconsiderStance(rng, c, stats, { penned: penned, ahead: mine > 0.28 });
        }

        /* THE WINDOW. Comms are up; this is where a manager speaks to their people and to the
           other banners. Yielding here rather than at a fixed number of days is deliberate: the
           cadence is the planet's, tightening from two days to one as the ring closes, and a
           player's rhythm has to be the same one the fleet is on. */
        /* §SEATS (ruled: eight players) EVERY PERSON'S WINDOW. It served one manager: one "you", one pause, one
           answer. Now the window is built for each seat a person holds, the Divide pauses once holding every
           view, and each answer is applied to its own OA. With one person the pause carries that person's view
           exactly as before (and a plain answer is theirs); several send `{ bySeat: { id: answer } }`. */
        if (_humans.size) {
          const seatIds = corps.filter(c => isHumanOA(c.id)).map(c => c.id);
          stats._fightCursor = stats._fightCursor || {};
          stats._echo = stats._echo || {};
          /* §SECRECY (ruled: each seat sees only what it knows) A SEAT'S VIEW HOLDS ITS OWN OA IN FULL AND EVERY OTHER AS A
             PUBLIC SHELL — its name, its place in the fleet's order, whether it has withdrawn, and how many of its people
             still stand (the broadcast shows that) — never a rival's roster, squads, positions, stances or treasury. The
             contest's internal state and the true ground are not sent at all, and the record is trimmed to the seat's own
             squads: rivals reach a seat only as its squads saw them (the picture) and as it fought them. A test may ask
             for everything with `debugViews`. */
          const shellOf = (c) => {
            const all = c.allBodies || [];
            return { id: c.id, profile: c.profile ? { id: c.profile.id, name: c.profile.name } : null,
                     withdrawn: c.withdrawn ? { day: c.withdrawn.day } : null,
                     standing: { up: all.filter(b => b.status === 'active').length, of: all.length },
                     squads: [], allBodies: [], shell: true };
          };
          /* A SEAT'S OWN OA GOES OUT AS A SNAPSHOT, not the engine's live object: its squads held `_st` (the contest's
             whole internal state, every OA in full) and its sightings held live links to the rival squads they saw,
             so "its own OA in full" handed over the world by the back door. The copy keeps the OA's own sharing (a
             fighter in a squad and on the roster stays one), cuts those back-references, and reduces anything of a
             rival it still reaches to an id. */
          const snapshotOwn = (c) => {
            const seen = new Map(), rivals = new Set(corps.filter(x => x.id !== c.id).map(x => x.id));
            const DROP = { _st: 1, _picture: 1, _corps: 1, persist: 1 };
            const clone = (v) => {
              if (v === null || typeof v !== 'object') return v;
              if (seen.has(v)) return seen.get(v);
              if (v !== c && v.allBodies && v.squads && rivals.has(v.id)) return { id: v.id };
              if (v.corpId && rivals.has(v.corpId) && v.bodies) return { corpId: v.corpId };
              const out = Array.isArray(v) ? [] : {};
              seen.set(v, out);
              for (const k of Object.keys(v)) {
                if (DROP[k]) continue;
                const x = v[k];
                if (typeof x === 'function') continue;
                out[k] = clone(x);
              }
              return out;
            };
            return clone(c);
          };
          const worldFor = (seatId) => {
            if (opts.debugViews) return { corps: corps, stats: stats, planet: planet, record: REC ? REC.days : null };
            const idx = corps.findIndex(c => c.id === seatId);
            return {
              corps: corps.map(c => c.id === seatId ? snapshotOwn(c) : shellOf(c)),
              record: REC ? REC.days.map(d => Object.assign({}, d, { sq: (d.sq || []).filter(q => q.c === idx) })) : null
            };
          };
          const viewFor = (seatId) => {
            const world = worldFor(seatId);
            const you = corps.filter(c => c.id === seatId)[0];
            /* WHAT IS ON THE TABLE. Priced by `offerRange` and `evaluateOffer` — the same
               functions the AI is scored by, which is why they were split out in the first place.
               A parallel valuation for the human would be a second game. */
            const nctx = makeNegContext(rng, corps, planet, day, stats);
            /* §JOINING RETIRED the table carries truces and ransoms; its three joining lists (who asks to come in,
               whose banner you could join, who would join yours) were priced every window and read by nothing */
            const table = { pacts: [], ransoms: [] };
            /* §6.15 his ransoms: his people held for a price, and other OAs' people he holds */
            for (const k of (stats.ransomCases || [])) {
              if (k.done) continue;
              const side = k.owner === you.id && k.ownerYes == null ? 'owner' : k.captor === you.id && k.captorYes == null ? 'captor' : null;
              if (!side) continue;
              table.ransoms.push({ side: side, fighter: k.fighter, name: k.name, corp: side === 'owner' ? k.captor : k.owner,
                                   price: k.price, worth: k.worth, day: k.day });
            }
            for (const other of corps) {
              if (isHumanOA(other.id)) continue;
              if (pactHolds(you, other, day)) continue;
              /* A PACT IS ASKED FOR BY THE WEAKER SIDE, and the gate has more to it than that —
                 how far apart the odds are, and how much the other OA cares. Asked of
                 `negotiate.js`, which owns the rule, rather than re-derived here: two descriptions
                 of one rule agree until somebody edits one of them. */
              const pv = NEG.pactChance(you, other, nctx, {});
              /* the page prices its own sweetener from these, without a second rule */
              table.pacts.push({ corp: other.id, live: false,
                                 viable: pv.possible, chance: pv.p, why: pv.why || null,
                                 pot: nctx.pot || 0, ahead: (nctx.odds[nctx.principalOf(you).id] || 0) >= (nctx.odds[nctx.principalOf(other).id] || 0) });
            }

            /* everything your people were in since the last window — handed over once, then
               cleared, so the list is "what happened while you were away" rather than a log that
               grows all contest and is re-read every time. */
            /* §SEATS the fights THIS seat's people were in since ITS last window */
            const cur = stats._fightCursor[seatId] || 0;
            const since = (stats._fights || []).slice(cur).filter(fx => (fx.corps || []).indexOf(seatId) >= 0);
            stats._fightCursor[seatId] = (stats._fights || []).length;

            /* THE ANSWER'S VERDICT COMES BACK. evaluateOffer's whole design is a refusal
               with numbers — which side was short, and by how much — and for the human that
               verdict was computed and dropped: only an audit counter survived. The echo of
               the LAST window's answer rides out with this one, so a manager's "no" arrives
               with its number the same way the engine promised itself it would. */
            const echo = stats._echo[seatId] || null;
            stats._echo[seatId] = null;
            return {
              kind: 'window', day: day, lastDay: MAP.CONST.LAST_GROUND_DAY,
              fights: since,
              cadence: MAP.windowCadence(planet, day),
              odds: board, penned: penned, zone: zNow, table: table,
              weather: stats.weatherToday ? { day: stats.weatherToday.day, kind: stats.weatherToday.kind, fx: stats.weatherToday.fx } : null,
              /* §RESERVE who of yours has landed at a beacon, and how many are still in orbit */
              landings: (stats.landings || []).filter(l => l.corp === seatId),
              reserveLeft: ((corps.find(c => c.id === seatId) || {}).reserve || []).filter(f => !f.mirror_of).length,
              /* §WITHDRAWAL what the field has said about your offer, and the offer itself */
              withdrawOffer: (stats.withdrawOffers || {})[you.id] ? { terms: stats.withdrawOffers[you.id].terms,
                                                     sentDay: stats.withdrawOffers[you.id].sentDay } : null,
              withdrawReplies: (stats.withdrawOffers || {})[you.id] ? Object.assign({}, stats.withdrawOffers[you.id].replies) : null,
              /* §WITHDRAWAL the offers the others have out — each wants to leave, and asks you a promise */
              withdrawAsks: Object.keys(stats.withdrawOffers || {}).filter(k => k !== you.id).map(k => {
                const o = stats.withdrawOffers[k];
                return { from: k, terms: o.terms, sentDay: o.sentDay, yours: o.replies[you.id] == null ? null : o.replies[you.id] };
              }),
              picture: pictureForMap(you, day).map(e => ({ key: e.corpId + ':' + e.sq.sIdx, corpId: e.corpId, x: e.x, y: e.y, day: e.day, n: e.n, landing: !!e.landing, via: e.via || 'contact', down: !!e.down, stale: !!e.stale })),
              leanings: Object.assign({}, you._leanings || {}),
              /* the wall's remaining beats, so a manager can plan against the clock */
              wall: MAP.wallSchedule(planet, day),
              /* §STORES WHAT THE GROUND HAS GIVEN YOU SO FAR, in the units the board asks in,
                 and by category — so a manager can see the point of the contest while it is
                 still running, instead of a year later on the Board */
              banked: Object.assign({}, you._banked || {}),
              bankedBy: (function () {
                const by = {};
                for (const rid in (you._banked || {})) {
                  const cat = MAP.resourceCategory ? MAP.resourceCategory(rid) : null;
                  if (cat) by[cat] = (by[cat] || 0) + you._banked[rid];
                }
                return by;
              })(),
              /* what is left in the ground that this OA knows of, by category */
              openBy: (function () {
                const by = {};
                for (const o of planet.objectives || []) {
                  if (o.type !== 'resource_site' || o.looted || !o.revealed) continue;
                  const cat = o.category || (MAP.resourceCategory ? MAP.resourceCategory(o.resource) : null);
                  if (cat) by[cat] = (by[cat] || 0) + Math.round(o.potency || 1);
                }
                return by;
              })(),
              /* the days so far, with their tracks, so the window can be walked and watched — the
                 page keeps to its own squads' tracks; the rest is the picture */
              record: world.record,
              corps: world.corps, you: opts.debugViews ? you : world.corps.find(c => c.id === seatId), echo: echo,
              stats: opts.debugViews ? stats : undefined, planet: opts.debugViews ? planet : undefined
            };
          };
          const views = {};
          for (const id of seatIds) views[id] = viewFor(id);
          /* every seat has read the fights up to here: the log keeps only what someone has not yet seen */
          const seen = Math.min.apply(null, seatIds.map(id => stats._fightCursor[id] || 0));
          if (seen > 0 && stats._fights) { stats._fights.splice(0, seen); for (const id of seatIds) stats._fightCursor[id] -= seen; }
          const lead = (_manager && views[_manager]) ? _manager : seatIds[0];
          const reply = yield Object.assign({}, views[lead], { seats: views, lead: lead });
          const answers = (reply && reply.bySeat) ? reply.bySeat : { [lead]: reply };
          /* §SEATS a reply may carry seats changing hands: from the next window the engine plays a seat its person
             left, and a seat a person took is in the pause */
          if (reply && reply.seats) {
            for (const id in reply.seats) {
              if (!corps.some(c => c.id === id)) continue;
              if (reply.seats[id] === 'human') _humans.add(id); else _humans.delete(id);
            }
            if (!_humans.has(_manager)) _manager = _humans.size ? [..._humans][0] : null;
          }
          const applyAnswer = (seatId, answer) => {
            const you = corps.filter(c => c.id === seatId)[0];
            /* what came back: a stance, and any deals the manager chose to answer */
            if (answer && answer.stance) {
              const you = corps.filter(c => c.id === seatId)[0];
              /* NOT gated on `sealed`. That flag means an OA refuses to NEGOTIATE — a permanent
                 cultural thing held in the profile — and §7.3 is explicit that no corp is ever
                 locked out of any notch and that culture is not a stance. Guarding the dial with
                 it silently pinned Nevlon and every other no-negotiation OA to whatever they
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

            /* THE MANAGER'S SECOND LEVER. Not orders — a leaning, one to five, on each other
               OA: which of them he would rather his people found. It is a thumb on the scale
               the squads are already weighing, never an instruction. Per-squad orders lived here
               for a step and were the wrong game: a manager sets a policy and a preference, and
               what a squad does with them is the squad's. */
            /* §STANCE the manager's notch for each of his squads, by squad index: it rides into
               the contest and stays until he sets it again */
            if (answer && answer.squadStance) {
              const youS = corps.filter(c => c.id === seatId)[0];
              if (youS) for (const k in answer.squadStance) {
                const q = youS.squads[+k], n = answer.squadStance[k];
                if (q && STANCE_DIALS[n]) q.stance = n;
              }
            }
            if (answer && (answer.stanceAt || answer.leanings)) {
              const youL = corps.filter(c => c.id === seatId)[0];
              if (youL) {
                /* §STANCE the notch set AT each OA rides into the contest and stays until it is
                   set again — it is the manager's standing instruction toward that OA, not an
                   order for one window */
                youL._stance = youL._stance || {};
                for (const k in (answer.stanceAt || {})) setStance(youL, k, answer.stanceAt[k]);
                /* a saved game from before the merge carries 1-5 leanings; they read as notches */
                for (const k in (answer.leanings || {})) {
                  const n = NOTCHES[Math.max(0, Math.min(4, (+answer.leanings[k] || 3) - 1))];
                  if (n) setStance(youL, k, n);
                }
              }
            }

            /* THE NEGOTIATION HALF. The comment above claimed this existed for two steps and it
               did not: only `answer.stance` was ever read, so a manager could be handed a window
               and had nothing to say in it but a notch. Prose describing work that was not done.

               `sealed` gates HERE, and only here — an OA that refuses to negotiate is a
               cultural fact and not a stance, and gating the dial with it pinned every
               no-negotiation OA to whatever it dropped with. */
            const you2 = corps.filter(c => c.id === seatId)[0];
            /* §WITHDRAWAL A PUBLIC OFFER, ANSWERED BY THE WHOLE FIELD. A withdrawal is not a
               trade between two OAs: the manager posts ONE offer — I stand down now, whoever
               wins pays me this — and every OA still on the ground answers it. Nobody is bound
               by their answer; the OA that takes the ground decides at the settlement which
               promises it keeps, and what it decides is written into its record. The offer
               travels like every other (§CLOCK): posted at one window, answered at the next. */
            /* §WITHDRAWAL `sealed` does NOT gate this. An OA that refuses to negotiate refuses
               to bargain for advantage; conceding the ground and taking its people home is
               not a bargain of that kind, and a manager of such an OA would otherwise have no
               way off the planet at all. */
            if (answer && answer.withdrawOffer && you2 && !you2.withdrawn) postWithdrawOffer(you2, answer.withdrawOffer, day, stats);
            /* §WITHDRAWAL and he answers the offers the others have out, as they answer his */
            if (answer && answer.withdrawReplies && you2 && !you2.withdrawn) {
              for (const fromId in answer.withdrawReplies) {
                const o = (stats.withdrawOffers || {})[fromId];
                if (o && o.from !== you2.id) o.replies[you2.id] = !!answer.withdrawReplies[fromId];
              }
            }
            /* the manager stands down on the replies he has: whoever said yes is on record */
            if (answer && answer.withdrawNow && you2 && !you2.withdrawn) standDown(you2, day, stats, corps);
            /* §CHOICES his answer to a ransom case: Pay or Decline as the owner, Sell or Keep as the captor */
            if (answer && answer.deal && you2 && /^ransom_/.test(answer.deal.kind || '')) {
              const d = answer.deal, yes = d.kind === 'ransom_pay' || d.kind === 'ransom_sell';
              const k = (stats.ransomCases || []).find(x => !x.done && x.fighter === d.fighter);
              if (k && k.owner === you2.id && (d.kind === 'ransom_pay' || d.kind === 'ransom_decline')) k.ownerYes = yes;
              if (k && k.captor === you2.id && (d.kind === 'ransom_sell' || d.kind === 'ransom_keep')) k.captorYes = yes;
              if (k && k.ownerYes && k.captorYes) {
                const owner = corps.find(c => c.id === k.owner), captor = corps.find(c => c.id === k.captor);
                const f = owner && owner.allBodies.find(b => b.id === k.fighter);
                if (f && f.status === 'captured' && captor && stats._settleRansom)
                  stats._settleRansom({ kind: 'ransom', captor: captor.id, owner: owner.id, fighter: f.id, price: k.price, day: day, worth: k.worth }, f, owner, captor);
                k.done = true;
              }
              stats._echo[seatId] = { kind: d.kind, corp: d.corp, name: k ? k.name : '', price: k ? k.price : 0 };
            }
            if (answer && answer.deal && you2 && !sealed(you2) && !/^ransom_/.test(answer.deal.kind || '')) {
              const d = answer.deal;
              const nctx2 = makeNegContext(rng, corps, planet, day, stats);
              /* §JOINING RETIRED the manager's join and take answers are gone with the composer's two joining
                 ways; a truce is the one deal made at the table */
              if (d.kind === 'pact') {
                const other = corps.filter(c => c.id === d.corp)[0];
                if (other && !sealed(other)) {
                  /* the chance the beam showed is the chance rolled; credits sweeten it */
                  const pc = NEG.pactChance(you2, other, nctx2, d.terms || {});
                  const pact = pc.possible && rng() < pc.p;
                  stats._echo[seatId] = { kind: 'pact', corp: d.corp, accepted: !!pact, credits: pact ? ((d.terms || {}).credits || 0) : 0, chance: pc.p };
                /* §AUTHORITY the sweetener moves when the truce is struck — by the engine, not the page on its next advance */
                const credits = pact ? ((d.terms || {}).credits || 0) : 0;
                const accA = you2.persist && you2.persist.account, accB = other && other.persist && other.persist.account;
                if (credits > 0 && accA && accB) {
                  LED.post(accA, 'pact', 'A Truce With ' + ((other.profile && other.profile.name) || other.id), -credits);
                  LED.post(accB, 'pact', 'A Truce With ' + ((you2.profile && you2.profile.name) || you2.id), credits);
                  stats._echo[seatId].paid = true;
                }
                  if (pact) {
                    you2._pacts = you2._pacts || {}; other._pacts = other._pacts || {};
                    const until = day + NEG.CONST.PACT_DAYS[1];
                    you2._pacts[other.id] = until; other._pacts[you2.id] = until;
                    stats.audit.humanPacts = (stats.audit.humanPacts || 0) + 1;
                  }
                }
              }
            }
          };
          for (const id of seatIds) applyAnswer(id, answers[id] || null);
        }
      }

      if (REC) {
        const sq = [];
        for (let ci = 0; ci < corps.length; ci++) {
          const c = corps[ci];
          for (let si = 0; si < c.squads.length; si++) {
            const q = c.squads[si];
            const alive = squadHead(q).length;
            /* A WIPED SQUAD IS NOT A SQUAD DOING THINGS. Without this, a squad whose
               last body went down kept its final per-tick label ('fighting'), re-emitted
               its dead men's march as a live track, and — because the dusk enforcement
               moves every marker inside the line — its corpse-marker crawled inward day
               after day. The animation mock made the ghost visible in minutes. The record
               now freezes a downed squad where it went down: no label, no aim, no track.
               Recorder-only bookkeeping; the engine's own state is untouched. */
            if (alive) q._downAt = null;   /* a revived squad may go down again, elsewhere */
            const justDown = !alive && !q._downAt;
            if (justDown) {
              q._downAt = { x: Math.round(q.x * 1000) / 1000,
                            y: Math.round(q.y * 1000) / 1000 };
              /* the dying day's walk is kept — they marched into the fight that took
                 them, and a record that forgets the march teleports them to the grave.
                 The track closes on the wipe site; every later day of theirs is empty. */
              if (!q._track || !q._track.length) q._track = [q._downAt.x, q._downAt.y];
              else if (q._track[q._track.length - 2] !== q._downAt.x ||
                       q._track[q._track.length - 1] !== q._downAt.y)
                q._track.push(q._downAt.x, q._downAt.y);
            }
            if (alive) {
              /* the day's true end: fight arrivals, reforms and the dusk clamp move
                 bodies after the last daylight sample, so the track closes on the
                 position the record itself is about to claim */
              const ex = Math.round(q.x * 1000) / 1000, ey = Math.round(q.y * 1000) / 1000;
              if (!q._track || !q._track.length) q._track = [ex, ey];
              else if (q._track[q._track.length - 2] !== ex ||
                       q._track[q._track.length - 1] !== ey) q._track.push(ex, ey);
            }
            const demand = Math.max(0.001, rationDemand(q, raceById) * planet.supplyStrain);
            /* `ax`,`ay` — where this squad is heading, which is also what it is facing.
               `tr`, the route already walked, is kept because the replay guard compares
               whole recordings, but a viewer should draw the aim: where somebody has been is
               a straight line between two points they are no longer at. */
            sq.push({ c: ci, s: si,
                      x: alive ? Math.round(q.x * 1000) / 1000 : q._downAt.x,
                      y: alive ? Math.round(q.y * 1000) / 1000 : q._downAt.y,
                      ax: alive && q._aim ? Math.round(q._aim.x * 1000) / 1000 : null,
                      ay: alive && q._aim ? Math.round(q._aim.y * 1000) / 1000 : null,
                      w: alive ? (q._why || 'drift') : (q._reformed ? 'folded' : 'down'), n: alive,
                      st: Math.round(squadStress(q)),
                      rat: Math.round(Math.min(30, q.rations / demand)),
                      g: q.crates, cl: q.claiming ? 1 : 0,
                      hb: q._heldToday || 0,        /* two-hour blocks spent in a firefight */
                      jn: q._joinedToday ? 1 : 0,   /* walked into one already in progress */
                      tr: alive || justDown ? (q._track || []) : [] });
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
                 h: o.heldBy, t: o.type, lbl: o.label,
                 on: o.type === 'sponsor_cache' && o.litDay === day ? o.litBy : null })),   /* §RESERVE a beacon lit today, and by whom */
          corp: corps.map(c => ({
            e: c.engagements, p: c.allBodies.filter(b => b.status === 'dead' || b.status === 'retired').length,
            a: c.allBodies.filter(b => b.status === 'active').length,
            w: c.allBodies.filter(b => b.status === 'injured').length,
            o: c.hauled, si: c.sitesClaimed, st: c.policy,
            sd: Math.round(standing(c) * 100)
          })),
          ev: dayEvents
        });
      }

      /* --- termination (N18) --- */
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

      /* --- AFTER THE PLAN: SOMEBODY GOES BACK FOR THEM. Assigned after the drop
         leader plans, so the plan cannot stomp it the same morning. A squad with nobody standing cannot
         march, and under the dome that is a death sentence unless its corp's own
         logic answers — so it does: the nearest standing squad within RESCUE_RANGE
         drops its intent and walks to carry them out. One rescuer per casualty;
         the walk records as 'rescue' and the pickup happens at dusk, by proximity,
         so a squad that merely passes its fallen also gathers them. --- */
      for (const c of corps) for (const sq of c.squads) {
        if (squadHead(sq).length) continue;
        if (!sq.bodies.some(b => b.status === 'injured')) continue;
        /* the guard checks the rescuer is still actually rescuing — a planner or a
           window can retask anyone, so the assignment reasserts every dawn */
        if (sq._rescueBy && squadHead(sq._rescueBy).length &&
            (sq._rescueBy._busyUntil || 0) <= (day - 1) * CONST.TICKS_PER_DAY &&
            sq._rescueBy.intent && sq._rescueBy.intent.type === 'rescue') continue;
        sq._rescueBy = null;
        let best = null;
        for (const s2 of c.squads) {
          if (s2 === sq || !squadHead(s2).length) continue;
          if ((s2._busyUntil || 0) > (day - 1) * CONST.TICKS_PER_DAY) continue;
          if (s2.intent && s2.intent.type === 'rescue') continue;
          const dd2 = MAP.dist(s2.x, s2.y, sq.x, sq.y);
          if (dd2 > CONST.RESCUE_RANGE) continue;
          if (!best || dd2 < best.dd2) best = { s2, dd2 };
        }
        if (!best) continue;
        best.s2.intent = { type: 'rescue', tx: sq.x, ty: sq.y };
        sq._rescueBy = best.s2;
        stats.audit.rescuesSent = (stats.audit.rescuesSent || 0) + 1;
        rec({ t: 'rescue', x: sq.x, y: sq.y, c: sq.corpId });
      }

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
      for (const sq of liveSquads()) weatherCheck(rng, sq, planet, squadHooks(sq), stats);

      /* --- THE DAY, IN TWELVE TICKS ---
         Six of light, six of dark. Movement happens on the light ticks at a sixth of the
         day's march each; contact is checked on every one of the twelve. */
      for (const q of liveSquads()) { q._heldToday = 0; q._joinedToday = false; }
      /* a sound is worth walking to for a day and then it is just a place something happened */
      for (let i = noises.length - 1; i >= 0; i--)
        if (day - noises[i].day > CONST.NOISE_DAYS) noises.splice(i, 1);
      /* the track opens at dawn where the squad actually stands — which is where
         yesterday's record left it — so a replay's step starts from the step before */
      if (REC) for (const q of liveSquads())
        q._track = [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000];
      for (let tick = 0; tick < CONST.TICKS_PER_DAY; tick++) {
        /* §LIGHT TWO CLOCKS, KEPT APART. The fleet's own: squads march six two-hour blocks and make camp
           for six, recover and recharge overnight — an Earth schedule they brought with them. And the
           PLANET's light, which turns at the planet's own speed and has nothing to do with it. This one
           word, `night`, had meant both; now `camp` is the fleet's clock and `night` is the dark. */
        const camp = tick >= CONST.DAY_TICKS;
        /* One clock for the whole contest. `busyUntil` has to outlive the day boundary — a
           fight starting in the last block of the evening runs into the small hours. */
        const absTick = (day - 1) * CONST.TICKS_PER_DAY + tick;
        const night = MAP.lightAt(planet, absTick * CONST.HOURS_PER_TICK).dark;
        if (!camp) {
      /* --- DAY: movement over open ground ---
         Positions are public at dawn and stale by dusk (DESIGN.md §5.6), which is what
         makes a coordinated approach possible at all. */
      /* §WALL AND THE WOUNDED DRAG THEMSELVES IN. A squad with living people and nobody able to walk
         is not "live" and never moved: if the ring closed past it, the wall took the wounded where
         they lay. They crawl for the line — slowly, but in. */
      for (const c of corps) for (const sq of c.squads) {
        if (squadHead(sq).length || !sq.bodies.some(b => b.status === 'injured' || b.status === 'active')) continue;
        const zW = MAP.zoneOn(planet, day);
        const dW = MAP.dist(sq.x, sq.y, zW.cx, zW.cy);
        if (dW > zW.r * (1 - CONST.WALL_EDGE)) wallRun(planet, day, sq, zW, dW, CONST.WALL_CRAWL, stats);
      }
      for (const sq of liveSquads()) {
        const dials = squadDials(sq);
        const hooks = squadHooks(sq);
        if (tick === 0) { sq.hx = sq.x; sq.hy = sq.y; }   /* bearing is where they started the day */

        const terrainSpeed = planet.speedAt(sq.x, sq.y) * (planet.slopeAt ? (1 - CONST.HEIGHT_CLIMB * planet.slopeAt(sq.x, sq.y)) : 1)   /* §7.5 */
                           * ((stats.weatherToday && stats.weatherToday.fx.pace) || 1);                                                 /* §5.3 */
        /* §LIGHT the dark slows a march a little: ground is felt for rather than seen (the sprint for the
           wall is not slowed — nobody is ever caught) */
        let budget = (CONST.DAY_MARCH / CONST.DAY_TICKS) * terrainSpeed * dials.ground * (night ? CONST.NIGHT_MOVE : 1)
                   * sizeMarchMult(sq)    /* three walk faster than eight */
                   * carryMult(sq)        /* and stretchers slow everyone */
                   * paceMult(sq);        /* and the quick cover ground */
        if (posture === 'fortify') budget *= 0.45;
        if (hooks.has('march_efficiency_up')) budget *= 1.12;
        if (sq._lostDay) budget *= 0.3;
        /* licking wounds: you do not march the morning after a firefight */
        /* N18 — nobody rests on the last ground. */
        if (!overtime && sq.restUntil && day <= sq.restUntil) { budget *= CONST.REST_MARCH_MULT; sq._resting = true; }
        else sq._resting = false;

        /* §WALL THE DEATH WALL IS NOT A HAZARD, IT IS A WALL (ruled). Nobody is ever caught outside
           it; a single death to it is a bug in somebody's behaviour. It was answered once, at dawn, by
           an order to walk in — and measured, every squad it then killed had been given that order
           and stood still all day: on the last ring (radius 0.014) the order's target sat inside the
           0.012 arrival slack, so movement ruled them "arrived" a hair outside the line, and the
           careful stance, a rest, fortifying, a fight or a stretcher could each hold them there too.
           Now it is checked EVERY TICK: a squad outside breaks off whatever it is doing — a fight
           included — and SPRINTS for safe ground just inside, at full pace whatever its
           stance, rest or burden, with no arrival slack. Only then does anything else happen. */
        {
          const zW = MAP.zoneOn(planet, day);
          const dW = MAP.dist(sq.x, sq.y, zW.cx, zW.cy);
          if (dW > zW.r * (1 - CONST.WALL_EDGE)) {
            if (sq._busyUntil != null && sq._busyUntil > absTick) {
              sq._busyUntil = 0; addStress(sq, 4, stats);
              stats.audit.lineBrokeFight = (stats.audit.lineBrokeFight || 0) + 1;
            }
            wallRun(planet, day, sq, zW, dW, Math.max(0.5, terrainSpeed) * CONST.WALL_SPRINT, stats);
            continue;
          }
        }

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
            if (t && t.corp) { noteContact(sq.corp, t.corp, day, 'hunting'); noteContact(t.corp, sq.corp, day, 'huntedBy'); }
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
        const zr = squadDials(sq).zoneRisk;
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
          let nx = sq.x + (tx - sq.x) / d * step, ny = sq.y + (ty - sq.y) / d * step;
          /* §7.6 WATER AND PEAKS ARE NOT CROSSED. If the step lands in either, swing the
             heading — a little, then more, either way — and take the first open footing.
             Nothing open in a half-circle means standing where they are: a squad against a
             lake with the wall behind it is the chokepoint doing its work. */
          if (planet.passableAt && !planet.passableAt(nx, ny)) {
            const base = Math.atan2(ty - sq.y, tx - sq.x);
            let found = null;
            for (const off of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
              const qx = sq.x + Math.cos(base + off) * step, qy = sq.y + Math.sin(base + off) * step;
              if (planet.passableAt(qx, qy)) { found = [qx, qy]; break; }
            }
            if (found) { nx = found[0]; ny = found[1]; stats.audit.routedRound = (stats.audit.routedRound || 0) + 1; }
            else { nx = sq.x; ny = sq.y; stats.audit.heldByGround = (stats.audit.heldByGround || 0) + 1; }
          }
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

      /* --- OWN LINES DO NOT STACK (§6.1 OWN_SPACING) ---
         After the tick's marches, own-corp pairs standing inside a body's-breadth of each
         other are pushed apart symmetrically, then held inside the wall. Squads held in a
         fight are exempt — a fight is a place you are — and opposing squads still
         converge: contact geometry is untouched. Two relaxation passes settle chains. */
      for (let rp = 0; rp < 2; rp++) {
        for (const c of corps) {
          for (let i = 0; i < c.squads.length; i++) for (let j = i + 1; j < c.squads.length; j++) {
            const a = c.squads[i], b = c.squads[j];
            if (!squadHead(a).length || !squadHead(b).length) continue;
            if ((a._busyUntil || 0) > absTick || (b._busyUntil || 0) > absTick) continue;
            const sep = MAP.dist(a.x, a.y, b.x, b.y);
            if (sep >= CONST.OWN_SPACING) continue;
            let ux, uy;
            if (sep > 1e-6) { ux = (b.x - a.x) / sep; uy = (b.y - a.y) / sep; }
            else { const ang = (i * 2.4 + j) % (Math.PI * 2); ux = Math.cos(ang); uy = Math.sin(ang); }
            const half = (CONST.OWN_SPACING - sep) / 2;
            const pa = MAP.clampInside(planet, day, a.x - ux * half, a.y - uy * half);
            const pb = MAP.clampInside(planet, day, b.x + ux * half, b.y + uy * half);
            a.x = pa.x; a.y = pa.y; b.x = pb.x; b.y = pb.y;
            stats.audit.ownSpacingPush = (stats.audit.ownSpacingPush || 0) + 1;
          }
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
               §TRUCE and it is never broken (ruled): an Aleas-mandated truce broken is a squad annihilated. */
            if (pactHolds(sqA.corp, sqB.corp, day)) {
              stats.contactsDeclined = (stats.contactsDeclined || 0) + 1;
              continue;
            }
            if (sqA.foughtPhase || sqB.foughtPhase) continue;
            /* still shooting at somebody else, from a block or more ago */
            if ((sqA._busyUntil || 0) > absTick || (sqB._busyUntil || 0) > absTick) continue;
            if (squadHead(sqA).length < 1 || squadHead(sqB).length < 1) continue;

            const sep = MAP.dist(sqA.x, sqA.y, sqB.x, sqB.y);
            if (sep > CONST.ENGAGE_RANGE) continue;
            /* NOBODY STARTS A FIGHT IN THE DOME'S PATH. Ground outside today's line is
               dead ground by dusk; hunter and prey both know it, and a squad walking in
               off it is walking, not fighting. Without this, evaders were intercepted on
               the doomed ground, pinned past dusk, and eaten — whole squads at a time. */
            if (!MAP.inZone(planet, day, sqA.x, sqA.y) ||
                !MAP.inZone(planet, day, sqB.x, sqB.y)) continue;

            const mx = (sqA.x + sqB.x) / 2, my = (sqA.y + sqB.y) / 2;
            if (rng() >= detectChance(rng, sqA, sqB, planet, day, night, mx, my, sep, stats)) continue;
            stats.contactOffers++;
            stats.offersBy[sqA.corp.policy] = (stats.offersBy[sqA.corp.policy] || 0) + 1;
            stats.offersBy[sqB.corp.policy] = (stats.offersBy[sqB.corp.policy] || 0) + 1;

            const dA = squadDials(sqA), dB = squadDials(sqB);
            /* §7.6 THE INITIATIVE BELONGS TO WHOEVER SAW FIRST. The seeker was simply the bolder
               squad — the higher `seek` — so a careful squad that had SEEN the enemy coming was
               still treated as the one caught unawares, and its only way out was an escape roll
               the hunter could beat. Measured, that inverted the whole stance ladder: an Avoid
               squad was found 11 times a contest and went looking 6.6, an All In squad went
               looking 13 and was never found, and Avoid ended up in MORE fights and losing MORE
               people. Caution paid its price and bought nothing back. Now a squad with a fresh
               sighting of the other has the initiative; boldness decides it only when both saw,
               or neither did. */
            const sawIt = (w, t) => {
              const e = ((w.corp && w.corp._picture) || {})[t.corpId + ':' + t.sIdx];
              return !!(e && day - e.day <= 1);
            };
            const aSaw = sawIt(sqA, sqB), bSaw = sawIt(sqB, sqA);
            /* §HALF-BUILT AND ONLY NOW is this contact written into each side's picture. It was written FIRST,
               so every squad had "a fresh sighting" of the other the moment they met: measured, all 262
               meetings with a careful squad came out as both-saw, the saw-first rule never once told anybody
               apart, and the initiative fell back to boldness every time — the careful squad "found". */
            /* seen: both OAs learn where the other stands, and so do their banners */
            for (const c of corps) { if (allied(c, sqA.corp)) recordSighting(c, sqB, day); if (allied(c, sqB.corp)) recordSighting(c, sqA, day); }

            const seeker = aSaw && !bSaw ? sqA : bSaw && !aSaw ? sqB : (dA.seek >= dB.seek ? sqA : sqB);
            const other = seeker === sqA ? sqB : sqA;
            seeker._lastSeekDay = day; other._lastFoundDay = day;
            /* and a careful squad that saw them coming is simply not there: it was not surprised,
               it does not want the fight, and it had the time to go. This is the payoff of the
               whole trade — patience buys sight, and sight buys the choice. */
            const otherSaw = seeker === sqA ? bSaw : aSaw;
            /* §STANCE AND WHEN NEITHER SAW THE OTHER COMING — two squads stumbling into each other — a careful
               one turns away before a shot is fired more often than not. It could only slip off if it had a
               fresh sighting from the day before, so in a mutual stumble the bolder squad was made the hunter
               and the careful one was simply "found": 8.5 times a contest, more fights than an All In squad
               (19.5 to 16.0 on the same seeds) and more dead. Surprised by a hunter that DID see it first, it
               still cannot. */
            const stumble = !aSaw && !bSaw;
            /* §HALF-BUILT how each meeting began, kept always: the saw-first rule went dead for weeks because
               nothing ever asked whether it told anybody apart (harness/probe_initiative.cjs asks) */
            { const mk = (stats.audit.meetKinds = stats.audit.meetKinds || {});
              const kk = aSaw && bSaw ? 'bothSaw' : aSaw || bSaw ? 'oneSawFirst' : 'stumble';
              mk[kk] = (mk[kk] || 0) + 1; }
            const slipP = otherSaw ? (1 - squadDials(other).seek)
                        : stumble ? (1 - squadDials(other).seek) * CONST.SLIP_STUMBLE : 0;
            if (slipP > 0 && squadDials(other).seek < 0.45 && !overtime && rng() < slipP) {
              stats.audit.sawItComing = (stats.audit.sawItComing || 0) + 1;
              (stats.audit.slippedBy = stats.audit.slippedBy || {})[other.corpId] =
                ((stats.audit.slippedBy || {})[other.corpId] || 0) + 1;
              continue;
            }
            /* §INSTRUMENT who went looking and who was found, per OA */
            (stats.audit.seekerBy = stats.audit.seekerBy || {})[seeker.corpId] = ((stats.audit.seekerBy || {})[seeker.corpId] || 0) + 1;
            (stats.audit.foundBy = stats.audit.foundBy || {})[other.corpId] = ((stats.audit.foundBy || {})[other.corpId] || 0) + 1;
            const otherDials = squadDials(other);

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
                + (1 - CONST.PRESTIGE_FLOOR) * prestigeFor(seeker, other) + 0.55 * late);
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
              /* §STANCE how willingly this squad piles into THIS fight: read against whoever
                 is already in it, not against the world */
              const against = (party[0] && party[0].corpId) || null;
              const td = squadDials(t); void against;
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
              log: groups.some(g => g.some(sq => isHumanOA(sq.corpId)))
                     ? undefined : false,
              /* one figure per side, in the same order as `built` (§14 → tactical) */
              prep: groups.map((g, gi) => {
                const lead = g[0];
                const theyKnewUs = g.some(s => Object.keys(s.known || {}).length > 0);
                /* Gather Intel: if this side scouted the OA it now faces, that dossier's
                   freshness-scaled readiness applies against THEM specifically. With more than
                   two sides, credit the best-known opponent present. */
                let rivalEdge = 0;
                const ri = lead && lead._rivalIntel;
                if (ri) groups.forEach((og, oi) => {
                  if (oi === gi) return;
                  og.forEach(os => { if (os.corpId && ri[os.corpId] > rivalEdge) rivalEdge = ri[os.corpId]; });
                });
                /* §7.5 the side that came from the higher ground holds the edge */
                let heightEdge = 0;
                if (planet.heightAt && lead) {
                  const mine = planet.heightAt(lead.x, lead.y);
                  let others = 0, n = 0;
                  groups.forEach((og, oi) => { if (oi !== gi && og[0]) { others += planet.heightAt(og[0].x, og[0].y); n++; } });
                  if (n) heightEdge = CONST.HIGH_GROUND_PREP * (mine - others / n);
                }
                return Math.max(0, Math.min(1, preparedness(lead, { sawFirst: theyKnewUs, rivalEdge: rivalEdge, planet: planet }) + heightEdge));
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
                /* §STANCE drawn to the noise by how it feels about whoever is making it */
                const loudest = groups[0] && groups[0][0] && groups[0][0].corp ? groups[0][0].corp.id : null;
                const seek = squadDials(other).seek; void loudest;
                const perTick = march * (1 + CONST.RUSH_SEEK_GAIN * seek);
                const d = MAP.dist(other.x, other.y, mx, my);
                const ticksAway = Math.ceil(d / Math.max(1e-9, perTick));
                if (ticksAway > CONST.FIGHT_TICKS_MAX) continue;
                /* their own people already in it pull harder than a stranger's fight does */
                const friend = groups.some(grp => grp.some(sq => allied(sq.corp, other.corp)));
                const want = squadDials(other).seek * (friend ? 1.6 : 1);
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

            /* §GRUDGE A MAN FIGHTING THE OA HE REMEMBERS. Grudge Holder's three hooks wanted
               a fighter's memory of every OA in the fleet, and the first design for it was a
               relationship matrix — far more machinery than a trait that is mostly texture is
               worth. A man remembers ONE OA: the last that tried to buy him out from under
               his own. It is set where that happens (events.js, the poach) and read in exactly
               two places — here, and at the market, which will not offer him to them. */
            for (const side of built) {
              const foes = built.filter(o => o !== side).map(o => o.corpId);
              for (const u of side.units) {
                if (!u._grudge || foes.indexOf(u._grudge) < 0) continue;
                if (!u.hooks || !u.hooks.has('morale_up_vs_grudge_target')) continue;
                u.comp = Math.min(100, u.comp + CONST.GRUDGE_COMP);
                stats.audit.traitHooks++;
              }
            }
            /* §CHARGES note what every combatant carries in, so the spend can come off the fighter */
            for (const sd of built) for (const u of (sd.units || [])) u._carriedIn = (u.carried || []).slice();
            const res = TACTICAL.resolve(rng, built, ctx);
            if (global.__FIGHTS) {
              const rows = built.map((sd, gi) => {
                const g = groups[gi] || [];
                const us = sd.units || [];
                return { corp: sd.corpId, stances: g.map(q => squadStance(q)).join('/'),
                         prep: +(((ctx.prep || [])[gi] != null ? ctx.prep[gi] : 0.5)).toFixed(2), flanked: !!(flanked || [])[gi],
                         objective: +(ctx.objectiveValue || 0),
                         ranges: us.map(u => (u.weapon && u.weapon.range) || '?').join(','),
                         /* every close-range hit on one of ours, traced back through the frames: where
                            shooter and target began, and who walked toward whom before the shot */
                         closeHits: (() => {
                           const F = res.frames || [], ids = new Set(us.map(u => u.id)), out = [];
                           const at = (id, upto) => { let p = null, first = -1;
                             for (let k = 0; k < F.length && (F[k].turn || 0) <= upto; k++) {
                               const r = (F[k].units || []).find(x => x.id === id);
                               if (r) { if (first < 0) first = k; if (first >= 0 && !p) p = { x: r.x, y: r.y, k }; } }
                             let last = null;
                             for (let k = 0; k < F.length && (F[k].turn || 0) <= upto; k++) {
                               const r = (F[k].units || []).find(x => x.id === id); if (r) last = { x: r.x, y: r.y }; }
                             return { start: p, now: last, first }; };
                           for (const e of (res.log || [])) {
                             if (e.type !== 'hit' || e.band !== 2 || !ids.has(e.at)) continue;
                             const S = at(e.by, e.t), T = at(e.at, e.t);
                             if (!S.start || !T.start || !S.now || !T.now) continue;
                             const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
                             out.push({ d0: +d(S.start, T.start).toFixed(1), d1: +d(S.now, T.now).toFixed(1),
                                        shooterIn: +(d(S.start, T.start) - d(S.now, T.start)).toFixed(1),
                                        targetIn: +(d(T.start, S.start) - d(T.now, S.start)).toFixed(1),
                                        arrived: S.first > 0, turn: e.t });
                           }
                           return out; })(),
                         n: us.length, lost: us.filter(u => u.state !== 'ok' && u.state !== 'light').length,
                         dead: us.filter(u => u.state === 'dead').length,
                         gone: us.filter(u => u.state === 'fled' || u.state === 'panicked').length,
                         outright: us.filter(u => u.state === 'dead' && !u._downSev).length,
                         bledOut: us.filter(u => u.state === 'dead' && u._downSev).length,
                         sev: us.filter(u => u._downSev).map(u => u._downSev).join(','),
                         hitsTaken: (res.log || []).filter(e => e.type === 'hit' && us.some(u => u.id === e.at)).length,
                         shotsAt: (res.log || []).filter(e => (e.type === 'hit' || e.type === 'miss') && us.some(u => u.id === e.at)).length,
                         coverWhenHit: (() => { const hs = (res.log || []).filter(e => e.type === 'hit' && us.some(u => u.id === e.at));
                           return hs.length ? +(hs.reduce((t, e) => t + (e.cover != null ? e.cover : 0), 0) / hs.length).toFixed(2) : 0; })(),
                         bandWhenHit: (res.log || []).filter(e => e.type === 'hit' && us.some(u => u.id === e.at)).map(e => e.band).join(''),
                         away: us.filter(u => u.state === 'withdrawn').length,
                         comp0: +(us.reduce((t, u) => t + (u._comp0 != null ? u._comp0 : (u.comp || 0)), 0) / Math.max(1, us.length)).toFixed(1),
                         seeker: g.some(q => q._lastSeekDay === day), found: g.some(q => q._lastFoundDay === day) };
              });
              global.__FIGHTS.push({ day, result: res.result, turns: res.telemetry && res.telemetry.turn, rows, terrain, band: ctx.openingBand });
            }
            /* §CHARGES and take the spend off the fighter: each item a combatant used this fight is
               one charge gone for the rest of the Divide */
            for (const sd of built) for (const u of (sd.units || [])) {
              const f = u.ref; if (!f || !f._charges || !u._carriedIn) continue;
              const left = (u.carried || []).slice();
              for (const id of u._carriedIn) {
                const i = left.indexOf(id);
                if (i >= 0) { left.splice(i, 1); continue; }
                f._charges[id] = Math.max(0, (f._charges[id] || 0) - 1);
                stats.audit.chargesSpent = (stats.audit.chargesSpent || 0) + 1;
              }
            }
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
            /* THE GROUND HANDS THE FIGHT TO THE FIREFIGHT. A caller holding the generator
               gets the WHOLE resolution for fights its own corp stood in — the frames, the
               sides, the ground it happened on. This is the same resolution the contest just
               settled, handed over rather than re-fought, so the tactical replay a manager
               watches is the truth and not a reconstruction. Guarded to the human corp the
               same way the log is: seven rivals' skirmishes are not what anybody sits down
               to watch, and their frames are not worth carrying. */
            if (opts.onBattle && groups.some(g => g.some(sq => isHumanOA(sq.corpId)))) {
              opts.onBattle({ day: day, night: !!night, terrain: terrain, x: mx, y: my,
                              corps: groups.map(g => principalOf(g[0].corp).id),
                              sides: built, res: res });
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
            if (t) { for (const k of ['drones', 'turrets', 'turretShots', 'turretHits', 'stims', 'scrambles', 'thermobarics'])
                       stats.audit[k] = (stats.audit[k] || 0) + (t[k] || 0);
                     stats.audit.grenades = (stats.audit.grenades || 0) + (t.grenades || 0);
                     stats.audit.consumablesUsed = (stats.audit.consumablesUsed || 0) + (t.consumables || 0); }
            stats.exchanges += t.exchanges; stats.shots += t.shots; stats.hits += t.hits;
            stats.downs += t.downs; stats.killedOutright += t.killedOutright; stats.downDeaths += t.downDeaths;
            stats.monwaShock += (t.monwaPairLoss || 0);
            if (t.routs > 0) stats.routEngagements++;
            if (t.squadsBroken > 0) stats.brokenEngagements++;
            stats.squadsBroken += t.squadsBroken || 0;
            stats.sidesEngaged += t.sidesEngaged || 0;
            stats.sidearmDraws += t.sidearmDraws || 0;
            stats.vents += t.vents || 0;
            /* the ground itself coming apart — grades knocked off cover, and pieces
               taken down to nothing. A contest should be able to say how much of the
               scenery it removed, or destructible cover is unmeasurable from out here. */
            stats.audit.coverChipped = (stats.audit.coverChipped || 0) + (t.coverChipped || 0);
            stats.audit.coverFlattened = (stats.audit.coverFlattened || 0) + (t.coverFlattened || 0);
            if (res.result === 'cap') stats.capExits++;

            const before = { d: stats.dead, i: stats.injured, c: stats.careerEnded };
            const recBefore = { d: stats.dead, c: stats.careerEnded };
            /* §6.9 every corp on one side met every corp on the others */
            {
              const sideCorps = groups.map(g => { const out = []; for (const q of g) if (q.corp && out.indexOf(q.corp) < 0) out.push(q.corp); return out; });
              for (let gi = 0; gi < groups.length; gi++) for (let hi = 0; hi < groups.length; hi++) {
                if (gi === hi) continue;
                for (const a of sideCorps[gi]) for (const b of sideCorps[hi]) noteContact(a, b, day, 'fight');
              }
            }
            for (let gi = 0; gi < groups.length; gi++) {
              const side = built[gi];
              for (const u of side.units) {
                if (u.race === 'ththyn' && u.injury) {
                  stats.ththynSerious++;
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
                  /* §6.9 and who this side lost to, on the record both ways */
                  for (const c of corpsHere) if (c && c !== vc) { noteContact(c, vc, day, 'lost'); noteContact(vc, c, day, 'beat'); }
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
            /* --- THE STANDING CARRY THE FALLEN (the dome ruling, part two). A squad
               whose every body is down cannot leave, and the dome does not wait. Its
               wounded transfer to a standing squad of its own corp in this same fight,
               who walk them out on their own legs and pay for it in march speed. Wounded
               with no standing friend here are left where they fell — and the dome's
               edge is what makes that a real loss rather than a bookkeeping one. --- */
            for (let gi2 = 0; gi2 < groups.length; gi2++) {
              for (const sq of groups[gi2]) {
                if (squadHead(sq).length) continue;
                const carriers = groups[gi2].filter(s2 =>
                  s2 !== sq && s2.corpId === sq.corpId && squadHead(s2).length);
                if (carriers.length) {
                  const wounded = sq.bodies.filter(b => b.status === 'injured');
                  for (const b of wounded) {
                    carriers[0].bodies.push(b);
                    sq.bodies.splice(sq.bodies.indexOf(b), 1);
                  }
                  if (wounded.length)
                    stats.audit.carriedOut = (stats.audit.carriedOut || 0) + wounded.length;
                  continue;
                }
                /* no friend standing: the wounded fall to whoever won — taken captive,
                   which is what winning the fight means. Only a fight that leaves NO side
                   standing strands its wounded for the dome, and that is a tragedy the
                   ledger should show, not a bookkeeping accident. */
                let victorSide = -1, most = 0;
                for (let hi = 0; hi < groups.length; hi++) {
                  if (hi === gi2) continue;
                  const n2 = groups[hi].reduce((a2, q2) => a2 + squadHead(q2).length, 0);
                  if (n2 > most) { most = n2; victorSide = hi; }
                }
                if (victorSide < 0) continue;
                const takerId = groups[victorSide][0].corpId;
                for (const b of sq.bodies) {
                  if (b.status !== 'injured') continue;
                  b.status = 'captured'; b._capturedBy = takerId;
                  stats.captured++; stats.audit.capturedAlive++;
                  stats.audit.woundedTakenCaptive = (stats.audit.woundedTakenCaptive || 0) + 1;
                }
              }
            }
            /* CAPTIVES MARCH OFF THE FIELD. Their fate is already on the books
               (_capturedBy, resolved at the end); their bodies leaving the map is what
               keeps the dome from eating the victor's own prisoners where they lay. */
            for (const g2 of groups) for (const sq of g2) {
              for (let bi2 = sq.bodies.length - 1; bi2 >= 0; bi2--) {
                if (sq.bodies[bi2].status !== 'captured') continue;
                sq.bodies.splice(bi2, 1);
                stats.audit.captivesMarchedOff = (stats.audit.captivesMarchedOff || 0) + 1;
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
                  /* §MAP the break for it is a leg of the day's walk: without it the marker
                     finished its animated march and then jumped to where the run had put it */
                  if (!sq._track || !sq._track.length) sq._track = [Math.round(sq.x * 1000) / 1000, Math.round(sq.y * 1000) / 1000];
                  sq.x = p.x; sq.y = p.y;
                  sq._track.push(Math.round(sq.x * 1000) / 1000, Math.round(sq.y * 1000) / 1000);
                  const cornered = roomNow <= planet.radius * CONST.CORNERED_ZONE_FRAC;
                  /* §SITES A BEATEN SQUAD RUNS FOR SHELTER. Traced, a hurt squad's intent was
                     almost always `withdraw` — running from the fight straight away, which
                     overrode everything else it wanted — so it never walked to a rest site even
                     when one was close. When there is shelter within reach, it runs THERE. */
                  const bea = cornered ? null : beaconFor(sq, planet, day, CONST.DAY_MARCH * CONST.BEACON_FALLBACK_MARCHES);
                  const shel = cornered || bea ? null : shelterFor(sq, planet, day, CONST.DAY_MARCH * 2.5);
                  if (bea) stats.audit.ranForBeacon = (stats.audit.ranForBeacon || 0) + 1;
                  sq.intent = cornered ? null
                    : bea ? { type: 'claim', obj: bea, tx: bea.x, ty: bea.y, expires: day + CONST.PLAN_LIFE }
                    : shel ? { type: 'claim', obj: shel, tx: shel.x, ty: shel.y, expires: day + CONST.PLAN_LIFE }
                    : { type: 'withdraw', tx: sq.x + (dx / len) * run,
                        ty: sq.y + (dy / len) * run, expires: day + CONST.WITHDRAW_DAYS };
                  if (shel) stats.audit.ranForShelter = (stats.audit.ranForShelter || 0) + 1;
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

      /* --- §7.6 PASSIVE SIGHTING: seeing somebody without meeting them ---
         RULED after a measurement of the stance ladder found half of it inert. A sighting was
         written in only three places — the posted landings on day one, a relay mast, and
         CONTACT — so nothing a squad did between fights could earn it information, and a
         cautious stance bought nothing a bold one did not also get. A squad now NOTICES the
         squads around it at the end of a day, and whether it does turns on things a manager
         decides or a captain is: how far they marched (a squad that covered ground is looking
         at its feet), the cover the other is standing in, the watcher's fieldcraft, and the
         weather. Being seen first is not nothing: the picture feeds the planner, the dossiers
         and the map, all of which already know what to do with a sighting. */
      /* §LIGHT how much of today's march was in the planet's dark */
      let darkBlocks = 0;
      for (let tk = 0; tk < CONST.DAY_TICKS; tk++)
        if (MAP.lightAt(planet, ((day - 1) * CONST.TICKS_PER_DAY + tk) * CONST.HOURS_PER_TICK).dark) darkBlocks++;
      const darkShareToday = darkBlocks / CONST.DAY_TICKS;
      for (const watcher of liveSquads()) {
        const head = squadHead(watcher).length;
        if (!head) continue;
        const marched = MAP.dist(watcher.x, watcher.y, watcher.hx != null ? watcher.hx : watcher.x,
                                 watcher.hy != null ? watcher.hy : watcher.y);
        /* a squad that walked all day has its head down; one that held has its eyes up */
        const attention = Math.max(CONST.SEE_MIN_ATTENTION,
          1 - (marched / Math.max(1e-9, CONST.DAY_MARCH)) * CONST.SEE_MARCH_COST);
        /* §ONE AIM FIELDCRAFT REACHES THE WATCH. Written for the sheet and fed a copy divided by ten,
           this gave every squad the same 0.64 — fieldcraft never varied how far anyone watched, and
           cut everyone's watch by a third. A keen-eyed squad now watches further than a dull one. */
        const craft = 1 + CONST.SEE_FIELDCRAFT * ((squadStat(watcher, 'fieldcraft') - 100) / 100);
        const wx = (stats.weatherToday && stats.weatherToday.fx.sight) || 1;
        /* §LIGHT and the dark takes most of it: the watch is cut by the share of today's march spent in
           the planet's dark */
        const nw = 1 - darkShareToday * (1 - CONST.NIGHT_WATCH);
        const reach = CONST.SEE_RANGE * attention * craft * wx * nw;
        /* §INSTRUMENT how far this squad walked today, as a share of a day's march, for the
           question stance hangs on: does a squad that holds still see more than one that
           covers ground? */
        const band = Math.min(3, Math.floor((marched / Math.max(1e-9, CONST.DAY_MARCH)) * 3));
        stats.audit.watchBy = stats.audit.watchBy || [0, 0, 0, 0];
        stats.audit.seenBy = stats.audit.seenBy || [0, 0, 0, 0];
        stats.audit.watchBy[band]++;
        if (reach <= 0) continue;
        for (const seen of liveSquads()) {
          if (seen === watcher || seen.corpId === watcher.corpId) continue;
          if (allied(watcher.corp, seen.corp)) continue;
          if (!squadHead(seen).length) continue;
          const d = MAP.dist(watcher.x, watcher.y, seen.x, seen.y);
          if (d > reach) continue;
          /* the cover THEY are standing in, and how big they are: eight in the open are a
             different proposition from three in the canopy */
          const cover = planet.concealAt(seen.x, seen.y);
          const size = 1 + CONST.SEE_PER_BODY * (squadHead(seen).length - 4);
          /* §7.6 SEEN PLAINLY UNTIL NEAR THE EDGE. A linear falloff made the edge of sight
             nearly blind — and nearly everybody stands near the edge: measured, the typical
             nearest squad was at 88% of the watch's reach, where a straight line gave about a
             7% chance of seeing it. So a squad that held still all day saw someone once in
             sixty-seven days. Sight is strong through most of its reach and falls away only at
             the rim, which is how looking actually works. */
          const edge = Math.pow(d / reach, 3);
          const p = Math.max(0, Math.min(0.95, (1 - edge) * cover * size * CONST.SEE_BASE));
          if (rng() >= p) continue;
          recordSighting(watcher.corp, seen, day, false, 'watched');
          stats.audit.sightings = (stats.audit.sightings || 0) + 1;
          stats.audit.seenBy[band]++;
          if (isHumanOA(watcher.corpId)) stats.audit.sightingsMine = (stats.audit.sightingsMine || 0) + 1;
        }
      }

      /* --- objective claim clocks (§9) --- */
      const tickedToday = new Set();
      /* §RESERVE (ruled) A LANDING BEACON. A squad standing on one draws its OA's reserve down: every BEACON_TICKS
         blocks held with no enemy squad in reach, one fighter lands (a Mon-Wa pair whole) into the smallest of that OA's
         squads on the beacon, up to the squad maximum. Leave and come back as often as you like; once the reserve is
         empty the beacon is nothing to you. While it is in use it fires: every other OA knows where you are, and whose
         you are. An enemy squad in reach stops the landing in progress. */
      const beaconDrawn = new Set();
      const beaconTick = (sq, o, day) => {
        const corp = sq.corp;
        if (!corp || !corp.reserve || !corp.reserve.length) { sq.claiming = null; return; }
        sq.claiming = o.id;
        const key = o.id + ':' + corp.id;
        if (beaconDrawn.has(key)) return;                   /* one draw a block, an OA, a beacon */
        beaconDrawn.add(key);
        o.litBy = corp.id; o.litDay = day; o.heldBy = corp.id;
        for (const c of (stats._corps || [])) if (!allied(c, corp)) recordSighting(c, sq, day, false, 'beacon');
        o.draw = o.draw || {};
        const rival = liveSquads().some(s => !allied(s.corp, corp) &&
          MAP.dist(s.x, s.y, o.x, o.y) <= CONST.BEACON_CONTEST_RADIUS);
        if (rival) { o.draw[corp.id] = 0; stats.audit.beaconContested++; return; }
        const mine = liveSquads().filter(s => s.corpId === corp.id && MAP.dist(s.x, s.y, o.x, o.y) <= MAP.CONST.CLAIM_RADIUS
                                           && squadHead(s).length < CONST.SQUAD_MAX);
        if (!mine.length) return;
        const knack = mine.some(s => squadHasHook(s, 'sponsor_drop_handling_bonus'));   /* the quartermaster brings them in faster */
        o.draw[corp.id] = (o.draw[corp.id] || 0) + 1;
        if (o.draw[corp.id] < CONST.BEACON_TICKS - (knack ? 1 : 0)) return;
        o.draw[corp.id] = 0;
        const into = mine.sort((a, b) => squadHead(a).length - squadHead(b).length)[0];
        const lead = corp.reserve.shift(), group = [lead];
        if (corp.reserve[0] && corp.reserve[0].mirror_of === lead.id) group.push(corp.reserve.shift());
        for (const f of group) {
          f.status = 'active'; f._squadIdx = into.sIdx; f._landedDay = day;
          into.bodies.push(f); corp.allBodies.push(f);
          if (corp.persist && corp.persist.drop && corp.persist.drop.indexOf(f) < 0) corp.persist.drop.push(f);
        }
        if (corp.persist && corp.persist.account) LED.payPurse(corp.persist.account, group);   /* paid on landing */
        into.rations += CONST.RATION_DROP_DAYS * group.length;
        into.medkits = medkitCharges(into.bodies); into.hasMedkit = into.medkits > 0;
        corp.landed += group.length; stats.audit.landed += group.length;
        (stats.landings = stats.landings || []).push({ day: day, corp: corp.id, squad: into.sIdx, fighter: lead.id,
          name: lead.name, pair: group.length > 1, site: o.label, place: o.place, left: corp.reserve.filter(f => !f.mirror_of).length });
        if (stats._rec) stats._rec({ t: 'landed', x: o.x, y: o.y, c: corp.id, name: lead.name, place: o.place });
      };
      /* Emptying a crate takes a tick or two, not two days, and a rival standing on it
         interrupts the work rather than freezing a claim clock. */
      for (const sq of liveSquads()) {
        let o = null;
        for (const cand of planet.objectives) {
          if (!MAP.siteLive(cand, day)) continue;
          if (MAP.dist(sq.x, sq.y, cand.x, cand.y) <= MAP.CONST.CLAIM_RADIUS) { o = cand; break; }
        }
        if (!o || sq.foughtToday) { sq.claiming = null; continue; }
        if (o.type === 'sponsor_cache') { beaconTick(sq, o, day); continue; }   /* §RESERVE a beacon is held, not looted */
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

      /* --- DUSK: THE PICKUP. Before the dome speaks, any standing squad beside an
         immobilised squad of its own corp gathers the wounded onto its own backs —
         whether it marched here to do it or merely passed by. --- */
      for (const c of corps) for (const sq of c.squads) {
        if (squadHead(sq).length) continue;
        if (!sq.bodies.some(b => b.status === 'injured')) continue;
        for (const s2 of c.squads) {
          if (s2 === sq || !squadHead(s2).length) continue;
          if (MAP.dist(s2.x, s2.y, sq.x, sq.y) > CONST.ARRIVE_SLACK * 1.5) continue;
          for (let bi3 = sq.bodies.length - 1; bi3 >= 0; bi3--) {
            const b3 = sq.bodies[bi3];
            if (b3.status !== 'injured') continue;
            s2.bodies.push(b3); sq.bodies.splice(bi3, 1);
            stats.audit.carriedOut = (stats.audit.carriedOut || 0) + 1;
          }
          if (s2.intent && s2.intent.type === 'rescue') s2.intent = null;
          sq._rescueBy = null;
          break;
        }
      }

      /* --- DUSK: THE DOME. Impenetrable and indifferent. It never displaces — it
         closes, and whoever it reaches is gone: the pinned, the resting and the
         stretcher cases alike. Being caught is the failure the whole day's logic
         exists to avoid, which is what makes the rim worth anything. */
      for (const c of corps) for (const sq of c.squads) {
        if (!sq.bodies.length) continue;
        if (MAP.inZone(planet, day, sq.x, sq.y)) continue;
        const livingBefore = sq.bodies.filter(b => b.status !== 'dead' && b.status !== 'retired').map(b => b.status);
        let took = 0;
        for (const b of sq.bodies)
          if (b.status !== 'dead' && b.status !== 'retired') { b.status = 'dead'; took++; }
        /* §WALL a death to the wall is a bug to investigate (ruled): every one is recorded with what
           the squad was doing, so the behaviour that left it outside can be found */
        if (took) {
          const zz = MAP.zoneOn(planet, day);
          (stats.wallDeaths = stats.wallDeaths || []).push({ day, corp: sq.corpId, s: sq.sIdx, took,
            stance: squadStance(sq), out: +(MAP.dist(sq.x, sq.y, zz.cx, zz.cy) - zz.r).toFixed(4),
            intent: sq.intent && sq.intent.type, moved: !!sq.movedToday, living: livingBefore.join(','), r: +zz.r.toFixed(3) });
        }
        if (took) {
          stats.audit.domeDeaths = (stats.audit.domeDeaths || 0) + took;
          (stats.audit.wallBy = stats.audit.wallBy || {})[c.id] = ((stats.audit.wallBy || {})[c.id] || 0) + took;
          rec({ t: 'wall', x: Math.round(sq.x * 1000) / 1000,
                y: Math.round(sq.y * 1000) / 1000, c: sq.corpId, n: took });
        }
      }

      /* --- NIGHT: camp --- */
      for (const c of corps) for (const sq of c.squads) {
        if (!squadHead(sq).length) continue;
        /* §LIGHT today's share of the planet's light, for what a sun-fed weapon could drink */
        if (stats._lightDay !== day) {
          let lit = 0;
          for (let tk = 0; tk < CONST.TICKS_PER_DAY; tk++)
            if (!MAP.lightAt(planet, ((day - 1) * CONST.TICKS_PER_DAY + tk) * CONST.HOURS_PER_TICK).dark) lit++;
          stats._lightDay = day; stats._lightShare = lit / CONST.TICKS_PER_DAY;
        }
        camp(rng, c, sq, squadHooks(sq), stats);
        if (!sq.foughtToday) addStress(sq, CONST.STRESS.quietDay, stats);
        if (sq._successions) { stats.audit.successions += sq._successions; sq._successions = 0; }
      }

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

    /* §JOINING RETIRED "left to die" — a surrender refused at the table — went with the table's joins */

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
      const alive = c.allBodies.some(b => b.status === 'active' || b.status === 'injured');
      recordFall(stats, c.id, c._downedOn || stats.days || 30, alive ? 'standing' : 'wiped');
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
        REP.act(c.rep, 'finished', { count: Math.max(0, corps.length - place) });
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
        const keep = rng() < keepChance(w, share + storesAsked / 4);   /* §MARKET the same trust the leaver priced */
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
      pc.crowdHit = c.crowdHit || 0;
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
  const api = { CONST, squadCountFor, STANCE_DIALS, preparedness, loudnessOf, STANCE_STANDING, NOTCHES,
                /* §STANCE the notch a manager sets at each OA, and what it is worth */
                setStance, NOTCH_WORDS, squadStance, squadDials, standing, prestigeOf, DEFAULT_RIGIDITY, STANCE_OVERRIDE, runDivide, divideCore, buildCorp, liveSquad, applyOutcome, principalOf, allied, bannersStanding, umbrellasOf, sealedCorp: sealed,
    /* the size reads on the ground, exported so the probe that keeps them honest can
       measure them and any surface can show a manager the cost of the squad they shaped */
    sizeMarchMult, sizeDetectMult, squadStress, WEATHER };
  if (isNode) module.exports = api;
  global.CDDIVIDE = api;
})(typeof window !== "undefined" ? window : globalThis);
