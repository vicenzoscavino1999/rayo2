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
const isFirebaseMode = true;

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
    // Load conversations always form Firebase
    subscribeToConversations();
    loadFirestoreUsersList();

    // Check if we came from a profile to start a conversation
    checkStartConversation();

    lucide.createIcons();

    // ==================== CHECK START CONVERSATION FROM PROFILE ====================
    function checkStartConversation() {
        const startData = sessionStorage.getItem('startConversationWith');
        if (startData) {
            sessionStorage.removeItem('startConversationWith');
            const targetUser = JSON.parse(startData);

            // Wait a bit for conversations to load, then start/open conversation
            setTimeout(async () => {
                await startFirestoreConversation(targetUser.id);
            }, 1000);
        }
    }

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

        unsubscribeConversations = onSnapshot(q, async (snapshot) => {
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
            const conversationPromises = [];
            snapshot.forEach(doc => {
                const conversation = { id: doc.id, ...doc.data() };
                conversationPromises.push(createFirestoreConversationElement(conversation));
            });

            const conversationElements = await Promise.all(conversationPromises);
            conversationElements.forEach(el => container.appendChild(el));

            lucide.createIcons();
        }, (error) => {
            console.error('Error subscribing to conversations:', error);
            // Show error message to user
            const container = document.getElementById('conversations-list');
            container.innerHTML = `
                <div class="no-conversations">
                    <p>Error al cargar conversaciones</p>
                    <p>Intenta recargar la página</p>
                </div>
            `;
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

    function createMessageElement(message) {
        const isSent = message.senderId === currentUser.uid;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        const safeContent = sanitizeHTML(message.content);

        let timeStr = '';
        if (message.timestamp) {
            const date = new Date(message.timestamp);
            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        div.innerHTML = `
            <div class="message-content">${safeContent}</div>
            <div class="message-time">${timeStr}</div>
        `;
        return div;
    }

    // ==================== MODAL ====================
    function openNewMessageModal() {
        document.getElementById('new-message-modal').classList.add('active');
        document.getElementById('search-users-input').value = '';
        loadFirestoreUsersList();
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
    // User search
    document.getElementById('search-users-input').addEventListener('input', (e) => {
        loadFirestoreUsersList(e.target.value);
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
            sendFirestoreMessage(messageInput.value);
        }
    });

    sendButton.addEventListener('click', () => {
        sendFirestoreMessage(messageInput.value);
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
