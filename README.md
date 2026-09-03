# Opes Arx: The Capital Divide

A management sim. You run a corporation that fields a squad in a lethal annual contest for
mineral rights, and **you never aim a gun**. You choose who to hire, who to send, what they
carry and what deals you'll take — then you watch.

**Demos:** every page in `viewers/` runs the live engine in the browser rather than replaying a
recording. Start with `the_corp.html` — the full management surface (Desk, Roster, Squads,
Negotiation, the Board) for playing a year. The contest and the firefight are drawn inside it,
as tabs of the Divide.

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
node audit_cross.cjs            does one step's work reach the next, or just sit there

cd ../harness
npm install                     once, for jsdom (node_modules is gitignored)
node drive.cjs                  93 checks · drives the BUILT page through a whole year
```

If the code and the document ever disagree, **the code is right** and the document is stale.

## The one thing worth knowing

The fault this project keeps producing is not broken code. It is code wired to a condition that
never becomes true — and it is only ever found by running the thing and measuring it. The suite
catches regressions and cannot catch absences: it stayed green through a fighting withdrawal
that had never once executed, a courting delay that resolved to `undefined`, and five counters
that reported a confident zero because they were quietly `NaN`.

So: play it before you change it.
