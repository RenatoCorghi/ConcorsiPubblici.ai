import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'data', 'penale_pubblico_dominio', 'ssm');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) {
    console.log(`[SKIP] Gia' scaricato: ${path.basename(dest)}`);
    return;
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  console.log(`[OK] Scaricato: ${path.basename(dest)}`);
}

async function run() {
  console.log("== Avvio Scraping Quaderni SSM ==");
  const res = await fetch('https://www.scuolamagistratura.it/web/portalessm/nuovi-quaderni-ssm-frontend', {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const html = await res.text();
  const dom = new JSDOM(html);
  
  const doc = dom.window.document;
  
  // Trova tutti i blocchi che rappresentano un quaderno
  // Ogni quaderno ha di solito un h4 e poi un link "Clicca per Download"
  const links = Array.from(doc.querySelectorAll('a')).filter(a => a.textContent.trim() === 'Clicca per Download' && a.href);
  
  console.log(`Trovati ${links.length} Quaderni SSM da scaricare...`);
  
  let count = 0;
  for (const link of links) {
    count++;
    try {
      const url = new URL(link.href, 'https://www.scuolamagistratura.it');
      const idMatch = url.search.match(/filedownloadid=(\d+)/);
      const fileId = idMatch ? idMatch[1] : `quaderno_${count}`;
      
      const destPath = path.join(outDir, `SSM_Quaderno_${fileId}.pdf`);
      await downloadFile(url.href, destPath);
      // Pausa per evitare ban
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Errore su ${link.href}: ${err.message}`);
    }
  }
  
  console.log("== Scraping SSM Concluso ==");
}

run().catch(console.error);
