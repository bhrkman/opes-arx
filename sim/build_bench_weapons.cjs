/* Builds viewers/the_bench.html — the weapons bench.
 *
 * Step 7.5's demo. It runs the REAL resolver in the browser: prng, roster, items and combat
 * are inlined verbatim and the page resolves a genuine engagement from the live catalog.
 * Nothing is mocked and nothing is replayed from a recording, because a recording is a thing
 * that can drift out of step with the engine.
 *
 * What it is FOR: judging weapons and the fighters carrying them. So it steps one BODY at a
 * time, not one exchange at a time — who fired, what they fired, who they picked, what their
 * chance was, what they had left afterwards, and, when they did not fire, why not.
 */
const fs = require('fs'), path = require('path');
const D = __dirname + '/';

const MODULES = ['prng.js', 'roster.js', 'items.js', 'combat.js', 'tactical.js'];
const DATA = ['races.json', 'traits.json', 'oa_profiles.json', 'recruitment.json', 'items.json'];

let js = '';
for (const m of MODULES) js += '\n/* ==== ' + m + ' ==== */\n' + fs.readFileSync(D + m, 'utf8');

let data = 'window.ARX_DATA = {\n';
for (const d of DATA) data += '  ' + JSON.stringify(d.replace('.json', '')) + ': ' +
                               fs.readFileSync(D + '../data/' + d, 'utf8') + ',\n';
data += '};\n';

const tpl = fs.readFileSync(D + '../viewers/bench_weapons_template.html', 'utf8');
const out = tpl.replace('/*__DATA__*/', data).replace('/*__SIM__*/', js);
fs.writeFileSync(D + '../viewers/the_bench.html', out);

const kb = Math.round(out.length / 1024);
const prim = JSON.parse(fs.readFileSync(D + '../data/items.json', 'utf8'))
  .items.filter(i => i.slot === 'primary').length;
console.log('viewers/the_bench.html  ' + kb + 'kb  ' + prim + ' primaries selectable, real resolver inlined');
