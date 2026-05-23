import { execSync } from 'child_process';

const startYear = 2024;
const endYear = 2020; // Fino a quanto indietro vogliamo andare, per esempio 2020.

console.log(`🚀 Avvio scraping massivo Sezioni Semplici a ritroso (da ${startYear} a ${endYear})...`);

for (let year = startYear; year >= endYear; year--) {
    console.log(`\n======================================================`);
    console.log(`▶️ AVVIO SCRAPING PER L'ANNO: ${year}`);
    console.log(`======================================================\n`);
    
    try {
        // Eseguo lo scraper passando l'anno
        execSync(`node scripts/scraper-italgiure-sezioni-semplici.js "${year}"`, { stdio: 'inherit' });
        console.log(`\n✅ Anno ${year} completato con successo!`);
    } catch (e) {
        console.error(`\n❌ ERRORE durante lo scraping dell'anno ${year}. Continuo con il prossimo...`);
    }
}

console.log('\n🎉 Scraping a ritroso completato!');
