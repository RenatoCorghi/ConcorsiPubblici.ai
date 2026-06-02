import path from 'path';

/**
 * Valida l'integrità strutturale e nomofilattica di una scheda VIP.
 * Solleva un'eccezione descrittiva in caso di violazione bloccante (errore).
 * 
 * @param {string} filePath Percorso del file su disco
 * @param {string} content Contenuto testuale della scheda in Markdown
 */
export function validateSheet(filePath, content) {
    const fileName = path.basename(filePath);
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Salta i file contrassegnati intenzionalmente come privi di contenuto utile (indici, sommari, ecc. o file scartati)
    if (content.includes('[NESSUN_CONTENUTO_UTILE]') || content.includes('[SCARTO]') || content.trim().length < 200) {
        return true;
    }

    // ----------------------------------------------------
    // 1. Controllo Anno Futuro Generico
    // ----------------------------------------------------
    const futureYearMatch = content.match(/\b(2027|2028|2029|2030|2035|2040|2050)\b/);
    if (futureYearMatch && !normalizedPath.includes('riviste_vip_schede') && !normalizedPath.includes('schede_tributario_vip')) {
        throw new Error(`[LINTER ERROR] Anno sospetto/futuro rilevato nel contenuto: "${futureYearMatch[1]}"`);
    }

    // ----------------------------------------------------
    // 2. Regole Specifiche per le Sentenze SS.UU.
    // ----------------------------------------------------
    if (normalizedPath.includes('sentenze_ssuu_vip_schede')) {
        const ssuuFileNameMatch = fileName.match(/sn(?:civ|pen)(\d{4})U0*(\d+)/i);
        if (ssuuFileNameMatch) {
            const fileYear = parseInt(ssuuFileNameMatch[1]);
            const fileNum = parseInt(ssuuFileNameMatch[2]);
            
            const firstLine = content.split('\n')[0] || '';
            
            // A. Verifica Anno dal Titolo (Prima riga)
            const contentYearMatch = firstLine.match(/\b(19\d{2}|20\d{2})\b/);
            if (contentYearMatch) {
                const contentYear = parseInt(contentYearMatch[1]);
                if (fileYear !== contentYear) {
                    throw new Error(`[LINTER ERROR] Mismatch Anno Sentenza: nome file indica anno ${fileYear}, ma il titolo indica anno ${contentYear}`);
                }
            } else {
                throw new Error(`[LINTER ERROR] Impossibile estrarre l'anno dalla prima riga (titolo)`);
            }

            // B. Verifica Numero dal Titolo (Prima riga)
            const contentNumMatch = firstLine.match(/n\.\s*(\d+)/i) || firstLine.match(/numero\s*(\d+)/i);
            if (contentNumMatch) {
                const contentNum = parseInt(contentNumMatch[1]);
                if (fileNum !== contentNum) {
                    throw new Error(`[LINTER ERROR] Mismatch Numero Sentenza: nome file indica n. ${fileNum}, ma il titolo indica n. ${contentNum}`);
                }
            } else {
                throw new Error(`[LINTER ERROR] Impossibile estrarre il numero di sentenza dalla prima riga (titolo)`);
            }
        } else {
            throw new Error(`[LINTER ERROR] Nome file non conforme allo standard SS.UU.: "${fileName}"`);
        }

        // C. Verifica Struttura SSUU
        const hasMerito = content.includes('Il Fatto Storico') || content.includes('Merito Sostanziale');
        if (!hasMerito) {
            throw new Error("[LINTER ERROR] Mancanza della sezione 'Il Fatto Storico e il Merito Sostanziale'");
        }
        
        const hasContrasto = content.includes('Contrasto Giurisprudenziale');
        if (!hasContrasto) {
            throw new Error("[LINTER ERROR] Mancanza della sezione 'Il Contrasto Giurisprudenziale'");
        }
        
        const hasPrincipio = content.includes('Principio di Diritto') || content.includes('Massima');
        if (!hasPrincipio) {
            throw new Error("[LINTER ERROR] Mancanza della sezione 'Il Principio di Diritto (Massima)'");
        }
        
        const hasRatio = content.includes('Ratio Decidendi');
        if (!hasRatio) {
            throw new Error("[LINTER ERROR] Mancanza della sezione 'Ratio Decidendi'");
        }
    }

    // ----------------------------------------------------
    // 3. Regole per il Massimario
    // ----------------------------------------------------
    if (normalizedPath.includes('massimario_vip')) {
        const hasInquadramento = content.includes('Inquadramento Sistematico');
        if (!hasInquadramento) {
            throw new Error("[LINTER ERROR] Mancanza della sezione 'Inquadramento Sistematico'");
        }
        
        const hasSoluzione = content.includes('Soluzione del Massimario');
        if (!hasSoluzione) {
            throw new Error("[LINTER ERROR] Mancanza della sezione 'La Soluzione del Massimario'");
        }
    }

    // ----------------------------------------------------
    // 4. Regole per Riviste e Tributario CGT
    // ----------------------------------------------------
    if (normalizedPath.includes('riviste_vip_schede') || normalizedPath.includes('schede_tributario_vip')) {
        // I file cgt_archivio_art_ derivano da articoli HTML e hanno un formato più snello
        const isArchivioArt = fileName.startsWith('cgt_archivio_art_');

        // Verifica dei Metadati
        if (!isArchivioArt && !content.includes('METADATI RAG') && !content.includes('Metadati RAG')) {
            throw new Error("[LINTER ERROR] Mancano i metadati RAG ('🧾 METADATI RAG')");
        }

        // Escludiamo le sottocartelle teoriche dei codici di tributario dai controlli di sezione della giurisprudenza
        const isTheoreticalTaxSheet = normalizedPath.includes('ACCERTAMENTO_DPR_600_1973') ||
                                      normalizedPath.includes('IVA_DPR_633_1972') ||
                                      normalizedPath.includes('PROCESSO_TRIBUTARIO_DLgs_546_1992') ||
                                      normalizedPath.includes('RISCOSSIONE_DPR_602_1973') ||
                                      normalizedPath.includes('TUIR_DPR_917_1986');
        if (!isTheoreticalTaxSheet && !isArchivioArt) {
            const hasFatto = content.includes('Il Fatto e il Principio di Diritto') || 
                             content.includes('La Questione di Diritto') || 
                             content.includes('Dato Normativo') ||
                             content.includes('Inquadramento Sistematico') ||
                             content.includes('Il Nodo Ermeneutico') ||
                             content.includes('### 1.') ||
                             content.includes('1. ');
            if (!hasFatto) {
                throw new Error("[LINTER ERROR] Mancanza della sezione 'Dato Normativo', 'La Questione di Diritto' o 'Inquadramento Sistematico'");
            }
            
            const hasDogmatico = content.includes('Dibattito Dogmatico') || 
                                 content.includes('Quadro Normativo') || 
                                 content.includes('Casistica Giurisprudenziale') ||
                                 content.includes('Nodo Ermeneutico') ||
                                 content.includes('Dibattito Dottrinale') ||
                                 content.includes('Profili Dogmatici') ||
                                 content.includes('### 2.') ||
                                 content.includes('2. ');
            if (!hasDogmatico) {
                throw new Error("[LINTER ERROR] Mancanza della sezione 'Il Dibattito Dogmatico', 'Casistica Giurisprudenziale', 'Dibattito Dottrinale' o 'Profili Dogmatici'");
            }
        }
    }

    return true;
}
