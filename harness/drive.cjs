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
                              url: 'http://opesarx.test/' });   /* a url so localStorage lives */
const { window } = dom;
const doc = window.document;

let failed = 0;
const check = (ok, what) => { console.log((ok ? '  ok    ' : '  FAIL  ') + what); if (!ok) failed++; };
const text = (sel) => (doc.querySelector(sel) ? doc.querySelector(sel).textContent : '');
window.addEventListener('error', (e) => { console.log('  PAGE ERROR: ' + e.message); failed++; });

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
const bidHigh = (n) => {
  const btns = doc.querySelectorAll('#rostmarket [data-bid]');
  for (let i = 0; i < Math.min(n, btns.length); i++) {
    const fid = btns[i].getAttribute('data-bid');
    const inp = doc.querySelector('#rostmarket input.pcbid[data-f="' + fid + '"]');
    inp.value = String(Math.round(+inp.value * 1.7));
    btns[i].click();
  }
};
const openRoster = () => [...doc.querySelectorAll('.tab')].filter(x => /Roster/.test(x.textContent))[0].click();

setTimeout(() => {
  const renderDeskIfAny = () => { try { window.__G && doc.getElementById('endmonth') && window.eval('renderDesk()'); } catch (e) {} };
  try {
    /* ---- the shell: menu first, then the founding ---- */
    check(loadErrors === 0, 'the page loads without a single error (' + loadErrors + ')');
    check(doc.getElementById('menu').style.display !== 'none',
          'the game opens on the menu, not mid-cockpit');
    doc.getElementById('mNew').click();
    check(doc.getElementById('setup').style.display !== 'none' &&
          doc.querySelectorAll('#oacards .oacard').length === 9,
          'the setup offers all eight OAs and the ninth card: found your own');
    /* they are Opes Arx — OAs, megacorporations — and never "houses" (ruled): the founding
       screen was the last surface still saying so, and the last still naming them in plain
       text while every other surface wore their colours and marks. */
    check(/Sealed/.test(text('#oacards')),
          'the sealed OA says so on its card');
    check(doc.querySelectorAll('#oacards .oacard svg').length >= 8,
          'every founding card wears its OA\'s mark');
    check(!/\bhouse\b/i.test(text('#oacards')),
          'the founding screen calls them OAs, never houses');
    doc.getElementById('seed').value = 'corp-1';
    doc.querySelector('#oacards [data-oa="knights_star"]').click();
    check(doc.getElementById('setup').style.display === 'none',
          'choosing a house starts the game');
    check(!!window.CDSEASON && !!window.CDDIVIDE && !!window.CDTACTICAL,
          'all engine modules are live in the page');
    check(/Year 1 · Month 1/.test(text('#clock')), 'the clock opens the year: ' + text('#clock'));
    const rosterStart = doc.querySelectorAll('#roster .rcard').length;
    check(rosterStart >= 16, 'the roster page shows a founding roster (' + rosterStart + ' rows)');
    check(/Treasury/.test(text('#money')), 'the treasury is on the roster page');
    /* EVERY VERB HAS ITS OWN SECTION NOW. Training and recovery are grids, intel and
       courting are painted boards — so the old 0-to-3 button rows are empty in an ordinary
       prep month, and that is the point rather than a hole. What the desk must offer is the
       four sections. */
    check(!!doc.querySelector('#traingrid .tgrid') && !!doc.querySelector('#restgrid .tgrid')
          && !!doc.querySelector('#intelgrid .itbl') && !!doc.querySelector('#courtgrid .ctbl'),
          'the desk offers all four verbs as their own boards: drill, recovery, intel, courting');
    check(!/0\s*1\s*2\s*3/.test(text('#verbs')),
          'and the retired 0-to-3 rest row is gone from the top of the desk');
    check(/Focus Spent \d of 8/.test(text('#focusline')),
          'the focus board is prefilled by the corp\'s own judgement: ' + text('#focusline').slice(0, 40));
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
    check(/^Focus Spent 0 of 8/.test(text('#focusline').trim()),
          'clearing the verbs frees the whole budget: ' + text('#focusline').trim());

    /* ---- THE TRAINING GRID: paint a column and watch that one stat outgrow the rest ---- */
    check(!!doc.querySelector('#traingrid .tgrid'),
          'the training grid stands on the desk, no dropdowns');
    const meC = window.__G.corps[window.__G.me];
    const aliveOf = () => meC.roster.filter(f => f.status !== 'dead' && f.status !== 'retired');
    const mean = k => aliveOf().reduce((s, f) => s + f.stats[k], 0) / aliveOf().length;
    /* the grid's columns are aim, then the mind stats, then the body stats — index by that */
    const gridStats = ['aim'].concat(window.CDSEASON.CONST.MIND)
                             .concat(window.CDSEASON.CONST.BODY || ['grit', 'reflex']);
    const colOf = id => [...doc.querySelectorAll('#traingrid tr:first-child th')][1 + gridStats.indexOf(id)];
    colOf('tactics').querySelectorAll('.pip')[2].click();     // paint tactics column to 3
    check(/^Focus Spent 3 of 8/.test(text('#focusline').trim()),
          'painting a column to 3 pips spends 3: ' + text('#focusline').trim());
    const tac0 = mean('tactics'), res0 = mean('resolve');
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
    check(/Month 1/.test(text('#brief')) && /Waiting on You/.test(text('#brief')),
          'the brief names the month and what waits');
    /* THE YEAR LINE stands left of every preparation page: twelve stops, the current lit */
    check(doc.body.classList.contains('yearline') && doc.querySelectorAll('#yearline .ystop').length === 12 &&
          doc.querySelector('#yearline .ystop.now .yn').textContent.indexOf('M1') === 0 && /In 11/.test(text('#yearline')),
          'the year line shows twelve stops with the current lit and the Divide eleven off: ' + text('#yearline .ystop.now').replace(/\s+/g, ' ').trim().slice(0, 60));
    check(/Waiting/.test(doc.getElementById('endmonth').textContent) || /End the Month/.test(doc.getElementById('endmonth').textContent),
          'End the Month counts what waits: ' + doc.getElementById('endmonth').textContent);
    doc.getElementById('endmonth').click();
    check(doc.querySelector('.page[data-tab="recap"]').classList.contains('on') && /Month 1/.test(text('#recaphead')) && /Next/.test(text('#recaphead')),
          'ending the month stands the recap up: ' + text('#recaphead').replace(/\s+/g, ' ').trim().slice(0, 70));
    check(/Money/.test(text('#recapbody')) && /Standing/.test(text('#recapbody')) && /Training/.test(text('#recapbody')),
          'the recap reads the month\'s work, money, people, training, standing');
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
      const secs = [...doc.querySelectorAll('#mktledger .msec .nm')].map(x => x.textContent);
      check(secs.length >= 5 && secs[0] === 'Carbines',
            'the shelf opens on what most hands carry: ' + secs.slice(0, 4).join(', '));
      check(secs.indexOf('Anti-Materiel') > secs.indexOf('Carbines'),
            'and the exotica sit at the bottom, not the top');
      check(!/Kit Cap/.test(text('#mktsum')) && /\u20a1/.test(text('#mktsum')),
            'the summary carries the treasury in credits; the kit cap has gone to the Squads');
      /* THE PLANET HAS GROUND: planets.json rides in the bundle now, so the browser's planet
         carries a composition like node's does */
      check((window.__G.state.planet.composition || []).length >= 2,
            'the planet generated with a composition in the browser (' +
            (window.__G.state.planet.composition || []).length + ' resources)');
      /* THE CARD READS OUT: every demand named, the priority starred, the holds barred */
      [...doc.querySelectorAll('.tab')].filter(x => /Board/.test(x.textContent))[0].click();
      const cardRows = doc.querySelectorAll('#boarddemand .cardrow:not(.standing)').length;
      const rep0 = window.__G.corps[window.__G.me].rep;
      check(cardRows === rep0.goal.demands.length && cardRows >= 3,
            'the Board names every demand on the card (' + cardRows + '): ' +
            [...doc.querySelectorAll('#boarddemand .cardrow:not(.standing) .dw')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      check(doc.querySelectorAll('#boarddemand .cardrow.pri').length === 1, 'one demand is starred as the priority');
      check(doc.querySelectorAll('#boarddemand .cardrow.standing').length === 2, 'the two standing demands stand under it');
      check(doc.querySelectorAll('#boardholds .holdrow').length === 4, 'the four holds are barred');
      [...doc.querySelectorAll('.tab')].filter(x => /Squads/.test(x.textContent))[0].click();
      check(/Kit Cap|of .*Cap/.test(text('#planstate')), 'the Squads plan line carries the kit cap: ' + text('#planstate').trim());
      const focusBefore = text('#focusline');
      const t0 = meM.account.treasury;
      const id = doc.querySelector('#mktledger .mrow').getAttribute('data-mopen');
      const held0 = (meM.armoury || {})[id] || 0;
      const add = () => doc.querySelector('#mktledger .mrow [data-madd]').click();
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
      check(text('#focusline') === focusBefore,
            'buying kit costs no focus \u2014 shopping is not attention');
      doc.querySelector('#mktledger .mrow').click();
      const panel = text('#mktledger .mpanel');
      check(/Type/.test(panel) && /Band/.test(panel) && !/legality/i.test(panel),
            'the panel names what a piece is, without repeating the tag on the row');
      /* the flavour line is a SENTENCE and keeps sentence case; what must be capitalised is
         every label and value the shelf itself writes */
      check(/Band [A-Z]/.test(panel) && /Family [A-Z]/.test(panel) && /Type [A-Z]/.test(panel) &&
            (!/Traits/.test(panel) || /Traits: [A-Z]/.test(panel)),
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
      check(doc.querySelectorAll('#tradestrip .oachip2').length === 7,
            'every other OA can be dealt with, in its own colour and mark');
      const themChip = doc.querySelector('#tradestrip .oachip2');
      const themId = themChip.getAttribute('data-toa');
      themChip.click();
      /* THE NEGOTIATION IN TWO FACING COLUMNS: your terms, their terms, every kind in one
         table with a filter; credits typed, not clicked in lumps; the contract beneath */
      const giveCol = () => doc.querySelectorAll('#negwrap .negcol')[0];
      const getCol = () => doc.querySelectorAll('#negwrap .negcol')[1];
      check(giveCol().querySelectorAll('tr.pick').length > 5, 'your side lists what you can put up, with a price each');
      check(/Worth/.test(giveCol().textContent) && /Wage/.test(giveCol().textContent),
            'a body\'s price is its worth less its wage, said on the row');
      giveCol().querySelector('[data-tcat="intel"]').click();
      check(!new RegExp(GT.corps[themId].profile.name).test(giveCol().textContent),
            'the dossier on the house across the table is not for sale to them');
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
              'the other house\'s treasury is not on the page; the dossier\'s word for it is');
        doc.querySelector('#negwrap .contract [data-tdrop]').click();
        check(/Nothing Yet/.test(doc.querySelectorAll('#negwrap .contract .negcols > div')[0].textContent),
              'the cross takes it off the contract');
      }
      /* buy one of theirs, over the odds, and watch the people actually move */
      const mineBefore = GT.corps[GT.me].roster.length, theirsBefore = GT.corps[themId].roster.length;
      /* the same two bodies the old check traded — your second by roster order for their
         first — so the training arithmetic downstream reads the same roster it always did */
      giveCol().querySelector('tr.pick[data-tid="unit:' + GT.corps[GT.me].roster[1].id + '"]').click();
      getCol().querySelector('tr.pick[data-tid="unit:' + GT.corps[themId].roster[0].id + '"]').click();
      const wantId = TR.netOf(GT.corps[themId].roster[0]);
      check(doc.querySelectorAll('#negwrap .contract tr:not(.tot):not(.none)').length >= 2, 'both contributions stand on the contract');
      check(/They Would|Short by|Would Not/.test(text('#negwrap')), 'the pressure bar reads a verdict: ' + (text('#negwrap').match(/(They Would[^₡]*|Short by ₡[\d,]+|They Would Not Entertain This)/) || [''])[0].trim());
      doc.getElementById('tput').click();
      const moved = GT.corps[GT.me].roster.length - mineBefore;
      check(moved === 0 && GT.corps[themId].roster.length === theirsBefore,
            'a struck deal moves the bodies between rosters, one for one (' + mineBefore + ' stays ' +
            GT.corps[GT.me].roster.length + ')'); void wantId;
      const bought = GT.corps[GT.me].roster[GT.corps[GT.me].roster.length - 1];
      check(!!bought.contract && bought.contract.salary > 0,
            'the contract travelled with them, salary and all');
      check(GT.corps[GT.me].roster.indexOf(bought) >= 0,
            'the body is on your roster now, not merely copied');
      /* THE STANDS SEE A TRANSFER (ruled): your own supporters mind losing somebody in
         proportion to their fame, and the selling side's fans warm to whoever took them. */
      {
        const REPM = window.CDREP, seller = GT.corps[themId];
        const ownBefore = REPM.standing(seller.rep, 'own');
        const fansBefore = REPM.standing(seller.rep, 'rival', GT.me);
        const star = seller.roster.slice().sort((a, b) => (b.fame || 0) - (a.fame || 0))[0];
        const mates = seller.roster.filter(f => f !== star).slice(0, 3).map(f => f.loyalty);
        window.CDTRADE.execute(seller, GT.corps[GT.me], { units: [star.id] }, {}, {});
        check(REPM.standing(seller.rep, 'own') < ownBefore,
              'selling somebody costs you with your own people');
        check(REPM.standing(seller.rep, 'rival', GT.me) > fansBefore,
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
    const dT = mean('tactics') - tac0, dR = mean('resolve') - res0;
    check(dT > dR + 0.2,
          'the painted column outgrew the rest: tactics +' + dT.toFixed(2) +
          ' vs resolve +' + dR.toFixed(2));

    /* ---- the scalpel: one hand's one cell moves that hand most, beyond the column's reach ---- */
    resetGrid();
    const alive = aliveOf();
    const subject = alive.find(f => typeof f.potential === 'number' &&
                                    f.stats.tactics < f.potential - 40) || alive[0];
    const subjIdx = alive.indexOf(subject);
    /* A HAND'S STATS FOLD NOW. The corner and the columns are always there — they are what
       a manager reaches for most — but the narrow work lives behind a chevron, so open the
       hand first, exactly as somebody playing would. */
    const hand = doc.querySelector('#traingrid [data-tgopen="' + subject.id + '"]');
    check(!!hand && /tghand/.test(hand.className),
          'the whole line opens a hand, not just the triangle');
    /* and painting a hand's own pips must not open it: the two targets share a row but
       never a click */
    const rowPips = hand.querySelectorAll('.tgpips .pip');
    rowPips[0].click();
    check(!doc.querySelector('#traingrid [data-tgopen="' + subject.id + '"]')
              .nextElementSibling.className.match(/tgpanel/),
          'painting a hand\'s row pips does not open the hand under them');
    /* clear it again: the pips re-render, so the pip to click is a fresh one, and leaving
       it painted would spend focus the checks below are counting */
    doc.querySelector('#traingrid [data-tgopen="' + subject.id + '"]')
       .querySelectorAll('.tgpips .pip')[0].click();
    doc.querySelector('#traingrid [data-tgopen="' + subject.id + '"]').click();
    /* a closed hand is one thin line now; the stats live in the panel that follows it, and
       the panel carries the stat names in their colours */
    /* the grid re-renders on every paint, so the element clicked a moment ago is detached:
       the panel has to be looked up FRESH or the check reads a ghost of the old DOM */
    const panel = doc.querySelector('#traingrid [data-tgopen="' + subject.id + '"]').nextElementSibling;
    check(panel && /tgpanel/.test(panel.className) &&
          panel.querySelectorAll('.tglabel').length === gridStats.length,
          'the open panel names every stat, in its own colour');
    const cellTd = panel.querySelectorAll('td')[gridStats.indexOf('tactics')];
    cellTd.querySelectorAll('.pip')[2].click();               // subject's tactics cell to 3
    check(/^Focus Spent 3 of 8/.test(text('#focusline').trim()),
          'the scalpel paints one cell to 3: ' + text('#focusline').trim());
    const sTac0 = subject.stats.tactics;
    endMonth();
    check(subject.stats.tactics - sTac0 > dT,
          'the scalpel bit deeper than the column: ' + subject.name + ' tactics +' +
          (subject.stats.tactics - sTac0).toFixed(2) + ' vs the column\'s +' + dT.toFixed(2));


    /* ---- the fill-to-cap-then-remove path that broke every mockup, now in the real DOM ---- */
    resetGrid();
    const corner = () => doc.querySelectorAll('#traingrid th.rn .pip');
    corner()[2].click();                                      // corner to 3
    check(/^Focus Spent 3 of 8/.test(text('#focusline').trim()), 'corner paints to 3: ' + text('#focusline').trim());
    corner()[2].click();                                      // step down to 2
    corner()[1].click();                                      // to 1
    corner()[0].click();                                      // to 0
    check(/^Focus Spent 0 of 8/.test(text('#focusline').trim()),
          'stepping the corner back down to zero always works: ' + text('.tgbudget').trim());
    resetGrid();
    check(hasTab('Desk') && !hasTab('The Firefight'),
          'the preparation\'s rail stands alone — the Divide\'s tabs are not on it at all');

    /* ---- months 1-2 were spent by the training and boost checks above ---- */
    check(/Month 3/.test(text('#clock')), 'two months spent: ' + text('#clock'));

    /* ---- the save is the game: save, step on, load, and be exactly where you were ---- */
    const rosterAtSave = doc.querySelectorAll('#roster .rcard').length;
    doc.getElementById('savebtn').click();
    check(/saved: Y1 M3/.test(text('#clock')),
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
      /* the broad paints are still there — the corner and a whole column */
      check(doc.querySelectorAll('#restgrid th.rn .pip').length === 3,
            'the whole roster can be rested in one paint');
      const stressCol = [...doc.querySelectorAll('#restgrid tr:first-child th')][2];
      const stressed = aliveOf().find(f => f.condition) || aliveOf()[0];
      stressed.condition.stress = 60;
      renderDeskIfAny();
      stressCol.querySelectorAll('.pip')[2].click();
      check(/^Focus Spent 3 of 8/.test(text('#focusline').trim()),
            'a column of recovery spends like a column of drill: ' + text('#focusline').trim());
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
    doc.querySelectorAll('#rostmarket [data-sign]')[0].click();
    doc.querySelectorAll('#rostmarket [data-sign]')[0].click();
    check(doc.querySelectorAll('#rostmarket .pcsigning').length >= 2, 'two marked to sign, no bidding');
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
    check(/the Dividend/.test(text('#desklights')),
          'the Dividend surfaces on the Desk\'s shelf, not a month log');
    check(doc.getElementById('deskligwrap').style.display !== 'none',
          'the lights stand on the Desk\'s shelf from month 7');
    /* THE LIGHTS LIVE ON THE DESK'S SHELF, and "Since the Last Window" is the CONTEST's
       recap — it used to carry the summer's exhibition into the Divide, which is why the
       Table opened on a list of fights that had nothing to do with the ground. */
    const lightRows = doc.querySelectorAll('#desklights [data-watchd]').length;
    check(lightRows >= 1 && /the Dividend/.test(text('#desklights')),
          'the show-matches stand on the Desk\'s shelf for watching (' + lightRows + ' lights)');
    check(!/the Dividend/.test(text('#encounters')),
          'the contest\'s recap carries only the ground, not the summer\'s exhibition');
    doc.querySelector('#desklights [data-watchd]').click();
    check(+doc.getElementById('fr').max > 5 && /turn \d+ of \d+/.test(text('#frLbl')),
          'a show-match replays on the grid (' + (+doc.getElementById('fr').max + 1) +
          ' frames \u00b7 ' + text('#frLbl') + ')');
    check(/Purse|Drawn/.test(text('#result')) && /Paid at the Whistle/.test(text('#settle')),
          'the lights\' result reads as an exhibition: ' +
          text('#result').replace(/\s+/g, ' ').trim().slice(0, 90));
    check(!doc.getElementById('lock') && !doc.getElementById('run') && !doc.getElementById('lockinfo'),
          'the scrim is gone entirely: no lock, no run — the Firefight only replays');
    check(!!doc.getElementById('fightback') && (window.__G._fightBack === 'desk'),
          'the room knows its way back to the Desk during the year');
    openRoster();
    check(/Bastille/.test(text('#rostmarket')) && /Conscript/.test(text('#rostmarket')),
          'months 5-6 show the Bastille intake for Conscripts, not a bidding table');
    check(/Earn Release/.test(text('#rostmarket')),
          'every Conscript\'s freedom clause is on the sheet');
    /* the intel painted in M1 has landed by now (M6); the gather section is still open, so open
       its dossier through the real click target and confirm it reads on the page */
    (function () {
      const GI = window.__G;
      deskTab().click();
      const link = [...doc.querySelectorAll('#intelgrid .idoss')]
                     .find(d => d.getAttribute('data-doss') === intelWatched);
      check(!!link, 'the watched rival is on the intel section for its dossier to open');
      if (link) {
        link.click();
        check(!!doc.querySelector('#dossier .dtbl') && /\bmo\b|This month/.test(text('#dossier')),
              'the dossier reads on the page, honestly dated');
        GI._dossier = null;
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
        check(/Units to Play For/.test(dt) && /Rations Burn/.test(dt) && /Read at the Drop/.test(dt) && /Richness \d+%/.test(dt),
              'the planet dossier reads as figures: units in the ground, ration burn, richness, what the ring unlocks');
        check(!/_/.test(dt) && !/Partial|partial/.test(dt) && /Full/.test(dt),
              'the planet dossier has no snake_case and grades Blank / Sparse / Read / Full');
        GI._dossier = null;
      } else check(false, 'the planet stands on the intel section for its dossier to open');
      pl.rows = JSON.parse(keep);    /* the reading was a look, not a purchase */
      openRoster();
    })();
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
      check(/Wants a Raise/.test(text('#brief')) && /Defaults to Refuse/.test(text('#brief')), 'the agenda lists an open event with its default');
      const sal0 = roster[0].contract.salary;
      doc.querySelector('#events [data-ev="raise-test"][data-opt="grant"]').click();
      check(roster[0].contract.salary === sal0 + 500 && /Got the Raise/.test(text('#events')), 'granting the raise moves the salary and the card says so');
      doc.getElementById('endmonth').click();
      check(/Got the Raise/.test(text('#recapbody')) && /Your Call/.test(text('#recapbody')) && /Slight Was Ignored/.test(text('#recapbody')) && /By Default/.test(text('#recapbody')),
            'the recap reads the answered event as your call and the open one as its default');
      doc.getElementById('recapgo').click();
    }
    /* WHAT IS LEFT WAITING COSTS: plant a letter from a house, end the month without answering,
       and the letter is gone and the house remembers being snubbed */
    {
      const GL = window.__G, from = GL.state.ids.find(x => x !== GL.me);
      const memBefore = GL.corps[GL.me].rep.memory.filter(m => m.t === 'snubbed_letter').length;
      GL._tradeOffer = { from: from, ask: { units: [GL.corps[GL.me].roster[0].id], credits: 0, gear: [], intel: [] }, offer: { credits: 10000, gear: [], units: [], intel: [] } };
      [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
      check(/Has Written/.test(text('#brief')) && /Waiting/.test(doc.getElementById('endmonth').textContent),
            'a letter stands on the agenda and End the Month counts it');
      doc.getElementById('endmonth').click();
      check(/Lapses/.test(text('#recapbody')), 'the recap says the letter lapsed and was noticed');
      doc.getElementById('recapgo').click();
      check(!GL._tradeOffer && GL.corps[GL.me].rep.memory.filter(m => m.t === 'snubbed_letter').length === memBefore + 1,
            'the letter is gone and the house remembers the snub');
    }
    /* the Bastille's two intakes resolve as months 5 and 6 end; month 7 is the fleet's */
    toMonth(8);
    /* THE EIGHT: one name, one fight, real deaths */
    {
      const G8 = window.__G;
      [...doc.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
      check(doc.querySelectorAll('#eight .fcard[data-eight]').length >= 4 && /Your Best/.test(text('#eight')) && /Name Your Fighter for The Eight/.test(text('#brief')),
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
    const fit = G.corps[G.me].roster.filter(f => f.status === 'active');
    const squadIds = fit.slice(0, 6).map(f => f.id);
    hasTab('Squads') && [...doc.querySelectorAll('.tab')].filter(x => /Squad/.test(x.textContent))[0].click();
    squadIds.forEach(id => {
      doc.querySelector('#bench .fcard[data-id="' + id + '"]').click();
      doc.querySelector('#sqboxes .sqcard[data-si="0"] [data-place]').click();
    });
    const alpha = () => doc.querySelectorAll('#sqboxes .sqcard')[0];
    check(alpha().querySelectorAll('.fcard[data-id]').length === 6 &&
          alpha().querySelectorAll('.fcard.open').length === 1,
          'six rows stand in Alpha on the board, one open row waiting');
    check(!doc.querySelector('#bench .fcard[data-id="' + squadIds[0] + '"]'),
          'a placed fighter leaves the bench');
    /* the seventh and eighth fit the engine's SQUAD_MAX of 8; a ninth is refused */
    const more = fit.slice(6, 9).map(f => f.id);
    more.forEach(id => { doc.querySelector('#bench .fcard[data-id="' + id + '"]').click();
                         const pl = doc.querySelector('#sqboxes .sqcard[data-si="0"] [data-place]');
                         if (pl) pl.click(); else G._sqsel = null; });
    check(alpha().querySelectorAll('.fcard[data-id]').length === 8 &&
          alpha().querySelectorAll('.fcard.open').length === 0 && /Full/.test(alpha().textContent),
          'Alpha fills to eight and closes its open row');
    /* the cross sends the two extras home again */
    more.slice(0, 2).forEach(id => alpha().querySelector('.fcard[data-id="' + id + '"] [data-home]').click());
    check(alpha().querySelectorAll('.fcard[data-id]').length === 6 &&
          doc.querySelectorAll('#bench .fcard').length === fit.length - 6,
          'the cross on a row sends a fighter home');
    /* the star on a row makes a leader, on the person */
    const leadId = squadIds[3];
    const leadName = fit.find(f => f.id === leadId).name;
    alpha().querySelector('.fcard[data-id="' + leadId + '"] [data-lead]').click();
    check(!!G.plan.leaderOf[leadId] && alpha().querySelectorAll('.star.on').length === 1,
          'clicking the star sets leadership on the person: ' + leadName);
    /* the name opens the sheet as a drawer: four loadout slots, the moves, the actions */
    alpha().querySelector('.fcard[data-id="' + leadId + '"] [data-sheet]').click();
    check(doc.getElementById('unitpanel').classList.contains('on') &&
          doc.querySelectorAll('#unitpanel .slot').length === 4,
          'the sheet opens as a drawer with the four loadout slots');
    check(doc.querySelectorAll('#unitpanel .mv').length === 6 &&
          doc.querySelector('#unitpanel .mv[data-mv="0"]').disabled,
          'the sheet offers a move to every squad but the one they stand in');
    doc.getElementById('pmakelead').click();
    check(!G.plan.leaderOf[leadId], 'the sheet\'s leader button toggles leadership off');
    doc.getElementById('pmakelead').click();
    check(!!G.plan.leaderOf[leadId] && G._inspect === leadId &&
          doc.getElementById('unitpanel').classList.contains('on'),
          'and on again, the drawer staying on the inspected fighter through the rerender');
    doc.querySelector('#unitpanel [data-slot="primary"]').click();
    check(doc.querySelectorAll('.picker .prow').length > 1,
          'the equip picker lists options: ' + doc.querySelectorAll('.picker .prow').length + ' rows');
    check(doc.querySelectorAll('.picker .prow .tierb').length >= doc.querySelectorAll('.picker .prow').length - 1,
          'every item in the picker wears its tier badge');
    const rackRow = [...doc.querySelectorAll('.picker .prow')].find(r => /Rack /.test(r.textContent));
    const buyRow = [...doc.querySelectorAll('.picker .prow')].find(r => /Buy /.test(r.textContent));
    const pickRow = rackRow || buyRow;
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
    doc.querySelector('#sqboxes .sqcard[data-si="1"] [data-home]').click();
    endMonth();               /* month 11 — the lock; the year turns to the Divide */
    check(/the Divide/.test(text('#clock')), 'eleven months spent: ' + text('#clock'));
    check(!doc.body.classList.contains('yearline'), 'the year line stands down for the Divide');
    check(!hasTab('Desk') && !hasTab('The Firefight') && hasTab('The Table') &&
          hasTab('The Ground') && hasTab('Roster'),
          'the whole menu switches: the Divide\'s rail, the Firefight off it');
    check(/The Table/.test(doc.querySelectorAll('#rail .tab')[0].textContent),
          'the Table stands first on the Divide\'s rail');
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
    /* THE DRAFT: twenty-four slots at the lock, drafted weakest first, three each; the AI's turns
       run until it is yours; you pick by slot; Drop when the draft is done */
    {
      const GD2 = window.__G, S3 = window.CDSEASON;
      const Dft = GD2.state.drop.draft;
      check(Dft && Dft.order.length === 8 && doc.querySelectorAll('#landing .dpick').length === 8,
            'the draft opens at the lock with the eight houses in order, weakest first: ' + Dft.order.slice(0, 3).join(' > ') + ' …');
      let guard = 0;
      while (!Dft.done && guard++ < 6) {
        if (S3.draftWhose(GD2.state) === GD2.me) {
          check(/Your Pick/.test(text('#landing')), 'the page says it is your pick');
          const free = []; for (let i = 0; i < S3.SLOT_COUNT; i++) if (Dft.taken[i] == null) free.push(i);
          S3.draftPick(GD2.state, GD2.me, free[Math.floor(free.length / 2)]);
        }
        S3.draftAdvance(GD2.state);
        [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click();
      }
      check(Dft.done && Dft.picks[GD2.me].length === 3 && Object.keys(Dft.taken).length === 24,
            'the draft completes: three picks each, twenty-four slots taken');
      check(doc.querySelectorAll('#landing .sector.yours').length === 3 && /Every Landing/.test(text('#landing')),
            'your three landings are listed and every landing is posted');
    }
    if (false && process.env.ARX_SHOT_WORLD) {   /* (the world shot predates the draft; re-cut when the Drop settles) */
      const GW = window.__G, keepPl = GW.state.planet;
      GW.state.planet = window.CDMAP.generatePlanet(window.CDPRNG.mulberry32(21), { archetype: process.env.ARX_SHOT_WORLD });
      GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click();
      { const pl = GW.state.planet, a = 2 / 6 * Math.PI * 2, d = pl.radius * 0.82, x = pl.cx + Math.cos(a) * d, y = pl.cy + Math.sin(a) * d;
        let w = 0; for (let k = 0; k < 8; k++) { const b = k / 8 * Math.PI * 2; if (pl.waterAt(x + Math.cos(b) * 0.02, y + Math.sin(b) * 0.02)) w++; }
        console.log('  note  world shot: sector 2 at ' + x.toFixed(3) + ',' + y.toFixed(3) + ' water=' + pl.waterAt(x, y) + ' h=' + pl.heightAt(x, y).toFixed(2) + ' sea=' + pl.seaLevel + ' wet neighbours ' + w + '/8 · sectors drawn from ' + (doc.querySelector('#landing .sector .sn') || {}).textContent); }
      try { require('fs').writeFileSync('/tmp/dropmap_' + process.env.ARX_SHOT_WORLD + '.png', Buffer.from(doc.getElementById('dropmap').toDataURL().split(',')[1], 'base64')); } catch (e) { console.log('  note  no world shot: ' + e.message); }
      GW.state.planet = keepPl; GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click();
    }
    if (process.env.ARX_SHOT_DEPTHS) {   /* the same world at each depth of survey */
      const GW = window.__G, plr = GW.corps[GW.me]._intel.planet.rows, keep = JSON.stringify(plr);
      [0, 1, 2, 3].forEach(dp => {
        ['terrain', 'sites', 'sectors'].forEach(k => { plr[k] = { depth: dp, gathered: dp * 34 }; });
        GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click();
        try { require('fs').writeFileSync('/tmp/dropmap_d' + dp + '.png', Buffer.from(doc.getElementById('dropmap').toDataURL().split(',')[1], 'base64')); } catch (e) { console.log('  note  no depth shot: ' + e.message); }
      });
      Object.assign(plr, JSON.parse(keep)); GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click();
    }
    if (process.env.ARX_SHOT) { try { require('fs').writeFileSync('/tmp/dropmap.png', Buffer.from(doc.getElementById('dropmap').toDataURL().split(',')[1], 'base64')); } catch (e) { console.log('  note  no shot: ' + e.message); } }
    doc.getElementById('dropbtn').click();
    (function () {
      const GG = window.__G, per = GG.state._divideOpts.corps[GG.me];
      check(!!(per && per.hand && per.hand[leadId]),
            'the manager\'s hand rode into the real Divide\'s options');
    })();
    check(/Comms Window/.test(text('#divstate')),
          'the Divide began and paused at a comms window: ' +
          text('#divstate').replace(/\s+/g, ' ').trim());
    try {
      const cv = doc.getElementById('gmap');
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0;
      for (let p = 0; p < px.length; p += 4) if (px[p] + px[p + 1] + px[p + 2] > 24) lit++;
      check(lit > 20000, 'the ground painted (' + lit + ' lit pixels — planet, wall, squads)');
    } catch (e) { console.log('  note  ground pixel check skipped'); }
    check(doc.querySelectorAll('#gboard tr').length === 9, 'all eight banners stand on the board');

    /* ---- the Table: the window answered, not ignored ---- */
    check(hasTab('The Table') && hasTab('The Deal'), 'the Table and the Deal sit live on the Divide\'s rail');
    check(/Day\s*\d+\s*of/.test(text('#dayhead')) && /Clear|[A-Z][a-z]+/.test(text('#dayhead')) && /Chance of Winning/.test(text('#dayhead')),
          'the Table\'s head reads the day, the weather and your chance: ' + text('#dayhead').replace(/\s+/g, ' ').trim().slice(0, 90));
    check(doc.querySelectorAll('#tsquads tr').length >= 2 && /Rations/.test(text('#tsquads')), 'your squads stand on the Table with their ground and rations');
    /* ORDERS: a manager's squad takes an order in the planner's vocabulary, and the planner
       leaves it alone */
    {
      const GO = window.__G, sel = doc.querySelector('#tsquads [data-ordsq]');
      check(!!sel && doc.querySelectorAll('#tsquads .ordsel').length === GO.div.win.you.squads.filter(q => q.bodies.some(b => b.status === 'active')).length,
            'every standing squad has an order menu');
      /* SHADOW FIRST: on the first window the picture holds the posted landings */
      const shOpt = [...sel.options].find(o => /^shadow:/.test(o.value));
      check(!!shOpt, 'the picture offers the posted landings to shadow on day one');
      sel.value = shOpt.value; sel.dispatchEvent(new window.Event('change'));
      const shadowIdx = +sel.getAttribute('data-ordsq');
      check(GO.div.answer.orders[shadowIdx].type === 'shadow' && /Shadow/.test(text('#tsquads')), 'a shadow order names a sighting: ' + shOpt.textContent.trim().slice(0, 40));
      doc.getElementById('advwin').click();
      const ssq = GO.div.win && GO.div.win.you.squads.filter(q => q.sIdx === shadowIdx)[0];
      check(!GO.div.win || !ssq || !ssq.bodies.some(b => b.status === 'active') || !ssq.intent || ['shadow', 'withdraw', 'hunt', 'sound', 'avoid', 'rescue', 'strike'].indexOf(ssq.intent.type) >= 0,
            'the shadow stands, or a fight took over: ' + (ssq && ssq.intent ? ssq.intent.type + (ssq.intent.ordered ? ' (ordered)' : '') : 'none'));
      /* THEN HOLD, on the next window */
      if (GO.div.win) {
        [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click();
        const sel2 = doc.querySelector('#tsquads [data-ordsq]');
        if (sel2) {
          sel2.value = 'hold'; sel2.dispatchEvent(new window.Event('change'));
          const holdIdx = +sel2.getAttribute('data-ordsq');
          check(GO.div.answer.orders[holdIdx].type === 'hold' && /Hold/.test(text('#tsquads')), 'an order is composed for the window and shows on the row');
          doc.getElementById('advwin').click();
          const sq = GO.div.win && GO.div.win.you.squads.filter(q => q.sIdx === holdIdx)[0];
          check(!GO.div.win || !sq || !sq.bodies.some(b => b.status === 'active') || (sq.intent && sq.intent.ordered && sq.intent.type === 'hold') || (GO.div.win.day - (sq._orderedOn || 0)) > 5,
                'the squad holds the order through the advance: ' + (sq && sq.intent ? sq.intent.type + (sq.intent.ordered ? ' (ordered)' : '') : 'none'));
        }
      }
    }
    check(doc.querySelectorAll('#tstance .notch').length === 5 && /Seek/.test(text('#tstance')), 'the five notches each say what they do');
    check(doc.getElementById('nextyear').style.display === 'none', 'Begin the Next Year waits on the contest');

    check(doc.querySelectorAll('[data-notch]').length === 5,
          'the stance ladder offers all five notches');
    const worn0 = (doc.querySelector('#tstance .notch.on') || { getAttribute: () => '' }).getAttribute('data-notch').replace(/_/g, ' ');
    const other = Array.from(doc.querySelectorAll('[data-notch]'))
      .find(b => b.getAttribute('data-notch').replace(/_/g, ' ') !== worn0);
    const declared = other.getAttribute('data-notch');
    other.click();
    check(/Declaring/.test(text('#tstance')),
          'a stance is declared at the window: ' + declared.replace(/_/g, ' '));
    if (process.env.ARX_SHOT_FOG) { try { const GW = window.__G; GW.corps[GW.me]._intel.planet.rows.terrain = { depth: 0, gathered: 0 }; GW.gcache = null; [...doc.querySelectorAll('.tab')].filter(x => /Ground/.test(x.textContent))[0].click(); require('fs').writeFileSync('/tmp/gmap_fog.png', Buffer.from(doc.getElementById('gmap').toDataURL().split(',')[1], 'base64')); [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click(); } catch (e) { console.log('  note  no fog shot: ' + e.message); } }
    if (process.env.ARX_SHOT) { try { [...doc.querySelectorAll('.tab')].filter(x => /Ground/.test(x.textContent))[0].click(); require('fs').writeFileSync('/tmp/gmap.png', Buffer.from(doc.getElementById('gmap').toDataURL().split(',')[1], 'base64')); [...doc.querySelectorAll('.tab')].filter(x => /Table/.test(x.textContent))[0].click(); } catch (e) { console.log('  note  no ground shot: ' + e.message); } }
    /* THE TABLE IS THE TALKS' SHAPE: a strip of houses, a composer for the one selected */
    const strip = doc.querySelectorAll('#tstrip [data-tsel]').length;
    check(strip === 7, 'every other house stands on the Table\'s strip (' + strip + ')');
    check(doc.querySelectorAll('#tground .assay span, #tground .m').length >= 1, 'the ground\'s assay is on the Table');
    /* EVERY HOUSE OPENS SOMETHING: click each chip and read the Deal box */
    {
      let opened = 0;
      [...doc.querySelectorAll('#tstrip [data-tsel]')].forEach(ch => {
        ch.click();
        const td = text('#tdeal');
        if (/You Offer|Do Not Deal|Fight Under|Nothing To Put|Forbid/.test(td)) opened++;
        ch.click();
      });
      check(opened === doc.querySelectorAll('#tstrip [data-tsel]').length,
            'every house on the strip opens a composer, or says why it will not deal (' + opened + ')');
    }
    /* COMPOSE AT THE FIRST WINDOW THAT OFFERS A DEAL. A viable row is a matter of the seed
       and the day, so walk the windows until one appears, lowball it, and read the refusal
       back with its number on the next. */
    let composed = null, tries = 0;
    while (!composed && !/over/.test(text('#divstate')) && tries++ < 12) {
      const W = window.__G.div.win;
      const takeRow = (W.table.wouldTake || []).find(r => r.viable && r.band);
      const joinRow = (W.table.canJoin || []).find(r => r.viable && r.band);
      if (takeRow || joinRow) {
        const id = takeRow ? takeRow.corp : joinRow.principal, kind = takeRow ? 'take' : 'join';
        doc.querySelector('#tstrip [data-tsel="' + id + '"]').click();
        const kb = doc.querySelector('#tdeal [data-tkind="' + kind + '"]'); if (kb) kb.click();
        /* the cut goes on the table as a chip: You Offer for a take, You Ask For for a join */
        doc.querySelector('#tdeal [data-tin="cut"]').value = kind === 'take' ? '1' : '95';
        doc.querySelector('#tdeal [data-tadd2="' + (kind === 'take' ? 'give' : 'get') + ':cut"]').click();
        check(/Short by|Over by|Would Take/.test(text('#tdeal')), 'the beam reads the terms as they stand: ' +
              (text('#tdeal').match(/(Short by[^.]*|Over by[^.]*|They Would Take[^.]*)/) || [''])[0]);
        doc.querySelector('#tdeal [data-tsend="' + kind + '"]').click();
        check((kind === 'take' ? /Under Yours/ : /Banner/).test(text('#tword')) &&
              (kind === 'take' ? /1% of the Take/ : /95% of the Take/).test(text('#tword')),
              'a ' + (kind === 'take' ? 'lowball' : 'greedy join') + ' is composed on day ' + W.day + ': ' +
              text('#tword').replace(/\s+/g, ' ').trim().slice(0, 80));
        composed = kind;
      }
      doc.getElementById('advwin').click();
    }
    if (!composed) {
      console.log('  note  no viable deal in the first dozen windows on this seed');
      if (!/over/.test(text('#divstate'))) {
        doc.querySelector('#tstrip [data-tsel]').click();
        check(doc.querySelectorAll('#tdeal .tkinds, #tdeal .tcols, #tdeal .m').length >= 1,
              'selecting a house opens the composer, or says why there is nothing to put to them: ' +
              text('#tdeal').replace(/\s+/g, ' ').trim().slice(0, 70));
        /* A SYNTHETIC ROW proves the composer's arithmetic when the seed offers no real one:
           a house that would come under the banner for 10-40% of a 100,000 take. The beam
           must read short under 10,000 of value, take it inside, and over past 40,000. */
        const Wn = window.__G.div.win, oid = window.__G.state.ids.find(x => x !== window.__G.me);
        Wn.table.wouldTake = [{ corp: oid, odds: 0.2, viable: true,
          range: { expectedTake: 100000, joinerMin: 10000, principalMax: 40000, oddsPrincipal: 0.3, oddsJoined: 0.45, relPrice: 1,
                   /* a share of the haul reads differently to each side: they are short of food, you are not */
                   resources: { foods: { units: 4, joiner: 60000, principal: 12000 }, minerals: { units: 0, joiner: 0, principal: 0 } },
                   claims: { obj_synth: { resource: 'copper_ore', category: 'minerals', units: 2.1, joiner: 9000, principal: 30000 } },
                   spoiler: 7500 },
          band: { minShare: 0.10, maxShare: 0.40 } }];
        window.__G._tdiv = null;
        doc.querySelector('#tstrip [data-tsel="' + oid + '"]').click();
        if (/Pick a House/.test(text('#tdeal'))) doc.querySelector('#tstrip [data-tsel="' + oid + '"]').click();   /* the chip toggles */
        doc.querySelector('#tdeal [data-tkind="take"]').click();
        check(/Nothing on the Table/.test(text('#tdeal')), 'the beam starts empty');
        doc.querySelector('#tdeal [data-tin="cut"]').value = '5';
        doc.querySelector('#tdeal [data-tadd2="give:cut"]').click();
        check(/Short by ₡5,000/.test(text('#tdeal')), 'a 5% cut of 100,000 reads short by 5,000 against a 10,000 floor');
        doc.querySelector('#tdeal [data-tin="credits"]').value = '6000';
        doc.querySelector('#tdeal [data-tadd2="give:credits"]').click();
        check(/They Would Take This|They Would Sign/.test(text('#tdeal')), 'adding 6,000 in credits carries it over the floor');
        doc.querySelector('#tdeal [data-tdrop2="give:0"]').click();
        doc.querySelector('#tdeal [data-tin="cut"]').value = '50';
        doc.querySelector('#tdeal [data-tadd2="give:cut"]').click();
        check(/Over by ₡16,000/.test(text('#tdeal')), 'a 50% cut plus 6,000 reads over by 16,000 against a 40,000 ceiling');
        check(doc.querySelectorAll('#tdeal .trow.dead').length >= 0 && /Not Yet Priced|Their Banner/.test(text('#tdeal')),
              'the pools carry the structure for terms the engine does not price yet');
        /* A DEAL IN KIND finds room a deal in credits cannot: drop everything, offer 25% of
           the foods you will bank — worth 15,000 to a house short of food, costing you 3,000 */
        doc.querySelector('#tdeal [data-tdrop2="give:1"]').click();
        doc.querySelector('#tdeal [data-tdrop2="give:0"]').click();
        check(/Nothing on the Table/.test(text('#tdeal')), 'the table clears');
        check(doc.querySelectorAll('#tdeal .trow2.dead').length === 3 && /A Share of Their Foods/.test(text('#tdeal')),
              'the haul rows stand in the pool, the empty category greyed');
        doc.querySelector('#tdeal [data-tin="haul:foods"]').value = '25';
        doc.querySelector('#tdeal [data-tadd2="give:haul:foods"]').click();
        check(/They Would Sign/.test(text('#tdeal')) && /to Them\s*₡15,000/.test(text('#tdeal')) && /to You\s*₡3,000/.test(text('#tdeal')),
              'a quarter of the foods reads worth 15,000 to them and 3,000 to you — the want gap is the deal');
        check(/Their Leverage\s*₡7,500/.test(text('#tdeal')), 'the spoiler value reads on the beam as their leverage');
        /* A NAMED CLAIM prices to each side too; here you want the copper more than they do */
        doc.querySelector('#tdeal [data-tadd2="give:claim:obj_synth"]').click();
        check(/to You\s*₡33,000/.test(text('#tdeal')) && /to Them\s*₡24,000/.test(text('#tdeal')),
              'the claim adds 9,000 to them and 30,000 to you — a bad deal in kind reads as one');
        doc.querySelector('#tdeal [data-tsend="take"]').click();
        check(/25% of Their Foods/.test(text('#tword')) && /Copper Ore Claim/.test(text('#tword')), 'the word carries the haul term and the claim: ' + text('#tword').replace(/\s+/g, ' ').trim().slice(0, 110));
        doc.getElementById('twithdraw').click();
        doc.querySelector('#tdeal [data-tin="cut"]').value = '50';
        doc.querySelector('#tdeal [data-tadd2="give:cut"]').click();
        doc.querySelector('#tdeal [data-tin="credits"]').value = '6000';
        doc.querySelector('#tdeal [data-tadd2="give:credits"]').click();
        doc.querySelector('#tdeal [data-tsend="take"]').click();
        check(/Under Yours/.test(text('#tword')) && /50% of the Take/.test(text('#tword')) && /6,000/.test(text('#tword')),
              'Put It to Them composes the word with its cut and credits: ' + text('#tword').replace(/\s+/g, ' ').trim().slice(0, 80));
        doc.getElementById('twithdraw').click();
      }
    }
    if (!/over/.test(text('#divstate'))) {
      check((doc.querySelector('#tstance .notch.on') || {}).getAttribute && doc.querySelector('#tstance .notch.on').getAttribute('data-notch') === declared,
            'the declaration round-tripped through the engine: worn now ' + declared.replace(/_/g, ' '));
      if (composed)
        check(/Refused/.test(text('#techo')) && /(short|over) by ₡?[\d,]+/.test(text('#techo')),
              'the refusal came back with its number: ' +
              text('#techo').replace(/\s+/g, ' ').trim().slice(0, 120));
    } else console.log('  note  the contest ended early — table round-trip rides another seed');
    let winN = 1, guard = 0;
    while (!/over/.test(text('#divstate')) && guard++ < 60) {
      doc.getElementById('advwin').click(); winN++;
    }
    check(/the Divide is over/.test(text('#divstate')),
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
      check(doc.querySelectorAll('#audiences .audrow').length >= 10,
            'the Board reads four audiences and the rivals (' +
            doc.querySelectorAll('#audiences .audrow').length + ' rows)');
      check(doc.querySelectorAll('#audiences .audname svg').length >= 7,
            'each rival stands on the Board in its own colour and mark');
      check(!/Not yet joined/.test(text('#audiences') + text('#boarddemand')),
            'the Board is joined, not a placard');
      check(doc.querySelectorAll('#audiences .audcard').length === 3 && /\d/.test(text('#audiences')),
            'each audience is a card that carries what it remembers');
      check(/Year \d+/.test(text('#boardhead')) && /Patience/.test(text('#boardhead')),
            'the Board\'s head reads the year and the patience');
      const rivals = GB.state.ids.filter(x => x !== GB.me);
      const before = REPM.readAll(GB.corps[GB.me].rep, rivals);
      const regs = [...doc.querySelectorAll('.regbtn')];
      check(regs.length === 6, 'the board asks, and all six registers are offered (' + regs.length + ')');
      regs[0].click();
      const after = REPM.readAll(GB.corps[GB.me].rep, rivals);
      const moved = ['own', 'fleet', 'aleas'].some(a => Math.abs(after[a] - before[a]) > 0.001);
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
    check(!/the Dividend/.test(text('#encounters')),
          'the Table\'s recap stays on the ground; the lights stay on the shelf');
    doc.querySelector('#encounters [data-watch]').click();
    check(+doc.getElementById('fr').max > 5,
          'a ground encounter replays on the grid (' + (+doc.getElementById('fr').max + 1) + ' frames)');
    check(/turn \d+ of \d+/.test(text('#frLbl')), 'its turn label reads: ' + text('#frLbl'));
    const rowsA = doc.querySelectorAll('#rosterA .unit').length;
    const rowsB = doc.querySelectorAll('#rosterB .unit').length;
    check(Math.min(rowsA, rowsB) >= 1 && Math.min(rowsA, rowsB) <= 6,
          'the manager\'s six rode into the real Divide (side panels ' + rowsA + ' vs ' + rowsB + ')');
    check(+doc.getElementById('gday').max >= 5,
          'the whole contest scrubs day by day (' + doc.getElementById('gday').max + ' days recorded)');

    /* ---- the Ground moves: the animation, guarded ----
       The mock proved the grammar; these prove the page kept it. The fault that made
       this pass necessary was a first press that relocated every squad at once, so the
       decisive check is that stepping a day moves nobody who is not walking. */
    (function () {
      const G = window.__G;
      check(G.gstage === 'morning' && G.gday === 1,
            'a finished contest opens at the drop, not at its last day');
      const days = G.div.final.replay.days;
      const withTracks = days[1] && days[1].sq.filter(q => q.tr && q.tr.length >= 4).length;
      check(withTracks > 0,
            'the recording carries real walked tracks (' + withTracks + ' squads on day 2)');

      /* every squad's drawn position, before and after one by-squad step */
      doc.getElementById('gbysquad').checked = true;
      doc.getElementById('gnoanim').checked = true;      /* settle instantly, no timers */
      const shot = () => days[G.gday - 1].sq.map((q, qi) => window.__gDisp(q, qi).pos);
      const before = shot();
      doc.getElementById('gfwd').click();
      const after = shot();
      let moved = 0, worst = 0;
      for (let i = 0; i < Math.min(before.length, after.length); i++) {
        const d = Math.hypot(before[i][0] - after[i][0], before[i][1] - after[i][1]);
        if (d > 0.002) { moved++; worst = Math.max(worst, d); }
      }
      check(moved <= 1,
            'stepping by squad moves one squad, not the map (' + moved +
            ' moved, worst ' + worst.toFixed(3) + ')');
      check(G.gstage === 'stepping' || G.gstage === 'complete',
            'the day is being stepped through, in order (' + G.gstage + ' ' + G.gmi + ')');

      /* the back button un-happens the last move rather than jumping a day */
      const dayAt = G.gday;
      doc.getElementById('gback').click();
      check(G.gday === dayAt, 'stepping back un-happens the move, it does not skip the day');

      doc.getElementById('greach').checked = true;
      doc.getElementById('gday').dispatchEvent(new window.Event('input'));
      check(G.gstage === 'complete',
            'scrubbing lands on a finished day and never animates');
      doc.getElementById('gbysquad').checked = false;
      doc.getElementById('gnoanim').checked = false;
      doc.getElementById('greach').checked = false;
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
      check(dropped.length > 0 && marked.length > 0,
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
    check(!!doc.querySelector('#traingrid .tgrid') && !!doc.querySelector('#intelgrid .itbl')
          && !!doc.querySelector('#courtgrid .ctbl'),
          'year two\'s first month offers its boards — the loop closes');

    /* ---- the blank slate: a player-founded house takes a berth and plays ---- */
    doc.getElementById('menubtn').click();
    doc.getElementById('mNew').click();
    doc.querySelector('#oacards [data-oa="__custom"]').click();
    doc.getElementById('cname').value = 'House Probe';
    doc.getElementById('cfound').click();
    check(/Year 1 · Month 1/.test(text('#clock')),
          'the founded house opens its own year 1: ' + text('#clock'));
    check(/House Probe/.test(text('#money')),
          'the blank slate stands on the roster page under its own name');
    check(!!doc.querySelector('#traingrid .tgrid') &&
          !!doc.querySelector('#courtgrid .ctbl') &&
          doc.querySelectorAll('#roster .rcard').length >= 16,
          'the founder\'s house has a full roster and a live desk — playable, not a placard');

    console.log(failed ? '\n' + failed + ' CHECK(S) FAILED'
                       : '\nall checks passed — the page lives a year');
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.log('  DRIVE ERROR: ' + (e && e.stack || e));
    process.exit(1);
  }
}, 400);
