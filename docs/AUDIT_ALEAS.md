# Audit — the Aleas, bribery and the back room

Instrument: `harness/audit_aleas.cjs` (whole seasons and contests; counts what actually fires). Four
seasons and contests unless stated.

## The pieces, and how tightly each is built

| system | where | fires? | reaches the player? | verdict |
|---|---|---|---|---|
| **The Back Room** — five paid acts, each one chance of going off clean or coming apart | `illicit.js`, season | yes (manager page + AI `consider`) | a page of its own | **loosest part of the game**: two of five acts do nothing (below) |
| **Evidence** — dirt found through intel; blackmail, leak, or report to the Aleas | `illicit.js`, season | yes | on the Back Room page | live |
| **Aleas standing** | `reputation.js` | moved by ~22 acts | a gauge on the standings pages | **visible, and almost consequence-free** (below) |
| **Joining** — joiner/principal deals, stand-downs, named claims | `divide.js`, `negotiate.js` | **10 joins, 7 stand-downs** | **still offered**: "Concede and Go" and "Buy Them Off the Ground" in the deal composer | **a second system doing the Withdrawal's job**, invisible for the AI and duplicated for the manager |
| **Betrayal** | `divide.js`, `negotiate.js` | **0** | nothing | dead; hangs on joining |
| **Asks** ("asks to concede you") | `divide.js` | **0** | panel already cut | dead |
| **Truces (pacts)** | `divide.js` | 26 made, 6 broken | composer + ledger | live and tight |
| **Crowd penalty** (`crowdHit`) | `divide.js` | 14 OAs, 1.3 in total | nothing | a parallel number worth almost nothing |
| **Ransom** | `divide.js` | 136 deals | yes (22 places on the page) | live — the busiest back-room system |
| **Edicts** — the Aleas' rulings for a season (stun-grade, fast wall) | `season.js` → `divide.js` | in force some seasons | **nowhere** — no page names an edict | the player cannot know the rules changed |
| **Disqualification** | `divide.js` | 0 | a band on the day strip | reachable only by contraband now |
| **Footage cases** (built last pass) | `divide.js` | not yet — no AI carries contraband | **no panel yet** | duplicates "Buy a Malfunction" |

## The Back Room, act by act

| act | what it promises | what it does |
|---|---|---|
| Bribe an Official | *One Ruling Goes Your Way This Divide* | sets a `ruling` favour **that nothing reads** — paid for in credits and standing, does nothing |
| Buy a Malfunction | *One Act This Divide Is Not Seen* | sets an `unseen` favour **that nothing reads** — and it is exactly the "lose the footage" the contraband ruling needs |
| Sabotage a Rival's Kit | *Their Squads Drop With Worse Kit* | adds fatigue (+6 per payer) to their fighters at the drop; **the kit is not worse** |
| A Quiet Word Before the Drop | *A Pact That Holds From Day One* | writes a pre-drop pact the Divide honours — live |
| Buy a Story | *+14 With the Fleet, and Your Own People* | fires its own reputation act — live |

(Corrected during the audit: the Back Room's reputation acts looked undefined when tested in isolation,
which would have made every act that comes apart throw. They are registered by `illicit.js` when it loads;
played through a season as the manager, nothing throws.)

## The Aleas standing

It is on screen and it moves — from −42 to +54 across the fleet — but what it *does* is thin. Read in three
places: the betrayal's disqualification roll (**dead**: betrayal never fires), the Back Room's odds and
suspicion (live), and the footage bribe's price (new). So the standing's headline consequence — whether the
drones convict you — sits on a path that no longer runs, and a manager watching the gauge has no way to know
what a good or bad number costs him.

## Two jobs being done twice

1. **Leaving the planet.** The Withdrawal tab is the ruled way; the composer still offers joining's
   "Concede and Go" and "Buy Them Off the Ground", and the AI still joins, stands down and names claims.
2. **Losing footage.** The Back Room sells "Buy a Malfunction"; the Divide now has its own pay-at-the-
   window bribe with its own price formula. One idea, two mechanisms, neither talking to the other.

## How it could be built instead

1. **One exit.** Retire joining — the AI's joins and stand-downs, the composer's two joining ways, named
   claims, asks. Withdrawal is how anyone leaves. Truces stay.
2. **Betrayal becomes truce-breaking.** Breaking a truce on air opens a case, as contraband does: the Aleas
   have it, and the OA answers for it.
3. **One back room.** Every favour is bought in the Back Room, priced by its one rule (credits,
   standing, a chance of coming apart). Its two dead acts get their promises: *Buy a Malfunction* — the next
   case against you is never opened; *Bribe an Official* — the next verdict against you goes your way. The
   pay-at-the-window bribe becomes the Back Room's in-contest price for the same favour, not a second
   formula.
4. **Sabotage does what it says** — worse kit (lower tier, fewer charges) — or is renamed for what it does.
5. **The Aleas standing earns its gauge**: it sets case prices, favour prices and odds, and the gauge says so.
6. **Edicts are announced** — at the lock and on the Desk: *The Aleas rule this season: stun-grade only ·
   a fast wall.*
7. **`crowdHit` folds into the reputation acts** it duplicates.

## Done this pass, before the audit

**Contraband's sentence (ruled):** disqualification without execution — the OA's squads leave the field as a
withdrawal leaves it, its people go home; a standings penalty from everybody; everything it dug and earned from
sites forfeit and its payout zero; every truce, pact, claim, promise and offer it is party to cancelled.
Betrayal keeps its own sentence until it is retired. **Still open from last pass:** no AI carries contraband
yet (the reason is not found); the manager's case has no panel, so an unanswered case is judged after two
windows — which is why this build is not published: contraband is now buyable and fieldable, and a manager
could be disqualified by a case he was never shown.
