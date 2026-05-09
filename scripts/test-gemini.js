import fetch from 'node-fetch';

const googleKey = process.env.GOOGLE_AI_KEY;
if (!googleKey) {
    console.error("Manca GOOGLE_AI_KEY");
    process.exit(1);
}

async function test() {
    const fetchUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const fetchHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${googleKey}`
    };
    const fetchBody = JSON.stringify({
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'Ciao!' }]
    });

    try {
        const response = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Response:", text);
    } catch(e) {
        console.error("Errore:", e);
    }
}

test();
