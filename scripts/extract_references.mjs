import fs from 'fs';
import path from 'path';

const scratchDir = 'C:\\Users\\Pc\\.gemini\\antigravity\\brain\\87495386-19b0-404d-b302-752267b2a4ae\\scratch';
const outputFile = 'C:\\Users\\Pc\\.gemini\\antigravity\\brain\\87495386-19b0-404d-b302-752267b2a4ae\\sentenze_da_recuperare.md';

function extractReferences() {
    console.log("🔍 Estrazione riferimenti giurisprudenziali dalle schede SSM...");
    
    const files = fs.readdirSync(scratchDir).filter(f => f.startsWith('scheda_') && f.endsWith('.md'));
    let output = `# Elenco Sentenze e Norme da Recuperare (Piano "Reverse Engineering Giurisprudenziale")\n\n`;
    output += `Questo documento contiene la lista delle sentenze (Cassazione, SS.UU., Corte Cost., CGUE) e dei riferimenti normativi estratti dai Quaderni SSM. Queste fonti pubbliche (non coperte da copyright) dovranno essere recuperate integralmente per alimentare il nuovo database RAG in modo etico e inattaccabile.\n\n`;
    output += `| File Originale | Materia | Istituto Principale | Riferimenti Giurisprudenziali / Normativi |\n`;
    output += `| --- | --- | --- | --- |\n`;
    
    for (const file of files) {
        const fullPath = path.join(scratchDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Estraiamo solo se è una scheda SSM (contiene "Quaderno SSM")
        if (content.includes('Quaderno SSM')) {
            let riferimento = "N/A";
            let materia = "N/A";
            let istituto = "N/A";
            
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.includes('* Riferimento:')) riferimento = line.replace('* Riferimento:', '').trim();
                else if (line.includes('Riferimento: [')) riferimento = line.replace('Riferimento: [', '').replace(']', '').trim(); // formato alternativo
                
                if (line.includes('* Materia:')) materia = line.replace('* Materia:', '').trim();
                else if (line.includes('Materia:')) materia = line.replace('Materia:', '').trim();
                
                if (line.includes('* Istituto Principale:')) istituto = line.replace('* Istituto Principale:', '').trim();
                else if (line.includes('Istituto Principale:')) istituto = line.replace('Istituto Principale:', '').trim();
            }
            
            output += `| ${file} | ${materia} | ${istituto} | **${riferimento}** |\n`;
        }
    }
    
    fs.writeFileSync(outputFile, output);
    console.log(`✅ Estrazione completata! Tabella salvata in ${outputFile}`);
}

extractReferences();
