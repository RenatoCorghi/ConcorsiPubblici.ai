/**
 * ORCHESTRATORE NOTTURNO - TAR LAZIO
 * 
 * Esegue in loop continuo:
 * 1. Scraping di 1000 sentenze del TAR Lazio (rispettando rate limit).
 * 2. Ingestione massiva (Tier 2) delle sentenze appena scaricate.
 * 3. Ripete finché non ci sono più file o viene interrotto.
 */

import { spawn } from 'child_process';
import path from 'path';

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] 🌙 ${msg}`);
}

function runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        log(`▶ Eseguo: node ${scriptPath} ${args.join(' ')}`);
        const child = spawn('node', [scriptPath, ...args], {
            cwd: path.resolve('.'),
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                log(`✅ Completato con successo: ${path.basename(scriptPath)}`);
                resolve(true);
            } else {
                log(`⚠️ Uscita anomala (codice ${code}): ${path.basename(scriptPath)}`);
                resolve(false); // Non blocchiamo il loop per un crash
            }
        });

        child.on('error', (err) => {
            log(`❌ Errore avvio script: ${err.message}`);
            resolve(false);
        });
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    log('====================================================');
    log('🚀 AVVIO PIPELINE NOTTURNA TAR LAZIO (LOOP INFINITO)');
    log('====================================================');

    let iter = 1;
    while (true) {
        log(`\n--- INIZIO ITERAZIONE ${iter} ---`);

        // STEP 1: Scarica testi (max 1000 alla volta, impiega ~1.5 ore)
        log('FASE 1: Download testi mancanti da Giustizia Amministrativa...');
        await runScript('scripts/scraper-provvedimenti.js', ['--sede=tar-lazio-roma', '--tipo=SENTENZA', '--limit=1000']);

        log(`\n✅ Iterazione ${iter} conclusa. Attendo 10 secondi prima del prossimo ciclo...`);
        await sleep(10000);
        iter++;
    }
}

main().catch(console.error);
