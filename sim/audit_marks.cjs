/* WHAT A PIECE LOOKS LIKE WHEN IT IS TURNED. Every transform in the builder rotates about the
   box's centre (12,12), so a piece whose ink does not sit centred on that point swings on a
   hinge beside itself — which is what happened to the star and what a manager notices as a
   shape "coming off unbalanced". This reads the kit's own source, samples each piece's outline,
   and reports how far its ink is from the pivot and how far from radially even. */
const fs = require('fs');
const h = fs.readFileSync('/home/claude/opes-arx/viewers/corp_template.html', 'utf8');
function grab(name) {
  const a = h.indexOf('  var ' + name + ' = [');
  const b = h.indexOf('\n  ];', a);
  return h.slice(a, b).split('\n').filter(l => l.trim().startsWith("'")).map(l => l.trim().replace(/^'/, '').replace(/',?\s*(\/\*.*)?$/, ''));
}
/* sample an element's outline into points: paths by their coordinate pairs, plus rect/circle */
function points(src) {
  const pts = [];
  /* A PIECE MAY BE SAT BACK ON THE PIVOT by a wrapping translate — the audit has to see
     through it, or it condemns the very fix it asked for. */
  let dx = 0, dy = 0;
  const tr = src.match(/<g transform="translate\(([-\d.]+)\s+([-\d.]+)\)"/);
  if (tr) { dx = +tr[1]; dy = +tr[2]; }
  const circ = /<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"/g;
  let m;
  while ((m = circ.exec(src))) {
    const [cx, cy, r] = [+m[1], +m[2], +m[3]];
    for (let i = 0; i < 24; i++) pts.push([cx + Math.cos(i / 24 * 6.283) * r, cy + Math.sin(i / 24 * 6.283) * r]);
  }
  const rect = /<rect[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/g;
  while ((m = rect.exec(src))) {
    const [x, y, w, hh] = [+m[1], +m[2], +m[3], +m[4]];
    pts.push([x, y], [x + w, y], [x, y + hh], [x + w, y + hh]);
  }
  const dAttr = /d="([^"]+)"/g;
  while ((m = dAttr.exec(src))) {
    const d = m[1];
    /* absolute commands only carry usable coordinates; relative runs are walked */
    let cur = [0, 0];
    const toks = d.match(/[A-Za-z]|-?[\d.]+/g) || [];
    let i = 0, cmd = 'M';
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) { cmd = toks[i++]; continue; }
      const n = k => +toks[i + k];
      const up = cmd.toUpperCase(), rel = cmd !== up;
      const take = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 }[up] || 2;
      if (up === 'H') { cur = [rel ? cur[0] + n(0) : n(0), cur[1]]; }
      else if (up === 'V') { cur = [cur[0], rel ? cur[1] + n(0) : n(0)]; }
      else if (up === 'Z') { i += 0; }
      else {
        const px = n(take - 2), py = n(take - 1);
        cur = rel ? [cur[0] + px, cur[1] + py] : [px, py];
      }
      if (up !== 'Z') pts.push([cur[0], cur[1]]);
      i += take;
    }
  }
  return pts.map(q => [q[0] + dx, q[1] + dy]);
}
function report(label, arr) {
  console.log('\n== ' + label + ' ==');
  arr.forEach((src, idx) => {
    if (!src) { console.log('  ' + idx + '  (none)'); return; }
    const p = points(src);
    if (!p.length) { console.log('  ' + idx + '  no points read'); return; }
    /* THE BOUNDING BOX IS THE WRONG MEASURE FOR AN ODD-SIDED SHAPE. A pentagram centred
       exactly on its circumcircle still has a bbox sitting high, because it has one point up
       and two down — judging by the box condemned the star that had just been fixed. What
       matters for a turn is where the INK averages out: the centroid of the outline. */
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    const bx = (Math.min(...xs) + Math.max(...xs)) / 2, by = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const off = Math.hypot(cx - 12, cy - 12);
    /* radial evenness: how much the distance from the pivot varies around the outline */
    const rs = p.map(q => Math.hypot(q[0] - 12, q[1] - 12));
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const spread = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length) / (mean || 1);
    /* a BAR is allowed to sit off the pivot — a ground-line belongs at the foot, and turning
       it is how a manager puts it on another side. Only fields and devices must be centred. */
    /* SPREAD IS NOT THE TEST, and it condemned the Gil goggles — two circles either side of
       the pivot are radially uneven and rotate perfectly evenly, because they are SYMMETRIC
       about it. What matters is only whether the ink averages out on the pivot; spread is
       printed because it is worth seeing, and judged on by nobody. */
    const mustCentre = label !== 'BARS';
    const flag = (mustCentre && off > 0.45) ? '  <-- OFF THE PIVOT' : '';
    if (flag) BAD.push(label + ' ' + idx + ' (off ' + off.toFixed(2) + ')');
    console.log('  ' + String(idx).padStart(2) + '  ink ' + cx.toFixed(2) + ',' + cy.toFixed(2) +
                '  box ' + bx.toFixed(2) + ',' + by.toFixed(2) +
                '  off ' + off.toFixed(2) + '  spread ' + spread.toFixed(2) + flag);
  });
}
const BAD = [];
report('FIELDS', grab('MK_FIELDS'));
report('DEVICES', grab('MK_DEVICES'));
report('BARS', grab('MK_BARS'));
console.log('\n  ' + BAD.length + ' piece(s) that would swing on a hinge beside themselves' +
            (BAD.length ? ':\n    ' + BAD.join('\n    ') : ''));
if (BAD.length) process.exit(1);
