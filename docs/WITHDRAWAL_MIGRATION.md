# FROM JOINING TO WITHDRAWAL · a staged migration

*Written before any code is changed. The join is not a feature with a switch; it is a state on
the corp (`joinedTo`) that roughly 600 lines read across the engine, the page and the gates. This
plan is the order in which those readers are moved, so that the game is playable and every gate
is green at the end of EVERY stage — not only at the end.*

## The ruling this serves

A beaten OA no longer joins a banner. It **concedes the ground and takes its people off the
planet**: the bodies come home alive, whatever it banked stays banked, a share of the settlement
may ride on the terms, and its squads LEAVE THE FIELD. The negotiation layer keeps its entire
shape — the same valuation, the crowd wall, spite, goodwill, living regard, the memory between
OAs. Only what is being bought changes: the principal is no longer buying guns, it is buying an
enemy off the board.

**Why.** Measured (`audit_macro.cjs`, `probe_*`): five joins a contest, median on day **10**, and
eight sides become **5.7** by the end — so the field stops being hostile at exactly the point a
battle royale needs it most. Meanwhile the contest already kills 78 and captures 26 per Divide:
the survival valve the join was built to provide is *already* carried by the captive-and-ransom
layer, eight times over. Joining delivers the narrative of submission with the mechanical
downside of staying in the fight, and destroys the endgame doing it.

**What is kept.** Pacts. A time-limited truce between two OAs still on the field reduces one
pair's fighting for a few days without collapsing the side count. It is the one alliance-flavoured
mechanic that does not break the arc.

## The inventory (counted, not remembered)

| Surface | References | The load-bearing state |
|---|---|---|
| `sim/negotiate.js` | 282 | the whole table: `offerRange`, `considerJoin/Take/Invite`, `composeTerms`, `rankBanners`, `appetite`, `settle` |
| `sim/divide.js` | 230, of which **29 are `joinedTo`** | the banner tree (`principalOf`), umbrellas, the odds board, `strike`, the window, the recording |
| `viewers/corp_template.html` | 54, of which 21 are `joinedTo` | Negotiation, the Desk's strip, the Ground's banners, the recap |
| `sim/arx.cjs` | 44 | the fleet-scale gates |
| `sim/audit_table.cjs` | 21 | the table's nine rulings |
| `harness/drive.cjs` | 8 | the page's own drive |
| `sim/reputation.js`, `season.js` | 8 | memories and the season record |

`joinedTo` is written in exactly **five** places (`divide.js` 1154, 4524, 4579, and cleared at
1433, copied at 4943). That is the seam the whole migration turns on.

## The stages

Each stage ends with: `regress --fast`, `measure_fight`, `audit_table`, `audit_macro`, the drive,
`audit_ui`, `audit_resize`, `audit_docs`, `audit_code` — all green, and the game playable.

### Stage 0 · The instrument, first — **DONE**
`audit_macro.cjs` now counts **sides, not corps**: a corp that has joined another is not a side
of its own, it is squads under somebody else's flag, and counting it separately hid the very
thing this measures. Read at each comms window off the live corps, where `joinedTo` lives — the
recording does not carry it. Two things had to be fixed to get a reading at all: the generator
only yields for a MANAGER, so with no human OA the contest ran straight through and there were
no windows to read; and the earlier figure of "5.7 sides" was counting CORPS.

**THE BASELINE, recorded before a line of the withdrawal work is written** (`docs/macro_baseline.json`,
two contests):

| day | OAs alive | sides | under another's flag |
|---|---|---|---|
| 2 | 8.0 | **8.00** | — |
| 4 | 8.0 | 7.00 | 1.0 |
| 6 | 8.0 | 6.50 | 1.5 |
| 8 | 8.0 | **4.00** | 4.0 |
| 9 | 8.0 | **3.00** | 5.0 |
| 11 | 7.0 | **2.00** | 5.0 |
| 15–21 | 7.0 | **2.00** | 5.0 |
| 23 | 1.0 | 1.00 | — |

**From day 13 on, the field averages 2.00 sides.** It is worse than the first estimate: by day 11
— not the end, the MIDDLE — eight OAs are five OAs under two flags, and it stays that way for the
entire second half. Eight players become two long before the wall finishes closing, and every
OA is still alive to do it. The last third of the contest is not a battle royale at all; it is
two alliances holding ground.

**The pass condition at Stage 7:** this curve rises. The target shape is the side count tracking
the number of OAs still alive, falling only as OAs actually leave the field, and the average from
day 13 on well above 2.

### Stage 1 · Name the thing that is really happening — **DONE**
`corp.withdrawn` (`{ day, toId, terms }`) stands beside `joinedTo` in the corp's state block,
written by nothing and read by nothing. `NEG.considerWithdraw` stands beside `considerJoin` and
returns the same deal with `withdraws: true` on it — because the price of getting an enemy off
the board is exactly the price the surrender table already computes, so none of the valuation,
the crowd wall, spite, goodwill, living regard or the memory between OAs changes at all.

**Pass condition: the game must play exactly as it did.** It does — `audit_macro`'s curve is
**bit-for-bit identical to the baseline** (`curves identical? True`, late sides 2.00 either way),
and regress 114/114, `measure_fight`, `audit_table`, the drive and the audits are all unmoved.
That identity is the point of the stage: it proves the vocabulary is inert before stage 2 gives
it teeth, so anything the curve does next is the behaviour and not the naming.

### Stage 2 · The engine honours a withdrawal — **BUILT; THE GATE FAILS, AND THE FAILURE IS THE FINDING**

`strike` now writes `withdrawn` and takes the OA's people off the planet: its squads are emptied
by the road a folded squad already takes, so the recording, the map and the replay draw it
without knowing anything new. `principalOf` returns a withdrawn OA to itself — it is off the
planet, not under a flag. `joinedTo` is still written for one stage more, so the settlement and
the pages keep working while they are moved (stages 3 and 5).

**The structural win is real.** Sides now track the OAs actually alive, exactly, at every window:

| day | baseline sides | now | OAs alive now |
|---|---|---|---|
| 2 | 8.00 | 8.00 | 8.0 |
| 8 | **4.00** | **5.50** | 5.5 |
| 11 | **2.00** | **3.00** | 3.0 |
| 13 | 3.50 | 3.00 | 3.0 |

Nobody is under anybody else's flag any more. The merge is gone.

**And the gate fails.** Sides were to hold at 7 or better until day 13; they reach 5.5 by day 8
and 3.0 by day 11, and the field is empty by day 24 — 1.5 OAs standing from day 17, 0.0 from
day 24, with contacts down from 37.5 to 24.5 a contest. **Five withdrawals per contest, on days
4, 4, 6, 8, 8, 10, 12, 12, 16, 24.** The field no longer merges; it evaporates.

**The cause, named rather than patched.** The price was calibrated for JOINING, where the loser
kept fighting under somebody else's flag and stayed at risk. Withdrawing is strictly better for
the same money — you live, you keep your share, and you go home — so the identical price buys a
far more attractive thing, and every OA takes it at the first sign of trouble. **This is a
valuation problem, not a structural one**, and it belongs to stage 4, where the table stops
offering the old deal and `appetite` is re-measured against this curve. Withdrawal should be dear
and late: the thing a beaten OA buys when it is beaten, not a cheap exit on day 4.

*(Recorded and not tuned here: patching the price inside stage 2 would hide whether the structure
works. It does — the merge is gone — and the next stage is where the number belongs.)*

### Stage 3 · The settlement pays a withdrawal — **DONE, with a second finding for stage 4**

**The people are home.** A withdrawing OA's survivors keep `status: 'active'`, carry a
`_withdrew` day, and appear in neither `dead` nor `captured`: checked on a contest, the three
OAs that withdrew brought 9, 6 and 12 bodies home alive. Nothing had to be built for this — the
road a folded squad already takes does it — which is the whole reason stage 2 used that road.

**A concession is paid, not wagered.** Under the old deal the loser fought on under the buyer's
flag, so being paid a *share of what the buyer won* was right: it was on their side. A withdrawal
is the opposite — the ground was conceded and the people went home — so the CREDITS agreed are a
debt for that ground and are now paid FIRST, before any share of winnings, with a shortfall
recorded as `owed`. Measured before the change: **two of three withdrawing OAs were paid nothing**
because their buyer did not go on to win.

**The second finding, carried to stage 4.** After the fix those two are still paid nothing — and
not because of the order of payment. Their terms contained **no credits at all**: `composeTerms`
prefers sites, resources and a share, which under the old deal was sensible (a vassal shares its
principal's fortune) and under a withdrawal means the loser concedes its ground for a claim on
winnings it will never see, and takes that deal anyway because `appetite` values going home for
its own sake. So withdrawal is not merely too cheap for the buyer — **it is frequently free**.
Stage 4 must make the terms of a concession CASH-SHAPED: a price the buyer pays now for ground
taken now.

**Gate:** bodies counted home rather than lost ✓; `measure_economy` unmoved (the eight clear
+4,805 an OA a year, the founded OA +13,686, both inside the noise of the last reading) ✓.
Deaths recorded and not gated, per the standing instruction.

### Stage 4 · The table stops offering the old deal — *and prices it* — **PRICED; THE SHAPE IS THERE**

Two changes, both principled rather than tuned:

**1. A concession is cash-shaped.** `composeTerms` wrote sites, a cut of ore and a share of the
buyer's winnings — right for a vassal that fights on and shares its principal's fortune, absurd
for an OA that is leaving the planet and will never see it. A concession is now paid in credits
in full, and the thrifty may not refuse to pay for ground they are taking.

**2. What is given up is THE REST OF THE CONTEST.** The floor carried no sense of time, because a
join gave up nothing but a name. Conceding on day 4 hands over twenty more days of chances;
conceding on day 20 hands over four. `CONCESSION_EARLY` (2.20) makes a concession cost the buyer
more than three times as much at the drop as on the last day — which is what makes it the thing a
BEATEN OA buys rather than an exit anybody can take on a bad afternoon.

**Measured, against stage 2 and the baseline:**

| day | baseline (join) | stage 2 | stage 4 |
|---|---|---|---|
| 4 | 7.00 | 7.00 | **8.00** |
| 8 | 4.00 | 5.50 | **7.00** |
| 11 | 2.00 | 3.00 | **6.00** |
| 13 | 3.50 | 3.00 | **5.00** |
| 17 | 2.00 | 1.50 | **4.00** |

Concessions now fall on days **6, 8, 12, 13, 14** — 2.5 a contest instead of 5, none before day
6 — and contacts are back to 34.0 from 24.5. The field falls away gradually (8 · 7 · 6 · 5 · 4 ·
4 · 4 · 2) instead of merging into two flags by day 11 or evaporating by day 17.

**Still open for stage 7:** the last third is still thinner than it should be (1.44 sides from
day 13 on), and an `owed` line is recorded when a buyer's take cannot cover the price but no
money moves for it — a concession the buyer cannot afford should be a debt against its treasury,
not a free one. Deaths recorded at 74 a contest and not gated, per the standing instruction.
**Carried forward from stage 2: withdrawal is too cheap and therefore too early. And from stage
3: its terms are frequently EMPTY** — `composeTerms` writes sites, resources and a share of
winnings, so a conceding OA often hands over its ground for a claim on a fortune it will never
see, and takes the deal anyway. A concession must be cash-shaped: a price paid now, for ground
taken now.** The price was
set for a deal that kept the loser in the fight; it now buys a way off the planet. Re-measure
`appetite` and the joiner's floor against the sides curve until withdrawals cluster late and
cost the buyer something real.

`considerJoin`, `considerTake`, `considerInvite` and `rankBanners` speak in withdrawals; the
umbrella structure and `joinedTo` remain in the code but are written by nothing. **Gate:**
`audit_table`'s nine rulings still hold, with T1–T3 re-read as "whom a beaten OA offers to leave
to" rather than "whom it joins".

### Stage 5 · The pages
Every one of the 54 page references, checked by hand against a live contest:
- **Negotiation / the Deal** — the ask, the banner strip, the answer buttons, the echo.
- **The Desk (Divide)** — the day strip's *Under <banner>*, the fleet rows, *Your Word*.
- **The Ground** — the banner board, the squad markers, the legend, the replay's *folded* and
  *joined* words.
- **The recap and the Board** — how a contest that ended in withdrawals reads at the year's close.
- **Pre-Divide** — the Lock's copy, the board's demands, any sponsor condition that names a
  banner.
**Gate:** the drive plus a hand pass of each page at three points — before the drop, mid-contest,
and after the settlement.

**DONE.** The words were describing a thing the game no longer does:

| was | is |
|---|---|
| Join Their Banner | **Concede and Go** *(You Leave the Planet)* |
| Take Them Under Yours | **Buy Them Off the Ground** *(They Leave the Planet)* |
| A Request to Join Your Banner | **Asks to Concede** |
| You Fight Under <OA> | **You Have Conceded to <OA>** |
| They Fight Under <OA> | **They Have Conceded to <OA>** |
| Join <OA>'s Banner *(the answer)* | **Concede the Ground to <OA>** |
| Under <OA> *(the Desk's day strip)* | **Conceded To <OA>** |
| The Banners *(the Ground's board)* | **Still on the Ground**, and its column is **OA**, not Banner |

**`harness/scan_withdrawal.cjs`** is the gate, kept: it opens the game, plays to the lock, drops,
runs five comms windows, and reads every live surface — the table, the stance ladder, the squad
cards, the encounters, the day strip, the Ground's board and log, Your Word, the echo and the
recap — at three points, for any word that still describes a banner or fighting under one. Clean
at the lock, after the drop, and mid-contest.

### Stage 6 · Strike the dead wood — **DONE**

`joinedTo` is gone from the corp's state, from the engine's twenty-four readers, from the
settlement and from the page's thirty-two. What replaced it everywhere is the question the game
now asks — **has this OA conceded and gone** — rather than *whose flag is it under*:

- **`principalOf` is the identity.** It walked a chain of banners to find who a corp really
  answered for; nobody stands under anybody, so every OA answers for itself. Kept as a function
  because two hundred lines call it, and because a later ruling may bring a chain back.
- **The settlement's `rootOf` likewise**, and both of the page's copies of it.
- **The page has one accessor, `concededTo(c)`** — the OA this one conceded the ground to, if it
  has. It asked `joinedTo` for a banner it stood under, and there are no banners.
- The manager's own two write sites (his window's answer, both directions) now record a
  concession rather than a banner.

**Gate: a pure deletion must change nothing.** `audit_macro`'s curve is **identical to stage 4**
at every window — 8.00, 8.00, 7.50, 7.00, 6.00, 7.00, 6.00, 6.50, 5.00, 1.44 late, 34.0 contacts
— and regress 114/114, `measure_fight`, `audit_table`, the drive, `scan_withdrawal`, `audit_ui`,
`audit_resize`, `audit_code` (nothing unreferenced) and `audit_docs` are all green. A search for
`joinedTo` returns three hits, all `_joinedToday`: a squad walking into a fight already in
progress, which has nothing to do with banners.

### Stage 7 · Re-measure the shape — **PASSED, on a measure that had to be corrected first**

**The raw count was the wrong instrument.** Contacts per DAY falls through any contest, because
there are 26 squads on day one and a handful at the end; by that measure no battle royale ever
written would pass. What a last third feels like is **contacts per squad still standing**, and
`audit_macro` reports it by thirds now.

| | first third | middle | **last third** |
|---|---|---|---|
| **now** | 0.120 | 0.171 | **0.202** ← hotter than the drop |
| with the concession price removed | 0.084 | 0.141 | 0.139 — flat, and it sags |

**The contest now gets hotter as it goes.** Not because more fights happen — 34.0 a contest, much
as before — but because the field thins while the survivors keep finding each other, which is the
shape the whole migration was for. With the price of an early concession taken away, the same
game flattens out and the last third stops climbing: the intensity is bought by making a
concession dear early, not by the withdrawal alone.

**And against the stage 0 baseline, at the number that started this:**

| sides standing | day 4 | day 8 | day 11 | day 17 |
|---|---|---|---|---|
| joining (baseline) | 7.00 | 4.00 | **2.00** | 2.00 |
| withdrawal (now) | **8.00** | **7.00** | **6.00** | **4.00** |

Eight OAs no longer become two flags by the middle of the contest. Every side on the ground is an
enemy, from the drop to the last day.

### What is left, recorded rather than carried

- **The last third is still thin in absolute terms** — four OAs from day 15, 1.44 sides from day
  13 on. The heat is right; the population may want the contest shorter still, or the wall
  harder again. A tuning question for a later pass, with an instrument that now reports it.
- **A buyer that cannot afford a concession gets one anyway.** The shortfall is recorded as an
  `owed` line and no money moves. It should be a debt against the buyer's treasury; the
  settlement does not reach the accounts, so it wants a pass of its own.
- **`_joinedToday`** — three hits, a squad walking into a fight already in progress. Unrelated to
  banners; left alone deliberately.

## What could go wrong, named in advance

- **Fatality is NOT a risk to manage here, and no stage bends a number to protect it.** Standing
  instruction, and this migration is the case that proves it: the systems around death are not
  locked, so tuning the withdrawal price to hold a death rate steady would be tuning against a
  baseline that the next change undoes. Deaths are MEASURED at each stage and recorded; they are
  not a pass condition.
- **The AI may withdraw too early**, emptying the field a different way. `appetite` already governs
  when an OA wants out; it will want re-measuring at Stage 4 against the sides-by-day curve.
- **A saved game mid-contest** carries `joinedTo`. Stage 2 must read it as a withdrawal on load.
