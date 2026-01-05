/**
 * Migration Scripts for Phase 3A (Follows) and Phase 3B (Likes)
 * 
 * Run these scripts AFTER deploying Cloud Functions with MIGRATION_MODE=true
 * This prevents double-counting during backfill.
 * 
 * Usage:
 * 1. Set up Firebase Admin SDK credentials
 * 2. Run: node migration.js
 * 3. After verification, set MIGRATION_MODE=false in functions/index.js
 * 4. Redeploy functions
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (use GOOGLE_APPLICATION_CREDENTIALS env var or service account)
// Ensure you have run: gcloud auth application-default login
admin.initializeApp({
    projectId: 'rayo-app-47718'
});
const db = admin.firestore();

const BATCH_SIZE = 200; // Firestore batch limit is 500, use 200 for safety

// ============================================================
// FOLLOW MIGRATION (Phase 3A)
// ============================================================
async function migrateFollows() {
    console.log('🔄 Starting Follow Migration...\n');

    const usersSnapshot = await db.collection('users').get();
    let totalFollows = 0;
    let totalUsers = 0;

    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        const following = userData.following || [];
        const followers = userData.followers || [];

        if (following.length === 0 && followers.length === 0) {
            continue;
        }

        totalUsers++;
        console.log(`\n👤 User: ${userId} (${userData.username || 'unknown'})`);
        console.log(`   Following: ${following.length}, Followers: ${followers.length}`);

        // Migrate following
        for (let i = 0; i < following.length; i += BATCH_SIZE) {
            const chunk = following.slice(i, i + BATCH_SIZE);
            const batch = db.batch();

            for (const targetId of chunk) {
                // Skip self-follows (shouldn't exist, but safety check)
                if (targetId === userId) {
                    console.log(`   ⚠️ Skipping self-follow`);
                    continue;
                }

                // Create following doc
                const followingRef = db.doc(`users/${userId}/following/${targetId}`);
                batch.set(followingRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Create followers mirror
                const followersRef = db.doc(`users/${targetId}/followers/${userId}`);
                batch.set(followersRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                totalFollows++;
            }

            await batch.commit();
            console.log(`   ✓ Migrated ${chunk.length} follows (batch)`);
        }

        // Set counters
        await db.doc(`users/${userId}`).update({
            followingCount: following.length,
            followerCount: followers.length
        });
        console.log(`   ✓ Set counters: followingCount=${following.length}, followerCount=${followers.length}`);
    }

    console.log(`\n✅ Follow Migration Complete!`);
    console.log(`   Total users processed: ${totalUsers}`);
    console.log(`   Total follows migrated: ${totalFollows}`);
}

// ============================================================
// LIKES MIGRATION (Phase 3B)
// ============================================================
async function migrateLikes() {
    console.log('\n🔄 Starting Likes Migration...\n');

    const postsSnapshot = await db.collection('posts').get();
    let totalLikes = 0;
    let totalPosts = 0;

    for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();
        const postId = postDoc.id;
        const likes = postData.likes || [];

        if (likes.length === 0) {
            continue;
        }

        totalPosts++;
        console.log(`\n📝 Post: ${postId}`);
        console.log(`   Likes: ${likes.length}`);

        // Migrate likes
        for (let i = 0; i < likes.length; i += BATCH_SIZE) {
            const chunk = likes.slice(i, i + BATCH_SIZE);
            const batch = db.batch();

            for (const userId of chunk) {
                // Create likes doc
                const likeRef = db.doc(`users/${userId}/likes/${postId}`);
                batch.set(likeRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                totalLikes++;
            }

            await batch.commit();
            console.log(`   ✓ Migrated ${chunk.length} likes (batch)`);
        }

        // Set likeCount
        await db.doc(`posts/${postId}`).update({
            likeCount: likes.length
        });
        console.log(`   ✓ Set likeCount=${likes.length}`);
    }

    console.log(`\n✅ Likes Migration Complete!`);
    console.log(`   Total posts processed: ${totalPosts}`);
    console.log(`   Total likes migrated: ${totalLikes}`);
}

// ============================================================
// VERIFICATION
// ============================================================
async function verifyMigration() {
    console.log('\n🔍 Verifying Migration...\n');

    let followErrors = [];
    let likeErrors = [];

    // Verify follows
    console.log('Checking follows...');
    const usersSnapshot = await db.collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        const oldFollowing = userData.following || [];

        // Check subcollection count
        const newFollowingSnapshot = await db.collection(`users/${userId}/following`).get();

        if (oldFollowing.length !== newFollowingSnapshot.size) {
            followErrors.push({
                userId,
                expected: oldFollowing.length,
                actual: newFollowingSnapshot.size
            });
        }

        // Verify counter
        if (userData.followingCount !== oldFollowing.length) {
            followErrors.push({
                userId,
                field: 'followingCount',
                expected: oldFollowing.length,
                actual: userData.followingCount
            });
        }
    }

    // Verify likes
    console.log('Checking likes...');
    const postsSnapshot = await db.collection('posts').get();

    for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();
        const postId = postDoc.id;
        const oldLikes = postData.likes || [];

        // Verify counter
        if (postData.likeCount !== oldLikes.length) {
            likeErrors.push({
                postId,
                expected: oldLikes.length,
                actual: postData.likeCount
            });
        }
    }

    // Report
    console.log('\n📊 Verification Results:');
    console.log(`   Follow errors: ${followErrors.length}`);
    console.log(`   Like errors: ${likeErrors.length}`);

    if (followErrors.length > 0) {
        console.log('\nFollow errors:', JSON.stringify(followErrors, null, 2));
    }

    if (likeErrors.length > 0) {
        console.log('\nLike errors:', JSON.stringify(likeErrors, null, 2));
    }

    if (followErrors.length === 0 && likeErrors.length === 0) {
        console.log('\n✅ All verifications passed!');
        console.log('\n📋 Next steps:');
        console.log('   1. Set MIGRATION_MODE = false in functions/index.js');
        console.log('   2. Run: cd functions && firebase deploy --only functions');
        return true;
    }

    return false;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--follows')) {
        await migrateFollows();
    } else if (args.includes('--likes')) {
        await migrateLikes();
    } else if (args.includes('--verify')) {
        await verifyMigration();
    } else if (args.includes('--all')) {
        await migrateFollows();
        await migrateLikes();
        await verifyMigration();
    } else {
        console.log('Usage: node migration.js [--follows|--likes|--verify|--all]');
        console.log('');
        console.log('Options:');
        console.log('  --follows    Migrate follow relationships to subcollections');
        console.log('  --likes      Migrate likes to subcollections');
        console.log('  --verify     Verify migration was successful');
        console.log('  --all        Run all migrations and verify');
    }

    process.exit(0);
}

main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
