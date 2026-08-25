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
node arx.cjs regress --fast     114 checks · the gate
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
for the first time in the project's history. Two viewers draw the ground and the grid. Losses sit
at 50.4% against a ruling of about a quarter.

Branches queued, in order:

1. **Fog of war.** The largest remaining piece, and the one most likely to fix squads bunching
   up — both sides currently start in full view of each other, so there is no reason to move
   except to improve a firing position, and once you are behind cover there is not a better one.
2. **Destructible cover.** The other half of that answer: bunkering stops being safe when a wall
   can be taken away. Gives the inert `area` tag its job.
3. **The squads screen.** Needs three things built underneath it that do not exist: who stands
   with whom, who leads, and what they carry.
