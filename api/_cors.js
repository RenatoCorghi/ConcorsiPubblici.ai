export const ALLOWED_ORIGINS = [
    'https://concorsipubblici.ai',
    'https://www.concorsipubblici.ai',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
];

export function isOriginAllowed(origin) {
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
    return false;
}
