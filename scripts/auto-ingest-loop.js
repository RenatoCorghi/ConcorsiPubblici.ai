/**
 * AUTO INGEST LOOP — CORTI GIUSTIZIA TRIBUTARIA (CGT)
 * 
 * Esegue l'ingestione RAG periodica (ogni 2 minuti) in background
 * per caricare le schede VIP man mano che vengono generate.
 * 
 * Uso:
 *   node scripts/auto-ingest-loop.js
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERT_SCRIPT = path.join(__dirname, 'convert_tributario_pdf.js');
const GENERATE_SCRIPT = path.join(__dirname, 'generate_tributario_vip_pdf.js');
const INGEST_SCRIPT = path.join(__dirname, 'rag-ingest-tributario-cgt.js');

function log(msg) {
    console.log(`[${new Date().toISOString()}] 🔄 ${msg}`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    log('Avvio Unified Auto-Pipeline per CGT RAG');
    log(`Passo 1: ${CONVERT_SCRIPT}`);
    log(`Passo 2: ${GENERATE_SCRIPT}`);
    log(`Passo 3: ${INGEST_SCRIPT}`);
    
    const ITERATIONS = 180; // 180 iterazioni da 2 minuti = 6 ore di monitoraggio continuo
    const INTERVAL = 120000; // 2 minuti in ms
    const SCRIPT_TIMEOUT = 300000; // 5 minuti di timeout per ciascun script per evitare blocchi infiniti

    for (let i = 1; i <= ITERATIONS; i++) {
        log(`--- ITERAZIONE CONCORRENTE [${i}/${ITERATIONS}] ---`);
        try {
            log('🔄 Avvio PASSO 1: Conversione PDF e Fusione Massime...');
            execSync(`node "${CONVERT_SCRIPT}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..'), timeout: SCRIPT_TIMEOUT });
            
            log('🔄 Avvio PASSO 2: Generazione/Rigenerazione Schede VIP...');
            execSync(`node "${GENERATE_SCRIPT}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..'), timeout: SCRIPT_TIMEOUT });
            
            log('🔄 Avvio PASSO 3: Ingestione Supabase RAG...');
            execSync(`node "${INGEST_SCRIPT}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..'), timeout: SCRIPT_TIMEOUT });

            log('✅ Ciclo di pipeline completato con successo.');
        } catch (error) {
            log(`❌ Errore o Timeout durante l'esecuzione della pipeline: ${error.message}`);
        }

        log(`In attesa di ${INTERVAL / 1000} secondi prima del prossimo ciclo...\n`);
        await sleep(INTERVAL);
    }

    log('Unified Auto-Pipeline completata con successo!');
}

main().catch(console.error);
