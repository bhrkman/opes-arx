/* DOES SIZE READ ON THE GROUND? Three should walk faster than eight and be harder to
 * notice — the whole argument for fielding a small squad. This probe builds REAL squads of
 * three and of eight out of one fleet corp through the manager's-groups seam (no hand-made
 * fighters), then measures the two exported reads and their live-headcount behaviour:
 * attrition must lighten a squad, monotonically, and the pivot must read neutral.
 *
 *   node probe_squad_size.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const ROSTER = require('./roster.js');
const ITEMS = require('./items.js');
const DIVIDE = require('./divide.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const rng = P.mulberry32(P.seedFrom(process.argv[2] || 'corp-1'));
const corps = SEASON.openFleet(rng, OA, {});
const me = corps[OA[0].id];

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };

const drop = SEASON.selectDrop(me, {});
const ids = drop.map(b => b.id);
const per = { drop: drop, account: me.account, armoury: me.armoury, intel: 0,
              groups: [ids.slice(0, 3), ids.slice(3, 11), ids.slice(11, 17)],
              leaders: [null, null, null] };
const c = DIVIDE.buildCorp(rng, me.profile, 'standard', undefined, null, null, null, per, 1);
const three = c.squads[0], eight = c.squads[1], six = c.squads[2];
check(three.bodies.length === 3 && eight.bodies.length === 8 && six.bodies.length === 6,
      'real squads of 3, 8 and 6 stood up through the groups seam');

const m3 = DIVIDE.sizeMarchMult(three), m8 = DIVIDE.sizeMarchMult(eight);
const d3 = DIVIDE.sizeDetectMult(three), d8 = DIVIDE.sizeDetectMult(eight);
console.log('march: three ' + m3.toFixed(2) + 'x · eight ' + m8.toFixed(2) + 'x');
console.log('noticeability: three ' + d3.toFixed(3) + 'x · eight ' + d8.toFixed(3) +
            'x · a 3-vs-3 pair vs an 8-vs-8 pair: ' +
            ((d3 * d3) / (d8 * d8) * 100).toFixed(0) + '% as likely to make contact');
check(m3 > 1 && m8 < 1 && m3 > m8, 'three march faster than the pivot; eight slower');
check(d3 < 1 && d8 > 1 && d3 < d8, 'three are harder to notice than the pivot; eight easier');
check(DIVIDE.sizeMarchMult(six) === 1 && DIVIDE.sizeDetectMult(six) === 1,
      'the pivot of six reads neutral both ways');

/* attrition must LIGHTEN a squad: the reads use live headcount, not the muster roll */
const beforeM = DIVIDE.sizeMarchMult(eight), beforeD = DIVIDE.sizeDetectMult(eight);
eight.bodies[0].status = 'dead';
eight.bodies[1].status = 'injured';
check(DIVIDE.sizeMarchMult(eight) > beforeM && DIVIDE.sizeDetectMult(eight) < beforeD,
      'two off their feet and the eight march like six and read like six — live headcount, not the roll');
eight.bodies[0].status = 'active'; eight.bodies[1].status = 'active';

/* monotone across the whole legal shape, so no size is accidentally privileged */
let mono = true, prevM = Infinity, prevD = -Infinity;
for (let n = DIVIDE.CONST.SQUAD_MIN; n <= DIVIDE.CONST.SQUAD_MAX; n++) {
  const fake = { bodies: drop.slice(0, n) };
  const mm = DIVIDE.sizeMarchMult(fake), dd = DIVIDE.sizeDetectMult(fake);
  if (!(mm < prevM) || !(dd > prevD)) mono = false;
  prevM = mm; prevD = dd;
}
check(mono, 'both reads are strictly monotone across ' + DIVIDE.CONST.SQUAD_MIN + '..' +
            DIVIDE.CONST.SQUAD_MAX + ' — every body added slows and betrays');

console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' : '\nsize reads on the ground — both ways, honestly');
process.exit(failed ? 1 : 0);
