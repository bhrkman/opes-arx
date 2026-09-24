/* §SUPER THE HOTSEAT, DRIVEN ON THE PAGE. Two OAs held in one Divide: the page keeps both seats' views, the switch
   swaps which is played and redraws from that seat, and one advance carries both answers — seat A posts a withdrawal
   offer, seat B (after switching) sees it as an offer to answer and promises, and A reads the promise.
   `node harness/drive_super.cjs` */
const fs = require('fs'); const { JSDOM } = require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html = fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html', 'utf8');
html = html.replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://opesarx.test/' });
const w = dom.window, d = w.document; w.__noTurn = true;
const errs = []; w.addEventListener('error', e => errs.push(e.message));
const fails = [];
setTimeout(() => { d.getElementById('mNew').click();
 setTimeout(() => { d.getElementById('cfound').click();
  setTimeout(() => { d.getElementById('skiptolock').click();
   setTimeout(() => {
    const G = w.__G, A = G.me, sp = d.getElementById('superpick');
    sp.onfocus(); const B = sp.options[2] ? sp.options[2].value : sp.value; sp.value = B;
    d.getElementById('superbtn').click();
    if (!(G.super && G.super.on && G.super.seats[1] === B)) fails.push('Super did not switch on with the chosen partner');
    d.getElementById('begindiv').onclick();
    setTimeout(() => {
      if (!G.div || !G.div.seatWins || !G.div.seatWins[A] || !G.div.seatWins[B]) { fails.push('the window does not hold both seats'); return done(); }
      if (!(G.div.win.you && G.div.win.you.id === A)) fails.push('the page does not start on the first seat');
      G.div.answer = { withdrawOffer: { credits: 0.2 } };                /* seat A offers to leave */
      d.getElementById('superbtn').click();                              /* switch to B */
      if (G.me !== B || !(G.div.win.you && G.div.win.you.id === B)) fails.push('the switch did not move the page to seat B');
      if (!/Switch to/.test(d.getElementById('superbtn').textContent)) fails.push('the button does not say who is played');
      d.getElementById('advwin').onclick();                              /* both answers ride one advance */
      setTimeout(() => {
        const asks = (G.div.seatWins[B] && G.div.seatWins[B].withdrawAsks) || [];
        if (!asks.some(a => a.from === A)) fails.push("B does not see A's offer");
        G.div.answer = { withdrawReplies: { [A]: true } };               /* B promises */
        d.getElementById('advwin').onclick();
        setTimeout(() => {
          const repl = (G.div.seatWins[A] && G.div.seatWins[A].withdrawReplies) || {};
          if (repl[B] !== true) fails.push("A does not see B's promise");
          done();
        }, 400);
      }, 400);
    }, 600);
   }, 600); }, 300); }, 300); }, 300);
function done() {
  if (errs.length) fails.push('page errors: ' + errs.slice(0, 2).join(' ; '));
  console.log(fails.length ? 'FAIL ' + fails.join(' | ') : 'the hotseat holds two OAs in one Divide: two views, a switch, and each answer on its own OA');
  process.exit(fails.length ? 1 : 0);
}
