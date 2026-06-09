export const ALLOWED_ORIGINS = [
    'https://concorsipubblici.ai',
    'https://www.concorsipubblici.ai',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
];

export function isOriginAllowed(origin) {
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    // Solo i preview deployment del NOSTRO progetto: una regex aperta su *.vercel.app
    // permetterebbe a qualsiasi sito hostato su Vercel di consumare l'API dai browser dei visitatori.
    // Se il nome del progetto Vercel cambia, aggiornare il prefisso qui sotto.
    if (/^https:\/\/concorsi[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
    return false;
}
