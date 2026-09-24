# Audit — the seven stats: what each one actually does

Instrument: `harness/probe_stats.cjs` (two sides identical but for one stat, 150 against 50, 40 fights each,
against a control). Readers traced through the engine.

## In a fight

| stat | lead over the control | put down / lost | verdict |
|---|---|---|---|
| **Aim** | **+18 of 40** | 177 / 30 | the fight's decisive stat |
| **Fieldcraft** | **+10** | 147 / 70 | sight on the grid (live since the one-scale fix) |
| Resolve | +3 | 107 / 82 | mostly fewer losses: composure, panic |
| Reflex | +3 | 110 / 98 | turn order |
| Grit | +2 | 108 / 102 | mostly fewer losses: the wound pool, lighter wounds |
| Tactics | −2 | 91 / 127 | nothing measurable in the fight |
| **Presence** | **0** | **93 / 121 — identical to the control** | **does nothing in a fight at all** |

## Where each is read

| stat | the fight | the Divide | the season |
|---|---|---|---|
| Aim | every shot — **as the average of Aim and the weapon's skill** | — | lot quality, the Eight |
| Grit | wound pool, severity | — | lot quality, the Eight |
| Reflex | turn order | a squad's march pace | the Eight |
| Fieldcraft | sight; treating the wounded | the watch's reach, forage, escape, preparedness | — |
| Tactics | turn order (×0.05), fleeing | **who captains**, the captain's judgement, coordination | lot quality, the Eight |
| Presence | — | 35% of a captain's nerve; the steadiest hand lifts it; **fame gain** | — |
| Resolve | composure, panic | a captain's nerve | lot quality, the Eight |

## Findings

1. **Presence does nothing in a fight**, and outside one it is a third of a captain's nerve and a fame rate. A
   comment in the code already called it "worth almost nothing"; its two small uses were added to give it one.
2. **Tactics does nothing measurable in a fight.** Its worth is in the Divide — who leads a squad and how well —
   which a fight test cannot see; a contest-level measure is next.
3. **A shot uses the average of Aim and the weapon's skill.** The sheet shows both numbers and says nothing
   about the midpoint that actually decides a hit.
4. **The page never says what any stat does.** Names and numbers only: there is no mismatch between claim and
   effect because there is no claim.

## Asked of the designer

- Presence: give it a job in a fight (a squad's steadiest voice holding the others' nerve under fire, say), keep it
  as a captain-and-fame stat, or cut it.
- Tactics: measure its Divide value first, then decide.
- The shot: show the number that decides it (the Aim a fighter actually shoots at with the gun they carry).
- Whether the page should say, in a line, what each stat is for.
