// Firebase setup (Google + email login, Firestore database). No need to edit this file.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, where, orderBy, getDocs, serverTimestamp, writeBatch, documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const isConfigured = !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("PASTE");

let app = null, auth = null, db = null;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}
export { auth, db, onAuthStateChanged };

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export const fb = {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, where, orderBy, getDocs, serverTimestamp, writeBatch, documentId
};

// Shows Google's own sign-in screen in the site's current language
export function setAuthLang(lang) {
  if (auth) auth.languageCode = lang;
}

function needAuth() {
  if (!auth) throw Object.assign(new Error("not-configured"), { code: "app/not-configured" });
}

export async function signInGoogle() {
  needAuth();
  try {
    return await signInWithPopup(auth, provider);
  } catch (e) {
    // Some phones/browsers block popups — fall back to a full-page redirect
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      return signInWithRedirect(auth, provider);
    }
    throw e;
  }
}

// Email + password accounts
export function signInEmail(email, password) {
  needAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function createAccount(email, password, name) {
  needAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) { try { await updateProfile(cred.user, { displayName: name }); } catch {} }
  return cred;
}

export function resetPassword(email) {
  needAuth();
  return sendPasswordResetEmail(auth, email);
}

export function signOutUser() {
  return auth ? signOut(auth) : Promise.resolve();
}
