/* ============================================================================================
   STAFF — the backroom. Six posts, one number, and mostly your own people.

   RULED (the staff pass):
   - Six posts: Drillmaster, Sergeant, Quartermaster, Fixer, Surgeon, Spymaster. Nobody on the
     staff goes into the Divide: the backroom works at home.
   - ONE SYSTEM. Everybody who could hold a post — your fighters, a rival's staff, an outside
     specialist — has a CRAFT for every post, 0 to 100, and Craft is the only thing a post reads.
     A veteran's Craft comes from who they were on the line: natural in the military posts,
     arguable in the Quartermaster's and the Fixer's, poor in the Surgeon's and the Spymaster's.
     A specialist is a stranger with a great deal of one Craft and little of the rest, and costs
     two or three times a veteran's wage.
   - Anyone may move to the backroom at any time, and nobody comes back.
   - Craft grows with years in a post, fastest for those furthest from the top.
   - A stranger's Craft is an estimate while you are hiring: a range, never the number.
   - A staff contract carries a RELEASE FEE, not a term a rival must wait out: anyone may pay it
     and take the person, if the person is willing. Taking a house's staff costs regard with
     that house, and they bring a year's knowledge of it with them.
   - Staff age, retire later than fighters do, and renegotiate — a good record gets expensive.
   - The Sergeant has a free second talk a month; the person is yours to choose, the talk is
     their temper's: Proud drives, Cold dresses down, Brittle praises, Devoted hears them out,
     and Hungry TALKS THEM UP — a better month now, a dearer contract later.
   - Every post has a SCHOOL: two ways of doing the job, each with its own cost.

   SYMMETRY (ruled): the engine's OAs hire, poach, renew and are poached by the same rules.
   This module owns the numbers and the choices; `season.js` owns when they happen.
   ============================================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./prng.js'), require('./talks.js'), require('./facilities.js'));
  else root.CDSTAFF = factory(root.CDPRNG, root.CDTALKS, root.CDFAC);
})(typeof self !== 'undefined' ? self : this, function (P, TALKS, FAC) {
  'use strict';

  const CONST = {
    STAT_FLOOR: 50, STAT_SPAN: 1.5,     // [C] a fighter stat of 50 is Craft 0, of 200 is Craft 100
    VET_ARGUABLE: 0.70,                 // [C] a veteran's reach into the Quartermaster's and Fixer's work
    VET_SURGEON: 0.35,                  // [C] and into the Surgeon's
    VET_SPY: 0.30,                      // [C] and the Spymaster's
    SPEC_LO: 55, SPEC_HI: 90,           // [C] a specialist's Craft in their own post
    SPEC_OTHER: 20,                     // [C] and at most this in any other
    GROWTH: 0.08,                       // [C] a year in post closes this share of the gap to 100
    GROWTH_FLAT: 2,                     // [C] and adds this much besides
    VET_WAGE_BASE: 5000, VET_WAGE_PER: 100,     // [C] a year's wage for a veteran, by Craft in post
    SPEC_WAGE_BASE: 10000, SPEC_WAGE_PER: 250,  // [C] and for a specialist
    POACH_RAISE: 1.2,                   // [C] what a poached staffer is paid over what they were
    FEE_BASE: 1.0, FEE_PER_YEAR: 0.25,  // [C] release fee: a year's wage, and a quarter more per year in post
    VET_TERM: 3, SPEC_TERM: 2,          // [S] contract years
    RENEW_RAISE: 0.10,                  // [C] what a renewal asks over the old wage
    RENEW_PER_YEAR: 0.03,               // [C] and more for every year of record
    RETIRE_FROM: 58, RETIRE_STEP: 0.10, // [C] from this age, this much more chance a year of retiring
    SPEC_AGE: [35, 55],                 // [S]
    POOL_SIZE: 9,                       // [S] specialists looking for a post each year
    ESTIMATE_SPEC: 15,                  // [S] how wide a specialist's Craft is guessed, either way
    ESTIMATE_RIVAL: 10,                 // [S] and a rival's staffer, whom the fleet has watched work
    POACH_INTEL_LEVELS: 6,              // [C] what they tell you of their old house on arrival
    POACH_INTEL_MONTHS: 12,             // [S] and they go on telling you, a little, this long
    POACH_INTEL_MONTHLY: 2,             // [C]
    SERGEANT_FLOOR: 0.4,                // [C] a Craft-0 sergeant's talk lands at this share
    DRILL_HARD: 0.45, DRILL_PATIENT: 0.25,      // [C] drill yield at Craft 100, by school
    DRILL_BEST: 0.35,                   // [C] more again in the drillmaster's own best stats
    DRILL_HARD_STRESS: 0.5, DRILL_PATIENT_CALM: 0.4,   // [C] what the school does to the drill's strain
    QM_HAGGLE: 0.20, QM_ARMOURER_HAGGLE: 0.08,  // [C] shelf discount at Craft 100
    QM_PROCURE: 0.5,                    // [C] share of the shelf discount won on the drop's procurement
    QM_KIT: 0.15,                       // [C] an Armourer's reach into the kit budget
    FIX_SHOW_GOOD: 0.40, FIX_SHOW_BAD: 0.10,    // [C] a Showman: louder news, a little less of the bad
    FIX_DIP_GOOD: 0.15, FIX_DIP_BAD: 0.35, FIX_DIP_HOUSES: 0.40,   // [C] a Diplomat
    FIX_COURT: 0.30,                    // [C] courting, at Craft 100
    SURGEON_DRIFT: 1.0,                 // [C] the body's own mending, doubled at Craft 100
    SURGEON_FOCUS: 0.5,                 // [C] and rest's mending
    NURSE_DRIFT: 0.5, NURSE_CALM: 3,    // [C] a Nurse mends more and calms the hurt
    CUTTER_P: 0.35, CUTTER_P_CRAFT: 0.5,         // [C] an operation's chance, and Craft's share of it
    CUTTER_DEATH: 0.35,                 // [C] a failed operation kills at this share of (1 − Craft)
    WATCHER_LEVELS: 4,                  // [C] a Watcher's reports a month at Craft 100
    MOLE_LEVELS: 6,                     // [C] a mole's, into one house
    MOLE_EXPOSE: 0.05                   // [C] a month's chance a mole is found, at Craft 0 (halved at 100)
  };

  const POSTS = ['drill', 'sergeant', 'quartermaster', 'fixer', 'surgeon', 'spymaster'];
  const POST_NAME = { drill: 'Drillmaster', sergeant: 'Sergeant', quartermaster: 'Quartermaster',
                      fixer: 'Fixer', surgeon: 'Surgeon', spymaster: 'Spymaster' };
  const SCHOOLS = {
    drill:         { hard: { name: 'Hard School', text: 'Faster Gains · More Strain' },
                     patient: { name: 'Patient School', text: 'Steady Gains · Calmer Drill' } },
    sergeant:      { temper: { name: 'By Temper', text: 'Their Temper Decides the Talk' } },
    quartermaster: { haggler: { name: 'Haggler', text: 'Cheaper at the Market and the Drop' },
                     armourer: { name: 'Armourer', text: 'A Deeper Kit Budget at the Drop' } },
    fixer:         { showman: { name: 'Showman', text: 'Good News Carries Further' },
                     diplomat: { name: 'Diplomat', text: 'Bad News Softened · Warms the Houses' } },
    surgeon:       { cutter: { name: 'Cutter', text: 'Can Operate on the Crippled · Some Die on the Table' },
                     nurse: { name: 'Nurse', text: 'Faster Mending · Calms the Hurt' } },
    spymaster:     { watcher: { name: 'Watcher', text: 'Steady Reports · Nothing to Be Caught At' },
                     mole: { name: 'Mole', text: 'Deep Into One House · May Be Exposed' } }
  };
  /* the Sergeant's talk, by their own temper */
  const SERGEANT_TALK = { proud: 'drive', cold: 'dress', brittle: 'praise', devoted: 'hear', hungry: 'up' };
  const SERGEANT_TALK_NAME = { drive: 'Drives Them', dress: 'Dresses Them Down', praise: 'Praises Them', hear: 'Hears Them Out', up: 'Talks Them Up' };
  /* the few quirks that fit a post */
  const TRAIT_CRAFT = { steady_hands: { surgeon: 20 }, born_captain: { sergeant: 12 },
                        armchair_general: { quartermaster: 10, drill: 8 }, ankoth_sympathizer: { spymaster: 20 } };
  const STATS = ['aim', 'grit', 'reflex', 'fieldcraft', 'tactics', 'presence', 'resolve'];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const m = x => clamp(((x || 0) - CONST.STAT_FLOOR) / CONST.STAT_SPAN, 0, 100);
  const rngFor = key => P.mulberry32(P.seedFrom('staff:' + key));

  /* ------------------------------------------------------------------------------- craft */
  /** What a fighter would bring to each post, read off who they were on the line. */
  function veteranCraft(f) {
    const s = f.stats || {}, divs = f.divides || 0;
    const best = STATS.map(k => s[k] || 0).sort((a, b) => b - a).slice(0, 3);
    const c = {
      drill: m(best.reduce((a, b) => a + b, 0) / 3) + Math.min(20, divs * 2),
      sergeant: m(((s.presence || 0) + (s.resolve || 0)) / 2) + Math.min(20, divs * 3),
      quartermaster: CONST.VET_ARGUABLE * m(((s.fieldcraft || 0) + (s.tactics || 0)) / 2) + Math.min(10, divs),
      fixer: CONST.VET_ARGUABLE * (0.6 * m(s.presence) + 0.4 * clamp(f.fame || 0, 0, 100)),
      surgeon: CONST.VET_SURGEON * m(s.resolve),
      spymaster: CONST.VET_SPY * m(s.fieldcraft)
    };
    for (const t of (f.traits || [])) for (const p in (TRAIT_CRAFT[t] || {})) c[p] += TRAIT_CRAFT[t][p];
    for (const p of POSTS) c[p] = Math.round(clamp(c[p], 0, 100));
    return c;
  }
  /** the stats a drillmaster teaches best: their own best three */
  function bestStats(st) {
    const s = st.stats || {};
    return STATS.slice().sort((a, b) => (s[b] || 0) - (s[a] || 0)).slice(0, 3);
  }
  function schoolFor(st, post) {
    const opts = Object.keys(SCHOOLS[post]);
    if (opts.length === 1) return opts[0];
    if (post === 'drill') {
      const t = TALKS.temperOf(st);
      return (t === 'brittle' || t === 'devoted') ? 'patient' : 'hard';
    }
    return opts[Math.floor(rngFor(st.id + ':' + post)() * opts.length)];
  }
  function wageFor(craft, origin) {
    const y = origin === 'specialist' ? CONST.SPEC_WAGE_BASE + CONST.SPEC_WAGE_PER * craft
                                      : CONST.VET_WAGE_BASE + CONST.VET_WAGE_PER * craft;
    return Math.round(y / 12 / 10) * 10;       /* monthly, as a fighter's salary is */
  }

  /* ------------------------------------------------------------------------ the people */
  /** A fighter comes off the line. The body keeps its name, stats, quirks and temper. */
  function fromFighter(f, post) {
    const craft = veteranCraft(f);
    const st = { id: f.id, name: f.name, race: f.race, age: f.age || 30, stats: Object.assign({}, f.stats || {}),
                 traits: (f.traits || []).slice(), divides: f.divides || 0, fame: f.fame || 0,
                 temper: f.temper, want: f.want, temperKnown: !!f.temperKnown, loyalty: f.loyalty == null ? 55 : f.loyalty,
                 origin: 'veteran', craft, years: {}, record: {}, mark: f.mark || null, pair_name: f.pair_name };
    TALKS.temperOf(st);
    st.post = post;
    st.school = schoolFor(st, post);
    st.wage = Math.max(((f.contract || {}).salary || 0), wageFor(craft[post], 'veteran'));
    st.term = CONST.VET_TERM;
    return st;
  }
  /** The year's outside specialists: the same list for every OA, drawn from the season alone. */
  function specialistPool(season, world) {
    /* §SEEDS the year's specialists are this career's, not every career's */
    const rng = rngFor('pool' + (world || 0) + ':' + season);
    const out = [];
    const RACES = ['human', 'human', 'human', 'etu', 'kellis', 'svalbard'];
    const FIRST = ['Aldo', 'Brea', 'Casimir', 'Dessa', 'Emrick', 'Fenna', 'Gorran', 'Hesper', 'Ilse', 'Joss', 'Kerel', 'Lusa',
                   'Maro', 'Nell', 'Orsin', 'Petra', 'Quill', 'Rhosyn', 'Stellan', 'Tamsin', 'Ulric', 'Vesna', 'Wystan', 'Yara'];
    const LAST = ['Achter', 'Brandt', 'Corvel', 'Dunmore', 'Ellery', 'Farrow', 'Graves', 'Holm', 'Iverson', 'Kade', 'Lorne',
                  'Marsh', 'Novak', 'Orme', 'Pell', 'Quint', 'Rask', 'Soren', 'Thorne', 'Vale', 'Wren'];
    /* the posts a stranger is worth hiring for, weighted toward the ones veterans do badly */
    const WANT = ['surgeon', 'surgeon', 'spymaster', 'spymaster', 'fixer', 'quartermaster', 'drill', 'sergeant', 'fixer'];
    for (let i = 0; i < CONST.POOL_SIZE; i++) {
      const post = WANT[i % WANT.length];
      const id = 'spc' + (world || 0).toString(36) + '_' + season + '_' + i;
      const craft = {};
      for (const p of POSTS) craft[p] = Math.round(rng() * CONST.SPEC_OTHER);
      craft[post] = Math.round(CONST.SPEC_LO + rng() * (CONST.SPEC_HI - CONST.SPEC_LO));
      const st = { id, name: FIRST[Math.floor(rng() * FIRST.length)] + ' ' + LAST[Math.floor(rng() * LAST.length)],
                   race: RACES[Math.floor(rng() * RACES.length)],
                   age: Math.round(CONST.SPEC_AGE[0] + rng() * (CONST.SPEC_AGE[1] - CONST.SPEC_AGE[0])),
                   stats: {}, traits: [], origin: 'specialist', specialty: post, craft, years: {}, record: {},
                   loyalty: 50, temperKnown: false };
      TALKS.temperOf(st);
      st.post = null;
      st.school = schoolFor(st, post);
      st.wage = wageFor(craft[post], 'specialist');
      st.term = CONST.SPEC_TERM;
      out.push(st);
    }
    return out;
  }
  /** a stranger's Craft as the hiring manager sees it: a range that holds the truth somewhere inside */
  function estimate(st, post, width) {
    const v = st.craft[post];
    const off = Math.round((rngFor('est:' + st.id + ':' + post)() - 0.5) * width);   /* where the truth sits in it */
    const lo = clamp(Math.round((v - width + off) / 5) * 5, 0, 100);
    const hi = clamp(Math.round((v + width + off) / 5) * 5, 0, 100);
    return { lo: Math.min(lo, v), hi: Math.max(hi, v) };
  }
  function feeOf(st) {
    const yrs = (st.years && st.years[st.post]) || 0;
    return Math.round(st.wage * 12 * (CONST.FEE_BASE + CONST.FEE_PER_YEAR * yrs) / 100) * 100;
  }

  /* ---------------------------------------------------------------------------- the office */
  function office(corp) {
    corp.staff = corp.staff || { posts: {}, gone: [] };
    for (const p of POSTS) if (!(p in corp.staff.posts)) corp.staff.posts[p] = null;
    return corp.staff;
  }
  function holder(corp, post) { return corp && corp.staff && corp.staff.posts ? corp.staff.posts[post] || null : null; }
  /** how good the post is being done, 0..1, and in which school */
  /* §FACILITIES a staffer's Craft reaches further from a better facility */
  function eff(corp, post) {
    const st = holder(corp, post);
    return st ? { e: (st.craft[post] || 0) / 100 * FAC.staffMult(corp, post), school: st.school, st } : { e: 0, school: null, st: null };
  }
  function allStaff(corp) { const o = office(corp); return POSTS.map(p => o.posts[p]).filter(Boolean); }

  /* ------------------------------------------------------------------------- what they do */
  /** the drill: a yield multiplier for one stat, and what the drill's strain is multiplied by */
  function drillFor(corp, stat) {
    const d = eff(corp, 'drill');
    const yard = FAC.yardYield(corp);   /* §FACILITIES the yard works whoever runs it */
    if (!d.st) return { yield: yard, strain: 1 };
    const base = d.school === 'hard' ? CONST.DRILL_HARD : CONST.DRILL_PATIENT;
    const best = bestStats(d.st).indexOf(stat) >= 0 ? CONST.DRILL_BEST : 0;
    const strain = d.school === 'hard' ? 1 + CONST.DRILL_HARD_STRESS * d.e : 1 - CONST.DRILL_PATIENT_CALM * d.e;
    return { yield: (1 + (base + best) * d.e) * yard, strain };
  }
  function shelfDiscount(corp) {
    const q = eff(corp, 'quartermaster');
    if (!q.st) return 0;
    return (q.school === 'haggler' ? CONST.QM_HAGGLE : CONST.QM_ARMOURER_HAGGLE) * q.e;
  }
  function kitBoost(corp) {
    const q = eff(corp, 'quartermaster');
    return q.st && q.school === 'armourer' ? 1 + CONST.QM_KIT * q.e : 1;
  }
  /** what the Fixer does to the stands' hearing of your acts */
  function spin(corp) {
    const f = eff(corp, 'fixer');
    if (!f.st) return null;
    if (f.school === 'showman') return { good: 1 + CONST.FIX_SHOW_GOOD * f.e, bad: 1 - CONST.FIX_SHOW_BAD * f.e, houses: 1 };
    return { good: 1 + CONST.FIX_DIP_GOOD * f.e, bad: 1 - CONST.FIX_DIP_BAD * f.e, houses: 1 + CONST.FIX_DIP_HOUSES * f.e };
  }
  function courtMult(corp) { const f = eff(corp, 'fixer'); return 1 + CONST.FIX_COURT * f.e; }
  function surgeonFor(corp) {
    const s = eff(corp, 'surgeon'), bay = FAC.mendMult(corp);   /* §FACILITIES the infirmary mends, staffed or not */
    if (!s.st) return { drift: bay, focus: 1, calm: 0, cutter: false, e: 0 };
    const nurse = s.school === 'nurse';
    return { drift: (1 + CONST.SURGEON_DRIFT * s.e + (nurse ? CONST.NURSE_DRIFT * s.e : 0)) * bay, focus: 1 + CONST.SURGEON_FOCUS * s.e,
             calm: nurse ? CONST.NURSE_CALM * s.e : 0, cutter: s.school === 'cutter' && FAC.cutterAllowed(corp), e: s.e };
  }
  function operateOdds(corp) {
    const s = surgeonFor(corp);
    if (!s.cutter) return null;
    return { live: CONST.CUTTER_P + CONST.CUTTER_P_CRAFT * s.e, die: CONST.CUTTER_DEATH * (1 - s.e) };
  }

  /* --------------------------------------------------------------- the Sergeant's word */
  function sergeantTalk(corp) {
    const s = holder(corp, 'sergeant');
    if (!s) return null;
    const kind = SERGEANT_TALK[TALKS.temperOf(s)];
    return { kind, name: SERGEANT_TALK_NAME[kind], scale: CONST.SERGEANT_FLOOR + (1 - CONST.SERGEANT_FLOOR) * (s.craft.sergeant || 0) / 100, st: s };
  }

  /* ---------------------------------------------------------------- the year's turning */
  /** A year passes for the backroom: Craft grows in post, people age, some retire, contracts
      come due. Returns what happened, for the recap. Retirement is drawn from the person and
      the year, never the game's stream. */
  function yearTurns(corp, season) {
    const o = office(corp), out = { retired: [], due: [] };
    for (const p of POSTS) {
      const st = o.posts[p]; if (!st) continue;
      st.years[p] = (st.years[p] || 0) + 1;
      st.craft[p] = Math.round(clamp(st.craft[p] + (100 - st.craft[p]) * CONST.GROWTH + CONST.GROWTH_FLAT, 0, 100));
      st.age = (st.age || 40) + 1;
      st.loyalty = clamp((st.loyalty == null ? 50 : st.loyalty) + 2, 0, 100);
      const pRetire = st.age >= CONST.RETIRE_FROM ? (st.age - CONST.RETIRE_FROM + 1) * CONST.RETIRE_STEP : 0;
      if (pRetire && rngFor('retire:' + st.id + ':' + season)() < pRetire) {
        o.posts[p] = null; o.gone.push({ name: st.name, post: p, why: 'retired', season });
        out.retired.push(st); continue;
      }
      st.term = (st.term || 1) - 1;
      if (st.term <= 0) {
        st.asking = Math.round(st.wage * (1 + CONST.RENEW_RAISE + CONST.RENEW_PER_YEAR * (st.years[p] || 0)) / 10) * 10;
        out.due.push(st);
      }
    }
    while (o.gone.length > 30) o.gone.shift();
    return out;
  }
  function renew(corp, post, yes) {
    const o = office(corp), st = o.posts[post];
    if (!st || !st.asking) return false;
    if (yes) { st.wage = st.asking; st.term = st.origin === 'specialist' ? CONST.SPEC_TERM : CONST.VET_TERM; delete st.asking; }
    else { o.posts[post] = null; o.gone.push({ name: st.name, post, why: 'let go' }); }
    return true;
  }
  /** is this staffer worth what they now ask, to an engine that has to pay it */
  function worthKeeping(st, post) { return st.asking <= wageFor(st.craft[post], st.origin) * 1.35; }

  /* ------------------------------------------------------------------------- poaching */
  /** would they come? their loyalty to where they are, against your standing with that house and the raise */
  function willing(st, regardOfYou) {
    const pull = (60 - (st.loyalty == null ? 50 : st.loyalty)) + ((regardOfYou == null ? 50 : regardOfYou) - 50) * 0.5 + 15;
    return pull > 0;
  }

  return { CONST, POSTS, POST_NAME, SCHOOLS, SERGEANT_TALK, SERGEANT_TALK_NAME, veteranCraft, bestStats, schoolFor, wageFor,
           fromFighter, specialistPool, estimate, feeOf, office, holder, eff, allStaff, drillFor, shelfDiscount, kitBoost,
           spin, courtMult, surgeonFor, operateOdds, sergeantTalk, yearTurns, renew, worthKeeping, willing };
});
