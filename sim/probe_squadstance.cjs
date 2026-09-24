/* WHAT A SQUAD'S STANCE IS WORTH. The same contest, the same ground and the same drop, run once
   per notch with EVERY squad of one OA held to that notch — so the only thing that changes is
   how those squads spend their days. It counts what the stance is supposed to change: how far
   they walk, how much they see, how many fights they are in, and how many of them die.
   The per-OA ladder this replaced bought a tenth of a fight between its ends; this is the
   measurement that says whether a squad's own stance buys more.
   `node sim/probe_squadstance.cjs [contests]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 3);
const FROM = +(process.env.FROM || 1);   /* first seed, so a long run can be split into batches */
const W = DIV.NOTCH_WORDS;
console.log('\nWHAT A SQUAD\u2019S STANCE IS WORTH \u00b7 ' + N + ' contests, one OA\u2019s squads held to each notch\n');
const rows = [];
const ONLY = process.argv[3] || null;
for (const notch of DIV.NOTCHES) {
  if (ONLY && notch !== ONLY) continue;
  let walked = 0, days = 0, seen = 0, fights = 0, dead = 0, sites = 0, wall = 0, sought = 0, found = 0, fightDead = 0;
  for (let s = FROM; s < FROM + N; s++) {
    const rng = P.mulberry32(P.seedFrom('ss' + s));
    const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
    while (st.month <= 11) S.stepMonth(st);
    S.closeSeasonToDrop(st);
    const d = S.prepareDivide(st);
    const me = st.ids[0];
    d.opts.human = me;
    const gen = DIV.divideCore(d.rng, d.opts);
    let step = gen.next(), first = true;
    while (!step.done) {
      const w = step.value, ans = {};
      const mine = (w.corps || []).filter(x => x.id === me)[0];
      if (mine) {
        ans.squadStance = {};
        (mine.squads || []).forEach((q, i) => { ans.squadStance[i] = notch; });
        (w.fights || []).forEach(f => { if ((f.corps || []).indexOf(me) >= 0) fights++; });
      }
      step = gen.next(ans);
    }
    const res = step.value || {};
    const pc = (res.corps || []).filter(x => x.id === me)[0] || {};
    dead += (pc.allBodies || []).filter(b => b.status === 'dead').length;
    sites += pc.sitesClaimed || 0;
    const a = res.audit || {};
    seen += a.sightingsMine || 0;
    wall += ((a.wallBy || {})[me]) || 0;
    sought += ((a.seekerBy || {})[me]) || 0;
    found += ((a.foundBy || {})[me]) || 0;
    fightDead += (pc.allBodies || []).filter(b => b.status === 'dead').length - (((a.wallBy || {})[me]) || 0);
  }
  rows.push({ notch, fights: fights / N, dead: dead / N, sites: sites / N, seen: seen / N });
  console.log('  ' + W[notch].padEnd(7) + '  went looking ' + (sought / N).toFixed(1).padStart(5) +
              '   was found ' + (found / N).toFixed(1).padStart(5) +
              '   killed by the wall ' + (wall / N).toFixed(1).padStart(5) +
              '   killed fighting ' + (fightDead / N).toFixed(1).padStart(5));
  console.log('  ' + W[notch].padEnd(7) + '  fights ' + (fights / N).toFixed(1).padStart(5) +
              '   saw others ' + (seen / N).toFixed(1).padStart(5) +
              '   sites ' + (sites / N).toFixed(1).padStart(4) +
              '   dead ' + (dead / N).toFixed(1).padStart(5));
}
const a = rows[0], z = rows[rows.length - 1];
console.log('\n  Avoid \u2192 All In: fights ' + a.fights.toFixed(1) + ' \u2192 ' + z.fights.toFixed(1) +
            ', sightings ' + a.seen.toFixed(1) + ' \u2192 ' + z.seen.toFixed(1) +
            ', dead ' + a.dead.toFixed(1) + ' \u2192 ' + z.dead.toFixed(1));
