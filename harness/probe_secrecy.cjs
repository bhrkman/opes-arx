/* §SECRECY EACH SEAT SEES ONLY WHAT IT KNOWS. Two human seats, several windows: in each seat's view a rival is a shell
   (no roster, no squads, no positions), neither the contest's internal state nor the true ground is sent, the record
   holds only the seat's own squads, and no rival fighter's id appears anywhere — except in the fights this seat was
   in, where it met them. `node harness/probe_secrecy.cjs` */
const D = '/home/claude/opes-arx/sim/', fs = require('fs');
const P = require(D + 'prng.js'), S = require(D + 'season.js'), DIV = require(D + 'divide.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const rng = P.mulberry32(P.seedFrom('secret')); const c = S.openFleet(rng, oa, {}); const A = oa[1].id, B = oa[4].id;
const st = S.beginSeason(rng, c, oa, { humans: [A, B] });
while (st.month <= S.CONST.PREP_MONTHS) { S.submitMonth(st, A, {}); S.submitMonth(st, B, {}); S.advanceMonth(st); }
S.closeSeasonToDrop(st); S.draftAdvance(st, null, { force: true });
const d = S.prepareDivide(st);
const idsOf = {}; for (const id of st.ids) idsOf[id] = new Set(c[id].roster.map(f => f.id));
const gen = DIV.divideCore(d.rng, d.opts); let step = gen.next();
const fails = []; let windows = 0;
while (!step.done && windows < 8) {
  windows++;
  for (const seat of [A, B]) {
    const v = step.value.seats[seat]; if (!v) continue;
    for (const x of v.corps) if (x.id !== seat && ((x.squads || []).length || (x.allBodies || []).length))
      fails.push('window ' + windows + ': ' + seat + ' sees the squads or roster of ' + x.id);
    if (v.stats !== undefined || v.planet !== undefined) fails.push('window ' + windows + ': internal state or true ground sent to ' + seat);
    const idx = v.corps.findIndex(x => x.id === seat);
    if ((v.record || []).some(day => (day.sq || []).some(q => q.c !== idx))) fails.push('window ' + windows + ': another OA in ' + seat + "'s record");
    const bare = Object.assign({}, v, { fights: undefined, seats: undefined });
    const seen = new WeakSet();   /* a view still holds live engine objects, which point at each other */
    const text = JSON.stringify(bare, (k, val) => { if (val && typeof val === 'object') { if (seen.has(val)) return undefined; seen.add(val); } return val; });
    for (const other of st.ids) if (other !== seat) for (const fid of idsOf[other])
      if (text.indexOf('"' + fid + '"') >= 0) { fails.push('window ' + windows + ': ' + seat + ' holds rival fighter ' + fid + ' of ' + other); break; }
  }
  step = gen.next({ bySeat: { [A]: {}, [B]: {} } });
}
const uniq = [...new Set(fails)];
console.log(uniq.length ? '  FAIL  ' + uniq.slice(0, 4).join(' | ') + (uniq.length > 4 ? ' … (' + uniq.length + ')' : '')
                        : '  ok    each seat sees only what it knows: ' + windows + ' windows, two seats, no rival roster, squad, position or fighter');
process.exit(uniq.length ? 1 : 0);
