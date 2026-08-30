/* THE SCALE, SWORN. Stats live at ten times the founding 1–20 scale so training can move
 * in whole points; everything was migrated by exact arithmetic and proven by the untouched
 * snapshot gate. This probe keeps the boundaries honest forever after: births are always
 * multiples of ten inside [10, 200], potential is a ceiling at the same scale, the combat
 * unit's copy is exactly one tenth of the roster's truth (and never the same object), and
 * hit points read the founding scale — the reader whose miss made every fight in the world
 * run to the turn cap.
 *
 *   node probe_stat_scale.cjs [seed]
 */
const fs = require('fs');
const P = require('./prng.js');
const ROSTER = require('./roster.js');
const ITEMS = require('./items.js');
const C = require('./combat.js');
const SEASON = require('./season.js');

const OA = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const rng = P.mulberry32(P.seedFrom(process.argv[2] || 'scale-1'));

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };
const STATS = ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve'];

const corps = SEASON.openFleet(rng, OA, {});
const bodies = [];
for (const id in corps) bodies.push.apply(bodies, corps[id].roster);
check(bodies.length > 100, 'a whole fleet born for the measurement (' + bodies.length + ' bodies)');

let inRange = true, tens = true, ceiling = true;
for (const f of bodies) {
  for (const k of STATS) {
    const v = f.stats[k];
    if (!(v >= 10 && v <= 200)) inRange = false;
    if (v % 10 !== 0) tens = false;
  }
  const mx = Math.max.apply(null, STATS.map(k => f.stats[k]));
  if (!(f.potential >= mx && f.potential <= 200 && f.potential % 10 === 0)) ceiling = false;
}
check(inRange, 'every stat is born inside [10, 200]');
check(tens, 'every birth is a multiple of ten — the grain between belongs to training');
check(ceiling, 'potential is a ceiling at the same scale, at or above the best stat');

const f0 = bodies[0];
const u = C.makeCombatant(f0, { day: 1 });
check(u.stats !== f0.stats, 'the unit takes a COPY — the roster\'s truth is never touched');
check(STATS.every(k => u.stats[k] === f0.stats[k] / 10),
      'the copy is exactly one tenth, stat for stat');
const gritOld = f0.stats.grit / 10;
check(u.hpMax === Math.round(C.CONST.HP_BASE + C.CONST.HP_PER_GRIT * gritOld),
      'hit points read the founding scale (' + u.hpMax + ' from grit ' + f0.stats.grit + ')');

/* the scout speaks the same language the sheet does */
const lot = SEASON.openLot(P.mulberry32(P.seedFrom('scale-lot')), 'mercs');
check(lot.every(f => STATS.every(k => f.stats[k] >= 10 && f.stats[k] <= 200)),
      'every market lot is priced and shown at the same scale');

/* ===== step d: the trades ===== */
console.log('\nthe weapon trades —');
{
  const all = [];
  for (const id in corps) all.push.apply(all, corps[id].roster);
  const fams = ITEMS.SKILL_FAMILIES.map(x => x.id);
  check(all.every(f => f.skills && fams.every(k =>
        f.skills[k] >= 10 && f.skills[k] <= 200)),
        'every body is born with all six trades, in range');
  /* three ranges, three trades per damage type: a medium weapon reads its own tier, and short
     still folds to close — the middle band is no longer swept into close */
  check(ITEMS.skillFamilyOf({ family: 'ballistic', effects: { range: 'medium' } }) === 'ballistic_medium' &&
        ITEMS.skillFamilyOf({ family: 'energy',    effects: { range: 'medium' } }) === 'energy_medium' &&
        ITEMS.skillFamilyOf({ family: 'ballistic', effects: { range: 'short'  } }) === 'ballistic_close',
        'the medium band has its own trade; short still folds to close');
  /* the fold has one home: every resolved weapon agrees with skillFamilyOf */
  const arms = ITEMS.bySlot('primary').concat(ITEMS.bySlot('sidearm'));
  check(arms.every(w => {
    const probeF = { id: 'probe', race: 'human', stats: { aim: 100, grit: 100, reflex: 100,
      fieldcraft: 100, tactics: 100, presence: 100, resolve: 100 }, skills: {}, condition: {} };
    ITEMS.equip(probeF, { primary: w.slot === 'primary' ? w.id : arms[0].id, armor: 'itm_flak_vest' });
    return probeF.loadout.kit.weapon.skillFamily ===
           ITEMS.skillFamilyOf(ITEMS.byId(probeF.loadout.primary));
  }), 'the fold agrees with itself: every resolved weapon carries skillFamilyOf\'s answer');
  /* effective aim at the boundary: hand and trade averaged, exactly */
  const f0b = all[0];
  ITEMS.equip(f0b, { primary: 'itm_surplus_rifle', armor: 'itm_flak_vest' });
  const u2 = C.makeCombatant(f0b, { day: 1 });
  check(u2.stats.aim === (f0b.stats.aim + f0b.skills.ballistic_long) / 2 / 10,
        'the unit aims with hand and trade averaged (' + u2.stats.aim + ')');
  /* origin carries fiction: a prisoner lot leans close and dirty */
  const plot = SEASON.openLot(P.mulberry32(P.seedFrom('scale-prison')), 'bastille');
  check(plot.length > 0 && plot.every(f =>
        f.skills.ballistic_close - f.stats.aim === 20),
        'prisoners learned close and dirty: ballistic_close = aim + 20, every one');
}

console.log(failed ? '\n' + failed + ' SCALE CLAIM(S) FAILED'
                   : '\nthe scale holds at every boundary — ×10 stored, founding-scale fought');
process.exit(failed ? 1 : 0);
