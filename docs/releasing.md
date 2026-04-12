# Releasing Giraffle

This project uses a simple release standard so self-hosted users can rely on stable updates and the in-app update center.

## Release standard

### Branches

- `main` is the integration branch.
- Every push to `main` runs CI and publishes the rolling Docker image tags:
  - `docker.io/efekurucay/giraffle:latest`
  - `docker.io/efekurucay/giraffle:sha-<shortsha>`

### Versioned releases

A real public release is created by pushing a Git tag in this format:

```bash
vMAJOR.MINOR.PATCH
```

Examples:

- `v0.1.0`
- `v0.1.1`
- `v1.0.0`

When a `v*` tag is pushed:

1. CI runs quality + smoke gates
2. the Docker image is published with the immutable tag (for example `v0.1.1`)
3. a GitHub Release is created automatically from that tag
4. the in-app update center starts showing the new version to users

## Source of truth

`package.json` version and the git tag must match.

Example:

- `package.json` → `0.1.1`
- git tag → `v0.1.1`

CI rejects tag builds if they do not match.

## Maintainer release flow

### 1. Finish work on `main`

Make sure these pass locally:

```bash
npm run verify
```

### 2. Bump the package version

Update `package.json` version to the next release number.

Example:

```json
{
  "version": "0.1.1"
}
```

Commit it:

```bash
git add package.json package-lock.json
git commit -m "chore: release 0.1.1"
```

### 3. Push `main`

```bash
git push origin main
```

This updates the rolling `latest` image after CI passes.

### 4. Create the release tag

```bash
git tag v0.1.1
git push origin v0.1.1
```

That is the release moment.

### 5. Let GitHub Actions finish

The workflow will:

- verify the tag matches `package.json`
- publish the versioned Docker image
- create the GitHub Release automatically

## What users see

End users do not need to understand the CI details.
They only need:

- the stable image tag they already use, usually `latest`
- the in-app update notice from GitHub Releases
- the recommended update command:

```bash
cd giraffle
git pull
./scripts/prod-up.sh
```

## Notes for forks

By default, the in-app update center checks:

```text
GiraffeGraph/giraffle
```

If you maintain a fork and want update checks to point to your own releases, set:

```env
APP_UPDATE_REPOSITORY=your-org/your-fork
```
