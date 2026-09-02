/* Derives one DISPLAY colour per OA from the identity canon in data/oa_profiles.json,
 * and proves the set separable before any UI reads it.
 *
 *   node palette_oa.cjs            report + write data/oa_display.json
 *   node palette_oa.cjs --check    verify the written table still stands (no write)
 *
 * THE RULE, as agreed at the colour pass: the canon pair is the source of truth. An OA
 * shows its PRIMARY unless the measurements refuse it; then its SECONDARY; only then a
 * NUDGED variant of whichever was closer to passing, and the nudge is recorded here and
 * in the derived table. Nothing in oa_profiles.json is touched — canon stays canon.
 *
 * WHAT MUST STAY APART (CIE76 delta-E in Lab, D65):
 *   HARD >= 12 — identity against identity, and identity against everything it shares a
 *     canvas with: the other OA display colours, the nine race body fills, the fight
 *     ground and the page grounds. The grid audit's race palette used the same bar.
 *   MEDIUM >= 10 — the interface's semantic voices: command cyan (--a), the old side
 *     blue (--b), danger magenta, good green, warn amber, red. An OA that dresses like
 *     "danger" makes every danger mark ambiguous.
 *   VISIBILITY: L* >= 30, so no house disappears into the night-ops ground. This is the
 *     bar that turns dark navy secondaries away.
 *   SOFT — stat hues and chrome are reported (closest pair) but do not block: they live
 *     in bars and borders, a different shape in a different place.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const D = __dirname + '/';

/* ---------------------------------------------------------------- colour math ---- */
function hexRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) throw new Error('bad hex: ' + h);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbHex(r, g, b) {
  const c = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function srgbLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function labOf(hex) {
  const [r, g, b] = hexRgb(hex).map(srgbLin);
  /* sRGB D65 */
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function dE(h1, h2) {
  const a = labOf(h1), b = labOf(h2);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
/* small HSL moves for the nudge search */
function rgbHsl(hex) {
  let [r, g, b] = hexRgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
                  : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/* ------------------------------------------------- the fixed world it must fit ---- */
const RACE = { olmac: '#6f6f69', svalbard: '#566b7a', etu: '#6e8560', attorak: '#8f7256',
               human: '#bcae96', kellis: '#a291b5', thythyn: '#8fabab', gil: '#c98a80',
               mon_wa: '#dce8f8' };
const GROUND = { fight_field: '#171410', ground_map: '#100e0c', page: '#0a0e16', panel: '#0d1420' };
const SEMANTIC = { command_cyan: '#3ad8e0', side_blue: '#6f9bc4', danger_magenta: '#e84393',
                   good_green: '#4fd6a0', warn_amber: '#e0a848', red: '#e05a5a' };
const SOFT = { s_aim: '#b5484a', s_grit: '#b8862c', s_reflex: '#3f9e6b', s_fieldcraft: '#3d82a6',
               s_tactics: '#7d5cc2', s_presence: '#b04e8e', s_resolve: '#4f8a8a',
               s_health: '#a33e3e', ink: '#c4d4e8', line: '#1c2c44', terrain_wash: '#c8a45c' };
const HARD_MIN = 12, MED_MIN = 10, L_MIN = 30;

function judge(hex, chosen) {
  const fail = [];
  const L = labOf(hex)[0];
  if (L < L_MIN) fail.push('too dark for the ground (L* ' + L.toFixed(1) + ' < ' + L_MIN + ')');
  for (const [id, c] of chosen) { const d = dE(hex, c);
    if (d < HARD_MIN) fail.push('vs OA ' + id + ' \u0394' + d.toFixed(1)); }
  for (const [id, c] of Object.entries(RACE)) { const d = dE(hex, c);
    if (d < HARD_MIN) fail.push('vs race ' + id + ' \u0394' + d.toFixed(1)); }
  for (const [id, c] of Object.entries(GROUND)) { const d = dE(hex, c);
    if (d < HARD_MIN) fail.push('vs ground ' + id + ' \u0394' + d.toFixed(1)); }
  for (const [id, c] of Object.entries(SEMANTIC)) { const d = dE(hex, c);
    if (d < MED_MIN) fail.push('vs ui ' + id + ' \u0394' + d.toFixed(1)); }
  return fail;
}
function closestReport(hex) {
  let best = null;
  const pools = [['race', RACE], ['ui', SEMANTIC], ['soft', SOFT]];
  for (const [tag, pool] of pools)
    for (const [id, c] of Object.entries(pool)) {
      const d = dE(hex, c);
      if (!best || d < best.d) best = { d, name: tag + ':' + id };
    }
  return best.name + ' \u0394' + best.d.toFixed(1);
}
/* the smallest recorded move that passes: walk out from the base in growing rings */
function nudge(baseHex, chosen) {
  const [h0, s0, l0] = rgbHsl(baseHex);
  let best = null;
  for (let dh = -60; dh <= 60; dh += 5)
    for (let dl = -0.20; dl <= 0.28; dl += 0.02)
      for (let ds = -0.15; ds <= 0.15; ds += 0.05) {
        const cand = hslHex(h0 + dh, s0 + ds, l0 + dl);
        if (judge(cand, chosen).length) continue;
        const cost = dE(cand, baseHex);
        if (!best || cost < best.cost) best = { hex: cand, cost };
      }
  return best;
}

/* --------------------------------------------------------------------- derive ---- */
const prof = JSON.parse(fs.readFileSync(D + '../data/oa_profiles.json', 'utf8'));
const oas = prof[Object.keys(prof).filter(k => Array.isArray(prof[k]))[0]];
const chosen = [];   /* [id, hex] in canon order — earlier houses keep their claim */
const table = {};
console.log('OA DISPLAY COLOURS \u00b7 derived from canon, ' + oas.length + ' houses');
console.log('----------------------------------------------------------------------');
for (const oa of oas) {
  const prim = oa.colors.primary, sec = oa.colors.secondary;
  let pick = null, source = null, note = '';
  const pf = judge(prim, chosen);
  if (!pf.length) { pick = prim; source = 'primary'; }
  else {
    const sf = judge(sec, chosen);
    if (!sf.length) { pick = sec; source = 'secondary'; note = 'primary refused: ' + pf.join('; '); }
    else {
      /* nudge whichever canon colour was closer to passing */
      const base = pf.length <= sf.length ? prim : sec;
      const from = base === prim ? 'primary' : 'secondary';
      const n = nudge(base, chosen);
      if (!n) throw new Error(oa.id + ': no passing colour within reach of canon');
      pick = n.hex; source = 'nudged ' + from;
      note = from + ' ' + base + ' refused: ' + (base === prim ? pf : judge(sec, chosen)).join('; ')
           + ' \u00b7 moved \u0394' + n.cost.toFixed(1);
    }
  }
  chosen.push([oa.id, pick]);
  table[oa.id] = { color: pick, source, closest: closestReport(pick) };
  if (note) table[oa.id].note = note;
  console.log('  ' + oa.id.padEnd(20) + pick + '  ' + source.padEnd(18)
    + 'closest: ' + table[oa.id].closest + (note ? '\n' + ' '.repeat(30) + note : ''));
}
/* the set, proven as a whole */
let worst = null;
for (let i = 0; i < chosen.length; i++)
  for (let j = i + 1; j < chosen.length; j++) {
    const d = dE(chosen[i][1], chosen[j][1]);
    if (!worst || d < worst.d) worst = { d, pair: chosen[i][0] + ' / ' + chosen[j][0] };
  }
console.log('----------------------------------------------------------------------');
console.log('  closest pair of houses: ' + worst.pair + ' \u0394' + worst.d.toFixed(1)
  + '  (bar ' + HARD_MIN + ')');

/* FOUNDER CHOICES — the founded house picks its colour from swatches that already pass
 * every bar against the eight houses, the races, the grounds and the interface. Chosen
 * greedily for spread, so the row reads as a range and not eight cousins. */
const cands = [];
for (let h = 0; h < 360; h += 12)
  for (const [s, l] of [[0.55, 0.52], [0.45, 0.62], [0.62, 0.42], [0.30, 0.66]]) {
    const hex = hslHex(h, s, l);
    if (!judge(hex, chosen).length) cands.push(hex);
  }
const founder = [];
while (founder.length < 12 && cands.length) {
  let best = null;
  for (const c of cands) {
    const dMin = Math.min(...founder.map(f => dE(c, f)), Infinity);
    if (!best || dMin > best.dMin) best = { c, dMin };
  }
  if (founder.length && best.dMin < HARD_MIN) break;   /* the row itself stays separable */
  founder.push(best.c);
  cands.splice(cands.indexOf(best.c), 1);
}
console.log('  founder swatches: ' + founder.length + ' \u00b7 ' + founder.join(' '));

const outPath = path.resolve(D + '../data/oa_display.json');
const payload = { file: 'oa_display.json', derivedFrom: 'oa_profiles.json',
  rule: 'primary unless refused, then secondary, then recorded nudge; bars \u0394E hard 12 / ui 10 / L* 30',
  founderChoices: founder,
  closestPair: worst.pair + ' \u0394' + worst.d.toFixed(1),
  colors: table };
if (process.argv.includes('--check')) {
  const cur = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const same = JSON.stringify(cur.colors) === JSON.stringify(table);
  console.log(same ? '  written table stands' : '  \u2717 written table DRIFTS from what canon derives');
  process.exit(same ? 0 : 1);
} else {
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log('  written \u2192 data/oa_display.json');
}
