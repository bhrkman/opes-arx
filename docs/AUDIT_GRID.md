# Grid audit

What the grid claims, and whether the claim is real. Three layers, three different methods,
because a thing can fail in three different places and only the first is visible by reading.

| layer | question | method | state |
|---|---|---|---|
| 1 | **Is it written?** | static: does anything read it, does anything write it | **done** |
| 2 | **Does it ever fire?** | full contests, with a positive control that makes it fire on purpose | not started |
| 3 | **Does anyone react to it?** | ablation: switch the term off, replay identical fights, count decisions that flip | not started |

A Layer 1 pass is an **upper bound on liveness**, never evidence of it. A read inside a branch
that never becomes true still counts here as a read. `spotted` passed Layer 1 for months.

Regenerate layer 1 with `node sim/audit_layer1.cjs`.

---

## Layer 1 results

### Constants — 106 declared, **19 read by nothing**

Verified there is no computed access (`CONST[...]`) anywhere in the tree, so these are not
false positives from dynamic lookup.

`TILE_METRES` · `SUPPRESS_MIN_P` · `BOUND_SHARE` (tactical) — `EXCHANGE_CAP` ·
`STALEMATE_EXCHANGES` · `SUPPRESS_WEIGHT` · `OVERWATCH_WEIGHT` · `COVER_POSITIONS_PER_FIGHTER` ·
`COVER_IMPROVE_P` · `COVER_SUPPRESSED_DEGRADE_P` · `BAND_COMP_DRAIN` · `BAND_SHIFT_AGREED` ·
`BAND_SHIFT_CONTESTED` · `BAND_OPEN_UNDER_FIRE` · `CROSS_COST_P` · `SUPPRESS_PIN` ·
`ARC_CHAIN_FRAC` · `MOB_STEP` · `BAND_CLOSE_BIAS` (combat)

Several read as leftovers from the abstract exchange-based resolver rather than the grid.
That is a guess and is exactly what Layer 2 exists to settle — **do not delete any of these on
the strength of this table.**

### State the shot calculation branches on

| flag | written by the game | note |
|---|---|---|
| `flanked` | 13 | live, but **inert by construction** — see the comment in `incoming` |
| `suppressed` | 2 | live; true on ~32% of shot evaluations in a real contest |
| `spotted` | 2 | live as of the fog step; was read-by-two/written-by-none before it |
| `_bulwarked` | **0** | Olmac walking-bulwark trait |
| `_crossed` | **0** | the 1.30 penalty for sprinting across open ground |
| `repositioning` | **0** | the 1.15 penalty for having just moved |
| `hovering` | **0** | |
| `treating` | **0** | §3.7, "the most dangerous thing in a firefight" |
| `exposed` | **0** | **written only by `arx.cjs`** — the suite has a passing test for a state the game never creates |

`exposed` is the sharpest single finding of this pass: a green check standing over a dead
mechanism is worse than no check, because it reads as coverage.

**`_crossed` and `repositioning` have since been wired** — see PROJECT.md. The warning attached
to them here, repeated across several sessions, was that fixing them would make bunkering worse.
**It was wrong.** Measured six contests each way with real kit: movement per body-turn 39.5% →
41.5%, clock-outs 12 → 12, permanent losses −0.5%. The warning was reasoning, not measurement,
and it was stated with more confidence than reasoning earns.

### Weapon and kit tags — 32 declared, **1 read by nothing**

`daylight` (Solar Accumulator Rifle). Agrees with the suite.

### Trait hooks — 140 declared, **62 read by nothing**

The suite formally tracks 21 of these on its inert list. The other ~41 are mostly event seeds
and career flavour — `abolitionist_event_seed`, `pension_story`, `salary_anchoring_up` — which
appear to await systems that were never built rather than being broken. Confirmed that hooks are
not named in any data file outside `traits.json`, and that the one generic lookup (`corpHasHook`)
is called with literal names, so a per-name search does not miss them.

---

## Two errors this pass made, and what they cost

Recorded because the method matters more than the table.

**Tags: reported 11 of 32 dead, against the suite's 3. The suite was right.** Tags are dispatched
through a lookup table whose keys are the tag names written bare — `pierce_1: { ... }` — so not
one appears in quotes anywhere. The check counted quoted occurrences and so measured an
assumption about how dispatch is written. Fixed by counting bare keys and dotted access too.
**Where this audit disagrees with the suite, check this audit first.**

**Flags: reported `exposed` as written, which was true and misleading.** Its only writer is the
test suite. Game code and test code are now counted separately, because "something writes it" and
"the game writes it" are different claims and only the second one matters.

---

## Layer 2 results

Two full contests, real kit, no synthetic fights anywhere in `audit_layer2.cjs` by design. Both
instruments were proved inert before use: a contest run with and without each produced identical
dead, career-ended, engagement and day counts.

### A telemetry counter reporting a confident zero — FIXED

`energyShots` was **declared and never incremented.** One contest: 363 bodies carried energy kit,
585 weapons vented, 57 ran out of charge — and the counter reported 0. The comment beside it
records that this counter and its two neighbours were once missing from the telemetry object and
were added back; `vents` and `chargeOut` were reconnected and this one was not. A live zero of the
third kind: not unreachable, not NaN, simply never raised — and the hardest of the three to spot,
because the counter looks perfectly healthy where it is declared.

**Fixed**, at both shot sites (the aimed shot and the tempo extra rounds; a fighter on a sidearm
is firing a conventional weapon whatever their primary is). Positive control, same contest that
previously reported nought: **1,108 energy shots, 14.7% of all shots**, against 24.9% of bodies
carrying energy kit — a sane minority, since venting and charge limits mean those weapons fire
less than their carrier share. Behaviour unchanged (all nine outcome integers identical) and the
gate is green at 114/114.

### Weapon and kit tags — 20 live, **2 reach nothing**

`emp` (Ion Carbine, 8 carriers) and `area` (grenade launchers, 3 carriers). Agrees exactly with
the suite. `daylight` was carried by nobody in two contests, which is a statement about the
sample, not the game.

`crowd_pleaser` is asked **3,735 times and is never once true** — but it has four carriers and is
asked at a kill, of the killer. Four fighters may simply never have killed anybody. **Needs a
positive control before anyone calls it broken.**

### Trait hooks — 56 fire, **63 are carried and never asked about**

Trustworthy from the first run, because hooks are read through `Set.prototype.has` and patching a
prototype catches internal callers too. Real fighters carry these and nothing consults them:

| hook | carriers | trait |
|---|---|---|
| `loyalty_cap_reduced`, `delicacy_harvest_friction`, `cradle_camp_event_seed` | 204 each | Cradleborn Resentment |
| `cohesion_morale_bonus_near_squadmates` | 182 | Deck-Raised |
| `performance_tracks_odds_board` | 145 | Odds Watcher |
| `morale_swings_damped` | 126 | Stoic |
| `remembers_grudges`, `refuses_grudged_corps`, `morale_up_vs_grudge_target` | 116 each | Grudge Holder |
| `night_ambush_warning_bonus` | 106 | Light Sleeper |
| `follows_bad_orders`, `poach_resistant` | 105 each | Loyal to a Fault |

…and 50 more. **Cradleborn Resentment is carried by 204 fighters and does nothing at all** — all
three of its hooks are on this list, as are both of Grudge Holder's and both of Loyal to a Fault's.
Most of the remainder are event seeds awaiting systems that were never built, which is a different
problem from a broken wire and should not be filed as one.

Six hooks are asked and never true: `fame_gain_up_on_aggression` and `crowd_legible_savagery`
(1 carrier, asked 2,186 times), `succession_candidate_priority` (25 carriers, 348 asks),
`refuses_betrayal_orders`, `cede_loyalty_morale_penalty_major`, `sponsor_drop_handling_bonus`.
Low carrier counts make several plausibly just unlucky; each needs its own positive control.

### The methodological lesson, which outlasts the table

**A tag reaches the game by three separate routes** — the direct question, the `QUIRK` handler
table, and `CONST.TEMPO`, which is keyed by tag name and touched by neither of the others.
Watching one route at a time, this audit reported **11 dead, then 6, then 4. The true figure is 2.**
Every intermediate answer was confident and wrong.

**Wrapping an exported function misses the calls a module makes to itself.** `combat.js` calls its
own `hasQuirk`, so an instrument on the export never sees it — 76,408 calls in two contests went
unobserved. What works is instrumenting the DATA rather than the function: a Proxy on the tag
array catches every reader, internal or not, because nobody can ask the question without going
through that array. Prototype patching works for the same reason, which is why the hook numbers
were sound from the first run while the tag numbers took three attempts.

**The suite has now been right three times where this audit was wrong.** Its per-site, narrowly
matched method is the thing to start from.

---

## Layer 3 results

Ablation, one full contest, **5,853 real decisions**. At each decision the tap hands the probe the
whole candidate set with its component scores; the probe re-ranks with one term removed and asks
whether the fighter would have done something else. **The game is never altered**, so the fights do
not diverge and every decision compared is the same decision — unlike changing a constant and
running two seasons, which compares two different worlds and drowns the signal.

The tap is inert unless a caller supplies one, and no caller in the game does. Verified: all nine
outcome integers identical to the gate-green baseline with the tap present.

| remove this term | decisions that change | direction |
|---|---|---|
| incoming fire at the tile | **2,764 (47.2%)** | 1,069 moved instead, 360 stayed, 1,335 went elsewhere |
| pull toward preferred range | **2,011 (34.4%)** | 228 moved, 911 stayed, 872 elsewhere |
| the cost of standing up | **988 (16.9%)** | 988 moved instead, 0 stayed |
| the shot available from the tile | **819 (14.0%)** | 257 moved, 160 stayed, 402 elsewhere |
| the pinned surcharge only | **242 (4.1%)** | 242 moved instead, 0 stayed |

**Every term in the movement decision is load-bearing.** Nothing here is decorative, which is the
first clean bill of health this audit has produced.

Two sanity checks the method passes: removing the cost of standing up produces *only* extra
movement and never less, and so does removing the pinned surcharge. A term whose removal pushed
the decision both ways would have meant the probe was re-ranking something it had misunderstood.

**Threat dominates.** Nearly half of all decisions turn on how dangerous the destination is, and
it is worth three times the shot available there. So the movement scorer is overwhelmingly a
safety calculation with a small offensive correction — which is why the exposure change moved
behaviour (it feeds threat) and why nerfing overwatch did nothing (it feeds nothing).

**Being pinned accounts for 4.1% of decisions.** Real, and much smaller than the earlier framing
of suppression as a likely cause of the firing lines. The eightfold move-margin sounds decisive
and reaches one decision in twenty-four.

### Target selection — the most influential unnamed number in the grid

One contest, **5,348 aimed shots**, 84.8% of them with more than one body to choose between.

A fighter shoots whoever offers the best hit chance, plus a flat **0.05** for a body already
lightly wounded. That is the only term besides raw chance that decides who gets shot, it is worth
roughly a quarter of a typical hit chance, and it is a **bare literal with no name and no entry
in `CONST`** — which is very likely why nothing had ever audited it.

Removing it: **929 shots go to a different body — 17.4% of aimed shots, 20.5% of real choices.**

Somebody visibly wounded was available on 2,451 shots, and the wounded body was the one shot on
1,930 of them: squads concentrate fire on the hurt about four times out of five, and this literal
is what makes them.

**Named `FINISH_WOUNDED` and moved into `CONST`**, unchanged at 0.05 — naming a number is not the
moment to retune it. Verified: all nine outcome integers identical after the move, and the gate is
green.

It was **not in the Layer 1 constants census**, because a static census can only inventory things
that have names. The most influential number in the grid after cover and range was invisible to
exactly the pass built to find numbers like this. Worth remembering as a structural blind spot of
that method, not a slip in this run of it.

### The consumable decisions — all three live

One contest, 64 fights, 1,293 bodies. Carried-versus-used is the right question for a decision
gated on an item, and it needs no instrumentation at all.

| decision | carriers | used | rate |
|---|---|---|---|
| grenade thrown | 438 | 92 | 21.0% |
| smoke put down | 262 | 190 | 72.5% |
| covering fire | — | 419 actions | — |

No dead branches. Grenades want a crowd and most fighters never get one, which is the mechanism
working rather than failing; smoke is thrown whenever people are caught in the open, which is
often. Neither threshold needs ablating on this evidence.

### Next: the decisions Layer 3 still has not reached

The withdrawal, which is a side-level decision rather than a body-level one and needs a different
tap. Grenade MARK selection (which body to centre the blast on) is also unablated — only whether a
grenade is thrown at all has been checked.

### What this layer cannot tell you

Influence is measured **given the other terms**. A term can be redundant with another rather than
inert and this cannot tell those apart. And it audits the terms of the movement decision only —
the shooting, grenade, withdrawal and overwatch decisions have not been ablated.


---

## Why a fighter does or does not go round the side

Asked directly, measured through one contest and **5,751 real movement decisions**.

Three things had to be true for flanking to work, and the first two are:

**Flanking is perceived.** The shot scorer computes the target's cover *from the candidate tile*,
so an angle where their wall does not face you shows up as a much better shot. It is not blind.

**Going round the side is offered.** The candidate set explicitly includes the furthest reachable
tile roughly perpendicular to the enemy, both ways — added at some point for exactly this reason,
with a comment recording that before it, "go round them" was never a tile anybody could pick.

| | |
|---|---|
| decisions offered a tile that flanks | 1,805 (31.4%) |
| offered one that flanks **and** has cover | 1,555 (27.0%) |
| of those, taken | **637 (41.0%)** |
| refused by staying put | 573 |
| refused by moving elsewhere | 345 |

**So flanking is not broken — it happens on two chances in five.** What the refused ones have in
common is the answer:

> when a flank-and-cover tile is turned down, it offered on average **2.0 points more hit chance**
> and carried **9.3 points more incoming fire**.

Those are not the strong flanks the question imagines. The fighter is declining a marginally
better shot at three times the added risk, which is correct.

### The structural reason, which nobody has ruled on

`bestP` is a **maximum** over enemies — your single best shot. `threat` is a **sum** over every
enemy with line of sight to the tile. Measured across the same 5,751 decisions:

| | |
|---|---|
| mean best shot from where they stand | 15.7 points |
| mean incoming threat at that tile | 56.3 points |
| ratio | **3.6 : 1**, or 3.06 : 1 after the weights |

The scorer compares *my one shot* against *everybody's shots at me*. That is defensible — you
fire once a turn and they all fire at you — but it means **the penalty for being seen scales with
how many enemies can see you, while the reward for a good angle does not.** Flanking almost
always means stepping into view of more of the enemy squad than you were in view of before, so
the term that grows is the one working against it.

This is a design decision that appears never to have been made deliberately. Whether threat
should be a plain sum, or sub-linear (not everyone shoots the same man), belongs with the
designer. **It is not a bug and should not be patched as one.**

### One hypothesis, explicitly not measured

The scorer looks one move ahead. A flank that takes two turns has a first step that is worse than
standing still — more exposure, no better shot yet — so a greedy scorer would never start one.
Every number above concerns flanks reachable in a **single** move. Whether multi-turn flanking is
absent because of myopia has not been tested, and I am not claiming it.


---

## The viewer was showing a simpler game than the one being built

Found while rebuilding the replay. `the_firefight.html` armed every fighter with
`DEFAULT_LOADOUT` — one carbine each, no sidearm, no consumables — which is the fallback for
bodies the armoury could not cover, not what a squad carries.

Consequence: **no machine gun ever reached the field, so every fight in the demo showed "0
pinned"** while a real contest pins 4,705 times and suppression is true on a third of all shot
evaluations. Anyone watching the replay to judge how the grid behaves was watching a version of
the game with its most-used mechanic absent.

This is the same fault that produced three false findings earlier in this session, sitting in the
demo rather than in a probe. It was found by the demo failing to show a feature that had just
been added to it, not by looking for it.

Fixed: the viewer now calls `planForce`, the same function `divide.js` calls, and the two sides
draw from different corporations so their kit differs. A **kit** control keeps the old behaviour
available and labelled as "the fallback", because being able to watch the simplified version
next to the real one is worth having. Measured through the page itself: real kit 17 pins,
uniform carbines 0, switching back 17 again.

The replay also now draws **suppression** — an amber bar under a pinned body. That body needs a
move to be worth eight times as much before it will take one, so those are the people who are
about to not move, and until now there was no way to see it.


---

## Wiring `_crossed` and `repositioning` — and a control that was itself broken

Both flags are now written. A normal move sets `repositioning` (1.15), a dash sets `_crossed`
(1.30), and both wear off at the fighter's own next activation rather than at end of turn — the
end-of-turn clear is the mistake `suppressed` makes, expiring on half the people it was applied
to before they ever act.

**Most of the work was making the scorer able to see the cost.** A candidate tile that is not the
one you are standing on can only be reached by moving, so the threat function evaluates it as a
body that has just moved. Wiring the flags at the move site alone would have made everyone easier
to hit with nothing weighing it — no behaviour change, more deaths — which is exactly what
happened when overwatch was made dangerous without being made a decision.

Six contests each way, real kit: movement per body-turn **39.5% → 41.5%**, clock-outs **12 → 12**,
turns per fight −0.7%, permanent losses −0.5%, grid deaths −7.1%. Absolute moves fall 6.4% while
total body-turns fall 12%, so the drop is fewer and shorter fights, not a more timid field.
Positive control: 402,201 evaluations against a repositioning body and 44,181 against one that
dashed, with the switch on; **zero of both with it off.**

### The control was broken before it was right

The first control reported that all five snapshot fights moved **with motion switched off**,
which read as an incidental regression hiding behind a deliberate change. It was not. The change
to the threat function sat outside the motion switch, because that function is module-scoped and
never sees a single fight's settings — so "off" was never off. Fixed with a module-level flag set
once per fight, after which the suite passed **114 of 114 with motion off**, proving the snapshot
movement is motion exposure and nothing else.

A control that cannot be switched off is not a control. Worth checking that the "off" path is
genuinely off before reading anything into what the "on" path did.

### The standing warning was wrong

Across several passes this document and PROJECT.md both warned that wiring these would make
bunkering worse, and advised deciding rather than patching. **The advice to decide deliberately
was right; the prediction attached to it was wrong.** It was reasoning, not measurement, and it
was repeated often enough to look like a finding.


---

## The event panel had never said anything

Reported from watching the demo: the list of what happened on a turn "does not actually say
anything." It did not, and it never had.

The engine writes log entries as `{ t, type, by, at, ... }`. The viewer read `v.kind`, `v.text`,
`v.down` and `v.dead` — **not one of which the engine has ever written.** So
`esc(v.text || v.kind || '')` resolved to the empty string on every line, and each event rendered
as a turn number, a separator, and nothing.

It failed silently for the most ordinary reason: **an empty string is a perfectly valid thing to
put in a div.** Nothing threw, nothing logged, and the stub-DOM check that has caught two scope
errors in this viewer passed it happily — that check proves the page does not crash, and a panel
politely printing nothing does not crash.

Now reads the fields that exist and resolves body ids to names:

> t3 · Kagg misses Gouf · Arc Projector · 42% shot
> t3 · Ravi Lindqvist misses Tasu Luin · Whisper Marksman Rifle · on overwatch · 7% shot
> t3 · Lucia Ferreira misses Anouk Kovacs · Belt Machine Gun · on overwatch · 9% shot

**The lesson for the checking, not the code:** "does it run" and "does it say anything" are
different questions, and only the first one was being asked. The verification now reads the text
the panel produces and fails if it is under twenty characters.

### Races are drawn from their physiology — size and colour, no shapes

Distinct silhouettes per species were built and **taken back out**. They read as clutter, and
worse, they made SIDE hard to see, which is the thing you most need at a glance. The shapes were
never the fix: the fault was that every fill was a variation on the same tan.

Nine sizes in four tiers, straight off the physiology tags — olmac *massive* largest, mon_wa
*small* smallest — with a distinct muted colour each.

**The fills are deliberately desaturated, and that is the load-bearing part.** The side ring is
gold, blue or green, all three saturated. The first palette gave races teal, slate-blue and ochre
— which are those same three hues — so fill and ring competed and the team marker stopped
reading. Species is now a muted body colour; the side ring is the only saturated thing on the
field.

Checked numerically rather than by eye, in perceptual space rather than RGB, because RGB distance
does not match what an eye separates. Two thresholds: every race must be separable from every
other race, **and** from all three side colours. `palcheck.cjs` reports the closest pair of each.
Final: closest two races 14.7 (olmac/svalbard), closest race to a side 14.2 (thythyn/blue),
against a confusion threshold around 12. Two rounds of adjustment were needed — the first palette
put attorak and gil 10.7 apart, both muted browns.

**And the checker read a stale file the first time.** It parses the BUILT page, and the build had
not been re-run after the palette changed, so it reported the numbers for the palette that had
just been replaced. The check was right and was measuring the wrong artifact — worth remembering
for anything that inspects `the_firefight.html` rather than the template.


A Mon-Wa appears as two small bodies because that is what it is — the roster generates a bonded
pair, "one being, two bodies", and each half is a separate combatant. All nine races were
confirmed to reach the field across 40 fights (mon_wa 38 bodies, svalbard the rarest at 15).


---

## An Olmac that changed size between turns

Reported from watching: a body would render large and grey on one frame and small and pale on the
next.

**The replay has two frame builders**, and they were two separate object literals describing the
same thing. One is the snapshot at the top of a turn; the other is the per-body frame written
after each activation — and the per-body frames are the great majority of what you actually watch.
Every field added to the replay over this session went into whichever literal was in front of me
at the time. `kn` reached both. `sup` reached both. **`race` and `mv` reached only the snapshot.**

A record with no `race` falls through to the human entry in the lookup, so a body drew at its true
size once a turn and at human size on every frame in between. It flickered rather than failing, so
nothing threw, and both page checks — the stub-DOM run and the event-panel reader — passed it
without complaint. So would any test that inspected `frames[0]`, which is a snapshot and was
always complete.

Fixed by making it **one** function, `unitRec`, that both sites call. Two copies of a record
drift; one function cannot.

The check that was missing is not "does a frame carry race" but **"does every record in every
frame carry every field"**: 3,271 frames, 40,207 unit records, no field missing from any of them,
and no body changing species mid-fight. Worth keeping for anything else that ends up in a frame.


---

## Movement is drawn between tiles

Bodies used to jump a whole tile at a time, so you could not see who had crossed what — which
matters more now that crossing open ground carries a penalty and being caught mid-move is a real
state the shot calculation reads.

**The data was already there and unused.** Per-body frames have always carried `from`, the tile
that body stood on before it acted. Nothing had ever read it. Only the ACTING body is
interpolated: everyone else is drawn exactly where the frame says they are, so nothing here
invents a position the simulation did not produce.

Dragging the slider passes `animate: false` — a scrub is somebody hunting for a moment, not
watching a fight, and tweening every frame under the handle would lag behind the drag. A
checkbox turns sliding off entirely.

Verified by driving the page through its own controls with a controllable clock and reading the
centres the canvas was asked to draw at: **19 distinct body centres painted, 6 of them sitting
between tiles.** "It did not throw" would not have distinguished a working tween from one that
silently painted the two endpoints and nothing in between — which is the same failure shape as
the event panel that printed empty strings, and the reason that check reads output rather than
watching for errors.

Note for anything that tries this again: `G` lives inside the page's closure and cannot be
reached from outside the script. That is correct, and it forces the check to drive the page the
way a person does — through the controls — which is a better test than reaching in would have been.


---

## Shots are drawn, and building them found a hole in the log

A projectile per trigger pull: out to the target and stopping on it if it hit, carrying past and
fading if it missed, reaction fire drawn paler because a shot on overwatch is somebody else's turn
intruding on this one.

**Round count needed no special case, once the log was honest.** A burst weapon writes several
`hit`/`miss` entries in one activation and a marksman rifle writes one, so a Belt Machine Gun
throws four and a Whisper throws one because that is what happened.

### The hole: 366 shots that existed only in the telemetry

The tempo loop — the extra rounds a fast weapon puts out after its first — incremented
`tel.shots`, resolved the hit, and **wrote no log entry.** So the counter and the record disagreed
about the same event, and only the counter had ever been read.

Measured across twenty-five fights before the fix: telemetry 2,682 shots, log 2,273, **gap 409**,
of which 366 were tempo rounds. Every weapon in the replay looked single-shot. Now: max rounds in
one activation is 4 for a Belt Machine Gun, Drum Shotgun, Riot Autogun and Sidewinder PDW, and 1
for a Whisper Marksman Rifle.

Verified inert: 80 fights with logging off versus on, all identical, so the new entry records the
fight without altering it. The rng draw was moved into a named variable and not re-ordered.

### Two residues left open, both small and both real

**A gap of 88 shots in 6,951 through a contest (1.3%)** still exists between telemetry and log.
Reduced from 409, not eliminated. Not chased.

**1.8% of logged shots carry no weapon name**, and **the explanation first written here was
wrong.** It said these were unarmed fighters. They are not: `UNARMED` is a real weapon profile
with power 0, medium range and the name "unarmed", so an unarmed body's shots are named like
anybody else's. Broken down by entry type through a contest, the unnamed entries are mostly
`smoke` (182) and `stabilized` (29) — events with no shooter and no weapon, where a blank name is
correct — plus 53 genuine `hit`/`miss` entries whose source has not been established. Under one
percent of shots, and not chased.


---

## "It moved one space into the open and did not shoot"

Reported from watching. Traced to a single body's turn: **The Bellow**, starting at (21,8).

The frame says it went to (20,9) — a net 1.4 tiles — and took no shot. What actually happened:

1. The movement scorer chose **(23,12)**: cover grade 3, incoming threat 4.1%, the best tile on
   offer by a clear margin. It went there. Good decision, 4.5 tiles from the start.
2. The **dash** then moved it to (20,9) — 4.2 tiles back out, into the open.
3. Both actions were spent on ground, so it never fired.

### The cause: the dash has no threat term

The movement decision scores a tile as `shot − threat − band`. Layer 3 measured the threat term
as the heaviest thing in the whole decision: **47% of all decisions turn on it.**

The dash scores `shot − band`. **There is no threat term at all.** It cannot see danger. So a
body weighs safety heavily on its first action, then on its second is moved by a rule that is
blind to the thing it just optimised for — and walks back out of the cover it just took.

Measured through one contest, 640 dashes:

| | |
|---|---|
| ended with no cover, having started in cover | **155 (24.2%)** |
| kept some cover | 240 (37.5%) |
| had none to begin with | 245 (38.3%) |
| net displacement under 2.2 tiles | 39 (6.1%) |

**A quarter of all dashes abandon cover**, and 6% end up within two tiles of where they started —
a body that went somewhere and came most of the way back, because the two halves of its turn were
scored on different criteria and undid each other.

This is not a bug to patch quietly: giving the dash a threat term would make it much more
reluctant, and the dash was added specifically so that a short-range squad could cross ground it
otherwise never crossed. Making it safety-aware may bring back the problem it was built to solve.
**A ruling, not a fix.**

### And the replay hides it

One frame carries `from` and the final position, and nothing between. A body that moves and then
dashes is recorded as a single small hop, so the viewer draws a one-tile shuffle where the body
actually crossed nine tiles in two stages. That is why this looked like a body making an
inexplicably tiny move rather than two decisions fighting each other — the evidence was
discarded before it reached the screen.


---

## Three fixes from watching one body

**Sidearms had no name.** A primary carries `power, range, tier, id, name, mobility, damage,
tags`; a sidearm carried `power, range, tier, damage, tags`. The comment directly above the
primary's construction says `id` and `name` are carried "so a viewer can say WHICH gun fired" —
and the sidearm built four lines below it had neither. When a fighter ran dry, `useSidearm`
copied that object over `weapon`, so every subsequent shot logged nameless. **1.8% of shots with
no weapon name → 0%**, which also accounts for the 53 unexplained entries left open earlier.
`mobility` was missing too, and the movement code reads it.

**The dash now weighs threat**, at `DASH_THREAT_SHARE: 0.45` of the movement scorer's weight.
Not full: a dash as cautious as a walk is not a dash, and the mechanism exists so short-range
squads cross ground they otherwise never cross. Through a contest: dashes abandoning cover
**24.2% → 13.9%**, dashes ending within two tiles of their start **6.1% → 0.9%**.

**A body that cannot hurt anyone now wants distance.** Two things pulled an unarmed fighter
toward a squad shooting at it. `UNARMED` is a real weapon profile with range *medium*, so it
inherited a medium preferred range; and `hitChance` asks how likely you are to connect and never
what connecting would do, so a power-0 swing scored 48% and the scorer weighed it like a rifle
round. Both now check `canHurt`. **Unarmed bodies moving toward the enemy: 64% → 39% of their
moves**, with armed bodies unchanged at 68%, so nothing else became timid.

Note: no body starts unarmed in a real contest — 1,105 fielded, zero unarmed, zero unarmoured.
The rule exists and does not currently fire at spawn, so this was proved by construction rather
than by contest.

**And the replay now keeps the path.** A frame carried `from` and the final tile only, so a body
that moved and then dashed was recorded as one small hop. The Bellow crossed 4.5 tiles into cover
and 4.2 back out, and the replay drew a 1.4-tile shuffle — two decisions fighting each other
looked like one inexplicable step because the evidence between them was discarded. Frames now
carry `via`, and the viewer animates both legs. 102 two-stage paths in 3,442 activations.

### Three edits that did not apply

In this pass alone, three scripted replacements reported success and changed nothing, because the
anchor text differed from what I had assumed. One of them would have shipped `via` as a field
that was declared, read, and never assigned — a dead feature that looks alive. Each was caught
only by counting the occurrences afterwards rather than trusting the script.

**Count the thing you changed, every time.** "The edit script ran without error" is not evidence
that the edit happened.


---

## What the rest of the game accounts for and the grid does not

Asked directly. Checked at runtime through a real contest, because a field that exists on the
object and is never set is this project's signature fault and only running it tells them apart.

### Reaching the grid, confirmed live

- **Race**, mechanically — `etu` and `thythyn` and `gil` and `human` are each read at their own
  call sites in `combat.js`; thythyn ignore the long-range penalty, gil break goggles on a head
  injury.
- **Mon-Wa bonded pairs** — 54 bodies in one contest arrive with their half bound, exactly
  matching the 54 cases where both halves were fielded in the same squad. *(A first measurement
  said zero. It was taken at `makeCombatant`, which runs before the pairing does. The mechanism
  was fine and the instrument was early.)*
- **Captains** — 19.5% of bodies, and the flag is read twice: a captain going down costs the
  squad composure, and the squad's willingness to hold is scaled by the captain's `tactics`.
- **Fatigue** and **morale** both carry into the fight.

### Not reaching the grid

- **Starting injuries do nothing.** 46 bodies fought a contest carrying an injury and not one of
  them was any different for it. `hpFor` reads `grit` and nothing else, so a fighter with an
  untreated wound from last week deploys at full health. The Divide tracks injuries carefully,
  fields the injured deliberately (`status === 'injured'` is an eligible state), and the grid
  never asks.
- **`presence` is read by neither `combat.js` nor `tactical.js`** — one of the seven stats has no
  bearing on a fight at all. It is read by `season.js` and by roster flavour, so it is a
  management stat rather than a dead one; worth knowing that a high-presence fighter is no
  different under fire.
- **Cover destruction does not exist.** The tile grid is written once at generation and never
  again. A good position is permanent and a stalemate has no solvent. The `area` weapon tag is
  still read by nothing.
- **Physiology tags are decoration.** `physiology_tags` appears nowhere in any `.js` file:
  `massive`, `light_frame`, `six_limbed` and the rest carry no mechanical weight. Race effects
  are hard-coded per race id instead, so adding a race means editing `combat.js` rather than
  adding data.

### The one I would rank first

**Starting injuries.** The rest of the game has an injury economy — a clock, a recovery cost, a
decision about whether to field a hurt fighter — and the grid discards the answer. Every other
gap here is a mechanic that does not exist yet; this is one that exists everywhere except at the
moment it would matter.
