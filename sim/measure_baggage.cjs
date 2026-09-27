/* §SEATS WHAT THE EIGHT CARRY THAT A FOUNDED OA DOES NOT. Every manager who joins founds his own OA, so a full table
   is eight founded OAs — and the fleet's results were measured with the canon eight, who carry more than their
   temperament. This plays the fleet four ways, every seat run by the engine, the fleet list ROTATED each career so no
   OA keeps a list position, and reads the results by temperament:
     blank     eight identical founded OAs (the Human Player start)            — what luck and the snowball do alone
     tempered  founded OAs, each given one canon OA's temperament only         — dials, lean, rigidity, negotiation
     funded    tempered, plus that OA's difficulty and finance (its grant, cash and founding roster)
     canon     the eight themselves                                            — the rest: reputation, relationships,
                                                                                  doctrine, holds, race weights
   `node sim/measure_baggage.cjs ARM FROM TO [SEASONS]` prints JSON by temperament (by list position for blank). */
const path = require('path'), fs = require('fs');
const D = __dirname + '/';
const P = require(D + 'prng.js'), S = require(D + 'season.js');
const oa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;
/* divide.js DEFAULT_RIGIDITY, read by id there; a founded OA carries it on its profile */
const RIG = { nevlon_collective: 100, violets_enterprise: 95, knights_star: 80, new_line: 70, verdant_cradle: 55, mercy_concern: 40, alliance_house: 20, vantis_deepcore: 10 };
const [arm, a, b, NS] = [process.argv[2] || 'tempered', +(process.argv[3] || 0), +(process.argv[4] || 8), +(process.argv[5] || 4)];
const T = {};
for (let s = a; s < b; s++) {
  let profiles = arm === 'canon' ? oa.map(o => Object.assign({}, o, { _like: o.id })) : oa.map((o, i) => {
    const f = S.founderProfile(oa, 'Founder ' + (i + 1), 'founder_' + (i + 1));
    if (arm !== 'blank') {
      f.dials = JSON.parse(JSON.stringify(o.dials));
      f.engagement_lean = o.id === 'alliance_house' ? 'unyielding' : o.engagement_lean;   /* divide.js STANCE_OVERRIDE */
      f.no_negotiation = !!o.no_negotiation; f.rigidity = RIG[o.id];
    }
    if (arm === 'funded') { f.difficulty = o.difficulty; f.finance = JSON.parse(JSON.stringify(o.finance)); delete f.founding; }
    f._like = arm === 'blank' ? null : o.id;
    return f;
  });
  const k = s % 8; profiles = profiles.slice(k).concat(profiles.slice(0, k));
  const rng = P.mulberry32(P.seedFrom('baggage' + s)); const c = S.openFleet(rng, profiles, {});
  for (let n = 0; n < NS; n++) {
    const rec = S.runSeason(rng, c, profiles, {});
    profiles.forEach((p, i) => { const v = rec.corps[p.id], key = p._like || ('position_' + (i + 1));
      const e = (T[key] = T[key] || { wins: 0, place: 0, n: 0, dead: 0, drop: 0, treasury: 0 });
      e.wins += v.won ? 1 : 0; e.place += v.placement || 9; e.n++; e.dead += v.dead || 0; e.drop += v.dropped || 0; e.treasury += v.treasury || 0; });
  }
}
console.log(JSON.stringify({ arm, careers: b - a, seasons: NS, by: T }));
