/* §JOINING RETIRED — WHAT THE TABLE STILL DOES. This audit held twelve rulings (T1–T10), and every one of
   them was about joining: which banner a beaten OA approaches, whom a principal courts, asks answered, and
   the pricing of a join (spite, goodwill, appetite, deal records, stance at the table). With joining
   retired they tested nothing that runs — "every ruling holds" had been reporting on a dead system. The
   old file is kept in the history. What the table does now: truces, and ransom. So it checks those, over
   whole contests, and that no join is ever struck.
   `node sim/audit_table.cjs [contests]` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const N = +(process.argv[2] || 3);
let pacts = 0, broken = 0, ransoms = 0, joins = 0, other = 0;
for (let s = 1; s <= N; s++) {
  const rng = P.mulberry32(P.seedFrom('tbl' + s));
  const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const r = DIV.runDivide(d.rng, d.opts);
  for (const x of (r.deals || [])) {
    if (x.kind === 'pact') pacts++; else if (x.kind === 'ransom') ransoms++;
    else if (x.joiner || x.kind === 'flat' || x.kind === 'share') joins++; else other++;
  }
  joins += r.joins || 0;
  broken += (r.audit && r.audit.pactsBroken) || r.pactsBroken || 0;
}
let bad = 0;
const ok = (name, cond, detail) => { console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + name + '   ' + detail); if (!cond) bad++; };
console.log('\nTHE TABLE \u00b7 ' + N + ' contests\n');
ok('truces are made', pacts > 0, pacts + ' struck');
/* §TRUCE a truce is never broken (ruled): breaking an Aleas-mandated truce is a squad annihilated */
ok('no truce is ever broken', broken === 0, broken + ' broken of ' + pacts);
ok('prisoners are bought back', ransoms > 0, ransoms + ' ransoms');
ok('no join is ever struck (joining is retired)', joins === 0, joins + ' joins');
console.log(bad ? '\n  ' + bad + ' ruling(s) broken' : '\n  every ruling holds');
process.exit(bad ? 1 : 0);
