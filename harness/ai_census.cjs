#!/usr/bin/env node
/* =============================================================================================
   THE AI USAGE CENSUS — what the engine's OAs actually do with the game.

   Every seat is the engine. Several worlds, several years each. For every system a person can
   use, it counts how often each house uses it and which choice it makes, and flags:
     NEVER  — nobody in the fleet ever used it
     RARE   — used, but less than once in ten house-years
     SAME   — used, but one choice is 95%+ of every use
     BLIND  — used, varied, but the eight houses make near-identical choices (temperament unread)

   Usage:  node harness/ai_census.cjs [worlds=3] [seasons=3] [--json out.json]
   Reads the game only through what it leaves behind, plus the season's one census hook
   (`useCensus`) for the month's focus, which nothing else records.
   ============================================================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const SIM = path.join(__dirname, '..', 'sim');
const P = require(path.join(SIM, 'prng.js'));
const S = require(path.join(SIM, 'season.js'));
const REP = require(path.join(SIM, 'reputation.js'));
const EVENTS = require(path.join(SIM, 'events.js'));
const DIVIDE = require(path.join(SIM, 'divide.js'));
const F = require(path.join(SIM, 'facilities.js'));
const oa = require(path.join(__dirname, '..', 'data', 'oa_profiles.json')).oa_profiles;

const args = process.argv.slice(2);
const WORLDS = Number(args[0]) || 3, SEASONS = Number(args[1]) || 3;
const jsonOut = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;

/* tally[system][house][choice] = count; uses[system][house] = count of occasions */
const tally = {}, occasions = {};
function note(sys, house, choice, n) {
  const t = (tally[sys] = tally[sys] || {}); const h = (t[house] = t[house] || {});
  h[choice] = (h[choice] || 0) + (n == null ? 1 : n);
}
function chance(sys, house) { const o = (occasions[sys] = occasions[sys] || {}); o[house] = (o[house] || 0) + 1; }

/* ---------------------------------------------------------------------------- the hooks */
S.useCensus((id, kind, d) => {
  if (kind !== 'focus' || !d.engine) return;
  chance('focus', id);
  for (const k in d.focus) {
    if (k === '_boost') { for (const b in d.focus._boost) if (d.focus._boost[b]) note('focus.boost', id, b); continue; }
    if (/Target$/.test(k)) { const t = d.focus[k]; note('focus.target', id, k + ':' + (t && (t.kind || t.shape || (typeof t === 'string' ? t : 'map')) || 'none')); continue; }
    if (d.focus[k]) note('focus', id, k, d.focus[k]);
  }
});
const _act = REP.act;
REP.act = function (rep, type, ctx) {
  const who = rep && (rep.id || rep.corpId || (rep.profile && rep.profile.id));
  if (who) note('acts', who, type);
  return _act.apply(this, arguments);
};
const _settle = EVENTS.settle;
EVENTS.settle = function (state, corpId, isAI) {
  const out = _settle.apply(this, arguments);
  for (const r of out || []) {
    if (!r || !r.option) continue;
  }
  const box = state.events && state.events[corpId];
  if (box) for (const ev of box.list) if (ev.resolved) note('event.' + ev.pool, corpId, ev.resolved.defaulted ? '(default)' : ev.resolved.option);
  return out;
};
let divideStats = null;
const _run = DIVIDE.runDivide;
DIVIDE.runDivide = function () { const r = _run.apply(this, arguments); divideStats = r; return r; };

/* ---------------------------------------------------------------------------- one career */
const statSum = f => { let t = 0; for (const k in (f.stats || {})) t += f.stats[k] || 0; return t; };
function career(w) {
  const rng = P.mulberry32(P.seedFrom('census' + w));
  const corps = S.openFleet(rng, oa, { worldSeed: 1000 + w });
  const ids = Object.keys(corps);
  for (let s = 0; s < SEASONS; s++) {
    const st = S.beginSeason(rng, corps, oa, {});
    /* who was here as the year opened, and what they carried */
    const had = {}; for (const id of ids) had[id] = new Set(corps[id].roster.map(f => f.id));
    const staff0 = {}; for (const id of ids) staff0[id] = JSON.stringify(Object.keys(((corps[id].staff || {}).posts) || {}).filter(p => corps[id].staff.posts[p]).sort());
    const fac0 = {}; for (const id of ids) fac0[id] = (corps[id].facilities && corps[id].facilities.history || []).length;
    const led0 = {}; for (const id of ids) led0[id] = corps[id].account.ledger.length;
    const cap0 = {}; for (const id of ids) cap0[id] = JSON.stringify(corps[id].captains || []);
    for (const id of ids) chance('year', id);
    /* the recruit draft */
    if (st.recruitDraft) for (const p of st.recruitDraft.picks) {
      const f = corps[p.corp].roster.find(x => x.id === p.fighter);
      const top = f ? Object.entries(f.stats || {}).sort((a, b) => b[1] - a[1])[0][0] : '?';
      note('draft.pick', p.corp, (p.how || 'pick') + ':best ' + top);
    }
    while (st.month <= S.CONST.PREP_MONTHS) {
      const m = st.month;
      const before = {}; for (const id of ids) before[id] = new Set(corps[id].roster.map(f => f.id));
      S.stepMonth(st);
      for (const id of ids) {
        const c = corps[id];
        /* signings this month, by where they came from */
        for (const f of c.roster) if (!before[id].has(f.id) && !f.mirror_of) note('signed', id, 'M' + m + ':' + ((f.contract && f.contract.kind) || f.pool || '?'));
        /* the month's word */
        const tk = c._talked;
        if (tk && tk.abs === st.season * 100 + m) note('talk', id, tk.kind + (tk.how ? ':' + tk.how : ''));
        chance('talk', id);
      }
    }
    /* the year's decisions read off what they left */
    for (const id of ids) {
      const c = corps[id];
      const posts = (c.staff && c.staff.posts) || {};
      for (const p in posts) if (posts[p]) note('staff.held', id, p + ':' + (posts[p].origin || '?') + (posts[p].school ? '/' + posts[p].school : ''));
      if (c.staff && c.staff.mole) note('staff.mole', id, c.staff.mole.target || 'planted');
      const hist = (c.facilities && c.facilities.history) || [];
      for (const h of hist.slice(fac0[id])) note('facility.built', id, h.id + ' L' + h.level);
      for (const e of c.account.ledger.slice(led0[id])) {
        const lab = String(e.label || '').replace(/[\d₵,.]+/g, '#').slice(0, 40);
        if (/market|shelf|dealer|bought|Kit/i.test(lab)) note('spend.gear', id, lab);
      }
      if (JSON.stringify(c.captains || []) !== cap0[id]) note('captains', id, 'changed');
      for (const f of c.roster) if (!had[id].has(f.id) && !f.mirror_of) chance('newcomer', id);
    }
    /* trades */
    for (const o of ((st.trade && st.trade.offers) || [])) {
      note('trade.written', o.from, (o.status || 'open') + (o.offer && o.offer.units && o.offer.units.length ? ':offers-bodies' : '') + (o.offer && o.offer.intel && o.offer.intel.length ? ':offers-intel' : ''));
    }
    /* the Eight, the Dividend, the drop */
    const E = st.eight && st.eight.result;
    if (E && E.teams) for (const side in E.teams) for (const e of E.teams[side] || []) {
      const cid = e && (typeof e.corp === 'string' ? e.corp : e.corp && e.corp.id); if (!cid) continue;
      const q = x => ['aim', 'grit', 'reflex', 'tactics', 'resolve'].reduce((a, k) => a + ((x.stats || {})[k] || 0), 0);
      const ros = corps[cid].roster.filter(x => x.status !== 'dead' && !x.mirror_of).sort((a, b) => q(b) - q(a));
      const fid = e.fighter && (e.fighter.id || e.fighter), i = ros.findIndex(x => x.id === fid);
      note('eight.entered', cid, i < 0 ? 'rank ?' : i < 2 ? 'rank top 2' : i < 6 ? 'rank 3-6' : 'rank 7+');
    }
    for (const id of ids) chance('eight', id);
    const d = st.drop || {};
    for (const id in (d.media || {})) note('media', id, 'reveal ' + d.media[id].reveal);
    const res = S.closeSeason(st);
    for (const id in (st.drop.sectors || {})) note('drop.sector', id, 'sector ' + st.drop.sectors[id]);
    for (const id of ids) { const b = corps[id]._board; if (b && b.answered) note('board.answer', id, String(b.answered.register || b.answered)); }
    const ds = divideStats;
    if (ds) {
      for (const dl of ds.deals || []) note('divide.deal', dl.owner || dl.corp || dl.a || '?', dl.kind || dl.t || 'deal');
      for (const pr of ds.promises || []) note('divide.exitSold', pr.from || '?', 'to ' + (pr.to || '?'));
      note('divide.fleet', 'fleet', 'pacts', ds.pacts || 0); note('divide.fleet', 'fleet', 'ransoms', ds.ransoms || 0);
      note('divide.fleet', 'fleet', 'withdrawals', ds.withdrawals || 0); note('divide.fleet', 'fleet', 'offersSent', ds.offersSent || 0);
      note('divide.fleet', 'fleet', 'contactsDeclined', ds.contactsDeclined || 0);
      for (const c of ds.corps || []) {
        if (!c || !c.id) continue;
        if (c.withdrawn) note('divide.left', c.id, String(c.withdrawn.how || c.withdrawn.kind || 'left'));
        if (c.policy) note('divide.policy', c.id, String(c.policy));
        note('divide.stanceChanges', c.id, 'changes', c.stanceChanges || 0);
        if (c.squads) note('divide.squads', c.id, String(c.squads.length));
      }
    }
    process.stderr.write('.');
  }
}

const t0 = Date.now();
for (let w = 0; w < WORLDS; w++) career(w);
process.stderr.write('\n');

/* ---------------------------------------------------------------------------- the reading */
const houses = oa.map(p => p.id);
const years = WORLDS * SEASONS;
const lines = [];
const flags = [];
function sumH(h) { let t = 0; for (const k in h) t += h[k]; return t; }
for (const sys of Object.keys(tally).sort()) {
  const T = tally[sys];
  const all = {}; let tot = 0;
  for (const h in T) for (const k in T[h]) { all[k] = (all[k] || 0) + T[h][k]; tot += T[h][k]; }
  const top = Object.entries(all).sort((a, b) => b[1] - a[1]);
  const share = tot ? top[0][1] / tot : 0;
  const perHouse = houses.map(h => T[h] ? sumH(T[h]) : 0);
  const usedBy = perHouse.filter(n => n > 0).length;
  /* do the houses choose differently? mean total-variation distance of each house's mix from the fleet's */
  let tv = 0, nH = 0;
  for (const h of houses) {
    const H = T[h]; if (!H) continue; const n = sumH(H); if (!n) continue;
    let d = 0; for (const k in all) d += Math.abs((H[k] || 0) / n - all[k] / tot);
    tv += d / 2; nH++;
  }
  tv = nH ? tv / nH : 0;
  lines.push({ sys, tot, perYear: +(tot / (years * houses.length)).toFixed(2), usedBy, share: +share.toFixed(2), spread: +tv.toFixed(2),
               top: top.slice(0, 8).map(([k, v]) => k + ' ' + Math.round(100 * v / tot) + '%') });
  if (top.length > 1 && share >= 0.95) flags.push(['SAME', sys, top[0][0] + ' ' + Math.round(100 * share) + '%']);
  if (top.length > 2 && share < 0.95 && tv < 0.08 && usedBy >= 6 && !/^(signed|acts|drop\.sector|focus\.target)$/.test(sys)) flags.push(['BLIND', sys, 'houses differ by ' + Math.round(tv * 100) + '%']);
  if (tot / (years * houses.length) < 0.1 && !/^divide\.fleet$/.test(sys)) flags.push(['RARE', sys, tot + ' in ' + years * houses.length + ' house-years']);
}
/* what nobody did at all: the act vocabulary for the new systems, and the verb list */
const expectActs = ['kept_a_promise', 'broke_a_promise', 'poached_staff', 'mole_exposed', 'raised_a_facility', 'snubbed_letter', 'ransomed_home'];
const actsSeen = new Set(); for (const h in (tally.acts || {})) for (const k in tally.acts[h]) actsSeen.add(k);
for (const a of expectActs) if (!actsSeen.has(a)) flags.push(['NEVER', 'act ' + a, '']);
const expectSys = ['focus', 'focus.boost', 'focus.target', 'talk', 'staff.held', 'staff.mole', 'facility.built', 'spend.gear', 'captains', 'trade.written', 'eight.entered', 'media', 'drop.sector', 'board.answer', 'divide.deal', 'divide.left', 'divide.exitSold', 'draft.pick'];
for (const s of expectSys) if (!tally[s]) flags.push(['NEVER', s, '']);

console.log('AI USAGE CENSUS · ' + WORLDS + ' worlds × ' + SEASONS + ' years × 8 houses · ' + Math.round((Date.now() - t0) / 1000) + 's');
console.log('');
for (const l of lines) {
  console.log(l.sys.padEnd(22) + String(l.tot).padStart(6) + '  /house-yr ' + String(l.perYear).padStart(6) + '  houses ' + l.usedBy + '/8  top ' + Math.round(l.share * 100) + '%  spread ' + Math.round(l.spread * 100) + '%');
  console.log('    ' + l.top.join(' · '));
}
console.log('');
console.log('FLAGS');
for (const f of flags) console.log('  ' + f[0].padEnd(6) + ' ' + f[1] + (f[2] ? '  — ' + f[2] : ''));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ worlds: WORLDS, seasons: SEASONS, tally, occasions, lines, flags }, null, 1));
