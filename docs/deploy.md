# Deployment Guide

This is the simplest production deployment flow for Giraffle.

The Docker image is already published by the project maintainers. End users do not need to build or publish anything.

## What this setup uses

- Docker image: `docker.io/efekurucay/giraffle:latest`
- App container: Next.js standalone server
- Database container: PostgreSQL 16
- Optional reverse proxy: nginx

## 1. Prepare the server

Install these on the server:

- Docker
- Docker Compose
- Git

Then clone the repo:

```bash
git clone https://github.com/GiraffeGraph/giraffle.git
cd giraffle
```

## 2. Create the production env file

```bash
cp .env.production.example .env.production
nano .env.production
```

Minimal example:

```env
APP_IMAGE=docker.io/efekurucay/giraffle:latest
APP_PORT=3000

POSTGRES_USER=giraffle
POSTGRES_PASSWORD=change-this-to-a-strong-password
POSTGRES_DB=giraffle

DATABASE_URL=postgresql://giraffle:change-this-to-a-strong-password@postgres:5432/giraffle?connection_limit=3&pool_timeout=10
AUTH_SECRET=replace-this-with-a-long-random-secret
NEXTAUTH_URL=http://YOUR_SERVER_IP_OR_DOMAIN
LOG_LEVEL=info
# Optional but recommended if you want encrypted app-managed settings in Settings.
# APP_ENCRYPTION_KEY=YOUR_LONG_RANDOM_SECRET
NODE_ENV=production
```

Or, recommended for production, use a Docker secret file instead of putting the auth secret directly in `.env.production`:

```bash
mkdir -p secrets
openssl rand -base64 48 > secrets/auth_secret.txt
chmod 600 secrets/auth_secret.txt
```

Then in `.env.production` use:

```env
AUTH_SECRET_FILE=./secrets/auth_secret.txt
```

Important:

- `NEXTAUTH_URL` must match the real public URL.
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must be the same.
- Use either `AUTH_SECRET` or `AUTH_SECRET_FILE`.
- If `AUTH_SECRET_FILE` is set, the prod scripts automatically include `docker-compose.prod.secrets.yml`.
- `APP_ENCRYPTION_KEY` is recommended if you want encrypted app-managed provider settings stored from inside the UI.

## 3. Start the app

Pull the image and start everything:

```bash
./scripts/prod-up.sh
```

If `AUTH_SECRET_FILE` is set, the same command automatically mounts it as a Docker secret.

This starts:

- `postgres`
- `app`

Then check logs:

```bash
./scripts/prod-logs.sh
```

Health endpoints:

- `GET /api/health/live`
- `GET /api/health/ready`

Check running containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

## 4. Open the app

If `APP_PORT=3000`, open:

- `http://YOUR_SERVER_IP:3000`

If you configured a domain, set:

- `NEXTAUTH_URL=http://your-domain.com`

## 5. Optional: run behind nginx

If you want nginx in front of the app:

```bash
./scripts/prod-up-proxy.sh
```

That adds the nginx service from:

- `docker-compose.proxy.yml`

## 6. Updating to a new version

When a new Docker image is published by the project maintainers, the app will also show an in-product update notice on the dashboard and settings screens.

Update the server with:

```bash
cd giraffle
git pull
./scripts/prod-up.sh
```

Because the script does `docker compose pull` first, the latest image is fetched.

## 7. Useful commands

Restart app:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart app
```

Stop everything:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

View logs:

```bash
./scripts/prod-logs.sh
```

## 8. Troubleshooting

### App does not start

Check logs:

```bash
./scripts/prod-logs.sh
```

Common causes:

- wrong `DATABASE_URL`
- missing `AUTH_SECRET`
- wrong `NEXTAUTH_URL`
- `APP_IMAGE` is wrong or points to a tag that does not exist

### Database connection error

Make sure:

- `postgres` service is healthy
- `POSTGRES_PASSWORD` matches `DATABASE_URL`
- the hostname in `DATABASE_URL` is `postgres`

### Image does not update

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull
./scripts/prod-up.sh
```

## 9. External MCP access

External integrations can connect to `/api/mcp` with a token created under
**Settings → MCP Access**. Giraffle does not run an embedded AI or CLI process.
Treat MCP tokens as account credentials and expose the endpoint only over HTTPS.
See [mcp.md](mcp.md).

## 10. Recommended simple production flow

The simplest repeatable flow for users is:

1. SSH into the server
2. Pull the latest code
3. Run `./scripts/prod-up.sh`

Example:

```bash
cd giraffle
git pull
./scripts/prod-up.sh
```
