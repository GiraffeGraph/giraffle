# Server Agent Handoff Prompt

Use the prompt below with a server-side agent that has shell access to the target machine.

```text
You are deploying Giraffle to this server.

Important constraints:
- Do NOT build or publish a Docker image.
- The app image is already published and must be pulled from Docker Hub.
- Use this image: docker.io/efekurucay/giraffle:latest
- Prefer the simplest deployment path first.
- If no domain is configured, deploy using the server IP and expose the app on port 3000.
- Only use nginx/reverse proxy if needed or explicitly requested.

Repository:
- https://github.com/GiraffeGraph/giraffle.git

Deployment shape:
- app image: docker.io/efekurucay/giraffle:latest
- database: PostgreSQL via docker compose
- start command: ./scripts/prod-up.sh
- logs command: ./scripts/prod-logs.sh

Your task:
1. Inspect the server and install missing prerequisites:
   - git
   - docker
   - docker compose plugin
2. Clone the repo to a sensible location if it is not already present.
3. Create `.env.production` from `.env.production.example`.
4. Fill `.env.production` with working production values.
5. Start the stack with `./scripts/prod-up.sh`.
6. Verify the containers are healthy.
7. Verify the app responds on `/api/health`.
8. Return a concise deployment summary.

Use these environment settings unless the machine/domain requires a different public URL:
- APP_IMAGE=docker.io/efekurucay/giraffle:latest
- APP_PORT=3000
- POSTGRES_USER=giraffle
- POSTGRES_DB=giraffle
- POSTGRES_PASSWORD=<generate a strong random password>
- AUTH_SECRET=<generate a long random secret>
- NODE_ENV=production
- NEXTAUTH_URL=http://<SERVER_IP_OR_DOMAIN>
- DATABASE_URL=postgresql://giraffle:<POSTGRES_PASSWORD>@postgres:5432/giraffle?connection_limit=3&pool_timeout=10

Detailed instructions:
- If Docker is not installed, install Docker Engine and the Docker Compose plugin.
- If the repo already exists, use it and run `git pull`.
- If it does not exist, clone it:
  `git clone https://github.com/GiraffeGraph/giraffle.git`
- Enter the repo directory.
- Create the env file:
  `cp .env.production.example .env.production`
- Generate secure values for `POSTGRES_PASSWORD` and `AUTH_SECRET`.
- Detect the public server IP if no domain is supplied and set `NEXTAUTH_URL=http://<that-ip>:3000` unless a reverse proxy on port 80/443 is configured.
- Start deployment:
  `./scripts/prod-up.sh`
- Inspect status:
  `docker compose --env-file .env.production -f docker-compose.prod.yml ps`
- Inspect logs if needed:
  `./scripts/prod-logs.sh`
- Verify health:
  `curl -fsS http://127.0.0.1:3000/api/health`

Success criteria:
- `postgres` container is healthy
- `app` container is healthy
- `curl http://127.0.0.1:3000/api/health` succeeds
- The app is reachable at the final public URL

At the end, report:
- repo path
- final public URL
- whether nginx/reverse proxy was used
- whether containers are healthy
- any manual follow-up needed

If something fails:
- inspect docker compose status
- inspect container logs
- fix the issue
- retry until the app is healthy

Do not stop after writing files; complete the deployment and verify it.
```
