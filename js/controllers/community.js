/* ============================================================
   COMMUNITY.JS (Controller) — Azioni forum e messaggi
   ============================================================ */
import { AppState } from '../state.js';
import { cloud } from '../cloud.js';
import { showToast } from '../utils.js';
import { DB_COMMUNITY } from '../../data.js';
import { navigateToRoute, renderView } from '../router.js';
import { toggleUserModal, appendDMMessage } from '../views/community.js';

export const CommunityController = {

    closeUserModal: function () {
        AppState.community.activeUserModal = null;
        toggleUserModal(null);
    },

    openUserModal: function (userId) {
        AppState.community.activeUserModal = userId;
        toggleUserModal(userId);
    },

    setCommunityForumChannel: function (ch) {
        AppState.community.forumFilterChannel = ch;
        renderView();
    },

    setCommunityUsersFilter: function (filter) {
        AppState.community.usersFilter = filter;
        renderView();
    },

    openCommunityChat: function (userId) {
        AppState.community.activeChatUser = userId;
        navigateToRoute('community-dm');
    },

    sendCommunityMessage: function () {
        var input = document.getElementById('chat-input');
        if (!input || !input.value.trim() || !AppState.community.activeChatUser) return;

        var text = input.value.trim();
        if (text.length > 500) {
            showToast("Messaggio troppo lungo (max 500 caratteri).", "warning");
            return;
        }

        var msg = {
            id: 'm' + Date.now(),
            chat_id: AppState.community.activeChatUser,
            text: text,
            me: true,
            time: 'Adesso'
        };
        DB_COMMUNITY.messages.push(msg);
        input.value = '';

        appendDMMessage(msg);
    },

    openNewPostModal: function () {
        AppState.community.isPosting = true;
        renderView();
    },

    closeNewPostModal: function () {
        AppState.community.isPosting = false;
        renderView();
    },

    submitNewPost: function () {
        var input = document.getElementById('new-post-input');
        if (!input || !input.value.trim()) return;

        var text = input.value.trim();
        if (text.length > 2000) {
            showToast("Post troppo lungo (max 2000 caratteri).", "warning");
            return;
        }

        var newPost = {
            id: 'p' + Date.now(),
            channel_id: AppState.community.forumFilterChannel,
            user_id: 'u1',
            content: input.value.trim(),
            likes: 0,
            timestamp: 'Adesso'
        };

        if (AppState.userProfile && AppState.userProfile.id) {
            newPost.user_id = AppState.userProfile.id;
            if (!DB_COMMUNITY.users.find(u => u.id === AppState.userProfile.id)) {
                DB_COMMUNITY.users.push({
                    id: AppState.userProfile.id,
                    name: AppState.userProfile.name,
                    avatar: 'https://i.pravatar.cc/150?u=' + AppState.userProfile.id,
                    tier: AppState.userProfile.tier,
                    concorso: 'Magistratura',
                    online: true,
                    stats: { corretti: AppState.history.length, media: 12, streak: 1 }
                });
            }
        }

        DB_COMMUNITY.posts.unshift(newPost);
        AppState.community.isPosting = false;
        renderView();
        showToast("Post pubblicato con successo!", "success");

        // Cloud sync asincrono se l'utente è loggato
        if (window.cloud && cloud.user) {
            cloud.pushCommunityPost(newPost);
        }
    },

    likePost: function (postId) {
        var post = DB_COMMUNITY.posts.find(p => p.id === postId);
        if (post) {
            post.likes += 1;

            // Aggiorna solo il counter nel DOM per evitare un fastidioso re-render di tutta la vista
            var likeBtn = document.getElementById('like-btn-' + postId);
            if (likeBtn) {
                likeBtn.innerHTML = '<i data-lucide="heart" class="w-4 h-4 fill-current text-red-500"></i> ' + post.likes;
                likeBtn.classList.add('text-red-500');
                likeBtn.classList.remove('text-gray-500');
                if (window.lucide) lucide.createIcons();
            }

            // Cloud sync asincrono
            if (window.cloud && cloud.user) {
                cloud.likeCommunityPost(postId, post.likes);
            }
        }
    }
};
