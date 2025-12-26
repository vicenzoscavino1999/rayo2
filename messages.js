// messages.js - Direct Messages functionality

document.addEventListener('DOMContentLoaded', () => {
    // ==================== CHECK AUTH ====================
    const demoMode = localStorage.getItem('rayo_demo_mode');
    const demoUser = JSON.parse(localStorage.getItem('rayo_demo_user') || 'null');

    if (!demoMode || !demoUser) {
        window.location.href = 'login.html';
        return;
    }

    // ==================== INITIALIZE ====================
    const currentUser = demoUser;
    let activeConversationId = null;

    updateUserUI(currentUser);
    loadConversations();
    loadUsersList();
    lucide.createIcons();

    // ==================== USER UI ====================
    function updateUserUI(user) {
        document.getElementById('sidebar-avatar').src = user.photoURL;
        document.getElementById('sidebar-name').textContent = user.displayName;
        document.getElementById('sidebar-handle').textContent = '@' + user.username;
    }

    // ==================== USERS ====================
    function getUsers() {
        const defaultUsers = [
            { uid: 'user-ana', displayName: 'Ana García', username: 'ana_dev', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana', verified: true },
            { uid: 'user-carlos', displayName: 'Carlos Tech', username: 'carlostech', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos', verified: true },
            { uid: 'user-design', displayName: 'Design Daily', username: 'designdaily', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Design', verified: false },
            { uid: 'user-david', displayName: 'David Dev', username: 'david_ui', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David', verified: false }
        ];

        let users = JSON.parse(localStorage.getItem('rayo_users') || 'null');
        if (!users) {
            users = defaultUsers;
            localStorage.setItem('rayo_users', JSON.stringify(users));
        }
        return users.filter(u => u.uid !== currentUser.uid);
    }

    function getUserById(userId) {
        const users = JSON.parse(localStorage.getItem('rayo_users') || '[]');
        return users.find(u => u.uid === userId);
    }

    // ==================== CONVERSATIONS ====================
    function getConversations() {
        let conversations = JSON.parse(localStorage.getItem('rayo_conversations') || '[]');

        // Filter only conversations for current user
        return conversations.filter(c =>
            c.participants.includes(currentUser.uid)
        );
    }

    function saveConversations(conversations) {
        // Get all conversations (including other users')
        let allConversations = JSON.parse(localStorage.getItem('rayo_conversations') || '[]');

        // Update or add conversations
        conversations.forEach(conv => {
            const existingIndex = allConversations.findIndex(c => c.id === conv.id);
            if (existingIndex >= 0) {
                allConversations[existingIndex] = conv;
            } else {
                allConversations.push(conv);
            }
        });

        localStorage.setItem('rayo_conversations', JSON.stringify(allConversations));
    }

    function getOrCreateConversation(otherUserId) {
        const conversations = getConversations();

        // Find existing conversation
        let conversation = conversations.find(c =>
            c.participants.includes(otherUserId)
        );

        if (!conversation) {
            // Create new conversation
            conversation = {
                id: 'conv-' + Date.now(),
                participants: [currentUser.uid, otherUserId],
                messages: [],
                lastMessage: null,
                lastMessageTime: Date.now(),
                unreadBy: []
            };
            saveConversations([conversation]);
        }

        return conversation;
    }

    function loadConversations() {
        const conversations = getConversations();
        const container = document.getElementById('conversations-list');

        if (conversations.length === 0) {
            container.innerHTML = `
                <div class="no-conversations">
                    <p>No tienes mensajes aún</p>
                    <p>Inicia una conversación</p>
                </div>
            `;
            return;
        }

        // Sort by last message time
        conversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

        container.innerHTML = '';
        conversations.forEach(conv => {
            container.appendChild(createConversationElement(conv));
        });

        lucide.createIcons();
    }

    function createConversationElement(conversation) {
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        const otherUser = getUserById(otherUserId);

        if (!otherUser) return document.createElement('div');

        const isUnread = conversation.unreadBy && conversation.unreadBy.includes(currentUser.uid);
        const isActive = activeConversationId === conversation.id;

        const div = document.createElement('div');
        div.className = `conversation-item ${isUnread ? 'unread' : ''} ${isActive ? 'active' : ''}`;
        div.dataset.conversationId = conversation.id;
        div.dataset.userId = otherUserId;

        const lastMessagePreview = conversation.lastMessage ?
            (conversation.lastMessage.senderId === currentUser.uid ? 'Tú: ' : '') + conversation.lastMessage.content :
            'Inicia la conversación';

        const timeAgo = conversation.lastMessageTime ? getTimeAgo(conversation.lastMessageTime) : '';

        div.innerHTML = `
            <img src="${otherUser.photoURL}" alt="${otherUser.displayName}" class="conversation-avatar">
            <div class="conversation-info">
                <div class="conversation-header">
                    <span class="conversation-name">${otherUser.displayName}</span>
                    <span class="conversation-time">${timeAgo}</span>
                </div>
                <div class="conversation-preview">${lastMessagePreview}</div>
            </div>
        `;

        div.addEventListener('click', () => {
            openConversation(conversation.id);
        });

        return div;
    }

    function openConversation(conversationId) {
        const conversations = getConversations();
        const conversation = conversations.find(c => c.id === conversationId);

        if (!conversation) return;

        activeConversationId = conversationId;

        // Mark as read
        if (conversation.unreadBy) {
            conversation.unreadBy = conversation.unreadBy.filter(id => id !== currentUser.uid);
            saveConversations([conversation]);
        }

        // Update UI
        document.getElementById('chat-placeholder').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';

        // Get other user info
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        const otherUser = getUserById(otherUserId);

        if (otherUser) {
            document.getElementById('chat-user-avatar').src = otherUser.photoURL;
            document.getElementById('chat-user-name').textContent = otherUser.displayName;
            document.getElementById('chat-user-handle').textContent = '@' + otherUser.username;
        }

        // Load messages
        loadMessages(conversation);

        // Update conversation list active state
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.conversationId === conversationId) {
                item.classList.add('active');
                item.classList.remove('unread');
            }
        });

        // Focus input
        document.getElementById('message-input').focus();

        lucide.createIcons();
    }

    function loadMessages(conversation) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';

        if (!conversation.messages || conversation.messages.length === 0) {
            const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
            const otherUser = getUserById(otherUserId);
            container.innerHTML = `
                <div class="message-date-separator">
                    Inicia una conversación con ${otherUser ? otherUser.displayName : 'este usuario'}
                </div>
            `;
            return;
        }

        let lastDate = null;

        conversation.messages.forEach(msg => {
            const msgDate = new Date(msg.timestamp).toDateString();

            if (msgDate !== lastDate) {
                const separator = document.createElement('div');
                separator.className = 'message-date-separator';
                separator.textContent = formatDate(msg.timestamp);
                container.appendChild(separator);
                lastDate = msgDate;
            }

            container.appendChild(createMessageElement(msg));
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    function createMessageElement(message) {
        const isSent = message.senderId === currentUser.uid;

        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.innerHTML = `
            <div class="message-content">${message.content}</div>
            <div class="message-time">${formatTime(message.timestamp)}</div>
        `;

        return div;
    }

    function sendMessage(content) {
        if (!content.trim() || !activeConversationId) return;

        const conversations = getConversations();
        const conversation = conversations.find(c => c.id === activeConversationId);

        if (!conversation) return;

        const message = {
            id: 'msg-' + Date.now(),
            senderId: currentUser.uid,
            content: content.trim(),
            timestamp: Date.now()
        };

        if (!conversation.messages) {
            conversation.messages = [];
        }

        conversation.messages.push(message);
        conversation.lastMessage = message;
        conversation.lastMessageTime = message.timestamp;

        // Mark as unread for other user
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        if (!conversation.unreadBy) {
            conversation.unreadBy = [];
        }
        if (!conversation.unreadBy.includes(otherUserId)) {
            conversation.unreadBy.push(otherUserId);
        }

        saveConversations([conversation]);

        // Update UI
        loadMessages(conversation);
        loadConversations();

        // Clear input
        document.getElementById('message-input').value = '';
        document.getElementById('btn-send-message').disabled = true;

        // Simulate reply after 2 seconds (for demo)
        setTimeout(() => {
            simulateReply(conversation.id);
        }, 2000 + Math.random() * 3000);
    }

    function simulateReply(conversationId) {
        const conversations = JSON.parse(localStorage.getItem('rayo_conversations') || '[]');
        const conversation = conversations.find(c => c.id === conversationId);

        if (!conversation) return;

        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        const otherUser = getUserById(otherUserId);

        const replies = [
            '¡Hola! ¿Cómo estás? 👋',
            '¡Qué bueno saber de ti!',
            'Sí, totalmente de acuerdo 👍',
            'Interesante, cuéntame más',
            'Gracias por escribir 😊',
            'Perfecto, hablamos pronto',
            'Jaja, muy bueno 😂',
            '¿En serio? No lo sabía',
            'Claro, sin problema',
            '¡Genial! Me alegra saberlo'
        ];

        const randomReply = replies[Math.floor(Math.random() * replies.length)];

        const message = {
            id: 'msg-' + Date.now(),
            senderId: otherUserId,
            content: randomReply,
            timestamp: Date.now()
        };

        conversation.messages.push(message);
        conversation.lastMessage = message;
        conversation.lastMessageTime = message.timestamp;

        // Mark as unread for current user if not viewing
        if (activeConversationId !== conversationId) {
            if (!conversation.unreadBy) {
                conversation.unreadBy = [];
            }
            if (!conversation.unreadBy.includes(currentUser.uid)) {
                conversation.unreadBy.push(currentUser.uid);
            }
        }

        localStorage.setItem('rayo_conversations', JSON.stringify(conversations));

        // Update UI if viewing this conversation
        if (activeConversationId === conversationId) {
            loadMessages(conversation);
        }
        loadConversations();
    }

    // ==================== NEW MESSAGE MODAL ====================
    function loadUsersList(filter = '') {
        const users = getUsers();
        const container = document.getElementById('user-search-results');

        const filteredUsers = users.filter(u =>
            u.displayName.toLowerCase().includes(filter.toLowerCase()) ||
            u.username.toLowerCase().includes(filter.toLowerCase())
        );

        container.innerHTML = '';

        if (filteredUsers.length === 0) {
            container.innerHTML = '<div class="no-conversations"><p>No se encontraron usuarios</p></div>';
            return;
        }

        filteredUsers.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-search-item';
            div.innerHTML = `
                <img src="${user.photoURL}" alt="${user.displayName}">
                <div class="user-search-info">
                    <span class="user-search-name">${user.displayName}</span>
                    <span class="user-search-handle">@${user.username}</span>
                </div>
            `;

            div.addEventListener('click', () => {
                startConversation(user.uid);
            });

            container.appendChild(div);
        });
    }

    function startConversation(otherUserId) {
        const conversation = getOrCreateConversation(otherUserId);
        closeModal();
        loadConversations();
        openConversation(conversation.id);
    }

    function openNewMessageModal() {
        document.getElementById('new-message-modal').classList.add('active');
        document.getElementById('search-users-input').value = '';
        loadUsersList();
        lucide.createIcons();
        setTimeout(() => document.getElementById('search-users-input').focus(), 100);
    }

    function closeModal() {
        document.getElementById('new-message-modal').classList.remove('active');
    }

    // ==================== UTILITIES ====================
    function getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'ahora';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
        if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Hoy';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Ayer';
        } else {
            return date.toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            });
        }
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    // ==================== EVENT LISTENERS ====================

    // New message buttons
    document.getElementById('btn-new-message').addEventListener('click', openNewMessageModal);
    document.getElementById('btn-start-conversation').addEventListener('click', openNewMessageModal);

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('new-message-modal').addEventListener('click', (e) => {
        if (e.target.id === 'new-message-modal') closeModal();
    });

    // User search
    document.getElementById('search-users-input').addEventListener('input', (e) => {
        loadUsersList(e.target.value);
    });

    // Conversation search
    document.getElementById('search-conversations').addEventListener('input', (e) => {
        const filter = e.target.value.toLowerCase();
        document.querySelectorAll('.conversation-item').forEach(item => {
            const name = item.querySelector('.conversation-name').textContent.toLowerCase();
            item.style.display = name.includes(filter) ? 'flex' : 'none';
        });
    });

    // Message input
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('btn-send-message');

    messageInput.addEventListener('input', () => {
        sendButton.disabled = messageInput.value.trim().length === 0;
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && messageInput.value.trim()) {
            e.preventDefault();
            sendMessage(messageInput.value);
        }
    });

    sendButton.addEventListener('click', () => {
        sendMessage(messageInput.value);
    });

    // Logout
    document.getElementById('nav-logout').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('rayo_demo_mode');
        localStorage.removeItem('rayo_demo_user');
        window.location.href = 'login.html';
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});
