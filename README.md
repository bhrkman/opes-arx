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
| `docs/PROJECT.md` | **The only document.** What was decided and what was rejected. The code holds every number; this holds the reasoning and, crucially, records what is *absent* — which no audit can see. |
| `docs/SETUP.md` | Getting the repo and the hosted demos running, once. |
| `docs/HUB.md` | How the project is run: a hub that decides, branches that build. |
| `docs/BRIEF_FOG.md` | The next step out. |

## The gate

```
cd sim
node arx.cjs regress --fast     114 checks · the edit loop
node arx.cjs regress            249 checks · the full shipping gate, before packaging
node audit_open.cjs             what is actually built, tested by running the game
node audit_docs.cjs             does the document still agree with the code
node ../harness/audit_ui.cjs    the UI audit: Title Case, no explanatory prose, colour from the
                                conventions — run after every change to the page; it fails
node audit_cross.cjs            does one step's work reach the next, or just sit there
node audit_hooks.cjs            every trait hook does something or says why it does not
node audit_code.cjs             dead functions, unread constants, helpers written twice
node measure_fight.cjs          the shape of a fight
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
