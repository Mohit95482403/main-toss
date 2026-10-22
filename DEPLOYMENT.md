# DADDY TOSS BOOK — PRODUCTION DEPLOYMENT GUIDE (VERCEL + RENDER + MYSQL)

This guide provides step-by-step, beginner-friendly instructions to deploy the **DADDY TOSS BOOK** platform to production:
- **Frontend**: [Vercel](https://vercel.com) (Static HTML, Vanilla JavaScript, CSS)
- **Backend API**: [Render](https://render.com) (Node.js & Express Web Service)
- **Database**: Existing MySQL Database (Cloud MySQL, Aiven, PlanetScale, Railway, AWS RDS, etc.)

---

## Architecture Overview

```
                      ┌─────────────────────────────────┐
                      │         Vercel (Frontend)       │
                      │  https://your-app.vercel.app    │
                      └────────────────┬────────────────┘
                                       │
                      REST API / CORS  │ Authorization: Bearer <token>
                                       ▼
                      ┌─────────────────────────────────┐
                      │          Render (Backend)       │
                      │ https://your-backend.onrender...│
                      └────────────────┬────────────────┘
                                       │
                      MySQL Connection │ (SSL/TLS Encrypted)
                                       ▼
                      ┌─────────────────────────────────┐
                      │         MySQL Database          │
                      │  (Existing Database & Tables)   │
                      └─────────────────────────────────┘
```

---

## Step 1 — Prepare GitHub Repository

Before deploying, ensure your Git repository is updated and clean of any private credentials.

### 1.1 Verify Git Status & Secret Exclusion
Open your terminal in the project root directory and run:

```bash
git status
```

Check that:
- `.env` and `backend/.env` are **NOT** listed under staged or untracked files (they are protected by `.gitignore`).
- Only source code, configuration templates (`.env.example`), and `vercel.json` are committed.

### 1.2 Commit and Push Changes to GitHub
```bash
git add .
git commit -m "chore: prepare production deployment for Vercel and Render"
git push origin main
```

*(Replace `main` with your active Git branch if different).*

---

## Step 2 — Configure Existing MySQL Database

Your application works with your existing MySQL database. No tables will be deleted or dropped.

### 2.1 Gather Database Connection Details
From your MySQL database provider dashboard, retrieve:
- **Host**: e.g., `mysql-1234.provider.com`
- **Port**: usually `3306`
- **Database Name**: e.g., `daddy_toss_book`
- **Username**: e.g., `db_user`
- **Password**: e.g., `your_strong_password`
- **Connection URL** (optional): `mysql://db_user:password@hostname:3306/daddy_toss_book?ssl-mode=REQUIRED`

### 2.2 Verify SSL Requirements
- Most cloud databases (Aiven, DigitalOcean, PlanetScale, AWS RDS) require TLS/SSL encryption.
- The backend automatically supports `DB_SSL=true`.
- If your provider uses a self-signed or internal CA certificate, you can set `DB_SSL_REJECT_UNAUTHORIZED=false` or provide the certificate via `DB_SSL_CA`.

---

## Step 3 — Deploy the Backend on Render

Deploy the backend first so you have your production API URL ready for the frontend.

### 3.1 Create a Web Service on Render
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository (`Mohit95482403/main-toss` or your repository).

### 3.2 Configure Service Settings
Fill in the following fields:

| Field | Value | Notes |
|---|---|---|
| **Name** | `daddy-toss-book-backend` | Or any unique name |
| **Region** | Select region closest to your users | e.g., Singapore or Frankfurt |
| **Branch** | `main` | Your production Git branch |
| **Root Directory** | `backend` | *(Or leave empty if using root scripts)* |
| **Runtime** | `Node` | |
| **Build Command** | `npm install` | If Root Directory is `backend` (or `npm run build` if root) |
| **Start Command** | `npm start` | (Executes `node app.js`) |
| **Instance Type** | Free or Starter | |

### 3.3 Configure Health Check
Scroll down to **Advanced** settings:
- **Health Check Path**: `/health` (or `/api/health`)

### 3.4 Add Environment Variables on Render
Under **Environment Variables**, click **Add Environment Variable** for each:

| Key | Example Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production security checks |
| `PORT` | `10000` | Render injects this automatically |
| `HOST` | `0.0.0.0` | Binds to all network interfaces |
| `TRUST_PROXY` | `true` | Required for secure HTTPS headers behind Render proxy |
| `SERVE_STATIC_FRONTEND` | `false` | Frontend is hosted on Vercel |
| `DB_HOST` | `your-db-host.com` | Your MySQL Host *(or use `DATABASE_URL`)* |
| `DB_PORT` | `3306` | Your MySQL Port |
| `DB_USER` | `your_db_username` | Your MySQL Username |
| `DB_PASSWORD` | `your_db_password` | Your MySQL Password |
| `DB_NAME` | `your_db_name` | Your MySQL Database Name |
| `DB_SSL` | `true` | `true` for cloud MySQL, `false` if local/unencrypted |
| `SESSION_SECRET` | *(Random 32+ characters)* | Generate using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FRONTEND_URL` | `https://placeholder.vercel.app` | *Temporary placeholder until Vercel URL is known (updated in Step 5)* |

> **Note on Team Logo Uploads (Optional)**:
> By default, Render Web Services have an ephemeral filesystem. If you want team logo uploads to persist across backend restarts and redeployments, click **Disks** in Render settings, attach a 1 GB Persistent Disk mounted at `/var/data/uploads`, and add the environment variable:
> `UPLOADS_DIR=/var/data/uploads`

### 3.5 Deploy Backend
Click **Create Web Service**. Wait 2–3 minutes for the build to finish.
Once deployed, copy your Render URL:
`https://daddy-toss-book-backend.onrender.com`

Verify it is online by visiting in your browser:
`https://daddy-toss-book-backend.onrender.com/health`
Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "probe": "liveness"
}
```

---

## Step 4 — Deploy the Frontend on Vercel

### 4.1 Import Project into Vercel
1. Log in to [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Select your GitHub repository.

### 4.2 Configure Build & Output Settings
In the Project Configuration screen:
- **Framework Preset**: `Other`
- **Root Directory**: Click **Edit** and choose `frontend` (or leave as root `./`).
- **Build Command**: Leave empty / disabled (pure static HTML/JS).
- **Output Directory**: Leave empty / default.

### 4.3 Configure Production Backend API URL
You have two easy, beginner-friendly ways to configure your backend URL for the static frontend:

#### Option A: In `frontend/js/config.js` (Recommended & Simplest)
Before or right after the first push, open [frontend/js/config.js](file:///frontend/js/config.js) and paste your Render URL into the `PRODUCTION_BACKEND_URL` variable at the top of the file:

```javascript
const PRODUCTION_BACKEND_URL = 'https://daddy-toss-book-backend.onrender.com';
```

Then commit and push:
```bash
git add frontend/js/config.js
git commit -m "chore: set production backend URL"
git push origin main
```

#### Option B: In Vercel Environment Variables
Add an Environment Variable in Vercel project settings:
- **Name**: None needed (static HTML does not read server environment variables at build time). Option A is the native, reliable approach for Vanilla JavaScript.

### 4.4 Deploy
Click **Deploy**.
Vercel will deploy your static site in ~30 seconds.
Copy your production Vercel URL:
`https://daddy-toss-book.vercel.app`

---

## Step 5 — Connect Frontend and Backend (CORS & Environment Setup)

Now that both production URLs are known, link them together.

### 5.1 Update Backend CORS on Render
1. Open your **Render Dashboard** → Select `daddy-toss-book-backend`.
2. Go to **Environment** tab.
3. Update the `FRONTEND_URL` variable to your actual Vercel domain:
   ```
   FRONTEND_URL = https://daddy-toss-book.vercel.app
   ```
4. If you have custom domains or preview URLs, add:
   ```
   ALLOWED_ORIGINS = https://daddy-toss-book.vercel.app,https://yourcustomdomain.com
   ALLOW_VERCEL_PREVIEWS = true
   ```
5. Click **Save Changes**. Render will automatically redeploy the backend in ~30 seconds.

### 5.2 Confirm Frontend Config
Ensure [frontend/js/config.js](file:///frontend/js/config.js) contains your exact Render URL (without trailing slashes):
```javascript
const PRODUCTION_BACKEND_URL = 'https://daddy-toss-book-backend.onrender.com';
```

---

## Step 6 — Production Verification & Smoke Testing

Perform the following verification checks on your deployed live website:

### 6.1 Backend Health & Readiness
Open in your browser:
- `https://your-backend.onrender.com/health` (Should return `{"success": true, "status": "healthy"}`)
- `https://your-backend.onrender.com/api/health/ready` (Should return `{"success": true, "status": "ready"}` with database online)

### 6.2 Frontend Page Navigation & Refresh Test
Visit your Vercel site:
1. Open `https://your-frontend.vercel.app` → Home page with Light Pistachio Green & White theme should load.
2. Open `https://your-frontend.vercel.app/login` → Login card should display cleanly.
3. **Press Browser Refresh (F5)** on `/login` and `/bets` → The page should refresh without 404 errors (handled by `vercel.json` cleanUrls and rewrites).

### 6.3 User Authentication
1. Log in with the standard user account (`dtb1` or a newly registered user).
2. Check that the wallet balance and exposure appear in the top-right header.
3. Open browser Developer Tools (`F12` → **Network** tab):
   - Verify API requests go to `https://your-backend.onrender.com/api/...`.
   - Verify all responses return `200 OK` (no CORS red errors).

### 6.4 Mandatory First-Login Password Change (If applicable)
1. Log in as an administrator at `https://your-frontend.vercel.app/admin`.
2. Navigate to **User Management** → Create a test user with a temporary password.
3. Open an Incognito window and log in as that new user.
4. Verify the **Mandatory Password Change Modal** appears immediately and locks navigation until a new password is set.

### 6.5 Admin Panel & Match Management
1. Log in as `@admin` on `/admin`.
2. Verify Admin Dashboard stats, System Diagnostics, Coin Management, and Match Creation.

---

## Quick Reference / Troubleshooting

### Q: Browser Console shows "CORS error: Access-Control-Allow-Origin"?
- **Cause**: The Vercel URL does not match the `FRONTEND_URL` configured on Render.
- **Fix**: Open Render Dashboard → Environment → Verify `FRONTEND_URL` is set to `https://your-app.vercel.app` (ensure no trailing slash `/`).

### Q: Render Backend logs "Database connection failed"?
- **Cause**: Incorrect database credentials or firewall blocking Render IP.
- **Fix**:
  1. Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in Render environment variables.
  2. For AWS RDS / Aiven, ensure your database allows inbound connections from `0.0.0.0/0` (or Render's outbound IPs).
  3. Ensure `DB_SSL=true`.

### Q: Render Web Service goes to sleep?
- **Note**: On Render Free tier, web services spin down after 15 minutes of inactivity. The first request after sleep may take ~30-50 seconds to wake up. Upgrading to a Render Starter plan ($7/mo) keeps the backend perpetually active.

---

## Production Readiness Checklist

- [x] Node.js Express server configured for Render (`0.0.0.0`, dynamic `PORT`, reverse proxy trust).
- [x] Lightweight `/health` and `/api/health` probes active.
- [x] MySQL connection pooling with SSL/TLS support and graceful shutdown.
- [x] CORS origin whitelisting configured for production Vercel frontend.
- [x] Static Vanilla JS frontend configured with `PRODUCTION_BACKEND_URL` and auto-fallback.
- [x] Zero hardcoded localhost references in production runtime code.
- [x] `vercel.json` configured with clean URLs, named page rewrites, and security headers.
- [x] No credentials or secrets committed to Git repository (`.gitignore` audit complete).
- [x] 100% regression tests passed (Coin management, betting integrity, mandatory password change).
