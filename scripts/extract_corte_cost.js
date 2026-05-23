/**
 * ESTRAZIONE SENTENZE CORTE COSTITUZIONALE dal dataset Open Data
 * 
 * Workflow:
 * 1. Legge le 420 sentenze CC identificate nel riviste_sentenze_index.json
 * 2. Estrae i JSON annuali dagli ZIP del portale Open Data
 * 3. Matcha numero/anno e salva i testi completi
 * 
 * I dataset Open Data sono scaricati da:
 *   https://dati.cortecostituzionale.it/Scarica_i_dati/Scarica_i_dati
 * 
 * Licenza: CC BY SA 3.0
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════
const BASE = path.resolve('.');
const DATA = path.join(BASE, 'data');
const OUT_DIR = path.join(BASE, 'sentenze_corte_cost');

// ZIP dei dataset annuali (già scaricati e estratti al primo livello)
const PERIOD_DIRS = [
    { dir: path.join(DATA, 'cc_json_1956'), range: '1956-1980' },
    { dir: path.join(DATA, 'cc_json_1981'), range: '1981-2000' },
    { dir: path.join(DATA, 'cc_json_2001'), range: '2001-oggi' },
];

// ═══════════════════════════════════════════════════
// STEP 1: Carica le sentenze da cercare
// ═══════════════════════════════════════════════════
function loadTargets() {
    const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'riviste_sentenze_index.json'), 'utf8'));
    const targets = idx.sentenze
        .filter(s => s.corte === 'Corte Costituzionale' && s.anno && s.numero)
        .map(s => ({
            numero: s.numero,
            anno: s.anno,
            citazioni: s.citazioni,
            fonti: s.fonti,
            key: `${s.anno}_${s.numero}`
        }));
    
    console.log(`🎯 Sentenze CC da cercare: ${targets.length}`);
    return targets;
}

// ═══════════════════════════════════════════════════
// STEP 2: Estrai e carica i JSON annuali
// ═══════════════════════════════════════════════════
function extractAndLoadYear(yearZipPath, tempDir) {
    // Estrai lo ZIP annuale in una directory temporanea
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    try {
        execSync(`powershell -Command "Expand-Archive -Path '${yearZipPath}' -DestinationPath '${tempDir}' -Force"`, {
            stdio: 'pipe',
            timeout: 30000
        });
    } catch (e) {
        console.error(`  ⚠️ Errore estrazione ${yearZipPath}: ${e.message}`);
        return [];
    }
    
    // Trova il file JSON estratto
    const jsonFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) {
        console.error(`  ⚠️ Nessun JSON trovato in ${tempDir}`);
        return [];
    }
    
    const jsonPath = path.join(tempDir, jsonFiles[0]);
    // I file JSON della CC sono codificati in Latin-1 (ISO-8859-1), non UTF-8
    const data = JSON.parse(fs.readFileSync(jsonPath, 'latin1'));
    
    // Pulisci il tempdir
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    return data.elenco_pronunce || [];
}

// ═══════════════════════════════════════════════════
// STEP 3: Processa e salva le sentenze trovate
// ═══════════════════════════════════════════════════
function formatSentenza(pronunzia, target) {
    const tipo = pronunzia.tipologia_pronuncia === 'S' ? 'Sentenza' :
                 pronunzia.tipologia_pronuncia === 'O' ? 'Ordinanza' :
                 pronunzia.tipologia_pronuncia === 'D' ? 'Decreto' :
                 pronunzia.tipologia_pronuncia || 'Pronuncia';
    
    // Pulisci encoding problematico (UTF-8 vs Latin-1)
    const cleanText = (t) => {
        if (!t) return '';
        return t.replace(/&#13;/g, '\n')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .trim();
    };
    
    let md = '';
    md += `# Corte Costituzionale - ${tipo} n. ${pronunzia.numero_pronuncia}/${pronunzia.anno_pronuncia}\n\n`;
    md += `## Metadati\n\n`;
    md += `| Campo | Valore |\n|---|---|\n`;
    md += `| **Tipo** | ${tipo} |\n`;
    md += `| **Numero** | ${pronunzia.numero_pronuncia} |\n`;
    md += `| **Anno** | ${pronunzia.anno_pronuncia} |\n`;
    md += `| **ECLI** | ${pronunzia.ecli || 'N/D'} |\n`;
    md += `| **Data Decisione** | ${pronunzia.data_decisione || 'N/D'} |\n`;
    md += `| **Data Deposito** | ${pronunzia.data_deposito || 'N/D'} |\n`;
    md += `| **Presidente** | ${pronunzia.presidente || 'N/D'} |\n`;
    md += `| **Relatore** | ${pronunzia.relatore_pronuncia || 'N/D'} |\n`;
    md += `| **Redattore** | ${pronunzia.redattore_pronuncia || 'N/D'} |\n`;
    md += `| **Citazioni nelle Riviste** | ${target.citazioni}x |\n`;
    md += `| **Fonti** | ${target.fonti.join(', ')} |\n`;
    md += `| **Fonte Dati** | Open Data Corte Costituzionale (CC BY SA 3.0) |\n\n`;
    
    if (pronunzia.epigrafe) {
        md += `## Epigrafe\n\n${cleanText(pronunzia.epigrafe)}\n\n`;
    }
    
    if (pronunzia.collegio) {
        md += `## Collegio\n\n${cleanText(pronunzia.collegio)}\n\n`;
    }
    
    if (pronunzia.testo) {
        md += `## Testo\n\n${cleanText(pronunzia.testo)}\n\n`;
    }
    
    if (pronunzia.dispositivo) {
        md += `## Dispositivo\n\n${cleanText(pronunzia.dispositivo)}\n\n`;
    }
    
    return md;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════
async function main() {
    console.log('═'.repeat(60));
    console.log('🏛️  ESTRAZIONE SENTENZE CORTE COSTITUZIONALE');
    console.log('═'.repeat(60));
    
    // Carica targets
    const targets = loadTargets();
    const targetMap = new Map();
    for (const t of targets) targetMap.set(t.key, t);
    
    // Crea output dir
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    
    let found = 0;
    let notFound = 0;
    const foundKeys = new Set();
    const stats = { byYear: {}, byType: {} };
    
    // Per ogni periodo
    for (const period of PERIOD_DIRS) {
        console.log(`\n📂 Periodo: ${period.range}`);
        
        if (!fs.existsSync(period.dir)) {
            console.log(`  ⚠️ Directory non trovata: ${period.dir}`);
            continue;
        }
        
        // Lista gli ZIP annuali
        const yearZips = fs.readdirSync(period.dir)
            .filter(f => f.endsWith('.zip'))
            .sort();
        
        console.log(`  ${yearZips.length} archivi annuali trovati`);
        
        for (const zipFile of yearZips) {
            const yearMatch = zipFile.match(/(\d{4})/);
            if (!yearMatch) continue;
            const year = parseInt(yearMatch[1]);
            
            // Quali sentenze ci servono da quest'anno?
            const neededFromYear = targets.filter(t => t.anno === year && !foundKeys.has(t.key));
            if (neededFromYear.length === 0) {
                // Nessuna sentenza necessaria da quest'anno, skip
                continue;
            }
            
            const zipPath = path.join(period.dir, zipFile);
            const tempDir = path.join(DATA, `_temp_cc_${year}`);
            
            process.stdout.write(`  📅 ${year}: ${neededFromYear.length} da cercare... `);
            
            const pronunce = extractAndLoadYear(zipPath, tempDir);
            if (pronunce.length === 0) {
                console.log('❌ nessun dato');
                continue;
            }
            
            let yearFound = 0;
            for (const target of neededFromYear) {
                // Cerca match per numero
                const match = pronunce.find(p => 
                    parseInt(p.numero_pronuncia) === target.numero &&
                    parseInt(p.anno_pronuncia) === target.anno
                );
                
                if (match) {
                    // Salva il file
                    const filename = `cc_${target.anno}_${String(target.numero).padStart(4, '0')}.md`;
                    const content = formatSentenza(match, target);
                    fs.writeFileSync(path.join(OUT_DIR, filename), content, 'utf8');
                    
                    foundKeys.add(target.key);
                    found++;
                    yearFound++;
                    
                    const tipo = match.tipologia_pronuncia || '?';
                    stats.byType[tipo] = (stats.byType[tipo] || 0) + 1;
                    stats.byYear[year] = (stats.byYear[year] || 0) + 1;
                }
            }
            
            console.log(`✅ trovate ${yearFound}/${neededFromYear.length} (${pronunce.length} pronunce nell'archivio)`);
        }
    }
    
    // Report sentenze non trovate
    const missing = targets.filter(t => !foundKeys.has(t.key));
    notFound = missing.length;
    
    console.log('\n' + '═'.repeat(60));
    console.log(`📊 RISULTATO FINALE`);
    console.log(`  ✅ Trovate: ${found}/${targets.length}`);
    console.log(`  ❌ Non trovate: ${notFound}`);
    console.log(`  📁 Directory: ${OUT_DIR}`);
    
    if (notFound > 0) {
        console.log(`\n  Sentenze mancanti:`);
        for (const m of missing.sort((a,b) => b.citazioni - a.citazioni).slice(0, 20)) {
            console.log(`    - n. ${m.numero}/${m.anno} (${m.citazioni} citazioni)`);
        }
        // Salva elenco completo mancanti
        fs.writeFileSync(
            path.join(DATA, 'cc_mancanti.json'),
            JSON.stringify(missing, null, 2),
            'utf8'
        );
    }
    
    console.log(`\n  Per tipo:`);
    for (const [tipo, count] of Object.entries(stats.byType).sort((a,b) => b[1]-a[1])) {
        const label = { S: 'Sentenza', O: 'Ordinanza', D: 'Decreto' }[tipo] || tipo;
        console.log(`    ${label}: ${count}`);
    }
    
    console.log('\n✅ Completato!');
}

main().catch(console.error);
