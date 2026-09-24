/* §ONE AIM STAGE 2 — DOES FIELDCRAFT CHANGE A FIGHT? Two sides identical in every way but one: side A's
   fieldcraft is HIGH, side B's LOW. Fieldcraft is the seeing stat — sight on the grid runs from 7 tiles
   (fieldcraft 40) to 15 (fieldcraft 150). Before Stage 2 the grid read a copy divided by ten, so every
   fighter saw 7 tiles and this probe should show no edge at all; after, the better eyes should see first.
   `node harness/probe_fieldcraft.cjs [fights] [high] [low]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), C = require(D + 'combat.js'), T = require(D + 'tactical.js'),
      R = require(D + 'roster.js'), I = require(D + 'items.js'), M = require(D + 'map.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 60), HI = +(process.argv[3] || 150), LO = +(process.argv[4] || 50);
function run(fcA, fcB) {
  let downA = 0, downB = 0, hitsA = 0, shotsA = 0, turns = 0, winsA = 0;
  for (let i = 0; i < N; i++) {
    const rng = P.mulberry32(P.seedFrom('fc' + i));
    const mk = (prof, fc) => {
      const b = R.generateSquad(rng, 5, { corpId: prof.id }).bodies;
      b.forEach(f => { f.stats.fieldcraft = fc;
        I.equip(f, { primary: 'itm_surplus_rifle', armor: 'itm_flak_vest', sidearm: null, mods: [], consumables: [] }); });
      return { corpId: prof.id, policy: 'standard', hasMedkit: false, fidelity: 0.7,
               units: b.map(f => C.makeCombatant(f, { traitIndex: R.traitById, day: 5 })) };
    };
    const A = mk(oa[0], fcA), B = mk(oa[1], fcB);
    const pl = M.generatePlanet(P.mulberry32(i), { season: 1 });
    const r = T.resolve(P.mulberry32(i + 3), [A, B], { planet: pl, day: 5, x: pl.cx, y: pl.cy, fog: true });
    const aIds = new Set(A.units.map(u => u.id));
    (r.log || []).forEach(e => { if (aIds.has(e.by)) { if (e.type === 'hit') { hitsA++; shotsA++; } else if (e.type === 'miss') shotsA++; } });
    const a = A.units.filter(u => u.state !== 'ok' && u.state !== 'light').length;
    const b = B.units.filter(u => u.state !== 'ok' && u.state !== 'light').length;
    downA += a; downB += b; if (b > a) winsA++; turns += (r.telemetry && r.telemetry.turn) || 0;
  }
  return { downA, downB, winsA, hit: hitsA / Math.max(1, shotsA), turns: turns / N };
}
const even = run(100, 100), edge = run(HI, LO);
const line = (lbl, r) => '  ' + lbl.padEnd(34) + 'A put down ' + String(r.downB).padStart(4) + ' · A lost ' + String(r.downA).padStart(4) +
  ' · A came out ahead ' + String(r.winsA).padStart(3) + ' of ' + N + ' · A hit ' + (r.hit * 100).toFixed(1) + '% · ' + r.turns.toFixed(1) + ' turns';
console.log('\nDOES FIELDCRAFT CHANGE A FIGHT? \u00b7 ' + N + ' fights, identical sides but for fieldcraft\n');
console.log(line('both sides fieldcraft 100', even));
console.log(line('A fieldcraft ' + HI + ', B fieldcraft ' + LO, edge));
const lead = edge.winsA - even.winsA;
console.log('\n  the better eyes came out ahead ' + (lead >= 0 ? '+' : '') + lead + ' more times than an even match');
if (process.env.GATE) { const ok = lead >= Math.round(N * 0.08); console.log(ok ? '  ok    fieldcraft decides who sees first' : '  FAIL  fieldcraft makes no difference'); process.exit(ok ? 0 : 1); }
