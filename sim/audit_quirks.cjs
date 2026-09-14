/* EVERY QUIRK DOES SOMETHING FUNCTIONAL AND SOMETHING NARRATIVE.
   The old catalogue was 87 traits that had never been authored or balanced: most carried one
   small hook, 84 of them changed no stat at all, and the three that did were written in TENTHS
   without saying so. The rebuild rules that a quirk must have BOTH halves — a bonus a manager
   can feel, and a tie a writer can hang an event on — and this refuses anything that claims the
   new shape and does not keep it. `node sim/audit_quirks.cjs` */
const fs = require('fs'), path = require('path');
const D = __dirname;
const T = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'traits.json'), 'utf8')).traits;
const C = require('./combat.js');
const files = fs.readdirSync(D).filter(f => f.endsWith('.js'));
const src = files.map(f => fs.readFileSync(path.join(D, f), 'utf8')).join('\n');

/* what a quirk is worth, in the scale measured by measure_stat_worth.cjs:
   +15 is where a person feels it, +25 is a good trait, +40 is a defining one */
const FELT = 15;
const bad = [], old = [];
for (const t of T) {
  const e = t.effects || {};
  const isNew = !!(e.stats || e.situational || e.story);
  if (!isNew) { old.push(t.id); continue; }

  /* --- the functional half --- */
  let best = 0;
  for (const k in (e.stats || {})) best = Math.max(best, Math.abs(e.stats[k]));
  for (const s of (e.situational || []))
    for (const k in (s.stats || {})) best = Math.max(best, Math.abs(s.stats[k]));
  const liveHook = (e.hooks || []).some(h => src.includes(h));
  if (!best && !liveHook) bad.push(t.id + ': nothing functional — no stat change and no live hook');
  else if (best && best < FELT && !liveHook)
    bad.push(t.id + ': its largest effect is ' + best + ' points, under the ' + FELT +
             ' a person can feel, and it carries no hook to make up for it');

  /* --- the narrative half --- */
  const st = e.story;
  if (!st || !st.tone || !(st.hooks_into || []).length)
    bad.push(t.id + ': nothing narrative — a `story` with a tone and something to hang an event on is required');

  /* --- the conditions must be ones the engine can answer --- */
  for (const s of (e.situational || []))
    if (!C.SITUATIONS[s.when])
      bad.push(t.id + ': names a condition the fight cannot answer — "' + s.when + '"');

  /* --- and the honest unit --- */
  if (e.stat_mods) bad.push(t.id + ': uses `stat_mods`, which is in TENTHS; new quirks use `stats`, in real points');
}

/* §STORY NO EVENT MAY CAST BY A NAME THE CATALOGUE CAN RETIRE. Five events named traits
   directly — `hasQuirk(f, 'hot_headed')` — and when those traits were retired all five went
   quiet with no error: the event drew its turn, found nobody and did nothing. An event asks for
   a TIE that a quirk's `story.hooks_into` answers, so rewriting the catalogue carries the events
   with it. Any id an event still names must be one that is actually dealt. */
/* read the CODE, not the commentary: the first cut matched the example inside the comment that
   explains this very check, which is a gate reporting its own documentation as a fault */
const evSrc = fs.readFileSync(path.join(D, 'events.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const dealt = new Set(T.filter(t => t.draw !== 'retired').map(t => t.id));
const named = [...new Set((evSrc.match(/hasQuirk\([a-z]+, '([a-z_]+)'\)/g) || [])
  .map(x => x.match(/'([a-z_]+)'/)[1]))];
const stranded = named.filter(id => !dealt.has(id));
if (stranded.length)
  bad.push('events cast by names the catalogue no longer deals: ' + stranded.join(', '));

/* and every tie an event asks for must be answerable by some quirk in circulation */
const asked = [...new Set((evSrc.match(/castFor\([^,]+,\s*[a-z]+,\s*'([^']+)'/g) || [])
  .map(x => x.match(/'([^']+)'/)[1]))];
const ties = [];
for (const t of T) if (t.draw !== 'retired')
  for (const h of (((t.effects || {}).story || {}).hooks_into || [])) ties.push(h.toLowerCase());
for (const a of asked)
  if (!ties.some(h => h.indexOf(a.toLowerCase()) >= 0 || a.toLowerCase().indexOf(h) >= 0))
    bad.push('an event asks for a tie no quirk in circulation answers: "' + a + '"');

/* §STORY AN EVENT THAT DRAWS MUST BE ANSWERABLE. The placeholder moments were pushed into the
   pool AFTER the id index was built, so they drew and displayed perfectly and then answered
   nothing — an event that looks like content and is furniture. Every spec in the pool must be
   reachable by the id the answer path looks it up by. */
{
  const E = require('./events.js');
  const missing = (E.POOL || []).filter(sp => !E.BY_ID || !E.BY_ID[sp.id]).map(sp => sp.id);
  if (missing.length) bad.push('events that draw but cannot be answered: ' + missing.join(', '));
}

/* §STORY AUTHORED COPY THAT CANNOT FIRE IS COPY NOBODY WILL EVER READ. The broadcast script's
   scout-report lines are keyed to trait ids, so retiring the catalogue silenced twenty-four of
   them at a stroke — good writing, quietly unreachable. This does not FAIL on an inert line (a
   name may legitimately be waiting on a quirk still to be written) but it names them every run,
   so the debt stays visible instead of rotting. */
{
  const rSrc = fs.readFileSync(path.join(D, 'roster.js'), 'utf8');
  const keyed = [...new Set((rSrc.match(/c\.has\("([a-z_]+)"\)/g) || [])
    .map(x => x.match(/"([a-z_]+)"/)[1]))];
  const live = new Set(T.filter(t => t.draw !== 'retired').map(t => t.id));
  const mute = keyed.filter(id => !live.has(id));
  console.log('\n== THE BROADCAST SCRIPT ==');
  console.log('  lines keyed to a quirk: ' + keyed.length + ', of which ' +
              (keyed.length - mute.length) + ' can fire');
  if (mute.length) console.log('  waiting on a quirk: ' + mute.join(', '));
}

console.log('\n== THE QUIRKS ==');
console.log('  in the catalogue: ' + T.length);
console.log('  rebuilt to the new shape: ' + (T.length - old.length));
console.log('  still the old catalogue: ' + old.length);
if (bad.length) {
  console.log('\n  ' + bad.length + ' quirk(s) claiming the new shape and not keeping it:');
  for (const b of bad) console.log('    ' + b);
  process.exit(1);
}
console.log('\n  every rebuilt quirk does something functional and something narrative');
