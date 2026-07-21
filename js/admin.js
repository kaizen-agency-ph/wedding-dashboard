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
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  where
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

/** Finds an allowedUsers doc by email (docs are keyed by UID, not email,
 * so this needs a query). Returns { id, ...data } or null. */
async function findAllowedUserByEmail(email) {
  const q = query(collection(db, "allowedUsers"), where("email", "==", email));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
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
      active: true,
      addedAt: serverTimestamp(),
      addedBy: adminEmail
    });
    document.getElementById("new-email").value = "";
    document.getElementById("new-password").value = "";
    await loadUsers();
  } catch (err) {
    console.error(err);
    if (err.code === "auth/email-already-in-use") {
      // The Firebase Auth login already exists. If it's a previously
      // revoked account, restore it (reusing the same UID) instead of
      // erroring out — this is the common "un-revoke" path.
      const existing = await findAllowedUserByEmail(email);
      if (existing && existing.active === false) {
        await setDoc(doc(db, "allowedUsers", existing.id), {
          email,
          role,
          active: true,
          restoredAt: serverTimestamp(),
          restoredBy: adminEmail
        }, { merge: true });
        document.getElementById("new-email").value = "";
        document.getElementById("new-password").value = "";
        await loadUsers();
      } else if (existing) {
        errorEl.textContent = "That email already has active dashboard access — no need to recreate it.";
      } else {
        errorEl.textContent = "That email already has a login, but no access record was found to restore (it was likely revoked before this update, using the old delete-based revoke). Find their UID in Firebase Console → Authentication → Users, then add it back manually under allowedUsers in Firestore — same steps as the original admin bootstrap.";
      }
    } else {
      errorEl.textContent = "Couldn't create the account: " + err.message;
    }
  }
});

let allUsers = []; // cached in-memory copy of allowedUsers, refreshed on load/create/revoke
let pricing = null; // { couple, coordinator } in PHP, or null until set/loaded

async function loadUsers() {
  const snap = await getDocs(collection(db, "allowedUsers"));
  allUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderStats();
  renderTable();
}

async function loadPricing() {
  // Best-effort: if this fails (e.g. Firestore rules haven't been published
  // yet with the settings/pricing match), don't let it block the rest of
  // the page — just show "Set pricing" until it can load successfully.
  try {
    const snap = await getDoc(doc(db, "settings", "pricing"));
    pricing = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Couldn't load pricing — check that firestore.rules includes the settings/{docId} match and has been published:", err);
    pricing = null;
  }
  document.getElementById("price-couple").value = pricing && pricing.couple != null ? pricing.couple : "";
  document.getElementById("price-coordinator").value = pricing && pricing.coordinator != null ? pricing.coordinator : "";
  renderStats();
}

function peso(n) { return "₱" + Number(n || 0).toLocaleString(); }

function renderStats() {
  // Revoked accounts are excluded from every stat below (including the
  // account-type counts) since they're no longer using or paying for
  // the product. They still show up in the table further down so an
  // admin can find and restore them.
  const active = allUsers.filter((u) => u.active !== false);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const count = (role) => active.filter((u) => u.role === role).length;
  const isRecent = (u) => {
    const t = u.addedAt && u.addedAt.toDate ? u.addedAt.toDate().getTime() : null;
    return t != null && t >= weekAgo;
  };
  const nCouples = count("couple");
  const nCoordinators = count("coordinator");
  const addedThisWeek = active.filter(isRecent).length;

  document.getElementById("stat-total").textContent = active.length;
  document.getElementById("stat-couples").textContent = nCouples;
  document.getElementById("stat-coordinators").textContent = nCoordinators;
  document.getElementById("stat-admins").textContent = count("admin");
  document.getElementById("stat-new").textContent = addedThisWeek;

  const revEl = document.getElementById("stat-revenue");
  const revWeekEl = document.getElementById("stat-revenue-week");
  const revAvgEl = document.getElementById("stat-revenue-avg");

  if (!pricing || (pricing.couple == null && pricing.coordinator == null)) {
    revEl.textContent = "Set pricing";
    revWeekEl.textContent = "—";
    revAvgEl.textContent = "—";
    return;
  }

  const cP = Number(pricing.couple) || 0;
  const coP = Number(pricing.coordinator) || 0;
  const total = nCouples * cP + nCoordinators * coP;
  const payingAccounts = nCouples + nCoordinators;
  const weekRevenue = active.filter(isRecent).reduce((sum, u) => {
    if (u.role === "couple") return sum + cP;
    if (u.role === "coordinator") return sum + coP;
    return sum;
  }, 0);

  revEl.textContent = peso(total);
  revWeekEl.textContent = peso(weekRevenue);
  revAvgEl.textContent = payingAccounts ? peso(total / payingAccounts) : "—";
}

document.getElementById("save-pricing").addEventListener("click", async () => {
  const errorEl = document.getElementById("pricing-error");
  errorEl.textContent = "";
  const coupleVal = document.getElementById("price-couple").value;
  const coordinatorVal = document.getElementById("price-coordinator").value;

  if (coupleVal === "" && coordinatorVal === "") {
    errorEl.textContent = "Enter at least one price.";
    return;
  }

  try {
    await setDoc(doc(db, "settings", "pricing"), {
      couple: coupleVal === "" ? null : Number(coupleVal),
      coordinator: coordinatorVal === "" ? null : Number(coordinatorVal),
      updatedAt: serverTimestamp(),
      updatedBy: adminEmail
    });
    await loadPricing();
    const tag = document.getElementById("pricing-saved");
    tag.classList.add("show");
    setTimeout(() => tag.classList.remove("show"), 1500);
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Couldn't save pricing: " + err.message;
  }
});

function renderTable() {
  const filter = document.getElementById("role-filter").value;
  const rows = filter ? allUsers.filter((u) => u.role === filter) : allUsers;

  const body = document.getElementById("users-body");
  body.innerHTML = "";
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="hint" style="text-align:center;padding:20px 0">No accounts match this filter.</td></tr>';
    return;
  }
  rows.forEach((data) => {
    const revoked = data.active === false;
    const tr = document.createElement("tr");
    if (revoked) tr.style.opacity = "0.55";
    const added = data.addedAt && data.addedAt.toDate ? data.addedAt.toDate().toLocaleDateString() : "—";
    const actionBtn = revoked
      ? `<button class="btn" data-id="${data.id}" data-action="restore">Restore</button>`
      : `<button class="btn danger" data-id="${data.id}" data-action="revoke">Revoke</button>`;
    tr.innerHTML = `
      <td>${escapeHtml(data.email || "")}</td>
      <td><span class="badge ${data.role}">${data.role}</span></td>
      <td>${revoked ? '<span class="badge" style="background:#f1e1e1;color:#8a6d6d">Revoked</span>' : '<span class="badge user">Active</span>'}</td>
      <td>${added}</td>
      <td>${actionBtn}</td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-action="revoke"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Revoke this person's dashboard access? You can restore it later without recreating the account.")) return;
      await setDoc(doc(db, "allowedUsers", btn.dataset.id), {
        active: false,
        revokedAt: serverTimestamp(),
        revokedBy: adminEmail
      }, { merge: true });
      await loadUsers();
    });
  });
  body.querySelectorAll('[data-action="restore"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      await setDoc(doc(db, "allowedUsers", btn.dataset.id), {
        active: true,
        restoredAt: serverTimestamp(),
        restoredBy: adminEmail
      }, { merge: true });
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

requireAuth(async (user, access) => {
  adminEmail = access.email || user.email;
  document.getElementById("user-email").textContent = adminEmail;
  await loadUsers();   // critical — the account table must load regardless of pricing status
  await loadPricing(); // best-effort — won't block the table above if it fails
}, { requireAdmin: true });
