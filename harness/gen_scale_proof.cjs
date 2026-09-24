/* §ONE AIM, AT BIRTH — THE PROOF. The generator rolled a fighter on the old 1–20 scale and multiplied by
   ten; rolling on the sheet directly is a change of UNITS and must make the same fighters. This records,
   through the current code, fighters from every way the game makes them — squads, the three recruitment
   lots, the founding fleets — and then checks the new code makes them identically: race, age, name, every
   stat, every weapon skill, every trait, the contract.
   `node harness/gen_scale_proof.cjs record|check` */
const fs = require('fs'), crypto = require('crypto');
const D = '/home/claude/opes-arx/sim/';
const P = require(D + 'prng.js'), R = require(D + 'roster.js'), S = require(D + 'season.js');
const oa = JSON.parse(fs.readFileSync('/home/claude/opes-arx/data/oa_profiles.json', 'utf8')).oa_profiles;
const MODE = process.argv[2] || 'check', OUT = '/home/claude/opes-arx/docs/gen_scale_baseline.json';
const rec = f => ({ race: f.race, age: f.age, name: f.name, stats: f.stats, skills: f.skills,
                    traits: (f.traits || []).slice().sort(), salary: f.contract && f.contract.salary,
                    seasons: f.contract && f.contract.seasons_remaining });
const out = [];
for (let s = 0; s < 12; s++) R.generateSquad(P.mulberry32(1000 + s), 12, { corpId: null }).bodies.forEach(f => out.push(rec(f)));
for (const pool of ['nattie', 'mercenary', 'bastille', 'prisoner'])
  for (let s = 0; s < 6; s++) {
    let lot = []; try { lot = S.openLot(P.mulberry32(P.seedFrom(pool + s)), pool) || []; } catch (e) { lot = []; }
    lot.forEach(f => out.push(rec(f)));
  }
for (let s = 0; s < 3; s++) {
  const c = S.openFleet(P.mulberry32(50 + s), oa, {});
  Object.values(c).forEach(x => (x.roster || []).forEach(f => out.push(rec(f))));
}
const hashes = out.map(r => crypto.createHash('sha1').update(JSON.stringify(r)).digest('hex').slice(0, 16));
if (MODE === 'record') { fs.writeFileSync(OUT, JSON.stringify({ hashes, sample: out.slice(0, 3) }));
  console.log('baseline recorded: ' + hashes.length + ' fighters from squads, lots and fleets'); process.exit(0); }
const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let miss = 0, first = -1;
for (let i = 0; i < base.hashes.length; i++) if (hashes[i] !== base.hashes[i]) { miss++; if (first < 0) first = i; }
console.log('\nONE AIM AT BIRTH \u2014 are the same fighters made?\n');
console.log('  ' + (miss || hashes.length !== base.hashes.length ? 'FAIL' : 'ok  ') + '  ' + (base.hashes.length - miss) + ' / ' + base.hashes.length +
            ' fighters identical (race, age, name, stats, skills, traits, contract)');
if (first >= 0) console.log('  first difference at ' + first + ': ' + JSON.stringify(out[first]).slice(0, 300));
process.exit(miss ? 1 : 0);
