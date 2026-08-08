// The browser caches only the app shell. Electron already bundles it and its
// custom protocol does not implement Cache Storage, so registration is skipped
// in the desktop host.
if ("serviceWorker" in navigator && !navigator.userAgent.includes("Electron")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").catch(function () {
      // A blocked or unsupported worker only costs offline start-up.
    });
  });
}
