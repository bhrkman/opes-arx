# ONE AIM · removing the second stat scale

**Ruling (designer):** a fighter has ONE set of stats — the ones on their sheet. Combat reads those,
not a copy divided by ten. A "+10 Aim" mod means ten points on the Aim a manager can see.

## What is wrong now

`combat.js makeCombatant` builds every fighter's combat stats as the sheet's stats **÷ 10** — all
seven (aim, grit, reflex, fieldcraft, tactics, presence, resolve). Everything downstream was tuned to
the small numbers: the hit curve pivots at aim 10, a trait's aim bonus is "+2", a mod's is "+1". So
there are two Aims, one of them invisible, and every bonus is written in the invisible one. The
likely history: combat was written on a 1–20 scale, the roster's stats were multiplied by ten later,
and a ÷10 was put at the door so the combat maths would not have to change. It saved a rewrite once.

## What it has already broken (found while planning)

1. **Fieldcraft has never changed how far anyone sees on the grid.** `tactical.js sightRange` is
   written for the SHEET scale (fieldcraft 40 → 7 tiles, 150 → 15 tiles) and reads the COMBAT scale
   (~5–17). Every value sits below 40, so **every fighter sees exactly 7 tiles**: fieldcraft 52 and
   fieldcraft 165 are identical. A superb scout should see 15.
2. **The auto-turret's aim** was set to 90 — sheet-scale thinking — on the combat scale where
   fighters sit near 9.
3. **Every item and trait bonus is quoted in the invisible unit** — the optic's "+1" is +10 on the
   sheet, the bipod's "+2 held" is +20.

## The fix, staged

The core change is a pure change of UNITS: remove the ÷10, multiply every stat-unit constant by ten.
Done right, not one fight comes out differently. That makes it provable — so the first stage is the
proof.

**Stage 0 — the proof harness.** ✅ *Done:* `harness/stat_scale_proof.cjs`, baseline in `docs/stat_scale_baseline.json`, recorded from untouched code. Before anything moves, record — through the current code — the
quantities a stat feeds, for a large fixed set of fighters and situations: hit chance (every band,
cover, suppression, fatigue, composure band, overwatch, unseen), wound severity roll, composure,
initiative order, and sight range. Stage 1 must reproduce every one of them to floating tolerance.

**Stage 1 — one scale, no behaviour change.** ✅ *Done and proven:* 768/768 aims (in sheet units),
1,536/1,536 hit chances, 30/30 composures and wound pools, 640/640 severity rolls, **30/30 grid fights
identical log for log, 2/2 whole contests identical**. Combat, the grid and the Divide read the sheet; the
three ÷10s in `divide.js` (coordination, preparedness) went with the one at the door. Mods quote sheet
points: **the optic is +10 Aim**, the bipod +20 held / −10 moving, the target link +20 on a reaction.
`probe_stat_scale.cjs`, which had ASSERTED the copy was one tenth, now asserts one scale. Its two
generation claims (births in multiples of ten; prisoners' close skill = aim + 20) were already failing
before this pass and go to the audit. Remove the ÷10 at the door and the three inline ÷10s
(`combat.js` composure, flee chance, and grit in severity). Multiply by ten every constant measured in
stat points:

| where | constants | now → then |
|---|---|---|
| hit curve | `HIT_SLOPE` per point, the pivot at aim 10 | 0.04 → 0.004 per point; pivot 10 → 100 |
| aim adders | `UNSPOTTED_AIM`, `GEAR_TIER_ACCURACY`, `BAND_MISMATCH_PENALTY`, `BAND_SPECIALIST_BONUS`, `SUPPRESSED_AIM_PENALTY`, `NIGHT_AIM_PENALTY`, `GIL_GOGGLE_AIM_PENALTY`, `AIM_PENALTY_BY_BAND` | ×10 each (3 → 30, 1.5 → 15, …) |
| aim in code | the literal hook bonuses in `aimEff` (+1 … +4), the fatigue step (−1 per 25, cap 3), the light-wound −1, `tempoAim`, the quirk table's aim hooks | ×10 each |
| composure | `COMP_RESOLVE` | 2 → 0.2 per point |
| wounds | the grit divisor path in `resolveSeverity` | re-expressed on the sheet scale |
| grid | initiative (`reflex × 1.6 + tactics × 0.5`), its `|| 10` defaults | ÷10 multipliers, defaults `|| 100` |
| mods (data) | `gear_accuracy`, `aim_holding`, `aim_moving`, `MOD_OVERWATCH_AIM` | ×10 — the optic reads **+10 Aim** |

**Exception kept broken on purpose in Stage 1:** the sight range, so Stage 1 stays a pure no-change
step. Stage 0's harness must match everywhere.

**Stage 2 — fieldcraft reaches sight.** ✅ *Done.* `sightRange` reads the sheet's fieldcraft. A/B over sixty
fights, sides identical but for fieldcraft: **before**, 150 against 50 came out ahead +2 times over an even
match — nothing; **after**, +16 (the better eyes put down 230 and lost 98), and a realistic 120 against 80
is +9. The whole field sees further (about 10 tiles at typical fieldcraft, from a flat 7). The five combat
snapshots were re-blessed (every one a recorded fight, no rule broken); the arc still builds (0.044 →
0.170 → 0.208); `probe_watch`, `audit_table` and every page drive hold. Gated as
`GATE=1 harness/probe_fieldcraft.cjs`. The proof baseline is re-recorded on the one scale and guards it
from here. The one deliberate behaviour change: sight reads the sheet's
fieldcraft, so a fieldcraft-165 scout sees 15 tiles and a 52 sees 8. Measured on its own: contact
distance, fight shape, the arc, the stance ladder and `probe_watch`, since seeing further changes who
sees first.

**Stage 3 — the turret and the trait bonuses in real points.** ✅ *Done.* The turret had a private hit
chance and an aim nothing read (set, at that, in the wrong unit): it now shoots as a fighter shoots, at
**Aim 130** on the sheet, through the same hit curve, cover and bands. The trait aim bonuses are named
constants in sheet points (`TRAIT_AIM`: accuracy 20, squad link 10, overwatch 20, first strike 30,
first long shot 40, optics 10), with the fatigue step and the light wound — proven exact. The turret's aim as a real sheet
value; every trait hook that adds aim or composure written as a named constant in sheet points,
so a trait's worth can be read against the "+15 before you feel it" yardstick directly.

**Stage 4 — the copy.** ✅ *Done.* The market never showed a mod's effect at all — only tier and
flavour. It now reads each in sheet points: the optic **Aim +10**, the bipod **Holding +20 · Moving −10**,
the extended mag **Rounds +6**, AP rounds **Grants Pierce 2**. Gated as `harness/drive_market.cjs`. The turret
and drone descriptions say what they do. Mod and item descriptions quote sheet points ("+10 Aim"). The audit sweeps
confirm nothing on the page quotes the old unit.

**Stage 5 — strike the leftovers.** ✅ *Done — and it found one Stage 1 had missed.* `divide.js squadStat`
served a squad's mean stat **÷ 10** to its consumers. Three were written for the copy (forage, escape, the
escape roll) and were converted, proven exact. The fourth was **written for the sheet: the passive sighting
built in an earlier pass**, which it fed the copy — so every squad's watch took the same 0.64 multiplier,
fieldcraft never varied how far anyone watched, and every watch was cut by a third. Fixed as its own
measured change: a still squad's sightings per day 0.20 → 0.47, patience still buying 8.8× a hard march;
average watch reach is back to the designed three times contact. The doorway's "divided copy" comment is
gone; the dead `stat_mods`-in-tenths path has no data left and is recorded for the audit. The dead `stat_mods`-in-tenths path in `roster.js` (no data uses
it any more), and every "roster-scale caller" note that only made sense with two scales.

## Then: the audit the designer asked for

Every stat a manager can see, against what actually reads it and how. One discrepancy is already
known for that list: a fighter's shot uses **the average of their Aim and their weapon skill**, not
their Aim — the sheet shows both numbers, but nothing tells a manager that the one that decides a
shot is the midpoint.
