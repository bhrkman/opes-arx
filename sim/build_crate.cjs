/* Builds the_crate.html — the Step 8.5 demo.
 *
 * Inlines the live modules and runs them in the page. The crate is opened by the REAL
 * `openCrate` exported from `divide.js`, so this viewer cannot drift into showing a hand-written
 * mirror of logic that has moved — which is why `approach_lab.html` was deleted at Step 7.5.
 *
 *   node build_crate.cjs        ->  viewers/the_crate.html
 */
const fs = require('fs'), path = require('path');
const D = __dirname + '/';

/* ORDER MATTERS — each module captures its dependencies as it evaluates, so a dependency
   inlined after its dependent is `undefined` for ever. Same list and same order as
   build_bench.cjs, minus nothing: `divide.js` reaches for all of them. */
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

const tplPath = D + '../viewers/crate_template.html';
if (!fs.existsSync(tplPath)) {
  console.error('crate_template.html is missing — a build script whose template is gone is not a build script');
  process.exit(1);
}
const tpl = fs.readFileSync(tplPath, 'utf8');
for (const marker of ['/*__DATA__*/', '/*__SIM__*/']) {
  if (tpl.indexOf(marker) < 0) { console.error('template lost its ' + marker + ' marker'); process.exit(1); }
}
const out = tpl.replace('/*__DATA__*/', data).replace('/*__SIM__*/', js);
fs.writeFileSync(D + '../viewers/the_crate.html', out);
console.log('the_crate.html written · ' +
            Math.round(fs.statSync(D + '../viewers/the_crate.html').size / 1024) + 'KB · live engine, ' +
            MODULES.length + ' modules inlined');
