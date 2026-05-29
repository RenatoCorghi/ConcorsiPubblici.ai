import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] 🚀 ${msg}`);
}

function runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        log(`Eseguo: node ${scriptPath} ${args.join(' ')}`);
        const child = spawn('node', [scriptPath, ...args], {
            cwd: path.resolve('.'),
            stdio: 'pipe' // Pipe to capture stdout/stderr for logic checks
        });

        let output = '';
        child.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
            process.stdout.write(str);
        });

        child.stderr.on('data', (data) => {
            process.stderr.write(data.toString());
        });

        child.on('close', (code) => {
            if (code === 0) {
                log(`✅ Completato con successo: ${path.basename(scriptPath)}`);
                resolve({ success: true, output });
            } else {
                log(`⚠️ Uscita con codice ${code}: ${path.basename(scriptPath)}`);
                resolve({ success: false, output });
            }
        });

        child.on('error', (err) => {
            log(`❌ Errore nell'avvio dello script: ${err.message}`);
            resolve({ success: false, output: err.message });
        });
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    log('====================================================');
    log('🌟 AVVIO PIPELINE COMPLETA TAR LAZIO (2023-2026)');
    log('====================================================');

    // ── FASE 1: DOWNLOAD TESTI MANCANTI ──
    log('\n--- FASE 1: Download testi integrali da Giustizia Amministrativa ---');
    let downloadCount = 1;
    while (true) {
        log(`Iterazione download #${downloadCount}...`);
        const res = await runScript('scripts/scraper-provvedimenti.js', ['--sede=tar-lazio-roma', '--tipo=SENTENZA', '--limit=500']);
        
        if (!res.success) {
            log('⚠️ Rilevato errore nel download. Faccio una pausa di 10 secondi e proseguo...');
            await sleep(10000);
        }

        if (res.output.includes('Nessun provvedimento da scaricare') || res.output.includes('Trovati 0 provvedimenti')) {
            log('✅ Download dei testi completato! Nessun altro testo da scaricare.');
            break;
        }

        // Se ha scaricato qualcosa, facciamo una piccola pausa per rispetto delle API
        log('Attendo 5 secondi prima del prossimo batch...');
        await sleep(5000);
        downloadCount++;
        
        // Sicurezza per non andare in loop infinito se ci sono errori persistenti di rete
        if (downloadCount > 30) {
            log('⚠️ Raggiunto limite massimo di 30 batch di download. Proseguo alla fase successiva per evitare blocco del goal.');
            break;
        }
    }

    // ── FASE 2: SCORING EURISTICO ──
    log('\n--- FASE 2: Scoring euristico (Filtro 2) ---');
    await runScript('scripts/filtro2-score-sentenze.mjs', ['--sede=tar-lazio-roma', '--sample=0']);

    // ── FASE 3: LLM MICRO-TRIAGE ──
    log('\n--- FASE 3: Micro-triage LLM (Filtro 3) ---');
    await runScript('scripts/filtro3-micro-triage.mjs', ['--sede=tar-lazio-roma']);

    // ── FASE 4: GENERAZIONE SCHEDE VIP ──
    log('\n--- FASE 4: Generazione schede VIP (Dossier d\'Autore) ---');
    await runScript('scripts/generate_triage_vip.mjs');

    // ── FASE 5: INGESTIONE RAG VIP (Tier 1) ──
    log('\n--- FASE 5: Ingestione RAG VIP (Tier 1) ---');
    await runScript('scripts/rag-ingest-admin-v3.js');

    // ── FASE 6: INGESTIONE MASSIVA RAG (Tier 2) ──
    log('\n--- FASE 6: Ingestione Massiva RAG (Tier 2) ---');
    await runScript('scripts/rag-ingest-ga-massivo.js', ['--sede=tar-lazio-roma', '--limit=2000']);

    log('\n====================================================');
    log('🏆 PIPELINE COMPLETA TAR LAZIO TERMINATA CON SUCCESSO!');
    log('====================================================');
}

main().catch(err => {
    console.error('Fatal Pipeline error:', err);
    process.exit(1);
});
