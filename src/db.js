import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDE6qavwjv86bW5m1iyfJegDKZPIcOFvRI",
  authDomain: "rtsgame-ddda4.firebaseapp.com",
  projectId: "rtsgame-ddda4",
  storageBucket: "rtsgame-ddda4.firebasestorage.app",
  messagingSenderId: "746542204131",
  appId: "1:746542204131:web:064e2d0d3799362ebdf1d6",
  measurementId: "G-GGN6E817DP"
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
      wins: 0,
      losses: 0
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
  return { wins: 0, losses: 0 }
}

export async function recordMatchResult(isWin) {
  if (!currentUser) return
  const userRef = doc(db, 'users', currentUser.uid)
  try {
    await updateDoc(userRef, {
      wins: increment(isWin ? 1 : 0),
      losses: increment(isWin ? 0 : 1)
    })
  } catch (err) {
    console.error('Failed to update stats:', err)
  }
}
