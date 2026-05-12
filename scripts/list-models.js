import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;

async function listModels() {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
}

listModels();
