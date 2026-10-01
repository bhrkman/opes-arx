/* §WITHDRAWAL THE TAB, DRIVEN. Opens the game, plays to the lock, drops, runs two comms
   windows, then works the Withdraw tab the way a manager does: open it, drag a term, send
   the offer, advance a window, and read the field's replies back off the page.
   `node harness/drive_withdraw.cjs` */
const fs=require('fs');const {JSDOM}=require('/home/claude/opes-arx/harness/node_modules/jsdom');
let html=fs.readFileSync('/home/claude/opes-arx/viewers/the_corp.html','utf8');
html=html.replace('    G = { rng: rng,','    G = window.__G = { rng: rng,');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url: 'http://opesarx.test/?seed=corp-1'});
const w=dom.window,d=w.document;w.__noTurn=true;
let sliderSurvived=false;
const go=(sel)=>{const el=d.querySelector(sel);if(el)el.click();return !!el;};
setTimeout(()=>{d.getElementById('mNew').click();
 setTimeout(()=>{d.getElementById('cfound').click();
  setTimeout(()=>{d.getElementById('skiptolock').click();
   setTimeout(()=>{
     d.getElementById('begindiv').onclick();
     setTimeout(()=>{
       /* two windows in: the test is of the tab, not of surviving — a founded OA on a fixed seed can have its banner
          pulled by the fifth window, which is the game, not a fault */
       for(let k=0;k<2;k++) d.getElementById('advwin').onclick();
       [...d.querySelectorAll('.tab')].filter(x=>/Negotiation/.test(x.textContent))[0].click();
       console.log('panel open?', !!d.querySelector('#withdraw .wbody'));
       console.log('opened, terms:', d.querySelectorAll('#withdraw [data-wask]').length,
                   '| rows:', d.querySelectorAll('#withdraw .wreps .row').length);
       const sl=d.querySelector('#withdraw [data-wask="credits"]');
       /* drag it the way a finger does: many steps, and the slider must survive every one */
       if(sl){ for(let v=1;v<=20;v++){ const cur=d.querySelector('#withdraw [data-wask="credits"]'); cur.value=String(v); cur.dispatchEvent(new w.Event('input')); } }
       sliderSurvived = d.querySelector('#withdraw [data-wask="credits"]') === sl;
       console.log('after dragging credits to 20%:', (d.querySelector('#withdraw .wterm.wide .pct')||{}).textContent);
       console.log('send button?', !!d.querySelector('#withdraw [data-wsend]'));
       go('#withdraw [data-wsend]');
       console.log('offer on the answer:', JSON.stringify(w.__G.div.answer&&w.__G.div.answer.withdrawOffer));
       d.getElementById('advwin').onclick();
       setTimeout(()=>{
         const ans=[...d.querySelectorAll('#withdraw .wans')].map(x=>x.textContent.trim());
         console.log('replies drawn:', ans.join(',') || '(none)');
         const drawn=[...d.querySelectorAll('#withdraw .wans')].map(x=>x.textContent.trim());
         const fails=[];

         if(!d.querySelector('#withdraw .wbody')) fails.push('the withdrawal panel is not open');
         if(d.querySelectorAll('#withdraw [data-wask]').length!==5) fails.push('not five terms');
         if(!d.querySelectorAll('#withdraw .wreps .row').length) fails.push('no OA rows');
         if(!drawn.some(x=>/Yes|No/.test(x))) fails.push('the field never answered');
         if(!d.querySelector('#withdraw [data-wgo]')) fails.push('cannot withdraw on the replies');
         if(!sliderSurvived) fails.push('the slider was thrown away mid-drag');
         console.log(fails.length? ('FAIL '+fails.join(' | ')) : 'the withdrawal tab works end to end');
         process.exit(fails.length?1:0);
       },300);
     },400);
   },500);},300);},200);},300);
