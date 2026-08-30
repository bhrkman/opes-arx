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
for the first time in the project's history. Two viewers draw the ground and the grid. Losses
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

Losses per Divide still sit above the ruling of about a quarter; calibration stays deferred
until every system is in. Recorded, not chased.

Branches queued, in order:

1. **Fog of war.** The largest remaining piece, and the one most likely to fix squads bunching
   up — both sides currently start in full view of each other. See `docs/BRIEF_FOG.md`.
2. **Destructible cover.** The other half of that answer: bunkering stops being safe when a wall
   can be taken away. Gives the inert `area` tag its job.
3. **Sponsor cost-curve / payout tuning and multi-year regard texture** — deferred play-and-feel
   work now that the system is in and playable.
4. **A dedicated race-durability term** (health/pool or a severity term), if wanted — currently
   race toughness rides on grit's leans, which is real but implicit. Would be a balance project
   with its own measure/gate pass.
5. **Deferred smaller items:** Rest-verb "amping"; weapon-trade columns and a boost button in
   the training grid; the full 246-check gate before packaging.

