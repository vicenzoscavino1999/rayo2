// firestore-service.js
// Real-time Firestore service for Rayo ⚡

import {
    db,
    auth,
    onAuthChange,
    getCurrentUser
} from './firebase-config.js';

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
    arrayUnion,
    arrayRemove
} from "firebase/firestore";

// ==================== POSTS ====================

// Create a new post
export async function createFirestorePost(content, imageUrl = null) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');

    const postData = {
        authorId: user.uid,
        authorName: user.displayName,
        authorUsername: user.username,
        authorPhoto: user.photoURL,
        verified: false,
        content: content,
        imageUrl: imageUrl,
        likes: [],
        reposts: [],
        comments: [],
        views: Math.floor(Math.random() * 100),
        createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, "posts"), postData);
    return { id: docRef.id, ...postData, createdAt: Date.now() };
}

// Get all posts with real-time updates
export function subscribeToPostsFirestore(callback) {
    const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(50)
    );

    return onSnapshot(q, (snapshot) => {
        const posts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            posts.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toMillis() || Date.now()
            });
        });
        callback(posts);
    }, (error) => {
        console.error('Error subscribing to posts:', error);
    });
}

// Toggle like on a post
export async function toggleLikeFirestore(postId) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');

    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
        throw new Error('Post no encontrado');
    }

    const postData = postSnap.data();
    const likes = postData.likes || [];
    const isLiked = likes.includes(user.uid);

    if (isLiked) {
        await updateDoc(postRef, {
            likes: arrayRemove(user.uid)
        });
    } else {
        await updateDoc(postRef, {
            likes: arrayUnion(user.uid)
        });
    }

    return !isLiked;
}

// Add a comment to a post
export async function addCommentFirestore(postId, content) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');

    const postRef = doc(db, "posts", postId);

    const comment = {
        id: 'comment-' + Date.now(),
        authorId: user.uid,
        authorName: user.displayName,
        authorUsername: user.username,
        authorPhoto: user.photoURL,
        content: content,
        createdAt: Date.now()
    };

    await updateDoc(postRef, {
        comments: arrayUnion(comment)
    });

    return comment;
}

// Delete a post
export async function deletePostFirestore(postId) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');

    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (postSnap.exists() && postSnap.data().authorId === user.uid) {
        await deleteDoc(postRef);
        return true;
    }
    throw new Error('No autorizado');
}

// ==================== USERS ====================

// Get or create user in Firestore
export async function getOrCreateFirestoreUser(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        const userData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            username: user.username || user.email?.split('@')[0] || 'user',
            photoURL: user.photoURL,
            bio: '',
            followers: [],
            following: [],
            createdAt: serverTimestamp()
        };
        await setDoc(userRef, userData);
        return userData;
    }

    return userSnap.data();
}

// Get all users
export async function getAllUsersFirestore() {
    const snapshot = await getDocs(collection(db, "users"));
    const users = [];
    snapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
    });
    return users;
}

// Toggle follow
export async function toggleFollowFirestore(targetUserId) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');
    if (user.uid === targetUserId) throw new Error('No puedes seguirte a ti mismo');

    const currentUserRef = doc(db, "users", user.uid);
    const targetUserRef = doc(db, "users", targetUserId);

    const currentUserSnap = await getDoc(currentUserRef);
    const targetUserSnap = await getDoc(targetUserRef);

    if (!currentUserSnap.exists() || !targetUserSnap.exists()) {
        throw new Error('Usuario no encontrado');
    }

    const following = currentUserSnap.data().following || [];
    const isFollowing = following.includes(targetUserId);

    if (isFollowing) {
        await updateDoc(currentUserRef, { following: arrayRemove(targetUserId) });
        await updateDoc(targetUserRef, { followers: arrayRemove(user.uid) });
    } else {
        await updateDoc(currentUserRef, { following: arrayUnion(targetUserId) });
        await updateDoc(targetUserRef, { followers: arrayUnion(user.uid) });
    }

    return !isFollowing;
}

// ==================== MESSAGES ====================

// Get conversations for current user
export function subscribeToConversationsFirestore(callback) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) return () => { };

    const q = query(
        collection(db, "conversations"),
        where("participants", "array-contains", user.uid),
        orderBy("lastMessageTime", "desc")
    );

    return onSnapshot(q, (snapshot) => {
        const conversations = [];
        snapshot.forEach(doc => {
            conversations.push({ id: doc.id, ...doc.data() });
        });
        callback(conversations);
    });
}

// Get messages for a conversation
export function subscribeToMessagesFirestore(conversationId, callback) {
    const q = query(
        collection(db, "conversations", conversationId, "messages"),
        orderBy("createdAt", "asc")
    );

    return onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        callback(messages);
    });
}

// Send a message
export async function sendMessageFirestore(conversationId, content) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');

    const messageData = {
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoURL,
        content: content,
        createdAt: serverTimestamp()
    };

    // Add message to subcollection
    await addDoc(
        collection(db, "conversations", conversationId, "messages"),
        messageData
    );

    // Update conversation's last message
    await updateDoc(doc(db, "conversations", conversationId), {
        lastMessage: content,
        lastMessageTime: serverTimestamp(),
        lastMessageSender: user.uid
    });

    return messageData;
}

// Create or get conversation
export async function getOrCreateConversationFirestore(otherUserId) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) throw new Error('No autenticado');

    // Check if conversation exists
    const q = query(
        collection(db, "conversations"),
        where("participants", "array-contains", user.uid)
    );

    const snapshot = await getDocs(q);
    let existingConv = null;

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.participants.includes(otherUserId)) {
            existingConv = { id: doc.id, ...data };
        }
    });

    if (existingConv) return existingConv;

    // Create new conversation
    const convData = {
        participants: [user.uid, otherUserId],
        lastMessage: '',
        lastMessageTime: serverTimestamp(),
        createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, "conversations"), convData);
    return { id: docRef.id, ...convData };
}

// ==================== NOTIFICATIONS ====================

export function subscribeToNotificationsFirestore(callback) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) return () => { };

    const q = query(
        collection(db, "notifications"),
        where("toUserId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(50)
    );

    return onSnapshot(q, (snapshot) => {
        const notifications = [];
        snapshot.forEach(doc => {
            notifications.push({ id: doc.id, ...doc.data() });
        });
        callback(notifications);
    });
}

export async function createNotificationFirestore(type, toUserId, postId = null) {
    const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
    if (!user) return;

    const notifData = {
        type: type,
        toUserId: toUserId,
        fromUserId: user.uid,
        fromUserName: user.displayName,
        fromUserPhoto: user.photoURL,
        fromUsername: user.username,
        postId: postId,
        read: false,
        createdAt: serverTimestamp()
    };

    await addDoc(collection(db, "notifications"), notifData);
}

// Check if using Firebase (vs demo mode)
export function isFirebaseMode() {
    return localStorage.getItem('rayo_firebase_user') === 'true';
}

console.log('🔥 Firestore service loaded');
