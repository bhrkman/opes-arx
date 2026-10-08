/* Capital Divide — /sim/ground.js
 *
 * THE GROUND AS REGIONS AND ZONES (ruled). A planet is a relief cut into regions of twelve to
 * twenty-four zones. A zone is where a squad stands: one squad holds it, it has a height, cover and
 * hiding, and may carry one site. A region is the unit of character and of the wall: it has
 * one terrain and one pace, its zones are linked to their neighbours, and routes join it to
 * the regions beside it at a cost in ticks. Nothing is impassable: where the relief forbids a
 * route there is no route, and every region is reachable from every other, which this file
 * checks before it hands the ground over.
 *
 * The wall takes whole regions, outermost first from a chosen last ground, on an order drawn
 * with the world and announced a window ahead, paced so the last region stands at month's end.
 * Windows fall every other day from the drop and daily once few regions stand.
 *
 * Pure logic: no DOM, no Math.random, no I/O. One rng in, one ground out; the same seed is the
 * same ground on every machine. map.js lends its archetypes, terrains, names and composition.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./prng.js") : global.CDPRNG;
  const MAP = isNode ? require("./map.js") : global.CDMAP;

  const CONST = {
    DAYS: 28,                       // [C] a month: the wall is timed to it whatever the contest does
    WINDOW_EVERY: 2,                // [C] a comms window every other day from the drop
    DAILY_WHEN_LEFT: 3,             // [C] and every day once this few regions stand
    REGIONS: [10, 18],              // [C] a planet's region count, before the archetype leans on it
    ZONES_PER_REGION: [12, 24],     // [C] ruled: a region is a space with room in it, not a handful of posts
    ZONES_TARGET: 17,               // [C] the mean the generator aims at; a region's area decides its share
    /* [C] a step between zones is shorter now there are more of them: a region takes as long to cross as it did when it
       held five, so a step costs the terrain's going scaled by how much nearer its zones stand */
    STEP_SCALE_FROM: 5.4,
    REGION_MIN_GAP: 0.055,          // [C] seeds no nearer than this, as a share of the disc
    SAMPLE: 96,                     // [C] the relief is read on this grid when regions are cut (fine enough to be drawn as land)
    ZONE_LINKS: 3,                  // [C] each zone links to this many nearest in its region, then the region is joined up
    ROUTE_UNIT: 0.06,               // [C] one route-length of this many disc units costs one step's ticks
    ROUTE_WATER_MULT: 2.0,          // [C] a route that crosses water is the long way round
    ROUTE_WATER_CUT: 0.6,           // [C] a route more than this share water does not exist, unless nothing else joins the region
    HEIGHT_LEVELS: [-1, 0, 1, 2],   // [C] a zone's height against its region: low, flat, high, commanding
    SITES: { beacon: 5, rest: 3, strongpoint: 2, munitions: 2, mast: 2 },   // [C] and deposits from the composition
    DEPOSITS: [4, 6],               // [C]
    SITES_PER_REGION: 3,            // [C] at most
    DEPOSIT_OPENS: [2, 16],         // [C] the first and last day a deposit opens
    DEPOSIT_WINDOW: 4,              // [C] days a deposit stands open before its region goes: the planner leaves two days ahead, and a seam takes a day to reach and work
    LAST_GROUND_PICK: 1             // [C] the last ground is the region nearest the centre: the wall closes on the middle
  };
  /* ticks a step costs, by the terrain's going: open ground two, marsh five */
  const TICKS = { open_basin: 2, salt_flats: 2, broken_ground: 3, ruins: 3, forest: 4, deep_canopy: 4, entrenched: 4,
                  lava_field: 5, crevasse_field: 5, tidal_marsh: 5 };
  const COVER = { forest: 1, deep_canopy: 1, entrenched: 1, ruins: 1, broken_ground: 0.5, lava_field: 0.5, crevasse_field: 0.5,
                  open_basin: 0, salt_flats: 0, tidal_marsh: 0 };

  const CX = 0.5, CY = 0.5, R = 0.5;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  function generate(rng, opts) {
    opts = opts || {};
    const keys = Object.keys(MAP.ARCHETYPES);
    const archKey = opts.archetype && MAP.ARCHETYPES[opts.archetype] ? opts.archetype : P.pick(rng, keys);
    const arch = MAP.ARCHETYPES[archKey];
    const used = new Set();
    const name = opts.name || placeName(rng, arch, used);

    /* ---- the relief: hills on a swell, as map.js makes it, read as height 0..1 ---- */
    const hills = [];
    const nHill = P.int(rng, 5, 11);
    for (let i = 0; i < nHill; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.95;
      hills.push({ x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, r: R * (0.12 + rng() * 0.22), h: 0.25 + rng() * 0.5 });
    }
    const swell = { fx: 9 + rng() * 6, fy: 9 + rng() * 6, px: rng() * Math.PI * 2, py: rng() * Math.PI * 2 };
    const heightAt = (x, y) => {
      let h = 0.32 + 0.12 * 0.5 * (Math.sin(x * swell.fx + swell.px) + Math.cos(y * swell.fy + swell.py));
      const dc = dist(x, y, CX, CY) / R; h += 0.08 * Math.max(0, 1 - dc * dc);
      let dome = 0;
      for (const k of hills) { const q = ((x - k.x) ** 2 + (y - k.y) ** 2) / (k.r * k.r); if (q < 1) dome = Math.max(dome, k.h * (1 - q) * (1 - q)); }
      return Math.max(0, Math.min(1, h + dome));
    };
    const seaLevel = arch.seaLevel || 0;
    const waterAt = (x, y) => seaLevel > 0 && heightAt(x, y) < seaLevel;
    const onDisc = (x, y) => dist(x, y, CX, CY) <= R;

    /* ---- the land, sampled ---- */
    const N = CONST.SAMPLE, cells = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = (i + 0.5) / N, y = (j + 0.5) / N;
      if (!onDisc(x, y)) continue;
      cells.push({ x, y, h: heightAt(x, y), water: waterAt(x, y), region: -1 });
    }
    const land = cells.filter(c => !c.water);

    /* ---- regions: seeds on land, no two too near; the count leans on the world ---- */
    let nReg = P.int(rng, CONST.REGIONS[0], CONST.REGIONS[1]);
    if (opts.regions) nReg = opts.regions;
    const seeds = [];
    let tries = 0;
    while (seeds.length < nReg && tries++ < 4000) {
      const c = P.pick(rng, land);
      if (seeds.every(s => dist(s.x, s.y, c.x, c.y) >= CONST.REGION_MIN_GAP * 2 * R * (nReg > 14 ? 1.7 : 2.1))) seeds.push({ x: c.x, y: c.y });
    }
    nReg = seeds.length;
    /* every land cell belongs to its nearest seed: a region is a patch of the relief */
    for (const c of land) { let b = 0, bd = Infinity; for (let s = 0; s < nReg; s++) { const d = dist(c.x, c.y, seeds[s].x, seeds[s].y); if (d < bd) { bd = d; b = s; } } c.region = b; }
    const regions = seeds.map((s, i) => {
      const mine = land.filter(c => c.region === i);
      const cx = mine.reduce((t, c) => t + c.x, 0) / Math.max(1, mine.length), cy = mine.reduce((t, c) => t + c.y, 0) / Math.max(1, mine.length);
      const meanH = mine.reduce((t, c) => t + c.h, 0) / Math.max(1, mine.length);
      return { id: i, name: placeName(rng, arch, used), cx, cy, cells: mine, meanH, zones: [], links: [] };
    });
    /* the terrain of a region: the archetype's mix, leaned by its height — the high ground is
       broken and entrenched, the low is marsh and basin */
    for (const reg of regions) {
      const mix = arch.terrain.map(([t, w]) => {
        const hi = /entrenched|broken|crevasse|lava|ruins/.test(t), lo = /marsh|basin|canopy|salt/.test(t);
        const lean = hi ? 0.6 + reg.meanH : lo ? 1.6 - reg.meanH : 1;
        return [t, Math.max(1, w * lean)];
      });
      reg.terrain = P.weightedPick(rng, mix);
      reg.ticks = Math.max(1, Math.round((TICKS[reg.terrain] || 3) * Math.sqrt(CONST.STEP_SCALE_FROM / CONST.ZONES_TARGET)));
      reg.forage = (MAP.TERRAIN[reg.terrain] || {}).forage || 0;
    }

    /* ---- zones: a region's share of the total, spread through it by farthest-point ---- */
    const totalCells = land.length;
    const zones = [];
    for (const reg of regions) {
      const share = reg.cells.length / totalCells * nReg * CONST.ZONES_TARGET;
      const k = Math.max(CONST.ZONES_PER_REGION[0], Math.min(CONST.ZONES_PER_REGION[1], Math.round(share + (rng() - 0.5))));
      const picked = [];
      if (reg.cells.length) picked.push(P.pick(rng, reg.cells));
      while (picked.length < k && reg.cells.length > picked.length) {
        let best = null, bd = -1;
        for (const c of reg.cells) { if (picked.indexOf(c) >= 0) continue; const d = Math.min.apply(null, picked.map(p => dist(p.x, p.y, c.x, c.y))); if (d > bd) { bd = d; best = c; } }
        if (!best) break; picked.push(best);
      }
      for (const c of picked) {
        const z = { id: zones.length, region: reg.id, x: c.x, y: c.y, h: c.h, height: 0, cover: COVER[reg.terrain] || 0, hiding: (MAP.TERRAIN[reg.terrain] || {}).conceal || 1, site: null, nb: [] };
        zones.push(z); reg.zones.push(z.id);
      }
      /* height levels against the region: the lowest is -1, the highest 2, the rest by rank */
      const zs = reg.zones.map(id => zones[id]).sort((a, b) => a.h - b.h);
      zs.forEach((z, i) => { const t = zs.length > 1 ? i / (zs.length - 1) : 0.5; z.height = t < 0.15 ? -1 : t < 0.65 ? 0 : t < 0.9 ? 1 : 2; });
      if (zs.length >= 3 && zs[zs.length - 1].height < 1) zs[zs.length - 1].height = 1;   /* a region always has a high ground */
      /* links inside: each zone to its nearest few, then the region joined up by shortest spans */
      for (const z of zs) {
        const near = zs.filter(o => o !== z).sort((a, b) => dist(a.x, a.y, z.x, z.y) - dist(b.x, b.y, z.x, z.y)).slice(0, CONST.ZONE_LINKS);
        for (const o of near) { if (z.nb.indexOf(o.id) < 0) z.nb.push(o.id); if (o.nb.indexOf(z.id) < 0) o.nb.push(z.id); }
      }
      joinUp(zs, (a, b) => dist(a.x, a.y, b.x, b.y), (a, b) => { a.nb.push(b.id); b.nb.push(a.id); });
    }

    /* ---- routes: regions that touch on the relief are joined, from border zone to border zone ---- */
    const touch = new Set();
    const idx = {}; cells.forEach(c => { idx[Math.round(c.x * N - 0.5) + ',' + Math.round(c.y * N - 0.5)] = c; });
    for (const c of land) for (const d of [[1, 0], [0, 1]]) {
      const o = idx[(Math.round(c.x * N - 0.5) + d[0]) + ',' + (Math.round(c.y * N - 0.5) + d[1])];
      if (o && !o.water && o.region !== c.region) touch.add(Math.min(c.region, o.region) + '|' + Math.max(c.region, o.region));
    }
    /* and across a strait: two regions whose centres are near each other but parted by water */
    for (let a = 0; a < nReg; a++) for (let b = a + 1; b < nReg; b++) {
      if (touch.has(a + '|' + b)) continue;
      if (dist(regions[a].cx, regions[a].cy, regions[b].cx, regions[b].cy) < R * 0.42) touch.add(a + '|' + b);
    }
    const waterShare = (ax, ay, bx, by) => { let w = 0, n = 12; for (let i = 1; i < n; i++) { const t = i / n; if (waterAt(ax + (bx - ax) * t, ay + (by - ay) * t)) w++; } return w / (n - 1); };
    const routeOf = (a, b) => {
      const ga = gateway(regions[a], regions[b], zones), gb = gateway(regions[b], regions[a], zones);
      const len = dist(ga.x, ga.y, gb.x, gb.y), water = waterShare(ga.x, ga.y, gb.x, gb.y);
      const steps = Math.max(1, Math.round(len / CONST.ROUTE_UNIT));
      const ticks = Math.round(steps * (regions[a].ticks + regions[b].ticks) / 2 * (water > 0 ? CONST.ROUTE_WATER_MULT : 1));
      return { a, b, from: ga.id, to: gb.id, ticks, water, len };
    };
    let routes = [...touch].map(k => { const [a, b] = k.split('|').map(Number); return routeOf(a, b); });
    const kept = routes.filter(r => r.water <= CONST.ROUTE_WATER_CUT);
    /* every region reachable: the regions the cut left apart are rejoined by their cheapest route */
    const comp = components(nReg, kept);
    if (comp.count > 1) {
      const byCost = routes.filter(r => kept.indexOf(r) < 0).sort((x, y) => x.ticks - y.ticks);
      for (const r of byCost) { if (comp.find(r.a) !== comp.find(r.b)) { comp.union(r.a, r.b); kept.push(r); } }
      /* and if touching never offered one, the nearest pair of the two halves */
      if (comp.count > 1) for (let a = 0; a < nReg; a++) for (let b = a + 1; b < nReg; b++) if (comp.find(a) !== comp.find(b)) { comp.union(a, b); kept.push(routeOf(a, b)); }
    }
    routes = kept;
    for (const r of routes) { regions[r.a].links.push({ to: r.b, from: r.from, at: r.to, ticks: r.ticks }); regions[r.b].links.push({ to: r.a, from: r.to, at: r.from, ticks: r.ticks }); }

    /* ---- the wall: a last ground near the centre, the rest outermost first with a drawn shuffle ---- */
    const byCentre = regions.slice().sort((a, b) => dist(a.cx, a.cy, CX, CY) - dist(b.cx, b.cy, CX, CY));
    const last = P.pick(rng, byCentre.slice(0, Math.min(CONST.LAST_GROUND_PICK, byCentre.length)));
    /* outermost first, with a drawn shuffle — and never a region whose going would cut the standing ground in two:
       whoever is left must always have a way to the last ground */
    /* outermost from the CENTRE of the disc, as the dome closed: a ring tightening on the middle, not on wherever the last ground fell */
    const scored = regions.filter(r => r !== last).map(r => ({ id: r.id, d: dist(r.cx, r.cy, CX, CY) + (rng() - 0.5) * R * 0.08 })).sort((a, b) => b.d - a.d);
    const rest = [], gone = new Set();
    const connectedWithout = (id) => { const live = regions.filter(r => !gone.has(r.id) && r.id !== id).map(r => r.id); if (!live.length) return true;
      const seen = new Set([live[0]]), q = [live[0]]; while (q.length) { const c = q.shift(); for (const l of regions[c].links) if (!gone.has(l.to) && l.to !== id && !seen.has(l.to)) { seen.add(l.to); q.push(l.to); } } return seen.size === live.length; };
    while (scored.length) { let k = scored.findIndex(x => connectedWithout(x.id)); if (k < 0) k = 0; const x = scored.splice(k, 1)[0]; rest.push(x.id); gone.add(x.id); }
    const windows = []; for (let d = 1; d <= CONST.DAYS; d += CONST.WINDOW_EVERY) windows.push(d);
    /* regions go from the second window to the second-last, spread as evenly as the count allows */
    const slots = windows.slice(1, windows.length - 1), takeAt = [];
    rest.forEach((id, i) => takeAt.push({ region: id, day: slots[Math.floor(i / rest.length * slots.length)] }));
    /* §ENDGAME THE WALL CLOSES INSIDE THE LAST GROUND (ruled). Once the last region-taking is past, the wall goes on
       a zone at a time, the zones farthest from the final one first and never one that cuts the rest in two, so that
       the final zone stands alone on the month's last day: whoever is left is on the same ground by then. Spread from
       the day after the last region goes to the month's end, several a day if the month is short of days. */
    const lastTake = takeAt.reduce((m, t) => Math.max(m, t.day), 1);
    const lz = last.zones.slice(), finalZone = lz.slice().sort((a, b) => dist(zones[a].x, zones[a].y, last.cx, last.cy) - dist(zones[b].x, zones[b].y, last.cx, last.cy) || zones[b].height - zones[a].height)[0];
    const zDist = {}; { const q = [finalZone]; zDist[finalZone] = 0; while (q.length) { const c0 = q.shift(); for (const n0 of zones[c0].nb) if (zDist[n0] == null && zones[n0].region === last.id) { zDist[n0] = zDist[c0] + 1; q.push(n0); } } }
    const zLeft = new Set(lz), zoneOrder = [];
    const zConnectedWithout = (id) => { const live = [...zLeft].filter(z => z !== id); if (!live.length) return true; const seen = new Set([live[0]]), q = [live[0]];
      while (q.length) { const c0 = q.shift(); for (const n0 of zones[c0].nb) if (zLeft.has(n0) && n0 !== id && !seen.has(n0)) { seen.add(n0); q.push(n0); } } return seen.size === live.length; };
    while (zLeft.size > 1) {
      const cands = [...zLeft].filter(z => z !== finalZone).sort((a, b) => (zDist[b] || 0) - (zDist[a] || 0) || a - b);
      const pick = cands.find(z => zConnectedWithout(z)) || cands[0];
      zoneOrder.push(pick); zLeft.delete(pick);
    }
    const zFirst = Math.min(CONST.DAYS, lastTake + 1), zSpan = Math.max(1, CONST.DAYS - zFirst + 1);
    const zoneAt = zoneOrder.map((z, i) => ({ zone: z, day: Math.min(CONST.DAYS, zFirst + Math.floor(i * zSpan / Math.max(1, zoneOrder.length))) }));
    const wall = { last: last.id, order: rest, takeAt, windows, zoneAt, finalZone };

    /* ---- sites: one a zone, few a region; deposits from what the world is made of ---- */
    const composition = MAP.rollComposition ? MAP.rollComposition(rng, archKey) : [];
    const sites = [];
    const siteCount = {}; regions.forEach(r => siteCount[r.id] = 0);
    const outerHalf = regions.slice().sort((a, b) => dist(b.cx, b.cy, CX, CY) - dist(a.cx, a.cy, CX, CY)).slice(0, Math.ceil(nReg / 2)).map(r => r.id);
    const place = (kind, extra, test) => {
      const cand = zones.filter(z => !z.site && siteCount[z.region] < CONST.SITES_PER_REGION && (!test || test(z)));
      if (!cand.length) return null;
      const z = P.pick(rng, cand);
      z.site = Object.assign({ kind, zone: z.id }, extra || {}); siteCount[z.region]++; sites.push(z.site); return z.site;
    };
    const nDep = P.int(rng, CONST.DEPOSITS[0], CONST.DEPOSITS[1]);
    for (let i = 0; i < nDep; i++) {
      const res = composition.length ? composition[i % composition.length] : null;
      const opens = Math.round(CONST.DEPOSIT_OPENS[0] + (CONST.DEPOSIT_OPENS[1] - CONST.DEPOSIT_OPENS[0]) * i / Math.max(1, nDep - 1));
      /* §SITES a deposit is placed where its region stands long enough after it opens to be reached and worked: a seam
         the planner must leave the day it opens is no seam (40% of them were) */
      const lasts = z => { const t = takeAt.find(x => x.region === z.region); return t ? t.day - opens >= CONST.DEPOSIT_WINDOW : true; };
      const base = z => z.region !== last.id || i === nDep - 1;
      const extra = { resource: res ? res.id : null, category: res ? res.category : null, label: res ? (MAP.DEPOSIT_LABEL[res.category] || 'Deposit') : 'Deposit', opens, units: res ? Math.max(1, Math.round((res.density || 0.5) * 4)) : 2 };
      if (!place('deposit', extra, z => base(z) && lasts(z))) place('deposit', extra, base);
    }
    for (let i = 0; i < CONST.SITES.beacon; i++) place('beacon', {}, z => z.region !== last.id);
    for (let i = 0; i < CONST.SITES.rest; i++) place('rest', {});
    for (let i = 0; i < CONST.SITES.strongpoint; i++) place('strongpoint', {}, z => outerHalf.indexOf(z.region) >= 0);
    for (let i = 0; i < CONST.SITES.munitions; i++) place('munitions', {});
    for (let i = 0; i < CONST.SITES.mast; i++) place('mast', {}, z => z.height >= 1);
    /* a deposit that would open too near its region's going opens early enough to be worked */
    for (const s of sites) if (s.kind === 'deposit') { const t = takeAt.find(x => x.region === zones[s.zone].region); if (t && t.day - s.opens < CONST.DEPOSIT_WINDOW) s.opens = Math.max(2, t.day - CONST.DEPOSIT_WINDOW); }

    const ground = {
      name, archetype: archKey, archetypeName: arch.name, days: CONST.DAYS,
      regions: regions.map(r => ({ id: r.id, name: r.name, terrain: r.terrain, terrainName: MAP.TERRAIN_NAMES[r.terrain] || r.terrain, ticks: r.ticks, forage: r.forage,
                                   cx: round3(r.cx), cy: round3(r.cy), area: r.cells.length / totalCells, zones: r.zones, links: r.links })),
      zones: zones.map(z => ({ id: z.id, region: z.region, x: round3(z.x), y: round3(z.y), height: z.height, cover: z.cover, hiding: round3(z.hiding), site: z.site, nb: z.nb })),
      sites, wall, windows: { every: CONST.WINDOW_EVERY, dailyWhenLeft: CONST.DAILY_WHEN_LEFT },
      composition, pot: MAP.richnessOf ? { richness: MAP.richnessOf(composition) } : null,
      seaLevel, water: cells.filter(c => c.water).length / cells.length,
      /* §GROUND the relief as it was cut, for the page to draw: every sample of the disc, its region (-1 water) and its height
         in tenths, row by row; off the disc is left out */
      relief: reliefOf(cells, N)
    };
    return ground;
  }

  /** §GROUND the relief, packed for the page: row by row, a character a sample — '.' off the disc, '~' water, else the region
      (from '0', one character each) — and the height in tenths as a digit */
  function reliefOf(cells, N) {
    const reg = new Array(N * N).fill('.'), h = new Array(N * N).fill('0');
    for (const c of cells) { const i = Math.round(c.y * N - 0.5) * N + Math.round(c.x * N - 0.5); reg[i] = c.water ? '~' : String.fromCharCode(48 + c.region); h[i] = String(Math.max(0, Math.min(9, Math.round(c.h * 9)))); }
    return { n: N, reg: reg.join(''), h: h.join('') };
  }
  /* the zone of `a` nearest `b`: where a route leaves from */
  function gateway(a, b, zones) { return a.zones.map(id => zones[id]).sort((p, q) => dist(p.x, p.y, b.cx, b.cy) - dist(q.x, q.y, b.cx, b.cy))[0]; }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function placeName(rng, arch, used) {
    for (let i = 0; i < 14; i++) { const n = P.pick(rng, arch.adjectives) + " " + P.pick(rng, arch.places); if (!used.has(n)) { used.add(n); return n; } }
    return P.pick(rng, arch.adjectives) + " " + P.pick(rng, arch.places) + " " + (used.size + 1);
  }
  /* join a set of nodes by their shortest spans until one piece: Kruskal over the pairs */
  function joinUp(nodes, costOf, link) {
    const par = nodes.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    nodes.forEach((a, i) => a.nb.forEach(id => { const j = nodes.findIndex(n => n.id === id); if (j >= 0) par[find(i)] = find(j); }));
    const pairs = []; for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) pairs.push([i, j, costOf(nodes[i], nodes[j])]);
    pairs.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of pairs) if (find(i) !== find(j)) { par[find(i)] = find(j); link(nodes[i], nodes[j]); }
  }
  function components(n, routes) {
    const par = []; for (let i = 0; i < n; i++) par.push(i);
    const find = i => par[i] === i ? i : (par[i] = find(par[i]));
    const union = (a, b) => { par[find(a)] = find(b); };
    for (const r of routes) union(r.a, r.b);
    const c = { find, union, get count() { const s = new Set(); for (let i = 0; i < n; i++) s.add(find(i)); return s.size; } };
    return c;
  }

  /* ---------------- reading a ground ---------------- */
  /** the regions still standing on a day */
  /** whether the wall has taken a zone by `day`: its region gone, or (on the last ground) the zone itself */
  function zoneGone(ground, zid, day) {
    const r = ground.zones[zid].region;
    if (ground.wall.takeAt.some(t => t.region === r && t.day <= day)) return true;
    return (ground.wall.zoneAt || []).some(t => t.zone === zid && t.day <= day);
  }
  /** the day the wall takes a zone (Infinity for the final zone) */
  function zoneGoesOn(ground, zid) {
    const r = ground.zones[zid].region, t = ground.wall.takeAt.find(x => x.region === r);
    if (t) return t.day;
    const z = (ground.wall.zoneAt || []).find(x => x.zone === zid);
    return z ? z.day : Infinity;
  }
  /** the zones of the last ground the wall takes next, after `day` */
  function nextZonesToGo(ground, day) { const next = (ground.wall.zoneAt || []).map(t => t.day).filter(d => d > day).sort((a, b) => a - b)[0]; return next == null ? [] : ground.wall.zoneAt.filter(t => t.day === next).map(t => t.zone); }
  function standingOn(ground, day) { const gone = new Set(ground.wall.takeAt.filter(t => t.day <= day).map(t => t.region)); return ground.regions.filter(r => !gone.has(r.id)); }
  /** the regions the wall takes by the next window after `day` */
  function nextToGo(ground, day) { const next = ground.wall.takeAt.map(t => t.day).filter(d => d > day).sort((a, b) => a - b)[0]; return next == null ? [] : ground.wall.takeAt.filter(t => t.day === next).map(t => t.region); }
  /** whether a comms window falls on this day: every other day, then daily once few regions stand */
  function isWindowDay(ground, day) {
    if (day < 1) return false;
    if (standingOn(ground, day).length <= ground.windows.dailyWhenLeft) return true;
    return (day - 1) % ground.windows.every === 0;
  }
  /** ticks from one zone to another over the whole ground: Dijkstra over zone links and routes */
  function ticksBetween(ground, from, to, opts) {
    const Z = ground.zones, R = ground.regions;
    const cost = {}, prev = {}, done = new Set(); cost[from] = 0;
    const avoid = (opts && opts.avoid) || (() => false);
    while (true) {
      let u = null, best = Infinity; for (const k in cost) if (!done.has(+k) && cost[k] < best) { best = cost[k]; u = +k; }
      if (u == null) break; if (u === to) break; done.add(u);
      const z = Z[u], reg = R[z.region];
      const step = (v, c) => { if (avoid(v)) return; const nc = cost[u] + c; if (cost[v] == null || nc < cost[v]) { cost[v] = nc; prev[v] = u; } };
      for (const v of z.nb) step(v, reg.ticks);
      for (const l of reg.links) if (l.from === u) step(l.at, l.ticks);
    }
    if (cost[to] == null) return null;
    const path = [to]; let c = to; while (c !== from) { c = prev[c]; path.unshift(c); }
    return { ticks: cost[to], path };
  }
  /** the zones a squad at `zone` sees: its neighbours, plus one ring per level of height above flat */
  function seenFrom(ground, zone) {
    const z = ground.zones[zone]; if (z.height <= -1) return [zone];
    const rings = 1 + Math.max(0, z.height);
    const seen = new Set([zone]); let edge = [zone];
    for (let r = 0; r < rings; r++) { const nxt = []; for (const id of edge) for (const n of ground.zones[id].nb) if (!seen.has(n)) { seen.add(n); nxt.push(n); } edge = nxt; }
    return [...seen];
  }

  /** §SITES the ground's sites in the shape the season, the board and the settlement read: an objective a site, on
      its zone, placed in its region; a deposit's potency is its units; every site is known from the drop (the ground is
      scouted) and a deposit is worked from the day it opens */
  const OBJ_TYPE = { deposit: 'resource_site', rest: 'ration_site', strongpoint: 'strongpoint', munitions: 'munitions_drop', mast: 'relay_mast', beacon: 'sponsor_cache' };
  const OBJ_LABEL = { rest: 'Rest Site', strongpoint: 'Strongpoint', munitions: 'Munitions Drop', mast: 'Relay Mast', beacon: 'Landing Beacon' };
  function objectivesOf(ground) {
    return ground.sites.map((s, i) => { const z = ground.zones[s.zone], r = ground.regions[z.region];
      return { id: 'obj_' + i, type: OBJ_TYPE[s.kind] || s.kind, kind: s.kind, zone: s.zone, region: z.region,
               x: z.x, y: z.y, place: r.name, label: s.label || OBJ_LABEL[s.kind] || s.kind,
               resource: s.resource || null, category: s.category || null, potency: s.kind === 'deposit' ? (s.units || 1) : 1, tier: 2,
               revealed: true, revealDay: 1, opens: s.kind === 'deposit' ? s.opens : 1, wave: 0,
               looted: false, lootedBy: null, work: {}, dark: 0 }; });
  }
  const api = { CONST, generate, standingOn, zoneGone, zoneGoesOn, nextZonesToGo, nextToGo, isWindowDay, ticksBetween, seenFrom, objectivesOf, OBJ_TYPE };
  if (isNode) module.exports = api;
  global.CDGROUND = api;
})(typeof window !== "undefined" ? window : globalThis);
