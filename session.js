// session.js - Auth Session Bootstrap
// Single source of truth: Firebase Auth
// Firestore users/{uid} is the "app profile"
// localStorage no longer participates in auth

import { auth, db, onAuthChange } from './firebase-config.js';
import {
    doc,
    getDoc,
    setDoc,
    runTransaction,
    serverTimestamp
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';

// Cached current user (app profile shape)
let cachedCurrentUser = null;

/**
 * Wait for initial auth state from Firebase
 * Resolves with user if logged in, null if not
 * Use this instead of auth.currentUser which can be null on refresh
 */
export function waitForAuthUser() {
    return new Promise(resolve => {
        const unsub = onAuthChange(user => {
            unsub(); // Only need first callback
            resolve(user);
        });
    });
}

/**
 * Derive username from email (sanitized)
 */
function deriveUsername(email, uid) {
    if (!email) return `user_${uid.slice(0, 6)}`;
    const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    return base || `user_${uid.slice(0, 6)}`;
}

/**
 * Get or create user document in Firestore using transaction
 * This ensures no race conditions if user logs in from multiple tabs
 * Returns the user profile with stable shape
 */
export async function getOrCreateUserDoc(authUser) {
    if (!authUser) return null;

    const userRef = doc(db, 'users', authUser.uid);

    try {
        const userData = await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);

            if (userSnap.exists()) {
                // User exists, return with normalized data
                const data = userSnap.data();
                return {
                    uid: authUser.uid,
                    email: data.email || authUser.email,
                    displayName: data.displayName || authUser.displayName || 'Usuario',
                    username: data.username || deriveUsername(authUser.email, authUser.uid),
                    photoURL: data.photoURL || authUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.uid}`,
                    bio: data.bio || '',
                    followers: Array.isArray(data.followers) ? data.followers : [],
                    following: Array.isArray(data.following) ? data.following : [],
                    verified: data.verified || false,
                    verifiedColor: data.verifiedColor || null,
                    createdAt: data.createdAt
                };
            } else {
                // User doesn't exist, create new document
                const username = deriveUsername(authUser.email, authUser.uid);
                const newUserData = {
                    uid: authUser.uid,
                    email: authUser.email || '',
                    displayName: authUser.displayName || 'Usuario',
                    username: username,
                    photoURL: authUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                    bio: '',
                    followers: [],
                    following: [],
                    verified: false,
                    verifiedColor: null,
                    createdAt: serverTimestamp()
                };

                transaction.set(userRef, newUserData);

                // Return with stable shape (createdAt will be timestamp after commit)
                return {
                    ...newUserData,
                    createdAt: Date.now() // Approximate for immediate use
                };
            }
        });

        return userData;
    } catch (error) {
        console.error('Error in getOrCreateUserDoc:', error);
        return null;
    }
}

/**
 * Main entry point: wait for auth and get/create user profile
 * Returns user profile with stable shape, or null if not logged in
 */
export async function requireCurrentUser() {
    // Check cache first (only if we already have a user)
    if (cachedCurrentUser) {
        return cachedCurrentUser;
    }

    // Wait for Firebase Auth to restore session
    const authUser = await waitForAuthUser();

    if (!authUser) {
        cachedCurrentUser = null;
        return null;
    }

    // Get or create user document
    const userProfile = await getOrCreateUserDoc(authUser);
    cachedCurrentUser = userProfile;

    return userProfile;
}

/**
 * Get cached current user (synchronous, may be null if not loaded yet)
 */
export function getCachedUser() {
    return cachedCurrentUser;
}

/**
 * Update cached user (call after profile edits)
 */
export function updateCachedUser(updates) {
    if (cachedCurrentUser) {
        cachedCurrentUser = { ...cachedCurrentUser, ...updates };
    }
}

/**
 * Clear cached user (call on logout)
 */
export function clearCachedUser() {
    cachedCurrentUser = null;
}

/**
 * Logout user completely
 */
export async function logout() {
    try {
        clearCachedUser();
        await signOut(auth);
        return true;
    } catch (error) {
        console.error('Error during logout:', error);
        return false;
    }
}

/**
 * Setup auth state listener for session expiry/logout in other tabs
 * Calls onLogout callback when user becomes unauthenticated
 */
export function onSessionChange(onLogin, onLogout) {
    return onAuthChange(async (authUser) => {
        if (authUser) {
            // User is logged in
            const userProfile = await getOrCreateUserDoc(authUser);
            cachedCurrentUser = userProfile;
            if (onLogin) onLogin(userProfile);
        } else {
            // User is logged out
            cachedCurrentUser = null;
            if (onLogout) onLogout();
        }
    });
}
