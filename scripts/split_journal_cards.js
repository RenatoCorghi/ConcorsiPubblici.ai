import fs from 'fs';
import path from 'path';

function splitAndSave() {
    const sourceDir = 'riviste_priority';
    const outputDir = 'riviste_priority_split';
    
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    
    const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
    console.log(`📂 Inizio splitting di ${files.length} file...`);

    let totalCards = 0;

    files.forEach(file => {
        const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
        // Dividi basandoti sul pattern dei metadati
        const cards = content.split(/---\n\n🧾 METADATI RAG|🧾 METADATI RAG/);
        
        cards.forEach((card, index) => {
            if (card.trim().length < 200) return; // Salta il thinking o pezzi vuoti

            // Pulisci e ricostruisci la struttura
            let cardContent = card.trim();
            if (!cardContent.startsWith('🧾 METADATI RAG')) {
                cardContent = '🧾 METADATI RAG\n' + cardContent;
            }

            // Estrai un titolo per il file
            const titleMatch = cardContent.match(/\* Istituto Principale: (.*)/);
            const rawTitle = titleMatch ? titleMatch[1].trim() : `scheda_${index}`;
            const safeTitle = rawTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
            
            const fileName = `${path.basename(file, '.md')}_${index}_${safeTitle}.md`;
            fs.writeFileSync(path.join(outputDir, fileName), cardContent);
            totalCards++;
        });
    });

    console.log(`✅ Splitting completato. Generate ${totalCards} schede singole in ${outputDir}.`);
}

splitAndSave();
