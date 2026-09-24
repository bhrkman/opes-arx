/* §HALF-BUILT — QUICK FIXES THAT LEFT SOMETHING RUNNING (ruled). Two have been found the hard way: the ×10
   stat seam (a divided copy at one doorway, and thirty constants tuned to the copy) and joining (its PANELS
   cut while its machinery ran on). Both were invisible until measured. This looks for the same shape at every
   junction where one side can quietly stop matching the other:
     A. DATA NOBODY READS — keys in items.json, traits.json and oa_profiles.json that no line of engine reads.
     B. THE WINDOW'S DEAD FIELDS — what the engine hands the page each window that the page never shows.
     C. COUNTERS WRITTEN AND NEVER READ — stats.audit tallies nothing reports on.
     D. CHECKS THAT CAN PASS BY DOING NOTHING — a harness step that logs a note and moves on.
     E. UNIT SEAMS — a × 10 or ÷ 10 between modules, which is where the last one hid.
   `node harness/audit_halfbuilt.cjs` */
const fs = require('fs'), path = require('path');
const ROOT = '/home/claude/opes-arx';
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const simFiles = fs.readdirSync(path.join(ROOT, 'sim')).filter(f => f.endsWith('.js'));
const SIM = simFiles.map(f => read('sim/' + f)).join('\n');
const PAGE = read('viewers/corp_template.html');
const HARNESS = fs.readdirSync(path.join(ROOT, 'harness')).filter(f => f.endsWith('.cjs'))
  .map(f => ({ f, s: read('harness/' + f) }));
const out = {};
const add = (k, v) => (out[k] = out[k] || []).push(v);

/* A. data keys nobody reads */
const items = JSON.parse(read('data/items.json')).items;
const effKeys = new Set();
items.forEach(i => Object.keys(i.effects || {}).forEach(k => effKeys.add(k)));
for (const k of effKeys) {
  if (k === 'tags') continue;
  const re = new RegExp("\\b" + k.replace(/[^a-z_0-9]/gi, '') + "\\b");
  if (!re.test(SIM)) add('A', 'items.json effect `' + k + '` — ' + items.filter(i => (i.effects || {})[k] != null).length + ' item(s), nothing reads it');
}
const tags = new Set();
items.forEach(i => ((i.effects || {}).tags || []).forEach(t => tags.add(t)));
/* a tag is read either as a string ('pierce_2') or as a key in combat.js's tag table (pierce_2: {) */
for (const t of tags) if (!new RegExp("'" + t + "'|\\b" + t + ":").test(SIM))
  add('A', "items.json tag `" + t + "` — nothing reads it");
const traits = JSON.parse(read('data/traits.json')).traits;
const hooks = new Set();
traits.forEach(t => ((t.effects || {}).hooks || []).forEach(h => hooks.add(h)));
for (const h of hooks) if (!new RegExp("'" + h + "'").test(SIM) && !new RegExp('"' + h + '"').test(SIM))
  add('A', 'traits.json hook `' + h + '` — nothing reads it');
const dials = new Set();
JSON.parse(read('data/oa_profiles.json')).oa_profiles.forEach(p => Object.keys(p.dials || {}).forEach(d => dials.add(d)));
for (const d of dials) if (!new RegExp("'" + d + "'").test(SIM + PAGE)) add('A', 'oa_profiles dial `' + d + '` — nothing reads it');

/* B. the window's fields the page never shows */
const winBlock = SIM.match(/const win = \{[\s\S]{0,4000}?\n\s{4}\};/);
if (winBlock) {
  for (const m of winBlock[0].matchAll(/^\s{6}([a-zA-Z_][a-zA-Z0-9_]*):/gm)) {
    const k = m[1];
    if (!new RegExp("\\b" + k + "\\b").test(PAGE)) add('B', 'the window hands over `' + k + '` — the page never reads it');
  }
}

/* C. counters written and never read */
const written = new Set();
for (const m of SIM.matchAll(/stats\.audit\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g)) written.add(m[1]);
for (const k of written) {
  const readsSim = (SIM.match(new RegExp("audit\\.?\\[?'?" + k + "'?\\b", 'g')) || []).length;
  const inPage = new RegExp("\\b" + k + "\\b").test(PAGE);
  const inTools = HARNESS.some(h => new RegExp("\\b" + k + "\\b").test(h.s)) ||
                  fs.readdirSync(path.join(ROOT, 'sim')).filter(f => f.endsWith('.cjs'))
                    .some(f => new RegExp("\\b" + k + "\\b").test(read('sim/' + f)));
  if (readsSim <= 2 && !inPage && !inTools) add('C', 'stats.audit.' + k + ' — counted, and nobody ever looks');
}

/* D. checks that can pass by doing nothing */
for (const h of HARNESS) {
  for (const m of h.s.matchAll(/console\.log\('\s*note[^']*'/g))
    add('D', h.f + ': "' + m[0].slice(14, 70).replace(/'$/, '') + '" — the step can skip and still pass');
}

/* E. unit seams between modules */
for (const f of simFiles) {
  const s = read('sim/' + f);
  for (const m of s.matchAll(/^.*?(?:\/ 10|\* 10)\b.*$/gm)) {
    const line = m[0].trim();
    if (/^\s*(\/\*|\*|\/\/)/.test(line)) continue;
    if (/toFixed|Math\.round\([^)]*\* 10\) \/ 10|Math\.round\([^)]*\/ 10\) \* 10|100|1000/.test(line)) continue;
    if (/stats|\.x|\.y|percent|pct/.test(line)) continue;
    add('E', f + ': ' + line.slice(0, 96));
  }
}
/* F. a switch in one module that NOTHING anywhere reads (audit_code only looks inside a module) */
const ALL = SIM + PAGE + HARNESS.map(h => h.s).join('\n') +
  fs.readdirSync(path.join(ROOT, 'sim')).filter(f => f.endsWith('.cjs')).map(f => read('sim/' + f)).join('\n');
for (const f of simFiles) {
  const s2 = read('sim/' + f);
  const block = s2.match(/const CONST = \{[\s\S]*?\n  \};/);
  if (!block) continue;
  for (const m of block[0].matchAll(/^\s{4}([A-Z][A-Z0-9_]{2,}):/gm)) {
    const k = m[1];
    const uses = (ALL.match(new RegExp("\\b" + k + "\\b", 'g')) || []).length;
    if (uses <= 1) add('F', f + ': ' + k + ' — declared, and nothing anywhere reads it');
  }
}

/* G. EXPORTED AND NEVER CALLED — a module offers a function and nothing anywhere asks for it. The code audit
   counts an export as a use, which is how the old abstract fight model's `captainReadsFight` — a captain's
   hold, still tuned to the retired ÷10 scale — sat exported and dead, reading like live design. */
{
  const everything = SIM + PAGE + HARNESS.map(h => h.s).join('\n') +
    fs.readdirSync(path.join(ROOT, 'sim')).filter(f => f.endsWith('.cjs')).map(f => read('sim/' + f)).join('\n');
  /* PARKED by ruling, waiting for a system that is not built yet: reported as parked, not as findings */
  const PARKED = { storyMult: 'authored stories', attention: 'the media system' };
  for (const f of simFiles) {
    const s2 = read('sim/' + f);
    const i = s2.lastIndexOf('return {');
    const j = s2.lastIndexOf('const api = {');
    const exp = s2.slice(Math.max(i, j));
    const names = new Set((exp.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b(?=\s*[,}]|\s*:)/g) || []));
    for (const n of names) {
      if (/^[A-Z_]+$/.test(n) || n.length < 3) continue;               /* constants and tables */
      if (!new RegExp('function ' + n + '\\b').test(s2)) continue;     /* only this module's own functions */
      const calls = (everything.match(new RegExp('[.\\s(]' + n + '\\(', 'g')) || []).length;
      const defs = (s2.match(new RegExp('function ' + n + '\\(', 'g')) || []).length;
      const inside = (s2.match(new RegExp('[^\\w.]' + n + '\\(', 'g')) || []).length - defs;
      if (calls - defs <= 0 && inside <= 0)
        add('G', f + ': ' + n + (PARKED[n] ? ' — parked for ' + PARKED[n] + ' (ruled)' : ' — exported, and nothing anywhere calls it'));
    }
  }
}

/* H. a system that never fires in play: every counter the engine keeps, run over real contests */
if (!process.env.FAST) {
  const P = require(ROOT + '/sim/prng.js'), S = require(ROOT + '/sim/season.js'), DIV = require(ROOT + '/sim/divide.js');
  const oa = JSON.parse(read('data/oa_profiles.json')).oa_profiles;
  const seen = {};
  for (let i = 1; i <= 2; i++) {
    const rng = P.mulberry32(P.seedFrom('hb' + i));
    const c = S.openFleet(rng, oa, {}); const st = S.beginSeason(rng, c, oa, {});
    while (st.month <= 11) S.stepMonth(st);
    S.closeSeasonToDrop(st);
    const d = S.prepareDivide(st);
    const r = DIV.runDivide(d.rng, d.opts);
    for (const k in (r.audit || {})) {
      if (typeof r.audit[k] !== 'number') { seen[k] = -1; continue; }   /* a map, not a tally */
      if (seen[k] !== -1) seen[k] = (seen[k] || 0) + r.audit[k];
    }
  }
  for (const k of Object.keys(seen).sort()) if (seen[k] === 0) add('H', 'stats.audit.' + k + ' — never once in two whole contests');
}

const TITLES = { A: 'DATA NOBODY READS', B: "THE WINDOW'S DEAD FIELDS", C: 'COUNTERS NOBODY LOOKS AT',
                 D: 'CHECKS THAT CAN PASS BY DOING NOTHING', E: 'UNIT SEAMS (a \u00d710 between modules)',
                 F: 'SWITCHES NOTHING ANYWHERE READS', G: 'EXPORTED AND NEVER CALLED', H: 'SYSTEMS THAT NEVER FIRE IN PLAY' };
console.log('\nHALF-BUILT \u2014 what a quick fix left running\n');
let total = 0;
for (const k of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
  const rows = out[k] || [];
  total += rows.length;
  console.log('== ' + TITLES[k] + ' (' + rows.length + ') ==');
  rows.slice(0, 14).forEach(r => console.log('  ' + r));
  if (rows.length > 14) console.log('  ... and ' + (rows.length - 14) + ' more');
  console.log('');
}
console.log(total + ' thing(s) to look at');
