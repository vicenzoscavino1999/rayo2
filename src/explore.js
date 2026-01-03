// src/explore.js - User search and explore functionality
// Rayo Social Network - Modularized

import { sanitizeHTML } from '../utils.js';

// Module state
let db, collection, getDocs, query, limit;
let onToast = null;
let showProfileCallback = null;

// Initialize explore module
export async function initExploreModule(toastCallback, profileCallback) {
    onToast = toastCallback;
    showProfileCallback = profileCallback;

    const firestore = await import("firebase/firestore");
    const firebaseConfig = await import('../firebase-config.js');

    db = firebaseConfig.db;
    collection = firestore.collection;
    getDocs = firestore.getDocs;
    query = firestore.query;
    limit = firestore.limit;

    return true;
}

// Show explore modal with user search
export async function showExplore() {
    onToast?.("Explorar: Cargando usuarios...");

    const modalHtml = `
        <div class="explore-overlay active" id="explore-modal">
            <div class="explore-modal">
                <div class="explore-header">
                    <h2><i data-lucide="users" class="explore-icon"></i> Explorar Usuarios</h2>
                    <button class="explore-close" id="explore-close-btn">
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
    if (window.lucide) window.lucide.createIcons();

    // Close button
    document.getElementById('explore-close-btn')?.addEventListener('click', () => {
        document.getElementById('explore-modal')?.remove();
    });

    const resultsContainer = document.getElementById('explore-results');

    try {
        const q = query(collection(db, "users"), limit(10));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            resultsContainer.innerHTML = '<div class="explore-empty"><i data-lucide="user-x"></i><p>No hay usuarios registrados aún.</p></div>';
            if (window.lucide) window.lucide.createIcons();
        } else {
            resultsContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const userData = doc.data();
                const userEl = createUserCard(userData, doc.id);
                resultsContainer.appendChild(userEl);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        // Search functionality
        const input = document.getElementById('explore-search-input');
        input?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            resultsContainer.innerHTML = '';
            let foundAny = false;

            snapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.displayName?.toLowerCase().includes(term) ||
                    userData.username?.toLowerCase().includes(term)) {
                    foundAny = true;
                    const userEl = createUserCard(userData, doc.id);
                    resultsContainer.appendChild(userEl);
                }
            });

            if (window.lucide) window.lucide.createIcons();

            if (!foundAny) {
                resultsContainer.innerHTML = '<div class="explore-empty"><i data-lucide="search-x"></i><p>No se encontraron coincidencias.</p></div>';
                if (window.lucide) window.lucide.createIcons();
            }
        });

    } catch (error) {
        console.error("Error loading users:", error);
        resultsContainer.innerHTML = '<p style="color: red; text-align:center;">Error al cargar usuarios.</p>';
    }
}

// Create user card element - XSS Safe
function createUserCard(userData, docId) {
    const userEl = document.createElement('div');
    userEl.className = 'explore-user-card';

    // Avatar - validate URL format
    const avatar = document.createElement('img');
    const photoURL = userData.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (userData.uid || docId);
    avatar.src = photoURL.startsWith('http') || photoURL.startsWith('data:') ? photoURL : 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + docId;
    avatar.alt = sanitizeHTML(userData.displayName || 'Usuario');
    avatar.className = 'explore-avatar';

    // User info container
    const info = document.createElement('div');
    info.className = 'explore-user-info';

    // Name - use textContent for safety
    const name = document.createElement('span');
    name.className = 'explore-name';
    name.textContent = userData.displayName || 'Usuario';

    // Username - use textContent for safety
    const username = document.createElement('span');
    username.className = 'explore-username';
    username.textContent = '@' + (userData.username || 'usuario');

    info.appendChild(name);
    info.appendChild(username);

    // Action icon
    const action = document.createElement('div');
    action.className = 'explore-action';
    action.innerHTML = '<i data-lucide="chevron-right"></i>';

    userEl.appendChild(avatar);
    userEl.appendChild(info);
    userEl.appendChild(action);

    userEl.addEventListener('click', () => {
        document.getElementById('explore-modal')?.remove();
        if (showProfileCallback) {
            showProfileCallback(docId);
        }
    });

    return userEl;
}
