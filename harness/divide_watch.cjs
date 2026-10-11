/* §GROUND THE DIVIDE, WATCHED. Founds an OA on the built page, skips to the lock, drafts, drops, and plays the
   contest window to window on the Ground page the way a manager sees it: the play from the last window to this
   one, every frame shot, every window's panels read into a log, every captives window settled by keeping them,
   and the browser's own video kept. A contest is judged by watching it; this is where to watch it.
   `node harness/divide_watch.cjs <out-dir> [seed]` (needs Playwright; ffmpeg turns the video into an mp4) */
const fs = require('fs'), path = require('path');
const PW = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright';
const { chromium } = require(PW);
const OUT = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'divide_watch'));
const SEED = process.argv[3] || 'corp-1';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 940 }, recordVideo: { dir: OUT, size: { width: 1400, height: 940 } } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__noTurn = true; });
  const html = fs.readFileSync(path.join(__dirname, '..', 'viewers', 'the_corp.html'), 'utf8').replace('    G = { rng: rng,', '    G = window.__G = { rng: rng,');
  fs.writeFileSync(path.join(OUT, 'page.html'), html);
  await p.goto('file://' + path.join(OUT, 'page.html') + '?seed=' + SEED);
  const ev = (fn, a) => p.evaluate(fn, a);
  const txt = id => ev(i => { const e = document.getElementById(i); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }, id);
  const click = async id => { await ev(i => { const e = document.getElementById(i); if (!e) return; if (e.onclick) e.onclick(); else e.click(); }, id); await p.waitForTimeout(250); };
  const tab = async name => { await ev(n => { const t = [...document.querySelectorAll('#rail .tab')].find(x => x.textContent.trim().toLowerCase() === n.toLowerCase()); if (t) t.click(); }, name); await p.waitForTimeout(300); };
  const closeOver = async () => { await ev(() => {
    if (document.getElementById('dispatch').classList.contains('on')) document.getElementById('dlater').click();
    if (document.getElementById('bizwin') && document.getElementById('bizwin').classList.contains('on')) document.getElementById('bizlater').click(); }); await p.waitForTimeout(200); };
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  const log = [], T0 = Date.now(), ts = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';
  const panels = async () => {
    for (const [k, id] of [['planet', 'gvplanet'], ['board', 'gvboard'], ['since', 'gvsince'], ['yours', 'gvorders'], ['label', 'gdayLbl']])
      log.push('   ' + k.padEnd(7) + (await txt(id)).slice(0, 600));
  };

  await click('mNew'); await click('cfound'); await p.waitForTimeout(300); await closeOver(); await closeOver();
  await click('skiptolock'); await p.waitForTimeout(600); await closeOver(); await closeOver();
  await tab('Desk'); await shot('00_draft');
  log.push(ts() + '  THE DRAFT: ' + (await txt('landing')).slice(0, 300));
  /* the draft: open a region on the overview and pick a zone, as a manager does, until it is done */
  for (let g = 0; g < 8; g++) {
    const done = await ev(() => { const S = window.CDSEASON, G = window.__G; S.draftAdvance(G.state); return G.state.drop.draft.done; });
    if (done) break;
    await ev(() => {
      const G = window.__G, PRE = window.CDPREDIVIDE, D = G.state.drop.draft, all = PRE.landings(G.state.ground);
      const free = all.filter(l => PRE.allowed(l, D.taken, D.picks[G.me], all)).sort((a, b) => b.prize - a.prize)[0];
      if (!free) return;
      const r = document.querySelector('#landmap [data-gvreg="' + free.region + '"]'); if (r) r.dispatchEvent(new Event('click'));
      const z = document.querySelector('#landing [data-landz="' + free.index + '"]'); if (z) z.dispatchEvent(new Event('click'));
    });
    await p.waitForTimeout(250);
  }
  await tab('Desk'); await shot('01_draft_done');
  await ev(() => { const b2 = document.getElementById('dropbtn'); if (b2) b2.click(); else document.getElementById('begindiv').onclick(); }); await p.waitForTimeout(800); await closeOver();
  await tab('The Ground'); await p.waitForTimeout(500); await shot('w00_drop');
  log.push(ts() + '  WINDOW 0 (the drop): ' + await txt('divstate')); await panels();

  let win = 0;
  for (let guard = 0; guard < 40; guard++) {
    const st = await txt('divstate');
    if (/the Divide is over/.test(st)) break;
    /* a captives window over the ground: keep them all, as the default reads */
    const over = await ev(() => document.getElementById('dispatch').classList.contains('on'));
    if (over) { await shot('w' + String(win).padStart(2, '0') + '_over'); log.push(ts() + '  OVER: ' + (await txt('dhead')) + ' · ' + (await txt('events')).slice(0, 300)); await ev(() => document.getElementById('dlater').click()); await p.waitForTimeout(300); continue; }
    win++;
    const tag = 'w' + String(win).padStart(2, '0');
    await click('advwin'); await p.waitForTimeout(100); await closeOver();
    await tab('The Ground');
    log.push(ts() + '  WINDOW ' + win + ': ' + await txt('divstate'));
    /* the play from the last window to this one: a frame each step until it rests */
    for (let f = 0, idle = 0; f < 30; f++) {
      await shot(tag + '_f' + String(f).padStart(2, '0'));
      const playing = await ev(() => /Pause/.test(document.getElementById('gplay').textContent));
      log.push('   ' + ts() + ' f' + f + '  ' + await txt('gdayLbl') + (playing ? ' [playing]' : ''));
      if (!playing) { if (++idle >= 2) break; } else idle = 0;
      await p.waitForTimeout(700);
    }
    await panels();
  }
  /* the finished contest: the last day, and every day scrubbed from the drop */
  await tab('The Ground'); await p.waitForTimeout(400); await shot('zz_end');
  log.push(ts() + '  END: ' + await txt('divstate')); await panels();
  const days = await ev(() => (window.__G.div && window.__G.div.final && window.__G.div.final.replay ? window.__G.div.final.replay.days.length : 0));
  for (let d = 1; d <= days; d++) {
    await ev(n => { const e = document.getElementById('gday'); e.value = String(n); e.dispatchEvent(new Event('input')); }, d); await p.waitForTimeout(350);
    await shot('day_' + String(d).padStart(2, '0'));
  }
  log.push('page errors: ' + (errs.length ? errs.join(' | ') : 'none'));
  fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n'));
  await ctx.close(); await b.close();
  const vid = fs.readdirSync(OUT).find(f => /\.webm$/.test(f));
  console.log('watched ' + win + ' windows · ' + days + ' days · ' + (errs.length ? errs.length + ' page errors' : 'no page errors') + ' · ' + OUT + (vid ? ' · video ' + vid : ''));
})();
