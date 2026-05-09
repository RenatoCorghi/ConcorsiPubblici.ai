/* ============================================================
   AUTH.JS (Controller) — Logiche Autenticazione e Settings
   ============================================================ */
import { AppState, updateUserProfile } from '../state.js';
import { cloud } from '../cloud.js';
import { APP_CONFIG } from '../config.js';
import { showToast } from '../utils.js';
import { navigateToRoute, renderView } from '../router.js';
import { applyThemeColor } from '../theme.js';


export var AuthController = {

    authMode: 'signin', // 'signin' or 'signup'

    toggleAuthMode: function() {
        AuthController.authMode = AuthController.authMode === 'signin' ? 'signup' : 'signin';
        var isSignUp = AuthController.authMode === 'signup';
        
        var nameGroup = document.getElementById('auth-name-group');
        var subtitle = document.getElementById('auth-subtitle');
        var submitBtn = document.getElementById('auth-submit-btn');
        var toggleBtn = document.getElementById('auth-toggle-btn');

        if (nameGroup) nameGroup.classList.toggle('hidden', !isSignUp);
        if (subtitle) subtitle.innerText = isSignUp ? "Crea un nuovo account per accedere alla PWA." : "Accedi per salvare le tue simulazioni in Cloud su tutti i tuoi dispositivi.";
        if (submitBtn) submitBtn.innerText = isSignUp ? "Registrati al Cloud" : "Accedi al Cloud";
        if (toggleBtn) toggleBtn.innerText = isSignUp ? "Hai già un account? Accedi" : "Non hai un account? Registrati";
    },

    submitAuth: async function() {
        var isSignUp = AuthController.authMode === 'signup';
        var email = document.getElementById('auth-email').value.trim();
        var password = document.getElementById('auth-password').value;
        var name = isSignUp ? document.getElementById('auth-name').value.trim() : '';
        var concorsoSel = isSignUp && document.getElementById('auth-concorso') ? document.getElementById('auth-concorso').value : 'Magistratura';
        
        if (!email || !password || (isSignUp && !name)) {
            showToast("Compila tutti i campi richiesti.", "error");
            return;
        }

        var btn = document.getElementById('auth-submit-btn');
        var oldBtnText = btn ? btn.innerText : '';
        if (btn) { btn.innerText = "Attendere..."; btn.disabled = true; }

        try {
            var res;
            if (isSignUp) {
                res = await cloud.signUp(email, password, name);
            } else {
                res = await cloud.signIn(email, password);
            }

            if (res.error) throw res.error;

            if (isSignUp) {
                // Durante il signup, crea un placeholder che verrà sovrascritto
                // dai DB reali appena syncProfile() completa al variare dell'Auth state listener
                AppState.userProfile = {
                    id: res.data.user.id,
                    name: name,
                    avatar: 'https://i.pravatar.cc/150?u=' + email,
                    tier: 'Free',
                    concorso: concorsoSel,
                    online: true,
                    stats: { corretti: 0, media: 0.0, streak: 1 }
                };
            }
            
            // Forza una pull autoritativa del tier dal database subito
            await cloud.syncProfile();
            
            var modal = document.getElementById('onboarding-modal');
            if (modal) modal.classList.add('hidden');
            showToast("Autenticazione Cloud riuscita!", "success");
            
            applyThemeColor();
            setTimeout(renderView, 500);

        } catch (err) {
            console.error("Auth Error", err);
            showToast(err.message || "Errore di autenticazione", "error");
        } finally {
            if (btn) { btn.innerText = oldBtnText; btn.disabled = false; }
        }
    },

    openAuthModal: function() {
        var modal = document.getElementById('onboarding-modal');
        if (modal) modal.classList.remove('hidden');
    },

    saveUserProfile: function() {
        AuthController.openAuthModal();
    },

    upgradeTier: function() {
        if(!cloud.user) {
            showToast("Devi accedere o farti un account gratuito prima di passare al piano Pro.", "warning");
            return AuthController.openAuthModal();
        }
        
        showToast("Reindirizzamento al portale sicuro di pagamento...", "info");
        
        // Costruzione dinamica del Payment Link Stripe
        const checkoutUrl = `${APP_CONFIG.STRIPE_PAYMENT_LINK}?client_reference_id=${cloud.user.id}&prefilled_email=${encodeURIComponent(cloud.user.email)}`;
        
        window.location.href = checkoutUrl;
    },

    requestPushPermissions: function() {
        if (!("Notification" in window)) {
            showToast("Il browser non supporta le notifiche push.", "error");
            return;
        }
        
        Notification.requestPermission().then(function(permission) {
            if (permission === "granted") {
                new Notification("ConcorsiPubblici.ai", {
                    body: "Notifiche attivate! Riceverai avvisi dalla Community.",
                    icon: "./icon-192.png"
                });
                showToast("Notifiche abilitate con successo.", "success");
            } else {
                showToast("Permesso negato per le notifiche.", "warning");
            }
        });
    },

    // --- Platform Settings ---
    openAiModal: function() {
        // L'API Key è ora gestita automaticamente via Proxy Serverless
        var concorsoSelect = document.getElementById('settings-concorso');
        if (concorsoSelect && AppState.userProfile) {
            concorsoSelect.value = AppState.userProfile.concorso || 'Magistratura';
        }

        var modal = document.getElementById('ai-settings-modal');
        if (modal) modal.classList.remove('hidden');
    },

    closeAiModal: function() {
        var modal = document.getElementById('ai-settings-modal');
        if (modal) modal.classList.add('hidden');
    },

    saveSettings: function() {
        // L'API Key ora è gestita lato backend (Proxy)
        // Rimosso salvataggio locale per sicurezza e semplicità

        // Save Concorso Path
        var concorsoSelect = document.getElementById('settings-concorso');
        if (concorsoSelect && AppState.userProfile) {
            AppState.userProfile.concorso = concorsoSelect.value;
            localStorage.setItem(APP_CONFIG.STORAGE_KEYS.USER_PROFILE, JSON.stringify(AppState.userProfile));
            applyThemeColor();
        }

        AuthController.closeAiModal();
        showToast("Impostazioni salvate con successo!", "success");
    },

    loginAsGuest: function() {
        var concorsoSel = document.getElementById('auth-concorso') ? document.getElementById('auth-concorso').value : 'Magistratura';        
        AppState.userProfile = {
            id: 'guest-' + Date.now(),
            name: 'Ospite Aspirante',
            avatar: 'https://i.pravatar.cc/150?u=guest',
            tier: 'Free',
            concorso: concorsoSel,
            online: true,
            stats: { corretti: 0, media: 0, streak: 0 }
        };
        localStorage.setItem(APP_CONFIG.STORAGE_KEYS.USER_PROFILE, JSON.stringify(AppState.userProfile));
        
        var modal = document.getElementById('onboarding-modal');
        if (modal) modal.classList.add('hidden');
        
        showToast("Accesso come Ospite eseguito!", "success");
        applyThemeColor();
        setTimeout(renderView, 300);
    }
};
