import fetch from 'node-fetch';
import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

async function testGemini() {
    console.log('Test connessione Gemini API...');
    try {
        const url = https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Ciao, test connessione.' }] }]
            })
        });
        console.log('Status HTTP:', res.status);
        const data = await res.json();
        if (data.error) {
            console.error('Errore API:', data.error.message);
        } else {
            console.log('OK! Risposta:', data.candidates[0].content.parts[0].text);
        }
    } catch (e) {
        console.error('Errore Network:', e.message);
    }
}
testGemini();
