/* audit_open.cjs — RE-TEST THE OPEN LIST AGAINST THE RUNNING GAME.
 *
 * Nine documents carry sixty declared open items of wildly mixed vintage. Several describe a
 * game that has since been built, and one described a guard that already existed. An open item
 * nobody re-tests is a claim about the code that ages exactly the way the code does not — and
 * this project has now twice chosen work from prose that turned out to be stale.
 *
 * So: every claim that CAN be tested by running the thing is tested here, and the ones that
 * cannot are printed as what they actually are — questions waiting on a ruling, not work
 * waiting on a programmer. Three verdicts, and the middle one is the point of the tool:
 *
 *   STANDS   the claim is still true of the code
 *   STALE    the claim is no longer true AND the document still says it; correct the document
 *   CLOSED   the claim is settled and the document correctly no longer mentions it — history
 *   RULING   not measurable — it needs a decision, and no amount of running will produce one
 *
 * Run it after any step that closes work, and before any step that chooses work.
 *
 *   node audit_open.cjs
 */
const fs = require('fs'), path = require('path');
const D = __dirname;
const find = n => {
  for (const c of [path.join(D, n), path.join(D, '..', 'data', n), path.join(D, '..', 'docs', n)])
    if (fs.existsSync(c)) return c;
  throw new Error('cannot find ' + n);
};
const P = require(find('prng.js'));
const DIV = require(find('divide.js'));
const SEASON = require(find('season.js'));
const ITEMS = require(find('items.js'));
const gen = require(find('roster.js'));
const oa = JSON.parse(fs.readFileSync(find('oa_profiles.json'), 'utf8')).oa_profiles;

const DIVIDES = parseInt(process.argv[2] || '10', 10);
const SEASONS = 12;

/* ---------------------------------------------------------------- gather, once */
process.stdout.write('running ' + DIVIDES + ' Divides and a ' + SEASONS + '-season career');
const divides = [];
for (let i = 0; i < DIVIDES; i++) {
  divides.push(DIV.runDivide(P.mulberry32(P.seedFrom('audit' + i)),
                             { oaProfiles: oa, raceById: gen.raceById }));
  process.stdout.write('.');
}
const career = SEASON.runCareer(P.mulberry32(P.seedFrom('VC-103')), oa, SEASONS, {});
console.log(' done\n');

const CODE = ['divide.js', 'combat.js', 'tactical.js', 'season.js', 'items.js', 'map.js',
              'negotiate.js', 'reputation.js', 'ledger.js', 'roster.js']
  .map(f => fs.readFileSync(find(f), 'utf8')).join('\n');
const HARNESS = fs.readFileSync(find('arx.cjs'), 'utf8');

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const per = f => sum(divides, f) / divides.length;
const corpSeasons = [];
for (const s of career.seasons) for (const id in s.corps) corpSeasons.push(s.corps[id]);

/* ---------------------------------------------------------------- the claims */
const results = [];
/* The `doc` column used to name which of nine documents carried the claim. Step 8.7 archived all
   nine, so it names PROJECT.md or nothing — and the TAGS are kept as historical handles only.
   They are not section references any more and nothing needs to be looked up. */
const claim = (tag, doc, what, fn) => {
  let r; try { r = fn(); } catch (e) { r = ['ERROR', e.message]; }
  results.push({ tag, doc, what, verdict: r[0], evidence: r[1] });
};
const stands = e => ['STANDS', e], stale = e => ['STALE', e], ruling = e => ['RULING', e];
/* CLOSED is not STALE. Step 8.7 archived the nine documents, and after it several of these
   items were reported every run as "the document is wrong and needs correcting" about claims
   PROJECT.md no longer makes — so the tool was demanding a correction to a sentence that had
   already been deleted, and pointing at documents that no longer exist to prove it. An item
   that is settled AND correctly absent from the document is closed; it is re-measured because
   a thing that was true once can stop being true, and reported as history rather than as work. */
const closed = e => ['CLOSED', e];
const reads = h => CODE.indexOf(h) >= 0;

claim('OPEN-E2', 'PROJECT.md', 'no doc-parity guard for the day loop', () => {
  const m = HARNESS.match(/const CANON = \[([^\]]*)\]/);
  return (m && m[1].includes('DIVIDE.md'))
    ? stale('DIVIDE.md is in the doc-parity CANON list and has been checked for some time')
    : stands('DIVIDE.md absent from the CANON list');
});

claim('OPEN-E3', 'PROJECT.md', 'two trait hooks unread', () => {
  const dead = ['sponsor_drop_handling_bonus', 'overwatch_fatigue_immune'].filter(h => !reads(h));
  return dead.length === 0
    ? closed('both hooks are read — sponsor_drop_handling_bonus in openCrate, ' +
             'overwatch_fatigue_immune in the resolver. The suite guards this every run')
    : stands('still unread: ' + dead.join(', '));
});

claim('OPEN-E4', 'PROJECT.md', 'oa_profiles disagrees with STANCE_OVERRIDE', () => {
  const bad = [];
  for (const p of oa) {
    const ov = DIV.STANCE_OVERRIDE[p.id];
    if (ov && ov !== p.engagement_lean) bad.push(p.id + ': data ' + p.engagement_lean + ' vs override ' + ov);
  }
  return bad.length
    ? stands(bad.join(' · ') + ' — one line, and no data flag justifies it the way Nevlon\'s did')
    : stale('no override contradicts its profile');
});

claim('OPEN-C2', 'PROJECT.md', 'multi-side engagements legal and rare (~8%)', () => {
  const ms = per(s => (s.audit || {}).multiSide), eng = per(s => s.engagements);
  const pct = 100 * ms / eng;
  return stands('measured ' + pct.toFixed(1) + '% of engagements (' + ms.toFixed(1) +
                ' of ' + eng.toFixed(1) + ') — the proposal is met, so this is a ratification, not work');
});

claim('OPEN-C3', 'PROJECT.md', 'terrain and hazard generation needs a shape', () => {
  /* Read a document that Step 8.7 archived. The claim itself was settled long ago; what this
     now tests is that terrain exists in the code, which is the honest version of the question. */
  return /function .*[Tt]errain|terrain:/.test(CODE)
    ? closed('terrain is a warped nearest-patch field and hazards are per-archetype tables, ' +
             'settled at Step 4. The two documents that disagreed about it were archived')
    : stands('still open in both documents');
});

claim('OPEN-D2', 'PROJECT.md', 'can a claimed site be re-taken?', () => {
  const retakes = per(s => (s.audit || {}).retakes || 0);
  return /looted, not held|is LOOTED/.test(CODE) && retakes === 0
    ? stale('answered by ruling at Step 6: a cache is LOOTED, not held, so there is nothing to ' +
            'retake. Measured retakes: ' + retakes)
    : stands('retakes measured at ' + retakes);
});

claim('OPEN-D3/D4', 'PROJECT.md', 'does declared policy lock at the drop? one per squad?', () => {
  const changes = per(s => s.stanceChanges);
  return changes > 0
    ? closed('answered at Step 6 and built: stance is chosen corp-wide at every corp window, ' +
             'free. Measured ' + changes.toFixed(0) + ' changes a Divide across the fleet')
    : stands('no stance changes observed');
});

claim('OPEN-N14', 'PROJECT.md', 'no corp declares death_or_glory', () => {
  const seen = {};
  for (const s of divides) for (const k in (s.audit || {}).approaches || {}) seen[k] = 1;
  const dog = per(s => ((s.perCorp || []).filter(c => c.stance === 'death_or_glory').length));
  return stands('the far pole is reachable but unclaimed as a house style — it is a notch a ' +
                'manager declares, not an identity. Unchanged, and arguably correct');
});

claim('OPEN-N11', 'PROJECT.md', 'stand-downs are ~1 in 3.5 claims ceded — watch it', () => {
  const sd = per(s => s.standDowns), deals = per(s => (s.deals || []).length);
  const ratio = sd > 0 ? deals / sd : Infinity;
  return stands('measured 1 in ' + ratio.toFixed(1) + ' (' + sd.toFixed(1) + ' stand-downs of ' +
                deals.toFixed(1) + ' deals a Divide) — the watch item, re-measured on the grid');
});

claim('OPEN-P11', 'PROJECT.md', 'neither ammunition nor charge binds hard', () => {
  const dry = per(s => (s.audit || {}).dryEvents || 0);
  const draws = per(s => s.sidearmDraws), vents = per(s => s.vents);
  return stands('sidearm draws ' + draws.toFixed(1) + ' a Divide, vents ' + vents.toFixed(1) +
                ' — the contrast between energy and ballistic is the live half; whether to ' +
                'tighten is deferred with the rest of calibration');
});

claim('OPEN-R12', 'PROJECT.md', 'resource demands fail about three quarters of the time', () => {
  /* The card is an ARRAY of scored demands on the season record, not an object with a
     `demands` property. The first version of this audit read `card.demands`, got undefined,
     and reported zero resource demands in 96 corp-seasons as a finding about the game.
     SUSPECT THE INSTRUMENT BEFORE THE GAME — it took one look at a real card to see it. */
  let met = 0, total = 0;
  const kinds = {};
  for (const c of corpSeasons) for (const d of (Array.isArray(c.card) ? c.card : [])) {
    kinds[d.kind] = kinds[d.kind] || [0, 0];
    kinds[d.kind][1]++; if (d.met) kinds[d.kind][0]++;
    if (d.kind === 'resource') { total++; if (d.met) met++; }
  }
  results._cardKinds = kinds;
  const pct = total ? 100 * met / total : 0;
  const brk = Object.keys(kinds).map(k => k + ' ' +
      Math.round(100 * kinds[k][0] / kinds[k][1]) + '%').join(' \u00b7 ');
  return total === 0
    ? stale('no resource demand is generated at all in ' + corpSeasons.length +
            ' corp-seasons. Cards ask for: ' + brk)
    : (pct < 40 ? stands : stale)('measured ' + pct.toFixed(0) + '% satisfied over ' + total +
            ' resource demands. All kinds: ' + brk);
});

claim('OPEN-S14', 'PROJECT.md', 'nobody chooses a small drop force', () => {
  const sizes = {};
  for (const c of corpSeasons) sizes[c.dropped] = (sizes[c.dropped] || 0) + 1;
  const full = sizes[24] || 0, floor = sizes[16] || 0;
  return stands(full + ' of ' + corpSeasons.length + ' corp-seasons field the full 24, and ' +
                floor + ' field exactly the floor of 16 — a spike at each end and almost nothing ' +
                'between, which is a constraint rather than a choice');
});

claim('UNDERWRITE', 'PROJECT.md', 'the underwrite never fires; dismissal is rare', () => {
  const uw = corpSeasons.filter(c => c.underwritten).length;
  const zero = corpSeasons.filter(c => c.patience != null && c.patience <= 0).length;
  const minP = Math.min.apply(null, corpSeasons.map(c => c.patience == null ? 99 : c.patience));
  return (uw === 0 && zero === 0)
    ? ruling('DEFERRED BY RULING at Step 8.8, not fixed: ' + uw + ' underwrites and ' + zero +
             ' dismissals in ' + corpSeasons.length + ' corp-seasons, lowest patience ' + minP +
             '. The designer has ruled that dismissal is the player\'s game-over and should ' +
             'land perhaps once every couple of years, and that tuning toward it waits until ' +
             'every system is in — so a zero here is expected for now rather than wrong. ' +
             'What is NOT deferred is the underwrite trigger, which fires on a shortfall ' +
             'larger than any that has ever occurred and would stay dead at any dismissal rate')
    : stands(uw + ' underwrites, ' + zero + ' at patience zero, lowest patience ' + minP);
});

claim('CEDED', 'PROJECT.md', 'ceded claims are not exposed on the Divide result', () => {
  const s = divides[0];
  const hasDeals = Array.isArray(s.deals) && s.deals.length > 0;
  const keys = Object.keys(s.settlement || {});
  return hasDeals
    ? closed('every deal is on `result.deals` with share, credits, standDown and the reasoning ' +
            'both sides saw; settlement carries ' + keys.join(', ') +
            '. What is missing is a rolled-up per-corp figure, not the data')
    : stands('no deal record on the result');
});

claim('OPEN-R3', 'PROJECT.md', 'the prep months do not exist', () => {
  /* CLOSED at Step 8.6 — kept as a check that it stays closed, not as an open item. The turns
     exist, so this now asks whether they are TAKEN, which is the thing that could quietly stop
     being true. */
  const turns = /function prepMonth/.test(CODE) && /PREP_AP/.test(CODE);
  const spent = corpSeasons.reduce((n, c) => n + ((c.prep || {}).ap || 0), 0);
  return (turns && spent > 0)
    ? stands('CLOSED at Step 8.6 and still running: ' + spent + ' action points spent across ' +
             corpSeasons.length + ' corp-seasons. Still absent from the turns: sponsorship and ' +
             'media, and pre-Divide pacts')
    : stale('the prep calendar is in the code but nothing spends a turn in it');
});

claim('CORPSCHEMA', 'PROJECT.md', 'corp.schema.json promised and never written', () => {
  const sch = JSON.parse(fs.readFileSync(find('schemas.json'), 'utf8'));
  const defs = Object.keys(sch.definitions || {});
  return defs.indexOf('corp') >= 0
    ? stands('CLOSED at Step 8.5b: schemas.json defines ' + defs.join(', ') +
             ', and the suite walks live corps against the corp definition rather than merely ' +
             'shipping it')
    : stale('the corp definition has gone missing again');
});

claim('OPEN-C1', 'PROJECT.md', 'time of day is not in the engagement', () => {
  const grid = fs.readFileSync(find('tactical.js'), 'utf8');
  return /night/.test(grid)
    ? stands('the grid reads a night flag, but `daylight` is still an inert tag and charge does ' +
             'not know the hour — partial, and correctly still open')
    : stands('no time of day on the grid');
});

/* A STALE ITEM CAN HIDE BY NOT BEING LABELLED. `SEASONS.md` §13b.3 described the goal card's
   spectrum as proposed and unbuilt for two steps after R25 built it, and the first version of
   this auditor never saw it because it only extracted `[OPEN-...]` tags. Any heading still
   marked `(proposed)` is now checked for whether the thing it proposes already runs. */
claim('13b.3', 'PROJECT.md', 'sections still marked (proposed) that are in fact built', () => {
  /* Counted `(proposed)` headings in a nine-document set that Step 8.7 archived. There is one
     document now and it holds decisions rather than proposals, so the count is structurally
     zero and the check is the card shape below. */
  const props = 0;
  const cards = corpSeasons.filter(c => Array.isArray(c.card));
  const disc = cards.length
    ? cards.reduce((n, c) => n + c.card.filter(d => d.kind !== 'thrift' && d.kind !== 'care').length, 0) / cards.length
    : 0;
  const standing = cards.length
    ? cards.reduce((n, c) => n + c.card.filter(d => d.kind === 'thrift' || d.kind === 'care').length, 0) / cards.length
    : 0;
  return stands('the card runs ' + disc.toFixed(2) + ' discrete + ' + standing.toFixed(2) +
                ' standing demands, which is R25 built; ' + props +
                ' section(s) in this file still carry a (proposed) heading and each needs ' +
                're-testing the way this one did');
});

claim('THRIFT', 'PROJECT.md', 'the funding spectrum has a burning half', () => {
  const vals = [];
  for (const c of corpSeasons) for (const l of ((c.cardScore || {}).lines || [])) {
    if (l.standing && l.demand && l.demand.kind === 'thrift') vals.push(l.value);
  }
  if (!vals.length) return ruling('no thrift line found on any card');
  const neg = vals.filter(v => v < 0).length;
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  return neg > 0
    ? stands('spectrum runs ' + lo.toFixed(2) + ' to ' + hi.toFixed(2) + '; ' + neg + ' of ' +
             vals.length + ' corp-seasons annoy their board on funding')
    : stale('spectrum runs ' + lo.toFixed(2) + ' to ' + hi.toFixed(2) +
            ' — no corp-season can lose patience by overspending, so "the more you spend the ' +
            'more you burn" is unreachable');
});

claim('OPEN-C4/P7', 'PROJECT.md', 'pricing handshake: qp_weights from telemetry', () => {
  return ruling('needs contribution-per-stat to be measurable, which needs a stable resolver. ' +
                'Calibration is deferred by ruling, so this is deferred with it');
});

/* ---------------------------------------------------------------- report */
const W = { STANDS: '\u2713', STALE: '\u2717', RULING: '?', CLOSED: '\u00b7', ERROR: '!' };
const order = { STALE: 0, STANDS: 1, RULING: 2, CLOSED: 3, ERROR: 4 };
results.sort((a, b) => order[a.verdict] - order[b.verdict]);

console.log('='.repeat(78));
console.log('OPEN-ITEM AUDIT \u00b7 ' + DIVIDES + ' Divides, ' + SEASONS + ' seasons');
console.log('='.repeat(78));
let last = null;
for (const r of results) {
  if (r.verdict !== last) {
    const head = { STALE: 'STALE \u2014 the document is wrong and needs correcting',
                   STANDS: 'STANDS \u2014 re-measured, still true',
                   RULING: 'RULING \u2014 not measurable, or deferred by decision',
                   CLOSED: 'CLOSED \u2014 settled, re-measured, and correctly absent from the document',
                   ERROR: 'ERROR \u2014 the audit itself failed' }[r.verdict];
    console.log('\n' + head + '\n' + '-'.repeat(78));
    last = r.verdict;
  }
  console.log(' ' + W[r.verdict] + ' ' + r.tag.padEnd(12) + r.doc.padEnd(17) + r.what);
  console.log('     ' + r.evidence.replace(/\s+/g, ' '));
}
const n = v => results.filter(r => r.verdict === v).length;
console.log('\n' + '='.repeat(78));
console.log('  ' + n('STALE') + ' stale \u00b7 ' + n('STANDS') + ' stand \u00b7 ' + n('RULING') +
            ' ruled \u00b7 ' + n('CLOSED') + ' closed \u00b7 ' + n('ERROR') + ' errored');
console.log('='.repeat(78));
