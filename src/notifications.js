// src/notifications.js - Notifications system with Firestore
// Rayo Social Network - Real-time notifications

import { getTimeAgo, sanitizeHTML, safeUrl, safeAttr } from '../utils.js';
import { createIcons } from 'lucide';

// Module state  
let db, collection, addDoc, getDocs, query, orderBy, limit,
    onSnapshot, doc, updateDoc, where, writeBatch, serverTimestamp;
let currentUser = null;
let unsubscribeNotifications = null;
let cachedNotifications = [];

// Initialize notifications module
export async function initNotificationsModule(user) {
    currentUser = user;

    const firestore = await import("firebase/firestore");
    const firebaseConfig = await import('../firebase-config.js');

    db = firebaseConfig.db;
    collection = firestore.collection;
    addDoc = firestore.addDoc;
    getDocs = firestore.getDocs;
    query = firestore.query;
    orderBy = firestore.orderBy;
    limit = firestore.limit;
    onSnapshot = firestore.onSnapshot;
    doc = firestore.doc;
    updateDoc = firestore.updateDoc;
    where = firestore.where;
    writeBatch = firestore.writeBatch;
    serverTimestamp = firestore.serverTimestamp;

    // Subscribe to real-time notifications
    subscribeToNotifications();

    return true;
}

// Update current user reference
export function updateNotificationsUser(user) {
    currentUser = user;
}

// Subscribe to real-time notifications
export function subscribeToNotifications() {
    if (!currentUser?.uid) return;

    // Unsubscribe from previous listener if exists
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
    }

    const notificationsRef = collection(db, "users", currentUser.uid, "notifications");
    const q = query(notificationsRef, orderBy("createdAt", "desc"), limit(50));

    unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        const notifications = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            notifications.push({
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
            });
        });

        cachedNotifications = notifications;
        updateNotificationBadge();
    }, (error) => {
        console.error('Error subscribing to notifications:', error);
    });

    return unsubscribeNotifications;
}

// Unsubscribe from notifications
export function unsubscribeFromNotifications() {
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
        unsubscribeNotifications = null;
    }
}

// Get notifications (from cache)
export function getNotifications() {
    return cachedNotifications;
}

// Add a new notification (to Firestore)
export async function addNotification(type, fromUser, toUserId, postId = null) {
    // Don't notify yourself
    if (fromUser.uid === toUserId || fromUser.authorId === toUserId) {
        return;
    }

    try {
        const notificationsRef = collection(db, "users", toUserId, "notifications");

        const notificationData = {
            type: type,
            fromUserId: fromUser.uid || fromUser.authorId,
            toUserId: toUserId, // Required for rules validation
            fromUserName: fromUser.displayName || fromUser.authorName,
            fromUserPhoto: fromUser.photoURL || fromUser.authorPhoto,
            fromUsername: fromUser.username || fromUser.authorUsername,
            postId: postId,
            read: false,
            createdAt: serverTimestamp()
        };

        await addDoc(notificationsRef, notificationData);
    } catch (error) {
        console.error('Error adding notification:', error);
    }
}

// Update notification badge count
export function updateNotificationBadge() {
    const unreadCount = cachedNotifications.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');
    const mobileBadge = document.getElementById('mobile-notification-badge');

    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (mobileBadge) {
        if (unreadCount > 0) {
            mobileBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            mobileBadge.style.display = 'block';
        } else {
            mobileBadge.style.display = 'none';
        }
    }
}

// Mark all notifications as read
export async function markAllAsRead() {
    if (!currentUser?.uid) return;

    try {
        const batch = writeBatch(db);
        const unreadNotifications = cachedNotifications.filter(n => !n.read);

        unreadNotifications.forEach(notif => {
            const notifRef = doc(db, "users", currentUser.uid, "notifications", notif.id);
            batch.update(notifRef, { read: true });
        });

        await batch.commit();

        // Update local cache
        cachedNotifications = cachedNotifications.map(n => ({ ...n, read: true }));
        updateNotificationBadge();
    } catch (error) {
        console.error('Error marking notifications as read:', error);
    }
}

// Show notifications view
export async function showNotifications(container, headerElement, showFeedCallback) {
    headerElement.innerHTML = `
        <div class="profile-header-back">
            <button class="btn-back" id="btn-back"><i data-lucide="arrow-left"></i></button>
            <div class="profile-header-info">
                <span class="profile-header-name">Notificaciones</span>
            </div>
        </div>
    `;

    const notifications = getNotifications();

    if (notifications.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No tienes notificaciones</p></div>';
    } else {
        container.innerHTML = '';
        notifications.forEach(notif => {
            container.appendChild(createNotificationElement(notif));
        });
    }

    // Mark all as read
    await markAllAsRead();

    createIcons({ icons });

    document.getElementById('btn-back')?.addEventListener('click', showFeedCallback);
}

// Create notification HTML element
export function createNotificationElement(notif) {
    const div = document.createElement('div');
    div.className = `notification-item ${notif.read ? '' : 'unread'}`;

    let icon, text;
    switch (notif.type) {
        case 'like':
            icon = '<i data-lucide="heart" class="notif-icon like"></i>';
            text = 'le gustó tu publicación';
            break;
        case 'comment':
            icon = '<i data-lucide="message-circle" class="notif-icon comment"></i>';
            text = 'comentó en tu publicación';
            break;
        case 'follow':
            icon = '<i data-lucide="user-plus" class="notif-icon follow"></i>';
            text = 'te empezó a seguir';
            break;
        case 'mention':
            icon = '<i data-lucide="at-sign" class="notif-icon mention"></i>';
            text = 'te mencionó';
            break;
        default:
            icon = '<i data-lucide="bell" class="notif-icon"></i>';
            text = 'interactuó contigo';
    }

    const safeName = sanitizeHTML(notif.fromUserName || 'Usuario');
    const photoUrl = safeUrl(notif.fromUserPhoto, 'https://api.dicebear.com/7.x/avataaars/svg?seed=default');

    div.innerHTML = `
        ${icon}
        <img src="${photoUrl}" alt="${safeAttr(notif.fromUserName || 'Usuario')}" class="avatar-small">
        <div class="notification-content">
            <span class="notification-user">${safeName}</span>
            <span class="notification-text">${text}</span>
            <span class="notification-time">${getTimeAgo(notif.createdAt)}</span>
        </div>
    `;

    return div;
}
