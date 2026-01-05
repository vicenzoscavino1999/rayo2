/**
 * Migration script using Firebase client SDK (no gcloud auth needed)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

// Firebase config from your project
const firebaseConfig = {
    apiKey: "AIzaSyD-Ks0a7gTmP_9dJdEbSLw4jGb_X2qk8cM",
    authDomain: "rayo-app-47718.firebaseapp.com",
    projectId: "rayo-app-47718",
    storageBucket: "rayo-app-47718.firebasestorage.app",
    messagingSenderId: "589827662688",
    appId: "1:589827662688:web:b6c3c64e0d8f0fbacfd83f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateFollows() {
    console.log('🔄 Starting Follow Migration...\n');

    const usersSnapshot = await getDocs(collection(db, 'users'));
    let totalFollows = 0;
    let totalUsers = 0;

    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        const following = userData.following || [];

        if (following.length === 0) continue;

        totalUsers++;
        console.log(`\n👤 User: ${userId} (${userData.username || 'unknown'})`);
        console.log(`   Following: ${following.length}`);

        // Process in batches of 500 (Firestore limit)
        for (let i = 0; i < following.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = following.slice(i, i + 500);

            for (const targetId of chunk) {
                if (targetId === userId) continue; // Skip self-follows

                const followingRef = doc(db, 'users', userId, 'following', targetId);
                batch.set(followingRef, { createdAt: serverTimestamp() });

                totalFollows++;
            }

            await batch.commit();
            console.log(`   ✓ Migrated ${chunk.length} follows`);
        }
    }

    console.log(`\n✅ Follow Migration Complete!`);
    console.log(`   Total users processed: ${totalUsers}`);
    console.log(`   Total follows migrated: ${totalFollows}`);
}

async function migrateLikes() {
    console.log('\n🔄 Starting Likes Migration...\n');

    const postsSnapshot = await getDocs(collection(db, 'posts'));
    let totalLikes = 0;
    let totalPosts = 0;

    for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();
        const postId = postDoc.id;
        const likes = postData.likes || [];

        if (likes.length === 0) continue;

        totalPosts++;
        console.log(`\n📝 Post: ${postId.substring(0, 8)}...`);
        console.log(`   Likes: ${likes.length}`);

        for (let i = 0; i < likes.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = likes.slice(i, i + 500);

            for (const userId of chunk) {
                const likeRef = doc(db, 'users', userId, 'likes', postId);
                batch.set(likeRef, { createdAt: serverTimestamp() });
                totalLikes++;
            }

            await batch.commit();
            console.log(`   ✓ Migrated ${chunk.length} likes`);
        }
    }

    console.log(`\n✅ Likes Migration Complete!`);
    console.log(`   Total posts processed: ${totalPosts}`);
    console.log(`   Total likes migrated: ${totalLikes}`);
}

async function main() {
    try {
        await migrateFollows();
        await migrateLikes();
        console.log('\n🎉 All migrations completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

main();
