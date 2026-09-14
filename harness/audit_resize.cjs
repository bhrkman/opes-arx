/* NOTHING MAY BE DESTROYED BY MAKING THE WINDOW SMALLER.
   A game's chrome does not delete itself when a person drags a corner: elements may shrink,
   wrap or scroll, but a thing that was on the screen at one size must still be on the screen at
   another. jsdom computes no layout, so this reads the STYLESHEET — every rule inside a width
   media query that hides, removes or zeroes an element — and reports what each breakpoint takes
   away. `node harness/audit_resize.cjs` */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'viewers', 'the_corp.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.lastIndexOf('</style>'));

/* every width-bounded media block, with what it contains */
const blocks = [];
const re = /@media\s*\(([^)]*max-width[^)]*)\)\s*\{/g;
let m;
while ((m = re.exec(css))) {
  let depth = 1, i = re.lastIndex;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  blocks.push({ at: m[1].trim(), body: css.slice(re.lastIndex, i - 1) });
}

/* `min-width:0` and `max-width:0` are not removals — the first cut matched inside them and
   reported the menu column as destroyed when it was being told to shrink. Only a bare
   `width`/`height` of zero counts. */
const KILLS = /display\s*:\s*none|visibility\s*:\s*hidden|(^|[;{\s])(width|height)\s*:\s*0\s*(;|$)|content-visibility\s*:\s*hidden/i;
const findings = [];
for (const b of blocks) {
  /* split the block into its own rules and keep the ones that remove something */
  const rules = b.body.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const r of rules) {
    const sel = r.slice(0, r.indexOf('{')).trim();
    const decl = r.slice(r.indexOf('{') + 1, r.lastIndexOf('}'));
    if (!KILLS.test(decl)) continue;
    findings.push({ at: b.at, sel: sel, why: (decl.match(KILLS) || [''])[0] });
  }
}

console.log('\n== WHAT A NARROWER WINDOW TAKES AWAY ==');
if (!findings.length) console.log('  nothing: every element survives every width');
for (const f of findings) console.log('  ' + f.at.padEnd(18) + f.sel.padEnd(44) + f.why);

/* a small allow-list: things that SHOULD go, because they are duplicated elsewhere or are
   chrome a narrow screen genuinely has no room for and loses nothing by dropping */
const ALLOW = [
  '#yearline', '#agenda',            /* the rail and the agenda are repeated in the page body */
  '.tgguard'                         /* a dead strip beside a pip track, not an element */
];
const bad = findings.filter(f => !ALLOW.some(a => f.sel.indexOf(a) >= 0));
console.log('');
if (bad.length) {
  console.log('  ' + bad.length + ' element(s) destroyed by a resize, with nowhere else to be seen:');
  for (const f of bad) console.log('    ' + f.at + '  ' + f.sel);
  process.exit(1);
}
console.log('  nothing is destroyed by a resize that is not shown elsewhere');

/* AND THE OTHER HALF: A RULE THAT UNDOES A RULE. The chrome is pinned with `flex-wrap:nowrap`
   so the rail and the header hold their line — and a later media block set the header back to
   `wrap`, which is how an element gets "moved" rather than removed. A narrow-width block that
   re-wraps something the base said must not wrap is reported. */
const PINNED = ['#rail', 'header'];
const undone = [];
for (const b of blocks) {
  const rules = b.body.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const r of rules) {
    const sel = r.slice(0, r.indexOf('{')).trim();
    const decl = r.slice(r.indexOf('{') + 1, r.lastIndexOf('}'));
    if (!/flex-wrap\s*:\s*wrap/.test(decl)) continue;
    if (PINNED.some(pn => sel.split(',').some(one => one.trim() === pn)))
      undone.push(b.at + '  ' + sel);
  }
}
console.log('');
if (undone.length) {
  console.log('  ' + undone.length + ' rule(s) let pinned chrome wrap again at a narrow width:');
  for (const u of undone) console.log('    ' + u);
  process.exit(1);
}
console.log('  and the pinned chrome holds its line at every width');

/* §MENU AND THE THING THAT ACTUALLY MADE THE MENU JUMBLE. Nothing was being destroyed — two
   elements were being POSITIONED INTO EACH OTHER'S SPACE: the side portraits pushed down 7vh by
   a transform while the menu was pulled up 9vh by a negative margin. Two shifts measured in
   viewport height, walking toward one another, so on a tall window they framed the title and on
   a short one they landed on top of it. No clamp on the SIZES could have helped, because the
   overlap was the layout rather than a side effect of it.
   A negative margin or a viewport-unit translate on the stage is that fault waiting to happen:
   the rule is that rows do not enter other rows, and the grid enforces it. */
const stage = css.slice(css.indexOf('.menustage'), css.indexOf('.menufleet') + 400);
const risky = [];
const menuRules = stage.match(/[^{}]+\{[^{}]*\}/g) || [];
for (const r of menuRules) {
  const sel = r.slice(0, r.indexOf('{')).trim();
  const decl = r.slice(r.indexOf('{') + 1, r.lastIndexOf('}'));
  if (!/\.moval|\.menuovals|\.menucol|\.menustage/.test(sel)) continue;
  if (/margin[a-z-]*\s*:\s*[^;]*-\d/.test(decl)) risky.push(sel + ' — a negative margin');
  if (/transform\s*:\s*translate[^;]*v[hw]/.test(decl)) risky.push(sel + ' — a viewport-unit translate');
}
console.log('');
if (risky.length) {
  console.log('  ' + risky.length + ' rule(s) can walk the menu into itself:');
  for (const r of risky) console.log('    ' + r);
  process.exit(1);
}
console.log('  and nothing on the menu is positioned into another element\'s space');

/* §MENU THE WORDS TAKE THEIR HEIGHT AND THE PICTURES TAKE WHAT IS LEFT. Three passes failed
   here the same way: the pictures were sized from the VIEWPORT and the words took whatever
   remained, so a viewport-sized picture plus a text block of its own height could add up to more
   than the screen and the buttons fell off the bottom. Every fix that scaled the pictures better
   only moved where it broke.
   The architecture that cannot break: the stage is exactly the window and does not scroll; the
   text rows are `flex:0 0 auto`; and the picture row is `flex:1 1 auto` with `min-height:0`,
   which is the declaration that lets a flex child shrink below its content. Take any of those
   three away and the bottom of the screen can be cut off again. */
{
  const stageRules = (css.match(/[^{}]+\{[^{}]*\}/g) || [])
    .filter(r => /\.menustage|\.menuovals|\.menucol|\.menufleet/.test(r.slice(0, r.indexOf('{'))));
  /* `.menucol` is styled as `.menustage .menucol`, so an endsWith on the selector finds it and
     an exact match does not — the first cut reported the rule missing when it was present. */
  const find = (sel) => stageRules.filter(r => r.slice(0, r.indexOf('{')).includes(sel)).join(' ') || '';
  const need = [
    ['.menustage', /height:100dvh/, 'the stage is exactly the window'],
    ['.menustage', /overflow:hidden/, 'and does not scroll'],
    ['.menuovals', /flex:1 1 auto/, 'the pictures take what is left'],
    ['.menuovals', /min-height:0/, 'and may shrink below their content'],
    ['.menucol', /flex:0 0 auto/, 'the words take only their own height'],
    ['.menufleet', /flex:0 0 auto/, 'and so do the marks']
  ];
  const broken = need.filter(([sel, re]) => !re.test(find(sel)));
  console.log('');
  if (broken.length) {
    console.log('  the menu can be cut off again — ' + broken.length + ' of its structural rules are gone:');
    for (const [sel, , why] of broken) console.log('    ' + sel + ': ' + why);
    process.exit(1);
  }
  console.log('  the menu fits the window by construction: words take their height, pictures the rest');
}

/* §MENU THE ONE-SCALE CHECK IS SUPERSEDED AND GONE. It required every length on the stage to be
   a multiple of a single unit — which was the right answer to "the parts shrink at different
   rates" and the WRONG answer to "the parts do not fit". A unit derived from the viewport sizes
   the pictures from the viewport, which is the fault the rebuild above removed. The rule that
   replaces it is structural, not arithmetic: the words take their height, the pictures take the
   remainder, and a `clamp` on a font size is no longer a crime. */
