/* Capital Divide — /sim/reputation.js  (Step 7b)
 *
 * Who is watching, what they think of you, and what that costs. Implements REPUTATION.md:
 *   §2 the four audiences and the memory · §3 the acts · §4 fame · §5 placement
 *   §6 the board, the holds, the goal card and patience · §10 the premium and the wall
 *   §11 the mercenary price
 *
 * WHAT THIS OWNS: standing, and everything that reads it. This is the FIRST thing in the
 * project that outlives a Divide (R1) — a corp's memory, its board's patience and its holds
 * survive; rosters, armouries and treasuries still do not, and building those is Step 8.
 *
 * WHAT THIS DOES NOT OWN: money. Per R2 and R3 there is no exchange rate between standing
 * and credits anywhere in this file, and there must never be one. What §10 exports is a
 * MULTIPLIER on an asking price and a wall past which no price is accepted — an ugly deal
 * makes a corp expensive and then makes it unavailable. It never states what a point is worth.
 *
 * Plain serialisable data: no closures, no functions on the record. Step 8 writes it to disk.
 *
 * Pure logic: no DOM, no Math.random, no I/O. Every roll takes an injected rng.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require('./prng.js') : global.CDPRNG;

  const CONST = {
    /* §2.1 the scale — signed, because loathing is a position and not an absence */
    STANDING_FLOOR: -100,               // [S]
    STANDING_CEIL: 100,                 // [S]

    /* §2.1 the memory — recency and permanence together (R8) */
    MEMORY_HALFLIFE: 3,                 // [C] seasons, the default
    MEMORY_RESIDUE: 0.15,               // [C] the share of ordinary conduct that never fades
    MEMORY_CAP: 40,                     // [S] acts kept per audience before the tail is folded
    HEADLINE_AT: 20,                    // [C] §3.3 an act this big is remembered by name

    /* §4 fame — attention, not approval (R11) */
    FAME_FLOOR: 0,                      // [S]
    FAME_CEIL: 100,                     // [S]
    FAME_DECAY: 0.88,                   // [C] per season; the fleet forgets a person faster
                                        //     than it forgets a corp, which is the right way round
    FAME_KILL_TRANSFER: 0.22,           // [C] §4.2 share of a famous victim's fame that moves
                                        //     to whoever put them down. Beating a nobody moves
                                        //     nothing — the same definition of "worth beating"
                                        //     the day loop already hunts by

    /* §6 the board */
    PATIENCE_FLOOR: 0,                  // [S] dismissal. Step 8 owns the firing; this owns the number
    PATIENCE_CEIL: 100,                 // [S]
    GOAL_DEMANDS: [3, 4],               // [S] R25 — fewer discrete asks, because two standing
                                        //     ones are now always on the card as well
    /* R25 — the standing demands, judged on a spectrum every season rather than met/unmet. */
    /* THE NEUTRAL POINT OF THE FUNDING SPECTRUM IS 1.0 AND IS NOT A TUNED NUMBER. A board is
       not merely un-delighted by an expensive year, it is ANNOYED by one — so the neutral has
       to be exceedable, which the old baseline (the whole ceiling plus every contract in full)
       was not. `season.js` now measures spend against WHAT THE BOARD PUT IN: §6.5's stipend,
       which covers wages, the entry fee and arming a full force and nothing else. Living inside
       your stipend is exactly neutral.

       A constant was briefly fitted here to the measured median instead, and the next change in
       the same session made that median stop existing. The relationship is structural and
       re-anchors itself as the economy moves; the number did not. */
    STANDING_THRIFT_W: 1.30,            // [C] how hard a cheap year moves a board with no
                                        //     interest in the planet; scaled DOWN by interest
    STANDING_CARE_W: 0.70,              // [C] how hard bringing people home moves one
    CARE_NEUTRAL_LOSS: 0.29,            // [C] the loss rate a board considers unremarkable.
                                        //     MEASURED, not assumed, and re-measured whenever
                                        //     the resolver changes: 0.30 -> 0.398 (abstract
                                        //     model) -> 0.496 (the grid). Each time it went
                                        //     -> 0.28 once an orderly withdrawal stopped
                                        //     being scored as an overrun. Each time it went
                                        //     stale, every board in the fleet became
                                        //     permanently disappointed about a normal year and
                                        //     all eight corps' patience trended down together.
                                        //     A constant anchored to a measurement has to be
                                        //     re-anchored when the measurement moves.
    GOAL_CONTENT_FRACTION: 0.50,        // [C] R25 — the score at which a board is merely content
    /* [C] R25b — anchored to the measured spread of card scores (p25 0.45, median 0.62,
       p75 0.76), not chosen. Re-anchor these whenever the card or the resolver moves. */
    BOARD_CUTS: { delighted: 0.88, pleased: 0.74, disappointed: 0.36, unhappy: 0.24 },
    HOME_CUSHION: 0.40,                 // [C] §6.4 how much popular support blunts a bad year
    HOLDS_DRAIN: 0.12,                  // [H] §6.1 of a full store, per season. [OPEN-R1]
    HOLDS_CEIL: 1.0,                    // [S]
    UNITS_PER_STORE: 9,                 // [H] assay units that fill a store. RE-DERIVED: the
                                        //     first pass took 40, and a corp digs two to six
                                        //     out of a Divide, so every resource demand on
                                        //     every card failed and eight boards sacked eight
                                        //     managers inside three seasons. [OPEN-R1]
    EASY_CARD_SPAN: 4,                  // [C] places of softening that count as a discount
    EASY_CARD_DISCOUNT: 0.88,           // [C] §6.1a how little a trivial card is worth clearing
    AMBITION_PIVOT: 50,                 // [S] §6.2 patience at which a board asks for its anchor
    AMBITION_SCALE: 12,                 // [C] patience points per place demanded — the harder
                                        //     you have made it look, the harder they ask
    CALL_PATIENCE_RATE: 0.055,          // [C] §6.5 patience per 10,000 credits asked of the board
    CALL_ESCALATOR: 0.80,               // [C] and asking twice costs more than asking once

    /* §10 the premium and the wall — what replaces the deleted exchange rate */
    UGLY_PREMIUM_MAX: 1.25,             // [C] what being seen to do it multiplies a price by.
                                        //     RE-DERIVED, and the first draft was wrong by an
                                        //     order of magnitude: the additive reputation cost
                                        //     this replaces was only 5–20% of an asking price,
                                        //     never a doubling. At 2.20 both sides moved so far
                                        //     apart that the market closed completely — zero
                                        //     deals in sixty Divides. The premium is the gentle
                                        //     half of this mechanism; the wall is the teeth
    UGLY_WALL: 0.75,                    // [S] past this share of what a corp can afford, no
                                        //     price is enough. This is where the corp that
                                        //     refuses to deal at all lives — the far end of a
                                        //     scale rather than a flag on a profile
    TOLERANCE_BASE: 40.0,               // [C] standing points a comfortable corp can shrug off.
                                        //     Re-derived against N-T1/N-T3/N-T7: 1.9 joins per
                                        //     Divide, chains in 31%, median 25 days

    /* §11 the mercenary price — a price, not an audience (R7) */
    MERC_INDEX_HALFLIFE: 2,             // [C] seasons
    MERC_PRICE_SWING: 0.35              // [H] how far the market moves for how you spend people
  };

  const AUDIENCES = ['own', 'rival', 'fleet', 'aleas'];
  const CATEGORIES = ['minerals', 'fuels', 'luxuries', 'foods'];

  /* --- §3.1 the act table ------------------------------------------------------------
     One entry per thing a corp can be seen doing. A value may be:
        a number      flat
        [lo, hi]      scaled by ctx.scale (0..1) — how much you threw away
        {per: n}      multiplied by ctx.count, with ctx.famous counted at famousMult
     A blank means that audience does not care, which is most of the interesting content:
     your own ships punish losses and the wider fleet barely notices them, and that is the
     difference between supporters and spectators. */
  const ACTS = {
    won_planet:        { own: 18, rival: -4, fleet: 6, aleas: 4, residue: 0.55 },
    finished:          { own: { per: 1.6 }, fleet: { per: 0.5 }, residue: 0.15 },
    ceded:             { own: [-4, -14], fleet: [-5, -18], aleas: 2, buyer: 3, residue: 0.15 },
    stood_down:        { own: [-1, -5], rival: 2, fleet: [-2, -6], aleas: 1, residue: 0.15 },
    bought_win:        { own: -2, rival: -6, fleet: [-4, -11], aleas: -3, residue: 0.15 },
    refused_all:       { own: 6, rival: -5, fleet: 9, aleas: -4, residue: 0.30 },
    kept_truce:        { own: 1, rival: 7, fleet: 3, aleas: 1, residue: 0.15 },
    broke_truce:       { own: -1, rival: -22, fleet: -9, aleas: -3, residue: 0.55 },
    betrayed:          { own: -25, rival: -60, fleet: -45, aleas: -70, residue: 0.85 },
    betrayed_covered:  { own: -3, rival: -18, fleet: -6, residue: 0.85 },
    ransomed_home:     { own: 9, rival: 5, fleet: 2, residue: 0.15 },
    abandoned_ours:    { own: -14, fleet: -3, residue: 0.30 },
    released_captives: { own: 2, rival: 11, fleet: 6, aleas: 1, residue: 0.15 },
    killed_captives:   { own: -4, rival: -26, fleet: -16, aleas: -5, residue: 0.85 },
    kept_captive:      { own: 1, rival: -9, fleet: -2, residue: 0.15 },
    our_dead:          { own: { per: -0.7 }, fleet: { per: -0.2 }, famousMult: 3, residue: 0.15 },
    their_dead:        { own: { per: 0.3 }, rival: { per: -0.5 }, fleet: { per: 0.2 },
                         famousMult: 3, residue: 0.15 },
    worthy_fight:      { own: 1, rival: 0.5, fleet: 2.5, aleas: 2, residue: 0.15 },
    hid:               { own: { per: -1 }, fleet: { per: -4 }, aleas: { per: -5 }, residue: 0.15 },
    last_ground:       { own: 5, rival: 2, fleet: 8, aleas: 7, residue: 0.15 },
    /* MEDIA DAY, at the seam. Performing before the drop is the one act here that is bought
       rather than earned — every other entry in this table is a thing that HAPPENED to you or
       that you did on the ground. So it pays the fleet, which watches everybody, and it pays
       your own ships a little for the spectacle; it does not touch the Aleas, who are not
       impressed by press, and it makes rivals' fanbases like you slightly less for showing off.
       The price is not here, because it is not a reputation price: turning up tells the other
       seven what you brought. */
    media_day:         { own: 3, rival: -1, fleet: 6, residue: 0.15 },
    /* §8.2 the address. One entry per register, so a guard can assert that every register
       moves at least one audience and none of them is a dead option. */
    said_gracious:     { rival: 7, fleet: 3, residue: 0.15 },
    said_defiant:      { own: 6, rival: -3, fleet: 1, residue: 0.15 },
    said_humble:       { own: 3, fleet: 4, aleas: 3, residue: 0.15 },
    said_deflecting:   { own: 4, aleas: -8, fleet: -2, residue: 0.15 },
    said_candid:       { own: -2, fleet: 9, aleas: -4, residue: 0.15 },
    said_evasive:      { own: -1, rival: -1, fleet: -2, aleas: -1, residue: 0.15 }
  };

  const REGISTERS = ['gracious', 'defiant', 'humble', 'deflecting', 'candid', 'evasive'];

  /* §2.6 rival fanbase starting values are GENERATED from the relationships already on file
     rather than authored a second time, so the eight-by-seven grid cannot drift from the
     data it is supposed to express. */
  const DISPOSITION = {
    kinship: 35, sympathy: 28, respect: 25, dependence: 12, leverage: -5,
    poaching: -12, friction: -15, rivalry: -18, disdain: -22, distrust: -25, hostility: -45
  };

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /* ================================================================================
     §2 — the memory, and standing computed from it
     ================================================================================ */

  /** A corp's persistent record. `profile` is an oa_profiles entry. */
  function open(profile, allProfiles, opts) {
    opts = opts || {};
    const rep = profile.reputation || {};
    const base = {
      own: rep.own != null ? rep.own : 0,
      fleet: rep.fleet != null ? rep.fleet : 0,
      aleas: rep.aleas != null ? rep.aleas : 0,
      rival: {}
    };
    /* how each OTHER corp's supporters feel about this one: their disposition toward us if
       they have declared one, otherwise a weaker mirror of ours toward them */
    for (const other of (allProfiles || [])) {
      if (other.id === profile.id) continue;
      let v = 0;
      const theirs = (other.relationships || []).filter(r => r.with === profile.id)[0];
      if (theirs) v = DISPOSITION[theirs.disposition] || 0;
      else {
        const ours = (profile.relationships || []).filter(r => r.with === other.id)[0];
        if (ours) v = Math.round((DISPOSITION[ours.disposition] || 0) * 0.5);
      }
      base.rival[other.id] = v;
    }
    return {
      corpId: profile.id,
      season: opts.season || 1,
      base: base,
      memory: [],                       // remembered acts, §2.1
      patience: (profile.finance && profile.finance.board_patience) || 50,
      calls: 0,                         // §6.5 calls on the board this season
      holds: Object.assign({ minerals: 0.5, fuels: 0.5, luxuries: 0.5, foods: 0.5 },
                           profile.holds || {}),
      goal: null,                       // §6.2, set by openSeason
      casualties: [],                   // §11 { season, permanent, famous }
      history: []                       // { season, placement, won }
    };
  }

  /** §2.1 — standing is COMPUTED, never stored. */
  function standing(rep, audience, targetId) {
    let v = audience === 'rival'
      ? (rep.base.rival[targetId] || 0)
      : (rep.base[audience] || 0);
    for (const m of rep.memory) {
      if (m.a !== audience) continue;
      if (audience === 'rival' && m.r !== targetId) continue;
      v += m.v * decay(m, rep.season);
    }
    return clamp(v, CONST.STANDING_FLOOR, CONST.STANDING_CEIL);
  }

  /** How much of a remembered act is still being felt. Residue never washes off (R8). */
  function decay(m, season) {
    const age = Math.max(0, season - m.s);
    return m.res + (1 - m.res) * Math.pow(0.5, age / m.hl);
  }

  /** Every audience at once, for the board and the viewer. */
  function readAll(rep, rivalIds) {
    const out = { own: standing(rep, 'own'), fleet: standing(rep, 'fleet'),
                  aleas: standing(rep, 'aleas'), rival: {} };
    for (const id of (rivalIds || Object.keys(rep.base.rival))) {
      out.rival[id] = standing(rep, 'rival', id);
    }
    return out;
  }

  /** §2.3 — a fanbase that hates you is a fanbase that watches you. */
  function attention(rep, rivalIds) {
    let a = 0;
    for (const id of (rivalIds || Object.keys(rep.base.rival))) a += Math.abs(standing(rep, 'rival', id));
    return a / Math.max(1, (rivalIds || Object.keys(rep.base.rival)).length);
  }

  function resolve(v, ctx) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) {
      const s = clamp(ctx.scale == null ? 0.5 : ctx.scale, 0, 1);
      return v[0] + (v[1] - v[0]) * s;
    }
    if (v.per != null) {
      const n = ctx.count || 0, fam = Math.min(n, ctx.famous || 0), mult = ctx.famousMult || 1;
      return v.per * ((n - fam) + fam * mult);
    }
    return 0;
  }

  /**
   * §3 — a corp is seen doing something. Pushes remembered acts onto the audiences that
   * care and returns what moved, so the day loop and the viewer can show the reason
   * alongside the number.
   *
   * ctx: { targetId, count, famous, scale, buyerId, rivalIds, season }
   */
  function act(rep, type, ctx) {
    ctx = ctx || {};
    const spec = ACTS[type];
    if (!spec) throw new Error('reputation: unknown act ' + type);
    const c = Object.assign({}, ctx, { famousMult: spec.famousMult || 1 });
    const season = ctx.season != null ? ctx.season : rep.season;
    const moved = [];
    const push = (audience, targetId, value) => {
      if (!value) return;
      const headline = Math.abs(value) >= CONST.HEADLINE_AT;
      rep.memory.push({
        s: season, t: type, a: audience, r: targetId || null, v: value,
        res: spec.residue, hl: headline ? CONST.MEMORY_HALFLIFE * 2 : CONST.MEMORY_HALFLIFE,
        h: headline
      });
      moved.push({ audience: audience, target: targetId || null, by: value, headline: headline });
    };
    push('own', null, resolve(spec.own, c));
    push('fleet', null, resolve(spec.fleet, c));
    push('aleas', null, resolve(spec.aleas, c));
    if (spec.rival != null) {
      const v = resolve(spec.rival, c);
      if (ctx.targetId) push('rival', ctx.targetId, v);
      else for (const id of (ctx.rivalIds || Object.keys(rep.base.rival))) push('rival', id, v);
    }
    /* §3.1 — ceding pays the buyer's supporters, who are pleased to have you */
    if (spec.buyer != null && ctx.buyerId) push('rival', ctx.buyerId, resolve(spec.buyer, c));
    foldTail(rep);
    return moved;
  }

  /**
   * §2.1 — past MEMORY_CAP acts for one audience the oldest are collapsed into the base at
   * their present value, so a save file does not grow without bound and a corp with a
   * century of history is not carrying a century of list.
   */
  function foldTail(rep) {
    const buckets = {};
    for (const m of rep.memory) {
      const k = m.a === 'rival' ? 'rival:' + m.r : m.a;
      (buckets[k] || (buckets[k] = [])).push(m);
    }
    let folded = false;
    for (const k in buckets) {
      const list = buckets[k];
      if (list.length <= CONST.MEMORY_CAP) continue;
      list.sort((a, b) => a.s - b.s);
      const excess = list.slice(0, list.length - CONST.MEMORY_CAP);
      for (const m of excess) {
        const v = m.v * decay(m, rep.season);
        if (m.a === 'rival') rep.base.rival[m.r] = (rep.base.rival[m.r] || 0) + v;
        else rep.base[m.a] = (rep.base[m.a] || 0) + v;
        m._folded = true;
        folded = true;
      }
    }
    if (folded) rep.memory = rep.memory.filter(m => !m._folded);
  }

  /** What an audience remembers, most recent and heaviest first — for the viewer. */
  function why(rep, audience, targetId, limit) {
    const out = [];
    for (const m of rep.memory) {
      if (m.a !== audience) continue;
      if (audience === 'rival' && m.r !== targetId) continue;
      out.push({ season: m.s, act: m.t, at: m.v, now: m.v * decay(m, rep.season), headline: m.h });
    }
    out.sort((a, b) => Math.abs(b.now) - Math.abs(a.now) || b.season - a.season);
    return limit ? out.slice(0, limit) : out;
  }

  /* ================================================================================
     §4 — fame
     ================================================================================ */

  /** §4.2 — killing or capturing a famous fighter moves a share of their fame. */
  function fameTransfer(victimFame, visibility) {
    const v = visibility == null ? 1 : clamp(visibility, 0, 1.5);
    return clamp((victimFame || 0) * CONST.FAME_KILL_TRANSFER * v, 0, CONST.FAME_CEIL);
  }

  function addFame(fighter, amount) {
    fighter.fame = clamp((fighter.fame || 0) + amount, CONST.FAME_FLOOR, CONST.FAME_CEIL);
    return fighter.fame;
  }

  /** §4.2 — between Divides the fleet forgets a person. */
  function decayFame(roster) {
    for (const f of roster) f.fame = clamp((f.fame || 0) * CONST.FAME_DECAY,
                                           CONST.FAME_FLOOR, CONST.FAME_CEIL);
    return roster;
  }

  /* ================================================================================
     §5 — placement
     ================================================================================ */

  /**
   * §5.1 — your finish is fixed the moment your banner stops standing, and the last banner
   * standing is first. So the first corp to sell finishes last, and a corp wiped out fighting
   * on day three finishes above a corp that sold on day two.
   *
   * `fallen` is every corp that stopped standing, EARLIEST FIRST. `winner` is the last banner.
   * `disqualified` take the bottom slots, earliest disqualification worst of all.
   */
  function placements(fallen, winner, disqualified, total) {
    const dq = disqualified || [];
    const n = total || (fallen.length + 1 + dq.length);
    const out = {};
    let slot = n;
    for (const id of dq) { out[id] = slot; slot--; }        // below last (R18)
    /* The winner is placed first BY BEING THE WINNER, not by the order they stopped standing.
       This numbered every fallen banner from last upwards and then stamped `1` on the winner
       afterwards — so whenever the winner also appeared in the fallen list, which happens when
       a banner is carried by the settlement rather than by being the last one up, two corps
       held first place and one place number went missing entirely. Measured: 1,1,2,3,4,6,7,8.
       It sat here undetected because the guard that checks it could only fail loudly once
       something else changed the outcome. */
    for (const id of fallen) {
      if (out[id] != null) continue;
      if (winner && id === winner) continue;
      out[id] = slot; slot--;
    }
    if (winner) out[winner] = 1;
    return out;
  }

  /* ================================================================================
     §6 — the board
     ================================================================================ */

  /** §6.1 — the stores drain every season and are refilled by what comes home. */
  function drainHolds(rep, scale) {
    const s = scale == null ? 1 : scale;
    for (const c of CATEGORIES) {
      rep.holds[c] = clamp((rep.holds[c] || 0) - CONST.HOLDS_DRAIN * s, 0, CONST.HOLDS_CEIL);
    }
    return rep.holds;
  }

  /**
   * §6.1 — units dug out of the ground converted to a share of a full store. ONE definition,
   * because the board's demand is written in the same units the Divide pays out in and two
   * conversions would drift. A Divide tops a store up; it does not fill one.
   * [OPEN-R1] — no calibration anchor until seasons run in numbers. A handle, not a measure.
   */
  function bankedShare(bankedUnits) {
    const out = {};
    for (const c of CATEGORIES) {
      out[c] = Math.min(CONST.HOLDS_CEIL, ((bankedUnits && bankedUnits[c]) || 0) / CONST.UNITS_PER_STORE);
    }
    return out;
  }

  /** What a Divide brought home. `banked` is { category: share of a full store }. */
  function fillHolds(rep, banked) {
    for (const c of CATEGORIES) {
      rep.holds[c] = clamp((rep.holds[c] || 0) + ((banked && banked[c]) || 0), 0, CONST.HOLDS_CEIL);
    }
    return rep.holds;
  }

  /**
   * §6.2 — the card. Five or six demands, one of them the priority, drawn against what the
   * corp is SHORT OF rather than what it is famous for (R14). Identity set where the holds
   * started; need sets what is asked for, and after two or three seasons no author is
   * deciding anything.
   */
  function goalCard(rep, planet, rng, opts) {
    opts = opts || {};
    const want = CONST.GOAL_DEMANDS[0] + (P.chance(rng, 0.5) ? 1 : 0);
    const pool = [];
    /* RE-DERIVED DURING IMPLEMENTATION. The first version put one resource demand on the card
       for EVERY category a corp was short of, at triple weight — which made resource asks
       nearly half of all demands. Measured, 61% of corps come home from a Divide having dug
       nothing at all out of the ground: there are about seven assay sites, eight corps, and
       most of them spend the month fighting instead. So a resource demand failed 96% of the
       time and eight boards sacked eight managers inside three seasons.
       A board asks for ONE thing out of the ground, for the thing it is shortest of that the
       planet actually carries, and one measure of it satisfies. */
    const shortages = CATEGORIES.slice().sort((a, b) => (rep.holds[a] || 0) - (rep.holds[b] || 0));
    for (const cat of shortages) {
      const there = (planet && planet.composition || []).filter(r => r.category === cat);
      if (!there.length) continue;
      const pick = there.slice().sort((a, b) => b.density - a.density)[0];
      pool.push({ weight: 2.2 * (1 - (rep.holds[cat] || 0)), demand: {
        kind: 'resource', category: cat, resource: pick.id,
        amount: P.roundTo(1 / CONST.UNITS_PER_STORE, 0.01)
      } });
      break;                                    /* one, not one per shortage */
    }
    const standingNow = standing(rep, 'fleet');
    /* THE CARD SCALES WITH WHERE THE CORP STANDS NOW, not only with what it was born as.
       `opts.expect` is the profile's anchor — what this board would ask of a corp at even
       standing. What it actually asks moves with the patience already banked: a board that
       has been delighted three years running expects more, and a board that has watched the
       same manager fail expects less and is easier to satisfy. Without this the demand is a
       fixed handicap, and measured over ten seasons the strongest corp bled patience from 70
       to 21 while the weakest climbed to the ceiling and stayed there, because neither card
       ever moved. */
    const anchor = opts.expect || 5;
    const ambition = clamp(Math.round(anchor - (rep.patience - CONST.AMBITION_PIVOT) / CONST.AMBITION_SCALE),
                           1, 8);
    rep.ambition = ambition; rep.anchor = anchor;
    pool.push({ weight: 2.4, demand: { kind: 'placement', at: ambition } });
    pool.push({ weight: ambition <= 2 ? 0.9 : 0.25, demand: { kind: 'win' } });
    pool.push({ weight: opts.thinTreasury ? 1.4 : 0.7,
                demand: { kind: 'surplus', amount: 10000 + Math.round(rng() * 25000) } });
    pool.push({ weight: 1.6, demand: { kind: 'losses', max: 9 + Math.floor(rng() * 8) } });
    pool.push({ weight: rep.patience < 45 ? 2.0 : 1.0, demand: { kind: 'stipend' } });
    pool.push({ weight: standingNow < 10 ? 1.6 : 0.8,
                demand: { kind: 'standing', audience: 'fleet',
                          above: Math.round(standingNow + 3) } });
    /* two more that a corp of any size can actually satisfy, so a card is a spread of
       achievable asks rather than a list of long shots */
    pool.push({ weight: 1.5, demand: { kind: 'losses', max: 13 + Math.floor(rng() * 6) } });
    pool.push({ weight: 1.2, demand: { kind: 'standing', audience: 'own',
                                       above: Math.round(standing(rep, 'own') - 4) } });

    /* One demand per KIND. The first version padded a thin card with a second `losses` and a
       second `standing` entry, and boards duly asked for "no more than 13 of ours" and "no
       more than 15 of ours" on the same card — which is not a spread of asks, it is one ask
       printed twice with the easier number making the harder one free. */
    const demands = [];
    const bag = pool.slice();
    const taken = {};
    while (demands.length < want && bag.length) {
      const idx = weightedIndex(rng, bag);
      const d = bag[idx].demand;
      bag.splice(idx, 1);
      const key = d.kind === 'standing' ? 'standing:' + d.audience : d.kind;
      if (taken[key]) continue;
      taken[key] = true;
      demands.push(d);
    }
    rep.goal = { season: rep.season, demands: demands, priority: 0 };
    /* the priority is the thing the board actually cares about, said out loud */
    rep.goal.priority = Math.floor(rng() * demands.length);

    /* R25 — THE STANDING DEMANDS.
     *
     * The card was five or six discrete asks scored met/unmet, and it had no way to say
     * *this rock is not worth much to us, keep it cheap*. So a board always wanted you to try
     * to win, a small cheap force was always a handicap and never a plan, and the choice to
     * field sixteen instead of twenty-four existed on paper only — measured, 86 of 96
     * corp-seasons fielded the full twenty-four and the ten that did not were corps that could
     * not fill one.
     *
     * These are not met or unmet. They are judged on a spectrum every season, they are always
     * on the card, and the largest is what you spent. Come in under what the board expected to
     * pay and it warms to you; overspend and it cools, whatever else you achieved. A board with
     * little interest in this planet weights thrift heavily, which is what finally makes a
     * small well-armed force a way to please somebody rather than a way to lose slowly.
     *
     * It works identically for a human manager and a computer one — nobody needs a special
     * "field small" behaviour bolted on, they are both just answering the same board.
     */
    const interest = planet && planet.pot ? clamp01((planet.pot.richness - 0.7) / 0.7) : 0.5;
    rep.goal.standing = [
      { kind: 'thrift', weight: CONST.STANDING_THRIFT_W * (1 - interest) + 0.35,
        expected: 1.0 },
      { kind: 'care', weight: CONST.STANDING_CARE_W }
    ];
    rep.goal.interest = interest;
    return rep.goal;
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /**
   * A standing demand returns a number in [-1, +1] rather than a yes or a no.
   * `spendRatio` is what the corp actually laid out against what the board expected;
   * `lossRate` is permanent losses as a share of the force it sent.
   */
  function standingScore(s, outcome) {
    if (s.kind === 'thrift') {
      const r = outcome.spendRatio != null ? outcome.spendRatio : 1;
      /* 1.0 is exactly what was expected: neutral. Half of it is a delighted board. */
      return Math.max(-1, Math.min(1, (s.expected - r) / 0.5));
    }
    if (s.kind === 'care') {
      const r = outcome.lossRate != null ? outcome.lossRate : 0.3;
      return Math.max(-1, Math.min(1, (CONST.CARE_NEUTRAL_LOSS - r) / CONST.CARE_NEUTRAL_LOSS));
    }
    return 0;
  }

  function weightedIndex(rng, bag) {
    let total = 0;
    for (const e of bag) total += Math.max(0.01, e.weight);
    let r = rng() * total;
    for (let i = 0; i < bag.length; i++) {
      r -= Math.max(0.01, bag[i].weight);
      if (r <= 0) return i;
    }
    return bag.length - 1;
  }

  /** Was a demand met? `outcome` is what the season actually produced. */
  function demandMet(d, outcome, rep) {
    switch (d.kind) {
      case 'resource':  return ((outcome.banked || {})[d.category] || 0) >= d.amount;
      case 'placement': return (outcome.placement || 99) <= d.at;
      case 'win':       return !!outcome.won;
      case 'surplus':   return (outcome.surplus || 0) >= d.amount;
      case 'losses':    return (outcome.permanentLosses || 0) <= d.max;
      case 'stipend':   return (outcome.calls != null ? outcome.calls : rep.calls) === 0;
      case 'standing':  return standing(rep, d.audience) >= d.above;
      default:          throw new Error('reputation: unscoreable demand ' + d.kind);
    }
  }

  /** §6.3 — the priority counts twice. */
  function scoreGoal(rep, outcome) {
    const g = rep.goal;
    if (!g) return { met: 0, total: 0, fraction: 0, lines: [] };
    let met = 0, total = 0;
    const lines = [];
    g.demands.forEach((d, i) => {
      const w = i === g.priority ? 2 : 1;
      const ok = demandMet(d, outcome, rep);
      total += w; if (ok) met += w;
      lines.push({ demand: d, priority: i === g.priority, met: ok });
    });
    /* R25 — and the standing demands, which are not met or unmet. Each returns a number in
       [-1, +1] and contributes its weight in both directions, so a board can be pleased by a
       thrifty year that achieved little and annoyed by an expensive one that achieved a lot. */
    const standingLines = [];
    for (const s of (g.standing || [])) {
      const v = standingScore(s, outcome);
      total += s.weight;
      met += s.weight * (v + 1) / 2;       /* -1 scores nothing, +1 scores the full weight */
      standingLines.push({ demand: s, standing: true, value: v, met: v > 0 });
    }
    return { met: met, total: total, fraction: total ? met / total : 0,
             lines: lines.concat(standingLines) };
  }

  /** §6.3/§6.4 — what the board makes of it, cushioned by your own ships. */
  function movePatience(rep, score) {
    /* `content` was GOAL_CONTENT/6 — four demands met out of six — which stopped meaning
       anything the moment the card became three or four discrete asks plus two standing ones.
       Left derived, it sat at 0.667, exactly the median score, so half the fleet fell below it
       every season and all eight corps drifted down together. It is a stated number now. */
    /* R25b — THE VERDICTS HAVE TO MATCH THEIR OWN NAMES.
     *
     * These thresholds were magic numbers set against a score distribution that has since
     * stopped existing twice over — once when the card gained its standing demands, and again
     * when the grid became the engagement model and pushed the fleet's loss rate from 0.398 to
     * 0.496. Measured against them: "asking questions" and "unhappy" together were **27% of
     * all corp-seasons**, and "delighted" was 0%. A board was more likely to be furious than
     * pleased, patience drained at two points a season across the whole fleet, and every corp
     * in the league trended the same way — which is what S7 catches.
     *
     * A verdict named "asking questions" has to be rare or it is not a warning, it is the
     * weather. The cuts are anchored to the measured distribution of card scores so the words
     * mean roughly what they say: delighted is the top twentieth, content is about half, and
     * the bottom two together are a twentieth. */
    const f = score.fraction, content = CONST.GOAL_CONTENT_FRACTION;
    const B = CONST.BOARD_CUTS;
    let delta;
    if (f >= B.delighted) delta = 14;
    else if (f >= B.pleased) delta = 7;
    else if (f >= content) delta = 1;
    else if (f >= B.disappointed) delta = -8;
    else if (f >= B.unhappy) delta = -16;
    else delta = -26;
    let band = delta >= 7 ? 'delighted' : delta >= 1 ? (delta === 1 ? 'content' : 'pleased')
             : delta >= -8 ? 'disappointed' : delta >= -16 ? 'unhappy' : 'asking questions';
    if (delta === 14) band = 'delighted'; else if (delta === 7) band = 'pleased';
    if (delta > 0) {
      /* CREDIT IS SCALED BY WHAT WAS ASKED.
         §6.1a made the card soften as patience falls, which was right and had a consequence
         that had to be constructed to be seen: a corp on the floor got the easiest possible
         card, cleared it by merely turning up, and gained patience every season forever. The
         bottom became an attractor and dismissal became unreachable — the fail state S12
         hangs the whole career on could not fire at all.
         Meeting a trivial ask is therefore worth almost nothing. A corp at the floor can hold
         station; it cannot climb out without being asked for something and delivering it. */
      /* measured against the ANCHOR, not against zero: a corp asked for exactly what its
         board would ask at even standing earns full credit, so the middle of the range is
         neutral and the fleet does not bleed. Only the discount a FALLEN corp gets — a card
         softened below its own anchor — is worth less to clear. */
      const slack = (rep.ambition != null ? rep.ambition : 5) - (rep.anchor != null ? rep.anchor : 5);
      const ease = clamp(slack, 0, CONST.EASY_CARD_SPAN) / CONST.EASY_CARD_SPAN;
      delta *= (1 - CONST.EASY_CARD_DISCOUNT * ease);
    }
    if (delta < 0) {
      /* a manager the ships love is hard to sack for the same result */
      delta *= (1 - CONST.HOME_CUSHION * Math.max(0, standing(rep, 'own')) / CONST.STANDING_CEIL);
    }
    rep.patience = clamp(rep.patience + delta, CONST.PATIENCE_FLOOR, CONST.PATIENCE_CEIL);
    return { delta: Math.round(delta * 10) / 10, band: band, patience: rep.patience };
  }

  /**
   * §6.5 — the money is always there, and taking it is what gets you sacked. This is where
   * the difficulty gradient lives: the hardest start is not the one that ends its seasons
   * poorest, it is the one that has to keep asking.
   */
  function callOnBoard(rep, amount) {
    if (!(amount > 0)) return { amount: 0, patienceCost: 0, patience: rep.patience };
    const cost = CONST.CALL_PATIENCE_RATE * (amount / 10000)
               * (1 + CONST.CALL_ESCALATOR * rep.calls);
    rep.calls++;
    rep.patience = clamp(rep.patience - cost, CONST.PATIENCE_FLOOR, CONST.PATIENCE_CEIL);
    return { amount: amount, patienceCost: Math.round(cost * 100) / 100, patience: rep.patience };
  }

  /* ================================================================================
     §11 — the mercenary price. A price, not an audience.
     ================================================================================ */

  function recordCasualties(rep, permanent, famous) {
    rep.casualties.push({ season: rep.season, permanent: permanent || 0, famous: famous || 0 });
    return rep;
  }

  /** Recency-weighted permanent losses per Divide. */
  function mercIndex(rep) {
    let num = 0, den = 0;
    for (const c of rep.casualties) {
      const w = Math.pow(0.5, Math.max(0, rep.season - c.season) / CONST.MERC_INDEX_HALFLIFE);
      num += w * (c.permanent + c.famous * 2);   // spending a famous fighter costs more
      den += w;
    }
    return den ? num / den : 0;
  }

  /** What the market charges this corp, against what it charges the fleet. */
  function mercPriceMult(rep, fleetMean) {
    const m = fleetMean > 0 ? fleetMean : 1;
    const idx = mercIndex(rep);
    return clamp(1 + CONST.MERC_PRICE_SWING * (idx - m) / m, 0.6, 1.8);
  }

  /* ================================================================================
     §10 — the premium and the wall
     ================================================================================
     THE DELETED CONSTANTS LIVED HERE. There is deliberately no credit figure anywhere in
     this section. What a corp computes is how much standing an act costs it, how much
     standing it can currently afford to lose, and the ratio between the two. The ratio
     multiplies an asking price and, past UGLY_WALL, ends the conversation.
     ================================================================================ */

  /**
   * How much this act would hurt, in standing points, weighted by what THIS corp cares
   * about. No new personality data: showmanship weights the wider fleet, tradition weights
   * the rival fanbases and the Aleas, and a corp low on patience weights its own ships
   * heavily because they are what is keeping it employed.
   */
  function damageOf(rep, type, ctx, dials) {
    const spec = ACTS[type];
    if (!spec) throw new Error('reputation: unknown act ' + type);
    const c = Object.assign({}, ctx || {}, { famousMult: spec.famousMult || 1 });
    const show = (dials && dials.showmanship || 50) / 100;
    const trad = (dials && dials.tradition || 50) / 100;
    const desperate = 1 - rep.patience / CONST.PATIENCE_CEIL;
    const w = {
      own: 0.7 + 0.8 * desperate,
      fleet: 0.6 + 0.9 * show,
      aleas: 0.5 + 0.7 * trad,
      rival: 0.4 + 0.6 * trad
    };
    let d = 0;
    d += w.own * Math.min(0, resolve(spec.own, c));
    d += w.fleet * Math.min(0, resolve(spec.fleet, c));
    d += w.aleas * Math.min(0, resolve(spec.aleas, c));
    d += w.rival * Math.min(0, resolve(spec.rival, c));
    return -d;                          // positive is bad
  }

  /** How much ugliness this corp can currently afford. */
  function tolerance(rep, dials, goalAtRisk) {
    const show = (dials && dials.showmanship || 50) / 100;
    const risk = clamp(goalAtRisk == null ? 0 : goalAtRisk, 0, 1);
    return CONST.TOLERANCE_BASE
         * (0.35 + 0.90 * rep.patience / CONST.PATIENCE_CEIL)
         * (0.75 + 0.50 * Math.max(0, standing(rep, 'own')) / CONST.STANDING_CEIL)
         * (1.25 - 0.50 * show)
         * (1 + 0.35 * risk);           // a card already blown is a card you stop guarding
  }

  /**
   * The whole of what replaces the exchange rate. `premium` multiplies what a corp asks
   * for; `wall` ends the conversation. A corp whose board has been happy for three years
   * takes an ugly deal cheaply; one on its last warning fights a battle it expects to lose
   * rather than take the same deal — same numbers on the table, different answer.
   */
  function priceOfBeingSeen(rep, type, ctx, dials, goalAtRisk) {
    const damage = damageOf(rep, type, ctx, dials);
    const tol = Math.max(0.5, tolerance(rep, dials, goalAtRisk));
    const ratio = damage / tol;
    return {
      damage: damage,
      tolerance: tol,
      ratio: ratio,
      wall: ratio > CONST.UGLY_WALL,
      premium: 1 + (CONST.UGLY_PREMIUM_MAX - 1) * Math.min(1, ratio / CONST.UGLY_WALL)
    };
  }

  /* ================================================================================
     §8 — the address
     ================================================================================ */

  /* §8.2 — the question is drawn from what actually happened; the answers come from a
     standing vocabulary reused across every event, so the content is authored once. */
  const QUESTIONS = [
    { id: 'sold_early',  when: o => o.ceded && o.cededDay <= 5,
      ask: "You had a full roster and you sold your claim in the first week. What do you say to the people who paid to watch?" },
    { id: 'sold_late',   when: o => o.ceded,
      ask: "You took the deal. Was there a point where you knew you were going to?" },
    { id: 'wiped',       when: o => o.permanentLosses >= 14,
      ask: "You lost most of the people you dropped with. Was it worth it?" },
    { id: 'won',         when: o => o.won,
      ask: "The planet is yours. Who paid for it?" },
    { id: 'near_miss',   when: o => o.placement === 2,
      ask: "Second. Closer than anyone expected. Does that count for anything?" },
    { id: 'lost_famous', when: o => o.famousLosses > 0,
      ask: "You went down there with a name the fleet knew, and you came back without them." },
    { id: 'quiet',       when: () => true,
      ask: "Another Divide, another finish outside the frame. What changes next year?" }
  ];

  /** What the press ask this corp, given what its Divide actually was. */
  function question(outcome) {
    for (const q of QUESTIONS) if (q.when(outcome || {})) return q;
    return QUESTIONS[QUESTIONS.length - 1];
  }

  /**
   * §8.2 — the six registers, always all six. None is correct; each is the right answer to
   * some situation and the wrong answer to another. A manager is never scored on delivery,
   * because the manager is not a character with stats — what they choose is a stance, and
   * the audiences do the rest.
   *
   * `speaker` is optional: the fighter or captain put in front of the drones. The traits
   * written for exactly this and read by nothing until now change what the register lands as.
   */
  function address(rep, register, ctx) {
    ctx = ctx || {};
    if (REGISTERS.indexOf(register) < 0) throw new Error('reputation: no such register ' + register);
    const type = 'said_' + register;
    const sp = ctx.speaker || null;
    /* Read by HOOK. `ctx.hooks` is a Set supplied by the caller, who has the trait index;
       this module deliberately does not load traits.json. */
    const h = ctx.hooks || new Set();
    let amp = 1;
    if (h.has('media_statement_impact_amplified')) amp *= 1.6;   // every line fits a chyron
    if (h.has('media_statements_flat')) amp *= 0.45;             // and both clips are famous
    if (h.has('rare_quote_fame_spike')) amp *= 1.3;
    if (h.has('fame_volatility_up')) amp *= 1.4;
    if (h.has('fame_gain_down')) amp *= 0.6;
    /* fame carries a statement further: the fleet hears a name it knows */
    if (sp) amp *= 1 + 0.5 * ((sp.fame || 0) / CONST.FAME_CEIL);
    const spec = ACTS[type];
    const moved = [];
    const season = ctx.season != null ? ctx.season : rep.season;
    const push = (audience, targetId, v) => {
      if (!v) return;
      const value = v * amp;
      rep.memory.push({ s: season, t: type, a: audience, r: targetId || null, v: value,
                        res: spec.residue, hl: CONST.MEMORY_HALFLIFE,
                        h: Math.abs(value) >= CONST.HEADLINE_AT });
      moved.push({ audience: audience, target: targetId || null, by: value });
    };
    push('own', null, spec.own);
    push('fleet', null, spec.fleet);
    push('aleas', null, spec.aleas);
    if (spec.rival != null) {
      if (ctx.targetId) push('rival', ctx.targetId, spec.rival);
      else for (const id of (ctx.rivalIds || Object.keys(rep.base.rival))) push('rival', id, spec.rival);
    }
    foldTail(rep);
    return { register: register, amplified: amp, moved: moved };
  }

  /**
   * §8.3 — some answers do something beyond moving an audience. Only the consequences this
   * step can HONOUR are listed as available: benching a fighter means nothing while rosters
   * are regenerated every Divide, so it is designed (§8.3) and deliberately not offered here.
   * A choice that quietly does nothing is the failure this project keeps catching.
   */
  function addressOptions(rep, outcome) {
    return REGISTERS.map(function (r) {
      const spec = ACTS['said_' + r];
      return {
        register: r,
        moves: { own: spec.own || 0, rival: spec.rival || 0,
                 fleet: spec.fleet || 0, aleas: spec.aleas || 0 }
      };
    });
  }

  /* ================================================================================
     the season boundary — the only thing in the project that crosses one
     ================================================================================ */

  function openSeason(rep, planet, rng, opts) {
    rep.calls = 0;
    drainHolds(rep, (opts && opts.drainScale) || 1);
    goalCard(rep, planet, rng, opts);
    return rep;
  }

  function closeSeason(rep, outcome) {
    const score = scoreGoal(rep, outcome || {});
    const moved = movePatience(rep, score);
    fillHolds(rep, (outcome && outcome.banked) || {});
    recordCasualties(rep, (outcome && outcome.permanentLosses) || 0,
                          (outcome && outcome.famousLosses) || 0);
    rep.history.push({ season: rep.season, placement: (outcome && outcome.placement) || null,
                       won: !!(outcome && outcome.won) });
    rep.season++;
    return { score: score, board: moved };
  }

  const api = {
    CONST, ACTS, AUDIENCES, CATEGORIES, REGISTERS, DISPOSITION,
    open, standing, readAll, attention, act, why, decay, foldTail,
    fameTransfer, addFame, decayFame,
    placements,
    drainHolds, fillHolds, bankedShare, goalCard, demandMet, scoreGoal, movePatience, callOnBoard,
    recordCasualties, mercIndex, mercPriceMult,
    damageOf, tolerance, priceOfBeingSeen,
    QUESTIONS, question, address, addressOptions, standingScore,
    openSeason, closeSeason
  };
  if (isNode) module.exports = api;
  global.CDREP = api;
})(typeof window !== "undefined" ? window : globalThis);
