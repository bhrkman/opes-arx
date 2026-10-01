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
    POT_BASE: 400000,                   // [H] credits: the desk's share of a planet (ruled 1.2M → 400k). The OA's cut of the rights is billions and none of the manager's; this is the Divide's purse, promises and umbrella shares paid out of it
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
    STANDDOWN_WEIGHT: 0.55,             // [C] §3.3 alive, and eventually in front of someone

    /* §5.4 anchors — opening asks as a share of the principal's take */

    /* §6 the table */
    BANNER_SHAME: 0.22,                 // [C] §5.3b what the fleet's regard for a banner moves its price
    PACT_CREDIT_SCALE: 0.06,            // [C] §4.1 credits equal to this share of the pot buy the full sweetener
    PACT_DAYS: [2, 5],                  // [C] §4 how long a truce runs. NEGOTIATION.md quoted
                                        //     this by name and the code had it inlined — the
                                        //     doc described a constant that did not exist
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

    /* §5.3a GREED — the appetite that got these corporations into this business.

       The model was missing it entirely. Corps behaved like rational agents splitting a
       surplus, taking any deal that beat their expected value. That is not who they are:
       these are megacorporations monetising a bloodsport to strip planets. They want the
       WHOLE thing, they are hard to buy off, and they are not generous to a rival they have
       already broken. The only thing reining any of it in is what the public will wear.

       Two directions, because greed cuts both ways at a table:
         HOLDOUT — I would rather fight you for all of it than be bought at a fair price
         MERCY   — you are finished, and I will pay you accordingly */

    /* §8 the Aleas */
                                        //     grudge. Checked at EVERY window by every allied
                                        //     pair, so the per-Divide rate is ~20x this.

    /* §9 captives */
    /* §6.13 ONE VALUATION. Ransoms, captives and pacts priced from their own dials and fixed
       constants; none read the body price the table uses, the living regard between OAs, or
       appetite. Now a ransom is asked at what the body is worth to lose (pension plus the
       replacement, as `bodyMoney` prices it), marked up, and the owner pays when it wants him
       back — more when it means to keep fighting. */
    RANSOM_MARKUP: 1.25,                // [H] the captor asks this much over what the body costs to replace
    RANSOM_PAYS_UP_TO: 1.6,             // [H] an owner pays up to this much of the body's worth, at appetite 1
    RANSOM_FAME: 0.02,                  // [C] per point of fame, on both
    /* §6.5 THE FORM OF PAYMENT IS BARGAINED, NOT ROLLED. `RESOURCE_TERM_P` (0.22) put a cut in
       kind on a coin toss at a fixed share with a fixed discount. Now a joiner composes its
       terms from what each side values (`composeTerms`): a site or a category it wants more
       than the principal does is asked for first — that is where the surplus at a table lives
       — and the balance in share and credits. The same composer serves invitations. */
    /* §4.1 A SHARE OF THE HAUL. A resource term is a share of what the principal actually
       banks in a category, paid down the chain like the pot: nothing banked, nothing owed, and
       a joiner's joiner gets a share of a share. Each side values a unit by its own WANT —
       a board short of food pays dearly for food and gives up minerals it does not need
       cheaply — and the gap between the two wants is the surplus that makes a deal. */
    RESOURCE_WANT_BASE: 0.55,           // [C] what a full-hold, unasked category is worth, as a fraction of HAUL_VALUE
    RESOURCE_WANT_SHORT: 1.10,          // [C] added at an empty hold, scaling with the shortage
    RESOURCE_WANT_ASKED: 0.80,          // [C] added when the board's card asks for the category
    RESOURCE_WANT_PRIORITY: 1.60,       // [C] instead of ASKED, when it is the card's priority
    /* §6.6 WHOM TO APPROACH. A joiner went to the two strongest banners, always. RULED: the
       table is for the OA you are actually engaged with — the one hunting you, the one you
       are beating — not the leaderboard. A banner's value to a joiner is scaled by CONTACT
       (§6.9: fights between them, whether it is hunting you, whether you have lost to it), and
       a banner you have never met is worth half. Kingmaking — a banner whose win keeps a
       grudged favourite from winning — is a circumstance and stays, small. What an OA
       THINKS of another is not a reason to join it: teaming up for alliance's sake is what
       the Aleas and the fans punish (COLD_ALLIANCE), so regard moves the price, not the choice. */
                                        //     which a rich cold banner still outranked the OA on top of you a
                                        //     quarter of the time (audit_table T1)
    /* §6.10 A COLD ALLIANCE. A deal between two OAs whose squads have not met this Divide is
       an arrangement, not a surrender, and the crowd knows the difference: the folder needs more
       to be worth the shame, the buyer will pay less for a win nobody watched him earn, and both
       are remembered for it (reputation.js: cold_alliance). Ruled strongly frowned upon. */
    /* [H] §6 what the rest of the contest is worth to the OA giving it up: at the drop a
       concession costs the buyer this much again, at the last day nothing extra. */
    /* [H] §6 how heavily an OA weighs what a leaver ASKS against the odds his going buys it:
       above 1 it is stingy, below 1 it buys peace cheaply. */
    CONCESSION_ASK_WEIGHT: 1.0,                  // [H] on the joiner's floor with no contact
    /* §6.12 APPETITE — how much an OA wants to keep fighting THIS Divide, one number from what
       it knew going in and what has happened since: the board's demands, its interest in the
       planet's resources, its squads' health, its combats so far, and its strength now against
       its strength at the drop. Ruled: the decision to give up is variable on those. Stance is
       NOT in it — stance already governs how much Divide an OA goes looking for, and applying
       it at the table too double-counted it (the STANCE_LIFE_MULT note). Appetite scales the
       joiner's floor (hungry to stay, dear to fold) and, gently, the principal's ceiling. */
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
    /* §6.7 WHEN TO ACT. An OA offered whenever the numbers said yes. Now a patient OA with
       a live chance waits — for a better window, or for the field to thin — and an impatient or
       sinking one acts at once. */
    /* §6.8 PRINCIPALS REACH OUT. Nobody courted anyone: every deal began with a joiner. A
       principal now invites, each window, the OA whose joining would improve its odds most
       (measured: the spoiler — what an OA costs a banner by staying — is a body or so, ₡3k
       against gains of ₡150k, so it is not the trigger), at a little over what it guesses that
       OA's floor to be; the OA answers by its own arithmetic. */
                                        //     this much more than the banner does
    /* §4.2 THE SPOILER. An OA that stays out and keeps fighting costs the banner people. The
       share of the banner's expected losses this OA accounts for — its force against
       everything else still standing — is worth paying to take off the board, whatever the
       OA's own odds. This is a weak OA's leverage, and it was priced at nothing. */
    /* §4.3 A NAMED CLAIM: one revealed site, dug by the banner but banked to the joiner. Priced
       like a share of the haul — the site's units, discounted by the chance the banner digs it. */
    CAPTIVE_KEEP: 0.34, CAPTIVE_RELEASE: 0.42, CAPTIVE_KILL: 0.24,  // [C] base weights

    /* §6.2 THE PRINCIPAL IS A PARTY TO THE DEAL. Until this pass a joiner computed BOTH sides'
       limits — the principal's private ceiling included, off dials it could not know — picked
       a point between them by patience, and the deal was struck: the principal decided
       nothing, nobody could be wrong, and every deal was a perfectly informed split of the
       surplus. A calculator, not a table. Now the joiner asks from an ESTIMATE of the ceiling
       and can ask too much; the principal answers, and shades its ceiling by two things beside
       the money — small things, by ruling: the money and the odds are the spine of the table,
       these are terms inside it. */
    /* §6.3 BEYOND THIS DIVIDE. An OA can be left out to dry: refuse its surrender and finish
       it, and next year it is paying pensions and replacing bodies while you are not. A
       principal counts a fraction of what finishing them would cost THEM against what taking
       them is worth — more the more aggressive and treacherous its culture, more with a grudge,
       nothing at all for an OA it is warm to. The joiner's expected losses are priced in the
       joiner's own real money, the same way the joiner prices them itself. */
    /* §6.4 MERCY IS WORTH SOMETHING TOO. A traditional or kindly OA pays a little over the
       arithmetic to take a beaten rival in, and is remembered for it — by that OA, by its
       fans, by the fleet (reputation.js: spared, generous_terms, left_to_die). */
    RIVAL_PRICE: 0.20,                  // [C] what an OA's LIVING opinion of you moves its price, at ±100
    /* §6.14 what its own dealings with you came to, learned inside a career */
    DEAL_PAID_AT: 0.6,                  // [C] a joiner counts a deal paid when the take reaches this much of the promise
    DEAL_BURNED: 0.10,                  // [H] on the price per deal that did not pay, less per one that did
    DEAL_MEMORY_CAP: 0.30               // [C] the most the lesson can move a price either way
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


  /* ------------------------------------------------------------------ */
  /* §5.3 valuation, §6 the table                                        */
  /* ------------------------------------------------------------------ */


  const dial = (c, k) => ((c.profile && c.profile.dials && c.profile.dials[k]) || 50) / 100;


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
    /* §6.14 and what its own deals with `to` came to */
    const rec = ((from.persist && from.persist.dealRecord) || from._dealRecord || {})[to.id];
    if (rec) v *= 1 + Math.max(-CONST.DEAL_MEMORY_CAP, Math.min(CONST.DEAL_MEMORY_CAP, CONST.DEAL_BURNED * (rec.bad - rec.good)));
    /* §5.3b WHO YOU FIGHT UNDER IS SEEN. An OA's own people have to live with the banner
       their manager takes, so the fleet's regard for a banner is a real part of its price: a
       OA nobody minds fighting under is joined for less, and an OA the fleet despises has
       to pay for the shame of it. */
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

  /**
   * What a joiner gets by staying versus by joining, per §5.3. Both sides are valued with
   * the SAME function, so anything a human can see, an AI corp can see too.
   */
  /* REMOVED in the Step 6 audit: `valueJoin` and `principalIdOf`. Both were left behind when
     `considerJoin` was split into `offerRange` + `evaluateOffer`, and neither had been called
     since. Dead code that reads like live design is worse than no code at all — someone
     reasoning about how a joiner is valued would have read the wrong function. */



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

  /** What a set of terms is actually worth to the joiner, in credits. */
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
  /* §4.3 the value of each revealed, undug site as a claim, to each side */
  function termsValue(terms, range, side) {
    let v = (terms.share || 0) * range.expectedTake + (terms.credits || 0);
    const rates = range.resources || {};
    for (const t of terms.resources || []) {
      const r = rates[t.category]; if (!r) continue;
      v += (t.share || 0) * (side === 'principal' ? r.principal : r.joiner);
    }
    const crates = range.claims || {};
    for (const id of terms.claims || []) {
      const c = crates[id]; if (!c) continue;
      v += side === 'principal' ? c.principal : c.joiner;
    }
    return v;
  }

  /**
   * Score an offer nobody in this file authored — a human's, or a counter. Same range, same
   * arithmetic, and a refusal that says WHICH side was short and by how much, because "no"
   * with no number attached is useless to a manager and hides bugs from us.
   */

  /**
   * The AI's own offer. Finds the range, then picks a point inside it — patience holds out
   * for better, thrift pushes percentage rather than cash.
   */

  /**
   * §6.5 COMPOSE THE TERMS for a value the joiner wants, in the form that costs the principal
   * least for what it gives the joiner. Sites and categories the joiner values more than the
   * principal come first, best ratio first, each taken only if it does not overshoot; then
   * credits by how badly the joiner wants cash (thrifty principals pay none); the balance in
   * a share of the take. Returns { share, credits, resources, claims } or null.
   */

  /**
   * §6.6 RANK THE BANNERS a joiner might approach: each viable banner's value to it at its
   * guess, warmed by regard and by kingmaking. Returns [{ principal, umbrella, score, range }]
   * best first; non-viable banners are still returned last, scored zero, so a refusal is
   * recorded for the one the joiner would most have wanted.
   */

  /**
   * §6.7 DOES THE OA ACT THIS WINDOW. Urgency is the worse of how far behind its banner is
   * and how late it is; patience holds it back while it still has a chance.
   */

  /**
   * §6.8 A PRINCIPAL INVITES an OA that is costing it: when the OA's spoiler value to the
   * banner is real, the principal offers terms at a little over what it guesses the OA's
   * floor to be. The OA answers by its own arithmetic (`evaluateOffer`). Returns the deal
   * proposal or null.
   */
  /**
   * §6.12 APPETITE: how much this OA wants to keep fighting this Divide. 1.0 is indifferent.
   * Read by `offerRange` into the joiner's floor and the principal's ceiling; shown on the
   * manager's window as a word. Everything it reads is on the corp or in the context.
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



  /**
   * §6.2 THE PRINCIPAL ANSWERS. Given a joiner's proposal, re-price it from the principal's
   * side — its true ceiling, spite and goodwill included — and accept or refuse with numbers.
   * A refusal is remembered by the joiner (it asks less next time) and, if the joiner is later
   * wiped, by everybody (`left_to_die`). Returns { accepted, reason, over, range, generous, beaten }.
   */



  /* ------------------------------------------------------------------ */
  /* §4 non-aggression pacts                                             */
  /* ------------------------------------------------------------------ */


  /**
   * §4.1 THE CHANCE OF A PACT, for a manager's offer. Nothing here is impossible short of a
   * sealed OA or the same banner: an OA doing better than you wants paying, and credits
   * pay; an OA doing worse than you wants the truce and will mostly say yes. Deterministic,
   * so the beam can read it before the word goes out.
   */
  function pactChance(a, b, ctx, terms) {
    if (ctx.sealed(a) || ctx.sealed(b)) return { possible: false, why: 'they do not deal', p: 0 };
    if (ctx.principalOf(a).id === ctx.principalOf(b).id) return { possible: false, why: 'same banner', p: 0 };
    const oa = ctx.odds[ctx.principalOf(a).id] || 0, ob = ctx.odds[ctx.principalOf(b).id] || 0;
    const credits = Math.max(0, (terms && terms.credits) || 0);
    const sweet = Math.min(0.45, credits / Math.max(1, (ctx.pot || 1) * CONST.PACT_CREDIT_SCALE));
    let p, why;
    if (oa < ob) {
      /* they are ahead: the truce is your relief, not theirs. Thrift makes them take the quiet;
         the gap makes them want it less; credits make up the difference. */
      const gap = Math.min(1, (ob - oa) / 0.3);
      p = (0.35 + 0.4 * dial(b, 'thrift')) * (1 - 0.6 * gap) + sweet;
      why = gap > 0.5 ? 'they are well ahead of you' : 'they are ahead of you';
    } else {
      /* you are ahead: the truce is theirs to want */
      p = 0.55 + 0.35 * Math.min(1, (oa - ob) / 0.2) + sweet * 0.5;
      why = 'they need the quiet more than you do';
    }
    return { possible: true, p: Math.max(0.03, Math.min(0.95, p)), why };
  }

  function considerPact(rng, a, b, ctx) {
    if (ctx.sealed(a) || ctx.sealed(b)) return null;
    if (ctx.principalOf(a).id === ctx.principalOf(b).id) return null;
    const oa = ctx.odds[ctx.principalOf(a).id] || 0, ob = ctx.odds[ctx.principalOf(b).id] || 0;
    /* The weaker side wants it; the stronger side wants paying for it. §6.13: a hungry OA wants
       no truce, one that wants out wants one badly; an OA that will not deal with you will not
       sign a truce with you either. */
    if (oa >= ob) return null;
    if (refusesOutright(b, a) || refusesOutright(a, b)) return null;
    const app = ctx.corps ? appetite(a, ctx).value : 1;
    const want = (ob - oa) * (1 - dial(a, 'aggression')) * (2 - app);
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

  /* what one body costs its OA to lose: the pension the contract promises and the signing it
     takes to replace him — the same figure `bodyMoney` averages for the table */
  function bodyWorth(fighter) {
    const c = (fighter && fighter.contract) || {};
    return ((c.death_benefit || 0) + (c.signing_cost || 0) * (1 + CONST.REPLACEMENT_SIGNING))
         * (1 + CONST.RANSOM_FAME * (fighter.fame || 0));
  }
  function ransomPrice(fighter) {
    return Math.round(Math.max(300, bodyWorth(fighter)) * CONST.RANSOM_MARKUP);
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
  /* THE CAPTOR'S SIDE: will it sell him back, and for how much. Null when it will not. */
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
  function considerRansom(rng, captor, owner, fighter, ctx) {
    const deal = ransomOffer(rng, captor, owner, fighter, ctx);
    if (!deal) return null;
    return ransomWorthPaying(owner, fighter, deal.price, ctx) ? deal : null;
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
    /* §6.13 and what the captor actually thinks of the owner today, which the profiles'
       written relationships never move: an OA that was spared releases; one left to die kills */
    const living = livingRegard(captor, owner);
    if (living != null) {
      if (living > 30) { rel *= 1 + living / 100; kill *= 1 - living / 200; }
      else if (living < -30) { kill *= 1 - living / 100; rel *= 1 + living / 200; }
    }
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

  /** The Aleas rules on it. Being in good odour buys you what an unpopular corp cannot. */


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
  /**
   * §4.1 THE HAUL SETTLES DOWN THE CHAIN. `banked` is { corpId: { category: units, ... } } as
   * dug. Each deal's resource terms move a share of what the principal HOLDS — its own digging
   * plus what came down to it — to the joiner, roots first, so a share of a share is exactly
   * that. A term marked `win` pays only under the winning banner. Nothing banked, nothing owed.
   */
  function settleHaul(banked, corps, deals, winnerId, categories) {
    const cats = categories || ['minerals', 'fuels', 'luxuries', 'foods'];
    const byPrincipal = {};
    for (const d of deals || []) {
      if (d.void || !(d.resources && d.resources.length)) continue;
      (byPrincipal[d.principal] = byPrincipal[d.principal] || []).push(d);
    }
    const lines = [];
    /* §WITHDRAWAL nobody stands under anybody: an OA that conceded took its people off the
       planet, it did not become part of the buyer. Every corp answers for itself. */
    const rootOf = id => id;
    const paid = {};
    function payChain(pid) {
      if (paid[pid]) return; paid[pid] = true;
      const list = (byPrincipal[pid] || []).slice().sort((a, b) => a.day - b.day);
      for (const d of list) {
        for (const t of d.resources) {
          if (t.when === 'win' && rootOf(pid) !== winnerId) continue;
          if (cats.indexOf(t.category) < 0) continue;
          const held = (banked[pid] || {})[t.category] || 0;
          const amt = held * t.share;
          if (amt <= 0) continue;
          banked[pid][t.category] = held - amt;
          banked[d.joiner] = banked[d.joiner] || {};
          banked[d.joiner][t.category] = (banked[d.joiner][t.category] || 0) + amt;
          lines.push({ from: pid, to: d.joiner, category: t.category, units: amt, day: d.day });
        }
        payChain(d.joiner);
      }
    }
    for (const c of corps) if (!c.joinedTo) payChain(c.id);
    for (const c of corps) payChain(c.id);
    return lines;
  }

  function settle(rng, corps, opts) {
    const pot = opts.pot;
    const winnerId = opts.winnerId;
    const deals = opts.deals || [];
    const lines = [];
    const take = {};                    /* corp id → credits */
    for (const c of corps) take[c.id] = 0;

    /* §2.2 WHAT A HAUL IS. The units an OA works out of the ground go to its OWN STORES —
       that is the point of the Divide, and the board's demand is written in those units. What
       is settled here is the second half of it: the fleet buys whatever an OA does not need
       at the going rate, and that is the money on this line. The stores are filled from
       `banked` at the season's close, not here; this is the sale, not the haul. */
    /* §PRIZE THE HAUL IS NOT SOLD HERE ANY MORE. It paid every dug unit in credits at the
       settlement AND stored it in the digger's holds, so a site paid twice for one haul; and it
       paid the winner the credit value of every UNDUG site on top of the pot, which the pot's
       resources now carry instead. What is dug goes to the digger's stores, and only what a
       full store cannot hold is sold on — at the season's close, where the holds are (see
       reputation.js `fillHolds`). */
    const haulPaid = 0;

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
        /* §WITHDRAWAL (stage 3) A CONCESSION IS PAID, NOT WAGERED. Under the old deal the loser
           fought on under the buyer's flag, so being paid a share of what the buyer won was
           right: it was on their side. A withdrawal is the opposite — the ground was conceded
           and the people went home — so the CREDITS agreed are a debt owed for that ground and
           are paid first, before any share of winnings. Paying them last made a concession a
           wager on the buyer: measured, two of three withdrawing OAs were paid NOTHING because
           their buyer did not win, which is also part of why the price is wrong. */
        const held = take[pid];
        let cash, shareAmt;
        if (d.withdraws) {
          cash = Math.min(d.credits, Math.max(0, held));
          shareAmt = Math.round(Math.max(0, held - cash) * d.share);
          if (cash < d.credits) lines.push({ corp: pid, kind: 'owed', amount: -(d.credits - cash), to: d.joiner });
        } else {
          shareAmt = Math.round(held * d.share);
          cash = Math.min(d.credits, Math.max(0, take[pid] - shareAmt));
        }
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
      take[winnerId] -= bonuses.total;
      lines.push({ corp: winnerId, kind: 'win_bonuses', amount: -bonuses.total });
    }

    return { lines: lines, take: take, pot: pot, winnerId: winnerId,
             paidFromPot: pot, haulPaid: haulPaid, bonuses: bonuses };
  }

  const api = {
    CONST, RICHNESS_LEAN, STANCE_LIFE_MULT, rollPot,
    corpForce, believedForce, oddsBoard, priceModifier, relationship, livingRegard, appetite, bodyWorth, termsValue, considerPact, pactChance,
    wantOf, settleHaul,
    ransomPrice, considerRansom, ransomOffer, ransomWorthPaying, resolveCaptive,
    settle
  };
  if (isNode) module.exports = api;
  global.CDNEG = api;
})(typeof window !== "undefined" ? window : globalThis);
