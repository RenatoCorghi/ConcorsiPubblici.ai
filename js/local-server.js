import http from 'http';
import fs from 'fs';
import path from 'path';
import { urlToHttpOptions, fileURLToPath } from 'url';

// ─── Caricamento .env ─────────────────────────────────────────
// Legge TUTTE le chiavi dal file .env e le inietta in process.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __envPath = path.resolve(__dirname, '..', '.env');
try {
    const envFile = fs.readFileSync(__envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const val = match[2].trim();
            if (!process.env[key]) process.env[key] = val;
        }
    });
    console.log('✅ .env caricato con successo');
} catch (e) {
    console.warn('⚠️  File .env non trovato, uso variabili di ambiente di sistema.');
}

// Mock di un server Vercel locale per gestire sia i file statici che le API
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_9RLOMhYtEvC0ehjgupQqkQ_GbVdzJf6';

const PORT = 3001;

// Importiamo l'handler della proxy
// NOTA: In un ambiente di produzione usiamo vercel dev, questo è un fallback per lo sviluppo locale puro
import proxyHandler from '../api/proxy.js';
import bandiHandler from '../api/bandi.js';
import giustiziaHandler from '../api/giustizia.js';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Gestione Rotte API
    if (req.url.startsWith('/api/proxy')) {
        // Mock dell'oggetto request/response di Vercel/Express per il nostro handler
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                req.body = body ? JSON.parse(body) : {};
                
                // Decoriamo 'res' con il metodo .status e .json come si aspetta l'handler
                res.status = (code) => {
                    res.statusCode = code;
                    return res;
                };
                res.json = (data) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                    return res;
                };

                await proxyHandler(req, res);
            } catch (err) {
                console.error("Server API Error:", err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Internal Server Error", detail: err.message }));
            }
        });
        return;
    }

    if (req.url.startsWith('/api/bandi')) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                // Parse query parameters
                const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
                const query = {};
                for (const [key, value] of parsedUrl.searchParams.entries()) {
                    query[key] = value;
                }
                req.query = query;
                req.body = body ? JSON.parse(body) : {};
                
                res.status = (code) => {
                    res.statusCode = code;
                    return res;
                };
                res.json = (data) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                    return res;
                };

                await bandiHandler(req, res);
            } catch (err) {
                console.error("Server API Error (Bandi):", err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Internal Server Error", detail: err.message }));
            }
        });
        return;
    }

    if (req.url.startsWith('/api/giustizia')) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
                const query = {};
                for (const [key, value] of parsedUrl.searchParams.entries()) {
                    query[key] = value;
                }
                req.query = query;
                req.body = body ? JSON.parse(body) : {};
                
                res.status = (code) => {
                    res.statusCode = code;
                    return res;
                };
                res.json = (data) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                    return res;
                };

                await giustiziaHandler(req, res);
            } catch (err) {
                console.error("Server API Error (Giustizia):", err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Internal Server Error", detail: err.message }));
            }
        });
        return;
    }

    if (req.url.startsWith('/api/ssuu')) {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
                const query = {};
                for (const [key, value] of parsedUrl.searchParams.entries()) {
                    query[key] = value;
                }
                req.query = query;
                req.body = body ? JSON.parse(body) : {};
                
                res.status = (code) => {
                    res.statusCode = code;
                    return res;
                };
                res.json = (data) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                    return res;
                };

                const ssuuHandler = (await import('../api/ssuu.js')).default;
                await ssuuHandler(req, res);
            } catch (err) {
                console.error("Server API Error (SSUU):", err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Internal Server Error", detail: err.message }));
            }
        });
        return;
    }

    // Gestione File Statici
    let filePath = '.' + (req.url === '/' || req.url.startsWith('/#') ? '/index.html' : req.url.split('?')[0]);
    
    // Gestione SPA routing (se il file non esiste e non ha estensione, servi index.html)
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile('./index.html', (err, indexContent) => {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(indexContent, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`API SERVER LOCALE CONCORSI.AI ATTIVO!`);
    console.log(`API URL: http://localhost:${PORT}`);
    console.log(`NOTA: Il frontend deve girare tramite Vite (npm run dev) sulla porta 3000`);
    console.log(`==========================================`);
    console.log(`Pressione Ctrl+C per fermare il server.`);
});
