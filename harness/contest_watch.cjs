/* §CONTEST THE REBUILT GROUND, WATCHED. Builds a ground, drops eight OAs' squads one a region in the straight
   weakest-first order, and runs the month on sim/contest.js: at every window it prints where everybody is, what
   moved, what was heard, who the wall took, and the contacts recorded for the grid. The numbers at the end are
   what the planner, sight and noise actually do. `node harness/contest_watch.cjs [seed] [--quiet]` */
const path = require('path');
const P = require(path.join(__dirname, '..', 'sim', 'prng.js'));
const G = require(path.join(__dirname, '..', 'sim', 'ground.js'));
const C = require(path.join(__dirname, '..', 'sim', 'contest.js'));
const seed = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'watch-1';
const quiet = process.argv.includes('--quiet');
const OAS = ['nevlon_collective', 'knights_star', 'violets_enterprise', 'alliance_house', 'new_line', 'vantis_deepcore', 'custom_house', 'mercy_concern'];
const STANCES = ['standard', 'measured', 'unyielding', 'standard', 'preservationist', 'death_or_glory', 'standard', 'measured'];
function drop(rng, g) {
  const squads = [], taken = {};
  for (let round = 0; round < 4; round++) OAS.forEach((oa, i) => {
    const mine = squads.filter(q => q.oa === oa).map(q => g.zones[q.zone].region);
    let free = g.zones.filter(z => !taken[z.id] && mine.indexOf(z.region) < 0 && z.region !== g.wall.last);
    if (!free.length) free = g.zones.filter(z => !taken[z.id]);
    free.sort((a, b) => (b.site ? 1 : 0) + (b.height >= 1 ? .5 : 0) - (a.site ? 1 : 0) - (a.height >= 1 ? .5 : 0) + (rng() - .5) * 1.4);
    const z = free[0]; taken[z.id] = true;
    squads.push({ oa, s: round, zone: z.id, n: 4 + Math.floor(rng() * 3), stance: STANCES[i] });
  });
  return squads;
}
const rng = P.mulberry32(P.seedFrom(seed));
const g = G.generate(P.mulberry32(P.seedFrom(seed + ':ground')), {});
const st = C.open(rng, g, drop(rng, g), { seed });
const short = id => id.split('_')[0];
const where = () => { const by = {}; for (const q of st.squads.filter(q => q.alive)) { const r = g.regions[g.zones[q.zone].region].name; (by[r] = by[r] || []).push(short(q.oa) + q.s); } return Object.keys(by).sort().map(k => k + ': ' + by[k].join(' ')).join(' | '); };
let lastEv = 0;
const say = s => { if (!quiet) console.log(s); };
say(`${g.name} · ${g.archetypeName} · ${g.regions.length} regions, ${g.zones.length} zones · last ground ${g.regions[g.wall.last].name}`);
let firstContact = null, contactsByDay = {}, moves = 0;
while (!st.done) {
  C.runToWindow(st);
  const ev = st.events.slice(lastEv); lastEv = st.events.length;
  const mv = ev.filter(e => e.t === 'move').length, ct = ev.filter(e => e.t === 'contact'), wl = ev.filter(e => e.t === 'wall'), gone = ev.filter(e => e.t === 'region_gone');
  moves += mv;
  ct.forEach(c => { contactsByDay[c.day] = (contactsByDay[c.day] || 0) + 1; if (firstContact == null) firstContact = c.day; });
  say(`\n— Day ${st.day} · window · ${C.standing(st).length} regions stand · ${st.squads.filter(q => q.alive).length} squads`);
  if (gone.length) say(`  the wall took ${gone.map(e => g.regions[e.region].name).join(', ')}` + (wl.length ? ` · caught ${wl.map(e => short(e.oa) + e.squad).join(' ')}` : ''));
  say(`  ${mv} steps walked · ${ct.length} contacts` + (ct.length ? ': ' + ct.map(c => `${short(c.oas[0])} on ${short(c.oas[1])} at ${g.regions[g.zones[c.zone].region].name}`).join(', ') : ''));
  say('  ' + where());
}
const a = st.audit, aliveN = st.squads.filter(q => q.alive).length;
const visitedSites = st.squads.filter(q => q.visited.some(z => g.zones[z].site && g.zones[z].site.kind !== 'beacon')).length;
console.log(`\n${seed}: days ${st.day - 1} · steps ${a.steps} (${(a.steps / Math.max(1, st.day - 1) / 32).toFixed(2)} a squad a day) · contacts ${a.contacts} (first day ${firstContact}) · heard ${a.heard} · wall took ${a.wall} · alive ${aliveN}/32 · squads that reached a site ${visitedSites}/32 · windows ${a.windows}`);
