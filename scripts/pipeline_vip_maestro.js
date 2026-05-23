/**
 * PIPELINE MAESTRO — Generazione VIP in Successione
 * 
 * Esegue in sequenza:
 *   FASE 1: VIP per le 32 SS.UU. post-2021 appena scaricate
 *   FASE 2: VIP per le 1.098 SS.UU. grezze (batch lungo)
 *   FASE 3: VIP per le 102 Cass. Sez. Semplici appena scaricate
 * 
 * Uso: node scripts/pipeline_vip_maestro.js
 * 
 * Riprende automaticamente dall'ultimo file processato (idempotente).
 * Log completo in: pipeline_vip_maestro.log
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve('./pipeline_vip_maestro.log');

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${ts}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function runScript(scriptPath, label) {
    return new Promise((resolve, reject) => {
        log(`▶ AVVIO: ${label}`);
        const child = spawn('node', [scriptPath], {
            cwd: path.resolve('.'),
            stdio: ['inherit', 'pipe', 'pipe']
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                process.stdout.write(line + '\n');
                fs.appendFileSync(LOG_FILE, `  ${line}\n`);
            }
        });
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                process.stderr.write(line + '\n');
                fs.appendFileSync(LOG_FILE, `  [ERR] ${line}\n`);
            }
        });

        child.on('close', (code) => {
            if (code === 0) {
                log(`✅ COMPLETATO: ${label}`);
                resolve();
            } else {
                log(`⚠️  ${label} terminato con codice ${code} — continuo con la fase successiva`);
                resolve(); // Non bloccare la pipeline per errori non-fatali
            }
        });
        child.on('error', (err) => {
            log(`❌ ERRORE spawn: ${err.message}`);
            resolve(); // Continua comunque
        });
    });
}

async function main() {
    log('');
    log('╔══════════════════════════════════════════════════════════╗');
    log('║       PIPELINE VIP MAESTRO — Generazione in Successione  ║');
    log('╚══════════════════════════════════════════════════════════╝');
    log('');

    const fasi = [
        {
            label: 'FASE 1 — VIP SS.UU. post-2021 (32 appena scaricate)',
            script: './scripts/generate_ssuu_mancanti_vip.js'
        },
        {
            label: 'FASE 2 — VIP SS.UU. batch completo (1.098 grezze)',
            script: './scripts/generate_ssuu_mancanti_vip.js'  // stesso script, salta già esistenti
        },
        {
            label: 'FASE 3 — VIP Cass. Sez. Semplici (102 appena scaricate)',
            script: './scripts/generate_cass_sez_vip.js'
        }
    ];

    const startTime = Date.now();

    for (let i = 0; i < fasi.length; i++) {
        const { label, script } = fasi[i];
        log('');
        log(`${'─'.repeat(60)}`);
        log(`[${i+1}/${fasi.length}] ${label}`);
        log(`${'─'.repeat(60)}`);

        if (!fs.existsSync(script)) {
            log(`⚠️  Script non trovato: ${script} — salto`);
            continue;
        }

        await runScript(script, label);
    }

    const elapsed = Math.round((Date.now() - startTime) / 60000);
    log('');
    log('╔══════════════════════════════════════════════════════════╗');
    log(`║  PIPELINE COMPLETATA in ${String(elapsed).padStart(4)} minuti                     ║`);
    log('╚══════════════════════════════════════════════════════════╝');
    log(`📄 Log completo in: ${LOG_FILE}`);
}

main().catch(err => {
    log(`💥 ERRORE FATALE: ${err.message}`);
    process.exit(1);
});
