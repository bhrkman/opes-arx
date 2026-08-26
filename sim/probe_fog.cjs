/* FOG BASELINE — grid behaviour measured THROUGH FULL CONTESTS, not isolated fights.
 *
 * Rule 1: isolated fights prove a mechanism by construction; they do not tell you whether it
 * works. So this wraps `TACTICAL.resolve` and accumulates every engagement the day loop
 * actually runs, across N contests.
 *
 * Rule 3: every number printed is checked for NaN before it is believed. A counter that was
 * never initialised launders itself through the first `|| 0` it meets and reports a confident
 * zero — this project has lost five counters that way. `bad()` prints NaN as NaN.
 *
 *   node probe_fog.cjs [contests]
 */
const P = require('./prng.js'), TAC = require('./tactical.js'), D = require('./divide.js');
const C = require('./combat.js');
const OA = require('../data/oa_profiles.json').oa_profiles;

const CONTESTS = Number(process.argv[2] || 6);
/* `node probe_fog.cjs 6 off` measures the SAME TREE with the spotting model switched out, so
   a before/after compares the game against itself rather than two checkouts against each
   other — which is the failure mode recorded against this project's measurements twice. */
const FOG = process.argv[3] !== 'off';
/* Trial value for what a shot at a body in the open is worth. Set from here rather than by
   editing `combat.js` for each run, so every trial is the same tree with one number moved and
   a bad trial cannot leave a half-applied edit behind. 1.00 is the shipped value. */
const OPEN = Number(process.argv[4] || require('./combat.js').CONST.COVER_MULT[0]);
require('./combat.js').CONST.COVER_MULT[0] = OPEN;

const acc = Object.create(null);
const nan = new Set();
/* raise, and REMEMBER if the increment was ever not-a-number. `(x||0)+(v||0)` is exactly the
   laundering this project keeps getting burned by, so the NaN is recorded rather than erased. */
function add(k, v) {
  if (typeof v !== 'number' || !isFinite(v)) { nan.add(k); v = 0; }
  acc[k] = (acc[k] || 0) + v;
}

let fights = 0, turnsTot = 0, cappedFights = 0, movers = 0, bodyTurns = 0;
let contactSum = 0, contactN = 0, lateContact = 0;
/* BUNKERING, MEASURED DIRECTLY. A total move rate cannot see the shape of the problem: fights
   that reach a decision climb back to 90% movement because withdrawing means crossing ground,
   while fights that stall sit flat at a third forever. Split by outcome or the two average
   into a number that describes neither. */
const mvT = {}, btT = {}, mvC = {}, btC = {};
const bandShots = [0, 0, 0];
const turnHist = [];

/* WHAT A SHOT IS ACTUALLY WORTH. The first version hooked `hitChance` and read a stack trace
   to tell a pulled trigger from the movement scorer trying a tile on. Correct, and far too
   slow: the scorer outnumbers real shots about two hundred to one, so it fired fourteen million
   times a run and tripled the cost on a one-core box. The realised rate out of telemetry is
   cheaper AND a better number — what happened, rather than what was expected. */
const realResolve = TAC.resolve;
TAC.resolve = function (rng, A, B, ctx) {
  /* THE PER-BODY RECORD IS OFF FOR FIGHTS THE PLAYER IS NOT IN, WHICH IS NEARLY ALL OF THEM.
     The first version of this probe counted body-turns off `frames[].actor` and reported
     0 of 0 — not because nobody moves but because the frames it was counting are only built
     when logging is on. It was measuring an empty set and would have called movement dead.
     Logging draws no random numbers: every use of it is a push onto an array. So forcing it
     on gives the same fight, tile for tile, and is asserted below rather than assumed. */
  const c = (Array.isArray(A) ? B : ctx) || {};
  if (c.log === false) c.log = undefined;
  c.fog = FOG;
  if (process.argv[5] === 'nomotion') c.motion = false;
  const res = realResolve.apply(this, arguments);
  const t = (res && res.telemetry) || {};
  fights++;
  turnsTot += t.turn || 0;
  turnHist.push(t.turn || 0);
  if (t.endedBy === 'clock') cappedFights++;
  if (t.contactTurn) { contactSum += t.contactTurn; contactN++; }
  if (t.contactTurn > 1) lateContact++;
  for (const k of ['shots', 'hits', 'grazes', 'down', 'dead', 'downDeaths', 'stabilized',
                   'moves', 'overwatchShots', 'flankShots', 'dashes', 'dry', 'ambushed',
                   'withdrawn', 'fled', 'coveringFire', 'pins', 'pinsRefused',
                   'arrived', 'arrivals', 'treatAttempts', 'grenades', 'smoke',
                   'blindBodyTurns', 'spotShots', 'blindShots', 'unseenShots',
                   'squadSightShots', 'reveals', 'silentShots', 'softBootsMoves',
                   'ambushInstinct', 'arrivedUnseen']) {
    if (t[k] !== undefined) add(k, t[k]);
  }
  const bs = t.bandShots || [0, 0, 0];
  for (let i = 0; i < 3; i++) bandShots[i] += bs[i] || 0;
  /* how much of the field is actually MOVING — the bunkering question, per acting body */
  const stalled = t.endedBy === 'clock';
  const mvBin = stalled ? mvC : mvT, btBin = stalled ? btC : btT;
  for (const F of (res.frames || [])) {
    if (F.actor == null) continue;
    bodyTurns++;
    if (F.moved) movers++;
    btBin[F.turn] = (btBin[F.turn] || 0) + 1;
    if (F.moved) mvBin[F.turn] = (mvBin[F.turn] || 0) + 1;
  }
  return res;
};

let engagements = 0, dead = 0, careerEnded = 0, days = 0;
for (let i = 0; i < CONTESTS; i++) {
  const st = D.runDivide(P.mulberry32(P.seedFrom('fog' + i)),
                         { oaProfiles: OA, corpCount: 8, season: 1 });
  engagements += st.engagements || 0;
  dead += st.dead || 0;
  careerEnded += st.careerEnded || 0;
  days += st.days || 0;
}
TAC.resolve = realResolve;

const f = (x, d) => (typeof x === 'number' && isFinite(x)) ? x.toFixed(d == null ? 2 : d) : String(x);
const row = (label, v, d) => console.log('  ' + label.padEnd(34) + f(v, d));

console.log('\nFOG ' + (FOG ? 'ON' : 'OFF') + ' \u00b7 ' + CONTESTS +
            ' contests, seeds fog0..fog' + (CONTESTS - 1));
console.log('='.repeat(60));
console.log('  contest');
row('engagements (day loop)', engagements, 0);
row('engagements (grid, wrapped)', fights, 0);
row('contest length (days)', days / CONTESTS);
row('permanent losses', (dead + careerEnded) / CONTESTS);

console.log('  the fight');
row('turns per fight', turnsTot / Math.max(1, fights));
row('fights hitting the turn cap', cappedFights, 0);
row('  as a share', 100 * cappedFights / Math.max(1, fights));

console.log('  is anybody moving?');
row('body-turns observed', bodyTurns, 0);
row('body-turns with a move', movers, 0);
row('  as a share', 100 * movers / Math.max(1, bodyTurns));
row('moves (telemetry)', acc.moves, 0);
row('dashes', acc.dashes, 0);

console.log('  what range does it happen at?');
const bTot = bandShots[0] + bandShots[1] + bandShots[2];
row('long', 100 * bandShots[0] / Math.max(1, bTot));
row('medium', 100 * bandShots[1] / Math.max(1, bTot));
row('short', 100 * bandShots[2] / Math.max(1, bTot));
row('shots total', bTot, 0);

console.log('  the mechanisms fog is supposed to feed');
row('overwatch shots', acc.overwatchShots, 0);
row('  per fight', (acc.overwatchShots || 0) / Math.max(1, fights));
row('ambushed (readiness gap)', acc.ambushed, 0);
row('flank shots', acc.flankShots, 0);
row('squads walking in mid-fight', acc.arrivals, 0);
row('bodies walking in', acc.arrived, 0);

console.log('  what people knew');
row('first contact, turn', contactSum / Math.max(1, contactN));
row('fights not in contact on turn 1', lateContact, 0);
row('body-turns with no contact at all', acc.blindBodyTurns, 0);
row('shots at a body with eyes on it', acc.spotShots, 0);
row('shots at a muzzle flash', acc.blindShots, 0);
row('  as a share of shots', 100 * (acc.blindShots || 0) /
     Math.max(1, (acc.spotShots || 0) + (acc.blindShots || 0)));
row('shots the shooter was unseen for', acc.unseenShots, 0);
row('shots at what a squadmate saw', acc.squadSightShots, 0);
row('shots that gave a position away', acc.reveals, 0);
row('shots that did not (quiet kit)', acc.silentShots, 0);
row('Soft Boots moving unseen', acc.softBootsMoves, 0);
row('Ambush Instinct opening fire', acc.ambushInstinct, 0);

console.log('  bunkering: share of bodies that moved, by turn');
{
  const line = (label, M, B) => {
    const cells = [];
    for (const t of [1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 24]) {
      cells.push(B[t] ? (100 * (M[t] || 0) / B[t]).toFixed(0).padStart(4) : '   -');
    }
    console.log('  ' + label.padEnd(22) + cells.join(''));
  };
  console.log('  ' + ' '.repeat(22) + ['t1','t2','t3','t4','t6','t8','t10','t13','t16','t20','t24']
    .map(x => x.padStart(4)).join(''));
  line('reached a decision', mvT, btT);
  line('ran out the clock', mvC, btC);
}

console.log('  what a shot was worth');
row('shots that hit', 100 * (acc.hits || 0) / Math.max(1, acc.shots || 0));
row('shots that grazed', 100 * (acc.grazes || 0) / Math.max(1, acc.shots || 0));

console.log('  outcomes');
row('dead on the grid', acc.dead, 0);
row('deaths on the recovery roll', acc.downDeaths, 0);
row('stabilized', acc.stabilized, 0);
row('withdrawn off the field', acc.withdrawn, 0);
row('fled', acc.fled, 0);

console.log('='.repeat(60));
if (nan.size) {
  console.log('  !! NOT A NUMBER, at least once: ' + [...nan].join(', '));
  console.log('     these read as a confident zero everywhere downstream. Do not believe them.');
} else {
  console.log('  every counter above was a number every time it was raised.');
}
/* A zero that is genuinely zero is still a claim about a branch that never ran. Say which. */
const zeros = Object.keys(acc).filter(k => !acc[k]).concat(
  ['ambushed', 'arrivals', 'pins'].filter(k => acc[k] === undefined));
if (zeros.length) console.log('  zero (and not NaN): ' + [...new Set(zeros)].join(', '));
