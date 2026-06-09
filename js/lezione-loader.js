/* ============================================================
   LEZIONE-LOADER.JS — Lazy loading del LezioneController (~128 kB)
   Caricato on-demand per tenere il controller fuori dal bundle iniziale.
   ============================================================ */

let _lezionePromise = null;

export function loadLezione() {
    if (!_lezionePromise) {
        _lezionePromise = import('./controllers/lezione.js')
            .then(m => {
                window.Lezione = m.LezioneController;
                return m.LezioneController;
            })
            .catch(err => {
                // Permette il retry se il chunk non si carica (rete mobile instabile)
                _lezionePromise = null;
                throw err;
            });
    }
    return _lezionePromise;
}
