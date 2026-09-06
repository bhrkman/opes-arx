#!/usr/bin/env node
/* THE UI AUDIT — run after every change to viewers/corp_template.html. It fails on the three
   things that keep creeping back into the page no matter how many notes are left:

     1. CASE      — user-facing text is Title Case (small words stay small). "on the board" is
                    a finding; "On the Board" is not.
     2. PROSE     — the page does not explain itself. A display string of ten words or more
                    that reads as a sentence (a full stop, a "because", a "so that", an
                    explaining dash) is a finding. Labels, values and verdicts are not.
     3. COLOUR    — colour comes from the conventions, not from a hex typed at the point of
                    use. Stat colours from STATCOL/gradeColour, credits from crs(), houses from
                    cSpan()/colFor(), names from raceColour(), everything else from a CSS var or
                    the named palette tables. A raw hex or rgba in the page's JS outside those
                    tables is a finding; so is a plain cr() spliced into HTML, a bare
                    nameOfCorp(), or a fighter's name printed without its race colour.

   Findings the project has decided to keep live in harness/audit_ui.allow.json, keyed by the
   exact string; anything not listed fails the run. `node harness/audit_ui.cjs` prints the
   findings and exits 1 if any stand. Add it to the gate; do not add to the allowlist to make
   a run green — fix the page.                                                            */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] || path.join(ROOT, 'viewers', 'corp_template.html');
const ALLOW_PATH = path.join(__dirname, 'audit_ui.allow.json');
const raw = fs.readFileSync(FILE, 'utf8');
/* comments are not the page: blank out block comments, line comments and HTML comments,
   keeping the line structure so findings still point at real lines */
function stripComments(text) {
  let out = '', i = 0, n = text.length;
  while (i < n) {
    if (text.startsWith('/*', i)) { const j = text.indexOf('*/', i + 2); const end = j < 0 ? n : j + 2; out += text.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (text.startsWith('<!--', i)) { const j = text.indexOf('-->', i + 4); const end = j < 0 ? n : j + 3; out += text.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (text.startsWith('//', i) && !/https?:$/.test(out.slice(-6))) { const j = text.indexOf('\n', i); const end = j < 0 ? n : j; out += text.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (text[i] === "'" || text[i] === '"') {           /* skip over string literals whole */
      const q = text[i]; let j = i + 1;
      while (j < n && text[j] !== q && text[j] !== '\n') { if (text[j] === '\\') j++; j++; }
      out += text.slice(i, Math.min(n, j + 1)); i = j + 1; continue;
    }
    out += text[i]; i++;
  }
  return out;
}
const src = stripComments(raw);
const lines = src.split('\n');
const allow = fs.existsSync(ALLOW_PATH) ? JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8')) : { case: [], prose: [], colour: [] };

/* words that stay lower-case inside a title */
const SMALL = new Set(('the a an and or nor but of to in on at for by with from as is are was were be been being not no ' +
  'so yet if than that this into onto over under per via vs it its off up out down your their our my his her they them ' +
  'you we he she who whom whose which what when where why how do does did has have had may can will would should could ' +
  'mo yr hr min px pt pct of').split(' '));
/* tokens that are not English words at all */
const TECH = /^(\\u[0-9a-f]{4}|&[a-z]+;|[a-z]+_[a-z_]+|[a-z]+\.[a-z.]+|https?:|www\.|\d|[%$₡#]|--|var\(|rgb|rgba|px|em|rem|vh|vw|auto|none|inherit|solid|dashed|dotted|bold|normal|italic|uppercase|center|left|right|flex|grid|block|inline|hidden|scroll|nowrap|baseline|column|row|transparent|evenodd|round|square|butt|miter|bevel|top|bottom|middle|start|end)/i;

/* where the script starts: text above it is HTML, where display text sits between tags */
const scriptAt = lines.findIndex(l => /<script>/.test(l) && !/src=/.test(l));

function stripTags(s) { return s.replace(/<[^>]*>/g, ' '); }
function isCssish(s) { return /^[\s.#\[\]a-z0-9_-]+\{/.test(s) || /:\s*[^;]+;/.test(s) || /^\s*[.#][a-zA-Z]/.test(s); }
function isCodey(s) { return /[{}=;]|=>|\bfunction\b|\breturn\b|\bvar\b|\bnull\b|\btrue\b|\bfalse\b|\bdata-[a-z]/.test(s); }

const findings = { case: [], prose: [], colour: [] };
const seen = new Set();
function add(kind, ln, text, note) {
  const key = text.trim();
  if (!key || seen.has(kind + '|' + key)) return;
  seen.add(kind + '|' + key);
  if ((allow[kind] || []).indexOf(key) >= 0) return;
  findings[kind].push({ line: ln + 1, text: key, note });
}

/* ---- 1 & 2: the display strings ---- */
function displayRuns(rawLiteral) {
  /* a literal may hold HTML: keep only the text between tags, split into runs */
  return stripTags(rawLiteral).split(/\s{2,}|\\u00b7|·|\|/).map(r => r.trim()).filter(r => /[A-Za-z]{2}/.test(r) && !/monospace|sans-serif|serif\b|Menlo/.test(r));
}
function checkCase(run, ln) {
  /* a run that is one word is a label; a run that is a fragment joined to code may start
     mid-title, so only the words after the first are judged */
  const words = run.replace(/[()\[\]"“”:,.!?…—–-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2) return;
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (!/^[a-z]/.test(w)) continue;                 /* capitalised, a number, a symbol */
    if (SMALL.has(w.toLowerCase())) continue;
    if (TECH.test(w)) continue;
    if (w.length < 3) continue;
    if (/[A-Z]/.test(w.slice(1))) continue;           /* camelCase code leaking in: not prose */
    add('case', ln, run, 'lower-case "' + w + '"');
    return;
  }
}
const VERBISH = /\b(Is|Are|Was|Were|Signs?|Chooses?|Read|Sets?|Comes?|Opens?|Closes?|Runs?|Makes?|Does|Do|Will|Cannot|Can|Has|Have|Takes?|Gets?|Goes|Stands?|Means|Wants?|Sees|Says)\b/;
function checkProse(run, ln) {
  const words = run.split(/\s+/).filter(Boolean);
  /* a clause built around a verb is the page explaining itself, however short */
  if (words.length >= 6 && VERBISH.test(run) && !/^\d|\d%|₡/.test(run)) { add('prose', ln, run, 'a clause: ' + words.length + ' words around a verb'); return; }
  if (words.length < 10) return;
  if (/\.\s|\.$|\bbecause\b|\bso that\b|\bwhich means\b|\bmeans\b|\bthis is\b|\bthat is\b|\bnote\b/i.test(run) || (words.length >= 14))
    add('prose', ln, run, words.length + ' words');
}

let narrative = false;   /* inside a multi-line log statement */
let inStyle = false;
lines.forEach((line, ln) => {
  const startsNarr = /\bdlog\(|console\.|\bdesklog|\bTLOG = |\.lore = |new Error\(|'use strict'/.test(line);
  if (startsNarr || narrative) {                                       /* the log narrates; console is not UI */
    narrative = !/\);\s*$/.test(line);
    return;
  }
  const tooltipOnly = /title=/.test(line) && !/innerHTML|textContent/.test(line);
  if (ln < scriptAt) {
    /* HTML: the text between tags; the <style> block is not text */
    if (/<style>/.test(line)) inStyle = true;
    if (/<\/style>/.test(line)) { inStyle = false; return; }
    if (inStyle) return;
    if (/<canvas|<img|<input|<link|<meta/.test(line) && !/>[^<]*[A-Za-z]{2}[^<]*</.test(line)) return;
    if (/^\s*[a-z-]+="[^"]*"\s*>?\s*$/.test(line) || /^\s*style="/.test(line)) return;   /* an attribute continuation line */
    displayRuns(line).forEach(run => { checkCase(run, ln); checkProse(run, ln); });
    return;
  }
  /* JS: the single-quoted literals, comments already skipped */
  const lits = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "'" ) {
      let j = i + 1, buf = '';
      while (j < line.length && line[j] !== "'") { if (line[j] === '\\') { buf += line[j] + (line[j + 1] || ''); j += 2; continue; } buf += line[j]; j++; }
      lits.push(buf); i = j + 1; continue;
    }
    if (line[i] === '"') {                                            /* skip attribute values */
      let j = i + 1; while (j < line.length && line[j] !== '"') j++; i = j + 1; continue;
    }
    i++;
  }
  lits.forEach(lit => {
    const bare = stripTags(lit);                                       /* judge the text, not the markup */
    if (isCssish(bare) || isCodey(bare)) return;
    if (/^[\sa-z_:.#\-\[\]]+$/.test(bare) && !/\s[a-z]/.test(bare.trim())) return;   /* a key, a selector, a class */
    displayRuns(lit).forEach(run => { checkCase(run, ln); if (!tooltipOnly) checkProse(run, ln); });
  });
});

/* ---- 3: colour ---- */
/* THE NAMED TABLES are where colour is allowed to be spelt out: the palettes, the race
   fills, the stat colours, the canvas token table. A table runs from its `var X = {` to the
   closing `};`. Everything else in the page's JS takes colour from a CSS var, a table, or a
   convention function. */
const TABLE_START = /\b(var|const|let)\s+(PALETTES|PALETTE_FALLBACK|WATER_COL|PEAK_COL|STATCOL|RACE|TOK|TERRAIN|TERRAIN_NAME)\s*=/;
const TABLE_LINE = /PALETTES|PALETTE_FALLBACK|WATER_COL|PEAK_COL|STATCOL|\bRACE\b|TOK\.|TOK\[|shadeByHeight|gradeColour|colFor|raceColour|terrainColour|:root|--s-|--sq|--o-|var crs = |function rgba|\bmix\(|\.join\(','\)/;
let inTable = false;
lines.forEach((line, ln) => {
  if (ln < scriptAt) return;                                          /* CSS holds the tokens */
  if (TABLE_START.test(line)) inTable = true;
  const tableHere = inTable || TABLE_LINE.test(line);
  if (inTable && /};/.test(line)) inTable = false;
  if (!tableHere) {
    const hexes = line.match(/#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g) || [];
    hexes.forEach(h => add('colour', ln, h, 'raw colour in JS — use a CSS var or the TOK table'));
  }
  /* credits spliced plain */
  if (/\+ ?cr\(/.test(line) && /innerHTML|\+ ?'<|'<|h \+=|return '/.test(line) && !/var crs = |title=|class="(buy|gold|cr)"/.test(line)) add('colour', ln, line.trim().slice(0, 100), 'plain cr() in HTML — credits are gold: crs()');
  /* a house by name without its colour */
  if (/esc\(nameOfCorp\(/.test(line) && !/title="' \+ esc\(nameOfCorp/.test(line) && !/<option[^>]*colFor\(/.test(line)) add('colour', ln, line.trim().slice(0, 100), 'nameOfCorp() in HTML — houses are cSpan()');   /* a tooltip cannot carry colour */
  /* a fighter by name without the race colour (the two lines above may carry the style) */
  const near = lines.slice(Math.max(0, ln - 2), ln + 1).join(' ');
  if (/esc\((b|f|u|x)\.name\)/.test(line) && !/raceColour|nameSpan/.test(near) && !/label:|title=/.test(line) && /'<|innerHTML|h \+=|return '/.test(line))
    add('colour', ln, line.trim().slice(0, 100), 'a fighter\'s name without raceColour()');
});

/* ---- report ---- */
let total = 0;
for (const kind of ['case', 'prose', 'colour']) {
  const list = findings[kind];
  if (!list.length) continue;
  console.log('\n== ' + kind.toUpperCase() + ' (' + list.length + ') ==');
  list.forEach(f => console.log('  L' + f.line + '  ' + f.text.slice(0, 110) + (f.note ? '   ← ' + f.note : '')));
  total += list.length;
}
console.log(total ? '\n' + total + ' finding(s) — fix the page, or record a deliberate exception in harness/audit_ui.allow.json' : 'ui audit clean');
process.exit(total ? 1 : 0);
