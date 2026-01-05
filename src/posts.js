// src/posts.js - Posts CRUD, rendering, and Firestore operations
// Rayo Social Network - Modularized

import { getAuth } from 'firebase/auth';
import { sanitizeHTML, getTimeAgo, formatNumber, cloudinaryConfig, isCloudinaryConfigured, safeUrl, safeAttr, getCloudinarySignature } from '../utils.js';
import { createIcons } from 'lucide';

// Module state
let db, collection, addDoc, getDocs, query, orderBy, limit, onSnapshot,
    doc, updateDoc, deleteDoc, serverTimestamp, getDoc, setDoc,
    arrayUnion, arrayRemove, startAfter, increment, where, documentId;

let currentUser = null;
let currentFirestorePosts = [];
let unsubscribePosts = null;
let lastVisibleDoc = null;
let isLoadingMore = false;
let hasMorePosts = true;
const POSTS_PER_PAGE = 20;

// Incremental rendering state
let postsMap = new Map(); // Map<postId, { data: post, element: HTMLElement }>
let isIncrementalMode = false; // True when feed is in "Para ti" tab without filters
let currentCreatePostElement = null; // Cached reference to createPostElement function

// Feature flag: Use subcollection-based likes (Phase 3B)
const USE_SUBCOLLECTION_LIKES = true;

// Cache of user's liked posts (for rendering)
let userLikedPosts = new Set();

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
    where = firestore.where;
    documentId = firestore.documentId;

    return true;
}

// Fetch likes for a specific set of posts (Phase 3B)
async function fetchUserLikesForPosts(posts) {
    if (!currentUser || posts.length === 0) return;

    // Only needed if using subcollections
    if (!USE_SUBCOLLECTION_LIKES) return;

    try {
        const postIds = posts.map(p => p.id);
        // Process in chunks of 10 (Firestore 'in' limit is 30, but keeping it safe/small)
        const chunkSize = 10;

        for (let i = 0; i < postIds.length; i += chunkSize) {
            const chunk = postIds.slice(i, i + chunkSize);
            if (chunk.length === 0) continue;

            const q = query(
                collection(db, "users", currentUser.uid, "likes"),
                where(documentId(), "in", chunk)
            );

            const snapshot = await getDocs(q);
            snapshot.forEach(docSnap => {
                userLikedPosts.add(docSnap.id);
            });
        }
    } catch (e) {
        console.error("Error fetching user likes:", e);
    }
}

// Update current user reference
export function updateCurrentUser(user) {
    currentUser = user;
}

// Get current posts array
export function getCurrentPosts() {
    return currentFirestorePosts;
}

// Subscribe to real-time posts with incremental rendering
export function subscribeToFirestorePosts(callback) {
    onPostsUpdate = callback;

    const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(POSTS_PER_PAGE)
    );

    unsubscribePosts = onSnapshot(q, async (snapshot) => {
        // Update pagination state
        if (snapshot.docs.length > 0) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            hasMorePosts = snapshot.docs.length === POSTS_PER_PAGE;
        } else {
            hasMorePosts = false;
        }

        // Process changes incrementally if in incremental mode
        if (isIncrementalMode && currentCreatePostElement) {
            snapshot.docChanges().forEach((change) => {
                processSingleDocChange(change);
            });
            return; // Skip full re-render
        }

        // Full re-render mode (e.g. initial load or filter change)
        const posts = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            posts.push({
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
            });
        });

        currentFirestorePosts = posts;

        // Phase 3B: Fetch likes state for these posts
        if (USE_SUBCOLLECTION_LIKES && currentUser) {
            await fetchUserLikesForPosts(posts);
        }

        if (onPostsUpdate) {
            onPostsUpdate(posts);
        }
    }, (error) => {
        console.error("Error subscribing to posts:", error);
        if (onToast) onToast('Error de conexión');
    });

    return unsubscribePosts;
}

// Process a single document change (called for each change in docChanges)
function processSingleDocChange(change) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const docSnap = change.doc;
    const postId = docSnap.id;
    const data = docSnap.data();
    const post = {
        id: postId,
        ...data,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
    };

    if (change.type === 'added') {
        handlePostAdded(container, post, change.newIndex);
    } else if (change.type === 'modified') {
        handlePostModified(post);
    } else if (change.type === 'removed') {
        handlePostRemoved(postId);
    }

    // Re-render icons after changes
    if (typeof createIcons === 'function') {
        createIcons({ icons });
    }
}

// Handle a new post being added
function handlePostAdded(container, post, newIndex) {
    // Skip if already in map (can happen on initial load)
    if (postsMap.has(post.id)) return;

    const element = currentCreatePostElement(post);
    postsMap.set(post.id, { data: post, element });

    // Insert at correct position based on newIndex
    const children = container.querySelectorAll('.post:not(.news-post)');

    if (newIndex === 0) {
        // New post at top - insert before first post or at beginning
        const firstPost = container.querySelector('.post');
        if (firstPost) {
            container.insertBefore(element, firstPost);
        } else {
            container.prepend(element);
        }
    } else if (newIndex >= children.length) {
        // Append at end
        container.appendChild(element);
    } else {
        // Insert at specific position
        container.insertBefore(element, children[newIndex]);
    }
}

// Handle a post being modified (likes, comments, etc.)
function handlePostModified(post) {
    const entry = postsMap.get(post.id);
    if (!entry) return;

    // Update the data
    entry.data = post;

    // Update specific UI elements without re-creating the whole post
    const element = entry.element;
    if (!element) return;

    // Update like count and state using likeCount field (not likes array)
    const likeAction = element.querySelector('.action-heart');
    if (likeAction) {
        // Use userLikedPosts set for liked state, likeCount field for count
        const isLiked = userLikedPosts.has(post.id);
        const likeCount = post.likeCount || 0;
        likeAction.classList.toggle('active', isLiked);
        const likeSpan = likeAction.querySelector('span');
        if (likeSpan) likeSpan.textContent = likeCount;
    }

    // Update comment count
    const commentAction = element.querySelector('.action-comment span');
    if (commentAction) {
        commentAction.textContent = post.commentCount || 0;
    }

    // Update views
    const viewsSpan = element.querySelector('.post-action:nth-child(4) span');
    if (viewsSpan) {
        viewsSpan.textContent = formatNumber(post.views || 0);
    }
}

// Handle a post being removed
function handlePostRemoved(postId) {
    const entry = postsMap.get(postId);
    if (!entry) return;

    if (entry.element && entry.element.parentNode) {
        entry.element.parentNode.removeChild(entry.element);
    }

    postsMap.delete(postId);
}

// Enable incremental mode (call when showing "Para ti" unfiltered feed)
export function enableIncrementalMode(createPostElement) {
    isIncrementalMode = true;
    currentCreatePostElement = createPostElement;
    postsMap.clear();
}

// Disable incremental mode (call when switching tabs or applying filters)
export function disableIncrementalMode() {
    isIncrementalMode = false;
    postsMap.clear();
}

// Unsubscribe from posts
export function unsubscribeFromPosts() {
    if (unsubscribePosts) {
        unsubscribePosts();
        unsubscribePosts = null;
    }
    disableIncrementalMode();
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
            const element = createPostElement(post);
            container.appendChild(element);

            // Register in postsMap if in incremental mode
            if (isIncrementalMode) {
                postsMap.set(post.id, { data: post, element });
            }
        });

        createIcons({ icons });

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
export async function createFirestorePost(content, mediaData = null, mediaType = 'image') {
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

        // Upload media to Cloudinary if provided (file or already a URL)
        let mediaUrl = null;
        if (mediaData) {
            // If it's already a URL (starts with http), use it directly
            if (typeof mediaData === 'string' && (mediaData.startsWith('http://') || mediaData.startsWith('https://'))) {
                mediaUrl = mediaData;
            }
            // If it's a File object, upload to Cloudinary
            else if (mediaData instanceof File) {
                onToast?.('Subiendo media...');
                mediaUrl = await uploadToCloudinary(mediaData, mediaType);
                if (!mediaUrl) {
                    onToast?.('Error al subir media. Intenta de nuevo.');
                    return false;
                }
            }
            // If it's a data URL (base64), still accept for backward compatibility but warn
            else if (typeof mediaData === 'string' && mediaData.startsWith('data:')) {
                console.warn('Using base64 data URL - consider migrating to Cloudinary upload');
                mediaUrl = mediaData;
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

// Upload media to Cloudinary (SECURE - Signed uploads)
async function uploadToCloudinary(file, mediaType = 'image') {
    if (!isCloudinaryConfigured()) {
        console.error('Cloudinary not configured');
        return null;
    }

    try {
        // Get current user's ID token
        const auth = getAuth();
        const idToken = await auth.currentUser.getIdToken();

        // Get signature from Cloud Function (SECURITY FIX)
        const { signature, timestamp } = await getCloudinarySignature(idToken);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('signature', signature);
        formData.append('timestamp', timestamp);
        formData.append('api_key', import.meta.env.VITE_CLOUDINARY_API_KEY);

        // Use different endpoint for video vs image
        const resourceType = mediaType === 'video' ? 'video' : 'image';
        const endpoint = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`;

        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return null;
    }
}

// Toggle like on a post
export async function toggleFirestoreLike(postId) {
    try {
        if (USE_SUBCOLLECTION_LIKES) {
            // ============================================================
            // NEW: Subcollection-based like (Phase 3B)
            // Create/delete doc in users/{me}/likes/{postId}
            // Cloud Functions handle likeCount updates
            // ============================================================
            const likeDocRef = doc(db, "users", currentUser.uid, "likes", postId);
            const likeDoc = await getDoc(likeDocRef);
            const isLiked = likeDoc.exists();

            if (isLiked) {
                await deleteDoc(likeDocRef);
                userLikedPosts.delete(postId);
            } else {
                await setDoc(likeDocRef, { createdAt: serverTimestamp() });
                userLikedPosts.add(postId);
            }

            return !isLiked;
        } else {
            // LEGACY: Array-based like
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
        }
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

    createIcons({ icons });
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

    // FIX #5: Use likeCount and userLikedPosts instead of post.likes array
    // Supports both new subcollection model and legacy array model
    const isLiked = USE_SUBCOLLECTION_LIKES
        ? userLikedPosts.has(post.id)
        : post.likes?.includes(currentUser?.uid);
    const likeCount = post.likeCount ?? post.likes?.length ?? 0;
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
        // Use safeUrl with strict validation for media
        const safeMediaUrl = safeUrl(mediaUrl, '');

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
                        <img src="${safeMediaUrl}" alt="Post image" loading="lazy">
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
            <img src="${safeUrl(post.authorPhoto, 'https://api.dicebear.com/7.x/avataaars/svg?seed=user')}" alt="${safeAttr(post.authorName)}" class="avatar-small post-avatar" data-user-id="${post.authorId}">
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
    formatted = formatted.replace(/#(\w+)/g, '<a href="#" class="hashtag" data-tag="$1">#$1</a>');
    formatted = formatted.replace(/@(\w+)/g, '<a href="#" class="mention" data-username="$1">@$1</a>');
    return formatted;
}

// Handle media upload preview (images and videos)
// Now stores File object instead of base64 - actual upload to Cloudinary happens in createFirestorePost
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

    const mediaType = isVideo ? 'video' : 'image';

    if (isVideo) {
        // For videos, create object URL for preview and check duration
        const videoUrl = URL.createObjectURL(file);

        // Create a temporary video element to check duration
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = videoUrl;

        tempVideo.onloadedmetadata = () => {
            if (tempVideo.duration > 15) {
                URL.revokeObjectURL(videoUrl);
                onToast?.('El video debe ser de máximo 15 segundos');
                return;
            }

            // Video is valid - store File object, not base64
            setPendingMedia({ file: file, type: 'video', previewUrl: videoUrl });

            previewContainer.innerHTML = `
                <div class="video-preview">
                    <video src="${videoUrl}" controls muted class="preview-video"></video>
                    <button class="remove-media-btn" type="button"><i data-lucide="x"></i></button>
                    <span class="video-badge"><i data-lucide="video"></i> Video</span>
                </div>
            `;
            previewContainer.style.display = 'block';

            createIcons({ icons });

            previewContainer.querySelector('.remove-media-btn').addEventListener('click', () => {
                URL.revokeObjectURL(videoUrl);
                setPendingMedia(null);
                previewContainer.innerHTML = '';
                previewContainer.style.display = 'none';
                if (removeCallback) removeCallback();
            });
        };
    } else {
        // Handle image upload - use object URL for preview, store File
        const imageUrl = URL.createObjectURL(file);

        // Store File object, not base64
        setPendingMedia({ file: file, type: 'image', previewUrl: imageUrl });

        previewContainer.innerHTML = `
            <div class="image-preview">
                <img src="${imageUrl}" alt="Preview">
                <button class="remove-media-btn" type="button"><i data-lucide="x"></i></button>
            </div>
        `;
        previewContainer.style.display = 'block';

        createIcons({ icons });

        previewContainer.querySelector('.remove-media-btn').addEventListener('click', () => {
            URL.revokeObjectURL(imageUrl);
            setPendingMedia(null);
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
            if (removeCallback) removeCallback();
        });
    }
}

// Legacy alias for backward compatibility
export const handleImageUpload = handleMediaUpload;
