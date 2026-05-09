import { AppState } from './state.js';

/**
 * Mappa colori per concorso — ogni palette definisce le shade CSS custom.
 * Per aggiungere un nuovo concorso, basta aggiungere una riga.
 */
const THEME_PALETTES = {
    'Magistratura':       { 950: '#2e1065', 900: '#4c1d95', 800: '#5b21b6', 600: '#7c3aed', 500: '#8b5cf6', 400: '#a78bfa', 300: '#c4b5fd' },
    'Avvocatura':         { 950: '#450a0a', 900: '#7f1d1d', 800: '#991b1b', 600: '#dc2626', 500: '#ef4444', 400: '#f87171', 300: '#fca5a5' },
    'Notariato':          { 950: '#022c22', 900: '#064e3b', 800: '#065f46', 600: '#059669', 500: '#10b981', 400: '#34d399', 300: '#6ee7b7' },
    'Commissari':         { 950: '#451a03', 900: '#78350f', 800: '#92400e', 600: '#d97706', 500: '#f59e0b', 400: '#fbbf24', 300: '#fcd34d' },
    'Dirigenti':          { 950: '#020617', 900: '#0f172a', 800: '#1e293b', 600: '#475569', 500: '#64748b', 400: '#94a3b8', 300: '#cbd5e1' },
    'Segretari Comunali': { 950: '#042f2e', 900: '#134e4a', 800: '#115e59', 600: '#0d9488', 500: '#14b8a6', 400: '#2dd4bf', 300: '#5eead4' },
    'Diplomatica':        { 950: '#1e1b4b', 900: '#312e81', 800: '#3730a3', 600: '#4f46e5', 500: '#6366f1', 400: '#818cf8', 300: '#a5b4fc' },
};

/**
 * Applica i colori dinamici del concorso al documento.
 * Cambia le variabili CSS --magis-XXX in base al profilo utente.
 */
export function applyThemeColor() {
    const concorso = AppState.userProfile && AppState.userProfile.concorso ? AppState.userProfile.concorso : 'Magistratura';
    const palette = THEME_PALETTES[concorso] || THEME_PALETTES['Magistratura'];

    Object.entries(palette).forEach(([shade, value]) => {
        document.documentElement.style.setProperty(`--magis-${shade}`, value);
    });
}
