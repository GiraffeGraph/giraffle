export interface AppUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  source: "github-releases";
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  releaseNotes: string | null;
  updateCommand: string;
  error: string | null;
}
