# Opes Arx: The Capital Divide

A management sim. You run a corporation that fields a squad of fighters in a lethal annual
contest for mineral rights. **You never aim a gun.** You sign people, arm them, decide how many
to send, negotiate with rivals while the fighting happens, and live with who comes back.

**Lives are the currency.** A death costs money, a roster place, the morale of the people who
were standing next to it, and standing with four different audiences. Only some of that is a
number, and the game does not pretend the rest is.

---

## How to work on this project

### A guard nobody waits for is a guard nobody runs

The suite reached ten minutes and the standing instruction is to run it before touching anything
and after every change — an instruction nobody can honour at that price. **Cost is part of
whether an instrument works.** So there are two gates: `--fast` skips the phases whose cost is
statistical (thousands of fights, dozens of careers) and keeps everything structural, and the
full suite runs before anything ships. A green fast run says so out loud, so it is never mistaken
for a green suite.

Twice the cost was diagnosed by guessing and twice the guess was wrong — the invariant sweep was
blamed at 47s when it is 19s, and a guard estimated at two thirds of the runtime was a quarter of
it. `--timings` measures it. Guessing at cost is the same error as guessing at behaviour.

Sample sizes outlive the claims they were sized for: the gear guard ran 3,600 fights a run
because it once asserted a magnitude band, long after it had been narrowed to a claim about
direction. And an **unratified observation has no business being a gate** — the kit-allowance
figure cost 65 seconds a run to produce a number the suite itself declares meaningless.

### Run it before you read about it

```
cd sim
node arx.cjs regress --fast   111 checks, ~90s. The edit-loop gate.
node arx.cjs regress          249 checks, ~5.5min (slower machines ~12min). Before packaging.
cd ../harness && node drive.cjs   drives the BUILT page through a whole year
                              (one-time `npm install` for jsdom; node_modules is ignored;
                               `npm install canvas` too and the maps draw for real —
                               ARX_SHOT=1 / ARX_SHOT_DEPTHS=1 / ARX_SHOT_FOG=1 / ARX_SHOT_WORLD=x
                               dump PNGs to /tmp so the drawing is looked at, not assumed)
node harness/audit_ui.cjs     THE UI AUDIT — after every change to viewers/corp_template.html.
                              Fails on the three things that have crept back into the page in
                              every pass no matter how many notes were left, so the notes are
                              a tool now:
                                CASE    user-facing text is Title Case (small words stay small)
                                PROSE   the page does not explain itself: no sentences, no
                                        "because", no dashes that teach — labels, values, verdicts
                                COLOUR  colour comes from the conventions, never a hex at the
                                        point of use: stats STATCOL/gradeColour, credits crs(),
                                        houses cSpan()/colFor(), fighters raceColour(), the
                                        canvas from the TOK table, everything else a CSS var.
                                        A plain cr() in HTML, a bare nameOfCorp(), a name
                                        without its race colour all fail.
                              Deliberate exceptions go in harness/audit_ui.allow.json by exact
                              string. Do not add to the allowlist to make a run green — fix
                              the page. The Desk's log lines narrate and are exempt by design.
node audit_open.cjs       what is actually built, tested by running the game
node audit_docs.cjs       does this document still agree with the code
node audit_cross.cjs      does one step's work reach the next, or just sit there
```

**`audit_cross` gained two checks and both found live faults the day they were written.** It
could see a constant declared and never read; it could not see one READ that the reading file
never declared, which is how a courting delay resolved to `undefined` and every comparison it
took part in went quietly false. And it could not see a function nobody calls, which is how
fourteen dead ones survived a resolver cut and how an edit was made to a movement helper that
does not run, measured at no effect, and the no-effect read as the mechanism not mattering.
**Suspect the instrument before the game** — its first run of the new constant check reported 92
faults, of which nearly all were it counting its own explanatory comments.

**The code is the source of truth for every number.** This document holds decisions, not
descriptions. If you want to know what a constant is, read `sim/`; the constants carry comments
explaining why they are what they are, next to the mechanism they drive.

This is a change made at Step 8.7. There used to be nine documents and 8,168 lines of prose
describing the code, and it went wrong in the way caches go wrong: the Kit Allowance figures were
stale by a constant change for four steps, a built system was described as unbuilt, an unbuilt
one as built. There was even a check in the suite whose job was to force the prose to quote the
code correctly — which is the tell. If a machine has to keep your documentation true, your
documentation is not the source.

### The fault this project keeps producing

**It is not broken code. It is code wired to a condition that never becomes true.** Nothing
crashes. The tests pass. A number comes out and it is confident and wrong.

Found so far, among many: a squad's gear tier that could only ever rise, so the repair hook
behind `tier < 3` fired zero times in 1,417 fights · a resupply need-term behind the same dead
condition · `_droppedGear` written on every rout and read by nothing · `_scouted` accumulated
every turn and read by nothing, *written in the session that catalogued dead wires* · a
non-lethal weapon tag wired into the abstract resolver while the event using it ran on the grid ·
a show-match scored on kills, which its own stun weapons could not produce, so every bout drew
and the purse never paid · casualties read as `.A`/`.B` while the sides carried corp ids.

**The tools have the same disease.** A guard that had never failed had never been tested: one
asserted the first fallen banner finishes last and subtracted nothing for a corp disqualified
*below* last, correct only in samples that happened not to contain one. Another would have thrown
a ReferenceError instead of reporting a failure. **Suspect the instrument before the game.**

**So: find these by running the thing and measuring it, never by reading it.** Every fault above
was found by measurement. Not one was found by reading.

### Build the relationship, not the number

The game is not built. Every system still to land will move every measured distribution again, so
a constant fitted to how the fleet currently behaves is stale before the next step ends.

Twice a constant came loose from the ruling it encoded. A funding-spectrum neutral was fitted to
the median of a fleet that always fielded 24 — and the next change in the same session made that
fleet stop existing. A casualty band was written as a headcount, which said the same thing as
"about a quarter" only while every corp fielded exactly 24. **When a system needs a reference
point, find one that already exists in the world and measures the same thing.** The funding
spectrum's neutral is now the board's own stipend.

**Imbalance is not a defect at this stage. A system that cannot run is.**

### Two standing instructions

**1. Raise things in natural language, pointing at the thing itself.** Never open with a section
number or a tag. Say what the issue *is*: "the crowd penalty charges least for quitting on day
one, when quitting is most offensive."

**2. Every step ships an interactive HTML demo of what it built.** It is how the designer forms a
judgement. It must run the real thing — inline the live modules and execute them in the page. A
demo showing invented numbers is worse than none, and a viewer that has fallen behind the code is
a lie. Every viewer has a rebuild command; run it.

### Measuring combat honestly

A single engagement is enormously noisy. **Any weapon or doctrine claim needs at least 200 fights
a matchup, run in both directions with sides swapped, across two independent populations.** A
number the two populations disagree about is not a number. Sample sizes below that have produced
confident nonsense repeatedly — an ambush read as a *penalty* at 16 fights and a +0.155 advantage
at 200.

**Rare branches are proved by construction, never by widening a batch.** If a thing should happen
once a decade, build the state and assert it fires; do not run more seasons hoping to see it.

**Nothing is dead until you have made it live.** Before reporting that a mechanism, hook, flag or
branch never fires, build a case on purpose and show the counter move. If you cannot build one,
the finding is *"I could not construct a case where this fires"* — which is a weaker and different
claim from *"this never fires"*, and only the first is yours to make without the positive control.
A zero has three causes and the number alone distinguishes none of them: the branch is genuinely
unreachable, the counter was never a number, or **the world you built to look at it was too
simple to contain the thing**. The third is the one that keeps winning. One session reported four
absences — flanking invisible to the movement scorer, a live cover penalty for treating a downed
man, five state flags never set, and suppression never firing in 21,386 shots. Three were wrong.
Flanking is perceived through directional cover and the flag is inert by construction; the
treating penalty is dead but for a different reason than the one given; and suppression fires
4,705 times in two contests, because the probes had armed all twelve fighters with the same
carbine and no carbine suppresses. Every one of those would have been caught in a minute by trying
to make the thing happen before announcing that it could not.

**Interface text is Title Case, and there is only ever one copy of a sentence.** Every line a
manager reads — a sponsor's condition, an obligation, a verb's reason, a status — is written
Title Case, small words excepted. Two tables carried the same sponsor sentence in different
cases for a long time and the interface happened to show the lowercase one, which is the real
lesson: a string that exists twice will drift, and the copy on screen will be the wrong one.

**Interface text is Title Case, and there is only ever one copy of a sentence.** Every line a
manager reads — a sponsor's condition, an obligation, a verb's reason, a status — is written
Title Case, small words excepted. Two tables carried the same sponsor sentence in different
cases for a long time and the interface happened to show the lowercase one, which is the real
lesson: a string that exists twice will drift, and the copy on screen will be the wrong one.

**Speak plainly.** Checks, constants and rulings carry codes so the code can find them; a
person should never have to decode one. In conversation, name the thing: "the check that a
fighter who survives four contests should be better than a rookie finds eight where it wants
ten", not the code. The codes belong in the source and the commit.

**The instrument is the first suspect, not the last.** Two harnesses disagreeing about the same
configuration is a gift; chase it rather than picking the answer you prefer. In the same session
that produced the three false absences, a fourth error — a decision rewritten so that a body with
nobody in sight stopped watching, which silently removed a quarter of all shots — surfaced only
because two probes disagreed by fourteen points and the discrepancy was followed instead of
explained away.

---

## The game

### The shape of a year

Twelve months. Eleven of them are not the Divide, and they are most of the game.

**A year is twelve months: eleven of preparation, and the Divide.** The month is the turn — a
manager sits down eleven times, spends what the month allows, and says they are done; the world
moves on once *every* manager has said it. M12 is not a turn, because nothing you do in it is a
decision made at a desk. That last
clause is why the month is the unit and not the two-month block it used to be — it is the shape a
second human player slots into with nothing rebuilt.

*Re-cut since this was written — every month has a shape, and a hiring window is two months
with two pools, each resolving at its own month's end, where it was a run-up and a deadline over
one pool:*

| | |
|---|---|
| **M1** | **the Review** — last year's Divide, the verdict, the new card, the holds' movement; no hiring, no table |
| **M2** | **Natural-Born window** — your own ship's premium pool: younger, further from their ceiling, dearer; signs at the month's end |
| **M3** | **Natural-Born window, second month** — a total refresh, the discount pool: older, nearer the ceiling, cheaper. Uncontested, so nothing carries: these are your ship's people |
| **M4** | **the Dividend** |
| **M5** | **Kier Bastille window** — a shared market of volunteers; the intake at the month's end |
| **M6** | **Bastille window, second month** — whoever nobody took is still in the wing at a markdown, beside a fresh intake |
| **M7** | **the fleet's event** — reserved: something with fleet-reaching scope, every year |
| **M8** | **The Eight** — reserved: one name per OA, two teams of four, one fight, no retreat |
| **M9** | **Mercenary window** — the contested market; anyone offered a contract chooses at the month's end and is gone |
| **M10** | **Mercenary window, second month** — whoever nobody offered carries at a markdown beside a fresh lot; the roster floor lives here, the last door |
| **M11** | the lock — who goes, and how many |
| **M12** | **the Capital Divide** |

The table trades M2 through M11. A fixed date falls at the *close* of its month, after every
corp has finished spending, which is what makes a deadline a deadline. The AI's Natural-Born
signings are a yearly cap spent across both months (`NATTIE_YEAR_CAP` plus its shortfall); its
merc and Bastille bids run in both months by the same budget test. Every window is worked
through `choices[id]` and `placeBid`, so a human and an AI corp are the same kind of player to
the engine — the rule for every system from here: if a player can do it, a computer can, and
the other way round.

Each month is a budget of action points against verbs that compete: treat the wounded, drill the
green, survey the planet, work a signing window. **You cannot do all of them in the same month.**
That competition is the management game.

### The Divide

Up to eight corporations drop onto a planet for up to thirty days and fight over mineral rights
while the fleet watches. Squads move on a real map, take ground, empty crates, and meet each
other. The manager is not on the ground: you set stance and standing orders, and you talk to the
other corps.

A firefight resolves on a grid — real positions, directional cover, line of sight, action points,
overwatch — and every shot is a real round from a real weapon out of the catalog.

### What the manager actually decides

Who to sign and who to let go · how many to send and who · what they carry · how aggressively
they fight · and every deal at the table while it happens.

---

## Rulings

**These are decisions, not descriptions.** The code cannot hold them: it says what happens, never
what was chosen over what. Everything here is settled unless it says otherwise. Anything not here
is open, and a proposal costs nothing to veto.

### The premise

- **You never aim a gun.** Hands-free with light directives to commanders.
- **Combat is entirely ranged.** Blades exist in the fiction and never as items.
- **Permadeath.** Nobody is regenerated, ever. A career that ends is over.
- **Careers are short.** The most hardened veteran retires by their late thirties at the outside;
  the average career ends much earlier, and often in a coffin.
- **Nothing is ever completely unviable.** Half the fun of managing is building a composition,
  and a build that cannot be fielded was never a choice.
- **A function is not the same as equal power.** Some items are stronger and should be, or cost
  would mean nothing. Every weapon is the right *buy* somewhere; not every weapon is a peer.

### Lives, and what they cost

- **A death lands in five ledgers and only some of them are numbers.** What is real is charged;
  what is not is declared and left unpriced. There is no exchange rate for a life, and there will
  not be one.
- **A point of popularity has no price in credits either**, for the same reason.
- **A death moves the people who were standing next to it, and then it stops.** Grief is local
  and it fades.
- **Most corps lose about a quarter of their people permanently each Divide.** Some lose everyone.
- **Capture is real, rare, and a negotiation asset.**
- **Somebody goes back for the wounded.** Every squad carries its own out; losing them is a
  consequence of being overrun, not of stance.

### The year

- **A contract pays for participation, not for existing.** A retainer for being on the books, a
  purse for going down the well. Nobody draws a purse for a Divide they did not drop into.
- **A roster is 16 to 40**, and fielding fewer than a full force is legitimate: fewer purses,
  better-armed people, outnumbered. **The Aleas kit ceiling is a CORP ceiling** and does not
  shrink with the force, which is what makes quality-against-quantity a real trade.
- **Nobody opens with a full squad, and no two houses open the same.** Founding size is derived
  from a house's difficulty — 22 down to 16, against a drop force of 24 and a target of 28 — so
  the first year is a question about how many to add, who, and what is left for gear.
- **A broke corp always gets one more year.** The board foots the bill and its patience drains.
  **Nobody is ever struck from a Divide for poverty**; being carried and then sacked is the
  mechanic. **Being fired is the only defeat condition.** The board's grant does not move with
  results — punishing a failing corp with less money makes next year likelier to fail, so the
  difficulty gradient lives in patience, not credits.
- **The board speaks in M1, against the rock you are about to be sent to.** The planet announced
  at the season open and the ground fought over in M12 are the same object, or the board can
  demand a resource that is not down there.
- **The wounded are a thing you manage.** Injuries survive the year; mending runs across the prep
  months and treatment costs points you wanted elsewhere.
- **A month's action can land later.** A survey reports in three months; a house courted now
  thinks better of you two months on. Outcomes are plain records dispatched by name, never stored
  callbacks, and none crosses the turn of the year. **The same point spent in two different
  months is two different decisions.**
- **You build the roster; a button does not build it for you.** A lot opens with its window and
  stays put, so the same named people are in front of you across both months. You offer what you
  think they are worth, and the fighter chooses — money is one term, how many of your people came
  home is another. You are told who outbid you and by how much.
- **Working a signing window is worth something**: a better bid at the deadline, a place in the
  queue at the Bastille. Spent when its window fires; it neither carries between windows nor
  banks across seasons.
- **Somebody is backing you, and they want something.** Sponsors are the same eight houses,
  backing rivals they approve of — money from someone also trying to beat you. A contract is a
  retainer, a term, and **an obligation you can fail**; anything else is a subsidy. Obligations
  score against figures the game already produces. **Exclusivity** pays about double and locks
  out the other seven. **Courting** is the verb, and it pays into *next* season's offers — a verb
  that improved the offer in front of you would be a discount button.
- **A career survives being closed.** Saves are files, not browser storage. The planet, its pot
  and the open lot are derived from the season and so are *not* stored. The bar is bit-identity:
  a resumed career must be indistinguishable from one never interrupted.
- **The lock is a decision, not a sort.** How many answers the board; who answers your culture —
  send the fittest, rest the walking wounded, or give a prospect the ground time.
- **M11 is the handover, and it holds three entangled decisions.**
  - *Where you land.* The ring is cut into sectors, read off the planet the Divide will actually
    fight on. Contested ground **shares out** rather than being taxed. Without a survey they are
    names on a ring — this is the second half of the survey verb.
  - *Who you have an understanding with.* A pact struck here is struck **blind**, which is the
    whole difference from the in-Divide truces. The chance is shown: a blind bet on a rival's
    character is a decision, a blind bet on a hidden number is a coin you are not allowed to look
    at.
  - *Whether you perform.* Media day pays standing and charges concealment — rivals arrive
    knowing more about what you brought.

  The entanglement is the point, and **the fleet takes all three too**.

> **DEFERRED (partly closed) — the three recruitment markets each want a step of their own.** They
> run and can be played, which was the bar for that step and not for the systems. Since this was
> written, the contract and origin work closed part of it: a hand's origin is now visible and
> load-bearing everywhere (Natural-Born / Mercenary / Conscript), contract terms beyond a bare
> salary are shown and weighable (a nattie's pension and per-Divide bonus, a merc's one-Divide
> deal, a Conscript's freedom countdown), and the "work the signing window" pseudo-mechanic was
> removed so signing runs on need alone. Still missing: scouting that reveals a ceiling gradually
> rather than printing it, rival interest you can read before committing, the Bastille's freedom
> clause as something you actively weigh at intake, and an AI that bids against a named list
> rather than off a formula. The Survey rework is the natural home for the gradual-reveal and
> readable-interest pieces.


### The two markets, and why they differ

- **The merc deadline: the mercenary chooses.** A free professional can walk, so corps bid and
  the fighter picks — weighing the purse against **how many of that corp's people came home**. A
  corp that burns through people cannot hire, whatever it offers.
- **The Bastille intake: the corp chooses, and the fighter's power is the exit.** These are
  volunteers serving a term of Divides for a wage and, at the end of it, their freedom. Cheaper
  than the open market, and that is the trade.
- **These must not be modelled the same way.** A merc picks their employer because they can walk;
  somebody signing out of the Bastille has one offer in front of them and a sentence behind them.
  *A lot auctioned off to die is an endorsement; a bad bargain taken with open eyes is a story
  about what people will trade for a way out.* The distance between those two is the setting.

### The Dividend

- **The mid-year show-match is non-lethal, and the WEAPONS are why.** Stun rounds and shock
  lances that cannot kill and cannot maim — not cheap lethal weapons and a hope. A non-lethal
  weapon has to survive every death path in the resolver, not the one it fires down.
- **It is where you blood rookies safely**, build fame, and show off to sponsors. Corps send
  their greenest.

### The Divide, from the desk

- **The contest ticks in two-hour steps, six of day and six of night, and stops for you on the
  planet's own cadence** — every two days at first, tightening to every day as the ring closes.
  A manager's rhythm is the fleet's rhythm; the window is not a fixed number of days.
- **You set protocols, not orders.** At a window you move your corp's notch between
  preservationist and death-or-glory, and every squad takes it. You never tell anyone where to
  stand or who to shoot.
- **You negotiate for yourself.** Ceding your banner is irreversible and the largest decision in
  the contest, so *the AI never makes it on your behalf* — your corp is skipped in the fleet's
  negotiation pass. At a window you can cede to somebody, take somebody under your banner on
  terms you set, or agree a truce. A human's offer is priced by the same functions that score
  the AI's, and what the table shows you is which deals are **viable** — where no number exists
  that both sides would sign, the row says so rather than letting you discover it by trying.
- **You can watch the fights back.** Every engagement your people stood in comes back to you at
  the next window with its tick-by-tick log — who shot at whom, with what, at what odds, and what
  it did to them. The grid was already producing this for *every* firefight in the contest and
  the day loop was discarding it, which is all of the cost and none of the use; it is switched
  off for fights you were not in, which is most of them.

**The season splits at the drop.** `closeSeasonToDrop` assembles the contest, `prepareDivide`
hands it over, `finishSeason` settles what comes back — and `closeSeason` is a wrapper over the
three with no logic of its own, the same discipline `runSeason` is held to. Sitting through the
contest in silence settles *bit-identically* to running it off; answering the window changes the
outcome. Both are guarded, because a stepped path that matched no matter what you said would
mean the window did nothing.

### The ground, and how long things take

- **A firefight takes hours.** It used to take no time at all: contact was detected on a tick,
  the whole engagement was fought inside it, and everyone was free to march before the clock
  moved. Longer fights occupy more of the day, from the turns the grid actually took. Being in
  one is a place you are — you cannot march, claim, or be pulled into a second — and the ring
  keeps closing while you are held there.
- **A withdrawal is fought, not declared.** *Ruled at this step.* The fight used to end the
  instant somebody called the retreat, so the bounding withdrawal COMBAT.md describes had
  executed zero times in the project's history: nobody covered anybody, nobody crossed ground
  under fire, nobody reached their own edge. A side pulling out is on the field until its people
  are off it. **This is the largest single change to lethality so far** and it is not a defect:
  every fight in the game used to stop at the moment it became dangerous.
- **Shooting is heard.** How far depends on what was fired and how long it went on, measured
  against a day's march rather than against contact range — a sound you cannot reach in time is
  a rumour, not information. What a corp does about it is temperament: the same dial that
  decides whether it seeks fights decides whether it walks toward the noise or away.
- **You run toward gunfire.** Squads close on a fight in progress faster than they march, scaled
  by that same appetite. Without it, arriving partway through is arithmetically impossible.
- **A squad can walk into a fight already in progress**, entering on the bearing it approached
  from — which is why placement had to stop knowing only two edges.
- **You stage outside contact range or you are not staging.** The flankers' ring sat inside the
  distance at which squads find each other, so a pincer set itself up inside the bubble it was
  meant to spring from, and its three prongs were all within one engagement of each other.
- **Being caught from two arcs costs you the ground you chose.** Cover is directional, so a
  squad that set up against one threat and was hit from another is behind a wall facing the
  wrong way. The flag for this had been computed since Step 6 and read by nothing.
- **Being caught in the open is a windfall, not the absence of a problem.** *Ruled at this step.*
  The open-ground case was the ceiling — cover only ever subtracted from it, so there was no
  reward for catching a body exposed, only a penalty for one being covered, and the very best a
  flank could do was claw back to ordinary. Flanking bought about **twelve points** of hit
  chance for a whole action, so the movement scorer's preference for standing still was not a
  fault in the scorer: it was a correct reading of a game in which moving did not pay. The open
  multiplier is now 1.60. Through **ten full contests**, where corporations buy their own kit:
  clock-outs **down 57%**, hit rate **up 34%**, fights **19% shorter**, and permanent losses up
  **3.7%** — fights end sooner, and the shots saved pay for the shots that land. Those are the
  numbers to trust.
- **1.60 IS NOT YET A VERIFIED CHOICE.** The value was picked off a 500-fight matched-seed sweep
  that reported clock-outs 64 → 28 and movement 42.6% → 49.0%. That harness armed all twelve
  fighters with `DEFAULT_LOADOUT`, which is a fallback and not what a squad carries — a field
  with no machine guns in it and therefore no suppression, which is true on a third of all shot
  evaluations in real play. The contest figures above are sound because they ran the contest.
  The **comparison between candidate values** is not, and 1.60 should be re-picked against
  contests before anyone treats it as settled. The one part that survives is arithmetic rather
  than measurement: 1.85 puts a body caught in the open at close range at 93% with nothing left
  to do about it, and 1.60 puts that worst case at 80%.
- **Ground is held.** Claiming a site makes you its holder — a value four systems read and
  nothing wrote, so taking ground off somebody was worth exactly what walking onto empty ground
  was worth, and standing on a rival's claim never forced a fight.
- **You have to find them first.** *Ruled at this step.* Both sides used to deploy in full view
  of each other and stay there. A `spotted` flag was set true when a body was built and never
  written again anywhere in the tree, so the two things reading it were unreachable: the halving
  of your hit chance against a body whose position you do not have, and half of Ambush Instinct.
  Measured before the work: **6,533,361 shot evaluations across three contests, none of them at
  an unspotted target.** A body is now in one of three states, and the middle one is the
  interesting one — **seen**, **heard** (you fired, so they know roughly where, and can shoot
  back badly), or neither, in which case you are not a target at all.
- **Sight is squad-wide.** *Ruled by the designer at this step.* What one of us can see, all of
  us can act on; you still need your own line of fire to shoot, and what the squad shares is
  where they are. This is what makes a scout worth a place — they need not be the one who takes
  the shot. Through six contests it carries **a third of every shot fired**.
- **How far you can see is the distance at which range becomes long.** Not a fitted number: the
  band table already said what "far" means on this grid, and past the point where a rifle is
  working at its limit a body is a shape in the rocks. Long-range meetings genuinely open blind
  — the nearest pair starts about sixteen tiles apart against a sight of fourteen — and about a
  quarter of contest fights are not in contact on turn one.
- **The opening distance is unchanged.** Fog hides people across the gap rather than widening
  it; the planet's terrain still decides how close two squads meet, which is work already done.
- **Shooting from concealment is steadier, and firing gives you away.** Sized against the
  first-strike bonus that already existed rather than picked to hit a casualty figure. `silent`
  exempts the first shot, which is the quirk's written job and what it had been waiting for —
  it keeps its other job of deciding how far a firefight carries across the world map.
- **Overwatch will not fire at somebody nobody has found.** Line of sight alone used to be the
  whole test, which was right when everybody could see everybody; leaving it there would have
  quietly cancelled most of fog, because overwatch is the commonest second action on the field.

> **PARTLY DONE — bunkering is better, and it was not fog that did it.** Fog was the stated hope
> and it did nothing for this: with fog alone the share of body-turns containing a move was flat
> and fights got no shorter. What moved it was making exposure expensive. On identical seeds the
> move rate goes 42.6% → 49.0% and clock-outs 64 → 28; through ten contests clock-outs fall 57%.
> It is better, not solved: fights that still stall show the same flat shuffle at about a
> quarter of bodies moving, there are simply far fewer of them.

- **Having just moved leaves you easier to hit, and crossing on a dash more so.** *Ruled at this
  step.* `repositioning` (1.15) and `_crossed` (1.30) were read by the shot calculation and
  written by nothing, so movement was specified as costly and was in fact free. A normal move now
  sets the first, a dash sets the second, and both wear off when your own turn comes round —
  deliberately not at end of turn, which is the mistake `suppressed` makes, expiring on half the
  people it was applied to before they ever act.
- **The scorer had to be able to SEE it, and that is most of the work.** A candidate tile that is
  not the one you are standing on can only be reached by moving, so the threat function now
  evaluates it as a body that has just moved. Wiring the flags at the move site alone would have
  made everyone easier to hit with nothing weighing that when it decides: nobody would move any
  less and they would only die more, which is exactly what happened when overwatch was made
  dangerous without being made a decision.
- **The prediction was wrong and the measurement is the record.** This was flagged repeatedly as
  something that would make bunkering worse. Through six contests each way with real kit:
  movement per body-turn **39.5% → 41.5%**, fights hitting the turn cap **12 → 12**, turns per
  fight **−0.7%**, permanent losses **−0.5%**, deaths on the grid **−7.1%**. Bunkering does not
  return. Absolute movement falls 6.4%, but the number of body-turns falls 12%, so the drop is
  fewer and shorter fights rather than a more timid field. Second-order: **7% fewer engagements
  per contest** — decisive fights wreck squads that then cannot field.

> **WATCH — three second-order effects, none of them chosen.** A fifth fewer engagements happen
> per season (778 → 640), because fights end decisively and wrecked squads cannot field again.
> Fighting withdrawals fire 23% less often — people are put down before they can break off.
> And going to a downed man is now much more dangerous: stabilisations fall 13% and deaths on the
> recovery roll rise 20%. **The reason first given here was wrong** and is corrected: it said the
> `treating` flag already zeroed the medic's cover. It does not — nothing in the tree ever writes
> that flag, so §3.7's penalty for rescuing a man under fire has never once applied. The effect is
> real by a different route: the medic's cover is set to zero directly when they go, and zero
> cover is exactly what just got 60% worse. So rescues are more dangerous than they were AND
> still less dangerous than the document specifies.

> **TRIED AND REMOVED — making overwatch cost something.** The idea was sound and the diagnosis
> behind it was right: overwatch is not chosen, it is what a leftover action point turns into
> ("shoot, and if there is a spare action, watch"), so it ended **99.8%** of body-turns and was a
> quarter of all shots fired. It was built — a body holding an arc became easier to hit, and the
> decision was made a real weighing of gain against risk. It did exactly what it promised:
> watching fell to 37% of body-turns. **It did nothing for bunkering.** Across exposure costs
> from 1.15 to 3.00 the share of body-turns containing a move stayed flat at about 49% and fights
> got marginally longer. Reverted, and the tree measured back onto the baseline exactly.
>
> The reason is the part worth keeping, because it kills a whole family of ideas: **the movement
> scorer has never known overwatch exists.** It weighs incoming fire from anyone with line of
> sight and has no term for whether they are holding an arc. So reaction fire was never
> deterring movement — it was damage arriving after the decision, not a cost being weighed.
> Removing a tax nobody was paying attention to changes nothing. Any future attempt to unstick
> movement by adjusting what reaction fire *costs* will measure as no change for the same reason;
> the thing to change first is what the mover **knows**.

> **FOUND DEAD — five of the shot calculation's nine situational modifiers are never written.**
> Verified two ways: a grep of every file, and 1,753,465 live shot evaluations through a real
> contest. `treating` (§3.7, "the most dangerous thing in a firefight" — the multiplier exists and
> has never applied), `_crossed` (the 1.30 penalty for sprinting across open ground), `repositioning`
> (the 1.15 penalty for having just moved), `hovering`, and `_bulwarked` (the Olmac walking-bulwark
> trait). All read by `hitChance`; none written by anything. `flanked` is written 6.5% of the time
> and is inert by construction — see the note in `incoming`.
>
> **Two of those cut against the obvious reading.** Crossing open ground and repositioning are
> currently FREE. The game specifies penalties for both and applies neither, so movement is at
> present under-punished rather than over-punished. Fixing them as obvious bugs would make
> bunkering *worse*. Whoever picks them up should decide that deliberately.

> **NOT DONE — overwatch is still a subsidy for standing still.** A reaction shot lands at 17.6%
> against 19.1% for an aimed one, and it is bought with an action point that had no other use.
> Nerfing its cost has been tried and does not help (above). Untouched.

> **DONE — cover comes down.** Rounds work on whatever the target is hiding behind: ordinary
> fire chips a grade at a time (rubble still counts, so pieces degrade rather than vanish), and
> an `area` weapon does it at nearly ten times the rate across a small radius — which is the
> job that tag was written for and had never once been read. A grenade takes the ground apart
> where it lands whether or not it caught anybody. Measured across three contests: about two
> and a half grades knocked off per fight and roughly one piece flattened. The effect the
> ruling wanted shows up in the snapshots — the entrenched stalemate that used to grind for
> twenty exchanges now resolves in eight — and the five recorded fight transcripts were
> re-recorded, deliberately, because the model changed.

> **DEFERRED — time of day still has no reader.** Fog is not night. `night_ambush_warning_bonus`
> stays on the inert list and the grid still has no clock; pointing that hook at a spotting model
> because a spotting model happens to exist is exactly how Ambush Instinct got wired to the wrong
> flag in the first place.

> **DEFERRED — how much fog there is.** Sight distance, what concealment is worth, and how long a
> muzzle flash gives you away are three dials with defensible anchors and no tuning. They belong
> with the rest of calibration and were deliberately not fitted to an outcome.

> **DEFERRED — a fighter will not trade cover for an angle.** Going round the side is now a move
> the code can propose; it was not, and no scoring could have chosen a tile that was never
> offered. It rarely wins, because cover is weighted heavily on purpose — it was raised to stop
> squads walking out of good ground on turn one. Whether a fighter should accept exposure to get
> an angle is a balance question and waits with the rest of calibration.

### What a hit does

- **The grid is aiming at X-COM 2's shape**, and much of it already matches: two actions a turn,
  directional cover that flanking strips entirely, overwatch, line of sight, weapons with
  characteristic behaviour rather than only different numbers, and reinforcements arriving
  partway through a fight. Turn order is the deliberate divergence — whole-side alternation gave
  the first mover a 55% edge with identical squads, so this interleaves fighters by initiative.
- **A HEALTH POOL REPLACES THE SEVERITY BAND.** *Ruled at this step.* A hit currently rolls once
  and lands in one of five outcomes — graze, light, serious, critical, killed — with no memory
  between hits, so a single roll can remove somebody and a fight has no middle. A pool gives
  armour and stats somewhere to live and gives a firefight the "two more hits and he is out"
  decision the whole genre is built on.
  **It goes UNDER the existing state machine rather than replacing it.** `ok`/`light`/`down`/
  `dead` are read in twenty-one places across three modules and nothing in `season.js` touches
  them at all; a pool that empties into `down`, and overkill into `dead`, leaves every one of
  those readers alone. What changes is `resolveSeverity` returning a number, `applyHit`
  subtracting it, and `rollInjury` keying off how somebody went down rather than off a band.
  Armour's three numbers — protection, resist by damage type, and the type of the incoming
  round — stay exactly as they are and become damage reduction, which is what they always read
  like.
- **Cover must be destructible.** *(BUILT — see "cover comes down" above.)* Cover here was permanent terrain, so two squads behind good
  walls is a genuinely stable position and the movement scorer is correct to tell everybody to
  stay — which is what "they bunker down and stop moving" is. In X-COM the answer to a stalemate
  is removing the wall, and the threat of that is why nobody can sit. The `area` tag is inert in
  the catalogue waiting for precisely this.
- **Vision and concealment are the largest gap and are not deferred for ever.** Both sides see
  each other from turn one, so a fight opens as a stand-up exchange rather than as somebody
  walking into somebody. It is `silent`'s original written purpose, which was given a different
  job — how far a firefight is heard — because the spotting model was not being built.
- **The wound pool is BUILT and deciding outcomes.** A body carries about twelve, grit-scaled.
  A firefight now has a middle: 0.67 dead, 2.77 down and 5.70 hurt-and-still-shooting per fight,
  over 16.6 turns. It was built inert and proved bit-identical before it was allowed to decide
  anything, which is how we know it is charged from the severity roll that already happens and
  draws no random number of its own.
- **DURABILITY IS GRIT, AND `condition.health` IS INERT.** *Established by experiment this step,
  after several wrong reads from the source.* The pool size is `hpFor` = `HP_BASE`(7) +
  `HP_PER_GRIT`(0.35) × grit, i.e. about 9–13 for ordinary hands — grit does double duty, sizing
  the pool AND softening every severity roll (the grit divisor). The `condition.health` field the
  roster used to display is a recovery meter (heals +30/month to a cap of 100, drops on a
  prisoner's arrival knock) and touches combat NOWHERE: forcing it to 1 or to 500 across every
  fighter changed deaths by exactly zero on every canon seed. The roster's "Health" now reads
  `hpFor` instead, so the sheet shows the number that actually decides survival. Race toughness
  therefore already exists, implicitly, through grit's race leans (Olmac +3, the light-frame
  races negative) — which is why a separate race-health stat was NOT added. A dedicated race
  durability term remains open (queued in the hub) but would be a balance project of its own.
- **The talent system has a MEDIUM tier.** *Ruled this step.* The catalog has three weapon
  ranges (long/medium/short, medium the most common) but talents folded medium into "close," so
  the most-used range had no trade of its own. There are now six families —
  long/medium/close × ballistic/energy; `skillFamilyOf` maps a medium weapon to its own trade
  and short still folds to close. Added balance-neutral (deaths held at ~93/Divide over 20 canon
  seeds by keeping the medium origin-leans conservative). Sworn by `probe_stat_scale.cjs`.
- **Getting your people off the field is not the same as being wiped out.** A side that
  completed a fighting withdrawal ends with nobody `ok` or `light` — everybody is `withdrawn` —
  so it was scored as OVERRUN, and its wounded took the penalty for a field that was never
  taken. That is the exact fault already recorded against this line, reintroduced the moment
  withdrawals started actually playing out. Fixing it took sides scored as overrun from 46% to
  32%, deaths on the recovery roll from 47 a contest to 36, and **the loss rate from 55.1% to
  50.4%** — the first movement any dial has produced.
- **THE CONTEST GOT MORE LETHAL, NOT LESS — 42.6% to 55.1%** — from a change that made every
  individual fight less so. Squads that used to be destroyed now survive to meet somebody again,
  so fights per contest went from 57 to 80.
- **HALF THE DEATHS IN THE GAME HAPPEN ON THE RECOVERY ROLL** — 48% of a contest's dead against
  53% killed outright by a round. That figure read as ZERO for a whole session because
  `downDeaths` was never initialised in the grid's telemetry: `settleAftermath` raises it with
  `(tel.x || 0) + 1`, so an engagement where nobody died there left it `undefined`, the contest
  aggregate went NaN on the first one, and every `|| 0` downstream reported a confident nought.
  **The same fault, in the same words, as the three counters already recorded above, on a
  fourth.** A correct change was written, measured against the NaN, and reverted on the strength
  of it before the counter was fixed. **The suite now plays a contest and asserts that every
  number it reports is a number**, which found a fifth on its first run — `audit.passedOver`,
  declared on `stats` and not on `stats.audit` while both are raised on the same line.
  Looking for the pattern by READING the source was tried first and thrown away: four false
  positives out of six, and it missed the real one. NaN is a runtime property, so it is checked
  by running the thing. The lesson this project applies to its game now applies to its tools.
- **Whether a downed fighter gets up now depends on what put them down** — worn out by grazes
  and they are carried out, opened up by a critical and it is close to even. It did NOT move the
  loss rate: recovery deaths fell by five a contest and outright kills rose by six, which is the
  stream diverging rather than an effect. Kept because a flat survival chance is wrong once a
  body can be emptied by grazes, and recorded as neutral rather than sold as a fix.
- **Elevation is CUT, not deferred.** *Ruled at this step.* A deferral list either shrinks or
  the items get cut, and this is a cut.

### Deals

- **Negotiation is the largest brake on lethality in the game.** It is not a side system.
- **A deal struck is binding until it is broken, and breaking it is a real act with a price.**
  Betrayal is available, ruinous, and sometimes correct.
- **The Aleas rules on treachery**, and its punishment is the largest in the act table — a
  convicted corp finishes below last.
- **A stand-down is a legitimate way to survive.** Quitting the field costs standing, and the
  crowd charges most for quitting late.
- **Corps fight under each other's banners.** Once joined you cannot break away and cannot join
  someone else — but a corp with others beneath it may join a third, dragging its whole umbrella
  along, and those beneath get no say. That asymmetry is the point: you sold your independence.
- **An umbrella shares its intelligence**; a non-aggression pact does not. A truce is an agreement
  not to shoot, not a friendship.
- **Captives are negotiable**, on their own or folded into joining terms. Unransomed, they are
  left to the whims of their captor, who may kill them, release them, or keep them.
- **The clock is not an ending.** On the last day the ring closes to a point where there is
  nothing but conflict, and it runs until one banner is left standing. **The contest does not
  time out; it ends because everyone else stopped.**

### Who is watching

- **Four audiences on a signed scale**: your own ships, each rival's fanbase, the wider fleet,
  and the Aleas. **Loathing is a real position, not the absence of fame.**
- **A rival's fanbase is a spectrum.** Being hated by people who tune in to hate you is worth
  something.
- **Fame is attention, not approval.**
- **The board asks for what its holds are short of**, and spends patience rather than cutting
  funding.
- **Funding runs both ways.** A cheap year earns patience and an expensive one burns it, measured
  against what the board actually put in.

### Kit

- **Kit reaches a fighter as a catalog item or not at all.** No system may substitute a bare
  `{power, protection}` for a real one. That is what a looted crate used to do, silently deleting
  every quirk, damage type and resistance of whoever it was rewarding — *while measuring as a
  reward*.
- **Nothing is free and nobody deploys unarmed.**
- **The dead leave their kit on the ground**, and the side holding it recovers some. This is how
  the armoury drains, and it is attached to the thing the game is about.
- **There is no gear damage and there is not going to be.** In most games it is a money sink
  wearing a decision's clothes — you always repair, you always can afford it, you click. This
  game already drains kit through the channel it is about.
- **Weapons have characteristic behaviours, not just numbers.** Shotguns throw shrapnel, machine
  guns spray, and those are mechanical facts rather than flavour.
- **Each corporation has a gear identity** — a lean, never a stack. One known for its marksmen,
  another for the flurry of bullets.
- **Tier-five weapons are largely unavailable.** You win them late, from a sponsor who wants it
  on camera.

### Calibration

**Deferred, by ruling.** Structural completeness first. Measured imbalances are recorded, not
chased. The fail state alone moved four times in one step as unrelated things were built.

---

## Unification

**The engine is already unified, and that is the important fact.** Every system lives in one
module graph, is driven from one season loop, and is guarded by one suite. There are not eight
implementations to reconcile. What is *not* unified is the surfaces:

| | |
|---|---|
| **the game** | `the_desk` — a career, played |
| **live instruments** | ~~`the_year`, `the_crate`, `the_bench`, `the_table`~~ — retired once the unified page landed; single-surface pages on the old engine, deleted with their templates and builders rather than left to drift |
| **baked reports** | `the_career`, `negotiation_table`, `audience_board`, `armoury` — snapshots, stale by construction |

So unification is an interface job, not an integration job, and the risk of it "falling apart" is
much smaller than it looks — the parts already share one engine and cannot silently disagree
about a rule.

**Layer in the order a player meets things in a year.** After each layer you can play a career
forward from the season open to that point, which means every layer is testable the only way
this project trusts: by running it. Integrating by system instead — all the kit, then all the
deals — leaves half-integrated things sitting between working ones with nothing able to reach
them.

> **DONE — this integration plan has been carried out.** All six layers below were built, and
> the surfaces described above were unified into one page (`the_corp.html`) with tabs: the Desk,
> the Roster (now folding in Hiring), the Squads board, and the Divide's Firefight, Table, and
> Board. The prep months exist and are playable end to end; the armoury and kit are chosen in
> the months and spent at the lock; the Divide's three surfaces run the live engine in the page.
> The list is kept below as the record of the order it was done in, not as outstanding work.

1. **Name what is game and what is instrument.** Free, and it stops anybody building a screen for
   something that was always a bench. An instrument that stays an instrument is not a failure.
2. **One shell, one career.** The desk is already it; save/load is already the persistence. Fold
   observation in — watching a season you are not managing is `the_year`'s job and belongs beside
   the desk, not in a second page with its own career.
3. **The prep months, with kit.** The armoury is the first thing a manager wants that the desk
   cannot show. Kit is chosen in the months and spent at the lock, so it lands here.
4. **The seam.** Already built and already on the desk; it only needs to stop being a panel and
   start being the week before the drop.
5. **The Divide.** Crates, the negotiation table and the fight replay all live inside the
   contest, and all three already run on the live engine — they are being re-sited, not written.
6. **The career view, last.** It is the only surface that reads a whole career, so it is the only
   one that cannot be built until everything before it is producing real history.

**The two things to hold on to while doing it.** `SAVE_VERSION` must be bumped the moment the
state shape changes, because a save that half-loads is worse than one that refuses. And the
whole-year playthrough has to be re-run after every layer — not the suite instead of it, both.

## What is deliberately absent

Code is silent about absence, so it is recorded here.

- ~~**The Divide's spectacle.**~~ **Closed.** `the_ground` draws the contest — the terrain field
  squads actually walk through, the closing wall with next day's circle ghosted inside it, every
  squad's position and facing and where it is marching to, fights where they happened. And
  `the_firefight` draws one engagement on the grid, turn by turn. Both run the live engine in the
  page. The recorder behind them had existed since Step 6 and nothing had ever read it. *Both
  drawings now live as tabs of the Divide inside `the_corp.html`; the standalone pages were
  retired with the rest of the single-surface views.*
- **Media.** Sponsorship landed at 8.14; the media half — coverage, the press, a reputation you
  perform for rather than earn — did not, and is deferred on the same grounds sponsorship was.
- **Aleas corruption, syndicates, scandal.**
- **Three weapon tags and the systems they wait on**: turrets and grenade scatter on the grid,
  and time of day. A deferral list either shrinks or the items get cut — the gear-damage tag was
  cut with gear damage rather than left waiting for ever. `silent` came off this list without the
  spotting model it was waiting on ever being built: it now decides how far a firefight is heard,
  which is a different job for the same word and a real one. Four items carry it and every corp
  that bought one had been paying 1.2 points for nothing.

---

## Open questions

Things that need a decision rather than a programmer.

- ~~**Should a twelve-season career contain a dismissal at all?**~~ **Ruled at 8.8**: dismissal is
  the player's game-over, and roughly one every couple of years from an AI corp is the shape
  wanted. Tuning toward it is deferred until every system is in, so the current zero is expected
  rather than wrong. *(One stale constant still sits underneath and is not a tuning matter: the
  underwrite triggers on a shortfall larger than any that has ever occurred, and would stay dead
  at any dismissal rate.)*
- **Should spending less be able to satisfy a board on its own**, or does thrift need a
  counterweight — a board that notices you finished eighth with sixteen people?
- **Whether the Dividend's double edge exists**: performing reveals strength you might have
  wanted sandbagged.
- ~~**Is surveying a decision?**~~ **Answered.** The Gather Intel rework made it one: you paint
  an eight-focus budget across specific rivals and the coming planet, buying frozen intel
  snapshots that decay over three years, and rival preparedness now feeds the Divide fight
  (`opts.rivalEdge`). WHO you study and HOW deeply are now real choices, not a season-long
  on/off habit. Sworn by `probe_intel.cjs`.
- **Permanent losses have drifted well past the ruling.** "Most corps lose about a quarter of
  their people each Divide" is what this document says; measured it is now **42.6%**, from 28%
  at the start of the step. Playing out withdrawals is most of it. Recorded rather than chased,
  because calibration is deferred — but it is the furthest any figure has drifted from a stated
  ruling, and the dials are the threshold at which a squad calls the retreat, how much of it
  covers each bound, and how far a bound carries. None have been touched.
- **Squad shape is now a decision.** *Built since this was written.* Ruled: three to six squads,
  three to eight people each, with a manager choosing who stands with whom and who leads. The
  Squads board delivers exactly that — membership is placed by the manager (pick a fighter up,
  click a squad; drag-and-drop was tried and retired as too crude), not derived from the drop
  list; leaders are chosen per squad rather than being whoever has the highest tactics; and
  loadout is edited per hand through the fighter's sheet, which opens as a drawer from the board
  and shares its blocks with the Roster's rail. What remains open is only tuning (how many
  squads a corp *should* field, and whether the game should push toward a shape), not the
  mechanism.
- ~~**Nobody chooses what their people carry.**~~ **Answered.** The squads screen's shared
  detail panel has an equip picker wired to `plan.hand`, so the manager now arms each hand
  directly rather than leaving it to house doctrine, the locker and the money left.
- **No corp ever asks for a full force.** The bodies are there — 56 of 96 corp-seasons have 24
  or more fit at the lock — but the AI's appetite never reaches the ceiling, so drops land
  across 16–23. A human can still ask for 24. Recorded, not chased.

---

## The map

```
sim/     prng · roster · items · ledger · reputation · combat · tactical · negotiate ·
         map · divide · season          ~11,500 lines, commented with the reasoning
         arx.cjs        the suite
         audit_open.cjs · audit_docs.cjs         what is true, tested by running
         probe_*.cjs    measurement tools, each answering one question
         build_*.cjs    viewer builders — run them after changing anything they inline
data/    items · traits · races · recruitment · planets · oa_profiles · schemas
viewers/ the_corp — the game, one page with tabs: Desk, Roster, Squads, Negotiation, the Board,
         and the Divide (which draws the contest and the firefight)
         the_desk — the prep year alone, played a month at a time
         the_career · armoury · audience_board · negotiation_table — baked reports
docs/    this file. The nine documents it replaced are archived outside the tree and are not
         maintained; nothing here should ever need them.
```

**`sim/combat.js` is a shared library. `sim/tactical.js` is the engagement model.** The grid is
where fights happen; combat.js provides stats, aim, severity, injuries and composure to it. They
should not be rival resolvers, and treating them as such has cost this project real time — for
three steps the documents called the grid an experiment while nothing in the game called it, so
every casualty figure of that era answered a question about the wrong resolver.

**But one rival is still in the tree, and it is the suite's.** `combat.js` also exports
`simulateEngagement`, the older abstract band resolver. Nothing in the game has called it since
Step 7.5. About nine checks still do, including the ratified gear-and-stats split, the five
fixed-seed snapshots, the determinism check and the 600-engagement invariant sweep. Asked the
same question, sides swapped and two populations, the two disagree hard: a tier of gear is 20–40%
on the abstract resolver and near 80% on the grid. **The certified number describes the game
nobody plays.**

*Cut at 8.9.* 622 lines gone; `combat.js` remains the shared library the grid calls. *Fourteen
more functions came out later*, in four layers — each one only kept alive by the layer above it —
and `combat.js` fell to 934 lines. They were the last of the abstract resolver. **Eight trait
hooks went inert with them**: their only reader sat inside a function nobody called, so the
parity guard had been reporting 36 hooks live when 28 actually ran. That is the same failure
already recorded against that guard, one layer down, and it is why `audit_cross` now looks for
uncalled functions. Time of day went with it — `night` was read only there — and stays deferred until it is
built for the resolver that exists. The snapshots adopted new fixed numbers once, deliberately.

**Pointing the sweep at the grid found three faults in its first run, none of them reachable
while the guard was aimed elsewhere.** The casualty tally had no field for `stable` and had
never accounted for every body. A duplicated cooling pass shed heat twice an exchange, so no
weapon could reach a vent and the sidearm swap behind it never fired. And three telemetry
counters were never initialised, so `undefined += 327` left NaN, which every reader's `|| 0`
turned into a confident zero — a mechanism firing 327 times reported as inert.

**The guards themselves were leaning on the dead resolver.** Trait-hook parity scanned every
module except `tactical.js`, and counted only one of the two idioms by which hooks are read. It
passed because the abstract resolver was fat enough to clear the bar alone. With the grid
scanned, **seventeen trait hooks were read by no system at all** — named one at a time in the
suite so the list can only change deliberately.

**Step 8.10 took three of them off it.** Suppression had existed on the grid since Step 5 and
never read the traits that name it, so Trigger Itch, Ammo Miser and Smothering Fire were flavour
text. A shooter's output now decides how far from the mark their fire catches people, and a
defender's resistance is a chance to refuse the pin outright.

*Guarded by what they do to the ground, not by whether the resolver mentions them.* A hook can
be referenced and still reach nothing: Trigger Itch was first wired to WIDEN a spread, and only
`suppressive_2` weapons have a spread — the machine gun most of these fighters carry is plain
`suppressive` and pins one man. The suite measured 4,610 pins against a baseline of 4,720,
called it noise, and was right. It grants the spread now, which is what shooting at movement and
shadows means. **Twenty-two hooks remain inert**, most of them clustered on squad cohesion —
`presence_aura`, `cohesion_morale_bonus_near_squadmates`, `squad_coordination_bonus`,
`rout_immune` — which is the argument for cohesion being the next step and taking most of them
at once.

## The colour pass — houses wear their own colours. *Ruled at this step.*

Every OA shows ONE display colour, derived from its canon pair in `oa_profiles.json` by
`sim/palette_oa.cjs` and written to `data/oa_display.json` with its reasoning beside it. The
rule: the canon primary unless the measurements refuse it, then the secondary, then a recorded
nudge — bars of ΔE 12 against every other house, the nine race fills and the grounds they share
a canvas with, ΔE 10 against the interface's semantic voices, and L* 30 so nothing sinks into
the night. `--check` mode verifies the written table still derives from canon. One canon colour
was re-ruled on the way: two near-white houses could not hold apart on any surface, the medics
kept the white, and the Marksman's House took gunmetal `#8e9db4` — the reason recorded in the
canon file itself.

The positional palettes died here: `SIDE` (three colours by seat) and `BANNER` (eight hexes by
berth) are retired with WAS-HERE notes, replaced by `colFor(corpId)` on every surface that
names or draws a house. **Cyan stays the interface's voice and no house may own it** — "you"
are marked structurally (the edged row, the you-tag), never by hue. The founded house picks
its colour at founding from twelve swatches the instrument pre-vets against everything above,
so a confusing pick is impossible rather than validated away; the pick rides on the profile
and every surface honours it through the same `colFor`.

**The marks.** *Ruled at the same pass.* One mark per house, drawn from its own tag, motto and
lore — the weight, the witnessed star, the nested years, the assembled frames, the new line,
the drill in the seam, the sprout in the cradle, the open ring — stored as proposed art in
`data/oa_marks.json` (24×24, `currentColor` so the house colour carries it) awaiting a human
artist. Dosage: marks live where identity is the point — the banners, the encounter lines, the
roster heads, the lock — and stay out of flowing prose, which keeps its colour-only names. The
founded house flies the empty pennant: a house too new for a device.

**The rest of the palette, audited. *Built since this was written.*** The same reading holds on
every page: a fighter's NAME wears their race's fill (the colour of their circle on the field)
on the Roster, the Squads, the Dividend, the Desk's Training and Recovery grids, the Talks, the
month notes, and the Firefight's side rosters. A STAT is a label in the stat's own colour
(`STATCOL`, the Training grid's) with its number on the grade scale — green high, red low,
against the roster's spread — rendered by one `statCell()`; the sheet's older per-stat value
hues (`--s-aim` and kin) are retired, and the abbreviations are one set (Aim Gri Ref Fld Tac
Pre Res). Health grades on its own spread because hit points run 8–13. CREDITS are gold with
the ₡ through `crs()` wherever they are a plain figure — salary, treasury, asks, prices,
purses; only the trade beam signs its totals good/bad, because there the colour is direction.
A CORP is `cSpan()`, never a plain name. Tiers are the badge. Squads are the six hues. Origins
are the three.

**The turn has a shape. *Built since this was written.*** Every month opens with THE BRIEF at
the Desk's head — the month's name and shape in a line ("Your Own Ship's Discount Pool Signs at
the Month's End"), whether the table is open, what is coming and when as countdown chips
(Natural-Born Refresh Next Month · The Dividend in 3 · The Table Closes in 8), and the AGENDA:
what waits on the manager this month — a house that has written, the board asking, a signing
sheet with nothing marked, focus unspent, a roster under the drop floor, no squads set at the
lock, hands incomplete — each a line that jumps to its tab. End the Month counts them ("End the
Month · 2 Waiting"). Every month closes with THE RECAP, a page that stands between End the Month
and the next brief: the month's work and its window, the training that took (the biggest gains
by fighter and stat), money (the treasury before and after, the ledger's lines), people (who
came, who left, whose status changed), standing (own, fleet, patience, each with its move),
and what was left waiting — then Continue, and the next month's brief. Nothing an AI corp
needs; everything a human turn was missing. The recap is what makes "I ended my turn" a
felt thing. (Phase 1 of the game-not-simulation plan; Phase 3 makes what is left waiting
resolve against you, Phase 2 fills the agenda with events.)

**The days walk between windows. *Built since this was written.*** The Ground only ever
animated the finished contest's replay; live, the comms windows drew complete. The window hands
the page the record so far (`record`, the days with their tracks), the page keeps to its own
house's squads on it and lays the picture on the latest day as sightings, and when the Ground
opens after a window the days since the last one play forward — the scrubber taking the days so
far, the Play control theirs. The truth of the other houses' movement stays with the replay.
The Drop page fits a screen: the map bounded, the landings and the key beside it, the order
strip compact.

**Shadow, screen, and the rendezvous that ends in a strike. *Built since this was written.***
Two manoeuvres the dispersed drop wanted and the mind did not have. SHADOW: a squad keeps a
stronger known enemy in sight at `SHADOW_DIST` — outside contact, inside knowledge — its aim
recomputed each dawn from the picture, done when the quarry goes out of it; the house's picture
stays current without a fight. SCREEN: a squad stands between a digging mate and the nearest
known threat at `STAGE_RADIUS` from the mate. Both are approaches the planner can choose (leaned
toward by the careful stances) and orders a manager can give (Shadow names a sighting; Screen
names a squad). And a RALLY CARRIES A PURPOSE: when what drove a house together is something it
can beat together (`then`), the meet hands off into a hunt on arrival — meet, then strike — so
a rendezvous is not the end of a plan but the middle of one.

**The picture on the map. *Built since this was written.*** Live, the Ground shows what your
house knows and nothing more: your own squads and your banner's as they are, every other house
as its last sighting — a hollow circle in its colour with the count inside and when it was seen
beneath (Landed, or the day), fading with age and gone when the picture forgets — and nothing
where you know nothing. Sight and contact rings draw only round your own. The map used to draw
every rival's true position every window, against the ruling. The truth waits for the replay,
which is the broadcast.

**Orders at the window. *Built since this was written.*** A manager's squads take orders in
the planner's own vocabulary — Hold, Move, Dig a site, Meet a squad, Hunt a squad the house has
seen, Fall Back — on the Table's squad rows, each a menu built from what the house knows: the
sites revealed, its own squads, the picture's sightings (with the house, the count, and when).
`answer.orders` = { sIdx: order }; the Divide turns each into an intent with the manager's name
on it (`ordered`), and the planner leaves it alone until it is done or runs out — a Hold or a
Meet standing where it is put, arriving being the point. Symmetric by construction: an AI's dawn
plan and a manager's order are the same object executed by the same march. The row says what
each squad is doing and whether it was ordered.

**The dispersed drop — step three, the picture and the squad mind. *Built since this was
written.*** What a house knows of everyone else is a PICTURE now (`corp._picture`: where a
foreign squad was when it was last seen), not the `flares` that handed every corp every live
position every dawn. The picture is written by the posted landings (every house, day one, good
for `LANDING_KNOWN_DAYS`), by contact (both sides and their banners, when detection passes),
and by the relay mast (everyone under the tower's banner); it is read fresh, a sighting older
than `KNOWN_STALE` dropped. The dawn planner — strikes, pincers, hunting, hiding, the rest —
runs on the picture, so a squad hunts what its house has seen, not what exists. The squad mind
gains RALLYING: a house spread by its draft, with a stronger known enemy within
`RALLY_THREAT_RANGE`, gathers at its own centre inside the wall (`meet`), leaned toward by the
careful stances and away from by death-or-glory. Measured with the picture and a random strict
draft against today's grouped landing at today's radius: week-one fights the same (18–29 against
22–34), deaths the same (54–68 against 60–64), contests a little longer; a larger ring runs the
contest to the last day without changing the deaths. The radius stays where it is. The fatality
pass — half the drop dies — is the next piece, and it is now the only thing between the
dispersed drop and a contest that plays the way it was ruled.

**The dispersed drop — step two, the draft. *Built since this was written.*** At the seam the
twenty-four slots are drafted: the houses in order of strength as the fleet reads it
(`strengthRead`: the drop's quality and size, and standing with the fleet), weakest first,
three rounds, strictly. An AI's pick (`chooseSlot`) values a free slot by what its survey lets
it see — the prize and the cover by its greed — and by who has landed within two slots of it:
a stronger neighbour it can beat draws an aggressive house, a stronger one it cannot repels a
careful one; its own earlier picks draw a careful house together and push an aggressive one
apart to flank. Every pick is posted. The Drop page IS the draft now: the order strip with
each house's picks, the map with every slot numbered and filled in its house's colour as it
goes, your turn a click on a free slot, your three landings read at your survey's depth, every
landing listed, Drop when it is done. A human picks through `draftPick`; a fleet without one
finishes the draft itself at the seam; `choices[id].slots` carries a remote human's picks.
Measured: a careful house takes three neighbours (6, 7, 8); an aggressive one spreads
(2, 21, 13).

**The dispersed drop — step one, the ground for it. *Built since this was written.*** Ruled:
squads do not drop together. Twenty-four slots round the ring, drafted among the houses lowest
standing first, strictly (no snake — a snake would let the strongest cluster two squads); every
house knows where every other came down, and nothing after. Step one lays the ground: the ring
has `slots(planet, n)` (dry footing, each reading like a sector); the Divide lands a corp's
squads at its picks (`opts.dropSlots`, `opts.slotCount`) or the old way without them; the
planet takes a radius and a wall hold (`opts.radius`, `opts.wallHold`) so the ring can be grown
or slowed if the spread needs it. `measure_drop.cjs` is the instrument. What it said, with a
dumb random draft against today's grouped landing at today's radius: week-one fights the same
(14–31 either way), total fights a little up (57–70 against 49–57), the contest longer (22–26
days against 15–25). The spread did NOT set the ground alight — because the corp AI still
plans as a bloc and pulls its squads together at dawn. The radius question therefore waits on
step three, the squad mind; the knobs are in. And a finding that is not about the drop:
FATALITY. On the seeds measured the Divide killed 77 of 152 fielded and 58 of ~150 — half the
drop — where a stun-grade year killed none. That is the number behind "skyrocketed fatality",
and it is its own tuning pass.

**A pass of fix-ups. *Built since this was written.*** The audit gained a clause rule (six
words around a verb is the page explaining itself, however short) and stopped exempting the
month log's lines, since they show in the recap; the month shapes came off the brief and the
year line, which reads titles only; the refresh months are named for their window
("Natural-Born Window" twice), the pool named on the sheet. The recruitment window stands
ABOVE the roster in its own key — green, the colour of signing — as a grid of prospects, not a
rail. Events read as dispatches: a bar in the kind's colour, the kind named, the subject as a
fighter card, the ways side by side with the cost under each. THE EIGHT cannot be declined —
every house sends someone — and is named by clicking a fighter card; its result, both fours
with each fighter's fate, the purse and Watch, lives in the recap of the month it happened, not
the next month's Desk. ELEVATION draws as CONTOURS: brightness alone could not carry the height
across five hues of brown, so where the ground crosses a height line between one cell and the
next a thin pale line is drawn, at Read depth and above and wherever the squads have walked.
The Drop's sector cards take the colour conventions — prize graded green/gold/red, rivals red,
hidden and height graded, the shore warned, the terrain named in its own colour.

**The year line. *Built since this was written.*** A route map of the year down the left of
every preparation page: twelve stops, the current one lit, the past dim, each in its kind's
colour (the Natural-Born, Bastille and Mercenary months in their origin hues, the Dividend in
magenta, the fleet's month in the wall's violet, The Eight in red, the lock gold, the Divide
green) with its name, a word of what it does, and how far off it is. Chosen over a header
strip (too crammed on a small screen) and a swimlane grid (the systems do not overlap enough
to need lanes yet); the brief's countdown chips came off, the line doing their job. It stands
down for the Divide and on a phone.

**The Eight. *Built since this was written.*** M8: one name from each house — the manager's
choice on the Desk from the fit and unrole'd, or the house's best named for it; declining is
seen (`declined_the_eight`, the fleet and your own people). The eight are seeded by standing
with the fleet, 1·4·5·8 against 2·3·6·7, and fight once on the tactical grid with real kit,
death-or-glory policy, nobody able to call a withdrawal (`noWithdraw`), real deaths — under a
stun-grade edict the year's rule applies here too. Every entrant pays `EIGHT_ENTRY` into a pot
the Aleas top up (`EIGHT_PURSE`); the winning four split it, take `won_the_eight` and the
fame; the dead of The Eight count against the board's Casualties like the Divide's. The Desk
carries the seeding before, the result and a Watch after; the recap says how your fighter's
four did. Measured: one to three of the eight die a year. Every house plays it through
`choices[id].eight` / `nameForEight`, the AI naming by fame and stats.

**The fleet's month. *Built since this was written.*** (Phase 2b.) M7 brings one thing with
fleet-reaching scope, the same card to every house (`FLEET_POOL` in events.js, seeded by the
world): the Aleas close the wall early (the dome's schedule compressed to `FAST_WALL` of its
days); a stun-grade Divide (every fatal round converted, the way the Dividend's are); pacts
forbidden (the Table's truce says so); the survey goes public (every house reads the planet to
depth two); an Aleas levy at the lock; a glut or a shortage that moves the shelf's prices for
the year (`priceMult`, the shelf tags it Glut or Shortage). An edict can be petitioned against
for `PETITION_COST`; if `PETITION_SHARE` of the fleet petitions it is withdrawn. The AI
petitions as a stance — a house the edict cuts against by temperament pays to say so — so an
edict usually stands and sometimes falls (measured: two or three petitions of eight, one
withdrawal in eight worlds). The edicts ride into the Divide as `opts.edicts`.

**Every game's world was the same world.** The planet was seeded from the season number alone,
so every career's Year 1 was one planet, Year 2 another, for every manager who ever played — and
the fleet's month, seeded from the world, came up identical eight times running, which is how
it was found. The world has a seed of its own now (`_worldSeed`, drawn once a career from the
game's rng, carried on the corps so a save rebuilds the same planet). One gate in arx.cjs was
measuring the AI's scouting by accident — it sent a choice shape the engine never read — and
fell when the rng moved; it sends the page's shape now.

**Events. *Built since this was written.*** (Phase 2a.) `sim/events.js`: each month a corp may
draw one or two incidents (`EVENT_P`, `SECOND_P`) from a pool the engine already has material
for, and every one is a card with two or three options and their costs said: a famous fighter
wants a raise (grant, refuse and they sour, release); a fighter carrying `war_debt` has their
creditors call (pay, not your debt and they are hurt for it, sell the paper); a `hot_headed`
brawl in the barracks (punish, fine both, let it lie); a memo from the board wanting the card's
priority moved (move it for patience, hold it and pay); a rival's offer for a named fighter
(take the money and your people notice, refuse, ask double); a slight in the fleet's postings
(answer it, say nothing, laugh it off); a dealer at the airlock with a rare piece; and the
FORK: a veteran with a talent, who can be made your Spy (a free intel level every month) or
your Drill Sergeant (a free drill every month), off the line either way, or kept fighting —
once a career. Events stand on the Desk under the brief and on the agenda with their default
named; unresolved ones take their default at the month's end and the recap says "By Default"
against "Your Call". SYMMETRY: every corp draws; a human answers through `answerEvent` (or
`choices[id].events`), an AI through each event's own policy — the same options, the same
consequences. Measured: about 0.6 events a corp a month, all eight kinds firing across two
seasons. New acts: `sold_a_fighter`, `refused_an_offer`, `answered_a_slight`,
`ignored_a_slight`.

**What is left waiting costs. *Built since this was written.*** (Phase 3.) The agenda's items
each say what letting them slide does, and the recap's *Left Waiting* says it again in red where
it bit. A house that wrote and got no answer: the letter lapses at the month's end and the house
remembers being snubbed (`snubbed_letter`, on their regard for you). The board that asked after
the Divide and heard nothing before the year turned: silence is the answer (`silent_before_board`,
own people and the Aleas, and three points of patience). A sheet with nothing marked: the pool
moves on. Focus unspent: wasted. No squads set at the lock: the quartermaster deals the drop —
a default you chose, said so. An incomplete hand: overridden. The fighter who walks and the
sponsor who leaves arrive with Phase 2's events. And the Desk refreshes on open now; it did not,
so a brief could stand stale until something else redrew it.

**The Board has a spine. *Built since this was written.*** A head line — the year, patience,
interest, the board's verdict once there is one, and a word for how your own people and the
fleet stand; the question, when the board has one, at the top where it cannot be missed. Left,
the card and the holds. Right, *Who Is Watching*: each audience a card with its standing bar
and, inside it, the three remembered acts still moving the number — the memory folded into
the audience it belongs to, where it used to be one undifferentiated list beside them. The
other OAs beneath in a compact block. During the contest the card's placement and win rows
read your banner's live chance of winning.

**The Table is the day. *Built since this was written.*** It had become a grab-bag of five
boxes after the Deal moved out. It is organised around the day now: a head line — the day of
thirty, the window, the weather in words, your banner's chance of winning, who is standing
and hurt and lost, whose banner you fight under, whether a word rides with the advance — with
Next Comms Window as the one primary action beside it. Left: *Your Squads* (each squad's
standing, the ground it is on and whether it holds the height, its rations as days with a
bar, what it is doing) and the recap since the last window. Right: the stance as five notches
that each say what they do (seek, take a fight, risk the wall, from `STANCE_DIALS`), the
declared one marked; your word and its answer beneath, with a way to the Deal when nothing is
composed. The assay moved to the Ground tab, where the map is.

**The survey buys the picture. *Built since this was written.*** The planet dossier's Terrain
row is the resolution of the map, on the Drop and on the Ground alike: Blank is fog — the coast
and the peaks show from orbit, the rest is a grey guess; Sparse is the ground in coarse blocks
with no height; Read is finer with the height on it; Full is the ground as it is. The Sites row
at Full marks every assay site on the Drop's map. During the contest, wherever one of your own
squads has walked reads true whatever the survey bought — the fog lifts along their tracks
(`seenBySquads`, traced between windows). The key says what the picture is worth; the dossier's
Terrain and Sites rows say what each depth buys. Gather Intel and the Divide are one system now:
a manager who scouted lands seeing the ground, one who did not lands blind and learns it by
walking.

**Hazards are weather. *Built since this was written.*** The old `hazardCheck` rolled the same
four effects — fatigue, rations, lost, an injury — per squad-day whatever the hazard was called:
a whiteout did what heat did. Each day now brings one condition over the whole planet
(`WEATHER_P`), drawn from the archetype's own list, and each kind does what its name says
(`WEATHER` in divide.js): a whiteout or sandstorm cuts sight to a fraction and slows the march
and loses squads their bearing; killing cold, heat, thirst and rot burn rations; a storm or
downpour slows and blinds; a flood raises the water for the day (`setFlood`); and the
terrain-bound kinds — crevasse falls, gas vents, currents, collapses, fever under the canopy,
glare on the salt — injure only the squads standing on that terrain. The comms window carries
the day's weather; the Table reads it in words with its figures, the Ground's key lists the
world's weather and what each does, and the planet dossier's Hazards row at full depth says the
same. Measured on a Desert Pan: thirteen weather days of twenty-five; squads rerouted round
water and peaks twenty-eight times and were held by the ground fifteen.

**Water and peaks. *Built since this was written.*** The floor rolls (`BASE_HEIGHT` plus a
slow swell) and rises toward the middle (`CENTRE_RISE`), so the last rings are land on every
seed; below a world's own sea level it is water — Meltwater, River, Lava, Sea, Flood, none on
the Desert Pan — and the cap of a tall hill above `PEAK_LEVEL` is a peak. Neither is crossed:
squads swing their heading up to a half-circle either way for open footing and hold where none
is (`audit.routedRound`, `audit.heldByGround`), nothing worth digging spawns in them, and nobody
lands in them — a landing wants dry FOOTING, a small ring of ground, not a dry point
(`nearestPassable`). The ground between a lake and a peak is the pass everyone must use, which
is the chokepoint without a rule for it. Coverage as measured: the Drowned World a quarter sea,
the others a tenth or less, peaks one or two percent. On the map the water and the peaks draw in
their own colours, and a first cut had the Drowned World's land nearly the colour of its sea —
the palettes now keep land and water unmistakable on every world. The place-name labels came
off the map (the drop points stay); the key beneath carries the world's terrains, its water,
its peaks and the Low → High swatch.

**Elevation. *Built since this was written.*** A world carries a height field (`heightAt`,
`slopeAt` in map.js: five to nine broad domes, 0 the floor to 1 the summit), and the Divide
reads it three ways: the high see the low (detection × (1 + `HEIGHT_SPOT` × the height
difference between two squads)), steep ground is slow ground (pace × (1 − `HEIGHT_CLIMB` ×
slope)), and the side that came from the higher ground meets the fight readier
(`HIGH_GROUND_PREP` on its preparedness, which decides who fires first and how well each side
deploys). The map shades terrain by height in its own key — pale is high — and the sector cards
say High, Rising or Low Ground. The terrain patches themselves are country now: the domain warp
ran at wavelengths longer than the planet, so it read as a uniform shift and the cells stayed
straight-edged; it runs at three to eight waves across the disc, patches take sizes of their
own (`PATCH_WEIGHT`), and the drawing samples cell centres out to the rim.

**A palette per world, and a terrain of its own. *Built since this was written.*** Ruins on a
planet nobody ever lived on were a strange sight. The four common terrains stay (open basin,
broken ground, forest, entrenched); ruins are Dead Industrial's alone, and every other
archetype has a special of its own with its own concealment, forage, pace and cover profile:
the Ice Shelf's crevasse field, the Jungle Cradle's deep canopy, the Desert Pan's salt flats
(nothing to hide behind at all), the Volcanic Waste's lava field (hard cover, hard going), the
Drowned World's tidal marsh. Each archetype draws in its own palette (`PALETTES`) — an ice shelf
in blue-greys, a lava waste in reds — with the special loudest, and the legend lists only the
terrains that world has, the special first.

**The Drop is a map. *Built since this was written.*** The landing page draws the planet as
the survey knows it — terrain in the world's palette, its place-names, the first ring's centre
dashed — with the six sectors on their ring, yours lit, rivals' counts on theirs at full depth;
click a sector on the map or its card. The sectors are named for where they sit (east cut,
south-east flats…); the old names put North Reach in the east. The harness now runs jsdom with a
real canvas when `canvas` is installed, and `ARX_SHOT=1` dumps the Drop and the Ground to PNGs,
so the drawing is looked at, not assumed.

**The Ground reads. *Built since this was written.*** The five terrains draw in colours a
manager can tell apart (they were five near-identical browns), the planet's own place-names
sit faint on the map so the recap's "Long Rift" is somewhere, and a legend beneath says what
each terrain does from the engine's own tables — cover (the share of positions that are hard
cover or better, from `COVER_PROFILES`), how hidden a squad is (from `conceal`), pace (from
`speed`), forage (from `forage`). These effects were always in play; nothing said so.

**The Negotiation, in two facing columns. *Built since this was written.*** The Talks page
is laid out as the genre lays it out: the two houses at the head with their treasuries and how
they regard you; the pressure bar across the page with a one-line verdict (They Would Sign ·
Short by ₡N · They Would Not Entertain This); *Your Terms* and *Their Terms* as facing tables
— type, name, value — with a filter (All · People · Gear · Intel) and credits TYPED into a
box, not clicked in lumps of ten thousand; gear grouped by type with its tier badge and a
quantity of the stock to trade, where the old list moved the whole holding or nothing; the
contract as it stands beneath, each line keeping what its row showed (the race-coloured name,
the tier badge, the sub-line) with its value and a cross; Reset and Make the Offer at the foot.
The placard about contracts travelling with the body is gone. THE OTHER HOUSE'S PURSE IS
PRIVATE: the page showed their treasury outright; it shows what your dossier's finances row
knows, or Unknown, and an ask they cannot pay is refused without the number. Credits read gold,
and red when negative, through one `crs()`.

**The landing is chosen. *Built since this was written.*** At the lock the Table shows the
ring — six sectors, and on each what the survey bought: the ground and its cover at depth one,
the prize and its distance to the centre at two, how many rivals land there at three. The
manager picks a sector and Drops; the "Begin the Divide" button, which stood over an inert
page, is gone. The engine's `chooseDropSector` had never been called by a human hand — the
Landing Ring row bought knowledge nothing could act on.

**Field Rations. *Built since this was written.*** A Store item (`itm_field_rations`, tier 2,
₡160) adds `RATION_PACK_DAYS` (6) to its bearer's squad on top of the drop's fourteen — the
one thing a kit can do about a planet the survey says is hard to keep fed. Money and a slot for
food; the supply row is worth knowing now.

**Nothing on the Deal is closed by fiat. *Built since this was written.*** A pact has a
CHANCE, never a wall (`pactChance`): a house ahead of you wants paying and credits pay — a
sweetener up to `PACT_CREDIT_SCALE` of the pot — and a house behind you wants the quiet and
mostly says yes. The old `pactViability` refused "too close to be worth their while" and "you
are doing better than they are" outright; the first is a price now and the second was
backwards. Only structure closes a way: a banner already joined, a house under another's, a
house that does not deal. The beam is a verdict in one line — They Would Sign · Short by ₡N ·
Over by ₡N · Their Fans Forbid It Today — with the figures beneath as label and value: their
chance of winning alone and together, the least they would take, the most they would pay, your
offer read to each side, their trust, the leverage, your fans' charge. "On the board" is gone;
odds read as a chance of winning.

**The last two windows fold in. *Built since this was written.*** The Roster's card opens the
same fighter drawer the Squads use — the rail panel is gone and the market has the rail; the
Gather Intel dossier opens beneath its own row in the grid, the Training grid's habit, instead
of in a box of its own below.

**One deal window. *Built since this was written.*** The three ways — Join Their Banner,
Take Them Under Yours, A Truce — stand at the top of *You Offer* as a single choice; picking
one greys the others, each greyed one saying why it is closed today. What each side can put
beneath depends on the way picked.

**The planet's dossier reads as figures. *Built since this was written.*** The rows are The
Ground (archetype, richness %, sites in all), The Veins (each resource named with its category,
its share of the ground and its value), The Sites (per resource: how many, how many units —
"63 Units to Play For", the board's own measure), Terrain (patch shares), Hazards (shares),
Supply (the ration burn as a percentage, ration sites on the ground — supply is real: the
strain multiplies every squad's ration demand) and The Landing Ring (what the row unlocks at
the drop: the ground, the prize, where the rivals land). Every depth adds a figure, graded
Blank / Sparse / Read / Full; nothing reads "partial". *The Demand* row left — the Board says
it for free — and nothing on the sheet is snake_case any more.

**A pact, said plainly. *Built since this was written.*** A pact is a truce: for
`PACT_DAYS[1]` days neither banner's squads engage the other's. It has no price — the weaker
banner asks, the stronger grants or refuses (a thrifty house more readily) — and it can be
torn up, which the crowd sees. The Deal's pact card says all of this where it is offered; the
word "pact" alone had said none of it.

**The Table takes the Talks' shape. *Built since this was written.*** The negotiation has
its own page on the Divide's rail, *The Deal*, beside the Table: a strip of every other
house — mark, colour, odds on the board, and where it stands to you (Your Banner, Under You,
Pact) — and a composer for the one selected: Join Their Banner, Take Them Under Yours, Seek a
Pact, laid out as the Talks are — *You Offer* | *The Beam* | *You Ask For*. Terms go on the
table as chips (a cut of the take, credits, a stand-down; the banner itself is always there),
and the beam values them by the engine's own arithmetic — cut × expected take + credits,
against the joiner's floor and the principal's ceiling — reading Short by, Over by, or They
Would Take This as they stand, where the old two boxes offered a bare percentage. **A share of the haul is a term now. *Built since this was written.*** A deal may carry
`resources: [{category, share, when}]`: a share of what the principal actually BANKS in a
category, paid down the chain at the settlement like the pot (`settleHaul`, roots first, so a
joiner's joiner takes a share of a share), and nothing banked means nothing owed — which is
what keeps a joiner digging. `when: 'win'` pays only under the winning banner. The Divide has
no fixed price for a unit: each house values a category by its own WANT (`wantOf` — an empty
hold and a board that asks, doubly if it is the card's priority), so an offer reads two ways —
worth to the joiner, cost to the principal — and `evaluateOffer` checks each against its own
side's bound. A house short of food will sign for food a house stocked with food gives up
cheaply; that gap is the surplus a deal in credits cannot find. The AI's old `deal.resource`
flag, which the settlement never paid, is a real term now, asking for the category it is
shortest of. On the Table the four categories stand as pool rows with each side's want and
the principal's expected haul, an If-They-Win toggle, and the beam reads both sides. Before
you sign, the beam also says what your fans will charge for quitting (or buying a win) on
this day, from the same `priceOfBeingSeen` the engine bills afterwards. The composer never
collapses: it opens on the first kind with a number both sides would sign, and when none
would it still stands, the beam saying whose floor is where or whose fans forbid it — the old
one-line "No Number" was read as no window at all. And the table's rows take the engine's own
`viable`, wall included; they used to omit the wall and call closable what the crowd forbade. After the contest the
Table shows what came home and what moved under terms. Beside it the ground's assay: every site
revealed, its resource and category, and who has dug it, which is what a board's demand is
written against and what a joiner is courted for. **And the next three of the arc. *Built since this was written.*** A NAMED CLAIM
(`claims: [siteId]`): one revealed, undug site, dug by the banner but banked to the joiner,
priced to each side like a share of the haul (`claimRates`, the site's units discounted by the
banner's odds). THE SPOILER (`SPOILER_WEIGHT`): the share of the banner's expected losses this
house accounts for while it stays out fighting, added to the banner's gain — a weak house's
leverage, priced at nothing before; the beam reads it as "Their Leverage: Staying in the Fight
Costs the Banner ₡N". HELD OUT (`held_out`): a house whose banner's odds fell under 0.15 and
fought on from there, never sold and not the winner, is credited by its own fans and the fleet,
scaled by how hopeless it was and how much fight it gave.

**What the measurement then said.** Over three seeds, one Divide each: 77–151 offers sent,
57–129 refused, ONE OR TWO joins a contest, no deals in kind at all, the contest ending on day
19–28 with five or six banners still standing. Of the refusals, four in five fail because
`joinerMin` exceeds `principalMax` by 1.2–2.2× — the seller's price stacks `aggressionHold` ×
`relPrice` × (1 + `GREED_HOLDOUT`) × the crowd's premium onto `stayValue`, while the buyer's
ceiling is `gain` cut by mercy and the same premium; one in five fails at the seller's wall on
day two, the crowd's charge for quitting early, which is the design working. The arc the game
wants — resist, establish leverage, then deal — was priced out by the greed stack before the
resources or the spoiler could matter.

**Tuned. *Built since this was written.*** `GREED_HOLDOUT` 0.55 → 0.25, swept with
`measure_table.cjs` over four seeds. At 0.25: four or five joins a Divide, the first deals in
kind, two or three banners standing at the end, and the crowd's wall the main cause of refusal
— sellouts on day two still fail, which is the design working. 0.10 overshoots: one seed
collapsed under the favourite on day 8, a market rather than a contest. `MIN_ASK_FRAC` moved
nothing; the floor rarely binds. The baseline to hold from here: offers, refusals by cause,
joins, deals in kind, stand-downs, the end day, and banners standing.

## The Divide's shape — the Table leads, the Firefight is a room. *Ruled at this pass.*

The Divide's rail runs Table, Ground, Roster, Board — **the Table first and home**, because it
is where the manager acts: the contest begins there, the window advances there, and the
window's word already rode the advance. Its recap, **Since the Last Window**, lists the
window's fights above a divider and earlier days beneath it; the Dividend's lights stand on
the Desk's own shelf through the year. **The Firefight is a room, not a rail stop**: it opens
when a fight is watched from a recap and its Back control returns to wherever the watcher came
from. Nothing else opens it.

**The scrim is dead** — the lock, the rival pick, terrain/range/readiness, Run Engagement, and
the locker's whole conserving-books mechanism (`lockSide`, `returnKit`, `G.locked`, `G.stale`,
`G.fought`), with WAS-HERE notes at the graves. It was a practice room that predated the live
Divide and held demo-grade controls over a shipped system. What its checks proved now proves
through the real Divide: composition in the replay's side panels, the manager's hand verified
in the Divide's options at begindiv, casualties on the shared roster after the contest. The
page harness changed in step and honestly shrank, 104 → 85 checks — the retired checks audited
the deleted mechanism itself, and padding the count back up would be counting for its own sake.

## The Ground is animated on the page. *The build pass.*

The grammar the mock proved is now the game's own map. Squads walk their true recorded
tracks, paced by arc length so an engine relocation reads as a fast dash instead of a blink.
A day is watched in three states — its morning, stepping through it, complete — and no
state is reachable by rewind, which is what stops a press from relocating the whole map.
Stepping by squad and turning animation off are ORTHOGONAL: the first says how much happens
per press, the second only whether it tweens. Gating one on the other (which the mock did)
silently reverts to whole-day jumps for anybody who turns animation off, which is the one
thing stepping exists to prevent — the harness caught it.

Every layer reads one set of display positions, so reach circles walk with their squads.
Held time is one arc, a full circle being a whole day pinned. A fight is a diamond tethered
to the squads it held. The dome's takings are a rust X. Wiped squads are faded remnants,
frozen where they fell. Squads standing on one point are nudged apart on screen only, never
in the data. A finished contest opens at the drop so it can be watched forward — the line
that opened it on the aftermath had been quietly winning because it ran last.

Live comms-window days carry no tracks, so they simply draw complete: the animation is for
the recording, and the live view is unharmed.

## An OA will give up its banner far sooner than it will take somebody else's. *Measured.*

Found while a re-priced gun catalogue turned a green check red. Of 112 priced "would they come
in under you" rows across the deal sample, exactly ONE had a number both sides would sign —
`joinerMin` above `principalMax` in every other case. Ceding fires readily; TAKING is a
one-in-a-hundred event, and the check that proved a manager can take somebody was passing on a
two-seed sample of it. Any change to the economy flips that coin.

The check now runs a wider sample and reports what it saw ("2 takes · 3 signable of 190 priced
rows"), so a future failure says whether the branch broke or the dice moved.

**A FOURTH guard, and the pattern is now the finding.** The stress check asserted that a Divide
leaves marks by reading the highest stress on the whole roster — but the harness fields ONE
squad of six and leaves everyone else at home, so when a re-priced catalogue shifted who met
whom and that lone squad had a quiet contest, a working mechanic reported itself broken. It now
asks whoever came back carrying something rather than the books at large. (It cannot ask by
name: the year turns over before the check runs, and the offseason rebuilds the roster.)

Four guards in one pass — the take branch, the crowd charge, a recovery guard that quietly
spent a month the calendar checks were counting, and this — were all measuring circumstance
rather than mechanism. **A check that samples one outcome of one contest is measuring the
contest.** When a guard goes red after an economic change, find out whether the mechanism broke
or the dice moved before touching either.

**A second check had the same disease and the same cure.** "What negotiation charges the crowd
actually moves standing" read ONE contest out of the corpus and needed that contest to contain a
crowd charge. It did, until the same re-pricing shifted who dealt with whom and left it with
none — whereupon a working mechanic reported itself broken. It searches the whole corpus now.
The lesson generalises: a guard that samples a rare event on one seed is not measuring the
mechanic, it is measuring the dice.

**RULED: the rate is far too low, and the fix is DEFERRED.** One signable offer in a hundred is
wrong — corporations coming in under one another should be a common sight, not a freak event.
But the number is not to be moved yet, for the same reason fatality is not: the economy under it
is still changing, and a dial tuned against today's prices would be tuned against nothing. The
direction is on the record so the eventual pass knows which way to push — taking somebody must
become far easier to make signable — and until the systems settle, nobody tunes it.

## They are FIGHTERS. *Ruled.*

One word, everywhere, for the people who go down to the Divide. Not hands (which suggests
shipboard labour), not units, not players, not soldiers — soldiers implies an army, and these
are contracted people. Interface copy says **fighter** and **fighters**; the code's own
`bodies` and `roster` are identifiers, not copy, and stay as they are.

## The hidden ceiling is gone. *Ruled and measured.*

`potential` was a per-person cap on growth that nobody could see. With careers this short and
growth this slow almost nobody ever reached theirs, so all it could do was quietly forbid
specialisation in the rare case somebody did. Growth now runs to the SCALE's ceiling, the same
for everyone. Measured after removal: across six seasons the median stat is 100, p90 is 148,
and TWO stats in 1,099 reach the ceiling — nothing runs away, so no diminishing-returns rule
is needed. Potential survives as what it honestly is: what a scout thinks of somebody at
signing, deciding who a corp is interested in, not who they may become.

## Births carry the grain between the tens.

The ×10 migration left every new fighter on multiples of ten — 80/90/120/40 reads as a rounded
number rather than a person. Each stat is now nudged within its own decade and the nudges are
BALANCED to sum to zero, so the roll's shape is untouched: same pools, same average fighter
(mean 92.4 either way), only the texture changes. A fighter reads 61/96/83/101/107/85/67.

## A sponsor's condition says the number it enforces. *Ruled.*

Every backer's condition is written in the figure the engine actually checks, with no
explanatory tail: *Field a Drop of 75% Energy Weapons or More*, *Bury No More Than a Third of
the Fighters You Field*, *Field a Fighter Who Ends the Year at Fame 25 or Better*, *End the
Year With a Treasury Above Zero*.

Two faults were found in the writing of them. **The survival condition and the burial condition
were the same requirement**: `came` was literally one minus the death rate, the exact quantity
the burial condition read, so a corp satisfied both by the same act at two strictnesses. They
now ask different questions — graves, versus everyone who did not come home, prisoners
included. And **the Almsdesk contract paid an advance and a reward for no condition at all**,
which is a gift rather than a sponsorship; the first replacement ("field at least 16") was no
better, since sixteen is the floor the board fills for you if you fail to reach it and so could
not be failed. It now asks for a drop that is a third unproven fighters — a real price, because
green fighters lose more often and a corp chasing a finish would rather field veterans.

## The Dividend takes the floor. *Ruled and built.*## The Dividend takes the floor. *Ruled and built.*

The mid-year show-match was fully simulated and completely invisible: it resolved inside the
month step, the year walked straight through month six, and the only trace was a shelf that
appeared on the Desk afterwards. A manager felt nothing happen on the one night the crowd turns
up for.

**The year stops when the lights come up.** Arriving at the Dividend's month (`DIVIDEND_MONTH`, M4 now) opens the Dividend on the rail
with the rest of the preparation still reachable beside it — the card is a roster decision, and
the Squads, the Market and the Talks are part of making it. End the Month reads *Take the Floor*
while the lights are up: ending the month IS taking the floor with the card as it stands, so
there is one gate, not two, and the show cannot resolve with nobody named. *Revised from the
first cut, which replaced the rail with a three-tab floor and needed a "Back to the Desk"
press afterwards.*

**The manager names who takes the floor.** The floor is the Squads board's shape: the eligible
stand at home as fighter cards on the left, the card on the right fills to eight with one open
row, a cross takes a name off, a name opens the sheet. The fleet's own choice is pre-named, so
touching nothing still fields a sensible card. That is the decision
the format offers: blood the green where nobody can die, or put famous names in front of a
paying crowd. A named card that cannot legally show falls back to the fleet's rule rather than
fielding four people.

**And the fleet chooses too (ruled).** Every OA sending its greenest made the card identical
every year and handed a manager who fielded names a free win over rookies. Each corp now leans
by its own situation — BLOOD the green, DRILL the best of the unblooded, SHOW the famous, SPARE
everybody and treat the night as noise — drawn from weights its circumstances tilt: a board
short of patience shows off, a corp deep in green hands bloods them, a thin roster spares
itself. Deterministic per corp and season, because a card that reshuffles on a re-run is not a
decision. The first cut stacked these as a ladder of gates and season one, when nearly every
corp is green, sent four fifths of the fleet down the same branch; as weights, all four leans
appear from the first year. Measured across eight fleets: drill 36%, spare 31%, blood 19%,
show 14% — and the cards differ visibly, a showing corp fielding average fame 19 against a
drilling corp's 3.5.

Afterwards the lights go down by themselves: the whole card is on the page, your match first,
any match replays on the same grid the Divide uses — because it is the same grid, and always
was — and the rail is the preparation's again and the Desk is back; its shelf keeps every
match watchable for the rest of the year. Next summer's show is its own: the done-flag resets at the
new year (it did not, once, and every year after the first walked through month six in
silence).

## Rest and Recovery is a grid, and nothing spent on it is wasted. *Ruled and built.*

A body has two sides that mend: **wounds** and **stress**. Both come down on their own every
month; focus speeds either up sharply, painted at the drill's own four tiers — corner, column,
row, cell — which stack on the same inverse-breadth weights. Two verbs, one grammar, so a
manager learns it once. Each cell says what that body has to work on — "38d", "Healthy",
"Settled", "55" — so the effort can be aimed before it is spent.

**Focus is never wasted (ruled).** Physical recovery poured on somebody with nothing to mend
becomes CONDITIONING — grit, which raises their wound pool through the game's real path. The
calm side mirrors it: settling somebody already settled becomes composure. Partial overflow
works the same way, so twenty days of wound against a hundred days of effort mends the twenty
and conditions the rest. Both are temporary BY CONSTRUCTION: they ride beside the stats in
`_conditioned`, combat reads them when a body becomes a combatant, and the settlement clears
them. A permanent gain bought by resting would be a second drill verb wearing a bandage.

**And the edge is small on purpose.** Capped per body per year at three blocks and cleared
every settlement, it is worth about one point of wound pool. It exists so that resting a whole
squad when only half of them need it is not a waste — not as a way to load a roster up for the
year. The cap is not a tuning dial waiting to be turned.

**The drill grid folds, and the fold has to pay for itself.** Every hand stays listed — anybody
can need drilling, so nothing is ever filtered out — and the corner and columns stay on top
where they never fold, since the broad paints are what a manager reaches for most. A CLOSED
HAND IS ONE THIN LINE: chevron, name, a count of what you have painted on them, their
whole-body pips. The first version put a best/weakest/ceiling read beside the name and cost
exactly the room the fold saved, which makes a fold into a click that buys nothing. The panel
under an open hand carries the stat names in their colours over the numbers — a bare row of
figures gives a manager nothing to aim at. Column heads wear each stat's
colour so a column stays legible however far down the eye is; the numbers themselves run red
through grey to green, cut against the roster's own spread so grey means average HERE.

**Measured, not changed:** stress already runs 0–100 like everything else. Low numbers early in
a year are a rested roster, not a compressed scale — across two full seasons including
contests the median is 8 but p75 is 33, p90 is 44, and the worst-hit body reached 66.

## The Negotiation table. *Ruled and built.*

Dealing between corporations across the prep year — gear, people, credits, and what you know
about somebody else. Two pans and a beam: what you offer on the left, what you ask for on the
right, and what they make of it in the middle.

**A contract travels with the body.** This is the ruling that shapes everything else. A person
is worth what they bring MINUS what they are owed — quality × 33 credits a season, lifted by
fame, plus a slice of unrealised potential, less salary × 12 × seasons remaining. The 33 is not
a taste number: it is what the fleet's own wage bill already pays for a point of quality. So a
star on a cheap long deal is treasure, a median contract trades near break-even, and a
passenger on a fat four-season deal is **worth less than nothing** — measured, 48 of 139
contracts across a real fleet. Salary dumping is a real move, and that is the point.

Everything else is priced off a number the game already uses: gear at catalogue cost, credits
at face value, and intel off the focus market — BOOST_PER_POINT a point, INTEL_PER_PIP rows a
pip, plus a premium for the edge a dossier carries into the Divide.

**Ruled at the mock:** intel is never offered about the OA across the table (they know what
they are); trading runs every month and the table closes after M10; **no roster floor** — a
corp may trade itself down to nobody and fill up in M11 if that is the plan; being sold costs a
fighter loyalty but not stress, because this is paperwork, not a firefight; and regard moves
the price by up to a quarter either way rather than gating the deal.

**An OA may write to you, rarely.** Each waits months before asking again AND the fleet keeps a
quiet period on top — seven OAs each politely observing their own cooldown still produced
fifteen proposals a year, which is exactly the every-turn nuisance the ruling exists to
prevent. Measured after: about three a year. They only ask for deals that suit them, and never
so lopsided that a manager learns to dismiss the box unopened.

**A transfer is watched (ruled).** Selling somebody costs you with your own supporters in
proportion to WHO you sold — fame carries the weight, so an unknown moving on is a shrug and a
famous one leaving is a wound. The mirror is what makes it a transfer market rather than a
spreadsheet: the selling side's fanbase warms to the OA that took their star, on the same hook
ceding already uses to pay whoever bought a claim. The wider fleet barely looks up and the Aleas
do not care who is on whose books. Everyone left behind loses a little loyalty — a flat knock,
not a famous one, because the crew minds the FACT of it: watching a sale is a reminder that you
are also property.

**The fleet deals with itself.** Seven other corporations do not sit still for eleven months
waiting to hear from one manager. A thin roster shops, a deep one sells, and the stands watch
those transfers exactly as they watch yours. This was not planned — the suite caught it: two
acts in the reputation table could never be produced, because the only trading in the game
happened where the player was looking.

**The floor is a last door, not a fence (ruled).** A corp may run itself down to nobody all year.
But somebody has to walk onto the ground, so when the merc window shuts in M10 — the last chance
to put bodies on a roster — anyone still short of ROSTER_MIN has it filled with the cheapest
paper on the board, is charged for it, and loses SCRAPE_PATIENCE with their own board for having
to be rescued. It runs AFTER the market, so a manager who bought their own way to sixteen never
meets it. Measured: a roster of four at the deadline came out at sixteen, 33,630 poorer and
twenty-two points of patience down.

## The Board is joined to the corporation.

Reputation had run inside the corporation page since the corporation existed — every cession,
every purse, every famous name spent was landing in it — while the only surface that could
read it was a separate baked page. The manager paid the price of being seen and never saw it.
Now: the four audiences with the standing each holds, every rival in its own colour and mark,
the card the manager's own board has put up for the year, and the memory behind each number,
biggest first, because a standing with no story behind it cannot be acted on.

**The card is read out. *Built since this was written.*** The page printed a `goal.text` that
never existed — every year read "A strong Divide" — while the engine held the whole card: five
or six demands with one the priority, and the two standing demands. Each is a sentence now
("Place 4th or better", "End the year ₡13,250 up", "Bring home a measure of Copper Ore"), the
priority starred, with the live reading beside it where the year can already say something
(the surplus so far, the calls made, the standing now) and the scored Met / Missed after the
Divide. Beside it the four holds — minerals, fuels, luxuries, foods — as bars of a full store,
the one the card asks for tagged. The two standing demands read as *Spending* and *Casualties*
on a spectrum from displeased to pleased with the year's marker on it, because they are graded,
not met. The discrete "lose no more than N for good" demand LEFT THE CARD: it measured the same
number Casualties already grades, so a card carried one ask printed twice. The pool is smaller
and the verdict cuts were anchored to a distribution this moves — they want re-measuring.

**And the planets had no ground in the browser.** `planets.json` was never bundled and nothing
called `setResourcePool`, so every planet a manager ever played generated with no composition:
no ore, no assay to fight over, no resource demand could ever reach a card, richness falling
back to the archetype lean. Node loads the file from disk, so the regress runs never saw it. It
rides in the bundle now and the module is handed it at load.

After a Divide the board asks its question and the manager answers in one of six registers.
The engine's own rule is kept exactly: nothing is scored, each register is right somewhere and
wrong somewhere else, and the answer MOVES the audiences rather than grading the manager. The
tab marks itself when a question is waiting.

**One word does not fit four audiences.** A single set of thresholds read every corporation as
adored. Measured over six seasons: your own people start at 80 and drift to the ceiling; the
fleet runs 5 to 100 around a median of 66; the Aleas runs -74 to 78 around 20; a rival runs the
whole scale around a median of -9. Each audience's words are cut against where it actually
sits, and the bar shows the true position on the shared scale.

**Noted while measuring, not fixed:** own-people standing saturates at the ceiling within a few
seasons for every corp in the fleet, so it stops carrying information. That is a reputation
calibration question, and calibration is deferred.

## They are OAs, never Houses. *Ruled.*

An Opes Arx is a megacorporation. "House" was never established anywhere in the lore — it
crept in through interface text and code shorthand and then read as canon. Interface copy says
**OA**, or the OA's name, or megacorporation; never "house", singular or plural.

Two things keep their own words and must not be swept up in this: the SUPPLIERS on the
sponsorship board are suppliers or backers (the code's `houseName`/`houseIds` is internal
shorthand for those, not for OAs), and a `race`'s lineage language is its own.

## Partial intelligence is a window, not an adjective. *Ruled.*

A half-filled dossier row used to read "A deep roster (partial)" — and the training row read
"Drilling unknown", a line the manager had PAID FOR that said less than silence. None of it
could be acted on. Every numeric row now brackets the real figure, and the bracket tightens as
the dossier deepens: 16–25 hands at a glance, 19–21 with work, 20 when it is known.

Two invariants, both guarded in the suite: the window ALWAYS contains the truth — intel here
is incomplete, never wrong, because lying to the manager is a different mechanic and it is not
this one — and scouting harder never widens a window. The bracket is deterministic per rival,
row and season, so a second look at the same depth does not walk the window around; more work
narrows it rather than re-rolling it. A window that closes to a single figure says the figure
rather than printing "3–3".

Training also needed a source: it had been reading `plan.trainFocus`, which only the human's
own corp carries, so for every AI rival the row was empty by construction. A corp now records
what it drills when it spends on the track, and the row reports points of drill and which
discipline — numbers a manager can hold against their own board.

## You focus on the intel, you get the intel. *Ruled.*

A gather resolves in the month it is bought, against the rival as they stand that month.
It had been scheduled three months out — a rule nobody asked for, which made the verb
incoherent three ways: what came back was old news about a rival who had since moved, it
could not be acted on in the month it was paid for, and it fought the ruling that a manager
may look again and again across a year. `SURVEY_MONTHS` is 0 and the gather runs inline at
the moment focus is spent, so nothing is ever in flight and no screen has to explain a wait.

Two consequences worth keeping: a look late in the year is still worth buying, and a second
look at the same rival is worth buying because it re-reads them as they are now.

## How lethal the Divide is, is not decided yet. *Standing ruling. Do not re-litigate.*

Every casualty number in this project — how many people die, how many survive four contests,
how big the loss band should be — is **deferred until the game's systems are all in place**.
The numbers swing enormously on a single addition or subtraction, as they have repeatedly:
the dome ruling alone moved deaths by a third in a day, in both directions, before settling.
Balancing them now is raking leaves in the wind.

So: the two checks that grade fatality — the veteran-survival one and the permanent-loss band
— **stay red on purpose**. Do not widen their bands to make them pass. Do not tune the injury
or overkill dials to make them pass. Do not offer the choice between those two again. They are
a thermometer to read while other work happens, not a fault to fix, and they get their ruling
once there is a whole game to balance against.

## The Ground moves — and the dome closes. *Ruled across the animation pass.*

Animating the contest map surfaced, in order: a recorder that disagreed with itself, a wall
that teleported, and a casualty system that only worked because of the teleport. Each was
measured before it was touched.

**The record tells the truth now.** Tracks are seeded at dawn where the squad stands, closed
at assembly on the position the record claims (fight arrivals, reforms — everything that moves
bodies between samples), a squad's dying day keeps its last march (closed on the wipe site),
and the days after death are empty: `down`, frozen where they fell. The per-tick-label trap
(`_why` overwritten by later ticks) is documented at `hb` and was hit twice more here; flags
that must survive to the snapshot get their own field.

**The dome.** The wall no longer steps overnight further than a day's march and it NEVER
moves anyone — `zoneOn` interpolates the schedule's anchors so the line closes a little every
day, the Aleas announces the beats, and the line is answered by the squads' own logic: any
able squad dawn finds outside walks in (aimed deep enough that ARRIVE_SLACK cannot rule it
"arrived" on a small circle — the fault that killed obedient squads standing still, inches
out); a fight the line reaches breaks off, both sides, at stress cost; nobody starts a fight
on ground that will be dead by dusk. Whoever is still outside at dusk is gone — and after all
of the above, across six measured contests, that is nobody. The suite's wall check re-ruled to
match: nobody LIVING ends a Divide outside; the dead lie where they fell.

**The wounded are somebody's job.** The old displacement was secretly the ambulance: it
carried every immobilised squad inward to be scooped at contest's end. Under the dome, the
standing carry their own (at `CARRY_SLOW_PER_BODY` march cost — which also fixes rule 3's
inversion, where the wounded used to vanish from the size count and speed a squad up), the
victors take a wiped squad's wounded captive — and captives now physically march off the
field, so the dome cannot eat the winner's own prisoners — and a corp sends its nearest free
squad up to `RESCUE_RANGE` to bring immobilised friends home, reasserted every dawn because
planners retask.

**The march follows the people.** Pace rides REFLEX — the emptiest stat in the game (one
reader: grid initiative) — as the average over the squad's standing bodies, trainable like
anything else; race flavour arrives through race stat spreads, never a race multiplier. With
`sizeMarchMult` (three walk faster than eight), `carryMult` (stretchers cost), `paceMult`
(the quick cover ground) and `speedAt` (the terrain field, wired all along and drawn on maps
for the first time), all four movement rules stand.

**Own lines do not stack.** `OWN_SPACING` (0.016, half of it under ARRIVE_SLACK so arrival
and spacing never fight) pushes own-corp pairs a body's-breadth apart after each tick's
marches; fights are exempt; formations read as formations.

**The map's grammar, ruled at the mock:** motion is arc-length paced along the true recorded
tracks (a relocation is a visible dash, never a blink); the view opens at the morning of day
one and no state is reachable by rewind — proven by an every-press snap check across a whole
contest, worst residue 0px; held time is one arc (a full circle is a whole day pinned); a
fight is a small diamond tethered to its parties; the reach toggle draws the contact and
sight circles the detection ladder plays in; the dome's rare takings are a rust X.
