const fs = require('fs'); const { JSDOM } = require('jsdom');
let html = fs.readFileSync(__dirname + '/../viewers/the_corp.html', 'utf8');
html = html.replace('    G = window.__G = { rng: rng,', '    G = { rng: rng,');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, doc = w.document;
setTimeout(() => {
  doc.getElementById('mNew').click();
  doc.querySelector('#oacards [data-oa="knights_star"]').click();
  const G = w.__G;
  [...doc.querySelectorAll('#rail .tab')].find(t => /Negotiation/.test(t.textContent)).click();
  const chip = doc.querySelector('#tradestrip .oachip2');
  const themId = chip.getAttribute('data-toa');
  chip.click();
  const row = () => doc.querySelectorAll('#tpool-give .trow')[0];
  row().click(); row().click(); row().click();
  console.log('clicked the same hand three times · on the table:', doc.querySelectorAll('#tchips-give .chip').length);
  // now actually trade one of theirs and confirm the body lands
  const before = G.corps[G.me].roster.length;
  const theirBefore = G.corps[themId].roster.length;
  doc.querySelector('#ttabs-give [data-tcat="credits"]').click();
  doc.querySelectorAll('#tpool-give .trow')[1].click();
  const wantName = G.corps[themId].roster[0].name;
  doc.querySelectorAll('#tpool-get .trow')[0].click();
  doc.getElementById('tput').click();
  console.log('log:', (doc.querySelector('#tlog')||{}).textContent);
  console.log('my roster', before, '->', G.corps[G.me].roster.length,
    '· theirs', theirBefore, '->', G.corps[themId].roster.length);
  const got = G.corps[G.me].roster.some(f => f.name === wantName);
  console.log('the named body is on my roster:', got);
}, 1200);
