// src/ui.js - UI helpers, modals, and toast notifications
// Rayo Social Network - Modularized

// Show toast notification
export function showToast(message) {
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

// Update user UI elements
export function updateUserUI(user) {
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarHandle = document.getElementById('sidebar-handle');
    const composerAvatar = document.getElementById('composer-avatar');
    const modalAvatar = document.getElementById('modal-avatar');

    if (sidebarAvatar) sidebarAvatar.src = user.photoURL;
    if (sidebarName) sidebarName.textContent = user.displayName;
    if (sidebarHandle) sidebarHandle.textContent = '@' + user.username;
    if (composerAvatar) composerAvatar.src = user.photoURL;
    if (modalAvatar) modalAvatar.src = user.photoURL;
}

// Show feed view (restore header to tabs)
export function showFeedHeader(headerElement, onTabChange) {
    headerElement.innerHTML = `
        <div class="feed-tabs">
            <div class="tab active" data-tab="para-ti">Para ti</div>
            <div class="tab" data-tab="siguiendo">Siguiendo</div>
        </div>
        <div class="header-settings">
            <i data-lucide="settings"></i>
        </div>
    `;

    const tabs = headerElement.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            onTabChange(tab.dataset.tab === 'siguiendo');
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

// Post modal management
export function setupPostModal(createPostCallback, getPendingImage, setPendingImage) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTextarea = document.getElementById('modal-textarea');
    const modalPostBtn = document.getElementById('modal-post-btn');
    const modalClose = document.getElementById('modal-close');
    const btnPublishModal = document.getElementById('btn-publish-modal');
    const btnPublishFab = document.getElementById('btn-publish-fab');

    function openModal() {
        modalOverlay?.classList.add('active');
        setPendingImage(null);
        setTimeout(() => modalTextarea?.focus(), 100);
    }

    function closeModal() {
        modalOverlay?.classList.remove('active');
        if (modalTextarea) modalTextarea.value = '';
        if (modalPostBtn) modalPostBtn.disabled = true;
        setPendingImage(null);
        const previewContainer = document.querySelector('.modal-body .image-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
        }
    }

    btnPublishModal?.addEventListener('click', openModal);
    btnPublishFab?.addEventListener('click', openModal);
    modalClose?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    modalTextarea?.addEventListener('input', () => {
        if (modalPostBtn) {
            modalPostBtn.disabled = modalTextarea.value.trim().length === 0 && !getPendingImage();
        }
        modalTextarea.style.height = 'auto';
        modalTextarea.style.height = modalTextarea.scrollHeight + 'px';
    });

    modalPostBtn?.addEventListener('click', () => {
        createPostCallback(modalTextarea?.value.trim(), getPendingImage());
        closeModal();
    });

    return { openModal, closeModal };
}

// Composer setup
export function setupComposer(createPostCallback, handleImageUpload, getPendingImage, setPendingImage) {
    const textarea = document.getElementById('post-textarea');
    const btnPost = document.getElementById('btn-post');

    textarea?.addEventListener('input', () => {
        if (btnPost) {
            btnPost.disabled = textarea.value.trim().length === 0 && !getPendingImage();
        }
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    });

    // Image upload button
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
                    document.querySelector('.composer-content')?.insertBefore(previewContainer, document.querySelector('.composer-actions'));
                }
                handleImageUpload(file, previewContainer, () => {
                    if (btnPost) btnPost.disabled = textarea?.value.trim().length === 0;
                }, setPendingImage);
                if (btnPost) btnPost.disabled = false;
            };
            input.click();
        });
    }

    btnPost?.addEventListener('click', () => {
        createPostCallback(textarea?.value.trim(), getPendingImage());
        if (textarea) {
            textarea.value = '';
            textarea.style.height = 'auto';
        }
        if (btnPost) btnPost.disabled = true;
        setPendingImage(null);
        const previewContainer = document.querySelector('.composer .image-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
        }
    });
}

// Mobile navigation helper
export function updateMobileNavActive(activeId) {
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById(activeId)?.classList.add('active');
}
