#!/usr/bin/env node
/* ============================================================
   MIGRATE-DATA.JS — Migrazione dati da data.js a Supabase
   
   Uso: 
   set SUPABASE_SERVICE_KEY=eyJ...
   node scripts/migrate-data.js
   ============================================================ */

import { createClient } from '@supabase/supabase-js';
import { DB_TRACCE, GLOSSARIO_ISTITUTI } from '../data.js';

// --- CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY non trovata.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    console.log('🚀 Avvio migrazione dati verso Supabase...\n');

    // 1. Migrazione Tracce
    console.log(`📚 Trovate ${DB_TRACCE.length} tracce in data.js`);
    for (const traccia of DB_TRACCE) {
        // Prepariamo l'oggetto per Supabase
        const record = {
            id: traccia.id, // Forziamo l'ID originale per mantenere i link
            materia: traccia.materia,
            anno: parseInt(traccia.anno) || null,
            testo: traccia.testo,
            estratta: traccia.estratta || false,
            elementi_chiave: traccia.elementi_chiave || null,
            insidie: traccia.insidie || null
        };

        const { error } = await supabase.from('tracce').upsert(record);
        if (error) {
            console.error(`❌ Errore traccia ID ${traccia.id}:`, error.message);
        } else {
            console.log(`   ✅ Traccia inserita: ${traccia.materia} (${traccia.anno})`);
        }
    }

    console.log('\n----------------------------------------\n');

    // 2. Migrazione Glossario
    let countGlossario = 0;
    for (const [materia, istituti] of Object.entries(GLOSSARIO_ISTITUTI)) {
        console.log(`📖 Materia: ${materia} (${istituti.length} istituti)`);
        
        // Prepariamo un batch per materia
        const records = istituti.map(istituto => ({
            materia: materia,
            istituto: istituto
        }));

        const { error } = await supabase.from('glossario').upsert(records, { onConflict: 'istituto, materia', ignoreDuplicates: true });
        if (error) {
            console.error(`❌ Errore glossario ${materia}:`, error.message);
        } else {
            countGlossario += istituti.length;
            console.log(`   ✅ ${istituti.length} istituti inseriti.`);
        }
    }

    console.log(`\n🎉 Migrazione completata! Tracce e Glossario sono ora su Supabase.`);
}

main().catch(console.error);
