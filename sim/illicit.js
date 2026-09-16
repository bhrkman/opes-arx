/* ============================================================================================
   THE QUIET BUSINESS — what an OA does when it would rather nobody knew.

   Standing with the Aleas is a currency, not a scoreboard: honest dealing builds it, and this
   spends it. Every act has a price in credits, a price in standing (paid at once, because the
   people you deal with know what you asked for), and ONE NUMBER: the chance it goes off clean.
   It either goes off clean, or it comes apart — and a thing that comes apart is traced back to
   the OA that paid for it. There is no quiet failure: the two used to be separate rolls, a
   chance of working and a chance of being caught, which asked a manager to weigh two figures
   that meant nearly the same thing.

   Each act answers to its own audience. Bribing an official is the Aleas' business and the
   fleet shrugs; sabotaging a rival's kit is the FLEET's business and the Aleas do not much
   care until they are asked to rule on it; a quiet word before the Divide is a thing your own
   people mind more than anybody. The reactions are written per act rather than shared, because
   a shared reaction would make every crime the same crime.

   SYMMETRY: an AI OA works the same window through `consider()`, weighted by its treachery
   and its need. Nothing here reads who is human.
   ============================================================================================ */
(function (root, factory) {
  const isNode = typeof module !== "undefined" && module.exports;
  if (isNode) module.exports = factory(require("./prng.js"), require("./ledger.js"), require("./reputation.js"));
  else root.CDILLICIT = factory(root.CDPRNG, root.CDLEDGER, root.CDREP);
})(typeof self !== "undefined" ? self : this, function (P, LED, REP) {
  "use strict";

  const CONST = {
    /* §QUIET WHAT A THING LEAVES BEHIND. An act that goes off clean is not an act nobody could
       ever prove: it leaves a trace in the year's paperwork, and a rival who has read an OA
       nearly to the bottom may turn it up. Evidence is the currency of that discovery —
       blackmail it, leak it, or hand it to the Aleas. */
    DIRT_AT: 0.75,                // [C] the share of a rival's dossier that must be filled before
                                  //     a scout is deep enough in their books to find anything
    DIRT_BASE: 0.20,              // [C] the chance of turning something up at that depth
    DIRT_PER_ACT: 0.10,           // [C] and what each thing they did this year adds
    DIRT_SUSPICION: 0.25,         // [C] an OA in bad odour with the Aleas is watched harder
    DIRT_HUSHED: 0.45,            // [C] what a hush is worth against a scout, as a multiplier
    EVIDENCE_YEARS: 1,            // [C] evidence keeps for the year it was found and the next
    BLACKMAIL_SHARE: 0.08,        // [C] what a blackmailed OA pays, as a share of its purse
    RISK_PER_ACT: 0.04,           // [C] what each thing already done this year adds to the risk
    ALEAS_SUSPICION: 0.30,        // [C] how much an OA in bad odour with the Aleas risks
    HUSH: 12000,                  // [C] what a hush costs on top, to halve what could go wrong
    HUSH_SHARE: 0.5               // [C] and how much of the risk it takes away
  };

  /* the acts. `cost` credits, `standing` paid at once, `p` the chance it works, `expose` a
     multiplier on the base chance of it coming out, `caught` the reckoning. */
  const ACTS = [
    {
      id: 'bribe_official', title: 'Bribe an Official',
      text: 'A clerk in the Aleas\u2019 assay office will lose a page for the right money.',
      offer: 'One Ruling Goes Your Way This Divide',
      cost: 18000, standing: { aleas: -6 }, clean: 0.90,
      caught: { aleas: -30, fleet: -10, own: -4 },
      when: () => true,
      apply: (state, corpId) => { (state.illicit.favours[corpId] = state.illicit.favours[corpId] || {}).ruling = true; }
    },
    {
      id: 'camera_malfunction', title: 'Buy a Malfunction',
      text: 'The feed from one sector can go dark for an hour. What happens in it is not broadcast.',
      offer: 'One Act This Divide Is Not Seen',
      cost: 26000, standing: { aleas: -9 }, clean: 0.86,
      caught: { aleas: -34, fleet: -22, own: -8 },
      when: () => true,
      apply: (state, corpId) => { (state.illicit.favours[corpId] = state.illicit.favours[corpId] || {}).unseen = true; }
    },
    {
      id: 'sabotage_kit', title: 'Sabotage a Rival\u2019s Kit',
      text: 'A quartermaster on another ship can be paid to sign off on a bad batch.',
      offer: 'Their Squads Drop With Worse Kit',
      cost: 22000, standing: { fleet: -4 }, clean: 0.82, needsTarget: true,
      caught: { fleet: -34, own: -10, aleas: -12, rival: -40 },
      when: (state) => state.ids.length > 1,
      apply: (state, corpId, target) => { (state.illicit.sabotage[target] = state.illicit.sabotage[target] || []).push(corpId); }
    },
    {
      id: 'quiet_word', title: 'A Quiet Word Before the Drop',
      text: 'An OA can be reached before the Divide, and an understanding reached that the Aleas would not sanction.',
      offer: 'A Pact That Holds From Day One',
      cost: 9000, standing: { own: -3 }, clean: 0.92, needsTarget: true,
      caught: { own: -14, fleet: -18, aleas: -20 },
      when: (state) => state.ids.length > 1,
      /* the drop's pacts are keyed "from>to", the same shape a spoken approach writes */
      apply: (state, corpId, target) => { state.drop.pacts = state.drop.pacts || {}; state.drop.pacts[corpId + '>' + target] = { agreed: true, quiet: true, chance: 1 }; }
    },
    {
      id: 'buy_a_story', title: 'Buy a Story',
      text: 'The fleet\u2019s postings will print what they are paid to print, and an OA can be made to look better than its year.',
      offer: '+' + 14 + ' With the Fleet, and Your Own People',
      cost: 15000, standing: {}, clean: 0.88,
      caught: { fleet: -26, own: -16, aleas: -4 },
      when: () => true,
      apply: (state, corpId) => { const rep = state.corps[corpId].rep; if (rep) REP.act(rep, 'bought_a_story', {}); }
    }
  ];
  const BY_ID = {}; ACTS.forEach(a => { BY_ID[a.id] = a; });

  /* the acts these lean on, if the reputation module has not got them */
  const REP_ACTS = {
    bought_a_story:   { fleet: 14, own: 8, residue: 0.15 },
    caught_at_it:     { own: -10, fleet: -14, aleas: -18, residue: 0.45 },
    was_blackmailed:  { rival: -12, residue: 0.30 },
    /* the fleet does not love an OA that prints another's business, and it likes one that
       runs to the referees rather less */
    leaked_a_story:   { fleet: -4, own: 2, residue: 0.20 },
    told_the_aleas:   { fleet: -9, aleas: 8, own: -2, residue: 0.25 }
  };
  if (REP && REP.ACTS) for (const k in REP_ACTS) if (!REP.ACTS[k]) REP.ACTS[k] = REP_ACTS[k];

  const fmtCr2 = n => '\u20a1' + Math.round(n).toLocaleString('en-US');
  function ensure(state) {
    state.illicit = state.illicit || { done: {}, favours: {}, sabotage: {}, exposed: [], evidence: {} };
    state.illicit.evidence = state.illicit.evidence || {};
    return state.illicit;
  }
  /** §QUIET what a scout deep in another OA's books might turn up, and how likely it is */
  function dirtChance(state, holderId, targetId) {
    const I = ensure(state), done = (I.done[targetId] || []).filter(d => d.season === state.season && !d.exposed);
    if (!done.length) return { p: 0, on: [] };
    const rep = state.corps[targetId].rep;
    const suspicion = rep ? Math.max(0, -REP.standing(rep, 'aleas')) / 100 : 0;
    const already = (I.evidence[holderId] || []).filter(e => e.against === targetId && e.season === state.season);
    const fresh = done.filter(d => !already.some(e => e.actId === d.id && e.at === d.month));
    if (!fresh.length) return { p: 0, on: [] };
    const hushShare = fresh.filter(d => d.hush).length / fresh.length;
    const p = Math.min(0.85, (CONST.DIRT_BASE + CONST.DIRT_PER_ACT * fresh.length + suspicion * CONST.DIRT_SUSPICION)
                             * (1 - hushShare * (1 - CONST.DIRT_HUSHED)));
    return { p, on: fresh };
  }
  /** §QUIET a scout deep enough in a rival's books turns something up, or does not. The row
      they were sent for lands either way: the dirt is a bonus, not a substitute. */
  function maybeUncover(rng, state, holderId, targetId, fullness) {
    if (fullness < CONST.DIRT_AT || holderId === targetId) return null;
    const { p, on } = dirtChance(state, holderId, targetId);
    if (!on.length || rng() > p) return null;
    const d = on[Math.floor(rng() * on.length)];
    const I = ensure(state);
    const ev = { against: targetId, actId: d.id, at: d.month, season: state.season, used: null };
    (I.evidence[holderId] = I.evidence[holderId] || []).push(ev);
    return ev;
  }
  function evidenceOf(state, holderId) {
    const I = ensure(state);
    return (I.evidence[holderId] || []).filter(e => state.season - e.season <= CONST.EVIDENCE_YEARS);
  }
  /** §QUIET WHAT YOU DO WITH IT. Three ways, and each answers to a different audience:
      blackmail is between the two OAs and nobody else learns; a leak is the fleet's
      business and the crowd's; a report is the Aleas' and they are grateful to be told —
      though the fleet has a word for an OA that runs to the referees. */
  function useEvidence(rng, state, holderId, idx, how) {
    const I = ensure(state), list = evidenceOf(state, holderId), ev = list[idx];
    if (!ev || ev.used) return { ok: false, line: 'Nothing There' };
    const them = state.corps[ev.against], me = state.corps[holderId];
    const spec = BY_ID[ev.actId] || { title: 'Something' };
    ev.used = how;
    if (how === 'blackmail') {
      const pay = Math.round(Math.max(0, them.account.treasury) * CONST.BLACKMAIL_SHARE);
      if (pay > 0) { LED.post(them.account, 'expense', 'A Matter Settled Quietly', -pay); LED.post(me.account, 'income', 'A Matter Settled Quietly', pay); }
      if (them.rep) REP.act(them.rep, 'was_blackmailed', { targetId: holderId });
      return { ok: true, line: 'They Paid ' + fmtCr2(pay) + ' to Keep It Quiet' };
    }
    if (how === 'leak') {
      if (them.rep) { REP.act(them.rep, 'caught_at_it', {}); them.rep.base.fleet = (them.rep.base.fleet || 0) - 18; them.rep.base.own = (them.rep.base.own || 0) - 8; }
      if (me.rep) REP.act(me.rep, 'leaked_a_story', { targetId: ev.against });
      I.exposed.push({ corp: ev.against, id: ev.actId, season: state.season, month: state.month, leakedBy: holderId });
      return { ok: true, line: 'The Fleet Read About ' + spec.title + ' by Morning' };
    }
    if (how === 'report') {
      if (them.rep) { them.rep.base.aleas = (them.rep.base.aleas || 0) - 26; REP.act(them.rep, 'caught_at_it', {}); }
      if (me.rep) { me.rep.base.aleas = (me.rep.base.aleas || 0) + 10; REP.act(me.rep, 'told_the_aleas', {}); }
      const fine = Math.round(Math.max(0, them.account.treasury) * 0.06);
      if (fine > 0) LED.post(them.account, 'expense', 'An Aleas Fine', -fine);
      I.exposed.push({ corp: ev.against, id: ev.actId, season: state.season, month: state.month, reportedBy: holderId });
      return { ok: true, line: 'The Aleas Were Told, and Fined Them ' + fmtCr2(fine) };
    }
    ev.used = null;
    return { ok: false, line: 'No Such Use' };
  }
  /** what an OA may attempt right now, with its price and its risk read for that OA */
  function offered(state, corpId) {
    const I = ensure(state), done = (I.done[corpId] || []);
    const rep = state.corps[corpId].rep;
    const suspicion = rep ? Math.max(0, -REP.standing(rep, 'aleas')) / 100 : 0;
    return ACTS.filter(a => a.when(state)).map(a => {
      const already = done.filter(d => d.id === a.id).length;
      /* §QUIET ONCE A MONTH FOR ANY ONE THING. A manager could have the same official bribed
         four times in an afternoon: each one cost money and standing and raised the risk of
         the next, but nothing on the page said so, so it read as free and pointless at once.
         A thing arranged this month is arranged; the risk it added stands for the year. */
      const thisMonth = done.some(d => d.id === a.id && d.month === state.month);
      /* the more an OA has already had done this year, and the worse its odour with the
         Aleas, the likelier the next thing comes apart */
      const risk = (1 - a.clean) + CONST.RISK_PER_ACT * done.length + suspicion * CONST.ALEAS_SUSPICION;
      return { id: a.id, title: a.title, text: a.text, offer: a.offer, cost: a.cost, standing: a.standing,
               clean: Math.max(0.25, Math.min(0.97, 1 - risk)), needsTarget: !!a.needsTarget,
               done: already, spent: thisMonth };
    });
  }
  /**
   * Attempt one. Returns { ok, worked, exposed, line }. The standing is paid whether it works
   * or not — the people you asked know what you asked for.
   */
  function attempt(state, corpId, actId, targetId, opts) {
    const I = ensure(state), spec = BY_ID[actId];
    if (!spec) return { ok: false, line: 'No Such Thing' };
    if (spec.needsTarget && !targetId) return { ok: false, line: 'Nobody Named' };
    const c = state.corps[corpId], hush = !!(opts && opts.hush);
    const bill = spec.cost + (hush ? CONST.HUSH : 0);
    if (c.account.treasury < bill + LED.CONST.RESERVE_FLOOR) return { ok: false, line: 'The Money Is Not There' };
    const rng = P.mulberry32(P.seedFrom('ill' + state.season + state.month + corpId + actId + (targetId || '') + (I.done[corpId] || []).length));
    LED.post(c.account, 'expense', 'Discretionary', -bill);
    /* the price in standing is paid at once */
    if (c.rep) for (const a in (spec.standing || {})) {
      c.rep.base[a] = (c.rep.base[a] || 0) + spec.standing[a];
    }
    const list = offered(state, corpId).filter(o => o.id === actId)[0];
    if (list && list.spent) return { ok: false, line: 'That Is Already Arranged This Month' };
    /* ONE ROLL: it goes off clean, or it comes apart and is traced back */
    const clean = hush ? 1 - (1 - list.clean) * CONST.HUSH_SHARE : list.clean;
    const worked = rng() < clean, exposed = !worked;
    if (worked) spec.apply(state, corpId, targetId);
    (I.done[corpId] = I.done[corpId] || []).push({ id: actId, target: targetId || null, worked, exposed, hush, season: state.season, month: state.month });
    if (exposed) {
      /* THE RECKONING, in each act's own coin */
      if (c.rep) {
        for (const a in spec.caught) {
          if (a === 'rival') { if (targetId) REP.act(c.rep, 'caught_at_it', { targetId }); continue; }
          c.rep.base[a] = (c.rep.base[a] || 0) + spec.caught[a];
        }
        REP.act(c.rep, 'caught_at_it', {});
      }
      I.exposed.push({ corp: corpId, id: actId, season: state.season, month: state.month, target: targetId || null });
    }
    return { ok: true, worked, exposed,
             line: worked ? spec.title + ' \u00b7 Done, and Nobody the Wiser'
                          : spec.title + ' \u00b7 It Came Apart, and It Was Traced to You' };
  }
  /** an AI OA's appetite: its treachery, its need, and how much it can spare */
  function consider(rng, state, corpId) {
    const c = state.corps[corpId], d = (c.profile && c.profile.dials) || {};
    const treachery = (d.treachery != null ? d.treachery : 50) / 100;
    if (rng() > treachery * 0.35) return null;
    const can = offered(state, corpId).filter(o => c.account.treasury > o.cost * 4 + LED.CONST.RESERVE_FLOOR);
    if (!can.length) return null;
    const pick = can[Math.floor(rng() * can.length)];
    let target = null;
    if (pick.needsTarget) {
      const others = state.ids.filter(x => x !== corpId);
      target = others[Math.floor(rng() * others.length)];
    }
    return { id: pick.id, target };
  }
  /** does this OA drop with a bad batch this year, and how bad */
  function sabotageOn(state, corpId) {
    const I = state.illicit; if (!I) return 0;
    return (I.sabotage[corpId] || []).length;
  }
  /** the favours an OA bought, spent at the Divide */
  function favoursOf(state, corpId) { return (state.illicit && state.illicit.favours[corpId]) || {}; }
  function clearYear(state) { if (state.illicit) { state.illicit.favours = {}; state.illicit.sabotage = {}; } }

  return { CONST, ACTS, offered, attempt, consider, sabotageOn, favoursOf, clearYear, ensure,
           dirtChance, maybeUncover, evidenceOf, useEvidence };
});
