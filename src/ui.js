// src/ui.js - UI helpers, modals, and toast notifications
// Rayo Social Network - Modularized

import { createIcons } from 'lucide';

// Show toast notification
export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    // Accessibility: announce to screen readers
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
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

    createIcons({ icons });
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

    // Media upload button (images and videos)
    const composerImageBtn = document.getElementById('composer-image-btn');
    if (composerImageBtn) {
        composerImageBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,video/*'; // Accept both images and videos
            input.onchange = (e) => {
                const file = e.target.files[0];
                let previewContainer = document.querySelector('.composer .media-preview-container');
                if (!previewContainer) {
                    previewContainer = document.createElement('div');
                    previewContainer.className = 'media-preview-container';
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

    // Emoji Picker (Simple)
    const composerEmojiBtn = document.getElementById('composer-emoji-btn');
    if (composerEmojiBtn) {
        const commonEmojis = ['😊', '😂', '❤️', '🔥', '👍', '🎉', '🌟', '👀', '🤔', '😭', '🙌', '🚀', '😍', '✨', '💯', '💩'];
        let picker = null;

        composerEmojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (picker) {
                picker.remove();
                picker = null;
                return;
            }

            picker = document.createElement('div');
            picker.className = 'emoji-picker-popover';
            picker.style.cssText = `
                position: absolute;
                top: 40px;
                left: 0;
                background: var(--bg-primary);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 10px;
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                z-index: 100;
            `;

            commonEmojis.forEach(emoji => {
                const span = document.createElement('span');
                span.textContent = emoji;
                span.style.cssText = 'cursor: pointer; font-size: 20px; padding: 4px; text-align: center; user-select: none;';
                span.onmouseover = () => span.style.backgroundColor = 'var(--bg-secondary)';
                span.onmouseout = () => span.style.backgroundColor = 'transparent';

                span.onclick = () => {
                    if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const text = textarea.value;
                        textarea.value = text.substring(0, start) + emoji + text.substring(end);
                        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
                        textarea.focus();
                        textarea.dispatchEvent(new Event('input')); // Trigger input event to update btn state
                    }
                    picker.remove();
                    picker = null;
                };
                picker.appendChild(span);
            });

            // Append relative to the button container
            composerEmojiBtn.parentElement.style.position = 'relative';
            composerEmojiBtn.parentElement.appendChild(picker);

            // Close on click outside
            const closePicker = (evt) => {
                if (picker && !picker.contains(evt.target) && evt.target !== composerEmojiBtn) {
                    picker.remove();
                    picker = null;
                    document.removeEventListener('click', closePicker);
                }
            };
            setTimeout(() => document.addEventListener('click', closePicker), 0);
        });
    }

    // Location Picker
    const composerLocationBtn = document.getElementById('composer-location-btn');
    if (composerLocationBtn) {
        composerLocationBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                showToast('Geolocalización no soportada');
                return;
            }

            composerLocationBtn.style.color = 'var(--primary)';
            showToast('Obteniendo ubicación...');

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Just appending a text representation for now
                    // Ideally we would store this in specific fields, but kept simple for this iteration
                    const { latitude, longitude } = position.coords;
                    const locationText = ` 📍 [${latitude.toFixed(2)}, ${longitude.toFixed(2)}]`;

                    if (textarea) {
                        textarea.value = textarea.value + locationText;
                        textarea.dispatchEvent(new Event('input'));
                    }
                    showToast('Ubicación agregada');
                    composerLocationBtn.style.color = '';
                },
                (error) => {
                    console.error('Error location:', error);
                    showToast('Error al obtener ubicación');
                    composerLocationBtn.style.color = '';
                }
            );
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
        const previewContainer = document.querySelector('.composer .media-preview-container');
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

// ==================== ACCESSIBILITY HELPERS ====================

/**
 * Trap focus within a modal for keyboard accessibility
 * @param {HTMLElement} modalElement - The modal container element
 * @param {Function} onEscape - Optional callback when Escape is pressed
 * @returns {Function} Cleanup function to remove event listener
 */
export function trapFocus(modalElement, onEscape = null) {
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e) => {
        const focusableEls = modalElement.querySelectorAll(focusableSelectors);
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === firstEl) {
                e.preventDefault();
                lastEl?.focus();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault();
                firstEl?.focus();
            }
        }

        if (e.key === 'Escape' && onEscape) {
            onEscape();
        }
    };

    modalElement.addEventListener('keydown', handleKeyDown);

    // Focus first focusable element
    const firstFocusable = modalElement.querySelector(focusableSelectors);
    firstFocusable?.focus();

    // Return cleanup function
    return () => modalElement.removeEventListener('keydown', handleKeyDown);
}

/**
 * Make an icon clickable with proper accessibility
 * Wraps icon in a button if not already, adds aria-label
 * @param {HTMLElement} iconElement - The icon element (e.g., <i data-lucide="...">)
 * @param {string} ariaLabel - Accessible label for screen readers
 * @param {Function} onClick - Click handler
 */
export function makeIconAccessible(iconElement, ariaLabel, onClick) {
    if (!iconElement) return;

    // If parent is already a button, just add aria-label
    if (iconElement.parentElement?.tagName === 'BUTTON') {
        iconElement.parentElement.setAttribute('aria-label', ariaLabel);
        if (onClick) {
            iconElement.parentElement.addEventListener('click', onClick);
        }
        return iconElement.parentElement;
    }

    // Create wrapper button
    const button = document.createElement('button');
    button.className = 'btn-icon';
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('type', 'button');

    // Replace icon with button containing icon
    iconElement.parentElement?.insertBefore(button, iconElement);
    button.appendChild(iconElement);

    if (onClick) {
        button.addEventListener('click', onClick);
    }

    return button;
}
