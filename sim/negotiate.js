/* Capital Divide — /sim/negotiate.js  (Step 6)
 *
 * The table: §2 the pot · §5 the odds board and price · §6.12 appetite · §9 captives ·
 * §10.3 settlement. The one deal struck over the wire is a ransom; the Withdrawal is priced in
 * divide.js against the board this file keeps.
 *
 * WHAT THIS OWNS: what a deal is worth and who is paid at the end.
 * WHAT THIS DOES NOT OWN: the ending itself. A Divide ends when one banner is left standing
 * (N18) and that is the day loop's business — `divide.js` decides when the shooting stops,
 * this file decides what it was worth. Nothing here adjudicates a winner, scores a corp, or
 * breaks a tie, because under N18 there are no ties to break.
 *
 * Pure logic: no DOM, no Math.random, no I/O. Every roll takes an injected rng.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const REP = isNode ? require('./reputation.js') : global.CDREP;

  const CONST = {
    /* §2.1 the pot — sized against the annual board grants in oa_profiles (130k–290k) and
       an Aleas entry fee of 40k. A solo win is roughly five years of funding for a rich corp
       and ten for a poor one. */
    POT_BASE: 400000,                   // [H] credits: the desk's share of a planet (ruled 1.2M → 400k). The OA's cut of the rights is billions and none of the manager's; this is the Divide's purse, and the Withdrawal's promises are paid out of it
    POT_RICHNESS: [0.70, 1.40],         // [C] rolled with the planet
    HAUL_VALUE: 22000,
    /* [H] §PRIZE what the fleet pays for one FULL HOLD of a store an OA cannot keep — the
       surplus of a store already full. Sized so a won planet's overflow is worth having. */
    SURPLUS_VALUE: 30000,                  // [H] §2.2 what the fleet pays for a unit an OA sells on (ruled 220k → 30k: the overflow was a second pot)

    /* §2.3 the winner's bonuses — winner's own roster only (N14) */
    WIN_BONUS_MERC: 8,                  // [C] x monthly salary
    /* natties take their death benefit, paid to the living fighter; prisoners are freed */

    /* §5.2 the odds board */
    ODDS_SHARPNESS: 1.6,                // [H] above 1, a lead is worth more than its size
    ODDS_QUIET_BONUS: 0.22,             // [C] a corp nobody has seen fighting is overrated
    ODDS_KIT_WEIGHT: 0.38,              // [C] how much visible gear moves the board
    KIT_REFERENCE_PER_BODY: 1750,       // [C] the fleet's middling loadout, the board's yardstick
    INJURED_WEIGHT: 0.45,               // [C] a body in the camp tent is worth something

    BANNER_SHAME: 0.22,                 // [C] §5.3b what the fleet's regard for an OA moves its price
    /* §5.3 — what a body costs to lose is REAL money and nothing else: the death benefit written
       into that fighter's own contract, the signing cost already sunk into them, and the signing
       cost of whoever replaces them. A life has no price beyond that (REPUTATION.md R3). */
    REPLACEMENT_SIGNING: 1.00,          // [C] §10.3 recruiting the body that fills the gap

    /* §9 captives — §6.13 a ransom is asked at what the body is worth to lose (pension plus
       the replacement), marked up, and the owner pays when it wants him back — more when it
       means to keep fighting. */
    RANSOM_MARKUP: 1.25,                // [H] the captor asks this much over what the body costs to replace
    RANSOM_PAYS_UP_TO: 1.6,             // [H] an owner pays up to this much of the body's worth, at appetite 1
    RANSOM_FAME: 0.02,                  // [C] per point of fame, on both
    /* §4.1 what a unit of a category is worth to an OA, by its own WANT: a board short of food
       pays dearly for food and gives up minerals it does not need cheaply */
    RESOURCE_WANT_BASE: 0.55,           // [C] what a full-hold, unasked category is worth, as a fraction of HAUL_VALUE
    RESOURCE_WANT_SHORT: 1.10,          // [C] added at an empty hold, scaling with the shortage
    RESOURCE_WANT_ASKED: 0.80,          // [C] added when the board's card asks for the category
    RESOURCE_WANT_PRIORITY: 1.60,       // [C] instead of ASKED, when it is the card's priority
    /* [H] §6 how heavily an OA weighs what a leaver ASKS against the odds his going buys it:
       above 1 it is stingy, below 1 it buys peace cheaply. */
    CONCESSION_ASK_WEIGHT: 1.0,
    /* §6.12 APPETITE — how much an OA wants to keep fighting THIS Divide, one number from what
       it knew going in and what has happened since: the board's demands, its interest in the
       planet's resources, its squads' health, its combats so far, and its strength now against
       its strength at the drop. Stance is NOT in it — stance already governs how much Divide an
       OA goes looking for. Appetite is what an owner will pay to have a captive back. */
    APPETITE_BOARD_WIN: 0.15,           // [H] a board that demanded a win or a placement, while it still can
    APPETITE_BOARD_RESOURCE: 0.20,      // [H] a board that demanded what this planet holds
    APPETITE_BOARD_FLEET: 0.10,         // [H] a board that wants fleet standing (held_out is liked)
    APPETITE_BOARD_OWN: -0.15,          // [H] a board that wants its own people's regard (they hate dead)
    APPETITE_BOARD_STIPEND: -0.10,      // [H] a board that wants money — a share in hand beats a chance
    APPETITE_PRIORITY: 1.5,             // [C] the demand the board said out loud counts this much more
    APPETITE_RESOURCE: 0.15,            // [H] at most, for wanting the planet's categories more than the
                                        //     rest of the fleet does (relative: the first cut read every
                                        //     OA against a base and pinned all of them at the cap)
    APPETITE_HEALTH: 0.30,              // [H] taken off at 60% mean health, linearly from 100
    APPETITE_COMBAT: 0.12,              // [H] at ±3 net fights won this Divide
    APPETITE_STRENGTH: 0.15,            // [H] at half or one-and-a-half the odds it dropped with
    APPETITE_FLOOR: 0.45, APPETITE_CAP: 1.8,
    RIVAL_PRICE: 0.20                   // [C] what an OA's LIVING opinion of you moves its price, at ±100
  };

  /* ------------------------------------------------------------------ */
  /* §2.1 the pot                                                        */
  /* ------------------------------------------------------------------ */

  /* Archetype leans. A rich planet draws more desperate deals, which is the only reason
     rolling it is worth doing at all. */
  const RICHNESS_LEAN = {
    dead_industrial: 1.18, volcanic_waste: 1.12, jungle_cradle: 1.06,
    drowned_world: 1.00, ice_shelf: 0.90, desert_pan: 0.86
  };

  /**
   * REPUTATION.md §7.3 — the pot reads the planet's richness, it does not roll its own.
   * Before Step 7 this rolled a number beside the composition, and two independent numbers
   * both saying how good a world is are two numbers that drift apart. `richness` now comes
   * out of what is actually down there (`map.js richnessOf`), and this multiplies it.
   * The lean table is kept ONLY for the fallback: a caller with no planet.
   */
  function rollPot(rng, archetypeId, planetRichness) {
    const lo = CONST.POT_RICHNESS[0], hi = CONST.POT_RICHNESS[1];
    let richness;
    if (planetRichness != null) {
      richness = Math.max(lo, Math.min(hi, planetRichness));
    } else {
      const lean = RICHNESS_LEAN[archetypeId] != null ? RICHNESS_LEAN[archetypeId] : 1.00;
      richness = Math.max(lo, Math.min(hi, (lo + rng() * (hi - lo)) * lean));
    }
    return { value: Math.round(CONST.POT_BASE * richness), richness: richness };
  }

  /* ------------------------------------------------------------------ */
  /* §5.1 force, §5.2 the odds board                                     */
  /* ------------------------------------------------------------------ */

  /** What a single corp is worth on the field, in bodies. */
  function corpForce(corp) {
    let active = 0, injured = 0;
    for (const b of corp.allBodies) {
      if (b.status === 'active') active++;
      else if (b.status === 'injured') injured++;
    }
    let f = active + CONST.INJURED_WEIGHT * injured;
    /* supply and condition — private, so only the corp's own valuation sees the truth */
    let dry = 0, n = 0;
    for (const sq of corp.squads) { n++; if (sq.rationDry) dry++; }
    if (n) f *= (1 - 0.20 * (dry / n));
    return f;
  }

  /**
   * §5.2 — what the FLEET believes, which is not what is true. Wounds, supply and morale
   * are private, so the board reads bodies it has seen fall and fights it has seen aired.
   * A corp that has kept out of the news is systematically overrated, and that overrating
   * IS the careful corp's negotiating position.
   */
  function believedForce(corp, meanEngagements) {
    /* What the audience can actually see. Deaths are confirmed on air, and so is a capture —
       the cameras watch someone being taken. Wounds are NOT: a corp walking fifteen wounded
       reads as fifteen healthy bodies, and is overrated by exactly the people bargaining
       with it. Captures used to count toward apparent strength, which meant a corp could
       lose people live on air and look no weaker for it. */
    let seen = 0;
    for (const b of corp.allBodies) {
      if (b.status === 'dead' || b.status === 'retired' || b.status === 'captured') continue;
      seen++;
    }
    let f = seen;
    /* MEDIA DAY IS PAID FOR HERE. A corp that performed the week of the drop was watched doing
       it, so the fleet's estimate of them is sharper — the guesswork this function exists to
       model is exactly what they gave away. `_mediaReveal` was set at the seam and read by
       nothing, so the concealment cost the design named did not exist; performing was free
       standing. It pulls the belief toward the truth by the fraction they revealed. */
    if (corp._mediaReveal) f += (corpForce(corp) - f) * corp._mediaReveal;
    /* Kit is PUBLIC. It is a broadcast sport: the audience can see who is carrying a Phase
       Lance and who is carrying their grandfather's rifle, so the odds board sees it too.
       Added when gear stopped being uniform — before that every corp fielded within three
       credits of the cap, so there was nothing to see. Without this the board counted heads
       and the worst-equipped corp in the fleet negotiated from the same position as the
       best, which made the whole underdog spread invisible at the table. */
    const perBody = corp.allBodies.length ? (corp.kitValue || 0) / corp.allBodies.length : 0;
    const cap = CONST.KIT_REFERENCE_PER_BODY;
    if (perBody > 0) f *= (1 - CONST.ODDS_KIT_WEIGHT) + CONST.ODDS_KIT_WEIGHT * (perBody / cap) * 2;
    const quiet = meanEngagements > 0 ? Math.max(0, 1 - corp.engagements / meanEngagements) : 0;
    return f * (1 + CONST.ODDS_QUIET_BONUS * quiet);
  }

  /**
   * The odds board over the OAs standing. `umbrellas` is a list of { principal, members }
   * (one OA each). Returns a map of OA id → probability of winning the planet.
   */
  function oddsBoard(umbrellas, opts) {
    opts = opts || {};
    const mean = opts.meanEngagements || 0;
    const raw = {}; let tot = 0;
    for (const u of umbrellas) {
      let f = 0;
      for (const c of u.members) f += believedForce(c, mean);
      const w = Math.pow(Math.max(0.0001, f), CONST.ODDS_SHARPNESS);
      raw[u.principal.id] = w; tot += w;
    }
    const out = {};
    for (const k in raw) out[k] = tot > 0 ? raw[k] / tot : 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* §5.3 price                                                          */
  /* ------------------------------------------------------------------ */

  const dial = (c, k) => ((c.profile && c.profile.dials && c.profile.dials[k]) || 50) / 100;


  function relationship(a, b) {
    const rs = (a.profile && a.profile.relationships) || [];
    const r = rs.find(x => x.with === b.id);
    return r ? r.disposition : null;
  }

  /* Relationships move the PRICE, they do not forbid the deal — except where tradition is
     high enough to make a grudge a matter of identity. */
  const HOSTILE = ['hostility', 'distrust', 'rivalry', 'disdain', 'friction'];
  const WARM = ['kinship', 'respect', 'sympathy', 'dependence'];

  function priceModifier(from, to) {
    const d = relationship(from, to);
    let v = 1.00;
    if (d && HOSTILE.indexOf(d) >= 0) v = 1.00 + 0.30 * (1 + dial(from, 'tradition'));
    else if (d && WARM.indexOf(d) >= 0) v = 1.00 - 0.18 * (1 + dial(from, 'tradition')) / 2;
    /* §6.4 WHAT THEY REMEMBER OF YOU. The relationships above are the profiles' — written once
       and never moved by anything that happens. What `to`'s people actually think of `from`
       today is in `from.rep` under `to`'s name (how each other OA's supporters feel about
       this one), and it moves with every act at the table: an OA you spared asks less of
       you, an OA you left to die asks more, or will not deal at all. */
    const living = livingRegard(from, to);          /* how `from` feels about `to` */
    if (living != null) v *= 1 - living / 100 * CONST.RIVAL_PRICE;
    /* §5.3b the fleet's regard for `to` is a real part of its price: an OA the fleet despises
       pays for the shame of dealing with it */
    const fleetRep = to && to.rep && to.rep.base ? (to._fleetStanding != null ? to._fleetStanding : null) : null;
    if (fleetRep != null) v *= 1 - Math.max(-CONST.BANNER_SHAME, Math.min(CONST.BANNER_SHAME, (fleetRep - 50) / 50 * CONST.BANNER_SHAME));
    return v;
  }

  /* HOW `who` FEELS ABOUT `about`, today. The memory lives on the OA that ACTED: `x.rep`
     keeps, per other OA, how that house regards x. So what `who` thinks of `about` is read off `about.rep` under
     `who`'s name — 0..100, returned here as −100..100 around indifference, the span this module's prices were set
     on; null when nobody has an opinion. */
  function livingRegard(who, about) {
    if (!who || !about || !about.rep || !REP || !REP.standing) return null;
    if (!about.rep.base || !about.rep.base.houses || about.rep.base.houses[who.id] == null) return null;
    const v = (REP.standing(about.rep, 'house', who.id) - 50) * 2;
    return typeof v === 'number' && isFinite(v) ? Math.max(-100, Math.min(100, v)) : null;
  }

  function refusesOutright(from, to) {
    const d = relationship(from, to);
    if (HOSTILE.indexOf(d) >= 0 && d === 'hostility' && dial(from, 'tradition') > 0.75) return true;
    /* §6.4 an OA that was left to die by this one, and has not forgotten */
    const living = livingRegard(from, to);
    return living != null && living <= -60 && dial(from, 'tradition') > 0.5;
  }

  /* ------------------------------------------------------------------ */
  /* §6.12 appetite                                                      */
  /* ------------------------------------------------------------------ */

  /* §4.1 what a category is worth to an OA, per unit banked, in credits */
  function wantOf(corp, category) {
    const rep = corp.rep || {};
    const hold = Math.max(0, Math.min(1, (rep.holds || {})[category] != null ? rep.holds[category] : 0.5));
    let w = CONST.RESOURCE_WANT_BASE + CONST.RESOURCE_WANT_SHORT * (1 - hold);
    const g = rep.goal || {};
    (g.demands || []).forEach((d, i) => {
      if (d.kind === 'resource' && d.category === category)
        w += i === g.priority ? CONST.RESOURCE_WANT_PRIORITY : CONST.RESOURCE_WANT_ASKED;
    });
    return w * CONST.HAUL_VALUE;
  }
  /**
   * §6.12 APPETITE: how much this OA wants to keep fighting this Divide. 1.0 is indifferent.
   * Read by `ransomWorthPaying`. Everything it reads is on the corp or in the context.
   */
  function appetite(corp, ctx) {
    let a = 1.0;
    const why = {};
    /* strength now against the field — a board's hunger for a win means "hold if you can";
       an OA at a tenth of the favourite's odds is not held by it, it is already disappointed */
    const me = ctx.principalOf ? ctx.principalOf(corp).id : corp.id;
    const now = (ctx.odds || {})[me] || 0;
    const best = Math.max.apply(null, Object.keys(ctx.odds || {}).map(k => ctx.odds[k]).concat([1e-6]));
    const canStill = Math.min(1, now / Math.max(1e-6, best) * 2);
    /* what the planet holds: the categories of its sites, as the table already reads them */
    const cats = {};
    for (const o of ((ctx.planet || {}).objectives || [])) {
      if (o.type !== 'resource_site' || !o.resource || !ctx.categoryOf) continue;
      const c = ctx.categoryOf(o.resource); if (c) cats[c] = (cats[c] || 0) + (o.potency || 1);
    }
    /* the board's expectations */
    const goal = (corp.rep && corp.rep.goal) || {};
    (goal.demands || []).forEach((d, i) => {
      const w = i === goal.priority ? CONST.APPETITE_PRIORITY : 1;
      let v = 0;
      if (d.kind === 'win' || d.kind === 'placement') v = CONST.APPETITE_BOARD_WIN * canStill;
      else if (d.kind === 'resource' && cats[d.category]) v = CONST.APPETITE_BOARD_RESOURCE;
      else if (d.kind === 'standing' && d.audience === 'fleet') v = CONST.APPETITE_BOARD_FLEET;
      else if (d.kind === 'standing' && d.audience === 'own') v = CONST.APPETITE_BOARD_OWN;
      else if (d.kind === 'stipend') v = CONST.APPETITE_BOARD_STIPEND;
      a += v * w; if (v) why.board = (why.board || 0) + v * w;
    });
    /* interest in what the planet holds, against the rest of the fleet's interest in it */
    const fleet = (ctx.corps || []).filter(c => c !== corp);
    let tot = 0, wsum = 0;
    for (const c in cats) {
      const mine = wantOf(corp, c);
      const theirs = fleet.length ? fleet.reduce((t, x) => t + wantOf(x, c), 0) / fleet.length : mine;
      tot += cats[c]; wsum += cats[c] * (mine - theirs) / Math.max(0.01, theirs);
    }
    if (tot > 0) {
      why.resource = Math.max(-CONST.APPETITE_RESOURCE, Math.min(CONST.APPETITE_RESOURCE, (wsum / tot) * CONST.APPETITE_RESOURCE * 2));
      a += why.resource;
    }
    /* the squads' health: who is still standing of those dropped, and how well */
    const bodies = (corp.allBodies || []);
    const active = bodies.filter(b => b.status === 'active');
    if (bodies.length) {
      const standing = active.length / bodies.length;
      const cond = active.length
        ? active.reduce((t, b) => t + (((b.condition || {}).health != null) ? b.condition.health : 100), 0) / active.length / 100 : 0;
      const h = standing * 0.7 + cond * 0.3;                /* 1 = everybody up and whole */
      why.health = -CONST.APPETITE_HEALTH * Math.max(0, Math.min(1, (1 - h) / 0.4));
      a += why.health;
    }
    /* the combats so far */
    let net = 0;
    for (const id in (corp._contact || {})) { const r = corp._contact[id]; net += (r.beat || 0) - (r.lostTo || 0); }
    why.combat = CONST.APPETITE_COMBAT * Math.max(-1, Math.min(1, net / 3));
    a += why.combat;
    /* strength now against strength at the drop */
    const open = corp._openingOdds;
    if (open > 0) {
      const ratio = now / open;
      why.strength = ratio < 1 ? -CONST.APPETITE_STRENGTH * Math.min(1, (1 - ratio) / 0.5)
                               : CONST.APPETITE_STRENGTH * Math.min(1, (ratio - 1) / 0.5);
      a += why.strength;
    }
    a = Math.max(CONST.APPETITE_FLOOR, Math.min(CONST.APPETITE_CAP, a));
    return { value: a, why: why };
  }



  /* ------------------------------------------------------------------ */
  /* §9 captives                                                         */
  /* ------------------------------------------------------------------ */

  /* what one body costs its OA to lose: the pension the contract promises and the signing it
     takes to replace him */
  function bodyWorth(fighter) {
    const c = (fighter && fighter.contract) || {};
    return ((c.death_benefit || 0) + (c.signing_cost || 0) * (1 + CONST.REPLACEMENT_SIGNING))
         * (1 + CONST.RANSOM_FAME * (fighter.fame || 0));
  }
  function ransomPrice(fighter) {
    return Math.round(Math.max(300, bodyWorth(fighter)) * CONST.RANSOM_MARKUP);
  }

  /**
   * N10 — a captive can be bought back DURING the games, as its own small deal.
   * THE CAPTOR'S SIDE: will it sell him back, and for how much. Null when it will not. The
   * captor weighs cash now against a body it can kill, keep, or hand back later for nothing:
   * thrift takes the money; aggression would rather have the prisoner.
   */
  function ransomOffer(rng, captor, owner, fighter, ctx) {
    if (ctx.sealed(captor)) return null;          /* N11 — they do not do deals, of any size */
    if (refusesOutright(captor, owner)) return null;   /* §6.4 they will not deal with this OA */
    /* §6.13 asked at the body's worth marked up, moved by what the captor thinks of the owner */
    const price = Math.round(ransomPrice(fighter) * priceModifier(captor, owner));
    const keenToKeep = 0.5 * dial(captor, 'aggression') + 0.3 * (1 - dial(captor, 'thrift'));
    if (rng() < keenToKeep) return null;
    return { kind: 'ransom', captor: captor.id, owner: owner.id,
             fighter: fighter.id, price: price, day: ctx.day, worth: Math.round(Math.max(300, bodyWorth(fighter))) };
  }
  /* THE OWNER'S SIDE: is he worth that to them — up to a multiple of what the man costs to
     replace, more when it means to keep fighting (appetite), and only from money it has. A
     manager answers this himself, on the window (divide.js). */
  function ransomWorthPaying(owner, fighter, price, ctx) {
    const worth = Math.max(300, bodyWorth(fighter));
    const app = ctx.corps ? appetite(owner, ctx).value : 1;
    const ceiling = worth * CONST.RANSOM_PAYS_UP_TO * (0.5 + 0.5 * app);
    if (price > ceiling) return false;
    /* the Divide's corp carries its season account under `persist` (one treasury, SEASONS.md) */
    const acct = (owner.persist && owner.persist.account) || owner.account || null;
    return !(acct && acct.treasury < price);
  }
  /* ------------------------------------------------------------------ */
  /* §10.3 settlement                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Pay everyone. `winnerId` is the last banner standing, or null if the contest somehow
   * failed to resolve — in which case nothing is paid, because there is no winner to pay from
   * and inventing one is exactly the adjudication N18 removes. What is dug goes to the
   * digger's stores at the season's close (reputation.js `fillHolds`), not here; a promise
   * kept for a Withdrawal is paid out of the take in divide.js.
   *
   * Conserves: every credit paid out is a credit that came from the pot. Asserted in `regress`.
   */
  function settle(corps, opts) {
    const pot = opts.pot;
    const winnerId = opts.winnerId;
    const lines = [];
    const take = {};                    /* corp id → credits */
    for (const c of corps) take[c.id] = 0;

    if (winnerId == null) {
      return { lines: lines, take: take, pot: pot, winnerId: null, bonuses: {} };
    }

    /* the pot lands on the winner */
    take[winnerId] += pot;
    lines.push({ corp: winnerId, kind: 'pot', amount: pot });

    /* the winner pays its own people (N14). Winner's roster only. */
    const winner = corps.find(c => c.id === winnerId);
    const bonuses = { natties: 0, mercs: 0, freed: 0, total: 0 };
    if (winner) {
      for (const f of winner.allBodies) {
        if (f.status === 'dead' || f.status === 'retired') continue;
        const clause = f.contract && f.contract.divides_required != null;
        const origin = f.origin || (clause ? 'prisoner' : 'nattie');
        if (origin === 'prisoner' || clause) {
          /* THE WIN-CLAUSE HAS ONE HOME, AND IT IS HERE — N14: the winner pays its own
             people, and a prisoner's pay is the clause satisfied outright. It is written
             on the CONTRACT in the flat shape the season reads, never on status: status
             is a body's state, and freeing-by-status stranded every winning prisoner as
             an un-fieldable ghost the offseason could not match. The offseason reads the
             satisfied clause and frees and walks them through the single path. */
          if (clause)
            f.contract.divides_served = Math.max(f.contract.divides_served || 0,
                                                 f.contract.divides_required);
          bonuses.freed++;
        } else if (origin === 'mercenary') {
          const b = Math.round(((f.contract && f.contract.salary) || 0) * CONST.WIN_BONUS_MERC);
          bonuses.mercs += b; bonuses.total += b;
        } else {
          const b = Math.round((f.contract && f.contract.death_benefit) || 0);
          bonuses.natties += b; bonuses.total += b;
        }
      }
      /* the bonuses are the winner's own contracts, charged to its books with the rest of its wages (ledger.bookDivide);
         taken off the pot here as well, they were paid twice */
    }

    return { lines: lines, take: take, pot: pot, winnerId: winnerId, bonuses: bonuses };
  }

  const api = {
    CONST, rollPot,
    oddsBoard, priceModifier, livingRegard, appetite, bodyWorth,
    ransomPrice, ransomOffer, ransomWorthPaying,
    settle
  };
  if (isNode) module.exports = api;
  global.CDNEG = api;
})(typeof window !== "undefined" ? window : globalThis);
