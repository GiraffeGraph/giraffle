import { HeadlessExecutor } from "@giraffle/headless";
import { installHeadlessBridge, type HeadlessRuntime } from "@/headless/bridge";

jest.mock("@giraffle/headless", () => ({
  HeadlessExecutor: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ id: "shared-page" }),
  })),
}));

describe("desktop headless bridge", () => {
  afterEach(() => {
    delete window.giraffleHeadless;
    jest.clearAllMocks();
  });

  it("runs commands through the same repository queue as the UI", async () => {
    let handler: ((request: { id: string; name: string; input: unknown }) => void) | undefined;
    const respond = jest.fn();
    window.giraffleHeadless = {
      subscribe: jest.fn((next) => { handler = next; return () => undefined; }),
      respond,
    };
    const repository = { snapshot: jest.fn() } as never;
    const run = jest.fn(async (action: (value: never) => Promise<unknown>) => action(repository));
    installHeadlessBridge({ repository: () => repository, unlock: jest.fn(), run: run as HeadlessRuntime["run"] });

    handler?.({ id: "request-1", name: "pages_create", input: { title: "Shared" } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(run).toHaveBeenCalledTimes(1);
    expect(HeadlessExecutor).toHaveBeenCalledWith(repository);
    expect(respond).toHaveBeenCalledWith({ id: "request-1", ok: true, data: { id: "shared-page" } });
  });

  it("unlocks before executing when the shared repository is closed", async () => {
    let handler: ((request: { id: string; name: string; input: unknown; credential?: string }) => void) | undefined;
    const respond = jest.fn();
    window.giraffleHeadless = {
      subscribe: jest.fn((next) => { handler = next; return () => undefined; }),
      respond,
    };
    const repository = { snapshot: jest.fn() } as never;
    let active: typeof repository | null = null;
    const unlock = jest.fn(async () => { active = repository; });
    const run = jest.fn(async (action: (value: never) => Promise<unknown>) => action(repository));
    installHeadlessBridge({ repository: () => active, unlock, run: run as HeadlessRuntime["run"] });

    handler?.({ id: "request-2", name: "pages_search", input: { query: "x" }, credential: "secret" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(unlock).toHaveBeenCalledWith("secret");
    expect(run).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ id: "request-2", ok: true }));
  });
});
