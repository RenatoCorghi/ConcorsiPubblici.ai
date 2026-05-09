/* ============================================================
   API.JS — Barrel file (re-export di tutti i moduli API)
   
   Questo file mantiene la stessa interfaccia pubblica del
   monolite precedente, ma delega a moduli specializzati.
   
   Moduli:
   - api/helpers.js    → Utilities condivise (error handling, JSON, auth)
   - api/prompts.js    → Sistema prompt CiceroAI (GLOBAL_MASTER_PROMPT)
   - api/evaluation.js → Correzione elaborati + Briefing
   - api/orale.js      → Simulazione esame orale
   - api/tutor.js      → Chat Tutor AI + Phantom Tutor
   - api/quiz.js       → Generazione quiz (standard + caso reale)
   - api/traces.js     → Generazione tracce AI personalizzate
   ============================================================ */

// Re-export dei prompt (usati da lezione.js e altri controller)
export { CICERO_EXPERT_SYSTEM } from './api/prompts.js';

// Import dei moduli API
import { evaluationApi } from './api/evaluation.js';
import { oraleApi } from './api/orale.js';
import { tutorApi } from './api/tutor.js';
import { quizApi } from './api/quiz.js';
import { tracesApi } from './api/traces.js';

// Composizione dell'oggetto apiService unificato
// Mantiene la stessa interfaccia pubblica: apiService.evaluateEssay(), etc.
export const apiService = {
    // --- Evaluation ---
    evaluateEssay: evaluationApi.evaluateEssay,
    generateBriefing: evaluationApi.generateBriefing,
    
    // --- Orale ---
    evaluateOrale: oraleApi.evaluateOrale,
    chatOrale: oraleApi.chatOrale,
    
    // --- Tutor ---
    tutorChat: tutorApi.tutorChat,
    checkLiveDraft: tutorApi.checkLiveDraft,
    
    // --- Quiz ---
    generateQuiz: quizApi.generateQuiz,
    generateQuizFromCase: quizApi.generateQuizFromCase,
    
    // --- Traces ---
    generateTrace: tracesApi.generateTrace
};
