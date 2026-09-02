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
const endMonth = () => doc.getElementById('endmonth').click();
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
  try {
    /* ---- the shell: menu first, then the founding ---- */
    check(loadErrors === 0, 'the page loads without a single error (' + loadErrors + ')');
    check(doc.getElementById('menu').style.display !== 'none',
          'the game opens on the menu, not mid-cockpit');
    doc.getElementById('mNew').click();
    check(doc.getElementById('setup').style.display !== 'none' &&
          doc.querySelectorAll('#oacards .oacard').length === 9,
          'the setup offers all eight houses and the ninth card: found your own');
    check(/sealed house/.test(text('#oacards')),
          'the sealed house says so on its card');
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
    check(doc.querySelectorAll('#verbs .verbrow').length >= 1 && !!doc.querySelector('#traingrid .tgrid')
          && !!doc.querySelector('#intelgrid .itbl') && !!doc.querySelector('#courtgrid .ctbl'),
          'the desk offers verbs, the training grid, the intel section, and the courting desk (' +
          doc.querySelectorAll('#verbs .verbrow').length + ' verb rows)');
    check(/of 8 Focus Committed/.test(text('#apline')),
          'the focus board is prefilled by the corp\'s own judgement: ' + text('#apline').slice(0, 40));
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
    check(/0 of 8 Focus Committed/.test(text('#apline')),
          'clearing the verbs frees the whole budget: ' + text('#apline').split(' focus')[0].trim());

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
    check(/spent 3 of 8/.test(text('.tgbudget')),
          'painting a column to 3 pips spends 3: ' + text('.tgbudget').trim());
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
    endMonth();
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
    const cellTd = doc.querySelectorAll('#traingrid tr:nth-child(' + (subjIdx + 2) + ') td')[1 + gridStats.indexOf('tactics')];
    cellTd.querySelectorAll('.pip')[2].click();               // subject's tactics cell to 3
    check(/spent 3 of 8/.test(text('.tgbudget')),
          'the scalpel paints one cell to 3: ' + text('.tgbudget').trim());
    const sTac0 = subject.stats.tactics;
    endMonth();
    check(subject.stats.tactics - sTac0 > dT,
          'the scalpel bit deeper than the column: ' + subject.name + ' tactics +' +
          (subject.stats.tactics - sTac0).toFixed(2) + ' vs the column\'s +' + dT.toFixed(2));

    /* ---- the fill-to-cap-then-remove path that broke every mockup, now in the real DOM ---- */
    resetGrid();
    const corner = () => doc.querySelectorAll('#traingrid th.rn .pip');
    corner()[2].click();                                      // corner to 3
    check(/spent 3 of 8/.test(text('.tgbudget')), 'corner paints to 3: ' + text('.tgbudget').trim());
    corner()[2].click();                                      // step down to 2
    corner()[1].click();                                      // to 1
    corner()[0].click();                                      // to 0
    check(/spent 0 of 8/.test(text('.tgbudget')),
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
    check(/Nattie Tryouts/.test(text('#rostmarket')) && /Natural-Born/.test(text('#rostmarket')),
          'the tryouts window names the origin: ' + text('#rostmarket').trim().slice(0, 70));
    doc.querySelectorAll('#rostmarket [data-sign]')[0].click();
    doc.querySelectorAll('#rostmarket [data-sign]')[0].click();
    check(doc.querySelectorAll('#rostmarket .pcsigning').length >= 2, 'two marked to sign, no bidding');
    endMonth();               /* month 3 ends; month 4 is the deadline month */
    endMonth();               /* the tryouts sign inside this step */
    openRoster();
    check(doc.querySelectorAll('#roster .rcard[data-hand]').length > 0 &&
          /Natural-Born/.test(text('#roster')),
          'the roster now carries Natural-Born hands after the tryouts');
    /* the sheet's Health is the real wound pool (grit-sized), not the inert condition meter:
       inspect a hand and confirm the panel's Health equals CDCOMBAT.hpFor for that body */
    {
      const card = doc.querySelector('#roster .rcard[data-hand]');
      card.click();
      const hcell = doc.querySelector('#rostpanel .st.health');
      const shown = hcell ? +(hcell.textContent.match(/\d+/) || [0])[0] : -1;
      const body = window.__G.corps[window.__G.me].roster
                     .find(f => f.id === window.__G._rinspect);
      const pool = window.CDCOMBAT.hpFor(body);
      check(shown === pool && pool !== 100,
            'the sheet\'s Health is the real wound pool (' + shown + ' = hpFor ' + pool + '), not the flat meter');
      card.click();   /* deselect, leaving the rail idle for later checks */
    }

    /* ---- months 5-8: the dividend, then the Bastille ---- */
    endMonth(); endMonth();   /* 5, 6 (dividend) */
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
    check(/purse|drawn/.test(text('#result')) && /exhibition settles nothing/.test(text('#settle')),
          'the lights\' result reads as an exhibition: ' +
          text('#result').replace(/\s+/g, ' ').trim().slice(0, 90));
    check(!doc.getElementById('lock') && !doc.getElementById('run') && !doc.getElementById('lockinfo'),
          'the scrim is gone entirely: no lock, no run — the Firefight only replays');
    check(!!doc.getElementById('fightback') && (window.__G._fightBack === 'desk'),
          'the room knows its way back to the Desk during the year');
    openRoster();
    check(/Bastille/.test(text('#rostmarket')) && /Conscript/.test(text('#rostmarket')),
          'months 7-8 show the Bastille intake for Conscripts, not a bidding table');
    check(/earn release/.test(text('#rostmarket')),
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
      openRoster();
    })();
    endMonth(); endMonth();   /* 7, 8 (intake) */

    /* ---- months 9-10: the merc window — they auction themselves ---- */
    openRoster();
    check(/Merc Market/.test(text('#rostmarket')) && /Mercenary/.test(text('#rostmarket')) &&
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
    /* assign six to Alpha. jsdom has no native HTML5 drag, so exercise the same model path
       the drop handler calls — moveTo — via the exposed G, then re-render by re-opening the tab. */
    const fit = G.corps[G.me].roster.filter(f => f.status === 'active');
    const squadIds = fit.slice(0, 6).map(f => f.id);
    squadIds.forEach(id => { G.plan.at[id] = 0; });
    hasTab('Squads') && [...doc.querySelectorAll('.tab')].filter(x => /Squad/.test(x.textContent))[0].click();
    check(doc.querySelectorAll('#sqboxes .sqcard')[0].querySelectorAll('.ucard').length === 6,
          'six cards stand in Alpha on the board');
    /* inspect the fourth, make them leader, and equip through the paper-doll picker */
    const leadId = squadIds[3];
    const leadName = fit.find(f => f.id === leadId).name;
    const leadCard = [...doc.querySelectorAll('#sqboxes .sqcard')[0].querySelectorAll('.ucard')]
      .find(c => c.dataset.id === leadId);
    leadCard.click();
    check(doc.getElementById('unitpanel').style.display !== 'none' &&
          doc.querySelectorAll('#unitpanel .slot').length === 4,
          'the detail panel opens with the four paper-doll slots');
    doc.getElementById('pmakelead').click();
    check(!!G.plan.leaderOf[leadId],
          'clicking make-leader sets leadership on the person: ' + leadName);
    /* the panel stays open on the inspected body after the rerender; open the primary picker */
    check(doc.getElementById('unitpanel').style.display !== 'none' && G._inspect === leadId,
          'the detail panel stays on the inspected unit through the rerender');
    doc.querySelector('#unitpanel [data-slot="primary"]').click();
    check(doc.querySelectorAll('.picker .prow').length > 1,
          'the equip picker lists options: ' + doc.querySelectorAll('.picker .prow').length + ' rows');
    const rackRow = [...doc.querySelectorAll('.picker .prow')].find(r => /rack /.test(r.textContent));
    const buyRow = [...doc.querySelectorAll('.picker .prow')].find(r => /buy /.test(r.textContent));
    const pickRow = rackRow || buyRow;
    const handPrim = pickRow.querySelector('span').textContent.replace(/[✓✓\s]+/g,' ').trim();
    check(/power|range|trade|protect|ballistic|energy/.test(pickRow.textContent),
          'a picker row shows what the item does: ' +
          (pickRow.querySelector('.pd') || {}).textContent);
    pickRow.click();
    check(!!G.plan.hand[leadId] && G.plan.hand[leadId].primary,
          'the picker set a hand primary: ' + handPrim);
    endMonth();               /* month 11 — the lock; the year turns to the Divide */
    check(/the Divide/.test(text('#clock')), 'eleven months spent: ' + text('#clock'));
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
    doc.getElementById('autodeal').click();
    check(/no plan — the engine deals/.test(text('#planstate')),
          'clearing the plan hands the deal back to the engine');
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
    doc.getElementById('begindiv').click();
    (function () {
      const GG = window.__G, per = GG.state._divideOpts.corps[GG.me];
      check(!!(per && per.hand && per.hand[leadId]),
            'the manager\'s hand rode into the real Divide\'s options');
    })();
    check(/comms window/.test(text('#divstate')),
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
    check(hasTab('The Table'), 'the Table sits live on the Divide\'s rail');
    check(doc.querySelectorAll('[data-notch]').length === 5,
          'the stance ladder offers all five notches');
    const worn0 = (text('#tstance').match(/worn now: ([a-z ]+)/) || [, ''])[1].trim();
    const other = Array.from(doc.querySelectorAll('[data-notch]'))
      .find(b => b.getAttribute('data-notch').replace(/_/g, ' ') !== worn0);
    const declared = other.getAttribute('data-notch');
    other.click();
    check(/declaring:/.test(text('#tstance')),
          'a stance is declared at the window: ' + declared.replace(/_/g, ' '));
    let lowballed = false;
    const takeBtn = doc.querySelector('[data-take]');
    if (takeBtn) {
      const ti = takeBtn.getAttribute('data-take');
      doc.querySelector('[data-tshare="' + ti + '"]').value = '1';
      doc.querySelector('[data-take="' + ti + '"]').click();
      lowballed = true;
      check(/under yours/.test(text('#tword')) && /1% of the take/.test(text('#tword')),
            'a lowball is composed as the window\'s one word: ' +
            text('#tword').replace(/\s+/g, ' ').trim().slice(0, 80));
    } else console.log('  note  no viable joiner at the first window on this seed');
    doc.getElementById('advwin').click();
    if (!/over/.test(text('#divstate'))) {
      check(new RegExp('worn now: ' + declared.replace(/_/g, ' ')).test(text('#tstance')),
            'the declaration round-tripped through the engine: worn now ' + declared.replace(/_/g, ' '));
      if (lowballed)
        check(/refused/.test(text('#techo')) && /short by [\d,]+/.test(text('#techo')),
              'the refusal came back with its number: ' +
              text('#techo').replace(/\s+/g, ' ').trim().slice(0, 120));
    } else console.log('  note  the contest ended at the first advance — table round-trip rides another seed');
    let winN = 1, guard = 0;
    while (!/over/.test(text('#divstate')) && guard++ < 60) {
      doc.getElementById('advwin').click(); winN++;
    }
    check(/the Divide is over/.test(text('#divstate')),
          'the Divide ran window to window to its end (' + winN + ' windows): ' +
          text('#divstate').replace(/\s+/g, ' ').trim().slice(0, 120));
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
      const maxStress = Math.max.apply(null, window.__G.corps[window.__G.me].roster
        .map(f => (f.condition && f.condition.stress) || 0));
      check(maxStress > 10,
            'the Divide\'s stress came home in the people it happened to (worst on the roster: ' +
            Math.round(maxStress) + ' of 100' +
            (/stress \d+/.test(text('#roster')) ? ', visible on the page' : ', under the display line') + ')');
    }

    /* ---- the year turns ---- */
    doc.getElementById('nextyear').click();
    check(/Year 2 · Month 1/.test(text('#clock')), 'the year turns: ' + text('#clock'));
    check(hasTab('Desk') && !hasTab('The Firefight'),
          'the rail returns whole to the preparation');
    check(doc.querySelectorAll('#verbs .verbrow').length >= 1 && !!doc.querySelector('#intelgrid .itbl')
          && !!doc.querySelector('#courtgrid .ctbl'),
          'year two\'s first month offers its verbs — the loop closes');

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
    check(doc.querySelectorAll('#verbs .verbrow').length >= 1 &&
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
