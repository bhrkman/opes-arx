/* EVERY HOOK IN THE CATALOGUE EITHER DOES SOMETHING OR SAYS WHY IT DOES NOT.
   A hook named in traits.json and read by no module is a standing lie about what the game does
   — a manager reads the trait, believes it, and nothing happens. Each one must be either wired
   or labelled `effects.decoration` with the reason the feature it wants does not exist.
   `node audit_hooks.cjs` */
const fs = require('fs');
const T = JSON.parse(fs.readFileSync(__dirname + '/../data/traits.json', 'utf8')).traits;
const owner = new Map(), decor = new Map();
for (const t of T) {
  const e = t.effects || {};
  for (const h of (e.hooks || [])) {
    if (!owner.has(h)) owner.set(h, []);
    owner.get(h).push(t.name);
    if (e.decoration && e.decoration[h]) decor.set(h, e.decoration[h]);
  }
}
const src = fs.readdirSync(__dirname).filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n');
const dead = [...owner.keys()].filter(h => !src.includes(h));
const unlabelled = dead.filter(h => !decor.has(h));
console.log('\n== HOOKS ==');
console.log('  in the catalogue: ' + owner.size);
console.log('  read by a module: ' + (owner.size - dead.length));
console.log('  labelled decoration: ' + dead.filter(h => decor.has(h)).length);
for (const h of dead) if (decor.has(h)) console.log('    ' + h.padEnd(32) + decor.get(h));
if (unlabelled.length) {
  console.log('\n  ' + unlabelled.length + ' hook(s) that do nothing and do not say so:');
  for (const h of unlabelled) console.log('    ' + h.padEnd(32) + owner.get(h).join(', '));
  process.exit(1);
}
console.log('\n  every hook either does something or says why it does not');
