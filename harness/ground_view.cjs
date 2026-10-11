/* §GROUND THE GENERATED GROUND, DRAWN. Generates worlds with sim/ground.js and writes one page in the
   Ground page's grammar: the region overview (mock C), the wall's order, and every region opened with
   its zones, heights, links and sites. A world is read by looking at it; this is where to look.
   `node harness/ground_view.cjs [out.html] [seed...]` */
const fs = require('fs'), path = require('path');
const P = require(path.join(__dirname, '..', 'sim', 'prng.js'));
const G = require(path.join(__dirname, '..', 'sim', 'ground.js'));
const MAP = require(path.join(__dirname, '..', 'sim', 'map.js'));
const out = process.argv[2] || path.join(require('os').tmpdir(), 'ground_preview.html');
const seeds = process.argv.slice(3).length ? process.argv.slice(3) : ['ground-a', 'ground-b', 'ground-c', 'ground-d'];
const archs = Object.keys(MAP.ARCHETYPES);
const worlds = seeds.map((s, i) => G.generate(P.mulberry32(P.seedFrom(s)), { archetype: archs[i % archs.length] }));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TCOL = { open_basin: '#4fd6a0', salt_flats: '#f2d98a', broken_ground: '#c8a86a', ruins: '#b899cc', forest: '#6fb4d8', deep_canopy: '#3d82a6',
               entrenched: '#e0a848', lava_field: '#e0704a', crevasse_field: '#9fb8ff', tidal_marsh: '#7fd4c1' };
const TFILL = k => { const c = TCOL[k] || '#5f7a9c'; return c + '22'; };
const SG = { deposit: ['◆', '#9d7cd8'], rest: ['✚', '#4fd6a0'], strongpoint: ['⬢', '#e0a848'], beacon: ['△', '#f0c04a'], munitions: ['▮', '#c8a86a'], mast: ['◉', '#3ad8e0'] };
const HG = { '-1': '▽', '0': '', '1': '▲', '2': '▲▲' };
function overview(g) {
  const S = 860, pt = (x, y) => [20 + x * S, 20 + y * S];
  let h = `<svg viewBox="0 0 900 900"><circle cx="450" cy="450" r="438" fill="#0d1119" stroke="#1c2c44"/>`;
  const drawn = new Set();
  for (const r of g.regions) for (const l of r.links) { const k = Math.min(r.id, l.to) + '|' + Math.max(r.id, l.to); if (drawn.has(k)) continue; drawn.add(k);
    const a = pt(r.cx, r.cy), b = pt(g.regions[l.to].cx, g.regions[l.to].cy), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    h += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#3a556f" stroke-width="2"/><text x="${m[0]}" y="${m[1] + 3}" fill="#5f7a9c" font-size="8.5" text-anchor="middle" paint-order="stroke" stroke="#0b0f17" stroke-width="3">${l.ticks}t</text>`; }
  for (const r of g.regions) { const c = pt(r.cx, r.cy), t = g.wall.takeAt.find(x => x.region === r.id), last = r.id === g.wall.last;
    const sites = r.zones.map(id => g.zones[id].site).filter(Boolean);
    h += `<g><circle cx="${c[0]}" cy="${c[1]}" r="30" fill="${TFILL(r.terrain)}" stroke="${last ? '#e84393' : TCOL[r.terrain] || '#5f7a9c'}" stroke-width="${last ? 3 : 1.5}"/>`;
    sites.forEach((s, i) => h += `<text x="${c[0] + (i - (sites.length - 1) / 2) * 13}" y="${c[1] - 2}" fill="${SG[s.kind][1]}" font-size="12" text-anchor="middle">${SG[s.kind][0]}</text>`);
    h += `<text x="${c[0]}" y="${c[1] + 13}" fill="#8ea3bd" font-size="8.5" text-anchor="middle">${r.zones.length} · ${r.ticks}t</text>`;
    h += `<text x="${c[0]}" y="${c[1] - 38}" fill="#c4d4e8" font-size="9.5" letter-spacing="1" text-anchor="middle" paint-order="stroke" stroke="#0b0f17" stroke-width="3">${esc(r.name.toUpperCase())}</text>`;
    h += `<text x="${c[0]}" y="${c[1] + 44}" fill="${last ? '#e84393' : '#9d7cd8'}" font-size="8.5" text-anchor="middle">${last ? 'LAST GROUND' : 'GOES D' + t.day}</text></g>`; }
  return h + `</svg>`;
}
function region(g, r) {
  const zs = r.zones.map(id => g.zones[id]);
  const xs = zs.map(z => z.x), ys = zs.map(z => z.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sc = 220 / Math.max(0.02, Math.max(x1 - x0, y1 - y0)), pt = z => [40 + (z.x - x0) * sc + (220 - (x1 - x0) * sc) / 2, 30 + (z.y - y0) * sc + (220 - (y1 - y0) * sc) / 2];
  let h = `<svg viewBox="0 0 300 280">`;
  for (const z of zs) for (const n of z.nb) { if (n < z.id) continue; const a = pt(z), b = pt(g.zones[n]); h += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${TCOL[r.terrain] || '#5f7a9c'}" stroke-width="1.5" opacity=".6"/>`; }
  for (const l of r.links) { const a = pt(g.zones[l.from]), o = g.regions[l.to], ang = Math.atan2(o.cy - r.cy, o.cx - r.cx), e = [a[0] + Math.cos(ang) * 30, a[1] + Math.sin(ang) * 30];
    h += `<line x1="${a[0]}" y1="${a[1]}" x2="${e[0]}" y2="${e[1]}" stroke="#3a556f" stroke-width="2" stroke-dasharray="3 3"/><text x="${e[0] + Math.cos(ang) * 8}" y="${e[1] + Math.sin(ang) * 8 + 3}" fill="#5f7a9c" font-size="7" text-anchor="${Math.cos(ang) > .3 ? 'start' : Math.cos(ang) < -.3 ? 'end' : 'middle'}" paint-order="stroke" stroke="#0b0f17" stroke-width="3">${esc(o.name)} · ${l.ticks}t</text>`; }
  for (const z of zs) { const p = pt(z);
    h += `<circle cx="${p[0]}" cy="${p[1]}" r="14" fill="${TFILL(r.terrain)}" stroke="${TCOL[r.terrain] || '#5f7a9c'}" stroke-width="1.5"/>`;
    if (z.site) h += `<text x="${p[0]}" y="${p[1] + 4}" fill="${SG[z.site.kind][1]}" font-size="12" text-anchor="middle">${SG[z.site.kind][0]}</text>`;
    if (HG[z.height]) h += `<text x="${p[0] + (z.site ? 11 : 0)}" y="${p[1] + (z.site ? -9 : 4)}" fill="#c4d4e8" font-size="${z.site ? 7 : 9}" text-anchor="middle">${HG[z.height]}</text>`;
    if (z.cover) h += `<text x="${p[0] - 11}" y="${p[1] - 9}" fill="#8ea3bd" font-size="7" text-anchor="middle">≡</text>`; }
  return h + `</svg>`;
}
let html = `<!doctype html><html><head><meta charset="utf-8"><title>Generated Grounds</title><style>
body{margin:0;background:#0a0e16;color:#c4d4e8;font:12px/1.5 ui-monospace,Menlo,monospace;padding:16px}
h1{font-size:14px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 4px} .sub{color:#5f7a9c;font-size:11px;margin-bottom:14px}
.world{border-top:1px solid #2a4460;padding-top:16px;margin-top:28px} .world h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#3ad8e0;margin:0 0 2px}
.world .m{color:#5f7a9c;font-size:11px;margin-bottom:10px} .grid{display:grid;grid-template-columns:560px 1fr;gap:16px;align-items:start}
svg{display:block;width:100%;height:auto;background:#0b0f17;border:1px solid #1c2c44;border-radius:6px}
.regs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px} .reg{background:#0d1420;border:1px solid #2a4460;border-radius:6px;padding:6px}
.reg b{font-size:11px} .reg .m{margin:0 0 4px;font-size:10px} .legend{color:#5f7a9c;font-size:10.5px;margin:6px 0 0}
table{border-collapse:collapse;font-size:10.5px;margin-top:8px} td{padding:1px 8px 1px 0;color:#8ea3bd} td.v{color:#c4d4e8}
</style></head><body><h1>Generated Grounds</h1><div class="sub">sim/ground.js · ${worlds.length} worlds · the overview as the Ground page will draw it, the wall's day on each region, and every region opened. ▲ high, ▲▲ commanding, ▽ low, ≡ cover · ◆ deposit ✚ rest ⬢ strongpoint △ beacon ▮ munitions ◉ mast · Nt = ticks (12 a day)</div>`;
for (const g of worlds) {
  const w = Math.max.apply(null, g.zones.map(z => (G.ticksBetween(g, g.regions[g.wall.last].zones[0], z.id) || { ticks: 0 }).ticks));
  html += `<div class="world"><h2>${esc(g.name)} · ${esc(g.archetypeName)}</h2><div class="m">${g.regions.length} regions · ${g.zones.length} zones · ${g.sites.length} sites · farthest zone from the last ground ${w} ticks (${(w / 12).toFixed(1)} days) · wall from day ${g.wall.takeAt[0].day} to ${g.wall.takeAt[g.wall.takeAt.length - 1].day}, last ground ${esc(g.regions[g.wall.last].name)}</div>`;
  html += `<div class="grid"><div>${overview(g)}<table>${g.sites.filter(s => s.kind === 'deposit').map(s => `<tr><td>Day ${s.opens}</td><td class="v">${esc(s.label)} of ${esc(String(s.resource || '').replace(/_/g, ' '))} opens at ${esc(g.regions[g.zones[s.zone].region].name)}</td></tr>`).join('')}</table></div>`;
  html += `<div class="regs">` + g.regions.map(r => `<div class="reg"><b>${esc(r.name)}</b><div class="m">${r.zones.length} zones · ${esc(r.terrainName)} · ${r.ticks} ticks a step · forage ${r.forage} · ${r.id === g.wall.last ? 'the last ground' : 'goes day ' + g.wall.takeAt.find(t => t.region === r.id).day}</div>${region(g, r)}</div>`).join('') + `</div></div></div>`;
}
html += `</body></html>`;
fs.writeFileSync(out, html);
console.log('wrote ' + out + ' · ' + worlds.map(g => g.name + ' (' + g.regions.length + 'r/' + g.zones.length + 'z)').join(', '));
