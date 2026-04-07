# Deployment Guide

This is the simplest production deployment flow for Giraffle.

## What this setup uses

- Docker image: `docker.io/efekurucay/giraffle:latest`
- App container: Next.js standalone server
- Database container: PostgreSQL 16
- Optional reverse proxy: nginx

## 1. Publish the Docker image

If the image is not already on Docker Hub, publish it from your local machine:

```bash
docker login -u efekurucay

docker buildx build \
  --platform linux/amd64 \
  -t docker.io/efekurucay/giraffle:latest \
  --push .
```

If you also want GitHub Actions to publish automatically:

1. Add these GitHub Actions secrets:
   - `DOCKERHUB_USERNAME=efekurucay`
   - `DOCKERHUB_TOKEN=<your-docker-hub-token>`
2. Push to `main`, or run the workflow manually.

Workflow file:

- `.github/workflows/docker-publish.yml`

## 2. Prepare the server

Install these on the server:

- Docker
- Docker Compose
- Git

Then clone the repo:

```bash
git clone https://github.com/GiraffeGraph/giraffle.git
cd giraffle
```

## 3. Create the production env file

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
NODE_ENV=production
```

Important:

- `NEXTAUTH_URL` must match the real public URL.
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must be the same.
- `AUTH_SECRET` should be long and random.

## 4. Start the app

Pull the image and start everything:

```bash
./scripts/prod-up.sh
```

This starts:

- `postgres`
- `app`

Then check logs:

```bash
./scripts/prod-logs.sh
```

Check running containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

## 5. Open the app

If `APP_PORT=3000`, open:

- `http://YOUR_SERVER_IP:3000`

If you configured a domain, set:

- `NEXTAUTH_URL=http://your-domain.com`

## 6. Optional: run behind nginx

If you want nginx in front of the app:

```bash
./scripts/prod-up-proxy.sh
```

That adds the nginx service from:

- `docker-compose.proxy.yml`

## 7. Updating to a new version

### If you publish a new Docker image

On the server:

```bash
./scripts/prod-up.sh
```

Because the script does `docker compose pull` first, the latest image is fetched.

### If you build directly on the server

Use:

```bash
./scripts/prod-build-up.sh
```

## 8. Useful commands

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

## 9. Troubleshooting

### App does not start

Check logs:

```bash
./scripts/prod-logs.sh
```

Common causes:

- wrong `DATABASE_URL`
- missing `AUTH_SECRET`
- wrong `NEXTAUTH_URL`
- Docker image was not pushed yet

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

## 10. Recommended simple production flow

The simplest repeatable flow is:

1. Build and push image to Docker Hub
2. SSH into server
3. Pull latest code
4. Run `./scripts/prod-up.sh`

Example:

```bash
# local
docker buildx build \
  --platform linux/amd64 \
  -t docker.io/efekurucay/giraffle:latest \
  --push .

# server
cd giraffle
git pull
./scripts/prod-up.sh
```
