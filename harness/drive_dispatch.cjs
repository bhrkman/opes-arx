/* §DISPATCHES THE MONTH'S EVENTS ARE A WINDOW OVER THE DESK. Opens a game, forces an event onto the month, and checks
   the window: it opens by itself with a count, Later closes it, Waiting On You reopens it, an answer resolves the card
   in place. Then Month 11: the Media Day card stands in it with its fronts, and fronting it writes what the drop
   reads. `node harness/drive_dispatch.cjs` */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules', 'jsdom'));
let html = fs.readFileSync(path.join(__dirname, '..', 'viewers', 'the_corp.html'), 'utf8');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://opesarx.test/' });
const w = dom.window, d = w.document; w.__noTurn = true;
const errs = []; w.addEventListener('error', e => errs.push(e.message));
const fails = [], check = (ok, what) => { if (!ok) fails.push(what); };
const text = sel => (d.querySelector(sel) || { textContent: '' }).textContent;
const isOpen = () => d.getElementById('dispatch').classList.contains('on');
const deskTab = () => [...d.querySelectorAll('.tab')].filter(x => /Desk/.test(x.textContent))[0].click();
setTimeout(() => { d.getElementById('mNew').click();
  setTimeout(() => { d.getElementById('cfound').click();
    setTimeout(() => {
      const G = w.__G, S = w.CDSEASON;
      /* a month with something to answer: force a card, arrive at the Desk */
      const roster = G.corps[G.me].roster.filter(f => f.status === 'active');
      S.eventsFor(G.state, G.me);
      G.state.events[G.me].list = [{ id: 'raise-test', pool: 'raise', kind: 'raise', subject: roster[0].id, ask: 500, title: roster[0].name + ' Wants a Raise', text: 'test',
        options: [{ id: 'grant', label: 'Grant It', cost: '' }, { id: 'refuse', label: 'Refuse', cost: '' }], def: 'refuse', resolved: null }];
      G._dispatchSeen = null;
      deskTab();
      check(isOpen(), 'the window opens by itself when the Desk is reached with something to answer');
      check(/1 Waiting/.test(text('#dcount')), 'the strip counts what is waiting');
      check(d.querySelector('#dispatch #events .evcard') && /Wants a Raise/.test(text('#dispatch #events')), 'the event card stands inside the window');
      d.getElementById('dlater').click();
      check(!isOpen(), 'Later closes it');
      deskTab();
      check(!isOpen(), 'it does not reopen on its own in the same month');
      const agendaItem = [...d.querySelectorAll('#agenda [data-agenda]')].find(x => /Wants a Raise/.test(x.textContent));
      check(!!agendaItem, 'Waiting On You lists the event');
      if (agendaItem) agendaItem.click();       /* on the Desk already: pings at once, which opens the window */
      check(isOpen(), 'Waiting On You reopens it');
      d.querySelector('#dispatch [data-ev="raise-test"][data-opt="grant"]').click();
      check(/Got the Raise/.test(text('#dispatch #events')) && /All Answered/.test(text('#dcount')) && /Done/.test(text('#dlaterw')), 'an answer resolves the card in place and the strip says so');
      d.getElementById('dlater').click();
      /* Month 11: media day */
      G._forceMonth = true; G._devSkip = true;
      let guard = 0; while (G.state.month < 11 && guard++ < 12) d.getElementById('endmonth').onclick();
      G._forceMonth = false; G._devSkip = false;
      check(G.state.month === 11, 'reached Month 11');
      G._dispatchSeen = null; deskTab();
      const media = (S.eventsFor(G.state, G.me) || []).find(e => e.pool === 'media');
      check(!!media && isOpen() && /Media Day/.test(text('#dispatch #events')), 'Media Day stands in the window in Month 11');
      check(media && media.options.some(o => o.id === 'standout') && media.options.some(o => o.id === 'manager') && media.options.some(o => o.id === 'regrets'), 'the card offers a standout, yourself and regrets');
      const front = d.querySelector('#dispatch [data-ev="' + media.id + '"][data-opt="standout"]');
      const rep = G.corps[G.me].rep, before = w.CDREP.standing(rep, 'fleet');
      front.click();
      const rec = (G.state.drop.media || {})[G.me];
      check(!!rec && rec.reveal > 0.3 && w.CDREP.standing(rep, 'fleet') > before, 'fronting it with the standout writes the drop\'s read and moves fleet standing');
      check(/Heard|Cut Against/.test(text('#dispatch #events')), 'the card says what the fleet made of it');
      if (errs.length) fails.push('page errors: ' + errs.slice(0, 2).join(' ; '));
      console.log(fails.length ? 'FAIL ' + fails.join(' | ') : 'the Dispatches window: opens with the month, closes with Later, reopens from Waiting On You, and Media Day is answered in it');
      process.exit(fails.length ? 1 : 0);
    }, 500);
  }, 300);
}, 300);
