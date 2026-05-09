import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.ANTHROPIC_API_KEY;
const MODEL = 'claude-3-opus-20240229';

async function test() {
    console.log('--- TEST ANTHROPIC OPUS ---');
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
            })
        });
        console.log('Status:', res.status);
        const data = await res.json();
        if (!res.ok) console.log(JSON.stringify(data, null, 2));
        else console.log('RISPOSTA:', data.content[0].text);
    } catch (e) { console.log(e.message); }
}
test();
