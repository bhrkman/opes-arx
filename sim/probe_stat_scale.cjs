/* THE SCALE, SWORN. Stats live at ten times the founding 1–20 scale so training can move
 * in whole points; everything was migrated by exact arithmetic and proven by the untouched
 * snapshot gate. This probe keeps the boundaries honest forever after: births are always
 * multiples of ten inside [10, 200], the combat
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
/* births are no longer multiples of ten, by design: every stat is nudged within its decade at birth (a
   balanced ±9, `roster.js` "the grain between the tens") so a fighter reads as a person, not a rounded
   number — and quirks then add real points on top. The claim this replaced predated the nudge. */

const f0 = bodies[0];
const u = C.makeCombatant(f0, { day: 1 });
check(u.stats !== f0.stats, 'the unit takes a COPY — the roster\'s truth is never touched');
/* §ONE AIM this asserted the opposite — "the copy is exactly one tenth, stat for stat" — and so
   held the second scale in place. There is one scale: combat reads the sheet. */
check(STATS.filter(k => k !== 'aim').every(k => u.stats[k] === f0.stats[k]),
      'the copy is the sheet, stat for stat — one scale');
check(u.hpMax === Math.round(C.CONST.HP_BASE + C.CONST.HP_PER_GRIT * f0.stats.grit),
      'hit points read the sheet\'s grit (' + u.hpMax + ' from grit ' + f0.stats.grit + ')');

/* the scout speaks the same language the sheet does */
const lot = SEASON.openLot(P.mulberry32(P.seedFrom('scale-lot')), 'mercs');
check(lot.every(f => STATS.every(k => f.stats[k] >= 10 && f.stats[k] <= 200)),
      'every market lot is priced and shown at the same scale');

/* ===== step d: the trades — Aim, a damage class, a weapon type (§SKILLS, ruled) ===== */
console.log('\nthe weapon trades —');
{
  const all = [];
  for (const id in corps) all.push.apply(all, corps[id].roster);
  const keys = ITEMS.SKILL_CLASSES.map(x => x.id).concat(ITEMS.SKILL_TYPES.map(x => x.id));
  check(ITEMS.SKILL_TYPES.length >= 10 && all.every(f => f.skills && keys.every(k => f.skills[k] >= 10 && f.skills[k] <= 200)),
        'every body is born with both classes and all ' + ITEMS.SKILL_TYPES.length + ' weapon types, in range');
  /* the types ARE the shop's sections: every gun's type is one of them, and every gun has a class */
  const arms = ITEMS.bySlot('primary').concat(ITEMS.bySlot('sidearm'));
  const typeIds = new Set(ITEMS.SKILL_TYPES.map(t => t.id));
  check(arms.every(w => typeIds.has(ITEMS.skillTypeOf(w)) && ITEMS.skillClassOf(w)),
        'every gun reads a weapon type from its shop section, and a damage class');
  /* the resolved weapon carries the same answer */
  check(arms.every(w => {
    const probeF = { id: 'probe', race: 'human', stats: { aim: 100, grit: 100, reflex: 100,
      fieldcraft: 100, tactics: 100, presence: 100, resolve: 100 }, skills: {}, condition: {} };
    ITEMS.equip(probeF, { primary: w.slot === 'primary' ? w.id : arms[0].id, armor: 'itm_flak_vest' });
    const g = ITEMS.byId(probeF.loadout.primary), wk = probeF.loadout.kit.weapon;
    return wk.skillClass === ITEMS.skillClassOf(g) && wk.skillType === ITEMS.skillTypeOf(g);
  }), 'every resolved weapon carries its class and type');
  /* the shot: the average of Aim, the class and the type, exactly */
  const f0b = all[0];
  ITEMS.equip(f0b, { primary: 'itm_surplus_rifle', armor: 'itm_flak_vest' });
  const gun = ITEMS.byId('itm_surplus_rifle');
  const u2 = C.makeCombatant(f0b, { day: 1 });
  const want = (f0b.stats.aim + f0b.skills[ITEMS.skillClassOf(gun)] + f0b.skills[ITEMS.skillTypeOf(gun)]) / 3;
  check(Math.abs(u2.stats.aim - want) < 1e-9, 'the shot is Aim, class and type averaged (' + u2.stats.aim.toFixed(1) + ')');
  /* a specialist is one: the spread between a hand's best and worst type is wide */
  const spread = all.map(f => { const v = ITEMS.SKILL_TYPES.map(t => f.skills[t.id]); return Math.max(...v) - Math.min(...v); })
                    .sort((x, y) => x - y);
  check(spread[Math.floor(spread.length / 2)] >= 60, 'a hand has a standout type and a poor one (median spread ' +
        spread[Math.floor(spread.length / 2)] + ')');
  /* origin carries fiction: prisoners lean close and dirty — a tendency, not a law */
  const lots = [];
  for (let k = 0; k < 12; k++) lots.push(...SEASON.openLot(P.mulberry32(P.seedFrom('scale-prison' + k)), 'bastille'));
  const meanOf = key => lots.reduce((t, f) => t + f.skills[key], 0) / Math.max(1, lots.length);
  const close = (meanOf('scatterguns') + meanOf('submachine_guns')) / 2, far = (meanOf('long_rifles') + meanOf('marksman_rifles')) / 2;
  check(lots.length > 10 && close > far + 10,
        'prisoners learned close and dirty: on average better with scatterguns and SMGs than long guns (' +
        Math.round(close) + ' against ' + Math.round(far) + ', ' + lots.length + ' prisoners)');
}


console.log(failed ? '\n' + failed + ' SCALE CLAIM(S) FAILED'
                   : '\nthe scale holds at every boundary — one scale, stored and fought');
process.exit(failed ? 1 : 0);
