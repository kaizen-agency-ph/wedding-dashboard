import { requireAuth, logout, db } from "./auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as signOutSecondary
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

let adminEmail = "";

document.getElementById("logout-link").addEventListener("click", (e) => {
  e.preventDefault();
  logout();
});

/**
 * Creates a new Firebase Auth account WITHOUT signing the admin out of
 * their own session. Trick: spin up a second, throwaway Firebase App
 * instance, run createUserWithEmailAndPassword on ITS auth object
 * (which doesn't touch the primary app's auth state), then tear the
 * throwaway instance down.
 *
 * Caveat: because the Firebase config is public (by design), a
 * technically savvy visitor could call the SDK directly from a
 * console and self-register an Auth account. That's fine — self
 * registering an Auth account grants NOTHING by itself, because
 * dashboard/admin access is gated separately by the allowedUsers
 * Firestore doc, which only an existing admin can create (enforced
 * by firestore.rules). Locking down account creation itself would
 * require a Cloud Function, which needs the paid Blaze plan.
 */
async function createSecondaryUser(email, password) {
  const secondary = initializeApp(firebaseConfig, "Secondary-" + Date.now());
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOutSecondary(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
  }
}

document.getElementById("create-user").addEventListener("click", async () => {
  const email = document.getElementById("new-email").value.trim();
  const password = document.getElementById("new-password").value;
  const role = document.getElementById("new-role").value;
  const errorEl = document.getElementById("create-error");
  errorEl.textContent = "";

  if (!email || password.length < 6) {
    errorEl.textContent = "Enter an email and a password of at least 6 characters.";
    return;
  }

  try {
    const uid = await createSecondaryUser(email, password);
    await setDoc(doc(db, "allowedUsers", uid), {
      email,
      role,
      addedAt: serverTimestamp(),
      addedBy: adminEmail
    });
    document.getElementById("new-email").value = "";
    document.getElementById("new-password").value = "";
    await loadUsers();
  } catch (err) {
    console.error(err);
    if (err.code === "auth/email-already-in-use") {
      errorEl.textContent = "That email already has a login. If they just need dashboard access restored, that's not supported yet in this build — recreate under a different email or extend this script.";
    } else {
      errorEl.textContent = "Couldn't create the account: " + err.message;
    }
  }
});

let allUsers = []; // cached in-memory copy of allowedUsers, refreshed on load/create/revoke

async function loadUsers() {
  const snap = await getDocs(collection(db, "allowedUsers"));
  allUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderStats();
  renderTable();
}

function renderStats() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const count = (role) => allUsers.filter((u) => u.role === role).length;
  const addedThisWeek = allUsers.filter((u) => {
    const t = u.addedAt && u.addedAt.toDate ? u.addedAt.toDate().getTime() : null;
    return t != null && t >= weekAgo;
  }).length;

  document.getElementById("stat-total").textContent = allUsers.length;
  document.getElementById("stat-couples").textContent = count("couple");
  document.getElementById("stat-coordinators").textContent = count("coordinator");
  document.getElementById("stat-admins").textContent = count("admin");
  document.getElementById("stat-new").textContent = addedThisWeek;
}

function renderTable() {
  const filter = document.getElementById("role-filter").value;
  const rows = filter ? allUsers.filter((u) => u.role === filter) : allUsers;

  const body = document.getElementById("users-body");
  body.innerHTML = "";
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="hint" style="text-align:center;padding:20px 0">No accounts match this filter.</td></tr>';
    return;
  }
  rows.forEach((data) => {
    const tr = document.createElement("tr");
    const added = data.addedAt && data.addedAt.toDate ? data.addedAt.toDate().toLocaleDateString() : "—";
    tr.innerHTML = `
      <td>${escapeHtml(data.email || "")}</td>
      <td><span class="badge ${data.role}">${data.role}</span></td>
      <td>${added}</td>
      <td><button class="btn danger" data-id="${data.id}" data-action="revoke">Revoke</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-action="revoke"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Revoke this person's dashboard access?")) return;
      await deleteDoc(doc(db, "allowedUsers", btn.dataset.id));
      await loadUsers();
    });
  });
}

document.getElementById("role-filter").addEventListener("change", renderTable);

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

requireAuth((user, access) => {
  adminEmail = access.email || user.email;
  document.getElementById("user-email").textContent = adminEmail;
  loadUsers();
}, { requireAdmin: true });
