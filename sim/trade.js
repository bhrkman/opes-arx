/* ============================================================================
 * trade.js — DEALING BETWEEN CORPORATIONS, ACROSS THE PREP YEAR.
 *
 * The Divide's own dealing (joining under a banner, ceding, ransoms, pacts) lives in
 * negotiate.js and happens inside a contest. This is the other thing: two OAs sitting
 * down between contests and swapping what one has for what the other needs — gear,
 * people, credits, and what you know about somebody else.
 *
 * WHAT A THING IS WORTH. Nothing here invents a currency. Every price is anchored to a
 * number the game already uses somewhere else:
 *
 *   gear     the catalogue cost, which is what it costs to buy one.
 *   credits  face value.
 *   intel    the game already sells focus: BOOST_PER_POINT credits doubles one point for a
 *            month, and a pip of focus buys INTEL_PER_PIP dossier rows. So a row has a
 *            price the manager already pays, plus a premium for the preparedness edge the
 *            dossier carries into the Divide.
 *   a body   WORTH MINUS WAGE, because a contract travels with the person (ruled). Worth is
 *            quality × CREDITS_PER_QUALITY per remaining season, lifted by fame, plus a
 *            slice of unrealised potential. The wage is salary × SALARY_MONTHS × seasons
 *            remaining. CREDITS_PER_QUALITY is not a taste number: it is what the fleet's
 *            own wage bill already pays for a point of quality (median salary × 12 ÷ median
 *            quality, measured at 33). Which means a median fighter trades near zero, a
 *            star on a cheap long deal is treasure, and a passenger on a fat four-season
 *            deal is worth LESS THAN NOTHING — you pay somebody to take them. Measured on a
 *            real fleet: 48 of 139 contracts are negative. Salary dumping is a real move,
 *            and that is the point.
 *
 * NO FLOOR (ruled). Nothing here stops a corp trading itself down to nobody. A roster of
 * zero in M6 filled with sixteen mercenaries in M11 is a plan a manager is allowed to have.
 *
 * WHAT IT COSTS A PERSON. Being sold is something that happens TO somebody: a traded
 * fighter's loyalty takes a hit (ruled). Their stress does not — this is paperwork, not a
 * firefight.
 * ========================================================================== */
(function (global) {
  'use strict';
  const isNode = typeof module !== "undefined" && module.exports;
  const ITEMS = isNode ? require('./items.js') : global.CDITEMS;
  const REP = isNode ? require('./reputation.js') : global.CDREP;

  const CONST = {
    /* [H] credits per point of quality, per remaining season. DERIVED, not chosen: the
       fleet's own wage bill pays about this much for a point of quality (median salary ×
       12 ÷ median quality = 33). Anchoring here is what makes a median contract trade near
       break-even instead of every body being a bargain or a burden. */
    CREDITS_PER_QUALITY: 33,
    POTENTIAL_SLICE: 0.35,        // [H] of the gap between what they are and what they could be
    FAME_LIFT: 0.01,              // [H] per point of fame, on worth
    SALARY_MONTHS: 12,            // [S] a season of wages, matching the ledger
    INTEL_PREMIUM: 1.35,          // [H] over the raw focus price, for the edge it carries
    /* [C] regard moves the PRICE, it does not gate the deal — the same rule the Divide's
       own dealing already follows. A quarter either way at the extremes. */
    REGARD_SWING: 400,
    FIRST_TRADE_MONTH: 2,         // [C] the review month has no table
    LAST_TRADE_MONTH: 11,         // [C] ruled: the table trades M2 through M11 and closes with the lock
    /* [C] an AI proposes rarely and only when it wants something real. The every-turn
       nuisance offer is how a player learns to stop reading their messages. */
    OFFER_COOLDOWN: 4,            // months before the SAME OA writes again
    /* [C] and a floor on how often the manager hears from ANYBODY. Seven OAs each politely
       waiting their own four months still produced fifteen proposals a year — which is the
       every-turn nuisance the ruling exists to prevent, arrived at by seven well-behaved
       parties at once. The fleet as a whole gets to interrupt about this often. */
    OFFER_QUIET_MONTHS: 3,
    OFFER_CHANCE: 0.14,           // and even then, not every time
    OFFER_MIN_APPETITE: 1.05,     // they only ask for deals that are good for them
    OFFER_MIN_FAIR: 0.75,         // [C] and never so lopsided it trains you to ignore the box
    LOYALTY_ON_SALE: 14,          // [C] what being sold costs a person's loyalty
    /* [C] and a small knock to everybody left behind. Watching somebody get sold is a
       reminder that you are also property; it is a fraction of what it costs the person
       actually sold, and it does not scale with fame — the crew minds the FACT of it. */
    LOYALTY_CREW_WATCHING: 2,
    /* [C] how often the other seven strike a deal among themselves in a month, and how
       thin a roster has to get before a corp stops selling. Modest: a fleet that
       reshuffles constantly is noise, not a market. */
    FLEET_TRADE_CHANCE: 0.22,
    FLEET_TRADE_KEEP: 18
  };

  const qualityOf = f => {
    const s = f.stats || {};
    const keys = ['aim', 'tactics', 'resolve', 'grit', 'reflex', 'fieldcraft'];
    let sum = 0, n = 0;
    for (const k of keys) if (typeof s[k] === 'number') { sum += s[k]; n++; }
    return n ? sum / n : 0;
  };

  /** What a body is worth over the life of the contract that travels with them. */
  function worthOf(f) {
    const q = qualityOf(f);
    const pot = typeof f.potential === 'number' ? f.potential : q;
    const seasons = Math.max(1, (f.contract && f.contract.seasons_remaining) || 1);
    const per = q * CONST.CREDITS_PER_QUALITY * (1 + CONST.FAME_LIFT * (f.fame || 0))
              + Math.max(0, pot - q) * CONST.CREDITS_PER_QUALITY * CONST.POTENTIAL_SLICE;
    return Math.round(per * seasons);
  }
  /** What the receiving corp takes on: the rest of the contract. */
  function wageOf(f) {
    const c = f.contract || {};
    const seasons = Math.max(1, c.seasons_remaining || 1);
    return Math.round((c.salary || 0) * CONST.SALARY_MONTHS * seasons);
  }
  /** The number that actually changes hands. Negative means they are doing you a favour. */
  function netOf(f) { return worthOf(f) - wageOf(f); }

  function gearPrice(itemId) {
    const it = ITEMS.byId(itemId);
    return it ? (it.cost || 0) : 0;
  }
  /** Priced off the focus market the game already runs. */
  function intelPrice(rows, focusPointPrice, rowsPerPip) {
    const perRow = (focusPointPrice || 4000) / Math.max(1, rowsPerPip || 2);
    return Math.round((rows || 0) * perRow * CONST.INTEL_PREMIUM);
  }

  /** Everything on one side of the table, in credits. */
  function valueBundle(corp, bundle, opts) {
    opts = opts || {};
    let v = 0;
    const b = bundle || {};
    v += (b.credits || 0);
    for (const g of (b.gear || [])) v += gearPrice(g.id) * (g.n || 1);
    for (const id of (b.units || [])) {
      const f = (corp.roster || []).find(x => x.id === id);
      if (f) v += netOf(f);
    }
    for (const t of (b.intel || []))
      v += intelPrice(t.rows || 6, opts.focusPointPrice, opts.rowsPerPip);
    return Math.round(v);
  }

  /**
   * WHAT THEY MAKE OF IT. `mine` is what the proposer puts up, `theirs` what they are asked
   * for. Regard moves the price. Returns the ratio and a word, so an interface can show the
   * beam and a test can assert on the number.
   */
  function appetite(me, them, mine, theirs, opts) {
    opts = opts || {};
    const give = valueBundle(me, mine, opts);
    const ask = valueBundle(them, theirs, opts);
    const regard = typeof opts.regard === 'number' ? opts.regard
      : (them.rep && REP ? REP.standing(them.rep, 'rival', me.id) : 0);
    /* what they need to see, softened or hardened by what they think of you */
    const need = ask * (1 - regard / CONST.REGARD_SWING);
    let ratio;
    if (Math.abs(need) < 1) ratio = give >= 0 ? 2 : 0;
    else if (need < 0) ratio = (give - need) > 0 ? 1.25 : 0.75;  /* they are being paid to take it */
    else ratio = give / need;
    return {
      give: give, ask: ask, need: Math.round(need), regard: regard, ratio: ratio,
      accept: ratio >= 1,
      word: ratio >= 1.15 ? 'gladly' : ratio >= 1 ? 'accepted'
          : ratio >= 0.9 ? 'close' : ratio >= 0.65 ? 'short' : 'refused'
    };
  }

  function tradingOpen(month) { return month >= CONST.FIRST_TRADE_MONTH && month <= CONST.LAST_TRADE_MONTH; }

  /**
   * THE DEAL ITSELF. Moves bodies, gear, credits and dossier rows between two corps.
   * No floor is enforced on either roster — ruled: fluidity until the Divide.
   * Returns a plain record of what moved, which is what the books and the page both read.
   */
  function execute(a, b, fromA, fromB, opts) {
    opts = opts || {};
    const moved = { units: [], gear: [], credits: 0, intel: [] };

    const shift = (src, dst, bundle, dir) => {
      /* credits */
      if (bundle.credits) {
        src.account.treasury -= bundle.credits;
        dst.account.treasury += bundle.credits;
        moved.credits += dir * bundle.credits;
        if (opts.post) {
          opts.post(src.account, 'expense', 'Trade with ' + dst.id, -bundle.credits);
          opts.post(dst.account, 'income', 'Trade with ' + src.id, bundle.credits);
        }
      }
      /* gear, off one armoury and onto the other */
      for (const g of (bundle.gear || [])) {
        const n = Math.min(g.n || 1, (src.armoury && src.armoury[g.id]) || 0);
        if (n <= 0) continue;
        src.armoury[g.id] -= n;
        if (src.armoury[g.id] <= 0) delete src.armoury[g.id];
        dst.armoury = dst.armoury || {};
        dst.armoury[g.id] = (dst.armoury[g.id] || 0) + n;
        moved.gear.push({ id: g.id, n: n, to: dst.id });
      }
      /* people, WITH THEIR CONTRACTS (ruled) — and being sold costs them something */
      for (const id of (bundle.units || [])) {
        const i = (src.roster || []).findIndex(x => x.id === id);
        if (i < 0) continue;
        const f = src.roster[i];
        src.roster.splice(i, 1);
        f.corpId = dst.id;
        /* the contract travels untouched: same salary, same seasons, same benefit */
        if (f.loyalty != null) f.loyalty = Math.max(0, f.loyalty - CONST.LOYALTY_ON_SALE);
        /* everybody left behind watches it happen */
        for (const mate of (src.roster || []))
          if (mate.loyalty != null && mate.status !== 'dead' && mate.status !== 'retired')
            mate.loyalty = Math.max(0, mate.loyalty - CONST.LOYALTY_CREW_WATCHING);
        dst.roster.push(f);
        /* who sold them rides on the RECORD, not on the body: a field written onto a
           fighter that nothing reads is dead state, and the cross-audit is right to say so */
        moved.units.push({ id: id, from: src.id, to: dst.id, name: f.name,
                          fame: Math.round(f.fame || 0) });
      }
      /* what you know, copied — a dossier is not consumed by being handed over */
      for (const t of (bundle.intel || [])) {
        if (!src._intel || !src._intel.rivals || !src._intel.rivals[t.about]) continue;
        dst._intel = dst._intel || { planet: null, rivals: {} };
        dst._intel.rivals = dst._intel.rivals || {};
        const copy = JSON.parse(JSON.stringify(src._intel.rivals[t.about]));
        const have = dst._intel.rivals[t.about];
        if (!have) dst._intel.rivals[t.about] = copy;
        else for (const row in copy.rows)
          if (!have.rows[row] || (have.rows[row].depth || 0) < (copy.rows[row].depth || 0))
            have.rows[row] = copy.rows[row];
        moved.intel.push({ about: t.about, to: dst.id });
      }
    };

    shift(a, b, fromA || {}, 1);
    shift(b, a, fromB || {}, -1);

    /* THE STANDS SEE IT (ruled). Your own supporters mind losing somebody, and mind in
       proportion to who it was — fame carries the weight. The buying corp's supporters warm
       to you for the same reason, which is what makes this a transfer market rather than a
       spreadsheet: a rival's fanbase can come round to the OA that gave their favourite a
       place to play. */
    if (REP && opts.seen !== false) {
      for (const m of moved.units) {
        const seller = m.from === a.id ? a : b;
        const buyer = m.to === a.id ? a : b;
        const fame = (m.fame || 0);
        if (seller.rep) {
          REP.act(seller.rep, 'sold_away', { count: fame, buyerId: buyer.id });
          REP.act(seller.rep, 'sold_anyone', {});
        }
      }
    }
    return moved;
  }

  /**
   * AN OA COMES TO YOU — rarely, and only when it wants something it can actually use.
   * Returns null far more often than not, which is the design: the every-month proposal is
   * how a manager learns to stop reading. Cooldown per OA, a die roll on top, and the deal
   * must be good for the proposer before they will bother asking.
   */
  function proposeFrom(rng, them, me, month, opts) {
    opts = opts || {};
    if (!tradingOpen(month)) return null;
    const last = them._lastTradeOffer || -99;
    if (month - last < CONST.OFFER_COOLDOWN) return null;
    const lastAny = me._lastOfferHeard || -99;
    if (month - lastAny < CONST.OFFER_QUIET_MONTHS) return null;
    if (rng() > CONST.OFFER_CHANCE) return null;

    /* what they want: the best body on your roster they could actually field */
    const want = (me.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired')
      .slice().sort((x, y) => netOf(y) - netOf(x))[0];
    if (!want) return null;
    const price = netOf(want);
    if (price <= 0) return null;                    /* they do not ask for liabilities */

    /* WHAT THEY PUT UP. They aim a little UNDER the asking price — nobody opens a
       negotiation by overpaying — and they fill with gear that FITS rather than rounding
       up: the first cut took a third rifle to cover two rifles' worth of gap, overpaid by
       a quarter, and then correctly refused its own offer, which is why no OA ever wrote. */
    const target = price * 0.95;
    const gear = [];
    let raised = 0;
    const shelf = Object.keys(them.armoury || {})
      .filter(k => them.armoury[k] > 0)
      .sort((x, y) => gearPrice(y) - gearPrice(x));
    for (const id of shelf) {
      const each = gearPrice(id);
      if (each <= 0 || raised >= target) continue;
      const room = Math.floor((target - raised) / each);
      const n = Math.min(them.armoury[id], room);
      if (n <= 0) continue;
      gear.push({ id: id, n: n });
      raised += each * n;
    }
    const short = Math.max(0, target - raised);
    const credits = Math.min(Math.max(0, them.account.treasury * 0.4), short);
    const offer = { gear: gear, credits: Math.round(credits) };
    const ask = { units: [want.id] };
    /* THE TEST IS THEIRS, NOT YOURS. The first cut asked whether the offer was generous by
       the receiver's lights, which is the opposite of why anybody proposes anything: an OA
       asks because the deal suits THEM. So — do they get more than they give? And is the
       offer still worth a manager's time to read, rather than an insult that trains the
       player to dismiss the box unopened? */
    const putUp = valueBundle(them, offer, opts);
    if (putUp <= 0) return null;
    const forThem = price / Math.max(1, putUp);
    if (forThem < CONST.OFFER_MIN_APPETITE) return null;      /* no gain in it for them */
    if (putUp < price * CONST.OFFER_MIN_FAIR) return null;    /* an insult; they know better */
    const view = appetite(me, them, ask, offer, opts);

    them._lastTradeOffer = month;
    me._lastOfferHeard = month;
    return { from: them.id, to: me.id, offer: offer, ask: ask, view: view, month: month };
  }

  /**
   * THE FLEET DEALS WITH ITSELF. Seven other corporations do not sit still for eleven months
   * waiting to hear from one manager: they trade with each other, and the stands watch those
   * transfers exactly as they watch yours. Without this the whole market existed only where
   * the player was looking — and the suite caught it, because two acts in the reputation
   * table could never be produced by a game nobody was playing.
   *
   * Rare on purpose, and only where BOTH sides want it: a corp short of bodies buys from a
   * corp with a surplus, at a price the buyer's own appetite accepts.
   */
  function fleetTrades(rng, corps, ids, month, opts) {
    opts = opts || {};
    if (!tradingOpen(month)) return [];
    const done = [];
    const attempts = opts.attempts || 2;
    const alive = c => (c.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired');
    for (let n = 0; n < attempts; n++) {
      if (rng() > (opts.chance != null ? opts.chance : CONST.FLEET_TRADE_CHANCE)) continue;
      /* the thinnest roster shops; the deepest sells */
      const pool = ids.filter(id => corps[id] && !corps[id].disqualified);
      if (pool.length < 2) continue;
      const sorted = pool.slice().sort((x, y) => alive(corps[x]).length - alive(corps[y]).length);
      const buyer = corps[sorted[0]], seller = corps[sorted[sorted.length - 1]];
      if (!buyer || !seller || buyer === seller) continue;
      if (alive(seller).length <= CONST.FLEET_TRADE_KEEP) continue;
      /* the seller parts with the best paper they can spare: positive net, lowest quality */
      const spare = alive(seller).filter(f => netOf(f) > 0)
        .sort((a, b) => qualityOf(a) - qualityOf(b))[0];
      if (!spare) continue;
      const price = netOf(spare);
      if (buyer.account.treasury < price) continue;
      const offer = { credits: Math.round(price) }, ask = { units: [spare.id] };
      const view = appetite(buyer, seller, offer, ask, opts);
      if (!view.accept) continue;
      execute(buyer, seller, offer, ask, opts);
      done.push({ from: seller.id, to: buyer.id, who: spare.id, price: Math.round(price) });
    }
    return done;
  }

  const api = {
    CONST, qualityOf, worthOf, wageOf, netOf, gearPrice, intelPrice,
    valueBundle, appetite, tradingOpen, execute, proposeFrom, fleetTrades
  };
  if (isNode) module.exports = api;
  global.CDTRADE = api;
})(typeof window !== "undefined" ? window : globalThis);
