/* THE HOUSEKEEPING AUDIT. Dead functions, unread constants, and helpers written twice.
   None of these change what the game does, which is exactly why nothing catches them: a
   function nobody calls passes every test in the suite. Run it after any large piece of work.
   `node audit_code.cjs [--quiet]` */
const fs = require('fs'), path = require('path');
const DIR = __dirname, VIEW = path.join(DIR, '..', 'viewers', 'corp_template.html');
const HARNESS = path.join(DIR, '..', 'harness');
const modules = fs.readdirSync(DIR).filter(f => f.endsWith('.js'));
const tools = fs.readdirSync(DIR).filter(f => f.endsWith('.cjs'));
const view = fs.readFileSync(VIEW, 'utf8');
const harness = fs.readdirSync(HARNESS).filter(f => f.endsWith('.cjs'))
  .map(f => fs.readFileSync(path.join(HARNESS, f), 'utf8')).join('\n');
const src = {};
for (const f of modules.concat(tools)) src[f] = fs.readFileSync(path.join(DIR, f), 'utf8');
const allCode = Object.values(src).join('\n') + '\n' + view + '\n' + harness;

/* how many times a bare word appears outside its own definition */
const uses = (word, exceptFile) => {
  const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
  let n = 0;
  for (const f in src) { if (f === exceptFile) continue; n += (src[f].match(re) || []).length; }
  n += (view.match(re) || []).length + (harness.match(re) || []).length;
  return n;
};
const findings = { deadFunctions: [], unreadConstants: [], duplicates: [], longFiles: [] };

/* ---- functions nobody calls ---- */
for (const f of modules) {
  const body = src[f];
  const decls = [...body.matchAll(/^\s*function\s+([a-zA-Z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
  for (const name of new Set(decls)) {
    const own = (body.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
    const elsewhere = uses(name, f);
    /* one mention in its own file is the declaration itself */
    if (own <= 1 && elsewhere === 0) findings.deadFunctions.push(f + ': ' + name);
  }
}
/* ---- constants nothing reads ---- */
for (const f of modules) {
  const body = src[f];
  const block = body.match(/CONST\s*=\s*\{[\s\S]*?\n\s*\};/);
  if (!block) continue;
  for (const m of block[0].matchAll(/^\s{2,}([A-Z][A-Z0-9_]{2,})\s*:/gm)) {
    const key = m[1];
    const total = (allCode.match(new RegExp('\\b' + key + '\\b', 'g')) || []).length;
    /* [ABSTRACT] is a deliberate answer, not an oversight: those dials belong to the
       exchange model the grid replaced, and combat.js says so where they live */
    const line = body.split('\n').find(l => l.includes(key + ':')) || '';
    /* a name ending _RETIRED is a deliberate answer too: the rule it belonged to was taken
       out and the dial is left labelled where a replacement would land */
    if (total <= 1 && !/\[ABSTRACT\]/.test(line) && !/_RETIRED\b/.test(key))
      findings.unreadConstants.push(f + ': ' + key);
  }
}
/* ---- the same helper written in two places ---- */
const seen = {};
for (const f of modules) {
  for (const m of src[f].matchAll(/^\s*function\s+([a-zA-Z_$][\w$]*)\s*\(/gm)) {
    (seen[m[1]] || (seen[m[1]] = [])).push(f);
  }
}
for (const name in seen) {
  const where = [...new Set(seen[name])];
  if (where.length > 1) findings.duplicates.push(name + ' — ' + where.join(', '));
}
/* ---- files that have outgrown a reading ---- */
for (const f of modules) {
  const lines = src[f].split('\n').length;
  if (lines > 3000) findings.longFiles.push(f + ': ' + lines + ' lines');
}
const say = (title, list) => {
  console.log('\n== ' + title + ' (' + list.length + ') ==');
  list.slice(0, 40).forEach(x => console.log('  ' + x));
  if (list.length > 40) console.log('  … and ' + (list.length - 40) + ' more');
};
say('FUNCTIONS NOBODY CALLS', findings.deadFunctions);
say('CONSTANTS NOTHING READS', findings.unreadConstants);
say('HELPERS WRITTEN TWICE', findings.duplicates);
say('FILES PAST A READING', findings.longFiles);
const total = findings.deadFunctions.length + findings.unreadConstants.length;
console.log('\n  ' + total + ' thing(s) to answer for.');
