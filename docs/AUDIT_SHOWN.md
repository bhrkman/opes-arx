# AUDIT 2 · What is shown or sold, and does not do what it says

*The reverse of audit 1: something the player can see, buy or choose that does not simulate what it
claims — or runs on an older system than the one it describes (the crates from the sites were the
model case: a unit shown and priced that meant nothing at either end).*

## Found so far

| what | what it claims | what it actually does |
|---|---|---|
| **Spotter Drone** | Strips the enemy's unspotted status; +0.30 detection | ~~Nothing~~ **FIXED:** reveals everything under it for four turns; on the replay. |
| **Auto-Turret** | Fires each exchange from hard cover for four exchanges | ~~Nothing~~ **FIXED:** fires once a turn for four turns at a good fighter's rate; on the replay. |
| **Stim Shot** | +25 composure to a squadmate | **Nothing.** Its action (`dose`) is handled nowhere. |
| **Thermobaric Charge, Cortical Scrambler, Broadcast Jammer** | Destroy a cover pool; force tether strain; take a fight off air | **Nothing.** No action handled. |
| **Field Medkit** | P(stabilise) +0.15 | **Half.** Counted at squad level and spent mending the wounded after a fight; never acts inside the grid fight. |

*The grid fight handles consumables BY NAME and knows five: frag grenade, smoke canister,
incendiary charge, ammunition satchel, power cell.*

| **Smoke** (on the replay) | A screen on the ground | **Worked, never drawn** — a replay frame recorded only the fighters. **FIXED.** |
| **The abstract model's turret and drone** | Constants, tuned and commented | Read by nothing since the grid replaced that resolver. **Retired.** |

## Pass one: items and traits

*Method: `harness/audit_shown.cjs` lists every tag, action and effect field an item declares that
the engine never names; each hit was then traced by hand, because names can be read by pattern (a
tag table keyed by bare names, `w.power` rather than `'power'`). What survives is below.*

### Weapon tags — WORK (and the check that proves it)

The grid's hit roll (`hitChance`), aim (`aimEff`) and wound roll (`resolveSeverity`) all run every
tag through `combat.js`'s tag table, and missed shots run its `onMiss` — so the tags the sweep could
not see by name (`pierce_1/2/3`, `flechette`, `smart_link`, `single_shot`, `recoil_heavy`,
`min_band_medium`) are live on the grid. Unlike the turret, the tag table survived the move from
the abstract model.

### Two tags with no handler

| item | the claim | what happens |
|---|---|---|
| **Solar Accumulator Rifle** | *"Drinks the day. Dreads the night."* — the `daylight` tag | Time of day was cut, and the tag with it. **An ordinary energy rifle sold as something it is not.** |
| Ablation Lance, Plasma Caster | `vent_2` | Heat venting went out with overheat. Leftover data; neither description mentions it. |

### MODS — eleven of eighteen did nothing · **FIXED (sixteen of eighteen now work)**

`resolve` — which turns a loadout into the kit a fighter fights with — reads exactly ONE field from a
mod: `grants`, a tag it adds. Every other effect is dropped there, and nothing else reads the mods.

| works | does nothing | works in part |
|---|---|---|
| grip (stabilized), incendiary, hollowpoint (flechette), broadcast tag (crowd pleaser), suppressor (silent) | **optic** (accuracy), **bipod** (steady / moving aim), **target link** (overwatch ×1.6), **light frame** (bulk, power), **rangefinder** (range mismatch halved), **field kit** (gear damage halved, cancels fragile), **extended mag** (+6 rounds), **recoil comp** (suppression drain, cancels heavy recoil), **heat sink** (heat — and heat is gone), **capacitor** (+18 charge), **focusing array** (+1 power, heat) | **AP rounds** and **diffuser** add their tag but lose their **power −1** — `resolve` takes power from the gun alone |

**₡3,190 of mods at list price that did nothing when fitted.** **FIXED:** `resolve` folds every effect a
mod declares into the kit (`kit.mod`) and combat reads it — the optic +1 aim, the bipod +2 held and −2
moving, the target link +2 on a reaction shot, the rangefinder halving the wrong-range penalty, the
extended mag +6 rounds, the capacitor +18 charge, the recoil comp a round cheaper to suppress with and
cancelling heavy recoil, and every power change including AP rounds' and the diffuser's. Proven off the
combatant that walks onto the grid by `harness/probe_mods.cjs`. **Two stay inert, their system gone:
the heat sink (heat was cut) and the field kit (gear damage does not exist).** A ruling: retire them,
or give them something to do. The consumable actions (`throw`,
`carry`, `treat`, `dose`) are unused as NAMES but the items work by id, except the stim shot and the
medkit on the grid (above).

### TRAITS — three hooks read by nothing

| trait | the claim | what happens |
|---|---|---|
| **Psion: Pressure-Read** | *"Sits in on negotiations. Tells you, afterward, which offers were bluffs."* | ~~Nothing~~ **FIXED, re-aimed.** The offers it was written for — concession asks — went with joining. A YES to a withdrawal is the offer that can be a bluff, so a psion on your roster now reads each one: *Meant*, *Doubtful*, *A Bluff* — the same chance the settlement rolls (treachery, less the weight of the promise). Gated in `drive_withdraw`. |
| Cradleborn Resentment | serves the fleet that spent its homeworld | hook `delicacy_harvest_friction` read nowhere — flavour, but a dead mechanic |
| Ankoth Sympathizer | privately sides with the banished | hook `hidden_leaning` read nowhere — flavour, but a dead mechanic |

### NEGOTIATION — three panels that can never fill

Counted over 66 windows in four contests, the manager was offered **456 pacts and 245 ransoms, and
nothing else**. *Asks to Concede You*, *Would Take You* and *Can Join* — `table.asks`, `wouldTake`,
`canJoin` — were **zero every time**: they belonged to joining, which the withdrawal redesign removed.
The page still carries the code that draws them; they are inert. A ruling: strike them.

### Resolved this pass

The psion is **cut**, not re-aimed. The heat sink and field kit are **cut**. The joining panels and
the deals built on them are **cut** — and the OA picker, which labelled every OA "0%" off them, reads
live contact now. AP rounds and the bipod are retuned so each does something worth its price.

### DAY AND NIGHT — present, and nearly inert

Six blocks of day and six of night. Night costs a marching squad fatigue and tags the fight; the −2
aim penalty written for it never reaches the grid, and two traits and the Solar rifle depend on it.

## Still to sweep

The seven stats (is each read where it is said to matter); sponsor standings and their stated effects;
facilities and their stated effects; the Board's demands and what scoring actually weighs; site types (after this pass's rework); the negotiation terms offered against what
the settlement pays; anything on the page that quotes a number the engine does not produce.
