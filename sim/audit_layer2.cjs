/* GRID AUDIT — LAYER 2: DOES IT EVER FIRE?
 *
 * Layer 1 says what is wired. Wired is an upper bound: a read inside a branch that never becomes
 * true still reads as wired, which is how `spotted` sat live-looking and dead for months.
 *
 * This asks the runtime question instead, and it asks it THROUGH FULL CONTESTS, where
 * corporations buy their own kit. A previous pass ran this sort of census on twelve fighters all
 * carrying the same carbine and concluded suppression never fires — against 4,705 pins in two
 * real contests. There is no synthetic fight anywhere in this file, deliberately.
 *
 * Three outcomes, and they are not the same claim:
 *   CARRIED, FIRES   somebody had it and the condition became true
 *   CARRIED, NEVER FIRES   somebody had it and the condition never became true — the fault
 *   NEVER CARRIED    nobody in N contests ever had it; the branch was never given a chance,
 *                    which is NOT the same as the branch being broken
 *
 *   node audit_layer2.cjs [contests]
 */
const fs = require('fs');
const P = require('./prng.js'), C = require('./combat.js'), D = require('./divide.js');
const OA = require('../data/oa_profiles.json').oa_profiles;
const CONTESTS = Number(process.argv[2] || 2);

const J = n => JSON.parse(fs.readFileSync(__dirname + '/../data/' + n, 'utf8'));
const listOf = (d, k) => { const v = d[k] || d; return Array.isArray(v) ? v : Object.values(v); };

const hookOwners = new Map(), tagOwners = new Map();
for (const t of listOf(J('traits.json'), 'traits'))
  for (const h of ((t.effects || {}).hooks || []))
    (hookOwners.get(h) || hookOwners.set(h, []).get(h)).push(t.name || t.id);
for (const it of listOf(J('items.json'), 'items'))
  for (const g of ((it.effects || {}).tags || []))
    (tagOwners.get(g) || tagOwners.set(g, []).get(g)).push(it.name || it.id);

/* ---- instrument the two runtime chokepoints ------------------------------------- */
/* WRAPPING AN EXPORT ONLY CATCHES EXTERNAL CALLERS. `combat.js` calls its own `hasQuirk`
   directly — `hasQuirk(u, 'vent_2')` at line 444, not `C.hasQuirk` — so those calls never pass
   through this wrapper and read here as "never asked". They are not: 585 weapons vented in one
   contest, which is that exact line running. Treat the "carried but the game never asks"
   category below as UNRELIABLE for anything combat.js calls internally.
   The `QUIRK` table wrapping further down does not have this problem, because it mutates the
   handler objects that the internal code itself looks up. Carrier counts are also sound. */
const tagAsked = new Map(), tagTrue = new Map();
const realHasQuirk = C.hasQuirk;
C.hasQuirk = function (c, q) {
  const r = realHasQuirk.apply(this, arguments);
  tagAsked.set(q, (tagAsked.get(q) || 0) + 1);
  if (r) tagTrue.set(q, (tagTrue.get(q) || 0) + 1);
  return r;
};
/* THE TAG LOOKUP TABLE IS THE OTHER DISPATCH ROUTE, and the busier one. `quirkAim` and
   `quirkCover` iterate a fighter's tags and look each one up in `QUIRK` — they never call
   `hasQuirk`. The first version of this file instrumented `hasQuirk` alone and reported 17 tags
   as "carried but the game never asks", including `spread` and `pierce_1`, which fire constantly
   through the table. Measuring one route and concluding about all of them is the same mistake
   that produced the carbine-only suppression finding. Every handler is wrapped here. */
const tagHandlerFired = new Map();
for (const name of Object.keys(C.QUIRK)) {
  const h = C.QUIRK[name];
  for (const k of Object.keys(h)) {
    if (typeof h[k] !== 'function') continue;
    const orig = h[k];
    h[k] = function () {
      tagHandlerFired.set(name, (tagHandlerFired.get(name) || 0) + 1);
      return orig.apply(this, arguments);
    };
  }
}

/* every tag a fighter actually walked onto the field carrying, asked or not */
const tagCarried = new Map(), hookCarried = new Map();
/* INSTRUMENT THE DATA, NOT THE FUNCTION. Wrapping `C.hasQuirk` missed every call `combat.js`
   makes to its own copy, which is nearly all of them. The tag list itself cannot be bypassed:
   whoever asks the question — internal or external, `hasQuirk` or the table walk — reaches
   through this array. A Proxy on it therefore sees every read, which wrapping the export never
   could. `Set.prototype.has` needed no such trick because patching a prototype is global and
   already caught the internal callers; that is why the hook numbers were sound and the tag
   numbers were not. */
const tagProxied = new WeakSet();
function watchTags(w) {
  if (!w || !Array.isArray(w.tags) || tagProxied.has(w)) return;
  const raw = w.tags;
  w.tags = new Proxy(raw, {
    get(t, k) {
      if (k === 'indexOf') return q => {
        tagAsked.set(q, (tagAsked.get(q) || 0) + 1);
        const i = raw.indexOf(q);
        if (i >= 0) tagTrue.set(q, (tagTrue.get(q) || 0) + 1);
        return i;
      };
      return t[k];
    }
  });
  tagProxied.add(w);
}
const realMake = C.makeCombatant;
C.makeCombatant = function (f, opts) {
  const c = realMake.apply(this, arguments);
  for (const g of ((c.weapon && c.weapon.tags) || []))
    tagCarried.set(g, (tagCarried.get(g) || 0) + 1);
  watchTags(c.weapon);
  if (c.sidearmKit) watchTags(c.sidearmKit);
  if (c.hooks) for (const h of c.hooks) hookCarried.set(h, (hookCarried.get(h) || 0) + 1);
  return c;
};
/* and every hook the game ASKS about, with the answer — `has` is called straight on the Set */
const hookAsked = new Map(), hookTrue = new Map();
const realHas = Set.prototype.has;
Set.prototype.has = function (v) {
  const r = realHas.call(this, v);
  if (typeof v === 'string' && hookOwners.has(v)) {
    hookAsked.set(v, (hookAsked.get(v) || 0) + 1);
    if (r) hookTrue.set(v, (hookTrue.get(v) || 0) + 1);
  }
  return r;
};

for (let i = 0; i < CONTESTS; i++)
  D.runDivide(P.mulberry32(P.seedFrom('l2_' + i)), { oaProfiles: OA, corpCount: 8, season: 1 });

Set.prototype.has = realHas;
C.hasQuirk = realHasQuirk;
C.makeCombatant = realMake;

function report(title, owners, carried, asked, fired, extra) {
  const never = [], carriedNeverFires = [], fires = [], nobody = [];
  for (const [name, who] of owners) {
    const c = carried.get(name) || 0;
    /* both routes count: the direct question, and the lookup table */
    /* THREE ROUTES, NOT ONE. A tag reaches the game through the direct question
       (`quirksOf(c).indexOf(q)`), through the `QUIRK` handler table, and through `CONST.TEMPO`,
       which is keyed by tag name and touched by neither of the others. Watching one route at a
       time reported first 11, then 6, then 4 tags dead; the true figure is 2. Verified at
       runtime: tempo returns 2.0 (burst) 1,416 times and 0.5 (single_shot) 144 times in one
       contest, so both are live despite never being asked about by name. */
    const tempo = (C.CONST.TEMPO && C.CONST.TEMPO[name] != null) ? 1 : 0;
    const a = (asked.get(name) || 0) + (extra ? (extra.get(name) || 0) : 0) + tempo;
    const t = (fired.get(name) || 0) + (extra ? (extra.get(name) || 0) : 0) + tempo;
    if (t > 0) fires.push({ name, c, a, t, who });
    else if (c === 0) nobody.push({ name, who });
    else if (a === 0) never.push({ name, c, who });          // carried, and never even asked
    else carriedNeverFires.push({ name, c, a, who });         // asked, always false
  }
  console.log('\n=========================================================================');
  console.log('  ' + title);
  console.log('=========================================================================');
  console.log('  fires in play                         ' + fires.length);
  console.log('  CARRIED BUT THE GAME NEVER ASKS       ' + never.length);
  console.log('  asked but the answer is never yes     ' + carriedNeverFires.length);
  console.log('  nobody ever carried it                ' + nobody.length);
  if (never.length) {
    console.log('\n  -- carried by real fighters, and nothing ever asks --');
    for (const r of never.sort((a, b) => b.c - a.c))
      console.log('     ' + r.name.padEnd(34) + String(r.c).padStart(5) + ' carriers   (' +
                  r.who.slice(0, 2).join(', ') + ')');
  }
  if (carriedNeverFires.length) {
    console.log('\n  -- asked about, never once true --');
    for (const r of carriedNeverFires.sort((a, b) => b.a - a.a))
      console.log('     ' + r.name.padEnd(34) + String(r.c).padStart(5) + ' carriers, asked ' +
                  r.a + ' times, true 0');
  }
  return { fires, never, carriedNeverFires, nobody };
}
console.log('\n' + CONTESTS + ' full contests, real kit, no synthetic fights');
const T = report('WEAPON AND KIT TAGS', tagOwners, tagCarried, tagAsked, tagTrue, tagHandlerFired);
const H = report('TRAIT HOOKS', hookOwners, hookCarried, hookAsked, hookTrue);
console.log('\n  NOTE ON "nobody ever carried it": that is a statement about ' + CONTESTS +
            ' contests,\n  not about the game. Raise the count, or build the carrier on purpose,' +
            '\n  before calling any of those dead.');
