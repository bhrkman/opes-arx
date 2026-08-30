# Branch: fog of war

**One step. Build a spotting model for the combat grid, and nothing else.**

## Why this one

Squads bunch up around one piece of cover and stop moving, and every attempt to fix that by
tuning has failed. The cause is structural rather than a bad weight: both sides deploy in full
view of each other at a fixed opening distance, cover is permanent, so once you are behind good
ground there is no better ground and the movement scorer is *correct* to tell everyone to sit.
Fog changes what a turn is for — from "find a marginally better angle on somebody I can already
see" to "find out where they are before they find me." It also gives overwatch a purpose it
currently lacks, and restores the original written job of the `silent` quirk, which reads
"first shot does not break unspotted status" and has been waiting on exactly this.

## Read this much and no more

`docs/PROJECT.md` first — it is the only document and it holds what was decided and what was
rejected. Then `sim/tactical.js` (the grid) and `sim/combat.js` (the shared library). You will
need `sim/divide.js` only where the contest hands a fight its context.

**Do not read `season.js`, `sponsors.js`, `reputation.js`, `negotiate.js` or `ledger.js`.** None
of them touch the grid, and reading them is how the last attempt spent a third of its budget
before doing anything.

## Play it before touching it

```
viewers/the_firefight.html   one engagement on the grid, turn by turn, live engine in the page
viewers/the_ground.html      the whole contest drawn: terrain, the closing wall, squads
```

The fault this project keeps producing is not broken code — it is code wired to a condition that
never becomes true, and it is only ever found by running the thing and measuring it. The suite
catches regressions and cannot catch absences. It stayed green through a bounding withdrawal
that had **never executed once** in the project's history.

## The gate

```
cd sim
node arx.cjs regress --fast     111 checks, ~3 min here. Live in it.
node audit_open.cjs             what is actually built, tested by running the game
node audit_docs.cjs             does the document still agree with the code
node audit_cross.cjs            dead constants, undeclared reads, uncalled functions, dead wires
```

Background long runs as `nohup timeout N node ... &`, or a killed process reads as a slow one.

Five fixed-seed snapshot fights are the one baseline that must move deliberately. If they move,
say why in the report; do not bless them while any other number is unexplained.

## The four rules

1. **Measure through a full contest.** Isolated fights are for proving one mechanism by
   construction, never for judging whether something works. An audit of dead mechanisms reported
   twelve on isolated fights and two through contests; ten were the test's fault.
2. **After any scripted edit, check the file actually changed.** Two patches silently failed to
   write in one session and success was reported off the build message.
3. **Before believing a zero, check the counter is not NaN and the branch actually executes.**
   Five counters have been lost to `undefined += n`. A correct fix was abandoned because of one.
4. **Anything that measures as no change comes back out.**

## What already exists, so it is not rebuilt

- Line of sight (`hasLOS`) and directional cover (`coverAgainst`), both live and heavily used.
- Overwatch, suppression, and an `ambushed` counter keyed to a readiness gap between sides.
- `SIGHT_RANGE: 0.105` in `divide.js` — how far a squad can be noticed **on the world map**.
  There is no equivalent on the grid.
- The `silent` quirk, carried by four items, currently read only for how far a firefight is heard.

## The first questions, in order

1. What does a fighter know? Per-fighter sight, or squad-wide — X-COM's squad sight is why a
   scout is worth having.
2. What does being unspotted buy? An ambush on first contact, a movement bonus, both?
3. How does a fight open when neither side knows the other is there? The opening band is
   currently handed in from the contest.
4. Does the arriving-mid-fight squad arrive unspotted? It now enters at the map edge on its own
   bearing, which makes this a real question rather than a cosmetic one.

## What to send back

About ten lines: what changed, what you measured before and after, what you found dead, and what
you reverted. Plus the rebuilt `the_firefight.html` — fog is not judgeable from numbers, and if
nobody can watch a squad be unseen then it has not been demonstrated.
