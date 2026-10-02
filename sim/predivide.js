/* Capital Divide — /sim/predivide.js
 *
 * THE SEAM. M11 is where the preparation year hands over to the Divide: how many to send, which
 * lean, and WHERE THEY COME DOWN. The ground is regions of zones (sim/ground.js), and the draft
 * deals landings on it — one squad a zone, one squad a region for each OA, straight weakest-first.
 * What an OA can read of a landing is what its survey bought: unscouted, a zone is a name in a
 * region; scouted, its ground; scouted well, the prize within reach. Every pick is public.
 *
 * (The sector seam that cut the old ring into six is gone with the ring; a pre-drop pact went
 * with the truces.)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./prng.js'), require('./map.js'), require('./reputation.js'));
  else root.CDPREDIVIDE = factory(root.CDPRNG, root.CDMAP, root.CDREP);
}(typeof self !== 'undefined' ? self : this, function (P, MAP, REP) {
  'use strict';

  const CONST = {
    LANDING_ASKED_W: 5.0,        // [C] a landing near the resource the OA's board asked for, per unit of it (measured: asked 24% met against 6% for the unasked)
    LANDING_NEXT_W: 0.5,         // [C] a deposit in the region next door counts this much of one in the region
    /* [H] What a survey buys you HERE. Below the first threshold a landing reads as a name in a region; above it
       you know the ground; above the second you know the prize. */
    INTEL_TERRAIN: 0.12,
    INTEL_PRIZE: 0.30
  };

  /** §DROP THE LANDINGS. Every zone of the ground but the last ground's: its region, the going, its cover and
      height, the site on it, and the prize within reach — the deposits of its region and half of the next
      regions' — read off the ground the Divide is fought on, not a parallel description of it. */
  function landings(ground) {
    const out = [];
    const depositsIn = {};
    for (const s of ground.sites) if (s.kind === 'deposit') { const r = ground.zones[s.zone].region; (depositsIn[r] = depositsIn[r] || []).push(s); }
    for (const z of ground.zones) {
      if (z.region === ground.wall.last) continue;
      const reg = ground.regions[z.region];
      let prize = 0; const near = {};
      const count = (list, w) => { for (const s of (list || [])) { prize += (s.units || 1) * w; if (s.resource) near[s.resource] = Math.round(((near[s.resource] || 0) + (s.units || 1) * w) * 10) / 10; } };
      count(depositsIn[z.region], 1);
      for (const l of reg.links) count(depositsIn[l.to], CONST.LANDING_NEXT_W);
      out.push({ index: z.id, zone: z.id, region: z.region, regionName: reg.name, terrain: reg.terrain, ticks: reg.ticks,
                 cover: z.cover, height: z.height, hiding: z.hiding, site: z.site ? z.site.kind : null, siteLabel: z.site ? (z.site.label || null) : null,
                 prize: Math.round(prize * 10) / 10, resources: near, x: z.x, y: z.y, links: reg.links.map(l => l.to) });
    }
    return out;
  }
  /** what a corp can read of a landing at its survey depth; the draft itself is public */
  function readLanding(l, intel) {
    const seen = { index: l.index, zone: l.zone, region: l.region, regionName: l.regionName, x: l.x, y: l.y };
    if (intel >= CONST.INTEL_TERRAIN) { seen.terrain = l.terrain; seen.ticks = l.ticks; seen.cover = l.cover; seen.height = l.height; seen.hiding = l.hiding; }
    if (intel >= CONST.INTEL_PRIZE) { seen.prize = l.prize; seen.resources = l.resources; seen.site = l.site; seen.siteLabel = l.siteLabel; }
    return seen;
  }
  /** a landing an OA may still take: free, and in a region none of its own squads has landed in */
  function allowed(l, taken, ownPicks, all) {
    if (taken[l.index] != null) return false;
    const regionsMine = (ownPicks || []).map(i => { const o = all.find(x => x.index === i); return o ? o.region : -1; });
    return regionsMine.indexOf(l.region) < 0;
  }
  /** §DROP THE DRAFT'S PICK. An AI corp values a free landing by what it can see of the ground and by who has
      already landed near it: the prize and the cover by its greed; the neighbours (the same region, and the next
      ones) by whether it is stronger than them and how aggressive it is; its own earlier picks by whether it wants
      its squads together (careful) or spread (aggressive). Every OA sees every pick, so this is a real read. */
  function chooseLanding(rng, corp, all, taken, ownPicks, strengthOf, intel) {
    const dials = (corp.profile && corp.profile.dials) || {};
    const aggr = (dials.aggression || 50) / 100, thrift = (dials.thrift || 50) / 100;
    const mine = strengthOf(corp.id);
    const ask = ((corp.rep && corp.rep.goal && corp.rep.goal.demands) || []).find(d => d.kind === 'resource' && d.resource);
    const asked = ask ? ask.resource : null;
    const regionOf = {}, linksOf = {}; for (const l of all) { regionOf[l.index] = l.region; linksOf[l.region] = l.links; }
    let best = null, bestV = -Infinity;
    for (const l of all) {
      if (!allowed(l, taken, ownPicks, all)) continue;
      const seen = readLanding(l, intel);
      let v = 0;
      if (seen.prize != null) v += seen.prize * (0.6 + aggr * 0.8);
      if (asked && seen.resources) v += (seen.resources[asked] || 0) * CONST.LANDING_ASKED_W;
      if (seen.cover != null) v += seen.cover * (1 - aggr) * 0.6 + Math.max(0, seen.height) * 0.4;
      if (seen.site && seen.site !== 'beacon') v += 0.6;
      /* the neighbours: who has landed in this region, and in the regions a route away */
      for (const k in taken) {
        const other = taken[k], r = regionOf[k];
        const near = r === l.region ? 1 : 0.45;
        if (r !== l.region && (linksOf[l.region] || []).indexOf(r) < 0) continue;
        if (other === corp.id) { v += (thrift * 1.2 - aggr * 0.8) * near; continue; }   /* cluster if careful, spread if aggressive */
        const edge = mine - strengthOf(other);                                           /* + means I am the stronger */
        v += near * (edge > 0 ? aggr * 1.4 * Math.min(1, edge) : -(1.6 - aggr) * Math.min(1, -edge));
      }
      v += rng() * 0.15;                                                                 /* a little of the unknown */
      if (v > bestV) { bestV = v; best = l; }
    }
    return best ? best.index : null;
  }
  return { CONST, landings, readLanding, chooseLanding, allowed };
}));
