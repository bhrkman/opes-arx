/* §ONE AIM — THE PROOF. Removing the ÷10 between a fighter's sheet and their combat stats is a change
   of UNITS: done right, not one fight comes out differently. This records — through the current code —
   every quantity a stat feeds, and then checks the new code reproduces it.
     record : write docs/stat_scale_baseline.json
     check  : recompute and compare. Aim values are compared in sheet units (old ×10); hit chances,
              composure, wound pools, severity rolls and whole fights must match exactly.
   Sight is excluded from the fights' identity only if STAGE=2 (it is the one intended change).
   `node harness/stat_scale_proof.cjs record|check` */
const fs = require('fs'), crypto = require('crypto');
const D = '/home/claude/opes-arx/sim/';
const P = require(D + 'prng.js'), C = require(D + 'combat.js'), T = require(D + 'tactical.js'),
      R = require(D + 'roster.js'), I = require(D + 'items.js'), M = require(D + 'map.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const MODE = process.argv[2] || 'check';
const OUT = '/home/claude/opes-arx/docs/stat_scale_baseline.json';
const AIM_SCALE = 1;   /* §ONE AIM the baseline is re-recorded on the one scale after Stage 2: it now guards it as it stands */

const GUNS = ['itm_surplus_rifle', 'itm_pdw', 'itm_hunting_rifle', 'itm_pulse_carbine', 'itm_riot_autogun'];
const MODSETS = [[], ['itm_mod_optic'], ['itm_mod_bipod'], ['itm_mod_target_link'], ['itm_mod_rangefinder']];
const ARMS = ['itm_scout_weave', 'itm_flak_vest', 'itm_plate_carrier'];
function fighters(seed, n) {
  const b = R.generateSquad(P.mulberry32(seed), n, { corpId: null }).bodies;
  b.forEach((f, i) => I.equip(f, { primary: GUNS[i % GUNS.length], armor: ARMS[i % ARMS.length], sidearm: null,
                                   mods: MODSETS[i % MODSETS.length], consumables: [] }));
  return b;
}
const out = { aim: [], hit: [], comp: [], hp: [], sev: [], fights: [], contests: [] };
const S = require(D + 'season.js'), DIV = require(D + 'divide.js');

/* 1. aim, across every situation aimEff reads */
const bodies = fighters(11, 15);
const units = bodies.map(f => C.makeCombatant(f, { traitIndex: R.traitById, day: 5 }));
const SITS = [];
for (const band of [0, 1, 2]) for (const ov of [false, true]) for (const un of [false, true])
  for (const rep of [false, true]) for (const sup of [false, true])
    SITS.push({ band, ctx: { overwatch: ov, unseen: un, exchange: 1 }, rep, sup });
for (const u of units) for (const s of SITS) {
  const c = Object.assign({}, u, { repositioning: s.rep, suppressed: s.sup, fatigue: 40, state: 'ok' });
  out.aim.push(C.aimEff(c, s.band, s.ctx));
}
/* 2. hit chance, shooter × target × cover × band */
for (let i = 0; i < units.length; i++) for (let j = 0; j < 4; j++) {
  const sh = units[i], tg = Object.assign({}, units[(i + j + 1) % units.length]);
  for (const cover of [0, 1, 2, 3]) for (const band of [0, 1, 2]) {
    tg.cover = cover; tg.spotted = true;
    out.hit.push(C.hitChance(sh, tg, band, { exchange: 1 }, false));
    out.hit.push(C.hitChance(sh, tg, band, { exchange: 1, overwatch: true }, true));
  }
}
/* 3. composure and wound pool, straight off the sheet */
for (const f of fighters(23, 30)) {
  out.comp.push(C.seedComposure ? C.seedComposure(f, new Set(), {}) : null);
  out.hp.push(C.hpFor ? C.hpFor(f) : null);
}
/* 4. severity rolls, a fixed stream */
{ const rng = P.mulberry32(77);
  for (let i = 0; i < units.length; i++) for (let k = 0; k < 40; k++) {
    const tg = Object.assign({}, units[(i + 3) % units.length], { cover: k % 4 });
    out.sev.push(C.resolveSeverity(rng, units[i], tg, 'standard', k % 3, null, 5));
  } }
/* 5. whole grid fights, logged end to end */
for (let i = 0; i < 30; i++) {
  const rng = P.mulberry32(P.seedFrom('ssp' + i));
  const mk = prof => {
    const b = R.generateSquad(rng, 5, { corpId: prof.id }).bodies;
    b.forEach((f, k) => I.equip(f, { primary: GUNS[(i + k) % GUNS.length], armor: ARMS[k % 3], sidearm: null,
      mods: MODSETS[(i + k) % MODSETS.length], consumables: ['itm_frag_grenade', 'itm_smoke_canister'] }));
    return { corpId: prof.id, policy: 'standard',
             units: b.map(f => C.makeCombatant(f, { traitIndex: R.traitById, day: 5 })), hasMedkit: false, fidelity: 0.7 };
  };
  const pl = M.generatePlanet(P.mulberry32(i), { season: 1 });
  const r = T.resolve(P.mulberry32(i + 5), [mk(oa[i % 8]), mk(oa[(i + 3) % 8])], { planet: pl, day: 5, x: pl.cx, y: pl.cy, fog: true });
  const t = r.telemetry || {};
  out.fights.push({ shots: t.shots, hits: t.hits, downs: t.downs, turns: t.turn,
                    log: crypto.createHash('sha1').update(JSON.stringify(r.log || [])).digest('hex').slice(0, 16) });
}

/* 6. two whole contests — coordination, preparedness, every fight and the settlement */
for (const seed of ['sspA', 'sspB']) {
  const rng = P.mulberry32(P.seedFrom(seed));
  const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const r = DIV.runDivide(d.rng, d.opts);
  out.contests.push({ fights: r.engagements, winner: r.winner,
    audit: crypto.createHash('sha1').update(JSON.stringify(r.audit || {})).digest('hex').slice(0, 16),
    take: crypto.createHash('sha1').update(JSON.stringify((r.settlement || {}).take || {})).digest('hex').slice(0, 12) });
}

if (MODE === 'record') {
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('baseline recorded: ' + out.aim.length + ' aims, ' + out.hit.length + ' hit chances, ' + out.comp.length +
              ' composures, ' + out.hp.length + ' wound pools, ' + out.sev.length + ' severity rolls, ' + out.fights.length + ' fights, ' + out.contests.length + ' contests');
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const close = (a, b, tol) => (a == null && b == null) || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
let bad = 0;
const cmp = (name, got, want, scale, tol) => {
  let miss = 0, first = -1;
  for (let i = 0; i < want.length; i++) if (!close(got[i], want[i] * scale, tol)) { miss++; if (first < 0) first = i; }
  console.log('  ' + (miss ? 'FAIL' : 'ok  ') + '  ' + name.padEnd(16) + (want.length - miss) + ' / ' + want.length + ' match' +
              (miss ? '   first at ' + first + ': got ' + got[first] + ', wanted ' + want[first] * scale : ''));
  bad += miss;
};
console.log('\nONE AIM \u2014 does the new scale reproduce the old, exactly?\n');
cmp('aim (sheet units)', out.aim, base.aim, AIM_SCALE, 1e-9);
cmp('hit chance', out.hit, base.hit, 1, 1e-9);
cmp('composure', out.comp, base.comp, 1, 1e-9);
cmp('wound pool', out.hp, base.hp, 1, 1e-9);
{ let m = 0; for (let i = 0; i < base.sev.length; i++) if (out.sev[i] !== base.sev[i]) m++;
  console.log('  ' + (m ? 'FAIL' : 'ok  ') + '  severity rolls    ' + (base.sev.length - m) + ' / ' + base.sev.length + ' match'); bad += m; }
{ let m = 0, first = -1;
  for (let i = 0; i < base.fights.length; i++) if (JSON.stringify(out.fights[i]) !== JSON.stringify(base.fights[i])) { m++; if (first < 0) first = i; }
  console.log('  ' + (m ? 'FAIL' : 'ok  ') + '  whole fights      ' + (base.fights.length - m) + ' / ' + base.fights.length + ' identical, log for log' +
              (m ? '   first at fight ' + first + ': ' + JSON.stringify(out.fights[first]) + ' vs ' + JSON.stringify(base.fights[first]) : ''));
  bad += m; }
{ let m = 0;
  for (let i = 0; i < base.contests.length; i++) if (JSON.stringify(out.contests[i]) !== JSON.stringify(base.contests[i])) m++;
  console.log('  ' + (m ? 'FAIL' : 'ok  ') + '  whole contests    ' + (base.contests.length - m) + ' / ' + base.contests.length + ' identical' +
              (m ? '   ' + JSON.stringify(out.contests) + ' vs ' + JSON.stringify(base.contests) : ''));
  bad += m; }
console.log(bad ? '\n' + bad + ' mismatch(es): the change of units changed something' : '\nthe new scale reproduces the old: a change of units and nothing else');
process.exit(bad ? 1 : 0);
