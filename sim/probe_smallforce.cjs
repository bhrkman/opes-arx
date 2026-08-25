/* probe_smallforce.cjs — does a two-squad drop get PLANNED FOR, or merely tolerated?
 *
 * `[OPEN-S1]` records that the coordination planner assumes three squads and asks that a
 * 16-body two-squad force "must not silently behave like a broken three-squad one" before S3's
 * small-force build is measured. Reading the planner is not an answer — `coordination()`
 * averages over whatever squads exist and looks headcount-agnostic, and this project has been
 * wrong four times this step about code that looked fine.
 *
 * So: run the same fleet twice, once with every corp fielding 24 and once with a single corp
 * cut to 16, and compare what that corp DOES rather than what it scores. A small force should
 * be outnumbered — that is the trade — but it should still flank, still claim, still coordinate
 * at the same rate PER SQUAD. If its per-squad behaviour collapses rather than merely scaling
 * down, the planner is broken for two squads and S3 cannot be measured honestly.
 *
 *   node probe_smallforce.cjs [seasons]
 */
const path = require('path'), fs = require('fs');
const D = __dirname;
const find = n => {
  for (const c of [path.join(D, n), path.join(D, '..', 'data', n)]) if (fs.existsSync(c)) return c;
  throw new Error('cannot find ' + n);
};
const P = require(find('prng.js'));
const SEASON = require(find('season.js'));
const DIV = require(find('divide.js'));
const oa = JSON.parse(fs.readFileSync(find('oa_profiles.json'), 'utf8')).oa_profiles;

const N = parseInt(process.argv[2] || '8', 10);
const SUBJECT = 'alliance_house';       /* a mid-table corp: not the richest, not the poorest */
const wantAll = n => { const m = {}; for (const p of oa) m[p.id] = n; return m; };

function run(want) {
  const opts = want ? { want: { [SUBJECT]: want } } : {};
  const r = SEASON.runCareer(P.mulberry32(P.seedFrom('S1-check')), oa, N, opts);
  const acc = { dropped: 0, dead: 0, seasons: 0, placement: 0, kit: 0 };
  for (const s of r.seasons) {
    const c = s.corps[SUBJECT];
    if (!c) continue;
    acc.seasons++;
    acc.dropped += c.dropped; acc.dead += c.dead;
    acc.kit += c.kitValue / Math.max(1, c.dropped);
  }
  return acc;
}

/* The per-squad behaviour question, asked of the day loop directly.
 *
 * FIRST ATTEMPT WAS WRONG AND IS WORTH RECORDING. It re-ran a Divide against the corps a
 * one-season career left behind — which are bodies that had ALREADY fought, so a third of them
 * were dead and the rest hurt. It produced 11 engagements where a real Divide produces ~68, and
 * flanking never fired in either arm, which looked like a finding about small forces and was a
 * finding about running a battle with corpses. Suspect the instrument before the game.
 *
 * So: generate one fresh 24-body force per corp, and run the SAME bodies on the SAME planet
 * twice — all 24, then the first 16. Only the count differs. */
const ROSTER = require(find('roster.js'));

function divideBehaviour(dropSize, runs) {
  const totals = { squads: 0, flanked: 0, multiSide: 0, claims: 0, engagements: 0,
                   reforms: 0, strikes: 0, pincers: 0, dead: 0, dropped: 0 };
  for (let i = 0; i < runs; i++) {
    const persist = {};
    for (const p of oa) {
      const squads = ROSTER.generateDropForce(P.mulberry32(P.seedFrom('force' + i + p.id)),
                                              { corpId: p.id });
      const bodies = [].concat.apply([], squads.map(s => s.bodies));
      const drop = dropSize ? bodies.slice(0, dropSize) : bodies;
      persist[p.id] = { drop: drop };
      totals.dropped += drop.length;
    }
    const st = DIV.runDivide(P.mulberry32(P.seedFrom('sfrun' + i)), {
      oaProfiles: oa, corpCount: oa.length, raceById: ROSTER.raceById, corps: persist
    });
    const a = st.audit || {};
    totals.flanked += a.flanked || 0;
    totals.multiSide += a.multiSide || 0;
    totals.strikes += a.strikes || 0;
    totals.pincers += a.pincers || 0;
    totals.claims += st.claims || 0;
    totals.engagements += st.engagements || 0;
    totals.reforms += a.reforms || 0;
    totals.dead += st.dead || 0;
    for (const c of (st._corps || [])) totals.squads += (c.squads || []).length;
  }
  return totals;
}

console.log('\n[OPEN-S1] — is a two-squad force planned for, or merely tolerated?');
console.log('='.repeat(74));

const full = run(null), small = run(16);
const f = (x, d) => Number(x).toFixed(d == null ? 2 : d);
console.log('\n' + SUBJECT + ' over ' + N + ' seasons, forced to field 16 vs left alone:');
console.log('  bodies dropped a season   ' + f(full.dropped / full.seasons) +
            '  ->  ' + f(small.dropped / small.seasons));
console.log('  permanent losses a season ' + f(full.dead / full.seasons) +
            '  ->  ' + f(small.dead / small.seasons));
console.log('  loss rate per body sent   ' + f(full.dead / full.dropped) +
            '  ->  ' + f(small.dead / small.dropped));
console.log('  kit per body fielded      ' + f(full.kit / full.seasons, 0) +
            '  ->  ' + f(small.kit / small.seasons, 0));

const RUNS = 6;
const a = divideBehaviour(null, RUNS), b = divideBehaviour(16, RUNS);
console.log('\nWhole-fleet day loop, every corp at 24 vs every corp at 16:');
const per = (t, k) => t.squads ? t[k] / t.squads : 0;
console.log('  squads on the planet      ' + a.squads + '  ->  ' + b.squads);
console.log('  flanks PER SQUAD          ' + f(per(a, 'flanked'), 3) + '  ->  ' + f(per(b, 'flanked'), 3));
console.log('  multi-side PER SQUAD      ' + f(per(a, 'multiSide'), 3) + '  ->  ' + f(per(b, 'multiSide'), 3));
console.log('  claims PER SQUAD          ' + f(per(a, 'claims'), 3) + '  ->  ' + f(per(b, 'claims'), 3));
console.log('  engagements PER SQUAD     ' + f(per(a, 'engagements'), 3) + '  ->  ' + f(per(b, 'engagements'), 3));
console.log('  reforms PER SQUAD         ' + f(per(a, 'reforms'), 3) + '  ->  ' + f(per(b, 'reforms'), 3));
console.log('  strikes PER SQUAD         ' + f(per(a, 'strikes'), 3) + '  ->  ' + f(per(b, 'strikes'), 3));
console.log('  pincers PER SQUAD         ' + f(per(a, 'pincers'), 3) + '  ->  ' + f(per(b, 'pincers'), 3));
console.log('  loss rate per body sent   ' + f(a.dead / a.dropped, 3) + '  ->  ' + f(b.dead / b.dropped, 3));
console.log('\n' + '='.repeat(74));
console.log('A small force SHOULD do less in total — that is the trade. Per squad it should');
console.log('behave the same. A collapse in the per-squad columns means the planner is broken');
console.log('for two squads and S3 cannot be measured until it is fixed.');
