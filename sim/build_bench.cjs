/* Builds the_table.html — the manager's side of the negotiation.
 *
 * This page runs the REAL engine in the browser: prng, roster, items, map, combat, divide,
 * negotiate and ledger are inlined verbatim, and the page halts a genuine Divide at a comms
 * window and lets you negotiate against the board as it actually stands. Nothing is mocked
 * and nothing is reconstructed from a summary, because a reconstructed board is a board that
 * can drift out of step with the engine — which is the drift this project guards against
 * everywhere else.
 */
const fs = require('fs'), path = require('path');
const D = __dirname + '/';

/* ORDER MATTERS. Each module captures its dependencies at load time — `divide.js` does
   `const LED = global.CDLEDGER` as it evaluates — so a dependency inlined after its dependent
   is `undefined` for ever. `ledger.js` sat after `divide.js` here, which meant the flagship
   viewer threw on the first Divide it tried to run. Dependencies first. */
/* `reputation.js` was never in this list at all — the viewer has been missing an entire module
   since Step 6 added it, and `divide.js` reaches for `REP.open` on every Divide. Nobody noticed
   because the viewer could not be rebuilt to find out. */
const MODULES = ['prng.js', 'roster.js', 'items.js', 'map.js', 'ledger.js', 'reputation.js',
                 'combat.js', 'tactical.js', 'negotiate.js', 'divide.js'];
const DATA = ['races.json', 'traits.json', 'oa_profiles.json', 'recruitment.json', 'items.json'];

let js = '';
for (const m of MODULES) js += '\n/* ==== ' + m + ' ==== */\n' + fs.readFileSync(D + m, 'utf8');

let data = 'window.ARX_DATA = {\n';
for (const d of DATA) {
  data += '  ' + JSON.stringify(d.replace('.json', '')) + ': ' + fs.readFileSync(D + '../data/' + d, 'utf8') + ',\n';
}
data += '};\n';

/* This template was MISSING from the project entirely, so `the_table.html` — the flagship
   playable viewer — could not be rebuilt at any point during Step 7.5 and still dated from
   before the grid became the engagement model. It was recovered by reversing the inlining on
   the built artifact. A build script whose template is gone is not a build script. */
const tpl = fs.readFileSync(D + '../viewers/bench_template.html', 'utf8');
const out = tpl
  .replace('/*__DATA__*/', data)
  .replace('/*__SIM__*/', js);
fs.writeFileSync(D + '../viewers/the_table.html', out);
console.log('the_table.html written · ' + Math.round(fs.statSync(D + '../viewers/the_table.html').size / 1024) + 'KB · live engine, ' +
            MODULES.length + ' modules inlined');
