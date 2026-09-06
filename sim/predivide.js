/* Capital Divide — /sim/predivide.js
 *
 * THE SEAM. M11 is where the preparation year hands over to the Divide, and until now it held
 * exactly one decision — how many to send, and which lean. Everything else about the drop was
 * the engine's: corps landed evenly spaced around a ring at a random spin, nobody had spoken to
 * anybody before the drop, and the last month of the year was the quietest.
 *
 * Three decisions live here, and they are deliberately entangled rather than three menus:
 *
 *  - **WHERE YOU LAND.** The ring is cut into sectors, and what is in each one is read off the
 *    planet the board wrote its card against. Rich ground is contested ground. You pick blind
 *    unless you paid for a survey, which is what makes the survey verb worth its point.
 *  - **WHO YOU HAVE AN UNDERSTANDING WITH.** A pact struck here is struck BLIND — before anyone
 *    knows where anyone landed or how strong they turned out to be. That is the whole difference
 *    from the in-Divide truces that already exist, which are bargains between people who can see
 *    each other. A pre-Divide pact is a bet on a rival's character.
 *  - **WHETHER YOU PERFORM.** Media day pays in standing with the four audiences and costs you
 *    concealment: turn up and rivals arrive knowing what you brought.
 *
 * The entanglement is the point. Landing next to somebody is survivable if you have a pact and
 * ruinous if you do not; performing makes you a more attractive pact partner and a more
 * attractive target; a survey tells you which sector is worth arguing over.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./prng.js'), require('./map.js'), require('./reputation.js'));
  else root.CDPREDIVIDE = factory(root.CDPRNG, root.CDMAP, root.CDREP);
}(typeof self !== 'undefined' ? self : this, function (P, MAP, REP) {
  'use strict';

  const CONST = {
    SECTORS: 6,                  // [S] how the ring is cut. Fewer than corps, so it is contested.
    /* [H] What a survey buys you HERE, which is the second half of a verb that previously paid
       only a flat readiness bonus nobody could see. Below the first threshold a sector reads as
       rumour; above it you know the ground; above the second you know the prize. */
    INTEL_TERRAIN: 0.12,
    INTEL_PRIZE: 0.30,
    /* [H] CONTESTED GROUND SHARES OUT, it is not taxed. This was a flat subtraction, and a flat
       subtraction against a prize that ranges from 0 to over 6 never bites — seven of eight
       corps piled into the single best sector and the choice meant nothing. Dividing is
       scale-free: land somewhere with three rivals and there is a quarter of it for you,
       whatever the sector was worth to begin with. */
    CROWDING_SHARE: 1.0,
    /* [H] Media day. Standing is on the signed -100..100 audience scale, so these are points on
       it, not multipliers. Turning up is worth more when you have something to show. */
    MEDIA_BASE: 7,
    MEDIA_FAME_SCALE: 0.22,      // [H] extra per point of your best fighter's fame
    MEDIA_REVEAL: 0.35,          // [H] how much of your true strength rivals learn by watching
    /* [H] Pacts struck blind. Cheaper to agree than an in-Divide truce because neither side
       knows yet what they are giving up, and correspondingly easier to regret. */
    PACT_DAYS: 4,                // [C] days a pre-Divide understanding is meant to hold
    PACT_BASE_P: 0.42,           // [H] baseline willingness before anything is known
    PACT_REGARD: 0.004,          // [H] per point of standing with that rival's fanbase
    PACT_FEAR: 0.5               // [H] how much being outgunned makes a rival want the pact
  };

  /**
   * The ring, cut into sectors, with what is actually in each. Read off the planet object the
   * Divide will fight on — not a parallel description of it, because a sector map that disagreed
   * with the ground would be the survey lying to the player in the game's own voice.
   */
  /** §DROP — THE SLOTS. `n` landing points round the ring (the drop ring at DROP_RING × R),
      each with dry footing, each reading like a sector: its ground, its cover, its height,
      the prize within reach, its distance to the centre. The draft picks from these. */
  function slots(planet, n) {
    const out = [];
    const R = planet.radius, d = R * 0.82;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let x = planet.cx + Math.cos(a) * d, y = planet.cy + Math.sin(a) * d;
      if (planet.nearestPassable) { const q = planet.nearestPassable(x, y); x = q.x; y = q.y; }
      let prize = 0;
      for (const o of planet.objectives || []) if (o.type === 'ore_assay' && MAP.dist(o.x, o.y, x, y) < R * 0.36) prize += (o.potency || 1);
      out.push({ index: i, angle: a, x, y, terrain: planet.terrainAt(x, y), conceal: planet.concealAt(x, y),
                 height: planet.heightAt ? planet.heightAt(x, y) : 0.5, prize: Math.round(prize * 10) / 10,
                 toCentre: MAP.dist(x, y, planet.cx, planet.cy) / R });
    }
    return out;
  }
  /** what a corp can read of a slot at its survey depth; the draft itself is public */
  function readSlot(slot, intel) {
    const seen = { index: slot.index, angle: slot.angle, x: slot.x, y: slot.y };
    if (intel >= CONST.INTEL_TERRAIN) { seen.terrain = slot.terrain; seen.conceal = slot.conceal; seen.height = slot.height; }
    if (intel >= CONST.INTEL_PRIZE) { seen.prize = slot.prize; seen.toCentre = slot.toCentre; }
    return seen;
  }
  /** §DROP THE DRAFT'S PICK. An AI corp values a free slot by what it can see of the ground
      and by who has already landed near it: the prize and the cover by its greed; the
      neighbours by whether it is stronger than them and how aggressive it is (a hunter drops
      near a weaker house, a careful one away from a stronger); its own earlier picks by
      whether it wants its squads together (careful) or spread to flank (aggressive). Every
      house sees every pick, so this is a real read of the board. */
  function chooseSlot(rng, corp, slots, taken, ownPicks, strengthOf, intel) {
    const dials = (corp.profile && corp.profile.dials) || {};
    const aggr = (dials.aggression || 50) / 100, thrift = (dials.thrift || 50) / 100;
    const mine = strengthOf(corp.id);
    let best = null, bestV = -Infinity;
    for (const s of slots) {
      if (taken[s.index] != null) continue;
      const seen = readSlot(s, intel);
      let v = 0;
      if (seen.prize != null) v += seen.prize * (0.6 + aggr * 0.8);
      if (seen.conceal != null) v += (1 / Math.max(0.2, seen.conceal)) * (1 - aggr) * 0.6 + (seen.height || 0.5) * 0.4;
      /* the neighbours: who has landed within two slots either way */
      for (const k in taken) {
        const other = taken[k], dist = Math.min(Math.abs(+k - s.index), slots.length - Math.abs(+k - s.index));
        if (dist > 2) continue;
        const near = 1 - dist / 3;
        if (other === corp.id) { v += (thrift * 1.2 - aggr * 0.8) * near; continue; }   /* cluster if careful, spread if aggressive */
        const edge = mine - strengthOf(other);                                              /* + means I am the stronger */
        v += near * (edge > 0 ? aggr * 1.4 * Math.min(1, edge) : -(1.6 - aggr) * Math.min(1, -edge));
      }
      v += rng() * 0.15;                                                                    /* a little of the unknown */
      if (v > bestV) { bestV = v; best = s; }
    }
    return best ? best.index : null;
  }
  function sectors(planet) {
    const out = [];
    /* named for where they are: index 0 sits at angle 0 (east) and the ring runs clockwise
       with y down, so 1 is south-east, 3 is west, 5 is north-east */
    const NAMES = ['east cut', 'south-east flats', 'south-west scree',
                   'west shelf', 'north-west ridge', 'north-east reach'];
    for (let i = 0; i < CONST.SECTORS; i++) {
      const a = (i / CONST.SECTORS) * Math.PI * 2;
      const d = planet.radius * 0.82;
      const x = planet.cx + Math.cos(a) * d;
      const y = planet.cy + Math.sin(a) * d;
      /* what a survey party would actually have found: the going, the cover, and how much of
         the prize is nearby */
      const terrain = planet.terrainAt ? planet.terrainAt(x, y) : 'open_basin';
      const conceal = planet.concealAt ? planet.concealAt(x, y) : 0.5;
      let prize = 0;
      for (const o of (planet.objectives || [])) {
        const dd = MAP.dist(x, y, o.x, o.y);
        if (dd < planet.radius * 0.55) prize += (1 - dd / (planet.radius * 0.55));
      }
      /* how far from the first ring's centre — near ground is fought over sooner */
      const toCentre = MAP.dist(x, y, planet.cx, planet.cy) / Math.max(1e-6, planet.radius);
      out.push({ index: i, name: NAMES[i % NAMES.length], angle: a, x: x, y: y,
                 terrain: terrain, conceal: conceal, prize: prize, toCentre: toCentre });
    }
    return out;
  }

  /**
   * What a corp is allowed to KNOW about a sector, given what it paid for. Intel is the prep
   * year's survey, and this is where it stops being an invisible readiness number.
   */
  function readSector(sector, intel) {
    const seen = { index: sector.index, name: sector.name };
    if (intel >= CONST.INTEL_TERRAIN) { seen.terrain = sector.terrain; seen.conceal = sector.conceal; }
    if (intel >= CONST.INTEL_PRIZE) { seen.prize = sector.prize; seen.toCentre = sector.toCentre; }
    seen.known = intel >= CONST.INTEL_PRIZE ? 'full'
               : intel >= CONST.INTEL_TERRAIN ? 'ground' : 'rumour';
    return seen;
  }

  /** What a sector is worth to a corp that can see it, before anyone else picks. */
  function sectorValue(sector, corp) {
    const dials = (corp.profile && corp.profile.dials) || {};
    const greed = 0.5 + (dials.aggression || 50) / 200;
    return sector.prize * greed + sector.conceal * (1 - greed) * 0.8;
  }

  /** An AI corp's pick. Deliberately plain, and it uses the same intel gate a player does. */
  function chooseSector(rng, corp, secs, taken) {
    const intel = corp._scouted || 0;
    let best = null, bestV = -Infinity;
    for (const s of secs) {
      const seen = readSector(s, intel);
      /* what you cannot see, you cannot value — an unsurveyed corp is guessing */
      const raw = seen.known === 'rumour' ? rng() * 0.5 : sectorValue(s, corp);
      const v = raw / (1 + (taken[s.index] || 0) * CONST.CROWDING_SHARE) + rng() * 0.15;
      if (v > bestV) { bestV = v; best = s; }
    }
    return best ? best.index : 0;
  }

  /**
   * MEDIA DAY. Standing with the four audiences, bought with a day of performing, paid for in
   * concealment. `reveal` is what rivals learn — it is returned rather than applied here, so the
   * Divide's belief model stays the one place that decides what anybody believes.
   */
  function mediaDay(corp) {
    const alive = (corp.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired');
    const bestFame = alive.reduce((m, f) => Math.max(m, f.fame || 0), 0);
    /* THROUGH `act`, NOT INTO `base`. Standing has a memory that decays and a residue that
       lingers, and writing to `base` directly would put a number on the scale that the
       reputation system had no record of ever granting — visible in the total, absent from the
       history, and impossible for anything to decay or contradict later. */
    const scale = 1 + bestFame * CONST.MEDIA_FAME_SCALE / CONST.MEDIA_BASE;
    if (corp.rep) REP.act(corp.rep, 'media_day', { mult: scale });
    corp._mediaReveal = CONST.MEDIA_REVEAL;
    return { gain: CONST.MEDIA_BASE * scale, reveal: CONST.MEDIA_REVEAL };
  }

  /**
   * Would this rival agree to an understanding before anybody lands? They cannot see your
   * force, so they go on what they think of you and how the odds look — which is exactly the
   * information a pre-Divide pact is a bet on.
   */
  function pactChance(from, to) {
    let p = CONST.PACT_BASE_P;
    /* WHAT THEY THINK OF YOU, read through `standing` with a target id. `rep.base.rival` is a
       MAP keyed by corp, not a number — adding it directly gave NaN, and the NaN then survived
       every clamp because `Math.max`/`Math.min` pass it straight through. It showed as a pact
       chance of NaN% on the seam screen, which is at least loud; had it been multiplied into a
       larger expression it would have shown as a quietly impossible probability. */
    const theirView = (to.rep && REP && REP.standing)
      ? (REP.standing(to.rep, 'rival', from.id) || 0) : 0;
    p += theirView * CONST.PACT_REGARD;
    /* somebody who thinks they are outgunned wants the pact more */
    const mine = ((from.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired')).length;
    const theirs = ((to.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired')).length;
    if (theirs < mine) p += ((mine - theirs) / Math.max(1, mine)) * CONST.PACT_FEAR;
    /* a corp that has broken a pact before is not asked twice as easily */
    if (from._pactBreaches) p -= 0.12 * from._pactBreaches;
    return Math.max(0.02, Math.min(0.95, p));
  }

  function proposePact(rng, from, to) {
    const p = pactChance(from, to);
    const agreed = rng() < p;
    return { with: to.id, agreed: agreed, chance: p };
  }

  return { CONST, sectors, slots, readSlot, chooseSlot, readSector, sectorValue, chooseSector, mediaDay,
           pactChance, proposePact };
}));
