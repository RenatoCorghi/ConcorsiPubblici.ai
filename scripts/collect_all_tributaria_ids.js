import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const OUT_FILE = path.join(SCRATCH_DIR, 'tributaria_all_ids.json');
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function log(msg){console.log(`[${new Date().toISOString()}] ${msg}`);}

async function extractIdsFromPage(page){
  return await page.evaluate(()=>{
    return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
      .map(a=>a.getAttribute('href').split('/').pop())
      .filter(id=>id && id.includes('-'));
  });
}

async function hasNextPage(page){
  return await page.evaluate(()=>{
    const links = Array.from(document.querySelectorAll('a.page-link, .pagination a'));
    const next = links.find(a=>{
      const txt=a.textContent.trim();
      const li=a.closest('li');
      const disabled=li?.classList.contains('disabled')||a.classList.contains('disabled');
      return (txt==='>'||txt==='»'||txt.toLowerCase().includes('successiv')) && !disabled;
    });
    if(next){next.scrollIntoView({behavior:'instant',block:'center'}); next.click(); return true;}
    return false;
  });
}

async function main(){
  log('Connecting to existing Chrome (port 9222)...');
  let browser;
  try{browser=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});}
  catch(e){log('Failed to connect to Chrome.');return;}

  const page=await browser.newPage();
  await page.goto(`${BASE_URL}/ricerca`,{waitUntil:'networkidle2'});
  await sleep(2000);
  // Accept cookies if shown
  await page.evaluate(()=>{
    const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.toLowerCase().includes('accetta'));
    if(btn) btn.click();
  }).catch(()=>{});
  await sleep(500);

  const years=['2025','2024','2023','2022','2021'];
  const allIds=new Set();

  for(const year of years){
    log(`--- Processing year ${year} ---`);
    // select year via dropdown
    await page.evaluate((y)=>{
      const selects = Array.from(document.querySelectorAll('select'));
      const sel = selects.find(s => s.innerHTML.includes('2024'));
      if(sel){
        sel.value = y;
        sel.dispatchEvent(new Event('input',{bubbles:true}));
        sel.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }, year);
    await sleep(500);
    // ensure Massimati checked
    await page.evaluate(()=>{
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      const cb = checkboxes.find(c => c.parentElement && c.parentElement.textContent.toLowerCase().includes('massimat'));
      if(cb && !cb.checked){
        const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'checked')?.set;
        if(setter){setter.call(cb,true);cb.dispatchEvent(new Event('input',{bubbles:true}));cb.dispatchEvent(new Event('change',{bubbles:true}));}
        else cb.click();
      }
    });
    await sleep(500);
    // click Ricerca (reuse same logic as before)
    await page.evaluate(()=>{
      const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Ricerca');
      if(btn){btn.scrollIntoView({behavior:'instant',block:'center'}); btn.click();}
    });
    await sleep(2000);
    // pagination loop
    let pageNum = 1;
    while (true) {
      await sleep(1500);
      const ids = await extractIdsFromPage(page);
      ids.forEach(id => allIds.add(id));
      log(`Year ${year} - Page ${pageNum}: extracted ${ids.length} IDs (total unique ${allIds.size})`);
      const next = await hasNextPage(page);
      if (!next) { log('No next page, breaking year loop.'); break; }
      // wait for new results to load
      const firstOld = ids[0];
      try {
        await page.waitForFunction(prev => {
          const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
          return links.length > 0 && links[0].getAttribute('href').split('/').pop() !== prev;
        }, { timeout: 12000 }, firstOld);
      } catch (e) { }
      pageNum++;
    }
    // go back to base search page for next year
    await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2' });
    await sleep(1000);
  }
  const arr=Array.from(allIds);
  fs.mkdirSync(SCRATCH_DIR,{recursive:true});
  fs.writeFileSync(OUT_FILE,JSON.stringify(arr,null,2));
  log(`✅ Completed. Collected ${arr.length} unique IDs. Saved to ${OUT_FILE}`);
  await browser.disconnect();
}

main().catch(e=>console.error(e));
