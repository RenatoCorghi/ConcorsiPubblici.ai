import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const SYSTEM_PROMPT = fs.readFileSync('test_prompt_admin.mjs', 'utf8').match(/const SYSTEM_PROMPT = ([\s\S]*?);/)[1];

const USER_TEXT = fs.readFileSync('sample_admin_text.txt', 'utf8');

async function run() {
    console.log("Generazione Scheda VIP V3 in corso...");
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=' + API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: USER_TEXT }] }],
            generationConfig: { temperature: 0.1 }
        })
    });
    
    const data = await response.json();
    const result = data.candidates[0].content.parts[0].text;
    fs.writeFileSync('test_admin_vip_v3.md', result, 'utf8');
    console.log("? Fatto! Salvato in test_admin_vip_v3.md");
}
run();
