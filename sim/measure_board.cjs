/* WHAT A CARD ACTUALLY SCORES. The board's verdict cuts were set against a card pool that has
   since lost two demands (losses, surplus) and gained a standing one (popularity). This walks
   whole careers and reports the distribution of card scores, so the words the board uses can be
   set against the scores the game actually produces. `node measure_board.cjs [years]` */
const fs = require('fs');
const P = require('./prng.js'), S = require('./season.js'), R = require('./reputation.js');
const oa = JSON.parse(fs.readFileSync(__dirname + '/../data/oa_profiles.json', 'utf8')).oa_profiles;
const YEARS = +(process.argv[2] || 4), SEEDS = ['bc-1', 'bc-2', 'bc-3'];
const scores = [], bands = {};
for (const sd of SEEDS) {
  const rng = P.mulberry32(P.seedFrom(sd));
  const corps = S.openFleet(rng, oa, {});
  let st = S.beginSeason(rng, corps, oa, {});
  for (let y = 0; y < YEARS; y++) {
    while (st.month <= 11) S.stepMonth(st);
    const out = S.closeSeason(st);
    for (const id of Object.keys(corps)) {
      const c = corps[id];
      if (c._close && c._close.score != null) {
        scores.push(c._close.score.fraction);
        const b = (c._close.board && c._close.board.band) || '?';
        bands[b] = (bands[b] || 0) + 1;
      }
    }
    st = S.beginSeason(rng, corps, oa, {});
    void out;
  }
}
scores.sort((a, b) => a - b);
const q = p => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))];
console.log(JSON.stringify({
  n: scores.length,
  min: +scores[0].toFixed(3), p10: +q(0.10).toFixed(3), p25: +q(0.25).toFixed(3),
  median: +q(0.50).toFixed(3), p75: +q(0.75).toFixed(3), p90: +q(0.90).toFixed(3),
  max: +scores[scores.length - 1].toFixed(3),
  cuts: R.CONST.BOARD_CUTS, bands
}, null, 0));
