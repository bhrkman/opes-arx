/* ============================================================================================
   EVENTS — what happens TO a corporation in a month, and the choice it forces.

   A game turn needs something that asks for a decision; a spreadsheet does not. Each month a
   corp may draw an incident from a pool the rest of the engine already has material for: a
   fighter who wants a raise, a Debtor's creditors, a Hothead in the barracks, a board memo, a
   rival's offer for a named fighter, a public slight, a dealer with something rare, a veteran
   with a talent worth more off the line than on it. Every event is a card with two or three
   options and visible costs; unresolved events resolve by their default when the month ends.

   SYMMETRY (ruled): if a player can do it, a computer can, and the other way round. Events are
   drawn for every corp; a human answers through choices[id].events; an AI corp answers through
   aiChoose() below, the same options, the same consequences. Nothing here reads who is human.

   Copy lives HERE, not in the page: the situation is content, and content is title-cased by the
   page's audit only where it is the page's. Options' labels are Title Case; the situation is a
   sentence.
   ============================================================================================ */
(function (root, factory) {
  const isNode = typeof module !== "undefined" && module.exports;
  if (isNode) module.exports = factory(require("./prng.js"), require("./ledger.js"), require("./reputation.js"), require("./items.js"));
  else root.CDEVENTS = factory(root.CDPRNG, root.CDLEDGER, root.CDREP, root.CDITEMS);
})(typeof self !== "undefined" ? self : this, function (P, LED, REP, ITEMS) {
  "use strict";

  const CONST = {
    EVENT_P: 0.55,               // [C] chance a corp draws an event in a month at all
    SECOND_P: 0.18,              // [C] chance of a second
    RAISE_FRAC: 0.20,            // [C] what a raise asks, as a share of salary
    DEBT_CALL: 6000,             // [C] what a Debtor's creditors want
    FINE: 1500,                  // [C] a barracks fine, per brawler
    POACH_MULT: 1.6,             // [C] a rival's offer for your fighter, × their worth
    SEEDED: 2.6,                 // [C] §QUIRKS what an OA with the people for it draws instead
    UNSEEDED: 0.7,               // [C] and what an OA with nobody who could cause it draws
    /* §STORY what a hand does to the loudness of a story told about him */
    LUCKY: 1.25,                 // [C] §LUCK how far one favoured hand tilts an OA's draw
    LUCK_CAP: 1.8,               // [C] and the furthest a roster of them can tilt it
    STORY_LOUD: 1.35,            // [C] a soundbite machine is quoted
    STORY_VILLAIN: 1.40,         // [C] a villain edit is cut against him
    STORY_BLAME: 1.30,           // [C] a blame magnet wears it
    STORY_MOURNED: 1.50,         // [C] a company family's dead are mourned louder
    POACH_LOYAL: 1.6,            // [C] §QUIRKS and what it costs to tempt one who does not listen
    RARE_PIECE_TIERS: [3, 4],    // [C] what a dealer brings
    RARE_MARKUP: 1.35,           // [C] over catalog
    ROLE_ONCE: true,             // [C] the veteran's fork comes once a career
    SPY_LEVELS: 1,               // [C] intel levels a Spy gathers a month, free
    DRILL_GAIN: 1.2,             // [C] the Drill Sergeant's free drill, per month, on the greenest stat
    /* THE FLEET'S MONTH (M7): one thing with fleet-reaching scope, every year. Every corp gets
       the same card; a petition costs, and if half the fleet petitions the edict is withdrawn. */
    FLEET_MONTH: 7,              // [S]
    PETITION_COST: 4000,         // [C]
    PETITION_SHARE: 0.5,         // [C] the share of OAs that must petition to turn an edict back
    LEVY: 12000,                 // [C] the Aleas' extra levy, when it comes
    FAST_WALL: 0.80,             // [C] the wall's schedule compressed to this share of its days
    PRICE_CRASH: 0.75, PRICE_BOOM: 1.35   // [C] the shelf's prices for the year
  };
  const FLEET_POOL = [
    { id: 'fast_wall',     w: 1.0, title: 'The Aleas Close the Wall Early',   text: 'The Aleas have posted this year\u2019s schedule: the dome closes a fifth faster than it did.',
      cost: 'The Ground Runs Out Sooner', edict: true },
    { id: 'stun_grade',    w: 0.8, title: 'A Stun-Grade Divide',              text: 'The Aleas have ruled this year\u2019s Divide stun-grade: every blow the medics can catch, they catch.',
      cost: 'Nobody Dies \u00b7 the Crowd Cools', edict: true },
    { id: 'no_pacts',      w: 0.8, title: 'The Aleas Forbid Pacts',           text: 'No truces this year: the Aleas have ruled that a banner that will not fight another has no place on the ground.',
      cost: 'No Truces at the Table', edict: true },
    { id: 'survey_public', w: 0.9, title: 'The Survey Goes Public',           text: 'A fleet clerk has posted the planet\u2019s survey where every OA can read it.',
      cost: 'Every OA Reads the Ground', edict: false },
    { id: 'levy',          w: 0.9, title: 'An Aleas Levy',                    text: 'The Aleas want ' + '\u20a1' + (12000).toLocaleString('en-US') + ' more from every OA at the lock, for the wall\u2019s upkeep.',
      cost: '\u2212\u20a112,000 at the Lock', edict: true },
    { id: 'crash',         w: 0.7, title: 'The Armourers Undercut Each Other', text: 'A glut of kit across the fleet: the shelf\u2019s prices fall a quarter for the rest of the year.',
      cost: 'Kit Is Cheap', edict: false },
    { id: 'boom',          w: 0.7, title: 'The Armourers Close Ranks',        text: 'A shortage of kit across the fleet: the shelf\u2019s prices rise a third for the rest of the year.',
      cost: 'Kit Is Dear', edict: true }
  ];

  const alive = c => c.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
  const fmtCr = n => '\u20a1' + Math.round(n).toLocaleString('en-US');
  const worthOf = f => Math.round(((f.contract && f.contract.salary) || 0) * (LED.CONST.SALARY_MONTHS || 11) *
                                  (1 + Math.max(0, ((f.potential || 50) - 50) / 100)));
  /* §STORY AN EVENT ASKS FOR A TIE, NOT A TRAIT ID. Five events cast their subject by naming a
     trait — `hasQuirk(f, 'hot_headed')` — and the moment those traits were retired all five
     went quiet with no error anywhere: the event stayed in the pool, drew its turn, found
     nobody and did nothing. A name in a script is a hard edge against a catalogue that is meant
     to be rewritten.
     Every rebuilt quirk carries `story.hooks_into`: the things an event could hang on it. An
     event asks for one of those — "a fight in the barracks" — and gets whoever in the OA has
     a quirk that answers to it, whatever that quirk is called this year. Rewrite the catalogue
     and the events follow it. */
  function tiesOf(state, f) {
    const idx = traitIndexOf(state), out = [];
    for (const tid of (f.traits || [])) {
      const t = idx && idx[tid];
      const st = t && t.effects && t.effects.story;
      if (!st) continue;
      for (const h of (st.hooks_into || [])) out.push({ tie: h, tone: st.tone, trait: tid });
    }
    return out;
  }
  /** whoever in this OA a given tie can be hung on, or null */
  function castFor(state, corp, tie, rng) {
    const want = String(tie).toLowerCase();
    const able = (corp.roster || []).filter(f => f.status !== 'dead' && f.status !== 'retired');
    const fit = [];
    for (const f of able)
      for (const t of tiesOf(state, f))
        if (t.tie.toLowerCase().indexOf(want) >= 0 || want.indexOf(t.tie.toLowerCase()) >= 0)
          { fit.push({ f: f, tone: t.tone, trait: t.trait }); break; }
    if (!fit.length) return null;
    return fit[Math.floor((rng ? rng() : Math.random()) * fit.length)];
  }
  const hasQuirk = (f, q) => ((f.quirks || f.traits || []).map(x => String(x).toLowerCase()).some(x => x.indexOf(q) >= 0));
  const stress = (f, d) => { if (f.condition) f.condition.stress = Math.max(0, Math.min(100, (f.condition.stress || 0) + d)); };
  const spare = c => c.account.treasury - LED.CONST.RESERVE_FLOOR;

  /* --------------------------------------------------------------------------- the pool ---- */
  /* each entry: id, weight, when(corp, ctx) -> subject or null, make(subject, corp, ctx) -> event,
     resolve(corp, event, optionId, ctx) -> line, ai(corp, event) -> optionId */
  /* §STORY PLACEHOLDER MOMENTS, AND THEY SAY SO. Every rebuilt quirk carries a `story` naming
     what an event could hang on it, and until this those ties cast nothing — a narrative half
     that was a promissory note. These are STAND-INS: one shape, filled from a table, so that a
     quirk a manager is dealt actually surfaces in his month and the machinery is exercised end
     to end. They are deliberately plain, and replacing one means rewriting a row rather than
     touching any code. Each names its tie, so it follows the catalogue: rewrite the quirks and
     these cast for whoever answers instead.
     WHAT THEY ARE NOT: authored. A real event has a situation with more than one honest answer
     and a consequence that lands somewhere the manager will feel later. These have two answers
     and a small, immediate cost, which is enough to prove the wiring and not enough to be the
     writing. */
  const MOMENTS = [
    { id: 'q_argued_the_plan', tie: 'an argument with his captain', title: 'An Argument Over the Plan',
      text: n => n + ' told the captain the approach was wrong, in front of the squad.',
      a: ['Back the Captain', 'stress', 10, n => n + ' Was Overruled, and Sat Down'],
      b: ['Hear Him Out', 'stress', -8, n => n + '\u2019s Reading Was Taken'] },
    { id: 'q_wound_hidden', tie: 'a wound he did not report', title: 'A Wound Off the Books',
      text: n => 'The medic signed ' + n + ' fit. The medic is not sure ' + n + ' was honest.',
      a: ['Stand Him Down', 'health', 8, n => n + ' Was Rested, Complaining'],
      b: ['Take Him at His Word', 'stress', 8, n => n + ' Carried On, and Carried It'] },
    { id: 'q_captaincy_snub', tie: 'a captaincy he was passed over for', title: 'The Armband Went Elsewhere',
      text: n => n + ' heard about the captaincy from somebody else.',
      a: ['Explain the Call', 'stress', -8, n => n + ' Took the Explanation'],
      b: ['Let It Stand', 'stress', 12, n => n + ' Was Not Told Twice'] },
    { id: 'q_evac_retainer', tie: 'an evac retainer the desk had to budget for', title: 'The Evac Retainer',
      text: n => 'Medical have written to the desk about ' + n + ' again. They would like it in writing.',
      a: ['Pay the Retainer', 'credits', -4000, n => 'The Retainer Was Paid for ' + n],
      b: ['Take the Chance', 'stress', 10, n => n + ' Was Left on the Cheaper Plan'] },
    { id: 'q_squad_cut_down', tie: 'a squad cut to a handful', title: 'What Is Left of the Squad',
      text: n => 'There are four of them now, and ' + n + ' has stopped asking for replacements.',
      a: ['Bring It Back to Strength', 'stress', 8, n => 'The Squad Was Filled Out Over ' + n + '\u2019s Head'],
      b: ['Leave Them as They Are', 'stress', -8, n => n + ' Was Left the Squad He Had'] },
    { id: 'q_captain_fell', tie: 'a captain who fell in front of him', title: 'The Captain Went Down',
      text: n => n + ' has not been the same since the armband changed hands.',
      a: ['Give Him Time', 'stress', -10, n => n + ' Was Given the Month'],
      b: ['Put Him Straight Back', 'stress', 12, n => n + ' Went Straight Back Out'] },
    { id: 'q_long_shot', tie: 'a shot that decided a fight', title: 'The Shot They Are Still Talking About',
      text: n => 'The clip of ' + n + '\u2019s shot has been round the fleet twice.',
      a: ['Put Him on Camera', 'fame', 6, n => n + ' Gave the Interview'],
      b: ['Keep Him Off It', 'stress', -6, n => n + ' Was Kept Out of It'] }
  ];
  function momentSpec(m) {
    return {
      id: m.id, weight: 0.55,
      when: (c, ctx) => {
        const hit = castFor(ctx && ctx.state, c, m.tie, ctx && ctx.rng);
        if (!hit) return null;
        const f = hit.f;
        if (f['_' + m.id]) return null;             /* once per hand per career */
        return f;
      },
      make: (f) => ({ kind: 'quirk', subject: f.id, title: m.title, text: m.text(shortName(f)),
        options: [{ id: 'a', label: m.a[0] }, { id: 'b', label: m.b[0] }], def: 'a' }),
      resolve: (c, e, opt) => {
        const f = alive(c).find(x => x.id === e.subject);
        if (!f) return 'They Had Already Gone';
        f['_' + m.id] = true;
        const pick = opt === 'b' ? m.b : m.a;
        const kind = pick[1], amount = pick[2];
        if (kind === 'stress') stress(f, amount);
        else if (kind === 'health') { f.condition = f.condition || {}; f.condition.health = Math.min(100, (f.condition.health == null ? 100 : f.condition.health) + amount); }
        else if (kind === 'loyalty') f.loyalty = Math.max(0, Math.min(100, (f.loyalty == null ? 50 : f.loyalty) + amount));
        else if (kind === 'fame') f.fame = Math.max(0, (f.fame || 0) + amount);
        else if (kind === 'credits') LED.post(c.account, amount < 0 ? 'expense' : 'income', 'Discretionary', amount);
        return pick[3](shortName(f));
      },
      ai: () => 'a'
    };
  }
  const POOL = [
    {
      id: 'raise', weight: 1.4,
      when: (c) => { const cand = alive(c).filter(f => (f.fame || 0) >= 20 && f.contract && f.contract.salary && !f._raiseAsked); return cand.length ? cand.sort((a, b) => (b.fame || 0) - (a.fame || 0))[0] : null; },
      make: (f, c, ctx) => {
        /* §QUIRKS a fighter who anchors hard asks for more; one who leans on the OA asks louder */
        let raiseMult = CONST.RAISE_FRAC;
        const st0 = ctx && ctx.state;
        if (fighterHas(st0, f, 'salary_anchoring_up')) raiseMult *= 1.35;
        if (fighterHas(st0, f, 'salary_demand_pressure')) raiseMult *= 1.20;
        const ask = Math.round((f.contract.salary || 0) * raiseMult);
        return { kind: 'raise', subject: f.id, title: f.name + ' Wants a Raise',
                 text: f.name + ' has a following now, and a following has a price: ' + fmtCr(ask) + ' more a month.',
                 options: [
                   { id: 'grant', label: 'Grant It', cost: '−' + fmtCr(ask) + ' a Month' },
                   { id: 'refuse', label: 'Refuse', cost: 'They Sour' },
                   { id: 'release', label: 'Release Them', cost: 'They Walk' }
                 ], def: 'refuse', ask: ask };
      },
      resolve: (c, e, opt) => {
        const f = alive(c).find(x => x.id === e.subject); if (!f) return 'They Had Already Gone';
        f._raiseAsked = true;
        if (opt === 'grant') { f.contract.salary += e.ask; stress(f, -10); return f.name + ' Got the Raise'; }
        if (opt === 'release') { f.status = 'retired'; f._released = true; return f.name + ' Was Released'; }
        stress(f, 18); f._discontent = (f._discontent || 0) + 1; return f.name + ' Was Refused, and Soured';
      },
      ai: (c, e) => spare(c) > e.ask * 20 ? 'grant' : 'refuse'
    },
    {
      id: 'debt', weight: 1.0,
      when: (c, ctx) => { const hit = castFor(ctx && ctx.state, c, 'a medic who gave up too early', ctx && ctx.rng);
        return hit && !hit.f._debtCalled ? hit.f : null; },
      make: (f) => ({ kind: 'debt', subject: f.id, title: f.name + '\u2019s Creditors Call',
        text: 'The people ' + f.name + ' owes have found the ship. They want ' + fmtCr(CONST.DEBT_CALL) + ', or they want ' + f.name + '.',
        options: [
          { id: 'pay', label: 'Pay It', cost: '−' + fmtCr(CONST.DEBT_CALL) },
          { id: 'ignore', label: 'Not Your Debt', cost: 'They Are Hurt for It' },
          { id: 'sell', label: 'Sell the Contract', cost: 'They Walk \u00b7 +' + fmtCr(Math.round(CONST.DEBT_CALL * 0.5)) }
        ], def: 'ignore' }),
      resolve: (c, e, opt, ctx) => {
        const f = alive(c).find(x => x.id === e.subject); if (!f) return 'They Had Already Gone';
        f._debtCalled = true;
        if (opt === 'pay') { LED.post(c.account, 'expense', 'A Debt Paid for ' + f.name, -CONST.DEBT_CALL); stress(f, -15); f._loyal = true; return f.name + '\u2019s Debt Was Paid'; }
        if (opt === 'sell') { f.status = 'retired'; f._released = true; LED.post(c.account, 'income', f.name + '\u2019s Contract Sold', Math.round(CONST.DEBT_CALL * 0.5)); return f.name + '\u2019s Contract Was Sold'; }
        f.condition.injuries.push({ type: 'inj_arm', severity: 'minor', days_remaining: P.int(ctx.rng, 6, 14), untreated: false });
        f.status = 'injured'; f._recovery = P.int(ctx.rng, 6, 14); f._untreatedDays = 0; stress(f, 12);
        return f.name + ' Was Found by Their Creditors';
      },
      ai: (c) => spare(c) > CONST.DEBT_CALL * 6 ? 'pay' : 'ignore'
    },
    {
      id: 'brawl', weight: 1.0,
      /* cast by the TIE, so the event follows the catalogue instead of naming three traits
         that were retired out from under it */
      when: (c, ctx) => { const a = alive(c); if (a.length < 4) return null;
        /* the tie has to be one the catalogue actually offers; with eight quirks in the book
           the brawl is cast on the man who argues with his captain */
        const hit = castFor(ctx && ctx.state, c, 'an argument with his captain', ctx && ctx.rng);
        const hot = hit && !hit.f._brawled ? hit.f : null;
        return hot ? [hot, a.find(x => x !== hot)] : null; },
      make: (pair) => ({ kind: 'brawl', subject: pair[0].id, other: pair[1].id, title: 'A Fight in the Barracks',
        text: pair[0].name + ' put ' + pair[1].name + ' through a bulkhead over a card game. ' + pair[1].name + ' will be a week mending.',
        options: [
          { id: 'punish', label: 'Punish ' + shortName(pair[0]), cost: 'They Sour \u00b7 the Rest Settle' },
          { id: 'fine', label: 'Fine Them Both', cost: '−' + fmtCr(CONST.FINE * 2) + ' from Wages \u00b7 Both Sour a Little' },
          { id: 'lie', label: 'Let It Lie', cost: 'The Barracks Simmer' }
        ], def: 'lie' }),
      resolve: (c, e, opt, ctx) => {
        const hot = alive(c).find(x => x.id === e.subject), oth = alive(c).find(x => x.id === e.other);
        if (hot) hot._brawled = true;
        if (oth) { oth.condition.injuries.push({ type: 'inj_torso', severity: 'minor', days_remaining: P.int(ctx.rng, 5, 9), untreated: false }); oth.status = 'injured'; oth._recovery = P.int(ctx.rng, 5, 9); oth._untreatedDays = 0; }
        if (opt === 'punish') { if (hot) stress(hot, 20); alive(c).forEach(f => { if (f !== hot) stress(f, -4); }); return (hot ? hot.name : 'The Hothead') + ' Was Punished'; }
        if (opt === 'fine') { [hot, oth].forEach(f => { if (f) { stress(f, 6); LED.post(c.account, 'income', 'A Barracks Fine', CONST.FINE); } }); return 'Both Were Fined'; }
        alive(c).forEach(f => stress(f, 5)); return 'It Was Let Lie';
      },
      ai: () => 'punish'
    },
    {
      id: 'memo', weight: 0.9,
      when: (c, ctx) => { const g = c.rep && c.rep.goal; return g && g.demands && g.demands.length > 1 && !ctx.corpFlags(c).memo ? g : null; },
      make: (g, c) => {
        const alt = (g.priority + 1) % g.demands.length;
        return { kind: 'memo', subject: alt, title: 'A Memo From the Board',
          text: 'The board has read the fleet\u2019s postings again and wants the card\u2019s priority moved.',
          options: [
            { id: 'accept', label: 'Move the Priority', cost: 'Patience +2' },
            { id: 'push', label: 'Hold the Card as It Stands', cost: 'Patience −3' }
          ], def: 'accept' };
      },
      resolve: (c, e, opt, ctx) => {
        ctx.corpFlags(c).memo = true;
        if (!c.rep || !c.rep.goal) return 'The Memo Was Filed';
        if (opt === 'accept') { c.rep.goal.priority = e.subject; c.rep.patience = Math.min(100, (c.rep.patience || 0) + 2); return 'The Card\u2019s Priority Moved'; }
        c.rep.patience = Math.max(0, (c.rep.patience || 0) - 3); return 'The Card Held as It Stood';
      },
      ai: (c) => (c.rep && c.rep.patience < 50) ? 'accept' : 'push'
    },
    {
      id: 'poach', weight: 1.1,
      when: (c, ctx) => { const a = alive(c).filter(f => (f.fame || 0) >= 15 && !f._poached); if (!a.length || !ctx.rivals.length) return null; return { f: a.sort((x, y) => (y.fame || 0) - (x.fame || 0))[0], from: ctx.rivals[Math.floor(ctx.rng() * ctx.rivals.length)] }; },
      /* §QUIRKS a hand who does not listen to other OAs costs more to tempt: poach_resistant
         was carried by people and read by nobody, so a loyal fighter was as easy to buy as any */
      make: (s, corp, ctx) => { const price = Math.round(worthOf(s.f) * CONST.POACH_MULT
                                 * (ctx && ctx.state && fighterHas(ctx.state, s.f, 'poach_resistant') ? CONST.POACH_LOYAL : 1));
        return { kind: 'poach', subject: s.f.id, from: s.from, price: price, title: 'An Offer for ' + s.f.name,
          text: 'An OA across the fleet wants ' + s.f.name + ', and has put ' + fmtCr(price) + ' on the table for the paper.',
          options: [
            { id: 'accept', label: 'Take the Money', cost: '+' + fmtCr(price) + ' \u00b7 Your People Notice' },
            { id: 'refuse', label: 'Refuse', cost: 'They Remember' },
            { id: 'counter', label: 'Ask Double', cost: 'They May Walk Away' }
          ], def: 'refuse' }; },
      resolve: (c, e, opt, ctx) => {
        const f = alive(c).find(x => x.id === e.subject); if (!f) return 'They Had Already Gone';
        f._poached = true;
        /* §GRUDGE ONE FIELD, NOT A LEDGER. Grudge Holder's three hooks wanted a fighter's memory
           of other OAs, and the first design for it was a relationship matrix — far more
           machinery than a trait that is mostly texture is worth. A man remembers ONE OA: the
           last one that did something to him. It is set where something memorable happens and
           read in two places, and that is the whole of it. */
        if (e.from && ctx && ctx.state && fighterHas(ctx.state, f, 'remembers_grudges')) f._grudge = e.from;
        const sell = (price) => { f.status = 'retired'; f._released = true; LED.post(c.account, 'income', f.name + '\u2019s Paper Sold', price);
          const them = ctx.corps[e.from]; if (them) { f.status = 'active'; delete f._released; them.roster.push(f); c.roster = c.roster.filter(x => x !== f); }
          if (c.rep) REP.act(c.rep, 'sold_a_fighter', {}); return f.name + ' Went for ' + fmtCr(price); };
        if (opt === 'accept') return sell(e.price);
        if (opt === 'counter') { if (ctx.rng() < 0.45) return sell(e.price * 2); if (c.rep) REP.act(c.rep, 'refused_an_offer', { targetId: e.from }); return 'They Walked Away From the Counter'; }
        if (c.rep) REP.act(c.rep, 'refused_an_offer', { targetId: e.from }); return 'The Offer Was Refused';
      },
      ai: (c, e) => spare(c) < 20000 ? 'accept' : 'refuse'
    },
    {
      id: 'insult', weight: 0.8,
      when: (c, ctx) => ctx.rivals.length && !ctx.corpFlags(c).insulted ? ctx.rivals[Math.floor(ctx.rng() * ctx.rivals.length)] : null,
      make: (from) => ({ kind: 'insult', from: from, title: 'A Slight in the Postings',
        text: 'A rival OA has said something in the fleet\u2019s postings about your people that your people have read.',
        options: [
          { id: 'answer', label: 'Answer It', cost: 'The Fleet Warms \u00b7 That OA Cools' },
          { id: 'ignore', label: 'Say Nothing', cost: 'Your Own People Cool' },
          { id: 'laugh', label: 'Laugh It Off', cost: 'Nothing Moves' }
        ], def: 'ignore' }),
      resolve: (c, e, opt, ctx) => {
        ctx.corpFlags(c).insulted = true;
        if (!c.rep) return 'The Slight Passed';
        if (opt === 'answer') { REP.act(c.rep, 'answered_a_slight', { targetId: e.from }); return 'The Slight Was Answered'; }
        if (opt === 'ignore') { REP.act(c.rep, 'ignored_a_slight', {}); return 'The Slight Was Ignored'; }
        return 'The Slight Was Laughed Off';
      },
      ai: (c) => (c.rep && REP.standing(c.rep, 'own') < 0) ? 'answer' : 'laugh'
    },
    {
      id: 'dealer', weight: 0.9,
      when: (c, ctx) => { const tiers = CONST.RARE_PIECE_TIERS; const pieces = ITEMS.bySlot('primary').filter(i => i.tier >= tiers[0] && i.tier <= tiers[1]); return pieces.length ? pieces[Math.floor(ctx.rng() * pieces.length)] : null; },
      make: (it) => { const price = Math.round((it.cost || 0) * CONST.RARE_MARKUP);
        return { kind: 'dealer', subject: it.id, price: price, title: 'A Dealer at the Airlock',
          text: 'Somebody with a case and no paperwork is offering a ' + it.name + ' for ' + fmtCr(price) + '. Tonight only.',
          options: [
            { id: 'buy', label: 'Buy It', cost: '−' + fmtCr(price) },
            { id: 'pass', label: 'Pass', cost: 'Nothing' }
          ], def: 'pass' }; },
      resolve: (c, e, opt) => {
        if (opt !== 'buy') return 'The Dealer Left';
        if (c.account.treasury < e.price) return 'The Money Was Not There';
        LED.post(c.account, 'expense', 'A Dealer\u2019s Piece', -e.price);
        c.armoury = c.armoury || {}; c.armoury[e.subject] = (c.armoury[e.subject] || 0) + 1;
        return 'A ' + (ITEMS.byId(e.subject) || {}).name + ' Was Bought';
      },
      ai: (c, e) => spare(c) > e.price * 5 ? 'buy' : 'pass'
    },
    {
      id: 'role', weight: 0.7,
      when: (c, ctx) => { if (CONST.ROLE_ONCE && ctx.corpFlags(c).role) return null; const vets = alive(c).filter(f => ((f.experience || {}).divides || 0) >= 2 && (f.age || 0) >= 32); return vets.length ? vets.sort((a, b) => (b.age || 0) - (a.age || 0))[0] : null; },
      make: (f) => ({ kind: 'role', subject: f.id, title: f.name + ' Has a Talent',
        text: f.name + ' has been on more grounds than anybody left on the ship, and it shows off the line as much as on it.',
        options: [
          { id: 'spy', label: 'Make Them Your Spy', cost: 'Free Intel Each Month \u00b7 Off the Line' },
          { id: 'drill', label: 'Make Them Drill Sergeant', cost: 'Free Training Each Month \u00b7 Off the Line' },
          { id: 'fight', label: 'Keep Them Fighting', cost: 'Nothing Changes' }
        ], def: 'fight' }),
      resolve: (c, e, opt, ctx) => {
        ctx.corpFlags(c).role = true;
        const f = alive(c).find(x => x.id === e.subject); if (!f) return 'They Had Already Gone';
        c._roles = c._roles || {};
        if (opt === 'spy') { c._roles.spy = f.id; f._role = 'spy'; return f.name + ' Is Your Spy'; }
        if (opt === 'drill') { c._roles.drill = f.id; f._role = 'drill'; return f.name + ' Is Your Drill Sergeant'; }
        return f.name + ' Stays on the Line';
      },
      ai: (c) => alive(c).length >= 18 ? 'drill' : 'fight'
    }
  ];
  /* THE MOMENTS JOIN THE POOL BEFORE THE INDEX IS BUILT. Pushed in after it, they drew and
     displayed perfectly and then ANSWERED NOTHING: `answer` looks a spec up by id in BY_ID, and
     BY_ID had been built from the pool as it stood a moment earlier. An event that draws but
     cannot be answered is the worst of both — it looks like content and is furniture. */
  MOMENTS.forEach(m => POOL.push(momentSpec(m)));
  const BY_ID = {}; POOL.forEach(e => { BY_ID[e.id] = e; });

  /* the acts the events lean on, if the reputation module has not got them */
  const ACTS = { sold_a_fighter: { own: -4, residue: 0.2 }, refused_an_offer: { rival: -2, residue: 0.15 },
                 answered_a_slight: { fleet: 2, rival: -4, residue: 0.2 }, ignored_a_slight: { own: -2, residue: 0.15 } };
  if (REP && REP.ACTS) for (const k in ACTS) if (!REP.ACTS[k]) REP.ACTS[k] = ACTS[k];

  /* ------------------------------------------------------------------ the fleet's month ---- */
  /* §QUIRKS does this fighter carry a hook? The pool's events wanted to ask and had no way to:
     `salary_anchoring_up`, `salary_demand_pressure` and `poach_resistant` were carried by
     people and read by nobody. The trait index rides on the corp, where the roster keeps it. */
  /* §QUIRKS THE PEOPLE YOU KEEP DECIDE WHAT HAPPENS TO YOU. Fourteen quirks carry a
     `*_event_seed` hook — a hot head seeds a brawl, a clause reader seeds a renegotiation, a
     superstitious hand seeds an omen — and the draw asked none of them: every OA drew from
     one flat pool whoever was aboard. An OA with the seed for an event draws it far oftener,
     and an OA with nobody who could cause it draws it a little less. */
  const SEED_FOR = {
    brawl:  ['aggression_event_seed'],
    raise:  ['renegotiation_demand_seed', 'status_coupling_amplified'],
    debt:   ['syndicate_contact_seed'],
    poach:  ['rivalry_event_seed', 'squad_envy_event_seed'],
    insult: ['pride_event_seed', 'unlikely_friendship_arc_seed'],
    dealer: ['omen_event_seed', 'ritual_event_seed', 'squad_superstition_event_seed'],
    memo:   ['collective_demand_event_seed', 'abolitionist_event_seed', 'cradle_camp_event_seed'],
    role:   ['desperation_event_seed_final_divide', 'scandal_seed_step9']
  };
  /* THE CACHE LIVES OFF THE CORP. The first cut hung a Set on each corporation and a whole
     trait index on the state — and the save keeps everything on those objects, so a career
     saved mid-year came back wrong. Neither belongs in a save: they are derived from the
     catalogue, which every build already has. */
  const SEED_CACHE = new WeakMap();
  function corpSeeds(state, corp) {
    const cached = SEED_CACHE.get(corp);
    if (cached && cached.n === corp.roster.length) return cached.set;
    const idx = traitIndexOf(state), set = new Set();
    for (const f of corp.roster) {
      if (f.status === 'dead' || f.status === 'retired') continue;
      for (const t of (f.traits || [])) {
        const tr = idx && idx[t];
        if (tr && tr.effects) for (const h of (tr.effects.hooks || [])) if (/_seed|_amplified/.test(h)) set.add(h);
      }
    }
    SEED_CACHE.set(corp, { n: corp.roster.length, set });
    return set;
  }
  function seedWeight(state, corp, specId) {
    const want = SEED_FOR[specId]; if (!want) return 1;
    const have = corpSeeds(state, corp);
    let w = want.some(h => have.has(h)) ? CONST.SEEDED : CONST.UNSEEDED;
    /* §LUCK A OA WITH A LUCKY MAN IN IT DRAWS DIFFERENTLY. Aleas' Favorite wanted a luck
       system and does not need one — the draw is already weighted by who an OA is carrying,
       and this is one more term in it. A favoured hand tilts the good events toward the OA
       and the sour ones away; a bad omen does the reverse. No dice anywhere else change. */
    const luck = luckOf(state, corp);
    if (luck !== 1) w *= GOOD_EVENTS.has(specId) ? luck : 1 / luck;
    return w;
  }
  /* the events an OA would rather draw than not */
  const GOOD_EVENTS = new Set(['unlikely_friendship_arc_seed', 'insult', 'dealer']);
  const LUCK_CACHE = new WeakMap();
  function luckOf(state, corp) {
    const c = LUCK_CACHE.get(corp);
    if (c && c.n === corp.roster.length) return c.v;
    let v = 1;
    for (const f of corp.roster) {
      if (f.status === 'dead' || f.status === 'retired') continue;
      if (fighterHas(state, f, 'luck_event_bias_positive')) v *= CONST.LUCKY;
      if (fighterHas(state, f, 'blame_magnet')) v /= CONST.LUCKY;
    }
    v = Math.max(1 / CONST.LUCK_CAP, Math.min(CONST.LUCK_CAP, v));
    LUCK_CACHE.set(corp, { n: corp.roster.length, v });
    return v;
  }
  let TRAIT_INDEX = null;
  /** the catalogue's index, handed in once by the season rather than saved with the career */
  function useTraitIndex(idx) { TRAIT_INDEX = idx || null; }
  /* §QUIRKS THE INDEX MUST BE THERE WHENEVER SOMEBODY ASKS. It was installed inside
     `stepMonth`, so every hook read BEFORE a month had been stepped — a re-signing ask on the
     Review screen, a mercenary weighing an offer in a fresh career — silently answered FALSE.
     Not wrongly: quietly, with no error, which is the worst way for a lookup to fail. If
     nobody has handed one in, the catalogue is right there to build one from. */
  let OWN_INDEX = null;
  function traitIndexOf(state) {
    if (TRAIT_INDEX) return TRAIT_INDEX;
    if (state && state.traitIndex) return state.traitIndex;
    if (OWN_INDEX) return OWN_INDEX;
    /* THE FALLBACK HAS TO WORK IN BOTH OAs. The first cut reached for `require`, which does
       not exist in the page — so the fix worked in the simulator and the browser went on
       quietly answering no, which is the same fault one floor down. The roster module keeps
       the index the whole game uses; in the page it is a global, in node it is an export. */
    const root = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : {});
    const R = root.CDROSTER || (typeof require === 'function' ? (function () {
      try { return require('./roster.js'); } catch (e) { return null; }
    })() : null);
    if (R && R.traitById) { OWN_INDEX = R.traitById; return OWN_INDEX; }
    return null;
  }
  /* §NAMES WHAT TO CALL SOMEBODY IN A SENTENCE. Taking the first word of a name gives "Punish
     The" for an Olmac, who is "The Tide" — the article is not a forename. A name that begins
     with an article is used whole; everything else keeps its first word, which is how a
     shipmate would say it. */
  /* §NAMES A WAR-PRIEST IS CALLED ONE. `honorific_et_prefix` is not a system and never was:
     it is what the fleet puts in front of a zealot's name when it speaks of him. */
  function honorific(state, f) {
    return (state && fighterHas(state, f, 'honorific_et_prefix')) ? 'Et-' : '';
  }
  function shortName(f) {
    const n = String(f && f.name || '');
    if (/^(The|An?)\s/i.test(n) || n.indexOf(' ') < 0) return n;
    if (/-/.test(n) && n.indexOf(' ') < 0) return n;     /* a Mon-Wa half is one word with a hyphen */
    return n.split(' ')[0];
  }
  /* §STORY WHAT THIS HAND DOES TO A STORY. One reader, consulted wherever an act is raised
     about somebody: a soundbite machine makes a good line better, a villain edit makes a bad
     one worse, a blame magnet wears whatever went wrong, and a company family's dead are
     mourned louder. These were six hooks wanting a press office; they are one multiplier. */
  function storyMult(state, f, good) {
    if (!f) return 1;
    let m = 1;
    if (fighterHas(state, f, 'media_statement_impact_amplified')) m *= CONST.STORY_LOUD;
    if (!good && fighterHas(state, f, 'sportsmanship_penalty_amplified')) m *= CONST.STORY_VILLAIN;
    if (!good && fighterHas(state, f, 'blame_magnet')) m *= CONST.STORY_BLAME;
    if (!good && fighterHas(state, f, 'death_pr_event_amplified')) m *= CONST.STORY_MOURNED;
    return m;
  }
  function fighterHas(state, f, hook) {
    const idx = traitIndexOf(state);
    return (f.traits || []).some(t => {
      const tr = idx && idx[t];
      return tr && tr.effects && (tr.effects.hooks || []).indexOf(hook) >= 0;
    });
  }
  function fleetEventFor(state) {
    state.fleet = state.fleet || { edicts: {}, priceMult: 1, levy: 0 };
    if (state.fleet.pending && state.fleet.pending.season === state.season) return state.fleet.pending;
    /* seeded by the world, not the year alone: two fleets on two planets meet two different months */
    const world = state.planet ? (state.planet.archetype || '') + (state.planet.patches || []).map(q => (q.type || '')[0]).join('') : '';
    const rng = P.mulberry32(P.seedFrom('fleet' + state.season + world));
    const spec = P.weightedPick(rng, FLEET_POOL.map(f => [f, f.w]));
    state.fleet.pending = { season: state.season, id: spec.id, petitions: 0, applied: false, withdrawn: false };
    return state.fleet.pending;
  }
  function fleetCard(state) {
    const pend = fleetEventFor(state), spec = FLEET_POOL.find(f => f.id === pend.id);
    const ev = { id: 'fleet-' + state.season, pool: 'fleet', kind: 'fleet', fleet: spec.id, title: spec.title, text: spec.text,
                 options: spec.edict
                   ? [{ id: 'accept', label: 'Accept It', cost: spec.cost },
                      { id: 'petition', label: 'Petition Against It', cost: '\u2212' + fmtCr(CONST.PETITION_COST) + ' \u00b7 Withdrawn If Half the Fleet Petitions' }]
                   : [{ id: 'accept', label: 'Noted', cost: spec.cost }],
                 def: 'accept', resolved: null };
    return ev;
  }
  const FLEET_SPEC = {
    resolve: (c, e, opt, ctx) => {
      if (opt === 'petition' && c.account.treasury >= CONST.PETITION_COST) {
        LED.post(c.account, 'expense', 'A Petition to the Aleas', -CONST.PETITION_COST);
        if (c.rep) REP.act(c.rep, 'petitioned_the_aleas', {});
        ctx.state.fleet.pending.petitions++;
        return 'You Petitioned Against It';
      }
      return 'You Accepted It';
    },
    ai: (c, e) => {
      const d = k => ((c.profile && c.profile.dials && c.profile.dials[k]) || 50) / 100;
      /* the dials a profile actually has: aggression, treachery, thrift, showmanship, tradition, patience */
      if (c.account.treasury < CONST.PETITION_COST * 4) return 'accept';
      /* a petition is a stance, not a reflex: only an OA the edict cuts against by
         temperament pays to say so, so an edict usually stands and sometimes falls */
      if (e.fleet === 'fast_wall') return d('patience') > 0.7 || d('aggression') < 0.3 ? 'petition' : 'accept';
      if (e.fleet === 'stun_grade') return d('aggression') > 0.75 ? 'petition' : 'accept';
      if (e.fleet === 'no_pacts') return d('treachery') < 0.3 || d('tradition') > 0.7 ? 'petition' : 'accept';
      if (e.fleet === 'levy') return d('thrift') > 0.6 ? 'petition' : 'accept';
      if (e.fleet === 'boom') return d('thrift') > 0.6 ? 'petition' : 'accept';
      return 'accept';
    }
  };
  /** After the fleet's month settles: count the petitions and let the edict stand or fall. */
  function settleFleet(state, gatherIntelFor) {
    const pend = state.fleet && state.fleet.pending; if (!pend || pend.applied) return null;
    pend.applied = true;
    const spec = FLEET_POOL.find(f => f.id === pend.id);
    const need = Math.ceil(state.ids.length * CONST.PETITION_SHARE);
    pend.withdrawn = !!spec.edict && pend.petitions >= need;
    if (!pend.withdrawn) {
      if (spec.id === 'levy') state.fleet.levy = CONST.LEVY;
      else if (spec.id === 'crash') state.fleet.priceMult = CONST.PRICE_CRASH;
      else if (spec.id === 'boom') state.fleet.priceMult = CONST.PRICE_BOOM;
      else if (spec.id === 'survey_public') { for (const id of state.ids) gatherIntelFor(id); }
      else state.fleet.edicts[spec.id] = true;
    }
    return { id: spec.id, title: spec.title, withdrawn: pend.withdrawn, petitions: pend.petitions, need };
  }
  const ACTS_FLEET = { petitioned_the_aleas: { aleas: -1, fleet: 1, residue: 0.1 } };
  if (REP && REP.ACTS) for (const k in ACTS_FLEET) if (!REP.ACTS[k]) REP.ACTS[k] = ACTS_FLEET[k];

  /* ---------------------------------------------------------------------- the machinery ---- */
  function ctxFor(rng, state, corpId) {
    /* the state rides on the ctx so a spec can read a fighter's hooks */
    const rivals = state.ids.filter(id => id !== corpId);
    return { rng, corps: state.corps, rivals, month: state.month, season: state.season, state: state,
             corpFlags: c => (c._eventFlags = c._eventFlags || {}) };
  }
  /** Draw a corp's events for the month it is entering. Idempotent per month. */
  function draw(state, corpId) {
    state.events = state.events || {};
    const key = state.season + ':' + state.month;
    const have = state.events[corpId];
    if (have && have.month === key) return have.list;
    const rng = P.mulberry32(P.seedFrom('ev' + state.season + 'm' + state.month + corpId));
    const corp = state.corps[corpId], ctx = ctxFor(rng, state, corpId);
    const list = [];
    /* the fleet's month: the same card for every OA, first */
    if (state.month === CONST.FLEET_MONTH) list.push(fleetCard(state));
    const tries = rng() < CONST.EVENT_P ? (rng() < CONST.SECOND_P ? 2 : 1) : 0;
    const used = {};
    for (let t = 0; t < tries; t++) {
      const pool = POOL.filter(p => !used[p.id]);
      for (let g = 0; g < 6 && pool.length; g++) {
        const spec = P.weightedPick(rng, pool.map(p => [p, p.weight * seedWeight(state, corp, p.id)]));
        const subject = spec.when(corp, ctx);
        if (subject == null) { pool.splice(pool.indexOf(spec), 1); continue; }
        const ev = spec.make(subject, corp, ctx);
        ev.id = spec.id + '-' + state.season + '-' + state.month; ev.pool = spec.id; ev.resolved = null;
        list.push(ev); used[spec.id] = true; break;
      }
    }
    state.events[corpId] = { month: key, list };
    return list;
  }
  /** Answer an event. Returns the line, or null if it was not open. */
  function answer(state, corpId, eventId, optionId) {
    const box = state.events && state.events[corpId]; if (!box) return null;
    const ev = box.list.find(e => e.id === eventId && !e.resolved); if (!ev) return null;
    const spec = ev.pool === 'fleet' ? FLEET_SPEC : BY_ID[ev.pool]; if (!spec) return null;
    const opt = ev.options.some(o => o.id === optionId) ? optionId : ev.def;
    const rng = P.mulberry32(P.seedFrom('evr' + eventId + optionId));
    const ctx = ctxFor(rng, state, corpId); ctx.state = state;
    const line = spec.resolve(state.corps[corpId], ev, opt, ctx);
    ev.resolved = { option: opt, line, defaulted: optionId === '__default' };
    return line;
  }
  /** At the month's end: an AI corp picks; anything still open takes its default. Returns
      the lines, with `defaulted` marked, for the recap. */
  function settle(state, corpId, isAI) {
    const box = state.events && state.events[corpId]; if (!box) return [];
    const out = [];
    for (const ev of box.list) {
      if (ev.resolved) { out.push(ev.resolved); continue; }
      const spec = ev.pool === 'fleet' ? FLEET_SPEC : BY_ID[ev.pool];
      const pick = isAI && spec ? spec.ai(state.corps[corpId], ev) : '__default';
      answer(state, corpId, ev.id, pick);
      out.push(ev.resolved);
    }
    return out;
  }
  /** The roles earn their keep each month: a Spy gathers, a Drill Sergeant drills. */
  function roles(corp, season, month, gatherIntel, rivals) {
    const r = corp._roles; if (!r) return [];
    const out = [];
    const still = id => alive(corp).some(f => f.id === id);
    if (r.spy && still(r.spy)) {
      const rng = P.mulberry32(P.seedFrom('spy' + season + month + corp.id));
      const target = rivals.length && rng() < 0.6 ? rivals[Math.floor(rng() * rivals.length)] : null;
      gatherIntel(target ? 'rival' : 'planet', target, CONST.SPY_LEVELS);
      out.push('The Spy Reported' + (target ? ' on a Rival' : ' on the Planet'));
    } else if (r.spy) delete r.spy;
    if (r.drill && still(r.drill)) {
      const green = alive(corp).filter(f => f.id !== r.drill && f.stats);
      if (green.length) {
        const rng = P.mulberry32(P.seedFrom('drill' + season + month + corp.id));
        const f = green[Math.floor(rng() * green.length)];
        const keys = ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve'];
        const k = keys.sort((a, b) => (f.stats[a] || 0) - (f.stats[b] || 0))[0];
        f.stats[k] = Math.min(f.potential || 100, (f.stats[k] || 0) + CONST.DRILL_GAIN);
        out.push('The Drill Sergeant Worked ' + f.name);
      }
    } else if (r.drill) delete r.drill;
    return out;
  }
  /* the roles' fighters do not field: the Divide's drop reads this */
  function offTheLine(corp) { const r = corp._roles || {}; return [r.spy, r.drill].filter(Boolean); }

  /* fighterHas is the one reader for "does this hand carry this hook" — season.js and the page
     ask it too now, rather than each growing a convention of its own */
  const api = { CONST, POOL, FLEET_POOL, draw, answer, settle, roles, offTheLine, settleFleet,
                fleetEventFor, useTraitIndex, fighterHas, storyMult, honorific, tiesOf, castFor,
                BY_ID, MOMENTS };
  return api;
});
