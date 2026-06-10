import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import https from 'https';

const BASE_OUT_DIR = path.join(process.cwd(), 'data', 'diritto_penale');

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    };
    https.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', err => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

async function scrapeSSMDynamic() {
    console.log("🏫 Aggiramento blocco: estrazione link dinamici Scuola Superiore Magistratura...");
    try {
        const res = await fetch('https://www.scuolamagistratura.it/web/portalessm/nuovi-quaderni-ssm-frontend', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res.text();
        const dom = new JSDOM(html);
        
        // Quaderno 26, 27, 14
        const links = Array.from(dom.window.document.querySelectorAll('a'))
            .filter(a => a.href && a.href.includes('filedownloadid='));
            
        let q26 = links.find(a => a.href.includes('quaderno_26') || a.href.includes('26_web'));
        let q27 = links.find(a => a.href.includes('quaderno_27') || a.href.includes('27_web'));
        let q14 = links.find(a => a.href.includes('quaderno_14') || a.href.includes('14_web'));
        
        // Fallback: se i nomi file non matchano, cerchiamo nel DOM il testo "Quaderno 26"
        if (!q26 || !q27 || !q14) {
             const rows = Array.from(dom.window.document.querySelectorAll('.row, div'));
             rows.forEach(r => {
                 if(r.textContent.includes('Quaderno 26')) q26 = r.querySelector('a[href*="filedownload"]');
                 if(r.textContent.includes('Quaderno 27')) q27 = r.querySelector('a[href*="filedownload"]');
                 if(r.textContent.includes('Quaderno 14')) q14 = r.querySelector('a[href*="filedownload"]');
             });
        }
        
        const targets = [
            { id: '26', link: q26, filename: 'SSM_Quaderno_26_Fonti_Legalita.pdf' },
            { id: '27', link: q27, filename: 'SSM_Quaderno_27_Nesso_Causalita.pdf' },
            { id: '14', link: q14, filename: 'SSM_Quaderno_14_Tributario_Penale.pdf' }
        ];

        for (const t of targets) {
             if (t.link) {
                 const fullUrl = t.link.href.startsWith('http') ? t.link.href : 'https://www.scuolamagistratura.it' + t.link.href;
                 console.log(`   Scaricando reale Quaderno ${t.id}... (${fullUrl})`);
                 await downloadFile(fullUrl, path.join(BASE_OUT_DIR, 'ssm', t.filename));
                 console.log(`   ✅ Quaderno ${t.id} scaricato con successo.`);
             } else {
                 console.log(`   ⚠️ Impossibile localizzare link dinamico per Quaderno ${t.id}`);
             }
        }
        
        // Scarichiamo anche il primo quaderno disponibile in evidenza
        if(links.length > 0) {
             const fullUrl = links[0].href.startsWith('http') ? links[0].href : 'https://www.scuolamagistratura.it' + links[0].href;
             await downloadFile(fullUrl, path.join(BASE_OUT_DIR, 'ssm', 'SSM_Quaderno_Latest_Evidence.pdf'));
             console.log(`   ✅ Quaderno Latest (dinamico) scaricato con successo.`);
        }
    } catch (e) {
        console.error("Errore SSM:", e.message);
    }
}

async function scrapeCassazioneDynamic() {
    console.log("⚖️ Aggiramento blocco: Cassazione Massimario...");
    try {
        const res = await fetch('https://www.cortedicassazione.it/corte-di-cassazione/it/relazioni_massimario_penale.page', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await res.text();
        const dom = new JSDOM(html);
        const pdfLinks = Array.from(dom.window.document.querySelectorAll('a'))
            .filter(a => a.href && a.href.toLowerCase().endsWith('.pdf'));
            
        console.log(`   Trovati ${pdfLinks.length} link PDF diretti.`);
        if(pdfLinks.length > 0) {
            let count = 1;
            for(const link of pdfLinks.slice(0, 3)) {
                 const fullUrl = link.href.startsWith('http') ? link.href : 'https://www.cortedicassazione.it' + link.href;
                 console.log(`   Scaricando Relazione Cassazione... (${fullUrl})`);
                 await downloadFile(fullUrl, path.join(BASE_OUT_DIR, 'cassazione', `Cass_Relazione_Dynamic_${count}.pdf`));
                 console.log(`   ✅ Relazione Cassazione ${count} scaricata.`);
                 count++;
            }
        }
    } catch (e) {
        console.error("Errore Cassazione:", e.message);
    }
}

async function run() {
    await scrapeSSMDynamic();
    await scrapeCassazioneDynamic();
}

run();
