// src/profile.js - Profile display and editing
// Rayo Social Network - Modularized

import { cloudinaryConfig, getCloudinaryUploadUrl, sanitizeHTML, safeUrl, safeAttr } from '../utils.js';

// Module state
let db, collection, getDocs, query, orderBy, where, doc, getDoc, updateDoc, limit, arrayUnion, arrayRemove;
let currentUser = null;
let onToast = null;
let showFeedCallback = null;
let createPostElementCallback = null;

// Initialize profile module
export async function initProfileModule(user, toastCallback, feedCallback, postElementCallback) {
    currentUser = user;
    onToast = toastCallback;
    showFeedCallback = feedCallback;
    createPostElementCallback = postElementCallback;

    const firestore = await import("firebase/firestore");
    const firebaseConfig = await import('../firebase-config.js');

    db = firebaseConfig.db;
    collection = firestore.collection;
    getDocs = firestore.getDocs;
    query = firestore.query;
    orderBy = firestore.orderBy;
    where = firestore.where;
    doc = firestore.doc;
    getDoc = firestore.getDoc;
    updateDoc = firestore.updateDoc;
    limit = firestore.limit;
    arrayUnion = firestore.arrayUnion;
    arrayRemove = firestore.arrayRemove;

    return true;
}

// Update current user reference
export function updateCurrentUser(user) {
    currentUser = user;
}

// Show user profile
export async function showProfile(userId) {
    const container = document.getElementById('posts-container');

    container.innerHTML = '<div class="loading-spinner"><i data-lucide="loader-2" class="animate-spin"></i></div>';
    if (window.lucide) window.lucide.createIcons();

    try {
        // Fetch User Data
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        let userInfo;
        if (!userSnap.exists()) {
            if (userId === currentUser.uid) {
                userInfo = { ...currentUser };
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

        // Fetch User Posts
        const postsRef = collection(db, "posts");
        const q = query(postsRef, where("authorId", "==", userId), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const userPosts = [];
        querySnapshot.forEach((docSnap) => {
            userPosts.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Render Profile Header
        const header = document.querySelector('.feed-header');
        header.innerHTML = `
            <div class="profile-header-back">
                <button class="btn-back" id="btn-back"><i data-lucide="arrow-left"></i></button>
                <div class="profile-header-info">
                    <span class="profile-header-name">${sanitizeHTML(userInfo.displayName)}</span>
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

        // Check Follow Status
        let isFollowingUser = false;
        if (currentUser && currentUser.uid !== userId) {
            if (currentUser.following && Array.isArray(currentUser.following)) {
                isFollowingUser = currentUser.following.includes(userId);
            }
        }

        const isOwnProfile = currentUser && userId === currentUser.uid;

        const messageBtn = !isOwnProfile ?
            `<button class="btn-message-profile" data-user-id="${userId}" data-username="${safeAttr(userInfo.username)}" data-name="${safeAttr(userInfo.displayName)}" data-photo="${safeUrl(userInfo.photoURL, '')}"><i data-lucide="mail"></i></button>` : '';

        const actionBtn = isOwnProfile ?
            '<button class="btn-edit-profile">Editar perfil</button>' :
            `${messageBtn}<button class="btn-follow-profile ${isFollowingUser ? 'following' : ''}" data-user-id="${userId}">${isFollowingUser ? 'Siguiendo' : 'Seguir'}</button>`;

        const followersCount = userInfo.followers.length;
        const followingCount = userInfo.following.length;

        container.innerHTML = `
            <div class="profile-card">
                <div class="profile-banner"></div>
                <div class="profile-info">
                    <img src="${safeUrl(userInfo.photoURL, 'https://api.dicebear.com/7.x/avataaars/svg?seed=user')}" alt="${safeAttr(userInfo.displayName)}" class="profile-avatar">
                    <div class="profile-actions">
                        ${actionBtn}
                    </div>
                    <h2 class="profile-name">${sanitizeHTML(userInfo.displayName)} ${verifiedIcon}</h2>
                    <p class="profile-handle">@${sanitizeHTML(userInfo.username)}</p>
                    <p class="profile-bio">${sanitizeHTML(userInfo.bio)}</p>
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
                profilePostsContainer.appendChild(createPostElementCallback(post));
            });
        }

        if (window.lucide) window.lucide.createIcons();

        // Event Listeners
        document.getElementById('btn-back')?.addEventListener('click', () => {
            if (showFeedCallback) showFeedCallback();
        });

        // Follow Button Logic
        const followBtn = container.querySelector('.btn-follow-profile');
        if (followBtn) {
            followBtn.addEventListener('click', async () => {
                if (!currentUser) return;

                const isNowFollowing = !followBtn.classList.contains('following');
                followBtn.textContent = isNowFollowing ? 'Siguiendo' : 'Seguir';
                followBtn.classList.toggle('following', isNowFollowing);

                const statsSpans = container.querySelectorAll('.profile-stats span');
                if (statsSpans[1]) {
                    let currentCount = parseInt(statsSpans[1].querySelector('strong').textContent);
                    statsSpans[1].innerHTML = `<strong>${isNowFollowing ? currentCount + 1 : currentCount - 1}</strong> Seguidores`;
                }

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

        // Edit Profile Button
        const editBtn = container.querySelector('.btn-edit-profile');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                showEditProfileModal(userInfo);
            });
        }

        // Message Button
        const msgBtn = container.querySelector('.btn-message-profile');
        if (msgBtn) {
            msgBtn.addEventListener('click', () => {
                sessionStorage.setItem('startConversationWith', JSON.stringify({
                    id: msgBtn.dataset.userId,
                    username: msgBtn.dataset.username,
                    displayName: msgBtn.dataset.name,
                    photoURL: msgBtn.dataset.photo
                }));
                window.location.href = '/messages.html';
            });
        }

    } catch (error) {
        console.error("Error in showProfile:", error);
        container.innerHTML = `<div class="error-message">Error al cargar perfil: ${error.message}</div>`;
    }
}

// Show edit profile modal
export function showEditProfileModal(userInfo) {
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
    if (window.lucide) window.lucide.createIcons();

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

    // Photo Upload
    const uploadBtn = document.getElementById('edit-upload-btn');
    const fileInput = document.getElementById('edit-photo-file');
    const uploadStatus = document.getElementById('edit-upload-status');

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            onToast?.('Por favor selecciona una imagen');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            onToast?.('La imagen es muy grande (máx 5MB)');
            return;
        }

        uploadBtn.disabled = true;
        uploadStatus.textContent = 'Subiendo...';
        uploadStatus.className = 'edit-upload-status uploading';

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', cloudinaryConfig.uploadPreset);
            formData.append('cloud_name', cloudinaryConfig.cloudName);

            const response = await fetch(getCloudinaryUploadUrl(), {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Error al subir imagen');

            const data = await response.json();
            avatarPreview.src = data.secure_url;
            photoUrlInput.value = data.secure_url;

            uploadStatus.textContent = '✓ Foto actualizada';
            uploadStatus.className = 'edit-upload-status success';
        } catch (error) {
            console.error('Upload error:', error);
            uploadStatus.textContent = '✗ Error al subir';
            uploadStatus.className = 'edit-upload-status error';
            onToast?.('Error al subir la imagen. Intenta de nuevo.');
        } finally {
            uploadBtn.disabled = false;
        }
    });

    // Close modal
    cancelBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Save profile
    saveBtn.addEventListener('click', async () => {
        const newName = nameInput.value.trim();
        const newUsername = usernameInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const newBio = bioInput.value.trim();
        const newPhotoUrl = photoUrlInput.value.trim() || userInfo.photoURL;

        if (!newName) {
            onToast?.('El nombre es requerido');
            return;
        }

        if (!newUsername) {
            onToast?.('El usuario es requerido');
            return;
        }

        // Check username uniqueness
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

        saveBtn.textContent = 'Guardando...';
        saveBtn.disabled = true;

        try {
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

            localStorage.setItem('rayo_demo_user', JSON.stringify(currentUser));

            // Update sidebar UI
            const sidebarAvatar = document.getElementById('sidebar-avatar');
            const sidebarName = document.getElementById('sidebar-name');
            const sidebarHandle = document.getElementById('sidebar-handle');

            if (sidebarAvatar) sidebarAvatar.src = newPhotoUrl;
            if (sidebarName) sidebarName.textContent = newName;
            if (sidebarHandle) sidebarHandle.textContent = '@' + newUsername;

            onToast?.('¡Perfil actualizado!');
            modal.remove();

            // Refresh profile view
            showProfile(currentUser.uid);
        } catch (error) {
            console.error("Error updating profile:", error);
            onToast?.('Error al guardar. Intenta de nuevo.');
            saveBtn.textContent = 'Guardar';
            saveBtn.disabled = false;
        }
    });
}
