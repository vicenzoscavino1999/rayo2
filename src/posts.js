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
export async function createFirestorePost(content, mediaUrl = null, mediaType = 'image') {
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
            mediaUrl: mediaUrl,
            mediaType: mediaType, // 'image' or 'video'
            // Keep imageUrl for backward compatibility
            imageUrl: mediaType === 'image' ? mediaUrl : null,
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

// Render posts to container (with optional news integration)
export function renderPosts(posts, filterUserId = null, filterFollowing = false, createPostElement, news = []) {
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

    // If not filtering and we have news, mix them in
    const showNews = !filterFollowing && !filterUserId && news.length > 0;

    if (filteredPosts.length === 0 && !showNews) {
        container.innerHTML = '<div class="empty-state"><p>No hay publicaciones aún</p></div>';
    } else {
        // Mix news with posts for "Para ti" tab
        if (showNews) {
            let newsIndex = 0;
            const newsInterval = Math.max(2, Math.floor(filteredPosts.length / news.length) || 2);

            filteredPosts.forEach((post, index) => {
                container.appendChild(createPostElement(post));

                // Insert a news item every few posts
                if (newsIndex < news.length && (index + 1) % newsInterval === 0) {
                    const newsEl = createNewsElement(news[newsIndex]);
                    container.appendChild(newsEl);
                    newsIndex++;
                }
            });

            // Add remaining news at the end
            while (newsIndex < news.length) {
                const newsEl = createNewsElement(news[newsIndex]);
                container.appendChild(newsEl);
                newsIndex++;
            }
        } else {
            filteredPosts.forEach(post => {
                container.appendChild(createPostElement(post));
            });
        }
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Import createNewsElement for use in renderPosts
let createNewsElement = null;
export function setNewsElementCreator(creator) {
    createNewsElement = creator;
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
    // Support both new mediaUrl/mediaType and legacy imageUrl
    const mediaUrl = post.mediaUrl || post.imageUrl;
    const mediaType = post.mediaType || 'image';

    if (mediaUrl) {
        const safeMediaUrl = mediaUrl.startsWith('data:') ||
            mediaUrl.startsWith('https://') ||
            mediaUrl.startsWith('http://')
            ? mediaUrl : '';

        if (safeMediaUrl) {
            if (mediaType === 'video') {
                mediaHtml = `
                    <div class="post-media post-video">
                        <video 
                            src="${safeMediaUrl}" 
                            controls 
                            playsinline
                            preload="metadata"
                            class="post-video-player"
                        >
                            Tu navegador no soporta videos.
                        </video>
                    </div>
                `;
            } else {
                mediaHtml = `
                    <div class="post-media">
                        <img src="${safeMediaUrl}" alt="Post image">
                    </div>
                `;
            }
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

// Handle media upload preview (images and videos)
export function handleMediaUpload(file, previewContainer, removeCallback, setPendingMedia) {
    if (!file) {
        onToast?.('Por favor selecciona un archivo');
        return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
        onToast?.('Formato no soportado. Usa imágenes o videos.');
        return;
    }

    // Size limits
    const maxImageSize = 5 * 1024 * 1024; // 5MB for images
    const maxVideoSize = 15 * 1024 * 1024; // 15MB for videos

    if (isImage && file.size > maxImageSize) {
        onToast?.('La imagen es muy grande (máx 5MB)');
        return;
    }

    if (isVideo && file.size > maxVideoSize) {
        onToast?.('El video es muy grande (máx 15MB)');
        return;
    }

    if (isVideo) {
        // For videos, create object URL for preview
        const videoUrl = URL.createObjectURL(file);

        // Create a temporary video element to check duration
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = videoUrl;

        tempVideo.onloadedmetadata = () => {
            URL.revokeObjectURL(tempVideo.src);

            if (tempVideo.duration > 15) {
                onToast?.('El video debe ser de máximo 15 segundos');
                return;
            }

            // Video is valid, proceed with upload
            const reader = new FileReader();
            reader.onload = (e) => {
                const videoData = e.target.result;
                setPendingMedia({ data: videoData, type: 'video' });

                previewContainer.innerHTML = `
                    <div class="video-preview">
                        <video src="${videoData}" controls muted class="preview-video"></video>
                        <button class="remove-media-btn" type="button"><i data-lucide="x"></i></button>
                        <span class="video-badge"><i data-lucide="video"></i> Video</span>
                    </div>
                `;
                previewContainer.style.display = 'block';

                if (window.lucide) window.lucide.createIcons();

                previewContainer.querySelector('.remove-media-btn').addEventListener('click', () => {
                    setPendingMedia(null);
                    previewContainer.innerHTML = '';
                    previewContainer.style.display = 'none';
                    if (removeCallback) removeCallback();
                });
            };
            reader.readAsDataURL(file);
        };
    } else {
        // Handle image upload
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            setPendingMedia({ data: imageData, type: 'image' });

            previewContainer.innerHTML = `
                <div class="image-preview">
                    <img src="${imageData}" alt="Preview">
                    <button class="remove-media-btn" type="button"><i data-lucide="x"></i></button>
                </div>
            `;
            previewContainer.style.display = 'block';

            if (window.lucide) window.lucide.createIcons();

            previewContainer.querySelector('.remove-media-btn').addEventListener('click', () => {
                setPendingMedia(null);
                previewContainer.innerHTML = '';
                previewContainer.style.display = 'none';
                if (removeCallback) removeCallback();
            });
        };
        reader.readAsDataURL(file);
    }
}

// Legacy alias for backward compatibility
export const handleImageUpload = handleMediaUpload;
