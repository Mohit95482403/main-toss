# IRONMAN TOSS BOOK — PRODUCTION DEPLOYMENT & OPERATIONS GUIDE

**Document Version:** 1.0.0 (Day 19 Release Specification)  
**System Classification:** Production Ready Web Platform  
**Target Architecture:** Node.js (v18.x–24.x) + Express.js + MySQL (v8.0+) + Vanilla HTML5/CSS3/ES6+

---

## 1. System Architecture Overview

The **IRONMAN TOSS BOOK** platform is engineered as a decoupled, high-performance web service:

```
[ Client Browsers / Mobile Devices ]
                 │
                 ▼ (HTTPS / TLS 1.3)
      [ Reverse Proxy / Ingress ]
        (Nginx / Cloudflare / ALB)
                 │
         ┌───────┴───────┐
         ▼               ▼
[ Static Assets ]   [ REST API Service ]
 (Port 5500/CDN)     (Node/Express Port 5000)
                         │ (Connection Pool + SSL)
                         ▼
                [ MySQL 8.0 Cluster ]
               (ACID Wallets & Ledgers)
```

- **Frontend Tier**: Zero external UI framework overhead. Vanilla HTML5, CSS3 Custom Properties (Design System tokens), and native ES6+ JavaScript modules. Can be hosted independently on any static web server (Nginx, Cloudflare Pages, S3, Vercel) or served directly via the backend Express service (`SERVE_STATIC_FRONTEND=true`).
- **Backend Tier**: Express.js REST API providing timing-safe scrypt authentication, JWT session lifecycle management, administrative governance, user moderation, and operational diagnostics.
- **Database Tier**: MySQL 8.0 with InnoDB engine, parameterized SQL queries, strict foreign-key cascades, and relational isolation.

---

## 2. Infrastructure Prerequisites

| Component | Minimum Version | Recommended Specification |
| :--- | :--- | :--- |
| **Node.js** | `v18.0.0` LTS | `v22.x` or `v24.x` Active LTS |
| **npm** | `v9.0.0` | `v10.x` or `v11.x` |
| **MySQL** | `v8.0.0` | `v8.0.35+` with InnoDB default engine |
| **Memory** | 512 MB RAM | 1 GB–2 GB RAM (for high concurrency) |
| **vCPU** | 1 Core | 2 Cores |
| **Storage** | 10 GB SSD | 20 GB+ SSD with automated daily snapshots |

---

## 3. Environment Variables Reference

All runtime configuration is managed strictly through environment variables. Never commit actual `.env` files with production credentials to source control.

| Variable | Required | Default (Dev) | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `development` | Runtime mode: `production`, `development`, or `test`. Production enforces strict secret entropy. |
| `PORT` | No | `5000` | TCP port for Express HTTP listener. |
| `TRUST_PROXY` | Production | `false` | Set to `true` or `1` when deployed behind TLS-terminating proxies (Nginx, ALB, Cloudflare). |
| `SERVE_STATIC_FRONTEND` | No | `false` | When `true`, Express serves `frontend/` static assets directly on `/`. |
| `DB_HOST` | Yes | `localhost` | MySQL database host or cluster endpoint. |
| `DB_PORT` | No | `3306` | MySQL TCP port. |
| `DB_NAME` | Yes | `ironman_toss_book` | Database name. |
| `DB_USER` | Yes | `root` | Database username (use a dedicated least-privilege user in production). |
| `DB_PASSWORD` | Production | `""` | Database user password (strictly required in production). |
| `DB_CONNECTION_LIMIT` | No | `10` | MySQL connection pool size (typically 10–25 per backend process). |
| `DB_SSL` | No | `false` | Enable TLS encryption for managed cloud databases (AWS RDS, PlanetScale). |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | `true` | Verify database TLS certificates against system root trust store. |
| `DB_SSL_CA` | No | `undefined` | Optional path or raw PEM content for custom database CA certificate. |
| `FRONTEND_ORIGIN` | Production | `http://localhost:5500` | Allowed CORS origin (e.g., `https://tossbook.yourdomain.com`). |
| `SESSION_SECRET` | Production | *(Insecure Template)* | Minimum 32-character high-entropy secret for HMAC-SHA256 session token signatures. |
| `ADMIN_USERNAME` | First Init | `admin` | Initial super admin username. |
| `ADMIN_EMAIL` | First Init | `admin@ironmantossbook.com` | Initial super admin email. |
| `ADMIN_PASSWORD` | First Init | `Admin@Ironman2026` | Initial super admin password (must be overridden in production). |

---

## 4. Production Deployment Methods

### Option A: Containerized Deployment (Docker & Docker Compose)

The repository provides a production-hardened `Dockerfile` (using `node:22-alpine` and an unprivileged `node` user) and a complete `docker-compose.yml` service specification.

#### 1. Generate Production Environment File
```bash
cp .env.example .env
```
Populate `.env` with strong passwords and a high-entropy `SESSION_SECRET`:
```bash
# Generate high-entropy secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2. Launch Services with Docker Compose
```bash
docker compose up -d --build
```

#### 3. Inspect Container Status and Health
```bash
docker compose ps
docker compose logs -f app
```

---

### Option B: Bare-Metal / Virtual Machine (Systemd + PM2 + Nginx)

#### 1. Clone & Install Dependencies
```bash
git clone <repository-url> /var/www/ironman-toss-book
cd /var/www/ironman-toss-book
npm ci --omit=dev
```

#### 2. Configure Environment File
Create `/var/www/ironman-toss-book/.env` with strict permissions:
```bash
chmod 600 /var/www/ironman-toss-book/.env
chown nodeuser:nodeuser /var/www/ironman-toss-book/.env
```

#### 3. Manage Process with PM2
```bash
npm install -g pm2
pm2 start backend/app.js --name "ironman-api" -i max
pm2 save
pm2 startup
```

#### 4. Configure Nginx Reverse Proxy
```nginx
# /etc/nginx/sites-available/ironman-toss-book.conf

server {
    listen 80;
    server_name tossbook.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tossbook.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/tossbook.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tossbook.yourdomain.com/privkey.pem;

    # Static Frontend Assets
    root /var/www/ironman-toss-book/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # Cache static CSS, JS, Images
    location ~* \.(css|js|png|jpg|jpeg|svg|ico|woff2)$ {
        expires 1d;
        add_header Cache-Control "public, max-age=86400, stale-while-revalidate=3600";
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
}
```

---

## 5. Database Initialization, Migration & Safety

1. **Idempotent Table Provisioning**:
   The backend automatically verifies that required tables (`users`, `wallets`, `sessions`, `user_preferences`, `admin_audit_logs`) and performance indexes exist via `backend/src/config/initDb.js` on startup.
2. **Safe Migration Rule**:
   Never run `DROP TABLE` or `TRUNCATE` in production. Always test schema additions in a staging environment first.
3. **Admin Provisioning**:
   Root administrator seeding (`backend/src/config/seedAdmin.js`) is idempotent and only creates the account if no administrative role exists. In production, ensure `ADMIN_PASSWORD` is supplied.

---

## 6. Health Monitoring & Observability

The platform exposes standardized endpoints for cloud load balancers and orchestrators:

| Endpoint | Probe Type | Purpose | Expected Status |
| :--- | :--- | :--- | :--- |
| `GET /api/health` | Liveness | Verifies Node.js process is active and responsive. | `200 OK` |
| `GET /api/health/live` | Liveness | Standard Kubernetes / container liveness probe. | `200 OK` |
| `GET /api/health/db` | Readiness | Verifies MySQL connection pool connectivity. | `200 OK` (or `503 Unavailable`) |
| `GET /api/health/ready` | Readiness | Standard Kubernetes / container readiness probe. | `200 OK` (or `503 Unavailable`) |
| `GET /api/admin/system/status` | Diagnostics | Admin-only latency, memory usage, and operational metrics. | `200 OK` (Requires Admin Token) |

---

## 7. Backup & Disaster Recovery Runbook

### Automated Daily Database Backup
```bash
# Backup MySQL database with routines and transactions
mysqldump -u root -p \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  ironman_toss_book > /backups/itb_backup_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip -9 /backups/itb_backup_*.sql
```

### Database Restore Procedure
```bash
# Decompress and restore
gunzip < /backups/itb_backup_20261015_000000.sql.gz | mysql -u root -p ironman_toss_book
```

---

## 8. Rollback Procedures

If an unexpected regression or deployment defect occurs during release:

1. **Application Code Rollback**:
   ```bash
   # Revert to previous Git tag or commit
   git checkout tags/v1.0.0-day18
   npm ci --omit=dev
   pm2 restart ironman-api
   ```
2. **Container Rollback**:
   ```bash
   docker compose down
   docker tag ironman-toss-book:v1.0.0-day18 ironman-toss-book:latest
   docker compose up -d
   ```
3. **Post-Rollback Smoke Test**:
   Execute the automated release validation suite:
   ```bash
   npm run test:day19
   ```
