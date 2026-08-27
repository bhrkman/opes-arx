/* DOES THE QUARTERMASTER'S ARITHMETIC BALANCE? Found while unifying, not while looking.
 *
 * One plan, three ledgers that must agree: what left the rack (stock before minus stock
 * after), what the bodies carry, and what cash was spent. Conservation says
 *     carried  =  drawn from rack  +  bought with cash
 * item by item, on EVERY plan — the founding one, a re-plan on returned stock, and the
 * re-plan after casualties, which is the one that used to fail.
 *
 * The fault was never in the plan's own arithmetic: it was in the DEAL. Squad kit was
 * distributed role-wise round-robin with no regard for squad sizes, so an uneven force
 * handed one squad more kits than people (the extras were dropped — drawn, paid for,
 * carried by nobody, and gone from the world since no body returns them) while another
 * squad armed its last body from the fallback loadout (kit nobody drew and nobody paid
 * for). The vanished items were re-bought on the next plan and could vanish again — a
 * standing bill. A second, smaller stall: for drops under six, the composition
 * reconciler jammed against its every-squad-keeps-every-role floor and planned for more
 * bodies than existed. Both fixed; this probe is the invariant that keeps them fixed.
 *
 *   node probe_plan_stock.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const ROSTER = require('./roster.js');
const ITEMS = require('./items.js');
const DIVIDE = require('./divide.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const seed = process.argv[2] || 'corp-1';
const rng = P.mulberry32(P.seedFrom(seed));
const corps = SEASON.openFleet(rng, OA, {});
const me = corps[OA[0].id];

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };

function measure(label, drop, exitOnFail) {
  const pre = Object.assign({}, me.armoury);
  const per = { drop: drop, account: me.account, armoury: me.armoury, intel: 0 };
  const c = DIVIDE.buildCorp(rng, me.profile, 'standard', undefined, null, null, null, per, 1);
  const post = per.stockLeft || me.armoury;
  if (per.stockLeft) me.armoury = per.stockLeft;

  const carried = {};
  drop.forEach(b => {
    const add = id => { if (id) carried[id] = (carried[id] || 0) + 1; };
    ['primary', 'armor', 'sidearm'].forEach(s => add(b.loadout && b.loadout[s]));
    ((b.loadout && b.loadout.mods) || []).forEach(add);
    ((b.loadout && b.loadout.consumables) || []).forEach(add);
  });

  console.log(label + ' · drop ' + drop.length + ' · cash spent ' + (c.kitSpend || 0));
  let vanished = 0, vanishedValue = 0, conjured = 0, cashAccounted = 0;
  const all = new Set(Object.keys(pre).concat(Object.keys(post)).concat(Object.keys(carried)));
  for (const k of [...all].sort()) {
    const drew = (pre[k] || 0) - (post[k] || 0);
    const diff = (carried[k] || 0) - drew;
    const it = ITEMS.byId(k);
    if (diff > 0) { conjured += diff; cashAccounted += diff * ((it && it.cost) || 0); }
    if (diff < 0) { vanished += -diff; vanishedValue += -diff * ((it && it.cost) || 0); }
    if (diff !== 0) console.log('  ' + k + ' · drew ' + drew + ' · carried ' + (carried[k] || 0) +
                                ' · ' + (diff > 0 ? '+' : '') + diff + ' (cost ' + ((it && it.cost) || '?') + ')');
  }
  const moneyOk = cashAccounted === (c.kitSpend || 0);
  const kitOk = vanished === 0;
  if (exitOnFail) {
    check(moneyOk, 'cash spent equals the catalog value of items bought beyond the rack');
    check(kitOk, 'nothing leaves the rack without landing on a body');
  } else {
    console.log((moneyOk ? '  ok    ' : '  FINDING  ') + 'money: wallet paid ' + (c.kitSpend || 0) +
                ' · items beyond rack draw are worth ' + cashAccounted +
                (moneyOk ? '' : ' — the plan bought kit it was holding, or was handed kit unpaid'));
    console.log((kitOk ? '  ok    ' : '  FINDING  ') + 'kit: ' + vanished +
                ' item(s) worth ' + vanishedValue + ' left the rack and landed nowhere');
  }
  return { carried: carried, spend: c.kitSpend || 0 };
}

/* ---- phase 1: the founding plan — this one must always balance ---- */
const drop = SEASON.selectDrop(me, {});
const first = measure('founding plan', drop, true);

/* ---- phase 2: hand everything back and plan the same drop again ---- */
drop.forEach(b => {
  const give = id => { if (id) me.armoury[id] = (me.armoury[id] || 0) + 1; };
  ['primary', 'armor', 'sidearm'].forEach(s => give(b.loadout && b.loadout[s]));
  ((b.loadout && b.loadout.mods) || []).forEach(give);
  ((b.loadout && b.loadout.consumables) || []).forEach(give);
});
console.log('every carried item handed back to the rack; planning the same drop again —');
measure('second plan on returned stock', drop, true);

/* ---- phase 3: a real fight, the page's own partial return, and a re-plan ----
   This is the state the unified page reaches all day: casualties off the roster, the
   fought squad's stores counted spent, the dead man's kit left on the ground. */
const TAC = require('./tactical.js');
const rv = corps[OA[1].id];
const rdrop = SEASON.selectDrop(rv, {});
const rper = { drop: rdrop, account: rv.account, armoury: rv.armoury, intel: 0 };
/* rebuild ours so squads exist for the fight */
const per3 = { drop: drop, account: me.account, armoury: me.armoury, intel: 0 };
const meC = DIVIDE.buildCorp(rng, me.profile, 'standard', undefined, null, null, null, per3, 1);
if (per3.stockLeft) me.armoury = per3.stockLeft;
const rvC = DIVIDE.buildCorp(rng, rv.profile, 'standard', undefined, null, null, null, rper, 1);
const sq = meC.squads[0], rsq = rvC.squads[0];
const A = DIVIDE.liveSquad(rng, meC, sq, 1, 0, ROSTER.traitById);
const B = DIVIDE.liveSquad(rng, rvC, rsq, 1, 0, ROSTER.traitById);
TAC.resolve(rng, A, B, { terrain: 'broken_ground', openingBand: 1, prep: [0.48, 0.87], log: [] });
const bag = () => ({ dead: 0, captured: 0, injured: 0, careerEnded: 0, lightWounds: 0,
                     audit: { capturedAlive: 0, medkitsUsed: 0, untendedWounds: 0, stressApplied: 0 } });
const act = q => q.bodies.filter(b => b.status === 'active');
DIVIDE.applyOutcome(sq, A, bag(), rvC.id, { corp: rvC, bodies: act(rsq) });
DIVIDE.applyOutcome(rsq, B, bag(), meC.id, { corp: meC, bodies: act(sq) });
const foughtIds = {};
sq.bodies.forEach(b => { foughtIds[b.id] = true; });
drop.forEach(b => {
  if (b.status === 'dead' || b.status === 'captured') return;
  const give = id => { if (id) me.armoury[id] = (me.armoury[id] || 0) + 1; };
  ['primary', 'armor', 'sidearm'].forEach(s => give(b.loadout && b.loadout[s]));
  ((b.loadout && b.loadout.mods) || []).forEach(give);
  if (!foughtIds[b.id]) ((b.loadout && b.loadout.consumables) || []).forEach(give);
});
const drop3 = SEASON.selectDrop(me, {});
console.log('a real engagement settled (' + drop.filter(b => b.status !== 'active').length +
            ' of ours off the roster); partial return made; planning the post-fight drop —');
measure('re-plan after casualties', drop3, true);

console.log(failed
  ? '\n' + failed + ' CONSERVATION CLAIM(S) FAILED — the deal or the reconciler has regressed'
  : '\nevery plan balances — the quartermaster\'s arithmetic conserves');
process.exit(failed ? 1 : 0);
