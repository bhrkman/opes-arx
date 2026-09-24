# Audit — half-built: what a quick fix left running

Instrument: `harness/audit_halfbuilt.cjs`. Two of these were found the hard way — the ×10 stat seam (a divided
copy at one doorway, thirty constants tuned to the copy) and joining (its PANELS cut while its machinery ran).
Both were invisible until something measured them. The instrument looks for the same shape at six junctions
where one side can quietly stop matching the other.

| junction | found | verdict |
|---|---|---|
| **A. data nobody reads** — every item effect, weapon tag, trait hook and OA dial against the engine | **2** | `delicacy_harvest_friction`, `hidden_leaning` — flavour, recorded in Audit 2, still inert |
| **B. the window's dead fields** — what the engine hands the page each window | **0** | clean |
| **C. counters nobody looks at** | 29 | measurement debt, not a defect: the engine tallies things no page or tool reports |
| **D. checks that can pass by doing nothing** | **8** | the joining shape exactly — fixed below |
| **E. unit seams** (a ×10 between modules) | 5, **all benign** | four are "round to one decimal"; the fifth is the deliberate decade roll at birth. **No second scale is hiding.** |
| **F. switches nothing anywhere reads** (cross-module, where `audit_code` only looks inside a module) | **0** | clean |
| **H. systems that never fire in two whole contests** | **4** | one correct, three below |

## What it found

**D — eight steps in the page drive could pass by doing nothing.** A step that cannot run on a seed printed a
note and passed in silence, which is how the table round-trip that composed NOTHING reported success for weeks.
None skipped in the current run, so this was a live trap rather than a live fault. **Fixed:** a skipped step is
counted and reported beside the result — *"all checks passed · 2 step(s) SKIPPED, and a skipped step proves
nothing"*.

**H — four counters never move in two whole contests:**
- `domeDeaths` — **correct**: the wall kills nobody (ruled), and this is the proof.
- `campMoraleHooks`, `supplyHooks` — **the mirror of Audit 1**. There, hooks were declared in the data and read
  by nothing. Here the engine READS four hooks that **no trait declares**: `camp_morale_aura`,
  `camp_morale_bonus_meals`, `squad_supply_efficiency_up`, `supply_consumption_down`. The camp-morale and
  supply-efficiency effects are written, tuned and unreachable. **STRUCK (ruled):** dead code that reads like
  live design is worse than none, and both come back with the quirks revisit — camp morale +2 in camp, +3 on a
  full ration; supply demand ×0.9 and ×0.92. Only two counters never fire now, and both are right:
  `domeDeaths` (the wall kills nobody) and `relayEscapeUsed` (rare by nature).
- `relayEscapeUsed` — live but rare: it wants a squad fleeing a seeker WHILE holding live relay intel.

**C — 29 counters nobody reports.** Not a fault, but it is how a dead system hides: joining's own counters were
read by nothing until the audit ran them. Worth a standing instrument that prints every counter after a contest
and flags the zeroes — which is what section H now is.

## The shape to watch for

Every case so far has the same signature: **the visible end was changed and the running end was not.** The stat
scale changed what a number MEANT without changing the numbers tuned to it; joining changed what a manager could
SEE without changing what the engine did; the drive changed what was REPORTED without changing whether anything
ran. The instrument is cheap to re-run, and section H — a counter that never moves in a whole contest — is the
sharpest of the six: it asks the game what it actually did.
