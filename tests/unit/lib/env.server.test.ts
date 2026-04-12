import { describe, expect, it } from "vitest";
import {
  getAiRuntimeEnv,
  getAppRuntimeEnv,
  getAuthRuntimeEnv,
  getDatabaseRuntimeEnv,
  validateStartupEnv,
} from "@/lib/env.server";

describe("env.server", () => {
  it("provides sensible development defaults", () => {
    const app = getAppRuntimeEnv({ NODE_ENV: "development" });
    const auth = getAuthRuntimeEnv({ NODE_ENV: "development" });

    expect(app.isDevelopment).toBe(true);
    expect(app.logLevel).toBe("debug");
    expect(auth.nextAuthUrl).toBe("http://localhost:3000");
    expect(auth.disableSecureCookies).toBe(false);
  });

  it("requires DATABASE_URL when database config is requested", () => {
    expect(() => getDatabaseRuntimeEnv({})).toThrowError("DATABASE_URL is required");
  });

  it("fails startup validation when production auth configuration is incomplete", () => {
    expect(() =>
      validateStartupEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://db.example.test:5432/giraffle",
      })
    ).toThrowError(/AUTH_SECRET/);
  });

  it("parses feature flags and warnings for optional services", () => {
    const result = validateStartupEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db.example.test:5432/giraffle",
      AUTH_SECRET: "super-secret-value",
      NEXTAUTH_URL: "https://notes.example.com",
      LOG_LEVEL: "warn",
    });

    expect(result.app.logLevel).toBe("warn");
    expect(result.auth.secret).toBe("super-secret-value");
    expect(getAiRuntimeEnv({ OPENAI_API_KEY: "key-123" }).enabled).toBe(true);
    expect(result.warnings).toEqual([
      "OPENAI_API_KEY is not configured. AI routes will return 503.",
      "FEED_REFRESH_SECRET is not configured. Feed refresh endpoint will return 503.",
    ]);
  });
});
