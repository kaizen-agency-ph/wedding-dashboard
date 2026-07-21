# Setup Guide — Wedding Planning Dashboard (GitHub Pages + Firebase)

## Account types

Every account has a `role` of `couple`, `coordinator`, or `admin`, set when an admin creates the account in the Admin Panel. After login, the app routes automatically:

- `couple` → `couple.html` (single-wedding planner: budget, checklist, vendors, seating)
- `coordinator` → `coordinator.html` (multi-wedding dashboard for managing several clients)
- `admin` → `admin.html` (add/revoke logins only — no planning UI)

If a couple account somehow lands on `coordinator.html` (or vice versa) — e.g. by guessing the URL — the app checks their role and bounces them to their correct page automatically.

Note: `couple.html` and `coordinator.html` save their wedding planning data in the browser's `localStorage`, not in Firestore. Firestore's only job is the login gate (deciding who gets in and which role they have) — it doesn't store checklist/budget/guest data. That means each device keeps its own copy of the data; there's no cross-device sync built in yet.


This app is static (HTML/CSS/JS) so GitHub Pages can host it for free. Login and the admin panel run on Firebase, also free at this scale (Spark plan). Follow these steps in order — steps 1-4 happen once, before anything goes live.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it (e.g. "wedding-dashboard-ph"), disable Google Analytics if you don't need it, click **Create project**.

## 2. Turn on Email/Password login

1. In the left sidebar: **Build > Authentication > Get started**.
2. Under **Sign-in method**, enable **Email/Password**. Save.

## 3. Turn on Firestore (the database)

1. Left sidebar: **Build > Firestore Database > Create database**.
2. Choose **Production mode**. Pick a region close to your users (e.g. `asia-southeast1` for the Philippines).
3. Once created, go to the **Rules** tab, delete the default contents, and paste in everything from `firestore.rules` (included in this folder). Click **Publish**.

## 4. Get your web app config

1. Left sidebar: click the gear icon > **Project settings**.
2. Under **Your apps**, click the **</>** (web) icon to register a new web app. Give it any nickname. You do NOT need Firebase Hosting — skip that checkbox.
3. Firebase shows you a `firebaseConfig` object. Copy the values into `js/firebase-config.js` in this project, replacing the placeholder `"YOUR_..."` strings.

## 5. Bootstrap your first admin account

There's no signup form in this app on purpose — accounts are admin-only. So the very first admin has to be created by hand:

1. Firebase Console > **Authentication > Users > Add user**. Enter your own email and a password. Click **Add user**, then copy the **User UID** it shows you.
2. Firebase Console > **Firestore Database > Data**. Click **Start collection**, name it exactly `allowedUsers`.
3. For the **Document ID**, paste the UID you copied. Add these fields:
   - `email` (string) — your email, exactly as entered above
   - `role` (string) — `admin`
   - `addedAt` (timestamp) — click the clock icon, use "now"
4. Save. You can now log into the app with that email/password and you'll see the **Admin Panel** link — use it to add everyone else instead of repeating steps 5.1-5.3.

## 6. Push the code to GitHub

From a terminal, inside this `wedding-dashboard` folder:

```bash
git init
git add .
git commit -m "Wedding planning dashboard with Firebase auth"
```

Then on github.com: create a new repository (public or private — Pages works with either on a paid plan; public repos get free Pages on any plan). Don't initialize it with a README. Copy the commands GitHub shows you, something like:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## 7. Turn on GitHub Pages

1. On the repo page: **Settings > Pages**.
2. Under **Build and deployment > Source**, choose **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. Wait 1-2 minutes. Your site will be live at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO/`

Go there — you should land on the login page.

## 8. Add your Firebase authorized domain

Firebase blocks auth requests from domains it doesn't recognize:

1. Firebase Console > **Authentication > Settings > Authorized domains**.
2. Click **Add domain**, enter `YOUR_USERNAME.github.io`. Save.

Without this step, login will fail with an `auth/unauthorized-domain` error.

## 9. Test end to end

1. Visit the Pages URL, sign in with your bootstrap admin account.
2. Click **Admin Panel**, add a second test user (any email/password, role "user").
3. Sign out, sign back in as that test user — confirm you land on the dashboard but don't see the Admin Panel link.
4. Add a checklist item / budget line / guest as the test user, refresh the page — it should still be there (confirms Firestore save/load is working).
5. Back in the admin account, revoke the test user, confirm they're kicked out on next login.

## Known limits of this setup (worth knowing, not blockers)

- **Revoke ≠ delete.** Revoking removes their `allowedUsers` doc (blocks dashboard access) but their Firebase Auth login technically still exists. Deleting it outright needs the Firebase Admin SDK, which needs a real backend (Cloud Functions, paid Blaze plan). Fine for now — just don't hand out passwords carelessly.
- **No self-service password reset.** If someone forgets their password, an admin currently has to recreate their account under a new email, or you extend `admin.js` to call Firebase's `sendPasswordResetEmail`.
- **Firebase config in the JS is public.** That's normal and expected for Firebase — it's not a secret key. Actual security is enforced by `firestore.rules`, not by hiding the config.
- **Free tier limits.** Spark plan gives ~50K Firestore reads/day and generous Auth quota — plenty for early customers. You'll get a Firebase Console warning well before you'd need to upgrade.
