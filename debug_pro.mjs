import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const MODEL = 'gemini-3.1-pro-preview';

async function test() {
    console.log('--- TEST GEMINI PRO ---');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + API_KEY;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Ciao' }] }] })
        });
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Output:', data.candidates ? 'OK' : 'FAIL');
        if (!res.ok) console.log(JSON.stringify(data, null, 2));
    } catch (e) { console.log(e.message); }
}
test();
