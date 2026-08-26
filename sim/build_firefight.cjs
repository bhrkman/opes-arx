/* Builds the_firefight.html — one engagement, on the grid, turn by turn.
 *
 * The grid has produced a full per-body replay since Step 7.5 — every unit's tile, state,
 * composure and ammunition, once per acting body — and nothing has ever drawn it. `runLab`
 * prints distances to a terminal and that is the whole of it.
 *
 * It exists now because of the drop-in: a squad walking into a fight already in progress is
 * the one thing in this project that cannot be judged from a number. Either you watch them
 * come in on the right bearing, behind people who set up facing somewhere else, or you are
 * taking my word for it.
 *
 * The fight is fought here, in the page, by the live `tactical.resolve`. The reinforcement
 * schedule handed to it is the same shape `divide.js` builds during a contest.
 *
 *   node build_firefight.cjs        ->  viewers/the_firefight.html
 */
const fs = require('fs');
const D = __dirname + '/';

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

const tplPath = D + '../viewers/firefight_template.html';
if (!fs.existsSync(tplPath)) {
  console.error('firefight_template.html is missing — a build script whose template is gone is not a build script');
  process.exit(1);
}
const tpl = fs.readFileSync(tplPath, 'utf8');
for (const marker of ['/*__DATA__*/', '/*__SIM__*/']) {
  if (tpl.indexOf(marker) < 0) { console.error('template lost its ' + marker + ' marker'); process.exit(1); }
}
const out = tpl.replace('/*__DATA__*/', data).replace('/*__SIM__*/', js);

/* The build message is not evidence — a template patch that threw partway through once left
   this script rebuilding the previous page and reporting success. */
/* MARKERS FOR FEATURES, NOT FOR PROSE. This list had 'THE DROP-IN' in it, which was a phrase in
   an explanatory paragraph rather than anything the page DOES — so when the paragraph was cut the
   guard failed even though every feature it was standing for still worked. A guard anchored to
   wording fires on an edit to the wording; anchor it to the code that has to be there. */
const MUST_CONTAIN = ['ctx.reinforce', 'frames', 'CDTACTICAL', 'tiles[y]', 'THE WOUND POOL',
                      'buildShots', 'planForce', 'G.tween'];
const missing = MUST_CONTAIN.filter(t => out.indexOf(t) < 0);
if (missing.length) {
  console.error('the built page is not the page this template describes.\n  missing: ' + missing.join(', '));
  process.exit(1);
}
fs.writeFileSync(D + '../viewers/the_firefight.html', out);
console.log('the_firefight.html written · ' +
            Math.round(fs.statSync(D + '../viewers/the_firefight.html').size / 1024) + 'KB · live engine, ' +
            MODULES.length + ' modules inlined');
