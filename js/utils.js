/* ============================================================
   UTILS.JS — Funzioni di utilità globali
   ============================================================ */

export function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) {
        console.warn('[Toast] Container non ancora inizializzato. Messaggio:', msg);
        return;
    }
    
    const toast = document.createElement('div');
    const color = type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-yellow-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';
    
    const safeMsg = escapeHtml(msg);
    
    toast.className = `p-4 rounded-lg shadow-xl text-white text-sm font-medium ${color} toast-enter flex items-center gap-2 max-w-sm pointer-events-auto`;
    toast.innerHTML = `
        <i data-lucide="${type === 'error' ? 'alert-octagon' : type === 'warning' ? 'alert-triangle' : type === 'success' ? 'check-circle' : 'info'}" class="w-4 h-4"></i>
        ${safeMsg}
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 400); // Wait for exit animation
    }, 4000);
}

export function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    return [h, m, s].map(v => v < 10 ? "0" + v : v).join(":");
}

// Esponi globalmente per compatibilità con HTML onclick
window.showToast = showToast;
