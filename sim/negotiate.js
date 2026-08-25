/* Capital Divide — /sim/negotiate.js  (Step 6)
 *
 * The table. Implements NEGOTIATION.md end to end:
 *   §2 the pot · §3 banners and the umbrella · §4 terms · §5 leverage and price
 *   §6 the AI · §7 the crowd counterweight · §8 betrayal · §9 captives · §10.3 settlement
 *
 * WHAT THIS OWNS: what a deal is worth, who offers what to whom, and who is paid at the end.
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
       and ten for a poor one; split down an umbrella it is still years. The pot has to stay
       immense AFTER the deals, or the deals are not worth making. */
    POT_BASE: 1400000,                  // [H] credits, a whole planet
    POT_RICHNESS: [0.70, 1.40],         // [C] rolled with the planet
    ASSAY_VALUE: 22000,                 // [H] §2.2 credits per assay credit banked

    /* §2.3 the winner's bonuses — winner's own roster only (N14) */
    WIN_BONUS_MERC: 8,                  // [C] x monthly salary
    /* natties take their death benefit, paid to the living fighter; prisoners are freed */

    /* §5.2 the odds board */
    ODDS_SHARPNESS: 1.6,                // [H] above 1, a lead is worth more than its size
    ODDS_QUIET_BONUS: 0.22,             // [C] a corp nobody has seen fighting is overrated
    ODDS_KIT_WEIGHT: 0.38,              // [C] how much visible gear moves the board
    KIT_REFERENCE_PER_BODY: 1750,       // [C] the fleet's middling loadout, the board's yardstick
    INJURED_WEIGHT: 0.45,               // [C] a body in the camp tent is worth something
    STANDDOWN_WEIGHT: 0.55,             // [C] §3.3 alive, and eventually in front of someone

    /* §5.4 anchors — opening asks as a share of the principal's take */

    /* §6 the table */
    OFFERS_PER_WINDOW: 2,               // [S] how many a corp may send in one window
    PACT_DAYS: [2, 5],                  // [C] §4 how long a truce runs. NEGOTIATION.md quoted
                                        //     this by name and the code had it inlined — the
                                        //     doc described a constant that did not exist
    PATIENCE_HOLDOUT: 0.0045,           // [C] per point of patience, how much better a number
                                        //     a corp waits for rather than closing now
    /* §7 the crowd counterweight — REPLACED IN STEP 7.

       CROWD_CREDIT_RATE lived here: one number saying what a point of standing was worth as
       a share of a whole pot, declared honestly as a placeholder and marked for replacement
       "by the actual relationship between standing and next season's grant".

       That replacement was overruled by designer ruling (REPUTATION.md R2). A point of
       popularity has no price in credits: it touches everything, money arrives from more than
       one place, and no single rate can be honest. So the constant is DELETED rather than
       re-derived, and the arithmetic that needed it is gone with it — see valueJoin below.
       What a corp does now is charge MORE for an ugly deal (`priceOfBeingSeen.premium`) and,
       past a wall, refuse it at any price. Nothing anywhere states what a point is worth.

       A guard fails if either deleted name returns. */

    /* §5.3 — what staying costs. This is the term that makes a corp deal BEFORE the crush
       rather than after it: a banner that fights on is not just risking the pot, it is
       spending people, and the last ground is where most of that spending happens.

       LIFE_CREDIT_VALUE lived here: one figure for a fighter, standing in for five ledgers of
       which only one was a number. Deleted in Step 7 for the same reason as the rate above
       (REPUTATION.md R3) — a life has no price either.

       What replaces it is REAL money and nothing else: the death benefit written into that
       fighter's own contract, the signing cost already sunk into them, and the signing cost of
       whoever replaces them. Three things the ledger actually pays. It varies by corp, because
       a corp of expensive mercenaries genuinely does fear losses more than a corp of Natties,
       which the single figure could never express.

       The three channels a death costs that are NOT money — the standing it costs, the board
       demand it threatens, and the developed person and the survivors' morale — are handled
       where they belong: the first two in reputation.js, and the fourth is left unpriced and
       said so, because it needs people to survive a Divide and they do not yet. */
    REPLACEMENT_SIGNING: 1.00,          // [C] §10.3 recruiting the body that fills the gap
    MIN_ASK_FRAC: 0.12,                 // [C] §10.2 nobody hands over a claim for nothing,
                                        //     however hopeless. The floor the deleted
                                        //     additive penalty used to supply by accident
    ATTRITION_PER_DAY: 0.010,           // [C] share of a standing force lost per day of Divide
    CRUSH_ATTRITION: 0.32,              // [C] and what meeting the last ground costs on top
    JOIN_ATTRITION_RELIEF: 0.42,        // [C] fewer enemies, and it ends sooner
    STANDDOWN_ATTRITION_RELIEF: 0.86,   // [C] §3.3 — you are behind their line, not in it
    FOLD_BASE: 0.06,                    // [H] the crowd's charge for quitting, at its worst
    QUIT_BASELINE: 0.25,                // [S] fans never like a quitter — the floor under it,
                                        //     paid even by a corp cut down to three people
    BUY_BASE: 0.07,                     // [H] buying a win rather than earning it
    STAND_DOWN_LENIENCY: 0.35,          // [C] getting your people home reads better than
                                        //     selling a contest you could have won
    BETRAY_PENALTY: 0.45,               // [H] the largest single crowd movement in the design

    /* §5.3a GREED — the appetite that got these corporations into this business.

       The model was missing it entirely. Corps behaved like rational agents splitting a
       surplus, taking any deal that beat their expected value. That is not who they are:
       these are megacorporations monetising a bloodsport to strip planets. They want the
       WHOLE thing, they are hard to buy off, and they are not generous to a rival they have
       already broken. The only thing reining any of it in is what the public will wear.

       Two directions, because greed cuts both ways at a table:
         HOLDOUT — I would rather fight you for all of it than be bought at a fair price
         MERCY   — you are finished, and I will pay you accordingly */
    GREED_HOLDOUT: 0.55,                // [H] how much more a seller demands than the maths says
    GREED_MERCY: 0.28,                  // [H] how much less a buyer pays a beaten rival

    /* §8 the Aleas */
    DQ_BASE: 0.70,                      // [C] chance of disqualification for a betrayal
    DQ_STANDING: 0.45,                  // [C] what being in good odour buys you
    SPITE_P: 0.0055,                    // [C] per window, per point of treachery over a hostile
                                        //     grudge. Checked at EVERY window by every allied
                                        //     pair, so the per-Divide rate is ~20x this.

    /* §9 captives */
    RANSOM_PER_SALARY: 14,              // [C] x monthly salary, asking price
    RESOURCE_TERM_P: 0.22,              // [C] §4 — how often a cut is taken in the thing itself
    RESOURCE_DISCOUNT: 0.88,            // [C] and the discount for insisting on it
    CAPTIVE_KEEP: 0.34, CAPTIVE_RELEASE: 0.42, CAPTIVE_KILL: 0.24  // [C] base weights
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
    if (corp.standDown) f *= CONST.STANDDOWN_WEIGHT;
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
    if (corp.standDown) f *= CONST.STANDDOWN_WEIGHT;
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
   * The odds board over banners. `umbrellas` is a list of { principal, members }.
   * Returns a map of principal id → probability of winning the planet.
   */
  function oddsBoard(umbrellas, opts) {
    opts = opts || {};
    const mean = opts.meanEngagements || 0;
    /* `negotiation_bluff_detection` — a psion who reads pressure sees past the public board
       to what a rival's force actually is. Declared in traits.json since Step 2 and read by
       nothing; it is the one trait that touches the imperfect-information model directly. */
    const reader = opts.reader && opts.hasHook && opts.hasHook(opts.reader, 'negotiation_bluff_detection');
    const raw = {}; let tot = 0;
    for (const u of umbrellas) {
      let f = 0;
      for (const c of u.members) f += (opts.truth || reader ? corpForce(c) : believedForce(c, mean));
      const w = Math.pow(Math.max(0.0001, f), CONST.ODDS_SHARPNESS);
      raw[u.principal.id] = w; tot += w;
    }
    const out = {};
    for (const k in raw) out[k] = tot > 0 ? raw[k] / tot : 0;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* §7 the crowd counterweight                                          */
  /* ------------------------------------------------------------------ */

  /**
   * The cost of folding. Scales with how much of a shot you were giving up and how early —
   * folding on day three with a full roster is the egregious act; folding on day 27 with
   * nine people left is not.
   *
   * This is deliberately thin. The full model — standing with your own OA, with each rival's
   * fanbase, with the non-OA public, and with the Aleas — is its own system and is deferred.
   */
  /**
   * What the crowd charges you for quitting.
   *
   * REBUILT. This was a statistical instrument: a penalty proportional to your probability of
   * winning. That is not how a crowd thinks, and it produced the wrong answer twice over — a
   * full-strength corp on day one was charged almost nothing, because with eight banners
   * nobody's odds look good; and a corp that took a sensible deal was treated as having done
   * nothing much wrong.
   *
   * Fans never like a quitter. There is a floor under this whatever the circumstances
   * (QUIT_BASELINE), and above the floor the charge is about INVESTMENT rather than
   * arithmetic: how much of your force you still have, and how little of it you have spent
   * trying. A "shot" is not a percentage — it is having one person left who could still win
   * it. A team that walks off at nil-nil is not forgiven because the bookmakers had them at
   * 12%; a team that loses nine players and then concedes is.
   *
   * There is no calendar term any more. Day-one folding is punished because a day-one corp is
   * untouched and has spent nothing, which is the same statement made honestly.
   */
  function foldPenalty(pWin, day, lastDay, standDown, opts) {
    opts = opts || {};
    const left = opts.intact != null ? opts.intact : 1;      /* still on their feet */
    const bled = opts.bled != null ? opts.bled : 0;          /* lost for good */
    const fought = opts.fought != null ? opts.fought : 0;    /* fights taken, normalised */

    const invested = Math.max(0, Math.min(1, 1.15 * bled + 0.55 * fought));
    const throwing = 0.55 * left + 0.45 * (1 - invested);

    let pen = CONST.FOLD_BASE * (CONST.QUIT_BASELINE + (1 - CONST.QUIT_BASELINE) * throwing);
    if (standDown) pen *= CONST.STAND_DOWN_LENIENCY;
    return pen;
  }

  /** The cost of buying a win rather than earning it. Real, and smaller. */
  function buyPenalty(share, leadFraction) {
    return CONST.BUY_BASE * share * (0.5 + leadFraction);
  }

  /* ------------------------------------------------------------------ */
  /* §5.3 valuation, §6 the table                                        */
  /* ------------------------------------------------------------------ */

  /* Step 7 telemetry. MIN_ASK_FRAC is a floor, and a floor that never binds is a constant
     wired to a condition that never becomes true — the exact fault the Step 6 audit found
     nine times. A guard asserts this counter is non-zero. */
  const TELEMETRY = { floorBinds: 0, valuations: 0, wallsSeller: 0, wallsBuyer: 0 };

  const dial = (c, k) => ((c.profile && c.profile.dials && c.profile.dials[k]) || 50) / 100;

  /**
   * §10 — what being seen doing this costs THIS corp right now, as a multiplier on its price
   * and a wall past which it will not deal. There is deliberately no credit figure in here.
   *
   * A corp with no reputation record is a caller that has not opened one (a bare unit test);
   * it gets a neutral answer rather than an exception, but the day loop always supplies one.
   */
  function seenDoing(corp, actType, ctx) {
    if (!corp.rep || !REP) return { damage: 0, tolerance: 1, ratio: 0, wall: false, premium: 1 };
    return REP.priceOfBeingSeen(corp.rep, actType, ctx,
                                (corp.profile && corp.profile.dials) || null,
                                corp.goalAtRisk || 0);
  }

  /* §5.3 — STANCE IS NOT APPLIED HERE, and the reason is a correction worth keeping.
     
     The first build gave each notch a multiplier on what it thought a life was worth, running
     2.20 at preservationist down to 0.28 at death_or_glory. The notch ladder promptly blew out
     to nine permanent losses between the poles, against a design that wants roughly two.

     The fault was not the size of the multiplier, it was its existence. Declared stance
     already governs fight selection in the day loop — six dials deciding how much Divide a
     corp goes looking for — and DIVIDE.md is explicit that this is where stance lives. Adding
     a second stance effect down here meant stance was applied TWICE: once to how often a corp
     fought, and again to how readily it dealt its way out. The ladder was double-counting.

     So every corp values a life at the same figure, and the difference between the poles
     emerges where it is supposed to: a careful corp fights less, keeps more people, reads
     better on the odds board, and sells that position for a larger share. C9 falls out of
     the situation instead of being asserted by a table. Measured spread after removing it:
     1.96 permanent losses between the poles, against 3.23 with it. */
  const STANCE_LIFE_MULT = {
    preservationist: 1.00, measured: 1.00, standard: 1.00, unyielding: 1.00, death_or_glory: 1.00
  };

  /**
   * What fighting on from here is expected to cost this corp, in credits, if it stays under
   * its own banner to the end. Bodies on their feet, times the share of them the rest of the
   * Divide takes, times what this corp thinks a body is worth.
   */
  /**
   * §10.3 — what ONE of this corp's people costs it, in money the ledger actually pays.
   * No universal figure: a corp fielding expensive mercenaries loses more per body than a
   * corp fielding Natties, and that is a real difference the deleted constant flattened.
   */
  function bodyMoney(corp) {
    let n = 0, sum = 0;
    for (const b of corp.allBodies) {
      const c = b.contract || {};
      sum += (c.death_benefit || 0) + (c.signing_cost || 0) * (1 + CONST.REPLACEMENT_SIGNING);
      n++;
    }
    return n ? sum / n : 0;
  }

  function expectedLosses(corp, day, lastDay, pWin, relief) {
    let standing = 0;
    for (const b of corp.allBodies) if (b.status === 'active') standing++;
    const daysLeft = Math.max(0, lastDay - day);
    /* Everyone who stays meets the last ground; how badly depends on who is winning. */
    const frac = CONST.ATTRITION_PER_DAY * daysLeft + CONST.CRUSH_ATTRITION * (1 - pWin);
    const mult = STANCE_LIFE_MULT[corp.policy] != null ? STANCE_LIFE_MULT[corp.policy] : 1;
    return standing * Math.min(1, frac) * (1 - (relief || 0)) * bodyMoney(corp) * mult;
  }

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
    if (!d) return 1.00;
    if (HOSTILE.indexOf(d) >= 0) return 1.00 + 0.30 * (1 + dial(from, 'tradition'));
    if (WARM.indexOf(d) >= 0) return 1.00 - 0.18 * (1 + dial(from, 'tradition')) / 2;
    return 1.00;
  }

  function refusesOutright(from, to) {
    const d = relationship(from, to);
    return HOSTILE.indexOf(d) >= 0 && d === 'hostility' && dial(from, 'tradition') > 0.75;
  }

  /**
   * What a joiner gets by staying versus by joining, per §5.3. Both sides are valued with
   * the SAME function, so anything a human can see, an AI corp can see too.
   */
  /* REMOVED in the Step 6 audit: `valueJoin` and `principalIdOf`. Both were left behind when
     `considerJoin` was split into `offerRange` + `evaluateOffer`, and neither had been called
     since. Dead code that reads like live design is worse than no code at all — someone
     reasoning about how a joiner is valued would have read the wrong function. */

  /** What fraction of its banner's take this corp actually keeps, after its own signatories. */
  function chainShare(corp, ctx) {
    const owed = (ctx.owedBy && ctx.owedBy(corp)) || 0;
    return Math.max(0, 1 - owed);
  }

  /** N4 — a cut of a cut. What the principal receives is already diluted by ITS own joins. */
  function chainDilution(principal, ctx) {
    return chainShare(principal, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* §6 forming and answering an offer                                   */
  /* ------------------------------------------------------------------ */

  function band(rng, b) { return b[0] + rng() * (b[1] - b[0]); }

  /* REMOVED in the Step 6 audit: `openingAsk` and the four ASK_* anchor bands. NEGOTIATION.md
     §5.4 documented them as the opening asks — 30-45% intact, 8-18% mauled — and the function
     had not been called since `offerRange` began computing the floor and ceiling directly from
     both sides' positions. A documented mechanism that does not run is a lie in the design
     doc, so both the code and §5.4 are gone rather than one of them. */

  /**
   * THE RANGE. What the joiner will not go under, what the principal will not go over, and
   * every number behind both — computed once, in credits, and used by the AI and by a human
   * alike. Returns null when the pair cannot deal at all.
   *
   * Split out of `considerJoin` so that a human's offer is scored by the IDENTICAL function
   * that scores an AI's. If they ran down separate paths the claim that a reasonable offer
   * gets a reasonable answer would be untestable, which it was until now.
   */
  function offerRange(joiner, principal, ctx) {
    if (joiner === principal || joiner.id === principal.id) return null;
    if (joiner.joinedTo || joiner.disqualified || principal.disqualified) return null;
    if (ctx.sealed(joiner) || ctx.sealed(principal)) return null;              /* N11 */
    if (ctx.principalOf(principal).id === ctx.principalOf(joiner).id) return null;  /* N4 */
    if (refusesOutright(joiner, principal)) return null;

    const pot = ctx.pot;
    const jP = ctx.principalOf(joiner), pP = ctx.principalOf(principal);
    const oddsNow = ctx.odds[jP.id] || 0;
    const oddsPrincipal = ctx.odds[pP.id] || 0;
    const oddsJoined = ctx.oddsWithJoin(joiner, principal);

    const standDown = wantsStandDown(joiner, ctx);
    const stayLosses = expectedLosses(joiner, ctx.day, ctx.lastDay, oddsNow, 0);
    const joinLosses = expectedLosses(joiner, ctx.day, ctx.lastDay, oddsJoined,
      standDown ? CONST.STANDDOWN_ATTRITION_RELIEF : CONST.JOIN_ATTRITION_RELIEF);
    const stayValue = oddsNow * pot * chainShare(joiner, ctx) - stayLosses + joinLosses;

    let standingNow = 0, gone = 0, everyone = 0;
    for (const b of joiner.allBodies) {
      everyone++;
      if (b.status === 'active') standingNow++;
      else if (b.status === 'dead' || b.status === 'retired') gone++;
    }
    /* §10.2 — the fold penalty no longer becomes credits. It becomes a SCALE: how much of
       what you had you are throwing away, which is what the audiences react to and what
       `reputation.js` prices as ugliness. */
    const foldScale = Math.min(1, foldPenalty(oddsNow, ctx.day, ctx.lastDay, standDown, {
      intact: everyone ? standingNow / everyone : 1,
      bled: everyone ? gone / everyone : 0,
      fought: Math.min(1, (joiner.engagements || 0) / 8)
    }) / CONST.FOLD_BASE);
    const seenJ = seenDoing(joiner, standDown ? 'stood_down' : 'ceded', { scale: foldScale });
    if (seenJ.wall) TELEMETRY.wallsSeller++;
    /* §5.3a — greed, by culture. Aggression wants the whole planet; thrift hates being on
       the paying side of anything. Neither was reaching the table before. */
    const greedOf = c => 0.60 + 0.50 * dial(c, 'aggression') + 0.30 * dial(c, 'thrift');
    const jGreed = greedOf(joiner), pGreed = greedOf(principal);

    const aggressionHold = 1 + 0.55 * dial(joiner, 'aggression');
    let relPrice = priceModifier(joiner, principal);
    /* `pact_reputation_up` — a corp known for keeping its word is dealt with more generously,
       so its asking price is met rather than haggled down. */
    if (ctx.hasHook && ctx.hasHook(joiner, 'pact_reputation_up')) relPrice *= 0.92;
    /* §10.2 — the premium MULTIPLIES the asking price rather than adding a converted
       reputation cost to it. And a corp always asks for something: nobody hands over a claim
       for nothing, however hopeless the position, which is the floor the additive penalty
       used to supply. */
    const expectedTake0 = Math.max(1, oddsJoined * pot * chainDilution(principal, ctx));
    if (stayValue * aggressionHold < expectedTake0 * CONST.MIN_ASK_FRAC) TELEMETRY.floorBinds++;
    TELEMETRY.valuations++;
    const bareMin = Math.max(stayValue * aggressionHold, expectedTake0 * CONST.MIN_ASK_FRAC);
    const joinerMin = bareMin * relPrice * (1 + CONST.GREED_HOLDOUT * jGreed) * seenJ.premium;

    const keep = chainDilution(principal, ctx);
    const gain = (oddsJoined - oddsPrincipal) * pot * keep;
    const buyScale = Math.min(1, buyPenalty(0.30, Math.max(0, oddsPrincipal - oddsNow))
                                 / (CONST.BUY_BASE * 0.30 * 1.5));
    const seenP = seenDoing(principal, 'bought_win', { scale: buyScale });
    if (seenP.wall) TELEMETRY.wallsBuyer++;
    /* And the buyer is no more generous. A corp that can see you are finished pays you like
       it: the worse your position, the harder they squeeze. */
    const overMatch = Math.max(0, Math.min(1, 1 - oddsNow / Math.max(1e-6, oddsPrincipal)));
    const principalMax = gain * (1 - CONST.GREED_MERCY * pGreed * overMatch) / seenP.premium;
    const expectedTake = Math.max(1, oddsJoined * pot * keep);

    return {
      oddsNow, oddsPrincipal, oddsJoined,
      stayValue: Math.round(stayValue),
      stayLosses: Math.round(stayLosses), joinLosses: Math.round(joinLosses),
      joinerMin: Math.round(joinerMin), principalMax: Math.round(principalMax),
      expectedTake: Math.round(expectedTake), gain: Math.round(gain),
      relPrice, standDown,
      /* §10.2 the wall: past what a corp can afford to be hated for, no price is enough.
         This is where the corp that will not deal at all lives — the far end of one scale
         rather than a flag on a profile. */
      seller: seenJ, buyer: seenP,
      /* counted so a guard can prove the wall is reachable, not decorative */
      wall: seenJ.wall ? 'seller' : seenP.wall ? 'buyer' : null,
      viable: gain > 0 && joinerMin <= principalMax && !seenJ.wall && !seenP.wall
    };
  }

  /** What a set of terms is actually worth to the joiner, in credits. */
  function termsValue(terms, range) {
    return (terms.share || 0) * range.expectedTake + (terms.credits || 0);
  }

  /**
   * Score an offer nobody in this file authored — a human's, or a counter. Same range, same
   * arithmetic, and a refusal that says WHICH side was short and by how much, because "no"
   * with no number attached is useless to a manager and hides bugs from us.
   */
  function evaluateOffer(joiner, principal, terms, ctx) {
    const range = offerRange(joiner, principal, ctx);
    if (!range) return { accepted: false, reason: 'no_deal_possible', range: null };
    if (range.gain <= 0) {
      return { accepted: false, reason: 'no_gain', range,
               note: 'adding them does not improve the banner\'s chances' };
    }
    const value = termsValue(terms, range);
    if (value < range.joinerMin) {
      return { accepted: false, reason: 'too_little_for_joiner', range, value: Math.round(value),
               short: Math.round(range.joinerMin - value),
               note: 'they would rather take their chances' };
    }
    if (value > range.principalMax) {
      return { accepted: false, reason: 'too_much_for_principal', range, value: Math.round(value),
               over: Math.round(value - range.principalMax),
               note: 'the banner would be paying more than the help is worth' };
    }
    /* AN ACCEPTED OFFER MUST BE A DEAL, not a verdict about one. This returned only
       `{accepted, range, value}` — no share, no credits, no standDown, no day — so a human's
       accepted offer produced an object the settlement could not read, and pushing it onto
       `stats.deals` would have put a hole in the ledger that showed up seasons later as a
       banner owed nothing by somebody who joined it. The AI's path builds a full deal; so does
       this one, from the same fields, so the two are indistinguishable downstream. */
    return {
      accepted: true, range, value: Math.round(value),
      deal: {
        joiner: joiner.id, principal: principal.id,
        share: Math.max(0, Math.min(0.95, terms.share || 0)),
        credits: Math.max(0, Math.round(terms.credits || 0)),
        standDown: !!terms.standDown,
        debt: terms.debt || 0,
        day: ctx.day, kind: terms.standDown ? 'stand_down' : 'join',
        why: { human: true }
      }
    };
  }

  /**
   * The AI's own offer. Finds the range, then picks a point inside it — patience holds out
   * for better, thrift pushes percentage rather than cash.
   */
  function considerJoin(rng, joiner, principal, ctx) {
    const range = offerRange(joiner, principal, ctx);
    if (!range) return null;
    if (range.gain <= 0) return null;
    if (!range.viable) {
      if (ctx.refusals) ctx.refusals.push({
        joiner: joiner.id, principal: principal.id, day: ctx.day, why: range,
        short: Math.round(range.joinerMin - range.principalMax)
      });
      return null;
    }

    const jPull = 0.5 + CONST.PATIENCE_HOLDOUT * ((joiner.profile.dials.patience || 50)
                                                - (principal.profile.dials.patience || 50));
    const t = Math.max(0.05, Math.min(0.95, jPull));
    const value = range.joinerMin + (range.principalMax - range.joinerMin) * t;

    /* §4 — a NAMED RESOURCE. Some of what a planet yields is not minerals: biotic stock,
       volatiles, whatever the archetype actually holds. A corp that came for one specific
       thing will take its cut in that thing rather than in credits, and will take it at a
       discount to get it. Priced as a share like any other term, because the Aleas settles
       everything in the same currency — what changes is what the joiner walks away holding,
       and which board goals it satisfies. Recorded now, meaningful once board goals read it. */
    const wantsCash = (1 - dial(joiner, 'patience')) * 0.5 + (1 - range.oddsJoined) * 0.5;
    const cashFraction = dial(principal, 'thrift') > 0.55 ? 0
                       : Math.max(0, Math.min(0.6, wantsCash - 0.35));
    const credits = Math.round(value * cashFraction);
    const share = Math.max(0, Math.min(0.90, (value - credits) / range.expectedTake));
    if (share <= 0.001 && credits <= 0) return null;

    const deal = makeDeal(joiner, principal, share, credits, range.standDown, ctx,
                          credits > 0 && share <= 0.001 ? 'flat' : 'share');
    if (ctx.resource && share > 0.03 && rng() < CONST.RESOURCE_TERM_P) {
      deal.resource = ctx.resource;
      deal.share *= CONST.RESOURCE_DISCOUNT;   /* they want the stuff, not the maximum price */
    }
    deal.why = Object.assign({}, range, { value: Math.round(value) });
    return deal;
  }

  /** §3.3 — a corp that wants its people home rather than a percentage. */
  function wantsStandDown(joiner, ctx) {
    const active = joiner.allBodies.filter(b => b.status === 'active').length;
    const frac = active / Math.max(1, joiner.allBodies.length);
    const careful = 1 - dial(joiner, 'aggression');
    return frac < 0.45 && careful > 0.5;
  }

  function makeDeal(joiner, principal, share, credits, standDown, ctx, kind) {
    /* N9 — debts after the games ride only as a clause inside a joining deal. */
    let debt = null;
    if (kind === 'share' && share > 0.20 && ctx.rng && ctx.rng() < 0.25) {
      debt = { fighters: 1 + Math.floor(ctx.rng() * 3) };
    }
    return {
      joiner: joiner.id, principal: principal.id,
      share: Math.max(0, Math.min(0.95, share)),
      credits: Math.max(0, Math.round(credits || 0)),
      standDown: !!standDown,
      debt: debt,
      day: ctx.day, kind: kind
    };
  }

  /* ------------------------------------------------------------------ */
  /* §4 non-aggression pacts                                             */
  /* ------------------------------------------------------------------ */

  /**
   * WOULD THEY EVEN CONSIDER IT, and how likely are they to say yes? An interface that shows a
   * manager a pact row has to know the answer without rolling for it, and the alternative —
   * an interface guessing at the gate below — is two descriptions of one rule that agree until
   * one of them is edited. Returns the deterministic part and the actual probability.
   */
  function pactViability(a, b, ctx) {
    if (ctx.sealed(a) || ctx.sealed(b)) return { possible: false, why: 'they do not deal', p: 0 };
    if (ctx.principalOf(a).id === ctx.principalOf(b).id)
      return { possible: false, why: 'same banner', p: 0 };
    const oa = ctx.odds[ctx.principalOf(a).id] || 0, ob = ctx.odds[ctx.principalOf(b).id] || 0;
    if (oa >= ob) return { possible: false, why: 'you are doing better than they are', p: 0 };
    const want = (ob - oa) * (1 - dial(a, 'aggression'));
    if (want < 0.05) return { possible: false, why: 'too close to be worth their while', p: 0 };
    return { possible: true, p: Math.max(0, Math.min(1, 0.35 + 0.4 * dial(b, 'thrift'))) };
  }

  function considerPact(rng, a, b, ctx) {
    if (ctx.sealed(a) || ctx.sealed(b)) return null;
    if (ctx.principalOf(a).id === ctx.principalOf(b).id) return null;
    const oa = ctx.odds[ctx.principalOf(a).id] || 0, ob = ctx.odds[ctx.principalOf(b).id] || 0;
    /* The weaker side wants it; the stronger side wants paying for it. */
    if (oa >= ob) return null;
    const want = (ob - oa) * (1 - dial(a, 'aggression'));
    if (want < 0.05) return null;
    if (rng() > 0.35 + 0.4 * dial(b, 'thrift')) return null;
    return {
      kind: 'pact', a: a.id, b: b.id,
      days: CONST.PACT_DAYS[0] + Math.floor(rng() * (CONST.PACT_DAYS[1] - CONST.PACT_DAYS[0] + 1)),
      supply: Math.round(band(rng, [1, 4])),      /* rations handed over as recompense */
      day: ctx.day
    };
  }

  /* ------------------------------------------------------------------ */
  /* §9 captives                                                         */
  /* ------------------------------------------------------------------ */

  function ransomPrice(fighter) {
    const sal = (fighter.contract && fighter.contract.salary) || 300;
    const fame = 1 + 0.02 * (fighter.fame || 0);
    return Math.round(sal * CONST.RANSOM_PER_SALARY * fame);
  }

  /**
   * N10 — a captive can be bought back DURING the games, as its own small deal. The price
   * was written at the start of Step 6 and nobody ever offered it; only the end-of-Divide
   * whim ran, so every prisoner's fate was decided by their captor's mood and never by
   * their own corp caring enough to pay.
   *
   * The captor is weighing cash now against a body they can kill, keep, or hand back later
   * for nothing. Thrift takes the money; aggression would rather have the prisoner.
   */
  function considerRansom(rng, captor, owner, fighter, ctx) {
    if (ctx.sealed(captor)) return null;          /* N11 — they do not do deals, of any size */
    const price = Math.round(ransomPrice(fighter) * priceModifier(captor, owner));
    const keenToKeep = 0.5 * dial(captor, 'aggression') + 0.3 * (1 - dial(captor, 'thrift'));
    if (rng() < keenToKeep) return null;
    /* The owner has to want them back at that price — a line fighter on a poor corp may not
       be worth it, which is a bleak little decision the game should let managers make too. */
    const worth = (fighter.fame || 0) * 0.02 + ((fighter.contract && fighter.contract.salary) || 300) / 400;
    if (rng() > Math.min(0.95, 0.30 + worth * 0.35)) return null;
    return { kind: 'ransom', captor: captor.id, owner: owner.id,
             fighter: fighter.id, price: price, day: ctx.day };
  }

  /**
   * N10 — an unransomed captive is left to the whims of their captor. Killed, released, or
   * kept: leaned by who the captor is, not rolled flat.
   */
  function resolveCaptive(rng, captor, owner, fighter) {
    let keep = CONST.CAPTIVE_KEEP * (0.6 + dial(captor, 'thrift') + dial(captor, 'treachery'));
    let rel = CONST.CAPTIVE_RELEASE * (0.6 + dial(captor, 'tradition') + (1 - dial(captor, 'aggression')));
    let kill = CONST.CAPTIVE_KILL * (0.5 + 1.5 * dial(captor, 'aggression'));
    const d = relationship(captor, owner);
    if (WARM.indexOf(d) >= 0) { rel *= 1.8; kill *= 0.4; }
    if (HOSTILE.indexOf(d) >= 0) { kill *= 1.6; rel *= 0.6; }
    if (captor.policy === 'death_or_glory') { kill *= 2.2; rel *= 0.3; }
    const tot = keep + rel + kill;
    let roll = rng() * tot;
    if ((roll -= rel) <= 0) return 'released';
    if ((roll -= keep) <= 0) return 'kept';
    return 'killed';
  }

  /* ------------------------------------------------------------------ */
  /* §8 betrayal                                                         */
  /* ------------------------------------------------------------------ */

  /** N17 — a corp may break a deal out of spite, against its own interest. */
  function considerBetrayal(rng, corp, target, ctx) {
    if (!corp.joinedTo && !target.joinedTo) return false;
    if (ctx.principalOf(corp).id !== ctx.principalOf(target).id) return false;
    const d = relationship(corp, target);
    const grudge = HOSTILE.indexOf(d) >= 0 ? 1 : 0.25;
    const p = CONST.SPITE_P * dial(corp, 'treachery') * grudge;
    return rng() < p;
  }

  /** The Aleas rules on it. Being in good odour buys you what an unpopular corp cannot. */
  function disqualificationRoll(rng, corp, aleasStanding) {
    const p = CONST.DQ_BASE - CONST.DQ_STANDING * Math.max(0, Math.min(1, aleasStanding));
    return rng() < p;
  }

  /** Placeholder until Step 9 makes this earnable and bribable. */
  function aleasStandingOf(corp) {
    return Math.max(0, Math.min(1, 0.35 + 0.5 * dial(corp, 'tradition') - 0.45 * dial(corp, 'treachery')));
  }

  /* ------------------------------------------------------------------ */
  /* §10.3 settlement                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Pay everyone. `winnerId` is the principal of the last banner standing, or null if the
   * contest somehow failed to resolve — in which case nothing is paid, because there is no
   * winner to pay from and inventing one is exactly the adjudication N18 removes.
   *
   * Conserves: every credit paid out is a credit that came from the pot or from a named
   * treasury. Asserted in `regress`.
   */
  function settle(rng, corps, opts) {
    const pot = opts.pot;
    const winnerId = opts.winnerId;
    const deals = opts.deals || [];
    const lines = [];
    const take = {};                    /* corp id → credits */
    for (const c of corps) take[c.id] = 0;

    /* 2/3 — assay banks, outside the pot (N13). Unclaimed sites go to the winner. */
    let assayPaid = 0;
    for (const c of corps) {
      const v = (c.oreCredit || 0) * CONST.ASSAY_VALUE;
      if (v > 0) { take[c.id] += v; assayPaid += v; lines.push({ corp: c.id, kind: 'assay', amount: v }); }
    }
    if (winnerId != null) {
      const unclaimed = (opts.unclaimedAssay || 0) * CONST.ASSAY_VALUE;
      if (unclaimed > 0) {
        take[winnerId] += unclaimed;
        lines.push({ corp: winnerId, kind: 'assay_unclaimed', amount: unclaimed });
      }
    }

    if (winnerId == null) {
      return { lines: lines, take: take, pot: pot, winnerId: null, paidFromPot: 0, bonuses: {} };
    }

    /* 4 — the pot lands on the principal. */
    take[winnerId] += pot;
    lines.push({ corp: winnerId, kind: 'pot', amount: pot });

    /* 5 — settle down the chain, in the order the joins were formed, so a corp pays its
       signatories out of what it actually received. A cut of a cut (N4). */
    const byPrincipal = {};
    for (const d of deals) {
      if ((d.kind !== 'share' && d.kind !== 'flat') || d.void) continue;
      (byPrincipal[d.principal] = byPrincipal[d.principal] || []).push(d);
    }
    const paid = {};
    function payChain(pid) {
      if (paid[pid]) return; paid[pid] = true;
      const list = (byPrincipal[pid] || []).slice().sort((a, b) => a.day - b.day);
      for (const d of list) {
        const held = take[pid];
        const shareAmt = Math.round(held * d.share);
        const cash = Math.min(d.credits, Math.max(0, take[pid] - shareAmt));
        const amt = shareAmt + cash;
        if (amt <= 0) continue;
        take[pid] -= amt; take[d.joiner] += amt;
        lines.push({ corp: d.joiner, kind: 'settlement', amount: amt, from: pid });
        lines.push({ corp: pid, kind: 'settlement_paid', amount: -amt, to: d.joiner });
        payChain(d.joiner);
      }
    }
    payChain(winnerId);

    /* 6 — the winner pays its own people (N14). Winner's roster only. */
    const winner = corps.find(c => c.id === winnerId);
    const bonuses = { natties: 0, mercs: 0, freed: 0, total: 0 };
    if (winner) {
      for (const f of winner.allBodies) {
        if (f.status === 'dead' || f.status === 'retired') continue;
        const origin = f.origin || (f.contract && f.contract.freedom ? 'prisoner' : 'nattie');
        if (origin === 'prisoner' || (f.contract && f.contract.freedom)) {
          f.status = f.status === 'captured' ? f.status : 'freed';
          bonuses.freed++;
        } else if (origin === 'mercenary') {
          const b = Math.round(((f.contract && f.contract.salary) || 0) * CONST.WIN_BONUS_MERC);
          bonuses.mercs += b; bonuses.total += b;
        } else {
          const b = Math.round((f.contract && f.contract.death_benefit) || 0);
          bonuses.natties += b; bonuses.total += b;
        }
      }
      take[winnerId] -= bonuses.total;
      lines.push({ corp: winnerId, kind: 'win_bonuses', amount: -bonuses.total });
    }

    return { lines: lines, take: take, pot: pot, winnerId: winnerId,
             paidFromPot: pot, assayPaid: assayPaid, bonuses: bonuses };
  }

  const api = {
    CONST, RICHNESS_LEAN, STANCE_LIFE_MULT, rollPot,
    corpForce, believedForce, oddsBoard,
    foldPenalty, buyPenalty, priceModifier, relationship, bodyMoney, seenDoing, TELEMETRY,
    considerJoin, offerRange, evaluateOffer, termsValue, considerPact, pactViability, wantsStandDown,
    ransomPrice, considerRansom, resolveCaptive,
    considerBetrayal, disqualificationRoll, aleasStandingOf,
    settle
  };
  if (isNode) module.exports = api;
  global.CDNEG = api;
})(typeof window !== "undefined" ? window : globalThis);
