/* Builds the_corp.html — the unified shell, first link.
 *
 * One corporation lives in the page's memory and every tab reads the same one. This step
 * joins two surfaces onto it — the bench (hiring, against the whole fleet bidding) and the
 * firefight (the lock, the fielding, the fight, the settlement) — because the smallest real
 * link is the one to find a wrong shape on. The page contains NO builder of its own: founding,
 * the market, the lock, the arming, the fielding and the settlement are the engine's exported
 * functions, inlined live. proved end to end by `probe_corp_link.cjs` before this page existed.
 *
 *   node build_corp.cjs        ->  viewers/the_corp.html
 */
const fs = require('fs');
const D = __dirname + '/';

/* ORDER MATTERS — each module captures its dependencies at load time. The season needs the
   sponsor and pre-Divide modules too; the desk's list is the precedent. */
const MODULES = ['prng.js', 'roster.js', 'items.js', 'map.js', 'ledger.js', 'reputation.js',
                 'combat.js', 'tactical.js', 'negotiate.js', 'sponsors.js', 'predivide.js',
                 'divide.js', 'trade.js', 'season.js'];
const DATA = ['races.json', 'traits.json', 'oa_profiles.json', 'oa_display.json', 'oa_marks.json', 'recruitment.json', 'items.json'];

let js = '';
for (const m of MODULES) js += '\n/* ==== ' + m + ' ==== */\n' + fs.readFileSync(D + m, 'utf8');

let data = 'window.ARX_DATA = {\n';
for (const d of DATA) {
  data += '  ' + JSON.stringify(d.replace('.json', '')) + ': ' +
          fs.readFileSync(D + '../data/' + d, 'utf8') + ',\n';
}
data += '};\n';

const tplPath = D + '../viewers/corp_template.html';
if (!fs.existsSync(tplPath)) {
  console.error('corp_template.html is missing — a build script whose template is gone is not a build script');
  process.exit(1);
}
const tpl = fs.readFileSync(tplPath, 'utf8');
for (const marker of ['/*__DATA__*/', '/*__SIM__*/']) {
  if (tpl.indexOf(marker) < 0) { console.error('template lost its ' + marker + ' marker'); process.exit(1); }
}
const out = tpl.replace('/*__DATA__*/', data).replace('/*__SIM__*/', js);

/* MARKERS FOR FEATURES, NOT FOR PROSE — code the page must contain to be the page this
   template describes: the fleet founding, the contested market, the engine's lock and
   fielding, the engine's settlement with its bag initialised, the kit handed back to the
   locker, and the grid drawn rows-first. */
const MUST_CONTAIN = ['openFleet(', 'runMercMarket(', 'selectDrop(', 'buildCorp(',
                      'liveSquad(', 'applyOutcome(', 'stressApplied', 'stockLeft',
                      /* 'returnKit' and  left this list with the scrim —
                         the replay room keeps applyOutcome and liveSquad above, which
                         are the Divide's own */
                      'tiles[y]', 'CDTACTICAL',
                      /* the restored firefight presentation: tweened movement, tracers
                         per trigger pull, and the events feed read off the fight's log */
                      'G.tween', 'buildShots(', 'res.log',
                      /* the manager's squads: the plan on the page, the groups honored by
                         the lock, and the named leader honored by the fielding */
                      'G.plan', 'persist.groups', 'captainId',
                      /* identity: every house wears its own derived colour */
                      'colFor(', 'markFor(',
                      /* time: the year opened, months stepped, and the calendar's own
                         signing windows bid into and closed */
                      'beginSeason(', 'stepMonth(', 'lotFor(', 'placeBid(',
                      /* the focus chassis: tracks, the cap, and the corp's own prefill */
                      'monthTracks(', 'chooseFocus(', 'data-focus',
                      /* the training menu: the drill can be aimed */
                      'trainTarget', 'SKILL_FAMILIES',
                      /* boost: pay to double the focus on a track */
                      '_boost', 'BOOST_PER_POINT', 'data-boost',
                      /* the ground and the firefight, tied: the season closed to the drop,
                         the Divide stepped window to window, encounters handed over with
                         their frames, and the season settling its own contest */
                      'closeSeasonToDrop(', 'divideCore(', 'onBattle', 'finishSeason(',
                      /* the Table: the window's answer composed and sent, the stance
                         ladder, and the verdict echo read back with its numbers */
                      'G.div.answer', 'NOTCHES', 'canJoin', 'techo',
                      /* the Dividend's lights: the season keeps every match whole and
                         the firefight replays them all year */
                      'dividend.watch', 'data-watchl',
                      /* the manager's hand: named kit drawn from the rack, honored whole */
                      'handRefused', 'bySlot(',
                      /* the squads board: drag-drop, paper-doll, equip picker */
                      'data-slot', 'openPicker', 'leaderOf', 'renameSquad',
                      /* the shell: menu, founding, the blank-slate house, and saves that
                         continue identically through the engine's own career serializer */
                      'saveCareer(', 'loadCareer(', 'blankSlate', 'data-oa', 'opesarx_saves'];
const missing = MUST_CONTAIN.filter(t => out.indexOf(t) < 0);
if (missing.length) {
  console.error('the built page is not the page this template describes.\n  missing: ' + missing.join(', '));
  process.exit(1);
}
fs.writeFileSync(D + '../viewers/the_corp.html', out);
/* The build message is not evidence — the size and module count are read back off the file. */
console.log('the_corp.html written · ' +
            Math.round(fs.statSync(D + '../viewers/the_corp.html').size / 1024) + 'KB · live engine, ' +
            MODULES.length + ' modules inlined');
