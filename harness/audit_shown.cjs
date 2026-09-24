/* AUDIT 2 — WHAT IS SHOWN OR SOLD AND DOES NOT DO WHAT IT SAYS. The drone was the model case: an
   item declared an action (`deploy`) that nothing in the engine answered, so it was sold, carried
   and charged and did nothing. This sweeps every name an item can declare an effect by — its tags,
   its action, its effect fields — and reports each one the engine never mentions.
   `node harness/audit_shown.cjs` */
const fs = require('fs');
const SIM = '/home/claude/opes-arx/sim/';
const engine = ['combat.js', 'tactical.js', 'divide.js', 'items.js', 'season.js', 'negotiate.js', 'map.js']
  .map(f => fs.readFileSync(SIM + f, 'utf8')).join('\n');
const said = w => new RegExp('[\'"`]' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"`]').test(engine);
const d = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/items.json', 'utf8'));
const items = [];
for (const k in d) if (Array.isArray(d[k]) && d[k].length && typeof d[k][0] === 'object' && d[k][0].id) items.push(...d[k]);
const tags = {}, actions = {}, fields = {};
for (const it of items) {
  const eff = it.effects || {};
  for (const t of (eff.tags || []).concat(it.tags || [])) (tags[t] = tags[t] || []).push(it.id);
  if (it.action) (actions[it.action] = actions[it.action] || []).push(it.id);
  for (const f in eff) if (f !== 'tags') (fields[f] = fields[f] || []).push(it.id);
}
const report = (label, o) => {
  const dead = Object.keys(o).filter(k => !said(k));
  console.log('\n' + label + ' \u2014 ' + Object.keys(o).length + ' in the catalogue, ' + dead.length + ' the engine never names:');
  dead.forEach(k => console.log('  ' + k.padEnd(26) + o[k].length + ' item' + (o[k].length === 1 ? '' : 's') + ': ' + o[k].slice(0, 4).join(', ') + (o[k].length > 4 ? ' \u2026' : '')));
};
console.log('ITEMS: ' + items.length);
report('TAGS', tags);
report('ACTIONS', actions);
report('EFFECT FIELDS', fields);
