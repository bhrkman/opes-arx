/* §DRAFT THE DRAFT ON THE PAGE. A new game opens Month 1 with the Draft panel on the Desk: the order, the pool with every
   stat, and Pick buttons when it is your pick; a pick puts the fighter on your roster (a pair crosses whole) and moves
   the Draft on. `node harness/drive_draft.cjs` */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules', 'jsdom'));
let html = fs.readFileSync(path.join(__dirname, '..', 'viewers', 'the_corp.html'), 'utf8');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://opesarx.test/' });
const w = dom.window, d = w.document; w.__noTurn = true;
const errs = []; w.addEventListener('error', e => errs.push(e.message));
const fails = [];
setTimeout(() => { d.getElementById('mNew').click();
  setTimeout(() => { d.getElementById('cfound').click();
    setTimeout(() => {
      const G = w.__G, host = d.getElementById('rdraft'), R = G.state.recruitDraft;
      if (!host || !/The Draft/.test(host.textContent)) fails.push('no Draft panel on the Desk in Month 1');
      if (host.querySelectorAll('.rdorder > span').length !== 16) fails.push('the order does not show all sixteen picks');
      const rows = host.querySelectorAll('.rdrow');
      if (!rows.length || rows[0].querySelectorAll('.st').length !== 7) fails.push('the pool does not show seven stats a fighter');
      const mine = SE => SE.recruitDraftWhose(G.state) === G.me;
      if (!mine(w.CDSEASON)) fails.push('the Draft did not stop at your pick');
      const btn = host.querySelector('[data-rdpick]');
      if (!btn) fails.push('no Pick button at your pick');
      else {
        const id = btn.getAttribute('data-rdpick'), before = G.corps[G.me].roster.length, at = R.i;
        btn.click();
        if (!G.corps[G.me].roster.some(f => f.id === id)) fails.push('the pick did not reach your roster');
        if (!(R.i > at)) fails.push('the Draft did not move on after your pick');
        const mirrors = G.corps[G.me].roster.filter(f => f.mirror_of === id).length;
        if (G.corps[G.me].roster.length !== before + 1 + mirrors) fails.push('a pick added the wrong number of records');
      }
      if (errs.length) fails.push('page errors: ' + errs.slice(0, 2).join(' ; '));
      console.log(fails.length ? 'FAIL ' + fails.join(' | ')
        : 'the Draft stands on the Desk in Month 1: the order, the pool with every stat, your pick, and the fighter on your roster');
      process.exit(fails.length ? 1 : 0);
    }, 500);
  }, 300);
}, 300);
