/**
 * ORCHESTRATORE NOTTURNO - TAR REGIONALI
 * 
 * Scarica a ritroso (2026 -> 2021) per tutte le sedi regionali
 */

import { spawn } from 'child_process';
import path from 'path';

const ANNI = [2026, 2025, 2024, 2023, 2022, 2021];
const REGIONI = [
    'tar-abruzzo-l-aquila',
    'tar-abruzzo-pescara',
    'tar-basilicata',
    'tar-calabria-catanzaro',
    'tar-calabria-reggio-calabria',
    'tar-campania-napoli',
    'tar-campania-salerno',
    'tar-emilia-romagna-bologna',
    'tar-emilia-romagna-parma',
    'tar-friuli-venezia-giulia',
    'tar-lazio-latina',
    'tar-liguria',
    'tar-lombardia-milano',
    'tar-lombardia-brescia',
    'tar-marche',
    'tar-molise',
    'tar-piemonte',
    'tar-puglia-bari',
    'tar-puglia-lecce',
    'tar-sardegna',
    'tar-sicilia-palermo',
    'tar-sicilia-catania',
    'tar-toscana',
    'trga-trento',
    'trga-bolzano',
    'tar-umbria',
    'tar-valle-d-aosta',
    'tar-veneto'
];

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] 🌍 ${msg}`);
}

function runScript(scriptPath, args = []) {
    return new Promise((resolve) => {
        log(`▶ Eseguo: node ${scriptPath} ${args.join(' ')}`);
        const child = spawn('node', [scriptPath, ...args], {
            cwd: path.resolve('.'),
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                log(`✅ Completato: ${args.join(' ')}`);
                resolve(true);
            } else {
                log(`⚠️ Uscita (codice ${code}): ${args.join(' ')}`);
                resolve(false); 
            }
        });

        child.on('error', (err) => {
            log(`❌ Errore: ${err.message}`);
            resolve(false);
        });
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    log('====================================================');
    log('🚀 AVVIO PIPELINE TAR REGIONALI (2026 -> 2021)');
    log('====================================================');

    let iter = 1;
    while (true) {
        log(`\n--- INIZIO MEGA-ITERAZIONE ${iter} ---`);

        for (const anno of ANNI) {
            log(`\n📅 PASSAGGIO ALL'ANNO ${anno}...`);
            
            for (const sede of REGIONI) {
                log(`\n📍 SCARICO: ${sede} (${anno})`);
                await runScript('scripts/scraper-provvedimenti.js', [
                    `--sede=${sede}`, 
                    `--anno=${anno}`, 
                    `--tipo=SENTENZA`, 
                    `--limit=500` // 500 alla volta per sede per non bloccarci troppo su una singola
                ]);
                
                log(`⏳ Pausa di sicurezza 5 secondi tra sedi...`);
                await sleep(5000);
            }
        }

        log(`\n✅ Mega-Iterazione ${iter} conclusa. Tutte le regioni/anni spazzolati una volta.`);
        log(`Attendo 30 secondi prima di ricominciare il giro...`);
        await sleep(30000);
        iter++;
    }
}

main().catch(console.error);
