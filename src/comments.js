// src/comments.js - Comments system for posts
// Rayo Social Network - Modularized

import { sanitizeHTML, getTimeAgo } from '../utils.js';

// Module state
let db, collection, addDoc, getDocs, query, orderBy, limit, doc, updateDoc, serverTimestamp, increment;
let currentUser = null;
let selectedPostId = null;
let onToast = null;

// Initialize comments module
export async function initCommentsModule(user, toastCallback) {
    currentUser = user;
    onToast = toastCallback;

    const firestore = await import("firebase/firestore");
    const firebaseConfig = await import('../firebase-config.js');

    db = firebaseConfig.db;
    collection = firestore.collection;
    addDoc = firestore.addDoc;
    getDocs = firestore.getDocs;
    query = firestore.query;
    orderBy = firestore.orderBy;
    limit = firestore.limit;
    doc = firestore.doc;
    updateDoc = firestore.updateDoc;
    serverTimestamp = firestore.serverTimestamp;
    increment = firestore.increment;

    return true;
}

// Update current user reference
export function updateCurrentUser(user) {
    currentUser = user;
}

// Get selected post ID
export function getSelectedPostId() {
    return selectedPostId;
}

// Add comment to post subcollection
export async function addFirestoreComment(postId, content) {
    try {
        const postRef = doc(db, "posts", postId);
        const commentsRef = collection(db, "posts", postId, "comments");

        const commentData = {
            authorId: currentUser.uid,
            authorName: currentUser.displayName,
            authorUsername: currentUser.username,
            authorPhoto: currentUser.photoURL,
            content: content,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(commentsRef, commentData);

        await updateDoc(postRef, {
            commentCount: increment(1)
        });

        return { id: docRef.id, ...commentData, createdAt: Date.now() };
    } catch (error) {
        console.error('Error adding comment:', error);
        return null;
    }
}

// Load comments from subcollection
export async function loadCommentsForPost(postId) {
    try {
        const commentsRef = collection(db, "posts", postId, "comments");
        const q = query(commentsRef, orderBy("createdAt", "asc"), limit(50));
        const snapshot = await getDocs(q);

        const comments = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            comments.push({
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
            });
        });
        return comments;
    } catch (error) {
        console.error('Error loading comments:', error);
        return [];
    }
}

// Open comment modal
export async function openCommentModal(postId, createPostElement, posts) {
    selectedPostId = postId;
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById('comment-modal-overlay');
    const container = document.getElementById('comment-post-container');
    const commentsContainer = document.getElementById('comments-container');

    container.innerHTML = '';
    container.appendChild(createPostElement(post));

    commentsContainer.innerHTML = '<div class="loading-comments"><i data-lucide="loader-2" class="spin"></i> Cargando...</div>';
    if (window.lucide) window.lucide.createIcons();

    const comments = await loadCommentsForPost(postId);
    commentsContainer.innerHTML = '';

    if (comments.length === 0) {
        commentsContainer.innerHTML = '<div class="no-comments">Sé el primero en comentar</div>';
    } else {
        comments.forEach(comment => {
            commentsContainer.appendChild(createCommentElement(comment));
        });
    }

    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => document.getElementById('comment-textarea')?.focus(), 100);
}

// Create comment HTML element
export function createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = 'comment';

    const safeName = sanitizeHTML(comment.authorName);
    const safeUsername = sanitizeHTML(comment.authorUsername);
    const safeContent = sanitizeHTML(comment.content);
    const safePhoto = sanitizeHTML(comment.authorPhoto);

    div.innerHTML = `
        <img src="${safePhoto}" alt="${safeName}" class="avatar-tiny">
        <div class="comment-body">
            <div class="comment-header">
                <span class="comment-author">${safeName}</span>
                <span class="comment-handle">@${safeUsername}</span>
                <span class="comment-time">· ${getTimeAgo(comment.createdAt)}</span>
            </div>
            <div class="comment-content">${safeContent}</div>
        </div>
    `;
    return div;
}

// Close comment modal
export function closeCommentModal() {
    document.getElementById('comment-modal-overlay')?.classList.remove('active');
    const textarea = document.getElementById('comment-textarea');
    if (textarea) textarea.value = '';
    const postBtn = document.getElementById('comment-post-btn');
    if (postBtn) postBtn.disabled = true;
    selectedPostId = null;
}

// Add comment handler
export async function addComment(content, createPostElement, posts) {
    if (!selectedPostId || !content.trim()) return;

    const comment = await addFirestoreComment(selectedPostId, content.trim());
    if (comment) {
        setTimeout(() => {
            openCommentModal(selectedPostId, createPostElement, posts);
        }, 500);
    }

    const textarea = document.getElementById('comment-textarea');
    if (textarea) textarea.value = '';
    const postBtn = document.getElementById('comment-post-btn');
    if (postBtn) postBtn.disabled = true;
}
