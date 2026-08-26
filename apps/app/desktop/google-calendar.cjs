const crypto = require("node:crypto");
const http = require("node:http");
const { mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");

const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_ORIGIN = "https://www.googleapis.com";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
const CONNECT_TIMEOUT_MS = 2 * 60 * 1000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isGoogleClientId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value);
}

function parseDesktopCredentials(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The selected file is not valid Google OAuth JSON");
  }
  const installed = value?.installed;
  if (!isGoogleClientId(installed?.client_id) || typeof installed?.client_secret !== "string" || !installed.client_secret) {
    throw new Error("Choose OAuth credentials created as a Desktop app");
  }
  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}

function isAllowedCalendarPath(value) {
  if (typeof value !== "string") return false;
  return /^\/calendar\/v3\/calendars\/primary\/events(?:\/[A-Za-z0-9_-]+)?(?:\?[A-Za-z0-9%&=+_.~-]*)?$/.test(value);
}

function encodeForm(values) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) body.set(key, value);
  }
  return body;
}

function callbackPage(ok) {
  const title = ok ? "Google authorization received" : "Google Calendar connection stopped";
  const body = ok ? "Return to Giraffle to finish connecting." : "You can close this window and return to Giraffle.";
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui;background:#191919;color:#f4f1ea;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem}h1{font-size:1.35rem}</style><main><h1>${title}</h1><p>${body}</p></main>`;
}

function createGoogleCalendarIntegration({ userData, safeStorage, openExternal, fetchFn = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const storageDirectory = path.join(userData, "integrations");
  const tokenPath = path.join(storageDirectory, "google-calendar-token");
  let access = null;
  let connecting = null;

  async function loadGrant() {
    try {
      const encrypted = await readFile(tokenPath);
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure macOS storage is unavailable");
      const parsed = JSON.parse(safeStorage.decryptString(encrypted));
      if (!isGoogleClientId(parsed.clientId) || typeof parsed.clientSecret !== "string" || !parsed.clientSecret) return null;
      return {
        clientId: parsed.clientId,
        clientSecret: parsed.clientSecret,
        ...(typeof parsed.refreshToken === "string" && parsed.refreshToken ? { refreshToken: parsed.refreshToken } : {}),
      };
    } catch (cause) {
      if (cause?.code === "ENOENT") return null;
      if (cause instanceof SyntaxError) return null;
      throw cause;
    }
  }

  async function saveGrant(grant) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure macOS storage is unavailable");
    await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
    const encrypted = safeStorage.encryptString(JSON.stringify(grant));
    await writeFile(tokenPath, encrypted, { mode: 0o600 });
  }

  const timedFetch = (url, options, timeoutMs = 20_000) => fetchFn(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });

  async function tokenRequest(fields) {
    const response = await timedFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeForm(fields),
    }, 30_000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.access_token !== "string") {
      const detail = typeof payload.error_description === "string" ? payload.error_description : "Google authorization failed";
      throw new Error(detail);
    }
    return payload;
  }

  async function refreshAccess(grant) {
    if (!grant.refreshToken) throw new Error("Connect Google Calendar first");
    const payload = await tokenRequest({
      client_id: grant.clientId,
      client_secret: grant.clientSecret,
      refresh_token: grant.refreshToken,
      grant_type: "refresh_token",
    });
    access = {
      clientId: grant.clientId,
      token: payload.access_token,
      expiresAt: Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000,
    };
    return access.token;
  }

  async function accessToken(force = false) {
    const grant = await loadGrant();
    if (!grant?.refreshToken) throw new Error("Connect Google Calendar first");
    if (!force && access?.clientId === grant.clientId && access.expiresAt > Date.now() + 60_000) return access.token;
    return refreshAccess(grant);
  }

  async function receiveAuthorization(clientId) {
    const verifier = crypto.randomBytes(64).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = crypto.randomBytes(24).toString("base64url");
    let server;
    let timeout;

    const result = new Promise((resolve, reject) => {
      server = http.createServer((request, response) => {
        const callback = new URL(request.url ?? "/", "http://127.0.0.1");
        const returnedState = callback.searchParams.get("state");
        const code = callback.searchParams.get("code");
        const error = callback.searchParams.get("error");
        const ok = returnedState === state && typeof code === "string" && code.length > 0;
        response.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(callbackPage(ok));
        if (returnedState !== state) reject(new Error("Google returned an invalid OAuth state"));
        else if (error) reject(new Error(error === "access_denied" ? "Google Calendar access was not granted" : `Google authorization failed: ${error}`));
        else if (!code) reject(new Error("Google did not return an authorization code"));
        else resolve(code);
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not start the secure Google callback"));
          return;
        }
        const redirectUri = `http://127.0.0.1:${address.port}`;
        const authorization = new URL(AUTHORIZATION_URL);
        authorization.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: CALENDAR_SCOPE,
          access_type: "offline",
          prompt: "consent",
          code_challenge: challenge,
          code_challenge_method: "S256",
          state,
        }).toString();
        void openExternal(authorization.toString()).catch(reject);
        timeout = setTimeout(() => reject(new Error("Google Calendar connection timed out")), CONNECT_TIMEOUT_MS);
      });
      server.on("error", reject);
    });

    try {
      const code = await result;
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Google callback closed unexpectedly");
      return { code, verifier, redirectUri: `http://127.0.0.1:${address.port}` };
    } finally {
      if (timeout) clearTimeout(timeout);
      server?.close();
    }
  }

  async function configureCredentialJson(source) {
    const credentials = parseDesktopCredentials(source);
    access = null;
    await saveGrant(credentials);
    return { supported: true, configured: true, connected: false };
  }

  async function connect() {
    if (connecting) return connecting;
    connecting = (async () => {
      const grant = await loadGrant();
      if (!grant) throw new Error("Import Google Desktop OAuth credentials first");
      const authorization = await receiveAuthorization(grant.clientId);
      const payload = await tokenRequest({
        client_id: grant.clientId,
        client_secret: grant.clientSecret,
        code: authorization.code,
        code_verifier: authorization.verifier,
        grant_type: "authorization_code",
        redirect_uri: authorization.redirectUri,
      });
      if (typeof payload.refresh_token !== "string" || !payload.refresh_token) {
        throw new Error("Google did not issue offline access; disconnect Giraffle in your Google Account and try again");
      }
      await saveGrant({ ...grant, refreshToken: payload.refresh_token });
      access = {
        clientId: grant.clientId,
        token: payload.access_token,
        expiresAt: Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000,
      };
      return { connected: true };
    })();
    try {
      return await connecting;
    } finally {
      connecting = null;
    }
  }

  async function disconnect() {
    const grant = await loadGrant().catch(() => null);
    access = null;
    if (grant) await saveGrant({ clientId: grant.clientId, clientSecret: grant.clientSecret });
    else await rm(tokenPath, { force: true });
    if (grant?.refreshToken) {
      await fetchFn(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(grant.refreshToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => undefined);
    }
    return { connected: false };
  }

  async function status() {
    const grant = await loadGrant();
    return { supported: true, configured: Boolean(grant), connected: Boolean(grant?.refreshToken) };
  }

  async function request(input) {
    const method = input?.method;
    const apiPath = input?.path;
    if (!new Set(["GET", "POST", "PATCH", "DELETE"]).has(method) || !isAllowedCalendarPath(apiPath)) {
      throw new Error("Invalid Google Calendar request");
    }

    let token = await accessToken();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response;
      try {
        response = await timedFetch(`${CALENDAR_API_ORIGIN}${apiPath}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(input.etag ? { "If-Match": input.etag } : {}),
            ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        });
      } catch (cause) {
        if (attempt < 3) {
          await sleep(250 * (2 ** attempt));
          continue;
        }
        throw new Error(`Could not reach Google Calendar: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (response.status === 401 && attempt === 0) {
        token = await accessToken(true);
        continue;
      }
      const reason = data?.error?.errors?.[0]?.reason;
      const retryable = RETRYABLE_STATUS.has(response.status) || (response.status === 403 && ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason));
      if (retryable && attempt < 3) {
        await sleep(250 * (2 ** attempt) + crypto.randomInt(0, 150));
        continue;
      }
      return { ok: response.ok, status: response.status, data };
    }
    throw new Error("Google Calendar request failed after retrying");
  }

  return { configureCredentialJson, connect, disconnect, request, status };
}

module.exports = { createGoogleCalendarIntegration, isAllowedCalendarPath, isGoogleClientId, parseDesktopCredentials };
