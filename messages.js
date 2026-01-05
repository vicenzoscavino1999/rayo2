// messages.js - Direct Messages with Firestore real-time sync
// Phase 1: Real-time messaging between users

// Import shared utilities
import { sanitizeHTML, getTimeAgo, formatDate, formatTime, safeUrl, safeAttr } from './utils.js';
import { createIcons, icons } from 'lucide';

// Import session management (Firebase Auth as source of truth)
import { requireCurrentUser, onSessionChange, logout } from './session.js';

// Firebase imports
import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    limit,
    limitToLast,
    endBefore,
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



document.addEventListener('DOMContentLoaded', async () => {
    // ==================== CHECK AUTH (Firebase Auth as source of truth) ====================
    const currentUser = await requireCurrentUser();

    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // ==================== INITIALIZE ====================
    let activeConversationId = null;
    let unsubscribeConversations = null;
    let unsubscribeMessages = null;
    let unsubscribeAuth = null;
    let firstVisibleMessage = null; // For pagination
    let hasMoreMessages = true;
    let currentOtherUser = null;
    const MESSAGES_PER_PAGE = 50;

    // Listen for auth changes (cross-tab logout)
    unsubscribeAuth = onSessionChange(
        null, // onLogin - we're already logged in
        () => {
            // onLogout - redirect to login
            window.location.href = 'login.html';
        }
    );

    updateUserUI(currentUser);

    // Load conversations always from Firebase
    subscribeToConversations();
    loadFirestoreUsersList();

    // Check if we came from a profile to start a conversation
    checkStartConversation();

    createIcons({ icons });

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
    // Search users with prefix matching (scalable - max 20 results)
    async function searchFirestoreUsers(searchTerm = '') {
        try {
            let q;
            const usersRef = collection(db, "users");

            if (searchTerm.trim() === '') {
                // No search term: get recent users (limit 20)
                q = query(usersRef, orderBy("createdAt", "desc"), limit(20));
            } else {
                // Prefix search on username (case-sensitive unfortunately)
                const term = searchTerm.toLowerCase().trim();
                q = query(
                    usersRef,
                    orderBy("username"),
                    where("username", ">=", term),
                    where("username", "<=", term + '\uf8ff'),
                    limit(20)
                );
            }

            const snapshot = await getDocs(q);
            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.uid !== currentUser.uid) {
                    users.push({ id: doc.id, ...data });
                }
            });
            return users;
        } catch (error) {
            console.error('Error searching users:', error);
            return [];
        }
    }

    // Debounce helper
    let searchDebounceTimer = null;
    function debounce(func, delay) {
        return (...args) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => func(...args), delay);
        };
    }

    async function loadFirestoreUsersList(filter = '') {
        const container = document.getElementById('user-search-results');

        // Show loading state
        if (filter.trim() !== '') {
            container.innerHTML = '<div class="no-conversations"><p>Buscando...</p></div>';
        }

        const users = await searchFirestoreUsers(filter);

        container.innerHTML = '';

        if (users.length === 0) {
            container.innerHTML = '<div class="no-conversations"><p>No se encontraron usuarios</p></div>';
            return;
        }

        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-search-item';
            div.innerHTML = `
                <img src="${safeUrl(user.photoURL, 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username)}" alt="${safeAttr(user.displayName)}">
                <div class="user-search-info">
                    <span class="user-search-name">${sanitizeHTML(user.displayName)}</span>
                    <span class="user-search-handle">@${sanitizeHTML(user.username)}</span>
                </div>
            `;

            div.addEventListener('click', () => {
                startFirestoreConversation(user.uid);
            });

            container.appendChild(div);
        });
    }

    // Debounced version for input events
    const debouncedUserSearch = debounce((term) => loadFirestoreUsersList(term), 300);

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

            createIcons();
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

        // Use denormalized data if available (avoids N+1 query)
        let otherUser = null;

        if (conversation.participantInfo && conversation.participantInfo[otherUserId]) {
            // Use cached/denormalized data - NO extra query needed!
            otherUser = conversation.participantInfo[otherUserId];
        } else {
            // Fallback: fetch from Firestore (legacy conversations without denormalized data)
            try {
                const userDoc = await getDoc(doc(db, "users", otherUserId));
                if (userDoc.exists()) {
                    otherUser = userDoc.data();
                }
            } catch (error) {
                console.error('Error getting user:', error);
            }
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
            <img src="${safeUrl(otherUser.photoURL, 'https://api.dicebear.com/7.x/avataaars/svg?seed=user')}" alt="${safeAttr(otherUser.displayName)}" class="conversation-avatar">
            <div class="conversation-info">
                <div class="conversation-header">
                    <span class="conversation-name">${sanitizeHTML(otherUser.displayName)}</span>
                    <span class="conversation-time">${timeAgo}</span>
                </div>
                <div class="conversation-preview">${sanitizeHTML(lastMessagePreview)}</div>
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

        // Make chat panel visible on mobile
        document.getElementById('chat-panel').classList.add('active');

        if (otherUser) {
            document.getElementById('chat-user-avatar').src = otherUser.photoURL;
            document.getElementById('chat-user-name').textContent = otherUser.displayName;
            document.getElementById('chat-user-handle').textContent = '@' + otherUser.username;
        }

        // Store for load more
        currentOtherUser = otherUser;
        hasMoreMessages = true;
        firstVisibleMessage = null;

        // Subscribe to last 50 messages in real-time
        const q = query(
            collection(db, "conversations", conversationId, "messages"),
            orderBy("createdAt", "asc"),
            limitToLast(MESSAGES_PER_PAGE)
        );

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const container = document.getElementById('chat-messages');

            // Keep "Load older" button if it exists
            const existingLoadMore = container.querySelector('.load-older-btn');
            // Preserve typing indicator
            const typingIndicator = container.querySelector('.typing-indicator');
            container.innerHTML = '';
            // Re-add typing indicator
            if (typingIndicator) {
                container.appendChild(typingIndicator);
            } else {
                // Create new typing indicator if it didn't exist
                const newTypingIndicator = document.createElement('div');
                newTypingIndicator.className = 'typing-indicator';
                newTypingIndicator.id = 'typing-indicator';
                newTypingIndicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
                container.appendChild(newTypingIndicator);
            }

            // Add "Load older messages" button if there might be more
            if (snapshot.docs.length >= MESSAGES_PER_PAGE) {
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.className = 'load-older-btn';
                loadMoreBtn.innerHTML = '<i data-lucide="chevrons-up"></i> Cargar mensajes anteriores';
                loadMoreBtn.addEventListener('click', () => loadOlderMessages(conversationId));
                container.appendChild(loadMoreBtn);
            }

            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="message-date-separator">
                        Inicia una conversación con ${otherUser ? otherUser.displayName : 'este usuario'}
                    </div>
                `;
                return;
            }

            // Store first visible for pagination
            if (snapshot.docs.length > 0) {
                firstVisibleMessage = snapshot.docs[0];
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

            createIcons({ icons });

            // Mark messages as read
            markMessagesAsRead(snapshot.docs);
        });

        // Setup typing status observer
        setupTypingObserver(conversationId);

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

        createIcons({ icons });

    }

    // Mark received messages as read
    async function markMessagesAsRead(messageDocs) {
        if (!currentUser) return;

        for (const msgDoc of messageDocs) {
            const msg = msgDoc.data();
            // Only mark messages from other user as read
            if (msg.senderId !== currentUser.uid && !msg.readAt) {
                try {
                    await updateDoc(msgDoc.ref, {
                        readAt: serverTimestamp()
                    });
                } catch (e) {
                    // Silently fail - read receipts are non-critical
                    console.debug('Could not mark message as read:', e.message);
                }
            }
        }
    }

    // Setup typing status observer for current conversation
    let typingUnsubscribe = null;
    function setupTypingObserver(conversationId) {
        // Cleanup previous observer
        if (typingUnsubscribe) {
            typingUnsubscribe();
        }

        const conversationRef = doc(db, "conversations", conversationId);
        typingUnsubscribe = onSnapshot(conversationRef, (snapshot) => {
            if (!snapshot.exists()) return;

            const data = snapshot.data();
            const typingIndicator = document.getElementById('typing-indicator');
            if (!typingIndicator) return;

            // Check if other user is typing
            const typing = data.typing || {};
            const otherUserTyping = Object.entries(typing).some(
                ([uid, isTyping]) => uid !== currentUser.uid && isTyping
            );

            if (otherUserTyping) {
                typingIndicator.classList.add('active');
                // Scroll to show typing indicator
                const container = document.getElementById('chat-messages');
                if (container) container.scrollTop = container.scrollHeight;
            } else {
                typingIndicator.classList.remove('active');
            }
        });
    }

    // Load older messages (pagination)
    async function loadOlderMessages(conversationId) {
        if (!firstVisibleMessage || !hasMoreMessages) return;

        const loadBtn = document.querySelector('.load-older-btn');
        if (loadBtn) {
            loadBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Cargando...';
            loadBtn.disabled = true;
        }

        try {
            const q = query(
                collection(db, "conversations", conversationId, "messages"),
                orderBy("createdAt", "asc"),
                endBefore(firstVisibleMessage),
                limitToLast(MESSAGES_PER_PAGE)
            );

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                hasMoreMessages = false;
                if (loadBtn) loadBtn.remove();
                return;
            }

            const container = document.getElementById('chat-messages');
            const firstElement = container.firstChild?.nextSibling || container.firstChild; // Skip load more btn

            // Store scroll position
            const scrollHeight = container.scrollHeight;

            // Update first visible for next pagination
            if (snapshot.docs.length > 0) {
                firstVisibleMessage = snapshot.docs[0];
            }

            // Hide button if no more messages
            if (snapshot.docs.length < MESSAGES_PER_PAGE) {
                hasMoreMessages = false;
                if (loadBtn) loadBtn.remove();
            } else if (loadBtn) {
                loadBtn.innerHTML = '<i data-lucide="chevrons-up"></i> Cargar mensajes anteriores';
                loadBtn.disabled = false;
            }

            // Create message elements in order
            let lastDate = null;
            const fragment = document.createDocumentFragment();

            snapshot.forEach(doc => {
                const msg = { id: doc.id, ...doc.data() };
                const timestamp = msg.createdAt?.toMillis ? msg.createdAt.toMillis() : Date.now();
                const msgDate = new Date(timestamp).toDateString();

                if (msgDate !== lastDate) {
                    const separator = document.createElement('div');
                    separator.className = 'message-date-separator';
                    separator.textContent = formatDate(timestamp);
                    fragment.appendChild(separator);
                    lastDate = msgDate;
                }

                fragment.appendChild(createMessageElement({ ...msg, timestamp }));
            });

            // Insert after load button (if exists)
            const insertPoint = loadBtn ? loadBtn.nextSibling : container.firstChild;
            container.insertBefore(fragment, insertPoint);

            // Maintain scroll position
            container.scrollTop = container.scrollHeight - scrollHeight;

            createIcons({ icons });

        } catch (error) {
            console.error('Error loading older messages:', error);
            if (loadBtn) {
                loadBtn.innerHTML = '<i data-lucide="chevrons-up"></i> Error - Reintentar';
                loadBtn.disabled = false;
            }
        }
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
                // Use denormalized data if available, otherwise fetch
                let otherUser = existingConv.participantInfo?.[otherUserId];
                if (!otherUser) {
                    const userDoc = await getDoc(doc(db, "users", otherUserId));
                    otherUser = userDoc.exists() ? userDoc.data() : null;
                }

                closeModal();
                openFirestoreConversation(existingConv.id, otherUser);
                return;
            }

            // Get other user info for denormalization
            const otherUserDoc = await getDoc(doc(db, "users", otherUserId));
            const otherUser = otherUserDoc.exists() ? otherUserDoc.data() : null;

            // Create new conversation with denormalized participant info
            const convData = {
                participants: [currentUser.uid, otherUserId],
                // Denormalized data - avoids N+1 queries when listing conversations
                participantInfo: {
                    [currentUser.uid]: {
                        displayName: currentUser.displayName,
                        username: currentUser.username,
                        photoURL: currentUser.photoURL
                    },
                    [otherUserId]: {
                        displayName: otherUser?.displayName || 'Usuario',
                        username: otherUser?.username || 'user',
                        photoURL: otherUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUserId}`
                    }
                },
                lastMessage: '',
                lastMessageTime: serverTimestamp(),
                lastMessageSender: null,
                unreadBy: [],
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, "conversations"), convData);

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

        // Read receipt status for sent messages
        let statusHtml = '';
        if (isSent) {
            const status = message.readAt ? 'read' : (message.deliveredAt ? 'delivered' : 'sent');
            const checkIcon = status === 'read'
                ? '<i data-lucide="check-check"></i>'
                : '<i data-lucide="check"></i>';
            statusHtml = `<span class="message-status ${status}">${checkIcon}</span>`;
        }

        div.innerHTML = `
            <div class="message-content">${safeContent}</div>
            <div class="message-meta">
                <span class="message-time">${timeStr}</span>
                ${statusHtml}
            </div>
        `;
        return div;
    }

    // ==================== MODAL ====================
    function openNewMessageModal() {
        document.getElementById('new-message-modal').classList.add('active');
        document.getElementById('search-users-input').value = '';
        loadFirestoreUsersList();
        createIcons();
        setTimeout(() => document.getElementById('search-users-input').focus(), 100);
    }

    function closeModal() {
        document.getElementById('new-message-modal').classList.remove('active');
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

    // User search with debounce (300ms delay)
    document.getElementById('search-users-input').addEventListener('input', (e) => {
        debouncedUserSearch(e.target.value);
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

        // Update typing status in Firestore
        if (activeConversationId && messageInput.value.trim().length > 0) {
            updateTypingStatus(true);
        } else {
            updateTypingStatus(false);
        }
    });

    // Clear typing status on blur
    messageInput.addEventListener('blur', () => {
        updateTypingStatus(false);
    });

    // Typing status update function (debounced)
    let typingTimeout = null;
    async function updateTypingStatus(isTyping) {
        if (!activeConversationId) return;

        // Clear previous timeout
        clearTimeout(typingTimeout);

        if (isTyping) {
            try {
                await updateDoc(doc(db, "conversations", activeConversationId), {
                    [`typing.${currentUser.uid}`]: true
                });

                // Auto-clear typing after 3 seconds of no input
                typingTimeout = setTimeout(() => {
                    updateTypingStatus(false);
                }, 3000);
            } catch (e) {
                // Silently fail - typing indicator is non-critical
            }
        } else {
            try {
                await updateDoc(doc(db, "conversations", activeConversationId), {
                    [`typing.${currentUser.uid}`]: false
                });
            } catch (e) {
                // Silently fail
            }
        }
    }

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && messageInput.value.trim()) {
            e.preventDefault();
            sendFirestoreMessage(messageInput.value);
        }
    });

    sendButton.addEventListener('click', () => {
        sendFirestoreMessage(messageInput.value);
    });

    // Back button in chat (for mobile)
    const btnBackChat = document.getElementById('btn-back-chat');
    if (btnBackChat) {
        btnBackChat.addEventListener('click', () => {
            document.getElementById('chat-panel').classList.remove('active');
            document.getElementById('chat-active').style.display = 'none';
            document.getElementById('chat-placeholder').style.display = 'flex';
            activeConversationId = null;

            // Update conversation items to remove active state
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
        });
    }

    // Logout
    document.getElementById('nav-logout').addEventListener('click', async (e) => {
        e.preventDefault();

        // Cleanup subscriptions
        if (unsubscribeConversations) unsubscribeConversations();
        if (unsubscribeMessages) unsubscribeMessages();
        if (unsubscribeAuth) unsubscribeAuth();

        // Logout via session (Firebase signOut)
        await logout();

        // Clear legacy localStorage (cleanup only)
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
