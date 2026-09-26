/* §RESERVE THE RESERVE ON THE SQUADS BOARD. After the dev skip to the lock (four squads of five), the bench reads "In
   Reserve" with the landing order numbered; an arrow moves a fighter; a sort sets the whole order; and Begin Divide
   locks that order into the contest. `node harness/drive_reserve.cjs` */
const fs = require('fs'), path = require('path');
const { JSDOM } = require(path.join(__dirname, 'node_modules', 'jsdom'));
let html = fs.readFileSync(path.join(__dirname, '..', 'viewers', 'the_corp.html'), 'utf8');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://opesarx.test/' });
const w = dom.window, d = w.document; w.__noTurn = true;
const errs = []; w.addEventListener('error', e => errs.push(e.message));
const fails = [];
const ids = () => [...d.querySelectorAll('#bench .rsvrow [data-rsvdn]')].map(b => b.getAttribute('data-rsvdn'));
setTimeout(() => { d.getElementById('mNew').click();
  setTimeout(() => { d.getElementById('cfound').click();
    setTimeout(() => { d.getElementById('skiptolock').click();
      setTimeout(() => {
        const G = w.__G;
        /* at the lock the page stops on the Squads board itself; its bench is drawn whether or not a tab is lit */
        /* this OA's unplaced fighters are all carrying wounds at the lock (the reserve takes only the fit), so three
           placed ones are taken out of their squads — as a manager would — and the board is redrawn by a sort */
        const placed = Object.keys(G.plan.at).filter(id => { const f = G.corps[G.me].roster.find(x => x.id === id); return f && !f.mirror_of && !f.bond_partner; }).slice(0, 3);
        placed.forEach(id => { delete G.plan.at[id]; delete G.plan.leaderOf[id]; });
        [...d.querySelectorAll('#bench [data-bsort]')].find(o => o.getAttribute('data-bsort') === 'stats').click();
        const bench = d.getElementById('bench');
        if (!/In Reserve/.test(bench.textContent) || !/Land in This Order/.test(bench.textContent)) fails.push('the bench does not read as the reserve');
        const before = ids();
        if (before.length < 2) fails.push('too few in reserve to order (' + before.length + ')');
        else {
          d.querySelector('#bench [data-rsvdn="' + before[0] + '"]').click();
          const after = ids();
          if (after[0] !== before[1] || after[1] !== before[0]) fails.push('the arrow did not move the fighter down one');
          [...d.querySelectorAll('#bench [data-bsort]')].find(o => o.getAttribute('data-bsort') === 'name').click();
          const byName = ids().map(id => G.corps[G.me].roster.find(f => f.id === id).name);
          const sorted = byName.slice().sort((a, b) => a.localeCompare(b));
          if (JSON.stringify(byName) !== JSON.stringify(sorted) && JSON.stringify(byName) !== JSON.stringify(sorted.slice().reverse()))
            fails.push('a sort did not set the order');
          const order = ids();
          d.getElementById('begindiv').onclick();
          const per = G.state._divideOpts.corps[G.me];
          const locked = (per.reserve || []).filter(f => !f.mirror_of).map(f => f.id);
          /* the order leads the locked reserve; a fighter who came fit at the lock's close joins at the foot */
          if (JSON.stringify(locked.slice(0, order.length)) !== JSON.stringify(order) || !locked.length) {
            fails.push('the lock did not carry the order into the Divide');
            if (process.env.DBG) { console.log('order ', order.join(' ')); console.log('locked', locked.join(' ')); console.log('lock.reserve', ((G.corps[G.me]._lock || {}).reserve || []).join(' ')); const inDrop = new Set((G.corps[G.me]._drop || []).map(f => f.id)); console.log('order in drop?', order.map(id => inDrop.has(id)).join(' ')); }
          }
        }
        if (errs.length) fails.push('page errors: ' + errs.slice(0, 2).join(' ; '));
        console.log(fails.length ? 'FAIL ' + fails.join(' | ')
          : 'the reserve on the Squads board: read in landing order, moved by an arrow, ordered by a sort, and locked into the Divide in that order');
        process.exit(fails.length ? 1 : 0);
      }, 800);
    }, 300);
  }, 300);
}, 300);
