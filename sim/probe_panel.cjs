/* THE PANEL — test one weapon, properly.
 *
 * A twelve-build league at adequate power costs thirteen minutes, which means in practice it
 * gets run at inadequate power and produces rankings of randomness (COMBAT.md, "How weapon
 * numbers must be measured"). Most catalog questions are not "rank everything" anyway; they
 * are "is THIS weapon carrying its price", and that question needs one weapon against a fixed
 * reference panel, not a full round robin.
 *
 * Four references, chosen because they are the corners of the shelf rather than because they
 * are good: the standard, the long specialist, the short specialist, and the enabler. Every
 * matchup runs both directions and across two independent fighter populations, and the report
 * says whether the populations AGREED — because a number the two populations disagree about is
 * not a number.
 *
 *   node probe_panel.cjs itm_battle_rifle [trials]
 */
const P = require('./prng.js');
const C = require('./combat.js');
const T = require('./tactical.js');
const ITEMS = require('./items.js');
const ROSTER = require('./roster.js');

const GROUNDS = ['open_basin', 'broken_ground', 'ruins', 'forest', 'entrenched'];
const BANDS = [0, 1, 2];
const PREP = [[0.73, 0.73], [0.87, 0.48], [0.48, 0.87], [0.95, 0.20]];
const PANEL = ['itm_carbine', 'itm_marksman_rifle', 'itm_drum_shotgun', 'itm_machine_gun'];

const WEAPON = process.argv[2] || 'itm_battle_rifle';
/* A mistyped id used to equip nothing and report the resulting unarmed squad as a weapon losing
   every matchup — a probe that answers a question you did not ask is worse than one that fails. */
if (!ITEMS.catalog.find(i => i.id === WEAPON && i.slot === 'primary')) {
  const near = ITEMS.catalog.filter(i => i.slot === 'primary')
    .map(i => i.id + '  ' + i.name).slice(0, 200);
  console.error('\nno primary with id "' + WEAPON + '". Available:\n  ' + near.join('\n  '));
  process.exit(1);
}
const TRIALS = parseInt(process.argv[3] || '10', 10);

/** `gun` may be a single id (everybody carries it) or an array of eight. */
function squad(seed, gun) {
  const bodies = ROSTER.generateSquad(P.mulberry32(P.seedFrom(seed)), 8,
                                      { corpId: 'alliance_house' }).bodies;
  const guns = Array.isArray(gun) ? gun : new Array(8).fill(gun);
  bodies.forEach((b, i) => {
    ITEMS.equip(b, { primary: guns[i], armor: 'itm_plate_carrier',
                     sidearm: 'itm_service_pistol', consumables: [] });
  });
  let cap = bodies[0];
  for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
  return bodies.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById,
                                              isCaptain: f.id === cap.id, day: 12 }));
}

const side = (tag, units) => ({ tag, corpId: tag, policy: 'standard',
                                policyName: 'standard', hasMedkit: true, units });

/** net casualty advantage of `mine` over `theirs`, sides swapped, one population base. */
function duel(mine, theirs, base) {
  let a = 0, b = 0, n = 0;
  for (let t = 0; t < TRIALS; t++) {
    for (const g of GROUNDS) {
      const ob = BANDS[(t + GROUNDS.indexOf(g)) % 3];
      const pp = PREP[(t + GROUNDS.indexOf(g)) % PREP.length];
      for (const swap of [false, true]) {
        const A = side('A', squad(base + t + (swap ? 'b' : 'a'), swap ? theirs : mine));
        const B = side('B', squad(base + t + (swap ? 'a' : 'b'), swap ? mine : theirs));
        const r = T.resolve(P.mulberry32(P.seedFrom('panel' + t + g + ob)), A, B,
                            { terrain: g, openingBand: ob,
                              prep: swap ? [pp[1], pp[0]] : pp, log: false });
        const c = x => (x.dead || 0) + (x.down || 0);
        /* `mine` is A when not swapped and B when swapped, so the sign follows the weapon */
        a += swap ? c(r.casualties.B) : c(r.casualties.A);
        b += swap ? c(r.casualties.A) : c(r.casualties.B);
        n++;
      }
    }
  }
  return { net: (b - a) / n, fights: n };
}

/* ---- MARGINAL MODE ------------------------------------------------------------------
   An eight-of-a-kind test is the wrong question for an ENABLER. A machine gun is supposed to
   kill almost nobody and buy ground for the person beside it, so eight of them measuring badly
   is the design working, not failing — and no amount of running that test tells you whether
   the tag earns its price. The question that does: take a squad, swap ONE body's weapon for
   this one, and see whether the squad got better.

   That is the whole thesis of COMPOSITION.md stated as an experiment, and it has never been
   run. Two baselines, because "better than eight carbines" and "better than eight marksman
   rifles" are different claims and a weapon that only improves one of them has a narrower
   home than its price suggests. */
function marginal(gun, baseline, opp, base, count) {
  const mix = new Array(8).fill(baseline);
  for (let i = 0; i < count; i++) mix[i] = gun;
  let pureNet = 0, mixNet = 0, n = 0;
  for (let t = 0; t < TRIALS; t++) {
    for (const g of GROUNDS) {
      const ob = BANDS[(t + GROUNDS.indexOf(g)) % 3];
      const pp = PREP[(t + GROUNDS.indexOf(g)) % PREP.length];
      for (const load of [baseline, mix]) {
        const A = side('A', squad(base + t + 'a', load));
        const B = side('B', squad(base + t + 'b', opp));
        const r = T.resolve(P.mulberry32(P.seedFrom('marg' + t + g + ob)), A, B,
                            { terrain: g, openingBand: ob, prep: pp, log: false });
        const c = x => (x.dead || 0) + (x.down || 0);
        const net = c(r.casualties.B) - c(r.casualties.A);
        if (load === mix) mixNet += net; else pureNet += net;
      }
      n++;
    }
  }
  return { gain: (mixNet - pureNet) / n, pure: pureNet / n, mix: mixNet / n };
}

const name = id => (ITEMS.catalog.find(i => i.id === id) || {}).name || id;
const cost = id => (ITEMS.catalog.find(i => i.id === id) || {}).cost || 0;

if (process.argv[4] === 'marginal') {
  console.log('\n' + name(WEAPON) + '  (' + cost(WEAPON) + ' credits) — what does ADDING it do?');
  console.log('-'.repeat(74));
  console.log('squad of'.padEnd(20) + 'facing'.padEnd(20) + 'how many   gain    agree?');
  /* NARROW=1 cuts the matrix to the single question that matters for an enabler and spends
     the whole budget on power instead: a carbine line facing a squad that has to CROSS GROUND
     to be dangerous. If pinning is worth anything anywhere, it is worth it there — and a
     twelve-cell matrix at seventy fights a cell answered nothing, with eight of the twelve
     reported as disagreements. */
  const BASELINES = process.env.NARROW ? ['itm_carbine'] : ['itm_carbine', 'itm_marksman_rifle'];
  const OPPS = process.env.NARROW ? ['itm_drum_shotgun'] : ['itm_carbine', 'itm_drum_shotgun'];
  for (const baseline of BASELINES) {
    for (const opp of OPPS) {
      for (const count of [1, 2, 3]) {
        const A = marginal(WEAPON, baseline, opp, 'popA', count);
        const B = marginal(WEAPON, baseline, opp, 'popB', count);
        const mean = (A.gain + B.gain) / 2;
        const agree = (A.gain >= 0) === (B.gain >= 0);
        console.log(name(baseline).padEnd(20) + name(opp).padEnd(20) +
                    String(count).padEnd(11) +
                    (mean >= 0 ? '+' : '') + mean.toFixed(3) + '   ' +
                    (agree ? 'yes' : 'NO'));
      }
    }
  }
  console.log('-'.repeat(74));
  console.log('gain = casualties the swap is worth, per fight. ' +
              TRIALS * GROUNDS.length + ' fights a cell a population.');
  process.exit(0);
}

console.log('\n' + name(WEAPON) + '  (' + cost(WEAPON) + ' credits) against the panel');
console.log('-'.repeat(72));
console.log('opponent'.padEnd(22) + 'pop A     pop B     mean      agree?');

let sum = 0, disagreed = 0;
for (const opp of PANEL) {
  if (opp === WEAPON) continue;
  const A = duel(WEAPON, opp, 'popA'), B = duel(WEAPON, opp, 'popB');
  const mean = (A.net + B.net) / 2;
  const agree = (A.net >= 0) === (B.net >= 0);
  if (!agree) disagreed++;
  sum += mean;
  console.log(name(opp).padEnd(22) +
              (A.net >= 0 ? '+' : '') + A.net.toFixed(3) + '    ' +
              (B.net >= 0 ? '+' : '') + B.net.toFixed(3) + '    ' +
              (mean >= 0 ? '+' : '') + mean.toFixed(3) + '    ' +
              (agree ? 'yes' : 'NO — not a number'));
}
const n = PANEL.filter(o => o !== WEAPON).length;
console.log('-'.repeat(72));
console.log('mean across the panel: ' + (sum / n >= 0 ? '+' : '') + (sum / n).toFixed(3) +
            '   per 1000 credits: ' + (sum / n / cost(WEAPON) * 1000).toFixed(3));
console.log(TRIALS * GROUNDS.length * 2 + ' fights per matchup per population' +
            (disagreed ? '  \u2014 ' + disagreed + ' MATCHUP(S) THE POPULATIONS DISAGREED ON' : ''));
