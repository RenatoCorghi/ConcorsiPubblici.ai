import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Quando corri localmente con 'npm run dev', 
      // i richiami a /api/... verranno reindirizzati al server delle funzioni se attivo.
      // Se usi 'vercel dev', questo file potrebbe non essere necessario ma aiuta Vite a gestire i percorsi.
      '/api': {
        target: 'http://127.0.0.1:3001', // Forza l'uso di IPv4 per evitare bug di risoluzione localhost
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  }
});
