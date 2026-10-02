# Opes Arx: The Capital Divide

A management sim. You run a corporation that fields a squad in a lethal annual contest for
mineral rights, and **you never aim a gun**. You choose who to hire, who to send, what they
carry and what deals you'll take — then you watch.

**The game** is one page: `index.html` (also `viewers/the_corp.html`), built from
`viewers/corp_template.html` by `sim/build_corp.cjs`, with the live engine inlined. Every surface
— the Desk, the Roster, the Squads, the Market, Negotiation, the Board, the Ground and the firefight —
is a tab of it. The single-surface dev viewers that used to sit beside it were retired.

## Where to start reading

| | |
|---|---|
| `docs/PROJECT.md` | The vision the rules serve and the rulings that bind them. The code holds every number. |
| `sim/` | The engine: `season.js` (the year), `divide.js` (the contest), `tactical.js` (a fight), `negotiate.js`, `events.js`, `sponsors.js`, `reputation.js`, `items.js`, `roster.js`, `map.js`. |
| `viewers/corp_template.html` | The page. `node sim/build_corp.cjs` inlines the engine and writes `index.html`. |
| `data/` | The catalogues: peoples, traits, items, OA profiles. |

Hosting is any static host pointed at the repo root; `index.html` is the whole game.

## The gate

```
cd sim
node arx.cjs regress --fast     191 checks · the edit loop
node arx.cjs regress            278 checks · the full shipping gate, before packaging
node audit_open.cjs             what is actually built, tested by running the game
node audit_docs.cjs             does the document still agree with the code
node ../harness/audit_ui.cjs    the UI audit: Title Case, no explanatory prose, colour from the
                                conventions — run after every change to the page; it fails
node audit_cross.cjs            does one step's work reach the next, or just sit there
node audit_hooks.cjs            every trait hook does something or says why it does not
node audit_code.cjs             dead functions, unread constants, helpers written twice
node measure_fight.cjs          the shape of a fight
node ../harness/ground_view.cjs [out.html] [seed…]
                                the rebuilt ground, drawn: generated worlds as the Ground page will show them
node probe_sponsor.cjs          the sponsor board's rules

cd ../harness
npm install                     once, for jsdom (node_modules is gitignored)
node drive.cjs                  93 checks · drives the BUILT page through a whole year
node drive_*.cjs                one surface each: the draft, the map, the market, the reserve, the withdrawal…
node probe_*.cjs                seats, secrecy, handover, resume, time, the wall, the market, the reserve
node stat_scale_proof.cjs check the fight resolver against its recorded baseline (record after a behaviour change)
node fingerprint_human.cjs check a person's seat changes nothing the engine would not (record likewise)
node audit_halfbuilt.cjs        what the page shows that the engine does not do

The balance-measurement tools (`measure_*`, `probe_*` in `sim/`) were deleted by ruling: they measured
questions that are parked, against an engine that has moved on. Write fresh ones when balance resumes.
```

If the code and the document ever disagree, **the code is right** and the document is stale.

## The one thing worth knowing

The fault this project keeps producing is not broken code. It is code wired to a condition that
never becomes true — and it is only ever found by running the thing and measuring it. The suite
catches regressions and cannot catch absences: it stayed green through a fighting withdrawal
that had never once executed, a courting delay that resolved to `undefined`, and five counters
that reported a confident zero because they were quietly `NaN`.

So: play it before you change it.
