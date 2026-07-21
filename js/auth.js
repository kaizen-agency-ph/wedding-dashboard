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
 * addedAt, active}) if the account has been granted access by an admin
 * AND hasn't been revoked, or null otherwise. This is the real
 * access-control gate — having a valid Firebase Auth login is NOT
 * enough on its own.
 *
 * Revoking access sets active:false rather than deleting the doc (so
 * the admin panel can restore it later without losing the role/history).
 * `active` missing entirely is treated as active, for docs created
 * before this field existed.
 */
export async function checkAccess(user) {
  const snap = await getDoc(doc(db, "allowedUsers", user.uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.active === false) return null;
  return data;
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
 * Given an access.role ("admin" | "couple" | "coordinator"), returns the
 * page that account type should land on after login. Used by index.html
 * (post-login redirect) and requireAuth (wrong-page redirect).
 */
export function homeForRole(role) {
  if (role === "admin") return "admin.html";
  if (role === "coordinator") return "coordinator.html";
  if (role === "couple") return "couple.html";
  return "index.html";
}

/**
 * Guard for protected pages. Call this at the top of couple.html /
 * coordinator.html / admin.html. Redirects to login if not authenticated,
 * or if authenticated but not in allowedUsers. Calls onReady(user, access)
 * once checks pass.
 *
 * Options:
 *   - requireAdmin: true   -> only role "admin" may proceed (admin.html)
 *   - allowedRoles: [...]  -> only these roles may proceed (couple.html
 *                             passes ["couple"], coordinator.html passes
 *                             ["coordinator"]). A signed-in user with the
 *                             wrong role gets bounced to THEIR correct
 *                             page instead of stuck on the wrong one.
 */
export function requireAuth(onReady, { requireAdmin = false, allowedRoles = null } = {}) {
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
      window.location.href = homeForRole(access.role);
      return;
    }
    if (allowedRoles && !allowedRoles.includes(access.role)) {
      window.location.href = homeForRole(access.role);
      return;
    }
    onReady(user, access);
  });
}
