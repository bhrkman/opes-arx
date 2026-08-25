/* Bakes real Divides into negotiation_table.html. Nothing here invents a number:
   every figure on the page is lifted from a run of the actual sim. */
const fs = require('fs'), path = require('path');
const D = __dirname + '/';
const P = require(D + 'prng.js'), DIV = require(D + 'divide.js'), gen = require(D + 'roster.js');
const NEG = require(D + 'negotiate.js'), MAP = require(D + 'map.js'), LED = require(D + 'ledger.js');
const ITEMS = require(D + 'items.js'), REP = require(D + 'reputation.js');
/* Data lives in `../data`, not beside the code. This read `sim/oa_profiles.json` and threw
   ENOENT, so the viewer could not be rebuilt at all — which is why `the_table.html` still dates
   from before Step 7.5 and shows a game that no longer exists. A build script that cannot run
   is worse than a stale artifact, because the staleness is invisible until somebody tries. */
const OA = JSON.parse(fs.readFileSync(D + '../data/oa_profiles.json', 'utf8')).oa_profiles;
const NAME = {}; OA.forEach(p => NAME[p.id] = p.name);
const TAG = {}; OA.forEach(p => TAG[p.id] = p.tag);
const COL = {}; OA.forEach(p => COL[p.id] = p.colors.primary);

const SEEDS = ['VC-103', 'VC-104', 'VC-105', 'VC-106', 'VC-107', 'VC-108'];
const runs = [];

for (const seed of SEEDS) {
  const s = DIV.runDivide(P.mulberry32(P.seedFrom(seed)), {
    oaProfiles: OA, raceById: gen.raceById, replay: true
  });
  const R = s.replay;
  /* per-day: ring radius, squads still alive, banners standing, bodies standing */
  const days = R.days.map(d => {
    const alive = d.sq.filter(q => q.n > 0);
    return {
      d: d.d, r: d.z.r,
      squads: alive.length,
      bodies: d.corp.reduce((a, c) => a + c.a, 0),
      dead: d.corp.reduce((a, c) => a + c.p, 0),
      fights: (d.ev || []).filter(e => e.t === 'deal' || e.t === 'betray').length
    };
  });
  const deals = s.deals.filter(d => d.kind !== 'pact').map(d => ({
    joiner: d.joiner, principal: d.principal, day: d.day, share: d.share,
    credits: d.credits, standDown: d.standDown, why: d.why || null, void: !!d.void
  }));
  const pacts = s.deals.filter(d => d.kind === 'pact').length;
  /* the most instructive refusals: the ones that came closest */
  const near = s.refusals.slice().sort((a, b) => a.short - b.short).slice(0, 6)
    .map(r => ({ joiner: r.joiner, principal: r.principal, day: r.day,
                 short: r.short, wanted: r.why.joinerMin, offered: r.why.principalMax }));

  /* book each corp's season so the page can show money, not just percentages */
  const corps = s.perCorp.map(pc => {
    const prof = OA.find(p => p.id === pc.id);
    const rng = P.mulberry32(P.seedFrom('ros' + seed + pc.id));
    const roster = []; for (let k = 0; k < 4; k++) roster.push.apply(roster, gen.generateSquad(rng, 8, { corpId: pc.id }).bodies);
    const acct = LED.open(prof);
    const budget = LED.procurementBudget(acct, roster);
    const doc = ITEMS.doctrineForCorp(pc.id).id;
    const plan = ITEMS.planForce(doc, 24, { budget: budget, armoury: ITEMS.foundingArmoury(doc, 24).stock });
    const before = acct.treasury;
    LED.bookDivide(acct, { payout: pc.payout, bonuses: pc.won ? (s.settlement.bonuses.total || 0) : 0 });
    LED.settleSeason(acct, roster, { procurement: plan.mustered ? plan.spentCash : 0,
      injuries: pc.injuredHome, deaths: pc.permanent, windows: 4 });
    return {
      id: pc.id, policy: pc.policy, permanent: pc.permanent, injured: pc.injuredHome,
      captured: pc.captured, payout: Math.round(pc.payout), won: pc.won,
      joinedTo: pc.joinedTo, standDown: pc.standDown, assay: pc.oreCredit,
      treasuryBefore: before, treasuryAfter: acct.treasury
    };
  });

  runs.push({
    seed: seed, days: days, length: s.days, winner: s.winner,
    pot: s.planet.pot.value, archetype: s.planet.archetypeName || s.planet.archetype,
    deals: deals, pacts: pacts, near: near, corps: corps,
    betrayals: s.betrayals, captives: s.captiveOutcomes,
    engagements: s.engagements,
    bonuses: s.settlement.bonuses
  });
}

const K = {
  steps: MAP.CONST.ZONE_STEPS, stepDays: MAP.CONST.ZONE_STEP_DAYS,
  lastFrac: MAP.CONST.LAST_GROUND_FRAC, lastDay: MAP.CONST.LAST_GROUND_DAY,
  planet: MAP.CONST.PLANET_RADIUS, engage: DIV.CONST.ENGAGE_RANGE,
  potBase: NEG.CONST.POT_BASE, assay: NEG.CONST.ASSAY_VALUE,
  foldBase: NEG.CONST.FOLD_BASE, uglyPremium: REP.CONST.UGLY_PREMIUM_MAX,
  uglyWall: REP.CONST.UGLY_WALL, joinAlly: DIV.CONST.JOIN_ALLY_P,
  mercBonus: NEG.CONST.WIN_BONUS_MERC
};

const DATA = JSON.stringify({ runs, K, NAME, TAG, COL, sealed: OA.filter(p => p.no_negotiation).map(p => p.id) });
const tpl = fs.readFileSync(D + '../viewers/table_template.html', 'utf8');
/* ../viewers, not beside the code. It wrote into `sim/` and reported success, so the viewer in
   `viewers/` stayed stale while the build said it had rebuilt it. */
fs.writeFileSync(D + '../viewers/negotiation_table.html', tpl.replace('/*__DATA__*/null', DATA));
console.log('negotiation_table.html written —', runs.length, 'baked Divides,',
            runs.reduce((a, r) => a + r.deals.length, 0), 'deals,',
            Math.round(fs.statSync(D + '../viewers/negotiation_table.html').size / 1024) + 'KB');
