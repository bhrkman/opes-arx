/* Capital Divide — /sim/audit_cross.cjs
 *
 * WHAT THIS IS FOR. Every audit in this tree checks one thing deeply: `audit_open` asks whether
 * a claimed system runs, `audit_docs` asks whether the document still agrees with the code, the
 * suite asks whether behaviour holds. None of them asks the question that has actually cost this
 * project the most time:
 *
 *     does one step's work reach the next step's work, or does it just sit there?
 *
 * The failures have all had the same shape. `corp._window` was written by the recruit verb and
 * read by nothing, for several steps — one write, zero reads, invisible to a suite that was
 * green the whole time. `_scouted` was incremented every turn and read by nothing for a whole
 * step, in the session that catalogued dead wires for a living. `SEASON_MONTHS: 13` sat in the
 * module that owns the calendar while everything read the ledger's 12. `tel.vents` was never
 * initialised, so a mechanism firing 327 times reported a confident zero through the first
 * `|| 0` it met.
 *
 * Every one of those was found by accident, late, by somebody playing the game. This looks for
 * them on purpose. It is a lint for the seams BETWEEN steps rather than the insides of them.
 *
 * It reports rather than fails, and the list of known-and-accepted entries is named, so a new
 * one has to be added deliberately.
 */
const fs = require('fs');
const path = require('path');

const D = __dirname;
const MODULES = fs.readdirSync(D).filter(f => f.endsWith('.js'));
const SRC = {};
for (const m of MODULES) SRC[m] = fs.readFileSync(path.join(D, m), 'utf8');
const ALL = Object.values(SRC).join('\n');

/* the viewers inline the modules and can be the only reader of something */
const VIEWDIR = path.join(D, '..', 'viewers');
const TEMPLATES = fs.existsSync(VIEWDIR)
  ? fs.readdirSync(VIEWDIR).filter(f => f.endsWith('_template.html'))
      .map(f => fs.readFileSync(path.join(VIEWDIR, f), 'utf8')).join('\n')
  : '';
const TOOLS = fs.readdirSync(D).filter(f => f.endsWith('.cjs') && f !== 'audit_cross.cjs')
  .map(f => fs.readFileSync(path.join(D, f), 'utf8')).join('\n');
const EVERYWHERE = ALL + '\n' + TEMPLATES + '\n' + TOOLS;

const out = { writeOnly: [], deadConst: [], undeclared: [], uncalled: [], neverTrue: [], ok: 0 };

/* ---------------------------------------------------------------- 1. write-only state ---- */
/* Underscore fields are this project's scratch space between systems — `_prep`, `_drop`,
   `_worked`, `_pending`. They are where one step hands to another, and therefore where a
   handover silently fails to happen. */
/* NAMED, SO THEY CANNOT DRIFT. Each of these is written by one step and read by nobody. They
   are not noise to be silenced — they are a to-do list, and the note says which kind:
     REDUNDANT  the same fact is already recorded somewhere the code does read
     HALF-BUILT a feature whose other end was never written
   `_mediaReveal` was on this list for exactly one run: media day was documented as charging
   concealment and nothing read the charge, so performing was free standing. It is wired now. */
const ACCEPTED_WRITE_ONLY = [
  '_id',              // identity plumbing
  '_panic',           // REDUNDANT — `u.state = 'panicked'` already says this, and is read
  '_justSwapped',     // REDUNDANT — the sidearm swap is visible in `onSidearm`
  '_offered',         // REDUNDANT — reset every phase, never consulted
  '_committed',       // HALF-BUILT — the wage bill, snapshotted for a budget view nobody built
  '_grant',           // HALF-BUILT — same, the board's grant at the season open
  '_pressed',         // HALF-BUILT — a fighter pressed into service; nothing treats them so
  '_role',            // HALF-BUILT — the role a body was fielded in; no reader
  '_transferredTo'    // HALF-BUILT — a captive's new owner; the ransom half exists, this end does not
];

const writes = {};
for (const m of MODULES) {
  for (const mm of SRC[m].matchAll(/\b(?:corp|c|f|sq|u|st|state|joiner|principal|other|you|you2|b)\.(_[a-zA-Z][\w]*)\s*=(?!=)/g)) {
    (writes[mm[1]] = writes[mm[1]] || new Set()).add(m);
  }
}
for (const field of Object.keys(writes).sort()) {
  if (ACCEPTED_WRITE_ONLY.includes(field)) continue;
  /* a read is any mention that is not an assignment to it */
  const mentions = [...EVERYWHERE.matchAll(new RegExp('\\' + '.' + field + '\\b', 'g'))].length;
  const assigns = [...EVERYWHERE.matchAll(new RegExp('\\' + '.' + field + '\\s*=(?!=)', 'g'))].length;
  const reads = mentions - assigns;
  if (reads <= 0) out.writeOnly.push({ field, writtenIn: [...writes[field]].join(', '), reads });
  else out.ok++;
}

/* ------------------------------------------------------------------ 2. dead constants ---- */
/* A constant nobody reads is a decision nobody is acting on. Some are deliberately declarative
   — a documented figure the code derives differently — so those are named. */
/* Same principle for constants. A number nobody reads is a decision nobody is acting on. */
const ACCEPTED_DEAD = [
  'OFFSEASON_DAYS',   // superseded: mending runs across the prep months now
  'FINAL_DAY',        // map.js; the ground clock reads LAST_GROUND_DAY
  'TILE_METRES',      // tactical.js; declarative — the grid works in tiles, not metres
  'SUPPRESS_MIN_P',   // HALF-BUILT — a floor on suppression that nothing applies
  'BOUND_SHARE'       // HALF-BUILT — bounding movement was never wired
];
for (const m of MODULES) {
  const block = /CONST\s*=\s*\{([\s\S]*?)\n\s{2}\};/m.exec(SRC[m]);
  if (!block) continue;
  for (const mm of block[1].matchAll(/^\s{4}([A-Z][A-Z0-9_]{2,})\s*:/gm)) {
    const name = mm[1];
    if (ACCEPTED_DEAD.includes(name)) continue;
    const uses = [...EVERYWHERE.matchAll(new RegExp('CONST\\.' + name + '\\b', 'g'))].length;
    if (uses === 0) out.deadConst.push({ name, module: m });
    else out.ok++;
  }
}

/* ------------------------------------------- 2b. constants read that were never declared ---- */
/* THE CHECK ABOVE ONLY LOOKS ONE WAY. It asks whether a declared constant is read, pooling every
   module's source together — so `CONST.X` used anywhere counts as a reader for an `X` declared
   anywhere. That is the wrong pooling for the fault that actually happened: `season.js` read
   `CONST.COURT_MONTHS` off its OWN CONST, which has never declared it, while `sponsors.js`
   declared it and used it happily. Both sides looked healthy from here and the audit reported
   zero dead constants while the value came back `undefined`, `due` became NaN, and every
   comparison NaN takes part in went quietly false.
   So: a bare `CONST.NAME` is a claim about THIS file's CONST, and it is checked against this
   file's CONST alone. Reaching into another module's is spelled `ITEMS.CONST.NAME`, which this
   deliberately does not match. */
const ACCEPTED_FOREIGN = [];       // named deliberately, like ACCEPTED_DEAD above
/* COMMENTS ARE NOT CODE, and this check is worthless until it knows that. Its first run
   reported 92 faults. Every one but a handful was noise of its own making: this tree explains
   its mechanisms in prose beside them, so `CONST.COURT_MONTHS` appears in the comment describing
   the bug as often as in code, and the scan counted the explanation as another offence. It also
   anchored declarations to the start of a line and so could not see the second name on
   `ROSTER_MIN: 16, ROSTER_MAX: 40,` — reporting constants as undeclared while looking straight
   at them. An instrument that has never failed has never been tested; this one failed the moment
   it was pointed at anything, which is the cheapest possible time to find out. */
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
for (const m of MODULES) {
  const block = /CONST\s*=\s*\{([\s\S]*?)\n\s{2}\};/m.exec(SRC[m]);
  if (!block) continue;
  const declared = new Set();
  /* every name in the block, not merely the first on each line */
  for (const mm of strip(block[1]).matchAll(/([A-Z][A-Z0-9_]{2,})\s*:/g)) declared.add(mm[1]);
  const seen = new Set();
  /* the negative lookbehind is what separates `CONST.X` from `ITEMS.CONST.X` */
  for (const mm of strip(SRC[m]).matchAll(/(?<![\w.])CONST\.([A-Z][A-Z0-9_]{2,})\b/g)) {
    const name = mm[1];
    if (declared.has(name) || seen.has(name)) continue;
    if (ACCEPTED_FOREIGN.includes(m + '.' + name)) continue;
    seen.add(name);
    out.undeclared.push({ name, module: m });
  }
}

/* ------------------------------------------------- 2c. functions nobody ever calls ---- */
/* A FUNCTION CAN BE DEAD TOO, and this audit could not see it. `stepToward` sat in
   `tactical.js` — defined once, called from nowhere in the tree, carrying a confident
   docstring about moving toward cover that faces the nearest enemy. The live movement scorer
   does that job by a completely different method a thousand lines further down. A change was
   made to the dead one, measured at exactly no effect, and the no-effect was read as the
   mechanism not mattering rather than as the code not running. One grep would have said so.
   Dead code is worse than a dead constant: a constant that nobody reads is inert, and a
   function that nobody calls is a lie about how the system works, sitting in the place a
   reader will look first.
   Exported names count as called — the suite, the probes and the viewers are callers. */
const stripc = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const ACCEPTED_UNCALLED = [];      // named deliberately, like the lists above
for (const m of MODULES) {
  const src = stripc(SRC[m]);
  const everywhere = stripc(ALL) + '\n' + stripc(TOOLS) + '\n' + stripc(TEMPLATES);
  for (const mm of src.matchAll(/\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)) {
    const name = mm[1];
    if (ACCEPTED_UNCALLED.includes(m + '.' + name)) continue;
    /* every mention that is not the declaration: a call, a reference, an export */
    const uses = [...everywhere.matchAll(new RegExp('\\b' + name + '\\b', 'g'))].length;
    const decls = [...everywhere.matchAll(new RegExp('function\\s+' + name + '\\b', 'g'))].length;
    if (uses - decls <= 0) out.uncalled.push({ name, module: m });
    else out.ok++;
  }
}

/* Counters that start as undefined were looked for HERE and the check was thrown away, which
   is the right outcome for a bad instrument. Reading for the pattern statically produced four
   false positives out of six — per-unit scratch fields that are never summed — and missed
   `audit.passedOver`, which really was NaN. The fault is a runtime property and it is trivial
   to detect by running the thing: the suite now plays a contest and asserts that no number it
   reports is NaN. That catches every instance including the ones a reader would not think to
   look for, which is the whole lesson of this project applied to its own tools. */

/* --------------------------------------------------- 3. conditions that cannot be true ---- */
/* The narrow, checkable version: a weight compared against a reserve it can never exceed. This
   caught the mercenary refusal branch, which was unreachable by arithmetic rather than by world
   state — the top bidder always scored money=1, so a reserve below the money weight was cleared
   by every offer however murderous the bidder. Kept as a named pattern rather than a general
   solver, because a general solver would be a lie about what this can see. */
try {
  const SEASON = require('./season.js');
  const K = SEASON.CONST;
  if (K.MERC_RESERVE <= K.MERC_W_MONEY)
    out.neverTrue.push('MERC_RESERVE (' + K.MERC_RESERVE + ') <= MERC_W_MONEY (' +
                       K.MERC_W_MONEY + '): a mercenary could never refuse the whole market');
  if (K.FOUNDING_TOP >= K.ROSTER_TARGET)
    out.neverTrue.push('FOUNDING_TOP >= ROSTER_TARGET: no corp could ever work a signing window');
  if (K.SURVEY_MONTHS >= K.PREP_MONTHS)
    out.neverTrue.push('SURVEY_MONTHS >= PREP_MONTHS: a survey could never report');
} catch (e) { out.neverTrue.push('could not load season.js: ' + e.message); }

/* ------------------------------------------------------------------------- the report ---- */
const line = '='.repeat(78);
console.log('\nCROSS-STEP AUDIT \u00b7 does one step\u2019s work reach the next?');
console.log(line);

if (out.writeOnly.length) {
  console.log('\nSTATE WRITTEN AND NEVER READ');
  console.log('-'.repeat(78));
  for (const w of out.writeOnly)
    console.log('  \u2717 ' + w.field.padEnd(22) + 'written in ' + w.writtenIn);
  console.log('\n  Each of these is a handover that does not happen. `corp._window` looked exactly');
  console.log('  like this for several steps while the suite stayed green.');
} else console.log('\n  \u2713 every piece of scratch state written by one system is read by another');

if (out.deadConst.length) {
  console.log('\nCONSTANTS NOBODY READS');
  console.log('-'.repeat(78));
  for (const c of out.deadConst) console.log('  \u2717 ' + c.name.padEnd(26) + c.module);
} else console.log('  \u2713 every constant declared is read somewhere');

if (out.undeclared.length) {
  console.log('\nCONSTANTS READ THAT THIS FILE NEVER DECLARED');
  console.log('-'.repeat(78));
  for (const c of out.undeclared)
    console.log('  \u2717 ' + ('CONST.' + c.name).padEnd(26) + 'read in ' + c.module +
                ', which does not declare it \u2014 reads as undefined');
} else console.log('  \u2713 every constant read is declared by the file reading it');

if (out.uncalled.length) {
  console.log('\nFUNCTIONS NOBODY CALLS');
  console.log('-'.repeat(78));
  for (const f of out.uncalled)
    console.log('  \u2717 ' + (f.name + '()').padEnd(26) + 'defined in ' + f.module +
                ', called from nowhere');
} else console.log('  \u2713 every function defined is called by something');

if (out.neverTrue.length) {
  console.log('\nCONDITIONS THAT CANNOT BECOME TRUE');
  console.log('-'.repeat(78));
  for (const n of out.neverTrue) console.log('  \u2717 ' + n);
} else console.log('  \u2713 no named branch is unreachable by arithmetic');

console.log('\n' + line);
console.log('  ' + out.ok + ' live \u00b7 ' + out.writeOnly.length + ' write-only \u00b7 ' +
            out.deadConst.length + ' dead constants \u00b7 ' +
            out.undeclared.length + ' undeclared \u00b7 ' +
            out.uncalled.length + ' uncalled \u00b7 ' + out.neverTrue.length + ' unreachable');
console.log(line + '\n');
process.exitCode = (out.writeOnly.length + out.deadConst.length + out.undeclared.length +
                    out.uncalled.length + out.neverTrue.length) ? 1 : 0;
