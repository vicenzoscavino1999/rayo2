// app.js - Rayo Social Network
// Main application entry point with modular architecture

// Import session management (Firebase Auth as source of truth)
import { requireCurrentUser, onSessionChange, logout, updateCachedUser } from './session.js';

// Import modules
import {
    initPostsModule,
    subscribeToFirestorePosts,
    unsubscribeFromPosts,
    createFirestorePost,
    toggleFirestoreLike,
    deleteFirestorePost,
    renderPosts,
    createPostElement,
    getCurrentPosts,
    setupInfiniteScroll,
    handleImageUpload,
    setNewsElementCreator,
    updateCurrentUser as updatePostsUser
} from './src/posts.js';

import {
    initCommentsModule,
    openCommentModal,
    closeCommentModal,
    addComment,
    getSelectedPostId,
    updateCurrentUser as updateCommentsUser
} from './src/comments.js';

import {
    initNotificationsModule,
    getNotifications,
    addNotification,
    updateNotificationBadge,
    showNotifications,
    unsubscribeFromNotifications
} from './src/notifications.js';

import {
    showToast,
    updateUserUI,
    showFeedHeader,
    setupPostModal,
    setupComposer,
    updateMobileNavActive
} from './src/ui.js';

import {
    initProfileModule,
    showProfile,
    updateCurrentUser as updateProfileUser
} from './src/profile.js';

import {
    initExploreModule,
    showExplore
} from './src/explore.js';

import {
    fetchNews,
    createNewsElement,
    getCachedNews
} from './src/news.js';

// App state
let currentUser = null;
let currentView = 'feed';
let pendingMedia = null; // { data: string, type: 'image' | 'video' }
let unsubscribeAuth = null;

// Get/Set pending media
function getPendingMedia() { return pendingMedia; }
function setPendingMedia(data) { pendingMedia = data; }

document.addEventListener('DOMContentLoaded', async () => {
    // ==================== CHECK AUTH (Firebase Auth as source of truth) ====================
    currentUser = await requireCurrentUser();

    if (!currentUser) {
        console.warn('No authenticated user, redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    // Initialize icons immediately
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // ==================== LISTEN FOR AUTH CHANGES (cross-tab logout only) ====================
    // Note: We already have currentUser from requireCurrentUser(), so only listen for logout
    unsubscribeAuth = onSessionChange(
        null, // Don't need onLogin - we already have the user
        () => {
            // User logged out - redirect
            window.location.href = 'login.html';
        }
    );

    // ==================== INITIALIZE APP ====================
    updateUserUI(currentUser);

    // ==================== INITIALIZE MODULES ====================
    let newsData = [];

    try {
        await initPostsModule(currentUser, showToast);
        await initCommentsModule(currentUser, showToast);
        await initProfileModule(currentUser, showToast, showFeed, createPostElement);
        await initExploreModule(showToast, showProfile);
        await initNotificationsModule(currentUser);

        // Set up news element creator for posts module
        setNewsElementCreator(createNewsElement);

        // Fetch news for "Para ti" tab
        newsData = await fetchNews();
        console.log(`📰 Loaded ${newsData.length} news items`);

        // Subscribe to posts
        subscribeToFirestorePosts((posts) => {
            if (currentView === 'feed') {
                renderPosts(posts, null, false, createPostElement, newsData);
                setupInfiniteScroll(createPostElement);
            }
        });

        console.log('🔥 Rayo initialized with modular architecture + news feed');
    } catch (err) {
        console.error('Failed to initialize modules:', err);
        showToast('Error al inicializar la aplicación');
    }

    updateNotificationBadge();
    if (window.lucide) window.lucide.createIcons();

    // ==================== URL PARAMS ====================
    const urlParams = new URLSearchParams(window.location.search);
    const initialView = urlParams.get('view');

    if (initialView === 'profile') {
        setTimeout(() => {
            showProfile(currentUser.uid);
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById('nav-profile')?.classList.add('active');
        }, 100);
    } else if (initialView === 'notifications') {
        setTimeout(() => {
            showNotificationsView();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item')[2]?.classList.add('active');
        }, 100);
    } else if (initialView === 'explore') {
        setTimeout(() => {
            showExplore();
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item')[1]?.classList.add('active');
        }, 100);
    }

    // ==================== SHOW FEED ====================
    function showFeed() {
        currentView = 'feed';
        const header = document.querySelector('.feed-header');

        showFeedHeader(header, (filterFollowing) => {
            const posts = getCurrentPosts();
            renderPosts(posts, null, filterFollowing, createPostElement);
        });

        // Show composer
        const composer = document.querySelector('.composer');
        if (composer) composer.style.display = 'block';

        // Render posts
        const posts = getCurrentPosts();
        if (posts.length > 0) {
            renderPosts(posts, null, false, createPostElement);
        }

        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.getElementById('nav-home')?.classList.add('active');
    }

    // ==================== SHOW NOTIFICATIONS ====================
    function showNotificationsView() {
        currentView = 'notifications';
        const container = document.getElementById('posts-container');
        const header = document.querySelector('.feed-header');
        showNotifications(container, header, showFeed);
    }

    // ==================== SETUP UI ====================
    // Composer
    setupComposer(
        (content, media) => {
            if (media) {
                // Pass File object for Cloudinary upload, or data URL for backward compatibility
                createFirestorePost(content, media.file || media.data, media.type);
            } else {
                createFirestorePost(content, null, 'image');
            }
        },
        handleImageUpload,
        getPendingMedia,
        setPendingMedia
    );

    // Modal
    setupPostModal(
        (content, media) => {
            if (media) {
                // Pass File object for Cloudinary upload, or data URL for backward compatibility
                createFirestorePost(content, media.file || media.data, media.type);
            } else {
                createFirestorePost(content, null, 'image');
            }
        },
        getPendingMedia,
        setPendingMedia
    );

    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const posts = getCurrentPosts();
            if (tab.dataset.tab === 'siguiendo') {
                renderPosts(posts, null, true, createPostElement);
            } else {
                renderPosts(posts, null, false, createPostElement);
            }
        });
    });

    // Comment modal
    const commentModalClose = document.getElementById('comment-modal-close');
    const commentModalOverlay = document.getElementById('comment-modal-overlay');
    const commentTextarea = document.getElementById('comment-textarea');
    const commentPostBtn = document.getElementById('comment-post-btn');

    commentModalClose?.addEventListener('click', closeCommentModal);
    commentModalOverlay?.addEventListener('click', (e) => {
        if (e.target === commentModalOverlay) closeCommentModal();
    });

    commentTextarea?.addEventListener('input', () => {
        if (commentPostBtn) {
            commentPostBtn.disabled = commentTextarea.value.trim().length === 0;
        }
    });

    commentPostBtn?.addEventListener('click', () => {
        const posts = getCurrentPosts();
        addComment(commentTextarea.value, createPostElement, posts);
    });

    // ==================== POST INTERACTIONS ====================
    document.getElementById('posts-container')?.addEventListener('click', (e) => {
        const commentAction = e.target.closest('.action-comment');
        if (commentAction) {
            e.preventDefault();
            e.stopPropagation();
            const posts = getCurrentPosts();
            openCommentModal(commentAction.dataset.postId, createPostElement, posts);
            return;
        }

        const heartAction = e.target.closest('.action-heart');
        if (heartAction) {
            e.preventDefault();
            e.stopPropagation();
            const postId = heartAction.dataset.postId;

            toggleFirestoreLike(postId).then(isNowLiked => {
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
                deleteFirestorePost(deleteBtn.dataset.postId);
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

    // ==================== NAVIGATION ====================
    document.getElementById('nav-logout')?.addEventListener('click', async (e) => {
        e.preventDefault();

        // Cleanup subscriptions
        unsubscribeFromPosts();
        unsubscribeFromNotifications();
        if (unsubscribeAuth) unsubscribeAuth();

        // Logout via session (Firebase signOut)
        await logout();

        // Clear legacy localStorage (cleanup only)
        localStorage.removeItem('rayo_demo_mode');
        localStorage.removeItem('rayo_demo_user');
        localStorage.removeItem('rayo_firebase_user');

        window.location.href = 'login.html';
    });

    document.getElementById('nav-profile')?.addEventListener('click', (e) => {
        e.preventDefault();
        showProfile(currentUser.uid);
    });

    document.querySelector('.nav-item.position-relative')?.addEventListener('click', (e) => {
        e.preventDefault();
        showNotificationsView();
    });

    document.getElementById('user-profile-mini')?.addEventListener('click', () => {
        showProfile(currentUser.uid);
    });

    document.getElementById('nav-home')?.addEventListener('click', (e) => {
        e.preventDefault();
        showFeed();
    });

    // Back button delegation
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-back') || e.target.closest('.btn-back')) {
            e.preventDefault();
            showFeed();
        }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modalOverlay = document.getElementById('modal-overlay');
            const commentModalOverlay = document.getElementById('comment-modal-overlay');
            if (modalOverlay?.classList.contains('active')) {
                modalOverlay.classList.remove('active');
            }
            if (commentModalOverlay?.classList.contains('active')) {
                closeCommentModal();
            }
        }
    });

    // ==================== MOBILE NAVIGATION ====================
    const mobileNavHome = document.getElementById('mobile-nav-home');
    const mobileNavExplore = document.getElementById('mobile-nav-explore');
    const mobileNavNotifications = document.getElementById('mobile-nav-notifications');
    const mobileNavProfile = document.getElementById('mobile-nav-profile');

    mobileNavHome?.addEventListener('click', (e) => {
        e.preventDefault();
        showFeed();
        updateMobileNavActive('mobile-nav-home');
    });

    mobileNavExplore?.addEventListener('click', (e) => {
        e.preventDefault();
        showExplore();
        updateMobileNavActive('mobile-nav-explore');
    });

    mobileNavNotifications?.addEventListener('click', (e) => {
        e.preventDefault();
        showNotificationsView();
        updateMobileNavActive('mobile-nav-notifications');
    });

    mobileNavProfile?.addEventListener('click', (e) => {
        e.preventDefault();
        showProfile(currentUser.uid);
        updateMobileNavActive('mobile-nav-profile');
    });

    // Expose globally for inline handlers
    window.showNotifications = showNotificationsView;
    window.showExplore = showExplore;
});
