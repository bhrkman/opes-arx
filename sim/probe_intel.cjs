/* GATHER INTEL, SWORN. The dossier model has rules that must stay true or the whole system
 * quietly lies to the player:
 *
 *   - points spend BLANK-AND-THINNEST first — a fresh sheet fills breadth before depth, and
 *     re-surveying tops up the gaps before re-confirming what is already known;
 *   - the economy is honest: an ordinary row costs 2 per level (2/4/6 for sparse/moderate/full),
 *     the planet's fat `sectors` row costs double, and the whole planet sheet is 24 points;
 *   - a rival snapshot is FROZEN at gather time and stamped with the month — it never silently
 *     updates when the rival changes;
 *   - a rival's rows read by FRESHNESS and fade over years; the planet reads by COMPLETENESS
 *     and does not age within a year;
 *   - the planet sheet RESETS when a new season's planet is announced; rival sheets PERSIST.
 *
 *   node probe_intel.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };

const SEED = process.argv[2] || 'intel-1';
const rng = P.mulberry32(P.seedFrom(SEED));
const corps = SEASON.openFleet(rng, OA, {});
const ids = Object.keys(corps);
const me = corps[ids[0]];
const rivalId = ids[1];
const RROWS = SEASON.INTEL_RIVAL_ROWS, PROWS = SEASON.INTEL_PLANET_ROWS;

const depths = (sheet, keys) => keys.map(k => (sheet.rows[k] || { depth: 0 }).depth);

/* ---- blank-and-thinnest-first, and the 2-per-level economy ---- */
SEASON.ensureIntel(me, 1);
/* one pip grants 2 levels → two rows to depth 1 (breadth first, nothing to depth 2 yet) */
SEASON.gatherIntel(me, 'rival', rivalId, 2, 101, (k, d) => k + '@' + d);
let d = depths(me._intel.rivals[rivalId], RROWS);
check(d.filter(x => x === 1).length === 2 && d.filter(x => x > 1).length === 0,
      '2 levels fill two rows to depth 1 (breadth first): [' + d + ']');

/* six more points (three pips): should spread across blank rows before deepening the first */
SEASON.gatherIntel(me, 'rival', rivalId, 6, 102, (k, dep) => k + '@' + dep);
d = depths(me._intel.rivals[rivalId], RROWS);
const filledRows = d.filter(x => x > 0).length;
check(filledRows >= 4, 'points went to breadth: ' + filledRows + ' of 6 rows now started ([' + d + '])');
check(Math.max.apply(null, d) - Math.min.apply(null, d.filter(x => x > 0)) <= 1,
      'depths stay within one level of each other — thinnest-first holds ([' + d + '])');

/* ---- a full sheet is 18 levels for a rival (6 rows × 3); fill it ---- */
const rng2 = P.mulberry32(P.seedFrom(SEED + '-full'));
const corps2 = SEASON.openFleet(rng2, OA, {});
const meB = corps2[Object.keys(corps2)[0]];
const rivB = Object.keys(corps2)[2];
SEASON.ensureIntel(meB, 1);
SEASON.gatherIntel(meB, 'rival', rivB, 18, 100, (k, dep) => k + '@' + dep);
const dB = depths(meB._intel.rivals[rivB], RROWS);
check(dB.every(x => x === 3), 'a rival sheet is complete at 18 levels — every row full ([' + dB + '])');

/* ---- the planet is 24 levels (6 rows × 3, plus the fat sectors row worth 6) ---- */
SEASON.ensureIntel(meB, 1);
SEASON.gatherIntel(meB, 'planet', null, 24, 100, null);
const dP = depths(meB._intel.planet, PROWS);
check(dP.every(x => x === 3), 'the planet sheet is complete at 24 levels — every row full ([' + dP + '])');
/* prove sectors is the fat row: 22 levels should leave sectors short while the rest fill */
SEASON.ensureIntel(meB, 2);          /* fresh planet sheet */
SEASON.gatherIntel(meB, 'planet', null, 22, 100, null);
const sectorsDepth = (meB._intel.planet.rows.sectors || { depth: 0 }).depth;
check(sectorsDepth < 3, 'the fat sectors row lags on a 22-level spend (depth ' + sectorsDepth + ') — it costs double');

/* ---- snapshots freeze and are stamped ---- */
const snapRow = me._intel.rivals[rivalId].rows[RROWS.find(k => me._intel.rivals[rivalId].rows[k])];
check(typeof snapRow.snapshot === 'string' && snapRow.gathered > 0,
      'a rival row carries a frozen, month-stamped snapshot');

/* ---- freshness fades over years; completeness does not age ---- */
const freshRow = { depth: 3, gathered: 100 };           /* gathered season 1 */
const f1 = SEASON.rowFreshness(freshRow, 1);
const f3 = SEASON.rowFreshness(freshRow, 3);
check(f1 > f3 && f3 >= 0, 'a rival row fades with years: fresh ' + f1.toFixed(2) + ' > older ' + f3.toFixed(2));
check(SEASON.rivalPreparedness(meB, rivB, 1) > SEASON.rivalPreparedness(meB, rivB, 3),
      'a rival sheet buys less preparedness as it ages');
/* the readiness a full, fresh rival sheet buys tops out at exactly the constant ceiling */
const rng3 = P.mulberry32(P.seedFrom(SEED + '-ceil'));
const corps3 = SEASON.openFleet(rng3, OA, {});
const meC = corps3[Object.keys(corps3)[0]], rivC = Object.keys(corps3)[2];
meC.season = 1; SEASON.ensureIntel(meC, 1);
SEASON.gatherIntel(meC, 'rival', rivC, 18, 101, (k, d) => SEASON.snapshotRival(corps3[rivC], k, d));
check(Math.abs(SEASON.rivalPreparedness(meC, rivC, 1) - SEASON.CONST.INTEL_RIVAL_PREP) < 1e-9,
      'a full fresh rival sheet buys exactly the ceiling: ' + SEASON.rivalPreparedness(meC, rivC, 1).toFixed(3));
check(SEASON.rivalPreparedness(meC, Object.keys(corps3)[3], 1) === 0,
      'an unscouted house buys nothing');
check(SEASON.planetPreparedness(meB) > 0,
      'a complete planet sheet buys preparedness (by completeness, not age)');

/* ---- the planet resets on a new season; rivals persist ---- */
SEASON.ensureIntel(meB, 5);
const planetAfter = depths(meB._intel.planet, PROWS);
check(planetAfter.every(x => x === 0), 'the planet sheet resets when a new planet is announced ([' + planetAfter + '])');
check(depths(meB._intel.rivals[rivB], RROWS).some(x => x > 0),
      'rival sheets persist across the year turn');

/* NOTHING FROM LAST YEAR'S DIVIDE CROSSES INTO THIS ONE. A whole class of scratch state
   (banked resources, kill and worthy-fight tallies, pacts, the hook cache, media reveal) is
   written by a contest and must be cleared at the year turn, or the new season quietly
   inherits last year's — the exact "loads fine, behaves differently" fault. Guard it. */
const rngY = P.mulberry32(P.seedFrom(SEED + '-yearturn'));
const corpsY = SEASON.openFleet(rngY, OA, {});
let stY = SEASON.beginSeason(rngY, corpsY, OA, {});
const meY = corpsY[Object.keys(corpsY)[0]];
meY._banked = { cobalt: 5 }; meY._killsBy = { x: { n: 2 } }; meY._worthyFights = 3;
meY._pactsSigned = { someone: 4 }; meY._pactBrokeWith = 'someone';
meY._hookCache = { h: true }; meY._mediaReveal = 0.4;
stY = SEASON.beginSeason(stY.rng, corpsY, OA, {});
check(Object.keys(meY._banked).length === 0 && Object.keys(meY._killsBy).length === 0 &&
      meY._worthyFights === 0 && Object.keys(meY._pactsSigned).length === 0 &&
      meY._pactBrokeWith === null && Object.keys(meY._hookCache).length === 0 &&
      meY._mediaReveal === 0,
      'no Divide scratch state crosses the turn of the year');

console.log(failed ? ('  ' + failed + ' check(s) failed')
                   : '  the dossier holds — breadth-first, honestly priced, frozen, and aged right');
process.exit(failed ? 1 : 0);
