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
    DASH_EXPOSE: true,               // [S] spending both AP on movement means no cover this turn
    TILE_METRES: 6,                  // [C] what a tile is worth, for turning distance into a band
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
    SUPPRESS_RADIUS: 2,              // [C] tiles either side of the mark that also go to ground
    SUPPRESS_MIN_P: 0.04,            // [C] you can hose a position you could barely hit
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
    DASH_THREAT_SHARE: 0.45,         // [C] how much of the ordinary threat weight a dash feels.
                                     //     Not 1.0 on purpose: a dash that is as cautious as a
                                     //     walk is not a dash, and the mechanism exists to get
                                     //     short-range squads across ground they never crossed.
    MOB_TILES: 1.5,                  // [C] ground a mob_up / mob_down weapon gains or costs
    COVERING_FIRE_MIN: 2,            // [C] bodies it must put down to be worth an action
    SMOKE_RADIUS: 2,                 // [C] tiles a screen covers
    SMOKE_TURNS: 3,                  // [S] how long before it drifts away
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
    RESUPPLY_CHARGE: 3,              // [C] what a cell is worth
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
    SIGHT_TILES: 14,                 // [C] NOT a fitted number: it is `BAND_TILE[0]`, the
                                     //     distance at which this grid already says range has
                                     //     become "long". Past the point where a rifle is
                                     //     working at its limit, a body is a shape in the
                                     //     rocks. The reference point already existed.
    SIGHT_FIELDCRAFT: 0.30,          // [C] tiles per point of fieldcraft over 10. Fieldcraft
                                     //     is already the choosing-ground stat the contest
                                     //     reads for readiness; seeing first is the same skill.
    SIGHT_MIN: 4,                    // [S] nobody is blind
    /* How long a muzzle flash gives you away for. You fired, so they know roughly where you
       are — for now. This is what `silent` exempts you from, which is the quirk's original
       written job and the thing it has been waiting on. */
    REVEAL_TURNS: 1,                 // [C] this turn and the next
    /* UNSPOTTED_AIM lives in `combat.js`, where `aimEff` reads it. It was briefly declared
       here, which would have resolved it to `undefined` at the only site that uses it. */
    SOFT_BOOTS_TILES: 1.5,           // [H] extra ground covered while nobody has eyes on you
    /* Two ways a side stops fighting, and they should not look the same.
       A CALLED WITHDRAWAL is the normal one: the captain judges it lost, and the squad
       falls back by bounds — half moving while the other half fires to cover them.
       PANIC is rare and individual: one fighter's nerve goes and they run. */
    WITHDRAW_AT: 0.35,               // [C] share of the squad lost before the order is given
    PANIC_RESOLVE_DIV: 26,           // [C] high resolve almost never breaks
    PANIC_FLOOR: 0.04,               // [C] anyone can break, rarely
    BOUND_SHARE: 0.5,                // [S] how much of a withdrawing squad moves each turn
    EXIT_COLS: 1                     // [S] reaching your own edge takes you off the field
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
  function makeMap(rng, terrain) {
    const dist = C.CONST.COVER_PROFILES[terrain] || C.CONST.COVER_PROFILES.broken_ground;
    const tiles = [];
    for (let y = 0; y < CONST.H; y++) tiles.push(new Array(CONST.W).fill(0));

    /* how much of this ground is worth hiding behind at all, and how good it is */
    const density = 1 - dist[0];                        /* open share inverted */
    const want = CONST.COVER_TARGET[0] + CONST.COVER_TARGET[1] * density * density;
    const pieces = Math.max(4, Math.round(want * CONST.W * CONST.H / 2.5));
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
    const tiles2 = { w: CONST.W, h: CONST.H, tiles };
    for (let i = 0; i < pieces; i++) {
      const ax = P.int(rng, 3, CONST.W - 4), ay = P.int(rng, 1, CONST.H - 2);
      const n = P.int(rng, CONST.CLUSTER_SIZE[0], CONST.CLUSTER_SIZE[1]);
      const grade = gradeOf();
      for (let k = 0; k < n; k++) {
        const x = ax + P.int(rng, -CONST.CLUSTER_SPREAD, CONST.CLUSTER_SPREAD);
        const y = ay + P.int(rng, -CONST.CLUSTER_SPREAD, CONST.CLUSTER_SPREAD);
        if (x < 2 || y < 0 || x >= CONST.W - 2 || y >= CONST.H) continue;
        if (tiles[y][x]) continue;
        if (!runOK(x, y)) continue;
        tiles[y][x] = grade;
      }
    }
    return { w: CONST.W, h: CONST.H, tiles, terrain };
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

  function hasLOS(map, a, b) {
    const k = _key(a.x, a.y, b.x, b.y) * 2 + 1;
    const hit = _geo.get(k);
    if (hit !== undefined) return hit;
    const v = hasLOSRaw(map, a, b);
    _geo.set(k, v);
    return v;
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
    const p = C.hitChance(shooter, victim, bandOf(Math.hypot(shooter.x - spot.x, shooter.y - spot.y)), {}, false)
              * CONST.SHOT_HIT_MULT;
    victim.cover = sc; victim.flanked = sf; victim.x = sx; victim.y = sy;
    victim.repositioning = sr;
    return p;
  }

  /** Can this body do anything to anyone, at any range? Declared here with the other small
      predicates: `shotAt` reads it and threw on the opening shot when it lived further down. */
  function canHurt(c) {
    const w = c.weapon;
    return !!(w && (w.power || 0) > 0);
  }

  function bandOf(d) {
    return d > CONST.BAND_TILE[0] ? 0 : d > CONST.BAND_TILE[1] ? 1 : 2;   // long / medium / short
  }

  /* ---------------------------------------------------------------- */
  /* what anybody actually knows                                       */
  /* ---------------------------------------------------------------- */

  /** How far this fighter can pick a body out of the ground. */
  function sightRange(u) {
    const fc = (u.stats && u.stats.fieldcraft) || 10;
    return Math.max(CONST.SIGHT_MIN, CONST.SIGHT_TILES + (fc - 10) * CONST.SIGHT_FIELDCRAFT);
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
          let have = false;
          for (const u of eyes) {
            if (dist(u, f) > sightRange(u)) continue;
            if (!hasLOS(map, u, f)) continue;
            have = true; break;
          }
          if (have) seen.add(f.id);
          /* fired recently: they know roughly where, not exactly where */
          else if ((f._revealedUntil || -1) >= turn) heard.add(f.id);
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
  function searchPoint(side, map) {
    return side._lastContact || { x: (map.w - 1) / 2, y: (map.h - 1) / 2 };
  }

  /** You fired. Unless you are carrying something quiet, that is a place people now look. */
  function revealByFiring(u, turn) {
    if (C.hasQuirk(u, 'silent') && !u._firedOnce) { u._firedOnce = true; return false; }
    u._firedOnce = true;
    u._revealedUntil = turn + CONST.REVEAL_TURNS;
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
  function deployGap(band) {
    const B = CONST.BAND_TILE;                       /* [long>14, medium>6] */
    if (band === 2) return Math.max(2, Math.round(B[1] * 0.6));
    if (band === 1) return Math.round((B[0] + B[1]) / 2);
    return B[0] + 3;
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
      const reach = Math.max(CONST.DEPLOY_DEPTH, Math.round(Math.min(map.w, map.h) / 2));
      /* YOU DO NOT WALK IN NEXT TO SOMEBODY. Arriving partway through was placed by the same
         rule as deploying at the start — anywhere within reach of a point on the perimeter,
         which on this grid runs nine tiles deep. So a squad that had just marched to the sound
         of shooting could materialise beside a man already in the fight.
         Starting off the edge is how the game says a side was ready and dug in before contact,
         and that reasoning does not survive being applied to somebody who arrives an hour
         later. They come in from outside, so they come in AT the outside: the two bordering
         rows and columns and nowhere else. */
      const band = opts.edgeOnly ? CONST.ARRIVE_EDGE_BAND : 0;
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
    for (let x = x0; x < x0 + CONST.DEPLOY_DEPTH; x++) {
      for (let y = 0; y < map.h; y++) {
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
      u._firedThisExchange = false;
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
    for (const S of sides) {
      for (const w of alive(S.units)) {
        if (!w.overwatch || w.side === mover.side) continue;
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
    let mp = CONST.MOVE_TILES + ((u.weapon && u.weapon.mobility) || 0) * 0.5;
    if (C.hasQuirk(u, 'mob_down')) mp -= CONST.MOB_TILES;
    if (C.hasQuirk(u, 'mob_up')) mp += CONST.MOB_TILES;
    /* SOFT BOOTS — "arrives places without the courtesy of being heard first". Named on the
       suite's own list of hooks read by no system at all, waiting for a spotting model. It
       pays while nobody has eyes on you, which is the only time moving quietly is worth
       anything: once you are seen, the ground you cover is ground people watch you cross. */
    if (unseen && u.hooks && u.hooks.has('unspotted_movement_bonus')) mp += CONST.SOFT_BOOTS_TILES;
    return Math.max(2, mp);
  }

  function candidates(map, taken, u, mp, near) {
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
    target.flanked = cov === 0 && saveCover > 0;     /* they had cover; it does not face you */
    /* Every shot is a ROUND, not a volley. This is the whole argument for the tactical
       model over the abstract one: a magazine now runs out in front of you, an energy
       weapon cooks, and a fighter with neither finishes the fight on a pistol. */
    if (!C.primaryReady(shooter)) {
      if (!shooter.onSidearm && !C.useSidearm(shooter)) { tel.dry++; target.cover = saveCover; target.flanked = saveFlank; return false; }
      if (!shooter._drewFlag) { shooter._drewFlag = true; tel.sidearmDraws++; }
    }
    if (!C.spendShot(shooter, 'shot')) { tel.dry++; target.cover = saveCover; target.flanked = saveFlank; return false; }
    shooter._firedThisExchange = true;
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
    const p = C.hitChance(shooter, target, band,
                          unseen ? { unseen: true } : {}, !!react)
              * (react ? CONST.OVERWATCH_REACT : 1)
              * CONST.SHOT_HIT_MULT;
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
      if (C.hasQuirk(shooter, 'arc_chain')) {
        const near = E.units.filter(f => f !== target && (f.state === 'ok' || f.state === 'light')
                                      && dist(f, target) <= CONST.SUPPRESS_RADIUS);
        if (near.length) {
          const second = near[Math.floor(rng() * near.length)];
          applyHit(rng, second, 'graze', tel, log, shooter, E);
          tel.arcChains = (tel.arcChains || 0) + 1;
        }
      }
      if (C.hasQuirk(shooter, 'crowd_pleaser') && target.state === 'dead') {
        shooter._fameEarned = (shooter._fameEarned || 0) + 1;
        tel.crowdPleaser = (tel.crowdPleaser || 0) + 1;
      }
      if (log) log.push({ t: tel.turn, type: 'hit', by: shooter.id, at: target.id,
                          p: +p.toFixed(3), band, cover: cov,
                          w: (shooter.weapon || {}).name, ammo: shooter.ammo, react: !!react });
      chipCoverFrom(rng, map, shooter, target, tel, log);
      applyHit(rng, target, C.resolveSeverity(rng, shooter, target, S.policy, band, null, tel.turn),
               tel, log, shooter, E);
    }
    /* TEMPO — the extra rounds this weapon puts down for the same action. A reaction shot is
       one round whatever the weapon is: you are firing at movement, not settling into a rate. */
    let extra = react ? 0 : Math.min(CONST.TEMPO_MAX_BURST - 1, (shooter._rateBank || 0) | 0);
    shooter._rateBank = (shooter._rateBank || 0) - extra;
    while (extra-- > 0 && C.spendShot(shooter, 'shot')) {
      tel.shots++; tel.tempoShots = (tel.tempoShots || 0) + 1;
      if (C.isEnergy(shooter) && !shooter.onSidearm) tel.energyShots++;   /* extra rounds count */
      /* EXTRA ROUNDS WERE COUNTED AND NEVER RECORDED. This loop raised `tel.shots` and resolved
         the hit, but wrote no log entry — so a Belt Machine Gun that put four rounds downrange
         appeared in the replay as one, and 366 shots in twenty-five fights existed in the
         telemetry and nowhere a reader could see them. The counter and the record disagreed
         about the same event, and only the counter was ever checked. */
      const tHit = rng() < p;
      chipCoverFrom(rng, map, shooter, target, tel, log);
      if (log) log.push({ t: tel.turn, type: tHit ? 'hit' : 'miss', by: shooter.id, at: target.id,
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
    /* §5.1 — a suppressive weapon suppresses what it fires at whether it hits or not, and the
       heavier tag catches whoever is standing near them. A suppressed fighter on a grid does
       not just aim worse: they will not cross open ground, which is the whole point. */
    if (C.hasQuirk(shooter, 'suppressive') || C.hasQuirk(shooter, 'suppressive_2')) {
      pin(target, tel, rng);
      /* `suppression_output_up` GRANTS the spread rather than merely widening it. Widening was
         the wrong wiring: only `suppressive_2` weapons have a spread to widen, and Trigger Itch
         is carried by people, not guns — the fighter who shoots at movement and shadows is
         mostly holding an ordinary machine gun, which is `suppressive` and pins one man. So the
         hook was live, referenced, and reached almost nothing; the suite measured 4610 against
         4720 and correctly called it noise. Shooting at everywhere you might be is the trait. */
      const spreads = C.hasQuirk(shooter, 'suppressive_2') ||
                      (shooter.hooks && shooter.hooks.has('suppression_output_up'));
      if (spreads) {
        const reach = suppressReach(shooter);
        for (const f of E.units) {
          if (f === target || (f.state !== 'ok' && f.state !== 'light')) continue;
          if (dist(f, target) <= reach) pin(f, tel, rng);
        }
      }
    }
    if (!hit) {
      comp(rng, target, C.CONST.COMP.nearMiss);
      if (log) log.push({ t: tel.turn, type: 'miss', by: shooter.id, at: target.id, p: +p.toFixed(3), band, cover: cov, w: (shooter.weapon||{}).name, ammo: shooter.ammo, react: !!react });
      /* a miss still does something with the right weapon — `cover_shred`, `ricochet` */
      for (const q of C.quirksOf(shooter)) {
        const h = C.QUIRK[q];
        if (h && h.onMiss) h.onMiss(rng, shooter, target, E);
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
    const r = (c.weapon && c.weapon.range) || 'medium';
    if (r === 'long') return CONST.BAND_TILE[0] + 2;
    if (r === 'short') return Math.max(1, Math.round(CONST.BAND_TILE[1] * 0.5));
    return Math.round((CONST.BAND_TILE[0] + CONST.BAND_TILE[1]) / 2);
  }

  /* `rng` and `shooter` are passed so a pin can be REFUSED and so a shooter's arc can be
     widened. Both were unreachable before: pin took neither, so no trait could touch it. */
  function pin(u, tel, rng) {
    if (u.state !== 'ok' && u.state !== 'light') return;
    /* `suppression_bonus` — Smothering Fire. Reads as resistance on the fighter who has it:
       they have been hosed before and know the difference between fire aimed at them and fire
       aimed at where they might be. */
    if (rng && u.hooks && u.hooks.has('suppression_bonus') && rng() < CONST.SUPPRESS_RESIST_P) {
      tel.pinsRefused = (tel.pinsRefused || 0) + 1;
      return;
    }
    u.suppressed = true;
    tel.pins = (tel.pins || 0) + 1;
  }

  /* How far from the mark a shooter's fire reaches. `suppression_output_up` /
     `_down_slight` are the only readers, and this is the only place they are read. */
  function suppressReach(shooter) {
    let r = CONST.SUPPRESS_RADIUS;
    if (shooter.hooks && shooter.hooks.has('suppression_output_up'))   r += CONST.SUPPRESS_OUT_UP;
    if (shooter.hooks && shooter.hooks.has('suppression_output_down_slight')) r -= CONST.SUPPRESS_OUT_DOWN;
    return Math.max(0, r);
  }

  function comp(rng, u, delta) {
    u.comp = Math.max(0, Math.min(100, (u.comp || 60) + delta));
    /* Composure bottoms out around 7 in a hard fight and only touches 0 in the worst of
       them, so gating panic on exactly zero made it a dead mechanism rather than a rare one.
       It is checked from the `rattled` band down, and resolve still decides it. */
    if (u.comp <= C.CONST.COMP_BANDS.rattled && u.state !== 'panicked' && rng) {
      const res = (u.stats && u.stats.resolve) || 10;
      /* how far past rattled they are, times how badly their resolve is failing them */
      const depth = (C.CONST.COMP_BANDS.rattled - u.comp) / C.CONST.COMP_BANDS.rattled;
      const p = Math.max(CONST.PANIC_FLOOR, 1 - res / CONST.PANIC_RESOLVE_DIV) * depth * 0.5;
      if (rng() < p) { u.state = 'panicked'; u._panic = true; }
    }
  }
  function moraleShock(rng, side, unit, kind) {
    const K = C.CONST.COMP;
    for (const m of side.units) {
      if (m === unit || (m.state !== 'ok' && m.state !== 'light')) continue;
      comp(rng, m, kind === 'dead' ? K.mateDown : K.mateDown * 0.6);
      if (unit.isCaptain) comp(rng, m, K.captainDown);
    }
  }
  /**
   * The captain calls it. Past a threshold of loss the squad is ordered back — and an ordered
   * fallback is not a rout: they go by bounds, half the squad moving while the other half
   * keeps firing to cover them, and they leave the field rather than milling at the edge.
   */
  function checkWithdraw(S) {
    if (S.withdrawing) return true;
    const total = S.units.length;
    const gone = S.units.filter(u => u.state !== 'ok' && u.state !== 'light').length;
    if (gone / total >= CONST.WITHDRAW_AT) { S.withdrawing = true; return true; }
    return false;
  }
  const stillFighting = (S) => S.units.filter(u => u.state === 'ok' || u.state === 'light').length;
  /** Nobody left on the field: dead, down, panicked away or withdrawn off the edge. */
  function finished(S) { return stillFighting(S) === 0; }

  /** Canon severity bands, canon injury table; only the bookkeeping is local. */
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
    const dmg = t._sevRoll != null ? C.damageOf(t._sevRoll) : C.CONST.DMG_MIN;
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
    /* the pool is out. Whether they are down or gone is how far past empty the round carried,
       and a round the bands called outright fatal still is. */
    /* `nonlethal` FIRES HERE, BEFORE the fatal branch — it was written below a `return`
       further down this function, where it could never run: a stun round emptied a pool
       and the grid called it a death anyway, so the Dividend killed 39 people across 32
       matches while a counter reported the safety net firing. Step 7.5's lesson twice
       over: the tag reached the grid, the grid never reached the tag. */
    if (C.hasQuirk(by, 'nonlethal')) {
      if (sev === 'killed') { sev = 'critical'; tel.stunned = (tel.stunned || 0) + 1; }
      t._stunnedDown = true;
      t.hp = Math.max(t.hp, -C.CONST.HP_OVERKILL + 1);   /* stunned, not overkilled */
    }
    if (sev !== 'killed' && t.hp > -C.CONST.HP_OVERKILL) {
      t.state = 'down';
      t._killedBy = by;
      /* what put them down, for the recovery roll at the end of the fight */
      t._downSev = sev;
      t.injury = C.rollInjury(rng, t, sev);
      tel.down++;
      if (side) moraleShock(rng, side, t, 'down');
      if (log) log.push({ t: tel.turn, type: 'down', by: by.id, at: t.id, sev, dmg: dmg,
                          react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo });
      return;
    }
    t.state = 'dead'; tel.dead++;
    if (side) moraleShock(rng, side, t, 'dead');
    if (log) log.push({ t: tel.turn, type: 'killed', by: by.id, at: t.id, dmg: dmg,
                        react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo });
    return;
    /* the `nonlethal` conversion MOVED UP, above the fatal branch, where it can run. */
    if (sev === 'graze') { tel.grazes++; comp(rng, t, K.graze); if (log) log.push({ t: tel.turn, type: 'graze', by: by.id, at: t.id, react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo }); return; }
    if (sev === 'light') { t.state = 'light'; tel.light++; comp(rng, t, K.light);
      if (log) log.push({ t: tel.turn, type: 'light', by: by.id, at: t.id, react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo }); return; }
    if (sev === 'killed') {
      t.state = 'dead'; tel.dead++;
      if (side) moraleShock(rng, side, t, 'dead');
      if (log) log.push({ t: tel.turn, type: 'killed', by: by.id, at: t.id, react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo });
      return;
    }
    t.state = 'down';
    t._killedBy = by;                    /* so rollInjury can see the round that did it */
    t.injury = C.rollInjury(rng, t, sev);
    tel.down++;
    if (side) moraleShock(rng, side, t, 'down');
    if (log) log.push({ t: tel.turn, type: 'down', by: by.id, at: t.id, sev, react: !!by._reacting, w: (by.weapon||{}).name, ammo: by.ammo });
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
  function resolve(rng, A, B, ctx) {
    let sides;
    if (Array.isArray(A)) { sides = A.slice(); ctx = B; }
    else { sides = [A, B]; }
    ctx = ctx || {};
    const map = ctx.map || makeMap(rng, ctx.terrain || 'broken_ground');
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
      /* BEARINGS ONLY WHEN THERE IS SOMETHING TO SAY. With two sides and no bearings supplied
         this is the original left/right deployment, unchanged, so the fixed-seed snapshots
         still describe the fight they were recorded from. */
      const useBearing = bearings && bearings[i] != null && (sides.length > 2 || ctx.forceBearings);
      deploy(rng, map, S.units, i, prep[i] == null ? 0.5 : prep[i], gap,
             { taken: taken, bearing: useBearing ? bearings[i] : null, flanked: !!flanked[i] });
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
                  vents: 0, chargeOut: 0, energyShots: 0,
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
      hp: u.hp, hpMax: u.hpMax, kn: knownOf(u, si),
      name: u.ref && u.ref.name
    });
    const snap = () => frames.push({
      turn: tel.turn,
      units: sides.flatMap((S, si) => S.units.map(u => unitRec(u, si)))
    });
    tel.first = first;
    tel.openingBand = openingBand;
    snap();

    /* Initiative, not sides. One side acting then the other gave the first mover a 55%
       edge with identical rosters — a structural advantage nothing in the game was meant to
       confer. A round is now every fighter in one order, fastest first, so being ready
       shows up as acting early rather than as belonging to the lucky team. */
    const initiative = (u) => (u.stats.reflex || 10) * 1.6 + (u.stats.tactics || 10) * 0.5
                            + (prep[u.side] || 0.5) * 6;

    for (tel.turn = 1; tel.turn <= CONST.MAX_TURNS; tel.turn++) {
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
          /* MOTION WEARS OFF WHEN YOUR TURN COMES ROUND. Being caught mid-move only means
             anything while the other side is shooting, which is exactly the window between
             your move and your next activation. Cleared here alongside the other per-turn
             flags rather than at end of turn, so it lasts the whole of the enemy's turn —
             which is the mistake `suppressed` makes, clearing for everyone simultaneously and
             expiring on half the people it was applied to before they ever act. */
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

          const homeX = si === 0 ? 0 : map.w - 1;
          /* Panicked: no shooting, no thinking, straight for the edge and off the field. */
          if (u.state === 'panicked') {
            const dir = si === 0 ? -1 : 1;
            for (let s = 0; s < CONST.MOVE_TILES + 2; s++) {
              const nx = u.x + dir;
              if (blocked(map, nx, u.y) || !freeTile(occupancy(sides), u, nx, u.y)) break;
              u.x = nx;
            }
            triggerOverwatch(rng, u, sides, map, tel, log);
            if (Math.abs(u.x - homeX) <= CONST.EXIT_COLS) { u.state = 'fled'; tel.fled++; }
            continue;
          }

          /* Ordered fallback: bounds. Half the squad moves while the other half shoots to
             cover them, and they swap over each turn. This is what makes a withdrawal read
             differently from a rout — it is still a fight, just one going backwards. */
          if (S.withdrawing) {
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
              const dir = si === 0 ? -1 : 1;
              /* GOING BACKWARDS STILL MEANS GOING ROUND THINGS. This stepped strictly along x
                 and broke at the first obstruction, with no lateral option at all — so a
                 fighter with a wall or a squadmate directly behind them was stuck on that tile
                 for the rest of the fight, and on a map that is 11% cover with twelve bodies on
                 it that is most of them. Measured: 0.93 fighters a fight ever reached their own
                 edge, 6.1 of 12 were still standing when the clock stopped it, and 31 of 80
                 fights ran to the turn cap.
                 A step aside costs the same as a step back, which is why it is tried in the
                 same budget rather than given its own. */
              for (let s = 0; s < CONST.MOVE_TILES; s++) {
                const occ = occupancy(sides);
                const nx = u.x + dir;
                let moved = false;
                for (const dy of [0, -1, 1]) {
                  const ny = u.y + dy;
                  if (ny < 0 || ny >= map.h) continue;
                  if (blocked(map, nx, ny) || !freeTile(occ, u, nx, ny)) continue;
                  u.x = nx; u.y = ny; tel.moves++; moved = true; break;
                }
                if (!moved) break;
              }
              if (fog) { sides[0]._fog.dirty = true; ensureSpot(S); }
              triggerOverwatch(rng, u, sides, map, tel, log);
              if (u.state !== 'ok' && u.state !== 'light') continue;
              if (Math.abs(u.x - homeX) <= CONST.EXIT_COLS) { u.state = 'withdrawn'; tel.withdrawn++; continue; }
              u.ap--;
            }
            /* covering fire: whether you moved or not, you shoot back */
            let cover = null, bestp = 0;
            for (const f of foes) {
              if (!hasLOS(map, u, f)) continue;
              const cov = coverAgainst(map, f, u);
              const sc = f.cover, sf = f.flanked;
              f.cover = cov; f.flanked = cov === 0 && sc > 0;
              const p = C.hitChance(u, f, bandOf(dist(u, f)), {}, false) * CONST.SHOT_HIT_MULT;
              f.cover = sc; f.flanked = sf;
              if (p > bestp) { bestp = p; cover = f; }
            }
            if (cover) { shoot(rng, u, cover, map, S, E, tel, log); tel.coveringFire++; }
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
            f.cover = cov; f.flanked = cov === 0 && sc > 0;
            const p = C.hitChance(u, f, bandOf(dist(from, f)), {}, false) * CONST.SHOT_HIT_MULT;
            f.cover = sc; f.flanked = sf;
            return p;
          };
          /* Between shots: a half-rate weapon spends this turn cycling the action. They can
             still move and still watch — they simply have nothing to fire. */
          /* `spool` — the catalog's own words: it cannot fire on the first turn of contact.
           `chill` — a hit last turn costs you this one's movement, not your shot. */
        if (u._chilled) { u._chilled = false; u._noMove = true; } else u._noMove = false;
        if (C.hasQuirk(u, 'spool') && tel.turn === 1) { if (u.ap > 0) { u.overwatch = true; u.ap = 0; } continue; }
        if (u._skipNext) {
            if (u.ap > 0) { u.overwatch = true; u.ap = 0; }
            continue;
          }
          /* ---- GOING BACK FOR THE WOUNDED --------------------------------------------
             `hasMedkit` was handed to this resolver and read by NOTHING: a squad that bought
             medical kit and a squad that did not fought identical fights, and a downed
             fighter's only route to survival was the post-engagement recovery roll. The
             abstract model has had this since Step 3.
             Crossing open ground to a dying man is the most dangerous thing anybody does here,
             so it costs the action, strips cover for the turn, and draws overwatch — the same
             ruling that stopped a death-or-glory squad saving more of its wounded than a
             careful one, because treating used to be free. */
          const hurt = S.units.filter(m => m.state === 'down' && !m._beingTreated);
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
                     + C.CONST.TREAT_FIELDCRAFT * (u.stats.fieldcraft - 10);
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
            const grenade = u.carried.indexOf('itm_frag_grenade') >= 0 ? 'itm_frag_grenade'
                          : u.carried.indexOf('itm_incendiary_charge') >= 0 ? 'itm_incendiary_charge'
                          : null;
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
                const hot = grenade === 'itm_incendiary_charge';
                const save = u.weapon;
                u.weapon = { power: C.CONST.GRENADE_POWER, range: u.weapon.range, tier: 3,
                             damage: 'explosive', name: hot ? 'Incendiary Charge' : 'Frag Grenade',
                             tags: hot ? ['area', 'incendiary'] : ['area'] };
                let caught = 0;
                for (const g of foes) {
                  if (g.state !== 'ok' && g.state !== 'light') continue;
                  if (dist(g, mark) > CONST.GRENADE_RADIUS) continue;
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

            /* Resupply. An empty rifle is the commonest way a fighter stops mattering, and a
               satchel sitting in their kit while they draw a pistol is the system not running. */
            const pack = C.isEnergy(u) ? 'itm_power_cell' : 'itm_ammo_satchel';
            const low = C.isEnergy(u) ? u.charge <= 1 : u.ammo <= CONST.RESUPPLY_AT;
            if (low && u.carried.indexOf(pack) >= 0) {
              u.carried.splice(u.carried.indexOf(pack), 1);
              if (C.isEnergy(u)) u.charge += CONST.RESUPPLY_CHARGE;
              else u.ammo += CONST.RESUPPLY_ROUNDS;
              if (u.onSidearm && C.primaryReady(u)) C.backToPrimary(u);
              u.ap--;
              tel.consumables = (tel.consumables || 0) + 1;
              tel.resupply = (tel.resupply || 0) + 1;
              if (log) log.push({ t: tel.turn, type: 'resupply', by: u.id, w: pack });
              if (u.ap <= 0) continue;
            }
          }

          /* ---- COVERING FIRE ------------------------------------------------------------
             `SUPPRESS_AP` has been declared since Step 5 and read by nothing, in both
             resolvers. The abstract model at least had a suppress ACTION; the grid only ever
             suppressed as a side effect of shooting at somebody, so a machine gun could hold
             down exactly the one person it was already trying to hit.
             That is not what the weapon is for. Measured, adding machine guns to a line made
             it WORSE — the enabler failing the only test that could vindicate it — and this is
             most of why: a gun whose job is holding an arc down could only ever hold down one
             body at a time, and only by trying to kill it.
             Covering fire spends an action and three rounds, kills nobody, and puts everyone
             near the mark on the ground. It is taken when it pins more people than the shot
             would have hurt, which is a decision the shooter can actually evaluate. */
          if (u.ap > 0 && (C.hasQuirk(u, 'suppressive') || C.hasQuirk(u, 'suppressive_2'))) {
            let bestMark = null, bestCount = 0;
            for (const f of seen) {
              let n = 0;
              for (const g of foes) {
                if (g.state !== 'ok' && g.state !== 'light') continue;
                if (g.suppressed) continue;
                if (dist(g, f) <= suppressReach(u)) n++;
              }
              if (n > bestCount) { bestCount = n; bestMark = f; }
            }
            if (bestMark && bestCount >= CONST.COVERING_FIRE_MIN &&
                C.spendShot(u, 'suppress')) {
              /* the deliberate covering-fire action is the SECOND place a pin happens, and it
                 read the bare constant — so a fighter's arc widened when they suppressed as a
                 side effect of shooting and not when they chose to hold ground down, which is
                 the case the trait is named for. Both sites read `suppressReach` now. */
              const reach = suppressReach(u);
              for (const g of foes) {
                if (g.state !== 'ok' && g.state !== 'light') continue;
                if (dist(g, bestMark) <= reach) pin(g, tel, rng);
              }
              tel.coveringFire++;
              u.ap -= CONST.SUPPRESS_AP;
              if (log) log.push({ t: tel.turn, type: 'covering', by: u.id, at: bestMark.id,
                                  n: bestCount, w: (u.weapon || {}).name, ammo: u.ammo });
              if (u.ap <= 0) continue;
            }
          }

          /* DECLARED HERE, above the first thing that uses it. It was first declared beside the
             movement block, which reads naturally and is forty lines too late: target selection
             happens before movement, so the tap threw a ReferenceError on the opening shot of
             the first fight. Caught by running it, not by reading it. */
          const tap = ctx._scoreTap || null;
          let target = null, pNow = 0;
          const pickRows = tap ? [] : null;
          for (const f of seen) {
            const raw = shotAt(u, f);
            const p = raw + (f.state === 'light' ? CONST.FINISH_WOUNDED : 0);
            if (pickRows) pickRows.push({ id: f.id, raw: raw, light: f.state === 'light' });
            if (p > pNow) { pNow = p; target = f; }
          }
          if (tap && tap.pick && pickRows && pickRows.length)
            tap.pick(pickRows, target ? target.id : null);

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
            : searchPoint(S, map);
          if (tap) tap.rows = [];
          let move = null;
          /* am I currently unseen? decides Soft Boots. Declared out here rather than inside
             the scoring block because the dash below is a second movement decision in the same
             turn and needs the same answer — scoped tight, it threw a ReferenceError at the
             dash on the first fight run, which is the cheap version of this mistake. */
          const meUnseen = fog && !!(E._seen) && !sideKnows(E, u);
          if (meUnseen && u.hooks && u.hooks.has('unspotted_movement_bonus')) tel.softBootsMoves++;
          {
            const spots = candidates(map, taken, u, moveTilesFor(u, meUnseen), near);
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
              let threat = 0;
              for (const f of foes) {
                if (!hasLOS(map, f, spot)) continue;
                threat += incoming(f, u, spot, map);
              }
              const bandOff = Math.abs(Math.hypot(x - near.x, y - near.y) - wantTiles(u));
              const val = bestP * CONST.SHOT_WEIGHT - threat * CONST.THREAT_WEIGHT
                        - bandOff * CONST.BAND_PULL;
              /* SCORE TAP — inert unless a caller supplies one, and no caller in the game does.
                 It exists so an audit can ask whether a term in this decision actually CHANGES
                 the decision: drop the term, recompute the ranking, see if the same tile still
                 wins. A term that fires constantly and flips nothing is decorative, which is
                 what `overwatch` turned out to be. Recomputing outside the engine would mean
                 reimplementing this formula and measuring the reimplementation. */
              if (tap) {
                /* enough to ask the flanking question afterwards: what cover would I have
                   standing here, and would my best shot from here be round the side of theirs? */
                let ownCov = 0;
                for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                  const cc = at(map, x + ox, y + oy);
                  if (cc > ownCov) ownCov = cc;
                }
                tap.rows.push({ x, y, p: bestP, threat, bandOff, ownCov: ownCov,
                                flanks: !!(tgt && tgt.cover > 0 &&
                                           coverAgainst(map, tgt, { x: x, y: y }) === 0) });
              }
              if (!move || val > move.val) move = { x, y, val, p: bestP, tgt, threat };
            }
          }

          let stayThreat = 0;
          for (const f of foes) { if (hasLOS(map, f, u)) stayThreat += incoming(f, u, u, map); }
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
          if (tap) {
            tap.emit(tap.rows, { p: pNow, threat: stayThreat, bandOff: stayBandOff },
                     moveGate, move, u);
            tap.rows = [];
          }
          if (move && move.val > stayVal + moveGate && (move.x !== u.x || move.y !== u.y)) {
            const strippedCover = target ? coverAgainst(map, target, u) : 0;
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
              const far = candidates(map, occupancy(sides), u, moveTilesFor(u, meUnseen), near);
              let rush = null;
              for (const cand of far) {
                if (cand.x === u.x && cand.y === u.y) continue;
                let best = 0;
                for (const f of foes) {
                  if (!hasLOS(map, { x: cand.x, y: cand.y }, f)) continue;
                  const cov = coverAgainst(map, f, { x: cand.x, y: cand.y });
                  const sc = f.cover, sf = f.flanked;
                  f.cover = cov; f.flanked = cov === 0 && sc > 0;
                  const p = C.hitChance(u, f, bandOf(dist(cand, f)), {}, false) * CONST.SHOT_HIT_MULT;
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
                let dThreat = 0;
                for (const f of foes) {
                  if (!hasLOS(map, f, { x: cand.x, y: cand.y })) continue;
                  dThreat += incoming(f, u, { x: cand.x, y: cand.y }, map);
                }
                const val = best * CONST.SHOT_WEIGHT
                          - dThreat * CONST.THREAT_WEIGHT * CONST.DASH_THREAT_SHARE
                          - Math.abs(Math.hypot(cand.x - near.x, cand.y - near.y) - wantTiles(u))
                            * CONST.BAND_PULL;
                if (!rush || val > rush.val) rush = { x: cand.x, y: cand.y, val: val, p: best };
              }
              let hereThreat = 0;
              for (const f of foes) { if (hasLOS(map, f, u)) hereThreat += incoming(f, u, u, map); }
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

          if (!target) {
            if (u.ap > 0) { u.overwatch = true; u.ap = 0; }
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
              units: sides.flatMap((SS, ssi) => SS.units.map(x => unitRec(x, ssi)))
            });
          }
        }
      }
      /* Between rounds: heat bleeds off, vents tick down, hands go back to the rifle, and every
         weapon banks another turn's worth of its rate of fire.
         `coolWeapons` was described in this comment and never called — so on the grid an energy
         weapon's heat never shed, a vent never ticked down, and nobody ever came off the sidearm
         once they were on it. Prose describing work that was not done. */
      for (const S of sides) C.coolWeapons(S);
      /* `mobile_cover` — a gun heavy enough to be a wall. Dearest tag in the catalog and it
         granted nothing until now, on either resolver. */
      for (const S of sides) for (const u of S.units) {
        if (C.hasQuirk(u, 'mobile_cover')) u.hooks.add('mobile_cover_provider');
        u._rateBank = (u._rateBank || 0) + (C.tempoOf(u) - 1);
        if (u._rateBank < 0) { u._skipNext = true; u._rateBank += 1; } else u._skipNext = false;
        u.suppressed = false;                      /* pinning lasts until your next turn */
      }
      /* THIS WAS A SECOND COPY OF `coolWeapons`, RUNNING RIGHT AFTER IT. The line above was
         added to fix cooling never happening at all; the inline workaround it replaced was left
         behind, so every exchange cooled TWICE. Worse than twice: `coolWeapons` clears
         `_firedThisExchange` on its way out, so the second pass saw every weapon as idle and
         shed heat from guns that had just fired. Vents ticked down at double rate for the same
         reason.
         The effect was that heat could not reach a cap — 6 against a cap of 12 was the highest
         any fighter reached in 3,102 shots — so no weapon ever vented on the grid, and the
         sidearm-swap that hangs off venting never fired either. A whole mechanism, live in the
         catalog and dead in the game.
         What is kept is the one thing `coolWeapons` does NOT do: it returns early on
         non-energy units, so their fired-flag needs clearing here or it stays set for ever. */
      for (const S of sides) for (const u of S.units) {
        if (!C.isEnergy(u)) u._firedThisExchange = false;
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
      return (!live && !away) || gone / S.units.length >= C.CONST.ROUT_SQUAD_FRACTION;
    });

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

  const api = { CONST, makeMap, resolve, hasLOS, coverAgainst, bandOf, at };
  if (isNode) module.exports = api;
  global.CDTACTICAL = api;
})(typeof window !== "undefined" ? window : globalThis);
