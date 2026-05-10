import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

const BASE_URL = 'https://federalismi.it';
const DATA_DIR = path.join(process.cwd(), 'data', 'riviste_federalismi');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function scrape() {
    console.log('--- Inizio Scraping Federalismi (Fascicoli) via Puppeteer ---');
    console.log('Esecuzione ottimizzata per evitare timeout e blocchi...');
    
    const browser = await puppeteer.launch({ 
        headless: 'new',
        protocolTimeout: 600000 // 10 minuti di timeout per il protocollo
    });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    let connected = false;
    while (!connected) {
        try {
            console.log('Accesso alla homepage per stabilire la sessione TLS...');
            await page.goto(`${BASE_URL}/nv14/homepage.cfm`, { waitUntil: 'networkidle2', timeout: 60000 });
            connected = true;
        } catch (e) {
            console.log(`Errore di connessione: ${e.message}`);
            console.log('Attendo 30 secondi prima di riprovare...');
            await delay(30000);
        }
    }
    
    // Funzione per controllare un singolo ID all'interno del browser
    const checkArtidInBrowser = async (artid) => {
        return await page.evaluate(async (id) => {
            try {
                const res = await window.fetch(`/nv14/articolo-documento.cfm?Artid=${id}`);
                const html = await res.text();
                
                const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                if (!titleMatch) return null;
                
                const title = titleMatch[1];
                const fascicoloMatch = title.match(/Fascicolo n\.\s*(\d+)\s*\/\s*(\d{4})/i);
                
                if (fascicoloMatch) {
                    const numero = fascicoloMatch[1];
                    const anno = parseInt(fascicoloMatch[2], 10);
                    
                    const pdfRegex = /href="([^"]*ApplOpenFilePDF\.cfm\?artid=\d+[^"]*)"/i;
                    const pdfMatch = html.match(pdfRegex);
                    
                    if (pdfMatch) {
                        let pdfUrl = pdfMatch[1];
                        pdfUrl = pdfUrl.replace(/&amp;/g, '&');
                        return { artid: id, numero, anno, title, pdfUrl };
                    }
                }
            } catch (e) {
                return null;
            }
            return null;
        }, artid);
    };

    // Funzione per scaricare il PDF all'interno del browser e passarlo a Node
    const downloadPdfInBrowser = async (pdfUrl) => {
        return await page.evaluate(async (url) => {
            try {
                const res = await window.fetch(url);
                const arrayBuffer = await res.arrayBuffer();
                
                let binary = '';
                const bytes = new Uint8Array(arrayBuffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return window.btoa(binary); // Ritorna base64
            } catch (e) {
                return null;
            }
        }, pdfUrl);
    };

    // 1. Trova l'ultimo Artid
    console.log('Cerco ultimo Artid dalla pagina la-rivista.cfm...');
    let maxArtid = await page.evaluate(async () => {
        try {
            const res = await window.fetch('/nv14/la-rivista.cfm');
            const html = await res.text();
            const regex = /Artid=(\d+)[^"]*">Fascicolo n\./ig;
            let match;
            let max = 0;
            while ((match = regex.exec(html)) !== null) {
                const id = parseInt(match[1], 10);
                if (id > max) max = id;
            }
            return max;
        } catch (e) {
            return 0;
        }
    });

    if (maxArtid === 0) {
        console.log('Non trovato tramite fetch, uso fallback 53452');
        maxArtid = 53452;
    }
    
    let currentArtid = maxArtid;
    console.log(`Partenza da Artid: ${currentArtid}`);
    
    const BATCH_SIZE = 5;
    const TARGET_MIN_YEAR = 2021;
    let stopScanning = false;

    while (!stopScanning && currentArtid > 30000) {
        let promises = [];
        for (let j = 0; j < BATCH_SIZE; j++) {
            promises.push(checkArtidInBrowser(currentArtid - j));
        }
        
        const results = await Promise.all(promises);
        
        for (const res of results) {
            if (res) {
                if (res.anno < TARGET_MIN_YEAR) {
                    console.log(`\n[STOP] Raggiunto Fascicolo del ${res.anno}. Ricerca terminata.`);
                    stopScanning = true;
                    break;
                }
                
                const filename = `federalismi_fascicolo_${res.numero}_${res.anno}.pdf`;
                const filepath = path.join(DATA_DIR, filename);
                
                if (fs.existsSync(filepath)) {
                    console.log(`[SKIP] ${filename} già presente.`);
                } else {
                    console.log(`\n[TROVATO] Fascicolo ${res.numero}/${res.anno} (Artid: ${res.artid})`);
                    console.log(`[DOWNLOAD] Scaricamento ${filename}...`);
                    
                    const base64Data = await downloadPdfInBrowser(res.pdfUrl);
                    if (base64Data) {
                        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
                        console.log(`[OK] Salvato ${filename}`);
                    } else {
                        console.log(`[ERRORE] Download fallito per ${filename}`);
                    }
                }
            }
        }
        
        currentArtid -= BATCH_SIZE;
        if (currentArtid % 100 === 0 || currentArtid % 100 < BATCH_SIZE) {
            process.stdout.write(`\rScansione Artid: ${currentArtid}... `);
        }
        
        // Breve pausa per non sovraccaricare il sito
        await delay(300);
    }
    
    console.log('\n--- Scraping Federalismi Completato ---');
    await browser.close();
}

scrape().catch(console.error);
