/* COMPOSITION.md §11 — the league. Real catalog weapons, matched rosters generated from
   identical seeds so bodies are paired man-for-man, and the ONLY variable is what they carry.
   Reports net casualty advantage per fight and cost, so W-T1..W-T4 can be read directly. */
const P = require('./prng.js');
const C = require('./combat.js');
const T = require('./tactical.js');
const ITEMS = require('./items.js');
const ROSTER = require('./roster.js');

const GROUNDS = ['open_basin', 'broken_ground', 'ruins', 'forest', 'entrenched'];

const BUILDS = {
  'all carbine':      { primary: 'itm_carbine',        armor: 'itm_plate_carrier' },
  'all marksman':     { primary: 'itm_marksman_rifle', armor: 'itm_plate_carrier' },
  'all machine gun':  { primary: 'itm_machine_gun',    armor: 'itm_plate_carrier' },
  'all shotgun':      { primary: 'itm_drum_shotgun',   armor: 'itm_plate_carrier' },
  'all hunting rifle':{ primary: 'itm_hunting_rifle',  armor: 'itm_plate_carrier' },
  'all autogun':      { primary: 'itm_riot_autogun',   armor: 'itm_plate_carrier' },
  /* Two more mediums, to answer whether the Pattern Carbine is the outlier or whether
     medium-band weapons generally are. Nerfing the carbine and watching the Bullpup inherit
     its record would be treating the symptom for the third time this step. */
  'all bullpup':      { primary: 'itm_bullpup',        armor: 'itm_plate_carrier' },
  'all battle rifle': { primary: 'itm_battle_rifle',   armor: 'itm_plate_carrier' },
  'one of each':      { mix: ['itm_machine_gun', 'itm_carbine', 'itm_carbine', 'itm_drum_shotgun',
                              'itm_marksman_rifle', 'itm_carbine', 'itm_bullpup', 'itm_battle_rifle'],
                        armor: 'itm_plate_carrier' },
  /* The middle ground a mono test cannot see. A stack of one weapon measures overtuning; it
     does NOT measure whether a weapon designed to support somebody has somebody to support.
     A machine gun alone is meant to look mediocre — that is what an enabler is. */
  'pin and push':     { mix: ['itm_machine_gun', 'itm_machine_gun', 'itm_drum_shotgun', 'itm_drum_shotgun',
                              'itm_drum_shotgun', 'itm_carbine', 'itm_carbine', 'itm_machine_gun'],
                        armor: 'itm_plate_carrier' },
  'pin and pick':     { mix: ['itm_machine_gun', 'itm_machine_gun', 'itm_machine_gun', 'itm_marksman_rifle',
                              'itm_marksman_rifle', 'itm_marksman_rifle', 'itm_carbine', 'itm_carbine'],
                        armor: 'itm_plate_carrier' },
  'thirds':           { mix: ['itm_drum_shotgun', 'itm_drum_shotgun', 'itm_drum_shotgun',
                              'itm_marksman_rifle', 'itm_marksman_rifle', 'itm_marksman_rifle',
                              'itm_machine_gun', 'itm_machine_gun'],
                        armor: 'itm_plate_carrier' }
};

function itemById(id) { return ITEMS.catalog.find(i => i.id === id); }

function cost(build) {
  const ids = build.mix || new Array(8).fill(build.primary);
  return ids.reduce((s, id) => s + (itemById(id).cost || 0), 0);
}

function makeSquad(seed, build) {
  const bodies = ROSTER.generateSquad(P.mulberry32(P.seedFrom(seed)), 8, { corpId: 'alliance_house' }).bodies;
  const ids = build.mix || new Array(8).fill(build.primary);
  bodies.forEach((b, i) => {
    ITEMS.equip(b, { primary: ids[i % ids.length], armor: build.armor,
                     sidearm: 'itm_service_pistol', consumables: [] });
  });
  let cap = bodies[0];
  for (const b of bodies) if (b.stats.tactics > cap.stats.tactics) cap = b;
  return bodies.map(f => C.makeCombatant(f, { traitIndex: ROSTER.traitById,
                                              isCaptain: f.id === cap.id, day: 12 }));
}

/* Every matchup is run BOTH WAYS and averaged. The first version of this probe gave the
   first-named build one roster and the second another, and two randomly generated rosters are
   not equal — so every result carried a fixed bias by table position, which is how the
   Marksman Rifle came to read as losing to a strictly worse gun. Measured symmetrically it
   beats it from both sides. A league table that depends on the order of its own rows is
   measuring itself. */
/* PREPARENESS PAIRS, from the day loop rather than invented. Measured over a real Divide:
   prep runs 0.20-0.95 with a median of 0.73, the median gap between two sides is 0.22, and
   36% of engagements are lopsided enough to count as an ambush. A bench that runs both sides
   at 0.5 is testing a condition the game essentially never produces — and preparedness is
   worth up to 0.39 casualties a fight, which is larger than most of the weapon differences
   being measured against it. The pair swaps with the build so the mirrored run stays a mirror. */
const PREP_PAIRS = [[0.73, 0.73], [0.87, 0.48], [0.48, 0.87], [0.73, 0.51],
                    [0.95, 0.45], [0.45, 0.95], [0.60, 0.60]];

function half(nameA, nameB, trials, swap) {
  let casA = 0, casB = 0, n = 0;
  for (let t = 0; t < trials; t++) {
    for (const g of GROUNDS) {
      const pp = PREP_PAIRS[(t + GROUNDS.indexOf(g)) % PREP_PAIRS.length];
      const A = makeSquad(SEED + t + (swap ? 'b' : 'a'), BUILDS[nameA]);
      const B = makeSquad(SEED + t + (swap ? 'a' : 'b'), BUILDS[nameB]);
      const rng = P.mulberry32(P.seedFrom('fight' + t + g));
      /* THE GRID. This called the abstract band model, which is not the engagement model and
         has not been since the E10 ruling — so every league table this probe has ever printed
         was a measurement of a resolver the game does not run. */
      const r = T.resolve(rng,
        { tag: 'A', corpId: 'A', units: A, policy: 'standard', policyName: 'standard', hasMedkit: true },
        { tag: 'B', corpId: 'B', units: B, policy: 'standard', policyName: 'standard', hasMedkit: true },
        /* opening band varied the way the day loop varies it, rather than pinned to medium:
           where contact is made is a property of the planet, and pinning it silently decides
           which half of the catalog is allowed to be useful */
        { terrain: g, openingBand: (t + GROUNDS.indexOf(g)) % 3,
          prep: swap ? [pp[1], pp[0]] : [pp[0], pp[1]], log: false });
      /* the grid tallies counts, not arrays, and a permanent loss is dead-or-still-down */
      const count = x => (x.dead || 0) + (x.down || 0);
      casA += count(r.casualties.A); casB += count(r.casualties.B); n++;
    }
  }
  return (casB - casA) / n;
}

function duel(nameA, nameB, trials) {
  /* swapping sides flips the sign, so subtract */
  return { net: (half(nameA, nameB, trials, false) - half(nameB, nameA, trials, true)) / 2 };
}

/* CORE mode: six builds instead of twelve, so the same wall-clock budget buys four times the
   trials per matchup. The twelve-build table at five trials was measured against two
   independent fighter populations and produced nearly OPPOSITE orderings — the Pattern
   Carbine came first in one and last in the other, "thirds" went 2-9 and then 11-0. At those
   sample sizes the table is noise wearing a ranking, and any tuning decision taken from it is
   a decision about which fighters happened to be generated. Power before precision. */
const CORE = ['one of each', 'thirds', 'all carbine', 'all marksman', 'all shotgun', 'all machine gun'];
const names = process.argv[4] === 'core' ? CORE : Object.keys(BUILDS);
const trials = parseInt(process.argv[2] || '30', 10);
/* A different body-seed base draws a different population of fighters. Running the league
   twice under two bases and comparing is the only way to tell a real weapon difference from
   the luck of who happened to be carrying it — and a 16-fight cell was already caught
   producing a reversal that vanished at 200. */
const SEED = process.argv[3] || 'body';
const table = {};
for (const a of names) table[a] = { net: 0, worst: 99, wl: [0, 0], vs: {} };

for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const r = duel(names[i], names[j], trials);
    table[names[i]].vs[names[j]] = r.net;
    table[names[j]].vs[names[i]] = -r.net;
    table[names[i]].net += r.net; table[names[j]].net -= r.net;
    table[names[i]].worst = Math.min(table[names[i]].worst, r.net);
    table[names[j]].worst = Math.min(table[names[j]].worst, -r.net);
    if (r.net > 0) { table[names[i]].wl[0]++; table[names[j]].wl[1]++; }
    else { table[names[j]].wl[0]++; table[names[i]].wl[1]++; }
  }
}

console.log('build              cost   avg net   worst matchup   W-L   net/1000cr' +
            '   [' + trials * GROUNDS.length * 2 + ' fights per matchup]');
const rows = names.map(n => ({ n, c: cost(BUILDS[n]), net: table[n].net / (names.length - 1),
                               worst: table[n].worst, wl: table[n].wl }));
rows.sort((a, b) => b.net - a.net);
for (const r of rows)
  console.log(r.n.padEnd(18) + String(r.c).padStart(6) + '   ' +
              (r.net >= 0 ? '+' : '') + r.net.toFixed(3) + '      ' +
              (r.worst >= 0 ? '+' : '') + r.worst.toFixed(3) + '        ' +
              r.wl[0] + '-' + r.wl[1] + '     ' + (r.net / r.c * 1000).toFixed(3));
