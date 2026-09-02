# The hub

This chat holds the project and decides what happens to it. **It does not implement anything.**
That rule is the whole point: the moment the hub starts editing code it starts reading code, and
a hub that has read `divide.js` is no longer a hub.

## What the hub does

- Holds `docs/PROJECT.md` and keeps it true. The code holds every number; decisions live only
  here, and this is the only place that records **absence** — a thing that was ruled and not
  built is invisible to every audit in the tree.
- Chooses the next step and writes the brief for it.
- Receives what a branch sends back, and updates the document from it.
- Answers questions about what was decided and why, from the document rather than from the code.

## What the hub reads

`docs/PROJECT.md`, and nothing else unless a specific question forces it. If a question can only
be settled by reading a module, that is a sign it belongs in a branch.

## Sending work out

A branch gets **the whole zip** and a **narrow brief**. Not a subset of the files — the whole
thing. Context is spent on what gets read, not on what is present, and a branch that cannot run
a full contest will produce confident wrong answers. That is not a guess: an audit of dead
mechanisms run on isolated fights reported twelve, and the same audit run through full contests
reported two. The other ten were the test's fault, and every one of them would have been
"fixed."

A brief is **one step, not one subsystem**. "Build fog of war" can finish. "Fix combat" cannot.

## Taking work back

**The suite is the merge protocol.** A branch's work has landed safely if, in the hub's copy:

```
cd sim
node arx.cjs regress --fast     111 checks · the gate
node audit_open.cjs             what is actually built, tested by running the game
node audit_docs.cjs             does the document still agree with the code
node audit_cross.cjs            does one step's work reach the next, or just sit there
```

...all pass, and every viewer rebuilds. Nobody needs to reason about whether a combat change
disturbed sponsors — the gate already answers that.

A branch reports back in about ten lines: what changed, what it measured before and after, what
it found dead, and **what it reverted**. That last one is not optional and is often the most
valuable part.

## The four rules, and why each exists

Every one of these cost real time. They go at the top of every brief.

1. **Measure through a full contest.** Isolated fights are for proving a single mechanism by
   construction, never for judging whether something works.
2. **After any scripted edit, check the file actually changed.** Two patches silently failed to
   write in one session and success was reported off the build message.
3. **Before believing a zero, check the counter is not NaN and the branch actually executes.**
   Five counters have been lost to `undefined += n` and every reader's `|| 0` turned it into a
   confident zero. A correct fix was abandoned on the strength of one.
4. **Anything that measures as no change comes back out.** A mechanism that cannot be shown to
   do anything does not get to sit in the tree looking like a feature.

## Where things stand

The wound pool is in and a firefight has a middle. Withdrawals are fought rather than declared,
for the first time in the project's history. The ground and the grid are drawn in the unified
page's Divide tabs. Losses
per Divide sit well above the ruling of about a quarter — the last two figures recorded were
42.6% and 50.4% at different points, and the number has not been re-measured recently because
calibration stays deferred until every system is in. Recorded, not chased.

**Since the last hub pass, a long run of verb, interface, and combat work has landed:**

- **The squads screen is built.** Who stands with whom (a drag-and-drop board, `plan.at`), who
  leads (per-squad, `plan.leaderOf`), and what they carry (a shared detail panel with an equip
  picker, `plan.hand`).
- **Gather Intel (Survey) was reworked** into a targeted focus verb: a desk section where you
  paint an eight-focus budget across rivals and the coming planet, buying frozen intel snapshots
  that decay over three years. Tier-1 payoff is informational (multiplayer-safe); rival
  preparedness now feeds the Divide fight via `opts.rivalEdge`. Sworn by `probe_intel.cjs`.
- **Courting Sponsors was reworked** from a dead button into a full conditional-income system
  alongside the Board. Sponsors are a separate supplier roster (`spn_*` ids, NOT the competing
  corps): each backs at most one corp/year, paying a modest advance on signing and a large
  completion reward (cash or in-kind kit) on meeting a condition in one of three flavours —
  limitation, prerequisite, outcome. Acquired by spending focus (cost falls gently as contracts
  are taken fleet-wide; regard discounts it); contention resolved by standing (cross-year regard
  + this-year courting effort). Courting is a focus verb mirroring intel. The desk shows live
  falling cost, regard bands, per-contract live status, and a season-close "Backers' Verdict."
  Sworn by `probe_sponsor.cjs`.
- **The Roster was rebuilt from a spreadsheet into a barracks-style card grid.** Each hand is a
  card: squad as a coloured left edge with a matching label, origin in its own muted hue, salary
  and fame, and tags that lead with "N/N Seasons" (turning red when ending). A sort bar replaced
  the column headers. The right rail now holds the selected hand AND the acquisition window at
  once — neither disappears (the old click-to-toggle bug is gone at its source). The window shows
  each signing state (Nattie Tryouts / Merc Market / Kier Bastille) in its origin colour, with
  full prospect cards: all seven stats plus Ceiling (potential), terms, and a reworded freedom
  clause ("Serves N Divides to earn release").
- **Health on the roster now shows the real wound pool** (`CDCOMBAT.hpFor`, grit-sized), not the
  inert `condition.health` meter. Investigation proved `condition.health` changes nothing in a
  fight; durability lives in grit, which sizes the live wound pool and softens every severity
  roll. No combat change — the sheet just stopped lying.
- **A medium weapon-talent tier was added.** The catalog has three ranges (long/medium/short,
  medium being the most common) but the talent system folded medium into "close." There are now
  six families (long/medium/close × ballistic/energy); `skillFamilyOf` maps medium to its own
  trade, short still folds to close. Tuned balance-neutral (deaths held at ~93/Divide across 20
  canon seeds). Sworn by the extended `probe_stat_scale.cjs`.
- **Training was rebuilt into a focus grid** — four breadth tiers that stack (corner, column,
  row, cell) under an inverse-breadth rule, sworn by `probe_train.cjs`.
- **"Work the signing window" was removed** (one write, zero reads); signing runs on need alone.
- **UI housekeeping:** night-ops cyan/magenta palette; tab names shortened (Desk, Roster, Squads,
  Negotiation; "The Board" kept); "End the Month" moved to the top line for universal access;
  the per-month "what the year said" desklog removed; explanatory tail-text stripped from the
  focus verbs; chunky rectangular pips; shared game-wide stat/squad/origin colour tokens in
  `:root` (`--s-aim` etc., `--sqA`..`--sqF`, `--o-nat/mer/con`).

The gate went 114 → 112 (signing-window retirement) → 111 (sponsor phase rewrite).

**The full gate is red, and was red before this commit.** Run without `--fast` for the first
time in a while: 234 passed, 10 failed, 244 checks at the time (the count has moved since: 243 after the signing-window check was retired, 246 once the dossier-window guards were added). The
same run on the untouched commit-11 tree fails the same ten, same numbers — none of this is
the viewer retirement, which measures as changing nothing. All ten live in the statistical
phases the fast gate skips, which means they have been failing silently for at least one
commit. The list, verbatim: only-your-own-fights-kept (14 of 16), corp schema (roster
potentials far above maximum 20), fighter status `freed` never assigned, S-T5 veteran
improvement out of band, G19 win bonuses banked negative over six seasons, G26 no signing
window worked, G30 deaths at the Dividend (38 across 32 matches), G33 Bastille terms signed
but never served, C7 permanent losses at 48% of the drop force against the ratified quarter-
to-a-third, and README quoting only the fast count. C7 and G19 smell like fog's exposure
multiplier landing with only the fast gate run. This is the next work after (or before)
destructible cover: the heavy phases need re-ratifying against the game as it now is.

**Partial intel now brackets the truth instead of describing it** (PROJECT.md, "Partial
intelligence is a window, not an adjective"): 16-25 hands at a glance, 19-21 with work, 20 when
known. Two invariants are guarded - the window always contains the truth, and a deeper look
never widens it. The training row also got a source: it had been reading a field only the
human's own corp carries, so for every AI rival it was empty by construction and said
"Drilling unknown".

**Six interface faults fixed, and one rule reversed.** A month now opens with nothing spent
(it used to seed the board with the AI's own picks, and the painted intel map survived into
the next month); skills read to one decimal instead of leaking raw floats; the Gather Intel
screen wears the houses' colours and marks like every other place a house is named; the
contest's recap carries only the ground, with the summer's show-matches left on the Desk's
shelf where they live; and the comms window can be advanced from any contest screen instead
of only the Table. THE INTEL DELAY IS GONE by ruling — see PROJECT.md, "You focus on the
intel, you get the intel".

**The Ground now animates on the page, and destructible cover is in.** The animation's
grammar came off the approved mock unchanged and is guarded by six new harness checks — the
decisive one proves that stepping by squad moves ONE squad and not the map, which is the fault
the whole pass existed to kill. Cover comes down under fire: ordinary rounds chip a grade at a
time, an `area` weapon takes it apart across a small radius, and a grenade works the ground
where it lands. The entrenched stalemate transcript fell from twenty exchanges to eight; the
five recorded fight transcripts were re-recorded deliberately, because the model changed.

**Nine red checks went to two.** Seven were faults, not tuning: the show-match's stun
conversion sat below an unconditional return in the grid resolver and had never once run (32
matches, 39 deaths, now zero); the Divide-payout check was grading the expense line instead of
the income line; the prison-term check and the status audit were both stale against later
rulings (the freed leave the roster, so a roster snapshot can never see one; the module that
frees them was missing from the audit's file list); one check demanded a verb the prep calendar
had deliberately retired; and the schema was stale against the ruled 10-200 stat scale. Terms
now also complete more often, because a corp that buys a prison clause has a reason to field it.

**The two that remain are the fatality thermometer, and they stay red BY STANDING RULING**
(PROJECT.md, "How lethal the Divide is, is not decided yet"). Do not ratify them, do not tune
them, do not raise the question again until the game's systems are all in place.

**The Ground's animation pass became an engine excavation** (ruling block in PROJECT.md:
"The Ground moves — and the dome closes"). The recorder now tells the truth; the wall is a
continuously-closing dome that never moves anyone; the wounded are carried, captured or
rescued by the world's own logic and the old displacement's secret ambulance job is retired;
march speed obeys all four rules (size, people — pace rides reflex, the emptiest stat —
wounds, terrain) and the terrain field draws on maps at last; own squads keep spacing. Across
six measured contests the dome takes nobody. FULL-GATE VERDICT, diffed against the recorded ten: 235 passed, 9 failed — one old red HEALED (“only your own fights are kept” now passes), the other nine are the same pre-existing families with figures essentially unmoved (C7 still 48%, Dividend deaths 38→39), and nothing new is red. One latent crash was found and fixed on the way: a living joiner whose principal died under the dome dangled off the odds board (guarded in oddsWithJoin).

**The colour pass (Divide UI passes 1–2) is in.** Every house wears one display colour derived
from canon by `sim/palette_oa.cjs` (ruling in PROJECT.md); the positional `SIDE`/`BANNER`
palettes are retired; fights, rosters, the ground map, the banners, the encounters, the Table's
deal lines and the talks all name houses in their colours; your row is edged in command cyan;
the founder picks from twelve pre-vetted swatches at founding. The ground's fight lines printed
raw corp ids before — they name houses properly now. Full gate re-run after the wiring: the
same ten pre-existing failures, none new, nothing moved. Pass 3 is in: every house wears its mark
(picked from the mock — A everywhere, the witnessed star for the Knights), stored as proposed
art in `data/oa_marks.json` for a human artist to succeed. Pass 4 is in: the Table leads the Divide's rail and holds the window recap, the Firefight is a replay room reached from recaps with a way back, the Dividend's lights stand on the Desk's shelf, and the scrim is deleted whole (ruling in PROJECT.md). The harness walked the new structure and honestly shrank, 104 → 85 checks — the retired checks audited the deleted scrim itself. One ledger correction: the_desk never named rival houses (its backing lines are sponsors), so the promised colour tidy there dissolved rather than completed.

**The six retired single-surface viewers are deleted**, with their templates and builders —
`the_ground`, `the_firefight`, `the_year`, `the_crate`, `the_table`, `the_bench` (18 files).
They predated the unified page and existed only as archives; the contest and the firefight are
drawn inside `the_corp.html`'s Divide tabs. The suite's viewer-rot and build-script checks now
cover only the surfaces that exist.

Losses per Divide still sit above the ruling of about a quarter; calibration stays deferred
until every system is in. Recorded, not chased.

Branches queued, in order:

1. ~~**Destructible cover.**~~ **BUILT.** Rounds now work on the wall as well as the body:
   ordinary fire chips a grade at a time, an `area` weapon takes it down fast across a small
   radius, and a grenade works the ground where it lands. The entrenched stalemate snapshot
   fell from twenty exchanges to eight, which is the bunkering answer the ruling was after.
   The old note follows, for the reasoning: The genuine next piece. Fog of war is already BUILT and measured —
   the three-state spotting model (seen / heard / neither), squad-wide sight carrying a third of
   every shot, firing that gives your position away — see the "You have to find them first" and
   "Sight is squad-wide" rulings in PROJECT.md. What fog was *hoped* to fix, bunkering, is "better,
   not solved" (PROJECT.md records this plainly). Destructible cover is the other half of that
   answer: bunkering stops being safe when a wall can be taken away, and it finally gives the
   inert `area` weapon tag its job.
2. **Fog's three tuning dials**, deliberately not fitted to an outcome and parked with the rest of
   calibration: how far a body can be seen, how much steadier a shot from concealment is, and how
   far a muzzle flash carries. Each has a defensible anchor and no tuning yet (PROJECT.md, the fog
   ruling's close). Fold into the calibration pass, not chased piecemeal.
3. **Sponsor cost-curve / payout tuning and multi-year regard texture** — deferred play-and-feel
   work now that the system is in and playable.
4. **A dedicated race-durability term** (health/pool or a severity term), if wanted — currently
   race toughness rides on grit's leans, which is real but implicit. Would be a balance project
   with its own measure/gate pass.
5. **Deferred smaller items:** Rest-verb "amping"; weapon-trade columns and a boost button in
   the training grid; the full 246-check gate before packaging.

