// Firebase setup (Google + email login, Firestore database). No need to edit this file.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, where, orderBy, getDocs, serverTimestamp, writeBatch, documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const isConfigured = !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("PASTE");

let app = null, auth = null, db = null;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Long polling works on networks, antivirus programs and browser add-ons that block the normal live connection
  try { db = initializeFirestore(app, { experimentalForceLongPolling: true }); }
  catch { db = getFirestore(app); }
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


// ---------- Direct database requests (plain HTTPS, no live connection) ----------
// Used for saving listings and loading the shop: one quick request with a clear answer.
const API = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const docName = path => `projects/${firebaseConfig.projectId}/databases/(default)/documents/${path}`;

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: encFields(v) } };
}
const encFields = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)]));
function dec(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) { const ms = Date.parse(v.timestampValue); return { seconds: Math.floor(ms / 1000), nanoseconds: 0, toDate: () => new Date(ms) }; }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return decFields(v.mapValue.fields || {});
  return null;
}
const decFields = f => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, dec(x)]));

async function call(url, body, ms = 30000) {
  const headers = { "Content-Type": "application/json" };
  if (auth && auth.currentUser) headers.Authorization = "Bearer " + await auth.currentUser.getIdToken();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  let r;
  try { r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal }); }
  catch (e) { throw Object.assign(new Error("network"), { code: e.name === "AbortError" ? "timeout" : "network" }); }
  finally { clearTimeout(timer); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const st = (j.error && j.error.status) || "";
    const code = st === "PERMISSION_DENIED" ? "permission-denied" : st === "NOT_FOUND" ? "not-found"
      : st === "UNAUTHENTICATED" ? "unauthenticated" : st === "INVALID_ARGUMENT" ? "invalid-argument" : (st.toLowerCase() || "http-" + r.status);
    throw Object.assign(new Error((j.error && j.error.message) || "HTTP " + r.status), { code });
  }
  return j;
}

export const rest = {
  newId() {
    const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const a = crypto.getRandomValues(new Uint8Array(20));
    return Array.from(a, b => c[b % c.length]).join("");
  },
  // set (merge = only the given fields change)
  set: (path, data, merge = false, ms) => call(`${API}:commit?key=${firebaseConfig.apiKey}`, { writes: [{
    update: { name: docName(path), fields: encFields(data) },
    ...(merge ? { updateMask: { fieldPaths: Object.keys(data).filter(k => data[k] !== undefined).map(k => /^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : "`" + k + "`") } } : {})
  }] }, ms),
  del: (path, ms) => call(`${API}:commit?key=${firebaseConfig.apiKey}`, { writes: [{ delete: docName(path) }] }, ms),
  // simple query: where field op value  (op: "EQUAL" | "IN")
  async query(collection, field, op, value, ms) {
    const res = await call(`${API}:runQuery?key=${firebaseConfig.apiKey}`, { structuredQuery: {
      from: [{ collectionId: collection }],
      ...(field ? { where: { fieldFilter: { field: { fieldPath: field }, op, value: enc(value) } } } : {})
    } }, ms);
    return (Array.isArray(res) ? res : []).filter(x => x.document).map(x => ({ id: x.document.name.split("/").pop(), ...decFields(x.document.fields || {}) }));
  }
};
