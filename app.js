// app.js - Rayo Social Network
// Main application with localStorage persistence

document.addEventListener('DOMContentLoaded', () => {
    // ==================== CHECK AUTH ====================
    const demoMode = localStorage.getItem('rayo_demo_mode');
    const demoUser = JSON.parse(localStorage.getItem('rayo_demo_user') || 'null');

    if (!demoMode || !demoUser) {
        window.location.href = 'login.html';
        return;
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
    loadPosts();
    updateNotificationBadge();
    lucide.createIcons();

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
    function getPosts() {
        const posts = JSON.parse(localStorage.getItem('rayo_posts') || '[]');
        if (posts.length === 0) {
            const defaultPosts = getDefaultPosts();
            localStorage.setItem('rayo_posts', JSON.stringify(defaultPosts));
            return defaultPosts;
        }
        return posts;
    }

    function savePosts(posts) {
        localStorage.setItem('rayo_posts', JSON.stringify(posts));
    }

    function getDefaultPosts() {
        return [
            {
                id: 'post-1',
                authorId: 'user-ana',
                authorName: 'Ana García',
                authorUsername: 'ana_dev',
                authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana',
                verified: true,
                verifiedColor: 'gold',
                content: '¡Acabo de desplegar mi primera app en producción! 🚀\n\nLa optimización de imágenes redujo el LCP en un 40%. Aquí les dejo una captura del antes y después.',
                imageUrl: 'https://images.unsplash.com/photo-1551288049-bbda48658a7e?auto=format&fit=crop&q=80&w=800',
                likes: ['user-carlos', 'user-david'],
                reposts: [],
                comments: [
                    { id: 'c1', authorId: 'user-carlos', authorName: 'Carlos Tech', authorUsername: 'carlostech', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos', content: '¡Felicidades! El LCP es crucial para la UX.', createdAt: Date.now() - 3600000 },
                    { id: 'c2', authorId: 'user-design', authorName: 'Design Daily', authorUsername: 'designdaily', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Design', content: '¿Qué herramientas usaste para la optimización?', createdAt: Date.now() - 1800000 }
                ],
                views: 45200,
                createdAt: Date.now() - 7200000
            },
            {
                id: 'post-2',
                authorId: 'user-carlos',
                authorName: 'Carlos Tech',
                authorUsername: 'carlostech',
                authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
                verified: true,
                verifiedColor: 'blue',
                content: 'La simplicidad no es el objetivo. Es el subproducto de una buena idea y expectativas modestas.\n\nRefactorizar > Reescribir. Siempre.',
                imageUrl: null,
                likes: ['user-ana'],
                reposts: [],
                comments: [],
                views: 12000,
                createdAt: Date.now() - 14400000
            },
            {
                id: 'post-3',
                authorId: 'user-design',
                authorName: 'Design Daily',
                authorUsername: 'designdaily',
                authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Design',
                verified: false,
                content: '¿Qué opinan de la nueva tendencia de \'Bento Grids\' en diseño web? Personalmente creo que organiza la información de manera exquisita.',
                imageUrl: null,
                likes: [],
                reposts: [],
                comments: [],
                views: 8500,
                createdAt: Date.now() - 18000000
            }
        ];
    }

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
    function loadPosts(filterUserId = null, filterFollowing = false) {
        let posts = getPosts();
        const container = document.getElementById('posts-container');
        container.innerHTML = '';

        if (filterUserId) {
            posts = posts.filter(p => p.authorId === filterUserId);
        }

        if (filterFollowing) {
            const user = JSON.parse(localStorage.getItem('rayo_demo_user'));
            const following = user.following || [];
            posts = posts.filter(p => following.includes(p.authorId) || p.authorId === currentUser.uid);
        }

        posts.sort((a, b) => b.createdAt - a.createdAt);

        if (posts.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No hay publicaciones aún</p></div>';
        } else {
            posts.forEach(post => {
                container.appendChild(createPostElement(post));
            });
        }

        lucide.createIcons();
    }

    function createPostElement(post) {
        const article = document.createElement('article');
        article.className = 'post';
        article.dataset.postId = post.id;

        const timeAgo = getTimeAgo(post.createdAt);
        const isLiked = post.likes.includes(currentUser.uid);
        const likeCount = post.likes.length;
        const commentCount = Array.isArray(post.comments) ? post.comments.length : post.comments;

        let verifiedIcon = '';
        if (post.verified) {
            const colorClass = post.verifiedColor === 'blue' ? 'blue' : '';
            verifiedIcon = `<i data-lucide="check-circle" class="verified-icon ${colorClass}"></i>`;
        }

        let mediaHtml = '';
        if (post.imageUrl) {
            mediaHtml = `
                <div class="post-media">
                    <img src="${post.imageUrl}" alt="Post image">
                </div>
            `;
        }

        const isOwnPost = post.authorId === currentUser.uid;
        const optionsHtml = isOwnPost ?
            `<i data-lucide="trash-2" class="post-delete" data-post-id="${post.id}"></i>` :
            `<i data-lucide="more-horizontal" class="post-options"></i>`;

        article.innerHTML = `
            <div class="post-layout">
                <img src="${post.authorPhoto}" alt="${post.authorName}" class="avatar-small post-avatar" data-user-id="${post.authorId}">
                <div class="post-body">
                    <header class="post-header">
                        <span class="post-user-name clickable-user" data-user-id="${post.authorId}">${post.authorName} ${verifiedIcon}</span>
                        <span class="post-user-handle">@${post.authorUsername}</span>
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

    function formatContent(content) {
        let formatted = content.replace(/\n/g, '<br>');
        formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
        formatted = formatted.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        return formatted;
    }

    function getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'ahora';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
        if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    // ==================== COMMENTS ====================
    function openCommentModal(postId) {
        selectedPostId = postId;
        const post = getPosts().find(p => p.id === postId);
        if (!post) return;

        const modal = document.getElementById('comment-modal-overlay');
        const container = document.getElementById('comment-post-container');
        const commentsContainer = document.getElementById('comments-container');

        container.innerHTML = '';
        container.appendChild(createPostElement(post));

        commentsContainer.innerHTML = '';
        const comments = Array.isArray(post.comments) ? post.comments : [];

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
        div.innerHTML = `
            <img src="${comment.authorPhoto}" alt="${comment.authorName}" class="avatar-tiny">
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-author">${comment.authorName}</span>
                    <span class="comment-handle">@${comment.authorUsername}</span>
                    <span class="comment-time">· ${getTimeAgo(comment.createdAt)}</span>
                </div>
                <div class="comment-content">${comment.content}</div>
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

    function addComment(content) {
        if (!selectedPostId || !content.trim()) return;

        const posts = getPosts();
        const post = posts.find(p => p.id === selectedPostId);
        if (!post) return;

        if (!Array.isArray(post.comments)) {
            post.comments = [];
        }

        const newComment = {
            id: 'comment-' + Date.now(),
            authorId: currentUser.uid,
            authorName: currentUser.displayName,
            authorUsername: currentUser.username,
            authorPhoto: currentUser.photoURL,
            content: content.trim(),
            createdAt: Date.now()
        };

        post.comments.push(newComment);
        savePosts(posts);

        if (post.authorId !== currentUser.uid) {
            addNotification('comment', currentUser, selectedPostId);
        }

        openCommentModal(selectedPostId);
        document.getElementById('comment-textarea').value = '';
        document.getElementById('comment-post-btn').disabled = true;
    }

    // ==================== PROFILE ====================
    function showProfile(userId) {
        const posts = getPosts();
        const userPosts = posts.filter(p => p.authorId === userId);
        const users = getUsers();

        let userInfo;
        if (userId === currentUser.uid) {
            userInfo = { ...currentUser };
            const storedUser = JSON.parse(localStorage.getItem('rayo_demo_user'));
            userInfo.following = storedUser.following || [];
            userInfo.followers = storedUser.followers || [];
        } else {
            userInfo = users.find(u => u.uid === userId);
            if (!userInfo) {
                const userPost = userPosts[0];
                if (userPost) {
                    userInfo = {
                        uid: userId,
                        displayName: userPost.authorName,
                        username: userPost.authorUsername,
                        photoURL: userPost.authorPhoto,
                        verified: userPost.verified,
                        verifiedColor: userPost.verifiedColor,
                        bio: '⚡ Usuario de Rayo',
                        followers: [],
                        following: []
                    };
                } else {
                    return;
                }
            }
        }

        const container = document.getElementById('posts-container');
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

        let verifiedIcon = '';
        if (userInfo.verified) {
            const colorClass = userInfo.verifiedColor === 'blue' ? 'blue' : '';
            verifiedIcon = `<i data-lucide="check-circle" class="verified-icon ${colorClass}"></i>`;
        }

        const isOwnProfile = userId === currentUser.uid;
        const isFollowingUser = isFollowing(userId);
        const actionBtn = isOwnProfile ?
            '<button class="btn-edit-profile">Editar perfil</button>' :
            `<button class="btn-follow-profile ${isFollowingUser ? 'following' : ''}" data-user-id="${userId}">${isFollowingUser ? 'Siguiendo' : 'Seguir'}</button>`;

        const followersCount = (userInfo.followers || []).length;
        const followingCount = (userInfo.following || []).length;

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
                    <p class="profile-bio">${userInfo.bio || '⚡ Usuario de Rayo'}</p>
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
        userPosts.sort((a, b) => b.createdAt - a.createdAt);

        if (userPosts.length === 0) {
            profilePostsContainer.innerHTML = '<div class="empty-state"><p>Este usuario no tiene publicaciones</p></div>';
        } else {
            userPosts.forEach(post => {
                profilePostsContainer.appendChild(createPostElement(post));
            });
        }

        currentView = 'profile';
        lucide.createIcons();

        document.getElementById('btn-back').addEventListener('click', () => {
            showFeed();
        });

        // Follow button handler
        const followBtn = container.querySelector('.btn-follow-profile');
        if (followBtn) {
            followBtn.addEventListener('click', () => {
                const targetId = followBtn.dataset.userId;
                const nowFollowing = toggleFollow(targetId);
                followBtn.textContent = nowFollowing ? 'Siguiendo' : 'Seguir';
                followBtn.classList.toggle('following', nowFollowing);

                // Update follower count
                const statsSpans = container.querySelectorAll('.profile-stats span');
                if (statsSpans[1]) {
                    const currentCount = parseInt(statsSpans[1].querySelector('strong').textContent);
                    statsSpans[1].innerHTML = `<strong>${nowFollowing ? currentCount + 1 : currentCount - 1}</strong> Seguidores`;
                }
            });
        }
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
        createNewPost(textarea.value.trim(), pendingImageData);
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
        createNewPost(modalTextarea.value.trim(), pendingImageData);
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

    // Create new post
    function createNewPost(content, imageData = null) {
        if (!content && !imageData) return;

        const posts = getPosts();
        const newPost = {
            id: 'post-' + Date.now(),
            authorId: currentUser.uid,
            authorName: currentUser.displayName,
            authorUsername: currentUser.username,
            authorPhoto: currentUser.photoURL,
            verified: false,
            content: content || '',
            imageUrl: imageData,
            likes: [],
            reposts: [],
            comments: [],
            views: Math.floor(Math.random() * 100),
            createdAt: Date.now()
        };

        posts.unshift(newPost);
        savePosts(posts);
        loadPosts();
        showToast('¡Publicado! ⚡');
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
            toggleLike(heartAction.dataset.postId);
            return;
        }

        const deleteBtn = e.target.closest('.post-delete');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('¿Eliminar este post?')) {
                deletePost(deleteBtn.dataset.postId);
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

    function toggleLike(postId) {
        const posts = getPosts();
        const post = posts.find(p => p.id === postId);
        if (!post) return;

        const userIndex = post.likes.indexOf(currentUser.uid);
        if (userIndex > -1) {
            post.likes.splice(userIndex, 1);
        } else {
            post.likes.push(currentUser.uid);
            if (post.authorId !== currentUser.uid) {
                addNotification('like', currentUser, postId);
            }
        }

        savePosts(posts);
        if (currentView === 'feed') {
            loadPosts();
        }
    }

    function deletePost(postId) {
        let posts = getPosts();
        posts = posts.filter(p => p.id !== postId);
        savePosts(posts);
        loadPosts();
        showToast('Post eliminado');
    }

    // Navigation
    document.getElementById('nav-logout').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('rayo_demo_mode');
        localStorage.removeItem('rayo_demo_user');
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
});
