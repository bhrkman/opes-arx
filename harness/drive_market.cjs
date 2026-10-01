/* §ONE AIM THE MARKET SAYS WHAT A MOD DOES. Opens the market on its mods and reads the effect lines:
   fails unless the optic reads "Aim +10" and the bipod "Holding +20" — the Aim on every fighter's
   sheet, not the invisible copy's point. `node harness/drive_market.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url: 'http://opesarx.test/?seed=corp-1'});
const w=dom.window,d=w.document;w.__noTurn=true;
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{
    const tab=[...d.querySelectorAll('.tab')].find(x=>/Market|Armou?ry|Yard/.test(x.textContent));
    if(tab) tab.click();
    const slots=[...d.querySelectorAll('[data-mslot]')];
    const modslot=slots.find(x=>/Mod/i.test(x.textContent)); if(modslot) modslot.click();
    [...d.querySelectorAll('[data-msec].shut')].forEach(x=>x.click());
    const secs=[...d.querySelectorAll('[data-msec]')];
    const modsec=secs.find(x=>/Mods/i.test(x.textContent));
    if(modsec && modsec.classList.contains('shut')) modsec.click();
    const rows=[...d.querySelectorAll('[data-mopen]')];
    ['itm_mod_optic','itm_mod_bipod','itm_mod_extended_mag','itm_mod_ap_rounds'].forEach(id=>{
      const r=d.querySelector('[data-mopen="'+id+'"]'); if(r) r.click(); });
    const fx=[...d.querySelectorAll('.modfx')].map(x=>x.textContent.replace(/\s+/g,' ').trim());
    const ok = fx.some(t => /^Aim \+10$/.test(t)) && fx.some(t => /Holding \+20/.test(t));
    console.log(ok ? 'the market reads a mod\'s effect in the Aim a manager sees on every fighter'
                   : 'FAIL the market does not show a mod\'s effect in sheet points');
    process.exit(ok ? 0 : 1);
    console.log('sections:',secs.map(x=>x.textContent.trim().slice(0,12)).join('|'),'| rows:',rows.length,'| mod effects shown:',JSON.stringify(fx));
    process.exit(0);},400);},300);},300);
