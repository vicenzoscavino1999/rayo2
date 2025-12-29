// app.js - Rayo Social Network
// Main application with Firestore for multi-user

// Import shared utilities
import { sanitizeHTML, getTimeAgo, formatNumber, safeText, cloudinaryConfig, getCloudinaryUploadUrl } from './utils.js';

const isFirebaseMode = true;
let firestoreService = null;
let unsubscribePosts = null;
let firestoreReady = false;
let currentFirestorePosts = [];

// Firebase imports for Firestore mode
let db, collection, addDoc, getDocs, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, where, getDoc, setDoc, arrayUnion, arrayRemove, startAfter, increment;

// Pagination config
const POSTS_PER_PAGE = 20;
let lastVisiblePost = null;
let isLoadingMore = false;
let hasMorePosts = true;

// Load Firestore if in Firebase mode
async function initFirestore() {
    // Always load Firestore

    try {
        const firebaseConfig = await import('./firebase-config.js');
        db = firebaseConfig.db;

        const firestore = await import("firebase/firestore");
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
        where = firestore.where;
        getDoc = firestore.getDoc;
        setDoc = firestore.setDoc;
        arrayUnion = firestore.arrayUnion;
        arrayRemove = firestore.arrayRemove;
        startAfter = firestore.startAfter;
        increment = firestore.increment;

        firestoreReady = true;
        console.log('🔥 Firestore mode enabled - Posts will sync in real-time');
        return true;
    } catch (err) {
        console.warn('Firestore not available, using localStorage:', err.message);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // ==================== CHECK AUTH ====================
    // First check localStorage for quick UI render
    const demoUser = JSON.parse(localStorage.getItem('rayo_demo_user') || 'null');

    // Quick check - if no localStorage user, redirect immediately
    if (!demoUser || !demoUser.uid) {
        console.warn('No user found in localStorage, redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    // Initialize icons immediately to avoid visual glitches
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // ==================== VERIFY FIREBASE AUTH STATE ====================
    // Import and verify real Firebase auth state
    try {
        const { auth, onAuthChange } = await import('./firebase-config.js');

        // Verify that Firebase auth matches localStorage
        onAuthChange((firebaseUser) => {
            if (!firebaseUser) {
                // Firebase says no user - localStorage is stale, clean up and redirect
                console.warn('Firebase auth invalid, cleaning up and redirecting');
                localStorage.removeItem('rayo_demo_mode');
                localStorage.removeItem('rayo_demo_user');
                localStorage.removeItem('rayo_firebase_user');
                window.location.href = 'login.html';
                return;
            }

            // Optionally sync localStorage with latest Firebase data
            const storedUser = JSON.parse(localStorage.getItem('rayo_demo_user') || '{}');
            if (storedUser.uid !== firebaseUser.uid) {
                // Mismatch - update localStorage with real Firebase user
                localStorage.setItem('rayo_demo_user', JSON.stringify({
                    uid: firebaseUser.uid,
                    displayName: firebaseUser.displayName || storedUser.displayName,
                    username: storedUser.username || firebaseUser.email?.split('@')[0],
                    photoURL: firebaseUser.photoURL || storedUser.photoURL,
                    email: firebaseUser.email
                }));
            }
        });
    } catch (err) {
        console.warn('Could not verify Firebase auth state:', err.message);
    }

    // ==================== INITIALIZE APP ====================
    const currentUser = demoUser;
    let currentView = 'feed';
    let selectedPostId = null;
    let pendingImageData = null; // For image upload

    // Initialize user following list if not exists
    if (!currentUser.following) {
        currentUser.following = [];
        localStorage.setItem('rayo_demo_user', JSON.stringify(currentUser));
    }

    updateUserUI(currentUser);

    // Initialize Firestore
    const firestoreLoaded = await initFirestore();

    // Use Firestore
    if (firestoreLoaded) {
        // Subscribe to real-time posts from Firestore
        subscribeToFirestorePosts();
    } else {
        console.error("Failed to load Firestore");
    }

    updateNotificationBadge();
    lucide.createIcons();

    // Check URL params for initial navigation
    const urlParams = new URLSearchParams(window.location.search);
    const initialView = urlParams.get('view');

    if (initialView === 'profile') {
        setTimeout(() => {
            showProfile(currentUser.uid);
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById('nav-profile').classList.add('active');
        }, 100);
    } else if (initialView === 'notifications') {
        setTimeout(() => {
            showNotifications();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            // Select notifications item (3rd link)
            document.querySelectorAll('.nav-item')[2]?.classList.add('active');
        }, 100);
    } else if (initialView === 'explore') {
        setTimeout(() => {
            showExplore();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            // Select explore item (2nd link)
            document.querySelectorAll('.nav-item')[1]?.classList.add('active');
        }, 100);
    }

    // ==================== FIRESTORE POSTS ====================
    let lastVisibleDoc = null; // For pagination

    function subscribeToFirestorePosts() {
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

            // Save last document for pagination
            if (snapshot.docs.length > 0) {
                lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
                hasMorePosts = snapshot.docs.length === POSTS_PER_PAGE;
            } else {
                hasMorePosts = false;
            }

            currentFirestorePosts = posts;
            renderPosts(posts);

            // Setup infinite scroll after first load
            setupInfiniteScroll();
        }, (error) => {
            console.error('Error subscribing to posts:', error);
        });
    }

    // Load more posts for infinite scroll
    async function loadMorePosts() {
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

            // Update last visible for next pagination
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            hasMorePosts = snapshot.docs.length === POSTS_PER_PAGE;

            // Append to current posts
            currentFirestorePosts = [...currentFirestorePosts, ...newPosts];

            // Append to DOM (don't re-render all)
            const container = document.getElementById('posts-container');
            newPosts.forEach(post => {
                container.appendChild(createPostElement(post));
            });
            lucide.createIcons();

        } catch (error) {
            console.error('Error loading more posts:', error);
        } finally {
            if (loader) loader.style.display = 'none';
            isLoadingMore = false;
        }
    }

    // Setup intersection observer for infinite scroll
    function setupInfiniteScroll() {
        const loader = document.getElementById('loader');
        if (!loader) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMorePosts && !isLoadingMore) {
                loadMorePosts();
            }
        }, { threshold: 0.1 });

        observer.observe(loader);
    }

    // ==================== FIRESTORE OPERATIONS ====================

    async function createFirestorePost(content, imageUrl = null) {
        // Validate content length
        if (!content || content.trim().length === 0) {
            showToast('El post no puede estar vacío');
            return;
        }

        if (content.length > 500) {
            showToast('El post es muy largo (máx 500 caracteres)');
            return;
        }

        try {
            // Check rate limit (optional - can also rely on Firestore Rules)
            const rateLimitRef = doc(db, "rateLimits", currentUser.uid, "posts", "limit");
            const rateLimitSnap = await getDoc(rateLimitRef);

            if (rateLimitSnap.exists()) {
                const lastPost = rateLimitSnap.data().lastAction?.toMillis() || 0;
                const tenSecondsAgo = Date.now() - 10000;

                if (lastPost > tenSecondsAgo) {
                    const waitTime = Math.ceil((lastPost - tenSecondsAgo) / 1000);
                    showToast(`Espera ${waitTime}s antes de publicar de nuevo`);
                    return;
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
                views: 0, // Start at 0, not random
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, "posts"), postData);

            // Update rate limit timestamp
            await setDoc(rateLimitRef, { lastAction: serverTimestamp() });

            showToast('¡Publicación creada!');
        } catch (error) {
            console.error('Error creating post:', error);
            if (error.code === 'permission-denied') {
                showToast('Espera unos segundos antes de publicar de nuevo');
            } else {
                showToast('Error al publicar. Intenta de nuevo.');
            }
        }
    }

    async function toggleFirestoreLike(postId) {
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

    async function deleteFirestorePost(postId) {
        try {
            const postRef = doc(db, "posts", postId);
            const postSnap = await getDoc(postRef);

            if (postSnap.exists() && postSnap.data().authorId === currentUser.uid) {
                await deleteDoc(postRef);
                showToast('Publicación eliminada');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting post:', error);
            return false;
        }
    }

    // Add comment to subcollection (scalable)
    async function addFirestoreComment(postId, content) {
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

            // Add to subcollection
            const docRef = await addDoc(commentsRef, commentData);

            // Increment counter on post document
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
    async function loadCommentsForPost(postId) {
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

    // ==================== USER UI ====================
    function updateUserUI(user) {
        document.getElementById('sidebar-avatar').src = user.photoURL;
        document.getElementById('sidebar-name').textContent = user.displayName;
        document.getElementById('sidebar-handle').textContent = '@' + user.username;
        document.getElementById('composer-avatar').src = user.photoURL;
        document.getElementById('modal-avatar').src = user.photoURL;
    }

    // ==================== FOLLOWERS ====================
    function getUsers() {
        const defaultUsers = [
            { uid: 'user-ana', displayName: 'Ana García', username: 'ana_dev', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana', verified: true, verifiedColor: 'gold', bio: 'Frontend Developer 🚀', followers: ['user-carlos'], following: ['user-carlos', 'user-design'] },
            { uid: 'user-carlos', displayName: 'Carlos Tech', username: 'carlostech', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos', verified: true, verifiedColor: 'blue', bio: 'Software Engineer | Clean Code Advocate', followers: ['user-ana'], following: ['user-ana'] },
            { uid: 'user-design', displayName: 'Design Daily', username: 'designdaily', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Design', verified: false, bio: 'UI/UX Design Tips ✨', followers: ['user-ana'], following: [] },
            { uid: 'user-david', displayName: 'David Dev', username: 'david_ui', photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David', verified: false, bio: 'Building cool stuff', followers: [], following: [] }
        ];

        let users = JSON.parse(localStorage.getItem('rayo_users') || 'null');
        if (!users) {
            users = defaultUsers;
            localStorage.setItem('rayo_users', JSON.stringify(users));
        }
        return users;
    }

    function saveUsers(users) {
        localStorage.setItem('rayo_users', JSON.stringify(users));
    }

    function getUserById(userId) {
        const users = getUsers();
        return users.find(u => u.uid === userId);
    }

    function isFollowing(userId) {
        const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
        return user.following && user.following.includes(userId);
    }

    function toggleFollow(userId) {
        if (userId === currentUser.uid) return; // Can't follow yourself

        const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
        if (!user.following) user.following = [];

        const users = getUsers();
        const targetUser = users.find(u => u.uid === userId);
        if (!targetUser) return;
        if (!targetUser.followers) targetUser.followers = [];

        const isCurrentlyFollowing = user.following.includes(userId);

        if (isCurrentlyFollowing) {
            // Unfollow
            user.following = user.following.filter(id => id !== userId);
            targetUser.followers = targetUser.followers.filter(id => id !== currentUser.uid);
            showToast('Dejaste de seguir a ' + targetUser.displayName);
        } else {
            // Follow
            user.following.push(userId);
            targetUser.followers.push(currentUser.uid);
            addNotification('follow', currentUser, null);
            showToast('Ahora sigues a ' + targetUser.displayName);
        }

        // Update localStorage
        localStorage.setItem('rayo_demo_user', JSON.stringify(user));
        saveUsers(users);

        // Update currentUser reference
        currentUser.following = user.following;

        return !isCurrentlyFollowing;
    }

    // ==================== NOTIFICATIONS ====================
    function getNotifications() {
        return JSON.parse(localStorage.getItem('rayo_notifications') || '[]');
    }

    function saveNotifications(notifications) {
        localStorage.setItem('rayo_notifications', JSON.stringify(notifications));
    }

    function addNotification(type, fromUser, postId = null) {
        const notifications = getNotifications();
        const notification = {
            id: 'notif-' + Date.now(),
            type: type,
            fromUserId: fromUser.uid || fromUser.authorId,
            fromUserName: fromUser.displayName || fromUser.authorName,
            fromUserPhoto: fromUser.photoURL || fromUser.authorPhoto,
            fromUsername: fromUser.username || fromUser.authorUsername,
            postId: postId,
            read: false,
            createdAt: Date.now()
        };
        notifications.unshift(notification);
        saveNotifications(notifications);
        updateNotificationBadge();
    }

    function updateNotificationBadge() {
        const notifications = getNotifications();
        const unreadCount = notifications.filter(n => !n.read).length;
        const badge = document.getElementById('notification-badge');
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    // ==================== POSTS STORAGE ====================


    // ==================== IMAGE UPLOAD ====================
    function handleImageUpload(file, previewContainer, removeCallback) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Por favor selecciona una imagen válida');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('La imagen es muy grande (máx 5MB)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            pendingImageData = e.target.result;

            // Show preview
            previewContainer.innerHTML = `
                <div class="image-preview">
                    <img src="${pendingImageData}" alt="Preview">
                    <button class="remove-image-btn" type="button"><i data-lucide="x"></i></button>
                </div>
            `;
            previewContainer.style.display = 'block';
            lucide.createIcons();

            // Remove button handler
            previewContainer.querySelector('.remove-image-btn').addEventListener('click', () => {
                pendingImageData = null;
                previewContainer.innerHTML = '';
                previewContainer.style.display = 'none';
                if (removeCallback) removeCallback();
            });
        };
        reader.readAsDataURL(file);
    }

    // ==================== RENDER POSTS ====================
    // Core render function used by both localStorage and Firestore modes
    function renderPosts(posts, filterUserId = null, filterFollowing = false) {
        const container = document.getElementById('posts-container');
        container.innerHTML = '';

        let filteredPosts = [...posts];

        if (filterUserId) {
            filteredPosts = filteredPosts.filter(p => p.authorId === filterUserId);
        }

        if (filterFollowing) {
            const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
            const following = user.following || [];
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

        lucide.createIcons();
    }

    // Render posts based on current data
    function loadPosts(filterUserId = null, filterFollowing = false) {
        const posts = isFirebaseMode ? currentFirestorePosts : getPosts();
        renderPosts(posts, filterUserId, filterFollowing);
    }

    function createPostElement(post) {
        const article = document.createElement('article');
        article.className = 'post';
        article.dataset.postId = post.id;

        const timeAgo = getTimeAgo(post.createdAt);
        const isLiked = post.likes.includes(currentUser.uid);
        const likeCount = post.likes.length;
        // Use commentCount (number) for scalability instead of comments array
        const commentCount = typeof post.commentCount === 'number' ? post.commentCount : 0;

        // Sanitize user-generated content to prevent XSS
        const safeName = sanitizeHTML(post.authorName);
        const safeUsername = sanitizeHTML(post.authorUsername);

        let verifiedIcon = '';
        if (post.verified) {
            const colorClass = post.verifiedColor === 'blue' ? 'blue' : '';
            verifiedIcon = `<i data-lucide="check-circle" class="verified-icon ${colorClass}"></i>`;
        }

        let mediaHtml = '';
        if (post.imageUrl) {
            // Sanitize image URL to prevent javascript: protocol attacks
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

        const isOwnPost = post.authorId === currentUser.uid;
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
                        <div class="post-action action-repost"><i data-lucide="repeat"></i> <span>${post.reposts.length}</span></div>
                        <div class="post-action action-heart ${isLiked ? 'active' : ''}" data-post-id="${post.id}">
                            <i data-lucide="heart"></i> <span>${likeCount}</span>
                        </div>
                        <div class="post-action"><i data-lucide="bar-chart-2"></i> <span>${formatNumber(post.views)}</span></div>
                        <div class="post-action action-share" data-post-id="${post.id}"><i data-lucide="share"></i></div>
                    </footer>
                </div>
            </div>
        `;

        return article;
    }

    // ==================== CONTENT FORMATTING ====================
    // Note: sanitizeHTML, safeText, getTimeAgo, formatNumber are imported from utils.js

    function formatContent(content) {
        // First, sanitize to prevent XSS attacks
        let sanitized = sanitizeHTML(content);

        // Then apply formatting (safe because we sanitized first)
        let formatted = sanitized.replace(/\n/g, '<br>');
        formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
        formatted = formatted.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        return formatted;
    }

    // ==================== COMMENTS ====================
    async function openCommentModal(postId) {
        selectedPostId = postId;
        const post = currentFirestorePosts.find(p => p.id === postId);
        if (!post) return;

        const modal = document.getElementById('comment-modal-overlay');
        const container = document.getElementById('comment-post-container');
        const commentsContainer = document.getElementById('comments-container');

        container.innerHTML = '';
        container.appendChild(createPostElement(post));

        // Show loading state
        commentsContainer.innerHTML = '<div class="loading-comments"><i data-lucide="loader-2" class="spin"></i> Cargando...</div>';
        lucide.createIcons();

        // Load comments from subcollection
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
        lucide.createIcons();

        setTimeout(() => document.getElementById('comment-textarea').focus(), 100);
    }

    function createCommentElement(comment) {
        const div = document.createElement('div');
        div.className = 'comment';

        // Sanitize user-generated content to prevent XSS
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

    function closeCommentModal() {
        document.getElementById('comment-modal-overlay').classList.remove('active');
        document.getElementById('comment-textarea').value = '';
        document.getElementById('comment-post-btn').disabled = true;
        selectedPostId = null;
    }

    async function addComment(content) {
        if (!selectedPostId || !content.trim()) return;

        // Use Firestore always
        const comment = await addFirestoreComment(selectedPostId, content.trim());
        if (comment) {
            // Refresh the comment modal to show the new comment
            setTimeout(() => {
                openCommentModal(selectedPostId);
            }, 500);
        }

        document.getElementById('comment-textarea').value = '';
        document.getElementById('comment-post-btn').disabled = true;
    }

    // ==================== SHOW FEED (Home View) ====================
    function showFeed() {
        // Restore header to original feed tabs
        const header = document.querySelector('.feed-header');
        header.innerHTML = `
            <div class="feed-tabs">
                <div class="tab active" data-tab="para-ti">Para ti</div>
                <div class="tab" data-tab="siguiendo">Siguiendo</div>
            </div>
            <div class="header-settings">
                <i data-lucide="settings"></i>
            </div>
        `;

        // Show composer again
        const composer = document.querySelector('.composer');
        if (composer) {
            composer.style.display = 'block';
        }

        // Clear posts container and reload posts
        const container = document.getElementById('posts-container');
        container.innerHTML = '<div class="loading-spinner"><i data-lucide="loader-2" class="animate-spin"></i></div>';

        // Re-render icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

        // Re-subscribe to posts / render cached posts
        if (currentFirestorePosts.length > 0) {
            renderPosts(currentFirestorePosts);
        } else if (firestoreReady) {
            subscribeToFirestorePosts();
        }

        // Update nav active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.getElementById('nav-home')?.classList.add('active');
    }

    // ==================== PROFILE ====================
    async function showProfile(userId) {
        currentView = 'profile';
        const container = document.getElementById('posts-container');

        // Show loading state
        container.innerHTML = '<div class="loading-spinner"><i data-lucide="loader-2" class="animate-spin"></i></div>';
        lucide.createIcons();

        try {
            // 1. Fetch User Data
            const userRef = doc(db, "users", userId);
            const userSnap = await getDoc(userRef);

            let userInfo;
            if (!userSnap.exists()) {
                // Try to see if it's the current user but doc is missing (shouldn't happen but fallback)
                if (userId === currentUser.uid) {
                    userInfo = { ...currentUser }; // Fallback to auth object
                } else {
                    container.innerHTML = '<div class="error-message">Usuario no encontrado</div>';
                    return;
                }
            } else {
                userInfo = userSnap.data();
                userInfo.uid = userId;
            }

            // Ensure defaults
            userInfo = {
                uid: userId,
                displayName: userInfo.displayName || 'Usuario',
                username: userInfo.username || 'usuario',
                photoURL: userInfo.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + userId,
                verified: userInfo.verified || false,
                verifiedColor: userInfo.verifiedColor || 'blue',
                bio: userInfo.bio || '⚡ Usuario de Rayo',
                followers: userInfo.followers || [],
                following: userInfo.following || []
            };

            // 2. Fetch User Posts
            const postsRef = collection(db, "posts");
            const q = query(postsRef, where("authorId", "==", userId), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const userPosts = [];
            querySnapshot.forEach((doc) => {
                userPosts.push({ id: doc.id, ...doc.data() });
            });

            // 3. Render Profile Header
            const header = document.querySelector('.feed-header');
            header.innerHTML = `
                    <div class="profile-header-back">
                        <button class="btn-back" id="btn-back"><i data-lucide="arrow-left"></i></button>
                        <div class="profile-header-info">
                            <span class="profile-header-name">${userInfo.displayName}</span>
                            <span class="profile-header-posts">${userPosts.length} posts</span>
                        </div>
                    </div>
                `;

            // Verified Icon
            let verifiedIcon = '';
            if (userInfo.verified) {
                const colorClass = userInfo.verifiedColor === 'blue' ? 'blue' : '';
                verifiedIcon = `<i data-lucide="check-circle" class="verified-icon ${colorClass}"></i>`;
            }

            // Check Follow Status using current User state or derived from following array
            let isFollowingUser = false;
            if (currentUser && currentUser.uid !== userId) {
                // We check if the target user's ID is in our following list
                // OR we can check if our ID is in their followers list (if we fetched that). 
                // But typically 'am I following them' is in 'my' doc.

                // Assuming currentUser global object is kept updated or we should fetch it.
                // For now, let's assume currentUser has 'following' array.
                if (currentUser.following && Array.isArray(currentUser.following)) {
                    isFollowingUser = currentUser.following.includes(userId);
                }
            }

            const isOwnProfile = currentUser && userId === currentUser.uid;

            const messageBtn = !isOwnProfile ?
                `<button class="btn-message-profile" data-user-id="${userId}" data-username="${userInfo.username}" data-name="${userInfo.displayName}" data-photo="${userInfo.photoURL}"><i data-lucide="mail"></i></button>` : '';

            const actionBtn = isOwnProfile ?
                '<button class="btn-edit-profile">Editar perfil</button>' :
                `${messageBtn}<button class="btn-follow-profile ${isFollowingUser ? 'following' : ''}" data-user-id="${userId}">${isFollowingUser ? 'Siguiendo' : 'Seguir'}</button>`;

            const followersCount = userInfo.followers.length;
            const followingCount = userInfo.following.length;

            container.innerHTML = `
                    <div class="profile-card">
                        <div class="profile-banner"></div>
                        <div class="profile-info">
                            <img src="${userInfo.photoURL}" alt="${userInfo.displayName}" class="profile-avatar">
                            <div class="profile-actions">
                                ${actionBtn}
                            </div>
                            <h2 class="profile-name">${userInfo.displayName} ${verifiedIcon}</h2>
                            <p class="profile-handle">@${userInfo.username}</p>
                            <p class="profile-bio">${userInfo.bio}</p>
                            <div class="profile-stats">
                                <span><strong>${followingCount}</strong> Siguiendo</span>
                                <span><strong>${followersCount}</strong> Seguidores</span>
                            </div>
                        </div>
                    </div>
                    <div class="profile-tabs">
                        <div class="profile-tab active">Posts</div>
                        <div class="profile-tab">Respuestas</div>
                        <div class="profile-tab">Me gusta</div>
                    </div>
                    <div id="profile-posts-container"></div>
                `;

            const profilePostsContainer = document.getElementById('profile-posts-container');

            if (userPosts.length === 0) {
                profilePostsContainer.innerHTML = '<div class="empty-state"><p>Este usuario no tiene publicaciones</p></div>';
            } else {
                userPosts.forEach(post => {
                    profilePostsContainer.appendChild(createPostElement(post));
                });
            }

            lucide.createIcons();

            // Event Listeners
            document.getElementById('btn-back').addEventListener('click', () => {
                showFeed();
            });

            // Follow Button Logic
            const followBtn = container.querySelector('.btn-follow-profile');
            if (followBtn) {
                followBtn.addEventListener('click', async () => {
                    if (!currentUser) return;

                    const isNowFollowing = !followBtn.classList.contains('following');
                    // Optimistic UI
                    followBtn.textContent = isNowFollowing ? 'Siguiendo' : 'Seguir';
                    followBtn.classList.toggle('following', isNowFollowing);

                    // Update stats visually
                    const statsSpans = container.querySelectorAll('.profile-stats span');
                    if (statsSpans[1]) {
                        // Assuming 2nd span is Followers
                        let currentCount = parseInt(statsSpans[1].querySelector('strong').textContent);
                        statsSpans[1].innerHTML = `<strong>${isNowFollowing ? currentCount + 1 : currentCount - 1}</strong> Seguidores`;
                    }

                    // Update Firestore
                    try {
                        const myRef = doc(db, "users", currentUser.uid);
                        const targetRef = doc(db, "users", userId);

                        if (isNowFollowing) {
                            await updateDoc(myRef, { following: arrayUnion(userId) });
                            await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
                            if (currentUser.following) currentUser.following.push(userId);
                        } else {
                            await updateDoc(myRef, { following: arrayRemove(userId) });
                            await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
                            if (currentUser.following) {
                                currentUser.following = currentUser.following.filter(id => id !== userId);
                            }
                        }
                    } catch (err) {
                        console.error("Error updating follow status:", err);
                    }
                });
            }

            // Edit Profile Button - Opens edit modal
            const editBtn = container.querySelector('.btn-edit-profile');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    showEditProfileModal(userInfo);
                });
            }

            // Message Button - Redirect to messages with user info
            const msgBtn = container.querySelector('.btn-message-profile');
            if (msgBtn) {
                msgBtn.addEventListener('click', () => {
                    const targetUserId = msgBtn.dataset.userId;
                    const targetUsername = msgBtn.dataset.username;
                    const targetName = msgBtn.dataset.name;
                    const targetPhoto = msgBtn.dataset.photo;

                    // Store user info for messages page
                    sessionStorage.setItem('startConversationWith', JSON.stringify({
                        id: targetUserId,
                        username: targetUsername,
                        displayName: targetName,
                        photoURL: targetPhoto
                    }));

                    // Redirect to messages
                    window.location.href = '/messages.html';
                });
            }

        } catch (error) {
            console.error("Error in showProfile:", error);

            // Fallback for demo/dev if needed, but we want to stick to Firestore
            container.innerHTML = `<div class="error-message">Error al cargar perfil: ${error.message}</div>`;
        }
    }

    // ==================== EDIT PROFILE MODAL ====================
    function showEditProfileModal(userInfo) {
        const modalHtml = `
            <div class="edit-profile-overlay active" id="edit-profile-modal">
                <div class="edit-profile-modal">
                    <div class="edit-profile-header">
                        <button class="edit-close" id="edit-cancel-btn">
                            <i data-lucide="x"></i>
                        </button>
                        <h2>Editar perfil</h2>
                        <button class="edit-save-btn" id="edit-save-btn">Guardar</button>
                    </div>
                    <div class="edit-profile-banner">
                        <div class="edit-profile-avatar-container">
                            <img src="${userInfo.photoURL}" alt="${userInfo.displayName}" class="edit-profile-avatar" id="edit-avatar-preview">
                        </div>
                    </div>
                    <div class="edit-profile-form">
                        <div class="edit-field">
                            <label for="edit-name">Nombre</label>
                            <input type="text" id="edit-name" value="${userInfo.displayName}" maxlength="50" placeholder="Tu nombre">
                            <span class="edit-counter"><span id="name-count">${userInfo.displayName.length}</span>/50</span>
                        </div>
                        <div class="edit-field">
                            <label for="edit-username">Usuario</label>
                            <div class="edit-input-prefix">
                                <span>@</span>
                                <input type="text" id="edit-username" value="${userInfo.username}" maxlength="20" placeholder="usuario">
                            </div>
                            <span class="edit-counter"><span id="username-count">${userInfo.username.length}</span>/20</span>
                            <span class="edit-error" id="username-error"></span>
                        </div>
                        <div class="edit-field">
                            <label for="edit-bio">Biografía</label>
                            <textarea id="edit-bio" maxlength="160" placeholder="Cuéntanos sobre ti...">${userInfo.bio || ''}</textarea>
                            <span class="edit-counter"><span id="bio-count">${(userInfo.bio || '').length}</span>/160</span>
                        </div>
                        <div class="edit-field">
                            <label>Foto de perfil</label>
                            <div class="edit-photo-upload">
                                <input type="file" id="edit-photo-file" accept="image/*" hidden>
                                <button type="button" class="edit-upload-btn" id="edit-upload-btn">
                                    <i data-lucide="camera"></i>
                                    Cambiar foto
                                </button>
                                <span class="edit-upload-status" id="edit-upload-status"></span>
                            </div>
                            <input type="hidden" id="edit-photo-url" value="${userInfo.photoURL}">
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        lucide.createIcons();

        const modal = document.getElementById('edit-profile-modal');
        const nameInput = document.getElementById('edit-name');
        const usernameInput = document.getElementById('edit-username');
        const bioInput = document.getElementById('edit-bio');
        const photoUrlInput = document.getElementById('edit-photo-url');
        const avatarPreview = document.getElementById('edit-avatar-preview');
        const saveBtn = document.getElementById('edit-save-btn');
        const cancelBtn = document.getElementById('edit-cancel-btn');

        // Character counters
        nameInput.addEventListener('input', () => {
            document.getElementById('name-count').textContent = nameInput.value.length;
        });

        usernameInput.addEventListener('input', () => {
            document.getElementById('username-count').textContent = usernameInput.value.length;
            document.getElementById('username-error').textContent = '';
        });

        bioInput.addEventListener('input', () => {
            document.getElementById('bio-count').textContent = bioInput.value.length;
        });

        // Photo Upload to Cloudinary
        const uploadBtn = document.getElementById('edit-upload-btn');
        const fileInput = document.getElementById('edit-photo-file');
        const uploadStatus = document.getElementById('edit-upload-status');

        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file
            if (!file.type.startsWith('image/')) {
                showToast('Por favor selecciona una imagen');
                return;
            }

            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showToast('La imagen es muy grande (máx 5MB)');
                return;
            }

            // Show uploading state
            uploadBtn.disabled = true;
            uploadStatus.textContent = 'Subiendo...';
            uploadStatus.className = 'edit-upload-status uploading';

            try {
                // Upload to Cloudinary (using env vars from utils.js)
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', cloudinaryConfig.uploadPreset);
                formData.append('cloud_name', cloudinaryConfig.cloudName);

                const response = await fetch(getCloudinaryUploadUrl(), {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Error al subir imagen');
                }

                const data = await response.json();
                const imageUrl = data.secure_url;

                // Update preview and hidden input
                avatarPreview.src = imageUrl;
                photoUrlInput.value = imageUrl;

                uploadStatus.textContent = '✓ Foto actualizada';
                uploadStatus.className = 'edit-upload-status success';

            } catch (error) {
                console.error('Upload error:', error);
                uploadStatus.textContent = '✗ Error al subir';
                uploadStatus.className = 'edit-upload-status error';
                showToast('Error al subir la imagen. Intenta de nuevo.');
            } finally {
                uploadBtn.disabled = false;
            }
        });

        // Close modal
        cancelBtn.addEventListener('click', () => {
            modal.remove();
        });

        // Click overlay to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Save profile
        saveBtn.addEventListener('click', async () => {
            const newName = nameInput.value.trim();
            const newUsername = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            const newBio = bioInput.value.trim();
            const newPhotoUrl = photoUrlInput.value.trim() || userInfo.photoURL;

            // Validation
            if (!newName) {
                showToast('El nombre es requerido');
                return;
            }

            if (!newUsername) {
                showToast('El usuario es requerido');
                return;
            }

            // Check username uniqueness if changed
            if (newUsername !== userInfo.username) {
                try {
                    const usernameQuery = query(
                        collection(db, "users"),
                        where("username", "==", newUsername),
                        limit(1)
                    );
                    const usernameCheck = await getDocs(usernameQuery);

                    if (!usernameCheck.empty) {
                        document.getElementById('username-error').textContent = 'Este usuario ya está en uso';
                        return;
                    }
                } catch (err) {
                    console.error("Error checking username:", err);
                }
            }

            // Show saving state
            saveBtn.textContent = 'Guardando...';
            saveBtn.disabled = true;

            try {
                // Update Firestore
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, {
                    displayName: newName,
                    username: newUsername,
                    bio: newBio,
                    photoURL: newPhotoUrl
                });

                // Update local state
                currentUser.displayName = newName;
                currentUser.username = newUsername;
                currentUser.bio = newBio;
                currentUser.photoURL = newPhotoUrl;

                // Update localStorage
                localStorage.setItem('rayo_demo_user', JSON.stringify(currentUser));

                // Update sidebar UI
                document.getElementById('sidebar-avatar').src = newPhotoUrl;
                document.getElementById('sidebar-name').textContent = newName;
                document.getElementById('sidebar-handle').textContent = '@' + newUsername;

                showToast('¡Perfil actualizado!');
                modal.remove();

                // Refresh profile view
                showProfile(currentUser.uid);

            } catch (error) {
                console.error("Error updating profile:", error);
                showToast('Error al guardar. Intenta de nuevo.');
                saveBtn.textContent = 'Guardar';
                saveBtn.disabled = false;
            }
        });
    }

    function showFeed() {
        currentView = 'feed';
        const header = document.querySelector('.feed-header');
        header.innerHTML = `
            <div class="feed-tabs">
                <div class="tab active" data-tab="para-ti">Para ti</div>
                <div class="tab" data-tab="siguiendo">Siguiendo</div>
            </div>
            <div class="header-settings">
                <i data-lucide="settings"></i>
            </div>
        `;

        const tabs = header.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                if (tab.dataset.tab === 'siguiendo') {
                    loadPosts(null, true); // Filter by following
                } else {
                    loadPosts(); // Show all
                }
            });
        });

        loadPosts();
        lucide.createIcons();
    }

    // ==================== NOTIFICATIONS VIEW ====================
    function showNotifications() {
        currentView = 'notifications';
        const container = document.getElementById('posts-container');
        const header = document.querySelector('.feed-header');

        header.innerHTML = `
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

        notifications.forEach(n => n.read = true);
        saveNotifications(notifications);
        updateNotificationBadge();

        lucide.createIcons();

        document.getElementById('btn-back').addEventListener('click', () => {
            showFeed();
        });
    }

    function createNotificationElement(notif) {
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
            default:
                icon = '<i data-lucide="bell" class="notif-icon"></i>';
                text = 'interactuó contigo';
        }

        div.innerHTML = `
            ${icon}
            <img src="${notif.fromUserPhoto}" alt="${notif.fromUserName}" class="avatar-small">
            <div class="notification-content">
                <span class="notification-user">${notif.fromUserName}</span>
                <span class="notification-text">${text}</span>
                <span class="notification-time">${getTimeAgo(notif.createdAt)}</span>
            </div>
        `;

        return div;
    }

    // ==================== EVENT LISTENERS ====================

    // Tab switching (initial)
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (tab.dataset.tab === 'siguiendo') {
                loadPosts(null, true);
            } else {
                loadPosts();
            }
        });
    });

    // Composer textarea
    const textarea = document.getElementById('post-textarea');
    const btnPost = document.getElementById('btn-post');

    textarea.addEventListener('input', () => {
        btnPost.disabled = textarea.value.trim().length === 0 && !pendingImageData;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    });

    // Image upload button in composer
    const composerImageBtn = document.querySelector('.composer .action-icons i[data-lucide="image"]');
    if (composerImageBtn) {
        composerImageBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                let previewContainer = document.querySelector('.composer .image-preview-container');
                if (!previewContainer) {
                    previewContainer = document.createElement('div');
                    previewContainer.className = 'image-preview-container';
                    document.querySelector('.composer-content').insertBefore(previewContainer, document.querySelector('.composer-actions'));
                }
                handleImageUpload(file, previewContainer, () => {
                    btnPost.disabled = textarea.value.trim().length === 0;
                });
                btnPost.disabled = false;
            };
            input.click();
        });
    }

    btnPost.addEventListener('click', () => {
        // Use Firestore always
        createFirestorePost(textarea.value.trim(), pendingImageData);
        textarea.value = '';
        textarea.style.height = 'auto';
        btnPost.disabled = true;
        pendingImageData = null;
        const previewContainer = document.querySelector('.composer .image-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
        }
    });

    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTextarea = document.getElementById('modal-textarea');
    const modalPostBtn = document.getElementById('modal-post-btn');
    const modalClose = document.getElementById('modal-close');
    const btnPublishModal = document.getElementById('btn-publish-modal');
    const btnPublishFab = document.getElementById('btn-publish-fab');

    function openModal() {
        modalOverlay.classList.add('active');
        pendingImageData = null;
        setTimeout(() => modalTextarea.focus(), 100);
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        modalTextarea.value = '';
        modalPostBtn.disabled = true;
        pendingImageData = null;
        const previewContainer = document.querySelector('.modal-body .image-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
        }
    }

    btnPublishModal.addEventListener('click', openModal);
    btnPublishFab.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    modalTextarea.addEventListener('input', () => {
        modalPostBtn.disabled = modalTextarea.value.trim().length === 0 && !pendingImageData;
        modalTextarea.style.height = 'auto';
        modalTextarea.style.height = modalTextarea.scrollHeight + 'px';
    });

    // Image upload in modal
    const modalImageBtn = document.querySelector('.modal-body .action-icons i[data-lucide="image"]');
    if (modalImageBtn) {
        modalImageBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                let previewContainer = document.querySelector('.modal-body .image-preview-container');
                if (!previewContainer) {
                    previewContainer = document.createElement('div');
                    previewContainer.className = 'image-preview-container';
                    document.querySelector('.modal-body .composer-content').insertBefore(previewContainer, document.querySelector('.modal-body .composer-actions'));
                }
                handleImageUpload(file, previewContainer, () => {
                    modalPostBtn.disabled = modalTextarea.value.trim().length === 0;
                });
                modalPostBtn.disabled = false;
            };
            input.click();
        });
    }

    modalPostBtn.addEventListener('click', () => {
        // Use Firestore always
        createFirestorePost(modalTextarea.value.trim(), pendingImageData);
        closeModal();
    });

    // Comment modal
    const commentModalOverlay = document.getElementById('comment-modal-overlay');
    const commentTextarea = document.getElementById('comment-textarea');
    const commentPostBtn = document.getElementById('comment-post-btn');
    const commentModalClose = document.getElementById('comment-modal-close');

    if (commentModalClose) {
        commentModalClose.addEventListener('click', closeCommentModal);
    }

    if (commentModalOverlay) {
        commentModalOverlay.addEventListener('click', (e) => {
            if (e.target === commentModalOverlay) closeCommentModal();
        });
    }

    if (commentTextarea) {
        commentTextarea.addEventListener('input', () => {
            commentPostBtn.disabled = commentTextarea.value.trim().length === 0;
        });
    }

    if (commentPostBtn) {
        commentPostBtn.addEventListener('click', () => {
            addComment(commentTextarea.value);
        });
    }

    // Post interactions (event delegation)
    document.getElementById('posts-container').addEventListener('click', (e) => {
        const commentAction = e.target.closest('.action-comment');
        if (commentAction) {
            e.preventDefault();
            e.stopPropagation();
            openCommentModal(commentAction.dataset.postId);
            return;
        }

        const heartAction = e.target.closest('.action-heart');
        if (heartAction) {
            e.preventDefault();
            e.stopPropagation();
            const postId = heartAction.dataset.postId;

            // Use Firestore always
            toggleFirestoreLike(postId).then(isNowLiked => {
                // Update UI immediately for responsiveness
                heartAction.classList.toggle('liked', isNowLiked);
                const countSpan = heartAction.querySelector('span');
                if (countSpan) {
                    const currentCount = parseInt(countSpan.textContent) || 0;
                    countSpan.textContent = isNowLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
                }
            });
            return;
        }

        const deleteBtn = e.target.closest('.post-delete');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('¿Eliminar este post?')) {
                const postId = deleteBtn.dataset.postId;
                if (firestoreReady) {
                    deleteFirestorePost(postId);
                }
            }
            return;
        }

        const userClick = e.target.closest('.clickable-user, .post-avatar');
        if (userClick) {
            e.preventDefault();
            e.stopPropagation();
            showProfile(userClick.dataset.userId);
            return;
        }

        const shareAction = e.target.closest('.action-share');
        if (shareAction) {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard.writeText(window.location.href + '#post-' + shareAction.dataset.postId);
            showToast('Enlace copiado al portapapeles');
            return;
        }
    });



    // Navigation
    document.getElementById('nav-logout').addEventListener('click', async (e) => {
        e.preventDefault();

        // Sign out from Firebase Auth properly
        try {
            const { auth } = await import('./firebase-config.js');
            const { signOut } = await import('firebase/auth');
            await signOut(auth);
        } catch (err) {
            console.error('Error signing out from Firebase:', err);
        }

        // Clean up Firestore subscription
        if (unsubscribePosts) {
            unsubscribePosts();
        }

        // Clear all local storage
        localStorage.removeItem('rayo_demo_mode');
        localStorage.removeItem('rayo_demo_user');
        localStorage.removeItem('rayo_firebase_user');
        window.location.href = 'login.html';
    });

    document.getElementById('nav-profile').addEventListener('click', (e) => {
        e.preventDefault();
        showProfile(currentUser.uid);
    });

    document.querySelector('.nav-item.position-relative').addEventListener('click', (e) => {
        e.preventDefault();
        showNotifications();
    });

    document.getElementById('user-profile-mini').addEventListener('click', () => {
        showProfile(currentUser.uid);
    });

    // Home navigation
    document.getElementById('nav-home').addEventListener('click', (e) => {
        e.preventDefault();
        showFeed();
    });

    // Delegated event listener for back buttons (btn-back can be dynamically added)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-back') || e.target.closest('.btn-back')) {
            e.preventDefault();
            showFeed();
        }
    });

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('active')) closeModal();
            if (commentModalOverlay && commentModalOverlay.classList.contains('active')) closeCommentModal();
        }
    });

    // Toast notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
    // Navigation Views

    async function showExplore() {
        showToast("Explorar: Cargando usuarios...");

        // Modal for search results - improved design
        const modalHtml = `
            <div class="explore-overlay active" id="explore-modal">
                <div class="explore-modal">
                    <div class="explore-header">
                        <h2><i data-lucide="users" class="explore-icon"></i> Explorar Usuarios</h2>
                        <button class="explore-close" onclick="document.getElementById('explore-modal').remove()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="explore-search">
                        <i data-lucide="search"></i>
                        <input type="text" placeholder="Buscar por nombre o @usuario..." id="explore-search-input">
                    </div>
                    <div class="explore-results" id="explore-results">
                        <div class="explore-loading">
                            <i data-lucide="loader-2" class="spin"></i>
                            <span>Cargando usuarios...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        lucide.createIcons();

        // Initial load of latest users
        const resultsContainer = document.getElementById('explore-results');

        try {
            // Simple query to get latest users (limit 10)
            // Note: In a real app index might be needed, here we just list some
            let q = query(collection(db, "users"), limit(10));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                resultsContainer.innerHTML = '<div class="explore-empty"><i data-lucide="user-x"></i><p>No hay usuarios registrados aún.</p></div>';
                lucide.createIcons();
            } else {
                resultsContainer.innerHTML = '';
                snapshot.forEach(doc => {
                    const userData = doc.data();
                    const userEl = document.createElement('div');
                    userEl.className = 'explore-user-card';
                    userEl.innerHTML = `
                        <img src="${userData.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + userData.uid}" alt="${userData.displayName}" class="explore-avatar">
                        <div class="explore-user-info">
                            <span class="explore-name">${userData.displayName || 'Usuario'}</span>
                            <span class="explore-username">@${userData.username || 'usuario'}</span>
                        </div>
                        <div class="explore-action">
                            <i data-lucide="chevron-right"></i>
                        </div>
                    `;
                    userEl.addEventListener('click', () => {
                        document.getElementById('explore-modal').remove();
                        showProfile(doc.id);
                    });
                    resultsContainer.appendChild(userEl);
                });
                lucide.createIcons();
            }

            // Search functionality
            const input = document.getElementById('explore-search-input');
            input.addEventListener('input', async (e) => {
                const term = e.target.value.toLowerCase();
                // Client-side filtering for simplicity in this demo (firestore search is complex)
                // In production, use Algolia/Typesense. Here we filter the loaded snapshot or fetch all.
                // Re-rendering filtered results from initial snapshot for better responsiveness
                resultsContainer.innerHTML = '';
                let foundAny = false;

                snapshot.forEach(doc => {
                    const userData = doc.data();
                    if (userData.displayName?.toLowerCase().includes(term) || userData.username?.toLowerCase().includes(term)) {
                        foundAny = true;
                        const userEl = document.createElement('div');
                        userEl.className = 'explore-user-card';
                        userEl.innerHTML = `
                            <img src="${userData.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + userData.uid}" alt="${userData.displayName}" class="explore-avatar">
                            <div class="explore-user-info">
                                <span class="explore-name">${userData.displayName || 'Usuario'}</span>
                                <span class="explore-username">@${userData.username || 'usuario'}</span>
                            </div>
                            <div class="explore-action">
                                <i data-lucide="chevron-right"></i>
                            </div>
                        `;
                        userEl.addEventListener('click', () => {
                            document.getElementById('explore-modal').remove();
                            showProfile(doc.id);
                        });
                        resultsContainer.appendChild(userEl);
                    }
                });
                lucide.createIcons();

                if (!foundAny) {
                    resultsContainer.innerHTML = '<div class="explore-empty"><i data-lucide="search-x"></i><p>No se encontraron coincidencias.</p></div>';
                    lucide.createIcons();
                }

            });

        } catch (error) {
            console.error("Error loading users:", error);
            resultsContainer.innerHTML = '<p style="color: red; text-align:center;">Error al cargar usuarios.</p>';
        }
    }

    // Expose functions globally for HTML onclick access
    window.showNotifications = showNotifications;
    window.showExplore = showExplore;
});
