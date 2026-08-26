const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedCalendarPath, isGoogleClientId, parseDesktopCredentials } = require("./google-calendar.cjs");

test("accepts Google OAuth desktop client IDs only", () => {
  assert.equal(isGoogleClientId("123-example.apps.googleusercontent.com"), true);
  assert.equal(isGoogleClientId(""), false);
  assert.equal(isGoogleClientId("https://example.com"), false);
});

test("accepts only downloaded Desktop app credential JSON", () => {
  assert.deepEqual(parseDesktopCredentials(JSON.stringify({ installed: {
    client_id: "123-example.apps.googleusercontent.com",
    client_secret: "desktop-secret",
  } })), {
    clientId: "123-example.apps.googleusercontent.com",
    clientSecret: "desktop-secret",
  });
  assert.throws(() => parseDesktopCredentials(JSON.stringify({ web: {
    client_id: "123-example.apps.googleusercontent.com",
    client_secret: "web-secret",
  } })), /Desktop app/);
});

test("limits the desktop bridge to primary-calendar event requests", () => {
  assert.equal(isAllowedCalendarPath("/calendar/v3/calendars/primary/events?singleEvents=true&showDeleted=true"), true);
  assert.equal(isAllowedCalendarPath("/calendar/v3/calendars/primary/events/event_123"), true);
  assert.equal(isAllowedCalendarPath("/calendar/v3/users/me/calendarList"), false);
  assert.equal(isAllowedCalendarPath("/calendar/v3/calendars/primary/events/../../drive/v3/files"), false);
  assert.equal(isAllowedCalendarPath("https://evil.example/calendar/v3/calendars/primary/events"), false);
});
