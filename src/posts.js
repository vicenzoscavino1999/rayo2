// src/posts.js - Posts CRUD, rendering, and Firestore operations
// Rayo Social Network - Modularized

import { sanitizeHTML, getTimeAgo, formatNumber } from '../utils.js';

// Module state
let db, collection, addDoc, getDocs, query, orderBy, limit, onSnapshot,
    doc, updateDoc, deleteDoc, serverTimestamp, getDoc, setDoc,
    arrayUnion, arrayRemove, startAfter, increment;

let currentUser = null;
let currentFirestorePosts = [];
let unsubscribePosts = null;
let lastVisibleDoc = null;
let isLoadingMore = false;
let hasMorePosts = true;
const POSTS_PER_PAGE = 20;

// Callbacks for UI updates
let onPostsUpdate = null;
let onToast = null;

// Initialize Firestore references
export async function initPostsModule(user, toastCallback) {
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
    onSnapshot = firestore.onSnapshot;
    doc = firestore.doc;
    updateDoc = firestore.updateDoc;
    deleteDoc = firestore.deleteDoc;
    serverTimestamp = firestore.serverTimestamp;
    getDoc = firestore.getDoc;
    setDoc = firestore.setDoc;
    arrayUnion = firestore.arrayUnion;
    arrayRemove = firestore.arrayRemove;
    startAfter = firestore.startAfter;
    increment = firestore.increment;

    return true;
}

// Update current user reference
export function updateCurrentUser(user) {
    currentUser = user;
}

// Get current posts array
export function getCurrentPosts() {
    return currentFirestorePosts;
}

// Subscribe to real-time posts
export function subscribeToFirestorePosts(callback) {
    onPostsUpdate = callback;

    const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(POSTS_PER_PAGE)
    );

    unsubscribePosts = onSnapshot(q, (snapshot) => {
        const posts = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            posts.push({
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
            });
        });

        if (snapshot.docs.length > 0) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            hasMorePosts = snapshot.docs.length === POSTS_PER_PAGE;
        } else {
            hasMorePosts = false;
        }

        currentFirestorePosts = posts;

        if (onPostsUpdate) {
            onPostsUpdate(posts);
        }
    }, (error) => {
        console.error('Error subscribing to posts:', error);
    });

    return unsubscribePosts;
}

// Unsubscribe from posts
export function unsubscribeFromPosts() {
    if (unsubscribePosts) {
        unsubscribePosts();
        unsubscribePosts = null;
    }
}

// Load more posts for infinite scroll
export async function loadMorePosts(container, createPostElement) {
    if (!lastVisibleDoc || isLoadingMore || !hasMorePosts) return;

    isLoadingMore = true;
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'block';

    try {
        const q = query(
            collection(db, "posts"),
            orderBy("createdAt", "desc"),
            startAfter(lastVisibleDoc),
            limit(POSTS_PER_PAGE)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            hasMorePosts = false;
            if (loader) loader.style.display = 'none';
            isLoadingMore = false;
            return;
        }

        const newPosts = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            newPosts.push({
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
            });
        });

        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMorePosts = snapshot.docs.length === POSTS_PER_PAGE;

        currentFirestorePosts = [...currentFirestorePosts, ...newPosts];

        newPosts.forEach(post => {
            container.appendChild(createPostElement(post));
        });

        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (error) {
        console.error('Error loading more posts:', error);
    } finally {
        if (loader) loader.style.display = 'none';
        isLoadingMore = false;
    }
}

// Setup intersection observer for infinite scroll
export function setupInfiniteScroll(createPostElement) {
    const loader = document.getElementById('loader');
    if (!loader) return;

    const container = document.getElementById('posts-container');

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMorePosts && !isLoadingMore) {
            loadMorePosts(container, createPostElement);
        }
    }, { threshold: 0.1 });

    observer.observe(loader);
}

// Create a new post
export async function createFirestorePost(content, imageUrl = null) {
    if (!content || content.trim().length === 0) {
        onToast?.('El post no puede estar vacío');
        return false;
    }

    if (content.length > 500) {
        onToast?.('El post es muy largo (máx 500 caracteres)');
        return false;
    }

    try {
        // Check rate limit
        const rateLimitRef = doc(db, "rateLimits", currentUser.uid, "posts", "limit");
        const rateLimitSnap = await getDoc(rateLimitRef);

        if (rateLimitSnap.exists()) {
            const lastPost = rateLimitSnap.data().lastAction?.toMillis() || 0;
            const tenSecondsAgo = Date.now() - 10000;

            if (lastPost > tenSecondsAgo) {
                const waitTime = Math.ceil((lastPost - tenSecondsAgo) / 1000);
                onToast?.(`Espera ${waitTime}s antes de publicar de nuevo`);
                return false;
            }
        }

        const postData = {
            authorId: currentUser.uid,
            authorName: currentUser.displayName,
            authorUsername: currentUser.username,
            authorPhoto: currentUser.photoURL,
            verified: false,
            content: content,
            imageUrl: imageUrl,
            likes: [],
            reposts: [],
            commentCount: 0,
            views: 0,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "posts"), postData);
        await setDoc(rateLimitRef, { lastAction: serverTimestamp() });

        onToast?.('¡Publicación creada!');
        return true;
    } catch (error) {
        console.error('Error creating post:', error);
        if (error.code === 'permission-denied') {
            onToast?.('Espera unos segundos antes de publicar de nuevo');
        } else {
            onToast?.('Error al publicar. Intenta de nuevo.');
        }
        return false;
    }
}

// Toggle like on a post
export async function toggleFirestoreLike(postId) {
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) return false;

        const postData = postSnap.data();
        const likes = postData.likes || [];
        const isLiked = likes.includes(currentUser.uid);

        if (isLiked) {
            await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
        }

        return !isLiked;
    } catch (error) {
        console.error('Error toggling like:', error);
        return false;
    }
}

// Delete a post
export async function deleteFirestorePost(postId) {
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (postSnap.exists() && postSnap.data().authorId === currentUser.uid) {
            await deleteDoc(postRef);
            onToast?.('Publicación eliminada');
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error deleting post:', error);
        return false;
    }
}

// Render posts to container
export function renderPosts(posts, filterUserId = null, filterFollowing = false, createPostElement) {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';

    let filteredPosts = [...posts];

    if (filterUserId) {
        filteredPosts = filteredPosts.filter(p => p.authorId === filterUserId);
    }

    if (filterFollowing && currentUser) {
        const following = currentUser.following || [];
        filteredPosts = filteredPosts.filter(p => following.includes(p.authorId) || p.authorId === currentUser.uid);
    }

    filteredPosts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (filteredPosts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No hay publicaciones aún</p></div>';
    } else {
        filteredPosts.forEach(post => {
            container.appendChild(createPostElement(post));
        });
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Create post HTML element
export function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'post';
    article.dataset.postId = post.id;

    const timeAgo = getTimeAgo(post.createdAt);
    const isLiked = post.likes?.includes(currentUser?.uid);
    const likeCount = post.likes?.length || 0;
    const commentCount = typeof post.commentCount === 'number' ? post.commentCount : 0;

    const safeName = sanitizeHTML(post.authorName);
    const safeUsername = sanitizeHTML(post.authorUsername);

    let verifiedIcon = '';
    if (post.verified) {
        const colorClass = post.verifiedColor === 'blue' ? 'blue' : '';
        verifiedIcon = `<i data-lucide="check-circle" class="verified-icon ${colorClass}"></i>`;
    }

    let mediaHtml = '';
    if (post.imageUrl) {
        const safeImageUrl = post.imageUrl.startsWith('data:image/') ||
            post.imageUrl.startsWith('https://') ||
            post.imageUrl.startsWith('http://')
            ? post.imageUrl : '';
        if (safeImageUrl) {
            mediaHtml = `
                <div class="post-media">
                    <img src="${safeImageUrl}" alt="Post image">
                </div>
            `;
        }
    }

    const isOwnPost = post.authorId === currentUser?.uid;
    const optionsHtml = isOwnPost ?
        `<i data-lucide="trash-2" class="post-delete" data-post-id="${post.id}"></i>` :
        `<i data-lucide="more-horizontal" class="post-options"></i>`;

    article.innerHTML = `
        <div class="post-layout">
            <img src="${sanitizeHTML(post.authorPhoto)}" alt="${safeName}" class="avatar-small post-avatar" data-user-id="${post.authorId}">
            <div class="post-body">
                <header class="post-header">
                    <span class="post-user-name clickable-user" data-user-id="${post.authorId}">${safeName} ${verifiedIcon}</span>
                    <span class="post-user-handle">@${safeUsername}</span>
                    <span class="post-time">· ${timeAgo}</span>
                    ${optionsHtml}
                </header>
                <div class="post-content">
                    ${formatContent(post.content)}
                </div>
                ${mediaHtml}
                <footer class="post-footer">
                    <div class="post-action action-comment" data-post-id="${post.id}"><i data-lucide="message-circle"></i> <span>${commentCount}</span></div>
                    <div class="post-action action-repost"><i data-lucide="repeat"></i> <span>${post.reposts?.length || 0}</span></div>
                    <div class="post-action action-heart ${isLiked ? 'active' : ''}" data-post-id="${post.id}">
                        <i data-lucide="heart"></i> <span>${likeCount}</span>
                    </div>
                    <div class="post-action"><i data-lucide="bar-chart-2"></i> <span>${formatNumber(post.views || 0)}</span></div>
                    <div class="post-action action-share" data-post-id="${post.id}"><i data-lucide="share"></i></div>
                </footer>
            </div>
        </div>
    `;

    return article;
}

// Format post content with hashtags and mentions
export function formatContent(content) {
    let sanitized = sanitizeHTML(content);
    let formatted = sanitized.replace(/\n/g, '<br>');
    formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    formatted = formatted.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return formatted;
}

// Handle image upload preview
export function handleImageUpload(file, previewContainer, removeCallback, setPendingImage) {
    if (!file || !file.type.startsWith('image/')) {
        onToast?.('Por favor selecciona una imagen válida');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        onToast?.('La imagen es muy grande (máx 5MB)');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        setPendingImage(imageData);

        previewContainer.innerHTML = `
            <div class="image-preview">
                <img src="${imageData}" alt="Preview">
                <button class="remove-image-btn" type="button"><i data-lucide="x"></i></button>
            </div>
        `;
        previewContainer.style.display = 'block';

        if (window.lucide) {
            window.lucide.createIcons();
        }

        previewContainer.querySelector('.remove-image-btn').addEventListener('click', () => {
            setPendingImage(null);
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
            if (removeCallback) removeCallback();
        });
    };
    reader.readAsDataURL(file);
}
