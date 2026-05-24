# ClearPath SaaS Platform: Production Deployment Handbook

This guide outlines deployment procedures for the ClearPath Customs SaaS platform. Follow these steps to set up secure, high-performant, containerized instances of the API engine and SPA frontend.

---

## 📋 Prerequisites

Before initiating a deployment, ensure the target server environment has:
1. **Operating System**: Linux (Ubuntu 22.04 LTS or newer recommended)
2. **Docker Engine**: Installed and running (v24.0.0+)
3. **Docker Compose**: Installed (v2.20.0+)
4. **Network Access**: HTTP (80/443) and API (3000) firewall rule pathways cleared
5. **Database**: Managed PostgreSQL v16 server (or containerized instance via compose)

---

## 🔒 Environment Secrets Checklist

Create a local production environment configuration file `.env` at the root path of the project. Protect the secrets values in safe secret holders (e.g. HashiCorp Vault, AWS Secrets Manager).

| Variable Name | Required | Default / Format | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enables performance optimizations across Node frameworks |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/db` | Production Postgres database connection string |
| `JWT_SECRET` | Yes | Long random character string | High-entropy key used to securely sign broker login sessions |
| `PORT` | No | `3000` | Port on which the express application listens |
| `POSTGRES_USER` | No | `clearpath_admin` | Postgres system administrator user (Local Dev Stack Only) |
| `POSTGRES_PASSWORD` | No | Random strong hash | Postgres system admin password (Local Dev Stack Only) |
| `POSTGRES_DB` | No | `clearpath_db` | Core application database name (Local Dev Stack Only) |
| `PGADMIN_EMAIL` | No | `admin@clearpath.com` | pgAdmin dashboard administrative login email (Optional) |
| `PGADMIN_PASSWORD` | No | Strong password string | pgAdmin dashboard security password (Optional) |

---

## 🚀 Greenfield (First-Deploy) System Booting

Follow this linear checklist for pristine deployment installations on new servers:

### 1. Clones and Setup
Securely fetch current production branch outputs directly onto the clean instance layout:
```bash
git clone git@github.com:clearpath-cargo/clearpath-saas.git /opt/clearpath-saas
cd /opt/clearpath-saas
```

### 2. Form Secrets Configuration
Copy the template credentials file to establish local variables:
```bash
cp .env.example .env
nano .env # Assign your strong database credentials and JWT hashes
```

### 3. Service Compilation
Execute Docker Compose compilations cleanly to bootstrap core elements:
```bash
# Compile and build both Frontend React and Backend Express Docker images in isolated networks
docker compose build --no-cache
```

### 4. Background Server Boot
Spin up database service cells, reverse proxies, and core nodes:
```bash
docker compose up -d
```

### 5. Confirm Operations
Query operational system check endpoints to verify pristine server status:
```bash
curl -f http://localhost:3000/health
```

---

## 🗄️ Database Schema Migrations Execution

The migration manager uses the schema table `schema_migrations` to ensure execution safety. Migrations are strictly transaction-safe and safe to execute repeatedly.

### Run Migrations Inside the Live API Container
Execute this Command from the host machine to register all newly added `.sql` schemas:
```bash
docker compose exec -T clearpath-api node src/migrations/run.js
```

### Adding New Migrations during Development
1. Create a plain-text SQL script inside `src/migrations/sql/`.
2. Prefix it with an incremental 3-digit number (e.g., `002_add_demurrage_indices.sql`).
3. Commitment of this script to the main branch triggers the automatic GitHub Action, deploying it immediately to production during the next push cycle.

---

## 🔄 Disaster Recovery and Rollbacks

If a bad build gets released, execute this recovery chain immediately to restore your last healthy configuration:

### Part A: Rollback Code and Container State
1. Identify the secure Git SHA reference from your previous stable deployment:
```bash
git log --oneline
```
2. Reset the local server workspace directory back to that healthy deployment commit tag:
```bash
git checkout <PREVIOUS_HEALTHY_COMMIT_SHA>
```
3. Re-pull or build previous images and restart physical services:
```bash
# For local building:
docker compose up -d --build --force-recreate

# Or for pulling registered containers matching the precise Stable SHA:
docker compose pull
docker compose up -d --no-build
```

### Part B: Database Schema Actions (If Required)
If the broken deployment contained destructive database table changes, restore historical status:
1. Restore database snapshot state if structural damage occurred:
```bash
pg_restore -h localhost -U clearpath_admin -d clearpath_db < /var/backups/daily_snapshot.dump
```
2. Manually reconcile the migration registry records in `schema_migrations` to represent correct state:
```sql
DELETE FROM schema_migrations WHERE migration_name = '002_bad_migration.sql';
```
