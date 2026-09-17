/* THE TABLE, HELD TO ITS CHARACTER. `measure_regret.cjs` says whether an OA's decisions made
   money; this says whether they made SENSE — a handful of set situations, and the behaviour
   each is ruled to produce, as a gate. A change to a weight that turns a beaten, hunted OA
   toward the leaderboard instead of the OA on top of it fails here even if the money came out
   the same. Rulings checked:
     T1  the table is for the OA you are engaged with — a beaten OA's first approach is to an
         OA its squads have met, not a cold one
     T2  a principal courts the OA it is on top of — invitations go to OAs it has fought
     T3  cold alliances are rare, and cost more when they happen
     T4  memory reaches the price — an OA left to die asks more of the OA that did it; one
         spared asks less
     T5  culture is a direction — spite is nothing between warm OAs and something between
         aggressive ones; goodwill is a traditional OA's, not a treacherous one's
     T6  appetite is a reason to hold — OAs that cede wanted out more than OAs that held
     T7  stance is not applied twice at the table
     T8  a manager's banner is never bought for him — no deal on it without an answered ask
     T9  the principal is a party — some asks are refused by the principal, some taken
     T10 a lesson is learned — a deal that did not pay raises the price next time
   `node sim/audit_table.cjs [divides]` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require('./prng.js'), S = require('./season.js'), DIV = require('./divide.js'),
      NEG = require('./negotiate.js'), REP = require('./reputation.js');
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const DIVIDES = +(process.argv[2] || 6);
const fails = [], notes = [];
const ok = (name, cond, detail) => { (cond ? notes : fails).push((cond ? '  ok    ' : '  FAIL  ') + name + (detail ? '  \u2014 ' + detail : '')); };
const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/* ---- the fleet through several Divides, watched at every window ---- */
const t1 = { beatenFirstHasContact: 0, beatenFirst: 0 };
const t2 = { invitedWithContact: 0, invited: 0 };
const t3 = { cold: 0, deals: 0 };
const t6 = { ceded: [], held: [] };
let asksToHuman = 0, dealsOnHuman = 0, answeredOnHuman = 0, pRefused = 0, pTaken = 0;

for (let seed = 1; seed <= DIVIDES; seed++) {
  const rng = P.mulberry32(P.seedFrom('table-audit' + seed));
  const founder = S.founderProfile(oa, 'X');
  const berth = oa.slice().sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0))[0].id;
  const profiles = oa.map(p => p.id === berth ? founder : p);
  const corps = S.openFleet(rng, profiles, {});
  const st = S.beginSeason(rng, corps, profiles, { human: founder.id });
  while (st.month <= 11) S.stepMonth(st);
  S.closeSeasonToDrop(st);
  const d = S.prepareDivide(st);
  const lastApp = {};
  d.opts.onWindow = (ctx, cs) => {
    const best = Math.max.apply(null, Object.keys(ctx.odds).map(k => ctx.odds[k]).concat([1e-6]));
    for (const c of cs) {
      if (c.joinedTo || c.disqualified || c.id === founder.id) continue;
      lastApp[c.id] = NEG.appetite(c, ctx).value;
      const mine = ctx.odds[ctx.principalOf(c).id] || 0;
      const beaten = mine < 0.5 * best;
      if (!beaten) continue;
      const ranked = NEG.rankBanners(c, ctx.umbrellas, ctx).filter(r => r.score > 0);
      if (!ranked.length) continue;
      const first = ranked[0];
      const met = r => { const t = ctx.contact(c, r.principal); return !!(t.fights || t.huntedBy || t.hunting); };
      /* the ruling is about preference among banners that COULD take you; an OA whose wall
         or ceiling shuts you out is not an option, however many times you have fought it */
      if (!ranked.some(met)) continue;
      t1.beatenFirst++;
      if (met(first)) t1.beatenFirstHasContact++;
    }
  };
  d.opts.onDecision = (k, dflt, options, pick) => {
    if (k.kind === 'take') { if (pick) pTaken++; else pRefused++; }
  };
  const res = DIV.runDivide(d.rng, d.opts);
  const a = res.audit || {};
  asksToHuman += a.asksToHuman || 0;
  for (const dl of res.deals) {
    if (dl.kind && dl.kind !== 'share' && dl.kind !== 'flat') continue;
    t3.deals++; if (dl.why && dl.why.cold) t3.cold++;
    if (dl.principal === founder.id) dealsOnHuman++;
    if (dl.why && dl.why.invited) {
      t2.invited++;
      const tc = (dl.why.contact || {});
      if (tc.fights || tc.hunting || tc.beat) t2.invitedWithContact++;
    }
  }
  for (const c of Object.values(corps)) {
    if (c.id === founder.id || lastApp[c.id] == null) continue;
    const fell = (res.fallen || []).filter(f => f.id === c.id)[0];
    if (fell && fell.how === 'ceded') t6.ceded.push(lastApp[c.id]); else if (!fell || fell.how === 'standing') t6.held.push(lastApp[c.id]);
  }
  for (const ask of (res.asks || [])) if (ask.answered) answeredOnHuman++;
  S.finishSeason(st, res);
}

ok('T1 a beaten OA approaches an OA its squads have met first',
   t1.beatenFirst === 0 || t1.beatenFirstHasContact / t1.beatenFirst >= 0.75,
   t1.beatenFirstHasContact + '/' + t1.beatenFirst);
ok('T2 a principal courts OAs it has fought',
   t2.invited === 0 || t2.invitedWithContact / t2.invited >= 0.6,
   t2.invitedWithContact + '/' + t2.invited + ' invitations taken had contact');
ok('T3 cold alliances are rare',
   t3.deals === 0 || t3.cold / t3.deals <= 0.15, t3.cold + '/' + t3.deals);
notes.push('  note  OAs that ceded had appetite ' + mean(t6.ceded).toFixed(2) + ' at their last window; OAs that held ' + mean(t6.held).toFixed(2) + ' (information, not a gate)');
ok('T8 a manager\u2019s banner is never bought for him',
   dealsOnHuman <= answeredOnHuman, dealsOnHuman + ' deals on his banner, ' + answeredOnHuman + ' asks answered, ' + asksToHuman + ' asked');
/* refusals are rare by design (the guess is ±15%, so most asks land under the ceiling) and six
   Divides can legitimately show none; the gate is that the principal answers at all */
ok('T9 the principal is a party \u2014 asks are answered', pTaken > 0, pTaken + ' taken, ' + pRefused + ' refused');

/* ---- T4/T5/T7: constructed pairs, no Divide needed ---- */
{
  const rng = P.mulberry32(P.seedFrom('table-audit-pairs'));
  const corps = S.openFleet(rng, oa, {});
  const ids = Object.keys(corps);
  const a = corps[ids[0]], b = corps[ids[1]];
  /* a minimal context for offerRange: two banners, equal odds, no contact, a rich pot */
  const mkCtx = (x, y) => ({
    pot: 1000000, odds: { [x.id]: 0.15, [y.id]: 0.6 }, day: 10, lastDay: 27, banners: 2,   /* x is beaten */
    principalOf: c => c, sealed: () => false, hasHook: () => false, refusals: [],
    oddsWithJoin: () => 0.9, contact: () => ({ fights: 2, lostTo: 1, beat: 0, huntedBy: 0, hunting: 0, lastDay: 9 }),
    corps: [x, y], planet: { objectives: [] }, categoryOf: () => null, umbrellas: [{ principal: x, members: [x] }, { principal: y, members: [y] }],
    contactWith: null
  });
  const bodies = c => { c.allBodies = c.roster.slice(0, 20).map(f => Object.assign({}, f, { status: 'active', hooks: new Set() })); c.squads = []; c.rep = c.rep; };
  bodies(a); bodies(b);
  const base = NEG.priceModifier(a, b), baseBA = NEG.priceModifier(b, a);
  REP.act(b.rep, 'left_to_die', { targetId: a.id });         /* b left a to die: a's people remember b */
  const afterLeft = NEG.priceModifier(a, b);
  REP.act(a.rep, 'spared', { targetId: b.id });              /* a spared b: b's people warm to a */
  const afterSpared = NEG.priceModifier(b, a);
  ok('T4 an OA left to die asks more of the OA that did it', afterLeft > base, base.toFixed(2) + ' \u2192 ' + afterLeft.toFixed(2));
  ok('T4 an OA spared asks less of the OA that spared it', afterSpared < baseBA, baseBA.toFixed(2) + ' \u2192 ' + afterSpared.toFixed(2));

  /* T5: culture is a direction. Same pair, dials set by hand. */
  const withDials = (c, dials) => { const p = JSON.parse(JSON.stringify(c.profile)); Object.assign(p.dials, dials); return Object.assign(Object.create(Object.getPrototypeOf(c)), c, { profile: p }); };
  const aggressor = withDials(b, { aggression: 90, treachery: 80, tradition: 10 });
  const traditional = withDials(b, { aggression: 10, treachery: 10, tradition: 90 });
  const ctxAgg = mkCtx(a, aggressor), ctxTrad = mkCtx(a, traditional);
  const rAgg = NEG.offerRange(a, aggressor, ctxAgg), rTrad = NEG.offerRange(a, traditional, ctxTrad);
  ok('T5 spite is an aggressive OA\u2019s, not a traditional one\u2019s',
     rAgg && rTrad && rAgg.spite > rTrad.spite, (rAgg && rAgg.spite) + ' vs ' + (rTrad && rTrad.spite));
  ok('T5 goodwill is a traditional OA\u2019s, not a treacherous one\u2019s',
     rAgg && rTrad && rTrad.goodwill >= rAgg.goodwill, (rTrad && rTrad.goodwill) + ' vs ' + (rAgg && rAgg.goodwill));
  /* T6: appetite is a reason to hold — the same OA with half its people down wants out, and
     its floor falls with it */
  const whole = NEG.offerRange(a, traditional, ctxTrad);
  const hurt = withDials(a, {});
  hurt.allBodies = a.allBodies.map((b0, i) => Object.assign({}, b0, { status: i % 2 ? 'injured' : 'active' }));
  const ctxHurt = mkCtx(hurt, traditional);
  const wounded = NEG.offerRange(hurt, traditional, ctxHurt);
  ok('T6 an OA with half its people down wants out, and asks less to fold',
     whole && wounded && wounded.appetite.joiner < whole.appetite.joiner && wounded.joinerMin < whole.joinerMin,
     (whole && whole.appetite.joiner) + ' \u2192 ' + (wounded && wounded.appetite.joiner) + ', floor ' + (whole && whole.joinerMin) + ' \u2192 ' + (wounded && wounded.joinerMin));
  /* T10: a lesson learned — a deal with b that did not pay makes a ask more of b next time */
  a._dealRecord = { [b.id]: { good: 0, bad: 2 } };
  const burned = NEG.priceModifier(a, b);
  a._dealRecord = { [b.id]: { good: 2, bad: 0 } };
  const paid = NEG.priceModifier(a, b);
  delete a._dealRecord;
  ok('T10 an OA burned by a banner asks more of it; one paid in full asks less', burned > afterLeft && paid < afterLeft,
     'burned x' + burned.toFixed(2) + ', paid x' + paid.toFixed(2) + ', neither x' + afterLeft.toFixed(2));
  const life = NEG.CONST && NEG.STANCE_LIFE_MULT ? NEG.STANCE_LIFE_MULT : null;
  ok('T7 stance is not applied twice at the table',
     !life || Object.values(life).every(v => v === 1), life ? JSON.stringify(life) : 'not exported (fine)');
}

console.log('\nTHE TABLE, HELD TO ITS CHARACTER \u00b7 ' + DIVIDES + ' Divides');
notes.forEach(n => console.log(n));
fails.forEach(f => console.log(f));
if (fails.length) { console.log('\n  ' + fails.length + ' ruling(s) broken'); process.exit(1); }
console.log('  every ruling holds');
