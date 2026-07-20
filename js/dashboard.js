import { requireAuth, logout, db } from "./auth.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let state = { checklist: [], budget: [], guests: [] };
let saveTimer = null;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---- Tabs ----
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("panel-" + tab.dataset.panel).classList.add("active");
  });
});

// ---- Persistence ----
async function loadData(user) {
  const snap = await getDoc(doc(db, "weddings", user.uid));
  if (snap.exists()) {
    state = Object.assign({ checklist: [], budget: [], guests: [] }, snap.data());
  }
  render();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 500);
}

async function saveData() {
  if (!currentUser) return;
  await setDoc(doc(db, "weddings", currentUser.uid), state, { merge: false });
  const tag = document.getElementById("saved-tag");
  tag.classList.add("show");
  setTimeout(() => tag.classList.remove("show"), 1200);
}

// ---- Checklist ----
document.getElementById("checklist-add").addEventListener("click", () => {
  const input = document.getElementById("checklist-input");
  const dateInput = document.getElementById("checklist-date");
  if (!input.value.trim()) return;
  state.checklist.push({ id: uid(), text: input.value.trim(), due: dateInput.value, done: false });
  input.value = "";
  dateInput.value = "";
  render();
  scheduleSave();
});

function renderChecklist() {
  const body = document.getElementById("checklist-body");
  body.innerHTML = "";
  state.checklist.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" ${item.done ? "checked" : ""} data-id="${item.id}" class="chk-done" /></td>
      <td class="${item.done ? "done" : ""}">${escapeHtml(item.text)}</td>
      <td>${item.due || ""}</td>
      <td><button class="icon-btn" data-id="${item.id}" data-action="del-checklist">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll(".chk-done").forEach((cb) => {
    cb.addEventListener("change", () => {
      const item = state.checklist.find((c) => c.id === cb.dataset.id);
      item.done = cb.checked;
      render();
      scheduleSave();
    });
  });
  body.querySelectorAll('[data-action="del-checklist"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state.checklist = state.checklist.filter((c) => c.id !== btn.dataset.id);
      render();
      scheduleSave();
    });
  });
}

// ---- Budget ----
document.getElementById("budget-add").addEventListener("click", () => {
  const item = document.getElementById("budget-item");
  const amount = document.getElementById("budget-amount");
  const status = document.getElementById("budget-status");
  if (!item.value.trim() || !amount.value) return;
  state.budget.push({
    id: uid(),
    item: item.value.trim(),
    amount: parseFloat(amount.value) || 0,
    status: status.value
  });
  item.value = "";
  amount.value = "";
  render();
  scheduleSave();
});

function renderBudget() {
  const body = document.getElementById("budget-body");
  body.innerHTML = "";
  state.budget.forEach((b) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(b.item)}</td>
      <td>₱${Number(b.amount).toLocaleString()}</td>
      <td>${b.status === "paid" ? '<span class="badge user">Paid</span>' : '<span class="badge admin">Planned</span>'}</td>
      <td><button class="icon-btn" data-id="${b.id}" data-action="del-budget">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-action="del-budget"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state.budget = state.budget.filter((b) => b.id !== btn.dataset.id);
      render();
      scheduleSave();
    });
  });
}

// ---- Guests ----
document.getElementById("guest-add").addEventListener("click", () => {
  const name = document.getElementById("guest-name");
  const status = document.getElementById("guest-status");
  if (!name.value.trim()) return;
  state.guests.push({ id: uid(), name: name.value.trim(), status: status.value });
  name.value = "";
  render();
  scheduleSave();
});

function renderGuests() {
  const body = document.getElementById("guests-body");
  body.innerHTML = "";
  state.guests.forEach((g) => {
    const badgeClass = g.status === "confirmed" ? "user" : g.status === "declined" ? "" : "admin";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(g.name)}</td>
      <td><span class="badge ${badgeClass}">${g.status}</span></td>
      <td><button class="icon-btn" data-id="${g.id}" data-action="del-guest">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-action="del-guest"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      state.guests = state.guests.filter((g) => g.id !== btn.dataset.id);
      render();
      scheduleSave();
    });
  });
}

// ---- Stats + render ----
function renderStats() {
  const doneCount = state.checklist.filter((c) => c.done).length;
  document.getElementById("stat-checklist").textContent = `${doneCount}/${state.checklist.length}`;

  const spent = state.budget.filter((b) => b.status === "paid").reduce((s, b) => s + Number(b.amount), 0);
  const total = state.budget.reduce((s, b) => s + Number(b.amount), 0);
  document.getElementById("stat-spent").textContent = `₱${spent.toLocaleString()}`;
  document.getElementById("stat-remaining").textContent = `₱${(total - spent).toLocaleString()}`;

  const confirmed = state.guests.filter((g) => g.status === "confirmed").length;
  document.getElementById("stat-guests").textContent = `${confirmed}/${state.guests.length}`;
}

function render() {
  renderChecklist();
  renderBudget();
  renderGuests();
  renderStats();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Auth gate + boot ----
document.getElementById("logout-link").addEventListener("click", (e) => {
  e.preventDefault();
  logout();
});

requireAuth((user, access) => {
  currentUser = user;
  document.getElementById("user-email").textContent = access.email || user.email;
  if (access.role === "admin") {
    const link = document.getElementById("admin-link");
    link.style.display = "inline";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "admin.html";
    });
  }
  loadData(user);
});
