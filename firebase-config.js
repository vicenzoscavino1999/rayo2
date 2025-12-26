// firebase-config.js
// Configuración de Firebase para Rayo ⚡

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, where, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Tu configuración de Firebase (para desarrollo)
// NOTA: Para producción, estas credenciales deberían estar en variables de entorno
const firebaseConfig = {
    apiKey: "AIzaSyCOQThWBj6niqo6a1Ezv9BvA4guAn-LSJA",
    authDomain: "rayo-app-47718.firebaseapp.com",
    projectId: "rayo-app-47718",
    storageBucket: "rayo-app-47718.firebasestorage.app",
    messagingSenderId: "783914127570",
    appId: "1:783914127570:web:d7b8be11d79f994a4ddd6b",
    measurementId: "G-JDRE6WWKZ2"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==================== AUTH FUNCTIONS ====================

// Registrar nuevo usuario
async function registerUser(email, password, displayName, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Actualizar perfil con nombre
        await updateProfile(user, {
            displayName: displayName,
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        });

        // Crear documento de usuario en Firestore
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: email,
            displayName: displayName,
            username: username,
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
            bio: "",
            followers: [],
            following: [],
            createdAt: serverTimestamp()
        });

        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Iniciar sesión
async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Cerrar sesión
async function logoutUser() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Iniciar sesión con Google
async function loginWithGoogle() {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Verificar si el usuario ya existe en Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (!userDoc.exists()) {
            // Crear documento de usuario si no existe
            const username = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || username,
                username: username,
                photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                bio: "",
                followers: [],
                following: [],
                createdAt: serverTimestamp()
            });
        }

        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Obtener usuario actual
function getCurrentUser() {
    return auth.currentUser;
}

// Escuchar cambios de autenticación
function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

// ==================== POST FUNCTIONS ====================

// Crear nuevo post
async function createPost(content, imageUrl = null) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: "No autenticado" };

    try {
        // Obtener datos del usuario
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();

        const postData = {
            authorId: user.uid,
            authorName: userData.displayName || user.displayName,
            authorUsername: userData.username,
            authorPhoto: userData.photoURL || user.photoURL,
            content: content,
            imageUrl: imageUrl,
            likes: [],
            reposts: [],
            comments: [],
            views: 0,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, "posts"), postData);
        return { success: true, postId: docRef.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Obtener posts (feed)
async function getPosts(limitCount = 20) {
    try {
        const q = query(
            collection(db, "posts"),
            orderBy("createdAt", "desc"),
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        const posts = [];
        snapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, posts };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Escuchar posts en tiempo real
function onPostsChange(callback, limitCount = 20) {
    const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );
    return onSnapshot(q, (snapshot) => {
        const posts = [];
        snapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        callback(posts);
    });
}

// Dar/quitar like a un post
async function toggleLike(postId) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: "No autenticado" };

    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            return { success: false, error: "Post no encontrado" };
        }

        const postData = postSnap.data();
        const likes = postData.likes || [];
        const userIndex = likes.indexOf(user.uid);

        if (userIndex > -1) {
            // Quitar like
            likes.splice(userIndex, 1);
        } else {
            // Agregar like
            likes.push(user.uid);
        }

        await updateDoc(postRef, { likes });
        return { success: true, liked: userIndex === -1 };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Eliminar post
async function deletePost(postId) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: "No autenticado" };

    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (postSnap.data().authorId !== user.uid) {
            return { success: false, error: "No autorizado" };
        }

        await deleteDoc(postRef);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== USER FUNCTIONS ====================

// Obtener perfil de usuario
async function getUserProfile(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return { success: true, user: userDoc.data() };
        }
        return { success: false, error: "Usuario no encontrado" };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Seguir/dejar de seguir usuario
async function toggleFollow(targetUid) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: "No autenticado" };

    try {
        const currentUserRef = doc(db, "users", user.uid);
        const targetUserRef = doc(db, "users", targetUid);

        const currentUserSnap = await getDoc(currentUserRef);
        const targetUserSnap = await getDoc(targetUserRef);

        const currentUserData = currentUserSnap.data();
        const targetUserData = targetUserSnap.data();

        const following = currentUserData.following || [];
        const followers = targetUserData.followers || [];

        const isFollowing = following.includes(targetUid);

        if (isFollowing) {
            // Dejar de seguir
            following.splice(following.indexOf(targetUid), 1);
            followers.splice(followers.indexOf(user.uid), 1);
        } else {
            // Seguir
            following.push(targetUid);
            followers.push(user.uid);
        }

        await updateDoc(currentUserRef, { following });
        await updateDoc(targetUserRef, { followers });

        return { success: true, following: !isFollowing };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Exportar funciones
export {
    auth,
    db,
    registerUser,
    loginUser,
    loginWithGoogle,
    logoutUser,
    getCurrentUser,
    onAuthChange,
    createPost,
    getPosts,
    onPostsChange,
    toggleLike,
    deletePost,
    getUserProfile,
    toggleFollow
};
