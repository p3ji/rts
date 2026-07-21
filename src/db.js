import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

export let currentUser = null
let onUserChangedCallback = null

onAuthStateChanged(auth, (user) => {
  currentUser = user
  if (onUserChangedCallback) onUserChangedCallback(user)
})

export function onUserChanged(callback) {
  onUserChangedCallback = callback
  if (currentUser !== undefined) callback(currentUser) // emit immediately if already loaded
}

export async function login(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function register(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    // Create an initial empty stats document for the user
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: email,
      winsAi: 0,
      lossesAi: 0,
      winsOnline: 0,
      lossesOnline: 0
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function logout() {
  await signOut(auth)
}

export async function getUserStats() {
  if (!currentUser) return null
  const d = await getDoc(doc(db, 'users', currentUser.uid))
  if (d.exists()) return d.data()
  return { winsAi: 0, lossesAi: 0, winsOnline: 0, lossesOnline: 0 }
}

export async function recordMatchResult(isWin, mode) {
  if (!currentUser) return
  const userRef = doc(db, 'users', currentUser.uid)
  
  const winField = mode === 'online' ? 'winsOnline' : 'winsAi'
  const lossField = mode === 'online' ? 'lossesOnline' : 'lossesAi'
  
  try {
    await updateDoc(userRef, {
      [winField]: increment(isWin ? 1 : 0),
      [lossField]: increment(isWin ? 0 : 1)
    })
  } catch (err) {
    console.error('Failed to update stats:', err)
  }
}
