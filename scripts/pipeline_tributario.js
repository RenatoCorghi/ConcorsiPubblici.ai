/**
 * PIPELINE COMPLETA TRIBUTARIO
 * 
 * Esegue in sequenza:
 * 1. convert_tributario_pdf.js   → PDF → Markdown testo
 * 2. generate_tributario_vip_pdf.js → Testi → Schede VIP pedagogiche
 * 
 * Da lanciare dopo che il downloader ha finito.
 * Uso: node scripts/pipeline_tributario.js
 */
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function runScript(scriptName) {
    return new Promise((resolve, reject) => {
        log(`\n${'═'.repeat(60)}`);
        log(`🚀 Avvio: ${scriptName}`);
        log(`${'═'.repeat(60)}`);

        const proc = spawn('node', [path.join(__dirname, scriptName)], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit'
        });

        proc.on('close', (code) => {
            if (code === 0) {
                log(`✅ ${scriptName} completato`);
                resolve();
            } else {
                log(`❌ ${scriptName} uscito con codice ${code}`);
                reject(new Error(`${scriptName} fallito`));
            }
        });

        proc.on('error', reject);
    });
}

async function main() {
    log('🏭 Pipeline Tributario — Conversione + VIP');

    // 1. Converti PDF in testi Markdown
    await runScript('convert_tributario_pdf.js');

    // 2. Genera schede VIP
    await runScript('generate_tributario_vip_pdf.js');

    // Report finale
    const testi = fs.readdirSync(path.join(__dirname, '..', 'data', 'tributario_testi'))
        .filter(f => f.startsWith('pdf_')).length;
    const vip = fs.readdirSync(path.join(__dirname, '..', 'schede_tributario_vip'))
        .filter(f => f.startsWith('cgt_')).length;

    log(`\n${'═'.repeat(60)}`);
    log(`📊 PIPELINE COMPLETATA`);
    log(`   📄 Testi estratti: ${testi}`);
    log(`   💎 Schede VIP: ${vip}`);
    log(`${'═'.repeat(60)}`);
}

main().catch(e => {
    log(`❌ ERRORE: ${e.message}`);
    process.exit(1);
});
