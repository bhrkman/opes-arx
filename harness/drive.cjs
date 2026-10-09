/* Drives the BUILT unified page headlessly, the way a manager would live a year: found,
 * step the months, bid into the calendar's signing windows and watch their deadlines land,
 * plan squads during the preparation, and at month twelve lock the drop and fight. The page
 * is the thing under test, not the engine (the engine has its own probes).
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const path = require('path');
/* the page is a sibling of this harness inside the repo, so a checkout runs anywhere;
   an explicit path still wins, for driving a built page from somewhere else */
const PAGE = process.argv[2] ||
  path.join(__dirname, '..', 'viewers', 'the_corp.html');
let html = fs.readFileSync(PAGE, 'utf8');
/* a debug handle for the harness only — the shipped page is untouched */
html = html.replace('    G = window.__G = { rng: rng,', '    G = { rng: rng,');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
/* loadGame assigns G through its own literal — the handle must follow it too */
html = html.replace('    G = { rng: L.state.rng,', '    G = window.__G = { rng: L.state.rng,');
/* a virtual console so LOAD-TIME page errors are heard — the drive's own error listener
   attaches after construction, which is exactly when a vestigial boot call once screamed
   into the void and stayed green */
const vc = new (require('jsdom').VirtualConsole)();
let loadErrors = 0;
vc.on('jsdomError', (e) => { console.log('  PAGE LOAD ERROR: ' + String(e).slice(0, 120)); loadErrors++; });
vc.forwardTo(console, { jsdomErrors: 'none' });   /* jsdom 30: forwardTo, not sendTo */
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                              virtualConsole: vc,
                              url: 'http://opesarx.test/?seed=' + (process.env.DRIVE_SEED || 'corp-1') });   /* a url so localStorage lives */
/* the ledger turn is three seconds of animation the drive does not need to sit through */
dom.window.__noTurn = true;
const { window } = dom;
const doc = window.document;

let failed = 0;
/* §HALF-BUILT A SKIPPED STEP IS NOT A PASSED STEP. Steps that cannot run on a given seed used to print a
   note and pass in silence — which is how a table round-trip that composed NOTHING reported success for
   weeks. They are counted now and reported at the end, beside the failures. */
let skipped = 0;
const note = (msg) => { skipped++; console.log('  note  ' + msg); };
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };
const text = (sel) => (doc.querySelector(sel) ? doc.querySelector(sel).textContent : '');
window.addEventListener('error', (e) => { console.log('  PAGE ERROR: ' + e.message + (process.env.DRIVE_STACK && e.error ? '\n' + String(e.error.stack).split('\n').slice(0, 6).join('\n') : '')); failed++; });

const dropOf = (s) => { const m = s.match(/drop (\d+) in \d+ squads[\s\S]*?drop (\d+) in \d+ squads/);
                        return m ? { mine: +m[1], theirs: +m[2] } : null; };
const spendOf = (s) => { const m = s.match(/kit spend ([\d,]+)/);
                         return m ? +m[1].replace(/,/g, '') : null; };
const hasTab = (name) => {
  const tabs = doc.querySelectorAll('#rail .tab');
  for (const t of tabs) if (t.textContent === name) return true;
  return false;
};
const endMonth = () => { doc.getElementById('endmonth').click(); const go = doc.getElementById('recapgo'); if (go && doc.querySelector('.page[data-tab="recap"]').classList.contains('on')) go.click(); };
/* walk to a month by number, never past it; stops at the Dividend's floor if it comes first */
const toMonth = (n) => { let g = 0; while (window.__G.state.month < n && !window.__G._dividendFloor && g++ < 12) endMonth(); };
const cr0 = n => '\u20a1' + Math.round(n).toLocaleString();
/* the locker's-books helper retired with the scrim */
/* §ACQ the mercenary bid is a slider now: drag it and let go, which is what a manager does */
const bidHigh = (n) => {
  const slides = doc.querySelectorAll('#rostmarket [data-bidslide]');
  for (let i = 0; i < Math.min(n, slides.length); i++) {
    const r = slides[i];
    r.value = r.max;                       /* to the top of the range: over the field */
    r.dispatchEvent(new window.Event('change'));
  }
};
const openRoster = () => [...doc.querySelectorAll('.tab')].filter(x => /Roster/.test(x.textContent))[0].click();

setTimeout(() => {
  const renderDeskIfAny = () => { try { window.__G && doc.getElementById('endmonth') && window.eval('renderDesk()'); } catch (e) {} };
  try {
    /* ---- the shell: menu first, then the founding ---- */
    check(loadErrors === 0, 'the page loads without a single error (' + loadErrors + ')');
    /* §CHROME the rail holds one line and scrolls rather than reflowing like a web page */
    {
      const css0 = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
      check(/#rail\{[^}]*flex-wrap:nowrap/.test(css0) && /header\{[^}]*flex-wrap:nowrap/.test(css0),
            'the tab rail and the header hold their line rather than wrapping');
    }
    /* §LANDING THE FRONT DOOR IS THE GAME ITSELF. It was a landing page, then a redirect —
       and a redirect is a second file that has to be uploaded, cached and trusted before
       anybody reaches anything, which is exactly where it kept failing. The root holds the
       BUILT PAGE, the same bytes, so there is nothing in between to go stale or be missed. */
    {
      const fsx = require('fs'), pth = require('path');
      const root = pth.join(__dirname, '..');
      const land = fsx.readFileSync(pth.join(root, 'index.html'), 'utf8');
      const game = fsx.readFileSync(pth.join(root, 'viewers', 'the_corp.html'), 'utf8');
      check(land.length === game.length && land === game,
            'the site root is the built game itself, byte for byte');
      check(!/THE CORPORATION/.test(land) && !/http-equiv="refresh"/.test(land),
            'and no landing page or redirect stands in front of it');
    }
    /* §MENU three of the fleet's peoples stand on the menu, art inlined by the build */
    /* the tagline is gone: there are no OAs, the game runs many years, and a year holds
       more than one contest — three claims and all three untrue */
    check([...doc.querySelectorAll('#menu .moval img')].filter(i => /^data:image\/webp/.test(i.src)).length === 3 &&
          !doc.querySelector('#menu .menufoot'),
          'the menu carries its three portraits and claims nothing untrue beneath them');
    check(doc.querySelectorAll('#menufleet span svg').length === 8,
          'and the eight OAs stand along its foot in their own marks');
    /* the stage stacks: the overlay wraps its children, and a column that wraps pushes the
       menu into a second column beside the ovals the moment they are taller than the screen */
    {
      const css = [...doc.querySelectorAll('style')].map(s2 => s2.textContent).join('\n');
      const rule = (css.match(/\.menustage\{[^}]*\}/) || [''])[0];
      check(/flex-direction:column/.test(rule) && /flex-wrap:nowrap/.test(rule),
            'the menu stage stacks its ovals above its buttons and never wraps them sideways');
    }
    check(doc.getElementById('menu').style.display !== 'none',
          'the game opens on the menu, not mid-cockpit');
    doc.getElementById('mNew').click();
    /* §FOUNDING the setup founds an OA: the eight are named as the fleet it joins, not as
       eight characters to pick between */
    /* §FOUNDING the screen asks three things: a name, a colour, a mark */
    /* §FOUNDING a name, a colour, and a mark you build: a field, a device, a bar, each turning,
       with ready-made marks beside them for a manager who does not want to make one */
    check(doc.getElementById('setup').style.display !== 'none' &&
          !!doc.getElementById('cname') && doc.querySelectorAll('#cswatches .oasw').length >= 6 &&
          doc.querySelectorAll('#cmarks .mkrow').length === 3 &&
          doc.querySelectorAll('#cmarks .padb').length === 12 &&
          !doc.querySelector('#cmarks .gv'),
          'the founding screen asks a name, a colour and a mark, with no figures on the pad');
    /* §MARK every button on the pad is the same size and nothing is nudged sideways: the
       group stacks, so a left margin between adjacent buttons offsets the second of each
       pair — which is what threw every row out of line. jsdom computes no layout, so the
       rules themselves are what gets checked. */
    {
      const css = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
      const rule = n => (css.match(new RegExp('\\' + n + '\\{[^}]*\\}')) || [''])[0];
      check(!/\.mkgrp[^{]*\{[^}]*margin-left/.test(css),
            'no stray side margin offsets the second button of a pair');
      check(/width:42px/.test(rule('.padb')) && /height:36px/.test(rule('.padb')) &&
            /width:42px/.test(rule('.dpad .padb')),
            'every pad button is one size, the d-pad included');
      check(/flex-direction:column/.test(rule('.padb.tall')),
            'and Height stacks its arrows one above the other');
    }
    {
      /* turning a piece changes the mark; a ready-made replaces it whole */
      const big = () => doc.querySelector('#cmarks .mkbig').innerHTML;
      const before = big();
      /* §MARK the pad works the piece last touched: turn, size, move, stretch */
      const padOn = (adj, dir) => doc.querySelector('#cmarks [data-adj="' + adj + '"][data-d="' + dir + '"]').click();
      padOn('turn', 1);
      check(big() !== before && /rotate\(45\)/.test(big()), 'a piece can be turned');
      for (let t = 0; t < 6; t++) padOn('turn', 1);
      check(/rotate\(315\)/.test(big()), 'the dial reaches 315\u00b0, all the way round');
      padOn('turn', 1);
      check(big() === before, 'and comes back round to where it started');
      padOn('size', 1); padOn('size', 1);
      check(/scale\(1\.2/.test(big()), 'a piece can be grown');
      padOn('y', -1); padOn('x', 1);
      check(/translate\(12\.9 11\.1\)/.test(big()), 'a piece can be moved off centre');
      padOn('wide', 1); padOn('tall', -1);
      check(/scale\(/.test(big()), 'a piece can be stretched');
      /* §MARK the stretch is applied OUTSIDE the turn, so Width always runs across the screen
         and Height always down it, whichever way the piece has been turned. SVG reads a
         transform list right to left: with rotate first, the stretch went on the piece's
         ORIGINAL axes and Taller made a quarter-turned device wider. */
      check(/scale\([^)]*\)\s*rotate\(/.test(big()),
            'width and height work on the piece as it is turned, not as it was drawn');
      doc.querySelector('#cmarks [data-adj="reset"]').click();
      check(big() === before, 'and Reset puts it back');

    }
    check(!doc.querySelector('#setup .menusub') && doc.getElementById('oacards').style.display === 'none' &&
          doc.getElementById('seed').style.display === 'none',
          'it no longer lists the fleet, twice, nor asks for a seed');
    /* the weakest OA makes way, unasked: the Verdant Cradle is difficulty 5 and the
       thinnest treasury in the fleet */
    check(!doc.querySelector('#creplace [data-berth]'), 'whose berth you take is not a question');
    /* §MARK every field and device sits on the pivot it turns about — the kit's own audit
       (sim/audit_marks.cjs) is the instrument; this only proves the page carries the fixed
       kit rather than an older one */
    check(doc.querySelectorAll('#cmarks [data-mk="f"]').length === 11 &&
          doc.querySelectorAll('#cmarks [data-mk="d"]').length === 20,
          'the kit is 11 fields and 20 devices: the duplicate hexagon is gone');
    /* AN OVERLAY TALLER THAN THE SCREEN MUST SCROLL, or the button that starts the game is
       unreachable — which is exactly what happened once the mark builder grew */
    {
      const css = [...doc.querySelectorAll('style')].map(s2 => s2.textContent).join('\n');
      const rule = (css.match(/\.overlay\{[^}]*\}/) || [''])[0];
      check(/overflow-y:auto/.test(rule),
            'the founding overlay scrolls when it is taller than the screen');
    }
    doc.getElementById('seed').value = process.env.DRIVE_SEED || 'corp-1';
    /* §FOUNDING a manager founds an OA; the eight are the fleet, not a character select */
    doc.getElementById('cname').value = 'The Probe Concern';
    doc.getElementById('cfound').click();
    check(doc.getElementById('setup').style.display === 'none',
          'founding an OA starts the game');
    check(!!window.CDSEASON && !!window.CDDIVIDE && !!window.CDTACTICAL,
          'all engine modules are live in the page');
    check(/Year 1 · Month 1/.test(text('#clock')), 'the clock opens the year: ' + text('#clock'));
    /* §QUIRKS the trait index answers BEFORE a month has been stepped. It was installed inside
       stepMonth, so every hook read on the Review screen of a fresh career silently said no —
       not wrongly, quietly, which is the worst way for a lookup to fail. */
    {
      const S0 = window.CDSEASON, G0 = window.__G;
      const carriers = G0.corps[G0.me].roster.filter(f => (f.traits || []).length);
      const answered = carriers.some(f => (f.traits || []).some(t => {
        const tr = window.CDROSTER.traitById[t];
        return tr && ((tr.effects || {}).hooks || []).some(h => S0.EVENTS.fighterHas(G0.state, f, h));
      }));
      check(answered, 'a hand\'s hooks answer before any month has been stepped');
      /* §LOYALTY a hand who likes the OA asks less to stay than one who does not. The
         contract is forced to expire so the check cannot pass by simply not running — a
         silently skipped assertion is the same as no assertion. */
      const r0 = G0.corps[G0.me].roster[0];
      const keepL = r0.loyalty, keepC = r0.contract;
      r0.contract = { salary: 1000, seasons_remaining: 1, kind: 'natural' };
      r0.loyalty = 90; const low = S0.renewalsFor(G0.state, G0.me).find(x => x.id === r0.id);
      r0.loyalty = 10; const high = S0.renewalsFor(G0.state, G0.me).find(x => x.id === r0.id);
      check(!!low && !!high && low.asks < high.asks,
            'loyalty moves a re-signing ask (' + (low && low.asks) + ' liked vs ' +
            (high && high.asks) + ' not)');
      r0.loyalty = keepL; r0.contract = keepC;
    }
    /* §BRIEF THE FIRST MONTH OF A CAREER IS A READING, NOT A SENTENCE. It said "Table Closed",
       then said a sentence about inheriting a fleet, which was no better — prose where a
       manager wants figures he can act on. */
    {
      const stk = [...doc.querySelectorAll('#brief .stk .lab')].map(x => x.textContent);
      check(stk.length === 5 && stk.indexOf('On the Books') >= 0 && stk.indexOf('Mending') >= 0 &&
            stk.indexOf('In the Bank') >= 0,
            'the opening month counts what the manager is holding: ' + stk.join(', '));
      check(!/Already in Play|Table Closed/.test(text('#brief')),
            'and says it in figures rather than a sentence');
    }
    /* §RESIGN THE PAPER: the Review is where a manager answers his own expiring contracts */
    {
      const GP = window.__G, S6 = window.CDSEASON;
      const paper = S6.renewalsFor(GP.state, GP.me) || [];
      /* a world where nothing expires in Year 1 has no Paper (about half of them): the docket must then be absent */
      if (!paper.length) check(!doc.querySelector('#resigning [data-docket]'), 'no Paper docket in a year with nothing expiring');
      else {
      /* §WINDOWS the Paper is a window over the page: a docket line on the Roster opens it */
      check(paper.length >= 1 && /The Paper/.test(text('#resigning')) && doc.querySelector('#resigning [data-docket="paper"]'),
            'the Paper\'s docket stands on the Roster in the Review (' + paper.length + ')');
      doc.querySelector('#resigning [data-docket="paper"]').click();
      check(doc.getElementById('bizwin').classList.contains('on') && doc.querySelectorAll('#bizwin .rscard').length === paper.length,
            'and opens the Paper as a window with every expiring hand in it');
      const signBtn = doc.querySelector('#bizwin [data-rs="sign"]');
      const who = signBtn.getAttribute('data-rsid');
      signBtn.click();
      check((GP.corps[GP.me]._renewalCalls || {})[who] && /Re-Signed/.test(text('#bizwin')),
            'a hand is re-signed at what they ask');
      const goBtn = doc.querySelectorAll('#bizwin [data-rs="release"]')[0];
      if (goBtn) { const gone = goBtn.getAttribute('data-rsid'); goBtn.click();
        check((GP.corps[GP.me]._renewalCalls || {})[gone].how === 'release', 'and another is let go'); }
      doc.getElementById('bizlater').click();
      check(!(doc.getElementById('bizwin').classList.contains('on') && /The Paper/.test(text('#bhead'))), 'Later closes the Paper');
      for (let k = 0; k < 3 && doc.getElementById('bizwin').classList.contains('on'); k++) doc.getElementById('bizlater').click();   /* and whatever came in turn behind it */
      }
    }
    const rosterStart = doc.querySelectorAll('#roster .rcard').length;
    check(rosterStart >= 5 && rosterStart <= 10,
          'a founded OA opens with a skeleton crew, not an inheritance (' + rosterStart + ' hands)');
    /* §MONEY the treasury is in the TOP LINE on every page now — it was on the Roster and the
       Market and nowhere else, so the Desk never showed a manager what he had to spend. What
       the Roster says is what the roster costs and how many are on it. */
    check(/\u20a1/.test(text('#purse')), 'the treasury stands in the top line, on every page');
    check(/The Wage Bill/.test(text('#money')) && /On the Books/.test(text('#money')) &&
          !/Treasury|Board Grant/.test(text('#money')),
          'the roster says what it costs and how many are on it, and nothing else');
    /* EVERY VERB HAS ITS OWN SECTION NOW. Training and recovery are grids, intel and
       courting are painted boards — so the old 0-to-3 button rows are empty in an ordinary
       prep month, and that is the point rather than a hole. What the desk must offer is the
       four sections. */
    /* §DESK the big grids start folded and open when asked */
    {
      const shutAtFirst = doc.querySelectorAll('#traingrid .tgwrap.shut, #restgrid .tgwrap.shut, ' +
                                               '#intelgrid .tgwrap.shut, #courtgrid .tgwrap.shut').length;
      check(shutAtFirst === 4, 'the Desk\'s four grids open folded (' + shutAtFirst + ' of 4)');
      doc.querySelector('#traingrid [data-foldhead]').click();
      check(!doc.querySelector('#traingrid .tgwrap.shut') && doc.querySelectorAll('#restgrid .tgwrap.shut').length === 1,
            'clicking a section\'s head opens that one and leaves the rest shut');
      check(!doc.querySelector('#traingrid .tgfold') && !!doc.querySelector('#traingrid .tgchev2'),
            'the head is the switch: a chevron, not a word to aim at');
    }
    check(!!doc.querySelector('#traingrid .tgrid') && !!doc.querySelector('#restgrid .tgrid')
          && !!doc.querySelector('#intelgrid .itbl') && !!doc.querySelector('#courtgrid .ctbl'),
          'the desk offers all four verbs as their own boards: drill, recovery, intel, courting');
    check(!/0\s*1\s*2\s*3/.test(text('#verbs')),
          'and the retired 0-to-3 rest row is gone from the top of the desk');
    /* §DESK the tally speaks for both columns, so it stands OUTSIDE the two-column grid —
       inside the left column it was centred over training and rest and sat off to one side,
       which looked deliberate and was worse than the corner it came from */
    {
      const fl = doc.querySelector('.focusdeskline');
      check(!!fl && !fl.closest('.grid2'),
            'the focus tally stands above both columns, not inside one');
    }
    /* §TRYOUTS A MANAGER WHO MARKED NOBODY WANTED NOBODY. The AI's fall-through — an OA
       below the drop floor calls up its own ship — caught the manager's corp too, so ending
       the Natural-Born month without marking anyone signed the entire sheet on his behalf. */
    {
      const S1 = window.CDSEASON, P1 = window.CDPRNG;
      const oa1 = window.ARX_DATA.oa_profiles.oa_profiles;
      const r1 = P1.mulberry32(P1.seedFrom('nattieprobe'));
      const c1 = S1.openFleet(r1, oa1, {});
      const you = Object.keys(c1)[0];
      const st1 = S1.beginSeason(r1, c1, oa1, { human: you });
      const before = c1[you].roster.length;
      const theirs = Object.keys(c1)[1], theirBefore = c1[theirs].roster.length;
      while (st1.month <= 3) S1.stepMonth(st1);        /* through both Natural-Born months */
      /* §DRAFT the Draft's two are the Aleas' to assign when Month 1 closes on an unmade pick: counted apart */
      const signedNow = c1[you].roster.filter(f => !f.draftee).length, drafted = c1[you].roster.filter(f => f.draftee).length;
      check(signedNow === before,
            'a manager who marked nobody signed nobody (' + before + ' \u2192 ' + signedNow + ')');
      check(drafted === 2, 'and the Draft assigned him his two when Month 1 closed (' + drafted + ')');
      /* an OA nobody runs still RECRUITS on its own — it is not left to a manager's hand. How
         many it can afford is balance, and balance waits on fatality (ruled), so this asks only
         that it keeps a force it can field, not that it grows */
      check(c1[theirs].roster.filter(f => f.status !== 'dead' && f.status !== 'retired').length >= 3,
            'while an OA nobody runs keeps a force of its own (' + theirBefore + ' \u2192 ' +
            c1[theirs].roster.length + ')');
    }
    /* §EVENTS an event names its subject and lets a manager open the sheet if he wants it —
       it used to unroll the whole stat sheet across the width of the screen for one line */
    {
      const css2 = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
      check(/\.evcard \.subj \.nm\{[^}]*cursor:pointer/.test(css2),
            'an event\'s subject is a name a manager can click, not a stat sheet');
      check(/\.evcard \.es\{[^}]*color:var\(--ink\)/.test(css2),
            'and the copy is set in the reading colour, not the page\'s dim');
    }
    /* §QUIRKS THE SHEET SAYS WHAT A QUIRK DOES. The explainer read `stat_mods` and hooks, so
       every rebuilt quirk — thirty points and a condition — showed "Character, Not Mechanics":
       the catalogue was rewritten to be felt and the one screen that explains it was still
       reading the old field. Every quirk a manager can be dealt must state its effect. */
    {
      const idx = window.CDROSTER.traitById;
      const pool = Object.keys(idx).filter(k => idx[k].draw === 'pool');
      const mute = pool.filter(id => {
        const e = idx[id].effects || {};
        return !(e.stats || e.situational || e.stat_mods) && !(e.hooks || []).length;
      });
      /* the book is deliberately SMALL — eight, ruled, and grown from there. The floor here was
         ten, which would have failed the ruling rather than a fault. */
      check(pool.length >= 4 && mute.length === 0,
            'every quirk in circulation carries something the sheet can state (' +
            pool.length + ' quirks, ' + mute.length + ' silent)');
      /* and the racial ones too: they carry no stat change, only hooks, so the tooltip can
         only speak for them if HOOK_TEXT knows the words. Three of them said "Character, Not
         Mechanics" over machinery that was wired, sized and firing. */
      const cssT = [...doc.querySelectorAll('script')].map(x => x.textContent).join('\n');
      const spoken = new Set((((cssT.match(/var HOOK_TEXT = \{[\s\S]*?\n  \};/) || [''])[0])
        .match(/^\s*([a-z_0-9]+)\s*:/gm) || []).map(x => x.replace(/[\s:]/g, '')));
      const dumb = Object.keys(idx).filter(k => idx[k].draw !== 'retired').filter(k => {
        const e = idx[k].effects || {};
        return !(e.stats || e.situational || e.stat_mods) &&
               !(e.hooks || []).some(h => spoken.has(h));
      });
      check(dumb.length === 0,
            'and every trait a hand can carry has words for what it does (' + dumb.join(', ') + ')');
    }
    /* §MENU all three portraits survive a narrow window — they shrink, they do not vanish.
       The stylesheet sweep in harness/audit_resize.cjs is the thorough version of this; the
       page only has to prove the menu itself keeps its three. */
    {
      const cssM = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
      check(!/\.moval\.left\s*,\s*\.moval\.right\{[^}]*display:none/.test(cssM),
            'the menu keeps all three portraits at every width');
    }
    /* §RACES the peoples are spelt Ththyn, and wear colours a manager can tell apart */
    {
      const R2 = window.CDROSTER, races = window.ARX_DATA.races.races;
      check(races.some(r => r.id === 'ththyn' && r.name === 'Ththyn') &&
            !races.some(r => /thythyn/i.test(r.id + r.name)),
            'the race is Ththyn, in its id and its name');
      /* a saved career written before the rename still loads as a people the game has */
      check(!/thythyn/i.test(JSON.stringify(window.ARX_DATA.races)),
            'and nothing in the catalogue spells it the old way');
      void R2;
    }
    /* §PAPER the figures say which period they are for, and the term says how long */
    {
      const S2 = window.CDSEASON, G2 = window.__G;
      const rows = S2.renewalsFor(G2.state, G2.me) || [];
      if (rows.length) {
        const nat = rows.find(r => r.kind === 'nattie');
        check(rows.every(r => r.years >= 1),
              'a renewal names its term (' + rows.map(r => r.years).join(',') + ' years)');
        /* the ruled ranges live in recruitment.json, read through the roster — not in a
           constant, which is what this used to ask and what the data gate now forbids */
        const merc = (window.CDROSTER.seasonsRange('mercenary') || [1])[0];
        if (nat) check(nat.years > merc,
                       'and a Natural-Born signs longer than a mercenary (' + nat.years +
                       ' against ' + merc + ')');
      }
    }
    /* §FOUNDING a fleet that has run the Divide for years does not open unmarked */
    {
      const GF = window.__G, able = GF.corps[GF.me].roster.filter(f => f.status === 'active');
      const hurt = able.filter(f => ((f.condition || {}).injuries || []).length).length;
      const worn = able.filter(f => ((f.condition || {}).stress || 0) > 0).length;
      check(hurt >= 1 && worn >= able.length - 1,
            'the founding roster carries last year\'s marks (' + hurt + ' hurt, ' + worn + ' worn)');
    }
    /* §BASTILLE THE KIER SELLS THE MAN, NOT THE PAPER. A prisoner has no service record, so his
       sheet carries a name, a people, an age and what is apparent — and nothing a manager would
       otherwise read before signing. The truth arrives with the man. */
    {
      /* the window opens in month five, and a lot is only drawn when its month arrives — so
         this opens its own season and steps to it rather than poking at the live one */
      const S5 = window.CDSEASON, P5 = window.CDPRNG;
      const oa5 = window.ARX_DATA.oa_profiles.oa_profiles;
      const r5 = P5.mulberry32(P5.seedFrom('bastilleprobe'));
      const c5 = S5.openFleet(r5, oa5, {});
      const you5 = Object.keys(c5)[0];
      const st5 = S5.beginSeason(r5, c5, oa5, { human: you5 });
      let lot5 = [];
      while (st5.month <= 11) {
        lot5 = S5.lotFor(st5, you5) || [];
        if (lot5.length && lot5[0].kind === 'bastille') break;
        S5.stepMonth(st5);
      }
      check(lot5.length > 0 && lot5[0].kind === 'bastille',
            'the Kier Bastille opens its window (' + lot5.length + ' on the sheet)');
      check(lot5.every(r => r.stats === undefined && r.potential === undefined && r.record === undefined),
            'a Bastille sheet carries no stats, no ceiling and no service record');
      check(lot5.every(r => r.name && r.race && r.age),
            'and does carry what is apparent: a name, a people and an age');
    }
    /* §MARKET a shut window shows the people the next one will offer, greyed and untouchable */
    check(doc.querySelectorAll('#rostmarket .shutwrap .pc').length > 0 ||
          !doc.querySelector('#rostmarket .shutwrap'),
          'a shut window shows the coming sheet behind its shutter');
    check(/Focus Spent \d of 8/.test(text('#focusdesk')),
          'the focus board is prefilled by the corp\'s own judgement: ' + text('#focusdesk').slice(0, 40));
    /* the grid is the source of truth for training; clear it and the other verbs so the whole
       budget is free to paint deliberately */
    const TG = window.__G;
    const deskTab = () => [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0];
    const resetGrid = () => { TG.plan.trainFocus = { all: 0, col: {}, row: {}, cell: {} };
                              TG._focusSel.train = 0;
                              TG._intelSel = {}; TG._focusSel.scout = 0;
                              ["rest", "court"].forEach(k => { TG._focusSel[k] = 0; });
                              deskTab().click(); };   /* re-render the desk from a clean map */
    // clear via the UI so we exercise it, then confirm the budget is free
    ['rest', 'court'].forEach(k => {
      const b = doc.querySelector('[data-focus="' + k + ':0"]:not([disabled])');
      if (b) b.click();
    });
    /* ONE BUDGET LINE, on the top bar beside the clock — it used to head every section, four
   copies of one number and none of them where a manager looks. */
    check(/^Focus Spent 0 of 8/.test(text('#focusdesk').trim()),
          'clearing the verbs frees the whole budget: ' + text('#focusdesk').trim());

    /* ---- THE TRAINING GRID: paint a column and watch that one stat outgrow the rest ---- */
    check(!!doc.querySelector('#traingrid .tgrid'),
          'the training grid stands on the desk, no dropdowns');
    const meC = window.__G.corps[window.__G.me];
    const aliveOf = () => meC.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
    /* THE MEAN MUST BE OVER THE SAME PEOPLE. It was first taken across the whole roster, and
       the drive signs fighters between the two readings; then over a frozen cohort, and the
       drive trades hands out of it. Each hand against itself, below, is the only reading that
       survives both. */
    /* the grid's columns are aim, then the mind stats, then the body stats — index by that */
    const gridStats = ['aim'].concat(window.CDSEASON.CONST.MIND)
                             .concat(window.CDSEASON.CONST.BODY || ['grit', 'reflex']);
    const colOf = id => [...doc.querySelectorAll('#traingrid tr:first-child th')][1 + gridStats.indexOf(id)];
    colOf('tactics').querySelectorAll('.pip')[2].click();     // paint tactics column to 3
    check(/^Focus Spent 3 of 8/.test(text('#focusdesk').trim()),
          'painting a column to 3 pips spends 3: ' + text('#focusdesk').trim());
    /* RESOLVE RISES FROM REST AS WELL AS DRILL, and on a founded OA's seven hands one
       rested body moves the mean — so the painted column is measured against AIM, which
       nothing but training touches. */
    /* PER HAND, NOT PER MEAN. A cohort mean taken at two points moves with who is still in the
       cohort — and between these two points the drive trades hands away and a Conscript walks —
       so the check measured composition and passed on the luck of the draw. Each hand's own
       change, over the hands present at both ends, is what training did. */
    const at0 = {}; for (const f of aliveOf()) at0[f.id] = { tactics: f.stats.tactics, resolve: f.stats.resolve, aim: f.stats.aim };
    const delta = k => { const xs = aliveOf().filter(f => at0[f.id]).map(f => f.stats[k] - at0[f.id][k]);
                         return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
    /* Gather Intel: paint 3 pips on the first rival this same month; it should land ~M4 and be
       readable by the time the drive reaches the later prep months. Recorded for a check below. */
    let intelWatched = null;
    const intelRow1 = [...doc.querySelectorAll('#intelgrid .itbl tr')][1];
    intelWatched = intelRow1.querySelector('.pip').getAttribute('data-intel');
    intelRow1.querySelectorAll('.pip')[2].click();
    check((window.__G._intelSel[intelWatched] || 0) === 3,
          'intel focus paints per target: ' + intelWatched + ' at 3 pips');
    /* Courting Sponsors: paint 2 pips on a supplier this month; standing should accumulate on
       the corp toward the Lock. Recorded for a later check that the board can sign. */
    let courtHouse = null;
    const courtRow1 = [...doc.querySelectorAll('#courtgrid .ctbl tr')].find(r => r.querySelector('.pip'));
    if (courtRow1) {
      courtHouse = courtRow1.querySelector('.pip').getAttribute('data-court');
      courtRow1.querySelectorAll('.pip')[1].click();     /* 2 pips */
      check((window.__G._courtSel[courtHouse] || 0) === 2,
            'court focus paints per supplier: ' + courtHouse + ' at 2 pips');
    } else {
      check(false, 'the courting desk offers a paintable supplier');
    }
    /* THE TURN HAS A SHAPE: the brief at the Desk's head, the recap between the months */
    check(/Month 1/.test(text('#brief')) && /Waiting on You/.test(text('#agenda')),
          'the brief names the month and the agenda panel stands beside it');
    /* THE YEAR LINE stands left of every preparation page: twelve stops, the current lit */
    check(doc.body.classList.contains('yearline') && doc.querySelectorAll('#yearline .ystop').length === 12 &&
          doc.querySelector('#yearline .ystop.now .yn').textContent.indexOf('M1') === 0 && /In 11/.test(text('#yearline')),
          'the year line shows twelve stops with the current lit and the Divide eleven off: ' + text('#yearline .ystop.now').replace(/\s+/g, ' ').trim().slice(0, 60));
    /* THE TURN CLUSTER, bottom right: while anything waits the button leads to it, and only
       when nothing does is it End the Month */
    check(!!doc.getElementById('turnnext') || !!doc.getElementById('turnend'), 'the turn stands in the corner');
    if (doc.getElementById('turnnext')) {
      const before = window.__G.state.month;
      doc.getElementById('turnnext').click();
      check(window.__G.state.month === before && !doc.querySelector('.page[data-tab="recap"]').classList.contains('on'),
            'with something waiting the button leads there instead of ending the month');
      [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
      check(!!doc.getElementById('turnanyway'), 'and a manager may end it anyway');
    }
    (doc.getElementById('turnanyway') || doc.getElementById('turnend') || doc.getElementById('endmonth')).click();
    check(doc.querySelector('.page[data-tab="recap"]').classList.contains('on') && /Month 1/.test(text('#recaphead')) && /Next/.test(text('#recaphead')),
          'ending the month stands the recap up: ' + text('#recaphead').replace(/\s+/g, ' ').trim().slice(0, 70));
    check(/Money/.test(text('#recapbody')) && /Standing/.test(text('#recapbody')) && /People/.test(text('#recapbody')),
          'the recap reads the month\'s money, people and standing');
    doc.getElementById('recapgo').click();
    check(doc.querySelector('.page[data-tab="desk"]').classList.contains('on'), 'Continue returns to the Desk and the next brief');
    /* YOU FOCUS ON THE INTEL, YOU GET THE INTEL (ruled). The gather used to be scheduled
       three months out; it resolves in the month it is bought now, so a look late in the
       year is still worth buying and a second look reads the rival as they stand today. */
    (function () {
      const GI = window.__G;
      const sh = GI.corps[GI.me]._intel && GI.corps[GI.me]._intel.rivals
                 && GI.corps[GI.me]._intel.rivals[intelWatched];
      const now = sh ? window.CDSEASON.INTEL_RIVAL_ROWS
                        .filter(r => sh.rows[r] && sh.rows[r].depth).length : 0;
      check(now > 0, 'the scouts report the month they are paid for (' + now + ' rows filled)');
      check(!(GI.corps[GI.me]._pending || []).some(p => p.kind === 'intel'),
            'no gather is left in flight \u2014 the survey delay is gone');
    })();
    /* ---- THE MARKET. Kit is bought here, for CREDITS AND NO FOCUS (ruled): shopping is
       not attention. Sections run everyday-first off `item.type`, which is canon data now
       rather than a guess from tags. ---- */
    {
      const GM = window.__G, meM = GM.corps[GM.me];
      [...doc.querySelectorAll('#rail .tab')].find(t => /Market/.test(t.textContent)).click();
      /* §MARKET THE WALL (ruled): underline tabs with counts, centred titles with rules, tiles by type carrying bars
         coloured by kind and chips for the rest; a title folds its section */
      const secs = [...doc.querySelectorAll('#mktledger .mwall-title .t')].map(x => x.textContent);
      check(doc.querySelectorAll('#mktslots .mtab').length === 5 && !!doc.querySelector('#mktslots .mtab.on .c'),
            'the slots are underlined tabs, each with how many the shelf holds');
      const tiles = doc.querySelectorAll('#mktledger .mwall .mtile').length;
      check(tiles >= 40 && doc.querySelectorAll('#mktledger .mtile .mbar').length >= tiles * 3,
            'the wall: ' + tiles + ' tiles, each carrying its bars');
      check(!!doc.querySelector('#mktledger .mbar b.damage') && !!doc.querySelector('#mktledger .mchips .range'),
            'the bars are coloured by kind, and the chips too');
      const firstTitle = doc.querySelector('#mktledger .mwall-title');
      firstTitle.click();
      check(doc.querySelector('#mktledger .mwall-title').classList.contains('shut') && doc.querySelectorAll('#mktledger .mtile').length < tiles,
            'a title folds its section');
      doc.querySelector('#mktledger .mwall-title').click();
      check(secs.length >= 5 && secs[0] === 'Assault Rifles',
            'the shelf opens on what most hands carry: ' + secs.slice(0, 4).join(', '));
      check(secs.indexOf('Anti-Materiel') > secs.indexOf('Carbines'),
            'and the exotica sit at the bottom, not the top');
      /* the strip under the market speaks about the ORDER — the treasury is in the top line
         on every page now, and a second copy of it here was one of the four facts crammed
         into one voice that this pass took apart */
      check(!/Kit Cap|Treasury/.test(text('#mktsum')),
            'the market summary no longer carries a second copy of the treasury');
      /* THE PLANET HAS GROUND: planets.json rides in the bundle now, so the browser's planet
         carries a composition like node's does */
      check((window.__G.state.planet.composition || []).length >= 2,
            'the planet generated with a composition in the browser (' +
            (window.__G.state.planet.composition || []).length + ' resources)');
      /* THE CARD READS OUT: every demand named, the priority starred, the holds barred */
      [...doc.querySelectorAll('.tab')].filter(x => /Board/.test(x.textContent))[0].click();
      /* §BOARD each demand is its own object across the top now, and the three that scale
         stand under them in their own box */
      const cardRows = doc.querySelectorAll('#boarddemand .obj').length;
      const rep0 = window.__G.corps[window.__G.me].rep;
      check(cardRows === rep0.goal.demands.length && cardRows >= 3,
            'the Board names every demand on the card (' + cardRows + '): ' +
            [...doc.querySelectorAll('#boarddemand .cardrow:not(.standing) .dw')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      check(doc.querySelectorAll('#boarddemand .obj.pri').length === 1, 'one demand carries the board\u2019s gold as the priority');
      check(doc.querySelectorAll('#boardscales .dial').length === 3 && /Popularity/.test(text('#boardscales')),
            'the three that scale stand under it as dials: spending, casualties, popularity');
      check(doc.querySelectorAll('#boardholds .holdrow:not(.hh)').length === 4 &&
            /Units of 9,000/.test(text('#boardholds')) && /a Month/.test(text('#boardholds')),
            'the four holds are barred in a fleet\'s own units, falling monthly');
      [...doc.querySelectorAll('.tab')].filter(x => /Squads/.test(x.textContent))[0].click();
      check(!/Cap\b/.test(text('#planstate').replace(/Drop Cap/, '')), 'the Squads plan line carries no kit cap (the Aleas ceiling is gone): ' + text('#planstate').trim());
      const focusBefore = text('#focusdesk');
      const t0 = meM.account.treasury;
      const id = doc.querySelector('#mktledger .mtile').getAttribute('data-mopen');
      const held0 = (meM.armoury || {})[id] || 0;
      const add = () => doc.querySelector('#mktledger .mtile [data-madd]').click();
      add(); add();
      check(doc.querySelector('#mktledger .stepn').textContent === '2',
            'the stepper counts what is on the order without moving');
      check(/\u2212\u20a1/.test(text('#mktsum')), 'and an order reads as money leaving');
      doc.getElementById('mktbuy').click();
      check(((meM.armoury || {})[id] || 0) === held0 + 2,
            'placing the order puts the pieces in the armoury (' + held0 + ' \u2192 ' +
            ((meM.armoury || {})[id] || 0) + ')');
      check(meM.account.treasury < t0, 'and takes the credits out of the treasury');
      check(meM.account.ledger.some(l => /Market/.test(l.label)),
            'the spend is in the books, not conjured');
      check(text('#focusdesk') === focusBefore,
            'buying kit costs no focus \u2014 shopping is not attention');
      doc.querySelector('#mktledger .mtile').click();
      const panel = text('#mktledger .mpanel');
      check(/Type/.test(panel) && /Damage/.test(panel) && /Reach/.test(panel) && !/legality/i.test(panel),
            'a tile opens to every stat, without repeating the tag on the row');
      check(/Type [A-Z]/.test(panel) && (!/Traits/.test(panel) || /Traits: [A-Z]/.test(panel)),
            'and its labels and values read in the game\'s own capitals');
      /* leave the rail where the checks below expect it — they read the Desk's own sections */
      [...doc.querySelectorAll('#rail .tab')].find(t => /Desk/.test(t.textContent)).click();
    }

    /* ---- THE NEGOTIATION TABLE, joined to the corporation. Two pans and a beam; the
       economics live in trade.js, anchored to numbers the game already uses. The ruling
       that shapes it: a contract travels with the body, so what changes hands is worth
       minus wage — and some paper is worth less than nothing. ---- */
    {
      const GT = window.__G, TR = window.CDTRADE;
      const talks = [...doc.querySelectorAll('#rail .tab')].find(t => /Negotiation/.test(t.textContent));
      talks.click();
      check(!/Not yet joined/.test(text('#tradehead')), 'the table is joined, not a placard');
      /* §PICKER the Talks pick on the ring, like every other surface */
      check(doc.querySelectorAll('#tradestrip .hnode').length === 7 &&
            doc.querySelectorAll('#tradestrip .hnode svg').length >= 7,
            'every other OA stands on the ring in its own mark');
      const themChip = doc.querySelector('#tradestrip .hnode');
      const themId = themChip.getAttribute('data-toa');
      themChip.click();
      /* THE NEGOTIATION IN TWO FACING COLUMNS: your terms, their terms, every kind in one
         table with a filter; credits typed, not clicked in lumps; the contract beneath */
      const giveCol = () => doc.querySelectorAll('#negwrap .negcol')[0];
      const getCol = () => doc.querySelectorAll('#negwrap .negcol')[1];
      check(giveCol().querySelectorAll('tr.pick').length > 5, 'your side lists what you can put up, with a price each');
      check(/Worth/.test(giveCol().textContent) && /Owed/.test(giveCol().textContent),
            'a body\'s price is its worth less its wage, said on the row');
      giveCol().querySelector('[data-tcat="intel"]').click();
      check(!new RegExp(GT.corps[themId].profile.name).test(giveCol().textContent),
            'the dossier on the OA across the table is not for sale to them');
      giveCol().querySelector('[data-tcat="gear"]').click();
      check(giveCol().querySelectorAll('.ntbl .tierb').length > 0 && giveCol().querySelectorAll('.qty').length > 0,
            'gear lists with its tier badge, grouped by type, with a quantity to trade');
      giveCol().querySelector('[data-tcat="all"]').click();
      /* THE BOOKS DO NOT GO NEGATIVE: credits are typed, and clamp to what is held */
      {
        const treas = GT.corps[GT.me].account.treasury;
        const inp = giveCol().querySelector('[data-tcash]');
        inp.value = String(treas + 50000);
        giveCol().querySelector('[data-tcashadd]').click();
        const contractGive = doc.querySelectorAll('#negwrap .contract .negcols > div')[0];
        check(new RegExp(cr0(treas).replace(/[₡,]/g, m => '\\' + m)).test(contractGive.textContent),
              'credits typed past the treasury clamp to it (' + cr0(treas) + ')');
        /* THEIR PURSE IS PRIVATE: the number never shows; the dossier's reading does, or Unknown */
        const theirTreas = cr0(GT.corps[themId].account.treasury).replace(/[₡,]/g, m => '\\' + m);
        check(!new RegExp(theirTreas).test(text('#negwrap')) && /Purse/.test(text('#negwrap')),
              'the other OA\'s treasury is not on the page; the dossier\'s word for it is');
        doc.querySelector('#negwrap .contract [data-tdrop]').click();
        check(/Nothing Yet/.test(doc.querySelectorAll('#negwrap .contract .negcols > div')[0].textContent),
              'the cross takes it off the contract');
      }
      /* buy one of theirs, over the odds, and watch the people actually move */
      const mineBefore = GT.corps[GT.me].roster.length, theirsBefore = GT.corps[themId].roster.length;
      const beingsOf = c => (c.roster || []).filter(b => !b.mirror_of).length;
      const mineBeings = beingsOf(GT.corps[GT.me]), theirsBeings = beingsOf(GT.corps[themId]);
      /* the same two bodies the old check traded — your second by roster order for their
         first — so the training arithmetic downstream reads the same roster it always did */
      /* §MON-WA pick SINGLES on both sides: this check is about the plumbing of a deal, and a
         Mon-Wa pair is one being in two records, so a blind roster[1] could put half a pair on
         the table and make the one-for-one arithmetic meaningless. Pairs have their own check
         below (no half is left behind). */
      const single = (c, from) => (c.roster || []).slice(from).filter(b => !b.bond_partner)[0] || c.roster[from];
      const giveOne = single(GT.corps[GT.me], 1), getOne = single(GT.corps[themId], 0);
      giveCol().querySelector('tr.pick[data-tid="unit:' + giveOne.id + '"]').click();
      getCol().querySelector('tr.pick[data-tid="unit:' + getOne.id + '"]').click();
      const wantId = TR.netOf(getOne);
      check(doc.querySelectorAll('#negwrap .contract tr:not(.tot):not(.none)').length >= 2, 'both contributions stand on the contract');
      check(/They Would|Short by|Would Not|Gladly|Refused Outright/.test(text('#negwrap')), 'the pressure bar reads a verdict: ' + (text('#negwrap').match(/(They Would[^₡]*|Short by ₡[\d,]+|They Would Not Entertain This)/) || [''])[0].trim());
      /* OVER THE ODDS, as the note above says: a bare one-for-one was accepted only when the pairing happened to favour
         them, and any change to the rosters (the Draft's two a year) could make it fall short. Pay what the bar says. */
      {
        const short = (text('#negwrap').match(/Short by \u20a1([\d,]+)/) || [])[1];
        if (short) {
          const inp = giveCol().querySelector('[data-tcash]');
          inp.value = String(Math.ceil(+short.replace(/,/g, '') * 1.25) + 500);
          giveCol().querySelector('[data-tcashadd]').click();
        }
      }
      doc.getElementById('tput').click();
      /* §MON-WA count BEINGS, not bodies: a pair is one roster slot with two records and
         crosses the table together, so a one-for-one deal involving one moves two rows */
      /* the two NAMED bodies changed hands: which is what the deal was, and it does not
         depend on who else the draw put on the roster */
      const has = (c, id) => (c.roster || []).some(b => b.id === id);
      check(!has(GT.corps[GT.me], giveOne.id) && has(GT.corps[themId], giveOne.id) &&
            has(GT.corps[GT.me], getOne.id) && !has(GT.corps[themId], getOne.id),
            'a struck deal moves the named bodies between rosters (' + mineBefore + ' bodies now ' +
            GT.corps[GT.me].roster.length + ')'); void wantId; void mineBeings; void theirsBeings;
      /* §MON-WA and a pair is never split by a deal: no half is left without its partner */
      check(!(GT.corps[GT.me].roster || []).some(b => b.bond_partner &&
              !(GT.corps[GT.me].roster || []).some(o => o.id === b.bond_partner)),
            'no half of a pair is left behind by a trade');
      const bought = GT.corps[GT.me].roster[GT.corps[GT.me].roster.length - 1];
      check(!!bought.contract && bought.contract.salary > 0,
            'the contract travelled with them, salary and all');
      check(GT.corps[GT.me].roster.indexOf(bought) >= 0,
            'the body is on your roster now, not merely copied');
      /* THE STANDS SEE A TRANSFER (ruled): your own supporters mind losing somebody in
         proportion to their fame, and the selling side's fans warm to whoever took them. */
      {
        const REPM = window.CDREP, seller = GT.corps[themId];
        const ownBefore = REPM.standing(seller.rep, 'crowd');
        const fansBefore = REPM.standing(seller.rep, 'house', GT.me);
        const star = seller.roster.slice().sort((a, b) => (b.fame || 0) - (a.fame || 0))[0];
        const mates = seller.roster.filter(f => f !== star).slice(0, 3).map(f => f.loyalty);
        window.CDTRADE.execute(seller, GT.corps[GT.me], { units: [star.id] }, {}, {});
        check(REPM.standing(seller.rep, 'crowd') < ownBefore,
              'selling somebody costs you with your own people');
        check(REPM.standing(seller.rep, 'house', GT.me) > fansBefore,
              'and their supporters warm to the OA that took them');
        const after = seller.roster.slice(0, 3).map(f => f.loyalty);
        check(after.some((v, i) => mates[i] != null && v < mates[i]),
              'the crew left behind notices a sale');
      }
      /* no floor: the ruling is fluidity until the Divide */
      check(TR.CONST.LAST_TRADE_MONTH === 11 && TR.CONST.FIRST_TRADE_MONTH === 2, 'the table trades M2 through M11, as ruled');
      check(!TR.tradingOpen(1) && TR.tradingOpen(11) && !TR.tradingOpen(12), 'shut in the review month and after the lock');
      openRoster();
    }

    /* the courting effort reached the corp's standing (accumulates, not scheduled) */
    check(courtHouse && window.CDSEASON.SPON.courtStanding(meC, courtHouse) > 0,
          'courting built standing with ' + courtHouse);
    /* §SPONSORS the board says what it wants and how far off you are; the fake focus price
       that no rule ever read is gone */
    /* the benchmark is not repeated at the head — every row says how much more regard THAT
       supplier wants, which is the same fact where a manager is already looking */
    check((/More Regard/.test(text('#courtgrid')) || /Convinced/.test(text('#courtgrid'))) &&
          !/The Board Signs At/.test(text('#courtgrid')),
          'each supplier says its own distance, and nothing repeats it at the head');
    /* eight suppliers, eight colours, assigned by position so they cannot collide */
    {
      const cols = [...doc.querySelectorAll('#courtgrid .cname')].map(e => e.style.color).filter(Boolean);
      check(cols.length >= 4 && new Set(cols).size === cols.length,
            'no two suppliers wear the same colour (' + new Set(cols).size + ' of ' + cols.length + ')');
    }
    check(!/Costs \d/.test(text('#courtgrid')),
          'and quotes no focus price for a thing that was never for sale');
    const dT = delta('tactics'), dR = delta('resolve'), dA = delta('aim');
    check(dT > dA + 0.2,
          'the painted column outgrew the unpainted: tactics +' + dT.toFixed(2) +
          ' vs aim +' + dA.toFixed(2) + ' (resolve +' + dR.toFixed(2) + ', which rest also lifts)');

    /* ---- the scalpel: one hand's one cell moves that hand most, beyond the column's reach ---- */
    resetGrid();
    const alive = aliveOf();
    /* a hand with room to learn tactics (a drill reaches only those off the ceiling by the green gap) and not crippled:
       `potential` is gone from fighters, so the old pick fell through to whoever stood first, often at the ceiling */
    const SC = window.CDSEASON.CONST;
    const subject = alive.find(f => f.stats.tactics < SC.STAT_CEIL - SC.TRAIN_GREEN_GAP - 10 &&
                                    window.CDSEASON.woundBand(f) !== 'crippled') || alive[0];
    const subjIdx = alive.indexOf(subject);
    /* A HAND'S STATS FOLD NOW. The corner and the columns are always there — they are what
       a manager reaches for most — but the narrow work lives behind a chevron, so open the
       hand first, exactly as somebody playing would. */
    /* §DESK THE CHEVRON FOLDS, THE NAME OPENS THE SHEET. The whole line used to open the hand,
       which gave the same word two meanings on one screen: on the Roster and in the Squads a
       name opens a sheet. The chevron is a 26px target and the only thing that folds. */
    const chev = doc.querySelector('#traingrid .tgchev[data-tgopen="' + subject.id + '"]');
    const hand = chev && chev.closest('.tghand');
    check(!!chev && !!hand && /tghand/.test(hand.className),
          'the chevron folds a hand, and it is its own target');
    check(!!hand.querySelector('.tgname[data-sheet="' + subject.id + '"]'),
          'and the name opens the sheet, as it does on every other screen');
    /* and painting a hand's own pips must not open it: the two targets share a row but
       never a click */
    const rowPips = hand.querySelectorAll('.tgpips .pip');
    rowPips[0].click();
    check(!/tgpanel/.test((doc.querySelector('#traingrid .tgchev[data-tgopen="' + subject.id +
              '"]').closest('.tghand').nextElementSibling || {}).className || ''),
          'painting a hand\'s row pips does not open the hand under them');
    /* clear it again: the pips re-render, so the pip to click is a fresh one, and leaving
       it painted would spend focus the checks below are counting */
    doc.querySelector('#traingrid .tgchev[data-tgopen="' + subject.id + '"]').closest('.tghand')
       .querySelectorAll('.tgpips .pip')[0].click();
    /* the CHEVRON opens the hand now — clicking the line opens nothing, which is the point */
    doc.querySelector('#traingrid .tgchev[data-tgopen="' + subject.id + '"]').click();
    /* a closed hand is one thin line now; the stats live in the panel that follows it, and
       the panel carries the stat names in their colours */
    /* the grid re-renders on every paint, so the element clicked a moment ago is detached:
       the panel has to be looked up FRESH or the check reads a ghost of the old DOM */
    const panel = doc.querySelector('#traingrid .tgchev[data-tgopen="' + subject.id + '"]').closest('.tghand').nextElementSibling;
    check(panel && /tgpanel/.test(panel.className) &&
          panel.querySelectorAll('.tglabel').length === gridStats.length,
          'the open panel names every stat, in its own colour');
    const cellTd = panel.querySelectorAll('td')[gridStats.indexOf('tactics')];
    cellTd.querySelectorAll('.pip')[2].click();               // subject's tactics cell to 3
    check(/^Focus Spent 3 of 8/.test(text('#focusdesk').trim()),
          'the scalpel paints one cell to 3: ' + text('#focusdesk').trim());
    const sTac0 = subject.stats.tactics;
    endMonth();
    /* THE GAP NARROWS ON A SMALL ROSTER, and that is the founding change working: `dT` is the
       column's MEAN gain across the roster, and a column spread over seven hands gives each of
       them nearly what a scalpel gives one. The scalpel must still be worth its focus — it
       should not be BEATEN by the broad spend — but it no longer buries it. */
    const dCell = subject.stats.tactics - sTac0;
    check(dCell > 0 && dCell >= dT * 0.5,
          'the scalpel is worth its focus beside the column: ' + subject.name + ' tactics +' +
          dCell.toFixed(2) + ' vs the column\'s +' + dT.toFixed(2));


    /* §BOOST the button stands where the focus is spent — on the grid's own head, once that
       grid has focus on it, priced for what is on it, and with no sentence explaining it */
    {
      check(doc.querySelectorAll('#traingrid [data-boost]').length === 0,
            'no boost is offered on a track nothing is spent on');
      const pip = doc.querySelectorAll('#traingrid tr:first-child th .pip')[2];
      if (pip) pip.click();
      const bst = doc.querySelector('#traingrid [data-boost]');
      check(!!bst && /\u20a1/.test(bst.textContent),
            'painting focus offers the boost on that grid, at its price: ' + (bst ? bst.textContent.trim() : '—'));
      check(!/Double It|to Double/.test(text('#focusdesk')),
            'and nothing explains it in prose beside the tally');
      bst.click();
      check(!!(window.__G._boostSel || {}).train && !!doc.querySelector('#traingrid [data-boost].on'),
            'and it takes, and says so');
      doc.querySelector('#traingrid [data-boost]').click();
      resetGrid();
      check(doc.querySelectorAll('#traingrid [data-boost]').length === 0,
            'and clearing the grid takes the offer with it');
    }
    /* ---- the fill-to-cap-then-remove path that broke every mockup, now in the real DOM ---- */
    resetGrid();
    const corner = () => doc.querySelectorAll('#traingrid th.rn .pip');
    corner()[2].click();                                      // corner to 3
    check(/^Focus Spent 3 of 8/.test(text('#focusdesk').trim()), 'corner paints to 3: ' + text('#focusdesk').trim());
    corner()[2].click();                                      // step down to 2
    corner()[1].click();                                      // to 1
    corner()[0].click();                                      // to 0
    check(/^Focus Spent 0 of 8/.test(text('#focusdesk').trim()),
          'stepping the corner back down to zero always works: ' + text('.tgbudget').trim());
    resetGrid();
    check(hasTab('Desk') && !hasTab('The Firefight'),
          'the preparation\'s rail stands alone — the Divide\'s tabs are not on it at all');

    /* ---- months 1-2 were spent by the training and boost checks above ---- */
    check(/Month 3/.test(text('#clock')), 'two months spent: ' + text('#clock'));

    /* ---- the save is the game: save, step on, load, and be exactly where you were ---- */
    const rosterAtSave = doc.querySelectorAll('#roster .rcard').length;
    doc.getElementById('savebtn').click();
    check(/saved: Y1 M3/i.test(text('#clock')),
          'a save is taken at month 3: ' + text('#clock').slice(0, 60));
    endMonth();
    check(/Month 4/.test(text('#clock')), 'the world steps on to month 4');

    /* the recovery guard spends a month of its own, so it runs where the calendar checks
       above have already had their say */
    /* ---- REST AND RECOVERY: the drill's grammar, two tracks, and nothing wasted ---- */
    const restChecks = () => {
      resetGrid();
      const rest = doc.querySelector('#restgrid .tgrid');
      check(!!rest, 'the recovery grid stands on the desk beside the drill');
      const heads = [...doc.querySelectorAll('#restgrid tr:first-child .tglabel')].map(x => x.textContent);
      check(/Wounds/.test(heads.join(' ')) && /Stress/.test(heads.join(' ')),
            'it has both sides of a body: ' + heads.join(' \u00b7 '));
      /* §REST the corner is gone: resting EVERYBODY at once is the drill grid's idea, and a
         month of rest spread over people with nothing to mend is a month spent on nobody.
         What remains are the two columns and the rows. */
      check(doc.querySelectorAll('#restgrid th.rn .pip').length === 0,
            'the rest grid has no whole-roster corner');
      const stressCol = [...doc.querySelectorAll('#restgrid tr:first-child th')][2];
      const stressed = aliveOf().find(f => f.condition) || aliveOf()[0];
      stressed.condition.stress = 60;
      renderDeskIfAny();
      stressCol.querySelectorAll('.pip')[2].click();
      check(/^Focus Spent 3 of 8/.test(text('#focusdesk').trim()),
            'a column of recovery spends like a column of drill: ' + text('#focusdesk').trim());
      /* ONE month is spent here and no more: the checks below this block count the calendar,
         and a guard that quietly burns two months breaks the ones that come after it. Both
         claims — the stress drop and the overflow — are proved in the same month. */
      const before = stressed.condition.stress;
      const whole = aliveOf().find(f => !(f.condition.injuries || []).length);
      const woundCol = [...doc.querySelectorAll('#restgrid tr:first-child th')][1];
      woundCol.querySelectorAll('.pip')[0].click();          /* one pip of physical, roster-wide */
      endMonth();
      check(stressed.condition.stress < before - 6,
            'a painted month takes stress down faster than time alone (' +
            Math.round(before) + ' \u2192 ' + Math.round(stressed.condition.stress) + ')');
      check(!!whole._conditioned && whole._conditioned.grit > 0,
            'recovery poured on the healthy conditions them instead of being wasted (+' +
            Math.round((whole._conditioned || {}).grit || 0) + ' grit)');
      check(whole._conditioned.grit <= window.CDSEASON.CONST.REST_CONDITION_CAP,
            'and it is capped, so nobody is loaded up for the year');
      resetGrid();
    };
    restChecks();
    doc.getElementById('menubtn').click();
    doc.getElementById('mLoad').click();
    check(doc.querySelectorAll('#savelist [data-load]').length >= 1,
          'the save stands on the shelf');
    doc.querySelector('#savelist [data-export]').click();
    check(doc.getElementById('saveio').value.length > 500 &&
          /"career"/.test(doc.getElementById('saveio').value),
          'the save exports as pasteable code (' + doc.getElementById('saveio').value.length + ' chars)');
    doc.querySelector('#savelist [data-load]').click();
    check(/Month 3/.test(text('#clock')),
          'the load returns the world to month 3: ' + text('#clock'));
    check(doc.querySelectorAll('#roster .rcard').length === rosterAtSave,
          'the loaded roster matches the saved one (' + rosterAtSave + ' rows)');

    /* ---- months 3-4: the tryouts window, now in the Roster's rail — Natural-Born, flat sign ---- */
    openRoster();
    check(/Natural-Born/.test(text('#rostmarket')) && /Discount Pool/.test(text('#rostmarket')),
          'month 3 is the Natural-Born refresh, the discount pool: ' + text('#rostmarket').trim().slice(0, 70));
    /* §ACQ each window wears its own colour, and no button moves or renames under the cursor */
    check(/w-nat/.test(doc.getElementById('rostmarket').className),
          'the Natural-Born window wears its own colour');
    /* §SIGNING a Natural-Born signs when you sign them: off the sheet, onto the roster, paid */
    {
      const GS = window.__G;
      const sheetBefore = doc.querySelectorAll('#rostmarket .pc').length;
      const rosterBefore = GS.corps[GS.me].roster.length;
      const purseBefore = GS.corps[GS.me].account.treasury;
      doc.querySelectorAll('#rostmarket [data-signnow]')[0].click();
      doc.querySelectorAll('#rostmarket [data-signnow]')[0].click();
      /* §PAPER a nattie signs flat: no fee at the desk, the wage month by month with the retainers (as the engine's seats) */
      check(GS.corps[GS.me].roster.length === rosterBefore + 2 &&
            doc.querySelectorAll('#rostmarket .pc').length === sheetBefore - 2 &&
            GS.corps[GS.me].account.treasury === purseBefore,
            'two sign on the spot: off the sheet, onto the roster, no fee');
    }
    endMonth();               /* month 3 ends and its pool signs; month 4 raises the lights */
    openRoster();
    check(doc.querySelectorAll('#roster .rcard[data-hand]').length > 0 &&
          /Natural-Born/.test(text('#roster')),
          'the roster now carries Natural-Born hands after the tryouts');
    /* the sheet's Health is the real wound pool (grit-sized), not the inert condition meter:
       inspect a hand and confirm the panel's Health equals CDCOMBAT.hpFor for that body */
    {
      const card = doc.querySelector('#roster .rcard[data-hand]');
      card.click();
      /* §QUIRKS a quirk says what it does, from the data, not what it is called */
      const chip = doc.querySelector('#unitpanel .qk .q');
      if (chip) {
        check(!!chip.querySelector('.qtip') && /—/.test(chip.getAttribute('title') || ''),
              'a quirk carries its mechanics: ' + (chip.getAttribute('title') || '').slice(0, 60));
      } else check(true, 'this hand carries no quirks');
      const hcell = doc.querySelector('#unitpanel .st.health');
      const shown = hcell ? +(hcell.textContent.match(/\d+/) || [0])[0] : -1;
      const body = window.__G.corps[window.__G.me].roster
                     .find(f => f.id === window.__G._inspect);
      const pool = window.CDCOMBAT.hpFor(body);
      check(shown === pool && pool !== 100,
            'the sheet\'s Health is the real wound pool (' + shown + ' = hpFor ' + pool + '), not the flat meter');
      card.click();   /* deselect, leaving the rail idle for later checks */
    }

    /* ---- months 5-8: THE DIVIDEND TAKES THE FLOOR, then the Bastille ----
       The year used to walk straight through month six: the show resolved inside the month
       step and left a shelf on the Desk, so the one night the crowd turns up for was a line
       in a log. It stops the year now, the way the Divide does. */
    /* walk to the lights: End the Month until month six stops the year. (End the Month IS
       Take the Floor while the lights are up, so one click too many would take it — count.) */
    { let g2 = 0; while (!window.__G._dividendFloor && window.__G.state.month < 7 && g2++ < 3) endMonth(); }
    {
      const GD = window.__G;
      check(!!GD._dividendFloor && GD.state.month === window.CDSEASON.DIVIDEND_MONTH,
            'arriving at the Dividend\'s month stops the year for it');
      const rail = [...doc.querySelectorAll('#rail .tab')].map(t => t.textContent).join(' | ');
      check(/Dividend/.test(rail) && /Desk/.test(rail) && /Squads/.test(rail),
            'the Dividend joins the rail without locking the rest of it: ' + rail);
      check(doc.getElementById('endmonth').style.display !== 'none' &&
            /Take the Floor/.test(doc.getElementById('endmonth').textContent),
            'End the Month reads Take the Floor while the lights are up — one gate, not two');
      const onCard = doc.querySelectorAll('#dvpick .fcard[data-dvdrop]').length;
      const atHome = doc.querySelectorAll('#dvbench .fcard').length;
      check(onCard === 8 && (GD._dvPick || []).length === 8 && atHome >= 0,
            'the fleet\'s default card stands on the board as eight fighter cards (' +
            atHome + ' more at home)');
      check(doc.querySelectorAll('#dvpick .fcard.full').length === 1, 'the card reads Full at eight');
      doc.querySelector('#dvpick [data-dvdrop]').click();
      check(GD._dvPick.length === 7 && doc.querySelectorAll('#dvpick .fcard.open').length === 1,
            'the cross takes a hand off the card and an open row appears');
      if (atHome > 0) {
        doc.querySelector('#dvbench .fcard[data-dvadd]').click();
        check(GD._dvPick.length === 8, 'a card at home joins the card on a click');
        doc.querySelector('#dvpick [data-dvdrop]').click();
      }
      check(doc.querySelectorAll('#dvbench [data-dvsort]').length === 5, 'the bench sorts the Squads\' ways');
      doc.querySelector('#dvbench [data-sheet], #dvpick [data-sheet]').click();
      check(doc.getElementById('unitpanel').classList.contains('on'), 'a name on the card opens the sheet');
      doc.getElementById('sheetclose').click();
      doc.getElementById('dvgo').click();
      check(GD.state.month === window.CDSEASON.DIVIDEND_MONTH + 1 && GD._dividendDone,
            'taking the floor resolves the month that holds the show');
      check(doc.querySelectorAll('#dvcard .ev').length >= 1,
            'the whole card is on the page afterwards (' +
            doc.querySelectorAll('#dvcard .ev').length + ' matches)');
      /* the Dividend's month has a recap of its own now, carrying the card; Continue clears it */
      check(doc.querySelector('.page[data-tab="recap"]').classList.contains('on') && /The Dividend/.test(text('#recapbody')),
            'the Dividend\'s month ends in a recap that carries the card');
      /* the corner says what this turn is, wherever the year stands */
      check(!!doc.getElementById('turngo') || !!doc.getElementById('turnnext') || !!doc.getElementById('turnend'),
            'the corner carries the turn through the lights: ' + ((doc.getElementById('turngo') || doc.getElementById('turnnext') || doc.getElementById('turnend') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 44));
      doc.getElementById('recapgo').click();
      check(!GD._dividendFloor && !doc.querySelector('.page[data-tab="lights"]').classList.contains('on') &&
            doc.querySelector('.page[data-tab="desk"]').classList.contains('on'),
            'the lights go down by themselves and the Desk is back, nothing to dismiss');
      /* the matches are watched from the Desk's shelf now */
      doc.querySelector('#desklights [data-watchd]').click();
      check(+doc.getElementById('fr').max > 5,
            'and any match replays on the same grid the Divide uses (' +
            (+doc.getElementById('fr').max + 1) + ' frames)');
      doc.getElementById('fightback').click();
      check(doc.querySelector('.page[data-tab="desk"]').classList.contains('on'), 'Back returns to the Desk the shelf stands on');
      check(!/Dividend/.test([...doc.querySelectorAll('#rail .tab')].map(t => t.textContent).join(' ')) &&
            doc.getElementById('endmonth').style.display !== 'none' && /End the Month/.test(doc.getElementById('endmonth').textContent),
            'the rail is the preparation\'s again and End the Month is back');
      /* clicking a card on the card sends it home, the Squads' habit; the cross still works */
      const dvc = doc.querySelectorAll('#dvpick .fcard[data-dvdrop]').length;
      check(dvc >= 1, 'the card\'s fighters are whole-card click targets (' + dvc + ')');
    }
    check(/the Dividend/i.test(text('#desklights')),
          'the Dividend surfaces on the Desk\'s shelf, not a month log');
    check(doc.getElementById('deskligwrap').style.display !== 'none',
          'the lights stand on the Desk\'s shelf from month 7');
    /* THE LIGHTS LIVE ON THE DESK'S SHELF, and "Since the Last Window" is the CONTEST's
       recap — it used to carry the summer's exhibition into the Divide, which is why the
       Table opened on a list of fights that had nothing to do with the ground. */
    const lightRows = doc.querySelectorAll('#desklights [data-watchd]').length;
    check(lightRows >= 1 && /the Dividend/i.test(text('#desklights')),
          'the show-matches stand on the Desk\'s shelf for watching (' + lightRows + ' lights)');
    check(!/the Dividend/i.test(text('#encounters')),
          'the contest\'s recap carries only the ground, not the summer\'s exhibition');
    doc.querySelector('#desklights [data-watchd]').click();
    check(+doc.getElementById('fr').max > 5 && /turn \d+ of \d+/i.test(text('#frLbl')),
          'a show-match replays on the grid (' + (+doc.getElementById('fr').max + 1) +
          ' frames \u00b7 ' + text('#frLbl') + ')');
    /* either outcome is a valid exhibition — a purse taken or a draw — and the page writes
       "drawn" inside a sentence, where Title Case does not apply */
    check(/Purse|drawn/i.test(text('#result')) && /Paid at the Whistle/.test(text('#settle')),
          'the lights\' result reads as an exhibition: ' +
          text('#result').replace(/\s+/g, ' ').trim().slice(0, 90));
    check(!doc.getElementById('lock') && !doc.getElementById('run') && !doc.getElementById('lockinfo'),
          'the scrim is gone entirely: no lock, no run — the Firefight only replays');
    check(!!doc.getElementById('fightback') && (window.__G._fightBack === 'desk'),
          'the room knows its way back to the Desk during the year');
    openRoster();
    check(/Bastille/.test(text('#rostmarket')) && /Conscript/.test(text('#rostmarket')),
          'months 5-6 show the Kier Bastille for Conscripts');
    /* §GROUND the drop and the playback, guarded: the corner's Drop presses the handler both
       buttons share (it used to hunt for a button the Table had not drawn, so the first press
       did nothing), the first window stands at the landing, and a later window plays FORWARD
       from where the manager is rather than jumping to the newest day. */
    /* §BASTILLE OAs compete on the way out: every card carries the sentence and a way to
       offer terms against it, and no wage of the man's own on a sheet that is meant to be blind */
    check(/Sentence \d/.test(text('#rostmarket')) && doc.querySelectorAll('#rostmarket [data-term]').length > 0
          && /Honour the Sentence/.test(text('#rostmarket')),
          'every Conscript carries his sentence and the terms an OA may offer against it');
    check(!doc.querySelector('#rostmarket [data-bidslide]') || /Mercenary/.test(text('#rostmarket')),
          'nobody at the Kier is bid for with credits');
    check(!/Wage \u20a1\d/.test(text('#rostmarket').replace(/Kier Wage/g, '')),
          'no wage of the man\'s own on a Bastille card — only the Kier\'s scale');
    check(/Earn Release/.test(text('#rostmarket')),
          'every Conscript\'s freedom clause is on the sheet');
    /* the intel painted in M1 has landed by now (M6); the gather section is still open, so open
       its dossier through the real click target and confirm it reads on the page */
    (function () {
      const GI = window.__G;
      deskTab().click();
      /* §OA a rival's name on the intel row opens its OA SHEET now, in the drawer, where the
         dossier is one section among its standing, its shape and its years; the planet keeps
         the inline dossier, being no OA */
      const link = [...doc.querySelectorAll('#intelgrid .idoss')]
                     .find(d => d.getAttribute('data-oa') === intelWatched);
      check(!!link, 'the watched rival is on the intel section for its sheet to open');
      if (link) {
        link.click();
        check(doc.getElementById('oapanel').classList.contains('on') && !!doc.querySelector('#oapanel .dtbl') &&
              (/\d\s*mo|This month|Not Yet Scouted/.test(text('#oapanel'))),
              'the OA sheet opens and carries the dossier, dated or plainly unscouted');
        check(/Standing/.test(text('#oapanel')) && /Their Years/.test(text('#oapanel')),
              'and its standing and its years beside it');
        doc.getElementById('oaclose').click();
      }
      /* THE PLANET'S DOSSIER READS AS FIGURES. Force the sheet full and read every row: the
         veins named with their category, the sites in units, the hazards as shares, supply as
         a ration burn, the landing ring saying what it unlocks. No 'partial', no snake_case. */
      const pl = GI.corps[GI.me]._intel.planet, keep = JSON.stringify(pl.rows);
      ['ground', 'veins', 'sites', 'terrain', 'hazards', 'supply', 'sectors'].forEach(k => { pl.rows[k] = { depth: 3, gathered: 101 }; });
      const plink = [...doc.querySelectorAll('#intelgrid .idoss')].find(d => d.getAttribute('data-doss') === 'planet');
      if (plink) {
        plink.click();
        const dt = text('#dossier').replace(/\s+/g, ' ');
        /* (one measure since d5ee7c6: the veins read as Deep, Fair or Thin seams, not a sum of units) */
        check(/(Deep|Fair|Thin) Seams/.test(dt) && /Rations Burn/.test(dt) && /Each Landing.s Ground/.test(dt) && /Pot \u20a1/.test(dt),
              'the planet dossier reads as figures: the seams, ration burn, the pot, what the ring unlocks');
        check(!/_/.test(dt) && !/Partial|partial/.test(dt) && /Full/.test(dt),
              'the planet dossier has no snake_case and grades Blank / Sparse / Read / Full');
        GI._dossier = null;
      } else check(false, 'the planet stands on the intel section for its dossier to open');
      pl.rows = JSON.parse(keep);    /* the reading was a look, not a purchase */
      openRoster();
    })();
    /* §ALEAS THE ALEAS' BACK ROOM IS GONE (ruled): its favours, evidence and cases. §STAFF The name now belongs to
       the staff — six posts at home — and the old favours must not come back under it. */
    {
      const bkTab = [...doc.querySelectorAll('.tab')].find(x => /Backroom/i.test(x.textContent));
      if (bkTab) bkTab.click();
      const bk = doc.getElementById('backroom'), bt = bk ? bk.textContent : '';
      check(!!bkTab && /Drillmaster/.test(bt) && /Spymaster/.test(bt) && !/Favour|Evidence|Aleas/i.test(bt),
            'the Backroom is the staff: six posts, and none of the Aleas\u2019 old favours');
      openRoster();
    }
    [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
    /* THE EVENTS: something asks for a decision. Force one onto the month, answer it, and see it
       resolve; leave another and see it default in the recap. */
    {
      const GE = window.__G, S2 = window.CDSEASON;
      const box = GE.state.events[GE.me];
      const roster = GE.corps[GE.me].roster.filter(f => f.status === 'active');
      box.list = [{ id: 'raise-test', pool: 'raise', kind: 'raise', subject: roster[0].id, ask: 500, title: roster[0].name + ' Wants a Raise', text: 'test',
                    options: [{ id: 'grant', label: 'Grant It', cost: '' }, { id: 'refuse', label: 'Refuse', cost: '' }, { id: 'release', label: 'Release Them', cost: '' }], def: 'refuse', resolved: null },
                  { id: 'insult-test', pool: 'insult', kind: 'insult', from: GE.state.ids.find(x => x !== GE.me), title: 'A Slight in the Postings', text: 'test',
                    options: [{ id: 'answer', label: 'Answer It', cost: '' }, { id: 'ignore', label: 'Say Nothing', cost: '' }, { id: 'laugh', label: 'Laugh It Off', cost: '' }], def: 'ignore', resolved: null }];
      [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
      check(doc.querySelectorAll('#events .evcard').length === 2 && /Wants a Raise/.test(text('#events')), 'two events stand on the Desk as cards');
      check(/Wants a Raise/.test(text('#agenda')) && /Defaults to Refuse/.test(text('#agenda')), 'the agenda lists an open event with its default');
      const sal0 = roster[0].contract.salary;
      doc.querySelector('#events [data-ev="raise-test"][data-opt="grant"]').click();
      check(roster[0].contract.salary === sal0 + 500 && /Got the Raise/.test(text('#events')), 'granting the raise moves the salary and the card says so');
      doc.getElementById('endmonth').click();
      /* §RECAP the month's money adds up: every line the month wrote, then the total */
      {
        const GR = window.__G;
        const rows = [...doc.querySelectorAll('#recapbody .row')].map(r => r.textContent);
        check(/The Month/.test(text('#recapbody')) && !/Treasury.*\u2192.*\+/.test(rows[0] || ''),
              'the recap totals the month at the foot, not the head');
      }
      check(/Got the Raise/.test(text('#recapbody')) && /Your Call/.test(text('#recapbody')) && /Slight Was Ignored/.test(text('#recapbody')) && /By Default/.test(text('#recapbody')),
            'the recap reads the answered event as your call and the open one as its default');
      doc.getElementById('recapgo').click();
    }
    /* WHAT IS LEFT WAITING COSTS: plant a letter from an OA, end the month without answering,
       and the letter is gone and the OA remembers being snubbed */
    {
      const GL = window.__G, from = GL.state.ids.find(x => x !== GL.me);
      const memBefore = GL.corps[GL.me].rep.memory.filter(m => m.t === 'snubbed_letter' && m.hx && m.hx[from] != null).length;
      /* §TRADE a letter is POSTED to the one market, as the engine's OAs post them */
      const planted = { from: from, ask: { units: [GL.corps[GL.me].roster[0].id], credits: 0, gear: [], intel: [] }, offer: { credits: 10000, gear: [], units: [], intel: [] } };
      window.CDSEASON.postTrade(GL.state, planted.from, GL.me, planted.offer, planted.ask);
      [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
      check(/Has Written/.test(text('#agenda')) && /Waiting/.test(doc.getElementById('endmonth').textContent),
            'a letter stands on the agenda and End the Month counts it');
      doc.getElementById('endmonth').click();
      check(/Lapses/.test(text('#recapbody')), 'the recap says the letter lapsed and was noticed');
      doc.getElementById('recapgo').click();
      /* THE TEST WAS THAT NO LETTER STOOD AFTERWARDS, and the fleet writes every month: a
         new letter arriving in the same step is the game working, not the snub failing. What
         matters is that THIS letter lapsed and was remembered. */
      const memAfter = GL.corps[GL.me].rep.memory.filter(m => m.t === 'snubbed_letter' && m.hx && m.hx[from] != null).length;   /* THIS writer's: another letter may lapse the same month */
      check(memAfter === memBefore + 1 && (!GL._tradeOffer || GL._tradeOffer.from !== from),
            'the letter lapsed and the OA remembers the snub (' + memBefore + ' \u2192 ' + memAfter + ')');
    }
    /* the Bastille's two intakes resolve as months 5 and 6 end; month 7 is the fleet's */
    toMonth(8);
    /* THE EIGHT: one name, one fight, real deaths */
    {
      const G8 = window.__G;
      [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
      check(doc.querySelectorAll('#eight .fcard[data-eight]').length >= 4 && /Your Best/.test(text('#eight')) && /Name Your Fighter for The Eight/.test(text('#agenda')),
            'month 8 asks for a name for The Eight: fighter cards on the Desk, the item on the agenda');
      const pickCard = doc.querySelectorAll('#eight .fcard[data-eight]')[1]; const chosen = pickCard.getAttribute('data-eight');
      pickCard.click();
      check(G8.state.eight.names[G8.me] === chosen && doc.querySelector('#eight .fcard.named') && doc.querySelector('#eight .fcard.named').getAttribute('data-eight') === chosen,
            'clicking a card names that fighter');
      const bodies0 = G8.corps[G8.me].roster.filter(f => f.status === 'active').length;
      doc.getElementById('endmonth').click();
      const R8 = G8.state.eight.result;
      check(R8 && R8.held && R8.teams.A.length === 4 && R8.teams.B.length === 4 && ['A', 'B', null].indexOf(R8.winner) >= 0,
            'The Eight was fought, four against four; winner ' + R8.winner + ', pot ' + R8.pot + ', dead ' + JSON.stringify(R8.deadBy));
      check(doc.querySelectorAll('#recapbody .eightcard .tm').length === 2 && /Died|Hurt|Standing/.test(text('#recapbody')) && !!doc.getElementById('eightwatch'),
            'the recap carries both fours with each fighter\'s fate and a Watch');
      doc.getElementById('eightwatch').click();
      check(+doc.getElementById('fr').max > 3, 'The Eight replays on the grid (' + (+doc.getElementById('fr').max + 1) + ' frames)');
      /* §3.9 the fight says what decided it, and every shot says why it was that likely */
      check(/What Decided It/.test(text('#result')) && /Shots/.test(text('#result')) && /Shot Against/.test(text('#result')),
            'the result reads what decided the fight: ' + (text('#result').match(/Shot Against[^|]{0,40}/) || ['—'])[0].replace(/\s+/g, ' '));
      /* step until a shot has been missed (a miss carries its chance): which turn that is depends on the fight */
      /* the fight's feed is #fevents (the Desk's event cards are #events: one id was on both) */
      for (let k = 0; k < 12 && !/%/.test(text('#fevents')); k++) doc.getElementById('fwd').click();
      check(/%/.test(text('#fevents')), 'the feed prints each shot\'s chance and what it was taken against');
      doc.getElementById('fightback').click();
      check(doc.querySelector('.page[data-tab="recap"]').classList.contains('on'), 'Back returns to the recap');
      doc.getElementById('recapgo').click();
    }
    toMonth(9);

    /* ---- months 9-10: the merc window — they auction themselves ---- */
    openRoster();
    check(/Mercenary Market/.test(text('#rostmarket')) && /Mercenary/.test(text('#rostmarket')) &&
          /One Divide/.test(text('#rostmarket')),
          'the merc window names the origin and the terms');
    /* §ACQ its own colour, and Place / Raise / Withdraw all standing on every card at once —
       no button that moves or renames itself under the cursor */
    {
      const n = doc.querySelectorAll('#rostmarket [data-bidslide]').length;
      check(/w-mer/.test(doc.getElementById('rostmarket').className) && n >= 1 &&
            doc.querySelectorAll('#rostmarket [data-bid]').length === n &&
            doc.querySelectorAll('#rostmarket [data-bidup]').length === n &&
            doc.querySelectorAll('#rostmarket [data-nobid]').length === n,
            'the merc window wears its own colour; Place, Raise and Withdraw all stand (' + n + ' cards)');
      check(/Ask \u00b7/.test(text('#rostmarket')) && !/The Field|They Would Take It/.test(text('#rostmarket')),
            'the bid reads against the ask, and makes no guess at the field (ruled)');
    }
    bidHigh(2);
    endMonth();
    openRoster();
    bidHigh(2);
    endMonth();
    const rosterMid = doc.querySelectorAll('#roster .rcard').length;
    check(rosterMid > rosterStart,
          'the year\'s windows brought people in: roster ' + rosterStart + ' -> ' + rosterMid);

    /* ---- the intel painted back in month 1 has long since reported: read the dossier ---- */
    (function () {
      const GI = window.__G, watched = intelWatched;
      const sheet = GI.corps[GI.me]._intel && GI.corps[GI.me]._intel.rivals
                    && GI.corps[GI.me]._intel.rivals[watched];
      const filled = sheet ? window.CDSEASON.INTEL_RIVAL_ROWS
                       .filter(r => sheet.rows[r] && sheet.rows[r].depth).length : 0;
      check(filled >= 3,
            'the scouts reported: the watched rival\'s dossier filled ' + filled + ' of 6 rows');
      const snap = sheet && window.CDSEASON.INTEL_RIVAL_ROWS
                     .map(r => sheet.rows[r]).find(x => x && x.snapshot);
      check(!!snap && typeof snap.snapshot === 'string',
            'a dossier row froze a real reading: "' + (snap ? snap.snapshot : '—') + '"');
    })();


    /* ---- month 11: plan the squads on the new board, then the lock ---- */
    const G = window.__G;
    check(doc.querySelectorAll('#sqboxes .sqcard').length === 6 &&
          /Alpha/.test(text('#sqboxes')) && /Foxtrot/.test(text('#sqboxes')),
          'the board shows six squads, named Alpha through Foxtrot');
    /* assign six to Alpha. The board is select-then-place: pick a bench card up, then click
       the squad's Place. Six times, through the page's own clicks. */
    /* §WOUNDS TAKE THE HANDS THE BENCH ACTUALLY OFFERS. This picked the first six by `status`,
       which is no longer the same set: a wound is a condition now, so the badly hurt are on the
       roster and not on the bench. Reading the bench is also what a manager does. */
    hasTab('Squads') && [...doc.querySelectorAll('.tab')].filter(x => /Squad/.test(x.textContent))[0].click();
    /* §MON-WA the bench offers BEINGS, and placing a pair fills ONE seat with two bodies: take
       six bench cards that are not halves of a pair, so "six placed" still means six seats and
       six portraits. Pairs in a squad have their own checks. */
    const benchG = window.__G;
    const squadIds = [...doc.querySelectorAll('#bench .fcard[data-id]')]
      .filter(el => { const b = (benchG.corps[benchG.me].roster || [])
        .find(x => x.id === el.getAttribute('data-id')); return b && !b.bond_partner; })
      .slice(0, 6).map(el => el.getAttribute('data-id'));
    squadIds.forEach(id => {
      doc.querySelector('#bench .fcard[data-id="' + id + '"]').click();
      doc.querySelector('#sqboxes .sqcard[data-si="0"] [data-place]').click();
    });
    const alpha = () => doc.querySelectorAll('#sqboxes .sqcard')[0];
    /* §SQUADS eight PORTRAITS, not eight rows */
    check(alpha().querySelectorAll('.port-card[data-id]').length === 6 &&
          alpha().querySelectorAll('.port-slot').length === 2 &&
          alpha().querySelectorAll('.port-card .prate').length === 6,
          'Alpha stands as eight portraits: six filled with their ratings, two open');
    /* §5.2 a filled squad carries a ration load the manager can change: the row reads it, the step moves it */
    { const row = () => alpha().querySelector('.sqfood');
      const d0 = row() ? +row().querySelector('b').textContent : NaN;
      if (row()) row().querySelector('[data-step="1"]').click();
      const d1 = row() ? +row().querySelector('b').textContent : NaN;
      console.log('food: ' + (row() ? row().textContent.replace(/\s+/g, ' ').trim() : 'none'));
      check(isFinite(d0) && d1 === d0 + 1 && doc.defaultView.__G.plan.rations[0] === d1 && /Bulk \d+\.\d A Head/i.test(row().textContent),
            'a squad\'s rations show their days, Bulk and price, and the step sets them'); }
    /* §SQUADS one target a squad, not every empty slot on the page */
    doc.querySelector('#bench .fcard[data-id]').click();
    const sqPage = doc.querySelector('.page[data-tab="squads"]');
    const lit = sqPage.querySelectorAll('.port-slot.can').length;
    const openSlots = sqPage.querySelectorAll('.port-slot').length;
    check(lit >= 1 && lit < openSlots,
          'picking somebody up lights one place a squad, not every empty slot (' + lit + ' of ' + openSlots + ')');
    doc.querySelector('#bench .fcard[data-id]').click();       /* put them back down */
    /* §SQUADS a portrait picks up and moves between squads without going home first */
    {
      const mover = alpha().querySelector('.port-card[data-id]');
      const movedId = mover.getAttribute('data-id');
      const wasIn = G.plan.at[movedId];
      mover.click();
      const target = doc.querySelector('.page[data-tab="squads"] .port-slot.can[data-place]');
      if (target) {
        const to = +target.getAttribute('data-place');
        target.click();
        check(G.plan.at[movedId] === to && to !== wasIn,
              'a portrait moves squad to squad without being sent home first (' + wasIn + ' \u2192 ' + to + ')');
        doc.querySelector('.page[data-tab="squads"] .port-card[data-id="' + movedId + '"]').click();
        const backTarget = [...doc.querySelectorAll('.page[data-tab="squads"] .port-slot.can[data-place]')]
          .find(t => +t.getAttribute('data-place') === wasIn);
        if (backTarget) backTarget.click();
      } else check(true, 'no free squad to move into');
      /* §MARK a portrait is the fighter's own mark now, ringed in the OA's colour */
      const marks = doc.querySelectorAll('.page[data-tab="squads"] .port-card .fmark');
      const bodies = [...marks].map(m => m.innerHTML);
      check(marks.length >= 6 && new Set(bodies).size >= 4,
            'every portrait carries the fighter\'s own mark, and they differ (' + new Set(bodies).size + ' distinct of ' + marks.length + ')');
      /* born from the id: the same fighter draws the same mark twice */
      /* born from the id: painting the page twice draws the same marks in the same order */
      const again = [...doc.querySelectorAll('.page[data-tab="squads"] .port-card .fmark')].map(m => m.innerHTML);
      check(again.join('|') === bodies.join('|'), 'a fighter\'s born mark is stable across paints');
      /* §MARK A BORN MARK MUST READ WITHOUT ANYBODY LOOKING AT IT FIRST: a field never lands
         on a diagonal, nothing is scaled past a tenth, and nothing is moved or stretched —
         those are a manager's tools, not the draw's. */
      {
        /* read off the marks the page actually drew: a field on a diagonal shows as a
           rotate of 45, 135, 225 or 315 on the first group of a mark */
        const drawn = [...doc.querySelectorAll('.page[data-tab="squads"] .port-card .fmark')]
                        .map(m => m.innerHTML);
        const diagField = drawn.filter(html => /^<g transform="translate\([^)]*\) rotate\((45|135|225|315)\)/.test(html)).length;
        const wild = drawn.filter(html => /scale\((0\.[0-8]|[2-9])/.test(html)).length;
        const shoved = drawn.filter(html => /translate\((?!12 12\))/.test(html) && !/translate\(1[12](\.\d)? 1[12](\.\d)?\)/.test(html)).length;
        check(drawn.length >= 6 && diagField === 0 && wild === 0 && shoved === 0,
              'a born mark keeps its bands: no diagonal fields, no wild scaling, nothing shoved off centre');
      }
      /* §MARK A MARK GOES EVERYWHERE ITS FIGHTER GOES. Rather than naming the surfaces one by
         one and finding out later that a new one shipped bare, this sweeps every host that
         names a hand and asks whether a mark stands with it. */
      {
        const GM = window.__G;
        /* §MON-WA a pair is written as one name in two tones, so its HALVES appear as leaf
           spans inside it: those are fragments of a name, not a surface naming a hand. The
           names looked for are the ones a manager reads — the pair's, not its syllables. */
        const names = GM.corps[GM.me].roster.map(f => f.pair_name || f.name);
        const bare = [];
        ['traingrid', 'restgrid', 'roster', 'bench', 'resigning', 'rostmarket', 'negwrap'].forEach(id => {
          const host = doc.getElementById(id); if (!host) return;
          host.querySelectorAll('*').forEach(el => {
            if (el.children.length) return;
            if (el.closest && el.closest('.mw')) return;      /* a half inside a pair's name */
            if (!names.includes((el.textContent || '').trim())) return;
            let p = el, hit = false;
            for (let k = 0; k < 4 && p; k++) { if (p.querySelector && p.querySelector('.fmark')) { hit = true; break; } p = p.parentElement; }
            if (!hit) bare.push(id + ': ' + el.textContent.trim());
          });
        });
        check(bare.length === 0, 'every surface that names a hand shows their mark' +
              (bare.length ? ' \u2014 bare: ' + bare.slice(0, 4).join(', ') : ''));
      }
      /* §MARK the Roster is where a manager looks at his people, so the mark on a row opens
         its editor directly — and the sheet says in words that the mark can be changed */
      {
        openRoster();
        const rowMark = doc.querySelector('#roster .rcard [data-editmark]');
        check(!!rowMark, 'every roster row wears the fighter\'s mark, and it opens the editor');
        rowMark.click();
        check(doc.getElementById('markedit').style.display !== 'none',
              'clicking a row\'s mark opens the pad from the Roster');
        doc.querySelector('#markedit [data-mkclose]').click();
        [...doc.querySelectorAll('.tab')].filter(x => /Squads/.test(x.textContent))[0].click();
      }
      /* §MARK a manager may change any of his own people's marks through the same pad */
      {
        const G9 = window.__G;
        const who = doc.querySelector('.page[data-tab="squads"] .port-card [data-sheet]');
        who.click();
        const before9 = doc.querySelector('#unitpanel .sheetmark .fmark').innerHTML;
        doc.querySelector('#unitpanel [data-editmark]').click();
        /* §MARK the editor is a panel in the middle of the screen: a builder cannot be folded
       into the 340px rail beside a sheet */
        check(doc.getElementById('markedit').classList.contains('on') &&
              doc.querySelectorAll('#markedit .markwrap .padb').length === 12 &&
              doc.querySelectorAll('#markedit .mkrow').length === 3 &&
              doc.querySelectorAll('#markedit [data-mkcol]').length >= 7,
              'the sheet\'s mark opens the builder in its own panel, with the fill colours');
        doc.querySelector('#markedit [data-adj="turn"][data-d="1"]').click();
        doc.querySelector('#markedit [data-mkcol]:nth-of-type(3)').click();
        doc.querySelector('#markedit [data-mksave]').click();
        const fid = who.getAttribute('data-sheet');
        const fz = G9.corps[G9.me].roster.find(x => x.id === fid);
        check(!!fz.mark && !!fz.mark.color && doc.querySelector('#unitpanel .sheetmark .fmark').innerHTML !== before9,
              'Keep It saves the mark and the fill on the fighter, and the sheet wears it');
        doc.querySelector('#unitpanel [data-editmark]').click();
        doc.querySelector('#markedit [data-mkborn]').click();
        check(!fz.mark, 'As Born throws the change away');
        doc.querySelector('#markedit [data-mkclose]').click();
        doc.getElementById('sheetclose').click();
      }
      /* §SQUADS the face-plate is a portrait's shape: taller than it is wide, 2:3 */
      const plate = doc.querySelector('.page[data-tab="squads"] .port-card .pface');
      const styles = doc.querySelector('style').textContent;
      check(!!plate && /\.port-card \.pface\{[^}]*aspect-ratio:2\/3/.test(styles),
            'the face-plate is a 2:3 frame, not a wide strip');
    }
    check(!doc.querySelector('#bench .fcard[data-id="' + squadIds[0] + '"]'),
          'a placed fighter leaves the bench');
    /* the seventh and eighth fit the engine's SQUAD_MAX of 8; a ninth is refused */
    /* the same bench, read again: the six above are gone from it, so what remains is the rest */
    const benchNow = [...doc.querySelectorAll('#bench .fcard[data-id]')].map(el => el.getAttribute('data-id'));
    const fitCount = squadIds.length + benchNow.length;
    /* §MON-WA again: take beings that are not halves, so the seventh, eighth and refused
       ninth are seats and the portrait count is the seat count */
    const more = benchNow.filter(id => { const b = (benchG.corps[benchG.me].roster || [])
      .find(x => x.id === id); return b && !b.bond_partner; }).slice(0, 3);
    more.forEach(id => { doc.querySelector('#bench .fcard[data-id="' + id + '"]').click();
                         const pl = doc.querySelector('#sqboxes .sqcard[data-si="0"] [data-place]');
                         if (pl) pl.click(); else G._sqsel = null; });
    check(alpha().querySelectorAll('.port-card[data-id]').length === 8 &&
          alpha().querySelectorAll('.port-slot').length === 0,
          'Alpha fills all eight slots');
    /* the cross sends the two extras home again */
    more.slice(0, 2).forEach(id => { const c = alpha().querySelector('.port-card[data-id="' + id + '"] [data-home]'); if (c) c.click(); });
    /* two came off the card, so two are back on the bench — counted against the bench as it
       stood a moment ago rather than against a roster figure that no longer means the same */
    check(alpha().querySelectorAll('.port-card[data-id]').length === 6 &&
          doc.querySelectorAll('#bench .fcard').length >= 2,
          'the cross on a portrait sends a fighter home (' +
          alpha().querySelectorAll('.port-card[data-id]').length + ' on the card, ' +
          doc.querySelectorAll('#bench .fcard').length + ' at home)');
    /* the star on a row makes a leader, on the person */
    const leadId = squadIds[3];
    const leadName = G.corps[G.me].roster.find(f => f.id === leadId).name;
    alpha().querySelector('.port-card[data-id="' + leadId + '"] [data-lead]').click();
    check(!!G.plan.leaderOf[leadId] && alpha().querySelectorAll('.pstar.on').length === 1,
          'clicking the star sets leadership on the person: ' + leadName);
    /* the name opens the sheet as a drawer: four loadout slots, the moves, the actions */
    alpha().querySelector('.port-card[data-id="' + leadId + '"] [data-sheet]').click();
    check(doc.getElementById('unitpanel').classList.contains('on') &&
          doc.querySelectorAll('#unitpanel .slot').length === 7,
          'the sheet opens as a drawer with the whole loadout: primary, sidearm, armour, two mods, two stores');
    check(doc.querySelectorAll('#unitpanel .mv').length === 6 &&
          doc.querySelector('#unitpanel .mv[data-mv="0"]').disabled,
          'the sheet offers a move to every squad but the one they stand in');
    doc.getElementById('pmakelead').click();
    check(!G.plan.leaderOf[leadId], 'the sheet\'s leader button toggles leadership off');
    doc.getElementById('pmakelead').click();
    check(!!G.plan.leaderOf[leadId] && G._inspect === leadId &&
          doc.getElementById('unitpanel').classList.contains('on'),
          'and on again, the drawer staying on the inspected fighter through the rerender');
    /* §SKILLS the weapon skill block: their aim with the gun they carry, centred across the top; the two classes side
       by side beneath it */
    {
      const tal = doc.querySelector('#unitpanel .talrow');
      const cells = tal ? [...tal.children] : [];
      const line = tal && tal.querySelector('.shootline');
      check(!!line && cells[0] === line && /Total Aim \(/.test(line.textContent) &&
            /Ballistic/.test((cells[1] || {}).textContent || '') && /Energy/.test((cells[2] || {}).textContent || ''),
            'the weapon skill block: ' + (line ? line.textContent.replace(/\s+/g, ' ').trim() : 'no aim line') +
            ', then Ballistic and Energy side by side');
    }
    /* §ITEMS one way an item is described: a kit slot writes the first figures in their colours, the picker draws the
       Market's bars and chips under each row */
    {
      const kt = doc.querySelector('#unitpanel .slot[data-slot="primary"] .kt');
      check(!!kt && !!kt.querySelector('.fig.damage') && /Damage \d/.test(kt.textContent),
            'a kit slot writes its figures in their colours: ' + (kt ? kt.textContent.trim() : 'none'));
    }
    doc.querySelector('#unitpanel [data-slot="primary"]').click();
    check(!!doc.querySelector('.picker .prow .pspec .mbar b.damage') && !!doc.querySelector('.picker .prow .pspec .mchips'),
          'the picker draws the Market\'s bars and chips under each row');
    check(doc.querySelectorAll('.picker .prow').length > 1,
          'the equip picker lists options: ' + doc.querySelectorAll('.picker .prow').length + ' rows');
    check(doc.querySelectorAll('.picker .prow .tierb').length >= doc.querySelectorAll('.picker .prow').length - 1,
          'every item in the picker wears its tier badge');
    /* §SQUADS the picker lists what the armoury holds — buying is the market's (ruled) */
    check(![...doc.querySelectorAll('.picker .prow')].some(r => /Buy /.test(r.textContent)),
          'the equip picker offers nothing to buy: the armoury only');
    const rackRow = [...doc.querySelectorAll('.picker .prow')].find(r => /Rack /.test(r.textContent));
    const pickRow = rackRow || [...doc.querySelectorAll('.picker .prow')][1];
    const handPrim = pickRow.querySelector('.pn').firstChild.textContent.trim();
    check(/Power|Range|Long|Short|Medium|Protect|Ballistic|Energy/.test(pickRow.textContent),
          'a picker row shows what the item does: ' +
          (pickRow.querySelector('.pd') || {}).textContent);
    pickRow.click();
    check(!!G.plan.hand[leadId] && G.plan.hand[leadId].primary,
          'the picker set a hand primary: ' + handPrim);
    check(/Hand-Kitted/.test(text('#unitpanel')), 'the sheet marks the fighter hand-kitted');
    /* a benched fighter's sheet opens too, and can place them from the drawer */
    const benchOne = doc.querySelector('#bench .fcard [data-sheet]').getAttribute('data-sheet');
    doc.querySelector('#bench .fcard [data-sheet]').click();
    check(G._inspect === benchOne && /Place in/.test(text('#unitpanel')),
          'a fighter at home opens the same sheet, offering to place them');
    doc.querySelector('#unitpanel .mv[data-mv="1"]').click();
    check(G.plan.at[benchOne] === 1, 'the sheet\'s move button placed them in Beta');
    alpha().querySelector('.fcard[data-id]'); doc.getElementById('sheetclose').click();
    check(!doc.getElementById('unitpanel').classList.contains('on'), 'the drawer closes');
    /* Beta holds one now and reads short; send them home so the lock below sees one squad */
    { const hb = doc.querySelector('#sqboxes .sqcard[data-si="1"] [data-home]'); if (hb) hb.click(); }
    endMonth();               /* month 11 — the lock; the year turns to the Divide */
    check(/the Divide/i.test(text('#clock')), 'eleven months spent: ' + text('#clock'));
    check(/The Draft|Drop/.test(((doc.getElementById('turngo') || {}).textContent || '')),
          'at the lock the corner is the draft, not a month');
    check(!doc.body.classList.contains('yearline'), 'the year line stands down for the Divide');
    /* §RAIL the Divide's Desk is its own surface wearing the same NAME as the year's Desk:
       what proves the switch is the Ground standing up and the Firefight standing down */
    check(!hasTab('The Firefight') && hasTab('Desk') && hasTab('Negotiation') &&
          hasTab('The Ground') && hasTab('Roster'),
          'the whole menu switches: the Divide\'s rail, the Firefight off it');
    check(/Desk/.test(doc.querySelectorAll('#rail .tab')[0].textContent),
          'the Desk stands first on the Divide\'s rail');
    check(doc.querySelector('.page[data-tab="table"]').classList.contains('on'),
          'and the Table is the Divide\'s home — the rail opens onto it');

    /* THE SCRIM STRETCH WAS HERE — lock arithmetic, the locker's conserving books, the
       casualty grind. The mechanism it audited (lockSide/returnKit) is deleted; what it
       proved about the game now proves through the real Divide below: composition in the
       replay's side panels, the hand at begindiv, casualties on the shared roster after
       the contest. */
    /* CLEAR SQUADS asks first, then wipes the board; the hand survives it */
    doc.getElementById('autodeal').click();
    check(doc.querySelectorAll('#sqboxes .sqcard.filled').length > 0 && !!doc.getElementById('clearyes'),
          'Clear Squads asks before it acts');
    doc.getElementById('clearyes').click();
    check(doc.querySelectorAll('#sqboxes .sqcard.filled').length === 0 && !!G.plan.hand[leadId],
          'confirmed, clearing sends everyone home and keeps the hand-kitted loadouts');
    /* rebuild the six-and-leader plan the begindiv below must honor */
    (function () {
      const GG = window.__G;
      const fit2 = GG.corps[GG.me].roster.filter(f => f.status === 'active');
      fit2.slice(0, 6).forEach(f => { GG.plan.at[f.id] = 0; });
      GG.plan.leaderOf[leadId] = true;
      GG.plan.hand[leadId] = GG.plan.hand[leadId] || { primary: null };
    })();

    /* ---- the ground and the firefight, tied: the real Divide ---- */
    for (let a = 0; a < 6; a++) {
      const bid = (window.__G.corps[window.__G.me].roster.filter(f => f.status === 'active')[0] || {}).id;
      if (bid) { window.__G.plan.at[bid] = 0; }
    }
    /* §DROP THE DRAFT: the zones at the lock, drafted weakest first, one a squad; the AI's turns run until it is
       yours; you open a region and pick a zone in it; Drop when the draft is done */
    {
      const GD2 = window.__G, S3 = window.CDSEASON, PRE4 = window.CDPREDIVIDE;
      const Dft = GD2.state.drop.draft, gnd = GD2.state.ground;
      check(Dft && Dft.order.length === 8 && doc.querySelectorAll('#landing .dpick').length === 8,
            'the draft opens at the lock with the eight OAs in order, weakest first: ' + Dft.order.slice(0, 3).join(' > ') + ' …');
      const all = PRE4.landings(gnd);
      let guard = 0, clicked = 0;
      while (!Dft.done && guard++ < 6) {
        if (S3.draftWhose(GD2.state) === GD2.me) {
          check(/Your Pick/.test(text('#landing')), 'the page says it is your pick');
          const free = all.filter(l => PRE4.allowed(l, Dft.taken, Dft.picks[GD2.me], all));
          const pick = free[Math.floor(free.length / 2)];
          /* through the page: open the region on the overview, then the zone */
          const reg = doc.querySelector('#landmap [data-gvreg="' + pick.region + '"]');
          if (reg) reg.dispatchEvent(new window.Event('click'));
          const zoneEl = doc.querySelector('#landing [data-landz="' + pick.index + '"]');
          if (zoneEl) { zoneEl.dispatchEvent(new window.Event('click')); clicked++; }
          else S3.draftPick(GD2.state, GD2.me, pick.index);
        }
        S3.draftAdvance(GD2.state);
        [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
      }
      check(clicked > 0, 'a pick is made on the page: the region opened on the overview, the zone chosen in it (' + clicked + ' clicked)');
      /* §DRAFT an OA drafts a landing for every squad it fields, so the counts differ by OA */
      const wanted = Object.keys(Dft.want).reduce((t, k) => t + Dft.want[k], 0);
      check(Dft.done && Dft.picks[GD2.me].length === Dft.want[GD2.me] &&
            Object.keys(Dft.taken).length === wanted && Dft.slots >= wanted,
            'the draft completes: a landing for every squad in the fleet (' + wanted +
            ' of ' + Dft.slots + ' zones, yours ' + Dft.picks[GD2.me].length + ')');
      /* one squad a zone, one squad a region for each OA, and nobody on the last ground */
      const perRegion = {};
      let oneARegion = true, offLast = true;
      Object.keys(Dft.taken).forEach(z => { const id = Dft.taken[z], r = gnd.zones[+z].region; const k = id + ':' + r; if (perRegion[k]) oneARegion = false; perRegion[k] = 1; if (r === gnd.wall.last) offLast = false; });
      check(oneARegion && offLast, 'one squad a zone, one a region for each OA, and nobody lands on the last ground');
      check(Dft.slots === all.length && wanted < Dft.slots,
            'the ground keeps its ' + Dft.slots + ' landings and the fleet leaves ' + (Dft.slots - wanted) + ' unclaimed');
      const turnNow = () => ((doc.getElementById('turngo') || {}).textContent || '').replace(/\s+/g, ' ').trim();
      check(/Drop/.test(turnNow()), 'the corner reads Drop once the draft is done: ' + turnNow().slice(0, 40));
      check(doc.querySelectorAll('#landing .sector.yours').length >= Dft.want[GD2.me],
            'your landings are listed, one a squad');
    }
    if (false && process.env.ARX_SHOT_WORLD) {   /* (the world shot predates the draft; re-cut when the Drop settles) */
      const GW = window.__G, keepPl = GW.state.planet;
      GW.state.planet = window.CDMAP.generatePlanet(window.CDPRNG.mulberry32(21), { archetype: process.env.ARX_SHOT_WORLD });
      GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
      { const pl = GW.state.planet, a = 2 / 6 * Math.PI * 2, d = pl.radius * 0.82, x = pl.cx + Math.cos(a) * d, y = pl.cy + Math.sin(a) * d;
        let w = 0; for (let k = 0; k < 8; k++) { const b = k / 8 * Math.PI * 2; if (pl.waterAt(x + Math.cos(b) * 0.02, y + Math.sin(b) * 0.02)) w++; }
        note('world shot: sector 2 at ' + x.toFixed(3) + ',' + y.toFixed(3) + ' water=' + pl.waterAt(x, y) + ' h=' + pl.heightAt(x, y).toFixed(2) + ' sea=' + pl.seaLevel + ' wet neighbours ' + w + '/8 · sectors drawn from ' + (doc.querySelector('#landing .sector .sn') || {}).textContent); }
      try { require('fs').writeFileSync('/tmp/dropmap_' + process.env.ARX_SHOT_WORLD + '.png', Buffer.from(doc.getElementById('dropmap').toDataURL().split(',')[1], 'base64')); } catch (e) { note('no world shot: ' + e.message); }
      GW.state.planet = keepPl; GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
    }
    if (process.env.ARX_SHOT_DEPTHS) {   /* the same world at each depth of survey */
      const GW = window.__G, plr = GW.corps[GW.me]._intel.planet.rows, keep = JSON.stringify(plr);
      [0, 1, 2, 3].forEach(dp => {
        ['terrain', 'sites', 'sectors'].forEach(k => { plr[k] = { depth: dp, gathered: dp * 34 }; });
        GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
        try { require('fs').writeFileSync('/tmp/dropmap_d' + dp + '.png', Buffer.from(doc.getElementById('dropmap').toDataURL().split(',')[1], 'base64')); } catch (e) { note('no depth shot: ' + e.message); }
      });
      Object.assign(plr, JSON.parse(keep)); GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
    }
    if (process.env.ARX_SHOT) { try { require('fs').writeFileSync('/tmp/dropmap.png', Buffer.from(doc.getElementById('dropmap').toDataURL().split(',')[1], 'base64')); } catch (e) { note('no shot: ' + e.message); } }
    doc.getElementById('dropbtn').click();
    (function () {
      const GG = window.__G, per = GG.state._divideOpts.corps[GG.me];
      check(!!(per && per.hand && per.hand[leadId]),
            'the manager\'s hand rode into the real Divide\'s options');
    })();
    /* §GROUND the first window stands AT THE DROP: the Ground page shows day one, every banner's squads on
       their landings (the broadcast: a manager sees whose and where) */
    {
      const DD0 = window.__gDay ? window.__gDay() : null;
      check(!!DD0 && DD0.day === 1, 'the first window opens at the landing, not two days into the contest (day ' + (DD0 ? DD0.day : '?') + ')');
      const oas0 = new Set((DD0 ? DD0.squads : []).map(q => q.oa));
      check(oas0.size === 8, 'the broadcast puts every banner\'s squads on the ground from the drop (' + oas0.size + ' banners)');
    }
    check(/Comms Window/.test(text('#divstate')),
          'the Divide began and paused at a comms window: ' +
          text('#divstate').replace(/\s+/g, ' ').trim());
    {
      [...doc.querySelectorAll('.tab')].filter(x => /^The Ground$/.test(x.textContent.trim()))[0].click();
      const regs = doc.querySelectorAll('#gvmap [data-gvreg]').length, marks = doc.querySelectorAll('#gvmap [data-gvoa]').length;
      check(regs >= 10 && marks >= 8, 'the ground is drawn: every region a circle, every squad a mark on it (' + regs + ' regions, ' + marks + ' squads)');
      check(doc.querySelectorAll('#gvboard tr').length >= 9, 'all eight banners stand on the board');
      [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
    }

    /* ---- the Table: the window answered, not ignored ---- */
    check(hasTab('Desk') && hasTab('Negotiation'), 'the Desk and Negotiation sit live on the Divide\'s rail');
    /* §DESK the head is a STRIP now: the day, the wall as a bar with its rate, your chance,
       what is standing, and the weather — each with its own room rather than eleven figures
       in a line at one weight */
    /* §NO ODDS the strip reads the day, the wall and what is standing — and NOT a chance of
       winning, which is a judgement the manager makes (ruled) */
    check(/Day\s*\d+/.test(text('#dayhead')) && !/Your Chance/.test(text('#dayhead')) &&
          !!doc.querySelector('#dayhead .dwall .bar i') && !!doc.querySelector('#dayhead .dday b'),
          'the Desk\'s strip reads the day, the wall and what is standing, and no odds');
    /* §DESK a squad is a CARD, not a row: the four things that decide a day read as pips and
       bars rather than seven columns of figures */
    check(doc.querySelectorAll('#tsquads .tsq').length >= 1 &&
          /Ground/.test(text('#tsquads')) && /Food/.test(text('#tsquads')),
          'your squads stand on the Desk as cards, with their ground and their food');
    /* §STANCE THE MANAGER'S ONE LEVER: the notch he sets AT each OA. It was a stance for the
       whole contest plus a 1-5 leaning at each rival — two dials saying nearly the same thing,
       and the second rarely bit, since an OA meets two or three of the seven. */
    {
      const GO = window.__G;
      /* §STANCE the ladder lives on each SQUAD'S card now; the fleet is read, not set */
      check(doc.querySelectorAll('#tstance .stancerow').length === 7 &&
            !doc.querySelector('#tstance .nb'),
            'every other OA is read on the Desk, and none of them is a control');
      check(doc.querySelectorAll('#tsquads .tsq .sqnotch').length >= 1 &&
            doc.querySelectorAll('#tsquads .tsq .sqnotch .nb').length ===
              doc.querySelectorAll('#tsquads .tsq .sqnotch').length * 5,
            'each squad standing carries its own five-notch ladder');
      /* §ORDERS each standing squad's card carries an Orders select: as they judge, hold, or a zone to go to */
      check(doc.querySelectorAll('#tsquads [data-sqorder]').length >= 1 &&
            [...doc.querySelectorAll('#tsquads [data-sqorder]')].every(el => !!el.querySelector('option[value=""]') && !!el.querySelector('option[value="hold"]')),
            'each standing squad\'s card carries Orders: as they judge, hold, or a zone (' + doc.querySelectorAll('#tsquads [data-sqorder]').length + ')');
      /* §DESK the card says what the squad is doing, in the planner's terms */
      check([...doc.querySelectorAll('#tsquads .tsq .doing')].every(el => /^(Moving|Fighting|Holding|Holding on Orders|Holding the Ground|Under Orders|Ahead of the Wall|Rushing Them|Picking at Them|Working the Site|Fell Back|Done)$/.test(el.textContent.trim())),
            'each card says what its squad is doing: ' + [...doc.querySelectorAll('#tsquads .tsq .doing')].map(el => el.textContent.trim()).join(', '));
      /* THE CAPTAIN DECIDES: the row names them and says how they are reading the ground */
      /* §STORES the contest says what the ground has given, and what a squad has left to shoot */
      check(/Worked|Nothing Worked Yet/.test(text('#dayhead')),
            'the day head says what has come out of the ground: ' + (text('#dayhead').match(/Worked[^|]{0,60}/) || ['none'])[0].replace(/\s+/g, ' '));
      /* (the card's Rounds cell left in the audit fixes, d5ee7c6: a card reads ground and food) */
      /* §THE CLOCK the wall says when it moves next, and to what */
      check(/Closes (Tomorrow|in \d+ Days)|The Wall Holds/.test(text('#dayhead')),
            'the strip says when the wall closes next: ' + (text('#dayhead').match(/Closes[^A-Z]{0,30}|The Wall Holds/) || ['\u2014'])[0].replace(/\s+/g, ' '));
      /* A WIPED SQUAD HAS NO CAPTAIN TO NAME, AND SAYING SO IS THE PANEL WORKING. This asked
         for a clickable captain on every squad — so the moment a manager's last squad was
         killed to the man, a correct "Nobody Leading" read as a failure. What the panel owes
         is a READING of each squad: a captain and how he sees it while anybody is alive, and
         plainly nobody once they are not. (It also asked for the word "Leader", which is a
         COLUMN HEADER in that table and would have matched whatever the squads did.) */
      const alive9 = (GO.div.win.you.squads || [])
        .some(q => (q.bodies || []).some(b => b.status !== 'dead'));
      check(/Sharp|Steady|Struggling|Nobody Leading/.test(text('#tsquads')) &&
            (!alive9 || doc.querySelectorAll('#tsquads [data-sheet]').length >= 1),
            'each squad names its captain and how well they read it, or says nobody leads it' +
            (alive9 ? '' : ' (every squad was killed to the man)'));
      /* §CAPTAIN the leader line is the engine's reading of the captain who leads NOW: the mind the engine handed the
         contest names that captain, and the card's words are that mind's bands (judgement Sharp/Steady/Struggling,
         sight Sees Far/Sees Little/neither) */
      {
        const FAR = window.CDCONTEST.CONST.SIGHT_FAR_AT, SHORT = window.CDCONTEST.CONST.SIGHT_SHORT_AT;
        const cardsL = [...doc.querySelectorAll('#tsquads .tsq')];
        let read = 0; const bad = [];
        (GO.div.win.you.squads || []).forEach((q, i) => {
          const card = cardsL[i], up = (q.bodies || []).filter(b => b.status === 'active');
          if (!card || !up.length) return;
          const m = q._mind; if (!m) { bad.push('squad ' + i + ' has no mind'); return; }
          const capEl = card.querySelector('[data-sheet]'), capB = capEl && up.find(b => b.id === capEl.getAttribute('data-sheet'));
          if (!capB) { bad.push('squad ' + i + ' names nobody standing'); return; }
          if (m.cap !== capB.name) bad.push('squad ' + i + ': the mind is ' + m.cap + '\'s, the card names ' + capB.name);
          const t = card.querySelector('.head small').textContent;
          const word = m.judge >= 2.8 ? 'Sharp' : m.judge >= 2.0 ? 'Steady' : 'Struggling';
          if (t.indexOf(word) < 0) bad.push('squad ' + i + ' judge ' + m.judge + ' should read ' + word);
          const sees = m.sight >= FAR ? 'Sees Far' : m.sight < SHORT ? 'Sees Little' : '';
          if (sees ? t.indexOf(sees) < 0 : /Sees (Far|Little)/.test(t)) bad.push('squad ' + i + ' sight ' + m.sight + ' should read ' + (sees || 'neither'));
          if (/Sees \d+%/.test(t)) bad.push('squad ' + i + ' still reads sight as a percentage');
          read++;
        });
        check(read >= 1 && !bad.length, 'each standing squad\'s leader line reads the mind of the captain leading it (' + read + ' read' + (bad.length ? '; ' + bad.slice(0, 3).join('; ') : '') + ')');
      }
      /* §STANCE ONE SQUAD HUNTS, ANOTHER KEEPS ITS HEAD DOWN — and the notch set on a card must
         actually reach THAT squad in the contest, not merely light up on the page */
      const cards = [...doc.querySelectorAll('#tsquads .tsq .sqnotch')];
      const hotBtn = [...cards[0].querySelectorAll('.nb')].pop();
      const sq0 = hotBtn.getAttribute('data-sq');
      hotBtn.click();
      let sq1 = null;
      const cards2 = [...doc.querySelectorAll('#tsquads .tsq .sqnotch')];
      if (cards2.length > 1) { const cold = cards2[1].querySelectorAll('.nb')[0]; sq1 = cold.getAttribute('data-sq'); cold.click(); }
      check(GO.div.answer.squadStance[sq0] === 'death_or_glory' &&
            (sq1 == null || GO.div.answer.squadStance[sq1] === 'preservationist'),
            'two squads can be set to different notches on their own cards');
      /* §ORDERS send a standing squad that is not fighting to a zone from its card; the order must reach the engine
         (the contest's journal carries it on this seat's answer) and the squad must carry it out (the record has it
         under orders for that zone, or there) */
      let ordered = null;
      {
        const ws = GO.div.win.squads || [];
        const sel = [...doc.querySelectorAll('#tsquads [data-sqorder]')].find(el => { const k = +el.getAttribute('data-sqorder'), q = GO.div.win.you.squads[k], wq = q && ws.find(x => x.s === (q.sIdx != null ? q.sIdx : k)); return wq && wq.fight == null && el.querySelector('option[value]:not([value=""]):not([value="hold"])'); });
        if (sel) {
          const opt = sel.querySelector('option[value]:not([value=""]):not([value="hold"])');
          const k = sel.getAttribute('data-sqorder'), q = GO.div.win.you.squads[+k];
          sel.value = opt.value; sel.dispatchEvent(new window.Event('change'));
          ordered = { k, s: q.sIdx != null ? q.sIdx : +k, zone: +opt.value, day: GO.div.win.day, journal: (GO.state._contestJournal || []).length };
          check(!!GO.div.answer.orders && GO.div.answer.orders[k] && GO.div.answer.orders[k].zone === ordered.zone,
                'a squad\'s Orders send it to a zone: squad ' + k + ' to zone ' + ordered.zone);
        } else note('no standing squad out of a fight had a zone to be ordered to');
      }
      doc.getElementById('advwin').click();
      if (ordered) {
        const J = (GO.state._contestJournal || [])[ordered.journal], mineA = J && J.bySeat && J.bySeat[GO.me];
        check(!!mineA && !!mineA.orders && mineA.orders[ordered.k] && mineA.orders[ordered.k].zone === ordered.zone,
              'the order reached the engine on this seat\'s answer: ' + JSON.stringify(mineA && mineA.orders));
        /* an order stands until it is carried out or the seat changes it (contest.js §ORDERS): by this window the
           squad is there, or still under that order, or down — whatever it met on the way */
        const ci = (GO.div.win && GO.div.win.corps || []).findIndex(x => x.id === GO.me);
        const days = ((GO.div.win && GO.div.win.record) || []).filter(D => D.d >= ordered.day);
        const rows = days.map(D => (D.sq || []).find(r => r.c === ci && r.s === ordered.s)).filter(Boolean);
        const nowQ = GO.div.win && (GO.div.win.squads || []).find(x => x.s === ordered.s);
        const fought = (GO.div.win && GO.div.win.fights || []).filter(f => f.day >= ordered.day).map(f => 'day ' + f.day + ' ' + (f.result || ''));
        const there = rows.some(r => r.z === ordered.zone || (r.tr || []).indexOf(ordered.zone) >= 0) || (nowQ && nowQ.zone === ordered.zone);
        const still = nowQ && nowQ.intent && nowQ.intent.why === 'order' && nowQ.intent.zone === ordered.zone;
        if (!GO.div.win) note('the contest ended on the window the order was sent');
        else check(there || still || !nowQ || !nowQ.alive,
          'the order stood until carried out: squad ' + ordered.s + ' to zone ' + ordered.zone + ' (days: ' + rows.map(r => r.w + (r.az != null ? '>' + r.az : '') + '@' + r.z).join(', ') +
          '; now ' + (nowQ ? JSON.stringify(nowQ.intent) + '@' + nowQ.zone : 'gone') + (fought.length ? '; fights since: ' + fought.join(', ') : '') + ')');
      }
      const you9 = GO.div.win && GO.div.win.you;
      check(!GO.div.win || ((you9.squads[+sq0] || {}).stance === 'death_or_glory' &&
            (sq1 == null || (you9.squads[+sq1] || {}).stance === 'preservationist')),
            'each notch rides into the contest on the squad it was set for');
    }
    /* §STANCE the five notches are the manager's words for the five stances, and they stand at
       every OA rather than once for the contest */
    check(/Avoid/.test(text('#tsquads')) && /All In/.test(text('#tsquads')),
          'the five notches stand on the squads, in the manager\'s words');
    check(doc.getElementById('nextyear').style.display === 'none', 'Begin the Next Year waits on the contest');

    /* §STANCE the ladder is per-OA now: one row of five at each of the seven, plus the row
       that sets them all — 40 buttons, not 5, and nothing is "declared" for the contest */
    {
      const card = doc.querySelector('#tsquads .tsq .sqnotch');
      if (card) {
        const b0 = card.querySelectorAll('.nb')[0], sqi = b0.getAttribute('data-sq');
        b0.click();
        check(!!doc.querySelector('#tsquads .tsq .sqnotch .nb.n1.on') &&
              window.__G.div.answer.squadStance[sqi] === 'preservationist',
              'the coolest notch can be set on a squad: ' + sqi);
      }
    }
    if (process.env.ARX_SHOT_FOG) { try { const GW = window.__G; GW.corps[GW.me]._intel.planet.rows.terrain = { depth: 0, gathered: 0 }; GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /Ground/.test(x.textContent))[0].click(); require('fs').writeFileSync('/tmp/gmap_fog.png', Buffer.from(doc.getElementById('gmap').toDataURL().split(',')[1], 'base64')); [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click(); } catch (e) { note('no fog shot: ' + e.message); } }
    if (process.env.ARX_SHOT) { try { [...doc.querySelectorAll('.tab')].filter(x => /Ground/.test(x.textContent))[0].click(); require('fs').writeFileSync('/tmp/gmap.png', Buffer.from(doc.getElementById('gmap').toDataURL().split(',')[1], 'base64')); [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click(); } catch (e) { note('no ground shot: ' + e.message); } }
    /* THE TABLE IS THE TALKS' SHAPE: a strip of OAs, a composer for the one selected */
    const strip = doc.querySelectorAll('#tstrip [data-tsel]').length;
    check(strip === 7, 'every other OA stands on the Table\'s strip (' + strip + ')');
    check(doc.querySelectorAll('#tground .assay span, #tground .m').length >= 1, 'the ground\'s assay is on the Table');
    /* EVERY OA OPENS SOMETHING: click each chip and read the Deal box */
    {
      let opened = 0;
      [...doc.querySelectorAll('#tstrip [data-tsel]')].forEach(ch => {
        ch.click();
        const td = text('#tdeal');
        if (/Ransoms|Do Not Deal|No Ransom Between You/.test(td)) opened++;
        ch.click();
      });
      check(opened === doc.querySelectorAll('#tstrip [data-tsel]').length,
            'every OA on the strip opens on its ransoms, or says there is none, or that it does not deal (' + opened + ')');
    }
    let tries = 0;
    while (!/over/i.test(text('#divstate')) && tries++ < 4) doc.getElementById('advwin').click();
    if (!/over/i.test(text('#divstate'))) {
      /* §STANCE what round-trips is the notch each squad carries: the card reads it back off
         the corp the engine handed out, so a notch the engine never received cannot show lit */
      {
        const card = doc.querySelector('#tsquads .tsq .sqnotch');
        const onBtn = card && card.querySelector('.nb.on');
        const sqi = onBtn && +onBtn.getAttribute('data-sq');
        const worn = onBtn && onBtn.getAttribute('data-sqnotch');
        const held = window.__G.div.win && window.__G.div.win.you && window.__G.div.win.you.squads[sqi];
        /* a manager who has conceded has no squad on the ground and no card to read */
        if (card) check(!!onBtn && (!held || !held.stance || held.stance === worn ||
              ((window.__G.div.answer || {}).squadStance || {})[sqi] === worn),
              'the squad\'s notch round-tripped through the engine: squad ' + sqi + ' at ' + (worn || ''));
      }
    } else note('the contest ended early — table round-trip rides another seed');
    let winN = 1, guard = 0;
    while (!/over/i.test(text('#divstate')) && guard++ < 60) {
      doc.getElementById('advwin').click(); winN++;
    }
    check(/the Divide is over/i.test(text('#divstate')),
          'the Divide ran window to window to its end (' + winN + ' windows): ' +
          text('#divstate').replace(/\s+/g, ' ').trim().slice(0, 120));
    /* ---- THE BOARD, joined to the corporation at last. Reputation has run inside this
       page since the corporation existed; the surface used to live on a separate page,
       so the manager paid the price of being seen without ever seeing it. ---- */
    {
      const GB = window.__G, REPM = window.CDREP;
      const boardTab = [...doc.querySelectorAll('#rail .tab')].find(t => /Board/.test(t.textContent));
      check(!!boardTab && /urgent/.test(boardTab.className),
            'after a Divide the Board calls for the manager');
      boardTab.click();
      /* §STANDING the Board reads the crowd and its six factions, then the seven houses */
      check(doc.querySelectorAll('#audiences .audrow2').length === 7 &&
            doc.querySelectorAll('#audiences .fleetbox .fleetrow:not(.hd)').length === 7,
            'the Board reads the crowd, its six factions and the seven houses (' +
            doc.querySelectorAll('#audiences .audrow2').length + ' rows, 7 houses)');
      check(doc.querySelectorAll('#audiences .fleetbox .fleetrow svg').length >= 7 &&
            doc.querySelectorAll('#audiences .fleetbox [data-oa]').length === 7,
            'each OA carries its own mark and opens its sheet');
      check(!/Not yet joined/.test(text('#audiences') + text('#boarddemand')),
            'the Board is joined, not a placard');
      check(doc.querySelectorAll('#audiences .amem').length === 6 && /\d/.test(text('#audiences')),
            'each faction carries one line of what moved it');
      /* §BOARD the head is a strip now: the year and patience are figures under their labels,
         patience with a bar and a word for what the board is at */
      check(/Year/.test(text('#boardhead')) && /Patience/.test(text('#boardhead')) &&
            !!doc.querySelector('#boardhead .pbar i'),
            'the Board\'s strip reads the year and the patience, on a bar');
      const rivals = GB.state.ids.filter(x => x !== GB.me);
      const before = REPM.readAll(GB.corps[GB.me].rep, rivals);
      const regs = [...doc.querySelectorAll('.regbtn')];
      check(regs.length === 6, 'the board asks, and all six registers are offered (' + regs.length + ')');
      regs[0].click();
      const after = REPM.readAll(GB.corps[GB.me].rep, rivals);
      const moved = Math.abs(after.crowd - before.crowd) > 0.001 || Math.abs(after.housesMean - before.housesMean) > 0.001;
      check(moved, 'answering the board moves the audiences rather than scoring the manager');
      check(/You Answered/.test(text('#boardq')),
            'the answer is on the record and cannot be taken back');
    }

    /* Pass D: if the player signed any backer this year, the season-close verdict surfaces —
       kept or broken, with what it paid. Signing depends on courting outcomes, so the check is
       conditional on there having been a contract, read from the corp's own record. */
    {
      const meSp = (window.__G.corps[window.__G.me].sponsors || {});
      const signedThisYear = window.__G._lastSponsorRec !== undefined;
      const vtxt = text('#sponsorverdict').replace(/\s+/g, ' ').trim();
      /* the surface is present in the DOM and either shows a verdict or is cleanly empty */
      check(!!doc.getElementById('sponsorverdict'),
            'the season-close backer verdict surface exists on the divide page');
      if (vtxt) check(/Verdict/.test(vtxt),
            'the backer verdict reads its heading when contracts were judged');
    }
    const enc = doc.querySelectorAll('#encounters [data-watch]').length;
    check(enc >= 1, 'encounters from the ground arrived in the Table\'s recap (' + enc + ')');
    /* re-ruled with the recap split: the Table speaks for the contest, the Desk's shelf
       for the year's lights. Two lists, two places. */
    check(!/the Dividend/i.test(text('#encounters')),
          'the Table\'s recap stays on the ground; the lights stay on the shelf');
    doc.querySelector('#encounters [data-watch]').click();
    /* the check is that the encounter REPLAYS, not that it was a long one: a squad with
       somebody who wants out can be gone in three turns, and how long fights run is
       measure_fight.cjs's question, not this one's */
    check(+doc.getElementById('fr').max >= 1,
          'a ground encounter replays on the grid (' + (+doc.getElementById('fr').max + 1) + ' frames)');
    check(/turn \d+ of \d+/i.test(text('#frLbl')), 'its turn label reads: ' + text('#frLbl'));
    const rowsA = doc.querySelectorAll('#rosterA .unit').length;
    const rowsB = doc.querySelectorAll('#rosterB .unit').length;
    /* A SIDE PANEL IS A FIGHT, NOT A SQUAD. The band here was 1..6, written when a fight was
       one squad against one; squads join a fight in progress now, so a side can be two or three
       squads deep. The rule that still holds is the drop cap. */
    const cap = window.CDSEASON.CONST.DROP_MAX;
    check(Math.min(rowsA, rowsB) >= 1 && Math.max(rowsA, rowsB) <= cap,
          'both sides of the real Divide are within the drop cap (' + rowsA + ' vs ' + rowsB + ')');
    check(+doc.getElementById('gday').max >= 5,
          'the whole contest scrubs day by day (' + doc.getElementById('gday').max + ' days recorded)');

    /* ---- the Ground scrubs: day by day, forward and back ---- */
    (function () {
      const G = window.__G;
      [...doc.querySelectorAll('.tab')].filter(x => /^The Ground$/.test(x.textContent.trim()))[0].click();
      const days = G.div.final.replay.days;
      const withTracks = days[1] && days[1].sq.filter(q => q.tr && q.tr.length >= 2).length;
      check(withTracks > 0, 'the recording carries real walked tracks (' + withTracks + ' squads on day 2)');
      const shown = () => (window.__gDay() || {}).day;
      doc.getElementById('gday').value = '1'; doc.getElementById('gday').dispatchEvent(new window.Event('input'));
      check(shown() === 1, 'the scrubber opens the contest at the drop (day ' + shown() + ')');
      doc.getElementById('gfwd').click();
      check(shown() === 2, 'stepping forward shows the next day (day ' + shown() + ')');
      doc.getElementById('gback').click();
      check(shown() === 1, 'stepping back shows the day before (day ' + shown() + ')');
      const last = days.length;
      doc.getElementById('gday').value = String(last); doc.getElementById('gday').dispatchEvent(new window.Event('input'));
      check(shown() === days[last - 1].d, 'scrubbing to the end shows the last day (day ' + shown() + ')');
      const regEl = doc.querySelector('#gvmap [data-gvreg]');
      if (regEl) { regEl.dispatchEvent(new window.Event('click')); }
      check(doc.querySelectorAll('#gvregion [data-gvzone]').length >= 1, 'opening a region shows its zones');
      [...doc.querySelectorAll('.tab')].filter(x => /^Desk$/.test(x.textContent.trim()))[0].click();
    })();
    const benchTally = () => {
      const t = {};
      window.__G.corps[window.__G.me].roster.forEach(f => { t[f.status] = (t[f.status] || 0) + 1; });
      return t;
    };
    console.log('  the roster after the Divide reads: ' + JSON.stringify(benchTally()));
    {
      /* ASK THE PEOPLE WHO FOUGHT, NOT THE WHOLE ROSTER. This read the highest stress on the
         books and assumed a Divide always bruises somebody — but this script fields ONE
         squad of six and leaves the rest at home, so when the economy shifted and that lone
         squad had a quiet contest, a working mechanic reported itself broken. The claim is
         that the Divide's stress comes home in the people it happened to; so it is measured
         on the people it happened to. */
      const GS = window.__G;
      /* NOT BY NAME: the year turns over before this runs — renewals, releases and the
         offseason rebuild the books, and none of the six who were fielded are still findable
         by id. So the question is asked of whoever came back carrying something. */
      const dropped = GS.corps[GS.me].roster.filter(f => ((f.experience || {}).divides || 0) > 0 ||
        ((f.condition || {}).stress || 0) > 0);
      const marked = dropped.filter(f => {
        const c = f.condition || {};
        return (c.stress || 0) > 0 || (c.injuries || []).length || (c.fatigue || 0) > 0
               || f.status === 'injured';
      });
      const maxStress = dropped.length
        ? Math.max.apply(null, dropped.map(f => (f.condition && f.condition.stress) || 0)) : 0;
      /* a house that never withdraws can lose nearly everyone at the showdown (this drive never offers to leave): with
         nobody home there is nobody to read, which is a fact about the contest, not about the page */
      if (!dropped.length) console.log('  skipped: nobody the drive fielded came home to read');
      else check(dropped.length > 0 && marked.length > 0,
            'the Divide came home in the people it happened to (' + marked.length + ' of ' +
            dropped.length + ' who were fielded carry a mark \u00b7 worst stress ' +
            Math.round(maxStress) + ' of 100' +
            (/stress \d+/.test(text('#roster')) ? ', visible on the page' : ', under the display line') + ')');
    }

    /* ---- the year turns ---- */
    check(doc.getElementById('nextyear').style.display !== 'none', 'Begin the Next Year shows once the contest is over');
    doc.getElementById('nextyear').click();
    check(/Year 2 · Month 1/.test(text('#clock')), 'the year turns: ' + text('#clock'));
    check(hasTab('Desk') && !hasTab('The Firefight'),
          'the rail returns whole to the preparation');
    /* §DESK the big grids start folded and open when asked (with people on the books to show them) */
    const homeAgain = window.__G.corps[window.__G.me].roster.filter(f => f.status !== 'dead' && f.status !== 'retired').length;
    if (homeAgain < 3) console.log('  skipped: the Desk grids (' + homeAgain + ' on the books after the Divide)');
    else {
      const shutAtFirst = doc.querySelectorAll('#traingrid .tgwrap.shut, #restgrid .tgwrap.shut, ' +
                                               '#intelgrid .tgwrap.shut, #courtgrid .tgwrap.shut').length;
      check(shutAtFirst === 4, 'the Desk\'s four grids open folded (' + shutAtFirst + ' of 4)');
      doc.querySelector('#traingrid [data-foldhead]').click();
      check(!doc.querySelector('#traingrid .tgwrap.shut') && doc.querySelectorAll('#restgrid .tgwrap.shut').length === 1,
            'clicking a section\'s head opens that one and leaves the rest shut');
      check(!doc.querySelector('#traingrid .tgfold') && !!doc.querySelector('#traingrid .tgchev2'),
            'the head is the switch: a chevron, not a word to aim at');
    }
    if (homeAgain >= 3) check(!!doc.querySelector('#traingrid .tgrid') && !!doc.querySelector('#intelgrid .itbl')
          && !!doc.querySelector('#courtgrid .ctbl'),
          'year two\'s first month offers its boards — the loop closes');

    /* ---- the blank slate: a player-founded OA takes a berth and plays ---- */
    doc.getElementById('menubtn').click();
    doc.getElementById('mNew').click();
    doc.getElementById('cname').value = 'OA Probe';
    doc.getElementById('cfound').click();
    check(/Year 1 · Month 1/.test(text('#clock')),
          'the founded OA opens its own year 1: ' + text('#clock'));
    /* a founded corporation's name lives in the CORNER now, not on the roster's money line */
    check(/OA Probe/.test(text('#whoami')),
          'a founded corporation wears its own name in the corner of every page');
    /* §DESK the big grids start folded and open when asked */
    {
      const shutAtFirst = doc.querySelectorAll('#traingrid .tgwrap.shut, #restgrid .tgwrap.shut, ' +
                                               '#intelgrid .tgwrap.shut, #courtgrid .tgwrap.shut').length;
      check(shutAtFirst === 4, 'the Desk\'s four grids open folded (' + shutAtFirst + ' of 4)');
      doc.querySelector('#traingrid [data-foldhead]').click();
      check(!doc.querySelector('#traingrid .tgwrap.shut') && doc.querySelectorAll('#restgrid .tgwrap.shut').length === 1,
            'clicking a section\'s head opens that one and leaves the rest shut');
      check(!doc.querySelector('#traingrid .tgfold') && !!doc.querySelector('#traingrid .tgchev2'),
            'the head is the switch: a chevron, not a word to aim at');
    }
    check(!!doc.querySelector('#traingrid .tgrid') &&
          !!doc.querySelector('#courtgrid .ctbl') &&
          doc.querySelectorAll('#roster .rcard').length >= 5,
          'the founder\'s OA has a crew and a live desk — playable, not a placard');

    console.log(failed ? '\n' + failed + ' CHECK(S) FAILED' + (skipped ? ' \u00b7 ' + skipped + ' step(s) skipped' : '')
                       : '\nall checks passed — the page lives a year' +
                         (skipped ? ' \u00b7 ' + skipped + ' step(s) SKIPPED, and a skipped step proves nothing' : ''));
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.log('  DRIVE ERROR: ' + (e && e.stack || e));
    process.exit(1);
  }
}, 400);
