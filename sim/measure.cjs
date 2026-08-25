/* measure.cjs — the DIVIDE.md §11 table, taken the same way on any tree.
 *
 * Runs the canon field on seeds doc0..docN and prints the state of the model. Deliberately
 * standalone and identical on both trees, so a before/after is a comparison of the GAME and
 * not of two different instruments — which is the failure mode this project keeps hitting.
 *
 *   node measure.cjs [divides]
 */
const path = require('path'), fs = require('fs');
const D = __dirname;
const find = n => {
  for (const c of [path.join(D, n), path.join(D, '..', 'data', n), path.join(D, '..', 'sim', n)])
    if (fs.existsSync(c)) return c;
  throw new Error('cannot find ' + n);
};
const P = require(find('prng.js'));
const DIV = require(find('divide.js'));
const gen = require(find('roster.js'));
const ITEMS = require(find('items.js'));
const OA = JSON.parse(fs.readFileSync(find('oa_profiles.json'), 'utf8')).oa_profiles;

const N = parseInt(process.argv[2] || '10', 10);
const acc = {};
const add = (k, v) => { acc[k] = (acc[k] || 0) + (v || 0); };

/* which corps prospect, and are they the poor ones? kit value per body at the muster. */
const prospect = [];

for (let i = 0; i < N; i++) {
  const st = DIV.runDivide(P.mulberry32(P.seedFrom('doc' + i)),
                           { oaProfiles: OA, raceById: gen.raceById });
  const a = st.audit || {};
  add('engagements', st.engagements);
  add('days', st.days);
  add('dead', st.dead);
  add('careerEnded', st.careerEnded);
  add('injured', st.injured);
  add('captured', st.captured);
  add('routs', st.routEngagements);
  add('zeroCas', st.zeroCasualtyEngagements);
  add('claims', st.claims);
  add('relays', st.relayFirings);
  add('reforms', a.reforms);
  add('flanked', a.flanked);
  add('multiSide', a.multiSide);
  add('betrayals', st.betrayals);
  add('crateUpgrades', a.gearUpgraded);
  add('cratePieces', a.cachePieces);
  add('crateExotics', a.cacheExotics);
  add('crateSupplies', a.cacheSupplies);
  add('traitHooks', a.traitHooks);
  add('overBulkDays', a.overBulkDays);
  for (const c of (st._corps || [])) {
    const heads = c.allBodies ? c.allBodies.length : 0;
    prospect.push({ id: c.corpId || c.id, kit: heads ? (c.kitValue || 0) / heads : 0,
                    crates: (c.squads || []).reduce((s, q) => s + (q.crates || 0), 0),
                    sites: c.sitesClaimed || 0 });
  }
}

const per = k => (acc[k] || 0) / N;
const f = (x, d) => Number(x).toFixed(d == null ? 1 : d);

console.log('\n' + N + ' Divides, canon field, seeds doc0..doc' + (N - 1));
console.log('-'.repeat(58));
const rows = [
  ['engagements', per('engagements')],
  ['length (days)', per('days')],
  ['permanent losses', per('dead') + per('careerEnded')],
  ['  of which dead', per('dead')],
  ['  career-ended', per('careerEnded')],
  ['injured', per('injured')],
  ['captured', per('captured')],
  ['routs', per('routs')],
  ['zero-casualty fights', per('zeroCas')],
  ['sites emptied', per('claims')],
  ['relays fired', per('relays')],
  ['reforms', per('reforms')],
  ['crates that gave something', per('crateUpgrades')],
  ['  weapon/armour pieces', per('cratePieces')],
  ['  of those, exotics', per('crateExotics')],
  ['  supplies handed out', per('crateSupplies')],
  ['over-bulk squad-days', per('overBulkDays')]
];
for (const [k, v] of rows) console.log('  ' + k.padEnd(30) + f(v, 2));

/* do the poorly-armed prospect more than the well-armed? */
const ranked = prospect.slice().sort((a, b) => a.kit - b.kit);
const half = Math.floor(ranked.length / 2);
const poor = ranked.slice(0, half), rich = ranked.slice(-half);
const mean = (a, k) => a.reduce((s, x) => s + x[k], 0) / Math.max(1, a.length);
console.log('-'.repeat(58));
console.log('  kit per body, poorest half      ' + f(mean(poor, 'kit'), 0) +
            '   crates opened ' + f(mean(poor, 'crates'), 2));
console.log('  kit per body, richest half      ' + f(mean(rich, 'kit'), 0) +
            '   crates opened ' + f(mean(rich, 'crates'), 2));
