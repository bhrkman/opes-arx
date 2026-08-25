/* Bakes a real THREE-SEASON CHAIN into audience_board.html.
 *
 * Nothing on the page is invented and nothing is reconstructed from a summary: the seasons
 * are run through the actual modules with the reputation records handed forward, which is
 * the only thing in the project that crosses a season boundary (REPUTATION.md R1). If the
 * sim changes, this page changes with it or the viewer-rot guard catches it.
 */
const fs = require('fs'), path = require('path');
const D = __dirname + '/';
/* Resolve data and templates the way arx.cjs does, so this runs in the layout the project
   ships in as well as in a flat tree. It previously assumed flat and broke on a checkout. */
function findFile(name) {
  for (const c of [path.join(__dirname, name),
                   path.join(__dirname, '..', 'data', name),
                   path.join(__dirname, '..', 'viewers', name),
                   path.join(__dirname, '..', 'docs', name),
                   path.join(__dirname, '..', name)]) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('cannot find ' + name);
}
const P = require(D + 'prng.js'), DIV = require(D + 'divide.js'), gen = require(D + 'roster.js');
const REP = require(D + 'reputation.js'), MAP = require(D + 'map.js'), LED = require(D + 'ledger.js');
const C = require(D + 'combat.js');
const OA = JSON.parse(fs.readFileSync(findFile('oa_profiles.json'), 'utf8')).oa_profiles;

const NAME = {}, TAG = {}, COL = {}, DIFF = {};
OA.forEach(p => { NAME[p.id] = p.name; TAG[p.id] = p.tag; COL[p.id] = p.colors.primary; DIFF[p.id] = p.difficulty; });
const IDS = OA.map(p => p.id);
const normaliseBanked = REP.bankedShare;   /* §6.1 — one definition, shared with the sim */

/* the reputation records that survive — opened once, then carried */
const reps = {};
for (const p of OA) reps[p.id] = REP.open(p, OA, { season: 1 });

/* how an AI manager answers the press. No dice: culture picks the register, which is what
   makes eight boards read differently across a chain. */
function registerFor(profile, outcome) {
  const d = profile.dials;
  if (outcome.won) return d.tradition > 60 ? 'gracious' : 'defiant';
  if (outcome.ceded && outcome.cededDay <= 5) return d.showmanship > 55 ? 'defiant' : 'evasive';
  if (outcome.permanentLosses >= 14) return d.tradition > 55 ? 'humble' : 'deflecting';
  if (d.showmanship > 60) return 'candid';
  if (d.tradition > 65) return 'humble';
  if (d.treachery > 55) return 'deflecting';
  return 'gracious';
}

const seasons = [];
for (let season = 1; season <= 3; season++) {
  const seed = 'AUD-' + season;
  for (const p of OA) REP.drainHolds(reps[p.id]);
  /* The board sets its card against the planet that will actually be played — `runDivide`
     does it from inside, right after it generates the ground, because a card written against
     a different roll of the same seed demands things that are not down there. */
  for (const p of OA) reps[p.id].season = season;
  const before = {};
  for (const id of IDS) before[id] = snapshot(reps[id]);

  const s = DIV.runDivide(P.mulberry32(P.seedFrom(seed)),
                          { oaProfiles: OA, raceById: gen.raceById, reputations: reps,
                            season: season, openSeason: true });

  const corps = [];
  for (const p of OA) {
    const rep = reps[p.id];
    const pc = s.perCorp.find(x => x.id === p.id) || {};
    const c = s.corps.find(x => x.id === p.id);
    const acct = LED.open(p);
    /* a corp that cannot arm its people asks the board, and the ask is what costs it (§6.5) */
    const need = Math.max(0, 220000 - acct.treasury - acct.grant + (pc.permanent || 0) * 4200);
    let call = { amount: 0, patienceCost: 0 };
    if (need > 0) call = LED.callOnBoard(acct, rep, Math.round(need), REP);

    const famousLost = (c ? c.allBodies : []).filter(b => b.status === 'dead'
                        && (b.fame || 0) >= REP.CONST.FAME_CEIL * 0.35).length;
    const outcome = {
      placement: s.placement[p.id], won: s.winner === p.id,
      banked: normaliseBanked(s.banked[p.id] || {}),
      permanentLosses: pc.permanent || 0, famousLosses: famousLost,
      surplus: Math.round((pc.payout || 0) - (pc.permanent || 0) * 4200),
      standingNow: 0,
      calls: call.amount > 0 ? 1 : 0,
      ceded: !!(c && c.joinedTo), cededDay: c ? c.joinedOnDay : 0
    };
    const q = REP.question(outcome);
    const reg = registerFor(p, outcome);
    /* who is put in front of the drones: the most famous body still walking */
    const speaker = (c ? c.allBodies : []).filter(b => b.status !== 'dead')
      .sort((a, b) => (b.fame || 0) - (a.fame || 0))[0] || null;
    const said = REP.address(rep, reg, { speaker: speaker, rivalIds: IDS,
      hooks: speaker ? C.hooksOf(speaker, gen.traitById) : null });

    const score = REP.scoreGoal(rep, outcome);
    const board = REP.movePatience(rep, score);
    REP.fillHolds(rep, outcome.banked);
    REP.recordCasualties(rep, outcome.permanentLosses, famousLost);
    rep.history.push({ season: season, placement: outcome.placement, won: outcome.won });

    corps.push({
      id: p.id, placement: outcome.placement, won: outcome.won,
      permanent: outcome.permanentLosses, famousLost: famousLost,
      ceded: outcome.ceded, cededDay: outcome.cededDay,
      payout: Math.round(pc.payout || 0),
      call: Math.round(call.amount), patienceCost: call.patienceCost,
      before: before[p.id], after: snapshot(rep),
      goal: { demands: rep.goal.demands, priority: rep.goal.priority, lines: score.lines,
              met: score.met, total: score.total, fraction: score.fraction },
      board: board,
      holds: Object.assign({}, rep.holds),
      banked: s.banked[p.id] || {},
      question: q.ask, register: reg,
      speaker: speaker ? { name: speaker.name, fame: Math.round(speaker.fame || 0),
                           traits: (speaker.traits || []).map(t => (t && t.id) || t).slice(0, 3) } : null,
      said: said.moved.filter(m => m.audience !== 'rival'),
      why: {
        own: REP.why(rep, 'own', null, 7),
        fleet: REP.why(rep, 'fleet', null, 7),
        aleas: REP.why(rep, 'aleas', null, 7)
      },
      rivalWhy: IDS.filter(x => x !== p.id).map(x => ({
        id: x, now: REP.standing(rep, 'rival', x), acts: REP.why(rep, 'rival', x, 4)
      }))
    });
  }

  seasons.push({
    season: season, seed: seed, winner: s.winner, days: s.days,
    planet: {
      name: s.planet.archetypeName, archetype: s.planet.archetype,
      richness: s.planet.richness, pot: s.planet.pot.value,
      composition: s.planet.composition
    },
    placement: s.placement,
    fallen: s.fallen || [],
    corps: corps
  });
}

function snapshot(rep) {
  const out = { own: REP.standing(rep, 'own'), fleet: REP.standing(rep, 'fleet'),
                aleas: REP.standing(rep, 'aleas'), patience: rep.patience, rival: {} };
  for (const id in rep.base.rival) out.rival[id] = REP.standing(rep, 'rival', id);
  return out;
}


const K = {
  floor: REP.CONST.STANDING_FLOOR, ceil: REP.CONST.STANDING_CEIL,
  halflife: REP.CONST.MEMORY_HALFLIFE, residue: REP.CONST.MEMORY_RESIDUE,
  headline: REP.CONST.HEADLINE_AT, fameCeil: REP.CONST.FAME_CEIL,
  fameTransfer: REP.CONST.FAME_KILL_TRANSFER, holdsDrain: REP.CONST.HOLDS_DRAIN,
  callRate: REP.CONST.CALL_PATIENCE_RATE, uglyWall: REP.CONST.UGLY_WALL,
  uglyPremium: REP.CONST.UGLY_PREMIUM_MAX, tolerance: REP.CONST.TOLERANCE_BASE,
  goalContent: REP.CONST.GOAL_CONTENT, registers: REP.REGISTERS
};

const DATA = JSON.stringify({ seasons, K, NAME, TAG, COL, DIFF, IDS });
const tpl = fs.readFileSync(findFile('audience_template.html'), 'utf8');
const OUT = path.join(path.dirname(findFile('audience_template.html')), 'audience_board.html');
fs.writeFileSync(OUT, tpl.replace('/*__DATA__*/null', DATA));
console.log('audience_board.html written —', seasons.length, 'seasons,',
            Math.round(fs.statSync(OUT).size / 1024) + 'KB');
