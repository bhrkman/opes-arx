/* GRID AUDIT — LAYER 3: DOES ANYONE REACT TO IT?
 *
 * Layer 2 says a thing fires. Firing is not reacting. `overwatch` is true on 13% of bodies and
 * changes no decision anywhere, and nerfing it therefore did nothing at all — that is the shape
 * of failure this layer exists to catch.
 *
 * METHOD — ablation without trajectory drift. At every real decision the game makes, the tap
 * hands over the full candidate set with its component scores. For each term we recompute the
 * ranking WITH THAT TERM REMOVED and ask whether the fighter would have done something else.
 * The game itself is never altered, so the fights do not diverge and every decision compared is
 * the same decision. Running two contests with a constant changed compares two different seasons
 * and drowns the signal in noise; this does not.
 *
 * A term that flips no decisions is decorative regardless of how often it fires.
 *
 *   node audit_layer3.cjs [contests]
 */
const P = require('./prng.js'), TAC = require('./tactical.js'), D = require('./divide.js');
const OA = require('../data/oa_profiles.json').oa_profiles;
const C = require('./combat.js');
const CONTESTS = Number(process.argv[2] || 1);
const K = TAC.CONST;

/* each ablation: a name, and the weights to use when re-ranking */
const ABL = [
  { name: 'the shot available from the tile', shot: 0,           threat: K.THREAT_WEIGHT, band: K.BAND_PULL },
  { name: 'incoming fire at the tile',        shot: K.SHOT_WEIGHT, threat: 0,             band: K.BAND_PULL },
  { name: 'pull toward preferred range',      shot: K.SHOT_WEIGHT, threat: K.THREAT_WEIGHT, band: 0 },
  { name: 'the cost of standing up (gate)',   shot: K.SHOT_WEIGHT, threat: K.THREAT_WEIGHT, band: K.BAND_PULL, gate: 0 },
  /* THE BUNKERING QUESTION, ASKED DIRECTLY. Being pinned raises the margin a move must beat
     from 0.045 to 0.365 — eight times. This drops the pinned surcharge only, leaving the
     ordinary cost of standing up in place, and asks how many decisions being suppressed is
     actually responsible for. */
  { name: 'the pinned surcharge only',       shot: K.SHOT_WEIGHT, threat: K.THREAT_WEIGHT, band: K.BAND_PULL, gate: K.MOVE_COST },
];
const stat = ABL.map(a => ({ ...a, flipped: 0, movedInstead: 0, stayedInstead: 0, elsewhere: 0 }));
let decisions = 0, baseMoves = 0;

function best(rows, w) {
  let b = null, bv = -Infinity;
  for (const r of rows) {
    const v = r.p * w.shot - r.threat * w.threat - r.bandOff * w.band;
    if (v > bv) { bv = v; b = r; }
  }
  return { row: b, val: bv };
}

/* TARGET SELECTION — a second decision, with only two terms in it: the raw hit chance, and a
   flat 0.05 for a body already lightly wounded. That bonus is roughly a quarter of a typical hit
   chance and it is the only thing besides raw chance deciding who gets shot. It is a bare
   literal with no name, which is probably why nothing has ever asked what it does. */
let picks = 0, pickChoices = 0, woundedFlips = 0, woundedPicked = 0, hadWounded = 0;

const tap = {
  rows: [],
  pick(rows, chosenId) {
    picks++;
    if (rows.length > 1) pickChoices++;
    const anyLight = rows.some(r => r.light);
    if (anyLight) hadWounded++;
    /* who would be shot with the bonus removed? */
    let bare = null, bv = -Infinity;
    for (const r of rows) if (r.raw > bv) { bv = r.raw; bare = r; }
    if (bare && chosenId != null && bare.id !== chosenId) woundedFlips++;
    if (chosenId != null && rows.some(r => r.id === chosenId && r.light)) woundedPicked++;
  },
  emit(rows, stay, moveGate, chosen, u) {
    if (!rows.length) return;
    decisions++;
    const W = { shot: K.SHOT_WEIGHT, threat: K.THREAT_WEIGHT, band: K.BAND_PULL };
    const sv = v => stay.p * v.shot - stay.threat * v.threat - stay.bandOff * v.band;
    const b0 = best(rows, W);
    const moved0 = b0.row && b0.val > sv(W) + moveGate && (b0.row.x !== u.x || b0.row.y !== u.y);
    if (moved0) baseMoves++;
    for (const a of stat) {
      const w = { shot: a.shot, threat: a.threat, band: a.band };
      const g = a.gate != null ? a.gate : moveGate;
      const b1 = best(rows, w);
      const moved1 = b1.row && b1.val > sv(w) + g && (b1.row.x !== u.x || b1.row.y !== u.y);
      if (moved0 !== moved1) { a.flipped++; moved1 ? a.movedInstead++ : a.stayedInstead++; }
      else if (moved0 && moved1 && (b1.row.x !== b0.row.x || b1.row.y !== b0.row.y)) {
        a.flipped++; a.elsewhere++;
      }
    }
  }
};

const real = TAC.resolve;
TAC.resolve = function (rng, A, B, ctx) {
  const c = (Array.isArray(A) ? B : ctx) || {};
  c._scoreTap = tap;
  return real.apply(this, arguments);
};
for (let i = 0; i < CONTESTS; i++)
  D.runDivide(P.mulberry32(P.seedFrom('l3_' + i)), { oaProfiles: OA, corpCount: 8, season: 1 });
TAC.resolve = real;

console.log('\n=========================================================================');
console.log('  LAYER 3 — WHICH TERMS ACTUALLY CHANGE A DECISION');
console.log('=========================================================================');
console.log('  ' + CONTESTS + ' full contest(s).  decisions examined: ' + decisions +
            '   of which the fighter moved: ' + baseMoves +
            ' (' + (100 * baseMoves / Math.max(1, decisions)).toFixed(1) + '%)\n');
console.log('  remove this term            decisions that change        of those');
for (const a of stat) {
  const pc = (100 * a.flipped / Math.max(1, decisions)).toFixed(1);
  console.log('  ' + a.name.padEnd(28) + (a.flipped + ' (' + pc + '%)').padEnd(22) +
              'moved instead ' + a.movedInstead + ', stayed instead ' + a.stayedInstead +
              ', went elsewhere ' + a.elsewhere);
}
console.log('\n=========================================================================');
console.log('  LAYER 3 — TARGET SELECTION');
console.log('=========================================================================');
console.log('  shots aimed                              ' + picks);
console.log('  ...with more than one body to choose from ' + pickChoices +
            '  (' + (100 * pickChoices / Math.max(1, picks)).toFixed(1) + '%)');
console.log('  ...where somebody visible was wounded     ' + hadWounded);
console.log('  ...where the wounded body was the one shot ' + woundedPicked);
console.log('');
console.log('  remove the finish-the-wounded bonus:');
console.log('    a different body gets shot            ' + woundedFlips +
            '  (' + (100 * woundedFlips / Math.max(1, picks)).toFixed(1) + '% of aimed shots, ' +
            (100 * woundedFlips / Math.max(1, pickChoices)).toFixed(1) + '% of real choices)');

console.log('\n  A term flipping ~0% is decorative: it fires, and nothing downstream depends on it.');
console.log('  This measures influence GIVEN THE OTHER TERMS — a term can be redundant with');
console.log('  another rather than inert, and this cannot tell those apart.');
