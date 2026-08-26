export interface GoogleCalendarStatus {
  supported: boolean;
  configured: boolean;
  connected: boolean;
}

export interface GoogleCalendarRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  etag?: string;
}

export interface GoogleCalendarResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
}

interface DesktopGoogleCalendarApi {
  status(): Promise<GoogleCalendarStatus>;
  configure(): Promise<{ canceled: boolean; status: GoogleCalendarStatus }>;
  connect(): Promise<{ connected: boolean }>;
  disconnect(): Promise<{ connected: boolean }>;
  request<T>(request: GoogleCalendarRequest): Promise<GoogleCalendarResponse<T>>;
}

declare global {
  interface Window {
    giraffleGoogleCalendar?: DesktopGoogleCalendarApi;
  }
}

function desktopApi(): DesktopGoogleCalendarApi | null {
  return typeof window === "undefined" ? null : window.giraffleGoogleCalendar ?? null;
}

export async function googleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const api = desktopApi();
  if (!api) return { supported: false, configured: false, connected: false };
  return api.status();
}

export async function chooseGoogleCalendarCredentials(): Promise<GoogleCalendarStatus | null> {
  const api = desktopApi();
  if (!api) throw new Error("Google Calendar connection is currently available in the macOS app");
  const result = await api.configure();
  return result.canceled ? null : result.status;
}

export async function connectGoogleCalendar(): Promise<void> {
  const api = desktopApi();
  if (!api) throw new Error("Google Calendar connection is currently available in the macOS app");
  await api.connect();
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const api = desktopApi();
  if (!api) return;
  await api.disconnect();
}

export async function googleCalendarRequest<T>(request: GoogleCalendarRequest): Promise<GoogleCalendarResponse<T>> {
  const api = desktopApi();
  if (!api) throw new Error("Google Calendar connection is currently available in the macOS app");
  return api.request<T>(request);
}
