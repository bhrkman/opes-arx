/* Does turning the detailed record ON change the fight? It must not — if it does, every
   number the fog probe reports is measured on a different game from the one that ships.
   Same seeds, same squads, logging off then on, outcomes compared exactly. */
const P = require('./prng.js'), TAC = require('./tactical.js'), C = require('./combat.js'),
      ROSTER = require('./roster.js'), ITEMS = require('./items.js');
ROSTER.autoInit();
ITEMS.autoInit ? ITEMS.autoInit() : ITEMS.init(require('../data/items.json'));

function side(seed, tag, n) {
  const b = ROSTER.generateSquad(P.mulberry32(P.seedFrom(seed)), n, { corpId: tag }).bodies;
  ITEMS.equipForce(b, ITEMS.DEFAULT_LOADOUT);
  return { tag, corpId: tag, policy: 'standard', policyName: 'standard', hasMedkit: true,
           units: b.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById, day: 1 })) };
}
function run(seed, logOff) {
  const res = TAC.resolve(P.mulberry32(P.seedFrom(seed)),
    side(seed + 'a', 'A', 6), side(seed + 'b', 'B', 6),
    { terrain: 'broken_ground', openingBand: 1, prep: [0.5, 0.5], log: logOff ? false : undefined });
  const t = res.telemetry;
  return JSON.stringify([res.result, res.turns, t.shots, t.hits, t.dead, t.down, t.moves,
                         t.dashes, t.overwatchShots, res.casualties]);
}
let same = 0, differ = 0;
for (let i = 0; i < 120; i++) {
  if (run('logchk' + i, true) === run('logchk' + i, false)) same++; else differ++;
}
console.log('logging off vs on, 120 identical fights');
console.log('  identical outcomes: ' + same + '   differing: ' + differ);
console.log('  -> ' + (differ === 0
  ? 'the record is inert. Measuring with it on measures the shipping game.'
  : 'THE RECORD CHANGES THE FIGHT. Every number taken with it on is suspect.'));
