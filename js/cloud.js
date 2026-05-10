/* ============================================================
   CLOUD.JS — Connessione a Supabase (Backend/Auth)
   ============================================================ */
import { APP_CONFIG } from './config.js';
import { AppState, saveHistoryState, updateUserProfile } from './state.js';
import { DB_COMMUNITY } from '../data.js';
import { renderView } from './router.js';

// Global instance — credenziali da config.js
window.supabaseClient = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

export const cloud = {
    user: null,

    initAuthListener: function() {
        const handleSession = async (session) => {
            cloud.user = session.user;
            console.log("Utente Autenticato via Supabase:", session.user.email);
            
            // Crea profilo locale se non esiste, o SOVRASCRIVI se era un ospite
            if (!AppState.userProfile || AppState.userProfile.id.startsWith('guest-') || AppState.userProfile.id !== session.user.id) {
                var name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email.split('@')[0];
                var avatarUrl = session.user.user_metadata?.avatar_url || ('https://i.pravatar.cc/150?u=' + session.user.email);
                
                AppState.userProfile = {
                    id: session.user.id,
                    name: name,
                    avatar: avatarUrl,
                    tier: 'Free',
                    concorso: AppState.userProfile?.concorso || 'Magistratura',
                    online: true,
                    stats: AppState.userProfile?.stats || { corretti: 0, media: 0.0, streak: 1 }
                };
                updateUserProfile(AppState.userProfile);
            } else {
                AppState.userProfile.online = true;
                updateUserProfile(AppState.userProfile);
            }
            
            // Sincronizzazione autoritativa del tier dal database (Il Cloud Vince)
            await cloud.syncProfile();
            
            cloud.syncHistory(); // Scarica lo storico al login
            cloud.syncCommunityPosts(); // Scarica la community al login

            // Nascondi il bottone "Accedi" dalla navbar e mostra avatar
            var authBtn = document.getElementById('nav-auth-btn');
            if (authBtn) authBtn.classList.add('hidden');
            var avatarBtn = document.getElementById('nav-avatar-btn');
            if (avatarBtn) {
                avatarBtn.classList.remove('hidden');
                var avatarImg = document.getElementById('nav-avatar-img');
                if (avatarImg && AppState.userProfile?.avatar) {
                    avatarImg.src = AppState.userProfile.avatar;
                }
            }
            
            // Chiudi il modale di accesso se era aperto
            var modal = document.getElementById('onboarding-modal');
            if (modal) modal.classList.add('hidden');
            
            // Pulisci l'hash OAuth dall'URL (Supabase l'ha già processato)
            if (window.location.hash.includes('access_token=')) {
                window.history.replaceState(null, document.title, window.location.pathname);
            }
            
            // Forza l'aggiornamento dell'UI per mostrare il nuovo profilo
            renderView();
        };

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) {
                handleSession(session);
            } else {
                cloud.user = null;
                console.log("Utente Disconnesso");
                // Mostra di nuovo il bottone "Accedi" e nascondi avatar
                var authBtn = document.getElementById('nav-auth-btn');
                if (authBtn) authBtn.classList.remove('hidden');
                var avatarBtn = document.getElementById('nav-avatar-btn');
                if (avatarBtn) avatarBtn.classList.add('hidden');
            }
        });
        
        // Cerca sessione corrente subito all'avvio
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                handleSession(session);
            }
        });
    },

    signUp: async function(email, password, fullName) {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: { data: { full_name: fullName } }
        });
        return { data, error };
    },

    signIn: async function(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        return { data, error };
    },

    signInWithGoogle: async function() {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        return { data, error };
    },

    signOut: async function() {
        const { error } = await supabaseClient.auth.signOut();
        return { error };
    },

    // --- Sincronizzazione Profilo & Abbonamenti ---
    syncProfile: async function() {
        if (!cloud.user) return;
        
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('tier')
                .eq('id', cloud.user.id)
                .single();
                
            if (error) throw error;
            
            // Forza il tier del DB su AppState locale
            if (AppState.userProfile && data) {
                AppState.userProfile.tier = data.tier || 'Free';
                
                // Salva lo stato su localStorage in modo reattivo aggiornato
                updateUserProfile(AppState.userProfile);
                
                // Aggiorna UI se siamo nel pricing o nella home
                if (AppState.currentRoute === 'pricing' || AppState.currentRoute === 'home') {
                    renderView();
                }
            }
        } catch (error) {
            console.error("Errore fetch profilo autoritativo:", error);
        }
    },

    // --- Sincronizzazione Storico Prove ---
    // Pusha una singola prova nel DB, se l'utente è loggato.
    pushResult: async function(resultObj) {
        if (!cloud.user) return false;
        
        // Rimuoviamo fields finti e formattiamo per la tabella Supabase
        const dbPayload = {
            user_id: cloud.user.id,
            client_id: resultObj.id,
            materia: resultObj.materia,
            voto: resultObj.voto,
            text_content: resultObj.text,
            feedback: resultObj.feedback,
            keywords: resultObj.keywords,
            created_at: resultObj.date
        };

        const { error } = await supabaseClient
            .from('history')
            .upsert(dbPayload, { onConflict: 'client_id' });
            
        if (error) console.error("Errore Push Supabase:", error);
        return !error;
    },

    // Scarica lo storico e lo fonde con AppState.history locale
    syncHistory: async function() {
        if (!cloud.user) return;
        
        const { data, error } = await supabaseClient
            .from('history')
            .select('*')
            .eq('user_id', cloud.user.id)
            .order('created_at', { ascending: true });
            
        if (error) {
            console.warn("Spazio History non ancora creato su Supabase o disattivo?", error);
            return;
        }
        
        if (data && data.length > 0) {
            // Uniamo garantendo univocità (predominano i dati cloud)
            var cloudMap = {};
            data.forEach(row => {
                cloudMap[row.client_id] = {
                    id: row.client_id,
                    materia: row.materia,
                    voto: row.voto,
                    text: row.text_content,
                    feedback: row.feedback,
                    keywords: row.keywords,
                    date: row.created_at
                };
            });
            
            // Fonde locale con cloud e aggiorna AppState
            var merged = AppState.history.slice();
            for (const key in cloudMap) {
                var exists = false;
                for (var i = 0; i < merged.length; i++) {
                    if (merged[i].id === key) {
                        merged[i] = cloudMap[key];
                        exists = true;
                        break;
                    }
                }
                if (!exists) merged.push(cloudMap[key]);
            }
            AppState.history = merged;
            saveHistoryState();
            
            // Re-renderizza se siam nella dashboard o storico per aggiornare UI
            if (AppState.currentRoute === 'home' || AppState.currentRoute === 'history') {
                renderView();
            }
        }
    },

    // --- Sincronizzazione Community ---
    // Pusha un post della community sul DB
    pushCommunityPost: async function(postObj) {
        if (!cloud.user) return false;
        
        const dbPayload = {
            id: postObj.id,
            user_id: cloud.user.id,
            channel_id: postObj.channel_id,
            content: postObj.content,
            likes: postObj.likes,
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient
            .from('community_posts')
            .upsert(dbPayload, { onConflict: 'id' });
            
        if (error) console.error("Errore Push Post Supabase:", error);
        return !error;
    },

    // Aggiungi un like su Supabase (rpc call o update)
    likeCommunityPost: async function(postId, newLikes) {
        if (!cloud.user) return false;
        const { error } = await supabaseClient
            .from('community_posts')
            .update({ likes: newLikes })
            .eq('id', postId);
        return !error;
    },

    // Scarica i post della community e li fonde con DB_COMMUNITY.posts
    syncCommunityPosts: async function() {
        const { data, error } = await supabaseClient
            .from('community_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
            
        if (error) {
            console.warn("Spazio community_posts non ancora creato su Supabase?", error);
            return;
        }
        
        if (data && data.length > 0) {
            var cloudMap = {};
            data.forEach(row => {
                cloudMap[row.id] = {
                    id: row.id,
                    channel_id: row.channel_id,
                    user_id: row.user_id,
                    content: row.content,
                    likes: row.likes || 0,
                    timestamp: new Date(row.created_at).toLocaleDateString('it-IT')
                };
            });
            
            // Fonde i post tenendo priorità DB
            var merged = DB_COMMUNITY.posts.slice();
            for (const key in cloudMap) {
                var exists = false;
                for (var i = 0; i < merged.length; i++) {
                    if (merged[i].id === key) {
                        merged[i] = cloudMap[key];
                        exists = true;
                        break;
                    }
                }
                if (!exists) merged.push(cloudMap[key]);
            }
            
            // Ordina decrescente
            merged.sort((a,b) => {
                return (a.id > b.id) ? -1 : 1; // Usando l'id come sort temporale 'p17...'
            });
            
            DB_COMMUNITY.posts = merged;
            
            if (AppState.currentRoute === 'community-forum') {
                renderView();
            }
        }
    }
};
