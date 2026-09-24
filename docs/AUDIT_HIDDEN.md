# AUDIT 1 · What is simulated and never reaches the player

*Method: `harness/audit_hidden.cjs` lists every field the engine hands the page that the page never
names — a Divide window, your corp, a squad and a fighter in a contest; an OA, its reputation, a
contract and a condition between seasons. Each hit was then judged two ways: does the engine USE it
to change an outcome (reads counted across the sim), and is it shown under any OTHER name (checked by
hand — the "Loyal" on the page is an audience band, "Bulk" is an item stat, "Morale" appears only in
trait names). What survives both is simulated, consequential, and invisible.*

## Should be shown — simulated, consequential, and nowhere on the page

| what | what it does in the engine | where a manager would want it |
|---|---|---|
| **Disqualification** | An OA can be thrown out of a contest: drone footage of an incident is judged against its standing with the Aleas — in good odour it is friendly fire, in bad odour it convicts. 25 reads. | On the map, the Desk and the recap — above all when it is YOURS. The biggest single thing that can happen to an OA in a contest, and it is silent. |
| **Morale** (each fighter) | Feeds a fighter's composure in every grid fight (`COMP_MORALE`); moved by the Divide, by losses, by selling a claim. 21 reads. | The fighter sheet, and the squad card as a squad's mood. |
| **Loyalty** (each fighter) | Moves what a re-signing costs (`RENEWAL_LOYALTY_PULL`), breaks ties for who leads, falls when a fighter is sold and when the crew watches it happen. 20 reads. | The fighter sheet and the re-signing screen — it is part of the price the manager is paying. |
| **Medkits carried** (each squad) | Mend wounds in the field. 15 reads. | The squad card on the Desk, beside rounds and food. |
| **Out of food** (each squad) | A squad that runs dry takes penalties and counts its dry days. 19 reads. | The food bar reaches zero, but the *starving* state and its cost are never named. |

## Needs a ruling — possibly hidden on purpose

| what | note |
|---|---|
| **Potential** (each fighter) | A growth ceiling, 12 reads. Could be deliberate fog — a manager learning who will grow by watching. |
| **Tenure** (`seasonsHere`) | 7 reads. Minor, but a veteran's years are the kind of thing the sheet should carry. |
| **The squad's approach** | Hunting, recovering, scouting, hiding. The Desk shows what a squad is DOING (its intent) but not the mode behind it — partly represented. |
| **Price memory between two OAs** (`dealRecord`) | Why an OA asks more or less of you than of anyone else. A manager sees the price and not the grudge behind it. |

## Fine hidden — plumbing

Home coordinates, flags that last a tick (`movedToday`, `foughtToday`), the stance's internals
(`rigidity`, `stanceChanges`, `declaredAt`), muster bookkeeping, sighting timers, signing cost (shown
as the price when a signing happens), the reputation's own anchors (`base`, `anchor`, `ambition`).

## Recommended order

1. **Disqualification** — a contest-ending event that is completely silent.
2. **Morale and loyalty** on the fighter sheet — both change outcomes a manager is paying for.
3. **Medkits and starving** on the squad card — the Desk already has the space.
4. The ruling rows, as you decide them.

## Status

**Shown:** disqualification, morale, loyalty, medkits (a squad total; each fighter's are already in
their Store slot), short of food / starving, and tenure (last and quiet on the sheet). Gated by
`harness/drive_shown.cjs`.

**Ruled invisible:** a squad's approach, the price memory between two OAs.

**Found while answering:** potential is not merely hidden — it is still a live ceiling on drilling.
Recorded in PROJECT.md for a ruling.
