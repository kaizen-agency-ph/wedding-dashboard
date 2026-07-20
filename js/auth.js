// ============================================================
// SHARED AUTH MODULE
// Handles Firebase init, sign-in/out, and the "allowedUsers" gate.
// Imported by index.html (login), dashboard.html, and admin.html.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Looks up allowedUsers/{uid}. Returns the doc data ({email, role,
 * addedAt}) if the account has been granted access by an admin,
 * or null if not. This is the real access-control gate — having a
 * valid Firebase Auth login is NOT enough on its own.
 */
export async function checkAccess(user) {
  const snap = await getDoc(doc(db, "allowedUsers", user.uid));
  return snap.exists() ? snap.data() : null;
}

/** Sign in with email/password. Throws on failure (bad credentials). */
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign the current user out and send them back to the login page. */
export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

/**
 * Guard for protected pages. Call this at the top of dashboard.html /
 * admin.html. Redirects to login if not authenticated, or if
 * authenticated but not in allowedUsers. Calls onReady(user, access)
 * once both checks pass. Set requireAdmin=true on admin.html.
 */
export function requireAuth(onReady, { requireAdmin = false } = {}) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const access = await checkAccess(user);
    if (!access) {
      alert("This account has not been granted access. Contact your admin.");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }
    if (requireAdmin && access.role !== "admin") {
      alert("Admin access only.");
      window.location.href = "dashboard.html";
      return;
    }
    onReady(user, access);
  });
}
