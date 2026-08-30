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
       shape is what is being built: that money is conditional, that a sponsor backs one house,
       and that a sponsor who likes you this year is a sponsor you can disappoint. */
    COURT_MONTHS: 2,             // [S] months between courting a house and it hearing
    REGARD_SPAN: 60,             // [S] regard runs -60..+60; it gates who will talk to you
    /* --- COURTING SPONSORS (the rework). A sponsor backs at most ONE house a year. You court
       with focus, which both raises regard (the slow, cross-year memory) and counts as this
       year's effort; at the season open each sponsor signs whichever courting house it favours
       most, by regard PLUS this year's effort. A signed contract pays a modest ADVANCE now and
       a large COMPLETION REWARD (cash or in-kind) if its condition is met at the close, nothing
       if not. The focus a contract costs to court FALLS gently as contracts across the fleet
       are taken, and regard discounts it further — so the one you want is worth grabbing early,
       and a leftover is a consolation, never a trap. Failure moves regard hard, and regard is
       the only thing that crosses the year: a burned sponsor simply favours you far less. */
    COURT_COST_BASE: 3,          // [H] focus to court a contract when the board is untouched
    COURT_COST_DROP: 0.35,       // [H] focus knocked off the rest per contract signed anywhere
    COURT_COST_FLOOR: 1,         // [H] a contract never costs less than this to court
    COURT_REGARD_DISCOUNT: 1.5,  // [H] focus a full-regard house takes off your courting cost
    SPONSOR_ADVANCE: 6000,       // [H] the modest money-now, part-repaying the focus you sank
    SPONSOR_REWARD: 40000,       // [H] the big completion payout — cash, or its value in kind
    SPONSOR_FAIL_REGARD: -22,    // [H] a failed condition sours the house hard (the only memory)
    SPONSOR_KEPT_REGARD: 10,     // [H] a kept one warms it
    SPONSOR_COURT_REGARD: 2,     // [H] regard each focus of courting builds, kept or not
    SPONSOR_ENERGY_FRAC: 0.75    // [H] the share of the drop a 'mostly energy' limitation wants
  };

  /* WHAT EACH HOUSE IS BUYING. Read off the written `sponsor_style` of each profile rather than
     invented alongside it, so the fiction and the mechanism cannot drift apart. Each has a
     `wants` — the corp behaviour it rewards — and an `obligation` it attaches. */
  /* THE SPONSOR ROSTER. Sponsors are NOT the eight corps that contest the Divide — you would be
     courting your rivals, and yourself. They are the suppliers who profit FROM the Divide without
     dropping into it: arms makers, a power cartel, a biotech house, freight and salvage concerns.
     Each backs at most one corp a year and wants that corp to play in a way that suits its trade.
     Their ids live in their own namespace (spn_*) so nothing collides with a corp id. */
  const HOUSE_NAMES = {
    spn_castellan:  'Castellan Munitions',
    spn_helion:     'Helion Power Cartel',
    spn_thorne:     'Thorne Biotic',
    spn_arrowline:  'Arrowline Freight',
    spn_greywater:  'Greywater Salvage',
    spn_meridian:   'Meridian Optics',
    spn_ferrous:    'Ferrous Guild',
    spn_almsdesk:   'The Alms Desk'
  };

  const STYLES = {
    spn_castellan:  { wants: 'aggression', obligation: 'aggressive',
                      blurb: 'an arms house that backs corps who actually fight; no interest in a banner that withdraws' },
    spn_helion:     { wants: 'clean',      obligation: 'no_scandal',
                      blurb: 'a power cartel selling energy weapons; wants its backer fielding them, and winning clean' },
    spn_thorne:     { wants: 'survival',   obligation: 'bring_them_home',
                      blurb: 'a biotech concern; sells trauma kit and wants most of who you send brought home' },
    spn_arrowline:  { wants: 'underdog',   obligation: 'stay_lean',
                      blurb: 'the most efficient bulk freight in the Divide; backs lean drops, not juggernauts' },
    spn_greywater:  { wants: 'leverage',   obligation: 'accept_terms',
                      blurb: 'a salvage combine; its drops arrive with conditions, and the conditions have conditions' },
    spn_meridian:   { wants: 'talent',     obligation: 'field_talent',
                      blurb: 'optics and targeting; backs whoever fields the year’s standout, wherever the talent is' },
    spn_ferrous:    { wants: 'constancy',  obligation: 'keep_policy',
                      blurb: 'an old armour guild; long money and heirloom gear for corps that keep their declared policy' },
    spn_almsdesk:   { wants: 'anyone',     obligation: 'none',
                      blurb: 'a relief charter; medkits and evac to any banner, and it is paid either way' }
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

  /* THE NEW-MODEL CONDITIONS. Each house offers one condition, in one of three flavours:
       - outcome:      judged at the season close against figures the game produces (finish,
                       losses, fame, surplus) — the engine already knows how to read these;
       - limitation:   a constraint on HOW you played (e.g. most of your kit is energy) — read
                       from the drop's composition (wired in Pass B);
       - prerequisite: a gate that must already be true to keep the deal (checked mid/close).
     The reward is cash by default; some houses pay in kind, which is both more thematic and a
     nudge toward being the sort of corp that fits them. Kit rewards are granted in Pass B; the
     shape is here so the model is whole. */
  const CONDITIONS = {
    spn_helion:      { flavor: 'limitation',   key: 'mostly_energy',
                          text: 'Field a drop that is mostly energy weapons',
                          reward: { kind: 'kit', tag: 'energy', count: 2 } },
    spn_castellan:        { flavor: 'outcome',      key: 'no_scandal',
                          text: 'Lose no more than a third of who you send',
                          reward: { kind: 'cash' } },
    spn_ferrous:    { flavor: 'prerequisite', key: 'keep_policy',
                          text: 'Keep your declared engagement policy all year',
                          reward: { kind: 'cash' } },
    spn_meridian:       { flavor: 'outcome',      key: 'field_talent',
                          text: 'Field someone who finishes among the fleet\u2019s best',
                          reward: { kind: 'cash' } },
    spn_arrowline:            { flavor: 'limitation',   key: 'stay_lean',
                          text: 'Field no more than 20 \u2014 they back underdogs',
                          reward: { kind: 'cash' } },
    spn_greywater:     { flavor: 'outcome',      key: 'accept_terms',
                          text: 'End the season in surplus; the combine audits',
                          reward: { kind: 'cash' } },
    spn_thorne:         { flavor: 'outcome',      key: 'bring_them_home',
                          text: 'Bring back at least four in five of who you send',
                          reward: { kind: 'kit', tag: 'medical', count: 2 } },
    spn_almsdesk:        { flavor: 'outcome',      key: 'none',
                          text: 'None \u2014 the Desk is paid either way',
                          reward: { kind: 'cash' } }
  };


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

  /* ===================== COURTING SPONSORS — the rework ===================== */

  /* THE YEAR'S BOARD. Every house that has not already committed to someone is available to
     court. Built once at the season open and held on the season state, because the falling
     cost is a fleet-wide fact — a contract signed by anybody makes the rest cheaper for
     everybody. `signedBy` maps houseId -> corpId once a sponsor commits (one OA per house). */
  function openBoard(houseIds) {
    const board = { houses: {}, signedBy: {}, taken: 0 };
    for (const h of houseIds) if (CONDITIONS[h]) {
      const cond = CONDITIONS[h];
      board.houses[h] = { house: h, flavor: cond.flavor, key: cond.key,
                          text: cond.text, reward: cond.reward };
    }
    return board;
  }

  /* what it costs THIS corp, in focus, to court a given house right now: the base, minus a
     gentle drop for every contract already taken across the fleet, minus a regard discount,
     never below the floor. Shallow by design — a discount sweetens a leftover without ever
     making waiting the smart play. */
  function courtCost(board, corp, houseId) {
    let c = CONST.COURT_COST_BASE - board.taken * CONST.COURT_COST_DROP;
    c -= (regardOf(corp, houseId) / CONST.REGARD_SPAN) * CONST.COURT_REGARD_DISCOUNT;
    return Math.max(CONST.COURT_COST_FLOOR, c);
  }

  /* COURT. Spend focus on a house this season: it raises regard (the slow memory) and records
     this year's effort, which together decide who the sponsor signs. Courting never fails and
     never evaporates — even if you lose the sign, the regard stands for next year. `effort` is
     the focus put in; it is remembered on the corp for the season-open resolution. */
  function court(corp, houseId, effort) {
    corp.sponsors = corp.sponsors || { regard: {}, contracts: [], offers: [], courted: {} };
    const S = corp.sponsors;
    S.courting = S.courting || {};
    S.courting[houseId] = (S.courting[houseId] || 0) + (effort || 1);
    bumpRegard(corp, houseId, (effort || 1) * CONST.SPONSOR_COURT_REGARD);
  }

  /* a corp's standing for the sign: regard PLUS this year's courting effort. Standing is what
     the sponsor weighs when more than one house is at its door. */
  function courtStanding(corp, houseId) {
    const eff = ((corp.sponsors || {}).courting || {})[houseId] || 0;
    return regardOf(corp, houseId) + eff * CONST.SPONSOR_COURT_REGARD;
  }

  /* RESOLVE THE BOARD at the season open: each still-open house signs the courting corp with
     the highest standing, one OA per house. Signing pays the advance and lands a live contract
     carrying its condition and reward. Returns a per-corp summary of what was signed. */
  function resolveBoard(board, corps, ids) {
    const signed = {};
    for (const h in board.houses) {
      if (board.signedBy[h]) continue;
      let best = null, bestStanding = -Infinity;
      for (const id of ids) {
        const eff = ((corps[id].sponsors || {}).courting || {})[h] || 0;
        if (eff <= 0) continue;                    /* only courting corps are in the running */
        const st = courtStanding(corps[id], h);
        if (st > bestStanding) { bestStanding = st; best = id; }
      }
      if (!best) continue;
      const corp = corps[best], def = board.houses[h];
      corp.sponsors.contracts = corp.sponsors.contracts || [];
      corp.sponsors.contracts.push({
        house: h, flavor: def.flavor, key: def.key, text: def.text,
        reward: def.reward, advance: CONST.SPONSOR_ADVANCE, seasonsServed: 0, term: 1
      });
      board.signedBy[h] = best;
      board.taken++;
      LED.post(corp.account, 'income', 'sponsor advance (' + h + ')', CONST.SPONSOR_ADVANCE);
      (signed[best] = signed[best] || []).push({ house: h, text: def.text, reward: def.reward });
    }
    return signed;
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
   * Did the corp keep what it promised? Judged at the season close against what actually
   * happened, and every one of these reads a figure the game already produces — an obligation
   * scored off a number invented for the purpose would be a contract with the sponsor's own
   * bookkeeping, not with the game.
   */
  /* JUDGE the season's contracts at the close. Each contract's condition is read against the
     figures the game produced; kept pays its reward (cash now; kit in Pass B) and warms the
     house, broken pays nothing and sours it hard. Regard is the only thing that crosses the
     year. Outcome conditions are judged here; limitation and prerequisite flavours read extra
     figures wired in Pass B, and fall through to their outcome-style reading until then. */
  function judge(corp, record) {
    const S = corp.sponsors || { contracts: [] };
    const out = { kept: [], broken: [], paid: 0, advance: 0, rewards: [] };
    const sent = record.dropped || 0, dead = record.dead || 0;
    const came = sent > 0 ? 1 - dead / sent : 1;
    for (const c of (S.contracts || [])) {
      out.advance += c.advance || 0;       /* what was already paid on signing, for the record */
      let ok = true;
      switch (c.key) {
        /* --- limitation flavour: a constraint on HOW you played, read from the drop --- */
        case 'mostly_energy':   ok = (record.energyFraction || 0) >= CONST.SPONSOR_ENERGY_FRAC; break;
        case 'stay_lean':       ok = (record.dropSize != null ? record.dropSize : sent) <= 20; break;
        /* --- prerequisite flavour: a standing gate that must hold all year --- */
        case 'keep_policy':     ok = !record.policyChanged; break;
        /* --- outcome flavour: judged against the season's figures --- */
        case 'no_scandal':      ok = sent === 0 || dead / sent <= 1 / 3; break;
        case 'field_talent':    ok = (record.bestFame || 0) >= 25; break;
        case 'accept_terms':    ok = (record.treasury || 0) > 0; break;
        case 'bring_them_home': ok = came >= 0.8; break;
        case 'none':            ok = true; break;
        default:                ok = true; break;
      }
      c.seasonsServed++;
      if (!ok) {
        out.broken.push({ house: c.house, text: c.text });
        bumpRegard(corp, c.house, CONST.SPONSOR_FAIL_REGARD);
        continue;
      }
      out.kept.push({ house: c.house });
      bumpRegard(corp, c.house, CONST.SPONSOR_KEPT_REGARD);
      /* PAY THE REWARD. Cash posts to the ledger now; an in-kind reward is granted in Pass B
         (the seam is here — the reward object is carried out for the granter to honour). */
      const rw = c.reward || { kind: 'cash' };
      if (rw.kind === 'cash') {
        LED.post(corp.account, 'income', 'sponsor reward (' + c.house + ')', CONST.SPONSOR_REWARD);
        out.paid += CONST.SPONSOR_REWARD;
      }
      out.rewards.push({ house: c.house, reward: rw });
    }
    S.contracts = [];                    /* one-season terms: the board is fresh every year */
    return out;
  }

  /** Who is worth courting — the suppliers that would plausibly back this corp. */
  function prospects(corp) {
    return Object.keys(CONDITIONS)
      .map(h => ({ house: h, fit: fit(corp, h), regard: regardOf(corp, h),
                   flavor: CONDITIONS[h].flavor, text: CONDITIONS[h].text,
                   reward: CONDITIONS[h].reward,
                   courting: ((corp.sponsors || {}).courting || {})[h] || 0 }))
      .sort((a, b) => (b.fit + b.regard / CONST.REGARD_SPAN) - (a.fit + a.regard / CONST.REGARD_SPAN));
  }

  /** The suppliers on the board — the id list the season builds its board from. */
  function houseIds() { return Object.keys(CONDITIONS); }
  /** A supplier's display name. */
  function houseName(h) { return HOUSE_NAMES[h] || h; }

  /* LIVE STATUS OF A SIGNED CONTRACT, mid-season. Some conditions can be read honestly before
     the drop — a policy either still holds or it does not, a treasury is in surplus or it is not,
     a standout is already fielded or not. Others depend on the drop that does not exist until the
     lock (how much of it is energy, how many come home), and those read 'pending' rather than
     guess. `state` is one of: 'holding' (on track), 'atrisk' (currently failing a live gate),
     'met' (already satisfied and cannot un-satisfy), 'pending' (unknowable until the drop). */
  function contractStatus(corp, contract) {
    const alive = (corp.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired');
    const bestFame = alive.reduce((m, f) => Math.max(m, f.fame || 0), 0);
    switch (contract.key) {
      case 'keep_policy':
        return corp._policyChanged
          ? { state: 'atrisk', word: 'Policy changed \u2014 broken' }
          : { state: 'holding', word: 'Policy held so far' };
      case 'accept_terms':
        return (corp.account.treasury || 0) > 0
          ? { state: 'holding', word: 'In surplus' }
          : { state: 'atrisk', word: 'In the red \u2014 must end in surplus' };
      case 'field_talent':
        return bestFame >= 25
          ? { state: 'met', word: 'A standout is already fielded' }
          : { state: 'holding', word: 'Best on the books: fame ' + Math.round(bestFame) };
      case 'stay_lean':
        return alive.length <= 20
          ? { state: 'holding', word: 'Roster at ' + alive.length + ' \u2014 lean enough' }
          : { state: 'atrisk', word: 'Roster at ' + alive.length + ' \u2014 must drop 20 or fewer' };
      case 'none':
        return { state: 'met', word: 'No condition \u2014 paid either way' };
      case 'mostly_energy':
        return { state: 'pending', word: 'Judged at the drop \u2014 field mostly energy weapons' };
      case 'no_scandal':
        return { state: 'pending', word: 'Judged at the drop \u2014 keep losses under a third' };
      case 'bring_them_home':
        return { state: 'pending', word: 'Judged at the drop \u2014 bring back four in five' };
      default:
        return { state: 'pending', word: 'Judged at the season close' };
    }
  }

  return { CONST, STYLES, OBLIGATION_TEXT, CONDITIONS, HOUSE_NAMES, houseIds, houseName,
           contractStatus,
           fit, regardOf, bumpRegard,
           openBoard, courtCost, court, courtStanding, resolveBoard,
           judge, prospects };
}));
