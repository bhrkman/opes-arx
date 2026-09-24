# Audit — built for eight players, with AI filling empty seats

**The rule (ruled):** the game is designed as if all eight OAs had a human at the helm; an AI OA fills a seat
nobody is sitting in. An AI running a system is fine. A system that ONLY an AI can run — or that only one human
can — makes multiplayer a rewrite instead of a switch.

## The structural finding

**S1. The game has exactly one human.** `opts.human` (and the Divide's `_humanId`) is a single OA id, and about 75
checks across the season and the Divide ask "is this THE human?". Every split below hangs off it.
*Fix:* each OA carries who controls it (human or AI), read through one helper; every check goes through the helper.
Mechanical, and the foundation for everything else.

**S2. The Divide's comms window serves one manager.** It stops for one human's answer, and a stretch of the window
code is written around "you" (a single `you`). With more humans it must gather an answer from each before the day
goes on. Depends on S1.

## Systems only an AI can use

**A1. Fleet trades.** The AI OAs trade fighters among themselves every trading month, and the code says in so many
words: never with the manager's OA. *Fix:* one trade market every OA posts to and answers in.

**A2. Devices bought by wealth.** The quartermaster fits drones and turrets for a rich AI OA; the manager's wealth is
forced to 0. *Fix:* folded into the one quartermaster (below).

**A3. Roles** — being removed (ruled): the kit templates the quartermaster buys and deals by.

## Systems only a human can use

**H1. Withdrawal.** There is one withdrawal offer in a contest, and only the manager can post it. AI OAs answer offers
and make promises; they never leave a planet themselves. *Fix:* any OA can post the offer; an AI does so by its own
policy (losing, hurt, out of reach of the prize).

## The same decision, made by two different paths

These work, but an AI makes the decision INSIDE the system rather than handing the system a choice the way a person
does. The shape to move to: an AI's policy produces the same choice a human would make, and one function applies it.

**P1. Bastille remission** — a manager chooses on the card; an AI's rule is written inside the market.
**P2. Mercenary and tryout bids** — a manager's bids arrive as a list; an AI's are built inline.
**P3. Ransoms** — separate branches for "the human is the owner" and "the human is the captor"; AI-to-AI goes
through the negotiation module. The prices are shared; the paths are not.

## Already right — the model to copy

**Monthly events** — every OA draws; a human answers on the page, an AI through its policy; the same options, the
same consequences. **The draft** — turn by turn; an AI picks by its rule, a human by his. **The drop sector, media
day, the Eight** — one decision, two ways to make it. **Renewals** — a manager's own calls first, the arithmetic for
everything else. **Sponsors** — one courting function for everyone. **Stances and training** — one control, set by a
manager or an AI, recorded in one place.

## Proposed order

1. **S1**, the controller on each OA — the foundation.
2. **The one quartermaster** (roles removed, ruled): every OA's un-kitted fighters kitted by one function that buys
   each a gun of their best type within doctrine, budget and cap, and a device where the OA's money runs to it — a
   manager's hand-kit always first. Replaces A2 and A3.
3. **H1**, withdrawal for any OA.
4. **A1**, one trade market.
5. **P1–P3**, the separate paths turned into choices.
6. **S2**, the window for several humans.
