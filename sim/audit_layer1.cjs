/* GRID AUDIT — LAYER 1: IS IT WRITTEN?
 *
 * For every named thing the grid declares, does anything read it, and (for state a fighter
 * carries) does anything write it? A constant nobody reads is a claim with no implementation.
 * A flag that is read but never written is the fault this project keeps producing.
 *
 * This pass is STATIC and says nothing about whether a thing fires in play — that is Layer 2,
 * and a Layer 1 "looks wired" is not evidence of anything. It reports its own blind spots at
 * the bottom rather than presenting a clean sheet it has not earned.
 */
const fs = require('fs');
const SRC = { 'tactical.js': fs.readFileSync(__dirname + '/tactical.js', 'utf8'),
              'combat.js':   fs.readFileSync(__dirname + '/combat.js', 'utf8') };
const ALL = Object.values(SRC).join('\n');
/* GAME CODE AND TEST CODE ARE COUNTED SEPARATELY, because they are different claims.
   A flag written only by the suite is a flag the GAME never sets — and a passing test for a
   state that never occurs in play is worse than no test, since it reads as a green check on a
   dead mechanism. `exposed` is exactly that: one writer in the whole tree, and it is arx.cjs. */
const IS_TEST = f => /^(arx|audit_|probe_|measure|build_)/.test(f);
const files = fs.readdirSync(__dirname).filter(f => /\.(js|cjs)$/.test(f) && !/^audit_layer1/.test(f));
const GAME = files.filter(f => !IS_TEST(f)).map(f => fs.readFileSync(__dirname+'/'+f,'utf8')).join('\n');
const TEST = files.filter(f =>  IS_TEST(f)).map(f => fs.readFileSync(__dirname+'/'+f,'utf8')).join('\n');
const TREE = GAME + '\n' + TEST;

/** strip comments so a name mentioned only in prose is not counted as a use */
function decomment(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const TREE_CODE = decomment(TREE);
const GAME_CODE = decomment(GAME);
const TEST_CODE = decomment(TEST);

/* ---- 1. constants -------------------------------------------------------------- */
function constKeys(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return [];
  const body = src.slice(i, i + 12000);
  const keys = [];
  for (const m of body.matchAll(/^\s{2,4}([A-Z][A-Z0-9_]*)\s*:/gm)) keys.push(m[1]);
  return [...new Set(keys)];
}
const tacConst = constKeys(SRC['tactical.js'], 'const CONST = {');
const comConst = constKeys(SRC['combat.js'], 'const CONST = {');

function usesOf(name) {
  const re = new RegExp('CONST\\s*\\.\\s*' + name + '\\b', 'g');
  return (TREE_CODE.match(re) || []).length;
}

const rows = [];
for (const [file, keys] of [['tactical.js', tacConst], ['combat.js', comConst]]) {
  for (const k of keys) rows.push({ file, name: k, uses: usesOf(k) });
}
const deadConst = rows.filter(r => r.uses === 0);

console.log('\n=========================================================================');
console.log('  LAYER 1 — CONSTANTS DECLARED BY THE GRID');
console.log('=========================================================================');
console.log('  declared: ' + rows.length + '   read somewhere: ' + (rows.length - deadConst.length) +
            '   READ BY NOTHING: ' + deadConst.length);
if (deadConst.length) {
  console.log('');
  for (const r of deadConst) console.log('  unread   ' + r.file.padEnd(14) + r.name);
}

/* ---- 2. combatant state flags ---------------------------------------------------- */
/* every `target.X` / `u.X` the shot calculation or the grid branches on */
const flagNames = new Set();
for (const m of decomment(SRC['combat.js']).matchAll(/target\.([a-z_][A-Za-z0-9_]*)/g)) flagNames.add(m[1]);
const skip = new Set(['cover','hooks','stats','weapon','armor','ref','hp','hpMax','x','y','id',
                      'state','ammo','comp','side','loadout','onSidearm','bleed','kit','name']);
console.log('\n=========================================================================');
console.log('  LAYER 1 — STATE THE SHOT CALCULATION BRANCHES ON');
console.log('=========================================================================');
for (const f of [...flagNames].sort()) {
  if (skip.has(f)) continue;
  const gw = (GAME_CODE.match(new RegExp('\\.' + f + '\\s*=(?!=)', 'g')) || []).length;
  const tw = (TEST_CODE.match(new RegExp('\\.' + f + '\\s*=(?!=)', 'g')) || []).length;
  const gr = (GAME_CODE.match(new RegExp('\\.' + f + '\\b(?!\\s*=[^=])', 'g')) || []).length;
  const verdict = gw === 0 && tw === 0 ? 'NEVER WRITTEN BY ANYTHING'
                : gw === 0             ? 'NEVER WRITTEN BY THE GAME — only the suite sets it'
                : '';
  console.log('  ' + f.padEnd(18) + 'read(game) ' + String(gr).padStart(3) +
              '   written: game ' + String(gw).padStart(2) + ', suite ' + String(tw).padStart(2) +
              '   ' + verdict);
}

console.log('\n  BLIND SPOTS OF THIS PASS — read before trusting it');
console.log('  · Static only. "Looks wired" is not "fires in play"; that is Layer 2.');
console.log('  · Counts textual uses. A constant reached by computed access (CONST[k]) or');
console.log('    destructuring would read as unused here and is not necessarily dead.');
console.log('  · A read inside a branch that never becomes true still counts as a read.');
console.log('    Every "wired" verdict below is therefore an upper bound on liveness.');

/* ---- 3. what the catalogs promise ------------------------------------------------ */
const J = n => JSON.parse(fs.readFileSync(__dirname + '/../data/' + n, 'utf8'));
function listOf(d, key) { const v = d[key] || d; return Array.isArray(v) ? v : Object.values(v); }

const traits = listOf(J('traits.json'), 'traits');
const hooks = new Map();
for (const t of traits) {
  for (const h of ((t.effects || {}).hooks || [])) {
    if (!hooks.has(h)) hooks.set(h, []);
    hooks.get(h).push(t.name || t.id);
  }
}
const items = listOf(J('items.json'), 'items');
const tags = new Map();
for (const it of items) {
  for (const g of ((it.effects || {}).tags || [])) {
    if (!tags.has(g)) tags.set(g, []);
    tags.get(g).push(it.name || it.id);
  }
}
/* A NAME CAN BE READ WITHOUT EVER BEING QUOTED. The first version of this counted only
   `'tag'` and `"tag"`, and reported 11 of 32 weapon tags dead against the suite's 3. The suite
   was right: tags are dispatched through a lookup table whose KEYS are the tag names, written
   bare — `pierce_1: { ... }` — so not one of them appears in quotes anywhere. Counting quoted
   occurrences measured my own assumption about how dispatch is written.
   Both forms are counted now, and where this disagrees with the suite the suite is the thing to
   check first, because it has been checking this for longer. */
function readsIn(code, name) {
  const quoted = (code.match(new RegExp("['\"]" + name + "['\"]", 'g')) || []).length;
  const key    = (code.match(new RegExp('^\\s+' + name + '\\s*:', 'gm')) || []).length;
  const dotted = (code.match(new RegExp('\\.' + name + '\\b', 'g')) || []).length;
  return quoted + key + dotted;
}
function report(title, map, noun) {
  const dead = [], live = [];
  for (const [name, owners] of map) {
    const g = readsIn(GAME_CODE, name), t = readsIn(TEST_CODE, name);
    (g === 0 ? dead : live).push({ name, owners, g, t });
  }
  console.log('\n=========================================================================');
  console.log('  LAYER 1 — ' + title);
  console.log('=========================================================================');
  console.log('  ' + map.size + ' distinct ' + noun + '   read by the game: ' + live.length +
              '   READ BY NOTHING: ' + dead.length);
  for (const d of dead.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log('  unread  ' + d.name.padEnd(34) + '(' + d.owners.slice(0, 3).join(', ') +
                (d.owners.length > 3 ? ', +' + (d.owners.length - 3) : '') + ')' +
                (d.t ? '   [named by the suite]' : ''));
  }
}
report('TRAIT HOOKS THE CATALOG PROMISES', hooks, 'hooks');
report('WEAPON AND KIT TAGS THE CATALOG PROMISES', tags, 'tags');
