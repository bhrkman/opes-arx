/* Builds the_desk.html — the Step 8.8 demo: the prep year, played a month at a time.
 *
 * Inlines the live modules and runs them in the page. The months, the verbs, their costs and
 * every reason a verb is unavailable come from `season.monthOptions` — the SAME function the AI
 * corps are ranking — and the month is ended through `season.stepMonth`, which is the same call
 * `runSeason` makes. The page therefore cannot drift into demonstrating a game the engine is not
 * playing, which is the failure that killed `approach_lab.html` at Step 7.5.
 *
 *   node build_desk.cjs        ->  viewers/the_desk.html
 */
const fs = require('fs'), path = require('path');
const D = __dirname + '/';

/* ORDER MATTERS — each module captures its dependencies as it evaluates, so a dependency
   inlined after its dependent is `undefined` for ever. `season.js` now reaches for `map.js` and
   `negotiate.js` as well, because the planet and its pot are announced at the season open. */
const MODULES = ['prng.js', 'roster.js', 'items.js', 'map.js', 'ledger.js', 'reputation.js',
                 'combat.js', 'tactical.js', 'negotiate.js', 'sponsors.js', 'predivide.js', 'divide.js', 'season.js'];
const DATA = ['races.json', 'traits.json', 'oa_profiles.json', 'recruitment.json', 'items.json'];

let js = '';
for (const m of MODULES) js += '\n/* ==== ' + m + ' ==== */\n' + fs.readFileSync(D + m, 'utf8');

let data = 'window.ARX_DATA = {\n';
for (const d of DATA) {
  data += '  ' + JSON.stringify(d.replace('.json', '')) + ': ' +
          fs.readFileSync(D + '../data/' + d, 'utf8') + ',\n';
}
data += '};\n';

const tplPath = D + '../viewers/desk_template.html';
if (!fs.existsSync(tplPath)) {
  console.error('desk_template.html is missing — a build script whose template is gone is not a build script');
  process.exit(1);
}
const tpl = fs.readFileSync(tplPath, 'utf8');
for (const marker of ['/*__DATA__*/', '/*__SIM__*/']) {
  if (tpl.indexOf(marker) < 0) { console.error('template lost its ' + marker + ' marker'); process.exit(1); }
}
const out = tpl.replace('/*__DATA__*/', data).replace('/*__SIM__*/', js);
fs.writeFileSync(D + '../viewers/the_desk.html', out);
console.log('the_desk.html written · ' +
            Math.round(fs.statSync(D + '../viewers/the_desk.html').size / 1024) + 'KB · live engine, ' +
            MODULES.length + ' modules inlined');
