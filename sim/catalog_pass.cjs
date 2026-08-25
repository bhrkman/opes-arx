/* Step 7.5 catalogue pass. Tags now DO things, so they have to be priced for what they do,
   and the weapons that had no identity have to be given one. Every formula cost is
   regenerated afterwards — a hand-edited price fails the suite, which is the point. */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'data', 'items.json');
const doc = JSON.parse(fs.readFileSync(F, 'utf8'));

/* ---- 1. tags repriced for what Step 7.5 made them worth ---------------------------- */
const REPOINT = {
  /* TEMPO. These three were priced as flavour when nothing read them. `burst` doubles a
     weapon's rate of fire and `suppressive` now pins a squad in place, which is the single
     most valuable thing a weapon can do to an enemy that wants to cross ground. */
  burst:         { points: 1.4, effect: 'Fires twice per exchange. Ammunition drains twice as fast.' },
  suppressive:   { points: 1.6, effect: 'Every shot suppresses its target, hit or miss. A suppressed fighter cannot cross ground.' },
  suppressive_2: { points: 2.6, effect: 'Every shot suppresses its target and one neighbour, hit or miss.' },
  /* And the other side of it. A half-rate weapon now BUYS something for the shots it gives
     up — aim, and a bite through armour — so the drawback is no longer close to total. */
  /* `spread` negates a grade of cover at short band, and short band is REACHABLE now that
     closing beats opening. Ignoring the rock somebody is behind, in the band where everybody
     ends up eventually, is worth a great deal more than one point. */
  /* On the grid this is a near-unconditional aim bonus rather than an achievement, and it was
     priced when it was neither reachable nor read. */
  sustained:     { points: 1.4, effect: 'Aim improves while you keep firing at the same person, to a maximum of +2. Switching marks resets it.' },
  spread:        { points: 1.5, effect: 'At short band the target\'s cover counts one grade worse; at long, aim_eff -3.' },
  single_shot:   { points: -0.2, effect: 'Fires every other exchange, and aims far better for it: +1.7 aim and one point of the target\'s protection defeated.' }
};

/* ---- 2. weapons given an identity, or taken off a niche somebody else owned --------- */
const EDITS = {
  /* THE ENABLER. A machine gun that both pins a squad AND kills as hard as a battle rifle is
     simply a battle rifle with a free tag, and eight of them was the best build in the league
     the moment suppression started working. What it produces is pinning; what it does NOT do
     is kill. That is the whole dependency COMPOSITION.md is built on: the machine gun buys
     ground it cannot exploit, so it needs somebody standing next to it who can. */
  itm_machine_gun: { power: 4, identity: 'It does not kill people. It stops them going anywhere, and somebody else kills them.' },

  /* DOMINATED OUTRIGHT. Same power, same band, same family and no tags at all — for 440
     credits more than the Las Surplus. There was no argument for ever buying one. It becomes
     the fast, light energy weapon: it fires twice as often as anything else in its family and
     empties its cell doing it. */
  /* Power stays at 4: a primary weaker than the strongest sidearm inverts the whole fallback
     rule, and squads start venting on purpose to get at the pistol. */
  itm_pulse_carbine: { power: 4, tags: ['burst', 'heavy_draw'],
                       identity: 'Empties a cell in a hurry. Ask the quartermaster how she feels about it.' },

  /* THE DELIBERATE RIFLE WITH NO RATE. Marked as the marksman's weapon and carrying no tag of
     any kind, so under tempo it fired as fast as a carbine while out-ranging it. It is now
     what its name says: slow, accurate, and it beats plate. */
  itm_marksman_rifle: { tags: ['single_shot'],
                        identity: 'One shot, carefully. It finds the gap in the plate, which is what you paid for.' },

  /* And it must not simply be a dearer Hunting Rifle. The Hunting Rifle drops back to being
     what a hunting rifle is: cheap, long, and not very powerful. */
  itm_hunting_rifle: { power: 4, identity: 'A civilian gun that reaches. Everything else about it is a compromise.' },

  /* THE SAME FAULT AS THE MACHINE GUN, ONE SHELF OVER. The Drum Shotgun carried `spread` AND
     `suppressive`, so it pinned a squad in place and then killed it — and since a pinned squad
     cannot back away and backing away under fire is hard anyway, a shotgun line that reached
     short band could not be escaped. It went 5-1 and its worst matchup was a draw. A weapon
     should not both buy the ground and cash it in. Spread is what a shotgun is; the pinning
     belongs to whoever is carrying the machine gun beside it. */
  /* Its power came down to 5 while `spread` was still ignoring cover at every range, which
     left it strictly worse than the cheaper Ninefold Scattergun and a lower tier than it too —
     fixing a symptom by breaking an item. With spread reading the engagement band properly it
     gets its identity from the drum instead of from raw power: it is the FAST shotgun, and it
     eats ammunition at a rate the quartermaster will mention. */
  /* Power went 7 -> 5 to fight a symptom while `spread` was ignoring cover at every range and
     while nothing on the grid ever closed. Both are fixed, so the compensation comes off: a
     weapon nerfed to offset a bug stays broken once the bug is gone. */
  /* THE GENERALIST WITH SPECIALIST POWER. Full power at the band every fight drifts into,
     the best remaining tag, and nothing paid for either: 11-0 in the league. Every other
     weapon carrying power six pays for it — the Marksman Rifle in rate of fire, the Drum
     Shotgun in being useless at any range you would call polite. A battle rifle is a heavy
     full-power weapon, so it pays in the currency the grid made real: it is slow to move
     with, and on ground where repositioning decides the fight that is a genuine cost rather
     than a number on a sheet. `mob_down` was one of the eleven tags wired this step and had
     never been carried by anything. */
  itm_battle_rifle: { tags: ['sustained', 'mob_down'],
                      identity: 'Full power, full weight. You will feel every metre you carry it.' },

  itm_drum_shotgun: { power: 7, tags: ['spread', 'burst'],
                      identity: 'Fed from a drum, and it empties like one. Someone else has to pin them first.' }
};

/* ---- 2b. THE BAND LADDER: reach flexibility has a price ------------------------------
 *
 * Measured on the grid, the three medium-band rifles took the top three places in the league —
 * battle rifle 11-0, bullpup 8-3, carbine 7-4 — and a balanced squad came fourth. That is not
 * a Pattern Carbine problem, which is what it looked like from one row of the table; it is a
 * category problem, and nerfing the carbine would simply have handed its record to the
 * Bullpup. Fights settle toward medium, so a medium weapon is in its element roughly half the
 * time no matter what anybody does, while a specialist is in its element only when it wins the
 * argument about range.
 *
 * **A generalist should be ok all the time. A specialist should be good sometimes and bad
 * sometimes.** So the specialists are paid for the half of the fight they spend useless,
 * rather than the generalists being punished for turning up: raising the ends of the shelf
 * keeps the Machine Gun where it belongs — an enabler that kills almost nobody — instead of
 * gutting it along with everything else in the middle.
 *
 * Applied as a RULE over the catalog rather than as a list of hand-edits, so it stays true of
 * anything added later and cannot quietly apply to some weapons and not others. */
/* MEASURED AND REJECTED: +1 power to every specialist moved the league by 0.008 for the
   Marksman Rifle and left the medium rifles in the top three places. It is the tempo lesson
   again — a weapon that spends half the fight at an aim penalty cannot be paid back in
   severity, because missing is not something damage fixes. The compensation belongs in
   ACCURACY, and it belongs in the resolver as a property of specialisation rather than in the
   catalog as a power number on nineteen items. See `BAND_SPECIALIST_BONUS` in combat.js. */
const SPECIALIST_POWER = 0;
function applyBandLadder(doc, changed) {
  for (const it of doc.items) {
    if (it.slot !== 'primary') continue;
    const r = (it.effects || {}).range;
    if (r !== 'long' && r !== 'short') continue;
    it.effects.power += SPECIALIST_POWER;
    changed.push('  ladder ' + it.id.replace('itm_', '') + ' (' + r + ') power +' + SPECIALIST_POWER);
  }
}

let changed = [];
for (const q of doc.quirks) {
  if (REPOINT[q.id]) {
    changed.push('tag ' + q.id + ' ' + q.points + ' \u2192 ' + REPOINT[q.id].points);
    q.points = REPOINT[q.id].points;
    if (REPOINT[q.id].effect) q.effect = REPOINT[q.id].effect;
  }
}
for (const it of doc.items) {
  const e = EDITS[it.id];
  if (!e) continue;
  if (e.power != null) { changed.push(it.id + ' power ' + it.effects.power + ' \u2192 ' + e.power); it.effects.power = e.power; }
  if (e.tags) { changed.push(it.id + ' tags [' + it.effects.tags + '] \u2192 [' + e.tags + ']'); it.effects.tags = e.tags; }
  if (e.identity) it.identity = e.identity;
}

applyBandLadder(doc, changed);

/* ---- 3. regenerate every formula price ---------------------------------------------- */
fs.writeFileSync(F, JSON.stringify(doc, null, 1) + '\n');
delete require.cache[require.resolve('../data/items.json')];
const ITEMS = require('./items.js');
const doc2 = JSON.parse(fs.readFileSync(F, 'utf8'));
const moved = [];
for (const it of doc2.items) {
  if (it.price_model !== 'formula') continue;
  const want = ITEMS.formulaCost(it);
  if (want !== it.cost) { moved.push(it.id.replace('itm_', '') + ' ' + it.cost + '\u2192' + want); it.cost = want; }
}
fs.writeFileSync(F, JSON.stringify(doc2, null, 1) + '\n');

console.log('EDITS:'); changed.forEach(c => console.log('  ' + c));
console.log('\nPRICES REGENERATED (' + moved.length + '):');
moved.forEach(m => console.log('  ' + m));
