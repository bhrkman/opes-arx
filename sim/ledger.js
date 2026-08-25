/* Capital Divide — /sim/ledger.js  (Step 5b-4)
 *
 * The corporate account. Implements PROCUREMENT.md §14: a treasury, real expense lines, a
 * single stubbed income line, and the budget that procurement actually spends.
 *
 * WHAT THIS OWNS: what a corp has, what it owes, and how much it can put into kit.
 * WHAT THIS DOES NOT OWN: sponsorship revenue and prize shares (Step 7), settlement money
 * (Step 6), board goals. Those are income, and income is not this step's business — the
 * gap between what a corp earns here and what it spends is deliberate, and it is the hole
 * the later steps are shaped to fill.
 *
 * Plain serialisable data: no closures, no functions on the record. Step 8 can write it to
 * disk without touching this file.
 *
 * Pure logic: no DOM, no Math.random, no I/O.
 */
(function (global) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;

  const CONST = {
    /* [S] A season is ONE YEAR OF TWELVE MONTHS — an ordinary Earth calendar, kept in space.
       This was 13 and the calendar it came from had thirteen months, which also gave the Divide
       two months while C1 says it runs the LAST MONTH of the year, singular. Both wrong, and the
       wage bill was 8% too high for every season ever simulated.
       Named SEASON_MONTHS because wages are paid on the whole roster for all twelve — a fighter
       is not unpaid for the month they spend on a planet, and a reserve is not unpaid for it
       either. `SALARY_MONTHS` is kept as an alias so nothing silently reads undefined. */
    SEASON_MONTHS: 12,
    /* Was `PREP_MONTHS`, which collided head-on with season.js's `PREP_MONTHS` — 12 here, 11
       there, same name, two modules, both live. This one has nothing to do with the prep
       calendar: it is the number of months WAGES ARE PAID FOR, which is the whole year. */
    SALARY_MONTHS: 12,               // [S] alias of SEASON_MONTHS; salary is per month
    /* Expense lines, all [C] and all provisional until Step 7 gives them income to sit against */
    MEDICAL_PER_INJURY: 900,         // [C] treating one wounded fighter between Divides
    DEATH_BENEFIT_MULT: 5,           // [C] x monthly salary, averaged across pools
    ALEAS_ENTRY: 40000,              // [C] what it costs to be in the Divide at all
    ALEAS_WINDOW_FEE: 1200,          // [C] per unscheduled comms window
    /* S15 — what a fighter is paid for being on the books rather than for going down the
       well. The rest of the contract is the purse, and it is only paid to those who drop.
       At 0.40 a rested body costs a corp two fifths of a fielded one. */
    WAGE_RETAINER_SHARE: 0.40,       // [H]
    /* `REPAIR_COST_FRAC` was declared here AND in items.js — one of the three constants the
       Step 8b-2 audit found declared twice, of which only one copy was doc-parity checked.
       Both copies are gone with the gear-damage cut; nothing ever read either. */
    /* How much of what is left a corp is willing to put into kit rather than hold back */
    KIT_SHARE: 0.55,                 // [H]
    RESERVE_FLOOR: 15000,            // [C] nobody spends the last credit on rifles

    /* SEASONS.md S13 — THE PLANET IS WON FOR THE OA, NOT FOR THE SQUAD.
     *
     * Mineral rights on a whole planet are worth more than a fighting corp will ever spend,
     * and for a whole step that was invisible because the settlement never reached an
     * account at all. Banked in full it inverted the difficulty ladder inside three seasons:
     * the hardest start in the fleet finished a career the richest corp in it.
     *
     * The fix is not a smaller planet — that is ruled out and stays ruled out. The planet is
     * worth what it is worth. What reaches the manager's operating account is a **bonus on
     * the win**, and the rest belongs to the arkship that sent them. The negotiation engine
     * is untouched: every deal is still struck over the full value of the rights, because
     * that is what the two corps are actually arguing about.
     *
     * Anchored, per ruling, against what a year of existing costs: wages, the entry fee, the
     * bills, the gear, plus the growth the corp is trying to buy — better people, better
     * kit, the fees that find their way in. Measured at 225,261 a corp-season with the
     * growth room the ruling asks for, call it 260,000, and a win is worth 2.5 years of it.
     */
    /* [C] Re-derived at Step 7.5 after the calendar correction. Measured at 216,729 a
       corp-season on twelve months (225,261 on the inflated thirteen), plus the growth room the
       ruling asks for — better people, better kit, the fees that find their way in. */
    SEASON_COST_ANCHOR: 250000,      // [C] what a year of existing costs, with room to grow
    WIN_YEARS: 2.5,                  // [S] what taking a planet is worth, in years of existing
    SQUAD_BONUS_SHARE: 0.34          // [C] derived: the share of a settlement that reaches the squad
  };

  /**
   * Step 6 — book one Divide's outcome into the account. This is the SMALL version of the
   * management wrapper, deliberately: the full season cycle (budget → recruit → kit → drop
   * → payout → repeat) belongs with the step that builds the macro layers and is not this.
   * What this does is make the money real — settlement income, the winner's bonuses, and
   * the bill for the dead and wounded — so that the question of whether a careful corp can
   * survive on money rather than blood finally has an answer.
   */
  /**
   * Step 6 — book one Divide's outcome into the account.
   *
   * The settlement figure is what the corp WON. `squadBonus` is what reaches its own books:
   * the rest is the OA's, because the OA is who the planet was taken for. The bonus rises
   * with the season on the same escalator as the Kit Allowance, per ruling — what a win is
   * worth grows at the same rate as what it costs to field a force, so year ten is not year
   * one with bigger numbers on one side only.
   *
   * Ransoms are NOT cut. A ransom is one corp paying another for a body; the arkship has no
   * claim on it and both sides book it whole.
   */
  function squadBonus(payout, season, escalator) {
    if (!(payout > 0)) return 0;
    const s = Math.max(1, season || 1);
    return Math.round(payout * CONST.SQUAD_BONUS_SHARE * Math.pow(escalator || 1, s - 1));
  }

  function bookDivide(acct, result) {
    result = result || {};
    if (result.payout) {
      const share = result.squadShare != null ? result.squadShare
                  : squadBonus(result.payout, result.season || acct.season, result.escalator);
      post(acct, 'income', 'Divide bonus (the OA takes the rights)', share);
      acct.lastSettlement = result.payout;
      acct.lastBonus = share;
    }
    if (result.bonuses) post(acct, 'expense', 'winner bonuses', -result.bonuses);
    if (result.ransomPaid) post(acct, 'expense', 'ransoms paid', -result.ransomPaid);
    if (result.ransomTaken) post(acct, 'income', 'ransoms received', result.ransomTaken);
    return acct;
  }

  /** A corp's account at the start of a season. `profile` is an oa_profiles entry. */
  function open(profile, opts) {
    opts = opts || {};
    const band = (profile.finance && profile.finance.treasury_band) || [80000, 120000];
    return {
      corpId: profile.id,
      treasury: opts.treasury != null ? opts.treasury : Math.round((band[0] + band[1]) / 2),
      grant: (profile.finance && profile.finance.funding_base) || 200000,
      season: opts.season || 1,
      solvent: true,
      ledger: []                      // one line per movement, for the broadcast and for Step 8
    };
  }

  function post(acct, kind, label, amount) {
    acct.treasury += amount;
    acct.ledger.push({ season: acct.season, kind: kind, label: label, amount: Math.round(amount) });
    return acct;
  }

  /** Wages for a roster, for one season. Salary is per prep month. */
  /**
   * S15 — A CONTRACT PAYS FOR PARTICIPATION, NOT FOR EXISTING.
   *
   * The bill used to charge every living body a full year, which made a reserve cost exactly
   * what a fighter who went down and bled cost, and left a manager who fielded sixteen instead
   * of twenty-four paying for all twenty-four anyway. `SEASONS.md` §4.1 has always said the
   * small-force build is "pay less, arm each one to the cap, and be outnumbered", while §4.2
   * said "everyone on the books is paid" — a contradiction inside one document, of which the
   * code implemented the half that made S3's choice impossible.
   *
   * A contract is now a **retainer** — you are kept, fed and trained aboard the ship — plus a
   * **purse** for going down the well. Nobody draws a purse for a Divide they did not drop
   * into, whether they were rested, benched or too hurt to stand.
   *
   * THREE BILLS, NAMED, EACH WITH ONE CALLER. An earlier draft made this one function with an
   * optional `dropped` argument, where omitting it meant "charge everyone in full" — so a call
   * site that forgot to pass the drop would silently bill the old way and look correct. The
   * three cases are different questions and are asked separately:
   *
   *   wageBill      what the whole roster would cost if every one of them dropped.
   *                 PLANNING ONLY — signing, releasing, the procurement budget. A corp
   *                 deciding what it can afford must assume it will field who it signs.
   *   retainerBill  what is owed for keeping them, whoever fights. Charged at prep.
   *   purseBill     what is owed to the people who actually dropped. Charged at the muster,
   *                 because that is the first moment the answer exists.
   *
   *   retainerBill(roster) + purseBill(dropped) = what the season actually cost in people.
   */
  function wageBill(roster) {
    let m = 0;
    for (const f of roster) m += (f.contract && f.contract.salary) || 0;
    return Math.round(m * CONST.SALARY_MONTHS);
  }

  function retainerBill(roster) {
    let m = 0;
    for (const f of roster) m += ((f.contract && f.contract.salary) || 0) * CONST.WAGE_RETAINER_SHARE;
    return Math.round(m * CONST.SALARY_MONTHS);
  }

  /** Charge the purse once the drop is known. S15. */
  function payPurse(acct, dropped) {
    const owed = purseBill(dropped);
    if (owed > 0) post(acct, 'expense', 'purses', -owed);
    return owed;
  }

  function purseBill(dropped) {
    let m = 0;
    for (const f of (dropped || [])) {
      m += ((f.contract && f.contract.salary) || 0) * (1 - CONST.WAGE_RETAINER_SHARE);
    }
    return Math.round(m * CONST.SALARY_MONTHS);
  }

  /** The mean FULL contract on the books — what a life is worth, independent of who dropped.
      The death benefit is priced off this and not off a participation-adjusted bill, or a corp
      that rested people would owe less to the families of the ones it did not. */
  function meanSalary(roster) {
    if (!roster.length) return 0;
    let m = 0;
    for (const f of roster) m += (f.contract && f.contract.salary) || 0;
    return m / roster.length;
  }

  /**
   * §14 — what a corp can put into kit this season. Not the whole treasury: wages come
   * first, the Aleas takes its entry fee, and nobody spends the last credit on rifles.
   */
  function procurementBudget(acct, roster) {
    const wages = wageBill(roster);
    const committed = wages + CONST.ALEAS_ENTRY;
    const free = acct.treasury + acct.grant - committed - CONST.RESERVE_FLOOR;
    return Math.max(0, Math.round(free * CONST.KIT_SHARE));
  }

  /**
   * REPUTATION.md §6.5 — THE STIPEND IS FLAT AND THE ASK COSTS PATIENCE.
   *
   * The note this step inherited said reputation should CUT a failing corp's grant. Designer
   * ruling went the other way, and the reasoning is worth keeping: a funding cut punishes the
   * manager who is already losing and spirals. What a board actually resents is having to put
   * MORE money in. So the grant does not move with results at all — it covers wages, the
   * entry fee, and arming twenty-four people, and nothing else — and a manager who needs more
   * than that may always have it, at a price paid in goodwill rather than credits.
   *
   * This is where the difficulty gradient lives now. The Verdant Cradle does not end its
   * seasons poorer than Violet's by a hundredfold; it ends them closer to being fired,
   * because it has to ask and Violet's does not.
   */
  function callOnBoard(acct, rep, amount, REP) {
    if (!(amount > 0)) return { amount: 0, patienceCost: 0 };
    const out = REP.callOnBoard(rep, amount);
    post(acct, 'income', 'board call (against patience)', amount);
    acct.boardCalls = (acct.boardCalls || 0) + 1;
    acct.patienceSpent = (acct.patienceSpent || 0) + out.patienceCost;
    return out;
  }

  /**
   * §11 — what the mercenary market charges this corp, against what it charges the fleet.
   * A corp that spends people pays more for the next ones. Not an audience: a price.
   */
  function wageBillAt(roster, mercMult) {
    let m = 0;
    for (const f of roster) {
      const sal = (f.contract && f.contract.salary) || 0;
      m += f.pool === 'mercenary' ? sal * (mercMult || 1) : sal;
    }
    return Math.round(m * CONST.SALARY_MONTHS);
  }

  /** Book a season: the grant lands, the retainers land, and we see who is still standing.
      The PURSE is not charged here — it is charged at the muster by `payPurse`, because the
      drop has not been chosen yet at this point in the loop and a purse for a Divide nobody
      has been picked for is a number invented ahead of its answer. */
  function settleSeason(acct, roster, spend) {
    spend = spend || {};
    post(acct, 'income', 'board grant', acct.grant);
    post(acct, 'expense', 'retainers', -retainerBill(roster));
    post(acct, 'expense', 'Aleas entry', -CONST.ALEAS_ENTRY);
    if (spend.procurement) post(acct, 'expense', 'procurement', -spend.procurement);
    if (spend.repairs) post(acct, 'expense', 'repairs', -spend.repairs);
    if (spend.injuries) post(acct, 'expense', 'medical', -spend.injuries * CONST.MEDICAL_PER_INJURY);
    if (spend.deaths) {
      /* Priced off the mean FULL contract, not the participation-adjusted bill: what a corp
         owes a dead fighter's people does not depend on how many others it rested. */
      const avg = meanSalary(roster);
      post(acct, 'expense', 'death benefits', -Math.round(spend.deaths * avg * CONST.DEATH_BENEFIT_MULT));
    }
    if (spend.windows) post(acct, 'expense', 'comms windows', -spend.windows * CONST.ALEAS_WINDOW_FEE);
    acct.season++;
    acct.solvent = acct.treasury > 0;
    return acct;
  }

  /**
   * §3.1 — the muster is the fail state, not the balance sheet. But per SEASONS.md S12 it is
   * a fail state for a CAREER, not for a season: **nobody is ever struck from a Divide for
   * being poor.** Eight banners drop, every season, always.
   *
   * The strike return lived on here for a whole step after the ruling that deleted it —
   * written into three documents, carried out in none of them, and actively defended by a
   * regression guard asserting the behaviour the ruling had removed. It answers two ways now:
   * armed from what the corp has, or short by a stated amount that somebody else has to find.
   * Who finds it, and what it costs them in goodwill, belongs to the season loop.
   */
  function musterCheck(acct, plan) {
    if (!plan) return { fielded: false, reason: 'no plan' };
    if (plan.mustered) return { fielded: true, reason: null, shortfall: 0 };
    const canRaise = Math.max(0, acct.treasury);
    return { fielded: true, reason: canRaise >= plan.shortfall ? 'raised' : 'must be found',
             shortfall: plan.shortfall,
             raise: Math.min(canRaise, plan.shortfall),
             short: Math.max(0, plan.shortfall - canRaise) };
  }

  const api = { CONST, open, post, wageBill, retainerBill, purseBill, payPurse, wageBillAt, meanSalary, procurementBudget, settleSeason,
                musterCheck, bookDivide, callOnBoard, squadBonus };
  if (isNode) module.exports = api;
  global.CDLEDGER = api;
})(typeof window !== "undefined" ? window : globalThis);
