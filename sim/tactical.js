/* Capital Divide — /sim/tactical.js  (EXPERIMENT, Step 5)
 *
 * An X-COM-shaped resolver for a single firefight: a grid, real positions, directional
 * cover, line of sight, and alternating side turns with action points.
 *
 * WHAT IT REUSES, deliberately: `makeCombatant`, `aimEff`, `resolveSeverity`, `rollInjury`
 * and the whole COMBAT.md constant set. Stats, traits, quirks, kit, damage types, armour
 * resistances and the injury tables all behave exactly as they do in the abstract resolver.
 * The ONLY thing this replaces is the geometry: where people are and what is between them.
 *
 * WHAT IT CHANGES, and why it might be worth having:
 *   - Cover becomes a FACT ABOUT A TILE and a DIRECTION, not a slot drawn from a pool. A
 *     wall protects you from the side it is on. Flanking stops being a bearing comparison
 *     between squads and becomes "I can see the side of you that has nothing in front of it".
 *   - Range is continuous, so band is derived from distance rather than declared.
 *   - Movement costs something and exposes you, so taking ground is a decision.
 *
 * Pure logic: no DOM, no Math.random. Seed => identical fight.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./prng.js") : global.CDPRNG;
  const C = isNode ? require("./combat.js") : global.CDCOMBAT;

  const CONST = {
    W: 26, H: 18,                    // [C] tiles. Big enough for flanks, small enough to close.
    AP: 2,                           // [S] move+shoot, or move+move
    MOVE_TILES: 5,                   // [C] tiles per move action, before mobility
    /* §RACES THE FLEET'S ONLY FLIERS. A Ththyn's wings were in the data, in the lore and in
       the injury table, and in nothing that moved: they walked like everybody else. A burst of
       flight carries them further and over cover, bought with exposure — nothing in the air is
       behind anything — once a fight, and never on a hurt wing. */
    /* §RACES THE TETHER. A Mon-Wa is one being in two bodies, and the two fought as strangers:
       the pair was linked, the bond-shock roll fired when a half died, and the distance between
       them cost nothing at all. Inside the tether they are steadier than either would be alone;
       outside it, both of them come apart — the canon's own numbers, per exchange. */
    TETHER_TILES: 6,                 // [C] how far apart the halves may work
    TETHER_DRILLED: 3,               // [C] §QUIRKS what drilling to work apart is worth to a pair
    /* (ruled) separation costs both halves the canon's MONWA_TETHER_COMP (combat.js, −25) every turn: a turn is an exchange */
    TETHER_CLOSE_COMP: 3,            // [C] what being within it is worth, a turn
    TETHER_STEADY_CAP: 55,           // [C] and the composure past which it steadies nobody:
                                     //     a pair that could top itself up every turn never
                                     //     broke, and neither did the fight
    TETHER_PULL: 0.075,              // [C] per tile beyond the tether, when choosing a tile
    SVALBARD_TILES: 2,               // [C] §RACES what four legs are worth on a move
    EARLY_OUT: 0.06,                 // [C] §QUIRKS how much sooner a squad with a bolter calls it
    OBEDIENT: 0.04,                  // [C] and how much longer one that does as it is told holds
    AURA_TILES: 4,                   // [C] §QUIRKS how near a steadying presence must stand
    AURA_COMP: 2,                    // [C] and what it is worth a turn, capped by the band below
    AURA_CAP: 62,                    // [C] the composure past which nobody needs steadying
    /* §RACES THE DANCE. A Kellis treats the moment of battle as a dance — mantis-featured,
       precise, drilled in duelling arts that are never fielded but are exactly what the drill
       was for. They fight in MEASURE: a Kellis who holds their ground rather than crossing it
       reads the exchange and answers it, and each turn spent in place is worth more than the
       last. They were the one race the racial pass forgot. */
    /* what a turn of measure is WORTH lives in combat.js, where the shot is priced; declaring
       it in both places is how two numbers drift apart. Here we only count the turns. */
    KELLIS_MEASURE_CAP: 4,           // [C] how many turns of measure they can hold
    OLMAC_SOAK: 0.80,                // [C] §RACES what a round is worth against granite flesh
    ATTORAK_FRENZY_TURNS: 2,         // [C] §RACES how long the blood is in a gnoll's eyes
    ETU_WITNESS_COMP: 4,             // [C] §RACES what the first death a believer sees is worth,
                                     //     once a fight — the spectacle their god was made for
    FLIGHT_TILES: 4,                 // [C] how far a burst of flight adds
    FLIGHT_AT: 6,                    // [C] the gap worth taking to the air to close
    DASH_EXPOSE: true,               // [S] spending both AP on movement means no cover this turn
    BAND_TILE: [14, 6],              // [C] >14 tiles is long, >6 medium, else short
    LOS_BLOCK_COVER: 3,              // [S] hard cover blocks line of sight entirely
    COVER_BLOCKS_MOVE: true,         // [S] every object is impassable, not just the tall ones
    COVER_ARC: Math.PI * 0.55,       // [S] how wide a piece of cover protects
    MAX_TURNS: 26,                   // [S] a backstop, not the thing that ends fights
    OVERWATCH_REACT: 0.85,           // [C] fraction of normal aim on a reaction shot
    SUPPRESS_AP: 1,                  // [S] one action to hold an arc down

    /* COMPOSITION.md §4 on a grid. `shoot()` fired exactly ONE round per action, so a weapon's
       rate of fire — the axis Step 7.5 exists to create — did not reach this resolver at all.
       The rate banks across turns exactly as it does in the abstract model, so a half-rate
       rifle spends every other turn cycling the action, and each round is spent individually,
       which is what makes a fast weapon run its magazine dry in front of you. */
    TEMPO_MAX_BURST: 4,              // [S] a backstop; nothing in the catalog reaches it
    /* §5.1 — suppression. `SUPPRESS_AP` was declared here at Step 5 and read by NOTHING: the
       grid resolver had no suppression of any kind, so every weapon whose entire purpose is
       to hold an arc down was, on the model that actually matters, a worse rifle. */
    AREA_RADIUS: 3,                  // [C] §GUNS how near the mark a blast's other targets must stand (tiles)
    MOBILE_COVER_RADIUS: 2,          // [C] §GUNS how near a standing wall-gun its squadmates are shielded (tiles)
    SUPPRESS_RADIUS: 2,              // [C] how near the mark an arc_chain round jumps (tiles)
    /* §SUPPRESSION (ruled) the lane: every gun can lay one, and a support gun lays a wider, heavier one */
    LANE_RADIUS: 0,                  // [C] tiles about the mark an ordinary gun's lane holds (the mark alone)
    LANE_ARC: 20,                    // [C] degrees either side of the line to the mark a support gun's arc holds, to its reach
    LANE_ARC_2: 5,                   // [C] and a suppressive_2 gun's more
    LANE_ARC_TRAIT: 4,               // [C] degrees a point of Trigger Itch / Ammo Miser is worth on an arc
    LANE_PEN: 15,                    // [C] aim a man under an ordinary gun's lane loses
    LANE_PEN_SUPPORT: 40,            // [C] and under a support gun's
    LANE_HIT_MULT: 0.35,             // [C] the lane's own rounds: the chance, of an aimed shot's, each man in it is hit
    LANE_POWER_MULT: 0.5,            // [C] and the power they carry (mostly grazes)
    LANE_REACT_MULT: 0.6,            // [C] the burst at a man who gets up out of the lane, of an aimed shot's chance
    LANE_OW_VALUE: 0.5,              // [C] what unwatching a watcher is worth to the side about to move, of his shot
    LANE_WEIGHT: 1.5,                // [C] the lane against the aimed shot, hit for hit (the lane's worth runs past the turn)
    SPREAD_HIT_MULT: 0.6,            // [C] §GUNS the chance a round's edge catches somebody beside the target, of the shot's
    SPREAD_POWER_MULT: 0.6,          // [C] and the power the edge carries
    NOISE_TILES_PER_POINT: 8,        // [C] how far a shot carries, a point of noise
    SUPPRESSED_MOVE_COST: 0.32,      // [C] what leaving cover is worth while under fire
    /* §5.1 — THE TRAIT VOCABULARY OF SUPPRESSION, wired at Step 8.10. Three hooks named a
       system that had existed since Step 5 and never read them, so Trigger Itch, Ammo Miser and
       Smothering Fire were flavour text on a stat block. These are the widths of their effect,
       not fitted to anything: nobody has played this, and what is being built is the
       relationship. A shooter's output scales the RADIUS its fire catches people in; a
       defender's resistance is a flat chance to keep their head up and not go to ground. */
    SUPPRESS_OUT_UP: 1,              // [H] extra tiles of arc for a shooter who hoses
    SUPPRESS_OUT_DOWN: 1,            // [H] tiles lost by a shooter counting every round
    SUPPRESS_RESIST_P: 0.45,         // [H] chance Smothering Fire's target refuses the pin
    /* Cover is SCARCE and structural: discrete blocks and walls you can name, not a haze
       of noise across every tile. Something to be fought for. */
    /* Cover is an OBJECT, not a floor you stand on: a crate, a wall, a burnt-out gantry.
       You shelter BEHIND it and you cannot walk through it, which is why it has to be scarce
       — at a third of the map, impassable cover is a maze rather than a battlefield. */
    COVER_TARGET: [0.035, 0.115],    // [C] share of tiles OCCUPIED by an object
    /* A tactical shot is ONE TRIGGER PULL. An abstract shot is an exchange's worth of fire
       by a whole fighter, which is why the two hit rates cannot be the same number. */
    /* NO COMPENSATION. This was 0.50 to pull casualties down, chosen against a build with
       stacked units, cover nobody valued and overwatch that never fired — a number picked to
       hit a target rather than derived from anything. With the geometry working and a fight
       that ENDS, full lethality lands on 3.10 casualties against the abstract resolver's
       3.08, with no dial at all. */
    SHOT_HIT_MULT: 1.00,             // [S]
    SHOT_WEIGHT: 1.00,               // [S] what my shot is worth
    THREAT_WEIGHT: 0.85,             // [C] what their shots at me are worth. Above 1.0 every
                                     //     fighter hunkers and nothing is ever decided —
                                     //     measured at 1.15 the whole field went to ground
                                     //     and casualties fell to 1.5 a fight. Aggression has
                                     //     to remain worth something.
    MOVE_COST: 0.045,                // [C] the margin a move has to beat to be worth making
    /* WHAT A POSITION IS WORTH BEYOND THIS TURN'S SHOT.
     *
     * A position was scored on the shot it gives you NOW minus the fire it puts you in NOW.
     * For anything that has to close, every single step of the approach is a loss under that
     * rule — five tiles nearer barely improves a shotgun's hit chance while it is still out of
     * its band, and it certainly increases what is coming back. So nothing ever crossed ground
     * on purpose, the short shelf of the catalog went 0-9 in the league at the highest price
     * on it, and the fix would have been to keep making shotguns cheaper and stronger to
     * compensate for a resolver that would not let them fight.
     *
     * A fighter moves toward the range their weapon works at. That is the gradient the search
     * was missing, and it replaces a token 0.004-per-tile pull toward the nearest enemy that
     * was too small to move any decision. It cuts both ways: a marksman backs off from a
     * shotgun for the same reason the shotgun runs at him. */
    BAND_PULL: 0.050,                // [C] per tile of distance from the range you want
    /* FINISH THE WOUNDED. Added to a body's hit chance when picking who to shoot, and the only
       thing besides raw chance that decides it. It lived as a bare 0.05 inline in the target
       loop with no name and no entry here, which is why nothing had ever audited it — a static
       census of the constants cannot inventory a number that has no name, so it was invisible
       to exactly the pass built to find numbers like this.
       Measured by ablation across one contest and 5,348 aimed shots: remove it and 929 shots go
       to a different body — 17.4% of aimed shots, 20.5% of the shots where there was more than
       one body to choose between. Somebody visibly wounded was available on 2,451 shots and was
       the one shot on 1,930 of them, so this literal is the whole reason squads concentrate on
       the hurt. Against a mean hit chance near 0.19 it is worth about a quarter of a shot.
       Moved here unchanged at 0.05: naming a number is not the moment to retune it. */
    FINISH_WOUNDED: 0.05,            // [C]
    FOLLOWUP_HIT: 0.6,               // [C] §GUNS each follow-up round of a burst hits at this share of the round before it
    FLANK_LOOK: 2,                   // [C] §AI how many of the nearest covered rivals a fighter looks for a way round
    HOPELESS_SHOT: 0.06,             // [C] §AI a shot this unlikely is not taken: the fighter moves, or watches, instead
    /* §STUN (ruled) a stun weapon lands stacks, not wounds: at STUN_AT a man is out of the fight, and taken if his side
       leaves nobody standing. Stacks clear when the fight ends. */
    STUN_AT: 10,                     // [C] stacks that put a man down
    STUN_RESIST_STEP: 0.15,          // [C] the share of a hit's stacks each grade of an armour's stun resistance takes off
    STUN_AREA_RADIUS: 2,             // [C] tiles about the mark an area stun weapon catches everyone within
    STUN_FOCUS: 0.15,                // [C] what a man's stacks toward the line are worth to a stun shooter choosing his mark
    TARGET_SHARPNESS: 4,             // [C] §AI how surely a rival takes his best shot: 0 is an even split, high is always the best
    DASH_THREAT_SHARE: 0.45,         // [C] how much of the ordinary threat weight a dash feels.
                                     //     Not 1.0 on purpose: a dash that is as cautious as a
                                     //     walk is not a dash, and the mechanism exists to get
                                     //     short-range squads across ground they never crossed.
    MOB_TILES: 1.5,                  // [C] ground a mob_up / mob_down weapon gains or costs
    SMOKE_RADIUS: 2,                 // [C] tiles a screen covers
    SMOKE_TURNS: 3,                  // [S] how long before it drifts away
    /* §DEVICES the spotter drone and the auto-turret (their catalogue lines: the drone strips
       the enemy's concealment, the turret fires from cover for four exchanges) */
    DRONE_TURNS: 4,                  // [S] how long a drone stays up
    DRONE_RADIUS: 7,                 // [S] tiles under it that it sees
    DRONE_WEIGHT: 0.6,               // [H] how readily a blind squad sends one up
    TURRET_TURNS: 4,                 // [S] exchanges it fires for (the catalogue's four)
    TURRET_RANGE: 15,                // [S] tiles it can reach: as far as a good eye (EYE_FAR), since
                                     //     contact on this grid happens at 7-15 tiles and at 10 it
                                     //     was set down in range of an enemy five times in 3,000
    TURRET_AIM: 130,                 // [S] its steady aim, on the sheet's scale — a good fighter's
    TURRET_POWER: 5,                 // [H] a light automatic's punch
    TURRET_WEIGHT: 0.5,              // [H] how readily it is set down when an enemy is in reach
    SMOKE_COVER_CAP: 2,              // [C] smoke is concealment, never hard cover
    SMOKE_MIN_EXPOSED: 2,            // [S] thrown for a squad in the open, not for one man
    SMOKE_WEIGHT: 0.5,               // [H] how readily somebody reaches for one
    TREAT_REACH: 6,                  // [C] tiles you will cross to reach a downed mate
    /* consumables, in tiles rather than bands */
    GRENADE_RANGE: 8,                // [C] as far as a body can throw one
    GRENADE_RADIUS: 2,               // [C] tiles caught by the blast
    GRENADE_MIN_CROWD: 2,            // [S] never spent on one man
    RESUPPLY_AT: 3,                  // [C] rounds left before reaching for the satchel
    RESUPPLY_ROUNDS: 12,             // [C] what a satchel is worth
    RESUPPLY_CHARGE: 20,             // [C] what a spare cell is worth (the catalogue's twenty)
    DASH_COST: 0.18,                 // [C] the margin next turn's ground must beat this turn's shot
    CLUSTER_SPREAD: 2,               // [C] how far a bunch scatters from its anchor
    CLUSTER_SIZE: [2, 5],            // [C] tiles per bunch
    MAX_RUN: 2,                      // [S] no unbroken line longer than this

    /* --- COVER COMES DOWN (PROJECT.md: "Cover must be destructible") ---------------
       The tile grid used to be written once at generation and never again, so a good
       position was permanent, a stalemate had no solvent, and the movement scorer was
       right to tell everybody to sit still. A wall that can be taken away is what makes
       sitting still a gamble — and it is the job the `area` tag has been waiting for
       since the catalogue was written.

       Grades are 3 (hard, blocks sight), 2, 1, then gone. A piece loses a grade at a
       time: rubble is still worth something, which is why this degrades rather than
       deletes. */
    COVER_CHIP_P: 0.06,              // [C] chance a shot that strikes cover knocks a grade off it
    COVER_BLAST_P: 0.55,             // [C] the same for an `area` weapon, which is the point of one
    COVER_BLAST_RADIUS: 1,           // [C] tiles around the burst that take the same chance
    DEPLOY_DEPTH: 5,                 // [C] how deep a deployment zone is
    DEPLOY_SPAN: 10,                 // [C] §RANGE how many rows of the board a squad deploys across, centred
    /* §FLANK (ruled: option B) A FLANKED FIGHT IS FOUGHT ON MORE GROUND. A side whose squads walked in from different
       directions used to merge into one blob on one edge — a pincer on the map was a single rank on the grid. Now each
       squad comes on at its own edge, and when the approaches are this far apart the board grows to hold them, so the
       squad coming round the back really is round the back: out of sight, behind the cover the others chose. A
       head-on fight is untouched — same board, same deployment, same random draws. */
    FLANK_SPLIT_ARC: 1.0,            // [C] radians between two squads' approaches before they come on apart
    FLANK_BOARD_W: 40,               // [C] the board a flanked fight grows to
    FLANK_BOARD_H: 30,
    FLANK_DEPLOY_REACH: 6,           // [C] how far in from its edge point a squad on a flanked board may set up
    ARRIVE_EDGE_BAND: 2,             // [H] how far in somebody arriving mid-fight may appear
    /* [C] What being caught from two arcs does to the ground you chose. Cover is directional
       on this grid — a wall protects you from the side it is on — so a squad that set up
       against one threat and was hit from another is in cover facing the wrong way. It keeps
       a third of the benefit of picking covered ground. This is the first reader the
       squad-level flank has ever had: the day loop has computed it since Step 6, handed it to
       the resolver, and the resolver never looked. Two hundred identical fights run with the
       flag on and off produced two hundred identical results. */
    FLANKED_COVER_MULT: 0.33,
    PREP_COVER_BIAS: 0.75,           // [C] a prepared squad starts on cover this often
    AMBUSH_GAP: 0.30,                // [C] preparedness difference that counts as an ambush
    /* ---- FOG OF WAR ---------------------------------------------------------------------
       Both sides used to deploy in full view of each other and stay there. `spotted` was set
       to true when a combatant was built and never written again anywhere in the tree, so the
       two things in `combat.js` that read it were unreachable: the halving of your hit chance
       against a body whose position you do not have, and Ambush Instinct's open-fire bonus.
       Measured before this was built: 6,533,361 shot evaluations across three contests, ZERO
       at an unspotted target. Not a balance problem — a condition that never became true.

       SIGHT IS SQUAD-WIDE. What one of us can see, all of us can act on, which is what makes
       a scout worth a place: they need not be the one who takes the shot. You still need your
       own line of fire to shoot. What the squad shares is WHERE THEY ARE.

       There are three states a body can be in, not two, and the middle one is the interesting
       one. Seen — somebody has eyes on you. Heard — you fired and gave your position away
       roughly, so people can shoot back at you badly. Neither — you are not a target at all. */
    /* §APPROACH the opening gaps, as shares of the long band's own edge */
    OPEN_LONG: 2.5,                 // [C] a long opening is well beyond sight: an approach
    OPEN_MEDIUM: 1.05,               // [C] a medium one opens at the edge of sight (ruled: more ground to cover)
    BOARD_MARGIN: 10,                // [C] ground either side of the gap to manoeuvre in
    BOARD_TALLER: 4,                 // [C] a longer board is a little deeper too
    /* what a fieldcraft score is worth as eyes, against the spread rosters actually deal */
    /* EYE_ rather than SIGHT_NEAR/FAR: those names already mean something else in divide.js
       (how much of the picture a captain weighs), and the suite catches a constant declared
       twice with two values before the two can drift into each other. */
    SIGHT_STAT_LOW: 40, SIGHT_STAT_HIGH: 150,   // [C] the useful span of the stat
    STIM_COMP: 25,                   // [C] §CONSUMABLES composure a stim gives (its catalogue line)
    STIM_REACH: 6,                   // [C] tiles to the squadmate it is given to ("in band": short)
    STIM_BELOW: 70,                  // [C] given only to one whose nerve is going (below steady)
    THERMO_RADIUS: 3,                // [C] §CONTRABAND the thermobaric blast's reach, a tile wider than a frag
    THERMO_POWER: 2,                 // [C] and how much harder it hits
    SCRAMBLE_TURNS: 3,               // [C] turns a scrambled Mon-Wa pair pays the tether's price
    SOLAR_TURN_GAIN: 2,              // [C] §LIGHT charge a sun-fed weapon takes back each turn in daylight
    NIGHT_SIGHT: 0.55,               // [C] §LIGHT how far a fighter sees in the dark, as a share (ruled: greatly cut)
    EYE_NEAR: 7, EYE_FAR: 15,                   // [C] tiles: a poor scout, and a superb one
    /* SIGHT_TILES and SIGHT_MIN were the old rule's dials — a base plus a per-point slope —
       and the slope is what broke it. EYE_NEAR and EYE_FAR replace both; these are removed
       rather than left for somebody to read as though they still set how far anybody sees. */

    /* How long a muzzle flash gives you away for. You fired, so they know roughly where you
       are — for now. This is what `silent` exempts you from, which is the quirk's original
       written job and the thing it has been waiting on. */
    REVEAL_TURNS: 1,                 // [C] this turn and the next
    /* UNSPOTTED_AIM lives in `combat.js`, where `aimEff` reads it. It was briefly declared
       here, which would have resolved it to `undefined` at the only site that uses it. */
    /* §CONCEAL how much of an eye's reach a body's cover takes away, and what moving gives back */
    CONCEAL_PER_COVER: 0.22,         // [C] per grade of cover the body is lying in
    CONCEAL_MOVING: 0.30,            // [C] back again for a body that is up and crossing
    CONCEAL_FLOOR: 0.34,             // [C] nobody is invisible at any range
    SEARCH_DRIFT: 0.55,              // [C] §SEARCH how fast the sweep's aim point walks the flank
    SOFT_BOOTS_TILES: 1.5,           // [H] extra ground covered while nobody has eyes on you
    /* Two ways a side stops fighting, and they should not look the same.
       A CALLED WITHDRAWAL is the normal one: the captain judges it lost, and the squad
       falls back by bounds — half moving while the other half fires to cover them.
       PANIC is rare and individual: one fighter's nerve goes and they run. */
    WITHDRAW_AT: 0.175,              // [C] share of the squad's health lost before the order is given (the standard stance's)
    PANIC_RESOLVE_DIV: 260,           // [C] high resolve almost never breaks
    PANIC_FLOOR: 0.04,               // [C] anyone can break, rarely
    EXIT_COLS: 1,                    // [S] reaching your own edge takes you off the field
    BREAK_MARGIN: 3                  // [C] §RETREAT tiles past an enemy gun's reach a retreating body counts as out of it
  };

  /* ---------------------------------------------------------------- */
  /* the ground                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Cover is built from PIECES, not noise: short walls, blocks and berms with a grade each.
   * The terrain profile from COMBAT.md §3.2 decides how many and how good, so ruins are
   * dense and hard while an open basin has almost nothing worth standing behind. Scarcity
   * is the point — cover you have to reach is cover worth taking a risk for.
   */
  /* §APPROACH THE GROUND IS AS WIDE AS THE APPROACH NEEDS. Every fight was fought on one
     26-tile board, and the widest opening put two squads seventeen tiles apart against a
     fourteen-tile sight — so somebody was always already inside sight, the first spotting pass
     saw them, and every fight in the game opened with a shot on turn one. The fog was built and
     switched on and had nothing to do. A long opening is fought on a longer board. */
  function makeMap(rng, terrain, w, h) {
    const W = w || CONST.W, H = h || CONST.H;
    const dist = C.CONST.COVER_PROFILES[terrain] || C.CONST.COVER_PROFILES.broken_ground;
    const tiles = [];
    for (let y = 0; y < H; y++) tiles.push(new Array(W).fill(0));

    /* how much of this ground is worth hiding behind at all, and how good it is */
    const density = 1 - dist[0];                        /* open share inverted */
    const want = CONST.COVER_TARGET[0] + CONST.COVER_TARGET[1] * density * density;
    const pieces = Math.max(4, Math.round(want * W * H / 2.5));
    const gradeOf = () => {
      const r = rng() * (dist[1] + dist[2] + dist[3]);
      return r < dist[1] ? 1 : r < dist[1] + dist[2] ? 2 : 3;
    };
    /* BUNCHES, not walls. A run of four tiles in a line reads as one long barricade and
       plays like one: it splits the map instead of dotting it. Cover is placed as loose
       clumps scattered round an anchor, with a hard cap on any unbroken run, so the ground
       is a scatter of crates and rubble piles you move between. */
    const runOK = (x, y) => {
      for (const [ox, oy] of [[1, 0], [0, 1]]) {
        let run = 1;
        for (let k = 1; k <= CONST.MAX_RUN; k++) { if (at(tiles2, x + ox * k, y + oy * k)) run++; else break; }
        for (let k = 1; k <= CONST.MAX_RUN; k++) { if (at(tiles2, x - ox * k, y - oy * k)) run++; else break; }
        if (run > CONST.MAX_RUN) return false;
      }
      return true;
    };
    const tiles2 = { w: W, h: H, tiles };
    for (let i = 0; i < pieces; i++) {
      const ax = P.int(rng, 3, W - 4), ay = P.int(rng, 1, H - 2);
      const n = P.int(rng, CONST.CLUSTER_SIZE[0], CONST.CLUSTER_SIZE[1]);
      const grade = gradeOf();
      for (let k = 0; k < n; k++) {
        const x = ax + P.int(rng, -CONST.CLUSTER_SPREAD, CONST.CLUSTER_SPREAD);
        const y = ay + P.int(rng, -CONST.CLUSTER_SPREAD, CONST.CLUSTER_SPREAD);
        if (x < 2 || y < 0 || x >= W - 2 || y >= H) continue;
        if (tiles[y][x]) continue;
        if (!runOK(x, y)) continue;
        tiles[y][x] = grade;
      }
    }
    return { w: W, h: H, tiles, terrain };
  }

  /** An object occupies its tile. Nobody stands in a wall. */
  function blocked(map, x, y) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
    return CONST.COVER_BLOCKS_MOVE ? at(map, x, y) > 0 : at(map, x, y) >= CONST.LOS_BLOCK_COVER;
  }

  const at = (map, x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h) ? 0 : map.tiles[y][x];

  /** Knock a grade off the piece on this tile. Rubble still counts, so this degrades. */
  function chipTile(map, x, y, tel) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const g = map.tiles[y][x];
    if (!g) return false;
    map.tiles[y][x] = g - 1;
    if (tel) { tel.coverChipped = (tel.coverChipped || 0) + 1;
               if (g === 1) tel.coverFlattened = (tel.coverFlattened || 0) + 1; }
    return true;
  }

  /** A round that arrives works on whatever is between the two of them. Ordinary fire
      chips slowly — rubble a grade at a time — and an `area` weapon is the tool for
      the job, which is the whole reason the tag exists. */
  function chipCoverFrom(rng, map, shooter, target, tel, log) {
    if (!map) return;
    const spot = coverTileFor(map, shooter, target);
    if (!spot) return;
    const blast = C.hasQuirk(shooter, 'area');
    const p = blast ? CONST.COVER_BLAST_P : CONST.COVER_CHIP_P;
    if (rng() >= p) return;
    const before = at(map, spot.x, spot.y);
    if (!chipTile(map, spot.x, spot.y, tel)) return;
    if (blast) {
      const r = CONST.COVER_BLAST_RADIUS;
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (!ox && !oy) continue;
        if (rng() < CONST.COVER_BLAST_P * 0.5) chipTile(map, spot.x + ox, spot.y + oy, tel);
      }
    }
    if (log) log.push({ t: tel.turn, type: 'cover', by: shooter.id,
                        x: spot.x, y: spot.y, from: before, to: before - 1,
                        blast: !!blast });
  }

  /** The piece a shot from `by` runs into on its way to `t` — the last blocking tile
      before the target, which is the one they are actually hiding behind. */
  function coverTileFor(map, by, t) {
    let bx = null, by2 = null;
    let x = by.x, y = by.y;
    const dx = t.x - by.x, dy = t.y - by.y;
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    if (!n) return null;
    for (let i = 1; i <= n; i++) {
      x = Math.round(by.x + (dx * i) / n);
      y = Math.round(by.y + (dy * i) / n);
      if (x === t.x && y === t.y) break;
      if (at(map, x, y) > 0) { bx = x; by2 = y; }
    }
    return bx == null ? null : { x: bx, y: by2 };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /** Bresenham-ish: hard cover between two tiles blocks the shot entirely. */
  function hasLOSRaw(map, a, b) {
    let x0 = a.x, y0 = a.y;
    const dx = Math.abs(b.x - x0), dy = Math.abs(b.y - y0);
    const sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
    let err = dx - dy, guard = 0;
    while (guard++ < 200) {
      if (x0 === b.x && y0 === b.y) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      if (x0 === b.x && y0 === b.y) return true;
      if (at(map, x0, y0) >= CONST.LOS_BLOCK_COVER) return false;
    }
    return true;
  }

  /**
   * DIRECTIONAL COVER — the whole reason this experiment exists.
   * A unit is covered against a shooter only if a piece of cover sits on the side of it the
   * shot is coming from. Stand behind a wall and it protects you from the wall's side;
   * come round the flank and the wall is decoration.
   */
  /* ---- GEOMETRY CACHE ---------------------------------------------------------------
     The profiler is unambiguous: `coverAgainst` is 31% of the resolver and `hasLOS` another
     13%, while the combat maths is 2%. That is because the move search asks about every
     reachable tile against every enemy, twice, and each question is a fresh trigonometric
     walk over the map's cover objects.

     Both are PURE FUNCTIONS OF TWO TILE POSITIONS on a map that does not change during a
     fight, so the answer for a given pair of tiles is the same answer every time it is asked.
     Cached on the integer packing of those four coordinates and dropped each turn. This is not
     an approximation and it is not a heuristic: the outputs are bit-identical, which is the
     only kind of optimisation worth making to a simulation whose whole value is that a seed
     reproduces a fight exactly. Verified against a twelve-fight baseline. */
  let _geo = new Map();
  const _key = (ax, ay, bx, by) => (((ax * 32 + ay) * 32 + bx) * 32 + by);

  function coverAgainst(map, target, shooter) {
    const k = _key(target.x, target.y, shooter.x, shooter.y) * 2;
    const hit = _geo.get(k);
    if (hit !== undefined) return hit;
    let v = coverAgainstRaw(map, target, shooter);
    /* Smoke is NOT cached with the geometry — the map does not move but a screen drifts, and
       caching it would leave a cloud hanging on the field after it had gone. */
    _geo.set(k, v);
    return v;
  }

  /** cover including any screen the target is standing in. Not cached; screens expire. */
  function coverWithSmoke(map, target, shooter) {
    let v = coverAgainst(map, target, shooter);
    for (const sm of _screens) {
      if (Math.hypot(target.x - sm.x, target.y - sm.y) <= CONST.SMOKE_RADIUS) {
        v = Math.min(CONST.SMOKE_COVER_CAP, v + 1);
        break;
      }
    }
    return v;
  }
  let _screens = [];
  let _night = false;   /* §LIGHT whether this fight is fought in the planet's dark */
  /* §DEVICES what is standing on the ground besides the fighters: a spotter drone overhead, an
     auto-turret on its tile. Both were sold, carried and charged and did NOTHING — their action
     (`deploy`) was handled nowhere, which is why neither ever appeared on a replay. */
  let _drones = [], _turrets = [];

  function hasLOS(map, a, b) {
    const k = _key(a.x, a.y, b.x, b.y) * 2 + 1;
    const hit = _geo.get(k);
    if (hit !== undefined) return hit;
    const v = hasLOSRaw(map, a, b);
    _geo.set(k, v);
    return v;
  }

  /* §CONCEAL WHAT A BODY IS LYING IN, from no direction in particular. `coverAgainstRaw` wants
     a shooter, because cover is a thing between two points — but being HIDDEN is not: a fighter
     in a thicket is hard to pick out from anywhere, and the best scrap of ground around them is
     what does it. */
  function concealAt(map, body) {
    let best = 0;
    const around = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [ox, oy] of around) {
      const c = at(map, body.x + ox, body.y + oy);
      if (c && c > best) best = c;
    }
    return best;
  }
  function coverAgainstRaw(map, target, shooter) {
    const ang = Math.atan2(shooter.y - target.y, shooter.x - target.x);
    let best = 0;
    const around = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [ox, oy] of around) {
      const c = at(map, target.x + ox, target.y + oy);
      if (!c) continue;
      const a2 = Math.atan2(oy, ox);
      let d = Math.abs(a2 - ang);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d <= CONST.COVER_ARC) best = Math.max(best, c);
    }
    return best;
  }

  /* MODULE-SCOPED BECAUSE `incoming` IS. The motion switch lives on the ctx of a single fight,
     and `incoming` is a free function that never sees it — so the first version of this modelled
     the cost of having moved even when motion exposure was switched OFF. The "off" control was
     therefore not off: all five snapshot fights moved with the flag down, which read as an
     incidental regression and was really the control being broken. Set once per fight below. */
  let _motionOn = true;

  /** How likely is `shooter` to hit `victim` if the victim stands at `spot`? */
  function incoming(shooter, victim, spot, map) {
    const cov = coverAgainst(map, spot, shooter);
    /* `flanked` IS FALSE HERE AND THAT IS CORRECT, which took a wrong turn to establish.
       It looks like a blindness: the one number the movement decision rests on, apparently
       unable to tell a rock between you from a rock beside you. It is not. `cov` is already
       DIRECTIONAL — `coverAgainstRaw` counts only cover lying within an arc facing the shooter,
       so a body whose wall does not face this shooter already gets `cov = 0` and is already
       valued as standing in the open. Angles are perceived, through cover, exactly as they
       should be.
       The flag would be a SECOND application of the same fact, and it is inert by construction
       everywhere it appears: it is assigned `cov === 0 && own > 0`, and its only effect is to
       knock a grade off cover — which is already zero whenever the flag is true. Computing it
       here properly was tried and measured byte-for-byte identical across 500 fights: 52,481
       body-turns, 25,702 moves, 3,005 flanking shots, every integer unchanged, despite the new
       term being true 18% of the time. Reverted under the rule that anything measuring as no
       change comes back out. Do not "fix" this again. */
    /* AND THE COST OF HAVING MOVED THERE, WHICH THE SCORER MUST BE ABLE TO SEE.
       This is the whole difference between a mechanism and a tax. Wiring `repositioning` at the
       move site alone would make a body easier to hit without anything weighing that when it
       decides — so nobody would move any less, they would only die more, which is precisely what
       happened when overwatch was made dangerous without making it a decision. A candidate tile
       that is not the one you are standing on can only be reached by moving, so evaluating it
       means evaluating it as a body that has just moved. */
    const sc = victim.cover, sf = victim.flanked, sx = victim.x, sy = victim.y,
          sr = victim.repositioning;
    const movingThere = (spot.x !== victim.x || spot.y !== victim.y);
    victim.cover = cov; victim.flanked = false; victim.x = spot.x; victim.y = spot.y;
    if (movingThere && _motionOn) victim.repositioning = true;
    const dSpot = Math.hypot(shooter.x - spot.x, shooter.y - spot.y);
    const p = C.hitChance(shooter, victim, bandOf(dSpot), { dist: dSpot }, false)
              * CONST.SHOT_HIT_MULT;
    victim.cover = sc; victim.flanked = sf; victim.x = sx; victim.y = sy;
    victim.repositioning = sr;
    return p;
  }

  /** Can this body do anything to anyone, at any range? Declared here with the other small
      predicates: `shotAt` reads it and threw on the opening shot when it lived further down. */
  /* §SPENT A GUN WITH NOTHING LEFT IN IT IS NOT A GUN. `canHurt` asked only whether the weapon
     had power — a property of the model, not of the moment — so a fighter whose cell was flat
     still counted as armed. Five of eight hands in a fleet squad carry energy weapons with
     twelve to eighteen shots in them and no sidearm; when those ran out the fighters kept
     standing at two tiles, unable to fire, unwilling to leave, while the clock ran down. THIS
     WAS THE STALEMATE, not a failure to search: one measured fight spent 160 of its 188 shot
     attempts on weapons with nothing to fire. A body that cannot shoot now wants distance, the
     same as a body carrying nothing, and the withdrawal check counts it for what it is. */
  function canHurt(c) {
    const w = c.weapon;
    if (!w || ((w.power || 0) <= 0 && !stunOf(c))) return false;   /* §STUN stacks are a gun's harm too */
    const sideLeft = !!(c.sidearm && !c.onSidearm && (!c._sideRounds || c._sideRounds.mag + c._sideRounds.spare > 0));   /* §ROUNDS a sidearm with rounds in it */
    return C.primaryReady ? (C.primaryReady(c) || sideLeft) : true;
  }

  function bandOf(d) {
    return d > CONST.BAND_TILE[0] ? 0 : d > CONST.BAND_TILE[1] ? 1 : 2;   // long / medium / short
  }

  /* ---------------------------------------------------------------- */
  /* what anybody actually knows                                       */
  /* ---------------------------------------------------------------- */

  /** How far this fighter can pick a body out of the ground.
   *
   * §APPROACH THIS WAS WHY THE FOG NEVER BIT. The rule added `SIGHT_FIELDCRAFT` (0.30) tiles
   * for every point of fieldcraft OVER TEN — written when a stat was imagined to run to twenty
   * or so. Fieldcraft actually runs to about 195, with a median of 91: median sight came to
   * THIRTY-EIGHT TILES on a board twenty-six wide, so every fighter could see the whole ground
   * and the whole spotting model, correct in itself, had nothing left to decide. Every fight in
   * the game opened with a shot on turn one and no ambush ever fired, because there was never
   * anybody unseen to ambush.
   *
   * Sight is read against the spread the rosters actually deal, between a floor and a ceiling
   * that mean something on this board: a poor scout picks a body out at SIGHT_NEAR, a superb
   * one at SIGHT_FAR, and neither of them sees the far corner. */
  function sightRange(u) {
    /* §ONE AIM FIELDCRAFT REACHES SIGHT. This was written for the sheet scale (fieldcraft 40 → seven
       tiles, 150 → fifteen) and read a copy divided by ten, so every value sat below 40 and every
       fighter on the grid saw exactly seven tiles: fieldcraft 52 and 165 were the same pair of eyes.
       It reads the sheet now, and a good scout sees twice as far as a poor one. */
    const fc = (u.stats && u.stats.fieldcraft) || 100;
    const t = Math.max(0, Math.min(1, (fc - CONST.SIGHT_STAT_LOW) / (CONST.SIGHT_STAT_HIGH - CONST.SIGHT_STAT_LOW)));
    /* §LIGHT in the planet's dark a fighter sees a good deal less far — unless at home in the dark */
    const nightCut = _night && !(u.hooks && u.hooks.has('night_encounter_bonus')) ? CONST.NIGHT_SIGHT : 1;
    /* §SIGHT (ruled) A LONG GUN'S SCOPE: its bearer sees out to the gun's reach. Eyes alone ran seven to fifteen tiles and
       the long band starts past fourteen, so a marksman almost never had a target at the range his rifle was made for */
    const eye = CONST.EYE_NEAR + t * (CONST.EYE_FAR - CONST.EYE_NEAR);
    const scope = (u.weapon && u.weapon.range === 'long' && !u.onSidearm && u.weapon.reach) ? u.weapon.reach : 0;
    return Math.max(eye, scope) * nightCut;
  }

  /**
   * SQUAD SIGHT, recomputed whenever the ground has changed under it.
   *
   * For each side, two sets: who they have EYES ON, and who they merely know is out there
   * because a shot came from somewhere. The second set is the reason the halved hit chance in
   * `combat.js` has something to describe — you can fire back at a muzzle flash, and you will
   * mostly miss.
   *
   * Recomputed rather than accumulated. A fighter who breaks contact behind a ridge is not
   * spotted any more, and that has to be true or there is no reason to ever break contact.
   * `_spotDirty` is set by anything that moves a body or removes one; nothing else needs to
   * know when to call this.
   */
  function ensureSpot(S) {
    if (!S._fog) return;
    const F = S._fog;
    /* THE DIRTY FLAG LIVES ON THE SHARED STATE, NOT ON EACH SIDE. It was per-side for one
       draft: `ensureSpot` recomputed every side's knowledge but cleared only the flag of the
       side it was handed, so the other sides stayed permanently dirty and the whole model
       recomputed on every single call. Cheap to write, invisible, and it would have made the
       cost of fog look like the cost of spotting. */
    if (!F.dirty) return;
    F.dirty = false;
    const { sides, map, turn } = F;
    for (const side of sides) {
      const eyes = alive(side.units);
      const seen = new Set(), heard = new Set();
      for (const other of sides) {
        if (other === side) continue;
        for (const f of other.units) {
          if (f.state !== 'ok' && f.state !== 'light') continue;
          /* §CONCEAL WHAT A BODY IS LYING IN DECIDES HOW FAR OFF IT CAN BE PICKED OUT. The
             pass asked two things — is it inside my sight, and is there a line to it — so a
             fighter flat in heavy cover was as visible at fourteen tiles as one standing in the
             open, and every scrap of concealment on the map did nothing at all for being SEEN.
             Cover shortens the reach of an eye against that body; movement gives it back,
             because a man who is moving is a man you notice; and a body that just fired is
             seen wherever it is, since a muzzle flash is not concealed by a bush. */
          const cov = concealAt(map, f);
          let reach = 1 - cov * CONST.CONCEAL_PER_COVER;
          if (f.repositioning || f._crossed) reach += CONST.CONCEAL_MOVING;
          if ((f._revealedUntil || -1) >= turn) reach = 1;      /* it just fired */
          reach = Math.max(CONST.CONCEAL_FLOOR, Math.min(1, reach));
          let have = false;
          for (const u of eyes) {
            if (dist(u, f) > sightRange(u) * reach) continue;
            if (!hasLOS(map, u, f)) continue;
            have = true; break;
          }
          /* §DEVICES a drone overhead sees what is under it: no line of sight wanted, and
             concealment does not hide a body from above */
          if (!have) for (const dr of _drones)
            if (dr.side === side.tag && Math.hypot(dr.x - f.x, dr.y - f.y) <= CONST.DRONE_RADIUS) { have = true; break; }
          if (have) seen.add(f.id);
          /* fired recently: they know roughly where, not exactly where */
          else if ((f._revealedUntil || -1) >= turn &&
                   (f._revealRange == null || side.units.some(m => (m.state === 'ok' || m.state === 'light') && dist(m, f) <= f._revealRange)))
            heard.add(f.id);   /* §GUNS heard only within the gun's carry */
        }
      }
      side._seen = seen;
      side._heard = heard;
      /* where to walk when you know of nobody. A squad with no contact is not paralysed and
         it is not omniscient: it goes to the last place anybody was, and failing that it goes
         to the middle, because that is where the fight is. */
      if (seen.size || heard.size) {
        let sx = 0, sy = 0, n = 0;
        for (const other of sides) {
          if (other === side) continue;
          for (const f of other.units) {
            if (!seen.has(f.id) && !heard.has(f.id)) continue;
            sx += f.x; sy += f.y; n++;
          }
        }
        if (n) side._lastContact = { x: sx / n, y: sy / n };
      }
    }
  }

  /** Does this side have this body's position? Eyes on it, or a shot to fire back at. */
  const sideKnows = (side, f) =>
    !side._seen ? true : (side._seen.has(f.id) || side._heard.has(f.id));
  /** Eyes on, as opposed to merely knowing somebody is out there. */
  const sideSees = (side, f) => !side._seen ? true : side._seen.has(f.id);

  /** Everyone on `E` this side can do anything about. Empty is a real and common answer. */
  /* §APPROACH TWO TUNINGS TRIED AND REVERTED, recorded so the next hand does not spend the
     afternoon rediscovering them. (1) Refusing a shot at a body only HEARD unless it was close
     cured the hit rate (0.12 → 0.27) and made the clock problem worse, not better: 9 fights in
     18 ran out instead of 5, because a squad with nothing to shoot at simply waits. (2) Making
     a blind body close on its search point rather than hold its weapon's range emptied the
     fight altogether — every long-band fight ran the clock with no shots fired at all, because
     `near` is a PLACE when blind, not a body, and both squads converged on the middle without
     converging on each other. The fault they were both aimed at is real and is NOT the shooting
     rule: it is that a squad which has lost contact has no way to LOOK for anybody. That wants
     a search behaviour, which is the next piece of this work and not a constant. */
  function knownFoes(side, foes) {
    if (!side._seen) return foes;
    return foes.filter(f => sideKnows(side, f));
  }

  /**
   * Where a fighter with no contact at all should head. Reuses the band-pull the movement
   * scorer already applies toward the nearest enemy, so a squad with nobody in sight advances
   * to the range its weapons want from the last place anyone was seen — rather than standing
   * still, which is what an empty enemy list would otherwise produce.
   */
  /* §SEARCH WHERE A SQUAD LOOKS WHEN IT CAN SEE NOBODY. It went to the last place anybody was
     seen, or the middle of the map — and two squads that had never made contact both walked to
     the same middle and milled there, each holding the range its guns preferred from a POINT
     rather than from a body. Once concealment was built this stopped being a curiosity: half of
     the shape gate's fights ran out the clock, because a forest full of people who cannot see
     each other is a forest full of people standing still.
     A squad with nothing to go on sweeps ACROSS the ground the enemy came from, and the aim
     point drifts as the fight runs so the sweep covers ground rather than orbiting one spot. */
  function searchPoint(side, map, turn) {
    if (side._lastContact) return side._lastContact;
    const home = side.sIdx === 0 ? map.w - 1 : 0;          /* the ground THEY came from */
    const t = (turn || 0) * CONST.SEARCH_DRIFT;
    const y = (map.h - 1) * (0.5 + 0.42 * Math.sin(t + (side.sIdx || 0) * 2.1));
    return { x: home, y: y };
  }

  /** You fired. Unless you are carrying something quiet, that is a place people now look. */
  function revealByFiring(u, turn) {
    /* §GUNS NOISE: a shot carries as far as the gun is loud — so many tiles a point; a silenced gun barely past the
       muzzle. The gun's number decides; the `silent` tag keeps its old rule only for a gun that names none. */
    const w = u.weapon || {};
    /* §MODS (fixed) A SUPPRESSOR SILENCES THE GUN IT IS ON. `silent` was honoured only for a gun with no noise figure, and
       every gun in the catalogue has one, so the Suppressor's "Grants Silent" did nothing in a fight: it is noise 0 now */
    const silent = C.hasQuirk(u, 'silent');
    if (w.noise == null && silent && !u._firedOnce) { u._firedOnce = true; return false; }
    u._firedOnce = true;
    u._revealedUntil = turn + CONST.REVEAL_TURNS;
    u._revealRange = silent ? 0 : w.noise != null ? w.noise * CONST.NOISE_TILES_PER_POINT : null;
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * A squad arrives in an AREA, not a rank. Where in that area depends on what it was doing
   * when contact happened: a squad that had time to choose its ground starts behind cover,
   * and one that walked into this starts wherever it was walking. The bias is deliberately
   * mild — aggression should cost something, not be punished.
   */
  /**
   * `openingBand` is where CONTACT was made — 0 long, 1 medium, 2 short — and the day loop has
   * been choosing one for every engagement since Step 4, weighted by the planet's own bias
   * toward open ground or close country.
   *
   * The grid ignored it and deployed both sides at opposite edges of the map, every time. So
   * every firefight in the game began at maximum range whatever the planet was like, and
   * measured, **83% of all shots were taken at long range even when both squads carried
   * shotguns** — short band was 1%. The entire short shelf of the catalog had no way to exist,
   * a planet's terrain bias did nothing, and the ambush that the approach system spends a
   * whole day of squad AI setting up arrived at the same distance as a chance meeting.
   *
   * It is not a balance number. It is a value computed by one system, handed to another, and
   * read by nobody — the same fault as the resolver itself, one level down.
   */
  /* §APPROACH HOW FAR APART A FIGHT OPENS. A long opening is now well BEYOND sight, so neither
     side starts knowing where the other is and the approach is a real part of the fight: they
     close under partial knowledge, and whoever is seen first is at a disadvantage before a
     round is fired. A short opening is unchanged — walking into somebody at nine metres is not
     stealth, and it should not pretend to be. */
  function deployGap(band) {
    const B = CONST.BAND_TILE;                       /* [long>14, medium>6] */
    if (band === 2) return Math.max(2, Math.round(B[1] * 0.6));
    if (band === 1) return Math.round(B[0] * CONST.OPEN_MEDIUM);
    return Math.round(B[0] * CONST.OPEN_LONG);
  }
  /** the board a given opening is fought on: wide enough for the gap and the closing */
  function boardFor(band) {
    const w = Math.max(CONST.W, deployGap(band) + CONST.BOARD_MARGIN);
    return { w: w, h: CONST.H + (w > CONST.W ? CONST.BOARD_TALLER : 0) };
  }

  /**
   * WHERE A SIDE COMES ONTO THE GROUND.
   *
   * This knew two edges: side zero on the left, everybody else on the right. With two sides
   * that is exactly right and it is left untouched. With three it was wrong in a way nobody
   * could see without a map — two corps who were shooting at each other deployed intermingled
   * along the same edge, which happens 28 times in six contests. And it made arriving from
   * behind impossible to express at all, because there was nowhere to arrive from.
   *
   * A bearing places a side anywhere on the perimeter instead. `opts.bearing` is the compass
   * direction that side approached from, taken from where its squads actually walked in from
   * on the world map, so coming round the back on the ground is the same fact as coming round
   * the back on the map.
   *
   * ABSENT A BEARING NOTHING CHANGES. Two-sided fights with no bearings supplied take the
   * original left/right path, tile for tile and random draw for random draw, which is what
   * keeps the five fixed-seed snapshots honest rather than re-blessed.
   */
  function deploy(rng, map, units, side, prep, gap, opts) {
    opts = opts || {};
    const taken = opts.taken || new Set();
    /* both sides move in from their edge by the same amount, so the gap between them is what
       the opening band says it should be and the map is used from the middle outward */
    const inset = gap == null ? 0
      : Math.max(0, Math.floor((map.w - CONST.DEPLOY_DEPTH * 2 - gap) / 2));
    const spots = [];
    if (opts.bearing != null) {
      /* a wedge of the map centred on the direction they came in from */
      const cx = (map.w - 1) / 2, cy = (map.h - 1) / 2;
      const ex = cx + Math.cos(opts.bearing) * cx, ey = cy + Math.sin(opts.bearing) * cy;
      const reach = opts.reach || Math.max(CONST.DEPLOY_DEPTH, Math.round(Math.min(map.w, map.h) / 2));
      /* YOU DO NOT WALK IN NEXT TO SOMEBODY. Arriving partway through was placed by the same
         rule as deploying at the start — anywhere within reach of a point on the perimeter,
         which on this grid runs nine tiles deep. So a squad that had just marched to the sound
         of shooting could materialise beside a man already in the fight.
         Starting off the edge is how the game says a side was ready and dug in before contact,
         and that reasoning does not survive being applied to somebody who arrives an hour
         later. They come in from outside, so they come in AT the outside: the two bordering
         rows and columns and nowhere else. */
      const band = opts.edgeOnly ? CONST.ARRIVE_EDGE_BAND : 0;
      /* §DEPLOY A SIDE ON A BEARING STANDS OFF BY THE OPENING GAP. This took anything within nine tiles of its edge
         point and never read the gap, so every Divide fight (all of them come on by bearing) opened where it fell: a
         long opening at sixteen tiles, a medium one at eight, three banners within two of each other, and contact on
         turn one nearly always. A side now deploys in the old band — half the gap out from the middle, the deployment's
         depth deep and its span wide — laid along its bearing. */
      if (!band && !opts.reach && gap != null) {
        const c = Math.cos(opts.bearing), s = Math.sin(opts.bearing);
        const proj = (x, y) => (x - cx) * c + (y - cy) * s, lat = (x, y) => Math.abs(-(x - cx) * s + (y - cy) * c);
        const maxP = Math.max(proj(0, 0), proj(map.w - 1, 0), proj(0, map.h - 1), proj(map.w - 1, map.h - 1));
        const lo = Math.max(0, Math.min(gap / 2, maxP - CONST.DEPLOY_DEPTH));
        const need = units.length * 2;
        for (let span = CONST.DEPLOY_SPAN / 2; ; span += 2) {
          spots.length = 0;
          for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++) {
            if (blocked(map, x, y)) continue;
            const p = proj(x, y);
            if (p < lo || p > lo + CONST.DEPLOY_DEPTH || lat(x, y) > span) continue;
            let adj = 0;
            for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) adj = Math.max(adj, at(map, x + ox, y + oy));
            spots.push({ x, y, cover: adj, d: p });
          }
          if (spots.length >= need || span > Math.max(map.w, map.h)) break;
        }
        spots.sort((a, b) => b.d - a.d);
        return place(rng, map, units, prep, spots, taken, opts);
      }
      for (let x = 0; x < map.w; x++) {
        for (let y = 0; y < map.h; y++) {
          if (blocked(map, x, y)) continue;
          if (band && !(x < band || x >= map.w - band || y < band || y >= map.h - band)) continue;
          if (Math.hypot(x - ex, y - ey) > reach) continue;
          let adj = 0;
          for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) adj = Math.max(adj, at(map, x + ox, y + oy));
          spots.push({ x, y, cover: adj, d: Math.hypot(x - ex, y - ey) });
        }
      }
      spots.sort((a, b) => a.d - b.d);
      return place(rng, map, units, prep, spots, taken, opts);
    }
    const x0 = side === 0 ? 1 + inset : map.w - 1 - CONST.DEPLOY_DEPTH - inset;
    /* §RANGE (fixed) a squad deploys facing the other across the middle of the board, not strung down its whole height:
       spread over all eighteen rows, a "short" opening put the nearest rival six or seven tiles off — the edge of medium */
    const yLo = Math.max(0, Math.floor((map.h - CONST.DEPLOY_SPAN) / 2)), yHi = Math.min(map.h, yLo + CONST.DEPLOY_SPAN);
    for (let x = x0; x < x0 + CONST.DEPLOY_DEPTH; x++) {
      for (let y = yLo; y < yHi; y++) {
        if (x < 0 || x >= map.w) continue;
        if (blocked(map, x, y)) continue;
        let adj = 0;
        for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) adj = Math.max(adj, at(map, x + ox, y + oy));
        spots.push({ x, y, cover: adj });
      }
    }
    /* `flanked` has to survive this call. It was dropped here, so the flag reached the bearing
       path and not the ordinary two-edge one — which is every two-sided fight, which is 94% of
       them. The construction test came back zero of two hundred a second time and was right
       both times, for two entirely different reasons. */
    return place(rng, map, units, prep, spots, taken,
                 { side: side, flanked: opts.flanked, fallback: { x: x0, y: 0 } });
  }

  /**
   * Put bodies on chosen ground. Shared by the original two-edge deployment and by bearing
   * placement, so a side arriving from the north picks its ground by the same rules as one
   * arriving from the west, and a squad walking in on turn nine picks it the same way as one
   * that started there.
   *
   * `flanked` is the one difference, and it is the first thing in the project to read the
   * squad-level flank the day loop has been computing since Step 6. Being caught from two
   * arcs means the cover you took faces the wrong way — you set up against one threat. So a
   * flanked side gets far less use out of the cover on the ground, which is what being
   * flanked has always meant in the fiction and never meant in the arithmetic.
   */
  function place(rng, map, units, prep, spots, taken, opts) {
    opts = opts || {};
    const covered = P.shuffle(rng, spots.filter(s => s.cover > 0));
    const bare = P.shuffle(rng, spots.filter(s => s.cover === 0));
    const coverBias = CONST.PREP_COVER_BIAS * (opts.flanked ? CONST.FLANKED_COVER_MULT : 1);
    units.forEach((u) => {
      const wantCover = rng() < (prep || 0) * coverBias;
      let pool = wantCover ? covered : bare;
      let pick = null;
      for (const list of [pool, covered, bare, spots]) {
        pick = list.find(s => !taken.has(s.x + ',' + s.y));
        if (pick) break;
      }
      if (!pick) pick = opts.fallback || { x: 0, y: 0 };
      taken.add(pick.x + ',' + pick.y);
      u.x = pick.x; u.y = pick.y;
      u.ap = CONST.AP; u.side = opts.side != null ? opts.side : u.side;
      u.dashed = false; u.overwatch = false;
    });
  }

  const alive = (us) => us.filter(u => u.state === 'ok' || u.state === 'light');

  /**
   * Overwatch was set and never fired: `shoot()` took a `react` argument, the constant
   * existed, the counter existed, and no reaction shot was ever taken. A unit spending its
   * second action to watch was spending it on nothing — which is almost certainly why
   * moving first beat waiting, and why nobody had a reason to hold ground.
   */
  function triggerOverwatch(rng, mover, sides, map, tel, log) {
    /* §SUPPRESSION getting up inside a lane draws its burst first */
    leaveLanes(rng, mover, mover._actFrom || mover, sides, map, tel, log);
    if (!upright(mover)) return;
    for (const S of sides) {
      for (const w of alive(S.units)) {
        if (!w.overwatch || w.side === mover.side) continue;
        if (w.suppressed) continue;          /* §SUPPRESSION (ruled) a pinned man is not watching, he is keeping his head down */
        if (!hasLOS(map, w, mover)) continue;
        /* YOU CANNOT REACT TO SOMEBODY YOU HAVE NOT SEEN. Line of sight alone used to be the
           whole test, which was right when everybody could see everybody. Under fog it would
           mean a watcher firing at a man crossing ground in the dark two hundred metres out
           whose existence nobody had established — and it would have quietly cancelled most of
           what fog is for, because overwatch is the commonest second action on the field.
           Squad knowledge, not personal: if a scout has him, the watcher may take the shot. */
        if (w._fog) { ensureSpot(S); if (!sideKnows(S, mover)) continue; }
        w.overwatch = false;
        w._reacting = true;
        tel.overwatchShots++;
        /* `sides[1 - w.side]` is two-sided arithmetic and returns undefined the moment a
           third banner is on the field — which is 5.8% of engagements. The enemy of an
           overwatch shot is simply whoever the mover belongs to. */
        shoot(rng, w, mover, map, S, sides[mover.side] || sides[1 - w.side], tel, log, true);
        w._reacting = false;
        if (mover.state === 'dead' || mover.state === 'down') return;
      }
    }
  }

  /**
   * Two people cannot stand in the same doorway. Without this, every unit evaluates the
   * same candidate tiles, reaches the same conclusion, and the whole squad piles onto one
   * square — eight fighters on two tiles by turn one, rendering as two dots. It is also
   * why the squad moved as a blob rather than as eight people with different problems.
   */
  function occupancy(sides) {
    const taken = new Set();
    for (const S of sides) for (const u of S.units) {
      if (u.state === 'dead') continue;
      taken.add(u.x + ',' + u.y);
    }
    return taken;
  }
  const freeTile = (taken, u, x, y) => !taken.has(x + ',' + y) || (u.x === x && u.y === y);

  /* ---- WHERE CAN THIS FIGHTER ACTUALLY GET TO? -------------------------------------
   *
   * The move search used to walk an 11x11 box around the fighter, keep every open tile inside
   * a Euclidean radius of five, and score it. It never asked what was BETWEEN the two tiles.
   * `COVER_BLOCKS_MOVE` declares every cover object impassable and was consulted only about
   * where you land — so a fighter could step through a solid wall to the other side of it,
   * every turn, and the resolver's whole claim to being about ground was false for movement.
   *
   * A flood fill fixes the rule and the cost at once, which is the tell that it was the right
   * fix rather than a performance trick: walls now stop people, and because walls now stop
   * people the reachable set on a real map is a fraction of the box that was being scored.
   *
   * Diagonals cost more than orthogonals so that moving is measured in ground covered rather
   * than in steps taken, which is also why you cannot slip through the corner between two
   * blocks — a gap you cannot fit through is not a route.
   */
  function reachable(map, taken, u, mp) {
    const out = [{ x: u.x, y: u.y, cost: 0 }];
    const seen = new Map([[u.x + ',' + u.y, 0]]);
    let frontier = [{ x: u.x, y: u.y, cost: 0 }];
    const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
                   [1, 1, 1.5], [1, -1, 1.5], [-1, 1, 1.5], [-1, -1, 1.5]];
    while (frontier.length) {
      const next = [];
      for (const cur of frontier) {
        for (const [dx, dy, c] of STEPS) {
          const x = cur.x + dx, y = cur.y + dy, cost = cur.cost + c;
          if (cost > mp) continue;
          if (blocked(map, x, y)) continue;
          /* no cutting the corner between two blocks */
          if (dx && dy && blocked(map, cur.x + dx, cur.y) && blocked(map, cur.x, cur.y + dy)) continue;
          const k = x + ',' + y;
          const had = seen.get(k);
          if (had !== undefined && had <= cost) continue;
          seen.set(k, cost);
          const cell = { x, y, cost };
          next.push(cell);
          if (freeTile(taken, u, x, y)) out.push(cell);
        }
      }
      frontier = next;
    }
    return out;
  }

  /* ---- AND WHICH OF THOSE IS A POSITION RATHER THAN A PATCH OF DIRT? -----------------
   *
   * Even pathed, an open basin leaves eighty-odd reachable tiles, and scoring all of them
   * against every enemy twice is both slow and a poor model of a decision. A person playing
   * this does not choose between eighty squares; they choose between a handful of things they
   * can name — behind that wall, round that corner, up beside the rock, forward to the lip.
   *
   * So the candidates are the tiles that MEAN something: where you are now, anything touching
   * a piece of cover, and a short reach toward and away from the nearest enemy for when there
   * is no cover to be had. Everything else is dirt that scores within noise of its neighbours.
   */
  /** How far this fighter can get, which is a property of what they are carrying.
      `mob_up` and `mob_down` were "wired" at Step 7.5 into `bandMobility` — a function that
      lives in the abstract model and is called only by the range contest the grid replaced.
      They were dead on the resolver that runs, and the reachability guard passed them because
      it looked for the tag anywhere in `combat.js` rather than anywhere the grid can reach.
      On a grid the honest meaning of mobility is simply how much ground you cover. */
  function moveTilesFor(u, unseen) {
    /* §ARMOUR what a body wears weighs on its feet as its gun does: armour's mobility and its mob tags were declared,
       priced and never reached the grid, so heavy plate cost nothing to carry */
    const at = (u.armor && u.armor.tags) || [];
    let mp = CONST.MOVE_TILES + ((u.weapon && u.weapon.mobility) || 0) * 0.5 + ((u.armor && u.armor.mobility) || 0) * 0.5;
    if (C.hasQuirk(u, 'mob_down')) mp -= CONST.MOB_TILES;
    if (C.hasQuirk(u, 'mob_up')) mp += CONST.MOB_TILES;
    if (at.indexOf('mob_down') >= 0) mp -= CONST.MOB_TILES;
    if (at.indexOf('mob_up') >= 0) mp += CONST.MOB_TILES;
    /* SOFT BOOTS — "arrives places without the courtesy of being heard first". Named on the
       suite's own list of hooks read by no system at all, waiting for a spotting model. It
       pays while nobody has eyes on you, which is the only time moving quietly is worth
       anything: once you are seen, the ground you cover is ground people watch you cross. */
    if (unseen && u.hooks && u.hooks.has('unspotted_movement_bonus')) mp += CONST.SOFT_BOOTS_TILES;
    if (u.hooks && u.hooks.has('reposition_speed_up')) mp += 1;              /* §QUIRKS quick on their feet */
    if (u.race === 'svalbard') mp += CONST.SVALBARD_TILES;                  /* §RACES four legs cover ground */
    /* §RACES a flier with ground to cross takes to the air: further, over cover, and seen */
    /* §RACES A FLIER HAS THE AIR AVAILABLE TO IT, once a fight, never on a hurt wing. The
       tiles are offered while the move is being CHOSEN — the first cut of this set the want
       after the choice was made, so the wings were never in the reckoning and no Ththyn ever
       left the ground. Taking them is what spends it. */
    if (u.race === 'ththyn' && !u._flew && !u.wingHurt && (u.state === 'ok' || u.state === 'light')) {
      mp += CONST.FLIGHT_TILES; u._flightOffered = true;
    }
    if (u.hooks && u.hooks.has('evasion_surge') && u._underFire) mp += 1;    /* §QUIRKS moves when shot at */
    return Math.max(2, mp);
  }

  function candidates(map, taken, u, mp, near, foes) {
    const reach = reachable(map, taken, u, mp);
    const out = [], seen = new Set();
    const keep = (c) => { const k = c.x + ',' + c.y; if (!seen.has(k)) { seen.add(k); out.push(c); } };
    keep({ x: u.x, y: u.y, cost: 0 });
    for (const c of reach) {
      if (at(map, c.x + 1, c.y) > 0 || at(map, c.x - 1, c.y) > 0 ||
          at(map, c.x, c.y + 1) > 0 || at(map, c.x, c.y - 1) > 0) keep(c);
    }
    if (near) {
      /* the two honest options when there is nothing to hide behind */
      const ang = Math.atan2(near.y - u.y, near.x - u.x);
      /* AND ROUND THE SIDE. Only toward and away were offered, so "go round them" was never a
         tile anybody could pick: the candidate set was where you stand, anything touching
         cover, straight in, and straight back. A fighter settled into cover therefore had
         nothing better to consider and stopped moving — measured at 84% of fighters changing
         tile on the opening turn and about a quarter by mid-fight, which reads as bunkering
         down because it is. Scoring cannot choose a move that was never proposed. */
      for (const sign of [1, -1]) {
        let best = null;
        for (const c of reach) {
          const d = Math.hypot(c.x - u.x, c.y - u.y);
          if (d < 1) continue;
          const a2 = Math.atan2(c.y - u.y, c.x - u.x);
          let off = Math.abs(a2 - (ang + sign * Math.PI / 2));
          while (off > Math.PI) off = Math.abs(off - 2 * Math.PI);
          if (off > 0.7) continue;
          if (!best || d > best.d) best = { c: c, d: d };
        }
        if (best) keep(best.c);
      }
      for (const sign of [1, -1]) {
        let best = null;
        for (const c of reach) {
          const d = Math.hypot(c.x - u.x, c.y - u.y);
          if (d < 1) continue;
          const a2 = Math.atan2(c.y - u.y, c.x - u.x);
          let off = Math.abs(a2 - ang * 1); if (sign < 0) off = Math.abs(Math.PI - off);
          if (off > 0.7) continue;
          if (!best || d > best.d) best = { c: c, d: d };
        }
        if (best) keep(best.c);
      }
    }
    /* §AI ROUND THE SIDE OF SOMEBODY'S COVER. The side-steps above are ninety degrees off the line to the nearest
       enemy, and at range five tiles of that cannot get outside the arc his cover faces — so a flank was only ever
       an accident. For the nearest few rivals the fighter can see who are in cover, the reachable tile nearest him
       from which that cover no longer faces is offered too. */
    if (foes && foes.length) {
      const covered = foes.filter(f => concealAt(map, f) > 0).sort((a, b) => dist(u, a) - dist(u, b)).slice(0, CONST.FLANK_LOOK);
      for (const f of covered) {
        let best = null;
        for (const c of reach) {
          if (coverAgainst(map, f, c) !== 0 || !hasLOS(map, c, f)) continue;
          const d = Math.hypot(c.x - f.x, c.y - f.y);
          if (!best || d < best.d) best = { c: c, d: d };
        }
        if (best) keep(best.c);
      }
    }
    return out;
  }

  /** One shot, using the canon hit and severity model with tactical inputs. */
  function shoot(rng, shooter, target, map, S, E, tel, log, react) {
    const d = dist(shooter, target);
    const band = bandOf(d);
    /* feed the abstract resolver a target whose cover is what the ground actually gives
       against THIS shooter, from THIS direction */
    const cov = coverWithSmoke(map, target, shooter);
    const saveCover = target.cover, saveFlank = target.flanked;
    target.cover = cov;
    /* they had cover where they stand, and it does not face you. This read `target.cover`, which the grid never sets
       (every body carries the 1 it was made with), so everybody in the open was "flanked" */
    target.flanked = cov === 0 && concealAt(map, target) > 0;
    /* Every shot is a ROUND, not a volley. This is the whole argument for the tactical
       model over the abstract one: a magazine now runs out in front of you, an energy
       weapon cooks, and a fighter with neither finishes the fight on a pistol. */
    /* §GUNS A RELOAD IS NOT RUNNING DRY: the round goes on the magazine, the sidearm stays holstered — treating a
       reloading gun as an empty one drew pistols across the whole field, shooting at ranges no pistol reaches */
    if (shooter.reloading > 0) { tel.reloading = (tel.reloading || 0) + 1; target.cover = saveCover; target.flanked = saveFlank; return false; }
    /* §GUNS `min_band_medium` — "cannot fire at short band at all": it does not, rather than firing at the floor */
    if (band === 2 && !shooter.onSidearm && C.hasQuirk(shooter, 'min_band_medium')) { tel.tooClose = (tel.tooClose || 0) + 1; target.cover = saveCover; target.flanked = saveFlank; return false; }
    if (!C.primaryReady(shooter)) {
      if (!shooter.onSidearm && !C.useSidearm(shooter)) { tel.dry++; target.cover = saveCover; target.flanked = saveFlank; return false; }
      if (!shooter._drewFlag) { shooter._drewFlag = true; tel.sidearmDraws++; }
    }
    if (!C.spendShot(shooter, 'shot')) { tel.dry++; target.cover = saveCover; target.flanked = saveFlank; return false; }
    target._shotSince = true;   /* §QUIRKS shot at since its own last turn (evasion_surge reads it) */
    /* §4.2 `sustained` — staying on one target pays, switching resets it. The counter lives in
       `combat.js`'s exchange loop, which the grid does not run, so the tag was inert on the
       resolver that matters: four weapons carrying it, priced for it, doing nothing. On a grid
       "the same side" is too coarse to mean anything — everyone shoots the same side all fight
       — so it tracks the same PERSON, which is what walking your fire onto a target actually
       is, and what makes switching targets cost something. */
    if (!react) {
      if (shooter._lastMark === target.id) shooter._sustain = (shooter._sustain || 0) + 1;
      else shooter._sustain = 0;
      shooter._lastMark = target.id;
    }
    /* ---- WHAT EACH OF THEM KNOWS ABOUT THE OTHER ---------------------------------------
       Two independent facts, and they are not symmetrical.
       Do I have this target's POSITION, or only the rough direction a shot came from?
         `combat.js` halves the hit chance against a body that is not spotted, and that line
         had never once executed because nothing ever wrote the field it reads. Firing back at
         a muzzle flash is what it was written for.
       Do THEY know where I am? If not, I am shooting from concealment and I am steadier for
       it — the designer's ruling, and the shape Ambush Instinct was always described as.
       Set around the call and restored after, which is the idiom this function already uses
       for cover and flanking rather than a second convention. */
    const fogOn = !!(S && S._seen);
    const saveSpotted = target.spotted, saveUnseen = shooter._unseen;
    let unseen = false;
    if (fogOn) {
      const eyesOn = sideSees(S, target);
      target.spotted = eyesOn;
      if (eyesOn) tel.spotShots++; else tel.blindShots++;
      /* squad sight, counted: could this shooter personally see the body he just fired at? */
      if (eyesOn && dist(shooter, target) > sightRange(shooter)) tel.squadSightShots++;
      /* am I concealed from the people I am shooting at? */
      unseen = !!(E && E._seen) && !sideKnows(E, shooter);
      shooter._unseen = unseen;
      if (unseen) {
        tel.unseenShots++;
        if (shooter.hooks && shooter.hooks.has('unspotted_open_fire_bonus')) tel.ambushInstinct++;
      }
    }
    /* §QUIRKS the shot's own context: who is shooting for which side, and whether this is a
       reaction — both were wanted by hooks that had no way to ask */
    /* §LIGHT the planet's dark reaches every shot: aim suffers at night unless the fighter is at home in it */
    let p = C.hitChance(shooter, target, band,
                          { unseen: !!unseen, overwatch: !!react, side: shooter._side, night: !!_night, dist: d }, !!react)
              * (react ? CONST.OVERWATCH_REACT : 1)
              * CONST.SHOT_HIT_MULT;
    /* §AI (ruled) a snap reaction at a man crossing is never a better shot than an aimed one at him: the spotting bonus
       and the reaction discount netted ×1.19, so overwatch out-shot aiming */
    if (react) p = Math.min(p, C.hitChance(shooter, target, band, { unseen: !!unseen, side: shooter._side, night: !!_night, dist: d }, false) * CONST.SHOT_HIT_MULT);
    tel.shots++;
    /* THE THIRD COUNTER OF THAT SET, FINALLY RAISED. The note beside the declaration records
       that `vents`, `chargeOut` and `energyShots` were once missing from the telemetry object
       and were added back. Two of them were also given somewhere to be INCREMENTED; this one
       was not, so it sat declared, initialised and permanently zero — reporting a clean nought
       while 585 weapons vented and 57 ran out of charge in a single contest. Not NaN, not
       unreachable: never raised, which is the third way a zero lies and the hardest to notice,
       because the counter looks perfectly healthy where it is declared.
       On a sidearm you are firing a conventional weapon, whatever your primary is. */
    if (C.isEnergy(shooter) && !shooter.onSidearm) tel.energyShots++;
    /* which range fights actually happen at — the grid derives band from distance, so unlike
       the abstract model this is an OUTCOME rather than a setting, and it is the only honest
       way to ask whether a short-range weapon ever gets to be a short-range weapon */
    (tel.bandShots = tel.bandShots || [0, 0, 0])[band]++;
    let hit = rng() < p;
    if (hit) {
      tel.hits++;
      /* COMPOSITION.md §6 — the tags that act ON A HIT. Ported from the abstract model's
         exchange loop, which the grid does not run: every one of these was wired at Step 7.5
         into code the engagement model never reaches, so they were dead a second time in the
         same step. `emp` and the energy tags stay where they are — they are read at their own
         call sites in `combat.js` that the grid does go through. */
      if (C.hasQuirk(shooter, 'disorient')) {
        comp(rng, target, C.CONST.DISORIENT_COMP);
        tel.disorients = (tel.disorients || 0) + 1;
      }
      if (C.hasQuirk(shooter, 'chill')) {
        target._chilled = true;                    /* they are not going anywhere next turn */
        tel.chills = (tel.chills || 0) + 1;
      }
      /* §GUNS SPREAD: pellets, a blast — the gun catches up to `spread` more beside the one it hit, each with a reduced
         chance and at reduced power (the round's edge, not its centre) */
      const spreadN = (shooter.weapon && shooter.weapon.spread) || 0;
      if (spreadN > 0) {
        const beside = E.units.filter(f => f !== target && (f.state === 'ok' || f.state === 'light') && dist(f, target) <= 1);
        let caught = 0;
        for (const f of beside) {
          if (caught >= spreadN) break;
          if (rng() >= p * CONST.SPREAD_HIT_MULT) continue;
          const edge = Object.assign({}, shooter, { weapon: Object.assign({}, shooter.weapon, { power: Math.round((shooter.weapon.power || 0) * CONST.SPREAD_POWER_MULT) }) });
          applyHit(rng, f, C.resolveSeverity(rng, edge, f, S.policy, band, null, tel.turn), tel, log, shooter, E);
          caught++; tel.spreadHits = (tel.spreadHits || 0) + 1;
          if (log) log.push({ t: tel.turn, type: 'spread', by: shooter.id, at: f.id, w: (shooter.weapon || {}).name });
        }
      }
      if (C.hasQuirk(shooter, 'arc_chain')) {
        const near = E.units.filter(f => f !== target && (f.state === 'ok' || f.state === 'light')
                                      && dist(f, target) <= CONST.SUPPRESS_RADIUS);
        if (near.length) {
          const second = near[Math.floor(rng() * near.length)];
          applyHit(rng, second, 'graze', tel, log, shooter, E);
          tel.arcChains = (tel.arcChains || 0) + 1;
        }
      }
      if (log) log.push({ t: tel.turn, type: 'hit', by: shooter.id, at: target.id,
                          p: +p.toFixed(3), band, cover: cov,
                          w: (shooter.weapon || {}).name, ammo: shooter.ammo, react: !!react });
      chipCoverFrom(rng, map, shooter, target, tel, log);
      const sevMain = C.resolveSeverity(rng, shooter, target, S.policy, band, null, tel.turn);
      applyHit(rng, target, sevMain, tel, log, shooter, E);
      /* `emp` — "severity ×2 against turrets, drones and assault frames, and disables them". A frame it hits takes the
         round twice and is dead weight after; a drone or turret of theirs near the mark is put out. (It was declared
         with "nothing mechanical to hit yet"; the drones, turrets and frames have all existed since.) */
      if (C.hasQuirk(shooter, 'emp')) {
        if (target.armor && target.armor.id === 'itm_assault_frame' && (target.state === 'ok' || target.state === 'light')) {
          applyHit(rng, target, sevMain, tel, log, shooter, E);
          target.armor = Object.assign({}, target.armor, { protection: 0, resist: { ballistic: 0, energy: 0, explosive: 0 }, tags: [] });
          tel.empFrames = (tel.empFrames || 0) + 1;
        }
        const foeTag = E.tag;
        for (const L of [_drones, _turrets]) for (let i = L.length - 1; i >= 0; i--)
          if (L[i].side === foeTag && Math.hypot(L[i].x - target.x, L[i].y - target.y) <= CONST.AREA_RADIUS) { L.splice(i, 1); tel.empDevices = (tel.empDevices || 0) + 1; if (S._fog) S._fog.dirty = true; }
      }
    }
    /* TEMPO — the extra rounds this weapon puts down for the same action. A reaction shot is
       one round whatever the weapon is: you are firing at movement, not settling into a rate. */
    let extra = react ? 0 : Math.min(CONST.TEMPO_MAX_BURST - 1, (shooter._rateBank || 0) | 0);
    shooter._rateBank = (shooter._rateBank || 0) - extra;
    let recoil = 1;
    while (extra-- > 0 && C.spendShot(shooter, 'shot')) {
      recoil *= CONST.FOLLOWUP_HIT;   /* §GUNS recoil builds: each round after the first lands at FOLLOWUP_HIT of the one before */
      tel.shots++; tel.tempoShots = (tel.tempoShots || 0) + 1;
      if (C.isEnergy(shooter) && !shooter.onSidearm) tel.energyShots++;   /* extra rounds count */
      /* EXTRA ROUNDS WERE COUNTED AND NEVER RECORDED. This loop raised `tel.shots` and resolved
         the hit, but wrote no log entry — so a Belt Machine Gun that put four rounds downrange
         appeared in the replay as one, and 366 shots in twenty-five fights existed in the
         telemetry and nowhere a reader could see them. The counter and the record disagreed
         about the same event, and only the counter was ever checked. */
      /* §GUNS (ruled) a fast gun's rate costs it here, on the rounds after the first, where the recoil is */
      const tHit = rng() < p * recoil;
      chipCoverFrom(rng, map, shooter, target, tel, log);
      if (log) log.push({ t: tel.turn, type: tHit ? 'hit' : 'miss', by: shooter.id, at: target.id, why: (C.hitChance.why || []).slice(),
                          p: +p.toFixed(3), band: band, w: (shooter.weapon || {}).name,
                          ammo: shooter.ammo, react: !!react, tempo: true });
      if (tHit) {
        tel.hits++;
        applyHit(rng, target, C.resolveSeverity(rng, shooter, target, S.policy, band, null, tel.turn),
                 tel, log, shooter, E);
        hit = true;
      } else comp(rng, target, C.CONST.COMP.nearMiss);
      if (target.state !== 'ok' && target.state !== 'light') break;
    }
    /* (an aimed shot no longer pins: suppression is the lane, an action of its own — §SUPPRESSION) */
    if (!hit) {
      comp(rng, target, C.CONST.COMP.nearMiss);
      if (log) log.push({ t: tel.turn, type: 'miss', by: shooter.id, at: target.id, p: +p.toFixed(3), band, cover: cov, why: (C.hitChance.why || []).slice(), w: (shooter.weapon||{}).name, ammo: shooter.ammo, react: !!react });
      /* a miss still does something with the right weapon. `cover_shred` — "a miss still chips the target's position
         one grade": the piece he hides behind loses a grade. `ricochet` — "a miss has a 25% chance to hit another
         enemy in band": it does, as a hit. (Both were wired to things the grid never read: a squad's cover pool it does
         not have, and a flag nothing looked at.) */
      if (C.hasQuirk(shooter, 'cover_shred') && map) { const spot = coverTileFor(map, shooter, target);
        if (spot && chipTile(map, spot.x, spot.y, tel)) { tel.coverShred = (tel.coverShred || 0) + 1; if (S._fog) S._fog.dirty = true; } }
      if (C.hasQuirk(shooter, 'ricochet') && rng() < C.CONST.RICOCHET_P) {
        const others = E.units.filter(f => f !== target && (f.state === 'ok' || f.state === 'light') && bandOf(dist(shooter, f)) === band);
        if (others.length) { const f = others[Math.floor(rng() * others.length)];
          tel.ricochets = (tel.ricochets || 0) + 1;
          if (log) log.push({ t: tel.turn, type: 'ricochet', by: shooter.id, at: f.id, w: (shooter.weapon || {}).name });
          applyHit(rng, f, C.resolveSeverity(rng, shooter, f, S.policy, band, null, tel.turn), tel, log, shooter, E); }
      }
    }
    /* §GUNS `area` — "resolves against up to 3 enemies in band": the blast is resolved against up to two more in the
       same band near the mark, each on its own chance (it only chipped cover before) */
    if (C.hasQuirk(shooter, 'area')) {
      /* §STUN an area stun weapon catches everyone about the mark, each on his own chance; a blast catches two */
      const stunArea = stunOf(shooter) > 0;
      const near = E.units.filter(f => f !== target && (f.state === 'ok' || f.state === 'light') && (stunArea || bandOf(dist(shooter, f)) === band) && dist(f, target) <= (stunArea ? CONST.STUN_AREA_RADIUS : CONST.AREA_RADIUS))
        .sort((a, b) => dist(a, target) - dist(b, target)).slice(0, stunArea ? 99 : 2);
      for (const f of near) {
        const pf = C.hitChance(shooter, f, band, { side: shooter._side, night: !!_night, dist: dist(shooter, f) }, false) * CONST.SHOT_HIT_MULT;
        if (rng() >= pf) continue;
        tel.areaHits = (tel.areaHits || 0) + 1;
        if (log) log.push({ t: tel.turn, type: 'blast', by: shooter.id, at: f.id, w: (shooter.weapon || {}).name });
        applyHit(rng, f, C.resolveSeverity(rng, shooter, f, S.policy, band, null, tel.turn), tel, log, shooter, E);
      }
    }
    /* ---- AND NOW THEY KNOW WHERE YOU ARE -------------------------------------------------
       `silent` reads "first shot does not break unspotted status" and that sentence has been
       sitting in the catalogue waiting for a spotting model to exist. It was given a different
       job in the meantime — how far a firefight carries across the world map — and that job is
       real and stays. This is the second one, and it is the written one.
       Called once per aimed action rather than once per round: a burst is one decision to
       fire, and charging a man his concealment three times for one trigger pull would make the
       quirk depend on rate of fire, which is not what it says. */
    if (fogOn) {
      if (revealByFiring(shooter, tel.turn)) tel.reveals++;
      else tel.silentShots++;
      if (S._fog) S._fog.dirty = true;
    }
    target.cover = saveCover; target.flanked = saveFlank;
    target.spotted = saveSpotted; shooter._unseen = saveUnseen;
    return hit;
  }

  /**
   * MORALE. The resolver had none: every fight ran to the clock, which is why casualties
   * scaled with MAX_TURNS and why the abstract model's numbers looked unreachable without a
   * fudge. Fights end when somebody breaks, not when time runs out.
   * Composure deltas, bands and the rout fraction are all COMBAT.md's.
   */
  /**
   * Composure, and the rare individual break. Losing your nerve completely is not the normal
   * way a fight ends — an ordered fallback is (§ withdrawal below). A fighter only bolts when
   * their composure is gone AND their resolve fails them, so steady people almost never do it.
   */
  /** §5.1 — put somebody's head down. On a grid this is not mainly an aim penalty: a pinned
      fighter will not leave cover, which is what makes a suppressive weapon buy ground for
      somebody else instead of killing people itself. */
  /** Everyone who is not this side, as one notional enemy: nearest live body wins. */
  function pickEnemy(sides, si, u) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < sides.length; i++) {
      if (i === si) continue;
      for (const f of sides[i].units) {
        if (f.state !== 'ok' && f.state !== 'light') continue;
        const d = dist(u, f);
        if (d < bestD) { bestD = d; best = sides[i]; }
      }
    }
    return best;
  }

  /** the band the fight mostly happened at, for the day loop's audit counters */
  function bandName(tel) {
    return ['long', 'medium', 'short'][tel.endBand == null ? 1 : tel.endBand];
  }

  /** The distance, in tiles, at which this fighter's weapon is doing what it is for. */
  function wantTiles(c) {
    /* A BODY WITH NOTHING TO FIGHT WITH WANTS TO BE ELSEWHERE. `UNARMED` is a real weapon
       profile — power 0, range MEDIUM — so a fighter carrying nothing inherited a medium
       preferred range and the band pull walked it TOWARD a squad shooting at it, to reach a
       firing distance for its fists. Closing a range gap you have no weapon to close is not a
       thing anybody does. Ruled: a body that cannot hurt anyone wants maximum distance, and the
       same pull that walked it in now walks it out. */
    if (!canHurt(c)) return CONST.BAND_TILE[0] + 8;
    /* §AI the distance a fighter wants is his own gun's, not his gun's band's: a short gun inside its reach, a long gun
       between its `near` and its reach, a middling one at three-quarters of its reach */
    const w = c.weapon || {}, r = w.range || 'medium';
    if (w.reach != null) {
      if (r === 'short') return Math.max(1, w.reach - 1);
      if (r === 'long') return Math.round(((w.near || CONST.BAND_TILE[1]) + w.reach) / 2);
      return Math.max(2, Math.round(w.reach * 0.75));
    }
    if (r === 'long') return CONST.BAND_TILE[0] + 2;
    if (r === 'short') return Math.max(1, Math.round(CONST.BAND_TILE[1] * 0.5));
    return Math.round((CONST.BAND_TILE[0] + CONST.BAND_TILE[1]) / 2);
  }

  /* §SUPPRESSION (ruled) SUPPRESSING FIRE IS AN ACTION EVERY GUN HAS, and the support guns are built for it. A fighter
     lays fire on a LANE — the mark's tile and, for a gun that can hold an arc, the ground around it — which stands until
     the layer's own next turn; a support gun's lane is an arc out to its reach. Everybody of the other side inside it is pinned: his aim suffers by the gun's weight, he
     will not watch, and he will not willingly stand up. The rounds are real (ruled: the threat of being hit is what pins
     a man): laying the lane rolls a light hit at each body in it, and a man who gets up and leaves it draws a burst. */
  function laneOf(u) {
    const sup = C.suppressOf(u);
    /* `suppression_output_up` / `_down_slight` widen and narrow the lane; they are read here and nowhere else */
    let t = 0;
    if (u.hooks && u.hooks.has('suppression_output_up'))   t += CONST.SUPPRESS_OUT_UP;
    if (u.hooks && u.hooks.has('suppression_output_down_slight')) t -= CONST.SUPPRESS_OUT_DOWN;
    if (sup < 1) return { r: Math.max(0, CONST.LANE_RADIUS + t), pen: CONST.LANE_PEN, arc: null };
    const deg = CONST.LANE_ARC + (sup >= 2 ? CONST.LANE_ARC_2 : 0) + t * CONST.LANE_ARC_TRAIT;
    return { r: 0, pen: CONST.LANE_PEN_SUPPORT, arc: Math.max(1, deg) * Math.PI / 180 };
  }
  const lanesOf = tel => tel._lanes || (Object.defineProperty(tel, '_lanes', { value: [], enumerable: false }), tel._lanes);
  /* a support gun's lane is an ARC: everything in its reach within a few degrees either side of the line to the mark */
  const inLane = (L, f) => {
    if (L.arc == null) return Math.hypot(f.x - L.x, f.y - L.y) <= L.r + 0.01;
    const dx = f.x - L.ox, dy = f.y - L.oy, d = Math.hypot(dx, dy);
    if (d < 0.5 || d > L.reach) return false;
    let a = Math.abs(Math.atan2(dy, dx) - L.ang); if (a > Math.PI) a = 2 * Math.PI - a;
    return a <= L.arc;
  };
  const upright = f => f.state === 'ok' || f.state === 'light';
  /* who is pinned is read off the lanes standing, whenever one is laid or lifted */
  function refreshPins(tel, sides) {
    const lanes = lanesOf(tel);
    for (let i = lanes.length - 1; i >= 0; i--) if (!upright(lanes[i].by)) lanes.splice(i, 1);
    for (const S of sides) for (const u of S.units) {
      let pen = 0;
      for (const L of lanes) if (L.by.side !== u.side && upright(u) && inLane(L, u) && !L.refused.has(u.id)) pen = Math.max(pen, L.pen);
      u.suppressed = pen > 0; u._supPen = pen;
    }
  }
  /* a man the lane catches: Smothering Fire may refuse it, and being pinned shakes him */
  function pin(u, L, tel, rng) {
    if (!upright(u) || L.refused.has(u.id)) return;
    /* `suppression_bonus` — Smothering Fire: hosed before, he knows fire at him from fire at where he might be */
    if (rng && u.hooks && u.hooks.has('suppression_bonus') && rng() < CONST.SUPPRESS_RESIST_P) {
      L.refused.add(u.id); tel.pinsRefused = (tel.pinsRefused || 0) + 1; return;
    }
    if (!u.suppressed) comp(rng, u, C.CONST.COMP.suppressed);
    tel.pins = (tel.pins || 0) + 1;
  }
  /* the light end of a burst: the lane's rounds carry part of the gun's power, so most of what lands is a graze */
  function laneHit(rng, by, f, mult, power, map, S, E, tel, log) {
    if (!hasLOS(map, by, f)) return;
    const band = bandOf(dist(by, f));
    const p = C.hitChance(by, f, band, { side: by._side, dist: dist(by, f), night: !!_night }, false) * CONST.SHOT_HIT_MULT * mult;
    if (rng() >= p) return;
    const round = power < 1 ? Object.assign({}, by, { weapon: Object.assign({}, by.weapon, { power: (by.weapon.power || 0) * power }) }) : by;
    tel.laneHits = (tel.laneHits || 0) + 1;
    if (log) log.push({ t: tel.turn, type: 'lane_hit', by: by.id, at: f.id, w: (by.weapon || {}).name });
    applyHit(rng, f, C.resolveSeverity(rng, round, f, S.policy, band, null, tel.turn), tel, log, by, E);
  }
  function laneAt(u, mark) {
    const lo = laneOf(u), L = { by: u, side: u.side, x: mark.x, y: mark.y, r: lo.r, pen: lo.pen, refused: new Set(), left: new Set() };
    if (lo.arc != null) { L.arc = lo.arc; L.ox = u.x; L.oy = u.y; L.ang = Math.atan2(mark.y - u.y, mark.x - u.x); L.reach = Math.max(dist(u, mark), (u.weapon && u.weapon.reach) || 0); }
    return L;
  }
  function layLane(rng, u, mark, sides, map, S, E, tel, log) {
    const L = laneAt(u, mark);
    const lanes = lanesOf(tel);
    for (let i = lanes.length - 1; i >= 0; i--) if (lanes[i].by === u) lanes.splice(i, 1);
    lanes.push(L);
    const caught = E.units.filter(f => upright(f) && inLane(L, f));
    for (const f of caught) pin(f, L, tel, rng);
    refreshPins(tel, sides);
    for (const f of caught) laneHit(rng, u, f, CONST.LANE_HIT_MULT, CONST.LANE_POWER_MULT, map, S, E, tel, log);
    tel.coveringFire = (tel.coveringFire || 0) + 1;
    tel.laneCaught = (tel.laneCaught || 0) + caught.length;
    if (log) log.push({ t: tel.turn, type: 'covering', by: u.id, at: mark.id, n: caught.length, r: L.r, w: (u.weapon || {}).name, ammo: u.ammo });
  }
  /* a man who gets up out of a lane draws a burst from whoever laid it, once */
  function leaveLanes(rng, mover, from, sides, map, tel, log) {
    for (const L of lanesOf(tel).slice()) {
      if (L.by.side === mover.side || !upright(L.by) || L.left.has(mover.id) || !inLane(L, from)) continue;
      L.left.add(mover.id); tel.laneReacts = (tel.laneReacts || 0) + 1;
      const S = sides[L.by.side], E = sides[mover.side];
      if (S && E) laneHit(rng, L.by, mover, CONST.LANE_REACT_MULT, 1, map, S, E, tel, log);
      if (!upright(mover)) return;
    }
  }

  function comp(rng, u, delta) {
    /* §QUIRKS WHAT A NERVE IS WORTH. Half the catalogue's hooks were read by nothing at all —
       a fighter carried "nothing shakes him" and nothing in the engine knew. These are the
       composure ones, doing what their names always said. */
    if (delta < 0 && u.hooks) {
      /* §QUIRKS the ones who do not mind what they are looking at */
      if (u._fromDeath && (u.hooks.has('death_morale_immune') || u.hooks.has('gore_morale_immune'))) delta = 0;
      if (u.hooks.has('cohesion_morale_bonus_near_squadmates') && u._nearMates) delta *= 0.7;
      /* §QUIRKS a fighter who is steadier the closer it gets: short_band_composure_bonus was
         carried and never asked for */
      if (u.hooks.has('short_band_composure_bonus') && u._closeBand) delta *= 0.65;
      if (u.hooks.has('morale_swings_damped')) delta *= 0.6;
      if (u.hooks.has('morale_swings_amplified')) delta *= 1.45;
      if (u.hooks.has('wounded_composure_bonus') && (u.state === 'light' || (u.hp != null && u.maxHp && u.hp < u.maxHp * 0.6))) delta *= 0.55;
      if (u.hooks.has('composure_up_as_intensity_rises') && u.comp < C.CONST.COMP_BANDS.rattled + 15) delta *= 0.5;
    }
    u.comp = Math.max(0, Math.min(100, (u.comp || 60) + delta));
    pairComp(u);
    /* Composure bottoms out around 7 in a hard fight and only touches 0 in the worst of
       them, so gating panic on exactly zero made it a dead mechanism rather than a rare one.
       It is checked from the `rattled` band down, and resolve still decides it. */
    if (u.comp <= C.CONST.COMP_BANDS.rattled && u.state !== 'panicked' && rng) {
      /* a fighter who does not rout, does not rout */
      if (u.hooks && u.hooks.has('rout_immune')) return;
      const res = (u.stats && u.stats.resolve) || 100;
      /* how far past rattled they are, times how badly their resolve is failing them */
      const depth = (C.CONST.COMP_BANDS.rattled - u.comp) / C.CONST.COMP_BANDS.rattled;
      const p = Math.max(CONST.PANIC_FLOOR, 1 - res / CONST.PANIC_RESOLVE_DIV) * depth * 0.5;
      if (rng() < p) {
        u.state = 'panicked';
        /* §MON-WA one mind breaks in both bodies */
        if (u.pair) for (const h of u.pair.halves) if (h !== u && (h.state === 'ok' || h.state === 'light')) h.state = 'panicked';
      }
    }
  }
  /* §MON-WA (ruled) ONE COMPOSURE POOL. Two bodies, one mind: whatever moves one half's nerve moves the pair's, and the
     value is kept on both bodies so every reader sees the same number. (It was averaged once at the start and then
     let drift apart, so a pair could be calm in one body and broken in the other.) */
  function pairComp(u) {
    if (!u.pair) return;
    u.pair.comp = u.comp;
    for (const h of u.pair.halves) if (h !== u && h.state !== 'dead') h.comp = u.comp;
  }
  function moraleShock(rng, side, unit, kind) {
    const K = C.CONST.COMP;
    const minds = new Set();   /* §MON-WA a pair hears a loss once: one mind, not two */
    for (const m of side.units) {
      if (m === unit || (m.state !== 'ok' && m.state !== 'light')) continue;
      if (m.pair) { if (minds.has(m.pair) || m.pair.halves.indexOf(unit) >= 0) continue; minds.add(m.pair); }
      /* §QUIRKS the mark the composure hooks read: this loss is a body going down, and these
         are the mates standing near enough to draw comfort from each other */
      m._fromDeath = true;
      m._nearMates = side.units.some(o => o !== m && (o.state === 'ok' || o.state === 'light') &&
                                     Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)) <= CONST.AURA_TILES);
      comp(rng, m, kind === 'dead' ? K.mateDown : K.mateDown * 0.6);
      if (unit.isCaptain) comp(rng, m, K.captainDown);
      m._fromDeath = false;
    }
  }
  /* §QUIRKS WHO WANTS OUT EARLY, AND WHO WILL NOT ARGUE. `early_disengage_bias` and
     `follows_bad_orders` were carried by people and read by nothing: a squad with a body who
     wants out calls it sooner, and one full of people who do as they are told holds a bad
     order longer than it should. */
  function withdrawShift(S) {
    let shift = 0;
    for (const u of S.units) {
      if (!u.hooks || (u.state !== 'ok' && u.state !== 'light')) continue;
      if (u.hooks.has('early_disengage_bias')) shift += CONST.EARLY_OUT;
      if (u.hooks.has('follows_bad_orders')) shift -= CONST.OBEDIENT;
    }
    return shift;
  }
  /**
   * The captain calls it. Past a threshold of loss the squad is ordered back — and an ordered
   * fallback is not a rout: they go by bounds, half the squad moving while the other half
   * keeps firing to cover them, and they leave the field rather than milling at the edge.
   */
  function checkWithdraw(S) {
    if (S.noWithdraw) return false;          /* The Eight: nobody calls it */
    if (S.withdrawing) return true;
    /* §WOUNDS (ruled: the call reads health, not heads) what the squad has lost is the health it came in with that is no
       longer on its feet: the dead, the down and the gone count for all of theirs, the hurt for what they have lost. And
       a squad that came in hurt has less to give: it calls it sooner by as much. */
    let came = 0, left = 0, full = 0;
    for (const u of S.units) { const max = u.hpMax || 1, start = u._hpStart != null ? u._hpStart : max;
      full += max; came += start; if (u.state === 'ok' || u.state === 'light') left += Math.max(0, Math.min(start, u.hp != null ? u.hp : start) - stunSpent(u)); }
    /* §STUN (ruled) a man's stacks are health spent to the call, a tenth of his whole pool each, as wounds are */
    const lost = came > 0 ? 1 - left / came : 1;
    /* §QUIRKS a squad with a body who wants out calls it sooner; one that does as it is told
       holds a bad order longer */
    /* §STANCE the side's own threshold, set by its squads' stance (divide.js); the grid's default otherwise */
    const at = (S.withdrawAt != null ? S.withdrawAt : CONST.WITHDRAW_AT) * (full > 0 ? came / full : 1);
    if (lost >= at - withdrawShift(S)) { S.withdrawing = true; return true; }
    /* §ROUNDS a squad with nothing left to shoot with goes: rounds carry now, and two dry remnants stood off till the
       clock (5% of the Divide's fights ran the full 27 turns, a hit in seven turns, three in four of them at night) */
    const up = S.units.filter(u => u.state === 'ok' || u.state === 'light');
    if (up.length && !up.some(canHurt)) { S.withdrawing = true; return true; }
    return false;
  }
  /* §RETREAT (ruled) A RETREAT ENDS WHEN CONTACT IS BROKEN, not at the map's edge: a retreating body is off the field
     once no enemy that can see him can also reach him — out of their sight, or out past their guns. Walking the whole
     board backwards under fire turned every retreat into the fight's killing ground. */
  function contactBroken(u, S, sides, map, fog) {
    for (const O of sides) {
      if (O === S) continue;
      const eyes = alive(O.units);
      const seen = fog ? !!(O._seen && O._seen.has(u.id)) : eyes.some(f => dist(f, u) <= sightRange(f) && hasLOS(map, f, u));
      if (!seen) continue;
      if (eyes.some(f => dist(f, u) <= ((f.weapon && f.weapon.reach) || 12) + CONST.BREAK_MARGIN && hasLOS(map, f, u))) return false;
    }
    return true;
  }
  /* §RETREAT (fixed) A SIDE FALLS BACK THE WAY IT CAME. It fell back to the map's left edge (side 0) or right edge
     (every other side) whatever edge it had come on at — and in the Divide every side comes on at its own bearing, so a
     side on the right edge with index 0 retreated across the field through the people it was retreating from. Each man
     now makes for the point on the perimeter he came in at (his squad's bearing, or his side's). */
  function homePoint(u, si, map, bearings) {
    const b = u._bearing != null ? u._bearing : (bearings && bearings[si] != null ? bearings[si] : (si === 0 ? Math.PI : 0));
    const cx = (map.w - 1) / 2, cy = (map.h - 1) / 2;
    return { x: cx + Math.cos(b) * cx, y: cy + Math.sin(b) * cy };
  }
  function stepHome(u, home, sides, map, steps) {
    let moved = 0;
    for (let s = 0; s < steps; s++) {
      const occ = occupancy(sides), here = Math.hypot(u.x - home.x, u.y - home.y);
      let best = null, bd = here;
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = u.x + ox, ny = u.y + oy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || blocked(map, nx, ny) || !freeTile(occ, u, nx, ny)) continue;
        const d = Math.hypot(nx - home.x, ny - home.y);
        if (d < bd - 1e-9) { bd = d; best = [nx, ny]; }
      }
      if (!best) break;
      u.x = best[0]; u.y = best[1]; moved++;
    }
    return moved;
  }
  /* off the field at the edge he came in by: on the border, on his own side of the map */
  function atHome(u, home, map) {
    const E = CONST.EXIT_COLS, onEdge = u.x <= E || u.y <= E || u.x >= map.w - 1 - E || u.y >= map.h - 1 - E;
    return onEdge && Math.hypot(u.x - home.x, u.y - home.y) <= Math.min(map.w, map.h) / 2;
  }
  const stillFighting = (S) => S.units.filter(u => u.state === 'ok' || u.state === 'light').length;
  /** Nobody left on the field: dead, down, panicked away or withdrawn off the edge. */
  function finished(S) { return stillFighting(S) === 0; }

  /** Canon severity bands, canon injury table; only the bookkeeping is local. */
  /* §STUN the stacks a hit from this body lands: a stun primary's, never a sidearm's */
  function stunOf(by) { const w = by && by.weapon; return w && !by.onSidearm && (w.stun || 0) > 0 && C.hasQuirk(by, 'nonlethal') ? w.stun : 0; }
  function stunSpent(u) { const max = u.hpMax || C.hpFor(u.ref || u); return (u._stun || 0) * max / CONST.STUN_AT; }
  function stunnedOut(u) { const max = u.hpMax || C.hpFor(u.ref || u), hp = u.hp != null ? u.hp : max; return stunSpent(u) >= hp - 1e-9; }
  function landStun(rng, t, n, tel, log, by, side) {
    /* §STUN armour's stun grade: each grade takes a share of the stacks off every hit (riot gear is made for it; metal
       and foil carry it) — what is left over stands as part of a stack */
    const grade = (t.armor && t.armor.resist && t.armor.resist.stun) || 0;
    n = Math.max(0, n * (1 - CONST.STUN_RESIST_STEP * grade));
    t._stun = (t._stun || 0) + n;
    tel.stunStacks = (tel.stunStacks || 0) + n;
    /* §STUN (ruled) a stack is a tenth of a man's whole pool, and stacks and wounds add up: he goes down when what he has
       taken of both reaches it — a man shot to half goes down at five */
    if (!stunnedOut(t)) {
      comp(rng, t, C.CONST.COMP.graze);
      if (log) log.push({ t: tel.turn, type: 'stun', by: by.id, at: t.id, n: Math.round(n * 10) / 10, stacks: Math.round(t._stun * 10) / 10, of: CONST.STUN_AT, w: (by.weapon || {}).name, react: !!by._reacting });
      return;
    }
    t.state = 'down'; t._stunnedDown = true; t._killedBy = by;
    tel.down++; tel.stunned = (tel.stunned || 0) + 1;
    pairFalls(rng, t, side, tel, log);
    if (side) moraleShock(rng, side, t, 'down');
    if (log) log.push({ t: tel.turn, type: 'stunned', by: by.id, at: t.id, n: n, w: (by.weapon || {}).name, react: !!by._reacting });
  }
  function applyHit(rng, t, sev, tel, log, by, side) {
    const K = C.CONST.COMP;
    /* THE WOUND POOL DECIDES. It was built alongside the bands first and proved bit-identical
       while inert, which is how we know it is charged from the right roll and draws no random
       number of its own.
       The five bands are not gone: they still describe WHAT the round did, and `rollInjury`
       still reads them, so a critical leaves a worse wound than a light one. What they no
       longer do is decide whether somebody is still standing. That is the pool, and it is the
       whole difference — a serious hit used to remove a body outright and now takes about two,
       which is the middle a firefight did not have.
       The four states underneath are untouched on purpose: `ok`, `light`, `down` and `dead` are
       read in twenty-one places across three modules, and nothing downstream of the grid needs
       to know the model changed. */
    if (t.hp == null) t.hp = C.hpFor(t.ref || t);
    /* §STUN a stun round lands its stacks and does no harm */
    const stacks = stunOf(by);
    if (stacks > 0) { landStun(rng, t, stacks, tel, log, by, side); return; }
    /* §ARMOUR (fixed) A GRAZE THE ARMOUR TOOK IS NOTHING. Every hit cost at least a point of the pool and nearly half cost
       exactly one, so a light vest could not lower them and the armour most of the field wore did nothing at all: a
       round that met armour and only grazed is stopped by it */
    if (sev === 'graze' && (t._effProt || 0) > 0) {
      tel.absorbed = (tel.absorbed || 0) + 1;
      comp(rng, t, C.CONST.COMP.nearMiss);
      if (log) log.push({ t: tel.turn, type: 'absorbed', by: by.id, at: t.id, w: (by.weapon||{}).name, ammo: by.ammo, react: !!by._reacting });
      return;
    }
    let dmg = t._sevRoll != null ? C.damageOf(t._sevRoll) : C.CONST.DMG_MIN;
    /* §RACES LEATHERY, GRANITE-COLOURED FLESH. An Olmac's toughness was in the lore and in a
       grit lean and in nothing that took a round: what would drop a body takes more of them
       to drop this one. It is soak, not evasion — they are hit as often as anybody. */
    if (t.race === 'olmac') dmg = Math.max(C.CONST.DMG_MIN, dmg * CONST.OLMAC_SOAK);
    /* §RACES and a gnoll in the frenzy hits like one */
    if (by && by._frenzy > 0) dmg *= C.CONST.ATTORAK_FRENZY_DMG;
    /* §GUNS (ruled) A HEAVY ROUND HITS HARDER THAN A LIGHT ONE. Power reached damage only through the severity roll, at
       three-quarters of a point a power — a power-3 round averaged 3.6 a hit and a power-9 round 4.1 — so a rifle's round
       did a pellet's harm and rate of fire decided everything. What a round does scales with its gun's power. (A light
       round grazes more often, too, and a graze that meets armour is stopped: armour's answer to many small hits.) */
    if (by && by.weapon) dmg *= Math.max(C.CONST.POWER_FLOOR, (by.weapon.power || 0) / C.CONST.POWER_REF);   /* a sidearm's own power, when drawn */
    /* (a stun gun is a poor gun — ruled — by its own low power now, which the round's harm follows; the separate halving
       it carried before power counted would leave a captive-taker's build nothing to take with) */
    /* THE ROUND LANDS. An edit that added the two lines above deleted this one, so damage was
       computed and never applied: four hundred and thirty-eight fights in a whole contest with
       nobody wounded, and every fight ran out its clock because nobody could fall. */
    t.hp -= dmg;
    tel.damage = (tel.damage || 0) + dmg;
    if (t.hp > 0) {
      /* still up. A body that has taken real punishment is `light` — hurt and still fighting —
         and everything above that is a graze in all but name. */
      const hurt = t.hp <= (t.hpMax || C.hpFor(t.ref || t)) * 0.6;
      if (hurt && t.state === 'ok') { t.state = 'light'; tel.light++; }
      else tel.grazes++;
      comp(rng, t, hurt ? K.light : K.graze);
      if (log) log.push({ t: tel.turn, type: hurt ? 'light' : 'graze', by: by.id, at: t.id,
                          dmg: dmg, hp: t.hp, react: !!by._reacting,
                          w: (by.weapon||{}).name, ammo: by.ammo });
      return;
    }
    /* §WOUNDS (ruled) THE POOL IS OUT. A real gun that empties it has killed them: a bloodsport has no "down" for a live
       round. (A stun round never reaches here: it lands stacks — §STUN.) */
    /* §CONSUMABLES (ruled) A STASIS INJECTOR: the round that would have killed its carrier leaves him down at a breath,
       out of the fight and up when it is over at the lowest band — taken, if his side loses the field */
    if (t.carried && t.carried.indexOf('itm_stasis_injector') >= 0) {
      t.carried.splice(t.carried.indexOf('itm_stasis_injector'), 1);
      t.hp = 1; t.state = 'down'; t._upAfter = true; t._killedBy = by; t._downSev = sev;
      tel.down++; tel.consumables = (tel.consumables || 0) + 1; tel.stasis = (tel.stasis || 0) + 1;
      pairFalls(rng, t, side, tel, log);
      if (side) moraleShock(rng, side, t, 'down');
      if (log) log.push({ t: tel.turn, type: 'down', by: by.id, at: t.id, sev, dmg: dmg, stasis: true,
                          react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo });
      return;
    }
    t.state = 'dead'; tel.dead++; t._killedBy = by;
    (tel._deathsThisTurn = tel._deathsThisTurn || []).push({ x: t.x, y: t.y });
    if (side) moraleShock(rng, side, t, 'dead');
    if (log) log.push({ t: tel.turn, type: 'killed', by: by.id, at: t.id, dmg: dmg,
                        react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo });
    /* what a death sets off — a Mon-Wa half's bond, a showman's fame — ran only for the old down-then-died path, so
       once a live round killed outright neither ever fired */
    const b = C.onDeath(rng, t, side, log || [], tel);
    /* §MON-WA (ruled: separate pools, shared fall) the other body's roll lands now: dead is a death on this field like
       any other; braindead or traumatized is a body out of the fight for good */
    if (b) {
      if (b.fate === 'dead') { tel.dead++; tel._deathsThisTurn.push({ x: b.other.x, y: b.other.y }); if (side) moraleShock(rng, side, b.other, 'dead'); }
      else { tel.down++; if (side) moraleShock(rng, side, b.other, 'down'); }
    }
  }
  /* §MON-WA (ruled: separate pools, shared fall) A BODY OF A PAIR THAT GOES DOWN TAKES THE OTHER DOWN WITH IT. Each body
     keeps its own pool; when one is emptied — stunned out, or held at a breath by an injector — the being is out of the
     fight in both. The other is up when it is over with the health it had, and is taken if the one beside it is. */
  function pairFalls(rng, t, side, tel, log) {
    if (!t.pair) return;
    for (const h of t.pair.halves) {
      if (h === t || (h.state !== 'ok' && h.state !== 'light' && h.state !== 'panicked')) continue;
      h.state = 'down'; h._sharedDown = true; h.bleed = null;
      tel.down++; tel.pairFalls = (tel.pairFalls || 0) + 1;
      if (log) log.push({ t: tel.turn, type: 'pair_down', by: h.id, at: t.id });
    }
  }

  /* Removed at this step: stepToward — defined here and called from nowhere in the tree.
     They are the last of the abstract band resolver cut at Step 8.9, plus one movement
     helper in `tactical.js` whose docstring described behaviour the live scorer does by
     an entirely different method a thousand lines away. A change was made to that dead
     one, measured at no effect, and the no-effect was read as the mechanism not
     mattering rather than as the code not running. `audit_cross` looks for uncalled
     functions now, so the next one is caught before somebody edits it. */


  /**
   * One firefight. `A` and `B` are squad objects shaped exactly like the ones the abstract
   * resolver takes: { corpId, policy, units, hasMedkit, fidelity }.
   */
  /**
   * `resolve(rng, A, B, ctx)` or `resolve(rng, [S0, S1, S2...], ctx)`.
   *
   * The day loop fights three-cornered engagements — measured at 5.8% of all firefights — and
   * this resolver was written for exactly two sides. Keeping the abstract model around to
   * handle the other 5.8% would be two engagement models again, which is the fault this whole
   * step exists to correct, so it takes N sides: `E` becomes "everyone who is not us", chosen
   * by who is closest and most dangerous rather than by being the other array.
   */
  /* §DEPLOY THE BOARD IS TURNED TO THE FIGHT. Bearings are compass directions off the world map and the board is
     wider than it is deep, so two squads meeting north and south were set down across its short side and a long
     opening could not be laid out at all. The whole compass is turned so the first two sides' line of approach runs
     along the long side; every angle between squads is kept, which is all the ground ever reads. */
  function turnBoard(sides, ctx) {
    const b = ctx.bearings;
    if (!b || b[0] == null || b[1] == null || !(sides.length > 2 || ctx.forceBearings)) return ctx;
    const ax = Math.atan2(Math.sin(b[0]) - Math.sin(b[1]), Math.cos(b[0]) - Math.cos(b[1]));
    const rot = Math.PI - ax;
    if (Math.abs(rot) < 1e-9) return ctx;
    const turn = a => a == null ? a : Math.atan2(Math.sin(a + rot), Math.cos(a + rot));
    const done = new Set(), turnU = u => { if (u._bearing != null && !done.has(u)) { u._bearing = turn(u._bearing); done.add(u); } };
    for (const S of sides) for (const u of S.units || []) turnU(u);
    const reinforce = (ctx.reinforce || []).map(R => {
      for (const u of (R.side && R.side.units) || []) turnU(u);
      return Object.assign({}, R, { bearing: turn(R.bearing) });
    });
    return Object.assign({}, ctx, { bearings: b.map(turn), reinforce: ctx.reinforce ? reinforce : ctx.reinforce });
  }

  function resolve(rng, A, B, ctx) {
    let sides;
    if (Array.isArray(A)) { sides = A.slice(); ctx = B; }
    else { sides = [A, B]; }
    ctx = ctx || {};
    ctx = turnBoard(sides, ctx);
    /* §QUIRKS the band this fight is being fought at, so the ones who like it close can say so */
    const closeFight = ctx.openingBand === 2;   /* bands run 0 long, 1 medium, 2 short (it read `|| 1 === 0`: never) */
    /* §RACES THE GIL'S PSIONS. Three expressions were in the data, in the roster's talk lines
       and in nothing that fought: `squadLink` was read in the aim path and set by NOBODY. A
       latent Gil standing with a squad is worth something to everyone in it — the link steadies
       their shooting, battle sense means the side is never caught unready, and a pressure
       reader knows when the other side is close to breaking. */
    for (const S of sides) {
      S._psi = { link: false, sense: false };
      for (const u of S.units) {
        u._side = S;                              /* a body knows whose side it is on */
        u._closeBand = closeFight;
        if (!u.hooks) continue;
        /* THE HOOKS THE TRAITS ACTUALLY GRANT. The first cut read `psion_squad_link` and its
           siblings as hook names — those are TRAIT ids, and no trait grants a hook so called,
           so the resolver was listening for words nobody says. The suite's ghost-hook check
           caught it, which is what it is for. A link is `squad_coordination_bonus`; battle
           sense grants `evasion_surge` and the broadcast; the pressure reader's own hooks are
           manager-facing, so the fight reads its broadcast instead. */
        if (u.hooks.has('squad_coordination_bonus')) S._psi.link = true;
        /* §LIGHT the night-ambush warning is a NIGHT sense: it worked day and night alike */
        if (u.hooks.has('ambush_avoidance_slight') || (ctx.night && u.hooks.has('night_ambush_warning_bonus'))) S._psi.sense = true;
      }
    }
    /* §FLANK the approaches of every squad on the field: units carry `_bearing` (the squad they came in with); a side
       without one comes on at its side bearing. Any side whose squads came in far enough apart makes this a flanked
       fight. */
    const angGap = (a, b) => { let g = Math.abs(a - b) % (Math.PI * 2); return g > Math.PI ? Math.PI * 2 - g : g; };
    const approaches = sides.map((S, i) => {
      const bs = [];
      for (const u of S.units) if (u._bearing != null && !bs.some(b => angGap(b, u._bearing) < 1e-6)) bs.push(u._bearing);
      return bs;
    });
    /* somebody due to walk in on a side already here is one more approach for that side: the board has to be big
       enough for where they will come from, because it cannot grow once the fight has started */
    for (const R of (ctx.reinforce || [])) {
      const si = sides.findIndex(S => S.tag === (R.side && R.side.tag));
      if (si >= 0 && R.bearing != null && !approaches[si].some(b => angGap(b, R.bearing) < 1e-6)) {
        if (!approaches[si].length) approaches[si].push(ctx.bearings && ctx.bearings[si] != null ? ctx.bearings[si] : (si === 0 ? Math.PI : 0));
        approaches[si].push(R.bearing);
      }
    }
    const flankFight = approaches.some(bs => bs.some((b, k) => bs.some((c, l) => l > k && angGap(b, c) >= CONST.FLANK_SPLIT_ARC)));
    const board0 = boardFor(ctx.openingBand == null ? 1 : ctx.openingBand);
    const board = flankFight ? { w: Math.max(board0.w, CONST.FLANK_BOARD_W), h: Math.max(board0.h, CONST.FLANK_BOARD_H) } : board0;
    const map = ctx.map || makeMap(rng, ctx.terrain || 'broken_ground', board.w, board.h);
    A = sides[0]; B = sides[1];
    const prep = ctx.prep || sides.map(() => 0.5);   /* how ready each side was for this */
    /* Being ready has to mean something that LASTS. Starting behind cover does not: everyone
       repositions on turn one and the advantage is gone by turn two — measured at 0.9 against
       0.1 producing no edge at all. What readiness actually buys is the first move and the
       first shot: you were watching this ground, they walked onto it. */
    /* Who was watching whom. On a TIE this read `prep[0] >= prep[1]`, so side zero took the
       first move and the first shot every time two squads were equally ready — a structural
       advantage to whichever side the caller happened to list first, which is not a property
       of anything in the fiction. Measured at 0.31 casualties a fight between identical
       squads, which is larger than most of the weapon differences being tuned against it.
       Ties are a coin flip. */
    const first = prep[0] === prep[1] ? (rng() < 0.5 ? 0 : 1) : (prep[0] > prep[1] ? 0 : 1);
    const ambush = Math.abs(prep[0] - prep[1]) >= CONST.AMBUSH_GAP;
    const openingBand = ctx.openingBand == null ? 1 : ctx.openingBand;
    /* smoke on the ground, not on the people. Decays at the turn boundary. */
    const screens = [];
    _screens = screens;
    _night = !!ctx.night;
    const drones = [], turrets = [];
    _drones = drones; _turrets = turrets;
    /* what the replay draws besides the fighters: smoke, drones, turrets. Smoke had worked on the
       grid and never been drawn, because a frame recorded only the fighters. */
    const fxRec = () => ({
      sm: screens.map(z => ({ x: z.x, y: z.y })),
      dr: drones.map(z => ({ x: Math.round(z.x), y: Math.round(z.y), s: z.si })),
      tu: turrets.map(z => ({ x: z.x, y: z.y, s: z.si }))
    });
    const gap = deployGap(openingBand);
    /* ONE OCCUPANCY REGISTER FOR THE WHOLE FIGHT. It used to be per call, which was harmless
       with two sides deploying into opposite edges and is not once a third side arrives on a
       bearing that overlaps somebody — or once anybody walks in on turn nine onto ground that
       is already occupied. */
    const taken = new Set();
    const flanked = ctx.flanked || [];
    const bearings = ctx.bearings || null;
    sides.forEach((S, i) => {
      S.tag = S.tag || String.fromCharCode(65 + i);
      S.sIdx = i;          /* §SEARCH which edge this side came on, so a sweep knows which
                              ground to walk: without it both squads swept the same flank */
      /* BEARINGS ONLY WHEN THERE IS SOMETHING TO SAY. With two sides and no bearings supplied
         this is the original left/right deployment, unchanged, so the fixed-seed snapshots
         still describe the fight they were recorded from. */
      const useBearing = bearings && bearings[i] != null && (sides.length > 2 || ctx.forceBearings);
      if (flankFight) {
        /* every squad at its own edge, the way it walked in */
        const home = bearings && bearings[i] != null ? bearings[i] : (i === 0 ? Math.PI : 0);
        const byB = [];
        for (const u of S.units) {
          const b = u._bearing != null ? u._bearing : home;
          let g = byB.find(x => angGap(x.b, b) < 1e-6);
          if (!g) { g = { b: b, units: [] }; byB.push(g); }
          g.units.push(u);
        }
        for (const g of byB)
          deploy(rng, map, g.units, i, prep[i] == null ? 0.5 : prep[i], gap,
                 { taken: taken, bearing: g.b, flanked: !!flanked[i], reach: CONST.FLANK_DEPLOY_REACH });
        for (const u of S.units) u.side = i;
        return;
      }
      deploy(rng, map, S.units, i, prep[i] == null ? 0.5 : prep[i], gap,
             { taken: taken, bearing: useBearing ? bearings[i] : null, flanked: !!flanked[i] });
      /* §FLANK a side placed on a bearing was never told its own index (only the two-edge path set it), so in every
         fight of three banners or more `side` was undefined for everybody — which read as all on one side to the
         overwatch test, and no reaction shot was ever taken in one */
      for (const u of S.units) u.side = i;
    });
    const log = ctx.log === false ? null : [];
    /* who is still to walk in, and on which turn */
    const reinforce = (ctx.reinforce || []).slice().sort((a, b) => a.atTurn - b.atTurn);
    /* `downDeaths` and `stabilized` ARE INITIALISED HERE, and were not. `settleAftermath`
       raises them with `(tel.x || 0) + 1`, so an engagement where nobody died on the recovery
       roll left them `undefined` — and `divide.js` aggregates with `stats.downDeaths += t.x`,
       which turns the contest total into NaN on the first such engagement and keeps it there.
       Every reader's `|| 0` then reported a confident zero, so the recovery roll looked like a
       path that never fires. It fires constantly. This is the same fault the project has
       already recorded against three other counters, in the same words, on a fourth. */
    const tel = { turn: 0, shots: 0, hits: 0, grazes: 0, light: 0, down: 0, dead: 0,
                  downDeaths: 0, stabilized: 0,
                  moves: 0, overwatchShots: 0, flankShots: 0, dashes: 0,
                  dry: 0, sidearmDraws: 0, ammoLeft: 0, ambushed: 0, first: 0,
                  withdrawn: 0, fled: 0, coveringFire: 0,
                  /* `vents`, `chargeOut` and `energyShots` WERE MISSING FROM THIS OBJECT.
                     `persistCharge` does `tel.vents += u._vented`, so it ran as
                     `undefined + 327` and left NaN. Every reader in the tree writes
                     `telemetry.vents || 0`, and NaN is falsy — so a mechanism firing 327 times
                     across 40 fights reported a clean, plausible, entirely fictional zero, and
                     the suite check for it read "0 vents in 120 engagements" as though the
                     weapons were inert. A counter that is never initialised does not announce
                     itself; it launders itself through the first `|| 0` it meets. */
                  chargeOut: 0, energyShots: 0,
                  /* FOG COUNTERS, INITIALISED HERE AND NOT LATER. Every one of these is raised
                     with `+= 1` somewhere below, and this project has lost five counters to
                     `undefined += n` laundering itself through the first `|| 0` downstream into
                     a confident nought. A fog counter reading zero has to mean the branch did
                     not run, not that the counter was never a number. */
                  blindBodyTurns: 0,    /* acting with no idea where anybody is */
                  contactTurn: 0,       /* the turn the first side got eyes on anybody */
                  spotShots: 0,         /* fired at a body somebody had eyes on */
                  blindShots: 0,        /* fired at a muzzle flash — the halved-chance path */
                  unseenShots: 0,       /* fired before they knew where the shooter was */
                  squadSightShots: 0,   /* fired at a body the shooter could not personally see */
                  reveals: 0,           /* shots that gave the shooter's position away */
                  silentShots: 0,       /* shots that did not, because the weapon is quiet */
                  softBootsMoves: 0,    /* Soft Boots crossing ground unseen */
                  ambushInstinct: 0,    /* Ambush Instinct opening fire unseen */
                  endedBy: 'clock' };
    if (flankFight) tel.flankFight = true;
    /* FOG IS ON UNLESS THE CALLER TURNS IT OFF. `ctx.fog === false` exists so the same tree
       can be measured with it and without it — a before/after that compares two different
       trees is comparing two instruments, which is the failure this project keeps hitting. */
    const fog = ctx.fog !== false;
    /* MOTION EXPOSURE, on unless the caller turns it off — the same shape as the fog switch, so
       a before and after compares one tree against itself rather than two checkouts. */
    const motion = ctx.motion !== false;
    _motionOn = motion;
    if (fog) {
      const fogState = { sides, map, turn: 0, dirty: true };
      for (const S of sides) { S._fog = fogState; S._seen = new Set(); S._heard = new Set(); }
      /* NOBODY IS SPOTTED UNTIL SOMEBODY LOOKS. Deployment does not confer knowledge: the
         first spotting pass happens at the top of turn one, against the ground people actually
         deployed onto. At a short opening band that pass will see everybody and fog will have
         done nothing, which is correct — walking into somebody at nine metres is not stealth.
         At a long one it will not, and that is where this earns its place. */
      tel.fogOn = 1;
    } else {
      tel.fogOn = 0;
    }
    const frames = [];

    /* WHAT THE OTHER SIDE HAS ON YOU, per body, recorded into the replay. Without this the
       viewer can draw the fight but not the fog: every body would look equally visible, which
       is the one thing this pass changed and the one thing a number cannot show you.
       0 nobody has you · 1 they know roughly where you are · 2 they have eyes on you */
    const knownOf = (u, si) => {
      if (!fog) return 2;
      let best = 0;
      for (let k = 0; k < sides.length; k++) {
        if (k === si) continue;
        const O = sides[k];
        if (!O._seen) continue;
        if (O._seen.has(u.id)) return 2;
        if (O._heard.has(u.id)) best = 1;
      }
      return best;
    };

    /* ONE PLACE THAT DESCRIBES A BODY, because there are two places that record one.
       These were two separate object literals, and every field added to the replay since has
       been added to whichever one was in front of me: `race` and `mv` reached the turn snapshot
       and never reached the per-body frames, which are the ones you actually watch. The result
       was an Olmac rendering as a large grey body on the frame at the top of a turn and as a
       small pale one on every frame after it, because a missing `race` falls back to human.
       It flickered rather than failing, so nothing threw and the page checks passed.
       Two copies of a record drift. One function cannot. */
    const unitRec = (u, si) => ({
      id: u.id, s: si, x: u.x, y: u.y, st: u.state, ow: !!u.overwatch, sup: !!u.suppressed,
      mv: u._crossed ? 2 : u.repositioning ? 1 : 0, race: u.race || 'human',
      comp: Math.round(u.comp || 0), ammo: u.ammo || 0, sid: !!u.onSidearm,
      hp: u.hp, hpMax: u.hpMax, kn: knownOf(u, si), stun: u._stun ? Math.round(u._stun * 10) / 10 : 0,
      name: u.ref && u.ref.name
    });
    const snap = () => frames.push({
      turn: tel.turn,
      units: sides.flatMap((S, si) => S.units.map(u => unitRec(u, si))),
      fx: fxRec()
    });
    tel.first = first;
    tel.openingBand = openingBand;
    snap();

    /* Initiative, not sides. One side acting then the other gave the first mover a 55%
       edge with identical rosters — a structural advantage nothing in the game was meant to
       confer. A round is now every fighter in one order, fastest first, so being ready
       shows up as acting early rather than as belonging to the lucky team. */
    const initiative = (u) => (u.stats.reflex || 100) * 0.16 + (u.stats.tactics || 100) * 0.05
                            + (prep[u.side] || 0.5) * 6;

    /* a fight with no way out runs past the ordinary backstop: it ends when a side is done */
    const MAXT = ctx.toTheEnd ? CONST.MAX_TURNS * 3 : CONST.MAX_TURNS;
    for (const S of sides) for (const u of S.units) u._dark = _night;
    for (tel.turn = 1; tel.turn <= MAXT; tel.turn++) {
      /* §MON-WA (fixed) A SCRAMBLED PAIR PAYS WHAT SEPARATION COSTS, once, to its one mind. It drained 25 a turn from each
         half raw — twice the separation's price, past every nerve hook and the panic check — so the item was a harsher
         separation than separation itself. */
      for (const S of sides) for (const u of S.units) if (u._scrambled > 0) {
        if (u.pair && u.pair.halves[0] !== u && u.pair.halves[0]._scrambled > 0) { u._scrambled--; continue; }
        if (u.state === 'ok' || u.state === 'light') comp(rng, u, C.CONST.MONWA_TETHER_COMP);
        u._scrambled--;
      }
      /* §LIGHT a sun-fed weapon DRINKS THE DAY: in the planet's light it takes back charge every turn */
      if (!_night) for (const S of sides) for (const u of S.units) {
        if (u.chargeMax > 0 && C.hasQuirk && C.hasQuirk(u, 'daylight') && (u.state === 'ok' || u.state === 'light'))
          u.charge = Math.min(u.chargeMax, u.charge + CONST.SOLAR_TURN_GAIN);
      }
      _geo = new Map();           /* the map does not move; positions do, once a turn */
      if (fog) {
        sides[0]._fog.turn = tel.turn;
        sides[0]._fog.dirty = true;
        ensureSpot(sides[0]);
        if (!tel.contactTurn && sides.some(S => S._seen && S._seen.size)) tel.contactTurn = tel.turn;
      }
      for (let i = screens.length - 1; i >= 0; i--) {
        if (--screens[i].left <= 0) screens.splice(i, 1);
      }
      for (let i = drones.length - 1; i >= 0; i--) {
        if (--drones[i].left <= 0) { drones.splice(i, 1); if (fog) sides[0]._fog.dirty = true; }
      }
      /* §DEVICES AN AUTO-TURRET FIRES ONCE A TURN, on its own, at the nearest enemy it has a line
         to, for as long as it lasts. Cover counts against it as it does against anyone; its hits
         wound by the same rule as a fighter's and are credited to whoever set it down. It is an
         emplacement, not a fighter — it does not count toward who is still standing. */
      for (let i = turrets.length - 1; i >= 0; i--) {
        const T = turrets[i];
        let mark = null, md = 1e9, Emark = null;
        for (const E of sides) {
          if (E.tag === T.side) continue;
          for (const g of E.units) {
            if (g.state !== 'ok' && g.state !== 'light') continue;
            const d = Math.hypot(g.x - T.x, g.y - T.y);
            if (d > CONST.TURRET_RANGE || d >= md) continue;
            if (!hasLOS(map, T, g)) continue;
            md = d; mark = g; Emark = E;
          }
        }
        if (mark) {
          /* §ONE AIM IT SHOOTS AS A FIGHTER SHOOTS: its aim, on the sheet's scale, through the same hit
             curve, the same cover and the same bands as anyone's. It had its own private chance and
             an aim nothing read — set, at that, in the wrong unit. */
          const cov = coverAgainst(map, mark, T);
          const sc = mark.cover; mark.cover = cov;
          const hit = rng() < C.hitChance(T.gun, mark, bandOf(md), { exchange: 2, dist: md }, false) * CONST.SHOT_HIT_MULT;
          if (hit) applyHit(rng, mark, C.resolveSeverity(rng, T.gun, mark, 'standard', bandOf(md), null, tel.turn),
                            tel, log, T.gun, Emark);
          mark.cover = sc;
          tel.turretShots = (tel.turretShots || 0) + 1;
          if (hit) tel.turretHits = (tel.turretHits || 0) + 1;
          if (log) log.push({ t: tel.turn, type: 'turret_shot', by: T.by, at: mark.id, x: T.x, y: T.y, hit: hit });
        }
        if (--T.left <= 0) turrets.splice(i, 1);
      }
      /* ---- ANYBODY WALKING IN ----
         A firefight was a closed room: everyone standing on the ground when it started, and
         nobody afterwards. The day loop now knows a fight occupies real hours, so a squad
         close enough to cover the distance in that time can arrive while it is still going —
         which is what "coming round the back" has to mean if it is to mean anything.
         They enter on their own bearing, which is why the bearing work had to come first, and
         they are placed by the same rules as anyone else. The turn order is rebuilt from
         `sides` every turn, so a side that did not exist a moment ago simply appears in it. */
      if (reinforce.length) {
        for (let i = reinforce.length - 1; i >= 0; i--) {
          const R = reinforce[i];
          if (R.atTurn > tel.turn) continue;
          reinforce.splice(i, 1);
          let si = sides.findIndex(S => S.tag === R.side.tag);
          if (si < 0) { sides.push(R.side); si = sides.length - 1; }
          else { for (const u of R.side.units) sides[si].units.push(u); }
          deploy(rng, map, R.side.units, si, R.prep == null ? 0.5 : R.prep, null,
                 { taken: taken, bearing: R.bearing, flanked: false, edgeOnly: true });
          /* §FLANK AN ARRIVAL KNOWS WHOSE SIDE IT IS ON. The bearing placement never set `side`, so a body that
             walked in kept whatever index it was built with — friend to one side by accident, or to none, which
             is what the overwatch path fell over. It belongs to the side it joined. */
          for (const u of R.side.units) { u.side = si; u._side = sides[si]; }
          if (sides[si] === R.side) { R.side.sIdx = si; R.side._psi = R.side._psi || { link: false, sense: false }; }
          tel.arrived = (tel.arrived || 0) + R.side.units.length;
          tel.arrivals = (tel.arrivals || 0) + 1;
          /* THEY WALK IN UNSEEN, and unlike everything else about fog this needs no special
             case: they enter at the edge, on their own bearing, which is a long way from a
             fight that has been drifting toward the middle for nine turns. The spotting pass
             at the top of the next turn decides it on the geometry, exactly as it does for
             anybody else. What is worth having is the COUNT — a squad arriving behind people
             who set up facing somewhere else is the one thing here a number cannot show, and
             an arrival that everybody sees coming is a different event from one nobody does. */
          /* An arriving squad needs its knowledge wired up before it can act, or `sideKnows`
             takes the no-model path and hands them the whole field for free. That part is
             load-bearing. What is NOT here any more is a count of arrivals that nobody
             noticed: it read zero through six contests, and building the case deliberately
             across 160 fights on every bearing it fired once in 666 bodies. Arrivals enter at
             a map edge, and on 26x18 tiles nearly everywhere is within sight of the fighting,
             so they are seen almost every time. The behaviour is right and needs no special
             case — the geometry decides it, the same as for anybody else. The counter measured
             nothing, so it is gone rather than left to look like a feature. */
          if (fog) {
            const F = sides[0]._fog;
            F.dirty = true; F.turn = tel.turn;
            R.side._fog = F;
            R.side._seen = R.side._seen || new Set();
            R.side._heard = R.side._heard || new Set();
            ensureSpot(sides[0]);
          }
          /* where they actually came in, recorded. Verifying this by reading positions at the
             end of the fight proved nothing at all: they had spent ten turns moving. */
          if (log) log.push({ t: tel.turn, kind: 'arrive', side: R.side.tag,
                              n: R.side.units.length,
                              at: R.side.units.map(u => [u.x, u.y]),
                              text: R.side.tag + ' arrives on the flank' });
        }
      }

      const order = sides.flatMap((S, si) => alive(S.units).map(u => ({ u, si })))
        .sort((a, b) => (initiative(b.u) - initiative(a.u)) || (a.u.id < b.u.id ? -1 : 1));

      for (const { u, si } of order) {
        const S = sides[si];
        /* PER-BODY REPLAY. `frames` snapshotted once a turn, which is enough to animate a
           fight and not enough to judge one: to see whether a fighter chose well you have to
           see the field as it was when THEY chose. One frame per acting body, tagged with who
           acted and carrying whatever they logged while doing it. Verbose-only. */
        const logMark = log ? log.length : 0;
        const beforeXY = { x: u.x, y: u.y };
        let midXY = null;
        /* whoever is not us: the nearest live enemy decides which banner we treat as THE
           enemy this turn, so a three-cornered fight is fought against whoever is on you */
        const E = pickEnemy(sides, si, u);
        if (!E) continue;
        if (u.state !== 'ok' && u.state !== 'light') continue;
        if (!alive(E.units).length) break;
        try {
          u.ap = CONST.AP; u.dashed = false; u.overwatch = false;
          u._underFire = !!u._shotSince; u._shotSince = false;   /* (fixed) set at last: the surge never fired */
          /* MOTION WEARS OFF WHEN YOUR TURN COMES ROUND. Being caught mid-move only means
             anything while the other side is shooting, which is exactly the window between
             your move and your next activation. Cleared here alongside the other per-turn
             flags rather than at end of turn, so it lasts the whole of the enemy's turn —
             which is the mistake `suppressed` makes, clearing for everyone simultaneously and
             expiring on half the people it was applied to before they ever act. */
          /* §SUPPRESSION (ruled) A LANE STANDS UNTIL ITS LAYER'S NEXT TURN, so the men under it are pinned through their own
             turn whatever the order: his own lanes lift as his turn begins, and who is pinned is read again. */
          { const lanes = lanesOf(tel), had = lanes.length; for (let i = lanes.length - 1; i >= 0; i--) if (lanes[i].by === u) lanes.splice(i, 1);
            if (lanes.length !== had) refreshPins(tel, sides); }
          u._actFrom = { x: u.x, y: u.y };
          /* `recoil_heavy` — "aim worse in the exchange after repositioning": nothing ever wrote what it reads */
          u._movedLast = !!(u.repositioning || u._crossed);
          u.repositioning = false; u._crossed = false;
          if (ambush && tel.turn === 1 && si !== first) { u.ap = 1; tel.ambushed++; }
          const taken = occupancy(sides);
          const allFoes = alive(E.units);
          if (!allFoes.length) break;
          /* WHAT THIS SQUAD KNOWS, which is not the same as who is on the field. Everything
             below this line that makes a DECISION reads `foes`; the raw list stays as
             `allFoes` for the things that are not decisions — whether the other side still
             exists, and who counts as the enemy banner.
             This is the line that changes what a turn is for. It is not enough to filter what
             a fighter may shoot at: the movement scorer weighs threat from everyone with line
             of sight, so a fighter who could only SHOOT at what he knew about would still have
             been dodging people he had no idea were there, and fog would have been a cosmetic
             restriction on target choice. */
          if (fog) ensureSpot(S);
          const foes = fog ? knownFoes(S, allFoes) : allFoes;
          if (fog && !foes.length) tel.blindBodyTurns++;

          const home = homePoint(u, si, map, ctx.bearings && (sides.length > 2 || ctx.forceBearings) ? ctx.bearings : null);
          /* Panicked: no shooting, no thinking, straight for the edge and off the field. */
          if (u.state === 'panicked') {
            /* NOWHERE TO RUN. In a fight with no way out a panicking fighter cannot leave the
               field: they gather themselves and fight on, badly, rather than walking off it. */
            if (ctx.toTheEnd) { u.state = 'ok'; u.comp = Math.max(u.comp, C.CONST.COMP_BANDS.rattled + 1); pairComp(u); }
            else {
            stepHome(u, home, sides, map, CONST.MOVE_TILES + 2);
            triggerOverwatch(rng, u, sides, map, tel, log);
            if (atHome(u, home, map)) { u.state = 'fled'; tel.fled++; }
            continue;
            }
          }

          /* Ordered fallback: bounds. Half the squad moves while the other half shoots to
             cover them, and they swap over each turn. This is what makes a withdrawal read
             differently from a rout — it is still a fight, just one going backwards. */
          if (S.withdrawing) {
            if (fog) ensureSpot(S);
            if (contactBroken(u, S, sides, map, fog)) { u.state = 'withdrawn'; tel.withdrawn++; tel.brokeContact = (tel.brokeContact || 0) + 1; continue; }
            const crew = alive(S.units);
            const idx = crew.indexOf(u);
            /* NOT BUILT, AND THE ATTEMPT IS RECORDED RATHER THAN LEFT IN. A forced break —
               nobody covers, everybody runs, you take fire the whole way out — was written
               here and measured at exactly no difference: 0.18 dead a fight with it and
               without, over 120 identical fights, with zero turns ever spent breaking. A
               withdrawal is ordered in 109 of those 120, so the withdrawal itself fires; the
               flag saying it must be a run rather than a bound never arrived. Where it is
               lost was not established, and a mechanism that cannot be shown to do anything
               does not belong in the tree looking like a feature. */
            const bounding = (idx % 2) === (tel.turn % 2);
            if (bounding) {
              /* GOING BACKWARDS STILL MEANS GOING ROUND THINGS: toward home by whichever free tile closes on it, a step aside
                 included (a strict step along x was stuck behind the first wall or squadmate for the rest of the fight) */
              const moved = stepHome(u, home, sides, map, CONST.MOVE_TILES); tel.moves += moved;
              if (fog) { sides[0]._fog.dirty = true; ensureSpot(S); }
              triggerOverwatch(rng, u, sides, map, tel, log);
              if (u.state !== 'ok' && u.state !== 'light') continue;
              if (atHome(u, home, map)) { u.state = 'withdrawn'; tel.withdrawn++; continue; }
              if (fog) ensureSpot(S);
              if (contactBroken(u, S, sides, map, fog)) { u.state = 'withdrawn'; tel.withdrawn++; tel.brokeContact = (tel.brokeContact || 0) + 1; continue; }
              u.ap--;
            }
            /* covering fire: whether you moved or not, you shoot back */
            let cover = null, bestp = 0;
            for (const f of foes) {
              if (!hasLOS(map, u, f)) continue;
              const cov = coverAgainst(map, f, u);
              const sc = f.cover, sf = f.flanked;
              f.cover = cov; f.flanked = cov === 0 && concealAt(map, f) > 0;
              /* §GUNS the scorer sees the shot as the shot will be taken: at its distance, with its gun's reach */
              const p = C.hitChance(u, f, bandOf(dist(u, f)), { dist: dist(u, f) }, false) * CONST.SHOT_HIT_MULT;
              f.cover = sc; f.flanked = sf;
              if (p > bestp) { bestp = p; cover = f; }
            }
            /* §RETREAT (ruled: covering fire protects the people moving) a covering round is fired to keep a head down,
               whatever the gun: it lays a lane on the man best placed to hurt them, and the lane stands till its next turn */
            if (cover && !u._skipNext && C.spendShot(u, 'suppress')) { layLane(rng, u, cover, sides, map, S, E, tel, log); tel.coverPins = (tel.coverPins || 0) + 1; }
            else if (cover) shoot(rng, u, cover, map, S, E, tel, log);
            else u.overwatch = true;
            continue;
          }
          /* Who can I see? And more to the point: is the shot I have worth taking, or is
             moving worth more? A fighter who shoots at 6% because he technically has line
             of sight is not fighting, he is making noise — the first version of this did
             exactly that and produced one move in fifteen turns. */
          const seen = foes.filter(f => hasLOS(map, u, f));
          const shotAt = (from, f) => {
            /* A SWING THAT CANNOT HURT ANYBODY IS NOT WORTH WALKING TOWARD. `hitChance` asks how
               likely you are to connect and never asks what connecting would do, so a power-0
               body scored a 48% "shot" and the movement scorer weighed it exactly like a rifle
               round — which is half of what drew an unarmed fighter toward a squad shooting at
               it. The other half was its preferred range; see `wantTiles`. */
            if (!canHurt(u)) return 0;
            const cov = coverAgainst(map, f, from);
            const sc = f.cover, sf = f.flanked;
            f.cover = cov; f.flanked = cov === 0 && concealAt(map, f) > 0;
            /* §AI the shot as it will be taken: at its distance, through the gun's range model, and as a snap shot from a
               tile it has to move to — it read the old band step, so a marksman thought itself poor up close and the
               scorer and the shot disagreed about every distance */
            const dd = dist(from, f), moved = from.x !== u.x || from.y !== u.y;
            const p = C.hitChance(u, f, bandOf(dd), { dist: dd, snap: moved }, false) * CONST.SHOT_HIT_MULT;
            f.cover = sc; f.flanked = sf;
            return p;
          };
          /* §AI (ruled) A FIGHTER IS NOT EVERY ENEMY'S ONLY TARGET. Each rival's shot at a tile is weighed by the chance it
             picks him out of everyone of his it can see — the threat summed every enemy's shot as if all six would fire at
             this one man, against a gain that counted only his own one shot, so closing in never paid. And a rival on
             overwatch fires again at anyone who moves into his view — unless he is pinned, when he is not watching. */
          /* §AI (fixed) AND THE CHANCE HE PICKS HIM FOLLOWS HOW GOOD A SHOT HE IS. The share was even — one in however
             many he could see — but a rival takes his best shot, and the best shot is the man in the open: a fighter who
             stepped out of cover beside five squadmates behind it counted a sixth of every rival's fire when he was every
             rival's mark. Measured, a quarter of moves took ground clearly worse than the safest on offer for that reason,
             and 65% of aimed shots were at men with no cover facing the shooter. Each rival's choice is weighed by how
             good a shot every man he can see offers (sharpened: even exposure still splits evenly). */
          const otherPull = new Map();
          for (const f of foes) { let t = 0; for (const m of S.units) if (m !== u && (m.state === 'ok' || m.state === 'light') && hasLOS(map, f, m)) t += Math.pow(incoming(f, m, m, map), CONST.TARGET_SHARPNESS); otherPull.set(f, t); }
          const threatAt = (spot, moving, dashW) => { let t = 0;
            for (const f of foes) { if (!hasLOS(map, f, spot)) continue;
              const p = incoming(f, u, spot, map), mine = Math.pow(p, CONST.TARGET_SHARPNESS), rest = otherPull.get(f) || 0;
              const w = mine + rest > 0 ? mine / (mine + rest) : 1;
              t += p * w * (moving && f.overwatch && !f.suppressed ? 2 : 1); }
            return t * (dashW || 1); };
          /* Between shots: a half-rate weapon spends this turn cycling the action. They can
             still move and still watch — they simply have nothing to fire. */
          /* `spool` — the catalog's own words: it cannot fire on the first turn of contact.
           `chill` — a hit last turn costs you this one's movement, not your shot. */
        if (u._chilled) { u._chilled = false; u._noMove = true; } else u._noMove = false;
        if (C.hasQuirk(u, 'spool') && tel.turn === 1) { if (u.ap > 0) { u.overwatch = true; u.ap = 0; } continue; }
        /* §AI (ruled) A GUN CYCLING ITS ACTION DOES NOT FIRE THIS TURN — not aimed, and not from overwatch either: the
           cycling turn was spent on overwatch, so a half-rate rifle shot every turn and its slowness cost it nothing. It
           may still move. */
        const cycling = !!u._skipNext;
          /* ---- GOING BACK FOR THE WOUNDED --------------------------------------------
             `hasMedkit` was handed to this resolver and read by NOTHING: a squad that bought
             medical kit and a squad that did not fought identical fights, and a downed
             fighter's only route to survival was the post-engagement recovery roll. The
             abstract model has had this since Step 3.
             Crossing open ground to a dying man is the most dangerous thing anybody does here,
             so it costs the action, strips cover for the turn, and draws overwatch — the same
             ruling that stopped a death-or-glory squad saving more of its wounded than a
             careful one, because treating used to be free. */
          const hurt = S.units.filter(m => m.state === 'down' && !m._beingTreated && !m._stunnedDown);   /* §STUN a stunned man has nothing to treat */
          if (u.ap > 0 && hurt.length && !u.suppressed) {
            const patient = hurt.reduce((a2, b2) => dist(u, a2) < dist(u, b2) ? a2 : b2);
            const reach = dist(u, patient) <= CONST.TREAT_REACH;
            const eager = C.CONST.TREAT_BASE + (u.hooks.has('volunteers_for_risk') ? 0.15 : 0);
            if (reach && !patient.hooks.has('resists_medical_evac') && rng() < eager) {
              patient._beingTreated = true;
              u.ap--; u.cover = 0;
              tel.treatAttempts = (tel.treatAttempts || 0) + 1;
              triggerOverwatch(rng, u, sides, map, tel, log);
              let pr = C.CONST.TREAT_BASE
                     + (S.hasMedkit ? C.CONST.TREAT_MEDKIT : 0)
                     + (u.hooks.has('field_treatment_bonus') ? C.CONST.TREAT_TRAIT : 0)
                     + C.CONST.TREAT_FIELDCRAFT * (u.stats.fieldcraft - 100);
              pr = Math.max(0.05, Math.min(0.95, pr));
              if ((u.state === 'ok' || u.state === 'light') && rng() < pr) {
                patient.state = 'stable'; patient.bleed = null;
                tel.stabilized = (tel.stabilized || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'stabilized', by: u.id, at: patient.id });
              }
              patient._beingTreated = false;
              if (u.ap <= 0) continue;
            }
          }

          /* ---- CONSUMABLES ---------------------------------------------------------------
             The grid had NO consumable handling of any kind — one incidental mention of the
             word against forty-two in the abstract model — while `planForce` issues a Nevlon
             force twelve of them: five frags, three smoke, two ammo satchels, a power cell and
             a medkit. Every one of those was bought from the treasury, priced by the formula,
             carried onto the field and had no effect on the resolver that actually runs.
             That is a whole shelf of `PROCUREMENT.md` charging money for nothing.
             On a grid a grenade does not want "medium band and a crowd"; it wants a crowd
             standing within a real blast radius, which is a thing the map can answer. */
          if (u.ap > 0 && u.carried && u.carried.length) {
            /* a thermobaric charge is for ground that will not be shot off: it goes first when
               what is in reach is dug in, and otherwise a frag does. Reaching for the frag first meant a
               fighter carrying both never threw the banned one. */
            const dugIn = seen.some(f => (f.state === 'ok' || f.state === 'light') &&
                                         dist(u, f) <= CONST.GRENADE_RANGE && coverAgainst(map, f, u) >= 2);
            const grenade = (dugIn && u.carried.indexOf('itm_thermobaric_charge') >= 0) ? 'itm_thermobaric_charge'
                          : u.carried.indexOf('itm_frag_grenade') >= 0 ? 'itm_frag_grenade'
                          : u.carried.indexOf('itm_incendiary_charge') >= 0 ? 'itm_incendiary_charge'
                          : u.carried.indexOf('itm_thermobaric_charge') >= 0 ? 'itm_thermobaric_charge'
                          : null;
            /* §CONTRABAND a thermobaric charge is the same throw made worse: a wider blast, a harder hit,
               and it does not chip the ground — it takes every scrap of cover in reach away */
            const thermo = grenade === 'itm_thermobaric_charge';
            if (grenade) {
              let mark = null, best = 0;
              for (const f of seen) {
                if (dist(u, f) > CONST.GRENADE_RANGE) continue;
                let n = 0;
                for (const g of foes) {
                  if (g.state !== 'ok' && g.state !== 'light') continue;
                  if (dist(g, f) <= CONST.GRENADE_RADIUS) n++;
                }
                if (n > best) { best = n; mark = f; }
              }
              if (mark && best >= CONST.GRENADE_MIN_CROWD &&
                  rng() < C.CONST.GRENADE_WEIGHT * best) {
                u.carried.splice(u.carried.indexOf(grenade), 1);
                const hot = grenade === 'itm_incendiary_charge' || thermo;
                const save = u.weapon;
                u.weapon = { power: C.CONST.GRENADE_POWER + (thermo ? CONST.THERMO_POWER : 0), range: u.weapon.range, tier: 3,
                             damage: 'explosive', name: thermo ? 'Thermobaric Charge' : hot ? 'Incendiary Charge' : 'Frag Grenade',
                             tags: hot ? ['area', 'incendiary'] : ['area'] };
                let caught = 0;
                for (const g of foes) {
                  if (g.state !== 'ok' && g.state !== 'light') continue;
                  if (dist(g, mark) > (thermo ? CONST.THERMO_RADIUS : CONST.GRENADE_RADIUS)) continue;
                  const cov = coverAgainst(map, g, u);
                  /* thrown, not aimed: cover still helps, but counts for one grade less */
                  if (rng() > C.CONST.GRENADE_LAND_P - cov * C.CONST.GRENADE_COVER_P) continue;
                  const sc = g.cover; g.cover = Math.max(0, cov - 1);
                  applyHit(rng, g, C.resolveSeverity(rng, u, g, S.policy, bandOf(dist(u, g)), null, tel.turn),
                           tel, log, u, E);
                  g.cover = sc;
                  caught++;
                }
                /* AND THE GROUND IT LANDED ON. A grenade is the answer to a wall, so
                   it works the tiles around the burst regardless of who it caught. */
                if (thermo) {
                  for (let oy = -CONST.THERMO_RADIUS; oy <= CONST.THERMO_RADIUS; oy++)
                    for (let ox = -CONST.THERMO_RADIUS; ox <= CONST.THERMO_RADIUS; ox++)
                      while (chipTile(map, mark.x + ox, mark.y + oy, tel)) { /* to the bare ground */ }
                  tel.thermobarics = (tel.thermobarics || 0) + 1;
                } else
                for (let oy = -CONST.COVER_BLAST_RADIUS; oy <= CONST.COVER_BLAST_RADIUS; oy++)
                  for (let ox = -CONST.COVER_BLAST_RADIUS; ox <= CONST.COVER_BLAST_RADIUS; ox++)
                    if (rng() < CONST.COVER_BLAST_P) chipTile(map, mark.x + ox, mark.y + oy, tel);
                u.ap--; u.cover = 0;                    /* you stood up to throw it */
                tel.consumables = (tel.consumables || 0) + 1;
                tel.grenades = (tel.grenades || 0) + 1;
                u.weapon = save;
                if (log) log.push({ t: tel.turn, type: 'grenade', by: u.id, at: mark.id,
                                    n: caught, w: hot ? 'Incendiary Charge' : 'Frag Grenade' });
                if (u.ap <= 0) continue;
              }
            }

            /* SMOKE. In the abstract model a canister raised everybody's cover by a grade,
               because there was nowhere for it to be. On a grid smoke is a PLACE: it lands on
               the ground between you and them, it covers whoever is standing in it whichever
               side they are on, and it drifts away after a couple of turns. Thrown when your
               own people are caught in the open, which is when anybody would. */
            if (u.ap > 0 && u.carried.indexOf('itm_smoke_canister') >= 0 && foes.length) {
              const bare = alive(S.units).filter(m => coverAgainst(map, m, foes[0]) === 0);
              if (bare.length >= CONST.SMOKE_MIN_EXPOSED && rng() < CONST.SMOKE_WEIGHT) {
                u.carried.splice(u.carried.indexOf('itm_smoke_canister'), 1);
                /* between the most exposed friend and the nearest enemy */
                const m = bare[0], f = foes.reduce((x, y) => dist(m, x) < dist(m, y) ? x : y);
                screens.push({ x: Math.round((m.x + f.x) / 2), y: Math.round((m.y + f.y) / 2),
                               left: CONST.SMOKE_TURNS });
                u.ap--;
                tel.consumables = (tel.consumables || 0) + 1;
                tel.smoke = (tel.smoke || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'smoke', by: u.id, n: bare.length });
                if (u.ap <= 0) continue;
              }
            }

            /* §CONSUMABLES A STIM SHOT: +25 composure to one squadmate in reach whose nerve is going.
               It had an action (`dose`) nothing answered. Its cost comes that night: less recovery. */
            if (u.ap > 0 && u.carried.indexOf('itm_stim_shot') >= 0) {
              let m = null;
              for (const x of S.units) {
                if (x === u || (x.state !== 'ok' && x.state !== 'light')) continue;
                if (dist(u, x) > CONST.STIM_REACH || (x.comp || 0) >= CONST.STIM_BELOW) continue;
                if (!m || (x.comp || 0) < (m.comp || 0)) m = x;
              }
              if (m) {
                u.carried.splice(u.carried.indexOf('itm_stim_shot'), 1);
                m.comp = Math.min(100, (m.comp || 0) + CONST.STIM_COMP); pairComp(m);
                if (m.ref) m.ref._stimmed = true;
                u.ap--;
                tel.consumables = (tel.consumables || 0) + 1; tel.stims = (tel.stims || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'stim', by: u.id, at: m.id });
                if (u.ap <= 0) continue;
              }
            }

            /* A CORTICAL SCRAMBLER forces a Mon-Wa pair's tether strain at range — both halves pay the
               price of separation for a few turns, however close they stand. Built to break one species. */
            if (u.ap > 0 && u.carried.indexOf('itm_cortical_scrambler') >= 0) {
              const mark = seen.find(f => f.pair && (f.state === 'ok' || f.state === 'light') &&
                                          dist(u, f) <= CONST.GRENADE_RANGE && !(f._scrambled > 0));
              if (mark) {
                u.carried.splice(u.carried.indexOf('itm_cortical_scrambler'), 1);
                for (const h of mark.pair.halves) if (h.state !== 'dead') h._scrambled = CONST.SCRAMBLE_TURNS;
                u.ap--;
                tel.consumables = (tel.consumables || 0) + 1; tel.scrambles = (tel.scrambles || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'scramble', by: u.id, at: mark.id });
                if (u.ap <= 0) continue;
              }
            }

            /* §DEVICES A SPOTTER DRONE goes up when the squad has lost the enemy: nobody in
               sight, but somebody out there. It hovers over the last place anybody was seen and
               everything under it is seen for the next few turns. */
            if (u.ap > 0 && u.carried.indexOf('itm_spotter_drone') >= 0 && fog &&
                !drones.some(dr => dr.side === S.tag)) {
              const blind = !(S._seen && S._seen.size);
              const out = allFoes.some(f => f.state === 'ok' || f.state === 'light');
              if (blind && out && rng() < CONST.DRONE_WEIGHT) {
                u.carried.splice(u.carried.indexOf('itm_spotter_drone'), 1);
                const at = S._lastContact || searchPoint(S, map, tel.turn) || { x: u.x, y: u.y };
                drones.push({ x: at.x, y: at.y, left: CONST.DRONE_TURNS, side: S.tag, si: sides.indexOf(S) });
                sides[0]._fog.dirty = true; ensureSpot(sides[0]);
                u.ap--;
                tel.consumables = (tel.consumables || 0) + 1;
                tel.drones = (tel.drones || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'drone', by: u.id, x: Math.round(at.x), y: Math.round(at.y) });
                if (u.ap <= 0) continue;
              }
            }

            /* §DEVICES AN AUTO-TURRET is set down where the fighter stands when there is an enemy
               in its reach — ground worth holding — and it fires on its own from then on. */
            if (u.ap > 0 && u.carried.indexOf('itm_auto_turret') >= 0 && foes.length &&
                !turrets.some(tu => tu.by === u.id)) {
              const inReach = foes.some(f => dist(u, f) <= CONST.TURRET_RANGE && hasLOS(map, u, f));
              if (inReach && rng() < CONST.TURRET_WEIGHT) {
                u.carried.splice(u.carried.indexOf('itm_auto_turret'), 1);
                /* the gun it fires with: the fighter's own frame for crediting, a turret's barrel
                   and a turret's steady aim */
                /* credited to whoever set it down (its id), but a machine: its own aim on the sheet
                   scale, none of the fighter's traits, never tired, never rattled, never moving */
                const gun = Object.assign({}, u, {
                  weapon: { power: CONST.TURRET_POWER, range: 'medium', tier: 3,
                            damage: 'ballistic', name: 'Auto-Turret', tags: [] },
                  stats: Object.assign({}, u.stats, { aim: CONST.TURRET_AIM }),
                  hooks: new Set(), mod: null, comp: 100, fatigue: 0, state: 'ok',
                  repositioning: false, suppressed: false, _sustain: 0, _movedLast: false
                });
                turrets.push({ x: u.x, y: u.y, left: CONST.TURRET_TURNS, side: S.tag, si: sides.indexOf(S),
                               by: u.id, gun: gun });
                u.ap--;
                tel.consumables = (tel.consumables || 0) + 1;
                tel.turrets = (tel.turrets || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'turret', by: u.id, x: u.x, y: u.y });
                if (u.ap <= 0) continue;
              }
            }

            /* Resupply. An empty rifle is the commonest way a fighter stops mattering, and a
               satchel sitting in their kit while they draw a pistol is the system not running. */
            const cellGun = C.isEnergy(u), pack = cellGun ? 'itm_power_cell' : 'itm_ammo_satchel';
            /* §ROUNDS the pack is for the PRIMARY, and goes into its spares. A man on his sidearm is there because the primary
               is dry, so he reaches for it; otherwise both families reach for it when the spares are gone and the gun is
               nearly flat. (A cell was worth three charge poured into the gun past its cell's size — the catalogue says
               twenty — reached for with a spare still in the pouch; and a satchel opened on the sidearm filled the pistol.) */
            const low = u.onSidearm ? true : cellGun ? (u.ammo <= 0 && u.charge <= CONST.RESUPPLY_AT) : u.ammo <= CONST.RESUPPLY_AT;
            if (low && u.carried.indexOf(pack) >= 0) {
              u.carried.splice(u.carried.indexOf(pack), 1);
              /* §ROUNDS (ruled: more rounds for more bulk) a satchel is a magazine for the gun it is opened for, not a flat twelve */
              const gun = u.onSidearm ? u.primary : u.weapon;
              const add = cellGun ? CONST.RESUPPLY_CHARGE : Math.max(CONST.RESUPPLY_ROUNDS, (gun && gun.mag) || 0);
              if (u.onSidearm) { u._primaryRounds = u._primaryRounds || { magLeft: 0, ammo: 0, reloading: 0 }; u._primaryRounds.ammo += add; C.backToPrimary(u); }
              else u.ammo += add;
              u.ap--;
              tel.consumables = (tel.consumables || 0) + 1;
              tel.resupply = (tel.resupply || 0) + 1;
              if (log) log.push({ t: tel.turn, type: 'resupply', by: u.id, w: pack });
              if (u.ap <= 0) continue;
            }
          }

          /* ---- SUPPRESSING FIRE ---------------------------------------------------------- */
          /* §SUPPRESSION (ruled) WHETHER TO LAY A LANE OR TAKE THE SHOT, by what each is worth in hits: the shot by the
             rounds it puts on its man; the lane by the hits it keeps off his own side — every man in it shooting worse for a
             turn, a watcher who no longer watches — and by the light rounds it lands itself. */
          let laid = false;
          if (u.ap > 0 && !cycling && seen.length && canHurt(u)) {
            const lo = laneOf(u), slope = C.CONST.HIT_SLOPE * CONST.SHOT_HIT_MULT;   /* lo: the lane's weight */
            const burst = w => { const r = Math.max(1, Math.round((w && w.rof) || 1)); let t = 0, k = 1; for (let i = 0; i < r; i++) { t += k; k *= CONST.FOLLOWUP_HIT; } return t; };
            const mine = S.units.filter(upright), threatOf = new Map();
            for (const e of foes) { if (!upright(e)) continue; let b2 = 0;
              for (const m of mine) { if (!hasLOS(map, e, m)) continue; const p = incoming(e, m, m, map); if (p > b2) b2 = p; }
              threatOf.set(e, b2); }
            let mark = null, laneVal = 0;
            for (const f of seen) {
              let v = 0; const L = laneAt(u, f);
              for (const e of foes) {
                if (!upright(e) || !inLane(L, e)) continue;
                const t = threatOf.get(e) || 0, have = e.suppressed ? (e._supPen || 0) : 0;
                v += Math.min(t, slope * Math.max(0, lo.pen - have)) * burst(e.weapon);
                if (e.overwatch && !e.suppressed) v += t * CONST.LANE_OW_VALUE;
                v += shotAt(u, e) * CONST.LANE_HIT_MULT * CONST.LANE_POWER_MULT;
              }
              if (v > laneVal) { laneVal = v; mark = f; }
            }
            let shotVal = 0; for (const f of seen) shotVal = Math.max(shotVal, shotAt(u, f));
            shotVal *= burst(u.weapon);
            if (mark && laneVal * CONST.LANE_WEIGHT > shotVal && C.spendShot(u, 'suppress')) {
              layLane(rng, u, mark, sides, map, S, E, tel, log);
              laid = true; u.ap -= CONST.SUPPRESS_AP;
              if (u.ap <= 0) continue;
            }
          }

          let target = null, pNow = 0;
          for (const f of seen) {
            const raw = shotAt(u, f);
            /* §STUN a stun shooter works on the man nearest the line — his stacks and his wounds both — as a rifleman finishes the hurt one */
            const p = raw + (stunOf(u) > 0 ? CONST.STUN_FOCUS * Math.min(1, (stunSpent(f) + Math.max(0, (f.hpMax || 1) - (f.hp != null ? f.hp : f.hpMax))) / Math.max(1, f.hpMax || 1))
                                          : (f.state === 'light' ? CONST.FINISH_WOUNDED : 0));
            if (p > pNow) { pNow = p; target = f; }
          }

          /* What is the best shot I could have if I moved instead? Cover for me, no cover
             for them, and close enough that the band is not doing all the work. */
          /* WHAT YOU WALK TOWARD WHEN YOU KNOW OF NOBODY. `reduce` on an empty list throws,
             and under fog an empty list is not an edge case — it is most of the opening of a
             long-band fight. A squad with no contact is neither paralysed nor omniscient: it
             heads for the last place anybody was seen, and failing that for the middle, which
             is where the fight is. The band pull the scorer already applies then does the rest,
             so a shotgun closes on the last contact and a marksman holds off it, using the
             machinery that is already there rather than a second search behaviour. */
          const near = foes.length
            ? foes.reduce((x, y) => dist(u, x) < dist(u, y) ? x : y)
            : searchPoint(S, map, tel.turn);
          let move = null;
          /* am I currently unseen? decides Soft Boots. Declared out here rather than inside
             the scoring block because the dash below is a second movement decision in the same
             turn and needs the same answer — scoped tight, it threw a ReferenceError at the
             dash on the first fight run, which is the cheap version of this mistake. */
          const meUnseen = fog && !!(E._seen) && !sideKnows(E, u);
          if (meUnseen && u.hooks && u.hooks.has('unspotted_movement_bonus')) tel.softBootsMoves++;
          {
            const spots = candidates(map, taken, u, moveTilesFor(u, meUnseen), near, seen);
            tel.candidates = (tel.candidates || 0) + spots.length;
            tel.candidateCalls = (tel.candidateCalls || 0) + 1;
            for (const cand of spots) {
              const x = cand.x, y = cand.y;
              const spot = { x, y, id: u.id };
              let bestP = 0, tgt = null;
              for (const f of foes) {
                if (!hasLOS(map, spot, f)) continue;
                const p = shotAt(spot, f);
                if (p > bestP) { bestP = p; tgt = f; }
              }
              /* THREAT, not a cover bonus. What matters about a position is how likely the
                 people shooting at you are to hit you there — which is what cover is FOR.
                 Scoring cover as a flat 0.045 a grade against a hit chance of 0.15 meant any
                 marginal improvement in a shot was worth abandoning a wall for, and it is why
                 squads walked out of good ground on turn one. */
              const threat = threatAt(spot, x !== u.x || y !== u.y);
              const bandOff = Math.abs(Math.hypot(x - near.x, y - near.y) - wantTiles(u));
              /* §RACES A HALF KEEPS STATION. A pair that pays for separation and never tries
                 to close is a pair being punished for the engine's indifference: a Mon-Wa
                 weighs a tile by how far it leaves them from the other half, and weighs it
                 hard once the tether is stretched. */
              let tether = 0;
              if (u.pair) {
                const o = u.pair.halves.find(h => h !== u);
                if (o && o.state !== 'dead' && o.state !== 'withdrawn') {
                  const d = Math.max(Math.abs(cand.x - o.x), Math.abs(cand.y - o.y));
                  tether = Math.max(0, d - CONST.TETHER_TILES) * CONST.TETHER_PULL;
                }
              }
              const val = bestP * CONST.SHOT_WEIGHT - threat * CONST.THREAT_WEIGHT
                        - bandOff * CONST.BAND_PULL - tether;
              /* SCORE TAP — inert unless a caller supplies one, and no caller in the game does.
                 It exists so an audit can ask whether a term in this decision actually CHANGES
                 the decision: drop the term, recompute the ranking, see if the same tile still
                 wins. A term that fires constantly and flips nothing is decorative, which is
                 what `overwatch` turned out to be. Recomputing outside the engine would mean
                 reimplementing this formula and measuring the reimplementation. */
              if (!move || val > move.val) move = { x, y, val, p: bestP, tgt, threat };
            }
          }

          const stayThreat = threatAt(u, false);
          /* §AI a shot not worth taking is not a reason to stay: below HOPELESS_SHOT it is noise, and a fighter out of his
             range moves rather than fire it (and on a cycling turn there is no shot at all) */
          if (cycling || laid || pNow < CONST.HOPELESS_SHOT) { pNow = 0; if (cycling || laid) target = null; }
          const stayBandOff = Math.abs(dist(u, near) - wantTiles(u));
          const stayVal = pNow * CONST.SHOT_WEIGHT - stayThreat * CONST.THREAT_WEIGHT
                        - stayBandOff * CONST.BAND_PULL;
          /* moving is not free: you are up and crossing ground while people are shooting */
          /* PINNED. Somebody is putting rounds on this position, so the cost of standing up
             and crossing is not the ordinary cost of crossing. This is the line that makes a
             machine gun worth carrying on a grid. */
          const moveGate = u._noMove ? Infinity
                         : u.suppressed ? CONST.MOVE_COST + CONST.SUPPRESSED_MOVE_COST
                         : CONST.MOVE_COST;
          if (move && move.val > stayVal + moveGate && (move.x !== u.x || move.y !== u.y)) {
            const strippedCover = target ? coverAgainst(map, target, u) : 0;
            const fromX = u.x, fromY = u.y;      /* §RACES how far this step actually carried */
            u.x = move.x; u.y = move.y; u.ap--; tel.moves++;
            /* WHERE IT GOT TO BEFORE ANY DASH. A frame carried only `from` and the final tile,
               so a body that moved and then dashed was recorded as one small hop — the Bellow
               crossed 4.5 tiles into cover and 4.2 back out, and the replay drew a 1.4-tile
               shuffle. Two decisions fighting each other looked like one inexplicable step
               because the path between them was thrown away. */
            midXY = { x: u.x, y: u.y };
            /* YOU ARE EASIER TO HIT HAVING JUST MOVED. `repositioning` was read by `hitChance`
               and written by nothing, so crossing ground was free — the game specified a
               penalty and applied none. */
            if (motion) u.repositioning = true;
            if (u.race === 'kellis') u._measure = 0;      /* §RACES crossing ground breaks the measure */
            /* §RACES IN THE AIR: a step longer than legs could carry them is a burst of flight
               — over whatever was in the way, and in the open while they are up there. */
            if (u._flightOffered) {
              const hop = Math.max(Math.abs(u.x - fromX), Math.abs(u.y - fromY));
              if (hop > CONST.MOVE_TILES) {
                u._flew = true;
                /* THYTHYN_HOVER_P, ratified and unread until now: not every burst ends with
                   them hanging in the air where everybody can see them */
                u.hovering = rng() < C.CONST.THYTHYN_HOVER_P * 3;
                tel.flights = (tel.flights || 0) + 1;
                if (log) log.push({ t: tel.turn, type: 'flight', by: u.id });
              }
              u._flightOffered = false;
            }
            /* CROSSING GROUND IS HOW YOU GET SEEN, so knowledge is stale the moment anybody
               steps. Marked before overwatch is offered the shot rather than after, because
               the whole question overwatch asks is whether this mover has just walked into
               somebody's view. */
            if (fog) { sides[0]._fog.dirty = true; ensureSpot(S); }
            triggerOverwatch(rng, u, sides, map, tel, log);      /* crossing ground is dangerous */
            if (u.state !== 'ok' && u.state !== 'light') continue;
            if (move.tgt && strippedCover > 0 && coverAgainst(map, move.tgt, u) === 0) tel.flankShots++;
            target = move.tgt; pNow = move.p;

            /* ---- THE DASH ---------------------------------------------------------------
               `DASH_EXPOSE` has been declared since Step 5 and `dashed` was set to true
               NOWHERE: there was no dash, so a fighter could move once a turn whatever they
               gave up. A shotgun needing to cross fifteen tiles to reach a flank had to walk
               it over three turns, in the open, being shot at each time — so it never went,
               and a short-range squad simply took a firing position at the midpoint and stayed
               there, which is exactly what watching the demo showed.
               Spending the SECOND action on movement too doubles the ground covered. You give
               up your shot, you give up your cover for the turn, and you draw overwatch a
               second time. It is a commitment, not a free sprint — but it makes the far side
               of a rock reachable inside one turn instead of three. */
            if (u.ap > 0 && !u.suppressed && !u._noMove) {
              const far = candidates(map, occupancy(sides), u, moveTilesFor(u, meUnseen), near, seen);
              let rush = null;
              for (const cand of far) {
                if (cand.x === u.x && cand.y === u.y) continue;
                let best = 0;
                for (const f of foes) {
                  if (!hasLOS(map, { x: cand.x, y: cand.y }, f)) continue;
                  const cov = coverAgainst(map, f, { x: cand.x, y: cand.y });
                  const sc = f.cover, sf = f.flanked;
                  f.cover = cov; f.flanked = cov === 0 && concealAt(map, f) > 0;
                  /* §GUNS a shot from where the dash ends is a SNAP shot, at that distance — the scorer sees it as it will be */
                  const p = C.hitChance(u, f, bandOf(dist(cand, f)), { dist: dist(cand, f), snap: true }, false) * CONST.SHOT_HIT_MULT;
                  f.cover = sc; f.flanked = sf;
                  if (p > best) best = p;
                }
                /* WHAT THIS GROUND COSTS, which this decision could not previously represent.
                   The dash scored `shot - band` and had no threat term at all, while the move
                   decision that runs a second earlier weighs threat as the heaviest thing it
                   has — 47% of all movement decisions turn on it. So a body took good cover on
                   its first action and was then moved by a rule blind to the thing it had just
                   optimised for: measured across one contest, a quarter of all dashes ended
                   with no cover having started in cover, and 6% finished within two tiles of
                   where they began, having gone somewhere and come most of the way back.
                   Weighted at a FRACTION of the move scorer's. The dash exists so a short-range
                   squad can cross ground it otherwise never crosses; at full weight it would
                   become as cautious as an ordinary move and stop being a dash at all. */
                const dThreat = threatAt({ x: cand.x, y: cand.y }, true);
                const val = best * CONST.SHOT_WEIGHT
                          - dThreat * CONST.THREAT_WEIGHT * CONST.DASH_THREAT_SHARE
                          - Math.abs(Math.hypot(cand.x - near.x, cand.y - near.y) - wantTiles(u))
                            * CONST.BAND_PULL;
                if (!rush || val > rush.val) rush = { x: cand.x, y: cand.y, val: val, p: best };
              }
              const hereThreat = threatAt(u, false);
              const here = pNow * CONST.SHOT_WEIGHT
                         - hereThreat * CONST.THREAT_WEIGHT * CONST.DASH_THREAT_SHARE
                         - Math.abs(dist(u, near) - wantTiles(u)) * CONST.BAND_PULL;
              if (rush && rush.val > here + CONST.DASH_COST) {
                u.x = rush.x; u.y = rush.y; u.ap--; u.dashed = true;
                /* A DASH IS THE CROSSING CASE. Both actions spent on ground, no shot, cover
                   dropped — `_crossed` is the heavier of the two motion penalties and this is
                   the heavier kind of move. Uses the state the grid already tracks rather than
                   inventing a second notion of what crossing means. */
                if (motion) { u._crossed = true; u.repositioning = false; }
                tel.dashes = (tel.dashes || 0) + 1;
                if (CONST.DASH_EXPOSE) u.cover = 0;
                if (fog) { sides[0]._fog.dirty = true; ensureSpot(S); }
                triggerOverwatch(rng, u, sides, map, tel, log);
                if (u.state !== 'ok' && u.state !== 'light') continue;
                if (log) log.push({ t: tel.turn, type: 'dash', by: u.id,
                                    to: { x: u.x, y: u.y }, w: (u.weapon || {}).name });
                continue;                       /* both actions spent on ground */
              }
            }
          }

          if (!target || cycling || laid || pNow < CONST.HOPELESS_SHOT) {
            if (u.ap > 0 && !cycling && !laid) { u.overwatch = true; u.ap = 0; }
            continue;
          }

          /* otherwise: shoot, and if there is a spare action, watch */
          shoot(rng, u, target, map, S, E, tel, log);
          u.ap--;
          if (u.ap > 0) { u.overwatch = true; u.ap = 0; }
        } finally {
          /* `finally`, because this body's turn can end at half a dozen `continue`s and a
             replay that silently skips the interesting ones is worse than no replay. */
          if (log) {
            frames.push({
              turn: tel.turn, actor: u.id, side: si,
              moved: (u.x !== beforeXY.x || u.y !== beforeXY.y),
              from: beforeXY,
              via: (midXY && (midXY.x !== u.x || midXY.y !== u.y)) ? midXY : null,
              did: log.slice(logMark),
              units: sides.flatMap((SS, ssi) => SS.units.map(x => unitRec(x, ssi))),
              fx: fxRec()
            });
          }
        }
      }
      /* §RACES THE KELLIS KEEP THEIR MEASURE: a turn held in place is a turn spent reading the
         other side, and it tells in the next exchange. Moving breaks it. */
      for (const S of sides) for (const u of S.units) {
        if (u.race !== 'kellis' || (u.state !== 'ok' && u.state !== 'light')) continue;
        u._measure = Math.min(CONST.KELLIS_MEASURE_CAP, (u._measure || 0) + 1);
      }
      /* §QUIRKS WHAT THE ONES BESIDE YOU ARE WORTH. `presence_aura`, `cohesion_morale_bonus_
         near_squadmates`, `death_morale_immune` and `gore_morale_immune` were carried by
         fighters and read by nothing at all. A body who steadies people steadies the people
         near them; a body who does not mind the dead does not mind them. */
      for (const S of sides) {
        const auras = S.units.filter(u => u.hooks && u.hooks.has('presence_aura') &&
                                      (u.state === 'ok' || u.state === 'light'));
        if (!auras.length) continue;
        for (const u of S.units) {
          if (u.state !== 'ok' && u.state !== 'light') continue;
          if (u.comp >= CONST.AURA_CAP) continue;      /* steadying a steady body does nothing */
          if (auras.some(a => a !== u && Math.max(Math.abs(a.x - u.x), Math.abs(a.y - u.y)) <= CONST.AURA_TILES))
            comp(rng, u, CONST.AURA_COMP);
        }
      }
      /* §RACES WHAT A DEATH DOES TO THE ONES WATCHING, and THE TETHER — one pass over the
         standing, because two passes over the same units every turn is how the last cut of
         this ground the engine to a halt. A gnoll comes UP at the sight of blood; the
         faithful read a death as the spectacle their god was made for and steady. */
      const deaths = tel._deathsThisTurn || [];
      for (const S of sides) for (const u of S.units) {
        if (u.state === 'dead' || u.state === 'withdrawn') continue;
        /* THE FIRST CUT PAID BOTH OF THESE IN COMPOSURE, every turn, to everybody near a
           body — and composure is what makes a side break, so nothing broke and every fight
           ran to the turn cap: ten turns became twenty-seven. A death now marks the ones who
           saw it, and the mark is spent where each race's nature actually lives — the gnoll's
           in his hands, the faithful's in one refusal to break. */
        if (deaths.length && (u.race === 'attorak' || u.race === 'etu')) {
          for (let di = 0; di < deaths.length; di++) {
            if (Math.max(Math.abs(u.x - deaths[di].x), Math.abs(u.y - deaths[di].y)) > CONST.FLIGHT_AT) continue;
            if (u.race === 'attorak') { u._frenzy = CONST.ATTORAK_FRENZY_TURNS; comp(rng, u, C.CONST.ATTORAK_INTENSITY_COMP); }
            else if (!u._witnessed) { u._witnessed = true; comp(rng, u, CONST.ETU_WITNESS_COMP); }
            break;
          }
        }
        if (u._frenzy > 0) u._frenzy--;
        if (!u.pair) continue;
        const o = u.pair.halves.find(h => h !== u);
        if (!o || o.state === 'dead') continue;
        const d = Math.max(Math.abs(u.x - o.x), Math.abs(u.y - o.y));
        const wasStrained = !!u._tetherStrained;
        /* §QUIRKS a pair drilled to work apart works further apart: tether_range_extended was
           written for exactly this and read by nothing */
        const reach = CONST.TETHER_TILES + ((u.hooks && u.hooks.has('tether_range_extended')) ||
                                            (o.hooks && o.hooks.has('tether_range_extended')) ? CONST.TETHER_DRILLED : 0);
        u._tetherStrained = d > reach;
        /* §MON-WA one mind pays the stretch, or takes the steadying, once a turn — not once a body */
        if (u.pair._turn === tel.turn) continue;
        u.pair._turn = tel.turn;
        if (u._tetherStrained) {
          comp(rng, u, C.CONST.MONWA_TETHER_COMP);
          if (!wasStrained && log) log.push({ t: tel.turn, type: 'tether_strained', by: u.id, at: o.id });
          tel.tetherStrain = (tel.tetherStrain || 0) + 1;
        } else if (u.comp < 100 && u.comp < CONST.TETHER_STEADY_CAP) comp(rng, u, CONST.TETHER_CLOSE_COMP);
      }
      tel._deathsThisTurn = [];
      /* Between rounds: hands with a cell back to it, every fired-flag cleared, and every weapon banks another turn's
         worth of its rate of fire. (A heat model lived here once; it was cut, and its machinery with it.) */
      for (const S of sides) C.betweenExchanges(S);
      /* `mobile_cover` — "grants mobile_cover_provider to same-band squadmates while stationary": a gun or a frame heavy
         enough to be a wall shields the squadmates beside it, a grade of cover, for as long as it stands still. It added
         a hook nothing read. */
      for (const S of sides) {
        for (const u of S.units) u._shielded = false;
        for (const w of S.units) {
          if ((w.state !== 'ok' && w.state !== 'light') || w.repositioning || w._crossed) continue;
          if (!C.hasQuirk(w, 'mobile_cover') && ((w.armor && w.armor.tags) || []).indexOf('mobile_cover') < 0) continue;
          for (const m of S.units) if (m !== w && (m.state === 'ok' || m.state === 'light') && dist(m, w) <= CONST.MOBILE_COVER_RADIUS) { m._shielded = true; tel.shielded = (tel.shielded || 0) + 1; }
        }
      }
      for (const S of sides) for (const u of S.units) {
        C.tickReload(u);                           /* §GUNS a magazine going in counts down between exchanges */
        u._rateBank = (u._rateBank || 0) + (C.tempoOf(u) - 1);
        if (u._rateBank < 0) { u._skipNext = true; u._rateBank += 1; } else u._skipNext = false;
        /* (a pin comes off when its man has had a turn under it: at his activation, above) */
      }
      for (const S of sides) checkWithdraw(S);
      if (A.withdrawing && !tel.endedBy0) { tel.endedBy0 = 1; tel.withdrawCalled = (tel.withdrawCalled||0)+1; }
      if (B.withdrawing && !tel.endedBy1) { tel.endedBy1 = 1; tel.withdrawCalled = (tel.withdrawCalled||0)+1; }
      snap();
      /* A WITHDRAWAL IS FOUGHT, NOT DECLARED. This read `!finished(S) && !S.withdrawing`, so
         the moment one side called the retreat it stopped counting as standing, the other side
         was the only one left, and the loop broke on that same turn. In a two-sided fight —
         94% of them — that is always true the instant anybody breaks, and a withdrawal is
         ordered in 109 of every 120 fights. So the entire bounding branch below executed
         ZERO times, ever: nobody covered anybody, nobody crossed ground under fire, nobody
         reached their own edge. Fully built, and unreachable.
         A side that is pulling out is still on the field until its people are off it. They
         leave by reaching their own edge, which turns them `withdrawn` and therefore no longer
         standing, so `finished` closes the fight when they are actually gone rather than when
         somebody says the word. `MAX_TURNS` still bounds it. */
      const standing = sides.filter(S => !finished(S));
      const leaving = standing.filter(S => S.withdrawing);
      if (standing.length <= 1 || leaving.length === standing.length) {
        tel.endedBy = !standing.length ? 'everyone withdrew'
                    : leaving.length === standing.length ? 'everyone withdrew'
                    : 'field cleared';
        break;
      }
    }

    /* POST-ENGAGEMENT. Shared with the abstract model rather than copied: capture, bleeding
       out, stabilisation, and a bond that lost a half. Without this the grid left everybody it
       knocked down `down` for ever — nobody bled out and NOBODY WAS EVER CAPTURED, which
       quietly removes ransom, the freedom clause and every captive outcome from the game.
       A side that withdrew or broke is the grid's version of "overrun". */
    /* NOWHERE TO RUN, AT THE END TOO: a fighter still panicking when a fight to the death
       stops is a fighter the other side has walked up to. They go down with the rest. */
    if (ctx.toTheEnd) for (const S of sides) for (const u of S.units)
      if (u.state === 'panicked' || u.state === 'fled') { u.state = 'down'; u.bleed = u.bleed || { turns: 0 }; }
    C.settleAftermath(rng, sides, tel, log, tel.turn, (S) => {
      const live = S.units.filter(u => u.state === 'ok' || u.state === 'light').length;
      const gone = S.units.filter(u => u.state === 'fled' || u.state === 'panicked').length;
      /* OVERRUN IS NOT THE SAME AS WITHDRAWING, and conflating them was worth roughly double
         the death rate of the whole game.
         Being overrun costs you your wounded: the recovery roll for a downed fighter falls
         from 0.78 to 0.38, so most of them die where they lie. `S.withdrawing` was in this
         condition, so **every orderly fighting withdrawal was scored as an overrun** — and a
         captain calling the retreat is the single most common way a firefight ends here.
         COMBAT.md is explicit that a disengage is orderly: the squad withdraws by bounds,
         cover is used, and casualties are LOW. That is the whole reason Engagement Policy
         exists. What loses you your wounded is the field being taken while they are on it:
         nobody left standing, or the squad coming apart and running. */
      /* LEAVING IS NOT BEING WIPED OUT. `live` counts people still on their feet on the field,
         and a squad that completed a fighting withdrawal has none — everybody is `withdrawn`,
         which is neither `ok` nor `light`. So the moment withdrawals started actually playing
         out, every successful one was scored as overrun and its wounded took the 0.40 penalty
         for a field that was never taken. That is the exact fault the comment above this line
         warns about, reintroduced by the change that made the branch reachable.
         Getting your people off is the opposite of being overrun. */
      const away = S.units.filter(u => u.state === 'withdrawn').length;
      /* A FIGHT WITH NO WAY OUT takes the field from the side that loses it: nobody withdraws
         from The Eight, so a side left without anyone standing IS overrun, and its wounded lie
         where they fell. Without this the loser walked away hurt from a death match. */
      if (ctx.toTheEnd) return !live;
      return (!live && !away) || gone / S.units.length >= C.CONST.ROUT_SQUAD_FRACTION;
    }, { exhibition: !!ctx.exhibition });

    /* §6 — hand the cells back to the people who carry them, and roll up the energy counters.
       The grid never called this: charge was spent correctly during a fight and then thrown
       away at the end instead of persisting to the fighter, and `tel.vents` / `sidearmDraws`
       stayed at zero — which made `PROCUREMENT.md [OPEN-P11]` read as though neither resource
       ever bound. Measured directly on the units, an energy fighter ends a fight on 9.3 of 18
       charge with 28% venting, so the model was working and only the reporting was dead. */
    for (const S of sides) C.persistCharge(S, tel);
    for (const S of sides) for (const u of S.units) {
      tel.ammoLeft += (u.ammo || 0);
      if (u.onSidearm) tel.sidearmDraws++;
      if (u.chargeMax > 0 && u.charge <= 0) tel.chargeOut++;
    }
    /* casualties are keyed by side TAG, so a three-cornered fight reports three entries
       rather than silently dropping the third banner on the floor */
    /* EVERY BODY IS ACCOUNTED FOR. `stable` — a downed fighter somebody got to in time — had no
       field here at all, and it is the second most common state the grid produces: 276 of 1348
       bodies across 80 fights. So this tally reported roughly a fifth of everyone nowhere, and
       no sum of its fields has ever equalled the number of people who walked onto the ground.
       It went unnoticed because the invariant sweep that would have caught it ran on the
       abstract resolver, which does not have this bug, and because `divide.js` counts the units
       themselves rather than reading this. It is a reporting surface, so the game was never
       wrong — only every probe and viewer that trusted it.
       `light` is a SUBSET of `ok`, not a sibling: it is informational, and adding it to the
       others double-counts. The partition is dead + down + stable + captured + withdrawn +
       fled + panicked + ok, and `total` is stated so a reader never has to derive it. */
    const tally = (S) => {
      const c = (st) => S.units.filter(u => u.state === st).length;
      return {
        dead: c('dead'), down: c('down'), stable: c('stable'), captured: c('captured'),
        light: c('light'),                       /* subset of `ok`, not a separate bucket */
        withdrawn: c('withdrawn'), fled: c('fled'), panicked: c('panicked'),
        ok: alive(S.units).length,               /* 'ok' + 'light' */
        total: S.units.length,
        calledWithdrawal: !!S.withdrawing
      };
    };
    const casualties = {};
    for (const S of sides) casualties[S.tag] = tally(S);

    /* --- the shape the day loop reads -------------------------------------------------
       `divide.js` asks a resolver three things: what happened (`result`), how long it took
       (`exchanges`), and a telemetry block under the names the abstract model used. Those
       names are the day loop's vocabulary, not `combat.js`'s property, so the grid answers in
       them rather than the day loop learning a second dialect. A `disengage_X` result is how
       the day loop knows who has to run, and it is what moves squads apart on the map — a
       resolver that never returns one pins every loser to the ground it lost on. */
    const broke = sides.filter(S => S.withdrawing ||
      S.units.every(u => u.state !== 'ok' && u.state !== 'light'));
    let result = 'cap';
    if (broke.length >= sides.length) result = 'disengage_both';
    else if (broke.length) result = 'disengage_' + broke.map(S => S.tag).join('');
    else if (tel.endedBy === 'field cleared') result = 'cleared';

    tel.exchanges = tel.turn;
    tel.downs = sides.reduce((n, S) => n + S.units.filter(u =>
      u.state === 'down' || u.state === 'stable' || u.state === 'dead' || u.state === 'captured').length, 0);
    tel.killedOutright = (tel.dead || 0);
    tel.routs = sides.reduce((n, S) => n + S.units.filter(u =>
      u.state === 'panicked' || u.state === 'fled').length, 0);

    return { map, log, frames, telemetry: tel, turns: tel.turn, exchanges: tel.turn,
             result: result, band: bandName(tel), sides: sides.map(S => S.tag),
             casualties: casualties };
  }

  /* §MON-WA the two bodies of a pair on one field are one being: one composure, a shared fall, the partner roll. Every
     builder of a fight wires them here (the Divide's, the Dividend's, the Eight's, the suite's). */
  function wirePairs(units) {
    const byId = {};
    for (const u of units) byId[u.id] = u;
    for (const u of units) {
      const o = u.ref && u.ref.bond_partner && byId[u.ref.bond_partner];
      if (!o || u.pair || o.ref.bond_partner !== u.id) continue;
      const pair = { comp: Math.round((u.comp + o.comp) / 2), halves: u.ref.half === 'wa' ? [o, u] : [u, o] };   /* the Mon first */
      u.pair = pair; o.pair = pair; u.comp = o.comp = pair.comp;
    }
    return units;
  }
  const api = { CONST, makeMap, resolve, hasLOS, coverAgainst, bandOf, at, wirePairs };
  if (isNode) module.exports = api;
  global.CDTACTICAL = api;
})(typeof window !== "undefined" ? window : globalThis);
