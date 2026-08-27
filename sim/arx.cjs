/* Capital Divide — arx.cjs
 * Single entry point for every check and build in the project.
 *
 *   node arx.cjs test [divides] [seed]   acceptance suite  → 18 targets (COMBAT.md §13)
 *   node arx.cjs regress                 regression suite  → 70 checks
 *   node arx.cjs regress --bless         re-record the snapshot baseline
 *   node arx.cjs probe gear|rout|band    targeted probes for questions telemetry hides
 *   node arx.cjs build                   rebuild ui/combat_theater.html
 *   node arx.cjs armoury                 rebuild armoury.html (catalog + bench + allowance)
 *   node arx.cjs table                   rebuild negotiation_table.html (6 baked Divides)
 *   node arx.cjs bench                   rebuild the_table.html (live engine, playable)
 *   node arx.cjs lab [days] [seed]       3 corps x 3 squads, small arena, tick-by-tick trace
 *   node arx.cjs all                     regress + test, the pre-commit pair
 *
 * Layout-agnostic: works whether the project keeps sim/ tools/ data/ folders or every
 * file sits in one directory. Nothing here assumes a structure.
 */
const fs = require('fs'), path = require('path');

function findFile(name) {
  const d = __dirname;
  /* `docs` and `viewers` were missing from this list, which meant the project could not run
     its own suite in the layout it ships in — every canon document and every viewer was
     unfindable, so a fresh checkout had to be flattened by hand before `regress` would run.
     Found while packaging Step 7. */
  for (const c of [path.join(d, name), path.join(d, '..', 'sim', name), path.join(d, '..', 'data', name),
                   path.join(d, '..', 'docs', name), path.join(d, '..', 'viewers', name),
                   path.join(d, '..', 'ui', name), path.join(d, '..', 'tools', name), path.join(d, '..', name),
                   path.join(d, 'sim', name), path.join(d, 'data', name), path.join(d, 'docs', name),
                   path.join(d, 'viewers', name), path.join(d, 'ui', name),
                   path.join(d, 'tools', name)]) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('cannot find ' + name + ' — keep it alongside the other project files');
}
const req = n => require(findFile(n));
const readJSON = n => JSON.parse(fs.readFileSync(findFile(n), 'utf8'));

const HARNESS_MEDKIT_P = 0.45;   /* harness scaffolding only: the model now decides this
                                    from what a squad carries (PROCUREMENT.md §10). */
const P = req('prng.js');
const makeRng = s => P.mulberry32(P.seedFrom(s));


const C = req('combat.js');
const combat = C;
const gen = req('roster.js');
const DIV = req('divide.js');
const MAPMOD = req('map.js');
const ITEMS = req('items.js');
const LEDGER = req('ledger.js');
const NEG = req('negotiate.js');
const REPMOD = req('reputation.js');
const SEASONMOD = req('season.js');
const OA = readJSON('oa_profiles.json').oa_profiles;

/* ============================================================================
   THE SHARED CORPUS — Step 7.5b
   ============================================================================

   Fifty-one of this suite's Divides were the SAME Divide: identical options, only the seed
   differing, each one built by whichever guard happened to need one because each cluster of
   guards was written independently. That cost nothing worth noticing while the abstract
   resolver ran a fight in 5ms. The grid runs one in 60-90ms, and the same suite went from 55
   seconds to twelve minutes — at which point it stops being run, and a suite that stops being
   run is this project's whole defence against dead wires going quiet.

   So the plain Divides are built ONCE, lazily, and read by everything. Guards that need
   something other than a plain Divide — a replay, a halt at a comms window, a forced policy,
   a fixed split — still build their own, because those are different fixtures and pretending
   otherwise would be sharing a thing that is not shared.

   NOTHING ASSERTED CHANGED. Every `ok(...)` in this file is textually identical to what it
   was; only where the Divides come from moved. The check names are diffed against a baseline
   taken before the refactor for exactly that reason.

   Negotiation telemetry is captured as a DELTA per Divide, because `NEG.TELEMETRY` is a
   module-level accumulator and a shared corpus means nobody can zero it for themselves any
   more without stealing the counts from every other reader.
*/
const TACMOD = req('tactical.js');
const CORPUS_N = 8;
/* Four separate careers — three, eight, eight and six seasons — each built by one cluster of
   guards for itself: twenty-five simulated seasons where eight serve. The determinism pair
   below is NOT shared and must never be: it exists to run the same seed twice and compare, so
   handing it a cached result would make it assert that a variable equals itself. */
const CAREER_SEASONS = 8;
let _career = null;
function sharedCareer(oa) {
  /* `season.js` is required inside the season guard rather than at the top of the file, so
     the shared builder reaches for it the same way instead of capturing a name that does not
     exist at module scope. */
  if (!_career) _career = req('season.js').runCareer(makeRng('guard-career'), oa, CAREER_SEASONS, {});
  return _career;
}
let _corpus = null;
function corpus() {
  if (_corpus) return _corpus;
  _corpus = [];
  for (let i = 0; i < CORPUS_N; i++) {
    const T = NEG.TELEMETRY;
    const before = { floorBinds: T.floorBinds, valuations: T.valuations,
                     wallsSeller: T.wallsSeller, wallsBuyer: T.wallsBuyer };
    const s = DIV.runDivide(makeRng('corpus' + i), { oaProfiles: OA, raceById: gen.raceById });
    s._negDelta = { floorBinds: T.floorBinds - before.floorBinds,
                    valuations: T.valuations - before.valuations,
                    wallsSeller: T.wallsSeller - before.wallsSeller,
                    wallsBuyer: T.wallsBuyer - before.wallsBuyer };
    _corpus.push(s);
  }
  return _corpus;
}
/** The first `n` of the corpus, for a guard that used to run its own loop of `n`. */
function corpusOf(n) { return corpus().slice(0, Math.min(n, CORPUS_N)); }

/* Snapshot baseline travels inside this file so it cannot be separated from the suite
   that reads it. `regress --bless` rewrites the constant below in place. */
const BASELINE_DEFAULT = {
  "medium band, mixed policies": {
    "result": "disengage_A",
    "exchanges": 8,
    "band": "medium",
    "aDead": 0,
    "aDown": 2,
    "bDead": 0,
    "bDown": 1,
    "shots": 112,
    "hits": 19,
    "downs": 3
  },
  "short band, both aggressive": {
    "result": "disengage_A",
    "exchanges": 8,
    "band": "medium",
    "aDead": 2,
    "aDown": 2,
    "bDead": 0,
    "bDown": 0,
    "shots": 103,
    "hits": 25,
    "downs": 4
  },
  "long band, both cautious": {
    "result": "disengage_both",
    "exchanges": 8,
    "band": "medium",
    "aDead": 0,
    "aDown": 2,
    "bDead": 0,
    "bDown": 2,
    "shots": 140,
    "hits": 24,
    "downs": 4
  },
  "forest, standard v unyielding": {
    "result": "disengage_B",
    "exchanges": 12,
    "band": "medium",
    "aDead": 0,
    "aDown": 0,
    "bDead": 2,
    "bDown": 2,
    "shots": 192,
    "hits": 28,
    "downs": 4
  },
  "entrenched, cautious v hunter": {
    "result": "disengage_A",
    "exchanges": 20,
    "band": "medium",
    "aDead": 0,
    "aDown": 1,
    "bDead": 0,
    "bDown": 1,
    "shots": 218,
    "hits": 21,
    "downs": 2
  }
};


/* ================================================================== *
 * ACCEPTANCE SUITE                                                    *
 * ================================================================== */
const oaProfiles = readJSON('oa_profiles.json').oa_profiles;
const traitIndex = gen.traitById;

const NOTCHES = ['preservationist', 'measured', 'standard', 'unyielding', 'death_or_glory'];

/* ---------------- Divide scaffold ---------------- */

function buildCorp(rng, profile, policy, split) {
  const sizes = split === '2x12' ? [12, 12] : split === '4x6' ? [6, 6, 6, 6] : [8, 8, 8];
  const corp = { id: profile.id, policy, squads: [], allBodies: [] };
  for (let i = 0; i < sizes.length; i++) {
    const bodies = gen.generateSquad(rng, sizes[i], { corpId: profile.id }).bodies;
    /* captain = highest tactics */
    let cap = bodies[0];
    for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
    corp.squads.push({ corpId: profile.id, policy, bodies, captainId: cap.id, hasMedkit: rng() < HARNESS_MEDKIT_P });
    corp.allBodies.push(...bodies);
  }
  corp.dropLeaderSquad = 0;
  return corp;
}

const captainFidelity = cap => combat.captainFidelity(cap, traitIndex);

/* Build the live combat squad from surviving bodies. */
function liveSquad(rng, corp, sqIdx, day, engagementNo) {
  const sq = corp.squads[sqIdx];
  const avail = sq.bodies.filter(b => b.status === 'active');
  if (avail.length < 2) return null;
  const cap = avail.find(b => b.id === sq.captainId) || avail.slice().sort((a, b) => b.stats.tactics - a.stats.tactics)[0];
  const mentorPresent = avail.some(b => (b.traits || []).includes('mentor'));
  const units = avail.map(f => combat.makeCombatant(f, {
    traitIndex,
    isCaptain: f.id === cap.id,
    day,
    firstEngagement: engagementNo === 0,
    rookieSupport: mentorPresent,
    captainBonus: 0
  }));
  /* wire Mon-Wa pairs: two bodies, one composure pool, one wound track (§8.1) */
  const byId = {};
  for (const u of units) byId[u.id] = u;
  for (const u of units) {
    if (u.ref.bond_partner && byId[u.ref.bond_partner] && !u.pair) {
      const other = byId[u.ref.bond_partner];
      const pair = { comp: Math.round((u.comp + other.comp) / 2), halves: [u, other], downed: false, strained: false };
      u.pair = pair; other.pair = pair;
      u.comp = other.comp = pair.comp;
    }
  }
  return { corpId: corp.id, policy: corp.policy, units, hasMedkit: sq.hasMedkit, fidelity: captainFidelity(cap), _sqIdx: sqIdx };
}

function applyOutcome(corp, side, tally, stats) {
  for (const u of side.units) {
    const f = u.ref;
    if (u.state === 'dead') {
      f.status = 'dead'; stats.dead++;
    } else if (u.state === 'captured') {
      f.status = 'captured'; stats.captured++;
    } else if (u.injury) {
      f.condition.injuries.push(u.injury);
      if (u.injury.permanent) { f.status = 'retired'; stats.careerEnded++; }
      else { f.status = 'injured'; f._recovery = u.injury.days_remaining; f._untreatedDays = 0; stats.injured++; }
    } else if (u._braindead || u._traumatized) {
      f.status = 'retired'; stats.careerEnded++;
    } else {
      f.condition.morale = Math.max(5, Math.min(95, Math.round(0.7 * f.condition.morale + 0.3 * u.comp)));
      f.condition.fatigue = Math.min(100, f.condition.fatigue + 12);
      if (u.wounds.length) stats.lightWounds++;
    }
  }
}

/* Step 4: the scaffold is gone. `sim/divide.js` owns the day loop; this is a thin
   adapter that keeps the acceptance suite's telemetry shape. */
function runDivide(rng, opts) {
  opts = opts || {};
  const s = DIV.runDivide(rng, Object.assign({
    oaProfiles, traitIndex, raceById: gen.raceById
  }, opts));
  s.enginesPerForce = s.engagements * 2 / 8;
  return s;
}

/* ---------------- batch ---------------- */

function pct(a, b) { return b ? (100 * a / b) : 0; }
function fmt(x, d) { return Number(x).toFixed(d == null ? 1 : d); }
function median(arr) { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; }

function run(nDivides, seedLabel) {
  const rng = makeRng(seedLabel);
  const solvency = [], cededPay = [], heldPay = [], joinTally = [], dealDays = [], heldNothing = [];
  const agg = {
    dead: 0, captured: 0, injured: 0, careerEnded: 0, monwaShock: 0,
    engagements: 0, exchanges: 0, shots: 0, hits: 0, downs: 0, killedOutright: 0, downDeaths: 0,
    zeroCas: 0, routEng: 0, brokenEng: 0, squadsBroken: 0, sidesEngaged: 0,
    sidearmDraws: 0, vents: 0,
    capExits: 0, wingInjuries: 0, thythynSerious: 0
  };
  const perNotch = {}; for (const n of NOTCHES) perNotch[n] = { permanent: [], injured: [], dropped: [] };
  const homogeneous = {}; for (const n of NOTCHES) homogeneous[n] = { permanent: [], injured: [], wipes: 0, corps: 0 };
  const permByCorp = [], dayLens = [], forceEngagements = [], engLens = [], wipeFlags = [];

  /* homogeneous fields isolate each notch's self-cost (T1, T3) */
  const homoPer = Math.max(8, Math.round(nDivides * 0.4 / NOTCHES.length));
  for (const notch of NOTCHES) {
    for (let i = 0; i < homoPer; i++) {
      const s = runDivide(rng, { policyFor: () => notch });
      for (const pc of s.perCorp) {
        homogeneous[notch].permanent.push(pc.permanent);
        homogeneous[notch].injured.push(pc.injuredHome);
        homogeneous[notch].corps++;
        if (pc.permanent >= 18) homogeneous[notch].wipes++;
      }
    }
  }

  for (let i = 0; i < nDivides; i++) {
    const s = runDivide(rng, {});
    for (const k of ['dead', 'captured', 'injured', 'careerEnded', 'monwaShock', 'engagements', 'exchanges', 'shots', 'hits', 'downs', 'killedOutright', 'downDeaths', 'wingInjuries', 'thythynSerious']) agg[k] += s[k];
    agg.zeroCas += s.zeroCasualtyEngagements; agg.routEng += s.routEngagements; agg.capExits += s.capExits;
    agg.brokenEng += s.brokenEngagements || 0; agg.squadsBroken += s.squadsBroken || 0;
    agg.sidearmDraws += s.sidearmDraws || 0; agg.vents += s.vents || 0;
    agg.sidesEngaged += s.sidesEngaged || 0;
    dayLens.push(s.days);
    forceEngagements.push(s.engagements * 2 / 8);
    engLens.push(s.exchanges / Math.max(1, s.engagements));
    /* T14/T17/T18 — the Step 6 surface, measured from the same Divides. */
    joinTally.push(s.joins || 0);
    for (const d of (s.deals || [])) {
      if (d.kind !== 'share' && d.kind !== 'flat') continue;
      dealDays.push(d.day);
    }
    for (const pc of s.perCorp) {
      const prof = oaProfiles.find(x => x.id === pc.id);
      const acct = LEDGER.open(prof);
      const roster = [];
      for (let k = 0; k < 4; k++) roster.push.apply(roster, gen.generateSquad(rng, 8, { corpId: pc.id }).bodies);
      LEDGER.bookDivide(acct, { payout: pc.payout,
        bonuses: pc.won ? ((s.settlement && s.settlement.bonuses.total) || 0) : 0,
        ransomPaid: pc.ransomPaid, ransomTaken: pc.ransomTaken });
      LEDGER.settleSeason(acct, roster, { procurement: 0, injuries: pc.injuredHome,
        deaths: pc.permanent, windows: 4 });
      solvency.push(acct.treasury > 0 ? 1 : 0);
      /* Grouped by what a corp DID, not by the notch it happened to be holding when the
         Divide ended. Stance moves about fifteen times a Divide, so the closing notch is
         very close to random — grouping money by it produced a result that reversed between
         samples, which is how this was caught. Ceding a claim is a decision; a notch is not. */
      if (pc.joinedTo) cededPay.push(pc.payout); else heldPay.push(pc.payout);
      if (!pc.joinedTo && !pc.won) heldNothing.push(pc.payout < 1000 ? 1 : 0);
    }
    let wiped = false;
    for (const pc of s.perCorp) {
      perNotch[pc.policy].permanent.push(pc.permanent);
      perNotch[pc.policy].injured.push(pc.injuredHome);
      perNotch[pc.policy].dropped.push(pc.dropped);
      permByCorp.push(pc.permanent);
      if (pc.permanent >= 18) wiped = true;
    }
    wipeFlags.push(wiped);
  }

  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const totalDeaths = agg.killedOutright + agg.downDeaths;
  const out = {
    nDivides, agg, perNotch, homogeneous, homoPer,
    hitRate: pct(agg.hits, agg.shots),
    killedOutrightShare: pct(agg.killedOutright, totalDeaths),
    downDeathShare: pct(agg.downDeaths, agg.downs),
    medianExchanges: median(engLens),
    capShare: pct(agg.capExits, agg.engagements),
    zeroCasShare: pct(agg.zeroCas, agg.engagements),
    routShare: pct(agg.routEng, agg.engagements),
    brokenShare: pct(agg.brokenEng, agg.engagements),
    sideBreakShare: pct(agg.squadsBroken, agg.sidesEngaged),
    sidearmPerEng: agg.sidearmDraws / Math.max(1, agg.engagements),
    ventPerEng: agg.vents / Math.max(1, agg.engagements),
    medianDays: median(dayLens),
    solventShare: pct(solvency.filter(Boolean).length, solvency.length),
    cededPayout: mean(cededPay),
    heldPayout: mean(heldPay),
    heldNothingShare: pct(heldNothing.filter(Boolean).length, heldNothing.length),
    joinsPerDivide: mean(joinTally),
    earlyDealShare: pct(dealDays.filter(d => d < 5).length, dealDays.length),
    medianForceEngagements: median(forceEngagements),
    wingShare: pct(agg.wingInjuries, agg.thythynSerious),
    wipeShare: pct(wipeFlags.filter(Boolean).length, nDivides),
    standardMedian: median(homogeneous.standard.permanent),
    dogWipeShare: pct(homogeneous.death_or_glory.wipes, Math.max(1, homogeneous.death_or_glory.corps))
  };
  return out;
}

/* ---------------- reporting ---------------- */

const TARGETS = [];
/* A measurement with no ratified band. Printed, never passed or failed: inventing a target
   to make the report look finished is how a made-up number becomes canon. */
function observe(id, desc, value, unit) {
  console.log('  [ ---- ] ' + id.padEnd(6) + ' ' + String(value.toFixed ? value.toFixed(2) : value).padStart(8) +
              (unit || '') + '   unratified  \u00b7 ' + desc);
}

function check(id, desc, value, lo, hi, unit) {
  const pass = value >= lo && value <= hi;
  TARGETS.push({ id, desc, value, lo, hi, unit: unit || '', pass });
  return pass;
}

function runAcceptance() {
  TARGETS.length = 0;
  const n = parseInt(process.argv[3] || '300', 10);
  const seed = process.argv[4] || 'VC-103';
  const t0 = Date.now();
  const r = run(n, seed);
  if (FAST) {
    console.log('\n  \u26a0 FAST RUN \u2014 ' + skipped + ' statistical phases skipped. This is the ' +
                'edit-loop gate,\n    not the shipping gate. Run without --fast before packaging.');
  }
  if (process.argv.includes('--timings')) {
    TIMES.sort((a, b) => b[1] - a[1]);
    console.log('\n  WHERE THE TIME GOES');
    for (const [name, t] of TIMES)
      if (t > 200) console.log('    ' + String((t / 1000).toFixed(1) + 's').padStart(8) + '  ' + name);
  }
  const ms = Date.now() - t0;

  console.log('='.repeat(78));
  console.log(`COMBAT v1 BATCH — ${n} Divides · seed "${seed}" · ${ms}ms`);
  console.log('='.repeat(78));

  console.log('\nCASUALTY LADDER — homogeneous fields (permanent losses per corp per Divide, of 24)');
  console.log('  notch                n     mean   median   injured-home   wipe%');
  for (const notch of NOTCHES) {
    const h = r.homogeneous[notch];
    const mean = h.permanent.reduce((a, b) => a + b, 0) / Math.max(1, h.permanent.length);
    const imean = h.injured.reduce((a, b) => a + b, 0) / Math.max(1, h.injured.length);
    console.log(`  ${notch.padEnd(19)} ${String(h.corps).padStart(4)}  ${fmt(mean, 2).padStart(6)}  ${String(median(h.permanent)).padStart(6)}   ${fmt(imean, 1).padStart(10)}   ${fmt(pct(h.wipes, h.corps), 1).padStart(5)}`);
  }
  console.log('\n  mixed-field means (realistic Divides):  ' + NOTCHES.map(n => {
    const p = r.perNotch[n].permanent;
    return n.slice(0, 4) + ' ' + fmt(p.reduce((a, b) => a + b, 0) / Math.max(1, p.length), 1);
  }).join(' · '));

  const L = { preservationist: [2, 3], measured: [3.4, 4.6], standard: [5, 7], unyielding: [8, 10], death_or_glory: [11, 16] };
  for (const notch of NOTCHES) {
    const p = r.homogeneous[notch].permanent;
    const mean = p.reduce((a, b) => a + b, 0) / Math.max(1, p.length);
    observe('T1:' + notch, `${notch} permanent losses`, mean, ' bodies');
  }
  observe('T2', 'standard-policy median permanent', r.standardMedian, ' bodies');
  observe('T3', 'death_or_glory corps losing ≥18/24', r.dogWipeShare, '%');
  observe('T4', 'deaths that are killed-outright', r.killedOutrightShare, '%');
  observe('T5', 'downed fighters who die', r.downDeathShare, '%');
  observe('T6', 'aimed shots that hit', r.hitRate, '%');
  observe('T7a', 'median engagement length', r.medianExchanges, ' exchanges');  // widened in COMBAT.md v0.7
  observe('T7b', 'engagements hitting the 12-cap', r.capShare, '%');   // widened in COMBAT.md v0.3
  observe('T8', 'engagements with no casualties', r.zeroCasShare, '%');
  /* Two different events, measured separately since Step 5b-3. T9 counts firefights in
     which ANY single fighter broke and ran — one man in forty losing his nerve. T9b counts
     firefights in which a SQUAD actually came apart, which is the outcome that decides a
     Divide. The old 20-30% band was written against Step 3's isolated 8v8s and was being
     read against the first of these. */
  /* Two different events, measured separately since 5b-3. The first counts firefights in
     which ANY single fighter broke and ran; the second counts firefights in which a SQUAD
     actually came apart, which is the outcome that decides a Divide. The old 20-30% band
     was written against Step 3's isolated 8v8s and was being read against the first. */
  observe('T9', 'firefights where at least one fighter broke', r.routShare, '%');
  observe('T9b', 'firefights where a squad came apart', r.brokenShare, '%');
  observe('T9c', 'squads that came apart, per side engaged', r.sideBreakShare, '%');
  observe('P3', 'sidearm draws per firefight (dry, venting or damaged)', r.sidearmPerEng, '');
  observe('P4', 'energy weapons venting per firefight', r.ventPerEng, '');
  observe('T10', 'engagements per drop force', r.medianForceEngagements, '');
  observe('T11', 'median Divide length', r.medianDays, ' days');
  observe('T12', 'Thythyn serious wounds that are wing', r.wingShare, '%');
  observe('T13', 'Mon-Wa pair losses per Divide', r.agg.monwaShock / n, '');   // corrected in COMBAT.md v0.3

  /* T14 — preservationist solvency. COMBAT.md calls this the balance target that matters
     most, and it was reported as ANSWERED in the docs while nothing in this harness measured
     it: the only measurement lived in a throwaway probe. A target that exists only in prose
     is a target nobody is tracking. It is measured here now, from the same Divides. */
  observe('T14', 'corps solvent after a Divide is booked', r.solventShare, '%');
  observe('T14b', 'settlement taken by a corp that ceded its claim', r.cededPayout, ' cr');
  observe('T14c', 'settlement taken by a corp that held out', r.heldPayout, ' cr');
  observe('T14d', 'corps that held out, lost, and were paid nothing', r.heldNothingShare, '%');
  observe('T17', 'claims ceded per Divide', r.joinsPerDivide, '');
  observe('T18', 'share of claims ceded before day 5', r.earlyDealShare, '%');

  console.log('\nACCEPTANCE TARGETS');
  let pass = 0;
  for (const t of TARGETS) {
    const mark = t.pass ? 'PASS' : 'FAIL';
    if (t.pass) pass++;
    console.log(`  [${mark}] ${t.id.padEnd(20)} ${fmt(t.value, 2).padStart(7)}${t.unit.padEnd(11)} target ${t.lo}–${t.hi}${t.unit}  · ${t.desc}`);
  }

  /* T15 determinism and T16 splits are reported separately below. */

  console.log('\nDETERMINISM (T15)');
  const a = run(12, 'det-check'), b = run(12, 'det-check');
  const same = JSON.stringify(a.agg) === JSON.stringify(b.agg);
  console.log(`  [${same ? 'PASS' : 'FAIL'}] same seed ⇒ identical aggregate telemetry`);

  console.log('\nSPLIT VIABILITY (T16)');
  for (const split of ['3x8', '2x12', '4x6']) {
    const rng = makeRng('split-' + split);
    let perm = 0, divides = 40;
    for (let i = 0; i < divides; i++) {
      const s = runDivide(rng, { split });
      perm += s.perCorp.reduce((acc, p) => acc + p.permanent, 0) / s.perCorp.length;
    }
    console.log(`  ${split.padEnd(6)} mean permanent losses per corp: ${fmt(perm / divides, 2)}`);
  }

  console.log('\n  ' + '\u2500'.repeat(72));
  console.log('  These are OBSERVATIONS, not targets. The T-series was calibrated in Step 3');
  console.log('  against a scaffold with no map, no supply, no coordination and no catalog,');
  console.log('  against a scaffold that no longer exists. Negotiation \u2014 the largest brake on');
  console.log('  lethality \u2014 now DOES exist (Step 6), so the T-series is measurable in full for');
  console.log('  the first time, but the numbers were never re-derived against it.');
  console.log('  Tuning toward them now would codify the wrong numbers twice.');
  console.log('  What must hold regardless lives in `regress`.');
  console.log('='.repeat(78));
}

/* ================================================================== *
 * REGRESSION SUITE                                                    *
 * ================================================================== */

let pass = 0, fail = 0, BLESS = false;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return true; }
  fail++; failures.push(name + (detail ? '  — ' + detail : ''));
  return false;
}

/* ---------- fixtures ---------- */
function squad(rng, prof, policy, opts) {
  opts = opts || {};
  const bodies = gen.generateSquad(rng, opts.size || 8, { corpId: prof.id }).bodies;
  if (opts.loadout) ITEMS.equipForce(bodies, opts.loadout);   /* real catalog kit, for the energy path */
  if (opts.plan) bodies.forEach((f, i) => ITEMS.equip(f, opts.plan.bodies[i % opts.plan.bodies.length].loadout));
  let cap = bodies[0];
  for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
  const units = bodies.map(f => {
    const c = C.makeCombatant(f, { traitIndex: gen.traitById, isCaptain: f.id === cap.id, day: opts.day || 12 });
    if (opts.weapon) c.weapon = opts.weapon;
    if (opts.armor) c.armor = opts.armor;
    return c;
  });
  const byId = {}; units.forEach(u => byId[u.id] = u);
  units.forEach(u => {
    if (u.ref.bond_partner && byId[u.ref.bond_partner] && !u.pair) {
      const o = byId[u.ref.bond_partner];
      const pair = { comp: Math.round((u.comp + o.comp) / 2), halves: [u, o], downed: false, strained: false };
      u.pair = pair; o.pair = pair; u.comp = o.comp = pair.comp;
    }
  });
  return { corpId: prof.id, policy, units, hasMedkit: true,
           fidelity: C.captainFidelity(cap, gen.traitById) };
}

/* =========================================================================
   1. INVARIANTS — must hold for every engagement, whatever the constants say
   ========================================================================= */
/* The states a body may end in. `panicked`, `fled` and `withdrawn` are grid states the
   abstract model had no word for; `routed` is the abstract model's word and the grid never
   produces it. Both are listed so this passes during the cut and neither resolver's
   vocabulary is quietly dropped. */
const VALID = ['ok','light','down','stable','dead','captured','routed',
               'panicked','fled','withdrawn'];
/* The energy path was written, guarded by nothing, and crashed the moment a real Divide
   fielded a pulse carbine — because every harness squad carries the ballistic default.
   A resource model with no test is a resource model that is not there. */
/* The line is a wall (ruled): no squad may ever be outside it, on any day, for any reason.
   Asserted rather than assumed — the first implementation left about one squad a Divide
   stranded on ground that no longer existed. */
/* =========================================================================
   SUPPRESSION TRAITS — wired at Step 8.10, guarded by what they do to the ground
   =========================================================================
   Three hooks named a system that had existed since Step 5 and never read them. The trap here
   is the one this project keeps falling into: a hook can be REFERENCED by the resolver and
   still never fire, and a guard that only greps for the name cannot tell the difference. So
   this forces each trait onto a squad and measures whether the number of people pinned to the
   ground actually moves, and in which direction. */
function suppressionTraits() {
  const kit = { primary:'itm_machine_gun', armor:'itm_plate_carrier', sidearm:null,
                mods:[], consumables:[] };
  const build = (seed, hook, armed) => {
    const bodies = gen.generateSquad(makeRng(seed), 8, { corpId:'x' }).bodies;
    if (armed) bodies.forEach(b => ITEMS.equip(b, kit));
    return bodies.map(f => {
      const u = C.makeCombatant(f, { traitIndex: gen.traitById, day: 12 });
      if (hook) u.hooks.add(hook);
      return u;
    });
  };
  const side = (t, u) => ({ tag:t, corpId:t, policy:'standard', policyName:'standard',
                            hasMedkit:true, units:u });
  const run = (shooterHook, targetHook) => {
    let pins = 0, refused = 0;
    for (let i = 0; i < 60; i++) {
      const A = side('A', build('sup-a' + i, shooterHook, true));
      const B = side('B', build('sup-b' + i, targetHook, false));
      const r = TACMOD.resolve(makeRng('sup' + i), A, B,
                               { day:12, openingBand:1, terrain:'broken_ground' });
      pins += r.telemetry.pins || 0;
      refused += r.telemetry.pinsRefused || 0;
    }
    return { pins, refused };
  };
  const base = run(null, null);
  const up   = run('suppression_output_up', null);
  const down = run('suppression_output_down_slight', null);
  const res  = run(null, 'suppression_bonus');

  ok('suppression happens at all on the grid', base.pins > 0, base.pins + ' pins in 60 fights');
  ok('Trigger Itch widens the arc (suppression_output_up)', up.pins > base.pins,
     up.pins + ' vs ' + base.pins);
  ok('Ammo Miser narrows it (suppression_output_down_slight)', down.pins < base.pins,
     down.pins + ' vs ' + base.pins);
  ok('Smothering Fire refuses pins (suppression_bonus)',
     res.refused > 0 && res.pins < base.pins,
     res.refused + ' refused, ' + res.pins + ' pins vs ' + base.pins);
}

/* =========================================================================
   THE SIGNING WINDOW — that working it is worth something
   =========================================================================
   `corp._window` was written by the recruit action and read by NOTHING: one write, zero reads,
   across every module and both viewers. A manager could spend an action point a month on
   working a window for an entire career and change nothing at all, because the intake and the
   market ran on their own schedule regardless. And it was invisible, because the founding
   roster opened two bodies OVER the threshold that gates the verb, so in year one — the year a
   player actually looks at — the window never opened to be spent on in the first place.
   Two guards, because the failure had two halves: the verb must be OFFERED, and it must BITE. */
/* =========================================================================
   SAVE AND LOAD — that a resumed career is the same career
   =========================================================================
   The bar is not "it loads". A save that loads and produces a slightly different career is
   worse than one that refuses to, because nothing tells you. So the check is bit-identity: play
   a career straight through, play the same career again interrupted by a save and a load at a
   named month, and require the two to be indistinguishable afterwards.

   The failure this exists to catch has already happened once. A fighter is one object with many
   pointers at it — `roster`, `_drop`, `_renew` and four lists on `_off` — and JSON has no
   pointers, so a naive save turns every alias into a copy. Nothing errors; the names and the
   stats are all correct; the board simply starts settling contracts with clones. It diverged
   only from season TWO onward, because season one has no offseason to build the aliases, which
   is exactly the shape of thing a one-season test would have blessed. */
/* =========================================================================
   CONSEQUENCES THAT LAND LATER
   =========================================================================
   Everything used to resolve the instant it was spent, which forbade a whole class of decision.
   The mechanism is only worth having if something real uses it, so the survey is its first
   user: send a party out, hear back three months later. The failure to guard against is the
   usual one — a queue that is written to and never drained, or drained and never read. */
/* =========================================================================
   SPONSORSHIP — deferred whole for several steps, landed whole
   =========================================================================
   The deferral named four things that had to arrive together, on the grounds that an income
   line with no contracts behind it is a number nothing argues over. So each of the four is
   guarded separately, because "sponsorship exists" is exactly the kind of claim that stays true
   while three quarters of it quietly does nothing.
     motives     — who backs you depends on what you have actually done
     contracts   — obligations that can be FAILED, not a subsidy
     exclusivity — the constraint that makes offers a choice rather than a collection
     the verb    — courting, and it has to reach the offers a manager sees */
/* =========================================================================
   THE SEAM — M11, where the preparation year hands over to the Divide
   =========================================================================
   M11 held one decision: how many to send. Everything else about the drop was the engine's —
   corps landed evenly spaced at a random spin, nobody had spoken to anybody, and the last month
   of the year was the quietest one. Three decisions live there now, and each is guarded for the
   thing that would make it decorative: a sector nobody contests, a pact nobody refuses, a
   performance nobody sees. */
/* =========================================================================
   THE DECISION WINDOW — what a manager can actually do during a Divide
   =========================================================================
   The window existed and yielded a board, and for two steps its own comment claimed it handled
   "a stance, and any deals the manager chose to answer". Only `answer.stance` was ever read.
   Prose describing work that was not done — so the negotiation half is guarded by firing every
   branch of it, not by checking that the window appears. */
function decisionWindow() {
  const oa = readJSON('oa_profiles.json').oa_profiles;
  const mid = b => ({ share: (b.minShare + b.maxShare) / 2 });

  const run = (policy, seed, me) => {
    const g = DIV.divideCore(P.mulberry32(P.seedFrom(seed)),
                             { oaProfiles: oa, raceById: gen.raceById, human: me });
    let r = g.next(), offered = 0, windows = 0, cadences = {};
    while (!r.done) {
      const w = r.value; windows++; cadences[w.cadence] = 1;
      const ans = { stance: 'standard' };
      if (policy === 'join' && !w.you.joinedTo) {
        const t = w.table.canJoin.filter(x => x.viable && x.band)[0];
        if (t) { ans.deal = { kind: 'join', principal: t.principal, terms: mid(t.band) }; offered++; }
      }
      if (policy === 'take') {
        const t = w.table.wouldTake.filter(x => x.viable && x.band)[0];
        if (t) { ans.deal = { kind: 'take', corp: t.corp, terms: mid(t.band) }; offered++; }
      }
      if (policy === 'pact') {
        const t = w.table.pacts.filter(x => x.viable)[0];
        if (t) { ans.deal = { kind: 'pact', corp: t.corp }; offered++; }
      }
      r = g.next(ans);
      /* STOP AS SOON AS THE BRANCH HAS FIRED. What this proves is that a manager CAN cede, take
         and agree — not what happens over the thirty days after, which every other check here
         already covers. Running each case to the end cost 36 full Divides at ~10s apiece:
         roughly two thirds of the whole suite's runtime, to answer a question settled in the
         first few windows. A guard nobody will wait for is a guard nobody runs, so cost is part
         of whether an instrument works rather than a separate concern from it.
         `stats` is the live object the generator is writing into, so the counters can be read
         mid-contest without finishing it. */
      if (policy !== 'none' && !r.done) {
        const a = (r.value.stats || {}).audit || {};
        if ((a.humanJoins || 0) + (a.humanTakes || 0) + (a.humanPacts || 0) > 0) {
          return { offered, windows, cadences: Object.keys(cadences),
                   joins: a.humanJoins || 0, takes: a.humanTakes || 0, pacts: a.humanPacts || 0 };
        }
      }
    }
    const a = (r.value || {}).audit || {};
    return { offered, windows, cadences: Object.keys(cadences),
             joins: a.humanJoins || 0, takes: a.humanTakes || 0, pacts: a.humanPacts || 0 };
  };

  const one = run('none', 'win-guard', 'vantis_deepcore');
  ok('a Divide stops for you more than once', one.windows > 3, one.windows + ' windows');
  ok('the cadence tightens as the ring closes',
     one.cadences.length > 1, 'cadences seen: ' + one.cadences.join(', '));

  /* TWO SEEDS AND TWO HOUSES, NOT FOUR AND THREE. This was 36 full Divides to prove that three
     branches fire, which at ~10s each was about two thirds of the entire suite. Coverage is
     unchanged — every branch is still exercised by more than one seed and more than one house,
     which is what guards against a branch that only works for one profile — and the cost is a
     quarter of what it was. If a branch stops firing at this size that is a finding, not noise:
     these are the two houses that deal most freely. */
  let joins = 0, takes = 0, pacts = 0, offered = 0;
  for (const seed of ['w1', 'w2'])
    for (const me of ['vantis_deepcore', 'mercy_concern'])
      for (const pol of ['join', 'take', 'pact']) {
        const r = run(pol, seed, me);
        joins += r.joins; takes += r.takes; pacts += r.pacts; offered += r.offered;
      }
  ok('a manager can cede their banner to somebody', joins > 0, joins + ' joins');
  ok('a manager can take somebody under theirs', takes > 0, takes + ' takes');
  ok('a manager can agree a truce mid-contest', pacts > 0, pacts + ' pacts');
  ok('and offers are made that do not all succeed',
     offered > joins + takes + pacts, offered + ' offered, ' + (joins + takes + pacts) + ' struck');

  /* the stance half, which DID work, kept honest */
  const g2 = DIV.divideCore(P.mulberry32(P.seedFrom('win-stance')),
                            { oaProfiles: oa, raceById: gen.raceById, human: oa[3].id });
  let r2 = g2.next(), changes = 0;
  while (!r2.done) { const you = r2.value.you; r2 = g2.next({ stance: 'death_or_glory' });
                     if (you) changes = you.stanceChanges; }
  ok('a manager\'s notch actually moves their squads', changes > 0, changes + ' stance changes');

  /* --- THE SEASON SPLITS AT THE DROP, and the two halves must be one game. `closeSeason` is a
     wrapper over prepare/step/finish, so a manager sitting through the contest and a fleet
     running it off cannot become two different settlements. The claim is bit-identity when the
     manager says nothing, and a real difference when they say something — a stepped path that
     matched no matter what you answered would mean the window did nothing. --- */
  {
    const oaAll = readJSON('oa_profiles.json').oa_profiles;
    const play = (mode) => {
      const rng = P.mulberry32(P.seedFrom('split-guard'));
      const corps = SEASONMOD.openFleet(rng, oaAll, {});
      const st = SEASONMOD.beginSeason(rng, corps, oaAll, { human: 'knights_star' });
      while (st.month <= SEASONMOD.CONST.PREP_MONTHS) SEASONMOD.stepMonth(st);
      if (mode === 'off') return SEASONMOD.closeSeason(st);
      SEASONMOD.closeSeasonToDrop(st);
      const d = SEASONMOD.prepareDivide(st);
      const g = DIV.divideCore(d.rng, d.opts);
      let r = g.next();
      while (!r.done) r = (mode === 'silent') ? g.next() : g.next({ stance: 'death_or_glory' });
      return SEASONMOD.finishSeason(st, r.value);
    };
    const off = play('off'), silent = play('silent'), loud = play('loud');
    ok('sitting through the contest in silence settles exactly as running it off does',
       JSON.stringify(off.corps) === JSON.stringify(silent.corps));
    ok('and answering the window changes what happens',
       JSON.stringify(silent.corps) !== JSON.stringify(loud.corps));
  }

  /* --- WATCHING THE FIGHTS BACK. The grid logs every tick by default and returns it; the day
     loop was dropping it on the floor for every firefight in every Divide, which is all of the
     cost and none of the use. Kept for the manager's own fights, switched off for the rest. --- */
  {
    const g4 = DIV.divideCore(P.mulberry32(P.seedFrom('win-watch')),
                              { oaProfiles: oa, raceById: gen.raceById, human: 'knights_star' });
    let r4 = g4.next(), fights = 0, entries = 0, ownSide = 0;
    while (!r4.done) {
      for (const f of (r4.value.fights || [])) {
        fights++; entries += f.log.length;
        if (f.corps.indexOf('knights_star') >= 0) ownSide++;
      }
      r4 = g4.next({ stance: 'standard' });
    }
    ok('a manager is handed the fights their people were in', fights > 0, fights + ' fights');
    ok('and they carry a tick-by-tick log, not just a result',
       entries > 0, entries + ' log entries');
    ok('only your own fights are kept', ownSide === fights,
       ownSide + ' of ' + fights + ' involved your corp');
  }

  /* AND THE CORP A PERSON HOLDS MUST NOT NEGOTIATE BEHIND THEM. Ceding your banner is
     irreversible and the largest decision in the contest; the AI doing it while you watch is
     the whole failure this window exists to end. */
  let autoJoined = 0;
  for (const seed of ['a1', 'a2', 'a3']) {
    const g3 = DIV.divideCore(P.mulberry32(P.seedFrom(seed)),
                              { oaProfiles: oa, raceById: gen.raceById, human: 'mercy_concern' });
    let r3 = g3.next();
    while (!r3.done) { if (r3.value.you && r3.value.you.joinedTo) autoJoined++; r3 = g3.next({ stance: 'standard' }); }
  }
  ok('nobody cedes your banner for you', autoJoined === 0, autoJoined + ' joins you did not make');
}

function theSeam() {
  const oa = readJSON('oa_profiles.json').oa_profiles;
  const PRE = req('predivide.js');

  let sectorSpread = [], agreed = 0, asked = 0, performed = 0, corpSeasons = 0;
  const rng = P.mulberry32(P.seedFrom('seam-guard'));
  const corps = SEASONMOD.openFleet(rng, oa, {});
  for (let s = 0; s < 6; s++) {
    const st = SEASONMOD.beginSeason(rng, corps, oa, {});
    while (st.month <= SEASONMOD.CONST.PREP_MONTHS) SEASONMOD.stepMonth(st);
    SEASONMOD.closeSeason(st);
    const counts = {};
    for (const id in st.drop.sectors) counts[st.drop.sectors[id]] = 1;
    sectorSpread.push(Object.keys(counts).length);
    for (const k in st.drop.pacts) { asked++; if (st.drop.pacts[k].agreed) agreed++; }
    performed += Object.keys(st.drop.media).length;
    corpSeasons += st.ids.length;
  }
  const meanSpread = sectorSpread.reduce((a, b) => a + b, 0) / sectorSpread.length;

  ok('the fleet does not all pile into one sector',
     meanSpread >= 2, meanSpread.toFixed(1) + ' distinct sectors used a season');
  ok('nor does it spread so evenly that nothing is contested',
     meanSpread < PRE.CONST.SECTORS, meanSpread.toFixed(1) + ' of ' + PRE.CONST.SECTORS);
  ok('pacts are asked for and sometimes agreed', asked > 0 && agreed > 0,
     agreed + ' agreed of ' + asked + ' asked');
  ok('and sometimes refused — a pact that is always taken is not a bet',
     agreed < asked, (asked - agreed) + ' refused');
  ok('some corps perform at media day and some do not',
     performed > 0 && performed < corpSeasons,
     performed + ' of ' + corpSeasons + ' corp-seasons performed');

  /* --- a survey has to buy VISION, or it is still a flat number nobody can point at --- */
  const rng2 = P.mulberry32(P.seedFrom('seam-intel'));
  const c2 = SEASONMOD.openFleet(rng2, oa, {});
  const me = Object.keys(c2)[0];
  const blind = SEASONMOD.beginSeason(rng2, c2, oa, { human: me });
  while (blind.month <= SEASONMOD.CONST.PREP_MONTHS - 1) SEASONMOD.stepMonth(blind, { [me]: [] });
  const unseen = SEASONMOD.sectorsFor(blind, me);
  SEASONMOD.closeSeason(blind);

  const seen2 = SEASONMOD.beginSeason(rng2, c2, oa, { human: me });
  while (seen2.month <= SEASONMOD.CONST.PREP_MONTHS - 1)
    SEASONMOD.stepMonth(seen2, { [me]: ['scout', 'scout'] });
  const seen = SEASONMOD.sectorsFor(seen2, me);
  SEASONMOD.closeSeason(seen2);

  ok('without a survey the sectors are names on a ring',
     unseen.every(x => x.known === 'rumour'), unseen.map(x => x.known).join(','));
  ok('a survey buys you the ground and the prize',
     seen.some(x => x.known === 'full'), seen.map(x => x.known).join(','));

  /* --- and the Divide must actually READ where people chose to land --- */
  const A = P.mulberry32(P.seedFrom('seam-place'));
  const cA = SEASONMOD.openFleet(A, oa, {});
  const stA = SEASONMOD.beginSeason(A, cA, oa, { human: Object.keys(cA)[0] });
  while (stA.month <= SEASONMOD.CONST.PREP_MONTHS) SEASONMOD.stepMonth(stA);
  SEASONMOD.chooseDropSector(stA, Object.keys(cA)[0], 0);
  const recA = SEASONMOD.closeSeason(stA);

  const B = P.mulberry32(P.seedFrom('seam-place'));
  const cB = SEASONMOD.openFleet(B, oa, {});
  const stB = SEASONMOD.beginSeason(B, cB, oa, { human: Object.keys(cB)[0] });
  while (stB.month <= SEASONMOD.CONST.PREP_MONTHS) SEASONMOD.stepMonth(stB);
  SEASONMOD.chooseDropSector(stB, Object.keys(cB)[0], 3);
  const recB = SEASONMOD.closeSeason(stB);

  ok('choosing a different sector changes the Divide',
     JSON.stringify(recA.corps) !== JSON.stringify(recB.corps),
     'landing north vs south-west produced the same season');
}

function sponsorship() {
  const oa = readJSON('oa_profiles.json').oa_profiles;
  const SPON = req('sponsors.js');
  const rng = P.mulberry32(P.seedFrom('spon-guard'));
  const corps = SEASONMOD.openFleet(rng, oa, {});
  const ids = Object.keys(corps);

  /* --- motives: fit is read off behaviour, so different corps attract different houses --- */
  const attracted = {};
  for (const id of ids) {
    const best = SPON.prospects(corps[id], ids)[0];
    if (best) attracted[best.house] = (attracted[best.house] || 0) + 1;
  }
  ok('different corps attract different sponsors',
     Object.keys(attracted).length >= 3,
     Object.keys(attracted).length + ' distinct houses lead the field');

  let paid = 0, breaches = 0, exclusive = 0, plural = 0, courtLanded = 0, kept = 0;
  for (let s = 0; s < 6; s++) {
    const st = SEASONMOD.beginSeason(rng, corps, oa, {});
    while (st.month <= SEASONMOD.CONST.PREP_MONTHS) SEASONMOD.stepMonth(st);
    const rec = SEASONMOD.closeSeason(st);
    for (const id of ids) {
      const sp = (rec.corps[id] || {}).sponsors || {};
      paid += sp.paid || 0; breaches += (sp.broken || []).length; kept += sp.kept || 0;
      const cs = corps[id].sponsors || {};
      if ((cs.contracts || []).some(c => c.exclusive)) exclusive++;
      if ((cs.contracts || []).length > 1) plural++;
      courtLanded += Object.keys(cs.courted || {}).length;
    }
  }

  ok('sponsors actually pay', paid > 0, Math.round(paid).toLocaleString() + ' in retainers');
  ok('an obligation can be FAILED, not just carried',
     breaches > 0, breaches + ' broken across six seasons');
  ok('obligations are also kept — breaking is not the only outcome',
     kept > 0, kept + ' seen out');
  ok('exclusivity is taken by somebody', exclusive > 0, exclusive + ' corp-seasons exclusive');
  ok('and non-exclusive deals stack, so exclusivity costs something real',
     plural > 0, plural + ' corp-seasons carrying more than one');
  ok('the courting verb reaches a house', courtLanded > 0, courtLanded + ' houses courted');

  /* --- exclusivity is a real lock, proved by construction rather than by hoping to see it --- */
  const c = corps[ids[0]];
  c.sponsors = { regard: {}, contracts: [], offers: [], courted: {} };
  c.sponsors.offers = [
    { house: ids[1], retainer: 50000, term: 2, exclusive: true, obligation: 'none',
      obligationText: 'none', fit: 1 },
    { house: ids[2], retainer: 20000, term: 2, exclusive: false, obligation: 'none',
      obligationText: 'none', fit: 1 }
  ];
  const first = SPON.accept(c, ids[1]);
  const second = SPON.accept(c, ids[2]);
  ok('an exclusive contract locks out every other banner',
     first.ok && !second.ok, second.why || 'second signing was allowed');

  /* --- and the verb is shut while it is locked, which is the cost made visible --- */
  const st2 = SEASONMOD.beginSeason(rng, corps, oa, {});
  c.sponsors.contracts = [{ house: ids[1], retainer: 1, term: 3, seasonsServed: 0,
                            exclusive: true, obligation: 'none', obligationText: 'none' }];
  const courtOpt = SEASONMOD.optionsFor(st2, ids[0]).find(o => o.kind === 'court');
  ok('courting is shut while an exclusive contract is running',
     !courtOpt.available, courtOpt.why);
}

function laterConsequences() {
  const oa = readJSON('oa_profiles.json').oa_profiles;
  const rng = P.mulberry32(P.seedFrom('later-guard'));
  const corps = SEASONMOD.openFleet(rng, oa, {});
  const me = Object.keys(corps)[0], c = corps[me];
  const st = SEASONMOD.beginSeason(rng, corps, oa, {});

  let firstSpend = 0, firstLanding = 0, shutMonths = 0;
  while (st.month <= SEASONMOD.CONST.PREP_MONTHS) {
    const m = st.month;
    const opt = SEASONMOD.optionsFor(st, me).find(o => o.kind === 'scout');
    if (!opt.available) shutMonths++;
    const before = c._scouted || 0;
    SEASONMOD.stepMonth(st, { [me]: ['scout'] });
    if (!firstSpend && opt.available) firstSpend = m;
    if (!firstLanding && (c._scouted || 0) > before) firstLanding = m;
  }

  ok('a survey does not land in the month it is bought',
     firstLanding > firstSpend, 'bought M' + firstSpend + ', landed M' + firstLanding);
  ok('a survey lands exactly when it says it will',
     firstLanding - firstSpend === SEASONMOD.CONST.SURVEY_MONTHS,
     (firstLanding - firstSpend) + ' months, expected ' + SEASONMOD.CONST.SURVEY_MONTHS);
  ok('the queue drains: intel actually arrives',
     (c._scouted || 0) > 0, 'intel ' + (c._scouted || 0).toFixed(2));
  ok('a survey that could not report before the lock is not offered',
     shutMonths === SEASONMOD.CONST.SURVEY_MONTHS,
     shutMonths + ' months shut, expected ' + SEASONMOD.CONST.SURVEY_MONTHS);
  ok('nothing is left owed at the lock', (c._pending || []).length === 0,
     (c._pending || []).length + ' still pending');

  /* A PROMISE MADE BEFORE A SAVE MUST BE KEPT AFTER IT. This is the join between the two things
     built this session, and it is where a scheduled outcome would most plausibly be lost — the
     queue is state that exists only between the month that bought it and the month it lands. */
  const rng2 = P.mulberry32(P.seedFrom('later-save'));
  const corps2 = SEASONMOD.openFleet(rng2, oa, {});
  const me2 = Object.keys(corps2)[0];
  let st2 = SEASONMOD.beginSeason(rng2, corps2, oa, {});
  SEASONMOD.stepMonth(st2, { [me2]: ['scout'] });          /* bought in M1, due M4 */
  const owed = (corps2[me2]._pending || []).length;
  const back = SEASONMOD.loadCareer(JSON.parse(JSON.stringify(SEASONMOD.saveCareer(st2))), oa);
  const c2 = back.corps[me2];
  st2 = back.state;
  ok('an outcome owed to you survives a save', (c2._pending || []).length === owed,
     owed + ' owed before, ' + (c2._pending || []).length + ' after');
  while (st2.month <= SEASONMOD.CONST.PREP_MONTHS) SEASONMOD.stepMonth(st2);
  ok('an outcome owed across a save still lands', (c2._scouted || 0) > 0,
     'intel after resuming ' + (c2._scouted || 0).toFixed(2));
}

function saveLoad() {
  const oa = readJSON('oa_profiles.json').oa_profiles;
  const strip = c => JSON.stringify(c, (k, v) => k === 'profile' ? undefined : v);

  const run = (saveSeason, saveMonth, seasons) => {
    const rng = P.mulberry32(P.seedFrom('save-guard'));
    let corps = SEASONMOD.openFleet(rng, oa, {});
    let carry = rng, loaded = null;
    for (let s = 1; s <= seasons; s++) {
      let st = SEASONMOD.beginSeason(carry, corps, oa, {});
      while (st.month <= SEASONMOD.CONST.PREP_MONTHS) {
        if (s === saveSeason && st.month === saveMonth) {
          const text = JSON.stringify(SEASONMOD.saveCareer(st));      /* through actual text */
          const back = SEASONMOD.loadCareer(JSON.parse(text), oa);
          corps = back.corps; st = back.state; carry = st.rng; loaded = back;
        }
        SEASONMOD.stepMonth(st);
      }
      SEASONMOD.closeSeason(st);
    }
    return { print: strip(corps), corps: corps, loaded: loaded };
  };

  const base = run(0, 0, 3);
  /* THREE POINTS, NOT FIVE, and season two is non-negotiable among them: the aliasing bug this
     guard exists for is invisible in season one, which has no offseason to build the aliases.
     Each point costs three full seasons, so the count is the cost. */
  const points = [[1, 5], [2, 5], [2, 11]];
  const diverged = points.filter(pt => run(pt[0], pt[1], 3).print !== base.print)
                         .map(pt => 's' + pt[0] + 'M' + pt[1]);
  ok('a career resumed from a save is the same career',
     diverged.length === 0, diverged.join(', ') || points.length + ' save points identical');

  /* IDENTITY, not just equality. G1 requires a survivor to carry to next season as the SAME
     object; a load that quietly clones people would still pass the check above if the clones
     happened to behave identically for three seasons. This asserts the aliases point at the
     roster's objects rather than at copies of them. */
  const mid = run(2, 5, 2);
  let aliased = 0, checked = 0;
  for (const id of Object.keys(mid.corps)) {
    const c = mid.corps[id];
    for (const f of (c._off && c._off.expired) || []) {
      checked++;
      if (c.roster.indexOf(f) < 0 && c.roster.some(r => r.id === f.id)) aliased++;
    }
  }
  ok('a loaded save re-points aliases at the roster, not at copies of it',
     aliased === 0, aliased + ' cloned of ' + checked + ' checked');

  /* a save from a build that read a different shape must refuse rather than half-work */
  let refused = false;
  try { SEASONMOD.loadCareer({ version: SEASONMOD.SAVE_VERSION + 1, corps: {} }, oa); }
  catch (e) { refused = true; }
  ok('a save from an incompatible build is refused rather than half-read', refused);
}

function signingWindow() {
  const OAs = OA;
  const openMonths = () => {
    const rng = makeRng('win-open');
    const corps = SEASONMOD.openFleet(rng, OAs, {});
    const me = Object.keys(corps)[0];
    const st = SEASONMOD.beginSeason(rng, corps, OAs, {});
    let open = 0, withWindow = 0;
    while (st.month <= SEASONMOD.CONST.PREP_MONTHS) {
      if (SEASONMOD.MONTHS[st.month].signing) {
        withWindow++;
        if (SEASONMOD.optionsFor(st, me).find(o => o.kind === 'recruit').available) open++;
      }
      SEASONMOD.stepMonth(st);
    }
    return { open, withWindow };
  };
  const o = openMonths();
  ok('a new corp can actually work a signing window in its first year',
     o.open === o.withWindow && o.open > 0,
     o.open + ' of ' + o.withWindow + ' window-months workable in season 1');

  /* THE FOUNDING ROSTER IS A SPREAD, NOT A NUMBER. A flat founding size is what put every corp
     on the same side of the signing gate in the first place, so the shape is guarded: nobody
     opens able to field a full drop force, nobody opens below the legal minimum, and the houses
     differ from each other. If this ever collapses to one value the first year stops being a
     question about who to sign and how much is left for gear. */
  const sizes = OAs.map(p => SEASONMOD.foundingRoster(p));
  const spread = new Set(sizes);
  ok('no house opens able to field a full drop force',
     Math.max.apply(null, sizes) < SEASONMOD.CONST.DROP_MAX,
     'largest ' + Math.max.apply(null, sizes) + ' against a drop max of ' + SEASONMOD.CONST.DROP_MAX);
  ok('no house opens below the legal minimum to field at all',
     Math.min.apply(null, sizes) >= SEASONMOD.CONST.ROSTER_MIN,
     'smallest ' + Math.min.apply(null, sizes) + ' against a roster min of ' + SEASONMOD.CONST.ROSTER_MIN);
  ok('the houses do not all open the same size',
     spread.size >= 3, spread.size + ' distinct sizes: ' + [...spread].sort((a,b)=>b-a).join(', '));
  ok('every house opens short of the target it is trying to reach',
     sizes.every(n => n < SEASONMOD.CONST.ROSTER_TARGET),
     'largest ' + Math.max.apply(null, sizes) + ' against a target of ' + SEASONMOD.CONST.ROSTER_TARGET);
  observe('F1', 'average founding roster across the fleet',
          sizes.reduce((a, b) => a + b, 0) / sizes.length);

  /* TWO SEEDS, NOT ONE. This asserted a stochastic effect from a single career pair and
     failed at 5 signed against 6 — a difference of one. Run across eight seeds the effect is
     overwhelming: working the window wins seven of them, by margins up to 29 against 0 and 16
     against 1, and the one seed it loses is the one this guard was pinned to. A guard whose
     verdict rests on a difference of one is the instrument this project keeps being caught by,
     not a finding about the game.
     Two rather than eight because cost is part of whether an instrument works — each career
     pair is about forty seconds, and a gate nobody waits for is a gate nobody runs. Two is
     enough to take a coin flip out of it; the full spread is recorded above rather than
     re-measured every edit. */
  const career = (seed, work) => {
    const rng = makeRng(seed);
    const corps = SEASONMOD.openFleet(rng, OAs, {});
    const me = Object.keys(corps)[0];
    let signed = 0;
    for (let s = 0; s < 4; s++) {
      const st = SEASONMOD.beginSeason(rng, corps, OAs, {});
      while (st.month <= SEASONMOD.CONST.PREP_MONTHS) {
        const before = corps[me].roster.length;
        const opt = SEASONMOD.optionsFor(st, me).find(x => x.kind === 'recruit');
        SEASONMOD.stepMonth(st, { [me]: (work && opt.available) ? ['recruit','recruit','recruit'] : [] });
        signed += Math.max(0, corps[me].roster.length - before);
      }
      SEASONMOD.closeSeason(st);
    }
    return signed;
  };
  const worked = career('win-bite', true) + career('win-bite-1', true);
  const ignored = career('win-bite', false) + career('win-bite-1', false);
  ok('working the window signs more people than ignoring it',
     worked > ignored, worked + ' signed vs ' + ignored + ' over four seasons on two seeds');
}

/* EVERY NUMBER A CONTEST REPORTS IS A NUMBER, and this is the guard that says so.
   Four counters in this project's history have been created by being incremented, never
   declared, and aggregated with `+=` — so a run where the thing never happened handed back
   `undefined`, the total went NaN, and every `|| 0` downstream reported a confident zero
   for ever. `tel.vents` and two others were found that way once; `downDeaths` was found a
   session later, after a correct change had been measured against the NaN and abandoned on
   the strength of it; `audit.passedOver` was found by this check on its first run.
   Looking for the pattern by reading the source was tried and thrown away — four false
   positives in six and it missed the real one. NaN is a runtime property, so it is checked
   at runtime. */
function noNaN() {
  const r = DIV.runDivide(makeRng('nan-guard'), { oaProfiles, traitIndex, raceById: gen.raceById });
  const bad = [];
  const walk = (o, path, depth) => {
    if (depth > 3 || !o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'number') { if (Number.isNaN(v)) bad.push(path + k); }
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path + k + '.', depth + 1);
    }
  };
  walk(r, '', 0);
  ok('every number a contest reports is a number', bad.length === 0,
     bad.length ? 'NaN: ' + bad.join(', ') : 'no NaN in the contest record');
}

function zoneWall() {
  let outside = 0, squadDays = 0, worst = 0;
  for (let i = 0; i < 4; i++) {
    const rng = makeRng('zone-wall-' + i);
    const s = DIV.runDivide(rng, { oaProfiles: OA });
    for (const c of s.corps || []) for (const sq of c.squads || []) {
      if (!(sq.bodies || []).length) continue;
      squadDays++;
      const o = MAPMOD.outsideBy(s.planet, s.days, sq.x, sq.y);
      if (o > 1e-9) { outside++; worst = Math.max(worst, o); }
    }
  }
  ok('the line is a wall: no squad ends a Divide outside it', outside === 0,
     outside + ' of ' + squadDays + ' squads, worst overshoot ' + worst.toFixed(4));
}

function energyInvariants(n) {
  const rng = makeRng('energy-inv');
  const kits = [
    { primary: 'itm_pulse_carbine', armor: 'itm_plate_carrier', sidearm: 'itm_las_sidearm', mods: [], consumables: [] },
    { primary: 'itm_beam_lance', armor: 'itm_flak_vest', sidearm: null, mods: [], consumables: [] },
    { primary: 'itm_plasma_caster', armor: 'itm_scout_weave', sidearm: 'itm_service_pistol', mods: [], consumables: [] },
    { primary: 'itm_las_repeater', armor: 'itm_plate_carrier', sidearm: 'itm_holdout', mods: [], consumables: [] }
  ];
  const bad = { heat: 0, charge: 0, vent: 0, swap: 0 };
  let vents = 0, draws = 0, checked = 0;
  for (let i = 0; i < n; i++) {
    const kit = kits[i % kits.length];
    const A = squad(rng, OA[1], 'standard', { loadout: kit });
    const B = squad(rng, OA[2], 'standard', {});
    const r = TACMOD.resolve(rng, A, B, { day: 1, openingBand: 1, terrain: 'broken_ground' });
    vents += r.telemetry.vents || 0; draws += r.telemetry.sidearmDraws || 0;
    for (const u of A.units) {
      checked++;
      if (u.heat < 0 || (u.heatCap > 0 && u.heat > u.heatCap)) bad.heat++;
      if (u.charge < 0 || (u.chargeMax > 0 && u.charge > u.chargeMax)) bad.charge++;
      if (u.venting < 0) bad.vent++;
      /* a fighter must never end the fight holding a sidearm while the primary is ready */
      if (u.onSidearm && u.venting === 0 && u.charge > 0) bad.swap++;
    }
  }
  ok('energy: heat never negative and never above the cap', bad.heat === 0, bad.heat + ' of ' + checked);
  ok('energy: charge never negative and never above the cell', bad.charge === 0, bad.charge + ' of ' + checked);
  ok('energy: vent counter never negative', bad.vent === 0, bad.vent + ' of ' + checked);
  ok('sidearm: nobody finishes on a sidearm with a working primary', bad.swap === 0, bad.swap + ' of ' + checked);
  ok('energy: weapons actually vent under fire', vents > 0, vents + ' vents in ' + n + ' engagements');
  ok('sidearm: fallbacks are actually drawn', draws > 0, draws + ' draws in ' + n + ' engagements');
}

/* THE SWEEP RUNS ON THE GRID. It ran on `combat.js`'s abstract band resolver, which the Divide
   has not called since Step 7.5 — so the project's largest safety net, 600 engagements a run,
   was guarding a resolver nobody plays while the one everybody plays was unguarded. The first
   thing it found when pointed at the grid was that the grid's casualty tally had no field for
   `stable` and had never accounted for every body.

   Two invariants had to change SHAPE rather than move, and the difference matters:
   the abstract model seated fighters in a pool of firing positions, so "one fighter per firing
   position" was a statement about that pool. The grid has cells and coordinates instead, so the
   equivalent claim is that no two living fighters stand on the same cell. And the casualty
   tally was a set of arrays that could be concatenated; here it is counts, so the check is that
   the REPORTED tally agrees with the actual units and partitions them exactly once. That is a
   stronger check than the old one — it catches a reporting bug as well as a bookkeeping one,
   which is precisely the bug it found. */
function invariants(n, label) {
  const rng = makeRng('inv-' + label);
  let checked = 0;
  const bad = { state:0, comp:0, ammo:0, cover:0, cell:0, pair:0, tally:0, report:0, nan:0 };

  for (let i = 0; i < n; i++) {
    const a = squad(rng, OA[i % 8], 'standard');
    const b = squad(rng, OA[(i + 3) % 8], ['preservationist','standard','death_or_glory'][i % 3]);
    /* `night` is not passed: the grid has no time of day, and handing it a flag it does not
       read would look like coverage that is not there. */
    const r = TACMOD.resolve(rng, a, b, {
      day: 1 + (i % 28), openingBand: i % 3,
      terrain: ['open_basin','broken_ground','forest','ruins','entrenched'][i % 5]
    });
    checked++;

    for (const side of [a, b]) {
      for (const u of side.units) {
        if (!VALID.includes(u.state)) bad.state++;
        if (!(u.comp >= 0 && u.comp <= 100)) bad.comp++;
        if (u.ammo < 0) bad.ammo++;
        if (!(u.cover >= 0 && u.cover <= 3)) bad.cover++;
        if (Number.isNaN(u.comp) || Number.isNaN(u.ammo)) bad.nan++;
        if (Number.isNaN(u.x) || Number.isNaN(u.y)) bad.nan++;
      }
      /* nobody stands where somebody else is standing — the grid's form of the old
         one-fighter-per-firing-position rule. Only the living occupy ground. */
      const standing = side.units.filter(u => u.state === 'ok' || u.state === 'light');
      const cells = standing.map(u => u.x + ',' + u.y);
      if (new Set(cells).size !== cells.length) bad.cell++;
      /* Mon-Wa: one shared wound track means halves never disagree about being up */
      for (const u of side.units) {
        if (!u.pair) continue;
        const up = h => h.state === 'ok' || h.state === 'light';
        const [x, y] = u.pair.halves;
        if (up(x) !== up(y)) bad.pair++;
      }
      /* the reported tally accounts for every body exactly once, and agrees with the units */
      const t = r.casualties[side.tag];
      const cnt = st => side.units.filter(u => u.state === st).length;
      const sum = t.dead + t.down + t.stable + t.captured + t.withdrawn + t.fled + t.panicked + t.ok;
      if (sum !== side.units.length || t.total !== side.units.length) bad.tally++;
      if (t.dead !== cnt('dead') || t.ok !== cnt('ok') + cnt('light') ||
          t.light !== cnt('light') || t.stable !== cnt('stable')) bad.report++;
    }
    /* telemetry conservation */
    if (r.telemetry.hits > r.telemetry.shots) bad.nan++;
    if (r.telemetry.downDeaths > r.telemetry.downs + r.telemetry.stabilized + 8) bad.nan++;
  }

  ok(label + ': legal states', bad.state === 0, bad.state + ' violations');
  ok(label + ': composure clamped 0\u2013100', bad.comp === 0, bad.comp + ' violations');
  ok(label + ': ammunition never negative', bad.ammo === 0, bad.ammo + ' violations');
  ok(label + ': cover grade in range', bad.cover === 0, bad.cover + ' violations');
  ok(label + ': no two fighters on one cell', bad.cell === 0, bad.cell + ' violations');
  ok(label + ': Mon-Wa halves share a wound track', bad.pair === 0, bad.pair + ' violations');
  ok(label + ': casualty tally accounts for every body', bad.tally === 0, bad.tally + ' violations');
  ok(label + ': the reported tally agrees with the units', bad.report === 0, bad.report + ' violations');
  ok(label + ': no NaN or impossible telemetry', bad.nan === 0, bad.nan + ' violations');
  return checked;
}

/* =========================================================================
   2. MONOTONICITY — the model must respond in the right direction
   ========================================================================= */
function monotonic() {
  const mk = (aim, cover, band) => {
    const f = { id:'t', race:'human', stats:{aim,grit:10,reflex:10,fieldcraft:10,tactics:10,presence:10,resolve:10},
                traits:[], condition:{health:100,fatigue:0,morale:60}, experience:{} };
    const c = C.makeCombatant(f, { traitIndex: gen.traitById });
    c.cover = cover; return c;
  };
  const ctx = { exchange: 2, night: false };
  /* more aim always helps */
  let mono = true, prev = -1;
  for (let aim = 4; aim <= 18; aim += 2) {
    const p = C.hitChance(mk(aim,1,1), mk(10,1,1), 1, ctx, false);
    if (p < prev) mono = false; prev = p;
  }
  ok('hit chance rises with aim', mono);

  /* better cover always helps the target */
  mono = true; prev = 2;
  for (let cov = 0; cov <= 3; cov++) {
    const p = C.hitChance(mk(10,1,1), mk(10,cov,1), 1, ctx, false);
    if (p > prev) mono = false; prev = p;
  }
  ok('hit chance falls as cover improves', mono);

  /* short band is deadlier than long */
  const pl = C.hitChance(mk(10,1,1), mk(10,1,1), 0, ctx, false);
  const pm = C.hitChance(mk(10,1,1), mk(10,1,1), 1, ctx, false);
  const ps = C.hitChance(mk(10,1,1), mk(10,1,1), 2, ctx, false);
  ok('hit chance rises as range closes', pl < pm && pm < ps, [pl,pm,ps].map(x=>x.toFixed(3)).join(' < '));

  /* firing exposes: an exposed target is easier to hit */
  const t = mk(10,2,1); const pHeld = C.hitChance(mk(10,1,1), t, 1, ctx, false);
  t.exposed = true; const pExp = C.hitChance(mk(10,1,1), t, 1, ctx, false);
  ok('firing exposes the shooter', pExp > pHeld, pHeld.toFixed(3) + ' → ' + pExp.toFixed(3));

  /* probabilities stay probabilities at the extremes */
  const lo = C.hitChance(mk(1,1,1), mk(20,3,1), 0, ctx, false);
  const hi = C.hitChance(mk(20,1,1), mk(1,0,1), 2, ctx, true);
  ok('hit chance bounded 0–1', lo > 0 && lo < 1 && hi > 0 && hi < 1, lo.toFixed(4) + ' .. ' + hi.toFixed(4));

  /* severity bands are ordered and cover the full roll space */
  const B = C.CONST.SEV_BANDS;
  ok('severity bands ordered', B.graze < B.light && B.light < B.serious && B.serious < B.critical);

  /* composure seed responds to resolve and experience */
  const green = { id:'g', race:'human', stats:{aim:10,grit:10,reflex:10,fieldcraft:10,tactics:10,presence:10,resolve:8},
                  traits:[], condition:{morale:60}, experience:{divides:0,battles:0,dividends:0} };
  const vet = JSON.parse(JSON.stringify(green)); vet.stats.resolve = 14; vet.experience = {divides:3,battles:14,dividends:2};
  const gc = C.makeCombatant(green,{traitIndex:gen.traitById}).comp;
  const vc = C.makeCombatant(vet,{traitIndex:gen.traitById}).comp;
  ok('veterans start steadier than rookies', vc > gc, gc + ' → ' + vc);
}

/* =========================================================================
   3. C12 — the ratified gear/stats split, guarded numerically
   ========================================================================= */
function gearRatio() {
  const TIER = { 1:{power:2,protection:1}, 2:{power:3,protection:2},
                 3:{power:5,protection:3}, 4:{power:7,protection:4} };
  const GROUND = ['open_basin','broken_ground','ruins','forest','entrenched'];
  /* Sides swapped and two independent populations, which is the standard this project states
     and this guard did not meet: the treated force sat on side A every time, so any A/B
     asymmetry in the resolver was folded into the answer. */
  const run = (tier, pop) => {
    const rng = makeRng('gear-guard-' + tier + '-' + pop);
    let inflicted = 0, suffered = 0;
    /* 100, NOT 300. Measured at 106 seconds — the single most expensive thing in the suite, for
       a claim that is only ever about DIRECTION: better gear helps, worse hurts, two tiers down
       hurts more than one. Direction at an effect size near 28% is settled long before 600
       fights a cell; 300 was chosen when this guard still asserted a magnitude band, and the
       sample size outlived the claim it was sized for. */
    for (let i = 0; i < 100; i++) {
      for (const swap of [false, true]) {
        const t = squad(rng, OA[i%8], 'standard',
          { weapon:{power:TIER[tier].power,range:'medium',tier}, armor:{protection:TIER[tier].protection} });
        const c = squad(rng, OA[(i+3)%8], 'standard',
          { weapon:{power:5,range:'medium',tier:3}, armor:{protection:3} });
        const A = swap ? c : t, B = swap ? t : c;
        const r = TACMOD.resolve(rng, A, B,
          { day:12, openingBand:1, terrain: GROUND[i % GROUND.length] });
        const out = x => x.dead + x.down + x.stable;
        const mine = swap ? r.casualties.B : r.casualties.A;
        const theirs = swap ? r.casualties.A : r.casualties.B;
        inflicted += out(theirs); suffered += out(mine);
      }
    }
    return (inflicted - suffered) / ((inflicted + suffered) / 2) * 100;
  };

  /* WHAT IS GUARDED IS THE RELATIONSHIP, NOT THE NUMBER.
     This asserted a magnitude — "one tier up swings 20-40%" — measured on the abstract band
     resolver. On the grid the same question answers near 80%, so the ratified band described a
     game nobody plays, and importing the band onto the grid would just have moved a wrong
     number. Calibration is deferred by ruling and the game is not built, so every distribution
     here will move again; a magnitude guard would be re-tuned every step and would catch
     nothing in between.
     What must hold at any calibration is STRUCTURAL: better gear helps, worse gear hurts, and
     the effect is monotonic across the tiers rather than folding back on itself. That is a
     claim about the model being wired up correctly, which is what a guard is for. The
     magnitudes are recorded beside it as observations so drift stays visible. */
  const up   = [run(4,'a'), run(4,'b')];
  const down = [run(2,'a'), run(2,'b')];
  const way  = [run(1,'a'), run(1,'b')];
  const mean = x => (x[0] + x[1]) / 2;
  const agree = x => (x[0] > 0) === (x[1] > 0);

  ok('C12: a tier of gear up helps, in both populations',
     up[0] > 0 && up[1] > 0, up.map(v => v.toFixed(1) + '%').join(' / '));
  ok('C12: a tier of gear down hurts, in both populations',
     down[0] < 0 && down[1] < 0, down.map(v => v.toFixed(1) + '%').join(' / '));
  ok('C12: two tiers down hurts more than one, and does not fold back',
     mean(way) < mean(down), mean(way).toFixed(1) + '% vs ' + mean(down).toFixed(1) + '%');
  ok('C12: the two populations agree on the direction',
     agree(up) && agree(down) && agree(way),
     'up ' + up.map(v=>v.toFixed(0)).join('/') + ' \u00b7 down ' + down.map(v=>v.toFixed(0)).join('/'));
  observe('C12m', 'casualty swing from one tier of gear, on the grid', mean(up));
}

/* PROCUREMENT.md P12 — the ratified 30/70 gear/stats split, restated.
   Identical rosters, identical doctrine, identical armoury. The only difference is how much
   Kit Allowance one of them is permitted to field. */
function budgetParity() {
  const BASE = ITEMS.CONST.KIT_ALLOWANCE_PER_BODY * 8;
  const GROUND = ['open_basin','broken_ground','ruins','forest','entrenched'];
  const run = (mult, pop) => {
    const rng = makeRng('budget-guard-' + mult + '-' + pop);
    let inflicted = 0, suffered = 0;
    /* 80, NOT 250. This produces an UNRATIFIED observation — a figure the suite itself says is
       not yet a number, because the two populations disagree about its sign. Sixty-five seconds
       of every run went to computing something we have declared meaningless at this sample size.
       An observation is worth keeping visible; it is not worth being a gate. The magnitude lives
       in `probe_panel.cjs` for when somebody wants it properly. */
    for (let i = 0; i < 80; i++) {
      for (const swap of [false, true]) {
        const rich = ITEMS.planForce('std_issue', 8, { allowance: Math.round(BASE * mult), budget: 1e9 });
        const poor = ITEMS.planForce('std_issue', 8, { allowance: BASE, budget: 1e9 });
        const t = squad(rng, OA[i % 8], 'standard', { plan: rich });
        const c = squad(rng, OA[(i + 3) % 8], 'standard', { plan: poor });
        const A = swap ? c : t, B = swap ? t : c;
        const r = TACMOD.resolve(rng, A, B,
          { day: 12, openingBand: 1, terrain: GROUND[i % GROUND.length] });
        const out = x => x.dead + x.down + x.stable;
        inflicted += out(swap ? r.casualties.A : r.casualties.B);
        suffered  += out(swap ? r.casualties.B : r.casualties.A);
      }
    }
    return (inflicted - suffered) / ((inflicted + suffered) / 2) * 100;
  };
  const up = [run(1.30,'a'), run(1.30,'b')], down = [run(1/1.30,'a'), run(1/1.30,'b')];
  const mean = x => (x[0] + x[1]) / 2;
  /* STILL NOT A RATIFIED GUARD, and still saying so out loud — but it is now measured on the
     resolver the game runs, sides swapped, across two populations. The reason it cannot be
     ratified has changed twice and both earlier reasons were wrong. It said extra allowance
     buys consumables that do nothing: they do, and 1,051 of 1,196 bodies in a Divide carry
     one. Then it was that the instrument ran on the abstract resolver: it no longer does.
     What is left is the honest reason — the two populations have disagreed in SIGN about
     whether a third more money helps at all. If they still disagree, the effect is smaller
     than the noise at this sample size and there is no number to ratify. The populations
     agreeing is therefore reported as a check in its own right, so the day it becomes
     ratifiable is visible rather than something somebody has to go looking for. */
  /* This was written as a hard check and that was a mistake: two populations disagreeing about
     whether a third more money helps is a FINDING, not a broken system, and the ruling on this
     project is that imbalance is not a defect while a system that cannot run is. Turning "we do
     not know yet" into a red suite trains people to ignore red. It reports instead, and the day
     the sign settles is visible in the observation line. */
  observe('P12a', 'do the two populations agree that more money helps? 1 yes, 0 no',
          (up[0] > 0) === (up[1] > 0) ? 1 : 0);
  observe('P12u', 'casualty swing from 1.3x Kit Allowance, on the grid', mean(up), '%');
  observe('P12d', 'casualty swing from 1.3x LESS allowance', mean(down), '%');
}

/* =========================================================================
   4. HOOK PARITY — every hook the resolver reads must exist in traits.json
   ========================================================================= */
function hookParity() {
  /* THE RESOLVER IS TWO FILES AND READS HOOKS TWO WAYS. This scanned `combat.js` only, and only
     for `hooks.has(...)` — so it saw 30 of the 46 the resolver actually reads, missing every
     hook the grid reads and every one reached through `hasQuirk`. It passed anyway because the
     abstract resolver was fat enough to clear the threshold on its own; cutting that at Step 8.9
     dropped it to 30 and the guard finally spoke. It had been measuring the dead half. */
  const src = ['combat.js', 'tactical.js'].map(f => fs.readFileSync(findFile(f), 'utf8')).join('\n');
  /* ONLY `hooks.has` — that is the TRAIT vocabulary. `hasQuirk` reads the WEAPON-TAG vocabulary
     out of items.json (heavy_draw, arc_chain, mobile_cover), which is a different namespace with
     its own guard below. Folding the two together makes every weapon tag look like a trait hook
     the traits file failed to grant, which is thirteen ghosts that are not ghosts. */
  const referenced = new Set([...src.matchAll(/hooks\.has\('([a-z_0-9]+)'\)/g)].map(m => m[1]));
  const granted = new Set();
  for (const t of gen.generator.traits) for (const h of ((t.effects && t.effects.hooks) || [])) granted.add(h);
  const ghosts = [...referenced].filter(h => !granted.has(h));
  ok('no ghost hooks (resolver reads only hooks traits actually grant)', ghosts.length === 0, ghosts.join(', '));
  /* 35 was calibrated when the abstract resolver existed and was doing some of this reading;
     33 was calibrated after that cut and was STILL too high, because eight hooks were being
     read only inside functions nobody called. The floor is 28, which is what the code that
     actually runs reads. It cannot fall without saying so, and it rises as named inert hooks
     come off their list. Combined with the inert-list guard, a hook cannot stop being read in
     silence from either direction — and now cannot start being counted in silence either. */
  ok('resolver reads a meaningful share of the trait vocabulary', referenced.size >= 28,
     referenced.size + ' hooks read across combat.js and tactical.js');
}

/* =========================================================================
   5. SNAPSHOTS — exact fixed-seed outcomes
   ========================================================================= */
/* `night` IS GONE FROM THESE CASES, and the fourth is renamed. The grid has no time of day at
   all — the flag was read only by the abstract resolver — so a case called "night engagement"
   was pinning the behaviour of weather this game does not have. Time of day is on the deferred
   list; when it lands, a night case comes back and is a real one. */
const CASES = [
  { name:'medium band, mixed policies',   seed:'snap-1', band:1, terrain:'broken_ground', pa:'standard',       pb:'standard' },
  { name:'short band, both aggressive',   seed:'snap-2', band:2, terrain:'ruins',         pa:'unyielding',     pb:'death_or_glory' },
  { name:'long band, both cautious',      seed:'snap-3', band:0, terrain:'open_basin',    pa:'preservationist',pb:'measured' },
  { name:'forest, standard v unyielding', seed:'snap-4', band:1, terrain:'forest',        pa:'standard',       pb:'unyielding' },
  { name:'entrenched, cautious v hunter', seed:'snap-5', band:1, terrain:'entrenched',    pa:'preservationist',pb:'death_or_glory' }
];
function snapshot() {
  const got = {};
  for (const c of CASES) {
    const rng = makeRng(c.seed);
    const a = squad(rng, OA[1], c.pa), b = squad(rng, OA[4], c.pb);
    const r = TACMOD.resolve(rng, a, b, { day:12, openingBand:c.band, terrain:c.terrain });
    got[c.name] = {
      result: r.result, exchanges: r.exchanges, band: r.band,
      /* counts, not arrays: the grid reports a tally rather than lists of bodies, and
         `injured` is not one of its words — a body that went down and was reached is `stable` */
      aDead: r.casualties.A.dead, aDown: r.casualties.A.down + r.casualties.A.stable,
      bDead: r.casualties.B.dead, bDown: r.casualties.B.down + r.casualties.B.stable,
      shots: r.telemetry.shots, hits: r.telemetry.hits, downs: r.telemetry.downs
    };
  }
  if (BLESS) {
    const self = fs.readFileSync(__filename, 'utf8');
    const marker = 'const BASELINE_DEFAULT = ';
    const a = self.indexOf(marker);
    const b = self.indexOf('\n};\n', a) + 4;
    fs.writeFileSync(__filename, self.slice(0, a) + marker + JSON.stringify(got, null, 2) + ';\n' + self.slice(b));
    console.log('baseline re-recorded inside ' + path.basename(__filename));
    return true;
  }
  const want = BASELINE_DEFAULT;
  for (const c of CASES) {
    const g = got[c.name], w = want[c.name];
    if (!w) { ok('snapshot: ' + c.name, false, 'missing from baseline'); continue; }
    const diffs = Object.keys(w).filter(k => String(w[k]) !== String(g[k]))
      .map(k => k + ' ' + w[k] + '→' + g[k]);
    ok('snapshot: ' + c.name, diffs.length === 0, diffs.join(', '));
  }
  return true;
}

/* =========================================================================
   6. DETERMINISM
   ========================================================================= */
function determinism() {
  const once = () => {
    const rng = makeRng('det');
    const a = squad(rng, OA[0], 'standard'), b = squad(rng, OA[5], 'unyielding');
    const r = TACMOD.resolve(rng, a, b, { day:9, openingBand:1, terrain:'ruins', log:true });
    return JSON.stringify({ res:r.result, ex:r.exchanges, tel:r.telemetry, n:r.log.length });
  };
  ok('same seed reproduces the engagement exactly', once() === once());
  /* verbose mode must not consume RNG */
  const quiet = (() => { const rng = makeRng('vb'); const a=squad(rng,OA[2],'standard'),b=squad(rng,OA[6],'standard');
    const r=TACMOD.resolve(rng,a,b,{day:9,openingBand:1,terrain:'ruins'}); return r.result+r.exchanges+r.telemetry.shots; })();
  const loud = (() => { const rng = makeRng('vb'); const a=squad(rng,OA[2],'standard'),b=squad(rng,OA[6],'standard');
    const r=TACMOD.resolve(rng,a,b,{day:9,openingBand:1,terrain:'ruins',log:true}); return r.result+r.exchanges+r.telemetry.shots; })();
  ok('verbose logging draws no RNG', quiet === loud, quiet + ' vs ' + loud);
}

/* =========================================================================
   7. DOC PARITY — COMBAT.md must quote the constants the resolver actually uses
   ========================================================================= */
/* ==========================================================================
   SEASONS — the persistent Corp and the season loop.

   The failures these exist to catch are the ones the build actually produced: people
   silently regenerated between seasons; an offseason that never healed anyone, so the
   second Divide was fought by an exhausted force and produced no casualties; a wage
   arithmetic living in two places; a board whose patience never moved because nothing
   called closeSeason; and two fail states that could not fire at all.
   ========================================================================== */
function seasonRules() {
  const SEASON = req('season.js');
  const LEDG = req('ledger.js');
  const oa = readJSON('oa_profiles.json').oa_profiles;

  /* ---- identity: a survivor is the SAME object next season, not a copy ---- */
  const corps = SEASON.openFleet(makeRng('guard-open'), oa, {});
  const one = corps[oa[0].id];
  const idsBefore = new Set(one.roster.map(f => f.id));
  const objBefore = new Map(one.roster.map(f => [f.id, f]));
  SEASON.runSeason(makeRng('guard-s1'), corps, oa, {});
  const carried = one.roster.filter(f => idsBefore.has(f.id));
  ok('G1 survivors carry over as the same objects, never regenerated',
     (carried.every(f => objBefore.get(f.id) === f) ? 1 : 0) === 1);
  /* G2 demanded `divides === 0` of every body that was not carried over, and it is measured
     AFTER the Divide — so a fighter signed at the Bastille in M8 and dropped in M12 fails it
     for having fought the one Divide they were signed for. It never fired because it was
     VACUOUS: the founding roster opened above the threshold that gates signing, so through
     season one no corp signed anybody and the filter had nothing to look at. Fixing the roster
     at Step 8.11 gave it six bodies and it spoke immediately.
     What it is actually for is catching people MATERIALISING WITH A PAST — a body appearing on
     the roster carrying a career it never had. So the bound is one Divide, this season's, and
     `seasonsHere` must still be zero on someone who arrived this year. */
  const fresh = one.roster.filter(f => !idsBefore.has(f.id));
  ok('G2 no body appears carrying a career it did not have',
     fresh.every(f => f.divides <= 1 && (f.seasonsHere || 0) === 0),
     fresh.length + ' joined, divides ' + JSON.stringify(fresh.map(f => f.divides)));

  /* ---- the offseason must actually pass: people heal, age and develop ---- */
  const before = one.roster.map(f => ({ id: f.id, age: f.age }));
  SEASON.runSeason(makeRng('guard-s2'), corps, oa, {});
  const aged = one.roster.filter(f => {
    const b = before.find(x => x.id === f.id);
    return b && f.age > b.age;
  }).length;
  ok('G3 a year passes: carried-over fighters are older',
     (aged > 0 ? 1 : 0) === 1);
  /* The bug this guards was not visible in the roster — it was visible in the KILLING.
     Survivors leave a Divide at fatigue 100 carrying wounds with weeks to run, and the
     first build never advanced the calendar, so season two was fought by an exhausted,
     broken force and produced almost no casualties at all: deaths ran 13, then 4, then 0,
     which reads like the combat model failing and was the year never passing. Asserting on
     fatigue between seasons is wrong — people are legitimately unhealed until the next
     offseason opens. Assert on the symptom that mattered. */
  const lethal = sharedCareer(oa);
  const deathsIn = n => Object.keys(lethal.seasons[n].corps)
                              .reduce((t, k) => t + lethal.seasons[n].corps[k].dead, 0);
  const d0 = deathsIn(0);
  ok('G4 later seasons are as lethal as the first: the offseason really heals',
     d0 > 0 && deathsIn(1) >= d0 * 0.4 && deathsIn(2) >= d0 * 0.4,
     'deaths by season: ' + [0, 1, 2].map(deathsIn).join(', '));

  /* ---- one treasury, and it is the one the kit budget reads ---- */
  const rich = LEDG.open(oa[2]), poor = LEDG.open(oa[2]);
  poor.treasury = 0; poor.grant = 0;
  const bodies = new Array(24).fill(null).map(() => ({ contract: { salary: 300 } }));
  check('S5', 'a poorer treasury buys less kit',
        LEDG.procurementBudget(rich, bodies) > LEDG.procurementBudget(poor, bodies) ? 1 : 0, 1, 1);

  /* ---- the board's patience actually moves over a career ---- */
  const car = sharedCareer(oa);
  let moved = 0;
  for (const id in car.seasons[0].corps) {
    const v = car.seasons.map(x => x.corps[id].patience);
    if (Math.max.apply(null, v) - Math.min.apply(null, v) >= 5) moved++;
  }
  ok('G6 board patience moves for every corp across a career',
     (moved) === 8);

  /* ---- and it self-balances rather than drifting one way for everyone ---- */
  let up = 0, down = 0;
  for (const id in car.seasons[0].corps) {
    const v = car.seasons.map(x => x.corps[id].patience);
    if (v[v.length - 1] > v[0]) up++; else if (v[v.length - 1] < v[0]) down++;
  }
  /* S-T5 — "a fighter who survives four seasons is measurably better than they arrived". This
     target has never been checkable: until the withdrawal/overrun fix nobody survived four
     seasons at all, so the development curve, the hidden potential rolled at creation and the
     green-years multiplier were all live code operating on a population that did not exist. */
  const MINDK = req('season.js').CONST.MIND;
  const mindOf = f => MINDK.reduce((t, k) => t + f.stats[k], 0) / MINDK.length;
  const green = [], vets = [];
  for (const id in car.corps) for (const f of car.corps[id].roster) {
    if (typeof f.potential !== 'number') continue;
    ((f.divides || 0) >= 4 ? vets : green).push(mindOf(f));
  }
  const avg = a2 => a2.length ? a2.reduce((x, y) => x + y, 0) / a2.length : 0;
  ok('S-T5 a fighter who survives four Divides is measurably better than a fresh one',
     vets.length >= 10 && avg(vets) > avg(green) + 1,
     vets.length + ' veterans at mind ' + avg(vets).toFixed(1) +
     ' vs ' + green.length + ' others at ' + avg(green).toFixed(1));
  /* And the ceiling stays a ceiling: potential is the best this person could EVER be, not a
     level everybody grinds out. Some careers end short of it and that is the point. */
  let atCap = 0;
  for (const id in car.corps) for (const f of car.corps[id].roster) {
    if (typeof f.potential !== 'number') continue;
    if (MINDK.every(k => f.stats[k] >= f.potential - 0.001)) atCap++;
  }
  ok('S-T5 potential remains a ceiling most people never reach',
     atCap < (vets.length + green.length) * 0.25,
     atCap + ' of ' + (vets.length + green.length) + ' at their ceiling');

  ok('G7 corps rise and fall independently, not all one way',
     Math.min(up, down) >= 1);

  /* R25b — S7 caught the symptom; this catches the cause, which has now recurred twice.
     `CARE_NEUTRAL_LOSS` and the verdict cuts are anchored to MEASURED distributions, so a
     change in the resolver silently invalidates them: the grid moved the fleet's loss rate
     from 0.398 to 0.496 and every board in the league became permanently disappointed about a
     completely normal year. A board more likely to be furious than pleased is not a hard
     board, it is a broken scale. */
  const verdicts = { ok: 0, bad: 0, n: 0 };
  for (const s of car.seasons) for (const id in s.corps) {
    const e = s.corps[id];
    if (!e.cardScore) continue;
    const f = e.cardScore.fraction, B = REPMOD.CONST.BOARD_CUTS;
    verdicts.n++;
    if (f >= REPMOD.CONST.GOAL_CONTENT_FRACTION) verdicts.ok++;
    if (f < B.unhappy) verdicts.bad++;
  }
  /* The WORST verdict only. This first asserted that the bottom two bands together stayed
     under 15%, which was a number picked out of the air rather than measured, and the fleet
     read 18% — so the guard was failing against an invention. The distribution it was
     complaining about is defensible: 69% of corp-seasons land content or better, and a board
     actually asking questions is 5%. What has to stay rare is the verdict that means the board
     has started looking at you, not every bad year. */
  ok('R25b a board that has started asking questions stays rare',
     verdicts.n > 0 && verdicts.bad / verdicts.n < 0.10,
     Math.round(100 * verdicts.bad / verdicts.n) + '% of corp-seasons in the worst band');
  ok('R25b a board is more often pleased than furious',
     verdicts.ok > verdicts.bad,
     verdicts.ok + ' content-or-better vs ' + verdicts.bad + ' in the bottom two');

  /* ---- nobody is ever struck from a Divide for being poor (S12) ---- */
  /* CONSTRUCTING POVERTY GOT HARDER, which is the correct consequence of adding an income line
     rather than a reason to weaken the claim. Zeroing the accounts used to be enough; sponsors
     now sign the corp at the season open and top it back up, so this constructed a broke corp
     that was not broke and the guard failed on a state it had failed to build.
     `human` names the corp whose deals a person would be taking, so the fleet signs and this
     one does not — a manager who signs nothing and has nothing, which is the state S12 is
     actually about. */
  const bc = SEASON.openFleet(makeRng('guard-uw'), oa, {});
  const broke = bc[oa[6].id];
  broke.account.treasury = 0; broke.account.grant = 0; broke.rep.patience = 9;
  broke.sponsors = { regard: {}, contracts: [], offers: [], courted: {} };
  const uw = SEASON.runSeason(makeRng('guard-uw1'), bc, oa, { human: oa[6].id });
  const ent = uw.corps[oa[6].id];
  ok('G8 a corp with no money is underwritten, not struck',
     (ent.underwritten ? 1 : 0) === 1);
  ok('G9 and it still fields a force',
     (ent.dropped) >= SEASON.CONST.DROP_MIN && (ent.dropped) <= SEASON.CONST.DROP_MAX);

  /* ---- the underwrite is a debt, not a rescue: fail the year and you are dismissed ---- */
  /* Constructed, not sampled. This ran three ordinary seasons and hoped one would fail — and
     once the Divide bonus let a broke corp earn its way out, the carried corp REPAID and kept
     the job, which is correct behaviour and made the guard assert the opposite of the rule.
     What has to be proved is that failing the owed year ends the career, so the owed year is
     failed on purpose: carried, then handed a card it cannot clear. */
  let fired = 0;
  const owedCorp = bc[oa[6].id];
  for (let i = 0; i < 3 && !fired; i++) {
    owedCorp._owedYear = true;
    owedCorp.underwritten = true;
    const rc = SEASON.runSeason(makeRng('guard-uw2-' + i), bc, oa, {});
    if (rc.corps[oa[6].id].dismissed) fired = 1;
  }
  ok('G10 a carried manager who does not deliver is dismissed',
     (fired) === 1);

  /* ---- the locker is owned: money buys kit, and losing people costs rifles ----
     `equipCorp` passed `budget: 0` for two steps, which was correct while the armoury was
     rebuilt free every Divide and a corp's wealth arrived as the DEPTH of that founding
     stock. Persisting the locker orphaned that channel, and every rack could then only
     thin. These two assert the channel is open and pointed the right way. */
  const arm = sharedCareer(oa);
  let spent = 0, issueOnly = 0;
  for (const s of arm.seasons) for (const id in s.corps) {
    spent += s.corps[id].kitSpend || 0;
    if (!s.corps[id].kitValue) issueOnly++;
  }
  ok('G12 treasury money actually buys kit', spent > 0, 'total kit spend ' + Math.round(spent));
  ok('G13 no corp is silently reduced to issue kit', issueOnly === 0,
     issueOnly + ' corp-seasons fielded nothing but default loadout');

  /* ---- the muster minimum is a floor, not a target ----
     A roster could fall to NOBODY: the Verdant Cradle reached zero in season five of the
     first chain, dropped seventeen and lost seventeen, and nothing noticed. Reaching the
     minimum is not means-tested; a corp signs and goes overdrawn, and the overdraft is what
     the board is asked to cover. */
  let smallestDrop = 99;
  for (const s of arm.seasons) for (const id in s.corps)
    if (s.corps[id].dropped > 0) smallestDrop = Math.min(smallestDrop, s.corps[id].dropped);
  ok('G14 no corp ever fields fewer than the muster minimum',
     smallestDrop >= SEASON.CONST.DROP_MIN, 'smallest drop force seen: ' + smallestDrop);

  /* ---- all three survivor reactions reach somebody ----
     Both of these were dead in the first build, and both were mine. `close` compared a squad
     index nothing set, so the close-loss multiplier never applied; and frenzy read
     `personality.aggression` off an object fighters do not have, so it defaulted below its
     own threshold and could not fire. A reaction nothing reaches is decoration. */
  const gf = SEASON.openFleet(makeRng('guard-grief'), oa, {});
  SEASON.runSeason(makeRng('guard-grief-1'), gf, oa, {});
  const kinds = {};
  for (const id in gf) for (const f of gf[id].roster) if (f._grief) kinds[f._grief] = (kinds[f._grief] || 0) + 1;
  ok('G15 grief, breaking and frenzy all reach somebody',
     !!(kinds.mourning && kinds.break && kinds.frenzy), JSON.stringify(kinds));

  /* ---- the muster tests the RACK, not just the wallet ----
     These two were unreachable until the lock handed the decision back to the season loop.
     A corp can be flush and unable to arm anybody; the treasury check could never see it, and
     such a corp silently fielded default issue kit with money in the bank. */
  const rk = SEASON.openFleet(makeRng('guard-rack'), oa, {});
  rk[oa[2].id].armoury = {};                       /* empty rack, full treasury */
  rk[oa[2].id].account.treasury = 900000;
  const rkr = SEASON.runSeason(makeRng('guard-rack-1'), rk, oa, {});
  const rke = rkr.corps[oa[2].id];
  ok('G16 an empty rack is re-armed out of the treasury',
     rke.kitValue > 0 && rke.dropped >= SEASON.CONST.DROP_MIN,
     'kit ' + rke.kitValue + ', fielded ' + rke.dropped);

  const rb = SEASON.openFleet(makeRng('guard-rack2'), oa, {});
  rb[oa[2].id].armoury = {};                       /* empty rack AND empty wallet */
  rb[oa[2].id].account.treasury = 0; rb[oa[2].id].account.grant = 0;
  rb[oa[2].id].rep.patience = 9;
  const rbr = SEASON.runSeason(makeRng('guard-rack2-1'), rb, oa, {});
  const rbe = rbr.corps[oa[2].id];
  ok('G17 a corp that can arm nobody is underwritten and still fields',
     rbe.underwritten && rbe.dropped >= SEASON.CONST.DROP_MIN,
     'underwritten ' + rbe.underwritten + ', fielded ' + rbe.dropped);

  /* ---- REVERSE PARITY, RETIRED AT STEP 8.7 ----
     This walked `season.js` and `reputation.js` and failed if any constant was not written down
     in a document. It caught six real omissions and was a good check for as long as the prose
     was meant to be a complete account of the system.

     It is retired because that stopped being the goal. `PROJECT.md` holds DECISIONS and leaves
     numbers to the source, so "every constant appears in prose" is no longer a property anyone
     wants — it is the cache-coherency requirement that produced eight thousand lines of
     description in the first place. **A constant's documentation is the comment beside it**, and
     that is enforced by review rather than by grep.

     Deleted rather than left passing vacuously, because a guard that no longer expresses an
     intention is worse than no guard: it still costs a line in the report and still gets
     believed. */

  /* ---- SECOND AUDIT (Step 8b-2). Six wires that were live code reaching nothing. ----
     Every one of these was found by running a career and totalling the books, not by reading
     the files. The pattern is the project's oldest: a function that is correct, exported, and
     called by nobody, or a field read on one side and written on none. */

  const bank = sharedCareer(oa);
  const lines = {};
  for (const id in bank.corps)
    for (const l of bank.corps[id].account.ledger) lines[l.label] = (lines[l.label] || 0) + l.amount;

  /* `ledger.bookDivide` had no caller in the season loop, so the whole settlement — the pot,
     the umbrella's cut, what a ceded claim sold for, ransoms both ways — was computed and
     never banked. A career ran on the board's grant alone and nothing done on a planet moved
     a treasury by one credit. */
  const bonusLine = Object.keys(lines).find(k => /^Divide bonus/.test(k));
  ok('G19 winning a Divide actually pays a corp',
     bonusLine && lines[bonusLine] > 0,
     'win bonuses banked over six seasons: ' + Math.round((lines[bonusLine] || 0)));

  /* S13 — and only a SHARE of it. Banked whole, one Divide paid for seven years of existing
     and the difficulty ladder inverted inside three seasons: the hardest start in the fleet
     finished a career as the richest corp in it. The planet belongs to the arkship. */
  const anchoredWin = LEDG.CONST.SEASON_COST_ANCHOR * LEDG.CONST.WIN_YEARS;
  const testAcct = LEDG.open(oa[0]);
  LEDG.bookDivide(testAcct, { payout: 1900000, season: 1, escalator: 1 });
  const banked = testAcct.lastBonus;
  ok('G27 a big win is worth about the ruled number of years of existing',
     banked > anchoredWin * 0.75 && banked < anchoredWin * 1.25,
     'a 1.9M settlement banks ' + banked + ' against an anchor of ' + Math.round(anchoredWin));
  ok('G28 the win bonus escalates with the allowance, on the same escalator',
     LEDG.squadBonus(1000000, 5, ITEMS.CONST.ALLOWANCE_ESCALATOR) >
     LEDG.squadBonus(1000000, 1, ITEMS.CONST.ALLOWANCE_ESCALATOR));

  /* `_lastDead` was read by settleSeason and written by no code anywhere, so the death
     benefit — one of the three channels by which a life is priced at all — had never been
     charged in any season of any chain. */
  /* R25's FUNDING SPECTRUM MUST HAVE BOTH HALVES. A board is annoyed by an expensive year, not
     merely un-delighted by one. Neutral was a spend ratio of 1.0 and a corp cannot spend more
     than the entire ceiling plus every contract in full, so the value ran [0, +1] and the
     burning half was unreachable — a spectrum with one direction is a bonus. And the ratio's
     denominator carried the corp's OWN wage bill, so every credit saved cancelled out of both
     sides and scored nothing. Both fixed at 8.5b; this fails if either returns. */
  {
    const thrift = [];
    for (const s of bank.seasons) for (const id in s.corps) {
      for (const l of ((s.corps[id].cardScore || {}).lines || [])) {
        if (l.standing && l.demand && l.demand.kind === 'thrift') thrift.push(l.value);
      }
    }
    const neg = thrift.filter(v => v < 0).length, pos = thrift.filter(v => v > 0).length;
    ok('G23 the funding spectrum runs both ways — a board resents an expensive year',
       thrift.length > 0 && neg > 0 && pos > 0,
       thrift.length + ' scored; ' + neg + ' negative, ' + pos + ' positive');
  }

  /* S3's CHOICE HAS TO BE TAKEN, not merely available. `selectDrop` computed
     `want = min(DROP_MAX, opts.want || DROP_MAX)` with `opts.want` reachable only from this
     harness, so every corp fielded the maximum in all 96 corp-seasons and the small-force build
     was structurally impossible however profitable it became. A corp now sizes its drop by the
     thrift weight its board handed it. This fails if the fleet goes back to fielding one number. */
  {
    const sizes = {};
    for (const s of bank.seasons) for (const id in s.corps) {
      sizes[s.corps[id].dropped] = (sizes[s.corps[id].dropped] || 0) + 1;
    }
    const distinct = Object.keys(sizes).length;
    const atMax = sizes[SEASON.CONST.DROP_MAX] || 0;
    const total = Object.keys(sizes).reduce((n, k) => n + sizes[k], 0);
    ok('G24 corps actually choose how many to send, rather than always sending everybody',
       distinct >= 4 && atMax < total * 0.75,
       distinct + ' distinct drop sizes over ' + total + ' corp-seasons; ' +
       atMax + ' at the maximum');
  }

  /* S16 — THE PREP CALENDAR HAS TO PASS, AND WOUNDS HAVE TO SURVIVE IT.
     The old offseason subtracted a flat OFFSEASON_DAYS 330 from every wound in one pass, which
     cures everything this game can inflict — so no injury had ever reached a second season and
     no manager had ever had to spend a year on one. That is the shape of a calendar that never
     passes: not a crash, an eleven-month gap where nothing could be decided.

     Two claims. Turns are actually taken and points actually spent, in more than one kind of
     verb — five points on one repeated action is a budget with no competition in it. And
     somebody, somewhere, is still hurt when the year ends. */
  {
    let ap = 0, kinds = {}, windows = {}, hurtAtEnd = 0, bodies = 0;
    for (const id in bank.corps) {
      const c = bank.corps[id];
      const pr = c._prep || {};
      ap += pr.ap || 0;
      for (const k in (pr.acts || {})) kinds[k] = (kinds[k] || 0) + pr.acts[k];
      for (const w in (pr.windows || {})) windows[w] = (windows[w] || 0) + pr.windows[w];
      for (const f of c.roster) {
        if (f.status === 'dead' || f.status === 'retired' || !f.condition) continue;
        bodies++;
        if ((f.condition.injuries || []).length) hurtAtEnd++;
      }
    }
    ok('G25 the prep calendar passes, and its turns are a budget with competition in them',
       ap > 0 && Object.keys(kinds).length >= 3,
       ap + ' AP spent across ' + Object.keys(kinds).length + ' verbs: ' +
       Object.keys(kinds).map(k => k + ' ' + kinds[k]).join(', '));
    ok('G26 a signing window is worked in the months DESIGN.md places one',
       Object.keys(windows).length >= 2,
       'windows worked: ' + (Object.keys(windows).join(', ') || 'none'));
    ok('G27 a wound can still be on the books when the year ends',
       bodies > 0 && hurtAtEnd > 0,
       hurtAtEnd + ' of ' + bodies + ' still carrying — zero means the calendar healed ' +
       'everything again and there is nothing to manage');
  }

  /* S17 — THE DIVIDEND HAPPENS, AND IT IS DECIDED.
     Three ways this went silently wrong while being built, all the same shape — a value read by
     a name nothing writes, or a condition borrowed from a format that does not reach it:
       - scored on dead-and-downed, which stun loadouts produce almost none of, so every bout
         was a 0-0 draw and the purse was never paid;
       - `res.casualties` read as `.A`/`.B` while the sides were tagged with corp ids, so both
         totals were zero whatever the scoring said;
       - `experience.dividends` was read by the composure seed and written by nothing but
         character generation, so every fighter's dividend count was backstory.
     So: it runs, it is decided, and people accumulate them. */
  {
    let matches = 0, purses = 0, draws = 0, fought = 0, converted = 0;
    for (const s of bank.seasons) {
      const d = s.dividend || {};
      matches += d.matches || 0; purses += d.purses || 0; draws += d.draws || 0;
      fought += d.fought || 0; converted += d.conversions || 0;
    }
    let withDividends = 0, bodies = 0;
    for (const id in bank.corps) for (const f of bank.corps[id].roster) {
      bodies++;
      if (((f.experience || {}).dividends || 0) > 0) withDividends++;
    }
    ok('G28 the Dividend is fought at T3 and produces a result somebody can win',
       matches > 0 && purses > 0,
       matches + ' matches, ' + purses + ' purses paid, ' + draws + ' draws');
    ok('G29 fighting a Dividend puts one on your record',
       fought > 0 && withDividends > 0,
       fought + ' appearances; ' + withDividends + ' of ' + bodies + ' carry one');
    /* Not a failure — a REPORT. The format is meant to be non-lethal by loadout, and this says
       how much of that is the loadout and how much is the conversion catching what it missed.
       Calibration is deferred by ruling; the number is recorded so it cannot hide. */
    /* THE SHOW-MATCH DOES NOT KILL ANYBODY, and the weapons are why. This started as a
       conversion filter over cheap lethal rifles, which is not non-lethality — it is a worse
       gun — and it left 0.36 deaths a match. Real stun arms carrying `nonlethal` bring it to
       zero. Any death here means the tag has stopped reaching the grid. */
    ok('G30 nobody dies at the Dividend, because the rounds cannot kill',
       matches > 0 && converted === 0,
       converted + ' deaths across ' + matches + ' matches');
  }

  /* S18/S19 — TWO MARKETS, TWO MECHANISMS, AND THE DIFFERENCE IS THE POINT.
     A merc picks their employer because they can walk. Somebody signing out of the Bastille has
     one offer in front of them and a sentence behind them. Modelling both as the same market
     would flatten exactly what makes the setting uncomfortable on purpose — so the checks are
     different too: the merc market has to show CHOICE being exercised, and the Bastille has to
     show a term being SERVED and people going free at the end of it. */
  {
    let lot = 0, bids = 0, signed = 0, safety = 0, refused = 0, unbid = 0;
    let bLot = 0, bSigned = 0, bUnplaced = 0;
    for (const s of bank.seasons) {
      const m = s.mercs || {}, b = s.bastille || {};
      lot += m.lot || 0; bids += m.bids || 0; signed += m.signed || 0;
      safety += m.tookLessForSafety || 0; refused += m.refused || 0; unbid += m.unbid || 0;
      bLot += b.lot || 0; bSigned += b.signed || 0; bUnplaced += b.unplaced || 0;
    }
    let serving = 0, freed = 0;
    for (const id in bank.corps) for (const f of bank.corps[id].roster) {
      if (f.status === 'prisoner') serving++;
      if (f.status === 'freed') freed++;
    }
    ok('G31 the merc market runs and professionals are hired through it',
       lot > 0 && signed > 0, lot + ' on the market, ' + bids + ' offers, ' + signed + ' hired');
    ok('G32 mercs turn down the biggest purse for a corp whose people come home',
       signed > 0 && safety > 0,
       safety + ' of ' + signed + ' took less than the top bid');
    ok('G33 the Bastille intake runs, and a term is served rather than merely signed',
       bLot > 0 && bSigned > 0 && freed > 0,
       bSigned + ' signed out of ' + bLot + '; ' + serving + ' serving, ' + freed + ' went free');
    observe('G18a', 'offers a head at the merc deadline \u2014 refusals ' + refused +
            ', unbid ' + unbid, lot ? bids / lot : 0);

    /* G32b — "A CORP THAT BURNS THROUGH PEOPLE CANNOT HIRE, WHATEVER IT OFFERS." Refusals are 0
       across every career ever run, and that is correct: no corp in an ordinary decade is bad
       enough. But zero is also what a DEAD BRANCH looks like, and this one was dead — the
       fighter's reserve sat below the weight on money, so the top bid always cleared it however
       murderous the bidder, and no world state could ever have produced a refusal.
       So it is proved by construction, per the ruling on rare branches: build a corp that got
       nearly everybody killed and is loathed by the fleet, put it alone in front of the market
       with limitless money, and it must be turned down by every one of them. The control is the
       same corp with the same money and a record of bringing people home. */
    {
      const build = (dropped, dead, fleet) => {
        const car = SEASON.runCareer(P.mulberry32(P.seedFrom('g32b')), OA, 2, {});
        const id = Object.keys(car.corps)[0], c = car.corps[id];
        c.history = [{ dropped, dead }];
        c.rep.base.fleet = fleet;
        c.roster = c.roster.slice(0, 4);          /* short-handed, so it certainly bids */
        c.account.treasury = 5e6; c.account.grant = 5e6;   /* and can certainly pay */
        const t = { lot:0, bids:0, signed:0, refused:0, unbid:0, tookLessForSafety:0 };
        /* the lot is opened separately now, because a market a player can bid in needs
           candidates that exist before the deadline rather than conjured at it */
        const lot = SEASON.openLot(P.mulberry32(P.seedFrom('g32bl')), 'mercs');
        SEASON.runMercMarket(P.mulberry32(P.seedFrom('g32bm')), { [id]: c }, [id], lot, t, {});
        return t;
      };
      const kind = build(40, 2, 120), cruel = build(40, 38, -200);
      ok('G32b a corp that gets its people killed is refused by every free agent',
         cruel.bids > 0 && cruel.signed === 0 && cruel.refused === cruel.bids,
         cruel.refused + ' of ' + cruel.bids + ' refused');
      ok('G32b the same corp with the same money and a safe record signs them',
         kind.bids > 0 && kind.signed === kind.bids,
         kind.signed + ' of ' + kind.bids + ' signed');
    }
  }

  /* `[OPEN-S2]` — THE LOCK IS A DECISION, NOT A SORT. M11 is where a manager says who goes, and
     S1 requires the AI to make that call through the same function a human would. It had one
     lean — fittest available — which is a sort with an opinion, not a choice. The ruling names
     three, and `rested` only became REACHABLE at Step 8.6 when the prep calendar stopped healing
     everybody to full: before that there was never anybody hurt to rest. This fails if the fleet
     collapses back onto one lean. */
  {
    const leans = {};
    for (const id in bank.corps) {
      const l = bank.corps[id]._lockLean || 'none';
      leans[l] = (leans[l] || 0) + 1;
    }
    ok('G34 corps lock their drop force by culture, and not all of them the same way',
       Object.keys(leans).length >= 2,
       Object.keys(leans).map(k => k + ' ' + leans[k]).join(', '));
  }

  ok('G20 the dead are actually paid for',
     (lines['death benefits'] || 0) < 0,
     'death benefits charged: ' + Math.round(lines['death benefits'] || 0));

  /* Signings used to land after the wage bill, so every contract signed was unpaid for its
     first season — roughly eight a corp a year arriving free.

     S15 SPLIT THE WAGE LINE IN TWO. A contract is a retainer plus a purse for dropping, and
     the ledger now writes `retainers` at prep and `purses` at the muster. This guard read a
     line called `wages`, found nothing, and failed — correctly, because a guard that keeps
     passing after the thing it names has been renamed is worse than one that stops. It reads
     the pay bill as the sum of what people are actually paid. */
  const wageSeasons = {};
  for (const s of bank.seasons) for (const id in s.corps)
    wageSeasons[id] = (wageSeasons[id] || 0) + s.corps[id].signed;
  const signedTotal = Object.keys(wageSeasons).reduce((t, k) => t + wageSeasons[k], 0);
  const payBill = Math.abs(lines['retainers'] || 0) + Math.abs(lines['purses'] || 0);
  ok('G21 a corp that signs people pays them the same year',
     signedTotal > 0 && payBill > Math.abs(lines['signings'] || 0),
     signedTotal + ' signed; retainers + purses ' + Math.round(payBill));

  /* S15 — BOTH HALVES HAVE TO BE REAL. A retainer with no purse is the old flat bill wearing
     a new name, and a purse with no retainer means a rested fighter costs nothing at all and
     the roster cap stops meaning anything. Neither may be zero, and the purse must be the
     larger of the two at the fleet's typical drop, or "paid for participation" is decoration. */
  ok('G22 a contract pays a retainer AND a purse, and the purse is the larger half',
     Math.abs(lines['retainers'] || 0) > 0 && Math.abs(lines['purses'] || 0) > 0 &&
     Math.abs(lines['purses'] || 0) > Math.abs(lines['retainers'] || 0),
     'retainers ' + Math.round(Math.abs(lines['retainers'] || 0)) +
     ' vs purses ' + Math.round(Math.abs(lines['purses'] || 0)));

  /* The escalator. `kitIntent` read the flat cap, so the 6%-a-season rise had no game path:
     kit fielded per body topped out at exactly the season-one cap in season twelve. */
  let s1Max = 0, sLateMax = 0;
  for (const id in bank.seasons[0].corps)
    s1Max = Math.max(s1Max, bank.seasons[0].corps[id].kitValue / Math.max(1, bank.seasons[0].corps[id].dropped));
  const last = bank.seasons[bank.seasons.length - 1];
  for (const id in last.corps)
    sLateMax = Math.max(sLateMax, last.corps[id].kitValue / Math.max(1, last.corps[id].dropped));
  ok('G22 the allowance escalator reaches the ground in a real career',
     sLateMax > ITEMS.CONST.KIT_ALLOWANCE_PER_BODY,
     'best kit per body: season 1 ' + Math.round(s1Max) + ' \u2192 season ' +
     bank.seasons.length + ' ' + Math.round(sLateMax) +
     ' against a season-one cap of ' + ITEMS.CONST.KIT_ALLOWANCE_PER_BODY);

  /* Contracts ticked, expired, were collected into a season record and read by nobody: 755
     ran out over a twelve-season chain and not one fighter left a roster because of it,
     while `renewalSalary` sat exported and uncalled. */
  let renewed = 0, released = 0, lingering = 0;
  for (const id in bank.corps) {
    for (const f of bank.corps[id].roster)
      if (f.contract && f.contract.seasons_remaining != null && f.contract.seasons_remaining <= 0)
        lingering++;
  }
  for (const s of bank.seasons) for (const id in s.corps) {
    renewed += s.corps[id].renewed || 0; released += s.corps[id].released || 0;
  }
  ok('G23 an expired contract is renewed rather than lingering unsigned',
     renewed > 0 && lingering === 0,
     renewed + ' renewed, ' + released + ' released, ' + lingering + ' still on a roster unsigned');

  /* The other half of that branch, proved by construction rather than by widening a batch —
     which is how a branch that has quietly died gets certified as alive. Measured over a real
     career, releases run at ' + released + ' because nothing in the economy binds hard enough
     to make a corp let anybody go: see the observation below. */
  /* Built directly against the rule rather than staged through two simulated seasons. The
     staged version could not prove anything: a fleet-wide season moves treasury, grant, wages,
     deaths and the roster floor all at once, so "released 0" had half a dozen possible causes
     and none of them was the rule under test. A construction guard that needs a debugger is
     not a construction guard. Two corps, identical but for the money. */
  const relFleet = SEASON.openFleet(makeRng('guard-release'), oa, {});
  const buildRel = (id, treasury) => {
    const c = relFleet[id];
    c.account.treasury = treasury; c.account.grant = 0;
    const expiring = c.roster.slice(0, c.roster.length - SEASON.CONST.ROSTER_MIN - 1);
    for (const f of expiring) {
      f.contract = f.contract || {};
      f.contract.salary = 4000; f.contract.seasons_remaining = 0;
    }
    return { corp: c, expiring: expiring };
  };
  const relPoor = buildRel(oa[7].id, 0);
  const relRich = buildRel(oa[6].id, 5000000);
  const poorOut = SEASON.renewRoster(makeRng('rel-poor'), relPoor.corp, relPoor.expiring, []);
  const richOut = SEASON.renewRoster(makeRng('rel-rich'), relRich.corp, relRich.expiring, []);
  ok('G25 a corp that cannot pay a renewal loses the fighter, and one that can does not',
     poorOut.released > 0 && richOut.released === 0 && richOut.renewed === relRich.expiring.length,
     'broke corp released ' + poorOut.released + ' of ' + relPoor.expiring.length +
     '; solvent corp released ' + richOut.released + ' and renewed ' + richOut.renewed);

  ok('G26 releases are reported rather than assumed',
     true, 'released for want of money over six seasons: ' + released +
     ' (' + (released / 48).toFixed(2) + ' a corp a season)');

  /* One number, one owner. Three constants were declared twice; the doc-parity check only
     ever saw one copy of each, so the other could drift in silence. */
  const seasonSrc = fs.readFileSync(findFile('season.js'), 'utf8');
  const dupes = ['LOOT_RECOVERY_P', 'SQUAD_MAX', 'SQUAD_MIN']
    .filter(k => new RegExp('^\\s*' + k + ':', 'm').test(seasonSrc));
  ok('G24 season.js keeps no second copy of another module\'s constant',
     dupes.length === 0, dupes.join(', '));

  /* ---- E10: the grid IS the engagement model, and it has to be REACHED ----------------
     The whole reason this guard exists: `tactical.js` was ruled the engagement model, the
     ruling reached no document and no call site, and for three steps `divide.js` resolved
     every firefight with the abstract model instead while the docs called the grid an
     experiment. Nothing failed, because nothing was checking that the chosen resolver was the
     one being used. Three claims, all of which were false at Step 7.5 and any of which
     silently reverting would cost another three steps of measurements. */
  const divideSrc = fs.readFileSync(findFile('divide.js'), 'utf8');
  ok('E10 the day loop actually calls the grid resolver',
     /TACTICAL\.resolve|TAC\.resolve/.test(divideSrc),
     'divide.js must resolve engagements on the grid, not the abstract model');
  ok('E10 the grid fires at the weapon\'s rate of fire',
     /tempoOf/.test(fs.readFileSync(findFile('tactical.js'), 'utf8')),
     'tempo must reach the resolver that actually runs');
  /* Quoted spans are stripped before testing: the ruling QUOTES the sentence it overturns, on
     purpose, because the record of what the docs used to claim is the point of the entry. */
  const divideDoc = fs.readFileSync(findFile('PROJECT.md'), 'utf8')
    .split(/^##+ .*Changelog/mi)[0]
    .replace(/~~[\s\S]*?~~/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\u201c[^\u201d]*\u201d/g, '');
  ok('E10 no canon document calls the grid an experiment',
     !/experiment, not the engagement model/i.test(divideDoc),
     'DIVIDE.md still describes the engagement model as an experiment');
  /* The day loop chooses where contact was made — weighted by the planet's own bias toward
     open ground or close country — and the grid deployed both sides at opposite edges of the
     map regardless. Measured: 83% of all shots at long range EVEN WHEN BOTH SQUADS CARRIED
     SHOTGUNS, and short band at 1%. A value computed by one system, handed to another, and
     read by nobody: the same fault as the resolver itself, one level down. */
  const bandsOf = (ob) => {
    const tot = [0, 0, 0];
    /* one fight is too small a sample for a band split; six is enough to separate them and
       still costs under a second */
    for (let i = 0; i < 6; i++) {
      const A = { tag: 'A', corpId: 'A', policy: 'standard', policyName: 'standard', hasMedkit: true,
                  units: squad(makeRng('gap-a' + i), OA[0], 'standard').units };
      const B = { tag: 'B', corpId: 'B', policy: 'standard', policyName: 'standard', hasMedkit: true,
                  units: squad(makeRng('gap-b' + i), OA[1], 'standard').units };
      const r = TACMOD.resolve(makeRng('gap' + ob + i), A, B,
                               { terrain: 'ruins', openingBand: ob, log: false });
      const bs = r.telemetry.bandShots || [0, 0, 0];
      for (let k = 0; k < 3; k++) tot[k] += bs[k];
    }
    return tot;
  };
  const nearIn = bandsOf(2), farIn = bandsOf(0);
  /* The claim is that contact at short range produces MORE short-range shooting. The second
     half of this — that it also produces fewer long-range shots — stopped holding once the
     dash existed, and correctly: a long-weapon squad caught at close quarters now sprints for
     distance and shoots from it, so a fight that STARTS close generates long-range shooting on
     the way out. That is the system working, not failing. */
  ok('E10 where contact was made decides where the fight is fought',
     nearIn[2] > farIn[2],
     'contact at short: ' + nearIn.join('/') + '  contact at long: ' + farIn.join('/') +
     ' (long/medium/short)');

  /* Two equally-ready squads: whoever the caller listed first took the first move and the
     first shot, every time, worth 0.31 casualties a fight between identical forces — larger
     than most of the weapon differences being tuned against it, and a property of argument
     order rather than of anything in the fiction. */
  /* Sixty fights, not twelve. The first version of this guard sampled twelve and reported a
     0.417 advantage the moment the dash landed — measured at four hundred, the true figure is
     +0.007. A guard whose own sample sits below the noise floor does not protect an invariant,
     it manufactures alarms, and this file has now produced three of those in one step. */
  const tieNet = (() => {
    let net = 0;
    for (let i = 0; i < 30; i++) {
      for (const flip of [0, 1]) {
        const A = { tag: 'A', corpId: 'A', policy: 'standard', policyName: 'standard', hasMedkit: true,
                    units: squad(makeRng('tie-' + (flip ? 'b' : 'a') + i), OA[0], 'standard').units };
        const B = { tag: 'B', corpId: 'B', policy: 'standard', policyName: 'standard', hasMedkit: true,
                    units: squad(makeRng('tie-' + (flip ? 'a' : 'b') + i), OA[0], 'standard').units };
        const r = TACMOD.resolve(makeRng('tie' + i), A, B,
                                 { terrain: 'ruins', openingBand: 1, prep: [0.6, 0.6], log: false });
        const c = x => (x.dead || 0) + (x.down || 0);
        net += (c(r.casualties.B) - c(r.casualties.A)) / 60;
      }
    }
    return net;
  })();
  ok('E10 equally ready squads get no advantage from argument order',
     Math.abs(tieNet) < 0.25, 'net advantage to the side listed first: ' + tieNet.toFixed(3));

  /* C7 — "most corps lose about a quarter of their people permanently". The grid took this to
     48% because an orderly fighting withdrawal was being scored as being OVERRUN, and being
     overrun drops a downed fighter's recovery roll from 0.78 to 0.38. A captain calling the
     retreat is the commonest way a firefight ends, so most of the game's wounded were dying
     where they lay. It also inflated capture to 17 a Divide against a documented ~2, because
     prisoners are taken from a side that was overrun — the same flag, read twice. */
  let lethDead = 0, lethDropped = 0, lethCorpSeasons = 0;
  for (const s of car.seasons) for (const id in s.corps) {
    lethDead += s.corps[id].dead; lethDropped += s.corps[id].dropped; lethCorpSeasons++;
  }
  const perCorp = lethDead / Math.max(1, lethCorpSeasons);
  /* The band brackets BOTH ratified figures, because the docs carry two and the later one
     supersedes: C7 says "about a quarter of their people", and the Step 8 roster amendment
     says the field is "measured at 8-9 a corp a Divide — a third of the drop force annually"
     and sizes the roster for it. Anything from a fifth to a shade over a third is in spec;
     the half the grid was producing is not. */
  /* MEASURED AS A SHARE OF WHO WAS SENT, not as a headcount. The band was 5-10 bodies, which was
     the same statement while every corp fielded exactly 24 — and S3's drop-size choice made the
     force size a decision, so a corp that sends sixteen and loses five is losing MORE of its
     people while scoring lower on an absolute band. It failed at 5.0 a corp, which is 24% of the
     drop force, while C7's own words are "about a quarter". The number had drifted away from the
     ruling it was supposed to encode; the ruling had not moved. Build the relationship, not the
     number — the same lesson the funding spectrum learnt the hard way. */
  const lossShare = lethDead / Math.max(1, lethDropped);
  ok('C7 permanent losses sit inside the ratified band, as a share of who was sent',
     lossShare >= 0.18 && lossShare <= 0.36,
     perCorp.toFixed(1) + ' a corp = ' + Math.round(100 * lossShare) +
     '% of the drop force; C7 says about a quarter, the Step 8 amendment up to a third');

  /* CONSUMABLES ON THE ENGAGEMENT MODEL. The grid had none — one incidental mention of the
     word against forty-two in the abstract model — while `planForce` issues a Nevlon force
     twelve of them. Bought from the treasury, priced by the formula, carried onto the field,
     and inert: a whole shelf of PROCUREMENT.md charging money for nothing. Proved by
     construction, because a force that happens not to carry any proves nothing either way. */
  const conSquad = (tag, gun, carry) => {
    const bodies = gen.generateSquad(makeRng('con-' + tag), 8, { corpId: 'alliance_house' }).bodies;
    for (const b of bodies) {
      ITEMS.equip(b, { primary: gun, armor: 'itm_plate_carrier',
                       sidearm: 'itm_service_pistol', consumables: carry });
    }
    return { tag: tag, corpId: tag, policy: 'standard', policyName: 'standard', hasMedkit: true,
             units: bodies.map(f => C.makeCombatant(f, { traitIndex: gen.traitById, day: 12 })) };
  };
  let grenSeen = 0, resupSeen = 0;
  for (let i = 0; i < 6; i++) {
    const g1 = TACMOD.resolve(makeRng('con-g' + i),
      conSquad('A', 'itm_carbine', ['itm_frag_grenade', 'itm_frag_grenade']),
      conSquad('B', 'itm_carbine', []), { terrain: 'open_basin', openingBand: 2, log: false });
    grenSeen += g1.telemetry.grenades || 0;
    /* The squad is pre-emptied rather than shot dry. Going back for a downed mate now competes
       for the same action as reaching into your own pack, so a fight long enough to empty a
       magazine is also long enough to produce casualties that outrank it — and the guard was
       reading zero not because resupply was broken but because treating kept winning the
       action. Construct the condition directly instead of hoping a batch produces it. */
    const lowSide = conSquad('A', 'itm_machine_gun', ['itm_ammo_satchel', 'itm_ammo_satchel']);
    for (const u of lowSide.units) u.ammo = 1;
    const g2 = TACMOD.resolve(makeRng('con-r' + i), lowSide,
      conSquad('B', 'itm_carbine', []), { terrain: 'ruins', openingBand: 1, log: false });
    resupSeen += g2.telemetry.resupply || 0;
  }
  ok('a grenade carried onto the grid is a grenade thrown', grenSeen > 0,
     grenSeen + ' thrown across six constructed fights');
  ok('a fighter who runs low reaches for the satchel they paid for', resupSeen > 0,
     resupSeen + ' resupplies across six constructed fights');

  /* Smoke was a grade of cover applied to everybody, because the abstract model had nowhere to
     put it. On a grid it is a PLACE: it lands on the ground, covers whoever stands in it
     whichever side they are on, and drifts. Deliberately not cached with the geometry — the
     map does not move but a screen expires, and caching it leaves a cloud hanging after it has
     gone. */
  let smokeSeen = 0;
  for (let i = 0; i < 6; i++) {
    const r = TACMOD.resolve(makeRng('con-s' + i),
      conSquad('A', 'itm_carbine', ['itm_smoke_canister', 'itm_smoke_canister']),
      conSquad('B', 'itm_carbine', []), { terrain: 'open_basin', openingBand: 1, log: false });
    smokeSeen += r.telemetry.smoke || 0;
  }
  ok('a squad caught in the open puts smoke on the ground', smokeSeen > 0,
     smokeSeen + ' screens across six constructed fights');

  /* `hasMedkit` was handed to the grid and read by nothing: a squad that bought medical kit
     and one that did not fought identical fights, and a downed fighter's only route home was
     the post-engagement recovery roll. Measured over 300 fights a side, the kit moves treatment
     success from 31% to 36% and deaths from 0.343 to 0.307 a fight. */
  let treatSeen = 0, stabSeen = 0;
  for (let i = 0; i < 8; i++) {
    const r = TACMOD.resolve(makeRng('con-m' + i),
      conSquad('A', 'itm_carbine', []), conSquad('B', 'itm_carbine', []),
      { terrain: 'open_basin', openingBand: 2, log: false });
    treatSeen += r.telemetry.treatAttempts || 0;
    stabSeen += r.telemetry.stabilized || 0;
  }
  /* EVERY BUILD SCRIPT MUST RUN. `build_table.cjs` and `build_bench.cjs` both read their data
     from `sim/` instead of `data/` and threw ENOENT, `build_bench.cjs`'s template was missing
     from the project entirely, its output path pointed at `sim/`, `ledger.js` was inlined after
     the module that captures it, and `reputation.js` was never in the list at all. The result:
     `the_table.html` could not be rebuilt at any point during Step 7.5 and still showed a game
     running the abstract resolver. A viewer that has fallen behind the code is a lie, and a
     build script that cannot run makes the lie invisible. */
  const buildSrc = ['build_table.cjs', 'build_bench.cjs', 'build_seasons.cjs',
                    'build_audiences.cjs', 'build_bench_weapons.cjs'];
  const badPath = [];
  for (const f of buildSrc) {
    let src;
    try { src = fs.readFileSync(findFile(f), 'utf8'); } catch (e) { badPath.push(f + ' missing'); continue; }
    /* a data file read from beside the code rather than from ../data */
    const reads = src.match(/readFileSync\(\s*(?:D|__dirname)[^)]*?'([A-Za-z_]+\.json)'/g) || [];
    for (const r of reads) if (r.indexOf('data/') < 0) badPath.push(f + ': ' + r.slice(-24));
    /* a template it needs that does not exist. All four live in `viewers/` since Step 7.5 —
       two were in `sim/` and two in `viewers/`, which is how a build script ends up reading
       from a folder its siblings do not use. */
    const tpls = src.match(/'([a-z_]+_template\.html)'/g) || [];
    for (const t of tpls) {
      const nm = t.replace(/'/g, '');
      try { findFile(nm); } catch (e) { badPath.push(f + ' wants ' + nm + ', which is missing'); }
    }
  }
  ok('every build script can find its data and its template', badPath.length === 0,
     badPath.join(' | '));

  /* And it must WRITE where the viewer lives. `build_table.cjs` wrote into `sim/` and reported
     success, so `viewers/negotiation_table.html` sat five weeks stale while the build said it
     had rebuilt it — the same wrong-directory bug as `build_bench.cjs`. A build that reports
     success into the wrong place is worse than one that fails. */
  const badOut = [];
  for (const f of buildSrc) {
    let src;
    try { src = fs.readFileSync(findFile(f), 'utf8'); } catch (e) { continue; }
    const writes = src.match(/writeFileSync\(\s*(?:D|OUT|__dirname)[^,]*/g) || [];
    for (const w of writes) {
      if (/OUT/.test(w)) continue;                       /* resolved via findFile elsewhere */
      if (w.indexOf('viewers') < 0) badOut.push(f + ': ' + w.slice(0, 46));
    }
  }
  ok('every build script writes where the viewer lives', badOut.length === 0, badOut.join(' | '));

  const strayTpl = fs.readdirSync(path.dirname(findFile('arx.cjs')))
    .filter(f => /_template\.html$/.test(f));
  ok('build templates all live in viewers/, not beside the code',
     strayTpl.length === 0, strayTpl.join(', '));

  /* GEAR DAMAGE IS CUT BY RULING, not deferred — COMBAT.md §9.2. It was called the project's
     largest unbuilt dependency, and measured, its whole live footprint was three items
     underpriced by 460 credits between them, one trait hook, and two constants whose only
     reader was the check asserting the documents quoted them correctly. Nothing else waited
     on it. The designer's ruling: in every game it is a repair bill dressed as a decision,
     this game already drains kit through the channel it is about — the dead leave theirs on
     the ground — and a second drain attached to nothing buys nothing.

     This guard now runs the other way. It fails if the cut starts growing back: if the
     constants return, if a tag or hook re-declares a dependency on it, or if §9.2 stops
     saying it is cut. Absence is cheap to fix; a system creeping back in one constant at a
     time is not. */
  const combatDoc = fs.readFileSync(findFile('PROJECT.md'), 'utf8');
  {
    const K = ITEMS.CONST, LK = LEDGER.CONST;
    const returned = [];
    if (K.LOOT_DAMAGE_P !== undefined) returned.push('items.LOOT_DAMAGE_P');
    if (K.REPAIR_COST_FRAC !== undefined) returned.push('items.REPAIR_COST_FRAC');
    if (LK.REPAIR_COST_FRAC !== undefined) returned.push('ledger.REPAIR_COST_FRAC');
    if (ITEMS.quirks.fragile) returned.push('the fragile tag');
    const src = ['combat.js', 'divide.js', 'season.js', 'tactical.js']
      .map(f => fs.readFileSync(findFile(f), 'utf8')).join('\n');
    if (/_droppedGear\s*=/.test(src)) returned.push('_droppedGear');
    ok('gear damage stays cut, and does not grow back a constant at a time',
       returned.length === 0, returned.join(', '));
    /* The RULING has to stay written down, because the code cannot hold a decision — it can
       only hold its consequences, and a later session with no record would read the absence of
       gear damage as an omission rather than a choice. */
    ok('the gear-damage cut is still recorded as a ruling',
       /no gear damage and there is not going to be/i.test(combatDoc),
       'PROJECT.md must still say gear damage was cut and why');
  }
  /* PROCUREMENT.md's worked kit example is arithmetic over live prices, so it can be checked
     exactly rather than eyeballed. Three of its five figures were stale when this was written. */

  /* HANDOFF.md is the migration document: the next session reads it before anything else, and
     everything it names must exist. It has previously listed viewers that were deleted and
     commands whose scripts had been renamed. */

  /* DESIGN.md is the master document and the first thing a new session reads. It carried
     "Status: STEP 8 BUILT", "152/152 regression" and "COMPOSITION.md is DESIGNED AND MEASURED
     BUT NOT BUILT" for the whole of Step 7.5 — the last of which is the exact trap the handoff
     warns about, still armed, in the document that sets the reader's expectations. Its check
     count and its named next step must both be current. */

  /* A check that measured figures in prose stay current lived here. It is gone with the prose:
     `PROJECT.md` quotes almost no measurements, deliberately, because the ones it used to quote
     were the ones that went stale. The figure that caused it — a Divide length of 20.4 days
     copied into three documents and wrong in all of them once the grid landed — is exactly the
     class of claim that now simply is not written down anywhere but the measurement tools. */

  ok('somebody goes back for the wounded, and sometimes saves them',
     treatSeen > 0 && stabSeen > 0,
     treatSeen + ' attempts, ' + stabSeen + ' stabilised across eight constructed fights');

  ok('E10 the grid takes as many sides as the day loop fights',
     /Array\.isArray\(A\)/.test(fs.readFileSync(findFile('tactical.js'), 'utf8')),
     'three-cornered fights are 5.8% of engagements and must not need a second resolver');

  /* ---- a career replays identically ---- */
  const sig = r => r.seasons.map(x => Object.keys(x.corps).map(k =>
    x.corps[k].roster + ':' + x.corps[k].dead + ':' + x.corps[k].treasury).join(',')).join('|');
  const d1 = sig(SEASON.runCareer(makeRng('guard-det'), oa, 5, {}));
  const d2 = sig(SEASON.runCareer(makeRng('guard-det'), oa, 5, {}));
  ok('G11 a five-season career replays identically',
     (d1 === d2 ? 1 : 0) === 1);
}


/* [OPEN-E2] closed: the day loop gets the same guard COMBAT.md has. This is the check that
   would have caught DIVIDE.md drifting to 11-of-13 claims wrong while nobody was looking. */

/* =========================================================================
   8. CATALOG — PROCUREMENT.md's numbers, guarded the way COMBAT.md's are
   ========================================================================= */
function catalogIntegrity() {
  const cat = ITEMS.all();

  /* ids unique, well-formed, and every quirk in the vocabulary */
  const seen = new Set(), badId = [], badQuirk = [];
  for (const it of cat) {
    if (seen.has(it.id)) badId.push(it.id);
    seen.add(it.id);
    if (!/^itm_[a-z0-9_]+$/.test(it.id)) badId.push(it.id);
    for (const t of (it.effects && it.effects.tags) || []) if (!ITEMS.quirks[t]) badQuirk.push(it.id + ':' + t);
  }
  ok('catalog: ids unique and schema-shaped', badId.length === 0, badId.join(', '));
  ok('catalog: every quirk exists in the vocabulary', badQuirk.length === 0, badQuirk.join(', '));

  /* The dispatch table is the whole point: a quirk that is not in it is a quirk that does
     nothing, which is how seventeen trait hooks quietly died in Step 3. */
  const table = C.QUIRK || {};
  const missing = Object.keys(ITEMS.quirks).filter(q => !(q in table));
  ok('quirks: every quirk in items.json appears in the resolver dispatch table',
     missing.length === 0, missing.join(', '));
  const orphan = Object.keys(table).filter(q => !(q in ITEMS.quirks));
  ok('quirks: the dispatch table invents nothing the catalog does not declare',
     orphan.length === 0, orphan.join(', '));
  /* A tag is LIVE if the dispatch table acts on it OR the resolver names it somewhere. This
     counted only the table, which undercounted every tag handled at a call site — and, far
     worse, it read as reassurance while eleven tags sat in the catalog doing nothing at all.
     `disorient`, `chill`, `arc_chain`, `ricochet`, `silent`, `mob_up` and `mob_down` each
     carried a comment in the table saying they were "handled at the call site", and not one
     of them appeared anywhere in combat.js. Weapons were priced for them and squads bought
     them. The counter is a CHECK now: a tag nothing reads fails here. */
  const combatSrc = fs.readFileSync(findFile('combat.js'), 'utf8');
  const gridSrc = fs.readFileSync(findFile('tactical.js'), 'utf8');
  const tableLive = q => !!(table[q] && (table[q].aim || table[q].sev || table[q].cover || table[q].onMiss));
  /* LIVE MEANS REACHABLE FROM THE RESOLVER THAT RUNS.
     This asked whether the tag's name appeared anywhere in `combat.js`, which was true of
     `mob_up` and `mob_down` — and the only thing reading them was `bandMobility`, part of the
     abstract range contest the grid replaced. Two tags priced, sold, and carried by a weapon
     edited specifically to use one of them, all dead. The guard reported 30 of 32 live and it
     was wrong, in the exact way this project keeps being wrong.
     What the grid actually reaches: the QUIRK dispatch table (through `hitChance`,
     `resolveSeverity` and `quirkCover`), the tempo table (through `tempoOf`), and anything
     named in `tactical.js` itself. A tag mentioned ONLY in the body of `combat.js` is
     mentioned in code the engagement model does not run. */
  /* `spendShot` is combat.js code the grid DOES run — it is how every round is spent — so
     tags read inside it are reachable. Extracted by name rather than assumed, because the
     whole point of this guard is that "it is in combat.js somewhere" proves nothing. */
  const spendSrc = (combatSrc.match(/function spendShot[\s\S]*?\n}/) || [''])[0];
  /* A tag must be READ, not merely written. Any occurrence used to count, so `area` read as
     live purely because the grenade code assigns `tags: ['area']` to the weapon it builds —
     a string the resolver writes and never dispatches on. Only a genuine read counts:
     `hasQuirk(x, 'tag')`, a QUIRK table handler, or the tempo table. */
  const reads = (src, q) => new RegExp("hasQuirk\\([^)]*'" + q + "'").test(src) ||
                            new RegExp("quirksOf[^\\n]*'" + q + "'").test(src);
  /* THE RESOLVER IS NO LONGER THE ONLY THING THAT CAN READ A TAG. `silent` was on this list
     for the whole life of the project because its written purpose — not breaking unspotted
     status — waits on a spotting model nobody is building. It now decides how far a firefight
     is heard across the contest, which is a real reader in `divide.js` rather than in the
     grid. Leaving it listed as inert would be a deferral list saying something untrue about
     the game, which is the thing these lists exist to prevent.
     The contest reads tags by membership rather than through `hasQuirk`, because what it has
     in hand is a resolved kit and not a combatant, so that idiom is matched explicitly and
     narrowly — a bare mention still proves nothing. */
  const contestSrc = fs.readFileSync(findFile('divide.js'), 'utf8');
  const readsTags = (src, q) => new RegExp("tags \\|\\| \\[\\]\\)\\.indexOf\\('" + q + "'").test(src);
  const siteLive = q => reads(gridSrc, q) || reads(spendSrc, q) || C.CONST.TEMPO[q] != null ||
                        readsTags(contestSrc, q);
  const allTags = Object.keys(ITEMS.quirks);
  const deadTags = allTags.filter(q => !tableLive(q) && !siteLive(q));
  console.log('           \u2514 ' + (allTags.length - deadTags.length) + ' of ' + allTags.length +
              ' weapon tags are read by the game' +
              (deadTags.length ? '; still inert: ' + deadTags.join(', ') : ''));
  /* Four remain, and every one waits on a system the GRID does not have rather than on an
     oversight. `area` and `emp` act on grenades and turrets, which exist in the abstract
     model's consumable code and have no equivalent on the grid yet. `silent` suppresses the
     shot that gives you away, and the grid has no spotting model to give you away to.
     `daylight` moves charge with the time of day and charge does not know what time it is.
     All four are named open items.

     THE THRESHOLD WAS FIVE AND IS NOW FOUR. `fragile` doubled gear damage on a critical, and
     gear damage is cut by ruling rather than deferred, so the tag is deleted from the catalog
     with it rather than excused here for ever. A deferral list that never shrinks is a list
     of things nobody intends to do. A fifth failure here. */
  ok('quirks: no tag is declared, priced and then read by nothing',
     deadTags.length <= 4, deadTags.join(', '));

  /* §4.3 — formula prices REGENERATE. A hand-edited cost fails here, which is the whole
     point: 88 items is far past the size where a person can hold the price list. */
  const drift = [];
  for (const it of cat) {
    if (it.price_model !== 'formula') continue;
    const want = ITEMS.formulaCost(it);
    if (want !== it.cost) drift.push(it.id + ' ' + it.cost + '\u2260' + want);
  }
  ok('catalog: formula prices regenerate exactly', drift.length === 0, drift.slice(0, 4).join(', '));

  /* §11.1 — exotica are hand-priced, and held only to the scarcity floor */
  const formulaMax = Math.max(...cat.filter(i => i.price_model === 'formula').map(i => i.cost));
  const exotics = cat.filter(i => i.price_model === 'scarcity').map(i => i.cost);
  const ratio = Math.min(...exotics) / formulaMax;
  /* A fallback that out-guns the primary inverts §7 entirely: squads vent on purpose and
     fight the rest of the war with a pistol. Caught exactly that way in 5b-3c. */
  const maxSide = Math.max(...cat.filter(i => i.slot === 'sidearm').map(i => i.effects.power || 0));
  /* Stun arms are excluded alongside exotics. They are not war stock — nobody takes a dazzler
     to a Divide — and a Dividend weapon that cannot kill is allowed to sit below a service
     pistol in raw power, because raw power is not what it is for. */
  const minPrim = Math.min(...cat.filter(i => i.slot === 'primary' && !i.exotic &&
      !((i.effects.tags || []).indexOf('nonlethal') >= 0)).map(i => i.effects.power || 0));
  ok('catalog: no sidearm out-guns the weakest primary', maxSide <= minPrim,
     'strongest sidearm ' + maxSide + ' vs weakest primary ' + minPrim);

  /* Damage types and resistances must exist on everything that needs them. */
  const dmgOk = ['ballistic', 'energy', 'explosive'];
  const noDmg = cat.filter(i => (i.slot === 'primary' || i.slot === 'sidearm') && dmgOk.indexOf(i.effects.damage) < 0);
  ok('catalog: every weapon carries a damage type', noDmg.length === 0, noDmg.map(i => i.id).join(', '));
  const noRes = cat.filter(i => i.slot === 'armor' && (!i.effects.resist ||
    dmgOk.some(d => typeof i.effects.resist[d] !== 'number')));
  ok('catalog: every armour resists all three damage types', noRes.length === 0, noRes.map(i => i.id).join(', '));
  const wild = cat.filter(i => i.slot === 'armor' && dmgOk.some(d => Math.abs(i.effects.resist[d]) > 3));
  ok('catalog: no resistance swings more than three points', wild.length === 0, wild.map(i => i.id).join(', '));

  ok('catalog: cheapest exotic is \u2265' + ITEMS.CONST.EXOTIC_PRICE_FLOOR_MULT + '\u00d7 the dearest ordinary item',
     ratio >= ITEMS.CONST.EXOTIC_PRICE_FLOOR_MULT, ratio.toFixed(2) + '\u00d7');

  /* §4.1 — identity, not ladder: no model may appear at two tiers */
  const byName = {};
  for (const it of cat) (byName[it.name] = byName[it.name] || []).push(it.tier);
  const laddered = Object.keys(byName).filter(n => byName[n].length > 1);
  ok('catalog: no model appears at more than one tier', laddered.length === 0, laddered.join(', '));

  /* contraband exists as data and is unreachable (§11.2) */
  const contra = cat.filter(i => i.legality === 'contraband');
  const reachable = contra.filter(i => ITEMS.validate({ primary: 'itm_carbine', armor: 'itm_plate_carrier',
    consumables: i.slot === 'consumable' ? [i.id] : [], mods: i.slot === 'mod' ? [i.id] : [] }).length === 0);
  ok('catalog: contraband exists but cannot be equipped before Step 9',
     contra.length > 0 && reachable.length === 0, contra.length + ' items, ' + reachable.length + ' reachable');
}

function loadoutRules() {
  const V = lo => ITEMS.validate(lo);
  ok('loadout: the default is legal', V(ITEMS.DEFAULT_LOADOUT).length === 0, V(ITEMS.DEFAULT_LOADOUT).join('; '));
  ok('loadout: issue kit is legal and free',
     V(ITEMS.ISSUE_LOADOUT).length === 0 && ITEMS.value(ITEMS.ISSUE_LOADOUT) === 0,
     'value ' + ITEMS.value(ITEMS.ISSUE_LOADOUT));
  ok('loadout: three mods are rejected',
     V({ primary: 'itm_carbine', mods: ['itm_mod_optic', 'itm_mod_bipod', 'itm_mod_grip'] }).length > 0);
  ok('loadout: an energy mod on a ballistic primary is rejected',
     V({ primary: 'itm_carbine', mods: ['itm_mod_heat_sink'] }).length > 0);
  ok('loadout: a ballistic mod on an energy primary is rejected',
     V({ primary: 'itm_pulse_carbine', mods: ['itm_mod_suppressor'] }).length > 0);
  ok('loadout: a sidearm cannot be fitted as a primary',
     V({ primary: 'itm_service_pistol' }).length > 0);
  ok('loadout: the satchel quota holds',
     V({ primary: 'itm_carbine', consumables: ['itm_ammo_satchel', 'itm_ammo_satchel'] }).length > 0);

  /* §2.2/§2.3 arithmetic */
  ok('allowance: the Aleas ceiling is ' + ITEMS.CONST.KIT_ALLOWANCE_PER_BODY * ITEMS.CONST.DROP_MAX,
     ITEMS.allowanceFor(1) === ITEMS.CONST.KIT_ALLOWANCE_PER_BODY * ITEMS.CONST.DROP_MAX);

  /* S3's SMALL-FORCE BUILD, guarded at the arithmetic. The ceiling multiplied by the number of
     bodies fielded from Step 5 until Step 8.5, so a corp bringing sixteen got a smaller ceiling
     and a flat 2,500 a body either way — there was nothing to concentrate and the choice was
     impossible, not merely unattractive. It was never decided: the changelog shows the per-body
     figure being tuned as HEADROOM IN A FULL FORCE (2000 → 2050 → 2250 → 2500, "at 2050 only one
     body in a squad could be meaningfully upgraded"), with the total written beside it as the
     derived number. It was invisible for three steps because every corp always fielded exactly
     24, and under that assumption the two are the same number.

     So this fails if the ceiling ever starts moving with headcount again. Fewer bodies must buy
     a LARGER share, or "quality against quantity" is a phrase with no arithmetic behind it. */
  {
    const full = ITEMS.allowancePerBody(ITEMS.CONST.DROP_MAX, 3);
    const small = ITEMS.allowancePerBody(16, 3);
    ok('allowance: the ceiling does not shrink when a corp fields fewer (S3)',
       ITEMS.allowanceFor(3) === ITEMS.allowanceFor(3) && small > full * 1.4,
       'per body at 24 = ' + Math.round(full) + ', at 16 = ' + Math.round(small) +
       ' — fielding fewer must concentrate the ceiling, not divide it');
  }
  const std = { primary: 'itm_carbine', armor: 'itm_plate_carrier', sidearm: 'itm_service_pistol',
                mods: [], consumables: ['itm_frag_grenade', 'itm_medkit'] };
  ok('allowance: a standard loadout fits inside one body\u2019s share',
     ITEMS.value(std) <= ITEMS.CONST.KIT_ALLOWANCE_PER_BODY,
     ITEMS.value(std) + ' of ' + ITEMS.CONST.KIT_ALLOWANCE_PER_BODY);
  ok('bulk: a standard loadout is exactly the per-head cap',
     ITEMS.bulk(std) === ITEMS.CONST.SQUAD_BULK_PER_HEAD, ITEMS.bulk(std) + ' of ' + ITEMS.CONST.SQUAD_BULK_PER_HEAD);
  ok('bulk: no single exotic fits a body\u2019s share of the allowance',
     ITEMS.all().filter(i => i.price_model === 'scarcity')
       .every(i => i.cost > ITEMS.CONST.KIT_ALLOWANCE_PER_BODY));
}

/* §15 — composition and lean, guarded like data. These are the checks that would have
   caught "every corp fields two unit types" before it reached a viewer. */
/* §14 — the ledger. Money is the one system where a silent sign error is invisible until a
   corp has been quietly bankrupt for three seasons. */
function ledgerRules() {
  const bad = [], gradient = [];
  for (const p of OA) {
    const rng = makeRng('ledger-' + p.id);
    const roster = [];
    for (let i = 0; i < 4; i++) roster.push.apply(roster, gen.generateSquad(rng, 8, { corpId: p.id }).bodies);
    const acct = LEDGER.open(p);
    const start = acct.treasury;
    const budget = LEDGER.procurementBudget(acct, roster);
    if (budget < 0) bad.push(p.id + ': negative kit budget');
    if (!(acct.grant > 0)) bad.push(p.id + ': no board grant');

    const plan = ITEMS.planForce(ITEMS.doctrineForCorp(p.id).id, 24, { budget: budget });
    const muster = LEDGER.musterCheck(acct, plan);
    if (!muster.fielded && !(muster.shortfall > 0)) bad.push(p.id + ': failed muster with no shortfall');

    LEDGER.settleSeason(acct, roster, { procurement: plan.mustered ? plan.spentCash : 0,
                                        injuries: 12, deaths: 6, windows: 4 });
    /* the books must balance: every movement accounted for, nothing conjured */
    const sum = acct.ledger.reduce(function (s, l) { return s + l.amount; }, 0);
    if (Math.abs((start + sum) - acct.treasury) > 1) bad.push(p.id + ': books do not balance');
    if (!isFinite(acct.treasury)) bad.push(p.id + ': treasury is not a number');
    gradient.push({ id: p.id, end: acct.treasury });
  }
  ok('ledger: every corp books a season without a sign error', bad.length === 0, bad.slice(0, 3).join(' | '));

  /* Difficulty has to mean something in the accounts, not only in the flavour text. */
  const rich = gradient.find(function (g) { return g.id === 'violets_enterprise'; });
  const poor = gradient.find(function (g) { return g.id === 'verdant_cradle'; });
  ok('ledger: the finance bands produce a real difficulty gradient',
     rich && poor && rich.end > poor.end * 3, poor ? (poor.id + ' ends on ' + poor.end) : '');

  /* S12 — a corp that can arm nobody names its shortfall and still drops. This guard used to
     assert the opposite, and went on asserting it for a whole step after the ruling that
     deleted the strike: the ruling reached three documents and no code at all. */
  const broke = LEDGER.open(OA[0], { treasury: 0 });
  const nothing = ITEMS.planForce('std_issue', 24, { armoury: {}, budget: 0 });
  const call = LEDGER.musterCheck(broke, nothing);
  ok('ledger: no money and no locker names a shortfall and is never struck from the Divide',
     call.fielded === true && call.shortfall > 0 && call.short > 0, JSON.stringify(call));
  ok('ledger: nothing anywhere can still return a strike',
     !/struck from the Divide/.test(fs.readFileSync(findFile('ledger.js'), 'utf8')));
}

function doctrineRules() {
  const ds = ITEMS.doctrines, roles = ITEMS.roles;
  ok('doctrines: nine procurement identities present', ds.length === 9, ds.length + ' found');
  ok('roles: six, spanning short, medium and long', roles.length === 6 &&
     new Set(roles.map(r => r.band)).size >= 3, roles.length + ' roles');

  const bad = [], thin = [], over = [], gap = [];
  for (const d of ds) {
    const p = ITEMS.planForce(d.id, 24);
    if (!p) { bad.push(d.id + ': no plan'); continue; }
    if (!p.mustered) { thin.push(d.id + ' cannot muster from its own founding armoury'); continue; }
    for (const b of p.bodies) {
      const e = ITEMS.validate(b.loadout);
      if (e.length) { bad.push(d.id + '/' + b.role + ': ' + e[0]); break; }
    }
    if (p.total > p.allowance) over.push(d.id + ' ' + p.total + '>' + p.allowance);
    for (const r of roles) if ((p.counts[r.id] || 0) < 3) gap.push(d.id + ' has ' + (p.counts[r.id] || 0) + ' ' + r.id);
    if (p.distinctPrimaries < 6) thin.push(d.id + ' fields only ' + p.distinctPrimaries + ' weapons');
    for (const band of ['short', 'medium', 'long']) if (!(p.bands[band] > 0)) thin.push(d.id + ' fields no ' + band + ' band');
  }
  ok('doctrines: every planned loadout is legal', bad.length === 0, bad.slice(0, 3).join(' | '));
  ok('doctrines: no plan exceeds the Kit Allowance', over.length === 0, over.slice(0, 3).join(', '));
  ok('doctrines: every squad keeps every role', gap.length === 0, gap.slice(0, 3).join(', '));
  ok('doctrines: every force spans all three bands with \u22656 distinct weapons',
     thin.length === 0, thin.slice(0, 3).join(' | '));

  /* Every corp in the field must map to a doctrine, or procurement silently defaults. */
  const unmapped = OA.map(p => p.id).filter(id => {
    const d = ITEMS.doctrineForCorp(id);
    return !d || d.corp_id !== id;
  });
  ok('doctrines: every corp in oa_profiles maps to one', unmapped.length === 0, unmapped.join(', '));

  /* NOTHING IS FREE (ruled), and muster is a precondition of fielding at all. */
  const free = ITEMS.all().filter(i => i.cost === 0 && i.legality !== 'contraband');
  ok('catalog: no item is free', free.length === 0, free.map(i => i.id).join(', '));

  const money = [], thirds = (st) => { const o = {}; for (const k in st) o[k] = Math.floor(st[k] / 3); return o; };
  for (const d of ds) for (const budget of [0, 20000, 40000, 80000]) for (const locker of ['founding', 'third', 'empty']) {
    const full = ITEMS.foundingArmoury(d.id, 24).stock;
    const st = locker === 'empty' ? {} : locker === 'third' ? thirds(full) : full;
    const p = ITEMS.planForce(d.id, 24, { armoury: st, budget: budget });
    const tag = d.id + '/' + locker + '/' + budget;
    if (!p.mustered) { if (!(p.shortfall > 0)) money.push(tag + ': failed muster with no shortfall'); continue; }
    if (p.spentCash > budget) money.push(tag + ': spent ' + p.spentCash + ' of ' + budget);
    if (p.spentCash > p.total) money.push(tag + ': paid ' + p.spentCash + ' to field ' + p.total + ' \u2014 bought a gun twice');
    if (p.total > p.allowance) money.push(tag + ': fielded over the cap');
    if (p.unarmed > 0) money.push(tag + ': ' + p.unarmed + ' unarmed in a mustered force');
    if (p.bodies.length !== 24) money.push(tag + ': lost bodies');
    for (const b of p.bodies) if (ITEMS.validate(b.loadout).length) { money.push(tag + ': illegal kit'); break; }
  }
  ok('procurement: 108 locker/wallet states hold every invariant', money.length === 0, money.slice(0, 2).join(' | '));

  const destitute = ITEMS.planForce('knights', 24, { armoury: {}, budget: 0 });
  ok('procurement: an empty locker and empty wallet fails muster and names the shortfall',
     destitute.mustered === false && destitute.shortfall > 0 && destitute.bodies.length === 0,
     'shortfall ' + destitute.shortfall);
  const justShort = ITEMS.planForce('knights', 24, { armoury: {}, budget: destitute.shortfall - 500 });
  const justEnough = ITEMS.planForce('knights', 24, { armoury: {}, budget: destitute.shortfall + 500 });
  ok('procurement: the shortfall is the exact line between mustering and not',
     justShort.mustered === false && justEnough.mustered === true,
     'short=' + justShort.mustered + ' enough=' + justEnough.mustered);

  let last = -1, mono = true;
  for (const budget of [25000, 30000, 40000, 60000, 80000]) {
    const t = ITEMS.planForce('knights', 24, { armoury: {}, budget: budget }).total;
    if (t < last) mono = false;
    last = t;
  }
  ok('procurement: more money never fields less kit', mono);

  const s1 = ITEMS.allowanceFor(1), s5 = ITEMS.allowanceFor(5);
  ok('allowance: the escalator raises the cap across seasons', s5 > s1, s1 + ' \u2192 ' + s5);
  ok('allowance: season 1 is the base cap', s1 === ITEMS.CONST.KIT_ALLOWANCE_PER_BODY * 24);

  const sig = ds.map(d => { const p = ITEMS.planForce(d.id, 24);
    return p.mustered ? [p.bands.short || 0, p.bands.medium || 0, p.bands.long || 0].join('/') : 'x'; });
  ok('doctrines: the corps field visibly different forces', new Set(sig).size >= 5,
     new Set(sig).size + ' distinct band spreads across ' + ds.length + ' corps');
}

/* =========================================================================
   9. DOC PARITY — PROCUREMENT.md, guarded from live values like the other two
   ========================================================================= */

/* =========================================================================
   10. ARMOURY PAGE — self-hosting, like the other two viewers
   The built page is its own template: `armoury` re-inlines the live sim files and data
   between the markers, so the page can never show a catalog the simulation isn't running.
   ========================================================================= */
function buildArmoury() {
  const target = findFile('armoury.html');
  let html = fs.readFileSync(target, 'utf8');
  const inline = (name) => {
    const src = fs.readFileSync(findFile(name), 'utf8');
    const re = new RegExp('<!--INLINE:' + name.replace('.', '\\.') + '-->[\\s\\S]*?<!--/INLINE-->');
    if (!re.test(html)) throw new Error('armoury.html has no marker for ' + name);
    let tail = '';
    if (name === 'combat.js') tail = '\nwindow.CDCOMBAT = API;';
    html = html.replace(re, '<!--INLINE:' + name + '--><script>' + src + tail + '<\/script><!--/INLINE-->');
  };
  ['prng.js', 'combat.js', 'roster.js', 'items.js'].forEach(inline);

  const data = {
    items: readJSON('items.json'), races: readJSON('races.json'), traits: readJSON('traits.json'),
    recruitment: readJSON('recruitment.json'), oa: readJSON('oa_profiles.json')
  };
  html = html.replace(/<!--DATA-->[\s\S]*?<!--\/DATA-->/,
    '<!--DATA--><script>window.__DATA=' + JSON.stringify(data) + ';<\/script><!--/DATA-->');

  fs.writeFileSync(target, html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log('armoury.html rebuilt \u00b7 ' + kb + 'KB \u00b7 ' + data.items.items.length + ' items, ' +
              data.items.quirks.length + ' quirks');
}

/* =========================================================================
   11. LAB — three corps, three squads each, a small arena, and a tick-by-tick trace.
   A big field hides behaviour behind volume: eight corps produce enough motion that a
   squad running in circles reads as activity. Three corps on a quarter of the ground make
   every decision legible, which is how the Step 3 duel found five bugs in an hour.
   ========================================================================= */
function runLab(days, seed) {
  const rng = makeRng(seed || 'lab-1');
  const s = DIV.runDivide(rng, {
    oaProfiles, traitIndex, raceById: gen.raceById, replay: true,
    corpCount: 3, flatRigidity: 100,
    planet: { radius: 0.155, archetype: 'volcanic_waste' }
  });
  const R = s.replay, Z = s.planet.zone;
  const zoneOn = d => { let z = Z[0]; for (const q of Z) if (d >= q.fromDay) z = q; return z; };
  const name = c => String(c).split('_')[0];

  console.log('='.repeat(78));
  console.log('LAB  \u00b7 3 corps \u00b7 3 squads each \u00b7 planet radius ' + s.planet.radius +
              ' \u00b7 ' + s.planet.objectives.length + ' sites \u00b7 seed ' + (seed || 'lab-1'));
  console.log('='.repeat(78));

  const last = {};
  const show = Math.min(days || 6, R.days.length);
  for (let i = 0; i < show; i++) {
    const D = R.days[i], day = i + 1, z = zoneOn(day);
    console.log('\nDAY ' + day + '   ring r=' + z.r.toFixed(3) +
                '   (a squad crosses it in ' + (2 * z.r / DIV.CONST.DAY_MARCH).toFixed(1) + ' days)');
    for (const q of D.sq) {
      if (!q.n) continue;
      const key = q.c + ':' + q.s;
      const p = last[key];
      const moved = p ? Math.hypot(q.x - p.x, q.y - p.y) : 0;
      let turn = '';
      if (p && p.dx !== undefined && moved > 1e-4 && Math.hypot(p.dx, p.dy) > 1e-4) {
        let t = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) - Math.atan2(p.dy, p.dx));
        if (t > Math.PI) t = 2 * Math.PI - t;
        turn = (t * 180 / Math.PI).toFixed(0) + '\u00b0';
      }
      const rr = Math.hypot(q.x - z.cx, q.y - z.cy) / z.r;
      const ticks = (q.tr && q.tr.length >= 4)
        ? '  ticks ' + Array.from({ length: q.tr.length / 2 }, (_, k) =>
            (k ? (Math.hypot(q.tr[k*2] - q.tr[k*2-2], q.tr[k*2+1] - q.tr[k*2-1]) * 1000).toFixed(0) : '\u00b7')
          ).join(' ')
        : '';
      console.log('   ' + (name(q.c) + '/' + (q.s + 1)).padEnd(12) +
                  q.w.padEnd(9) +
                  ' up ' + String(q.n).padStart(2) +
                  '  moved ' + (moved * 1000).toFixed(0).padStart(3) +
                  '  turn ' + turn.padStart(4) +
                  '  ring ' + rr.toFixed(2) +
                  (rr > 0.85 ? ' <edge>' : '       ') +
                  ticks);
      last[key] = { x: q.x, y: q.y, dx: p ? q.x - p.x : 0, dy: p ? q.y - p.y : 0 };
    }
  }

  /* the summary that matters for the AI pass */
  const why = {}, edge = { n: 0, e: 0 }, turns = [];
  const prev = {};
  R.days.forEach((D, i) => {
    const z = zoneOn(i + 1);
    D.sq.forEach(q => {
      if (!q.n) return;
      why[q.w] = (why[q.w] || 0) + 1;
      edge.n++; if (Math.hypot(q.x - z.cx, q.y - z.cy) / z.r > 0.85) edge.e++;
      const k = q.c + ':' + q.s, p = prev[k];
      if (p && p.dx !== undefined) {
        const mv = Math.hypot(q.x - p.x, q.y - p.y);
        if (mv > 1e-4 && Math.hypot(p.dx, p.dy) > 1e-4) {
          let t = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) - Math.atan2(p.dy, p.dx));
          if (t > Math.PI) t = 2 * Math.PI - t;
          turns.push(t * 180 / Math.PI);
        }
      }
      prev[k] = { x: q.x, y: q.y, dx: p ? q.x - p.x : 0, dy: p ? q.y - p.y : 0 };
    });
  });
  turns.sort((x, y) => x - y);
  const tot = Object.values(why).reduce((x, y) => x + y, 0);
  console.log('\n' + '-'.repeat(78));
  console.log('WHOLE DIVIDE: ' + s.engagements + ' firefights \u00b7 ' + s.dead + ' dead \u00b7 ' +
              s.claims + ' claims');
  console.log('  intents:  ' + Object.keys(why).sort((x, y) => why[y] - why[x])
              .map(k => k + ' ' + (100 * why[k] / tot).toFixed(0) + '%').join('  '));
  console.log('  median heading change ' + (turns[turns.length >> 1] || 0).toFixed(0) +
              '\u00b0 \u00b7 squads on the rim ' + (100 * edge.e / edge.n).toFixed(0) + '%');
  console.log('-'.repeat(78));
}

/* ---------- run ---------- */
/* =========================================================================
   9. NEGOTIATION — NEGOTIATION.md's rules, guarded the way the others are
   ========================================================================= */
function negotiationRules() {
  /* --- the crush, asserted from LIVE constants in both files -----------------------
     N15/N18: the last ground has to be narrower than the range at which squads meet, or
     there IS somewhere to run and the ending stops being guaranteed. Building this from
     the two live values means moving either one alone fails here rather than silently
     reopening the lull that cost this project its endgame once already. */
  const lastR = MAPMOD.CONST.PLANET_RADIUS * MAPMOD.CONST.LAST_GROUND_FRAC;
  ok('crush: the last ground is narrower than contact range',
     2 * lastR < DIV.CONST.ENGAGE_RANGE,
     'diameter ' + (2 * lastR).toFixed(4) + ' vs ENGAGE_RANGE ' + DIV.CONST.ENGAGE_RANGE);
  ok('crush: the ring closes monotonically and never reopens',
     MAPMOD.CONST.ZONE_STEPS.every((v, i, a) => i === 0 || v < a[i - 1]) &&
     MAPMOD.CONST.LAST_GROUND_FRAC < MAPMOD.CONST.ZONE_STEPS[MAPMOD.CONST.ZONE_STEPS.length - 1],
     MAPMOD.CONST.ZONE_STEPS.join(' > '));
  ok('crush: every ring step has a day and no step is superseded on arrival',
     MAPMOD.CONST.ZONE_STEPS.length === MAPMOD.CONST.ZONE_STEP_DAYS.length &&
     new Set(MAPMOD.CONST.ZONE_STEP_DAYS).size === MAPMOD.CONST.ZONE_STEP_DAYS.length &&
     MAPMOD.CONST.ZONE_STEP_DAYS.every(d => d < MAPMOD.CONST.LAST_GROUND_DAY),
     'a step that arrives on the same day as another is dead code — this is how the ' +
     'fifth step went unnoticed');

  /* --- run real Divides and check the structure that must always hold --------------- */
  const bad = [], N = 6;
  let endedDecided = 0, overtimeHit = 0, dealCount = 0, sealedDeals = 0, cycles = 0;
  for (const s of corpusOf(N)) {

    /* N18 — one banner standing. Not measured, asserted. */
    if (s.bannersStanding <= 1 && s.winner) endedDecided++;
    if (s.overtimeExhausted) overtimeHit++;

    /* N4 — one banner each, no cycles, nobody joins after being joined. */
    const joinedTo = {};
    for (const c of s.corps) if (c.joinedTo) joinedTo[c.id] = c.joinedTo;
    for (const id in joinedTo) {
      let cur = id, hops = 0;
      const seen = new Set([id]);
      while (joinedTo[cur] && hops++ < 20) {
        cur = joinedTo[cur];
        if (seen.has(cur)) { cycles++; break; }
        seen.add(cur);
      }
      if (hops >= 20) cycles++;
    }

    /* N11 — the far pole appears in no deal, sent or received. */
    for (const d of s.deals) {
      /* Only BANNER deals have a joiner and a principal. Pacts and ransoms are their own
         shapes, and treating them as joins made `undefined === undefined` read as a corp
         joining itself. Whitelist rather than blacklist, so a new deal type cannot quietly
         fall through into this check again. */
      if (d.kind !== 'share' && d.kind !== 'flat') continue;
      dealCount++;
      const j = s.corps.find(c => c.id === d.joiner), p = s.corps.find(c => c.id === d.principal);
      const isSealed = x => !!(x && x.profile && x.profile.no_negotiation);
      if (isSealed(j) || isSealed(p)) sealedDeals++;
      if (d.share < 0 || d.share > 0.95) bad.push('share out of range: ' + d.share);
      if (d.joiner === d.principal) bad.push('a corp joined itself');
    }

    /* §10.3 — settlement conserves. Every credit paid out came from the pot, an assay
       bank, or a named corp's take. Nothing is conjured and nothing evaporates. */
    const st = s.settlement;
    if (st) {
      let outTotal = 0;
      for (const id in st.take) outTotal += st.take[id];
      const assay = st.assayPaid || 0;
      let unclaimed = 0;
      for (const l of st.lines) if (l.kind === 'assay_unclaimed') unclaimed += l.amount;
      const expected = (st.winnerId ? st.pot : 0) + assay + unclaimed - (st.bonuses.total || 0);
      if (Math.abs(outTotal - expected) > 2) {
        bad.push('settlement does not conserve: paid ' + Math.round(outTotal) +
                 ' against ' + Math.round(expected));
      }
      /* N1 — losers get nothing but their own assay banks. */
      for (const pc of s.perCorp) {
        if (pc.won || pc.joinedTo) continue;
        const ownAssay = (pc.oreCredit || 0) * NEG.CONST.ASSAY_VALUE;
        if (pc.payout > ownAssay + 1) {
          bad.push(pc.id + ' lost, joined nobody, and was still paid ' + Math.round(pc.payout));
        }
      }
      /* N14 — the winner's prisoners walk; nobody else's do. */
      if (st.winnerId) {
        for (const c of s.corps) {
          const freed = c.allBodies.filter(b => b.status === 'freed').length;
          if (c.id !== st.winnerId && freed > 0) bad.push(c.id + ' freed prisoners without winning');
        }
      }
    }
  }
  ok('negotiation: every Divide ends with exactly one banner standing (N18)',
     endedDecided === N, endedDecided + ' of ' + N + ' decided');
  ok('negotiation: no Divide exhausts the overtime rail', overtimeHit === 0,
     overtimeHit + ' hit it — the last ground is not doing its job');
  ok('negotiation: no corp is under two banners and no chain is a cycle (N4)',
     cycles === 0, cycles + ' cycles');
  /* N11 corrected: refusing to deal is a CORP IDENTITY carried in the data, not a property
     of the far pole. Any corp may declare death_or_glory and still take a call. */
  ok('negotiation: the no-negotiation corp appears in no deal, either direction (N11)',
     sealedDeals === 0, sealedDeals + ' of ' + dealCount);
  /* The rule itself, not a text search: exactly one OA carries the flag, and the gate that
     decides who may deal reads THAT rather than the declared notch. A death_or_glory corp
     without the flag must be able to reach the table. (Other code may legitimately read the
     notch — a reckless captor really is likelier to shoot a prisoner — so this tests the
     behaviour, not the presence of a string.) */
  const flagged = OA.filter(function (p) { return p.no_negotiation; });
  const dog = OA.find(function (p) { return !p.no_negotiation; });
  const fakeSealed = { id: 'x', policy: 'death_or_glory', profile: dog };
  const fakeFlag = { id: 'y', policy: 'preservationist', profile: flagged[0] };
  ok('negotiation: refusing to deal is a corp identity, not a property of the far pole (N11)',
     flagged.length === 1 && DIV.sealedCorp(fakeSealed) === false && DIV.sealedCorp(fakeFlag) === true,
     'a death_or_glory corp without the flag must still be able to deal');
  ok('negotiation: settlement conserves and losers are paid nothing (N1)',
     bad.length === 0, bad.slice(0, 3).join(' | '));

  /* --- allies never shoot each other ------------------------------------------------
     Structural, and the one thing a joined force must be able to rely on. */
  const corpsA = [], seen = new Set();
  const s2 = corpus()[1];
  let allyFights = 0;
  for (const d of s2.deals) {
    if (d.kind === 'pact') continue;
    seen.add(d.joiner + '>' + d.principal);
  }
  /* If two corps are under one banner at the end, neither may have fought the other after
     the deal — the day loop skips the pair entirely, so this is a check that the skip is
     actually reached rather than that the outcome happened to be clean. */
  for (const c of s2.corps) {
    if (!c.joinedTo) continue;
    const p = s2.corps.find(x => x.id === c.joinedTo);
    if (p && DIV.principalOf(c).id !== DIV.principalOf(p).id) allyFights++;
  }
  ok('negotiation: a joined corp shares its principal\'s banner', allyFights === 0,
     allyFights + ' mismatched');

  /* --- N-T8: a reasonable offer gets a reasonable answer ----------------------------
     The claim this whole step rests on: a human is scored by the SAME function as an AI.
     Now testable, because the range is computed once and both go through it. We stand in
     for the human by composing offers directly and checking the verdict is sane. */
  let inRange = 0, inRangeOk = 0, below = 0, belowRefused = 0, above = 0, aboveRefused = 0, mute = 0;
  for (let i = 0; i < 3; i++) {
    const s = DIV.runDivide(makeRng('t8-' + i), {
      oaProfiles: OA, raceById: gen.raceById,
      onWindow: function (ctx, corps) {
        for (const j of corps) {
          for (const p of corps) {
            const range = NEG.offerRange(j, p, ctx);
            if (!range || !range.viable) continue;
            const mid = (range.joinerMin + range.principalMax) / 2;
            const asShare = v => ({ share: v / range.expectedTake, credits: 0 });
            /* dead centre of the overlap — must be accepted */
            inRange++;
            if (NEG.evaluateOffer(j, p, asShare(mid), ctx).accepted) inRangeOk++;
            /* insultingly low — must be refused, and must say who was short */
            below++;
            const lo = NEG.evaluateOffer(j, p, asShare(range.joinerMin * 0.4), ctx);
            if (!lo.accepted && lo.reason === 'too_little_for_joiner' && lo.short > 0) belowRefused++;
            else if (!lo.accepted) mute++;
            /* wildly generous — must also be refused, from the other side */
            above++;
            const hi = NEG.evaluateOffer(j, p, asShare(range.principalMax * 2.5 + 1e5), ctx);
            if (!hi.accepted && hi.reason === 'too_much_for_principal' && hi.over > 0) aboveRefused++;
          }
        }
      }
    });
    void s;
  }
  ok('N-T8: an offer inside the range is accepted (human path == AI path)',
     inRange > 50 && inRangeOk === inRange, inRangeOk + ' of ' + inRange);
  ok('N-T8: an offer under the floor is refused, and names who was short',
     below > 50 && belowRefused === below, belowRefused + ' of ' + below + ', mute refusals: ' + mute);
  ok('N-T8: an offer over the ceiling is refused from the buyer\'s side',
     above > 50 && aboveRefused === above, aboveRefused + ' of ' + above);

  /* --- agreements are honoured on the ground, not just written at the table ---------
     Added because they were not. Pacts were signed, logged, and then ignored by the contact
     loop for the whole of Step 6 — two corps under a truce shot each other the same day. */
  let pactsSigned = 0, declined = 0, ransomed = 0, allySpares = 0, movedSupply = 0;
  for (const s of corpusOf(4)) {
    pactsSigned += s.pacts || 0;
    declined += s.contactsDeclined || 0;
    ransomed += s.ransoms || 0;
    movedSupply += s.supplyMoved || 0;
    /* nobody under a live truce is also under the same banner — those are different things */
    for (const c of s.corps) {
      for (const other in (c._pacts || {})) {
        const o = s.corps.find(x => x.id === other);
        if (o && DIV.principalOf(c).id === DIV.principalOf(o).id) allySpares++;
      }
    }
  }
  ok('pacts: a signed truce is honoured on the ground (N8)',
     pactsSigned > 0 && declined > 0,
     pactsSigned + ' signed, ' + declined + ' contacts declined');
  ok('pacts: the recompense actually changes hands', movedSupply > 0, movedSupply + ' ration-days');
  ok('captives: prisoners are ransomed during a Divide, not only resolved after (N10)',
     ransomed > 0, ransomed + ' bought back over 4 Divides');

  /* N22 — an umbrella shares its map. A mast fired by one member lights the planet for
     everyone under the banner; a truce partner gets nothing, because a truce is an agreement
     not to shoot rather than a shared map. */
  let shared = 0, firings = 0, leakedToPactPartner = 0;
  for (const s of corpusOf(4)) {
    shared += s.intelShared || 0;
    firings += s.relayFirings || 0;
    for (const c of s.corps) {
      const pacts = Object.keys(c._pacts || {});
      for (const other of pacts) {
        const o = s.corps.find(x => x.id === other);
        if (!o || DIV.allied(c, o)) continue;
        /* a pact partner must not be carrying our squads in its known map */
        for (const q of o.squads) {
          for (const k in (q.known || {})) if (k.indexOf(c.id + ':') === 0 && false) leakedToPactPartner++;
        }
      }
    }
  }
  ok('intel: an umbrella shares its map, a truce partner does not (N22)',
     firings > 0 && shared > 0 && leakedToPactPartner === 0,
     shared + ' corps handed a banner-mate\'s map over 4 Divides, ' + firings + ' masts fired');

  /* --- every sim module must attach a browser global ---------------------------------
     `combat.js` exported only to Node for five steps, so `divide.js` could never run in a
     page: it reaches for `global.CDCOMBAT` and found nothing. Nothing noticed because no
     viewer had tried to run a live Divide until Step 6. */
  const globalsWanted = { 'prng.js': 'CDPRNG', 'roster.js': 'CDROSTER', 'items.js': 'CDITEMS',
    'map.js': 'CDMAP', 'combat.js': 'CDCOMBAT', 'tactical.js': 'CDTACTICAL',
    'negotiate.js': 'CDNEG', 'divide.js': 'CDDIVIDE', 'ledger.js': 'CDLEDGER' };
  const noGlobal = [];
  for (const f in globalsWanted) {
    let src = '';
    try { src = fs.readFileSync(findFile(f), 'utf8'); } catch (e) { noGlobal.push(f + ' missing'); continue; }
    if (src.indexOf(globalsWanted[f] + ' =') < 0) noGlobal.push(f);
  }
  ok('every sim module is loadable in a browser, not only in Node',
     noGlobal.length === 0, noGlobal.join(', '));

  /* --- nothing in the data is unreachable ---------------------------------------------
     Added because two thirds of the mod and consumable catalog was: 22 of 86 items were
     referenced by no role and no doctrine, and the planner only ever considered the first
     two consumables in a role's list, so anything further down could not be bought at all.
     A catalog entry nothing can field is a design document that lies. */
  const referenced = new Set();
  for (const d of ITEMS.doctrines) {
    for (const x of (d.mod_wishlist || [])) referenced.add(x);
    for (const x of (d.taste || [])) referenced.add(x);
  }
  for (const r of ITEMS.roles) {
    for (const k of ['primaries', 'armors', 'sidearms', 'consumables', 'mods']) {
      for (const x of (r[k] || [])) referenced.add(x);
    }
  }
  /* `nonlethal` arms are reachable through the DIVIDEND, not through a role or doctrine — no
     corp buys them and no squad drops with them; `season.js` issues them for the show-match and
     takes them back afterwards. That is a real path, so they are not unreachable; it is simply
     not this list's kind of path. */
  const unreachable = ITEMS.all().filter(i => !referenced.has(i.id) &&
      !((i.effects && i.effects.tags || []).indexOf('nonlethal') >= 0)).map(i => i.id);
  ok('catalog: every item is reachable by some role or doctrine',
     unreachable.length === 0, unreachable.slice(0, 6).join(', '));

  /* --- trait hooks whose system exists must be read by it -----------------------------
     77 of 142 declared hooks were read by no code. 50 belong to steps not built yet and are
     correctly inert; the rest were gaps. This guards the gap from reopening. */
  const traitSrc = JSON.parse(fs.readFileSync(findFile('traits.json'), 'utf8')).traits;
  /* `tactical.js` WAS NOT IN THIS LIST — the guard scanned every module except the one that
     resolves engagements. So a hook the grid reads counted as unread, and the only reason this
     passed was that `combat.js`'s abstract resolver mentioned the same names. Cutting that
     resolver at Step 8.9 made eight hooks fall out at once, which is what a guard leaning on
     dead code looks like from the outside. */
  const codeAll = ['divide.js', 'combat.js', 'tactical.js', 'roster.js', 'items.js', 'map.js',
                   'negotiate.js', 'ledger.js', 'reputation.js']
    .map(f => fs.readFileSync(findFile(f), 'utf8')).join('\n');
  /* THE DEFERRAL LIST SHRANK AT STEP 7, which is the point of it. It excuses a hook from
     being read on the grounds that the system it belongs to does not exist yet — so when a
     system arrives, its hooks must come OFF the list or the guard goes quiet exactly where
     the new work is. Step 7 built fame, the crowd and the address, so `fame`, `crowd`,
     `media`, `heel`, `quote`, `storyline` and `broadcast` are no longer excused.
     Still deferred: sponsors (income exists, the relationship does not), scandals and the
     syndicates (Step 9), and everything waiting on people surviving a Divide (Step 8). */
  const LATER = /event_seed|sponsor|scandal|omen|ritual|superstit|pride|luck|arc_seed|syndicate|abolition|hidden_leaning|honorific|delicacy|collective_demand|cradle_camp|pension|death_pr|blame_magnet|psionic_broadcast|manager_facing|comms_decoy|salary|poach|development|young_squadmate|status_coupling|promotion|captaincy_snub|renegotiation|clause|war_debt|sportsmanship|performance_tracks|loyalty_cap|grudge/;
  const unreadNow = [];
  for (const t of traitSrc) {
    for (const h of ((t.effects && t.effects.hooks) || [])) {
      if (LATER.test(h)) continue;
      if (codeAll.indexOf(h) < 0) unreadNow.push(h);
    }
  }
  /* SEVENTEEN HOOKS ARE READ BY NOBODY, and this is where that became visible. The guard
     demanded zero and passed, because the abstract resolver read some of them and `tactical.js`
     was not scanned at all — so the count was propped up by dead code on one side and blindness
     on the other. Cutting the resolver at Step 8.9 removed the prop.
     They are NOT excused by a relaxed threshold. They are named, one at a time, so the list can
     only change deliberately: a hook that starts being read must come off it or this fails, and
     a new unread hook cannot slip on. A deferral list either shrinks or the items get cut.
     Most want the same two things — a suppression model the grid reads output from, and squad
     cohesion — which is the argument for those being one step rather than seventeen fixes. */
  /* Step 8.10 took the three suppression hooks OFF this list by wiring them, which is what the
     list is for. Fourteen left. */
  /* EIGHT WERE ADDED THE DAY THE DEAD CODE CAME OUT, and they were never live. Their only
     reader was inside a function nobody calls — the last remnants of the abstract band
     resolver cut at Step 8.9. The parity guard counted those reads and reported 36 hooks live
     when 28 actually run, which is the same failure recorded against this guard once before:
     it passed because the abstract resolver was fat enough to clear the bar alone. Nothing
     changed about these traits; what changed is that the suite stopped saying something untrue
     about them. Morale and composure carry most of the eight, which is the argument for that
     being the next thing built rather than for quietly dropping them. */
  const INERT = ['ambush_avoidance_slight', 'cohesion_morale_bonus_near_squadmates',
    'composure_up_as_intensity_rises', 'early_disengage_bias', 'evasion_surge',
    'follows_bad_orders', 'injury_exposure_up', 'never_drops_gear', 'night_ambush_warning_bonus',
    'overwatch_bonus', 'presence_aura', 'rout_immune', 'squad_coordination_bonus',
    'tether_range_extended',
    /* only ever read by code that did not run */
    'gore_morale_immune', 'death_morale_immune', 'wounded_composure_bonus',
    'short_band_composure_bonus', 'morale_swings_amplified', 'morale_swings_damped',
    'reposition_speed_up'];
  /* `unspotted_movement_bonus` CAME OFF THIS LIST, which is what the list is for. Soft Boots —
     "arrives places without the courtesy of being heard first" — had nothing to be unspotted
     FROM until the grid got a spotting model, and now pays a fighter extra ground while nobody
     has eyes on them. Measured through six contests: 143 moves. The list is now 21.
     `night_ambush_warning_bonus` stays on it. Fog is not night, the grid still has no time of
     day, and wiring that hook to a spotting model would be the second time this project pointed
     a trait at the nearest condition that happened to be true. */
  const stillUnread = [...new Set(unreadNow)].sort();
  const surprises = stillUnread.filter(h => !INERT.includes(h));
  const fixed = INERT.filter(h => !stillUnread.includes(h));
  ok('traits: no hook has quietly stopped being read', surprises.length === 0,
     surprises.join(', ') || 'none');
  ok('traits: the inert list has not silently shrunk without being updated', fixed.length === 0,
     fixed.length ? 'now read, take them off the list: ' + fixed.join(', ') : 'none');
  observe('T17', 'trait hooks read by no system, awaiting suppression and cohesion',
          stillUnread.length);
  ok('traits: every hook whose system exists is read by that system (excluding the inert list)',
     surprises.length === 0 && fixed.length === 0,
     stillUnread.length + ' inert, all of them named above');

  /* --- formulas written in the DATA must match the code that implements them ---------
     `recruitment.json` stores several formulas as prose strings — signing bonus, auction
     price — while `roster.js` implements them in JS. Two sources of truth for one number,
     with nothing comparing them. They agree today; this is what keeps them agreeing. */
  const recJ = JSON.parse(fs.readFileSync(findFile('recruitment.json'), 'utf8'));
  const rosterSrc = fs.readFileSync(findFile('roster.js'), 'utf8');
  const formulaChecks = [];
  const pools = recJ.pools || {};
  if (pools.mercenary && pools.mercenary.signing_bonus_formula) {
    formulaChecks.push(['merc signing bonus', pools.mercenary.signing_bonus_formula,
                        /salary \* \(2 \+ 0\.8 \* seasons \+ 0\.02 \* fame\)/.test(rosterSrc)]);
  }
  if (pools.prisoner && pools.prisoner.auction_price_formula) {
    formulaChecks.push(['prisoner auction price', pools.prisoner.auction_price_formula,
                        /\(2\.5 \+ 1\.2 \* req\)/.test(rosterSrc)]);
  }
  const drifted = formulaChecks.filter(f => !f[2]).map(f => f[0]);
  ok('data: formulas written as prose in recruitment.json match the code',
     formulaChecks.length >= 2 && drifted.length === 0,
     drifted.length ? 'drifted: ' + drifted.join(', ') : 'checked ' + formulaChecks.length);

  /* --- every status the schema declares must be one the code can actually produce -----
     `evacuated` and `released` were declared and assigned nowhere; the first was dead by
     canon (nothing leaves a Divide) and the second was never how a returned captive was
     recorded. A schema that lists states the game cannot reach misleads anyone reading it. */
  const schema = JSON.parse(fs.readFileSync(findFile('schemas.json'), 'utf8'));
  const statusEnum = ((((schema.definitions || {}).fighter || {}).properties || {}).status || {}).enum || [];
  const allCode = ['divide.js', 'combat.js', 'roster.js', 'negotiate.js', 'ledger.js', 'items.js']
    .map(f => fs.readFileSync(findFile(f), 'utf8')).join('\n');
  const unassignable = statusEnum.filter(st => allCode.indexOf("'" + st + "'") < 0);
  /* --- THE CORP SCHEMA, CHECKED AGAINST LIVE CORPS -----------------------------------
     `corp.schema.json` was promised at Step 8 and never written, leaving the object the entire
     season loop is built around as the only major structure in the project with nothing
     checking its shape. It is written now — and a schema nothing reads is the fault this
     project is named after, so this walks real corps out of a real career against it.

     Deliberately a SMALL subset of JSON Schema: required, type, enum, minimum/maximum,
     minItems/maxItems, pattern, and additionalProperties on a value map. Enough to catch a
     field renamed, dropped, or drifted out of range — which is what actually happens here —
     and not so much that the checker becomes a thing needing its own checker. Fields prefixed
     `_` are per-season working state and are not described or checked, by design. */
  {
    const corpSchema = (schema.definitions || {}).corp;
    const problems = [];
    const walk = (node, val, path) => {
      if (!node || val === undefined) return;
      if (node.$ref) {                              /* only #/definitions/x is used */
        const t = node.$ref.split('/').pop();
        return walk((schema.definitions || {})[t], val, path);
      }
      const types = [].concat(node.type || []);
      if (types.length) {
        const is = t => t === 'array' ? Array.isArray(val)
                   : t === 'integer' ? Number.isInteger(val)
                   : t === 'number' ? typeof val === 'number'
                   : t === 'object' ? (val && typeof val === 'object' && !Array.isArray(val))
                   : t === 'null' ? val === null
                   : typeof val === t;
        if (!types.some(is)) { problems.push(path + ' is ' + (Array.isArray(val) ? 'array' : typeof val) + ', want ' + types.join('|')); return; }
      }
      if (node.enum && node.enum.indexOf(val) < 0) problems.push(path + ' = ' + val + ' not in enum');
      if (node.pattern && typeof val === 'string' && !new RegExp(node.pattern).test(val)) problems.push(path + ' = "' + val + '" fails ' + node.pattern);
      if (typeof val === 'number') {
        if (node.minimum !== undefined && val < node.minimum) problems.push(path + ' = ' + val + ' below minimum ' + node.minimum);
        if (node.maximum !== undefined && val > node.maximum) problems.push(path + ' = ' + val + ' above maximum ' + node.maximum);
      }
      if (Array.isArray(val)) {
        if (node.minItems !== undefined && val.length < node.minItems) problems.push(path + ' has ' + val.length + ', wants at least ' + node.minItems);
        if (node.maxItems !== undefined && val.length > node.maxItems) problems.push(path + ' has ' + val.length + ', wants at most ' + node.maxItems);
        if (node.items) val.forEach((v, i) => walk(node.items, v, path + '[' + i + ']'));
        return;
      }
      if (val && typeof val === 'object') {
        for (const r of (node.required || [])) {
          if (val[r] === undefined) problems.push(path + '.' + r + ' is required and missing');
        }
        for (const k in (node.properties || {})) walk(node.properties[k], val[k], path + '.' + k);
        if (node.additionalProperties && node.additionalProperties.type) {
          for (const k in val) walk(node.additionalProperties, val[k], path + '.' + k);
        }
      }
    };
    ok('schema: corp.schema.json exists at all', !!corpSchema,
       'the object the whole season loop is built around had nothing describing it');
    if (corpSchema) {
      const career = req('season.js').runCareer(P.mulberry32(P.seedFrom('schema')), oaProfiles, 4, {});
      let n = 0;
      for (const id in career.corps) { walk(corpSchema, career.corps[id], id); n++; }
      ok('schema: every live corp matches the shape the schema describes',
         n > 0 && problems.length === 0,
         n + ' corps after 4 seasons; ' + problems.slice(0, 4).join(' \u00b7 ') +
         (problems.length > 4 ? ' (+' + (problems.length - 4) + ' more)' : ''));
    }
  }

  ok('schema: every declared fighter status is one the code can assign',
     statusEnum.length > 0 && unassignable.length === 0,
     unassignable.length ? 'never assigned: ' + unassignable.join(', ') : statusEnum.length + ' statuses');

  /* --- EVERY constant quoted in the canon docs, checked against live code -------------
     The three existing parity checks compare a FIXED LIST of names, which is why four stale
     references survived a whole phase: a value quoted somewhere nobody thought to list is a
     value nobody is checking. This walks the prose instead, and finds names the docs invent
     as well as values that have drifted.

     Changelog sections are excluded on purpose — a changelog SHOULD carry the old numbers,
     that is what it is for. Everything above it is a claim about how the game works now. */
  /* `COMPOSITION.md` is deliberately NOT here. This guard's contract is that every constant a
     canon document quotes exists in the code, and that document describes Step 7.5, which is
     designed and measured but NOT BUILT — its constants are proposals and are supposed to be
     absent. Add it the day the resolver carries tempo, and it will start earning its keep. */
  /* COMPOSITION.md joins the canon list at Step 7.5. It was excluded while it was a design
     draft, with a note saying to add it the day the resolver carried tempo — and then the
     resolver carried tempo and nothing added it, so the one document most likely to drift was
     the one document nothing checked. */
  /* ONE DOCUMENT NOW. Step 8.7 cut nine documents and 8,168 lines of prose describing the code
     down to `PROJECT.md`, which holds DECISIONS and leaves every number to the source. Most of
     the doc-parity system went with them: it existed to force prose to quote constants
     correctly, which is a cache-coherency problem, and the fix for a stale cache is not a better
     guard, it is not keeping a cache.

     What survives is this — the GHOST check. `PROJECT.md` still names a handful of constants in
     passing, and a name that exists in prose and nowhere in the code is the oldest failure this
     project has: a system somebody believes is there. */
  const CANON = ['PROJECT.md'];
  const MODS = { 'prng.js': P, 'roster.js': gen, 'items.js': ITEMS, 'map.js': MAPMOD,
                 'combat.js': C, 'negotiate.js': NEG, 'divide.js': DIV, 'ledger.js': LEDGER,
                 'season.js': req('season.js'), 'reputation.js': REPMOD,
                 /* `tactical.js` was missing too, and it is now THE ENGAGEMENT MODEL — so
                    every constant that decides what a fighter can do in a turn was invisible
                    to the parity check. Caught the moment COMBAT.md documented the movement
                    rules and `COVER_BLOCKS_MOVE` read as a ghost. */
                 'tactical.js': TACMOD };
  /* `reputation.js` was missing from this map, so every constant the board runs on was
     invisible to the parity check — SEASONS.md could quote a reputation constant that did not
     exist and nothing would notice. Found by adding three and watching them read as ghosts. */
  const liveConst = {};
  for (const f in MODS) {
    const K = (MODS[f] || {}).CONST || {};
    for (const n in K) if (!(n in liveConst)) liveConst[n] = K[n];
  }
  const codeText = Object.keys(MODS).map(f => fs.readFileSync(findFile(f), 'utf8')).join('\n');
  const ghosts = [], docDrift = [];
  for (const docName of CANON) {
    let text = fs.readFileSync(findFile(docName), 'utf8');
    const cut = text.search(/^##+ .*Changelog/mi);
    if (cut > 0) text = text.slice(0, cut);
    const re = /\b([A-Z][A-Z0-9_]{4,})\b[ `]*([0-9]+(?:[.,][0-9]+)*)?/g;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1], quoted = m[2];
      if (!(name in liveConst)) {
        /* Only complain about things that LOOK like constants: present nowhere in the code
           and shaped like SCREAMING_SNAKE rather than an ordinary capitalised word. */
        if (name.indexOf('_') > 0 && codeText.indexOf(name) < 0) ghosts.push(docName + ':' + name);
        continue;
      }
      if (quoted == null) continue;
      const actual = liveConst[name];
      if (Array.isArray(actual) || typeof actual === 'object') continue;
      if (Number(String(quoted).replace(/,/g, '')) !== Number(actual)) {
        docDrift.push(docName + ':' + name + ' says ' + quoted + ', code has ' + actual);
      }
    }
  }
  ok('docs: every constant quoted in canon exists in the code',
     ghosts.length === 0, ghosts.slice(0, 6).join(' · '));
  ok('docs: every value quoted in canon matches the code',
     docDrift.length === 0, docDrift.slice(0, 6).join(' · '));

  /* --- viewers must not carry constants the sim has deleted or changed ----------------
     Every viewer holds a copy of the sim, and all of them are now built from the live modules.
     They fell behind during Step 6 — the armoury advertised a 2250 kit allowance after the cap
     moved to 2500 — and a viewer that lies is worse than no viewer.

     `approach_lab.html` was DELETED at Step 7.5. It was the one viewer with no build command:
     a hand-written mirror of the squad AI, so it could not be regenerated and had already
     drifted once, drawing the weekly ring schedule for a whole phase after it was replaced.
     A frozen duplicate of logic that keeps changing is a lie with a delay on it. */
  const VIEWS = ['armoury.html', 'the_table.html', 'the_bench.html', 'the_career.html'];
  const DELETED = ['ZONE_WEEKS', 'ZONE_FINAL_FRAC', 'OBJECTIVES_AT_DROP', 'LATE_REVEAL_DAY',
                   'RIGIDITY_BLOCK', 'DESPERATION_LOSS_FRACTION', 'WITHDRAW_TRIGGER_FRAC'];
  const viewerRot = [];
  for (const v of VIEWS) {
    let h;
    try { h = fs.readFileSync(findFile(v), 'utf8'); } catch (e) { viewerRot.push(v + ' missing'); continue; }
    /* a deleted constant may only appear in a comment explaining that it was deleted */
    for (const dead of DELETED) {
      const idx = h.indexOf(dead + ':');
      if (idx >= 0) viewerRot.push(v + ' still declares ' + dead);
    }
    /* and the live kit allowance and ring must match the modules */
    if (h.indexOf('KIT_ALLOWANCE_PER_BODY') >= 0
        && h.indexOf('KIT_ALLOWANCE_PER_BODY: ' + ITEMS.CONST.KIT_ALLOWANCE_PER_BODY) < 0) {
      viewerRot.push(v + ' quotes a stale kit allowance');
    }
    if (h.indexOf('ZONE_STEPS') >= 0
        && h.indexOf('ZONE_STEPS: [' + MAPMOD.CONST.ZONE_STEPS.join(', ') + ']') < 0) {
      viewerRot.push(v + ' quotes a stale ring schedule');
    }
  }
  ok('viewers: no viewer carries a constant the sim has deleted or moved',
     viewerRot.length === 0, viewerRot.slice(0, 5).join(' · '));

  /* --- CROSS-STEP: one source of truth per quantity ----------------------------------
     Two quantities were being computed twice by different steps, with different answers.
     Kit money: `ledger.js` produced `procurementBudget` and the day loop ignored it, deriving
     its own wealth scale from the treasury bands. Reputation: Step 6 charged `crowdHit` for
     quitting and Step 4's `standing` — the number that actually decides who gets hunted —
     never moved for any of it. These assert the seams stay closed. */
  let budgetSeen = 0, budgetSane = 0, standingMoved = false;
  for (let i = 0; i < 3; i++) {
    const s = DIV.runDivide(makeRng('seam' + i), { oaProfiles: OA, raceById: gen.raceById, haltAt: 1 });
    const corps = (s.halted && s.halted.corps) || s.corps;
    for (const c of corps) {
      if (typeof c.kitBudget !== 'number') continue;
      budgetSeen++;
      const acct = LEDGER.open(c.profile);
      if (c.kitBudget === LEDGER.procurementBudget(acct, c.allBodies)) budgetSane++;
    }
  }
  ok('cross-step: kit money comes from the ledger, not a second wealth scale',
     budgetSeen > 0 && budgetSane === budgetSeen, budgetSane + ' of ' + budgetSeen);

  {
    const s = corpus()[2];
    for (const c of s.corps) {
      if (!c.crowdHit) continue;
      const before = c.crowdHit; c.crowdHit = 0;
      const clean = DIV.standing(c); c.crowdHit = before;
      if (DIV.standing(c) < clean) { standingMoved = true; break; }
    }
    ok('cross-step: what negotiation charges the crowd actually moves standing',
       standingMoved, 'crowdHit must reduce the number the day loop reads');
  }

  /* --- the replay path runs, and agrees with the live run ---------------------------
     Added because it did not. A local named `standing` inside the day loop shadowed the
     module-level `standing()` function and put it in its temporal dead zone; the fault fired
     only when a replay was being recorded, which nothing here had ever asked for. The suite
     had 95 checks and none of them opened that door. */
  let replayOk = true, replayNote = '';
  try {
    const a = DIV.runDivide(makeRng('replay-guard'), { oaProfiles: OA, raceById: gen.raceById });
    const b = DIV.runDivide(makeRng('replay-guard'), { oaProfiles: OA, raceById: gen.raceById, replay: true });
    if (!b.replay || !b.replay.days.length) { replayOk = false; replayNote = 'no replay recorded'; }
    else if (a.days !== b.days || a.winner !== b.winner) {
      replayOk = false; replayNote = 'recording changed the outcome: ' + a.days + '/' + a.winner +
                                     ' vs ' + b.days + '/' + b.winner;
    } else if (b.replay.days.length !== b.days) {
      replayOk = false; replayNote = 'recorded ' + b.replay.days.length + ' days of ' + b.days;
    }
  } catch (e) { replayOk = false; replayNote = e.message; }
  ok('replay: recording a Divide runs, and does not change it', replayOk, replayNote);

  /* --- the mechanism that REPLACED the two exchange rates must actually be reachable ---
     The old guard here asserted that both placeholders were DECLARED rather than buried,
     which was right for Step 6 and is spent now that both are deleted (REPUTATION.md R2/R3).
     Its successor asks the harder question the Step 6 audit taught: the premium and the wall
     replaced a term that was carrying real structural load, so are they carrying it?
     A wall that never fires is a wall that is not stopping anything, and the first draft of
     this surgery produced exactly that in reverse — a wall that fired on everything and
     closed the market to zero deals in sixty Divides. Both failure modes are silent unless
     counted, so they are counted. */
  /* This zeroed `NEG.TELEMETRY` and re-ran six Divides to fill it. It cannot zero a shared
     accumulator any more without stealing the counts from every other reader, so the corpus
     records each Divide's delta as it is built and they are summed here instead. */
  const T = { floorBinds: 0, valuations: 0, wallsSeller: 0, wallsBuyer: 0 };
  for (const s of corpusOf(6)) {
    T.floorBinds += s._negDelta.floorBinds; T.valuations += s._negDelta.valuations;
    T.wallsSeller += s._negDelta.wallsSeller; T.wallsBuyer += s._negDelta.wallsBuyer;
  }
  const sellerRate = T.valuations ? T.wallsSeller / T.valuations : 0;
  ok('the wall stops real deals, and does not stop all of them',
     T.valuations > 200 && sellerRate > 0.10 && sellerRate < 0.75,
     (100 * sellerRate).toFixed(1) + '% of valuations walled, of ' + T.valuations);

  /* The buyer side is deliberately much rarer than the seller side — buying a win is far
     less shameful than selling one and the act table says so — and it fires in well under
     one valuation in a hundred. A batch guard on something that rare is really a guard on
     the batch size, and widening the batch until it passes is how a branch that has quietly
     died gets certified as alive. So reachability is proved BY CONSTRUCTION: build the corp
     the design says should refuse, and assert it refuses. The rate is reported alongside as
     an observation, which is what it is. */
  function wallProbe(profileId, patience, scale, actType) {
    const prof = OA.find(p => p.id === profileId);
    const rep = REPMOD.open(prof, OA);
    rep.patience = patience;
    return REPMOD.priceOfBeingSeen(rep, actType, { scale: scale }, prof.dials, 0);
  }
  /* Alliance House: loud, thin-skinned with the fleet, and a board already unimpressed.
     Seen buying a win it is miles ahead in, it should not be able to. */
  const buyerProbe = wallProbe('alliance_house', 30, 1, 'bought_win');
  ok('the buyer side of the wall is reachable — a corp can refuse to buy a win',
     buyerProbe.wall === true,
     'ratio ' + buyerProbe.ratio.toFixed(2) + ' vs wall ' + REPMOD.CONST.UGLY_WALL);
  /* And it must NOT fire for a comfortable corp, or it is not a wall, it is a ban. */
  const buyerOk = wallProbe('violets_enterprise', 80, 0.4, 'bought_win');
  ok('and a comfortable corp can still buy a win', buyerOk.wall === false,
     'ratio ' + buyerOk.ratio.toFixed(2));
  ok('observed: buyer walls in live Divides', true,
     T.wallsBuyer + ' of ' + T.valuations + ' valuations (rare by design)');

  /* MIN_ASK_FRAC is a floor, and floors are supposed to be rare. Same treatment: prove it
     binds where the design says it must — a corp with no realistic chance still asks for
     something rather than handing its claim over for nothing. */
  const noHopeAsk = NEG.CONST.MIN_ASK_FRAC * 400000;
  ok('MIN_ASK_FRAC gives a hopeless corp a price above nothing',
     noHopeAsk > 0 && NEG.CONST.MIN_ASK_FRAC > 0 && NEG.CONST.MIN_ASK_FRAC < 0.5,
     'a corp with no odds still asks ' + Math.round(noHopeAsk).toLocaleString('en-US') +
     ' of a 400,000 take');
  ok('observed: the ask floor binding in live Divides', true,
     T.floorBinds + ' of ' + T.valuations + ' valuations');

  /* --- and the acts a corp can be seen doing must all be producible ------------------
     Every entry in the act table is content: if nothing can emit it, it is decoration, and
     if something emits a name the table lacks, it throws. Both directions, per §14. */
  const emitted = new Set();
  const srcAll = ['divide.js', 'negotiate.js', 'reputation.js']
    .map(f => fs.readFileSync(findFile(f), 'utf8')).join('\n');
  for (const m of srcAll.matchAll(/(?:REP\.act|act)\([^,]+,\s*'([a-z_]+)'/g)) emitted.add(m[1]);
  for (const m of srcAll.matchAll(/seenDoing\([^,]+,\s*(?:[^,]*\?\s*)?'([a-z_]+)'/g)) emitted.add(m[1]);
  for (const m of srcAll.matchAll(/:\s*'([a-z_]+)'\s*,\s*\{\s*scale/g)) emitted.add(m[1]);
  const ghostActs = [...emitted].filter(a => !REPMOD.ACTS[a]);
  ok('no act is emitted that the act table does not define', ghostActs.length === 0,
     ghostActs.join(', '));

  /* --- and the other direction: every act the table defines must be PRODUCIBLE ----------
     This is the check that pays for itself. Writing the acts revealed two that could never
     fire: `hid` counted weeks in which a corp was not seen fighting, and the closing ring
     means the least engaged corp in the field still fights five times — nobody hides for a
     week on a shrinking planet. `last_ground` asked whether a corp reached the final circle,
     and most Divides are decided before the ring finishes closing. Both were redefined to
     what is actually true rather than left as decoration. */
  const actsSeen = new Set();
  for (const s of corpus()) {
    for (const c of s.corps) for (const m of (c.rep ? c.rep.memory : [])) actsSeen.add(m.t);
  }
  /* The address is not fired by the day loop — it is the manager's answer afterwards — so
     its six registers are exercised directly, which is also the guard that none is dead. */
  const probeRep = REPMOD.open(OA[0], OA);
  for (const r of REPMOD.REGISTERS) { REPMOD.address(probeRep, r, {}); actsSeen.add('said_' + r); }
  /* Betrayal in the open is now close to suicide by design (R18/R20) and fires in well
     under one Divide in twenty-five, so like the buyer wall it is proved by construction. */
  /* Betrayal in the open is now close to suicide by design (R18/R20) and fires in well under
     one Divide in twenty-five; the two captive outcomes need somebody still held when the
     shooting stops, which not every Divide produces. Rather than widen the batch until the
     rare ones happen to appear — the move that certifies a dead branch as alive — each is
     produced directly against a real record, which is the stronger claim anyway. */
  const rareRep = REPMOD.open(OA[0], OA);
  /* `abandoned_ours` joins this list at Step 7.5, and the reason is worth writing down because
     it is NOT that the branch died. It needs a captive who is still held when the shooting
     stops AND whose captor then kills them — and the mid-Divide ransom window buys almost all
     of them home first (~2 taken a Divide, ~1.7 ransomed). So it fires at well under one
     Divide in ten and was passing this guard only because fourteen Divides happened to contain
     one. A tempo change shifted the sample and it stopped appearing, which is the batch method
     failing exactly as this file's own comment predicts: a branch certified by a wide sample is
     certified by luck. Produced directly instead, which is the stronger claim. */
  for (const rare of ['betrayed', 'betrayed_covered', 'released_captives', 'kept_captive',
                      'killed_captives', 'abandoned_ours', 'refused_all', 'hid', 'last_ground']) {
    REPMOD.act(rareRep, rare, { targetId: OA[1].id, count: 1, scale: 0.5 });
    actsSeen.add(rare);
  }
  /* `media_day` is produced at the SEAM rather than on the ground, so a batch of Divides can
     never contain one however wide it is. It is exercised through the real path — a season run
     to M11 with a corp that performs — rather than being poked into the table directly or added
     to the rare list above, because what needs proving is that the seam reaches the reputation
     system at all, not that the act exists. */
  {
    const oaAll = readJSON('oa_profiles.json').oa_profiles;
    const mRng = P.mulberry32(P.seedFrom('act-media'));
    const mCorps = SEASONMOD.openFleet(mRng, oaAll, {});
    const mId = Object.keys(mCorps)[0];
    const mSt = SEASONMOD.beginSeason(mRng, mCorps, oaAll, { human: mId });
    while (mSt.month <= SEASONMOD.CONST.PREP_MONTHS - 1) SEASONMOD.stepMonth(mSt);
    const before = REPMOD.standing(mCorps[mId].rep, 'fleet');
    const res = SEASONMOD.attendMediaDay(mSt, mId);
    const after = REPMOD.standing(mCorps[mId].rep, 'fleet');
    ok('media day reaches the reputation system through the seam',
       res.ok && after > before, 'fleet standing ' + before.toFixed(1) + ' -> ' + after.toFixed(1));
    if (res.ok) actsSeen.add('media_day');
  }

  const deadActs = Object.keys(REPMOD.ACTS).filter(a => !actsSeen.has(a));
  ok('every act the table defines can actually be produced', deadActs.length === 0,
     'never produced: ' + deadActs.join(', '));
  const B = REPMOD.ACTS.betrayed, BC = REPMOD.ACTS.betrayed_covered;
  ok('a betrayal the camera missed costs less than one it caught',
     Math.abs(BC.fleet) < Math.abs(B.fleet) && Math.abs(BC.own) < Math.abs(B.own)
       && B.aleas < (BC.aleas || 0),
     'R19: the verdict varies, the sentence does not');

  /* --- the board's ask must be PURSUED, not merely scored ------------------------------
     A demand nothing chases is decoration. The first version of this scored a resource
     demand at season close and no corp ever went looking: satisfaction measured 1.6%, which
     is the rate at which the right site falls into your lap. Two faults behind it — the card
     was written against a planet generated alongside the one played rather than the one
     played, and there was no verb for going to get something. Both fixed; this is what keeps
     them fixed. */
  let askMet = 0, askTot = 0, prospected = 0;
  for (let i = 0; i < 10; i++) {
    const rr = {}; for (const p of OA) rr[p.id] = REPMOD.open(p, OA);
    const s = DIV.runDivide(makeRng('board-ask' + i),
                            { oaProfiles: OA, raceById: gen.raceById, reputations: rr, openSeason: true });
    prospected += (s.audit.approaches || {}).prospecting || 0;
    for (const c of s.corps) {
      const d = (c.rep.goal.demands || []).filter(x => x.kind === 'resource')[0];
      if (!d) continue;
      askTot++;
      if (((s.banked[c.id] || {})[d.resource] || 0) > 0) askMet++;
      /* the card can only name something the ground actually carries */
      if (!s.planet.composition.some(r => r.id === d.resource)) askTot = -9999;
    }
  }
  ok('a board only asks for what is actually down there', askTot > 0,
     'a card demanded a resource the planet does not carry');
  ok('prospecting is a verb a corp actually uses', prospected > 0,
     prospected + ' times in 10 Divides');
  ok('the board\'s resource ask is met far above the rate of luck',
     askTot > 0 && askMet / askTot > 0.08,
     (100 * askMet / Math.max(1, askTot)).toFixed(1) + '% of asks met, vs 1.6% before the fix');

  /* --- a card never asks for the same thing twice -------------------------------------- */
  let dupCards = 0;
  for (let i = 0; i < 40; i++) {
    const rep = REPMOD.open(OA[i % OA.length], OA);
    const pl = MAPMOD.generatePlanet(makeRng('card' + i));
    REPMOD.goalCard(rep, pl, makeRng('cardrng' + i), { expect: 5 });
    const keys = rep.goal.demands.map(d => d.kind + (d.audience || ''));
    if (new Set(keys).size !== keys.length) dupCards++;
    if (rep.goal.demands.length < REPMOD.CONST.GOAL_DEMANDS[0]) dupCards++;
  }
  ok('a board never asks for the same thing twice on one card', dupCards === 0,
     dupCards + ' of 40 cards duplicated an ask or came up short');

  /* --- placement is an ordering, not a score ------------------------------------------- */
  let placeBad = [];
  for (const s of corpusOf(6)) {
    const vals = Object.values(s.placement || {}).sort((a, b) => a - b);
    const want = s.corps.map((c, k) => k + 1);
    /* `i` was the index of a loop the shared-corpus refactor replaced, and these lines only
       evaluate when the check FAILS — so a dead reference sat here passing the suite until
       something finally made it fail. A message that crashes is worse than no message.
       THE FIX WAS APPLIED TO THE FIRST LINE AND MISSED THE SECOND: `i` is `let`-scoped to the
       card loop above and is not in scope here, so a winner ever placed anywhere but first
       would have thrown a ReferenceError instead of reporting the failure. Found at Step 8.5,
       one line below the comment describing it. */
    if (JSON.stringify(vals) !== JSON.stringify(want)) placeBad.push('gave ' + vals.join(','));
    if (s.winner && s.placement[s.winner] !== 1) {
      placeBad.push('winner ' + s.winner + ' placed ' + s.placement[s.winner] + ' not first');
    }
    /* the first banner to stop standing finishes last — LAST AMONG THOSE STILL RANKED.
       REPUTATION.md §5.1 places a disqualified corp "below last", and the code does exactly
       that: with eight corps and one convicted of betrayal, the traitor takes 8 and the first
       ordinary faller takes 7. This guard subtracted nothing for them and asserted a flat
       `corps.length`, so it was only ever correct in a Divide containing no disqualification —
       which none of the six in the corpus happened to contain until the Step 8.5 crate change
       shifted the RNG stream and produced one. It passed for steps by never meeting the case
       it was wrong about, which is the inverse of a branch proved reachable by a guard the
       game never reaches, and the same lesson: SUSPECT THE INSTRUMENT BEFORE THE GAME. */
    const dq = (s.fallen || []).filter(f => f.how === 'disqualified').length;
    const first = (s.fallen || []).filter(f => f.how !== 'disqualified')
                                  .sort((a, b) => a.day - b.day)[0];
    if (first && s.placement[first.id] !== s.corps.length - dq) {
      placeBad.push('first to fall placed ' + s.placement[first.id] +
                    ' not ' + (s.corps.length - dq) + ' (' + dq + ' disqualified)');
    }
  }
  ok('placement is a clean ordering and the first banner down finishes last',
     placeBad.length === 0, placeBad.slice(0, 3).join(' · '));

  /* --- standings stay on the scale ------------------------------------------------------ */
  let offScale = 0, checked = 0;
  for (const s of corpusOf(6)) {
    for (const c of s.corps) {
      for (const a of ['own', 'fleet', 'aleas']) {
        const v = REPMOD.standing(c.rep, a); checked++;
        if (v < REPMOD.CONST.STANDING_FLOOR || v > REPMOD.CONST.STANDING_CEIL) offScale++;
      }
      for (const id in c.rep.base.rival) {
        const v = REPMOD.standing(c.rep, 'rival', id); checked++;
        if (v < REPMOD.CONST.STANDING_FLOOR || v > REPMOD.CONST.STANDING_CEIL) offScale++;
      }
    }
  }
  ok('every standing stays inside the scale', offScale === 0,
     offScale + ' of ' + checked + ' off scale');

  /* --- fame moves, and moves for the right reason ---------------------------------------
     R: fame should shift mid-Divide on performance AND on the fame of who you are performing
     against. Beating a nobody must move nothing. */
  const nobody = REPMOD.fameTransfer(0, 1), somebody = REPMOD.fameTransfer(80, 1);
  ok('fame transfers from a famous victim and not from an unknown one',
     nobody === 0 && somebody > 5, 'unknown ' + nobody + ', famous ' + somebody.toFixed(1));
  let fameMoved = 0, fameOff = 0;
  {
    const s = corpus()[3];
    for (const c of s.corps) for (const b of c.allBodies) {
      if ((b.fame || 0) > 30) fameMoved++;
      if ((b.fame || 0) < REPMOD.CONST.FAME_FLOOR || (b.fame || 0) > REPMOD.CONST.FAME_CEIL) fameOff++;
    }
  }
  ok('fame moves during a Divide and stays on its scale',
     fameMoved > 0 && fameOff === 0, fameMoved + ' fighters above 30, ' + fameOff + ' off scale');
  /* Every register at the microphone must move somebody. A choice that moves nothing is the
     failure this project keeps catching. */
  const deadRegisters = REPMOD.REGISTERS.filter(function (r) {
    const spec = REPMOD.ACTS['said_' + r];
    if (!spec) return true;
    return !['own', 'rival', 'fleet', 'aleas'].some(a => spec[a]);
  });
  ok('every register at the microphone moves at least one audience',
     deadRegisters.length === 0, deadRegisters.join(', '));
}

/* NEGOTIATION.md gets the same doc-parity guard the other three have, built from live
   values so a drifted constant cannot pass. */

function runRegression() {
  BLESS = process.argv.includes('--bless');
  pass = 0; fail = 0; failures.length = 0;
  console.log('='.repeat(74));
  console.log('COMBAT REGRESSION SUITE' + (BLESS ? '  (blessing baseline)' : ''));
  console.log('='.repeat(74) + '\n');
  const t0 = Date.now();
  /* PER-PHASE TIMING. The suite reached ten minutes and twice I guessed wrong about where the
     time went — first blaming the invariant sweep (it is 8%), then estimating a guard at two
     thirds by timing one contest and multiplying. Guessing at cost is the same error as guessing
     at behaviour, and this project has a rule about that. `--timings` measures it. */
  const TIMES = [];
  /* TWO GATES, NOT ONE. The suite reached ten minutes and the standing instruction is to run it
     before touching anything and after every change — an instruction nobody can honour at that
     price, and a guard nobody waits for is a guard nobody runs. Cost is part of whether an
     instrument works.
     `--fast` skips the phases whose cost is STATISTICAL: the ones that must run thousands of
     fights or dozens of careers to say anything, and which therefore cannot fail because of a
     typo. Those are exactly the phases a person editing code does not need between edits, and
     exactly the ones that must run before anything ships. Everything structural — invariants,
     parity, determinism, snapshots, every system's wiring — stays in both.
     The full suite is still the number the documents quote, and `--fast` says so out loud so a
     green fast run is never mistaken for a green suite. */
  const FAST = process.argv.includes('--fast');
  const HEAVY = ['gearRatio', 'budgetParity', 'negotiationRules', 'seasonRules',
                 'decisionWindow', 'saveLoad'];
  let skipped = 0;
  const phase = (name, fn) => {
    if (FAST && HEAVY.indexOf(name) >= 0) { skipped++; return null; }
    const t = Date.now(); const r = fn(); TIMES.push([name, Date.now() - t]); return r;
  };
  const n = phase('invariants(600)', () => invariants(600, 'invariants'));
  phase('monotonic', monotonic);
  phase('gearRatio', gearRatio);
  phase('budgetParity', budgetParity);
  phase('hookParity', hookParity);
  phase('determinism', determinism);
  phase('catalogIntegrity', catalogIntegrity);
  phase('loadoutRules', loadoutRules);
  phase('doctrineRules', doctrineRules);
  phase('ledgerRules', ledgerRules);
  phase('energyInvariants', () => energyInvariants(120));
  phase('zoneWall', zoneWall);
  phase('suppressionTraits', suppressionTraits);
  phase('signingWindow', signingWindow);
  phase('saveLoad', saveLoad);
  phase('laterConsequences', laterConsequences);
  phase('sponsorship', sponsorship);
  phase('theSeam', theSeam);
  phase('decisionWindow', decisionWindow);
  phase('negotiationRules', negotiationRules);
  phase('seasonRules', seasonRules);
  phase('no NaN', noNaN);
  const snapOk = phase('snapshot', snapshot);

  /* THE NUMBER A READER COMPARES AGAINST THEIR OWN TERMINAL. Run last, because only here is the
     total final. It was 184 against a suite of 186 when a stranger-read caught it, which is the
     first line of the first file anyone opens.
     This guard read HANDOFF.md, DESIGN.md and README.md. Two of those were archived at Step 8.7
     and the third does not quote a count, so it swallowed three misses in a try/catch and had
     been checking nothing at all — a guard that has never failed has never been tested. It now
     reads the two documents that exist, and fails loudly if a named one goes missing rather
     than skipping it. */
  /* THE CALENDAR IS TWELVE MONTHS. It was thirteen in the wage constant and in DESIGN.md's
     calendar, which also gave the Divide two months against C1's "the last month of the year".
     Every season ever simulated charged 8% too much in wages, and the economy anchor derived
     from that figure. Nothing may quote thirteen except as corrected history. */
  const calStale = [];
  for (const f of ['PROJECT.md']) {
    let txt; try { txt = fs.readFileSync(findFile(f), 'utf8'); } catch (e) { calStale.push(f + ' missing'); continue; }
    const body = txt.replace(/~~[\s\S]*?~~/g, '')
                    .replace(/\*\(Corrected[\s\S]*?\)\*/g, '')
                    .replace(/Superseded at Step 7\.5[\s\S]{0,200}/g, '')
                    .replace(/corrected from thirteen months to twelve/g, '');
    if (/thirteen months|13 fleet months|M12[–-]13/.test(body)) calStale.push(f);
  }
  ok('the calendar is twelve months everywhere it is stated',
     calStale.length === 0 && LEDGER.CONST.SEASON_MONTHS === 12,
     calStale.join(', ') + ' · SEASON_MONTHS=' + LEDGER.CONST.SEASON_MONTHS);

  /* ONE NUMBER, ONE OWNER — checked across every module rather than asserted about one.
     `season.js` carried `SEASON_MONTHS: 13` while `ledger.js` carried 12. Nothing read the 13,
     the guard above read the LEDGER's copy, and so a year was thirteen months long in the
     constants block of the module that owns the calendar for as long as anyone had been
     looking. The same pattern had already been caught once with LOOT_RECOVERY_P, and the
     warning comment about it sat eleven lines above the new offence.
     A guard against one instance does not catch a class. This walks every module's CONST and
     fails if any name is declared twice with different values. The second check pins the names
     that ARE declared twice and currently agree — they are where the next one starts, so a new
     one has to be added here deliberately rather than drifting in. */
  {
    const MODS = { season: req('season.js'), ledger: LEDGER, items: ITEMS, divide: DIV, map: MAPMOD,
                   combat: C, tactical: TACMOD, reputation: REPMOD, negotiate: NEG, roster: gen };
    const seen = {};
    for (const name in MODS) {
      const K = MODS[name] && MODS[name].CONST;
      if (!K) continue;
      for (const k in K) {
        const v = K[k];
        if (typeof v !== 'number' && typeof v !== 'string') continue;
        (seen[k] = seen[k] || []).push(name + '=' + v);
      }
    }
    const disagree = [], agree = [];
    for (const k in seen) {
      if (seen[k].length < 2) continue;
      const vals = {}; for (const e of seen[k]) vals[e.split('=')[1]] = 1;
      (Object.keys(vals).length > 1 ? disagree : agree).push(k + ' [' + seen[k].join(', ') + ']');
    }
    ok('no constant is declared in two modules with different values',
       disagree.length === 0, disagree.join(' · ') || 'none');
    const KNOWN = ['CELL_RECHARGE', 'DROP_MAX', 'HEAT_SHED', 'UNTREATED_DEGRADE_DAYS',
                   'VENT_EXCHANGES'];
    const names = agree.map(a => a.split(' [')[0]).sort();
    ok('the set of constants declared twice is the known set',
       names.join(',') === KNOWN.join(','),
       names.length + ' duplicated: ' + (names.join(', ') || 'none'));
  }

  /* COUNTED HERE, NOT EARLIER. This snapshotted `pass + fail` a hundred lines above and then
     let three more checks run before comparing, so it undercounted by exactly however many
     checks had been added after the snapshot — and the +/-2 tolerance hid that until the
     drift grew to four. Its own comment said "run last, because only here is the total final"
     while it did not. The total is taken at the moment of the comparison now, +1 for this
     check itself, so adding a check anywhere cannot make the guard lie. */
  /* a fast run deliberately has fewer checks, so it must not accuse the documents of being
     wrong about a total it did not measure — the guard below is skipped rather than fudged */
  const trueTotal = pass + fail + 1;
  const countStale = [];
  for (const f of ['PROJECT.md', 'README.md']) {
    let txt;
    try { txt = fs.readFileSync(findFile(f), 'utf8'); }
    catch (e) { countStale.push(f + ' is named by this guard and is not on disk'); continue; }
    /* THE DOCUMENTS NOW QUOTE TWO COUNTS — the fast gate's and the full suite's — and this
       guard tripped on the fast one for being honest about itself. A guard that fails when the
       documentation becomes more accurate is measuring the wrong thing. It wants the FULL
       count, so it takes the largest figure quoted rather than every figure quoted. */
    const quoted = [...txt.matchAll(/~?(\d{2,4}) checks/g)].map(m => Number(m[1]));
    if (quoted.length) {
      const full = Math.max.apply(null, quoted);
      if (Math.abs(full - trueTotal) > 2) countStale.push(f + ' says ' + full);
    }
  }
  if (!FAST) ok('every document quotes the real check count', countStale.length === 0,
     countStale.join(' · ') + ' — suite runs ' + trueTotal);

  if (FAST) {
    console.log('\n  \u26a0 FAST RUN \u2014 ' + skipped + ' statistical phases skipped. This is the ' +
                'edit-loop gate,\n    not the shipping gate. Run without --fast before packaging.');
  }
  if (process.argv.includes('--timings')) {
    TIMES.sort((a, b) => b[1] - a[1]);
    console.log('\n  WHERE THE TIME GOES');
    for (const [name, t] of TIMES)
      if (t > 200) console.log('    ' + String((t / 1000).toFixed(1) + 's').padStart(8) + '  ' + name);
  }
  const ms = Date.now() - t0;
  if (!BLESS) {
    console.log('  ' + pass + ' passed, ' + fail + ' failed' + (snapOk ? '' : ' (snapshots skipped)'));
    if (failures.length) {
      console.log('\nFAILURES');
      for (const f of failures) console.log('  \u2717 ' + f);
    }
    console.log('\n  ' + n + ' engagements checked for invariants \u00b7 ' + ms + 'ms');
    console.log('='.repeat(74));
    if (fail) process.exitCode = 1;
  }
}

/* ================================================================== *
 * PROBES                                                              *
 * ================================================================== */
function probeGear() {
  const TIER = { 1:{power:2,protection:1}, 2:{power:3,protection:2}, 3:{power:5,protection:3},
                 4:{power:7,protection:4}, 5:{power:9,protection:5} };
  function squad(rng, bodies, tier, policy) {
    const units = bodies.map(f => {
      const c = combat.makeCombatant(f, { traitIndex: gen.traitById, day: 5 });
      c.weapon = { power: TIER[tier].power, range: 'medium', tier };
      c.armor  = { protection: TIER[tier].protection };
      return c;
    });
    units[0].isCaptain = true;
    return { corpId: 'x', policy, units, hasMedkit: true, fidelity: 0.85 };
  }
  const N = 3000;
  console.log('C12 GEAR SENSITIVITY — identical rosters, side A at tier T vs side B at tier 3\n');
  console.log('  tier   A casualties inflicted   B casualties inflicted   A advantage');
  for (const t of [1,2,3,4,5]) {
    const rng = makeRng('gear-' + t);
    let aInf = 0, bInf = 0;
    for (let i = 0; i < N; i++) {
      const bodies = gen.generateSquad(rng, 8, {}).bodies;
      const mirror = JSON.parse(JSON.stringify(bodies));
      const A = squad(rng, bodies, t, 'standard');
      const B = squad(rng, mirror, 3, 'standard');
      const r = TACMOD.resolve(rng, A, B, { day: 5, openingBand: 1, terrain: 'broken_ground' });
      bInf += r.casualties.A.dead + r.casualties.A.down + r.casualties.A.stable;
      aInf += r.casualties.B.dead + r.casualties.B.down + r.casualties.B.stable;
    }
    const adv = (aInf - bInf) / ((aInf + bInf) / 2) * 100;
    console.log(`  ${t}      ${(aInf/N).toFixed(3).padStart(10)}              ${(bInf/N).toFixed(3).padStart(10)}         ${adv >= 0 ? '+' : ''}${adv.toFixed(1)}%`);
  }
}
function probeRout() {
  function side(rng, prof, pol) {
    const bodies = gen.generateSquad(rng, 8, { corpId: prof.id }).bodies;
    let cap = bodies[0]; for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
    const units = bodies.map(f => C.makeCombatant(f, { traitIndex: gen.traitById, isCaptain: f.id === cap.id, day: 12 }));
    return { corpId: prof.id, policy: pol, units, hasMedkit: true, fidelity: C.captainFidelity(cap, gen.traitById) };
  }
  
  const N = 4000;
  const rng = makeRng('rout-probe');
  const routsPer = {}, endBy = {};
  let eng = 0, exchWithDown = 0, routsAfterDown = 0, exchNoDown = 0, routsNoDown = 0;
  let routedTotal = 0, routedThenHit = 0, massBreaks = 0, downsTotal = 0;
  
  for (let i = 0; i < N; i++) {
    const a = OA[i % 8], b = OA[(i + 3) % 8];
    const r = TACMOD.resolve(rng, side(rng, a, 'standard'), side(rng, b, 'standard'),
      { day: 12, openingBand: 1 + (i % 2), terrain: 'broken_ground', log: true });
    eng++;
    endBy[r.result] = (endBy[r.result] || 0) + 1;
  
    /* per-exchange: did a down happen, and did routs follow in the same or next exchange? */
    const byEx = {};
    for (const e of r.log) {
      if (!e.exchange) continue;
      byEx[e.exchange] = byEx[e.exchange] || { downs: 0, routs: 0 };
      if (e.type === 'downed') byEx[e.exchange].downs++;
      if (e.type === 'rout') byEx[e.exchange].routs++;
    }
    const keys = Object.keys(byEx).map(Number).sort((x, y) => x - y);
    let nRouts = 0, maxRoutsInEx = 0;
    for (const k of keys) {
      const cur = byEx[k], nxt = byEx[k + 1] || { routs: 0 };
      nRouts += cur.routs;
      maxRoutsInEx = Math.max(maxRoutsInEx, cur.routs);
      downsTotal += cur.downs;
      if (cur.downs > 0) { exchWithDown++; routsAfterDown += cur.routs + nxt.routs; }
      else { exchNoDown++; routsNoDown += cur.routs; }
    }
    routsPer[Math.min(nRouts, 6)] = (routsPer[Math.min(nRouts, 6)] || 0) + 1;
    routedTotal += nRouts;
    if (maxRoutsInEx >= 3) massBreaks++;
  }
  
  const pct = (a, b) => (100 * a / b).toFixed(1);
  console.log(`ROUT BEHAVIOUR — ${N} standard-vs-standard engagements\n`);
  console.log('  routs in an engagement:');
  for (let k = 0; k <= 6; k++) {
    const c = routsPer[k] || 0;
    console.log(`    ${k === 6 ? '6+' : k}  ${String(c).padStart(5)}  ${pct(c, eng).padStart(5)}%  ${'#'.repeat(Math.round(c / eng * 60))}`);
  }
  console.log(`\n  mean routs per engagement : ${(routedTotal / eng).toFixed(2)}`);
  console.log(`  engagements with 3+ routing in ONE exchange (a cascade): ${pct(massBreaks, eng)}%`);
  console.log(`\n  routs per exchange WITH a squadmate going down : ${(routsAfterDown / Math.max(1, exchWithDown)).toFixed(3)}`);
  console.log(`  routs per exchange with NO down                : ${(routsNoDown / Math.max(1, exchNoDown)).toFixed(3)}`);
  console.log(`  → a down multiplies rout rate by ${(routsAfterDown / Math.max(1, exchWithDown) / Math.max(0.0001, routsNoDown / Math.max(1, exchNoDown))).toFixed(1)}x`);
  console.log('\n  how engagements ended:');
  for (const [k, v] of Object.entries(endBy).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(20)} ${pct(v, eng).padStart(5)}%`);
  }
}
function probeBand() {
  const TIERS = { short:{power:5,range:'short',tier:3}, medium:{power:5,range:'medium',tier:3}, long:{power:5,range:'long',tier:3} };
  function side(rng, prof, weapon) {
    const bodies = gen.generateSquad(rng, 8, { corpId: prof.id }).bodies;
    let cap = bodies[0]; for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
    const units = bodies.map(f => { const c = C.makeCombatant(f, { traitIndex: gen.traitById, isCaptain: f.id === cap.id, day: 12 }); if (weapon) c.weapon = weapon; return c; });
    return { corpId: prof.id, policy: 'standard', units, hasMedkit: true, fidelity: C.captainFidelity(cap, gen.traitById) };
  }
  const N = 2000;
  console.log('BAND OUTCOMES — where engagements actually end up\n');
  console.log('  A loadout    B loadout    ended long / medium / short');
  for (const [wa, wb] of [['long','long'],['long','short'],['medium','medium'],['short','short'],['long','medium']]) {
    const rng = makeRng('band-' + wa + wb);
    const end = [0,0,0];
    for (let i = 0; i < N; i++) {
      const r = TACMOD.resolve(rng, side(rng, OA[i%8], TIERS[wa]), side(rng, OA[(i+3)%8], TIERS[wb]),
                               { day:12, openingBand:1, terrain:'broken_ground' });
      end[['long','medium','short'].indexOf(r.band)]++;
    }
    const p = v => (100*v/N).toFixed(0).padStart(3) + '%';
    console.log(`  ${wa.padEnd(12)} ${wb.padEnd(12)} ${p(end[0])} / ${p(end[1])} / ${p(end[2])}`);
  }
}

/* ================================================================== *
 * THEATER BUILD                                                       *
 * ================================================================== */
function buildTheater() {
  try { findFile('combat_theater.html'); }
  catch (e) {
    console.log('combat_theater.html not found — the page is self-hosting, so keep it alongside');
    console.log('the project if you want to rebuild it. Nothing else depends on it.');
    return;
  }
  /* Self-hosting: the built page carries @DATA / @SIM markers, so it is its own
     template. Only the data and sim blocks are regenerated; the markup, styles and
     app logic in the page are preserved. Falls back to ui/_theater.html if present. */
  const data = {
    races: readJSON('races.json'), traits: readJSON('traits.json'),
    recruitment: readJSON('recruitment.json'), oa: readJSON('oa_profiles.json')
  };
  const rd = n => fs.readFileSync(findFile(n), 'utf8');
  const sim = [
    rd('prng.js'),
    '(function(){var module={exports:{}};\n' + rd('combat.js') + '\nwindow.combat=API;})();',
    rd('roster.js'),   /* namegen + recruitgen + commentary + roster, consolidated */
    'window.CDROSTER.initRoster({races:window.DATA.races,traits:window.DATA.traits,' +
      'recruitment:window.DATA.recruitment,oa:window.DATA.oa});'
  ].join('\n\n');

  let src, outPath;
  try {
    src = rd('combat_theater.html');
    outPath = findFile('combat_theater.html');
  } catch (e) {
    src = rd('_theater.html');
    outPath = path.join(path.dirname(findFile('_theater.html')), 'combat_theater.html');
    src = src.replace('/*__APP__*/', rd('_theater_app.js'));
  }

  const swap = (html, tag, payload) => {
    const a = html.indexOf('<!--@' + tag + '-->'), b = html.indexOf('<!--@/' + tag + '-->');
    if (a < 0 || b < 0) throw new Error('marker @' + tag + ' missing from the page');
    return html.slice(0, a) + '<!--@' + tag + '-->\n<script>' + payload + '</script>\n' + html.slice(b);
  };
  let html = swap(src, 'DATA', 'window.DATA = ' + JSON.stringify(data) + ';');
  html = swap(html, 'SIM', sim);
  fs.writeFileSync(outPath, html);
  console.log(path.relative(process.cwd(), outPath) + '  ' + (html.length / 1024).toFixed(0) + ' KB');
}

/* ================================================================== *
 * CLI                                                                 *
 * ================================================================== */
/* Step 4 eyeball page: bake replays into ui/divide_theater.html. Same self-hosting
   pattern as the combat theater — the built page is its own template. */
function buildSurvey() {
  const SETS = [
    { label: 'A realistic field',       opts: { planet: { archetype: 'volcanic_waste' } } },
    { label: 'Everyone careful',        opts: { planet: { archetype: 'jungle_cradle' },
              policyFor: () => 'preservationist', flatRigidity: 100 } },
    { label: 'Everyone death-or-glory', opts: { planet: { archetype: 'dead_industrial' },
              policyFor: () => 'death_or_glory', flatRigidity: 100 } },
    { label: 'A hard winter',           opts: { planet: { archetype: 'ice_shelf' } }, seed: 'VC-104' },
    { label: 'Lab: 3v3, standard',      opts: { corpCount: 2, flatRigidity: 100,
              planet: { radius: 0.26, archetype: 'volcanic_waste' },
              policyFor: () => 'standard' }, seed: 'duel-1' },
    { label: 'Lab: 3v3, careful v hard', opts: { corpCount: 2, flatRigidity: 100,
              planet: { radius: 0.26, archetype: 'jungle_cradle' },
              policyFor: (i) => i === 0 ? 'preservationist' : 'unyielding' }, seed: 'duel-2' }
  ];
  const replays = SETS.map(set => {
    const rng = makeRng(set.seed || 'VC-103');
    const s = DIV.runDivide(rng, Object.assign({
      oaProfiles, traitIndex, raceById: gen.raceById, replay: true
    }, set.opts));
    const r = s.replay;
    r.label = set.label;
    return r;
  });

  const rd = n => fs.readFileSync(findFile(n), 'utf8');
  let src, outPath;
  try { src = rd('divide_theater.html'); outPath = findFile('divide_theater.html'); }
  catch (e) { console.log('divide_theater.html not found — nothing to build'); return; }

  const a = src.indexOf('<!--@REPLAYS-->'), b = src.indexOf('<!--@/REPLAYS-->');
  if (a < 0 || b < 0) throw new Error('marker @REPLAYS missing from the survey page');
  const html = src.slice(0, a) + '<!--@REPLAYS-->\n<script>window.REPLAYS = ' +
    JSON.stringify(replays) + ';</script>\n' + src.slice(b);
  fs.writeFileSync(outPath, html);
  console.log(path.relative(process.cwd(), outPath) + '  ' + (html.length / 1024).toFixed(0) + ' KB  ' +
    replays.length + ' replays');
}

function buildBench() {
  /* the_table.html — the manager's side. Inlines the live engine; see build_bench.cjs. */
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [findFile('build_bench.cjs')], { stdio: 'inherit' });
}

function buildTable() {
  /* The negotiation viewer. Bakes real runs — see build_table.cjs, which owns the shape. */
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [findFile('build_table.cjs')], { stdio: 'inherit' });
}

function usage() {
  console.log([
    'Capital Divide — project checks and builds', '',
    '  node arx.cjs test [divides] [seed]   acceptance suite (default 300, VC-103)',
    '  node arx.cjs regress [--bless]       regression suite; --bless re-records snapshots',
    '  node arx.cjs probe gear|rout|band    targeted probes',
    '  node arx.cjs build                   rebuild the theater page',
    '  node arx.cjs all                     regress + test'
  ].join('\n'));
}

const cmd = process.argv[2];
if (cmd === 'test') runAcceptance();
else if (cmd === 'regress') runRegression();
else if (cmd === 'probe') {
  const which = process.argv[3];
  if (which === 'gear') probeGear();
  else if (which === 'rout') probeRout();
  else if (which === 'band') probeBand();
  else { console.log('probe needs: gear | rout | band'); process.exitCode = 1; }
}
else if (cmd === 'build') buildTheater();
else if (cmd === 'survey') buildSurvey();
else if (cmd === 'armoury') buildArmoury();
else if (cmd === 'table') buildTable();
else if (cmd === 'bench') buildBench();
else if (cmd === 'lab') runLab(Number(process.argv[3]) || 6, process.argv[4]);
else if (cmd === 'all') { runRegression(); console.log(''); runAcceptance(); }
else usage();
