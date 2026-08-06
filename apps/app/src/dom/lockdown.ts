/**
 * Network isolation for the two DOM components.
 *
 * `@expo/dom-webview` exposes no navigation policy hook — its iOS view
 * implements `WKNavigationDelegate` only for process termination and its
 * Android `WebViewClient` overrides no `shouldOverrideUrlLoading` — so the
 * guarantee is enforced from inside the web realm instead, by a script the
 * webview runs at document start, before any bundle code exists.
 *
 * Both halves matter. The Content-Security-Policy is engine-enforced and cannot
 * be undone by page script; the API removal still holds if a platform applies
 * the meta element late. Neither restricts `script-src` or `style-src`, so the
 * DOM bundle itself always loads.
 *
 * Vault content is end-to-end encrypted, and both libraries reach for the
 * network on their own: Excalidraw falls back to a CDN for its fonts and ships
 * calls to `json.excalidraw.com`, `libraries.excalidraw.com` and embed widget
 * scripts. None of those can leave the device.
 */

export interface LockdownOptions {
  /**
   * Development bundles are served over HTTP by Metro and keep a websocket open
   * for fast refresh, so connections are only severed in shipped builds.
   */
  blockNetwork: boolean;
}

export function contentSecurityPolicy(options: LockdownOptions): string {
  return [
    ...(options.blockNetwork ? ["connect-src 'none'"] : []),
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: file:",
    "media-src 'self' data: blob: file:",
    "font-src 'self' data: file:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function domLockdownScript(options: LockdownOptions): string {
  const policy = JSON.stringify(contentSecurityPolicy(options));
  const blockNetwork = options.blockNetwork ? "true" : "false";

  return `(function () {
  var OFFLINE = ${blockNetwork};
  try {
    var meta = document.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy');
    meta.setAttribute('content', ${policy});
    (document.head || document.documentElement).appendChild(meta);
  } catch (error) {}

  if (OFFLINE) {
    var refuse = function (api) {
      return new Error('Giraffle keeps this surface offline: ' + api + ' is unavailable.');
    };
    try {
      Object.defineProperty(window, 'fetch', {
        configurable: false,
        value: function () { return Promise.reject(refuse('fetch')); }
      });
      Object.defineProperty(window, 'XMLHttpRequest', {
        configurable: false,
        value: function () { throw refuse('XMLHttpRequest'); }
      });
      Object.defineProperty(window, 'WebSocket', {
        configurable: false,
        value: function () { throw refuse('WebSocket'); }
      });
      Object.defineProperty(window, 'EventSource', {
        configurable: false,
        value: function () { throw refuse('EventSource'); }
      });
      if (window.navigator) {
        Object.defineProperty(window.navigator, 'sendBeacon', {
          configurable: false,
          value: function () { return false; }
        });
      }
    } catch (error) {}
  }

  try {
    Object.defineProperty(window, 'open', {
      configurable: false,
      value: function () { return null; }
    });
  } catch (error) {}

  // Nothing in either surface may navigate the webview away from the bundle;
  // links are reported to the native screen instead.
  document.addEventListener('click', function (event) {
    var node = event.target;
    while (node && node !== document) {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        var href = node.getAttribute('href') || '';
        if (href.charAt(0) !== '#') event.preventDefault();
        return;
      }
      node = node.parentNode;
    }
  }, true);
})();
true;`;
}
