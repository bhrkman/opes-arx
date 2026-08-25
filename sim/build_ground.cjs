/* Builds the_ground.html — the contest, drawn.
 *
 * Nothing has ever rendered the ground. The ring closes on schedule, squads march, fights
 * happen at real coordinates, and the only surface that showed any of it was a text dump in a
 * terminal. `divide.js` has carried a full per-day recorder since Step 6 — positions, tracks,
 * the ring now and the ring next, revealed sites, per-corp standing, and every event of the
 * day — behind `opts.replay`, and the only callers were the suite's own guard and the lab.
 * Measured: recording costs ~8% of a contest's runtime and 167KB for a whole Divide, so it can
 * simply be on.
 *
 * This page runs a REAL contest through the live modules and draws the recording that contest
 * produced. It is not fed a captured file, so it cannot show a Divide the engine would not
 * play. Terrain is sampled from the planet's own `terrainAt`, which is the same warped field
 * squads move through — not a decorative texture.
 *
 *   node build_ground.cjs        ->  viewers/the_ground.html
 */
const fs = require('fs');
const D = __dirname + '/';

/* ORDER MATTERS — each module captures its dependencies as it evaluates, so a dependency
   inlined after its dependent is `undefined` for ever. Same list and order as build_crate.cjs;
   `divide.js` reaches for all of them. */
const MODULES = ['prng.js', 'roster.js', 'items.js', 'map.js', 'ledger.js', 'reputation.js',
                 'combat.js', 'tactical.js', 'negotiate.js', 'divide.js'];
const DATA = ['races.json', 'traits.json', 'oa_profiles.json', 'recruitment.json', 'items.json'];

let js = '';
for (const m of MODULES) js += '\n/* ==== ' + m + ' ==== */\n' + fs.readFileSync(D + m, 'utf8');

let data = 'window.ARX_DATA = {\n';
for (const d of DATA) {
  data += '  ' + JSON.stringify(d.replace('.json', '')) + ': ' +
          fs.readFileSync(D + '../data/' + d, 'utf8') + ',\n';
}
data += '};\n';

const tplPath = D + '../viewers/ground_template.html';
if (!fs.existsSync(tplPath)) {
  console.error('ground_template.html is missing — a build script whose template is gone is not a build script');
  process.exit(1);
}
const tpl = fs.readFileSync(tplPath, 'utf8');
for (const marker of ['/*__DATA__*/', '/*__SIM__*/']) {
  if (tpl.indexOf(marker) < 0) { console.error('template lost its ' + marker + ' marker'); process.exit(1); }
}
const out = tpl.replace('/*__DATA__*/', data).replace('/*__SIM__*/', js);
/* THE BUILD MESSAGE IS NOT EVIDENCE. A patch to the template threw partway through and never
   wrote the file; this script then rebuilt happily from the unchanged template and printed its
   usual cheerful line, and that line was taken as proof the change had landed. It had not.
   So the built page is checked for the things it is supposed to contain, and a build that has
   quietly produced the previous page fails instead of congratulating itself. */
const MUST_CONTAIN = ['THE ARROWHEAD', 'sq.ax', 'sq.hb', 'sq.jn', 'red rings mean a firefight', 'terrainAt', 'CDDIVIDE'];
const MUST_NOT_CONTAIN = ['sq.tr[k]'];          /* the walked-route line, replaced by the aim */
const missing = MUST_CONTAIN.filter(t => out.indexOf(t) < 0);
const stale = MUST_NOT_CONTAIN.filter(t => out.indexOf(t) >= 0);
if (missing.length || stale.length) {
  console.error('the built page is not the page this template describes.' +
    (missing.length ? '\n  missing: ' + missing.join(', ') : '') +
    (stale.length ? '\n  still present: ' + stale.join(', ') : ''));
  process.exit(1);
}
fs.writeFileSync(D + '../viewers/the_ground.html', out);
console.log('the_ground.html written · ' +
            Math.round(fs.statSync(D + '../viewers/the_ground.html').size / 1024) + 'KB · live engine, ' +
            MODULES.length + ' modules inlined');
