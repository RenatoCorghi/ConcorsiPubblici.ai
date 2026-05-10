/* ============================================================
   COMMUNITY.JS — Viste Community (Forum, Utenti, DM, Modale Utente)
   ============================================================ */
import { AppState } from '../state.js';
import { cloud } from '../cloud.js';
import { DB_COMMUNITY } from '../../data.js';
import { CommunityController } from '../controllers/community.js';
import { escapeHtml } from '../utils.js';

// --- Utility: Badge tier (centralizzata, evita duplicazione) ---
function renderTierBadge(tier, extraClasses) {
    if (tier === 'Plus') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-yellow-600 to-yellow-400 text-yellow-950 shadow-sm shadow-yellow-500/20 ' + (extraClasses || '') + '">Plus</span>';
    if (tier === 'Admin') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-600 text-white ' + (extraClasses || '') + '">Admin</span>';
    if (tier === 'Free') return '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gray-700 text-gray-300 ' + (extraClasses || '') + '">Free</span>';
    return '';
}

export function renderCommunityLayout(tab) {
    var tabsHtml = `
        <div class="flex gap-2 sm:gap-4 mb-6 border-b border-gray-800 pb-2 shrink-0 overflow-x-auto">
            <button onclick="app.navigate('community-forum')" class="pb-2 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${tab === 'forum' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}"><i data-lucide="message-square" class="w-4 h-4"></i> Forum</button>
            <button onclick="app.navigate('community-users')" class="pb-2 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${tab === 'users' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}"><i data-lucide="users" class="w-4 h-4"></i> Concorsisti</button>
            <button onclick="app.navigate('community-dm')" class="pb-2 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${tab === 'dm' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}"><i data-lucide="mail" class="w-4 h-4"></i> DM Privati</button>
            <button onclick="app.navigate('community-leaderboard')" class="pb-2 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${tab === 'leaderboard' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}"><i data-lucide="trophy" class="w-4 h-4"></i> Classifica</button>
        </div>
    `;

    var content = '';
    if (tab === 'forum') content = renderCommunityForum();
    if (tab === 'users') content = renderCommunityUsers();
    if (tab === 'dm') content = renderCommunityDM();
    if (tab === 'leaderboard') content = renderCommunityLeaderboard();

    return `
        <div class="fade-in max-w-7xl mx-auto flex flex-col h-[calc(100vh-100px)]">
            <div class="mb-4 shrink-0">
                <h1 class="text-3xl lg:text-4xl font-display font-bold text-white mb-2">Community</h1>
                <p class="text-gray-400 text-sm">Discuti casi pratici, invia messaggi privati o cerca alleati di studio.</p>
            </div>
            ${tabsHtml}
            <div class="flex-grow overflow-hidden relative">
                ${content}
            </div>
            
            <!-- Modale Utente -->
            <div id="user-modal" class="${AppState.community.activeUserModal ? 'flex' : 'hidden'} fixed inset-0 z-[150] items-center justify-center fade-in">
                <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="app.closeUserModal()"></div>
                ${AppState.community.activeUserModal ? renderUserModal(AppState.community.activeUserModal) : ''}
            </div>

            <!-- Modale Nuovo Post -->
            <div id="post-modal" class="${AppState.community.isPosting ? 'flex' : 'hidden'} fixed inset-0 z-[150] items-center justify-center fade-in px-4">
                <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="app.closeNewPostModal()"></div>
                <div class="relative bg-gray-900 border border-gray-800 w-full max-w-xl rounded-2xl shadow-2xl p-6 z-10 flex flex-col">
                    <button onclick="app.closeNewPostModal()" class="absolute top-4 right-4 text-gray-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                    <h2 class="text-xl font-bold text-white mb-4">Crea un nuovo post</h2>
                    <textarea id="new-post-input" rows="4" class="w-full bg-gray-950 border border-gray-800 text-white p-3 rounded-xl focus:border-blue-500 outline-none resize-none mb-4" placeholder="Cosa bolle in pentola? Scrivi qui la tua domanda o il tuo dubbio..."></textarea>
                    <div class="flex justify-end gap-3">
                        <button onclick="app.closeNewPostModal()" class="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg font-bold hover:bg-gray-700">Annulla</button>
                        <button onclick="app.submitNewPost()" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 flex items-center gap-2"><i data-lucide="send" class="w-4 h-4"></i> Pubblica</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function renderCommunityForum() {
    // Mobile: canali come pill orizzontali scrollabili; Desktop: sidebar verticale
    var chPills = DB_COMMUNITY.channels.map(c => `
        <button onclick="app.setCommunityForumChannel('${c.id}')" class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${AppState.community.forumFilterChannel === c.id ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-transparent border-transparent text-gray-400 hover:bg-gray-800'} border">
            <i data-lucide="${c.icon}" class="w-3 h-3 shrink-0 ${AppState.community.forumFilterChannel === c.id ? 'text-blue-400' : ''}"></i> ${c.name}
        </button>
    `).join('');

    var chSidebar = DB_COMMUNITY.channels.map(c => `
        <button onclick="app.setCommunityForumChannel('${c.id}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${AppState.community.forumFilterChannel === c.id ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-transparent border-transparent text-gray-400 hover:bg-gray-800'} border">
            <i data-lucide="${c.icon}" class="w-4 h-4 shrink-0 ${AppState.community.forumFilterChannel === c.id ? 'text-blue-400' : ''}"></i> ${c.name}
        </button>
    `).join('');

    var posts = DB_COMMUNITY.posts.filter(p => p.channel_id === AppState.community.forumFilterChannel).map(p => {
        var user = DB_COMMUNITY.users.find(u => u.id === p.user_id);
        
        // Fallback: se l'utente non è nei mock, potrebbe essere un utente reale
        if (!user) {
            // Se è il nostro post, usa il nostro profilo
            if (AppState.userProfile && p.user_id === AppState.userProfile.id) {
                user = {
                    id: AppState.userProfile.id,
                    name: AppState.userProfile.name || 'Utente',
                    avatar: AppState.userProfile.avatar || 'https://i.pravatar.cc/150?u=' + p.user_id,
                    tier: AppState.userProfile.tier || 'Free',
                    concorso: AppState.userProfile.concorso || 'Magistratura',
                    online: true,
                    stats: { corretti: 0, media: 0, streak: 0 }
                };
            } else {
                // Utente sconosciuto dal cloud
                user = {
                    id: p.user_id,
                    name: p.user_name || 'Concorsista',
                    avatar: p.user_avatar || 'https://i.pravatar.cc/150?u=' + p.user_id,
                    tier: 'Free',
                    concorso: '',
                    online: false,
                    stats: { corretti: 0, media: 0, streak: 0 }
                };
            }
        }
        
        return `
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:p-5 mb-4 shadow-sm fade-in hover:border-gray-700 transition">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3 cursor-pointer" onclick="app.openUserModal('${user.id}')">
                        <img src="${user.avatar}" class="w-9 h-9 lg:w-10 lg:h-10 rounded-full object-cover border-2 border-gray-800" onerror="this.src='https://i.pravatar.cc/150?u=fallback'" />
                        <div>
                            <div class="flex items-center gap-1.5">
                                <h4 class="font-bold text-white text-sm hover:underline">${escapeHtml(user.name)}</h4>
                                ${renderTierBadge(user.tier, 'ml-1')}
                            </div>
                            <div class="text-[10px] text-gray-500">${p.timestamp}</div>
                        </div>
                    </div>
                    <button class="text-gray-600 hover:text-white"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>
                </div>
                <p class="text-gray-300 text-sm leading-relaxed mb-4 whitespace-pre-wrap">${escapeHtml(p.content)}</p>
                <div class="flex items-center gap-4 border-t border-gray-800 pt-3">
                    <button id="like-btn-${p.id}" onclick="app.likePost('${p.id}')" class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition group"><i data-lucide="heart" class="w-4 h-4 group-hover:fill-current"></i> ${p.likes}</button>
                    <button onclick="window.showToast('La funzione Rispondi sarà attiva a breve!', 'info')" class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 transition"><i data-lucide="message-circle" class="w-4 h-4"></i> Rispondi</button>
                    <button class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition ml-auto hidden sm:flex"><i data-lucide="share-2" class="w-4 h-4"></i> Condividi</button>
                </div>
            </div>
        `;
    }).join('') || `<div class="p-8 text-center text-gray-500 text-sm">Nessun post in questo canale.</div>`;

    var activeChannel = DB_COMMUNITY.channels.find(c => c.id === AppState.community.forumFilterChannel);

    return `
        <div class="flex flex-col lg:flex-row h-full gap-4 lg:gap-6 fade-in">
            <!-- Mobile: canali orizzontali -->
            <div class="lg:hidden flex gap-2 overflow-x-auto pb-2 shrink-0 -mx-1 px-1">
                ${chPills}
            </div>
            <!-- Desktop: sidebar verticale -->
            <div class="hidden lg:flex w-1/4 flex-col gap-2 overflow-y-auto pr-2 pb-4">
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest pl-4 mb-2">Canali</div>
                ${chSidebar}
            </div>
            <div class="flex-grow flex flex-col h-full bg-gray-950/50 rounded-2xl border border-gray-800 overflow-hidden">
                <div class="flex justify-between items-center bg-gray-900 border-b border-gray-800 p-3 lg:p-4 shrink-0">
                    <h2 class="font-bold text-white text-sm lg:text-base flex items-center gap-2"><i data-lucide="hash" class="w-4 h-4 lg:w-5 lg:h-5 text-gray-400"></i> ${activeChannel.name}</h2>
                    <button onclick="app.openNewPostModal()" class="px-3 lg:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs lg:text-sm font-bold rounded-lg shadow-lg flex items-center gap-2 transition"><i data-lucide="plus" class="w-4 h-4"></i> <span class="hidden sm:inline">Nuovo Post</span></button>
                </div>
                <div class="flex-grow overflow-y-auto p-3 lg:p-4 custom-scrollbar">
                    ${posts}
                </div>
            </div>
        </div>
    `;
}

export function renderCommunityUsers() {
    var filters = ['Tutti', 'Online', 'Magistratura', 'Avvocatura', 'Notariato', 'Commissari', 'Dirigenti', 'Segretari Comunali', 'Carriera Diplomatica'];
    var filterHtml = filters.map(f => `
        <button onclick="app.setCommunityUsersFilter('${f}')" class="px-3 lg:px-4 py-1.5 rounded-full text-xs font-bold border transition whitespace-nowrap ${AppState.community.usersFilter === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'}">${f}</button>
    `).join('');

    var users = DB_COMMUNITY.users;
    if (AppState.community.usersFilter === 'Online') users = users.filter(u => u.online);
    else if (AppState.community.usersFilter !== 'Tutti') users = users.filter(u => u.concorso === AppState.community.usersFilter);

    var usersHtml = users.map(u => {
        var badge = (u.tier === 'Plus' || u.tier === 'Admin') ? renderTierBadge(u.tier, 'absolute top-3 right-3') : '';
        return `
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 lg:p-6 text-center card-hover cursor-pointer relative" onclick="app.openUserModal('${u.id}')">
            ${badge}
            <div class="relative w-14 h-14 lg:w-16 lg:h-16 mx-auto mb-3">
                <img src="${u.avatar}" class="w-14 h-14 lg:w-16 lg:h-16 rounded-full object-cover border-2 border-gray-700" />
                ${u.online ? '<div class="absolute bottom-0 right-0 w-3.5 h-3.5 lg:w-4 lg:h-4 bg-green-500 border-2 border-gray-900 rounded-full"></div>' : ''}
            </div>
            <h3 class="text-white font-bold mb-1 text-sm lg:text-base">${escapeHtml(u.name)}</h3>
            <div class="text-xs text-gray-400 mb-3">${u.concorso}</div>
            <div class="flex justify-center gap-2 lg:gap-3 text-xs">
                <div class="bg-gray-950 px-2 py-1 rounded text-gray-300 border border-gray-800" title="Giorni di fila"><i data-lucide="flame" class="w-3 h-3 text-orange-500 inline"></i> ${u.stats.streak}</div>
                <div class="bg-gray-950 px-2 py-1 rounded text-gray-300 border border-gray-800" title="Voto Medio"><i data-lucide="star" class="w-3 h-3 text-yellow-500 inline"></i> ${u.stats.media}</div>
            </div>
        </div>
        `;
    }).join('');

    return `
        <div class="flex flex-col h-full fade-in">
            <div class="flex gap-2 mb-6 shrink-0 overflow-x-auto pb-1">
                ${filterHtml}
            </div>
            <div class="flex-grow overflow-y-auto pb-8 custom-scrollbar">
                <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
                    ${usersHtml}
                </div>
            </div>
        </div>
    `;
}

export function renderCommunityDM() {
    // Unique chats from messages
    var chatUsersIds = [...new Set(DB_COMMUNITY.messages.map(m => m.chat_id))];
    if (AppState.community.activeChatUser && !chatUsersIds.includes(AppState.community.activeChatUser)) {
        chatUsersIds.unshift(AppState.community.activeChatUser);
    }

    var chatsList = chatUsersIds.map(uid => {
        var u = DB_COMMUNITY.users.find(x => x.id === uid) || { name: 'Utente Sconosciuto', avatar: '', online: false };
        var lastMsg = DB_COMMUNITY.messages.slice().reverse().find(m => m.chat_id === uid);
        var unreadCount = DB_COMMUNITY.messages.filter(m => m.chat_id === uid && m.unread).length;
        
        return `
            <div onclick="app.openCommunityChat('${uid}')" class="p-3 rounded-lg cursor-pointer transition flex items-center gap-3 ${AppState.community.activeChatUser === uid ? 'bg-gray-800' : 'hover:bg-gray-900'}">
                <div class="relative shrink-0">
                    <img src="${u.avatar}" class="w-10 h-10 rounded-full object-cover border border-gray-700" />
                    ${u.online ? '<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full"></div>' : ''}
                </div>
                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-baseline mb-1">
                        <span class="font-bold text-sm text-white truncate">${escapeHtml(u.name)}</span>
                        <span class="text-[10px] text-gray-500 shrink-0 ml-2">${lastMsg ? lastMsg.time : ''}</span>
                    </div>
                    <div class="text-xs text-gray-400 truncate ${unreadCount > 0 ? 'font-bold text-gray-200' : ''}">${lastMsg ? (lastMsg.me ? 'Tu: ' : '') + escapeHtml(lastMsg.text) : 'Nessun messaggio'}</div>
                </div>
                ${unreadCount > 0 ? '<div class="shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white">' + unreadCount + '</div>' : ''}
            </div>
        `;
    }).join('') || '<div class="text-sm text-gray-500 p-4">Nessuna conversazione attiva.</div>';

    // Mobile: se c'è una chat attiva mostriamo solo la chat, altrimenti la lista
    var hasActiveChat = AppState.community.activeChatUser;

    var activeChatHtml = '';
    if (hasActiveChat) {
        var u = DB_COMMUNITY.users.find(x => x.id === AppState.community.activeChatUser);
        var msgs = DB_COMMUNITY.messages.filter(m => m.chat_id === AppState.community.activeChatUser);
        
        var msgsRender = msgs.map(m => `
            <div class="flex ${m.me ? 'justify-end' : ''} mb-4">
                <div class="max-w-[80%] lg:max-w-[70%]">
                    <div class="p-3 rounded-2xl ${m.me ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-200 rounded-tl-sm'} shadow-sm text-sm">
                        ${escapeHtml(m.text)}
                    </div>
                    <div class="text-[9px] text-gray-500 mt-1 ${m.me ? 'text-right' : ''}">${m.time}</div>
                </div>
            </div>
        `).join('');

        activeChatHtml = `
            <div class="flex flex-col h-full bg-gray-950/50 lg:rounded-r-2xl">
                <!-- Chat Header -->
                <div class="px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/50">
                    <div class="flex items-center gap-3">
                        <!-- Bottone back solo mobile -->
                        <button onclick="AppState.community.activeChatUser = null; renderView();" class="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 text-gray-400 hover:text-white transition">
                            <i data-lucide="arrow-left" class="w-4 h-4"></i>
                        </button>
                        <div class="cursor-pointer flex items-center gap-3" onclick="app.openUserModal('${u.id}')">
                            <div class="relative">
                                <img src="${u.avatar}" class="w-9 h-9 lg:w-10 lg:h-10 rounded-full border border-gray-700" />
                                ${u.online ? '<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full"></div>' : ''}
                            </div>
                            <div>
                                <h3 class="font-bold text-white text-sm leading-tight">${escapeHtml(u.name)}</h3>
                                <div class="text-xs ${u.online ? 'text-green-400' : 'text-gray-500'}">${u.online ? 'Online' : 'Offline'}</div>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button class="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 hidden sm:block"><i data-lucide="phone" class="w-4 h-4"></i></button>
                        <button class="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"><i data-lucide="more-vertical" class="w-4 h-4"></i></button>
                    </div>
                </div>
                
                <!-- Messages -->
                <div id="dm-chat-container" class="flex-grow overflow-y-auto p-4 lg:p-6 scroll-smooth custom-scrollbar">
                    ${msgsRender || '<div class="text-center text-sm text-gray-500 mt-10">Inizia la conversazione con ' + escapeHtml(u.name) + '</div>'}
                </div>
                
                <!-- Input -->
                <div class="p-3 lg:p-4 border-t border-gray-800 shrink-0 bg-gray-900/50">
                    <div class="flex gap-2 bg-gray-950 border border-gray-800 p-2 rounded-xl focus-within:border-gray-600 transition items-end">
                        <button class="p-2 text-gray-400 hover:text-white shrink-0 hidden sm:block"><i data-lucide="paperclip" class="w-5 h-5"></i></button>
                        <textarea id="chat-input" rows="1" class="flex-grow bg-transparent text-white text-sm outline-none resize-none py-2 placeholder-gray-500" placeholder="Scrivi a ${escapeHtml(u.name)}..." onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); app.sendCommunityMessage();}"></textarea>
                        <button onclick="app.sendCommunityMessage()" class="w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition shrink-0"><i data-lucide="send" class="w-4 h-4 ml-0.5"></i></button>
                    </div>
                </div>
            </div>
        `;
    } else {
        activeChatHtml = `
            <div class="hidden lg:flex flex-col h-full bg-gray-950/50 rounded-r-2xl items-center justify-center text-gray-500">
                <div class="w-16 h-16 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
                    <i data-lucide="message-square" class="w-8 h-8 text-gray-600"></i>
                </div>
                <p>Seleziona una chat per inviare messaggi</p>
            </div>
        `;
    }

    return `
        <div class="flex h-full border border-gray-800 rounded-2xl overflow-hidden fade-in shadow-xl">
            <!-- Sidebar — nascosta su mobile quando c'è una chat attiva -->
            <div class="${hasActiveChat ? 'hidden lg:flex' : 'flex'} w-full lg:w-1/3 lg:min-w-[250px] border-r border-gray-800 bg-gray-900 flex-col">
                <div class="p-3 lg:p-4 border-b border-gray-800 shrink-0">
                    <div class="relative">
                        <i data-lucide="search" class="w-4 h-4 text-gray-500 absolute left-3 top-2.5"></i>
                        <input type="text" placeholder="Cerca..." class="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg pl-9 pr-3 py-2 outline-none focus:border-gray-600 transition" />
                    </div>
                </div>
                <div class="flex-grow overflow-y-auto p-2 custom-scrollbar">
                    ${chatsList}
                </div>
            </div>
            <!-- Main Chat — occupa tutto su mobile -->
            <div class="${hasActiveChat ? 'flex' : 'hidden lg:flex'} flex-grow flex-col lg:w-2/3">
                ${activeChatHtml}
            </div>
        </div>
    `;
}

export function renderUserModal(userId) {
    var u = DB_COMMUNITY.users.find(x => x.id === userId);
    if (!u) return '';

    var badge = renderTierBadge(u.tier === 'Plus' ? 'Plus' : u.tier === 'Admin' ? 'Admin' : '', '');

    return `
        <div class="relative bg-gray-900 border border-gray-800 p-6 lg:p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 modal-entry">
            <button onclick="app.closeUserModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
            <div class="text-center mb-6">
                <div class="relative w-20 h-20 lg:w-24 lg:h-24 mx-auto mb-4">
                    <img src="${u.avatar}" class="w-20 h-20 lg:w-24 lg:h-24 rounded-full object-cover border-4 border-gray-800 shadow-xl" />
                    ${u.online ? '<div class="absolute bottom-1 right-1 w-4 h-4 lg:w-5 lg:h-5 bg-green-500 border-4 border-gray-900 rounded-full"></div>' : ''}
                </div>
                <div class="flex items-center justify-center gap-2 mb-1">
                    <h2 class="text-xl lg:text-2xl font-display font-bold text-white">${escapeHtml(u.name)}</h2>
                </div>
                <div class="text-sm text-gray-400 mb-3">${u.concorso}</div>
                ${badge}
            </div>
            <div class="grid grid-cols-3 gap-2 border-y border-gray-800 py-4 mb-6">
                <div class="text-center">
                    <div class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Elaborati</div>
                    <div class="text-lg lg:text-xl font-mono text-white">${u.stats.corretti}</div>
                </div>
                <div class="text-center border-l border-gray-800">
                    <div class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Voto Medio</div>
                    <div class="text-lg lg:text-xl font-mono text-magis-400">${u.stats.media}</div>
                </div>
                <div class="text-center border-l border-gray-800">
                    <div class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Streak gg</div>
                    <div class="text-lg lg:text-xl font-mono text-orange-400">${u.stats.streak} <i data-lucide="flame" class="w-3 h-3 inline"></i></div>
                </div>
            </div>
            <button onclick="app.openCommunityChat('${u.id}')" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                <i data-lucide="message-circle" class="w-4 h-4"></i> Invia Messaggio
            </button>
        </div>
    `;
}

// --- APPEND SINGOLO MESSAGGIO DM (senza full re-render) ---

function renderSingleDMMessage(msg) {
    return `
        <div class="flex ${msg.me ? 'justify-end' : ''} mb-4 fade-in">
            <div class="max-w-[80%] lg:max-w-[70%]">
                <div class="p-3 rounded-2xl ${msg.me ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-800 text-gray-200 rounded-tl-sm'} shadow-sm text-sm">
                    ${escapeHtml(msg.text)}
                </div>
                <div class="text-[9px] text-gray-500 mt-1 ${msg.me ? 'text-right' : ''}">${msg.time}</div>
            </div>
        </div>
    `;
}

export function appendDMMessage(msg) {
    var container = document.getElementById('dm-chat-container');
    if (!container) { renderView(); return; }
    
    var wrapper = document.createElement('div');
    wrapper.innerHTML = renderSingleDMMessage(msg);
    if (wrapper.firstElementChild) {
        container.appendChild(wrapper.firstElementChild);
    }
    container.scrollTop = container.scrollHeight;
}

// --- TOGGLE MODALE UTENTE (senza full re-render, preserva input DM) ---

export function toggleUserModal(userId) {
    var modal = document.getElementById('user-modal');
    if (!modal) { renderView(); return; }
    
    if (userId) {
        modal.className = 'flex fixed inset-0 z-[150] items-center justify-center fade-in';
        modal.innerHTML = '<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="app.closeUserModal()"></div>' + renderUserModal(userId);
        lucide.createIcons();
    } else {
        modal.className = 'hidden fixed inset-0 z-[150] items-center justify-center';
        modal.innerHTML = '';
    }
}

// --- LEADERBOARD (Gamification Anonimizzata) ---

function renderCommunityLeaderboard() {
    var users = [...DB_COMMUNITY.users].sort((a, b) => b.stats.streak - a.stats.streak || b.stats.media - a.stats.media);
    
    var leaderboardHtml = users.map((u, index) => {
        var rankIcon = '';
        if (index === 0) rankIcon = '<div class="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0 border border-yellow-500/50"><i data-lucide="trophy" class="w-4 h-4 text-yellow-500"></i></div>';
        else if (index === 1) rankIcon = '<div class="w-8 h-8 rounded-full bg-gray-400/20 flex items-center justify-center shrink-0 border border-gray-400/50"><i data-lucide="medal" class="w-4 h-4 text-gray-400"></i></div>';
        else if (index === 2) rankIcon = '<div class="w-8 h-8 rounded-full bg-orange-700/20 flex items-center justify-center shrink-0 border border-orange-700/50"><i data-lucide="medal" class="w-4 h-4 text-orange-600"></i></div>';
        else rankIcon = '<div class="w-8 h-8 flex items-center justify-center shrink-0 font-bold text-gray-600">#' + (index + 1) + '</div>';

        // Manda gli attributi veri ad eccezione magari per privacy in un vero DB. Essendo mock usiamo i nomi reali del nostro DB.
        var maskedName = escapeHtml(u.name);

        return `
            <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 transition hover:bg-gray-800/50" onclick="app.openUserModal('${u.id}')" style="cursor: pointer;">
                ${rankIcon}
                <img src="${u.avatar}" class="w-10 h-10 rounded-full object-cover border-2 border-gray-700 shrink-0" />
                <div class="flex-grow min-w-0">
                    <h3 class="text-white font-bold text-sm truncate">${maskedName} ${u.id === (AppState.userProfile ? AppState.userProfile.id : 'u1') ? '<span class="text-[10px] bg-magis-600 px-2 py-0.5 rounded ml-2 uppercase text-white font-bold">Tu</span>' : ''}</h3>
                    <div class="text-xs text-gray-500 truncate">${u.concorso}</div>
                </div>
                <div class="flex gap-4 sm:gap-6 shrink-0 text-right">
                    <div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Streak</div>
                        <div class="text-sm font-bold text-orange-500 flex items-center justify-end gap-1"><i data-lucide="flame" class="w-3 h-3"></i> ${u.stats.streak}</div>
                    </div>
                    <div class="hidden sm:block border-l border-gray-800 pl-4 sm:pl-6">
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Media</div>
                        <div class="text-sm font-bold text-magis-400 flex items-center justify-end gap-1"><i data-lucide="star" class="w-3 h-3 text-magis-400"></i> ${u.stats.media}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="flex flex-col h-full fade-in">
            <div class="bg-gradient-to-r from-gray-900 to-gray-950 border border-gray-800 rounded-2xl p-6 mb-6 shrink-0 shadow-lg text-center">
                <i data-lucide="flame" class="w-8 h-8 text-orange-500 mx-auto mb-3"></i>
                <h2 class="text-2xl font-bold text-white mb-2">Classifica Settimanale</h2>
                <p class="text-gray-400 text-sm max-w-lg mx-auto">La classifica si basa sui giorni consecutivi di studio (Streak). I candidati più costanti scaleranno la vetta.</p>
            </div>
            <div class="flex-grow overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-8">
                ${leaderboardHtml}
            </div>
        </div>
    `;
}
