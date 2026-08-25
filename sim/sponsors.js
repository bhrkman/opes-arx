/* Capital Divide — /sim/sponsors.js
 *
 * SPONSORSHIP. Deferred whole for several steps rather than half-built, because an income line
 * with no contracts behind it is a number nothing argues over — you would watch it go up and
 * have nothing to decide. The deferral named four things that had to arrive together: motives,
 * exclusivity, contracts, and the allocation verb. All four are here.
 *
 * WHO THE SPONSORS ARE. The same eight houses. Every profile already carried a written
 * `sponsor_style` — Nevlon sponsors aggression, the Knights' Star sponsors precision and is
 * allergic to scandal, Vantis sponsors leverage and its conditions have conditions — so the
 * motives were sitting in the data waiting for a reader. A house backs rivals it approves of,
 * which is a sharper relationship than an anonymous cheque: the money comes from somebody who
 * is also trying to beat you, and who will pull it if you stop being the thing they liked.
 *
 * WHAT A CONTRACT IS. A retainer per season, a term in seasons, and an obligation you can fail.
 * The obligation is the whole point — a contract you cannot break is a subsidy. Failing one
 * costs you the retainer and the sponsor's regard; keeping one through the term is what
 * renewals are built on.
 *
 * EXCLUSIVITY is the constraint that makes it a choice rather than a collection. An exclusive
 * offer pays substantially more and locks out every other banner for its term, so the question
 * is never "do I want money" but "is this one worth the other seven".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./prng.js'), require('./ledger.js'), require('./reputation.js'));
  else root.CDSPONSOR = factory(root.CDPRNG, root.CDLEDGER, root.CDREP);
}(typeof self !== 'undefined' ? self : this, function (P, LED, REP) {
  'use strict';

  const CONST = {
    /* [H] None of these are fitted. Nobody has played a season with sponsors in it, and the
       shape is what is being built: that money is conditional, that exclusivity costs the other
       seven, and that a sponsor who likes you this year is a sponsor you can disappoint. */
    OFFERS_PER_SEASON: 3,        // [S] how many houses put something on the table a year
    BASE_RETAINER: 26000,        // [H] a season's money from an ordinary backer
    FIT_SWING: 0.9,              // [H] how far a good match moves the retainer, either way
    EXCLUSIVE_MULT: 2.1,         // [H] what one banner pays to be the only banner
    EXCLUSIVE_P: 0.34,           // [H] chance a given offer wants you to itself
    TERM_MIN: 1, TERM_MAX: 3,    // [S] seasons
    COURT_LIFT: 0.16,            // [H] what one month of courting adds to the offers you see
    COURT_CAP: 0.48,             // [H] and the most any amount of it can add
    COURT_MONTHS: 2,             // [S] months between courting a house and hearing back
    BREACH_REGARD: -18,          // [H] what failing an obligation does to that house's regard
    KEPT_REGARD: 6,              // [H] and what seeing out a season of one does
    REGARD_SPAN: 60              // [S] regard runs -60..+60; it gates who will talk to you
  };

  /* WHAT EACH HOUSE IS BUYING. Read off the written `sponsor_style` of each profile rather than
     invented alongside it, so the fiction and the mechanism cannot drift apart. Each has a
     `wants` — the corp behaviour it rewards — and an `obligation` it attaches. */
  const STYLES = {
    nevlon_collective:  { wants: 'aggression', obligation: 'aggressive',
                          blurb: 'drops favour ammunition and armour; withdraws from banners that will not fight' },
    knights_star:       { wants: 'clean',      obligation: 'no_scandal',
                          blurb: 'precision and clean records; allergic to scandal' },
    violets_enterprise: { wants: 'constancy',  obligation: 'keep_policy',
                          blurb: 'long retainers and heirloom gear, for corps that keep their declared policy' },
    alliance_house:     { wants: 'talent',     obligation: 'field_talent',
                          blurb: 'talent wherever it is; exclusivity costs extra and expires quickly' },
    new_line:           { wants: 'underdog',   obligation: 'stay_lean',
                          blurb: 'underdogs and clean fights; the most efficient bulk freight in the Divide' },
    vantis_deepcore:    { wants: 'leverage',   obligation: 'accept_terms',
                          blurb: 'leverage: drops arrive with conditions, and the conditions have conditions' },
    verdant_cradle:     { wants: 'survival',   obligation: 'bring_them_home',
                          blurb: 'ration drops, water kit, medical basics — unglamorous and always welcome' },
    mercy_concern:      { wants: 'anyone',     obligation: 'none',
                          blurb: 'medkits and evac retainers to all eight banners; the Concern gets paid either way' }
  };

  const OBLIGATION_TEXT = {
    aggressive:      'field at least 20 and do not call an early withdrawal',
    no_scandal:      'lose no more than a third of who you send',
    keep_policy:     'do not change your declared engagement policy',
    field_talent:    'field somebody who finishes the year among the fleet\u2019s best',
    stay_lean:       'field no more than 20 \u2014 they back underdogs, not juggernauts',
    accept_terms:    'end the season in surplus; the Combine audits',
    bring_them_home: 'bring back at least four in five of who you send',
    none:            'none \u2014 the Concern gets paid either way'
  };

  /** How much a house currently likes a corp. Signed; starts neutral. */
  function regardOf(corp, houseId) {
    corp.sponsors = corp.sponsors || { regard: {}, contracts: [], offers: [], courted: {} };
    const r = corp.sponsors.regard;
    return r[houseId] == null ? 0 : r[houseId];
  }

  function bumpRegard(corp, houseId, delta) {
    corp.sponsors = corp.sponsors || { regard: {}, contracts: [], offers: [], courted: {} };
    const r = corp.sponsors.regard;
    r[houseId] = Math.max(-CONST.REGARD_SPAN,
                 Math.min(CONST.REGARD_SPAN, (r[houseId] || 0) + delta));
  }

  /**
   * HOW WELL A CORP MATCHES WHAT A HOUSE BUYS. Everything here is read off things the corp has
   * actually done — its dials, its losses, its roster — rather than a hidden affinity number,
   * so a manager can work out why somebody is interested without being told.
   */
  function fit(corp, houseId) {
    const style = STYLES[houseId];
    if (!style) return 0.5;
    const dials = (corp.profile && corp.profile.dials) || {};
    const hist = corp.history || [];
    const last = hist[hist.length - 1] || {};
    const sent = last.dropped || 0, lost = last.dead || 0;
    const came = sent > 0 ? 1 - lost / sent : 0.75;
    const alive = (corp.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired');
    switch (style.wants) {
      case 'aggression': return Math.min(1, (dials.aggression || 50) / 90);
      case 'clean':      return came;
      case 'constancy':  return Math.min(1, 0.35 + (dials.thrift || 50) / 140);
      case 'talent':     return Math.min(1, alive.length ? alive.reduce(
                                  (t, f) => t + (f.fame || 0), 0) / (alive.length * 40) : 0.3);
      case 'underdog':   return Math.max(0, 1 - alive.length / 30);
      case 'leverage':   return Math.min(1, (dials.treachery || 50) / 90);
      case 'survival':   return came;
      default:           return 0.6;                    /* the Concern backs anybody */
    }
  }

  /**
   * The offers on the table this season. Generated at the season open so a manager can weigh
   * them across the year, and re-generated per season rather than persisting: a sponsor's
   * patience is a season long.
   */
  function makeOffers(rng, corp, houseIds) {
    const pool = houseIds.filter(h => h !== corp.id && STYLES[h]);
    /* the houses that like you most are the ones that turn up */
    const ranked = pool.map(h => ({ h, score: fit(corp, h) + regardOf(corp, h) / CONST.REGARD_SPAN
                                              + rng() * 0.25 }))
                       .sort((a, b) => b.score - a.score)
                       .slice(0, CONST.OFFERS_PER_SEASON);
    const courted = (corp.sponsors && corp.sponsors.courted) || {};
    return ranked.map(r => {
      const f = fit(corp, r.h);
      const lift = Math.min(CONST.COURT_CAP, (courted[r.h] || 0) * CONST.COURT_LIFT);
      const exclusive = rng() < CONST.EXCLUSIVE_P;
      const base = CONST.BASE_RETAINER * (1 - CONST.FIT_SWING / 2 + f * CONST.FIT_SWING + lift);
      const style = STYLES[r.h];
      return {
        house: r.h,
        retainer: Math.round(base * (exclusive ? CONST.EXCLUSIVE_MULT : 1)),
        term: CONST.TERM_MIN + Math.floor(rng() * (CONST.TERM_MAX - CONST.TERM_MIN + 1)),
        exclusive: exclusive,
        obligation: style.obligation,
        obligationText: OBLIGATION_TEXT[style.obligation],
        blurb: style.blurb,
        fit: f,
        courted: courted[r.h] || 0
      };
    });
  }

  /** Sign one of the offers on the table. Returns why not, if not. */
  function accept(corp, houseId) {
    corp.sponsors = corp.sponsors || { regard: {}, contracts: [], offers: [], courted: {} };
    const S = corp.sponsors;
    const offer = (S.offers || []).filter(o => o.house === houseId)[0];
    if (!offer) return { ok: false, why: 'that house has nothing on the table' };
    if (S.contracts.some(c => c.house === houseId)) return { ok: false, why: 'already signed with them' };
    /* EXCLUSIVITY, in both directions: an exclusive deal locks out everybody else, and nobody
       else will sign you while one is running. This is the constraint that makes the offers a
       choice rather than a shopping list. */
    if (S.contracts.some(c => c.exclusive))
      return { ok: false, why: 'an exclusive contract locks out every other banner' };
    if (offer.exclusive && S.contracts.length)
      return { ok: false, why: 'they want you to themselves, and you are already signed elsewhere' };
    S.contracts.push({
      house: houseId, retainer: offer.retainer, term: offer.term, seasonsServed: 0,
      exclusive: offer.exclusive, obligation: offer.obligation,
      obligationText: offer.obligationText
    });
    S.offers = S.offers.filter(o => o.house !== houseId);
    /* PAID ON SIGNING, not at the next season open. Retainers are posted for running contracts
       when a year opens, so a deal struck in M4 would otherwise pay nothing in the year it was
       struck and the decision would have no consequence a manager could feel until next
       January. You sign, the money arrives. */
    LED.post(corp.account, 'income', 'sponsor retainer (' + houseId + ')', offer.retainer);
    return { ok: true, retainer: offer.retainer };
  }

  /** Pay the retainers. Called once at the season open, after contracts are settled. */
  function payRetainers(corp) {
    let total = 0;
    for (const c of ((corp.sponsors || {}).contracts || [])) {
      LED.post(corp.account, 'income', 'sponsor retainer (' + c.house + ')', c.retainer);
      total += c.retainer;
    }
    return total;
  }

  /**
   * Did the corp keep what it promised? Judged at the season close against what actually
   * happened, and every one of these reads a figure the game already produces — an obligation
   * scored off a number invented for the purpose would be a contract with the sponsor's own
   * bookkeeping, not with the game.
   */
  function judge(corp, record) {
    const S = corp.sponsors || { contracts: [] };
    const out = { kept: [], broken: [], lost: 0, paid: 0 };
    const sent = record.dropped || 0, dead = record.dead || 0;
    const came = sent > 0 ? 1 - dead / sent : 1;
    const keep = [];
    for (const c of S.contracts) {
      let ok = true;
      switch (c.obligation) {
        case 'aggressive':      ok = sent >= 20 && !record.calledWithdrawal; break;
        case 'no_scandal':      ok = sent === 0 || dead / sent <= 1 / 3; break;
        case 'keep_policy':     ok = !record.policyChanged; break;
        case 'field_talent':    ok = (record.bestFame || 0) >= 25; break;
        case 'stay_lean':       ok = sent <= 20; break;
        case 'accept_terms':    ok = (record.treasury || 0) > 0; break;
        case 'bring_them_home': ok = came >= 0.8; break;
        default:                ok = true; break;
      }
      c.seasonsServed++;
      if (!ok) {
        out.broken.push({ house: c.house, obligation: c.obligationText });
        out.lost += c.retainer;
        bumpRegard(corp, c.house, CONST.BREACH_REGARD);
        LED.post(corp.account, 'expense', 'sponsor breach (' + c.house + ')', -c.retainer);
        continue;                                   /* the contract ends there */
      }
      out.kept.push({ house: c.house });
      bumpRegard(corp, c.house, CONST.KEPT_REGARD);
      if (c.seasonsServed < c.term) keep.push(c);   /* still running */
    }
    S.contracts = keep;
    return out;
  }

  /** What courting a house buys: better offers next season, not this one. */
  function court(corp, houseId) {
    corp.sponsors = corp.sponsors || { regard: {}, contracts: [], offers: [], courted: {} };
    corp.sponsors.courted[houseId] = (corp.sponsors.courted[houseId] || 0) + 1;
  }

  /**
   * WHAT AN AI CORP DOES ABOUT ITS OFFERS. The fleet has to play this too, or sponsorship is a
   * subsidy only the player receives and every measured distribution in the game tilts. It is
   * deliberately a simple appetite rather than a clever one: take the best money on the table,
   * and only take an exclusive if it beats what the other offers would pay together — which is
   * the same question a person is being asked, answered plainly.
   */
  function autoSign(corp) {
    const S = corp.sponsors || { offers: [], contracts: [] };
    if (!S.offers || !S.offers.length || (S.contracts || []).length) return null;
    const exclusive = S.offers.filter(o => o.exclusive);
    const open = S.offers.filter(o => !o.exclusive);
    const openTotal = open.reduce((t, o) => t + o.retainer, 0);
    const bestEx = exclusive.sort((a, b) => b.retainer - a.retainer)[0];
    if (bestEx && bestEx.retainer > openTotal) return accept(corp, bestEx.house);
    const bestOpen = open.sort((a, b) => b.retainer - a.retainer)[0];
    if (!bestOpen) return null;
    const first = accept(corp, bestOpen.house);
    /* non-exclusive deals stack, so take the rest of them too */
    for (const o of open.slice(1)) accept(corp, o.house);
    return first;
  }

  /** Who is worth courting — the houses that would plausibly back this corp. */
  function prospects(corp, houseIds) {
    return houseIds.filter(h => h !== corp.id && STYLES[h])
      .map(h => ({ house: h, fit: fit(corp, h), regard: regardOf(corp, h),
                   wants: STYLES[h].wants, blurb: STYLES[h].blurb,
                   courted: ((corp.sponsors || {}).courted || {})[h] || 0 }))
      .sort((a, b) => (b.fit + b.regard / CONST.REGARD_SPAN) - (a.fit + a.regard / CONST.REGARD_SPAN));
  }

  return { CONST, STYLES, OBLIGATION_TEXT, fit, regardOf, bumpRegard, makeOffers, accept, autoSign,
           payRetainers, judge, court, prospects };
}));
