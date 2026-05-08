import { getAppRuntimeEnv } from "@/lib/env.server";
import { getAppSetting } from "@/domain/app-settings/app-settings.service";
import type { AppUpdateStatus } from "./update.types";

const DEFAULT_GITHUB_REPOSITORY = "GiraffeGraph/giraffle";
const DEFAULT_UPDATE_COMMAND = [
  "cd giraffle",
  "git pull",
  "./scripts/prod-up.sh",
].join("\n");

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, "").split("-")[0] ?? "0.0.0";
}

function parseVersionParts(version: string) {
  return normalizeVersion(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const app = getAppRuntimeEnv();
  const repository =
    (await getAppSetting("APP_UPDATE_REPOSITORY")) || DEFAULT_GITHUB_REPOSITORY;
  const checkedAt = new Date().toISOString();

  const baseStatus: AppUpdateStatus = {
    currentVersion: app.version,
    latestVersion: null,
    updateAvailable: false,
    checkedAt,
    source: "github-releases",
    releaseName: null,
    releaseUrl: `https://github.com/${repository}/releases`,
    publishedAt: null,
    releaseNotes: null,
    updateCommand: DEFAULT_UPDATE_COMMAND,
    error: null,
  };

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "giraffle-update-checker",
        },
        next: {
          revalidate: 60 * 60,
        },
      }
    );

    if (!response.ok) {
      return {
        ...baseStatus,
        error: `GitHub release check failed with status ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
      body?: string;
    };

    const latestVersion = payload.tag_name ? normalizeVersion(payload.tag_name) : null;

    if (!latestVersion) {
      return {
        ...baseStatus,
        error: "Latest release payload did not include a tag name.",
      };
    }

    return {
      ...baseStatus,
      latestVersion,
      updateAvailable: compareVersions(app.version, latestVersion) < 0,
      releaseName: payload.name?.trim() || payload.tag_name || latestVersion,
      releaseUrl: payload.html_url?.trim() || baseStatus.releaseUrl,
      publishedAt: payload.published_at ?? null,
      releaseNotes: payload.body?.trim() || null,
    };
  } catch (error) {
    return {
      ...baseStatus,
      error: error instanceof Error ? error.message : "Unknown update check error",
    };
  }
}
