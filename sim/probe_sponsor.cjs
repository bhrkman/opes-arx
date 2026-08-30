/* COURTING SPONSORS, SWORN (Pass A — the contract model).
 *
 *   - each sponsor backs at MOST ONE house a year;
 *   - courting costs focus that FALLS gently as contracts are taken, and regard discounts it;
 *   - the board signs the courting corp with the highest STANDING (regard + this year's effort);
 *   - a signed contract pays a modest ADVANCE now; a kept condition pays the big REWARD and
 *     warms the house, a broken one pays nothing and sours it hard;
 *   - regard is the only thing that crosses the year.
 *
 *   node probe_sponsor.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const SPON = require('./sponsors.js');
const LED = require('./ledger.js');

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };

const SEED = process.argv[2] || 'spon-1';
const CO = SPON.CONST;
const houses = Object.keys(SPON.CONDITIONS);

function mkCorp(id) {
  return { id: id, account: { treasury: 100000, ledger: [] },
           profile: { dials: {} }, roster: [], history: [],
           sponsors: { regard: {}, contracts: [], offers: [], courted: {}, courting: {} } };
}

/* ---- the cost curve falls as contracts are taken, floored ---- */
const board = SPON.openBoard(houses);
const a = mkCorp('a');
const c0 = SPON.courtCost(board, a, houses[0]);
board.taken = 3;
const c3 = SPON.courtCost(board, a, houses[0]);
board.taken = 99;
const cFloor = SPON.courtCost(board, a, houses[0]);
check(c3 < c0, 'courting cost falls as contracts are taken: ' + c0.toFixed(2) + ' -> ' + c3.toFixed(2));
check(cFloor >= CO.COURT_COST_FLOOR - 1e-9, 'the cost never falls below the floor: ' + cFloor.toFixed(2));

/* ---- regard discounts the cost ---- */
const board2 = SPON.openBoard(houses);
const b = mkCorp('b');
const costCold = SPON.courtCost(board2, b, houses[0]);
SPON.bumpRegard(b, houses[0], CO.REGARD_SPAN);       /* max regard */
const costWarm = SPON.courtCost(board2, b, houses[0]);
check(costWarm < costCold, 'regard discounts the courting cost: ' + costCold.toFixed(2) + ' -> ' + costWarm.toFixed(2));

/* ---- courting raises regard and records effort; standing sums them ---- */
const cc = mkCorp('cc');
SPON.court(cc, houses[0], 3);
check(SPON.regardOf(cc, houses[0]) === 3 * CO.SPONSOR_COURT_REGARD,
      'courting raises regard by the effort put in');
check(SPON.courtStanding(cc, houses[0]) > SPON.regardOf(cc, houses[0]),
      'standing is regard PLUS this year\u2019s effort, so it exceeds bare regard');

/* ---- the board signs the highest-standing courter, one per house ---- */
const board3 = SPON.openBoard(houses);
const corps = { x: mkCorp('x'), y: mkCorp('y'), z: mkCorp('z') };
const ids = ['x', 'y', 'z'];
SPON.court(corps.x, houses[0], 2);
SPON.court(corps.y, houses[0], 5);          /* y courts harder — should win house[0] */
SPON.court(corps.z, houses[1], 3);          /* z is uncontested on house[1] */
const signed = SPON.resolveBoard(board3, corps, ids);
check(board3.signedBy[houses[0]] === 'y', 'the harder courter signs the contested house');
check(board3.signedBy[houses[1]] === 'z', 'an uncontested courter signs their house');
check((corps.y.sponsors.contracts || []).length === 1 &&
      corps.y.sponsors.contracts[0].house === houses[0],
      'the winner carries a live contract for that house');
check((corps.x.sponsors.contracts || []).length === 0,
      'the loser signs nothing — but keeps the regard courting built');
check(SPON.regardOf(corps.x, houses[0]) > 0,
      'the loser\u2019s regard stands for next year: ' + SPON.regardOf(corps.x, houses[0]));

/* ---- the advance is paid on signing ---- */
const yTreasury = corps.y.account.treasury;
check(yTreasury === 100000 + CO.SPONSOR_ADVANCE,
      'the advance is paid on signing: +' + CO.SPONSOR_ADVANCE);

/* ---- one sponsor cannot back two houses' worth: signedBy is one corp per house ---- */
const backCount = {};
for (const h in board3.signedBy) backCount[board3.signedBy[h]] = (backCount[board3.signedBy[h]] || 0) + 1;
check(Object.keys(board3.signedBy).length === 2, 'exactly the two courted houses committed');

/* ---- judging: a kept condition pays the reward and warms; a broken one sours ---- */
const keeper = mkCorp('keeper');
keeper.sponsors.contracts = [{ house: 'spn_castellan', flavor: 'outcome', key: 'no_scandal',
  text: 't', reward: { kind: 'cash' }, advance: CO.SPONSOR_ADVANCE, seasonsServed: 0, term: 1 }];
const rBefore = SPON.regardOf(keeper, 'spn_castellan');
const vKeep = SPON.judge(keeper, { dropped: 20, dead: 2 });    /* 10% losses <= 1/3: kept */
check(vKeep.kept.length === 1 && vKeep.paid === CO.SPONSOR_REWARD,
      'a kept condition pays the full reward: ' + vKeep.paid);
check(SPON.regardOf(keeper, 'spn_castellan') > rBefore, 'a kept condition warms the house');

const breaker = mkCorp('breaker');
breaker.sponsors.contracts = [{ house: 'spn_castellan', flavor: 'outcome', key: 'no_scandal',
  text: 't', reward: { kind: 'cash' }, advance: CO.SPONSOR_ADVANCE, seasonsServed: 0, term: 1 }];
const bBefore = SPON.regardOf(breaker, 'spn_castellan');
const treasBefore = breaker.account.treasury;
const vBreak = SPON.judge(breaker, { dropped: 20, dead: 15 });  /* 75% losses: broken */
check(vBreak.broken.length === 1 && vBreak.paid === 0,
      'a broken condition pays nothing');
check(SPON.regardOf(breaker, 'spn_castellan') < bBefore - 15,
      'a broken condition sours the house hard: ' + SPON.regardOf(breaker, 'spn_castellan'));
check(breaker.account.treasury === treasBefore,
      'failure costs no cash beyond the missed reward (no clawback)');

/* ---- contracts are one-season: the board is empty after judging ---- */
check((keeper.sponsors.contracts || []).length === 0,
      'a one-season contract is done after judging');

/* ================= PASS B — the three condition flavours ================= */

/* LIMITATION: mostly-energy is met above the threshold, missed below it. */
function mkContract(house, key, flavor, reward) {
  return { house: house, flavor: flavor, key: key, text: 't',
           reward: reward || { kind: 'cash' }, advance: CO.SPONSOR_ADVANCE, seasonsServed: 0, term: 1 };
}
const lim = mkCorp('lim');
lim.sponsors.contracts = [mkContract('spn_helion', 'mostly_energy', 'limitation', { kind: 'kit', tag: 'energy', count: 2 })];
const vLimOk = SPON.judge(lim, { dropped: 20, dead: 2, energyFraction: 0.8 });
check(vLimOk.kept.length === 1, 'a limitation is KEPT when the drop is mostly energy (0.80 >= threshold)');
const lim2 = mkCorp('lim2');
lim2.sponsors.contracts = [mkContract('spn_helion', 'mostly_energy', 'limitation', { kind: 'cash' })];
const vLimNo = SPON.judge(lim2, { dropped: 20, dead: 2, energyFraction: 0.3 });
check(vLimNo.broken.length === 1, 'a limitation is BROKEN when the drop is mostly ballistic (0.30 < threshold)');

/* LIMITATION: stay-lean reads drop size, not the roster. */
const lean = mkCorp('lean');
lean.sponsors.contracts = [mkContract('spn_arrowline', 'stay_lean', 'limitation')];
check(SPON.judge(lean, { dropped: 30, dead: 0, dropSize: 16 }).kept.length === 1,
      'stay-lean reads the DROP size (16 fielded) not who was sent to a window');
const lean2 = mkCorp('lean2');
lean2.sponsors.contracts = [mkContract('spn_arrowline', 'stay_lean', 'limitation')];
check(SPON.judge(lean2, { dropped: 30, dead: 0, dropSize: 26 }).broken.length === 1,
      'stay-lean is broken by a fat drop (26 fielded)');

/* PREREQUISITE: keep-policy holds unless the policy changed in-year. */
const preOk = mkCorp('preOk');
preOk.sponsors.contracts = [mkContract('spn_ferrous', 'keep_policy', 'prerequisite')];
check(SPON.judge(preOk, { dropped: 20, dead: 1, policyChanged: false }).kept.length === 1,
      'a prerequisite holds when the policy was kept all year');
const preNo = mkCorp('preNo');
preNo.sponsors.contracts = [mkContract('spn_ferrous', 'keep_policy', 'prerequisite')];
check(SPON.judge(preNo, { dropped: 20, dead: 1, policyChanged: true }).broken.length === 1,
      'a prerequisite fails the moment the policy changed');

/* IN-KIND REWARD: the verdict carries a kit reward for the granter to honour (no cash paid). */
const kitCorp = mkCorp('kit');
kitCorp.sponsors.contracts = [mkContract('spn_helion', 'mostly_energy', 'limitation', { kind: 'kit', tag: 'energy', count: 2 })];
const treasB = kitCorp.account.treasury;
const vKit = SPON.judge(kitCorp, { dropped: 20, dead: 1, energyFraction: 0.9 });
check(vKit.paid === 0 && kitCorp.account.treasury === treasB,
      'an in-kind reward pays no cash');
check(vKit.rewards.some(r => r.reward.kind === 'kit' && r.reward.tag === 'energy'),
      'the verdict carries the kit reward for the armoury granter to honour');

/* ---- live contract status reads honestly, and admits what it cannot know yet ---- */
function statusFor(key, corpPatch) {
  const c = mkCorp('st'); Object.assign(c, corpPatch || {});
  return SPON.contractStatus(c, { key: key });
}
check(statusFor('accept_terms', { account: { treasury: 5000, ledger: [] } }).state === 'holding',
      'accept-terms reads holding while in surplus');
check(statusFor('accept_terms', { account: { treasury: -100, ledger: [] } }).state === 'atrisk',
      'accept-terms reads at-risk while in the red');
check(statusFor('keep_policy', { _policyChanged: false }).state === 'holding',
      'keep-policy holds until the policy changes');
check(statusFor('keep_policy', { _policyChanged: true }).state === 'atrisk',
      'keep-policy reads broken once the policy changed');
check(statusFor('mostly_energy').state === 'pending',
      'a drop-dependent limitation reads pending until the drop exists');
check(statusFor('none').state === 'met',
      'the no-condition supplier reads met');

console.log(failed ? ('  ' + failed + ' check(s) failed')
                   : '  the board holds — one per house, cost falls, standing signs, all three flavours judge, kit granted, status reads honest');
process.exit(failed ? 1 : 0);
