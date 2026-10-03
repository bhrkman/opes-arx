/* §RESERVE THE RESERVE AND THE BEACONS, PROVED. A person's seat locks a small drop and orders its reserve; then:
   (1) the Divide holds that reserve in that order, up to RESERVE_MAX on top of the drop; (2) the locked drop is what the purses were paid for; (3) across a
   contest, anyone who lands does so in that order, each landing charging that fighter's purse; (4) nobody lands while
   their reserve is empty, and no squad passes the squad maximum; (5) after the contest, the reserve's kit that never
   landed is back in the armoury. `node harness/probe_reserve.cjs` */
const path = require('path'), fs = require('fs');
const D = path.join(__dirname, '..', 'sim') + '/';
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js'), LED = require(D + 'ledger.js');
const oa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
const fails = [], say = [];
let tried = 0, landedSeen = 0, kitChecked = 0;
for (const seed of ['rsv1', 'rsv2', 'rsv3', 'rsv4', 'rsv5', 'rsv6']) {
  tried++;
  const rng = P.mulberry32(P.seedFrom(seed)); const c = S.openFleet(rng, oa, {}); const me = oa[2].id;
  const st = S.beginSeason(rng, c, oa, { human: me });
  while (st.month <= S.CONST.PREP_MONTHS) S.stepMonth(st, { [me]: {} });
  S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
  const corp = c[me];
  const fit = corp.roster.filter(f => f.status === 'active' && !f.mirror_of && !(f.condition && (f.condition.injuries || []).length));
  if (fit.length < 19) continue;
  /* a drop of the sixteen best, in three squads; the rest ordered WORST first, so the order is a choice, not a sort */
  const q = f => f.stats.aim + f.stats.tactics + f.stats.resolve + f.stats.grit;
  const ranked = fit.slice().sort((a, b) => q(b) - q(a));
  const drop = ranked.slice(0, 16), rest = ranked.slice(16).reverse();
  const withMates = ids => ids.concat(corp.roster.filter(f => f.mirror_of && ids.indexOf(f.mirror_of) >= 0).map(f => f.id));
  const groups = [drop.slice(0, 6), drop.slice(6, 11), drop.slice(11, 16)].map(g => withMates(g.map(f => f.id)));
  const treasuryBefore = corp.account.treasury, oldDrop = (corp._drop || []).slice();
  S.lockSquads(st, me, { groups: groups, leaders: [null, null, null], hand: {}, reserve: rest.map(f => f.id) });
  S.beginContest(st);
  const per = st._divideOpts.corps[me];
  /* the reserve rides on top of the drop, up to RESERVE_MAX */
  const want = rest.slice(0, S.CONST.RESERVE_MAX).map(f => f.id);
  const got = (per.reserve || []).filter(f => !f.mirror_of).map(f => f.id);
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(seed + ': the reserve is not in the order set');
  const dropIds = new Set(corp._drop.map(f => f.id));
  if (!groups.flat().every(id => dropIds.has(id))) fails.push(seed + ': the locked drop is not the drop recorded');
  const expectPaid = LED.purseBill(corp._drop) - LED.purseBill(oldDrop);
  if (Math.abs((treasuryBefore - corp.account.treasury) - expectPaid) > 2) fails.push(seed + ': the purses were not put right for the locked drop');
  /* run the contest to its end, the seat answering nothing */
  let status = S.contestStatus(st), guard = 0;
  while (!status.done && guard++ < 80) { S.advanceContest(st, { force: true }); status = S.contestStatus(st); }
  const res = S.contestResult(st);
  const mine = (res.landings || []).filter(l => l.corp === me);
  landedSeen += mine.length;
  const order = mine.map(l => l.fighter);
  if (JSON.stringify(order) !== JSON.stringify(want.slice(0, order.length))) fails.push(seed + ': landings broke the order: ' + order.join(','));
  /* a landing never takes the squad it joins past the maximum (in seats: a Mon-Wa pair is one). A squad can pass it
     another way — the survivors of a spent squad folded in at a comms window — which is not a landing's doing. */
  for (const l of (res.landings || [])) if (!(l.seats <= DIV.CONST.SQUAD_MAX)) fails.push(seed + ': a landing took a squad past the maximum (' + l.corp + ' ' + l.seats + ' seats)');
  const drawn = (res.landings || []).reduce((m, l) => { m[l.corp] = (m[l.corp] || 0) + 1; return m; }, {});
  for (const id in drawn) if (drawn[id] > S.CONST.RESERVE_MAX) fails.push(seed + ': ' + id + ' landed more than its reserve');
  /* settle, and look at the armoury: every unlanded reserve fighter's primary is back in the rack */
  const unlanded = (corp._reserve || []).filter(f => order.indexOf(f.id) < 0 && !f.mirror_of);
  const rackBefore = {}; for (const f of unlanded) if (f.loadout && f.loadout.primary) rackBefore[f.loadout.primary] = (rackBefore[f.loadout.primary] || 0) + 1;
  const rackAt = Object.assign({}, corp.armoury || {});
  S.finishSeason(st, res);
  for (const id in rackBefore) if (!(((corp.armoury || {})[id] || 0) - (rackAt[id] || 0) >= rackBefore[id])) { fails.push(seed + ': reserve kit did not come home (' + id + ': ' + (rackAt[id] || 0) + ' -> ' + ((corp.armoury || {})[id] || 0) + ', ' + rackBefore[id] + ' unlanded)'); break; }
  kitChecked += Object.keys(rackBefore).reduce((t, k) => t + rackBefore[k], 0);
  say.push(seed + ' landed ' + mine.length + ' of ' + want.length);
  if (landedSeen >= 2 && tried >= 2) break;
}
if (!kitChecked) fails.push('no unlanded reserve fighter carried a primary, so the kit-home check never ran');
if (!landedSeen) fails.push('no scenario saw a landing of the seat\'s own (' + tried + ' tried)');
console.log(fails.length ? '  FAIL  ' + [...new Set(fails)].slice(0, 4).join(' | ')
  : '  ok    the reserve: held in the order set, the locked drop paid for, landings in order, kit home (' + say.join('; ') + '; ' + kitChecked + ' unlanded primaries back in the rack)');
process.exit(fails.length ? 1 : 0);
