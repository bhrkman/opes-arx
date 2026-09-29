/* ============================================================================================
   TALKS — one word a month with one person, and what it costs.

   RULED: one talk a month, and it has to matter. Every talk buys something and costs
   something, so there is no talk you simply always make:

     Drive Them      a harder drill this month          more stress; a strained hand sours
     Praise          loyalty up, stress down            they coast next month
     Dress Down      snaps a slacker back               loyalty down
     Make a Promise  a large loyalty jump now           broken, it costs more than it gave
     Hear Them Out   nothing moves                      you learn their temper and what they want

   TEMPER is an undiscovered quirk (ruled). Everyone has one; it doubles one talk and turns
   another into a backfire. It is hidden until you hear them out, or until two talks have
   shown you how they take things. The engine learns tempers by the same two roads.

   REPEATS WEAR: the same talk to the same person two months running lands at half, and a
   third month running backfires however they are made.

   A CAPTAIN'S TALK carries: half of what it does to their loyalty and stress reaches the squad
   they lead, because a captain's mood is their squad's mood.

   SYMMETRY (ruled): an engine OA has the same one talk, chooses it through `aiTalk`, and is
   held to its promises the same way.

   This module owns the arithmetic and the words. `season.js` decides WHEN a talk happens and
   when a promise is settled; `events.js` lets a person ask for a word.
   ============================================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./prng.js'), require('./reputation.js'));
  else root.CDTALKS = factory(root.CDPRNG, root.CDREP);
})(typeof self !== 'undefined' ? self : this, function (P, REP) {
  'use strict';

  const CONST = {
    DRIVE_DRILL: 1.5,            // [C] drill gain this month, driven
    DRIVE_STRESS: 15,            // [C] what being driven costs
    DRIVE_STRAIN_AT: 50,         // [C] stress at which being driven sours a hand
    DRIVE_STRAIN_LOYALTY: -8,    // [C] and by this much
    PRAISE_LOYALTY: 12,          // [C]
    PRAISE_STRESS: -10,          // [C]
    SLACK: 0.8,                  // [C] drill gain the month after praise: they coast
    DRESS_DRILL: 1.25,           // [C] drill gain this month, dressed down
    DRESS_LOYALTY: -10,          // [C]
    PROMISE_LOYALTY: 20,         // [C] a promise, made
    PROMISE_WANTED: 1.5,         // [C] and made of the thing they wanted
    KEPT_LOYALTY: 5,             // [C] a promise kept is a small thing: it was owed
    BROKEN_LOYALTY: -30,         // [C] a promise broken is not
    BROKEN_STRESS: 10,           // [C]
    DOUBLED: 2,                  // [C] a talk that suits their temper lands twice
    REPEAT_FADE: 0.5,            // [C] the same talk two months running
    REPEAT_BACKFIRE: 3,          // [S] the same talk this many months running backfires
    REVEAL_AFTER: 2,             // [S] talks it takes to see someone's temper without asking
    GRUDGE_RENEWAL: 1.15,        // [C] what a grudge adds to their re-signing ask
    CAPTAIN_SPREAD: 0.5,         // [C] of a captain's talk, what reaches the roster (shared across captains)
    CAPTAIN_STRESS: 2,           // [C] a month of leading
    CAPTAIN_SWAY: 0.04,          // [C] a month's pull of the roster's loyalty toward its captains'
    CAPTAIN_NAMED_LOYALTY: 8,    // [C] being made a captain
    HISTORY: 12,                 // [S] talks remembered per person
    UP_DRILL: 1.4,               // [C] a Hungry sergeant Talks Them Up: drill, if drilled
    UP_LOYALTY: 6,               // [C]
    UP_RENEWAL: 0.10             // [C] and every time they are talked up, their next renewal asks this much more
  };

  const TALKS = [
    { id: 'drive',   name: 'Drive Them' },
    { id: 'praise',  name: 'Praise' },
    { id: 'dress',   name: 'Dress Down' },
    { id: 'promise', name: 'Make a Promise' },
    { id: 'hear',    name: 'Hear Them Out' }
  ];
  const TALK_NAME = {}; TALKS.forEach(t => { TALK_NAME[t.id] = t.name; });
  /* §STAFF the Hungry sergeant's own talk: never the manager's */
  TALK_NAME.up = 'Talk Them Up';

  /* what each temper takes well and badly. Dress Down backfires on two of five: it is the risky talk. */
  const TEMPERS = {
    proud:   { name: 'Proud',   doubles: 'drive',   backfires: 'dress',   text: 'Rises to a Challenge · Will Not Be Dressed Down' },
    hungry:  { name: 'Hungry',  doubles: 'promise', backfires: 'praise',  text: 'Wants a Shot · Coasts on Praise' },
    brittle: { name: 'Brittle', doubles: 'praise',  backfires: 'drive',   text: 'Blooms on Praise · Breaks When Driven' },
    cold:    { name: 'Cold',    doubles: 'dress',   backfires: 'promise', text: 'Answers to Discipline · Believes No Promises' },
    devoted: { name: 'Devoted', doubles: 'hear',    backfires: 'dress',   text: 'Wants to Be Heard · Wounded by a Dressing Down' }
  };
  const TEMPER_IDS = Object.keys(TEMPERS);

  /* what a promise can be of, and what it means */
  const PROMISES = {
    drop:  { name: 'A Place on the Drop',    mid: 'a Place on the Drop',  kept: 'Dropped as Promised' },
    eight: { name: 'A Place in the Eight',   mid: 'a Place in the Eight', kept: 'Fought in the Eight as Promised' },
    lead:  { name: 'A Squad to Lead',        mid: 'a Squad to Lead',      kept: 'Led a Squad as Promised' }
  };
  const WANTS = ['drop', 'drop', 'eight', 'lead'];   /* most want the drop */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------------------------------------------------------------- the undiscovered quirk */
  /** Their temper and what they want. Drawn once, from who they are, and never from the game's
      dice: a temper is not an event, and drawing it from the stream would move every career. */
  function temperOf(f) {
    if (!f.temper || !TEMPERS[f.temper]) {
      const rng = P.mulberry32(P.seedFrom('temper:' + f.id));
      f.temper = TEMPER_IDS[Math.floor(rng() * TEMPER_IDS.length)];
      f.want = WANTS[Math.floor(rng() * WANTS.length)];
    }
    return f.temper;
  }
  function wantOf(f) { temperOf(f); return f.want; }
  function temperKnown(f) { return !!f.temperKnown; }
  /** what the manager may see: the temper once found, nothing before */
  function temperShown(f) {
    if (!f.temperKnown) return null;
    const t = TEMPERS[temperOf(f)];
    return { id: f.temper, name: t.name, text: t.text, want: f.want, wantName: PROMISES[f.want].mid };
  }

  /* ------------------------------------------------------------------------------- memory */
  function history(f) { return (f._talks = f._talks || []); }
  /** how many months running this person has had this same talk, up to last month */
  function runOf(f, kind, abs) {
    const h = history(f);
    let n = 0;
    for (let back = 1; back <= CONST.REPEAT_BACKFIRE; back++) {
      if (h.some(t => t.abs === abs - back && t.kind === kind)) n++;
      else break;
    }
    return n;
  }
  function talkedThisMonth(corp, abs) { return corp._talked && corp._talked.abs === abs ? corp._talked : null; }

  /** how a talk would land, as far as the one asking can know. `seen` false hides the temper. */
  function landing(f, kind, abs, seen) {
    /* the run is the manager's own history and always known; the temper only once found */
    const run = kind === 'hear' ? 0 : runOf(f, kind, abs);
    if (kind !== 'hear' && run + 1 >= CONST.REPEAT_BACKFIRE) return 'backfired';
    const t = TEMPERS[temperOf(f)];
    let how = !seen ? 'plain' : t.backfires === kind ? 'backfired' : t.doubles === kind ? 'doubled' : 'plain';
    if (run && how !== 'backfired') how = how === 'doubled' ? 'plain' : 'faded';   /* doubled, then halved */
    return how;
  }

  /** The talk's numbers, before anything is applied. Pure: the page previews with it. */
  function effects(f, kind, how, promiseKind, blind) {
    const e = { loyalty: 0, stress: 0, drill: 1, slackNext: false, slackNow: false, clearSlack: false, grudge: false, reveal: false };
    const stress0 = (f.condition && f.condition.stress) || 0;
    const scale = how === 'doubled' ? CONST.DOUBLED : how === 'faded' ? CONST.REPEAT_FADE : 1;
    if (kind === 'drive') {
      if (how === 'backfired') { e.stress = CONST.DRIVE_STRESS * 2; e.loyalty = CONST.DRIVE_STRAIN_LOYALTY * 2; }
      else {
        e.drill = 1 + (CONST.DRIVE_DRILL - 1) * scale;
        e.stress = CONST.DRIVE_STRESS;
        if (stress0 > CONST.DRIVE_STRAIN_AT) e.loyalty = CONST.DRIVE_STRAIN_LOYALTY;
      }
    } else if (kind === 'praise') {
      if (how === 'backfired') { e.slackNow = true; e.slackNext = true; }
      else { e.loyalty = CONST.PRAISE_LOYALTY * scale; e.stress = CONST.PRAISE_STRESS * scale; e.slackNext = true; }
    } else if (kind === 'dress') {
      if (how === 'backfired') { e.loyalty = CONST.DRESS_LOYALTY * 2; e.grudge = true; }
      else {
        e.drill = 1 + (CONST.DRESS_DRILL - 1) * scale; e.clearSlack = true;
        e.loyalty = how === 'doubled' ? CONST.DRESS_LOYALTY / 2 : CONST.DRESS_LOYALTY;
      }
    } else if (kind === 'promise') {
      if (how !== 'backfired') {
        /* what they want is part of the undiscovered quirk: a preview made blind does not know it */
        const wanted = !blind && promiseKind && promiseKind === wantOf(f) ? CONST.PROMISE_WANTED : 1;
        e.loyalty = CONST.PROMISE_LOYALTY * scale * wanted;
      }
      e.owedAt = promiseKind === 'eight' ? 'the Eight' : 'the Lock';
    } else if (kind === 'up') {
      e.drill = 1 + (CONST.UP_DRILL - 1) * scale; e.loyalty = CONST.UP_LOYALTY * scale; e.talkedUp = true;
    } else if (kind === 'hear') {
      e.reveal = true;
      if (how === 'doubled') { e.loyalty = 8; e.stress = -8; }
    }
    e.loyalty = Math.round(e.loyalty); e.stress = Math.round(e.stress);
    return e;
  }

  const HOW_WORD = { plain: '', doubled: ' — It Landed', faded: ' — It Wore Thin', backfired: ' — It Backfired' };
  function lineFor(f, kind, how, promiseKind) {
    const n = f.name;
    const base = kind === 'drive' ? 'Drove ' + n + ' Hard'
               : kind === 'praise' ? 'Praised ' + n
               : kind === 'dress' ? 'Dressed Down ' + n
               : kind === 'promise' ? 'Promised ' + n + ' ' + PROMISES[promiseKind].mid
               : kind === 'up' ? 'Talked ' + n + ' Up'
               : 'Heard ' + n + ' Out';
    return base + (HOW_WORD[how] || '');
  }

  /* --------------------------------------------------------------------------- promises */
  function promisesOf(corp) { return (corp._promises = corp._promises || []); }
  function openPromise(corp, f, kind, season) {
    return promisesOf(corp).find(p => p.fighterId === f.id && p.kind === kind && p.season === season && p.status === 'open') || null;
  }
  function makePromise(corp, f, kind, season, abs, source) {
    if (!PROMISES[kind]) return null;
    const have = openPromise(corp, f, kind, season);
    if (have) return have;
    const p = { fighterId: f.id, name: f.name, kind, season, abs, source: source || 'talk', status: 'open' };
    promisesOf(corp).push(p);
    /* the record is a few years long, not a career long */
    const list = promisesOf(corp);
    while (list.length > 60) list.shift();
    return p;
  }
  /** Settle one promise. `outcome` is 'kept', 'broken' or 'void' (it stopped being possible
      through nobody's choice: they died, left, or were hurt too badly to go). Idempotent. */
  function settlePromise(corp, p, outcome, f) {
    if (!p || p.status !== 'open') return null;
    p.status = outcome;
    if (!f) return p;
    if (outcome === 'kept') {
      f.loyalty = clamp((f.loyalty == null ? 50 : f.loyalty) + CONST.KEPT_LOYALTY, 0, 100);
      /* a captaincy kept is the ordinary course of a year, not news; a promise made in a talk is */
      if (corp.rep && p.source !== 'captain') REP.act(corp.rep, 'kept_a_promise', {});
    } else if (outcome === 'broken') {
      f.loyalty = clamp((f.loyalty == null ? 50 : f.loyalty) + CONST.BROKEN_LOYALTY, 0, 100);
      if (f.condition) f.condition.stress = clamp((f.condition.stress || 0) + CONST.BROKEN_STRESS, 0, 100);
      if (corp.rep) REP.act(corp.rep, 'broke_a_promise', { grave: (f.fame || 0) >= 60 });
    }
    return p;
  }

  /* ------------------------------------------------------------------------------ the talk */
  /**
   * Have the talk. ctx: { abs, season, promise (kind, for a promise), captains (array of ids),
   * roster (the corp's living people, for a captain's reach) }. Returns what happened, or null
   * if the talk was not legal (unknown kind, a promise of nothing).
   */
  function talk(corp, f, kind, ctx) {
    if (!f || !TALK_NAME[kind]) return null;
    if (kind === 'promise' && !PROMISES[ctx.promise]) return null;
    temperOf(f);
    const how = landing(f, kind, ctx.abs, true);        /* the landing is what it is; only the preview hides it */
    const e = effects(f, kind, how, ctx.promise);
    /* §STAFF a sergeant's word lands as well as their Craft lets it */
    const bySgt = ctx.by === 'sergeant';
    if (bySgt && ctx.scale != null) {
      e.loyalty = Math.round(e.loyalty * ctx.scale); e.stress = Math.round(e.stress * ctx.scale);
      if (e.drill !== 1) e.drill = 1 + (e.drill - 1) * ctx.scale;
    }
    if (e.talkedUp) f._talkedUp = (f._talkedUp || 0) + 1;
    f.loyalty = clamp((f.loyalty == null ? 50 : f.loyalty) + e.loyalty, 0, 100);
    if (f.condition) f.condition.stress = clamp((f.condition.stress || 0) + e.stress, 0, 100);
    if (e.drill !== 1) f._drillMult = { abs: ctx.abs, mult: e.drill };
    f._slack = (f._slack || []).filter(a => a >= ctx.abs);
    if (e.clearSlack) f._slack = f._slack.filter(a => a !== ctx.abs && a !== ctx.abs + 1);
    if (e.slackNow) f._slack.push(ctx.abs);
    if (e.slackNext) f._slack.push(ctx.abs + 1);
    if (e.grudge) f._grudge = true;
    if (kind === 'promise') makePromise(corp, f, ctx.promise, ctx.season, ctx.abs, 'talk');
    /* a captain's mood is the barracks' */
    const caps = ctx.captains || [];
    let reached = 0;
    if (caps.indexOf(f.id) >= 0 && (e.loyalty || e.stress)) {
      /* their own squad feels half of it; where there is no board to say who that is, the roster
         shares it across the captains */
      const share = ctx.squad ? CONST.CAPTAIN_SPREAD : CONST.CAPTAIN_SPREAD / Math.max(1, caps.length);
      for (const o of (ctx.squad || ctx.roster || [])) {
        if (o === f) continue;
        o.loyalty = clamp((o.loyalty == null ? 50 : o.loyalty) + e.loyalty * share, 0, 100);
        if (o.condition) o.condition.stress = clamp((o.condition.stress || 0) + e.stress * share, 0, 100);
        reached++;
      }
    }
    /* how they take it is how you come to know them */
    const h = history(f);
    h.push({ abs: ctx.abs, season: ctx.season, month: ctx.abs % 100, kind, how, promise: kind === 'promise' ? ctx.promise : undefined, by: bySgt ? ctx.byName : undefined });
    while (h.length > CONST.HISTORY) h.shift();
    let revealed = false;
    if (!f.temperKnown && (e.reveal || h.length >= CONST.REVEAL_AFTER)) { f.temperKnown = true; revealed = true; }
    const line = (bySgt ? ctx.byName + ' ' : '') + lineFor(f, kind, how, ctx.promise);
    if (bySgt) corp._sgtTalked = { abs: ctx.abs, fighterId: f.id, kind, how, line };
    else corp._talked = { abs: ctx.abs, fighterId: f.id, kind, how, line };
    return { fighterId: f.id, name: f.name, kind, how, promise: ctx.promise, loyalty: e.loyalty, stress: e.stress,
             drill: e.drill, reached, revealed, temper: revealed ? TEMPERS[f.temper].name : null, line };
  }

  /** this month's drill multiplier for a person: driven, dressed down, or coasting */
  function drillMult(f, abs) {
    let m = f._drillMult && f._drillMult.abs === abs ? f._drillMult.mult : 1;
    if ((f._slack || []).indexOf(abs) >= 0) m *= CONST.SLACK;
    return m;
  }

  /** what the manager sees before choosing: the numbers as far as they can know them */
  function preview(f, kind, abs, promiseKind) {
    const how = landing(f, kind, abs, !!f.temperKnown);
    const e = Object.assign({ how }, effects(f, kind, how, promiseKind, !f.temperKnown));
    if (f.temperKnown) e.reveal = false;        /* nothing left to learn by asking */
    return e;
  }

  /** a preview in the page's words: Title Case, the numbers that move */
  const HOW_TAG = { doubled: 'Suits Them', faded: 'Wearing Thin', backfired: 'Backfires' };
  function describe(e) {
    const sgn = v => (v > 0 ? '+' : '−') + Math.abs(v);
    const parts = [];
    if (HOW_TAG[e.how]) parts.push(HOW_TAG[e.how]);
    /* the bonus rides the drill: a hand not drilled this month learns nothing more for being driven */
    if (e.drill && e.drill !== 1) parts.push('Drill ×' + (Math.round(e.drill * 100) / 100) + ' If Drilled');
    if (e.loyalty) parts.push('Loyalty ' + sgn(e.loyalty));
    if (e.stress) parts.push('Stress ' + sgn(e.stress));
    if (e.slackNow) parts.push('Coasts This Month');
    if (e.slackNext) parts.push('Coasts Next Month');
    if (e.clearSlack) parts.push('Ends Any Coasting');
    if (e.grudge) parts.push('Holds a Grudge');
    if (e.reveal) parts.push('Learn Their Temper');
    if (e.talkedUp) parts.push('Asks More at Renewal');
    if (e.owedAt) parts.push('Owed at ' + e.owedAt);
    return parts.join(' · ') || 'Nothing Moves';
  }

  /* ---------------------------------------------------------------------- the engine's word */
  /**
   * An engine OA's talk for the month, chosen by the same rules a person reads. ctx:
   * { abs, captains, promisable (kinds open now), drilled (Set of ids it is drilling) }.
   * Returns { fighterId, kind, promise } or null.
   */
  function aiTalk(corp, ctx) {
    /* nobody gets the manager two months running while anyone else needs a word */
    const lastWho = (corp._talked && corp._talked.abs === ctx.abs - 1) ? corp._talked.fighterId : null;
    const all = corp.roster.filter(f => f.status === 'active' || f.status === 'injured');
    const alive = all.length > 1 ? all.filter(f => f.id !== lastWho) : all;
    if (!alive.length) return null;
    const caps = new Set(ctx.captains || []);
    const loy = f => (f.loyalty == null ? 50 : f.loyalty);
    const str = f => ((f.condition && f.condition.stress) || 0);
    /* who: a sour captain first, then the sourest hand, then whoever the drill is working */
    let who = alive.filter(f => caps.has(f.id) && loy(f) < 45).sort((a, b) => loy(a) - loy(b))[0]
           || alive.filter(f => loy(f) < 35).sort((a, b) => loy(a) - loy(b))[0]
           || alive.filter(f => caps.has(f.id) && !f.temperKnown)[0]
           || alive.filter(f => ctx.drilled && ctx.drilled.has(f.id) && str(f) < 40).sort((a, b) => str(a) - str(b))[0]
           || alive.slice().sort((a, b) => loy(a) - loy(b))[0];
    if (!who) return null;
    temperOf(who);
    const legal = kind => kind !== 'promise' || (ctx.promisable || []).length;
    const ok = kind => legal(kind) && landing(who, kind, ctx.abs, !!who.temperKnown) !== 'backfired'
                    && landing(who, kind, ctx.abs, !!who.temperKnown) !== 'faded';
    let kind = null;
    if (!who.temperKnown && (caps.has(who.id) || loy(who) < 40)) kind = 'hear';
    else if (who.temperKnown && ok(TEMPERS[who.temper].doubles)) kind = TEMPERS[who.temper].doubles;
    else if (loy(who) < 40 && ok('praise')) kind = 'praise';
    else if (str(who) < 30 && ok('drive')) kind = 'drive';
    else if (ok('praise')) kind = 'praise';
    else if (ok('hear')) kind = 'hear';
    if (!kind) return null;
    let promise;
    if (kind === 'promise') {
      const want = wantOf(who);
      promise = (ctx.promisable || []).indexOf(want) >= 0 && (want !== 'lead' || caps.has(who.id)) ? want
              : (ctx.promisable || []).indexOf('drop') >= 0 ? 'drop' : null;
      if (!promise) kind = 'praise';
    }
    return { fighterId: who.id, kind, promise };
  }

  return { CONST, TALKS, TALK_NAME, TEMPERS, PROMISES, temperOf, wantOf, temperKnown, temperShown,
           runOf, landing, effects, preview, describe, talk, drillMult, talkedThisMonth,
           promisesOf, openPromise, makePromise, settlePromise, aiTalk, lineFor };
});
