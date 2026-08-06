import { runInNewContext } from "node:vm";
import { contentSecurityPolicy, domLockdownScript } from "@/dom/lockdown";

interface FakeElement {
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

interface Realm {
  window: Record<string, unknown> & { navigator: Record<string, unknown> };
  appended: FakeElement[];
  clicks: ((event: { target: unknown; defaultPrevented: boolean }) => void)[];
  captured: boolean[];
}

/**
 * Runs the document-start script the way a webview would: against a bare realm,
 * before anything else exists.
 */
function lockRealm(blockNetwork: boolean): Realm {
  const appended: FakeElement[] = [];
  const clicks: Realm["clicks"] = [];
  const captured: boolean[] = [];

  const documentStub = {
    head: { appendChild: (node: FakeElement) => appended.push(node) },
    documentElement: {},
    createElement: (): FakeElement => {
      const attributes: Record<string, string> = {};
      return {
        attributes,
        setAttribute(name: string, value: string) {
          attributes[name] = value;
        },
      };
    },
    addEventListener: (_type: string, handler: Realm["clicks"][number], capture: boolean) => {
      clicks.push(handler);
      captured.push(capture);
    },
  };

  const window = { navigator: {} } as Realm["window"];
  runInNewContext(domLockdownScript({ blockNetwork }), { window, document: documentStub });

  return { window, appended, clicks, captured };
}

function anchorEvent(href: string) {
  let defaultPrevented = false;
  const anchor = {
    tagName: "A",
    hasAttribute: (name: string) => name === "href",
    getAttribute: () => href,
    parentNode: null,
  };
  return {
    event: {
      target: anchor,
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault: () => {
        defaultPrevented = true;
      },
    },
    prevented: () => defaultPrevented,
  };
}

describe("content security policy", () => {
  test("a shipped build may open no connection at all", () => {
    expect(contentSecurityPolicy({ blockNetwork: true })).toContain("connect-src 'none'");
  });

  test("a development build keeps the Metro socket, and nothing else", () => {
    const policy = contentSecurityPolicy({ blockNetwork: false });

    expect(policy).not.toContain("connect-src");
    expect(policy).toContain("frame-src 'none'");
  });

  test("closes the realms a page could escape into either way", () => {
    for (const blockNetwork of [true, false]) {
      const policy = contentSecurityPolicy({ blockNetwork });

      expect(policy).toContain("frame-src 'none'");
      expect(policy).toContain("child-src 'none'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'none'");
      expect(policy).toContain("form-action 'none'");
    }
  });

  test("leaves the bundle's own scripts and styles alone", () => {
    const policy = contentSecurityPolicy({ blockNetwork: true });

    expect(policy).not.toContain("script-src");
    expect(policy).not.toContain("style-src");
    expect(policy).not.toContain("default-src");
  });

  test("subresources may only come from the bundle or an inline payload", () => {
    const policy = contentSecurityPolicy({ blockNetwork: true });

    expect(policy).toContain("img-src 'self' data: blob: file:");
    expect(policy).toContain("font-src 'self' data: file:");
  });
});

describe("document-start lockdown", () => {
  test("installs the policy before the page can parse anything", () => {
    const realm = lockRealm(true);
    const meta = realm.appended[0];

    expect(meta?.attributes["http-equiv"]).toBe("Content-Security-Policy");
    expect(meta?.attributes.content).toBe(contentSecurityPolicy({ blockNetwork: true }));
  });

  test("a shipped build has no way to reach the network", async () => {
    const { window } = lockRealm(true);

    await expect((window.fetch as () => Promise<unknown>)()).rejects.toThrow(/offline/i);
    expect(() => new (window.XMLHttpRequest as new () => unknown)()).toThrow(/offline/i);
    expect(() => new (window.WebSocket as new () => unknown)()).toThrow(/offline/i);
    expect(() => new (window.EventSource as new () => unknown)()).toThrow(/offline/i);
    expect((window.navigator.sendBeacon as () => boolean)()).toBe(false);
  });

  test("the page cannot hand itself the network back", () => {
    const { window } = lockRealm(true);

    const installed = window.fetch;

    expect(() =>
      Object.defineProperty(window, "fetch", { value: () => Promise.resolve("leaked") }),
    ).toThrow();
    // A sloppy-mode assignment fails silently rather than throwing; what matters
    // is that it cannot land.
    (window as unknown as { fetch: unknown }).fetch = () => Promise.resolve("leaked");
    expect(window.fetch).toBe(installed);
  });

  test("a development build keeps Metro's own transport", () => {
    const { window } = lockRealm(false);

    expect(window.fetch).toBeUndefined();
    expect(window.XMLHttpRequest).toBeUndefined();
    expect(window.WebSocket).toBeUndefined();
  });

  test("neither build may open a second window", () => {
    for (const blockNetwork of [true, false]) {
      const { window } = lockRealm(blockNetwork);
      expect((window.open as () => unknown)()).toBeNull();
    }
  });

  test("link clicks are intercepted in the capture phase, before the page sees them", () => {
    const realm = lockRealm(true);

    expect(realm.captured).toEqual([true]);
    expect(realm.clicks).toHaveLength(1);
  });

  test("a link never navigates the webview away from the bundle", () => {
    const realm = lockRealm(true);
    const outbound = anchorEvent("https://example.com/leak");

    realm.clicks[0]?.(outbound.event as never);
    expect(outbound.prevented()).toBe(true);
  });

  test("an in-page anchor still jumps", () => {
    const realm = lockRealm(true);
    const fragment = anchorEvent("#section");

    realm.clicks[0]?.(fragment.event as never);
    expect(fragment.prevented()).toBe(false);
  });
});
