/**
 * Cloud Functions for Rayo
 * - GNews API Proxy
 * - Follow/Unfollow triggers (Phase 3A) - IDEMPOTENT
 * - Like/Unlike triggers (Phase 3B) - IDEMPOTENT
 * 
 * CRITICAL: Uses transactions for idempotency (at-least-once delivery)
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
// FIX #1: Use v2 imports for Firestore triggers
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// Define secrets
const gnewsApiKey = defineSecret("GNEWS_API_KEY");
const cloudinaryApiSecret = defineSecret("CLOUDINARY_API_SECRET");

// Global options for cost control
setGlobalOptions({ maxInstances: 10 });

// ============================================================
// MIGRATION MODE - Set to true during data migration
// This prevents triggers from double-counting during backfill
// ============================================================
const MIGRATION_MODE = false; // Migration completed!

// ============================================================
// GNEWS PROXY (existing)
// ============================================================
exports.gnewsProxy = onRequest(
    {
        cors: [
            'https://rayo-red.vercel.app',
            'https://rayo-red-8ydokf8vq-vicenzos-projects-b93c2ddb.vercel.app',
            'http://localhost:5173',
            'http://localhost:3000'
        ],
        secrets: [gnewsApiKey]
    },
    async (req, res) => {
        try {
            if (req.method !== "GET") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }

            const category = req.query.category || "technology";
            const lang = req.query.lang || "es";
            const country = req.query.country || "mx";
            const max = Math.min(parseInt(req.query.max) || 5, 10);

            if (!["technology", "entertainment", "general"].includes(category)) {
                res.status(400).json({ error: "Invalid category" });
                return;
            }

            const apiKey = gnewsApiKey.value();
            if (!apiKey) {
                logger.error("GNEWS_API_KEY secret not configured");
                res.status(500).json({ error: "API key not configured" });
                return;
            }

            const gnewsUrl = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=${lang}&country=${country}&max=${max}&apikey=${apiKey}`;
            const response = await fetch(gnewsUrl);

            if (!response.ok) {
                logger.error("GNews API error", { status: response.status });
                res.status(response.status).json({ error: "GNews API error" });
                return;
            }

            const data = await response.json();
            res.json(data);

        } catch (error) {
            logger.error("Proxy error", { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

// ============================================================
// CLOUDINARY SIGNED UPLOAD (Security Fix)
// Generates signatures for secure uploads
// ============================================================

const crypto = require('crypto');
const admin = require('firebase-admin');

exports.generateCloudinarySignature = onRequest(
    {
        cors: [
            'https://rayo-zeta.vercel.app',
            'http://localhost:5173'
        ],
        secrets: [cloudinaryApiSecret]
    },
    async (req, res) => {
        try {
            // Verify user is authenticated
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(idToken);

            // Get parameters from request
            const { timestamp } = req.body;

            if (!timestamp) {
                res.status(400).json({ error: 'Missing timestamp' });
                return;
            }

            const apiSecret = cloudinaryApiSecret.value();
            if (!apiSecret) {
                logger.error("CLOUDINARY_API_SECRET not configured");
                res.status(500).json({ error: "Server misconfigured" });
                return;
            }

            // Create signature
            const stringToSign = `timestamp=${timestamp}${apiSecret}`;
            const signature = crypto
                .createHash('sha256')
                .update(stringToSign)
                .digest('hex');

            logger.info('Generated Cloudinary signature', { uid: decodedToken.uid });

            res.json({
                signature,
                timestamp,
                success: true
            });

        } catch (error) {
            logger.error("Signature generation error", { error: error.message });
            res.status(500).json({ error: "Signature generation failed" });
        }
    }
);

// ============================================================
// USERNAME UNIQUENESS ENFORCEMENT (Security Fix)
// Ensures usernames are unique across the platform
// ============================================================

const { onDocumentWritten } = require("firebase-functions/v2/firestore");

exports.onUserWritten = onDocumentWritten(
    "users/{uid}",
    async (event) => {
        const before = event.data?.before?.data();
        const after = event.data?.after?.data();
        const uid = event.params.uid;

        // If document was deleted, release username
        if (!after && before?.username) {
            try {
                await db.doc(`usernames/${before.username}`).delete();
                logger.info("Username released", { username: before.username, uid });
            } catch (error) {
                logger.error("Error releasing username", { error: error.message });
            }
            return;
        }

        // If username changed or user created
        const oldUsername = before?.username;
        const newUsername = after?.username;

        if (newUsername && newUsername !== oldUsername) {
            try {
                await db.runTransaction(async (transaction) => {
                    const usernameRef = db.doc(`usernames/${newUsername}`);
                    const usernameDoc = await transaction.get(usernameRef);

                    // Check if username is taken by another user
                    if (usernameDoc.exists && usernameDoc.data().uid !== uid) {
                        throw new Error(`Username ${newUsername} is already taken`);
                    }

                    // Reserve new username
                    transaction.set(usernameRef, {
                        uid: uid,
                        reservedAt: FieldValue.serverTimestamp()
                    });

                    // Release old username if exists
                    if (oldUsername && oldUsername !== newUsername) {
                        const oldUsernameRef = db.doc(`usernames/${oldUsername}`);
                        const oldUsernameDoc = await transaction.get(oldUsernameRef);

                        // Only delete if it belongs to this user
                        if (oldUsernameDoc.exists && oldUsernameDoc.data().uid === uid) {
                            transaction.delete(oldUsernameRef);
                        }
                    }
                });

                logger.info("Username reserved successfully", { username: newUsername, uid });
            } catch (error) {
                logger.error("Username reservation failed", {
                    username: newUsername,
                    uid,
                    error: error.message
                });

                // Rollback: revert username change in user document
                await db.doc(`users/${uid}`).update({
                    username: oldUsername || null
                });

                throw error;
            }
        }
    }
);

// ============================================================
// FOLLOW TRIGGERS (Phase 3A) - IDEMPOTENT
// Uses marker doc (followers/{followerUid}) to prevent double-counting
// ============================================================

/**
 * When user A follows user B:
 * - Create mirror doc in B's followers subcollection (marker)
 * - Increment counters ONLY if marker didn't exist (idempotent)
 */
exports.onFollowCreated = onDocumentCreated(
    "users/{followerUid}/following/{targetUid}",
    async (event) => {
        if (MIGRATION_MODE) {
            logger.info("MIGRATION_MODE: Skipping onFollowCreated trigger");
            return;
        }

        const { followerUid, targetUid } = event.params;

        // Prevent self-follow
        if (followerUid === targetUid) {
            logger.warn("Self-follow attempt blocked", { followerUid });
            return;
        }

        try {
            // FIX #2: Use transaction for idempotency
            await db.runTransaction(async (transaction) => {
                const followerMirrorRef = db.doc(`users/${targetUid}/followers/${followerUid}`);
                const mirrorDoc = await transaction.get(followerMirrorRef);

                // IDEMPOTENCY: Only increment if marker doesn't exist
                if (mirrorDoc.exists) {
                    logger.info("Follow already processed (idempotent skip)", { followerUid, targetUid });
                    return;
                }

                // 1. Create marker doc
                transaction.set(followerMirrorRef, {
                    createdAt: FieldValue.serverTimestamp()
                });

                // 2. Increment target's followerCount
                // FIX #3: Use set with merge instead of update
                const targetUserRef = db.doc(`users/${targetUid}`);
                transaction.set(targetUserRef, {
                    followerCount: FieldValue.increment(1)
                }, { merge: true });

                // 3. Increment follower's followingCount
                const followerUserRef = db.doc(`users/${followerUid}`);
                transaction.set(followerUserRef, {
                    followingCount: FieldValue.increment(1)
                }, { merge: true });
            });

            logger.info("Follow created successfully", { followerUid, targetUid });

        } catch (error) {
            logger.error("Error in onFollowCreated", { error: error.message, followerUid, targetUid });
            throw error; // Re-throw to trigger retry
        }
    }
);

/**
 * When user A unfollows user B:
 * - Delete mirror doc (marker)
 * - Decrement counters ONLY if marker existed (idempotent)
 */
exports.onFollowDeleted = onDocumentDeleted(
    "users/{followerUid}/following/{targetUid}",
    async (event) => {
        if (MIGRATION_MODE) {
            logger.info("MIGRATION_MODE: Skipping onFollowDeleted trigger");
            return;
        }

        const { followerUid, targetUid } = event.params;

        try {
            await db.runTransaction(async (transaction) => {
                const followerMirrorRef = db.doc(`users/${targetUid}/followers/${followerUid}`);
                const mirrorDoc = await transaction.get(followerMirrorRef);

                // IDEMPOTENCY: Only decrement if marker exists
                if (!mirrorDoc.exists) {
                    logger.info("Unfollow already processed (idempotent skip)", { followerUid, targetUid });
                    return;
                }

                // 1. Delete marker
                transaction.delete(followerMirrorRef);

                // 2. Decrement target's followerCount
                const targetUserRef = db.doc(`users/${targetUid}`);
                transaction.set(targetUserRef, {
                    followerCount: FieldValue.increment(-1)
                }, { merge: true });

                // 3. Decrement follower's followingCount
                const followerUserRef = db.doc(`users/${followerUid}`);
                transaction.set(followerUserRef, {
                    followingCount: FieldValue.increment(-1)
                }, { merge: true });
            });

            logger.info("Follow deleted successfully", { followerUid, targetUid });

        } catch (error) {
            logger.error("Error in onFollowDeleted", { error: error.message, followerUid, targetUid });
            throw error;
        }
    }
);

// ============================================================
// LIKE TRIGGERS (Phase 3B) - IDEMPOTENT
// Uses marker doc (posts/{postId}/likes/{uid}) to prevent double-counting
// ============================================================

/**
 * When user likes a post:
 * - Create marker doc in posts/{postId}/likes/{uid}
 * - Increment likeCount ONLY if marker didn't exist (idempotent)
 */
exports.onLikeCreated = onDocumentCreated(
    "users/{uid}/likes/{postId}",
    async (event) => {
        if (MIGRATION_MODE) {
            logger.info("MIGRATION_MODE: Skipping onLikeCreated trigger");
            return;
        }

        const { uid, postId } = event.params;

        try {
            await db.runTransaction(async (transaction) => {
                // FIX #2: Use marker doc for idempotency
                const likeMarkerRef = db.doc(`posts/${postId}/likes/${uid}`);
                const markerDoc = await transaction.get(likeMarkerRef);

                // IDEMPOTENCY: Only increment if marker doesn't exist
                if (markerDoc.exists) {
                    logger.info("Like already processed (idempotent skip)", { uid, postId });
                    return;
                }

                // Verify post exists
                const postRef = db.doc(`posts/${postId}`);
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists) {
                    logger.warn("Like for non-existent post", { uid, postId });
                    return;
                }

                // 1. Create marker doc
                transaction.set(likeMarkerRef, {
                    createdAt: FieldValue.serverTimestamp()
                });

                // 2. Increment likeCount
                transaction.set(postRef, {
                    likeCount: FieldValue.increment(1)
                }, { merge: true });
            });

            logger.info("Like created successfully", { uid, postId });

        } catch (error) {
            logger.error("Error in onLikeCreated", { error: error.message, uid, postId });
            throw error;
        }
    }
);

/**
 * When user unlikes a post:
 * - Delete marker doc
 * - Decrement likeCount ONLY if marker existed (idempotent)
 */
exports.onLikeDeleted = onDocumentDeleted(
    "users/{uid}/likes/{postId}",
    async (event) => {
        if (MIGRATION_MODE) {
            logger.info("MIGRATION_MODE: Skipping onLikeDeleted trigger");
            return;
        }

        const { uid, postId } = event.params;

        try {
            await db.runTransaction(async (transaction) => {
                const likeMarkerRef = db.doc(`posts/${postId}/likes/${uid}`);
                const markerDoc = await transaction.get(likeMarkerRef);

                // IDEMPOTENCY: Only decrement if marker exists
                if (!markerDoc.exists) {
                    logger.info("Unlike already processed (idempotent skip)", { uid, postId });
                    return;
                }

                const postRef = db.doc(`posts/${postId}`);
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists) {
                    // Post was deleted, just clean up marker
                    transaction.delete(likeMarkerRef);
                    return;
                }

                // 1. Delete marker
                transaction.delete(likeMarkerRef);

                // 2. Decrement likeCount
                transaction.set(postRef, {
                    likeCount: FieldValue.increment(-1)
                }, { merge: true });
            });

            logger.info("Like deleted successfully", { uid, postId });

        } catch (error) {
            logger.error("Error in onLikeDeleted", { error: error.message, uid, postId });
            throw error;
        }
    }
);

// ============================================================
// MIGRATION FUNCTION (Temporary - HTTP Trigger)
// Call this once to migrate existing data to subcollections
// ============================================================

exports.runMigration = onRequest(
    {
        cors: true,
        timeoutSeconds: 540, // 9 minutes max
        memory: "512MiB"
    },
    async (req, res) => {
        try {
            // SECURITY FIX: Require admin authentication
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                res.status(401).json({ error: 'Unauthorized - Admin auth required' });
                return;
            }

            const idToken = authHeader.split('Bearer ')[1];
            let decodedToken;

            try {
                decodedToken = await admin.auth().verifyIdToken(idToken);
            } catch (error) {
                res.status(401).json({ error: 'Invalid token' });
                return;
            }

            // Verify user is admin
            const userDoc = await db.doc(`users/${decodedToken.uid}`).get();
            if (!userDoc.exists || !userDoc.data().isAdmin) {
                res.status(403).json({ error: 'Forbidden - Admin access only' });
                return;
            }

            // Security: Only allow in MIGRATION_MODE
            if (!MIGRATION_MODE) {
                res.status(403).json({
                    error: "Migration already completed. Set MIGRATION_MODE=true to re-run."
                });
                return;
            }

            logger.info("Starting migration via HTTP trigger");

            const results = {
                follows: { users: 0, relationships: 0 },
                likes: { posts: 0, likes: 0 },
                errors: []
            };

            // ==================== MIGRATE FOLLOWS ====================
            const usersSnapshot = await db.collection('users').get();

            for (const userDoc of usersSnapshot.docs) {
                const userData = userDoc.data();
                const userId = userDoc.id;
                const following = userData.following || [];
                const followers = userData.followers || [];

                if (following.length === 0 && followers.length === 0) continue;

                results.follows.users++;

                try {
                    // Migrate following (batches of 500)
                    for (let i = 0; i < following.length; i += 500) {
                        const batch = db.batch();
                        const chunk = following.slice(i, i + 500);

                        for (const targetId of chunk) {
                            if (targetId === userId) continue; // Skip self-follows

                            // Create following doc
                            const followingRef = db.doc(`users/${userId}/following/${targetId}`);
                            batch.set(followingRef, { createdAt: FieldValue.serverTimestamp() });

                            // Create followers mirror
                            const followersRef = db.doc(`users/${targetId}/followers/${userId}`);
                            batch.set(followersRef, { createdAt: FieldValue.serverTimestamp() });

                            results.follows.relationships++;
                        }

                        await batch.commit();
                    }

                    // Set counters
                    await db.doc(`users/${userId}`).set({
                        followingCount: following.length,
                        followerCount: followers.length
                    }, { merge: true });

                } catch (error) {
                    logger.error(`Error migrating user ${userId}:`, error);
                    results.errors.push(`User ${userId}: ${error.message}`);
                }
            }

            // ==================== MIGRATE LIKES ====================
            const postsSnapshot = await db.collection('posts').get();

            for (const postDoc of postsSnapshot.docs) {
                const postData = postDoc.data();
                const postId = postDoc.id;
                const likes = postData.likes || [];

                if (likes.length === 0) continue;

                results.likes.posts++;

                try {
                    // Migrate likes (batches of 500)
                    for (let i = 0; i < likes.length; i += 500) {
                        const batch = db.batch();
                        const chunk = likes.slice(i, i + 500);

                        for (const userId of chunk) {
                            // Create user like doc
                            const likeRef = db.doc(`users/${userId}/likes/${postId}`);
                            batch.set(likeRef, { createdAt: FieldValue.serverTimestamp() });

                            // Create post like marker
                            const markerRef = db.doc(`posts/${postId}/likes/${userId}`);
                            batch.set(markerRef, { createdAt: FieldValue.serverTimestamp() });

                            results.likes.likes++;
                        }

                        await batch.commit();
                    }

                    // Set likeCount
                    await db.doc(`posts/${postId}`).set({
                        likeCount: likes.length
                    }, { merge: true });

                } catch (error) {
                    logger.error(`Error migrating post ${postId}:`, error);
                    results.errors.push(`Post ${postId}: ${error.message}`);
                }
            }

            logger.info("Migration completed", results);

            res.json({
                success: true,
                message: "Migration completed successfully",
                results
            });

        } catch (error) {
            logger.error("Migration failed:", error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

