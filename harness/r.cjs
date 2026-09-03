const fs = require('fs'); const { JSDOM } = require('jsdom');
function run(buy, cb) {
  let html = fs.readFileSync(__dirname + '/../viewers/the_corp.html', 'utf8');
  html = html.replace('    G = window.__G = { rng: rng,', '    G = { rng: rng,');
  html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window, doc = w.document;
  setTimeout(() => {
    doc.getElementById('mNew').click();
    doc.querySelector('#oacards [data-oa="knights_star"]').click();
    if (buy) {
      [...doc.querySelectorAll('#rail .tab')].find(t => /Market/.test(t.textContent)).click();
      doc.querySelector('#mktledger .mrow [data-madd]').click();
      doc.getElementById('mktbuy').click();
      [...doc.querySelectorAll('#rail .tab')].find(t => /Desk/.test(t.textContent)).click();
    }
    doc.getElementById('endmonth').click();
    doc.getElementById('endmonth').click();
    [...doc.querySelectorAll('.tab')].filter(x => /Roster/.test(x.textContent))[0].click();
    cb(buy, (doc.querySelector('#rostmarket') || {}).textContent.trim().slice(0, 60), w.__G.state.month);
  }, 1200);
}
run(false, (b, t, m) => console.log('without buying · month', m, '·', JSON.stringify(t)));
setTimeout(() => run(true, (b, t, m) => console.log('after buying   · month', m, '·', JSON.stringify(t))), 2000);
