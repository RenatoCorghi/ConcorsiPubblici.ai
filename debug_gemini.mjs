import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Caricamento manuale .env per evitare dipendenze esterne
const envPath = path.resolve('.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';

async function test() {
    console.log('--- TEST GEMINI API ---');
    console.log('Modello:', MODEL);
    
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + API_KEY;
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Ciao, rispondi con una sola parola: OK.' }] }]
            })
        });
        
        console.log('HTTP Status:', res.status);
        const data = await res.json();
        
        if (!res.ok) {
            console.error('ERRORE API:', JSON.stringify(data, null, 2));
        } else {
            console.log('RISPOSTA:', data.candidates[0].content.parts[0].text);
        }
    } catch (e) {
        console.error('ERRORE NETWORK:', e.message);
    }
}

test();
