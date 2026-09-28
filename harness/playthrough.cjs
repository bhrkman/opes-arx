/* §PLAYTHROUGH A YEAR AND A DIVIDE IN TEXT. A founded OA, played by a plain policy through two years, and every
   month written down: what the month put in front of the manager, what the manager did, and what came of it;
   then the Divide, window by window, the same way. For reading, not for a gate.
   `node harness/playthrough.cjs [seed] [years] > report.md` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js'), REP = require(D + 'reputation.js');
const ITEMS = require(D + 'items.js'), SPON = require(D + 'sponsors.js'), EV = require(D + 'events.js');
const OA = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const SEED = process.argv[2] || 'play-1', YEARS = +(process.argv[3] || 2);
const out = []; const say = (s) => out.push(s);
const cr = n => '₡' + Math.round(n).toLocaleString('en-US');
const nm = f => f.pair_name || f.name;
const SQN = ['Alpha', 'Beta', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
const sqName = q => SQN[q.sIdx != null ? q.sIdx : 0] || 'Squad';
const sum = f => Object.keys(f.stats || {}).reduce((t, k) => t + (f.stats[k] || 0), 0);
const cap = s => String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const alive = c => c.roster.filter(f => f.status !== 'dead' && f.status !== 'retired' && !f.mirror_of);
const oaName = id => (OA.find(o => o.id === id) || {}).name || (id === ME ? 'Your OA' : id);

/* the founding: the weakest berth makes way for a new OA, as the page does it */
const weakest = OA.slice().sort((a, b) => ((b.difficulty || 0) - (a.difficulty || 0)) || (((a.finance || {}).treasury_band || [0])[0] - ((b.finance || {}).treasury_band || [0])[0]))[0].id;
const ME = 'custom_house';
const prof = S.founderProfile(OA, 'Your OA', ME);
const oaList = OA.map(p => p.id === weakest ? prof : p);
const rng = P.mulberry32(P.seedFrom(SEED));
const corps = S.openFleet(rng, oaList, {});
let state = S.beginSeason(rng, corps, oaList, { human: ME });
const me = () => state.corps[ME];
const standing = (aud) => Math.round(REP.standing(me().rep, aud));
const snap = () => ({ t: me().account.treasury, n: alive(me()).length, own: standing('own'), fleet: standing('fleet'), pat: me().rep.patience });

function listPool() {
  const R = state.recruitDraft; if (!R) return;
  const order = R.order.slice(0, state.ids.length).map((id, i) => (i + 1) + '. ' + oaName(id)).join(', ');
  say('- **The Draft is open.** Sixteen rookies raised by the Aleas, two to an OA, on two-season rookie contracts. Order (weakest first): ' + order + '.');
  const pool = R.pool.filter(f => !f.mirror_of).sort((a, b) => sum(b) - sum(a));
  say('  - The pool, best first: ' + pool.slice(0, 6).map(f => nm(f) + ' (' + cap(f.race) + ', ' + sum(f) + ')').join(' · ') + (pool.length > 6 ? ' · and ' + (pool.length - 6) + ' more' : ''));
}
function doDraft() {
  const R = state.recruitDraft; if (!R || R.done) return;
  let guard = 0;
  while (!R.done && S.recruitDraftWhose(state) === ME && guard++ < 4) {
    const pool = R.pool.filter(f => !f.mirror_of).sort((a, b) => sum(b) - sum(a));
    const pick = pool[0]; S.recruitDraftPick(state, ME, pick.id);
    say('- Drafted **' + nm(pick) + '** (' + cap(pick.race) + ', ' + sum(pick) + ').');
  }
}
function listRenewals() {
  const rs = (S.renewalsFor(state, ME) || []).filter(r => !r.called); if (!rs.length) return;
  say('- **The Paper:** ' + rs.length + ' contract' + (rs.length > 1 ? 's' : '') + ' expiring — ' + rs.map(r => r.name + ' (was ' + cr(r.was * 12) + '/yr, asks ' + cr(r.year) + '/yr, ' + r.years + ' yrs)').join('; ') + '. Re-sign at the ask, haggle, or let them go; the call stands until the year turns.');
  return rs;
}
function doRenewals(rs) {
  if (!rs) return;
  for (const r of rs) {
    const f = me().roster.find(x => x.id === r.id);
    const keep = f && (f.fame || 0) >= 5 || (f && sum(f) > 500);
    S.answerRenewal(state, ME, r.id, keep ? 'resign' : 'release');
    say('- ' + (keep ? 'Re-signed **' + r.name + '** at ' + cr(r.year) + '/yr.' : 'Let **' + r.name + '** go.'));
  }
}
function listMarket() {
  const win = S.MONTHS[state.month]; if (!win || !win.signing) return null;
  const lot = S.lotFor(state, ME) || [];
  const word = { tryouts: 'Natural-Born window (your own ship’s; signing is yours to make)', bastille: 'Kier Bastille (conscripts; you offer a road out, they pick the shortest)', mercs: 'Mercenary market (one Divide; seven OAs bid, the fighter chooses)' }[win.signing];
  say('- **' + word + ', ' + (win.pool || '') + ' pool:** ' + lot.length + ' on the sheet.');
  lot.slice(0, 5).forEach(f => {
    const stats = f.hidden ? 'no service record' : Object.keys(f.stats || {}).map(k => k.slice(0, 3) + ' ' + Math.round(f.stats[k])).join(' ');
    const terms = win.signing === 'tryouts' ? (f.seasons + ' yrs, ' + cr(f.ask) + '/yr') : win.signing === 'mercs' ? ('ask ' + cr(f.ask) + ', fame ' + Math.round(f.fame || 0)) : ('sentence ' + (f.sentence || f.freedomReq) + ' Divides, fee ' + cr(f.fee || 0));
    say('  - ' + nm(f) + ' (' + cap(f.race) + ' ' + (f.age || '?') + ') — ' + stats + ' — ' + terms);
  });
  if (lot.length > 5) say('  - and ' + (lot.length - 5) + ' more');
  return { win, lot };
}
function doMarket(mk) {
  if (!mk) return;
  const { win, lot } = mk, c = me();
  const short = 18 - alive(c).length;
  if (short <= 0) { say('- Signed nobody: the books are full enough.'); return; }
  const ranked = lot.filter(f => !f.hidden).sort((a, b) => sum(b) - sum(a));
  if (win.signing === 'tryouts') {
    let n = 0;
    for (const f of ranked) { if (n >= Math.min(2, short)) break; if (f.ask > c.account.treasury * 0.08) continue;
      const r = S.signNow(state, ME, f.id); if (r.ok) { n++; say('- Signed **' + nm(f) + '** for ' + cr(f.ask) + '/yr, ' + f.seasons + ' seasons.'); } }
    if (!n) say('- Signed nobody: nothing on the sheet worth the ask.');
  } else if (win.signing === 'mercs') {
    let n = 0;
    for (const f of ranked) { if (n >= Math.min(2, short)) break; const bid = Math.round(f.ask * 1.15); if (bid > c.account.treasury * 0.15) continue;
      S.placeBid(state, ME, f.id, bid); n++; say('- Bid ' + cr(bid) + ' on **' + nm(f) + '** (ask ' + cr(f.ask) + '); they choose at month’s end.'); }
    if (!n) say('- Bid on nobody.');
  } else {
    let n = 0;
    for (const f of lot) { if (n >= Math.min(2, short)) break; const sent = f.sentence || f.freedomReq || 1;
      S.placeBid(state, ME, f.id, Math.max(1, sent - 1)); n++; say('- Offered **' + nm(f) + '** (' + cap(f.race) + ', ' + (f.age || '?') + ', notoriety ' + Math.round(f.fame || 0) + ') release after ' + Math.max(1, sent - 1) + ' Divide' + (sent - 1 === 1 ? '' : 's') + ' of a ' + sent + '-Divide sentence.'); }
  }
}
function listEvents() {
  const evs = S.eventsFor(state, ME) || []; if (!evs.length) return [];
  say('- **Dispatches:** ' + evs.map(e => '*' + e.title + '* — ' + e.text + ' [' + e.options.map(o => o.label + (o.cost ? ' (' + o.cost + ')' : '')).join(' / ') + ']').join(' '));
  return evs;
}
function doEvents(evs) {
  for (const e of evs) {
    let pick = e.options[0].id;
    if (e.pool === 'media') pick = e.options.some(o => o.id === 'standout') ? 'standout' : 'manager';
    if (e.pool === 'raise') pick = me().account.treasury > 150000 ? 'grant' : 'refuse';
    if (e.pool === 'poach') pick = 'refuse';
    if (e.pool === 'profile') pick = 'grant';
    const line = S.answerEvent(state, ME, e.id, pick);
    say('- Answered *' + e.title + '*: ' + (e.options.find(o => o.id === pick) || {}).label + ' → ' + line);
  }
}
function listLetters() {
  const ls = S.tradeLetters(state, ME) || []; if (!ls.length) return [];
  say('- **Letters:** ' + ls.map(l => oaName(l.from) + ' offers ' + JSON.stringify(l.offer) + ' for ' + JSON.stringify(l.ask)).join('; '));
  return ls;
}
function listFocus() {
  const tracks = S.monthTracks(me(), state.month);
  say('- **Focus (' + S.CONST.FOCUS_POINTS + ' points):** ' + tracks.map(t => t.name + (t.available ? '' : ' (shut)') + ' — ' + t.why).join(' · '));
  return tracks;
}
function listSponsors() {
  const B = state.sponsorBoard; if (!B || !B.houses) return;
  const ids = SPON.houseIds();
  const mine = (me().sponsors && me().sponsors.contracts) || [];
  if (mine.length) say('- **Sponsors signed:** ' + mine.map(c => cap(String(c.house).replace('spn_', '')) + ' (' + (SPON.contractStatus(me(), c) || {}).word + ')').join('; '));
  else say('- **Sponsors:** ' + ids.length + ' houses on the board, each on one condition; courting spends focus and builds regard.');
}
function listBoard() {
  const b = me().rep && me().rep.goal; if (!b) return;
  say('- **The board’s card:** ' + JSON.stringify(b).slice(0, 220) + ' · patience ' + me().rep.patience);
}
function chooseFocus(tracks) {
  const c = me(), hurt = alive(c).filter(f => f.condition && (f.condition.injuries || []).length).length;
  const w = {};
  const rest = hurt ? 2 : 0, scout = state.month <= 10 ? 2 : 0, court = 1;
  w.train = S.CONST.FOCUS_POINTS - rest - scout - court; w.trainTarget = { all: w.train, col: {}, row: {}, cell: {} };
  if (rest) { w.rest = rest; w.restTarget = { all: rest, col: {}, row: {}, cell: {} }; }
  if (scout) { w.scout = scout; w.intelTarget = state.month < 7 ? { planet: scout } : { [state.ids.find(id => id !== ME)]: scout }; }
  const ids = SPON.houseIds(); const house = ids.find(h => /thorne/.test(h)) || ids[0];
  w.court = court; w.courtTarget = { [house]: court };
  say('- Focus: ' + w.train + ' on drilling everyone' + (rest ? ', ' + rest + ' on rest for the ' + hurt + ' hurt' : '') + (scout ? ', ' + scout + ' on intel (' + (state.month < 7 ? 'the planet' : 'a rival') + ')' : '') + ', ' + court + ' courting ' + cap(house.replace('spn_', '')) + '.');
  return w;
}
function eightAndMedia() {
  if (state.month === 8) { const f = S.eightPick(me()); if (f) { S.nameForEight(state, ME, f.id); say('- Named **' + nm(f) + '** for the Eight.'); } }
}
function delta(a, b) {
  const d = [];
  d.push('treasury ' + cr(a.t) + ' → ' + cr(b.t) + ' (' + (b.t - a.t >= 0 ? '+' : '−') + cr(Math.abs(b.t - a.t)) + ')');
  if (a.n !== b.n) d.push('on the books ' + a.n + ' → ' + b.n);
  if (a.own !== b.own) d.push('own people ' + a.own + ' → ' + b.own);
  if (a.fleet !== b.fleet) d.push('fleet ' + a.fleet + ' → ' + b.fleet);
  if (a.pat !== b.pat) d.push('patience ' + a.pat + ' → ' + b.pat);
  return d.join('; ');
}

function playYear(year) {
  say('\n# Year ' + year + ' — the preparation\n');
  const c = me();
  say('Opening: ' + alive(c).length + ' on the books, ' + cr(c.account.treasury) + ' in the bank, board patience ' + c.rep.patience + ', planet **' + (state.planet.archetypeName || cap(state.planet.archetype)) + '**.');
  listBoard();
  while (state.month <= S.CONST.PREP_MONTHS) {
    const m = state.month, win = S.MONTHS[m];
    say('\n## Month ' + m + ' · ' + win.name + '\n');
    const before = snap(); const ledgerAt = me().account.ledger.length;
    say('**On the desk:**');
    if (m === 1) listPool();
    const rs = listRenewals();
    const mk = listMarket();
    const evs = listEvents();
    const ls = listLetters();
    const tracks = listFocus();
    listSponsors();
    if (m === 8) say('- **The Eight:** one of yours against the fleet’s, two fours seeded by standing, a purse to the winning four. Unnamed, your best goes.');
    say('\n**What you did:**');
    doDraft(); doRenewals(rs); doMarket(mk); doEvents(evs);
    for (const l of ls) { S.answerTrade(state, l.id, false); say('- Declined ' + oaName(l.from) + '’s letter.'); }
    eightAndMedia();
    const w = chooseFocus(tracks);
    S.submitMonth(state, ME, w);
    const adv = S.advanceMonth(state, { force: true });
    const res = adv.res || {};
    const after = snap();
    say('\n**The month closed:** ' + delta(before, after) + '.');
    const lines = me().account.ledger.slice(ledgerAt).filter(l => !/Gate and Merchandise|^retainers$/.test(l.label));
    if (lines.length) say('- The ledger: ' + lines.map(l => cap(l.label) + ' ' + (l.amount >= 0 ? '+' : '−') + cr(Math.abs(l.amount))).join('; ') + '.');
    if (state.mercs && state.mercs.scraped && state.mercs.scraped !== (state._scrapedSeen || 0)) { say('- **The board filled your roster** to the drop floor with hired hands, at a price and a patience hit.'); state._scrapedSeen = state.mercs.scraped; }
    const landed = (res.landed && res.landed[ME]) || [];
    const cameIn = landed.filter(l => l && l.name); if (cameIn.length) say('- Came aboard: ' + cameIn.map(f => nm(f)).join(', ') + '.');
    if (res.event === 'dividend' && state.dividend && state.dividend.watch) {
      const mine = (state.dividend.watch || []).find(x => x.corps.indexOf(ME) >= 0);
      if (mine) say('- The Dividend: ' + mine.corps.map(oaName).join(' vs ') + ' ' + mine.score.join('–') + (mine.winnerId ? ', ' + oaName(mine.winnerId) + ' took the purse' : ', drawn') + '.');
    }
    if (res.event === 'eight' && state.eight && state.eight.result) { const R = state.eight.result; say('- The Eight: ' + (R.winner ? (R.teams[R.winner].some(t => t.corp === ME) ? 'your four took it, ' + cr(R.share) + ' each' : 'your four lost') : 'drawn') + '.'); }
    if (res.event === 'fleet') { const fl = state.fleet && state.fleet.pending; if (fl) say('- The fleet’s month: ' + fl.id + (fl.withdrawn ? ' (petitioned down)' : '') + '.'); }
  }
}

function playDivide(year) {
  say('\n# Year ' + year + ' — the Divide\n');
  S.closeSeasonToDrop(state);
  /* the landings: pick the middle free slot each turn */
  const Dft = state.drop.draft; let g = 0;
  while (Dft && !Dft.done && g++ < 12) { if (S.draftWhose(state) === ME) { const free = []; for (let i = 0; i < (Dft.slots || S.SLOT_MIN); i++) if (Dft.taken[i] == null) free.push(i); S.draftPick(state, ME, free[Math.floor(free.length / 2)]); } S.draftAdvance(state); }
  /* squads: the fittest twenty in four squads of five, kitted decently; the rest in reserve */
  const c = me();
  const fit = alive(c).filter(f => f.status === 'active' && !(f.condition && (f.condition.injuries || []).length)).sort((a, b) => sum(b) - sum(a));
  const drop = fit.slice(0, 20), reserve = fit.slice(20, 30);
  const groups = [[], [], [], []]; drop.forEach((f, i) => groups[i % 4].push(f.id));
  const leaders = groups.map(gr => gr[0] || null);
  const doc = ITEMS.doctrineForCorp ? (ITEMS.doctrineForCorp(ME) || {}) : {};
  const tier = Math.min(doc.armoury_max_tier || 5, 3);
  const best = (slot, t, key) => { const items = ITEMS.bySlot(slot).filter(it => it.tier <= t); items.sort((x, y) => (y.tier - x.tier) || (((y.effects || {})[key] || 0) - ((x.effects || {})[key] || 0))); return items[0] ? items[0].id : null; };
  const hand = {}; const h = { primary: best('primary', tier, 'power'), armor: best('armor', tier, 'protection'), sidearm: best('sidearm', Math.min(tier, 2), 'power'), mods: [], consumables: [best('consumable', 3, 'power')].filter(Boolean) };
  drop.concat(reserve).forEach(f => { hand[f.id] = JSON.parse(JSON.stringify(h)); if (f.bond_partner) hand[f.bond_partner] = JSON.parse(JSON.stringify(h)); });
  S.lockSquads(state, ME, { groups, leaders, hand, reserve: reserve.map(f => f.id) });
  say('The Lock: ' + drop.length + ' dropped in four squads of ' + Math.ceil(drop.length / 4) + ' (leaders ' + leaders.map(id => nm(c.roster.find(f => f.id === id))).join(', ') + '), ' + reserve.length + ' in reserve, kitted with the best tier-' + tier + ' kit the yard sells. Landing drafted weakest OA first.');
  const t0 = c.account.treasury;
  S.beginContest(state, { replay: true });
  let win = 0, st = S.contestStatus(state);
  const t1 = c.account.treasury; say('The drop cost ' + cr(t0 - t1) + ' (kit, purses, the Aleas’ entry).');
  while (st && !st.done && win < 40) {
    const v = S.contestView(state, ME); win++;
    if (!v) break;
    say('\n## Comms window ' + win + ' · day ' + v.day + '\n');
    const you = v.you, mySq = (you.squads || []).filter(q => (q.bodies || []).some(b => b.status === 'active'));
    say('**The ground:** ' + Math.round((v.zone.r / (state.planet.radius || 1)) * 100) + '% inside the wall. ' + (v.weather && v.weather.kind ? 'Weather: ' + cap(v.weather.kind) + '. ' : ''));
    const rec = v.record || [], lastDay = rec[rec.length - 1];
    if (lastDay && (lastDay.ops || []).length) say('**Your plan (day ' + lastDay.d + '):** ' + lastDay.ops.map(o => cap(o.k) + (o.t ? ' ' + cap(o.t) : '') + ' with ' + o.n + ' squad' + (o.n > 1 ? 's' : '') + (o.why ? ' (' + o.why + ')' : '')).join('; ') + '.');
    say('**Your squads:** ' + (mySq.length ? mySq.map(q => sqName(q) + ' — ' + q.bodies.filter(b => b.status === 'active').length + ' up, ' + (q._why || (q.intent && q.intent.role) || 'holding') + (q._op ? ' (op: ' + q._op.kind + ')' : '') + ', rations ' + Math.round(q.rations || 0) + 'd').join('; ') : 'none standing') + '.');
    const others = (v.corps || []).filter(x => x.id !== ME);
    say('**The fleet:** ' + others.map(x => oaName(x.id) + ' ' + (x.withdrawn ? 'gone' : (x.standing ? x.standing.up + '/' + x.standing.of : '?')) + ((v.contact || {})[x.id] ? ' (' + ((v.contact[x.id].huntedBy && 'hunting you') || (v.contact[x.id].beat && 'you beat them') || (v.contact[x.id].lostTo && 'beat you') || 'fought') + ')' : '')).join(' · ') + '.');
    const fights = (v.fights || []).filter(f => (f.corps || []).indexOf(ME) >= 0);
    if (fights.length) say('**Since the last window:** ' + fights.map(f => 'day ' + f.day + (f.night ? ' (night)' : '') + ' ' + f.corps.map(oaName).join(' met ') + ' — ' + (f.result || '')).join('; ') + '.');
    const asks = v.withdrawAsks || [];
    if (asks.length) say('**Offers to leave:** ' + asks.map(a => oaName(a.from) + ' asks ' + Math.round((a.terms.credits || 0) * 100) + '% of the pot').join('; ') + '.');
    const table = v.table || {};
    const pactable = Object.keys(table).filter(id => table[id] && table[id].pact && table[id].pact.possible !== false);
    if (v.ransoms && v.ransoms.length) say('**Ransoms:** ' + v.ransoms.length + ' on the table.');
    say('**Chance of winning:** ' + Math.round(((v.odds || {})[ME] || 0) * 100) + '%.');
    /* the answer: stances by circumstance, a truce with the strongest when weak, promises when a leaver asks */
    const answer = { squadStance: {} };
    const myUp = you.allBodies.filter(b => b.status === 'active').length;
    const strongest = others.filter(x => !x.withdrawn && x.standing).sort((a, b) => b.standing.up - a.standing.up)[0];
    const words = [];
    mySq.forEach((q) => { const up = q.bodies.filter(b => b.status === 'active').length; const st2 = up >= 4 ? 'standard' : up >= 2 ? 'measured' : 'preservationist'; answer.squadStance[q.sIdx != null ? q.sIdx : you.squads.indexOf(q)] = st2; });
    const NW = { preservationist: 'Avoid', measured: 'Wary', standard: 'Engage', unyielding: 'Press', death_or_glory: 'All In' };
    words.push('stances set ' + mySq.map((q) => sqName(q) + ' ' + NW[answer.squadStance[q.sIdx != null ? q.sIdx : you.squads.indexOf(q)]]).join(', '));
    if (strongest && myUp < strongest.standing.up * 0.7 && table[strongest.id] && table[strongest.id].pact && !v.pacts) { answer.deal = { kind: 'pact', corp: strongest.id, terms: { credits: 2000 } }; words.push('sought a truce with ' + oaName(strongest.id) + ', sweetened ' + cr(2000)); }
    if (asks.length) { answer.withdrawReplies = {}; const promised = Object.keys(you._promisedTo || {}).length;
      asks.forEach((a, i) => { const yes = (a.terms.credits || 0) <= 0.1 && promised + i < 2; answer.withdrawReplies[a.from] = yes; if (yes) (you._promisedTo = you._promisedTo || {})[a.from] = 1; words.push((yes ? 'promised ' : 'refused ') + oaName(a.from) + ' (' + Math.round((a.terms.credits || 0) * 100) + '%)'); }); }
    if (myUp <= 4 && others.some(x => !x.withdrawn) && !v.withdrawOffer) { answer.withdrawOffer = { credits: 0.12 }; words.push('posted an offer to leave for 12% of the pot'); }
    say('**What you did:** ' + words.join('; ') + '.');
    S.answerContest(state, ME, answer);
    S.advanceContest(state, { force: true });
    st = S.contestStatus(state);
    const echo = S.contestView(state, ME) && S.contestView(state, ME).echo;
    if (echo && echo.kind === 'pact') say('- The truce was ' + (echo.accepted ? 'accepted' : 'refused') + ' (chance ' + Math.round((echo.chance || 0) * 100) + '%).');
  }
  const res = S.contestResult(state);
  say('\n## The settlement\n');
  const place = res.placement && res.placement[ME];
  say('Winner: **' + oaName(res.winner || 'nobody') + '**. You placed ' + (place ? place + (place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th') : '—') + ' of ' + state.ids.length + ' after ' + res.days + ' days.');
  const pc = (res.perCorp || []).find(x => x.id === ME) || {};
  const deadN = me().roster.filter(f => f.status === 'dead' && f._diedSeason === state.season).length; const dropped = pc.dropped || 0;
  say('Your people: ' + (pc.permanent != null ? pc.permanent + ' lost for good' : (pc.dead != null ? pc.dead + ' dead' : '')) + (pc.injuredHome != null ? ', ' + pc.injuredHome + ' came home hurt' : '') + (pc.withdrew ? ', withdrew day ' + pc.withdrew.day : ', fought to the end') + '.');
  const rec = S.finishSeason(state, res);
  const c2 = me();
  say('The books: ' + cr(c2.account.treasury) + ' in the bank (' + (c2.account.treasury - t1 >= 0 ? '+' : '−') + cr(Math.abs(c2.account.treasury - t1)) + ' over the contest). Board patience ' + c2.rep.patience + '; own people ' + standing('own') + ', fleet ' + standing('fleet') + '.');
  const b = c2._board; if (b && b.outcome) { const q = REP.question(b.outcome); say('The board asks: “' + q.ask + '” You answer candidly.'); S.answerBoard(state, ME, 'candid'); }
  if (rec && rec.log && rec.log.length) say('Offseason: ' + rec.log.filter(l => l.indexOf(ME) === 0).join('; '));
}

for (let y = 1; y <= YEARS; y++) {
  playYear(y);
  playDivide(y);
  if (y < YEARS) state = S.beginSeason(state.rng, corps, oaList, { human: ME });
}
process.stdout.write(out.join('\n') + '\n');
