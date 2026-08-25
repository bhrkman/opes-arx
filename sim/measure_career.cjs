/* measure_career.cjs — twelve seasons, the armoury and what comes home.
   Identical on any tree, so a before/after compares the game and not two instruments. */
const path = require('path'), fs = require('fs');
const D = __dirname;
const find = n => { for (const c of [path.join(D, n), path.join(D, '..', 'data', n)])
  if (fs.existsSync(c)) return c; throw new Error('cannot find ' + n); };
const P = require(find('prng.js'));
const SEASON = require(find('season.js'));
const oa = JSON.parse(fs.readFileSync(find('oa_profiles.json'), 'utf8')).oa_profiles;

const N = parseInt(process.argv[2] || '12', 10);
const r = SEASON.runCareer(P.mulberry32(P.seedFrom('VC-103')), oa, N, {});
let killed = 0, retired = 0, signed = 0, recovered = 0, destroyed = 0, kept = 0;
for (const s of r.seasons) for (const id in s.corps) {
  const c = s.corps[id];
  killed += c.dead || 0; retired += c.retired || 0; signed += c.signed || 0;
  recovered += c.lootRecovered || 0; destroyed += c.gearLost || 0; kept += c.gearKept || 0;
}
const last = r.seasons[r.seasons.length - 1].corps;
console.log('\n' + N + ' seasons, canon fleet, seed VC-103');
console.log('-'.repeat(58));
console.log('  killed                        ' + killed);
console.log('  retired                       ' + retired);
console.log('  signed                        ' + signed);
console.log('  kit recovered off the dead    ' + recovered);
console.log('  kit lost on the ground        ' + destroyed);
console.log('  kit home via never_drops_gear ' + kept);
console.log('-'.repeat(58));
for (const id in last) console.log('  ' + id.padEnd(22) +
  ' treasury ' + String(Math.round(last[id].treasury)).padStart(9) +
  '  roster ' + String(last[id].roster).padStart(3) +
  '  locker ' + String(last[id].locker != null ? last[id].locker : '-').padStart(4));
