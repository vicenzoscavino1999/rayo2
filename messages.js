// messages.js - Direct Messages with Firestore real-time sync
// Phase 1: Real-time messaging between users

// Firebase imports
import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    limit,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    where,
    getDoc,
    setDoc,
    Timestamp
} from "firebase/firestore";

// Check if we're in Firebase mode
const isFirebaseMode = localStorage.getItem('rayo_firebase_user') === 'true';

// ==================== SECURITY: HTML SANITIZATION ====================
// Prevent XSS attacks by escaping HTML characters
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

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
    let unsubscribeConversations = null;
    let unsubscribeMessages = null;

    updateUserUI(currentUser);

    // Load conversations based on mode
    if (isFirebaseMode) {
        subscribeToConversations();
        loadFirestoreUsersList();
    } else {
        loadConversations();
        loadUsersList();
    }

    lucide.createIcons();

    // ==================== USER UI ====================
    function updateUserUI(user) {
        document.getElementById('sidebar-avatar').src = user.photoURL;
        document.getElementById('sidebar-name').textContent = user.displayName;
        document.getElementById('sidebar-handle').textContent = '@' + user.username;
    }

    // ==================== FIRESTORE USERS ====================
    async function getFirestoreUsers() {
        try {
            const snapshot = await getDocs(collection(db, "users"));
            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.uid !== currentUser.uid) {
                    users.push({ id: doc.id, ...data });
                }
            });
            return users;
        } catch (error) {
            console.error('Error loading users:', error);
            return [];
        }
    }

    async function loadFirestoreUsersList(filter = '') {
        const users = await getFirestoreUsers();
        const container = document.getElementById('user-search-results');

        const filteredUsers = users.filter(u =>
            (u.displayName || '').toLowerCase().includes(filter.toLowerCase()) ||
            (u.username || '').toLowerCase().includes(filter.toLowerCase())
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
                <img src="${user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}" alt="${user.displayName}">
                <div class="user-search-info">
                    <span class="user-search-name">${user.displayName}</span>
                    <span class="user-search-handle">@${user.username}</span>
                </div>
            `;

            div.addEventListener('click', () => {
                startFirestoreConversation(user.uid);
            });

            container.appendChild(div);
        });
    }

    // ==================== FIRESTORE CONVERSATIONS ====================
    function subscribeToConversations() {
        const q = query(
            collection(db, "conversations"),
            where("participants", "array-contains", currentUser.uid),
            orderBy("lastMessageTime", "desc")
        );

        unsubscribeConversations = onSnapshot(q, (snapshot) => {
            const container = document.getElementById('conversations-list');

            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="no-conversations">
                        <p>No tienes mensajes aún</p>
                        <p>Inicia una conversación</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            snapshot.forEach(doc => {
                const conversation = { id: doc.id, ...doc.data() };
                container.appendChild(createFirestoreConversationElement(conversation));
            });

            lucide.createIcons();
        }, (error) => {
            console.error('Error subscribing to conversations:', error);
            // Fallback to localStorage
            loadConversations();
        });
    }

    async function createFirestoreConversationElement(conversation) {
        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);

        // Get other user info from Firestore
        let otherUser = null;
        try {
            const userDoc = await getDoc(doc(db, "users", otherUserId));
            if (userDoc.exists()) {
                otherUser = userDoc.data();
            }
        } catch (error) {
            console.error('Error getting user:', error);
        }

        if (!otherUser) {
            otherUser = {
                displayName: 'Usuario',
                username: 'user',
                photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user'
            };
        }

        const isUnread = conversation.unreadBy && conversation.unreadBy.includes(currentUser.uid);
        const isActive = activeConversationId === conversation.id;

        const div = document.createElement('div');
        div.className = `conversation-item ${isUnread ? 'unread' : ''} ${isActive ? 'active' : ''}`;
        div.dataset.conversationId = conversation.id;
        div.dataset.userId = otherUserId;

        const lastMessagePreview = conversation.lastMessage ?
            (conversation.lastMessageSender === currentUser.uid ? 'Tú: ' : '') + conversation.lastMessage :
            'Inicia la conversación';

        const timeAgo = conversation.lastMessageTime ?
            getTimeAgo(conversation.lastMessageTime.toMillis ? conversation.lastMessageTime.toMillis() : conversation.lastMessageTime) :
            '';

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
            openFirestoreConversation(conversation.id, otherUser);
        });

        return div;
    }

    async function openFirestoreConversation(conversationId, otherUser) {
        activeConversationId = conversationId;

        // Cancel previous subscription
        if (unsubscribeMessages) {
            unsubscribeMessages();
        }

        // Mark as read
        try {
            const convRef = doc(db, "conversations", conversationId);
            const convDoc = await getDoc(convRef);
            if (convDoc.exists()) {
                const unreadBy = convDoc.data().unreadBy || [];
                if (unreadBy.includes(currentUser.uid)) {
                    await updateDoc(convRef, {
                        unreadBy: unreadBy.filter(id => id !== currentUser.uid)
                    });
                }
            }
        } catch (error) {
            console.error('Error marking as read:', error);
        }

        // Update UI
        document.getElementById('chat-placeholder').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';

        if (otherUser) {
            document.getElementById('chat-user-avatar').src = otherUser.photoURL;
            document.getElementById('chat-user-name').textContent = otherUser.displayName;
            document.getElementById('chat-user-handle').textContent = '@' + otherUser.username;
        }

        // Subscribe to messages in real-time
        const q = query(
            collection(db, "conversations", conversationId, "messages"),
            orderBy("createdAt", "asc")
        );

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const container = document.getElementById('chat-messages');
            container.innerHTML = '';

            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="message-date-separator">
                        Inicia una conversación con ${otherUser ? otherUser.displayName : 'este usuario'}
                    </div>
                `;
                return;
            }

            let lastDate = null;

            snapshot.forEach(doc => {
                const msg = { id: doc.id, ...doc.data() };
                const timestamp = msg.createdAt?.toMillis ? msg.createdAt.toMillis() : Date.now();
                const msgDate = new Date(timestamp).toDateString();

                if (msgDate !== lastDate) {
                    const separator = document.createElement('div');
                    separator.className = 'message-date-separator';
                    separator.textContent = formatDate(timestamp);
                    container.appendChild(separator);
                    lastDate = msgDate;
                }

                container.appendChild(createMessageElement({ ...msg, timestamp }));
            });

            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        });

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

    async function sendFirestoreMessage(content) {
        if (!content.trim() || !activeConversationId) return;

        try {
            const messageData = {
                senderId: currentUser.uid,
                senderName: currentUser.displayName,
                senderPhoto: currentUser.photoURL,
                content: content.trim(),
                createdAt: serverTimestamp()
            };

            // Add message to subcollection
            await addDoc(
                collection(db, "conversations", activeConversationId, "messages"),
                messageData
            );

            // Get other user ID
            const convDoc = await getDoc(doc(db, "conversations", activeConversationId));
            const otherUserId = convDoc.data().participants.find(id => id !== currentUser.uid);

            // Update conversation's last message
            await updateDoc(doc(db, "conversations", activeConversationId), {
                lastMessage: content.trim(),
                lastMessageTime: serverTimestamp(),
                lastMessageSender: currentUser.uid,
                unreadBy: [otherUserId]
            });

            // Clear input
            document.getElementById('message-input').value = '';
            document.getElementById('btn-send-message').disabled = true;

        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error al enviar mensaje. Intenta de nuevo.');
        }
    }

    async function startFirestoreConversation(otherUserId) {
        try {
            // Check if conversation exists
            const q = query(
                collection(db, "conversations"),
                where("participants", "array-contains", currentUser.uid)
            );

            const snapshot = await getDocs(q);
            let existingConv = null;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.participants.includes(otherUserId)) {
                    existingConv = { id: doc.id, ...data };
                }
            });

            if (existingConv) {
                // Get other user info
                const userDoc = await getDoc(doc(db, "users", otherUserId));
                const otherUser = userDoc.exists() ? userDoc.data() : null;

                closeModal();
                openFirestoreConversation(existingConv.id, otherUser);
                return;
            }

            // Create new conversation
            const convData = {
                participants: [currentUser.uid, otherUserId],
                lastMessage: '',
                lastMessageTime: serverTimestamp(),
                lastMessageSender: null,
                unreadBy: [],
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, "conversations"), convData);

            // Get other user info
            const userDoc = await getDoc(doc(db, "users", otherUserId));
            const otherUser = userDoc.exists() ? userDoc.data() : null;

            closeModal();
            openFirestoreConversation(docRef.id, otherUser);

        } catch (error) {
            console.error('Error starting conversation:', error);
            alert('Error al iniciar conversación. Intenta de nuevo.');
        }
    }

    // ==================== LOCALSTORAGE FALLBACK ====================
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

    function getConversations() {
        let conversations = JSON.parse(localStorage.getItem('rayo_conversations') || '[]');
        return conversations.filter(c => c.participants.includes(currentUser.uid));
    }

    function saveConversations(conversations) {
        let allConversations = JSON.parse(localStorage.getItem('rayo_conversations') || '[]');
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
        let conversation = conversations.find(c => c.participants.includes(otherUserId));

        if (!conversation) {
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

        if (conversation.unreadBy) {
            conversation.unreadBy = conversation.unreadBy.filter(id => id !== currentUser.uid);
            saveConversations([conversation]);
        }

        document.getElementById('chat-placeholder').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';

        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        const otherUser = getUserById(otherUserId);

        if (otherUser) {
            document.getElementById('chat-user-avatar').src = otherUser.photoURL;
            document.getElementById('chat-user-name').textContent = otherUser.displayName;
            document.getElementById('chat-user-handle').textContent = '@' + otherUser.username;
        }

        loadMessages(conversation);

        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.conversationId === conversationId) {
                item.classList.add('active');
                item.classList.remove('unread');
            }
        });

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

        container.scrollTop = container.scrollHeight;
    }

    function createMessageElement(message) {
        const isSent = message.senderId === currentUser.uid;

        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;

        // Sanitize message content to prevent XSS
        const safeContent = sanitizeHTML(message.content);

        div.innerHTML = `
            <div class="message-content">${safeContent}</div>
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

        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);
        if (!conversation.unreadBy) {
            conversation.unreadBy = [];
        }
        if (!conversation.unreadBy.includes(otherUserId)) {
            conversation.unreadBy.push(otherUserId);
        }

        saveConversations([conversation]);

        loadMessages(conversation);
        loadConversations();

        document.getElementById('message-input').value = '';
        document.getElementById('btn-send-message').disabled = true;

        setTimeout(() => {
            simulateReply(conversation.id);
        }, 2000 + Math.random() * 3000);
    }

    function simulateReply(conversationId) {
        const conversations = JSON.parse(localStorage.getItem('rayo_conversations') || '[]');
        const conversation = conversations.find(c => c.id === conversationId);

        if (!conversation) return;

        const otherUserId = conversation.participants.find(id => id !== currentUser.uid);

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

        if (activeConversationId !== conversationId) {
            if (!conversation.unreadBy) {
                conversation.unreadBy = [];
            }
            if (!conversation.unreadBy.includes(currentUser.uid)) {
                conversation.unreadBy.push(currentUser.uid);
            }
        }

        localStorage.setItem('rayo_conversations', JSON.stringify(conversations));

        if (activeConversationId === conversationId) {
            loadMessages(conversation);
        }
        loadConversations();
    }

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

    // ==================== MODAL ====================
    function openNewMessageModal() {
        document.getElementById('new-message-modal').classList.add('active');
        document.getElementById('search-users-input').value = '';

        if (isFirebaseMode) {
            loadFirestoreUsersList();
        } else {
            loadUsersList();
        }

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
        if (isFirebaseMode) {
            loadFirestoreUsersList(e.target.value);
        } else {
            loadUsersList(e.target.value);
        }
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
            if (isFirebaseMode) {
                sendFirestoreMessage(messageInput.value);
            } else {
                sendMessage(messageInput.value);
            }
        }
    });

    sendButton.addEventListener('click', () => {
        if (isFirebaseMode) {
            sendFirestoreMessage(messageInput.value);
        } else {
            sendMessage(messageInput.value);
        }
    });

    // Logout
    document.getElementById('nav-logout').addEventListener('click', (e) => {
        e.preventDefault();

        // Cleanup subscriptions
        if (unsubscribeConversations) unsubscribeConversations();
        if (unsubscribeMessages) unsubscribeMessages();

        localStorage.removeItem('rayo_demo_mode');
        localStorage.removeItem('rayo_demo_user');
        localStorage.removeItem('rayo_firebase_user');
        window.location.href = 'login.html';
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (unsubscribeConversations) unsubscribeConversations();
        if (unsubscribeMessages) unsubscribeMessages();
    });

    console.log(`💬 Messages loaded in ${isFirebaseMode ? 'Firebase' : 'localStorage'} mode`);
});
