/* §DRAFT THE DRAFT ON THE PAGE. A new game opens Month 1 with the Draft on the Roster: the board of sixteen picks, weakest
   OA first, the pool as prospect cards with every stat, best first, and a Pick when it is your pick; a pick puts the fighter on your roster (a pair crosses whole) and moves
   the Draft on. `node harness/drive_draft.cjs` */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules', 'jsdom'));
let html = fs.readFileSync(path.join(__dirname, '..', 'viewers', 'the_corp.html'), 'utf8');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://opesarx.test/?seed=corp-1' });
const w = dom.window, d = w.document; w.__noTurn = true;
const errs = []; w.addEventListener('error', e => errs.push(e.message));
const fails = [];
setTimeout(() => { d.getElementById('mNew').click();
  setTimeout(() => { d.getElementById('cfound').click();
    setTimeout(() => {
      const G = w.__G, R = G.state.recruitDraft;
      /* §WINDOWS the Draft is a window: a docket line on the Roster opens it, and Month 1 opens it in turn */
      const dock = d.getElementById('rostdraft');
      if (!dock || !/The Draft/.test(dock.textContent) || !dock.querySelector('[data-docket="draft"]')) fails.push('no Draft docket on the Roster in Month 1');
      while (d.getElementById('dispatch').classList.contains('on')) d.getElementById('dlater').click();
      for (let k = 0; k < 3 && d.getElementById('bizwin').classList.contains('on') && !/The Draft/.test(d.getElementById('bhead').textContent); k++) d.getElementById('bizlater').click();
      if (!d.getElementById('bizwin').classList.contains('on')) dock.querySelector('[data-docket="draft"]').click();
      const host = d.getElementById('bizwin');
      if (!host.classList.contains('on') || !/The Draft/.test(host.textContent)) fails.push('the Draft does not open as a window');
      if (host.querySelectorAll('.drfpk').length !== 16) fails.push('the board does not show all sixteen picks');
      /* weakest first: the founder took the weakest berth, so the first pick is yours, not a draw */
      if (R.order[0] !== G.me) fails.push('the first pick is not the weakest OA (you)');
      const SE = w.CDSEASON, reads = G.state.ids.map(id => SE.strengthRead ? SE.strengthRead(G.state, id) : 0);
      const ordered = R.order.slice(0, G.state.ids.length).map(id => reads[G.state.ids.indexOf(id)]);
      if (SE.strengthRead && ordered.some((v, i) => i && v < ordered[i - 1])) fails.push('the order does not run weakest to strongest');
      const rows = host.querySelectorAll('.pc');
      if (!rows.length || rows[0].querySelectorAll('.pc-stats .st').length !== 7) fails.push('the pool does not show seven stats a fighter');
      if (!rows[0].querySelector('[data-sheet]')) fails.push('a prospect\'s name does not open their sheet');
      const sums = [...rows].map(r => [...r.querySelectorAll('.pc-stats .st .v')].reduce((t, e) => t + (parseInt(e.textContent, 10) || 0), 0));
      if (sums.some((v, i) => i && v > sums[i - 1])) fails.push('the pool is not sorted best first');
      if (host.querySelector('.pc-trade') && !/Best With/.test(host.querySelector('.pc-trade').textContent)) fails.push('no Best With on a card');
      const mine = SE => SE.recruitDraftWhose(G.state) === G.me;
      if (!mine(w.CDSEASON)) fails.push('the Draft did not stop at your pick');
      const btn = host.querySelector('[data-rdpick]');
      if (!btn) fails.push('no Pick button at your pick');
      else {
        const id = btn.getAttribute('data-rdpick'), before = G.corps[G.me].roster.length, at = R.i;
        btn.click();
        if (!G.corps[G.me].roster.some(f => f.id === id)) fails.push('the pick did not reach your roster');
        if (!(R.i > at)) fails.push('the Draft did not move on after your pick');
        if (!/Assigned|[A-Za-z]/.test(host.querySelector('.drfpk.done .got') ? host.querySelector('.drfpk.done .got').textContent : '')) fails.push('the board does not show who was taken');
        const mirrors = G.corps[G.me].roster.filter(f => f.mirror_of === id).length;
        if (G.corps[G.me].roster.length !== before + 1 + mirrors) fails.push('a pick added the wrong number of records');
      }
      if (errs.length) fails.push('page errors: ' + errs.slice(0, 2).join(' ; '));
      console.log(fails.length ? 'FAIL ' + fails.join(' | ')
        : 'the Draft opens as a window from the Roster in Month 1: the board weakest first, the pool best first with every stat, your pick, and the fighter on your roster');
      process.exit(fails.length ? 1 : 0);
    }, 500);
  }, 300);
}, 300);
