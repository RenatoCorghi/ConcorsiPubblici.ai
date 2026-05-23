import fs from 'fs';
import path from 'path';

const TARGET_DIRS = [
    'sentenze_ssuu_vip_schede',
    'schede_tributario_vip',
    'corte_conti_vip_schede',
    'massimario_vip',
    'manuali_oa_schede_v3',
    'riviste_vip_schede',
    'riviste_vip_schede_v2'
];

const REPORT_FILE = 'audit_integrity_report.txt';

// Utility per la scansione ricorsiva di tutti i file .md nelle cartelle target
function getFilesRecursive(dirPath) {
    let results = [];
    if (!fs.existsSync(dirPath)) return results;
    
    const list = fs.readdirSync(dirPath);
    for (const file of list) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(getFilesRecursive(fullPath));
        } else if (file.endsWith('.md') && !file.startsWith('TEST_') && !file.startsWith('ORIGINALE_')) {
            results.push(fullPath);
        }
    }
    return results;
}

// Funzione principale di auditing
async function runAudit() {
    console.log("🔍 AVVIO DELLO SCANNER DI INTEGRITÀ PROGRAMMATICO");
    console.log("📂 Scansione delle cartelle di schede VIP...");
    
    let allFiles = [];
    for (const dir of TARGET_DIRS) {
        const fullDirPath = path.resolve(dir);
        if (fs.existsSync(fullDirPath)) {
            const files = getFilesRecursive(fullDirPath);
            console.log(`  - [${dir}]: trovati ${files.length} file .md`);
            allFiles = allFiles.concat(files);
        }
    }
    
    console.log(`\n🏆 Totale file .md da scansionare: ${allFiles.length}`);
    console.log("⏳ Esecuzione dell'analisi (RAM-safe, lettura sequenziale)...");
    
    let anomalies = [];
    let scannedCount = 0;
    
    const startTime = Date.now();
    
    for (const filePath of allFiles) {
        scannedCount++;
        if (scannedCount % 1000 === 0) {
            console.log(`   ... analizzati ${scannedCount}/${allFiles.length} file ...`);
        }
        
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const fileName = path.basename(filePath);
            const relativePath = path.relative(path.resolve('.'), filePath);
            
            // Salta i file intenzionalmente contrassegnati come privi di contenuto utile (indici, sommari, ecc. o file scartati)
            if (content.includes('[NESSUN_CONTENUTO_UTILE]') || content.includes('[SCARTO]') || content.trim().length < 200) {
                continue;
            }
            
            const fileAnomalies = [];
            
            // ----------------------------------------------------
            // 1. Controllo Anno Futuro o Anomalo (Tutte le schede tranne riviste e tributario)
            // ----------------------------------------------------
            // Cerca anni futuri superiori al 2026 nel contenuto
            const futureYearMatch = content.match(/\b(2027|2028|2029|2030|2035|2040|2050)\b/);
            if (futureYearMatch && !relativePath.includes('riviste_vip_schede') && !relativePath.includes('schede_tributario_vip')) {
                fileAnomalies.push(`Anno sospetto/futuro rilevato nel contenuto: "${futureYearMatch[1]}"`);
            }
            
            // ----------------------------------------------------
            // 2. Coerenza Numero Sentenza e Anno (Solo per sentenze SSUU)
            // ----------------------------------------------------
            if (filePath.includes('sentenze_ssuu_vip_schede')) {
                // Estrae l'anno ed il numero di sentenza dal nome del file (es: snciv2025U01898S.md -> anno 2025, num 1898)
                const ssuuFileNameMatch = fileName.match(/sn(?:civ|pen)(\d{4})U0*(\d+)/i);
                if (ssuuFileNameMatch) {
                    const fileYear = parseInt(ssuuFileNameMatch[1]);
                    const fileNum = parseInt(ssuuFileNameMatch[2]);
                    
                    const firstLine = content.split('\n')[0] || '';
                    
                    // A. Estrae anno dalla prima riga (titolo)
                    const contentYearMatch = firstLine.match(/\b(19\d{2}|20\d{2})\b/);
                    if (contentYearMatch) {
                        const contentYear = parseInt(contentYearMatch[1]);
                        if (fileYear !== contentYear) {
                            fileAnomalies.push(`Mismatch Anno Sentenza: nome file indica anno ${fileYear}, ma il titolo indica anno ${contentYear}`);
                        }
                    } else {
                        fileAnomalies.push(`Impossibile estrarre l'anno dalla prima riga del titolo`);
                    }

                    // B. Estrae numero dalla prima riga (titolo)
                    const contentNumMatch = firstLine.match(/n\.\s*(\d+)/i) || firstLine.match(/numero\s*(\d+)/i);
                    if (contentNumMatch) {
                        const contentNum = parseInt(contentNumMatch[1]);
                        if (fileNum !== contentNum) {
                            fileAnomalies.push(`Mismatch Numero Sentenza: nome file indica n. ${fileNum}, ma il titolo indica n. ${contentNum}`);
                        }
                    } else {
                        fileAnomalies.push(`Impossibile estrarre il numero di sentenza dalla prima riga del titolo`);
                    }
                }
            }
            
            // ----------------------------------------------------
            // 3. Verifica Integrità Strutturale (Sezioni basate sul tipo)
            // ----------------------------------------------------
            if (filePath.includes('sentenze_ssuu_vip_schede')) {
                // Struttura rigida SSUU
                const hasMerito = content.includes('Il Fatto Storico') || content.includes('Merito Sostanziale');
                if (!hasMerito) fileAnomalies.push("Mancanza apparente della sezione 'Il Fatto Storico e il Merito Sostanziale'");
                
                const hasContrasto = content.includes('Contrasto Giurisprudenziale');
                if (!hasContrasto) fileAnomalies.push("Mancanza apparente della sezione 'Il Contrasto Giurisprudenziale'");
                
                const hasPrincipio = content.includes('Principio di Diritto') || content.includes('Massima');
                if (!hasPrincipio) fileAnomalies.push("Mancanza apparente della sezione 'Il Principio di Diritto (Massima)'");
                
                const hasRatio = content.includes('Ratio Decidendi');
                if (!hasRatio) fileAnomalies.push("Mancanza apparente della sezione 'Ratio Decidendi'");
            } else if (filePath.includes('massimario_vip')) {
                // Struttura Massimario
                const hasInquadramento = content.includes('Inquadramento Sistematico');
                if (!hasInquadramento) fileAnomalies.push("Mancanza apparente della sezione 'Inquadramento Sistematico'");
                
                const hasSoluzione = content.includes('Soluzione del Massimario');
                if (!hasSoluzione) fileAnomalies.push("Mancanza apparente della sezione 'La Soluzione del Massimario'");
            } else if (filePath.includes('riviste_vip_schede') || filePath.includes('riviste_vip_schede_v2') || filePath.includes('schede_tributario_vip')) {
                // Struttura Riviste e Tributario CGT
                if (!content.includes('METADATI RAG') && !content.includes('Metadati RAG')) {
                    fileAnomalies.push("Mancano i metadati RAG ('🧾 METADATI RAG')");
                }
                
                // Escludiamo le sottocartelle teoriche dei codici di tributario dai controlli di sezione della giurisprudenza
                const isTheoreticalTaxSheet = relativePath.includes('ACCERTAMENTO_DPR_600_1973') ||
                                              relativePath.includes('IVA_DPR_633_1972') ||
                                              relativePath.includes('PROCESSO_TRIBUTARIO_DLgs_546_1992') ||
                                              relativePath.includes('RISCOSSIONE_DPR_602_1973') ||
                                              relativePath.includes('TUIR_DPR_917_1986');
                if (!isTheoreticalTaxSheet) {
                    const hasFatto = content.includes('Il Fatto e il Principio di Diritto') || 
                                     content.includes('La Questione di Diritto') || 
                                     content.includes('Dato Normativo') ||
                                     content.includes('Inquadramento Sistematico') ||
                                     content.includes('Il Nodo Ermeneutico') ||
                                     content.includes('### 1.') ||
                                     content.includes('1. ');
                    if (!hasFatto) fileAnomalies.push("Mancanza della sezione 'Dato Normativo', 'La Questione di Diritto' o 'Inquadramento Sistematico'");
                    
                    const hasDogmatico = content.includes('Dibattito Dogmatico') || 
                                         content.includes('Quadro Normativo') || 
                                         content.includes('Casistica Giurisprudenziale') ||
                                         content.includes('Nodo Ermeneutico') ||
                                         content.includes('Dibattito Dottrinale') ||
                                         content.includes('Profili Dogmatici') ||
                                         content.includes('### 2.') ||
                                         content.includes('2. ');
                    if (!hasDogmatico) fileAnomalies.push("Mancanza della sezione 'Il Dibattito Dogmatico', 'Casistica Giurisprudenziale', 'Dibattito Dottrinale' o 'Profili Dogmatici'");
                }
            }
            
            // Registra le anomalie se trovate
            if (fileAnomalies.length > 0) {
                anomalies.push({
                    file: relativePath,
                    errors: fileAnomalies
                });
            }
            
        } catch (e) {
            anomalies.push({
                file: filePath,
                errors: [`Errore durante la lettura o il parsing del file: ${e.message}`]
            });
        }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Generazione del report finale
    let reportText = `=========================================================\n`;
    reportText += ` REPORT INTEGRITÀ SCHEDE VIP — RAG AUDIT\n`;
    reportText += ` Eseguito il: ${new Date().toISOString()}\n`;
    reportText += ` Tempo impiegato: ${duration} secondi\n`;
    reportText += `=========================================================\n\n`;
    reportText += `📊 Statistiche generali:\n`;
    reportText += ` - Schede VIP totali analizzate: ${allFiles.length}\n`;
    reportText += ` - Schede conformi con successo:  ${allFiles.length - anomalies.length}\n`;
    reportText += ` - Schede con anomalie riscontrate: ${anomalies.length}\n\n`;
    reportText += `=========================================================\n`;
    reportText += ` ELENCO DELLE ANOMALIE DETTAGLIATE\n`;
    reportText += `=========================================================\n\n`;
    
    if (anomalies.length === 0) {
        reportText += `✨ COMPLIMENTI! Nessuna anomalia strutturale o di coerenza riscontrata.\n`;
    } else {
        anomalies.forEach((a, index) => {
            reportText += `[${index + 1}] File: ${a.file}\n`;
            a.errors.forEach(err => {
                reportText += `    ⚠️  ${err}\n`;
            });
            reportText += `---------------------------------------------------------\n`;
        });
    }
    
    fs.writeFileSync(REPORT_FILE, reportText, 'utf8');
    
    console.log(`\n=========================================================`);
    console.log(`✅ AUDIT COMPLETATO IN ${duration} SECONDI!`);
    console.log(`📊 Risultati:`);
    console.log(`   - Analizzati: ${allFiles.length} file`);
    console.log(`   - Anomalie riscontrate: ${anomalies.length}`);
    console.log(`📝 Report scritto con successo in: ${REPORT_FILE}`);
    console.log(`=========================================================\n`);
}

runAudit().catch(console.error);
