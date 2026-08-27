/* THE FIRST LINK OF UNIFICATION — are the bodies hired at the bench the bodies that fight?
 *
 * One question, proved by construction before any page is built on it: found one fleet, hire
 * ONE fighter by a named human bid in a contested market, lock the drop, fight one engagement,
 * settle it — and at every joint assert OBJECT IDENTITY, not name-matching. The unit on the
 * grid must BE the roster body, so that what the fight does to it is already on the roster.
 *
 * It deliberately contains NO builder of its own. Founding, the market, the lock, the
 * equipping, the fielding and the settlement are all the engine's exported functions — the
 * same calls the unified page makes — so this cannot drift into measuring a frozen mirror.
 *
 *   node probe_corp_link.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const ROSTER = require('./roster.js');
const ITEMS = require('./items.js');
const LED = require('./ledger.js');
const DIVIDE = require('./divide.js');
const TAC = require('./tactical.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const seed = process.argv[2] || 'corp-link-1';
const rng = P.mulberry32(P.seedFrom(seed));

let failed = 0;
const check = (ok, what) => {
  console.log((ok ? '  ok    ' : '  FAIL  ') + what);
  if (!ok) failed++;
};

/* ---- found: the engine's own fleet, one shared corporation picked from it ---- */
const corps = SEASON.openFleet(rng, OA, {});
const meId = OA[0].id, rivalId = OA[1].id;
const me = corps[meId], rival = corps[rivalId];
console.log('founded the fleet · playing ' + meId + ' vs ' + rivalId);
console.log('  roster ' + me.roster.length + ' · treasury ' + me.account.treasury);

/* ---- hire: one fighter, a named human bid, the whole fleet bidding against it ---- */
const lot = SEASON.openLot(rng, 'mercs');
const rosterBefore = me.roster.length, cashBefore = me.account.treasury;
let hired = null, outbid = 0;
for (const f of lot) {
  const ask = SEASON.askingPrice(f);
  const budget = SEASON.signingBudget(me);
  const bid = Math.min(Math.floor(budget), Math.round(ask * 1.8));
  if (bid <= 0) continue;
  const tally = { lot: 0, unbid: 0, bids: 0, refused: 0, tookLessForSafety: 0,
                  signed: 0, results: [] };
  SEASON.runMercMarket(rng, corps, Object.keys(corps), [f], tally,
                       { [meId]: { [f.id]: bid } });
  const r = (tally.results || [])[0];
  if (r && r.to === meId) {
    hired = f;
    console.log('hired ' + f.name + ' at ' + r.at + ' (asked ' + ask + ') against ' +
                (r.offers.length - 1) + ' rival offer(s)');
    break;
  }
  if (r) { outbid++; console.log('  outbid on ' + f.name + ' — went to ' + r.to + ' at ' + r.at); }
}
check(!!hired, 'somebody signed to us out of a lot of ' + lot.length +
               (outbid ? ' (outbid ' + outbid + ' time(s) first — the market is contested)' : ''));
if (!hired) process.exit(1);
check(me.roster.length === rosterBefore + 1, 'roster grew ' + rosterBefore + ' -> ' + me.roster.length);
check(me.roster.indexOf(hired) >= 0, 'the hired body IS a roster object (identity, not a copy)');
check(me.account.treasury !== cashBefore || (hired.contract.signing_cost || 0) === 0,
      'signing charged the shared treasury: ' + cashBefore + ' -> ' + me.account.treasury);

/* ---- lock: the engine picks the drop; the manual path is the game's own named-list lock ---- */
let drop = SEASON.selectDrop(me, {});
if (drop.indexOf(hired) < 0) {
  const ids = [hired.id].concat(drop.map(f => f.id)).slice(0, drop.length);
  drop = SEASON.selectDrop(me, { manual: ids });
  console.log('  (hired fighter missed the auto lock; named on the manual lock instead)');
}
check(drop.every(f => me.roster.indexOf(f) >= 0), 'all ' + drop.length + ' dropped bodies are roster objects');
check(drop.indexOf(hired) >= 0, 'the hired fighter drops');

const meC = DIVIDE.buildCorp(rng, me.profile, 'standard', undefined, null, null, null,
                             { drop: drop, account: me.account, armoury: me.armoury, intel: 0 }, 1);
meC.rep = me.rep;
const rdrop = SEASON.selectDrop(rival, {});
const rvC = DIVIDE.buildCorp(rng, rival.profile, 'standard', undefined, null, null, null,
                             { drop: rdrop, account: rival.account, armoury: rival.armoury, intel: 0 }, 1);
rvC.rep = rival.rep;
check(meC.muster == null, 'our drop mustered (armed from the locker and the wallet, not the fallback)');
check(rvC.muster == null, 'rival drop mustered');

/* trap #1 — kit must be what a corporation buys, never one carbine twelve times */
const prim = {};
for (const sq of meC.squads) for (const b of sq.bodies)
  prim[(b.loadout && b.loadout.primary) || 'NONE'] = (prim[(b.loadout && b.loadout.primary) || 'NONE'] || 0) + 1;
check(Object.keys(prim).length > 1 && !prim.NONE,
      'primaries are a real mix: ' + JSON.stringify(prim));

/* ---- fight: the squad the hired fighter stands in, against the rival's first ---- */
const mySq = meC.squads[hired._squadIdx || 0];
const A = DIVIDE.liveSquad(rng, meC, mySq, 1, mySq.engagements, ROSTER.traitById);
const B = DIVIDE.liveSquad(rng, rvC, rvC.squads[0], 1, rvC.squads[0].engagements, ROSTER.traitById);
const res = TAC.resolve(rng, A, B, { terrain: 'broken_ground', openingBand: 1,
                                     prep: [0.73, 0.73], log: [] });
console.log('fought ' + res.turns + ' turns · ' + res.result + ' · ' +
            res.telemetry.shots + ' shots · ' + res.frames.length + ' frames for the replay');
check(A.units.every(u => me.roster.indexOf(u.ref) >= 0) &&
      B.units.every(u => rival.roster.indexOf(u.ref) >= 0),
      'every unit that fought IS a roster body on its own side (identity both ways)');
const mine = A.units.find(u => u.ref === hired);
check(!!mine, 'the hired body stood in the fight' + (mine ? ' — ended ' + mine.state : ''));

/* ---- settle: the engine's own settlement, statuses counted before and after ---- */
const stats0 = () => ({ dead: 0, captured: 0, injured: 0, careerEnded: 0, lightWounds: 0,
                        audit: { capturedAlive: 0, medkitsUsed: 0, untendedWounds: 0,
                                 stressApplied: 0 } });
const act = sq => sq.bodies.filter(b => b.status === 'active');
const tally = r => r.reduce((m, f) => { m[f.status] = (m[f.status] || 0) + 1; return m; }, {});
const vsMe = { corp: rvC, bodies: act(rvC.squads[0]) };
const vsRv = { corp: meC, bodies: act(mySq) };
const b4me = tally(me.roster), b4rv = tally(rival.roster);
const sMe = stats0(), sRv = stats0();
DIVIDE.applyOutcome(mySq, A, sMe, rvC.id, vsMe);
DIVIDE.applyOutcome(rvC.squads[0], B, sRv, meC.id, vsRv);
mySq.engagements++; rvC.squads[0].engagements++;
const afMe = tally(me.roster), afRv = tally(rival.roster);
console.log('settled — us: ' + JSON.stringify(sMe) + '\n        rival: ' + JSON.stringify(sRv));
console.log('roster before: us ' + JSON.stringify(b4me) + ' · rival ' + JSON.stringify(b4rv));
console.log('roster after:  us ' + JSON.stringify(afMe) + ' · rival ' + JSON.stringify(afRv));
const moved = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const casualties = sMe.dead + sMe.injured + sMe.captured + sMe.careerEnded
                 + sRv.dead + sRv.injured + sRv.captured + sRv.careerEnded;
check(casualties === 0 || moved(b4me, afMe) || moved(b4rv, afRv),
      'what the fight did came back to the shared rosters (' + casualties + ' casualties)');

console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nall checks passed — the link carries');
process.exit(failed ? 1 : 0);
