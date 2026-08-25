/* SQUAD FLANKING — two questions, both measured.
 *
 *  1. Does the `flanked` flag the day loop computes CHANGE ANY FIGHT? Proved by construction:
 *     same seed, same squads, same ground, flag on and flag off. If the results are identical
 *     the flag reaches nothing, and no batch size would ever have told us.
 *  2. How often does it fire in real contests?
 *
 *    node probe_flank.cjs [fights] [contests]
 */
const P = require('./prng.js'), TAC = require('./tactical.js'), C = require('./combat.js'),
      ROSTER = require('./roster.js'), ITEMS = require('./items.js'), D = require('./divide.js');
const OA = require('../data/oa_profiles.json').oa_profiles;

const N = Number(process.argv[2] || 200);
const CONTESTS = Number(process.argv[3] || 6);

/* ---------- 1. does the flag do anything at all? ---------- */
function side(rng, tag, n) {
  const bodies = ROSTER.generateSquad(rng, n, { corpId: tag }).bodies;
  ITEMS.equipForce(bodies, ITEMS.DEFAULT_LOADOUT);
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard', hasMedkit: true,
           units: bodies.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById, day: 1 })) };
}
function fight(seed, flankedFlag) {
  const rng = P.mulberry32(P.seedFrom(seed));
  const A = side(P.mulberry32(P.seedFrom('A' + seed)), 'A', 8);
  const B = side(P.mulberry32(P.seedFrom('B' + seed)), 'B', 8);
  const res = TAC.resolve(rng, A, B, { terrain: 'broken_ground', openingBand: 1,
                                       prep: [0.5, 0.5], log: false, flanked: flankedFlag });
  const cas = res.casualties || {};
  const tot = s => { const c = cas[s] || {}; return (c.dead || 0) * 100 + (c.down || 0) * 10 + (c.light || 0); };
  return tot('A') + ':' + tot('B') + ':' + (res.winner || '-');
}

let differ = 0;
for (let i = 0; i < N; i++) {
  const off = fight('flk' + i, [false, false]);
  const on  = fight('flk' + i, [true, false]);      /* A is flanked, B is not */
  if (off !== on) differ++;
}
console.log('THE FLAG ITSELF');
console.log('  ' + N + ' identical fights run twice, once with side A flagged as flanked:');
console.log('  outcomes that differed: ' + differ + ' of ' + N);
console.log('  -> ' + (differ === 0
  ? 'the flag reaches NOTHING. The grid never reads it.'
  : 'the flag changes the fight in ' + (100 * differ / N).toFixed(1) + '% of cases.'));

/* ---------- 2. how often does the day loop even raise it? ---------- */
let flanked = 0, flankMoves = 0, engagements = 0, days = 0;
for (let i = 0; i < CONTESTS; i++) {
  const res = D.runDivide(P.mulberry32(P.seedFrom('flankrun' + i)),
                          { oaProfiles: OA, corpCount: 8, season: 1 });
  const a = (res.stats && res.stats.audit) || res.audit || {};
  flanked += a.flanked || 0;
  flankMoves += a.flankMoves || 0;
  for (const c of (res.corps || [])) engagements += c.engagements || 0;
  days += res.days || 0;
}
console.log('\nHOW OFTEN IT FIRES  (' + CONTESTS + ' contests)');
console.log('  engagements fought          ' + engagements);
console.log('  squads sent to flank        ' + flankMoves);
console.log('  fights where somebody was');
console.log('  caught from two arcs        ' + flanked +
            (engagements ? '   (' + (100 * flanked / engagements).toFixed(1) + '% of fights)' : ''));
