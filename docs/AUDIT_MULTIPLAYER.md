# Audit — ready for multiplayer (networking and connectivity set aside)

A game several people play at once asks five things of the engine, beyond the eight-seat rule the last audit closed:

1. **One authority.** The engine decides every outcome; a person's page only asks.
2. **Each seat sees only what it knows.**
3. **The game moves on when everyone has acted**, and nobody absent stalls it.
4. **Everything can be saved and resumed**, including a contest in progress.
5. **A seat can change hands**: a person leaves and the engine takes over, or the reverse.

## A. Authority: the page still does game work itself

| | what the page does | what it should be |
|---|---|---|
| **A1** | **The market.** The page prices the cart, adds the items to the armoury and books the expense. A client could set any price. | An engine call that prices and applies the purchase. |
| **A2** | **A truce's price.** The page moves the credits between both OAs' accounts. | The engine settles a truce's terms when it is struck. |
| **A3** | **Silence before the board.** The page applies the reputation hit and the patience loss. | The engine, at the month's close. |
| **A4** | **The Dividend pick** is written straight onto the OA. | Submitted as a choice. |
| **A5** | **The lock.** Squads, leaders, the drop list and hand-kit are written directly into the engine's prepared options for the Divide. | One validated engine call per seat. |
| **A6** | **The Divide runs on the page.** The page creates the engine's contest and drives it. | The engine owns the contest; pages send answers and receive views. |
| A7 | A developer tool adds fighters. | Kept out of any shared game. |

**Already right, and the model for the rest:** monthly choices (the engine clamps every track and the total to the focus budget whatever the page sends), trades and letters, hiring bids, events, the draft, withdrawal replies and ransoms.

## B. Secrecy: each seat is handed more than it knows

**B1. The Divide's window carries the whole world.** Beside its own fields, each seat's view includes `corps` (every OA's full object: rosters, squad positions, treasuries, stances), `stats` (the contest's internal state, including everyone's offers), `planet` (the true ground, including sites nobody has found) and `record` (every squad's movements, every day). The page is trusted to show only the right parts. A per-seat view has to replace them, and the page has to render from it.

**B2. The season is held whole by the page.** Rival information is *shown* through intel snapshots at the depth your scouting has reached, which is exactly the right shape. But the page holds the entire season state, so the snapshots are a courtesy rather than a boundary.

## C. Time: moving on when everyone has acted

- **C1. The month advances when a page says so.** With several people, the engine needs a ready rule: every seat's choices are in, or a deadline passes.
- **C2. The draft waits indefinitely at a person's turn.** One absent player stops it for everyone. It needs a deadline and a default pick rule.
- **C3. A ransom case waits indefinitely for a person's answer.** It needs a lapse, for example at the next window.
- **C4. Actions taken mid-month have no ordering rule.** Conflicts are rare (the market's stock is unlimited, and bids are sealed until the month closes), but two people dealing for the same fighter, or nominating for the Eight, need a stated rule.
- **C5. The Divide's windows** already pause once for every seat. An absent person's answer simply defaults to nothing, which is the right behaviour.

## D. Persistence

- **D1. A contest can't be saved or resumed.** The Divide is a live process in memory ("No Saving Mid-Contest"), so a server restart or a player rejoining would lose it. The engine is fully deterministic from its seed, so the natural fix is to **record every window's answers and resume a contest by replaying them.**
- **D2. Game plans live only on the page:** squads, leaders and hand-kit (`G.plan`, used in 70 places), this month's focus choices and the Dividend picks. They'd be lost on a reconnect, and an AI taking the seat couldn't see them. Today they're saved beside the career rather than inside it.
- **D3. Two randomness hazards.** events.js falls back to unseeded `Math.random` if a caller forgets its dice, and the page shares the season's own random stream (`G.rng`). Only a developer tool draws from it today, but any page code that did would change outcomes.

## E. Seats changing hands

- **E1. Who holds a seat is set once per season,** and the Divide's set of people is fixed when it starts. Nothing lets a seat change hands mid-season or mid-contest.
- **E2. Taking over a seat means inheriting its plans.** An AI stepping in needs the person's squads and kit (D2), and those only become possible to inherit once they live in the engine.
- **E3. An AI policy already exists for every decision:** kit, squads, events, training, bids, trades, withdrawal, ransoms, stances, the draft, the drop sector, media day, the Eight, sponsors and renewals. Takeover needs no new AI, only E1 and D2.

## Presentation

The engine's messages are nearly all neutral. Two sponsor terms say "You" and "Your", which is fine when each seat reads its own. The page is built around one `me`, which is correct for a client: each page has one seat.

## Proposed order

1. **A1–A5: authority,** moving the page's game work into engine calls. Small and contained.
2. **D2: plans into the engine,** so squads, kit and pending choices are game state.
3. **C1–C3: time,** a ready rule for the month, and deadlines with defaults for the draft and ransoms.
4. **E1: seats that change hands,** with the engine inheriting the person's plans.
5. **B1–B2: per-seat views.** The largest step: the page renders from what its seat knows.
6. **D1 and A6: the contest owned by the engine,** resumable from its recorded answers.
7. **D3: the two randomness hazards.**
