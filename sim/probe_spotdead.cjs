/* IS THERE ALREADY A SPOTTING MODEL, AND DOES IT RUN?
 *
 * `combat.js` reads `target.spotted` twice: once to halve the hit chance against somebody you
 * have not spotted, once to give Ambush Instinct a severity bonus for opening fire on one.
 * `makeCombatant` sets the field to `true` and NOTHING in the tree ever writes it again.
 *
 * Reading that is not evidence. This counts, through real contests, how many times each branch
 * actually takes the unspotted path. Prediction: zero of both.
 *
 *   node probe_spotdead.cjs [contests]
 */
const P = require('./prng.js'), C = require('./combat.js'), D = require('./divide.js');
const OA = require('../data/oa_profiles.json').oa_profiles;
const CONTESTS = Number(process.argv[2] || 3);

let calls = 0, unspottedTargets = 0, ambushInstinctCarriers = 0, ambushInstinctFired = 0;
let sevCalls = 0;

const realHit = C.hitChance;
C.hitChance = function (shooter, target, bandIdx, ctx, overwatch) {
  calls++;
  if (!target.spotted) unspottedTargets++;
  return realHit.apply(this, arguments);
};
const realSev = C.resolveSeverity;
C.resolveSeverity = function (rng, shooter, target, policy, bandIdx, vlog, exchange) {
  sevCalls++;
  if (shooter.hooks && shooter.hooks.has('unspotted_open_fire_bonus')) {
    ambushInstinctCarriers++;
    if (!target.spotted) ambushInstinctFired++;
  }
  return realSev.apply(this, arguments);
};

for (let i = 0; i < CONTESTS; i++) {
  D.runDivide(P.mulberry32(P.seedFrom('spot' + i)), { oaProfiles: OA, corpCount: 8, season: 1 });
}
C.hitChance = realHit; C.resolveSeverity = realSev;

console.log('\n' + CONTESTS + ' contests');
console.log('  shots evaluated                       ' + calls);
console.log('  ... at a target nobody had spotted     ' + unspottedTargets);
console.log('  severity rolls                        ' + sevCalls);
console.log('  ... by an Ambush Instinct carrier      ' + ambushInstinctCarriers);
console.log('  ... where the bonus actually applied   ' + ambushInstinctFired);
console.log('');
console.log('  the halved-hit-chance branch is ' +
  (unspottedTargets === 0 ? 'DEAD. SPOT_UNSPOTTED reaches nothing.'
                          : 'live: ' + unspottedTargets + ' shots.'));
console.log('  Ambush Instinct\'s open-fire half is ' +
  (ambushInstinctFired === 0
    ? 'DEAD. The hook is referenced, so the trait guard counts it as read.'
    : 'live: ' + ambushInstinctFired + ' rolls.'));
