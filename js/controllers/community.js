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
    },

    toggleComments: function(postId) {
        var section = document.getElementById('comments-section-' + postId);
        if (!section) return;
        
        if (section.classList.contains('hidden')) {
            section.classList.remove('hidden');
            this.renderCommentsList(postId);
            setTimeout(() => {
                const input = document.getElementById('comment-input-' + postId);
                if (input) input.focus();
            }, 50);
        } else {
            section.classList.add('hidden');
        }
    },

    renderCommentsList: function(postId) {
        var post = DB_COMMUNITY.posts.find(p => p.id === postId);
        var container = document.getElementById('comments-list-' + postId);
        if (!post || !container) return;

        if (!post.comments || post.comments.length === 0) {
            container.innerHTML = '<div class="text-[11px] text-gray-500 text-center italic py-2">Nessuna risposta ancora. Sii il primo!</div>';
            return;
        }

        container.innerHTML = post.comments.map(c => `
            <div class="flex items-start gap-2 group/comment">
                <img src="${c.user_avatar || 'https://i.pravatar.cc/150?u=fallback'}" onerror="this.src='https://i.pravatar.cc/150?u=guest'" class="w-6 h-6 rounded-full object-cover border border-gray-700 shrink-0" />
                <div class="bg-gray-800/60 rounded-xl rounded-tl-sm px-3 py-2 text-sm text-gray-200 w-full relative">
                    <div class="flex items-center justify-between mb-0.5 gap-4">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-[11px] text-gray-300">${c.user_name || 'Concorsista'}</span>
                            <span class="text-[9px] text-gray-500">${c.timestamp || 'Adesso'}</span>
                        </div>
                        ${(window.cloud && cloud.user && c.user_id === cloud.user.id) || (AppState.userProfile?.id === c.user_id) ? `
                        <button onclick="app.deleteComment('${postId}', '${c.id}')" class="text-gray-600 hover:text-red-400 transition opacity-0 group-hover/comment:opacity-100" title="Elimina">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                        ` : ''}
                    </div>
                    <p class="text-xs break-words">${c.content}</p>
                </div>
            </div>
        `).join('');
        if (window.lucide) lucide.createIcons();
    },

    deleteComment: function(postId, commentId) {
        if (!confirm("Sei sicuro di voler eliminare questo commento?")) return;

        var post = DB_COMMUNITY.posts.find(p => p.id === postId);
        if (!post) return;

        post.comments = post.comments.filter(c => c.id !== commentId);
        
        var countSpan = document.getElementById('comments-count-' + postId);
        if (countSpan) countSpan.innerText = post.comments.length;
        
        this.renderCommentsList(postId);

        if (window.cloud && cloud.user) {
            cloud.deleteCommunityComment(commentId);
        }
    },

    submitComment: function(postId) {
        var input = document.getElementById('comment-input-' + postId);
        if (!input || !input.value.trim()) return;

        var post = DB_COMMUNITY.posts.find(p => p.id === postId);
        if (!post) return;

        var text = input.value.trim();
        if (text.length > 500) {
            if (window.showToast) window.showToast("Risposta troppo lunga (max 500 caratteri).", "warning");
            return;
        }

        if (!post.comments) post.comments = [];
        
        var newComment = {
            id: 'c' + Date.now(),
            post_id: postId,
            user_id: AppState.userProfile?.id || (window.cloud && cloud.user ? cloud.user.id : 'u1'),
            user_name: AppState.userProfile?.name || 'Utente',
            user_avatar: AppState.userProfile?.avatar || 'https://i.pravatar.cc/150?u=guest',
            content: text,
            timestamp: 'Adesso'
        };

        post.comments.push(newComment);
        input.value = '';
        
        var countSpan = document.getElementById('comments-count-' + postId);
        if (countSpan) countSpan.innerText = post.comments.length;
        
        this.renderCommentsList(postId);
        
        var container = document.getElementById('comments-list-' + postId);
        if (container) container.scrollTop = container.scrollHeight;

        if (window.cloud && cloud.user) {
            cloud.pushCommunityComment(newComment);
        }
    }
};
