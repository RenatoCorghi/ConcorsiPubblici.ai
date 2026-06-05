import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'data', 'commerciale_oa');
fs.mkdirSync(outDir, { recursive: true });

const files = [
    { name: 'Cass_Rel_87_2022_Crisi.pdf', url: 'https://www.cortedicassazione.it/resources/cms/documents/Rel087-2022_NOV._NORMATIVA.pdf' },
    { name: 'Cass_Rassegna_2020_Vol2.pdf', url: 'https://www.cortedicassazione.it/resources/cms/documents/rassegna_civile_2020_vol_II.pdf' },
    { name: 'Cass_Rassegna_2021_Vol2.pdf', url: 'https://www.cortedicassazione.it/resources/cms/documents/VOL-2_rassegna_civile_2021.pdf' },
    { name: 'CaFoscari_Crisi_Bancarie.pdf', url: 'https://edizionicafoscari.unive.it/media/pdf/article/ricerche-giuridiche/2013/4/la-disciplina-italiana-in-tema-di-gestione-delle-c/art-10.14277-2281-6100-54p.pdf' },
    { name: 'BancaDItalia_QRG_99.pdf', url: 'https://www.bancaditalia.it/pubblicazioni/quaderni-giuridici/2024-0099/qrg_99.pdf' },
    { name: 'BancaDItalia_QRG_101.pdf', url: 'https://www.bancaditalia.it/pubblicazioni/quaderni-giuridici/2024-0101/qrg_101.pdf' },
    { name: 'Luiss_Regolazione_Fintech.pdf', url: 'https://iris.luiss.it/retrieve/ef16e8a0-176b-4934-88a2-9156a01316be/Regolazione%20Fintech%20e%20testo%20unico%20bancario%20-%20R.Lener%20%282%29.pdf' }
];

async function download() {
    for (const f of files) {
        console.log(`Downloading ${f.name}...`);
        try {
            const res = await fetch(f.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            if (!res.ok) {
                console.error(`Failed ${f.name}: HTTP ${res.status}`);
                continue;
            }
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(path.join(outDir, f.name), Buffer.from(buffer));
            console.log(`Saved ${f.name} (${Math.round(buffer.byteLength/1024)} KB)`);
        } catch (e) {
            console.error(`Error ${f.name}: ${e.message}`);
        }
    }
}

download();
