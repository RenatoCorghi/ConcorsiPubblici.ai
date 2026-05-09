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
        if (password.length < 6) {
            showToast("La password deve avere almeno 6 caratteri.", "error");
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
                // Supabase con email confirmation attiva non crea una sessione subito.
                // Controlliamo se l'utente ha una sessione oppure deve confermare l'email.
                var needsConfirmation = !res.data.session;
                
                if (needsConfirmation) {
                    // Mostra messaggio di conferma email nell'UI del modale
                    var modal = document.getElementById('onboarding-modal');
                    if (modal) {
                        var innerContent = modal.querySelector('.relative.bg-gray-900');
                        if (innerContent) {
                            innerContent.innerHTML = `
                                <div class="text-center p-6">
                                    <div class="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <i data-lucide="mail-check" class="w-8 h-8 text-green-400"></i>
                                    </div>
                                    <h3 class="text-2xl font-display font-bold text-white mb-3">Controlla la tua Email!</h3>
                                    <p class="text-gray-400 text-sm mb-2">Abbiamo inviato un link di conferma a:</p>
                                    <p class="text-magis-400 font-bold mb-6">${email}</p>
                                    <p class="text-gray-500 text-xs mb-8">Clicca il link nell'email per attivare il tuo account. Controlla anche la cartella spam.</p>
                                    <button onclick="document.getElementById('onboarding-modal').classList.add('hidden')" class="w-full py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-bold transition">Ho Capito</button>
                                </div>
                            `;
                            if (window.lucide) lucide.createIcons();
                        }
                    }
                    showToast("Registrazione effettuata! Controlla la tua email per confermare l'account.", "success");
                    return; // Non chiudere il modale, mostra il messaggio
                }

                // Se la sessione è stata creata subito (email confirmation disabilitata)
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
            
            // Nascondi bottone Accedi dalla navbar
            var authBtn = document.getElementById('nav-auth-btn');
            if (authBtn) authBtn.classList.add('hidden');
            
            applyThemeColor();
            setTimeout(renderView, 500);

        } catch (err) {
            console.error("Auth Error", err);
            var msg = err.message || "Errore di autenticazione";
            // Traduci errori comuni di Supabase
            if (msg.includes('already registered')) msg = "Questa email è già registrata. Prova ad accedere.";
            if (msg.includes('Invalid login')) msg = "Email o password non corretti.";
            if (msg.includes('Email not confirmed')) msg = "Devi prima confermare la tua email. Controlla la posta in arrivo.";
            showToast(msg, "error");
        } finally {
            if (btn) { btn.innerText = oldBtnText; btn.disabled = false; }
        }
    },

    loginWithGoogle: async function() {
        try {
            var res = await cloud.signInWithGoogle();
            if (res.error) throw res.error;
            // Supabase OAuth fa redirect, il resto è gestito dall'auth listener in cloud.js
        } catch (err) {
            console.error("Google Auth Error", err);
            showToast(err.message || "Errore login Google", "error");
        }
    },
    
    logout: async function() {
        try {
            if (window.cloud) await cloud.signOut();
            
            // Pulisci il profilo locale ma mantieni altre impostazioni se vuoi
            localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.USER_PROFILE);
            
            var modal = document.getElementById('ai-settings-modal');
            if (modal) modal.classList.add('hidden');
            
            showToast("Disconnessione completata", "success");
            
            // Un breve delay per mostrare il toast, poi ricarica per ripartire puliti come ospite
            setTimeout(function() {
                window.location.reload();
            }, 800);
        } catch (err) {
            console.error("Logout error", err);
            showToast("Errore durante la disconnessione", "error");
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
