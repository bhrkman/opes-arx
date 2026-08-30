/* THE FOUR TIERS, SWORN. Focus painted onto the training grid grows stats at four breadth
 * tiers that STACK, and the same pip is worth more the narrower its target. This probe holds
 * that rule honest forever after:
 *
 *   - the ordering: one pip on a cell (one hand, one stat) beats one pip on that hand's row,
 *     beats one pip on that stat's column, beats one pip on the corner (marginal < ... < sharp);
 *   - the stacking: a hand covered by BOTH a column and its own cell grows by the sum of the
 *     two, not the max — the ruling the player agreed to;
 *   - the gate: growth never crosses potential, however many tiers pile on (S-T5).
 *
 *   node probe_train.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };

/* play one month, painting `map` onto training, and report how much a chosen (body,stat) moved */
function drillOnce(seed, mapFor) {
  const rng = P.mulberry32(P.seedFrom(seed));
  const corps = SEASON.openFleet(rng, OA, {});
  const me = Object.keys(corps)[0];
  const st = SEASON.beginSeason(rng, corps, OA, {});
  const roster = corps[me].roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
  /* pick a green body with room to grow on a mind stat */
  const stat = 'tactics';
  const subject = roster.find(f => typeof f.potential === 'number' &&
                                   f.stats[stat] < f.potential - SEASON.CONST.TRAIN_GREEN_GAP - 30);
  if (!subject) return null;
  const before = subject.stats[stat];
  const map = mapFor(subject, stat, roster);
  SEASON.stepMonth(st, { [me]: { train: 3, trainTarget: map } });
  return { moved: subject.stats[stat] - before, subject: subject.id, stat: stat, cap: subject.potential, after: subject.stats[stat] };
}

const SEED = process.argv[2] || 'train-1';

/* the baseline green drift runs every month regardless of focus — measure it so the tier
   deltas below are FOCUS ONLY, not focus plus drift */
const base = drillOnce(SEED, () => ({ all: 0, col: {}, row: {}, cell: {} }));
const d = base ? base.moved : 0;
const focusOnly = r => r.moved - d;   /* the growth the painted pip actually bought */

/* one pip on each tier, in isolation, on the same subject-stat */
const cell = drillOnce(SEED, (s, st) => ({ all: 0, col: {}, row: {}, cell: { [s.id + ':' + st]: 1 } }));
const row  = drillOnce(SEED, (s, st) => ({ all: 0, col: {}, row: { [s.id]: 1 }, cell: {} }));
const col  = drillOnce(SEED, (s, st) => ({ all: 0, col: { [st]: 1 }, row: {}, cell: {} }));
const corner = drillOnce(SEED, (s, st) => ({ all: 1, col: {}, row: {}, cell: {} }));

check(cell && row && col && corner && base, 'a green subject found and drilled on every tier');
if (cell && row && col && corner && base) {
  console.log('    (baseline drift ' + d.toFixed(3) + ' subtracted; deltas are focus only)');
  console.log('    corner ' + focusOnly(corner).toFixed(3) + '  <  column ' + focusOnly(col).toFixed(3) +
              '  <  row ' + focusOnly(row).toFixed(3) + '  <  cell ' + focusOnly(cell).toFixed(3));
  check(focusOnly(corner) > 0, 'even the corner moves the stat (marginal, but real)');
  check(focusOnly(corner) < focusOnly(col), 'a column pip beats a corner pip on the same stat');
  check(focusOnly(col) < focusOnly(row), 'a row pip beats a column pip');
  check(focusOnly(row) < focusOnly(cell), 'a cell pip — the scalpel — beats them all');
}

/* STACKING: column 1 + the subject's own cell 1 grows by the SUM of the two focus effects
   (the drift is added once, not twice) */
const stack = drillOnce(SEED, (s, st) => ({ all: 0, col: { [st]: 1 }, row: {}, cell: { [s.id + ':' + st]: 1 } }));
if (stack && col && cell && base) {
  const expect = focusOnly(col) + focusOnly(cell);   /* focus-only sum, plus the single drift */
  check(Math.abs(focusOnly(stack) - expect) < 1e-6,
        'a hand under both a column and its own cell gets the SUM (' +
        focusOnly(stack).toFixed(3) + ' = ' + focusOnly(col).toFixed(3) + ' + ' + focusOnly(cell).toFixed(3) + ')');
}

/* THE GATE HOLDS: pile all four tiers at full pips and growth still stops at potential */
const rng2 = P.mulberry32(P.seedFrom(SEED + '-gate'));
const corps2 = SEASON.openFleet(rng2, OA, {});
const me2 = Object.keys(corps2)[0];
const st2 = SEASON.beginSeason(rng2, corps2, OA, {});
const roster2 = corps2[me2].roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
const sub2 = roster2.find(f => typeof f.potential === 'number');
if (sub2) {
  const map = { all: 3, col: { tactics: 3 }, row: { [sub2.id]: 3 }, cell: { [sub2.id + ':tactics']: 3 } };
  SEASON.stepMonth(st2, { [me2]: { train: 3, trainTarget: map } });
  const overCap = roster2.some(f => SEASON.CONST.MIND.concat(SEASON.CONST.BODY || []).some(
    k => typeof f.potential === 'number' && f.stats[k] > f.potential + 1e-6));
  check(!overCap, 'no stat crosses its ceiling even with every tier at full pips (S-T5)');
}

console.log(failed ? ('  ' + failed + ' check(s) failed') :
            '  the four tiers hold — marginal < solid < rounded < sharp, and they stack');
process.exit(failed ? 1 : 0);
