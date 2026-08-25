/* probe_prepwiring.cjs — DOES ANYTHING THIS STEP ADDED ACTUALLY DO ANYTHING?
 *
 * Step 8.6 introduced about twenty values across the prep calendar, the Dividend, two markets
 * and the lock. One of them — `_scouted` — was written every turn and read by nothing for a
 * whole step, and it was found BY ACCIDENT while starting an unrelated job. That is the fault
 * this project is named for, committed in the session that catalogued it.
 *
 * So rather than wait for the next session to trip over the rest, this asks each one directly:
 * does the branch fire, does the value differ, does the constant decide anything. A constant
 * that never changes an outcome is a comment with a number in it.
 *
 *   node probe_prepwiring.cjs [seasons]
 */
const path = require('path'), fs = require('fs');
const D = __dirname;
const find = n => { for (const c of [path.join(D, n), path.join(D, '..', 'data', n)])
  if (fs.existsSync(c)) return c; throw new Error('cannot find ' + n); };
const P = require(find('prng.js'));
const SEASON = require(find('season.js'));
const oa = JSON.parse(fs.readFileSync(find('oa_profiles.json'), 'utf8')).oa_profiles;

const N = parseInt(process.argv[2] || '12', 10);
const rows = [];
const say = (what, live, evidence) =>
  rows.push({ what, live, evidence });

const r = SEASON.runCareer(P.mulberry32(P.seedFrom('VC-103')), oa, N, {});
const cs = [];
for (const s of r.seasons) for (const id in s.corps) cs.push(s.corps[id]);

/* --- the action-point budget --- */
const acts = {};
let apTotal = 0, turnsWithAll = 0, corpSeasons = 0;
for (const c of cs) {
  const p = c.prep; if (!p) continue;
  corpSeasons++; apTotal += p.ap || 0;
  for (const k in (p.acts || {})) acts[k] = (acts[k] || 0) + p.acts[k];
}
say('AP_TREAT — the treat verb is ever chosen', (acts.treat || 0) > 0,
    'treat chosen ' + (acts.treat || 0) + ' times across ' + corpSeasons + ' corp-seasons');
say('AP_TRAIN — the train verb is ever chosen', (acts.train || 0) > 0, 'train ' + (acts.train || 0));
say('AP_SCOUT — the scout verb is ever chosen', (acts.scout || 0) > 0, 'scout ' + (acts.scout || 0));
say('AP_RECRUIT — the recruit verb is ever chosen', (acts.recruit || 0) > 0, 'recruit ' + (acts.recruit || 0));
/* The ceiling is DERIVED, never typed. It was the literal 25, which was five turns of five
   points; the moment the calendar became eleven months of three the constant said nothing and
   the guard would have passed on any figure at all. A budget check against a hardcoded budget
   is a check against a memory of the budget. */
const APMAX = SEASON.CONST.PREP_MONTHS * SEASON.CONST.PREP_AP;
say('PREP_AP — the budget ever BINDS (a corp wants more than a month allows)',
    apTotal < corpSeasons * APMAX,
    apTotal + ' AP spent of ' + (corpSeasons * APMAX) + ' available — if these are equal the ' +
    'budget never refused anything and there is no competition');

/* --- treatment --- */
let treated = 0, mended = 0;
for (const c of cs) { const p = c.prep; if (!p) continue; treated += p.treated || 0; mended += p.mended || 0; }
say('TREAT_DAYS — treatment actually reaches somebody', treated > 0,
    treated + ' treatment blocks applied, ' + mended + ' wounds mended by time alone');

/* --- the lock's three leans --- */
const leans = {};
for (const c of cs) if (c.lockLean) leans[c.lockLean] = (leans[c.lockLean] || 0) + 1;
say('LOCK leans — more than one is in use', Object.keys(leans).length > 1,
    Object.keys(leans).map(k => k + ' ' + leans[k]).join(', ') || 'none recorded');

/* --- intel --- */
const intel = {};
for (const c of cs) intel[(c.intel || 0).toFixed(2)] = 1;
say('SCOUT_INTEL / SCOUT_APATHY — intel VARIES rather than being a constant',
    Object.keys(intel).length > 1,
    'distinct values across the career: ' + Object.keys(intel).sort().join(', '));

/* --- the markets --- */
let mLot = 0, mBids = 0, mSigned = 0, mSafety = 0, bSigned = 0, bUnplaced = 0;
for (const s of r.seasons) {
  const m = s.mercs || {}, b = s.bastille || {};
  mLot += m.lot || 0; mBids += m.bids || 0; mSigned += m.signed || 0;
  mSafety += m.tookLessForSafety || 0;
  bSigned += b.signed || 0; bUnplaced += b.unplaced || 0;
}
say('MERC_W_SAFETY — safety ever outranks money', mSafety > 0,
    mSafety + ' of ' + mSigned + ' took less than the top bid');
say('MERC_HUNGER — bids differ between corps (more than one offer level)', mBids > mLot,
    mBids + ' offers over ' + mLot + ' on the market');
say('BASTILLE — the intake ever fails to place somebody', bUnplaced > 0,
    bSigned + ' placed, ' + bUnplaced + ' unplaced — zero means every corp always has room ' +
    'and the market of last resort never runs out of takers');

/* --- the freedom clause --- */
let serving = 0, freed = 0, served = 0;
for (const id in r.corps) for (const f of r.corps[id].roster) {
  if (f.status === 'prisoner') serving++;
  if (f.status === 'freed') freed++;
  if (f.contract && (f.contract.divides_served || 0) > 0) served++;
}
say('BASTILLE_TERM — terms are SERVED, not just signed', freed > 0,
    serving + ' serving, ' + freed + ' went free, ' + served + ' have a Divide on their term');

/* --- report --- */
console.log('\nSTEP 8.6 WIRING SWEEP \u00b7 ' + N + ' seasons');
console.log('='.repeat(78));
let dead = 0;
for (const row of rows) {
  if (!row.live) dead++;
  console.log(' ' + (row.live ? '\u2713' : '\u2717') + ' ' + row.what);
  console.log('     ' + row.evidence);
}
console.log('='.repeat(78));
console.log('  ' + (rows.length - dead) + ' live \u00b7 ' + dead + ' doing nothing');
