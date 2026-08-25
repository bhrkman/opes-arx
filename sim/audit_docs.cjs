/* audit_docs.cjs — THE COLD-READ CHECK.
 *
 * Every new session opens with the same question: "this document says 43, this one says 44."
 * Nine documents, ~5,000 lines of prose, several years of simulated history, and no two of them
 * written on the same day. `arx.cjs regress` already guards NAMED CONSTANTS against live code.
 * This guards the rest of what a cold reader trips over:
 *
 *   1. version strings that disagree with each other
 *   2. counts quoted in prose that disagree with the data files
 *   3. the same identifier meaning two different things in two places
 *   4. cross-references to sections that do not exist
 *   5. claims that something is unbuilt when the code plainly builds it
 *
 * Point 3 is the expensive one. `S15` is a ratified RULING in `SEASONS.md` and a CHECK NAME in
 * `arx.cjs`, and they are unrelated — so "S15 failed" and "S15 says" are sentences about
 * different things. That is not a typo, it is two namespaces that grew into each other.
 *
 *   node audit_docs.cjs
 */
const fs = require('fs'), path = require('path');
const D = __dirname, DOCS = path.join(D, '..', 'docs'), DATA = path.join(D, '..', 'data');
const read = p => fs.readFileSync(p, 'utf8');
const docs = {};
for (const f of fs.readdirSync(DOCS)) if (f.endsWith('.md')) docs[f] = read(path.join(DOCS, f));
docs['README.md'] = read(path.join(D, '..', 'README.md'));
const arx = read(path.join(D, 'arx.cjs'));

const problems = [], notes = [];
const bad = (kind, detail) => problems.push({ kind, detail });
const note = (kind, detail) => notes.push({ kind, detail });

/* ---- 1. versions ---------------------------------------------------------------- */
const versions = {};
for (const f in docs) {
  const m = docs[f].match(/\*\*Project version (\d+\.\d+)/) || docs[f].match(/— v(\d+\.\d+)/);
  if (m) versions[f] = m[1];
}
const vset = Array.from(new Set(Object.values(versions)));
if (vset.length > 1) {
  bad('versions disagree', Object.keys(versions).map(f => f + ' ' + versions[f]).join(' · '));
}

/* ---- 2. counts quoted in prose vs the data files -------------------------------- */
const items = JSON.parse(read(path.join(DATA, 'items.json')));
const traits = JSON.parse(read(path.join(DATA, 'traits.json')));
const counts = [
  /* Anchored to CATALOG phrasing. An earlier version matched any "N items" and flagged
     "1,509 items left on the ground" and "38 items came home" as contradictions — a checker
     that cries wolf gets ignored, which is worse than not having one. */
  ['items', items.items.length, /(?:holds|catalog[^.\n]{0,20}?|`items\.json`[^.\n]{0,20}?)\b(\d{2,3}) items\b/g],
  ['weapon quirks', items.quirks.length, /\b(\d{1,3}) (?:weapon )?quirks\b/g],
  ['traits', traits.traits.length, /\b(\d{1,3}) traits\b/g]
];
for (const [what, live, re] of counts) {
  for (const f in docs) {
    let m; const r = new RegExp(re.source, 'g');
    while ((m = r.exec(docs[f]))) {
      const said = parseInt(m[1], 10);
      /* a changelog is a record of what WAS true and is allowed to disagree */
      const line = docs[f].slice(Math.max(0, m.index - 400), m.index);
      if (/## \d+\. Changelog|^- \*\*0\.\d/m.test(line.split('\n').slice(-6).join('\n'))) continue;
      if (said !== live) bad('count disagrees with data',
        f + ' says ' + said + ' ' + what + '; ' + path.basename(DATA) + ' holds ' + live);
    }
  }
}

/* ---- 3. THE SAME IDENTIFIER MEANING TWO THINGS ---------------------------------- */
const rulings = {};            /* id -> [docs it is ratified in] */
for (const f in docs) {
  const r = /^\| \*\*([A-Z]{1,3}\d+[a-z]?)\*\*/gm; let m;
  while ((m = r.exec(docs[f]))) (rulings[m[1]] = rulings[m[1]] || []).push(f);
}
const guards = {};             /* id -> the check text */
{
  const r = /ok\('([A-Z]{1,3}\d+[a-z]?) ([^']{4,60})/g; let m;
  while ((m = r.exec(arx))) guards[m[1]] = m[2].trim();
}
/* A check MAY legitimately carry the id of the ruling it verifies — `C7` checks C7. What is not
   legitimate is a check whose text has nothing to do with the ruling sharing its name, which is
   what the whole S-series had become. So: a collision is only a problem if the two are about
   different things, judged by whether the check's text shares vocabulary with the ruling's row. */
function sameSubject(id, text) {
  const row = (rulings[id] || []).map(f => {
    const m = docs[f].match(new RegExp('^\\| \\*\\*' + id + '\\*\\*(.{0,300})', 'm'));
    return m ? m[1] : '';
  }).join(' ').toLowerCase();
  const words = text.toLowerCase().match(/[a-z]{5,}/g) || [];
  return words.some(w => row.indexOf(w) >= 0);
}
const collisions = Object.keys(guards)
  .filter(id => rulings[id] && !sameSubject(id, guards[id]));
if (collisions.length) {
  bad('one identifier, two meanings',
      collisions.length + ' ids are BOTH a ratified ruling and a check name: ' +
      collisions.slice(0, 8).join(', ') + (collisions.length > 8 ? ' \u2026' : ''));
  for (const id of collisions.slice(0, 3)) {
    note('  ' + id, 'ruling in ' + rulings[id].join('/') + '  \u00b7  check "' + guards[id] + '"');
  }
}

/* ---- 4. cross-references to sections that do not exist -------------------------- */
const headings = {};
for (const f in docs) {
  headings[f] = new Set();
  const r = /^#{2,4} ([\d.]+[a-z]?)/gm; let m;
  while ((m = r.exec(docs[f]))) headings[f].add(m[1].replace(/\.$/, ''));
}
for (const f in docs) {
  const r = /`([A-Z]+\.md)` §([\d.]+[a-z]?)/g; let m;
  while ((m = r.exec(docs[f]))) {
    const target = m[1], sec = m[2].replace(/\.$/, '');
    if (!headings[target]) { bad('reference to a missing file', f + ' \u2192 ' + target); continue; }
    if (!headings[target].has(sec)) {
      bad('reference to a section that does not exist', f + ' \u2192 ' + target + ' \u00a7' + sec);
    }
  }
}

/* ---- 5. claims that something is unbuilt when the code builds it ---------------- */
const code = ['season.js', 'divide.js', 'combat.js', 'tactical.js', 'items.js', 'ledger.js']
  .map(x => read(path.join(D, x))).join('\n');
const builtNow = [
  ['prep calendar', /function prepMonth/],
  ['Dividend', /function runDividend/],
  ['merc market', /function runMercMarket/],
  ['Bastille intake', /function bastilleIntake/],
  ['corp schema', null]
];
for (const [what, re] of builtNow) {
  if (re && !re.test(code)) continue;
  for (const f in docs) {
    const r = new RegExp('(?:not built|never written|does not exist|unbuilt)[^.\\n]{0,80}' +
                         what.replace(/ /g, '[ -]'), 'i');
    if (r.test(docs[f])) bad('claims unbuilt, but the code builds it', f + ': ' + what);
  }
}

/* ---- report --------------------------------------------------------------------- */
console.log('\nCOLD-READ CHECK \u00b7 ' + Object.keys(docs).length + ' documents');
console.log('='.repeat(78));
if (!problems.length) console.log('  nothing a cold reader would trip over.');
for (const p of problems) {
  console.log(' \u2717 ' + p.kind);
  console.log('     ' + p.detail);
}
for (const n of notes) console.log('   ' + n.kind + '  ' + n.detail);
console.log('='.repeat(78));
console.log('  ' + problems.length + ' contradiction(s)');
process.exitCode = 0;
