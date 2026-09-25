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
node sim/audit_marks.cjs       THE KIT'S GEOMETRY — every field and device must sit on the
                              pivot it turns about, or it swings on a hinge beside itself.
node sim/audit_code.cjs        THE HOUSEKEEPING AUDIT — dead functions, unread constants,
                              helpers written twice. Answer everything or label it.
node sim/audit_table.cjs      THE TABLE HELD TO ITS CHARACTER — nine rulings on whom an OA
                              approaches, courts, remembers and folds to, as a gate.
node harness/drive_light.cjs  THE PLANET'S DAY IS PLAIN — the Desk says light or dark, when it turns, and today's blocks.
node harness/probe_avoid.cjs  WHY DOES A CAREFUL SQUAD DIE MORE — every fight of one stance broken down: sought
                              or found, how it ended, how the dead died, where the hits landed.
node harness/probe_wall.cjs   NOBODY IS CAUGHT BY THE DEATH WALL — counts every living person it takes, with
                              what their squad was doing; fails on one.
node harness/drive_market.cjs THE MARKET SAYS WHAT A MOD DOES — fails unless a mod's effect reads in
                              sheet points (the optic's "Aim +10").
node harness/probe_fieldcraft.cjs  DOES FIELDCRAFT CHANGE A FIGHT — sides identical but for fieldcraft;
                              GATE=1 fails if the better eyes stop coming out ahead.
node harness/gen_scale_proof.cjs   ONE AIM AT BIRTH — the same fighters are made on the sheet scale as were made
                              on the old one: race, age, name, stats, skills, traits, contract.
node harness/stat_scale_proof.cjs  ONE AIM — records and checks every quantity a stat feeds.
node harness/audit_shown.cjs  WHAT IS SOLD AND DOES NOT DO IT — every item tag, action and effect
                              field the engine never names. See docs/AUDIT_SHOWN.md.
node harness/audit_hidden.cjs WHAT IS SIMULATED AND NEVER SHOWN — every field the engine hands
                              the page that the page never names. See docs/AUDIT_HIDDEN.md.
node sim/measure_year.cjs     THE WHOLE YEAR, DIVIDE INCLUDED — winners and losers, what the
                              Divide paid them, and what kit cost.
node sim/audit_macro.cjs      THE MACRO LAYER — the field, the reach, and the arc of contact,
                              stated against the genre the Divide imitates.
node sim/probe_squadstance.cjs WHAT A SQUAD'S STANCE IS WORTH — one OA's squads held to one
                              notch; `[contests] [notch]` to run an end alone.
node sim/probe_watch.cjs      DOES HOLDING STILL BUY SIGHT — fails if patience stops earning
                              clearly more sight than marching. The per-squad stance rests on it.
node sim/probe_sight.cjs      SEEING WITHOUT MEETING — what watching earns, and whether the
                              picture a manager can act on is any fuller for it.
node sim/probe_stance.cjs     WHAT A NOTCH IS WORTH — the same Divide five times, changing
                              only the stance held toward one rival.
node sim/probe_monwa.cjs      EIGHT SEATS OF MON-WA v EIGHT HUMANS — what one seat and two
                              bodies is worth on the grid.
node sim/measure_map.cjs      THE MAP DAY BY DAY — moves against the march, deaths against
                              fights, squads against the record.
node sim/measure_regret.cjs   HOW WELL THE OAs DECIDE — a Divide replayed from its seed with
                              one table decision forced the other way; signed, the other way
                              minus the way taken.
node sim/measure_founder.cjs  THE FOUNDER'S YEARS THROUGH THE FIGHTS — six careers of three
                              years, the whole year, the OA a manager actually plays.
node sim/audit_bastille.cjs   THE OAs OFFER BLIND — the remission an AI OA buys off a
                              volunteer's sentence must not track the stats the sheet hides.
node sim/measure_value.cjs     WHAT A FIGHTER COSTS AND WHAT HE BRINGS — the three markets
                              priced over the term of the paper each would sign.
node sim/measure_economy.cjs   WHAT A YEAR COSTS AND WHAT IT PAYS — the books end to end.
                              Fails if the wages or the entry fee stop being charged.
node sim/measure_quirks.cjs    DO THE QUIRKS BITE — how often each condition comes true in a
                              real fleet, and what each quirk is worth when it lands.
node sim/audit_quirks.cjs      THE QUIRKS' SHAPE — every rebuilt quirk does something
                              functional and something narrative, on conditions the fight
                              can answer.
node sim/measure_stat_worth.cjs  WHAT A STAT POINT BUYS, in fights won and bodies left.
node harness/audit_resize.cjs  WHAT A NARROWER WINDOW TAKES AWAY — every media rule that
                              hides or zeroes an element, and every one that unpins the chrome.
node sim/audit_hooks.cjs       THE CATALOGUE'S HOOKS — every one either does something or
                              carries the reason it does not. Fails on a silent no-op.
node sim/measure_kit.cjs       WHAT A FLEET CARRIES — primaries, armour, sidearms and
                              consumables across every OA. Fails on a bare hand.
node sim/measure_energy.cjs    THE ENERGY BARGAIN — cost, power, heat and dry rate against
                              ballistic weapons of the same tier.
node sim/measure_bands.cjs     WHERE A FIGHT IS FOUGHT — the range mix, lethality and length
                              per opening band, on squads carrying real kit.
node sim/measure_fight.cjs     THE FIGHT'S SHAPE — mean turns, break vs clock, casualties.
                              Run it whenever the fight changes and ALWAYS beside a snapshot
                              blessing: the snapshots can be re-recorded, this cannot.
node harness/audit_ui.cjs     THE UI AUDIT — after every change to viewers/corp_template.html.
                              Fails on the three things that have crept back into the page in
                              every pass no matter how many notes were left, so the notes are
                              a tool now:
                                CASE    user-facing text is Title Case (small words stay small)
                                PROSE   the page does not explain itself: no sentences, no
                                        "because", no dashes that teach — labels, values, verdicts
                                COLOUR  colour comes from the conventions, never a hex at the
                                        point of use: stats STATCOL/gradeColour, credits crs(),
                                        OAs cSpan()/colFor(), fighters raceColour(), the
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
- **Nobody opens with a full squad, and no two OAs open the same.** Founding size is derived
  from an OA's difficulty — 22 down to 16, against a drop force of 24 and a target of 28 — so
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
- **A month's action can land later.** A survey reports in three months; an OA courted now
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
  directly rather than leaving it to OA doctrine, the locker and the money left.
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

## The colour pass — OAs wear their own colours. *Ruled at this step.*

Every OA shows ONE display colour, derived from its canon pair in `oa_profiles.json` by
`sim/palette_oa.cjs` and written to `data/oa_display.json` with its reasoning beside it. The
rule: the canon primary unless the measurements refuse it, then the secondary, then a recorded
nudge — bars of ΔE 12 against every other OA, the nine race fills and the grounds they share
a canvas with, ΔE 10 against the interface's semantic voices, and L* 30 so nothing sinks into
the night. `--check` mode verifies the written table still derives from canon. One canon colour
was re-ruled on the way: two near-white OAs could not hold apart on any surface, the medics
kept the white, and the Marksman's OA took gunmetal `#8e9db4` — the reason recorded in the
canon file itself.

The positional palettes died here: `SIDE` (three colours by seat) and `BANNER` (eight hexes by
berth) are retired with WAS-HERE notes, replaced by `colFor(corpId)` on every surface that
names or draws an OA. **Cyan stays the interface's voice and no OA may own it** — "you"
are marked structurally (the edged row, the you-tag), never by hue. The founded OA picks
its colour at founding from twelve swatches the instrument pre-vets against everything above,
so a confusing pick is impossible rather than validated away; the pick rides on the profile
and every surface honours it through the same `colFor`.

**The marks.** *Ruled at the same pass.* One mark per OA, drawn from its own tag, motto and
lore — the weight, the witnessed star, the nested years, the assembled frames, the new line,
the drill in the seam, the sprout in the cradle, the open ring — stored as proposed art in
`data/oa_marks.json` (24×24, `currentColor` so the OA colour carries it) awaiting a human
artist. Dosage: marks live where identity is the point — the banners, the encounter lines, the
roster heads, the lock — and stay out of flowing prose, which keeps its colour-only names. The
founded OA flies the empty pennant: an OA too new for a device.

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
what waits on the manager this month — an OA that has written, the board asking, a signing
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

**Reputation, made to read and made to buy. *Built since this was written.*** Four faults, one
symptom ("everybody is nought and my own people hate me"):
1. **An OA built at the desk started nowhere.** The eight carry standings in their profiles;
   a corporation made by a manager carried none, so it opened at zero on every audience and
   could only go down. An OA without declared standings is now read from its dials — its own
   people expect what it is, the fleet knows a showman, the Aleas mistrust the treacherous.
2. **The scale saturated.** Raw feeling was clamped at a hundred, so four OAs of eight sat
   pinned there after three years and the number stopped carrying anything. Past `SOFT_AT` the
   scale compresses toward the ceiling over `SOFT_SCALE` and never reaches it.
3. **Nothing drifted.** Residue never washes off, so every good year was carried for ever. Each
   season the remembered feeling loses `DRIFT` of itself, while the OA's own nature — the
   base it opened with — stays what it always was. (The first cut of this pulled the base toward
   the current standing, which is a ratchet, not a drift.)
4. **A careful OA was hated for it.** Nearly every act touching an OA's own people took
   something away, and the ones that gave came only from fighting. A year now says what it was:
   everyone came home, few were lost, the wages were paid, a raise was granted, a debt was
   settled, a star rose, the purse was taken.

And it buys things. THE GATE: the fans pay every month (`gateFor` — a base draw, the roster's
fame, and standing with your own people plus a share of the fleet's, who watch from other
ships), so a manager sees his popularity in the same recap as the choices that moved it, on the
brief as a monthly figure and in the ledger as *Gate and Merchandise*. POPULARITY IS A BOARD
DEMAND, graded on a spectrum beside Spending and Casualties, and it reads live because the crowd
does not wait for the Divide. Still to come: the fleet's standing in `considerJoin` and the
Market's prices, and the illicit window — bribing the Aleas spends the standing that honest
dealing builds, with a small chance it comes to light and takes everything with it.

**The Back Room. *Built since this was written.*** `sim/illicit.js`: a window, not a tab,
open in the preparation and in the Divide, holding the things an OA would rather nobody knew.
Standing with the Aleas is a currency here, not a scoreboard — honest dealing builds it and this
spends it. Bribe an official (one ruling goes your way); buy a malfunction (one act this Divide
is not seen); sabotage a rival's kit (their squads drop worse for it); a quiet word before the
drop (a pact that holds from day one); buy a story (the postings print what they are paid to).
Each has a price in credits AND in standing — paid whether it works or not, because the people
you asked know what you asked for — and ONE FIGURE: the chance it goes off clean. It goes off
clean, or it comes apart and is traced back to the OA that paid for it; there is no quiet
failure. (Two rolls, a chance of working and a separate chance of being caught, asked a manager
to weigh two figures that meant nearly the same thing.) EACH ACT ANSWERS TO ITS OWN AUDIENCE: a bribe is the Aleas' business and the
fleet shrugs; sabotage is the fleet's business; a quiet word is what your own people mind most.
An OA already under suspicion is likelier to be caught. The other OAs work the same window
by their treachery, and the fleet hears when one of them is caught. Sabotage bites at the drop.

**Standing buys a banner and a signature. *Built since this was written.*** WHO YOU FIGHT
UNDER IS SEEN: an OA's own people have to live with the banner their manager takes, so the
fleet's regard for a banner moves what it costs to join it (`BANNER_SHAME` on `priceModifier`,
read once at the drop onto each corp). WHAT A OA IS ASKED FOR: a fighter signs with an OA,
not a treasury — `askingPrice` takes the corp, and standing with its own people plus a share of
the fleet's moves every ask by up to `MARKET_SWING`. The shared merc market keeps the flat ask
as its reserve, so an OA's name moves what THAT OA must offer rather than what the fighter
is worth. The acquisition window says it in a line: *Your Name: −18% on Every Ask*.

**Three UI fixes. *Built since this was written.*** THE TURN STANDS IN THE BOTTOM RIGHT, where
the genre puts it: what is waiting on the manager listed above, and beneath it ONE button. While
anything waits, the button reads *Waiting on You · 3* with the first item under it, and pressing
it goes there rather than ending the month; when nothing waits it becomes *End the Month ·
Nothing Waiting*. A manager who means to let something lapse can still end it anyway, in small
type — the recap will say he did. (It began at the foot of the year line on the left; the room
was ampler there and the habit was wrong.) AND IT CARRIES EVERY TURN, not only a month's: at the
lights it reads *Take the Floor*, at the lock *The Draft · 1 of 3 Landings Chosen* and then
*Drop*, in the contest *Next Comms Window · Day 6*, and when the contest is settled *Begin the
Next Year*. The top line carries no turn button at all now; `#endmonth` and `#nextyear` remain
in the document, hidden, as the machinery the corner drives, so every path that ended a month
still has one thing to call. A SQUAD IS
EIGHT SLOTS: every slot stands, filled or empty, numbered, the empty ones lit when there is
somebody selected to put in them, so a squad reads as a unit with room in it rather than a list
that happens to be short. THE TALKS' OFFER sits with the verdict: Make the Offer and Clear the
Table stand under the pressure bar, beside the thing that tells you whether to press them,
instead of in a dark corner at the foot of the page.

**The board asks in units, and asks once. *Built since this was written.*** THE RESOURCE
DEMAND WAS IN THE WRONG MEASURE: `amount` was a fraction of a store (1/9) while `banked` counts
assay units, so the test compared three units against 0.11 and every resource demand on every
card passed the moment a corp dug anything. The board now asks for `RESOURCE_ASK` of a store IN
UNITS ("Bring Home 3 Units of Thorite"), the card reads what came home against what was asked,
and the Holds read in the same measure — a store holds `UNITS_PER_STORE`, a hold is what is in
it out of that, with what came home this year under each and the year's drain said in units.
Percentages that could not be added to anything are gone. THE SURPLUS DEMAND LEFT THE CARD: "end
the year N up" and the standing Spending demand read the same money two ways, the same argument
that took the losses demand out. The card's rows no longer overlap their spectrums.

**A signed prospect wears it. *Built since this was written.*** The Sign button used to move,
change into "Marked ✕" (a word that cancels), and leave a lower-case "signing" beside it. The
button keeps its place and reads *Signing · Cancel*; the card takes the signing green and wears
a corner flag (Signing, or the bid).

**Three months had no recap, and The Eight had a way out. *Built since this was written.***
The month before the lights returned early — the floor was raised and the recap never stood —
and the Dividend's own month ran under the flag the dev skip uses, so a manager saw neither the
month that led to the show nor the show's own month. Both stand now: the recap before the lights
carries on to the floor when it is dismissed, and the Dividend's month ends in a recap that
carries the card, your match, and its Watch. Only the dev skip passes a recap by (`_devSkip`,
which is what the flag always meant). THE EIGHT is a fight with no way out: `toTheEnd` keeps a
panicking fighter on the field (there is nowhere to run — and one still panicking when it stops
goes down with the rest), runs the fight past the ordinary backstop, and takes the field from
the side that loses it, so its wounded lie where they fall rather than walking away hurt.
Measured: one to three of the eight die, and none in a stun-grade year. The Drop's slots read 1–24 to a manager; the engine keeps its
own indices.

**The days walk between windows. *Built since this was written.*** The Ground only ever
animated the finished contest's replay; live, the comms windows drew complete. The window hands
the page the record so far (`record`, the days with their tracks), the page keeps to its own
OA's squads on it and lays the picture on the latest day as sightings, and when the Ground
opens after a window the days since the last one play forward — the scrubber taking the days so
far, the Play control theirs. The truth of the other OAs' movement stays with the replay.
The Drop page fits a screen: the map bounded, the landings and the key beside it, the order
strip compact.

**Shadow, screen, and the rendezvous that ends in a strike. *Built since this was written.***
Two manoeuvres the dispersed drop wanted and the mind did not have. SHADOW: a squad keeps a
stronger known enemy in sight at `SHADOW_DIST` — outside contact, inside knowledge — its aim
recomputed each dawn from the picture, done when the quarry goes out of it; the OA's picture
stays current without a fight. SCREEN: a squad stands between a digging mate and the nearest
known threat at `STAGE_RADIUS` from the mate. Both are approaches the planner can choose (leaned
toward by the careful stances) and orders a manager can give (Shadow names a sighting; Screen
names a squad). And a RALLY CARRIES A PURPOSE: when what drove an OA together is something it
can beat together (`then`), the meet hands off into a hunt on arrival — meet, then strike — so
a rendezvous is not the end of a plan but the middle of one.

**The picture on the map. *Built since this was written.*** Live, the Ground shows what your
OA knows and nothing more: your own squads and your banner's as they are, every other OA
as its last sighting — a hollow circle in its colour with the count inside and when it was seen
beneath (Landed, or the day), fading with age and gone when the picture forgets — and nothing
where you know nothing. Sight and contact rings draw only round your own. The map used to draw
every rival's true position every window, against the ruling. The truth waits for the replay,
which is the broadcast.

## The approach: why the fog never bit. *Built and measured.*

**THE SPOTTING MODEL WAS FINE. THE ARITHMETIC AROUND IT WAS NOT.** `sightRange` added
`SIGHT_FIELDCRAFT` (0.30) tiles for every point of fieldcraft OVER TEN — a rule written when a
stat was imagined to run to twenty. Fieldcraft actually runs to about 195, median 91, so MEDIAN
SIGHT CAME TO THIRTY-EIGHT TILES ON A TWENTY-SIX-TILE BOARD. Every fighter could see the whole
ground. A complete, correct, switched-on fog model had nothing left to decide, which is why every
fight in the game opened with a shot on turn one and no ambush had ever fired in any contest.

Three things, and all three were needed before any of them did anything:
- **Sight reads against the spread rosters actually deal** — `EYE_NEAR` 7 tiles for a poor scout
  to `EYE_FAR` 15 for a superb one, and neither sees the far corner. (Named EYE_ because
  `SIGHT_NEAR`/`SIGHT_FAR` already mean something else in divide.js; the suite caught the clash
  before the two could drift.)
- **A long opening is beyond sight** — 25 tiles against a 15-tile best eye, so neither side
  begins knowing where the other is.
- **The board grows to fit the approach** — 36×22 for a long opening, because an approach cannot
  happen on ground smaller than the gap.

**THE RANGE READING WAS THE INSTRUMENT'S FAULT, NOT THE GAME'S.** The first measurement said
every fight was fought at medium whatever band it opened at, and concluded there was no
short-range bloodbath because there was no short range. THE PROBE WAS BUILDING UNEQUIPPED
FIGHTERS. `generateSquad` bodies carry no kit, so every one fell back to `DEFAULT_WEAPON` —
power 5, range MEDIUM — and the instrument was reading a fleet in which no short or long weapon
existed at all. A built corp resolves its kit from the catalogue: 44 short, 123 medium, 29 long
across 196 hands.

Measured again with squads carrying what the game gives them, fourteen fights a band
(`sim/measure_bands.cjs`):

| Opening | shots long / medium / short | dead a fight | turns | ran the clock |
|---|---|---|---|---|
| Long   | 56% / 37% / 7%  | **1.07** | 16.2 | 2 of 14 |
| Medium | 44% / 45% / 11% | **1.86** | 10.9 | 0 of 14 |
| Short  | 22% / 56% / 22% | **2.86** | 10.2 | 0 of 14 |

Which is the reading that was hoped for and then wrongly written off: A SHORT-RANGE ENGAGEMENT IS
NEARLY THREE TIMES AS DEADLY AS A LONG ONE, and a long one takes half again as long to resolve.
The clock problem largely goes with it, because a fight with real weapons in it resolves.

**AND `measure_fight.cjs` HAD THE SAME FAULT**, which is worse: the standing gate on the fight's
shape had been reading unequipped fighters all along. It said the shape was fine, and it was —
for a game nobody plays. It builds a real corp now: 11.3 turns, all twelve fights ended by a side
breaking, 22 dead. The snapshots were blessed once against the corrected instrument.

**TWO TUNINGS TRIED AND REVERTED**, recorded in the source so they are not rediscovered:
refusing a shot at a body only HEARD unless it was close cured the hit rate (0.12 → 0.27) and
made the clock WORSE (5 fights in 18 running out, then 9), because a squad with nothing to shoot
at simply waits; and making a blind body close on its search point emptied the fight entirely,
because `near` is a PLACE when blind, not a body, so both squads converged on the middle without
converging on each other.

**AND THE STALEMATE WAS NOT A SEARCH PROBLEM AT ALL.** Watching a clock-running fight tile by
tile: the gap went 25 → 19 → 11 → 4 → 3 → 2 and then sat at ONE OR TWO TILES for twenty turns
while the two squads traded 188 shots. Nobody was lost; they were nose to nose. Of those 188
shot attempts, 160 FAILED FOR WANT OF A LOADED WEAPON — and the ammunition was not the problem
either, since 294 rounds remained in the squad. Five of eight hands in a fleet squad carry
ENERGY weapons with twelve to eighteen shots in the cell, a cell recharges per night at camp and
not inside a fight, and NOBODY IS ISSUED A SIDEARM. So the las-carbines ran flat around turn
twelve and their owners stood at knife range for the rest of the fight, unable to fire and
unwilling to leave, until the clock ran out.

`canHurt` asked only whether the weapon had power — a property of the model, not of the moment —
so a fighter with a flat cell still counted as armed and the band pull kept walking him in. It
asks whether the trigger will do anything now. A body that cannot shoot wants distance, exactly
as a body carrying nothing does, and the withdrawal check counts it for what it is. Clock
failures across the three bands went from 2/0/0 to 1/1/0, fights shortened (long 16.2 → 13.4
turns, short 10.2 → 8.3), and the range gradient held: **2.50 dead a fight at a short opening
against 1.43 at a long one.**

## What an energy weapon costs and what it buys. *Measured. Nothing changed.*

`sim/measure_energy.cjs` asks the catalogue and the fight, and proposes nothing. The bargain as
written is: a cell holds a fixed number of shots, recharges only at camp overnight, cannot be
resupplied mid-contest — paid for by power, and by never carrying ammunition.

**THE POWER IS NOT THERE.** Tier for tier, against ballistic weapons of the same tier:

| Tier | Energy | Ballistic | |
|---|---|---|---|
| 1 | 4.0 power at ₡470 | 4.0 at ₡440 | same power, 7% dearer |
| 3 | 4.8 power at ₡1,066 | 5.5 at ₡1,185 | **12% LESS power** for 10% less |
| 4 | 6.0 power at ₡2,224 | 6.6 at ₡2,317 | **9% LESS power** for 4% less |
| 5 | 13.0 power at ₡13,400 | 9.6 at ₡11,120 | 35% more power for 21% more |

Only the single tier-5 entry is the weapon the bargain describes. At the tiers a fleet actually
fields, an energy weapon is slightly WEAKER for roughly the same money.

**AND THE CELL IS NOT THE COST — THE HEAT IS.** A cell holds 13 shots and a fight asks for 8.2,
so running flat inside one engagement happens to 23% of energy hands, not most of them. What
actually bites is venting: A TYPICAL CELL-FED WEAPON OVERHEATS EVERY TWO SHOTS and loses an
exchange cooling, 3.2 times per hand per fight. **Energy hands fire 8.2 rounds a fight against a
ballistic hand's 12.9 — a 37% gap in output**, most of it spent waiting for a barrel to cool.

**AND THE UPSIDE IT IS PAID FOR IS NEARLY WORTHLESS.** The freedom being bought is freedom from
resupply — and ballistic weapons fail for want of a loaded weapon in 3% of shot attempts. There
is almost no logistics burden to be free of.

So a fleet's energy weapons cost about the same, hit slightly softer, fire a third less often,
and a quarter of them go silent before the fight ends, in exchange for avoiding a problem that
costs three per cent.

**THE OVERHEAT IS UNIVERSAL, NOT A CHEAP-TIER QUIRK.** Every one of the fifteen cell-fed
primaries fires TWO OR THREE SHOTS before it must stop and cool — the tier-5 Phase Lance and the
tier-1 Surplus Las-Carbine alike. It is not a property of bad weapons; it is the family.

**AND TAKING IT OUT DOES NOT FIX THE BARGAIN — IT MOVES THE COST** (`sim/probe_energy_noheat.cjs`,
a hypothetical run with the switch flipped and nothing written back):

| | energy fires | gap to ballistic | ran flat |
|---|---|---|---|
| As it stands | 8.2 | 37% | 23% |
| No overheat | 11.3 | 18% | **72%** |
| No overheat, cell ×1.25 | 13.3 | 5% | 54% |
| No overheat, cell ×1.5 | 14.8 | −8% | 36% |
| No overheat, cell ×2 | 16.5 | −15% | 23% |

THE TWO SYSTEMS ARE COUPLED, and that is the finding. The overheat was acting as a RATE LIMITER
that made a small cell last: an energy hand only fired 8.2 rounds, so its 13-shot cell mostly
held. Remove the throttle and the hand fires 11.3 — and now the CELL is the binding constraint,
with 72% going silent before the fight ends. Removing the overheat alone trades a weapon that
shoots slowly for one that shoots itself empty.

Closing the output gap without emptying the cell takes BOTH: no overheat and about half again
the charge. At cell ×1.5 the energy hand out-shoots the ballistic one by 8% — which is the point
at which the family would finally be paying for its inability to resupply.

**RULED AND BUILT: the overheat is out of the catalogue, and every cell holds half again what it
did.** A family that costs slightly more should perform slightly better; it now does. All fifteen
cell-fed primaries lost `heat` and `heat_cap` and had their charge multiplied by 1.5 — a Surplus
Las-Carbine holds 18 rather than 12, a Las-Repeater 27 rather than 18. Measured after: **energy
hands fire 14.6 rounds a fight against a ballistic hand's 13.5, a 9% edge**, with a cell holding
19.5 and a fight asking 14.6. Clock failures across the three bands stand at 1/1/1 of twelve, and NO CELL-FED HAND IS LEFT
WITHOUT A SIDEARM (`cellFedWithNoSidearm` 22 → 0, since a bigger cell no longer runs flat before
the pistol phase matters).

WHAT MAKES A WEAPON CELL-FED IS THAT IT HAS A CELL. `isEnergy` tested `heatCap > 0`, so taking
the overheat out of the catalogue would have stopped cells being spent at all and quietly turned
every energy weapon into a ballistic one firing ammunition it does not carry. The family is named
by `cellFed` now. The venting MACHINERY stays — a mod or a quirk may still put heat in a weapon —
and the suite asserts that nothing vents rather than that something does.

**TWO LATENT FAULTS CAME OUT WITH IT**, both invisible while cells were small and alike:
- A CELL HELD WHAT THE LAST CELL HELD. What a fighter carried out of the previous fight was
  restored without regard to the weapon in their hands, so a hand who ended with twenty-seven in
  a repeater and then drew a beam lance began with twenty-seven in a cell that takes fifteen.
- A SHOT COST MORE THAN THE CELL HELD. The guard asked only whether anything was left and then
  took the draw, so a `heavy_draw` weapon firing on its last unit spent two and left the cell at
  MINUS ONE — on seven of every eight energy fighters once cells grew and hands fired half again
  as often. A shot now costs what it costs, and the cell must hold it.

*Further weapon balance may want revisiting; this is a healthier starting point than a family
that was worse in nearly every way.*

## The quirks, rebuilt: the shape, and one to prove it. *Ruled; the catalogue follows.*

The old catalogue was a set nobody had authored or balanced — 15 traits in the data today: eight ruled quirks and eight racial. **84 of them changed no stat at
all**, most carried a single small hook, and — the fault under the rest — **`stat_mods` IS IN
TENTHS AND NEVER SAID SO**: a catalogue entry of `aim: 1` became TEN points on a scale that runs
10 to 200. So the numbers a person read in the data were a tenth of what the engine did, which is
how a trait called Marksman's Eye came to look like +1 and be +10. *I reported that trait to the
manager as "+2 on a hundred-point roll", which was wrong twice over.*

**WHAT A POINT IS WORTH, MEASURED** (`sim/measure_stat_worth.cjs`, 70 fights a step, a squad
bumped against its identical twin):

| Bump | Wins | Kill differential |
|---|---|---|
| +0 | 46% | +0.09 — the even fight |
| +5 | 50% | +0.10 |
| +15 | 54% | +0.19 |
| +25 | 60% | +0.49 |
| +40 | 69% | +0.61 |

So **+5 IS BELOW THE NOISE FLOOR** — four points of win rate, inside the run-to-run variance, a
thing no player would ever feel. **+15 is where an effect becomes perceptible, +25 is a good
trait, +40 is a defining one and wants a penalty against it.**

**THE SHAPE EVERY REBUILT QUIRK CARRIES:**
- `effects.stats` — flat points, REAL points, baked in at birth.
- `effects.situational` — `{ when, stats }`, applied at the fight. The conditions are a CLOSED
  VOCABULARY (`combat.js SITUATIONS`), each answerable from what the fight already knows. A
  condition the engine cannot see is not a condition, it is a wish, and a quirk written against
  one reads as working and does nothing — the exact failure this rebuild exists to escape.
- `effects.hooks` — machinery, as before.
- `effects.story` — a TONE and what an event can hang on. Named, not written: an event writer
  gets a subject and a temper to write toward rather than a stat block.

`sim/audit_quirks.cjs` refuses anything claiming the new shape and not keeping it — no functional
half, no narrative half, an unanswerable condition, or `stat_mods` in a new entry. Proved by
breaking a quirk three ways and watching it catch all three.

**THE FIRST CATALOGUE IS AUTHORED: SIXTEEN QUIRKS, AND THE OLD POOL IS RETIRED.** Every one of
the 78 old pool traits is `draw: "retired"` — out of circulation, still readable so an existing
career does not find its people carrying a trait the game has forgotten. The eight RACIAL ones
(`draw: "special"` — the psion line, the Et-y-Bellum faiths, Keshu, Cradleborn, Ankoth) stand
untouched: they are racial identity wearing a trait's clothes, and belong with the races.

The sixteen run across the three sizes ruled: **general** (+15 — Steady Hands, Hard to Kill,
Quick Off the Mark), **situational** (+20 to +30 where it applies — Close Company, Fights Hurt,
The Captain's Man, Lone Wolf, Old Campaigner, The Conscript's Friend, Needs His Rest, First Blood
Nerves), and **defining** (+40 against a real penalty — Armchair General +40 Tactics/−15 Aim,
Blunt Instrument +40 Grit/−15 Fieldcraft). Each carries a `story` naming its tone and what an
event can hang on; *Hot Blooded* names "a fight in the barracks", which is the tie a writer asked
for.

**THIRTY IN THE POOL, AND FOURTEEN LINES OF COPY BACK FROM THE DEAD.** Seven of the names the
old broadcast script already speaks for — Born Captain, Bleeder, Mentor, Few Words, Quotable,
Slow Starter, Loyal to a Fault — were REBUILT rather than retired, which brings their authored
scout-report lines back into circulation. Fourteen of the thirty-eight lines fire again; the rest
wait on the names still to be written.

RETIRING THE OLD BOOK ORPHANED FOUR HOOKS THE ENGINE STILL READS, and the suite's ghost-hook
check caught it. The answer was not to delete the machinery: `slow_starter` now carries
`early_divide_penalty` and `late_divide_bonus`, which were ALREADY WIRED to do the thing I had
duplicated in situational stats, and `bleeder` and `loyal_to_a_fault` the same. A rebuilt quirk
should reach for the machinery that exists before it grows its own.

**AND THE SMALL CATALOGUE EXPOSED A FAULT THAT HAD ALWAYS BEEN THERE: THE SHUFFLE-BAG DAMPER WAS
ERASING RARITY.** `batch_repeat_decay` is 0.35 per repeat and compounded without limit, so a
trait drawn five times kept HALF A PER CENT of its weight and one drawn twenty times kept a
billionth. Across a batch of any size every trait converged to the same frequency and
`rarity_weights` decided nothing — measured at common 51 draws a trait, uncommon 50, rare 49,
from weights of 10, 5 and 2. With the old book it was invisible; with sixteen it was total. The damper is
meant to stop one trait filling a batch, not to flatten the book, so it is floored at a fifth of
a trait's weight. Measured after: **common 76, uncommon 39, rare 14** on the first sixteen, and 39 / 20 / 6 across
the full thirty. A hand's net flat swing runs from −15 at the tenth percentile to +35 at the
ninetieth: quirks tell people apart without inflating everybody.

## The menu, rebuilt the other way round. *Fixed — after three passes that were not.*

Three attempts failed here and all three failed the same way, which is the only interesting part
of this. **THE PICTURES WERE SIZED FROM THE VIEWPORT AND THE WORDS TOOK WHAT WAS LEFT.** A
viewport-sized picture plus a text block of its own height can add up to more than the screen —
so the buttons and the fleet marks fell off the bottom, and every fix that scaled the pictures
more cleverly only changed WHERE it broke. The first pass stopped the overlap and did not stop
the overflow; the second gave the whole stage one unit, which made the parts shrink in step and
made the overflow worse, because a unit derived from the viewport still sizes the pictures from
the viewport. Each pass answered a real question and none of them answered this one.

**THE WORDS COME FIRST.** The stage is exactly the height of the window and does not scroll. The
title, the buttons and the marks are `flex:0 0 auto` — they take the height they need. The
portraits are `flex:1 1 auto` with `min-height:0`, the declaration that lets a flex child shrink
below its content: **they take what is left, and what is left is what remains after everything
that must be readable has been given its room.** Each oval is `height:100%` of that remainder
with a fixed aspect, so its width follows its height, and a `max-width` in `vw` catches the other
case — a tall narrow window, where height is generous and width is not.

There is no breakpoint in it. Nothing is positioned into anything. Worked out by hand across ten
window sizes from 1920×1080 to 380×640, the art always fits across the stage and never squeezes
below forty pixels.

**AND THE ONE-SCALE CHECK IS RETIRED, HAVING BEEN THE WRONG ANSWER.** It required every length on
the stage to be a multiple of one unit — the right answer to *the parts shrink at different
rates* and the wrong answer to *the parts do not fit*. What replaces it is structural rather than
arithmetic: the gate names the six declarations the layout stands on and fails if any is removed.
Proved by deleting `flex:1 1 auto; min-height:0` and watching it name both.

## The Kier Bastille sells the man, not the paper. *Ruled and built.*

The Bastille's numbers were already the most distinct in the game — the widest stat spread, the
lowest loyalty by a distance, half again the negative traits — and none of it was worth anything
at the table, because a manager could READ ALL OF IT before he signed. A high-variance market you
can see into is not a gamble, it is a shopping list with a wider range.

**A NATURAL-BORN GREW UP ON YOUR SHIP AND A MERCENARY HAS FOUGHT SOMEWHERE YOU CAN ASK ABOUT.
BOTH ARRIVE WITH A SERVICE RECORD. A PRISONER HAS NOT GOT ONE** — nobody was keeping score — so
the Bastille can tell you a name, a people, an age, whether he is carrying an injury, what
notoriety he has and how much sentence is left, and nothing whatever about what he can do.

The sheet carries no stats, no ceiling and no record. The card does not blank the numbers out as
though something failed to load: it says **No Service Record — The Bastille Sells the Man, Not the
Paper**, and lists what the auctioneer will actually tell you. Everything is on the fighter as it
always was; only the SHEET is redacted, and it opens the moment the man is yours. Claimed blind in
a test, one arrived with 510 in stats and four quirks including Bleeder — a fact the manager could
not have known and now has to live with.

*This is what the third market was missing. It was never short of differentiation; it was short of
a reason for the differentiation to matter to the man buying.*

## What a fighter costs and what he brings. *Measured. Nothing changed.*

`sim/measure_value.cjs` reads the markets a manager sees and prices each hand against what he
carries. **TWO READINGS IN THE FIRST CUT WERE WRONG, and both flattered a conclusion.**

**THE TERM COMPARISON WAS NONSENSE.** It set a Natural-Born's ₡110,448 over four years against a
mercenary's ₡94,368 over one and called the mercenary cheaper. A four-year paper BUYS FOUR YEARS;
comparing it to a one-year bill is comparing a mortgage to a night's rent. And the term is not
even a full liability — a hand who dies stops being paid, so the long paper is an OPTION the OA
holds, not a debt it owes. **Per year of service, which is the only honest measure:**

| | Ask | Per year of service | Per stat point | Term |
|---|---|---|---|---|
| Natural-Born | ₡2,301/yr | **₡2,301** | ₡3/yr | 4y |
| Mercenary | ₡7,864/yr | **₡7,864** | ₡10/yr | 1y |
| Conscript | ₡1,440/yr | **₡1,440** | ₡2/yr | 3y |

*(Corrected at the Bastille auction pass: the ask on a sheet is already a YEAR — `askingPrice`
is salary × 12 — and the instrument multiplied it by twelve again, so every figure in the first
cut of this table was twelve times too large. The ratios survived the error, which is how it
lasted. The Conscript row is the Kier's flat scale, see below.)*

A mercenary costs **3.4× a Natural-Born for every year he serves** and carries **14% more stat** —
**three times the price for the same quality.** The short term is his COST, not his discount: the
OA carries the risk of replacing him every year and holds no option on him if he comes good.

**AND THE POOLS ARE NOT IDENTICAL — MY PROBE WAS.** It reported the three kinds as nearly the same
person, which was `generateSquad` TAKING A POOL OPTION AND IGNORING IT: it deals the standard mix
whatever is asked for, so passing `{pool:'prisoner'}` and comparing it to `{pool:'nattie'}` is
comparing one population to itself. Read by each fighter's own origin they are quite distinct:

| | p10 | median | p90 | spread | loyalty | negative traits |
|---|---|---|---|---|---|---|
| Natural-Born | 465 | 605 | 750 | 285 | **61** | 39% |
| Mercenary | 570 | **735** | 875 | 305 | 33 | 41% |
| Conscript | 455 | 675 | 860 | **405** | **22** | **55%** |

The Bastille is doing what its data file promises — *busts and diamonds in the same lot sheet* —
with the widest spread of the three, the lowest loyalty by a distance, and half again the negative
traits. **The differentiation exists; what it lacks is a market that makes a manager feel it.** A
conscript is the cheapest hand in the game per stat point, and the risk he carries is spread thin
enough that buying one is rarely a gamble a manager notices taking.

*Nothing has been changed. This is the number run, twice corrected.*

## The Kier Bastille: OAs compete on the way out. *Ruled and built — and one ruling re-learned.*

The blind sheet made the Bastille a gamble; nothing made it a market. A claim was free and first
refusal went to whoever was shortest of people, so a good gamble cost what a bad one did. And —
the thing the redaction had not caught — **the price was the sheet.** The card carried the man's
wage, and the open-market wage is `salary_base × (quality/64)^2.2`: measured against his stat total
it reads at **r = 0.92.** The numbers were redacted and the wage said them. The fee leaked too,
through a `potential_premium` that multiplied the scout estimate into the price of young lots.

**THE AUCTION WAS BUILT, AND STRUCK A SECOND TIME.** The first answer was to make the Kier an
auction — seven OAs bidding credits, the highest taking the man. It ran, it measured clean, and
it was wrong: the prep calendar's own comment says the T4 auction "was built and moved by designer
ruling," and it was rebuilt past that line. The ruling stands and is now in `recruitment.json`
where it cannot be read past: a lot of people bid for with credits is chattel whatever the paper
says. Volunteers choosing a way out is the distance the setting needs; a hammer is not.

**WHAT THE KIER CHARGES, ruled in `recruitment.json`:**

- **The wage is the Kier's scale, flat:** `kier_wage_monthly: 120` (the pool's median open-market
  wage at the old 0.62 discount, which was itself a second discount stacked on the data's 0.55 —
  both gone). A diamond costs no more to keep than a bust. A freed man asks his own price at
  renewal, as before.
- **A flat processing fee:** `kier_processing_fee: 600`, five months of his wage, for the paperwork
  on anybody an OA takes. Nothing about the man moves it.
- **Remission, per Divide forgiven:** `remission_per_divide: 3500`.

**OAs COMPETE ON HIS ROAD OUT.** Every OA that wants him offers a term: the sentence as
written, or release after fewer Divides — and every Divide it forgives it buys from the Kier. He
takes the shortest road; between equal roads, the OA whose people come home (`weighOffer`,
money held constant; a grudged OA is off his list at any term). The prisoner's power was
always the exit; now the exit is the whole market. `state.bids.bastille` carries a TERM, not a
price, through the same `placeBid` the merc window uses. The manager's own OA is in the room
like the others but offers the sentence as written unless told otherwise — remission is a
decision, and the card is where it is made: *Honour the Sentence · Release After 2 · ₡3,500 ·
Release After 1 · ₡7,000.* The recap says what road the man took and whether he was offered
shorter or simply trusted the other OA more.

**WHY REMISSION IS THE RIGHT SCREW.** With term as the only currency the dominant play was one
Divide, everyone, every year. Priced, it stops being a policy: six men bought down to one off
three- and four-Divide sentences is ~₡40,000 of a surplus that is ~₡110,000 today and coming
down. Honouring the sentence is still the cheapest hand in the game, so *cheapest, blindest*
survives as the Bastille's identity — and the gamble is exactly the one it should be: you pay to
shorten a blind man's road, and if he is the diamond you paid to lose him sooner. Standing is the
free lever: an OA nobody trusts must buy remission to win the man a respected OA gets at
the sentence.

**`sim/audit_bastille.cjs` is the gate.** Thirty seasons of one fleet: the Divides each AI OA
buys off a man set against the stat total it could not see (bounded at two standard errors on
the count of men; reads 0.04), every volunteer on the Kier wage and fee, remission charged for
exactly the Divides forgiven. Measured shape at 3,500: 7.6 offers a man, sentences averaging
2.9, roads taken 1.9, AI buying 0.66 Divides an offer — about ₡2,500 an OA a year in remission,
which is to say the AI mostly honours the sentence and the price is there for the human who
would not. **3,500 is a starting point, not a ruling on the number.**

**THE PROBE LIED FIRST.** Its first cut opened a fresh fleet each pass, which is season one each
pass, and a lot is seeded by kind, season and month — so it read the same six men forty times
and found youth against stat total at −0.55 off six people. One fleet, seasons advancing.

`claimPrisoner` / `claimsOf` / `_bastilleClaims` are gone; `BASTILLE_WAGE_FRAC` is gone;
`contract.sentence` is kept beside `divides_required` so the sheet can show both.
`measure_value.cjs` reads the man under the sheet (it had crashed on the blind record since the
redaction).

## The wages were paid twice, and so was the entry fee. *Fixed. The surplus is measured whole for the first time.*

The instrument below read eleven months of one OA and stopped at the lock. Everything that
decides the year lands AT the lock — the board grant, the entry fee, the retainer's last twelfth,
the purse — so the surplus it reported was never the year's, and two of the lines it could not see
were wrong:

- **Pay was charged about twice.** "The wages were never paid" posted the FULL contract month by
  month, while `settleSeason` still posted the S15 retainer at the lock and `payPurse` the S15
  purse at the muster: ₡292k against a ₡178k wage bill, measured. RULED: the monthly line IS the
  retainer, the two fifths a body is paid for being on the books, spread over the year; the purse
  is paid at the muster to those who drop; the lock posts the Divide month's twelfth. A contract
  is paid once and a rested body still costs two fifths of a fielded one. (G22 holds.)
- **The entry fee was charged twice.** "The entry fee was never taken" put a line at the lock from
  every OA that is going, beside the one `settleSeason` was already posting. ₡80k a year for a
  ₡40k fee. The season loop's line is the one that knows who is going; the ledger's is gone.

**`measure_economy.cjs` now reads every OA through the lock.** Three years, before any Divide
is fought (the win bonus and ransoms land after and are not in this):

| OA | diff | grant | gate | pay | entry | other | **net / yr** |
|---|---|---|---|---|---|---|---|
| Nevlon | 2 | 265k | 171k | −106k | −40k | −38k | **+284k** |
| Knights' Star | 2 | 215k | 143k | −82k | −40k | −44k | **+217k** |
| Violet's | 1 | 290k | 153k | −82k | −40k | −62k | **+271k** |
| Alliance | 3 | 240k | 27k | −82k | −40k | −99k | **+66k** |
| New Line | 4 | 165k | 147k | −78k | −40k | −41k | **+159k** |
| Vantis | 4 | 250k | 109k | −71k | −40k | −85k | **+175k** |
| Verdant | 5 | 130k | 68k | −70k | −40k | −62k | **+36k** |
| Mercy | 3 | 230k | 120k | −68k | −40k | −56k | **+215k** |

**The fleet clears +₡178k an OA a year before it fights.** The shape is two incomes each sized to
the same bill: `ledger.js` says the grant "covers wages", and the gate — added later, §GATE — is a
second income of the same order on top of it, so pay is a quarter of income. The gate is the only
line that moves with anything a manager does (standing and fame: Alliance, loathed by the fleet,
takes ₡27k where Nevlon takes ₡171k), and the difficulty ladder shows through it. Nothing here is
re-priced yet; the ruling on where the surplus comes down is open, and salaries and acquisition
are where the designer has said it should.

## The first money pass. *Ruled; a starting point, not a settlement.*

Four levers, none pulled all the way, as ruled: mercenaries are not the bulk of a team, the
correction is not to be dumped into one thing, gear is a lever for later, and the grants were
never facts. Everything below is in data or a `[C]` constant and can be moved again.

- **The founding mix** moves into `recruitment.json` (`founding_mix`) at **70 / 10 / 20**
  natties / mercenaries / prisoners; it was 45/35/20 in `roster.js`, a third of every founding
  roster mercenaries at three times a Natural-Born's wage. Founding pay fell before anything else
  rose, which is the right order. The five combat snapshots moved and were blessed;
  `measure_fight` holds.
- **`salary_base` 400 → 600**, and the Kier wage with it, 120 → 180 (the same 0.62 of the
  pool's median). A Natural-Born year is ₡3,486; a mercenary's ₡11,795; a Conscript's ₡2,160.
- **Board grants halved** in `oa_profiles.json` (₡65k–₡145k). The funding note's own history:
  they were sized to a wage bill read off an instrument that multiplied a yearly ask by twelve.
- **The gate cut a quarter** (`GATE_*` in `ledger.js`).

**Measured, three years, before the Divide is fought:** fleet average **+₡12k** an OA a
year (was +₡178k). Violet's +₡69k, Nevlon +₡75k, Knights' Star ±0, Mercy +₡6k, Vantis +₡8k,
Verdant −₡27k, Alliance −₡89k. The Divide's own money (a win bonus averaging ₡70k across the
fleet, mostly to the winner; death benefits ₡26k the other way) now decides whether a year
was good. Pay is ~₡115k of ~₡250k income, not a quarter of ₡425k.

**Open, noticed on the way:**
- **The ladder is not monotone.** Knights' Star (diff 2) breaks even where New Line (diff 4)
  clears ₡53k, because the gate follows *fleet standing* and New Line is liked. Difficulty
  buys roster and grant; it does not buy a crowd. A profile question.
- **Alliance burns ₡89k a year** on a ₡292k treasury: three years to the board unless it wins.
  Loathed by the fleet, it takes ₡17k at a gate Nevlon takes ₡120k from. Whether that is the
  intended feel of "buys people and breaks compacts" is for the designer.
- **Kit is nearly free.** Procurement averages ₡8k an OA-year: the allowance caps the value
  fielded, OAs fight out of their lockers, and nothing is charged for carrying. The next
  lever, and it wants `items.js` read properly first.
- **Opening treasuries** (₡270k–₡390k) are now four or five bad years deep. Not moved.

`measure_economy.cjs` reads every OA through the lock and is the gate for all of this;
`harness/drive.cjs`'s training check was reading a cohort mean that the drive's own trades
moved — it reads each hand against itself now.

## The founded OA is the yardstick. *Ruled and built.*

The only OA a manager can play is the one he founds at the desk. The instruments were handing
an established OA to the "human" and reading its books — no such game exists — and the
founder's own money had not been touched by the pass above: a **₡150,000** grant, the largest in
the fleet after the eight were halved, for an OA nobody has heard of. Played carefully (his own
people from the tryouts, prisoners at their sentence, a mercenary only to fill the last slot) a
founder cleared **+₡100,000 a year** before he fought and tripled his bank in three years. Two
causes, and the second was the larger:

- the grant, and
- **the crowd liked him on day one.** The desk builds a founded OA as the fleet's average in
  every number, reputation included, so an OA with no history opened at own 54 / fleet 42 and
  took ₡93k a year at the door before it had done anything.

**Ruled:**
- `founderProfile` lives in the engine now (the page's `blankSlate` calls it), so the desk and the
  instruments found the same OA. It is **liked at home and unknown to the fleet**: its own
  people's standing comes from its dials, as any undeclared OA's does; the wider fleet has no
  opinion yet. Opening at zero on every audience was tried once and read as "your own crew hates
  you"; home stays warm.
- **`LEAN_GRANT` 150k → 75k**, and **the founder's own people open at 60.** The first cut read
  home standing off the dials and got 29 — which the page's own-people bands call *Mutinous*, a
  crew close to walking off on the first morning; the grant was held at 90k against it for a week.
  "Liked at home" is ruled to mean what the bands mean: 60, warm, not yet loyal. Measured with
  that, three years before any fighting: **−₡4k, −₡5k, +₡4k**, the crowd doing the growing (₡65k
  → ₡85k at the door). Tight early, more choices as he grows, which is the feel ruled. The kit pass
  will make the first year dearer still and is measured then.
- **The eight are funded relative to the founder.** `grantFor(profile)` gives an established OA
  `LEAN_GRANT × (2 − 0.25 × difficulty)`: ₡131k for a 1, ₡56k for a 5. At 75k the eight average
  about break-even before the Divide is fought; the Divide's money decides their year too. The eight hand-written
  `funding_base` figures are gone from the profiles. Established OAs open with full rosters and
  armouries; the founder's ₡210k treasury is what he builds a passable team from, and the grant is
  what keeps it standing.

**The eight, same run:** Violet's +₡68k, New Line +₡40k, Nevlon +₡23k, Knights' Star +₡19k,
Mercy −₡3k, Vantis −₡51k, Alliance −₡115k. Average +₡17k an OA a year before the Divide.
Alliance is now a three-year OA unless it wins, on a gate of ₡17k; whether that is the intended
feel of the fleet's least-liked OA is still the designer's call.

`measure_economy.cjs` founds an OA as the desk does, plays it carefully, and reports it first.

## The founder's years, played through the fights. *Measured; three more double charges found.*

`measure_founder.cjs` founds an OA as the desk does, plays it carefully, and follows it
through the Divide for six careers of three years. Reading the whole year rather than the year
up to the lock turned up three more things paid twice or not at all:

- **The dead were paid for twice.** Settlement charged an estimate (mean contract × a multiplier,
  a year late) because the benefit had "never been charged"; the families were then paid properly
  where the dead leave the books, off each contract's own `death_benefit`. The estimate is gone.
- **A trade moved the credits twice** on the page: the treasuries were moved directly and then the
  ledger lines moved them again. A manager paying ₡50k paid ₡100k. The poster moves the money now.
- **The fleet was selling the manager's people.** `fleetTrades` — "the thinnest roster shops, the
  deepest sells" — had the manager's OA in its pool, and a full roster is the deepest in the
  fleet, so his fighters went to the thinnest OA for cash, unasked and off the books. The
  fleet deals among the other seven, on the books; his table is his own.

**What the founder's year looks like through the fights** (six careers). Before the fleet
stopped selling his people he ran −₡22k, −₡17k, +₡106k and won one Divide in nine. With his
roster his own:

| | year 1 | year 2 | year 3 |
|---|---|---|---|
| average | +₡55k | +₡1k | +₡291k |
| worst | −₡136k | −₡75k | −₡31k |
| best | +₡198k | +₡71k | +₡627k |
| Divides won | 3 of 6 | 0 of 6 | 3 of 6 |

Five careers of six end above the opening bank; one ends at ₡1.1 million. **The prize for
winning a Divide is the largest sum in the game by a distance** — a winning year is worth
five or six of the board's grants — and the wage bill is not what decides anything. What does:

- **Deaths.** The eight lose **6.4 of 17 dropped, every year** — 37% of everyone who goes down the
  well — and the founder 7.3. The "bad year in which you lose half" is the ordinary year. Pensions
  (~₡40k), the rebuild, and the churn through every market follow from it. A combat question, and
  the largest open one in the money.
- **The win.** `Divide bonus (the OA takes the rights)` and the settlement's bonuses: measured
  before the trade fix, ₡125k on average in a year-three fleet and up to ₡600k in one OA's
  year. The ruling that the planet is worth what it is worth stands; what reaches the operating
  account as "a bonus on the win" is the number to look at next.
- **Ransoms.** The eight roughly break even (₡49k in, ₡46k out); a losing founder paid ₡40k and
  got ₡15k. One career took ₡295k in ransoms in a single year.
- **Kit is the same for everybody** (~₡36k fielded, founder and eight alike): the cap is on value and
  gear is nearly free, so the founder's empty armoury is not costing him anything yet. The gear
  pass is where "a passable team from ₡210k" starts to mean something.

## The table: a read, and the principal made a party to the deal. *Built.*

**What was there.** A joining OA priced two futures — staying (its odds, the people it would
lose) and joining (a share of the banner's improved odds, fewer losses, or its people sent home)
— charged more for being seen to fold, more for greed, more for history; knew its worth as a
spoiler; the buyer squeezed the beaten; the crowd forbade the ugliest deals at any price; the
settlement paid cut-of-a-cut correctly. The best-thought-through system in the project. Three
holes:

- **No table.** A joiner computed BOTH sides' limits — the principal's private ceiling included,
  off dials it could not know — picked a point by patience, and the deal was struck. The
  principal decided nothing; nobody could be wrong. A calculator.
- **The manager's banner was bought for him.** Only his ceding was protected. AI OAs joined
  under his banner on terms they set, and he paid the crowd's price for buying a win.
- **Nothing reached past the current Divide**, and the living opinion each OA holds of another
  (which `reputation.js` tracks per rival) never touched a price: the table read only the
  profiles' written relationships.

**Ruled and built** (`negotiate.js` §6.2–6.4, `divide.js`, `reputation.js`). By ruling, money and
odds stay the spine of the table; the rest are terms inside the valuation, and none is large.

- **The principal answers** (`considerTake`). The joiner asks from an ESTIMATE of the ceiling
  (±15%, drawn once per pair per Divide, so an OA is consistently over- or under-confident
  about one banner) and can ask too much; refused, it comes down 10% a time. An AI principal
  re-prices from its own side. Measured over eight Divides: 22 joins, 4 asks refused by the
  principal, none struck on the manager's banner.
- **A manager's banner waits on him.** An OA that wants in ASKS; the ask stands on the window
  with their terms, what refusing costs each side (his people, theirs — the spoiler and their
  expected losses, both already priced), and three answers: their terms, his own terms (he may be
  generous past his arithmetic; the crowd's wall still stands), or refuse. An ask he lets lapse is
  a refusal.
- **Beyond this Divide** (`SPITE_WEIGHT` 0.15): a principal counts a fraction of what finishing a
  OA would cost THEM — their pensions, their replacements, in their own money — against taking
  them in, by aggression and treachery, ×1.5 with a grudge, nothing for an OA it is warm to.
- **Mercy** (`GOODWILL_WEIGHT` 0.06): a traditional OA pays a little over the arithmetic to
  take a beaten rival in.
- **Three memories**, raised on the principal with the other OA as target so it is THAT OA's
  people who remember, and the fleet: `spared` (took a beaten OA in: rival +9, fleet +4),
  `generous_terms` (rival +6, fleet +2, own −1), `left_to_die` (refused its surrender, then it was
  wiped: rival −20, fleet −8, aleas −3, slow to fade).
- **Memory reaches the price** (`livingRegard`, `RIVAL_PRICE` 0.20): an OA's living regard for
  another moves what it asks of it, ±20% at the extremes; a traditional OA left to die will not
  deal with the OA that did it. Measured: Verdant, spared by Mercy, regards Mercy at +35 the next
  year and asks a fifth less to deal with it. (The first cut read the memory from the wrong end
  and moved the wrong OA's price.)

**The second pass** (`negotiate.js` §6.5–6.8) took the rest of the list:

- **Whom to approach** (`rankBanners`): every banner ranked by what joining it would be worth to
  THIS OA at its guess, warmed by living regard (±15% at the extremes), discounted 30% for a
  OA it holds a grudge against, lifted 15% for a banner that stands in a grudged favourite's
  way (kingmaking). It used to go to the two strongest, always.
- **When** (`actsThisWindow`): urgency is the worse of how far behind its banner is and how late
  it is; patience holds an OA back while it still has a chance, to a floor of 15%. Measured:
  OAs sat out 118 windows in eight Divides where before they offered in every one.
- **What to ask for** (`composeTerms`): a site or a category the OA values at least a quarter
  more than the banner does is asked for first — that is where the surplus at a table lives — the
  balance in credits by how badly it wants cash and in a share of the take. The 22% coin toss for
  a cut in kind and its fixed discount are gone. Measured: 23 of 26 deals now carry a term in kind
  and 7 a named site, up from a handful; that is what the values say, and it is worth watching.
- **Principals reach out** (`considerInvite`): each standing AI banner courts, once a window, the
  OA whose joining would lift its take most, at a little over what it guesses that OA's
  floor to be; the OA answers by its own arithmetic. Measured: 20 invitations in eight Divides,
  10 taken. (The spoiler — what an OA costs a banner by staying — measured at a body or so, ₡3k
  against gains of ₡150k; it is not what moves anyone, and the invitation does not wait on it.)
- The strike is one function now (`strike`), the door an accepted ask and a taken invitation both
  go through. The manager's window shows terms in kind on an ask.

**The third pass — the table is for the OA you are engaged with.** RULED: not the
leaderboard; the one hunting you, the one you are beating. And ruled with it: teaming up for
alliance's sake, not circumstance, is what the Aleas and the fans punish — so what an OA
thinks of another moves the PRICE, never the choice, and the "join a friend" note above is
withdrawn as a wrong idea.

- **Contact is recorded** (`noteContact`, §6.9): the engine counted engagements per OA and
  never whom, and the hunting intent never told the hunted. Now each corp keeps, per other corp,
  fights between them, who lost to whom, who is hunting whom, and the last day of contact; the
  table reads it summed over a banner's members (`ctx.contact`).
- **Whom to approach, whom to court:** a banner's value to a joiner is lifted up to 60% by
  contact (fought, hunted by, lost to) and halved for a banner never met; a principal courts the
  OA it is on top of first. Regard is out of the ranking. Measured, eight Divides: 23 of 24
  deals between OAs whose squads had met; 20 with the OA that had beaten the joiner; 8
  with the one hunting it.
- **A cold alliance** (§6.10) — a deal between OAs that never met this Divide — costs the
  folder 30% more to be worth the shame, the buyer 15% off his ceiling, and both are remembered
  (`cold_alliance`: own −3, fleet −8, aleas −10). One in eight Divides, punished.
- The manager's strip says who is on him: *Hunting You · Beat You · You Beat Them · Fought You.*

**Can the OAs decide well at all?** Not "fully considered" — eight parties, hidden information
and a fight nobody can predict; no human manager considers everything either. The target is
LEGIBLE AND CONSISTENT, not correct: one valuation used everywhere, a few visible commitments
(culture, position, contact, memory), an intention per Divide so the windows hang together, and
lookahead only where it is one cheap step. The order: measure first, then intentions, then the
valuation consolidated across ransoms, captives and pacts, then the settlement's scale.

**`measure_regret.cjs` — the measurement.** Every AI decision at the table passes through
`decide` (`divide.js` §6.11): act or hold, which banner, accept or refuse. The instrument runs a
Divide, records them, and for a sample REPLAYS THE WHOLE DIVIDE FROM ITS SEED with one decision
forced the other way, everything after left to the AI, and scores the OA's outcome — the
settlement's take less its permanent losses at the table's own price for a body. Signed: the
other way minus the way taken. (The first cut reported "best minus chosen", which cannot be
negative, and read principals as overpaying for joiners when they were not. A one-sided ruler.)

Six Divides, 36 decisions replayed:
- **The principal's accept/refuse is the only decision that binds.** 14 live rows: the other way
  was better in 6, and the way taken came out **₡121k better on average**. Mercy Concern decides
  best (−₡325k for the other way, n=6); Knights' Star worst (+₡60k, n=5).
- **The joiner's decisions are moot: 20 of 20.** Act or hold, this banner or that — the money is
  identical, because the offer could not close either way. Only ~8% of OA-pairs are ever
  viable (the crowd's wall and the floor-over-ceiling account for the rest), so a joiner's
  "deciding" is mostly theatre. That is a finding about the table's SHAPE, not the AI: whether
  viability should be that rare is a design question, and it is why the instrument had nothing to
  measure on that side.

**Appetite** (`negotiate.js` §6.12, `appetite`). RULED: the decision to give up is variable on
what an OA knew going in and what has happened since — the board's expectations, its interest
in the planet and its resources, the state of its squads' health, its combats through the
Divide, and its strength now against its strength at the drop. One number, 1.0 indifferent,
built from those five and read into the joiner's floor (hungry to stay, dear to fold) and,
gently, the principal's ceiling. Stance is NOT in it: stance already governs how much Divide an
OA goes looking for, and applying it at the table too double-counted it (the `STANCE_LIFE_MULT`
note). Two readings were wrong in the first cut and are fixed: the resource term read every OA
against a base and pinned all of them at the cap (it is relative to the fleet's interest now);
the board term was a net push upward because nearly every board wants a win (a win demand now
counts only while the OA can still win, and a board that wants money counts against). Measured:
median 1.00, p10 0.61, p90 1.31, falling from 1.09 in the first six days to 0.92 in the last as
squads wear down; deals per Divide unchanged at about five. The manager's strip says it as a
word: *Hungry · Holding · Wavering · Wants Out.*

**What the regret instrument said about it, and what it means.** With appetite pinned at 1, the
principals' accept/refuse came out −₡38k (the way taken better) over 19 live rows, right 10 of 19;
with appetite live, +₡74k over 22, right 8 of 22 — consistent over two sample sizes, so not
noise. Appetite is not lying: the odds board reads real force. What it did was let more MARGINAL
folds close (a wrecked OA now asks little), and every marginal accept is a coin flip the
principal's ceiling was already losing narrowly. The ceiling is too generous at the edge; appetite
exposed it. The calibration is the instrument's job and it touches the settlement's scale, which
is the designer's — so it is recorded here and not tuned.

**One valuation** (`negotiate.js` §6.13). Ransoms, captives and pacts priced from their own dials
and fixed constants; none read the body price the table uses, the living regard between OAs, or
appetite. Now: a ransom is asked at what the body is worth to lose — the contract's pension and
the signing it takes to replace him, as `bodyMoney` prices a body for the table — marked up a
quarter and moved by what the captor thinks of the owner; the owner pays up to 1.6× that worth,
scaled by its appetite to keep fighting, from the treasury it actually has (the Divide's corp
carries it under `persist`; the first cut read a field that was not there and closed nothing).
A captor's living regard for the owner colours a captive's fate — an OA that was spared releases,
one left to die kills. A hungry OA wants no truce; one that wants out wants one badly; an OA that
will not deal with you will not sign a truce with you. Measured, six Divides: 129 ransoms (about
four captives in ten bought back) at a median ₡4.4k; 12 pacts.

**`sim/audit_table.cjs` — the table held to its character.** `measure_regret` says whether the
OAs' decisions made money; this says whether they made sense, as a gate: a beaten OA approaches an
OA its squads have met first, among those that could take it (18/18); a principal courts OAs it
has fought (6/6); cold alliances are rare (1 in 23); an OA left to die asks more of the OA that did
it and one spared asks less; spite is an aggressive OA's, goodwill a traditional one's; an OA with
half its people down wants out and its floor falls; stance is not applied twice; a manager's
banner is never bought for him; the principal both refuses and takes. Two behaviours were fixed to
pass it: a rich cold banner could still outrank the OA on top of you a quarter of the time
(`RANK_CONTACT` 0.6 → 1.0, `RANK_COLD` 0.5 → 0.4), and principals were inviting strangers — a cold
alliance by construction, one deal in six (invitations now go only to OAs the banner has met; a
stranger may still ask, and pay the cold price). One check was retired as a statistic and rebuilt
as a mechanism: OAs that ceded and OAs that held read the same appetite at their last window
(0.86 vs 0.85), which says appetite is not what decides WHO folds — viability is — only what it
costs; that is reported now, not gated.

**Learning inside a career** (`negotiate.js` §6.14). Every deal at the table was a promise about
a take that had not happened yet. At the settlement a joiner learns whether joining THAT banner
paid what it signed for (the take it got against the value it agreed, paid at 60% or better) and
a principal learns whether buying THAT OA's help won; kept per pair on the season corp
(`persist.dealRecord`, written by the Divide, carried across the lock) and read into
`priceModifier` at 10% a lesson, capped at ±30%. Private: nobody else's opinion moves. Measured,
three seasons of one fleet: 20 pairs with a lesson, 14 deals that paid, 12 that did not; an OA
burned twice asks 30% more of that banner, one paid twice asks 20% less. Gated (`audit_table` T10).

**The edges** (§6.15–6.16). *A manager answers his own ransoms:* when his man is held, the
captor's price waits on the window — the man's name, the price, what he costs to replace — and he
pays or declines; when he holds another OA's man, their offer waits there and he sells or keeps.
The willingness roll answers only the AI now. Sixteen asks in three Divides, none settled for
him. *A refused ask comes back different as well as lower:* the first in whatever form the values
favour, the second dropping the terms in kind for share and cash, the third offering to stand its
people down. (Principal refusals are rare — two in six Divides — so this fires seldom; it is
there for when the guess is wrong.)

**Still open on the table:** the principal's ceiling at the margin, which waits on the settlement's
scale — the pot of a Divide is planet-scale while every cost at the table is body-scale, and that
gap is why odds dominate everything. Parked here to move on.

## The corner and the turn. *Ruled from four rounds of mockups; built.*

The most-clicked control in the game — *Waiting on You / End the Month* — was a gold rectangle
over a flat list at the bottom right, and the eye did not go to it. Nine treatments were mocked
in the game's own palette, then combinations, then the winners in place on a Desk at its real
density. Ruled:

- **The Beacon.** A circle, breathing gold, the words inside it, the count as a solid gold badge on
  its rim, the next page named beneath. Clear, it goes hollow and cyan: *End the Month · Nothing
  Waiting on You.* The items are tabs at the screen's edge showing only their kind — *Focus, Letter,
  Board, Event, Eight, Drop, Kit, Dirt* — that slide out when the pointer comes near. Clicking a
  tab goes to its page; the Beacon goes to the first item's.
- **Here.** When the item you click is already the page you are on, its tab reads *Here* in cyan,
  the Beacon's line says *You're Here · Desk*, and the one element the item is about gets a single
  cyan pulse (`pingFor`): the focus tally, not the pips; the events box; the Eight's card; the
  page's first box when an item has no element of its own. Every click pings again. Three-pulse
  pings and docking tabs were mocked and rejected as too much.
- **The Ledger Turn** (`playTurn`). Ending a month is an event: a band wipes across the screen
  carrying the month leaving at its leading edge and the month arriving behind it; the number
  ticks over in the middle and turns from the old colour to the new; a rule draws under the name
  as a gradient from one to the other; the year line's stop lights; then the month's summary
  stands up. Every colour is the year line's own (`monthKind`), so after a couple of years a
  manager knows what month it is from the colour of the wipe. 3.5 seconds; skipped under the dev
  skip and by the harness (`__noTurn`).
- **The Flare** — a cyan radar sweep round the rim — is reserved for waiting on another manager
  (multiplayer) and not built.

## The recap is a front page. *Ruled from mockups; built; to be carved.*

The month's summary was a grid of seven boxes — work, events, training, left waiting, money,
people, standing — each a list, none saying which of them mattered. Three shapes were mocked (a
front page, a ledger sheet, a five-sentence wire); the front page was ruled the shape and the
ledger the substance, the wire rejected. Built: a strip (the month ended; the month arriving, in
its own colour), **one headline** in large type for the thing that mattered most — the show held,
an event answered, who signed or left, the money, or *A Quiet Month* — and a deck line for the
rest; a *Decided* list of every event with *Your Call* or *By Default*; a sheet head (the OA, the
year, the month) over three ruled columns, every line a kind, a description and a figure on the
right on dotted rules — **Money** from *At the Start* through every ledger line to *At the End*
under a double rule, **People** as *Signed, Left, Changed, Arranged, Drilled* with stamps
(*Mending, Clean, Traced*), **Standing** as gauges with a tick for a month ago and the figure and
its change beside each; what was **Left Waiting** stamped on a red rule at the foot; *Continue*
as the Beacon in the arriving month's colour. Credits are gold and money leaving is red (`crs`); standing deltas are good/bad and read
*±0* when nothing moved. Copy is in the conventions (Title Case phrases; `audit_ui` clean). The
turn hands off to it under the veil, so the veil fading and the summary arriving are one motion.

## The page on a phone. *A first pass; the desk is still the desk.*

The menu's three ovals opened empty on a phone and New Game seemed to do nothing. Two causes
found without a device to hand, and one aid added because there was no device to hand:

- **The ovals took their height as a percentage of a flex row**, which a phone's browser resolves
  to nothing while the row's own height is still being worked out. Under 720px they take a width
  and let the aspect give the height; everywhere they have a floor, so they are never empty. The
  stage's `100dvh` has a `100vh` fallback beside it.
- **The corner was hidden under 900px** (`body.yearline #agenda{display:none}`), so a phone had no
  Beacon and no way to end a month but the header — a "destroyed by a resize" the audit did not
  catch because the rule was on a body class. It shrinks now instead: a 72px Beacon, tabs that
  stand out fully where there is no pointer to come near with, room under the page for it.
- **Errors are written onto the page.** A script error on a phone is silent. Any error the page
  throws now shows as a red band at the top — the message and the line — which a thumb dismisses
  and a screenshot carries back. If New Game still does nothing, the band will say why.

The turn's number scales with the screen; the recap's columns already stacked under 900px.

## The map, day by day: how much was the engine and how much the page. *Measured; both fixed.*

A manager skipping days and watching his squads saw them jump, vanish, and die without a fight.
`measure_map.cjs` reads the same recording the page replays from and checks the engine's half:
how far each squad moved in a day against the day's march, whether a squad that went down had a
fight (or the wall, or a hazard, or a reform) beside it, and whether any squad ever left the
record. Three Divides, 1,778 squad-days:

- **Squads never leave the record.** Zero vanishings. "Disappearing" was the page's.
- **Every squad that went down had a reason beside it.** 62 fights, 7 reforms, 2 to the wall,
  none unexplained — once the fight radius was widened to what a fight can span and reforms
  were counted. "Dying without a fight" was two things: a fight recorded at its midpoint up to
  two marches from a participant, and a **reform** — a spent squad broken up at a comms window
  and its people spread across the OA's other squads, recorded as *down* and drawn as a death.
- **The march was twice what it said.** Pace read `(reflex − 10) × 0.012` from the days when
  stats ran 10–20; at today's scale the median squad marched at **1.9× DAY_MARCH** and a quick
  one at 2.5× — past contact range in a day, which is most of "jumping." Anchored at the median
  reflex now (`PACE_PIVOT` 90, `PACE_PER_REFLEX` 0.002, 0.8–1.25): a day's move p90 fell from 1.23
  marches to 0.80. What remains over budget is honest — a march on salt flats plus the run after
  a lost fight.
- **The run after a lost fight** was set on the squad directly, so the marker finished its
  animated march and then jumped. It is a leg of the day's walk now, and the page draws it.

**The record, played.** Two days pass between comms windows and watching them was a second a
day with fights that simply appeared. RULED: a full record of every squad's movements and
engagements over the segment, at a pace to parse. A day on the Ground takes 2.6 seconds at
Normal (4.2 Slow, 0.9 Fast; a speed control on the scrubber), scaled to the longest walk; day
fights fire at their moment in the march and night fights at its end, each with a burst and a
label — the two OAs' tags and *Broke Off / Held to Dark / N Down* — that stays once the day is
done; and **The Record** beside the map lists every one of your squads' days: *D4 · Hunting ·
0.8 Marches · Met Nevlon · 2 Down · Stress 31 · 6d Food*, each line a scrub back to that day.

**On the page besides:** a squad broken up is recorded *folded* and drawn *Folded In*, not as a remnant;
a foreign squad the engine has stopped tracking for planning (three days stale, or dead) is
kept on the manager's map as last-known — fainter, dated *Last Seen D<n>* — or as a *Down*
remnant, to eight days (`pictureForMap`, `MAP_STALE`), where it used to vanish the moment the
planner forgot it. Fights per day 4.3 → 4.0; Divide length unchanged.

## A work order from play. *First pass.*

- **A re-signed hand was never actually re-signed.** `answerRenewal` records the call and
  `renewRoster` honours it — but the branch a MANAGER reaches set the new salary and never reset
  the term, so `seasons_remaining` stayed at zero and the offseason expired him again, every
  year. The AI's own branch always reset it. Fixed, and the calls are cleared once answered
  (they were a standing instruction). A released hand walks at the turn, as he always did; the
  card says so now (*Let Go · Walks at the Turn*) rather than looking as though nothing happened.
- **CEILING came off the market card too.** The prospect card lost it when the hidden ceiling was
  ruled out; this one was missed, and was still naming a mechanic that is not there.
- **A chevron is a button.** 28px with no edge still read as a hint; the fold is a bordered
  34×30 control now, lit at the head it belongs to.
- **Gather Intel reads like the drill grid:** the name centred and underlined as the link it is,
  the subtitle gone (it said what the dossier says).
- **A recovery name opens a sheet**, the one list on the Desk that did not.
- **The market's columns are the racks.** Two columns held ONE rack's rows split down the middle
  — carbines above carbines beside carbines. A rack is a column now, whole, beside the next.
- **One shape for a reward:** *Reward on Completion · ₡40,000* and *Reward on Completion · 2
  Medical Kits*, so the board compares like with like.
- **The corner follows the page.** It was drawn once and remembered which page had been open, so
  a *Here* from the Desk stayed *Here* on the Roster and pinged instead of moving.
- **DEV: Skip to Lock** arrives with a team worth testing: four squads of five from the best of
  the roster (signing the shortfall up to twenty fit bodies), the steadiest hand leading each,
  a decent mid-tier hand on every body. **DEV: Fill Squads** does the same on its own.

**The OA sheet** (`renderOaPanel`). An OA was readable only through the Desk's intel row, one
dossier at a time, on one screen. Its name now opens a drawer — the fighter sheet's own — from
anywhere it is written, because `cSpan` carries the hook and one delegated listener answers for
the whole page: the banner and the motto; its people's, the fleet's and the Aleas' reading of it
as gauges, and how it reads YOU; what is public (bodies on the books once scouted, archetype,
tier, how it fights); **the dossier** exactly as the Desk shows it; and its last six years, what
it dropped and what it lost. The intel row's rival name opens the sheet now rather than an inline
dossier — the planet keeps its own, being no OA.

## The Board is the Card. *Mocked, ruled, built.*

The Card was rows in a box beside the holds, read as loose data; it is what an OA is FOR. Ruled
from mockups: it stands across the top and each demand is its own object — the ask in large type
with its number in gold, who is asking, a gauge that MOVES, where it stands, and a state chip
(*Met · 3 Short · Not Yet Fought*). The priority carries the board's gold on its spine and frame
instead of a chip mid-sentence. The three that scale — Spending, Casualties, Popularity — move
below as *Also Watched · Settled at the Divide*, being conditions the board weighs rather than
objectives to chase.

**A gauge that fits the demand.** A standing demand gets a bar from −100 to 100 with the
threshold ticked and named. A resource demand fills toward what was asked. Losses fill toward
the most the board will forgive. A placement demand was a row of ordinals with 5th lit, which
never moves all year and says nothing: it shows **where the eight stand** — the odds board itself
while a Divide is fought, the fleet's last finishing order out of one (`history.placement`,
recorded now), with the cut drawn at the place asked for and you on it. Before any Divide has
been fought there is no order, and it says so.

**The rest reads as data.** The audiences keep their gauges and their memory lines. The holds
draw the gap back to last month **in red**, because a store only ever falls. The constellation is
struck: eight marks on spokes said who was warm only by how near they sat and nothing about why
or what they had done. The fleet is a **ledger** of seven — mark, name (a door to its OA sheet),
how they fight, what they think of you as a bar about a centre line, the word, and their last
year. The function and its styles are removed, not left to rot.

**Built from the mockup, in full** — the strip, the dials, the ticks and the deltas were mocked,
agreed and then not built, which is the same fault as the wheel below and was called out in play:
- **The boardroom strip.** Patience is the number a manager lives or dies by (at zero the board
  takes the OA off him) and it was one figure in a row of five, beside two standings the
  audiences already give. It is the page's biggest element now: a bar with the danger drawn on
  it (red to 25, amber to 50), the figure, and what the board is at — *Losing Faith · Content ·
  Behind You* — with the year, the interest and the grant beside it.
- **The three that scale are dials**, needle and hub on a red-to-green arc, not left-to-right
  strips.
- **The audiences carry their scale and their direction:** three columns — who is watching, the
  bar with its band names printed on it (*Mutinous · Strained · Loyal*) and a tick where they
  stood a month ago, and the reading on the right: the word in its own colour over the figure and
  the change. Under each, ONE line of what moved them — *▲ Bram Ilyes Re-Signed · ▼ Grakk Let Go*
  — where a dated ledger of three rows in a bordered card sat before; the three sit in one box
  divided by rules rather than three cards. **The bar is a FILL** on a plain track, coloured by
  the band it is in, in its own class (`.standfill`). Four passes, and each fixed a different
  thing while the bar still looked wrong, which is worth writing down:
  1. the ticks and the delta were added inside the old layout;
  2. the layout was rebuilt to the mock's three columns — around the old bar;
  3. the bar was told to fill, as `.audrow2 .sbar` — but `.sbar` is the PICKER's class: a
     marker on a red-to-green wash, which is right for choosing a point on a scale and wrong
     for a standing, which is a quantity. `.sbar.onesided` carries its own gradient at the
     same specificity and later in the sheet, so the wash won and the row still read as
     before; and `.sbar` is inline, so nested in a grid cell it collapsed to a stub with three
     band names printed on top of each other;
  4. the Board's bar became its own class. Wearing the picker's class meant wearing the
     picker's gradient, and beating it took a specificity argument a stylesheet should never
     have to have.
  5. the colours. **There is no global `.bad` rule in this stylesheet** — only scoped ones
     (`.rostsum b.bad`, `.tgnum.bad`) — so every band word classed `bad` inherited ink and came
     out white; and the fill was coloured red/green when the mock draws one colour. Named for
     this row rather than adding a global rule the page has never had: the bottom band red, the
     one above it amber, the good ones green, a fall in the reading red. **The bar says how
     much; the word beside it says how good.**
  Band names print only where there is room (every threshold keeps its tick) — three crowded
  into a stub had printed "MUTINGBBAINEDVAL" — and the reading drops "of 100".
  6. what was left after all that, from the two screenshots side by side: the section heads
     were dim where the mock's are cyan (the Board's h2s read in the command colour now, only
     the Board's); the bar was still narrow because the name and reading columns took the
     width (118px and 96px now, the bar gets the rest); and the band names still touched. THE
     NAMES ARE TWO: the band below you at the lower boundary of the band you are in, pulled
     left of its tick, and the band above you at the upper boundary, pulled right — two words
     pulling away from each other cannot meet at any width. That is the mock's own scheme
     (*MUTINOUS · LOYAL* around Strained, *WATCHED · APPROVED* around Tolerated), read off it
     at last instead of approximated.
  The lesson for the next mock: compare the STYLESHEETS, not the markup, and read the computed
  values off the rendered element rather than the diff.
- **The holds** have the tick the red loss runs back to, and a foot that says what the four bars
  cannot: *Of 9,000 · Falling 98 a Month · Luxuries Run Short First, in 42 Months*.
- The heading reads *The Card · Year 1*.

**Two faults shipped in the first build of this, both caught in play:**
- **The holds' red segments escaped the page.** `.lost` is absolutely placed inside the bar, and
  `.hbar` was not a positioning context — so four red bands painted down the whole screen, over
  everything. The bar is `position:relative` now. A rule of this kind belongs beside the element
  it positions against, and did not check it.
- **The ledger above was written in this log before it existed.** The wheel was replaced in the
  MOCKUP and not in the page; the entry claimed it was gone. It is gone now. The log is a record
  of what is built, and an entry written from an intention is worse than no entry.

## The replay: a picture, not a wall of text. *Built.*

Watching a Divide was jerky, silent between presses, fixed at the whole planet, and covered in
words. Four faults, four fixes:

- **THE WHOLE TERRAIN WAS REDRAWN SIXTY TIMES A SECOND.** `seenBySquads` APPENDS to `G._seen`
  on every call and `terrainLayer` keys its cache on that array's LENGTH — so calling it from
  the frame loop grew the array, missed the cache, and rebuilt the 900×900 terrain layer every
  frame. That was the stutter and the dead beat before a press did anything, and it survived
  the first pass because that pass fixed the DOM writes and left this in place. Measured over
  forty frames: **40 terrain rebuilds before, 0 after.** The vision is computed once a day now,
  and a squad's walk is built once and kept on the record (0 path builds per 40 frames, where
  every frame rebuilt every squad's arc-length table).
- **A frame painted the page, not the canvas.** Every 16ms tick also rewrote the legend, the
  planet box, the banner table, the event log and the whole record — five `innerHTML` writes per
  frame. `renderGround(false)` paints the canvas alone; `renderGroundPanels` writes the page,
  and only when the day or the state changes. The day walk runs on `requestAnimationFrame`.
- **A fight was a sentence.** Each contact carried a made-up three-letter descriptor — the
  pre-Divide tag, struck by ruling and still being used as a nameplate — and its result in
  words, on a map that already has the OAs' own icons in its key. A fight is now **the two
  marks, crossed, over a struck circle**. The words wait for the pointer: hovering names the
  two OAs and how it came out, and **clicking opens the footage** in the grid.
- **No zoom.** The ground is a picture and was fixed at the whole planet, so a contact was four
  pixels wide. The wheel zooms about the pointer, a drag pans, three buttons sit on the map
  (closer, wider, the whole ground), and the terrain layer is drawn once and scaled — a zoom
  costs nothing. Everything goes through `gproj`, so one transform moves the whole picture.
- **A press was a silent wait.** A day announces itself as a month does at the turn: the number
  and what the day holds — *Day 7 · 3 Contacts · 46% Inside the Wall* — over the map.

**A second pass, from watching it:**
- **The walk began a whole slot late.** `setInterval` does not fire until its first interval has
  passed, so playback opened on three seconds of YESTERDAY's positions before anything moved —
  which read as a jump backwards and then a pause. The first day now begins at once.
- **The walk fills the day.** It was sized to the longest march, so a quiet day was over in a
  second and a half of a three-second slot and the rest was dead air. A day's walk takes the
  day's whole time whatever distance it covers, eased at both ends, with the card ahead of it
  rather than over it.
- **You see who you are fighting.** The fog kept every other OA to a last sighting, which is
  right for ground you are not standing on and wrong for a fight: whoever your people met that
  day now stands on the map for that day, solid, counted and ringed. Watching a whole contest
  without ever seeing another OA was the fog applied to a contact.
  **Built twice.** The first build put the markers in the live-window synthesis — the one path
  a WATCHED day never takes, because every day a manager plays through comes from the record.
  Counted across a contest: nine days, twenty-five contacts, `met` markers **0**. A recorded
  day's own fight events are read into enemy markers now (`withMet`, once per day and kept),
  and the same count reads 1, 2, 3, 4, 1 on the days his people fought. Guarded in `drive.cjs`:
  every day you fought puts the other OA on the map.
- **The first window opens at the drop and waits.** It played straight through to the current
  day, so a manager met his squads two days in with fights already fought and no directive
  given. Later windows still play their days as they are watched.
- **One Drop button.** The bar's and the draft's sat one above the other with nothing a manager
  could do between them; the draft's is the one beside the landings it is about.
**A third pass, traced rather than reasoned** — the flow was run in the harness and the state
printed at every press, which found three things the reading had not:
- **The first Drop press did nothing.** The corner's Drop switched to the Table and then looked
  for the landing's own Drop button, which the Table had not drawn yet — so a manager pressed
  twice. It calls the handler both buttons share. Guarded in `drive.cjs`.
- **The window record is a LIVE array.** The advance derived "how much has been watched" from
  `win.record.length`, but the engine keeps appending to that same array — so the day jumped to
  the newest and played only that one, and pressing Next Comms Window on day 5 landed on day 7
  with day 6 never shown. The day is left where the manager stands and the playback walks
  FORWARD to the end of the record. The first window stands at the landing (guarded: day 1,
  morning).
- **Two reveals looked like omniscience.** Day one shows the whole fleet because the landings
  are posted (`LANDING_KNOWN_DAYS`), and a day later in the contest shows everything under a
  relay mast's banner — both real systems, neither labelled, so they read as the fog
  arbitrarily lifting. A sighting now carries `via` and the map says which: *Posted Landing*,
  *Mast · D5*, *Seen D3*, *Last Seen D9*.
- **Rounds read "undefined".** `DIVIDE.CONST.AMMO_LOAD` does not exist — the constant was
  removed and three readers kept naming it, so the share was NaN. Rounds are carried by the
  PEOPLE (`combat.js LOADOUT_AMMO`, plus a bulk-carrier's hook): a squad's load is what its
  standing bodies hold, and a resupplied squad reads over its own full.

## The draft was thrown away between the screen and the ground. *Found in play; fixed.*

A manager picked five landings touching one another in one corner and his squads came down
scattered — one across the map, three in the far corner. The picks WERE passed to the Divide
(`prepareDivide` hands `dropSlots` and `slotCount`), and the drop then ignored where they are:
it recomputed each squad's position as `(slot / slotCount) × 2π` on a ring of its own. But a
landing is not an index on a ring. `predivide.slots()` lays the numbered landings out on
SEVERAL BANDS at different depths, nudged off each other and snapped to passable ground — which
is what the draft screen draws and what a manager points at. Two different pictures of the same
numbers, and the drafting decision died between them.

The drop reads the slots themselves now. Measured: five landings chosen together around
(0.72, 0.50) put four squads down at (0.75, 0.47), (0.77, 0.48), (0.77, 0.52), (0.75, 0.53) —
inside a tenth of a radius of what was picked, where before they were spread round the rim.
Gated as **G34a** (a full run; the fast gate skips that phase): the worst squad must sit within
0.12 of a radius of its nearest chosen landing.

## Rarity, and what a pair is worth. *Ruled at the meta level, not the grid.*

**A three-tier rarity, made explicit.** There WERE pool weights — an implicit rarity — but they
were ad hoc: Olmac drew as often as Etu, and nothing said what any of the numbers meant. RULED,
in `races.json`: **abundant** (humans, who fill the fleet), **settled** (Gil, Ththyn, Attorak,
Etu, Kellis — the five with a place in it) and **scarce** (Mon-Wa, Olmac, Svalbard — seldom
seen). The tier sets a base weight (30 / 10 / 4); `pool_lean` keeps each people's own character
within it (where they sell their service, where they end up), and `pool_weights` is derived from
the two. Measured over 1,200 seats: humans 31%, the five settled 9.5–12% each, the three scarce
4.1–4.8%. Fielding eight Mon-Wa is now a thing a manager would have to go looking for.

**A pair is paid a premium, not a double.** `salary_mult` 1.10 → **1.75**, which lands a pair at
about **1.4× a human's wage** (measured: ₡503 against ₡359) — more than one life because it puts
two guns in the line, nowhere near the doubling it used to be by accident.

**Rations are read off the body, not off the balance sheet.** There already WAS a table that
varied by physiology — Etu 0.75 cold-blooded, Ththyn 0.95 hollow-boned, Olmac 1.15, Svalbard 1.20
— and the 1.6 first written for a Mon-Wa pair was out of scale with all of it, set beside the
wage rather than beside the other bodies. A pair is TWO people about three feet tall: a little
more than one adult, not two. **1.20**, level with Svalbard and just above Olmac, and every race
now carries a note saying what its ration is for (size, frame, metabolism, against a human at
1.00).

**The Bastille draws from everyone alike.** `pool_lean.prisoner` was per-race, so some peoples
turned up among the condemned more often than their numbers — and with no narrative in the game
to carry it, the only thing that can say is that some peoples are more prone to crime. It is 1.0
for every people now: who is in the Kier's cells reflects who is alive, and nothing else
(measured: the prisoner pool matches the living distribution to within a point). The mercenary
pool keeps its character, because that is a profession and not a blood. If the prison industry is
ever written as what it is — something that hunts the people it can reach — the lean belongs to
the KIER and its recruiters, and the note in `races.json` says so.
The grid is left alone; the balancing is done where a manager feels it, in what they cost and how
hard they are to find.

**Re-measured after both** (200 → 120 engagements, same kit): Mon-Wa still win about 64% of even
eight-on-eight fights and still die at almost the same rate as the humans they beat. The counter
is now the price of assembling them at all.

## What a backer leaves behind. *Ruled from play; built.*

A manager read the sponsor board and found **2 Medical Kits (₡280)** against **₡40,000**. No
count of kit can stand beside a cash reward, because credits buy the kit — 285 of them — and
pricing the crate up only hides that. RULED: stop paying in things a manager could simply buy.
A kept contract now leaves a **standing**: a permanent change to how the OA works, held for the
rest of its life and deepened a step each time the same backer is satisfied again, to a ceiling.

| Backer | What it leaves |
|---|---|
| Thorne | wounds mend a quarter faster, for good |
| Helion / Ferrous | energy / ballistic weapons cost a fifth less at the yard |
| Castellan | armour costs a fifth less |
| Greywater | the drop eats a sixth less |
| Meridian | a standing ₡2,600 **a month**, not a lump |
| Arrowline | a survey reads a step deeper |
| Almsdesk | the unproven learn a quarter faster |

Every one is honoured where it belongs rather than as a number on a sheet: the infirmary mends
faster (`season.js`, the rest grid's wound blocks), the yard's prices fall by FAMILY (the
discount is handed into `items.planForce` as `opts.discount(family)` — that module knows what a
thing costs and nothing about who is backing whom), the drop's rations stretch, the stipend
posts every month beside the gate, and the Board lists what the OA has been given beside its
holds. Cash remains a reward type for any future contract that wants it.

**The gap that hid it.** `judge()` granted the standings correctly from the first build and the
season's record never carried them, so nothing downstream could see that a reward had been paid
— the recap, the Board, and the suite's own gate all read zero. Measured after the report was
wired: six seasons of a fleet, **13 kept contracts, 13 standings**; after ten years the eight
are visibly different creatures — Vantis three steps into a victualler's order, the Verdant
Cradle three into a ballistic account.

## THE MACRO AUDIT · first report. *Measured, against the genre it imitates.*

The Divide is meant to read as a battle royale at the scale of a planet, with the grid fights as
its close quarters. `audit_macro.cjs` measures whether the GEOMETRY can carry that. Two contests,
26 squads, 130 bodies:

| | Opes Arx | Fortnite | Apex | PUBG |
|---|---|---|---|---|
| field across | 0.580 units (**11 days' march**) | ~5.5 km | ~3 km | ~8 km |
| squads | 26 | ~25 | 20 | ~25 |
| **even spacing between squads** | 0.114 = **20% of the width** | ~1.1 km = 20% | ~0.67 km = 22% | ~1.8 km = 23% |
| **contact range** | 0.068 = **11.7% of the width** | ~200 m = **4%** | ~175 m = **6%** | ~250 m = **3%** |
| spacing : contact | **1.7 : 1** | 5 : 1 | 4 : 1 | 7 : 1 |

**THE MAP IS NOT TOO SMALL. THE REACH IS TOO LONG.** The density is right — 26 squads on this
ground sit as far apart, relative to the field, as a Fortnite lobby does. What is wrong is that a
squad *meets* anybody within an eighth of the map's width. Measured consequence: the **median
nearest foreign squad is 0.065 and contact range is 0.068** — the typical squad is already inside
contact range of somebody, every day of the contest, and **53% of squad-days** are. There is no
room in which to be undiscovered, which is why stealth, scouting and the cold half of the stance
ladder could never bite: they are asked to operate in a gap that does not exist. Sight (0.090)
and noticing (0.105) are longer still, so a squad sees nearly a fifth of the planet from where it
stands.

**AND THE ARC RUNS BACKWARDS.** Contacts per day across a contest: 3, 2, 2.5, **7, 5, 7, 7**, 4,
5.5, 3, 5, 5, 2, 3, 1.5, 3, 4, 1, **0.5, 1.5, 0, 0.5, 0.5, 1.5**. It peaks on days 4–9 and dies to
near nothing by day 19. A battle royale does the opposite: a scattered, lethal opening, a middle
where most squads are alive and hunting, and a **rising** end as the ring forces everyone onto the
same ground. Here the wall closes on a field that has already stopped fighting, because the squads
are spent or dead before it matters. The closing wall — the genre's whole engine of tension — is
arriving after the contest is decided.

### Done: the reach is cut, and the wall bites

**Contact 0.068 → 0.020** (11.7% → **3.4% of the width**), sight 0.105 → 0.048 and watching
0.090 → 0.042 — a little over twice contact, which is the shape the genre uses: you see further
than you can reach. **The wall closes sooner and harder**: steps on days 1·5·9·13·17·21 instead
of 1·7·13·19·24·28, down to 0.085 of the radius instead of 0.115, and the last ground arrives on
day 24 instead of 30. Measured after:

| | before | after |
|---|---|---|
| median nearest enemy | 0.065 (inside contact) | **0.037** (nearly twice contact) |
| squad-days inside contact range | 53% | **16%** |
| squad-days within a day's march | 39% | 67% |

**There is now ground to be undiscovered in**, which is what stealth, scouting and a cautious
stance need in order to exist. Gates held throughout: regress 114/114, `measure_fight`,
`audit_table`, `audit_bastille`, the drive and the audits.

### And the audit's second finding: THE TABLE SETTLES THE CONTEST BEFORE THE WALL DOES

The arc still dies in the last third, and the cause is not the wall. Counted over a contest:
squads standing fall 28 → 25 → 19 → 11 → **6 by day 17**, and those six sit on a final ring of
radius 0.025 with a contact range of 0.020 — they cannot avoid each other. They do not fight
because by then most of what survives is **under the same banner**: the negotiation layer has
merged the field into one or two sides while the wall was still closing. A battle royale's last
third is loud because everyone left is an enemy; here everyone left is an ally.

Measured: **five joins a contest, median on day 10**, and eight sides become **5.7** by the end.
Against that, the contest already kills 78 and captures 26 per Divide — so the survival valve the
join was built to provide is already carried, eight times over, by the captive-and-ransom layer.
Joining delivers the narrative of submission with the mechanical downside of staying in the
fight, and costs the endgame to do it.

RULED: **a beaten OA concedes the ground and takes its people off the planet** rather than joining
a banner. The negotiation layer keeps its whole shape — the valuation, the crowd wall, spite,
goodwill, living regard, the memory between OAs — and only what is bought changes: the principal
is no longer buying guns, it is buying an enemy off the board. The field shrinks without the
sides merging, which is exactly the shape the last third is missing, and it needs no cap, gate or
disincentive: an OA that withdraws is simply gone. **Pacts are kept** — a time-limited truce
between two OAs still on the field is the one alliance-flavoured mechanic that does not collapse
the side count.

The join is not a feature with a switch: it is a state on the corp (`joinedTo`) that some 600
lines read across the engine, the page and the gates, written in five places. **`docs/WITHDRAWAL_MIGRATION.md`**
holds the inventory and the staged plan — eight stages, each ending with every gate green and the
game playable, beginning with an instrument so that the last stage can prove the thing was worth
doing.

**Stage 0 is done, and the baseline is worse than the estimate.** `audit_macro.cjs` now counts
SIDES rather than corps — a corp that has joined another is not a side, it is squads under
somebody else's flag — read at each comms window off the live corps, since the recording does
not carry `joinedTo`. (Two things had to be fixed to get a reading: the generator only yields
for a MANAGER, so a contest with no human ran straight through with no windows; and the earlier
"5.7" was counting corps.) Recorded in `docs/macro_baseline.json`: eight sides on day 2, **four
by day 8, two by day 11** — the MIDDLE of the contest — and two for the whole second half, while
all eight OAs are still alive. **From day 13 on the field averages 2.00 sides.** The last third
is not a battle royale; it is two alliances holding ground. The Stage 7 pass condition is that
this curve rises and tracks the number of OAs actually still on the field.

**Stages 1 and 2 are done.** Stage 1 put the vocabulary in (`corp.withdrawn`,
`NEG.considerWithdraw`) and proved it inert: the sides curve came back bit-for-bit identical to
the baseline. Stage 2 made `strike` take the beaten OA's people OFF the planet — its squads empty
by the road a folded squad already takes, and `principalOf` returns a withdrawn OA to itself.
**The merge is gone**: sides now track the OAs actually alive, exactly, at every window (day 8:
4.00 → 5.50; day 11: 2.00 → 3.00, with 3.0 OAs alive). **And stage 2's gate fails**, which is the
finding: the field no longer merges, it EVAPORATES — five withdrawals a contest on days 4, 4, 6,
8, 8, 10, 12, 12, 16, 24, one and a half OAs standing from day 17, none from day 24. The price
was calibrated for a deal that kept the loser fighting under somebody else's flag; the same money
now buys a way home, which is strictly better, so everybody takes it at the first sign of
trouble. **A valuation problem, not a structural one** — carried forward to stage 4, where the
table's price and `appetite` are re-measured against this curve. Patching it inside stage 2 would
have hidden whether the structure works, and it does.

**Stage 3 is done.** A withdrawing OA's people come home alive — 9, 6 and 12 bodies on a measured
contest, in neither `dead` nor `captured` — and nothing had to be built for it, because stage 2
used the road a folded squad already takes. And **a concession is paid, not wagered**: the credits
agreed are a debt for the ground and are paid before any share of winnings, with a shortfall
recorded as `owed`. Before that change, two of three withdrawing OAs were paid NOTHING because
their buyer did not go on to win. **After it, those two are still paid nothing** — their terms
contained no credits at all, because `composeTerms` writes sites, resources and a share, which
suited a vassal sharing its principal's fortune and means a conceding OA hands over its ground
for a claim it will never see. So withdrawal is not only too cheap: **it is frequently free**.
Carried to stage 4 with the price: a concession must be cash-shaped, paid now for ground taken
now.

**Stage 4 has priced it, and the shape is there.** Two changes, both principled: a concession is
**cash-shaped** (credits in full — the thrifty may not refuse to pay for ground they are taking),
and **what is given up is the rest of the contest** — conceding on day 4 hands over twenty more
days of chances where day 20 hands over four, so `CONCESSION_EARLY` makes it cost the buyer three
times as much at the drop as at the end. The floor had carried no sense of time at all, because a
join gave up nothing but a name.

| sides at day | baseline (join) | stage 2 | stage 4 |
|---|---|---|---|
| 4 | 7.00 | 7.00 | **8.00** |
| 8 | 4.00 | 5.50 | **7.00** |
| 11 | 2.00 | 3.00 | **6.00** |
| 17 | 2.00 | 1.50 | **4.00** |

Concessions now fall on days 6, 8, 12, 13, 14 — 2.5 a contest instead of 5, none before day 6 —
and contacts are back to 34.0 from 24.5. The field falls away gradually instead of merging into
two flags by day 11 or evaporating by day 17. Open for stage 7: the last third is still thin
(1.44 sides from day 13), and a buyer that cannot cover the price has an `owed` line recorded
against it but no money moves — a concession it cannot afford should be a debt, not a free one.

**Stage 5 is done: the pages no longer describe a thing the game does not do.** *Join Their
Banner* is **Concede and Go**; *Take Them Under Yours* is **Buy Them Off the Ground**; *You Fight
Under <OA>* is **You Have Conceded to <OA>**; the Desk's day strip reads **Conceded To**; and the
Ground's board is **Still on the Ground** with an **OA** column rather than a Banner one. The
gate is kept as **`harness/scan_withdrawal.cjs`** — it opens the game, plays to the lock, drops,
runs five comms windows and reads every live surface at three points for any word that still
speaks of banners or fighting under one. Clean at all three.

**Stage 6 struck the dead wood.** `joinedTo` is gone from the corp's state, the engine's
twenty-four readers, the settlement and the page's thirty-two; what replaced it is the question
the game now asks — *has this OA conceded and gone* — rather than *whose flag is it under*.
`principalOf` and the settlement's `rootOf` are the identity (nobody stands under anybody, and
both are kept as functions because two hundred lines call them and a later ruling may bring a
chain back), and the page has one accessor, `concededTo(c)`. The gate for a pure deletion is that
it changes nothing: the sides curve is **identical to stage 4 at every window**, and every other
gate is green. The three remaining `joinedTo` hits are `_joinedToday` — a squad walking into a
fight already in progress, unrelated to banners.

**Stage 7: the migration is done, and it bought what it cost.** The pass condition needed
correcting first — contacts per DAY falls through any contest, since there are 26 squads at the
drop and a handful at the end, so by that measure no battle royale ever written would pass. What
a last third feels like is **contacts per squad still standing**:

| | first third | middle | **last third** |
|---|---|---|---|
| now | 0.120 | 0.171 | **0.202** — hotter than the drop |
| with the concession price removed | 0.084 | 0.141 | 0.139 — flat, and sagging |

The contest gets hotter as it goes: not because more fights happen (34.0 a contest, much as
before) but because the field thins while the survivors keep finding each other. And the
intensity is bought specifically by making an early concession dear — take that price away and
the same game flattens.

| sides standing | day 4 | day 8 | day 11 | day 17 |
|---|---|---|---|---|
| joining (stage 0) | 7.00 | 4.00 | **2.00** | 2.00 |
| withdrawal (now) | **8.00** | **7.00** | **6.00** | **4.00** |

Eight OAs no longer become two flags by the middle of the contest. Every side on the ground is an
enemy, from the drop to the last day. **Left recorded rather than carried:** the last third is
still thin in absolute terms (four OAs from day 15), and a buyer that cannot afford a concession
still gets one — the shortfall is an `owed` line and no money moves, because the settlement does
not reach the accounts. Both want a pass of their own.

**The buyer was paying for guns it never gets.** `oddsWithJoin` merged the seller's squads INTO
the buyer's umbrella and read the buyer's odds off the result — right when a beaten OA ceded its
claim and fought on behind the flag, wrong the moment it started taking its people off the
planet. The buyer acquires nothing: the seller's strength LEAVES the board and everyone's odds
rise. It now reads the board with the seller removed, so what the buyer is really buying is the
difference between winning against seven and against six. The shape is unmoved (0.120 → 0.171 →
0.202 by thirds, sides 8 · 8 · 7.5 · 7 · 6 at the windows) and the median price paid is ₡90,846.

**NEXT, RULED: a withdrawal is a public offer nobody is bound by.** One offer to the whole field
— *I stand down now; whoever wins pays me X* — each OA answers yes or no, and the winner decides
at the settlement which promises it keeps. It fixes what a vote could not: a majority cannot bind
the OA that would pay, and no intransigent OA holds a veto, because every OA answers only for
itself. The cost is honoured through machinery that already exists — `REP.act` (`betrayed`,
`broke_truce`), living regard, and `priceModifier`, the in-career memory that prices every future
deal between a pair — so a broken promise is a debt against every negotiation that OA will ever
have. Two additions ruled with it: **the reputational cost scales with the size of the promise**
(otherwise a yes is free insurance and everybody says it), and **the settlement itemises each
promise kept or broken, by name**. Known and accepted: an OA with nothing left to play for will
always renege, which is texture rather than a fault. Three placements mocked
(`withdrawal_mock.html`): a band across the top of Negotiation, a tab of its own, or one more
column on the fleet rows already there.

**A crate was a unit that meant nothing at either end, and is gone.** §UNITS Asked what unit a withdrawal should bargain in, the answer was
that the game had two and converted between them nowhere: the Divide banks `{ category: CRATES }`,
an integer count of what the squads carried off the ground, and `fillHolds` read it as though it
were already **a share of a full store** — ceiling 1.0, drain 0.12 a year. So ONE crate filled a
store that takes eight years to empty, and every crate after the first was thrown away against
the ceiling. A contest banks about four crates of foods across the whole fleet, so this was not a
rounding error, it was the entire resource economy. RULED, and the crate struck rather than
converted: **a site yields a share of a hold directly**, so there is no invented middle unit
between the ground and the store. The scale comes from the ruling that a planet **rich** in a
resource can fill a hold from empty, a **moderate** one about 40%, a **slim** one about 20% —
which is `richness`, already derived in `map.js` from the composition, spread across the sites
that carry the category and weighted by how deep each is (`divide.js yieldOf`, `HOLD_RICH`).
Measured across three contests: a rich planet (1.09) gave the whole field **0.61 of a minerals
hold**; a poorer one (0.78) gave 0.24. Holds sit at 0.42–0.52 after a season, `measure_economy`
unmoved, all gates green.

**And the hold categories are FOUR** — minerals, fuels, luxuries, foods. Everything the ground
carries rolls up into them: potable water and nectar sap are *foods*, gemstone rough is
*luxuries*, rare earth and copper ore and ferrite are *minerals*. A withdrawal therefore
bargains in credits and those four, and the mock that offered eight terms — gemstone, rare
earth, water as their own — was offering deposits that are not stores. Checked against
`REP.CATEGORIES` rather than assumed.

**ONE CLOCK FOR EVERYBODY.** Asked how a withdrawal offer should travel, the answer turned on
how the existing negotiation travels — and it had three different answers. **AI to AI:** composed,
priced and settled in the same breath. **AI to the manager:** posted, and answered at the next
window. **Manager to AI:** answered instantly. So the AI field could restructure itself entirely
between two of a manager's windows while he paid a window's latency for every move. That
asymmetry was never designed; it fell out of having to wait for a human.

RULED: **an offer travels.** It is posted in one window and answered at the next, whoever is on
either end — `stats.pending` carries it, and the post is delivered at the top of the table pass,
in the order sent, before any new offer goes out. The withdrawal rides the same clock: post the
offer in one window, read every reply at the next and decide in that same window. One offer per
window, so asking costs a window rather than being free.

Measured: 4.5 offers in flight a contest, withdrawals on days 6, 9, 12, 19, 24 — later and more
spread than before, because a deal now takes a window to land. Contests run longer for the same
reason (the field is down to 4 OAs by day 17, 2 by day 19, and runs past day 24 where it used to
end there). Gates green: regress 114/114, `measure_fight`, `audit_table`'s nine rulings, the
drive, `audit_ui`, `audit_code`.

**The instrument is fixed, and it changes the verdict.** `audit_macro` cut its thirds off the
longest day ANY run reached, so a contest ending on day 22 beside one running to 36 reported an
empty last third — and it counted the recording's padding after the contest was decided as
quiet days. Each contest is now banded in ITS OWN length, ending on the last day anybody was
standing. Stage 7's **0.202** was measured with the broken banding and should not be trusted.

**Measured properly, and the one clock costs the arc:**

| | first third | middle | last third |
|---|---|---|---|
| deals settled instantly (the old clock) | 0.066 | 0.249 | **0.184** — hotter than the drop |
| deals take a window (the new clock) | 0.100 | 0.166 | **0.052** — it sags |

**The cause was not the clock, and reverting would have hidden it.** The contest DOES end when
one banner stands — so the long quiet tail was not a missing end condition. It was arithmetic:
with contact cut to 0.020 (§MACRO), the last ring at 0.085 R is **0.0247 across, and two squads
dropped at random in that disc sit on average 0.0223 apart — WIDER than contact**. The last two
survivors could dodge each other indefinitely, and did: two OAs standing by day 19 and the
contest still running at day 36. The reach was cut and the last ground was never cut to match.

**The last ground now forces the meeting.** `ZONE_STEPS` ends at **0.050 R** (0.0145 across),
comfortably inside contact, so the ground itself ends the contest. Measured, on the corrected
instrument and the one-window clock:

| | first third | middle | last third |
|---|---|---|---|
| before | 0.100 | 0.166 | 0.052 — sagging |
| **now** | 0.100 | 0.160 | **0.173** — hotter than the drop |

The field falls away cleanly — 6 OAs at day 13, 4 at 17, 2 at 19, one at 21 — and contacts are up
to 36.0 a contest. Gates green: regress 114/114, `measure_fight`, `audit_table`, the drive,
`audit_ui`, `audit_code`, `audit_docs`.

**The withdrawal runs end to end, with two faults left open.** `probe_withdraw.cjs` drives the
whole loop: a manager posts one public offer, the field answers at the next window, he stands
down on the replies he has, and the winner answers for its word at the settlement. Measured over
four contests: **4 offers logged, 24 replies, 4 withdrawals, 24 promises carried.**

Three faults were found and fixed getting there. The reply block was reached but the ANSWER
arrived empty, because the probe was passing an object the generator never received — and behind
that, **`sealed` was gating the offer**: an OA that refuses to negotiate refuses to bargain for
advantage, and conceding the ground to take its people home is not that kind of bargain. A
manager of such an OA had no way off the planet at all. `sealed` no longer gates a concession.
The third was `corpIds` out of scope at the withdrawal, which threw.

**Both are fixed, and the first was not what it looked like.** The contest did not stop because
the manager left — **`bannersStanding` counted any corp with a living body**, and a withdrawn
OA's people are all alive, at home, off the planet. So an OA that conceded went on counting as a
banner in the contest it had left: the field could never reach one banner, every contest a
manager withdrew from ran to overtime and ended with NO WINNER, and every promise made to him
was therefore moot. Standing now means standing ON THE GROUND. Measured after: a winner exists,
and promises are kept and paid (₡488,776 across two contests).

**And the ask is weighed against the whole take.** Every OA said yes to everything because the
reply compared the odds a leaver's exit buys against the ask times the odds alone. An OA that
says yes expects to win `mine + gain` of the pot and hand back `asked` of it; one that says no
expects `mine` and owes nothing — so it agrees when `(mine + gain)(1 − asked)` beats `mine`.
Measured across a spread of asks: **6 of 6 say yes at 5%, 6 at 25%, 4 at 50%, and none at 80%.**
A long shot still promises freely, because it will probably never owe anything — which is
exactly why a manager must read WHO said yes and not merely how many.

**The arc is unharmed, and better:** 0.056 → 0.181 → **0.375**, with 36.0 contacts a contest.
Gates green: regress 114/114, `measure_fight`, `audit_table`, the drive, `audit_ui`, `audit_code`.

**THE WITHDRAWAL TAB IS BUILT.** Its own surface on Negotiation, because it is not a trade: the
ask is credits across the top (one pot) with the four hold categories beneath it (four stores),
every term present at 0% and dragged to what you want — no dropdown, no add step. Under it, one
row per OA still on the ground: **how they stand** (*21 of 22 Standing*, coloured by how much of
the roster is left — no odds, because whether you can still win is a judgement a manager makes),
**their word** as a five-section scale from *Not to Be Trusted* to *Good for It* read out of
`persist.wordRecord`, and **the answer** carrying the row. Send the offer in one window; the
field answers at the next and the button becomes *Withdraw on These Replies*.

Gated as **`harness/drive_withdraw.cjs`**, which works the tab as a manager does — open it, drag
a term, send, advance a window, read the replies — and fails if the field never answers or the
withdrawal cannot be taken. Measured in a live game: five terms, seven OA rows, credits dragged
to 20%, the offer on the answer, and *Yes · Yes · Yes · Waiting · Yes · Waiting · Yes* back the
following window.

**And the word given is shown at the recap**, which is where a year's story is told. Every
promise made to an OA that stood down, by name: who promised what to whom, and whether the OA
that took the ground **Kept** it (with the sum) or **Broke** it. A promise from an OA that did
not win is moot — it owed nothing and answers for nothing — and those are gathered into one
quiet line rather than listed. The point of a word that binds nobody is that everybody sees what
it was worth, so it belongs on the page a manager reads at the close and not in a log.

**The withdrawal is now complete end to end:** the offer, the field's replies, the manager's
decision, the concession, the settlement's payment, the winner's choice of which promises to
keep, the record that choice writes, and the trust scale on the tab that reads that record back.
All gates green, including `drive_withdraw` and `scan_withdrawal`.

**A concession a buyer cannot afford is a DEBT, not a gift.** *Closed.* When a buyer's take
could not cover the price of the ground it took, the shortfall was written as an `owed` line and
no money moved — so an OA with nothing in the pot could buy an enemy off the board for free,
which was the one way to get a concession without paying. The debt now rides home with the
payout (`perCorp.owed`, `owedTo`) and the season charges it: *Ground Bought on Credit* against
the buyer's treasury, *Ground Conceded, Paid Late* to the OA that stood down. Proven at the
boundary — a broke buyer owes the full ₡90,000, a buyer with a pot owes nothing — and measured
across three contests it never arose, because the concession price and cash-first payment
usually leave the take able to cover it. The hole is closed rather than papered over; it is
simply a rare case. `measure_economy` unmoved, all gates green.

**Patience buys sight now, and enough of it to act on.** The earlier suspicion was the gap
between `MAP_STALE` (8) and `KNOWN_STALE` (3). Measured first, and it was aimed at the wrong
reader: the PLANNER already reads a three-day window, and `MAP_STALE` only governs what the
manager's map displays. The question the per-squad stance depends on was never "is the picture
fresh" but **"does a squad that holds still see more than one that marches"** — and that had
never been measured.

It does, and far too faintly. Bucketing every squad-day by how far that squad walked: a squad
holding still earned **5× the sight** of a hard-marching one — and still only one sighting every
67 squad-days. The cause was the falloff. The median nearest enemy stands at 0.037 and watching
reached 0.042, so the typical neighbour sat at 88% of range, where a straight-line falloff gave
about a 7% chance of seeing it. Nearly everybody stood at the edge of sight, and the edge was
nearly blind.

Sight is now **strong through most of its reach and falls away only at the rim** (a cubic edge),
and the reach is **three times contact** (0.060) — the battle-royale shape, where you see further
than you can reach and a patient squad can see its nearest neighbour.

| | before | after |
|---|---|---|
| held still | 0.015 a squad-day | **0.126** |
| walked a little | 0.008 | 0.050 |
| walked most of a day | 0.009 | 0.012 |
| marched hard | 0.003 | 0.029 |

A squad that holds still now sees someone about **every eight days** rather than every sixty-seven,
and still earns **4.4×** what a hard-marching one does. Gated as **`probe_watch.cjs`**, which
fails if patience stops buying clearly more sight — because the per-squad stance rests on it. The
arc held and sharpened (0.065 → 0.239 → **0.440**, 40.5 contacts a contest), and every other gate
is green.

**The per-squad stance is built, and measured it still does not decide outcomes.** Every read
the stance made now reads the SQUAD'S own notch (`squadStance`, `squadDials`): pace, how near the
wall it works, whether it takes a site off somebody, whether it goes looking, whether a meeting
becomes a fight, how hard it tries to break off, and whether it piles in. A manager sets one
notch per squad (`answer.squadStance`); an AI OA spreads its squads around its declared stance,
its strongest a step bolder and its weakest a step more careful, so the field is not eight blocks
in lockstep. And a careful squad that SEES an enemy first now slips away before the meeting — the
planner used to turn only from a fight it could hear, never from a squad it could see, so seeing
first had bought nothing.

**Measured across six contests per end, holding every squad of one OA to the notch:**

| | fights | saw others | sites | dead |
|---|---|---|---|---|
| Avoid | 18.2 | **69.0** | 1.5 | 14.3 |
| All In | 17.3 | 57.8 | 1.8 | 12.7 |

The sight trade is real — a careful squad sees about a fifth more. **Fights and deaths do not
follow**, and the ends are inside each other's noise. (Two-contest runs had suggested otherwise
in both directions; any change reshuffles a contest's whole trajectory, so small samples here
read noise as signal, and only the six-contest ends are trusted.)

**Why, and it is structural.** The macro layer was deliberately built to FORCE contact: the wall
closes hard and the last ground is now smaller than contact range so that the final survivors
cannot avoid each other. That works — and it means the fights that decide a contest happen on
ground where no stance can decline them. A squad's stance can shape its first half; the second
half is the wall's. The same geometry that fixed the arc swamps the stance.

**Open, and a designer's call**, with three honest directions: (1) give the stance its teeth in
the GRID FIGHT, where it can matter — an Avoid squad disengages sooner and takes fewer losses
when it is caught, a Break squad presses and takes more; (2) measure the stance only over the
contest's first half, where the wall has not yet taken the choice away, and accept that the
endgame belongs to the ground; (3) give the cautious notches a way off the last ground that a
hunter cannot overrule. The plumbing for all three is in place.

**CORRECTION: the stance was not inert, it was INVERTED — and the inversion was a bug.** The
entry above reported Avoid and All In "inside each other's noise". The designer read the same
table and saw what it said: Avoid was in MORE fights (18.2 against 17.3) and lost MORE people
(14.3 against 12.7). Both columns pointed the same wrong way, and calling that noise was wrong.
Broken down per OA it was not noise at all:

| before | went looking | was found | killed fighting |
|---|---|---|---|
| Avoid | 6.6 | **11.2** | 14.0 |
| All In | 13.0 | **0.0** | 13.0 |

**The initiative went to whoever was bolder, not whoever saw first.** At a meeting the seeker was
simply the squad with the higher `seek` — so a careful squad that had SEEN the hunter coming was
still treated as the one caught unawares, and its only way out was an escape roll the hunter
could beat. Caution paid for itself in pace and bought nothing back; an All In squad was never
once the one found. Now **a squad with a fresh sighting of the other has the initiative**, and
boldness decides only when both saw or neither did. And a careful squad that saw them coming is
**simply not there**: it was not surprised, it does not want the fight, it had time to go. That
is the payoff the whole trade was built for — patience buys sight, and sight buys the choice.

**A second fault was found on the way, and it was the one-clock pass's.** The table's T9 broke —
asks were no longer being answered — and the cause was a path the clock pass had missed: an OA's
OFFER had been put on the post, but a principal's INVITATION still settled on the spot. So an
invite always beat an offer that had to travel, and **ten of every eleven offers arrived a window
later to find the OA had already taken somebody else's terms**. Invitations travel now too;
T9 is back (7 taken, 5 refused) and all nine rulings hold.

**Measured with both fixed, five contests per end:**

| | fights | dead | went looking | was found | saw others |
|---|---|---|---|---|---|
| Avoid | **13.6** | **12.0** | 3.8 | 6.6 | **152.2** |
| All In | **17.2** | **15.4** | 13.2 | 0.0 | 109.6 |

The ladder runs the right way: a careful squad fights a fifth less, loses a fifth fewer, and sees
two-fifths more; an aggressive one finds the fights and pays for them. The arc still rises (0.042
→ 0.157 → **0.365**), with fewer contacts a contest (27.0) because careful squads now slip away.
All gates green: regress 114/114, `measure_fight`, `audit_table`, `probe_watch`, the drive,
`drive_withdraw`, `audit_ui`, `audit_code`.

**A round from play, all in and gated.** "29 of 29 Standing" counted the whole season roster
rather than the drop on the ground — the cap applies; the count was wrong. The withdrawal sliders
moved one step and stopped because every tick redrew the page and threw the slider away under
the finger; a drag now updates its own tile in place, and `drive_withdraw` drags twenty steps and
fails if the slider does not survive every one. The withdrawal is always open in its own panel
under the word *Withdraw*, the store tiles say what the WHOLE PLANET holds to be won rather than
what has been dug, and a tile for a store this planet does not carry is shut. Every win chance a
manager was handed is gone — Negotiation's head, the Desk's strip, the picker's hub. One advance
button, the good one, on every page and sized to its words. The picker ring is centred, and each
OA's DISC sits on the ring rather than the centre of its disc-and-label box, so every mark is the
same distance from the hub.

**And an OA's word is its character.** The settlement read a `dials.honesty` that **does not
exist**, so every OA kept its word at the same coin-flip rate. It reads `treachery` now — Knights'
Star at 10, Vantis Deepcore at 90 — and the withdrawal tab shows that as each OA's reputation
before a single promise has been tested, moved by what the fleet then sees it do.

## THE SITES AUDIT · what the ground actually pays, and to whom. *Traced; a ruling needed.*

Traced from the planet to the treasury, because the "Nothing Dug Yet" tile showed that neither
the designer nor the code agreed on where a Divide's resources come from. **Two models of the
planet are running at once:**

| | what it is | who gets it | when |
|---|---|---|---|
| **The pot** | credits, rolled from the planet's archetype and richness | the **winner**, all of it | at the settlement |
| **A dug resource site** | a haul | **whoever dug it**, win or lose — as **credits** (sold at ₡22,000 a unit) **and** as **resources** into its holds | at the settlement / the close |
| **An undug site** | the same haul | the **winner** — as credits only; its resources go to **nobody** | at the settlement |
| munitions, rations, caches, masts | field supplies — rounds, food for the squad, intel | the squad standing on it | at once |

**What is wrong with that:**

1. **A dug site pays twice.** The comment on the settlement says the haul goes to the digger's
   STORES and only the SURPLUS is sold on to the fleet. The code does both in full: every unit is
   stored AND sold. Nothing is "the surplus".
2. **The pot has nothing to do with the ground.** The largest number in a Divide is rolled, not
   earned; digging, holding and claiming sites never move it.
3. **The winner's resources are only what it dug itself.** An undug site hands the winner its
   credit value and throws its resources away. So when a withdrawal asks the winner for "60% of the
   foods", it is asking for 60% of the foods THAT OA personally carried off the ground — which is
   neither "the planet" nor, usually, much.

**A ruling is needed on what the planet IS to the OAs on it.** The coherent shape, offered for the
designer's call rather than built: the ground is the prize, whole. What is dug is dug for your OWN
stores and is yours whatever happens — that is what digging buys. What the winner takes is
**everything left on the planet**: the pot, and every undug site's resources into its holds. A
withdrawal then bargains for a share of *that* — the credits and the stores that come with the
ground — which is what the designer described. Selling surplus to the fleet becomes a separate,
explicit step (an OA whose store is already full sells what it cannot hold) rather than a second
payment for the same crate.

## THE PRIZE AND THE GRAB, and sites worth fighting over. *Two built; one open.*

**RULED: two figures, not one.** A Divide is fought for a planet's mineral rights on a small circle
of it — so the sites are the quick, guaranteed grab, and the planet is the prize, and neither moves
the other. **What you dig is yours**, for your own stores, win or lose. **What the winner takes is
the planet**: the rolled credits AND the planet's endowment in every store it carries, into its
holds — a rich planet fills a hold from empty, a moderate one about 40%, a slim one 20% (`richness`).
The sites now carry a quarter of that between them (`SITE_SHARE`) rather than all of it, which had
made "a rich planet fills a hold" a statement about digging. Measured: the winner takes **about a
full hold** of each store the planet carries; everyone else together digs **0.05–0.10** of one.
A withdrawal's store terms are now paid out of **the winner's share of the planet**, which is what
the tile on the tab always said was being asked for.

**And a haul is no longer paid twice.** Every dug unit was stored in the digger's holds AND sold to
the fleet in full at ₡22,000, and the winner was paid the credit value of every undug site on top
of the pot. The haul goes to the stores; only what spills over a full hold is sold
(`SURPLUS_VALUE`, at the season's close, where the holds are). About ₡195,000 of surplus sold across
the fleet in a season; holds average 0.28 after three years.

**The sites, as they now stand:** caches escalate by wave as intended (tier 2 → 5, about four opened
a contest, each upgrading kit); the relay mast is the vision site; munitions drops resupply.

**A STRONGPOINT — built, and fought over.** Ground worth fighting FROM: held rather than emptied, and
a squad standing on one it holds fights from better ground (`STRONGPOINT_PREP` on preparedness, the
same road ground advantage already takes into the grid fight). Placed **only in the first two
waves**, on the outer ground, so the closing wall retires it — a middle-game prize to hold while you
can and then leave. Measured: 1.7 placed a contest and **taken 6.7 times** — it changes hands.

**THE REST SITE — traced, and it works.** *(Superseding the "not reached" entry below.)* Traced one
wounded squad day by day instead of adjusting another weight, and it was three things, none of
them the ones guessed:

1. **The rest sites were not there yet.** Sites are revealed in waves, and nearly every rest site
   was still unrevealed on the days squads were being hurt. A rest site is shelter and water — part
   of the ground — so it is known from the drop now.
2. **The mend was inert by construction.** A wound in a contest runs 20 to 95 days and a contest
   about 24; a fixed six days off could never stand anybody up. Shelter halves what is left of every
   wound, and stands up anyone it brings under twelve days — so a lightly hurt fighter walks again,
   and a seriously hurt one goes home carrying half the wound.
3. **The squads were sent with a verb the engine does not speak.** A hurt squad ran from every
   fight straight away, and when I pointed it at shelter I gave it an intent of type `site` — which
   the engine silently ignores. The engine's verb is `claim`, carrying the objective itself. A
   beaten squad now runs for shelter within reach, and a recovering one walks to it.

Measured: rest sites used **0.7 → 4.0** a contest, beaten squads running for shelter **1.3**, and
fighters standing back up for the first time. The count stays small because a combat wound is
serious by design — the shelter's larger value is the half of every wound it takes off before the
squad goes home. The arc held; all gates green.

**THE REST SITE — built, and not reached. Open.** *(Superseded above.)* The ration site became a *Rest Site*: it still
feeds a squad, and now mends it (wound-days off every injury, a lightly hurt fighter stood back up).
Three things were fixed getting there — it healed the season's `condition` where a contest carries a
wound as `_recovery`; a recovering squad stood where it was instead of going anywhere; and the site
a squad chose ignored its need — and **none of them moved the number**: 12 rest sites placed across
three contests, 10 never touched, nobody stood back up, though people are hurt from day 2. A squad
chooses to recover about five times a contest. The cause is not yet found, and the next pass should
trace one hurt squad day by day rather than adjust another weight.

The arc held (0.046 → 0.168 → 0.178). All gates green.

**THE DESK SETS THE CONTROL THAT MATTERS.** The per-squad stance had been built in the engine and
left off the page — and checking before resuming showed it was worse than a loose end: every real
decision (pace, the wall, sites, whether a meeting becomes a fight, breaking off, piling in, the
initiative) read the SQUAD'S notch, while the Desk still offered only the per-OA ladder, read in
one place, a slight pull on which rival a hunter walked toward. A manager could set the control
that barely did anything and could not reach the one that did everything.

Now **each squad's card carries its own five-notch ladder**, Avoid through All In, and the notch
rides into the contest on that squad at the next window. The fleet section is **read, not set**:
each OA's mark, whether they are on you, what they think of you, and how they stand on the ground.
The per-OA notch reads neutral in the engine (`leanOf` returns 1), so the control gone from the
page is gone from the game, and `LEAN_PULL` — its strength, now read by nothing — is struck.

Gated in `drive.cjs`: every other OA is read and none is a control; each squad carries its own
ladder; two squads can be set to different notches; and **each notch rides into the contest on the
squad it was set for** — proven off the corp the engine hands back, not off the page. All gates
green, including `audit_table`, `probe_watch` and regress 114/114.

**THE MAP SAYS WHAT IS ON IT.** Every site was the same small square, and the cause was upstream:
the live window recorded a site as a position and a holder and nothing else — the engine's own
replay carried the type, the page's copy dropped it — so the map was never told a strongpoint
from a crate. Each kind now has its own mark: a **shield** for a strongpoint (wearing its holder's
colour when held), a **cross** for a rest site, an **eye** for the vision site (the relay mast, by
what it does), a **box** for a cache, a **round** for munitions, a **diamond** for a deposit; a spent
site fades. Hover names it and says what it is for.

**Your squads are tellable apart.** Every squad of an OA was the same disc in the same colour. Yours
are now ringed in their SQUAD colour and carry their LETTER, which is how the Desk and the roster
already name them; clicking one opens its leader's sheet. Hovering lists who is in it and how each
is — Standing, Hurt, Down — as they stand today, with a line saying so when the map is showing an
earlier day (the first window opens on the drop). Tying the list to the day on screen had meant it
was never shown at all.

Checked on a rendered image as well as in the harness, since jsdom's canvas cannot show whether a
letter is legible. Gated as **`harness/drive_map.cjs`**: fails if the map is not told what its sites
are or a squad's hover does not list who is in it. Colours drawn from the one `TOK` table. All gates
green.

**THE COPY RULE HAD A HOLE, AND IT WAS BEING WALKED THROUGH.** The designer caught *"Dug for Your
Own Stores, Win or Lose"* on a site hover and guessed the rest had it too; they did, and the UI
audit had passed every one. Its test for "the page explaining itself" was a clause of six or more
words around a verb from a short list — so *Dug*, *Reads*, *Reaches*, *Win*, *Lose* and *Held* were
not verbs to it, and five-word explanations like *Rounds for Whoever Reaches It* fell under the
floor. The list is widened and the floor is five. It then found **35 lines across the page**, not
only the recent ones: *No Window Has Closed Yet*, *They Would Not Entertain This*, *Close the Tab to
Leave*, *Paid in Credits and in Standing · the Standing Goes Either Way*. Each was judged, not
silenced: the explanations are cut to what they name (*No Windows Yet*, *Refused Outright*,
*Closed*, and the last struck outright), and eleven are allowed on purpose with the reason in
`audit_ui.allow.json` — the trait table, where a trait IS its effect; *Holds* and *Left*, nouns
the rule mistakes for verbs; and the names of the two kinds of deal. The site hovers now name the
site and nothing else but the facts that change: who holds it, whether it is spent. What a kind of
site is FOR is learned once from its mark.

**THE RECAP SHOWS THE STORES.** The winner takes stores as well as credits, a promise can move
stores, and a squad keeps what it dug — and the recap listed only credits, so all three were
invisible. The stores an OA brought home now sit under the credits in the same words the
withdrawal tiles use (*Minerals · A Full Hold*, *Foods · Half a Hold*), and a kept promise names
the stores it moved as well as the credits. Gated as **`harness/drive_recap.cjs`**. All gates green.

## THE DEFERRED THREE, MEASURED. *Findings recorded; rulings needed; nothing tuned.*

**`sim/measure_year.cjs` — the whole year, Divide included.** `measure_economy` stops at the lock,
so it had never seen what a Divide pays, and the settlement scale was being judged without the
settlement in it. Four seasons of the eight:

| | a year's net | what the Divide paid |
|---|---|---|
| the OA that won | **+₡680,000** | ₡1,390,000 |
| the seven that lost | **−₡65,000** | ₡5,300 |

**The winner is working as ruled.** Only 34% of a settlement reaches an OA's own books
(`SQUAD_BONUS_SHARE`; the rest is the parent organisation's, whose planet it is), and a win is
written to be worth 2.5 years of running costs (`WIN_YEARS` × `SEASON_COST_ANCHOR`). +₡680,000 is
that.

**The losers are in the red, and most of it is not the settlement.** Checked by A/B with the old
haul payment restored: losing years were **−₡49,500** before the prize/grab change and are
**−₡65,000** after it — so taking the haul's credits away cost a losing OA about ₡15,000 a year,
which is the grab the designer described as "a quick buck, guaranteed" and which the change removed.
But the losing year was negative before that, and the ledger says why: **death benefits average
₡48,600 an OA a season**, very nearly the whole deficit. That is fatality cost. Under the standing
instruction the settlement scale is NOT tuned against it — the number that decides whether a
losing year is survivable is the one that the next system change will move.

**Open for a ruling:** should a dug site pay a small, guaranteed sum in credits beside the stores
(restoring the "quick buck")? It would recover the ₡15,000 without touching the prize.

**THE KIT PASS — an asymmetry, not a price.** An OA spends **₡6,850 a season** on kit against a
procurement allowance of ₡122,934, and still holds **93 pieces** after three years. Kit does drain
(a dead fighter's kit is lost unless their side held the ground), so the cause is the start:
**the eight AI OAs found with 166–240 pieces** — eight to ten a fighter, a decade of kit — while **a
founded OA starts with 3**. Kit is nearly free for the AI and a real cost for the player.
**Open for a ruling:** what an armoury should be at founding, and whether the player's founding
stock should match it or come as money to buy one.

*(Struck: the claim that the Meridian stipend is "the one standing whose worth scales with how
early it is won". Every standing is permanent, so every one is worth more the earlier it is won —
a faster ward or a discount pays out over more years exactly as a stipend does. It was singled out
only because its value is written in credits.)*

## The founding, measured. *One ruling in; two reverted on measurement, with the reason.*

**A dug site pays ₡5,000 (ruled, in).** The stores are the main reward; beside them a site pays a
small flat sum, straight to the books, win or lose (`SITE_CASH`). It is right in principle and
small in effect: squads dig about **0.4 sites an OA a season**, so it adds roughly ₡2,000 a year,
not the ₡15,000 the haul used to. How seldom squads dig is itself worth a look.

**AI founding cash cut to a quarter (ruled; reverted, then RE-APPLIED).** *The revert below was
wrong, and is recorded so the mistake is not repeated.* It was justified by AI rosters falling
over the years — which is deaths outrunning signings, i.e. fatality, which is deliberately
untouched. **Standing instruction, extended: economic rulings are implemented as given. Nothing is
reverted or re-tuned because of where balance lands while fatality is open — only for a real
break (a crash, a force that literally cannot be fielded).** The recruiting check that tripped no
longer asserts how many an AI can afford (balance); it asks that an AI keeps a force of its own.
`AI_CASH_SHARE` is 0.25. What follows is the original entry.

**AI founding cash cut to a quarter (ruled; REVERTED).** The ruling: every OA founds with
comparable wealth, but an AI's is already spent on the people and kit it arrives with, while the
manager's is cash to spend his own way. Measured first, the imbalance was real — an AI founded with
**1.5 to 2.5 times the manager's total wealth** (cash, plus people at market worth, plus kit) — and
at a quarter of its band the wealth lined up (₡223,000–₡410,000 against ₡322,000). But it broke two
things. Boards had to rescue the AI twice as often (14 underwrites in four seasons, against 6). And
**AI rosters collapsed from 19 to 7 in the first year and never recovered**, because an AI funds
its recruiting out of cash — a year's wages set aside before it will sign — so a quarter of the
cash is a quarter of the recruiting. A field of seven-fighter OAs cannot muster. Held at full cash
(`AI_CASH_SHARE: 1.0`) until recruiting is paid for some other way. Worth knowing beside it: even
at full cash, AI rosters fall from 19 to about 10 over five years — deaths outrun signings.

**AI armouries cut (ruled; REVERTED).** Cutting the good kit to one per fighter and the spares to a
few brought armouries under a hundred — and some doctrines could then no longer muster a force from
their own founding armoury (the suite's doctrine gate). The spares are not surplus: they are what
muster arms a full force WITH, which the original comment on that line had warned about. Shrinking
the armoury needs a change to how muster draws kit, not smaller counts. Restored exactly.

**What these have in common.** Each ruling was sound, and each ran into the same thing: the
AI's economy was built to lean on a large cushion — of cash to recruit from, of kit to muster
from — and the cushion is load-bearing. Taking it away is a design change to how an AI recruits
and arms, not a number, and it should be ruled as that.

**The armoury ruling is in.** AI armouries are 121–192 pieces (were 166–240; a founded OA has 3):
the good kit keeps its depth, so every doctrine can still field a varied force, and the cheap spares
are cut (`FOUNDING_SPARES`). What a thinner locker cannot arm, muster buys — procurement, then the
board — which is how a manager arms his own. The doctrine gate had asked for a muster with NO money,
which the game never does; it now musters with a founding budget. Three full seasons: every OA
fielded its force every time.

**AUDIT 1 — what is simulated and never shown — is written up in `docs/AUDIT_HIDDEN.md`.** Five
things change outcomes and appear nowhere on the page: disqualification (an OA thrown out of a
contest, silently), each fighter's morale and loyalty, the medkits a squad carries, and a squad
running dry. Four more need a ruling (potential, tenure, a squad's approach, the price memory
between two OAs).

**AUDIT 1's FIVE ARE SHOWN.** A fighter's **morale** and **loyalty** sit on the sheet beside the
contract, each as a word and a figure (morale steadies them in every grid fight; loyalty moves what
re-signing them costs). A squad's card counts its **medkits** — the sum of its fighters' stores, which
the sheet already lists slot by slot — and says when it is **short of food** or **starving**, and for
how many days. **Disqualification** is a red band across your own day strip, *Disqualified* on a
rival's fleet row, and a line in the log the moment it lands. And **tenure** — ruled "largely
meaningless, good character" — sits last and quiet on the sheet as *With You · N Seasons*. Gated as
`harness/drive_shown.cjs`. Potential, a squad's approach and the price memory stay invisible (ruled).

**Two findings from the questions, recorded for rulings:**

- **Potential is still a live CEILING.** What was removed earlier was its DISPLAY on the market and
  prospect cards; the mechanic stayed. Drilling caps a stat at `min(potential, stat + gain)`
  (`events.js`, and `season.js` in training), and potential still scales how fast some growth comes
  and how the market sorts its lots. It is on the modern scale (110–200), so it is not breaking
  stats — it is silently limiting them.
- **Consumables are never spent.** A fighter's carried items are a fresh COPY each time a combatant
  is built, and what a fight throws is taken off the copy, never off the fighter. Two contests:
  **76 fights, 70 grenades thrown, 169 consumables used, from about 85 in the whole fleet.** So they
  are one per fight, every fight, forever, and never need buying again — the XCOM model by accident,
  and the opposite of "one grenade for ten fights". It also means a grenade is thrown in almost
  every fight, which makes it routine rather than a decision.

**POTENTIAL IS STRUCK (ruled: no unit ceilings).** It had kept capping drills, adding a hidden
premium to a fighter's trade worth, sorting the market's lots and shaping the Natural-Born months,
years after its display was removed. All of it is gone: a drill raises the weakest stat with nothing
hidden above it, a fighter is worth what it IS and how famous it is, the market sorts by what a lot
is, and a "prospect" at the lock means the young and the green. Two flavour lines that gossiped about
a scouted ceiling are struck with it. The two random draws that produced potential are KEPT, unused
and nothing stored, because removing them would move the random stream and re-roll every fighter in
the game. (Training's own cap is the stat scale's maximum, not a fighter's ceiling, and stays.)

**CONSUMABLES HAVE CHARGES FOR THE DIVIDE, AT MOST ONE A FIGHT (ruled).** They had been a fresh copy
every fight and never spent. Each item now carries CHARGES (`items.json`), fewer the stronger it is:
**smoke 8 · frag, ammo satchel, power cell 6 · medkit 5 · stim, incendiary 4 · spotter drone,
auto-turret 2 · contraband 1**. A fighter lands with them, carries ONE of each item it still has a
charge for into a fight, and what the fight used comes off the fighter afterwards. A **munitions drop
restocks** every charge the squad carries — a second reason to fight over one. Medkits fold in: the
squad's medkit count is its fighters' medkit charges, and the old per-kit `MEDKIT_USES` is gone.
Two contests, 78 fights: grenades thrown **70 → 38**, consumables used 169 → 125, **122 charges
spent**, 6 restocks. All gates green.

## AUDIT 2 opens: shown but not simulated

**The spotter drone and the auto-turret do nothing.** Nor does the stim shot, nor any of the three
tier-5 contraband items. Their catalogue entries declare an action — `deploy`, `dose`, `treat` — and
**nothing in the engine acts on any of them**: the grid fight handles consumables by name, and knows
five (frag, smoke, incendiary, ammo satchel, power cell). The rest are sold, carried, weighed and
charged, and never used, which is why neither a drone nor a turret has ever appeared on the replay.
The medkit half-works: it mends at the squad level after a fight, never on the grid. This is the
first finding of the reverse audit and is written up with the rest in `docs/AUDIT_SHOWN.md`.

**THE SPOTTER DRONE AND THE AUTO-TURRET WORK, AND THE REPLAY SHOWS THEM.** Both had been sold,
carried and charged and done nothing: their action (`deploy`) was handled nowhere.

- **Spotter drone.** Goes up when a side has lost the enemy — nobody in sight, somebody out there —
  over the last place contact was made, and for four turns everything within seven tiles of it is
  SEEN: no line of sight wanted, and concealment does not hide a body from above. It works through
  the spotting pass, so everything that reads spotting (squad sight, blind-fire, being unseen)
  answers to it with nothing new.
- **Auto-turret.** Set down on the fighter's tile when an enemy is in its reach, and fires once a
  turn for four turns at the nearest enemy it has a line to — steadier close in, cover against it as
  against anyone, wounds by the same rule as a fighter's, credited to whoever set it down. It is an
  emplacement, not a fighter: it does not count toward who is still standing. Its reach is a good
  eye's (15 tiles): at 10 it found an enemy in reach five times in three thousand checks, because
  contact on this grid happens at 7–15. Calibrated against the fighters in the same fights (13% a
  shot) to a good fighter's rate: **22%**.

Forty fights, one side carrying both: 155 drones up, 16 turrets set, 10 hits in 46 turret shots, and
**119 enemies put down against 83** without them. Gated as `harness/probe_devices.cjs`.

**The replay draws what is on the ground.** A frame recorded the fighters and nothing else — so
**smoke had worked on the grid and never been drawn**. Frames now carry smoke, drones and turrets:
smoke is a haze on its tiles, a drone a dashed ring over the ground it reads with a cross at its
centre, a turret a squared emplacement with a barrel, each in its side's colour. The play-by-play
had printed a grenade or smoke by its raw type name; it now reads *throws at*, *throws smoke*,
*sends up a drone*, *sets a turret*, *turret fires at · Hit*. Checked on a rendered frame.

**The abstract model had designed both, and it died with that model.** `combat.js` carried a full
set of turret and drone constants marked `[ABSTRACT]` — tuned, commented, read by nothing since the
grid replaced that resolver. Retired. Two ideas from them are worth giving the grid's turret later:
**it can be shot and destroyed** (two hits), and **it draws fire** — the loudest thing there.

**Open for a ruling: the AI barely packs them.** Each role packs only the first two items on its
consumable list. The turret is THIRD on the support role's list (behind the ammo satchel and power
cell), so no AI ever packs one; the drone is second on the scout's, so only forces that field scouts
do. Two whole fleets carried no drones and two turrets between them. Which role carries what is a
doctrine decision.

**AUDIT 2, PASS ONE — items and traits** (`docs/AUDIT_SHOWN.md`, `harness/audit_shown.cjs`). Weapon
tags work on the grid (the tag table survived the move from the abstract model). But **eleven of
eighteen mods do nothing when fitted** — `resolve` reads only a mod's `grants`, so accuracy, bipods,
overwatch links, rangefinders, extended mags, recoil comps, capacitors and the rest are dropped,
₡3,190 of kit at list price; two more lose their power penalty. The **Solar Accumulator Rifle** sells a
day/night identity for a system that was cut. **Psion: Pressure-Read** promises to tell you which
offers were bluffs and does nothing; two flavour traits carry dead hooks. Findings only; the
remaining categories (stats, standings, facilities, the Board, sites, negotiation, quoted numbers)
are the next pass.

**MODS DO WHAT THEY SAY.** `resolve` reads every effect a mod declares, not only its tag; combat
reads `kit.mod`. Sixteen of eighteen now work, proven off the combatant by `harness/probe_mods.cjs`.
The heat sink and field kit stay inert — their systems (heat, gear damage) are gone — for a ruling.

**THE PSION READS THE BLUFF, re-aimed.** Its promise was written for concession asks, which went with
joining — counted, the manager is now offered pacts and ransoms and nothing else, so *Asks to Concede
You*, *Would Take You* and *Can Join* can never fill. A YES to a withdrawal is the offer that can be a
bluff, so a psion on the roster reads each: *Meant*, *Doubtful*, *A Bluff*, from the settlement's own
chance. Gated in `drive_withdraw`.

**CUT (ruled):** the pressure-read psion — trait, conflicts, race weighting, its line, and the
withdrawal read built on it (a psychic in a squad reading the minds of other OAs never fitted, and
may return in another shape with the quirks); the heat sink and the field kit, whose systems are
gone — to be replaced later, not forced to fit; and the negotiation panels for joining —
*Asks to Concede You*, *Would Take You*, *Can Join*, and the *Concede and Go* / *Buy Them Off the
Ground* deals built on them. **Found removing them:** the OA picker labelled every OA from those dead
tables, so each read **"0%"** — a number the engine never produced, where odds were already ruled
out — and "Hunting You" never showed. It reads the Desk's live contact record now. The drive had
been manufacturing a fake "would take you" offer to test a deal that can no longer occur; gone.

**MODS, MEASURED IN FIGHTS.** "+1 aim" is on the combatant's scale — a fighter's aim ÷ 10 — so it is
**+10 on the stat scale and +4 points of hit chance**: an average shooter hits 34% → 38%, about
**12% more hits**. The quirk yardstick (+15 on the stat scale) is +1.5 here. Measured over sixty
fights, a side with the mod against a side without:

| mod | enemies put down (control 155) |
|---|---|
| optic | **176** (+14%) |
| rangefinder | **173** (+12%) |
| bipod (retuned) | **172** (+11%) |
| extended mag | **170** (+10%) |
| target link | **169** (+9%) |
| AP rounds (retuned) | **164** (+6%) |
| light frame | 143 (−8%: a march trade, bulk against power) |

**Two were wrong and are fixed.** **AP rounds** were a trap: `pierce_1` was worth exactly the −1
power it cost against a flak vest and nothing against no armour, so they were never better than a
bare gun. They pierce a grade deeper now (`pierce_2`): equal against light armour, **+21% kills
against a flak vest, +25% against plate**. The **bipod** rewarded holding still, and fighters on
this grid are almost always moving, so its −2 moving cancelled its +2 held (+2% put down). Retuned
to **+2 held, −1 moving** (+11%) — at +3 it reached +25%, past the optic at 58% of the price.

**DAY AND NIGHT WERE NOT CUT — they barely do anything.** A day is twelve two-hour blocks, six of
day and six of night. What night does now: a squad may march through it and tire (`NIGHT_MARCH_P`,
18%), and a fight is tagged day or night in the record. What it was written to do and does not: a
**−2 aim penalty at night** (`NIGHT_AIM_PENALTY`) sits in `aimEff` and never applies, because the
grid hands the hit roll only `unseen`, `overwatch` and `side` — never `night`. The two night trait
hooks (`night_encounter_bonus`, `night_ambush_warning_bonus`) and the Solar Accumulator Rifle's
`daylight` tag all hang on it. Recorded, not changed: the designer wants to know what is there first.

## ONE AIM — the second stat scale is to go. *Planned; `docs/STAT_SCALE_MIGRATION.md`.*

**RULED:** a fighter has one set of stats, the ones on their sheet, and combat reads those. `makeCombatant`
had divided all seven by ten and every constant downstream was tuned to the invisible copy, so a mod's
"+1 Aim" meant ten points of the Aim a manager can see.

**It has already broken things, found while planning.** **Fieldcraft has never changed sight on the
grid:** `sightRange` is written for the sheet scale (40 → 7 tiles, 150 → 15) and reads the ÷10 copy, so
**every fighter sees exactly 7 tiles** — fieldcraft 52 and 165 are identical. The auto-turret's aim was
set in sheet thinking on the combat scale. Every item and trait bonus is quoted in the invisible unit.

**The plan is staged so the core step is provable.** Removing the ÷10 and multiplying every stat-unit
constant by ten is a change of units: done right, no fight changes. Stage 0 records every quantity a
stat feeds through the current code; Stage 1 makes the change and must reproduce them exactly (sight
held broken on purpose so the step stays pure); Stage 2 turns fieldcraft on for sight as the one
measured change; Stages 3–5 put the turret, trait bonuses and copy in sheet points and strike the
leftovers. Then the audit: every stat on the sheet against what reads it — starting with the fact
that a shot uses the average of Aim and the weapon skill, which nothing tells a manager.

**ONE AIM, STAGES 0 AND 1 — done, and proven.** The baseline was recorded from untouched code: 768 aims,
1,536 hit chances, composures, wound pools, 640 severity rolls, 30 grid fights (hashed log for log) and
2 whole contests. Then the ÷10 at `makeCombatant` came out, with the three inline ÷10s (composure, wound
pool, flee), the grid's (initiative, panic, treatment) and `divide.js`'s (coordination, preparedness);
every constant in stat points went ×10 — the hit curve now pivots at Aim 100, a trait's "+2" is +20, a
mod's "+1" is +10. **Every quantity reproduced exactly, all 30 fights and both contests identical.** It was
a change of units and nothing else, and combat now reads the stats a manager sees. Sight is held broken
on purpose (Stage 2 turns it on). `probe_stat_scale.cjs` had asserted the copy was one tenth; it asserts
one scale now. All gates green.

**ONE AIM, STAGE 2 — FIELDCRAFT SEES.** `sightRange` reads the sheet, and for the first time a scout sees
further than a lookout. A/B, sides identical but for fieldcraft: 150 against 50 went from **+2** wins over
an even match (noise) to **+16**, the better eyes putting down 230 and losing 98; 120 against 80 is **+9**.
The field sees about 10 tiles at typical fieldcraft instead of a flat 7. Five combat snapshots re-blessed
(recorded fights, no invariant broken); the arc holds (0.044 → 0.170 → 0.208). Gated as
`probe_fieldcraft.cjs`; the proof baseline re-recorded on the one scale.

**ONE AIM, STAGES 3–5 — done.** The turret shoots as a fighter shoots (Aim 130 on the sheet, through the
real hit curve). Trait aim bonuses are named constants in sheet points (`TRAIT_AIM`). The market shows a
mod's effect for the first time — **Aim +10** on the optic (`drive_market.cjs`). And Stage 5 found a ÷10
Stage 1 had missed: `squadStat` served squad means divided by ten. Three consumers were written for that
copy and converted (proven exact); the fourth, the **passive sighting built in an earlier pass, was
written for the sheet and fed the copy**, so fieldcraft never varied anyone's watch and every watch was cut
by a third. Fixed and measured: a still squad's sightings 0.20 → 0.47 a day, patience still worth 8.8× a
march. All gates green; the arc holds and sharpens (0.047 → 0.156 → 0.437).

**Found, and open: careful squads are caught by the wall.** Re-measuring the stance ladder after the sight
changes, fighting still runs the right way (Avoid killed fighting 12.5, All In 14.5) but **Avoid lost 3.8
fighters a contest to the closing wall** against none for All In, which tips its total above All In's.
Four contests, and a wall death is a whole squad, so it is noisy — but a careful squad too slow to outrun
the wall is a behaviour to fix, not a number to tune, and it is next.

**THE DEATH WALL KILLS NOBODY (ruled).** Squads are never caught outside the ring; a single wall death is a
bug in somebody's behaviour, to be investigated. Every wall death was recorded and traced, and not one was a
squad walking too slowly. **Every squad it killed had been ordered at dawn to walk in, and stood still all
day**: on the last ring (radius 0.014) the order's target sat inside the 0.012 arrival slack, so movement ruled
them "arrived" a hair outside the line — a geometry the endgame's smaller last ground created, which the
arrival slack was never re-checked against. A rest, fortifying, a fight or a stretcher could hold them too.
(An early count of 309 "squads taken" was squads already wiped out in fights — corpses the wall passes over;
the real count was the engine's own, about 30 living fighters a contest.)

**Now checked every day-tick, not once at dawn:** a squad outside the ring breaks off whatever it is doing —
a fight included — and sprints for safe ground just inside, at full pace whatever its stance, rest or burden,
with no arrival slack; water and peaks are swung round in a full circle. Wounded with nobody able to walk drag
themselves in. **Five contests: 0 living people taken** (from ~30 in one), 711 sprints. A first cut also ran
squads that were merely NEAR the line and aimed them 20% inside — that sent careful squads charging off the rim
into the middle, and Avoid ended up in more fights than All In; the ring does not move within a day, so only a
squad actually outside runs now, and it runs to safe ground, not the centre. Every living person the wall takes
is recorded with its squad's stance, intent and position (`stats.wallDeaths`); gated as `harness/probe_wall.cjs`,
which fails on one.

**The ladder, re-measured:** Avoid fights 14.3 and goes looking 3.0; All In fights 24.0 and looks 19.3; neither
loses anyone to the wall. **Open: deaths come out nearly even** (Avoid 13.0, All In 11.8) — a found squad loses
~0.9 a fight, a seeker ~0.5, so being found has grown costly since the sight changes. Recorded as a question of
engagement balance, not tuned here. The arc holds and sharpens (0.066 → 0.147 → 0.602). All gates green.

**WHY A CAREFUL SQUAD DIES MORE — traced, not yet fixed** (`harness/probe_avoid.cjs`, reading a fight recorder
in `divide.js`). Four contests per end, every fight broken down. Ruled out, in order: being outnumbered (both
stances fight ~4 against ~11, most fights draw in several sides); being overrun through panic (All In runs MORE —
half or more fled in 53 of 96 fights, against 13 of 57 — yet loses fewer); abandoned wounded (the recovery roll
and the wound severities are nearly identical). **What is left is the shot itself:**

| | killed outright / fight | hits taken / fight | killed outright per hit | hit at short range |
|---|---|---|---|---|
| Avoid | **0.53** | 7.5 | **7.0%** | **38%** |
| All In | 0.25 | 6.5 | 3.9% | 20% |

Enemies hit both at the same rate (~12%); Avoid's fighters are hit at CLOSE range twice as often, and a close hit
kills. The leading explanation: a careful squad breaks off early (72% of its fights), and the grid plays that
withdrawal as fighters leaving cover and walking out while the enemy closes and shoots them at point-blank — when
COMBAT.md says an orderly disengage should be low in casualties. The fix belongs in how the grid runs a
withdrawal, and is measured against this baseline.

**THE CAREFUL-SQUAD DEATHS — the retreat explanation was wrong, and the cause is still open.** In a plain grid
fight a withdrawal is not lethal: withdrawing fighters take fewer hits, almost all at long range, and are killed
outright ~1% of the time. And **the grid does not read a side's stance at all** — a preservationist side and a
standard one produce the identical fight, fighter for fighter (`withdrawShift` reads only traits). So whatever
kills careful squads is set up by the Divide. Ruled out across this pass: numbers (both ~4 against ~11), panic and
overrun (All In runs more), abandoned wounded (recovery and severities alike), terrain (forest 5% against 3%),
opening range (short 14% against 15%), preparedness (Avoid 0.43, All In 0.38 — Avoid is BETTER prepared),
flanking (54% against 67%), fighting over sites (~90% both), and the weapons across the table (identical). **What
stays true: careful squads' fights drift to close range during the fight (hits at short range 38% against 20%) and
a close hit kills.** Next is watching individual fights turn by turn to see who closes the distance. The fight
recorder and `probe_avoid.cjs` stay for it.

**The quick loose ends, tied off.** Every charge a squad carries shows on its card (*Frags 6 · Smoke 8 · Medkits
5*, red at zero), and the market shows an item's charges; only medkits had been visible. Smoke's description says
three turns (it lasted three and said two) and the medkit's no longer says "consumed on use". A missing Presence
defaulted to 900 (`MIND_MID × 10`, with `MIND_MID` already on the sheet) and reads 90. The dead `stat_mods`-in-
tenths path is gone with the second scale. And the two failing generation claims were stale, not bugs: births
are no longer multiples of ten because every stat is nudged within its decade at birth by design (a balanced
±9 — "the grain between the tens"), with quirks adding real points on top *(corrected: this first credited the
quirks alone; the designer pointed out the randomisation, which the generator confirms)*; "prisoners' close skill = aim + 20"
failed on any prisoner whose Aim a quirk moved after birth — it now tests what it meant, that every prisoner is
better up close than at range. The stim's description still promises what the stim does not do; its fate is a
ruling. All gates green.

**ONE AIM AT BIRTH — fighter creation rolls on the sheet.** The generator rolled every stat on the old 1–20 scale
and multiplied by ten afterwards, with its model (mean 8.5, spread 2.8, clamp 1–20), the pools' quality shifts,
the nine races' leans and floors, and the trades' leans (`aim + lean × 10`) all written in that unit. Every one is
the sheet's now — mean 85, spread 28, clamp 10–200, a mercenary lot's quality +13, a prisoner's close-quarters
lean +20 — and a stat's DECADE is rolled directly, with the grain within it nudged in after. The retired potential
and scouting estimate, and their models, are gone; their two random draws stay so the stream does not move.
**Proven: 630 of 630 fighters identical** — from squads, all three recruitment lots and the founding fleets, race,
age, name, every stat, skill, trait and contract (`harness/gen_scale_proof.cjs`). The combat proof, the suite
(114/114) and every page drive hold. There is one scale in the game now, from birth to the last shot.

**THE CAREFUL-SQUAD DEATHS — found, and half fixed.** Watching fights turn by turn: a close-range hit looks the same
for both stances (they start ~12 tiles apart, the shooter walks in ~4, the shot lands at ~4, nobody arrives mid-fight).
What differed was how LONG the fights ran: a careful squad's one-on-one fights lasted **11.3 turns to an All In
squad's 5.0**, and deaths scale with time under fire. The cause: **the grid never read a squad's stance at all** — the
side it was handed carried the OA's declared policy, and every side withdrew at the same 35% down. A careful squad's
caution worked only BEFORE a fight; caught, it fought on until two of four were down and then walked out under fire.

**Now each stance has its own withdrawal threshold, carried on the side** (`STANCE_WITHDRAW_AT`): Avoid pulls out at
its first casualty (10%), Wary 20%, Engage the grid's own 35% (unchanged), Press 50%, All In holds to 65%. Squads
fighting as one side pull out together at the mean. Careful squads' fights fell to 9.4 turns (one-on-one 6.5, from
11.3); All In's rose to 11.9; **per fight, Avoid now dies less than All In** (0.58 against 0.63).

**Open — the second half.** Over a whole contest the deaths came out level (Avoid 11.8, All In 11.5), because the fight
COUNTS moved: a careful squad survives its short fights, stays on the map and is found again (9.5 times a contest),
while All In, holding on through long fights, is tied up and worn down and gets into fewer (16.3, from 24.0). A careful
squad that breaks off has to get CLEAR — go to ground, put distance behind it — rather than be picked up again. That
is a Divide-level behaviour and is next. Wall still zero; arc 0.024 → 0.195 → 0.658; all gates green; the combat
proof re-recorded (AI squads with a non-standard stance now fight differently by design).

## THE PLANET'S CYCLE (ruled). *Built: the light, PCD, and night in the fight. Next: the Solar rifle, then more.*

**The fleet keeps an Earth calendar; the planet keeps its own light.** Months and the Divide's twenty-four-hour days
are the fleet's — its sleep, its supply, the clock it brought — and they stay. But daylight is the PLANET's, and no
planet shares Earth's day. Each world now turns at its own speed, log-spread from **8 hours to 6 days** a full
turn: several dawns inside one Divide day, or three days of sun and then three of dark. Derived from the planet's own
make-up, not drawn from the generation stream, so every planet is otherwise exactly as it was (`map.js lightAt`).

**Two clocks, kept apart.** The one word `night` had meant both "the fleet is in camp" and "it is dark". Now `camp`
is the fleet's clock (six blocks marching, six in camp, recovery and cell recharge overnight — unchanged) and `night`
is the planet's dark, which drives spotting (`DETECT_NIGHT`), the fight, and the replay's tag. Before, darkness and
fighting never met — calendar night was camp — so **virtually no fight was ever fought at night. Now 46% are**, on
planets turning every 26, 35 and 90 hours.

**Night reaches the fight.** The grid had never been told the hour: the night aim penalty (−20) sat in `aimEff`
unused. It applies now — the same fights at night drop from 14.9% hits to 11.7% — except for a fighter with
`night_encounter_bonus`, who is at home in the dark. The night-ambush warning (`night_ambush_warning_bonus`) had
worked day and night alike; it is a night sense now.

**Plain to the manager.** The Desk's day strip carries the light: *Night · Dark · Dawn in 12 Hours*, and today's
twelve two-hour blocks shaded light and dark, so a three-day sun or a twice-a-day turn is visible at a glance
(`harness/drive_light.cjs`). And the planet's day is **scoutable in the Hazards row**: a glance says long days, short
days or days near our own; a closer look gives it to the nearest six hours; full depth gives the hour and the split.

The arc holds (0.039 → 0.183 → 0.285); nobody dies to the wall; the table's rulings and the suite hold; the fighter
proof is untouched; the combat proof re-recorded (contests now fight in the dark by design).

**TERMS, LOCKED (ruled).** A **day** is the fleet's: twenty-four Earth hours, the unit of the calendar and the Divide.
A **cycle** is the planet's: one full turn, light then dark. A planet's stat is its **PCD** — planetary cycles per day
— from **0.25** (one cycle every four days: two days light, two dark) to **4** (four cycles in a day), any value
between, likeliest near one: drawn as a triangle in log space, so 4 is exactly as rare as 0.25. Measured over 400
planets: median 1.03, and 46 below 0.5, 132 between 0.8 and 1.25, 43 above 2. (The first build spread cycle LENGTH
evenly from 8 hours to 6 days; replaced.) The planet carries `cycle: { pcd, hours, phase }`; the Hazards row scouts
it — *Fast Cycles* / *Slow Cycles* / *Near a Cycle a Day*, then *About 1.5 Cycles a Day*, then *1.42 Cycles a Day ·
8 Hours Light, 8 Dark*. The Desk says *Under an Hour* rather than *0 Hours* when the turn is close.

**NIGHT IS DIFFERENT (ruled): detection greatly cut, movement slightly slowed.** In the planet's dark: two squads
notice each other at a quarter of the daylight chance (`DETECT_NIGHT` 0.55 → 0.25) — and the compression floor, which
had overridden the dark entirely as the ring closed, is lowered by it too; the daily watch is cut by the share of the
march spent in the dark (`NIGHT_WATCH` 0.30); a fighter on the grid sees 55% as far (`NIGHT_SIGHT`), unless at home in
the dark; and a march goes at 85% pace (`NIGHT_MOVE`) — never the sprint for the wall. **The dark is now quiet: 28% of
fights fall in it against half the march** (it was 50%, the dark cutting nothing), and total fights fell a little as
squads slip past each other. In the grid, the same fights at night hit 10.2% against 14.9% and run 15.6 turns against
12.6 — short sight closes the range. That opens night tactics — a careful squad moving under it, a hunter waiting for
light — for the planner to use. Arc 0.032 → 0.179 → 0.468; wall zero; table, suite and every drive hold.

**Next, in order:** the Solar Accumulator Rifle made to live by this light; the stim and the three contraband items
built as described; drones and turrets bought by rich OAs; then the rest of what night can mean — shorter sight on
the grid, the march, the watch.

**AUDIT — THE ALEAS AND THE BACK ROOM** (`docs/AUDIT_ALEAS.md`, `harness/audit_aleas.cjs`). The loosest part of the
game. Of the Back Room's five acts, two do nothing (Bribe an Official and Buy a Malfunction set favours nothing
reads) and one does less than it says (sabotage adds fatigue; the kit is not worse). **Joining still runs** — 10 AI
joins and 7 stand-downs in four contests — and the composer still offers its two ways beside the Withdrawal tab;
betrayal and asks, which hang on it, never fire. The Aleas standing is on screen and moves (−42 to +54) but its
headline consequence sat on the dead betrayal path. The season's edicts are never shown. Losing footage is built
twice (Buy a Malfunction; the new window bribe). Proposed: one exit (retire joining), betrayal → truce-breaking as
a case, one back room (the Back Room prices every favour; its dead acts get their promises), the standing
earns its gauge, edicts announced, `crowdHit` folded in. **Contraband's sentence ruled and built:** disqualified,
not executed — off the field, standings from everybody, digging and site earnings forfeit, every deal cancelled.
Not published: the manager's case has no panel yet.

**JOINING RETIRED, PROPERLY THIS TIME (ruled).** The earlier pass cut joining's PANELS and left the machinery
running: the AI's join pass, banners courting spoilers, the post that carried join offers and invitations, the
manager's two composer ways and their answers, three joining tables priced every window and read by nothing,
betrayal, asks and "left to die". All gone. Measured: **0 joins, 0 stand-downs** (was 10 and 7 in four contests);
truces rose to 45 from 26 with nothing absorbing or forbidding them. The dead pricing went too — `offerRange`,
`evaluateOffer`, `considerInvite`, `considerJoin/Take`, `rankBanners`, `considerBetrayal`, `strike`, `owedBy`,
`chainShare` — with 4 dead functions and 32 dead constants; `audit_code` is back to 0.

**Two checks were reporting on nothing.** `sim/audit_table.cjs`'s twelve rulings (T1–T10) were ALL joining's, so
"every ruling holds" had been green over a dead system; it now rules on what the table does — truces made and
mostly kept (17 broken of 70), ransoms paid (103), and no join ever struck. The page drive walked the windows
for a join row, found none, composed nothing and **reported success anyway**; it composes a truce now and reads
the answer back. The suite's N-T8 (join pricing) is retired; its survey test pins the fleet's month.

**THE ALEAS' RULINGS ARE CUT (ruled):** the early wall, the stun-grade Divide, the no-truce year and the levy.
The fleet's month keeps the three that are not the Aleas changing the rules (the public survey, and the
armourers' prices) — which makes the survey likelier, and that is what the suite's survey test now pins.

**"The Quiet Business" is gone from the code** — it is The Back Room everywhere, as the game says (ruled).

**QUEUED (ruled): the half-built audit.** A sweep for quick fixes that changed what a manager SEES while leaving
the engine running underneath — the ×10 stat seam and the joining panels are two; the question is what else.
First leads already found: `sealed`, `principalOf` and `umbrellasOf` now resolve to "this OA, alone" and read as
though banners still exist.

**SABOTAGE IS A BAD BATCH (ruled: gear malfunctions).** It had landed as FATIGUE at the drop, which is not what
"a quartermaster signs off on a bad batch" sells. Sabotaged kit now FAILS when it is asked for: a jam per shot
(6% a payer), and clearing it costs the rest of the turn. Measured over 40 fights: one payer buys ~2.6 jams a
fight and pushes the victim's losses 117 → 125; two payers cost it kills as well. The play-by-play says so
(*clears a jam*), as it now does for the stim, the scrambler and a killed broadcast.

**A TRUCE IS BINDING (ruled).** The Aleas ratified it, so breaking one is theirs to rule on: it opens a case like
contraband, at **four times** the price to make it disappear (₡72k–₡192k against ₡18k–₡48k). And nobody signs a
truce meaning to break it who could not pay to bury it — an OA that cannot meet the price is bound by what it
signed. Measured: **truce breaks fell from 9 to 3** in four contests; both cases that opened were paid, neither
was ruled on.

**THE BACK ROOM'S TWO DEAD ACTS DO THEIR JOBS.** *Buy a Malfunction* ("one act this Divide is not seen") now keeps
a case from ever opening; *Bribe an Official* ("one ruling goes your way") turns the one verdict that would have
gone against you. Both are spent once, and the favours bought before the drop are carried into the Divide.

**THE ALEAS' CASE REACHES THE MANAGER (ruled: answer it on the spot).** The day strip carries it — *The Aleas Have
Footage · A Broken Truce · Day 2 · Pay ₡120,000 to Lose It · Let It Stand* — and the answer rides the window;
unanswered by the next one, they rule. Gated as `harness/drive_case.cjs`. The Aleas gauge says what the number
buys: *The Referees · Their Price for a Favour*.

**WHY NO AI CARRIED CONTRABAND — found, and it was three things in a row.** The quartermaster buys it readily
when its character allows and there is money; but **the OAs whose character allows it are the poor ones** (Vantis
musters on nothing most seasons), so none was ever bought. It keeps some in the rack from founding now, as a rich
OA keeps devices. Then the rack sat full: the muster's two consumable slots fill with smoke and frags long before
anything at the bottom of a role's list, so an OA that KEEPS banned kit now fits it, from its own rack, never
bought at the muster. Then it still was not thrown: the grenade reached for the frag first, so a fighter carrying
both never threw the banned one — the thermobaric goes first now when what is in reach is dug in, which is what it
is for. **End to end in a real contest: 25 carriers in four contests, a scrambler set off, the Aleas filmed it, a
case opened, and the OA paid ₡31,000 rather than face the verdict.**

**AUDIT — HALF-BUILT (ruled; `docs/AUDIT_HALFBUILT.md`, `harness/audit_halfbuilt.cjs`).** A sweep for quick fixes
that changed the visible end and left the running end alone. Six junctions checked. **Clean:** the window hands
the page nothing dead (0), no switch anywhere goes unread (0), and **every ×10 seam left is benign** — four
round-to-one-decimal, one the deliberate decade roll at birth: no second scale is hiding. **Found:** eight steps
in the page drive could pass by doing NOTHING — the joining shape exactly — now counted and reported (*"2 step(s)
SKIPPED, and a skipped step proves nothing"*); and **four hooks the engine READS that no trait declares**
(`camp_morale_aura`, `camp_morale_bonus_meals`, `squad_supply_efficiency_up`, `supply_consumption_down`) — the
mirror of Audit 1, where hooks were declared and unread: camp morale and supply efficiency are written, tuned
and unreachable. **STRUCK (ruled):** both come back with the quirks revisit (camp morale +2 in camp, +3 on a full ration; supply
demand ×0.9 and ×0.92), and dead code that reads like live design is worse than none. Two counters never fire
now, and both are correct. `domeDeaths` never
moving is the wall ruling holding; `relayEscapeUsed` is live but rare (a squad fleeing while holding relay intel).

**THE CAREFUL SQUAD, FOUND AT LAST — a half-built fix of this project's own.** Measured on IDENTICAL seeds (four
contests a stance had swung deaths by ±3 between runs, and earlier passes were steering by that noise), a careful
squad fought MORE than an All In one (19.5 to 16.0) and died more (13.0 to 10.8). Going to ground after a break —
run further, lie low two days — measured as nothing (found 8.5 without it, 9.5 with) and was taken out. The cause
was two lines in the wrong order: a meeting wrote each side's sighting of the other INTO its picture before
asking who had seen whom first, so every squad "had a fresh sighting" the moment they met — **all 262 meetings
with a careful squad came out both-saw**, the saw-first rule (§7.6, built an earlier pass) never told anybody
apart, and boldness decided every initiative. Reordered: meetings now begin as one-saw-first (8%), stumbles (4%)
and both-saw (88%, mostly the same pair meeting again that day), and a careful squad also turns away from a mutual
stumble more often than not. **Same seeds, after: Avoid fights 22.5 and loses 10.5; All In fights 32.3 and loses
12.8** — the ladder runs the right way on both counts for the first time. The arc holds (0.031 → 0.159 → 0.601);
wall, table, suite and every drive green. Gated: `harness/probe_initiative.cjs` fails if every meeting is the same
kind; the engine keeps `meetKinds` always. `probe_squadstance` takes `FROM=` so long runs split into batches.

**Chem rounds did nothing but get you caught.** Its line promises severity +14; its only data was a tag, and a
mod's tags were never read (only `grants` reached the gun). Carrying it opened an Aleas case for no effect. It now
pierces and adds +14; chem rounds is the only mod with tags, so no other mod moved.

## FOUL PLAY — ONE CASE, PAY OR SUFFER (ruled). *Stage 1 built: the Divide's cases. Stage 2: the Back Room's
acts into the same model, and evidence-by-intel removed. Stage 3: a UI mock-up pass.*

**Rulings.** No suspicion stat: the PRICE says how bad it is, as the guards' fine does. Two answers only — pay, or
suffer it; nothing else carries over but the standings and the money. A rival's foul play is known only when it was
not paid (intel telling you they did ill, and again when they were caught, was redundant). And cases are granular:
one fighter with contraband is not a squad of them.

**Built.** ONE case per OA, and it GROWS: every filmed offence joins the open case until it is answered, counted per
use and per fighter (chem rounds 2 a carrier, a thermobaric 6 a throw, a scrambler 5, a killed broadcast 4, a broken
truce 25). Price = severity × ₡4,000 × the OA's file (its Aleas standing, 0.6–1.6×), each earlier case this contest
making the next a quarter dearer. Suffering it is sized too: under 8 a standings hit scaled to the offence; 8 and up
disqualified (off the field, forfeits, deals cancelled); 25 and up half as much standing again. In the planet's dark
a use is filmed half the time. A bought official halves the Aleas' price; a bought malfunction keeps a case from
opening. Chem rounds are recorded per carrier. Exercised (`harness/probe_cases.cjs`, contraband made commoner for the
run): nine cases in six sizes — a lone jammed broadcast ₡15,000, one thermobaric ₡15–34,000, four thermobarics by four
fighters ₡60,000, a broken truce ₡96,000 — a repeat offender's single charge rising ₡28,000 → ₡34,000, cases growing
three times, eight paid and one suffered (two charges, ₡56,000 it could not meet: disqualified). The day strip names
what they have act by act (*A Thermobaric Charge ×2 (2 Fighters), A Cortical Scrambler*); a rival's unpaid verdict
lands in the log.

**FOUL PLAY, STAGE 2 — THE BACK ROOM PAYS OR SUFFERS TOO.** An act that comes apart no longer lands its reckoning
at once: it opens a case in the same model as the ground's — its severity the act's own reckoning summed, its price
that severity × ₡4,000 × the OA's file with the Aleas — answered this month on the Back Room page: *Pay ₡X · The
Aleas Lose It* or *Let It Stand · Everyone Knows*. Unanswered, it stands at the month's end. An AI OA pays if it can
spare the money. The fleet hears of it only if it was not paid (the Desk asks the manager about his own case). **CORRECTED — the evidence was removed on a MISREADING, and is restored.** The ruling was about CASES: a rival's
case is public only if it is not paid, and intel is not what tells a manager they were caught (a second telling of
something already public was the redundancy). It said nothing against scouts finding dirt, or against blackmail,
leak and report — which were removed, and are back: both intel paths, the AI's use, the API, the page section, the
Desk item, the constants and the acts. **One thing changed with them (ruled): REPORT IT opens a case against the
rival** — priced and answered like any other, paid or suffered, public only if unpaid — **and the Aleas think the
better of whoever brought it** (+10 with them). A failed act and a report open cases through one function
(`openCase`). The drive walks it all: the scout finds it, blackmail pays (+₡6,651), a report opens a case (paid)
and raises the manager's standing with the Aleas. (Found restoring it: the page has two `data-ev` handlers, one for
events and one for evidence; the first copy took the wrong one, and the drive caught it.) `renderQuiet` and `openQuiet` — the old name, still
lurking in the page's code — are `renderBackRoom` and `openBackRoom`.

**FOUR FROM A PLAY-THROUGH.** (1) **A case reaches you the month AFTER (ruled)** — the Aleas get on to an OA with
some time to find the money, not an instant reaction. A Back Room act that comes apart only says so; its case is
delivered at the start of next month and answered in that month (unanswered, it stands at its end); an AI answers
it then too; a report against a rival works the same way; the fleet hears of an unpaid case when it is settled; a
case from the last month is answered at the lock and settled at the drop. On the ground a case already arrived at
the next comms window. (2) **The market's Contraband tag ran into the name** ("Broadcast JammerContraband"): its style
lived only inside the catalogue table, and the market never listed contraband until it had a price. Styled on the
market row now. (3) **"Day 4 of 24" is gone** from the day strip and the status line — the day, never how many
there will be. (4) **THE COMMS WINDOW STANDS AT DAWN, BEFORE THE MARCH (ruled; fixed the pass after).** A window was taken at
the END of a day, after its march and fights, so squads walked days 1 and 2 before a manager could give them an
order and the contest opened on day 2. Counting from the landing alone (tried first, backed out as a half-fix)
only moved it to the end of day 1. The whole window section — the table, the reform of spent squads, the manager's
answer, 363 lines that use nothing the day defines later — now runs at dawn, after the ring and weather and before
any squad plans; windows are counted from the landing (days 1, 3, 5 …, then daily). The first window is the drop:
no squad has moved and nothing has been fought. Two things the dawn window needed: a squad's reading of its captain
(taken when it plans, now after the window) is taken at the drop too, so the Desk names captains on day 1; and the
Ground, given an empty record, stands at the landing morning instead of wherever it last was.

**"Day 4 of 24" was never the contest's length.** It was `LAST_GROUND_DAY` — the day the WALL stops closing, the
Aleas' published timetable. The contest ends when one banner stands; four contests ended on days 23, 24, 36 and 36.
The strip had labelled the wall's schedule as the length of the fight.

## THE BACK ROOM, THE CASES AND CONTRABAND — REMOVED (ruled). *Done.*

The further the foul-play system was dug into, the less it earned its place: every red rectangle another job, all
of it increasingly superfluous. Backed out whole, in one pass. **Gone:** the Back Room (its tab, page, acts, the
AI's monthly use of it), evidence, blackmail, leaking, reporting, the scouts' dirt, bribery, favours, sabotage and
its jams; the Aleas' cases, footage, their prices and verdicts; disqualification, its forfeits and bands, and the
dozen checks of a flag nothing can set; contraband as a category — **nothing is banned in a blood sport**: the
thermobaric and the cortical scrambler are ordinary kit, priced by the formula, and still do what they did (20
fights: 53 thermobarics, 71 scramblers). **Cut:** the Broadcast Jammer (its one job was hiding contraband) and
**chem rounds** (ruled: unnecessary once legal), with the mod-severity plumbing only they used. Joining's last
flags and seven reputation acts only the removed systems fired went too; `illicit.js` is out of the build.

**A TRUCE CANNOT BE BROKEN (ruled).** Not a price, not a deterrent: there is no code that could break one. The
reason is narrative — the drones answer a broken Aleas-mandated truce with the complete annihilation of the squad
that broke it, so no OA has ever dared. Two contests: 21 truces, none broken.

**The Aleas standing is HIDDEN** until a media system gives it a meaning (coverage, airtime, sponsors, the Eight,
the drop — brainstormed, not built): nothing reads it now, and a gauge measuring nothing is the half-built trap.
The Board shows two audiences.

**Caught on the way:** removing the season's Back Room API took three neighbouring lines of unrelated exports —
`founderProfile` among them, which founds an OA; the page drive caught it and they were restored exactly. The
suite's exotic-price floor now compares exotics with ordinary GEAR (a one-charge grenade is not a railgun's peer),
and its contraband test asks that nothing is banned and nothing sold is free. The table rules "no truce is ever
broken". Found for the half-built list: five reputation acts are defined and fired by nothing — `granted_a_raise`,
`took_the_purse` (the Dividend), `the_gate_was_good`, `kept_a_debtor`, `bought_win` — features that never call
their own consequence. All gates green; code audit 0.

**AUDIT — EXPORTED AND NEVER CALLED (a new junction in `audit_halfbuilt.cjs`, section G).** Found starting the
listed-stats audit: the captain's hold (`captainReadsFight`) still multiplied a captain's tactics by a constant tuned
to the retired ÷10 scale — ten times too strong — and nothing had caught it because nothing CALLS it: it is the old
abstract fight model, exported and dead, and the code audit counts an export as a use. The new check found 29 such
functions. **Removed — leftovers of systems since replaced:** the abstract fight model (`captainReadsFight`,
`tallySide`, `avgComp` and its seven settings), joining's pricing (`buyPenalty`, `foldPenalty`, `composeTerms`,
`contactScore`, `resourceRates`, `wantsStandDown`, `bodyMoney`, `considerWithdraw`, `pactViability`,
`expectedBank`, six settings), the Aleas and evidence era (`aleasStandingOf` — "a placeholder until Step 9" —
`seenDoing`, `dossierFullness`), `dialsToward` and the `stanceToward` only it called, and unused helpers
(`forceValue`, `musterCost`, `resourceValue`, `bankedShare`, `bidsFor`). The combat proof reproduces exactly.

**A BUG FOUND WITH THEM: an AI could bind the manager to a truce he never saw.** Before the drop each AI OA offers a
truce to the rival it likes its chances with — the manager included — and the answer is ROLLED ON THE TARGET'S
BEHALF. The page has no way to offer or answer one, so a manager could enter a Divide under a truce he never agreed
to, and — truces being unbreakable — never leave it. AI OAs no longer offer one to the manager.

**WRITTEN AND NEVER CONNECTED — for a ruling, not removed:** `decayFame` ("between Divides the fleet forgets a person"
— fame never fades); `mercPriceMult` and `wageBillAt` (the mercenary market charging by reputation — never applied);
`storyMult` (how a fighter's traits colour the stories told about them — never computed, so those effects never
land); `offTheLine` ("the Divide's drop reads this" — nothing does); `attention` (a hated fanbase watches — for the
media system); `pactTargets` (the manager's own pre-drop truce offers — the engine supports them, the page never
does); and the five reputation acts no feature fires (`granted_a_raise`, `took_the_purse`, `the_gate_was_good`,
`kept_a_debtor`, `bought_win`).

**RULINGS ON THE NEVER-CONNECTED, CARRIED OUT.** **All pre-drop trucing is removed (ruled)** — the AI's offers, the
offer and its listing, predivide's pact chance and settings, the Divide's seeding of truces at the landing; a truce is
made at the table, on the ground. `storyMult` is **parked** for authored stories and `attention` for the media system
(the half-built audit lists them as parked, not as findings). The rest **wired in**:
- **Fame fades.** `decayFame` runs once a year in the off-season: a name made once is not made for good.
- **A corp that spends people pays more for the next ones.** A mercenary's asking price now carries `mercPriceMult` —
  the OA's recent permanent losses against the fleet's: Knights' Star (few) now hires a mercenary for less than a
  natural-born (₡29,432 against ₡34,372), Vantis (most) for more (₡44,129 against ₡39,363). The wage-bill version
  (`wageBillAt`) would have repriced signed contracts, and is gone.
- **Five reputation acts raised where they happen:** `granted_a_raise` (the raise event, *Grant It*), `kept_a_debtor`
  (the creditors event, *Pay It*), `took_the_purse` (the Dividend's winner), `the_gate_was_good` (the month's best
  gate — "above the average" would have dripped standing on half the fleet every month), `bought_win` (the winner of
  a planet, for each promise it made a withdrawing rival, kept or not). Two seasons: 3, 5, 7 and 22 of the first
  four; `bought_win` needs a manager's withdrawal to exist, and fires at its settlement.
- **Off the line is the OA's own role list** (`offTheLine`, "the Divide's drop reads this"). The drop, the Dividend
  and the Eight — and the page's squad builder — read a `_role` MARK instead, which the Divide also writes for a
  combat role and never clears on a fighter it does not field again: **4 of 68 fit fighters were held out of the
  next drop by last Divide's mark, and a fighter held out once kept it — benched for good, and gone from the
  manager's squad builder.** They read the OA's spy and drill sergeant now.
Also gone: the delayed-intel queue (`schedule`/`resolvePending`), emptied every month and never filled since intel
began landing when read, and an unused random helper. Code audit 0; every gate green.

**AUDIT — THE SEVEN STATS** (`docs/AUDIT_STATS.md`, `harness/probe_stats.cjs`). Two sides identical but for one stat,
150 against 50: in a fight Aim is decisive (+18 of 40 over the control), Fieldcraft strong (+10), Resolve, Reflex
and Grit small and mostly defensive (+2 to +3), Tactics nothing measurable (−2), and **Presence nothing at all — the
fights come out identical to the control.** Presence's whole job is a third of a captain's nerve and a fame rate;
Tactics' is who captains and how well, in the Divide. A shot uses the average of Aim and the weapon's skill, and the
page never says what any stat does. Rulings asked.

**The Spy and the Drill Sergeant (asked about).** A monthly event, "[Name] Has a Talent", once per OA with a veteran:
make them your Spy (a free intel level every month) or Drill Sergeant (a free drill every month), off the line for
good, or keep them fighting. Built with the events system (Phase 2a) before any recorded session; never ruled on in
one. Once chosen the role is shown nowhere on the page. Its fate is asked.

**PRESENCE IS THE FAME STAT (ruled).** It touched one fame source (kills on the ground) and mildly (+27% at 150).
Now one rule for EVERY fame a fighter earns — kills, the Dividend, the Eight, events — three times as strong (Presence
150 earns 1.82×, 50 about 0.45×, clamped 0.25–2.5×), and fame fades slower for a visible hand and faster for an
unseen one. Same seeds, the whole fleet at 150 against at 50: **2.2× the fame earned** (1,718 against 776). The
fleet's average fame barely moves because most of it is born with a fighter and the roster turns over. The captain's
nerve share stands.

**THE STAT HOVER (ruled).** Every stat cell — sheet and roster — carries a small card on hover: *Hitting What They
Shoot At*, *Taking a Wound and Staying Up*, *Acting First, Marching Faster*, *Seeing Further, Finding More*, *Leading a
Squad Well*, *Getting Famous, Steadying a Captain*, *Holding Their Nerve Under Fire*.

**WEAPON SKILLS, STAGE 1 — A REAL SPECIALISATION (ruled).** Measured before: the median fighter's six family skills
were IDENTICAL (988 of 1,236 skill values sat exactly on Aim), every one a multiple of ten off Aim — missed by the
grain pass — nothing after birth ever changed one, and the quartermaster handed guns out blind to them. Now every
fighter is born with a trade: one strong family (+25 to +55 over Aim), a second 35% of the time (+10 to +30), one or
two poor (−25 to −50), the rest near Aim (±8), each with its own grain; where they learned leans which family it is.
Drawn from the fighter's own make-up, so nothing else about a fighter moved. Best-minus-worst within a fighter: median
79 (was 0); best families spread evenly across the six. The quartermaster now hands each kit to whoever is best with
its gun (and, for a picky role, best at its stat): **25% of fighters carry their best family, and shoot +8 over their
Aim on average** — the doctrine decides which guns are bought, which caps it: +42.6 is on the table. Prisoners' close
lean is now tested as the tendency it is (131 against 87 on average). Proofs re-recorded.

**WEAPON SKILLS, STAGE 2 — AIM, A DAMAGE CLASS, A WEAPON TYPE (ruled).** The six families ("Ballistic, Long") matched
nothing a player sees: the shop's twelve types cut across them (sidearms spanned four, scatterguns three), and energy
and ballistic guns sit in nearly every type — a real second axis. So a shot is now **the average of Aim, the gun's
damage class (Ballistic or Energy) and its weapon type (the shop's own twelve sections)**, and the store and the skills
match. Launchers take their class from each gun (three ballistic, the Plasma Caster energy). Every fighter leans to
one class and is born with a real trade across the types — median spread best-to-worst 107 — each with its own grain;
where they learned leans which types (`origin_type_leans`: prisoners to scatterguns and SMGs, mercenaries to long
rifles). **Growth (ruled):** a Divide fought teaches the carried gun's type (+3) and class (+1.5); training Aim trains
the carried gun's type and class with it. **The quartermaster** hands each kit to whoever shoots its gun best, swaps
to a better-suited gun on the rack, and — the rack having little — **buys the specialist's gun** (same tier or lower,
at most a quarter dearer, within the money and the Aleas' cap, added to a bill already drawn up): 56 bought in two
contests; the average fighter now shoots +0.9 over their Aim with the gun they carry, from −2.2. Roles are still dealt
before guns, which caps it — a born anti-materiel hand dealt a medic's role cannot carry one. **The page:** the sheet
shows *Shoots At* with the carried gun (the number a hit is decided by — the old "average of Aim and skill" finding),
both classes, the best three types and the worst two; the hiring card, *Best With Carbines 138 · Poor With Marksman
Rifles 32*. Aim in a fight: +14 of 30 over the control.

**Found verifying it (an earlier, discarded attempt at this pass had left its work in the files):** the rack swap
counted into a `stats` that does not exist at the muster, so **every contest crashed the first time a fighter swapped
guns** — unpublished, and fixed. The misplaced training block was moved back beside its own comment.

**THE SPY AND THE DRILL SERGEANT — CUT (ruled).** The result of an unauthored, generated event ("[Name] Has a Talent")
that will be replaced; something like it may come back, probably not this. Gone: the event, its three settings, the
roles' monthly work (a free intel level, a free drill), the list of role-holders (`offTheLine`), and every
off-the-line check — the drop, the Dividend, the Eight and the page's squad builder — since with no roles nobody is
held back. Fighters no longer carry a season role at all; the combat role the Divide writes (`_role`) is read by
nothing that picks a force. Before the second drop of a two-season run: 69 fit fighters, none held back.

**ROLES — TO BE REMOVED (ruled), and a design rule restated.** Roles (point, line, marksman, support, medic, scout)
were kit templates in the first upload, never discussed: the quartermaster bought and dealt kits by them; the fight
never read them and the page never named them. They go, replaced by the skill model: each un-kitted fighter bought a
gun of their best type. **THE RULE (ruled): the game is designed as if eight humans played it, and an AI OA fills an
empty seat** — a system only an AI can run, or only one human can, is a problem. Audited: `docs/AUDIT_EIGHT_PLAYERS.md`
— one human id with ~75 checks (the root), a comms window for one manager, fleet trades AI-only, devices-by-wealth
AI-only, withdrawal human-only, three decisions (Bastille remission, bids, ransoms) made inside systems by AIs rather
than handed to them as choices; events, the draft, the drop sector, media day, the Eight, renewals, sponsors, stances
and training already right. Order proposed.

**EIGHT PLAYERS, STEP 1 — THE CONTROLLER (done).** Every OA's seat is held by a person or by the engine, recorded per
OA (`state.controllers`), and every check asks that through one helper (`isHuman` in the season, `isHumanOA` in the
Divide) instead of "is this THE human?". `opts.humans` lists the seats people hold; `opts.human`, one id, still works.
The few places that still need ONE manager — the comms window's single "you" (step 6) — ask for him by name
(`theManager`, `_manager`) and are marked; fleet trades (step 4) and devices-by-wealth (step 2) are marked where they
still set a human apart. **Proved:** a full season and Divide with one human seat, fingerprinted before and after
(`harness/fingerprint_human.cjs`) — identical; the all-AI combat proof identical; two human seats run a season and a
Divide to the end. **Next, step 2 — the one quartermaster:** the 268-line planner is built on roles throughout (how
many of each kit, which items each may carry, the doctrine's spending order, medkits via the medic); it is rebuilt
around the actual fighters, keeping its economics (the Aleas' cap, the reserve for sidearms and consumables, sponsor
discounts, doctrine tastes, muster before upgrade).

**EIGHT PLAYERS, STEP 2 — ONE QUARTERMASTER, ROLES GONE (ruled; done).** The planner kits each fighter AS
THEMSELVES, for every OA, a manager's un-kitted fighters included (his hand-kit first): the cheap end of the rack arms
everyone at the muster (among guns within a third of the cheapest in stock, a fighter takes the one they shoot best);
the rack's best-for-them upgrades follow; then **the money left buys specialists the gun they shoot best, biggest
gain first, within the money and the gun allowance**. Medkits go to the best-Fieldcraft quarter; everyone else's first
consumable is the doctrine's favourite; armour, sidearms and mods by the doctrine. Devices for ANY OA whose money runs
to them (A2 closed). The founding locker spreads over the doctrine's five favourite guns. Roles are gone from the
code and the data (and the doctrines' role-ordered spending), with the Divide's 110-line role deal: each fighter
carries what was planned for them. **Measured, same seeds:** nobody unarmed; every doctrine inside the Aleas' cap;
kit bought ₡117,010 against the role planner's ₡117,060; medkit carriers' Fieldcraft 147 against the force's 105;
18% carry their best type and the average hand shoots −0.3 against their Aim (roles: −2.2). **Two tries backed out on
the way:** letting a specialist wait at the muster for the right gun reached +4.2 but let Vantis spend its whole gun
allowance arming nine people and blow the cap (and cost 45% more across the fleet); the muster's old rule — arm
everyone cheaply first — is kept. **Flagged:** the suite's "six distinct weapons" per doctrine was a number roles
guaranteed; Vantis, elite and cap-bound, now fields four across all three bands — the floor is four. Contest arc,
four contests: 0.047 / 0.186 / 0.196. Proofs and the human fingerprint re-recorded (kit changed, as intended).

**EIGHT PLAYERS, STEP 3 — WITHDRAWAL FOR ANY OA (done).** It was the manager's alone: one offer in a contest, his, and
nothing an AI OA could post. Now every OA may have an offer out (`stats.withdrawOffers`, one per OA), the field answers
each — an AI by its weighing, a person at their window — and standing down is one act for everyone (`standDown`: the
yeses become promises, `ceded` on the leaver, the winner judges each promise at the settlement, and `bought_win`
fires for each). **An AI OA leaves the way a person would:** below 4% odds with under 35% of its people standing it
posts an offer (asking more the stronger its hand), stands down a window later if anyone said yes, and below 2% on
nothing. Measured over four contests — off: 0 withdrawals, 279 dead; this policy: 4 (about one a contest), 285 dead;
a looser one (8%, half standing): 16, 250 dead — the conservative one chosen so fatality does not move (standing
instruction); loosening it is a design call. **The page:** *They Want Out* on the Withdraw tab lists the others'
offers with Promise and Refuse; the answer rides the window's orders. Proved end to end: seven AI offers reached the
manager; the one he promised left with his promise on record, the one he refused left on others' yeses with nothing
owed by him. **Caught:** the new buttons first used `data-wask`, the name the offer's own five term tiles answer to —
the handler would have hijacked a manager's terms; the withdrawal drive failed on it; renamed. Contest arc, four
contests: 0.050 / 0.175 / 0.175. Proofs and the human fingerprint re-recorded.

**RULINGS: the quartermaster is a sensible DEFAULT — hand-kitting is where a manager flexes his strategy (so its
modest gun-matching stands); four distinct weapons is the doctrine floor.**

**WITHDRAWAL IS AN ECONOMIC DECISION (ruled), AND A CORRECTION.** "An AI leaves below 4% odds" was ruled a gross
oversimplification — and it was chosen to keep a fatality rate steady, which inverts the standing instruction: fatality
is not to be CONSIDERED at all, not held still. An AI OA now weighs every window: STAYING — its odds × the pot, less
what staying costs (the people and kit it expects to lose, at its own rate blended with the field's, over the days
likely left, each at replacement value — an OA pricing its own assets, not a designer steering a rate); LEAVING — the
ask that maximises what the promises are worth (each accepting rival's odds with it gone × the share × how likely that
rival keeps its word, as the settlement judges), less the standing it loses (₡2,000 a point, ~20 points, × its pride:
showmanship and tradition). It posts when leaving beats staying, and a window later stands down only if the promises
it ACTUALLY got still do; otherwise it takes the offer back. A rival values a departure as the odds it gains AND the
losses it is spared — the leaver's share of the strength on the ground — so a big threat going is worth a hefty ask:
Nevlon, above average at 13.7% and 17 of 18 standing, asked 17%. Four contests: 7 offers, 48 answers, 6 taken back, 1
stood down. **Found doing it: the table's `oddsWithJoin` still MERGED a leaver's force into each rival** — joining's
arithmetic, fixed long ago in `makeNegContext` and never in the copy the table used — so every rival thought a
withdrawal handed it an army (79 promises in four contests). Both are `oddsWithout` now: a leaver's strength leaves the
board. The field's reply and the leaver's estimate share one reckoning.

**EIGHT PLAYERS, STEP 4 — ONE TRADE MARKET (done).** There were two: the engine's OAs traded among themselves
inside the season with the manager shut out, and his table ran in the PAGE — which even wrote the letters the engine's
OAs sent him, with the page's own dice, and recorded the snub when he ignored one. Now every offer is posted to one
market in the engine (`postTrade`) by any OA to any other: an OA the engine runs answers at once by its pricing
(`appetite`, unchanged); a person answers in their own time (`answerTrade`); a letter left unanswered lapses as its
month closes and its writer remembers (`lapseTrades`); the engine's OAs write the new month's letters to every OA, a
person's or the engine's, at `proposeFrom`'s own pace (`writeLetters`). The fleet's shopping — the thinnest roster
buying from the deepest — now POSTS an offer, and the deepest may be a person's OA, who is asked instead of being left
out (it was taken out of the pool because it used to be sold from without asking). The page reads its letters from the
market and sends its offers and answers through it. Two seasons with a manager: 2 letters to him; 6 trades among the
engine's OAs of 17 offered (4 under the old direct sales). The page drive plants its test letter through the market.

**EIGHT PLAYERS, STEP 5 — CHOICES, NOT BRANCHES (done).** Three systems decided for the engine's OAs INSIDE
themselves; now an engine seat's policy produces the same choice a person makes, and one path applies everyone's.
**Hiring:** `aiMercBid`, `aiTryoutMarks`, `aiBastilleTerm` are the old rules lifted out unchanged; every market honours
a bid, mark or term the same way (a legal term, and the money for it). **Found:** the mercenary and Bastille markets
fell through to those rules for a MANAGER who named nothing — bidding for mercenaries and offering the full sentence
for prisoners on his behalf, with his money (the Bastille's note called it "in the room like the others"). A seat a
person holds acts on that person's choices alone, as the tryouts already ruled ("an empty mark means an empty month").
One effect of the one rule: an engine seat's merc bid must now be covered by its money too — it used to check only the
asking price and bid above it. **Ransoms:** a case with two sides — the captor's price (an engine seat by `ransomOffer`,
a person at the list price) and each side's answer (an engine seat at once by its policy, a person at their window);
both yes it settles, either no or the man no longer held it closes. **Found: the manager's ransom answers were never
read** — the window processed truces only, so Pay, Decline, Sell and Keep did nothing since they were built; an engine
captor's offer to him could never be paid, and a man he held could never be sold. Read now, and proved both ways.
Four contests: 29 truces, none broken, 142 ransoms (two contests had shown 3 truces — noise, checked).

**EIGHT PLAYERS, STEP 6 — EVERY PERSON'S WINDOW (done; the eight-player audit closed).** The window served one
manager: one "you", one pause, one answer. It is now built for each seat a person holds (`viewFor`), the Divide pauses
ONCE holding every view (`seats`), and each answer is applied to its own OA (`applyAnswer`). With one person the pause
carries that person's view as before and a plain answer is theirs; several send `{ bySeat: { id: answer } }`. "The
fights since your last window" and the verdict on your last answer are kept per seat. **Proved:** with one human the
game is identical (the fingerprint); with two (`harness/probe_seats.cjs`), one pause holds both, each sees its own OA,
seat A's withdrawal offer lands on A, seat B sees it as an offer to answer and promises, and A reads the promise.

**THE QUARTERMASTER, SET STRAIGHT (found closing step 6).** A page check had failed since step 2 — the squad card
showed no medkit count — and was not run then. The card now always shows the count (red at none). Chasing it found real
faults in the planner, all fixed: the essentials (medkits, first consumables) are reserved before anyone is armed; the
muster keeps back enough to arm everyone still waiting at the cheapest price — a bare slot's floor stays held; the
purchase's two last resorts respect that reserve; medkits go first, one to each squad's best-Fieldcraft hand
(`squadOf`), then the rest of the share. **And a lesson about my own instrument:** with no human seat the Divide never
pauses, so `divideCore(...).next()` runs the WHOLE contest — measurements this session taken "at the first window" of
an all-AI run were the END state (withdrawn OAs, the dead, spent medkit charges). Loadout counts held (loadouts
persist); charge counts did not. Measured at the real drop, with a seat to pause for: all 54 squads carry a medkit
(72 carriers), nobody unarmed, shooting +0.4 over Aim.

**AUDIT — READY FOR MULTIPLAYER (networking aside)** (`docs/AUDIT_MULTIPLAYER.md`). Beyond the eight-seat rule, a shared
game needs one authority, per-seat secrecy, a way to move on when everyone has acted, resumability and seats that change
hands. Found: the page still does game work (the market prices and books its own purchases; a truce's credits, the board's
silence and the Dividend pick are applied by the page; the lock writes squads, leaders, drop and hand-kit straight into
the Divide's options; the Divide itself runs on the page); every seat's window carries the whole world (`corps`, `stats`,
`planet`, `record`) and the page holds the whole season; the month advances when a page says so, and the draft and a
ransom case wait on a person indefinitely; a contest cannot be saved or resumed, and squads, kit and pending choices live
only on the page; two randomness hazards; nothing lets a seat change hands. Already right: monthly choices clamped by the
engine, trades, bids, events, the draft, withdrawal and ransoms; an AI policy exists for every decision. Order proposed.

**MULTIPLAYER, STEP 1 — ONE AUTHORITY (done).** The page no longer does game work: `buyItems` prices and books a market
cart (it refused a cart the treasury could not cover); a truce's sweetener is paid by the engine when the truce is
struck, not by the page on its next advance; `pickDividend` keeps only the OA's own eligible fighters; `lockSquads`
records a seat's squads, leaders and hand-kit (a rival named as a leader is refused) and the engine applies them as it
prepares the Divide. **The board, for every OA:** after a contest each OA's board asks (`_board`); a person answers on
the page (`answerBoard`), an engine seat answers at once with what does its standing most good, and a question left
unanswered as the year turns is silence, charged by the engine (`beginSeason`). The boards had asked the manager alone,
built by the page. **STEP 2 — PLANS ARE GAME STATE (done).** The squad board, the month's pending focus and boosts, and
the Dividend's picks live on the seat's OA (`corp._seat`), saved with the career; `G.plan`, `G._focusSel`, `G._boostSel`
and `G._dvPick` are views onto the seat the page is showing.

**THE HOTSEAT (dev, asked for): "DEV: Super".** Before the Divide, pick a second OA and switch Super on; the contest then
runs with both as human seats. The button switches which one is played, redrawing from that seat's own view; each seat
keeps its own pending answer, and Next Window sends both at once. For the Divide only so far — the season's months stay
one seat. `harness/drive_super.cjs` drives it on the page: A posts a withdrawal offer, B sees it and promises, A reads it.

**MULTIPLAYER, STEP 3 — NOBODY ABSENT STALLS THE GAME (done).** A person SUBMITS their month (`submitMonth`); the month
advances once every seat a person holds has (`advanceMonth`), or on force — the wall-clock deadline is the server's, the
engine says who it waits on (`waitingOn`) — when an absent seat's month is simply empty: nothing is decided for a seat a
person holds. The draft waits at a person's turn and, forced, the Aleas assign the next free landing (a rule, not a choice
made for them). A ransom case a person never answers lapses after two windows. The page's End the Month submits and
advances (with one person, at once). `harness/probe_time.cjs` proves all three with two seats.

**STEP 4 — A SEAT CHANGES HANDS (done).** `setController` moves a seat between a person and the engine in the season (a
month the person already submitted stands; the Divide's options follow); a window's reply may carry `seats` changes,
and from the next window the engine plays a seat its person left and a seat a person took is in the pause. No new AI:
its policies already cover every decision, and a person's lock stands. `harness/probe_handover.cjs` proves both.

**MULTIPLAYER, STEP 5 — EACH SEAT SEES ONLY WHAT IT KNOWS (the Divide: done; the season: planned with step 6).** Every
seat's window had carried the whole world — `corps` (every OA in full), `stats`, `planet`, `record` — and the page was
trusted to hide it. The page, it turned out, already DREW only what a seat knows (its own squads; rivals from the picture
and from fights it was in); the leak was in what was SENT. Now a seat's view holds its own OA as a SNAPSHOT and every
other as a public shell (name, order, withdrawn, and how many still stand — the broadcast shows that); `stats` and
`planet` are not sent; the record is trimmed to the seat's own squads. **Found doing it: the seat's own live OA was a
back door** — its squads held `_st` (the contest's whole state, every OA in full) and its sightings held live links to the
rival squads they saw; the snapshot cuts both. Also found: **a view cannot be turned into JSON** (live engine objects
point at each other) — every view must become plain data for a network, which joins step 6. `debugViews` sends everything,
for tests that reach into the world on purpose. `harness/probe_secrecy.cjs`: eight windows, two seats, no rival roster,
squad, position or fighter id anywhere but the fights a seat was in. The game is unchanged (fingerprint and proof
identical). **The season:** the page holds the whole season state, but reads a rival for little — names and colours and
standings (public), a named fighter in a fight you watched, a history, and a TREASURY: the trade check "They Cannot Pay
That" read it on the page; the engine already says so, and the page's copy is gone. A season seat view (own OA snapshot,
rivals as public shells, the seat's intel snapshots) is built when the page stops hosting the engine — step 6.

**MULTIPLAYER, STEP 6 — THE ENGINE OWNS THE CONTEST, AND IT CAN BE RESUMED (done).** The page no longer creates or
drives the Divide: `beginContest` starts it, `answerContest` holds each seat's answer, `advanceContest` moves on when every
person has answered (or forced) and writes the reply to a JOURNAL, `contestView` hands a seat its view as PLAIN DATA (a
tree, `toPlain`), `contestResult` the outcome. The running contest lives in memory, never saved; what is saved
(`saveContest`) is where it began — the career and the season at the drop — and the journal, and `resumeContest` rebuilds
the season from that (`loadCareer` rebuilds the open year, its planet regenerated from the world's seed) and replays.
**Proved** (`harness/probe_resume.cjs`): a two-seat contest saved at window 5 and resumed from its JSON alone matched both
seats' views then, at all 13 windows after, and in the outcome. **Found on the way:** saving at the drop had always CRASHED
— the season record keeps a live reference to the Dividend's footage (combat sides point back at their units); the page
never saved there, a resumable contest must; the record now rides as plain data. And the Divide's options were a stale
snapshot of the season when it closed — a draft finished after that was missed; they are rebuilt from the season as it
stands when the contest is prepared (`buildDivideOpts`, extracted so closing and resuming build the same contest). The
page's display hooks (the battle feed) are kept in memory, never saved; the hotseat hands its second seat to a person for
the contest and back to the engine after. A saved contest is ~3 MB of JSON, most of it the career.

**MULTIPLAYER, THE SEASON'S SEAT VIEW AND STEP 7 (done; the multiplayer audit's engine work is complete).**
`seatView(state, id)` is what a server sends one person between contests: its own OA as plain data (its intel on
rivals included — it scouted that), every other OA as a public shell (name, standing at home and in the fleet, how many
people), the planet's public face with only revealed sites, and what is addressed to the seat (lot, letters, board
question, the draft as it stands). `harness/probe_season_secrecy.cjs`: 22 views over a season, plain data, rivals as
shells, no rival fighter but where the seat knows them. **Step 7:** the engine has no unseeded randomness left (the
events' cast now falls back to dice seeded by season, month, OA and tie), and the page keeps its own dice — it had
shared the season's stream, so anything it drew moved every roll after; the season's stream is carried year to year.
**What remains is the client, not the engine:** the page still renders from the whole season it hosts; in a networked
build it renders from `seatView` and `contestView`, which exist and are proved sealed.

**TWO PAGE RULINGS.** (1) **The weapon skill block, re-laid.** "Shoots At · Sidewinder PDW" read as an unclear stat and
broke the grid (it took the first cell, pushing Energy under Ballistic). It is not a total: it is the fighter's aim WITH
THE GUN THEY CARRY — Aim, its damage class and its weapon type, averaged — so it is said that way, centred across the top
of the block: *Aim With the Belt Machine Gun 60*, with a hover card; Ballistic and Energy sit side by side beneath it, and
the types in two columns, the best three down the left and the worst two down the right. The picker's rows say *Aim With
It*. (2) **The Squads picker lists the armoury only** (ruled: buying is the market's) — what the rack holds, plus whatever
a fighter has selected so it can be taken off, and a line pointing to the market when the rack holds nothing for a slot.
The page drive checks both.

**"Total Aim (Belt Machine Gun)"** is the name of the line across the weapon skill block (a stat name is not a
sentence); *Total Aim* in the picker too.

**THE MARKET — MOCK-UPS (in progress).** The Market kept its first UI: five plain slot tabs, folding type sections, one
row an item, and an open row showing a scatter of bare figures over an unauthored line. A mock-up page in the game's
layout (`outputs/market_mock.html`, real items from the catalogue) switches between three options for each of three
aspects, combinable: LAYOUT — Shelf (now), Catalogue (a type rail, the list, a spec panel for the selected item), Wall
(tiles by type with the spec on each, a compare tray); SLOT BAR — Tabs (now), Segments (glyph, slot, count), Tiles
(the slot and what the armoury holds in it); ITEM SPEC — Strip (labelled figures in a row), Card (a two-column table),
Bars (figures as bars against the slot's best). No flavour text in any of them. Narrowing down from these is next;
whatever the spec becomes reaches every other place items are shown (the picker, the sheet, the recap).

**THE MARKET MOCK-UP, NARROWED:** Wall + Tabs (the Underline look) + Bars coloured By Kind, section titles centred and
larger. Choosing it showed how little a gun IS: a power figure, one of three bands, a few tags — the rest of the tile was
the price again and the weight.

**GUNS, STAGE 1 — DAMAGE, RATE OF FIRE, MAGAZINE AND RELOAD, RANGE IN TILES (ruled; done, sidearms included).** Every
gun (52 primaries, 10 sidearms) carries six authored stats: `rof` (shots a round, 0.5–3), `mag` (rounds a magazine; a
cell-fed gun's is its cell), `reload` (rounds a reload costs), `reach` (the tiles it is made for), `near` (the tiles a
long gun is too close at) and `falloff` (aim lost per tile beyond its reach). On the grid: the rate DRIVES the tempo
(banked extra shots, the deliberate-aims-better swing and the pierce it already had; the tags decide it only for a gun
that names none); a shot comes out of the MAGAZINE, an empty one costs the reload's rounds (`tickReload` between
exchanges), and only when the spare magazines (3; a sidearm's 2; a cell-fed gun's one spare cell, where it carried
none) are gone is a fighter dry and on the sidearm — a reload is NOT dry (treating it so drew pistols across the
field); beyond a gun's reach the aim falls off per tile and inside its `near` a long gun suffers, the band step kept
for a gun that names none, and the scorer that weighs a shot against a dash sees the shot at its distance. Authored
with reaches at the TOP of each band (a medium gun 12–14, a scattergun 6, a marksman rifle 17–19, a railgun 24) so the
differences are between guns and not a general nerf: the first cut had them mid-band and cost every shot. Measured on
the same 16 fights: hit rate 19% → 15%, the four points split between the two rules working as designed (fast guns hit
less per shot, out-of-reach shots miss); half of all shots within the gun's reach, short guns firing on the way in;
contest arc 0.048 / 0.133 / 0.371. The sidearm test runs its fighters with no spares (the end of a long day). Two
snapshots re-blessed; proofs re-recorded. The page shows Damage, Rate, Magazine, Reload and Reach for a gun. NEXT:
handling, penetration and suppression; then spread and noise; then armour split by class and coverage; then the Market.

**GUNS, STAGE 2 — HANDLING, PENETRATION, SUPPRESSION (done).** Four more authored stats on every gun: `handling` (the
gun's own aim, −15 for a rotary cannon to +10 for a holdout), `snap` (aim lost shooting in the same turn as a move —
nothing had charged a moving shooter before; `stabilized` gave back twenty aim that was never taken), `pen` (the
armour a round goes through, 0–3 — the `pierce_N` tags' number, the tags kept only for a mod) and `suppress` (0 none, 1
the man fired at, 2 him and his neighbours — the `suppressive` tags' meaning, spread a little further: the submachine
guns and the drum shotgun pin). The shot scorer sees a dash's shot as the snap shot it will be. Snap was authored, then
HALVED: at full it was a general nerf, since most shots in a mobile fight follow a move. Same 16 fights: 10.9 turns
(8.9), hit rate 13% (15%), every fight still ending by a break — the new physics, kept. Suppression as a stat measured
no different from none in those fights; noted, not chased. **Found:** the price formula priced the retired tags, so it
now prices the stats at the same points (seven guns that GAINED suppression repriced by the formula, +₡130 to +₡510);
Vantis then fielded no short gun — the essentials step handed nineteen fighters its favourite consumable, the ₡3,470
THERMOBARIC CHARGE, and spent the cap (the essential is the cheapest of the doctrine's three favourites now, never over
₡300); a force of nine or more carries a gun of every band (`KIT_BAND_MIN_FORCE`); the muster takes no rack piece worth
more than a fair share of the allowance; and the specialist purchase bought a body a SECOND gun (an invariant caught it;
a body whose gun was bought swaps only for the rack). Snapshots re-blessed, proofs and fingerprint re-recorded. The page
shows Handling, Snap, Penetration and Suppression. NEXT: spread and noise; then armour split by class, with coverage.

**GUNS, STAGE 3 — SPREAD AND NOISE (done).** `spread` (0–2): the ones beside the one hit — pellets, a blast — each caught
at 0.6 of the shot's chance and 0.6 of its power (scatterguns and launchers 2, close-quarters guns and the needler 1);
logged as `spread`. `noise` (0–3): how far a shot carries. In a fight a shot reveals the shooter for the usual turns but
only to enemies within eight tiles a point — a silenced gun (noise 0: the Whisper, the Photon Marksman, the Seraph, the
needle derringer) barely past the muzzle, where every shot used to reveal to everyone at any distance; the `silent` tag
retires into it, priced as it was. On the planet a fight is as loud as the mean noise of the guns in it against an
ordinary rifle's (2), floored where all-silenced forces sat and capped above a battery of support guns (3). Same 16
fights: 8.6 turns, 46 down (36) — spread makes a close fight sharper — every fight ending by a break; contest arc 0.038 /
0.111 / 0.339; fights heard by others carry 0.11 against a rifle fight's 0.13. Snapshots re-blessed, proofs and
fingerprint re-recorded; the page shows Spread and Noise (Silenced). NEXT: armour split by damage class, with coverage.

**ARMOUR, STAGE 4 — SPLIT BY CLASS, WITH COVERAGE, AND A FULLER CATALOGUE (done).** Armour reads as what it stops against
BALLISTIC, ENERGY and EXPLOSIVE (its base and its per-class resistances, which the data carried and never showed) and
WHAT IT COVERS: torso, head, arms, legs. A hit rolls where it lands from the injury table's own odds (torso and chest 26,
arms 18, legs 18, head 10, the wounds no location owns 28) and a hit outside the armour gets none of it — a torso-only
vest covers 54% of hits, vest and helmet 64%, a full suit all. The price softly follows coverage (60% the piece, 40%
what it covers). **Thirteen new armours** join the six: Padded Jacket and Scrap Plates (T1), Riot Suit, Reflective Weave
and Blast Apron (T2), Flak Vest and Helmet, Ceramic Vest and Field Coat (T3), Kinetic Harness, Mirror Suit and Trooper
Shell (T4), Siege Plate and Ghost Weave (T5) — a ladder from ₡130 to ₡2,940 under the Assault Frame, formula-priced, no
flavour text; the old vests reprice slightly (Flak ₡460 → ₡370, Plate Carrier ₡560 → ₡450). Nine doctrines field five
different armours between them. Fight shape 9.2 turns, all by a break. Snapshots re-blessed, proofs re-recorded; the
page describes armour by class and cover. NEXT: the Market itself (Wall + Underline tabs + Bars by kind).

**THE MARKET, REBUILT (ruled: Wall + Underline tabs + Bars by kind).** The shelf kept its bones — the catalogue, the
sections by type, the cart's stepper, held counts, the boom/crash price tag, folding sections — and swapped its face:
the slots are underlined TABS on one rule with how many each holds; each type is a centred TITLE with rules either
side and a count, and folds from its title (open by default: a wall is for looking at); every item is a TILE carrying
the figures that matter for its kind as BARS against the best on that shelf, coloured by kind — a gun's Damage
(amber into red), Rate (cyan), Magazine (violet) and Reach (green); an armour's Ballistic (amber), Energy (magenta),
Explosive (red) and Cover (green) — and CHIPS for the rest (range in cyan, the damage class in its colour, pierces,
pins, spread, Silenced, Loud, Slow to Snap, what it covers, mobility, charges, traits). A tile in the cart is edged gold;
a tile opens to every stat. No flavour text anywhere on the wall. The old shelf's styles are gone; the drive checks
the tabs, the bars and chips, the fold, and the opened tile. What the spec became here reaches the picker and the
sheet next, when they are next touched.

**UNIFYING THE UI (asked for).** (1) **One way an item is described.** `itemFigures` (a piece's headline figures, each with
its kind and the best of it on its shelf) and `itemChips` (the rest, in words) are the one source: the Market draws the
figures as bars on a tile, the equip picker draws the same bars and chips under every row (its text line is gone), and
a Squads kit slot writes the first two figures in their kind's colour (*Damage 5 Rate 2*, where it wrote "Damage 5").
The old text describer, `itemDesc`, had no callers left and is gone. (2) **One tier badge** (the picker had its own).
(3) **One negative figure:** the two hand-written `cr neg` sums go through `crs`; `.cr.neg` and a second `.cr.bad`
are gone. (4) **One label:** 34 small-caps label rules had drifted across 9 and 9.5 px and five letter-spacings; all are
9.5px at .16em, the colour saying the role. (5) **Dead styles:** 123 rules for things that no longer exist — the Back
Room, the old shelf, retired event cards and more — removed, after checking none is built at run time. The drive checks
the kit slot's colours and the picker's bars. **Left for a ruling:** the Desk's folding section titles (left, chevron,
the command colour) and the Market's (centred, ruled, uppercase) are two designs for one job.

**ONE SECTION TITLE (ruled: centred, in general).** The Desk's folding sections and the Market's type titles take one
look: the name centred in capitals (14px, .18em, ink) with a rule running out either side, and the Desk's fold mark (▾
folded, ▴ open) at the right edge — added to the Market's titles, which had none. The Desk's underline is gone.

**Standing instruction, recorded in the plan:** no stage bends a number to hold a fatality rate.
The systems around death are not locked, so tuning against today's death rate would be tuning
against a baseline the next change undoes. Deaths are measured and recorded at each stage; they
are never a pass condition.

## Passive sighting, and what it revealed. *Built; measured; the finding is the point.*

**SEEING WITHOUT MEETING** (§7.6, `divide.js`). A sighting was written in three places — the
posted landings on day one, a relay mast, and CONTACT. So nothing a squad did between fights
could earn it information, and no stance could buy any: *Scout* and *Hide* were labels with no
mechanism under them. A squad now notices the squads around it at the end of a day, and whether
it does turns on things a manager decides or a captain is: **how far it marched** (a squad that
covered ground is looking at its feet — `SEE_MARCH_COST`), **the cover the other is standing in**
(`concealAt`), **how big they are**, **its own fieldcraft**, and **the weather**. A sighting is
tagged `watched` and reaches the picture, the map, the dossiers and the planner, all of which
already knew what to do with one.

**It works, and it does not yet matter.** Measured over four contests: **64–70 sightings earned
by watching per Divide**, against about 20 fights — three times as much information as fighting
produces. And the picture a manager can ACT on barely moved: foreign squads on the map at a
window 5.95 → 6.49, and FRESH ones (seen yesterday or today) **2.02 → 2.07 of seven**. The
picture was already nearly full, because twenty fights a contest write twenty sightings, and
`MAP_STALE` keeps them for eight days. Watching is currently a third helping of a meal already
eaten.

**What that tells the stance rework.** The lever is not the quantity of sightings, it is that
watching is now something a squad can CHOOSE to buy with its pace — which is exactly what the
per-squad stance needs to be worth setting. Two things must be true before it is: the picture
has to be worth more when it is fresh (a sighting eight days old should not count as knowing
where somebody is), and a slow squad must demonstrably see more than a fast one. The first is a
tuning question — `MAP_STALE` at 8 against `KNOWN_STALE` at 3 — and the second is an experiment
I have not yet been able to run cleanly: forcing every OA's stance in `probe_sight.cjs` did not
take, because `prepareDivide` rebuilds the corps from their profiles after the probe sets it.
**Recorded as open rather than claimed.**

## The Desk during a Divide, and one control instead of two. *Mocked, ruled, built.*

**THE STANCE IS THE LEANING.** A manager set a stance for the whole contest — preservationist
through death or glory — and then, on top of it, a 1–5 leaning at each rival. Two dials saying
nearly the same thing, and the second rarely bit, because an OA meets two or three of the seven
in a Divide. RULED: he sets a notch AT each OA, and the five notches ARE the five stances, read
against one OA instead of against the world. In his words: **Avoid · Wary · Engage · Press ·
All In**.

- `stanceToward(corp, id)` is the notch held toward another, falling back to `corp.policy` for
  anyone nothing has been said about; `dialsToward` gives its dials, `setStance` sets one.
- Every OPPONENT-facing read goes through it: whether two squads take a fight with each other,
  how hard a squad tries to break off from THIS enemy, whom a hunter picks, who is drawn to a
  fight they can hear, and how near a rival reads on the map (the old `leanOf`, derived from
  the notch now rather than a table of its own).
- Three reads stay on `corp.policy` deliberately — how an OA plans, how it marches, what it
  risks at the wall. Those are its own conduct rather than its attitude to anyone, so a people's
  temperament, the board's demands and the profiles are untouched.
- The AI sets the same control: its declared stance, hardened up to two notches toward the OAs
  it thinks least of and softened toward those it respects. It kept a separate leaning table
  before. A save carrying the old 1–5 leanings reads them as notches.

**THE DESK IS NOT A SPREADSHEET.** Built from the mock:
- **One strip for the day** — the day, the wall closing as a bar with its rate, your chance,
  what is standing, the weather and what it does. It was eleven figures in a line at one weight,
  so nothing in it was read first.
- **A squad is a card**, in its own colour, with the four things that decide a day: who is
  standing as pips (hurt amber, down grey), the ground, food and rounds as bars, the leader
  clickable in their own colour, the stress, and what it is DOING in words. **No buttons** — a
  squad takes no orders, and a control that does nothing is worse than none.
- **The fleet is the page's spine**: one row per OA with its mark, whether they are on you, what
  they think of you, where they stand on strength, and the five-notch ladder ramping blue →
  teal → green → amber → red. A head row sets one word for everybody and clears the rest.

Gated in `drive.cjs`: the ladder stands at every OA, a notch can be set at one alone, one word
sets them all and clears what was set at each, the notch rides into the contest and round-trips
off the corp the engine hands back, and the squads stand as cards with their ground and food.

**WHAT A NOTCH IS ACTUALLY WORTH** (`probe_stance.cjs` — the same Divide run five times, the
same ground and drop, changing ONLY the notch held toward one rival). Eight Divides:

| Toward them | Times you met them | All your fights | Your dead |
|---|---|---|---|
| Avoid | 0.75 | 14.9 | 9.50 |
| Wary | 0.75 | 14.9 | 9.50 |
| Engage | 0.75 | 14.9 | 9.50 |
| Press | 1.00 | 15.4 | 9.63 |
| All In | 1.38 | 15.9 | 10.38 |

**The hot half of the ladder bites; the cold half is nearly inert.** Press and All In roughly
double how often your people end up in a fight with that OA and cost about a body. Avoid, Wary
and Engage are indistinguishable, and a longer run put Avoid ABOVE Engage — noise, which is the
point: below the default, the notch changes almost nothing. The reason is structural and not a
bug. A meeting needs only ONE side to want it: `seek` is read by whoever is doing the walking,
and declining costs an escape roll that a hunter can beat. Avoiding an OA that is hunting you
does not work, which is honest — but it means half the ladder is a preference the contest can
ignore. **Open:** either the cold notches must buy something a hunter cannot overrule (a real
withdrawal — ground chosen for escape, contact broken at a cost in rations or a site given up),
or the ladder should be named for what it does (*Engage · Press · All In* with two degrees of
reluctance) rather than promising an avoidance the engine does not deliver. A designer's call,
recorded rather than guessed at.

## A handful from play. *Fixed.*

- **The OA wheel had walked off the screen.** Striking the constellation removed its rules line
  by line, and three CONTINUATION lines of multi-line rules were left behind — read as a
  selector, they swallowed `.hpick`, which is the ring on Negotiation and the Deal. A deletion
  by line is not a deletion of a rule.
- **A pair took two rows everywhere it was listed.** The roster, the bench, the market and the
  Squads screens list BEINGS now, and a being moves with both its bodies (`placeBoth`, `moveTo`).
- **The dark half was illegible.** A near-black on a near-black page is a smudge whatever rim it
  carries: the dark half sits at the darkest slate that still reads (#8aa0bd) against a dark
  shadow. The two halves stay plainly different; neither disappears.
- **A recruit's name opens their sheet.** The market was the one list where a manager could read
  a card and not the person; `bodyById` looks in the yard's lots as well as the roster.
- **Rest and Recovery** loses its *Whole Roster* corner — resting everybody at once is the drill
  grid's idea, and a month of rest spread over people with nothing to mend is a month spent on
  nobody — and its two columns wear their own colours: a wound is blood, stress is nerve.
- **One name for one job.** The Table is the Desk during a Divide and the Deal is Negotiation
  during one. Two names for each taught a vocabulary that said nothing about what changed; the
  surfaces stay separate and wear the name of the work.

## The Mon-Wa: one being, two bodies. *Measured, then ruled.*

A pair is generated correctly — `Bahn-Kal`, the halves named `Bahn` and `Wa` in their own right
— and then every screen read `f.name`, which is a half's own syllable, so a pair appeared on the
roster as two strangers called *Fen* and *Nan*. The hyphenated form existed, was generated, and
was dropped on the floor. Four things were measured before anything was designed:

- **Cost.** The contract was mirrored onto both records and every bill summed both: a pair cost
  **₡15,840 against a single's ₡7,920** — charged twice for the life it costs once — while
  `races.json` said `roster_slots: 1` and the generator's own note said *"one roster slot · one
  salary line · contract mirrored on both halves"*. The data and the code disagreed and the code
  was winning.
- **Kit.** Two independent bodies, two hands, two purchases.
- **Squads.** A pair takes two of eight, so eight Mon-Wa cannot stand in one squad at all — four
  pairs fill it. Sixteen bodies never reach a field; the cap already prevented it.
- **The shared wound is real and harsh.** One composure pool; a serious wound to either body
  downs the pair; and a half's death rolls bond-shock on the survivor — 60% dies, 25% retires
  brain-dead, 15% survives traumatised, auto-downed for the rest of the fight, scarred and
  renamed with the widow affix.

They already paid double, occupied double, and carried the worst downside in the game. RULED:
**one roster slot, one salary line, one hand of kit — and two bodies in the fight.** The
mirrored half is flagged (`contract.mirrored`, `mirror_of`) and skipped wherever money is
counted (`ledger.paid`) and wherever kit is priced; a hand set on one half mirrors to the other,
so the pair fights with two guns bought once. The distinctive combat model — two shots, one
nerve, one wound track, the tether, the separation penalty, bond-shock — is untouched, which is
what the alternative (collapsing them to a single unit that fires twice) would have thrown away.

**ONE SEAT, TWO BODIES.** Ruled after the above: a pair holds a SINGLE place in a squad, so
eight Mon-Wa can stand together where four pairs used to fill it. Seats are counted, not bodies,
wherever a squad is measured — the page's cards, the move buttons and the placement rule
(`squadSeats`), and the engine's own dealing (`seatsOf`, and a deal that never closes between two
halves). A squad card reads *6 of 8 · 8 Bodies* when pairs are in it. The counterweight, a
jumping-off point and not a settled number: **grit −4** (which is also fewer hit points a head,
through `hpFor`), **reflex −1**, **resolve −1**, on top of the existing aim −1 — measured, a
Mon-Wa body now averages grit 45 and 9 hit points against a human's 85 and 10. Two guns in one
seat, thinner and easier to put down, still sharing one wound track.

**Eight seats of Mon-Wa against eight humans** (`probe_monwa.cjs`, 200 engagements, same kit,
same ground). Sixteen bodies against eight:

| | Mon-Wa | Humans |
|---|---|---|
| engagements won | **121** | 76 (3 even) |
| seats still standing | 3.69 of 8 | 2.57 of 8 |
| share of the side out of action | 54% | 68% |
| dead per engagement | 0.39 of 16 | 0.42 of 8 |

**They win about 61% of them** — a real edge, not a rout, and it is bought with volume rather
than quality: their share of the side lost is lower than the humans' because half their bodies
are spare guns on the same seat. Note what the wound track does to the shape: the DEAD are
almost identical (0.39 against 0.42), because a pair goes down as a pair before either half is
killed — they are put out of the fight quickly and rarely killed. The one-seat ruling and the
lean (grit −4, reflex −1, resolve −1) are a jumping-off point and read as slightly too strong at
even numbers; the lever to reach for first is grit, since it is also their hit points.

**One seat, one portrait.** A squad card drew a tile per BODY, so a pair took two of the eight
places on screen while holding one. The mirrored half rides in its partner's tile.

**A pair is never split.** A trade that moved one half and left the other made two halves of
nobody: whoever is named brings their partner across (`trade.execute`), and a pair is priced once
at the table (`netOf` skips the mirrored half). Guarded in `drive.cjs`: no half of a pair is left
behind by a deal, and the deal-plumbing check trades singles so its one-for-one arithmetic still
means what it was written to mean.

**The name reads as one word in two tones.** Both halves carry `pair_name` and `pair_halves`, and
every screen that printed a bare name now prints the pair's (`displayName`). One half is pale and
one dark: literal black cannot read on a near-black page, so the dark half is drawn in the
deepest blue that still holds and given a faint pale rim, the pale half in the race's own white,
with the hyphen between them as the join.

## The wages were never paid. *Fixed, and the surplus is now a tuning question.*

The money has been deferred as a balancing matter for a long time, and nothing had ever read the
books end to end. `sim/measure_economy.cjs` does. It found two costs the game COMPUTES, RESERVES
AGAINST, DISPLAYS — and never charges:

- **THE WAGE BILL.** `wageBill` has existed since the ledger did. `procurementBudget` subtracts
  it before deciding what an OA may spend on kit. The Roster prints it as *The Wage Bill*, in
  red, monthly. **No line was ever posted for it.** The single largest cost of running a
  corporation was a number on a screen.
- **THE ALEAS ENTRY FEE.** `ALEAS_ENTRY`, forty thousand, *what it costs to be in the Divide at
  all* — reserved beside the wages and charged to nobody. **An OA entered the Divide free.**

Measured before: a prep year cleared **+₡162,428 on average**, against **₡103,504 a year** in
costs that existed only as arithmetic. Every scarcity the Market, the Paper, the sponsors and the
kit cap assume was a fiction — and every balance pass measured against them was measured against
a false constraint.

Wages are posted monthly, for everybody on the roster; the entry fee is taken at the lock from
every OA that is going. A year now nets **+₡97,012** on the same seeds.

**THAT IS STILL A SURPLUS, AND IT IS NOW AN HONEST ONE.** The books balance and the dominant term
is visible: **the gate at ₡158,864 a year** against a wage bill of sixty. Whether an OA should
clear a hundred thousand for eleven months of preparation is a RULING, and it is one that can
finally be made against real figures. The instrument fails outright if either charge ever goes
missing again.

## Eight quirks, and everything else deleted. *Ruled.*

**THE REBUILD HAD GROWN BACK INTO THE THING IT REPLACED.** Forty-eight quirks, and several of the
last dozen were revived old names carrying hooks that do nothing — Odds Watcher with no odds
board, Mimic Call with no comms layer. The point of starting again was to start SMALL and grow
from working parts; instead the catalogue reached its old size in four sessions and smuggled the
old fault back in with it.

**EIGHT. Every retired trait DELETED, not parked.** Steady Hands and Hard to Kill (general, +15),
Armchair General (defining, +40 Tactics / −15 Aim), Close Company, The Captain's Man and Fights
Hurt (situational), Bleeder (the negative), Born Captain (command). The eight RACIAL traits stand
apart, as they always have — they are racial identity, not the pool. *The catalogue is 16 entries
where it was 110.*

Cutting it exposed what the small book leaves unused: **43 hooks the engine reads that no quirk
asks for.** That is not a fault, it is the deliberate state of a book meant to grow — so the
suite REPORTS it every run rather than failing on it, and the failing half of that check is kept
for what it was really for: a hook name the resolver reads that is spelt like nothing at all.
Two different things had been wearing one name.

## Presence does two things now. *Ruled and built.*

It was copied onto every combatant and read NOWHERE in the fight; outside it, thirty-five per cent
of one captain's nerve and nothing else. A stat on every sheet, raised by training, bought by
quirks, and worth almost nothing.

- **THE CROWD NOTICES SOME PEOPLE MORE.** A hand the crowd can see earns fame faster for the same
  work — a little under his share at the bottom of the scale, half again at the top.
- **AND A STEADY MAN STEADIES THE ONES AROUND HIM.** A captain's nerve was his own resolve and
  presence; the squad he stands in had no say in it. The strongest presence among the others
  lifts what the captain can hold together, which is what a squad's steadiest hand is FOR.

## Keshu is a planet, not a people. *Fixed.*

**KESHU GRUDGE TESTED FOR A RACE THAT DOES NOT EXIST.** It looked for somebody of race `keshu`
in the squad — and Keshu is the WATER WORLD the Attorak and the Gil fought over for fifty-five
years before the Opes Arx brokered the peace. The trait is race-locked to those two, and the
friction is between THEM: an Attorak who never signed the peace standing beside a Gil. As written
the condition could never once have been true. It fires now, and 18% of squads hold both sides of
that war.

**AND THREE TRAITS SAID "CHARACTER, NOT MECHANICS" OVER MACHINERY THAT WAS FIRING.** Both
Et-y-Bellum faiths and the Pressure-Read psion carry no stat change and only hooks — and the
tooltip's word table did not know those hooks, so a trait worth **+8 morale at the drop and −5 if
the claim is sold** read as flavour. Twenty-three hooks have words now, every figure READ OFF THE
ENGINE rather than invented: the surge is 4 or 8 because `divide.js` says 4 or 8.

The harness fails if any trait a hand can carry has no words for what it does. It passed at zero,
which is the number it should stay at — the failure this catches is not a bug, it is a trait
quietly lying to the person reading it.

## The broadcast script writes for an idea, not an id. *Built.*

Retiring the old catalogue silenced **twenty-four of the scout report's authored lines at a
stroke** — good writing, quietly unreachable, because each is keyed to a trait NAME. The copy was
never the brittle part.

Ten of those names are rebuilt as quirks so their lines fire again — Gallows Humor, Kier
Hardened, Superstitious, Battle Joy, Crowd Darling, Villain Edit, Camp Cook, Thrill Seeker,
Homesick, Clause Reader — and **eight more lines are re-pointed at the quirk carrying the same
idea now**: a hot head is Hot Blooded, a tradition keeper is a Company Man, a cull-tempered hand
is Hard to Kill. **Twenty-eight of thirty-four lines can fire.** The pool is forty-one.

**AND THE DEBT IS CLOSED: ALL THIRTY-FOUR LINES FIRE.** The last six ideas — Odds Watcher, Mimic
Call, War Priest, Union Tongue, Aleas' Favorite, Bad Omen — are quirks now, so no authored line
in the scout report is unreachable. `audit_quirks.cjs` still names any that fall out of reach
without failing on them: a line that cannot fire is a debt, and a debt nobody can see is a debt
that rots.

Three of those quirks carry hooks that are DECORATION and now say so in the data — there is no
odds board for an Odds Watcher to read and no comms layer for a Mimic Call to spoof — so each
pays in stats instead, and the hook is labelled where it sits rather than left looking wired.

*And one more of the old book's hooks turned out to be granted by nobody:
`field_treatment_bonus`, read in the fight where a hand treats a wounded squadmate. Rather than
delete a working line, it has a quirk: **Steady Under the Lamp**, who has stopped more bleeding
in the field than most medics manage in a bay.*

*Reviving ideas from the old book left three of its hooks granted by nobody —
`seen_worse_composure`, `composure_up_as_intensity_rises`, `volunteers_for_risk` — and the
suite's ghost check caught all three. The answer again was to give the rebuilt quirk the
machinery already wired for that idea rather than to delete working code. That is the third time
this pattern has paid: a rebuilt quirk should reach for what exists before it grows its own.*

## Seven placeholder moments, and they say so. *Built — not authored.*

Every rebuilt quirk carries a `story` naming what an event could hang on it, and until now those
ties cast NOTHING: a narrative half that was a promissory note. Seven stand-ins fill it, one
shape filled from a table (`MOMENTS`) — a slight in the mess, a wound off the books, an armband
that went elsewhere, a caller at the gate, a rookie who came good, an offer never mentioned, a
shot the fleet is still talking about.

They CAST BY TIE, so they follow the catalogue: rewrite the quirks and these find whoever answers
instead. Measured over three fleet-years they are a real share of a month — 47 quirk moments
against 20 raises and 24 fleet notices — and each fires once per hand per career.

**WHAT THEY ARE NOT IS AUTHORED, and the source says so in as many words.** A real event has a
situation with more than one honest answer and a consequence that lands somewhere a manager will
feel later. These have two answers and a small immediate cost: enough to prove the wiring, not
enough to be the writing. Replacing one means rewriting a ROW, not touching code.

**AND THEY DREW PERFECTLY AND ANSWERED NOTHING.** Pushed into the pool AFTER the id index was
built, every one of them displayed, offered its two options, and then resolved to `null` — the
answer path looks a spec up by id in `BY_ID`, and `BY_ID` had been built from the pool as it
stood a moment earlier. An event that draws but cannot be answered is the worst of both: it looks
like content and is furniture. `audit_quirks.cjs` now fails on any spec in the pool the answer
path cannot reach.

## The sheet says what a quirk does. *Built.*

The catalogue was rewritten to be FELT, and the one screen that explains it was still reading the
old field. `quirkText` walked `stat_mods` and the hook table — so every rebuilt quirk, carrying
thirty points and a condition, showed **"Character, Not Mechanics"**. The player could not see any
of the work.

It reads the new shape now: flat points, then what a quirk is worth and WHEN, then any machinery
a hook carries. And the conditions are said the way a manager would say them — *In a Squad of
Four or Fewer*, *With Their Captain on the Ground*, *While Carrying a Wound* — because a screen
that prints `squad_at_most_4` is a screen written for its author. A chip now reads:

> **Gallows Humour** — +25 Resolve, +15 Presence — While Rattled · Loses 40% Less Composure

*The old `stat_mods` is printed ×10 here too, since that field is in tenths; the one screen that
showed those numbers had been showing a tenth of the truth.* The harness fails if any quirk in
circulation carries nothing the sheet can state.

## Do the quirks actually bite? *Measured, and the probe was wrong twice.*

The old catalogue's failure was never that it was badly written — it was that most of it never
did anything a manager could feel. **A rebuilt quirk naming a condition the game does not reach
is the same failure in better prose**, so `sim/measure_quirks.cjs` fields real fleets and counts
how often each condition is TRUE at the moment a body is made, and what each quirk is worth in
points when it lands.

**IT REPORTED THREE CONDITIONS AS NEVER REACHED — AND IT WAS THE PROBE, NOT THE GAME.** It called
`buildCorp` with no persisted drop, and without one the squad sizes fall to the `[8,8,8]` default:
so every squad it measured was eight or more, and `squad_at_most_4` looked impossible. Built the
way a season builds them, **a quarter of all bodies are in a squad of four or fewer**. The probe
was not looking at the game.

**AND IT FLATTERED EVERY QUIRK.** It summed a body's whole situational total and credited it to
each quirk that body carried, so Close Company read 9.0 points on a condition firing 0% of the
time — a measurement that flatters is worse than none. Each quirk is now weighed alone.

Corrected, every condition comes true and every quirk earns: `with_their_captain` 81%,
`squad_at_most_6` 75%, `squad_at_most_4` 26%, `hurt` 18%, `rattled` 16%, `is_captain` 19%. The
Captain's Man is worth 35 points when it lands, The Conscript's Friend 30, Slow Starter 30, Close
Company 13. The gate FAILS if the catalogue is ever allowed to name a condition the game never
reaches.

**AN EVENT ASKS FOR A TIE, NOT A TRAIT ID — and the story half is functional now.** Five events
cast their subject by NAMING a trait (`hasQuirk(f, 'hot_headed')`), and the moment those traits
were retired all five went quiet with no error anywhere: the event stayed in the pool, drew its
turn, found nobody, and did nothing. A name in a script is a hard edge against a catalogue meant
to be rewritten.

Every rebuilt quirk carries `story.hooks_into` — the things an event could hang on it — and
`castFor(state, corp, tie)` returns whoever in the OA has a quirk answering to it, whatever
that quirk is called this year. *A fight in the barracks* finds the Hot Blooded man; retire him
and write a different one, and the event follows. The `story` fields were documentation until
this; now they are the casting call, which is the difference between a field that claims
something and a field that does it.

`audit_quirks.cjs` refuses an event that casts by a name the catalogue no longer deals, and
refuses a tie no quirk in circulation answers. It caught two the moment it was written — a
stranded `hot_headed` and a tie nothing could answer, which is why *War Debt* exists. IT ALSO
CAUGHT ITSELF: the first cut read the example inside the comment explaining the check and
reported its own documentation as a fault, so it reads the code with the commentary stripped.

**ONE RED WAS A CHECK, NOT A FAULT.** The Divide's squad panel read *Alpha · None · 0d · Nobody
Leading*, and the harness called it a failure — but the squad had been KILLED TO THE MAN, and
saying so is the panel working. The check demanded a clickable captain on every squad, so the
moment a manager's last squad was wiped a correct reading failed. It asks for a reading now: a
captain and how he sees it while anybody is alive, and plainly nobody once they are not. (It also
required the word *Leader*, which is a COLUMN HEADER in that table and would have matched
whatever the squads did — a clause that could never fail is not a check.)

## A people's name in their own colour. *Built.*

The nine have distinct colours now, and the one function that spells a race out — `capRace` —
was printing it in the surrounding grey. So the colours reached the marks, the discs and the
grid, and never the WORD. One function, so every caller gets it: the roster row, the prospect
card and the sheet.

**AND THE SHEET NEVER SAID WHAT A MAN WAS.** It carried his squad, his stats, his kit and his
paper, and not the one fact that decides how he moves and what he can do on the ground. It says
it now, in the people's own colour, beside his age.

## Nothing is destroyed by making the window smaller. *Ruled and built.*

`harness/audit_resize.cjs` reads the stylesheet and reports EVERY rule inside a width query that
hides, removes or zeroes an element, plus every rule that lets pinned chrome wrap again. It found
three things, and one of them was itself:

- **THE MENU DELETED TWO THIRDS OF ITSELF UNDER 720px.** The side portraits were `display:none`,
  so dragging a corner did not shrink the stage, it removed it. All three survive at every width
  now: they shrink, the gap closes, the outward lean comes in, and a narrow window is a SMALLER
  TRIPTYCH rather than a different screen. A short window is handled too — the portraits give up
  height before the words do.
- **THE HEADER WAS PINNED AND THEN UNPINNED.** The base rules hold it to one line; a later media
  block set it back to `flex-wrap:wrap`, which is how a narrow window "moved" the clock and the
  purse onto a second row. A rule that undoes a rule is worse than no rule, because the first one
  reads as a promise.
- **`.mocknote` HID AN ELEMENT THAT DOES NOT EXIST** — a breakpoint rule for a class used
  nowhere. Removed.

AND THE PROBE LIED ON ITS FIRST RUN: `width:0` matched inside `min-width:0`, so it reported the
menu column as destroyed when it was being told to shrink. The pattern is anchored now. A check
that cries wolf is worse than the fault it hunts, because the next real finding is read as noise.

## Ththyn, and nine peoples who look like themselves. *Ruled and built.*

**THE RACE WAS SPELT `Thythyn` IN ALL 354 PLACES IT APPEARS**, including the data key every
fighter in every save carries. It is **Ththyn**. The rename covers the id and the display name,
and a save written before it is carried forward on load — renaming the key alone would have made
every fighter in an existing career a race the game no longer has: no colour, no hooks, no
flight. *The rename also caught a filename: `viewers/art/menu_thythyn.webp` is in the build's ART
list, so the page came out 84KB light with a portrait missing before the file was renamed too.*

**AND THE PEOPLES WORE ONE MUDDY PALETTE.** Every race sat between slate and olive — a swamp of
near-neighbours hard to tell apart on a grid, saying nothing about the people wearing them. The
ruled colours: Attorak BROWN, Etu GREEN, Gil PURPLE, Human TAN, Kellis BLUE, Mon-Wa WHITE
(against black), Olmac GRANITE, Svalbard GOLD, Ththyn LIGHT PINK. Each is pitched clear of the
OAs' eight banners and the suppliers' eight, so a race never reads as somebody's flag, and the
radius is untouched — that is build, not colour.

BROWN AND PURPLE HAD TO BE LIFTED. At their honest values (`#8a5a2b`, `#8b4fc9`) they came to
3.3 and 3.7 contrast against this page's background, where a name in either is a smudge. They are
the same hues carried up to about 5, which is where they read.

## A wound is a condition, not a countdown. *Ruled and built.*

**`days_remaining` MADE A WOUND A NUMBER WATCHING ITSELF RUN OUT.** A minor wound was eighteen
days against a thirty-day month, so a manager could ignore it entirely and it healed itself in
half a turn — and a countdown only matters at all if it outlasts the year. Worse, the monthly
pass gave every fighter THIRTY POINTS OF HEALTH a month unconditionally, on the very field a
wound's severity lived in.

A hand carries a CONDITION, 0 to 100. It mends barely at all on its own (`WOUND_DRIFT` 1.6 a
month) and FOCUS IS WHAT MOVES IT (`WOUND_FOCUS` 14 a full block). Two ruled cut-offs beneath
whole:
- **SERIOUS (below 66).** Working a month without care costs him stress he would not otherwise
  carry, and he is not put in front of a crowd at the Dividend.
- **CRIPPLING (below 33).** He cannot drill at all — focus painted on him is not lost, it simply
  does not learn — he carries the month far harder, and EVERY STAT GOES DOWN A LITTLE,
  PERMANENTLY, for each month nobody helps him. Ignoring a broken man is a decision now.

The injuries list survives for WHAT the wound is — the flavour, and the permanent ones — and the
number is the state. TWO PLACES WERE STILL ASKING THE LIST: the Dividend barred anybody whose
list was non-empty, and the list no longer empties, so a man once hurt was barred for ever.

**AND BOTH REST TRACKS READ ON ONE SCALE**, with stress running backwards: a wound shows its
percentage and its band, green whole through to red crippling; stress is green at nought and red
near a hundred. **A CHEVRON IS A CONTROL, SO IT IS THE SIZE OF ONE** — every fold on the page was
a glyph at body size, twelve pixels of triangle to aim at; they are all a 28×26 target now. And
the opening reading's headcount is RED until it can field a drop.

**FIVE FIXED BRACKETS OF TWENTY, NOT A RELATIVE READING.** The first bands were 80/55/33, which
put a stress of 23 and one of 42 in the SAME COLOUR and left a manager guessing where the lines
were. The scale is the plain one the eye expects — 0-20, 21-40, 41-60, 61-80, 81-100 — green,
light green, grey, light red, red, and ABSOLUTE: a stress of 42 is the same colour on every
screen in every year, because what a hand can bear does not depend on who he is standing beside.
And the founding stress was raised (4..34 → 14..52), which had left almost everybody in the
settled end and given the calm side of rest as little to do as the physical side had.

**A CONTRACT SAYS WHICH PERIOD ITS FIGURES ARE FOR, AND HOW LONG IT RUNS.** The wage bill above
and every salary below are MONTHLY and the Paper's are a year's, with nothing to tell them apart
— they carry `/year` now. And every renewal ran two seasons whatever the man was, which makes a
Natural-Born's paper identical to a mercenary's.

**THE TERMS ARE RULED IN `recruitment.json`, AND I INVENTED THEM INSTEAD OF READING IT.** I wrote
nattie 3, mercenary 2, prisoner 1 into a constant — three numbers beside a file that already
said `seasons_range`: **NATTIE 3–4, PRISONER 2–4, MERCENARY 1–1**, with a note against the
mercenary reading *a merc contract is ONE Divide; extension is a fresh agreement at next year's
market, never a multi-year*. So the one I got most wrong was the one the data warns about in
words. A renewal now reads the range off the data through `ROSTER.seasonsRange`, and the Paper
names the term.

`sim/audit_docs.cjs` FAILS IF ANYTHING RESTATES A RULED RANGE as a constant again — proved by
putting one back and watching it catch. A constant that restates a data file is a second place
for it to be wrong, and this is the second time that has cost a session.

**`crs` WRAPS ITS OWN GOLD SPAN**, so putting the wage bill in a red parent coloured the minus
sign and left the figure gold — a red dash in front of a gold number, which reads as a typo
rather than a cost. The negative form of `crs` is red throughout.

*Not yet measured: the drift, the focus rate and the decay are ruled numbers, not fitted ones.
What a month of neglect should actually cost wants a measurement pass of its own.*

## The Paper, and a name that means one thing. *Ruled and built.*

**`--bad` IS NOT RED. IT IS AMBER** (`#e0a848`), within a few points of the gold `--cred` it was
meant to contrast with — so `.cr.neg`, the class every loss in the game wears, has been painting
money leaving as a CAUTION rather than a cost. The wage bill was the case that showed it. Losses
are `--red` now.

**THE PAPER SHOWS A YEAR, BECAUSE A CONTRACT IS FOR A YEAR.** *Was / Asks / A Year* showed the
same wage twice — once a month, once times twelve — and left a manager to work out which was
which. And it was the last screen still saying *Nattie*: the page has said Natural-Born since the
origins were named, and each origin now wears its own colour here as it does everywhere else.

**AN OFFER IS A NUMBER A MANAGER CHOOSES.** It was one button at one fixed step below the ask, so
haggling had a single answer. He types a year's figure, and **A MAN WEIGHS IT AGAINST WHAT HE
THINKS OF THE OA**: the further under his ask, the likelier he walks, and a hand who likes it
here will swallow a cut that one who does not would walk over (`HAGGLE_LOYALTY`). **AND A OA
THAT PAYS OVER THE ASK IS REMEMBERED FOR IT** (`OVER_ASK_LOYALTY`) — nothing a manager could do
at this table had ever moved a man's regard for him, and being paid more than he asked is the
plainest thing that would.

**AND A NAME MEANS ONE THING NOW.** On the Roster and in the Squads a fighter's name opens his
sheet; in Training it opened a FOLD, which is two meanings for the same word on one screen. The
chevron folds the hand — given a 26-pixel target, since it is the only thing that does it — and
the name opens the sheet, through one delegated listener that serves any name the Desk prints.
Names are centred in the Paper and in Training, as they are on the Roster.

## An event is the one thing on the Desk that must be read. *Built.*

**A NAME, NOT A STAT SHEET.** An event that mentioned somebody unrolled their ENTIRE sheet across
the width of the screen — a rectangle the length of the page to carry one line about one person.
The subject is a mark, a name and a rating now, and the name opens the same side panel every
other name on every other screen opens.

**AND THE CARD WAS DRESSED AS FURNITURE.** The copy sat in the same receding dim as every aside
on the page, inside the same quiet grey border as every box, so THE ONE ITEM THAT STOPS A MONTH
looked like something to scroll past. The copy is set in the reading colour and the card is ringed
in its own kind's colour — the same hue its left edge already carried — with a soft shadow under
it. An answered event goes back to grey, because a thing already dealt with is furniture again.

## A window that signed the whole sheet on your behalf. *Fixed, and three others with it.*

**ENDING THE NATURAL-BORN MONTH SIGNED EVERY NATTIE ON THE SHEET.** `runTryouts` has a
fall-through for an OA that marked nobody: it calls up its own ship to fill out toward the drop
floor, which is right for the seven OAs nobody is running. THE MANAGER'S OWN CORP FELL THROUGH
IT TOO — and a founded OA opens eleven under the floor, so an unmarked month signed the entire
sheet on his behalf and billed him for it. The state has known which corp is the manager's since
the founding (`opts.human`); the tryouts never asked. A manager's sheet is his, and an empty mark
is an empty month. Measured: his roster holds at 21 across both window months while an OA
nobody runs still goes 21 → 23.

**THE ROW PIPS IN REST AND RECOVERY PAINTED BOTH TRACKS AT ONCE** — a third control doing what
the two beside it already do, on a line where a manager had no way to know that. Wounds and
stress are what rest answers; they are what a manager paints.

**A FLEET THAT HAS RUN THE DIVIDE FOR YEARS DOES NOT OPEN UNMARKED.** Every hand began at full
health with no stress, so Rest and Recovery had nothing to do for a whole first year — an entire
verb idle because the world was born yesterday. A founding roster carries last year's ground: one
serious wound, two minor, and a year's wear as stress on everybody, heavier on the hurt.

**AND THE MONTH'S MONEY READS DOWN NOW.** The total went from the head to the foot and took the
opening purse with it, so the foot read *The Month ₡210,000 → ₡219,594 +₡9,594* — the whole sum
crammed into one line under the one line it summarised. What you had, then every line that moved
it, then what you have.

## The quirks, and a lookup that answered no in silence. *Ruled and built.*

**FIRST, THE COUNT WAS WRONG, AND IT WAS MY SCAN THAT WAS WRONG.** The sweep for inert hooks
listed `rep.js`; the file is `reputation.js`. ELEVEN hooks reported dead were already live —
`media_statement_impact_amplified` among them. A scan with a hardcoded file list is a scan that
lies quietly, which is the same fault as everything else in this section. `sim/audit_hooks.cjs`
reads the directory instead, and is now a gate.

**AND THE FAULT UNDER ALL OF IT: `fighterHas` ANSWERED NO IN SILENCE.** The one reader for "does
this hand carry this hook" resolved its trait index from a variable installed inside `stepMonth`
— so every hook read BEFORE a month had been stepped answered FALSE. Not wrongly: quietly, with
no error, which is the worst way for a lookup to fail. It was suppressing `poach_resistant`,
`loyalty_cap_reduced` and `remembers_grudges` on any Review-screen read in a fresh career. It
builds its own index now — and THE FIRST FIX FOR IT REACHED FOR `require`, which does not exist
in the page, so the simulator was cured and the browser went on answering no. The fallback takes
the roster's index, which both OAs have.

**WHAT WAS BUILT, all of it on machinery that already existed:**
- **LOYALTY DECIDES SOMETHING.** It was carried by every fighter and read in three places a
  manager could never see. A hand who likes the OA asks less to stay: measured 824 against
  1,176 for one who does not. `loyalty_cap_reduced` is a consequence of that, not a system —
  a man who cannot be fully loyal never reaches the discount.
- **THE GRUDGE IS ONE FIELD.** `f._grudge` holds the single OA that tried to buy him, set at
  the poach. Three readers: the merc market refuses that OA, the Divide gives him composure
  against them, and the mark rides onto the ground with him. The first design was a
  fighter-to-corp relationship matrix; a man remembers one OA.
- **SIX STORY HOOKS ARE ONE MULTIPLIER** on `REP.act`, which already computed the whole swing in
  one place. The loudest name among a casualty list carries the notice.
- **LUCK IS ONE MORE TERM** in a draw already weighted by who an OA carries.
- **PROMOTION LANDS ON PEOPLE** at the succession that already happens when a captain falls: the
  hungry steady, the passed-over take it badly.
- An OA that pays its dead well is seen to; a war-priest is called one.

**AND SIX HOOKS ARE LABELLED DECORATION IN THE DATA, WITH THE REASON.** Superstition wants a
squad-belief state, Odds Watcher an odds board, Mimic Call a comms layer, Pressure-Read a manager
to read, Cradleborn a harvest economy, and Ankoth a discovery path for a concealed conviction.
None is a hook awaiting wiring; each is a hook awaiting a FEATURE, and saying so in the file is
better than leaving a trait that quietly does nothing.

## A shelf that folds, and Back Room that costs something visible. *Ruled and built.*

**THE MARKET'S SHELF FOLDS AND RUNS IN TWO COLUMNS.** Every rack stood open, one row to a line
across the whole width, so a manager scrolled a mile of half-empty rows to reach the rack he came
for. Racks are SHUT until asked for — the same fold the Desk's grids use — and a rack's rows are a
TWO-COLUMN GRID. The first cut used CSS multi-column with the section heads spanning all of it,
which balances by height, breaks where it likes, and with one rack open put everything in the
first column and left the second empty. A grid says what it means: each row is a cell, each head
its own full-width line, and the shelf is half as tall. The slot picker wears the rail's clothes: it was
five grey `tiny` buttons doing the job the tabs at the top of the screen already do.

**AND THE BACK ROOM: the cost was real and invisible, which is the same as absent.** An act
DOES bill the treasury, DOES cost standing at once, and DOES raise the risk of the next one
(`RISK_PER_ACT` against everything done that year) — but nothing on the page said any of it, so a
manager could have the same official bribed four times in an afternoon and read the whole thing
as free and pointless at once. **ONE THING ARRANGED IS ARRANGED**: an act cannot be repeated in
the month it was taken, and the button says so. The risk it added still stands for the year.

**AND THE YEAR'S LIST BELONGS TO THE MONTH'S RECAP.** *Quiet Word · M1 · Came Apart* was a data
dump sitting under the things a manager might arrange NEXT, reporting each outcome the instant it
landed. A month's work is read when the month is read, in a sentence: what was asked for, and
whether it held.

## A centring pass, a shop behind the shutter, and hands that carry the locker. *Built.*

**TITLES BELONG OVER WHAT THEY TITLE.** Window heads, squad names and the plan's figures all
began hard against the left edge of a panel centred around them, which reads as a form rather
than a board. A head's name centres and anything riding beside it (a kind, a count) sits out at
the edges where it does not fight it. *The Paper* lost its *Answered This Month* chip — the
month is the only time it appears — and the Kit Cap is centred and larger, since it is a figure
a manager checks rather than reads past.

**THE FOCUS TALLY IS ABOVE BOTH GRIDS, IN THE MIDDLE** — and the first attempt put it INSIDE
the left column of the two-column grid, which centred it over training and rest and sat it off
to one side of the screen. That was worse than the corner it came from, because it now looked
deliberate. It is a sibling of the grid, spanning the page. It says how much is committed in a
colour readable across the room: RED while any is unspent, GREEN when it is all in.

**A SHUT WINDOW SHOWS THE SHOP BEHIND THE SHUTTER.** It said *No Signing Window · Next:
Natural-Born, Month 2* — true, and it left a manager with no idea what was coming or why to
care. The window that IS next stands there in its own colour, closed: its people on the sheet,
greyed and untouchable, with a plate across them naming the window and the month it opens.
AND THE FIRST CUT SHOWED AN EMPTY ROOM BEHIND THE SHUTTER: a window's people were drawn the
month the window OPENED, so there was nothing to peek at. `ensureLot` draws the NEXT window's
sheet as soon as this month begins, from the same seed it would have used — the same people
arrive, only the moment they become visible has moved. A manager can want somebody a month
before he can bid.

**AND A FOUNDED OA'S HANDS CARRY ITS LOCKER.** An OA opened with people and a rack of kit
and NO CONNECTION BETWEEN THEM — every fighter walked around unequipped until a quartermaster
ran at the drop, which for a founded OA meant seven veterans of last year's Divide standing
about with nothing on them. They are issued from the shelf at the founding, best first, and what
they take comes off it: the first hands get a rifle, plate and a pistol, the last get a rifle and
what is left, which is what a thin locker should look like.

**SMALLER:** *Months 1–11 · The Preparation* is gone from every page — the clock beside it says
that already. The dev control is labelled **DEV: Skip to Lock** and sits under the year line
where every tab can reach it. The tab rail and the header HOLD THEIR LINE and scroll rather than
reflowing onto a second row, which is how a website behaves and not a board. And the first month
of a career TAKES STOCK rather than saying *Table Closed*. The first attempt at that was a
sentence — *A Fleet Already in Play · The Books Are Yours Now* — which was no better, because
prose is not what a manager wants in the one place that should tell him where he stands. FIVE
FIGURES, each one a thing he can act on in the months ahead: the hands he has against the drop
floor, how many are mending, how many are worn down, what the rack holds that nobody is carrying,
and what is in the bank. Nothing there is simulated history; it is what he is holding, counted.
A reading of a lean founding: 7 of 16 on the books, 3 mending, 5 worn down, 4 spare pieces,
₡210,000.

## Width and height work on the shape as it looks now. *Built.*

SVG applies a transform list RIGHT TO LEFT. With `rotate` written before `scale`, the stretch
was applied FIRST — to the piece's ORIGINAL axes — and the rotation then turned an
already-stretched shape. So a device turned a quarter got WIDER when a manager pressed Taller,
which is the sort of control that teaches a person to stop touching it. The scale sits outside
the rotation now: Width always stretches across the screen and Height always down it, whichever
way the piece has been turned.

## A column with a left margin in it, and a menu in front of the menu. *Built.*

**THE PAD'S ROWS WERE THROWN OUT BY ONE LEFTOVER RULE.** The group stacks its two buttons
VERTICALLY, and a `margin-left:6px` sat between adjacent ones — so the second button of every
pair was nudged six pixels right of the first, and nothing on the pad lined up. Sizing the
buttons had not fixed it and could not have: the fault was a gap running in the wrong direction.
The gap is the group's own now, in the direction the group actually runs, every button on the
pad is one size including the d-pad's four, and the paired arrows are drawn large enough to read
as arrows rather than specks. The harness checks the RULES rather than the render, since jsdom
computes no layout and would pass a pad in any state.

**AND THE FRONT DOOR IS THE GAME.** The root held a landing page — a single card describing the
game and linking to it, one build and nothing to choose between. It was replaced with a
REDIRECT, and the redirect did not take: the live site went on serving the old page through
three uploads. A redirect is a SECOND FILE that has to be uploaded, cached and trusted before
anybody reaches anything, and every one of those is a place to fail. The build writes the page
to `index.html` and `viewers/index.html` as well as `viewers/the_corp.html` — the same bytes, so
the root IS the game and there is nothing in between to go stale, be missed in an upload, or sit
in a cache. The harness compares the two files byte for byte.

## A month that adds up, eight colours that are eight, and a name for a nameless OA. *Built.*

**THE RECAP'S MONEY COULD NOT ADD UP BY CONSTRUCTION.** The change stood at the TOP, computed
across the whole month, above a list showing only the LAST SIX ledger lines — so a manager was
shown a total and an itemisation that could not agree, and asked to trust arithmetic he could not
follow. Every line the month wrote is shown now, in the order it was written, and THE TOTAL IS AT
THE FOOT where a total belongs, with the opening and closing purse beside it.

**MONEY COMING IN IS GREEN, EVERYWHERE.** Loss had a colour and gain did not, so an advance, a
purse and a gate read exactly like a shelf price. The convention, said once and applied across the
game: OUT is red, IN is green, and a figure that is merely a sum of money — a price, a balance —
stays gold.

**EIGHT SUPPLIERS, EIGHT COLOURS.** The board coloured them by a HASH into ten hues, and eight
draws from ten do not risk collision, they guarantee it — several read identically. They are
assigned BY POSITION now, so no two can collide, out of eight pitched away from the OAs' own
banners and the origin colours: paler and cooler where an OA is deep, warmer where an OA is
cold. And the benchmark came off the head of the board — it threw the title's centring out, and
every row already says how much more regard THAT supplier wants, which is the same fact in the
place a manager is looking when he wants it.

**AND A NAMELESS OA IS *AN UNNAMED OA*.** It was "The Unnamed OA", naming a thing this game
does not have, and I replaced it with "An Unnamed Concern" — which names a DIFFERENT thing it does
not have. A manager founds an Opes Arx; if he will not name it, the fleet calls it what it is.

## Four facts in one voice, and two words that had eaten the title. *Ruled and built.*

**"TREASURY · BOARD GRANT · SEASON WAGE · 7 ON THE BOOKS"** said four completely different kinds
of thing side by side, in the same grey, as though they were the same kind of thing. Taken apart:

- **THE TREASURY IS IN THE TOP LINE, ON EVERY PAGE.** It lived on the Roster and the Market and
  nowhere else — so the DESK, where a manager spends credits doubling focus, never showed him
  what he had. It is the one figure that transcends the page a manager happens to be on.
- **THE BOARD GRANT IS GONE FROM THE PAGE.** It is past tense — money already IN the treasury,
  given once — and a past-tense figure with a permanent home is a figure nobody can act on. It
  belongs to a year's opening summary, not to a standing line.
- **WHAT IS LEFT IS WHAT THE ROSTER IS ABOUT:** the wage bill and the headcount, given room
  rather than a grey aside. The wage is RED, because it is money going out. The count is GREEN
  when an OA can field a drop and RED when it cannot, and says which.

**AND THE CLOCK WEARS THE MONTH'S OWN COLOUR**, the same one the year line gives that stop, so
the two agree instead of the header being permanently gold.

**"ONE CORPORATION" WAS THE PAGE'S TITLE AND ITS HEADER**, for no reason anybody could name —
two words that had quietly overwritten the name of the game in the browser tab. The title is
*Opes Arx — The Capital Divide*. The corner carries the manager's own OA, its mark and its
colour, which is where a manager's name should have been all along and was nowhere. And an
unnamed founded corporation is *An Unnamed Concern*: **THE UNNAMED OA** named a thing this
game does not have.

## The pad lines up, and the builder gets a room. *Built.*

**EVERY BUTTON ON THE PAD IS THE SAME SIZE NOW.** They were sized by their contents — one glyph
or two, a wide arrow or a tall one — so no two rows lined up and the pad read as a rummage
drawer. And HEIGHT's arrows now stack one above the other, which is the entire point of the
picture: width reads across, height reads down. The turn glyphs draw small at any size, so they
are set larger to match the weight of the rest.

**THE EDITOR IS NOT A DRAWER.** It opened in the 340px rail beside the sheet, and a builder — a
preview, three rows of pieces and a pad — cannot be folded into a sliver: the rows collapsed to
one column apiece and the thing was unusable. It stands in the middle of the screen now, on a
dimmed field, at a width it can actually be worked in, and the dark around it closes it.

## The menu wears three of the fleet's faces. *Built.*

Three portraits — a Kellis, a Ththyn, an Etu — stand on the menu in TALL OVALS, a portrait's
own shape, which keeps the antennae, the ears and the crest that a circle would cut away. An oval
has no corners, so the art's black rectangle vanishes into the stage and the three read as one
piece rather than three images set side by side. The middle is raised and a touch smaller; the
sides sit lower and further out, framing the title from beneath and beside rather than crowding
it from above; each wears the light of its own art — cold blue, magenta, ember. THE TAGLINE IS GONE. *Eight OAs · One Year · One Divide* made three claims and all three
were untrue: there are no OAs, there are OAs; the game runs many YEARS, not one; and a year
holds contests throughout, not one Divide. It was reworded once and should have been cut —
a line that has to be argued into truth is a line that is not saying anything. The eight OAs'
own marks stand under the title instead, which claims nothing and shows something.

THE ART RIDES IN THE BUILD AS DATA URLS, the way the catalogue does, because the page is one file
that opens anywhere. Three PNGs at 3.4MB would have tripled the page; they are WebP at 600×900,
183KB the three, and `viewers/art/` keeps the sources. `build_corp.cjs` reads them into
`ARX_DATA.art`. (A slant on the side ovals was tried, noticed only once pointed out, and then
wished away — it is not there.)

## The pad, the tally, and a sponsor board nobody could read. *Ruled and built.*

**THE MARK EDITOR WAS DEAD BECAUSE A DRAWER OPENS WITH ITS CLASS, NOT WITH `display`.** It set
`style.display` on a `.drawer`, which is `translateX(100%)` until it is given `.on` — so the
editor built itself in full, twenty-two thousand characters of it, and sat one screen width to
the right where nobody could see it. It looked exactly like a dead button, and jsdom saw it
present and reported it working.

**THE PAD SAYS WHICH WAY A PIECE GOES.** Wider and Narrower were the SAME GLYPH TWICE, one
filled and one hollow, which asks a manager to learn a code rather than read a picture: they
point outward and inward now, and Taller and Shorter are up-over-down and down-over-up. THE
FIGURES ARE GONE — it does not matter that a piece is 1.6 units to the left, and a number nobody
can act on is furniture. With them gone every control is half again the size, and MOVE, being
the only thing on its row, sits in the middle of the pad. THE READY-MADE ROW IS GONE TOO: twelve
fixed marks made sense when the kit was small; beside eleven fields, twenty devices, eight bars
and a full turn on each, it is a thin extra field on a screen that wants fewer of them.

**THE FOCUS TALLY LIVES WHERE FOCUS IS SPENT.** It stood in the top line of EVERY tab in a dark
font, saying a thing the agenda already says louder and in a place where nothing could be done
about it. It is on the Desk. And *"Nothing Marked in the Natural-Born Window · 6 on the Sheet"*
is removed rather than reworded: marking is not a thing any more (a Natural-Born signs when you
sign them), the sentence never changed when somebody was signed, and a sheet with names on it is
not a task waiting on anybody.

**WHAT COURTING ACTUALLY IS, since the screen never said.** Focus spent on a supplier is not a
price and does not buy a contract. It builds REGARD (which persists, kept or lost) and records
this year's EFFORT, and at the season's turn every still-open supplier signs whichever courting
OA has the highest standing with it — one supplier per OA. So "cost 3" is the focus a
courting attempt costs, not what the contract costs; it falls as contracts are signed anywhere
in the fleet (`COURT_COST_DROP`) and falls a little further for an OA the supplier already
regards, which is the 2.9. Losing a year's courting is not wasted: the regard stands.
**AND "AT THE SEASON'S TURN" WAS THE FAULT, NOT THE EXPLANATION.** Everything resolved at the
lock, simultaneously — which makes the discount at the centre of the system incoherent:
`COURT_COST_DROP` takes focus off every remaining supplier FOR EACH CONTRACT SIGNED ANYWHERE,
and nothing was ever signed until the year was already over. No manager could ever see a price
fall for the reason the rule gives. He courted for three focus, did not get it, and watched the
number move by a tenth for reasons nothing explained.

**A SUPPLIER NOW SIGNS THE MONTH SOMEBODY CONVINCES IT.** Each carries a BENCHMARK — the
standing it wants to see before it commits (`SIGN_BENCH_BASE`, about two months of steady
courting, so a signature is a campaign and not one month's focus). The first OA to reach it
takes the contract THAT MONTH, and every supplier still open drops its bar (`SIGN_BENCH_DROP`,
never below `SIGN_BENCH_FLOOR`) — a board that is emptying is a board where the rest get
anxious. That is the fiction the focus discount always described, and now the two agree. The
lock keeps a final sweep for anything still open, where the bar no longer matters because there
is no more year to wait for, and a contract records the month it was signed.

ONE PASS A MONTH, deliberately: re-running while the bar fell let a whole board sign in a single
month — four suppliers went at once because each signature dropped the bar under the next one
instantly. A supplier judges by the bar AT THE START OF THE MONTH; what falls this month is what
the rest weigh next month.

**AND THE FOCUS PRICE WAS NOT A THING.** "Costs 3" stood on every row and was READ BY NOTHING —
no rule required a manager to spend it, or spent it, or checked it. A manager was shown a price,
put three focus in, did not get the contract, and watched the price become 2.9: a price for a
thing that was not for sale. `courtCost` and its four constants are gone. What they were reaching
for is the benchmark.

**AND THERE IS ONE CURRENCY NOW.** A focus of courting bumped regard by two AND counted for two
again through `effort`, so a point of focus was worth four of whatever standing was measured in
and no screen could have explained the number. ONE FOCUS IS ONE REGARD, and standing IS regard —
the same −60..+60 scale the board already showed, built a point at a time by courting, warmed by
keeping a contract (+10) and soured hard by failing one (−22). Effort is still recorded, because
a supplier only considers OAs that actually courted it this year, but it is not counted twice.
The benchmark is stated in that scale: `SIGN_BENCH_BASE` 8, falling 1.5 per contract signed
anywhere, never below 3.

**THE BOARD NOW SAYS WHAT IT WANTS.** Its head carries the bar every supplier is judging by and
how many have already gone; where the fake price stood, each row says how much more regard that
supplier needs before it signs you, or *Convinced* when it is there. WHAT IT DOES NOT SAY, by
ruling, IS WHO ELSE IS COURTING: that is a thing to send a scout for, not a thing the desk hands
over.

**AND THE RACE IS A RACE NOW, because the OAs no longer all want the same thing equally.**
Courting was weighted at a FLAT 0.55 for every OA in the fleet and every track took the whole
focus cap it could reach — so all eight courted from month one, with the same three focus, and
crossed the benchmark in the same month. No benchmark could have fixed that; it was not a board
rule but eight identical appetites.

An OA's appetite for a backer is `courtAppetite`: it rises as the purse thins over a year of
wages (`COURT_COMFORTABLE`), rises with thrift — a careful OA courts rather than spends —
falls with showmanship, because a showy OA would rather not be seen asking, and falls for
every backer already signed. AND THE APPETITE DECIDES HOW MUCH, NOT ONLY WHETHER: a hungry OA
throws the cap at it, a lukewarm one puts a point in and waits. The base is low enough that a
OA with money and pride may never court at all.

Measured over four fleets: the first supplier signs in month 4, two more around month 7, and ONE
OF THE FOUR IS OFTEN NEVER TAKEN — a board that does not empty is a board a manager can win from
late. Against the old reading, which was all four in a single month.

*Still bunched, and honestly so: two suppliers commonly go in the same month, because there are
only three focus to spend and eight OAs' appetites round to the same handful of integers.
Finer staggering wants either more focus to divide or a reason to start in different months, and
neither is worth inventing until the screen shows a manager what the race looks like.*

**AND THE TIE-BREAK WAS ARBITRARY.** `st > bestStanding` meant an exact tie went to whichever
house came first in the id list. A sponsor with two equal suitors now SPREADS ITS BETS: the
OA carrying fewer of its contracts takes it, and if they are level there too, the one with
less standing in the fleet — a backer courted equally by a giant and an upstart gains more by
backing the upstart.

**Each supplier wears its own colour**, drawn from its own id so it is the same on every screen.
A column of identical grey names was the one thing the fleet is never shown as.

## A fleet that leaves the ship properly equipped. *Ruled and built.*

**NOBODY IN THE FLEET CARRIED A SIDEARM, AND IT WAS A PROCUREMENT FAULT.** Every role names two
to five of them, ten exist in the catalogue from ninety credits, `useSidearm` has been in the
fight since the beginning and `equipCorp` passes the slot through — and NO PHASE OF THE PLAN EVER
BOUGHT ONE. The plan's essentials list was `[primary, armor]` and nothing else ever filled the
slot. A sidearm phase sits after the essentials and before the upgrades, because an OA buys
every hand a pistol before it buys anybody a better rifle; the cell-fed go first, since a flat
cell is what ends a fighter's fight.

**AND THE GUNS NOW RESPECT THE RESERVE THE MODS ALREADY HAD.** Muster and the buy that followed
were capped at the WHOLE fielding allowance while the upgrade phase worked against `gunAllow` —
so an OA could field itself to the ceiling on rifles and plate and have nothing left for a
pistol or a grenade.

**NO FIGHTER IN THE GAME EVER DEPLOYED UNARMED.** That state existed only in the PROBES, which
built `generateSquad` bodies and never equipped them. Measured across three fleets, 598 hands:
100% carry a primary, 100% armour, 85% a sidearm, 88% a consumable, and NOBODY walks on unable
to hurt anybody. `sim/measure_kit.cjs` is the gate, and it fails on a bare hand.

**ONE OA STILL ARMS NOBODY WITH A PISTOL: the Verdant Cradle, 0%.** It is the poorest OA
in the fleet, its fielding allowance is small, and twelve per cent of a small allowance buys a
ninety-credit holdout for the two roles that list one and nothing for the rest — while the OA
sits on thirty-one thousand credits it cannot field. THAT IS RECORDED AND NOT FIXED: whether a
fielding cap should bind a poor OA this hard is a ruling about what the allowance means, and
it wants deciding rather than patching.

*Re-measured with sidearms in play: the range gradient holds — 2.33 dead a fight at a short
opening against 1.25 at a long one — and clock failures across the three bands are 0/1/0.*

**AND THE OTHER HALF OF THE RULING: CONCEALMENT DID NOTHING FOR BEING SEEN.** The spotting pass
asked two questions — is that body inside my sight, and is there a line to it — so a fighter flat
in heavy cover was as visible at fourteen tiles as one standing in the open, and every scrap of
concealment on the map bought exactly nothing. Cover now SHORTENS THE REACH OF AN EYE against
that body (`CONCEAL_PER_COVER` a grade, never past `CONCEAL_FLOOR`); movement gives it back,
because a man who is moving is a man you notice (`CONCEAL_MOVING`); and a body that has just
fired is seen wherever it is, since a muzzle flash is not concealed by a bush. Concealment is
what the ground IS, not what lies between two points, so it is read from the best cover around
the body rather than from the shooter's angle.

The ground finally decides something: over twelve fights a side, a FOREST costs 151 body-turns
with nobody to shoot at against BROKEN GROUND's 54 and an OPEN BASIN's 42, and a fight in it runs
two and a half turns longer.

**AND THAT MADE THE SEARCH GAP BITE, so it is built too.** A squad with nobody in sight went to
the last place anybody was seen, or to the middle of the map — and two squads that had never made
contact both walked to the same middle and milled there, each holding the range its guns preferred
from a POINT rather than from a body. While sight was long this was a curiosity; the moment
concealment was real, HALF THE SHAPE GATE'S FIGHTS RAN OUT THE CLOCK, because a forest full of
people who cannot see each other is a forest full of people standing still. A squad with nothing
to go on now SWEEPS the ground the enemy came from, and the aim point drifts along that flank as
the fight runs, so the sweep covers ground rather than orbiting one spot. (`S.sIdx` had to be set
for that: a side did not know which edge it had come on, so both swept the same flank.)

Shape after: 11.4 turns, nine fights in ten ended by a side breaking, and clock failures across
the three bands of 1/0/0. Snapshots blessed once against it.

## The draft dealt three landings because everybody happened to field three. *Ruled and built.*

The rule allows an OA SIX squads. Every OA packed its people eight to a squad and so
fielded three — and the draft dealt three picks apiece, which looked correct because the two
numbers matched BY COINCIDENCE. An OA that split into six got three landings and the engine
quietly stacked the other three onto the last pick: splitting was punished by an accident nobody
had noticed, including me.

**A OA DRAFTS A LANDING FOR EVERY SQUAD IT FIELDS.** Rounds run to the largest count in the
fleet and an OA with fewer simply has no pick in the later rounds. Measured: eight OAs
wanting 5,5,3,5,4,4,3,3 landings drew exactly that, no slot dealt twice, nobody short.

**THE GROUND DOES NOT SHRINK TO FIT THE FLEET.** The first cut grew the ring with what the fleet
meant to field, which made the map a function of the OAs standing on it. A planet has the
landings it has — FORTY-EIGHT, always — and a light fleet leaves most of them unclaimed. Ground
going unused is the point: an OA that scouted knows which of the unused ground was worth
having. Measured: thirty-two claimed, sixteen left.

**AND THEY ARE SCATTERED, NOT STRUNG ON A RING.** A single circle at 0.82 of the radius meant the
whole fleet came down at one depth, and which ground an OA got was whatever happened to fall on
that circle — so scouting the planet told a manager almost nothing, because the choice was only
ever WHERE ROUND, never HOW DEEP. The landings lie across the whole ground on rings that THIN
TOWARD THE CENTRE (`SLOT_BANDS`: eighteen at the rim, two in the middle), because the middle is
the shortest walk to everything and the last ground the wall leaves — worth more, and fewer to
take. Measured: landings from 0.10 to 0.86 of the radius, and the AI reaching for the deep ones.

TWO LANDINGS MUST NOT BE ONE: snapping a point to the nearest passable ground can walk two of
them onto the same tile — a lake between them and both slide to the same shore — and a draft that
deals the same ground twice is a draft that lies. Each point is tried a few steps round and
inward before it is allowed to sit near another; measured across six planets, the closest pair is
never nearer than a tenth of the radius.

**AND A OA NOW CHOOSES ITS SHAPE.** Six squads is a real decision with real terms — more
landings drafted, more ground covered, more deposits worked at once, against squads thin enough
to lose the fights they pick — and the AI had no way to make it, because `dealSizes` packed to
the maximum and stopped. `squadCountFor` leans on the dials: ground-hunger and appetite for
contact push an OA wider, patience keeps it massed. From a drop of twenty: a greedy OA
fields six, a plain one four, a careful one three. A manager's own call overrides it.

## A mark goes everywhere its fighter goes. *Built.*

The marks reached the Squads portraits, the roster rows, the bench and the sheet, and stopped
there — Training and Rest named a hand in plain text, and so did the Paper, the sheets on offer
and the negotiation table, where a fighter is a TERM and most needs to be recognised as a person.
All of them carry the mark now. A prospect wears one before they have an OA, ringed in a
neutral line until they sign; a fighter on the table is ringed in the colour of whoever holds
them, which says at a glance whose side of the deal they are on.

RATHER THAN NAME THE SURFACES ONE BY ONE and find out later that a new one shipped bare, the
harness SWEEPS: it takes the roster's names, walks every host that could print one, and asks
whether a mark stands within a few nodes of it. It caught the Training grid, which was the one
edit in the batch that had not landed — and it will catch the next surface too.

## Every piece turns about the point it looks like it turns about. *Built.*

`sim/audit_marks.cjs` reads the kit's own source, samples each piece's outline, and reports how
far its ink sits from the pivot every transform turns about. It found EIGHT pieces swinging on a
hinge beside themselves — the triangle field, the Olmac slab, the chevron, the arrow, the
mantis-blade, the claw, the flame and the hoof-arch — all now plotted from (12,12) or sat back
onto it. The triangle, the pentagon and the hexagon are drawn as REGULAR polygons from the pivot
rather than by eye, which is what made the pentagon read as lopsided: its sides were not even.

TWO MEASURES HAD TO BE THROWN OUT ALONG THE WAY, and both are worth recording.
- THE BOUNDING BOX IS THE WRONG MEASURE FOR AN ODD-SIDED SHAPE. A pentagram centred exactly on
  its circumcircle still has a bbox sitting high, because it has one point up and two down — so
  judging by the box condemned the star that had just been fixed. The centroid of the ink is the
  test.
- RADIAL SPREAD IS NOT THE TEST EITHER. It condemned the Gil goggles, which are two circles
  either side of the pivot: radially uneven, and they rotate perfectly evenly, because they are
  SYMMETRIC about it. Spread is printed because it is worth seeing and judged on by nobody.

A BAR IS ALLOWED OFF THE PIVOT, deliberately: a ground-line belongs at the foot, and turning it
is how a manager puts it on another side. Only fields and devices must be centred.

AND THE SECOND HEXAGON IS GONE — it was the first one lying on its side, and the pad turns
things. A piece a quarter-turn already reaches is not a piece, it is a duplicate. The kit is
eleven fields, twenty devices and eight bars.

## What a born mark is allowed to do, and where a mark is changed. *Ruled and built.*

**THE EDITOR WAS UNFINDABLE.** It was reached by clicking a bare disc on a fighter's sheet, with
the whole affordance in a `title` nobody hovers — the same mistake the focus boost made, and the
same fix: the word is on the page. The sheet's mark now says *Change the Mark* beside it, and
THE MARK ON EVERY ROSTER ROW opens the editor directly, because the Roster is where a manager
looks at his people and so it is where changing how they are drawn belongs.

**AND THE DRAW WAS TOO FREE.** It turned and scaled every piece without limit, and free is not
the same as varied: most of what came out was a jumble, because a field turned 45° stops being a
field and a device at half size stops being the subject. A MANAGER may do all of that — if he
makes a mess, he made it, and that was the ruling — but a mark a fighter is BORN with has to read
at twelve pixels without anybody looking at it first. Each piece is now bound by what that piece
is FOR: a field stands square and only ever turns a quarter; a device may turn to any eighth,
because a device is the subject and a turned subject is still a subject; a bar turns to a quarter
or a diagonal. Nothing is moved off centre and nothing is stretched — those are a manager's tools,
not the draw's — and scale stays within a tenth. Measured over 450 marks across all nine peoples:
no field on a diagonal, every piece between 0.90 and 1.10, and the variety carried by WHICH
pieces come up rather than by noise.

## An overlay taller than the screen. *Fixed.*

The founding screen is `position:fixed`, centred, and said nothing about overflow — so once the
mark builder grew, the button that starts the game sat past the bottom edge with NO WAY TO SCROLL
TO IT. A short viewport could not begin a career at all. The overlay scrolls now, centres only
while it fits, and keeps a margin at the foot so the last control is never flush against the
edge; on a narrow one the builder stacks under its stage, the pad becomes one column, and the
button that starts the game sticks to the bottom where a thumb is. The harness asserts the
overflow rule, since jsdom computes no layout and would never notice the button had gone.

## Every fighter is their own mark. *Ruled and built.*

Portrait art for hundreds of people across a career is not a thing this project will ever have,
and a mark from the same kit the founding builder uses is BETTER than a face for what the game
needs: distinct at twelve pixels, stable across saves, and drawn on the grid so a fight can be
followed by WHO rather than by coloured dots.

**A FIGHTER IS BORN WITH ONE**, drawn from their id (`bornMark`), so it needs no storage and never
changes under them. Their people lean the draw — a Ththyn toward the wings and the wing-case,
an Olmac toward the slab and the block, a Mon-Wa toward the halves and the tether, a Kellis
toward the mantis-blade, an Attorak toward the claw, the Etu toward the flame and the
candle-OA, a Gil toward the goggles, a Svalbard toward the hoof-arch — and the people's own
piece comes up more often than not, so a squad of Ththyn reads as one. EVERY PIECE THE DRAW CAN
REACH IS IN THE KIT (`RACE_LEAN` indexes it), so nothing a fighter is born with cannot be made by
hand: the kit is twelve fields, twenty devices and eight bars now.

**THE FILL IS THEIRS; THE RING IS THE OA'S.** The mark is filled in the fighter's race colour
by default and may be changed to any of the founder's swatches; the ring round it is always the
OA's colour, which is how the grid says whose they are. It reads on the Squads portraits (where
the silhouette stood), on the roster rows, on the bench cards, and on the sheet — where clicking
it opens THE SAME PAD the OA's mark was built with: *As Born* throws a change away, *Re-Roll*
draws again from their people's kit, *Keep It* saves. Only what was changed is saved; a fighter
never touched carries no mark at all.

**AND ON THE GRID.** The field is a canvas, so each mark is rasterised once per fighter and colour
from the same SVG and drawn over the disc, faded on a body that is down, with the cross still over
the dead. (Two elements shared `id="cmarks"` for a while — the founding screen's and the editor's
— and the pad painted into the hidden one; it takes its host explicitly now.)

## The founding screen asks three things. *Ruled and built.*

It listed the fleet TWICE, explained that a blank slate is the fleet average, offered a seed
almost nobody wants to type, titled itself *Choose Your OA* above a button reading *Found the
OA*, and asked whose berth to take. What is left is a NAME, a COLOUR and a MARK, which is what
founding a corporation actually is.

**WHOSE BERTH IS NOT A QUESTION.** It has no information behind it and no interesting answer.
The weakest OA canonically gives way — the highest declared difficulty, the thinnest treasury
breaking the tie — which today is the Verdant Cradle (difficulty 5). With several managers the
weakest several give way in that order: three managers displace the Cradle, the New Line and
Vantis Deepcore. That is the rule multiplayer will want, written now rather than retrofitted.

**THE PAD.** Each piece can be TURNED, GROWN, MOVED and STRETCHED, not only turned — one set of
controls working whichever piece was last touched, the way a Mii is built: pick the part, then
adjust it. A symbol apiece with the reading beside it rather than a figure crammed into the
button. There are no bounds worth imposing on taste — if it looks bad, a manager made it look
bad — so the only limits are the ones that keep a mark inside its own box at twelve pixels, and
Reset puts a piece back where it started.

**THE STAR SPUN AROUND SOMETHING THAT WAS NOT ITS MIDDLE.** It was drawn as a run of relative
moves from its top point, so its ink sat high in the box while every transform turns about the
box's centre — the whole thing swung on a hinge above itself. Plotted from (12,12) outward, it
turns about the point it looks like it turns about.

**A MARK OF YOUR OWN, MADE RATHER THAN CHOSEN.** A founded OA wore the same borrowed device
as every other founded OA. The mark is BUILT: a FIELD (eight), a DEVICE (twelve) and a BAR
(six), and each of the three CAN BE TURNED, all the way round in eighths. Stopping at 135° was
a half-measure resting on the assumption that the upper half of the dial repeats the lower, and
it does not: a chevron at 225° is not a chevron at 45°, and an asymmetric field has eight faces.
Rotation is worth more than more shapes — a diamond turned is a square, a chevron turned is an arrow, a bar turned is a pale
— so the kit stays small enough that every piece could be drawn for twelve pixels, which is the
whole constraint: the mark goes on a rail tab and a map marker. Five hundred and seventy-six
combinations before turning; two hundred and ninety-five thousand with it. Twelve READY-MADE marks stand beside
the kit for a manager who does not want to make one, and the preview draws the mark at 104, 24,
16 and 12 pixels at once, because legibility at the small end is the only thing that can go
wrong.

**TWO HARNESS MEASUREMENTS WERE WRONG, and the founded OA exposed them.** The training mean
was taken across the whole roster while the drive SIGNS FIGHTERS between the two readings — on
seven hands, two arrivals move the average more than a month of drilling does, which read as a
painted column losing to an unpainted one. The mean is over a frozen cohort now. And the painted
column was compared against RESOLVE, which rest lifts as well as drill; it is compared against
AIM, which nothing but training touches.

## A portrait's shape, and a head that is its own switch. *Ruled and built.*

**THE TILES KEPT COMING OUT WIDER THAN TALL** through three attempts, because the face-plate was
a fixed HEIGHT inside a card whose width the grid decided — so however the card was sized, the
plate stayed a strip. The plate is a 2:3 FRAME now, the shape a portrait is, and the card is
only as wide as its frame, with the name and the gun beneath. The empty slots take the same
proportion so a part-filled squad reads as a rack of eight rather than a ragged row. (The
harness asserts the aspect ratio in the stylesheet, since jsdom computes no layout and would
have passed a strip happily.)

**AND THE DESK'S FOLDS LOST THEIR BUTTON.** A word to press beside a title a manager was already
reaching for is a second thing to aim at for no reason: the whole head opens and shuts its
section, with a chevron saying which way it will go.

## Each window wears its own colour, and no button moves. *Ruled and built.*

Natural-Born, the Bastille and the mercenaries have had a colour apiece everywhere else in the
game — on the year line, on a roster row's origin, on the map's markers — and the window that
buys them was one green box for all three. The panel takes `--o` from the window and every rule
reads it, so a manager knows which market he is in before he reads a word.

**A · THE LEDGER LINE, for Natural-Born and the Bastille.** The card never reflows: one action,
full width, in the window's colour, in the same place whatever state the card is in. Signed, the
card takes the colour and wears a corner flag.

**B · THE STANDING BID, for the mercenaries — the one window where waiting is the mechanic**,
because seven OAs are bidding and the fighter chooses. It keeps its bidding and loses its
moving buttons: THE BID IS A SLIDER against what the field is putting up (`MERC_FIELD`), and
**Place, Raise and Withdraw all stand on every card at once** — none of them renames itself or
takes another's place under the cursor. The reading beneath answers what a manager actually
wants to know in an auction: not how much, but whether it is enough — *Not Enough*, *They Are
Listening*, *They Would Take It*. A text box asked for a number with no sense of the field at
all.

## The ring reaches the Talks and the Deal. *Ruled and built.*

Both surfaces pick an OA the way every other one now does: the mark large in a circle in the
OA's own colour, the name under it, laid on a ring with the manager's own OA in the middle.
Each carries under the name the one thing that surface's choice turns on — in THE DEAL, whether
they are your banner or under you or in a pact with you, and their odds; in THE TALKS, what they
think of you, or *Sealed* if they will not come to the table at all. These were the two emptiest
menus in the game and the ring was designed for exactly that.

*Still to take it: the leanings on the Table, which are a five-point scale per OA rather than
a choice of one, and want their own shape.*

## A signature is a signature. *Ruled and built.*

**A NATURAL-BORN SIGNS WHEN YOU SIGN THEM.** The tryout sheet is your own ship's — nobody else
is bidding on it — and it still made a manager mark somebody, wait for the month to turn, and
find out then whether he had a fighter. There is no auction to wait for: `signNow` draws the
paper, commits the money and puts the hand on the roster the moment the button is pressed, and
the name comes off the sheet. The re-signing answers land the same way, with a line in the log
saying what was done. THE MERCENARY MARKET KEEPS ITS BIDDING, and only it: seven OAs are
bidding there and the fighter chooses, which is the one place where waiting is the mechanic
rather than a delay. (Its moving-button problem is the acquisition mock-up's business.)

**THE BACKROOM'S STYLES WERE LOST.** A cleanup that removed the old drawer's rules took the
page's with them, so the Backroom rendered as unspaced white text — *Price₡15,000Goes Off
Clean88%* is what a card looks like with no stylesheet at all. Written back, with the price grid
given room: label left, figure right, rules above and below, and the offer set off in the
signing colour.

## One gesture for picking an OA, and a fleet you can see. *Ruled and built.*

**A OA IS ITS MARK.** Every place a manager chose another OA wore its own shape — long
rectangles at the founding, a strip in the Talks, chips in the Backroom — and none of them
matched. `housePicker` is the single component: the emblem large inside a circle in the OA's
own colour, the NAME UNDER IT, laid on a ring where there is room and a row where there is not.
It fills the empty middles of the menus that use it, which was half the reason those menus read
as thin. The founding berth and the Backroom's targets use it now; the Talks and the Deal are
the next surfaces to take it.

**AND THE BOARD SHOWS A FLEET, NOT A COLUMN OF BARS.** Seven bars said what each OA thought
of you and showed nothing. The fleet is a set of DISTANCES: each OA stands on a ring around
yours, the warmer they are the CLOSER and LARGER they sit, the colder the further out and the
smaller, with a line drawn to you — green where they are warm, red where they are cold, its
weight the strength of the feeling. Same disc-and-name as the pickers, so the fleet looks like
itself wherever it appears.

**THE DESK'S BIG GRIDS FOLD, AND OPEN FOLDED.** Training, Rest, Intel and Sponsors between them
fill a screen and a half, so a manager opening the Desk met a wall and scrolled past three
things to reach the one he wanted. Each is a fold with its name CENTRED and the word that opens
it on the right: shut until asked for, remembered once opened. (jsdom does not compute CSS, so
the harness asserts the fold state itself rather than trusting the stylesheet.)

## The Kellis, the Bastille's missing button, and a place for a face. *Ruled and built.*

**THE KELLIS WERE SKIPPED.** The racial pass gave every other people something and never
discussed them at all. They are mantis-featured and precise, drilled in duelling arts that are
never fielded — and that drill is exactly the mechanic: they fight IN MEASURE. A Kellis who
holds their ground rather than crossing it is reading the exchange, and each turn held is worth
more on the next shot, to `KELLIS_MEASURE_CAP` turns; crossing ground breaks it. Measured: their
hit rate runs 0.226 against a human squad's 0.212, bought entirely by standing still, which is a
thing a manager can play around. (The number lives once, in combat.js where the shot is priced —
declaring it in both modules is how two numbers drift apart, and the suite caught me doing it.)

**THE BASTILLE'S SHEET HAD NO BUTTON.** The intake allotted prisoners purely by which OA was
shortest of people, so a manager read six names on the Roster and could do nothing with any of
them. An OA ASKS for the ones it wants (`claimPrisoner`), and the claims are honoured first;
the Bastille still fills the rest of the lot its own way. CEILING is off every sheet at last —
Natural-Born, Mercenary and Bastille all still carried it — replaced by the RATING, which is the
number a hiring call actually turns on.

**ROSTER SHORT IS GONE FROM THE AGENDA ENTIRELY.** Narrowing it to the signing months was not
enough: it is a STATE, not a task, and it held the turn button up over a thing a manager
frequently cannot act on. The Market says how short an OA is where something can be done about
it; the lock stops a drop that cannot be fielded.

**THE PORTRAITS LOST THEIR EASE, AND HAVE IT BACK.** The cross was the only way out of a squad
and there was no way to move somebody between squads without sending them home first. A portrait
picks up the way a bench card does; the next open place in any other squad takes them; the bench
takes them back. And the initials are gone: a head and shoulders in the fighter's own race
colour reads as *a portrait goes here*, which is what the tile is for and what art will replace.

## A squad is eight portraits, and a fighter has a rating. *Ruled and built.*

The first attempt at "make the squads feel less like lists" made the list TALLER: eight
full-width rows, each with a wall of seven stats, and every empty slot on the page lighting up
the moment a manager picked somebody up — forty-two offers at once, which is a screen shouting
rather than an offer. It was worse in every way it was meant to be better.

A SQUAD IS EIGHT PORTRAIT TILES, four across and two down: a face-plate (initials until there is
art to put there), the name, the RATING, and the gun. The star and the cross come up on hover
rather than standing in the way, and the name opens the sheet. It is the shape the art will want
when there are faces for it. ONE TARGET A SQUAD: picking somebody up lights the next open place
in each squad that could take them — six offers, not forty-two.

THE RATING is one number that stands for a fighter at a glance: their stats, what their kit is
worth, what their quirks are worth to a fight, and what their condition takes off. Building a
squad meant reading seven stats on every card, which says everything and shows nothing. The
rating is not the whole picture and is not meant to be — the sheet is one click away — but it is
what a manager actually asks when he is filling eight slots: is this one better than that one.
It reads on the portraits, on the bench cards beside the gun, and it is what the Roster's sort
now means by *Rating* (it was `Stats`, and it was already this average, unnamed and unshown).

AND AN ARTICLE IS NOT A FORENAME: an Olmac called The Tide was punished as "Punish The", because
an event took the first word of a name. A name that opens with an article is used whole.

## The paper, and a boost nobody could see. *Ruled and built.*

**THE REVIEW IS WHERE A MANAGER ANSWERS HIS OWN PAPER.** Every expiring contract was renewed or
dropped by the same budget arithmetic the fleet uses — the human's included — so a fighter who
came good never got an argument, a veteran past his best never got cheap, and a manager never
had to decide whether either was worth what they now ask. Month 1 shows the expiring contracts
on the Roster: what each was paid, what they ask now (fame moves it), and what a year of them
costs. Three answers — RE-SIGN at the ask, OFFER LESS (`HAGGLE_FLOOR`, and the further under
the ask the likelier they walk, `HAGGLE_WALK`), or LET THEM GO. A prisoner who has served his
sentence is marked, and signing him on makes him a free hand on ordinary wages. The fleet still
answers its own paper by arithmetic; a manager's calls stand before it. This matters most to a
founded OA, whose seven hands ALL have a year left on their paper — the first year opens with
a decision about every one of them.

**AND THE BOOST WAS DRAWN WHERE THE FOCUS IS NOT SPENT.** Labelling the button was the wrong fix
twice over. The button lived on the VERBS LIST, and that list deliberately SKIPS training, rest
and intel, because each of those is a grid of its own below it — so for three of the four tracks
the button was never drawn at all, and a manager could spend eight points on drilling and never
be offered the thing that doubles them. It sits on each grid's OWN HEAD now, appears only once
that grid has focus on it, and names the price of what is actually on it. The sentence explaining
it came off the tally: prose beside a control is the admission that the control does not explain
itself, and a button that names its own price does not need a sentence.

**THE BOOST WAS THERE ALL ALONG, AND UNREADABLE.** Doubling a focus point for credits exists in
the engine and on the page, and read as a lightning bolt with a price beside it, the whole
mechanic hidden in a tooltip nobody opens — which is indistinguishable from not existing. The
button says *Double This · ₡8,000* and *⚡ Doubled* when taken, in the credit colour, and the
focus line says the price once. Nothing about the mechanic changed; a manager can now find it.

## The Backroom, the holds, and the last drop-down. *Ruled and built.*

**THERE ARE NO DROP-DOWN MENUS IN THE GAME.** There were two, and both are gone: the Quiet
Business's targets and the founding screen's berth. Both are chips in their OAs' own colours
now, the way every OA is shown on every other surface. This is a standing rule — a select
hides seven things behind one word.

**THE BACKROOM** is a page with a rail tab, not a drawer opened by a button, and it carries the
work that belongs to WHEN YOU ASK: before the drop you can sabotage a rival's kit or have a
quiet word; while the contest runs you can buy a ruling or a malfunction. A favour that says
"this Divide" was never something a manager buys in month three. ("The Back Room" was a
strange name for a page; the Backroom is where it happens.)

**THE HOLDS ARE A FLEET'S HOLDS.** "The ship has 4 food" is a silly sentence. A store is
measured in units of a thousand — a full hold is 9,000, the board asks for 3,000, and what came
home reads in the same scale. Every ratio in the game is unchanged. And the stores fall EVERY
MONTH for the same annual total (`HOLDS_DRAIN / HOLDS_DRAIN_MONTHS`), because a hold that empties
in twelve small bites is a thing a manager watches, not a number that jumps once while he is
looking elsewhere.

**THREE SMALLER CORRECTIONS.** *Roster short of 16* stood on the agenda in month one, when no
window is open and nothing can be done, and held the turn button up saying so; it stands only in
months a manager could sign somebody. *Gate and Merchandise* was said twice in one recap — the
money block already carries it. *Focus · 3 On Train* was neither true (a manager who spent eight
points across the grid saw three) nor useful (the Training tab says what the drilling went to, in
the cells it went to); both lines are gone. And CEILING came off the prospect card: training is
capped globally now, so a prospect's own potential decides nothing a manager can see or move, and
showing it as a stat promised a mechanic that is not there.

## The housekeeping audit. *Built.*

`sim/audit_code.cjs` looks for what no test can: functions nobody calls, constants nothing
reads, helpers written twice, and files that have outgrown a reading. None of these change what
the game does, which is exactly why nothing catches them — a function nobody calls passes every
check in the suite. First run: **no dead functions**, thirty-eight unread constants, twelve
names shared by two modules, two files past three thousand lines.

THREE OF THE THIRTY-EIGHT WERE FAULTS, not tidying:
- `MONWA_TETHER_COMP` (−25 composure an exchange, ratified with the canon) had sat in combat.js
  unread while the tether was built beside it with a fresh −12 that somebody invented. Likewise
  `ATTORAK_INTENSITY_COMP` and `THYTHYN_HOVER_P` — the gnoll's own figure and the share of
  Ththyn repositions that end hovering, both ratified, both ignored while I wrote new ones. All
  three are read now, and the hover is a roll rather than a certainty.
- `FAST_WALL` named the edict's compression in events.js, and divide.js typed `0.80` again where
  nobody would think to change it. The share travels from where the edict is written.
- `APPROACH_SHARPNESS` was superseded by the captain's judgement and left behind to be read as
  though it still decided something. Removed.

TWO RULES SHARED ONE NAME: `bandOf` in combat.js takes a FIGHTER and reads the band their weapon
was built for; `bandOf` in tactical.js takes a DISTANCE. Neither was wrong and either could be
read as the other — the sort of thing that survives every test and ruins one afternoon. The first
is `weaponBandOf` now.

THE REMAINING THIRTY-ONE ARE THE ABSTRACT MODEL'S, and they are kept deliberately: exchange caps,
band shifts, turret and drone timings — the instrument panel of the model the grid replaced. The
grid's own numbers were derived from them and several rulings are written in their terms. They
carry `[ABSTRACT]` where they live, and the audit takes that as an answer, so the next reader
knows they decide nothing without having to find out the hard way. The remaining shared names are
module-local (`clamp`, `open`, `resolve`) and harmless. `divide.js` at 4,417 lines and `season.js`
at 3,382 are noted, not split: a split is invasive and belongs to its own pass.

## A manager founds an OA. *Ruled and built.*

Taking one of the eight over was a difficulty selector wearing an OA's name. A manager
inherited somebody else's roster, somebody else's armoury and somebody else's reputation, and
spent the first year managing choices that had already been made. THE EIGHT ARE THE FLEET, and
the fleet is not the player: their identities are for the OAs across the strip. A manager —
solo or otherwise — founds an OA and takes a berth among them.

And a founded OA opens with nothing but money and a few old hands:

| | A founded OA | One of the eight |
|---|---|---|
| Roster | **7**, every one with a year left on the paper, no mercenaries among them | 20–21 under contract |
| Armoury | **18 pieces** — one drop, armed badly | ~280 pieces across 35 lines |
| Treasury | ₡210,000 | ₡255,000–330,000 |
| Grant | ₡150,000 — nobody underwrites an OA they have not heard of | ₡265,000 |
| To build with, after the entry, the wages and the reserve | **₡260,600** | — |

The old start handed a manager six hundred thousand AND a full roster AND a full armoury, which
is why the first year never felt like a decision. The mercenary market opens at the year's end,
so a founder's first real choice is what to spend the year becoming. (`profile.founding = 'lean'`
→ `LEAN_ROSTER`, `LEAN_DEPTH`, `LEAN_PIECES`, `LEAN_TREASURY`, `LEAN_GRANT`; the ledger takes a
grant from opts now, since a founder is not underwritten like a century-old OA.)

TWO HARNESS CHECKS FELL, and neither was the engine. *The letter is gone and the OA remembers
the snub* — the snub WAS remembered (memory 1→2); what failed was "gone", because the fleet
writes every month and a new letter had already arrived. The check tests the letter that lapsed
now, not that no letter stands. *The scalpel bit deeper than the column* — `dT` is the column's
MEAN gain across the roster, and a column spread over seven hands gives each of them nearly what
a scalpel gives one. That is the founding change working, and a thing a manager should feel: a
small roster trains broadly for cheap. The check asks that the scalpel is still worth its focus,
not that it buries the broad spend.

**The people you keep decide what happens to you. *Built since this was written.*** Fourteen
quirks carry a `*_event_seed` hook — a hot head seeds a brawl, a clause reader a renegotiation, a
superstitious hand an omen, a war debt the creditors — and the event draw asked none of them:
every OA drew from one flat pool whoever was aboard. An OA with the people for an event now
draws it far oftener (`SEEDED`) and an OA with nobody who could cause it a little less
(`UNSEEDED`), which is what those hooks were written for. Wired beside them:
`short_band_composure_bonus` (steadier the closer it gets), `early_disengage_bias` and
`follows_bad_orders` (a squad with a bolter calls it sooner; one that does as it is told holds a
bad order too long — both read at the captain's call), `tether_range_extended` (a drilled pair
works three tiles further apart), and `sponsor_income_up` / `rare_quote_fame_spike` (a marketable
face is worth a tenth more at the gate). SIXTY-THREE HOOKS WERE READ BY NOTHING WHEN THIS BEGAN;
NINETEEN ARE, and quirks that do nothing at all have gone from twenty to five.

TWO THINGS THE GATES CAUGHT, both mine. The seed cache was a `Set` hung on each corporation and
the trait index a whole catalogue hung on the state — and a career is saved from those objects, so
a save came back wrong; the harness said so in one line. Neither belongs in a save: they are
derived from the catalogue every build already has, so the cache lives in a `WeakMap` and the
index is handed to the events module rather than stored. And a ground-encounter check was
asserting that a fight ran longer than five frames, which is no longer that check's business —
a squad with somebody who wants out can be gone in three turns, and how long fights run is
`measure_fight.cjs`'s question now.

**Twenty-one more hooks, and the Gil's psions. *Built since this was written.*** The Gil were
half-built: their goggles worked (a head wound breaks them, and a Gil without them shoots worse)
and all three PSIONIC EXPRESSIONS were inert — `squadLink` was read in the aim path and set by
nobody. A latent Gil is now worth something to everyone standing with them: the link steadies the
whole side's shooting, battle sense means the side is never caught unready, and the broadcast
carries to the crowd. THE SUITE CAUGHT ME WIRING GHOSTS: the first cut listened for
`psion_squad_link` as a HOOK, and that is a trait id — no trait grants a hook so called, so the
resolver was listening for a word nobody says. The ghost-hook check exists for exactly that and
found it in one line; the resolver reads the hooks the traits actually grant now
(`squad_coordination_bonus`, `ambush_avoidance_slight`, `psionic_broadcast_sensation`).

Wired alongside them: `presence_aura` (a steadying body steadies the people near them, and only
those who need it), `cohesion_morale_bonus_near_squadmates`, `death_morale_immune` and
`gore_morale_immune` (which needed a mark saying THIS loss is a body going down — the hooks were
there, the question was never asked), `injury_exposure_up`, `overwatch_bonus`,
`salary_anchoring_up` and `salary_demand_pressure` (a fighter who anchors hard asks a third
more), and `poach_resistant` (a hand who does not listen costs 60% more to tempt — a loyal
fighter was as cheap to buy as any other). Sixty-three hooks were read by nothing when this began;
forty-two are. The tooltip is honest about which, and the snapshots were blessed once, deliberately,
with the shape gate beside them: 9.1 turns a fight, ten of ten ended by a break.

**A deleted line, three blessings, and the gate that would have caught it. *Built since this was
written.*** An edit that gave the Olmac their toughness computed the damage, applied the soak and
the frenzy multiplier — and swallowed `t.hp -= dmg`. Damage was worked out and never applied to
anybody. Every hit in the game became cosmetic: a whole contest ran FOUR HUNDRED AND THIRTY-EIGHT
FIGHTS WITH NO CASUALTIES, every fight ran out its clock because nobody could fall, and the
fighters shot their magazines dry grazing each other.

It survived because of how it was checked. The combat suite's fight snapshots have a `--bless`
path, and three changes in a row had been blessed through it — the quirk hooks, the Ththyn's
flight, the tether. Each blessing was defensible alone; together they taught the suite to accept
whatever the engine now did, and a suite that accepts anything is not a suite. The snapshots
went green over a game where nobody could be hurt.

`sim/measure_fight.cjs` is the answer and it is now a gate: it measures the SHAPE of a fight —
mean turns, whether it ended because a side broke or because the clock ran out, casualties, hit
rate — against a hard band, and no blessing can silence it. Pointed at the broken tree it failed
in one line ("12 of 12 fights ran out the clock"), which is what the snapshots should have said.
With the line restored: 8.8 turns a fight, every one ended by a break, and a real contest back to
sixty fights, seventy-nine dead, five joins, two banners standing. THE RULE THIS LEAVES: a
snapshot may be blessed when a change is meant to move it, but never twice running without a
measure of shape beside it that was not blessed.

**The tether, and two more specials that were only ever data. *Built since this was written.***
THE TETHER: a Mon-Wa is one being in two bodies, and the two fought as strangers. The pair was
linked and the bond-shock roll fired when a half died, but the distance between them cost
nothing — the canon's own model ("separation costs −25 composure an exchange to both, plus aim
−4") was written down and never built. Inside the tether the halves steady each other a little
every turn; outside it both come apart, in composure and in aim, because it is one being. And a
half KEEPS STATION: a Mon-Wa weighs a tile by how far it leaves them from the other half, hard
once the tether is stretched — without that they were being punished for the engine's
indifference rather than for anything a manager or a captain did. Measured: strain fell from 256
turns to 149 across ten fights, so pairs hold together and break under pressure, which is the
texture the canon describes. A HUMAN LEADS: `captain_aptitude_bonus` read "feeds captain
fidelity" and fed nothing; captains decide now, so it is worth what it says — a human reads a
situation better than the sheet alone would. SVALBARD FIRE ON THE MOVE: `long_prime`
was data nothing read, and standing off to snipe was the wrong animal entirely — they are
quadrupeds built like cavalry. They shoot from the gallop: crossing ground costs them much less
aim than it costs anybody else, and four legs carry them two tiles further on a move. The data
says so now (`fire_on_the_move` replaces `long_prime` in races.json). Still inert: `media_flat` and
`english_loose`, both broadcast colour rather than mechanics.

**The fleet's only fliers actually fly. *Built since this was written.*** A Ththyn's wings
were in the data (`flier`, `winged`, `light_frame`), in the lore, and in the injury table — which
has a whole limb of wing wounds — and in nothing that moved: they walked like everybody else. A
flier now has the air available to it once a fight: `FLIGHT_TILES` further on one step, over
whatever was in the way, and hovering while they are up there, which is its own price because
nothing in the air is behind anything (`MOTION_HOVER`, and cover counts a grade worse against a
hoverer — both already in the engine, waiting). A hurt wing grounds them, which the injury table
was already deciding. Measured: twenty-seven flights across twelve fights. THE FIRST CUT OFFERED
THE AIR AFTER THE MOVE WAS CHOSEN, so the wings were never in the reckoning and no Ththyn ever
left the ground; the tiles are offered while the move is being weighed now, and taking a step
longer than legs could carry is what spends it. Racial specials still inert: `long_prime`,
`captain_aptitude_bonus`, `media_flat`, `english_loose`, and the Mon-Wa tether.

**A quirk says what it does. *Built since this was written.*** A quirk was a word on a card: a
manager read "Clause Reader" and learned nothing. The chip now carries its own mechanics, read
from the data rather than written twice — the stats it moves, and a plain reading of every hook
the engine actually consumes ("Trains 30% Faster", "Never Routs", "Asks More at the Table"),
with the flavour line beneath. A quirk whose hooks nothing reads says *Character, Not Mechanics*
and dims, because promising an effect that does not exist is worse than admitting there is none.
AND THERE WERE MANY: sixty-three of a hundred and forty hooks were read by nothing at all — a
fighter carried "nothing shakes him" and no part of the engine knew. Wired in this pass:
`development_rate_up` and `young_squadmate_development_up` (a quick study trains a third faster,
and an old hand aboard lifts the young), `reposition_speed_up` and `evasion_surge` (a step more,
and a step more when shot at), `rout_immune`, `morale_swings_damped` and `_amplified`,
`wounded_composure_bonus`, `composure_up_as_intensity_rises`. Fifty-four hooks and twenty quirks
are still decoration, and the tooltip is honest about which. The fight snapshots were re-blessed:
composure and movement changed, which is what wiring them means.

**Four hanging jobs, closed. *Built since this was written.***

**A joiner never priced its own nuisance.** The spoiler — what an OA costs a banner by
staying in the fight — was in the banner's CEILING (what it would pay to stop bleeding) and in
nothing the joiner ASKED FOR, so an OA that could see it was costing a banner a fortune sold
itself on its own odds alone and left the whole of that money on the table. A joiner now asks
for `SPOILER_ASK_BASE` of it, more if it is greedy. Joins hold at four to six a Divide.

**No two people with one name.** A fleet dealt the same Olmac title two and three times over;
a manager met two fighters called The Salt. Every draw keeps a book of names, seeded with the
roster's own so a new intake never offers a name already aboard, and a genuine second becomes
*The Salt the Younger*. Mon-Wa halves count as clashes, being names people are called by. THE
FIRST CUT OF THIS WAS A GLOBAL BOOK, and it broke the one rule the engine cannot break:
generation stopped being a function of its seed, because it depended on everything drawn
before it. The regression caught it in one run. The book is passed in by whoever is drawing.

**`BOARD_CUTS` re-measured.** The verdict cuts were set against a card pool that has since lost
two demands (losses and surplus, each a second reading of a standing demand) and gained a third
standing one (popularity). Over seventy-two card years the scores run p10 0.32, median 0.55, p90
0.78 — against the old cuts a board was delighted ONCE in seventy-two years and content in half
of them. The cuts follow the distribution now (0.78 / 0.66 / 0.44 / 0.33) and the moods spread:
8 delighted, 18 pleased, 18 content, 7 disappointed, 13 unhappy, 8 asking questions.
`sim/measure_board.cjs` is the instrument.

**Named claim pricing was not missing.** The note said it had no anchor; it has one — units ×
the banner's odds × `CLAIM_FORECAST` × what that category is worth to each side, in the same
credits as a haul. Nothing to build; the note was stale.

**What an OA paid to keep quiet can be found. *Built since this was written.*** An act that
goes off clean is not an act nobody could ever prove: it leaves a trace in the year's paperwork.
A scout sent into another OA's books turns it up when the dossier is read past `DIRT_AT`
(three quarters), at odds that read from the thing itself — more done this year is easier to
find, an OA already in bad odour with the Aleas is watched harder, and an act that was HUSHED
is much harder to turn up, which is what the hush was for. THE DIRT IS A BONUS, NOT A
SUBSTITUTE: the row the scout was sent for lands either way, or scouting a dirty OA would
punish you for its luck. What you hold, you can spend three ways, each answering to a different
audience: BLACKMAIL (they pay a share of their purse and nobody else learns — they remember it
against you), LEAK IT (the fleet reads it by morning and their standing craters; the fleet has a
word for an OA that prints another's business), or REPORT IT (the Aleas fine them and thank
you for it; the fleet likes an informer rather less). Evidence keeps for the year and the next.
IT RUNS BOTH WAYS: an AI OA that holds something on you uses it in its own character — the
treacherous blackmail, the traditional report, the loud leak — which is what makes your own
Back Room a risk rather than a purchase.

**The fight says what decided it. *Built since this was written.*** The tactical fight was a
black box a manager could only watch: kit, cover, stance, morale and a captain's stats all fed
it, and the only feedback was a replay of an outcome. Two answers, both read off the fight's own
record so neither can disagree with what happened. EVERY SHOT SAYS WHY IT WAS THAT LIKELY:
`hitChance` names the two or three things that moved it most, in the order they mattered — Hard
Cover, Long Range, Flanked, Unspotted, Overwatch, Suppressed, Caught Crossing, Treating the
Wounded, Low on Rounds — and the feed prints them beside the percentage on every shot, hit or
miss. WHAT DECIDED IT: under the result, a reading of the whole engagement side by side — shots
taken, the share that hit, how many were put down, how many were shooting from overwatch, and
what the shots were mostly taken against. A manager who loses a fight can now see that his
people shot at hard cover forty times while the other OA shot at men in the open.

**The wall says when it moves. *Built since this was written.*** The dome is the clock the
whole contest runs on and it existed as a dashed circle that told nobody anything until it had
already closed. `wallSchedule` hands the window the beats still to come; the day head reads *The
Wall Closes Day 13 · in 4 · to 52%* (gold at three days, red at one, and it names the last
ground), and the Ground draws the next beat's circle, dated, inside the one that stands. A
manager plans against the second circle.

**The stores while the contest runs, and rounds that can run out. *Built since this was
written.*** Two things the Divide never showed a manager. THE STORES: the units an OA works
out of the ground are the point of the contest and the measure the board asks in, and they were
visible only on next year's Board. The day head reads them now — *Worked Fuels 2/3 · +4 Open* —
what is in hand by category, against what the board asked for, beside what is still open in the
ground that the OA knows of. AMMUNITION: it was a flag that made the next fight better and
was invisible until a squad was dry inside one. It is a store like rations now (`AMMO_LOAD`,
spent an engagement at a time), it reads on the squad rows beside the rations bar, a dry squad
shoots worse (`AMMO_DRY_AIM`), and a squad low on rounds *wants* a munitions drop — which is
what that site was always for.

**A deposit, not an assay. *Built since this was written.*** The site a squad works was an
"ore assay" whatever the ground held — which read as mining where the haul was grain or water,
and "assay" is a surveyor's word for a thing a squad does with its hands. The type is
`resource_site` now and a deposit is named for its category: a SEAM (minerals), a WELL (fuels),
a STAND (foods), a VAULT (luxuries), each carrying its category on the objective itself. The
verb is WORKING A DEPOSIT, not digging. And the settlement says what it is: the units an OA
works out of the ground go to ITS OWN STORES — that is the point of the Divide, and the board's
demand is written in those units — while the credits on the settlement line are the second half
of it, the fleet buying what an OA does not need at `HAUL_VALUE` a unit. The line is a sale,
not a fee for collecting. (`oreCredit` → `hauled`, `ASSAY_VALUE` → `HAUL_VALUE`, the ledger's
`assay` → `haul`.)

**The captain decides, and captains differ. *Built since this was written.*** Every squad
weighed its choices with the same cold arithmetic, so a squad led by a brilliant tactician
behaved exactly like one led by a frightened corporal. A captain brings three things to a
decision now: JUDGEMENT (tactics) — how sharply the weighing favours the strongest need, so a
poor captain draws nearly at random from what seems reasonable and a great one almost always
takes the best answer; SIGHT (fieldcraft) — how much of the OA's picture the captain is
actually weighing, a poor one reading only what is close; and NERVE (resolve and presence) —
whether the numbers are read hopefully or fearfully, a frightened captain seeing more of them
than there are and choosing accordingly. A good captain's plan also stands longer before it is
rethought. Fatigue and stress wear all four down. THE STATS RUN WIDER THAN A HUNDRED — a
roster's tactics run about 14 to 144, the middle near 95 — so a captain is read against the
spread the game actually deals (`MIND_LOW`/`MIND_MID`/`MIND_HIGH`); read against a hundred,
every captain came out excellent. The Table's squad rows name the captain and say how they are
reading the ground: Sharp, Steady or Struggling; Cool, Holding or Shaken; and how much of the
picture they can see.

**Two levers, and the rest is the squads'. *Built since this was written.*** Per-squad orders
were the wrong game — a manager does not tell a squad where to walk. He has TWO LEVERS: the
stance, and a LEANING on each other OA, one to five (three is nothing), saying which of them
he would rather his people found. A leaning multiplies how near a rival READS when a squad
chooses whom to seek or avoid — leaned toward, an OA feels closer than it is; leaned away,
further — so it never forbids and never orders, it puts a thumb on a scale the squads are
already weighing. An AI OA leans by its own regard, seeking out the OAs it thinks least
of. What a squad then does is entirely its own, and THE LIST OF WHAT IT MAY DO IS LONGER: with
the manager out of it, variety costs nothing. Entrenching (good ground, a wall coming, let them
come to it), baiting (be seen, on ground of our choosing), sweeping (walk the ground nobody has
walked — sites are found by looking) and pressing (they are hurt and near: do not let them mend)
join hunting, scouting, hiding, prospecting, resupplying, recovering, consolidating, rallying,
shadowing and screening, each leaned by stance. AND THE PICK IS A WEIGHING, NOT A MAXIMUM:
taking the highest need meant four or five loud approaches were the only ones a contest ever
saw, because a squad with a reason to hunt never entrenched however sensible it was. Every
approach with a real need goes in a hat weighted by that need (`APPROACH_SHARPNESS`), so the
loud ones still dominate and the quiet ones happen — measured across five contests, thirteen of
the fourteen appear.

**Orders at the window. *Built since this was written.*** A manager's squads take orders in
the planner's own vocabulary — Hold, Move, Dig a site, Meet a squad, Hunt a squad the OA has
seen, Fall Back — on the Table's squad rows, each a menu built from what the OA knows: the
sites revealed, its own squads, the picture's sightings (with the OA, the count, and when).
*(Retired one step later: see "Two levers" above. The squad rows still say what each squad is
doing — holding, digging, shadowing, pressing — because watching them decide is the point.)*

**The dispersed drop — step three, the picture and the squad mind. *Built since this was
written.*** What an OA knows of everyone else is a PICTURE now (`corp._picture`: where a
foreign squad was when it was last seen), not the `flares` that handed every corp every live
position every dawn. The picture is written by the posted landings (every OA, day one, good
for `LANDING_KNOWN_DAYS`), by contact (both sides and their banners, when detection passes),
and by the relay mast (everyone under the tower's banner); it is read fresh, a sighting older
than `KNOWN_STALE` dropped. The dawn planner — strikes, pincers, hunting, hiding, the rest —
runs on the picture, so a squad hunts what its OA has seen, not what exists. The squad mind
gains RALLYING: an OA spread by its draft, with a stronger known enemy within
`RALLY_THREAT_RANGE`, gathers at its own centre inside the wall (`meet`), leaned toward by the
careful stances and away from by death-or-glory. Measured with the picture and a random strict
draft against today's grouped landing at today's radius: week-one fights the same (18–29 against
22–34), deaths the same (54–68 against 60–64), contests a little longer; a larger ring runs the
contest to the last day without changing the deaths. The radius stays where it is. The fatality
pass — half the drop dies — is the next piece, and it is now the only thing between the
dispersed drop and a contest that plays the way it was ruled.

**The dispersed drop — step two, the draft. *Built since this was written.*** At the seam the
twenty-four slots are drafted: the OAs in order of strength as the fleet reads it
(`strengthRead`: the drop's quality and size, and standing with the fleet), weakest first,
three rounds, strictly. An AI's pick (`chooseSlot`) values a free slot by what its survey lets
it see — the prize and the cover by its greed — and by who has landed within two slots of it:
a stronger neighbour it can beat draws an aggressive OA, a stronger one it cannot repels a
careful one; its own earlier picks draw a careful OA together and push an aggressive one
apart to flank. Every pick is posted. The Drop page IS the draft now: the order strip with
each OA's picks, the map with every slot numbered and filled in its OA's colour as it
goes, your turn a click on a free slot, your three landings read at your survey's depth, every
landing listed, Drop when it is done. A human picks through `draftPick`; a fleet without one
finishes the draft itself at the seam; `choices[id].slots` carries a remote human's picks.
Measured: a careful OA takes three neighbours (6, 7, 8); an aggressive one spreads
(2, 21, 13).

**The dispersed drop — step one, the ground for it. *Built since this was written.*** Ruled:
squads do not drop together. Twenty-four slots round the ring, drafted among the OAs lowest
standing first, strictly (no snake — a snake would let the strongest cluster two squads); every
OA knows where every other came down, and nothing after. Step one lays the ground: the ring
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
every OA sends someone — and is named by clicking a fighter card; its result, both fours
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

**The Eight. *Built since this was written.*** M8: one name from each OA — the manager's
choice on the Desk from the fit and unrole'd, or the OA's best named for it; declining is
seen (`declined_the_eight`, the fleet and your own people). The eight are seeded by standing
with the fleet, 1·4·5·8 against 2·3·6·7, and fight once on the tactical grid with real kit,
death-or-glory policy, nobody able to call a withdrawal (`noWithdraw`), real deaths — under a
stun-grade edict the year's rule applies here too. Every entrant pays `EIGHT_ENTRY` into a pot
the Aleas top up (`EIGHT_PURSE`); the winning four split it, take `won_the_eight` and the
fame; the dead of The Eight count against the board's Casualties like the Divide's. The Desk
carries the seeding before, the result and a Watch after; the recap says how your fighter's
four did. Measured: one to three of the eight die a year. Every OA plays it through
`choices[id].eight` / `nameForEight`, the AI naming by fame and stats.

**The fleet's month. *Built since this was written.*** (Phase 2b.) M7 brings one thing with
fleet-reaching scope, the same card to every OA (`FLEET_POOL` in events.js, seeded by the
world): the Aleas close the wall early (the dome's schedule compressed to `FAST_WALL` of its
days); a stun-grade Divide (every fatal round converted, the way the Dividend's are); pacts
forbidden (the Table's truce says so); the survey goes public (every OA reads the planet to
depth two); an Aleas levy at the lock; a glut or a shortage that moves the shelf's prices for
the year (`priceMult`, the shelf tags it Glut or Shortage). An edict can be petitioned against
for `PETITION_COST`; if `PETITION_SHARE` of the fleet petitions it is withdrawn. The AI
petitions as a stance — an OA the edict cuts against by temperament pays to say so — so an
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
it bit. An OA that wrote and got no answer: the letter lapses at the month's end and the OA
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
is laid out as the genre lays it out: the two OAs at the head with their treasuries and how
they regard you; the pressure bar across the page with a one-line verdict (They Would Sign ·
Short by ₡N · They Would Not Entertain This); *Your Terms* and *Their Terms* as facing tables
— type, name, value — with a filter (All · People · Gear · Intel) and credits TYPED into a
box, not clicked in lumps of ten thousand; gear grouped by type with its tier badge and a
quantity of the stock to trade, where the old list moved the whole holding or nothing; the
contract as it stands beneath, each line keeping what its row showed (the race-coloured name,
the tier badge, the sub-line) with its value and a cross; Reset and Make the Offer at the foot.
The placard about contracts travelling with the body is gone. THE OTHER OA'S PURSE IS
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
CHANCE, never a wall (`pactChance`): an OA ahead of you wants paying and credits pay — a
sweetener up to `PACT_CREDIT_SCALE` of the pot — and an OA behind you wants the quiet and
mostly says yes. The old `pactViability` refused "too close to be worth their while" and "you
are doing better than they are" outright; the first is a price now and the second was
backwards. Only structure closes a way: a banner already joined, an OA under another's, a
OA that does not deal. The beam is a verdict in one line — They Would Sign · Short by ₡N ·
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
banner asks, the stronger grants or refuses (a thrifty OA more readily) — and it can be
torn up, which the crowd sees. The Deal's pact card says all of this where it is offered; the
word "pact" alone had said none of it.

**The Table takes the Talks' shape. *Built since this was written.*** The negotiation has
its own page on the Divide's rail, *The Deal*, beside the Table: a strip of every other
OA — mark, colour, odds on the board, and where it stands to you (Your Banner, Under You,
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
no fixed price for a unit: each OA values a category by its own WANT (`wantOf` — an empty
hold and a board that asks, doubly if it is the card's priority), so an offer reads two ways —
worth to the joiner, cost to the principal — and `evaluateOffer` checks each against its own
side's bound. An OA short of food will sign for food an OA stocked with food gives up
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
OA accounts for while it stays out fighting, added to the banner's gain — a weak OA's
leverage, priced at nothing before; the beam reads it as "Their Leverage: Staying in the Fight
Costs the Banner ₡N". HELD OUT (`held_out`): an OA whose banner's odds fell under 0.15 and
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

## The Dividend takes the floor. *Ruled and built.*

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

## They are OAs, never OAs. *Ruled.*

An Opes Arx is a megacorporation. "OA" was never established anywhere in the lore — it
crept in through interface text and code shorthand and then read as canon. Interface copy says
**OA**, or the OA's name, or megacorporation; never "OA", singular or plural.

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
