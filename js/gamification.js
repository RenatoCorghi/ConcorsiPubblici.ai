import { AppState, saveStatsState } from './state.js';
import { showToast } from './utils.js';

/**
 * GAMIFICATION.JS — Logica progessione XP, Livelli e Medaglie
 */

export const Gamification = {
    // XP necessari per ogni livello (lineare per semplicità: 1000 XP)
    XP_PER_LEVEL: 1000,

    // Catalogo completo degli obiettivi
    BADGE_CATALOG: {
        'pioniere': { name: "Pioniere", desc: "La prima volta non si scorda mai. Completa una simulazione scritta.", icon: "flag" },
        'parlatore': { name: "Oratore", desc: "Supera la tua prima simulazione orale (Idoneo).", icon: "mic" },
        'secchione': { name: "Eccellenza", desc: "Ottieni un voto pari o superiore a 16/20.", icon: "graduation-cap" },
        'stakanovista': { name: "Stakanovista", desc: "Dimostra costanza: raggiungi 7 giorni di streak.", icon: "flame" },
        'veterano': { name: "Veterano", desc: "Raggiungi il Livello 5.", icon: "award" },
        'enciclopedico': { name: "Enciclopedico", desc: "Ripassa almeno 10 istituti nel glossario.", icon: "book-open" }
    },

    /** Aggiunge XP e gestisce il level up */
    addXP(amount, reason = "") {
        if (!AppState.stats) return;
        
        const oldLevel = AppState.stats.level;
        AppState.stats.xp += amount;
        
        // Calcola nuovo livello
        AppState.stats.level = Math.floor(AppState.stats.xp / this.XP_PER_LEVEL) + 1;
        
        saveStatsState();
        
        // Notifica
        showToast(`+${amount} XP ${reason ? '(' + reason + ')' : ''}`, 'success');
        
        // Level Up Celebration
        if (AppState.stats.level > oldLevel) {
            this._celebrateLevelUp();
            // Controllo traguardo Livello 5
            if (AppState.stats.level >= 5) {
                this.checkBadge('veterano');
            }
        }
    },

    /** Gestisce la streak giornaliera */
    updateStreak() {
        const today = new Date().toISOString().split('T')[0];
        const last = AppState.stats.lastActivityDate;
        
        if (last === today) return; // Già aggiornato oggi
        
        if (!last) {
            AppState.stats.streak = 1;
        } else {
            const lastDate = new Date(last);
            const todayDate = new Date(today);
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                AppState.stats.streak += 1;
                // Bonus streak
                if (AppState.stats.streak % 3 === 0) {
                    this.addXP(100, "Bonus Streak 🔥");
                }
                if (AppState.stats.streak >= 7) {
                    this.checkBadge('stakanovista');
                }
            } else if (diffDays > 1) {
                AppState.stats.streak = 1;
            }
        }
        
        AppState.stats.lastActivityDate = today;
        saveStatsState();
    },

    /** Controlla e sblocca medaglie */
    checkBadge(badgeId) {
        if (AppState.stats.badges.find(b => b.id === badgeId)) return;
        
        const catalogInfo = this.BADGE_CATALOG[badgeId];
        if (!catalogInfo) return;

        const newBadge = {
            id: badgeId,
            name: catalogInfo.name,
            icon: catalogInfo.icon,
            date: new Date().toISOString()
        };
        
        AppState.stats.badges.push(newBadge);
        saveStatsState();
        
        // Celebrazione Achievement
        showToast(`🏆 Traguardo Sbloccato: ${catalogInfo.name}!`, 'success');
        this._celebrateAchievement();
    },

    /** Calcola la percentuale di avanzamento al prossimo livello */
    getLevelProgress() {
        const currentXPInLevel = AppState.stats.xp % this.XP_PER_LEVEL;
        return Math.floor((currentXPInLevel / this.XP_PER_LEVEL) * 100);
    },

    _celebrateLevelUp() {
        showToast(`🎉 LIVELLO SUPERATO! Ora sei Livello ${AppState.stats.level}`, 'success');
        if (window.confetti) {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#a78bfa', '#8b5cf6', '#ffffff']
            });
        }
    },

    _celebrateAchievement() {
        if (window.confetti) {
            confetti({
                particleCount: 80,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#3b82f6', '#ffffff']
            });
            confetti({
                particleCount: 80,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#3b82f6', '#ffffff']
            });
        }
    }
};
