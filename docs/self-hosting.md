# Self-hosting Giraffle

Giraffle is designed to be deployed as a **published Docker image** first.

That means self-hosters can choose whichever flow fits their stack:

- **Coolify** → deploy from Docker image or compose
- **Dokploy** → deploy from Docker image, compose, or repo
- **CasaOS** → import the image-first compose file
- **Portainer / raw Docker** → use the published image directly
- **Repo-first** → clone and run the included production scripts

## Official Docker image

```text
docker.io/efekurucay/giraffle:latest
```

Immutable releases are also published with tags like:

```text
docker.io/efekurucay/giraffle:v0.1.1
```

## Required environment variables

These are the minimum env vars every install needs:

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

Optional but recommended:

- `APP_IMAGE`
- `APP_PORT`
- `APP_ENCRYPTION_KEY`
- Spotter agent: `GIRAFFLE_AGENT_CMD`, `GIRAFFLE_AGENT_PERMISSION_MODE`, `GIRAFFLE_MCP_BASE_URL` (see [agent.md](agent.md))
- `DEPLOYMENT_ID`
- `APP_UPDATE_REPOSITORY`

## Image-first compose bundle

If your platform can import Docker Compose directly, use:

- `deploy/selfhost/docker-compose.image.yml`
- `deploy/selfhost/.env.image.example`

This is the lightest path for self-hosters who want the published image without cloning the full repo.

## Coolify

Recommended options:

### Option A — Docker image

1. Create a new service from a Docker image
2. Image: `docker.io/efekurucay/giraffle:latest`
3. Add a PostgreSQL service separately
4. Fill the required env vars above
5. Persist `/app/public/uploads`
6. Expose port `3000`

### Option B — Compose stack

Import `deploy/selfhost/docker-compose.image.yml` and provide the env vars in the Coolify UI.

## Dokploy

Dokploy works well with either:

- Docker image deploys
- Compose deploys
- Repo deploys

For the easiest image-based install, import `deploy/selfhost/docker-compose.image.yml`.

## CasaOS

CasaOS users typically want a single compose file that pulls a published image.

Use:

- `deploy/selfhost/docker-compose.image.yml`
- `deploy/selfhost/.env.image.example`

Then map the env vars through the CasaOS app editor.

## Repo-first deployment

If you prefer cloning the repository and using the included scripts:

```bash
git clone https://github.com/GiraffeGraph/giraffle.git
cd giraffle
cp .env.production.example .env.production
./scripts/prod-up.sh
```

See also:

- `docs/deploy.md`
- `README.md`

## AI agent

Giraffle holds no model API key. AI runs through a local CLI agent (Claude Code)
over Giraffle's MCP server; see [agent.md](agent.md). External MCP clients use a
token from **Settings → MCP Access**.

## App-managed settings

Encrypted app-managed settings (upload dir, log level, update repo) are stored in
PostgreSQL and managed from **Settings**. For best results, set:

```env
APP_ENCRYPTION_KEY=your-long-random-secret
```

If omitted, Giraffle falls back to `AUTH_SECRET`.

## Upgrade flow

Image-first users can usually update by:

1. changing the image tag to a newer release, or
2. pulling `latest` again and recreating the app container

Repo-first users can continue using:

```bash
cd giraffle
git pull
./scripts/prod-up.sh
```
