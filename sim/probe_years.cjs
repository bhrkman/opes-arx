/* SIX YEARS, COUNTED. The contract rework changed the shape of a career: merc paper is one
 * Divide and then they walk, the freed and the expired genuinely leave, families are paid,
 * bonuses post, prisoners earn out. Each rule is right alone — this probe plays whole
 * fleet-years end to end (season, lock, full Divide, settlement, offseason) with every
 * house choosing for itself, and counts what the rules compound into: roster depth against
 * the design's own drop floor, treasury drift, departures against signings. The economy is
 * blessed by measurement or its problem is named with numbers.
 *
 *   node probe_years.cjs [seed] [seasons]
 */
const fs = require('fs');
const P = require('./prng.js');
const ROSTER = require('./roster.js');
const ITEMS = require('./items.js');
const LED = require('./ledger.js');
const DIVIDE = require('./divide.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const seed = process.argv[2] || 'years-1';
const SEASONS = Math.max(2, +(process.argv[3] || 6));
const rng = P.mulberry32(P.seedFrom(seed));

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };
const alive = c => c.roster.filter(f => f.status !== 'dead' && f.status !== 'retired').length;

const corps = SEASON.openFleet(rng, OA, {});
const ids = OA.map(p => p.id);
const floor = SEASON.CONST.DROP_MIN;

let minAlive = Infinity, minTreasury = Infinity, worstDepth = null, worstPurse = null;
let y1Expired = 0, lockFloorWorst = { n: Infinity, at: null }, woundedFills = 0, fillBy = {};
console.log('season · fleet alive (min..max) · treasury min..max · deaths · signed · walked (expired/freed/retired)');
for (let s = 1; s <= SEASONS; s++) {
  const state = SEASON.beginSeason(rng, corps, OA, {});
  let walked = { expired: 0, freed: 0, retired: 0 };
  if (s > 1) for (const id of ids) {
    const off = corps[id]._off || {};
    walked.expired += (off.expired || []).length;
    walked.freed += (off.freed || []).length;
    walked.retired += (off.retired || []).length;
    if (s === 2) y1Expired += (off.expired || []).length;
  }
  while (SEASON.stepMonth(state, {})) {}
  SEASON.closeSeasonToDrop(state);
  /* THE FLOOR MATTERS AT THE LOCK — a corp may end a contest at twelve so long as it
     stands sixteen FIT when the drop is chosen. And fit means fit: a drop padded with
     walking wounded who cannot stand in a squad is the old seam disagreement wearing a
     roster number as a disguise. */
  for (const id of ids) {
    const drop = (state._persist[id] || {}).drop || [];
    const standing = drop.filter(f => f.status === 'active').length;
    if (drop.length < lockFloorWorst.n) lockFloorWorst = { n: drop.length, at: id + ' year ' + s };
    if (standing < drop.length) {
      woundedFills += drop.length - standing;
      drop.forEach(f => { if (f.status !== 'active')
        fillBy[f.status] = (fillBy[f.status] || 0) + 1; });
    }
  }
  const pd = SEASON.prepareDivide(state);
  const res = DIVIDE.runDivide(pd.rng, pd.opts);
  SEASON.finishSeason(state, res);

  let aMin = Infinity, aMax = 0, tMin = Infinity, tMax = -Infinity, deaths = 0;
  for (const id of ids) {
    const c = corps[id];
    const a = alive(c);
    aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
    tMin = Math.min(tMin, c.account.treasury); tMax = Math.max(tMax, c.account.treasury);
    const h = c.history[c.history.length - 1] || {};
    deaths += h.dead || 0;
    if (a < minAlive) { minAlive = a; worstDepth = id + ' year ' + s; }
    if (c.account.treasury < minTreasury) { minTreasury = c.account.treasury; worstPurse = id + ' year ' + s; }
  }
  const signed = (state.tryouts.signed || 0) + (state.mercs.signed || 0) + (state.bastille.signed || 0);
  console.log('  ' + s + ' · ' + aMin + '..' + aMax + ' · ' +
              Math.round(tMin / 1000) + 'k..' + Math.round(tMax / 1000) + 'k · ' +
              deaths + ' dead · ' + signed + ' signed · ' +
              walked.expired + '/' + walked.freed + '/' + walked.retired + ' walked');
}

console.log('\nfounding merc-paper wave: ' + y1Expired + ' contracts expired into year 2 across the fleet');
console.log('worst roster depth anywhere: ' + minAlive + ' alive (' + worstDepth + ')');
console.log('worst treasury anywhere: ' + Math.round(minTreasury / 1000) + 'k (' + worstPurse + ')');

/* the claims a playable economy must keep, in the design's own numbers */
console.log('post-Divide depth is informational: lean survivors are the sport, so long as the lock is whole');
check(lockFloorWorst.n >= floor,
      'every LOCK fills the drop floor of ' + floor + ' (worst drop: ' + lockFloorWorst.n +
      (lockFloorWorst.at ? ', ' + lockFloorWorst.at : '') + ')');
console.log('non-standing drops by status: ' + JSON.stringify(fillBy));
check(woundedFills === 0,
      'every dropped body can stand — no drop was padded with walking wounded (' +
      woundedFills + ' phantom fills)');
check(minTreasury > 0,
      'no treasury is ever driven below zero (worst: ' + Math.round(minTreasury / 1000) + 'k)');
check(ids.every(id => corps[id].history.length === SEASONS),
      'every house stood every one of the ' + SEASONS + ' Divides');

console.log(failed ? '\n' + failed + ' CLAIM(S) FAILED — the economy has a problem, named above'
                   : '\nthe economy holds across ' + SEASONS + ' years — blessed by counting');
process.exit(failed ? 1 : 0);
