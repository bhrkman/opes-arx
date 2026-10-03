/* §SECRECY EACH SEAT SEES ONLY WHAT IT KNOWS. Two human seats, several windows, the replay on as the page runs it.
   In each seat's view a rival is a shell (no roster, no squads), neither the contest's internal state nor the true
   ground is sent, and no rival fighter's id appears anywhere except in the fights it was in and the captives it holds.
   The seat's record, checked against the engine's true record (the same contest run alongside with debug views):
     - its own squads in full, every day, exactly as the engine recorded them;
     - a rival squad only on a day the seat's squads knew of it, and then only {i,c,s,z,n,seen};
     - a rival banner only {a, sd};
     - only its own events and the public ones (weather, wall, region_gone, zone_gone), and all of those.
   And the broadcast `field`, which is public by ruling: every squad on the ground, whose, where and how many.
   `node harness/probe_secrecy.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const A = oa[1].id, B = oa[4].id, WINDOWS = 8;
const PUBLIC = { weather: 1, wall: 1, region_gone: 1, zone_gone: 1 };
function open(debug) {
  const rng = P.mulberry32(P.seedFrom('secret')); const c = S.openFleet(rng, oa, {});
  const st = S.beginSeason(rng, c, oa, { humans: [A, B] });
  while (st.month <= S.CONST.PREP_MONTHS) { S.submitMonth(st, A, {}); S.submitMonth(st, B, {}); S.advanceMonth(st); }
  S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
  const d = S.prepareDivide(st); d.opts.replay = true; if (debug) d.opts.debugViews = true;
  return { st, c, gen: DIV.divideCore(d.rng, d.opts) };
}
const run = open(false), truth = open(true);
const st = run.st, c = run.c;
const idsOf = {}; for (const id of st.ids) idsOf[id] = new Set(c[id].roster.map(f => f.id));
let step = run.gen.next(), tstep = truth.gen.next();
const fails = []; let windows = 0, rivalSeen = 0, ownDays = 0, evChecked = 0, ownEv = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
while (!step.done && !tstep.done && windows < WINDOWS) {
  windows++;
  const W = 'window ' + windows;
  const T = tstep.value.seats[A] || tstep.value.seats[B];
  const tdays = T.record, tcorps = T.corps;
  if (step.value.day !== tstep.value.day) { fails.push(W + ': the debug run drifted from the seat run (day ' + step.value.day + ' vs ' + tstep.value.day + ')'); break; }
  for (const seat of [A, B]) {
    const v = step.value.seats[seat]; if (!v) continue;
    for (const x of v.corps) if (x.id !== seat && ((x.squads || []).length || (x.allBodies || []).length))
      fails.push(W + ': ' + seat + ' sees the squads or roster of ' + x.id);
    if (v.stats !== undefined || v.planet !== undefined || v.ground !== undefined) fails.push(W + ': internal state or true ground sent to ' + seat);
    const ci = tcorps.findIndex(x => x.id === seat);
    if (v.corps.findIndex(x => x.id === seat) !== ci) fails.push(W + ': the corps are not in the engine order');
    /* the record */
    const rec = v.record;
    if (!Array.isArray(rec) || (!rec.length && tdays.length)) { fails.push(W + ': ' + seat + ' has no record with the replay on'); continue; }
    if (rec.length !== tdays.length) fails.push(W + ': ' + seat + "'s record has " + rec.length + ' days, the engine ' + tdays.length);
    rec.forEach((day, k) => {
      const D0 = tdays[k]; if (!D0) return;
      const known = (D0.kn && D0.kn[seat]) || [];
      const ownTrue = D0.sq.filter(q => q.c === ci), ownGot = day.sq.filter(q => q.c === ci);
      if (!same(ownGot, ownTrue)) fails.push(W + ' day ' + day.d + ': ' + seat + "'s own squads are not in full");
      else if (ownTrue.length) ownDays++;
      for (const q of day.sq) {
        if (q.c === ci) continue;
        const keys = Object.keys(q).sort().join(',');
        if (keys !== 'c,i,n,s,seen,z') fails.push(W + ' day ' + day.d + ': a rival squad in ' + seat + "'s record carries " + keys);
        if (known.indexOf(q.i) < 0) fails.push(W + ' day ' + day.d + ': ' + seat + ' holds rival squad ' + q.i + ' it did not know of that day');
        const t = D0.sq.find(x => x.i === q.i);
        if (!t || t.z !== q.z || t.n !== q.n) fails.push(W + ' day ' + day.d + ': rival squad ' + q.i + ' is not where the engine had it');
        rivalSeen++;
      }
      for (const i of known) if (!day.sq.some(q => q.i === i)) fails.push(W + ' day ' + day.d + ': ' + seat + ' knew of squad ' + i + ' and its record lost it');
      day.corp.forEach((cr, j) => {
        if (j === ci) { if (!same(cr, D0.corp[j])) fails.push(W + ' day ' + day.d + ': ' + seat + "'s own banner line is not in full"); return; }
        const keys = Object.keys(cr).sort().join(',');
        if (keys !== 'a,sd') fails.push(W + ' day ' + day.d + ': a rival banner in ' + seat + "'s record carries " + keys);
      });
      const mine = e => PUBLIC[e.t] || [e.c, e.on, e.by, e.from].indexOf(seat) >= 0 || (e.corps || []).indexOf(seat) >= 0;
      for (const e of day.ev || []) if (!mine(e)) fails.push(W + ' day ' + day.d + ': ' + seat + ' holds an event not its own: ' + JSON.stringify(e).slice(0, 80));
      const want = (D0.ev || []).filter(mine);
      if (!same(day.ev || [], want)) fails.push(W + ' day ' + day.d + ': ' + seat + "'s events are not all of its own and the public ones");
      evChecked += want.length; ownEv += want.filter(e => !PUBLIC[e.t]).length;
    });
    /* the broadcast field: every contest squad, whose, where, how many — the truth */
    const all = []; for (const tc of tcorps) for (const sq of tc.squads) if (sq._cq) all.push(sq._cq);
    const field = v.field || [];
    if (field.length !== all.length) fails.push(W + ': the field shows ' + field.length + ' squads of ' + all.length);
    for (const cq of all) {
      const f = field.find(x => x.oa === cq.oa && x.s === cq.s);
      if (!f) { fails.push(W + ': the field misses ' + cq.oa + ' squad ' + cq.s); continue; }
      if (f.zone !== cq.zone || f.n !== cq.n || f.alive !== cq.alive) fails.push(W + ': the field has ' + cq.oa + ' squad ' + cq.s + ' at ' + f.zone + '/' + f.n + ', the engine at ' + cq.zone + '/' + cq.n);
      const keys = Object.keys(f).sort().join(',');
      if (keys !== 'alive,fight,n,oa,s,zone') fails.push(W + ': a field entry carries ' + keys);
    }
    /* no rival fighter id anywhere but the fights it was in, its captor's side of a ransom, and the captives it holds */
    const table = v.table ? Object.assign({}, v.table, { ransoms: (v.table.ransoms || []).filter(r => r.side !== 'captor') }) : v.table;
    const captives = v.captives ? { taken: v.captives.taken, held: [], toDecide: [] } : v.captives;
    const bare = Object.assign({}, v, { fights: undefined, seats: undefined, table: table, captives: captives });
    const seen = new WeakSet();
    const text = JSON.stringify(bare, (k, val) => { if (val && typeof val === 'object') { if (seen.has(val)) return undefined; seen.add(val); } return val; });
    for (const other of st.ids) if (other !== seat) for (const fid of idsOf[other])
      if (text.indexOf('"' + fid + '"') >= 0) { fails.push(W + ': ' + seat + ' holds rival fighter ' + fid + ' of ' + other); break; }
  }
  step = run.gen.next({ bySeat: { [A]: {}, [B]: {} } });
  tstep = truth.gen.next({ bySeat: { [A]: {}, [B]: {} } });
}
if (!rivalSeen) fails.push('no rival squad ever entered a record: the knowing half was never tested');
if (!ownDays) fails.push('no own squad was ever compared');
if (!ownEv) fails.push('no event of a seat\'s own was ever in its record: the own-events half was never tested');
const uniq = [...new Set(fails)];
console.log(uniq.length ? '  FAIL  ' + uniq.slice(0, 5).join(' | ') + (uniq.length > 5 ? ' … (' + uniq.length + ')' : '')
  : '  ok    each seat sees only what it knows: ' + windows + ' windows, two seats; own squads in full (' + ownDays + ' seat-days), ' + rivalSeen + ' rival sightings each known that day and bare, rival banners {a,sd}, ' + evChecked + ' events its own (' + ownEv + ') or public, the field true; no rival roster or fighter');
process.exit(uniq.length ? 1 : 0);
