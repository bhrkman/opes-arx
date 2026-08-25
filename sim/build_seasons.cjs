/* Builds viewers/the_career.html — twelve seasons of the fleet, from the live modules.
 * Nothing here is written by hand: every number is what season.js actually produced. */
const fs = require('fs'), path = require('path');
const D = __dirname;
const P = require(path.join(D, 'prng.js'));
const SEASON = require(path.join(D, 'season.js'));
const oa = JSON.parse(fs.readFileSync(path.join(D, '..', 'data', 'oa_profiles.json'), 'utf8')).oa_profiles;

const SEASONS = Number(process.argv[2] || 12);
const SEED = process.argv[3] || 'CAREER-1';

const corps = SEASON.openFleet(P.mulberry32(P.seedFrom(SEED)), oa, {});
const ids = oa.map(p => p.id);

const snap = f => ({
  id: f.id, name: f.name, race: f.race, age: Math.round(f.age),
  divides: f.divides || 0, seasons: f.seasonsHere || 0,
  pot: typeof f.potential === 'number' ? f.potential : null,
  aim: +(f.stats.aim).toFixed(1), tac: +(f.stats.tactics).toFixed(1),
  res: +(f.stats.resolve).toFixed(1), grit: +(f.stats.grit).toFixed(1),
  fame: Math.round(f.fame || 0), status: f.status
});

const out = { seasons: [], fallen: [], rosters: {}, arrivals: {} };
const seen = {};                       /* id -> season first seen, per corp */
for (const id of ids) { seen[id] = {}; for (const f of corps[id].roster) seen[id][f.id] = 1; }

for (let s = 1; s <= SEASONS; s++) {
  const before = {};
  for (const id of ids) before[id] = corps[id].roster.slice();
  const rec = SEASON.runSeason(P.mulberry32(P.seedFrom(SEED + '-s' + s)), corps, oa, {});

  const row = { season: s, corps: {} };
  for (const id of ids) {
    const c = corps[id], e = rec.corps[id];
    const now = new Set(c.roster.map(f => f.id));
    /* who left, and why — the objects are still ours, so their final status is readable */
    for (const f of before[id]) {
      if (now.has(f.id)) continue;
      out.fallen.push({ corp: id, season: s, how: f.status === 'dead' ? 'killed' : 'retired',
                        name: f.name, race: f.race, age: Math.round(f.age),
                        divides: f.divides || 0, seasons: f.seasonsHere || 0,
                        fame: Math.round(f.fame || 0) });
    }
    for (const f of c.roster) {
      if (!seen[id][f.id]) { seen[id][f.id] = s;
        (out.arrivals[id] = out.arrivals[id] || []).push({ season: s, name: f.name, age: Math.round(f.age) }); }
    }
    row.corps[id] = {
      roster: e.roster, dropped: e.dropped, dead: e.dead, retired: e.retired,
      signed: e.signed, treasury: e.treasury, patience: e.patience,
      ambition: c.rep && c.rep.ambition != null ? c.rep.ambition : null,
      anchor: c.rep && c.rep.anchor != null ? c.rep.anchor : null,
      met: e.cardScore ? e.cardScore.met : null, total: e.cardScore ? e.cardScore.total : null,
      card: e.card || null,
      locker: e.locker, kitValue: e.kitValue, kitSpend: e.kitSpend,
      gearLost: e.gearLost, lootRecovered: e.lootRecovered,
      underwritten: !!e.underwritten, dismissed: !!e.dismissed
    };
  }
  row.log = rec.log.slice();
  out.seasons.push(row);
}
for (const id of ids) out.rosters[id] = corps[id].roster.map(snap).sort((a, b) => b.divides - a.divides);

const META = {
  NAME: {}, TAG: {}, COL: {}, DIFF: {}, IDS: ids, SEASONS: SEASONS, SEED: SEED,
  CONST: { DROP_MIN: SEASON.CONST.DROP_MIN, DROP_MAX: SEASON.CONST.DROP_MAX,
           ROSTER_MIN: SEASON.CONST.ROSTER_MIN, ROSTER_MAX: SEASON.CONST.ROSTER_MAX,
           RETIRE_SPAN: SEASON.CONST.RETIRE_SPAN }
};
for (const p of oa) {
  META.NAME[p.id] = p.name; META.TAG[p.id] = p.tag || '';
  META.COL[p.id] = (p.colors && p.colors.primary) || '#888'; META.DIFF[p.id] = p.difficulty || 3;
}

const HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Career — ${SEASONS} seasons of the fleet</title>
<style>
:root{--void:#14111c;--panel:#1b1826;--panel2:#221d2f;--rule:#2e2740;--bone:#e8e3d9;
 --dim:#8b8397;--dimmer:#5f5872;--aleas:#b08d3e;--blood:#8f1d1d;--stable:#5f7a3d;--warm:#c96a3a;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--void);color:var(--bone);font-family:var(--mono);font-size:13px;line-height:1.5;
 font-variant-numeric:tabular-nums;background-image:radial-gradient(ellipse at 50% -10%,#241d33 0%,var(--void) 60%)}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px 80px}
.lbl{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
header{border-bottom:1px solid var(--rule);padding:20px 0 14px;margin-bottom:18px}
.mark{font-family:var(--ui);font-weight:700;font-size:20px;display:flex;align-items:center;gap:9px}
.mark b{color:var(--aleas)}.dot{width:7px;height:7px;border-radius:50%;background:var(--aleas)}
.thesis{max-width:78ch;margin:10px 0 0;color:var(--dim);font-size:12.5px}
.thesis em{color:var(--bone);font-style:normal}
.tabs{display:flex;gap:6px;margin:16px 0 18px;flex-wrap:wrap}
.tab{background:var(--panel);border:1px solid var(--rule);color:var(--dim);padding:8px 14px;
 border-radius:3px;cursor:pointer;font-family:var(--mono);font-size:12px}
.tab.on{background:var(--panel2);border-color:var(--aleas);color:var(--bone)}
.card{background:var(--panel);border:1px solid var(--rule);border-radius:3px;padding:14px;margin-bottom:16px}
h2{font-family:var(--ui);font-size:15px;margin:0 0 4px;font-weight:600}
.note{color:var(--dim);font-size:11.5px;margin:0 0 12px;max-width:80ch}
table{border-collapse:collapse;width:100%;font-size:11.5px}
th{text-align:left;color:var(--dim);font-weight:400;font-size:9.5px;letter-spacing:.14em;
 text-transform:uppercase;padding:5px 6px;border-bottom:1px solid var(--rule)}
td{padding:4px 6px;border-bottom:1px solid #241f33}
tr:hover td{background:#221d2f}
.corpname{display:flex;align-items:center;gap:7px;white-space:nowrap}
.swatch{width:9px;height:9px;border-radius:2px;flex:0 0 auto}
.grid{display:grid;gap:2px;margin-top:6px}
.cell{padding:5px 3px;text-align:center;border-radius:2px;font-size:10.5px;cursor:default;
 border:1px solid transparent}
.cell b{display:block;font-size:12px;font-weight:600}
.cell small{color:var(--dim);font-size:9px}
.fired{border-color:var(--blood)!important;box-shadow:inset 0 0 0 1px var(--blood)}
.uw{border-color:var(--warm)!important}
.spark{height:110px;width:100%;display:block}
.legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.lg{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dim)}
.bar{height:6px;background:#2a2438;border-radius:3px;overflow:hidden;min-width:60px}
.bar i{display:block;height:100%}
.pill{display:inline-block;border:1px solid var(--rule);border-radius:2px;padding:1px 6px;font-size:10px;color:var(--dim)}
.dead{color:var(--blood)}.retd{color:var(--dim)}
.big{font-size:22px;font-family:var(--ui);font-weight:600}
.stat{display:flex;gap:22px;flex-wrap:wrap;margin:6px 0 2px}
.hidden{display:none}
.selrow{cursor:pointer}
.selrow.on td{background:#2a2438}
</style></head><body><div class="wrap">
<header>
 <div class="mark"><span class="dot"></span>OPES ARX <b>&mdash; THE CAREER</b></div>
 <p class="thesis">Step 8: <em>the persistent Corp and the season loop</em>. ${SEASONS} seasons, eight corps,
 one fleet, run end to end from <em>sim/season.js</em> at seed <em>${SEED}</em>. Nobody here is regenerated:
 every fighter below was created once, and then aged, developed, declined, retired or died.
 Every number on this page is what the simulation actually produced.</p>
</header>
<div class="tabs">
 <div class="tab on" data-p="fleet">The fleet</div>
 <div class="tab" data-p="board">The board</div>
 <div class="tab" data-p="people">The people</div>
 <div class="tab" data-p="fallen">The fallen</div>
</div>

<section id="p-fleet">
 <div class="card">
  <h2>Twelve years, eight corps</h2>
  <p class="note">Each cell is one corp's season. The large number is the roster it ended with; beneath it,
  how many it dropped and how many did not come back. Colour is the board's patience &mdash; green is safe,
  red is nearly out. An amber border is a season the board <em>underwrote</em>; a red border is a manager
  <em>dismissed</em>.</p>
  <div id="grid"></div>
  <div class="legend">
   <span class="lg"><span class="swatch" style="background:#5f7a3d"></span>patience high</span>
   <span class="lg"><span class="swatch" style="background:#b08d3e"></span>middling</span>
   <span class="lg"><span class="swatch" style="background:#8f1d1d"></span>nearly out</span>
   <span class="lg"><span class="swatch" style="background:transparent;border:1px solid #c96a3a"></span>underwritten</span>
   <span class="lg"><span class="swatch" style="background:transparent;border:1px solid #8f1d1d"></span>dismissed</span>
  </div>
 </div>
 <div class="card">
  <h2>The locker</h2>
  <p class="note">Items each corp actually owns, season by season. The armoury used to be rebuilt free
  every Divide, so kit money never bound. Now the drop force is armed <em>out of the locker</em>, survivors
  bring theirs home, and the dead leave theirs on the ground for whoever held it. A corp that loses people
  loses rifles &mdash; and the value it can field falls with them. Hover for what was lost and recovered.</p>
  <table id="locker"></table>
  <p class="note" style="margin:12px 0 4px">What each corp <em>bought</em> that year, in credits. Cash never
  reached procurement at all until this pass &mdash; wealth had only ever shown up as the depth of the
  founding locker, and once the locker persisted that channel was gone. This is the difficulty gradient
  arriving as <em>equipment</em>: the rich are capped by the Aleas, the poor by their wallet.</p>
  <table id="spend"></table>
 </div>
 <div class="card">
  <h2>What the fleet cost</h2>
  <div class="stat" id="totals"></div>
  <p class="note" style="margin-top:10px">A career is mostly funerals. The signing column is what stops a
  roster spiralling to nothing &mdash; and a corp that cannot afford to sign fields a smaller force,
  which is the difficulty gradient arriving as <em>people</em> rather than as money.</p>
  <table id="tot"></table>
 </div>
</section>

<section id="p-board" class="hidden">
 <div class="card">
  <h2>Patience, and what the board asked for</h2>
  <p class="note">The line is board patience across the career. The card the board sets scales with where
  the corp stands: above the pivot it tightens, below it loosens, so each corp settles into a band rather
  than sliding one way forever. <em>The band a corp lives in is the measure of the corp.</em></p>
  <div id="curves"></div>
 </div>
 <div class="card">
  <h2>The ask against the standing</h2>
  <p class="note">The <b>placement</b> demanded, season by season &mdash; 1 is "win it", 8 is "finish" &mdash;
  with the card's score beside it. This is only the heaviest of the demands; the full card is below.</p>
  <table id="asks"></table>
 </div>
 <div class="card">
  <h2>The whole card</h2>
  <p class="note">Every demand the board set, season by season, and whether it was met. A board asks for
  <em>one thing out of the ground</em>, a finish, a ceiling on the dead, a standing to hold, and &mdash; when
  the treasury is thin &mdash; that you end the year up and that you do not come asking for money.
  <b>&#9670;</b> marks the demand the board cared about most.</p>
  <div class="tabs" id="cardtabs"></div>
  <table id="cards"></table>
 </div>
</section>

<section id="p-people" class="hidden">
 <div class="card">
  <h2>Who is still here</h2>
  <p class="note">Select a corp. These are the fighters alive on its books at the end of season ${SEASONS},
  with the seasons they have served and the Divides they have survived. <em>Potential</em> is the ceiling
  rolled for them when they were created and hidden ever since; the bar is how much of it they have reached.</p>
  <div class="tabs" id="corptabs"></div>
  <table id="roster"></table>
 </div>
</section>

<section id="p-fallen" class="hidden">
 <div class="card">
  <h2>The fallen and the retired</h2>
  <p class="note">Everyone who left the fleet, and how. A career here is short: most end in a coffin, and
  the ones that don't end somewhere past their race's decline. This is the cost of a life expressed the
  only way this step needed &mdash; the person is gone, and what replaces them is a kid.</p>
  <table id="fallen"></table>
 </div>
</section>

</div>
<script>window.CAREER = ${JSON.stringify(out)}; window.META = ${JSON.stringify(META)};</script>
<script>
const C = window.CAREER, M = window.META;
const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c;
  if (h != null) e.innerHTML = h; return e; };
const money = n => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString();
function patCol(p){ if(p==null) return '#3a3350';
  if(p>=60) return '#5f7a3d'; if(p>=40) return '#7d7a3c'; if(p>=22) return '#b08d3e';
  if(p>=10) return '#a85a2c'; return '#8f1d1d'; }

/* ---- the fleet grid ---- */
(function(){
  const g = $('#grid');
  g.style.gridTemplateColumns = '190px repeat(' + M.SEASONS + ',1fr)';
  g.appendChild(el('div','lbl','corp'));
  for (const s of C.seasons) g.appendChild(el('div','lbl','S' + s.season));
  for (const id of M.IDS) {
    const nm = el('div','corpname');
    nm.appendChild(el('span','swatch')).style.background = M.COL[id];
    nm.appendChild(el('span',null,'<span style="font-size:11px">' + M.NAME[id] +
      '</span><br><span class="lbl">' + M.TAG[id] + ' &middot; diff ' + M.DIFF[id] + '</span>'));
    g.appendChild(nm);
    for (const s of C.seasons) {
      const e = s.corps[id];
      const cell = el('div','cell' + (e.dismissed?' fired':'') + (e.underwritten?' uw':''));
      cell.style.background = patCol(e.patience) + '33';
      cell.style.borderColor = cell.style.borderColor || 'transparent';
      cell.innerHTML = '<b>' + e.roster + '</b><small>' + e.dropped + ' \\u2193 ' +
        (e.dead ? '<span style="color:#c96a3a">' + e.dead + '\\u2020</span>' : '0\\u2020') + '</small>';
      cell.title = M.NAME[id] + ' \\u2014 season ' + s.season +
        '\\nroster ' + e.roster + ', dropped ' + e.dropped + ', killed ' + e.dead +
        ', retired ' + e.retired + ', signed ' + e.signed +
        '\\ntreasury ' + money(e.treasury) + ', patience ' + e.patience +
        '\\nboard asked for placement <= ' + e.ambition + ', card ' + e.met + '/' + e.total +
        (e.underwritten ? '\\nUNDERWRITTEN' : '') + (e.dismissed ? '\\nMANAGER DISMISSED' : '');
      g.appendChild(cell);
    }
  }
  g.className = 'grid';
})();

/* ---- totals ---- */
(function(){
  let dead=0, retd=0, signed=0, uw=0, dis=0, drops=0;
  for (const s of C.seasons) for (const id of M.IDS) { const e=s.corps[id];
    dead+=e.dead; retd+=e.retired; signed+=e.signed; drops+=e.dropped;
    if(e.underwritten)uw++; if(e.dismissed)dis++; }
  $('#totals').innerHTML =
    ['<div><div class="lbl">killed</div><div class="big" style="color:#8f1d1d">'+dead+'</div></div>',
     '<div><div class="lbl">retired</div><div class="big">'+retd+'</div></div>',
     '<div><div class="lbl">signed</div><div class="big" style="color:#5f7a3d">'+signed+'</div></div>',
     '<div><div class="lbl">bodies dropped</div><div class="big">'+drops+'</div></div>',
     '<div><div class="lbl">underwrites</div><div class="big" style="color:#c96a3a">'+uw+'</div></div>',
     '<div><div class="lbl">dismissals</div><div class="big" style="color:#8f1d1d">'+dis+'</div></div>'].join('');

  const rows = M.IDS.map(id => {
    let d=0,r=0,sg=0,ends=C.seasons[C.seasons.length-1].corps[id];
    for (const s of C.seasons){ d+=s.corps[id].dead; r+=s.corps[id].retired; sg+=s.corps[id].signed; }
    return {id,d,r,sg,ends};
  }).sort((a,b)=>b.ends.treasury-a.ends.treasury);
  let h = '<tr><th>corp</th><th>diff</th><th>killed</th><th>retired</th><th>signed</th>' +
          '<th>final roster</th><th>final treasury</th><th>final patience</th></tr>';
  for (const r of rows) h += '<tr><td><span class="corpname"><span class="swatch" style="background:' +
    M.COL[r.id] + '"></span>' + M.NAME[r.id] + '</span></td><td>' + M.DIFF[r.id] + '</td><td class="dead">' +
    r.d + '</td><td class="retd">' + r.r + '</td><td>' + r.sg + '</td><td>' + r.ends.roster +
    '</td><td>' + money(r.ends.treasury) + '</td><td style="color:' + patCol(r.ends.patience) + '">' +
    r.ends.patience + '</td></tr>';
  $('#tot').innerHTML = h;
})();

/* ---- the locker ---- */
(function(){
  let h='<tr><th>corp</th>'+C.seasons.map(s=>'<th>S'+s.season+'</th>').join('')+'<th>kit fielded / body, last</th></tr>';
  for(const id of M.IDS){
    h+='<tr><td><span class="corpname"><span class="swatch" style="background:'+M.COL[id]+
       '"></span>'+M.TAG[id]+'</span></td>';
    const first=C.seasons[0].corps[id].locker||1;
    for(const s of C.seasons){ const e=s.corps[id];
      const frac=Math.max(0,Math.min(1,(e.locker||0)/first));
      h+='<td title="'+e.gearLost+' left on the ground, '+e.lootRecovered+' recovered">'+
         (e.locker==null?'-':e.locker)+'<div class="bar" style="min-width:30px"><i style="width:'+
         (frac*100).toFixed(0)+'%;background:'+(frac<0.4?'#8f1d1d':frac<0.7?'#b08d3e':'#5f7a3d')+
         '"></i></div></td>'; }
    const last=C.seasons[C.seasons.length-1].corps[id];
    const per=last.dropped?Math.round(last.kitValue/last.dropped):0;
    h+='<td>'+(per?('<b>'+money(per)+'</b><small style="color:#5f5872"> of 2,500 cap</small>')
      :'<span class="dead">issue kit only</span>')+'</td></tr>';
  }
  $('#locker').innerHTML=h;
})();

/* ---- kit spend ---- */
(function(){
  let mx=1; for(const s of C.seasons) for(const id of M.IDS) mx=Math.max(mx,s.corps[id].kitSpend||0);
  let h='<tr><th>corp</th>'+C.seasons.map(s=>'<th>S'+s.season+'</th>').join('')+'</tr>';
  for(const id of M.IDS){
    h+='<tr><td><span class="corpname"><span class="swatch" style="background:'+M.COL[id]+
       '"></span>'+M.TAG[id]+'</span></td>';
    for(const s of C.seasons){ const v=s.corps[id].kitSpend||0;
      h+='<td title="'+money(v)+' spent on kit">'+(v?Math.round(v/1000)+'k':'&mdash;')+
         '<div class="bar" style="min-width:30px"><i style="width:'+((v/mx)*100).toFixed(0)+
         '%;background:'+M.COL[id]+'"></i></div></td>'; }
    h+='</tr>';
  }
  $('#spend').innerHTML=h;
})();

/* ---- patience curves ---- */
(function(){
  const W=1100,H=150,pad=26;
  const svgNS='http://www.w3.org/2000/svg';
  const box=$('#curves');
  const svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H); svg.setAttribute('class','spark');
  svg.style.height='190px';
  for(const y of [0,25,50,75,100]){
    const ln=document.createElementNS(svgNS,'line');
    const yy=H-pad-(y/100)*(H-2*pad);
    ln.setAttribute('x1',pad);ln.setAttribute('x2',W-pad);ln.setAttribute('y1',yy);ln.setAttribute('y2',yy);
    ln.setAttribute('stroke','#2e2740');svg.appendChild(ln);
    const tx=document.createElementNS(svgNS,'text');
    tx.setAttribute('x',2);tx.setAttribute('y',yy+3);tx.setAttribute('fill','#5f5872');
    tx.setAttribute('font-size','9');tx.textContent=y;svg.appendChild(tx);
  }
  const n=C.seasons.length;
  for(const id of M.IDS){
    const pts=C.seasons.map((s,i)=>{
      const x=pad+(i/(n-1))*(W-2*pad);
      const y=H-pad-((s.corps[id].patience||0)/100)*(H-2*pad);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
    const pl=document.createElementNS(svgNS,'polyline');
    pl.setAttribute('points',pts);pl.setAttribute('fill','none');
    pl.setAttribute('stroke',M.COL[id]);pl.setAttribute('stroke-width','1.8');
    pl.setAttribute('opacity','.85');svg.appendChild(pl);
  }
  box.appendChild(svg);
  const lg=el('div','legend');
  for(const id of M.IDS){ const s=el('span','lg');
    s.appendChild(el('span','swatch')).style.background=M.COL[id];
    s.appendChild(el('span',null,M.NAME[id])); lg.appendChild(s); }
  box.appendChild(lg);
})();

/* ---- asks ---- */
(function(){
  let h='<tr><th>corp</th>'+C.seasons.map(s=>'<th>S'+s.season+'</th>').join('')+'</tr>';
  for(const id of M.IDS){
    h+='<tr><td><span class="corpname"><span class="swatch" style="background:'+M.COL[id]+
       '"></span>'+M.NAME[id]+'</span></td>';
    for(const s of C.seasons){ const e=s.corps[id];
      h+='<td title="patience '+e.patience+', anchor '+e.anchor+', card '+e.met+'/'+e.total+
         '"><b style="color:'+patCol(e.patience)+'">'+(e.ambition==null?'-':e.ambition)+'</b>'+
         '<small style="color:#5f5872"> '+e.met+'/'+e.total+'</small></td>'; }
    h+='</tr>';
  }
  $('#asks').innerHTML=h;
})();

/* ---- the whole card ---- */
const DLABEL = {
  resource: d => 'dig ' + (d.amount!=null?d.amount:'') + ' ' + (d.category||''),
  placement: d => 'finish ' + (d.at<=1?'first':'top ' + d.at),
  win: () => 'win the planet',
  surplus: d => 'end the year ' + (d.amount||0).toLocaleString() + ' up',
  losses: d => 'lose no more than ' + d.max,
  stipend: () => 'do not ask for money',
  standing: d => (d.audience==='own'?'our ships':d.audience==='fleet'?'the fleet':'the Aleas') +
                 ' above ' + d.above
};
let cardCorp = M.IDS[0];
(function(){
  const t=$('#cardtabs');
  M.IDS.forEach((id,i)=>{
    const b=el('div','tab'+(i?'':' on'),M.TAG[id]||M.NAME[id]);
    b.onclick=()=>{ [...t.children].forEach(c=>c.classList.remove('on')); b.classList.add('on');
      cardCorp=id; drawCards(); };
    t.appendChild(b);
  });
  drawCards();
})();
function drawCards(){
  let h='<tr><th>season</th><th>patience</th><th>the board asked for</th><th>score</th></tr>';
  for(const s of C.seasons){
    const e=s.corps[cardCorp];
    const cells=(e.card||[]).map(l=>{
      const txt=(DLABEL[l.kind]?DLABEL[l.kind](l.d):l.kind);
      return '<span class="pill" style="border-color:'+(l.met?'#5f7a3d':'#8f1d1d')+
        ';color:'+(l.met?'#cfe0b4':'#e0b4b4')+'">'+(l.priority?'\u25c6 ':'')+txt+
        ' '+(l.met?'\u2713':'\u2717')+'</span>';
    }).join(' ');
    const frac=e.total?e.met/e.total:0;
    h+='<tr><td>S'+s.season+(e.underwritten?' <span style="color:#c96a3a">UW</span>':'')+
       (e.dismissed?' <span style="color:#8f1d1d">FIRED</span>':'')+
       '</td><td style="color:'+patCol(e.patience)+'">'+e.patience+'</td><td>'+
       (cells||'<span class="retd">no card</span>')+'</td><td><b style="color:'+
       (frac>=0.78?'#5f7a3d':frac>=0.66?'#b08d3e':'#8f1d1d')+'">'+e.met+'/'+e.total+'</b></td></tr>';
  }
  $('#cards').innerHTML=h;
}

/* ---- rosters ---- */
let curCorp = M.IDS[0];
(function(){
  const t=$('#corptabs');
  M.IDS.forEach((id,i)=>{
    const b=el('div','tab'+(i?'':' on'),M.NAME[id]);
    b.onclick=()=>{ [...t.children].forEach(c=>c.classList.remove('on')); b.classList.add('on');
      curCorp=id; drawRoster(); };
    t.appendChild(b);
  });
  drawRoster();
})();
function drawRoster(){
  const r=C.rosters[curCorp]||[];
  let h='<tr><th>name</th><th>race</th><th>age</th><th>seasons</th><th>divides</th>'+
        '<th>aim</th><th>tactics</th><th>resolve</th><th>grit</th><th>toward potential</th><th>fame</th></tr>';
  for(const f of r){
    const reach = f.pot ? Math.max(0,Math.min(1,(f.tac)/f.pot)) : 0;
    h+='<tr><td>'+f.name+'</td><td class="retd">'+f.race+'</td><td>'+f.age+'</td><td>'+f.seasons+
       '</td><td><b>'+f.divides+'</b></td><td>'+f.aim+'</td><td>'+f.tac+'</td><td>'+f.res+
       '</td><td>'+f.grit+'</td><td><div class="bar"><i style="width:'+(reach*100).toFixed(0)+
       '%;background:'+(reach>0.9?'#5f7a3d':'#b08d3e')+'"></i></div><small style="color:#5f5872">'+
       f.tac+' / '+(f.pot==null?'?':f.pot)+'</small></td><td>'+f.fame+'</td></tr>';
  }
  $('#roster').innerHTML=h;
}

/* ---- fallen ---- */
(function(){
  const f=C.fallen.slice().sort((a,b)=>a.season-b.season||a.corp.localeCompare(b.corp));
  let h='<tr><th>season</th><th>corp</th><th>name</th><th>race</th><th>age</th>'+
        '<th>divides</th><th>seasons served</th><th>fame</th><th>how</th></tr>';
  for(const x of f){
    h+='<tr><td>'+x.season+'</td><td><span class="corpname"><span class="swatch" style="background:'+
       M.COL[x.corp]+'"></span>'+M.TAG[x.corp]+'</span></td><td>'+x.name+'</td><td class="retd">'+
       x.race+'</td><td>'+x.age+'</td><td>'+x.divides+'</td><td>'+x.seasons+'</td><td>'+x.fame+
       '</td><td class="'+(x.how==='killed'?'dead':'retd')+'">'+x.how+'</td></tr>';
  }
  $('#fallen').innerHTML=h;
})();

/* ---- tabs ---- */
document.querySelectorAll('.tabs > .tab[data-p]').forEach(t=>{
  t.onclick=()=>{
    document.querySelectorAll('.tabs > .tab[data-p]').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    ['fleet','board','people','fallen'].forEach(p=>
      $('#p-'+p).classList.toggle('hidden', p!==t.dataset.p));
  };
});
</script></body></html>`;

const outDir = path.join(D, '..', 'viewers');
fs.writeFileSync(path.join(outDir, 'the_career.html'), HTML);
console.log('viewers/the_career.html  ' + (HTML.length / 1024).toFixed(0) + 'kb  ' +
            SEASONS + ' seasons, ' + out.fallen.length + ' departures recorded');
