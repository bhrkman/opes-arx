/* WHY DOESN'T A FIGHTER GO ROUND THE SIDE?
 *
 * The question: when a tile exists that both FLANKS the target (their cover does not face it)
 * and gives the mover cover of its own, is it taken? If it is offered and refused, the scoring
 * is at fault. If it is rarely offered at all, the reach is at fault, and no amount of tuning
 * the weights will help.
 *
 * Real contests. Nothing is altered — the tap reports the candidate set the game actually built
 * and the choice it actually made.
 */
const P = require('./prng.js'), TAC = require('./tactical.js'), D = require('./divide.js');
const OA = require('../data/oa_profiles.json').oa_profiles;
const K = TAC.CONST;
const CONTESTS = Number(process.argv[2] || 1);

let decisions = 0, offeredFlank = 0, offeredFlankCover = 0;
let tookFlank = 0, tookFlankCover = 0, refused = 0;
let marginSum = 0, gainSum = 0, threatGapSum = 0;
let refusedForStay = 0, refusedForOther = 0;

const tap = {
  rows: [],
  emit(rows, stay, moveGate, chosen, u) {
    if (!rows.length) return;
    decisions++;
    const val = r => r.p * K.SHOT_WEIGHT - r.threat * K.THREAT_WEIGHT - r.bandOff * K.BAND_PULL;
    const stayVal = stay.p * K.SHOT_WEIGHT - stay.threat * K.THREAT_WEIGHT
                  - stay.bandOff * K.BAND_PULL;
    const flanks = rows.filter(r => r.flanks && (r.x !== u.x || r.y !== u.y));
    const safe = flanks.filter(r => r.ownCov > 0);
    if (flanks.length) offeredFlank++;
    if (!safe.length) return;
    offeredFlankCover++;
    /* the best flank-and-cover tile on offer */
    let bestSafe = safe[0];
    for (const r of safe) if (val(r) > val(bestSafe)) bestSafe = r;
    /* what the game actually picked */
    let winner = null, wv = -Infinity;
    for (const r of rows) { const v = val(r); if (v > wv) { wv = v; winner = r; } }
    const moved = winner && wv > stayVal + moveGate && (winner.x !== u.x || winner.y !== u.y);
    const picked = moved && winner.x === bestSafe.x && winner.y === bestSafe.y;
    if (picked) { tookFlankCover++; return; }
    refused++;
    if (!moved) refusedForStay++; else refusedForOther++;
    /* by how much, and what was it trading away? */
    marginSum += (moved ? wv : stayVal + moveGate) - val(bestSafe);
    gainSum += bestSafe.p - stay.p;                    /* the shot it turned down */
    threatGapSum += bestSafe.threat - stay.threat;     /* the danger it avoided */
  }
};

const real = TAC.resolve;
TAC.resolve = function (rng, A, B, ctx) {
  const c = (Array.isArray(A) ? B : ctx) || {};
  c._scoreTap = tap;
  return real.apply(this, arguments);
};
for (let i = 0; i < CONTESTS; i++)
  D.runDivide(P.mulberry32(P.seedFrom('fl_' + i)), { oaProfiles: OA, corpCount: 8, season: 1 });
TAC.resolve = real;

const pc = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
console.log('\n=========================================================================');
console.log('  GOING ROUND THE SIDE — is it offered, and is it taken?');
console.log('=========================================================================');
console.log('  movement decisions                       ' + decisions);
console.log('  ...offered a tile that flanks            ' + offeredFlank + '  (' + pc(offeredFlank, decisions) + ')');
console.log('  ...offered one that flanks AND has cover ' + offeredFlankCover + '  (' + pc(offeredFlankCover, decisions) + ')');
console.log('');
console.log('  of those flank-and-cover chances:');
console.log('    taken                                  ' + tookFlankCover + '  (' + pc(tookFlankCover, offeredFlankCover) + ')');
console.log('    refused                                ' + refused + '  (' + pc(refused, offeredFlankCover) + ')');
console.log('      ...by staying put                    ' + refusedForStay);
console.log('      ...by moving somewhere else          ' + refusedForOther);
if (refused) {
  console.log('');
  console.log('  when refused, on average:');
  console.log('    beaten by                              ' + (marginSum / refused).toFixed(4) + ' of score');
  console.log('    shot turned down                       ' + (100 * gainSum / refused).toFixed(1) + ' points of hit chance');
  console.log('    extra incoming it avoided              ' + (100 * threatGapSum / refused).toFixed(1) + ' points');
}
